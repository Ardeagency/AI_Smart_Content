/**
 * Netlify Function: dado un brief en lenguaje natural, sugiere un setup
 * cinematográfico (movement / lighting / mood / camera) que el frontend
 * usa para pre-rellenar los chips del sidebar de Video.
 *
 * Diferente de openai-cine-prompt.js: ese endpoint genera el prompt FINAL
 * para Kling. Este solo recomienda VALORES para los selects del sidebar.
 *
 * Requiere Authorization: Bearer <token> de Supabase.
 * POST body: { brief: string, brand_context?: object }
 * Respuesta: { setup: { cameraMovement, motionSpeed, motionIntensity, lightType,
 *   contrastLevel, temperature, tone, colorGrade, energyLevel, shotType, lens,
 *   framing }, rationale: string }
 *
 * Los valores devueltos son strictly de las listas permitidas; si OpenAI
 * devuelve un valor desconocido, el frontend lo ignora.
 */

const { requireAuth } = require('./lib/ai-shared');

const ALLOWED_ORIGINS = new Set([
  'https://aismartcontent.io', 'https://www.aismartcontent.io',
  'https://console.aismartcontent.io',
  'http://localhost:8888', 'http://localhost:8080', 'http://localhost:5173',
  'http://127.0.0.1:8888'
]);
if (process.env.SITE_URL) ALLOWED_ORIGINS.add(process.env.SITE_URL.replace(/\/$/, ''));

function corsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const allow = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : (process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : 'https://aismartcontent.io');
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

// Listas permitidas — deben coincidir con CINE_OPTIONS de VideoView.js
const ALLOWED = {
  shotType: ['Wide shot', 'Medium shot', 'Close-up', 'Extreme close-up', 'Full body', 'Over the shoulder'],
  lens: ['24mm wide', '35mm natural', '50mm portrait', '85mm telephoto', '100mm macro', 'Anamorphic'],
  framing: ['Centered', 'Rule of thirds', 'Symmetric', 'Asymmetric', 'Low angle', 'High angle', 'Dutch angle'],
  cameraMovement: ['Static', 'Slow Push In', 'Slow Pull Out', 'Dolly Left', 'Dolly Right', 'Orbit', '360° Rotation', 'Handheld', 'Tracking', 'FPV'],
  motionSpeed: ['Subtle', 'Moderate', 'Dynamic', 'Aggressive'],
  motionIntensity: ['Subtle', 'Moderate', 'Dynamic', 'Aggressive'],
  lightType: ['Soft diffused', 'Hard contrast', 'Rim light', 'Backlit silhouette', 'Studio commercial', 'Natural daylight', 'Dramatic spotlight'],
  contrastLevel: ['Low', 'Medium', 'High', 'Ultra contrast'],
  temperature: ['Neutral', 'Warm', 'Cold'],
  tone: ['Clean commercial', 'Cinematic dramatic', 'Hyperreal product', 'Minimal luxury', 'Dark premium', 'Bright energetic', 'Editorial fashion', 'Documentary'],
  colorGrade: ['Neutral', 'Warm', 'Cold', 'High saturation', 'Muted tones'],
  colorTemp: ['Neutral', 'Warm', 'Cold', 'High saturation', 'Muted tones'],
  energyLevel: ['Low', 'Moderate', 'High', 'Peak']
};

function buildSystemPrompt() {
  return `You are a senior video director. Given a 1-2 sentence brief describing a video, recommend a complete cinematography setup. Pick values STRICTLY from these allowed lists (one value per key, never invent):

cameraMovement: ${ALLOWED.cameraMovement.join(' | ')}
motionSpeed: ${ALLOWED.motionSpeed.join(' | ')}
motionIntensity: ${ALLOWED.motionIntensity.join(' | ')}
lightType: ${ALLOWED.lightType.join(' | ')}
contrastLevel: ${ALLOWED.contrastLevel.join(' | ')}
temperature: ${ALLOWED.temperature.join(' | ')}
tone: ${ALLOWED.tone.join(' | ')}
colorGrade: ${ALLOWED.colorGrade.join(' | ')}
energyLevel: ${ALLOWED.energyLevel.join(' | ')}
shotType: ${ALLOWED.shotType.join(' | ')}
lens: ${ALLOWED.lens.join(' | ')}
framing: ${ALLOWED.framing.join(' | ')}

Respond ONLY with valid JSON in this exact shape:
{
  "setup": {
    "cameraMovement": "...", "motionSpeed": "...", "motionIntensity": "...",
    "lightType": "...", "contrastLevel": "...", "temperature": "...",
    "tone": "...", "colorGrade": "...", "energyLevel": "...",
    "shotType": "...", "lens": "...", "framing": "..."
  },
  "rationale": "Short Spanish explanation (1-2 lines) of why this setup fits the brief."
}

Pick the setup that best matches the brand's tone and the brief's emotional intent. Do not include any text outside the JSON.`;
}

function sanitizeSetup(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  Object.keys(ALLOWED).forEach((key) => {
    const v = raw[key];
    if (typeof v === 'string' && ALLOWED[key].includes(v)) out[key] = v;
  });
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  const user = await requireAuth(event);
  if (!user) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'No autenticado' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const brief = String(body.brief || '').trim();
  if (brief.length < 5) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Brief muy corto (mínimo 5 caracteres)' }) };
  }

  const brandContext = body.brand_context && typeof body.brand_context === 'object' ? body.brand_context : null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'OPENAI_API_KEY no configurada' }) };
  }

  const model = process.env.OPENAI_CINE_MODEL || 'gpt-4o-mini';
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    {
      role: 'user',
      content: brandContext
        ? `Brief: ${brief}\n\nBrand context (for tonal coherence):\n${JSON.stringify(brandContext).slice(0, 2000)}`
        : `Brief: ${brief}`
    }
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        max_tokens: 800
      })
    });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: 'OpenAI error', detail: txt.slice(0, 500) }) };
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = {}; }
    const setup = sanitizeSetup(parsed.setup);
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 400) : '';
    return {
      statusCode: 200,
      headers: corsHeaders(event),
      body: JSON.stringify({ setup, rationale })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: 'Error interno', detail: String(err?.message || err).slice(0, 300) })
    };
  }
};
