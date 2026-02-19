/**
 * PlanesView - Vista de planes (solo visualización y selección).
 * Registro e inicio de sesión se hacen en /login (SignInView).
 */
class PlanesView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'planes.html';
    this.selectedPlan = null;
    this.billingPeriod = 'monthly';
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
