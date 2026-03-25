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

// ── Redirect URI ─────────────────────────────────────────────────────────────
function getRedirectUri() {
  const base = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : 'http://localhost:8888';
  return `${base}/brand-integration-callback`;
}

// ── HMAC-signed state ─────────────────────────────────────────────────────────
// Format: base64url(payload) + "." + HMAC-SHA256(base64url(payload), OAUTH_STATE_SECRET)
// Prevents CSRF and authorization-code injection attacks.
// OAUTH_STATE_SECRET must be set in Netlify environment variables (min. 32 random bytes).
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

  const appId = process.env.META_APP_ID || '';
  if (!appId) return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing META_APP_ID env var' }) };

  // Permisos obligatorios para leer páginas e Instagram — siempre presentes
  const REQUIRED_SCOPES = [
    'public_profile',
    'email',
    'pages_show_list',
    'pages_read_engagement',
    'pages_read_user_content',
    'instagram_basic',
    'instagram_manage_insights',
    'instagram_manage_comments',
    'instagram_content_publish',
    'read_insights',
    'business_management'
  ];

  // Si hay un env var extra, se fusiona con los required (nunca los reemplaza)
  const extraFromEnv = process.env.FACEBOOK_OAUTH_SCOPES
    ? String(process.env.FACEBOOK_OAUTH_SCOPES).split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
    : [];
  const merged = Array.from(new Set([...REQUIRED_SCOPES, ...extraFromEnv]));
  const scopes = merged.join(',');

  const redirectUri = getRedirectUri();

  let state;
  try {
    state = buildSignedState({
      platform: 'facebook',
      brand_container_id: brandContainerId,
      return_to: returnTo,
      scope: scopes,
      uid: user.id,
      iat: Date.now()
    });
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  // Si está configurado un config_id de "Facebook Login for Business", se usa ese
  // en lugar de scope — permite al usuario seleccionar páginas de forma nativa en el
  // diálogo de Meta sin necesidad de App Review para permisos de página.
  // Configurar: Meta App Dashboard → Facebook Login for Business → Configurations → obtener config_id
  // Luego añadir FACEBOOK_LOGIN_CONFIG_ID al env de Netlify.
  const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID || null;

  let authorizeUrl =
    `https://www.facebook.com/${getMetaGraphVersion()}/dialog/oauth?` +
    `client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&auth_type=rerequest` +
    `&enable_profile_selector=true` +
    `&state=${encodeURIComponent(state)}`;

  if (configId) {
    // Facebook Login for Business: config_id reemplaza scope
    authorizeUrl += `&config_id=${encodeURIComponent(configId)}`;
  } else {
    // Fallback: scope estándar con todos los permisos requeridos
    authorizeUrl += `&scope=${encodeURIComponent(scopes)}`;
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorize_url: authorizeUrl })
  };
};
