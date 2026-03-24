/**
 * api-brand-analyze-posts
 * Analiza lotes de posts con OpenAI y guarda resultados en brand_content_analysis,
 * brand_narrative_pillars y brand_audience_heatmap.
 *
 * Principio de memoria contextual:
 *   - Solo analiza posts que NO tienen entrada en brand_content_analysis
 *   - Carga el brand_rules del contenedor para medir coherencia de tono
 *   - Una llamada a OpenAI por lote (hasta 10 posts) → muy económico
 *   - El dashboard jamás llama a OpenAI directamente; lee la caché
 *
 * POST /api/brand/analyze-posts
 * Body: { brand_container_id, limit? }   (limit default 10, max 20)
 * Auth: Bearer <supabase-session-token>
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');

// ── OpenAI helper ─────────────────────────────────────────────────────────────

async function openAIChat(messages, model = 'gpt-4o-mini') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, response_format: { type: 'json_object' } })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI HTTP ${res.status}`);
  const content = json.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

// ── Análisis batch ────────────────────────────────────────────────────────────

async function analyzeBatch(posts, brandRules) {
  const rulesText = brandRules.map(r => `- ${r.rule_type}: ${JSON.stringify(r.rule_value)}`).join('\n') || 'Sin reglas definidas';

  const postsForPrompt = posts.map((p, i) => ({
    index: i,
    post_id: p.id,
    content: (p.content || '').slice(0, 500),
    likes: p.metrics?.likes || 0,
    comments: p.metrics?.comments || 0,
    shares: p.metrics?.shares || 0,
    media_type: p.media_assets?.[0]?.type || 'text',
    posted_at: p.captured_at
  }));

  const systemPrompt = `Eres un analista de marca experto. Analizas contenido de redes sociales y devuelves un JSON estructurado.
Reglas de voz de la marca:
${rulesText}

Para cada post analiza:
- tone_detected: uno de [emocional, técnico, urgente, inspirador, informativo, promocional, humorístico]
- tone_coherence_score: 0-100 (qué tan coherente es con las reglas de la marca)
- dominant_emotion: uno de [alegría, confianza, sorpresa, ironía, ira, confusión, neutral]
- narrative_pillar: uno de [producto, comunidad, valores, oferta, educación, entretenimiento, lifestyle]
- clarity_score: 0-100 (qué tan claro es el mensaje para el consumidor)
- fatigue_risk: true si el post es muy similar a los anteriores o tiene engagement bajo vs promedio del conjunto
- why_it_worked: objeto con {hook, first_sentence_quality (0-100), visual_cue, cta_strength (0-100)}

Responde con un JSON con la estructura:
{ "analyses": [ { "index": 0, "tone_detected": "...", "tone_coherence_score": 80, ... }, ... ] }`;

  const result = await openAIChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Analiza estos ${posts.length} posts:\n${JSON.stringify(postsForPrompt)}` }
  ]);

  return result.analyses || [];
}

// ── Recalcular narrative pillars ──────────────────────────────────────────────

async function recalculateNarrativePillars(env, brandContainerId) {
  // Leer todos los análisis del contenedor
  const analyses = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_content_analysis', method: 'GET',
    searchParams: {
      select: 'narrative_pillar,tone_coherence_score,analyzed_at',
      brand_container_id: `eq.${brandContainerId}`
    }
  });

  if (!Array.isArray(analyses) || analyses.length === 0) return;

  // También leer posts para cruzar engagement
  const posts = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_posts', method: 'GET',
    searchParams: {
      select: 'id,metrics,captured_at',
      brand_container_id: `eq.${brandContainerId}`,
      is_competitor: 'eq.false'
    }
  });
  const postsById = {};
  (Array.isArray(posts) ? posts : []).forEach(p => { postsById[p.id] = p; });

  const fullAnalyses = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_content_analysis', method: 'GET',
    searchParams: {
      select: 'brand_post_id,narrative_pillar,analyzed_at',
      brand_container_id: `eq.${brandContainerId}`
    }
  });

  // Agrupar por pilar
  const pillarMap = {};
  (Array.isArray(fullAnalyses) ? fullAnalyses : []).forEach(a => {
    const pil = a.narrative_pillar || 'sin_clasificar';
    if (!pillarMap[pil]) pillarMap[pil] = { count: 0, engagement: 0, lastPost: null };
    pillarMap[pil].count++;
    const post = postsById[a.brand_post_id];
    if (post?.metrics) {
      const eng = (post.metrics.likes || 0) + (post.metrics.comments || 0) + (post.metrics.shares || 0);
      pillarMap[pil].engagement += eng;
    }
    const at = a.analyzed_at;
    if (!pillarMap[pil].lastPost || at > pillarMap[pil].lastPost) pillarMap[pil].lastPost = at;
  });

  // Definir pilares esperados (base para detectar huérfanos)
  const expectedPillars = ['producto', 'comunidad', 'valores', 'oferta', 'educación', 'entretenimiento', 'lifestyle'];

  // Borrar pillars anteriores del contenedor
  await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_narrative_pillars', method: 'DELETE',
    searchParams: { brand_container_id: `eq.${brandContainerId}` }
  });

  const now = new Date().toISOString();
  const newPillars = [];

  // Pilares activos
  Object.entries(pillarMap).forEach(([name, data]) => {
    newPillars.push({
      brand_container_id: brandContainerId,
      pillar_name: name,
      pillar_type: 'active',
      post_count: data.count,
      avg_engagement: data.count > 0 ? Math.round(data.engagement / data.count * 100) / 100 : 0,
      last_post_at: data.lastPost,
      analyzed_at: now
    });
  });

  // Pilares huérfanos (esperados pero con 0 posts)
  expectedPillars.forEach(ep => {
    if (!pillarMap[ep]) {
      newPillars.push({
        brand_container_id: brandContainerId,
        pillar_name: ep,
        pillar_type: 'orphan',
        post_count: 0,
        avg_engagement: 0,
        last_post_at: null,
        description: `No se han publicado contenidos en el pilar "${ep}". Oportunidad detectada.`,
        analyzed_at: now
      });
    }
  });

  if (newPillars.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_narrative_pillars', method: 'POST',
      body: newPillars
    });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid session' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}

  const { brand_container_id, limit: rawLimit } = body;
  if (!brand_container_id) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }
  const batchLimit = Math.min(Number(rawLimit) || 10, 20);

  // Verificar acceso
  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brand_container_id}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Brand container not found' }) };

  if (bc.user_id !== user.id) {
    const members = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'organization_members', method: 'GET',
      searchParams: { select: 'id', organization_id: `eq.${bc.organization_id}`, user_id: `eq.${user.id}`, limit: '1' }
    });
    if (!Array.isArray(members) || members.length === 0) {
      return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  // Posts propios sin analizar aún
  const allPosts = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_posts', method: 'GET',
    searchParams: {
      select: 'id,content,metrics,media_assets,captured_at',
      brand_container_id: `eq.${brand_container_id}`,
      is_competitor: 'eq.false',
      order: 'captured_at.desc',
      limit: String(batchLimit * 3) // traemos más para filtrar los ya analizados
    }
  });

  // IDs ya analizados
  const analyzed = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_content_analysis', method: 'GET',
    searchParams: {
      select: 'brand_post_id',
      brand_container_id: `eq.${brand_container_id}`
    }
  });
  const analyzedIds = new Set((Array.isArray(analyzed) ? analyzed : []).map(a => a.brand_post_id));

  const postsToAnalyze = (Array.isArray(allPosts) ? allPosts : [])
    .filter(p => !analyzedIds.has(p.id))
    .slice(0, batchLimit);

  if (postsToAnalyze.length === 0) {
    // No hay posts nuevos; recalcular pillars por si acaso y salir
    await recalculateNarrativePillars(env, brand_container_id).catch(() => {});
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, analyzed: 0, message: 'No new posts to analyze' })
    };
  }

  // Leer brand_rules del contenedor para contexto de tono
  const brandRows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brands', method: 'GET',
    searchParams: { select: 'id', project_id: `eq.${brand_container_id}`, limit: '1' }
  });
  const brandId = Array.isArray(brandRows) && brandRows[0]?.id;
  let brandRules = [];
  if (brandId) {
    const rules = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_rules', method: 'GET',
      searchParams: { select: 'rule_type,rule_value', brand_id: `eq.${brandId}` }
    });
    brandRules = Array.isArray(rules) ? rules : [];
  }

  // Llamada a OpenAI (un solo batch)
  let analyses = [];
  try {
    analyses = await analyzeBatch(postsToAnalyze, brandRules);
  } catch (e) {
    console.error('[analyze-posts] OpenAI error:', e?.message);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  // Guardar resultados en brand_content_analysis
  const now = new Date().toISOString();
  const toInsert = [];
  analyses.forEach(a => {
    const post = postsToAnalyze[a.index];
    if (!post) return;
    toInsert.push({
      brand_post_id:        post.id,
      brand_container_id,
      tone_detected:        a.tone_detected        || null,
      tone_coherence_score: a.tone_coherence_score  ?? null,
      dominant_emotion:     a.dominant_emotion      || null,
      narrative_pillar:     a.narrative_pillar      || null,
      why_it_worked:        a.why_it_worked         || {},
      clarity_score:        a.clarity_score         ?? null,
      fatigue_risk:         !!a.fatigue_risk,
      analyzed_at:          now
    });
  });

  if (toInsert.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_content_analysis', method: 'POST',
      body: toInsert
    });
  }

  // Recalcular narrative pillars
  await recalculateNarrativePillars(env, brand_container_id).catch(e =>
    console.warn('[analyze-posts] pillars recalc failed:', e?.message)
  );

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, analyzed: toInsert.length })
  };
};
