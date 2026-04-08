/**
 * LandingView - Vista de la página principal (landing).
 * Muestra botón Login; el login se hace en /login (SignInView).
 */
class LandingView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'landing.html';
    this.heroWordsTimer = null;
    this.pillarScrollCleanup = null;
  }

  async onEnter() {
    // Página pública, sin redirección automática
  }

  async init() {
    this.initHeroWordsCarousel();
    this.initValuePillarsNav();
  }

  /**
   * Pilares: carrusel vertical (derecha) sincronizado con el scroll de página dentro de
   * `.landing-pillars__scroll-track` (altura N×viewport). Sin clic.
   */
  initValuePillarsNav() {
    if (typeof this.pillarScrollCleanup === 'function') {
      this.pillarScrollCleanup();
      this.pillarScrollCleanup = null;
    }

    const section = document.querySelector('.landing-pillars');
    if (!section) return;

    const scrollTrack = section.querySelector('.landing-pillars__scroll-track');
    const indicators = section.querySelectorAll('.landing-pillars__nav-btn');
    const panels = section.querySelectorAll('.landing-pillars__carousel .landing-pillars__panel');
    const count = indicators.length;
    if (!scrollTrack || !count || panels.length !== count) return;

    const activate = (index) => {
      const i = Number.parseInt(String(index), 10);
      if (Number.isNaN(i) || i < 0 || i >= count) return;
      indicators.forEach((el, j) => {
        const active = j === i;
        el.classList.toggle('is-active', active);
        if (active) {
          el.setAttribute('aria-current', 'true');
        } else {
          el.removeAttribute('aria-current');
        }
      });
      panels.forEach((panel, j) => {
        const active = j === i;
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    };

    let ticking = false;
    const updateFromScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const vh = window.innerHeight;
        const rect = scrollTrack.getBoundingClientRect();
        const trackTopPage = window.scrollY + rect.top;
        const trackHeight = scrollTrack.offsetHeight;
        const scrollable = Math.max(0, trackHeight - vh);
        let scrolledIn = window.scrollY - trackTopPage;
        scrolledIn = Math.max(0, Math.min(scrollable, scrolledIn));
        const p = scrollable > 0 ? scrolledIn / scrollable : 0;
        const index = Math.min(count - 1, Math.floor(p * count));
        activate(index);
      });
    };

    window.addEventListener('scroll', updateFromScroll, { passive: true });
    window.addEventListener('resize', updateFromScroll, { passive: true });
    updateFromScroll();

    this.pillarScrollCleanup = () => {
      window.removeEventListener('scroll', updateFromScroll);
      window.removeEventListener('resize', updateFromScroll);
    };
  }

  initHeroWordsCarousel() {
    const rightColumn = document.querySelector('.landing-hero-right');
    const track = rightColumn?.querySelector('.landing-hero-vertical-track');
    if (!rightColumn || !track) return;

    const originalItems = Array.from(track.querySelectorAll('.landing-hero-word-item'));
    if (!originalItems.length) return;

    if (this.heroWordsTimer) {
      window.clearInterval(this.heroWordsTimer);
      this.heroWordsTimer = null;
    }

    const cloneWord = (item) => {
      const clone = item.cloneNode(true);
      clone.dataset.realIndex = item.dataset.realIndex || '0';
      return clone;
    };

    originalItems.forEach((item, index) => {
      item.dataset.realIndex = String(index);
    });

    track.innerHTML = '';
    const before = originalItems.map(cloneWord);
    const middle = originalItems.map(cloneWord);
    const after = originalItems.map(cloneWord);
    [...before, ...middle, ...after].forEach((item) => track.appendChild(item));

    const allItems = Array.from(track.querySelectorAll('.landing-hero-word-item'));
    const baseLength = originalItems.length;
    let currentIndex = baseLength;

    const update = (withTransition = true) => {
      const stepHeight = allItems[0].offsetHeight + this.getTrackGap(track);
      const centerOffset = (rightColumn.clientHeight - allItems[0].offsetHeight) / 2;
      const targetY = centerOffset - (currentIndex * stepHeight);

      track.style.transition = withTransition ? 'transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
      track.style.transform = `translateY(${targetY}px)`;

      allItems.forEach((item) => item.classList.remove('is-active'));
      if (allItems[currentIndex]) {
        allItems[currentIndex].classList.add('is-active');
      }
    };

    update(false);

    this.heroWordsTimer = window.setInterval(() => {
      currentIndex += 1;
      update(true);

      if (currentIndex >= (baseLength * 2)) {
        window.setTimeout(() => {
          currentIndex = baseLength;
          update(false);
        }, 520);
      }
    }, 3000);
  }

  getTrackGap(track) {
    const styles = window.getComputedStyle(track);
    const gapValue = styles.rowGap || styles.gap || '0';
    const parsed = Number.parseFloat(gapValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  onLeave() {
    if (this.heroWordsTimer) {
      window.clearInterval(this.heroWordsTimer);
      this.heroWordsTimer = null;
    }
    if (typeof this.pillarScrollCleanup === 'function') {
      this.pillarScrollCleanup();
      this.pillarScrollCleanup = null;
    }
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
