/**
 * DataDeletionView - Solicitud de eliminación de datos.
 * Página pública — HTML inline, usa shell público.
 */
class DataDeletionView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/eliminacion-de-datos';
    this.pageClass = 'public-page--legal';
  }

  renderContent() {
    return `
      <section class="pp-hero pp-hero--compact">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Legal</span>
          <h1 class="pp-hero__title sr-reveal">Eliminación de datos de usuario</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Última actualización: marzo 2026</p>
        </div>
      </section>

      <section class="pp-section pp-legal">
        <div class="pp-section__inner pp-legal__body">
          <section class="pp-legal__sec sr-reveal">
            <h2>1. Solicitud de eliminación</h2>
            <p>Si deseas eliminar los datos asociados a tu cuenta, envía una solicitud al correo de soporte indicado por tu organización o solicita la eliminación desde el canal oficial de atención.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>2. Información requerida</h2>
            <p>Para procesar la solicitud, incluye: correo de la cuenta, nombre de la organización/marca y, si aplica, el identificador de usuario de la plataforma conectada.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>3. Plazo de atención</h2>
            <p>Una vez validada la identidad del solicitante, la eliminación se procesa en un plazo máximo de 30 días calendario, salvo obligación legal de conservación.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>4. Alcance de la eliminación</h2>
            <p>La solicitud elimina o anonimiza los datos personales y desconecta las integraciones relacionadas. Los registros que deban conservarse por cumplimiento legal podrán mantenerse bloqueados.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>5. Confirmación</h2>
            <p>Al finalizar el proceso, se enviará una confirmación al correo registrado en la solicitud.</p>
          </section>
        </div>
      </section>
    `;
  }
}

window.DataDeletionView = DataDeletionView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataDeletionView;
}
