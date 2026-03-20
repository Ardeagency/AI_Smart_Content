/**
 * Netlify Function: regenera imagen con corrección del usuario.
 * Flujo: OpenAI refina intención -> KIE (nanobanana) genera nueva imagen.
 */

const KIE_BASE = (process.env.KIE_API_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const KIE_MODEL = process.env.KIE_NANOBANANA_MODEL || 'nanobanana';
const CREATE_PATH = '/api/v1/jobs/createTask';
const STATUS_PATH = '/api/v1/jobs/recordInfo';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

async function openaiRefinePrompt({ prompt, correction }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return `${prompt || ''}\n\nCorrección solicitada: ${correction || ''}`.trim();

  const system = 'Eres un director creativo de edición de imagen publicitaria. Devuelve solo un prompt final claro para regenerar una imagen manteniendo la composición base y aplicando la corrección del usuario.';
  const user = [
    `Prompt original:\n${prompt || 'Sin prompt original.'}`,
    `Corrección solicitada:\n${correction || ''}`,
    'Devuelve un único prompt final. Sin explicaciones.'
  ].join('\n\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'OpenAI no pudo refinar el prompt');
  const refined = data?.choices?.[0]?.message?.content?.trim();
  if (!refined) throw new Error('OpenAI no devolvió un prompt válido');
  return refined;
}

async function createKieTask({ refinedPrompt, imageUrl, technicalParams }) {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error('Falta KIE_API_KEY');

  const payload = {
    model: KIE_MODEL,
    input: {
      prompt: refinedPrompt,
      image_urls: [imageUrl],
      technical_params: technicalParams || {}
    }
  };

  const res = await fetch(`${KIE_BASE}${CREATE_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.msg || data?.message || data?.error || 'KIE no pudo crear la tarea');
  const taskId = data?.data?.taskId || data?.taskId;
  if (!taskId) throw new Error('KIE no devolvió taskId');
  return taskId;
}

async function pollKieTask(taskId) {
  const apiKey = process.env.KIE_API_KEY;
  const maxAttempts = Number(process.env.KIE_IMAGE_MAX_POLLS || 40);
  const delayMs = Number(process.env.KIE_IMAGE_POLL_MS || 3000);

  for (let i = 0; i < maxAttempts; i += 1) {
    const statusUrl = `${KIE_BASE}${STATUS_PATH}?taskId=${encodeURIComponent(taskId)}`;
    const res = await fetch(statusUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.msg || data?.message || 'KIE status error');

    const state = data?.data?.state || data?.state;
    if (state === 'success') {
      const resultJson = data?.data?.resultJson || {};
      let parsed = resultJson;
      if (typeof resultJson === 'string') {
        try { parsed = JSON.parse(resultJson); } catch (_) { parsed = {}; }
      }
      const urls = parsed?.resultUrls || parsed?.images || parsed?.urls || [];
      const imageUrl = Array.isArray(urls) && urls.length ? urls[0] : null;
      if (!imageUrl) throw new Error('KIE completó la tarea pero sin URL de imagen');
      return imageUrl;
    }
    if (state === 'fail' || state === 'failed') {
      const failMsg = data?.data?.failMsg || data?.failMsg || 'KIE reportó fallo';
      throw new Error(failMsg);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Tiempo de espera agotado al regenerar la imagen');
}

exports.handler = async (event) => {
  const headers = cors();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const imageUrl = (body.image_url || '').trim();
    const prompt = (body.prompt || '').trim();
    const correction = (body.correction || '').trim();
    const technicalParams = body.technical_params && typeof body.technical_params === 'object' ? body.technical_params : {};

    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'image_url inválida' }) };
    }
    if (!correction) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'La corrección es requerida' }) };
    }

    const refinedPrompt = await openaiRefinePrompt({ prompt, correction });
    const taskId = await createKieTask({ refinedPrompt, imageUrl, technicalParams });
    const resultImageUrl = await pollKieTask(taskId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        task_id: taskId,
        prompt: refinedPrompt,
        image_url: resultImageUrl,
        provider: 'kie_api',
        model: KIE_MODEL
      })
    };
  } catch (err) {
    console.error('kie-image-regenerate error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err?.message || 'Error regenerando imagen' })
    };
  }
};
