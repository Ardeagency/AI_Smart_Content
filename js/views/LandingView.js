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
   * Scroll-list animado: el efecto visual del CodePen pomvabo sin GSAP.
   *
   * Cómo funciona:
   * - .lfw tiene height: 650vh → crea el espacio de scroll necesario
   * - .lfw__inner NO usa sticky (overflow-x:hidden del wrapper lo rompería)
   * - JS aplica translateY al inner para mantenerlo visible mientras
   *   el usuario scrollea dentro de la sección (simula el "pin")
   * - Progreso 0→1 dispara: color activo en lista, slide visible, barra fill
   */
  initLfwScrollAnimation() {
    if (typeof this.lfwScrollCleanup === 'function') {
      this.lfwScrollCleanup();
      this.lfwScrollCleanup = null;
    }

    const scrollEl = document.getElementById('app-container');
    if (!scrollEl) return;

    const section   = document.querySelector('#landing-after-pillars');
    if (!section) return;

    const inner     = section.querySelector('.lfw__inner');
    const listEl    = section.querySelector('.lfw__list');
    const fill      = section.querySelector('.lfw__fill');
    const listItems = listEl ? Array.from(listEl.querySelectorAll('li')) : [];
    const slides    = Array.from(section.querySelectorAll('.lfw__slide'));

    if (!inner || !listItems.length || !slides.length) return;

    const N              = listItems.length;
    const ACTIVE_COLOR   = '#ff6500';
    const INACTIVE_COLOR = 'rgba(212,209,216,0.28)';

    // Estado inicial
    listItems.forEach((item, i) => {
      item.style.color = i === 0 ? ACTIVE_COLOR : INACTIVE_COLOR;
    });
    slides.forEach((slide, i) => {
      slide.style.opacity    = i === 0 ? '1' : '0';
      slide.style.visibility = i === 0 ? 'visible' : 'hidden';
    });
    if (fill) fill.style.transform = `scaleY(${1 / N})`;

    let lastActive = 0;

    const onScroll = () => {
      const sectionTop = section.offsetTop;
      const sectionH   = section.offsetHeight;   // 650vh
      const viewportH  = scrollEl.clientHeight;
      const scrollTop  = scrollEl.scrollTop;
      const maxScroll  = sectionH - viewportH;

      // Cuánto hemos scrolleado DENTRO de la sección
      const into = scrollTop - sectionTop;
      // Clampear: 0 antes de entrar, maxScroll después de salir
      const pinned = Math.max(0, Math.min(maxScroll, into));

      // Mover el inner hacia abajo para que permanezca en pantalla
      inner.style.transform = `translateY(${pinned}px)`;

      // Progreso 0 → 1
      const progress = maxScroll > 0 ? pinned / maxScroll : 0;

      // Barra de progreso
      if (fill) {
        fill.style.transform = `scaleY(${1 / N + progress * (1 - 1 / N)})`;
      }

      // Ítem y slide activo
      const activeIndex = Math.min(N - 1, Math.floor(progress * N));
      if (activeIndex !== lastActive) {
        listItems[lastActive].style.color   = INACTIVE_COLOR;
        slides[lastActive].style.opacity    = '0';
        slides[lastActive].style.visibility = 'hidden';

        listItems[activeIndex].style.color   = ACTIVE_COLOR;
        slides[activeIndex].style.opacity    = '1';
        slides[activeIndex].style.visibility = 'visible';

        lastActive = activeIndex;
      }
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // calcular estado inicial al montar

    this.lfwScrollCleanup = () => {
      scrollEl.removeEventListener('scroll', onScroll);
      if (inner) inner.style.transform = '';
      listItems.forEach(item => { item.style.color = ''; });
      slides.forEach(slide => {
        slide.style.opacity    = '';
        slide.style.visibility = '';
      });
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
   * Hero: columna derecha — carrusel vertical (SVG banner) que avanza cada 2 s.
   */
  /**
   * Hero words rotator — versión simple y robusta.
   * Cada palabra tiene position:absolute dentro del viewport.
   * Solo se alterna la clase .is-active; CSS maneja el fade/slide.
   * Sin clones, sin cálculos de translateY, sin dependencia del tamaño.
   */
  initHeroWordsRotator() {
    if (typeof this.heroWordsRotatorCleanup === 'function') {
      this.heroWordsRotatorCleanup();
      this.heroWordsRotatorCleanup = null;
    }

    const items = Array.from(
      document.querySelectorAll('.landing-hero__words-item')
    );
    if (!items.length) return;

    let current = 0;

    const activate = (idx) => {
      items.forEach((item, i) => {
        item.classList.toggle('is-active', i === idx);
      });
    };

    // Mostrar la primera palabra de inmediato
    activate(0);

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      this.heroWordsRotatorCleanup = () => {};
      return;
    }

    const timer = window.setInterval(() => {
      current = (current + 1) % items.length;
      activate(current);
    }, 2000);

    this.heroWordsRotatorCleanup = () => {
      window.clearInterval(timer);
    };
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

