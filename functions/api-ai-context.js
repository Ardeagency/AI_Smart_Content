/**
 * Netlify Function: /api/ai/context
 * Inserta contexto invisible (ai_chat_context) para una conversación.
 *
 * POST body: { organization_id, conversation_id, entity_type, entity_id, importance_weight? }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Método no permitido' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); }
  catch (_) { return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Body JSON inválido' }) }; }

  const { organization_id, conversation_id, entity_type, entity_id, importance_weight } = body;
  if (!organization_id || !conversation_id || !entity_type || !entity_id) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Faltan campos requeridos' }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) }; }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid session' }) };

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });

    // Validar que la conversación pertenece a la org (evita mezclar orgs)
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

    const [row] = await supabaseRest({
      url: env.url,
      serviceKey: env.serviceKey,
      path: 'ai_chat_context',
      method: 'POST',
      body: [{
        conversation_id,
        entity_type,
        entity_id,
        importance_weight: (typeof importance_weight === 'number' ? importance_weight : 1.0)
      }]
    });

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, context: row }) };
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }
};

