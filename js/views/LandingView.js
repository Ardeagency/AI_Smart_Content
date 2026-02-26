/**
 * LandingView - Vista de la página principal (landing).
 * Muestra botón Login; el login se hace en /login (SignInView).
 */
class LandingView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'landing.html';
  }

  async onEnter() {
    // Página pública, sin redirección automática
  }

  async init() {
    // Sin lógica de login ni modales; el enlace /login lleva a la vista de inicio de sesión
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
