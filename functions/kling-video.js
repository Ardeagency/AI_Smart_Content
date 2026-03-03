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

      // Doc KIE: model + input (mode obligatorio). 422 suele indicar validación; kling-3.0/video puede requerir prompt en input.
      const mode = body.mode === 'pro' ? 'pro' : 'std';
      const promptText = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const input = { mode };
      if (promptText) input.prompt = promptText;
      const kiePayload = {
        model: 'kling-3.0/video',
        input
      };

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
        let errMsg = createData.msg || createData.message || createData.error || (createRes.status === 401 ? 'API Key inválida (revisa KIE_API_KEY)' : createRes.status === 402 ? 'Saldo insuficiente en KIE' : 'Error al crear la tarea');
        if (createData.data?.errors && Array.isArray(createData.data.errors) && createData.data.errors.length) {
          const details = createData.data.errors.map((e) => (typeof e === 'string' ? e : e.message || e.field || JSON.stringify(e))).join('; ');
          errMsg = errMsg + (details ? ' — ' + details : '');
        }
        console.error('kling-video KIE createTask error:', createRes.status, createData);
        // Devolver HTTP no-2xx cuando KIE indica error (code !== 200) para que el front muestre error y no espere taskId
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
