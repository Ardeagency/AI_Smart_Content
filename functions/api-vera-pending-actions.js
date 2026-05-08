/**
 * api-vera-pending-actions
 *
 * GET    /api/vera/pending-actions?brand_container_id=...&status=pending
 *        Lista pending_actions de la org/marca, ordenadas por priority desc + created_at desc.
 *
 * POST   /api/vera/pending-actions/:id/approve
 *        Body: {} | Marca status='approved' + dispara ejecución vía ai-engine.
 *
 * POST   /api/vera/pending-actions/:id/reject
 *        Body: { reason?: string }
 *
 * Headers: Authorization: Bearer {supabase_access_token}
 *
 * Auth: verifica que el user es miembro de la org dueña del brand_container de la action.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember,
  logUserAudit,
} = require('./lib/ai-shared');

async function assertActionAccess({ env, accessToken, actionId }) {
  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) { throw Object.assign(new Error('Invalid session'), { statusCode: 401 }); }

  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'vera_pending_actions', method: 'GET',
    searchParams: { select: 'id,status,organization_id,brand_container_id,action_type,target_id,proposed_payload', id: `eq.${actionId}`, limit: '1' }
  });
  const action = Array.isArray(rows) ? rows[0] : null;
  if (!action) { throw Object.assign(new Error('Action not found'), { statusCode: 404 }); }

  await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: action.organization_id, userId: user.id });
  return { user, action };
}

async function listPendingActions({ env, accessToken, qs }) {
  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) { throw Object.assign(new Error('Invalid session'), { statusCode: 401 }); }

  const brandContainerId = qs?.brand_container_id;
  const status = qs?.status || 'pending';
  if (!brandContainerId) { throw Object.assign(new Error('Missing brand_container_id'), { statusCode: 400 }); }

  // Verify user has access to this brand_container's org
  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brandContainerId}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) { throw Object.assign(new Error('Brand container not found'), { statusCode: 404 }); }
  if (bc.user_id !== user.id) {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: bc.organization_id, userId: user.id });
  }

  const actions = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'vera_pending_actions', method: 'GET',
    searchParams: {
      select: 'id,action_type,target_table,target_id,proposed_payload,vera_reasoning,vera_confidence,impact_estimate,priority,status,expires_at,created_at',
      brand_container_id: `eq.${brandContainerId}`,
      status: `eq.${status}`,
      order: 'priority.desc,created_at.desc',
      limit: '50'
    }
  });

  return { ok: true, actions: Array.isArray(actions) ? actions : [] };
}

async function approveAction({ env, event, accessToken, actionId }) {
  const { user, action } = await assertActionAccess({ env, accessToken, actionId });

  if (action.status !== 'pending') {
    throw Object.assign(new Error(`Action status is "${action.status}", solo 'pending' puede aprobarse`), { statusCode: 409 });
  }

  // Marcar approved (action_executor del ai-engine la pickeará vía mission_generation)
  await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'vera_pending_actions', method: 'PATCH',
    searchParams: { id: `eq.${actionId}` },
    body: [{
      status:      'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      updated_at:  new Date().toISOString(),
    }]
  });

  await logUserAudit({
    env, event, user,
    organizationId: action.organization_id,
    action: 'pending_action.approve',
    resourceType: 'vera_pending_actions',
    resourceId: actionId,
    metadata: { action_type: action.action_type, target_table: action.target_table, target_id: action.target_id }
  });

  return { ok: true, status: 'approved', action_id: actionId };
}

async function rejectAction({ env, event, accessToken, actionId, body }) {
  const { user, action } = await assertActionAccess({ env, accessToken, actionId });

  if (action.status !== 'pending') {
    throw Object.assign(new Error(`Action status is "${action.status}", solo 'pending' puede rechazarse`), { statusCode: 409 });
  }

  const reason = (body?.reason || '').toString().slice(0, 500) || null;

  await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'vera_pending_actions', method: 'PATCH',
    searchParams: { id: `eq.${actionId}` },
    body: [{
      status:           'rejected',
      rejected_at:      new Date().toISOString(),
      rejected_by:      user.id,
      rejection_reason: reason,
      updated_at:       new Date().toISOString(),
    }]
  });

  await logUserAudit({
    env, event, user,
    organizationId: action.organization_id,
    action: 'pending_action.reject',
    resourceType: 'vera_pending_actions',
    resourceId: actionId,
    metadata: { action_type: action.action_type, reason }
  });

  return { ok: true, status: 'rejected', action_id: actionId };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };

  const path = (event.path || '').replace(/\/+$/, '');
  // Path examples:
  //   /api/vera/pending-actions
  //   /api/vera/pending-actions/{id}/approve
  //   /api/vera/pending-actions/{id}/reject
  const m = path.match(/\/api\/vera\/pending-actions(?:\/([^/]+)\/(approve|reject))?$/);
  const actionId = m?.[1];
  const op = m?.[2];

  try {
    if (event.httpMethod === 'GET' && !op) {
      const result = await listPendingActions({ env, accessToken, qs: event.queryStringParameters || {} });
      return { statusCode: 200, headers: { ...corsHeaders(event), 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    }
    if (event.httpMethod === 'POST' && actionId && op === 'approve') {
      const result = await approveAction({ env, event, accessToken, actionId });
      return { statusCode: 200, headers: { ...corsHeaders(event), 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    }
    if (event.httpMethod === 'POST' && actionId && op === 'reject') {
      let body = {};
      try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}
      const result = await rejectAction({ env, event, accessToken, actionId, body });
      return { statusCode: 200, headers: { ...corsHeaders(event), 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    }
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed for this path' }) };
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }
};
