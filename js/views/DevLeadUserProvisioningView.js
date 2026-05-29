/**
 * DevLeadUserProvisioningView
 *
 * /dev/provisioning/users — flujo de creacion de usuario (rebuild 2026-05-29).
 *
 * Layout:
 *   - Progress bar superior con 4 pasos: Tipo / Datos / Organizacion / Revisar
 *   - Cards (Consumer / Developer / Admin) centradas vertical+horizontal
 *   - Footer Back / Next centrado debajo de las cards
 *
 * Estado actual: Paso 1 (Tipo) listo, sin backend. Pasos 2-4 pendientes.
 */
class DevLeadUserProvisioningView extends DevBaseView {
  constructor() {
    super();
    this.userType = null;
    this.currentStep = 'type';
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  STEPS = [
    { key: 'type',   label: 'Tipo' },
    { key: 'data',   label: 'Datos' },
    { key: 'org',    label: 'Organizacion' },
    { key: 'review', label: 'Revisar' }
  ];

  USER_TYPES = [
    {
      key: 'consumer',
      label: 'Consumer',
      icon: 'fa-user',
      hint: 'Usuario final con acceso a una organizacion'
    },
    {
      key: 'developer',
      label: 'Developer',
      icon: 'fa-code',
      hint: 'Acceso al portal /dev'
    },
    {
      key: 'admin',
      label: 'Admin',
      icon: 'fa-user-shield',
      hint: 'Gestiona la organizacion'
    }
  ];

  renderHTML() {
    return `
      <div class="provision-page">
        <header class="provision-page-progress">
          ${this.renderProgress()}
        </header>

        <div class="provision-page-center">
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
      </div>
    `;
  }

  renderProgress() {
    const idx = this.STEPS.findIndex((s) => s.key === this.currentStep);
    return `
      <ol class="provision-progress" aria-label="Progreso del flujo">
        ${this.STEPS.map((s, i) => {
          const state = i < idx ? 'is-done' : i === idx ? 'is-current' : 'is-pending';
          const marker = i < idx
            ? '<i class="fas fa-check"></i>'
            : String(i + 1);
          return `
            <li class="provision-progress-item ${state}" data-step="${s.key}">
              <span class="provision-progress-caret" aria-hidden="true">
                <i class="fas fa-caret-down"></i>
              </span>
              <span class="provision-progress-marker">${marker}</span>
              <span class="provision-progress-label">${this.escapeHtml(s.label)}</span>
            </li>
          `;
        }).join('')}
      </ol>
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
    this.showNotification(`Tipo seleccionado: ${this.userType}`, 'info');
  }
}

window.DevLeadUserProvisioningView = DevLeadUserProvisioningView;
