/**
 * Netlify Function: mejora una imagen a 4K via kie.ai (modelo upscale topaz).
 *
 *   1. Auth + validacion.
 *   2. kie.ai createTask con modelo de upscale + image_input.
 *   3. Cobro: 0.20 cred via use_credits_numeric (Topaz es mas caro que nano-banana).
 *
 * Devuelve { taskId, kie_model, credits_charged } para que el frontend haga
 * polling con kling-video-status?taskId= y al success descargue + suba a
 * Storage + inserte en system_ai_outputs.
 *
 * Sin OpenAI: el upscale no requiere prompt, solo la imagen.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  checkBodySize
} = require('./lib/ai-shared');

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const CREATE_PATH = '/api/v1/jobs/createTask';
// Modelo Topaz para upscaling profesional. Si kie.ai usa un slug distinto,
// override via env. El HTML del toolbar tiene data-kie-model="topaz/image-upscale".
const KIE_MODEL = process.env.KIE_IMAGE_UPSCALE_MODEL || 'topaz/image-upscale';
const CREDITS_PER_UPSCALE = 0.20;

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

async function createKieTask({ headers, imageUrl, scale }) {
  const payload = {
    model: KIE_MODEL,
    input: {
      image_url: imageUrl,
      image_input: [imageUrl],
      scale_factor: scale,
      scale: scale,
      output_format: 'png'
    }
  };
  const callBackUrl = process.env.KIE_NANO_CALLBACK_URL || '';
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
        : `Error al crear tarea upscale (${res.status})`);
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

async function chargeCredits({ env, organizationId, userId, kieTaskId, metadata }) {
  const res = await fetch(`${env.url}/rest/v1/rpc/use_credits_numeric`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_organization_id: organizationId,
      p_user_id: userId,
      p_credits_amount: CREDITS_PER_UPSCALE,
      p_kind: 'tool_call',
      p_usd_cost: CREDITS_PER_UPSCALE,
      p_source_table: 'system_ai_outputs',
      p_source_id: kieTaskId,
      p_metadata: metadata
    })
  });
  const out = await res.json().catch(() => null);
  return { ok: res.ok && out !== false, status: res.status, body: out };
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
  const scaleRaw = Number(body.scale || 4);
  const scale = [2, 4].includes(scaleRaw) ? scaleRaw : 4;

  if (!/^https?:\/\//i.test(imageUrl)) return fail(event, 400, 'image_url invalida');
  if (!organizationId) return fail(event, 400, 'organization_id requerido');

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  let kieTaskId;
  try {
    kieTaskId = await createKieTask({ headers: kieHeaders, imageUrl, scale });
  } catch (e) {
    return fail(event, e.httpStatus || 502, `KIE: ${e.message}`, { kieBody: e.kieBody });
  }

  const charge = await chargeCredits({
    env,
    organizationId,
    userId: user.id,
    kieTaskId,
    metadata: {
      operation: 'image_upscale',
      kie_task_id: kieTaskId,
      kie_model: KIE_MODEL,
      scale_factor: scale,
      source_output_id: sourceOutputId
    }
  });
  if (!charge.ok) {
    return fail(event, 402, 'Creditos insuficientes para mejorar la imagen', {
      taskId: kieTaskId,
      credits_needed: CREDITS_PER_UPSCALE
    });
  }

  return {
    statusCode: 200,
    headers: c,
    body: JSON.stringify({
      taskId: kieTaskId,
      kie_model: KIE_MODEL,
      scale_factor: scale,
      credits_charged: CREDITS_PER_UPSCALE
    })
  };
};
