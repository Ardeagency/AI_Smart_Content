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
const { checkRateLimit } = require("./lib/rate-limiter");

function normalizeBase(url) {
  const u = String(url || "").trim().replace(/\/+$/, "");
  return u;
}

/**
 * Decode the JWT payload without verifying the signature. Supabase already
 * validated it on the auth endpoint; here we only need the is_anonymous claim
 * to decide whether to apply demo rate limits.
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : '';
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

/**
 * Demo limits — anonymous visitors should be able to feel Vera, not abuse it.
 *  - Per-IP: 5 messages per hour (in-memory; resets with cold start, fine)
 *  - Global anon cap: enforced via demo_rate_limits table to survive cold starts
 */
const DEMO_PER_IP_LIMIT = 5;
const DEMO_PER_IP_WINDOW_MS = 60 * 60 * 1000;
const DEMO_GLOBAL_HOURLY_LIMIT = 100;

async function checkAndBumpGlobalAnonLimit(event) {
  // Lazy require: only loaded when an anon user actually hits the endpoint.
  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (_) {
    // Supabase SDK not bundled with this function — skip the global cap,
    // per-IP limit + RLS still protect us.
    return { allowed: true };
  }

  const url = process.env.SUPABASE_DATABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return { allowed: true };

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const now = new Date();
  const bucket = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0
  )).toISOString();

  const { data: rows, error } = await sb
    .from('demo_rate_limits')
    .select('count')
    .eq('hour_bucket', bucket);
  if (error) return { allowed: true }; // never block on telemetry failure

  const total = (rows || []).reduce((s, r) => s + (r.count || 0), 0);
  if (total >= DEMO_GLOBAL_HOURLY_LIMIT) {
    return { allowed: false, reason: 'global' };
  }

  const crypto = require('crypto');
  const ip = (event.headers && (event.headers['x-nf-client-connection-ip']
    || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()))
    || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);

  // Atomic insert-or-increment via RPC. Failure is non-fatal — better to let
  // a chat through than block on rate-limit telemetry.
  await sb.rpc('demo_bump_rate_limit', { p_ip: ipHash, p_bucket: bucket }).catch(() => {});

  return { allowed: true };
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

  let body = {};
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return {
      statusCode: 400,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "Body JSON inválido" }),
    };
  }

  const { organization_id, conversation_id, message } = body;
  if (!organization_id || typeof message !== "string" || !message.trim()) {
    return {
      statusCode: 400,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: "organization_id y message son requeridos" }),
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

  // Demo session? Apply soft + hard rate limits before forwarding to ai-engine.
  const claims = decodeJwtPayload(accessToken);
  const isAnonymous = !!(claims && claims.is_anonymous === true);
  if (isAnonymous) {
    const perIp = checkRateLimit(event, {
      maxRequests: DEMO_PER_IP_LIMIT,
      windowMs: DEMO_PER_IP_WINDOW_MS,
      keyPrefix: 'demo-vera'
    });
    if (perIp.blocked) {
      return {
        statusCode: 429,
        headers: corsHeaders(event),
        body: JSON.stringify({
          error: "demo_rate_limited",
          message: "Llegaste al límite de mensajes del preview. Crea tu cuenta para conversar sin restricciones.",
          retry_after_ms: perIp.retryAfterMs
        })
      };
    }
    const globalGate = await checkAndBumpGlobalAnonLimit(event);
    if (!globalGate.allowed) {
      return {
        statusCode: 429,
        headers: corsHeaders(event),
        body: JSON.stringify({
          error: "demo_global_capacity",
          message: "El preview está saturado en este momento. Intenta en unos minutos o crea tu cuenta."
        })
      };
    }
  }

  const aiEngineBaseUrl = normalizeBase(process.env.AI_ENGINE_URL || "");
  if (!aiEngineBaseUrl) {
    return {
      statusCode: 500,
      headers: corsHeaders(event),
      body: JSON.stringify({
        error: "AI_ENGINE_URL no configurada. Define la variable de entorno en Netlify Dashboard.",
      }),
    };
  }

  const targetUrl = `${aiEngineBaseUrl}/chat`;

  // ai-engine responde con { status: "processing" } tras auth + 4 llamadas a Supabase.
  // En condiciones normales tarda 1-3s. Las Netlify Functions tienen timeout
  // default de 10s — abortamos a 9s para que el catch devuelva un JSON 504
  // amigable en vez de que el edge mate la función y devuelva 502 crudo.
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
      body: JSON.stringify({ organization_id, conversation_id, message }),
    });
  } catch (e) {
    const isTimeout = e?.name === "AbortError";
    return {
      statusCode: isTimeout ? 504 : 502,
      headers: corsHeaders(event),
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
    headers: corsHeaders(event),
    body: text,
  };
};

