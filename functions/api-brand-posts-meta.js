/**
 * api-brand-posts-meta
 * Publicaciones de Facebook e Instagram para la página seleccionada por el usuario.
 *
 * Prioridad para resolver la página activa:
 *   1. metadata.selected_page_id  (elegida en el picker post-OAuth)
 *   2. metadata.pages[0]          (primera de la lista guardada)
 *   3. /me/accounts en vivo       (fallback si no hay páginas en metadata)
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

// ── Campos de Graph API ───────────────────────────────────────────────────────

const FB_FIELDS =
  'id,message,story,created_time,full_picture,permalink_url,' +
  'likes.summary(true),comments.summary(true),shares,attachments{media_type,title}';
const FB_FIELDS_MIN =
  'id,message,story,created_time,full_picture,permalink_url,attachments{media_type,title}';
const IG_FIELDS =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
const IG_FIELDS_MIN =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

// ── Normalización ─────────────────────────────────────────────────────────────

function resolvePic(pic) {
  if (!pic) return null;
  if (typeof pic === 'string') return pic;
  return pic?.data?.url || null;
}

function mapFbPost(p) {
  return {
    id:           p.id,
    network:      'facebook',
    message:      p.message || p.story || '',
    created_time: p.created_time,
    picture:      p.full_picture || null,
    permalink:    p.permalink_url || null,
    media_type:   p.attachments?.data?.[0]?.media_type || 'text',
    likes:        p.likes?.summary?.total_count || 0,
    comments:     p.comments?.summary?.total_count || 0,
    shares:       p.shares?.count || 0,
    page_id:      p._page_id || null,
    page_name:    p._page_name || null
  };
}

function mapIgMedia(m) {
  return {
    id:           m.id,
    network:      'instagram',
    message:      m.caption || '',
    created_time: m.timestamp,
    picture:      m.media_url || m.thumbnail_url || null,
    permalink:    m.permalink || null,
    media_type:   (m.media_type || 'IMAGE').toLowerCase(),
    likes:        m.like_count || 0,
    comments:     m.comments_count || 0,
    shares:       0
  };
}

function noPageResponse({ event, limit, detail, message, account }) {
  return {
    statusCode: 200,
    headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      page: null, pages: [],
      facebook_posts: [], instagram_posts: [],
      instagram_username: null, instagram_profile_picture_url: null,
      instagram_linked: false,
      fetch_limit: limit,
      meta_info:   message,
      diag_detail: detail,
      diag_account: account || null,
      message
    })
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken)
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id)
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid session' }) };

  const qs                = event.queryStringParameters || {};
  const { brand_container_id } = qs;
  const limit             = Math.min(Math.max(Number(qs.limit) || 50, 1), 100);

  if (!brand_container_id)
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id' }) };

  // ── Verificar acceso al brand container ──────────────────────────────────
  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brand_container_id}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc)
    return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'Brand container not found' }) };

  if (bc.user_id !== user.id) {
    const members = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'organization_members', method: 'GET',
      searchParams: { select: 'id', organization_id: `eq.${bc.organization_id}`, user_id: `eq.${user.id}`, limit: '1' }
    });
    if (!Array.isArray(members) || members.length === 0)
      return { statusCode: 403, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── Obtener integración Meta ──────────────────────────────────────────────
  const integRows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,access_token,metadata',
      brand_container_id: `eq.${brand_container_id}`,
      platform:   'eq.facebook',
      is_active:  'eq.true',
      limit: '1'
    }
  });
  const integ = Array.isArray(integRows) ? integRows[0] : null;
  if (!integ)
    return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'No active Meta integration' }) };

  const userToken  = integ.access_token;
  const appSecret  = process.env.META_APP_SECRET || '';
  const meta       = integ.metadata || {};
  const allPages   = Array.isArray(meta.pages) ? meta.pages : [];
  const selectedId = meta.selected_page_id || null;

  try {
    // ── Resolver la página activa ─────────────────────────────────────────
    let activePage = null;

    if (selectedId) {
      activePage = allPages.find((p) => p.id === selectedId) || null;
    }
    if (!activePage && allPages.length > 0) {
      activePage = allPages[0];
    }

    // Fallback: llamar /me/accounts si no hay páginas en metadata todavía
    if (!activePage) {
      const livePages = await metaGraphGetPaged('/me/accounts', userToken, appSecret, {
        fields: 'id,name,access_token,picture{url},fan_count,instagram_business_account{id,username,profile_picture_url}'
      }, 100).catch(() => []);

      if (livePages.length > 0) {
        activePage = selectedId
          ? (livePages.find((p) => p.id === selectedId) || livePages[0])
          : livePages[0];
      }
    }

    // Sin página activa: diagnóstico
    if (!activePage) {
      const meInfo = await metaGraphGet('/me', userToken, appSecret, { fields: 'id,name' }).catch(() => null);
      if (!meInfo) {
        return noPageResponse({ event, limit, detail: 'invalid_token',
          message: 'El token de Meta ha expirado o es inválido. Reconecta Meta en Marcas.' });
      }
      return noPageResponse({ event, limit, detail: 'no_pages_selected',
        account: { id: meInfo.id, name: meInfo.name },
        message: `La cuenta "${meInfo.name}" no tiene páginas disponibles. Reconecta Meta en Marcas y selecciona la página que quieres usar.`
      });
    }

    // ── Page token ───────────────────────────────────────────────────────
    let pageToken = activePage.access_token || null;
    if (!pageToken) {
      const d = await metaGraphGet(`/${activePage.id}`, userToken, appSecret, { fields: 'access_token' }).catch(() => ({}));
      pageToken = d.access_token || null;
    }
    if (!pageToken) {
      return noPageResponse({ event, limit, detail: 'no_page_token',
        message: 'No se pudo obtener el token de página. Reconecta Meta en Marcas.' });
    }

    // ── Posts de Facebook ────────────────────────────────────────────────
    let fbRaw = await metaGraphGetPaged(
      `/${activePage.id}/posts`, pageToken, appSecret, { fields: FB_FIELDS }, limit
    ).catch(() => []);

    if (fbRaw.length === 0) {
      fbRaw = await metaGraphGetPaged(
        `/${activePage.id}/published_posts`, pageToken, appSecret, { fields: FB_FIELDS }, limit
      ).catch(() => []);
    }
    if (fbRaw.length === 0) {
      fbRaw = await metaGraphGetPaged(
        `/${activePage.id}/posts`, pageToken, appSecret, { fields: FB_FIELDS_MIN }, limit
      ).catch(() => []);
    }
    fbRaw.forEach((p) => { p._page_id = activePage.id; p._page_name = activePage.name; });

    // ── Posts de Instagram ───────────────────────────────────────────────
    const igId      = activePage.instagram_business_account?.id || null;
    let igRaw       = [];
    let igUsername  = activePage.instagram_business_account?.username || null;
    let igProfilePic = activePage.instagram_business_account?.profile_picture_url || null;

    if (igId) {
      igRaw = await metaGraphGetPaged(
        `/${igId}/media`, pageToken, appSecret, { fields: IG_FIELDS }, limit
      ).catch(() => []);

      if (igRaw.length === 0) {
        igRaw = await metaGraphGetPaged(
          `/${igId}/media`, pageToken, appSecret, { fields: IG_FIELDS_MIN }, limit
        ).catch(() => []);
      }

      if (!igUsername || !igProfilePic) {
        const igInfo = await metaGraphGet(`/${igId}`, pageToken, appSecret, {
          fields: 'username,profile_picture_url'
        }).catch(() => ({}));
        igUsername   = igInfo.username   || igUsername;
        igProfilePic = igInfo.profile_picture_url || igProfilePic;
      }
    }

    // ── Respuesta ────────────────────────────────────────────────────────
    const facebook_posts = fbRaw.map(mapFbPost)
      .sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
      .slice(0, limit);

    const instagram_posts = igRaw.map(mapIgMedia)
      .sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
      .slice(0, limit);

    const noPosts = facebook_posts.length === 0 && instagram_posts.length === 0;

    return {
      statusCode: 200,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        page: {
          id:      activePage.id,
          name:    activePage.name,
          picture: resolvePic(activePage.picture),
          fans:    activePage.fan_count || activePage.fans || 0
        },
        pages: [{
          id:      activePage.id,
          name:    activePage.name,
          picture: resolvePic(activePage.picture),
          fans:    activePage.fan_count || activePage.fans || 0,
          instagram_business_account_id: igId
        }],
        facebook_posts,
        instagram_posts,
        instagram_username:            igUsername,
        instagram_profile_picture_url: igProfilePic,
        instagram_linked:              !!igId,
        fetch_limit:                   limit,
        meta_info: `Se muestran las publicaciones más recientes de "${activePage.name}" (hasta ${limit} por red).`,
        ...(noPosts ? {
          hint: 'La página está conectada pero no se encontraron publicaciones. Verifica que la página tenga posts públicos y que los permisos estén correctos.'
        } : {})
      })
    };

  } catch (e) {
    console.error('[brand-posts-meta] error:', e?.message);
    return {
      statusCode: 500,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: e?.message || 'Error fetching posts' })
    };
  }
};
