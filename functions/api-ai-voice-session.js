/**
 * Netlify Function: /api/ai/voice-session
 *
 * Proxy a ai-engine para mintar un signed URL de ElevenLabs Conversational AI.
 * Mismo patrón que api-ai-engine-chat: HTTPS frontend → HTTPS function → ai-engine.
 *
 * El signed URL es one-shot, expira ~15min, y autentica al browser contra
 * el agente Vera SIN exponer la ElevenLabs API key.
 */

const { corsHeaders, getBearerToken } = require("./lib/ai-shared");

function normalizeBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return {
      statusCode: 401,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "Missing Authorization Bearer token" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return {
      statusCode: 400,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { organization_id } = body;
  if (!organization_id) {
    return {
      statusCode: 400,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "Falta organization_id" }),
    };
  }

  const aiEngineBaseUrl = normalizeBase(process.env.AI_ENGINE_URL || "");
  if (!aiEngineBaseUrl) {
    return {
      statusCode: 500,
      headers: corsHeaders(event),
      body: JSON.stringify({
        error: "AI_ENGINE_URL no configurada en Netlify.",
      }),
    };
  }

  const targetUrl = `${aiEngineBaseUrl}/chat/voice/session`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9_000);

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ organization_id }),
    });
  } catch (e) {
    return {
      statusCode: e?.name === "AbortError" ? 504 : 502,
      headers: corsHeaders(event),
      body: JSON.stringify({
        error: "No se pudo conectar al motor de IA para iniciar la sesión de voz.",
      }),
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const upstreamText = await upstream.text();
  return {
    statusCode: upstream.status,
    headers: {
      ...corsHeaders(event),
      "Content-Type": "application/json",
    },
    body: upstreamText,
  };
};
