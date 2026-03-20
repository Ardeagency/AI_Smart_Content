const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');

function base64UrlDecode(str) {
  const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function nowIso() {
  return new Date().toISOString();
}

// La redirect_uri en el exchange DEBE ser idéntica a la que se usó en el authorize.
// Usar SITE_URL garantiza que siempre sea la misma URI registrada en Google/Meta.
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

  return { user, brand_container_id: brandContainerId };
}

async function upsertBrandIntegration({ env, payload }) {
  const existing = await supabaseRest({
    url: env.url,
    serviceKey: env.serviceKey,
    path: 'brand_integrations',
    method: 'GET',
    searchParams: {
      select: 'id,refresh_token',
      brand_container_id: `eq.${payload.brand_container_id}`,
      platform: `eq.${payload.platform}`,
      limit: '1'
    }
  });

  const row = Array.isArray(existing) ? existing[0] : null;
  if (row?.id) {
    const next = { ...payload };
    // Si no llega refresh_token, preservamos el existente.
    if (next.refresh_token == null && row.refresh_token != null) next.refresh_token = row.refresh_token;

    await supabaseRest({
      url: env.url,
      serviceKey: env.serviceKey,
      path: 'brand_integrations',
      method: 'PATCH',
      searchParams: { id: `eq.${row.id}` },
      body: [next]
    });
  } else {
    await supabaseRest({
      url: env.url,
      serviceKey: env.serviceKey,
      path: 'brand_integrations',
      method: 'POST',
      body: [payload]
    });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) }; }

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) { body = {}; }

  const { code, state } = body || {};
  if (!code || !state) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing code/state' }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  let stateObj;
  try { stateObj = base64UrlDecode(state); } catch (e) { return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid state' }) }; }

  const platform = String(stateObj.platform || '').toLowerCase().trim();
  const brandContainerId = String(stateObj.brand_container_id || '').trim();
  const returnTo = String(stateObj.return_to || '/home');
  const scopesRaw = stateObj.scope || '';

  if (!['google', 'facebook'].includes(platform)) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Unsupported platform' }) };
  }
  if (!brandContainerId) return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id in state' }) };

  // AuthZ: validar que el usuario puede operar esa marca
  let sessionUser;
  try {
    const auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId });
    sessionUser = auth.user;
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const redirectUri = getRedirectUri();
  const scopeArr = String(scopesRaw).split(/\s+/).map(s => s.trim()).filter(Boolean);
  const at = Date.now();
  const expiresIso = (sec) => sec ? new Date(at + Number(sec) * 1000).toISOString() : null;

  try {
    if (platform === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
      if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars');

      // Exchange authorization code -> tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        throw new Error(tokenJson?.error_description || tokenJson?.error || 'Google token exchange failed');
      }

      const accessTokenFromProvider = tokenJson.access_token;
      const refreshToken = tokenJson.refresh_token || null;
      const expiresAt = expiresIso(tokenJson.expires_in);

      // Fetch basic profile
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessTokenFromProvider}` }
      });
      const profile = await profileRes.json().catch(() => ({}));
      if (!profile?.id) {
        // Fallback para no romper
      }

      const payload = {
        brand_container_id: brandContainerId,
        platform,
        external_account_id: profile?.id || sessionUser.id,
        external_account_name: profile?.email || profile?.name || profile?.id || null,
        access_token: accessTokenFromProvider,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        is_active: true,
        scope: scopeArr,
        account_url: null,
        encryption_iv: null,
        metadata: {
          provider: 'google',
          provider_user_id: profile?.id || sessionUser.id,
          email: profile?.email || null
        },
        updated_at: nowIso(),
        last_sync_at: nowIso()
      };

      await upsertBrandIntegration({ env, payload });
    }

    if (platform === 'facebook') {
      const appId = process.env.META_APP_ID || '';
      const appSecret = process.env.META_APP_SECRET || '';
      if (!appId || !appSecret) throw new Error('Missing META_APP_ID/META_APP_SECRET env vars');

      const shortRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
          `client_id=${encodeURIComponent(appId)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&client_secret=${encodeURIComponent(appSecret)}` +
          `&code=${encodeURIComponent(code)}`
      );
      const shortJson = await shortRes.json().catch(() => ({}));
      if (!shortRes.ok) {
        throw new Error(shortJson?.error?.message || shortJson?.error_description || 'Facebook token exchange failed');
      }

      const shortAccessToken = shortJson.access_token;
      const longRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
          `grant_type=fb_exchange_token` +
          `&client_id=${encodeURIComponent(appId)}` +
          `&client_secret=${encodeURIComponent(appSecret)}` +
          `&fb_exchange_token=${encodeURIComponent(shortAccessToken)}`
      );
      const longJson = await longRes.json().catch(() => ({}));
      if (!longRes.ok) {
        throw new Error(longJson?.error?.message || 'Facebook long-lived exchange failed');
      }

      const accessTokenFromProvider = longJson.access_token;
      const expiresAt = expiresIso(longJson.expires_in);

      const profileRes = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessTokenFromProvider)}`
      );
      const profile = await profileRes.json().catch(() => ({}));

      const payload = {
        brand_container_id: brandContainerId,
        platform,
        external_account_id: profile?.id || sessionUser.id,
        external_account_name: profile?.email || profile?.name || profile?.id || null,
        access_token: accessTokenFromProvider,
        refresh_token: null,
        token_expires_at: expiresAt,
        is_active: true,
        scope: scopeArr,
        account_url: null,
        encryption_iv: null,
        metadata: {
          provider: 'facebook',
          provider_user_id: profile?.id || sessionUser.id,
          email: profile?.email || null
        },
        updated_at: nowIso(),
        last_sync_at: nowIso()
      };

      await upsertBrandIntegration({ env, payload });
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: true, return_to: returnTo })
    };
  } catch (e) {
    console.error('integrations exchange error:', e);
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: e?.message || 'Token exchange failed' }) };
  }
};

