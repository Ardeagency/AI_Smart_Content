/**
 * api-insights-fetch
 * Obtiene métricas de Meta (Ads/Instagram) y Google Analytics 4 / YouTube.
 * Refresca tokens automáticamente sin requerir intervención del usuario.
 *
 * POST /api/insights/fetch
 * Body: { platform, integration_id, date_range, ga4_property_id? }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');
const { getMetaGraphVersion, metaGraphGet } = require('./lib/meta-graph');

// ── Token refresh helpers ─────────────────────────────────────────────────────

async function refreshGoogleToken(refreshToken, clientId, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error_description || json?.error || 'Google token refresh failed');
  return json; // { access_token, expires_in, token_type }
}

// Meta no tiene refresh_token clásico: se renueva el long-lived token con otro fb_exchange_token.
// Se puede hacer silenciosamente desde el servidor sin interacción del usuario.
// Los tokens Long-Lived de Meta duran ~60 días y se pueden renovar cuando les quedan < 10 días.
async function renewMetaToken(currentToken, appId, appSecret) {
  const res = await fetch(
    `https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token?` +
    `grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(currentToken)}`
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new Error(json?.error?.message || 'Meta token renewal failed');
  return json; // { access_token, token_type, expires_in }
}

// ── Meta insights ─────────────────────────────────────────────────────────────

async function fetchMetaInsights({ token, datePreset, appSecret }) {
  const accountsJson = await metaGraphGet('/me/adaccounts', token, appSecret, {
    fields: 'name,account_id,currency,account_status',
    limit: '10'
  });

  const accounts = accountsJson.data || [];
  if (accounts.length === 0) return { accounts: [], adAccountId: null, insights: null, campaigns: [] };

  const adAccountId = accounts[0].id;

  const insightsJson = await metaGraphGet(`/${adAccountId}/insights`, token, appSecret, {
    fields: 'impressions,reach,clicks,spend,cpc,cpm,ctr,actions',
    date_preset: datePreset,
    level: 'account'
  });
  const insights = insightsJson.data?.[0] || null;

  const campsJson = await metaGraphGet(`/${adAccountId}/campaigns`, token, appSecret, {
    fields: `name,status,objective,insights.date_preset(${datePreset}){impressions,reach,clicks,spend}`,
    limit: '15'
  });

  return { accounts, adAccountId, insights, campaigns: campsJson.data || [] };
}

// ── Google Analytics ──────────────────────────────────────────────────────────

async function fetchGoogleAnalytics({ token, propertyId, startDate, endDate }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' }
      ],
      dimensions: []
    })
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(json.error.message || 'Google Analytics API error');
  return json;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid session' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}

  const { platform, integration_id, date_range, ga4_property_id } = body;
  if (!platform || !integration_id) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing platform or integration_id' }) };
  }

  // ── Load integration row ──────────────────────────────────────────────────
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: { select: '*', id: `eq.${integration_id}`, limit: '1' }
  });
  const integration = Array.isArray(rows) ? rows[0] : null;
  if (!integration) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'Integration not found' }) };

  // ── Verify user owns or is a member of the brand container ───────────────
  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${integration.brand_container_id}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'Brand container not found' }) };

  if (bc.user_id !== user.id) {
    const members = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'organization_members', method: 'GET',
      searchParams: { select: 'id', organization_id: `eq.${bc.organization_id}`, user_id: `eq.${user.id}`, limit: '1' }
    });
    if (!Array.isArray(members) || members.length === 0) {
      return { statusCode: 403, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  // ── Auto token management ─────────────────────────────────────────────────
  let token = integration.access_token;

  if (platform === 'google') {
    // Auto-refresh Google token if it expires in < 5 minutes
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    if (integration.token_expires_at && integration.refresh_token && clientId && clientSecret) {
      const expiresAt = new Date(integration.token_expires_at);
      const bufferMs = 5 * 60 * 1000;
      if (Date.now() >= expiresAt.getTime() - bufferMs) {
        try {
          const refreshed = await refreshGoogleToken(integration.refresh_token, clientId, clientSecret);
          token = refreshed.access_token;
          const newExpiry = refreshed.expires_in
            ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
            : null;
          await supabaseRest({
            url: env.url, serviceKey: env.serviceKey,
            path: 'brand_integrations', method: 'PATCH',
            searchParams: { id: `eq.${integration_id}` },
            body: [{ access_token: token, token_expires_at: newExpiry, updated_at: new Date().toISOString() }]
          });
        } catch (e) {
          console.error('[insights] Google token refresh failed:', e?.message);
        }
      }
    }
  }

  if (platform === 'facebook') {
    // Auto-renew Meta long-lived token if it expires in < 15 days (silent, no user interaction needed)
    const appId = process.env.META_APP_ID || '';
    const appSecret = process.env.META_APP_SECRET || '';
    if (integration.token_expires_at && appId && appSecret) {
      const expiresAt = new Date(integration.token_expires_at);
      const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
      if (Date.now() >= expiresAt.getTime() - fifteenDaysMs) {
        try {
          const renewed = await renewMetaToken(token, appId, appSecret);
          token = renewed.access_token;
          const newExpiry = renewed.expires_in
            ? new Date(Date.now() + Number(renewed.expires_in) * 1000).toISOString()
            : null;
          await supabaseRest({
            url: env.url, serviceKey: env.serviceKey,
            path: 'brand_integrations', method: 'PATCH',
            searchParams: { id: `eq.${integration_id}` },
            body: [{ access_token: token, token_expires_at: newExpiry, updated_at: new Date().toISOString() }]
          });
        } catch (e) {
          // Log but don't fail — current token may still work
          console.warn('[insights] Meta token renewal skipped:', e?.message);
        }
      }
    }
  }

  // ── Date range mapping ────────────────────────────────────────────────────
  const presetMap  = { '7d': 'last_7_d',    '30d': 'last_30_d',   '90d': 'last_90_d' };
  const gaStartMap = { '7d': '7daysAgo',    '30d': '30daysAgo',   '90d': '90daysAgo' };
  const datePreset = presetMap[date_range]  || 'last_30_d';
  const gaStart    = gaStartMap[date_range] || '30daysAgo';

  try {
    let data = {};

    if (platform === 'facebook') {
      const appSecret = process.env.META_APP_SECRET || '';
      data = await fetchMetaInsights({ token, datePreset, appSecret });
    } else if (platform === 'google') {
      if (!ga4_property_id) {
        return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'ga4_property_id is required for Google Analytics' }) };
      }
      // Persist ga4_property_id in metadata if new
      if (integration.metadata?.ga4_property_id !== ga4_property_id) {
        const newMeta = { ...(integration.metadata || {}), ga4_property_id };
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_integrations', method: 'PATCH',
          searchParams: { id: `eq.${integration_id}` },
          body: [{ metadata: newMeta, updated_at: new Date().toISOString() }]
        });
      }
      data = await fetchGoogleAnalytics({ token, propertyId: ga4_property_id, startDate: gaStart, endDate: 'today' });
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, data })
    };
  } catch (e) {
    console.error('[insights] fetch error:', e?.message);
    return {
      statusCode: 500,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: e?.message || 'Failed to fetch insights' })
    };
  }
};
