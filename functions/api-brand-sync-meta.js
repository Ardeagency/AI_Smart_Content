/**
 * api-brand-sync-meta
 * Sincronización completa de Meta (Facebook Pages + Instagram Business).
 *
 * ── DATA QUE EXTRAE ─────────────────────────────────────────────────────────
 *
 *  FACEBOOK PAGES
 *    /{pageId}/posts          → posts últimos 30d (likes, comments, shares)
 *    /{postId}/insights       → reach, impressions por post
 *    /{pageId}/insights       → fans, reach diario, impressiones de página
 *
 *  INSTAGRAM BUSINESS
 *    /{igId}/media            → posts, reels, carruseles (últimos 50)
 *    /{mediaId}/insights      → por post: reach, impressions, saved, shares,
 *                               video_views, avg_watch_time (según media_type)
 *    /{igId}/insights (day)   → time series diario: reach, impressions,
 *                               profile_views, website_clicks, follower_count
 *    /{igId}/insights (life)  → audience demographics: gender_age, country, city
 *    /{igId}/stories          → últimas 20 stories con insights
 *    /{igId}                  → followers_count, media_count, follows_count
 *
 * ── ALMACENAMIENTO ──────────────────────────────────────────────────────────
 *
 *  brand_posts.metrics          → métricas por post (enriquecidas)
 *  brand_analytics_snapshots    → snapshot con time_series + audience + stories
 *  brand_audience_heatmap       → heat map + audience_demographics
 *
 * POST /api/brand/sync-meta
 * Body: { brand_container_id }
 * Auth: Bearer <supabase-session-token>
 */

const {
  corsHeaders, getSupabaseEnv, getBearerToken, fetchSupabaseUser, supabaseRest
} = require('./lib/ai-shared');
const { decryptIntegrationRow } = require('./lib/integration-token-vault');
const { metaGraphGet, metaGraphGetPaged } = require('./lib/meta-graph');

const appSecret = () => process.env.META_APP_SECRET || '';
const meta      = (path, token, params) => metaGraphGet(path, token, appSecret(), params);
const metaPaged = (path, token, params, max) => metaGraphGetPaged(path, token, appSecret(), params, max);

// ── Facebook: obtener page token ─────────────────────────────────────────────

async function getPageToken(userToken, pageId) {
  const data = await meta(`/${pageId}`, userToken, { fields: 'access_token' });
  return data.access_token || userToken;
}

// Extrae hashtags del texto del post (deterministico, sin LLM). Formato consistente
// con los de competidores (Apify): SIN el '#', case original, dedupe case-insensitive.
// Alimenta dashboard_estrategia_hashtags para posts propios (DATA-002).
function extractHashtags(text) {
  if (!text || typeof text !== 'string') return [];
  // Lookbehind negativo: el '#' NO debe ir precedido de letra/numero/_//&, para no
  // cazar fragmentos de URL (x.com/#frag), entidades HTML (&#123) ni mid-word (C#).
  const matches = text.match(/(?<![\p{L}\p{N}_/&])#[\p{L}\p{N}_]+/gu);
  if (!matches) return [];
  const out = [];
  const seen = new Set();
  for (const m of matches) {
    const tag = m.slice(1); // quita el '#'
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) { seen.add(key); out.push(tag); }
  }
  return out;
}

// ── Facebook: posts ───────────────────────────────────────────────────────────

async function fetchFbPosts(pageToken, pageId, since) {
  const sinceTs = Math.floor(since.getTime() / 1000);
  try {
    const data = await meta(`/${pageId}/posts`, pageToken, {
      fields: 'id,message,story,created_time,permalink_url,full_picture,attachments{media_type},likes.summary(true),comments.summary(true),shares',
      since: String(sinceTs),
      limit: '50'
    });
    return data.data || [];
  } catch (e) {
    console.warn('[sync] fetchFbPosts:', e.message);
    return [];
  }
}

// ── Facebook: insights por post (reach + impressions) ─────────────────────────

async function fetchFbPostInsights(pageToken, postId) {
  try {
    const data = await meta(`/${postId}/insights`, pageToken, {
      metric: 'post_impressions,post_impressions_unique,post_reactions_like_total'
    });
    const m = {};
    (data.data || []).forEach(item => {
      m[item.name] = item.values?.[item.values.length - 1]?.value ?? item.value ?? 0;
    });
    return {
      impressions: m.post_impressions              || 0,
      reach:       m.post_impressions_unique       || 0,
      reactions:   m.post_reactions_like_total     || 0
    };
  } catch (_) {
    return { impressions: 0, reach: 0, reactions: 0 };
  }
}

// ── Facebook: page insights ───────────────────────────────────────────────────

async function fetchFbPageInsights(pageToken, pageId, metric, period, since, until) {
  try {
    const data = await meta(`/${pageId}/insights`, pageToken, {
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

// ── Instagram: media list ─────────────────────────────────────────────────────

async function fetchIgMedia(pageToken, igId, limit = 50) {
  try {
    return await metaPaged(`/${igId}/media`, pageToken, {
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
    }, limit);
  } catch (e) {
    console.warn('[sync] fetchIgMedia:', e.message);
    return [];
  }
}

// ── Instagram: insights por post ─────────────────────────────────────────────
// Graph API v22+: Meta ELIMINO `impressions`, `plays` y `video_views` de los
// insights de media y los unifico en `views` (cuenta de reproducciones/vistas
// para TODOS los tipos, incl. reels). Pedir un metric removido hace fallar la
// llamada entera (400) → por eso antes quedaba todo en 0. Aqui pedimos el set
// moderno valido en v22 y, si aun asi falla, reintentamos con un set minimo.
//   likes/comments NO se piden aqui: vienen de like_count/comments_count del media.

const IG_POST_METRICS = {
  IMAGE:          'reach,views,saved,total_interactions',
  CAROUSEL_ALBUM: 'reach,views,saved,total_interactions',
  VIDEO:          'reach,views,saved,total_interactions',
  REEL:           'reach,views,saved,total_interactions,ig_reels_avg_watch_time',
};

async function fetchIgPostInsights(pageToken, mediaId, mediaType) {
  const parse = (data) => {
    const m = {};
    (data.data || []).forEach(item => { m[item.name] = item.values?.[0]?.value ?? item.value ?? 0; });
    return m;
  };
  let m = null;
  try {
    m = parse(await meta(`/${mediaId}/insights`, pageToken, { metric: IG_POST_METRICS[mediaType] || IG_POST_METRICS.IMAGE }));
  } catch (_) {
    // Fallback: set minimo que nunca deberia 400 en v22 (un metric invalido
    // tumba toda la llamada, asi no perdemos reach/views por un campo extra).
    try { m = parse(await meta(`/${mediaId}/insights`, pageToken, { metric: 'reach,views' })); }
    catch (_) { m = {}; }
  }
  return {
    impressions:        m.views                 || 0,   // v22: `views` sucede a impressions
    reach:              m.reach                  || 0,
    saved:              m.saved                  || 0,
    video_views:        m.views                  || 0,   // v22: `views` = reproducciones (todos los tipos)
    avg_watch_time_ms:  m.ig_reels_avg_watch_time || 0,
    total_interactions: m.total_interactions     || 0,
    profile_visits:     0,
    follows:            0,
  };
}

// ── Instagram: time series de cuenta ─────────────────────────────────────────
// Devuelve { "2026-03-01": { reach, impressions, profile_views, website_clicks }, ... }

async function fetchIgTimeSeries(pageToken, igId, since, until) {
  try {
    const data = await meta(`/${igId}/insights`, pageToken, {
      metric: 'impressions,reach,profile_views,website_clicks',
      period: 'day',
      since: Math.floor(since.getTime() / 1000).toString(),
      until: Math.floor(until.getTime() / 1000).toString()
    });
    const series = {};
    (data.data || []).forEach(metric => {
      (metric.values || []).forEach(v => {
        const date = (v.end_time || '').slice(0, 10);
        if (!date) return;
        if (!series[date]) series[date] = {};
        series[date][metric.name] = v.value || 0;
      });
    });
    return series;
  } catch (e) {
    console.warn('[sync] fetchIgTimeSeries:', e.message);
    return {};
  }
}

// ── Instagram: follower count time series ─────────────────────────────────────

async function fetchIgFollowerTimeSeries(pageToken, igId, since, until) {
  try {
    const data = await meta(`/${igId}/insights`, pageToken, {
      metric: 'follower_count',
      period: 'day',
      since: Math.floor(since.getTime() / 1000).toString(),
      until: Math.floor(until.getTime() / 1000).toString()
    });
    const series = {};
    ((data.data || [])[0]?.values || []).forEach(v => {
      const date = (v.end_time || '').slice(0, 10);
      if (date) series[date] = v.value || 0;
    });
    return series;
  } catch (_) {
    return {};
  }
}

// ── Instagram: audience demographics ─────────────────────────────────────────
// Requiere ≥100 seguidores. Devuelve gender_age, country, city.

async function fetchIgAudience(pageToken, igId) {
  try {
    const data = await meta(`/${igId}/insights`, pageToken, {
      metric: 'audience_gender_age,audience_country,audience_city',
      period: 'lifetime'
    });
    const result = {};
    (data.data || []).forEach(m => {
      result[m.name] = m.values?.[0]?.value || {};
    });
    return result;
  } catch (e) {
    console.warn('[sync] fetchIgAudience:', e.message);
    return {};
  }
}

// ── Instagram: online followers heatmap ──────────────────────────────────────
// online_followers da {hour: count} para hoy.

async function fetchIgOnlineFollowers(pageToken, igId) {
  try {
    const data = await meta(`/${igId}/insights`, pageToken, {
      metric: 'online_followers',
      period: 'lifetime'
    });
    return (data.data || [])[0]?.values?.[0]?.value || {};
  } catch (_) {
    return {};
  }
}

// ── Instagram: profile info ───────────────────────────────────────────────────

async function fetchIgProfile(pageToken, igId) {
  try {
    return await meta(`/${igId}`, pageToken, {
      fields: 'id,username,followers_count,follows_count,media_count,profile_picture_url,biography,website'
    });
  } catch (_) {
    return {};
  }
}

// ── Instagram: stories ────────────────────────────────────────────────────────

async function fetchIgStories(pageToken, igId) {
  try {
    const stories = await metaPaged(`/${igId}/stories`, pageToken, {
      fields: 'id,media_type,timestamp,media_url'
    }, 20);

    const withInsights = await Promise.allSettled(
      stories.map(async story => {
        try {
          const ins = await meta(`/${story.id}/insights`, pageToken, {
            metric: 'impressions,reach,exits,replies,taps_forward,taps_back'
          });
          const m = {};
          (ins.data || []).forEach(item => { m[item.name] = item.values?.[0]?.value ?? 0; });
          return { id: story.id, timestamp: story.timestamp, media_type: story.media_type, ...m };
        } catch (_) {
          return { id: story.id, timestamp: story.timestamp };
        }
      })
    );
    return withInsights
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
  } catch (e) {
    console.warn('[sync] fetchIgStories:', e.message);
    return [];
  }
}

// ── Build: snapshot metrics ────────────────────────────────────────────────────

function buildSnapshot({ fbPosts, fbInsights, igMedia, igPostInsights, igTimeSeries, igFollowerSeries, igProfile, igStories, period, pageInfo }) {
  // Facebook engagement
  const fbLikes    = fbPosts.reduce((s, p) => s + (p.likes?.summary?.total_count    || 0), 0);
  const fbComments = fbPosts.reduce((s, p) => s + (p.comments?.summary?.total_count || 0), 0);
  const fbShares   = fbPosts.reduce((s, p) => s + (p.shares?.count || 0), 0);

  // Instagram engagement
  const igLikes    = igMedia.reduce((s, m) => s + (m.like_count      || 0), 0);
  const igComments = igMedia.reduce((s, m) => s + (m.comments_count  || 0), 0);
  const igSaved    = igPostInsights.reduce((s, pi) => s + (pi.saved  || 0), 0);
  const igShares   = igPostInsights.reduce((s, pi) => s + 0, 0); // shares not always available
  const igReach    = igPostInsights.reduce((s, pi) => s + (pi.reach  || 0), 0);
  const igImpr     = igPostInsights.reduce((s, pi) => s + (pi.impressions || 0), 0);

  // Account totals
  const totalEngagement = fbLikes + fbComments + fbShares + igLikes + igComments + igSaved;
  const totalPosts      = fbPosts.length + igMedia.length;

  // Page fans from Facebook insights
  const fansMetric  = fbInsights.find(m => m.name === 'page_fans');
  const reachMetric = fbInsights.find(m => m.name === 'page_impressions_unique');
  const impMetric   = fbInsights.find(m => m.name === 'page_impressions');
  const fbFans      = fansMetric?.values?.slice(-1)[0]?.value || pageInfo?.fan_count || 0;
  const fbReach     = (reachMetric?.values || []).reduce((s, v) => s + (v.value || 0), 0);
  const fbImpr      = (impMetric?.values   || []).reduce((s, v) => s + (v.value || 0), 0);

  // IG followers
  const igFollowers = igProfile?.followers_count || 0;
  const igFollows   = igProfile?.follows_count   || 0;
  const igMedia_ct  = igProfile?.media_count     || igMedia.length;

  // Stories summary
  const storiesSummary = igStories.length > 0 ? {
    count:           igStories.length,
    total_reach:     igStories.reduce((s, st) => s + (st.reach       || 0), 0),
    total_impr:      igStories.reduce((s, st) => s + (st.impressions || 0), 0),
    total_replies:   igStories.reduce((s, st) => s + (st.replies     || 0), 0),
    avg_exits:       Math.round(igStories.reduce((s, st) => s + (st.exits || 0), 0) / igStories.length),
    avg_taps_fwd:    Math.round(igStories.reduce((s, st) => s + (st.taps_forward || 0), 0) / igStories.length),
    samples:         igStories.slice(0, 5)
  } : null;

  // Video posts metrics (insights alineados por índice con igMedia)
  const videoPostsIndexed = igMedia
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => ['VIDEO', 'REEL'].includes(m.media_type));
  const videoMetrics = videoPostsIndexed.length > 0 ? {
    count:            videoPostsIndexed.length,
    total_views:      videoPostsIndexed.reduce((s, { i }) => s + (igPostInsights[i]?.video_views || 0), 0),
    avg_watch_time_ms: videoPostsIndexed.reduce((s, { i }) => s + (igPostInsights[i]?.avg_watch_time_ms || 0), 0) / videoPostsIndexed.length,
  } : null;

  // Time series: merge IG daily data + follower delta
  const merged_ts = {};
  Object.entries(igTimeSeries).forEach(([date, vals]) => {
    merged_ts[date] = { ...vals };
  });
  Object.entries(igFollowerSeries).forEach(([date, count]) => {
    if (!merged_ts[date]) merged_ts[date] = {};
    merged_ts[date].follower_count = count;
  });

  return {
    period,
    // Totales
    followers:            igFollowers || fbFans,
    followers_ig:         igFollowers,
    follows_ig:           igFollows,
    media_count_ig:       igMedia_ct,
    fans_fb:              fbFans,
    reach:                fbReach + igReach,
    reach_ig:             igReach,
    reach_fb:             fbReach,
    impressions:          fbImpr + igImpr,
    posts_count:          totalPosts,
    fb_posts_count:       fbPosts.length,
    ig_posts_count:       igMedia.length,
    total_likes:          fbLikes + igLikes,
    total_comments:       fbComments + igComments,
    total_shares:         fbShares,
    total_saved:          igSaved,
    total_engagement:     totalEngagement,
    avg_engagement_rate:  totalPosts > 0 ? Math.round((totalEngagement / totalPosts) * 100) / 100 : 0,
    // Time series diario
    time_series:          merged_ts,
    // Stories
    stories:              storiesSummary,
    // Video
    video:                videoMetrics,
  };
}

// ── Build: heatmap ─────────────────────────────────────────────────────────────

function buildHeatmap(posts, igOnlineFollowers) {
  const hourMap = {};
  const dayMap  = {};
  for (let h = 0; h < 24; h++) hourMap[h] = { total: 0, count: 0 };
  for (let d = 0; d < 7; d++) dayMap[d]   = { total: 0, count: 0 };

  posts.forEach(p => {
    const dt  = new Date(p.created_time || p.timestamp);
    if (isNaN(dt)) return;
    const h   = dt.getHours();
    const d   = dt.getDay();
    const eng = (p.likes?.summary?.total_count || p.like_count || 0)
              + (p.comments?.summary?.total_count || p.comments_count || 0)
              + (p.shares?.count || 0);
    hourMap[h].total += eng; hourMap[h].count++;
    dayMap[d].total  += eng; dayMap[d].count++;
  });

  const hEng = {}, dEng = {};
  let maxH = 0, bestHour = 9, maxD = 0, bestDay = 1;

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
  const hNorm = {}, dNorm = {};
  Object.entries(hEng).forEach(([h, v]) => { hNorm[h] = Math.round((v / maxHVal) * 100) / 100; });
  Object.entries(dEng).forEach(([d, v]) => { dNorm[d] = Math.round((v / maxDVal) * 100) / 100; });

  // Si tenemos online_followers de IG, usarlo para best_hour
  const onlineHours = typeof igOnlineFollowers === 'object' ? igOnlineFollowers : {};
  const onlineEntries = Object.entries(onlineHours);
  if (onlineEntries.length > 0) {
    const bestOnlineHour = onlineEntries.reduce((best, [h, v]) => v > best.val ? { h: Number(h), val: v } : best, { h: 0, val: 0 });
    if (bestOnlineHour.val > 0) bestHour = bestOnlineHour.h;
  }

  return {
    hour_engagement: hNorm,
    day_engagement:  dNorm,
    best_hour:       bestHour,
    best_day:        bestDay,
    online_followers_by_hour: onlineHours
  };
}

// ── Upsert: brand_posts ────────────────────────────────────────────────────────

async function upsertBrandPost(env, brandContainerId, postRow, postId) {
  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_posts', method: 'GET',
    searchParams: { select: 'id', post_id: `eq.${postId}`, brand_container_id: `eq.${brandContainerId}`, limit: '1' }
  }).catch(() => []);

  if (Array.isArray(existing) && existing.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_posts', method: 'PATCH',
      searchParams: { id: `eq.${existing[0].id}` },
      // hashtags: refresca posts propios existentes en cada sync (DATA-002). Deterministico
      // desde el mismo caption -> idempotente. postRow.hashtags puede no venir (comentarios, etc.).
      body: [{ metrics: postRow.metrics, captured_at: postRow.captured_at, permalink: postRow.permalink, ...(postRow.hashtags ? { hashtags: postRow.hashtags } : {}) }]
    }).catch(e => console.warn('[sync] upsert patch:', e.message));
    return existing[0].id;
  } else {
    const inserted = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_posts', method: 'POST',
      body: [postRow]
    }).catch(e => { console.warn('[sync] upsert insert:', e.message); return null; });
    return Array.isArray(inserted) && inserted[0] ? inserted[0].id : null;
  }
}

// ── Comentarios de posts PROPIOS vía Graph API (sin Apify) ──────────────────────
// Se guardan crudos (sentiment/emotion = null, is_processed=false); los punta el
// analyzer en batch. Dedupe por (network, external_comment_id).
async function fetchFbComments(pageToken, postId, max = 150) {
  try {
    return await metaPaged(`/${postId}/comments`, pageToken,
      { fields: 'id,message,from{id,name},created_time,like_count', order: 'reverse_chronological' }, max);
  } catch (e) { console.warn(`[sync] fb comments ${postId}: ${e.message}`); return []; }
}
async function fetchIgComments(pageToken, mediaId, max = 150) {
  try {
    return await metaPaged(`/${mediaId}/comments`, pageToken,
      { fields: 'id,text,username,timestamp,like_count' }, max);
  } catch (e) { console.warn(`[sync] ig comments ${mediaId}: ${e.message}`); return []; }
}

async function syncPostComments(env, { brandContainerId, orgId, brandPostId, externalPostId, network, token }) {
  if (!brandPostId || !externalPostId) return 0;
  const isIg = network === 'instagram';
  const raw = isIg ? await fetchIgComments(token, externalPostId) : await fetchFbComments(token, externalPostId);
  if (!Array.isArray(raw) || raw.length === 0) return 0;

  const mapped = raw.map((c) => ({
    external_comment_id: c.id,
    content: isIg ? (c.text || '') : (c.message || ''),
    author_handle: isIg ? (c.username || null) : (c.from?.id || null),
    author_display_name: isIg ? (c.username || null) : (c.from?.name || null),
    posted_at: isIg ? (c.timestamp || null) : (c.created_time || null),
    metrics: { likes: Number(c.like_count) || 0 },
  })).filter((c) => c.external_comment_id && c.content);
  if (!mapped.length) return 0;

  // Dedupe contra lo ya guardado de este post.
  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: 'brand_post_comments', method: 'GET',
    searchParams: { select: 'external_comment_id', network: `eq.${network}`, brand_post_id: `eq.${brandPostId}`, limit: '1000' }
  }).catch(() => []);
  const seen = new Set((Array.isArray(existing) ? existing : []).map((r) => r.external_comment_id));
  const rows = mapped.filter((c) => !seen.has(c.external_comment_id)).map((c) => ({
    brand_post_id: brandPostId, brand_container_id: brandContainerId, organization_id: orgId,
    network, external_comment_id: c.external_comment_id,
    author_handle: c.author_handle, author_display_name: c.author_display_name,
    content: c.content, posted_at: c.posted_at, metrics: c.metrics,
    source: 'meta_api', is_processed: false,
  }));
  if (!rows.length) return 0;
  await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: 'brand_post_comments', method: 'POST', body: rows
  }).catch((e) => console.warn(`[sync] comments insert ${externalPostId}: ${e.message}`));
  return rows.length;
}

// ── Upsert: brand_analytics_snapshots ─────────────────────────────────────────

async function upsertSnapshot(env, brandContainerId, period, metrics, periodStart, periodEnd) {
  const row = {
    brand_container_id: brandContainerId,
    platform:    'facebook',
    period_type: period,
    period_start: periodStart,
    period_end:   periodEnd,
    metrics,
    computed_at: new Date().toISOString()
  };
  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_analytics_snapshots', method: 'GET',
    searchParams: { select: 'id', brand_container_id: `eq.${brandContainerId}`, platform: 'eq.facebook', period_type: `eq.${period}`, limit: '1' }
  }).catch(() => []);

  if (Array.isArray(existing) && existing.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_analytics_snapshots', method: 'PATCH',
      searchParams: { id: `eq.${existing[0].id}` },
      body: [{ metrics, computed_at: row.computed_at, period_start: periodStart, period_end: periodEnd }]
    });
  } else {
    await supabaseRest({ url: env.url, serviceKey: env.serviceKey, path: 'brand_analytics_snapshots', method: 'POST', body: [row] });
  }
}

// ── Upsert: brand_audience_heatmap ────────────────────────────────────────────

async function upsertHeatmap(env, brandContainerId, heatmap, audienceDemographics) {
  const row = {
    brand_container_id:   brandContainerId,
    platform:             'facebook',
    hour_engagement:      heatmap.hour_engagement,
    day_engagement:       heatmap.day_engagement,
    best_hour:            heatmap.best_hour,
    best_day:             heatmap.best_day,
    online_followers_by_hour: heatmap.online_followers_by_hour || {},
    audience_demographics: audienceDemographics || {},
    computed_at:          new Date().toISOString()
  };
  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_audience_heatmap', method: 'GET',
    searchParams: { select: 'id', brand_container_id: `eq.${brandContainerId}`, platform: 'eq.facebook', limit: '1' }
  }).catch(() => []);

  if (Array.isArray(existing) && existing.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_audience_heatmap', method: 'PATCH',
      searchParams: { id: `eq.${existing[0].id}` },
      body: [row]
    });
  } else {
    await supabaseRest({ url: env.url, serviceKey: env.serviceKey, path: 'brand_audience_heatmap', method: 'POST', body: [row] });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  // Auth: sesion de usuario (Bearer, llamado desde la UI) O secreto interno
  // (scheduler/cron). El interno salta la verificacion de usuario + membresia.
  const hdrs = event.headers || {};
  const internalSecret = hdrs['x-internal-secret'] || hdrs['X-Internal-Secret'];
  // Acepta un secreto dedicado (INTERNAL_SYNC_SECRET) o el service_role key (que
  // el scheduler/cron ya posee) → no requiere env var nueva en Netlify.
  const isInternal = !!internalSecret && (
    (!!process.env.INTERNAL_SYNC_SECRET && internalSecret === process.env.INTERNAL_SYNC_SECRET) ||
    (!!env.serviceKey && internalSecret === env.serviceKey)
  );

  let user = null;
  if (!isInternal) {
    const accessToken = getBearerToken(event);
    if (!accessToken)
      return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };

    user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
    if (!user?.id)
      return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid session' }) };
  }

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}
  const { brand_container_id } = body;
  if (!brand_container_id)
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id' }) };

  // Verificar acceso + integración Meta (errores de Supabase → JSON claro, no 500 genérico sin contexto)
  let bc;
  let integ;
  try {
    const containers = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_containers', method: 'GET',
      searchParams: { select: 'id,user_id,organization_id', id: `eq.${brand_container_id}`, limit: '1' }
    });
    bc = Array.isArray(containers) ? containers[0] : null;
    if (!bc) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'Brand container not found' }) };

    if (!isInternal && bc.user_id !== user.id) {
      const members = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'organization_members', method: 'GET',
        searchParams: { select: 'id', organization_id: `eq.${bc.organization_id}`, user_id: `eq.${user.id}`, limit: '1' }
      });
      if (!Array.isArray(members) || members.length === 0)
        return { statusCode: 403, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const integRows = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'GET',
      searchParams: {
        select: 'id,access_token,token_expires_at,external_account_id,metadata',
        brand_container_id: `eq.${brand_container_id}`,
        platform: 'eq.facebook',
        is_active: 'eq.true',
        limit: '1'
      }
    });
    integ = Array.isArray(integRows) ? integRows[0] : null;
    if (integ) decryptIntegrationRow(integ);
  } catch (e) {
    console.error('[brand-sync-meta] setup/db:', e?.message, e?.details || '');
    const code = e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
    return {
      statusCode: code,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: e?.message || 'Database error' })
    };
  }

  if (!integ)
    return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'No active Meta integration found' }) };

  if (integ.token_expires_at && new Date(integ.token_expires_at) < new Date())
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Meta token expired. Please reconnect.' }) };

  const userToken = integ.access_token;
  const now    = new Date();
  const ago30  = new Date(now - 30 * 86400000);
  const ago7   = new Date(now - 7  * 86400000);
  const ago90  = new Date(now - 90 * 86400000);
  const summary = { pages_synced: 0, posts_synced: 0, ig_posts_synced: 0, snapshots_updated: 0 };

  try {
    // PRIVACY: usar SOLO las páginas explícitamente concedidas en el OAuth
    // (guardadas en metadata.pages). NO re-llamar /me/accounts porque devuelve
    // todas las páginas que el user puede manejar (cross-brand contamination).
    const pages = Array.isArray(integ.metadata?.pages) ? integ.metadata.pages : [];

    if (pages.length === 0) {
      return { statusCode: 200, headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, summary: { ...summary, message: 'No granted pages in metadata. Reconnect Meta selecting the page.' } }) };
    }

    let commentsBackfilled = false;  // backfill de comentarios: una sola vez por sync
    for (const page of pages.slice(0, 3)) {
      const pageToken = await getPageToken(userToken, page.id).catch(() => userToken);
      const igAccount = page.instagram_business_account || null;
      const igId      = igAccount?.id || null;

      // ── Facebook Posts ──────────────────────────────────────────────────
      const fbPosts = await fetchFbPosts(pageToken, page.id, ago30);

      // Per-post FB insights en paralelo (limitado a 20 para no saturar)
      const fbInsightResults = await Promise.allSettled(
        fbPosts.slice(0, 20).map(p => fetchFbPostInsights(pageToken, p.id))
      );
      const fbInsightMap = {};
      fbPosts.slice(0, 20).forEach((p, i) => {
        fbInsightMap[p.id] = fbInsightResults[i].status === 'fulfilled' ? fbInsightResults[i].value : {};
      });

      // Upsert posts FB
      for (const post of fbPosts) {
        const pi = fbInsightMap[post.id] || {};
        const metrics = {
          likes:       post.likes?.summary?.total_count    || 0,
          comments:    post.comments?.summary?.total_count || 0,
          shares:      post.shares?.count || 0,
          reach:       pi.reach       || 0,
          impressions: pi.impressions || 0,
          reactions:   pi.reactions   || 0,
        };
        await upsertBrandPost(env, brand_container_id, {
          brand_container_id,
          network:        'facebook',
          profile_handle: page.name,
          post_id:        post.id,
          permalink:      post.permalink_url || null,
          content:        post.message || post.story || '',
          hashtags:       extractHashtags(post.message || post.story || ''),
          media_assets:   post.full_picture ? [{ type: post.attachments?.data?.[0]?.media_type || 'text', url: post.full_picture, permalink: post.permalink_url }] : [],
          metrics,
          sentiment:      {},
          is_competitor:  false,
          captured_at:    post.created_time
        }, post.id);
        summary.posts_synced++;
      }

      // ── Backfill de comentarios: TODO el historial de posts propios (no solo los
      // recientes del sync). Una sola vez por sync, acotado a 300 posts (recientes
      // primero) para respetar rate limits. Usa el token de esta page. Dedupe en BD.
      if (!commentsBackfilled) {
        commentsBackfilled = true;
        try {
          const ownPosts = await supabaseRest({
            url: env.url, serviceKey: env.serviceKey, path: 'brand_posts', method: 'GET',
            searchParams: {
              select: 'id,post_id,network', brand_container_id: `eq.${brand_container_id}`,
              is_competitor: 'eq.false', order: 'captured_at.desc', limit: '300',
            },
          }).catch(() => []);
          for (const op of (Array.isArray(ownPosts) ? ownPosts : [])) {
            if (!op.post_id) continue;
            summary.comments_synced = (summary.comments_synced || 0) + await syncPostComments(env, {
              brandContainerId: brand_container_id, orgId: bc.organization_id,
              brandPostId: op.id, externalPostId: op.post_id, network: op.network, token: pageToken,
            });
          }
        } catch (e) { console.warn('[sync] comments backfill:', e.message); }
      }

      // Page insights (para snapshot)
      const fbPageInsights = await fetchFbPageInsights(
        pageToken, page.id,
        'page_fans,page_impressions,page_impressions_unique',
        'day', ago30, now
      );

      // ── Instagram Business ──────────────────────────────────────────────
      let igMedia = [], igPostInsights = [], igTimeSeries = {}, igFollowerSeries = {},
          igAudience = {}, igOnlineFollowers = {}, igProfile = {}, igStories = [];

      if (igId) {
        // Media (posts, reels, carruseles)
        igMedia = await fetchIgMedia(pageToken, igId, 50);

        // Per-post insights en paralelo
        const igPIResults = await Promise.allSettled(
          igMedia.map(m => fetchIgPostInsights(pageToken, m.id, m.media_type))
        );
        igPostInsights = igPIResults.map(r => r.status === 'fulfilled' ? r.value : {});

        // Upsert posts IG
        for (let i = 0; i < igMedia.length; i++) {
          const m  = igMedia[i];
          const pi = igPostInsights[i] || {};
          const metrics = {
            likes:          m.like_count     || 0,
            comments:       m.comments_count || 0,
            shares:         0,
            reach:          pi.reach         || 0,
            impressions:    pi.impressions   || 0,
            saved:          pi.saved         || 0,
            video_views:    pi.video_views   || 0,
            avg_watch_time_ms: pi.avg_watch_time_ms || 0,
            total_interactions: pi.total_interactions || 0,
            profile_visits: pi.profile_visits || 0,
            follows:        pi.follows       || 0,
          };
          await upsertBrandPost(env, brand_container_id, {
            brand_container_id,
            network:        'instagram',
            profile_handle: igAccount?.username || '',
            post_id:        m.id,
            permalink:      m.permalink || null,
            content:        m.caption || '',
            hashtags:       extractHashtags(m.caption || ''),
            media_assets:   m.media_url ? [{ type: m.media_type?.toLowerCase(), url: m.media_url, permalink: m.permalink }] : [],
            metrics,
            sentiment:      {},
            is_competitor:  false,
            captured_at:    m.timestamp
          }, m.id);
          summary.ig_posts_synced++;
        }

        // Datos de cuenta en paralelo
        const [tsRes, follTsRes, audRes, onlineRes, profileRes, storiesRes] = await Promise.allSettled([
          fetchIgTimeSeries(pageToken, igId, ago90, now),
          fetchIgFollowerTimeSeries(pageToken, igId, ago90, now),
          fetchIgAudience(pageToken, igId),
          fetchIgOnlineFollowers(pageToken, igId),
          fetchIgProfile(pageToken, igId),
          fetchIgStories(pageToken, igId),
        ]);
        igTimeSeries      = tsRes.status      === 'fulfilled' ? tsRes.value      : {};
        igFollowerSeries  = follTsRes.status  === 'fulfilled' ? follTsRes.value  : {};
        igAudience        = audRes.status     === 'fulfilled' ? audRes.value     : {};
        igOnlineFollowers = onlineRes.status  === 'fulfilled' ? onlineRes.value  : {};
        igProfile         = profileRes.status === 'fulfilled' ? profileRes.value : {};
        igStories         = storiesRes.status === 'fulfilled' ? storiesRes.value : [];
      }

      // ── Build + upsert snapshots ────────────────────────────────────────
      const allPosts = [...fbPosts, ...igMedia]; // para heatmap

      // 30d snapshot
      const snap30 = buildSnapshot({ fbPosts, fbInsights: fbPageInsights, igMedia, igPostInsights, igTimeSeries, igFollowerSeries, igProfile, igStories, period: '30d', pageInfo: page });
      await upsertSnapshot(env, brand_container_id, '30d', { ...snap30, page_id: page.id, page_name: page.name, ig_username: igAccount?.username },
        ago30.toISOString().slice(0, 10), now.toISOString().slice(0, 10));
      summary.snapshots_updated++;

      // 7d snapshot (subconjunto de posts; insights alineados por índice con igMedia)
      const fbPosts7  = fbPosts.filter(p => new Date(p.created_time) >= ago7);
      const igMedia7 = [];
      const igPI7 = [];
      for (let i = 0; i < igMedia.length; i++) {
        if (new Date(igMedia[i].timestamp) >= ago7) {
          igMedia7.push(igMedia[i]);
          igPI7.push(igPostInsights[i] || {});
        }
      }
      const fbPageInsights7 = await fetchFbPageInsights(pageToken, page.id, 'page_fans,page_impressions,page_impressions_unique', 'day', ago7, now);
      const snap7 = buildSnapshot({ fbPosts: fbPosts7, fbInsights: fbPageInsights7, igMedia: igMedia7, igPostInsights: igPI7, igTimeSeries, igFollowerSeries, igProfile, igStories, period: '7d', pageInfo: page });
      await upsertSnapshot(env, brand_container_id, '7d', { ...snap7, page_id: page.id, page_name: page.name },
        ago7.toISOString().slice(0, 10), now.toISOString().slice(0, 10));
      summary.snapshots_updated++;

      // 90d snapshot
      const snap90 = buildSnapshot({ fbPosts, fbInsights: fbPageInsights, igMedia, igPostInsights, igTimeSeries, igFollowerSeries, igProfile, igStories, period: '90d', pageInfo: page });
      await upsertSnapshot(env, brand_container_id, '90d', { ...snap90, page_id: page.id, page_name: page.name },
        ago90.toISOString().slice(0, 10), now.toISOString().slice(0, 10));
      summary.snapshots_updated++;

      // ── Build + upsert heatmap (defensivo: no debe abortar el sync de posts) ──
      const heatmap = buildHeatmap(allPosts, igOnlineFollowers);
      await upsertHeatmap(env, brand_container_id, heatmap, igAudience)
        .catch(e => console.warn('[sync] heatmap upsert:', e?.message));

      summary.pages_synced++;
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, summary })
    };

  } catch (e) {
    console.error('[brand-sync-meta] error:', e?.message);
    if (e?.stack) console.error(e.stack);

    const metaErr = e?.metaError;
    let statusCode = 500;
    if (e?.statusCode >= 400 && e?.statusCode < 600) statusCode = e.statusCode;
    else if (metaErr && (metaErr.code === 190 || metaErr.code === 102 || metaErr.code === 104))
      statusCode = 401;

    const payload = { error: e?.message || 'Sync failed' };
    if (metaErr && (metaErr.code != null || metaErr.type))
      payload.meta = { code: metaErr.code, type: metaErr.type };

    return {
      statusCode,
      headers: corsHeaders(event),
      body: JSON.stringify(payload)
    };
  }
};
