/**
 * Netlify Function: FORJAR el prompt de produccion desde la intencion.
 *
 * El primer acto de los dos. Lo que el humano escribe NO es el prompt: es la
 * intencion —lo que quiere, con sus variables de direccion dentro—. Este
 * endpoint la convierte en el prompt que de verdad se le manda al modelo, y el
 * resultado vuelve a la pantalla para que se vea y se corrija ANTES de gastar
 * un credito. Producir sin haber forjado esta bloqueado a proposito.
 *
 * Antes esto vivia escondido dentro de seedance-video-create: se cocinaba y se
 * disparaba en la misma llamada, asi que nadie llegaba a leer el prompt con el
 * que se produjo. Un video sale caro para descubrir despues que la redaccion no
 * decia lo que uno queria.
 *
 * Recibe el MISMO payload que la funcion de creacion —un solo shape para los
 * dos actos— y solo lee lo que necesita para redactar.
 */

const {
  requireAuth,
  getSupabaseEnv,
  assertOrgMember,
  ensureBalanceAtLeast,
  checkBodySize,
  validateExternalUrl
} = require('./lib/ai-shared');
const {
  buildBrandVisualText,
  buildCampaignAudienceText,
  buildAudioText,
  buildReferenceMap,
  forjarPrompt
} = require('./lib/seedance-prompt');

/**
 * Forjar quema OpenAI, no KIE: cuesta centavos. El pre-check existe para que
 * una organizacion sin saldo no pueda usar el endpoint como un proxy gratis de
 * OpenAI, no para cobrar el forjado (que no se cobra).
 */
const MIN_BALANCE_FORGE_CRED = Number(process.env.MIN_BALANCE_FORGE_CRED || 1);

const MEDIOS = new Set(['video', 'imagen']);

const ALLOWED_ORIGINS = new Set([
  'https://aismartcontent.io', 'https://www.aismartcontent.io',
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

function fail(event, status, error, extra = {}) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ error, ...extra }) };
}

const arr = (v) => (Array.isArray(v) ? v : []);

/** Cuenta URLs utilizables. Solo el numero importa: aqui no se manda ninguna. */
function contarUrls(list) {
  const vistas = new Set();
  for (const raw of arr(list)) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!url || vistas.has(url)) continue;
    if (!validateExternalUrl(url).ok) continue;
    vistas.add(url);
  }
  return vistas.size;
}

exports.handler = async (event) => {
  const c = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: c, body: '' };
  if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

  const tooBig = checkBodySize(event, 1024 * 1024);
  if (tooBig) return tooBig;

  const user = await requireAuth(event);
  if (!user) return fail(event, 401, 'No autorizado. Se requiere sesion activa.');

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return fail(event, 400, 'Body JSON invalido');
  }

  // `intencion` es lo que el humano escribio; `prompt` es como llega ya
  // expandida (las variables cambiadas por su frase). Se prefiere la expandida:
  // es la que lleva la direccion redactada.
  const intencion = String(body.prompt || body.intencion || '').trim();
  const organizationId = String(body.organization_id || '').trim();
  const medio = MEDIOS.has(String(body.medio || '').trim()) ? String(body.medio).trim() : 'video';

  if (!intencion) return fail(event, 400, 'Escribe primero la intencion: que quieres que pase.');
  if (!organizationId) return fail(event, 400, 'organization_id requerido');

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return fail(event, 500, e.message); }

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id });
  } catch (e) {
    return fail(event, e.statusCode || 403, e.message || 'No autorizado para esta organizacion');
  }

  const balance = await ensureBalanceAtLeast({ env, organizationId, minCredits: MIN_BALANCE_FORGE_CRED });
  if (!balance.ok) {
    return fail(event, 402, 'Creditos insuficientes', {
      balance: balance.balance,
      required: balance.required || MIN_BALANCE_FORGE_CRED,
      reason: balance.reason
    });
  }

  const lockCount = contarUrls(body.product_lock_urls);
  const totalImagenes = contarUrls([...arr(body.product_lock_urls), ...arr(body.reference_image_urls)]);

  try {
    const forjado = await forjarPrompt({
      apiKey: process.env.OPENAI_API_KEY,
      medio,
      intencion,
      brandText: buildBrandVisualText(body.brand_context),
      campaignAudienceText: buildCampaignAudienceText(body.campaign, body.audience),
      referenceMap: buildReferenceMap({
        total: totalImagenes,
        lockCount,
        frames: { first: !!body.first_frame_url, last: !!body.last_frame_url }
      }),
      audioText: medio === 'video' ? buildAudioText(body.generate_audio, body.audio_type) : ''
    });

    return {
      statusCode: 200,
      headers: c,
      body: JSON.stringify({
        prompt: forjado.prompt,
        openai_model: forjado.model,
        openai_input_tokens: forjado.inputTokens,
        openai_output_tokens: forjado.outputTokens
      })
    };
  } catch (err) {
    console.error('seedance-forge-prompt error:', err);
    return fail(event, err.httpStatus || 502, `No se pudo forjar el prompt: ${err.message}`);
  }
};
