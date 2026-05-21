/**
 * Netlify Function: genera la ficha de un producto usando OpenAI Vision (gpt-4o detail:low).
 *
 * Acepta 2 modos:
 *   1. Photos: { product_id, organization_id, image_urls[] } — imagenes ya en Supabase Storage
 *   2. URL:    { product_id, organization_id, url }          — scraping + reupload + analisis
 *
 * URL flow: fetch HTML → cheerio parse → extrae JSON-LD Product, OG tags, og:image,
 * fallback a <img> filtrados. Re-uploadea top 3 imagenes a product-images bucket (para
 * permanencia — URLs externas se rompen). Si reupload falla, usa URLs externas directas.
 *
 * Token economy: detail:low = 85 tok/img, json_schema strict, system prompt comprimido,
 * scraped context capado a campos esenciales.
 *
 * Cobro: via RPC use_credits_numeric (creditos fraccionales, 1 credito = $0.10 USD).
 *
 * Respuesta:
 *  { ok, product_id, usd_cost, credits_charged, tokens, images: { attempted, inserted, error },
 *    source: 'photos'|'url', scraped?: { title, brand, price, currency } }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  supabaseRest,
  assertOrgMember,
  checkBodySize
} = require('./lib/ai-shared');

// Scraping con regex pura — sin dependencias externas (cheerio 1.0 es
// ESM-only y bundlearlo desde CJS via Netlify esbuild fallaba con 502).
// Para JSON-LD y meta tags el output suele ser regular y bien formado.

// gpt-4o pricing (USD por 1M tokens). Actualizar si cambia.
const PRICE_INPUT_PER_1M = 2.50;
const PRICE_OUTPUT_PER_1M = 10.00;
const USD_PER_CREDIT = 0.10;
const MODEL = 'gpt-4o';
const MAX_IMAGES = 10;
const MAX_OUTPUT_TOKENS = 900;

const TIPO_PRODUCTO_ENUM = [
  'bebida', 'bebida_alcoholica', 'agua', 'energetica',
  'alimento', 'snack', 'suplemento_alimenticio',
  'cosmetico', 'skincare', 'maquillaje', 'perfume', 'cuidado_cabello', 'cuidado_personal', 'higiene',
  'app', 'electronico', 'smartphone', 'tablet', 'accesorio_tech', 'gadget',
  'ropa', 'calzado', 'accesorio_moda', 'reloj', 'joyeria',
  'suplemento', 'vitamina', 'fitness', 'bienestar', 'salud',
  'hogar', 'decoracion', 'mueble', 'electrodomestico',
  'servicio', 'educacion', 'financiero', 'salud_servicio', 'entretenimiento',
  'libro', 'juego', 'juguete',
  'automotriz', 'deportivo',
  'otro'
];

const FICHE_SCHEMA = {
  name: 'product_fiche',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'tipo_producto',
      'nombre_producto',
      'descripcion_producto',
      'beneficios_principales',
      'diferenciadores',
      'casos_de_uso',
      'caracteristicas_visuales',
      'materiales_composicion',
      'variantes'
    ],
    properties: {
      tipo_producto: {
        type: 'string',
        enum: TIPO_PRODUCTO_ENUM,
        description: 'Categoria principal del producto. Elegi la mas especifica que aplique. Si nada calza, "otro".'
      },
      nombre_producto: {
        type: 'string',
        description: 'Nombre comercial del producto, sin acentos agudos en vocales (a/e/i/o/u limpias). Mantener ñ.'
      },
      descripcion_producto: {
        type: 'string',
        description: 'Descripcion narrativa 60-120 palabras, sin acentos, en el tono de marca dado.'
      },
      beneficios_principales: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 6,
        description: 'Beneficios concretos del producto. Frases cortas. Sin acentos.'
      },
      diferenciadores: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 4,
        description: 'Atributos que lo separan de competidores. Sin acentos.'
      },
      casos_de_uso: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 4,
        description: 'Situaciones / contextos donde el producto se usa. Sin acentos.'
      },
      caracteristicas_visuales: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 6,
        description: 'Descriptores visuales observables en las imagenes (color, forma, textura, packaging). Sin acentos.'
      },
      materiales_composicion: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 6,
        description: 'Materiales / componentes / ingredientes detectables. Si no detectas ninguno, array vacio.'
      },
      variantes: {
        type: 'array',
        maxItems: 20,
        description: 'SOLO incluir si hay EVIDENCIA CLARA de multiples variantes (Schema.org hasVariant, multiples offers con SKUs distintos, opciones color/talla/sabor visibles en imagenes O texto del scraping). Array vacio si es un solo producto sin variaciones. NO inventar.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['nombre_variante', 'color', 'tamano', 'sabor', 'sku', 'precio', 'descripcion_corta', 'imagen_index'],
          properties: {
            nombre_variante: { type: 'string', description: 'Nombre legible: "Rojo M", "Vainilla 250ml", "Edicion Limitada". Sin acentos.' },
            color: { type: ['string', 'null'], description: 'Color si aplica (sin acentos). Null si no aplica.' },
            tamano: { type: ['string', 'null'], description: 'Talla / volumen / tamano (XS/S/M/L, 250ml, 500g). Null si no aplica.' },
            sabor: { type: ['string', 'null'], description: 'Sabor / aroma si aplica. Null si no aplica.' },
            sku: { type: ['string', 'null'], description: 'SKU si esta en el scraping. Null si no se detecto.' },
            precio: { type: ['number', 'null'], description: 'Precio de la variante. Null si no se detecto.' },
            descripcion_corta: { type: ['string', 'null'], description: 'Una linea (max 80 chars) que distinga esta variante. Null si no aporta.' },
            imagen_index: { type: ['integer', 'null'], description: 'Indice (0-based) de la imagen adjunta que muestra esta variante. Null si no es claro.' }
          }
        }
      }
    }
  }
};

const SYSTEM_PROMPT = [
  'Sos un extractor de fichas de producto.',
  'Miras imagenes y devolves un JSON estructurado con lo que detectas + lo que infieres con cautela del contexto de marca.',
  'Idioma: espanol SIN acentos agudos en vocales (escribi "rapido", no "rápido"). Manten enie (ñ) y signos de puntuacion.',
  'No inventes marcas, cifras especificas ni claims medicos. Si algo es genuinamente desconocido, deja el array vacio o usa una descripcion generica.',
  'Tono: ajustate al verbal_dna y arquetipo de la marca. Respeta palabras_prohibidas.',
  'Concision: descripcion 60-120 palabras, items de arrays 3-12 palabras cada uno.',
  'VARIANTES: solo emite el array variantes si EXISTEN de verdad. Evidencia valida = (a) bloque "Variantes detectadas en la pagina" en el scraped context, (b) imagenes que claramente muestran el mismo producto en colores/tallas/sabores distintos, o (c) selector de opciones citado en la descripcion. Si es UN solo producto sin variaciones, variantes=[]. Nunca inventes opciones para "llenar la ficha".'
].join(' ');

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

function fail(event, status, message, extra = {}) {
  return {
    statusCode: status,
    headers: corsHeaders(event),
    body: JSON.stringify({ error: message, ...extra })
  };
}

// ─── URL scraping helpers ───────────────────────────────────────────────

// Decodifica entidades HTML basicas que aparecen en atributos.
function decodeHtmlEntities(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Lee un atributo content de un <meta>. Acepta property|name antes O despues
// de content (algunas paginas invierten el orden). Devuelve null si no hay match.
function readMeta(html, keyValues) {
  for (const [attrName, attrValue] of keyValues) {
    const escVal = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Order 1: <meta property="og:image" content="...">
    let m = html.match(new RegExp(`<meta[^>]+\\b${attrName}=["']${escVal}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i'));
    if (m && m[1]) return decodeHtmlEntities(m[1]);
    // Order 2: <meta content="..." property="og:image">
    m = html.match(new RegExp(`<meta[^>]+\\bcontent=["']([^"']*)["'][^>]+\\b${attrName}=["']${escVal}["']`, 'i'));
    if (m && m[1]) return decodeHtmlEntities(m[1]);
  }
  return null;
}

async function scrapeProductFromUrl(targetUrl) {
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
    // Cap HTML para evitar OOM en functions: 4MB es generoso para una pagina de producto
    if (html.length > 4 * 1024 * 1024) html = html.slice(0, 4 * 1024 * 1024);
  } finally {
    clearTimeout(timeout);
  }

  const result = { title: null, description: null, price: null, currency: null, brand: null, availability: null, images: [] };

  // 1) JSON-LD Product (canonico para e-commerce con SEO decente)
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const jsonLdProducts = [];
  for (const m of jsonLdMatches) {
    const txt = m[1].trim();
    if (!txt) continue;
    try {
      const parsed = JSON.parse(txt);
      const arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if (types.includes('Product')) jsonLdProducts.push(item);
      }
    } catch (_) { /* json malformado, skip */ }
  }

  if (jsonLdProducts.length) {
    const p = jsonLdProducts[0];
    if (p.name) result.title = String(p.name);
    if (p.description) result.description = String(p.description);
    result.brand = typeof p.brand === 'string' ? p.brand : (p.brand?.name || null);
    if (p.image) {
      const imgs = Array.isArray(p.image) ? p.image : [p.image];
      imgs.forEach((img) => {
        if (typeof img === 'string') result.images.push(img);
        else if (img?.url) result.images.push(img.url);
      });
    }
    const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
    if (offer && typeof offer === 'object') {
      result.price = offer.price || offer.lowPrice || null;
      result.currency = offer.priceCurrency || null;
      result.availability = offer.availability || null;
    }

    // Detectar variantes via Schema.org Product.hasVariant[] o multiples offers[]
    // (patron Shopify: un Product con offers[] = array de variantes con su SKU/precio).
    const variants = [];
    if (Array.isArray(p.hasVariant)) {
      for (const v of p.hasVariant.slice(0, 20)) {
        if (!v || typeof v !== 'object') continue;
        const vOffer = Array.isArray(v.offers) ? v.offers[0] : v.offers;
        variants.push({
          variant_name: v.name || v.sku || null,
          sku: v.sku || vOffer?.sku || null,
          price: vOffer?.price || v.price || null,
          currency: vOffer?.priceCurrency || null,
          color: v.color || null,
          size: v.size || null,
          image: typeof v.image === 'string' ? v.image : v.image?.url || null
        });
      }
    } else if (Array.isArray(p.offers) && p.offers.length > 1) {
      // Multiples offers = candidato a variantes (Shopify default)
      for (const o of p.offers.slice(0, 20)) {
        if (!o || typeof o !== 'object') continue;
        variants.push({
          variant_name: o.name || o.sku || null,
          sku: o.sku || null,
          price: o.price || null,
          currency: o.priceCurrency || null,
          color: null,
          size: null,
          image: typeof o.image === 'string' ? o.image : (o.image?.url || null)
        });
      }
    }
    if (variants.length > 1) result.variants = variants;
  }

  // 2) Open Graph y meta tags
  const ogImage = readMeta(html, [['property', 'og:image'], ['name', 'og:image']]);
  if (!result.title) result.title = readMeta(html, [['property', 'og:title']]);
  if (!result.description) result.description = readMeta(html, [['property', 'og:description']]);
  if (!result.price) result.price = readMeta(html, [['property', 'product:price:amount'], ['property', 'og:price:amount']]);
  if (!result.currency) result.currency = readMeta(html, [['property', 'product:price:currency'], ['property', 'og:price:currency']]);
  if (ogImage) result.images.unshift(ogImage);

  // 3) Fallbacks finales
  if (!result.title) {
    const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tm) result.title = decodeHtmlEntities(tm[1].trim()).slice(0, 250);
  }
  if (!result.description) result.description = readMeta(html, [['name', 'description']]);

  // 4) <img> filtrados si necesitamos mas imagenes
  if (result.images.length < 3) {
    const imgRe = /<img\b[^>]*?(?:\bsrc|\bdata-src|\bdata-original|\bdata-lazy-src)=["']([^"']+)["'][^>]*>/gi;
    const candidates = [];
    let mm;
    while ((mm = imgRe.exec(html)) && candidates.length < 25) {
      const src = mm[1];
      if (/^data:/.test(src)) continue;
      if (/icon|logo|sprite|placeholder|pixel|tracker|badge|flag-|cart|menu|favicon|gravatar/i.test(src)) continue;
      // Filtro por width/height inline si vienen
      const fullTag = mm[0];
      const wMatch = fullTag.match(/\bwidth=["']?(\d+)/i);
      const hMatch = fullTag.match(/\bheight=["']?(\d+)/i);
      if (wMatch && parseInt(wMatch[1], 10) < 120) continue;
      if (hMatch && parseInt(hMatch[1], 10) < 120) continue;
      candidates.push(src);
    }
    candidates.forEach((s) => { if (!result.images.includes(s)) result.images.push(s); });
  }

  // Resolver URLs relativas y deduplicar
  const baseUrl = new URL(targetUrl);
  result.images = [...new Set(
    result.images.map((u) => {
      try { return new URL(decodeHtmlEntities(u), baseUrl).toString(); }
      catch (_) { return null; }
    }).filter((u) => u && /^https?:\/\//i.test(u))
  )];

  return result;
}

async function reuploadImageToBucket({ env, sourceUrl, userId, productId, index }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let buffer, contentType;
  try {
    const res = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AISmartContentBot/1.0)' },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!/^image\//.test(contentType)) throw new Error(`No es imagen (${contentType})`);
    buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error('Imagen vacia');
    if (buffer.byteLength > 10 * 1024 * 1024) throw new Error('Imagen >10MB');
  } finally {
    clearTimeout(timeout);
  }

  const extMap = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
  const ext = extMap[contentType] || 'jpg';
  const fileName = `${userId}/${productId}/${Date.now()}_url_${index}.${ext}`;

  const uploadRes = await fetch(`${env.url}/storage/v1/object/product-images/${fileName}`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': contentType,
      'cache-control': '3600',
      'x-upsert': 'false'
    },
    body: Buffer.from(buffer)
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text().catch(() => '');
    throw new Error(`Storage upload HTTP ${uploadRes.status}: ${txt.slice(0, 120)}`);
  }
  return `${env.url}/storage/v1/object/public/product-images/${fileName}`;
}

function buildScrapedSummary(s) {
  if (!s) return '';
  const lines = [];
  if (s.title) lines.push(`Titulo de la pagina: ${String(s.title).slice(0, 240)}`);
  if (s.brand) lines.push(`Marca declarada: ${String(s.brand).slice(0, 120)}`);
  if (s.description) lines.push(`Descripcion en la pagina: ${String(s.description).slice(0, 700)}`);
  if (s.price) lines.push(`Precio: ${s.price}${s.currency ? ' ' + s.currency : ''}`);
  if (s.availability) lines.push(`Disponibilidad: ${String(s.availability).split('/').pop()}`);
  if (Array.isArray(s.variants) && s.variants.length > 1) {
    const varSummary = s.variants.slice(0, 12).map((v, i) => {
      const parts = [];
      if (v.variant_name) parts.push(v.variant_name);
      if (v.color) parts.push(`color: ${v.color}`);
      if (v.size) parts.push(`talla: ${v.size}`);
      if (v.price) parts.push(`$${v.price}${v.currency ? ' ' + v.currency : ''}`);
      if (v.sku) parts.push(`SKU: ${v.sku}`);
      return `  ${i + 1}. ${parts.join(' · ')}`;
    }).join('\n');
    lines.push(`Variantes detectadas en la pagina (${s.variants.length}):\n${varSummary}`);
  }
  return lines.join('\n');
}

// Parsea un precio scrapeado que puede venir como number, "12.99", "1,299.00"
// (formato US), "1.299,00" (formato latino), "$ 12.99", etc. Devuelve numero
// o null si no se pudo. Esquema:
//  - Si hay coma Y punto: el ultimo separador es decimal
//  - Si hay solo coma: si tiene 2 digitos al final, coma=decimal; sino, miles
//  - Si hay solo punto: idem
function parseScrapedPrice(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  // Quitar simbolos de moneda y espacios
  s = s.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // El ultimo separador (mas a la derecha) es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Solo coma: si tras la coma hay exactamente 2 digitos => decimal
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length === 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

exports.handler = async (event) => {
  try {
    return await handlerImpl(event);
  } catch (err) {
    // Catch-all: ningun error sin reportar — el cliente ve detalle, no 502.
    console.error('[generate-fiche] Unhandled error:', err?.stack || err);
    return {
      statusCode: 500,
      headers: corsHeaders(event),
      body: JSON.stringify({
        error: 'Error interno generando ficha',
        detail: err?.message || String(err)
      })
    };
  }
};

async function handlerImpl(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
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

  const productId = String(body.product_id || '').trim();
  const organizationId = String(body.organization_id || '').trim();
  const sourceUrl = typeof body.url === 'string' ? body.url.trim() : null;
  const providedImageUrls = Array.isArray(body.image_urls)
    ? body.image_urls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, MAX_IMAGES)
    : [];

  if (!productId || !organizationId) return fail(event, 400, 'product_id y organization_id requeridos');
  if (!sourceUrl && providedImageUrls.length === 0) {
    return fail(event, 400, 'Se requiere url o image_urls');
  }
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    return fail(event, 400, 'URL invalida');
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return fail(event, 500, e.message); }

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id });
  } catch (e) {
    return fail(event, e.statusCode || 403, e.message);
  }

  // Verificar producto pertenece a la org
  const products = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'products',
    searchParams: { select: 'id,organization_id,brand_container_id,entity_id', id: `eq.${productId}` }
  });
  const product = products?.[0];
  if (!product || product.organization_id !== organizationId) return fail(event, 404, 'Producto no encontrado');

  // ─── Branch URL: scrape + reupload top 3 imagenes ─────────────────────
  let imageUrls = providedImageUrls;
  let scraped = null;
  let scrapedSummary = null;
  let sourceMode = sourceUrl ? 'url' : 'photos';

  if (sourceUrl) {
    try {
      scraped = await scrapeProductFromUrl(sourceUrl);
    } catch (e) {
      return fail(event, 502, `No se pudo leer la pagina: ${e.message}`);
    }
    if (!scraped.title && !scraped.description && scraped.images.length === 0) {
      return fail(event, 422, 'La pagina no expone datos de producto (sin JSON-LD, OG tags ni imagenes utiles)');
    }
    scrapedSummary = buildScrapedSummary(scraped);

    const candidates = (scraped.images || []).slice(0, 3);
    // Paralelizar reuploads — ahorra segundos criticos del timeout de 10s.
    const results = await Promise.allSettled(
      candidates.map((src, i) => reuploadImageToBucket({
        env, sourceUrl: src, userId: user.id, productId, index: i
      }))
    );
    const reuploaded = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) reuploaded.push(r.value);
      else if (r.status === 'rejected') console.warn(`[generate-fiche] reupload skipped (${candidates[i]}):`, r.reason?.message || r.reason);
    });
    // Si todos los reuploads fallaron, intentamos con las URLs externas directas
    // (OpenAI puede fetchearlas si el host las sirve publicas).
    imageUrls = reuploaded.length > 0 ? reuploaded : candidates;
  }

  if (imageUrls.length === 0 && !scrapedSummary) {
    return fail(event, 400, 'Sin imagenes ni contexto extraido');
  }

  // Fetch contexto de marca (brand_container ligado o el mas reciente de la org)
  let brand = null;
  if (product.brand_container_id) {
    const bs = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_containers',
      searchParams: {
        select: 'nombre_marca,nicho_core,propuesta_valor,arquetipo,verbal_dna,palabras_clave,palabras_prohibidas',
        id: `eq.${product.brand_container_id}`
      }
    });
    brand = bs?.[0] || null;
  }
  if (!brand) {
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
  }
  const orgs = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'organizations',
    searchParams: { select: 'name', id: `eq.${organizationId}` }
  });
  const orgName = orgs?.[0]?.name || null;
  const brandContextText = buildBrandContextText(brand, orgName);

  // Construir mensaje OpenAI: text con contexto + N images con detail:low
  const promptParts = [brandContextText];
  if (scrapedSummary) {
    promptParts.push(`\nDATOS EXTRAIDOS DE LA PAGINA DEL PRODUCTO:\n${scrapedSummary}`);
    promptParts.push(`\nGenera la ficha combinando los datos extraidos con lo que veas en las ${imageUrls.length} imagen${imageUrls.length === 1 ? '' : 'es'}. Si la pagina y las imagenes se contradicen, prioriza las imagenes. Adapta tono y vocabulario a la marca (no copies literalmente el texto de la pagina si la marca usa otro registro).`);
  } else {
    promptParts.push(`\nGenera la ficha del producto a partir de las ${imageUrls.length} imagen${imageUrls.length === 1 ? '' : 'es'} adjuntas.`);
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

  // Parsear respuesta
  const rawContent = openaiData.choices?.[0]?.message?.content || '';
  let fiche;
  try { fiche = JSON.parse(rawContent); }
  catch (_) { return fail(event, 500, 'OpenAI devolvio JSON invalido'); }

  // Calcular costo real desde usage tokens
  const usage = openaiData.usage || {};
  const inputTokens = Number(usage.prompt_tokens || 0);
  const outputTokens = Number(usage.completion_tokens || 0);
  const usdCost =
    (inputTokens * PRICE_INPUT_PER_1M / 1_000_000) +
    (outputTokens * PRICE_OUTPUT_PER_1M / 1_000_000);
  const creditsAmount = Math.round((usdCost / USD_PER_CREDIT) * 1_000_000) / 1_000_000; // 6 decimales

  // Cobrar creditos (fraccional via RPC)
  if (creditsAmount > 0) {
    try {
      const chargeRes = await fetch(`${env.url}/rest/v1/rpc/use_credits_numeric`, {
        method: 'POST',
        headers: {
          apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_user_id: user.id,
          p_credits_amount: creditsAmount,
          p_kind: 'tool_call',
          p_usd_cost: usdCost,
          p_source_table: 'products',
          p_source_id: productId,
          p_metadata: {
            operation: 'product_fiche_generation',
            model: MODEL,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            image_count: imageUrls.length
          }
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

  // Actualizar producto con la ficha generada
  const tipoFromAi = TIPO_PRODUCTO_ENUM.includes(fiche.tipo_producto) ? fiche.tipo_producto : 'otro';
  const updates = {
    tipo_producto: tipoFromAi,
    nombre_producto: String(fiche.nombre_producto || '').slice(0, 200) || 'Producto sin nombre',
    descripcion_producto: String(fiche.descripcion_producto || '').slice(0, 4000),
    beneficios_principales: Array.isArray(fiche.beneficios_principales) ? fiche.beneficios_principales.slice(0, 12) : [],
    diferenciadores: Array.isArray(fiche.diferenciadores) ? fiche.diferenciadores.slice(0, 8) : [],
    casos_de_uso: Array.isArray(fiche.casos_de_uso) ? fiche.casos_de_uso.slice(0, 8) : [],
    caracteristicas_visuales: Array.isArray(fiche.caracteristicas_visuales) ? fiche.caracteristicas_visuales.slice(0, 12) : [],
    materiales_composicion: Array.isArray(fiche.materiales_composicion) ? fiche.materiales_composicion.slice(0, 12) : [],
    metadata: {
      ai_generated: true,
      ai_model: MODEL,
      ai_source: sourceMode,
      ai_generated_at: new Date().toISOString(),
      ai_usd_cost: usdCost,
      ai_credits_charged: creditsAmount,
      ai_input_tokens: inputTokens,
      ai_output_tokens: outputTokens,
      ai_image_count: imageUrls.length,
      ...(sourceUrl ? { ai_source_url: sourceUrl, ai_scraped_price: scraped?.price, ai_scraped_currency: scraped?.currency } : {})
    }
  };
  // Precio + moneda desde scraping (URL flow). Para photos no hay datos confiables.
  if (scraped) {
    const parsedPrice = parseScrapedPrice(scraped.price);
    if (parsedPrice != null && parsedPrice > 0) updates.precio_producto = parsedPrice;
    if (typeof scraped.currency === 'string' && /^[A-Z]{3}$/.test(scraped.currency.toUpperCase())) {
      updates.moneda = scraped.currency.toUpperCase();
    }
  }
  if (sourceUrl) updates.url_producto = sourceUrl;

  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `products?id=eq.${productId}`,
      method: 'PATCH',
      body: updates
    });
  } catch (err) {
    return fail(event, 500, `Error actualizando producto: ${err.message}`);
  }

  // Insertar variantes si OpenAI detecto alguna. Normaliza en:
  //   product_options (Color/Tamano/Sabor) ← dimensiones con multiples valores
  //   product_option_values (Rojo/Azul/S/M/L) ← valores unicos por dimension
  //   product_variants ← una row por variante con su precio/sku/imagen
  let variantsInserted = 0;
  let variantsError = null;
  const aiVariants = Array.isArray(fiche.variantes) ? fiche.variantes.filter(Boolean) : [];
  if (aiVariants.length > 0) {
    try {
      // 1) Detectar que dimensiones tienen mas de un valor (Color con multiples valores = dimension util)
      const dims = { color: new Set(), tamano: new Set(), sabor: new Set() };
      for (const v of aiVariants) {
        if (v.color) dims.color.add(String(v.color).trim());
        if (v.tamano) dims.tamano.add(String(v.tamano).trim());
        if (v.sabor) dims.sabor.add(String(v.sabor).trim());
      }
      const activeDims = Object.entries(dims).filter(([_, set]) => set.size > 1);

      // 2) Insert product_options para cada dimension activa
      const optionRows = activeDims.map(([name, _set], i) => ({
        product_id: productId,
        organization_id: organizationId,
        name,
        display_name: { color: 'Color', tamano: 'Tamano', sabor: 'Sabor' }[name] || name,
        position: i
      }));
      let optionsByName = {};
      if (optionRows.length) {
        const inserted = await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'product_options', method: 'POST', body: optionRows
        });
        (inserted || []).forEach((r) => { optionsByName[r.name] = r.id; });

        // 3) Insert product_option_values por dimension
        const valueRows = [];
        for (const [name, set] of activeDims) {
          const optionId = optionsByName[name];
          if (!optionId) continue;
          let pos = 0;
          for (const value of set) {
            valueRows.push({
              option_id: optionId,
              product_id: productId,
              organization_id: organizationId,
              value: value.toLowerCase(),
              display_value: value,
              position: pos++
            });
          }
        }
        if (valueRows.length) {
          await supabaseRest({
            url: env.url, serviceKey: env.serviceKey,
            path: 'product_option_values', method: 'POST', body: valueRows
          });
        }
      }

      // 4) Insert product_variants (una row por variante). imagen_url se resuelve
      //    contra imageUrls[imagen_index] si el indice cae en rango.
      const variantRows = aiVariants.map((v, i) => {
        const imgIdx = Number.isInteger(v.imagen_index) ? v.imagen_index : null;
        const imageUrl = (imgIdx != null && imgIdx >= 0 && imgIdx < imageUrls.length) ? imageUrls[imgIdx] : null;
        const variantPrice = (typeof v.precio === 'number' && v.precio > 0) ? v.precio : (updates.precio_producto || null);
        return {
          product_id: productId,
          organization_id: organizationId,
          variant_name: String(v.nombre_variante || `Variante ${i + 1}`).slice(0, 120),
          sku: v.sku ? String(v.sku).slice(0, 80) : null,
          precio: variantPrice,
          moneda: updates.moneda || 'USD',
          descripcion_variante: v.descripcion_corta ? String(v.descripcion_corta).slice(0, 400) : null,
          imagen_url: imageUrl,
          position: i,
          is_active: true,
          disponible: true
        };
      });
      if (variantRows.length) {
        const inserted = await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'product_variants', method: 'POST', body: variantRows
        });
        variantsInserted = Array.isArray(inserted) ? inserted.length : variantRows.length;
      }
    } catch (err) {
      variantsError = err.message || String(err);
      console.error('[generate-fiche] variants insert error:', variantsError, JSON.stringify(err.details || {}));
    }
  }

  // Insertar product_images (la primera = principal). Si ya existen imagenes del placeholder
  // las dejamos como estan (UPSERT no aplica por unique constraint; usamos INSERT batch).
  const imageRows = imageUrls.map((url, i) => ({
    product_id: productId,
    image_url: url,
    image_type: i === 0 ? 'principal' : 'secundaria',
    image_order: i
  }));
  let imagesInserted = 0;
  let imagesError = null;
  try {
    const inserted = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'product_images',
      method: 'POST',
      body: imageRows
    });
    imagesInserted = Array.isArray(inserted) ? inserted.length : imageRows.length;
  } catch (err) {
    imagesError = err.message || String(err);
    console.error('[generate-fiche] product_images insert error:', imagesError, JSON.stringify(err.details || {}));
  }

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      ok: true,
      product_id: productId,
      source: sourceMode,
      usd_cost: Number(usdCost.toFixed(6)),
      credits_charged: Number(creditsAmount.toFixed(6)),
      tokens: {
        input: inputTokens,
        output: outputTokens,
        vision_images: imageUrls.length
      },
      images: {
        attempted: imageRows.length,
        inserted: imagesInserted,
        error: imagesError
      },
      variants: {
        attempted: aiVariants.length,
        inserted: variantsInserted,
        error: variantsError
      },
      ...(scraped ? {
        scraped: {
          title: scraped.title,
          brand: scraped.brand,
          price: scraped.price,
          currency: scraped.currency,
          image_count_found: scraped.images.length
        }
      } : {})
    })
  };
}
