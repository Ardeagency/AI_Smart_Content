/**
 * Netlify Function: edita una imagen producida combinando una mascara pintada por
 * el usuario + instruccion en lenguaje natural. Flujo:
 *
 *   1. Auth + validacion.
 *   2. Sube la mascara (PNG dataURL) a Storage `production-inputs/edit-masks/...`.
 *   3. OpenAI gpt-4o-mini Vision recibe imagen original + mascara + instruccion y
 *      devuelve un prompt en ingles para nano-banana describiendo el cambio
 *      exclusivamente en la zona marcada y preservando todo lo demas.
 *   4. kie.ai createTask con modelo nano-banana-pro (image-to-image) + prompt.
 *   5. Cobro: 0.10 cred via use_credits_numeric (1 cred = 1 USD).
 *
 * Devuelve { taskId, refined_prompt, mask_storage_path, mask_public_url, ... }
 * para que el frontend haga polling con kling-video-status?taskId=... y al
 * success descargue + suba a Storage + inserte en system_ai_outputs (la misma
 * tabla flat que VideoView usa para producciones standalone, sin flow_run).
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  checkBodySize,
  validateExternalUrl
} = require('./lib/ai-shared');

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const CREATE_PATH = '/api/v1/jobs/createTask';
const KIE_MODEL = process.env.KIE_IMAGE_EDIT_MODEL || 'nano-banana-pro';
const OPENAI_MODEL = process.env.OPENAI_EDIT_PROMPT_MODEL || 'gpt-4o-mini';

const MASK_BUCKET = 'production-inputs';
const CREDITS_PER_EDIT = 0.10;
const USD_PER_CREDIT = 1;
const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto']);

function fail(event, status, error, extra = {}) {
  return {
    statusCode: status,
    headers: corsHeaders(event),
    body: JSON.stringify({ error, ...extra })
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

function parseDataUrl(dataUrl) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1] || 'image/png';
  try {
    return { buffer: Buffer.from(m[2], 'base64'), mime };
  } catch (_) {
    return null;
  }
}

async function uploadMask({ env, userId, buffer, mime }) {
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
  const fileName = `edit-masks/${userId}/${Date.now()}.${ext}`;
  const uploadRes = await fetch(`${env.url}/storage/v1/object/${MASK_BUCKET}/${fileName}`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': mime,
      'cache-control': '3600',
      'x-upsert': 'false'
    },
    body: buffer
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text().catch(() => '');
    throw new Error(`Storage mask upload HTTP ${uploadRes.status}: ${txt.slice(0, 200)}`);
  }
  return {
    storagePath: fileName,
    publicUrl: `${env.url}/storage/v1/object/public/${MASK_BUCKET}/${fileName}`
  };
}

const MODE_SYSTEM_PROMPTS = {
  remove: [
    'You are a senior advertising photo retoucher.',
    'You receive: (1) the ORIGINAL image, (2) a MASK highlighting with painted',
    'pixels the EXACT zone to remove. Your job: produce ONE concise English',
    'prompt (under 220 words) for nano-banana (image-to-image) that regenerates',
    'the original WITHOUT the object that was inside the masked zone. The space',
    'where it used to be must be filled coherently with the surrounding scene',
    '(extend the background, table, surface, lighting). Preserve everything else',
    'exactly: framing, subjects, lighting direction, color grading, brand text,',
    'product geometry, perspective. Output the prompt as a single paragraph, no',
    'preamble, no bullets, no quotes.'
  ].join(' '),
  replace: [
    'You are a senior advertising photo retoucher.',
    'You receive: (1) the ORIGINAL image, (2) a MASK highlighting the zone to',
    'replace, and optionally (3) a REFERENCE image that shows what should go in',
    'that zone. Produce ONE concise English prompt (under 220 words) for',
    'nano-banana that regenerates the original substituting only the masked zone',
    'with the new object, matching the original lighting/shadows/perspective/',
    'color grading so it looks shot in the same scene. Preserve everything',
    'outside the mask exactly. Output the prompt as a single paragraph, no',
    'preamble.'
  ].join(' '),
  'fix-product': [
    'You are a senior advertising photo retoucher.',
    'You receive: (1) the ORIGINAL ad image, (2) a MASK highlighting the product',
    'zone that has rendering issues (warped logo, wrong colors, garbled text,',
    'distorted geometry), and (3) one or more REFERENCE photos of the real',
    'product. Your job: produce ONE concise English prompt (under 240 words) for',
    'nano-banana that regenerates the original image fixing the product inside',
    'the mask so it matches the reference (correct logo, packaging text, color',
    'accuracy, geometry, label placement), while preserving the original',
    'lighting, shadows, reflections, perspective and scene. Be explicit about',
    'the brand text, colors and packaging details you see in the references.',
    'Output the prompt as a single paragraph, no preamble.'
  ].join(' '),
  'change-product': [
    'You are a senior advertising photo retoucher.',
    'You receive: (1) the ORIGINAL ad image, (2) a MASK highlighting the zone',
    'where the current product lives, and (3) one or more REFERENCE photos of a',
    'DIFFERENT product that should replace it. Produce ONE concise English',
    'prompt (under 240 words) for nano-banana that regenerates the original',
    'image swapping the product inside the masked zone for the reference',
    'product. Match the original scene: lighting direction, shadows, surface',
    'contact, perspective, color grading. Keep the same camera framing,',
    'background and any text outside the mask. Be explicit about the new',
    'product packaging, logo and colors as seen in the references. Output the',
    'prompt as a single paragraph, no preamble.'
  ].join(' ')
};

async function generateEditPromptWithVision({ apiKey, imageUrl, maskUrl, userInstruction, mode, productName, productImageUrls, referenceImageUrl }) {
  const effectiveMode = MODE_SYSTEM_PROMPTS[mode] ? mode : 'remove';
  const system = MODE_SYSTEM_PROMPTS[effectiveMode];

  const userTextParts = [];
  if (userInstruction) {
    userTextParts.push(`User instruction (Spanish, may be informal): "${userInstruction}"`);
  }
  if (productName) {
    userTextParts.push(`Target product name: ${productName}`);
  }
  userTextParts.push('Task: write the regeneration prompt now. Only change what falls inside the painted mask zone, keep everything else identical.');

  const userContent = [
    { type: 'text', text: userTextParts.join('\n\n') },
    { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
    { type: 'image_url', image_url: { url: maskUrl, detail: 'low' } }
  ];

  // Adjuntar hasta 3 imagenes adicionales (referencia + producto), priorizando referencia.
  const extraImages = [];
  if (referenceImageUrl) extraImages.push(referenceImageUrl);
  for (const u of (productImageUrls || [])) {
    if (extraImages.length >= 3) break;
    if (typeof u === 'string' && u && extraImages[extraImages.length - 1] !== u) extraImages.push(u);
  }
  for (const u of extraImages) {
    userContent.push({ type: 'image_url', image_url: { url: u, detail: 'high' } });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ],
      temperature: 0.3,
      max_tokens: 500
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI HTTP ${res.status}`;
    throw new Error(msg);
  }
  const refined = data?.choices?.[0]?.message?.content?.trim();
  if (!refined) throw new Error('OpenAI no devolvio un prompt');
  const usage = data?.usage || {};
  return {
    refinedPrompt: refined,
    inputTokens: Number(usage.prompt_tokens || 0),
    outputTokens: Number(usage.completion_tokens || 0)
  };
}

async function createKieTask({ headers, prompt, imageUrl, aspectRatio, extraImages }) {
  const imageInput = [imageUrl];
  for (const u of (extraImages || [])) {
    if (imageInput.length >= 4) break;
    if (typeof u === 'string' && /^https?:\/\//i.test(u) && !imageInput.includes(u)) imageInput.push(u);
  }
  const payload = {
    model: KIE_MODEL,
    input: {
      prompt,
      image_input: imageInput,
      aspect_ratio: ALLOWED_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : 'auto',
      output_format: 'png'
    }
  };
  const callBackUrl = process.env.KIE_NANO_CALLBACK_URL || '';
  if (callBackUrl && callBackUrl.startsWith('http')) payload.callBackUrl = callBackUrl.trim();

  const res = await fetch(`${KIE_BASE}${CREATE_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const rawText = await res.text();
  let data = {};
  try { data = rawText ? JSON.parse(rawText) : {}; } catch (_) { /* noop */ }

  if (!res.ok || data.code !== 200) {
    const errMsg = data.msg || data.message || data.error
      || (res.status === 401 ? 'API Key invalida (revisa KIE_API_KEY)'
        : res.status === 402 ? 'Saldo insuficiente en KIE'
        : `Error al crear tarea (${res.status})`);
    const httpStatus = !res.ok ? (res.status >= 400 ? res.status : 502)
      : (data.code >= 400 && data.code < 600 ? data.code : 502);
    const e = new Error(errMsg);
    e.httpStatus = httpStatus;
    e.kieBody = data;
    throw e;
  }
  const taskId = data.data?.taskId;
  if (!taskId) throw new Error('KIE no devolvio taskId');
  return String(taskId);
}

async function chargeCredits({ env, organizationId, userId, kieTaskId, usdCost, metadata }) {
  const res = await fetch(`${env.url}/rest/v1/rpc/use_credits_numeric`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_organization_id: organizationId,
      p_user_id: userId,
      p_credits_amount: CREDITS_PER_EDIT,
      p_kind: 'tool_call',
      p_usd_cost: usdCost,
      p_source_table: 'system_ai_outputs',
      p_source_id: kieTaskId,
      p_metadata: metadata
    })
  });
  const out = await res.json().catch(() => null);
  return { ok: res.ok && out !== false, status: res.status, body: out };
}

exports.handler = async (event) => {
  const c = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: c, body: '' };
  if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

  const tooBig = checkBodySize(event, 8 * 1024 * 1024);
  if (tooBig) return tooBig;

  const user = await requireAuth(event);
  if (!user) return fail(event, 401, 'No autorizado. Se requiere sesion activa.');

  const kieHeaders = getKieAuthHeaders();
  if (!kieHeaders) return fail(event, 500, 'KIE_API_KEY no configurada en Netlify');
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return fail(event, 500, 'OPENAI_API_KEY no configurada en Netlify');

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (_) {
    return fail(event, 400, 'Body JSON invalido');
  }

  const imageUrl = String(body.image_url || '').trim();
  const maskDataUrl = String(body.mask_data_url || '').trim();
  const userInstruction = String(body.user_instruction || '').trim();
  const sourceOutputId = String(body.source_output_id || '').trim() || null;
  const organizationId = String(body.organization_id || '').trim();
  const aspectRatio = String(body.aspect_ratio || 'auto').trim();
  const mode = String(body.mode || 'remove').trim();
  const productId = String(body.product_id || '').trim() || null;
  const productName = String(body.product_name || '').trim() || null;
  const referenceImageUrl = String(body.reference_image_url || '').trim() || null;
  const productImageUrls = Array.isArray(body.product_image_urls)
    ? body.product_image_urls.filter(u => typeof u === 'string' && validateExternalUrl(u).ok).slice(0, 3)
    : [];

  const urlCheck = validateExternalUrl(imageUrl);
  if (!urlCheck.ok) return fail(event, 400, `image_url invalida: ${urlCheck.reason}`);
  if (referenceImageUrl) {
    const refCheck = validateExternalUrl(referenceImageUrl);
    if (!refCheck.ok) return fail(event, 400, `reference_image_url invalida: ${refCheck.reason}`);
  }
  if (!userInstruction) return fail(event, 400, 'user_instruction requerido');
  if (!organizationId) return fail(event, 400, 'organization_id requerido');
  const parsedMask = parseDataUrl(maskDataUrl);
  if (!parsedMask) return fail(event, 400, 'mask_data_url debe ser un data URL PNG/JPEG valido');

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  let mask;
  try {
    mask = await uploadMask({ env, userId: user.id, buffer: parsedMask.buffer, mime: parsedMask.mime });
  } catch (e) {
    return fail(event, 500, `No se pudo subir la mascara: ${e.message}`);
  }

  let refinedPrompt, inputTokens, outputTokens;
  try {
    ({ refinedPrompt, inputTokens, outputTokens } = await generateEditPromptWithVision({
      apiKey: openaiKey,
      imageUrl,
      maskUrl: mask.publicUrl,
      userInstruction,
      mode,
      productName,
      productImageUrls,
      referenceImageUrl
    }));
  } catch (e) {
    return fail(event, 502, `OpenAI no pudo generar el prompt: ${e.message}`);
  }

  // Imagenes adicionales para kie image_input: priorizar referencia, luego producto.
  const kieExtraImages = [];
  if (referenceImageUrl) kieExtraImages.push(referenceImageUrl);
  for (const u of productImageUrls) {
    if (kieExtraImages.length >= 3) break;
    if (!kieExtraImages.includes(u)) kieExtraImages.push(u);
  }

  let kieTaskId;
  try {
    kieTaskId = await createKieTask({
      headers: kieHeaders,
      prompt: refinedPrompt,
      imageUrl,
      aspectRatio,
      extraImages: kieExtraImages
    });
  } catch (e) {
    return fail(event, e.httpStatus || 502, `KIE: ${e.message}`, { kieBody: e.kieBody });
  }

  // Estimacion de USD para el ledger (tokens OpenAI ~ centavos + kie nano ~ $0.04).
  const usdCost = (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000 + 0.04;
  const charge = await chargeCredits({
    env,
    organizationId,
    userId: user.id,
    kieTaskId,
    usdCost: Math.round(usdCost * 10000) / 10000,
    metadata: {
      operation: 'image_edit',
      mode,
      product_id: productId,
      kie_task_id: kieTaskId,
      kie_model: KIE_MODEL,
      openai_model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      source_output_id: sourceOutputId
    }
  });
  if (!charge.ok) {
    return fail(event, 402, 'Creditos insuficientes para aplicar la edicion', {
      taskId: kieTaskId,
      credits_needed: CREDITS_PER_EDIT
    });
  }

  return {
    statusCode: 200,
    headers: c,
    body: JSON.stringify({
      taskId: kieTaskId,
      refined_prompt: refinedPrompt,
      mask_storage_path: mask.storagePath,
      mask_public_url: mask.publicUrl,
      kie_model: KIE_MODEL,
      openai_model: OPENAI_MODEL,
      credits_charged: CREDITS_PER_EDIT
    })
  };
};
