/**
 * Netlify Function: persiste un output de kie.ai DIRECTO a Supabase Storage
 * desde el server. Evita el limite de response body de Netlify (6MB en base64)
 * para imagenes grandes — particularmente upscale a 4K (5-15MB).
 *
 * Flujo:
 *   1. Auth requireAuth.
 *   2. Descarga la URL de kie con UA correcto (mismos retries que kie-video-download).
 *   3. Upload directo a Supabase Storage via REST con service key.
 *   4. Devuelve { storage_path, public_url, bytes, content_type }.
 *
 * Reemplaza al combo browser-side (download via proxy → upload via supabase-js)
 * para archivos grandes. Es agnostico del tipo de output (edit/upscale/remove-bg).
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

function inferExt(contentType, fallbackUrl) {
  const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  if (contentType && map[contentType]) return map[contentType];
  try {
    const u = new URL(fallbackUrl);
    const last = u.pathname.split('/').pop() || '';
    const ext = last.split('.').pop()?.toLowerCase();
    if (ext && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  } catch (_) { /* noop */ }
  return 'png';
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

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  let download;
  try {
    download = await downloadBinary(kieUrl);
  } catch (e) {
    return fail(event, 502, `No se pudo descargar de kie: ${e.message}`);
  }

  // Path por tipo: image-edits / image-upscales / image-remove-bg / image-variations
  const folderMap = {
    edit: 'image-edits',
    upscale: 'image-upscales',
    'remove-bg': 'image-remove-bg',
    variations: 'image-variations'
  };
  const folder = folderMap[kind] || 'image-edits';
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || String(Date.now());
  const ext = inferExt(download.contentType, kieUrl);
  const storagePath = `${folder}/${user.id}/${safeTaskId}.${ext}`;

  let publicUrl;
  try {
    publicUrl = await uploadToStorage({
      env,
      bucket,
      path: storagePath,
      buffer: download.buffer,
      contentType: download.contentType
    });
  } catch (e) {
    return fail(event, 500, `No se pudo subir a Storage: ${e.message}`);
  }

  return {
    statusCode: 200,
    headers: c,
    body: JSON.stringify({
      storage_path: storagePath,
      public_url: publicUrl,
      bytes: download.buffer.byteLength,
      content_type: download.contentType,
      bucket
    })
  };
};
