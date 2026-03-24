/**
 * api-insights-fetch
 * Obtiene métricas de Meta (Ads) y Google Analytics 4 usando los tokens
 * almacenados en brand_integrations. Refresca el access_token de Google si expiró.
 *
 * Env vars necesarias (Netlify Dashboard):
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  – para refrescar tokens de Google
 *
 * Scopes recomendados (env vars en Netlify):
 *   FACEBOOK_OAUTH_SCOPES=ads_read,ads_management,read_insights,pages_read_engagement
 *   GOOGLE_OAUTH_SCOPES=openid email profile https://www.googleapis.com/auth/analytics.readonly
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

// ── Helpers ────────────────────────────────────────────────────────────────

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
  return json;
}

async function fetchMetaInsights({ token, datePreset }) {
  const GRAPH = 'https://graph.facebook.com/v20.0';

  // 1. Get ad accounts
  const accountsRes = await fetch(
    `${GRAPH}/me/adaccounts?fields=name,account_id,currency,account_status&limit=10&access_token=${token}`
  );
  const accountsJson = await accountsRes.json().catch(() => ({}));
  if (accountsJson.error) throw new Error(accountsJson.error.message || 'Meta API error');

  const accounts = accountsJson.data || [];
  if (accounts.length === 0) return { accounts: [], adAccountId: null, insights: null, campaigns: [] };

  const adAccountId = accounts[0].id;

  // 2. Account-level insights
  const insightsUrl =
    `${GRAPH}/${adAccountId}/insights` +
    `?fields=impressions,reach,clicks,spend,cpc,cpm,ctr,actions` +
    `&date_preset=${datePreset}` +
    `&level=account` +
    `&access_token=${token}`;
  const insightsRes = await fetch(insightsUrl);
  const insightsJson = await insightsRes.json().catch(() => ({}));
  const insights = insightsJson.data?.[0] || null;

  // 3. Campaigns with their insights
  const campsUrl =
    `${GRAPH}/${adAccountId}/campaigns` +
    `?fields=name,status,objective,insights.date_preset(${datePreset}){impressions,reach,clicks,spend}` +
    `&limit=15` +
    `&access_token=${token}`;
  const campsRes = await fetch(campsUrl);
  const campsJson = await campsRes.json().catch(() => ({}));
  const campaigns = campsJson.data || [];

  return { accounts, adAccountId, insights, campaigns };
}

async function fetchGoogleAnalytics({ token, propertyId, startDate, endDate }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
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

function shouldUseMetaTestToken(platform, body) {
  const testToken = String(process.env.META_TEST_ACCESS_TOKEN || '').trim();
  if (platform !== 'facebook' || !testToken) return false;

  // Se habilita solo bajo solicitud explícita del cliente.
  return body?.use_test_token === true;
}

// ── Handler ────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid session' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}

  const { platform, integration_id, date_range, ga4_property_id } = body;
  if (!platform || !integration_id) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing platform or integration_id' }) };
  }

  // ── Load integration row ──────────────────────────────────────────────
  const rows = await supabaseRest({
    url: env.url,
    serviceKey: env.serviceKey,
    path: 'brand_integrations',
    method: 'GET',
    searchParams: { select: '*', id: `eq.${integration_id}`, limit: '1' }
  });
  const integration = Array.isArray(rows) ? rows[0] : null;
  if (!integration) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Integration not found' }) };

  // ── Authorization: verify user owns or is member of the brand container ──
  const containers = await supabaseRest({
    url: env.url,
    serviceKey: env.serviceKey,
    path: 'brand_containers',
    method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${integration.brand_container_id}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Brand container not found' }) };

  if (bc.user_id !== user.id) {
    const members = await supabaseRest({
      url: env.url,
      serviceKey: env.serviceKey,
      path: 'organization_members',
      method: 'GET',
      searchParams: {
        select: 'id',
        organization_id: `eq.${bc.organization_id}`,
        user_id: `eq.${user.id}`,
        limit: '1'
      }
    });
    if (!Array.isArray(members) || members.length === 0) {
      return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  // ── Token selection / refresh (Google only) ───────────────────────────
  let token = integration.access_token;
  if (shouldUseMetaTestToken(platform, body)) {
    token = String(process.env.META_TEST_ACCESS_TOKEN || '').trim();
  }

  if (platform === 'google' && integration.token_expires_at && integration.refresh_token) {
    const expiresAt = new Date(integration.token_expires_at);
    const bufferMs = 5 * 60 * 1000;
    if (Date.now() >= expiresAt.getTime() - bufferMs) {
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
      try {
        const refreshed = await refreshGoogleToken(integration.refresh_token, clientId, clientSecret);
        token = refreshed.access_token;
        const newExpiry = refreshed.expires_in
          ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
          : null;
        await supabaseRest({
          url: env.url,
          serviceKey: env.serviceKey,
          path: 'brand_integrations',
          method: 'PATCH',
          searchParams: { id: `eq.${integration_id}` },
          body: [{ access_token: token, token_expires_at: newExpiry, updated_at: new Date().toISOString() }]
        });
      } catch (e) {
        console.error('Token refresh failed:', e);
      }
    }
  }

  // ── Date range ────────────────────────────────────────────────────────
  const presetMap = { '7d': 'last_7_d', '30d': 'last_30_d', '90d': 'last_90_d' };
  const gaStartMap = { '7d': '7daysAgo', '30d': '30daysAgo', '90d': '90daysAgo' };
  const datePreset = presetMap[date_range] || 'last_30_d';
  const gaStart = gaStartMap[date_range] || '30daysAgo';

  try {
    let data = {};

    if (platform === 'facebook') {
      data = await fetchMetaInsights({ token, datePreset });
    } else if (platform === 'google') {
      if (!ga4_property_id) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'ga4_property_id is required for Google Analytics' }) };
      }
      // Save property ID in metadata if new
      const existingPropId = integration.metadata?.ga4_property_id;
      if (existingPropId !== ga4_property_id) {
        const newMeta = { ...(integration.metadata || {}), ga4_property_id };
        await supabaseRest({
          url: env.url,
          serviceKey: env.serviceKey,
          path: 'brand_integrations',
          method: 'PATCH',
          searchParams: { id: `eq.${integration_id}` },
          body: [{ metadata: newMeta, updated_at: new Date().toISOString() }]
        });
      }
      data = await fetchGoogleAnalytics({ token, propertyId: ga4_property_id, startDate: gaStart, endDate: 'today' });
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, data })
    };
  } catch (e) {
    console.error('api-insights-fetch error:', e);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: e?.message || 'Failed to fetch insights' })
    };
  }
};
