/**
 * Netlify Function: genera un prompt cinematográfico para Kling usando OpenAI.
 * Requiere OPENAI_API_KEY en variables de entorno.
 *
 * El input de texto del usuario (idea) NUNCA es el prompt final: es la idea escrita. La IA genera el prompt
 * adaptado al lenguaje comunicacional/publicitario de la marca.
 *
 * POST body:
 *   idea / director_brief: string — idea escrita del usuario (no el prompt final)
 *   scene_elements: Array — escena a producir (producciones adjuntas; referencias visuales de la escena)
 *   product_lock_elements: Array — imágenes de producto; el video NO debe cambiar el producto
 *   campaign: object — campaña seleccionada (enfoque: ej. campaña navidad)
 *   audience: object — audiencia seleccionada (enfoque: ej. audiencia familiar)
 *   brand_context: { brand_voice?, brand_profiles?, entities?, products?, audiences?, campaigns? }
 *   cinematography: { shotType, lens, framing, ... }
 *
 * Respuesta: { prompt: string } o { multi_prompts: string[] }
 */

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  const idea = (body.idea || body.director_brief || '').trim();
  const sceneElements = body.scene_elements || body.kling_elements || [];
  const productLockElements = body.product_lock_elements || [];
  const campaign = body.campaign || null;
  const audience = body.audience || null;
  const brandContext = body.brand_context || {};
  const cinematography = body.cinematography || {};
  const multiPrompt = !!body.multi_prompt;

  const brandVoiceText = buildBrandVoiceText(brandContext);
  const campaignAudienceText = buildCampaignAudienceText(campaign, audience);
  const sceneText = buildSceneText(sceneElements);
  const productLockText = buildProductLockText(productLockElements);
  const cineText = buildCinematographyText(cinematography);

  const systemContent = multiPrompt
    ? `Eres un experto en redactar prompts para generación de video con IA (Kling), en modo MULTI SHOT.
Adapta el lenguaje del prompt al lenguaje comunicacional y publicitario de la marca (tono, estilo, palabras clave) usando los datos de voz de marca que te proporcionan.
Tu tarea es devolver un JSON válido con un array de 2 a 4 prompts cinematográficos, uno por shot/escena.
Cada prompt debe ser: descriptivo, visual, en inglés (salvo que la marca indique otro idioma), y coherente con el anterior.
Formato de respuesta ÚNICAMENTE: ["prompt del shot 1", "prompt del shot 2", ...]
No incluyas explicaciones, títulos ni texto fuera del JSON.`
    : `Eres un experto en redactar prompts para generación de video con IA (Kling/Sora).
Tu tarea es devolver UN ÚNICO prompt cinematográfico listo para pegar en Kling.
Adapta el prompt al lenguaje comunicacional y publicitario de la marca: usa el tono, estilo de escritura, palabras clave y restricciones de la voz de marca que te proporcionan.
El prompt debe ser descriptivo, visual, en inglés (salvo que la marca o el usuario indiquen otro idioma), e integrar de forma natural: la idea del usuario, la escena a producir, la cinematografía indicada y la restricción de no alterar el producto cuando aplique.
Responde ÚNICAMENTE con el texto del prompt, sin explicaciones, títulos ni prefijos.`;

  const userParts = [];
  if (brandVoiceText) userParts.push('VOZ DE MARCA (adaptar el prompt a este lenguaje)\n' + brandVoiceText);
  if (campaignAudienceText) userParts.push('Campaña y audiencia (enfoque de la producción)\n' + campaignAudienceText);
  if (productLockText) userParts.push(productLockText);
  if (sceneText) userParts.push(sceneText);
  if (cineText) userParts.push(cineText);
  if (idea) userParts.push('IDEA ESCRITA DEL USUARIO (no es el prompt final; genera el prompt a partir de esta idea)\n' + idea);

  if (userParts.length === 0) {
    userParts.push(multiPrompt
      ? 'Genera 2 o 3 prompts cinematográficos en secuencia para un video comercial (array JSON).'
      : 'Genera un prompt cinematográfico corto y atractivo para un video comercial genérico.');
  } else if (multiPrompt) {
    userParts.push('Genera 2 a 4 prompts (shots) en secuencia basados en lo anterior. Responde solo con un array JSON de strings.');
  }

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
        max_tokens: multiPrompt ? 800 : 400,
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

    const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
      ? String(data.choices[0].message.content).trim()
      : '';
    if (!raw) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'OpenAI no devolvió texto' })
      };
    }

    if (multiPrompt) {
      let multiPrompts = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          multiPrompts = parsed.map((p) => (typeof p === 'string' ? p.trim() : String(p))).filter(Boolean);
        }
      } catch (_) {
        const byLine = raw.split(/\n/).map((s) => s.replace(/^[\s\-*\d.]+\s*/, '').trim()).filter(Boolean);
        if (byLine.length >= 2) multiPrompts = byLine;
        else multiPrompts = [raw];
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
