class NosotrosView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'nosotros.html';
    this.activePath = '/nosotros';
    this.pageClass = 'public-page--nosotros';
  }
}
window.NosotrosView = NosotrosView;
