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
    // Forzar reproducción del video de fondo (algunos navegadores no respetan autoplay sin interacción)
    const video = this.container.querySelector('.landing-background-video');
    if (video) {
      video.muted = true;
      video.playsInline = true;
      const play = () => video.play().catch(() => {});
      play();
      video.addEventListener('loadeddata', play, { once: true });
      video.addEventListener('canplay', play, { once: true });
    }
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
