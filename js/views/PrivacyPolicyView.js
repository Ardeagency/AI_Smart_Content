/**
 * PrivacyPolicyView - Página pública de Política de Privacidad.
 * No requiere login. Misma estructura que otras páginas públicas (login, cambiar-contrasena).
 */
class PrivacyPolicyView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'privacidad.html';
  }

  async onEnter() {}

  async updateHeader() {
    // Página pública sin header de usuario
  }

  async init() {
    // Los enlaces se actualizan por updateLinksForRouter() en BaseView.render()
  }
}

window.PrivacyPolicyView = PrivacyPolicyView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrivacyPolicyView;
}
