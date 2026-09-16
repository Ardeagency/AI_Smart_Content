/**
 * VeraDataService — VERA (conversaciones, mensajes, turno, agentes) sobre la base
 * nueva y el borde /v1 (corte ADR-0052). Única puerta a la base para VeraView.
 *
 * Contrato: Git-AISC-DB docs/contratos/vera.md (a45a961, medido 16/09 15:10 UTC):
 *   · TODO Vera para la persona va por el permiso `conversar_con_agente`.
 *   · T ai.agents(id, organization_id, name, autonomy read_only|partial|total, model,
 *     avatar_url, is_active, template_code, template_version).
 *   · T ai.conversations(id, organization_id, market_id, agent_id, user_id, title,
 *     last_message_at, archived_at, created_at, updated_at): crear = POST por PostgREST
 *     (mandar user_id hasta que la 180000 ponga el default auth.uid()); listar por org +
 *     archived_at nulo + last_message_at desc; archivar = PATCH; borrar = DELETE (cascada).
 *   · T ai.messages(id, conversation_id, organization_id, role user|assistant|system|tool,
 *     content, subagent_id, tool_name, tool_payload, tokens_in, tokens_out, cost_usd,
 *     created_at): solo SELECT/INSERT para la persona; orden created_at.
 *   · Hablar: B POST /v1/conversaciones/:id/mensajes {texto, id_cliente} →
 *     {mensaje_id, turno_id, estado:'encolado'}; el borde guarda el `user` y encola el
 *     turno. La respuesta llega como FILAS `assistant` (también «sin créditos», «tope»,
 *     «cancelado»). Realtime `postgres_changes` sobre ai.messages (schema ai, filtro
 *     conversation_id) lo publica la 180000: hasta entonces se SONDEA. No hay streaming.
 *   · Cancelar: B POST /v1/turnos/:turno_id/cancelar → {cancelado}.
 *   · No existen: vera_artifacts, canvas_strategies, api-name-conversation (el título lo
 *     pone la consola con las primeras palabras), api-widget-action, task events.
 *
 * Regla del corte: ningún `.from()` fuera de js/services.
 */
(function () {
  'use strict';

  /* ── Mapeos puros (test/vera-datos.test.js) ─────────────────────────────── */

  function conversacionAV1(fila) {
    return {
      id: fila.id,
      organization_id: fila.organization_id,
      agent_id: fila.agent_id || null,
      market_id: fila.market_id || null,
      user_id: fila.user_id || null,
      title: fila.title || null,
      updated_at: fila.last_message_at || fila.updated_at || fila.created_at,
      last_message_at: fila.last_message_at || null,
      created_at: fila.created_at,
      metadata: {},
      // v1 pintaba el rail solo con conversaciones con mensajes: last_message_at lo dice.
      ai_messages: [{ count: fila.last_message_at ? 1 : 0 }],
    };
  }

  /** ai.messages → el mensaje que VeraView pinta (role user|assistant|error; tool/system no se pintan). */
  function mensajeAV1(fila) {
    return {
      id: fila.id,
      conversation_id: fila.conversation_id,
      role: fila.role === 'assistant' || fila.role === 'user' ? fila.role : fila.role,
      content: fila.content || '',
      created_at: fila.created_at,
      metadata: { tool_name: fila.tool_name || null, tokens_in: fila.tokens_in ?? null, tokens_out: fila.tokens_out ?? null, cost_usd: fila.cost_usd ?? null, subagent_id: fila.subagent_id || null },
    };
  }

  /** Título automático: las primeras palabras del primer mensaje (sin OpenAI). */
  function tituloDesde(texto, max = 48) {
    const limpio = String(texto || '').replace(/\s+/g, ' ').replace(/\[[^\]]*\]/g, '').trim();
    if (!limpio) return null;
    if (limpio.length <= max) return limpio;
    const corte = limpio.slice(0, max);
    return `${corte.slice(0, Math.max(20, corte.lastIndexOf(' ')))}…`;
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  function api() { return (typeof window !== 'undefined' && window.apiV2?.api) || null; }
  const conCode = (e) => { if (e && e.codigo && !e.code) e.code = e.codigo; return e; };
  function aviso(nombre, r) { if (r?.error && r.error.code !== 'PGRST116') console.warn(`[vera] ${nombre}:`, r.error.code, r.error.message); }
  const SEL_CONV = 'id, organization_id, market_id, agent_id, user_id, title, last_message_at, archived_at, created_at, updated_at';
  const SEL_MSG = 'id, conversation_id, organization_id, role, content, subagent_id, tool_name, tokens_in, tokens_out, cost_usd, created_at';

  async function agentes(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await sb.schema('ai').from('agents').select('id, organization_id, name, autonomy, model, avatar_url, is_active, template_code, template_version').eq('organization_id', orgId).eq('is_active', true).order('created_at', { ascending: true });
    aviso('ai.agents', r);
    return r.data || [];
  }

  /** La Vera de la marca (la primera activa). */
  async function agente(orgId) {
    const lista = await agentes(orgId);
    return lista[0] || null;
  }

  /** Conversaciones de la marca (las mías si `mias`), forma v1. */
  async function conversaciones(orgId, { mias = true, userId = null, limite = 60 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    let q = sb.schema('ai').from('conversations').select(SEL_CONV).eq('organization_id', orgId).is('archived_at', null).order('last_message_at', { ascending: false, nullsFirst: false }).limit(limite);
    if (mias && userId) q = q.eq('user_id', userId);
    const r = await q;
    aviso('ai.conversations', r);
    return (r.data || []).map(conversacionAV1);
  }

  async function crearConversacion(orgId, { agentId = null, userId = null, title = null, marketId = null } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return null;
    const ag = agentId || (await agente(orgId))?.id;
    if (!ag) throw Object.assign(new Error('Esta marca no tiene una Vera activa.'), { code: 'sin_agente' });
    const fila = { organization_id: orgId, agent_id: ag, title: title || null };
    if (userId) fila.user_id = userId;
    if (marketId) fila.market_id = marketId;
    const { data, error } = await sb.schema('ai').from('conversations').insert(fila).select(SEL_CONV).single();
    if (error) throw error;
    return conversacionAV1(data);
  }

  async function renombrar(convId, title) {
    const sb = await cliente();
    if (!sb || !convId) return null;
    const { data, error } = await sb.schema('ai').from('conversations').update({ title: title || null }).eq('id', convId).select(SEL_CONV).maybeSingle();
    if (error) throw error;
    return data ? conversacionAV1(data) : null;
  }

  async function archivar(convId) {
    const sb = await cliente();
    if (!sb || !convId) return false;
    const { data, error } = await sb.schema('ai').from('conversations').update({ archived_at: new Date().toISOString() }).eq('id', convId).select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }

  async function borrar(convId) {
    const sb = await cliente();
    if (!sb || !convId) return false;
    const { data, error } = await sb.schema('ai').from('conversations').delete().eq('id', convId).select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }

  /** Mensajes de una conversación (user y assistant), en orden. */
  async function mensajes(convId, { limite = 500 } = {}) {
    const sb = await cliente();
    if (!sb || !convId) return [];
    const r = await sb.schema('ai').from('messages').select(SEL_MSG).eq('conversation_id', convId).in('role', ['user', 'assistant']).order('created_at', { ascending: true }).limit(limite);
    aviso('ai.messages', r);
    return (r.data || []).map(mensajeAV1);
  }

  /** Respuestas nuevas (assistant) que la persona aún no vio. */
  async function respuestasNuevas(convId, vistos = new Set(), { limite = 5 } = {}) {
    const sb = await cliente();
    if (!sb || !convId) return [];
    const r = await sb.schema('ai').from('messages').select(SEL_MSG).eq('conversation_id', convId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(limite);
    aviso('ai.messages nuevas', r);
    return (r.data || []).slice().reverse().filter((m) => m.id && !vistos.has(m.id)).map(mensajeAV1);
  }

  /** Manda el mensaje por el borde: {mensaje_id, turno_id, estado}. `idCliente` hace idempotente el doble toque. */
  async function enviar(convId, texto, idCliente = null) {
    const a = api();
    if (!a) throw Object.assign(new Error('El borde no está configurado (AISC_API_URL): Vera aún no responde en esta consola.'), { code: 'sin_api' });
    try { return await a.enviarMensaje(convId, texto, idCliente || undefined); } catch (e) { throw conCode(e); }
  }

  async function cancelarTurno(turnoId) {
    const a = api();
    if (!a || !turnoId) return { cancelado: false };
    try { return await a.cancelarTurno(turnoId); } catch (e) { throw conCode(e); }
  }

  /**
   * Suscripción Realtime a las respuestas de una conversación (schema ai). Devuelve
   * la función para cerrarla. Hasta la 180000 la publicación está vacía: no llega
   * nada y el sondeo sigue siendo la red.
   */
  async function escuchar(convId, alLlegar) {
    const sb = await cliente();
    if (!sb || !convId || typeof sb.channel !== 'function') return () => {};
    const canal = sb.channel(`vera:${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'ai', table: 'messages', filter: `conversation_id=eq.${convId}` }, (p) => { try { if (p?.new) alLlegar(mensajeAV1(p.new)); } catch (_) { /* pintar no tumba el canal */ } })
      .subscribe();
    return () => { try { sb.removeChannel(canal); } catch (_) { /* nada */ } };
  }

  /** El universo del omnibox (@menciones): productos, servicios, escenarios, personajes y flujos de la marca. */
  async function universo(orgId) {
    if (!orgId) return {};
    const C = window.CatalogoDatos;
    const S = window.StudioDatos;
    const sb = await cliente();
    const [productos, servicios, escenarios, personajes, flujos] = await Promise.all([
      C ? C.elementos(orgId, 'product') : [],
      C ? C.elementos(orgId, 'service') : [],
      C ? C.elementos(orgId, 'scenario') : [],
      C ? C.elementos(orgId, 'character') : [],
      sb ? sb.schema('flows').from('vista_org').select('flow_id, nombre, slug, tipo').eq('organization_id', orgId) : { data: [] },
    ]);
    void S;
    return {
      product: productos.map((p) => ({ id: p.id, name: p.nombre_producto, meta: p.tipo_producto || '' })),
      service: servicios.map((s) => ({ id: s.id, name: s.nombre_servicio, meta: s.tipo_servicio || '' })),
      place: escenarios.map((l) => ({ id: l.id, name: l.nombre_lugar, meta: l.city || '' })),
      character: personajes.map((c) => ({ id: c.id, name: c.nombre_personaje, meta: c.tipo_personaje || '' })),
      flow: (flujos.data || []).map((f) => ({ id: f.flow_id, name: f.nombre || f.slug, meta: f.tipo || '' })),
      // Campañas, audiencias y estrategias viven en marketing.* (D3): hoy no se mencionan.
      campaign: [], audience: [], strategy: [], brand: [],
    };
  }

  window.VeraDatos = Object.freeze({
    agentes, agente, conversaciones, crearConversacion, renombrar, archivar, borrar, mensajes, respuestasNuevas, enviar, cancelarTurno, escuchar, universo,
    mapeo: Object.freeze({ conversacionAV1, mensajeAV1, tituloDesde }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
