/**
 * api-integrations-meli-start
 *
 * GET /api/integrations/meli/start
 *   ?brand_container_id=<uuid>
 *   &return_to=/brand-storage
 *
 * Headers: Authorization: Bearer {supabase_access_token}
 *
 * Devuelve: { authorize_url }
 *
 * El frontend hace window.location.href = authorize_url.
 * Patrón idéntico a api-integrations-shopify-start.js, PERO:
 *   - Mercado Libre usa un authorize endpoint GLOBAL por país
 *     (auth.mercadolibre.com.co para Colombia), no un dominio por tienda como
 *     Shopify. Por eso NO se pide shop_domain.
 *   - Los scopes (read/write/offline_access) NO van en la URL: los determina la
 *     configuración de permisos de la app en el devcenter. El authorize URL solo
 *     lleva response_type, client_id, redirect_uri y state.
 *   - App confidencial (secret server-side) => NO se usa PKCE.
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

// Dominio de autorización por país (Colombia por defecto). Configurable por env
// para futuros despliegues multi-país sin tocar código.
const MELI_AUTH_DOMAIN = process.env.MELI_AUTH_DOMAIN || 'auth.mercadolibre.com.co';

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

  const rl = checkRateLimit(event, { maxRequests: 10, windowMs: 60000, keyPrefix: 'oauth-meli' });
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

  const brandContainerId = event.queryStringParameters?.brand_container_id;
  const returnTo         = event.queryStringParameters?.return_to || '/brand-storage';

  if (!brandContainerId) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }

  let auth;
  try { auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId }); }
  catch (e) { return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  const appId = process.env.MELI_APP_ID || '';
  if (!appId) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing MELI_APP_ID env var' }) };
  }

  const redirectUri = getRedirectUri();

  let state;
  try {
    state = buildSignedState({
      platform:           'mercadolibre',
      brand_container_id: brandContainerId,
      organization_id:    auth.bc.organization_id || null,
      return_to:          returnTo,
      uid:                auth.user.id,
      iat:                Date.now()
    });
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  // Mercado Libre authorize URL — sin scope (lo define la app) ni PKCE.
  const authorizeUrl =
    `https://${MELI_AUTH_DOMAIN}/authorization?` +
    `response_type=code` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return {
    statusCode: 200,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorize_url: authorizeUrl })
  };
};
