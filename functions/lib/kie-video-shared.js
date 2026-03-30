/**
 * Lógica compartida para createTask y recordInfo.
 * API: KIE (https://api.kie.ai), no la API oficial de Kling. Modelo: kling-3.0/video.
 * Usado por: kling-video-create, kling-video-status, kling-video (router).
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
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) return null;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey.trim()}`
  };
}

function distributeDuration(totalSec, n) {
  if (n <= 0) return [];
  const base = Math.floor(totalSec / n);
  const remainder = totalSec - base * n;
  const out = [];
  for (let i = 0; i < n; i++) {
    let d = base + (i < remainder ? 1 : 0);
    d = Math.min(12, Math.max(1, d));
    out.push(d);
  }
  return out;
}

/**
 * Crea una tarea en KIE. body puede incluir action: 'createTask' (compat) o no.
 * @returns { Promise<{ statusCode: number, headers: Object, body: string }> }
 */
async function handleCreate(body, headers) {
  const c = corsHeaders();
  const mode = body.mode === 'pro' ? 'pro' : 'std';
  const promptText = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const rawMulti = Array.isArray(body.multi_shots) ? body.multi_shots : [];
  const multiShots = rawMulti.map((s) => (s && typeof s === 'object' ? (typeof s.prompt === 'string' ? s.prompt.trim() : String(s.prompt || '')) : '')).filter(Boolean);
  const klingElementsRaw = Array.isArray(body.kling_elements) ? body.kling_elements : [];
  const hasMultiShots = multiShots.length > 1;
  const isImageUrl = (u) => typeof u === 'string' && u.startsWith('http');
  const promptForKie = promptText || (multiShots.length ? multiShots[0] : '');
  if (!promptForKie) {
    return { statusCode: 400, headers: c, body: JSON.stringify({ error: 'Falta el prompt. Escribe o genera el prompt en Director Brief antes de Producción.' }) };
  }
  const promptMaxLen = 2500;
  const promptTruncated = promptForKie.length > promptMaxLen ? promptForKie.slice(0, promptMaxLen) : promptForKie;
  const rawDuration = body.duration != null ? Number(body.duration) : 5;
  const totalSec = Number.isFinite(rawDuration) ? Math.min(12, Math.max(1, Math.round(rawDuration))) : 5;
  const duration = String(totalSec);
  const allowedAspectRatios = ['16:9', '9:16', '1:1'];
  const aspect_ratio = typeof body.aspect_ratio === 'string' && allowedAspectRatios.includes(body.aspect_ratio.trim()) ? body.aspect_ratio.trim() : '16:9';
  const sound = body.sound === true || body.sound === 'true';

  const kling_elements = [];
  for (const el of klingElementsRaw) {
    if (!el || typeof el.name !== 'string' || !el.name.trim()) continue;
    const ref = '@' + el.name.trim();
    if (!promptTruncated.includes(ref)) continue;
    const imgUrls = (el.element_input_urls || []).filter(isImageUrl);
    const vidUrls = (el.element_input_video_urls || []).filter((u) => typeof u === 'string' && u.startsWith('http'));
    const hasEnoughMedia = (imgUrls.length >= 1 && imgUrls.length <= 4) || vidUrls.length === 1;
    if (!hasEnoughMedia) continue;
    const o = { name: el.name.trim() };
    if (typeof el.description === 'string' && el.description.trim()) o.description = el.description.trim();
    if (imgUrls.length) {
      let urls = imgUrls.slice(0, 4);
      if (urls.length === 1) urls = [urls[0], urls[0]];
      o.element_input_urls = urls;
    }
    if (vidUrls.length) o.element_input_video_urls = vidUrls.slice(0, 1);
    kling_elements.push(o);
  }

  const includedElementNames = new Set(kling_elements.map((el) => el.name));
  const stripOrphanRefs = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\s*@[\w-]+\s*/g, (m) => {
      const name = m.replace(/^\s*@|\s*$/g, '');
      return includedElementNames.has(name) ? m : ' ';
    }).replace(/\s+/g, ' ').trim();
  };

  // image_urls: el frontend envía TODAS las imágenes aquí (producto, escena, adjuntos). Si no viene, se deriva del primer kling_element (compat).
  let image_urls = [];
  if (Array.isArray(body.image_urls) && body.image_urls.length > 0) {
    image_urls = body.image_urls.filter(isImageUrl);
  } else if (kling_elements.length > 0) {
    const first = kling_elements[0];
    const urls = first.element_input_urls || [];
    if (hasMultiShots) {
      if (urls.length) image_urls = [urls[0]];
    } else {
      if (urls.length >= 2) image_urls = [urls[0], urls[1]];
      else if (urls.length === 1) image_urls = [urls[0]];
    }
  }

  const promptFinal = stripOrphanRefs(promptTruncated);
  if (!promptFinal) {
    return { statusCode: 400, headers: c, body: JSON.stringify({ error: 'El prompt no puede quedar vacío tras validar referencias. Usa texto o elimina referencias @element sin suficientes imágenes.' }) };
  }

  // Doc KIE: multi_shots es REQUERIDO (boolean). Ejemplo KIE usa duration como string ("5").
  const input = { mode, sound, duration: duration, aspect_ratio };
  if (image_urls.length > 0) input.image_urls = image_urls;

  if (hasMultiShots) {
    const n = Math.min(5, multiShots.length);
    const durations = distributeDuration(totalSec, n);
    const multiPromptArray = multiShots.slice(0, n).map((p, i) => ({
      prompt: stripOrphanRefs(String(p).trim().slice(0, 500)),
      duration: durations[i] || 1
    })).filter((item) => item.prompt.length > 0);
    if (multiPromptArray.length === 0) {
      return { statusCode: 400, headers: c, body: JSON.stringify({ error: 'Con Multi Shots activado necesitas al menos un shot con texto. Añade contenido o desactiva Multi Shots.' }) };
    }
    if (multiPromptArray.length === 1) {
      input.multi_shots = false;
      input.prompt = multiPromptArray[0].prompt;
      input.duration = String(multiPromptArray[0].duration);
    } else {
      input.multi_shots = true;
      input.multi_prompt = multiPromptArray;
    }
  } else {
    input.multi_shots = false;
    input.prompt = promptFinal;
  }
  if (kling_elements.length > 0) input.kling_elements = kling_elements;

  const kiePayload = { model: 'kling-3.0/video', input };
  const callBackUrl = process.env.KIE_VIDEO_CALLBACK_URL;
  if (callBackUrl && typeof callBackUrl === 'string' && callBackUrl.startsWith('http')) kiePayload.callBackUrl = callBackUrl.trim();

  if (typeof kiePayload.input === 'string') {
    try {
      kiePayload.input = JSON.parse(kiePayload.input);
    } catch (_) {
      return { statusCode: 400, headers: c, body: JSON.stringify({ error: 'input no debe ser string; debe ser objeto' }) };
    }
  }

  const createUrl = `${KIE_BASE}${CREATE_PATH}`;
  const createRes = await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(kiePayload) });
  const rawText = await createRes.text();
  let createData = {};
  try {
    createData = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    console.error('kie-video-shared createTask: respuesta no JSON', createRes.status, rawText?.slice(0, 500));
  }

  if (!createRes.ok || createData.code !== 200) {
    let errMsg = createData.msg || createData.message || createData.error || (createRes.status === 401 ? 'API Key inválida (revisa KIE_API_KEY)' : createRes.status === 402 ? 'Saldo insuficiente en KIE' : 'Error al crear la tarea');
    if (createData.data?.errors && Array.isArray(createData.data.errors) && createData.data.errors.length) {
      const details = createData.data.errors.map((e) => (typeof e === 'string' ? e : e.message || e.field || JSON.stringify(e))).join('; ');
      errMsg = errMsg + (details ? ' — ' + details : '');
    }
    if (createRes.status === 422) {
      errMsg = errMsg + ' (Revisa consola: respuesta del servidor tiene más detalle)';
    }
    console.error('kie-video-shared createTask error:', createRes.status, JSON.stringify(createData));
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
  return { statusCode: 200, headers: c, body: JSON.stringify({ taskId: String(taskId) }) };
}

/**
 * Consulta estado de una tarea en KIE.
 * @returns { Promise<{ statusCode: number, headers: Object, body: string }> }
 */
async function handleStatus(taskId, headers) {
  const c = corsHeaders();
  const statusUrl = `${KIE_BASE}${RECORD_INFO_PATH}?taskId=${encodeURIComponent(taskId)}`;
  const statusRes = await fetch(statusUrl, { method: 'GET', headers: { 'Authorization': headers.Authorization } });
  const statusData = await statusRes.json().catch(() => ({}));

  if (statusRes.status !== 200 || statusData.code !== 200) {
    const errMsg = statusData.msg || statusData.message || statusData.error || 'Error al consultar la tarea';
    return {
      statusCode: statusRes.status >= 400 ? statusRes.status : 500,
      headers: c,
      body: JSON.stringify({ error: errMsg, code: statusData.code })
    };
  }

  const d = statusData.data || {};
  const state = d.state || d.status || '';
  const normalized = { ...statusData, data: { ...d, state: state === 'failed' ? 'fail' : state } };
  return { statusCode: 200, headers: c, body: JSON.stringify(normalized) };
}

const { requireAuth } = require('./ai-shared');

module.exports = {
  corsHeaders,
  getKieAuthHeaders,
  handleCreate,
  handleStatus,
  requireAuth
};
