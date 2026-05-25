/**
 * Netlify Function: corrige los textos rotos/distorsionados de una imagen
 * usando nano-banana-pro (image-to-image) + OpenAI Vision como bridge.
 *
 * IMPORTANTE: la primera version usaba gpt-image-2-text-to-image. Ese modelo
 * es text-to-image PURO (no acepta image_input) y por lo tanto re-generaba
 * la imagen desde cero — la composicion no se preservaba pixel-perfect.
 * Cambiado a nano-banana-pro que SI es image-to-image: el modelo VE la
 * imagen original + las imagenes de referencia del producto y regenera
 * preservando la escena.
 *
 * Patron:
 *   1. OpenAI gpt-4o-mini Vision lee la imagen ORIGINAL (texto roto) y las
 *      imagenes de REFERENCIA del producto (texto correcto), genera un
 *      prompt corto y especifico para nano-banana-pro que indique SOLO
 *      las correcciones de texto. No necesita describir la escena entera
 *      (el modelo la ve).
 *   2. kie.ai createTask con model=nano-banana-pro,
 *      input.image_input=[imageUrl, ...productImageUrls],
 *      input.prompt=refinedPrompt, input.aspect_ratio.
 *   3. Cobro: 0.10 cred via use_credits_numeric.
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
const KIE_MODEL = process.env.KIE_IMAGE_FIX_TEXT_MODEL || 'nano-banana-pro';
const OPENAI_MODEL = process.env.OPENAI_FIX_TEXT_PROMPT_MODEL || 'gpt-4o-mini';
const CREDITS_PER_FIX_TEXT = 0.10;

// nano-banana-pro acepta los 10 aspect ratios + auto.
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

const SYSTEM_PROMPT = [
  'You are a senior advertising photo retoucher specializing in text correction.',
  'The image generation model (nano-banana-pro, image-to-image) WILL receive',
  'the ORIGINAL image and the product REFERENCE images you are about to see.',
  'It will regenerate from the original — you do NOT need to describe the',
  'entire scene.',
  '',
  'You receive: (1) the ORIGINAL ad image whose printed/painted text is',
  'broken, distorted, or hallucinated; and (2) one or more REFERENCE photos',
  'of the real product showing the correct typography, brand name, labels,',
  'and copy.',
  '',
  'Your job: produce ONE concise English prompt (under 160 words) telling',
  'nano-banana to keep the original image EXACTLY as-is and ONLY correct the',
  'printed text/typography/brand-name in the product zone to match the',
  'reference product photos. Be explicit about:',
  '  - the exact text strings to render (quote them verbatim from references)',
  '  - the font style (display sans-serif / serif / script) and weight',
  '  - the color and placement',
  'Repeat strongly: PRESERVE all other pixels — composition, framing, camera',
  'angle, lighting, shadows, surfaces, materials, background, color grading,',
  'product geometry — UNCHANGED. Do NOT add elements, do NOT change the scene.',
  'Output the prompt as a single paragraph, no preamble, no bullets, no quotes.'
].join(' ');

async function generateFixTextPromptWithVision({ apiKey, imageUrl, productImageUrls, productName }) {
  const userTextParts = [];
  if (productName) {
    userTextParts.push(`Target product: ${productName}`);
  }
  userTextParts.push(
    'Task: write the regeneration prompt now. Focus on getting the typography ' +
    'and any printed text rendered correctly per the reference photos, while ' +
    'keeping the original composition and scene identical.'
  );

  const userContent = [
    { type: 'text', text: userTextParts.join('\n\n') },
    { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
  ];
  for (const u of (productImageUrls || [])) {
    if (userContent.filter(c => c.type === 'image_url').length >= 4) break;
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) {
      userContent.push({ type: 'image_url', image_url: { url: u, detail: 'high' } });
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      temperature: 0.3,
      max_tokens: 700
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

async function createKieTask({ headers, prompt, imageUrl, productImageUrls, aspectRatio }) {
  // nano-banana-pro doc: input.prompt + input.image_input (array URLs) +
  // input.aspect_ratio + input.output_format. image-to-image — el modelo VE
  // la imagen original y la regenera con los cambios indicados en el prompt.
  const imageInput = [imageUrl];
  for (const u of (productImageUrls || [])) {
    if (imageInput.length >= 4) break;
    if (typeof u === 'string' && /^https?:\/\//i.test(u) && !imageInput.includes(u)) {
      imageInput.push(u);
    }
  }
  const ar = ALLOWED_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : 'auto';
  const payload = {
    model: KIE_MODEL,
    input: {
      prompt: String(prompt).slice(0, 2500),
      image_input: imageInput,
      aspect_ratio: ar,
      output_format: 'png'
    }
  };
  const callBackUrl = process.env.KIE_NANO_CALLBACK_URL || '';
  if (callBackUrl && callBackUrl.startsWith('http')) payload.callBackUrl = callBackUrl.trim();

  const r = await fetch(`${KIE_BASE}${CREATE_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const rawText = await r.text();
  let data = {};
  try { data = rawText ? JSON.parse(rawText) : {}; } catch (_) { /* noop */ }

  if (!r.ok || data.code !== 200) {
    const errMsg = data.msg || data.message || data.error
      || (r.status === 401 ? 'API Key invalida (revisa KIE_API_KEY)'
        : r.status === 402 ? 'Saldo insuficiente en KIE'
        : `Error al crear tarea GPT Image-2 (${r.status})`);
    const httpStatus = !r.ok ? (r.status >= 400 ? r.status : 502)
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
      p_credits_amount: CREDITS_PER_FIX_TEXT,
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

  const tooBig = checkBodySize(event, 1 * 1024 * 1024);
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
  const sourceOutputId = String(body.source_output_id || '').trim() || null;
  const organizationId = String(body.organization_id || '').trim();
  const productId = String(body.product_id || '').trim() || null;
  const productName = String(body.product_name || '').trim() || null;
  const aspectRatio = String(body.aspect_ratio || 'auto').trim();
  const productImageUrls = Array.isArray(body.product_image_urls)
    ? body.product_image_urls.filter(u => typeof u === 'string' && validateExternalUrl(u).ok).slice(0, 3)
    : [];

  const urlCheck = validateExternalUrl(imageUrl);
  if (!urlCheck.ok) return fail(event, 400, `image_url invalida: ${urlCheck.reason}`);
  if (!organizationId) return fail(event, 400, 'organization_id requerido');
  if (!productImageUrls.length) {
    return fail(event, 400, 'Se requieren imagenes del producto (product_image_urls) para corregir los textos');
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  let refinedPrompt, inputTokens, outputTokens;
  try {
    ({ refinedPrompt, inputTokens, outputTokens } = await generateFixTextPromptWithVision({
      apiKey: openaiKey,
      imageUrl,
      productImageUrls,
      productName
    }));
  } catch (e) {
    return fail(event, 502, `OpenAI no pudo generar el prompt: ${e.message}`);
  }

  let kieTaskId;
  try {
    kieTaskId = await createKieTask({
      headers: kieHeaders,
      prompt: refinedPrompt,
      imageUrl,
      productImageUrls,
      aspectRatio
    });
  } catch (e) {
    return fail(event, e.httpStatus || 502, `KIE: ${e.message}`, { kieBody: e.kieBody });
  }

  // Estimacion USD: OpenAI tokens + GPT Image-2 ~$0.04
  const usdCost = (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000 + 0.04;

  const charge = await chargeCredits({
    env,
    organizationId,
    userId: user.id,
    kieTaskId,
    usdCost: Math.round(usdCost * 10000) / 10000,
    metadata: {
      operation: 'image_fix_text',
      kie_task_id: kieTaskId,
      kie_model: KIE_MODEL,
      openai_model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      source_output_id: sourceOutputId,
      product_id: productId
    }
  });
  if (!charge.ok) {
    return fail(event, 402, 'Creditos insuficientes para mejorar los textos', {
      taskId: kieTaskId,
      credits_needed: CREDITS_PER_FIX_TEXT
    });
  }

  return {
    statusCode: 200,
    headers: c,
    body: JSON.stringify({
      taskId: kieTaskId,
      refined_prompt: refinedPrompt,
      kie_model: KIE_MODEL,
      openai_model: OPENAI_MODEL,
      aspect_ratio: aspectRatio,
      credits_charged: CREDITS_PER_FIX_TEXT
    })
  };
};
