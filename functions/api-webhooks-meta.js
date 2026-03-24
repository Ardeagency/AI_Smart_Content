/**
 * api-webhooks-meta
 * Recibe notificaciones de webhooks de Meta (Facebook / Instagram).
 *
 * Procesa:
 *   - deauthorize: usuario revocó permisos desde Facebook Settings
 *                  → marca la integración como inactiva en Supabase
 *   - data_deletion: solicitud de eliminación de datos del usuario
 *                    → elimina tokens e integración de Supabase
 *                    → obligatorio para cumplimiento Meta Platform Policy
 *
 * GET  /api/webhooks/meta  → verificación de suscripción (hub.challenge)
 * POST /api/webhooks/meta  → eventos de webhook
 */

const crypto = require('crypto');
const { corsHeaders, getSupabaseEnv, supabaseRest } = require('./lib/ai-shared');

function getVerifyToken() { return String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim(); }
function getAppSecret()   { return process.env.META_APP_SECRET || ''; }

function secureCompare(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function verifySignature(event) {
  const appSecret = getAppSecret();
  if (!appSecret) return false;
  const sigHeader = event.headers?.['x-hub-signature-256'] || event.headers?.['X-Hub-Signature-256'] || '';
  if (!sigHeader.startsWith('sha256=')) return false;
  const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body || {});
  const computed = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  return secureCompare(sigHeader.slice('sha256='.length), computed);
}

// ── Deauthorize: usuario revocó permisos ──────────────────────────────────────
// Meta envía: { signed_request: "..." } con el user_id del usuario
async function handleDeauthorize(env, entry) {
  const userId = entry?.uid || entry?.user_id || entry?.id;
  if (!userId) return;

  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'PATCH',
      searchParams: {
        external_account_id: `eq.${userId}`,
        platform: `eq.facebook`,
        is_active: `eq.true`
      },
      body: [{ is_active: false, updated_at: new Date().toISOString() }]
    });
  } catch (e) {
    console.error('[webhook] deauthorize update failed:', e?.message);
  }
}

// ── Data deletion: Meta Platform Policy requiere endpoint de eliminación ──────
// Meta envía un signed_request con el user_id.
// Se deben eliminar TODOS los datos del usuario relacionados con el app.
async function handleDataDeletion(env, signedRequest, appSecret) {
  let userId = null;
  try {
    const [, payload] = String(signedRequest || '').split('.');
    if (payload) {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      userId = data?.user_id || data?.uid;
    }
  } catch (_) {}

  if (!userId) return null;

  try {
    // Eliminar todas las integraciones del usuario con Meta
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'DELETE',
      searchParams: { external_account_id: `eq.${userId}`, platform: `eq.facebook` }
    });
  } catch (e) {
    console.error('[webhook] data deletion failed:', e?.message);
  }

  return userId;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };

  // ── Webhook verification handshake ────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const mode      = event.queryStringParameters?.['hub.mode'];
    const token     = String(event.queryStringParameters?.['hub.verify_token'] || '').trim();
    const challenge = event.queryStringParameters?.['hub.challenge'];
    const verifyToken = getVerifyToken();

    if (mode === 'subscribe' && challenge && verifyToken && secureCompare(token, verifyToken)) {
      return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: String(challenge) };
    }

    const reason = !verifyToken ? 'META_WEBHOOK_VERIFY_TOKEN not configured' : 'verify_token mismatch';
    return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Webhook verification failed', reason }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!verifySignature(event)) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid webhook signature' }) };
  }

  let payload = {};
  try {
    payload = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (_) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON payload' }) };
  }

  // ACK immediately to avoid Meta retries (must respond < 20s)
  // Process events asynchronously after ACK
  const object = String(payload?.object || '');
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  // Initialize Supabase env for event processing
  let env = null;
  try { env = getSupabaseEnv(); } catch (_) {}

  if (env) {
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const field = String(change?.field || '');

        // User deauthorized the app from their Facebook settings
        if (field === 'deauthorize') {
          await handleDeauthorize(env, { uid: entry.id, ...change.value }).catch(e =>
            console.error('[webhook] deauthorize handler error:', e?.message)
          );
        }
      }
    }

    // Data deletion request (sent as standalone, not as change field)
    if (payload?.signed_request) {
      const appSecret = getAppSecret();
      const deletedUserId = await handleDataDeletion(env, payload.signed_request, appSecret).catch(e => {
        console.error('[webhook] data deletion handler error:', e?.message);
        return null;
      });

      // Meta requires a confirmation URL response for data deletion requests
      if (deletedUserId) {
        const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify({
            url: `${siteUrl}/data-deletion-status`,
            confirmation_code: crypto.createHash('sha256').update(deletedUserId).digest('hex').slice(0, 16)
          })
        };
      }
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({ received: true, object, entry_count: entries.length })
  };
};
