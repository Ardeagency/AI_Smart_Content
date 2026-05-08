/**
 * DashboardView — Tendencies mixin (tab "Tendencias").
 *
 * Shell pendiente de reconstrucción minuciosa. Plan de secciones (ver
 * docs/task/SPRINT-FRONTEND-100-2026-05-06.md sección D2-D3):
 *   1. Pulso del Mercado    — market_tone_trends, market_topic_trends,
 *                             market_format_trends, market_sentiment_trends
 *                             + mv_brand_format_stats + mv_sentiment_breakdown
 *   2. Demanda de Audiencia — dashboard_audience_demand (heatmap intent +
 *                             tabla top 10 high-intent)
 *   3. Marcas Emergentes    — dashboard_emerging_brands (cards approve/reject)
 *   4. Trends Capturados    — dashboard_targeted_trends (tabla paginada +
 *                             velocity scatter, 3.730 filas)
 *
 * Servicio existente a reescribir: TendenciasDataService → consumir
 * dashboard_tendencias (1 RPC master) en lugar de leer N tablas raw.
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
