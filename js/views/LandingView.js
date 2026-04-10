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

// ── Hero canvas: lupa de agua con ondas y efecto glass ───────────────────────
// El canvas es transparente excepto dentro del lente: la imagen de fondo se
// amplía (zoom) dentro de un círculo que sigue el cursor con inercia suave,
// revelando la foto sin la capa oscura ::before. Las ondas se expanden al mover.
class HeroParticleCanvas {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.mouse   = { x: -9999, y: -9999 };
    this._lensX  = -9999; // posición suavizada del lente
    this._lensY  = -9999;
    this.raf     = null;
    this._dpr    = Math.min(window.devicePixelRatio || 1, 2);
    this._w = 0;
    this._h = 0;

    this._bgImage  = null;    // imagen de fondo cargada
    this._ripples  = [];      // ondas expansivas
    this._prevMX   = -9999;
    this._prevMY   = -9999;

    this._LENS_R   = 125;     // radio del lente en px CSS
    this._ZOOM     = 2.4;     // factor de ampliación

    this._onMove   = this._onMove.bind(this);
    this._onLeave  = this._onLeave.bind(this);
    this._onTouch  = this._onTouch.bind(this);
    this._onResize = this._onResize.bind(this);

    this._loadBg();
    this._init();
  }

  // ── Carga la imagen de fondo (misma URL que el CSS) ────────────────────────
  _loadBg() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { this._bgImage = img; };
    img.src = 'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1772113552/Fondos-01_fyfce2.jpg';
  }

  // ── Parámetros para replicar CSS background: center/cover ─────────────────
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

    // Emite onda cuando el cursor se mueve lo suficiente
    if (Math.hypot(nx - this._prevMX, ny - this._prevMY) > 14) {
      this._ripples.push({ x: nx, y: ny, r: 0, life: 1.0 });
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

  // ── Física: inercia suave del lente + avance de ondas ─────────────────────
  _update() {
    // Spring follow: el lente "flota" tras el cursor como agua
    if (this.mouse.x !== -9999) {
      if (this._lensX === -9999) {
        this._lensX = this.mouse.x;
        this._lensY = this.mouse.y;
      } else {
        this._lensX += (this.mouse.x - this._lensX) * 0.14;
        this._lensY += (this.mouse.y - this._lensY) * 0.14;
      }
    } else {
      this._lensX = this._lensY = -9999;
    }

    // Ondas: radio crece, opacidad baja
    for (const rip of this._ripples) {
      rip.r    += 2.6;
      rip.life  = Math.max(0, 1 - rip.r / 220);
    }
    this._ripples = this._ripples.filter(r => r.life > 0);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this._w, this._h);

    // Ondas (visibles sobre el fondo CSS)
    for (const rip of this._ripples) {
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${(rip.life * 0.20).toFixed(2)})`;
      ctx.lineWidth   = 1;
      ctx.stroke();
    }

    const mx = this._lensX;
    const my = this._lensY;
    if (mx === -9999 || !this._bgImage) return;

    const bg = this._bgCover();
    const R  = this._LENS_R;
    const Z  = this._ZOOM;

    // ── 1. Imagen ampliada dentro del lente ───────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, R, 0, Math.PI * 2);
    ctx.clip();

    // Convierte canvas px → píxeles de imagen, luego ajusta el zoom
    const imgPerPx = bg.iw / bg.dw;
    const imgCX    = (mx - bg.dx) * imgPerPx;
    const imgCY    = (my - bg.dy) * imgPerPx;
    const srcHalf  = (R * imgPerPx) / Z; // región fuente más pequeña = más zoom

    ctx.drawImage(
      this._bgImage,
      imgCX - srcHalf, imgCY - srcHalf, srcHalf * 2, srcHalf * 2, // fuente
      mx - R, my - R, R * 2, R * 2                                  // destino
    );
    ctx.restore();

    // ── 2. Brillo glass interior (reflejo superior-izquierda) ─────────────
    ctx.save();
    const shine = ctx.createRadialGradient(
      mx - R * 0.28, my - R * 0.32, R * 0.04,
      mx, my, R
    );
    shine.addColorStop(0.00, 'rgba(255,255,255,0.18)');
    shine.addColorStop(0.42, 'rgba(255,255,255,0.03)');
    shine.addColorStop(1.00, 'rgba(0,0,0,0.10)');
    ctx.beginPath();
    ctx.arc(mx, my, R, 0, Math.PI * 2);
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.restore();

    // ── 3. Borde del lente ────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Halo exterior difuso (segunda pasada, más gruesa y más tenue)
    ctx.beginPath();
    ctx.arc(mx, my, R + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 8;
    ctx.stroke();
    ctx.restore();
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
