/**
 * /api/brand-scrape — proxy a ai-engine /internal/brand-scrape/{start,status}
 *
 * POST /api/brand-scrape           → arranca un job (body: { url, organization_id?, max_pages? })
 *                                   responde { job_id, status }
 * GET  /api/brand-scrape?job_id=X  → estado del job (poll)
 *                                   responde { status, stage, progress, brand_payload?, cost_usd, ... }
 *
 * Env requeridas en Netlify:
 *   - AI_ENGINE_URL              (ej. https://ai-engine.aismartcontent.io)
 *   - INTERNAL_WEBHOOK_SECRET    (mismo valor que /root/ai-engine/.env)
 */

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Content-Type": "application/json",
});

function normalizeBase(url) {
  if (!url) return "";
  return url.replace(/\/+$/, "");
}

exports.handler = async (event) => {
  const cors = corsHeaders(event.headers?.origin);
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };

  const aiEngineUrl = normalizeBase(process.env.AI_ENGINE_URL || "");
  const webhookSecret = process.env.INTERNAL_WEBHOOK_SECRET || "";

  if (!aiEngineUrl || !webhookSecret) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({
        error: "AI_ENGINE_URL o INTERNAL_WEBHOOK_SECRET no configurados en Netlify env. Agregar ambas variables en Site settings → Build & deploy → Environment.",
      }),
    };
  }

  const upstreamHeaders = {
    "Content-Type": "application/json",
    "x-webhook-secret": webhookSecret,
  };

  try {
    if (event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body || "{}"); }
      catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "invalid json body" }) }; }
      if (!body.url) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "url requerido" }) };

      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 9000);
      const upstream = await fetch(`${aiEngineUrl}/internal/brand-scrape/start`, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      const text = await upstream.text();
      return { statusCode: upstream.status, headers: cors, body: text };
    }

    if (event.httpMethod === "GET") {
      const jobId = event.queryStringParameters?.job_id;
      if (!jobId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "job_id requerido" }) };

      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 9000);
      const upstream = await fetch(`${aiEngineUrl}/internal/brand-scrape/status/${encodeURIComponent(jobId)}`, {
        headers: upstreamHeaders,
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      const text = await upstream.text();
      return { statusCode: upstream.status, headers: cors, body: text };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "method not allowed" }) };
  } catch (e) {
    const isTimeout = e?.name === "AbortError";
    return {
      statusCode: isTimeout ? 504 : 502,
      headers: cors,
      body: JSON.stringify({ error: isTimeout ? "ai-engine timeout" : (e?.message || String(e)) }),
    };
  }
};
