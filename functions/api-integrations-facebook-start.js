const crypto = require('crypto');
const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');
const { getMetaGraphVersion } = require('./lib/meta-graph');

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
  return { user };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  const brandContainerId = event.queryStringParameters?.brand_container_id;
  const returnTo = event.queryStringParameters?.return_to || '/home';
  if (!brandContainerId) return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id' }) };

  let user;
  try {
    const auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId });
    user = auth.user;
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const appId = process.env.META_APP_ID || '';
  if (!appId) return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing META_APP_ID env var' }) };

  const redirectUri = getRedirectUri();
  const configId    = process.env.FACEBOOK_LOGIN_CONFIG_ID || null;

  let state;
  try {
    state = buildSignedState({
      platform: 'facebook',
      brand_container_id: brandContainerId,
      return_to: returnTo,
      uid: user.id,
      iat: Date.now()
    });
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  let authorizeUrl;
  if (configId) {
    // Facebook Login for Business — config_id define permisos y selección de página de forma nativa.
    authorizeUrl =
      `https://www.facebook.com/${getMetaGraphVersion()}/dialog/oauth?` +
      `client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&config_id=${encodeURIComponent(configId)}` +
      `&state=${encodeURIComponent(state)}`;
  } else {
    // Flujo clásico (fallback sin config_id)
    const scopes = [
      'public_profile', 'email', 'pages_show_list', 'pages_read_engagement',
      'pages_read_user_content', 'instagram_basic', 'instagram_manage_insights',
      'instagram_manage_comments', 'instagram_content_publish', 'read_insights',
      'business_management'
    ].join(',');

    authorizeUrl =
      `https://www.facebook.com/${getMetaGraphVersion()}/dialog/oauth?` +
      `client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&auth_type=rerequest` +
      `&enable_profile_selector=true` +
      `&state=${encodeURIComponent(state)}`;
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorize_url: authorizeUrl })
  };
};
