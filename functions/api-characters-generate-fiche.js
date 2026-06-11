/**
 * Netlify Function: genera la ficha de un PERSONAJE/ACTOR usando OpenAI Vision
 * (gpt-4o detail:low) desde fotos de referencia + contexto de marca.
 *
 * Espejo de api-places-generate-fiche pero para brand_characters + character_images.
 * SOLO fotos (un personaje se define por su referencia visual, no por una URL).
 *
 * Schema personajes:
 *  - tipo_personaje, nombre_personaje, descripcion_personaje
 *  - rasgos_personalidad, caracteristicas_visuales, vestuario_y_estilo
 *  - rol_narrativo, tono_de_voz, casos_de_uso, diferenciadores
 *  - NO precio, NO direccion (un personaje no se compra ni tiene ubicacion)
 *
 * POST body: { character_id, organization_id, image_urls }
 */

const {
  corsHeaders, getSupabaseEnv, requireAuth, supabaseRest, assertOrgMember, checkBodySize
} = require('./lib/ai-shared');

const PRICE_INPUT_PER_1M = 2.50;
const PRICE_OUTPUT_PER_1M = 10.00;
const USD_PER_CREDIT = 1.0;
const MODEL = 'gpt-4o';
const MAX_IMAGES = 10;
const MAX_OUTPUT_TOKENS = 900;

const CHARACTER_TYPE_ENUM = [
  'mascota', 'vocero', 'modelo', 'influencer',
  'personaje_animado', 'empleado_ficticio', 'cliente_ideal',
  'narrador', 'otro'
];

const SYSTEM_PROMPT = [
  'Sos un extractor de fichas de PERSONAJES/ACTORES que protagonizan contenido de marca (mascotas, voceros, modelos, influencers, personajes animados, etc.).',
  'Miras imagenes de referencia del personaje y devolves un JSON estructurado con lo que detectas + lo que infieres con cautela del contexto de marca.',
  'Idioma: espanol SIN acentos agudos en vocales (escribi "rapido", no "rápido"). Manten enie (ñ).',
  'REGLA #1 — NO INVENTAR: el brand context describe a la marca cliente, NO al personaje que estas describiendo. Solo describi el PERSONAJE que ves en las imagenes. Si ves un perro, el personaje es una mascota perro — aunque la marca sea de tecnologia. Si las imagenes son insuficientes, devolve nombre_personaje="Personaje no identificado" y arrays vacios. NUNCA construyas un personaje ficticio que calce con la marca.',
  'CARACTERISTICAS_VISUALES: rasgos fisicos observables (color de pelo/pelaje, complexion, rasgos faciales, altura aparente, edad aparente). Maximo 6 items.',
  'RASGOS_PERSONALIDAD: personalidad que transmite el personaje (carismatico, serio, juguepton, confiable, rebelde). Inferido de pose/expresion/estilo. Maximo 6 items.',
  'VESTUARIO_Y_ESTILO: ropa, accesorios y estetica visible (casual, formal, deportivo, colores dominantes). Maximo 6 items.',
  'ROL_NARRATIVO: como funciona el personaje en la produccion (protagonista, guia/mentor, testimonio de cliente, demostrador de producto, mascota de marca). Maximo 4 items.',
  'TONO_DE_VOZ: como hablaria el personaje si tuviera voz (cercano, autoritario, divertido, aspiracional). Maximo 4 items.',
  'Tono: ajustate al verbal_dna y arquetipo de la marca SOLO para el lenguaje, NUNCA para reinterpretar QUIEN es el personaje.',
  'Concision: descripcion 60-120 palabras, items de arrays 3-12 palabras cada uno.'
].join(' ');

const FICHE_SCHEMA = {
  name: 'character_fiche',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'tipo_personaje', 'nombre_personaje', 'descripcion_personaje',
      'rasgos_personalidad', 'caracteristicas_visuales', 'vestuario_y_estilo',
      'rol_narrativo', 'tono_de_voz', 'casos_de_uso', 'diferenciadores'
    ],
    properties: {
      tipo_personaje: {
        type: 'string', enum: CHARACTER_TYPE_ENUM,
        description: 'Categoria del personaje. Elegi la mas especifica. Si nada calza, "otro".'
      },
      nombre_personaje: { type: 'string', description: 'Nombre del personaje. Sin acentos. Max 200 chars.' },
      descripcion_personaje: { type: 'string', description: 'Descripcion narrativa 60-120 palabras en el tono de la marca. Sin acentos.' },
      rasgos_personalidad: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Personalidad que transmite (carismatico, serio, juguepton, etc.).' },
      caracteristicas_visuales: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Rasgos fisicos observables.' },
      vestuario_y_estilo: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Ropa, accesorios y estetica visible.' },
      rol_narrativo: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Como funciona en la produccion (protagonista, mentor, testimonio, etc.).' },
      tono_de_voz: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Como hablaria (cercano, autoritario, divertido, etc.).' },
      casos_de_uso: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Tipos de contenido donde encaja el personaje.' },
      diferenciadores: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Que hace memorable a este personaje.' }
    }
  }
};

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

function fail(event, status, message, extra = {}) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ error: message, ...extra }) };
}

// ─── Handler ────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try { return await handlerImpl(event); }
  catch (err) {
    console.error('[characters-fiche] Unhandled:', err?.stack || err);
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

  const characterId = String(body.character_id || '').trim();
  const organizationId = String(body.organization_id || '').trim();
  const imageUrls = Array.isArray(body.image_urls)
    ? body.image_urls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, MAX_IMAGES)
    : [];

  if (!characterId || !organizationId) return fail(event, 400, 'character_id y organization_id requeridos');
  if (imageUrls.length === 0) return fail(event, 400, 'Se requiere al menos una imagen (image_urls)');

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return fail(event, 500, e.message); }

  try { await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id }); }
  catch (e) { return fail(event, e.statusCode || 403, e.message); }

  // Verificar que el personaje pertenece a la org (via entity)
  const characters = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_characters',
    searchParams: { select: 'id,entity_id', id: `eq.${characterId}` }
  });
  const character = characters?.[0];
  if (!character) return fail(event, 404, 'Personaje no encontrado');
  const entities = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_entities',
    searchParams: { select: 'id,organization_id', id: `eq.${character.entity_id}` }
  });
  const entity = entities?.[0];
  if (!entity || entity.organization_id !== organizationId) return fail(event, 404, 'Personaje no pertenece a la organizacion');

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

  const userContent = [
    { type: 'text', text: `${brandContextText}\n\nGenera la ficha del personaje a partir de las ${imageUrls.length} imagen${imageUrls.length === 1 ? '' : 'es'} de referencia adjuntas.` },
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
          p_source_table: 'brand_characters', p_source_id: characterId,
          p_metadata: { operation: 'character_fiche_generation', model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens, image_count: imageUrls.length }
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

  // PATCH al personaje con la ficha
  const typeFromAi = CHARACTER_TYPE_ENUM.includes(fiche.tipo_personaje) ? fiche.tipo_personaje : 'otro';
  const updates = {
    tipo_personaje: typeFromAi,
    nombre_personaje: String(fiche.nombre_personaje || '').slice(0, 200) || 'Personaje sin nombre',
    descripcion_personaje: String(fiche.descripcion_personaje || '').slice(0, 4000),
    rasgos_personalidad: Array.isArray(fiche.rasgos_personalidad) ? fiche.rasgos_personalidad.slice(0, 12) : [],
    caracteristicas_visuales: Array.isArray(fiche.caracteristicas_visuales) ? fiche.caracteristicas_visuales.slice(0, 12) : [],
    vestuario_y_estilo: Array.isArray(fiche.vestuario_y_estilo) ? fiche.vestuario_y_estilo.slice(0, 12) : [],
    rol_narrativo: Array.isArray(fiche.rol_narrativo) ? fiche.rol_narrativo.slice(0, 8) : [],
    tono_de_voz: Array.isArray(fiche.tono_de_voz) ? fiche.tono_de_voz.slice(0, 8) : [],
    casos_de_uso: Array.isArray(fiche.casos_de_uso) ? fiche.casos_de_uso.slice(0, 8) : [],
    diferenciadores: Array.isArray(fiche.diferenciadores) ? fiche.diferenciadores.slice(0, 8) : [],
  };

  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `brand_characters?id=eq.${characterId}`, method: 'PATCH', body: updates
    });
  } catch (err) { return fail(event, 500, `Error actualizando personaje: ${err.message}`); }

  // INSERT character_images
  const imageRows = imageUrls.map((url, i) => ({
    character_id: characterId, image_url: url,
    image_type: i === 0 ? 'principal' : 'secundaria',
    image_order: i, download_status: 'stored'
  }));
  let imagesInserted = 0, imagesError = null;
  try {
    const inserted = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'character_images', method: 'POST', body: imageRows
    });
    imagesInserted = Array.isArray(inserted) ? inserted.length : imageRows.length;
  } catch (err) {
    imagesError = err.message || String(err);
    console.error('[characters-fiche] character_images insert error:', imagesError);
  }

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      ok: true, character_id: characterId, source: 'photos',
      usd_cost: Number(usdCost.toFixed(6)),
      credits_charged: Number(creditsAmount.toFixed(6)),
      tokens: { input: inputTokens, output: outputTokens, vision_images: imageUrls.length },
      images: { attempted: imageRows.length, inserted: imagesInserted, error: imagesError }
    })
  };
}
