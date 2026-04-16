/**
 * api-brand-videos-youtube
 * Lista reciente de vídeos del canal de YouTube vinculado a la cuenta Google OAuth.
 *
 * YouTube Data API v3:
 *   - channels.list?mine=true → uploads playlist id
 *   - playlistItems.list?playlistId=… → vídeos subidos
 *
 * GET /api/brand/videos-youtube?brand_container_id=...&limit=25
 * Auth: Bearer <supabase-session-token>
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest
} = require('./lib/ai-shared');

const YT = 'https://www.googleapis.com/youtube/v3';

/**
 * Error típico: API no habilitada en el proyecto OAuth. Devuelve mensaje en español + enlace.
 */
function humanizeYouTubeNotEnabled(message) {
  if (!message || typeof message !== 'string') return null;
  const lower = message.toLowerCase();
  const looksDisabled =
    lower.includes('has not been used') ||
    lower.includes('is disabled') ||
    lower.includes('youtube data api v3') ||
    lower.includes('youtube.googleapis.com');
  if (!looksDisabled) return null;

  const m = message.match(/project[=\s]+(\d+)/i);
  const projectId = m ? m[1] : null;
  const helpUrl = projectId
    ? `https://console.developers.google.com/apis/library/youtube.googleapis.com?project=${projectId}`
    : 'https://console.developers.google.com/apis/library/youtube.googleapis.com';

  return {
    error:
      'La API «YouTube Data API v3» no está activada en tu proyecto de Google Cloud. ' +
      'Actívala en la consola, espera unos minutos y recarga esta página.',
    help_url: helpUrl,
    help_label: 'Activar YouTube Data API v3 en Google Cloud'
  };
}

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

async function ytGet(path, accessToken, params = {}) {
  const url = new URL(`${YT}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    const msg = json.error.message || json.error.errors?.[0]?.reason || JSON.stringify(json.error);
    const err = new Error(msg);
    err.youtubeError = json.error;
    throw err;
  }
  return json;
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
  const limit = Math.min(Number(qs.limit) || 20, 50);

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
      select: 'id,access_token,refresh_token,token_expires_at',
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
        console.warn('[videos-youtube] token refresh failed:', e?.message);
      }
    }
  }

  try {
    const chRes = await ytGet('/channels', token, {
      part: 'snippet,contentDetails,statistics',
      mine: 'true'
    });

    const channels = chRes.items || [];
    if (channels.length === 0) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          channel: null,
          videos: [],
          message: 'No hay canal de YouTube asociado a esta cuenta de Google (o falta permiso youtube.readonly).'
        })
      };
    }

    const ch = channels[0];
    const uploadsId = ch.contentDetails?.relatedPlaylists?.uploads;
    const stats = ch.statistics || {};

    const channel = {
      id: ch.id,
      title: ch.snippet?.title || '',
      description: ch.snippet?.description || '',
      thumbnailUrl:
        ch.snippet?.thumbnails?.high?.url ||
        ch.snippet?.thumbnails?.medium?.url ||
        ch.snippet?.thumbnails?.default?.url ||
        null,
      subscriberCount: Number(stats.subscriberCount || 0),
      videoCount: Number(stats.videoCount || 0),
      viewCount: Number(stats.viewCount || 0)
    };

    let videos = [];
    if (uploadsId) {
      const plRes = await ytGet('/playlistItems', token, {
        part: 'snippet,contentDetails',
        playlistId: uploadsId,
        maxResults: String(limit)
      });
      videos = (plRes.items || []).map((it) => {
        const sn = it.snippet || {};
        const vid = sn.resourceId?.videoId || it.contentDetails?.videoId;
        const thumb =
          sn.thumbnails?.high?.url ||
          sn.thumbnails?.medium?.url ||
          sn.thumbnails?.default?.url ||
          null;
        return {
          id: vid,
          title: sn.title || '',
          description: sn.description || '',
          publishedAt: sn.publishedAt || null,
          thumbnailUrl: thumb,
          videoUrl: vid ? `https://www.youtube.com/watch?v=${vid}` : null
        };
      });
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, channel, videos })
    };
  } catch (e) {
    console.error('[videos-youtube]', e?.message);
    const friendly = humanizeYouTubeNotEnabled(e?.message);
    if (friendly) {
      return {
        statusCode: 503,
        headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
        body: JSON.stringify(friendly)
      };
    }
    return {
      statusCode: 500,
      headers: { ...corsHeaders(event), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e?.message || 'YouTube API error' })
    };
  }
};
