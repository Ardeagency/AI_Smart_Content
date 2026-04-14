/**
 * SeguridadView - Arquitectura de seguridad y privacidad de datos.
 * Página pública — HTML inline siguiendo el patrón SPA.
 */
class SeguridadView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/seguridad';
    this.pageClass = 'public-page--seguridad';
  }

  renderContent() {
    return `
      <section class="pp-hero">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Seguridad</span>
          <h1 class="pp-hero__title sr-reveal">Tus datos de marca se tratan como activo crítico, no como fila en una base anónima.</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Aislamiento por organización en base de datos, cifrado en tránsito y en reposo, tokens de integración protegidos y altas de usuario solo por invitación revisada por Arde.</p>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-isolation">
        <div class="pp-section__inner">
          <h2 id="pp-isolation" class="pp-section__title sr-reveal">Aislamiento de datos por organización</h2>
          <div class="pp-grid pp-grid--3">
            <article class="pp-card pp-card--soft sr-reveal">
              <h3 class="pp-card__title">Organizaciones aisladas</h3>
              <p class="pp-card__text">Cada marca opera en su propia organización. Los datos nunca cruzan fronteras.</p>
            </article>
            <article class="pp-card pp-card--soft sr-reveal sr-reveal--d1">
              <h3 class="pp-card__title">Row Level Security</h3>
              <p class="pp-card__text">RLS en PostgreSQL restringe acceso por usuario y organización a nivel de base de datos.</p>
            </article>
            <article class="pp-card pp-card--soft sr-reveal sr-reveal--d2">
              <h3 class="pp-card__title">Acceso por invitación</h3>
              <p class="pp-card__text">No existe registro público. Cada usuario es afiliado manualmente por Arde a una única organización.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-architecture">
        <div class="pp-section__inner">
          <h2 id="pp-architecture" class="pp-section__title sr-reveal">Arquitectura de datos</h2>
          <ul class="pp-spec-list sr-reveal sr-reveal--d1">
            <li><strong>Infraestructura:</strong> Supabase (PostgreSQL con RLS) + Hetzner (servidores de agentes).</li>
            <li><strong>Encriptación en tránsito:</strong> TLS end-to-end.</li>
            <li><strong>Encriptación en reposo:</strong> aplicada sobre volúmenes y bases de datos.</li>
            <li><strong>Tokens de integración:</strong> encriptados vía <code>brand_integrations.encryption_iv</code>.</li>
            <li><strong>Backups:</strong> copias automáticas gestionadas por el proveedor de base de datos con retención acorde al plan contratado; detalle de ventanas y región disponible para clientes en documentación contractual.</li>
          </ul>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-access">
        <div class="pp-section__inner">
          <h2 id="pp-access" class="pp-section__title sr-reveal">Control de acceso</h2>
          <div class="pp-grid pp-grid--2">
            <article class="pp-card sr-reveal">
              <h3 class="pp-card__title">Roles gestionados por Arde</h3>
              <p class="pp-card__text">Ni el cliente ni terceros pueden autogestionar accesos. organization_members con roles definidos, asignados y revocados por el equipo técnico de Arde.</p>
            </article>
            <article class="pp-card sr-reveal sr-reveal--d1">
              <h3 class="pp-card__title">Sin acceso cruzado</h3>
              <p class="pp-card__text">Un usuario solo accede a la organización a la que fue afiliado. No existe visibilidad entre organizaciones.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-subprocessors">
        <div class="pp-section__inner">
          <h2 id="pp-subprocessors" class="pp-section__title sr-reveal">Subprocesadores</h2>
          <div class="pp-table sr-reveal sr-reveal--d1">
            <div class="pp-table__row pp-table__row--head">
              <span>Proveedor</span><span>Propósito</span><span>Región</span>
            </div>
            <div class="pp-table__row">
              <span>Anthropic</span><span>Modelos de IA (Claude)</span><span>US</span>
            </div>
            <div class="pp-table__row">
              <span>Supabase</span><span>Base de datos y autenticación</span><span>Según proyecto (UE / US)</span>
            </div>
            <div class="pp-table__row">
              <span>Hetzner</span><span>Infraestructura de servidores de agentes</span><span>EU</span>
            </div>
            <div class="pp-table__row">
              <span>OpenAI</span><span>Modelos de IA (texto e imagen según flujo)</span><span>US</span>
            </div>
            <div class="pp-table__row">
              <span>Otros</span><span>Proveedores adicionales según integraciones activas de tu organización (redes, analítica, email)</span><span>Variable</span>
            </div>
          </div>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-incidents">
        <div class="pp-section__inner">
          <h2 id="pp-incidents" class="pp-section__title sr-reveal">Política de incidentes</h2>
          <p class="pp-section__text sr-reveal sr-reveal--d1">Ante incidentes que impacten confidencialidad, integridad o disponibilidad del servicio, notificamos a los contactos designados de la organización por los canales acordados en el contrato, con cronograma de contención y, cuando aplique, resumen técnico para post-mortem interno. El estado en vivo del sistema se publica en <a href="/status" class="pp-link">/status</a>.</p>
        </div>
      </section>

      <section class="pp-section">
        <div class="pp-section__inner pp-legal-links sr-reveal">
          <a href="/privacidad" class="pp-btn pp-btn--ghost">Política de privacidad</a>
          <a href="/terminos" class="pp-btn pp-btn--ghost">Términos de servicio</a>
        </div>
      </section>
    `;
  }
}

window.SeguridadView = SeguridadView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SeguridadView;
}
