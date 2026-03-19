/**
 * Netlify Function: /api/ai/chat
 *
 * Backend CORE (orquestador):
 * 1) Auth + seguridad (org membership)
 * 2) Guardar mensaje user en ai_messages
 * 3) Context Builder (stub estructurado)
 * 4) Llamar OpenClaw (stub)
 * 5) Guardar mensaje assistant + acciones (ai_chat_actions)
 * 6) Responder { message, actions }
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

async function buildContext({ url, serviceKey, organizationId, conversationId }) {
  // A) últimos 20 mensajes
  const messages = await supabaseRest({
    url,
    serviceKey,
    path: 'ai_messages',
    method: 'GET',
    searchParams: {
      select: 'id,role,content,created_at',
      conversation_id: `eq.${conversationId}`,
      order: 'created_at.desc',
      limit: '20'
    }
  });

  // B) contexto activo
  const chatContext = await supabaseRest({
    url,
    serviceKey,
    path: 'ai_chat_context',
    method: 'GET',
    searchParams: {
      select: 'id,entity_type,entity_id,importance_weight,created_at',
      conversation_id: `eq.${conversationId}`,
      order: 'created_at.desc'
    }
  });

  // C/D/E) datos estructurados (best-effort y acotado)
  // Como la data de negocio aún está brand_container-based, solo preparamos el shape (sin cargar masivo).
  return {
    organization_id: organizationId,
    conversation_history: Array.isArray(messages) ? messages.slice().reverse() : [],
    attached_entities: Array.isArray(chatContext) ? chatContext : [],
    brand: {},
    products: [],
    campaigns: [],
    audiences: [],
    knowledge: []
  };
}

async function openclawStub({ organizationId, message /* , context */ }) {
  // Para pruebas/integración: mensaje fijo (sin markdown demo ni URLs externas).
  return { message: "Hola soy Vera", actions: [] };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Body JSON inválido' })
    };
  }

  const { organization_id, conversation_id, message } = body;
  if (!organization_id || typeof message !== 'string' || !message.trim()) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: 'Faltan organization_id, conversation_id o message'
      })
    };
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

    // Conversation: si no viene, crear una nueva (estado inicial)
    let convId = conversation_id;
    if (convId) {
      // Validar que pertenece a la org (evita mezclar organizaciones)
      const conv = await supabaseRest({
        url: env.url,
        serviceKey: env.serviceKey,
        path: 'ai_conversations',
        method: 'GET',
        searchParams: {
          select: 'id,organization_id',
          id: `eq.${convId}`,
          organization_id: `eq.${organization_id}`,
          limit: '1'
        }
      });
      if (!Array.isArray(conv) || conv.length === 0) {
        return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Conversation not found for organization' }) };
      }
    } else {
      const [createdConv] = await supabaseRest({
        url: env.url,
        serviceKey: env.serviceKey,
        path: 'ai_conversations',
        method: 'POST',
        body: [{
          organization_id,
          user_id: user.id,
          title: 'Nueva conversación'
        }]
      });
      convId = createdConv?.id;
      if (!convId) throw new Error('No se pudo crear conversación');
    }

    // Guardar mensaje user (DB = memoria)
    const [userRow] = await supabaseRest({
      url: env.url,
      serviceKey: env.serviceKey,
      path: 'ai_messages',
      method: 'POST',
      body: [{
        organization_id,
        conversation_id: convId,
        role: 'user',
        content: message
      }]
    });

    // Context builder
    const ctx = await buildContext({
      url: env.url,
      serviceKey: env.serviceKey,
      organizationId: organization_id,
      conversationId: convId
    });

    // OpenClaw (stub)
    const oc = await openclawStub({
      organizationId: organization_id,
      message,
      context: ctx
    });

    // Guardar assistant message
    const [assistantRow] = await supabaseRest({
      url: env.url,
      serviceKey: env.serviceKey,
      path: 'ai_messages',
      method: 'POST',
      body: [{
        organization_id,
        conversation_id: convId,
        role: 'assistant',
        content: oc.message
      }]
    });

    // Guardar acciones
    const actions = Array.isArray(oc.actions) ? oc.actions : [];
    if (assistantRow?.id && actions.length > 0) {
      const rows = actions
        .map((a) => ({
          message_id: assistantRow.id,
          action_type: a.type,
          status: 'completed'
        }));
      try {
        await supabaseRest({
          url: env.url,
          serviceKey: env.serviceKey,
          path: 'ai_chat_actions',
          method: 'POST',
          body: rows
        });
      } catch (_) {
        // non-blocking
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        conversation_id: convId,
        message: oc.message,
        actions
      })
    };
  } catch (e) {
    const status = e.statusCode || 500;
    return { statusCode: status, headers: corsHeaders(), body: JSON.stringify({ error: e.message, at: nowIso() }) };
  }
};
