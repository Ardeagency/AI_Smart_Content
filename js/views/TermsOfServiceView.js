/**
 * TermsOfServiceView - Página pública de Términos de Servicio.
 * No requiere login. Misma estructura que otras páginas públicas (login, cambiar-contrasena).
 */
class TermsOfServiceView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'terminos-servicio.html';
  }

  async onEnter() {}

  async updateHeader() {
    // Página pública sin header de usuario
  }

  async init() {
    // Los enlaces se actualizan por updateLinksForRouter() en BaseView.render()
  }
}

window.TermsOfServiceView = TermsOfServiceView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TermsOfServiceView;
}
