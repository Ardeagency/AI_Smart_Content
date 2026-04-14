class StatusView extends PublicBaseView {
  constructor() {
    super();
    this.templatePath = 'status.html';
    this.activePath = '/status';
    this.pageClass = 'public-page--status';
  }

  async init() {
    await super.init();
    // Timestamp placeholder: se actualizará cuando se conecte system_metrics
    const ts = this.container.querySelector('#statusTimestamp');
    if (ts) {
      const now = new Date();
      const formatted = now.toLocaleString('es-CO', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      ts.textContent = `Último snapshot: ${formatted}`;
    }
  }
}
window.StatusView = StatusView;
