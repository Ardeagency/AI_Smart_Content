/**
 * Netlify Function: genera la ficha de un SERVICIO usando OpenAI (gpt-4o-mini text-only)
 * a partir de la URL del servicio o archivos adjuntos + contexto de marca.
 *
 * Diferencias vs api-products-generate-fiche:
 *  - NO vision (servicios son conceptuales, no visuales) -> gpt-4o-mini, 16x mas barato
 *  - NO variantes
 *  - NO images upload/insert
 *  - Schema enfocado a entregables y metodologia_pasos (lo que el servicio HACE/ENTREGA)
 *
 * Comparte la misma red de seguridad: detectPlatform + isUsefulScrape +
 * use_credits_numeric + cleanup en caller si falla.
 *
 * POST body: { service_id, organization_id, url }
 * Respuesta: { ok, service_id, source, usd_cost, credits_charged, tokens, scraped? }
 */

const {
  corsHeaders, getSupabaseEnv, requireAuth, supabaseRest, assertOrgMember, checkBodySize
} = require('./lib/ai-shared');

// gpt-4o-mini pricing (USD por 1M tokens). Mucho mas barato que gpt-4o porque
// no necesitamos vision en servicios.
const PRICE_INPUT_PER_1M = 0.150;
const PRICE_OUTPUT_PER_1M = 0.600;
const USD_PER_CREDIT = 1.0;
const MODEL = 'gpt-4o-mini';
const MAX_OUTPUT_TOKENS = 800;

const SYSTEM_PROMPT = [
  'Sos un extractor de fichas de SERVICIOS (no productos fisicos).',
  'Los servicios son ofertas que una empresa vende: consultorias, capacitaciones, soporte tecnico, asesorias, mantenimiento, atencion al cliente, suscripciones, etc.',
  'Devuelve JSON estructurado con los datos del servicio que veas en el contexto scrapeado.',
  'Idioma: espanol SIN acentos agudos en vocales (escribi "rapido", no "rápido"). Manten enie (ñ) y signos de puntuacion.',
  'REGLA #1 — NO INVENTAR: el brand context describe a la marca cliente (su tono, nichos, servicios historicos), NO al servicio que estas describiendo ahora. Solo describi el servicio que ves en los datos scrapeados. Si las datos hablan de consultoria estrategica, el servicio es consultoria estrategica — aunque la marca cliente venda mantenimiento de software. Si los datos son insuficientes, devolve nombre_servicio="Servicio no identificado" y arrays vacios. NUNCA construyas un servicio ficticio que calce con la marca.',
  'No inventes precios, duraciones, ni metodologias que no esten en los datos.',
  'Tono: ajustate al verbal_dna y arquetipo de la marca SOLO para el lenguaje de la descripcion, NUNCA para reinterpretar QUE es el servicio.',
  'Respeta palabras_prohibidas.',
  'Concision: descripcion 60-120 palabras, items de arrays 3-12 palabras cada uno.',
  'ENTREGABLES son lo que el cliente CONCRETAMENTE recibe (reportes ejecutivos, sesiones 1:1, manuales, acceso a plataforma, etc.). NO son beneficios.',
  'METODOLOGIA_PASOS son las etapas en orden de como se entrega el servicio (Diagnostico, Implementacion, Seguimiento, etc.). NO son beneficios ni entregables.'
].join(' ');

const FICHE_SCHEMA = {
  name: 'service_fiche',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'nombre_servicio',
      'descripcion_servicio',
      'duracion_estimada',
      'beneficios_principales',
      'diferenciadores',
      'casos_de_uso',
      'entregables',
      'metodologia_pasos'
    ],
    properties: {
      nombre_servicio: {
        type: 'string',
        description: 'Nombre comercial del servicio. Sin acentos. Maximo 120 chars.'
      },
      descripcion_servicio: {
        type: 'string',
        description: 'Descripcion narrativa 60-120 palabras del servicio en el tono de la marca. Sin acentos.'
      },
      duracion_estimada: {
        type: ['string', 'null'],
        description: 'Tiempo o frecuencia del servicio: "1 hora", "sesion semanal", "contrato 6 meses", "ongoing". Null si no esta en los datos.'
      },
      beneficios_principales: {
        type: 'array', items: { type: 'string' }, maxItems: 6,
        description: 'Beneficios que el cliente obtiene al contratar el servicio. Sin acentos.'
      },
      diferenciadores: {
        type: 'array', items: { type: 'string' }, maxItems: 4,
        description: 'Que separa este servicio de competidores. Sin acentos.'
      },
      casos_de_uso: {
        type: 'array', items: { type: 'string' }, maxItems: 4,
        description: 'Perfiles de cliente o situaciones donde el servicio aplica. Sin acentos.'
      },
      entregables: {
        type: 'array', items: { type: 'string' }, maxItems: 6,
        description: 'Lo que el cliente CONCRETAMENTE recibe (reportes, sesiones, manuales, accesos). Sin acentos.'
      },
      metodologia_pasos: {
        type: 'array', items: { type: 'string' }, maxItems: 6,
        description: 'Etapas en orden de como se entrega el servicio (Diagnostico, Implementacion, Seguimiento, etc.). Sin acentos.'
      }
    }
  }
};

// ─── Helpers de scraping (copiados de api-products-generate-fiche para no acoplar
// ambos. TODO: extraer a functions/lib/scraping-shared.js — ver FEAT-026 si se crea). ───

function decodeHtmlEntities(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

function readMeta(html, keyValues) {
  for (const [attrName, attrValue] of keyValues) {
    const escVal = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let m = html.match(new RegExp(`<meta[^>]+\\b${attrName}=["']${escVal}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i'));
    if (m && m[1]) return decodeHtmlEntities(m[1]);
    m = html.match(new RegExp(`<meta[^>]+\\bcontent=["']([^"']*)["'][^>]+\\b${attrName}=["']${escVal}["']`, 'i'));
    if (m && m[1]) return decodeHtmlEntities(m[1]);
  }
  return null;
}

function parseScrapedPrice(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length === 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const map = [
      [/mercadolibre\.|mercadolivre\./, 'Mercado Libre'],
      [/amazon\./, 'Amazon'], [/ebay\./, 'eBay'],
      [/myshopify\.com$/, 'Shopify'], [/aliexpress\./, 'AliExpress'],
      [/alibaba\./, 'Alibaba'], [/etsy\./, 'Etsy'], [/walmart\./, 'Walmart'],
      [/falabella\./, 'Falabella'], [/exito\.com/, 'Éxito'], [/carulla\.com/, 'Carulla'],
      [/linio\./, 'Linio'], [/rappi\./, 'Rappi'], [/jumbo\.co/, 'Jumbo'],
      [/homecenter\./, 'Homecenter'], [/tiendanube\.com|nuvemshop\./, 'Tiendanube'],
      [/vtex\.com/, 'VTEX'], [/bigcommerce\.com/, 'BigCommerce'], [/woocommerce\.com/, 'WooCommerce'],
    ];
    for (const [re, name] of map) if (re.test(host)) return name;
    return host.replace(/^www\./, '').split('.')[0].replace(/^./, (c) => c.toUpperCase());
  } catch (_) { return 'la URL provista'; }
}

function isUsefulScrape(scraped) {
  if (!scraped) return false;
  const title = String(scraped.title || '').trim();
  const desc = String(scraped.description || '').trim();
  const hasStructured = !!scraped.brand || !!scraped.price;
  const genericTitleRe = /^(mercado libre|mercadolivre|amazon|ebay|shopify|aliexpress|home|inicio|loading|cargando|404|page not found|access denied|please enable javascript|sign in|iniciar sesion)\b/i;
  const titleIsGeneric = title && genericTitleRe.test(title);
  if (hasStructured) return true;
  if (desc && desc.length > 30 && !genericTitleRe.test(desc)) return true;
  if (title && !titleIsGeneric && title.length > 10) return true;
  return false;
}

// Scraper simplificado para servicios — solo necesitamos texto (title, description,
// JSON-LD si es Service o Product hayflexible), price si aparece. Imagenes no.
async function scrapeServiceFromUrl(targetUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
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
    if (html.length > 4 * 1024 * 1024) html = html.slice(0, 4 * 1024 * 1024);
  } finally { clearTimeout(timeout); }

  const result = { title: null, description: null, price: null, currency: null, brand: null };

  // 1) JSON-LD: Service O Product (algunos sitios tipan servicios como Product)
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if (types.some((t) => /^(Service|Product|Offer|Course|FinancialService|MedicalService|GovernmentService|Profession)$/.test(t))) {
          if (!result.title && item.name) result.title = String(item.name);
          if (!result.description && item.description) result.description = String(item.description);
          if (!result.brand) result.brand = typeof item.brand === 'string' ? item.brand : (item.brand?.name || item.provider?.name || null);
          const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          if (offer && typeof offer === 'object' && !result.price) {
            result.price = offer.price || offer.lowPrice || null;
            result.currency = offer.priceCurrency || null;
          }
        }
      }
    } catch (_) { /* skip */ }
  }

  // 2) Open Graph
  if (!result.title) result.title = readMeta(html, [['property', 'og:title']]);
  if (!result.description) result.description = readMeta(html, [['property', 'og:description']]);
  if (!result.price) result.price = readMeta(html, [['property', 'product:price:amount'], ['property', 'og:price:amount']]);
  if (!result.currency) result.currency = readMeta(html, [['property', 'product:price:currency'], ['property', 'og:price:currency']]);

  // 3) Fallbacks finales
  if (!result.title) {
    const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tm) result.title = decodeHtmlEntities(tm[1].trim()).slice(0, 250);
  }
  if (!result.description) result.description = readMeta(html, [['name', 'description']]);

  return result;
}

function buildBrandContextText(brand, orgName) {
  if (!brand) return `Marca: ${orgName || 'desconocida'}`;
  const lines = [];
  lines.push(`Marca: ${brand.nombre_marca || orgName || 'sin nombre'}`);
  if (brand.nicho_core) lines.push(`Nicho: ${brand.nicho_core}`);
  if (brand.propuesta_valor) lines.push(`Propuesta de valor: ${String(brand.propuesta_valor).slice(0, 220)}`);
  if (brand.arquetipo) lines.push(`Arquetipo: ${brand.arquetipo}`);
  if (brand.verbal_dna) {
    const vd = typeof brand.verbal_dna === 'string' ? brand.verbal_dna : JSON.stringify(brand.verbal_dna);
    lines.push(`Tono verbal: ${vd.slice(0, 240)}`);
  }
  if (Array.isArray(brand.palabras_clave) && brand.palabras_clave.length) {
    lines.push(`Palabras clave: ${brand.palabras_clave.slice(0, 8).join(', ')}`);
  }
  if (Array.isArray(brand.palabras_prohibidas) && brand.palabras_prohibidas.length) {
    lines.push(`Palabras prohibidas: ${brand.palabras_prohibidas.slice(0, 8).join(', ')}`);
  }
  return lines.join('\n');
}

function buildScrapedSummary(s) {
  if (!s) return '';
  const lines = [];
  if (s.title) lines.push(`Titulo de la pagina: ${String(s.title).slice(0, 240)}`);
  if (s.brand) lines.push(`Proveedor/Marca: ${String(s.brand).slice(0, 120)}`);
  if (s.description) lines.push(`Descripcion en la pagina: ${String(s.description).slice(0, 1200)}`);
  if (s.price) lines.push(`Precio: ${s.price}${s.currency ? ' ' + s.currency : ''}`);
  return lines.join('\n');
}

function fail(event, status, message, extra = {}) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ error: message, ...extra }) };
}

// ─── Handler ────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try { return await handlerImpl(event); }
  catch (err) {
    console.error('[services-fiche] Unhandled:', err?.stack || err);
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Error interno', detail: err?.message || String(err) }) };
  }
};

async function handlerImpl(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

  const tooBig = checkBodySize(event, 32 * 1024);
  if (tooBig) return tooBig;

  const user = await requireAuth(event);
  if (!user) return fail(event, 401, 'No autorizado');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(event, 500, 'OPENAI_API_KEY no configurada');

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return fail(event, 400, 'Body JSON invalido'); }

  const serviceId = String(body.service_id || '').trim();
  const organizationId = String(body.organization_id || '').trim();
  const sourceUrl = typeof body.url === 'string' ? body.url.trim() : null;

  if (!serviceId || !organizationId) return fail(event, 400, 'service_id y organization_id requeridos');
  if (!sourceUrl) return fail(event, 400, 'url requerida');
  if (!/^https?:\/\//i.test(sourceUrl)) return fail(event, 400, 'URL invalida');

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return fail(event, 500, e.message); }

  try { await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id }); }
  catch (e) { return fail(event, e.statusCode || 403, e.message); }

  // Verificar servicio pertenece a la org
  const services = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'services',
    searchParams: { select: 'id,organization_id,entity_id', id: `eq.${serviceId}` }
  });
  const service = services?.[0];
  if (!service || service.organization_id !== organizationId) return fail(event, 404, 'Servicio no encontrado');

  // Scraping
  const platform = detectPlatform(sourceUrl);
  let scraped;
  try { scraped = await scrapeServiceFromUrl(sourceUrl); }
  catch (e) {
    return fail(event, 502, `No se pudo leer la pagina de ${platform}: ${e.message}. Intenta con otra URL o sube los archivos del servicio directamente.`, { platform });
  }

  if (!isUsefulScrape(scraped)) {
    return fail(event, 422,
      `El servicio no se pudo obtener desde la pagina de ${platform}. La URL no expone datos del servicio (probablemente la pagina requiere JavaScript o tiene anti-bot activo). Intenta con otra URL del mismo servicio, o sube los archivos del servicio directamente.`,
      { platform, scraped_hint: { has_title: !!scraped.title, has_description: !!scraped.description } }
    );
  }
  const scrapedSummary = buildScrapedSummary(scraped);

  // Fetch brand context (mismo patron que productos)
  let brand = null;
  const bs = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers',
    searchParams: {
      select: 'nombre_marca,nicho_core,propuesta_valor,arquetipo,verbal_dna,palabras_clave,palabras_prohibidas',
      organization_id: `eq.${organizationId}`,
      order: 'updated_at.desc',
      limit: '1'
    }
  });
  brand = bs?.[0] || null;
  const orgs = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'organizations',
    searchParams: { select: 'name', id: `eq.${organizationId}` }
  });
  const orgName = orgs?.[0]?.name || null;
  const brandContextText = buildBrandContextText(brand, orgName);

  // OpenAI call — text only, gpt-4o-mini
  const userText = [
    brandContextText,
    '',
    'DATOS EXTRAIDOS DE LA PAGINA DEL SERVICIO:',
    scrapedSummary,
    '',
    'Genera la ficha del servicio en base a los datos extraidos. Si la pagina no menciona explicitamente un campo (ej. metodologia_pasos), deja el array vacio o el campo en null. Adapta el tono al verbal_dna pero NO reinterpretes QUE es el servicio.'
  ].join('\n');

  let openaiData;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText }
        ],
        response_format: { type: 'json_schema', json_schema: FICHE_SCHEMA },
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.4
      })
    });
    openaiData = await res.json();
    if (!res.ok || openaiData.error) {
      const msg = openaiData.error?.message || `OpenAI HTTP ${res.status}`;
      return fail(event, res.status >= 400 ? res.status : 500, msg);
    }
  } catch (err) {
    return fail(event, 500, `Error llamando a OpenAI: ${err.message}`);
  }

  let fiche;
  try { fiche = JSON.parse(openaiData.choices?.[0]?.message?.content || ''); }
  catch (_) { return fail(event, 500, 'OpenAI devolvio JSON invalido'); }

  const usage = openaiData.usage || {};
  const inputTokens = Number(usage.prompt_tokens || 0);
  const outputTokens = Number(usage.completion_tokens || 0);
  const usdCost = (inputTokens * PRICE_INPUT_PER_1M / 1_000_000) + (outputTokens * PRICE_OUTPUT_PER_1M / 1_000_000);
  const creditsAmount = Math.round((usdCost / USD_PER_CREDIT) * 1_000_000) / 1_000_000;

  // Cobrar creditos
  if (creditsAmount > 0) {
    try {
      const chargeRes = await fetch(`${env.url}/rest/v1/rpc/use_credits_numeric`, {
        method: 'POST',
        headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_organization_id: organizationId, p_user_id: user.id,
          p_credits_amount: creditsAmount, p_kind: 'tool_call', p_usd_cost: usdCost,
          p_source_table: 'services', p_source_id: serviceId,
          p_metadata: { operation: 'service_fiche_generation', model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens }
        })
      });
      const charged = await chargeRes.json();
      if (!chargeRes.ok || charged === false) {
        return fail(event, 402, 'Creditos insuficientes para generar la ficha', { usd_cost: usdCost, credits_needed: creditsAmount });
      }
    } catch (err) {
      return fail(event, 500, `Error cobrando creditos: ${err.message}`);
    }
  }

  // PATCH al servicio con la ficha generada
  const updates = {
    nombre_servicio: String(fiche.nombre_servicio || '').slice(0, 200) || 'Servicio sin nombre',
    descripcion_servicio: String(fiche.descripcion_servicio || '').slice(0, 4000),
    duracion_estimada: fiche.duracion_estimada ? String(fiche.duracion_estimada).slice(0, 120) : null,
    beneficios_principales: Array.isArray(fiche.beneficios_principales) ? fiche.beneficios_principales.slice(0, 12) : [],
    diferenciadores: Array.isArray(fiche.diferenciadores) ? fiche.diferenciadores.slice(0, 8) : [],
    casos_de_uso: Array.isArray(fiche.casos_de_uso) ? fiche.casos_de_uso.slice(0, 8) : [],
    entregables: Array.isArray(fiche.entregables) ? fiche.entregables.slice(0, 12) : [],
    metodologia_pasos: Array.isArray(fiche.metodologia_pasos) ? fiche.metodologia_pasos.slice(0, 12) : [],
    url_servicio: sourceUrl,
  };
  if (scraped) {
    const parsedPrice = parseScrapedPrice(scraped.price);
    if (parsedPrice != null && parsedPrice > 0) updates.precio_base = parsedPrice;
    if (typeof scraped.currency === 'string' && /^[A-Z]{3}$/.test(scraped.currency.toUpperCase())) {
      updates.moneda = scraped.currency.toUpperCase();
    }
  }

  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `services?id=eq.${serviceId}`, method: 'PATCH', body: updates
    });
  } catch (err) {
    return fail(event, 500, `Error actualizando servicio: ${err.message}`);
  }

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      ok: true,
      service_id: serviceId,
      source: 'url',
      usd_cost: Number(usdCost.toFixed(6)),
      credits_charged: Number(creditsAmount.toFixed(6)),
      tokens: { input: inputTokens, output: outputTokens },
      scraped: { title: scraped.title, brand: scraped.brand, price: scraped.price, currency: scraped.currency }
    })
  };
}
