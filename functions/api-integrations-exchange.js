const crypto = require('crypto');
const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');
const { getMetaGraphVersion, metaGraphGet } = require('./lib/meta-graph');

// ── State helpers ─────────────────────────────────────────────────────────────

// Verifica la firma HMAC del state y extrae el payload.
// El state tiene el formato: base64url(payload) + "." + HMAC-SHA256(base64url(payload), secret)
// TTL máximo de 15 minutos para el state.
function verifyAndDecodeState(state) {
  const secret = process.env.OAUTH_STATE_SECRET || '';
  if (!secret) throw Object.assign(new Error('OAUTH_STATE_SECRET env var is required'), { statusCode: 500 });

  const dotIdx = state.lastIndexOf('.');
  if (dotIdx < 1) throw Object.assign(new Error('Invalid state format'), { statusCode: 400 });

  const payloadB64 = state.slice(0, dotIdx);
  const receivedSig = state.slice(dotIdx + 1);

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigA = Buffer.from(receivedSig, 'base64url');
  const sigB = Buffer.from(expectedSig, 'base64url');
  if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
    throw Object.assign(new Error('Invalid state signature'), { statusCode: 400 });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    throw Object.assign(new Error('Malformed state payload'), { statusCode: 400 });
  }

  const MAX_AGE_MS = 15 * 60 * 1000;
  if (!payload.iat || Date.now() - payload.iat > MAX_AGE_MS) {
    throw Object.assign(new Error('State expired — please start the connection again'), { statusCode: 400 });
  }

  return payload;
}

// Sanitiza return_to para evitar open redirect. Solo permite rutas internas.
function sanitizeReturnTo(returnTo) {
  const safe = /^\/[a-zA-Z0-9\-_/?=&%#]*$/;
  return safe.test(returnTo) ? returnTo : '/home';
}

// ── Redirect URI ──────────────────────────────────────────────────────────────
function getRedirectUri() {
  const base = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : 'http://localhost:8888';
  return `${base}/brand-integration-callback`;
}

function nowIso() { return new Date().toISOString(); }

// ── Brand container auth ──────────────────────────────────────────────────────
async function assertBrandContainerAccess({ env, accessToken, brandContainerId }) {
  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) { throw Object.assign(new Error('Invalid session'), { statusCode: 401 }); }

  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brandContainerId}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) { throw Object.assign(new Error('Brand not found'), { statusCode: 404 }); }

  if (bc.user_id !== user.id) {
    if (!bc.organization_id) { throw Object.assign(new Error('No autorizado para esta marca'), { statusCode: 403 }); }
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: bc.organization_id, userId: user.id });
  }
  return { user, brand_container_id: brandContainerId };
}

// ── Upsert integration ────────────────────────────────────────────────────────
async function upsertBrandIntegration({ env, payload }) {
  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
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
    // Preservar refresh_token existente si no viene uno nuevo (Google)
    if (next.refresh_token == null && row.refresh_token != null) next.refresh_token = row.refresh_token;
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'PATCH',
      searchParams: { id: `eq.${row.id}` }, body: [next]
    });
  } else {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'POST',
      body: [payload]
    });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}

  const { code, state } = body || {};
  if (!code || !state) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing code/state' }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  // ── Verify HMAC-signed state ──────────────────────────────────────────────
  let stateObj;
  try { stateObj = verifyAndDecodeState(state); } catch (e) {
    return { statusCode: e.statusCode || 400, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const platform = String(stateObj.platform || '').toLowerCase().trim();
  const brandContainerId = String(stateObj.brand_container_id || '').trim();
  const returnTo = sanitizeReturnTo(String(stateObj.return_to || '/home'));
  const scopesRaw = stateObj.scope || '';

  if (!['google', 'facebook'].includes(platform)) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Unsupported platform' }) };
  }
  if (!brandContainerId) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id in state' }) };
  }

  // ── Verify the authenticated user matches the one who initiated the flow ──
  let sessionUser;
  try {
    const auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId });
    sessionUser = auth.user;
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  // Validar que el uid del state coincida con la sesión actual (previene CSRF cross-user)
  if (stateObj.uid && stateObj.uid !== sessionUser.id) {
    return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Session mismatch' }) };
  }

  const redirectUri = getRedirectUri();
  const scopeArr = String(scopesRaw).split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  const at = Date.now();
  const expiresIso = (sec) => sec ? new Date(at + Number(sec) * 1000).toISOString() : null;

  try {
    // ── Google ──────────────────────────────────────────────────────────────
    if (platform === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
      if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars');

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code), client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: 'authorization_code'
        }).toString()
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) throw new Error(tokenJson?.error_description || tokenJson?.error || 'Google token exchange failed');

      const accessTokenFromProvider = tokenJson.access_token;
      const refreshToken = tokenJson.refresh_token || null;
      const expiresAt = expiresIso(tokenJson.expires_in);

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessTokenFromProvider}` }
      });
      const profile = await profileRes.json().catch(() => ({}));

      await upsertBrandIntegration({
        env,
        payload: {
          brand_container_id: brandContainerId,
          platform,
          external_account_id: profile?.id || sessionUser.id,
          external_account_name: profile?.email || profile?.name || null,
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
            email: profile?.email || null,
            picture: profile?.picture || null
          },
          updated_at: nowIso(),
          last_sync_at: nowIso()
        }
      });
    }

    // ── Facebook / Meta ──────────────────────────────────────────────────────
    if (platform === 'facebook') {
      const appId = process.env.META_APP_ID || '';
      const appSecret = process.env.META_APP_SECRET || '';
      if (!appId || !appSecret) throw new Error('Missing META_APP_ID/META_APP_SECRET env vars');

      // Step 1: Exchange auth code for short-lived token
      const shortRes = await fetch(
        `https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token?` +
        `client_id=${encodeURIComponent(appId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&code=${encodeURIComponent(code)}`
      );
      const shortJson = await shortRes.json().catch(() => ({}));
      if (!shortRes.ok) throw new Error(shortJson?.error?.message || 'Facebook token exchange failed');

      // Step 2: Exchange short-lived for long-lived (~60 days)
      const longRes = await fetch(
        `https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(appId)}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(shortJson.access_token)}`
      );
      const longJson = await longRes.json().catch(() => ({}));
      if (!longRes.ok) throw new Error(longJson?.error?.message || 'Facebook long-lived exchange failed');

      const accessTokenFromProvider = longJson.access_token;
      const expiresAt = expiresIso(longJson.expires_in);

      // Step 3: Perfil + páginas concedidas en paralelo (mientras el token está fresco)
      const [profile, pagesRaw] = await Promise.all([
        metaGraphGet('/me', accessTokenFromProvider, appSecret, {
          fields: 'id,name,email,picture.type(normal)'
        }).catch(() => ({})),
        // Capturamos las páginas e IGs concedidos AHORA, justo cuando el token es válido.
        // Meta solo garantiza /me/accounts inmediatamente después del OAuth.
        metaGraphGet('/me/accounts', accessTokenFromProvider, appSecret, {
          fields: 'id,name,access_token,picture{url},fan_count,instagram_business_account{id,name,username,profile_picture_url}'
        }).catch(() => ({ data: [] }))
      ]);

      // Normalizar páginas concedidas y sus page tokens (nunca llegan vacíos si el usuario las seleccionó)
      const pagesData = Array.isArray(pagesRaw?.data) ? pagesRaw.data : [];
      const storedPages = pagesData.map((pg) => ({
        id: pg.id,
        name: pg.name,
        picture: pg.picture?.data?.url || null,
        fan_count: pg.fan_count || 0,
        access_token: pg.access_token || null,
        instagram_business_account: pg.instagram_business_account
          ? {
              id: pg.instagram_business_account.id,
              name: pg.instagram_business_account.name || null,
              username: pg.instagram_business_account.username || null,
              profile_picture_url: pg.instagram_business_account.profile_picture_url || null
            }
          : null
      }));

      await upsertBrandIntegration({
        env,
        payload: {
          brand_container_id: brandContainerId,
          platform,
          external_account_id: profile?.id || sessionUser.id,
          external_account_name: profile?.name || profile?.email || profile?.id || null,
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
            email: profile?.email || null,
            picture: profile?.picture?.data?.url || null,
            // Páginas concedidas en el momento del OAuth con sus tokens de página
            pages: storedPages,
            pages_captured_at: nowIso()
          },
          updated_at: nowIso(),
          last_sync_at: nowIso()
        }
      });
    }

    // Para Facebook, devolver pages para que el callback muestre el selector de página
    const fbIntegRow = platform === 'facebook'
      ? await (async () => {
          const rows = await supabaseRest({
            url: env.url, serviceKey: env.serviceKey,
            path: 'brand_integrations', method: 'GET',
            searchParams: {
              select: 'id,metadata',
              brand_container_id: `eq.${brandContainerId}`,
              platform: 'eq.facebook',
              is_active: 'eq.true',
              limit: '1'
            }
          });
          return Array.isArray(rows) ? rows[0] : null;
        })()
      : null;

    const fbPages = fbIntegRow?.metadata?.pages || [];

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        return_to: returnTo,
        platform,
        integ_id: fbIntegRow?.id || null,
        pages: platform === 'facebook' ? fbPages : undefined
      })
    };
  } catch (e) {
    console.error('integrations exchange error:', e?.message);
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: e?.message || 'Token exchange failed' }) };
  }
};
