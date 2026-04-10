/**
 * LandingView - Vista de la página principal (landing).
 * Muestra botón Login; el login se hace en /login (SignInView).
 */
class LandingView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'landing.html';
    this.heroCanvasCleanup = null;
    this.flowTabsCleanup = null;
    this.landingHeaderScrollCleanup = null;
    this.whyCarouselCleanup = null;
    this.scrollRevealCleanup = null;
  }

  async onEnter() {
    // Página pública, sin redirección automática
  }

  async init() {
    this.initHeroCanvas();
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


  initHeroCanvas() {
    if (typeof this.heroCanvasCleanup === 'function') {
      this.heroCanvasCleanup();
      this.heroCanvasCleanup = null;
    }
    const canvas = document.querySelector('.landing-hero__canvas');
    if (!canvas) return;
    const instance = new HeroParticleCanvas(canvas);
    this.heroCanvasCleanup = () => instance.destroy();
  }

  onLeave() {
    if (typeof this.heroCanvasCleanup === 'function') {
      this.heroCanvasCleanup();
      this.heroCanvasCleanup = null;
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

// ── Hero canvas: orbe de luz prismática — mezcla aditiva como luz real ───────
class HeroParticleCanvas {
  // Espectro del prisma: mismos valores que --brand-gradient del sistema
  static PRISM = [
    { r: 255, g:   0, b:   0 },  // rojo
    { r: 255, g: 101, b:   0 },  // naranja
    { r: 255, g: 229, b:   0 },  // amarillo
    { r: 154, g: 204, b:   0 },  // lima
    { r:   0, g: 214, b:  20 },  // verde
    { r:   0, g: 231, b: 255 },  // cian
    { r:   0, g:  24, b: 238 },  // azul
    { r:  91, g:   0, b: 234 },  // violeta
    { r: 144, g:   0, b: 144 },  // magenta
  ];

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.raf    = null;
    this._dpr   = Math.min(window.devicePixelRatio || 1, 2);
    this._w     = 0;
    this._h     = 0;
    this._idle  = 0;   // fase Lissajous
    this._rot   = 0;   // rotación lenta de los orbes
    this.mouse  = { x: -9999, y: -9999 };
    this._cx    = null; // posición lerpeada X
    this._cy    = null; // posición lerpeada Y

    this._onMove   = this._onMove.bind(this);
    this._onLeave  = this._onLeave.bind(this);
    this._onTouch  = this._onTouch.bind(this);
    this._onResize = this._onResize.bind(this);
    this._init();
  }

  _init() {
    this._resize();
    window.addEventListener('resize', this._onResize, { passive: true });
    this.canvas.addEventListener('mousemove', this._onMove);
    this.canvas.addEventListener('mouseleave', this._onLeave);
    this.canvas.addEventListener('touchmove', this._onTouch, { passive: true });
    this.canvas.addEventListener('touchend', this._onLeave, { passive: true });
    this._loop();
  }

  _resize() {
    const dpr = this._dpr;
    const w   = this.canvas.offsetWidth;
    const h   = this.canvas.offsetHeight;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = w;
    this._h = h;
    if (this._cx === null) { this._cx = w / 2; this._cy = h / 2; }
  }

  _onMove(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
  }
  _onLeave()  { this.mouse.x = -9999; this.mouse.y = -9999; }
  _onTouch(e) {
    if (!e.touches?.[0]) return;
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.touches[0].clientX - r.left;
    this.mouse.y = e.touches[0].clientY - r.top;
  }
  _onResize() { this._resize(); }

  _update() {
    this._rot += 0.007; // rotación continua del espectro

    // Destino: cursor real o Lissajous 1:2 en figura-8
    const hasMouse = this.mouse.x !== -9999;
    let tx, ty;
    if (hasMouse) {
      tx = this.mouse.x;
      ty = this.mouse.y;
    } else {
      this._idle += 0.005;
      const ph = this._idle;
      tx = this._w * 0.5 + Math.cos(ph)     * this._w * 0.34;
      ty = this._h * 0.5 + Math.sin(ph * 2) * this._h * 0.23;
    }

    // Lerp: más rápido cuando el ratón está activo, más lento en idle
    const ease = hasMouse ? 0.1 : 0.035;
    this._cx += (tx - this._cx) * ease;
    this._cy += (ty - this._cy) * ease;
  }

  _draw() {
    const ctx    = this.ctx;
    const cx     = this._cx;
    const cy     = this._cy;
    const prism  = HeroParticleCanvas.PRISM;
    const n      = prism.length;

    ctx.clearRect(0, 0, this._w, this._h);

    // 'screen' = mezcla aditiva de luz: donde se solapan los colores se suman
    // hacia blanco, igual que prismas y luces de color reales
    ctx.globalCompositeOperation = 'screen';

    const BASE  = Math.min(this._w, this._h) * 0.30; // radio base del orbe
    const DRIFT = Math.min(this._w, this._h) * 0.06; // desplazamiento del centro

    for (let i = 0; i < n; i++) {
      const c     = prism[i];
      const angle = (i / n) * Math.PI * 2 + this._rot;
      const ox    = cx + Math.cos(angle) * DRIFT;
      const oy    = cy + Math.sin(angle) * DRIFT;

      // Cuerpo del orbe: gradiente radial muy suave
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, BASE);
      g.addColorStop(0,    `rgba(${c.r},${c.g},${c.b},0.60)`);
      g.addColorStop(0.30, `rgba(${c.r},${c.g},${c.b},0.28)`);
      g.addColorStop(0.70, `rgba(${c.r},${c.g},${c.b},0.06)`);
      g.addColorStop(1,    'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.arc(ox, oy, BASE, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    // Núcleo blanco: simula la fuente de luz detrás del prisma
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, BASE * 0.42);
    core.addColorStop(0,    'rgba(255,255,255,0.95)');
    core.addColorStop(0.20, 'rgba(255,255,255,0.60)');
    core.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    core.addColorStop(1,    'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.arc(cx, cy, BASE * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
  }

  _loop() {
    this._update();
    this._draw();
    this.raf = requestAnimationFrame(() => this._loop());
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mouseleave', this._onLeave);
    this.canvas.removeEventListener('touchmove', this._onTouch);
    this.canvas.removeEventListener('touchend', this._onLeave);
  }
}
