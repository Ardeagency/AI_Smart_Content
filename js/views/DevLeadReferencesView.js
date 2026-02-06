/**
 * DevLeadReferencesView - Referencias visuales (solo Lead)
 * Organizar bucket visual-references: carpetas, flujos, subir/editar/eliminar imágenes.
 */
class DevLeadReferencesView extends BaseView {
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
            <h1 class="dev-header-title"><i class="fas fa-images"></i> Referencias visuales</h1>
            <p class="dev-header-subtitle">Organiza el bucket de referencias: carpetas, flujos, subir y eliminar imágenes</p>
          </div>
        </header>
        <section class="dev-lead-content">
          <p class="dev-lead-placeholder">Vista referencias visuales (Lead): bucket visual-references, tabla visual_references. En construcción.</p>
        </section>
      </div>`;
  }
}
window.DevLeadReferencesView = DevLeadReferencesView;
