/**
 * ActivityView - Feed unificado de actividad (shell).
 * Estado: shell "Próximamente". Implementación detallada en sprint D8.
 *
 * Cuando se detalle, consume feed unificado de 5 fuentes:
 *   intelligence_signals · mission_runs · delivery_events ·
 *   provisioning_events · vera_pending_actions resueltas
 */
class ActivityView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
  }

  renderHTML() {
    return `
      <div class="page-content">
        <div class="dash-coming-soon" style="
          display:flex;align-items:center;justify-content:center;
          flex-direction:column;gap:8px;
          min-height:60vh;padding:48px 24px;
        ">
          <h2 style="margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;">
            Activity Timeline
          </h2>
          <p style="margin:0;color:var(--text-muted);">Próximamente</p>
        </div>
      </div>`;
  }
}

window.ActivityView = ActivityView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ActivityView;
}
