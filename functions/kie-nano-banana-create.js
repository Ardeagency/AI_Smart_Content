/**
 * Netlify Function: crear tarea KIE modelo Google Nano Banana Pro (image-to-image).
 * POST → { taskId } inmediato; el cliente hace polling a kling-video-status y descarga con kie-video-download.
 * Doc: modelo nano-banana-pro, input.prompt + input.image_input (URLs).
 */

const { requireAuth } = require('./lib/ai-shared');

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const CREATE_PATH = '/api/v1/jobs/createTask';
const DEFAULT_MODEL = process.env.KIE_NANOBANANA_MODEL || 'nano-banana-pro';

const ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto']);
const RESOLUTIONS = new Set(['1K', '2K', '4K']);
const OUTPUT_FORMATS = new Set(['png', 'jpg']);

// Allow-list estricta: solo el dominio propio (+ localhost en dev). Reemplaza el `*`
// que permitía que cualquier web usara este endpoint con el token del usuario.
const ALLOWED_ORIGINS = new Set([
  'https://aismartcontent.io', 'https://www.aismartcontent.io',
  'http://localhost:8888', 'http://localhost:8080', 'http://localhost:5173',
  'http://127.0.0.1:8888'
]);
if (process.env.SITE_URL) ALLOWED_ORIGINS.add(process.env.SITE_URL.replace(/\/$/, ''));

function corsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const allow = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : (process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : 'https://aismartcontent.io');
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function getKieAuthHeaders() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey.trim()}`
  };
}

async function openaiRefinePrompt({ prompt, correction }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return `${prompt || ''}\n\nCorrección solicitada: ${correction || ''}`.trim();

  const system = 'Eres un director creativo de edición de imagen publicitaria. Devuelve solo un prompt final claro para regenerar una imagen manteniendo la composición base y aplicando la corrección del usuario.';
  const user = [
    `Prompt original:\n${prompt || 'Sin prompt original.'}`,
    `Corrección solicitada:\n${correction || ''}`,
    'Devuelve un único prompt final. Sin explicaciones.'
  ].join('\n\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'OpenAI no pudo refinar el prompt');
  const refined = data?.choices?.[0]?.message?.content?.trim();
  if (!refined) throw new Error('OpenAI no devolvió un prompt válido');
  return refined;
}

function pickEnum(value, allowedSet, fallback) {
  const s = value != null ? String(value).trim() : '';
  return allowedSet.has(s) ? s : fallback;
}

exports.handler = async (event) => {
  const c = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: c, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: c, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  const user = await requireAuth(event);
  if (!user) {
    return {
      statusCode: 401,
      headers: c,
      body: JSON.stringify({ error: 'No autorizado. Se requiere sesión activa.' })
    };
  }

  const headers = getKieAuthHeaders();
  if (!headers) {
    return {
      statusCode: 500,
      headers: c,
      body: JSON.stringify({ error: 'Configura KIE_API_KEY en Netlify (Dashboard → Site settings → Environment variables)' })
    };
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return { statusCode: 400, headers: c, body: JSON.stringify({ error: 'Body JSON inválido' }) };
  }

  const imageUrl = (body.image_url || '').trim();
  const prompt = (body.prompt || '').trim();
  const correction = (body.correction || '').trim();
  const technicalParams = body.technical_params && typeof body.technical_params === 'object' ? body.technical_params : {};
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return { statusCode: 400, headers: c, body: JSON.stringify({ error: 'image_url inválida' }) };
  }
  if (!correction) {
    return { statusCode: 400, headers: c, body: JSON.stringify({ error: 'La corrección es requerida' }) };
  }

  try {
    const refinedPrompt = await openaiRefinePrompt({ prompt, correction });
    const aspect_ratio = pickEnum(
      technicalParams.aspect_ratio ?? metadata.aspect_ratio,
      ASPECT_RATIOS,
      '1:1'
    );
    const resolution = pickEnum(technicalParams.resolution ?? metadata.resolution, RESOLUTIONS, '1K');
    const output_format = pickEnum(technicalParams.output_format ?? metadata.output_format, OUTPUT_FORMATS, 'png');

    const kiePayload = {
      model: DEFAULT_MODEL,
      input: {
        prompt: refinedPrompt,
        image_input: [imageUrl],
        aspect_ratio,
        resolution,
        output_format
      }
    };

    const callBackUrl = process.env.KIE_NANO_CALLBACK_URL || process.env.KIE_VIDEO_CALLBACK_URL;
    if (callBackUrl && typeof callBackUrl === 'string' && callBackUrl.startsWith('http')) {
      kiePayload.callBackUrl = callBackUrl.trim();
    }

    const createUrl = `${KIE_BASE}${CREATE_PATH}`;
    const createRes = await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(kiePayload) });
    const rawText = await createRes.text();
    let createData = {};
    try {
      createData = rawText ? JSON.parse(rawText) : {};
    } catch (_) {
      console.error('kie-nano-banana-create: respuesta no JSON', createRes.status, rawText?.slice(0, 500));
    }

    if (!createRes.ok || createData.code !== 200) {
      let errMsg = createData.msg || createData.message || createData.error
        || (createRes.status === 401 ? 'API Key inválida (revisa KIE_API_KEY)' : createRes.status === 402 ? 'Saldo insuficiente en KIE' : 'Error al crear la tarea');
      if (createData.data?.errors && Array.isArray(createData.data.errors) && createData.data.errors.length) {
        const details = createData.data.errors.map((e) => (typeof e === 'string' ? e : e.message || e.field || JSON.stringify(e))).join('; ');
        errMsg = errMsg + (details ? ` — ${details}` : '');
      }
      console.error('kie-nano-banana-create error:', createRes.status, JSON.stringify(createData));
      const httpStatus = !createRes.ok ? (createRes.status >= 400 ? createRes.status : 502) : (createData.code >= 400 && createData.code < 600 ? createData.code : 502);
      return {
        statusCode: httpStatus,
        headers: c,
        body: JSON.stringify({ error: errMsg, code: createData.code, failMsg: errMsg, kieStatus: createRes.status, kieBody: createData })
      };
    }

    const taskId = createData.data?.taskId;
    if (!taskId) {
      return { statusCode: 500, headers: c, body: JSON.stringify({ error: 'KIE no devolvió taskId', failMsg: 'No taskId en respuesta' }) };
    }

    return {
      statusCode: 200,
      headers: c,
      body: JSON.stringify({
        taskId: String(taskId),
        prompt: refinedPrompt,
        model: DEFAULT_MODEL
      })
    };
  } catch (err) {
    console.error('kie-nano-banana-create error:', err);
    return {
      statusCode: 500,
      headers: c,
      body: JSON.stringify({ error: err?.message || 'Error al crear la tarea Nano Banana' })
    };
  }
};
