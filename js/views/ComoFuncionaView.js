/**
 * ComoFuncionaView - Proceso de onboarding y modelo de servicio managed.
 * Página pública — HTML inline siguiendo el patrón SPA.
 */
class ComoFuncionaView extends PublicBaseView {
  constructor() {
    super();
    this.activePath = '/como-funciona';
    this.pageClass = 'public-page--como-funciona';
  }

  renderContent() {
    return `
      <section class="pp-hero">
        <div class="pp-hero__inner">
          <span class="pp-eyebrow sr-reveal">Cómo funciona</span>
          <h1 class="pp-hero__title sr-reveal">Un equipo técnico configura todo. Tu marca solo necesita estar lista para producir.</h1>
          <p class="pp-hero__sub sr-reveal sr-reveal--d1">Arde diseña la configuración, activa integraciones y mantiene la plataforma; tu equipo se queda con la decisión creativa y el criterio de negocio.</p>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-model">
        <div class="pp-section__inner">
          <h2 id="pp-model" class="pp-section__title sr-reveal">El modelo de servicio</h2>
          <p class="pp-section__text sr-reveal sr-reveal--d1">AI S-MART CONTENT no es autoservicio. Arde configura, activa y mantiene la plataforma para cada organización. El equipo del cliente la usa; no la configura. Ventaja: cero curva de aprendizaje técnico.</p>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-steps">
        <div class="pp-section__inner">
          <h2 id="pp-steps" class="pp-section__title sr-reveal">Proceso paso a paso</h2>
          <ol class="pp-steps">
            <li class="pp-step sr-reveal">
              <span class="pp-step__num">01</span>
              <div>
                <h3 class="pp-step__title">Contacto y evaluación</h3>
                <p>El prospecto llena el formulario en <a href="/contacto" class="pp-link">/contacto</a>. Arde evalúa el fit y agenda una sesión de diagnóstico.</p>
              </div>
            </li>
            <li class="pp-step sr-reveal sr-reveal--d1">
              <span class="pp-step__num">02</span>
              <div>
                <h3 class="pp-step__title">Diagnóstico de marca</h3>
                <p>Sesión de trabajo para mapear ADN, audiencias, entidades y objetivos estratégicos. Output: brief de configuración inicial.</p>
              </div>
            </li>
            <li class="pp-step sr-reveal sr-reveal--d2">
              <span class="pp-step__num">03</span>
              <div>
                <h3 class="pp-step__title">Configuración de la organización</h3>
                <p>Arde crea la organización, configura los módulos, activa los flujos relevantes e integra plataformas existentes. Tiempo estimado: en la mayoría de despliegues, entre dos y seis semanas según complejidad de marca e integraciones.</p>
              </div>
            </li>
            <li class="pp-step sr-reveal sr-reveal--d3">
              <span class="pp-step__num">04</span>
              <div>
                <h3 class="pp-step__title">Activación y calibración</h3>
                <p>Primeras producciones con revisión de calidad. Ajuste fino de sistema de marca, flujos y agentes.</p>
              </div>
            </li>
            <li class="pp-step sr-reveal sr-reveal--d4">
              <span class="pp-step__num">05</span>
              <div>
                <h3 class="pp-step__title">Producción continua</h3>
                <p>La plataforma opera con supervisión del equipo del cliente. Arde monitorea el sistema y despliega mejoras continuas.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section class="pp-section" aria-labelledby="pp-client">
        <div class="pp-section__inner">
          <h2 id="pp-client" class="pp-section__title sr-reveal">Lo que necesita el cliente</h2>
          <ul class="pp-check sr-reveal sr-reveal--d1">
            <li>Brief inicial de marca</li>
            <li>Acceso a cuentas de redes sociales para integraciones</li>
            <li>Un punto de contacto interno para validaciones</li>
            <li>Políticas internas de aprobación (quién valida piezas y en qué etapas)</li>
          </ul>
        </div>
      </section>

      <section class="pp-cta">
        <div class="pp-cta__inner sr-reveal">
          <h2 class="pp-cta__title">¿Listos para comenzar el diagnóstico?</h2>
          <a href="/contacto" class="pp-btn pp-btn--primary">Solicitar acceso</a>
        </div>
      </section>
    `;
  }
}

window.ComoFuncionaView = ComoFuncionaView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComoFuncionaView;
}
