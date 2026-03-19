/**
 * DataDeletionView - Página pública para solicitudes de eliminación de datos (Meta).
 * No requiere login.
 */
class DataDeletionView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'eliminacion-datos.html';
  }

  async onEnter() {}

  async updateHeader() {
    // Página pública sin header de usuario
  }

  async init() {
    // Los enlaces se actualizan por updateLinksForRouter() en BaseView.render()
  }
}

window.DataDeletionView = DataDeletionView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataDeletionView;
}
