/**
 * Netlify Function: crear tarea de GENERACION de imagen en KIE (nano-banana-pro).
 *
 * Hermano de kie-image-edit-create / kie-nano-banana-create, con una diferencia
 * que manda en todo el archivo: aqui la imagen NACE. Los otros endpoints exigen
 * una `image_url` de partida porque editan algo que ya existe; este acepta
 * texto solo, y las referencias (si las hay) entran como `image_input` para dar
 * estilo o para bloquear un producto, no como lienzo a modificar.
 *
 * Flujo:
 *   1. Auth + membresia de org + pre-check de saldo (antes de quemar OpenAI/KIE).
 *   2. OpenAI cocina el brief del usuario + la direccion de fotografia en un
 *      prompt final en ingles. Si no hay OPENAI_API_KEY, se arma un prompt
 *      deterministico con las mismas piezas: la pagina no se cae por eso.
 *   3. kie.ai createTask con nano-banana-pro.
 *   4. Devuelve { taskId, prompt, openai_*, kind } — NO cobra. El cobro lo
 *      cierra kie-task-finalize (kind 'image_generated') tras el polling, que
 *      es el patron de todo el resto de operaciones KIE de la casa.
 *
 * Contrato con el frontend (js/views/ImageView.js): los nombres de campo de
 * este body son NUESTROS. Lo que KIE reconoce se arma aqui adentro; un campo
 * que KIE no entiende lo ignora en silencio, asi que el mapeo vive en un solo
 * sitio a proposito.
 */

const {
  requireAuth,
  getSupabaseEnv,
  assertOrgMember,
  ensureBalanceAtLeast,
  acquireKieSlot,
  checkBodySize,
  validateExternalUrl
} = require('./lib/ai-shared');

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const CREATE_PATH = '/api/v1/jobs/createTask';
const KIE_MODEL = process.env.KIE_IMAGE_GEN_MODEL || 'nano-banana-pro';
const OPENAI_MODEL = (process.env.OPENAI_IMAGE_PROMPT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

// Pre-check estimado: nano-banana-pro + refinado OpenAI. Mismo criterio que
// los endpoints hermanos: no se quema OpenAI ni KIE sin saldo.
const MIN_BALANCE_IMAGE_CRED = Number(process.env.MIN_BALANCE_IMAGE_GEN_CRED || 2);

// Enums de nano-banana-pro (identicos a kie-nano-banana-create: si KIE los
// cambia, cambian en los dos o el usuario recibe el error de la API).
const ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto']);
const RESOLUTIONS = new Set(['1K', '2K', '4K']);
const OUTPUT_FORMATS = new Set(['png', 'jpg']);

/**
 * Tope de referencias que viajan a `image_input`. Es un tope NUESTRO,
 * conservador: KIE no documenta el maximo del array y un rechazo llega
 * cuando el usuario ya subio los archivos. La UI promete el mismo numero
 * (ImageView.IMAGE_REF_LIMIT); si uno cambia, cambia el otro.
 */
const MAX_REFERENCE_IMAGES = Number(process.env.KIE_IMAGE_MAX_REFS || 6);

const ALLOWED_ORIGINS = new Set([
  'https://aismartcontent.io', 'https://www.aismartcontent.io',
  'http://localhost:8888', 'http://localhost:8080', 'http://localhost:5173',
  'http://127.0.0.1:8888'
]);
if (process.env.SITE_URL) ALLOWED_ORIGINS.add(process.env.SITE_URL.replace(/\/$/, ''));

function corsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const allow = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : (process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : 'https://aismartcontent.io');
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function fail(event, status, error, extra = {}) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ error, ...extra }) };
}

function getKieAuthHeaders() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) return null;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` };
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function pickEnum(value, allowedSet, fallback) {
  const s = value != null ? String(value).trim() : '';
  return allowedSet.has(s) ? s : fallback;
}

/** URLs https validas y no internas; el resto se descarta en silencio (no son del usuario). */
function sanitizeUrls(list, max) {
  const out = [];
  for (const raw of arr(list)) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!url || out.includes(url)) continue;
    if (!validateExternalUrl(url).ok) continue;
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Traduce la direccion de fotografia a lenguaje de direccion. NO son params de
 * la API: nano-banana-pro solo entiende prompt/aspect/resolution, asi que
 * encuadre, luz y color solo existen si viajan DENTRO del prompt.
 */
function buildPhotographyNarrative(photo) {
  if (!photo || typeof photo !== 'object') return '';
  const parts = [];
  if (photo.shotType) parts.push(`Shot type: ${photo.shotType}.`);
  if (photo.lens) parts.push(`Shot on a ${photo.lens} lens.`);
  if (photo.framing) parts.push(`Framing is ${String(photo.framing).toLowerCase()}.`);
  if (photo.depthOfField) parts.push(`Depth of field: ${photo.depthOfField}.`);
  if (photo.backdrop) parts.push(`Backdrop: ${photo.backdrop}.`);
  if (photo.lightType) parts.push(`Lighting: ${photo.lightType}.`);
  if (photo.contrastLevel) parts.push(`Contrast level: ${photo.contrastLevel}.`);
  if (photo.temperature) parts.push(`Color temperature: ${photo.temperature}.`);
  if (photo.tone) parts.push(`Tone: ${photo.tone}.`);
  if (photo.colorGrade) parts.push(`Color grade: ${photo.colorGrade}.`);
  if (photo.energyLevel) parts.push(`Visual energy: ${photo.energyLevel}.`);
  return parts.length ? 'Photographic direction (use as camera, lighting and color direction):\n' + parts.join(' ') : '';
}

function buildStyleNarrative(direction) {
  if (!direction || typeof direction !== 'object') return '';
  const parts = [];
  if (direction.mood) parts.push(`Visual mood: ${direction.mood}.`);
  if (direction.realism) parts.push(`Realism: ${direction.realism}.`);
  if (direction.finish) parts.push(`Finish: ${direction.finish}.`);
  return parts.length ? parts.join(' ') : '';
}

/** ADN de marca: solo lo que orienta la IMAGEN (visual > verbal). */
function buildBrandVisualText(brandContext) {
  const voice = brandContext?.brand_voice || {};
  const parts = [];
  if (voice.nicho_core) parts.push(`Category: ${String(voice.nicho_core).trim()}`);
  if (voice.arquetipo) parts.push(`Brand personality: ${String(voice.arquetipo).trim()}`);
  if (voice.propuesta_valor) parts.push(`Value proposition: ${String(voice.propuesta_valor).trim()}`);
  if (voice.visual_dna && typeof voice.visual_dna === 'object' && Object.keys(voice.visual_dna).length) {
    parts.push(`Visual DNA: ${JSON.stringify(voice.visual_dna)}`);
  }
  if (arr(voice.palabras_prohibidas).length) parts.push(`Avoid: ${arr(voice.palabras_prohibidas).join(', ')}`);
  return parts.length ? parts.join('. ') : '';
}

function buildCampaignAudienceText(campaign, audience) {
  const parts = [];
  if (campaign) parts.push(`Campaign intent: ${campaign}`);
  if (audience) parts.push(`Target audience: ${audience}`);
  return parts.length ? parts.join('. ') : '';
}

/**
 * Cocina el prompt final. Devuelve tambien los tokens porque kie-task-finalize
 * cobra el costo REAL (KIE + OpenAI + markup) y sin estos numeros el usuario
 * pagaria un estimado.
 */
async function cookPrompt({ apiKey, brief, photoNarrative, styleNarrative, brandText, campaignAudienceText, hasRefs, lockCount }) {
  const bloques = [
    brief ? `Creative brief from the user:\n${brief}` : '',
    brandText ? `Brand context: ${brandText}` : '',
    campaignAudienceText,
    photoNarrative,
    styleNarrative,
    hasRefs
      ? 'Reference images are attached to the generation request. Do not describe them literally; use them as visual guidance.'
      : '',
    lockCount > 0
      ? `${lockCount} of the attached references are PRODUCT LOCK images: the product must be reproduced exactly as shown — same shape, label, colors and proportions. Never redesign it.`
      : ''
  ].filter(Boolean);

  // Sin OpenAI el prompt sigue existiendo: se pierde el pulido, no la pagina.
  const fallback = bloques.join('\n\n');

  if (!apiKey) {
    return { prompt: fallback, inputTokens: 0, outputTokens: 0, model: null };
  }

  const system = [
    'You are an advertising still-photography director writing prompts for an AI image model (nano-banana).',
    'Output ONE final image prompt in English, under 220 words, no explanations, no bullet lists, no preamble.',
    'Describe the frame as a photograph: subject, composition, lens behavior, lighting, surface, color.',
    'Never invent brands, logos or products that are not stated in the brief or visible in the references.',
    'Do not mention that references are attached; write the prompt as the description of the final image.'
  ].join(' ');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.5,
      max_tokens: 500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: bloques.join('\n\n---\n\n') || 'Generate one advertising still-life photograph prompt.' }
      ]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw Object.assign(new Error(data?.error?.message || `OpenAI HTTP ${res.status}`), { httpStatus: 502 });
  }
  const refined = data?.choices?.[0]?.message?.content?.trim();
  const usage = data?.usage || {};
  if (!refined) throw Object.assign(new Error('OpenAI no devolvio un prompt valido'), { httpStatus: 502 });
  return {
    prompt: refined,
    inputTokens: Number(usage.prompt_tokens || 0),
    outputTokens: Number(usage.completion_tokens || 0),
    model: OPENAI_MODEL
  };
}

exports.handler = async (event) => {
  const c = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: c, body: '' };
  if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

  const tooBig = checkBodySize(event, 1024 * 1024);
  if (tooBig) return tooBig;

  const user = await requireAuth(event);
  if (!user) return fail(event, 401, 'No autorizado. Se requiere sesion activa.');

  const kieHeaders = getKieAuthHeaders();
  if (!kieHeaders) {
    return fail(event, 500, 'Configura KIE_API_KEY en Netlify (Dashboard -> Site settings -> Environment variables)');
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return fail(event, 400, 'Body JSON invalido');
  }

  const brief = String(body.prompt || '').trim();
  const organizationId = String(body.organization_id || '').trim();
  if (!brief) return fail(event, 400, 'El prompt es requerido');
  if (!organizationId) return fail(event, 400, 'organization_id requerido');

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id });
  } catch (e) {
    return fail(event, e.statusCode || 403, e.message || 'No autorizado para esta organizacion');
  }

  const balance = await ensureBalanceAtLeast({ env, organizationId, minCredits: MIN_BALANCE_IMAGE_CRED });
  if (!balance.ok) {
    return fail(event, 402, 'Creditos insuficientes para generar la imagen', {
      balance: balance.balance,
      required: balance.required || MIN_BALANCE_IMAGE_CRED,
      reason: balance.reason
    });
  }

  // Los bloqueos de producto van PRIMERO en image_input: si el cupo se llena,
  // lo que se pierde es inspiracion de estilo, no la identidad del producto.
  const lockUrls = sanitizeUrls(body.product_lock_urls, MAX_REFERENCE_IMAGES);
  const restUrls = sanitizeUrls(
    arr(body.reference_images).filter((u) => !lockUrls.includes(u)),
    Math.max(0, MAX_REFERENCE_IMAGES - lockUrls.length)
  );
  const referenceImages = [...lockUrls, ...restUrls];

  const aspect_ratio = pickEnum(body.aspect_ratio, ASPECT_RATIOS, '1:1');
  const resolution = pickEnum(body.resolution, RESOLUTIONS, '2K');
  const output_format = pickEnum(body.output_format, OUTPUT_FORMATS, 'png');

  let cooked;
  try {
    cooked = await cookPrompt({
      apiKey: process.env.OPENAI_API_KEY,
      brief,
      photoNarrative: buildPhotographyNarrative(body.photography),
      styleNarrative: buildStyleNarrative(body.direction),
      brandText: buildBrandVisualText(body.brand_context),
      campaignAudienceText: buildCampaignAudienceText(body.campaign, body.audience),
      hasRefs: referenceImages.length > 0,
      lockCount: lockUrls.length
    });
  } catch (e) {
    return fail(event, e.httpStatus || 502, `OpenAI no pudo preparar el prompt: ${e.message}`);
  }

  // FEAT-036: governor de tasa KIE (20 createTask/10s POR CUENTA; 429 = job perdido).
  const slot = await acquireKieSlot({ env });
  if (!slot.ok) return fail(event, 429, 'KIE saturado, reintenta en unos segundos', { retryAfterMs: slot.retryAfterMs });

  const input = { prompt: cooked.prompt, aspect_ratio, resolution, output_format };
  // Sin referencias es texto->imagen puro: mandar `image_input: []` hace que
  // nano-banana lo trate como edicion de nada y devuelve error de entrada.
  if (referenceImages.length) input.image_input = referenceImages;

  const kiePayload = { model: KIE_MODEL, input };
  const callBackUrl = process.env.KIE_IMAGE_CALLBACK_URL || process.env.KIE_NANO_CALLBACK_URL;
  if (callBackUrl && typeof callBackUrl === 'string' && callBackUrl.startsWith('http')) {
    kiePayload.callBackUrl = callBackUrl.trim();
  }

  try {
    const createRes = await fetch(`${KIE_BASE}${CREATE_PATH}`, {
      method: 'POST',
      headers: kieHeaders,
      body: JSON.stringify(kiePayload)
    });
    const rawText = await createRes.text();
    let createData = {};
    try { createData = rawText ? JSON.parse(rawText) : {}; }
    catch (_) { console.error('kie-image-create: respuesta no JSON', createRes.status, rawText?.slice(0, 500)); }

    if (!createRes.ok || createData.code !== 200) {
      let errMsg = createData.msg || createData.message || createData.error
        || (createRes.status === 401 ? 'API Key invalida (revisa KIE_API_KEY)'
          : createRes.status === 402 ? 'Saldo insuficiente en KIE'
            : 'Error al crear la tarea');
      if (Array.isArray(createData.data?.errors) && createData.data.errors.length) {
        const details = createData.data.errors
          .map((e) => (typeof e === 'string' ? e : e.message || e.field || JSON.stringify(e)))
          .join('; ');
        if (details) errMsg += ` — ${details}`;
      }
      console.error('kie-image-create error:', createRes.status, JSON.stringify(createData));
      const httpStatus = !createRes.ok
        ? (createRes.status >= 400 ? createRes.status : 502)
        : (createData.code >= 400 && createData.code < 600 ? createData.code : 502);
      return fail(event, httpStatus, errMsg, { code: createData.code, failMsg: errMsg, kieStatus: createRes.status });
    }

    const taskId = createData.data?.taskId;
    if (!taskId) return fail(event, 502, 'KIE no devolvio taskId', { failMsg: 'No taskId en respuesta' });

    return {
      statusCode: 200,
      headers: c,
      body: JSON.stringify({
        taskId: String(taskId),
        prompt: cooked.prompt,
        kie_model: KIE_MODEL,
        kind: 'image_generated',
        reference_count: referenceImages.length,
        technical_params: { aspect_ratio, resolution, output_format },
        openai_model: cooked.model,
        openai_input_tokens: cooked.inputTokens,
        openai_output_tokens: cooked.outputTokens
      })
    };
  } catch (err) {
    console.error('kie-image-create error:', err);
    return fail(event, 500, err?.message || 'Error al crear la tarea de imagen');
  }
};
