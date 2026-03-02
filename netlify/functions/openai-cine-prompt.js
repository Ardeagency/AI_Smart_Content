/**
 * Netlify Function: genera un prompt cinematográfico para Kling usando OpenAI.
 * Requiere OPENAI_API_KEY en variables de entorno.
 *
 * POST body (todo opcional pero se recomienda director_brief o recursos):
 *   director_brief: string — intención del usuario (Director Brief)
 *   kling_elements: Array<{ name, element_input_urls?, element_input_video_urls? }> — producciones/productos adjuntos
 *   brand_context: { entities?, products?, audiences?, campaigns? } — datos de marca (name/nombre, description, etc.)
 *   cinematography: { shotType, lens, framing, cameraMovement, motionSpeed, motionIntensity, lightType, contrastLevel, temperature, tone, colorGrade, energyLevel }
 *
 * Respuesta: { prompt: string } (texto listo para Kling) o { error: string }
 */

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function buildBrandText(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const parts = [];
  if (Array.isArray(ctx.entities) && ctx.entities.length > 0) {
    parts.push('Entidades de la marca: ' + ctx.entities.map((e) => `${e.name || e.nombre} (${e.entity_type || e.type || 'entidad'})${e.description ? ': ' + e.description : ''}`).join('. '));
  }
  if (Array.isArray(ctx.products) && ctx.products.length > 0) {
    parts.push('Productos: ' + ctx.products.map((p) => p.name || p.nombre_producto).join(', '));
  }
  if (Array.isArray(ctx.audiences) && ctx.audiences.length > 0) {
    parts.push('Audiencias: ' + ctx.audiences.map((a) => `${a.name}${a.description ? ': ' + a.description : ''}`).join('. '));
  }
  if (Array.isArray(ctx.campaigns) && ctx.campaigns.length > 0) {
    parts.push('Campañas: ' + ctx.campaigns.map((c) => `${c.name || c.nombre_campana}${(c.description || c.descripcion_interna) ? ': ' + (c.description || c.descripcion_interna) : ''}`).join('. '));
  }
  return parts.length ? parts.join('\n') : '';
}

function buildAttachedAssetsText(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return '';
  return 'Recursos adjuntos (referencias visuales que debe reflejar el video):\n' + elements.map((el) => {
    const name = el.name || 'elemento';
    const urls = el.element_input_urls || el.element_input_video_urls || [];
    return `- ${name}: ${urls.length ? urls[0] + (urls.length > 1 ? ' (+ más)' : '') : 'sin URL'}`;
  }).join('\n');
}

function buildCinematographyText(cine) {
  if (!cine || typeof cine !== 'object') return '';
  const lines = [
    cine.shotType && `Shot: ${cine.shotType}`,
    cine.lens && `Lens: ${cine.lens}`,
    cine.framing && `Framing: ${cine.framing}`,
    cine.cameraMovement && `Camera movement: ${cine.cameraMovement}`,
    cine.motionSpeed && `Motion speed: ${cine.motionSpeed}`,
    cine.motionIntensity && `Motion intensity: ${cine.motionIntensity}`,
    cine.lightType && `Lighting: ${cine.lightType}`,
    cine.contrastLevel && `Contrast: ${cine.contrastLevel}`,
    cine.temperature && `Temperature: ${cine.temperature}`,
    cine.tone && `Tone: ${cine.tone}`,
    cine.colorGrade && `Color grade: ${cine.colorGrade}`,
    cine.energyLevel && `Energy level: ${cine.energyLevel}`
  ].filter(Boolean);
  return lines.length ? 'Cinematografía deseada:\n' + lines.join('\n') : '';
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'OPENAI_API_KEY no configurada en el servidor' })
    };
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Body JSON inválido' })
    };
  }

  const directorBrief = (body.director_brief || '').trim();
  const klingElements = body.kling_elements || [];
  const brandContext = body.brand_context || {};
  const cinematography = body.cinematography || {};

  const brandText = buildBrandText(brandContext);
  const assetsText = buildAttachedAssetsText(klingElements);
  const cineText = buildCinematographyText(cinematography);

  const systemContent = `Eres un experto en redactar prompts para generación de video con IA (Kling/Sora). 
Tu tarea es devolver UN ÚNICO prompt cinematográfico listo para pegar en Kling.
El prompt debe ser: descriptivo, visual, en inglés (salvo que el usuario pida otro idioma), y debe integrar de forma natural la intención del director, la estética indicada y las referencias de marca/producto.
Responde ÚNICAMENTE con el texto del prompt, sin explicaciones, títulos ni prefijos.`;

  const userParts = [];
  if (brandText) userParts.push('CONTEXTO DE MARCA\n' + brandText);
  if (assetsText) userParts.push(assetsText);
  if (cineText) userParts.push(cineText);
  if (directorBrief) userParts.push('BRIEF DEL DIRECTOR (intención del usuario)\n' + directorBrief);
  if (userParts.length === 0) userParts.push('Genera un prompt cinematográfico corto y atractivo para un video comercial genérico.');

  const userContent = userParts.join('\n\n---\n\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent }
        ],
        max_tokens: 400,
        temperature: 0.6
      })
    });

    const data = await res.json();

    if (data.error) {
      return {
        statusCode: res.status >= 400 ? res.status : 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: data.error.message || 'Error de OpenAI' })
      };
    }

    const prompt = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
      ? String(data.choices[0].message.content).trim()
      : '';
    if (!prompt) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'OpenAI no devolvió texto' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ prompt })
    };
  } catch (err) {
    console.error('openai-cine-prompt error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};
