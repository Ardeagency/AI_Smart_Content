/**
 * TermsOfServiceView - Términos de Servicio.
 * Página pública — HTML inline, usa shell público.
 */
class TermsOfServiceView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/terminos';
    this.pageClass = 'public-page--legal';
  }

  renderContent() {
    return `
      <section class="pp-hero pp-hero--compact">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Legal</span>
          <h1 class="pp-hero__title sr-reveal">Términos de Servicio</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Última actualización: [CONTENIDO LEGAL: fecha]</p>
        </div>
      </section>

      <section class="pp-section pp-legal">
        <div class="pp-section__inner pp-legal__body">
          <section class="pp-legal__sec sr-reveal">
            <h2>1. Aceptación de los términos</h2>
            <p>[CONTENIDO LEGAL: aceptación del acuerdo de servicio].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>2. Descripción del servicio</h2>
            <p>[CONTENIDO LEGAL: alcance funcional y naturaleza del servicio managed].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>3. Acceso y cuentas de usuario</h2>
            <p>[CONTENIDO LEGAL: modelo por invitación — no existe autoregistro].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>4. Propiedad intelectual</h2>
            <p>[CONTENIDO LEGAL: propiedad del contenido generado, licencias recíprocas].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>5. Uso aceptable</h2>
            <p>[CONTENIDO LEGAL: conductas permitidas y prohibidas].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>6. Limitación de responsabilidad</h2>
            <p>[CONTENIDO LEGAL: exclusiones y límites].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>7. SLAs y disponibilidad</h2>
            <p>[CONTENIDO LEGAL: compromisos de servicio — ver también <a href="/status" class="pp-link">/status</a>].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>8. Terminación</h2>
            <p>[CONTENIDO LEGAL: causales y efectos].</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>9. Ley aplicable y jurisdicción</h2>
            <p>[CONTENIDO LEGAL: ley aplicable y foro competente].</p>
          </section>
        </div>
      </section>
    `;
  }
}

window.TermsOfServiceView = TermsOfServiceView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TermsOfServiceView;
}
