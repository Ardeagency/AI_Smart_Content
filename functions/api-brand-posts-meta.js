/**
 * api-brand-posts-meta
 * Publicaciones de Facebook e Instagram vía Graph API (todas las páginas
 * gestionadas + paginación de cursores para no quedarse en el primer lote).
 *
 * GET /api/brand/posts-meta?brand_container_id=...&limit=50
 * Auth: Bearer <supabase-session-token>
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');
const { metaGraphGet, metaGraphGetPaged } = require('./lib/meta-graph');

const FB_FIELDS =
  'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares,attachments{media_type,title}';
const IG_FIELDS =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';

function mapFbPost(p) {
  return {
    id: p.id,
    network: 'facebook',
    message: p.message || p.story || '',
    created_time: p.created_time,
    picture: p.full_picture || null,
    permalink: p.permalink_url || null,
    media_type: p.attachments?.data?.[0]?.media_type || 'text',
    likes: p.likes?.summary?.total_count || 0,
    comments: p.comments?.summary?.total_count || 0,
    shares: p.shares?.count || 0,
    page_id: p._page_id || null,
    page_name: p._page_name || null
  };
}

function mapIgMedia(m) {
  return {
    id: m.id,
    network: 'instagram',
    message: m.caption || '',
    created_time: m.timestamp,
    picture: m.media_url || m.thumbnail_url || null,
    permalink: m.permalink || null,
    media_type: (m.media_type || 'IMAGE').toLowerCase(),
    likes: m.like_count || 0,
    comments: m.comments_count || 0,
    shares: 0
  };
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
  const { brand_container_id } = qs;
  const limit = Math.min(Math.max(Number(qs.limit) || 50, 1), 100);

  if (!brand_container_id) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }

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

  const integRows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,access_token,token_expires_at',
      brand_container_id: `eq.${brand_container_id}`,
      platform: 'eq.facebook',
      is_active: 'eq.true',
      limit: '1'
    }
  });
  const integ = Array.isArray(integRows) ? integRows[0] : null;
  if (!integ) {
    return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'No active Meta integration' }) };
  }

  const userToken = integ.access_token;
  const appSecret = process.env.META_APP_SECRET || '';

  try {
    const pagesList = await metaGraphGetPaged(
      '/me/accounts',
      userToken,
      appSecret,
      {
        fields: 'id,name,picture{url},fan_count,instagram_business_account{id}'
      },
      50
    );

    if (pagesList.length === 0) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          page: null,
          pages: [],
          facebook_posts: [],
          instagram_posts: [],
          instagram_username: null,
          message: 'No se encontraron páginas de Facebook en esta cuenta.'
        })
      };
    }

    const pagesMeta = pagesList.map((pg) => ({
      id: pg.id,
      name: pg.name,
      picture: pg.picture?.data?.url || null,
      fans: pg.fan_count || 0,
      instagram_business_account_id: pg.instagram_business_account?.id || null
    }));

    const primary = pagesList[0];
    const facebookRaw = [];
    const instagramRaw = [];

    const pageTokens = new Map();
    async function getPageToken(pageId) {
      if (pageTokens.has(pageId)) return pageTokens.get(pageId);
      const d = await metaGraphGet(`/${pageId}`, userToken, appSecret, { fields: 'access_token' }).catch(() => ({}));
      const t = d.access_token || userToken;
      pageTokens.set(pageId, t);
      return t;
    }

    for (const pg of pagesList) {
      const pageToken = await getPageToken(pg.id);
      const needFb = Math.max(0, limit - facebookRaw.length);
      if (needFb > 0) {
        const batch = await metaGraphGetPaged(
          `/${pg.id}/posts`,
          pageToken,
          appSecret,
          { fields: FB_FIELDS },
          needFb
        );
        batch.forEach((p) => {
          p._page_id = pg.id;
          p._page_name = pg.name;
        });
        facebookRaw.push(...batch);
      }
    }

    const igPairs = [];
    const seenIg = new Set();
    for (const pg of pagesList) {
      const igId = pg.instagram_business_account?.id;
      if (igId && !seenIg.has(igId)) {
        seenIg.add(igId);
        igPairs.push({ igId, pageId: pg.id });
      }
    }
    const perIgLimit = Math.ceil(limit / Math.max(1, igPairs.length));
    for (const { igId, pageId } of igPairs) {
      const pageToken = await getPageToken(pageId);
      const media = await metaGraphGetPaged(`/${igId}/media`, pageToken, appSecret, { fields: IG_FIELDS }, perIgLimit);
      instagramRaw.push(...media);
    }

    const facebook_posts = facebookRaw
      .map(mapFbPost)
      .sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
      .slice(0, limit);

    let instagram_username = null;
    const firstIg = pagesList.find((p) => p.instagram_business_account?.id);
    if (firstIg?.instagram_business_account?.id) {
      const igInfo = await metaGraphGet(
        `/${firstIg.instagram_business_account.id}`,
        (await metaGraphGet(`/${firstIg.id}`, userToken, appSecret, { fields: 'access_token' }).catch(() => ({}))).access_token ||
          userToken,
        appSecret,
        { fields: 'username' }
      ).catch(() => ({}));
      instagram_username = igInfo.username || null;
    }

    const instagram_posts = instagramRaw
      .map(mapIgMedia)
      .sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
      .slice(0, limit);

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        page: {
          id: primary.id,
          name: primary.name,
          picture: primary.picture?.data?.url || null,
          fans: primary.fan_count || 0
        },
        pages: pagesMeta,
        facebook_posts,
        instagram_posts,
        instagram_username
      })
    };
  } catch (e) {
    console.error('[brand-posts-meta] error:', e?.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: e?.message || 'Error fetching posts' })
    };
  }
};
