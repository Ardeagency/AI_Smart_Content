/**
 * DevLeadUserProvisioningView
 *
 * Nueva pagina /dev/provisioning/users — rebuild from scratch (2026-05-29).
 * Reemplaza el wizard legacy de 3 stages por un flujo basado en seleccion
 * de tipo de usuario como punto de entrada. Estilo migrado de org/.
 *
 * Estado actual: Paso 1 (SELECT USER TYPE) listo, sin backend conectado.
 * Los siguientes pasos del flujo se iran agregando.
 */
class DevLeadUserProvisioningView extends DevBaseView {
  constructor() {
    super();
    this.userType = null; // 'admin' | 'manager' | 'developer'
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  USER_TYPES = [
    {
      key: 'admin',
      label: 'Admin',
      icon: 'fa-user-shield',
      hint: 'Gestiona la organizacion'
    },
    {
      key: 'manager',
      label: 'Manager',
      icon: 'fa-user-tie',
      hint: 'Opera marcas y campanas'
    },
    {
      key: 'developer',
      label: 'Developer',
      icon: 'fa-code',
      hint: 'Acceso al portal /dev'
    }
  ];

  renderHTML() {
    return `
      <div class="provision-page">
        <header class="provision-page-header">
          <h1 class="provision-page-title">SELECT USER TYPE</h1>
          <span class="provision-page-underline" aria-hidden="true"></span>
        </header>

        <div class="provision-type-grid" role="radiogroup" aria-label="Tipo de usuario">
          ${this.USER_TYPES.map((t) => `
            <button
              type="button"
              class="provision-type-card"
              data-user-type="${t.key}"
              role="radio"
              aria-checked="false"
            >
              <span class="provision-type-icon"><i class="fas ${t.icon}"></i></span>
              <span class="provision-type-label">${this.escapeHtml(t.label)}</span>
              <span class="provision-type-hint">${this.escapeHtml(t.hint)}</span>
            </button>
          `).join('')}
        </div>

        <footer class="provision-page-actions">
          <button type="button" class="provision-back-btn" data-action="back">Back</button>
          <button
            type="button"
            class="provision-next-btn"
            data-action="next"
            aria-label="Siguiente"
            disabled
          >
            <i class="fas fa-arrow-right"></i>
          </button>
        </footer>
      </div>
    `;
  }

  async init() {
    this.wireTypeCards();
    this.wireActions();
  }

  wireTypeCards() {
    this.container.querySelectorAll('[data-user-type]').forEach((card) => {
      this.addEventListener(card, 'click', () => {
        const key = card.getAttribute('data-user-type');
        this.selectUserType(key);
      });
    });
  }

  wireActions() {
    const backBtn = this.container.querySelector('[data-action="back"]');
    const nextBtn = this.container.querySelector('[data-action="next"]');
    if (backBtn) this.addEventListener(backBtn, 'click', () => this.handleBack());
    if (nextBtn) this.addEventListener(nextBtn, 'click', () => this.handleNext());
  }

  selectUserType(key) {
    this.userType = key;
    this.container.querySelectorAll('.provision-type-card').forEach((card) => {
      const active = card.getAttribute('data-user-type') === key;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    const nextBtn = this.container.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.disabled = false;
  }

  handleBack() {
    if (window.router) window.router.navigate('/dev/dashboard');
  }

  handleNext() {
    if (!this.userType) return;
    // Siguiente paso del flujo (pendiente de implementar).
    this.showNotification(`Tipo seleccionado: ${this.userType}`, 'info');
  }
}

window.DevLeadUserProvisioningView = DevLeadUserProvisioningView;
