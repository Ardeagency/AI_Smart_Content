/**
 * DashboardView — la puerta de cada pestaña. Qué pinta cada una y en qué orden, con los
 * mixins que la componen (el mismo reparto que la ruta viva de v1, 8520ff8a^):
 *
 *   Mi Marca     BrandGrid (Intuición, Interacciones, Tráfico, Publicación destacada, Campañas,
 *                Observaciones, cards de Vera, Producto destacado, cards.vera4) + BrandAds
 *   Competencia  CompGrid (Influencia digital, Publicación con mayor tráfico, Audiencias,
 *                Observaciones, cards.vera4) + su Intuición (Vera4) + CompAds
 *   Tendencias   Océanos azules + Próximas fechas (Tendencies) + cards.vera4 + su Intuición
 *   Estrategia   cards.vera4 + su Intuición
 *
 * Ninguna pieza tumba a otra: cada una se pinta si puede y, si la base todavía no la da,
 * muestra «todavía no» en su sitio.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {

    async _renderMyBrands(body) {
      await this._renderBrandGrid(body);
      if (!this._sigue('my-brands')) return;
      await this._renderBrandAds(body);
    },

    async _renderCompetence(body) {
      await this._renderCompGrid(body);
      if (!this._sigue('competence')) return;
      await this._renderIntuicionDelTab(body, 'monitoreo');
      if (!this._sigue('competence')) return;
      await this._renderCompAds(body);
    },

    async _renderTendencies(body) {
      await this._renderTendFechasOnly(body);
      if (!this._sigue('tendencies')) return;
      await this._renderVera4(body, 'tendencias');
      if (!this._sigue('tendencies')) return;
      await this._renderPropuestasFecha(body);
      await this._renderIntuicionDelTab(body, 'tendencias');
    },

    async _renderStrategy(body) {
      // Sin shell propio (como en v1): _renderVera4 arma la .insight-page y la Intuición entra como su primer hijo.
      await this._renderVera4(body, 'estrategia');
      if (!this._sigue('strategy')) return;
      await this._renderIntuicionDelTab(body, 'estrategia');
    },
  });
})();
