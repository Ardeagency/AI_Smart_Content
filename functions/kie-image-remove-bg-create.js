/**
 * Netlify Function: quita el fondo de una imagen via kie.ai (Recraft).
 *
 *   1. Auth + validacion.
 *   2. kie.ai createTask con modelo recraft/remove-background + image_url.
 *   3. Cobro: 0.05 cred via use_credits_numeric (Recraft remove-bg es barato).
 *
 * Devuelve { taskId, kie_model, credits_charged } para que el frontend haga
 * polling con kling-video-status?taskId= y al success persista via
 * kie-output-persist (kind=remove-bg).
 *
 * Sin OpenAI ni prompt: la operacion es deterministica.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  checkBodySize
} = require('./lib/ai-shared');

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const CREATE_PATH = '/api/v1/jobs/createTask';
const KIE_MODEL = process.env.KIE_IMAGE_REMOVE_BG_MODEL || 'recraft/remove-background';
const CREDITS_PER_REMOVE_BG = 0.05;

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

async function createKieTask({ headers, imageUrl }) {
  // Payload conservador segun patron kie.ai. Si el modelo exacto requiere
  // otro nombre de campo (p.ej. image_input array), el primer test devolvera
  // el error exacto y ajustamos.
  const payload = {
    model: KIE_MODEL,
    input: {
      image_url: imageUrl
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
        : `Error al crear tarea remove-bg (${res.status})`);
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
      p_credits_amount: CREDITS_PER_REMOVE_BG,
      p_kind: 'tool_call',
      p_usd_cost: CREDITS_PER_REMOVE_BG,
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

  if (!/^https?:\/\//i.test(imageUrl)) return fail(event, 400, 'image_url invalida');
  if (!organizationId) return fail(event, 400, 'organization_id requerido');

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  let kieTaskId;
  try {
    kieTaskId = await createKieTask({ headers: kieHeaders, imageUrl });
  } catch (e) {
    return fail(event, e.httpStatus || 502, `KIE: ${e.message}`, { kieBody: e.kieBody });
  }

  const charge = await chargeCredits({
    env,
    organizationId,
    userId: user.id,
    kieTaskId,
    metadata: {
      operation: 'image_remove_bg',
      kie_task_id: kieTaskId,
      kie_model: KIE_MODEL,
      source_output_id: sourceOutputId
    }
  });
  if (!charge.ok) {
    return fail(event, 402, 'Creditos insuficientes para quitar fondo', {
      taskId: kieTaskId,
      credits_needed: CREDITS_PER_REMOVE_BG
    });
  }

  return {
    statusCode: 200,
    headers: c,
    body: JSON.stringify({
      taskId: kieTaskId,
      kie_model: KIE_MODEL,
      credits_charged: CREDITS_PER_REMOVE_BG
    })
  };
};
