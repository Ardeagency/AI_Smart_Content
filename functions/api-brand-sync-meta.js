/**
 * api-brand-sync-meta
 * Sensor que sincroniza datos orgánicos de Meta (Facebook Pages) con la DB.
 *
 * Flujo:
 *  1. Lee la integración Meta activa del brand_container
 *  2. Obtiene páginas de Facebook gestionadas por el usuario
 *  3. Por cada página:
 *     a. Descarga los últimos posts con métricas de engagement
 *     b. Upsert en brand_posts (red = 'facebook', is_competitor = false)
 *     c. Calcula brand_analytics_snapshots para 7d / 30d
 *     d. Recalcula brand_audience_heatmap (hora y día óptimos)
 *  4. Devuelve resumen de lo sincronizado
 *
 * POST /api/brand/sync-meta
 * Body: { brand_container_id }
 * Auth: Bearer <supabase-session-token>
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');

const META_API_VERSION = 'v22.0';
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Meta helpers ──────────────────────────────────────────────────────────────

async function metaGet(path, token, params = {}) {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(`[Meta] ${json.error.message || JSON.stringify(json.error)}`);
  return json;
}

async function getPageToken(userToken, pageId) {
  const data = await metaGet(`/${pageId}`, userToken, { fields: 'access_token' });
  return data.access_token || userToken;
}

// Obtiene posts de una página con métricas básicas de engagement
async function fetchPagePosts(pageToken, pageId, since) {
  const sinceTs = Math.floor(since.getTime() / 1000);
  const data = await metaGet(`/${pageId}/posts`, pageToken, {
    fields: 'id,message,story,created_time,permalink_url,full_picture,attachments{media_type},likes.summary(true),comments.summary(true),shares',
    since: String(sinceTs),
    limit: '50'
  });
  return data.data || [];
}

// Obtiene insights de la página para un período
async function fetchPageInsights(pageToken, pageId, metric, period, since, until) {
  try {
    const data = await metaGet(`/${pageId}/insights`, pageToken, {
      metric,
      period,
      since: Math.floor(since.getTime() / 1000).toString(),
      until: Math.floor(until.getTime() / 1000).toString()
    });
    return data.data || [];
  } catch (_) {
    return [];
  }
}

// ── Snapshot builder ──────────────────────────────────────────────────────────

function buildSnapshot(posts, pageInsights, period) {
  const totalLikes    = posts.reduce((s, p) => s + (p.likes?.summary?.total_count  || 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments?.summary?.total_count || 0), 0);
  const totalShares   = posts.reduce((s, p) => s + (p.shares?.count || 0), 0);
  const totalEng      = totalLikes + totalComments + totalShares;

  // Seguidores / fans de la página
  const fansMetric = pageInsights.find(m => m.name === 'page_fans');
  const reachMetric = pageInsights.find(m => m.name === 'page_impressions_unique');
  const impMetric   = pageInsights.find(m => m.name === 'page_impressions');

  const latestFans   = fansMetric?.values?.slice(-1)[0]?.value   || 0;
  const totalReach   = (reachMetric?.values || []).reduce((s, v) => s + (v.value || 0), 0);
  const totalImpress = (impMetric?.values   || []).reduce((s, v) => s + (v.value || 0), 0);

  return {
    followers:           latestFans,
    reach:               totalReach,
    impressions:         totalImpress,
    posts_count:         posts.length,
    total_likes:         totalLikes,
    total_comments:      totalComments,
    total_shares:        totalShares,
    total_engagement:    totalEng,
    avg_engagement_rate: posts.length > 0 ? Math.round((totalEng / posts.length) * 100) / 100 : 0,
    period
  };
}

// ── Heatmap builder ───────────────────────────────────────────────────────────

function buildHeatmap(posts) {
  const hourMap = {};
  const dayMap  = {};

  for (let h = 0; h < 24; h++) hourMap[h] = { total: 0, count: 0 };
  for (let d = 0; d < 7; d++) dayMap[d]   = { total: 0, count: 0 };

  posts.forEach(post => {
    const dt  = new Date(post.created_time);
    const h   = dt.getHours();
    const d   = (dt.getDay() + 6) % 7; // 0=lunes
    const eng = (post.likes?.summary?.total_count || 0)
              + (post.comments?.summary?.total_count || 0)
              + (post.shares?.count || 0);
    hourMap[h].total += eng; hourMap[h].count++;
    dayMap[d].total  += eng; dayMap[d].count++;
  });

  const hEng = {}; const dEng = {};
  let maxH = 0; let bestHour = 9;
  let maxD = 0; let bestDay  = 1;

  Object.entries(hourMap).forEach(([h, { total, count }]) => {
    const avg = count > 0 ? total / count : 0;
    hEng[h] = Math.round(avg * 100) / 100;
    if (avg > maxH) { maxH = avg; bestHour = Number(h); }
  });
  Object.entries(dayMap).forEach(([d, { total, count }]) => {
    const avg = count > 0 ? total / count : 0;
    dEng[d] = Math.round(avg * 100) / 100;
    if (avg > maxD) { maxD = avg; bestDay = Number(d); }
  });

  // Normalizar 0-1
  const maxHVal = Math.max(...Object.values(hEng), 1);
  const maxDVal = Math.max(...Object.values(dEng), 1);
  const hNorm = {}; const dNorm = {};
  Object.entries(hEng).forEach(([h, v]) => { hNorm[h] = Math.round((v / maxHVal) * 100) / 100; });
  Object.entries(dEng).forEach(([d, v]) => { dNorm[d] = Math.round((v / maxDVal) * 100) / 100; });

  return { hour_engagement: hNorm, day_engagement: dNorm, best_hour: bestHour, best_day: bestDay };
}

// ── Handler ───────────────────────────────────────────────────────────────────

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

  const { brand_container_id } = body;
  if (!brand_container_id) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }

  // Verificar acceso al brand container
  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brand_container_id}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Brand container not found' }) };

  if (bc.user_id !== user.id) {
    const members = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'organization_members', method: 'GET',
      searchParams: { select: 'id', organization_id: `eq.${bc.organization_id}`, user_id: `eq.${user.id}`, limit: '1' }
    });
    if (!Array.isArray(members) || members.length === 0) {
      return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  // Obtener integración Meta activa
  const integRows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,access_token,token_expires_at,external_account_id',
      brand_container_id: `eq.${brand_container_id}`,
      platform: 'eq.facebook',
      is_active: 'eq.true',
      limit: '1'
    }
  });
  const integ = Array.isArray(integRows) ? integRows[0] : null;
  if (!integ) {
    return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'No active Meta integration found' }) };
  }

  // Verificar que el token no esté expirado
  if (integ.token_expires_at && new Date(integ.token_expires_at) < new Date()) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Meta token expired. Please reconnect.' }) };
  }

  const userToken = integ.access_token;
  const summary   = { pages_synced: 0, posts_synced: 0, snapshots_updated: 0 };

  try {
    // Obtener páginas gestionadas
    const pagesData = await metaGet('/me/accounts', userToken, {
      fields: 'id,name,fan_count,picture{url},category,link'
    });
    const pages = pagesData.data || [];
    if (pages.length === 0) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, summary: { ...summary, message: 'No Facebook Pages found for this account' } })
      };
    }

    const now   = new Date();
    const ago30 = new Date(now - 30 * 86400000);
    const ago7  = new Date(now - 7  * 86400000);

    for (const page of pages.slice(0, 3)) { // máximo 3 páginas
      const pageToken = await getPageToken(userToken, page.id).catch(() => userToken);

      // Posts últimos 30 días
      const posts30 = await fetchPagePosts(pageToken, page.id, ago30).catch(() => []);

      // Upsert posts en brand_posts
      for (const post of posts30) {
        const mediaType = post.attachments?.data?.[0]?.media_type || 'text';
        const metrics = {
          likes:    post.likes?.summary?.total_count    || 0,
          comments: post.comments?.summary?.total_count || 0,
          shares:   post.shares?.count                  || 0
        };
        const postRow = {
          brand_container_id,
          network:        'facebook',
          profile_handle: page.name,
          post_id:        post.id,
          content:        post.message || post.story || '',
          media_assets:   post.full_picture
            ? [{ type: mediaType, url: post.full_picture, permalink: post.permalink_url }]
            : [],
          metrics,
          sentiment:      {},
          is_competitor:  false,
          captured_at:    post.created_time
        };

        // Upsert por post_id
        const existing = await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_posts', method: 'GET',
          searchParams: { select: 'id', post_id: `eq.${post.id}`, brand_container_id: `eq.${brand_container_id}`, limit: '1' }
        });
        if (Array.isArray(existing) && existing.length > 0) {
          // Actualizar solo métricas
          await supabaseRest({
            url: env.url, serviceKey: env.serviceKey,
            path: 'brand_posts', method: 'PATCH',
            searchParams: { id: `eq.${existing[0].id}` },
            body: [{ metrics }]
          });
        } else {
          await supabaseRest({
            url: env.url, serviceKey: env.serviceKey,
            path: 'brand_posts', method: 'POST',
            body: [postRow]
          });
          summary.posts_synced++;
        }
      }

      // Page Insights (30d)
      const pageInsights30 = await fetchPageInsights(
        pageToken, page.id,
        'page_fans,page_impressions,page_impressions_unique',
        'day', ago30, now
      ).catch(() => []);

      // Snapshots 30d
      const snap30 = buildSnapshot(posts30, pageInsights30, '30d');
      const snap30Row = {
        brand_container_id,
        platform:     'facebook',
        period_type:  '30d',
        period_start: ago30.toISOString().split('T')[0],
        period_end:   now.toISOString().split('T')[0],
        metrics:      { ...snap30, page_id: page.id, page_name: page.name, fan_count: page.fan_count },
        computed_at:  now.toISOString()
      };

      // Upsert snapshot 30d
      const existSnap30 = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_analytics_snapshots', method: 'GET',
        searchParams: {
          select: 'id',
          brand_container_id: `eq.${brand_container_id}`,
          platform: 'eq.facebook',
          period_type: 'eq.30d',
          limit: '1'
        }
      });
      if (Array.isArray(existSnap30) && existSnap30.length > 0) {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_analytics_snapshots', method: 'PATCH',
          searchParams: { id: `eq.${existSnap30[0].id}` },
          body: [{ metrics: snap30Row.metrics, computed_at: snap30Row.computed_at, period_start: snap30Row.period_start, period_end: snap30Row.period_end }]
        });
      } else {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_analytics_snapshots', method: 'POST',
          body: [snap30Row]
        });
      }
      summary.snapshots_updated++;

      // Snapshot 7d
      const posts7 = posts30.filter(p => new Date(p.created_time) >= ago7);
      const pageInsights7 = await fetchPageInsights(
        pageToken, page.id,
        'page_fans,page_impressions,page_impressions_unique',
        'day', ago7, now
      ).catch(() => []);

      const snap7 = buildSnapshot(posts7, pageInsights7, '7d');
      const snap7Row = {
        brand_container_id,
        platform:     'facebook',
        period_type:  '7d',
        period_start: ago7.toISOString().split('T')[0],
        period_end:   now.toISOString().split('T')[0],
        metrics:      { ...snap7, page_id: page.id, page_name: page.name, fan_count: page.fan_count },
        computed_at:  now.toISOString()
      };
      const existSnap7 = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_analytics_snapshots', method: 'GET',
        searchParams: {
          select: 'id',
          brand_container_id: `eq.${brand_container_id}`,
          platform: 'eq.facebook',
          period_type: 'eq.7d',
          limit: '1'
        }
      });
      if (Array.isArray(existSnap7) && existSnap7.length > 0) {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_analytics_snapshots', method: 'PATCH',
          searchParams: { id: `eq.${existSnap7[0].id}` },
          body: [{ metrics: snap7Row.metrics, computed_at: snap7Row.computed_at, period_start: snap7Row.period_start, period_end: snap7Row.period_end }]
        });
      } else {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_analytics_snapshots', method: 'POST',
          body: [snap7Row]
        });
      }
      summary.snapshots_updated++;

      // Heatmap basado en posts 30d
      const heatmap = buildHeatmap(posts30);
      const hmRow = {
        brand_container_id,
        platform:        'facebook',
        hour_engagement: heatmap.hour_engagement,
        day_engagement:  heatmap.day_engagement,
        best_hour:       heatmap.best_hour,
        best_day:        heatmap.best_day,
        computed_at:     now.toISOString()
      };
      const existHm = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_audience_heatmap', method: 'GET',
        searchParams: { select: 'id', brand_container_id: `eq.${brand_container_id}`, platform: 'eq.facebook', limit: '1' }
      });
      if (Array.isArray(existHm) && existHm.length > 0) {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_audience_heatmap', method: 'PATCH',
          searchParams: { id: `eq.${existHm[0].id}` },
          body: [hmRow]
        });
      } else {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: 'brand_audience_heatmap', method: 'POST',
          body: [hmRow]
        });
      }

      summary.pages_synced++;
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, summary })
    };

  } catch (e) {
    console.error('[brand-sync-meta] error:', e?.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: e?.message || 'Sync failed' })
    };
  }
};
