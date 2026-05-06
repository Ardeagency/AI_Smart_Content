/**
 * DashboardView — Strategy mixin (tab "Estrategia").
 *
 * Shell pendiente de reconstrucción minuciosa. Plan de secciones (ver
 * docs/task/AUDIT-001-frontend-vs-backend-2026-05-05.md):
 *   1. Hero          — botón "Generar Ahora" + próxima ejecución de vera-strategist.timer
 *   2. Pendientes    — cards de strategic_recommendations status='proposed' con aprobar/rechazar/iterar
 *   3. En Producción — strategic_recommendations status='approved'
 *   4. Aprendizaje   — RPC recommendation_learning_stats (approval rate, prediction error)
 *   5. Brand Health  — panel lateral con brand_health_snapshots + brand_vulnerabilities
 *
 * Servicio existente a reescribir: StrategiaDataService → consumir
 * dashboard_strategy_master (1 RPC) en lugar de leer 12 tablas raw.
 *
 * Aplica sobre DashboardView.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {
    async _renderStrategy(body) {
      this._renderComingSoon('strategy', body);
    },
  });
})();
