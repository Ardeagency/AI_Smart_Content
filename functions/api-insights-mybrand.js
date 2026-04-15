/**
 * api-insights-mybrand
 * Devuelve todas las dimensiones de "My Brands" leyendo exclusivamente de la DB.
 * NO llama a OpenAI. NO llama a Meta API.
 * Si los datos están desactualizados, marca stale=true para que el frontend
 * dispare el sync en background.
 *
 * GET /api/insights/mybrand?brand_container_id=...&period=30d
 * Auth: Bearer <supabase-session-token>
 *
 * Respuesta:
 * {
 *   ok: true,
 *   stale: bool,
 *   brand: { nombre_marca, logo_url },
 *   meta_integration: { connected, account_name, picture, token_expires_at },
 *   dimensions: {
 *     A_activity:   { snapshot, posts_sample, heatmap, time_series },
 *     B_narrative:  { pillars_active, pillars_orphan, top_tones, fatigue_posts },
 *     C_audience:   { gender_age, top_countries, top_cities,          ← NUEVO
 *                     online_followers_by_hour },
 *     D_stories:    { count, total_reach, avg_exits, samples },        ← NUEVO
 *     E_video:      { count, total_views, avg_watch_time_ms },         ← NUEVO
 *     F_retail:     { prices_count, alerts },
 *     G_sentiment:  { emotion_distribution, top_posts },
 *     H_diagnostic: { vulnerabilities, coherence_avg, clarity_avg }
 *   }
 * }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');

const STALE_MINUTES = 60; // Datos se consideran frescos por 1 hora

function isStale(computedAt) {
  if (!computedAt) return true;
  return (Date.now() - new Date(computedAt).getTime()) > STALE_MINUTES * 60 * 1000;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'GET') {
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

  const qs = event.queryStringParameters || {};
  const brand_container_id = qs.brand_container_id;
  const period = qs.period || '30d';

  if (!brand_container_id) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }

  // Verificar acceso
  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id,nombre_marca,organizations(logo_url)', id: `eq.${brand_container_id}`, limit: '1' }
  });
  const bcRow = Array.isArray(containers) ? containers[0] : null;
  const bc = bcRow
    ? {
        ...bcRow,
        logo_url: bcRow.organizations?.logo_url ?? null,
      }
    : null;
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

  // Cargar todo en paralelo desde la DB (sin llamar a ninguna API externa)
  const [
    metaIntegRows,
    snapshotRows,
    heatmapRows,
    postsRows,
    analysisRows,
    pillarsRows,
    vulnerabilityRows,
    retailRows
  ] = await Promise.all([
    // Integración Meta
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'GET',
      searchParams: {
        select: 'id,platform,external_account_name,metadata,token_expires_at,is_active',
        brand_container_id: `eq.${brand_container_id}`,
        platform: 'eq.facebook',
        is_active: 'eq.true',
        limit: '1'
      }
    }),
    // Snapshot del período solicitado
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_analytics_snapshots', method: 'GET',
      searchParams: {
        select: '*',
        brand_container_id: `eq.${brand_container_id}`,
        platform: 'eq.facebook',
        period_type: `eq.${period}`,
        order: 'computed_at.desc',
        limit: '1'
      }
    }),
    // Heatmap
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_audience_heatmap', method: 'GET',
      searchParams: {
        select: '*',
        brand_container_id: `eq.${brand_container_id}`,
        platform: 'eq.facebook',
        limit: '1'
      }
    }),
    // Posts recientes (muestra para Dimensión D)
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_posts', method: 'GET',
      searchParams: {
        select: 'id,content,metrics,captured_at,media_assets',
        brand_container_id: `eq.${brand_container_id}`,
        is_competitor: 'eq.false',
        order: 'captured_at.desc',
        limit: '20'
      }
    }),
    // Análisis de contenido
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_content_analysis', method: 'GET',
      searchParams: {
        select: 'brand_post_id,tone_detected,tone_coherence_score,dominant_emotion,narrative_pillar,clarity_score,fatigue_risk,why_it_worked,analyzed_at',
        brand_container_id: `eq.${brand_container_id}`,
        order: 'analyzed_at.desc',
        limit: '50'
      }
    }),
    // Narrative pillars
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_narrative_pillars', method: 'GET',
      searchParams: {
        select: '*',
        brand_container_id: `eq.${brand_container_id}`,
        order: 'post_count.desc'
      }
    }),
    // Vulnerabilidades (SWOT)
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_vulnerabilities', method: 'GET',
      searchParams: {
        select: 'id,title,description,severity,status,created_at',
        brand_container_id: `eq.${brand_container_id}`,
        status: 'neq.resolved',
        order: 'created_at.desc',
        limit: '10'
      }
    }),
    // Retail prices (MAP Monitor)
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'retail_prices', method: 'GET',
      searchParams: {
        select: 'id,retailer,product_name,price,currency,stock_status,promo_label,captured_at',
        brand_container_id: `eq.${brand_container_id}`,
        order: 'captured_at.desc',
        limit: '20'
      }
    })
  ]);

  const metaInteg   = Array.isArray(metaIntegRows) ? metaIntegRows[0] : null;
  const snapshot    = Array.isArray(snapshotRows)  ? snapshotRows[0]  : null;
  const heatmap     = Array.isArray(heatmapRows)   ? heatmapRows[0]   : null;
  const posts       = Array.isArray(postsRows)      ? postsRows        : [];
  const analyses    = Array.isArray(analysisRows)   ? analysisRows     : [];
  const pillars     = Array.isArray(pillarsRows)    ? pillarsRows      : [];
  const vulns       = Array.isArray(vulnerabilityRows) ? vulnerabilityRows : [];
  const retail      = Array.isArray(retailRows)     ? retailRows       : [];

  const stale    = isStale(snapshot?.computed_at);
  const snapM    = snapshot?.metrics || {};
  const postsById = {};
  posts.forEach(p => { postsById[p.id] = p; });

  // ── Dimensión A: Actividad ────────────────────────────────────────────────
  // time_series del snapshot: { "2026-03-01": { reach, impressions, profile_views, follower_count } }
  const rawTimeSeries = snapM.time_series || {};
  const sortedDates   = Object.keys(rawTimeSeries).sort();
  const timeSeries = {
    dates:           sortedDates,
    reach:           sortedDates.map(d => rawTimeSeries[d]?.reach          || 0),
    impressions:     sortedDates.map(d => rawTimeSeries[d]?.impressions     || 0),
    profile_views:   sortedDates.map(d => rawTimeSeries[d]?.profile_views  || 0),
    website_clicks:  sortedDates.map(d => rawTimeSeries[d]?.website_clicks || 0),
    follower_count:  sortedDates.map(d => rawTimeSeries[d]?.follower_count || null),
  };

  const A_activity = {
    snapshot:     snapM || null,
    computed_at:  snapshot?.computed_at || null,
    time_series:  timeSeries,
    heatmap: heatmap ? {
      hour_engagement:          heatmap.hour_engagement,
      day_engagement:           heatmap.day_engagement,
      best_hour:                heatmap.best_hour,
      best_day:                 heatmap.best_day,
      online_followers_by_hour: heatmap.online_followers_by_hour || {}
    } : null,
    posts_sample: posts.slice(0, 5).map(p => ({
      id:              p.id,
      content_preview: (p.content || '').slice(0, 120),
      metrics:         p.metrics,
      captured_at:     p.captured_at,
      has_media:       !!(p.media_assets?.length)
    }))
  };

  // ── Dimensión B: Narrativa y Tono ─────────────────────────────────────────
  const toneCount = {}, emotionCount = {};
  let coherenceSum = 0, coherenceN = 0;
  const fatiguePosts = [];

  analyses.forEach(a => {
    if (a.tone_detected)    toneCount[a.tone_detected]       = (toneCount[a.tone_detected] || 0) + 1;
    if (a.dominant_emotion) emotionCount[a.dominant_emotion] = (emotionCount[a.dominant_emotion] || 0) + 1;
    if (a.tone_coherence_score != null) { coherenceSum += a.tone_coherence_score; coherenceN++; }
    if (a.fatigue_risk) {
      const post = postsById[a.brand_post_id];
      if (post) fatiguePosts.push({ content_preview: (post.content || '').slice(0, 100), captured_at: post.captured_at });
    }
  });

  const topTones = Object.entries(toneCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tone, count]) => ({ tone, count, pct: analyses.length > 0 ? Math.round(count / analyses.length * 100) : 0 }));

  const B_narrative = {
    pillars_active:  pillars.filter(p => p.pillar_type === 'active'),
    pillars_orphan:  pillars.filter(p => p.pillar_type === 'orphan'),
    top_tones:       topTones,
    emotion_distribution: Object.entries(emotionCount).sort((a, b) => b[1] - a[1]).map(([emotion, count]) => ({ emotion, count })),
    fatigue_posts:   fatiguePosts.slice(0, 3),
    coherence_avg:   coherenceN > 0 ? Math.round(coherenceSum / coherenceN) : null,
    analyzed_posts:  analyses.length
  };

  // ── Dimensión C: Audiencia (NUEVA) ────────────────────────────────────────
  const audienceDemographics = heatmap?.audience_demographics || {};
  const genderAge   = audienceDemographics.audience_gender_age  || {};
  const countryData = audienceDemographics.audience_country     || {};
  const cityData    = audienceDemographics.audience_city        || {};

  // Top 5 países
  const topCountries = Object.entries(countryData)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([country, count]) => ({ country, count }));

  // Top 5 ciudades
  const topCities = Object.entries(cityData)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([city, count]) => ({ city, count }));

  // Gender/Age breakdown
  const genderGroups = { M: {}, F: {}, U: {} };
  Object.entries(genderAge).forEach(([key, count]) => {
    const [gender, age] = key.split('.');
    if (!genderGroups[gender]) genderGroups[gender] = {};
    genderGroups[gender][age] = (genderGroups[gender][age] || 0) + count;
  });

  const C_audience = {
    gender_age:               genderAge,
    gender_groups:            genderGroups,
    top_countries:            topCountries,
    top_cities:               topCities,
    online_followers_by_hour: heatmap?.online_followers_by_hour || {},
    has_data:                 Object.keys(genderAge).length > 0 || topCountries.length > 0
  };

  // ── Dimensión D: Stories (NUEVA) ─────────────────────────────────────────
  const storiesData = snapM.stories || null;
  const D_stories = storiesData ? {
    count:        storiesData.count        || 0,
    total_reach:  storiesData.total_reach  || 0,
    total_impr:   storiesData.total_impr   || 0,
    total_replies: storiesData.total_replies || 0,
    avg_exits:    storiesData.avg_exits    || 0,
    avg_taps_fwd: storiesData.avg_taps_fwd || 0,
    exit_rate:    storiesData.total_reach > 0
      ? Math.round((storiesData.avg_exits / storiesData.total_reach) * 100)
      : 0,
    samples:      (storiesData.samples || []).slice(0, 5)
  } : null;

  // ── Dimensión E: Video (NUEVA) ────────────────────────────────────────────
  const videoData = snapM.video || null;
  const E_video = videoData ? {
    count:             videoData.count            || 0,
    total_views:       videoData.total_views      || 0,
    avg_watch_time_ms: videoData.avg_watch_time_ms || 0,
    avg_watch_time_s:  Math.round((videoData.avg_watch_time_ms || 0) / 1000)
  } : null;

  // ── Dimensión F: Retail (MAP Monitor) ────────────────────────────────────
  const prices   = retail.map(r => ({...r}));
  const maxPrice = Math.max(...prices.map(p => p.price || 0), 0);
  const minPrice = prices.length > 0 ? Math.min(...prices.filter(p => p.price).map(p => p.price)) : 0;

  const F_retail = {
    prices_count:  retail.length,
    min_price:     minPrice,
    max_price:     maxPrice,
    price_spread:  maxPrice - minPrice,
    alerts:        retail.filter(r => r.stock_status === 'out_of_stock').map(r => ({ retailer: r.retailer, product: r.product_name, issue: 'Sin stock' })),
    samples:       retail.slice(0, 8)
  };

  // ── Dimensión G: Sentimiento ──────────────────────────────────────────────
  const analysisMap = {};
  analyses.forEach(a => { analysisMap[a.brand_post_id] = a; });

  const topPosts = posts
    .map(p => {
      const eng = (p.metrics?.likes || 0) + (p.metrics?.comments || 0) + (p.metrics?.shares || 0)
                + (p.metrics?.saved || 0);
      const a = analysisMap[p.id];
      return {
        id:               p.id,
        content_preview:  (p.content || '').slice(0, 150),
        metrics:          p.metrics,
        engagement_total: eng,
        captured_at:      p.captured_at,
        media_assets:     p.media_assets,
        analysis: a ? { tone: a.tone_detected, emotion: a.dominant_emotion, clarity: a.clarity_score, why_it_worked: a.why_it_worked } : null
      };
    })
    .sort((a, b) => b.engagement_total - a.engagement_total)
    .slice(0, 5);

  const G_sentiment = {
    emotion_distribution: B_narrative.emotion_distribution,
    top_posts:  topPosts,
    clarity_avg: analyses.length > 0 ? Math.round(analyses.reduce((s, a) => s + (a.clarity_score || 0), 0) / analyses.length) : null
  };

  // ── Dimensión H: Diagnóstico (SWOT) ───────────────────────────────────────
  const H_diagnostic = {
    vulnerabilities:      vulns,
    coherence_avg:        B_narrative.coherence_avg,
    clarity_avg:          G_sentiment.clarity_avg,
    fatigue_count:        fatiguePosts.length,
    orphan_pillars_count: B_narrative.pillars_orphan.length
  };

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      stale,
      brand: { nombre_marca: bc.nombre_marca, logo_url: bc.logo_url },
      meta_integration: metaInteg ? {
        connected:        true,
        account_name:     metaInteg.external_account_name,
        ig_username:      snapM.ig_username || null,
        followers_ig:     snapM.followers_ig || 0,
        picture:          metaInteg.metadata?.picture || null,
        token_expires_at: metaInteg.token_expires_at
      } : { connected: false },
      period,
      dimensions: {
        A_activity,
        B_narrative,
        C_audience,
        D_stories,
        E_video,
        F_retail,
        G_sentiment,
        H_diagnostic
      }
    })
  };
};
