/**
 * api-integrations-tiktok-start
 *
 * GET /api/integrations/tiktok/start
 *   ?brand_container_id=<uuid>
 *   &return_to=/brand-storage
 *
 * Headers: Authorization: Bearer {supabase_access_token}
 * Devuelve: { authorize_url }
 *
 * TikTok usa OAuth 2.0 con PKCE (S256), igual que X. Diferencias clave:
 *   - El parámetro del cliente se llama `client_key` (NO client_id).
 *   - El `scope` va separado por COMAS (no por espacios).
 *   - El authorize vive en www.tiktok.com/v2/auth/authorize/.
 * Generamos code_verifier, mandamos su code_challenge (S256) y guardamos el
 * verifier dentro del state firmado para que el exchange lo use.
 *
 * Scopes (Sandbox): lectura de perfil/stats/videos + subir a borrador.
 * `video.publish` (publicación directa pública) NO se pide aquí: requiere pasar
 * la auditoría de Content Posting API en Production. Al aprobar, se agrega a
 * TIKTOK_OAUTH_SCOPES sin tocar código.
 *
 * Durante pruebas, TIKTOK_CLIENT_KEY/SECRET deben tener los valores del SANDBOX.
 * Tras la aprobación, se reemplazan por los de Production.
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

const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_SCOPES = (process.env.TIKTOK_OAUTH_SCOPES ||
  'user.info.basic,user.info.profile,user.info.stats,video.list,video.upload').trim();

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

  const rl = checkRateLimit(event, { maxRequests: 10, windowMs: 60000, keyPrefix: 'oauth-tiktok' });
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

  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  if (!clientKey) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing TIKTOK_CLIENT_KEY env var' }) };
  }

  // PKCE: verifier aleatorio + challenge S256
  const codeVerifier  = b64url(crypto.randomBytes(64));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());

  const redirectUri = getRedirectUri();

  let state;
  try {
    state = buildSignedState({
      platform:           'tiktok',
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
    `${TIKTOK_AUTHORIZE_URL}?response_type=code` +
    `&client_key=${encodeURIComponent(clientKey)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(TIKTOK_SCOPES)}` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`;

  return {
    statusCode: 200,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorize_url: authorizeUrl })
  };
};
