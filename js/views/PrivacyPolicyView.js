/**
 * PrivacyPolicyView - Política de Privacidad.
 * Página pública — HTML inline, usa shell público (header + footer).
 */
class PrivacyPolicyView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/privacidad';
    this.pageClass = 'public-page--legal';
  }

  renderContent() {
    return `
      <section class="pp-hero pp-hero--compact">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Legal</span>
          <h1 class="pp-hero__title sr-reveal">Política de Privacidad</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Última actualización: [CONTENIDO LEGAL: fecha]</p>
        </div>
      </section>

      <section class="pp-section pp-legal">
        <div class="pp-section__inner pp-legal__body">
          <section class="pp-legal__sec sr-reveal">
            <h2>1. Quiénes somos</h2>
            <p>[CONTENIDO LEGAL: descripción del responsable del tratamiento y datos de contacto].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>2. Qué datos recopilamos y por qué</h2>
            <p>[CONTENIDO LEGAL: categorías de datos y finalidades].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>3. Cómo usamos los datos</h2>
            <p>[CONTENIDO LEGAL: usos específicos — prestación del servicio, mejora, comunicaciones, etc.].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>4. Con quién compartimos datos</h2>
            <p>[CONTENIDO LEGAL: lista de subprocesadores — ver también <a href="/seguridad" class="pp-link">/seguridad</a>].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>5. Retención de datos</h2>
            <p>[CONTENIDO LEGAL: plazos de conservación].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>6. Derechos del usuario</h2>
            <p>[CONTENIDO LEGAL: acceso, rectificación, supresión, portabilidad, oposición].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>7. Cookies</h2>
            <p>[CONTENIDO LEGAL: uso de cookies y tecnologías similares].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>8. Cambios a esta política</h2>
            <p>[CONTENIDO LEGAL: proceso de actualización y notificación].</p>
          </section>
        </div>
      </section>
    `;
  }
}

window.PrivacyPolicyView = PrivacyPolicyView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrivacyPolicyView;
}
