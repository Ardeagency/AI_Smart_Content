/**
 * LandingView - Vista de la página principal (landing).
 * Muestra botón Login; el login se hace en /login (SignInView).
 */
class LandingView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'landing.html';
    this.heroCanvasCleanup = null;
    this.heroWordsRotatorCleanup = null;
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
    this.initHeroWordsRotator();
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

  /**
   * Hero: columna derecha — carrusel vertical (SVG banner) que avanza cada 2 s.
   */
  initHeroWordsRotator() {
    if (typeof this.heroWordsRotatorCleanup === 'function') {
      this.heroWordsRotatorCleanup();
      this.heroWordsRotatorCleanup = null;
    }

    const viewport = document.querySelector('.landing-hero__words-viewport');
    const track = viewport?.querySelector('.landing-hero__words-track');
    if (!viewport || !track) return;

    const originalItems = Array.from(track.querySelectorAll('.landing-hero__words-item'));
    if (!originalItems.length) return;

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cloneItem = (item) => {
      const clone = item.cloneNode(true);
      clone.dataset.realIndex = item.dataset.realIndex || '0';
      return clone;
    };

    originalItems.forEach((item, index) => {
      item.dataset.realIndex = String(index);
    });

    track.innerHTML = '';
    const before = originalItems.map(cloneItem);
    const middle = originalItems.map(cloneItem);
    const after = originalItems.map(cloneItem);
    [...before, ...middle, ...after].forEach((item) => track.appendChild(item));

    const allItems = Array.from(track.querySelectorAll('.landing-hero__words-item'));
    const baseLength = originalItems.length;
    let currentIndex = baseLength;
    let heroWordsTimer = null;
    let jumpTimer = null;

    const getTrackGap = () => {
      const styles = window.getComputedStyle(track);
      const gapValue = styles.rowGap || styles.gap || '0';
      const parsed = Number.parseFloat(gapValue);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const update = (withTransition = true) => {
      const first = allItems[0];
      if (!first || !first.offsetHeight) return;
      const stepHeight = first.offsetHeight + getTrackGap();
      const centerOffset = (viewport.clientHeight - first.offsetHeight) / 2;
      const targetY = centerOffset - currentIndex * stepHeight;

      track.style.transition = withTransition
        ? 'transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1)'
        : 'none';
      track.style.transform = `translateY(${targetY}px)`;

      allItems.forEach((item) => item.classList.remove('is-active'));
      if (allItems[currentIndex]) {
        allItems[currentIndex].classList.add('is-active');
      }
    };

    const scheduleUpdate = () => {
      window.requestAnimationFrame(() => update(false));
    };

    /** Hasta que los SVG tengan altura (layout), el carrusel no puede centrar; reintenta unos frames. */
    const runUpdateWhenSized = (attemptsLeft = 20) => {
      const first = allItems[0];
      if (first && first.offsetHeight > 0) {
        update(false);
        return;
      }
      if (attemptsLeft <= 0) return;
      window.requestAnimationFrame(() => runUpdateWhenSized(attemptsLeft - 1));
    };

    track.querySelectorAll('img').forEach((img) => {
      img.addEventListener('load', scheduleUpdate, { passive: true });
    });

    runUpdateWhenSized();

    const onResize = () => update(false);
    window.addEventListener('resize', onResize, { passive: true });

    if (reduceMotion) {
      currentIndex = baseLength;
      this.heroWordsRotatorCleanup = () => {
        window.removeEventListener('resize', onResize);
      };
      return;
    }

    heroWordsTimer = window.setInterval(() => {
      currentIndex += 1;
      update(true);

      if (currentIndex >= baseLength * 2) {
        if (jumpTimer) window.clearTimeout(jumpTimer);
        jumpTimer = window.setTimeout(() => {
          currentIndex = baseLength;
          update(false);
          jumpTimer = null;
        }, 520);
      }
    }, 2000);

    this.heroWordsRotatorCleanup = () => {
      window.removeEventListener('resize', onResize);
      if (heroWordsTimer) window.clearInterval(heroWordsTimer);
      if (jumpTimer) window.clearTimeout(jumpTimer);
      heroWordsTimer = null;
      jumpTimer = null;
    };
  }

  onLeave() {
    if (typeof this.heroCanvasCleanup === 'function') {
      this.heroCanvasCleanup();
      this.heroCanvasCleanup = null;
    }
    if (typeof this.heroWordsRotatorCleanup === 'function') {
      this.heroWordsRotatorCleanup();
      this.heroWordsRotatorCleanup = null;
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

// ── Hero canvas: agua suave — sin bordes duros, sin lupa visible ─────────────
// Efecto: el área bajo el cursor se ilumina gradualmente (revela la foto sin
// la capa oscura) con un falloff radial suave + zoom sutil en un canvas
// offscreen enmascarado. Las ondas se expanden como en la superficie del agua.
class HeroParticleCanvas {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.mouse   = { x: -9999, y: -9999 };
    this._gX     = -9999; // posición suavizada (spring)
    this._gY     = -9999;
    this.raf     = null;
    this._dpr    = Math.min(window.devicePixelRatio || 1, 2);
    this._w = 0;
    this._h = 0;

    this._bgImage   = null;
    this._offCanvas = null; // canvas offscreen para el lente suave
    this._offCtx    = null;
    this._ripples   = [];
    this._prevMX    = -9999;
    this._prevMY    = -9999;

    this._LENS_R = 170;  // radio del lente (bordes se desvanecen gradualmente)
    this._ZOOM   = 1.45; // zoom sutil — casi imperceptible como lupa, muy natural

    this._onMove   = this._onMove.bind(this);
    this._onLeave  = this._onLeave.bind(this);
    this._onTouch  = this._onTouch.bind(this);
    this._onResize = this._onResize.bind(this);

    this._loadBg();
    this._init();
  }

  // ── Carga imagen y crea el canvas offscreen ────────────────────────────────
  _loadBg() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this._bgImage = img;
      this._buildOffscreen();
    };
    img.src = 'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1772113552/Fondos-01_fyfce2.jpg';
  }

  _buildOffscreen() {
    const D = this._LENS_R * 2;
    const oc = document.createElement('canvas');
    oc.width = D; oc.height = D;
    this._offCanvas = oc;
    this._offCtx    = oc.getContext('2d');
  }

  // ── Parámetros CSS background: center/cover ───────────────────────────────
  _bgCover() {
    if (!this._bgImage) return null;
    const iw = this._bgImage.naturalWidth;
    const ih = this._bgImage.naturalHeight;
    const scale = Math.max(this._w / iw, this._h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    return { dx: (this._w - dw) / 2, dy: (this._h - dh) / 2, dw, dh, iw, ih };
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
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
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = w;
    this._h = h;
  }

  // ── Eventos ────────────────────────────────────────────────────────────────
  _onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = e.clientX - rect.left;
    const ny = e.clientY - rect.top;

    // Emite onda cada ~10px de movimiento
    if (Math.hypot(nx - this._prevMX, ny - this._prevMY) > 10) {
      this._ripples.push({ x: nx, y: ny, r: 6, life: 1.0 });
      this._prevMX = nx;
      this._prevMY = ny;
    }

    this.mouse.x = nx;
    this.mouse.y = ny;
  }

  _onLeave() {
    this.mouse.x = this._prevMX = -9999;
    this.mouse.y = this._prevMY = -9999;
  }

  _onTouch(e) {
    if (!e.touches?.[0]) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.touches[0].clientX - rect.left;
    this.mouse.y = e.touches[0].clientY - rect.top;
  }

  _onResize() { this._resize(); }

  // ── Física ─────────────────────────────────────────────────────────────────
  _update() {
    // Spring suave: el efecto "flota" tras el cursor
    if (this.mouse.x !== -9999) {
      if (this._gX === -9999) { this._gX = this.mouse.x; this._gY = this.mouse.y; }
      else {
        this._gX += (this.mouse.x - this._gX) * 0.11;
        this._gY += (this.mouse.y - this._gY) * 0.11;
      }
    } else {
      this._gX = this._gY = -9999;
    }

    // Ondas: crecen y se desvanecen
    for (const rip of this._ripples) {
      rip.r    += 3.2;
      rip.life  = Math.max(0, 1 - (rip.r - 6) / 240);
    }
    this._ripples = this._ripples.filter(r => r.life > 0);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this._w, this._h);

    const mx = this._gX;
    const my = this._gY;

    // ── 1. Ondas expansivas (sobre el fondo CSS) ──────────────────────────
    for (const rip of this._ripples) {
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${(rip.life * 0.16).toFixed(2)})`;
      ctx.lineWidth   = 1;
      ctx.stroke();
    }

    if (mx === -9999 || !this._bgImage || !this._offCanvas) return;

    const bg = this._bgCover();
    const R  = this._LENS_R;
    const Z  = this._ZOOM;

    // ── 2. Lente suave: imagen ampliada en canvas offscreen + máscara radial ─
    // Sin ctx.clip() → sin borde duro. La máscara desvanece los bordes.
    const oc = this._offCtx;
    const D  = R * 2;
    oc.clearRect(0, 0, D, D);

    // Dibuja porción ampliada de la imagen
    const imgPerPx = bg.iw / bg.dw;
    const imgCX    = (mx - bg.dx) * imgPerPx;
    const imgCY    = (my - bg.dy) * imgPerPx;
    const srcHalf  = (R * imgPerPx) / Z; // más pequeño = más zoom

    oc.drawImage(
      this._bgImage,
      imgCX - srcHalf, imgCY - srcHalf, srcHalf * 2, srcHalf * 2,
      0, 0, D, D
    );

    // Máscara radial: sólida en el centro, transparente en el borde
    // → elimina cualquier borde duro, parece que la imagen "emerge" del agua
    oc.globalCompositeOperation = 'destination-in';
    const mask = oc.createRadialGradient(R, R, 0, R, R, R);
    mask.addColorStop(0.00, 'rgba(0,0,0,1)');
    mask.addColorStop(0.45, 'rgba(0,0,0,0.95)');
    mask.addColorStop(0.72, 'rgba(0,0,0,0.60)');
    mask.addColorStop(0.90, 'rgba(0,0,0,0.20)');
    mask.addColorStop(1.00, 'rgba(0,0,0,0)');
    oc.fillStyle = mask;
    oc.fillRect(0, 0, D, D);
    oc.globalCompositeOperation = 'source-over';

    // Composita el lente suave sobre el canvas principal
    ctx.drawImage(this._offCanvas, mx - R, my - R);

    // ── 3. Halo de luz en la superficie del agua ──────────────────────────
    // Simula el brillo que hace el agua cuando la luz toca su superficie
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, R * 0.75);
    glow.addColorStop(0,   'rgba(255,255,255,0.07)');
    glow.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    glow.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - R, my - R, D, D);
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
