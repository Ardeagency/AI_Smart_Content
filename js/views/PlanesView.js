/**
 * PlanesView — Vista de planes (solo visualización y selección).
 *
 * Piloto de la fundación premium:
 *   - `static cacheable = true`        → al volver atrás, restaura HTML+scroll instant.
 *   - `apiClient.query()`              → planes en cache 5 min con SWR. La 2ª visita
 *                                        es instantánea y refresca en background.
 *   - Skeleton screens en lugar de "Cargando planes…" (perceived perf).
 *   - ErrorLogger captura fallos del fetch en prod.
 *
 * Schema: tabla `plans` (Supabase) con price_usd_month / price_usd_year. Registro
 * y login se hacen en /login (SignInView).
 */
class PlanesView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.selectedPlan = null;
    this.billingPeriod = 'monthly';
    this.plans = [];
  }

  async onEnter() {}

  // El header del shell no aplica en esta vista (es pre-login y/o pública).
  async updateHeader() {}

  async render() {
    await super.render();
    // Si estamos restaurando desde bfCache, el HTML ya está pintado: solo
    // refrescamos data en background y rebindeamos. Evita el "salto" visual.
    if (this._restoredFromCache) {
      this._bindEvents();
      this._loadAndRender({ background: true });
      return;
    }
    this._loadAndRender();
  }

  // ─────────────────────────────────────── data layer (apiClient)

  async _loadAndRender({ background = false } = {}) {
    try {
      const plans = await window.apiClient.query(
        'plans:active',
        () => this._fetchPlans(),
        { ttl: 5 * 60 * 1000, staleWhileRevalidate: true }
      );
      this.plans = Array.isArray(plans) ? plans : [];
      this._renderPlansList();
      if (!background) this._bindEvents();
    } catch (e) {
      console.error('PlanesView.loadPlans:', e);
      if (window.errorLogger) {
        window.errorLogger.capture(e, { source: 'PlanesView._loadAndRender' });
      }
      this.plans = [];
      this._renderPlansList();
    }
  }

  async _fetchPlans() {
    const supabase = await window.apiClient.getSupabase();
    if (!supabase) throw new Error('Supabase no disponible');
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, description, price_usd_month, price_usd_year, credits_monthly, max_handles, storage_mb, features, is_popular, display_order, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // ─────────────────────────────────────── formatters

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

  // ─────────────────────────────────────── markup

  /**
   * Esqueleto inicial: 4 cards con el shape final de un plan. Cuando llega
   * la data del apiClient, se reemplaza por las cards reales sin "salto".
   */
  _planSkeletonHtml(count = 4) {
    const card = `
      <div class="plan-card-small">
        <span class="skeleton skeleton-text skeleton-text--w50" style="height: 1.2em;"></span>
        <div class="plan-card-price">
          <span class="skeleton skeleton-text skeleton-text--lg skeleton-text--w35"></span>
        </div>
        <span class="skeleton skeleton-text skeleton-text--w75"></span>
        <ul class="plan-card-details" style="list-style:none;padding:0;margin:0.5rem 0 0;display:flex;flex-direction:column;gap:0.45rem;">
          <li><span class="skeleton skeleton-text skeleton-text--w90"></span></li>
          <li><span class="skeleton skeleton-text skeleton-text--w75"></span></li>
          <li><span class="skeleton skeleton-text skeleton-text--w50"></span></li>
        </ul>
      </div>`;
    return Array.from({ length: count }, () => card).join('');
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
                  <div class="planes-plans" id="planesList">${this._planSkeletonHtml(4)}</div>
                  <p class="planes-cta-login">
                      <a href="/login" class="planes-link-login">Iniciar sesión o registrarse</a>
                  </p>
              </div>
          </div>
      </div>
      </div>
    `;
  }

  _renderPlansList() {
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
          <h3 class="plan-card-name">${this.escapeHtml(plan.name || '')}</h3>
          <div class="plan-card-price">
            <span class="price-monthly">$${monthly}<span>/mes</span></span>
            <span class="price-annual">$${annual}<span>/año</span></span>
          </div>
          <div class="plan-card-credits">${plan.credits_monthly > 0 ? `${plan.credits_monthly.toLocaleString('es')} créditos` : '—'}</div>
          <ul class="plan-card-details">
            ${features.map(f => `<li>${this.escapeHtml(String(f))}</li>`).join('')}
          </ul>
        </div>
      `;
    }).join('');
    container.innerHTML = cards;
  }

  // ─────────────────────────────────────── events

  _bindEvents() {
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

  /** Alias retro-compat: cualquier llamada externa a init() sigue funcionando. */
  init() { this._bindEvents(); }

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
