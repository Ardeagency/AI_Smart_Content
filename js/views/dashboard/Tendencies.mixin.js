/**
 * DashboardView — Tendencies mixin (tab "Tendencias").
 *
 * Shell pendiente de reconstrucción minuciosa. Plan de sub-tabs (ver
 * docs/task/AUDIT-001-frontend-vs-backend-2026-05-05.md):
 *   1. Pulso del Mercado     — mv_brand_format_stats, market_topic_trends, mv_sentiment_breakdown
 *   2. Demanda de Audiencia  — RPC dashboard_audience_demand (478 signals)
 *   3. Marcas Emergentes     — endpoint /emerging-brands/{org_id} + approve/reject
 *   4. Trends Capturados     — RPC dashboard_targeted_trends (3.730 signals)
 *
 * Servicio nuevo a crear: TendenciasDataService.js (1 RPC por sub-tab).
 *
 * Aplica sobre DashboardView.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {
    async _renderTendencies(body) {
      this._renderComingSoon('tendencies', body);
    },
  });
})();
