/**
 * LandingView - Landing pública (/).
 * Extiende PublicBaseView: reutiliza el shell persistente (header + footer)
 * y solo aporta su propio contenido inline. Sin templates.
 */
class LandingView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/';
    this.pageClass = 'public-page--landing';
    this.heroWordsRotatorCleanup = null;
    this.lfwScrollCleanup = null;
    this.whyCarouselCleanup = null;
  }

  renderContent() {
    return `
      <section class="landing-hero" aria-label="Main Hero">
        <div class="landing-hero__aurora" aria-hidden="true">
          <span class="landing-hero__orb landing-hero__orb--1"></span>
          <span class="landing-hero__orb landing-hero__orb--2"></span>
          <span class="landing-hero__orb landing-hero__orb--3"></span>
          <span class="landing-hero__orb landing-hero__orb--4"></span>
          <span class="landing-hero__orb landing-hero__orb--5"></span>
        </div>
        <div class="landing-hero__bg-layer landing-hero__bg-layer--a" aria-hidden="true"></div>
        <div class="landing-hero__bg-layer landing-hero__bg-layer--b" aria-hidden="true"></div>
        <div class="landing-hero__bg-dim" aria-hidden="true"></div>

        <div class="landing-hero__content">
          <div class="landing-hero__lockup">
            <div class="landing-hero__smart">
              <img class="landing-hero__smart-img" src="/recursos/banners/smart.svg" alt="AI Smart Content" width="525" height="145" loading="eager" fetchpriority="high">
            </div>
            <div class="landing-hero__words" aria-hidden="true">
              <div class="landing-hero__words-viewport">
                <div class="landing-hero__words-track">
                  <div class="landing-hero__words-item"><img src="/recursos/banners/ads.svg" alt="" width="271" height="166" loading="eager" fetchpriority="high" decoding="async"></div>
                  <div class="landing-hero__words-item"><img src="/recursos/banners/brand.svg" alt="" width="443" height="166" loading="eager" decoding="async"></div>
                  <div class="landing-hero__words-item"><img src="/recursos/banners/day.svg" alt="" width="280" height="166" loading="eager" decoding="async"></div>
                  <div class="landing-hero__words-item"><img src="/recursos/banners/focus.svg" alt="" width="418" height="166" loading="eager" decoding="async"></div>
                  <div class="landing-hero__words-item"><img src="/recursos/banners/images.svg" alt="" width="552" height="166" loading="eager" decoding="async"></div>
                  <div class="landing-hero__words-item"><img src="/recursos/banners/sales.svg" alt="" width="382" height="166" loading="eager" decoding="async"></div>
                  <div class="landing-hero__words-item"><img src="/recursos/banners/speed.svg" alt="" width="467" height="166" loading="eager" decoding="async"></div>
                  <div class="landing-hero__words-item"><img src="/recursos/banners/videos.svg" alt="" width="510" height="166" loading="eager" decoding="async"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="vprompt" id="landing-vera-prompt" aria-labelledby="vprompt-heading">
        <h2 id="vprompt-heading" class="vprompt__h2 sr-reveal">El cerebro que opera tu marca.</h2>
        <p class="vprompt__sub sr-reveal sr-reveal--d1">Analiza, decide y crea en tiempo real.</p>

        <div class="vprompt__box sr-reveal sr-reveal--d2">
          <textarea class="vprompt__textarea" placeholder="Analiza, decide y lo convierte en acción..." rows="4" aria-label="Describe qué quieres que haga Vera"></textarea>
          <button class="vprompt__send" type="button" aria-label="Enviar">
            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" aria-hidden="true">
              <path d="M10 15V5M10 5L6 9M10 5l4 4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div class="vprompt__chips sr-reveal sr-reveal--d3" role="list">
          <button class="vprompt__chip" type="button" role="listitem">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13" aria-hidden="true">
              <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="#888" stroke-width="1.2"/>
              <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" stroke="#888" stroke-width="1.2"/>
              <path d="M5.5 8.5h5M5.5 11h3" stroke="#888" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span>Variaciones de banner on-brand</span>
          </button>
          <button class="vprompt__chip" type="button" role="listitem">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13" aria-hidden="true">
              <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="#888" stroke-width="1.2"/>
              <circle cx="8" cy="8" r="2.2" stroke="#888" stroke-width="1.2"/>
              <circle cx="12" cy="5.5" r="0.7" fill="#888"/>
            </svg>
            <span>Editorial de moda en Tokio</span>
          </button>
          <button class="vprompt__chip" type="button" role="listitem">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13" aria-hidden="true">
              <rect x="1.5" y="2.5" width="5.5" height="5.5" rx="1" stroke="#888" stroke-width="1.2"/>
              <rect x="9" y="2.5" width="5.5" height="5.5" rx="1" stroke="#888" stroke-width="1.2"/>
              <rect x="1.5" y="10" width="5.5" height="5.5" rx="1" stroke="#888" stroke-width="1.2"/>
              <rect x="9" y="10" width="5.5" height="5.5" rx="1" stroke="#888" stroke-width="1.2"/>
            </svg>
            <span>Moodboard para campaña</span>
          </button>
        </div>
      </section>

      <section class="lpf" id="value-pillars" aria-label="Valor de AISmartContent">
        <div class="lpf__inner">
          <div class="lpf__row sr-reveal">
            <div class="lpf__content">
              <h3 class="lpf__title lpf__title--pillar-1">Muévete antes</h3>
              <p class="lpf__text">El mercado cambia en tiempo real.</p>
              <p class="lpf__text">Las oportunidades no esperan a que tu equipo las vea.</p>
              <p class="lpf__text">AISmartContent detecta señales antes de que se vuelvan tendencia. Analiza comportamiento, competencia y contexto para anticipar el movimiento.</p>
            </div>
          </div>
          <div class="lpf__row sr-reveal sr-reveal--d1">
            <div class="lpf__content">
              <h3 class="lpf__title lpf__title--pillar-2">Decide mejor</h3>
              <p class="lpf__text">AISmartContent cruza datos, tendencias, ADN de marca y performance para convertir todo en decisiones accionables. Sabes qué hacer. Cuándo hacerlo. Y por qué hacerlo. Decisiones basadas en contexto real.</p>
              <p class="lpf__text">No en intuición.</p>
            </div>
          </div>
          <div class="lpf__row sr-reveal sr-reveal--d2">
            <div class="lpf__content">
              <h3 class="lpf__title lpf__title--pillar-3">Ejecuta en minutos</h3>
              <p class="lpf__text">Entre la idea y la ejecución es donde se pierde todo.</p>
              <p class="lpf__text">AISmartContent elimina esa fricción. Transforma la decisión en contenido listo para salir. Imágenes, videos, copies. Todo alineado, todo listo. Sin procesos largos. Sin cuellos de botella.</p>
            </div>
          </div>
          <div class="lpf__row sr-reveal sr-reveal--d3">
            <div class="lpf__content">
              <h3 class="lpf__title lpf__title--pillar-4">Crece más rápido</h3>
              <p class="lpf__text">El crecimiento no viene de hacer más.</p>
              <p class="lpf__text">Viene de hacer mejor, en el momento correcto. AISmartContent optimiza cada acción en función de lo que realmente funciona.</p>
              <p class="lpf__text">Más impacto. Más relevancia. Más velocidad. Mientras otros intentan entender el mercado, tú ya estás creciendo dentro de él.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="lfw" id="landing-after-pillars" aria-label="Flujos generativos">
        <div class="lfw__inner">
          <div class="lfw__content-wrap">
            <div class="lfw__left">
              <div class="lfw__fill" aria-hidden="true"></div>
              <ul class="lfw__list">
                <li>Estrategia</li>
                <li>Análisis</li>
                <li>Monitoreo</li>
                <li>Scraping</li>
                <li>Marketing</li>
                <li>Competencia</li>
                <li>Fotografía</li>
                <li>Post</li>
                <li>Reels</li>
                <li>Historias</li>
                <li>Copys</li>
              </ul>
            </div>
            <div class="lfw__slides">
              <div class="lfw__slide lfw__slide--1" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--2" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--3" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--4" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--5" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--6" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--7" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--8" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--9" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--10" aria-hidden="true"></div>
              <div class="lfw__slide lfw__slide--11" aria-hidden="true"></div>
            </div>
          </div>
        </div>
      </section>

      <section class="landing-bento" id="landing-bento" aria-labelledby="landing-bento-heading">
        <div class="landing-bento__bg" aria-hidden="true"></div>
        <div class="landing-bento__inner">
          <header class="landing-bento__header sr-reveal">
            <h2 id="landing-bento-heading" class="landing-bento__title">Todo Lo Que Necesitas. En Un Solo Lugar.</h2>
            <p class="landing-bento__subtitle">AISmartContent optimiza cada decisión, elimina fricción y ejecuta en el momento correcto.</p>
          </header>
          <div class="landing-bento__grid">
            <article class="landing-bento__card landing-bento__card--yellow sr-reveal sr-reveal--d1">
              <div class="landing-bento__card-main landing-bento__card-main--stat" aria-hidden="true">2x</div>
              <p class="landing-bento__card-label">Ejecución más rápida</p>
            </article>
            <article class="landing-bento__card landing-bento__card--cyan sr-reveal sr-reveal--d2">
              <div class="landing-bento__card-main" aria-hidden="true">
                <svg class="landing-bento__chart" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect x="8" y="48" width="18" height="24" rx="2" fill="rgba(255,255,255,0.85)"/>
                  <rect x="34" y="36" width="18" height="36" rx="2" fill="rgba(255,255,255,0.92)"/>
                  <rect x="60" y="24" width="18" height="48" rx="2" fill="#ffffff"/>
                  <rect x="86" y="12" width="18" height="60" rx="2" fill="#ffffff"/>
                </svg>
              </div>
              <p class="landing-bento__card-label">Datos, contexto y decisiones en un solo sistema</p>
            </article>
            <article class="landing-bento__card landing-bento__card--purple sr-reveal sr-reveal--d3">
              <div class="landing-bento__card-main" aria-hidden="true">
                <svg class="landing-bento__orbit" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle cx="50" cy="50" r="38" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-dasharray="4 5"/>
                  <circle cx="50" cy="50" r="14" fill="#ffffff"/>
                  <circle cx="50" cy="14" r="7" fill="#ffffff"/>
                  <circle cx="86" cy="50" r="6" fill="#ffffff"/>
                  <circle cx="22" cy="72" r="6" fill="#ffffff"/>
                </svg>
              </div>
              <p class="landing-bento__card-label">Todo integrado en una herramienta</p>
            </article>
            <article class="landing-bento__card landing-bento__card--green sr-reveal sr-reveal--d4">
              <div class="landing-bento__card-main landing-bento__card-main--stat" aria-hidden="true">130%</div>
              <p class="landing-bento__card-label">Mayor impacto por acción</p>
            </article>
          </div>
        </div>
      </section>

      <section class="landing-intro-cards" id="landing-intro-cards" aria-labelledby="lic-heading">
        <div class="landing-intro-cards__inner">
          <div class="landing-intro-cards__header">
            <h2 id="lic-heading" class="landing-intro-cards__title sr-reveal">Un sistema que piensa mientras tu equipo duerme.</h2>
            <p class="landing-intro-cards__sub sr-reveal">Lee el mercado en tiempo real, conecta señales,<br>detecta oportunidades y ejecuta con criterio.</p>
          </div>
          <div class="landing-intro-cards__grid">
            <article class="landing-intro-cards__card sr-reveal sr-reveal--d1">
              <div class="landing-intro-cards__card-body">
                <h3 class="landing-intro-cards__card-title">Lectura continua del mercado</h3>
                <p class="landing-intro-cards__card-text">Vera monitorea tendencias, competencia y comportamiento real.</p>
              </div>
            </article>
            <article class="landing-intro-cards__card sr-reveal sr-reveal--d2">
              <div class="landing-intro-cards__card-body">
                <h3 class="landing-intro-cards__card-title">Decide qué hacer y qué ignorar</h3>
                <p class="landing-intro-cards__card-text">Prioriza por impacto, timing y relevancia para la marca.</p>
              </div>
            </article>
            <article class="landing-intro-cards__card sr-reveal sr-reveal--d3">
              <div class="landing-intro-cards__card-body">
                <h3 class="landing-intro-cards__card-title">Contenido con intención</h3>
                <p class="landing-intro-cards__card-text">Cada pieza responde a una estrategia. Nada es genérico.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="vbento" id="landing-vera-bento" aria-labelledby="vbento-heading">
        <div class="vbento__inner">
          <div class="vbento__header sr-reveal">
            <img src="/recursos/vera/Vera-2.svg" alt="Vera" class="vbento__logo" width="133" height="51">
            <h2 id="vbento-heading" class="vbento__title">Un sistema. Todo conectado.</h2>
            <p class="vbento__sub">Vera no es una herramienta. Es la inteligencia que conecta señal, decisión, ejecución y aprendizaje en un solo flujo.</p>
          </div>
          <div class="vbento__grid">
            <article class="vbento__card vbento__card--hero sr-reveal sr-reveal--d1">
              <div class="vbento__card-visual" aria-hidden="true">
                <div class="vbento__orbit">
                  <span class="vbento__orbit-dot vbento__orbit-dot--a"></span>
                  <span class="vbento__orbit-dot vbento__orbit-dot--b"></span>
                  <span class="vbento__orbit-dot vbento__orbit-dot--c"></span>
                </div>
                <img src="/recursos/vera/Vera-2.svg" alt="Vera" class="vbento__hero-logo">
              </div>
              <div class="vbento__card-body">
                <h3 class="vbento__card-title">Un solo sistema</h3>
                <p class="vbento__card-desc">Desde inteligencia hasta ejecución. Vera conecta cada parte del proceso sin fricción.</p>
              </div>
            </article>
            <article class="vbento__card vbento__card--reading sr-reveal sr-reveal--d2">
              <div class="vbento__card-body">
                <h3 class="vbento__card-title">Lectura en tiempo real</h3>
                <p class="vbento__card-desc">Monitorea tendencias, competencia y comportamiento del consumidor.</p>
              </div>
            </article>
            <article class="vbento__card vbento__card--decision sr-reveal sr-reveal--d3">
              <div class="vbento__card-body">
                <h3 class="vbento__card-title">Decisiones con criterio</h3>
                <p class="vbento__card-desc">Evalúa qué hacer, cuándo hacerlo y por qué. Prioriza impacto real sobre ruido.</p>
              </div>
            </article>
            <article class="vbento__card vbento__card--content sr-reveal sr-reveal--d4">
              <div class="vbento__card-body">
                <h3 class="vbento__card-title">Contenido que construye marca</h3>
                <p class="vbento__card-desc">Imágenes, copys, campañas y piezas alineadas al ADN.</p>
              </div>
            </article>
            <article class="vbento__card vbento__card--connected sr-reveal sr-reveal--d5">
              <div class="vbento__card-body">
                <h3 class="vbento__card-title">Todo conectado</h3>
                <p class="vbento__card-desc">Investigación, estrategia y ejecución trabajando como un solo sistema.</p>
              </div>
            </article>
            <article class="vbento__card vbento__card--improve sr-reveal sr-reveal--d6">
              <div class="vbento__card-body">
                <h3 class="vbento__card-title">Mejora con cada resultado</h3>
                <p class="vbento__card-desc">Analiza performance, detecta patrones y ajusta automáticamente.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="landing-statement" id="landing-statement">
        <div class="landing-statement__inner">
          <h2 class="landing-statement__heading sr-reveal">
            No responde a prompts.<br>
            Opera con inteligencia, criterio y<br>
            contexto en tiempo real.
          </h2>
          <p class="landing-statement__sub sr-reveal sr-reveal--d1">
            Cada señal del mercado se transforma en una decisión, cada<br>
            decisión en acción y cada acción en aprendizaje.
          </p>
          <div class="landing-statement__cta sr-reveal sr-reveal--d2">
            <a href="/contacto" class="landing-statement__btn">Contactar ventas ↗</a>
          </div>
        </div>
      </section>

      <section class="landing-signal" id="landing-signal" aria-labelledby="landing-signal-heading">
        <div class="landing-signal__inner">
          <h2 id="landing-signal-heading" class="landing-signal__title sr-reveal">
            De la señal a la <span class="landing-signal__title-accent">acción</span>
          </h2>
          <div class="landing-signal__grid">
            <article class="landing-signal__card landing-signal__card--featured sr-reveal sr-reveal--d1">
              <span class="landing-signal__step">01 Señal</span>
              <div class="landing-signal__viz landing-signal__viz--menu" aria-hidden="true">
                <div class="landing-signal__menu">
                  <span class="landing-signal__menu-label">Add Block</span>
                  <ul class="landing-signal__menu-list">
                    <li><span class="landing-signal__menu-ico" aria-hidden="true">T</span> Text</li>
                    <li><span class="landing-signal__menu-ico" aria-hidden="true">▢</span> Image</li>
                    <li><span class="landing-signal__menu-ico" aria-hidden="true">▶</span> Video</li>
                    <li><span class="landing-signal__menu-ico" aria-hidden="true">↑</span> Add Source</li>
                  </ul>
                </div>
              </div>
              <div class="landing-signal__card-foot">
                <h3 class="landing-signal__card-h">Lo que está pasando</h3>
                <p class="landing-signal__card-p">Analiza tendencias, competencia y comportamiento del mercado.</p>
              </div>
            </article>
            <article class="landing-signal__card sr-reveal sr-reveal--d2">
              <span class="landing-signal__step">02 Decisión</span>
              <div class="landing-signal__viz landing-signal__viz--glass" aria-hidden="true">
                <div class="landing-signal__glass-layers">
                  <div class="landing-signal__glass-warm"></div>
                  <div class="landing-signal__glass-ribs"></div>
                  <div class="landing-signal__glass-figure"></div>
                </div>
                <div class="landing-signal__float-tags">
                  <span class="landing-signal__tag">Francisco</span>
                  <span class="landing-signal__tag">Bogdan</span>
                  <span class="landing-signal__tag">Orpheus</span>
                </div>
                <span class="landing-signal__cursor" aria-hidden="true"></span>
              </div>
              <div class="landing-signal__card-foot">
                <h3 class="landing-signal__card-h">Qué hacer</h3>
                <p class="landing-signal__card-p">Cruza datos, ADN de marca y rendimiento.</p>
              </div>
            </article>
            <article class="landing-signal__card sr-reveal sr-reveal--d3">
              <span class="landing-signal__step">03 Ejecución</span>
              <div class="landing-signal__viz landing-signal__viz--split" aria-hidden="true">
                <div class="landing-signal__split-art" role="presentation"></div>
                <div class="landing-signal__split-panel">
                  <strong class="landing-signal__split-title">Abstract Motion Loop</strong>
                  <p class="landing-signal__split-meta">Campaign motion · 12 assets · Ready</p>
                  <p class="landing-signal__split-body">Loop optimizado para reels y paid social, alineado a tono de marca y formatos activos.</p>
                </div>
              </div>
              <div class="landing-signal__card-foot">
                <h3 class="landing-signal__card-h">Acción sin fricción</h3>
                <p class="landing-signal__card-p">Convierte decisiones en contenido listo alineado a estrategia y optimizado para impacto.</p>
              </div>
            </article>
          </div>

          <p class="landing-signal__lede sr-reveal">
            AISmartContent conecta datos, contexto y ejecución para que tu marca actúe en el momento correcto.
          </p>
          <div class="landing-signal__cta-wrap sr-reveal sr-reveal--d1">
            <a href="/contacto" class="landing-signal__cta">Hablar con ventas</a>
          </div>
        </div>
      </section>

      <section class="landing-why" id="landing-why" aria-labelledby="landing-why-heading">
        <div class="landing-why__inner">
          <h2 id="landing-why-heading" class="landing-why__title sr-reveal">Por qué AISmartContent cambia cómo opera tu marca.</h2>
        </div>
        <div class="landing-why__viewport" id="landing-why-viewport" tabindex="0" role="region" aria-roledescription="carrusel" aria-label="Beneficios de AISmartContent">
          <div class="landing-why__track">
            <article class="landing-why__card-wrap">
              <div class="landing-why__card">
                <div class="landing-why__card-body">
                  <h3 class="landing-why__card-title">Lectura en tiempo real</h3>
                  <p class="landing-why__card-desc">Entiende lo que está pasando en tu mercado antes de que sea evidente.</p>
                </div>
                <span class="landing-why__fab landing-why__fab--plus" aria-hidden="true"><span class="landing-why__fab-icon">+</span></span>
              </div>
            </article>
            <article class="landing-why__card-wrap">
              <div class="landing-why__card">
                <div class="landing-why__card-body">
                  <h3 class="landing-why__card-title">Decisiones con contexto</h3>
                  <p class="landing-why__card-desc">Cruza datos, tendencias y ADN de marca para definir qué hacer en cada momento.</p>
                </div>
                <span class="landing-why__fab landing-why__fab--plus" aria-hidden="true"><span class="landing-why__fab-icon">+</span></span>
              </div>
            </article>
            <article class="landing-why__card-wrap">
              <div class="landing-why__card">
                <div class="landing-why__card-body">
                  <h3 class="landing-why__card-title">Ejecución alineada</h3>
                  <p class="landing-why__card-desc">Convierte decisiones en contenido listo para salir, sin fricción.</p>
                </div>
                <span class="landing-why__fab landing-why__fab--arrow" aria-hidden="true"><span class="landing-why__fab-icon">&gt;</span></span>
              </div>
            </article>
            <article class="landing-why__card-wrap">
              <div class="landing-why__card">
                <div class="landing-why__card-body">
                  <h3 class="landing-why__card-title">Optimización continua</h3>
                  <p class="landing-why__card-desc">Aprende de cada acción para mejorar la siguiente.</p>
                </div>
                <span class="landing-why__fab landing-why__fab--plus" aria-hidden="true"><span class="landing-why__fab-icon">+</span></span>
              </div>
            </article>
          </div>
        </div>
        <div class="landing-why__inner landing-why__inner--nav">
          <div class="landing-why__nav" role="group" aria-label="Desplazar carrusel">
            <button type="button" class="landing-why__nav-btn landing-why__nav-btn--prev" id="landing-why-prev" aria-controls="landing-why-viewport" aria-label="Anterior">
              <span aria-hidden="true">&lt;</span>
            </button>
            <button type="button" class="landing-why__nav-btn landing-why__nav-btn--next" id="landing-why-next" aria-controls="landing-why-viewport" aria-label="Siguiente">
              <span aria-hidden="true">&gt;</span>
            </button>
          </div>
        </div>
      </section>

      <section class="landing-different" id="landing-different" aria-labelledby="landing-different-heading">
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
    `;
  }

  async init() {
    await super.init();
    this.initHeroWordsRotator();
    this.initLfwScrollAnimation();
    this.initWhyCarousel();
  }

  async onLeave() {
    await super.onLeave();
    if (typeof this.heroWordsRotatorCleanup === 'function') {
      this.heroWordsRotatorCleanup();
      this.heroWordsRotatorCleanup = null;
    }
    if (typeof this.lfwScrollCleanup === 'function') {
      this.lfwScrollCleanup();
      this.lfwScrollCleanup = null;
    }
    if (typeof this.whyCarouselCleanup === 'function') {
      this.whyCarouselCleanup();
      this.whyCarouselCleanup = null;
    }
  }

  destroy() {
    this.onLeave();
    super.destroy();
  }

  initHeroWordsRotator() {
    if (typeof this.heroWordsRotatorCleanup === 'function') {
      this.heroWordsRotatorCleanup();
      this.heroWordsRotatorCleanup = null;
    }

    const track = this.container.querySelector('.landing-hero__words-track');
    const layerA = this.container.querySelector('.landing-hero__bg-layer--a');
    const layerB = this.container.querySelector('.landing-hero__bg-layer--b');
    if (!track || !layerA || !layerB) return;

    const realItems = Array.from(track.querySelectorAll('.landing-hero__words-item'));
    if (realItems.length < 2) return;

    const N = realItems.length;
    const heroBackgrounds = [
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102754/f6c61290-16d4-440d-9772-a74f13a80f35-cloud-wonder_2-2x_copia_bxpbfo.jpg',
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102754/Recurso_28Imagen-cloud-wonder_2-2x_copia_zgwsbb.jpg',
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102754/Recurso_36Imagen-cloud-wonder_2-2x_copia_bqshyg.jpg',
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102752/Recurso_24Imagen-cloud-wonder_2-2x_copia_gxsset.jpg',
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102750/Recurso_38Imagen-cloud-wonder_2-2x_copia_ixttbb.jpg',
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102749/Recurso_8Imagen-cloud-wonder_2-2x_copia_lg0yej.jpg',
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102748/Recurso_33Imagen-cloud-wonder_2-2x_copia_y1jknh.jpg',
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102747/Recurso_5Imagen-cloud-wonder_2-2x_copia_mukuoh.jpg',
      'https://res.cloudinary.com/dmruwjuxn/image/upload/q_auto/f_auto/v1776102747/Recurso_17dImagen-cloud-wonder_2-2x_copia_y26515.jpg'
    ];

    const getBgUrl = (i) => heroBackgrounds[((i % heroBackgrounds.length) + heroBackgrounds.length) % heroBackgrounds.length];

    let activeLayer = layerA;
    let inactiveLayer = layerB;
    const FADE_MS = 900;

    const preStageNext = (next) => {
      inactiveLayer.style.backgroundImage = `url("${getBgUrl(next)}")`;
    };

    const crossfadeTo = (i) => {
      const url = getBgUrl(i);
      inactiveLayer.style.backgroundImage = `url("${url}")`;
      inactiveLayer.style.zIndex = '1';
      activeLayer.style.zIndex = '0';
      inactiveLayer.classList.remove('is-active-bg');

      requestAnimationFrame(() => requestAnimationFrame(() => {
        inactiveLayer.style.opacity = '1';
        inactiveLayer.classList.add('is-active-bg');
        setTimeout(() => {
          activeLayer.style.opacity = '0';
          activeLayer.classList.remove('is-active-bg');
          [activeLayer, inactiveLayer] = [inactiveLayer, activeLayer];
          setTimeout(() => preStageNext(i + 1), 100);
        }, FADE_MS);
      }));
    };

    [realItems[N - 1], realItems[N - 2]].forEach(item => {
      track.insertBefore(item.cloneNode(true), track.firstChild);
    });
    for (let i = 0; i < 3; i++) track.appendChild(realItems[i].cloneNode(true));

    let realIdx = 0;
    let busy = false;
    let wrapResetTimer = null;
    const ROTATE = 5000;
    const WORD_TR = 650;

    const getRowH = () => realItems[0].offsetHeight || 80;
    const setPos = (idx, animate) => {
      const h = getRowH();
      track.style.transition = animate ? `transform ${WORD_TR}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none';
      track.style.transform = `translateY(${-(idx * h)}px)`;
      if (!animate) void track.offsetHeight;
    };

    if (!layerA.style.backgroundImage) layerA.style.backgroundImage = `url("${getBgUrl(0)}")`;
    layerA.style.opacity = '1';
    layerA.style.zIndex = '1';
    layerA.classList.add('is-active-bg');
    layerB.style.opacity = '0';
    layerB.style.zIndex = '0';
    setPos(0, false);
    setTimeout(() => preStageNext(1), 300);

    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.heroWordsRotatorCleanup = () => {};
      return;
    }

    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      realIdx++;
      setPos(realIdx, true);
      crossfadeTo(realIdx);
      if (realIdx >= N) {
        if (wrapResetTimer) clearTimeout(wrapResetTimer);
        wrapResetTimer = setTimeout(() => {
          realIdx = 0;
          setPos(0, false);
          busy = false;
          wrapResetTimer = null;
        }, WORD_TR + 50);
        return;
      }
      busy = false;
    }, ROTATE);

    this.heroWordsRotatorCleanup = () => {
      clearInterval(timer);
      if (wrapResetTimer) clearTimeout(wrapResetTimer);
      [layerA, layerB].forEach(l => {
        l.classList.remove('is-active-bg');
        l.style.zIndex = '';
      });
    };
  }

  initLfwScrollAnimation() {
    if (typeof this.lfwScrollCleanup === 'function') {
      this.lfwScrollCleanup();
      this.lfwScrollCleanup = null;
    }

    const section = this.container.querySelector('#landing-after-pillars');
    if (!section) return;

    const listEl = section.querySelector('.lfw__list');
    const fill = section.querySelector('.lfw__fill');
    const listItems = listEl ? Array.from(listEl.querySelectorAll('li')) : [];
    const slides = Array.from(section.querySelectorAll('.lfw__slide'));
    if (!listItems.length || !slides.length) return;

    const count = listItems.length;
    const ITEM_COLORS = [
      '#ff0000','#ff6500','#ffe500','#9acc00','#00d614',
      '#00e7ff','#0018ee','#5b00ea','#900090','#ff0000','#ff6500',
    ];
    const INACTIVE_COLOR = 'rgba(212,209,216,0.15)';

    const shell = document.getElementById('public-shell');
    const scrollEl = () => (shell && shell.scrollHeight > shell.clientHeight + 2) ? shell : window;
    const getY = () => {
      const el = scrollEl();
      return el === window ? (window.scrollY || document.documentElement.scrollTop || 0) : el.scrollTop;
    };
    const setY = (y) => {
      const el = scrollEl();
      if (el === window) window.scrollTo({ top: y, left: 0, behavior: 'auto' });
      else el.scrollTop = y;
    };
    const smoothBy = (dy) => {
      const el = scrollEl();
      (el === window ? window : el).scrollBy({ top: dy, behavior: 'smooth' });
    };

    const lockYFromSection = () => getY() + section.getBoundingClientRect().top;

    let locked = false, lockY = 0, idx = 0, wheelAccum = 0;
    let touchStartY = null, suppressLock = false, suppressTimer = null, lastAdvance = 0;

    const WHEEL_THRESHOLD = 120, ENTER_ZONE = 60, COOLDOWN = 420, CAP = 60;
    const leftCol = section.querySelector('.lfw__left');

    const positionCarousel = (active, animate) => {
      const h = leftCol ? leftCol.clientHeight : window.innerHeight;
      const centerY = h * 0.40;
      const step = h * 0.13;
      listItems.forEach((item, j) => {
        const offset = j - active;
        const y = centerY + offset * step;
        const scale = Math.max(0.28, 1 - Math.abs(offset) * 0.20);
        const opacity = Math.max(0.04, 1 - Math.abs(offset) * 0.26);
        const color = offset === 0 ? ITEM_COLORS[active % ITEM_COLORS.length] : INACTIVE_COLOR;
        if (!animate) item.style.transition = 'none';
        else item.style.transition = '';
        item.style.transform = `translateY(${y}px) scale(${scale})`;
        item.style.opacity = opacity;
        item.style.color = color;
      });
    };

    const activate = (i) => {
      const safe = Math.max(0, Math.min(count - 1, i));
      positionCarousel(safe, true);
      slides.forEach((s, j) => {
        const on = j === safe;
        s.style.opacity = on ? '1' : '0';
        s.style.visibility = on ? 'visible' : 'hidden';
      });
      if (fill) fill.style.transform = `scaleY(${(safe + 1) / count})`;
    };

    positionCarousel(0, false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      listItems.forEach(item => { item.style.transition = ''; });
    }));

    const scheduleClear = () => {
      if (suppressTimer) clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressLock = false; suppressTimer = null; }, 1100);
    };

    const enterLock = (fromBottom) => {
      lockY = lockYFromSection();
      setY(lockY);
      locked = true;
      wheelAccum = 0;
      idx = fromBottom ? count - 1 : 0;
      activate(idx);
    };

    const exitDown = () => {
      locked = false;
      suppressLock = true;
      wheelAccum = 0;
      smoothBy(Math.round(window.innerHeight * 0.65));
      scheduleClear();
    };
    const exitUp = () => {
      locked = false;
      suppressLock = true;
      wheelAccum = 0;
      smoothBy(-Math.round(window.innerHeight * 0.65));
      scheduleClear();
    };

    const advance = (fwd) => {
      wheelAccum = 0;
      const now = Date.now();
      if (now - lastAdvance < COOLDOWN) return;
      lastAdvance = now;
      if (fwd) {
        if (idx < count - 1) { idx++; activate(idx); }
        else exitDown();
      } else {
        if (idx > 0) { idx--; activate(idx); }
        else exitUp();
      }
    };

    const tryEnter = (dy, prevent) => {
      if (suppressLock) return false;
      const dist = section.getBoundingClientRect().top;
      if (dy > 0 && dist <= ENTER_ZONE && dist > -ENTER_ZONE * 1.5) { prevent(); enterLock(false); return true; }
      if (dy < 0 && Math.abs(dist) <= ENTER_ZONE) { prevent(); enterLock(true); return true; }
      return false;
    };

    const normWheel = (e) => {
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= window.innerHeight;
      const sign = dy >= 0 ? 1 : -1;
      return sign * Math.min(Math.abs(dy), CAP);
    };

    const onWheel = (e) => {
      if (locked) {
        e.preventDefault();
        wheelAccum += normWheel(e);
        if (wheelAccum >= WHEEL_THRESHOLD) advance(true);
        else if (wheelAccum <= -WHEEL_THRESHOLD) advance(false);
        return;
      }
      tryEnter(normWheel(e), () => e.preventDefault());
    };
    const onTs = (e) => {
      if (!e.touches?.[0]) return;
      touchStartY = e.touches[0].clientY;
      if (locked) wheelAccum = 0;
    };
    const onTm = (e) => {
      if (touchStartY == null || !e.touches?.[0]) return;
      const dy = touchStartY - e.touches[0].clientY;
      if (Math.abs(dy) < 5) return;
      touchStartY = e.touches[0].clientY;
      if (locked) {
        e.preventDefault();
        wheelAccum += dy * 1.4;
        if (wheelAccum >= WHEEL_THRESHOLD) advance(true);
        else if (wheelAccum <= -WHEEL_THRESHOLD) advance(false);
        return;
      }
      tryEnter(dy, () => e.preventDefault());
    };
    const onTe = () => { touchStartY = null; if (!locked) wheelAccum = 0; };
    const onResize = () => {
      if (locked) { lockY = lockYFromSection(); setY(lockY); }
      positionCarousel(idx, false);
    };

    activate(0);

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTs, { passive: true });
    window.addEventListener('touchmove', onTm, { passive: false });
    window.addEventListener('touchend', onTe, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    this.lfwScrollCleanup = () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTs);
      window.removeEventListener('touchmove', onTm);
      window.removeEventListener('touchend', onTe);
      window.removeEventListener('resize', onResize);
      if (suppressTimer) clearTimeout(suppressTimer);
      listItems.forEach(item => { item.style.color = ''; });
      slides.forEach(s => { s.style.opacity = ''; s.style.visibility = ''; });
      if (fill) fill.style.transform = '';
    };
  }

  initWhyCarousel() {
    if (typeof this.whyCarouselCleanup === 'function') {
      this.whyCarouselCleanup();
      this.whyCarouselCleanup = null;
    }

    const viewport = this.container.querySelector('#landing-why-viewport');
    const prevBtn = this.container.querySelector('#landing-why-prev');
    const nextBtn = this.container.querySelector('#landing-why-next');
    const track = viewport?.querySelector('.landing-why__track');
    const wraps = viewport ? viewport.querySelectorAll('.landing-why__card-wrap') : [];
    if (!viewport || !prevBtn || !nextBtn || !track || wraps.length === 0) return;

    const getStep = () => {
      const first = wraps[0];
      const gap = Number.parseFloat(getComputedStyle(track).gap || getComputedStyle(track).columnGap || '0') || 0;
      return first.offsetWidth + gap;
    };
    const EDGE = 3;
    const updateBtns = () => {
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const x = viewport.scrollLeft;
      prevBtn.disabled = x <= EDGE;
      nextBtn.disabled = x >= max - EDGE;
    };
    const go = (dir) => viewport.scrollBy({ left: dir * getStep(), behavior: 'smooth' });
    const onPrev = () => go(-1);
    const onNext = () => go(1);
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };

    prevBtn.addEventListener('click', onPrev);
    nextBtn.addEventListener('click', onNext);
    viewport.addEventListener('scroll', updateBtns, { passive: true });
    viewport.addEventListener('keydown', onKey);
    window.addEventListener('resize', updateBtns, { passive: true });
    updateBtns();

    this.whyCarouselCleanup = () => {
      prevBtn.removeEventListener('click', onPrev);
      nextBtn.removeEventListener('click', onNext);
      viewport.removeEventListener('scroll', updateBtns);
      viewport.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updateBtns);
    };
  }
}

window.LandingView = LandingView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}
