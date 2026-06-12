const crypto = require('crypto');
const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember,
  logUserAudit
} = require('./lib/ai-shared');
const { encryptIntegrationPayload, encryptToken } = require('./lib/integration-token-vault');
const { getMetaGraphVersion, metaGraphGet, metaGraphGetPaged } = require('./lib/meta-graph');
const { checkRateLimit } = require('./lib/rate-limiter');

// ── State helpers ─────────────────────────────────────────────────────────────

function verifyAndDecodeState(state) {
  const secret = process.env.OAUTH_STATE_SECRET || '';
  if (!secret) throw Object.assign(new Error('OAUTH_STATE_SECRET env var is required'), { statusCode: 500 });

  const dotIdx = state.lastIndexOf('.');
  if (dotIdx < 1) throw Object.assign(new Error('Invalid state format'), { statusCode: 400 });

  const payloadB64  = state.slice(0, dotIdx);
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

function sanitizeReturnTo(returnTo) {
  // Solo rutas internas "planas": / + alfanuméricos + _ - / . sin query/fragment.
  // Rechazamos `?`, `#`, `%`, `&`, `=`, `\\` y `//` aunque sean comunes: no son
  // necesarios en un return_to legítimo y sí son vectores para XSS en atributos
  // HTML o open-redirect (`//evil.com/...` es protocol-relative).
  if (typeof returnTo !== 'string' || returnTo.length > 200) return '/home';
  if (!/^\/[A-Za-z0-9_\-/.]*$/.test(returnTo)) return '/home';
  if (returnTo.includes('//') || returnTo.startsWith('/\\')) return '/home';
  return returnTo;
}

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

// ── Bootstrap genérico (cualquier platform con populator registrado) ─────────
// Encola un job '<platform>_initial_bootstrap' para que el ai-engine arranque
// el populator correspondiente. No-op si ya existe un bootstrap en curso para
// la integración (evita duplicar al re-loguear con scopes idénticos).
async function enqueueIntegrationBootstrap({ env, platform, integrationId, brandContainerId, organizationId, extras = {} }) {
  if (!platform || !integrationId || !brandContainerId || !organizationId) return;
  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'agent_queue_jobs', method: 'POST',
      body: [{
        organization_id: organizationId,
        job_type:        'mission',
        priority:        5,
        payload: {
          mission_type:         `${platform}_initial_bootstrap`,
          brand_integration_id: integrationId,
          brand_container_id:   brandContainerId,
          platform,
          ...extras
        },
        status: 'queued'
      }]
    });
  } catch (e) {
    // No bloquear el OAuth callback por un fallo en el queue — el usuario
    // puede reintentar manualmente desde la UI con "Reconectar".
    console.warn(`[exchange] enqueue ${platform} bootstrap (non-blocking):`, e?.message || e);
  }
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
    // Si el caller no trae refresh_token nuevo pero la fila existente lo tiene
    // (encriptado o no), preservarlo as-is (el helper encrypt es idempotente).
    if (next.refresh_token == null && row.refresh_token != null) next.refresh_token = row.refresh_token;
    encryptIntegrationPayload(next);
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'PATCH',
      searchParams: { id: `eq.${row.id}` }, body: [next]
    });
  } else {
    const encPayload = { ...payload };
    encryptIntegrationPayload(encPayload);
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'POST',
      body: [encPayload]
    });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  const rl = checkRateLimit(event, { maxRequests: 5, windowMs: 60000, keyPrefix: 'oauth-xch' });
  if (rl.blocked) {
    return {
      statusCode: 429,
      headers: { ...corsHeaders(event), 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      body: JSON.stringify({ error: 'Too many requests. Try again in a moment.' })
    };
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    console.error('[exchange] env error:', e.message);
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}

  const { code, state } = body || {};
  if (!code || !state) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing code/state' }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  let stateObj;
  try { stateObj = verifyAndDecodeState(state); } catch (e) {
    return { statusCode: e.statusCode || 400, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const platform         = String(stateObj.platform || '').toLowerCase().trim();
  const brandContainerId = String(stateObj.brand_container_id || '').trim();
  const returnTo         = sanitizeReturnTo(String(stateObj.return_to || '/home'));

  if (!['google', 'facebook', 'shopify', 'mercadolibre'].includes(platform)) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unsupported platform' }) };
  }
  if (!brandContainerId) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id in state' }) };
  }

  let sessionUser;
  try {
    const auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId });
    sessionUser = auth.user;
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  if (stateObj.uid && stateObj.uid !== sessionUser.id) {
    return { statusCode: 403, headers: corsHeaders(event), body: JSON.stringify({ error: 'Session mismatch' }) };
  }

  const redirectUri = getRedirectUri();
  const at          = Date.now();
  const expiresIso  = (sec) => sec ? new Date(at + Number(sec) * 1000).toISOString() : null;

  try {
    // ── Google ──────────────────────────────────────────────────────────────
    if (platform === 'google') {
      const clientId     = process.env.GOOGLE_CLIENT_ID || '';
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

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` }
      });
      const profile = await profileRes.json().catch(() => ({}));

      await upsertBrandIntegration({
        env,
        payload: {
          brand_container_id: brandContainerId,
          platform,
          external_account_id:   profile?.id || sessionUser.id,
          external_account_name: profile?.email || profile?.name || null,
          access_token:    tokenJson.access_token,
          refresh_token:   tokenJson.refresh_token || null,
          token_expires_at: expiresIso(tokenJson.expires_in),
          is_active: true,
          scope: String(stateObj.scope || '').split(/[\s,]+/).filter(Boolean),
          account_url: null, encryption_iv: null,
          metadata: {
            provider: 'google',
            provider_user_id: profile?.id || sessionUser.id,
            email:   profile?.email || null,
            picture: profile?.picture || null
          },
          updated_at: nowIso(), last_sync_at: nowIso()
        }
      });
    }

    // ── Facebook / Meta ──────────────────────────────────────────────────────
    let storedPages = [];
    if (platform === 'facebook') {
      const appId     = process.env.META_APP_ID || '';
      const appSecret = process.env.META_APP_SECRET || '';
      if (!appId || !appSecret) throw new Error('Missing META_APP_ID/META_APP_SECRET env vars');

      // Step 1: code → short-lived token
      const shortRes = await fetch(
        `https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token?` +
        `client_id=${encodeURIComponent(appId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&code=${encodeURIComponent(code)}`
      );
      const shortJson = await shortRes.json().catch(() => ({}));
      if (!shortRes.ok) throw new Error(shortJson?.error?.message || 'Facebook token exchange failed');

      // Step 2: short-lived → long-lived (~60 días)
      const longRes = await fetch(
        `https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(appId)}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(shortJson.access_token)}`
      );
      const longJson = await longRes.json().catch(() => ({}));
      if (!longRes.ok) throw new Error(longJson?.error?.message || 'Facebook long-lived exchange failed');

      const userToken = longJson.access_token;
      const expiresAt = expiresIso(longJson.expires_in);

      // Step 3: perfil + páginas + permisos concedidos en paralelo
      // metaGraphGetPaged asegura que no se pierdan páginas por truncación del primer batch
      // /me/permissions devuelve los scopes que el usuario realmente concedió (Meta puede
      // omitir los que rechazó), persistirlos permite saber qué APIs son válidas sin
      // tener que adivinar a partir del scope solicitado.
      const [profile, pagesData, permissionsResp] = await Promise.all([
        metaGraphGet('/me', userToken, appSecret, {
          fields: 'id,name,email,picture.type(normal)'
        }).catch(() => ({})),
        metaGraphGetPaged('/me/accounts', userToken, appSecret, {
          fields: 'id,name,access_token,picture{url},fan_count,instagram_business_account{id,name,username,profile_picture_url}'
        }, 100).catch(() => []),
        metaGraphGet('/me/permissions', userToken, appSecret).catch(() => ({}))
      ]);

      const grantedScopes = (permissionsResp?.data || [])
        .filter((p) => p.status === 'granted')
        .map((p) => p.permission);

      console.log(`[exchange] páginas concedidas: ${pagesData.length} (usuario: ${profile?.name || sessionUser.id})`);

      storedPages = pagesData.map((pg) => ({
        id:           pg.id,
        name:         pg.name,
        picture:      pg.picture?.data?.url || (typeof pg.picture === 'string' ? pg.picture : null),
        fan_count:    pg.fan_count || 0,
        access_token: pg.access_token || null,
        instagram_business_account: pg.instagram_business_account
          ? {
              id:                  pg.instagram_business_account.id,
              name:                pg.instagram_business_account.name || null,
              username:            pg.instagram_business_account.username || null,
              profile_picture_url: pg.instagram_business_account.profile_picture_url || null
            }
          : null
      }));

      await upsertBrandIntegration({
        env,
        payload: {
          brand_container_id:    brandContainerId,
          platform,
          external_account_id:   profile?.id || sessionUser.id,
          external_account_name: profile?.name || profile?.email || profile?.id || null,
          access_token:    userToken,
          refresh_token:   null,
          token_expires_at: expiresAt,
          is_active: true,
          scope: grantedScopes,
          account_url: null, encryption_iv: null,
          metadata: {
            provider:         'facebook',
            provider_user_id: profile?.id || sessionUser.id,
            email:            profile?.email || null,
            picture:          profile?.picture?.data?.url || null,
            pages:            storedPages,
            pages_captured_at: nowIso()
          },
          updated_at: nowIso(), last_sync_at: nowIso()
        }
      });

      // Encolar bootstrap del populator (campañas + audiencias). Idempotente:
      // si la integración ya tiene bootstrap_status='completed', el populator
      // simplemente refresca con upsert.
      const fbIntegRow = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_integrations', method: 'GET',
        searchParams: {
          select: 'id', brand_container_id: `eq.${brandContainerId}`,
          platform: 'eq.facebook', is_active: 'eq.true', limit: '1'
        }
      });
      const fbIntegId = Array.isArray(fbIntegRow) && fbIntegRow[0] ? fbIntegRow[0].id : null;
      if (fbIntegId && stateObj.organization_id) {
        await enqueueIntegrationBootstrap({
          env,
          platform:         'facebook',
          integrationId:    fbIntegId,
          brandContainerId,
          organizationId:   stateObj.organization_id,
        });
      }
    }

    // ── Shopify ──────────────────────────────────────────────────────────────
    let shopifyIntegId = null;
    if (platform === 'shopify') {
      const apiKey    = process.env.SHOPIFY_API_KEY || '';
      const apiSecret = process.env.SHOPIFY_API_SECRET || '';
      if (!apiKey || !apiSecret) throw new Error('Missing SHOPIFY_API_KEY/SHOPIFY_API_SECRET env vars');

      // Shopify firma el redirect query string. Verificarlo aquí (anti-tampering).
      // body NO contiene hmac/shop — vienen en queryStringParameters del callback.
      // El frontend nos los pasa en `body` también — los aceptamos para verify.
      const shopifyHmac = body.hmac || null;
      const shopFromCallback = String(body.shop || '').toLowerCase();
      if (!shopFromCallback || shopFromCallback !== stateObj.shop) {
        throw new Error('Shop mismatch entre callback y state');
      }

      // Verificar HMAC del redirect (params del callback excepto hmac mismo)
      // El frontend debe pasar todos los params del callback en body.callback_params
      const cbp = body.callback_params || {};
      if (cbp.hmac) {
        const { hmac: _hmac, signature: _sig, ...rest } = cbp;
        const sortedQs = Object.keys(rest).sort()
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(rest[k])}`)
          .join('&');
        const expectedHmac = crypto.createHmac('sha256', apiSecret).update(sortedQs).digest('hex');
        const a = Buffer.from(expectedHmac, 'utf8');
        const b = Buffer.from(cbp.hmac, 'utf8');
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          throw new Error('Shopify callback HMAC verification failed');
        }
      }

      // Exchange code → access_token (offline, no expira)
      const tokenRes = await fetch(`https://${stateObj.shop}/admin/oauth/access_token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code: String(code) })
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) throw new Error(tokenJson?.errors || tokenJson?.error || 'Shopify token exchange failed');

      const grantedScopes = typeof tokenJson.scope === 'string'
        ? tokenJson.scope.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      // GET /shop.json para metadata (plan, country, currency, timezone, etc.)
      let shopInfo = {};
      try {
        const apiVer = process.env.SHOPIFY_API_VERSION || '2026-04';
        const shopRes = await fetch(`https://${stateObj.shop}/admin/api/${apiVer}/shop.json`, {
          headers: { 'X-Shopify-Access-Token': tokenJson.access_token }
        });
        if (shopRes.ok) {
          const j = await shopRes.json().catch(() => ({}));
          shopInfo = j?.shop || {};
        }
      } catch (e) { console.warn('[exchange] shop.json (non-blocking):', e.message); }

      const baseMetadata = {
        platform_key:        'shopify',
        shop_id:             shopInfo.id != null ? String(shopInfo.id) : null,
        shop_name:           shopInfo.name || null,
        shop_email:          shopInfo.email || null,
        shop_country:        shopInfo.country_code || null,
        shop_currency:       shopInfo.currency || null,
        shop_timezone:       shopInfo.iana_timezone || null,
        shopify_plan_name:   shopInfo.plan_display_name || shopInfo.plan_name || null,
        myshopify_domain:    shopInfo.myshopify_domain || stateObj.shop,
        primary_locale:      shopInfo.primary_locale || null,
        scope_at_last_oauth: grantedScopes
      };

      // D8: si ya existe (mismo brand_container + shop_domain) → UPDATE preservando id
      const existing = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_integrations', method: 'GET',
        searchParams: {
          select: 'id,metadata',
          brand_container_id: `eq.${brandContainerId}`,
          platform:           'eq.shopify',
          shop_domain:        `eq.${stateObj.shop}`,
          limit:              '1'
        }
      });
      const existingRow = Array.isArray(existing) ? existing[0] : null;
      let isReconnection = false;

      if (existingRow?.id) {
        isReconnection = true;
        const prevMeta = existingRow.metadata || {};
        const reconnHistory = Array.isArray(prevMeta.reconnection_history) ? [...prevMeta.reconnection_history] : [];
        reconnHistory.push({
          at:             nowIso(),
          previous_scope: prevMeta.scope_at_last_oauth || null,
          new_scope:      grantedScopes,
          trigger:        'user_reauth'
        });

        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_integrations', method: 'PATCH',
          searchParams: { id: `eq.${existingRow.id}` },
          body: [{
            access_token:          encryptToken(tokenJson.access_token),
            scope:                 grantedScopes,
            external_account_id:   shopInfo.id != null ? String(shopInfo.id) : null,
            external_account_name: shopInfo.name || stateObj.shop,
            account_url:           `https://${stateObj.shop}`,
            is_active:             true,
            metadata: { ...prevMeta, ...baseMetadata, reconnection_history: reconnHistory, disconnected_at: null },
            updated_at:    nowIso(),
            last_sync_at:  nowIso()
          }]
        });
        shopifyIntegId = existingRow.id;
      } else {
        const inserted = await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_integrations', method: 'POST',
          searchParams: { select: 'id' },
          body: [{
            brand_container_id:    brandContainerId,
            platform:              'shopify',
            shop_domain:           stateObj.shop,
            external_account_id:   shopInfo.id != null ? String(shopInfo.id) : null,
            external_account_name: shopInfo.name || stateObj.shop,
            account_url:           `https://${stateObj.shop}`,
            access_token:          encryptToken(tokenJson.access_token),
            scope:                 grantedScopes,
            is_active:             true,
            bootstrap_status:      'pending',
            metadata:              { ...baseMetadata, reconnection_history: [] },
            updated_at:            nowIso(),
            last_sync_at:          nowIso()
          }]
        });
        const insertedRow = Array.isArray(inserted) ? inserted[0] : null;
        shopifyIntegId = insertedRow?.id || null;
      }

      // Registrar webhooks vía Shopify API (best-effort, errores en metadata)
      const SITE_URL_BASE = (process.env.SITE_URL || 'https://aismartcontent.io').replace(/\/$/, '');
      const apiVer = process.env.SHOPIFY_API_VERSION || '2026-04';
      const TOPICS = [
        'products/create','products/update','products/delete',
        'orders/create','orders/updated','orders/cancelled',
        'customers/create','customers/update','customers/delete',
        'app/uninstalled',
        'customers/data_request','customers/redact','shop/redact'
      ];
      const webhookResults = [];
      for (const topic of TOPICS) {
        const address = `${SITE_URL_BASE}/api/webhooks/shopify/${topic}`;
        try {
          const r = await fetch(`https://${stateObj.shop}/admin/api/${apiVer}/webhooks.json`, {
            method:  'POST',
            headers: { 'X-Shopify-Access-Token': tokenJson.access_token, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ webhook: { topic, address, format: 'json' } })
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.webhook?.id) {
            webhookResults.push({ topic, webhook_id: j.webhook.id, address });
          } else {
            const errStr = JSON.stringify(j?.errors || {});
            const alreadyRegistered = /already/i.test(errStr);
            webhookResults.push({ topic, error: alreadyRegistered ? 'already_registered' : (j?.errors || `${r.status}`), address, already_registered: alreadyRegistered });
          }
        } catch (e) {
          webhookResults.push({ topic, error: String(e?.message || e), address });
        }
      }
      // Persistir lista en metadata
      if (shopifyIntegId) {
        const cur = await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_integrations', method: 'GET',
          searchParams: { select: 'metadata', id: `eq.${shopifyIntegId}`, limit: '1' }
        });
        const curMeta = (Array.isArray(cur) && cur[0]?.metadata) || {};
        const successful = webhookResults.filter((w) => !w.error || w.already_registered);
        const failed     = webhookResults.filter((w) => w.error && !w.already_registered);
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_integrations', method: 'PATCH',
          searchParams: { id: `eq.${shopifyIntegId}` },
          body: [{ metadata: { ...curMeta, webhooks_registered: successful, webhook_registration_errors: failed, webhook_registered_at: nowIso() } }]
        });
      }

      // Encolar bootstrap (solo si NO es reconnection) usando el helper genérico
      if (!isReconnection && shopifyIntegId && stateObj.organization_id) {
        await enqueueIntegrationBootstrap({
          env,
          platform:         'shopify',
          integrationId:    shopifyIntegId,
          brandContainerId,
          organizationId:   stateObj.organization_id,
          extras:           { shop_domain: stateObj.shop }
        });
      }
    }

    // ── Mercado Libre ─────────────────────────────────────────────────────────
    let meliIntegId = null;
    if (platform === 'mercadolibre') {
      const appId     = process.env.MELI_APP_ID || '';
      const appSecret = process.env.MELI_APP_SECRET || '';
      if (!appId || !appSecret) throw new Error('Missing MELI_APP_ID/MELI_APP_SECRET env vars');

      // Exchange code → tokens (form-urlencoded). access_token expira en ~6h
      // (expires_in); refresh_token es de un solo uso (rota en cada refresh) y
      // dura ~6 meses. Guardamos ambos encriptados; el refresh lo hace ai-engine.
      const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          client_id:     appId,
          client_secret: appSecret,
          code:          String(code),
          redirect_uri:  redirectUri
        }).toString()
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(tokenJson?.message || tokenJson?.error || 'Mercado Libre token exchange failed');
      }

      const grantedScopes = typeof tokenJson.scope === 'string'
        ? tokenJson.scope.split(/\s+/).filter(Boolean)
        : [];
      const meliUserId = tokenJson.user_id != null ? String(tokenJson.user_id) : null;

      // GET /users/me para metadata del vendedor (nickname, país, sitio, reputación)
      let me = {};
      try {
        const meRes = await fetch('https://api.mercadolibre.com/users/me', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` }
        });
        if (meRes.ok) me = await meRes.json().catch(() => ({}));
      } catch (e) { console.warn('[exchange] meli /users/me (non-blocking):', e.message); }

      const acctId = meliUserId || (me.id != null ? String(me.id) : null);

      // ¿ya existe integración para este brand_container? → reconnection (no re-bootstrap)
      const existing = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_integrations', method: 'GET',
        searchParams: {
          select: 'id',
          brand_container_id: `eq.${brandContainerId}`,
          platform:           'eq.mercadolibre',
          limit:              '1'
        }
      });
      const existingRow = Array.isArray(existing) ? existing[0] : null;
      const isReconnection = !!existingRow?.id;

      await upsertBrandIntegration({
        env,
        payload: {
          brand_container_id:    brandContainerId,
          platform:              'mercadolibre',
          external_account_id:   acctId,
          external_account_name: me.nickname || me.first_name || acctId || null,
          account_url:           me.permalink || null,
          access_token:          tokenJson.access_token,
          refresh_token:         tokenJson.refresh_token || null,
          token_expires_at:      expiresIso(tokenJson.expires_in),
          is_active:             true,
          scope:                 grantedScopes,
          encryption_iv:         null,
          ...(isReconnection ? {} : { bootstrap_status: 'pending' }),
          metadata: {
            provider:                'mercadolibre',
            meli_user_id:            meliUserId,
            nickname:                me.nickname || null,
            site_id:                 me.site_id || null,
            country_id:              me.country_id || null,
            permalink:               me.permalink || null,
            seller_reputation_level: me.seller_reputation?.level_id || null,
            scope_at_last_oauth:     grantedScopes
          },
          updated_at: nowIso(), last_sync_at: nowIso()
        }
      });

      // Recuperar el id para enqueue + respuesta al callback
      const meliRow = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_integrations', method: 'GET',
        searchParams: {
          select: 'id', brand_container_id: `eq.${brandContainerId}`,
          platform: 'eq.mercadolibre', limit: '1'
        }
      });
      meliIntegId = Array.isArray(meliRow) && meliRow[0] ? meliRow[0].id : null;

      // Encolar bootstrap solo en conexión nueva (populator idempotente igual)
      if (!isReconnection && meliIntegId && stateObj.organization_id) {
        await enqueueIntegrationBootstrap({
          env,
          platform:         'mercadolibre',
          integrationId:    meliIntegId,
          brandContainerId,
          organizationId:   stateObj.organization_id,
        });
      }
    }

    // Obtener el id de la integración guardada para devolverlo al callback
    const savedIntegRow = platform === 'facebook'
      ? await (async () => {
          const rows = await supabaseRest({
            url: env.url, serviceKey: env.serviceKey,
            path: 'brand_integrations', method: 'GET',
            searchParams: {
              select: 'id',
              brand_container_id: `eq.${brandContainerId}`,
              platform: 'eq.facebook',
              is_active: 'eq.true',
              limit: '1'
            }
          });
          return Array.isArray(rows) ? rows[0] : null;
        })()
      : null;

    // Audit log: registrar la conexión exitosa para que el admin de la org
    // vea quién conectó qué integración y cuándo (style Sprout Social).
    if (stateObj.organization_id) {
      const integId = platform === 'shopify' ? shopifyIntegId
        : platform === 'mercadolibre' ? meliIntegId
        : (savedIntegRow?.id || null);
      await logUserAudit({
        env,
        event,
        user: sessionUser,
        organizationId: stateObj.organization_id,
        action: 'integration.connect',
        resourceType: 'brand_integrations',
        resourceId: integId,
        metadata: {
          platform,
          brand_container_id: brandContainerId,
          ...(platform === 'shopify' ? { shop_domain: stateObj.shop } : {}),
          ...(platform === 'facebook' ? { pages_count: storedPages.length } : {}),
        }
      });
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        return_to: returnTo,
        platform,
        ...(platform === 'facebook' ? {
          integ_id: savedIntegRow?.id || null,
          pages:    storedPages
        } : {}),
        ...(platform === 'shopify' ? {
          integ_id:    shopifyIntegId,
          shop_domain: stateObj.shop
        } : {}),
        ...(platform === 'mercadolibre' ? {
          integ_id: meliIntegId
        } : {})
      })
    };

  } catch (e) {
    console.error('[exchange] error:', e?.message, e?.details || '');
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Token exchange failed' }) };
  }
};
