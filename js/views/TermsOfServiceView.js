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
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Última actualización: 14 de abril de 2026</p>
        </div>
      </section>

      <section class="pp-section pp-legal">
        <div class="pp-section__inner pp-legal__body">
          <section class="pp-legal__sec sr-reveal">
            <h2>1. Aceptación de los términos</h2>
            <p>Al acceder a AI S-MART CONTENT con una cuenta autorizada o al usar los formularios y sitios públicos operados por Arde Agency S.A.S., aceptas estos términos. Si actúas en nombre de una empresa, declaras que tienes facultad para obligarla. Si no estás de acuerdo, no utilices el servicio.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>2. Descripción del servicio</h2>
            <p>AI S-MART CONTENT es una plataforma de inteligencia y producción de contenido orientada a organizaciones, prestada predominantemente en modelo <strong>gestionado</strong>: la configuración, altas de usuario e integraciones sensibles son responsabilidad de Arde salvo pacto distinto por escrito. El alcance funcional concreto (módulos, límites, SLAs y soporte) se define en la propuesta o contrato firmado con cada cliente.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>3. Acceso y cuentas de usuario</h2>
            <p>No existe autoregistro público. Los accesos se otorgan por invitación y afiliación a una organización. Eres responsable de la confidencialidad de tus credenciales y de las acciones realizadas bajo tu cuenta. Debes notificar de inmediato el uso no autorizado.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>4. Propiedad intelectual</h2>
            <p>Arde y sus licenciantes conservan los derechos sobre el software, diseño y documentación de la plataforma. Los contenidos que generes o cargues permanecen en titularidad de tu organización salvo pacto distinto; otorgas a Arde la licencia necesaria para alojar, procesar y mostrar esos contenidos a fin de prestar el servicio. Los outputs generados con asistencia de IA deben revisarse según tu política interna y la normativa aplicable.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>5. Uso aceptable</h2>
            <p>Queda prohibido usar la plataforma para actividades ilícitas, para infringir derechos de terceros, para distribuir malware, para suplantar identidades, para entrenar modelos externos con datos de la plataforma sin autorización o para someter el sistema a cargas abusivas. Arde puede suspender el acceso ante indicios razonables de abuso previa notificación salvo urgencia por seguridad.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>6. Limitación de responsabilidad</h2>
            <p>El servicio se presta “en el estado en que se encuentra” salvo garantías expresas en contrato. En la máxima medida permitida por la ley, Arde no será responsable por daños indirectos, lucro cesante o pérdida de datos más allá de las medidas razonables de copia de seguridad y recuperación descritas en la documentación del servicio. La responsabilidad total anual, salvo dolo o culpa grave, se limitará a lo pactado expresamente en el contrato marco o, en su defecto, a las cuotas pagadas por el cliente en los doce meses anteriores al hecho generador.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>7. SLAs y disponibilidad</h2>
            <p>Los niveles de servicio, ventanas de mantenimiento y canales de soporte se fijan por escrito y no sustituyen los acuerdos contractuales de nivel de servicio.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>8. Terminación</h2>
            <p>Cualquiera de las partes puede dar por terminada la relación conforme al contrato. Tras la terminación, se aplicará la política de retención y eliminación de datos. Arde puede suspender el servicio por incumplimiento grave, impago o riesgo de seguridad, notificando cuando sea razonablemente posible.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>9. Ley aplicable y jurisdicción</h2>
            <p>Salvo pacto distinto por escrito entre las partes, estos términos se rigen por las leyes de la República de Colombia. Las controversias se someten a los tribunales competentes de la ciudad de Medellín, sin perjuicio de las reglas imperativas que favorezcan al consumidor cuando corresponda.</p>
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
