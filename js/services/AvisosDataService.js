/**
 * AvisosDataService — los AVISOS de marca sobre la base nueva (ADR-0054).
 * Única puerta a la base para la campana (Avisos.js) y para Organización › Avisos.
 *
 * Contrato: Git-AISC-DB docs/contratos/avisos.md (migración 20260916170000):
 *   · Campana: V public.unread_alerts(organization_id, type_code, family, severity,
 *     total, delivered, read, acted, oldest, newest) — solo vivos de tipos activos;
 *     es un AGREGADO por tipo: el contador es la suma de `total`.
 *   · Lista: T public.alerts(id, organization_id, type_code, user_id, title, body,
 *     link, metadata, huella, created_at, delivered_at, read_at, acted_at, resolved_at)
 *     con RLS alerts_ver; se filtra resolved_at is null. `metadata.veces` cuando el
 *     hecho se repitió mientras el aviso seguía vivo.
 *   · Taxonomía: T public.alert_types(code, name, description, severity, family,
 *     max_shown, is_active, default_channels alert_channel[], params text[]).
 *   · Marcar uno: PATCH alerts {read_at} (CHECK alerts_secuencia: leído exige
 *     delivered_at; actuado exige read_at). Marcar todo: R marcar_avisos_leidos(p_org,
 *     p_hasta) con p_hasta = el `newest` que la persona vio.
 *   · Preferencias: T public.alert_preferences(organization_id, user_id, type_code,
 *     channels alert_channel[], is_muted) — por persona y tipo (RLS propio user_id).
 *     Sin fila = default_channels del tipo. «Familia» = N filas.
 *   · Canales: in_app, email, push, whatsapp, webhook, email_digest.
 *
 * Regla del corte: ningún `.from()` fuera de js/services.
 */
(function () {
  'use strict';

  const CANALES = Object.freeze(['in_app', 'email', 'email_digest', 'push', 'whatsapp', 'webhook']);
  const CANALES_EDITABLES = Object.freeze(['in_app', 'email', 'email_digest']);

  /* ── Mapeos puros (test/avisos-datos.test.js) ───────────────────────────── */

  /** Fila de alerts + su tipo → el aviso que la campana pinta. */
  function avisoAV1(fila, tipos = {}) {
    const t = tipos[fila.type_code] || null;
    const md = (fila.metadata && typeof fila.metadata === 'object') ? fila.metadata : {};
    return {
      id: fila.id,
      type: fila.type_code,
      family: t?.family || String(fila.type_code || '').split('.')[0] || 'ops',
      severity: t?.severity || md.severity || 'info',
      title: fila.title || t?.name || fila.type_code,
      body: fila.body || '',
      link: fila.link || null,
      params: md,
      veces: Number(md.veces) || 1,
      ultima_vez: md.ultima_vez || null,
      personal: !!fila.user_id,
      is_read: !!fila.read_at,
      is_delivered: !!fila.delivered_at,
      acted: !!fila.acted_at,
      created_at: fila.created_at,
      read_at: fila.read_at || null,
      // Lo que el resolutor de la consola necesita para traducir por tipo.
      tipo: t ? { code: t.code, name: t.name, severity: t.severity, family: t.family, params: t.params || [], default_channels: t.default_channels || [] } : null,
    };
  }

  /** unread_alerts (agregado por tipo) → contador y el `newest` para «marcar todo». */
  function resumenNoLeidos(filas) {
    let total = 0; let newest = null;
    const porFamilia = {};
    (filas || []).forEach((f) => {
      const n = Number(f.total) || 0;
      total += n;
      porFamilia[f.family || 'ops'] = (porFamilia[f.family || 'ops'] || 0) + n;
      if (f.newest && (!newest || f.newest > newest)) newest = f.newest;
    });
    return { total, newest, porFamilia };
  }

  /** Canales efectivos de un tipo para una persona: su preferencia o el defecto del tipo. */
  function canalesEfectivos(tipo, preferencia) {
    if (preferencia?.is_muted) return [];
    if (Array.isArray(preferencia?.channels)) return preferencia.channels;
    return Array.isArray(tipo?.default_channels) ? tipo.default_channels : ['in_app'];
  }

  /** El parche de «marcar»: leído exige entregado; actuado exige leído (CHECK de la base). */
  function parcheDeMarca(estado, aviso, ahora = new Date().toISOString()) {
    if (estado === 'unread') return { read_at: null, acted_at: null };
    const p = {};
    if (!aviso?.is_delivered) p.delivered_at = ahora;
    p.read_at = aviso?.read_at || ahora;
    if (estado === 'acted' || estado === 'done') p.acted_at = ahora;
    return p;
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  function aviso(nombre, r) { if (r?.error) console.warn(`[avisos] ${nombre}:`, r.error.code, r.error.message); }

  let tiposCache = null; let tiposTs = 0;
  /** Taxonomía (activos e inactivos) por code; se cachea 10 min. */
  async function tipos({ fresco = false } = {}) {
    if (!fresco && tiposCache && Date.now() - tiposTs < 10 * 60 * 1000) return tiposCache;
    const sb = await cliente();
    if (!sb) return tiposCache || {};
    // Hasta la 170000 no existen default_channels/params: se reintenta con las columnas viejas.
    let r = await sb.from('alert_types').select('code, name, description, severity, family, max_shown, is_active, default_channels, params');
    if (r.error && r.error.code === '42703') r = await sb.from('alert_types').select('code, name, description, severity, family, max_shown, is_active');
    aviso('alert_types', r);
    if (r.error) return tiposCache || {};
    tiposCache = Object.fromEntries((r.data || []).map((t) => [t.code, t]));
    tiposTs = Date.now();
    return tiposCache;
  }

  /** {total, newest, porFamilia} de los avisos vivos sin leer de la marca. */
  async function contador(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return { total: 0, newest: null, porFamilia: {} };
    const r = await sb.from('unread_alerts').select('type_code, family, severity, total, read, acted, oldest, newest').eq('organization_id', orgId);
    aviso('unread_alerts', r);
    return resumenNoLeidos(r.data || []);
  }

  /**
   * Avisos de la marca (vivos = resolved_at nulo). `estado`: 'unread' | 'read' | 'all'.
   * Paginado por created_at desc; `antesDe` para pedir la página siguiente.
   */
  async function lista(orgId, { estado = 'all', limite = 50, antesDe = null } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const consulta = (conNuevas) => {
      let q = sb.from('alerts')
        .select(conNuevas
          ? 'id, organization_id, type_code, user_id, title, body, link, metadata, huella, created_at, delivered_at, read_at, acted_at, resolved_at'
          : 'id, organization_id, type_code, user_id, title, body, link, metadata, created_at, delivered_at, read_at, acted_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }).limit(limite);
      if (conNuevas) q = q.is('resolved_at', null);
      if (estado === 'unread') q = q.is('read_at', null);
      else if (estado === 'read') q = q.not('read_at', 'is', null);
      if (antesDe) q = q.lt('created_at', antesDe);
      return q;
    };
    let [t, r] = await Promise.all([tipos(), consulta(true)]);
    // Hasta la 170000 no existen huella/resolved_at: se reintenta sin ellas.
    if (r.error && r.error.code === '42703') r = await consulta(false);
    aviso('alerts', r);
    // Solo tipos activos (o sin taxonomía conocida): un tipo desactivado (legacy.*) no se muestra.
    return (r.data || []).filter((f) => !t[f.type_code] || t[f.type_code].is_active !== false).map((f) => avisoAV1(f, t));
  }

  /** Marca un aviso: 'read' | 'acted' | 'unread'. Devuelve la fila guardada o lanza. */
  async function marcar(avisoV1, estado = 'read') {
    const sb = await cliente();
    if (!sb || !avisoV1?.id) return null;
    const { data, error } = await sb.from('alerts').update(parcheDeMarca(estado, avisoV1)).eq('id', avisoV1.id).select('id, read_at, acted_at, delivered_at').maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('El aviso no se marcó (¿sin permiso ver_marca?).'), { code: 'sin_fila' });
    return data;
  }

  /** «Marcar todo como leído» hasta el `newest` que la persona vio. Devuelve cuántos. */
  async function marcarTodo(orgId, hasta = null) {
    const sb = await cliente();
    if (!sb || !orgId) return 0;
    const args = { p_org: orgId };
    if (hasta) args.p_hasta = hasta;
    const { data, error } = await sb.rpc('marcar_avisos_leidos', args);
    if (error) throw error;
    return Number(data) || 0;
  }

  /** Preferencias de la persona en la marca, por type_code. */
  async function preferencias(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return {};
    const r = await sb.from('alert_preferences').select('organization_id, user_id, type_code, channels, is_muted, updated_at').eq('organization_id', orgId);
    aviso('alert_preferences', r);
    return Object.fromEntries((r.data || []).map((p) => [p.type_code, p]));
  }

  /** Guarda (upsert) la preferencia de UN tipo para la persona. `channels` null = volver al defecto. */
  async function guardarPreferencia(orgId, userId, typeCode, { channels = null, is_muted = false } = {}) {
    const sb = await cliente();
    if (!sb || !orgId || !userId || !typeCode) return null;
    if (channels === null && !is_muted) {
      const { error } = await sb.from('alert_preferences').delete().eq('organization_id', orgId).eq('user_id', userId).eq('type_code', typeCode);
      if (error) throw error;
      return null;
    }
    const fila = { organization_id: orgId, user_id: userId, type_code: typeCode, channels: Array.isArray(channels) ? channels : [], is_muted: !!is_muted };
    const { data, error } = await sb.from('alert_preferences').upsert(fila, { onConflict: 'organization_id,user_id,type_code' }).select('type_code, channels, is_muted').maybeSingle();
    if (error) throw error;
    return data;
  }

  window.AvisosDatos = Object.freeze({
    CANALES, CANALES_EDITABLES,
    tipos, contador, lista, marcar, marcarTodo, preferencias, guardarPreferencia,
    mapeo: Object.freeze({ avisoAV1, resumenNoLeidos, canalesEfectivos, parcheDeMarca }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
