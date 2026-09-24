/**
 * ShellDataService — lo que el cascarón (js/shell/) lee de la base. El shell no
 * toca `supabase.from()`: todo pasa por aquí (window.ShellDatos), con caché corta
 * por apiClient cuando existe. Sustituye a las lecturas sueltas de Navigation.js.
 *
 *   marcas()                 mis marcas (mi_contexto): id, name, logo_url, plan, role
 *   marca(orgId)             una de ellas, con credits y markets
 *   creditos(orgId)          { disponibles, delPlan } — disponibles de mi_contexto (fresco),
 *                            delPlan = billing.plans.monthly_credits del tier
 *   planes()                 billing.plans ordenados por créditos (tier, name, monthly_credits)
 *   categoriasDeFlujos()     flows.categories con al menos un flujo publicado en el catálogo
 *   tieneGuardados(orgId)    ¿la marca guardó flujos? (flows.saves)
 *   pendientesDeVera(orgId)  ai.pending_actions de la marca (40 más recientes)
 *   cuantosPendientes(orgId) cuántas sin decidir
 */
(function () {
  'use strict';

  async function cliente() {
    if (window.supabaseService?.getClient) {
      try { return await window.supabaseService.getClient(); } catch (_) { /* cae al global */ }
    }
    return window.supabase || null;
  }

  /** apiClient.query con TTL + SWR si existe; si no, directo. */
  function cacheado(clave, ttl, fn) {
    return window.apiClient ? window.apiClient.query(clave, fn, { ttl, staleWhileRevalidate: true }) : fn();
  }

  async function marcas() {
    if (!window.contextoService) return [];
    try { return await window.contextoService.orgs(); } catch (_) { return []; }
  }

  async function marca(orgId) {
    if (!window.contextoService || !orgId) return null;
    await window.contextoService.cargar();
    return window.contextoService.org(orgId) || null;
  }

  async function planes() {
    return cacheado('shell:planes', 10 * 60 * 1000, async () => {
      const sb = await cliente();
      if (!sb) return [];
      const { data, error } = await sb.schema('billing').from('plans')
        .select('tier, name, monthly_credits').order('monthly_credits', { ascending: true });
      if (error) { console.warn('[shell] plans:', error.code, error.message); return []; }
      return data || [];
    });
  }

  async function creditos(orgId) {
    if (!orgId || !window.contextoService) return null;
    return cacheado(`nav:credits:${orgId}`, 15 * 1000, async () => {
      const ctx = await window.contextoService.cargar({ fresco: true });
      const o = (ctx?.organizations || []).find((x) => x.id === orgId);
      if (!o) return null;
      const plan = (await planes()).find((p) => p.tier === o.plan);
      return { disponibles: Number(o.credits?.available) || 0, delPlan: Number(plan?.monthly_credits) || 0 };
    });
  }

  async function categoriasDeFlujos() {
    return cacheado('nav:content_categories:v2', 10 * 60 * 1000, async () => {
      const sb = await cliente();
      if (!sb) return [];
      const [cats, flujos] = await Promise.all([
        sb.schema('flows').from('categories').select('id, name, is_active, position')
          .eq('is_active', true).order('position', { ascending: true, nullsFirst: false }).order('name'),
        sb.schema('flows').from('catalog_view').select('categoria')
          .eq('status', 'published').eq('show_in_catalog', true),
      ]);
      if (cats.error) return [];
      const lista = (cats.data || []).map((c) => ({ id: c.id, name: c.name }));
      if (flujos.error || !Array.isArray(flujos.data)) return lista;
      const conFlujos = new Set(flujos.data.map((f) => f.categoria).filter(Boolean));
      return lista.filter((c) => conFlujos.has(c.id));
    });
  }

  async function tieneGuardados(orgId) {
    if (!orgId) return false;
    return cacheado(`nav:org_flow_saves_count:${orgId}`, 60 * 1000, async () => {
      const sb = await cliente();
      if (!sb) return false;
      const { count, error } = await sb.schema('flows').from('saves')
        .select('flow_id', { count: 'exact', head: true }).eq('organization_id', orgId);
      return !error && (count || 0) > 0;
    });
  }

  async function pendientesDeVera(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const { data, error } = await sb.schema('ai').from('pending_actions')
      .select('id, action, permission, summary, payload, decided_at, approved, decision_note, created_at')
      .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(40);
    if (error) throw error;
    return data || [];
  }

  async function cuantosPendientes(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return 0;
    const { count, error } = await sb.schema('ai').from('pending_actions')
      .select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('decided_at', null);
    if (error) return 0;
    return Number(count) || 0;
  }

  window.ShellDatos = Object.freeze({
    marcas, marca, planes, creditos, categoriasDeFlujos, tieneGuardados, pendientesDeVera, cuantosPendientes,
  });
})();
