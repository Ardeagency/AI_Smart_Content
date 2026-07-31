/**
 * DashboardView — Competence mixin (tab "Competencia").
 *
 * QUÉ QUEDA AQUÍ: solo la puerta del tab. El cuerpo lo pintan CompGrid (el grid
 * de cards con datos medidos) y Vera4 (los instrumentos y el juicio del cerebro,
 * schema cards.vera4), y la Intuición se reusa de Mi Marca.
 *
 * QUÉ SE FUE (2026-07-30): el pipeline legacy entero — las tres secciones
 * viejas (campo de batalla / voz de la audiencia / vulnerabilidades), sus
 * builders, su skeleton, sus filtros, su date picker y su servicio de datos.
 * Llevaba INALCANZABLE desde el rediseño de julio: `_renderCompetence` corta
 * hacia CompGrid en su primera línea, así que nada de aquello se ejecutaba —
 * pero seguía descargándose, parseándose y confundiendo a quien viniera a leer.
 * Con él se fueron `CompetenciaDataService` (que cargaba en TODAS las páginas
 * por estar en index.html) y los dos enganches muertos del banner.
 *
 * Si algún día vuelve a hacer falta, está en git: commit anterior a este.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {

    /* El tab es un GRID de cards (CompGrid) + los instrumentos del cerebro
       (Vera4) + la Intuición transversal. Ninguno de los tres tumba al otro:
       cada uno se pinta si tiene qué mostrar. */
    async _renderCompetence(body) {
      if (!body) return;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return; }
      await this._renderCompGrid?.(body);
      await this._renderCompAds?.(body);              // los anuncios que tienen corriendo
      await this._renderIntuicionUniversal?.(body);   // la misma lectura de Mi Marca
    },
  });
})();
