/**
 * PlanesView - Vista de planes (solo visualización y selección).
 * Lee planes activos desde la tabla `plans` (Supabase) con price_usd_month
 * y price_usd_year. Registro/login se hacen en /login (SignInView).
 */
class PlanesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.selectedPlan = null;
    this.billingPeriod = 'monthly';
    this.plans = [];
    this.supabase = null;
  }

  async onEnter() {}

  async updateHeader() {}

  async render() {
    await super.render();
    await this.initSupabase();
    await this.loadPlans();
    this.renderPlansList();
    this.init();
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      } else if (typeof waitForSupabase === 'function') {
        this.supabase = await waitForSupabase();
      }
    } catch (e) {
      console.error('PlanesView initSupabase:', e);
    }
  }

  async loadPlans() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('plans')
        .select('id, name, description, price_usd_month, price_usd_year, credits_monthly, max_handles, storage_mb, features, is_popular, display_order, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      this.plans = data || [];
    } catch (e) {
      console.error('PlanesView loadPlans:', e);
      this.plans = [];
    }
  }

  formatStorage(mb) {
    if (!mb || mb <= 0) return null;
    if (mb >= 1024) {
      const gb = mb / 1024;
      return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
    }
    return `${mb} MB`;
  }

  formatPrice(plan) {
    const monthly = Number(plan.price_usd_month) || 0;
    const annual = plan.price_usd_year != null
      ? (Number(plan.price_usd_year) || 0)
      : monthly * 10;
    return { monthly, annual };
  }

  buildFeatureList(plan) {
    const items = [];
    if (plan.credits_monthly > 0) {
      items.push(`${plan.credits_monthly.toLocaleString('es')} créditos/mes`);
    }
    if (plan.max_handles > 0) {
      items.push(`${plan.max_handles} handles`);
    }
    const storage = this.formatStorage(plan.storage_mb);
    if (storage) items.push(`${storage} de almacenamiento`);
    if (plan.features?.trial) {
      items.push(`Prueba gratis ${plan.features.duration_days || 14} días`);
    }
    if (plan.description) items.push(plan.description);
    return items;
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
                      <div class="planes-loading" style="padding:32px;text-align:center;color:var(--text-muted);">Cargando planes…</div>
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

  renderPlansList() {
    const container = this.container?.querySelector('#planesList');
    if (!container) return;
    if (!this.plans.length) {
      container.innerHTML = `<div class="planes-empty" style="padding:32px;text-align:center;color:var(--text-muted);">No hay planes disponibles.</div>`;
      return;
    }
    const cards = this.plans.map((plan) => {
      const { monthly, annual } = this.formatPrice(plan);
      const features = this.buildFeatureList(plan);
      const popularClass = plan.is_popular ? ' plan-card-small--popular' : '';
      const popularBadge = plan.is_popular ? '<span class="plan-card-badge">Recomendado</span>' : '';
      return `
        <div class="plan-card-small${popularClass}" data-plan="${plan.id}" data-credits="${plan.credits_monthly}" data-price="${monthly}" data-price-annual="${annual}">
          ${popularBadge}
          <h3 class="plan-card-name">${plan.name}</h3>
          <div class="plan-card-price">
            <span class="price-monthly">$${monthly}<span>/mes</span></span>
            <span class="price-annual">$${annual}<span>/año</span></span>
          </div>
          <div class="plan-card-credits">${plan.credits_monthly > 0 ? `${plan.credits_monthly.toLocaleString('es')} créditos` : '—'}</div>
          <ul class="plan-card-details">
            ${features.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>
      `;
    }).join('');
    container.innerHTML = cards;
  }

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
