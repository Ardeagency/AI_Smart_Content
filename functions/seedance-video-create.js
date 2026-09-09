/**
 * Netlify Function: crear tarea de VIDEO en KIE con Seedance 2.5.
 *
 * Es la pieza que le faltaba a /video desde que se armo la pagina: el resto del
 * camino —polling (kling-video-status, poller generico de KIE), persistencia en
 * R2 (kie-output-persist kind 'video') y cobro real (kie-task-finalize kind
 * 'video_generated')— ya existia y estaba probado por Studio.
 *
 * EL CONTRATO ES EL DE LA DOC, no una aproximacion. `bytedance/seedance-2-5`,
 * y en `input`: first_frame_url, last_frame_url, prompt, reference_image_urls,
 * reference_video_urls, reference_audio_urls, generate_audio, resolution,
 * aspect_ratio, duration, output_format, web_search, nsfw_checker. Un campo que
 * KIE no reconoce lo ignora EN SILENCIO —el video sale sin las referencias y
 * nadie se entera hasta verlo—, asi que aqui no se inventa ni un nombre.
 *
 * FRAMES Y REFERENCIAS SE COMBINAN. La doc los declara opcionales e
 * independientes y su ejemplo los manda juntos. La regla de exclusividad que
 * vivio un mes en el frontend venia de Kling.
 *
 * LAS IMAGENES SE DIRIGEN POR @ImageN. El propio ejemplo de la doc lo usa
 * ("Reference @Image1 @Image2 for the character, @Image3 @Image4 for the
 * scene"). Es lo que convierte un bloqueo de producto en una instruccion util:
 * en vez de pedir "no cambies el producto" a ciegas, se le dice CUAL de las
 * imagenes es el producto. Por eso las bloqueadas viajan primero en el array.
 *
 * AQUI YA NO SE COCINA EL PROMPT. Lo forja seedance-forge-prompt en un acto
 * aparte, que el director dispara con el boton «Prompt» y cuyo resultado LEE
 * antes de producir. Cocinar y disparar en la misma llamada significaba que
 * nadie llegaba a ver con que redaccion se produjo, y un video sale caro para
 * descubrirlo despues.
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
/** Doc: el identificador es exacto. Un nombre aproximado devuelve 404. */
const KIE_MODEL = process.env.KIE_SEEDANCE_MODEL || 'bytedance/seedance-2-5';

/** Pre-check estimado. Un video cuesta bastante mas que una imagen. */
const MIN_BALANCE_VIDEO_CRED = Number(process.env.MIN_BALANCE_VIDEO_CRED || 9);

// --- Enums y topes, tal como los publica la doc de Seedance 2.5 -------------
const RESOLUTIONS = new Set(['480p', '720p', '1080p']);
const ASPECT_RATIOS = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']);
const OUTPUT_FORMATS = new Set(['mp4', 'mov']);
/** Range -1..30. -1 = que lo decida el modelo. */
const DURATION_MIN = -1;
const DURATION_MAX = 30;
/** Tope de `prompt` que publica la doc. */
const PROMPT_MAX = 30000;
/**
 * Cupos por grupo. Videos y audios los fija la doc ("the three videos"); el de
 * imagenes es NUESTRO —la doc no publica maximo— y lo promete el sidebar
 * (VideoView.SEEDANCE_REF_LIMITS). Si uno cambia, cambia el otro.
 */
const MAX_REF_IMAGES = Number(process.env.KIE_SEEDANCE_MAX_REF_IMAGES || 9);
const MAX_REF_VIDEOS = 3;
const MAX_REF_AUDIOS = 3;

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

const arr = (v) => (Array.isArray(v) ? v : []);

function pickEnum(value, allowedSet, fallback) {
  const s = value != null ? String(value).trim() : '';
  return allowedSet.has(s) ? s : fallback;
}

/** URLs https validas y no internas; el resto se descarta (no son del usuario). */
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

/** Una sola URL (los frames). Devuelve null si no pasa el filtro. */
function sanitizeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const url = raw.trim();
  return validateExternalUrl(url).ok ? url : null;
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

  // Llega YA FORJADO desde seedance-forge-prompt: es exactamente el texto que
  // el director leyo en pantalla. No se retoca — si lo reescribieramos aqui,
  // lo que se ve y lo que se manda volverian a ser dos cosas distintas.
  const prompt = String(body.prompt || '').trim().slice(0, PROMPT_MAX);
  const organizationId = String(body.organization_id || '').trim();
  if (!prompt) return fail(event, 400, 'El prompt es requerido');
  if (!organizationId) return fail(event, 400, 'organization_id requerido');

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id });
  } catch (e) {
    return fail(event, e.statusCode || 403, e.message || 'No autorizado para esta organizacion');
  }

  const balance = await ensureBalanceAtLeast({ env, organizationId, minCredits: MIN_BALANCE_VIDEO_CRED });
  if (!balance.ok) {
    return fail(event, 402, 'Creditos insuficientes para producir el video', {
      balance: balance.balance,
      required: balance.required || MIN_BALANCE_VIDEO_CRED,
      reason: balance.reason
    });
  }

  // Los bloqueos de marca van PRIMERO en el array: asi son @Image1, @Image2… y
  // el prompt puede nombrarlos. Si el cupo se llena, lo que se pierde es
  // inspiracion de estilo, no la identidad del producto.
  const lockUrls = sanitizeUrls(body.product_lock_urls, MAX_REF_IMAGES);
  const restoImagenes = sanitizeUrls(
    arr(body.reference_image_urls).filter((u) => !lockUrls.includes(u)),
    Math.max(0, MAX_REF_IMAGES - lockUrls.length)
  );
  const referenceImages = [...lockUrls, ...restoImagenes];
  const referenceVideos = sanitizeUrls(body.reference_video_urls, MAX_REF_VIDEOS);
  const referenceAudios = sanitizeUrls(body.reference_audio_urls, MAX_REF_AUDIOS);
  const firstFrame = sanitizeUrl(body.first_frame_url);
  const lastFrame = sanitizeUrl(body.last_frame_url);

  const resolution = pickEnum(body.resolution, RESOLUTIONS, '720p');
  const aspect_ratio = pickEnum(body.aspect_ratio, ASPECT_RATIOS, 'adaptive');
  const output_format = pickEnum(body.output_format, OUTPUT_FORMATS, 'mp4');
  const generate_audio = body.generate_audio !== false;
  const web_search = body.web_search === true;

  const duracionPedida = Number(body.duration);
  const duration = Number.isFinite(duracionPedida)
    ? Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(duracionPedida)))
    : 5;

  // FEAT-036: governor de tasa KIE (20 createTask/10s POR CUENTA; 429 = job perdido).
  const slot = await acquireKieSlot({ env });
  if (!slot.ok) return fail(event, 429, 'KIE saturado, reintenta en unos segundos', { retryAfterMs: slot.retryAfterMs });

  // Los opcionales solo viajan si tienen valor. La doc los ejemplifica como
  // cadena vacia, pero mandar `first_frame_url: ""` es pedirle al modelo que
  // interprete un vacio; omitirlo es decir que no hay.
  const input = { prompt, resolution, aspect_ratio, duration, output_format, generate_audio, web_search };
  if (firstFrame) input.first_frame_url = firstFrame;
  if (lastFrame) input.last_frame_url = lastFrame;
  if (referenceImages.length) input.reference_image_urls = referenceImages;
  if (referenceVideos.length) input.reference_video_urls = referenceVideos;
  if (referenceAudios.length) input.reference_audio_urls = referenceAudios;

  const kiePayload = { model: KIE_MODEL, input };
  const callBackUrl = process.env.KIE_SEEDANCE_CALLBACK_URL || process.env.KIE_VIDEO_CALLBACK_URL;
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
    catch (_) { console.error('seedance-video-create: respuesta no JSON', createRes.status, rawText?.slice(0, 500)); }

    if (!createRes.ok || createData.code !== 200) {
      let errMsg = createData.msg || createData.message || createData.error
        || (createRes.status === 401 ? 'API Key invalida (revisa KIE_API_KEY)'
          : createRes.status === 402 ? 'Saldo insuficiente en KIE'
            : 'Error al crear la tarea');
      // 422 = validacion de parametros. Es el error que delata un campo mal
      // nombrado, y sin el detalle se persigue a ciegas.
      if (Array.isArray(createData.data?.errors) && createData.data.errors.length) {
        const details = createData.data.errors
          .map((e) => (typeof e === 'string' ? e : e.message || e.field || JSON.stringify(e)))
          .join('; ');
        if (details) errMsg += ` — ${details}`;
      }
      console.error('seedance-video-create error:', createRes.status, JSON.stringify(createData));
      const httpStatus = !createRes.ok
        ? (createRes.status >= 400 ? createRes.status : 502)
        : (createData.code >= 400 && createData.code < 600 ? createData.code : 502);
      return fail(event, httpStatus, errMsg, { code: createData.code, failMsg: errMsg, kieStatus: createRes.status });
    }

    const taskId = createData.data?.taskId;
    if (!taskId) return fail(event, 502, 'KIE no devolvio taskId', { failMsg: 'No taskId en respuesta' });

    // NO se cobra aqui. kie-task-finalize cobra tras el polling leyendo
    // creditsConsumed real de KIE; el frontend le pasa estos tokens de OpenAI.
    return {
      statusCode: 200,
      headers: c,
      body: JSON.stringify({
        taskId: String(taskId),
        prompt,
        kie_model: KIE_MODEL,
        kind: 'video_generated',
        reference_count: referenceImages.length + referenceVideos.length + referenceAudios.length,
        technical_params: { resolution, aspect_ratio, duration, output_format, generate_audio, web_search }
      })
    };
  } catch (err) {
    console.error('seedance-video-create error:', err);
    return fail(event, 500, err?.message || 'Error al crear la tarea de video');
  }
};
