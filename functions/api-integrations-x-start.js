/**
 * api-integrations-x-start
 *
 * GET /api/integrations/x/start
 *   ?brand_container_id=<uuid>
 *   &return_to=/brand-storage
 *
 * Headers: Authorization: Bearer {supabase_access_token}
 * Devuelve: { authorize_url }
 *
 * X (Twitter) usa OAuth 2.0 con PKCE OBLIGATORIO (incluso para clientes
 * confidenciales). Generamos code_verifier, mandamos su code_challenge (S256)
 * en el authorize, y guardamos el verifier dentro del state firmado para que
 * el exchange lo use. Scopes: leer (analisis) + escribir (publicar gateado) +
 * offline.access (refresh token).
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

const X_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const X_SCOPES = (process.env.X_OAUTH_SCOPES ||
  'tweet.read tweet.write users.read offline.access').trim();

function getRedirectUri() {
  const base = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : 'http://localhost:8888';
  return `${base}/brand-integration-callback`;
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  if (!user?.id) { const err = new Error('Invalid session'); err.statusCode = 401; throw err; }

  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brandContainerId}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) { const err = new Error('Brand not found'); err.statusCode = 404; throw err; }

  if (bc.user_id !== user.id) {
    if (!bc.organization_id) { const err = new Error('No autorizado para esta marca'); err.statusCode = 403; throw err; }
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: bc.organization_id, userId: user.id });
  }
  return { user, bc };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  const rl = checkRateLimit(event, { maxRequests: 10, windowMs: 60000, keyPrefix: 'oauth-x' });
  if (rl.blocked) {
    return { statusCode: 429, headers: { ...corsHeaders(event), 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) }, body: JSON.stringify({ error: 'Too many requests. Try again in a moment.' }) };
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

  const clientId = process.env.X_CLIENT_ID || '';
  if (!clientId) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing X_CLIENT_ID env var' }) };
  }

  // PKCE: verifier aleatorio + challenge S256
  const codeVerifier  = b64url(crypto.randomBytes(64));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());

  const redirectUri = getRedirectUri();

  let state;
  try {
    state = buildSignedState({
      platform:           'x',
      brand_container_id: brandContainerId,
      organization_id:    auth.bc.organization_id || null,
      return_to:          returnTo,
      uid:                auth.user.id,
      cv:                 codeVerifier, // PKCE verifier (lo lee el exchange)
      iat:                Date.now()
    });
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const authorizeUrl =
    `${X_AUTHORIZE_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(X_SCOPES)}` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`;

  return {
    statusCode: 200,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorize_url: authorizeUrl })
  };
};
