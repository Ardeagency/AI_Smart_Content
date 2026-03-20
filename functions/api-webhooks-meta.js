const crypto = require('crypto');
const { corsHeaders } = require('./lib/ai-shared');

function getVerifyToken() {
  return String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
}

function getAppSecret() {
  return process.env.META_APP_SECRET || '';
}

function secureCompare(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function verifySignature(event) {
  const appSecret = getAppSecret();
  if (!appSecret) return false;

  const sigHeader =
    event.headers?.['x-hub-signature-256'] ||
    event.headers?.['X-Hub-Signature-256'] ||
    '';

  if (!sigHeader.startsWith('sha256=')) return false;
  const incoming = sigHeader.slice('sha256='.length);

  const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body || {});
  const computed = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  return secureCompare(incoming, computed);
}

function sanitizeEvent(payload) {
  const obj = String(payload?.object || '');
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  return {
    object: obj,
    entry_count: entries.length,
    entries: entries.map((e) => ({
      id: e?.id || null,
      time: e?.time || null,
      changes_count: Array.isArray(e?.changes) ? e.changes.length : 0,
      messaging_count: Array.isArray(e?.messaging) ? e.messaging.length : 0
    }))
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // Meta webhook verification handshake
  if (event.httpMethod === 'GET') {
    const mode = event.queryStringParameters?.['hub.mode'];
    const token = String(event.queryStringParameters?.['hub.verify_token'] || '').trim();
    const challenge = event.queryStringParameters?.['hub.challenge'];
    const verifyToken = getVerifyToken();

    if (mode === 'subscribe' && challenge && verifyToken && secureCompare(token, verifyToken)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: String(challenge)
      };
    }

    return {
      statusCode: 403,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid webhook verification token' })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!verifySignature(event)) {
    return {
      statusCode: 401,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid webhook signature' })
    };
  }

  let payload = {};
  try {
    payload = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (_) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid JSON payload' })
    };
  }

  // IMPORTANT: Keep logs sanitized (no token/session/PII dumps).
  const sanitized = sanitizeEvent(payload);
  console.log('[meta-webhook] event received:', JSON.stringify(sanitized));

  // ACK fast (<20s) to avoid retries; async processing can be added here.
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({ received: true })
  };
};

