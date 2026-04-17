/**
 * In-memory rate limiter para Netlify Functions.
 *
 * Usa un Map module-scope que vive mientras el container Lambda esté warm
 * (típicamente 5-15 min en Netlify). No persiste entre cold starts ni entre
 * instancias de la función, así que NO es una protección definitiva — pero
 * frena ráfagas desde un mismo IP dentro de la ventana de warm.
 *
 * Para protección real, usar Upstash Redis o Netlify Edge + Deno KV.
 *
 * Uso:
 *   const { checkRateLimit } = require('./lib/rate-limiter');
 *   const blocked = checkRateLimit(event, { maxRequests: 10, windowMs: 60000 });
 *   if (blocked) return { statusCode: 429, ... };
 */

const store = new Map();

const CLEANUP_INTERVAL = 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, timestamps] of store) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}

function getClientIp(event) {
  return (
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers?.['client-ip'] ||
    'unknown'
  );
}

/**
 * @param {object} event - Netlify Function event
 * @param {{ maxRequests?: number, windowMs?: number, keyPrefix?: string }} opts
 * @returns {{ blocked: boolean, remaining: number, retryAfterMs: number }}
 */
function checkRateLimit(event, { maxRequests = 10, windowMs = 60000, keyPrefix = '' } = {}) {
  const ip = getClientIp(event);
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();
  const cutoff = now - windowMs;

  cleanup(windowMs);

  let timestamps = store.get(key) || [];
  timestamps = timestamps.filter(t => t > cutoff);
  timestamps.push(now);
  store.set(key, timestamps);

  const blocked = timestamps.length > maxRequests;
  const remaining = Math.max(0, maxRequests - timestamps.length);
  const retryAfterMs = blocked && timestamps.length > 0
    ? Math.max(0, timestamps[0] + windowMs - now)
    : 0;

  return { blocked, remaining, retryAfterMs };
}

module.exports = { checkRateLimit };
