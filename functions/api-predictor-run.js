/**
 * Netlify Function: /api/predictor/run
 *
 * Proxy para lanzar una prediccion sin "Mixed Content": el frontend corre en
 * HTTPS y ai-engine en HTTP, asi que el POST se hace server-side.
 *
 * SOLO el lanzamiento pasa por aqui. Los resultados los lee la vista directo de
 * Supabase con la RLS de `predictor_runs` — no hay motivo para proxiar lecturas.
 *
 * ai-engine responde 202 rapido (registra la fila y levanta el proceso); la
 * corrida en si dura minutos u horas y se sondea despues desde la tabla.
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
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return {
      statusCode: 401,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "Falta la sesión. Vuelve a iniciar sesión." }),
    };
  }

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return {
      statusCode: 400,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "Body JSON inválido" }),
    };
  }

  const { organizationId, brandContainerId, titulo, pregunta, contextoExtra, rondas, plataforma } = body;

  if (!organizationId || !String(pregunta || "").trim()) {
    return {
      statusCode: 400,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "Faltan la organización o la pregunta." }),
    };
  }

  const base = normalizeBase(process.env.AI_ENGINE_URL || "");
  if (!base) {
    return {
      statusCode: 500,
      headers: corsHeaders(event),
      body: JSON.stringify({
        error: "AI_ENGINE_URL no configurada. Define la variable de entorno en Netlify Dashboard.",
      }),
    };
  }

  // ai-engine solo registra la fila y levanta el proceso: responde en 1-3s.
  // Las Netlify Functions cortan a los 10s; abortamos a 9 para devolver un JSON
  // legible en vez de un 502 crudo del edge.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9_000);

  let upstream;
  try {
    upstream = await fetch(`${base}/predictor/run`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        organizationId,
        brandContainerId: brandContainerId || null,
        titulo: titulo || null,
        pregunta,
        contextoExtra: contextoExtra || null,
        rondas: rondas || undefined,
        plataforma: plataforma || undefined,
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const abortado = e && e.name === "AbortError";
    return {
      statusCode: abortado ? 504 : 502,
      headers: corsHeaders(event),
      body: JSON.stringify({
        error: abortado
          ? "El motor tardó demasiado en aceptar la predicción. Reintenta."
          : "No se pudo contactar al motor de predicción.",
      }),
    };
  }
  clearTimeout(timeoutId);

  const texto = await upstream.text();
  return {
    statusCode: upstream.status,
    headers: { ...corsHeaders(event), "Content-Type": "application/json" },
    body: texto || JSON.stringify({ ok: upstream.ok }),
  };
};
