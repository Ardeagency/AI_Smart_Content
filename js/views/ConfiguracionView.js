/**
 * ConfiguracionView — Configuración de la marca (L5, 24/09): reusa OrganizationView
 * tal cual; solo traduce el slug de la URL a su pestaña, esconde su tira interna
 * (css: body.en-ajustes) y monta las pestañas del SaaS en la topbar
 * (js/views/ajustes-pestanas.js). Se carga DESPUÉS de OrganizationView.js.
 */
(function () {
  'use strict';

  const t = (s, p) => (typeof window.__ === 'function' ? window.__(s, p) : s);
  /* ── Configuración de la marca: OrganizationView con la pestaña de la URL ── */

  const SLUG_A_PESTANA = { general: 'general', miembros: 'miembros', facturacion: 'suscripcion', uso: 'uso', seguridad: 'seguridad', avisos: 'avisos' };

  if (typeof window.OrganizationView === 'function') {
    class ConfiguracionView extends window.OrganizationView {
      async render() {
        const slug = String(this.routeParams?.tab || 'general').toLowerCase();
        this._slugAjustes = SLUG_A_PESTANA[slug] ? slug : 'general';
        // OrganizationView abre la pestaña por routeParams.tab con sus propios nombres.
        this.routeParams = Object.assign({}, this.routeParams, { tab: SLUG_A_PESTANA[this._slugAjustes] });
        // Pestañas y body.en-ajustes ANTES de cargar: si no, durante la carga se veía la
        // cabecera legada de OrganizationView y luego todo subía 90 px (diagnóstico 25/09).
        window.PestanasDeAjustes.montar(this, 'configuracion', this._slugAjustes);
        await super.render();
        if (typeof this.updateHeaderContext === 'function') this.updateHeaderContext(t('Configuración'));
      }

      destroy() {
        window.PestanasDeAjustes.desmontar(this);
        if (typeof super.destroy === 'function') super.destroy();
      }
    }
    window.ConfiguracionView = ConfiguracionView;
  }
})();
