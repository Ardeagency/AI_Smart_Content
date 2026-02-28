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
    // Forzar reproducción del video de fondo (está en #landing-background-wrap en index.html)
    const wrap = document.getElementById('landing-background-wrap');
    const video = wrap ? wrap.querySelector('.landing-background-video') : null;
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
