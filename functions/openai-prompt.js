/**
 * Netlify Function: genera o mejora un prompt de video usando OpenAI con contexto de marca.
 * Requiere OPENAI_API_KEY en variables de entorno de Netlify.
 * Requiere Authorization: Bearer <token> de Supabase.
 *
 * POST body: { prompt?: string, brand_context?: { entities?, products?, audiences?, campaigns? } }
 * Respuesta: { prompt: string } o { error: string }
 */

const { requireAuth } = require('./lib/ai-shared');

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function buildContextText(context) {
  if (!context || typeof context !== 'object') return '';
  const parts = [];
  if (Array.isArray(context.entities) && context.entities.length > 0) {
    parts.push('Entidades de la marca: ' + context.entities.map((e) => `${e.name} (${e.type || e.entity_type || 'entidad'})${e.description ? ': ' + e.description : ''}`).join('. '));
  }
  if (Array.isArray(context.products) && context.products.length > 0) {
    parts.push('Productos: ' + context.products.map((p) => p.name).join(', '));
  }
  if (Array.isArray(context.audiences) && context.audiences.length > 0) {
    parts.push('Audiencias: ' + context.audiences.map((a) => `${a.name}${a.description ? ': ' + a.description : ''}`).join('. '));
  }
  if (Array.isArray(context.campaigns) && context.campaigns.length > 0) {
    parts.push('Campañas: ' + context.campaigns.map((c) => `${c.name}${c.description ? ': ' + c.description : ''}`).join('. '));
  }
  return parts.join('\n');
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

  const user = await requireAuth(event);
  if (!user) {
    return {
      statusCode: 401,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'No autorizado. Se requiere sesión activa.' })
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

  const userPrompt = (body.prompt || '').trim();
  const brandContext = body.brand_context || {};
  const contextText = buildContextText(brandContext);

  const systemContent = `Eres un asistente que escribe prompts concisos y efectivos para generación de video con IA (estilo Kling/Sora). 
El prompt debe ser claro, visual y en el idioma del usuario. 
Si te dan contexto de marca (entidades, productos, audiencias, campañas), úsalo para hacer el prompt más relevante y persuasivo.
Responde ÚNICAMENTE con el texto del prompt, sin explicaciones ni prefijos.`;

  const userContent = contextText
    ? (userPrompt ? `Contexto de la marca del usuario:\n${contextText}\n\nPrompt actual o idea del usuario: ${userPrompt}\n\nGenera un único prompt de video mejorado que use este contexto.` : `Contexto de la marca del usuario:\n${contextText}\n\nGenera un prompt de video corto y atractivo que use este contexto.`)
    : (userPrompt ? `Mejora o expande este prompt para generación de video: ${userPrompt}` : 'Genera un prompt corto y creativo para un video promocional genérico.');

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
        max_tokens: 300,
        temperature: 0.7
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
    console.error('openai-prompt error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};
