/**
 * ContextoDataService — el ARRANQUE de la consola sobre la base nueva
 * (aqblperqrcwumiztmjnw, ADR-0052): UNA llamada, `public.mi_contexto()`, y con
 * ella se enciende todo lo que depende de la persona y de su marca: quién soy,
 * mis marcas (org = marca), mi rol, mis permisos LITERALES (19), las capacidades
 * del plan, saldo y disponible, mercados, colores, zona horaria e idioma.
 *
 * Sustituye a las cuatro copias de «traer mis orgs» de v1 (AuthService,
 * org-url, router, Navigation) y a `loadMembership` (organization_members
 * + owner_user_id), que leían tablas que en la base nueva no existen.
 *
 * Contrato medido contra el SQL vivo (Git-AISC-DB 20260914310000, cotejado el
 * 15/09): { profile: {id, email, full_name, avatar_url, locale, timezone},
 * organizations: [{ id, slug, name, logo_url, plan, timezone, locale,
 * colores: [{hex, rol, nombre}], role, permissions: [...19], capabilities: [...],
 * credits: {balance, available}, markets: [{id, slug, name, is_primary}] }] }.
 * security INVOKER: no devuelve nada que la persona no pudiera leer sola.
 *
 * `marcar_presencia()` (VOLATILE, INVOKER) escribe profiles.last_seen_at y se
 * llama tras el contexto sin esperar: la presencia nunca frena el arranque.
 */
(function () {
  'use strict';

  const TTL = 60_000;
  let cache = null;        // { contexto, ts, userId }
  let enVuelo = null;
  const oyentes = new Set();

  /* v1 hablaba de «capabilities» con clave punto (OrgCapabilities); v2 tiene 19
     permisos literales. Puente: cada capability de v1 → el permiso que la autoriza. */
  const CAPACIDAD_A_PERMISO = {
    'studio.create': 'producir_contenido',
    'video.create': 'producir_contenido',
    'production.create': 'gestionar_flujos',
    'references.manage': 'editar_marca',
    'vera.chat': 'conversar_con_agente',
    'vera.actions.approve': 'gestionar_agentes',
    'brand.identity.edit': 'editar_marca',
    'brand.storage.manage': 'editar_marca',
    'monitoring.view': 'ver_competencia',
    'insights.view': 'ver_metricas',
    'org.team.manage': 'editar_equipo',
    'org.integrations.manage': 'gestionar_integraciones',
    'org.billing.manage': 'gestionar_facturacion',
    'org.settings.edit': 'editar_marca',
  };

  async function cliente() {
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }

  async function usuarioId() {
    const u = window.authService?.getCurrentUser?.();
    if (u?.id) return u.id;
    const sb = await cliente();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data?.user?.id || null;
  }

  /** Carga (o devuelve de caché) el contexto. `fresco` fuerza la ida a la base. */
  async function cargar({ fresco = false } = {}) {
    const uid = await usuarioId();
    if (!uid) { cache = null; return null; }
    if (!fresco && cache && cache.userId === uid && (Date.now() - cache.ts) < TTL) return cache.contexto;
    if (enVuelo) return enVuelo;
    enVuelo = (async () => {
      const sb = await cliente();
      if (!sb) return null;
      const { data, error } = await sb.rpc('mi_contexto');
      if (error) {
        console.warn('[contexto] mi_contexto falló:', error.code, error.message);
        return cache?.contexto || null;
      }
      const contexto = normalizar(data);
      cache = { contexto, ts: Date.now(), userId: uid };
      // Presencia: sin await, sin ruido. NULL = sin perfil, no es error.
      sb.rpc('marcar_presencia').then(() => {}, () => {});
      oyentes.forEach((fn) => { try { fn(contexto); } catch (e) { console.warn('[contexto] oyente', e); } });
      return contexto;
    })().finally(() => { enVuelo = null; });
    return enVuelo;
  }

  function normalizar(data) {
    const d = (data && typeof data === 'object') ? data : {};
    const orgs = Array.isArray(d.organizations) ? d.organizations : [];
    return {
      profile: d.profile || null,
      organizations: orgs.map((o) => ({
        id: o.id,
        slug: o.slug || '',
        name: o.name || '',
        logo_url: o.logo_url || null,
        plan: o.plan || 'free',
        timezone: o.timezone || 'America/Bogota',
        locale: o.locale || 'es',
        colores: Array.isArray(o.colores) ? o.colores : [],
        role: o.role || 'viewer',
        permissions: Array.isArray(o.permissions) ? o.permissions : [],
        capabilities: Array.isArray(o.capabilities) ? o.capabilities : [],
        credits: { balance: Number(o.credits?.balance ?? 0), available: Number(o.credits?.available ?? 0) },
        markets: Array.isArray(o.markets) ? o.markets : [],
        mfa_required: !!o.mfa_required,
      })),
    };
  }

  const actual = () => cache?.contexto || null;
  const orgs = async () => (await cargar())?.organizations || [];
  const org = (id) => (actual()?.organizations || []).find((o) => o.id === id) || null;
  const orgActivaId = () => window.currentOrgId || localStorage.getItem('selectedOrganizationId') || null;
  const orgActiva = () => org(orgActivaId());

  /** El permiso autoriza; el rol solo habilita. Acepta permiso v2 o capability v1. */
  function puede(permisoOCapacidad, orgId) {
    const o = orgId ? org(orgId) : orgActiva();
    if (!o) return false;
    const permiso = CAPACIDAD_A_PERMISO[permisoOCapacidad] || permisoOCapacidad;
    return o.permissions.includes(permiso);
  }
  const planPermite = (capacidad, orgId) => { const o = orgId ? org(orgId) : orgActiva(); return !!o && o.capabilities.includes(capacidad); };

  /** Mapa {capability v1: bool} para quien todavía habla el dialecto de OrgCapabilities. */
  function capacidadesV1(orgId) {
    const o = orgId ? org(orgId) : orgActiva();
    if (!o) return null;
    const out = {};
    for (const [cap, permiso] of Object.entries(CAPACIDAD_A_PERMISO)) out[cap] = o.permissions.includes(permiso);
    return out;
  }

  function limpiar() { cache = null; }
  function alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

  window.contextoService = Object.freeze({ cargar, actual, orgs, org, orgActiva, orgActivaId, puede, planPermite, capacidadesV1, limpiar, alCambiar, CAPACIDAD_A_PERMISO });
})();
