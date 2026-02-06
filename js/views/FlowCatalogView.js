/**
 * FlowCatalogView - Catálogo de flujos (hoja en blanco).
 */
class FlowCatalogView extends BaseView {
  constructor() {
    super();
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
    return `<div class="flow-catalog flow-catalog--blank" id="flowCatalogContainer"></div>`;
  }

  async init() {
    // Hoja en blanco: sin contenido ni carga de datos
  }
}

window.FlowCatalogView = FlowCatalogView;
