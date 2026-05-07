/**
 * api-webhooks-shopify
 *
 * Receiver genérico para todos los webhooks Shopify.
 *
 * POST /api/webhooks/shopify/{resource}/{action}
 *   ej: /api/webhooks/shopify/products/create
 *       /api/webhooks/shopify/customers/data_request  (GDPR)
 *
 * Flow (D10 — async):
 *   1. Verifica HMAC SHA256 (header X-Shopify-Hmac-Sha256, base64) sobre raw body.
 *   2. INSERT siempre en integration_webhooks_log (incluido si HMAC inválido — auditoría).
 *   3. Si HMAC inválido → 401.
 *   4. Si HMAC válido → encola job en agent_queue_jobs (job_type='mission',
 *      mission_type='shopify_webhook_received') para que el ai-engine procese async.
 *   5. Responde 200 INMEDIATO (Shopify timeout 30s).
 *
 * El procesamiento real del webhook (ej. UPDATE products en BD, trigger Vera analysis)
 * vive en ai-engine — fase 2B.
 */
const crypto = require('crypto');
const { corsHeaders, getSupabaseEnv, supabaseRest } = require('./lib/ai-shared');

const PLATFORM = 'shopify';
const GDPR_TOPICS = new Set(['customers/data_request', 'customers/redact', 'shop/redact']);

function timingSafeEqStrings(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !rawBody || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return timingSafeEqStrings(expected, hmacHeader);
}

exports.handler = async (event) => {
  // Shopify usa solo POST. OPTIONS por si acaso (Shopify no preflight, pero CORS-safe).
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiSecret = process.env.SHOPIFY_API_SECRET || '';
  if (!apiSecret) {
    // Sin secret no podemos verificar nada — fallar silencioso (200 para no aparecer down ante Shopify)
    console.error('[webhook-shopify] SHOPIFY_API_SECRET no configurado');
    return { statusCode: 200, body: 'ok' };
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    console.error('[webhook-shopify] env:', e.message);
    return { statusCode: 200, body: 'ok' };  // 200 a Shopify aun si no podemos loggear
  }

  // Headers Shopify (Netlify normaliza a lowercase)
  const h = event.headers || {};
  const topic              = h['x-shopify-topic']            || 'unknown';
  const shopDomain         = h['x-shopify-shop-domain']      || null;
  const hmacHeader         = h['x-shopify-hmac-sha256']      || null;
  const externalWebhookId  = h['x-shopify-webhook-id']       || null;
  const apiVersion         = h['x-shopify-api-version']      || null;

  // event.body puede venir base64-encoded si Netlify detecta binario
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  const hmacValid = verifyHmac(rawBody, hmacHeader, apiSecret);
  const isGdpr    = GDPR_TOPICS.has(topic);

  // Resolver integration por shop_domain (puede ser null para stores no instaladas)
  let integrationId  = null;
  let organizationId = null;
  if (shopDomain) {
    try {
      const integs = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_integrations', method: 'GET',
        searchParams: { select: 'id,brand_container_id', shop_domain: `eq.${shopDomain}`, platform: 'eq.shopify', limit: '1' }
      });
      const integ = Array.isArray(integs) ? integs[0] : null;
      if (integ) {
        integrationId = integ.id;
        const bcs = await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_containers', method: 'GET',
          searchParams: { select: 'organization_id', id: `eq.${integ.brand_container_id}`, limit: '1' }
        });
        const bc = Array.isArray(bcs) ? bcs[0] : null;
        organizationId = bc?.organization_id || null;
      }
    } catch (e) {
      console.warn('[webhook-shopify] lookup (non-blocking):', e.message);
    }
  }

  // Parsear payload (best-effort)
  let payload = null;
  try { payload = JSON.parse(rawBody); } catch (_) { payload = { _raw_text: rawBody.slice(0, 500) }; }

  // Loggear SIEMPRE (auditoría incluso si HMAC malo)
  let webhookLogId = null;
  try {
    const inserted = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'integration_webhooks_log', method: 'POST',
      searchParams: { select: 'id' },
      body: [{
        brand_integration_id: integrationId,
        organization_id:      organizationId,
        platform:             PLATFORM,
        topic,
        external_webhook_id:  externalWebhookId,
        hmac_verified:        hmacValid,
        is_gdpr_request:      isGdpr,
        gdpr_action_taken:    null,
        payload,
        headers: {
          'x-shopify-topic':       topic,
          'x-shopify-shop-domain': shopDomain,
          'x-shopify-webhook-id':  externalWebhookId,
          'x-shopify-api-version': apiVersion
        },
        processed: false
      }]
    });
    webhookLogId = (Array.isArray(inserted) && inserted[0]?.id) || null;
  } catch (e) {
    console.error('[webhook-shopify] log INSERT failed:', e.message);
  }

  // HMAC inválido → 401 (después de loggear)
  if (!hmacValid) return { statusCode: 401, body: 'Invalid HMAC' };

  // Encolar job para procesamiento async (ai-engine fase 2B)
  if (organizationId && webhookLogId) {
    try {
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'agent_queue_jobs', method: 'POST',
        body: [{
          organization_id: organizationId,
          job_type:        'mission',
          priority:        isGdpr ? 8 : 4,  // GDPR alta prioridad
          payload: {
            mission_type:         'shopify_webhook_received',
            webhook_log_id:       webhookLogId,
            brand_integration_id: integrationId,
            shop_domain:          shopDomain,
            topic
          },
          status: 'queued'
        }]
      });
    } catch (e) {
      console.warn('[webhook-shopify] enqueue (non-blocking):', e.message);
    }
  }

  // 200 inmediato — Shopify exige <30s
  return { statusCode: 200, body: 'ok' };
};
