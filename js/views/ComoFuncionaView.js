class ComoFuncionaView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'como-funciona.html';
    this.activePath = '/como-funciona';
    this.pageClass = 'public-page--como-funciona';
  }
}
window.ComoFuncionaView = ComoFuncionaView;
