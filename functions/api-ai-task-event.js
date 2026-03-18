/**
 * Netlify Function: /api/ai/task-event
 *
 * Guarda eventos de checklist (task lists) para que la IA los vea
 * en el contexto de la conversación (ai_messages role=system).
 *
 * Entrada:
 * { organization_id, conversation_id, source_message_id, task_index, task_text, checked }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');

function nowIso() {
  return new Date().toISOString();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Body JSON inválido' }) };
  }

  const {
    organization_id,
    conversation_id,
    source_message_id,
    task_index,
    task_text,
    checked
  } = body;

  if (!organization_id || !conversation_id) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Faltan organization_id o conversation_id' }) };
  }

  // Auth: require bearer
  let env;
  try {
    env = getSupabaseEnv();
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };
  }

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid session' }) };
  }

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });

    // Validate conversation belongs to org
    const conv = await supabaseRest({
      url: env.url,
      serviceKey: env.serviceKey,
      path: 'ai_conversations',
      method: 'GET',
      searchParams: {
        select: 'id,organization_id',
        id: `eq.${conversation_id}`,
        organization_id: `eq.${organization_id}`,
        limit: '1'
      }
    });
    if (!Array.isArray(conv) || conv.length === 0) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Conversation not found for organization' }) };
    }

    const payload = {
      type: 'task_toggle',
      source_message_id: source_message_id || null,
      task_index: Number.isFinite(Number(task_index)) ? Number(task_index) : null,
      task_text: typeof task_text === 'string' ? task_text : '',
      checked: !!checked,
      user_id: user.id,
      at: nowIso()
    };

    await supabaseRest({
      url: env.url,
      serviceKey: env.serviceKey,
      path: 'ai_messages',
      method: 'POST',
      body: [{
        organization_id,
        conversation_id,
        role: 'system',
        content: `TASK_EVENT ${JSON.stringify(payload)}`
      }]
    });

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: true })
    };
  } catch (e) {
    const status = e.statusCode || 500;
    return { statusCode: status, headers: corsHeaders(), body: JSON.stringify({ error: e.message, at: nowIso() }) };
  }
};

