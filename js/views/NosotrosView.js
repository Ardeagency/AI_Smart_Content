/**
 * NosotrosView - Sobre Arde y el equipo.
 * Página pública — HTML inline siguiendo el patrón SPA.
 */
class NosotrosView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/nosotros';
    this.pageClass = 'public-page--nosotros';
  }

  renderContent() {
    return `
      <section class="pp-hero">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Nosotros</span>
          <h1 class="pp-hero__title sr-reveal">Arde construye la infraestructura de contenido que las marcas serias necesitan, no otro juguete de IA suelto.</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Somos el estudio que une estrategia de marca, ingeniería y operación: AI S-MART CONTENT es nuestra respuesta cuando el volumen y la complejidad superan al equipo y al spreadsheet.</p>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-story">
        <div class="pp-section__inner">
          <h2 id="pp-story" class="pp-section__title sr-reveal">La historia</h2>
          <p class="pp-section__text sr-reveal sr-reveal--d1">Las marcas enterprise no fallan por falta de ideas: fallan por latencia entre lo que el mercado hace hoy y lo que el contenido refleja mañana. Los equipos quedan atrapados entre herramientas inconexas y revisiones manuales interminables.</p>
          <p class="pp-section__text sr-reveal sr-reveal--d2">Por eso diseñamos AI S-MART CONTENT como servicio gestionado: una sola capa donde marca, datos, producción y agentes comparten el mismo modelo, con aislamiento estricto por organización.</p>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-team">
        <div class="pp-section__inner">
          <h2 id="pp-team" class="pp-section__title sr-reveal">El equipo</h2>
          <div class="pp-grid pp-grid--3">
            <article class="pp-team-card sr-reveal">
              <div class="pp-team-card__avatar" aria-hidden="true"><i class="ph ph-compass"></i></div>
              <h3 class="pp-team-card__name">Dirección de producto y marca</h3>
              <p class="pp-team-card__role">Define la promesa de AI S-MART CONTENT, el acompañamiento a clientes y el criterio de qué entra al roadmap.</p>
            </article>
            <article class="pp-team-card sr-reveal sr-reveal--d1">
              <div class="pp-team-card__avatar" aria-hidden="true"><i class="ph ph-code"></i></div>
              <h3 class="pp-team-card__name">Ingeniería y datos</h3>
              <p class="pp-team-card__role">Arquitectura, seguridad, integraciones y operación continua de la plataforma y de los agentes.</p>
            </article>
            <article class="pp-team-card sr-reveal sr-reveal--d2">
              <div class="pp-team-card__avatar" aria-hidden="true"><i class="ph ph-handshake"></i></div>
              <h3 class="pp-team-card__name">Operaciones y éxito cliente</h3>
              <p class="pp-team-card__role">Onboarding, configuración de organizaciones, calibración de flujos y soporte cuando la marca acelera.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-promise">
        <div class="pp-section__inner">
          <h2 id="pp-promise" class="pp-section__title sr-reveal">La promesa de servicio</h2>
          <p class="pp-section__text sr-reveal sr-reveal--d1">Trabajamos en ventanas de respuesta acordadas por contrato, con prioridad a incidentes que afectan publicación o datos. Preferimos relaciones de varios ciclos: la plataforma mejora cuando conocemos tu operación a fondo.</p>
        </div>
      </section>

      <section class="pp-cta">
        <div class="pp-cta__inner sr-reveal">
          <h2 class="pp-cta__title">Hablemos directamente</h2>
          <a href="/contacto" class="pp-btn pp-btn--primary">Contacto directo</a>
        </div>
      </section>
    `;
  }
}

window.NosotrosView = NosotrosView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NosotrosView;
}
