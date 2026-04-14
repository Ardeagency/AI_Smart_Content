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
          <h1 class="pp-hero__title sr-reveal">De la dispersión de herramientas a un solo sistema que habla el idioma de la marca.</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Ejemplos ilustrativos de arquetipos que ya resuelve la plataforma; los números concretos de cada cliente se trabajan bajo acuerdo de confidencialidad.</p>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-cases">
        <div class="pp-section__inner">
          <h2 id="pp-cases" class="pp-section__title sr-reveal">Casos de uso</h2>

          <article class="pp-case sr-reveal">
            <div class="pp-case__meta">
              <span class="pp-case__tag">Arquetipo · CPG multi-SKU</span>
              <span class="pp-case__industry">Industria · CPG</span>
            </div>
            <h3 class="pp-case__title">Muchas líneas de producto, un solo criterio de marca</h3>
            <p class="pp-case__text">Portafolios con decenas de referencias necesitaban activaciones rápidas sin que cada campaña reescribiera desde cero tono, claims y formato visual.</p>
            <div class="pp-case__grid">
              <div><p class="pp-case__label">Módulos implementados</p><p>Producción · Marca · VERA</p></div>
              <div><p class="pp-case__label">Duración típica de piloto</p><p>4 a 8 semanas</p></div>
              <div><p class="pp-case__label">Resultado</p><p>Catálogo de piezas alineadas al ADN y menos ida y vuelta en revisión</p></div>
            </div>
          </article>

          <article class="pp-case sr-reveal sr-reveal--d1">
            <div class="pp-case__meta">
              <span class="pp-case__tag">Arquetipo · Retail multi-mercado</span>
              <span class="pp-case__industry">Industria · Retail multi-mercado</span>
            </div>
            <h3 class="pp-case__title">Misma marca, distintos países, misma voz</h3>
            <p class="pp-case__text">Equipos distribuidos requerían inteligencia de competencia y producción coherente sin duplicar briefs ni perder contexto entre agencias locales.</p>
            <div class="pp-case__grid">
              <div><p class="pp-case__label">Módulos implementados</p><p>Inteligencia · Marca · Producción</p></div>
              <div><p class="pp-case__label">Duración típica de piloto</p><p>6 a 10 semanas</p></div>
              <div><p class="pp-case__label">Resultado</p><p>Un solo sistema de verdad para mercados y canales</p></div>
            </div>
          </article>

        </div>
      </section>

      <section class="pp-section pp-metrics" aria-labelledby="pp-metrics">
        <div class="pp-section__inner">
          <h2 id="pp-metrics" class="pp-section__title sr-reveal">Indicadores que afinamos con cada organización</h2>
          <p class="pp-section__text sr-reveal">No publicamos cifras agregadas genéricas: los KPIs dependen de tu mix de canales, SLAs y definición de “pieza aprobada”. En propuesta comercial acordamos tablero y metas.</p>
          <div class="pp-metrics__grid">
            <div class="pp-metric sr-reveal sr-reveal--d1">
              <span class="pp-metric__num">—</span>
              <p class="pp-metric__label">Volumen mensual de piezas aprobadas</p>
            </div>
            <div class="pp-metric sr-reveal sr-reveal--d2">
              <span class="pp-metric__num">—</span>
              <p class="pp-metric__label">Tiempo de ciclo revisión → publicación</p>
            </div>
            <div class="pp-metric sr-reveal sr-reveal--d3">
              <span class="pp-metric__num">—</span>
              <p class="pp-metric__label">Coherencia editorial (criterios por marca)</p>
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
