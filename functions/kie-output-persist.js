/**
 * Netlify Function: persiste un output de kie.ai en R2 (media.aismartcontent.io).
 *
 * Flujo:
 *   1. Auth requireAuth.
 *   2. Ordena al worker de ingesta (aisc-media-ingest) que descargue la URL de
 *      kie y la guarde en R2 — los bytes NUNCA pasan por Netlify, asi que no hay
 *      limite de tamaño ni timeout por archivos grandes (4K, video).
 *   3. Devuelve { storage_path, public_url } — ambos son la URL publica completa
 *      en media.aismartcontent.io; el frontend la inserta tal cual en
 *      system_ai_outputs.storage_path (los lectores hacen pass-through de http).
 *
 * production-inputs (mascaras de edicion) sigue en Supabase Storage.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth
} = require('./lib/ai-shared');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ALLOWED_DOMAINS = [
  'kie.ai',
  'aiquickdraw.com',
  'cdn.kie.ai',
  'tempfile.aiquickdraw.com',
  'api.kie.ai',
  'storage.googleapis.com',
  'kling-files.klingai.com',
  'klingfiles.klingai.com'
];

const ALLOWED_BUCKETS = new Set(['production-outputs', 'production-inputs']);

function isAllowedUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_DOMAINS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch (_) {
    return false;
  }
}

function fail(event, status, error, extra = {}) {
  return {
    statusCode: status,
    headers: corsHeaders(event),
    body: JSON.stringify({ error, ...extra })
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function inferExt(kind, fallbackUrl) {
  try {
    const u = new URL(fallbackUrl);
    const last = u.pathname.split('/').pop() || '';
    const ext = last.split('.').pop()?.toLowerCase();
    if (ext && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  } catch (_) { /* noop */ }
  return kind === 'video' ? 'mp4' : 'png';
}

/** Ingesta via worker R2: el worker descarga source_url y lo guarda; con retries. */
async function r2IngestByUrl({ sourceUrl, path, maxAttempts = 3 }) {
  const base = process.env.R2_INGEST_URL;
  const key = process.env.R2_INGEST_KEY;
  if (!base || !key) throw new Error('R2_INGEST_URL / R2_INGEST_KEY no configuradas');
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`${base}/url`, {
        method: 'POST',
        headers: { 'x-ingest-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: sourceUrl, path })
      });
      if (res.ok) {
        const j = await res.json();
        if (!j.url) throw new Error('worker sin url en respuesta');
        return j; // { url, path }
      }
      lastErr = new Error(`worker ingest HTTP ${res.status}`);
      if ([429, 502, 503, 504].includes(res.status) && attempt < maxAttempts) {
        await sleep(Math.min(500 * Math.pow(2, attempt - 1), 8000));
        continue;
      }
      throw lastErr;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) { await sleep(Math.min(500 * Math.pow(2, attempt - 1), 8000)); continue; }
      throw lastErr;
    }
  }
  throw lastErr || new Error('Ingesta fallida');
}

async function downloadBinary(url, maxAttempts = 3) {
  const upstreamHeaders = {
    Accept: 'image/*, application/octet-stream, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': BROWSER_UA,
    'Cache-Control': 'no-cache'
  };
  try {
    const u = new URL(url);
    if (u.hostname.includes('kie.ai') || u.hostname.includes('aiquickdraw')) {
      upstreamHeaders.Referer = 'https://kie.ai/';
    }
  } catch (_) { /* noop */ }

  // Exponential backoff: 500ms, 1s, 2s, 4s, 8s. Para 429 respetamos el
  // header Retry-After del upstream si llega (segundos o HTTP date).
  // Cap a 10s por intento para no quedar colgados en una Lambda.
  const RETRY_STATUSES = new Set([429, 502, 503, 504]);
  const computeBackoffMs = (attempt) => Math.min(500 * Math.pow(2, attempt - 1), 10000);
  const parseRetryAfter = (h) => {
    if (!h) return null;
    const n = Number(h);
    if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, 10000);
    const date = Date.parse(h);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 10000));
    return null;
  };

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const resp = await fetch(url, { method: 'GET', redirect: 'follow', headers: upstreamHeaders });
      if (resp.ok) {
        const buffer = Buffer.from(await resp.arrayBuffer());
        const contentType = resp.headers.get('content-type') || 'application/octet-stream';
        return { buffer, contentType };
      }
      lastErr = new Error(`upstream ${resp.status}`);
      if (RETRY_STATUSES.has(resp.status) && attempt < maxAttempts) {
        const retryAfterMs = parseRetryAfter(resp.headers.get('retry-after')) ?? computeBackoffMs(attempt);
        await sleep(retryAfterMs);
        continue;
      }
      throw lastErr;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error('Descarga fallida');
}

async function uploadToStorage({ env, bucket, path, buffer, contentType }) {
  const uploadUrl = `${env.url}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': contentType,
      'cache-control': '3600',
      'x-upsert': 'true'
    },
    body: buffer
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Storage upload HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return `${env.url}/storage/v1/object/public/${bucket}/${path}`;
}

exports.handler = async (event) => {
  const c = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: c, body: '' };
  if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

  const user = await requireAuth(event);
  if (!user) return fail(event, 401, 'No autorizado. Se requiere sesion activa.');

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (_) {
    return fail(event, 400, 'Body JSON invalido');
  }

  const kieUrl = String(body.kie_url || '').trim();
  const bucket = String(body.bucket || 'production-outputs').trim();
  const kind = String(body.kind || 'edit').trim();
  const taskId = String(body.task_id || '').trim();

  if (!isAllowedUrl(kieUrl)) return fail(event, 403, 'kie_url no autorizada');
  if (!ALLOWED_BUCKETS.has(bucket)) return fail(event, 400, 'bucket no permitido');
  if (!taskId) return fail(event, 400, 'task_id requerido');

  // Path por tipo: image-edits / image-upscales / image-remove-bg / image-variations / kie-videos
  const folderMap = {
    edit: 'image-edits',
    upscale: 'image-upscales',
    'remove-bg': 'image-remove-bg',
    reframe: 'image-reframes',
    variations: 'image-variations',
    video: 'kie-videos'
  };
  const folder = folderMap[kind] || 'image-edits';
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || String(Date.now());
  const ext = inferExt(kind, kieUrl);
  const storagePath = `${folder}/${user.id}/${safeTaskId}.${ext}`;

  // production-inputs (mascaras) sigue viviendo en Supabase Storage
  if (bucket === 'production-inputs') {
    let env;
    try { env = getSupabaseEnv(); }
    catch (e) { return fail(event, 500, e.message); }
    let download;
    try { download = await downloadBinary(kieUrl); }
    catch (e) { return fail(event, 502, `No se pudo descargar de kie: ${e.message}`); }
    let publicUrl;
    try {
      publicUrl = await uploadToStorage({ env, bucket, path: storagePath, buffer: download.buffer, contentType: download.contentType });
    } catch (e) {
      return fail(event, 500, `No se pudo subir a Storage: ${e.message}`);
    }
    return {
      statusCode: 200,
      headers: c,
      body: JSON.stringify({ storage_path: storagePath, public_url: publicUrl, bytes: download.buffer.byteLength, content_type: download.contentType, bucket })
    };
  }

  // Producciones -> R2 via worker de ingesta (bytes no pasan por Netlify)
  let ingested;
  try {
    ingested = await r2IngestByUrl({ sourceUrl: kieUrl, path: storagePath });
  } catch (e) {
    return fail(event, 502, `No se pudo persistir en R2: ${e.message}`);
  }

  return {
    statusCode: 200,
    headers: c,
    body: JSON.stringify({
      // URL completa en ambos campos: los lectores hacen pass-through de http
      storage_path: ingested.url,
      public_url: ingested.url,
      content_type: null,
      bucket: 'r2:aisc-media'
    })
  };
};
