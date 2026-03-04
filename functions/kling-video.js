/**
 * Netlify Function: proxy para generación de video vía API de KIE (Kling 3.0).
 *
 * Usa la API de KIE:
 *   - Crear tarea: POST https://api.kie.ai/api/v1/jobs/createTask
 *   - Consultar estado: GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
 *
 * Autenticación: Bearer token en cabecera (variable de entorno KIE_API_KEY).
 *
 * Documentación: https://kie.ai (API Key: https://kie.ai/api-key)
 */

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const CREATE_PATH = '/api/v1/jobs/createTask';
const RECORD_INFO_PATH = '/api/v1/jobs/recordInfo';

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function getKieAuthHeaders() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return null;
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey.trim()}`
  };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const headers = getKieAuthHeaders();
  if (!headers) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Configura KIE_API_KEY en Netlify (Dashboard → Site settings → Environment variables)' })
    };
  }

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

      // Doc KIE: mínimo requerido es model + input.mode ("std"|"pro"). Añadimos opcionales: prompt, image_urls, sound, duration, aspect_ratio, multi_shots.
      const mode = body.mode === 'pro' ? 'pro' : 'std';
      const promptText = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const rawMulti = Array.isArray(body.multi_shots) ? body.multi_shots : [];
      const multiShots = rawMulti.map((s) => (s && typeof s === 'object' ? (typeof s.prompt === 'string' ? s.prompt.trim() : String(s.prompt || '')) : '')).filter(Boolean);
      const image_urls = Array.isArray(body.image_urls) ? body.image_urls.filter((u) => typeof u === 'string' && u.startsWith('http')) : [];

      const promptForKie = promptText || (multiShots.length ? multiShots[0] : '');
      if (!promptForKie) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Falta el prompt. Escribe o genera el prompt en Director Brief antes de Producción.' })
        };
      }

      // Por defecto solo enviamos mode + prompt (mínimo que acepta KIE). 422 suele venir de parámetros opcionales.
      const fullPayload = process.env.KIE_VIDEO_FULL_PAYLOAD === '1' || process.env.KIE_VIDEO_FULL_PAYLOAD === 'true';

      const input = {
        mode,
        prompt: promptForKie
      };
      if (fullPayload) {
        const durationNum = parseInt(body.duration, 10);
        const durationVal = (Number.isFinite(durationNum) && durationNum >= 3 && durationNum <= 15) ? durationNum : 5;
        const aspectRatio = (typeof body.aspect_ratio === 'string' && /^(16:9|9:16|1:1)$/.test(body.aspect_ratio.trim()))
          ? body.aspect_ratio.trim()
          : '16:9';
        const soundVal = body.sound === true || body.sound === 'true';
        input.sound = soundVal;
        input.duration = durationVal;
        input.aspect_ratio = aspectRatio;
        if (multiShots.length > 1) {
          input.multi_shots = true;
          const multiPromptArr = multiShots.map((p) => ({ prompt: String(p).trim() })).filter((o) => o.prompt);
          if (multiPromptArr.length) input.multi_prompt = multiPromptArr;
        }
        if (image_urls.length) input.image_urls = image_urls;
      }

      const kiePayload = {
        model: 'kling-3.0/video',
        input
      };
      const promptPreview = (input.prompt || '').length > 80 ? (input.prompt.slice(0, 80) + '...') : input.prompt;
      console.log('kling-video KIE createTask payload:', JSON.stringify({ model: kiePayload.model, input: { ...input, prompt: promptPreview } }));

      const createUrl = `${KIE_BASE}${CREATE_PATH}`;
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(kiePayload)
      });
      const rawText = await createRes.text();
      let createData = {};
      try {
        createData = rawText ? JSON.parse(rawText) : {};
      } catch (_) {
        console.error('kling-video KIE createTask: respuesta no JSON', createRes.status, rawText?.slice(0, 500));
      }

      if (!createRes.ok || createData.code !== 200) {
        let errMsg = createData.msg || createData.message || createData.error || (createRes.status === 401 ? 'API Key inválida (revisa KIE_API_KEY)' : createRes.status === 402 ? 'Saldo insuficiente en KIE' : createRes.status === 422 ? 'Parámetros inválidos (422)' : 'Error al crear la tarea');
        if (createData.data?.errors && Array.isArray(createData.data.errors) && createData.data.errors.length) {
          const details = createData.data.errors.map((e) => (typeof e === 'string' ? e : e.message || e.field || JSON.stringify(e))).join('; ');
          errMsg = errMsg + (details ? ' — ' + details : '');
        }
        if (createRes.status === 422 && createData.data && !createData.data.errors) {
          errMsg = errMsg + (typeof createData.data === 'object' ? ' — ' + JSON.stringify(createData.data) : '');
        }
        console.error('kling-video KIE createTask error:', createRes.status, createData);
        const httpStatus = !createRes.ok
          ? (createRes.status >= 400 ? createRes.status : 502)
          : (createData.code >= 400 && createData.code < 600 ? createData.code : 502);
        return {
          statusCode: httpStatus,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: errMsg,
            code: createData.code,
            failMsg: errMsg,
            kieStatus: createRes.status,
            kieBody: createData
          })
        };
      }

      const taskId = createData.data?.taskId;
      if (!taskId) {
        return {
          statusCode: 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'KIE no devolvió taskId', failMsg: 'No taskId en respuesta' })
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
      const statusUrl = `${KIE_BASE}${RECORD_INFO_PATH}?taskId=${encodeURIComponent(taskId)}`;
      const statusRes = await fetch(statusUrl, {
        method: 'GET',
        headers: { 'Authorization': headers.Authorization }
      });
      const statusData = await statusRes.json().catch(() => ({}));

      if (statusRes.status !== 200 || statusData.code !== 200) {
        const errMsg = statusData.msg || statusData.message || statusData.error || 'Error al consultar la tarea';
        return {
          statusCode: statusRes.status >= 400 ? statusRes.status : 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: errMsg, code: statusData.code })
        };
      }

      // KIE ya devuelve { code, msg, data: { taskId, model, state, resultJson, failMsg, ... } } — el front espera ese formato
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify(statusData)
      };
    }

    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Método no permitido' }) };
  } catch (err) {
    console.error('kling-video (KIE) error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};
