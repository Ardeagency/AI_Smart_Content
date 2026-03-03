/**
 * Netlify Function: proxy para la API oficial de Kling.
 *
 * Por defecto usa la API unificada oficial (api.klingai.com):
 *   - Crear: POST /v1/video/generations (model, prompt, mode, aspect_ratio, duration, image, image_tail, image_list)
 *   - Estado: GET /v1/video/generations/{task_id}
 *
 * Si KLING_USE_V3_PATHS=1: rutas alternativas /v1/ai/video/kling-v3-pro y /v1/ai/video/kling-v3/{task-id}
 *
 * Autenticación (una de las dos):
 *   - KLING_API_KEY — Bearer token directo
 *   - KLING_ACCESS_KEY (o KLING_ACCESSS_KEY) + KLING_SECRET_KEY — JWT (HS256)
 *
 * Variables de entorno:
 *   KLING_API_BASE_URL — default https://api.klingai.com
 *   KLING_USE_V3_PATHS — 1 o true para usar rutas v3 (kling-v3-pro, kling-v3-std)
 *   KLING_API_CREATE_PATH — ruta POST crear (default /v1/video/generations)
 *   KLING_API_STATUS_PATH — ruta base GET estado (default /v1/video/generations)
 *   KLING_API_STATUS_USE_QUERY — 1 o true para ?task_id= en lugar de /{task_id}
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
  const statusRaw = klingData.task_status || klingData.status || klingData.data?.task_status || klingData.data?.status || '';
  const status = (typeof statusRaw === 'string' ? statusRaw : String(statusRaw)).toLowerCase();
  const state = (status === 'succeeded' || status === 'completed' || status === 'success') ? 'success' : (status === 'failed' || status === 'error' || status === 'fail') ? 'fail' : 'waiting';
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
  if (Array.isArray(klingData.data?.generated) && klingData.data.generated.length) resultUrls = klingData.data.generated;
  if (Array.isArray(klingData.generated) && klingData.generated.length) resultUrls = klingData.generated;

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
  const useV3Paths = process.env.KLING_USE_V3_PATHS === '1' || process.env.KLING_USE_V3_PATHS === 'true';
  const getCreatePathV3 = (mode) => mode === 'pro' ? '/v1/ai/video/kling-v3-pro' : '/v1/ai/video/kling-v3-std';
  const getStatusPathV3 = () => '/v1/ai/video/kling-v3';
  const createPathUnified = (process.env.KLING_API_CREATE_PATH || '/v1/video/generations').replace(/^\//, '');
  const statusPathBase = (process.env.KLING_API_STATUS_PATH || '/v1/video/generations').replace(/^\//, '');

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
      const aspectRatio = typeof body.aspect_ratio === 'string' && /^(16:9|9:16|1:1)$/.test((body.aspect_ratio || '').trim()) ? body.aspect_ratio.trim() : '16:9';
      const sound = typeof body.sound === 'boolean' ? body.sound : (body.sound === true || body.sound === 'true');
      const negativePrompt = typeof body.negative_prompt === 'string' ? body.negative_prompt.trim() : '';

      const imageUrls = [];
      if (Array.isArray(body.kling_elements) && body.kling_elements.length > 0) {
        for (const el of body.kling_elements) {
          const urls = el.element_input_urls || [];
          if (urls.length) imageUrls.push(urls[0]);
        }
      }

      let createUrl;
      let payload;

      if (useV3Paths) {
        createUrl = `${baseUrl}/${getCreatePathV3(mode).replace(/^\//, '')}`;
        payload = {
          prompt,
          duration,
          cfg_scale: 0.65,
          aspect_ratio: aspectRatio,
          sound
        };
        if (negativePrompt) payload.negative_prompt = negativePrompt;
        if (multiShots.length > 0) {
          payload.multi_shot = multiShots.map((scenePrompt) => ({
            scene_prompt: scenePrompt,
            duration: Math.max(3, Math.min(15, Math.floor(duration / multiShots.length)))
          }));
      }
      if (imageUrls.length >= 1) payload.first_frame = imageUrls[0];
      if (imageUrls.length >= 2) payload.end_frame = imageUrls[1];
      } else {
        createUrl = `${baseUrl}/${createPathUnified}`;
        const model = mode === 'pro' ? 'kling/kling-v2-1-master' : 'kling/kling-v2-1';
        payload = {
          model,
          prompt,
          mode,
          aspect_ratio: aspectRatio,
          duration: Number(duration),
          sound
        };
        if (negativePrompt) payload.negative_prompt = negativePrompt;
        if (imageUrls.length === 1) {
          payload.image = imageUrls[0];
        } else if (imageUrls.length === 2) {
          payload.image = imageUrls[0];
          payload.image_tail = imageUrls[1];
        } else if (imageUrls.length >= 3) {
          payload.image_list = imageUrls.slice(0, 4).map((url) => ({ image: url }));
        }
        if (multiShots.length > 1) {
          payload.prompt = multiShots.map((p, i) => `[Shot ${i + 1}] ${p}`).join(' ');
        }
      }

      const createRes = await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
      const createData = await createRes.json().catch(() => ({}));

      const taskId = createData.data?.task_id ?? createData.task_id ?? createData.data?.taskId;
      if (createRes.status >= 400 || !taskId) {
        const errMsg = createData.message || createData.msg || createData.data?.message || createData.error || createData.err_msg || 'Error al crear la tarea';
        return {
          statusCode: createRes.status >= 400 ? createRes.status : 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: errMsg, code: createData.code, failMsg: errMsg })
        };
      }
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ taskId: String(taskId) })
      };
    }

    if (event.httpMethod === 'GET') {
      const taskId = event.queryStringParameters?.taskId;
      if (!taskId) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Falta el parámetro taskId' }) };
      }
      const useQuery = process.env.KLING_API_STATUS_USE_QUERY === '1' || process.env.KLING_API_STATUS_USE_QUERY === 'true';
      const statusPath = useV3Paths ? getStatusPathV3() : statusPathBase;
      const statusUrl = useQuery
        ? `${baseUrl}/${statusPath.replace(/^\//, '')}?task_id=${encodeURIComponent(taskId)}`
        : `${baseUrl}/${statusPath.replace(/^\//, '')}/${encodeURIComponent(taskId)}`;
      const statusRes = await fetch(statusUrl, { method: 'GET', headers: { Authorization: headers.Authorization } });
      const statusData = await statusRes.json().catch(() => ({}));

      if (statusRes.status >= 400) {
        return {
          statusCode: statusRes.status >= 400 ? statusRes.status : 500,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: statusData.message || statusData.msg || statusData.error || statusData.err_msg || 'Error al consultar la tarea',
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
