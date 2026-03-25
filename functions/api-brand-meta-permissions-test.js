/**
 * api-brand-meta-permissions-test
 * Sondas reales contra Graph API para validar permisos Meta (test de integración en Insight).
 *
 * GET /api/brand/meta-permissions-test?brand_container_id=...
 * Auth: Bearer <supabase-session-token>
 *
 * Responde matriz por permiso: concedido en OAuth vs lectura API exitosa + muestra mínima de datos.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');
const { metaGraphGet, metaGraphGetPaged } = require('./lib/meta-graph');

const IG_MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

function resolvePic(pic) {
  if (!pic) return null;
  if (typeof pic === 'string') return pic;
  return pic?.data?.url || null;
}

function grantedMap(permJson) {
  const out = {};
  const rows = permJson?.data || [];
  for (const row of rows) {
    if (row.permission && row.status === 'granted') out[row.permission] = true;
  }
  return out;
}

async function tryMeta(fn) {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      code: e?.metaError?.code,
      type: e?.metaError?.type
    };
  }
}

function buildMatrixRow(key, label, group, description, granted, api, detail) {
  return {
    key,
    label,
    group,
    description,
    granted: !!granted,
    api_ok: api === true,
    detail: detail != null ? detail : null
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
  if (!accessToken) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid session' }) };
  }

  const qs = event.queryStringParameters || {};
  const { brand_container_id } = qs;
  if (!brand_container_id) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  }

  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brand_container_id}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) {
    return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Brand container not found' }) };
  }

  if (bc.user_id !== user.id) {
    const members = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'organization_members', method: 'GET',
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

  const integRows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,access_token,metadata',
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
  const meta = integ.metadata || {};
  const allPages = Array.isArray(meta.pages) ? meta.pages : [];
  const selectedId = meta.selected_page_id || null;

  let activePage = null;
  if (selectedId) activePage = allPages.find((p) => p.id === selectedId) || null;
  if (!activePage && allPages.length > 0) activePage = allPages[0];

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

  if (!activePage) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        error: 'no_active_page',
        message: 'No hay página de Facebook resuelta. Reconecta Meta en Marcas y selecciona una página.',
        granted_permissions: [],
        permission_matrix: [],
        raw_granted_permission_names: []
      })
    };
  }

  let pageToken = activePage.access_token || null;
  if (!pageToken) {
    const d = await metaGraphGet(`/${activePage.id}`, userToken, appSecret, { fields: 'access_token' }).catch(() => ({}));
    pageToken = d.access_token || null;
  }
  if (!pageToken) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        error: 'no_page_token',
        message: 'No se pudo obtener el token de página.',
        granted_permissions: [],
        permission_matrix: [],
        raw_granted_permission_names: []
      })
    };
  }

  const pageId = activePage.id;
  const igId = activePage.instagram_business_account?.id || null;

  const permJson = await metaGraphGet('/me/permissions', userToken, appSecret).catch(() => ({ data: [] }));
  const g = grantedMap(permJson);
  const rawNames = Object.keys(g);

  let firstIgMedia = null;
  if (igId) {
    const igList = await metaGraphGetPaged(
      `/${igId}/media`, pageToken, appSecret, { fields: IG_MEDIA_FIELDS }, 1
    ).catch(() => []);
    firstIgMedia = igList[0] || null;
  }

  const matrix = [];

  matrix.push(buildMatrixRow(
    'pages_show_list',
    'pages_show_list',
    'audience',
    'Lista de páginas e ID de página para vincular métricas.',
    g.pages_show_list,
    true,
    { page_id: pageId, page_name: activePage.name }
  ));

  const igBasicOk = !!(firstIgMedia && (firstIgMedia.media_url || firstIgMedia.thumbnail_url || firstIgMedia.caption != null));
  matrix.push(buildMatrixRow(
    'instagram_basic',
    'instagram_basic',
    'insight',
    'URL de imagen/video y caption del contenido IG.',
    g.instagram_basic,
    igId ? igBasicOk : false,
    igId
      ? (firstIgMedia
        ? {
          media_id: firstIgMedia.id,
          caption_preview: (firstIgMedia.caption || '').slice(0, 120),
          has_media: !!(firstIgMedia.media_url || firstIgMedia.thumbnail_url)
        }
        : { note: 'Sin publicaciones IG en el lote (media vacío).' })
      : { note: 'Sin cuenta Instagram Business vinculada a la página.' }
  ));

  let igInsightsDetail = null;
  let igInsightsApi = false;
  if (firstIgMedia?.id) {
    let ins = await tryMeta(() => metaGraphGet(`/${firstIgMedia.id}/insights`, pageToken, appSecret, {
      metric: 'impressions,reach,engagement'
    }));
    if (!ins.ok) {
      ins = await tryMeta(() => metaGraphGet(`/${firstIgMedia.id}/insights`, pageToken, appSecret, {
        metric: 'impressions,reach'
      }));
    }
    igInsightsApi = ins.ok;
    igInsightsDetail = ins.ok
      ? { metrics: (ins.data?.data || []).map((x) => ({ name: x.name, values: x.values })) }
      : { error: ins.error, code: ins.code };
  } else {
    igInsightsDetail = { note: igId ? 'Sin media para medir insights.' : 'IG no vinculado.' };
  }
  matrix.push(buildMatrixRow(
    'instagram_manage_insights',
    'instagram_manage_insights',
    'insight',
    'Alcance, impresiones, engagement por post/Reel.',
    g.instagram_manage_insights,
    igInsightsApi,
    igInsightsDetail
  ));

  let pageEngDetail = null;
  let pageEngOk = false;
  const pe = await tryMeta(() => metaGraphGet(`/${pageId}/insights`, pageToken, appSecret, {
    metric: 'page_post_engagements',
    period: 'day'
  }));
  pageEngOk = pe.ok;
  pageEngDetail = pe.ok
    ? { sample: (pe.data?.data || []).slice(0, 3) }
    : { error: pe.error, code: pe.code };
  if (!pageEngOk) {
    const pe2 = await tryMeta(() => metaGraphGet(`/${pageId}/insights`, pageToken, appSecret, {
      metric: 'page_impressions',
      period: 'day'
    }));
    if (pe2.ok) {
      pageEngOk = true;
      pageEngDetail = { fallback_metric: 'page_impressions', sample: (pe2.data?.data || []).slice(0, 3) };
    }
  }
  matrix.push(buildMatrixRow(
    'pages_read_engagement',
    'pages_read_engagement',
    'insight',
    'Interacción orgánica con posts de la página (Facebook).',
    g.pages_read_engagement,
    pageEngOk,
    pageEngDetail
  ));

  let commentsDetail = null;
  let commentsOk = false;
  if (firstIgMedia?.id) {
    const cm = await tryMeta(() => metaGraphGet(`/${firstIgMedia.id}/comments`, pageToken, appSecret, {
      fields: 'id,text,username,timestamp',
      limit: '3'
    }));
    commentsOk = cm.ok;
    commentsDetail = cm.ok
      ? { count: (cm.data?.data || []).length, sample: (cm.data?.data || []).map((c) => ({
        text_preview: (c.text || '').slice(0, 80)
      })) }
      : { error: cm.error, code: cm.code };
  } else {
    commentsDetail = { note: 'Sin media IG para leer comentarios.' };
  }
  matrix.push(buildMatrixRow(
    'instagram_manage_comments',
    'instagram_manage_comments',
    'audience',
    'Texto de comentarios en publicaciones IG.',
    g.instagram_manage_comments,
    commentsOk,
    commentsDetail
  ));

  const adAccounts = await tryMeta(() => metaGraphGet('/me/adaccounts', userToken, appSecret, {
    fields: 'name,account_id,currency,account_status',
    limit: '5'
  }));
  const accountsList = adAccounts.ok ? (adAccounts.data?.data || []) : [];
  const firstAct = accountsList[0];
  const actId = firstAct
    ? (firstAct.id || (firstAct.account_id != null ? `act_${firstAct.account_id}` : null))
    : null;

  let adsReadDetail = null;
  let adsReadOk = false;
  if (!adAccounts.ok) {
    adsReadDetail = { error: adAccounts.error, code: adAccounts.code };
  } else if (accountsList.length === 0) {
    adsReadOk = true;
    adsReadDetail = {
      note: 'Permiso de listado OK; no hay cuentas publicitarias asignadas a este usuario.'
    };
  } else if (actId) {
    const ai = await tryMeta(() => metaGraphGet(`/${actId}/insights`, userToken, appSecret, {
      fields: 'impressions,reach,clicks,spend,cpc,ctr',
      date_preset: 'last_7d',
      level: 'account'
    }));
    adsReadOk = ai.ok;
    adsReadDetail = ai.ok
      ? { ad_account_id: actId, account_name: firstAct.name, row: ai.data?.data?.[0] || null }
      : { ad_account_id: actId, error: ai.error, code: ai.code };
  } else {
    adsReadDetail = { note: 'Cuentas listadas pero sin id válido.' };
  }
  matrix.push(buildMatrixRow(
    'ads_read',
    'ads_read',
    'ads',
    'Gasto, CPC, CTR, conversiones a nivel cuenta.',
    g.ads_read,
    adsReadOk,
    adsReadDetail
  ));

  const biz = await tryMeta(() => metaGraphGet('/me/businesses', userToken, appSecret, {
    fields: 'name,id',
    limit: '5'
  }));
  const bizList = biz.ok ? (biz.data?.data || []) : [];
  matrix.push(buildMatrixRow(
    'business_management',
    'business_management',
    'ads',
    'Acceso a Business Manager / activos del negocio.',
    g.business_management,
    biz.ok,
    biz.ok
      ? { businesses: bizList.map((b) => ({ id: b.id, name: b.name })) }
      : { error: biz.error, code: biz.code }
  ));

  let adsMgmtDetail = null;
  let adsMgmtOk = false;
  if (actId) {
    const camps = await tryMeta(() => metaGraphGet(`/${actId}/campaigns`, userToken, appSecret, {
      fields: 'name,status,objective',
      limit: '5'
    }));
    adsMgmtOk = camps.ok;
    adsMgmtDetail = camps.ok
      ? { campaigns: (camps.data?.data || []).map((c) => ({ name: c.name, status: c.status })) }
      : { error: camps.error, code: camps.code };
  } else {
    adsMgmtDetail = { note: 'Sin ad account para listar campañas.' };
  }
  matrix.push(buildMatrixRow(
    'ads_management',
    'ads_management',
    'ads',
    'Nombres y estados de campañas (Activa/Pausada).',
    g.ads_management,
    adsMgmtOk,
    adsMgmtDetail
  ));

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      page: {
        id: pageId,
        name: activePage.name,
        picture: resolvePic(activePage.picture),
        instagram_business_account_id: igId
      },
      granted_permissions: rawNames,
      permission_matrix: matrix,
      raw_granted_permission_names: rawNames
    })
  };
};
