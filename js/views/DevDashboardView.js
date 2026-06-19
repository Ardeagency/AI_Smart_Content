/**
 * DevDashboardView — Dashboard del portal /dev.
 *
 * LIMPIO (2026-06-19): se vació por completo. La versión anterior (tira de
 * salud, "necesita tu atención", KPIs, top flujos, actividad) no aportaba al
 * flujo real del developer, así que se eliminó para reconstruir desde cero.
 *
 * Se conserva el andamiaje mínimo: sesión Supabase + detección de rol + header,
 * listos para cuando construyamos el nuevo panel.
 */
class DevDashboardView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.isLead = false;
  }

  renderHTML() {
    return `
      <div class="dev-dashboard-container dev-dashboard-v2">
        <header class="dev-dashboard-header">
          <div class="dev-header-actions" id="devHeaderActions"></div>
        </header>

        <section class="dev-dashboard-empty" aria-label="Dashboard">
          <div class="dev-dashboard-empty-inner">
            <i class="fas fa-gauge-high" aria-hidden="true"></i>
            <h2>Dashboard en construcción</h2>
            <p>Vamos a diseñar este panel desde cero.</p>
          </div>
        </section>
      </div>
    `;
  }

  async init() {
    await this.initSupabase();
    this.detectRole();
    this.renderHeader();
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('[DevDashboard] init supabase error', e);
    }
  }

  detectRole() {
    this.isLead = !!(window.authService && window.authService.isLead && window.authService.isLead());
  }

  renderHeader() {
    const titleEl = document.getElementById('devHeaderTitle');
    const subEl = document.getElementById('devHeaderSubtitle');
    const actEl = document.getElementById('devHeaderActions');
    if (titleEl) titleEl.textContent = 'Dashboard';
    if (subEl) subEl.textContent = '';
    if (actEl) actEl.innerHTML = '';
  }

  async onLeave() { /* no cleanup needed */ }
}

window.DevDashboardView = DevDashboardView;
