class CasosView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'casos.html';
    this.activePath = '/casos';
    this.pageClass = 'public-page--casos';
  }
}
window.CasosView = CasosView;
