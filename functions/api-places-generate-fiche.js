/**
 * Netlify Function: genera la ficha de un LUGAR FISICO usando OpenAI Vision
 * (gpt-4o detail:low) desde fotos del lugar O URL + contexto de marca.
 *
 * Espejo de api-products-generate-fiche pero para brand_places + place_images.
 *
 * Schema lugares:
 *  - place_type, nombre_lugar, descripcion_lugar
 *  - address, city, country
 *  - ambiente_y_vibra (sensaciones), amenidades (wifi, parking, etc.)
 *  - beneficios, diferenciadores, casos_de_uso, caracteristicas_visuales
 *  - NO variantes, NO precio (los lugares no se compran, se visitan)
 *
 * POST body: { place_id, organization_id, image_urls? OR url? }
 */

const {
  corsHeaders, getSupabaseEnv, requireAuth, supabaseRest, assertOrgMember, checkBodySize
} = require('./lib/ai-shared');
const crypto = require('crypto');

const PRICE_INPUT_PER_1M = 2.50;
const PRICE_OUTPUT_PER_1M = 10.00;
const USD_PER_CREDIT = 1.0;
const MODEL = 'gpt-4o';
const MAX_IMAGES = 10;
const MAX_OUTPUT_TOKENS = 900;
const BUCKET = 'place-images';

const PLACE_TYPE_ENUM = [
  'tienda', 'showroom', 'restaurante', 'cafe', 'bar',
  'oficina', 'sede_corporativa', 'sucursal',
  'sala_eventos', 'centro_capacitacion',
  'gimnasio', 'spa', 'hotel',
  'clinica', 'consultorio', 'farmacia',
  'taller', 'almacen', 'fabrica',
  'centro_comercial', 'mercado', 'parque',
  'estudio', 'galeria', 'museo',
  'otro'
];

const SYSTEM_PROMPT = [
  'Sos un extractor de fichas de LUGARES FISICOS (tiendas, restaurantes, oficinas, hoteles, clinicas, etc.).',
  'Miras imagenes y devolves un JSON estructurado con lo que detectas + lo que infieres con cautela del contexto de marca.',
  'Idioma: espanol SIN acentos agudos en vocales (escribi "rapido", no "rápido"). Manten enie (ñ).',
  'REGLA #1 — NO INVENTAR: el brand context describe a la marca cliente, NO al lugar que estas describiendo ahora. Solo describi el LUGAR que ves en las imagenes/datos. Si imagenes muestran un cafe, el lugar es un cafe — aunque la marca sea de electronica. Si los datos son insuficientes, devolve nombre_lugar="Lugar no identificado" y arrays vacios. NUNCA construyas un lugar ficticio que calce con la marca.',
  'AMBIENTE_Y_VIBRA: sensaciones que transmite el lugar (acogedor, energetico, minimalista, industrial, romantico, familiar). Maximo 6 items.',
  'AMENIDADES: servicios y comodidades CONCRETAS visibles o mencionadas (wifi, parking, terraza, aire acondicionado, accesibilidad, mascotas permitidas, etc.). NO inferir si no hay evidencia.',
  'ADDRESS/CITY/COUNTRY: solo si estan en los datos scrapeados o claramente visibles en letreros de las imagenes. NO los inventes ni los infieras del brand context. Si no hay evidencia, null.',
  'Tono: ajustate al verbal_dna y arquetipo de la marca SOLO para el lenguaje, NUNCA para reinterpretar QUE es el lugar.',
  'Concision: descripcion 60-120 palabras, items de arrays 3-12 palabras cada uno.'
].join(' ');

const FICHE_SCHEMA = {
  name: 'place_fiche',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'place_type', 'nombre_lugar', 'descripcion_lugar',
      'address', 'city', 'country',
      'beneficios_principales', 'diferenciadores', 'casos_de_uso',
      'caracteristicas_visuales', 'ambiente_y_vibra', 'amenidades'
    ],
    properties: {
      place_type: {
        type: 'string', enum: PLACE_TYPE_ENUM,
        description: 'Categoria principal del lugar. Elegi la mas especifica. Si nada calza, "otro".'
      },
      nombre_lugar: { type: 'string', description: 'Nombre comercial del lugar. Sin acentos. Max 200 chars.' },
      descripcion_lugar: { type: 'string', description: 'Descripcion narrativa 60-120 palabras en el tono de la marca. Sin acentos.' },
      address: { type: ['string', 'null'], description: 'Direccion exacta si esta en datos scrapeados o letreros visibles. Null si no hay evidencia.' },
      city: { type: ['string', 'null'], description: 'Ciudad si hay evidencia. Null si no.' },
      country: { type: ['string', 'null'], description: 'Pais si hay evidencia. Null si no.' },
      beneficios_principales: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Que gana el cliente al visitar el lugar.' },
      diferenciadores: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Que separa este lugar de competidores.' },
      casos_de_uso: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Momentos/situaciones para visitar el lugar.' },
      caracteristicas_visuales: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Lo que se ve al entrar (color paredes, mobiliario, layout, iluminacion).' },
      ambiente_y_vibra: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Sensaciones del espacio (acogedor, energetico, minimalista, etc.).' },
      amenidades: { type: 'array', items: { type: 'string' }, maxItems: 8, description: 'Servicios concretos disponibles (wifi, parking, terraza, etc.). NO inventar.' }
    }
  }
};

// ─── Helpers (copiados de productos — TODO: extraer a lib/scraping-shared) ───

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

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const map = [
      [/google\.com\/maps|maps\.google/, 'Google Maps'],
      [/tripadvisor\./, 'TripAdvisor'],
      [/yelp\./, 'Yelp'],
      [/booking\.com/, 'Booking'],
      [/airbnb\./, 'Airbnb'],
      [/foursquare\.com/, 'Foursquare'],
      [/mercadolibre\.|mercadolivre\./, 'Mercado Libre'],
      [/falabella\./, 'Falabella'],
      [/exito\.com/, 'Éxito'],
      [/rappi\./, 'Rappi'],
    ];
    for (const [re, name] of map) if (re.test(host)) return name;
    return host.replace(/^www\./, '').split('.')[0].replace(/^./, (c) => c.toUpperCase());
  } catch (_) { return 'la URL provista'; }
}

function isUsefulScrape(scraped) {
  if (!scraped) return false;
  const title = String(scraped.title || '').trim();
  const desc = String(scraped.description || '').trim();
  const hasImages = Array.isArray(scraped.images) && scraped.images.length > 0;
  const hasStructured = !!scraped.address || !!scraped.brand;
  const genericTitleRe = /^(google maps|tripadvisor|yelp|booking|loading|cargando|404|page not found|access denied|please enable javascript|sign in)\b/i;
  const titleIsGeneric = title && genericTitleRe.test(title);
  if (hasStructured) return true;
  if (hasImages) return true;
  if (desc && desc.length > 30 && !genericTitleRe.test(desc)) return true;
  if (title && !titleIsGeneric && title.length > 5) return true;
  return false;
}

async function scrapePlaceFromUrl(targetUrl) {
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
      signal: controller.signal, redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!/html|xml/i.test(contentType)) throw new Error(`Content-Type no soportado: ${contentType}`);
    html = await res.text();
    if (html.length > 4 * 1024 * 1024) html = html.slice(0, 4 * 1024 * 1024);
  } finally { clearTimeout(timeout); }

  const result = { title: null, description: null, brand: null, address: null, city: null, country: null, phone: null, images: [] };

  // JSON-LD: LocalBusiness, Restaurant, Store, Place, etc.
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if (types.some((t) => /^(LocalBusiness|Restaurant|Store|Place|Organization|Hotel|Cafe|Bar|MedicalBusiness|FoodEstablishment|EntertainmentBusiness|AutomotiveBusiness|HomeAndConstructionBusiness|HealthAndBeautyBusiness)$/.test(t))) {
          if (!result.title && item.name) result.title = String(item.name);
          if (!result.description && item.description) result.description = String(item.description);
          result.brand = result.brand || (typeof item.parentOrganization === 'string' ? item.parentOrganization : item.parentOrganization?.name) || null;
          if (item.address && typeof item.address === 'object') {
            if (!result.address && item.address.streetAddress) result.address = String(item.address.streetAddress);
            if (!result.city && (item.address.addressLocality || item.address.city)) result.city = String(item.address.addressLocality || item.address.city);
            if (!result.country && item.address.addressCountry) result.country = typeof item.address.addressCountry === 'string' ? item.address.addressCountry : item.address.addressCountry.name;
          } else if (item.address && typeof item.address === 'string') {
            if (!result.address) result.address = item.address;
          }
          if (!result.phone && item.telephone) result.phone = String(item.telephone);
          if (item.image) {
            const imgs = Array.isArray(item.image) ? item.image : [item.image];
            imgs.forEach((img) => {
              if (typeof img === 'string') result.images.push(img);
              else if (img?.url) result.images.push(img.url);
            });
          }
        }
      }
    } catch (_) { /* skip */ }
  }

  // OG tags
  const ogImage = readMeta(html, [['property', 'og:image'], ['name', 'og:image']]);
  if (!result.title) result.title = readMeta(html, [['property', 'og:title']]);
  if (!result.description) result.description = readMeta(html, [['property', 'og:description']]);
  if (ogImage) result.images.unshift(ogImage);

  // Fallbacks
  if (!result.title) {
    const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tm) result.title = decodeHtmlEntities(tm[1].trim()).slice(0, 250);
  }
  if (!result.description) result.description = readMeta(html, [['name', 'description']]);

  // <img> fallback
  if (result.images.length < 3) {
    const imgRe = /<img\b[^>]*?(?:\bsrc|\bdata-src|\bdata-original|\bdata-lazy-src|\bdata-flagship-src|\bsrcset)=["']([^"']+)["'][^>]*>/gi;
    const candidates = [];
    let mm;
    while ((mm = imgRe.exec(html)) && candidates.length < 25) {
      let src = mm[1];
      if (src.includes(',') && /\s+\d+w/.test(src)) src = src.split(',').pop().trim().split(/\s+/)[0];
      if (/^data:/.test(src)) continue;
      if (/icon|logo|sprite|placeholder|pixel|tracker|favicon|spinner|chevron|arrow/i.test(src)) continue;
      const fullTag = mm[0];
      const wMatch = fullTag.match(/\bwidth=["']?(\d+)/i);
      if (wMatch && parseInt(wMatch[1], 10) < 120) continue;
      candidates.push(src);
    }
    candidates.forEach((s) => { if (!result.images.includes(s)) result.images.push(s); });
  }

  // Resolve relative URLs + dedup por stem
  const baseUrl = new URL(targetUrl);
  const resolved = result.images.map((u) => {
    try { return new URL(decodeHtmlEntities(u), baseUrl).toString(); }
    catch (_) { return null; }
  }).filter((u) => u && /^https?:\/\//i.test(u));
  const normalizeKey = (url) => {
    try {
      const u = new URL(url);
      u.search = ''; u.hash = '';
      u.pathname = u.pathname.replace(/_(\d+x\d*|x\d+|\d+x|small|medium|large|grande|thumb|thumbnail|original|master|compact)\./i, '.');
      return u.toString().toLowerCase();
    } catch (_) { return url.toLowerCase(); }
  };
  const byKey = new Map();
  for (const u of resolved) {
    const key = normalizeKey(u);
    if (!byKey.has(key)) byKey.set(key, u);
  }
  result.images = [...byKey.values()];

  return result;
}

async function downloadImageWithHash({ sourceUrl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AISmartContentBot/1.0)' },
      signal: controller.signal, redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!/^image\//.test(contentType)) throw new Error(`No es imagen (${contentType})`);
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0) throw new Error('Imagen vacia');
    if (arrayBuf.byteLength > 10 * 1024 * 1024) throw new Error('Imagen >10MB');
    const buffer = Buffer.from(arrayBuf);
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    return { buffer, contentType, hash, sourceUrl };
  } finally { clearTimeout(timeout); }
}

async function uploadBufferToBucket({ env, buffer, contentType, userId, placeId, index }) {
  const extMap = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
  const ext = extMap[contentType] || 'jpg';
  const fileName = `${userId}/${placeId}/${Date.now()}_url_${index}.${ext}`;
  const uploadRes = await fetch(`${env.url}/storage/v1/object/${BUCKET}/${fileName}`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': contentType, 'cache-control': '3600', 'x-upsert': 'false'
    },
    body: buffer
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text().catch(() => '');
    throw new Error(`Storage upload HTTP ${uploadRes.status}: ${txt.slice(0, 120)}`);
  }
  return `${env.url}/storage/v1/object/public/${BUCKET}/${fileName}`;
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
  if (Array.isArray(brand.palabras_clave) && brand.palabras_clave.length) lines.push(`Palabras clave: ${brand.palabras_clave.slice(0, 8).join(', ')}`);
  if (Array.isArray(brand.palabras_prohibidas) && brand.palabras_prohibidas.length) lines.push(`Palabras prohibidas: ${brand.palabras_prohibidas.slice(0, 8).join(', ')}`);
  return lines.join('\n');
}

function buildScrapedSummary(s) {
  if (!s) return '';
  const lines = [];
  if (s.title) lines.push(`Nombre/Titulo: ${String(s.title).slice(0, 240)}`);
  if (s.brand) lines.push(`Marca asociada: ${String(s.brand).slice(0, 120)}`);
  if (s.description) lines.push(`Descripcion: ${String(s.description).slice(0, 800)}`);
  if (s.address) lines.push(`Direccion: ${s.address}`);
  if (s.city) lines.push(`Ciudad: ${s.city}`);
  if (s.country) lines.push(`Pais: ${s.country}`);
  if (s.phone) lines.push(`Telefono: ${s.phone}`);
  return lines.join('\n');
}

function fail(event, status, message, extra = {}) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ error: message, ...extra }) };
}

// ─── Handler ────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try { return await handlerImpl(event); }
  catch (err) {
    console.error('[places-fiche] Unhandled:', err?.stack || err);
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Error interno', detail: err?.message || String(err) }) };
  }
};

async function handlerImpl(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

  const tooBig = checkBodySize(event, 64 * 1024);
  if (tooBig) return tooBig;

  const user = await requireAuth(event);
  if (!user) return fail(event, 401, 'No autorizado');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(event, 500, 'OPENAI_API_KEY no configurada');

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return fail(event, 400, 'Body JSON invalido'); }

  const placeId = String(body.place_id || '').trim();
  const organizationId = String(body.organization_id || '').trim();
  const sourceUrl = typeof body.url === 'string' ? body.url.trim() : null;
  const providedImageUrls = Array.isArray(body.image_urls)
    ? body.image_urls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, MAX_IMAGES)
    : [];

  if (!placeId || !organizationId) return fail(event, 400, 'place_id y organization_id requeridos');
  if (!sourceUrl && providedImageUrls.length === 0) return fail(event, 400, 'Se requiere url o image_urls');
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return fail(event, 400, 'URL invalida');

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return fail(event, 500, e.message); }

  try { await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id }); }
  catch (e) { return fail(event, e.statusCode || 403, e.message); }

  // Verificar place pertenece a la org (via entity)
  const places = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_places',
    searchParams: { select: 'id,entity_id', id: `eq.${placeId}` }
  });
  const place = places?.[0];
  if (!place) return fail(event, 404, 'Lugar no encontrado');
  const entities = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_entities',
    searchParams: { select: 'id,organization_id', id: `eq.${place.entity_id}` }
  });
  const entity = entities?.[0];
  if (!entity || entity.organization_id !== organizationId) return fail(event, 404, 'Lugar no pertenece a la organizacion');

  let imageUrls = providedImageUrls;
  let scraped = null;
  let scrapedSummary = null;
  const sourceMode = sourceUrl ? 'url' : 'photos';

  if (sourceUrl) {
    const platform = detectPlatform(sourceUrl);
    try { scraped = await scrapePlaceFromUrl(sourceUrl); }
    catch (e) {
      return fail(event, 502, `No se pudo leer la pagina de ${platform}: ${e.message}. Intenta con otra URL o sube las fotos del lugar directamente.`, { platform });
    }
    if (!isUsefulScrape(scraped)) {
      return fail(event, 422,
        `El lugar no se pudo obtener desde la pagina de ${platform}. La URL no expone datos del lugar (probablemente requiere JavaScript o tiene anti-bot). Intenta con otra URL del mismo lugar, o sube las fotos directamente.`,
        { platform, scraped_hint: { has_title: !!scraped.title, has_description: !!scraped.description, image_count: scraped.images?.length || 0 } }
      );
    }
    scrapedSummary = buildScrapedSummary(scraped);

    // Pipeline: download → hash dedup → upload uniques (cap 6)
    const candidates = (scraped.images || []).slice(0, 8);
    const downloaded = await Promise.allSettled(candidates.map((src) => downloadImageWithHash({ sourceUrl: src })));
    const seenHashes = new Set();
    const uniques = [];
    downloaded.forEach((r, i) => {
      if (r.status !== 'fulfilled' || !r.value) {
        if (r.status === 'rejected') console.warn(`[places-fiche] download skipped (${candidates[i]}):`, r.reason?.message || r.reason);
        return;
      }
      if (seenHashes.has(r.value.hash)) return;
      seenHashes.add(r.value.hash);
      uniques.push(r.value);
    });
    const toUpload = uniques.slice(0, 6);
    const uploads = await Promise.allSettled(toUpload.map((item, i) => uploadBufferToBucket({
      env, buffer: item.buffer, contentType: item.contentType, userId: user.id, placeId, index: i
    })));
    const reuploaded = [];
    uploads.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) reuploaded.push(r.value);
      else console.warn(`[places-fiche] upload skipped:`, r.reason?.message || r.reason);
    });
    imageUrls = reuploaded.length > 0 ? reuploaded : (uniques.length > 0 ? uniques.map((u) => u.sourceUrl) : candidates.slice(0, 6));
  }

  if (imageUrls.length === 0 && !scrapedSummary) return fail(event, 400, 'Sin imagenes ni contexto extraido');

  // Brand context
  const bs = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers',
    searchParams: {
      select: 'nombre_marca,nicho_core,propuesta_valor,arquetipo,verbal_dna,palabras_clave,palabras_prohibidas',
      organization_id: `eq.${organizationId}`, order: 'updated_at.desc', limit: '1'
    }
  });
  const brand = bs?.[0] || null;
  const orgs = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'organizations', searchParams: { select: 'name', id: `eq.${organizationId}` }
  });
  const orgName = orgs?.[0]?.name || null;
  const brandContextText = buildBrandContextText(brand, orgName);

  const promptParts = [brandContextText];
  if (scrapedSummary) {
    promptParts.push(`\nDATOS EXTRAIDOS DE LA PAGINA DEL LUGAR:\n${scrapedSummary}`);
    promptParts.push(`\nGenera la ficha del lugar combinando los datos extraidos con lo que veas en las ${imageUrls.length} imagen${imageUrls.length === 1 ? '' : 'es'}. Si la pagina y las imagenes se contradicen, prioriza las imagenes para descripcion visual y ambiente, pero usa los datos para address/city/country/nombre.`);
  } else {
    promptParts.push(`\nGenera la ficha del lugar a partir de las ${imageUrls.length} imagen${imageUrls.length === 1 ? '' : 'es'} adjuntas.`);
  }
  const userContent = [
    { type: 'text', text: promptParts.join('\n') },
    ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url, detail: 'low' } }))
  ];

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
        response_format: { type: 'json_schema', json_schema: FICHE_SCHEMA },
        max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.4
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

  if (creditsAmount > 0) {
    try {
      const chargeRes = await fetch(`${env.url}/rest/v1/rpc/use_credits_numeric`, {
        method: 'POST',
        headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_organization_id: organizationId, p_user_id: user.id,
          p_credits_amount: creditsAmount, p_kind: 'tool_call', p_usd_cost: usdCost,
          p_source_table: 'brand_places', p_source_id: placeId,
          p_metadata: { operation: 'place_fiche_generation', model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens, image_count: imageUrls.length }
        })
      });
      const charged = await chargeRes.json();
      if (!chargeRes.ok || charged === false) {
        return fail(event, 402, 'Creditos insuficientes', { usd_cost: usdCost, credits_needed: creditsAmount });
      }
    } catch (err) {
      return fail(event, 500, `Error cobrando creditos: ${err.message}`);
    }
  }

  // PATCH al place con la ficha
  const placeTypeFromAi = PLACE_TYPE_ENUM.includes(fiche.place_type) ? fiche.place_type : 'otro';
  const updates = {
    place_type: placeTypeFromAi,
    nombre_lugar: String(fiche.nombre_lugar || '').slice(0, 200) || 'Lugar sin nombre',
    descripcion_lugar: String(fiche.descripcion_lugar || '').slice(0, 4000),
    beneficios_principales: Array.isArray(fiche.beneficios_principales) ? fiche.beneficios_principales.slice(0, 12) : [],
    diferenciadores: Array.isArray(fiche.diferenciadores) ? fiche.diferenciadores.slice(0, 8) : [],
    casos_de_uso: Array.isArray(fiche.casos_de_uso) ? fiche.casos_de_uso.slice(0, 8) : [],
    caracteristicas_visuales: Array.isArray(fiche.caracteristicas_visuales) ? fiche.caracteristicas_visuales.slice(0, 12) : [],
    ambiente_y_vibra: Array.isArray(fiche.ambiente_y_vibra) ? fiche.ambiente_y_vibra.slice(0, 12) : [],
    amenidades: Array.isArray(fiche.amenidades) ? fiche.amenidades.slice(0, 16) : [],
  };
  if (fiche.address) updates.address = String(fiche.address).slice(0, 300);
  if (fiche.city) updates.city = String(fiche.city).slice(0, 100);
  if (fiche.country) updates.country = String(fiche.country).slice(0, 100);
  if (sourceUrl) updates.url_lugar = sourceUrl;

  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `brand_places?id=eq.${placeId}`, method: 'PATCH', body: updates
    });
  } catch (err) { return fail(event, 500, `Error actualizando lugar: ${err.message}`); }

  // INSERT place_images
  const imageRows = imageUrls.map((url, i) => ({
    place_id: placeId, image_url: url,
    image_type: i === 0 ? 'principal' : 'secundaria',
    image_order: i, download_status: 'stored'
  }));
  let imagesInserted = 0, imagesError = null;
  try {
    const inserted = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'place_images', method: 'POST', body: imageRows
    });
    imagesInserted = Array.isArray(inserted) ? inserted.length : imageRows.length;
  } catch (err) {
    imagesError = err.message || String(err);
    console.error('[places-fiche] place_images insert error:', imagesError);
  }

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      ok: true, place_id: placeId, source: sourceMode,
      usd_cost: Number(usdCost.toFixed(6)),
      credits_charged: Number(creditsAmount.toFixed(6)),
      tokens: { input: inputTokens, output: outputTokens, vision_images: imageUrls.length },
      images: { attempted: imageRows.length, inserted: imagesInserted, error: imagesError },
      ...(scraped ? { scraped: { title: scraped.title, address: scraped.address, city: scraped.city, country: scraped.country, image_count_found: scraped.images.length } } : {})
    })
  };
}
