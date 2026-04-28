/**
 * GET /api/insights/snapshots-list?brand_container_id=<uuid>&limit=25
 * Lee brand_analytics_snapshots y brand_audience_heatmap con service role
 * (evita RLS que oculta filas al cliente JS) tras validar sesión y acceso al contenedor.
 */
const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
} = require('./lib/ai-shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let env;
  try {
    env = getSupabaseEnv();
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid session' }) };
  }

  const qs = event.queryStringParameters || {};
  const brand_container_id = qs.brand_container_id;
  const limit = Math.min(Math.max(parseInt(qs.limit || '25', 10) || 25, 1), 50);

  if (!brand_container_id) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }

  const containers = await supabaseRest({
    url: env.url,
    serviceKey: env.serviceKey,
    path: 'brand_containers',
    method: 'GET',
    searchParams: {
      select: 'id,user_id,organization_id',
      id: `eq.${brand_container_id}`,
      limit: '1',
    },
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) {
    return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'Brand container not found' }) };
  }

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
        limit: '1',
      },
    });
    if (!Array.isArray(members) || members.length === 0) {
      return { statusCode: 403, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const [snapshots, heatmaps] = await Promise.all([
      supabaseRest({
        url: env.url,
        serviceKey: env.serviceKey,
        path: 'brand_analytics_snapshots',
        method: 'GET',
        searchParams: {
          select: 'id,platform,period_type,period_start,period_end,metrics,computed_at',
          brand_container_id: `eq.${brand_container_id}`,
          order: 'period_end.desc',
          limit: String(limit),
        },
      }),
      supabaseRest({
        url: env.url,
        serviceKey: env.serviceKey,
        path: 'brand_audience_heatmap',
        method: 'GET',
        searchParams: {
          select: 'id,platform,best_hour,best_day,hour_engagement,day_engagement,computed_at',
          brand_container_id: `eq.${brand_container_id}`,
        },
      }),
    ]);

    return {
      statusCode: 200,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        snapshots: Array.isArray(snapshots) ? snapshots : [],
        heatmaps: Array.isArray(heatmaps) ? heatmaps : [],
      }),
    };
  } catch (e) {
    return {
      statusCode: e.statusCode || 500,
      headers: corsHeaders(event),
      body: JSON.stringify({ ok: false, error: e.message || 'Server error' }),
    };
  }
};
