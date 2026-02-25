/**
 * ServicesView - Vista de gestión de servicios
 * Enlace desde sidebar Identidad > Servicios (ruta servicios, distinta de productos).
 */
class ServicesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  renderHTML() {
    return `
      <div class="services-view page-content">
        <header class="page-header">
          <h2>Servicios</h2>
        </header>
        <div class="services-placeholder">
          <p>Gestión de servicios. Próximamente.</p>
        </div>
      </div>
    `;
  }

  async render() {
    await super.render();
    this.updateLinksForRouter && this.updateLinksForRouter();
  }
}

window.ServicesView = ServicesView;
