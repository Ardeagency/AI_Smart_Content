/**
 * api-brand-posts-meta
 * Devuelve las publicaciones recientes de Facebook e Instagram
 * usando la integración Meta del brand container.
 *
 * GET /api/brand/posts-meta?brand_container_id=...&limit=12
 * Auth: Bearer <supabase-session-token>
 *
 * Respuesta:
 * {
 *   ok: true,
 *   page: { id, name, picture },
 *   facebook_posts: [...],
 *   instagram_posts: [...],
 *   instagram_username: string | null
 * }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');

const GRAPH = 'https://graph.facebook.com/v22.0';

async function metaGet(path, token, params = {}) {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString());
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json;
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
  const limit = Math.min(Number(qs.limit) || 12, 30);

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

  // Leer integración Meta activa
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

  try {
    // ── 1. Obtener páginas de Facebook gestionadas ──────────────────────────
    const pagesData = await metaGet('/me/accounts', userToken, {
      fields: 'id,name,picture{url},fan_count,instagram_business_account'
    });
    const pages = pagesData.data || [];

    if (pages.length === 0) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          page: null,
          facebook_posts: [],
          instagram_posts: [],
          instagram_username: null,
          message: 'No se encontraron páginas de Facebook en esta cuenta.'
        })
      };
    }

    const page = pages[0];

    // Obtener page access token
    const pageTokenData = await metaGet(`/${page.id}`, userToken, { fields: 'access_token' }).catch(() => ({}));
    const pageToken = pageTokenData.access_token || userToken;

    // ── 2. Posts de Facebook ────────────────────────────────────────────────
    const fbPostsData = await metaGet(`/${page.id}/posts`, pageToken, {
      fields: 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares,attachments{media_type,title}',
      limit
    }).catch(() => ({ data: [] }));

    const facebook_posts = (fbPostsData.data || []).map(p => ({
      id:           p.id,
      network:      'facebook',
      message:      p.message || p.story || '',
      created_time: p.created_time,
      picture:      p.full_picture || null,
      permalink:    p.permalink_url || null,
      media_type:   p.attachments?.data?.[0]?.media_type || 'text',
      likes:        p.likes?.summary?.total_count    || 0,
      comments:     p.comments?.summary?.total_count || 0,
      shares:       p.shares?.count                  || 0
    }));

    // ── 3. Posts de Instagram (si hay cuenta IG vinculada) ──────────────────
    let instagram_posts    = [];
    let instagram_username = null;

    const igAccountId = page.instagram_business_account?.id;

    if (igAccountId) {
      // Info básica de la cuenta IG
      const igInfo = await metaGet(`/${igAccountId}`, pageToken, {
        fields: 'id,username,profile_picture_url,followers_count'
      }).catch(() => ({}));
      instagram_username = igInfo.username || null;

      // Media de Instagram
      const igMediaData = await metaGet(`/${igAccountId}/media`, pageToken, {
        fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
        limit
      }).catch(() => ({ data: [] }));

      instagram_posts = (igMediaData.data || []).map(m => ({
        id:           m.id,
        network:      'instagram',
        message:      m.caption || '',
        created_time: m.timestamp,
        picture:      m.media_url || m.thumbnail_url || null,
        permalink:    m.permalink || null,
        media_type:   (m.media_type || 'IMAGE').toLowerCase(),
        likes:        m.like_count    || 0,
        comments:     m.comments_count || 0,
        shares:       0
      }));
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        page: {
          id:       page.id,
          name:     page.name,
          picture:  page.picture?.data?.url || null,
          fans:     page.fan_count || 0
        },
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
