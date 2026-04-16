/**
 * Netlify Function: /api/ai/action
 * Maneja acciones ejecutables (ej. trigger_flow) decididas por Vera/OpenClaw.
 *
 * POST body: { organization_id, conversation_id, action: { type, payload } }
 *
 * Nota: por ahora es un stub. La ejecución real conectará con FlowWebhookService / flow_runs.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  assertOrgMember
} = require('./lib/ai-shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Método no permitido' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); }
  catch (_) { return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Body JSON inválido' }) }; }

  const { organization_id, conversation_id, action } = body;
  if (!organization_id || !conversation_id || !action?.type) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Faltan campos requeridos' }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid session' }) };

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });

    // Stub: devuelve ack. Aquí irá switch(action.type) → runFlow(payload) → flow_run.
    return {
      statusCode: 200,
      headers: corsHeaders(event),
      body: JSON.stringify({
        ok: true,
        status: 'queued',
        action: { type: action.type, payload: action.payload || {} }
      })
    };
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }
};

