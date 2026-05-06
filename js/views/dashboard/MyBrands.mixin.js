/**
 * DashboardView — MyBrands mixin (tab "Mi Marca").
 *
 * Shell pendiente de reconstrucción minuciosa. Cuando se construya:
 *   - Definir aquí los métodos _renderMyBrands, _ensureMBService, _build*, _init*Charts.
 *   - Inicializar estado del tab (this._mbData, this._mbService, this._mbFilters,
 *     this._mbBody) de forma lazy en _renderMyBrands para no inflar el constructor
 *     del core.
 *   - Activar TABS_ENABLED['my-brands'] = true en DashboardView.js.
 *
 * Aplica sobre DashboardView.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {
    async _renderMyBrands(body) {
      this._renderComingSoon('my-brands', body);
    },
  });
})();
