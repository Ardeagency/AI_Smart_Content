/**
 * Netlify Function: proxy para la API Kling 3.0.
 * Endpoints: POST /v1/ai/video/kling-v3-pro | kling-v3-std, GET /v1/ai/video/kling-v3/{task-id}
 *
 * Autenticación (una de las dos):
 *   - KLING_API_KEY — Bearer token directo
 *   - KLING_ACCESS_KEY (o KLING_ACCESSS_KEY) + KLING_SECRET_KEY — JWT (HS256)
 *
 * Variables de entorno:
 *   KLING_API_BASE_URL (opcional) — default https://api.klingai.com
 *
 * Acciones:
 * - POST body createTask: action, mode, prompt, duration, aspect_ratio, kling_elements, multi_shots
 * - GET ?taskId=xxx → consulta estado (normalizado para el frontend: data.state, data.resultJson)
 */

const crypto = require('crypto');

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Genera JWT HS256 para la API Kling (iss=accessKey, iat, exp). */
function createKlingJWT(accessKey, secretKey, ttlSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: accessKey, iat: now, exp: now + ttlSeconds };
  const headerB64 = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secretKey).update(signingInput).digest();
  const sigB64 = base64urlEncode(sig);
  return `${signingInput}.${sigB64}`;
}

function getKlingAuthHeaders() {
  const apiKey = process.env.KLING_API_KEY;
  if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    };
  }
  const accessKey = process.env.KLING_ACCESS_KEY || process.env.KLING_ACCESSS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) return null;
  const token = createKlingJWT(accessKey, secretKey);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

function getBaseUrl() {
  const url = (process.env.KLING_API_BASE_URL || 'https://api.klingai.com').replace(/\/$/, '');
  return url;
}

/** Convierte respuesta de estado de Kling a formato que espera el frontend (data.state, data.resultJson, data.failMsg). */
function normalizeStatusResponse(klingData) {
  const taskId = klingData.task_id || klingData.data?.task_id;
  const status = (klingData.task_status || klingData.status || klingData.data?.task_status || klingData.data?.status || '').toLowerCase();
  const state = status === 'succeeded' || status === 'completed' || status === 'success' ? 'success' : status === 'failed' || status === 'error' ? 'fail' : 'waiting';
  const result = klingData.task_result || klingData.data?.task_result || klingData.result || klingData.data?.result;
  let resultUrls = [];
  if (result) {
    if (Array.isArray(result.videos)) resultUrls = result.videos.map((v) => (typeof v === 'string' ? v : v.url)).filter(Boolean);
    else if (result.video_url) resultUrls = [result.video_url];
    else if (result.url) resultUrls = [result.url];
    else if (Array.isArray(result)) resultUrls = result.filter((u) => typeof u === 'string');
  }
  if (klingData.video_url) resultUrls = [klingData.video_url];
  if (klingData.data?.video_url) resultUrls = [klingData.data.video_url];
  if (Array.isArray(klingData.response) && klingData.response.length) resultUrls = klingData.response;

  const failMsg = klingData.error_message || klingData.message || klingData.data?.error_message || klingData.data?.message || (state === 'fail' ? 'La generación falló' : null);

  return {
    code: 200,
    msg: 'success',
    data: {
      taskId: taskId || klingData.task_id,
      task_id: taskId,
      model: 'kling',
      state,
      resultJson: resultUrls.length ? JSON.stringify({ resultUrls }) : null,
      failCode: state === 'fail' ? (klingData.error_code || klingData.code) : null,
      failMsg,
      param: null,
      costTime: klingData.cost_time || klingData.costTime,
      completeTime: klingData.complete_time || klingData.completeTime,
      createTime: klingData.create_time || klingData.createTime
    }
  };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const headers = getKlingAuthHeaders();
  if (!headers) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Configura KLING_API_KEY o (KLING_ACCESS_KEY + KLING_SECRET_KEY) en el servidor' })
    };
  }

  const baseUrl = getBaseUrl();
  // Kling 3.0: crear tarea según modo
  const getCreatePath = (mode) => mode === 'pro' ? '/v1/ai/video/kling-v3-pro' : '/v1/ai/video/kling-v3-std';
  const getStatusPath = () => '/v1/ai/video/kling-v3';

  try {
    if (event.httpMethod === 'POST') {
      let body = {};
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
      } catch (_) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Body JSON inválido' }) };
      }
      if (body.action !== 'createTask') {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Acción no válida. Use action: "createTask"' }) };
      }

      const mode = body.mode === 'pro' ? 'pro' : 'std';
      const promptSingle = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const rawMulti = Array.isArray(body.multi_shots) ? body.multi_shots : [];
      const multiShots = rawMulti
        .map((s) => (s && typeof s === 'object' ? (typeof s.prompt === 'string' ? s.prompt.trim() : String(s.prompt || '')) : ''))
        .filter(Boolean);

      let prompt = promptSingle;
      if (!prompt && multiShots.length > 0) prompt = multiShots[0];
      if (!prompt) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Falta el prompt. Escribe o genera un prompt en Director Brief antes de enviar.' })
        };
      }

      const durationRaw = typeof body.duration === 'string' && /^[0-9]+$/.test(body.duration) ? body.duration : '5';
      const duration = Math.min(15, Math.max(3, parseInt(durationRaw, 10) || 5));

      // Payload API Kling 3.0: prompt, duration (3-15), cfg_scale, aspect_ratio, sound, multi_shot, first_frame, end_frame, negative_prompt
      const payload = {
        prompt,
        duration,
        cfg_scale: 0.65
      };
      const aspectRatio = typeof body.aspect_ratio === 'string' && /^(16:9|9:16|1:1)$/.test(body.aspect_ratio.trim()) ? body.aspect_ratio.trim() : '16:9';
      payload.aspect_ratio = aspectRatio;
      if (typeof body.sound === 'boolean') payload.sound = body.sound;
      else if (body.sound === true || body.sound === 'true') payload.sound = true;
      else payload.sound = false;

      if (typeof body.negative_prompt === 'string' && body.negative_prompt.trim()) payload.negative_prompt = body.negative_prompt.trim();

      if (multiShots.length > 0) {
        payload.multi_shot = multiShots.map((scenePrompt) => ({
          scene_prompt: scenePrompt,
          duration: Math.max(3, Math.min(15, Math.floor(duration / multiShots.length)))
        }));
      }

      const imageUrls = [];
      if (Array.isArray(body.kling_elements) && body.kling_elements.length > 0) {
        for (const el of body.kling_elements) {
          const urls = el.element_input_urls || [];
          if (urls.length) imageUrls.push(urls[0]);
        }
      }
      if (imageUrls.length >= 1) payload.first_frame = imageUrls[0];
      if (imageUrls.length >= 2) payload.end_frame = imageUrls[1];

      const createPath = getCreatePath(mode);
      const createUrl = `${baseUrl}${createPath}`;
      const createRes = await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
      const createData = await createRes.json().catch(() => ({}));

      const taskId = createData.task_id ?? createData.data?.task_id;
      if (createRes.status >= 400 || !taskId) {
        const errMsg = createData.message || createData.msg || createData.data?.message || createData.error || 'Error al crear la tarea';
        return {
          statusCode: createRes.status >= 400 ? createRes.status : 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: errMsg, code: createData.code, failMsg: errMsg })
        };
      }
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ taskId })
      };
    }

    if (event.httpMethod === 'GET') {
      const taskId = event.queryStringParameters?.taskId;
      if (!taskId) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Falta el parámetro taskId' }) };
      }
      const statusPath = process.env.KLING_API_STATUS_PATH || getStatusPath();
      const useQuery = process.env.KLING_API_STATUS_USE_QUERY === '1' || process.env.KLING_API_STATUS_USE_QUERY === 'true';
      const statusUrl = useQuery
        ? `${baseUrl}${statusPath}?task_id=${encodeURIComponent(taskId)}`
        : `${baseUrl}${statusPath}/${encodeURIComponent(taskId)}`;
      const statusRes = await fetch(statusUrl, { method: 'GET', headers: { Authorization: headers.Authorization } });
      const statusData = await statusRes.json().catch(() => ({}));

      if (statusRes.status >= 400) {
        return {
          statusCode: statusRes.status >= 400 ? statusRes.status : 500,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: statusData.message || statusData.msg || statusData.error || 'Error al consultar la tarea',
            code: statusData.code
          })
        };
      }
      const normalized = normalizeStatusResponse({ ...statusData, ...statusData.data, task_id: taskId });
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(normalized) };
    }

    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Método no permitido' }) };
  } catch (err) {
    console.error('kling-video error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message || 'Error interno' }) };
  }
};
