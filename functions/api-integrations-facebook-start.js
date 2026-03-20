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
// que también está registrado en Meta Developers como "Valid OAuth Redirect URI".
// Ejemplo: https://tu-app.netlify.app  o  https://app.tudominio.com
function getRedirectUri() {
  if (process.env.SITE_URL) {
    return `${process.env.SITE_URL.replace(/\/$/, '')}/brand-integration-callback`;
  }
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

  const appId = process.env.META_APP_ID || '';
  if (!appId) return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing META_APP_ID env var' }) };

  // Scopes maestros — cubre analítica de Ads, Instagram insights,
  // publicación de contenido y gestión de comentarios para la IA.
  // Dependencias incluidas según Meta Permissions Reference:
  //   instagram_manage_insights     → requiere instagram_basic + pages_read_engagement + pages_show_list
  //   instagram_content_publish     → requiere instagram_basic + pages_read_engagement + pages_show_list
  //   instagram_manage_comments     → requiere instagram_basic + pages_read_engagement + pages_show_list
  //   read_insights                 → requiere pages_read_engagement + pages_show_list
  //   ads_read                      → sin dependencias
  const scopes = process.env.FACEBOOK_OAUTH_SCOPES ||
    'public_profile,email,ads_read,read_insights,' +
    'instagram_basic,instagram_manage_insights,' +
    'instagram_content_publish,instagram_manage_comments,' +
    'pages_show_list,pages_read_engagement';
  const redirectUri = getRedirectUri();

  const state = base64UrlEncode({
    platform: 'facebook',
    brand_container_id: brandContainerId,
    return_to: returnTo,
    scope: scopes
  });

  const authorizeUrl =
    `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${encodeURIComponent(state)}`;

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorize_url: authorizeUrl })
  };
};

