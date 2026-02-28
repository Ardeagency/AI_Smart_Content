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
    if (!video) return;

    video.muted = true;
    video.playsInline = true;
    const play = () => video.play().catch(() => {});

    // Bucle: reproducción normal → retroceso → reproducción normal
    const REWIND_DURATION_MS = 2000;

    function rewindThenPlay() {
      const duration = video.duration;
      if (!isFinite(duration) || duration <= 0) {
        video.currentTime = 0;
        play();
        return;
      }
      const startTime = performance.now();
      function tick(now) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / REWIND_DURATION_MS, 1);
        video.currentTime = duration * (1 - t);
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          video.currentTime = 0;
          play();
        }
      }
      requestAnimationFrame(tick);
    }

    video.addEventListener('ended', rewindThenPlay);
    play();
    video.addEventListener('loadeddata', play, { once: true });
    video.addEventListener('canplay', play, { once: true });
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
