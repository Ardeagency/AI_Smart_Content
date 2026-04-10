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

// ── Hero canvas: sistema orbital prismático ───────────────────────────────────
// 9 orbes del espectro orbitan el cursor en planos inclinados distintos
// (como un átomo/giróscopo) con colas de cometa y expansión por velocidad.
class HeroParticleCanvas {

  // orR = radio de órbita base (px a escala 900px)
  // spd = velocidad angular (+ horario, - antihorario)
  // ph  = fase inicial distribuida para evitar clusters
  // tY  = factor de compresión vertical (< 1 = órbita más plana = efecto 3D)
  static SPECTRUM = [
    { cr: 255, cg:   0, cb:   0, orR:  75, spd:  0.015, ph: 0.00, tY: 0.28 }, // rojo
    { cr: 255, cg: 101, cb:   0, orR: 115, spd: -0.010, ph: 0.70, tY: 0.72 }, // naranja
    { cr: 255, cg: 229, cb:   0, orR: 142, spd:  0.008, ph: 1.40, tY: 0.35 }, // amarillo
    { cr: 154, cg: 204, cb:   0, orR:  95, spd: -0.013, ph: 2.10, tY: 0.88 }, // lima
    { cr:   0, cg: 214, cb:  20, orR: 162, spd:  0.007, ph: 2.80, tY: 0.52 }, // verde
    { cr:   0, cg: 231, cb: 255, orR: 128, spd: -0.009, ph: 3.50, tY: 0.38 }, // cian
    { cr:   0, cg:  24, cb: 238, orR: 178, spd:  0.005, ph: 4.20, tY: 0.82 }, // azul
    { cr:  91, cg:   0, cb: 234, orR: 108, spd: -0.011, ph: 4.90, tY: 0.62 }, // violeta
    { cr: 144, cg:   0, cb: 144, orR:  82, spd:  0.016, ph: 5.60, tY: 0.90 }, // magenta
  ];

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.raf    = null;
    this._dpr   = Math.min(window.devicePixelRatio || 1, 2);
    this._w = 0; this._h = 0;
    this._idle  = 0;
    this.mouse  = { x: -9999, y: -9999 };
    this._cx    = null; this._cy = null; // centro lerpeado
    this._px    = 0;   this._py = 0;    // posición previa (para velocidad)
    this._vel   = 0;                    // magnitud de velocidad suavizada
    // Estado individual por orbe
    this._phases = HeroParticleCanvas.SPECTRUM.map(o => o.ph);
    this._trails  = HeroParticleCanvas.SPECTRUM.map(() => []); // colas de cometa

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
    this.canvas.addEventListener('touchend',  this._onLeave, { passive: true });
    this._loop();
  }

  _resize() {
    const dpr = this._dpr;
    const w   = this.canvas.offsetWidth;
    const h   = this.canvas.offsetHeight;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = w; this._h = h;
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
    const hasMouse = this.mouse.x !== -9999;
    let tx, ty;

    if (hasMouse) {
      tx = this.mouse.x; ty = this.mouse.y;
    } else {
      // Lissajous 1:2 autónomo cuando no hay cursor
      this._idle += 0.004;
      const ph = this._idle;
      tx = this._w * 0.5 + Math.cos(ph)     * this._w * 0.28;
      ty = this._h * 0.5 + Math.sin(ph * 2) * this._h * 0.18;
    }

    // Lerp del centro: rápido con cursor, lento en idle
    this._px = this._cx; this._py = this._cy;
    const ease = hasMouse ? 0.10 : 0.035;
    this._cx += (tx - this._cx) * ease;
    this._cy += (ty - this._cy) * ease;

    // Velocidad suavizada → controla cuánto se expanden las órbitas
    const dvx = this._cx - this._px;
    const dvy = this._cy - this._py;
    const spd = Math.sqrt(dvx * dvx + dvy * dvy);
    this._vel += (spd - this._vel) * 0.12;

    const spec   = HeroParticleCanvas.SPECTRUM;
    const SCALE  = Math.min(this._w, this._h) / 900;
    const SPREAD = 1 + Math.min(this._vel / 25, 0.85); // expansión por velocidad

    for (let i = 0; i < spec.length; i++) {
      this._phases[i] += spec[i].spd;
      const o     = spec[i];
      const angle = this._phases[i];
      const orR   = o.orR * SCALE * SPREAD;
      // tY comprime el eje Y → da el efecto de plano inclinado (sensación 3D)
      const ox = this._cx + Math.cos(angle) * orR;
      const oy = this._cy + Math.sin(angle) * orR * o.tY;

      const trail = this._trails[i];
      trail.push({ x: ox, y: oy });
      if (trail.length > 10) trail.shift(); // cola de 10 fotogramas
    }
  }

  _draw() {
    const ctx  = this.ctx;
    const spec = HeroParticleCanvas.SPECTRUM;
    // BASE = tamaño del gradiente de cada orbe, proporcional al viewport
    const BASE = Math.min(this._w, this._h) * 0.16;

    ctx.clearRect(0, 0, this._w, this._h);
    // 'screen' = mezcla aditiva de luz: los colores se suman como luz real
    ctx.globalCompositeOperation = 'screen';

    // ── Colas de cometa (atrás de cada orbe) ──
    for (let i = 0; i < spec.length; i++) {
      const o     = spec[i];
      const trail = this._trails[i];
      for (let j = 0; j < trail.length - 1; j++) {
        const tp = trail[j];
        const t  = (j + 1) / trail.length; // 0 = más antiguo, 1 = más reciente
        const r  = BASE * (0.12 + t * 0.38);
        const a  = t * 0.18;
        const g  = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r);
        g.addColorStop(0, `rgba(${o.cr},${o.cg},${o.cb},${a.toFixed(2)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    // ── Orbes (posición actual = cabeza de la cola) ──
    for (let i = 0; i < spec.length; i++) {
      const o     = spec[i];
      const trail = this._trails[i];
      if (!trail.length) continue;
      const pos = trail[trail.length - 1];

      // Pulso sutil de tamaño basado en la fase orbital de cada orbe
      const pulse = 1 + Math.sin(this._phases[i] * 0.35) * 0.07;
      const sz    = BASE * pulse;

      const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, sz);
      g.addColorStop(0,    `rgba(${o.cr},${o.cg},${o.cb},0.72)`);
      g.addColorStop(0.28, `rgba(${o.cr},${o.cg},${o.cb},0.34)`);
      g.addColorStop(0.65, `rgba(${o.cr},${o.cg},${o.cb},0.09)`);
      g.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, sz, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    // ── Núcleo blanco en el centro anclado al cursor ──
    const cx    = this._cx;
    const cy    = this._cy;
    const coreR = Math.min(this._w, this._h) * 0.09;
    const core  = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0,    'rgba(255,255,255,0.96)');
    core.addColorStop(0.20, 'rgba(255,255,255,0.62)');
    core.addColorStop(0.58, 'rgba(255,255,255,0.15)');
    core.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
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
    this.canvas.removeEventListener('touchend',  this._onLeave);
  }
}
