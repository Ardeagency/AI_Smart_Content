/**
 * Netlify Function: solo crear tarea de video en KIE (api.kie.ai, modelo kling-3.0/video).
 * No usamos la API oficial de Kling. POST con body: mode, prompt (o multi_shots), duration, aspect_ratio, sound, kling_elements.
 * Responde de inmediato con { taskId }. No espera la generación del video (evita timeout serverless).
 * Arquitectura asíncrona: el frontend hace polling a kling-video-status o usa callBackUrl.
 */

const shared = require('./lib/kie-video-shared');
const { getSupabaseEnv, ensureBalanceAtLeast } = require('./lib/ai-shared');

// Pre-check estimado para no disparar KIE sin saldo. Cobro real en
// kie-task-finalize tras success (lee creditsConsumed de KIE).
// Estimado conservador: max KIE-4K 12s ($0.335*12=$4.02) + OpenAI (~$0.005) + 5 markup = ~9 cred.
const MIN_BALANCE_VIDEO_CRED = Number(process.env.MIN_BALANCE_VIDEO_CRED || 9);

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

  const organizationId = String(body.organization_id || '').trim();
  if (!organizationId) {
    return { statusCode: 400, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'organization_id requerido' }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return { statusCode: 500, headers: shared.corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  // Pre-check balance: no disparamos KIE Kling sin saldo. Cobro real en
  // kie-task-finalize tras success (lee creditsConsumed real de KIE).
  const balance = await ensureBalanceAtLeast({ env, organizationId, minCredits: MIN_BALANCE_VIDEO_CRED });
  if (!balance.ok) {
    return {
      statusCode: 402,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({
        error: 'Creditos insuficientes para iniciar el video',
        balance: balance.balance,
        required: balance.required || MIN_BALANCE_VIDEO_CRED,
        reason: balance.reason
      })
    };
  }

  let createResp;
  try {
    createResp = await shared.handleCreate(body, headers, event);
  } catch (err) {
    console.error('kling-video-create error:', err);
    return {
      statusCode: 500,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }

  if (createResp.statusCode !== 200) return createResp;

  // Adjuntar kind + tokens en la respuesta para que el frontend los pase al finalize.
  let parsedCreate;
  try { parsedCreate = JSON.parse(createResp.body); }
  catch (_) { return createResp; }

  return {
    statusCode: 200,
    headers: shared.corsHeaders(event),
    body: JSON.stringify({
      ...parsedCreate,
      kind: 'video_generated',
      openai_input_tokens: Math.max(0, Number(body.openai_input_tokens || 0)),
      openai_output_tokens: Math.max(0, Number(body.openai_output_tokens || 0)),
      openai_model: body.openai_model || 'gpt-4o-mini'
    })
  };
};
