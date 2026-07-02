/**
 * Netlify Function: router de compatibilidad para generación de video vía API de KIE (kie.ai).
 *
 * Usamos la API de KIE (https://api.kie.ai), no la API oficial de Kling. KIE expone el modelo kling-3.0/video.
 *
 * - POST con action: 'createTask' → delega a kling-video-create (responde solo con taskId).
 * - GET ?taskId=xxx → delega a kling-video-status.
 *
 * Para evitar timeouts serverless, se recomienda usar en producción los endpoints separados:
 *   POST /.netlify/functions/kling-video-create  (crear tarea, < 2 s)
 *   GET  /.netlify/functions/kling-video-status?taskId=... (consultar estado)
 * El frontend hace polling desde el cliente; la función nunca espera la generación del video.
 *
 * Documentación: https://kie.ai (API Key: https://kie.ai/api-key)
 */

const shared = require('./lib/kie-video-shared');
const { getSupabaseEnv, ensureBalanceAtLeast, assertOrgMember } = require('./lib/ai-shared');

// Mismo pre-check estimado que kling-video-create (ruta principal).
const MIN_BALANCE_VIDEO_CRED = Number(process.env.MIN_BALANCE_VIDEO_CRED || 9);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: shared.corsHeaders(event), body: '' };
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

  try {
    if (event.httpMethod === 'POST') {
      let body = {};
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
      } catch (_) {
        return { statusCode: 400, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'Body JSON inválido' }) };
      }
      if (body.action !== 'createTask') {
        return { statusCode: 400, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'Acción no válida. Use action: "createTask"' }) };
      }

      // Mismos guards que kling-video-create: sin esto, esta ruta de
      // compatibilidad era un bypass del pre-check de saldo y de la
      // membresía de la organización.
      const organizationId = String(body.organization_id || '').trim();
      if (!organizationId) {
        return { statusCode: 400, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'organization_id requerido' }) };
      }
      let env;
      try { env = getSupabaseEnv(); }
      catch (e) { return { statusCode: 500, headers: shared.corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }
      try {
        await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id });
      } catch (e) {
        return { statusCode: e.statusCode || 403, headers: shared.corsHeaders(event), body: JSON.stringify({ error: e.message || 'No autorizado para esta organización' }) };
      }
      const balance = await ensureBalanceAtLeast({ env, organizationId, minCredits: MIN_BALANCE_VIDEO_CRED });
      if (!balance.ok) {
        return {
          statusCode: 402,
          headers: shared.corsHeaders(event),
          body: JSON.stringify({ error: 'Creditos insuficientes para iniciar el video', balance: balance.balance, required: balance.required || MIN_BALANCE_VIDEO_CRED, reason: balance.reason })
        };
      }

      return await shared.handleCreate(body, headers, event);
    }

    if (event.httpMethod === 'GET') {
      const taskId = event.queryStringParameters?.taskId;
      if (!taskId) {
        return { statusCode: 400, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'Falta el parámetro taskId' }) };
      }
      return await shared.handleStatus(taskId, headers, event);
    }

    return { statusCode: 405, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'Método no permitido' }) };
  } catch (err) {
    console.error('kling-video (router) error:', err);
    return {
      statusCode: 500,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};
