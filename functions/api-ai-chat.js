/**
 * Netlify Function: API AI Chat
 *
 * Pipeline: recibe mensaje del usuario → (futuro: construir contexto org, embeddings, OpenClaw) → devuelve respuesta.
 * El frontend guarda el mensaje user y el assistant en ai_messages vía Supabase.
 *
 * POST body: {
 *   organization_id: string,
 *   brand_container_id: string,
 *   conversation_id: string,
 *   message: string
 * }
 *
 * Response: {
 *   assistant_message: { id?: string, content: string, actions: Array<{ action_type, label?, payload? }> }
 * }
 */

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
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

  const { organization_id, brand_container_id, conversation_id, message } = body;
  if (!organization_id || !conversation_id || typeof message !== 'string') {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: 'Faltan organization_id, conversation_id o message'
      })
    };
  }

  // Placeholder: respuesta estática hasta conectar OpenClaw.
  // OpenClaw recibirá: organization_id, brand_container_id, conversation_id, mensaje y contexto.
  const text = (message || '').trim().toLowerCase();
  let content =
    'He recibido tu mensaje. Cuando OpenClaw esté conectado, podré analizar tu organización, ejecutar flows y generar acciones.';
  let actions = [];

  if (text.includes('flujo') || text.includes('flow') || text.includes('ejecutar')) {
    content =
      'Puedo ayudarte a ejecutar flujos. Cuando OpenClaw esté integrado, podré lanzar flows directamente desde aquí.';
    actions = [{ action_type: 'trigger_flow', label: 'Ver flujos disponibles', payload: {} }];
  }
  if (text.includes('campaña') || text.includes('campaign')) {
    content =
      'Puedo analizar y sugerir campañas para tu marca. Cuando Vera esté conectada, tendré contexto de tus campañas y audiencias.';
  }
  if (text.includes('hola') || text.includes('ayuda') || text.length < 3) {
    content =
      'Hola, soy Vera, el AI Brain de tu organización.\n\nPuedo ayudarte a:\n• analizar tu marca\n• crear campañas\n• generar contenido\n• analizar competidores\n• ejecutar flows\n\n¿Qué quieres hacer hoy?';
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      assistant_message: {
        content,
        actions
      }
    })
  };
};
