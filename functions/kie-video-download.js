/**
 * Netlify Function: proxy de descarga de video/imagen desde la URL de KIE (u otros orígenes).
 * Evita CORS en el cliente. GET ?videoUrl=<url codificada> → devuelve el binario.
 * Algunos hosts (p. ej. tempfile.aiquickdraw.com) rechazan peticiones sin User-Agent o devuelven 502 intermitente; se reintenta.
 *
 * SEGURIDAD: solo se permiten URLs de dominios KIE autorizados para evitar SSRF.
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Dominios permitidos para el proxy de descarga
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

function isAllowedUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_DOMAINS.some(
      (d) => u.hostname === d || u.hostname.endsWith('.' + d)
    );
  } catch (_) {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function corsHeaders(contentType = 'application/json') {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
}

function upstreamHeaders(targetUrl) {
  const h = {
    Accept: 'image/*, video/*, application/octet-stream, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': BROWSER_UA,
    'Cache-Control': 'no-cache'
  };
  try {
    const u = new URL(targetUrl);
    if (u.hostname.includes('kie.ai') || u.hostname.includes('aiquickdraw')) {
      h.Referer = 'https://kie.ai/';
    }
  } catch (_) {}
  return h;
}

async function fetchUpstreamBinary(url, maxAttempts = 3) {
  let lastErr = null;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: upstreamHeaders(url)
      });
      lastStatus = resp.status;
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const contentType = resp.headers.get('content-type') || 'application/octet-stream';
        return { buffer, contentType };
      }
      const retryable = [502, 503, 504, 429].includes(resp.status);
      lastErr = new Error(`upstream ${resp.status}`);
      if (retryable && attempt < maxAttempts) {
        await sleep(400 * attempt);
        continue;
      }
      return {
        error: true,
        status: resp.status >= 400 ? resp.status : 500,
        message: 'No se pudo descargar el recurso desde el origen'
      };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(400 * attempt);
        continue;
      }
      return {
        error: true,
        status: 502,
        message: err?.message || 'Error de red al descargar'
      };
    }
  }
  return {
    error: true,
    status: lastStatus || 502,
    message: lastErr?.message || 'Error al descargar'
  };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  const videoUrl = event.queryStringParameters?.videoUrl;
  if (!videoUrl || typeof videoUrl !== 'string') {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Falta o es inválido el parámetro videoUrl' })
    };
  }

  if (!isAllowedUrl(videoUrl)) {
    return {
      statusCode: 403,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Dominio no autorizado para descarga' })
    };
  }

  try {
    const result = await fetchUpstreamBinary(videoUrl);
    if (result.error) {
      return {
        statusCode: result.status,
        headers: corsHeaders(),
        body: JSON.stringify({ error: result.message, status: result.status })
      };
    }
    const { buffer, contentType } = result;
    const base64 = Buffer.from(buffer).toString('base64');
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(contentType),
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength)
      },
      body: base64,
      isBase64Encoded: true
    };
  } catch (err) {
    console.error('kie-video-download error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Error al descargar el video' })
    };
  }
};
