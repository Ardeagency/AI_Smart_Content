/**
 * Netlify Function: /api/flow-stage
 *
 * Avanza un run de flujo SECUENCIAL (UGC) tras una decision humana en el canvas
 * de Studio. Cada etapa (guion -> imagenes -> video) se pausa esperando aprobacion;
 * esta funcion aplica la decision y dispara la siguiente etapa.
 *
 * Acciones:
 *  - approve / edit : rpc_advance_run_stage (registra decision + avanza el run);
 *      si hay siguiente modulo, POST a su webhook con el contexto + la salida aprobada.
 *  - regenerate     : deduct_credits_for_run + re-POST al webhook del modulo ACTUAL.
 *
 * Las URLs de webhook se derivan server-side desde flow_modules (no se confia en el
 * cliente). Body: { organization_id, run_id, from_order, action, approved_output_id,
 *                   edits, context, cost }
 * Respuesta: { ok, data } | { ok, error }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  assertOrgMember,
  supabaseRest,
} = require('./lib/ai-shared');

const ACTIONS = new Set(['approve', 'edit', 'regenerate']);

function bad(event, status, error) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ ok: false, error }) };
}
function ok(event, data) {
  return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify({ ok: true, data }) };
}

// POST best-effort al webhook de una etapa (no rompe el avance si la etapa aun no
// esta modernizada / responde error).
async function postStageWebhook(webhookUrl, body) {
  if (!webhookUrl) return { posted: false, reason: 'no_webhook_url' };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { posted: true, status: res.status };
  } catch (e) {
    return { posted: false, reason: String(e && e.message || e) };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return bad(event, 405, 'method_not_allowed');

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); }
  catch (_) { return bad(event, 400, 'invalid_json'); }

  const {
    organization_id, run_id, action,
    from_order, approved_output_id,
    edits = {}, context = {}, cost,
  } = body || {};

  if (!organization_id || !run_id || !action) return bad(event, 400, 'missing_required_fields');
  if (!ACTIONS.has(action)) return bad(event, 403, `action_not_allowed:${action}`);
  const fromOrder = Number(from_order);
  if (!Number.isInteger(fromOrder) || fromOrder < 1) return bad(event, 400, 'invalid_from_order');

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return bad(event, 500, e.message); }

  const accessToken = getBearerToken(event);
  if (!accessToken) return bad(event, 401, 'missing_bearer_token');
  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return bad(event, 401, 'invalid_session');
  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });
  } catch (e) {
    return bad(event, e.statusCode || 403, e.message || 'org_member_check_failed');
  }

  // El run debe pertenecer a la org (no confiar en el cliente).
  const runRows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'flow_runs', method: 'GET',
    searchParams: { id: `eq.${run_id}`, organization_id: `eq.${organization_id}`, select: 'id,flow_id' },
  });
  const run = Array.isArray(runRows) ? runRows[0] : null;
  if (!run) return bad(event, 404, 'run_not_found');

  try {
    if (action === 'regenerate') {
      // Cobrar de nuevo (modelo Sessions) y re-disparar el modulo actual.
      const dr = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: 'rpc/deduct_credits_for_run', method: 'POST',
        body: { p_organization_id: organization_id, p_user_id: user.id, p_run_id: run_id, p_amount: Number(cost) || 5 },
      });
      if (dr && dr.success === false) return bad(event, 402, dr.error_message || 'insufficient_credits');
      const mods = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: 'flow_modules', method: 'GET',
        searchParams: { content_flow_id: `eq.${run.flow_id}`, step_order: `eq.${fromOrder}`, select: 'webhook_url_prod' },
      });
      const webhook = Array.isArray(mods) && mods[0] ? mods[0].webhook_url_prod : null;
      const fired = await postStageWebhook(webhook, { ...(context || {}), meta: { run_id } });
      return ok(event, { action: 'regenerate', step_order: fromOrder, fired });
    }

    // approve / edit: avanzar el run y, si hay siguiente modulo, dispararlo.
    const adv = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'rpc/rpc_advance_run_stage', method: 'POST',
      body: {
        p_run_id: run_id, p_from_order: fromOrder,
        p_approved_output_id: approved_output_id || null,
        p_edits: edits || {},
      },
    });
    if (adv && adv.done) return ok(event, { done: true });

    const next = adv && adv.next_module ? adv.next_module : null;
    if (!next) return ok(event, { done: false, next_module: null });

    const nextBody = {
      ...(context || {}),
      meta: { run_id },
      prev_stage: { order: fromOrder, approved_output_id: approved_output_id || null, edits: edits || {} },
    };
    const fired = await postStageWebhook(next.webhook_url_prod, nextBody);
    return ok(event, { done: false, next_module: next, fired });
  } catch (e) {
    return bad(event, 500, String(e && e.message || e));
  }
};
