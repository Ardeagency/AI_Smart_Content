class SolucionesView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'soluciones.html';
    this.activePath = '/soluciones';
    this.pageClass = 'public-page--soluciones';
  }
}
window.SolucionesView = SolucionesView;
