/**
 * EL FORJADOR — de la intencion al prompt de produccion.
 *
 * Vive aparte porque el cocinado dejo de ser un paso escondido dentro de la
 * creacion de la tarea: ahora es un ACTO propio que el director dispara con el
 * boton «Prompt», ve el resultado, y solo entonces produce. Lo que se manda a
 * KIE es lo que se ve escrito, no una version secreta cocinada por detras.
 *
 * Aqui solo se arma el texto. Ni auth ni KIE ni cobros: eso es de quien llame.
 */

const PROMPT_MAX = 30000;
const OPENAI_MODEL = (process.env.OPENAI_CINE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

const arr = (v) => (Array.isArray(v) ? v : []);

/** ADN de marca: solo lo que orienta la imagen (en movimiento o fija). */
function buildBrandVisualText(brandContext) {
  const voice = brandContext?.brand_voice || {};
  const parts = [];
  if (voice.nicho_core) parts.push(`Category: ${String(voice.nicho_core).trim()}`);
  if (voice.arquetipo) parts.push(`Brand personality: ${String(voice.arquetipo).trim()}`);
  if (voice.propuesta_valor) parts.push(`Value proposition: ${String(voice.propuesta_valor).trim()}`);
  if (voice.visual_dna && typeof voice.visual_dna === 'object' && Object.keys(voice.visual_dna).length) {
    parts.push(`Visual DNA: ${JSON.stringify(voice.visual_dna)}`);
  }
  if (arr(voice.palabras_prohibidas).length) parts.push(`Avoid: ${arr(voice.palabras_prohibidas).join(', ')}`);
  return parts.length ? parts.join('. ') : '';
}

function buildCampaignAudienceText(campaign, audience) {
  const parts = [];
  if (campaign) parts.push(`Campaign intent: ${campaign}`);
  if (audience) parts.push(`Target audience: ${audience}`);
  return parts.length ? parts.join('. ') : '';
}

/**
 * El tipo de sonido que el usuario elige en la consola. Seedance NO tiene campo
 * para esto —solo `generate_audio` booleano—, asi que la unica forma de que la
 * eleccion importe es que viaje DENTRO del prompt. Sin esto, los cuatro tiles
 * de Audio & Atmosfera eran decoracion: se marcaban y no cambiaban nada.
 */
const AUDIO_TYPE_PROMPT = {
  ambient: 'Audio: diegetic sound only — what the scene itself would sound like. No music.',
  music: 'Audio: a music track carries the sequence. No dialogue.',
  voice: 'Audio: a spoken voice leads the sequence.',
  silence: 'Audio: silence, or near-silence, as a deliberate choice.'
};

function buildAudioText(generateAudio, audioType) {
  if (generateAudio === false) return 'Do not generate audio for this sequence.';
  const clave = typeof audioType === 'string' ? audioType.trim().toLowerCase() : '';
  return AUDIO_TYPE_PROMPT[clave] || '';
}

/**
 * Explica al cocinador como se DIRIGEN las imagenes de referencia. Sin esto,
 * las referencias son decorado: el modelo las mira pero el prompt no dice cual
 * es cual, y un bloqueo de producto se queda en un deseo.
 *
 * `@ImageN` es la sintaxis de la propia doc de Seedance ("Reference @Image1
 * @Image2 for the character, @Image3 @Image4 for the scene").
 */
function buildReferenceMap({ total, lockCount, frames }) {
  const lineas = [];
  if (total > 0) {
    const nombres = Array.from({ length: total }, (_, i) => `@Image${i + 1}`).join(' ');
    lineas.push(`${total} reference image(s) are attached and are addressable inside the prompt as ${nombres}. Refer to them explicitly where they matter (e.g. "@Image1 is the product").`);
    if (lockCount > 0) {
      const bloqueadas = Array.from({ length: lockCount }, (_, i) => `@Image${i + 1}`).join(' ');
      lineas.push(`${bloqueadas} are LOCKED brand assets: reproduce them exactly — same shape, label, colours and proportions. Never redesign them.`);
    }
  }
  if (frames?.first && frames?.last) {
    lineas.push('A first frame and a last frame are provided: the sequence must start on the first and land on the last. Describe the motion that connects them.');
  } else if (frames?.first) {
    lineas.push('A first frame is provided: the sequence starts there. Describe where it goes from that image.');
  } else if (frames?.last) {
    lineas.push('A last frame is provided: the sequence must land on that image.');
  }
  return lineas.join(' ');
}

const SYSTEM = {
  video: [
    'You are a commercial film director writing prompts for an AI video model (Seedance).',
    'Output ONE final video prompt in English, under 300 words, no explanations, no bullet lists, no preamble.',
    'Direct the shot: subject, action, camera behaviour, lighting, pacing. Write what happens, in order.',
    // El brief ya trae direccion explicita (movimiento, lente, luz): es una
    // decision tomada, no una sugerencia. Dejar que el modelo la reescriba
    // vaciaria el panel de Cinematografia de sentido.
    'The brief may already contain explicit cinematographic direction (camera movement, lens, lighting, colour grade, pacing). Preserve every one of those decisions verbatim; never substitute or omit them.',
    'If the brief lists @ImageN references, keep those tokens exactly as written — they address the attached images.',
    'Never invent brands, logos or products that are not stated in the brief or visible in the references.',
    'If an audio instruction is given, honour it in one short sentence at the end.'
  ].join(' '),
  imagen: [
    'You are an advertising still-photography director writing prompts for an AI image model.',
    'Output ONE final image prompt in English, under 220 words, no explanations, no bullet lists, no preamble.',
    'Describe the frame as a photograph: subject, composition, lens behaviour, lighting, surface, colour.',
    'The brief may already contain explicit photographic direction (focal length, aperture, lighting setup, colour grade). Preserve every one of those decisions verbatim; never substitute or omit them.',
    'Never invent brands, logos or products that are not stated in the brief or visible in the references.'
  ].join(' ')
};

/**
 * Cocina el prompt final. Devuelve tambien los tokens porque kie-task-finalize
 * cobra el costo REAL (KIE + OpenAI + markup) y sin estos numeros el usuario
 * pagaria un estimado.
 *
 * Sin OPENAI_API_KEY se devuelve el brief armado tal cual: se pierde el pulido,
 * no la pagina.
 */
async function forjarPrompt({ apiKey, medio, intencion, brandText, campaignAudienceText, referenceMap, audioText }) {
  const bloques = [
    // La intencion ya trae dentro la direccion, redactada, en el sitio donde el
    // director la escribio (js/studio/direccion.js la expande antes de enviar).
    intencion ? `Creative brief from the director:\n${intencion}` : '',
    brandText ? `Brand context: ${brandText}` : '',
    campaignAudienceText,
    referenceMap,
    audioText
  ].filter(Boolean);

  const fallback = bloques.join('\n\n').slice(0, PROMPT_MAX);
  if (!apiKey) return { prompt: fallback, inputTokens: 0, outputTokens: 0, model: null };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.5,
      max_tokens: medio === 'video' ? 700 : 500,
      messages: [
        { role: 'system', content: SYSTEM[medio] || SYSTEM.video },
        { role: 'user', content: bloques.join('\n\n---\n\n') || 'Generate one commercial prompt.' }
      ]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw Object.assign(new Error(data?.error?.message || `OpenAI HTTP ${res.status}`), { httpStatus: 502 });
  }
  const refined = data?.choices?.[0]?.message?.content?.trim();
  const usage = data?.usage || {};
  if (!refined) throw Object.assign(new Error('OpenAI no devolvio un prompt valido'), { httpStatus: 502 });
  return {
    prompt: refined.slice(0, PROMPT_MAX),
    inputTokens: Number(usage.prompt_tokens || 0),
    outputTokens: Number(usage.completion_tokens || 0),
    model: OPENAI_MODEL
  };
}

module.exports = {
  PROMPT_MAX,
  OPENAI_MODEL,
  buildBrandVisualText,
  buildCampaignAudienceText,
  buildAudioText,
  buildReferenceMap,
  forjarPrompt
};
