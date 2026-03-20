const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');

function base64UrlEncode(obj) {
  const b64 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// SITE_URL debe estar configurada en Netlify Dashboard con el dominio exacto
// que también está registrado en Google Cloud Console como "Authorized redirect URI".
// Ejemplo: https://tu-app.netlify.app  o  https://app.tudominio.com
function getRedirectUri() {
  if (process.env.SITE_URL) {
    return `${process.env.SITE_URL.replace(/\/$/, '')}/brand-integration-callback`;
  }
  // Fallback solo para desarrollo local (nunca llega a producción si SITE_URL está set)
  return 'http://localhost:8888/brand-integration-callback';
}

async function assertBrandContainerAccess({ env, accessToken, brandContainerId }) {
  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    throw err;
  }

  const containers = await supabaseRest({
    url: env.url,
    serviceKey: env.serviceKey,
    path: 'brand_containers',
    method: 'GET',
    searchParams: {
      select: 'id,user_id,organization_id',
      id: `eq.${brandContainerId}`,
      limit: '1'
    }
  });

  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) {
    const err = new Error('Brand not found');
    err.statusCode = 404;
    throw err;
  }

  if (bc.user_id !== user.id) {
    if (!bc.organization_id) {
      const err = new Error('No autorizado para esta marca');
      err.statusCode = 403;
      throw err;
    }
    await assertOrgMember({
      url: env.url,
      serviceKey: env.serviceKey,
      organizationId: bc.organization_id,
      userId: user.id
    });
  }

  return { user };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) }; }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  const brandContainerId = event.queryStringParameters?.brand_container_id;
  const returnTo = event.queryStringParameters?.return_to || '/home';
  if (!brandContainerId) return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id' }) };

  try {
    await assertBrandContainerAccess({ env, accessToken, brandContainerId });
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing GOOGLE_CLIENT_ID env var' }) };

  const scopes = process.env.GOOGLE_OAUTH_SCOPES || 'openid email profile';
  const redirectUri = getRedirectUri();

  const state = base64UrlEncode({
    platform: 'google',
    brand_container_id: brandContainerId,
    return_to: returnTo,
    scope: scopes
  });

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

