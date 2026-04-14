/**
 * PublicBaseView - Base para páginas públicas (marketing).
 *
 * A diferencia de BaseView, esta clase NO renderiza en #app-container.
 * Todo el contenido va dentro del shell persistente (#public-shell),
 * así el header y el footer NO se re-renderizan al navegar entre rutas
 * públicas y no hay parpadeo.
 *
 * Las subclases implementan renderContent() — HTML inline (sin templates).
 */
class PublicBaseView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.activePath = '/';
    this.pageClass = '';
    // Apuntará al nodo interno del shell, no a #app-container
    this.container = null;
  }

  async onEnter() {
    // Público — sin redirección
  }

  async updateHeader() {
    // El header de usuario (avatar/dropdown) no aplica en páginas públicas
  }

  renderContent() {
    return '';
  }

  /**
   * Override de BaseView.render(): no usa el flujo normal con #app-container.
   * Le delega a PublicLayout que mantiene el shell persistente.
   */
  async render() {
    if (!window.PublicLayout) {
      // Fallback defensivo si algo falla en el orden de carga
      const appContainer = document.getElementById('app-container');
      if (appContainer) appContainer.innerHTML = this.renderContent();
      return;
    }

    try {
      await this.onEnter();
      const html = this.renderContent();
      const contentRoot = window.PublicLayout.renderView({
        activePath: this.activePath,
        content: html,
        pageClass: this.pageClass
      });
      this.container = contentRoot || document.getElementById('public-view-content');
      await this.init();
      this.initialized = true;
    } catch (err) {
      console.error('[PublicBaseView] Error renderizando vista pública:', err);
    }
  }

  async init() {
    // Override en subclases. Por defecto no hace nada extra:
    // el scroll-reveal, mobile toggle y scroll del header los maneja PublicLayout.
  }

  async onLeave() {
    // NO desmontamos el shell aquí — si la siguiente ruta también es pública
    // el shell debe permanecer para evitar parpadeo. PublicLayout escucha
    // 'routechange' y se desmonta solo si la nueva ruta NO es pública.
  }

  destroy() {
    super.destroy();
  }
}

window.PublicBaseView = PublicBaseView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PublicBaseView;
}
