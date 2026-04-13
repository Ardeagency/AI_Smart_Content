/**
 * LandingView - Vista de la página principal (landing).
 * Muestra botón Login; el login se hace en /login (SignInView).
 */
class LandingView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'landing.html';
    this.heroWordsRotatorCleanup = null;
    this.lfwScrollCleanup = null;
    this.landingHeaderScrollCleanup = null;
    this.whyCarouselCleanup = null;
    this.scrollRevealCleanup = null;
  }

  async onEnter() {
    // Página pública, sin redirección automática
  }

  async init() {
    this.initHeroWordsRotator();
    this.initLfwScrollAnimation();
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
   * Scroll-lock para #landing-after-pillars.
   *
   * Motor portado de initValuePillarsNav (que funcionaba en #value-pillars):
   *  - Wheel y touch interceptan el scroll cuando la sección llega al viewport.
   *  - Mientras está "locked" el scroll de la página se congela y los eventos
   *    de wheel/touch avanzan/retroceden los ítems de la lista.
   *  - Al agotar todos los ítems (o retroceder al primero) sale del lock con
   *    scrollBy smooth para continuar normalmente.
   *  - NUNCA usa listener 'scroll' para escribir scrollTop (evita jitter).
   */
  initLfwScrollAnimation() {
    if (typeof this.lfwScrollCleanup === 'function') {
      this.lfwScrollCleanup();
      this.lfwScrollCleanup = null;
    }

    const section   = document.querySelector('#landing-after-pillars');
    if (!section) return;

    const listEl    = section.querySelector('.lfw__list');
    const fill      = section.querySelector('.lfw__fill');
    const listItems = listEl ? Array.from(listEl.querySelectorAll('li')) : [];
    const slides    = Array.from(section.querySelectorAll('.lfw__slide'));

    if (!listItems.length || !slides.length) return;

    const count          = listItems.length;
    // Colores de paleta — uno por ítem (cycling)
    const ITEM_COLORS = [
      '#ff0000','#ff6500','#ffe500','#9acc00','#00d614',
      '#00e7ff','#0018ee','#5b00ea','#900090','#ff0000','#ff6500',
    ];
    const INACTIVE_COLOR = 'rgba(212,209,216,0.15)';

    /* ── Helpers de scroll ── */
    const appContainer  = document.getElementById('app-container');
    const usesAppScroll = () =>
      appContainer && appContainer.scrollHeight > appContainer.clientHeight + 2;
    const getScrollY  = () =>
      usesAppScroll() ? appContainer.scrollTop
        : (window.scrollY || document.documentElement.scrollTop || 0);
    const setScrollY  = (y) => {
      if (usesAppScroll()) appContainer.scrollTop = y;
      else window.scrollTo({ top: y, left: 0, behavior: 'auto' });
    };
    const smoothScrollBy = (delta) => {
      const target = usesAppScroll() ? appContainer : window;
      target.scrollBy({ top: delta, behavior: 'smooth' });
    };

    /* Posición de scroll que pone la sección al tope del viewport */
    const lockScrollYFromSection = () =>
      getScrollY() + section.getBoundingClientRect().top;

    /* ── Estado ── */
    let locked        = false;
    let lockScrollY   = 0;
    let pillarIndex     = 0;
    let wheelAccum      = 0;
    let touchStartY     = null;
    let suppressLock    = false;
    let suppressTimer   = null;
    let lastAdvanceTime = 0;

    const WHEEL_THRESHOLD   = 120;  // mayor threshold para tablets
    const ENTER_ZONE        = 60;
    const ADVANCE_COOLDOWN  = 420;  // ms mínimos entre avances de ítem
    const PER_EVENT_CAP     = 60;   // clamp de delta por evento (evita saltos bruscos)

    /* ── Activar ítem ── */
    const leftCol = section.querySelector('.lfw__left');

    // Posiciona el carrusel según el ítem activo
    const positionCarousel = (activeI, animate = true) => {
      const h       = leftCol ? leftCol.clientHeight : window.innerHeight;
      const centerY = h * 0.40;   // ítem activo al 40% del alto
      const step    = h * 0.13;   // distancia visual entre ítems

      listItems.forEach((item, j) => {
        const offset = j - activeI;
        const absOff = Math.abs(offset);
        const y       = centerY + offset * step;
        const scale   = Math.max(0.28, 1 - absOff * 0.20);
        const opacity = Math.max(0.04, 1 - absOff * 0.26);
        const color   = offset === 0
          ? ITEM_COLORS[activeI % ITEM_COLORS.length]
          : INACTIVE_COLOR;

        if (!animate) item.style.transition = 'none';
        else          item.style.transition = '';

        item.style.transform = `translateY(${y}px) scale(${scale})`;
        item.style.opacity   = opacity;
        item.style.color     = color;
      });
    };

    // Activación visual: carrusel + slides + fill bar
    const activate = (index) => {
      const i = Math.max(0, Math.min(count - 1, index));
      positionCarousel(i, true);
      slides.forEach((slide, j) => {
        const on = j === i;
        slide.style.opacity    = on ? '1' : '0';
        slide.style.visibility = on ? 'visible' : 'hidden';
      });
      if (fill) fill.style.transform = `scaleY(${(i + 1) / count})`;
    };

    // Posición inicial sin animación (evita flash)
    positionCarousel(0, false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      listItems.forEach(item => { item.style.transition = ''; });
    }));

    const scheduleClearSuppress = () => {
      if (suppressTimer) clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => {
        suppressLock = false;
        suppressTimer = null;
      }, 1100);
    };

    /* Entra al lock */
    const enterLock = (fromBottom) => {
      lockScrollY   = lockScrollYFromSection();
      setScrollY(lockScrollY);
      locked        = true;
      wheelAccum    = 0;
      pillarIndex   = fromBottom ? count - 1 : 0;
      activate(pillarIndex);
    };

    /* Sale del lock hacia abajo */
    const exitDown = () => {
      locked       = false;
      suppressLock = true;
      wheelAccum   = 0;
      smoothScrollBy(Math.round(window.innerHeight * 0.65));
      scheduleClearSuppress();
    };

    /* Sale del lock hacia arriba */
    const exitUp = () => {
      locked       = false;
      suppressLock = true;
      wheelAccum   = 0;
      smoothScrollBy(-Math.round(window.innerHeight * 0.65));
      scheduleClearSuppress();
    };

    /* Avanza o retrocede un ítem; sale del lock al agotar los extremos */
    const advanceItem = (forward) => {
      wheelAccum = 0;
      const now = Date.now();
      if (now - lastAdvanceTime < ADVANCE_COOLDOWN) return; // cooldown para tablets
      lastAdvanceTime = now;
      if (forward) {
        if (pillarIndex < count - 1) { pillarIndex += 1; activate(pillarIndex); }
        else exitDown();
      } else {
        if (pillarIndex > 0) { pillarIndex -= 1; activate(pillarIndex); }
        else exitUp();
      }
    };

    /* Intenta entrar al lock cuando la sección llega al viewport */
    const tryEnter = (dy, preventDefault) => {
      if (suppressLock) return false;
      const dist = section.getBoundingClientRect().top;   // 0 = sección en tope
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

    const normalizeWheelDeltaY = (e) => {
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= window.innerHeight;
      // Clamp por evento: evita que tablets/trackpads disparen saltos de varios ítems
      const sign = dy >= 0 ? 1 : -1;
      return sign * Math.min(Math.abs(dy), PER_EVENT_CAP);
    };

    /* ── Wheel ── */
    const onWheel = (e) => {
      if (locked) {
        e.preventDefault();
        wheelAccum += normalizeWheelDeltaY(e);
        if (wheelAccum >= WHEEL_THRESHOLD) advanceItem(true);
        else if (wheelAccum <= -WHEEL_THRESHOLD) advanceItem(false);
        return;
      }
      tryEnter(normalizeWheelDeltaY(e), () => e.preventDefault());
    };

    /* ── Touch ── */
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
        if (wheelAccum >= WHEEL_THRESHOLD) advanceItem(true);
        else if (wheelAccum <= -WHEEL_THRESHOLD) advanceItem(false);
        return;
      }
      tryEnter(rawDy, () => e.preventDefault());
    };
    const onTouchEnd = () => {
      touchStartY = null;
      if (!locked) wheelAccum = 0;
    };

    /* ── Resize ── */
    const onResize = () => {
      if (locked) { lockScrollY = lockScrollYFromSection(); setScrollY(lockScrollY); }
      positionCarousel(pillarIndex, false);
    };

    /* Estado inicial (primer ítem visible) */
    activate(0);

    window.addEventListener('wheel',      onWheel,      { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true  });
    window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true  });
    window.addEventListener('resize',     onResize,     { passive: true  });

    this.lfwScrollCleanup = () => {
      window.removeEventListener('wheel',      onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('touchend',   onTouchEnd);
      window.removeEventListener('resize',     onResize);
      if (suppressTimer) clearTimeout(suppressTimer);
      listItems.forEach(item => { item.style.color = ''; });
      slides.forEach(slide => { slide.style.opacity = ''; slide.style.visibility = ''; });
      if (fill) fill.style.transform = '';
    };
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
   * Hero words rotator — slot machine vertical infinita.
   *
   * Layout: la columna de palabras es una pila vertical (flex-direction:column).
   * El track se desplaza con translateY para simular un slot que avanza cada 2 s.
   * Se prependen 2 clones (últimas 2 palabras) y se añaden 3 clones al final
   * para que el bucle sea completamente seamless.
   *
   * Estructura del track:
   *   [clone(N-2), clone(N-1), real(0..N-1), clone(0), clone(1), clone(2)]
   *
   * translateY = -realIdx * wordHeight
   * → realIdx=0: muestra clone(N-2), clone(N-1), real(0), real(1), real(2)  ✓
   * → realIdx=N: muestra real(N-2), real(N-1), clone(0), clone(1), clone(2)
   *   → snap instantáneo a realIdx=0 (mismo contenido visual) ✓
   */
  initHeroWordsRotator() {
    if (typeof this.heroWordsRotatorCleanup === 'function') {
      this.heroWordsRotatorCleanup();
      this.heroWordsRotatorCleanup = null;
    }

    const track = document.querySelector('.landing-hero__words-track');
    if (!track) return;

    const realItems = Array.from(track.querySelectorAll('.landing-hero__words-item'));
    if (realItems.length < 2) return;

    const N = realItems.length;

    // Prepend en orden inverso para que el DOM quede: [clone(N-2), clone(N-1), real(0)...]
    // insertBefore al firstChild invierte el orden de iteración, así que iteramos [N-1, N-2]
    [realItems[N - 1], realItems[N - 2]].forEach(item => {
      track.insertBefore(item.cloneNode(true), track.firstChild);
    });

    // Append: clone(0), clone(1), clone(2) al final
    for (let i = 0; i < 3; i++) {
      track.appendChild(realItems[i].cloneNode(true));
    }

    let realIdx = 0;
    let busy = false;

    const getWordH = () => realItems[0].offsetHeight || 48;

    const setPos = (idx, animate) => {
      const h = getWordH();
      track.style.transition = animate
        ? 'transform 0.7s cubic-bezier(0.25, 0.1, 0.25, 1)'
        : 'none';
      track.style.transform = `translateY(${-idx * h}px)`;
      if (!animate) void track.offsetHeight; // fuerza reflow
    };

    // Posición inicial: real(0) en el centro del slot (2 ítems arriba = clones)
    setPos(0, false);

    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.heroWordsRotatorCleanup = () => {};
      return;
    }

    const timer = window.setInterval(() => {
      if (busy) return;
      realIdx++;
      setPos(realIdx, true);

      // Al llegar al clon(0) (índice N), hacer snap invisible de vuelta a real(0)
      if (realIdx >= N) {
        busy = true;
        setTimeout(() => {
          realIdx = 0;
          setPos(0, false);
          busy = false;
        }, 750); // duración de la transición CSS
      }
    }, 2000);

    this.heroWordsRotatorCleanup = () => window.clearInterval(timer);
  }

  onLeave() {
    if (typeof this.heroWordsRotatorCleanup === 'function') {
      this.heroWordsRotatorCleanup();
      this.heroWordsRotatorCleanup = null;
    }
    if (typeof this.lfwScrollCleanup === 'function') {
      this.lfwScrollCleanup();
      this.lfwScrollCleanup = null;
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

