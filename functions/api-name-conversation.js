/**
 * Netlify Function: nombra una conversacion de Vera usando OpenAI (gpt-4o-mini)
 * a partir del PRIMER mensaje del usuario. Reemplaza el placeholder
 * "Nueva conversacion" / "Sesion de voz" por un titulo corto y descriptivo,
 * evitando que toda la lista del historial diga "Nueva conversacion".
 *
 * Idempotente: si la conversacion ya tiene un titulo personalizado, no lo toca.
 * Costo ~ $0.00002 por titulo (gpt-4o-mini, 24 tokens out). No cobra creditos.
 */
const {
  corsHeaders, getSupabaseEnv, requireAuth, supabaseRest, assertOrgMember, checkBodySize
} = require('./lib/ai-shared');

const MODEL = 'gpt-4o-mini';

// Titulos que se consideran placeholder y SI pueden reemplazarse.
const PLACEHOLDER_TITLES = new Set([
  '', 'nueva conversacion', 'nueva conversación', 'sesion de voz', 'sesión de voz',
  'conversacion', 'conversación', 'new conversation', 'sin titulo', 'sin título'
]);

function fail(event, status, message, extra = {}) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ error: message, ...extra }) };
}
function ok(event, data) {
  return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify(data) };
}

function cleanTitle(raw) {
  let t = String(raw || '').trim();
  // Quita comillas/guillemets envolventes y puntuacion final
  t = t.replace(/^["'«»“”`]+/, '').replace(/["'«»“”`.\s]+$/g, '').trim();
  t = t.replace(/\s+/g, ' ');
  if (t.length > 64) t = t.slice(0, 64).trim();
  return t;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
    if (event.httpMethod !== 'POST') return fail(event, 405, 'Metodo no permitido');

    const tooBig = checkBodySize(event, 8 * 1024);
    if (tooBig) return tooBig;

    const user = await requireAuth(event);
    if (!user) return fail(event, 401, 'No autorizado');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return fail(event, 500, 'OPENAI_API_KEY no configurada');

    let body = {};
    try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {}; }
    catch (_) { return fail(event, 400, 'Body JSON invalido'); }

    const conversationId = String(body.conversation_id || '').trim();
    const organizationId = String(body.organization_id || '').trim();
    if (!conversationId || !organizationId) return fail(event, 400, 'conversation_id y organization_id requeridos');

    let env;
    try { env = getSupabaseEnv(); } catch (e) { return fail(event, 500, e.message); }

    try { await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId, userId: user.id }); }
    catch (e) { return fail(event, e.statusCode || 403, e.message); }

    // La conversacion debe pertenecer a la org + usuario.
    const convs = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'ai_conversations',
      searchParams: { select: 'id,title,user_id,organization_id', id: `eq.${conversationId}`, limit: '1' }
    });
    const conv = convs && convs[0];
    if (!conv || conv.organization_id !== organizationId || conv.user_id !== user.id) {
      return fail(event, 404, 'Conversacion no encontrada');
    }

    // Idempotente: solo renombramos placeholders, nunca un titulo ya personalizado.
    if (!PLACEHOLDER_TITLES.has(String(conv.title || '').trim().toLowerCase())) {
      return ok(event, { title: conv.title, skipped: 'already_named' });
    }

    // Primer mensaje del usuario en la conversacion.
    const msgs = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'ai_messages',
      searchParams: {
        select: 'content,role,created_at',
        conversation_id: `eq.${conversationId}`,
        role: 'eq.user',
        order: 'created_at.asc',
        limit: '1'
      }
    });
    const first = (msgs && msgs[0] && msgs[0].content) ? String(msgs[0].content) : '';
    if (!first.trim()) return fail(event, 422, 'Sin mensaje de usuario para nombrar');

    const prompt = first.length > 800 ? first.slice(0, 800) : first;

    // OpenAI: titulo corto en el idioma del mensaje.
    let openaiData;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: 'system',
              content: 'Genera un titulo corto (maximo 6 palabras) que resuma el tema del mensaje del usuario, para una lista de conversaciones tipo ChatGPT. Responde SOLO con el titulo: sin comillas, sin punto final, en el mismo idioma del mensaje, sin prefijos como "Conversacion sobre" ni "Pregunta de".'
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: 24,
          temperature: 0.3
        })
      });
      openaiData = await res.json();
      if (!res.ok || openaiData.error) {
        const msg = openaiData.error?.message || `OpenAI HTTP ${res.status}`;
        return fail(event, res.status >= 400 ? res.status : 500, msg);
      }
    } catch (err) {
      return fail(event, 500, `Error llamando a OpenAI: ${err.message}`);
    }

    const title = cleanTitle(openaiData.choices?.[0]?.message?.content || '');
    if (!title) return fail(event, 500, 'OpenAI no devolvio titulo');

    // Persistir el titulo.
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: 'ai_conversations',
      method: 'PATCH',
      searchParams: { id: `eq.${conversationId}` },
      body: { title }
    });

    return ok(event, { title });
  } catch (err) {
    console.error('[name-conversation] Unhandled:', err?.stack || err);
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Error interno', detail: err?.message || String(err) }) };
  }
};
