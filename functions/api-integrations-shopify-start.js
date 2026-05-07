/**
 * api-integrations-shopify-start
 *
 * GET /api/integrations/shopify/start
 *   ?shop=mitienda.myshopify.com
 *   &brand_container_id=<uuid>
 *   &return_to=/brand-storage
 *
 * Headers: Authorization: Bearer {supabase_access_token}
 *
 * Devuelve: { authorize_url }
 *
 * El frontend hace window.location.href = authorize_url.
 * Patrón idéntico a api-integrations-facebook-start.js
 */
const crypto = require('crypto');
const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');
const { checkRateLimit } = require('./lib/rate-limiter');

const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function validateShopDomain(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return SHOP_DOMAIN_REGEX.test(cleaned) ? cleaned : null;
}

function getRedirectUri() {
  const base = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : 'http://localhost:8888';
  return `${base}/brand-integration-callback`;
}

function buildSignedState(payload) {
  const secret = process.env.OAUTH_STATE_SECRET || '';
  if (!secret) throw new Error('OAUTH_STATE_SECRET env var is required');
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

async function assertBrandContainerAccess({ env, accessToken, brandContainerId }) {
  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) {
    const err = new Error('Invalid session'); err.statusCode = 401; throw err;
  }

  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brandContainerId}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) { const err = new Error('Brand not found'); err.statusCode = 404; throw err; }

  if (bc.user_id !== user.id) {
    if (!bc.organization_id) {
      const err = new Error('No autorizado para esta marca'); err.statusCode = 403; throw err;
    }
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: bc.organization_id, userId: user.id });
  }
  return { user, bc };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  const rl = checkRateLimit(event, { maxRequests: 10, windowMs: 60000, keyPrefix: 'oauth-shopify' });
  if (rl.blocked) {
    return {
      statusCode: 429,
      headers:    { ...corsHeaders(event), 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      body:       JSON.stringify({ error: 'Too many requests. Try again in a moment.' })
    };
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  const shopRaw          = event.queryStringParameters?.shop;
  const brandContainerId = event.queryStringParameters?.brand_container_id;
  const returnTo         = event.queryStringParameters?.return_to || '/brand-storage';

  const shop = validateShopDomain(shopRaw);
  if (!shop) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid shop domain. Expected: mitienda.myshopify.com' }) };
  }
  if (!brandContainerId) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }

  let auth;
  try { auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId }); }
  catch (e) { return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  const apiKey = process.env.SHOPIFY_API_KEY || '';
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing SHOPIFY_API_KEY env var' }) };
  }

  const redirectUri = getRedirectUri();
  const scopes      = (process.env.SHOPIFY_OAUTH_SCOPES || '').replace(/\s+/g, '');

  let state;
  try {
    state = buildSignedState({
      platform:           'shopify',
      shop,
      brand_container_id: brandContainerId,
      organization_id:    auth.bc.organization_id || null,
      return_to:          returnTo,
      uid:                auth.user.id,
      iat:                Date.now()
    });
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  // Shopify authorize URL — formato comma-separated en `scope`
  const authorizeUrl =
    `https://${shop}/admin/oauth/authorize?` +
    `client_id=${encodeURIComponent(apiKey)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return {
    statusCode: 200,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorize_url: authorizeUrl })
  };
};
