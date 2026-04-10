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

    track.querySelectorAll('img').forEach((img) => {
      img.addEventListener('load', scheduleUpdate, { passive: true });
    });

    scheduleUpdate();

    const onResize = () => update(false);
    window.addEventListener('resize', onResize, { passive: true });

    if (reduceMotion) {
      currentIndex = baseLength;
      update(false);
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

// ── Hero canvas: líneas verticales con efecto prisma + --brand-gradient ──────
class HeroParticleCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.lines  = [];
    this.mouse  = { x: -9999, y: -9999 };
    this.raf    = null;
    this._dpr   = Math.min(window.devicePixelRatio || 1, 2);
    this._w = 0;
    this._h = 0;

    this._onMove   = this._onMove.bind(this);
    this._onLeave  = this._onLeave.bind(this);
    this._onTouch  = this._onTouch.bind(this);
    this._onResize = this._onResize.bind(this);

    this._buildGradientSampler();
    this._init();
  }

  // ── Sampler: lee --brand-gradient, renderiza en canvas 512×1, guarda pixels ──
  _buildGradientSampler() {
    const css = getComputedStyle(document.documentElement);
    let raw = css.getPropertyValue('--brand-gradient').trim();
    if (!raw) raw = 'linear-gradient(90deg,#ff0000 0%,#ff6500 12.5%,#ffe500 25%,#9acc00 37.5%,#00d614 50%,#00e7ff 62.5%,#0018ee 75%,#5b00ea 87.5%,#900090 100%)';

    const stopRe = /(#[0-9a-fA-F]{3,8})\s+([\d.]+)%/g;
    const stops  = [];
    let m;
    while ((m = stopRe.exec(raw)) !== null) stops.push({ color: m[1], t: parseFloat(m[2]) / 100 });

    const W = 512;
    const oc = document.createElement('canvas');
    oc.width = W; oc.height = 1;
    const octx = oc.getContext('2d');
    const grad = octx.createLinearGradient(0, 0, W, 0);
    stops.forEach(({ color, t }) => { try { grad.addColorStop(t, color); } catch (_) {} });
    octx.fillStyle = grad;
    octx.fillRect(0, 0, W, 1);
    this._gradPx = octx.getImageData(0, 0, W, 1).data;
    this._gradW  = W;
  }

  _sample(t) {
    const i = Math.min(Math.floor(t * (this._gradW - 1)), this._gradW - 1) * 4;
    return { r: this._gradPx[i], g: this._gradPx[i + 1], b: this._gradPx[i + 2] };
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
    this._buildLines();
  }

  // Crea una línea vertical por cada GAP píxeles horizontales.
  // Cada línea almacena su posición origen, velocidad y color del degradado.
  _buildLines() {
    const GAP   = 14;
    const count = Math.ceil(this._w / GAP) + 2;
    const offX  = (this._w % GAP) / 2;
    this.lines  = [];
    for (let i = 0; i < count; i++) {
      const ox            = offX + i * GAP;
      const { r, g, b }   = this._sample(ox / (this._w || 1));
      this.lines.push({ ox, x: ox, vx: 0, r, g, b });
    }
  }

  // ── Eventos ────────────────────────────────────────────────────────────────
  _onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
  }

  _onLeave() { this.mouse.x = -9999; this.mouse.y = -9999; }

  _onTouch(e) {
    if (!e.touches?.[0]) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.touches[0].clientX - rect.left;
    this.mouse.y = e.touches[0].clientY - rect.top;
  }

  _onResize() { this._resize(); }

  // ── Física en eje X (las líneas solo se desplazan horizontalmente) ─────────
  _update() {
    const RADIUS  = 180;
    const SPRING  = 0.055;
    const DAMPING = 0.80;
    const FORCE   = 14;
    const mx = this.mouse.x;

    for (const l of this.lines) {
      const dx   = l.x - mx;
      const dist = Math.abs(dx);

      if (dist < RADIUS) {
        const ratio = (RADIUS - dist) / RADIUS;
        // Empuja la línea en la dirección que se aleja del cursor
        l.vx += (dist === 0 ? 1 : Math.sign(dx)) * ratio * FORCE;
      }

      l.vx += (l.ox - l.x) * SPRING; // muelle hacia origen
      l.vx *= DAMPING;                // amortiguación
      l.x  += l.vx;
    }
  }

  // ── Render: líneas verticales con grosor y opacidad según desplazamiento ───
  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this._w, this._h);

    for (const l of this.lines) {
      const disp  = Math.abs(l.x - l.ox);
      const t     = Math.min(disp / 65, 1); // 0 = reposo, 1 = máx desplazamiento

      const lw    = 0.7 + t * 2.0;          // 0.7 px en reposo → 2.7 px en movimiento
      const alpha = 0.08 + t * 0.76;        // casi invisible en reposo, vívido al moverse

      ctx.beginPath();
      ctx.moveTo(l.x, 0);
      ctx.lineTo(l.x, this._h);
      ctx.lineWidth   = lw;
      ctx.strokeStyle = `rgba(${l.r},${l.g},${l.b},${alpha.toFixed(2)})`;
      ctx.stroke();
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
