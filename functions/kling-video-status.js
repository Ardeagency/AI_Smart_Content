/**
 * Netlify Function: solo consultar estado de una tarea de video en KIE (Kling 3.0).
 * GET ?taskId=xxx → devuelve estado (waiting, success, fail) y resultUrls cuando success.
 * Cada invocación es rápida (< 2 s); el polling lo hace el frontend o un worker.
 */

const shared = require('./lib/kie-video-shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: shared.corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: shared.corsHeaders(),
      body: JSON.stringify({ error: 'Método no permitido. Usa GET con ?taskId=...' })
    };
  }

  const headers = shared.getKieAuthHeaders();
  if (!headers) {
    return {
      statusCode: 500,
      headers: shared.corsHeaders(),
      body: JSON.stringify({ error: 'Configura KIE_API_KEY en Netlify (Dashboard → Site settings → Environment variables)' })
    };
  }

  const taskId = event.queryStringParameters?.taskId;
  if (!taskId) {
    return {
      statusCode: 400,
      headers: shared.corsHeaders(),
      body: JSON.stringify({ error: 'Falta el parámetro taskId' })
    };
  }

  try {
    return await shared.handleStatus(taskId, headers);
  } catch (err) {
    console.error('kling-video-status error:', err);
    return {
      statusCode: 500,
      headers: shared.corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};
