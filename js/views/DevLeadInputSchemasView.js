/**
 * DevLeadInputSchemasView - Tipos de input_schema (solo Lead)
 * Agregar, eliminar, configurar y personalizar tipos de input para el Builder.
 */
class DevLeadInputSchemasView extends BaseView {
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
            <h1 class="dev-header-title"><i class="fas fa-puzzle-piece"></i> Input Schemas</h1>
            <p class="dev-header-subtitle">Configura los tipos de input disponibles en el Builder para todos los desarrolladores</p>
          </div>
        </header>
        <section class="dev-lead-content">
          <p class="dev-lead-placeholder">Vista Input Schema Edit (Lead): tipos de campos, configuración global. En construcción.</p>
        </section>
      </div>`;
  }
}
window.DevLeadInputSchemasView = DevLeadInputSchemasView;
