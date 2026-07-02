/**
 * Netlify Function: reencuadra una imagen a un ratio destino via kie.ai
 * (nano-banana-pro), EXTENDIENDO la escena (outpaint) en vez de recortar.
 *
 *   1. Auth + validacion (image_url + target_aspect_ratio).
 *   2. kie.ai createTask con nano-banana-pro: image_input + aspect_ratio destino
 *      + prompt de extension (no recortar al sujeto, continuar fondo/luz).
 *   3. Pre-check de saldo; cobro real en kie-task-finalize segun el modelo.
 *
 * Devuelve { taskId, kie_model, kind } para que el frontend haga polling y al
 * success persista via kie-output-persist (kind=reframe), igual que remove-bg.
 *
 * Reusa nano-banana (ya integrado): NO es un modelo/API nuevo.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  checkBodySize,
  validateExternalUrl,
  ensureBalanceAtLeast,
  assertOrgMember,
  acquireKieSlot
} = require('./lib/ai-shared');

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const CREATE_PATH = '/api/v1/jobs/createTask';
const KIE_MODEL = process.env.KIE_NANOBANANA_MODEL || 'nano-banana-pro';
// Ratios soportados por nano-banana-pro (mismo set que kie-nano-banana-create).
const ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
// Pre-check: nano-banana-pro es mas caro que recraft. Cobro real en finalize.
const MIN_BALANCE_REFRAME_CRED = Number(process.env.MIN_BALANCE_REFRAME_CRED || 0.20);

// Prompt de outpaint: extender la escena, jamas recortar/recomponer al sujeto.
function buildReframePrompt(targetRatio) {
  return [
    `Reframe this image to a ${targetRatio} aspect ratio by extending (outpainting) the existing scene, NOT cropping it.`,
    'Keep the original subject and composition exactly as they are, fully intact and uncropped.',
    'Only generate the newly revealed areas around the original frame, continuing the background, textures, lighting, shadows and perspective seamlessly so the result looks like a single natural photograph.',
    'Do not add new objects, text or logos. Preserve the original style, color grade and mood.'
  ].join(' ');
}

function fail(event, status, error, extra = {}) {
  return {
    statusCode: status,
    headers: corsHeaders(event),
    body: JSON.stringify({ error, ...extra })
  };
}

function getKieAuthHeaders() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey.trim()}`
  };
}

async function createKieTask({ headers, imageUrl, targetRatio }) {
  const payload = {
    model: KIE_MODEL,
    input: {
      prompt: buildReframePrompt(targetRatio),
      image_input: [imageUrl],
      aspect_ratio: targetRatio,
      output_format: 'png'
    }
  };
  const callBackUrl = process.env.KIE_NANO_CALLBACK_URL || process.env.KIE_VIDEO_CALLBACK_URL || '';
  if (callBackUrl && callBackUrl.startsWith('http')) payload.callBackUrl = callBackUrl.trim();

  const res = await fetch(`${KIE_BASE}${CREATE_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const rawText = await res.text();
  let data = {};
  try { data = rawText ? JSON.parse(rawText) : {}; } catch (_) { /* noop */ }

  if (!res.ok || data.code !== 200) {
    const errMsg = data.msg || data.message || data.error
      || (res.status === 401 ? 'API Key invalida (revisa KIE_API_KEY)'
        : res.status === 402 ? 'Saldo insuficiente en KIE'
        : `Error al crear tarea reframe (${res.status})`);
    const httpStatus = !res.ok ? (res.status >= 400 ? res.status : 502)
      : (data.code >= 400 && data.code < 600 ? data.code : 502);
    const e = new Error(errMsg);
    e.httpStatus = httpStatus;
    e.kieBody = data;
    throw e;
  }
  const taskId = data.data?.taskId;
  if (!taskId) throw new Error('KIE no devolvio taskId');
  return String(taskId);
}

exports.handler = async (event) => {
  const c = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: c, body: '' };
  if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

  const tooBig = checkBodySize(event, 1 * 1024 * 1024);
  if (tooBig) return tooBig;

  const user = await requireAuth(event);
  if (!user) return fail(event, 401, 'No autorizado. Se requiere sesion activa.');

  const kieHeaders = getKieAuthHeaders();
  if (!kieHeaders) return fail(event, 500, 'KIE_API_KEY no configurada en Netlify');

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (_) {
    return fail(event, 400, 'Body JSON invalido');
  }

  const imageUrl = String(body.image_url || '').trim();
  const sourceOutputId = String(body.source_output_id || '').trim() || null;
  const organizationId = String(body.organization_id || '').trim();
  const targetRatio = String(body.target_aspect_ratio || '').trim();

  const urlCheck = validateExternalUrl(imageUrl);
  if (!urlCheck.ok) return fail(event, 400, `image_url invalida: ${urlCheck.reason}`);
  if (!organizationId) return fail(event, 400, 'organization_id requerido');
  if (!ASPECT_RATIOS.has(targetRatio)) {
    return fail(event, 400, `target_aspect_ratio invalido: ${targetRatio || '(vacio)'}`);
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  // El caller debe pertenecer a la org que paga (evita consumo cross-tenant).
  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id });
  } catch (e) {
    return fail(event, e.statusCode || 403, e.message || 'No autorizado para esta organizacion');
  }

  const balance = await ensureBalanceAtLeast({ env, organizationId, minCredits: MIN_BALANCE_REFRAME_CRED });
  if (!balance.ok) {
    return fail(event, 402, 'Creditos insuficientes para reencuadrar', {
      balance: balance.balance,
      required: balance.required || MIN_BALANCE_REFRAME_CRED,
      reason: balance.reason
    });
  }

  let kieTaskId;
  try {
    const slot = await acquireKieSlot({ env }); // governor de tasa KIE (429 = job perdido)
    if (!slot.ok) return fail(event, 429, 'KIE saturado, reintenta en unos segundos', { retryAfterMs: slot.retryAfterMs });
    kieTaskId = await createKieTask({ headers: kieHeaders, imageUrl, targetRatio });
  } catch (e) {
    return fail(event, e.httpStatus || 502, `KIE: ${e.message}`, { kieBody: e.kieBody });
  }

  return {
    statusCode: 200,
    headers: c,
    body: JSON.stringify({
      taskId: kieTaskId,
      kie_model: KIE_MODEL,
      kind: 'image_reframe',
      target_aspect_ratio: targetRatio,
      source_output_id: sourceOutputId
    })
  };
};
