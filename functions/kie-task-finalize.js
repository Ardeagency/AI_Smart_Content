/**
 * Netlify Function: cierra el cobro de una tarea kie.ai DESPUES de que
 * polling reporto exito. Lee creditsConsumed de KIE recordInfo y cobra
 * el costo real + OpenAI tokens (si aplica) + markup.
 *
 * Patron premium SaaS (no pre-charge):
 *   1. Frontend dispara create endpoint → KIE acepta task → NO se cobra.
 *   2. Frontend polling hasta success.
 *   3. Frontend llama kie-task-finalize con { taskId, kind, organization_id,
 *      openai_input_tokens?, openai_output_tokens?, openai_model?,
 *      source_output_id? }.
 *   4. Endpoint:
 *      a. Auth + validacion.
 *      b. GET KIE recordInfo?taskId=X → lee creditsConsumed (KIE credits, donde
 *         1 KIE_credit = $0.005 USD verificado en pricing oficial).
 *      c. Calcula total_usd = (creditsConsumed * 0.005) + OpenAI_tokens_usd + markup_per_kind.
 *      d. Cobra via use_credits_numeric (1 cred = $1 USD).
 *      e. Devuelve { credits_charged, cost_breakdown_usd } para que el frontend
 *         lo persista en metadata.cost_breakdown del row insertado.
 *
 * Ventajas:
 *   - Si KIE sube precios manana, cobramos automaticamente el nuevo precio.
 *   - Cero cobro por runs fallidos (KIE no devuelve creditsConsumed si state != success).
 *   - Audit trail tiene el costo real KIE (creditsConsumed), no estimado.
 *
 * Markups por tipo (override via env):
 *   - image_edit:       +$3
 *   - image_fix_text:   +$3
 *   - image_upscale:    +$0 (KIE-only, sin OpenAI)
 *   - image_remove_bg:  +$0 (KIE-only, sin OpenAI)
 *   - video_generated:  +$5
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  checkBodySize,
  assertOrgMember
} = require('./lib/ai-shared');

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const RECORD_INFO_PATH = '/api/v1/jobs/recordInfo';

// 1 KIE credit = $0.005 USD (verificado en pricing oficial de kling-3.0 y seedance-2).
const KIE_CREDIT_TO_USD = Number(process.env.KIE_CREDIT_TO_USD || 0.005);

// OpenAI gpt-4o-mini pricing oficial (Jan 2026).
const OPENAI_INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OPENAI_OUTPUT_USD_PER_TOKEN = 0.60 / 1_000_000;

const MARKUP_BY_KIND = {
  image_edit: Number(process.env.OPENAI_OPS_MARKUP_USD || 3),
  image_fix_text: Number(process.env.OPENAI_OPS_MARKUP_USD || 3),
  image_upscale: 0,
  image_remove_bg: 0,
  image_reframe: 0, // outpaint nano-banana, KIE-only (prompt server-side, sin OpenAI)
  video_generated: Number(process.env.VIDEO_MARKUP_USD || 5)
};

const ALLOWED_KINDS = new Set(Object.keys(MARKUP_BY_KIND));

function fail(event, status, error, extra = {}) {
  return {
    statusCode: status,
    headers: corsHeaders(event),
    body: JSON.stringify({ error, ...extra })
  };
}

function getKieAuthHeaders() {
  const key = process.env.KIE_API_KEY;
  if (!key) return null;
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function fetchKieRecordInfo({ headers, taskId }) {
  const url = `${KIE_BASE}${RECORD_INFO_PATH}?taskId=${encodeURIComponent(taskId)}`;
  const res = await fetch(url, { method: 'GET', headers: { Authorization: headers.Authorization } });
  let data = {};
  try { data = await res.json(); }
  catch (_) { throw Object.assign(new Error('KIE recordInfo no es JSON'), { httpStatus: 502 }); }
  if (res.status !== 200 || data.code !== 200) {
    const msg = data.msg || data.message || `KIE recordInfo HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { httpStatus: res.status >= 400 ? res.status : 502 });
  }
  return data.data || {};
}

async function chargeCredits({ env, organizationId, userId, kieTaskId, creditsAmount, metadata }) {
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
      p_credits_amount: creditsAmount,
      p_kind: 'tool_call',
      p_usd_cost: creditsAmount,
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

  const tooBig = checkBodySize(event, 64 * 1024);
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

  const taskId = String(body.task_id || body.taskId || '').trim();
  const kind = String(body.kind || '').trim();
  const organizationId = String(body.organization_id || '').trim();
  const sourceOutputId = String(body.source_output_id || '').trim() || null;
  const openaiModel = String(body.openai_model || 'gpt-4o-mini').trim();
  const inputTokens = Math.max(0, Number(body.openai_input_tokens || 0));
  const outputTokens = Math.max(0, Number(body.openai_output_tokens || 0));

  if (!taskId) return fail(event, 400, 'task_id requerido');
  if (!ALLOWED_KINDS.has(kind)) return fail(event, 400, `kind invalido. Valores: ${[...ALLOWED_KINDS].join('|')}`);
  if (!organizationId) return fail(event, 400, 'organization_id requerido');

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  // El caller debe pertenecer a la org a la que se le cobran los creditos.
  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id });
  } catch (e) {
    return fail(event, e.statusCode || 403, e.message || 'No autorizado para esta organizacion');
  }

  // Leer creditsConsumed REAL de KIE (post-success).
  let info;
  try { info = await fetchKieRecordInfo({ headers: kieHeaders, taskId }); }
  catch (e) { return fail(event, e.httpStatus || 502, `KIE: ${e.message}`); }

  const state = String(info.state || info.status || '').toLowerCase();
  if (state !== 'success' && state !== 'completed') {
    return fail(event, 409, `KIE task no esta en success (state=${state}). No se puede finalizar.`);
  }

  const creditsConsumed = Number(info.creditsConsumed || info.credits_consumed || 0);
  if (!Number.isFinite(creditsConsumed) || creditsConsumed < 0) {
    return fail(event, 502, 'KIE no devolvio creditsConsumed valido. Reporte a soporte.');
  }

  const kieUsd = creditsConsumed * KIE_CREDIT_TO_USD;
  const openaiUsd = inputTokens * OPENAI_INPUT_USD_PER_TOKEN + outputTokens * OPENAI_OUTPUT_USD_PER_TOKEN;
  const markupUsd = MARKUP_BY_KIND[kind];
  const totalUsd = kieUsd + openaiUsd + markupUsd;
  const creditsAmount = Math.round(totalUsd * 10000) / 10000;

  const breakdown = {
    kie_credits_consumed: creditsConsumed,
    kie_credit_to_usd: KIE_CREDIT_TO_USD,
    kie_usd: Math.round(kieUsd * 10000) / 10000,
    openai_usd: Math.round(openaiUsd * 100000) / 100000,
    openai_input_tokens: inputTokens,
    openai_output_tokens: outputTokens,
    markup_usd: markupUsd
  };

  const charge = await chargeCredits({
    env,
    organizationId,
    userId: user.id,
    kieTaskId: taskId,
    creditsAmount,
    metadata: {
      operation: kind,
      kie_task_id: taskId,
      source_output_id: sourceOutputId,
      openai_model: openaiModel,
      cost_breakdown_usd: breakdown
    }
  });

  if (!charge.ok) {
    // KIE ya hizo el trabajo y cobro a nuestra cuenta. Si el usuario no tiene
    // saldo en ese momento (gastado entre create y finalize en otra operacion),
    // devolvemos 402 pero la operacion ya esta completa en KIE. El frontend
    // mostrara mensaje + insertara el row sin charge (debe verse en credit_usage
    // con balance negativo posible — RPC use_credits_numeric maneja el caso).
    return fail(event, 402, 'Saldo insuficiente al momento de finalizar', {
      credits_needed: creditsAmount,
      cost_breakdown: breakdown
    });
  }

  return {
    statusCode: 200,
    headers: c,
    body: JSON.stringify({
      credits_charged: creditsAmount,
      cost_breakdown: breakdown,
      kie_credits_consumed: creditsConsumed
    })
  };
};
