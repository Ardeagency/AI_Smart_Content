/**
 * PublicBaseView - Base para páginas públicas (marketing).
 * Envuelve el contenido de cada vista con header + footer públicos.
 * Las subclases implementan renderContent() — HTML inline, sin templates.
 */
class PublicBaseView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.activePath = '/';
    this.hideFooter = false;
    this.pageClass = '';
  }

  async onEnter() {
    // Página pública — sin redirección
  }

  async updateHeader() {
    // Las páginas públicas tienen su propio header (sin avatar de usuario)
  }

  /**
   * HTML del contenido principal (sin header/footer). Override obligatorio.
   */
  renderContent() {
    return '';
  }

  renderHTML() {
    const content = this.renderContent();
    if (!window.PublicLayout) return content;
    return window.PublicLayout.wrap({
      active: this.activePath,
      content,
      hideFooter: this.hideFooter,
      extraClass: this.pageClass
    });
  }

  async init() {
    if (window.PublicLayout) {
      window.PublicLayout.initBehaviors(this.container);
    }
  }

  async onLeave() {
    if (window.PublicLayout) window.PublicLayout.cleanup();
  }

  destroy() {
    super.destroy();
    if (window.PublicLayout) window.PublicLayout.cleanup();
  }
}

window.PublicBaseView = PublicBaseView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PublicBaseView;
}
