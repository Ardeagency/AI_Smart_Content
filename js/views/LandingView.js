/**
 * LandingView - Landing pública (/).
 * Extiende PublicBaseView: reutiliza el shell persistente (header + footer)
 * y solo aporta su propio contenido inline. Sin templates.
 *
 * Secciones (Blueprint v2 — 4 zonas psicológicas):
 *   Zona 1 — Captura:          S01 Hero, S02 Credibilidad
 *   Zona 2 — Problema:         S03 Dolor estructural, S04 Agitación
 *   Zona 3 — Solución:         S05 Capacidades, S06 VERA, S07 Dashboard
 *   Zona 4 — Confianza+Acción: S08 Lo que pasa, S09 Social, S10 FAQ, S11 CTA
 */
class LandingView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/';
    this.pageClass = 'public-page--landing';
    this.heroRevealCleanup = null;
    this.metricsCleanup = null;
    this.faqCleanup = null;
    this.ctaFormCleanup = null;
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
              <div class="lp-cred__brand" title="Meta">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/meta.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Meta</span>
              </div>
              <div class="lp-cred__brand" title="Google">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/google.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Google</span>
              </div>
              <div class="lp-cred__brand" title="TikTok">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/tiktok.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">TikTok</span>
              </div>
              <div class="lp-cred__brand" title="X">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/x.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">X</span>
              </div>
              <div class="lp-cred__brand" title="Amazon">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/amazon.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Amazon</span>
              </div>
              <div class="lp-cred__brand lp-cred__brand--wide" title="Mercado Libre">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://upload.wikimedia.org/wikipedia/commons/6/60/Mercado_Libre_wordmark_%28Spanish_version%29.svg" alt="" width="72" height="18" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Mercado Libre</span>
              </div>
              <div class="lp-cred__brand" title="OpenAI">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/openai.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">OpenAI</span>
              </div>
              <div class="lp-cred__brand" title="Anthropic">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/anthropic.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Anthropic</span>
              </div>
              <div class="lp-cred__brand" title="KlingAI">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/kling.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">KlingAI</span>
              </div>
              <div class="lp-cred__brand" title="Nano Banana PRO">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/nanobanana.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Nano Banana PRO</span>
              </div>
              <div class="lp-cred__brand" title="Seedance 2.0">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/bytedance.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Seedance 2.0</span>
              </div>
              <div class="lp-cred__brand" title="ComfyUI">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/comfyui.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">ComfyUI</span>
              </div>
              <div class="lp-cred__brand" title="n8n">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/n8n.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">n8n</span>
              </div>
              <div class="lp-cred__brand" title="Kie AI">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://kie.ai/logo.png" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Kie AI</span>
              </div>
              <!-- duplicado para carrusel infinito -->
              <div class="lp-cred__brand" title="Meta">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/meta.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Meta</span>
              </div>
              <div class="lp-cred__brand" title="Google">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/google.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Google</span>
              </div>
              <div class="lp-cred__brand" title="TikTok">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/tiktok.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">TikTok</span>
              </div>
              <div class="lp-cred__brand" title="X">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/x.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">X</span>
              </div>
              <div class="lp-cred__brand" title="Amazon">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/amazon.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Amazon</span>
              </div>
              <div class="lp-cred__brand lp-cred__brand--wide" title="Mercado Libre">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://upload.wikimedia.org/wikipedia/commons/6/60/Mercado_Libre_wordmark_%28Spanish_version%29.svg" alt="" width="72" height="18" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Mercado Libre</span>
              </div>
              <div class="lp-cred__brand" title="OpenAI">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/openai.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">OpenAI</span>
              </div>
              <div class="lp-cred__brand" title="Anthropic">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/anthropic.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Anthropic</span>
              </div>
              <div class="lp-cred__brand" title="KlingAI">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/kling.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">KlingAI</span>
              </div>
              <div class="lp-cred__brand" title="Nano Banana PRO">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/nanobanana.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Nano Banana PRO</span>
              </div>
              <div class="lp-cred__brand" title="Seedance 2.0">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/bytedance.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Seedance 2.0</span>
              </div>
              <div class="lp-cred__brand" title="ComfyUI">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.87.0/icons/comfyui.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">ComfyUI</span>
              </div>
              <div class="lp-cred__brand" title="n8n">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/n8n.svg" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">n8n</span>
              </div>
              <div class="lp-cred__brand" title="Kie AI">
                <span class="lp-cred__brand-mark" aria-hidden="true"><img class="lp-cred__brand-img" src="https://kie.ai/logo.png" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
                <span class="lp-cred__brand-label">Kie AI</span>
              </div>
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
                  <p class="lp-pain__highlight-eyebrow">Llegas tarde</p>
                  <p class="lp-pain__highlight-title">Pierdes el momento correcto</p>
                  <p class="lp-pain__highlight-sub">Cuando publicas, la conversación ya cambió.<br>Tu contenido se siente repetido antes de generar impacto.</p>
                </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">
                    <span class="lp-pain__col-num-main">01</span><span class="lp-pain__col-num-join" aria-hidden="true"><span class="lp-pain__col-num-sep"> — </span><span class="lp-pain__col-num-tail">Llegas tarde</span></span>
                  </div>
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
                  <p class="lp-pain__highlight-eyebrow">Mapa del dolor</p>
                  <p class="lp-pain__highlight-title">Aquí impacta</p>
                  <p class="lp-pain__highlight-sub">Cuando solo reaccionás, el timing ya lo definió otro.</p>
                </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">02</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Compiten con información incompleta</h3>
                    <p class="lp-pain__col-body">Publicas con lo que ya tenías preparado, no con lo que está pasando hoy.<br>Mientras el mercado cambia todos los días, tu contenido sigue un ritmo que ya se quedó atrás.</p>
                    <div class="lp-pain__col-reveal">
                      <p>Las marcas reactivas pierden el 40% de las oportunidades de timing. La velocidad es ventaja competitiva.</p>
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
                  <p class="lp-pain__highlight-eyebrow">Mapa del dolor</p>
                  <p class="lp-pain__highlight-title">Aquí impacta</p>
                  <p class="lp-pain__highlight-sub">El cuello de botella deja de ser creatividad: es capacidad.</p>
                </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">03</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Su comunicación pierde consistencia</h3>
                    <p class="lp-pain__col-body">La idea original se transforma en el proceso.<br>Entre equipos, proveedores y cambios, lo que comunicas deja de ser claro y consistente.</p>
                    <div class="lp-pain__col-reveal">
                      <p>Los equipos dedican el 60% de su tiempo a tareas repetitivas que un sistema inteligente hace en segundos.</p>
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
                  <p class="lp-pain__highlight-eyebrow">Mapa del dolor</p>
                  <p class="lp-pain__highlight-title">Aquí impacta</p>
                  <p class="lp-pain__highlight-sub">La IA sin ADN de marca diluye posicionamiento en cada pieza.</p>
                </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">04</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Dependen de producción lenta</h3>
                    <p class="lp-pain__col-body">Cada contenido implica grabación, diseño, revisiones y aprobaciones que toman días.<br>Cuando finalmente publicas, el momento ya pasó.</p>
                    <div class="lp-pain__col-reveal">
                      <p>La IA genérica produce contenido genérico. Sin identidad estructurada, cada pieza erosiona tu posicionamiento.</p>
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
                  <p class="lp-pain__highlight-eyebrow">Mapa del dolor</p>
                  <p class="lp-pain__highlight-title">Aquí impacta</p>
                  <p class="lp-pain__highlight-sub">Sin memoria operativa, cada campaña arranca desde cero otra vez.</p>
                </div>
                <div class="lp-pain__col-spacer" aria-hidden="true"></div>
                <div class="lp-pain__col-foot">
                  <div class="lp-pain__col-num" aria-hidden="true">05</div>
                  <div class="lp-pain__col-content">
                    <h3 class="lp-pain__col-title">Repiten sin aprender</h3>
                    <p class="lp-pain__col-body">El mercado cambia rápido, pero tu forma de operar no.<br>Sigues repitiendo lo mismo sin convertir lo aprendido en una ventaja real.</p>
                    <div class="lp-pain__col-reveal">
                      <p>Sin memoria operativa, repites los mismos errores. La ventaja competitiva viene de un sistema que mejora.</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
          <div class="lp-pain__timeline" aria-hidden="true"></div>
        </div>
      </section>

      <!-- ════════ S04: AGITACIÓN ════════ -->
      <section class="lp-agit" id="landing-4" aria-label="El costo de no actuar">
        <div class="lp-agit__inner">
          <p class="lp-agit__eyebrow sr-reveal">El costo de no actuar</p>
          <h2 class="lp-agit__headline sr-reveal">
            Cada día sin sistema es un día que<br>
            <em class="lp-agit__accent">tu competencia te saca ventaja.</em>
          </h2>
          <div class="lp-agit__ticker-wrap" aria-label="Consecuencias de operar sin sistema">
            <div class="lp-agit__ticker" aria-hidden="true">
              <span class="lp-agit__ticker-item">Oportunidades perdidas</span>
              <span class="lp-agit__ticker-sep">·</span>
              <span class="lp-agit__ticker-item">Decisiones tardías</span>
              <span class="lp-agit__ticker-sep">·</span>
              <span class="lp-agit__ticker-item">Equipos agotados</span>
              <span class="lp-agit__ticker-sep">·</span>
              <span class="lp-agit__ticker-item">Contenido irrelevante</span>
              <span class="lp-agit__ticker-sep">·</span>
              <span class="lp-agit__ticker-item">Marca difusa</span>
              <span class="lp-agit__ticker-sep">·</span>
              <span class="lp-agit__ticker-item">Presupuesto desperdiciado</span>
              <span class="lp-agit__ticker-sep">·</span>
              <span class="lp-agit__ticker-item" aria-hidden="true">Oportunidades perdidas</span>
              <span class="lp-agit__ticker-sep" aria-hidden="true">·</span>
              <span class="lp-agit__ticker-item" aria-hidden="true">Decisiones tardías</span>
              <span class="lp-agit__ticker-sep" aria-hidden="true">·</span>
              <span class="lp-agit__ticker-item" aria-hidden="true">Equipos agotados</span>
              <span class="lp-agit__ticker-sep" aria-hidden="true">·</span>
              <span class="lp-agit__ticker-item" aria-hidden="true">Contenido irrelevante</span>
              <span class="lp-agit__ticker-sep" aria-hidden="true">·</span>
              <span class="lp-agit__ticker-item" aria-hidden="true">Marca difusa</span>
              <span class="lp-agit__ticker-sep" aria-hidden="true">·</span>
              <span class="lp-agit__ticker-item" aria-hidden="true">Presupuesto desperdiciado</span>
              <span class="lp-agit__ticker-sep" aria-hidden="true">·</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════ S05: LAS 3 CAPACIDADES ════════ -->
      <section class="lp-caps" id="landing-5" aria-labelledby="lp-caps-heading">
        <div class="lp-caps__inner">
          <header class="lp-caps__header">
            <p class="lp-caps__eyebrow sr-reveal">La solución</p>
            <h2 id="lp-caps-heading" class="lp-caps__title sr-reveal">Las tres capacidades que cambian cómo opera tu marca</h2>
            <p class="lp-caps__sub sr-reveal sr-reveal--d1">No son herramientas aisladas. Son un sistema integrado que aprende, decide y ejecuta.</p>
          </header>
          <div class="lp-caps__grid">
            <div class="lp-caps__card sr-reveal sr-reveal--d1">
              <div class="lp-caps__card-head">
                <span class="lp-caps__card-num" aria-hidden="true">01</span>
                <div class="lp-caps__card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="3" fill="currentColor"/>
                    <circle cx="11" cy="11" r="8.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-dasharray="4 2.5"/>
                  </svg>
                </div>
              </div>
              <h3 class="lp-caps__card-title">Señal e inteligencia</h3>
              <p class="lp-caps__card-desc">Monitoreo continuo de mercado, competencia y tendencias. Datos que se convierten en insights accionables antes de que sean evidentes.</p>
              <div class="lp-caps__ba">
                <div class="lp-caps__ba-item lp-caps__ba-item--before">
                  <span class="lp-caps__ba-tag">Antes</span>
                  <span class="lp-caps__ba-text">Intuición y suposiciones</span>
                </div>
                <span class="lp-caps__ba-arrow" aria-hidden="true">→</span>
                <div class="lp-caps__ba-item lp-caps__ba-item--after">
                  <span class="lp-caps__ba-tag">Con VERA</span>
                  <span class="lp-caps__ba-text">Señal en tiempo real</span>
                </div>
              </div>
            </div>
            <div class="lp-caps__card sr-reveal sr-reveal--d2">
              <div class="lp-caps__card-head">
                <span class="lp-caps__card-num" aria-hidden="true">02</span>
                <div class="lp-caps__card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <path d="M11 2L13.6 7.4L19.7 8.3L15.4 12.5L16.4 18.6L11 15.8L5.6 18.6L6.6 12.5L2.3 8.3L8.4 7.4L11 2Z" stroke="currentColor" stroke-width="1.4" fill="none"/>
                  </svg>
                </div>
              </div>
              <h3 class="lp-caps__card-title">Criterio y estrategia</h3>
              <p class="lp-caps__card-desc">Cruza datos, ADN de marca y contexto para decidir qué hacer, cuándo y cómo. Sin reuniones interminables ni hojas de cálculo.</p>
              <div class="lp-caps__ba">
                <div class="lp-caps__ba-item lp-caps__ba-item--before">
                  <span class="lp-caps__ba-tag">Antes</span>
                  <span class="lp-caps__ba-text">Decisiones lentas e imprecisas</span>
                </div>
                <span class="lp-caps__ba-arrow" aria-hidden="true">→</span>
                <div class="lp-caps__ba-item lp-caps__ba-item--after">
                  <span class="lp-caps__ba-tag">Con VERA</span>
                  <span class="lp-caps__ba-text">Criterio estructurado</span>
                </div>
              </div>
            </div>
            <div class="lp-caps__card sr-reveal sr-reveal--d3">
              <div class="lp-caps__card-head">
                <span class="lp-caps__card-num" aria-hidden="true">03</span>
                <div class="lp-caps__card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <rect x="2" y="7" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.4" fill="none"/>
                    <path d="M15 7V5.5a4 4 0 00-8 0V7" stroke="currentColor" stroke-width="1.4"/>
                  </svg>
                </div>
              </div>
              <h3 class="lp-caps__card-title">Ejecución y producción</h3>
              <p class="lp-caps__card-desc">Contenido listo para canales, alineado a estrategia y ADN. Imagen, video y copy a escala enterprise sin perder consistencia.</p>
              <div class="lp-caps__ba">
                <div class="lp-caps__ba-item lp-caps__ba-item--before">
                  <span class="lp-caps__ba-tag">Antes</span>
                  <span class="lp-caps__ba-text">Producción manual y lenta</span>
                </div>
                <span class="lp-caps__ba-arrow" aria-hidden="true">→</span>
                <div class="lp-caps__ba-item lp-caps__ba-item--after">
                  <span class="lp-caps__ba-tag">Con VERA</span>
                  <span class="lp-caps__ba-text">Escala sin fricción</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════ S06: VERA — EL MECANISMO ════════ -->
      <section class="lp-vera" id="landing-6" aria-labelledby="lp-vera-heading">
        <div class="lp-vera__inner">
          <div class="lp-vera__top">
            <div class="lp-vera__text-col">
              <p class="lp-vera__eyebrow sr-reveal">El motor</p>
              <h2 id="lp-vera-heading" class="lp-vera__title sr-reveal">VERA — La inteligencia que nunca para</h2>
              <p class="lp-vera__sub sr-reveal sr-reveal--d1">No responde a prompts. Opera con inteligencia, criterio y contexto de marca en tiempo real.</p>
              <p class="lp-vera__statement sr-reveal sr-reveal--d2">Cada señal del mercado se transforma en una decisión, cada decisión en acción y cada acción en aprendizaje.</p>
              <a href="/contacto" class="lp-vera__cta sr-reveal sr-reveal--d3">Ver VERA en acción ↗</a>
            </div>
            <div class="lp-vera__diagram-col" aria-hidden="true">
              <div class="lp-vera__diagram">
                <div class="lp-vera__core">
                  <img src="/recursos/vera/Vera-2.svg" alt="" class="lp-vera__core-logo" width="60" height="23" decoding="async" loading="lazy">
                </div>
                <div class="lp-vera__ring lp-vera__ring--1"></div>
                <div class="lp-vera__ring lp-vera__ring--2"></div>
                <div class="lp-vera__chip lp-vera__chip--1">Monitoreo</div>
                <div class="lp-vera__chip lp-vera__chip--2">Inteligencia</div>
                <div class="lp-vera__chip lp-vera__chip--3">ADN</div>
                <div class="lp-vera__chip lp-vera__chip--4">Estrategia</div>
                <div class="lp-vera__chip lp-vera__chip--5">Producción</div>
              </div>
            </div>
          </div>
          <div class="lp-vera__layers" role="list" aria-label="Las 6 capas de VERA">
            <div class="lp-vera__layer sr-reveal sr-reveal--d1" role="listitem">
              <span class="lp-vera__layer-num" aria-hidden="true">01</span>
              <div>
                <h3 class="lp-vera__layer-title">Monitoreo continuo</h3>
                <p class="lp-vera__layer-desc">Scraping en tiempo real de redes, reviews y competencia.</p>
              </div>
            </div>
            <div class="lp-vera__layer sr-reveal sr-reveal--d2" role="listitem">
              <span class="lp-vera__layer-num" aria-hidden="true">02</span>
              <div>
                <h3 class="lp-vera__layer-title">Inteligencia de mercado</h3>
                <p class="lp-vera__layer-desc">Insights de audiencia y tendencias convertidos en decisiones.</p>
              </div>
            </div>
            <div class="lp-vera__layer sr-reveal sr-reveal--d3" role="listitem">
              <span class="lp-vera__layer-num" aria-hidden="true">03</span>
              <div>
                <h3 class="lp-vera__layer-title">ADN de marca</h3>
                <p class="lp-vera__layer-desc">Identidad, tono y posicionamiento estructurados para operar.</p>
              </div>
            </div>
            <div class="lp-vera__layer sr-reveal sr-reveal--d4" role="listitem">
              <span class="lp-vera__layer-num" aria-hidden="true">04</span>
              <div>
                <h3 class="lp-vera__layer-title">Estrategia táctica</h3>
                <p class="lp-vera__layer-desc">Planes, calendarios y narrativas alineadas al objetivo.</p>
              </div>
            </div>
            <div class="lp-vera__layer sr-reveal sr-reveal--d5" role="listitem">
              <span class="lp-vera__layer-num" aria-hidden="true">05</span>
              <div>
                <h3 class="lp-vera__layer-title">Producción a escala</h3>
                <p class="lp-vera__layer-desc">Imagen, video y copy producidos sin perder consistencia.</p>
              </div>
            </div>
            <div class="lp-vera__layer sr-reveal" role="listitem" style="transition-delay:0.55s">
              <span class="lp-vera__layer-num" aria-hidden="true">06</span>
              <div>
                <h3 class="lp-vera__layer-title">Aprendizaje continuo</h3>
                <p class="lp-vera__layer-desc">Cada acción informa la siguiente. Ventaja acumulada.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════ S07: LIVING DASHBOARD ════════ -->
      <section class="lp-dash" id="landing-7" aria-labelledby="lp-dash-heading">
        <div class="lp-dash__inner">
          <header class="lp-dash__header">
            <p class="lp-dash__eyebrow sr-reveal">El sistema en acción</p>
            <h2 id="lp-dash-heading" class="lp-dash__title sr-reveal">Un dashboard que piensa mientras tu equipo ejecuta</h2>
            <p class="lp-dash__sub sr-reveal sr-reveal--d1">Señales, decisiones y contenido en tiempo real. Todo en un solo lugar.</p>
          </header>
          <div class="lp-dash__screen-wrap" aria-label="Vista previa del dashboard de AISmartContent">
            <div class="lp-dash__screen">
              <div class="lp-dash__chrome" aria-hidden="true">
                <span class="lp-dash__dot"></span>
                <span class="lp-dash__dot"></span>
                <span class="lp-dash__dot"></span>
                <span class="lp-dash__url">app.aismartcontent.com / dashboard</span>
              </div>
              <div class="lp-dash__body">
                <aside class="lp-dash__sidebar">
                  <div class="lp-dash__nav-item lp-dash__nav-item--active"></div>
                  <div class="lp-dash__nav-item"></div>
                  <div class="lp-dash__nav-item"></div>
                  <div class="lp-dash__nav-item"></div>
                  <div class="lp-dash__nav-item"></div>
                </aside>
                <main class="lp-dash__main">
                  <div class="lp-dash__topbar">
                    <div class="lp-dash__topbar-left">
                      <div class="lp-dash__mock-line lp-dash__mock-line--h"></div>
                      <div class="lp-dash__mock-line lp-dash__mock-line--s"></div>
                    </div>
                    <div class="lp-dash__live-badge">● Live</div>
                  </div>
                  <div class="lp-dash__metrics-row">
                    <div class="lp-dash__metric-tile">
                      <div class="lp-dash__metric-val">3×</div>
                      <div class="lp-dash__metric-lbl">Velocidad producción</div>
                      <div class="lp-dash__bar-wrap"><div class="lp-dash__bar" style="width:72%"></div></div>
                    </div>
                    <div class="lp-dash__metric-tile">
                      <div class="lp-dash__metric-val">68%</div>
                      <div class="lp-dash__metric-lbl">Reducción decisión</div>
                      <div class="lp-dash__bar-wrap"><div class="lp-dash__bar" style="width:68%"></div></div>
                    </div>
                    <div class="lp-dash__metric-tile">
                      <div class="lp-dash__metric-val">+50</div>
                      <div class="lp-dash__metric-lbl">Organizaciones</div>
                      <div class="lp-dash__bar-wrap"><div class="lp-dash__bar" style="width:85%"></div></div>
                    </div>
                  </div>
                  <div class="lp-dash__cards-row">
                    <div class="lp-dash__mini-card">
                      <div class="lp-dash__mini-icon"></div>
                      <div class="lp-dash__mock-line"></div>
                      <div class="lp-dash__mock-line lp-dash__mock-line--s"></div>
                    </div>
                    <div class="lp-dash__mini-card">
                      <div class="lp-dash__mini-icon"></div>
                      <div class="lp-dash__mock-line"></div>
                      <div class="lp-dash__mock-line lp-dash__mock-line--s"></div>
                    </div>
                    <div class="lp-dash__mini-card">
                      <div class="lp-dash__mini-icon"></div>
                      <div class="lp-dash__mock-line"></div>
                      <div class="lp-dash__mock-line lp-dash__mock-line--s"></div>
                    </div>
                    <div class="lp-dash__mini-card">
                      <div class="lp-dash__mini-icon"></div>
                      <div class="lp-dash__mock-line"></div>
                      <div class="lp-dash__mock-line lp-dash__mock-line--s"></div>
                    </div>
                  </div>
                </main>
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

      <!-- ════════ S08: LO QUE PASA CUANDO… (conservado) ════════ -->
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

      <!-- ════════ S09: PRUEBA SOCIAL + MÉTRICAS ════════ -->
      <section class="lp-social" id="landing-9" aria-labelledby="lp-social-heading">
        <div class="lp-social__inner">
          <p class="lp-social__eyebrow sr-reveal">Resultados reales</p>
          <h2 id="lp-social-heading" class="lp-social__title sr-reveal">Marcas que ya operan con inteligencia</h2>
          <div class="lp-social__metrics">
            <div class="lp-social__metric sr-reveal sr-reveal--d1" data-count="3" data-suffix="×">
              <div class="lp-social__metric-val"><span class="lp-social__count">3</span><span>×</span></div>
              <p class="lp-social__metric-lbl">Más rápido en producción de contenido</p>
            </div>
            <div class="lp-social__metric sr-reveal sr-reveal--d2" data-count="68" data-suffix="%">
              <div class="lp-social__metric-val"><span class="lp-social__count">68</span><span>%</span></div>
              <p class="lp-social__metric-lbl">Reducción en tiempo de decisión estratégica</p>
            </div>
            <div class="lp-social__metric sr-reveal sr-reveal--d3" data-count="50" data-suffix="+">
              <div class="lp-social__metric-val"><span>+</span><span class="lp-social__count">50</span></div>
              <p class="lp-social__metric-lbl">Organizaciones en América Latina</p>
            </div>
            <div class="lp-social__metric sr-reveal sr-reveal--d4">
              <div class="lp-social__metric-val">24<span class="lp-social__sep">/</span>7</div>
              <p class="lp-social__metric-lbl">El sistema opera sin parar</p>
            </div>
          </div>
          <div class="lp-social__quotes">
            <blockquote class="lp-social__quote sr-reveal sr-reveal--d1">
              <p>"Pasamos de publicar por intuición a operar con sistema. La diferencia es brutal."</p>
              <footer>
                <cite class="lp-social__cite">
                  <span class="lp-social__cite-name">Directora de Marketing</span>
                  <span class="lp-social__cite-co">Empresa retail, LATAM</span>
                </cite>
              </footer>
            </blockquote>
            <blockquote class="lp-social__quote sr-reveal sr-reveal--d2">
              <p>"VERA detectó una tendencia tres días antes de que la viera nuestra competencia. Actuamos primero."</p>
              <footer>
                <cite class="lp-social__cite">
                  <span class="lp-social__cite-name">CEO</span>
                  <span class="lp-social__cite-co">Startup B2B SaaS</span>
                </cite>
              </footer>
            </blockquote>
          </div>
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
    this.initHeroReveal();
    this.initPainRoadmap();
    this.initMetricsCounter();
    this.initFaqAccordion();
    this.initCtaForm();
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
    if (typeof this.metricsCleanup === 'function') {
      this.metricsCleanup();
      this.metricsCleanup = null;
    }
    if (typeof this.faqCleanup === 'function') {
      this.faqCleanup();
      this.faqCleanup = null;
    }
    if (typeof this.ctaFormCleanup === 'function') {
      this.ctaFormCleanup();
      this.ctaFormCleanup = null;
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

    // Trigger after layout paint so transition takes effect
    requestAnimationFrame(() => requestAnimationFrame(() => {
      hero.classList.add('is-ready');
    }));

    this.heroRevealCleanup = () => {
      hero.classList.remove('is-ready');
      reveals.forEach(el => { el.style.transitionDelay = ''; });
    };
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

  initMetricsCounter() {
    if (typeof this.metricsCleanup === 'function') {
      this.metricsCleanup();
      this.metricsCleanup = null;
    }

    const metrics = this.container.querySelectorAll('.lp-social__metric[data-count]');
    if (!metrics.length) return;

    const animate = (el) => {
      const target = parseInt(el.dataset.count, 10);
      if (isNaN(target)) return;
      const countEl = el.querySelector('.lp-social__count');
      if (!countEl) return;

      const duration = 1400;
      const start = performance.now();
      const tick = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        countEl.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animate(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    metrics.forEach(m => obs.observe(m));

    this.metricsCleanup = () => obs.disconnect();
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
