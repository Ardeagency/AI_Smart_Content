/**
 * Netlify Function: /api/ai/engine-chat
 *
 * Proxy para llamar a ai-engine sin "Mixed Content":
 * - El frontend corre en HTTPS.
 * - ai-engine corre típicamente en HTTP (ej: :3000).
 * El browser bloquearía llamadas HTTP directas, así que aquí el POST
 * se hace server-side y el browser solo consume este endpoint HTTPS.
 */

const { corsHeaders, getBearerToken } = require("./lib/ai-shared");

function normalizeBase(url) {
  const u = String(url || "").trim().replace(/\/+$/, "");
  return u;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  let body = {};
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Body JSON inválido" }),
    };
  }

  const { organization_id, conversation_id, message } = body;
  if (!organization_id || typeof message !== "string" || !message.trim()) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "organization_id y message son requeridos" }),
    };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return {
      statusCode: 401,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Missing Authorization Bearer token" }),
    };
  }

  const aiEngineBaseUrl = normalizeBase(process.env.AI_ENGINE_URL || "");
  if (!aiEngineBaseUrl) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: "AI_ENGINE_URL no configurada. Define la variable de entorno en Netlify Dashboard.",
      }),
    };
  }

  const targetUrl = `${aiEngineBaseUrl}/chat`;

  // ai-engine ahora responde inmediatamente con { status: "processing" } — < 1s.
  // El timeout de 10s es un margen de seguridad para absorber latencia de red
  // o un arranque lento del servidor. La Lambda nunca debería bloquearse aquí.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ organization_id, conversation_id, message }),
    });
  } catch (e) {
    const isTimeout = e?.name === "AbortError";
    return {
      statusCode: isTimeout ? 504 : 502,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: isTimeout
          ? "El motor de IA tardó demasiado en responder. Intenta de nuevo."
          : "No se pudo conectar al motor de IA. Verifica que el servidor esté activo.",
      }),
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await upstream.text();
  return {
    statusCode: upstream.status,
    headers: corsHeaders(),
    body: text,
  };
};

