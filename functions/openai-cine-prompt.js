/**
 * Netlify Function: genera prompt(s) cinematográficos para KIE/Kling usando OpenAI.
 * Pipeline: IDEA → INTERPRETATION (shot design) → PROMPT(s). Salida siempre en inglés.
 * Requiere Authorization: Bearer <token> de Supabase.
 *
 * - System: director de video (camera behavior, motion, lens; no describir escena). Con imagen: solo comportamiento de cámara.
 * - Cinematografía en narrativa (no metadatos). Brand tone/energy para coherencia visual.
 * - Opcional OPENAI_CINE_MODEL (default gpt-4o-mini; ej. gpt-4.1-mini si está disponible).
 *
 * POST body: idea, director_brief, scene_image_urls[], scene_elements, product_lock_elements, campaign, audience, brand_context, cinematography, multi_prompt
 * Respuesta: { prompt: string } o { multi_prompts: string[] } — siempre en inglés.
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

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function buildBrandVoiceText(brandContext) {
  const voice = brandContext?.brand_voice || {};
  const profiles = arr(brandContext?.brand_profiles);
  const parts = [];
  if (voice.tono_comunicacion?.length) parts.push('Tono de comunicación: ' + voice.tono_comunicacion.join(', '));
  if (voice.estilo_publicidad?.length) parts.push('Estilo publicidad: ' + voice.estilo_publicidad.join(', '));
  if (voice.estilo_escritura?.length) parts.push('Estilo de escritura: ' + voice.estilo_escritura.join(', '));
  if (voice.palabras_clave?.length) parts.push('Palabras clave: ' + voice.palabras_clave.join(', '));
  if (voice.palabras_prohibidas?.length) parts.push('Palabras a evitar: ' + voice.palabras_prohibidas.join(', '));
  if (voice.arquetipo_personalidad?.length) parts.push('Arquetipo / personalidad: ' + voice.arquetipo_personalidad.join(', '));
  if (voice.enfoque_marca?.length) parts.push('Enfoque de marca: ' + voice.enfoque_marca.join(', '));
  if (voice.estilo_visual?.length) parts.push('Estilo visual: ' + voice.estilo_visual.join(', '));
  if (voice.transmitir_visualmente?.length) parts.push('Transmitir visualmente: ' + voice.transmitir_visualmente.join(', '));
  if (voice.evitar_visualmente?.length) parts.push('Evitar visualmente: ' + voice.evitar_visualmente.join(', '));
  if (voice.objetivos_marca?.length) parts.push('Objetivos de marca: ' + voice.objetivos_marca.join(', '));
  profiles.forEach((p) => {
    if (p.section && p.content) parts.push(`[${p.section}] ${p.content}`);
  });
  return parts.length ? parts.join('\n') : '';
}

function buildCampaignAudienceText(campaign, audience) {
  const parts = [];
  if (campaign && (campaign.nombre_campana || campaign.name)) {
    parts.push('Campaña: ' + (campaign.nombre_campana || campaign.name));
    if (campaign.descripcion_interna || campaign.description) parts.push('Descripción: ' + (campaign.descripcion_interna || campaign.description));
    if (arr(campaign.contexto_temporal).length) parts.push('Contexto temporal: ' + arr(campaign.contexto_temporal).join(', '));
    if (arr(campaign.objetivos_estrategicos).length) parts.push('Objetivos: ' + arr(campaign.objetivos_estrategicos).join(', '));
    if (arr(campaign.tono_modificador).length) parts.push('Tono modificador: ' + arr(campaign.tono_modificador).join(', '));
  }
  if (audience && (audience.name)) {
    parts.push('Audiencia: ' + audience.name);
    if (audience.description) parts.push('Descripción audiencia: ' + audience.description);
    if (arr(audience.estilo_lenguaje).length) parts.push('Estilo de lenguaje audiencia: ' + arr(audience.estilo_lenguaje).join(', '));
  }
  return parts.length ? 'La producción debe ser fiel a esta campaña y audiencia.\n' + parts.join('\n') : '';
}

function buildSceneText(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return '';
  return 'Escena a producir (referencias visuales de la escena que el video debe representar):\n' + elements.map((el) => {
    const name = el.name || 'elemento';
    const urls = el.element_input_urls || el.element_input_video_urls || [];
    return `- ${name}: ${urls.length ? urls[0] + (urls.length > 1 ? ' (+ más)' : '') : 'sin URL'}`;
  }).join('\n');
}

function buildProductLockText(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return '';
  return 'Bloqueo de producto: el video NO debe cambiar ni alterar el producto. Referencias del producto que deben mantenerse exactas:\n' + elements.map((el) => {
    const name = el.name || el.description || 'producto';
    const urls = el.element_input_urls || [];
    return `- ${name}: ${urls.length ? urls[0] + (urls.length > 1 ? ' (+ más)' : '') : 'sin URL'}`;
  }).join('\n');
}

/** Convierte metadatos de cinematografía en narrativa para que la IA los use como dirección, no como etiquetas. */
function buildCinematographyNarrative(cine) {
  if (!cine || typeof cine !== 'object') return '';
  const parts = [];
  if (cine.lens) parts.push(`The shot uses a ${cine.lens} cinematic lens.`);
  if (cine.framing) parts.push(`Framing is ${cine.framing.toLowerCase()} with the subject dominating the frame.`);
  if (cine.shotType) parts.push(`Shot type: ${cine.shotType}.`);
  if (cine.cameraMovement) parts.push(`The camera movement is ${cine.cameraMovement.toLowerCase()}.`);
  if (cine.motionSpeed) parts.push(`Motion is ${cine.motionSpeed.toLowerCase()} and ${(cine.motionIntensity || '').toLowerCase() || 'controlled'}.`);
  if (cine.lightType) parts.push(`Lighting: ${cine.lightType}.`);
  if (cine.contrastLevel) parts.push(`Contrast level: ${cine.contrastLevel}.`);
  if (cine.temperature) parts.push(`Color temperature: ${cine.temperature}.`);
  if (cine.tone) parts.push(`Tone: ${cine.tone}.`);
  if (cine.colorGrade) parts.push(`Color grade: ${cine.colorGrade}.`);
  if (cine.energyLevel) parts.push(`Energy: ${cine.energyLevel}.`);
  return parts.length ? 'Shot direction (use this as camera and lighting direction):\n' + parts.join(' ') : '';
}

/** Extrae tone, energy y personalidad de marca para coherencia visual del video. */
function buildBrandToneForPrompt(brandContext) {
  const voice = brandContext?.brand_voice || {};
  const parts = [];
  if (voice.estilo_publicidad?.length) parts.push(`Tone: ${voice.estilo_publicidad.join(', ')}`);
  if (voice.estilo_visual?.length) parts.push(`Visual style: ${voice.estilo_visual.join(', ')}`);
  if (voice.arquetipo_personalidad?.length) parts.push(`Brand personality: ${voice.arquetipo_personalidad.join(', ')}`);
  if (voice.transmitir_visualmente?.length) parts.push(`Convey visually: ${voice.transmitir_visualmente.join(', ')}`);
  const energyRaw = voice.objetivos_marca;
  const energy = Array.isArray(energyRaw) && energyRaw.length ? energyRaw.join(', ') : (typeof energyRaw === 'string' ? energyRaw : '');
  if (energy) parts.push(`Energy: ${energy}`);
  return parts.length ? parts.join('. ') : '';
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

  const idea = (body.idea || body.director_brief || '').trim();
  const sceneElements = body.scene_elements || body.kling_elements || [];
  const productLockElements = body.product_lock_elements || [];
  const campaign = body.campaign || null;
  const audience = body.audience || null;
  const brandContext = body.brand_context || {};
  const cinematography = body.cinematography || {};
  const multiPrompt = !!body.multi_prompt;
  const sceneImageUrls = body.scene_image_urls || [];
  const firstSceneImageUrl = Array.isArray(sceneImageUrls) && sceneImageUrls.length
    ? sceneImageUrls.find((u) => typeof u === 'string' && u.startsWith('http'))
    : (sceneElements[0] && (sceneElements[0].element_input_urls || sceneElements[0].element_input_video_urls) && (sceneElements[0].element_input_urls || sceneElements[0].element_input_video_urls)[0]);

  const brandVoiceText = buildBrandVoiceText(brandContext);
  const brandToneText = buildBrandToneForPrompt(brandContext);
  const campaignAudienceText = buildCampaignAudienceText(campaign, audience);
  const sceneText = buildSceneText(sceneElements);
  const productLockText = buildProductLockText(productLockElements);
  const cineNarrative = buildCinematographyNarrative(cinematography);

  const model = (process.env.OPENAI_CINE_MODEL || 'gpt-4o-mini').trim();

  const systemDirector = `You are a cinematic video prompt director specialized in AI video generation (Kling).
Your job is NOT to describe images or the scene.
Your job is to direct the camera behavior and motion of the shot.
Focus on: camera movement, subject interaction, lighting behavior, cinematic lens, physical realism, continuous motion.
Never invent products or scenes that are not visible in the references.
Write prompts like a film director describing a shot. Do not explain anything. Output only the video prompt, in English.
If an image is provided: do NOT describe the scene itself (e.g. do not describe the kitchen or the product). Only describe the camera behavior and motion for the video.`;

  const systemMultiShot = `You are a cinematic video prompt director for AI video (Kling) in MULTI SHOT mode.
Your job is to output a mini storyboard: a sequence of shot prompts that direct camera behavior and motion.
Each prompt must focus on: camera movement, lighting, lens, motion—not describing the scene.
Output ONLY a valid JSON array of English strings, e.g. ["macro shot of finger pressing button...", "camera transitions into product hero...", "wide shot revealing environment..."].
No other text. Never invent elements not in the references.`;

  async function openaiChat(messages, maxTokens, temp = 0.5) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: temp })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'OpenAI error');
    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : '';
  }

  try {
    let shotDesign = '';
    if (idea) {
      const interpretSystem = `You interpret the user's creative idea into a short shot design for AI video (Kling).
Output only 2-4 bullet lines in English: camera move, lens/style, lighting, energy. No explanations.
Example: "Camera orbit around the product. Slow movement. Hero product commercial. Warm key light."`;
      const interpretUser = `User idea:\n${idea}`;
      shotDesign = await openaiChat(
        [{ role: 'system', content: interpretSystem }, { role: 'user', content: interpretUser }],
        200,
        0.4
      );
    }

    const userParts = [];
    if (firstSceneImageUrl) userParts.push('Reference image provided. Describe ONLY camera behavior and motion for the video—do not describe the scene or objects.');
    if (brandToneText) userParts.push('Brand and tone (keep visual coherence): ' + brandToneText);
    if (brandVoiceText) userParts.push('Brand voice context:\n' + brandVoiceText);
    if (campaignAudienceText) userParts.push('Campaign and audience:\n' + campaignAudienceText);
    if (productLockText) userParts.push(productLockText);
    if (sceneText && !firstSceneImageUrl) userParts.push(sceneText);
    if (sceneText && firstSceneImageUrl) userParts.push('Scene context: ' + sceneText.replace(/\n/g, ' '));
    if (cineNarrative) userParts.push(cineNarrative);
    if (shotDesign) userParts.push('Shot design (turn this into the final Kling prompt):\n' + shotDesign);
    if (idea && !shotDesign) userParts.push('User idea:\n' + idea);

    if (userParts.length === 0) userParts.push(multiPrompt ? 'Generate 2-3 shot prompts as a JSON array (mini storyboard).' : 'Generate one cinematic video prompt in English.');

    const userTextContent = userParts.join('\n\n---\n\n');
    const userMessageContent = firstSceneImageUrl
      ? [{ type: 'text', text: userTextContent }, { type: 'image_url', image_url: { url: firstSceneImageUrl } }]
      : userTextContent;

    const systemContent = multiPrompt ? systemMultiShot : systemDirector;
    const raw = await openaiChat(
      [{ role: 'system', content: systemContent }, { role: 'user', content: userMessageContent }],
      multiPrompt ? 900 : 500,
      0.5
    );

    if (!raw) {
      return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'OpenAI returned no content' }) };
    }

    if (multiPrompt) {
      let multiPrompts = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) multiPrompts = parsed.map((p) => (typeof p === 'string' ? p.trim() : String(p))).filter(Boolean);
      } catch (_) {
        const byLine = raw.split(/\n/).map((s) => s.replace(/^[\s\-*\d.]+\s*/, '').trim()).filter(Boolean);
        multiPrompts = byLine.length >= 2 ? byLine : [raw];
      }
      if (multiPrompts.length === 0) multiPrompts = [raw];
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ prompt: multiPrompts.join('\n\n'), multi_prompts: multiPrompts })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ prompt: raw })
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
