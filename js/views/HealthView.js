/**
 * HealthView - Vista de salud / status del sistema (shell).
 * Estado: shell "Próximamente". Implementación detallada en sprint D9.
 *
 * Cuando se detalle, consume:
 *   mv_dashboard_health · storage_usage · organization_credits ·
 *   v_org_claude_usage_today · monitoring_triggers · brand_integrations ·
 *   openclaw_instances · provisioning_events
 */
class HealthView extends BaseView {
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
            Salud del sistema
          </h2>
          <p style="margin:0;color:var(--text-muted);">Próximamente</p>
        </div>
      </div>`;
  }
}

window.HealthView = HealthView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HealthView;
}
