/**
 * DashboardView — Competence mixin (tab "Competencia").
 *
 * Shell pendiente de reconstrucción minuciosa. Cuando se construya:
 *   - Definir aquí los métodos _renderCompetence, _ensureCompService, _build*, _init*Charts.
 *   - Inicializar estado del tab (this._compData, this._compService) de forma lazy
 *     en _renderCompetence.
 *   - Consumir RPC `dashboard_competencia_intelligence` (winning combos, white space)
 *     además de las RPCs viejas de `CompetenciaDataService`.
 *   - Activar TABS_ENABLED['competence'] = true en DashboardView.js.
 *
 * Aplica sobre DashboardView.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {
    async _renderCompetence(body) {
      this._renderComingSoon('competence', body);
    },
  });
})();
