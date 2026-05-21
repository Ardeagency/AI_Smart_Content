/**
 * Netlify Function: genera la ficha de un producto usando OpenAI Vision (gpt-4o detail:low)
 * a partir de imagenes subidas a Supabase Storage + contexto de marca del brand_container.
 *
 * Token economy:
 *  - detail:low = 85 tokens flat por imagen (vs 765 con detail:high)
 *  - response_format = json_schema (strict) — output limpio sin desperdicio en reasoning
 *  - System prompt comprimido, contexto de marca solo con campos relevantes
 *  - max_tokens en respuesta para evitar runaway
 *
 * Costo aproximado (gpt-4o, 3 imagenes, contexto medio):
 *  - Input ~525 tokens × $2.50/1M = $0.0013
 *  - Output ~600 tokens × $10/1M = $0.006
 *  - Total ~$0.007 = 0.07 creditos (con rate 1 credito = $0.10 USD)
 *
 * Cobro: via RPC use_credits_numeric (creditos fraccionales, exact passthrough).
 *
 * POST body: {
 *   product_id: uuid,            // producto placeholder ya creado
 *   organization_id: uuid,
 *   image_urls: string[]         // URLs publicas de Supabase Storage
 * }
 *
 * Respuesta:
 *  { ok, product_id, usd_cost, credits_charged, tokens: { input, output, vision_images } }
 *  o { error }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  supabaseRest,
  assertOrgMember,
  checkBodySize
} = require('./lib/ai-shared');

// gpt-4o pricing (USD por 1M tokens). Actualizar si cambia.
const PRICE_INPUT_PER_1M = 2.50;
const PRICE_OUTPUT_PER_1M = 10.00;
const USD_PER_CREDIT = 0.10;
const MODEL = 'gpt-4o';
const MAX_IMAGES = 10;
const MAX_OUTPUT_TOKENS = 900;

const FICHE_SCHEMA = {
  name: 'product_fiche',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'nombre_producto',
      'descripcion_producto',
      'beneficios_principales',
      'diferenciadores',
      'casos_de_uso',
      'caracteristicas_visuales',
      'materiales_composicion'
    ],
    properties: {
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
  'Concision: descripcion 60-120 palabras, items de arrays 3-12 palabras cada uno.'
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

exports.handler = async (event) => {
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
  const imageUrls = Array.isArray(body.image_urls)
    ? body.image_urls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, MAX_IMAGES)
    : [];

  if (!productId || !organizationId) return fail(event, 400, 'product_id y organization_id requeridos');
  if (imageUrls.length === 0) return fail(event, 400, 'Al menos una imagen es requerida');

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
  const userContent = [
    { type: 'text', text: `${brandContextText}\n\nGenera la ficha del producto a partir de las ${imageUrls.length} imagenes adjuntas.` },
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
  const updates = {
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
      ai_generated_at: new Date().toISOString(),
      ai_usd_cost: usdCost,
      ai_credits_charged: creditsAmount,
      ai_input_tokens: inputTokens,
      ai_output_tokens: outputTokens,
      ai_image_count: imageUrls.length
    }
  };

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
      }
    })
  };
};
