/**
 * ChangelogView - Registro público de actualizaciones.
 * Página pública — HTML inline siguiendo el patrón SPA.
 */
class ChangelogView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/changelog';
    this.pageClass = 'public-page--changelog';
  }

  renderContent() {
    return `
      <section class="pp-hero pp-hero--compact">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Changelog</span>
          <h1 class="pp-hero__title sr-reveal">Lo que hemos lanzado</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Actualizaciones, mejoras y correcciones de AI S-MART CONTENT.</p>
        </div>
      </section>

      <section class="pp-section">
        <div class="pp-section__inner pp-changelog">

          <article class="pp-changelog__entry sr-reveal">
            <header class="pp-changelog__head">
              <span class="pp-changelog__date">Abril 2026</span>
              <span class="pp-changelog__version">Agentes y orquestación</span>
              <span class="pp-tag pp-tag--new">Nuevo</span>
            </header>
            <p class="pp-changelog__desc">Ajustes en el ciclo de vida de misiones de agentes, mejor visibilidad de estado en la interfaz y refinamiento de prompts por defecto para tareas de análisis recurrentes.</p>
          </article>

          <article class="pp-changelog__entry sr-reveal sr-reveal--d1">
            <header class="pp-changelog__head">
              <span class="pp-changelog__date">Marzo 2026</span>
              <span class="pp-changelog__version">Inteligencia y monitoreo</span>
              <span class="pp-tag pp-tag--improve">Mejora</span>
            </header>
            <p class="pp-changelog__desc">Mejoras en captura de señales de competencia y en la presentación de resultados de monitoreo para reducir ruido en el tablero operativo.</p>
          </article>

        </div>
      </section>

      <section class="pp-section pp-subscribe">
        <div class="pp-section__inner sr-reveal">
          <h2 class="pp-section__title">Recibe actualizaciones</h2>
          <form class="pp-subscribe__form" id="changelogSubscribe" novalidate>
            <input type="email" class="pp-field__input" name="email" placeholder="tu@empresa.com" required aria-label="Email para suscribirse">
            <button type="submit" class="pp-btn pp-btn--primary">Suscribir</button>
          </form>
          <p class="pp-form__note">La suscripción por correo está en activación; si necesitas novedades críticas, escríbenos a <a href="mailto:contact@aismartcontent.io" class="pp-link">contact@aismartcontent.io</a>.</p>
        </div>
      </section>
    `;
  }

  async init() {
    await super.init();
    const form = this.container.querySelector('#changelogSubscribe');
    if (!form) return;
    this.addEventListener(form, 'submit', (e) => {
      e.preventDefault();
      form.reset();
    });
  }
}

window.ChangelogView = ChangelogView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChangelogView;
}
