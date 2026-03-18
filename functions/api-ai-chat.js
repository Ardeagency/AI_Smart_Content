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
  const text = (message || '').trim().toLowerCase();
  let content =
    'Recibido. Cuando OpenClaw esté conectado, podré construir estrategia, ejecutar flows y generar acciones con memoria por organización.';
  let actions = [];

  if (text.includes('flujo') || text.includes('flow') || text.includes('ejecutar')) {
    content = 'Puedo ejecutar un flujo cuando OpenClaw esté conectado. ¿Qué objetivo buscas lograr?';
    actions = [{ type: 'trigger_flow', label: 'Ejecutar flujo', payload: {} }];
  } else if (text.includes('campaña') || text.includes('campaign')) {
    content = 'Perfecto. Para crear la campaña necesito: objetivo, oferta, audiencia y canal. ¿Cuál es el objetivo principal?';
    actions = [{ type: 'trigger_flow', label: 'Ejecutar campaña', payload: { kind: 'campaign' } }];
  } else if (text.includes('hola') || text.includes('ayuda') || text.length < 3) {
    content = [
      '# Demo de Markdown + UI (Vera)',
      '',
      'Este mensaje existe solo para **visualizar** cómo se renderiza todo lo documentado en `MARKDOWN.md`.',
      '',
      '---',
      '',
      '## Énfasis',
      '- **Negrita** / *cursiva* / ***negrita + cursiva*** / ~~tachado~~',
      '',
      '## Listas',
      '- Item con viñeta',
      '- Otro item',
      '1. Paso 1',
      '2. Paso 2',
      '',
      '## Links e imágenes',
      '- Link: [Markdown Guide](https://www.markdownguide.org/basic-syntax/)',
      '- Imagen (si tu URL termina en .png/.jpg/.webp/.svg):',
      'https://placehold.co/900x420/png?text=Vera+Image+Preview',
      '',
      '## Video (hover play)',
      'Pega una URL que termine en `.mp4/.webm/.ogg` para previsualizarla. Ejemplo (si tu CDN lo permite):',
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      '',
      '## Blockquote',
      '> Esto es una cita.',
      '> Puede tener varias líneas.',
      '',
      '## Código',
      'Inline: usa `npm run dev`',
      '',
      '```js',
      'console.log(\"Hola desde Vera\");',
      '```',
      '',
      '## Task Lists (checkboxes)',
      '- [ ] Preparar assets',
      '- [ ] Revisar copy',
      '- [x] Aprobar diseño',
      '',
      '## Botones automáticos (Quick Replies)',
      '```buttons',
      '{',
      '  \"title\": \"¿Confirmas esta acción?\",',
      '  \"buttons\": [',
      '    { \"label\": \"Confirmar\", \"text\": \"Confirmar\", \"variant\": \"primary\" },',
      '    { \"label\": \"Cancelar\", \"text\": \"Cancelar\", \"variant\": \"secondary\" }',
      '  ]',
      '}',
      '```',
      '',
      '## Charts (SVG)',
      '```chart',
      '{',
      '  \"type\": \"donut\",',
      '  \"title\": \"Canales\",',
      '  \"centerLabel\": \"Total\",',
      '  \"innerRadius\": 0.62,',
      '  \"data\": [',
      '    { \"label\": \"Instagram\", \"value\": 40, \"color\": \"#ff0000\" },',
      '    { \"label\": \"TikTok\", \"value\": 35, \"color\": \"#ffe500\" },',
      '    { \"label\": \"YouTube\", \"value\": 25, \"color\": \"#0018ee\" }',
      '  ]',
      '}',
      '```',
      '',
      '```chart',
      '{',
      '  \"type\": \"stacked_column\",',
      '  \"title\": \"Stacked column\",',
      '  \"categories\": [\"Lun\", \"Mar\", \"Mié\", \"Jue\", \"Vie\"],',
      '  \"labels\": true,',
      '  \"series\": [',
      '    { \"name\": \"Orgánico\", \"color\": \"#00e7ff\", \"data\": [20, 28, 18, 35, 30] },',
      '    { \"name\": \"Paid\", \"color\": \"#ff6500\", \"data\": [12, 14, 10, 18, 16] },',
      '    { \"name\": \"Email\", \"color\": \"#ffe500\", \"data\": [6, 8, 7, 9, 10] }',
      '  ]',
      '}',
      '```',
      '',
      'Si quieres, también puedo mostrar: `pie`, `bar`, `line`, `spline`, `area`, `polar` y `progress`.',
    ].join('\n');
  }

  return { message: content, actions };
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
