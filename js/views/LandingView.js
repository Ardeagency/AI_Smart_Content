/**
 * LandingView - Vista de la página principal (landing).
 * Solo muestra botones Login y Planes; el login se hace en /login (SignInView).
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
    // Sin lógica de login ni modales; los enlaces /login y /planes llevan a sus vistas
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
