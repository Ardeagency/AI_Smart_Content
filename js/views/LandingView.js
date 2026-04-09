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
    this.threadsRevealCleanup = null;
    this.threadsInteractionCleanup = null;
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
    this.initLandingThreadsReveal();
    this.initThreadsInteraction();
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
   * Threads: burbujas interactivas — drag que mueve la línea SVG en tiempo real
   * + click para seleccionar (highlight / dim) y mostrar panel de detalle.
   */
  initThreadsInteraction() {
    if (typeof this.threadsInteractionCleanup === 'function') {
      this.threadsInteractionCleanup();
      this.threadsInteractionCleanup = null;
    }

    const section = document.getElementById('landing-after-pillars');
    if (!section) return;

    const fan    = section.querySelector('.landing-threads__fan');
    const svgEl  = section.querySelector('.landing-threads__svg');
    const rows   = [...section.querySelectorAll('.landing-threads__row')];
    const curves = [...section.querySelectorAll('.landing-threads__curve')];
    const detail = section.querySelector('.landing-threads__detail');
    if (!fan || !svgEl || !rows.length || !curves.length || !detail) return;

    // Contenido de cada capacidad (mismo orden que los rows del HTML)
    const PILLARS = [
      { title: 'Fotografía',   color: '#ff1744', desc: 'Captura y optimiza imágenes automáticamente para cada plataforma. Ajusta encuadres, formatos y estética visual según tu identidad de marca.' },
      { title: 'Scraping',     color: '#ff6500', desc: 'Extrae tendencias, precios y contenido relevante de la competencia en tiempo real para informar y acelerar tu estrategia.' },
      { title: 'Reels',        color: '#ffe500', desc: 'Guiones, edición y publicación de Reels de alto impacto, optimizados para el algoritmo de cada red social.' },
      { title: 'Historias',    color: '#c5e60a', desc: 'Historias diarias coherentes con tu ADN de marca, sin esfuerzo ni inconsistencias visuales.' },
      { title: 'Marketing',    color: '#00d614', desc: 'Estrategias de marketing inteligentes basadas en datos reales, no en suposiciones. Cada decisión tiene un porqué.' },
      { title: 'Monitoreo',    color: '#00e7ff', desc: 'Vigilancia 24/7 de tu presencia digital y la de tu competencia. Alertas en tiempo real ante cambios y oportunidades.' },
      { title: 'Análisis',     color: '#2979ff', desc: 'Insights profundos sobre rendimiento, audiencia y oportunidades de contenido. Datos que se convierten en decisiones claras.' },
      { title: 'Estrategia',   color: '#5b00ea', desc: 'Planificación de contenido mensual alineada con tus objetivos de negocio y los patrones de consumo de tu audiencia.' },
      { title: 'Post',         color: '#d500f9', desc: 'Posts optimizados para cada plataforma con captions que generan engagement real y conversiones medibles.' },
      { title: 'ADN de marca', color: '#ea00b7', desc: 'Tu voz, tus colores y tu esencia codificados en la IA. Cada pieza de contenido es auténticamente tuya.' },
      { title: 'Competencia',  color: '#bf360c', desc: 'Benchmarking automático y análisis de brechas para mantenerte siempre un paso adelante del mercado.' },
      { title: 'Campañas',     color: '#00bfa5', desc: 'Campañas completas de principio a fin: desde la idea inicial hasta los resultados medibles y el aprendizaje.' },
    ];

    // Punto de convergencia SVG (fijo)
    const CX = 66, CY = 50;
    // Posiciones Y por defecto de cada burbuja en el espacio SVG
    const DEFAULT_SVG_Y = [4.167, 12.5, 20.833, 29.167, 37.5, 45.833, 54.167, 62.5, 70.833, 79.167, 87.5, 95.833];
    const DEFAULT_SVG_X = 27;

    // Construye el atributo `d` para una curva desde (sx, sy) a (CX, CY)
    function buildPath(sx, sy) {
      const cp1x = Math.min(sx + 17, CX - 8);
      return `M ${sx.toFixed(2)} ${sy.toFixed(2)} C ${cp1x.toFixed(2)} ${sy.toFixed(2)}, 56 ${CY}, ${CX} ${CY}`;
    }

    // Convierte coordenadas de página al espacio SVG
    function pageToSvg(px, py) {
      const pt  = svgEl.createSVGPoint();
      pt.x = px; pt.y = py;
      const ctm = svgEl.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm.inverse()) : null;
    }

    // Animación JS para path SVG (easing cubic-out, ~420ms)
    function animatePath(pathEl, x0, y0, x1, y1, dur) {
      const t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      function frame(now) {
        const p  = Math.min(1, (now - t0) / dur);
        const ep = ease(p);
        pathEl.setAttribute('d', buildPath(x0 + (x1 - x0) * ep, y0 + (y1 - y0) * ep));
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    // ── Estado de selección ──────────────────────────────────────────────────
    let activeIdx = -1;

    function clearSelection() {
      activeIdx = -1;
      rows.forEach((r)   => r.classList.remove('is-active', 'is-dimmed'));
      curves.forEach((c) => c.classList.remove('is-curve-active', 'is-curve-dimmed'));
      detail.classList.remove('is-open');
    }

    function selectBubble(idx) {
      if (activeIdx === idx) { clearSelection(); return; }
      activeIdx = idx;
      rows.forEach((r, i) => {
        r.classList.toggle('is-active', i === idx);
        r.classList.toggle('is-dimmed', i !== idx);
      });
      curves.forEach((c, i) => {
        c.classList.toggle('is-curve-active',  i === idx);
        c.classList.toggle('is-curve-dimmed',  i !== idx);
      });
      const p = PILLARS[idx];
      detail.querySelector('.landing-threads__detail-title').textContent = p.title;
      detail.querySelector('.landing-threads__detail-desc').textContent  = p.desc;
      detail.style.setProperty('--detail-color', p.color);
      detail.classList.add('is-open');
    }

    // ── Drag interactivo ─────────────────────────────────────────────────────
    const DRAG_THRESH = 5;
    const listeners   = [];

    function on(el, type, fn, opts) {
      el.addEventListener(type, fn, opts);
      listeners.push({ el, type, fn, opts });
    }

    rows.forEach((row, i) => {
      const bubble = row.querySelector('.landing-threads__bubble');
      if (!bubble) return;

      let dragging = false, moved = false;
      let startCX = 0, startCY = 0;   // clientX/Y al inicio
      let defPX = 0, defPY = 0;        // centro de burbuja en página al inicio
      let curSvgX = DEFAULT_SVG_X, curSvgY = DEFAULT_SVG_Y[i]; // posición SVG actual

      on(bubble, 'pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        const r = bubble.getBoundingClientRect();
        defPX   = r.left + r.width  / 2;
        defPY   = r.top  + r.height / 2;
        startCX = e.clientX;
        startCY = e.clientY;
        curSvgX = DEFAULT_SVG_X;
        curSvgY = DEFAULT_SVG_Y[i];
        dragging = true; moved = false;
        bubble.setPointerCapture(e.pointerId);
        row.style.zIndex = '10';
      }, { passive: false });

      on(bubble, 'pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startCX;
        const dy = e.clientY - startCY;
        if (!moved && (Math.abs(dx) > DRAG_THRESH || Math.abs(dy) > DRAG_THRESH)) {
          moved = true;
          row.classList.add('is-dragging');
          bubble.style.transition = 'none';
        }
        if (!moved) return;

        bubble.style.transform = `translate(${dx}px,${dy}px) scale(1.09)`;

        // Convierte nuevo centro a SVG y actualiza la curva
        const sp = pageToSvg(defPX + dx, defPY + dy);
        if (sp) {
          curSvgX = Math.max(2,  Math.min(50, sp.x));
          curSvgY = Math.max(1,  Math.min(99, sp.y));
          curves[i].setAttribute('d', buildPath(curSvgX, curSvgY));
        }
      }, { passive: true });

      on(bubble, 'pointerup', (e) => {
        if (!dragging) return;
        dragging = false;

        if (!moved) {
          // Es un click: seleccionar
          row.style.zIndex = '';
          selectBubble(i);
          return;
        }

        // Snap-back animado: burbuja y curva vuelven a su posición
        row.classList.remove('is-dragging');
        row.style.zIndex = '';
        bubble.style.transition = 'transform 0.42s cubic-bezier(0.34,1.56,0.64,1)';
        bubble.style.transform  = '';
        animatePath(curves[i], curSvgX, curSvgY, DEFAULT_SVG_X, DEFAULT_SVG_Y[i], 420);
        setTimeout(() => { bubble.style.transition = ''; }, 450);
        moved = false;
      });

      on(bubble, 'pointercancel', () => {
        if (!dragging) return;
        dragging = false; moved = false;
        row.classList.remove('is-dragging');
        row.style.zIndex = '';
        bubble.style.transition = 'transform 0.35s ease';
        bubble.style.transform  = '';
        setTimeout(() => { bubble.style.transition = ''; }, 380);
        curves[i].setAttribute('d', buildPath(DEFAULT_SVG_X, DEFAULT_SVG_Y[i]));
      });

      // Soporte teclado (Enter / Space sobre el bubble)
      on(bubble, 'keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBubble(i); }
      });
    });

    // Botón de cierre del panel
    const closeBtn = detail.querySelector('.landing-threads__detail-close');
    if (closeBtn) on(closeBtn, 'click', clearSelection);

    // Click fuera del fan → cerrar
    on(document, 'pointerdown', (e) => {
      if (activeIdx >= 0 && !fan.contains(e.target)) clearSelection();
    }, { passive: true });

    this.threadsInteractionCleanup = () => {
      listeners.forEach(({ el, type, fn, opts }) => el.removeEventListener(type, fn, opts));
      clearSelection();
    };
  }

  /**
   * Sección de línea / fragmentos / burbujas: animación al entrar en viewport.
   */
  initLandingThreadsReveal() {
    if (typeof this.threadsRevealCleanup === 'function') {
      this.threadsRevealCleanup();
      this.threadsRevealCleanup = null;
    }

    const el = document.getElementById('landing-after-pillars');
    if (!el) return;

    const reveal = () => {
      el.classList.add('landing-threads--visible');
    };

    if (typeof IntersectionObserver === 'undefined') {
      reveal();
      return;
    }

    const MIN_RATIO = 0.14;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.intersectionRatio >= MIN_RATIO) {
            reveal();
            io.unobserve(entry.target);
            break;
          }
        }
      },
      {
        root: null,
        rootMargin: '0px 0px -14% 0px',
        threshold: [0, 0.05, 0.1, 0.14, 0.15, 0.2, 0.25, 0.35, 0.5, 0.75, 1],
      }
    );

    io.observe(el);

    this.threadsRevealCleanup = () => {
      io.disconnect();
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
    if (typeof this.threadsRevealCleanup === 'function') {
      this.threadsRevealCleanup();
      this.threadsRevealCleanup = null;
    }
    if (typeof this.threadsInteractionCleanup === 'function') {
      this.threadsInteractionCleanup();
      this.threadsInteractionCleanup = null;
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
