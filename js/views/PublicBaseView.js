/**
 * PublicBaseView - Base para todas las páginas públicas nuevas.
 * Carga el template específico y lo envuelve con header + footer públicos.
 * Inicializa comportamientos comunes (header sticky, mobile menu, scroll reveal).
 */
class PublicBaseView extends BaseView {
  constructor() {
    super();
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

  async renderHTML() {
    if (!this.templatePath) {
      throw new Error('PublicBaseView requiere templatePath');
    }
    const inner = await this.loadTemplate();
    if (!window.PublicLayout) return inner;
    return window.PublicLayout.wrap({
      active: this.activePath,
      content: inner,
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
