class ChangelogView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'changelog.html';
    this.activePath = '/changelog';
    this.pageClass = 'public-page--changelog';
  }

  async init() {
    await super.init();
    const form = this.container.querySelector('#changelogSubscribe');
    if (!form) return;
    this.addEventListener(form, 'submit', (e) => {
      e.preventDefault();
      // Placeholder — segunda fase: conectar a servicio de email
      form.reset();
    });
  }
}
window.ChangelogView = ChangelogView;
