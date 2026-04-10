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
    this.flowTabsCleanup = null;
    this.landingHeaderScrollCleanup = null;
    this.whyCarouselCleanup = null;
    this.scrollRevealCleanup = null;
  }

  async onEnter() {
    // Página pública, sin redirección automática
  }

  async init() {
    this.initHeroWordsCarousel();
    this.initValuePillarsNav();
    this.initLandingFlowTabs();
    this.initLandingHeaderScrollState();
    this.initLandingWhyCarousel();
    this.initScrollReveal();
  }

  /**
   * Header: sin "pastilla" al inicio (transparente, ancho completo, pegado arriba);
   * al hacer scroll recupera el estilo flotante con blur y bordes.
   */
  initLandingHeaderScrollState() {
    if (typeof this.landingHeaderScrollCleanup === 'function') {
      this.landingHeaderScrollCleanup();
      this.landingHeaderScrollCleanup = null;
    }

    const header = document.querySelector('.landing-header');
    if (!header) return;

    const appContainer = document.getElementById('app-container');
    const SCROLL_THRESHOLD_PX = 32;

    const usesAppScroll = () =>
      appContainer && appContainer.scrollHeight > appContainer.clientHeight + 2;

    const getScrollY = () => {
      if (usesAppScroll()) return appContainer.scrollTop;
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const update = () => {
      header.classList.toggle('landing-header--floating', getScrollY() > SCROLL_THRESHOLD_PX);
    };

    update();

    const scrollTarget = usesAppScroll() ? appContainer : window;
    scrollTarget.addEventListener('scroll', update, { passive: true });

    this.landingHeaderScrollCleanup = () => {
      scrollTarget.removeEventListener('scroll', update);
    };
  }

  /**
   * Categorías de flujos: activa la categoría en función del scroll.
   * Al llegar a la zona de cada ítem en la columna izquierda, resalta
   * la categoría correspondiente con .lfw__cat--active.
   */
  initLandingFlowTabs() {
    if (typeof this.flowTabsCleanup === 'function') {
      this.flowTabsCleanup();
      this.flowTabsCleanup = null;
    }

    const cats = Array.from(document.querySelectorAll('.lfw__cat'));
    if (!cats.length) return;

    const activate = (idx) => {
      cats.forEach((c, i) => c.classList.toggle('lfw__cat--active', i === idx));
    };

    // En desktop usamos IntersectionObserver sobre cada ítem de categoría.
    // Cuando un ítem entra en la banda central del viewport se activa.
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              activate(cats.indexOf(entry.target));
            }
          }
        },
        {
          rootMargin: '-35% 0px -35% 0px',
          threshold: 0,
        }
      );
      cats.forEach((c) => io.observe(c));
      this.flowTabsCleanup = () => io.disconnect();
    } else {
      // Fallback sin IntersectionObserver
      activate(0);
      this.flowTabsCleanup = null;
    }
  }

  /**
   * Scroll-reveal: aplica .is-visible a elementos .sr-reveal cuando entran en viewport.
   * Los delays de transición están controlados desde CSS con .sr-reveal--d1/d2/…
   */
  initScrollReveal() {
    if (typeof this.scrollRevealCleanup === 'function') {
      this.scrollRevealCleanup();
      this.scrollRevealCleanup = null;
    }

    const els = document.querySelectorAll('.sr-reveal');
    if (!els.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -4% 0px' }
    );

    els.forEach((el) => io.observe(el));

    this.scrollRevealCleanup = () => {
      io.disconnect();
    };
  }

  /**
   * Carrusel "Por qué…": viewport con scroll-snap; prev/next y flechas en el teclado.
   */
  initLandingWhyCarousel() {
    if (typeof this.whyCarouselCleanup === 'function') {
      this.whyCarouselCleanup();
      this.whyCarouselCleanup = null;
    }

    const viewport = document.getElementById('landing-why-viewport');
    const prevBtn = document.getElementById('landing-why-prev');
    const nextBtn = document.getElementById('landing-why-next');
    const track = viewport?.querySelector('.landing-why__track');
    const wraps = viewport ? viewport.querySelectorAll('.landing-why__card-wrap') : [];
    if (!viewport || !prevBtn || !nextBtn || !track || wraps.length === 0) return;

    const getStep = () => {
      const first = wraps[0];
      const gapRaw = window.getComputedStyle(track).gap || window.getComputedStyle(track).columnGap || '0';
      const gap = Number.parseFloat(gapRaw) || 0;
      return first.offsetWidth + gap;
    };

    const EDGE_PX = 3;

    const updateButtons = () => {
      const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const x = viewport.scrollLeft;
      prevBtn.disabled = x <= EDGE_PX;
      nextBtn.disabled = x >= maxScroll - EDGE_PX;
    };

    const go = (direction) => {
      viewport.scrollBy({ left: direction * getStep(), behavior: 'smooth' });
    };

    const onPrev = () => go(-1);
    const onNext = () => go(1);

    const onKeydown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      }
    };

    prevBtn.addEventListener('click', onPrev);
    nextBtn.addEventListener('click', onNext);
    viewport.addEventListener('scroll', updateButtons, { passive: true });
    viewport.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', updateButtons, { passive: true });

    updateButtons();

    this.whyCarouselCleanup = () => {
      prevBtn.removeEventListener('click', onPrev);
      nextBtn.removeEventListener('click', onNext);
      viewport.removeEventListener('scroll', updateButtons);
      viewport.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', updateButtons);
    };
  }

  /**
   * Pilares: intercepción de wheel/touch para avanzar pilares sin jitter.
   *
   * Diseño:
   *  - NUNCA se llama setScrollY desde un evento 'scroll' (ese loop era la
   *    causa del jitter: scroll→setScrollY→scroll→scroll…).
   *  - Solo wheel y touchmove controlan entrada, avance y salida del lock.
   *  - La salida usa scrollBy({ behavior:'smooth' }) para transición fluida.
   *  - Soporta entrada desde arriba (scroll↓) y desde abajo (scroll↑).
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
    const getScrollY = () =>
      usesAppScroll()
        ? appContainer.scrollTop
        : window.scrollY || document.documentElement.scrollTop || 0;
    const setScrollY = (y) => {
      if (usesAppScroll()) appContainer.scrollTop = y;
      else window.scrollTo({ top: y, left: 0, behavior: 'auto' });
    };
    const smoothScrollBy = (delta) => {
      const target = usesAppScroll() ? appContainer : window;
      target.scrollBy({ top: delta, behavior: 'smooth' });
    };
    const lockScrollYFromTrack = () =>
      getScrollY() + scrollTrack.getBoundingClientRect().top - stickyTopPx();

    /* ── Estado ── */
    let locked = false;
    let lockScrollY = 0;
    let pillarIndex = 0;
    let wheelAccum = 0;
    let touchStartY = null;
    let suppressLock = false;
    let suppressTimer = null;

    const WHEEL_THRESHOLD = 80;
    const ENTER_ZONE = 54;

    /* ── Helpers ── */
    const normalizeWheelDeltaY = (e) => {
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= window.innerHeight;
      return dy;
    };

    const activate = (index) => {
      const i = Math.max(0, Math.min(count - 1, index));
      indicators.forEach((el, j) => {
        const active = j === i;
        el.classList.toggle('is-active', active);
        active ? el.setAttribute('aria-current', 'true') : el.removeAttribute('aria-current');
      });
      panels.forEach((panel, j) => {
        const active = j === i;
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    };

    const scheduleClearSuppress = () => {
      if (suppressTimer) clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => {
        suppressLock = false;
        suppressTimer = null;
      }, 1100);
    };

    /* Entra al lock: fija la posición de scroll una sola vez y activa el pilar */
    const enterLock = (fromBottom) => {
      lockScrollY = lockScrollYFromTrack();
      setScrollY(lockScrollY);
      locked = true;
      wheelAccum = 0;
      pillarIndex = fromBottom ? count - 1 : 0;
      activate(pillarIndex);
    };

    /* Sale del lock hacia abajo con scroll suave */
    const exitDown = () => {
      locked = false;
      suppressLock = true;
      wheelAccum = 0;
      const tr = scrollTrack.getBoundingClientRect();
      const delta = Math.max(260, tr.bottom - window.innerHeight + stickyTopPx() + 48);
      smoothScrollBy(delta);
      scheduleClearSuppress();
    };

    /* Sale del lock hacia arriba con scroll suave */
    const exitUp = () => {
      locked = false;
      suppressLock = true;
      wheelAccum = 0;
      const tr = scrollTrack.getBoundingClientRect();
      const delta = Math.max(260, window.innerHeight - tr.top + stickyTopPx() + 48);
      smoothScrollBy(-delta);
      scheduleClearSuppress();
    };

    /* Avanza o retrocede un pilar; sale del lock al rebasar los extremos */
    const advancePillar = (forward) => {
      wheelAccum = 0;
      if (forward) {
        if (pillarIndex < count - 1) { pillarIndex += 1; activate(pillarIndex); }
        else exitDown();
      } else {
        if (pillarIndex > 0) { pillarIndex -= 1; activate(pillarIndex); }
        else exitUp();
      }
    };

    /**
     * Intenta entrar al lock basándose en la dirección del delta y la posición
     * del scrollTrack respecto al sticky offset.
     *
     * Condición de entrada (ambas direcciones):
     *   trTop ≈ stickyTopPx()
     *   — scroll↓ (dy>0): entrada desde arriba → pilar 0
     *   — scroll↑ (dy<0): entrada desde abajo → pilar count-1
     */
    const tryEnter = (dy, preventDefault) => {
      if (suppressLock) return false;
      const trTop = scrollTrack.getBoundingClientRect().top;
      const st = stickyTopPx();
      const dist = trTop - st;

      if (dy > 0 && dist <= ENTER_ZONE && dist > -ENTER_ZONE * 1.5) {
        preventDefault();
        enterLock(false);
        return true;
      }
      if (dy < 0 && Math.abs(dist) <= ENTER_ZONE) {
        preventDefault();
        enterLock(true);
        return true;
      }
      return false;
    };

    /* ── Wheel ─────────────────────────────────────────────────────────── */
    const onWheel = (e) => {
      if (locked) {
        e.preventDefault();
        wheelAccum += normalizeWheelDeltaY(e);
        if (wheelAccum >= WHEEL_THRESHOLD) advancePillar(true);
        else if (wheelAccum <= -WHEEL_THRESHOLD) advancePillar(false);
        return;
      }
      tryEnter(normalizeWheelDeltaY(e), () => e.preventDefault());
    };

    /* ── Touch ─────────────────────────────────────────────────────────── */
    const onTouchStart = (e) => {
      if (!e.touches?.[0]) return;
      touchStartY = e.touches[0].clientY;
      if (locked) wheelAccum = 0;
    };

    const onTouchMove = (e) => {
      if (touchStartY == null || !e.touches?.[0]) return;
      const rawDy = touchStartY - e.touches[0].clientY;
      if (Math.abs(rawDy) < 5) return;
      touchStartY = e.touches[0].clientY;

      if (locked) {
        e.preventDefault();
        wheelAccum += rawDy * 1.4;
        if (wheelAccum >= WHEEL_THRESHOLD) advancePillar(true);
        else if (wheelAccum <= -WHEEL_THRESHOLD) advancePillar(false);
        return;
      }
      tryEnter(rawDy, () => e.preventDefault());
    };

    const onTouchEnd = () => {
      touchStartY = null;
      if (!locked) wheelAccum = 0;
    };

    /* ── Resize ────────────────────────────────────────────────────────── */
    const onResize = () => {
      if (locked) {
        lockScrollY = lockScrollYFromTrack();
        setScrollY(lockScrollY);
      }
    };

    /* Sin listener 'scroll': elimina el loop scroll→setScrollY→scroll que causaba jitter */
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    this.pillarScrollCleanup = () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', onResize);
      if (suppressTimer) clearTimeout(suppressTimer);
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
    if (typeof this.flowTabsCleanup === 'function') {
      this.flowTabsCleanup();
      this.flowTabsCleanup = null;
    }
    if (typeof this.landingHeaderScrollCleanup === 'function') {
      this.landingHeaderScrollCleanup();
      this.landingHeaderScrollCleanup = null;
    }
    if (typeof this.whyCarouselCleanup === 'function') {
      this.whyCarouselCleanup();
      this.whyCarouselCleanup = null;
    }
    if (typeof this.scrollRevealCleanup === 'function') {
      this.scrollRevealCleanup();
      this.scrollRevealCleanup = null;
    }
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
