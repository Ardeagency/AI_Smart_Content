/**
 * Netlify Function: solo crear tarea de video en KIE (api.kie.ai, modelo kling-3.0/video).
 * No usamos la API oficial de Kling. POST con body: mode, prompt (o multi_shots), duration, aspect_ratio, sound, kling_elements.
 * Responde de inmediato con { taskId }. No espera la generación del video (evita timeout serverless).
 * Arquitectura asíncrona: el frontend hace polling a kling-video-status o usa callBackUrl.
 */

const shared = require('./lib/kie-video-shared');
const { getSupabaseEnv } = require('./lib/ai-shared');

// Cobro: KIE Kling real cost + OpenAI tokens cost + $5 markup.
// Pricing oficial KIE kling-3.0/video (2026):
//   Standard: no-audio $0.07/s · with-audio $0.10/s
//   Pro:      no-audio $0.09/s · with-audio $0.135/s
//   4K:       $0.335/s (regardless of audio)
// Cualquiera de los 5 valores puede overridarse via env si KIE ajusta.
const KIE_KLING_STD_NOAUDIO_USD_PER_SEC = Number(process.env.KIE_KLING_STD_NOAUDIO_USD_PER_SEC || 0.07);
const KIE_KLING_STD_AUDIO_USD_PER_SEC = Number(process.env.KIE_KLING_STD_AUDIO_USD_PER_SEC || 0.10);
const KIE_KLING_PRO_NOAUDIO_USD_PER_SEC = Number(process.env.KIE_KLING_PRO_NOAUDIO_USD_PER_SEC || 0.09);
const KIE_KLING_PRO_AUDIO_USD_PER_SEC = Number(process.env.KIE_KLING_PRO_AUDIO_USD_PER_SEC || 0.135);
const KIE_KLING_4K_USD_PER_SEC = Number(process.env.KIE_KLING_4K_USD_PER_SEC || 0.335);
const VIDEO_MARKUP_USD = Number(process.env.VIDEO_MARKUP_USD || 5);
const OPENAI_INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OPENAI_OUTPUT_USD_PER_TOKEN = 0.60 / 1_000_000;

function klingUsdPerSec({ mode, sound, is4k }) {
  if (is4k) return KIE_KLING_4K_USD_PER_SEC;
  if (mode === 'pro') return sound ? KIE_KLING_PRO_AUDIO_USD_PER_SEC : KIE_KLING_PRO_NOAUDIO_USD_PER_SEC;
  return sound ? KIE_KLING_STD_AUDIO_USD_PER_SEC : KIE_KLING_STD_NOAUDIO_USD_PER_SEC;
}

function computeVideoCharge({ mode, sound, is4k, durationSec, inputTokens, outputTokens }) {
  const perSec = klingUsdPerSec({ mode, sound, is4k });
  const kieUsd = perSec * durationSec;
  const openaiUsd = inputTokens * OPENAI_INPUT_USD_PER_TOKEN + outputTokens * OPENAI_OUTPUT_USD_PER_TOKEN;
  const totalUsd = kieUsd + openaiUsd + VIDEO_MARKUP_USD;
  return {
    credits: Math.round(totalUsd * 10000) / 10000,
    breakdown: {
      kie_usd_per_sec: perSec,
      kie_usd: Math.round(kieUsd * 10000) / 10000,
      openai_usd: Math.round(openaiUsd * 100000) / 100000,
      markup_usd: VIDEO_MARKUP_USD
    }
  };
}

async function chargeCredits({ env, organizationId, userId, kieTaskId, creditsAmount, metadata }) {
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
      p_credits_amount: creditsAmount,
      p_kind: 'tool_call',
      p_usd_cost: creditsAmount,
      p_source_table: 'system_ai_outputs',
      p_source_id: kieTaskId,
      p_metadata: metadata
    })
  });
  const out = await res.json().catch(() => null);
  return { ok: res.ok && out !== false, status: res.status, body: out };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: shared.corsHeaders(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: 'Método no permitido. Usa POST.' })
    };
  }

  const user = await shared.requireAuth(event);
  if (!user) {
    return {
      statusCode: 401,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: 'No autorizado. Se requiere sesión activa.' })
    };
  }

  const headers = shared.getKieAuthHeaders();
  if (!headers) {
    return {
      statusCode: 500,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: 'Configura KIE_API_KEY en Netlify (Dashboard → Site settings → Environment variables)' })
    };
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return { statusCode: 400, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'Body JSON inválido' }) };
  }

  const organizationId = String(body.organization_id || '').trim();
  if (!organizationId) {
    return { statusCode: 400, headers: shared.corsHeaders(event), body: JSON.stringify({ error: 'organization_id requerido para cobrar creditos' }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return { statusCode: 500, headers: shared.corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  let createResp;
  try {
    createResp = await shared.handleCreate(body, headers, event);
  } catch (err) {
    console.error('kling-video-create error:', err);
    return {
      statusCode: 500,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }

  // Si KIE no acepto la tarea, no cobramos.
  if (createResp.statusCode !== 200) return createResp;

  let parsedCreate;
  try { parsedCreate = JSON.parse(createResp.body); }
  catch (_) { return createResp; }
  const kieTaskId = parsedCreate.taskId;
  if (!kieTaskId) return createResp;

  const durationSec = Math.min(12, Math.max(1, Math.round(Number(body.duration || 5))));
  const mode = body.mode === 'pro' ? 'pro' : 'std';
  const sound = body.sound === true || body.sound === 'true';
  const is4k = body.is_4k === true || body.is_4k === 'true' || body.quality === '4k';
  const inputTokens = Math.max(0, Number(body.openai_input_tokens || 0));
  const outputTokens = Math.max(0, Number(body.openai_output_tokens || 0));
  const { credits, breakdown } = computeVideoCharge({ mode, sound, is4k, durationSec, inputTokens, outputTokens });

  const charge = await chargeCredits({
    env,
    organizationId,
    userId: user.id,
    kieTaskId,
    creditsAmount: credits,
    metadata: {
      operation: 'video_generated',
      kie_task_id: kieTaskId,
      kie_model: 'kling-3.0/video',
      kling_mode: mode,
      kling_sound: sound,
      kling_is_4k: is4k,
      kling_duration_sec: durationSec,
      openai_model: body.openai_model || 'gpt-4o-mini',
      openai_input_tokens: inputTokens,
      openai_output_tokens: outputTokens,
      cost_breakdown_usd: breakdown
    }
  });

  if (!charge.ok) {
    return {
      statusCode: 402,
      headers: shared.corsHeaders(event),
      body: JSON.stringify({ error: 'Creditos insuficientes para generar el video', credits_needed: credits, taskId: kieTaskId })
    };
  }

  // Enriquecer la respuesta de createTask con info de cobro.
  return {
    statusCode: 200,
    headers: shared.corsHeaders(event),
    body: JSON.stringify({ ...parsedCreate, credits_charged: credits, cost_breakdown: breakdown })
  };
};
