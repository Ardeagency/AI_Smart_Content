/**
 * IntegracionesDataService — las conexiones de la marca con sus plataformas
 * (Configuración › Integraciones, L5 24/09). window.IntegracionesDatos.
 *
 *   conexiones(orgId)            integrations.connections por PostgREST con el JWT.
 *                                Sin gestionar_integraciones la base devuelve 42501:
 *                                → { sinPermiso: true, lista: [] }, no un error.
 *   conectar(orgId, plataforma)  URL de autorización del borde (POST /v1/integraciones/:p/conectar,
 *                                vía MarcaDatos.urlParaConectar); vuelve a `return_to`.
 *   desconectar(id, orgId)       POST /v1/integraciones/:id/desconectar.
 */
(function () {
  'use strict';

  async function cliente() {
    if (window.supabaseService?.getClient) {
      try { return await window.supabaseService.getClient(); } catch (_) { /* cae al global */ }
    }
    return window.supabase || null;
  }

  async function conexiones(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return { lista: [], sinPermiso: false };
    const r = await sb.schema('integrations').from('connections')
      .select('id, platform, status, account_name, external_account_id, expires_at, last_used_at, last_refreshed_at, last_error, updated_at')
      .eq('organization_id', orgId).order('platform', { ascending: true });
    if (r.error) {
      if (r.error.code === '42501') return { lista: [], sinPermiso: true };
      throw r.error;
    }
    return { lista: r.data || [], sinPermiso: false };
  }

  async function conectar(orgId, plataforma, extra = {}) {
    if (!window.MarcaDatos?.urlParaConectar) throw Object.assign(new Error('sin_api'), { code: 'sin_api' });
    const vuelta = window.location.pathname;
    const datos = Object.assign({}, extra);
    if (/^\/[A-Za-z0-9_\-/.]*$/.test(vuelta) && vuelta.length <= 500) datos.return_to = vuelta;
    return window.MarcaDatos.urlParaConectar(orgId, plataforma, datos);
  }

  async function desconectar(id, orgId) {
    const api = window.apiV2?.api;
    if (!api) throw Object.assign(new Error('sin_api'), { code: 'sin_api' });
    return api.desconectar(id, orgId);
  }

  window.IntegracionesDatos = Object.freeze({ conexiones, conectar, desconectar });
})();
