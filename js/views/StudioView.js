/**
 * StudioView - Vista en blanco del Estudio (hoja vacía para construir desde cero)
 */
class StudioView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }

    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.organizationId) {
      window.router?.navigate('/hogar');
      return;
    }

    localStorage.setItem('selectedOrganizationId', this.organizationId);
  }

  renderHTML() {
    return `
      <div class="studio-blank" id="studioContainer">
        <!-- Contenido futuro: hoja en blanco -->
      </div>
    `;
  }

  async init() {
    window.studioView = this;
  }
}

window.StudioView = StudioView;
