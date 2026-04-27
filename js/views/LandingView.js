/**
 * LandingView - Landing pública (/).
 * Extiende PublicBaseView: reutiliza el shell persistente (header + footer)
 * y solo aporta su propio contenido inline. Sin templates.
 *
 * Secciones (Blueprint v2 — 4 zonas psicológicas):
 *   Zona 1 — Captura:          S01 Hero, S02 Credibilidad
 *   Zona 2 — Problema:         S03 Dolor estructural, S04 Agitación
 *   Zona 3 — Solución:         S05 Capacidades, S06 VERA, S07 Dashboard
 *   Zona 4 — Confianza+Acción: S08 Por qué (carrusel), S09 Lo que pasa, S10 FAQ, S11 CTA
 */
class LandingView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/';
    this.pageClass = 'public-page--landing';
    this.heroRevealCleanup = null;
    this.painRoadmapCleanup = null;
    this.faqCleanup = null;
    this.ctaFormCleanup = null;
    this.appPreviewCleanup = null;
    this.whyCarouselCleanup = null;
    this.capsPropostaCleanup = null;
    this.veraRailScrollCleanup = null;
    this.agitScrollCleanup = null;
  }

  getCredBrands() {
    return [
      { name: 'Meta', src: 'https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/meta.svg', width: 32, height: 28 },
      { name: 'Google', src: 'https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/google.svg', width: 32, height: 28 },
      { name: 'TikTok', src: 'https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/tiktok.svg', width: 32, height: 28 },
      { name: 'X', src: 'https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/x.svg', width: 32, height: 28 },
      { name: 'Amazon', src: 'https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/amazon.svg', width: 32, height: 28 },
      { name: 'Mercado Libre', src: 'https://upload.wikimedia.org/wikipedia/commons/6/60/Mercado_Libre_wordmark_%28Spanish_version%29.svg', width: 72, height: 18, wide: true },
      { name: 'OpenAI', src: 'https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/openai.svg', width: 32, height: 28 },
      { name: 'Anthropic', src: 'https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/anthropic.svg', width: 32, height: 28 },
      { name: 'KlingAI', src: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/kling.svg', width: 32, height: 28 },
      { name: 'Nano Banana PRO', src: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/nanobanana.svg', width: 32, height: 28 },
      { name: 'Seedance 2.0', src: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/bytedance.svg', width: 32, height: 28 },
      { name: 'ComfyUI', src: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/comfyui.svg', width: 32, height: 28 },
      { name: 'n8n', src: 'https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/n8n.svg', width: 32, height: 28 },
      { name: 'Kie AI', src: 'https://kie.ai/logo.png', width: 32, height: 28 },
    ];
  }

  renderCredBrand(brand) {
    const wideClass = brand.wide ? ' lp-cred__brand--wide' : '';
    return `
      <div class="lp-cred__brand${wideClass}" title="${brand.name}">
        <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="${brand.src}" alt="" width="${brand.width}" height="${brand.height}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
        <span class="lp-cred__brand-label">${brand.name}</span>
      </div>
    `;
  }

  renderCredibilityTrack() {
    const brands = this.getCredBrands();
    const loopBrands = brands.concat(brands);
    return loopBrands.map((brand) => this.renderCredBrand(brand)).join('');
  }

  renderContent() {
    return `
      <!-- ════════ S01: HERO ════════ -->
      <section class="lp-hero" id="landing-1" aria-label="Hero principal">
        <div class="lp-hero__bg" aria-hidden="true">
          <span class="lp-hero__glow lp-hero__glow--1" aria-hidden="true"></span>
          <span class="lp-hero__glow lp-hero__glow--2" aria-hidden="true"></span>
        </div>
        <div class="lp-hero__noise" aria-hidden="true"></div>
        <div class="lp-hero__inner">
          <h1 class="lp-hero__headline" data-reveal>
            <span class="lp-hero__headline-line">Automatizar no es perder control.</span>
            <span class="lp-hero__headline-line">Es ejecutar mejor.</span>
          </h1>
          <p class="lp-hero__sub" data-reveal>
            Opera bajo tu ADN, aprende del mercado y actúa sin desviarse.
          </p>
          <div class="lp-hero__actions" data-reveal>
            <a href="#landing-6" class="lp-hero__cta lp-hero__cta--primary">Ver cómo funciona</a>
          </div>
        </div>
      </section>

      <!-- ════════ S02: CREDIBILIDAD INMEDIATA ════════ -->
      <section class="lp-cred" id="landing-2" aria-labelledby="lp-cred-heading">
        <div class="lp-cred__inner">
          <h2 id="lp-cred-heading" class="lp-cred__title">Lo que hace que todo funcione</h2>
          <p class="sr-only">
            Plataformas e integraciones en el stack: Meta, Google, TikTok, X, Amazon, Mercado Libre, OpenAI, Anthropic, KlingAI, Nano Banana PRO, Seedance 2.0, ComfyUI, n8n y Kie AI.
          </p>
          <div class="lp-cred__track-wrap" aria-hidden="true">
            <div class="lp-cred__track">
              ${this.renderCredibilityTrack()}
            </div>
          </div>
        </div>
      </section>

      <!-- ════════ S03: DOLOR ESTRUCTURAL — 5 PAIN CARDS ════════ -->
      <section class="lp-pain" id="landing-3" aria-labelledby="lp-pain-heading">
        <div class="lp-pain__header">
          <h2 id="lp-pain-heading" class="lp-pain__title sr-reveal">Cinco brechas que frenan el crecimiento de las marcas</h2>
          </div>
        <div class="lp-pain__stage">
          <div class="lp-pain__columns" role="list">
            <article class="lp-pain__col" role="listitem" tabindex="0" aria-current="false" data-pain-gradient="1">
              <div class="lp-pain__col-bg" aria-hidden="true"></div>
              <div class="lp-pain__col-rail" aria-hidden="true">
                <span class="lp-pain__col-rail-line"></span>
                <span class="lp-pain__col-rail-dot"></span>
              </div>
              <div class="lp-pain__col-inner">
                <div class="lp-pain__col-highlight">
                  <p class="lp-pain__highlight-title">Llegas tarde</p>
                  <p class="lp-pain__highlight-sub">Cuando publicas, la conversación ya cambió.</p>
              </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">01</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Llegan tarde al mercado</h3>
                    <p class="lp-pain__col-body">Las tendencias aparecen, escalan y se saturan rápido.<br>Tu marca llega cuando el impacto ya pasó.</p>
                    <div class="lp-pain__col-reveal">
                      <p>El ciclo de vida de una tendencia digital puede durar días o incluso horas.</p>
                      <p>Las marcas que reaccionan tarde compiten en un entorno saturado donde es mucho más difícil destacar.</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
            <article class="lp-pain__col" role="listitem" tabindex="0" aria-current="false" data-pain-gradient="2">
              <div class="lp-pain__col-bg" aria-hidden="true"></div>
              <div class="lp-pain__col-rail" aria-hidden="true">
                <span class="lp-pain__col-rail-line"></span>
                <span class="lp-pain__col-rail-dot"></span>
          </div>
              <div class="lp-pain__col-inner">
                <div class="lp-pain__col-highlight">
                  <p class="lp-pain__highlight-title">Te falta contexto</p>
                  <p class="lp-pain__highlight-sub">Publicas, pero no necesariamente en la dirección correcta.</p>
        </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">02</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Compiten con información incompleta</h3>
                    <p class="lp-pain__col-body">Publicas con lo que ya tenías preparado, no con lo que está pasando hoy.<br>Mientras el mercado cambia todos los días, tu contenido sigue un ritmo que ya se quedó atrás.</p>
                    <div class="lp-pain__col-reveal">
                      <p>El volumen de contenido y señales en internet cambia constantemente.</p>
                      <p>Sin una visión actualizada del mercado, es fácil pasar por alto lo que ya está funcionando.</p>
          </div>
                </div>
              </div>
              </div>
            </article>
            <article class="lp-pain__col" role="listitem" tabindex="0" aria-current="false" data-pain-gradient="3">
              <div class="lp-pain__col-bg" aria-hidden="true"></div>
              <div class="lp-pain__col-rail" aria-hidden="true">
                <span class="lp-pain__col-rail-line"></span>
                <span class="lp-pain__col-rail-dot"></span>
              </div>
              <div class="lp-pain__col-inner">
                <div class="lp-pain__col-highlight">
                  <p class="lp-pain__highlight-title">Se pierde el enfoque</p>
                  <p class="lp-pain__highlight-sub">Después de tantos ajustes, la idea pierde claridad.</p>
              </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">03</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Su comunicación pierde consistencia</h3>
                    <p class="lp-pain__col-body">La idea original se transforma en el proceso.<br>Entre equipos, proveedores y cambios, lo que comunicas deja de ser claro y consistente.</p>
                    <div class="lp-pain__col-reveal">
                      <p>Cuando múltiples actores intervienen en la producción, la interpretación de la marca tiende a variar.</p>
                      <p>Sin una referencia operativa constante, la consistencia se vuelve difícil de sostener.</p>
          </div>
                  </div>
                </div>
              </div>
            </article>
            <article class="lp-pain__col" role="listitem" tabindex="0" aria-current="false" data-pain-gradient="4">
              <div class="lp-pain__col-bg" aria-hidden="true"></div>
              <div class="lp-pain__col-rail" aria-hidden="true">
                <span class="lp-pain__col-rail-line"></span>
                <span class="lp-pain__col-rail-dot"></span>
              </div>
              <div class="lp-pain__col-inner">
                <div class="lp-pain__col-highlight">
                  <p class="lp-pain__highlight-title">Todo toma demasiado tiempo</p>
                  <p class="lp-pain__highlight-sub">Si necesitas cambiar algo, el proceso vuelve a empezar.</p>
                </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">04</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Demasiado tiempo</h3>
                    <p class="lp-pain__col-body">Cada contenido implica grabación, diseño, revisiones y aprobaciones que toman días.<br>Cuando finalmente publicas, el momento ya pasó.</p>
                    <div class="lp-pain__col-reveal">
                      <p>La producción tradicional de contenido implica múltiples etapas y validaciones.</p>
                      <p>Este flujo limita la velocidad de reacción frente a un mercado que cambia todos los días.</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
            <article class="lp-pain__col" role="listitem" tabindex="0" aria-current="false" data-pain-gradient="5">
              <div class="lp-pain__col-bg" aria-hidden="true"></div>
              <div class="lp-pain__col-rail" aria-hidden="true">
                <span class="lp-pain__col-rail-line"></span>
                <span class="lp-pain__col-rail-dot"></span>
              </div>
              <div class="lp-pain__col-inner">
                <div class="lp-pain__col-highlight">
                  <p class="lp-pain__highlight-title">No acumulas ventaja</p>
                  <p class="lp-pain__highlight-sub">Publicas más…<br>pero no mejoras lo que haces.</p>
                </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">05</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Repiten sin aprender</h3>
                    <p class="lp-pain__col-body">El mercado cambia rápido, pero tu forma de operar no.<br>Sigues repitiendo lo mismo sin convertir lo aprendido en una ventaja real.</p>
                    <div class="lp-pain__col-reveal">
                      <p>Sin sistemas que registren y optimicen decisiones, el aprendizaje se pierde entre campañas.</p>
                      <p>Esto impide construir una ventaja sostenida en el tiempo.</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
          <div class="lp-pain__timeline" aria-hidden="true"></div>
        </div>
      </section>

      <!-- ════════ S04: AGITACIÓN ════════
           Layout: spacer-top da espacio para que el pin alcance el centro vertical
           del viewport durante la entrada de la sección. Una vez ahí, sticky engage
           y la animación scroll-driven barre el headline horizontalmente mientras el
           pin queda anclado al centro. -->
      <section class="lp-agit" id="landing-4" aria-label="Agitación">
        <div class="lp-agit__spacer-top" aria-hidden="true"></div>
          <div class="lp-agit__pin" data-lp-agit-pin>
            <div class="lp-agit__marquee" data-lp-agit-marquee>
              <h2 class="lp-agit__headline" data-lp-agit-headline>
                <span class="lp-agit__line">EL MERCADO YA ESTÁ OPERANDO DISTINTO. LA PREGUNTA ES SI TÚ TAMBIÉN.</span>
              </h2>
          </div>
        </div>
      </section>

      <!-- ════════ S05: PROPUESTA (6 criterios + carrusel 6 slides + copy sincronizado) ════════ -->
      <section class="lp-caps" id="landing-5" aria-labelledby="lp-caps-heading">
        <div class="lp-caps__inner" data-lp-caps-root>
          <header class="lp-caps__head">
            <h2 id="lp-caps-heading" class="lp-caps__kicker sr-reveal">
              <span class="lp-caps__kicker-line">No es una herramienta.</span>
              <span class="lp-caps__kicker-line">Es una nueva forma de competir.</span>
            </h2>
            <ul class="lp-caps__axis" role="tablist" aria-label="Criterios" data-lp-caps-axis>
              <li class="lp-caps__axis-item is-active" role="tab" tabindex="0" aria-selected="true" data-index="0"><span class="lp-caps__axis-accent" aria-hidden="true"></span><span class="lp-caps__axis-label">PRECISIÓN</span></li>
              <li class="lp-caps__axis-item" role="tab" tabindex="-1" aria-selected="false" data-index="1"><span class="lp-caps__axis-accent" aria-hidden="true"></span><span class="lp-caps__axis-label">INTELIGENCIA</span></li>
              <li class="lp-caps__axis-item" role="tab" tabindex="-1" aria-selected="false" data-index="2"><span class="lp-caps__axis-accent" aria-hidden="true"></span><span class="lp-caps__axis-label">VELOCIDAD</span></li>
              <li class="lp-caps__axis-item" role="tab" tabindex="-1" aria-selected="false" data-index="3"><span class="lp-caps__axis-accent" aria-hidden="true"></span><span class="lp-caps__axis-label">EFICIENCIA</span></li>
              <li class="lp-caps__axis-item" role="tab" tabindex="-1" aria-selected="false" data-index="4"><span class="lp-caps__axis-accent" aria-hidden="true"></span><span class="lp-caps__axis-label">CONSISTENCIA</span></li>
              <li class="lp-caps__axis-item" role="tab" tabindex="-1" aria-selected="false" data-index="5"><span class="lp-caps__axis-accent" aria-hidden="true"></span><span class="lp-caps__axis-label">CALIDAD</span></li>
              </ul>
          </header>
          <div class="lp-caps__main">
            <div class="lp-caps__copy">
              <h3 class="lp-caps__need-block sr-reveal" id="lp-caps-need-heading">Necesitas</h3>
              <div class="lp-caps__detail-wrap sr-reveal sr-reveal--d1">
                <span class="lp-caps__detail-rule" aria-hidden="true"></span>
                <p class="lp-caps__detail-body" data-lp-caps-body aria-live="polite">Cruzar datos, tendencias, competencia y ADN de marca para decidir qué comunicar, cuándo hacerlo y por qué.</p>
              </div>
            </div>
            <div class="lp-caps__carousel" data-lp-caps-carousel>
              <div class="lp-caps__viewport" data-lp-caps-viewport tabindex="0" aria-label="Criterios visuales" aria-roledescription="carrusel">
                <div class="lp-caps__track" role="list">
                  <div class="lp-caps__slide is-active" role="listitem" data-index="0" aria-label="PRECISIÓN">
                    <div class="lp-caps__slide-inner">
                      <img class="lp-caps__slide-media" src="/recursos/banners/focus.svg" alt="" width="168" height="224" loading="lazy" decoding="async">
                    </div>
                  </div>
                  <div class="lp-caps__slide" role="listitem" data-index="1" aria-label="INTELIGENCIA">
                    <div class="lp-caps__slide-inner">
                      <img class="lp-caps__slide-media" src="/recursos/banners/smart.svg" alt="" width="168" height="224" loading="lazy" decoding="async">
                    </div>
                  </div>
                  <div class="lp-caps__slide" role="listitem" data-index="2" aria-label="VELOCIDAD">
                    <div class="lp-caps__slide-inner">
                      <img class="lp-caps__slide-media" src="/recursos/banners/speed.svg" alt="" width="168" height="224" loading="lazy" decoding="async">
                    </div>
                  </div>
                  <div class="lp-caps__slide" role="listitem" data-index="3" aria-label="EFICIENCIA">
                    <div class="lp-caps__slide-inner">
                      <img class="lp-caps__slide-media" src="/recursos/banners/sales.svg" alt="" width="168" height="224" loading="lazy" decoding="async">
                    </div>
                  </div>
                  <div class="lp-caps__slide" role="listitem" data-index="4" aria-label="CONSISTENCIA">
                    <div class="lp-caps__slide-inner">
                      <img class="lp-caps__slide-media" src="/recursos/banners/brand.svg" alt="" width="168" height="224" loading="lazy" decoding="async">
                    </div>
                  </div>
                  <div class="lp-caps__slide" role="listitem" data-index="5" aria-label="CALIDAD">
                    <div class="lp-caps__slide-inner">
                      <img class="lp-caps__slide-media" src="/recursos/banners/videos.svg" alt="" width="168" height="224" loading="lazy" decoding="async">
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <footer class="lp-caps__foot">
            <div class="lp-caps__nav" role="group" aria-label="Desplazar tarjetas">
              <button type="button" class="lp-caps__nav-btn" data-lp-caps-prev aria-label="Tarjeta anterior">
                <i class="fas fa-chevron-left" aria-hidden="true"></i>
              </button>
              <button type="button" class="lp-caps__nav-btn" data-lp-caps-next aria-label="Tarjeta siguiente">
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          </footer>
        </div>
      </section>

      <!-- ════════ S06: VERA — fila1 copy|spacer; fila2 bento ancho completo; L2 SVG z2 ════════ -->
      <section class="lp-vera" id="landing-6" aria-labelledby="lp-vera-heading">
        <!-- Vignette: gris oscuro arriba/abajo, transparente en el centro.
             Va encima del gradiente (::before) y del grano (::after) pero
             debajo del contenido (.lp-vera__inner). -->
        <div class="lp-vera__veil" aria-hidden="true"></div>
        <div class="lp-vera__inner">
          <div class="lp-vera__shell">
            <div class="lp-vera__main-col">
            <div class="lp-vera__stage">
              <div class="lp-vera__copy-block">
                <div class="lp-vera__hero">
                  <h2 id="lp-vera-heading" class="lp-vera__hero-headline sr-reveal">
                    <span class="lp-vera__hero-line">NO ESPERA ÓRDENES.</span>
                    <span class="lp-vera__hero-line">OPERA POR TI.</span>
                  </h2>
                  <div class="lp-vera__hero-rule" aria-hidden="true"></div>
                  <p class="lp-vera__hero-sub sr-reveal sr-reveal--d1">
                    <span class="lp-vera__hero-sub-line">El mercado no premia el esfuerzo.</span>
                    <span class="lp-vera__hero-sub-line">Premia la precisión.</span>
                  </p>
                  <p class="lp-vera__hero-body sr-reveal sr-reveal--d2">VERA no ejecuta tareas. Interpreta el mercado, prioriza señales y actúa cuando tu equipo aún está procesando información. Cada decisión nace del contexto real de tu marca, no de plantillas genéricas ni de prompts sueltos.</p>
        </div>
                <p class="lp-vera__hero-tag sr-reveal sr-reveal--d3">
                  <span class="lp-vera__hero-tag-line">VENTAJA EN</span>
                  <span class="lp-vera__hero-tag-line">TIEMPO REAL</span>
                </p>
                </div>
              </div>
                </div>
            <div class="lp-vera__bento-shell">
            <div class="lp-vera__bento-block">
                <div class="lp-vera__layers" role="list" aria-label="Módulos y capacidades de VERA">
            <article class="lp-vera__layer lp-vera__layer--hero sr-reveal sr-reveal--d1" role="listitem" tabindex="0" data-vera-gradient="1">
              <div class="lp-vera__layer-bg" aria-hidden="true"></div>
              <div class="lp-vera__layer-hero-text">
                <header class="lp-vera__layer-head">
                  <h3 class="lp-vera__layer-title">Un solo sistema</h3>
                </header>
                <p class="lp-vera__layer-desc">Desde inteligencia hasta ejecución. VERA conecta cada parte del proceso sin fricción.</p>
              </div>
              <div class="lp-vera__layer-art" aria-hidden="true">
                <div class="lp-vera__layer-orbit lp-vera__layer-orbit--a"></div>
                <div class="lp-vera__layer-orbit lp-vera__layer-orbit--b"></div>
                <div class="lp-vera__layer-orbit lp-vera__layer-orbit--c"></div>
                <span class="lp-vera__layer-dot lp-vera__layer-dot--1"></span>
                <span class="lp-vera__layer-dot lp-vera__layer-dot--2"></span>
                <span class="lp-vera__layer-dot lp-vera__layer-dot--3"></span>
                <img class="lp-vera__layer-art-logo" src="/recursos/vera/Vera-2.svg" alt="" width="120" height="46" decoding="async" loading="lazy">
              </div>
            </article>
            <article class="lp-vera__layer lp-vera__layer--side sr-reveal sr-reveal--d2" role="listitem" tabindex="0" data-vera-gradient="2">
              <div class="lp-vera__layer-bg" aria-hidden="true"></div>
              <header class="lp-vera__layer-head">
                <h3 class="lp-vera__layer-title">Lectura en tiempo real</h3>
              </header>
              <p class="lp-vera__layer-desc">Monitorea tendencias, competencia y comportamiento del consumidor.</p>
            </article>
            <article class="lp-vera__layer lp-vera__layer--midA sr-reveal sr-reveal--d3" role="listitem" tabindex="0" data-vera-gradient="3">
              <div class="lp-vera__layer-bg" aria-hidden="true"></div>
              <header class="lp-vera__layer-head">
                <h3 class="lp-vera__layer-title">Decisiones con criterio</h3>
              </header>
              <p class="lp-vera__layer-desc">Evalúa qué hacer, cuándo hacerlo y por qué. Prioriza impacto real sobre ruido.</p>
            </article>
            <article class="lp-vera__layer lp-vera__layer--midB sr-reveal sr-reveal--d4" role="listitem" tabindex="0" data-vera-gradient="4">
              <div class="lp-vera__layer-bg" aria-hidden="true"></div>
              <header class="lp-vera__layer-head">
                <h3 class="lp-vera__layer-title">Contenido que construye marca</h3>
              </header>
              <p class="lp-vera__layer-desc">Imágenes, copys, campañas y piezas alineadas al ADN.</p>
            </article>
            <article class="lp-vera__layer lp-vera__layer--tall sr-reveal sr-reveal--d5" role="listitem" tabindex="0" data-vera-gradient="5">
              <div class="lp-vera__layer-bg" aria-hidden="true"></div>
              <header class="lp-vera__layer-head">
                <h3 class="lp-vera__layer-title">Todo conectado</h3>
              </header>
              <p class="lp-vera__layer-desc">Investigación, estrategia y ejecución trabajando como un solo sistema.</p>
            </article>
            <article class="lp-vera__layer lp-vera__layer--wide sr-reveal sr-reveal--d6" role="listitem" tabindex="0" data-vera-gradient="6">
              <div class="lp-vera__layer-bg" aria-hidden="true"></div>
              <header class="lp-vera__layer-head">
                <h3 class="lp-vera__layer-title">Mejora con cada resultado</h3>
              </header>
              <p class="lp-vera__layer-desc">Analiza performance, detecta patrones y ajusta automáticamente.</p>
            </article>
                </div>
            </div>
            </div>
            <div class="lp-vera__vera-col2-spacer" aria-hidden="true"></div>
            <!-- Capa SVG (azul): debajo del bloque izquierdo (z3); pointer-events none -->
            <div class="lp-vera__vera-l2" aria-hidden="true">
              <div class="lp-vera__vera-l2-spacer" aria-hidden="true"></div>
              <div class="lp-vera__sticky-rail">
                <aside class="lp-vera__sticky-visual" aria-hidden="true">
                  <div class="lp-vera__sticky-visual-inner">
                    <img class="lp-vera__sticky-visual-img" src="/recursos/vera/Vera-2.svg" alt="" width="356" height="136" decoding="async" loading="lazy">
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════ S07: LIVING DASHBOARD ════════ -->
      <section class="lp-dash" id="landing-7" aria-labelledby="lp-dash-heading">
        <div class="lp-dash__inner">
          <header class="lp-dash__header">
            <h2 id="lp-dash-heading" class="lp-dash__title sr-reveal">Un dashboard que piensa mientras tu equipo ejecuta</h2>
            <p class="lp-dash__sub sr-reveal sr-reveal--d1">Señales, decisiones y contenido en tiempo real. Todo en un solo lugar.</p>
          </header>
          <div class="lp-dash__screen-wrap" aria-label="Demostración interactiva de la aplicación AISmartContent">
            <div class="lp-dash__screen lp-app-preview" data-landing-app-preview role="region" aria-label="Vista previa interactiva (demo)">
              <div class="lp-dash__chrome lp-app-preview__browser" aria-hidden="true">
                <span class="lp-dash__dot"></span>
                <span class="lp-dash__dot"></span>
                <span class="lp-dash__dot"></span>
                <span class="lp-dash__url">app.aismartcontent.com / <span data-preview-url>org/acme/dashboard</span></span>
              </div>
              <div class="lp-app-preview__shell">
                <aside class="lp-app-preview__sidebar" aria-label="Navegación (demo)">
                  <div class="lp-app-preview__org">
                    <span class="lp-app-preview__org-toggle" aria-hidden="true"><i class="fas fa-bars"></i></span>
                    <span class="lp-app-preview__org-name">Mi organización</span>
                  </div>
                  <nav class="lp-app-preview__nav">
                    <button type="button" class="lp-app-preview__nav-btn lp-app-preview__nav-btn--vera" data-preview-nav="vera" aria-pressed="false">
                      <img class="lp-app-preview__vera-img" src="/recursos/vera/Vera-2.svg" alt="" width="64" height="24" decoding="async" loading="lazy">
                    </button>
                    <p class="lp-app-preview__section">Workspace</p>
                    <button type="button" class="lp-app-preview__nav-btn is-active" data-preview-nav="dashboard" aria-pressed="true">
                      <i class="fas fa-chart-line" aria-hidden="true"></i><span>Dashboard</span>
                    </button>
                    <button type="button" class="lp-app-preview__nav-btn" data-preview-nav="production" aria-pressed="false">
                      <i class="fas fa-clipboard-list" aria-hidden="true"></i><span>Production</span>
                    </button>
                    <div class="lp-app-preview__nav-group" data-preview-flows-group>
                      <button type="button" class="lp-app-preview__nav-btn lp-app-preview__nav-btn--subtoggle" data-preview-subtoggle aria-expanded="false" aria-controls="lp-app-preview-flows-sub">
                        <i class="fas fa-th-large" aria-hidden="true"></i><span>Flows</span><i class="fas fa-chevron-down lp-app-preview__chev" aria-hidden="true"></i>
                      </button>
                      <div class="lp-app-preview__sub" id="lp-app-preview-flows-sub" hidden>
                        <button type="button" class="lp-app-preview__nav-btn lp-app-preview__nav-btn--sub" data-preview-nav="flow-posts" aria-pressed="false">Posts</button>
                        <button type="button" class="lp-app-preview__nav-btn lp-app-preview__nav-btn--sub" data-preview-nav="flow-reels" aria-pressed="false">Reels</button>
                      </div>
                    </div>
                    <button type="button" class="lp-app-preview__nav-btn" data-preview-nav="brand" aria-pressed="false">
                      <i class="fas fa-layer-group" aria-hidden="true"></i><span>Brand</span>
                    </button>
                  </nav>
                  <div class="lp-app-preview__credits" aria-hidden="true">
                    <span class="lp-app-preview__credits-lbl">credits</span>
                    <span class="lp-app-preview__credits-val">12.4k</span>
                    <div class="lp-app-preview__credits-bar"><span style="width:62%"></span></div>
                  </div>
                </aside>
                <div class="lp-app-preview__stage">
                  <header class="lp-app-preview__topbar">
                    <h3 class="lp-app-preview__title" data-preview-title>Dashboard</h3>
                    <span class="lp-app-preview__live">● Live</span>
                  </header>
                  <div class="lp-app-preview__panels">
                    <div class="lp-app-preview__panel" data-preview-panel="vera" id="lp-app-preview-panel-vera" hidden>
                      <div class="lp-app-preview__vera-feed" data-vera-feed>
                        <p class="lp-app-preview__bubble lp-app-preview__bubble--ai">¿Qué señal del mercado quieres traducir hoy en contenido?</p>
                      </div>
                      <div class="lp-app-preview__vera-chips" role="group" aria-label="Sugerencias demo">
                        <button type="button" class="lp-app-preview__chip" data-vera-chip>Tendencia TikTok · belleza</button>
                        <button type="button" class="lp-app-preview__chip" data-vera-chip>Copia para lanzamiento Q3</button>
                        <button type="button" class="lp-app-preview__chip" data-vera-chip>Audiencia fría · remarketing</button>
                      </div>
                      <label class="lp-app-preview__vera-input-wrap">
                        <span class="sr-only">Mensaje a VERA (demo)</span>
                        <input type="text" class="lp-app-preview__vera-input" data-vera-input placeholder="Pregunta o pega contexto…" autocomplete="off">
                      </label>
                    </div>
                    <div class="lp-app-preview__panel is-active" data-preview-panel="dashboard" id="lp-app-preview-panel-dashboard">
                      <div class="lp-app-preview__filters" role="group" aria-label="Rango (demo)">
                        <button type="button" class="lp-app-preview__filter is-active" data-preview-filter="all">Todo</button>
                        <button type="button" class="lp-app-preview__filter" data-preview-filter="7d">7 días</button>
                        <button type="button" class="lp-app-preview__filter" data-preview-filter="30d">30 días</button>
                      </div>
                      <p class="lp-app-preview__hint" data-preview-range-label>Actividad — vista completa</p>
                      <div class="lp-app-preview__metrics">
                        <div class="lp-app-preview__metric">
                          <span class="lp-app-preview__metric-val">3×</span>
                          <span class="lp-app-preview__metric-lbl">Velocidad producción</span>
                          <div class="lp-app-preview__metric-bar"><span style="width:72%"></span></div>
                        </div>
                        <div class="lp-app-preview__metric">
                          <span class="lp-app-preview__metric-val">68%</span>
                          <span class="lp-app-preview__metric-lbl">Menos tiempo en decisión</span>
                          <div class="lp-app-preview__metric-bar"><span style="width:68%"></span></div>
                        </div>
                        <div class="lp-app-preview__metric">
                          <span class="lp-app-preview__metric-val">+24</span>
                          <span class="lp-app-preview__metric-lbl">Piezas esta semana</span>
                          <div class="lp-app-preview__metric-bar"><span style="width:81%"></span></div>
                        </div>
                      </div>
                      <div class="lp-app-preview__rows">
                        <div class="lp-app-preview__row"><span class="lp-app-preview__dot lp-app-preview__dot--ok"></span><span>Reel · aprobado</span><span class="lp-app-preview__muted">hace 2 h</span></div>
                        <div class="lp-app-preview__row"><span class="lp-app-preview__dot lp-app-preview__dot--wait"></span><span>Carrusel · en revisión</span><span class="lp-app-preview__muted">hace 5 h</span></div>
                        <div class="lp-app-preview__row"><span class="lp-app-preview__dot lp-app-preview__dot--run"></span><span>Story · generando</span><span class="lp-app-preview__muted">ahora</span></div>
                      </div>
                    </div>
                    <div class="lp-app-preview__panel" data-preview-panel="production" id="lp-app-preview-panel-production" hidden>
                      <p class="lp-app-preview__hint">Pipeline reciente (demo)</p>
                      <button type="button" class="lp-app-preview__prow" data-preview-prod-row aria-expanded="false" aria-controls="lp-app-preview-prod-detail">
                        <span class="lp-app-preview__dot lp-app-preview__dot--ok"></span>
                        <span class="lp-app-preview__prow-title">Campaña verano · Meta Ads</span>
                        <i class="fas fa-chevron-down lp-app-preview__prow-chev" aria-hidden="true"></i>
                      </button>
                      <div class="lp-app-preview__pdetail" id="lp-app-preview-prod-detail" data-preview-prod-detail hidden>
                        <p>Brief aprobado · 4 creatividades · presupuesto asignado a conjunto Advantage+.</p>
                      </div>
                      <div class="lp-app-preview__prow lp-app-preview__prow--static"><span class="lp-app-preview__dot lp-app-preview__dot--wait"></span><span class="lp-app-preview__prow-title">Lanzamiento producto · LinkedIn</span></div>
                      <div class="lp-app-preview__prow lp-app-preview__prow--static"><span class="lp-app-preview__dot lp-app-preview__dot--run"></span><span class="lp-app-preview__prow-title">Newsletter · segmentación fría</span></div>
                    </div>
                    <div class="lp-app-preview__panel" data-preview-panel="flow-posts" id="lp-app-preview-panel-flow-posts" hidden>
                      <p class="lp-app-preview__hint">Flujo · Posts</p>
                      <div class="lp-app-preview__steps" role="tablist" aria-label="Etapas (demo)">
                        <button type="button" class="lp-app-preview__step is-active" data-preview-step="1" aria-selected="true">1 · Brief</button>
                        <button type="button" class="lp-app-preview__step" data-preview-step="2" aria-selected="false">2 · Generar</button>
                        <button type="button" class="lp-app-preview__step" data-preview-step="3" aria-selected="false">3 · Publicar</button>
                      </div>
                      <p class="lp-app-preview__step-body" data-preview-step-body>Define objetivo, tono y CTA. VERA cruza con datos de audiencia activos.</p>
                    </div>
                    <div class="lp-app-preview__panel" data-preview-panel="flow-reels" id="lp-app-preview-panel-flow-reels" hidden>
                      <p class="lp-app-preview__hint">Flujo · Reels</p>
                      <div class="lp-app-preview__storyboard">
                        <div class="lp-app-preview__sb-card is-active" data-preview-sb tabindex="0">Hook 0–2s</div>
                        <div class="lp-app-preview__sb-card" data-preview-sb tabindex="0">Desarrollo</div>
                        <div class="lp-app-preview__sb-card" data-preview-sb tabindex="0">CTA</div>
                      </div>
                      <p class="lp-app-preview__step-body" data-preview-sb-caption>Primer impacto: texto superpuesto + ritmo de corte sugerido.</p>
                    </div>
                    <div class="lp-app-preview__panel" data-preview-panel="brand" id="lp-app-preview-panel-brand" hidden>
                      <p class="lp-app-preview__hint">Contenedores de marca (demo)</p>
                      <div class="lp-app-preview__brand-grid">
                        <button type="button" class="lp-app-preview__brand-card" data-preview-brand-card>
                          <span class="lp-app-preview__brand-name">Marca principal</span>
                          <span class="lp-app-preview__brand-meta">ADN · voz · reglas IA</span>
                        </button>
                        <button type="button" class="lp-app-preview__brand-card" data-preview-brand-card>
                          <span class="lp-app-preview__brand-name">Submarca retail</span>
                          <span class="lp-app-preview__brand-meta">Productos · 12 activos</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="lp-dash__feats">
            <div class="lp-dash__feat sr-reveal sr-reveal--d1">
              <span class="lp-dash__feat-dot" aria-hidden="true"></span>
              <div>
                <strong class="lp-dash__feat-title">Señales en tiempo real</strong>
                <p class="lp-dash__feat-desc">Mercado, competencia y audiencia actualizados continuamente.</p>
              </div>
            </div>
            <div class="lp-dash__feat sr-reveal sr-reveal--d2">
              <span class="lp-dash__feat-dot" aria-hidden="true"></span>
              <div>
                <strong class="lp-dash__feat-title">Pipeline de contenido</strong>
                <p class="lp-dash__feat-desc">Desde la idea hasta la publicación, todo en un solo flujo.</p>
              </div>
            </div>
            <div class="lp-dash__feat sr-reveal sr-reveal--d3">
              <span class="lp-dash__feat-dot" aria-hidden="true"></span>
              <div>
                <strong class="lp-dash__feat-title">Performance analytics</strong>
                <p class="lp-dash__feat-desc">Resultados que alimentan la estrategia siguiente.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════ S08: POR QUÉ AISmartContent — carrusel ════════ -->
      <section class="lp-why" id="landing-why" aria-labelledby="lp-why-heading" data-lp-why>
        <div class="lp-why__inner">
          <h2 id="lp-why-heading" class="lp-why__title sr-reveal">Por qué AISmartContent cambia cómo opera tu marca.</h2>
          <div class="lp-why__carousel">
            <div class="lp-why__viewport" data-lp-why-viewport tabindex="0" aria-label="Tarjetas: valor de la plataforma">
              <div class="lp-why__track" role="list">
                <article class="lp-why__card-wrap sr-reveal sr-reveal--d1" role="listitem">
                  <div class="lp-why__card">
                    <h3 class="lp-why__card-title">Lectura en tiempo real</h3>
                    <p class="lp-why__card-text">Entiende lo que está pasando en tu mercado antes de que sea evidente.</p>
                    <span class="lp-why__card-icon lp-why__card-icon--chev" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
              </div>
            </article>
                <article class="lp-why__card-wrap sr-reveal sr-reveal--d2" role="listitem">
                  <div class="lp-why__card">
                    <h3 class="lp-why__card-title">Decisiones con contexto</h3>
                    <p class="lp-why__card-text">Cruza datos, tendencias y ADN de marca para definir qué hacer en cada momento.</p>
                    <span class="lp-why__card-icon lp-why__card-icon--chev" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
                </div>
                </article>
                <article class="lp-why__card-wrap sr-reveal sr-reveal--d3" role="listitem">
                  <div class="lp-why__card">
                    <h3 class="lp-why__card-title">Ejecución alineada</h3>
                    <p class="lp-why__card-text">Convierte decisiones en contenido listo para salir, sin fricción.</p>
                    <span class="lp-why__card-icon lp-why__card-icon--chev" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
              </div>
            </article>
                <article class="lp-why__card-wrap sr-reveal sr-reveal--d4" role="listitem">
                  <div class="lp-why__card">
                    <h3 class="lp-why__card-title">Optimización continua</h3>
                    <p class="lp-why__card-text">Aprende de cada acción para mejorar la siguiente.</p>
                    <span class="lp-why__card-icon lp-why__card-icon--chev" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
          </div>
                </article>
        </div>
            </div>
            <div class="lp-why__nav" role="group" aria-label="Desplazar carrusel">
              <button type="button" class="lp-why__arrow" data-lp-why-prev aria-label="Ver tarjetas anteriores">
                <i class="fas fa-chevron-left" aria-hidden="true"></i>
            </button>
              <button type="button" class="lp-why__arrow" data-lp-why-next aria-label="Ver tarjetas siguientes">
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
            </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════ S09: LO QUE PASA CUANDO… ════════ -->
      <section class="landing-different" id="landing-8" aria-labelledby="landing-different-heading">
        <div class="landing-different__inner">
          <h2 id="landing-different-heading" class="landing-different__title sr-reveal">Lo que pasa cuando tu marca opera diferente</h2>
          <ul class="landing-different__list">
            <li class="landing-different__item sr-reveal sr-reveal--d1">
              <div class="landing-different__row">
                <span class="landing-different__label">Tiempo real</span>
                <span class="landing-different__desc">Decisiones cuando importan.</span>
              </div>
              <div class="landing-different__divider" aria-hidden="true"></div>
            </li>
            <li class="landing-different__item sr-reveal sr-reveal--d2">
              <div class="landing-different__row">
                <span class="landing-different__label">Claridad</span>
                <span class="landing-different__desc">Qué hacer, sin duda.</span>
              </div>
              <div class="landing-different__divider" aria-hidden="true"></div>
            </li>
            <li class="landing-different__item sr-reveal sr-reveal--d3">
              <div class="landing-different__row">
                <span class="landing-different__label">Velocidad</span>
                <span class="landing-different__desc">De la idea a la ejecución.</span>
              </div>
              <div class="landing-different__divider" aria-hidden="true"></div>
            </li>
            <li class="landing-different__item sr-reveal sr-reveal--d4">
              <div class="landing-different__row">
                <span class="landing-different__label">Impacto</span>
                <span class="landing-different__desc">Cada acción cuenta.</span>
              </div>
              <div class="landing-different__divider" aria-hidden="true"></div>
            </li>
            <li class="landing-different__item sr-reveal sr-reveal--d5">
              <div class="landing-different__row">
                <span class="landing-different__label">Optimización</span>
                <span class="landing-different__desc">Siempre mejorando.</span>
              </div>
              <div class="landing-different__divider" aria-hidden="true"></div>
            </li>
          </ul>
        </div>
      </section>

      <!-- ════════ S10: FAQ ════════ -->
      <section class="lp-faq" id="landing-10" aria-labelledby="lp-faq-heading">
        <div class="lp-faq__inner">
          <header class="lp-faq__header">
            <p class="lp-faq__eyebrow sr-reveal">Preguntas frecuentes</p>
            <h2 id="lp-faq-heading" class="lp-faq__title sr-reveal">Lo que necesitas saber antes de empezar</h2>
          </header>
          <div class="lp-faq__list">
            <div class="lp-faq__item">
              <button class="lp-faq__q" aria-expanded="false" type="button">
                <span>¿AISmartContent reemplaza a mi equipo de contenido?</span>
                <span class="lp-faq__icon" aria-hidden="true">+</span>
              </button>
              <div class="lp-faq__a" hidden>
                <p>No. AISmartContent potencia a tu equipo. Elimina tareas repetitivas y de bajo valor para que tu equipo pueda enfocarse en decisiones estratégicas y creatividad de alto impacto. Es un multiplicador, no un sustituto.</p>
              </div>
            </div>
            <div class="lp-faq__item">
              <button class="lp-faq__q" aria-expanded="false" type="button">
                <span>¿Cuánto tiempo tarda la implementación?</span>
                <span class="lp-faq__icon" aria-hidden="true">+</span>
              </button>
              <div class="lp-faq__a" hidden>
                <p>El onboarding básico toma 72 horas. Estructuramos el ADN de tu marca, conectamos las fuentes de datos y configuramos los flujos de trabajo. En la primera semana ya ves el sistema operando.</p>
              </div>
            </div>
            <div class="lp-faq__item">
              <button class="lp-faq__q" aria-expanded="false" type="button">
                <span>¿El contenido que produce respeta la identidad de mi marca?</span>
                <span class="lp-faq__icon" aria-hidden="true">+</span>
              </button>
              <div class="lp-faq__a" hidden>
                <p>Sí. VERA trabaja a partir del ADN de tu marca: tono, valores, estilo visual, posicionamiento y audiencia objetivo. Todo el contenido producido pasa por esa capa antes de salir. No es IA genérica; es IA entrenada para tu marca específica.</p>
              </div>
            </div>
            <div class="lp-faq__item">
              <button class="lp-faq__q" aria-expanded="false" type="button">
                <span>¿Funciona para cualquier industria?</span>
                <span class="lp-faq__icon" aria-hidden="true">+</span>
              </button>
              <div class="lp-faq__a" hidden>
                <p>Principalmente para marcas B2C y B2B con necesidad de contenido estratégico constante. Hemos trabajado con retail, salud, tecnología, finanzas y educación. Si tu marca tiene presencia digital activa, el sistema agrega valor inmediato.</p>
              </div>
            </div>
            <div class="lp-faq__item">
              <button class="lp-faq__q" aria-expanded="false" type="button">
                <span>¿Cuál es el costo?</span>
                <span class="lp-faq__icon" aria-hidden="true">+</span>
              </button>
              <div class="lp-faq__a" hidden>
                <p>Los planes se definen según el tamaño del equipo, el volumen de contenido y las integraciones requeridas. Actualmente tenemos acceso anticipado con condiciones especiales para las primeras organizaciones. Solicita una conversación y te presentamos la propuesta.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════ S11: CTA FINAL ════════ -->
      <section class="lp-cta" id="landing-11" aria-labelledby="lp-cta-heading">
        <div class="lp-cta__bg" aria-hidden="true">
          <span class="lp-cta__glow" aria-hidden="true"></span>
        </div>
        <div class="lp-cta__ticker-wrap" aria-hidden="true">
          <div class="lp-cta__ticker">
            <span>Empieza a operar diferente</span>
            <span class="lp-cta__ticker-sep">·</span>
            <span>Empieza a operar diferente</span>
            <span class="lp-cta__ticker-sep">·</span>
            <span>Empieza a operar diferente</span>
            <span class="lp-cta__ticker-sep">·</span>
            <span aria-hidden="true">Empieza a operar diferente</span>
            <span class="lp-cta__ticker-sep" aria-hidden="true">·</span>
            <span aria-hidden="true">Empieza a operar diferente</span>
            <span class="lp-cta__ticker-sep" aria-hidden="true">·</span>
          </div>
        </div>
        <div class="lp-cta__inner">
          <p class="lp-cta__eyebrow sr-reveal">Acceso anticipado</p>
          <h2 id="lp-cta-heading" class="lp-cta__title sr-reveal">Tu marca, operando con inteligencia real.</h2>
          <p class="lp-cta__sub sr-reveal sr-reveal--d1">Únete a las organizaciones que ya operan con VERA.<br>Plazas limitadas para el acceso anticipado.</p>
          <form class="lp-cta__form sr-reveal sr-reveal--d2" novalidate aria-label="Formulario de acceso anticipado">
            <div class="lp-cta__fields">
              <div class="lp-cta__field">
                <label class="lp-cta__label" for="cta-name">Nombre</label>
                <input class="lp-cta__input" type="text" id="cta-name" name="name" placeholder="Tu nombre" autocomplete="given-name" required>
              </div>
              <div class="lp-cta__field">
                <label class="lp-cta__label" for="cta-company">Empresa</label>
                <input class="lp-cta__input" type="text" id="cta-company" name="company" placeholder="Nombre de tu empresa" autocomplete="organization" required>
              </div>
              <div class="lp-cta__field">
                <label class="lp-cta__label" for="cta-role">Rol</label>
                <input class="lp-cta__input" type="text" id="cta-role" name="role" placeholder="Tu rol en la empresa" autocomplete="organization-title">
              </div>
              <div class="lp-cta__field">
                <label class="lp-cta__label" for="cta-email">Email</label>
                <input class="lp-cta__input" type="email" id="cta-email" name="email" placeholder="tu@empresa.com" autocomplete="email" required>
              </div>
            </div>
            <button class="lp-cta__submit" type="submit">
              <span class="lp-cta__submit-text">Quiero acceso anticipado</span>
              <span class="lp-cta__submit-arrow" aria-hidden="true">↗</span>
            </button>
            <p class="lp-cta__success" hidden aria-live="polite">Listo. Te contactamos pronto.</p>
          </form>
        </div>
      </section>
    `;
  }

  async init() {
    await super.init();
    this.clearLandingAgitHash();
    this.initHeroReveal();
    this.initPainRoadmap();
    this.initFaqAccordion();
    this.initCtaForm();
    this.initLandingAppPreview();
    this.initWhyCarousel();
    this.initCapsProposta();
  }

  clearLandingAgitHash() {
    if (window.location.hash !== '#landing-4') return;
    try {
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(window.history.state, '', cleanUrl);
    } catch (_) {
      // Fallback silencioso: si history falla, al menos evita mantener el hash.
      window.location.hash = '';
    }
    const shell = document.getElementById('public-shell');
    if (shell && shell.scrollHeight > shell.clientHeight + 2) {
      shell.scrollTop = 0;
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }

  async onLeave() {
    await super.onLeave();
    if (typeof this.heroRevealCleanup === 'function') {
      this.heroRevealCleanup();
      this.heroRevealCleanup = null;
    }
    if (typeof this.painRoadmapCleanup === 'function') {
      this.painRoadmapCleanup();
      this.painRoadmapCleanup = null;
    }
    if (typeof this.faqCleanup === 'function') {
      this.faqCleanup();
      this.faqCleanup = null;
    }
    if (typeof this.ctaFormCleanup === 'function') {
      this.ctaFormCleanup();
      this.ctaFormCleanup = null;
    }
    if (typeof this.appPreviewCleanup === 'function') {
      this.appPreviewCleanup();
      this.appPreviewCleanup = null;
    }
    if (typeof this.whyCarouselCleanup === 'function') {
      this.whyCarouselCleanup();
      this.whyCarouselCleanup = null;
    }
    if (typeof this.capsPropostaCleanup === 'function') {
      this.capsPropostaCleanup();
      this.capsPropostaCleanup = null;
    }
    if (typeof this.veraRailScrollCleanup === 'function') {
      this.veraRailScrollCleanup();
      this.veraRailScrollCleanup = null;
    }
    if (typeof this.agitScrollCleanup === 'function') {
      this.agitScrollCleanup();
      this.agitScrollCleanup = null;
    }
  }

  destroy() {
    this.onLeave();
    super.destroy();
  }

  initHeroReveal() {
    if (typeof this.heroRevealCleanup === 'function') {
      this.heroRevealCleanup();
      this.heroRevealCleanup = null;
    }

    const hero = this.container.querySelector('.lp-hero');
    if (!hero) return;

    const reveals = Array.from(hero.querySelectorAll('[data-reveal]'));
    if (!reveals.length) return;

    reveals.forEach((el, i) => {
      el.style.transitionDelay = `${i * 0.11}s`;
    });

    let rafId = requestAnimationFrame(() => {
      rafId = 0;
      hero.classList.add('is-ready');
    });

    this.heroRevealCleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      hero.classList.remove('is-ready');
      reveals.forEach(el => { el.style.transitionDelay = ''; });
    };
  }

  /**
   * S06 VERA: desactivado el tracking JS de scroll para evitar jitter visual.
   * El comportamiento queda 100% estable con layout CSS estático.
   */
  initVeraRailWordmarkScroll() {
    if (typeof this.veraRailScrollCleanup === 'function') {
      this.veraRailScrollCleanup();
      this.veraRailScrollCleanup = null;
    }
      this.veraRailScrollCleanup = null;
  }

  /**
   * S04 AGITACIÓN: lock de scroll en viewport fijo.
   * Al entrar a la sección, captura wheel/touch/teclas para barrer el texto;
   * al terminar (0% o 100%) libera el scroll del documento.
   */
  initAgitScroll() {
    if (typeof this.agitScrollCleanup === 'function') {
      this.agitScrollCleanup();
      this.agitScrollCleanup = null;
    }
    // S04 se mantiene visible en DOM, pero se desactiva la agitación por scroll.
      this.agitScrollCleanup = null;
  }

  initPainRoadmap() {
    if (typeof this.painRoadmapCleanup === 'function') {
      this.painRoadmapCleanup();
      this.painRoadmapCleanup = null;
    }

    const stage = this.container.querySelector('.lp-pain__stage');
    if (!stage) return;

    const cols = Array.from(stage.querySelectorAll('.lp-pain__col'));
    if (!cols.length) return;

    const setActive = (article) => {
      cols.forEach((c) => {
        const on = article != null && c === article;
        c.classList.toggle('lp-pain__col--active', on);
        c.setAttribute('aria-current', on ? 'true' : 'false');
      });
    };

    setActive(null);

    let autoTimer = null;

    const stopAuto = () => {
      if (autoTimer != null) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
    };

    const shouldPauseAuto = () => {
      if (document.visibilityState === 'hidden') return true;
      if (typeof stage.matches === 'function' && stage.matches(':hover')) return true;
      if (stage.contains(document.activeElement)) return true;
      return false;
    };

    const tickAuto = () => {
      if (shouldPauseAuto()) return;
      const i = cols.findIndex((c) => c.classList.contains('lp-pain__col--active'));
      const next = (i + 1) % cols.length;
      setActive(cols[next]);
    };

    const startAuto = () => {
      stopAuto();
      autoTimer = setInterval(tickAuto, 3000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stopAuto();
      else startAuto();
    };

    const onColEnter = (e) => {
      const col = e.currentTarget;
      if (col && cols.includes(col)) setActive(col);
    };

    const onStageLeave = (e) => {
      const next = e.relatedTarget;
      if (next && stage.contains(next)) return;
      setActive(null);
    };

    const onColClick = (e) => {
      const col = e.currentTarget;
      if (col && cols.includes(col)) setActive(col);
    };

    const onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const col = e.target.closest('.lp-pain__col');
      if (!col || !stage.contains(col)) return;
      e.preventDefault();
      setActive(col);
    };

    const onStageFocusIn = (e) => {
      const col = e.target.closest('.lp-pain__col');
      if (col && cols.includes(col)) setActive(col);
    };

    const onStageFocusOut = () => {
      requestAnimationFrame(() => {
        if (!stage.contains(document.activeElement)) setActive(null);
      });
    };

    cols.forEach((col) => {
      col.addEventListener('mouseenter', onColEnter);
      col.addEventListener('click', onColClick);
    });
    stage.addEventListener('mouseleave', onStageLeave);
    stage.addEventListener('focusin', onStageFocusIn);
    stage.addEventListener('keydown', onKey);
    stage.addEventListener('focusout', onStageFocusOut);
    document.addEventListener('visibilitychange', onVisibilityChange);
    startAuto();

    this.painRoadmapCleanup = () => {
      stopAuto();
      cols.forEach((col) => {
        col.removeEventListener('mouseenter', onColEnter);
        col.removeEventListener('click', onColClick);
      });
      stage.removeEventListener('mouseleave', onStageLeave);
      stage.removeEventListener('focusin', onStageFocusIn);
      stage.removeEventListener('keydown', onKey);
      stage.removeEventListener('focusout', onStageFocusOut);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }

  initFaqAccordion() {
    if (typeof this.faqCleanup === 'function') {
      this.faqCleanup();
      this.faqCleanup = null;
    }

    const buttons = this.container.querySelectorAll('.lp-faq__q');
    if (!buttons.length) return;

    const handlers = [];

    const toggle = (btn) => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      const answer = btn.nextElementSibling;
      const item = btn.closest('.lp-faq__item');

      // Close all
      buttons.forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.closest('.lp-faq__item')?.classList.remove('is-open');
        const a = b.nextElementSibling;
        if (a) a.hidden = true;
      });

      // Open if was closed
      if (!isOpen && answer) {
        btn.setAttribute('aria-expanded', 'true');
        answer.hidden = false;
        item?.classList.add('is-open');
      }
    };

    buttons.forEach(btn => {
      const handler = () => toggle(btn);
      btn.addEventListener('click', handler);
      handlers.push({ btn, handler });
    });

    this.faqCleanup = () => {
      handlers.forEach(({ btn, handler }) => btn.removeEventListener('click', handler));
    };
  }

  initLandingAppPreview() {
    if (typeof this.appPreviewCleanup === 'function') {
      this.appPreviewCleanup();
      this.appPreviewCleanup = null;
    }

    const root = this.container?.querySelector('[data-landing-app-preview]');
    if (!root) return;

    const titleEl = root.querySelector('[data-preview-title]');
    const urlEl = root.querySelector('[data-preview-url]');
    const panels = [...root.querySelectorAll('[data-preview-panel]')];
    const navBtns = [...root.querySelectorAll('[data-preview-nav]')];
    const subToggle = root.querySelector('[data-preview-subtoggle]');
    const subPanel = root.querySelector('[data-preview-flows-group] .lp-app-preview__sub');
    const flowsGroup = root.querySelector('[data-preview-flows-group]');
    const veraFeed = root.querySelector('[data-vera-feed]');
    const veraInput = root.querySelector('[data-vera-input]');
    const rangeLabel = root.querySelector('[data-preview-range-label]');
    const prodDetail = root.querySelector('[data-preview-prod-detail]');
    const prodRow = root.querySelector('[data-preview-prod-row]');
    const stepBody = root.querySelector('[data-preview-step-body]');
    const sbCaption = root.querySelector('[data-preview-sb-caption]');

    const TITLES = {
      vera: 'VERA',
      dashboard: 'Dashboard',
      production: 'Production',
      'flow-posts': 'Flows · Posts',
      'flow-reels': 'Flows · Reels',
      brand: 'Brand Organization',
    };
    const URL_PATH = {
      vera: 'org/acme/vera',
      dashboard: 'org/acme/dashboard',
      production: 'org/acme/production',
      'flow-posts': 'org/acme/flows/posts',
      'flow-reels': 'org/acme/flows/reels',
      brand: 'org/acme/brand',
    };
    const FLOW_IDS = new Set(['flow-posts', 'flow-reels']);
    const STEP_COPY = {
      1: 'Define objetivo, tono y CTA. VERA cruza con datos de audiencia activos.',
      2: 'Generación de variantes, hooks y piezas visuales alineadas al ADN.',
      3: 'Calendario, aprobaciones y publicación con registro de performance.',
    };
    const SB_COPY = [
      'Primer impacto: texto superpuesto + ritmo de corte sugerido.',
      'Desarrollo: prueba social, demo de producto o storytelling compacto.',
      'CTA claro: enlace, comentario guía o sticker según objetivo de campaña.',
    ];

    const setFlowsOpen = (open) => {
      if (!subToggle || !subPanel || !flowsGroup) return;
      subToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      flowsGroup.classList.toggle('is-open', open);
      if (open) subPanel.removeAttribute('hidden');
      else subPanel.setAttribute('hidden', '');
    };

    const setPanel = (id) => {
      if (!id || !TITLES[id]) return;
      panels.forEach((p) => {
        const on = p.dataset.previewPanel === id;
        p.classList.toggle('is-active', on);
        if (on) p.removeAttribute('hidden');
        else p.setAttribute('hidden', '');
      });
      navBtns.forEach((b) => {
        const on = b.dataset.previewNav === id;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (titleEl) titleEl.textContent = TITLES[id];
      if (urlEl) urlEl.textContent = URL_PATH[id] || URL_PATH.dashboard;
      if (FLOW_IDS.has(id)) setFlowsOpen(true);
      else setFlowsOpen(false);
      if (flowsGroup) flowsGroup.classList.toggle('is-child-active', FLOW_IDS.has(id));
    };

    const onClick = (e) => {
      const t = e.target;
      const nav = t.closest('[data-preview-nav]');
      if (nav && root.contains(nav)) {
        e.preventDefault();
        setPanel(nav.dataset.previewNav);
        return;
      }
      const sub = t.closest('[data-preview-subtoggle]');
      if (sub && root.contains(sub)) {
        e.preventDefault();
        const open = sub.getAttribute('aria-expanded') !== 'true';
        setFlowsOpen(open);
        return;
      }
      const chip = t.closest('[data-vera-chip]');
      if (chip && root.contains(chip) && veraFeed) {
        e.preventDefault();
        const line = document.createElement('p');
        line.className = 'lp-app-preview__bubble lp-app-preview__bubble--user';
        line.textContent = chip.textContent.trim();
        veraFeed.appendChild(line);
        const reply = document.createElement('p');
        reply.className = 'lp-app-preview__bubble lp-app-preview__bubble--ai';
        reply.textContent = 'Recibido. En la app, VERA enlazaría esto con tus datos de marca y mercado.';
        veraFeed.appendChild(reply);
        veraFeed.scrollTop = veraFeed.scrollHeight;
        return;
      }
      const fil = t.closest('[data-preview-filter]');
      if (fil && root.contains(fil)) {
        e.preventDefault();
        root.querySelectorAll('[data-preview-filter]').forEach((x) => x.classList.remove('is-active'));
        fil.classList.add('is-active');
        const k = fil.dataset.previewFilter;
        if (rangeLabel) {
          if (k === '7d') rangeLabel.textContent = 'Actividad — últimos 7 días (demo)';
          else if (k === '30d') rangeLabel.textContent = 'Actividad — últimos 30 días (demo)';
          else rangeLabel.textContent = 'Actividad — vista completa';
        }
        return;
      }
      const prow = t.closest('[data-preview-prod-row]');
      if (prow && prodDetail && root.contains(prow)) {
        e.preventDefault();
        const open = prow.getAttribute('aria-expanded') === 'true';
        prow.setAttribute('aria-expanded', open ? 'false' : 'true');
        prodDetail.toggleAttribute('hidden', open);
        return;
      }
      const step = t.closest('[data-preview-step]');
      if (step && stepBody && root.contains(step)) {
        e.preventDefault();
        root.querySelectorAll('[data-preview-step]').forEach((s) => {
          s.classList.remove('is-active');
          s.setAttribute('aria-selected', 'false');
        });
        step.classList.add('is-active');
        step.setAttribute('aria-selected', 'true');
        const n = step.dataset.previewStep;
        stepBody.textContent = STEP_COPY[n] || STEP_COPY[1];
        return;
      }
      const sb = t.closest('[data-preview-sb]');
      if (sb && sbCaption && root.contains(sb)) {
        e.preventDefault();
        const cards = [...root.querySelectorAll('[data-preview-sb]')];
        const i = cards.indexOf(sb);
        cards.forEach((c) => c.classList.remove('is-active'));
        sb.classList.add('is-active');
        sbCaption.textContent = SB_COPY[i] || SB_COPY[0];
        return;
      }
      const bc = t.closest('[data-preview-brand-card]');
      if (bc && root.contains(bc)) {
        bc.classList.toggle('is-selected');
      }
    };

    const onVeraKey = (e) => {
      if (e.key !== 'Enter' || !veraFeed || !veraInput) return;
      const v = veraInput.value.trim();
      if (!v) return;
      e.preventDefault();
      const u = document.createElement('p');
      u.className = 'lp-app-preview__bubble lp-app-preview__bubble--user';
      u.textContent = v;
      veraFeed.appendChild(u);
      const r = document.createElement('p');
      r.className = 'lp-app-preview__bubble lp-app-preview__bubble--ai';
      r.textContent = 'Demo: en producción, VERA respondería con contexto de tu organización.';
      veraFeed.appendChild(r);
      veraInput.value = '';
      veraFeed.scrollTop = veraFeed.scrollHeight;
    };

    root.addEventListener('click', onClick);
    if (veraInput) veraInput.addEventListener('keydown', onVeraKey);

    this.appPreviewCleanup = () => {
      root.removeEventListener('click', onClick);
      if (veraInput) veraInput.removeEventListener('keydown', onVeraKey);
    };
  }

  initWhyCarousel() {
    if (typeof this.whyCarouselCleanup === 'function') {
      this.whyCarouselCleanup();
      this.whyCarouselCleanup = null;
    }

    const root = this.container?.querySelector('[data-lp-why]');
    if (!root) return;

    const viewport = root.querySelector('[data-lp-why-viewport]');
    const prevBtn = root.querySelector('[data-lp-why-prev]');
    const nextBtn = root.querySelector('[data-lp-why-next]');
    if (!viewport || !prevBtn || !nextBtn) return;

    const gapPx = 16;
    let cachedStep = 0;

    const measureStep = () => {
      const card = viewport.querySelector('.lp-why__card-wrap');
      cachedStep = card
        ? Math.round(card.getBoundingClientRect().width + gapPx)
        : Math.round(viewport.clientWidth * 0.78);
    };
    measureStep();

    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduceMotion ? 'auto' : 'smooth';

    const onPrev = () => viewport.scrollBy({ left: -cachedStep, behavior });
    const onNext = () => viewport.scrollBy({ left: cachedStep, behavior });

    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        measureStep();
      });
    };

    prevBtn.addEventListener('click', onPrev);
    nextBtn.addEventListener('click', onNext);
    window.addEventListener('resize', onResize, { passive: true });

    this.whyCarouselCleanup = () => {
      prevBtn.removeEventListener('click', onPrev);
      nextBtn.removeEventListener('click', onNext);
      window.removeEventListener('resize', onResize);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
    };
  }

  initCapsProposta() {
    if (typeof this.capsPropostaCleanup === 'function') {
      this.capsPropostaCleanup();
      this.capsPropostaCleanup = null;
    }

    const shellRoot = this.container?.querySelector('[data-lp-caps-root]');
    if (!shellRoot) return;

    const PILLARS = [
      {
        word: 'PRECISIÓN',
        body: 'Cruzar datos, tendencias, competencia y ADN de marca para decidir qué comunicar, cuándo hacerlo y por qué.',
      },
      {
        word: 'INTELIGENCIA',
        body: 'Interpretar el mercado en tiempo real y convertir señales dispersas en decisiones estratégicas accionables.',
      },
      {
        word: 'VELOCIDAD',
        body: 'Responder antes de que la conversación cambie, antes de que la tendencia se enfríe y antes de que tu competencia llegue.',
      },
      {
        word: 'EFICIENCIA',
        body: 'Reducir fricción operativa y convertir procesos lentos en un sistema automático de decisión, creación y ejecución.',
      },
      {
        word: 'CONSISTENCIA',
        body: 'Mantener cada acción alineada con el tono, la identidad y los límites estratégicos de tu marca.',
      },
      {
        word: 'CALIDAD',
        body: 'Crear contenido visual, textual y audiovisual con estándar profesional, sin sacrificar detalle, intención ni coherencia.',
      },
    ];

    const axis = shellRoot.querySelector('[data-lp-caps-axis]');
    const viewport = shellRoot.querySelector('[data-lp-caps-viewport]');
    const prevBtn = shellRoot.querySelector('[data-lp-caps-prev]');
    const nextBtn = shellRoot.querySelector('[data-lp-caps-next]');
    const bodyEl = shellRoot.querySelector('[data-lp-caps-body]');

    const cleanups = [];
    const n = PILLARS.length;
    const gapPx = 14;
    let current = 0;

    const getSlides = () => [...(viewport?.querySelectorAll('.lp-caps__slide') ?? [])];

    const syncTabs = () => {
      if (!axis) return;
      axis.querySelectorAll('.lp-caps__axis-item').forEach((el, i) => {
        const on = i === current;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
        el.tabIndex = on ? 0 : -1;
      });
    };

    const syncSlideActiveClass = () => {
      if (!viewport) return;
      viewport.querySelectorAll('.lp-caps__slide').forEach((el, i) => {
        el.classList.toggle('is-active', i === current);
      });
    };

    const applyIndex = (idx) => {
      current = ((idx % n) + n) % n;
      syncTabs();
      syncSlideActiveClass();
      if (bodyEl) bodyEl.textContent = PILLARS[current].body;
    };

    let scrollToSlideIndex = () => {};

    const setActive = (idx) => {
      applyIndex(idx);
      scrollToSlideIndex(current);
    };

    if (axis) {
      const onAxisClick = (e) => {
        const item = e.target.closest('.lp-caps__axis-item');
        if (!item || !axis.contains(item)) return;
        const raw = item.getAttribute('data-index');
        const i = raw == null ? NaN : parseInt(raw, 10);
        if (Number.isNaN(i)) return;
        setActive(i);
      };
      axis.addEventListener('click', onAxisClick);
      cleanups.push(() => axis.removeEventListener('click', onAxisClick));

      const onAxisKey = (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
        const item = e.target.closest('.lp-caps__axis-item');
        if (!item || !axis.contains(item)) return;
        e.preventDefault();
        let i = parseInt(item.getAttribute('data-index') || '0', 10);
        if (e.key === 'ArrowDown') i = Math.min(n - 1, i + 1);
        if (e.key === 'ArrowUp') i = Math.max(0, i - 1);
        if (e.key === 'Home') i = 0;
        if (e.key === 'End') i = n - 1;
        setActive(i);
        const nextTab = axis.querySelector(`.lp-caps__axis-item[data-index="${i}"]`);
        if (nextTab) nextTab.focus();
      };
      axis.addEventListener('keydown', onAxisKey);
      cleanups.push(() => axis.removeEventListener('keydown', onAxisKey));
    }

    if (viewport) {
      /** Mientras es true, no aplicar índice desde scroll (evita carreras con snap / transform). */
      let suppressScrollIndexApply = false;
      let suppressTimerId = 0;

      const syncTrackEndPadding = () => {
        const track = viewport.querySelector('.lp-caps__track');
        const slide = viewport.querySelector('.lp-caps__slide');
        if (!track || !slide) return;
        const w = slide.getBoundingClientRect().width;
        const pad = Math.max(0, Math.round(viewport.clientWidth - w - gapPx));
        track.style.paddingInlineEnd = `${pad}px`;
      };

      /**
       * Índice desde scroll: offsetLeft respecto al track (position: relative) + reglas de borde.
       * getBoundingClientRect competía con scale/opacity en slides no activos.
       */
      const indexFromScrollLeft = () => {
        const slides = getSlides();
        if (!slides.length) return 0;
        const x = viewport.scrollLeft;
        const maxL = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        if (maxL <= 1) return 0;
        if (x <= 1) return 0;
        if (x >= maxL - 1) return slides.length - 1;
        const last = slides[slides.length - 1];
        if (last && x >= last.offsetLeft - 2) return slides.length - 1;

        let best = 0;
        let bestDist = Infinity;
        slides.forEach((el, i) => {
          const d = Math.abs(el.offsetLeft - x);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        return best;
      };

      scrollToSlideIndex = (i) => {
        const slides = getSlides();
        const el = slides[i];
        if (!el) return;

        if (suppressTimerId) {
          clearTimeout(suppressTimerId);
          suppressTimerId = 0;
        }

        suppressScrollIndexApply = true;
        syncTrackEndPadding();

        const applyScrollTarget = () => {
          const maxL = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
          const raw = el.offsetLeft;
          const target = Math.min(Math.max(0, raw), maxL);
          viewport.scrollLeft = Math.round(target);
        };

        requestAnimationFrame(() => {
          applyScrollTarget();
          requestAnimationFrame(applyScrollTarget);
        });

        suppressTimerId = window.setTimeout(() => {
          suppressTimerId = 0;
          applyScrollTarget();
          suppressScrollIndexApply = false;
        }, 180);
      };

      syncTrackEndPadding();

      let scrollRaf = null;
      const onViewportScroll = () => {
        if (suppressScrollIndexApply) return;
        if (scrollRaf != null) return;
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = null;
          if (suppressScrollIndexApply) return;
          const i = indexFromScrollLeft();
          if (i !== current) applyIndex(i);
        });
      };
      viewport.addEventListener('scroll', onViewportScroll, { passive: true });
      cleanups.push(() => {
        viewport.removeEventListener('scroll', onViewportScroll);
        if (scrollRaf != null) cancelAnimationFrame(scrollRaf);
        if (suppressTimerId) clearTimeout(suppressTimerId);
      });

      let resizeRaf = 0;
      const onResize = () => {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          syncTrackEndPadding();
          scrollToSlideIndex(current);
        });
      };
      window.addEventListener('resize', onResize, { passive: true });
      cleanups.push(() => {
        window.removeEventListener('resize', onResize);
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
      });

      const onViewportKey = (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        if (e.key === 'ArrowLeft') setActive(current - 1);
        else setActive(current + 1);
      };
      viewport.addEventListener('keydown', onViewportKey);
      cleanups.push(() => viewport.removeEventListener('keydown', onViewportKey));

      if (prevBtn && nextBtn) {
        const onPrev = () => setActive(current - 1);
        const onNext = () => setActive(current + 1);
        prevBtn.addEventListener('click', onPrev);
        nextBtn.addEventListener('click', onNext);
        cleanups.push(() => {
          prevBtn.removeEventListener('click', onPrev);
          nextBtn.removeEventListener('click', onNext);
        });
      }
    }

    setActive(0);
    requestAnimationFrame(() => {
      setActive(0);
    });

    this.capsPropostaCleanup = () => {
      cleanups.forEach((fn) => fn());
      this.capsPropostaCleanup = null;
    };
  }

  initCtaForm() {
    if (typeof this.ctaFormCleanup === 'function') {
      this.ctaFormCleanup();
      this.ctaFormCleanup = null;
    }

    const form = this.container.querySelector('.lp-cta__form');
    if (!form) return;

    const onSubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.lp-cta__submit');
      const successMsg = form.querySelector('.lp-cta__success');
      if (!btn) return;

      btn.disabled = true;
      const textEl = btn.querySelector('.lp-cta__submit-text');
      if (textEl) textEl.textContent = 'Enviando…';

      try {
        // Placeholder: here goes Supabase/API call
        await new Promise(r => setTimeout(r, 800));

        const fields = form.querySelector('.lp-cta__fields');
        if (fields) fields.style.display = 'none';
        btn.style.display = 'none';
        if (successMsg) successMsg.hidden = false;
      } catch {
        btn.disabled = false;
        if (textEl) textEl.textContent = 'Quiero acceso anticipado';
      }
    };

    form.addEventListener('submit', onSubmit);
    this.ctaFormCleanup = () => form.removeEventListener('submit', onSubmit);
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
