/**
 * Netlify Function: corrige los textos rotos/distorsionados de una imagen
 * usando GPT Image-2 (text-to-image) + OpenAI Vision como bridge.
 *
 * GPT Image-2 es text-to-image puro (no acepta image inputs). Por eso usamos
 * el patron bridge:
 *   1. OpenAI gpt-4o-mini Vision lee la imagen ORIGINAL (con texto roto) y
 *      las imagenes de REFERENCIA del producto (con texto correcto), genera
 *      un prompt en ingles para GPT Image-2 que regenere la imagen
 *      conservando composicion / lighting / escena pero con los textos
 *      correctos del producto.
 *   2. kie.ai createTask con model gpt-image-2-text-to-image + el prompt
 *      + aspect_ratio + resolution.
 *   3. Cobro: 0.10 cred via use_credits_numeric.
 *
 * Devuelve { taskId, refined_prompt, kie_model, openai_model, credits_charged }
 * para que el frontend haga polling con kling-video-status?taskId= y al
 * success persista via kie-output-persist (kind='fix-text').
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  checkBodySize
} = require('./lib/ai-shared');

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const CREATE_PATH = '/api/v1/jobs/createTask';
const KIE_MODEL = process.env.KIE_IMAGE_FIX_TEXT_MODEL || 'gpt-image-2-text-to-image';
const OPENAI_MODEL = process.env.OPENAI_FIX_TEXT_PROMPT_MODEL || 'gpt-4o-mini';
const CREDITS_PER_FIX_TEXT = 0.10;

// kie GPT Image-2 acepta estos aspect ratios. Si no matchea, cae a 'auto'.
const ALLOWED_ASPECT_RATIOS = new Set(['auto', '1:1', '9:16', '16:9', '4:3', '3:4']);
const ALLOWED_RESOLUTIONS = new Set(['1K', '2K', '4K']);

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
  'You receive: (1) the ORIGINAL ad image whose printed/painted text is broken,',
  'distorted, or hallucinated; and (2) one or more REFERENCE photos of the real',
  'product showing the correct typography, brand name, labels, and copy.',
  'Your job: produce ONE detailed English prompt (under 280 words) for GPT',
  'Image-2 (text-to-image) that REGENERATES the original image from scratch',
  'preserving the EXACT visual scene — framing, camera angle, subjects, props,',
  'background, surfaces, lighting direction, color grading, shadows, materials,',
  'composition — but with the typography, brand names, and any printed text',
  'rendered CORRECTLY as shown in the reference product photos. Be very',
  'explicit about the exact text strings, font weight (sans-serif display vs.',
  'serif vs. script), color, and placement of each text element. If the original',
  'image has text in the background or signage, preserve it correctly too. Do',
  'NOT add new elements, do NOT change the product or scene. Output the prompt',
  'as a single paragraph, no preamble, no bullets, no quotes.'
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

async function createKieTask({ headers, prompt, aspectRatio, resolution }) {
  // GPT Image-2 doc: input.prompt (required, max 20K chars), input.aspect_ratio,
  // input.resolution. Importante: aspect_ratio=auto solo permite resolution=1K.
  const ar = ALLOWED_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : 'auto';
  let res = ALLOWED_RESOLUTIONS.has(resolution) ? resolution : '2K';
  if (ar === 'auto' || ar === '1:1') res = '1K'; // 1:1 no soporta 4K, auto solo 1K
  const payload = {
    model: KIE_MODEL,
    input: {
      prompt: String(prompt).slice(0, 20000),
      aspect_ratio: ar,
      resolution: res
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
  const resolution = String(body.resolution || '2K').trim();
  const productImageUrls = Array.isArray(body.product_image_urls)
    ? body.product_image_urls.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 3)
    : [];

  if (!/^https?:\/\//i.test(imageUrl)) return fail(event, 400, 'image_url invalida');
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
    kieTaskId = await createKieTask({ headers: kieHeaders, prompt: refinedPrompt, aspectRatio, resolution });
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
      resolution,
      credits_charged: CREDITS_PER_FIX_TEXT
    })
  };
};
