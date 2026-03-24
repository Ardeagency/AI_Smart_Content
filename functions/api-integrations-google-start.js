const crypto = require('crypto');
const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');

// ── Redirect URI ─────────────────────────────────────────────────────────────
function getRedirectUri() {
  const base = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : 'http://localhost:8888';
  return `${base}/brand-integration-callback`;
}

// ── HMAC-signed state ─────────────────────────────────────────────────────────
// Format: base64url(payload) + "." + HMAC-SHA256(base64url(payload), OAUTH_STATE_SECRET)
function buildSignedState(payload) {
  const secret = process.env.OAUTH_STATE_SECRET || '';
  if (!secret) throw new Error('OAUTH_STATE_SECRET env var is required');
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

// ── Brand container auth ──────────────────────────────────────────────────────
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
  return { user };
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  const brandContainerId = event.queryStringParameters?.brand_container_id;
  const returnTo = event.queryStringParameters?.return_to || '/home';
  if (!brandContainerId) return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id' }) };

  let user;
  try {
    const auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId });
    user = auth.user;
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing GOOGLE_CLIENT_ID env var' }) };

  // Permisos completos de Google: Analytics, YouTube, Ads y Business Profile
  const scopes = process.env.GOOGLE_OAUTH_SCOPES ||
    'openid email profile ' +
    'https://www.googleapis.com/auth/analytics ' +
    'https://www.googleapis.com/auth/analytics.readonly ' +
    'https://www.googleapis.com/auth/youtube ' +
    'https://www.googleapis.com/auth/youtube.readonly ' +
    'https://www.googleapis.com/auth/yt-analytics.readonly ' +
    'https://www.googleapis.com/auth/adwords ' +
    'https://www.googleapis.com/auth/business.manage';

  const redirectUri = getRedirectUri();

  let state;
  try {
    state = buildSignedState({
      platform: 'google',
      brand_container_id: brandContainerId,
      return_to: returnTo,
      scope: scopes,
      uid: user.id,
      iat: Date.now()
    });
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const authorizeUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&include_granted_scopes=true` +
    `&state=${encodeURIComponent(state)}`;

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorize_url: authorizeUrl })
  };
};
