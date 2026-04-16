/**
 * api-brand-analytics-ga4
 * Métricas GA4 con el mismo OAuth de Google que YouTube.
 *
 * 1) Analytics Admin API: accountSummaries → elige propiedad (metadata o primera)
 * 2) Analytics Data API: runReport (sesiones, usuarios, vistas, rebote, duración)
 *
 * GET /api/brand/analytics-ga4?brand_container_id=...&range=30d&property_id=opcional
 * Auth: Bearer <supabase-session-token>
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');

const ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

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

async function googleJson(url, token, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {})
    }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const msg = json.error?.message || json.error?.status || JSON.stringify(json.error || json);
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function collectGa4Properties(accountSummariesResponse) {
  const out = [];
  for (const acc of accountSummariesResponse.accountSummaries || []) {
    for (const ps of acc.propertySummaries || []) {
      const resName = ps.property || '';
      const m = resName.match(/properties\/(\d+)/);
      if (!m) continue;
      out.push({
        id: m[1],
        displayName: ps.displayName || resName
      });
    }
  }
  return out;
}

function pickProperty(properties, preferredId, preferredName) {
  if (!properties.length) return null;
  if (preferredId) {
    const hit = properties.find((p) => p.id === String(preferredId));
    if (hit) return hit;
  }
  if (preferredName) {
    const hit = properties.find((p) => p.displayName === preferredName);
    if (hit) return hit;
  }
  return properties[0];
}

function parseRunReport(report) {
  const headers = report.metricHeaders || [];
  const row = report.rows?.[0];
  const values = row?.metricValues || [];
  const metrics = {};
  headers.forEach((h, i) => {
    const name = h.name;
    const raw = values[i]?.value;
    const n = raw != null && raw !== '' ? Number(raw) : 0;
    metrics[name] = Number.isFinite(n) ? n : 0;
  });
  return metrics;
}

function humanizeGoogleApisDisabled(message) {
  if (!message || typeof message !== 'string') return null;
  const lower = message.toLowerCase();
  const disabled =
    lower.includes('has not been used') ||
    lower.includes('is disabled') ||
    lower.includes('service_disabled') ||
    lower.includes('access not configured');
  if (!disabled) return null;

  const m = message.match(/project[=\s]+(\d+)/i);
  const projectId = m ? m[1] : null;
  const lib = (id) =>
    projectId
      ? `https://console.developers.google.com/apis/library/${id}?project=${projectId}`
      : `https://console.developers.google.com/apis/library/${id}`;

  if (lower.includes('analyticsadmin') || lower.includes('admin.googleapis.com')) {
    return {
      error:
        'La API «Google Analytics Admin API» no está activada en tu proyecto de Google Cloud. ' +
        'Actívala y espera unos minutos.',
      help_url: lib('analyticsadmin.googleapis.com'),
      help_label: 'Activar Google Analytics Admin API'
    };
  }
  if (lower.includes('analyticsdata') || lower.includes('analyticsdata.googleapis.com')) {
    return {
      error:
        'La API «Google Analytics Data API» no está activada en tu proyecto de Google Cloud. ' +
        'Actívala y espera unos minutos.',
      help_url: lib('analyticsdata.googleapis.com'),
      help_label: 'Activar Google Analytics Data API'
    };
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'GET') {
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

  const qs = event.queryStringParameters || {};
  const { brand_container_id } = qs;
  const range = ['7d', '30d', '90d'].includes(qs.range) ? qs.range : '30d';
  const propertyIdOverride = qs.property_id ? String(qs.property_id).replace(/\D/g, '') : '';

  if (!brand_container_id) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }

  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brand_container_id}`, limit: '1' }
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

  const integRows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,access_token,refresh_token,token_expires_at,metadata',
      brand_container_id: `eq.${brand_container_id}`,
      platform: 'eq.google',
      is_active: 'eq.true',
      limit: '1'
    }
  });
  const integ = Array.isArray(integRows) ? integRows[0] : null;
  if (!integ) {
    return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'No active Google integration' }) };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  let token = integ.access_token;
  const meta = integ.metadata && typeof integ.metadata === 'object' ? integ.metadata : {};

  if (integ.token_expires_at && integ.refresh_token && clientId && clientSecret) {
    const expiresAt = new Date(integ.token_expires_at);
    const bufferMs = 5 * 60 * 1000;
    if (Date.now() >= expiresAt.getTime() - bufferMs) {
      try {
        const refreshed = await refreshGoogleToken(integ.refresh_token, clientId, clientSecret);
        token = refreshed.access_token;
        const newExpiry = refreshed.expires_in
          ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
          : null;
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_integrations', method: 'PATCH',
          searchParams: { id: `eq.${integ.id}` },
          body: [{ access_token: token, token_expires_at: newExpiry, updated_at: new Date().toISOString() }]
        });
      } catch (e) {
        console.warn('[analytics-ga4] token refresh failed:', e?.message);
      }
    }
  }

  const gaStartMap = { '7d': '7daysAgo', '30d': '30daysAgo', '90d': '90daysAgo' };
  const rangeLabel = { '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', '90d': 'Últimos 90 días' };
  const startDate = gaStartMap[range];
  const endDate = 'today';

  try {
    const summaries = await googleJson(`${ADMIN_BASE}/accountSummaries`, token);
    const properties = collectGa4Properties(summaries);

    const preferredId = propertyIdOverride || meta.ga4_property_id || '';
    const preferredName = meta.ga4_property_name || '';

    const selected = pickProperty(properties, preferredId, preferredName);

    if (!selected) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          property: null,
          metrics: null,
          date_range: { range, label: rangeLabel[range], startDate, endDate },
          message:
            'No se encontró ninguna propiedad de Google Analytics 4 en esta cuenta. ' +
            'Comprueba que tengas acceso a un flujo GA4 con la misma cuenta de Google.'
        })
      };
    }

    if (String(selected.id) !== String(meta.ga4_property_id || '') || selected.displayName !== (meta.ga4_property_name || '')) {
      try {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_integrations', method: 'PATCH',
          searchParams: { id: `eq.${integ.id}` },
          body: [
            {
              metadata: {
                ...meta,
                ga4_property_id: selected.id,
                ga4_property_name: selected.displayName
              },
              updated_at: new Date().toISOString()
            }
          ]
        });
      } catch (e) {
        console.warn('[analytics-ga4] metadata patch skipped:', e?.message);
      }
    }

    const report = await googleJson(`${DATA_BASE}/properties/${selected.id}:runReport`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    const metrics = parseRunReport(report);

    return {
      statusCode: 200,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        property: { id: selected.id, name: selected.displayName },
        date_range: { range, label: rangeLabel[range], startDate, endDate },
        metrics,
        properties_available: properties.map((p) => ({ id: p.id, name: p.displayName }))
      })
    };
  } catch (e) {
    console.error('[analytics-ga4]', e?.message);
    const friendly = humanizeGoogleApisDisabled(e?.message);
    if (friendly) {
      return {
        statusCode: 503,
        headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
        body: JSON.stringify(friendly)
      };
    }
    return {
      statusCode: e.status && e.status < 500 ? e.status : 500,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e?.message || 'Google Analytics error' })
    };
  }
};
