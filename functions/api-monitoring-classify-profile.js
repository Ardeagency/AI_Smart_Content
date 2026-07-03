/**
 * Netlify Function: clasifica un perfil/URL para Vigilancia usando OpenAI.
 *
 * Dado el perfil que el usuario quiere seguir (URL + plataforma + handle) y el
 * contexto de la organización (mercados/brand_containers + productos), deduce:
 *   - tipo (rol): competidor_directo | competidor_indirecto | referencia_cultural
 *                 | aliado | owned_media
 *   - relevance: el "por qué monitorearlo", 1-3 frases en español.
 *
 * Doctrina de clasificación (regla del producto):
 *   - Mismos productos/servicios que la org        → competidor_directo
 *   - Distintos productos pero temática/público ≈  → competidor_indirecto
 *   - Aporta valor visual/estético/comunicacional  → referencia_cultural
 *   - Complementario, potencial colaboración       → aliado
 *   - Perfil de la propia marca                    → owned_media
 *
 * Evidencia del perfil: scraping best-effort de la URL (title/og/meta/JSON-LD).
 * Redes con login-wall (IG/TikTok) pueden no dar nada: se clasifica con lo que
 * haya (handle + nombre + plataforma) y confidence lo refleja.
 *
 * Costo ~ $0.0005 (gpt-4o-mini). No cobra créditos (precedente: api-name-conversation).
 *
 * Respuesta: { ok, tipo, relevance, confidence, scraped }
 */
const {
  corsHeaders, getSupabaseEnv, requireAuth, supabaseRest, assertOrgMember,
  checkBodySize, validateExternalUrl
} = require('./lib/ai-shared');
const { decodeHtmlEntities, readMeta } = require('./lib/scraping-shared');

const MODEL = 'gpt-4o-mini';
const MAX_OUTPUT_TOKENS = 300;

const TIPOS = ['competidor_directo', 'competidor_indirecto', 'referencia_cultural', 'aliado', 'owned_media'];

const CLASSIFY_SCHEMA = {
  name: 'profile_classification',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tipo', 'relevance', 'confidence'],
    properties: {
      tipo: {
        type: 'string',
        enum: TIPOS,
        description: 'Rol del perfil respecto a la marca de la organización.'
      },
      relevance: {
        type: 'string',
        description: 'Por qué monitorear este perfil: 1-3 frases en español, concretas y específicas al perfil y a la marca (qué comparte, qué lo hace competencia o referencia). Sin muletillas ni genéricos.'
      },
      confidence: {
        type: 'string',
        enum: ['alta', 'media', 'baja'],
        description: 'Qué tanta evidencia real del perfil respalda la clasificación. "baja" si solo hubo handle/nombre sin contenido del perfil.'
      }
    }
  }
};

function fail(event, status, message, extra = {}) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ error: message, ...extra }) };
}
function ok(event, data) {
  return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify(data) };
}

/** Scraping best-effort del perfil: title + metas + descripción JSON-LD. */
async function scrapeProfile(targetUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let html;
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AISmartContentBot/1.0; +https://aismartcontent.io)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8'
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!/html|xml/i.test(contentType)) throw new Error(`Content-Type no soportado: ${contentType}`);
    html = await res.text();
    if (html.length > 2 * 1024 * 1024) html = html.slice(0, 2 * 1024 * 1024);
  } finally {
    clearTimeout(timeout);
  }

  const out = {};
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) out.title = decodeHtmlEntities(titleMatch[1]).trim().slice(0, 200);
  const ogTitle = readMeta(html, [['property', 'og:title'], ['name', 'og:title']]);
  if (ogTitle) out.og_title = ogTitle.slice(0, 200);
  const ogDesc = readMeta(html, [['property', 'og:description'], ['name', 'og:description']]);
  if (ogDesc) out.og_description = ogDesc.slice(0, 500);
  const metaDesc = readMeta(html, [['name', 'description'], ['property', 'description']]);
  if (metaDesc) out.description = metaDesc.slice(0, 500);

  // JSON-LD: nombre/descripción de Organization/Person/ProfilePage si existe.
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        if (item.description && !out.jsonld_description) out.jsonld_description = String(item.description).slice(0, 400);
        if (item.name && !out.jsonld_name) out.jsonld_name = String(item.name).slice(0, 120);
      }
    } catch (_) { /* json malformado, skip */ }
  }
  return Object.keys(out).length ? out : null;
}

/** Contexto de la org: mercados (brand_containers) + muestra de productos. */
async function loadOrgContext(env, organizationId) {
  const [containers, products, orgs] = await Promise.all([
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'brand_containers',
      searchParams: {
        select: 'nombre_marca,nicho_core,propuesta_valor,palabras_clave',
        organization_id: `eq.${organizationId}`, order: 'updated_at.desc', limit: '3'
      }
    }).catch(() => []),
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'products',
      searchParams: {
        select: 'nombre_producto,tipo_producto,descripcion_producto',
        organization_id: `eq.${organizationId}`, order: 'updated_at.desc', limit: '12'
      }
    }).catch(() => []),
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'organizations',
      searchParams: { select: 'name', id: `eq.${organizationId}` }
    }).catch(() => [])
  ]);

  const lines = [];
  const orgName = orgs?.[0]?.name;
  if (orgName) lines.push(`Organización: ${orgName}`);
  (containers || []).forEach((b) => {
    const parts = [`Marca/mercado: ${b.nombre_marca || 'sin nombre'}`];
    if (b.nicho_core) parts.push(`nicho: ${b.nicho_core}`);
    if (b.propuesta_valor) parts.push(`propuesta de valor: ${String(b.propuesta_valor).slice(0, 200)}`);
    if (Array.isArray(b.palabras_clave) && b.palabras_clave.length) parts.push(`palabras clave: ${b.palabras_clave.slice(0, 8).join(', ')}`);
    lines.push(parts.join(' · '));
  });
  if (Array.isArray(products) && products.length) {
    lines.push('Productos de la marca:');
    products.forEach((p) => {
      const desc = p.descripcion_producto ? ` — ${String(p.descripcion_producto).slice(0, 120)}` : '';
      lines.push(`- ${p.nombre_producto || 'sin nombre'}${p.tipo_producto ? ` (${p.tipo_producto})` : ''}${desc}`);
    });
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = `Eres el analista de inteligencia competitiva de una marca. Clasificas un perfil social o página web que la marca quiere monitorear, asignándole un rol y explicando su relevancia.

Reglas de clasificación (en este orden de prioridad):
1. Si el perfil pertenece a la propia marca/organización (mismo nombre, mismo handle) → "owned_media".
2. Si ofrece productos o servicios muy similares a los de la marca (compite por las mismas ventas y el mismo público) → "competidor_directo".
3. Si NO vende lo mismo pero su temática, nicho o público es muy similar (resuelve la misma necesidad de otra forma, roza el público) → "competidor_indirecto".
4. Si su valor para la marca está en lo visual, estético, creativo o comunicacional (inspiración de diseño, formato de contenido, estrategia de comunicación) y no compite → "referencia_cultural".
5. Si es complementario y hay potencial de colaboración, co-marketing o audiencia compartida sin competir → "aliado".

Para "relevance": escribe el porqué específico en 1-3 frases en español, como lo escribiría un estratega (ej.: "Referencia de diseño visual: dirección de arte minimalista y fotografía de producto aplicable a nuestros lanzamientos", o "Compite directo en X con el mismo público de Y"). Nombra qué comparte o qué aporta; nada genérico.

Si la evidencia del perfil es poca (solo handle/nombre), clasifica con lo que el nombre, la plataforma y el contexto de la marca permitan inferir y marca confidence "baja".`;

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
    if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

    const tooBig = checkBodySize(event, 8 * 1024);
    if (tooBig) return tooBig;

    const user = await requireAuth(event);
    if (!user) return fail(event, 401, 'No autorizado');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return fail(event, 500, 'OPENAI_API_KEY no configurada');

    let body = {};
    try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {}; }
    catch (_) { return fail(event, 400, 'Body JSON invalido'); }

    const organizationId = String(body.organization_id || '').trim();
    const url = String(body.url || '').trim();
    const platform = String(body.platform || '').trim() || null;
    const handle = String(body.handle || '').trim() || null;
    const name = String(body.name || '').trim() || null;
    if (!organizationId || !url) return fail(event, 400, 'organization_id y url requeridos');

    const urlCheck = validateExternalUrl(url);
    if (!urlCheck.ok) return fail(event, 400, `URL no permitida: ${urlCheck.reason}`);

    let env;
    try { env = getSupabaseEnv(); } catch (e) { return fail(event, 500, e.message); }

    try { await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id }); }
    catch (e) { return fail(event, e.statusCode || 403, e.message); }

    // Contexto de la org + evidencia del perfil, en paralelo. Scraping puede fallar
    // (login-wall de IG/TikTok): se clasifica igual con lo que haya.
    const [orgContext, scraped] = await Promise.all([
      loadOrgContext(env, organizationId),
      scrapeProfile(url).catch(() => null)
    ]);

    const profileLines = [`URL: ${url}`];
    if (platform) profileLines.push(`Plataforma: ${platform}`);
    if (handle) profileLines.push(`Handle: @${handle}`);
    if (name) profileLines.push(`Nombre detectado: ${name}`);
    if (scraped) {
      profileLines.push('Evidencia extraída de la página:');
      Object.entries(scraped).forEach(([k, v]) => profileLines.push(`- ${k}: ${v}`));
    } else {
      profileLines.push('(No se pudo extraer contenido de la página; clasifica con handle/nombre/plataforma.)');
    }

    const userContent = `CONTEXTO DE LA MARCA:\n${orgContext || '(sin contexto de marca registrado)'}\n\nPERFIL A CLASIFICAR:\n${profileLines.join('\n')}`;

    let openaiData;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent }
          ],
          response_format: { type: 'json_schema', json_schema: CLASSIFY_SCHEMA },
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.2
        })
      });
      openaiData = await res.json();
      if (!res.ok || openaiData.error) {
        const msg = openaiData.error?.message || `OpenAI HTTP ${res.status}`;
        return fail(event, res.status >= 400 ? res.status : 500, msg);
      }
    } catch (err) {
      return fail(event, 502, `OpenAI no disponible: ${err.message}`);
    }

    let parsed;
    try { parsed = JSON.parse(openaiData.choices?.[0]?.message?.content || '{}'); }
    catch (_) { return fail(event, 500, 'Respuesta de OpenAI no parseable'); }

    const tipo = TIPOS.includes(parsed.tipo) ? parsed.tipo : null;
    const relevance = String(parsed.relevance || '').trim() || null;
    if (!tipo || !relevance) return fail(event, 500, 'Clasificacion incompleta');

    return ok(event, {
      ok: true,
      tipo,
      relevance,
      confidence: ['alta', 'media', 'baja'].includes(parsed.confidence) ? parsed.confidence : 'baja',
      scraped: !!scraped
    });
  } catch (err) {
    return fail(event, 500, `Error interno: ${err.message}`);
  }
};
