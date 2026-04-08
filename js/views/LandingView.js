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
   * Pilares: al llegar a la sección el scroll principal se fija; la rueda/touch avanza
   * cada pilar; al completar el último (o subir desde el primero) se libera y sigue la página.
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

    const appContainer = document.getElementById('app-container');

    const stickyTopPx = () => (window.matchMedia('(max-width: 768px)').matches ? 72 : 92);

    const usesAppScroll = () =>
      appContainer && appContainer.scrollHeight > appContainer.clientHeight + 2;

    const getScrollY = () => {
      if (usesAppScroll()) return appContainer.scrollTop;
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const setScrollY = (y) => {
      if (usesAppScroll()) {
        appContainer.scrollTop = y;
      } else {
        window.scrollTo({ top: y, left: 0, behavior: 'auto' });
      }
    };

    const lockScrollYFromTrack = () => {
      const top = scrollTrack.getBoundingClientRect().top;
      return getScrollY() + top - stickyTopPx();
    };

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

    let locked = false;
    let lockScrollY = 0;
    let pillarIndex = 0;
    let wheelAccum = 0;
    let prevScrollY = getScrollY();
    const WHEEL_THRESHOLD = 88;
    const ENTER_ZONE_PX = 28;

    const normalizeWheelDeltaY = (e) => {
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= window.innerHeight;
      return dy;
    };

    const scrollPastSectionDown = () => {
      const vh = window.innerHeight;
      const tr = scrollTrack.getBoundingClientRect();
      const delta = Math.max(160, tr.bottom - vh + 48);
      setScrollY(getScrollY() + delta);
    };

    const scrollPastSectionUp = () => {
      const tr = scrollTrack.getBoundingClientRect();
      const delta = Math.max(160, window.innerHeight - tr.top + 48);
      setScrollY(getScrollY() - delta);
    };

    const tryEnterLock = (e) => {
      const trTop = scrollTrack.getBoundingClientRect().top;
      const st = stickyTopPx();
      if (
        e.deltaY > 0 &&
        trTop <= st + ENTER_ZONE_PX &&
        trTop >= st - ENTER_ZONE_PX * 2
      ) {
        e.preventDefault();
        lockScrollY = lockScrollYFromTrack();
        setScrollY(lockScrollY);
        locked = true;
        pillarIndex = 0;
        wheelAccum = 0;
        activate(0);
        return true;
      }
      return false;
    };

    const onWheel = (e) => {
      if (locked) {
        e.preventDefault();
        const dy = normalizeWheelDeltaY(e);
        wheelAccum += dy;

        if (wheelAccum > WHEEL_THRESHOLD) {
          wheelAccum = 0;
          if (pillarIndex < count - 1) {
            pillarIndex += 1;
            activate(pillarIndex);
          } else {
            locked = false;
            activate(count - 1);
            wheelAccum = 0;
            scrollPastSectionDown();
          }
        } else if (wheelAccum < -WHEEL_THRESHOLD) {
          wheelAccum = 0;
          if (pillarIndex > 0) {
            pillarIndex -= 1;
            activate(pillarIndex);
          } else {
            locked = false;
            scrollPastSectionUp();
          }
        }
        return;
      }

      tryEnterLock(e);
    };

    const onScrollUnified = () => {
      if (locked) {
        const y = getScrollY();
        if (Math.abs(y - lockScrollY) > 4) {
          setScrollY(lockScrollY);
        }
        return;
      }
      const y = getScrollY();
      const scrollingDown = y > prevScrollY + 1;
      prevScrollY = y;
      const trTop = scrollTrack.getBoundingClientRect().top;
      const st = stickyTopPx();
      if (
        scrollingDown &&
        trTop <= st + 22 &&
        trTop >= st - 42
      ) {
        lockScrollY = lockScrollYFromTrack();
        setScrollY(lockScrollY);
        locked = true;
        pillarIndex = 0;
        wheelAccum = 0;
        activate(0);
      }
    };

    let touchStartY = null;
    const onTouchStart = (e) => {
      if (!locked || !e.touches || !e.touches[0]) return;
      touchStartY = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (!locked || touchStartY == null || !e.touches || !e.touches[0]) return;
      const dy = touchStartY - e.touches[0].clientY;
      if (Math.abs(dy) < 6) return;
      e.preventDefault();
      wheelAccum += dy * 1.2;
      touchStartY = e.touches[0].clientY;

      if (wheelAccum > WHEEL_THRESHOLD) {
        wheelAccum = 0;
        if (pillarIndex < count - 1) {
          pillarIndex += 1;
          activate(pillarIndex);
        } else {
          locked = false;
          activate(count - 1);
          touchStartY = null;
          scrollPastSectionDown();
        }
      } else if (wheelAccum < -WHEEL_THRESHOLD) {
        wheelAccum = 0;
        if (pillarIndex > 0) {
          pillarIndex -= 1;
          activate(pillarIndex);
        } else {
          locked = false;
          touchStartY = null;
          scrollPastSectionUp();
        }
      }
    };

    const onTouchEnd = () => {
      touchStartY = null;
    };

    const onResize = () => {
      prevScrollY = getScrollY();
      if (locked) {
        lockScrollY = lockScrollYFromTrack();
        setScrollY(lockScrollY);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScrollUnified, { passive: true });
    if (appContainer) {
      appContainer.addEventListener('scroll', onScrollUnified, { passive: true });
    }
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    this.pillarScrollCleanup = () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', enforceLockPosition);
      if (appContainer) {
        appContainer.removeEventListener('scroll', enforceLockPosition);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
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
