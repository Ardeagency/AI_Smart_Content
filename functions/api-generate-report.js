/**
 * api-generate-report — genera un informe de marketing con la API de Claude.
 *
 * Recibe el alcance (scope) y arma TODO el contexto necesario desde Supabase
 * (identidad de marca, colores, tipografia, logo, audiencias, campanas,
 * productos, servicios, lugares, producciones, metricas, aprendizajes de Vera)
 * segun lo que el usuario selecciono, y le pide a Claude un informe en markdown.
 *
 * Scopes:
 *   all        → toda la marca
 *   campaign   → una campana + lo conectado a ella (audiencia, ads, metricas)
 *   audience   → una audiencia + campanas vinculadas
 *   ecosystem  → todo + foco en patrones que Vera esta aprendiendo/optimizando
 *   selection  → la entidad seleccionada + su contexto inmediato
 *
 * Cobro: RPC use_credits_numeric (1 credito = $1 USD). Key: CLAUDE_AI_API.
 */
const {
  corsHeaders, getSupabaseEnv, requireAuth, supabaseRest,
  assertOrgMember, checkBodySize
} = require('./lib/ai-shared');

const MODEL = 'claude-sonnet-4-6';
const PRICE_INPUT_PER_1M = 3.00;   // aprox Claude Sonnet (accounting de creditos)
const PRICE_OUTPUT_PER_1M = 15.00;
const USD_PER_CREDIT = 1.0;
const MAX_OUTPUT_TOKENS = 4096;

function fail(event, status, message, extra = {}) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ error: message, ...extra }) };
}

async function srest(env, path, searchParams) {
  try {
    const r = await supabaseRest({ url: env.url, serviceKey: env.serviceKey, path, method: 'GET', searchParams });
    return Array.isArray(r) ? r : [];
  } catch (e) {
    console.warn('[report] fetch', path, e?.message);
    return [];
  }
}

const SCOPE_LABEL = {
  all: 'Informe integral de la marca',
  campaign: 'Informe de campana',
  audience: 'Informe de audiencia',
  ecosystem: 'Aprendizaje del ecosistema (patrones que Vera optimiza)',
  selection: 'Informe del elemento seleccionado',
};

async function handlerImpl(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return fail(event, 405, 'Method not allowed');

  const tooBig = checkBodySize(event, 64 * 1024);
  if (tooBig) return tooBig;

  const user = await requireAuth(event);
  if (!user) return fail(event, 401, 'No autorizado');

  const apiKey = process.env.CLAUDE_AI_API;
  if (!apiKey) return fail(event, 500, 'CLAUDE_AI_API no configurada');

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return fail(event, 400, 'JSON invalido'); }

  const organizationId = body.organization_id;
  const brandContainerId = body.brand_container_id || null;
  const scope = String(body.scope || 'all');
  const selected = body.selected || null; // { type, id }
  if (!organizationId) return fail(event, 400, 'organization_id requerido');
  if (!SCOPE_LABEL[scope]) return fail(event, 400, 'scope invalido');
  if ((scope === 'campaign' || scope === 'audience' || scope === 'selection') && !(selected && selected.id)) {
    return fail(event, 400, 'Selecciona un elemento en el canvas para este informe');
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return fail(event, 500, e.message); }
  try { await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id }); }
  catch (e) { return fail(event, e.statusCode || 403, e.message); }

  // ── Contexto base de marca (siempre) ──────────────────────────────
  const orgFilter = { organization_id: `eq.${organizationId}` };
  const brandRows = await srest(env, 'brand_containers', {
    select: 'id,nombre_marca,nicho_core,propuesta_valor,arquetipo,verbal_dna,visual_dna,palabras_clave,palabras_prohibidas,mision_vision,objetivos_estrategicos,creative_brief,default_scene_anchor,signature_elements',
    ...(brandContainerId ? { id: `eq.${brandContainerId}` } : orgFilter),
    order: 'updated_at.desc', limit: '1',
  });
  const brand = brandRows[0] || null;
  const bid = brand?.id || brandContainerId;
  const bidFilter = bid ? { brand_container_id: `eq.${bid}` } : {};

  const [colors, fonts, logoAssets] = await Promise.all([
    srest(env, 'brand_colors', { select: 'hex_value,color_role', ...orgFilter, limit: '40' }),
    srest(env, 'brand_fonts', { select: 'font_family,font_usage,font_weight', ...orgFilter, limit: '20' }),
    bid ? srest(env, 'brand_assets', { select: 'file_url,asset_type,file_name', brand_container_id: `eq.${bid}`, asset_type: 'eq.logo', limit: '3' }) : Promise.resolve([]),
  ]);

  const ctx = {
    scope,
    generado: new Date().toISOString(),
    marca: brand ? {
      nombre: brand.nombre_marca, nicho: brand.nicho_core, propuesta_valor: brand.propuesta_valor,
      arquetipo: brand.arquetipo, verbal_dna: brand.verbal_dna, visual_dna: brand.visual_dna,
      palabras_clave: brand.palabras_clave, palabras_prohibidas: brand.palabras_prohibidas,
      mision_vision: brand.mision_vision, objetivos: brand.objetivos_estrategicos,
      creative_brief: brand.creative_brief, escena_ancla: brand.default_scene_anchor,
      elementos_firma: brand.signature_elements,
    } : null,
    identidad_visual: {
      colores: colors, tipografias: fonts, logo_url: logoAssets[0]?.file_url || null,
    },
  };

  const campCols = 'id,nombre_campana,descripcion_interna,persona_id,platform,platform_objective,status,cta,budget_daily,budget_total,budget_currency,starts_at,ends_at,cached_impressions,cached_clicks,cached_spend,cached_conversions,cached_roas,cached_ctr,last_synced_at';
  const audCols = 'id,name,description,awareness_level,dolores,deseos,objeciones,gatillos_compra,target_age_min,target_age_max,target_genders,alignment_score,is_active,is_featured';

  if (scope === 'all' || scope === 'ecosystem') {
    const [auds, camps, prods, servs, prodOut] = await Promise.all([
      bid ? srest(env, 'audience_personas', { select: audCols, ...bidFilter, limit: '50' }) : [],
      bid ? srest(env, 'campaigns', { select: campCols, ...bidFilter, order: 'updated_at.desc', limit: '80' }) : [],
      srest(env, 'products', { select: 'nombre_producto,descripcion_producto,precio_producto,moneda', ...orgFilter, limit: '60' }),
      srest(env, 'services', { select: 'nombre_servicio,descripcion_servicio,precio_base,moneda', ...orgFilter, limit: '60' }),
      bid ? srest(env, 'runs_outputs', { select: 'output_type,generated_copy,created_at', ...bidFilter, order: 'created_at.desc', limit: '25' }) : [],
    ]);
    ctx.audiencias = auds;
    ctx.campanas = camps;
    ctx.productos = prods;
    ctx.servicios = servs;
    ctx.producciones = prodOut;
    if (scope === 'ecosystem' && bid) {
      const [recs, pending] = await Promise.all([
        srest(env, 'strategic_recommendations', { select: 'title,rationale,status,created_at', ...bidFilter, order: 'created_at.desc', limit: '40' }),
        srest(env, 'vera_pending_actions', { select: 'action_type,vera_reasoning,vera_confidence,status,created_at', ...bidFilter, order: 'created_at.desc', limit: '40' }),
      ]);
      ctx.aprendizajes_vera = { recomendaciones_estrategicas: recs, acciones_propuestas: pending };
    }
  } else if (scope === 'campaign') {
    const camps = await srest(env, 'campaigns', { select: campCols, id: `eq.${selected.id}`, limit: '1' });
    const c = camps[0] || null;
    ctx.campana = c;
    if (c?.persona_id) {
      const a = await srest(env, 'audience_personas', { select: audCols, id: `eq.${c.persona_id}`, limit: '1' });
      ctx.audiencia_objetivo = a[0] || null;
    }
    const [ads, outs] = await Promise.all([
      srest(env, 'ad_insights_daily', { select: 'external_ad_id,external_adset_id,impressions,clicks,spend,conversions', campaign_id: `eq.${selected.id}`, limit: '500' }),
      srest(env, 'runs_outputs', { select: 'output_type,generated_copy,created_at', campaign_id: `eq.${selected.id}`, order: 'created_at.desc', limit: '20' }),
    ]);
    ctx.ads = ads;
    ctx.producciones = outs;
  } else if (scope === 'audience') {
    const a = await srest(env, 'audience_personas', { select: audCols, id: `eq.${selected.id}`, limit: '1' });
    ctx.audiencia = a[0] || null;
    ctx.campanas_vinculadas = await srest(env, 'campaigns', { select: campCols, persona_id: `eq.${selected.id}`, limit: '50' });
  } else if (scope === 'selection') {
    const t = selected.type;
    const tableByType = {
      audience: ['audience_personas', audCols],
      'campaign-real': ['campaigns', campCols],
      'campaign-concept': ['campaigns', campCols],
      products: ['products', 'nombre_producto,descripcion_producto,precio_producto,moneda'],
      services: ['services', 'nombre_servicio,descripcion_servicio,precio_base,moneda'],
      places: ['brand_places', 'nombre_lugar,descripcion_lugar,city,country,place_type'],
      briefs: ['campaign_briefs', 'nombre,objetivo,mensaje_clave,tono'],
    };
    const map = tableByType[t];
    if (map) {
      const rows = await srest(env, map[0], { select: map[1], id: `eq.${selected.id}`, limit: '1' });
      ctx.seleccionado = { tipo: t, datos: rows[0] || null };
      if ((t === 'campaign-real' || t === 'campaign-concept') && rows[0]?.persona_id) {
        const a = await srest(env, 'audience_personas', { select: audCols, id: `eq.${rows[0].persona_id}`, limit: '1' });
        ctx.seleccionado.audiencia_objetivo = a[0] || null;
      }
      if (t === 'audience') {
        ctx.seleccionado.campanas_vinculadas = await srest(env, 'campaigns', { select: campCols, persona_id: `eq.${selected.id}`, limit: '50' });
      }
    }
  }

  // ── Prompt ────────────────────────────────────────────────────────
  const system = [
    'Eres Vera, la estratega de marca de AI Smart Content. Generas informes de marketing claros, accionables y con criterio de CMO.',
    'Escribes en espanol profesional (puedes usar tildes), en formato Markdown bien estructurado con encabezados, listas y tablas cuando aporten.',
    'NO inventes datos: usa unicamente el contexto entregado. Si falta informacion, dilo explicitamente.',
    'Conecta identidad de marca + audiencias + campanas + resultados; explica el POR QUE, no solo el QUE. Las metricas son evidencia, no el relato.',
    scope === 'ecosystem'
      ? 'ENFOQUE: reporta los PATRONES que el sistema (Vera) esta aprendiendo y optimizando: que esta funcionando, que se esta ajustando, recomendaciones y proximas acciones, a partir de aprendizajes_vera y el resto del contexto.'
      : 'Estructura sugerida: Resumen ejecutivo, Identidad de marca, Audiencias, Campanas y resultados, Producciones, Recomendaciones y proximos pasos.',
  ].join('\n');

  const userMsg = `Genera un "${SCOPE_LABEL[scope]}" con el siguiente contexto (JSON):\n\n\`\`\`json\n${JSON.stringify(ctx)}\n\`\`\``;

  let claude;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    claude = await res.json();
    if (!res.ok || claude.error) {
      return fail(event, res.status >= 400 ? res.status : 500, claude?.error?.message || `Claude API error ${res.status}`);
    }
  } catch (e) {
    return fail(event, 502, `Fallo al llamar a Claude: ${e?.message || e}`);
  }

  const report = (claude.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const usage = claude.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const usdCost = (inputTokens * PRICE_INPUT_PER_1M / 1e6) + (outputTokens * PRICE_OUTPUT_PER_1M / 1e6);
  const creditsAmount = Math.round((usdCost / USD_PER_CREDIT) * 1e6) / 1e6;

  if (creditsAmount > 0) {
    try {
      const chargeRes = await fetch(`${env.url}/rest/v1/rpc/use_credits_numeric`, {
        method: 'POST',
        headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_user_id: user.id,
          p_credits_amount: creditsAmount,
          p_kind: 'tool_call',
          p_usd_cost: usdCost,
          p_source_table: 'brand_containers',
          p_source_id: bid,
          p_metadata: { operation: 'report_generation', scope, model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens },
        }),
      });
      const charged = await chargeRes.json().catch(() => null);
      if (!chargeRes.ok || charged === false) {
        return fail(event, 402, 'Creditos insuficientes para generar el informe', { usd_cost: usdCost, credits_needed: creditsAmount });
      }
    } catch (err) {
      console.warn('[report] charge', err?.message);
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      ok: true, scope, title: SCOPE_LABEL[scope], report,
      usd_cost: Number(usdCost.toFixed(6)), credits_charged: Number(creditsAmount.toFixed(6)),
      tokens: { input: inputTokens, output: outputTokens },
    }),
  };
}

exports.handler = async (event) => {
  try { return await handlerImpl(event); }
  catch (err) {
    console.error('[generate-report] Unhandled:', err?.stack || err);
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Error interno', detail: err?.message || String(err) }) };
  }
};
