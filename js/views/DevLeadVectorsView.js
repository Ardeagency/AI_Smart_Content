/**
 * DevLeadVectorsView - AI Global Vectors (solo Lead)
 * Editar archivos/contenido de las inteligencias artificiales (cerebro de las IA).
 */
class DevLeadVectorsView extends BaseView {
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
            <h1 class="dev-header-title"><i class="fas fa-brain"></i> AI Global Vectors</h1>
            <p class="dev-header-subtitle">Edita el conocimiento y vectores globales de las inteligencias artificiales</p>
          </div>
        </header>
        <section class="dev-lead-content">
          <p class="dev-lead-placeholder">Vista ai_global_vectors (Lead): edición de fuentes, chunks, conocimiento IA. En construcción.</p>
        </section>
      </div>`;
  }
}
window.DevLeadVectorsView = DevLeadVectorsView;
