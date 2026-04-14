class PlataformaView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'plataforma.html';
    this.activePath = '/plataforma';
    this.pageClass = 'public-page--plataforma';
  }
}
window.PlataformaView = PlataformaView;
