/**
 * CasosView - Casos de uso y resultados.
 * Página pública — HTML inline siguiendo el patrón SPA.
 */
class CasosView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/casos';
    this.pageClass = 'public-page--casos';
  }

  renderContent() {
    return `
      <section class="pp-hero">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Casos</span>
          <h1 class="pp-hero__title sr-reveal">[COPY: Headline de impacto con resultado cuantificable]</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">[COPY: subtítulo — prueba concreta del valor entregado]</p>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-cases">
        <div class="pp-section__inner">
          <h2 id="pp-cases" class="pp-section__title sr-reveal">Casos de uso</h2>

          <article class="pp-case sr-reveal">
            <div class="pp-case__meta">
              <span class="pp-case__tag">[CASO PENDIENTE 01]</span>
              <span class="pp-case__industry">Industria · CPG</span>
            </div>
            <h3 class="pp-case__title">[COPY: Reto principal antes de la plataforma]</h3>
            <p class="pp-case__text">[COPY: Descripción del contexto — tamaño de la marca, complejidad del problema.]</p>
            <div class="pp-case__grid">
              <div><p class="pp-case__label">Módulos implementados</p><p>Producción · Marca · VERA</p></div>
              <div><p class="pp-case__label">Duración del piloto</p><p>[COPY: semanas]</p></div>
              <div><p class="pp-case__label">Resultado</p><p>[COPY: número medible]</p></div>
            </div>
          </article>

          <article class="pp-case sr-reveal sr-reveal--d1">
            <div class="pp-case__meta">
              <span class="pp-case__tag">[CASO PENDIENTE 02]</span>
              <span class="pp-case__industry">Industria · Retail multi-mercado</span>
            </div>
            <h3 class="pp-case__title">[COPY: Reto principal antes de la plataforma]</h3>
            <p class="pp-case__text">[COPY: Descripción del contexto.]</p>
            <div class="pp-case__grid">
              <div><p class="pp-case__label">Módulos implementados</p><p>Inteligencia · Marca · Producción</p></div>
              <div><p class="pp-case__label">Duración del piloto</p><p>[COPY: semanas]</p></div>
              <div><p class="pp-case__label">Resultado</p><p>[COPY: número medible]</p></div>
            </div>
          </article>

        </div>
      </section>

      <section class="pp-section pp-metrics" aria-labelledby="pp-metrics">
        <div class="pp-section__inner">
          <h2 id="pp-metrics" class="pp-section__title sr-reveal">Métricas agregadas</h2>
          <div class="pp-metrics__grid">
            <div class="pp-metric sr-reveal sr-reveal--d1">
              <span class="pp-metric__num">[DATO]</span>
              <p class="pp-metric__label">Piezas producidas al mes</p>
            </div>
            <div class="pp-metric sr-reveal sr-reveal--d2">
              <span class="pp-metric__num">[DATO]</span>
              <p class="pp-metric__label">Aceleración de producción</p>
            </div>
            <div class="pp-metric sr-reveal sr-reveal--d3">
              <span class="pp-metric__num">[DATO]</span>
              <p class="pp-metric__label">Consistencia de marca</p>
            </div>
          </div>
        </div>
      </section>

      <section class="pp-cta">
        <div class="pp-cta__inner sr-reveal">
          <h2 class="pp-cta__title">¿Quieres que tu caso sea el siguiente?</h2>
          <a href="/contacto" class="pp-btn pp-btn--primary">Solicitar acceso</a>
        </div>
      </section>
    `;
  }
}

window.CasosView = CasosView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CasosView;
}
