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
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Última actualización: 14 de abril de 2026</p>
        </div>
      </section>

      <section class="pp-section pp-legal">
        <div class="pp-section__inner pp-legal__body">
          <section class="pp-legal__sec sr-reveal">
            <h2>1. Quiénes somos</h2>
            <p>El responsable del tratamiento de datos personales asociados a AI S-MART CONTENT es <strong>Arde Agency S.A.S.</strong>, sociedad colombiana con sede de operación en Medellín, Antioquia. Para ejercer derechos o consultas sobre privacidad puedes escribir a <a href="mailto:contact@aismartcontent.io" class="pp-link">contact@aismartcontent.io</a>.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>2. Qué datos recopilamos y por qué</h2>
            <p>Tratamos datos identificativos y de contacto (nombre, correo, empresa, cargo) cuando envías formularios públicos o solicitas acceso. En la plataforma tratamos datos de cuenta, datos de la organización y marcas que configures, contenidos y metadatos de producción, registros técnicos (logs mínimos necesarios para soporte y seguridad) y, si las activas, credenciales e información obtenida a través de integraciones con terceros (redes sociales, analítica, marketplaces). Las finalidades son prestar el servicio contratado, autenticación, soporte, mejora del producto en forma agregada o anonimizada cuando sea posible, cumplimiento legal y comunicaciones operativas relacionadas con el servicio.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>3. Cómo usamos los datos</h2>
            <p>Los datos se usan para operar la plataforma (incluido el uso de proveedores de nube e IA), procesar solicitudes de contacto, gestionar accesos por invitación, ejecutar flujos de contenido que tú o tu organización activen y generar métricas internas de uso. No vendemos listas de contacto ni utilizamos tus datos de marca para entrenar modelos de terceros fuera de lo estrictamente necesario para prestar el servicio contratado.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>4. Con quién compartimos datos</h2>
            <p>Compartimos datos con subencargados que intervienen en el funcionamiento de la plataforma (por ejemplo, alojamiento, base de datos, autenticación, modelos de IA e infraestructura de agentes). Integraciones opcionales (Meta, Google u otras) implican el tratamiento de datos bajo las políticas de dichos proveedores, en la medida en que conectes esas cuentas.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>5. Retención de datos</h2>
            <p>Conservamos los datos mientras se mantenga la relación contractual o sea necesario para cumplir obligaciones legales o resolver reclamaciones. Tras la baja, aplicamos supresión o anonimización salvo que la ley exija conservación bloqueada. Las solicitudes de eliminación se describen en <a href="/eliminacion-de-datos" class="pp-link">Eliminación de datos</a>.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>6. Derechos del usuario</h2>
            <p>En la medida en que aplique la normativa colombiana (Ley 1581 de 2012 y reglamentación), puedes solicitar acceso, actualización, rectificación y supresión cuando proceda, así como revocar autorizaciones otorgadas, presentar consultas ante la Superintendencia de Industria y Comercio y, en su caso, otras solicitudes previstas en la ley. Responderemos en los plazos legales tras validar tu identidad.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>7. Cookies</h2>
            <p>La aplicación puede usar cookies o almacenamiento local estrictamente necesarios para la sesión, preferencias y seguridad (por ejemplo, mantener tu inicio de sesión). Las cookies de analítica o marketing, si se incorporan, se describirán y, cuando la ley lo exija, se solicitará consentimiento.</p>
          </section>
          <section class="pp-legal__sec sr-reveal">
            <h2>8. Cambios a esta política</h2>
            <p>Podemos actualizar esta política para reflejar cambios legales o del producto. Publicaremos la nueva versión en esta URL con la fecha de actualización. Cuando el cambio sea sustancial y afecte el tratamiento ya autorizado, daremos aviso razonable por los canales de contacto habituales o dentro de la plataforma.</p>
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
