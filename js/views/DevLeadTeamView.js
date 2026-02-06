/**
 * DevLeadTeamView - Equipo (solo Lead)
 * Agregar, banear y controlar usuarios del equipo.
 */
class DevLeadTeamView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
      if (!window.authService.isLead()) {
        if (window.router) window.router.navigate('/dev/dashboard', true);
        return;
      }
    }
    if (window.navigation && (!window.navigation.initialized || window.navigation.currentMode !== 'developer')) {
      window.navigation.currentMode = 'developer';
      window.navigation.initialized = false;
      await window.navigation.render();
    }
  }

  renderHTML() {
    return `
      <div class="dev-lead-container">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-user-friends"></i> Equipo</h1>
            <p class="dev-header-subtitle">Gestiona, agrega y controla usuarios del equipo de desarrollo</p>
          </div>
        </header>
        <section class="dev-lead-content">
          <p class="dev-lead-placeholder">Vista de equipo (Lead): listado de desarrolladores, agregar, banear, roles. En construcción.</p>
        </section>
      </div>`;
  }
}
window.DevLeadTeamView = DevLeadTeamView;
