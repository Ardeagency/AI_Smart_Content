/**
 * Netlify Function: proxy para la API de Video de KIE (Kling 3.0).
 * Usa la variable de entorno KIE_API_KEY (configurada en Netlify).
 *
 * Acciones:
 * - POST body createTask:
 *   - action: "createTask" (requerido)
 *   - mode: "pro" | "std" (default pro)
 *   - prompt: string (requerido) — texto del video (Director Brief)
 *   - duration: "5" | "10" | "15" (opcional, default "5")
 *   - aspect_ratio: "16:9" | "9:16" | "1:1" (opcional)
 *   - sound: boolean (opcional)
 *   - kling_elements: array de { name, element_input_urls?, element_input_video_urls?, description? } (opcional)
 * - GET ?taskId=xxx → consulta estado y resultado (recordInfo)
 */

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'KIE_API_KEY no configurada en el servidor' })
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  try {
    if (event.httpMethod === 'POST') {
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
      if (body.action !== 'createTask') {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Acción no válida. Use action: "createTask"' })
        };
      }
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Falta el prompt. Indica el texto del video en Director Brief o genera uno con el botón de estrellas.' })
        };
      }
      const mode = body.mode === 'pro' ? 'pro' : 'std';
      const input = {
        mode,
        prompt
      };
      if (typeof body.duration === 'string' && /^[0-9]+$/.test(body.duration)) {
        input.duration = body.duration;
      }
      if (typeof body.aspect_ratio === 'string' && body.aspect_ratio) {
        input.aspect_ratio = body.aspect_ratio;
      }
      if (typeof body.sound === 'boolean') {
        input.sound = body.sound;
      }
      if (Array.isArray(body.kling_elements) && body.kling_elements.length > 0) {
        input.kling_elements = body.kling_elements;
      }
      const createRes = await fetch(`${KIE_BASE}/createTask`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'kling-3.0/video',
          input
        })
      });
      const createData = await createRes.json();
      if (createRes.status !== 200 || createData.code !== 200) {
        return {
          statusCode: createRes.status >= 400 ? createRes.status : 500,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: createData.msg || 'Error al crear la tarea',
            code: createData.code,
            failCode: createData.data?.failCode,
            failMsg: createData.data?.failMsg
          })
        };
      }
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ taskId: createData.data?.taskId })
      };
    }

    if (event.httpMethod === 'GET') {
      const taskId = event.queryStringParameters?.taskId;
      if (!taskId) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Falta el parámetro taskId' })
        };
      }
      const recordRes = await fetch(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const recordData = await recordRes.json();
      if (recordRes.status !== 200) {
        return {
          statusCode: recordRes.status >= 400 ? recordRes.status : 500,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: recordData.msg || 'Error al consultar la tarea',
            code: recordData.code
          })
        };
      }
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify(recordData)
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  } catch (err) {
    console.error('kie-video error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};
