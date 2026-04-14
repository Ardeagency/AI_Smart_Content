/**
 * PlanesView - Vista de planes (solo visualización y selección).
 * Registro e inicio de sesión se hacen en /login (SignInView).
 */
class PlanesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.selectedPlan = null;
    this.billingPeriod = 'monthly';
  }

  renderHTML() {
    return `
      <div class="planes-main">
      <div class="planes-layout planes-layout-single">
          <div class="planes-hero">
              <div class="planes-hero-background"><div class="planes-background-gradient"></div></div>
              <div class="planes-hero-content">
                  <h1 class="planes-hero-title" id="planesBillingTitle">Planes mensuales</h1>
                  <div class="planes-billing-toggle" role="group" aria-label="Tipo de facturación">
                      <button type="button" class="planes-toggle-btn active" data-billing="monthly" id="toggleMonthly">Mensual</button>
                      <button type="button" class="planes-toggle-btn" data-billing="annual" id="toggleAnnual">Anual</button>
                  </div>
                  <p class="planes-hero-subtitle">Elige tu plan.</p>
                  <div class="planes-plans" id="planesList">
                      <div class="plan-card-small" data-plan="basico" data-credits="50" data-price="29" data-price-annual="290">
                          <h3 class="plan-card-name">Básico</h3>
                          <div class="plan-card-price">
                              <span class="price-monthly">$29<span>/mes</span></span>
                              <span class="price-annual">$290<span>/año</span></span>
                          </div>
                          <div class="plan-card-credits">50 créditos</div>
                          <ul class="plan-card-details">
                              <li>Uso personal y proyectos pequeños</li>
                              <li>Soporte por email</li>
                          </ul>
                      </div>
                      <div class="plan-card-small" data-plan="pro" data-credits="150" data-price="79" data-price-annual="790">
                          <h3 class="plan-card-name">Pro</h3>
                          <div class="plan-card-price">
                              <span class="price-monthly">$79<span>/mes</span></span>
                              <span class="price-annual">$790<span>/año</span></span>
                          </div>
                          <div class="plan-card-credits">150 créditos</div>
                          <ul class="plan-card-details">
                              <li>Freelancers y equipos pequeños</li>
                              <li>Uso moderado de contenido</li>
                          </ul>
                      </div>
                      <div class="plan-card-small" data-plan="enterprise" data-credits="500" data-price="199" data-price-annual="1990">
                          <h3 class="plan-card-name">Enterprise</h3>
                          <div class="plan-card-price">
                              <span class="price-monthly">$199<span>/mes</span></span>
                              <span class="price-annual">$1990<span>/año</span></span>
                          </div>
                          <div class="plan-card-credits">500 créditos</div>
                          <ul class="plan-card-details">
                              <li>Soporte prioritario</li>
                              <li>Personalización</li>
                          </ul>
                      </div>
                  </div>
                  <p class="planes-cta-login">
                      <a href="/login" class="planes-link-login">Iniciar sesión o registrarse</a>
                  </p>
              </div>
          </div>
      </div>
      </div>
    `;
  }

  async onEnter() {}

  async updateHeader() {}

  init() {
    const container = this.container;
    if (!container) return;

    const plansContainer = container.querySelector('#planesList');
    const toggleMonthly = container.querySelector('#toggleMonthly');
    const toggleAnnual = container.querySelector('#toggleAnnual');
    const hero = container.querySelector('.planes-hero');
    const billingTitle = container.querySelector('#planesBillingTitle');

    if (plansContainer) {
      this.addEventListener(plansContainer, 'click', (e) => {
        const card = e.target.closest('.plan-card-small');
        if (card) this.selectPlan(card);
      });
    }
    if (toggleMonthly && toggleAnnual && hero && billingTitle) {
      this.addEventListener(toggleMonthly, 'click', () => this.setBillingPeriod('monthly', hero, toggleMonthly, toggleAnnual, billingTitle));
      this.addEventListener(toggleAnnual, 'click', () => this.setBillingPeriod('annual', hero, toggleMonthly, toggleAnnual, billingTitle));
    }
  }

  setBillingPeriod(period, hero, btnMonthly, btnAnnual, titleEl) {
    this.billingPeriod = period;
    if (period === 'annual') {
      hero.classList.add('billing-annual');
      if (btnMonthly) btnMonthly.classList.remove('active');
      if (btnAnnual) btnAnnual.classList.add('active');
      if (titleEl) titleEl.textContent = 'Planes anuales';
    } else {
      hero.classList.remove('billing-annual');
      if (btnMonthly) btnMonthly.classList.add('active');
      if (btnAnnual) btnAnnual.classList.remove('active');
      if (titleEl) titleEl.textContent = 'Planes mensuales';
    }
    const sel = this.container?.querySelector('.plan-card-small.selected');
    if (sel) this.selectPlan(sel);
  }

  selectPlan(cardElement) {
    const allCards = this.container?.querySelectorAll('.plan-card-small') || [];
    allCards.forEach(card => card.classList.remove('selected'));
    cardElement.classList.add('selected');
    const priceKey = this.billingPeriod === 'annual' ? 'priceAnnual' : 'price';
    const price = cardElement.dataset[priceKey] != null
      ? parseFloat(cardElement.dataset[priceKey])
      : parseFloat(cardElement.dataset.price);
    this.selectedPlan = {
      name: cardElement.dataset.plan,
      credits: parseInt(cardElement.dataset.credits, 10) || 0,
      price: price,
      billing: this.billingPeriod
    };
  }
}

window.PlanesView = PlanesView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlanesView;
}
