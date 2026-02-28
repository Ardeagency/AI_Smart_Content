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
    const REWIND_SPEED = 1.5;
    const REWIND_SEEK_STEP = 1 / 15; // segundos por frame (≈15 fps) para fallback

    function rewindWithPlaybackRate() {
      video.playbackRate = -REWIND_SPEED;
      video.play().catch(() => {});
    }

    function onTimeUpdateRewind() {
      if (video.currentTime <= 0) {
        video.removeEventListener('timeupdate', onTimeUpdateRewind);
        video.pause();
        video.currentTime = 0;
        video.playbackRate = 1;
        play();
      }
    }

    function rewindWithSeek() {
      const start = video.currentTime;
      const duration = video.duration;
      if (!isFinite(duration) || start <= 0) {
        video.currentTime = 0;
        play();
        return;
      }
      let last = performance.now();
      function tick() {
        const now = performance.now();
        const delta = (now - last) / 1000;
        last = now;
        video.currentTime = Math.max(0, video.currentTime - REWIND_SPEED * delta);
        if (video.currentTime > 0) {
          requestAnimationFrame(tick);
        } else {
          video.currentTime = 0;
          play();
        }
      }
      requestAnimationFrame(tick);
    }

    function startRewind() {
      video.playbackRate = -REWIND_SPEED;
      if (video.playbackRate < 0) {
        video.addEventListener('timeupdate', onTimeUpdateRewind);
        video.play().catch(() => {});
      } else {
        rewindWithSeek();
      }
    }

    video.addEventListener('ended', () => {
      startRewind();
    });
    play();
    video.addEventListener('loadeddata', play, { once: true });
    video.addEventListener('canplay', play, { once: true });
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
