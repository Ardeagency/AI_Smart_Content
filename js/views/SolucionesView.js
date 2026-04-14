/**
 * SolucionesView - Segmentación por perfil de empresa.
 * Página pública — HTML inline siguiendo el patrón SPA.
 */
class SolucionesView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/soluciones';
    this.pageClass = 'public-page--soluciones';
  }

  renderContent() {
    return `
      <section class="pp-hero">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Soluciones</span>
          <h1 class="pp-hero__title sr-reveal">Diseñado para marcas que producen contenido a escala</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">[COPY: Subtítulo — a quién le sirve y cómo filtra prospectos no ideales].</p>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-profiles">
        <div class="pp-section__inner">
          <h2 id="pp-profiles" class="pp-section__title sr-reveal">Perfiles de empresa</h2>
          <div class="pp-grid pp-grid--2">

            <article class="pp-card sr-reveal">
              <span class="pp-card__icon"><i class="ph ph-cube"></i></span>
              <h3 class="pp-card__title">Marcas CPG con múltiples líneas</h3>
              <p class="pp-card__meta">Problema</p>
              <p class="pp-card__text">Mantener consistencia de marca en decenas de SKUs y líneas de producto.</p>
              <p class="pp-card__meta">Cómo ayuda</p>
              <p class="pp-card__text">Sistema de entidades por producto + flujos por campaña, coherentes con el ADN de marca.</p>
            </article>

            <article class="pp-card sr-reveal sr-reveal--d1">
              <span class="pp-card__icon"><i class="ph ph-globe"></i></span>
              <h3 class="pp-card__title">Empresas multi-mercado</h3>
              <p class="pp-card__meta">Problema</p>
              <p class="pp-card__text">Adaptar contenido a diferentes audiencias, idiomas y países sin perder coherencia.</p>
              <p class="pp-card__meta">Cómo ayuda</p>
              <p class="pp-card__text">business_units por país + idiomas_contenido + mercado_objetivo operando como un solo sistema.</p>
            </article>

            <article class="pp-card sr-reveal sr-reveal--d2">
              <span class="pp-card__icon"><i class="ph ph-users-three"></i></span>
              <h3 class="pp-card__title">Equipos pequeños con alta demanda</h3>
              <p class="pp-card__meta">Problema</p>
              <p class="pp-card__text">Escalar producción sin escalar equipo ni comprometer calidad.</p>
              <p class="pp-card__meta">Cómo ayuda</p>
              <p class="pp-card__text">Agentes VERA + flujos automatizados + producción en autopilot.</p>
            </article>

            <article class="pp-card sr-reveal sr-reveal--d3">
              <span class="pp-card__icon"><i class="ph ph-eye"></i></span>
              <h3 class="pp-card__title">Marcas que necesitan inteligencia</h3>
              <p class="pp-card__meta">Problema</p>
              <p class="pp-card__text">No tener visibilidad del mercado ni de la competencia en tiempo real.</p>
              <p class="pp-card__meta">Cómo ayuda</p>
              <p class="pp-card__text">intelligence_entities + monitoring_triggers + brand_vulnerabilities operando continuo.</p>
            </article>

          </div>
        </div>
      </section>

      <section class="pp-section pp-not" aria-labelledby="pp-not">
        <div class="pp-section__inner">
          <h2 id="pp-not" class="pp-section__title sr-reveal">Lo que NO somos</h2>
          <div class="pp-not__grid">
            <div class="pp-not__item sr-reveal sr-reveal--d1">
              <span class="pp-not__x">—</span>
              <p>No somos una agencia creativa tradicional.</p>
            </div>
            <div class="pp-not__item sr-reveal sr-reveal--d2">
              <span class="pp-not__x">—</span>
              <p>No somos un SaaS de autoservicio.</p>
            </div>
            <div class="pp-not__item sr-reveal sr-reveal--d3">
              <span class="pp-not__x">—</span>
              <p>No somos una herramienta de AI genérica.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="pp-cta">
        <div class="pp-cta__inner sr-reveal">
          <h2 class="pp-cta__title">[COPY: CTA final enfocado a prospectos calificados]</h2>
          <a href="/contacto" class="pp-btn pp-btn--primary">Solicitar acceso</a>
        </div>
      </section>
    `;
  }
}

window.SolucionesView = SolucionesView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SolucionesView;
}
