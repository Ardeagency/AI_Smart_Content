/**
 * Netlify Function: proxy de descarga de video desde la URL de KIE.
 * Evita CORS en el cliente. GET ?videoUrl=<url codificada> → devuelve el video en binario.
 */

function corsHeaders(contentType = 'application/json') {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
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
  if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.startsWith('http')) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Falta o es inválido el parámetro videoUrl' })
    };
  }

  try {
    const resp = await fetch(videoUrl, {
      method: 'GET',
      headers: { 'Accept': 'image/*, video/*, */*' }
    });
    if (!resp.ok) {
      return {
        statusCode: resp.status >= 400 ? resp.status : 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'No se pudo descargar el video', status: resp.status })
      };
    }
    const contentType = resp.headers.get('content-type') || 'video/mp4';
    const buffer = await resp.arrayBuffer();
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
