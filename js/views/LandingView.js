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

// ── Hero canvas: partículas magnéticas con repulsión de cursor ──────────────
class HeroParticleCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: -9999, y: -9999 };
    this.raf = null;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._w = 0;
    this._h = 0;

    this._onMove  = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._onTouch = this._onTouch.bind(this);
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
    const w = this.canvas.offsetWidth;
    const h = this.canvas.offsetHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = w;
    this._h = h;
    this._buildGrid();
  }

  _buildGrid() {
    const GAP = 30;
    const cols = Math.ceil(this._w / GAP) + 1;
    const rows = Math.ceil(this._h / GAP) + 1;
    const offX = (this._w % GAP) / 2;
    const offY = (this._h % GAP) / 2;
    this.particles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = offX + c * GAP;
        const oy = offY + r * GAP;
        this.particles.push({ ox, oy, x: ox, y: oy, vx: 0, vy: 0 });
      }
    }
  }

  _onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
  }

  _onLeave() {
    this.mouse.x = -9999;
    this.mouse.y = -9999;
  }

  _onTouch(e) {
    if (!e.touches?.[0]) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.touches[0].clientX - rect.left;
    this.mouse.y = e.touches[0].clientY - rect.top;
  }

  _onResize() { this._resize(); }

  _update() {
    const RADIUS = 150;
    const SPRING = 0.07;
    const DAMPING = 0.78;
    const FORCE  = 7;
    const mx = this.mouse.x;
    const my = this.mouse.y;

    for (const p of this.particles) {
      const dx = p.x - mx;
      const dy = p.y - my;
      const distSq = dx * dx + dy * dy;

      if (distSq < RADIUS * RADIUS) {
        const dist = Math.sqrt(distSq) || 1;
        const ratio = (RADIUS - dist) / RADIUS;
        p.vx += (dx / dist) * ratio * FORCE;
        p.vy += (dy / dist) * ratio * FORCE;
      }

      p.vx += (p.ox - p.x) * SPRING;
      p.vy += (p.oy - p.y) * SPRING;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x  += p.vx;
      p.y  += p.vy;
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this._w, this._h);

    for (const p of this.particles) {
      const dx = p.x - p.ox;
      const dy = p.y - p.oy;
      const disp = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(disp / 55, 1);
      const r = 1.4 + t * 2.2;
      const a = 0.09 + t * 0.72;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.fill();
    }
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
