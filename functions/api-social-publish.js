/**
 * api-social-publish — publica un output de Production en redes sociales.
 *
 * Hoy operan REALMENTE: facebook (page/photos|videos), instagram (media + media_publish).
 * youtube / x / tiktok responden status 'not_implemented' (UI los muestra como "Proximamente").
 *
 * Auth: Bearer token Supabase. Resuelve org/brand desde el propio output y valida
 * membresia con assertOrgMember. Los tokens de pagina viven en
 * brand_integrations.metadata.pages[] (texto plano, no la columna cifrada).
 *
 * Body: { output_id, platforms: ['facebook','instagram',...], caption?, page_id? }
 * Endpoint: /.netlify/functions/api-social-publish  (POST)
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember,
  checkBodySize
} = require('./lib/ai-shared');
const { metaGraphGet, metaGraphPost } = require('./lib/meta-graph');
const { checkRateLimit } = require('./lib/rate-limiter');

const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v'];
const REAL_PLATFORMS = ['facebook', 'instagram'];
const STUB_PLATFORMS = ['youtube', 'x', 'tiktok'];

function nowIso() { return new Date().toISOString(); }

function publicStorageUrl(supabaseUrl, bucket, path) {
  let p = String(path || '').replace(/^\/+/, '');
  // storage_path en runs_outputs suele venir con el nombre del bucket YA como
  // prefijo (ej. "production-outputs/<org>/...") — no duplicarlo, o Supabase
  // devuelve 400 (JSON de error) y Meta lo rechaza con "Only photo or video".
  if (p === bucket) p = '';
  else if (p.startsWith(bucket + '/')) p = p.slice(bucket.length + 1);
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${p}`;
}

// Instagram SOLO acepta JPEG para imagenes; nuestros outputs pueden ser PNG/WebP.
// Reencodamos via Netlify Image CDN (first-party, on-demand) a JPEG baseline.
// Si SITE_URL no esta configurado, devolvemos la URL original (best effort).
function toInstagramImageUrl(mediaUrl) {
  if (!mediaUrl) return mediaUrl;
  // IG acepta JPEG directo — solo convertimos PNG/WebP/etc.
  const clean = String(mediaUrl).split('?')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return mediaUrl;
  const base = (process.env.SITE_URL || '').replace(/\/$/, '');
  if (!base) return mediaUrl;
  return `${base}/.netlify/images?url=${encodeURIComponent(mediaUrl)}&fm=jpg&q=90`;
}

function isVideoOutput(output, mediaUrl) {
  const t = String(output?.output_type || '').toLowerCase();
  const ext = String(mediaUrl || output?.storage_path || '').split('?')[0].split('.').pop().toLowerCase();
  return VIDEO_EXT.includes(ext) || /video|reel|clip|animat/.test(t);
}

// Espera a que el container de IG termine de procesar (videos/reels). Imagenes
// quedan FINISHED de inmediato. Limitado para no exceder el timeout de la funcion.
async function waitIgContainerReady(creationId, token, appSecret, { tries = 5, delayMs = 2500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await metaGraphGet(`/${creationId}`, token, appSecret, { fields: 'status_code,status' }).catch(() => null);
    const code = r?.status_code;
    if (code === 'FINISHED') return true;
    if (code === 'ERROR' || code === 'EXPIRED') throw new Error(`IG container ${code}: ${r?.status || ''}`);
    await new Promise((res) => setTimeout(res, delayMs));
  }
  return false; // aun IN_PROGRESS
}

/** Elige la pagina conectada: por page_id explicito, o la primera disponible. */
function pickPage(pages, pageId, { needIg = false } = {}) {
  const list = Array.isArray(pages) ? pages.filter((p) => p && p.access_token) : [];
  if (pageId) return list.find((p) => String(p.id) === String(pageId)) || null;
  if (needIg) {
    const withIg = list.find((p) => p.instagram_business_account?.id);
    if (withIg) return withIg;
  }
  return list[0] || null;
}

// ── Publishers ────────────────────────────────────────────────────────────────

async function publishFacebook({ page, mediaUrl, isVideo, caption, appSecret }) {
  const token = page.access_token;
  if (isVideo) {
    const r = await metaGraphPost(`/${page.id}/videos`, token, appSecret, {
      file_url: mediaUrl,
      description: caption || ''
    });
    const postId = r.id || r.post_id || null;
    return { remote_post_id: postId, remote_url: postId ? `https://www.facebook.com/${postId}` : null };
  }
  const r = await metaGraphPost(`/${page.id}/photos`, token, appSecret, {
    url: mediaUrl,
    caption: caption || ''
  });
  const postId = r.post_id || r.id || null;
  return { remote_post_id: postId, remote_url: postId ? `https://www.facebook.com/${postId}` : null };
}

async function publishInstagram({ page, mediaUrl, isVideo, caption, appSecret }) {
  const igId = page.instagram_business_account?.id;
  if (!igId) throw new Error('Esta pagina de Facebook no tiene una cuenta de Instagram Business vinculada');
  const token = page.access_token;

  const containerParams = isVideo
    ? { media_type: 'REELS', video_url: mediaUrl, caption: caption || '' }
    : { image_url: toInstagramImageUrl(mediaUrl), caption: caption || '' };

  const container = await metaGraphPost(`/${igId}/media`, token, appSecret, containerParams);
  const creationId = container.id;
  if (!creationId) throw new Error('Instagram no devolvio un container de medios');

  if (isVideo) {
    const ready = await waitIgContainerReady(creationId, token, appSecret);
    if (!ready) {
      // Container aun procesando — devolvemos pending para reintento posterior.
      const e = new Error('El video sigue procesando en Instagram; reintenta en unos segundos');
      e.pending = true;
      e.creationId = creationId;
      throw e;
    }
  }

  const pub = await metaGraphPost(`/${igId}/media_publish`, token, appSecret, { creation_id: creationId });
  const mediaId = pub.id || null;
  let permalink = null;
  if (mediaId) {
    const info = await metaGraphGet(`/${mediaId}`, token, appSecret, { fields: 'permalink' }).catch(() => null);
    permalink = info?.permalink || null;
  }
  return { remote_post_id: mediaId, remote_url: permalink };
}

// ── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  const method = event.httpMethod;
  if (method !== 'GET' && method !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const tooBig = checkBodySize(event, 8 * 1024);
  if (tooBig) return tooBig;

  const rl = checkRateLimit(event, { maxRequests: 30, windowMs: 60000, keyPrefix: 'social-publish' });
  if (rl.blocked) {
    return {
      statusCode: 429,
      headers: { ...corsHeaders(event), 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      body: JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' })
    };
  }

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Configuracion del servidor incompleta' }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Falta token de autorizacion' }) };

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Sesion invalida' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}
  const q = event.queryStringParameters || {};

  const outputId = String((method === 'GET' ? q.output_id : body.output_id) || '').trim();
  const rawPageId = method === 'GET' ? q.page_id : body.page_id;
  const pageIdParam = rawPageId ? String(rawPageId) : null;
  if (!outputId) return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Falta output_id' }) };

  // 1) Cargar el output (service key) y derivar org/brand.
  let output;
  try {
    const rows = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'runs_outputs', method: 'GET',
      searchParams: {
        select: 'id,run_id,output_type,storage_path,organization_id,brand_container_id,generated_copy,generated_hashtags,metadata',
        id: `eq.${outputId}`, limit: '1'
      }
    });
    output = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'No se pudo leer la produccion' }) };
  }
  if (!output) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'Produccion no encontrada' }) };

  let organizationId = output.organization_id || null;
  let brandContainerId = output.brand_container_id || body.brand_container_id || null;

  // Fallback: org desde flow_runs si el output no la trae.
  if (!organizationId && output.run_id) {
    const fr = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'flow_runs', method: 'GET',
      searchParams: { select: 'organization_id', id: `eq.${output.run_id}`, limit: '1' }
    }).catch(() => null);
    organizationId = Array.isArray(fr) && fr[0] ? fr[0].organization_id : null;
  }
  if (!organizationId) return { statusCode: 422, headers: corsHeaders(event), body: JSON.stringify({ error: 'La produccion no tiene organizacion asociada' }) };

  // 2) Autorizacion.
  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id });
  } catch (e) {
    return { statusCode: e.statusCode || 403, headers: corsHeaders(event), body: JSON.stringify({ error: e.message || 'No autorizado' }) };
  }

  // 3) Cargar integracion de Meta (facebook cubre tambien instagram via pages).
  let metaIntegration = null;
  let metaPages = [];
  if (brandContainerId) {
    const integ = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'brand_integrations', method: 'GET',
      searchParams: {
        select: 'id,metadata,is_active', brand_container_id: `eq.${brandContainerId}`,
        platform: 'eq.facebook', is_active: 'eq.true', limit: '1'
      }
    }).catch(() => null);
    metaIntegration = Array.isArray(integ) && integ[0] ? integ[0] : null;
    metaPages = metaIntegration?.metadata?.pages || [];
  }

  const fbPage = pickPage(metaPages, pageIdParam, { needIg: false });
  const igPage = pickPage(metaPages, pageIdParam, { needIg: true });
  const isVideo = isVideoOutput(output, output.storage_path);
  const mediaType = isVideo ? 'video' : 'image';

  // Resumen de conexiones — NO expone tokens al cliente, solo presencia + nombre.
  const connections = {
    facebook: {
      connected: !!(fbPage && fbPage.access_token),
      account_name: fbPage?.name || null,
      page_id: fbPage?.id || null
    },
    instagram: {
      connected: !!(igPage && igPage.instagram_business_account?.id),
      account_name: igPage?.instagram_business_account?.username
        ? '@' + igPage.instagram_business_account.username
        : (igPage?.instagram_business_account?.name || null),
      page_id: igPage?.id || null
    },
    youtube: { connected: false, available: false },
    x:       { connected: false, available: false },
    tiktok:  { connected: false, available: false }
  };

  // ── GET: solo estado de conexion ────────────────────────────────────────────
  if (method === 'GET') {
    return {
      statusCode: 200,
      headers: corsHeaders(event),
      body: JSON.stringify({ output_id: outputId, media_type: mediaType, brand_container_id: brandContainerId, connections })
    };
  }

  // ── POST: publicar ──────────────────────────────────────────────────────────
  let platforms = Array.isArray(body.platforms) ? body.platforms.map((p) => String(p).toLowerCase().trim()) : [];
  platforms = [...new Set(platforms)].filter((p) => REAL_PLATFORMS.includes(p) || STUB_PLATFORMS.includes(p));
  if (!platforms.length) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Selecciona al menos una plataforma' }) };
  }

  // Resolver media URL real para publicar.
  const meta = output.metadata || {};
  let mediaUrl = meta.public_url || meta.url || meta.output_url || null;
  if (!mediaUrl && output.storage_path) {
    mediaUrl = publicStorageUrl(env.url, 'production-outputs', output.storage_path);
  }
  if (!mediaUrl) return { statusCode: 422, headers: corsHeaders(event), body: JSON.stringify({ error: 'La produccion no tiene archivo publicable' }) };

  let caption = typeof body.caption === 'string' ? body.caption : '';
  if (!caption) {
    const tags = Array.isArray(output.generated_hashtags) ? output.generated_hashtags.join(' ') : '';
    caption = [output.generated_copy || '', tags].filter(Boolean).join('\n\n').trim();
  }
  const appSecret = process.env.META_APP_SECRET || '';

  // 4) Publicar por plataforma.
  const results = [];
  for (const platform of platforms) {
    const record = {
      output_id: outputId, brand_container_id: brandContainerId, organization_id: organizationId,
      platform, caption, media_url: mediaUrl, media_type: mediaType, created_by: user.id
    };

    if (STUB_PLATFORMS.includes(platform)) {
      results.push({ platform, status: 'not_implemented', error: 'Proximamente' });
      record.status = 'not_implemented';
      record.error = 'not_implemented';
      await supabaseRest({ url: env.url, serviceKey: env.serviceKey, path: 'social_publications', method: 'POST', body: [record] }).catch(() => {});
      continue;
    }

    try {
      if (!brandContainerId) throw new Error('La produccion no tiene marca asociada para resolver la conexion');
      if (!metaIntegration) throw new Error('Conecta Facebook/Instagram en esta marca antes de publicar');
      if (!appSecret) throw new Error('META_APP_SECRET no configurado en el servidor');

      const needIg = platform === 'instagram';
      const page = pickPage(metaPages, pageIdParam, { needIg });
      if (!page) throw new Error(needIg ? 'No hay pagina con Instagram Business vinculado' : 'No hay pagina de Facebook conectada');

      const out = platform === 'facebook'
        ? await publishFacebook({ page, mediaUrl, isVideo, caption, appSecret })
        : await publishInstagram({ page, mediaUrl, isVideo, caption, appSecret });

      record.status = 'published';
      record.remote_post_id = out.remote_post_id;
      record.remote_url = out.remote_url;
      record.metadata = { page_id: page.id, page_name: page.name || null };
      await supabaseRest({ url: env.url, serviceKey: env.serviceKey, path: 'social_publications', method: 'POST', body: [record] }).catch(() => {});

      // Marcar el output como publicado (ultima plataforma gana published_at).
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: 'runs_outputs', method: 'PATCH',
        searchParams: { id: `eq.${outputId}` },
        body: { published_at: nowIso(), external_platform: platform, external_ad_id: out.remote_post_id }
      }).catch(() => {});

      results.push({ platform, status: 'published', remote_post_id: out.remote_post_id, remote_url: out.remote_url });
    } catch (e) {
      const pending = e.pending === true;
      record.status = pending ? 'pending' : 'failed';
      record.error = e.message || 'Error al publicar';
      if (e.creationId) record.metadata = { ig_creation_id: e.creationId };
      // 'pending' no esta en el check de status — lo guardamos como failed con nota.
      if (pending) { record.status = 'failed'; record.error = `pending: ${record.error}`; }
      await supabaseRest({ url: env.url, serviceKey: env.serviceKey, path: 'social_publications', method: 'POST', body: [record] }).catch(() => {});
      results.push({ platform, status: pending ? 'pending' : 'failed', error: e.message || 'Error al publicar' });
    }
  }

  const anyOk = results.some((r) => r.status === 'published');
  return {
    statusCode: anyOk ? 200 : 207,
    headers: corsHeaders(event),
    body: JSON.stringify({ ok: anyOk, media_type: mediaType, results })
  };
};
