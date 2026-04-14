class SeguridadView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'seguridad.html';
    this.activePath = '/seguridad';
    this.pageClass = 'public-page--seguridad';
  }
}
window.SeguridadView = SeguridadView;
