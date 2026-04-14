class ContactoView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'contacto.html';
    this.activePath = '/contacto';
    this.pageClass = 'public-page--contacto';
  }

  async init() {
    await super.init();
    const form = this.container.querySelector('#contactForm');
    const status = this.container.querySelector('#contactStatus');
    if (!form || !status) return;

    this.addEventListener(form, 'submit', (e) => {
      e.preventDefault();
      // Validación mínima nativa
      if (!form.checkValidity()) {
        status.textContent = 'Por favor completa los campos requeridos.';
        status.classList.remove('is-success');
        status.classList.add('is-error');
        form.reportValidity();
        return;
      }
      // Envío en etapa inicial: placeholder — se conectará a endpoint/servicio de formularios
      status.textContent = 'Solicitud recibida. Te contactaremos en 48 horas hábiles.';
      status.classList.remove('is-error');
      status.classList.add('is-success');
      form.reset();
    });
  }
}
window.ContactoView = ContactoView;
