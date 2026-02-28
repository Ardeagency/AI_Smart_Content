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
    // Fondo de la landing: imagen en #landing-background-wrap (index.html), mismo estilo que login
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
