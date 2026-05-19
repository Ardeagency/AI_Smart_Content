/**
 * Netlify Function: POST /api/demo-event
 *
 * Lightweight, fire-and-forget telemetry endpoint used by the public demo flow.
 * Accepts navigator.sendBeacon payloads — no auth required, so it MUST refuse
 * unbounded writes and never echo input back to the client.
 *
 * Saved to public.demo_events (service_role only, RLS-locked otherwise).
 */

const { corsHeaders } = require('./lib/ai-shared');
const { checkRateLimit } = require('./lib/rate-limiter');

const ALLOWED_EVENT_NAMES = new Set([
  'demo_session_started',
  'cta_modal_opened',
  'cta_modal_signup_clicked',
  'demo_page_view'
]);

const MAX_BODY_BYTES = 4 * 1024;

function clientIp(event) {
  return (
    event.headers?.['x-nf-client-connection-ip'] ||
    (event.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: '' };
  }

  // Cheap abuse guard — 60 events/IP/min, in-memory across warm container.
  const rl = checkRateLimit(event, { maxRequests: 60, windowMs: 60_000, keyPrefix: 'demo-event' });
  if (rl.blocked) {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  if (!event.body || event.body.length > MAX_BODY_BYTES) {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body);
  } catch (_) {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  const name = typeof parsed.name === 'string' ? parsed.name : '';
  if (!ALLOWED_EVENT_NAMES.has(name)) {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (_) {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  const url = process.env.SUPABASE_DATABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const crypto = require('crypto');
  const ipHash = crypto.createHash('sha256').update(clientIp(event)).digest('hex').slice(0, 32);

  // Auth header is optional — if present, surface the user_id for funnel joins.
  let userId = null;
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1] + '==', 'base64').toString('utf8'));
      if (payload && typeof payload.sub === 'string') userId = payload.sub;
    } catch (_) { /* ignore */ }
  }

  const payload = (typeof parsed.payload === 'object' && parsed.payload !== null) ? parsed.payload : {};
  const path = typeof parsed.path === 'string' ? parsed.path.slice(0, 500) : null;
  const ua = (event.headers?.['user-agent'] || '').slice(0, 500);

  await sb.from('demo_events').insert({
    user_id: userId,
    name,
    payload,
    path,
    ip_hash: ipHash,
    user_agent: ua
  }).catch(() => { /* swallow — telemetry must never break UX */ });

  // 204 No Content — sendBeacon doesn't read response bodies anyway.
  return { statusCode: 204, headers: corsHeaders(event), body: '' };
};
