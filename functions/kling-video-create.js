/**
 * Netlify Function: solo crear tarea de video en KIE (api.kie.ai, modelo kling-3.0/video).
 * No usamos la API oficial de Kling. POST con body: mode, prompt (o multi_shots), duration, aspect_ratio, sound, kling_elements.
 * Responde de inmediato con { taskId }. No espera la generación del video (evita timeout serverless).
 * Arquitectura asíncrona: el frontend hace polling a kling-video-status o usa callBackUrl.
 */

const shared = require('./lib/kie-video-shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: shared.corsHeaders(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: 'Método no permitido. Usa POST.' })
    };
  }

  const user = await shared.requireAuth(event);
  if (!user) {
    return {
      statusCode: 401,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: 'No autorizado. Se requiere sesión activa.' })
    };
  }

  const headers = shared.getKieAuthHeaders();
  if (!headers) {
    return {
      statusCode: 500,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: 'Configura KIE_API_KEY en Netlify (Dashboard → Site settings → Environment variables)' })
    };
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return { statusCode: 400, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'Body JSON inválido' }) };
  }

  try {
    return await shared.handleCreate(body, headers, event);
  } catch (err) {
    console.error('kling-video-create error:', err);
    return {
      statusCode: 500,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};
