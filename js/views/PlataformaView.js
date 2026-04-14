/**
 * PlataformaView - Descripción técnica de la plataforma AI S-MART CONTENT.
 * Página pública — HTML inline siguiendo el patrón SPA del proyecto.
 */
class PlataformaView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/plataforma';
    this.pageClass = 'public-page--plataforma';
  }

  renderContent() {
    return `
      <section class="pp-hero">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Plataforma</span>
          <h1 class="pp-hero__title sr-reveal">Sistema operativo de contenido para marcas que ya no pueden depender del copy-paste entre herramientas sueltas.</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">AI S-MART CONTENT unifica marca, inteligencia de mercado, producción y agentes en una sola capa: el marketing define el qué; la plataforma gobierna el cómo y el cuándo con trazabilidad y control de acceso por organización.</p>
        </div>
      </section>

      <section class="pp-section pp-module" aria-labelledby="pp-mod-production">
        <div class="pp-section__inner pp-module__grid">
          <div class="pp-module__copy sr-reveal">
            <span class="pp-module__label">Módulo 01</span>
            <h2 id="pp-mod-production" class="pp-section__title">Producción de contenido</h2>
            <p class="pp-section__text">Flujos de contenido gobernados por reglas de marca: desde brief hasta pieza lista para publicar, con revisión humana donde la política de la organización lo exige.</p>
            <ul class="pp-list">
              <li>Outputs: imagen, video, copy, hashtags</li>
              <li>Ejecución manual, autopilot y programada</li>
              <li>Revisión y aprobación integradas al flujo</li>
            </ul>
          </div>
          <div class="pp-module__media sr-reveal sr-reveal--d1" aria-hidden="true">
            <div class="pp-placeholder">Captura de producto del módulo de flujos — próximamente</div>
          </div>
        </div>
      </section>

      <section class="pp-section pp-module pp-module--reverse" aria-labelledby="pp-mod-brand">
        <div class="pp-section__inner pp-module__grid">
          <div class="pp-module__media sr-reveal" aria-hidden="true">
            <div class="pp-placeholder">Captura de producto del sistema de marca — próximamente</div>
          </div>
          <div class="pp-module__copy sr-reveal sr-reveal--d1">
            <span class="pp-module__label">Módulo 02</span>
            <h2 id="pp-mod-brand" class="pp-section__title">Sistema de marca</h2>
            <p class="pp-section__text">Tono, pilares narrativos y lineamientos visuales viven en el mismo modelo de datos que alimenta la producción: cada salida hereda el ADN aprobado por la marca.</p>
            <ul class="pp-list">
              <li>Audiencias, entidades (productos, servicios, lugares), campañas</li>
              <li>Tono, lineamientos visuales y pilares narrativos por marca</li>
              <li>Consistencia garantizada en cada pieza generada</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="pp-section pp-module" aria-labelledby="pp-mod-intel">
        <div class="pp-section__inner pp-module__grid">
          <div class="pp-module__copy sr-reveal">
            <span class="pp-module__label">Módulo 03</span>
            <h2 id="pp-mod-intel" class="pp-section__title">Inteligencia competitiva</h2>
            <p class="pp-section__text">Señales de competencia, tendencias y desempeño de tu propio contenido en un solo tablero, para que el equipo tome decisiones con contexto, no con capturas sueltas.</p>
            <ul class="pp-list">
              <li>Redes sociales, marketplaces y web</li>
              <li>Captura de anuncios competidores y tendencias</li>
              <li>Análisis de tono, coherencia y pilares narrativos propios</li>
            </ul>
          </div>
          <div class="pp-module__media sr-reveal sr-reveal--d1" aria-hidden="true">
            <div class="pp-placeholder">Captura de producto del tablero de inteligencia — próximamente</div>
          </div>
        </div>
      </section>

      <section class="pp-section pp-module pp-module--reverse" aria-labelledby="pp-mod-vera">
        <div class="pp-section__inner pp-module__grid">
          <div class="pp-module__media sr-reveal" aria-hidden="true">
            <div class="pp-placeholder">Captura de producto de agentes VERA — próximamente</div>
          </div>
          <div class="pp-module__copy sr-reveal sr-reveal--d1">
            <span class="pp-module__label">Módulo 04</span>
            <h2 id="pp-mod-vera" class="pp-section__title">Agentes VERA</h2>
            <p class="pp-section__text">Agentes VERA ejecutan misiones de análisis, producción y monitoreo en segundo plano, con visibilidad de estado para quien opera la marca.</p>
            <ul class="pp-list">
              <li>Misiones: producción, análisis, monitoreo, reporte</li>
              <li>Orquestación continua sin intervención manual</li>
              <li>Estado en tiempo real de agentes activos</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="pp-section pp-integrations" aria-labelledby="pp-integrations">
        <div class="pp-section__inner">
          <h2 id="pp-integrations" class="pp-section__title sr-reveal">Integraciones</h2>
          <p class="pp-section__text sr-reveal sr-reveal--d1">Conectamos canales y fuentes de datos según el contrato de cada organización (Meta, Google, marketplaces y más), siempre con credenciales cifradas y alcance acotado por marca.</p>
          <div class="pp-integrations__grid sr-reveal sr-reveal--d2" aria-hidden="true">
            <div class="pp-integration-chip">Meta</div>
            <div class="pp-integration-chip">Google</div>
            <div class="pp-integration-chip">TikTok</div>
            <div class="pp-integration-chip">LinkedIn</div>
            <div class="pp-integration-chip">Amazon</div>
            <div class="pp-integration-chip">Shopify</div>
            <div class="pp-integration-chip">Mercado Libre</div>
            <div class="pp-integration-chip">YouTube</div>
          </div>
        </div>
      </section>

      <section class="pp-cta">
        <div class="pp-cta__inner sr-reveal">
          <h2 class="pp-cta__title">¿Tiene sentido para tu stack y tu gobierno de marca? Hablemos de alcance y piloto.</h2>
          <a href="/contacto" class="pp-btn pp-btn--primary">Solicitar acceso</a>
        </div>
      </section>
    `;
  }
}

window.PlataformaView = PlataformaView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlataformaView;
}
