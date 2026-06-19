/**
 * PlanesView — Página /plans profesional (2026 SaaS standard).
 *
 * 3 tiers (Creator/Team/Agency) — sin Free ni Enterprise (eliminados 2026-05-14).
 *
 * Stripe NO conectado: CTAs muestran "Billing is not connected yet" hasta integrar (Fase C).
 *
 * Fase A (2026-05-14): contexto del org en header (plan actual, créditos, storage,
 * próxima renovación), CTAs diferenciados Upgrade/Downgrade/Current/Trial, copy en inglés.
 */
class PlanesView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.selectedPlan = null;
    this.billingPeriod = 'annual'; // default = annual (research 2026)
    this.plans = [];
    this.currentSubscription = null;
    this.currentPlan = null;          // plan row asociado a la subscription activa
    this.orgCredits = null;           // { credits_available, credits_total }
    this.orgStorage = null;           // { used_mb, max_mb }
  }

  async onEnter() {}
  async updateHeader() {}

  async render() {
    await super.render();
    if (this._restoredFromCache) {
      this._bindEvents();
      this._loadAndRender({ background: true });
      return;
    }
    this._loadAndRender();
  }

  async _loadAndRender({ background = false } = {}) {
    try {
      const [plans] = await Promise.all([
        window.apiClient.query('plans:active', () => this._fetchPlans(), { ttl: 5 * 60 * 1000, staleWhileRevalidate: true }),
        this._loadCurrentSubscription(),
        this._loadOrgUsage(),
      ]);
      this.plans = Array.isArray(plans) ? plans : [];
      await this._resolveCurrentPlan();
      this._renderOrgContext();
      this._renderPlansList();
      this._applyBillingPeriod();
      if (!background) this._bindEvents();
    } catch (e) {
      console.error('PlanesView.loadPlans:', e);
      if (window.errorLogger) window.errorLogger.capture(e, { source: 'PlanesView._loadAndRender' });
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

  _resolveOrgId() {
    return window.currentOrgId
      || window.appState?.get('selectedOrganizationId')
      || localStorage.getItem('selectedOrganizationId')
      || null;
  }

  async _loadCurrentSubscription() {
    const orgId = this._resolveOrgId();
    if (!orgId) return;
    const supabase = await window.apiClient.getSupabase();
    if (!supabase) return;
    const { data } = await supabase
      .from('subscriptions')
      .select('plan_id, status, current_period_end')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    this.currentSubscription = data || null;
  }

  async _loadOrgUsage() {
    const orgId = this._resolveOrgId();
    if (!orgId) return;
    const supabase = await window.apiClient.getSupabase();
    if (!supabase) return;
    const [{ data: credits }, { data: storage }] = await Promise.all([
      supabase.from('organization_credits')
        .select('credits_available, credits_total').eq('organization_id', orgId).maybeSingle(),
      supabase.from('storage_usage')
        .select('used_mb, max_mb').eq('organization_id', orgId).maybeSingle(),
    ]);
    this.orgCredits = credits || null;
    this.orgStorage = storage || null;
  }

  /**
   * Resuelve el plan actual del org. Maneja el caso de planes legacy
   * (sub activa en un plan con is_active=false): los cargamos por id directo
   * para poder comparar display_order y mostrar Upgrade/Downgrade correctos.
   */
  async _resolveCurrentPlan() {
    if (!this.currentSubscription?.plan_id) { this.currentPlan = null; return; }
    const inList = this.plans.find(p => p.id === this.currentSubscription.plan_id);
    if (inList) { this.currentPlan = inList; return; }
    // Plan legacy (no is_active): fetch puntual por id.
    const supabase = await window.apiClient.getSupabase();
    if (!supabase) { this.currentPlan = null; return; }
    const { data } = await supabase
      .from('plans')
      .select('id, name, description, price_usd_month, price_usd_year, credits_monthly, max_handles, storage_mb, features, is_popular, display_order')
      .eq('id', this.currentSubscription.plan_id)
      .maybeSingle();
    this.currentPlan = data || null;
  }

  /** True si la subscription está en estado que cuenta como "activa" (no cancelled/expired). */
  _hasActiveSubscription() {
    const s = this.currentSubscription?.status;
    return s === 'active' || s === 'trialing' || s === 'past_due';
  }

  // ─── formatters ──────────────────────────────────────────────────────

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

  isCurrentPlan(plan) {
    return this.currentSubscription?.plan_id === plan.id && this._hasActiveSubscription();
  }

  /**
   * Clasifica el CTA según relación con plan actual:
   * - current: este es el plan activo → botón disabled "Current plan"
   * - upgrade: tier superior (display_order > current) → "Upgrade to X"
   * - downgrade: tier inferior (display_order < current) → "Downgrade to X"
   * - trial: sin subscription activa → "Start 14-day trial"
   */
  ctaForPlan(plan) {
    if (this.isCurrentPlan(plan)) {
      return { label: window.__('Plan actual'), icon: 'fa-check', kind: 'current' };
    }
    if (!this._hasActiveSubscription() || !this.currentPlan) {
      return { label: window.__('Iniciar prueba de 14 días'), icon: 'fa-arrow-right', kind: 'trial' };
    }
    const cur = Number(this.currentPlan.display_order) || 0;
    const tgt = Number(plan.display_order) || 0;
    if (tgt > cur) return { label: window.__('Mejorar a {nombre}', { nombre: plan.name }), icon: 'fa-arrow-up', kind: 'upgrade' };
    if (tgt < cur) return { label: window.__('Bajar a {nombre}', { nombre: plan.name }), icon: 'fa-arrow-down', kind: 'downgrade' };
    return { label: window.__('Cambiar a {nombre}', { nombre: plan.name }), icon: 'fa-exchange-alt', kind: 'switch' };
  }

  buildFeatureBullets(plan) {
    const items = [];
    if (plan.credits_monthly > 0) {
      items.push(`<strong>${plan.credits_monthly.toLocaleString('en-US')}</strong> ${window.__('créditos / mes')}`);
    }
    if (plan.max_handles > 0) {
      items.push(window.__('Hasta <strong>{n}</strong> marcas / perfiles', { n: plan.max_handles }));
    }
    const storage = this.formatStorage(plan.storage_mb);
    if (storage) items.push(`<strong>${storage}</strong> ${window.__('de Almacenamiento')}`);
    if (plan.features?.vera_full) items.push(window.__('Vera completa (chat + acciones)'));
    else if (plan.features?.vera_basic) items.push(window.__('Vera chat'));
    if (plan.features?.team_seats) items.push(`<strong>${plan.features.team_seats}</strong> ${window.__('miembros')}`);
    if (plan.features?.insights) items.push(window.__('Insights y analítica'));
    if (plan.features?.brand_kits) items.push(`<strong>${plan.features.brand_kits}</strong> ${window.__('brand kits')}`);
    if (plan.features?.sub_brands) items.push(window.__('Sub-marcas (multi-cliente)'));
    if (plan.features?.custom_domain) items.push(window.__('Dominio personalizado'));
    if (plan.features?.priority_support) items.push(window.__('Soporte prioritario'));
    return items;
  }

  // ─── render ──────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="planes-page">
        <header class="planes-hero">
          <h1 class="planes-hero-bg-word" aria-hidden="true">${window.__('PLANES')}</h1>
          <div class="planes-hero-content">
            <div class="planes-org-context glass-black" id="planesOrgContext" hidden></div>

            <div class="planes-billing-toggle" role="group" aria-label="${window.__('Periodo de facturación')}">
              <button type="button" class="planes-toggle-btn" data-billing="monthly" id="toggleMonthly">${window.__('Mensual')}</button>
              <button type="button" class="planes-toggle-btn active" data-billing="annual" id="toggleAnnual">
                ${window.__('Anual')} <span class="planes-toggle-discount">${window.__('Ahorra 20%')}</span>
              </button>
            </div>

            <div class="planes-plans" id="planesList">${this._planSkeletonHtml(3)}</div>
          </div>
        </header>
      </div>
    `;
  }

  _planSkeletonHtml(count = 5) {
    const card = `
      <div class="plan-card-small">
        <span class="skeleton skeleton-text skeleton-text--w50" style="height: 1.2em;"></span>
        <div class="plan-card-price"><span class="skeleton skeleton-text skeleton-text--lg skeleton-text--w35"></span></div>
        <span class="skeleton skeleton-text skeleton-text--w75"></span>
      </div>`;
    return Array.from({ length: count }, () => card).join('');
  }

  /** Renders the org context strip: org name, current plan, usage bars, renewal date. */
  _renderOrgContext() {
    const host = this.container?.querySelector('#planesOrgContext');
    if (!host) return;

    const orgId = this._resolveOrgId();
    if (!orgId) { host.hidden = true; return; }

    const orgName = (window.currentOrgName || '').trim();
    const planName = this.currentPlan?.name || (this._hasActiveSubscription() ? '—' : window.__('Sin plan activo'));
    const hasActive = this._hasActiveSubscription();

    const renewISO = this.currentSubscription?.current_period_end;
    const renewDate = renewISO ? new Date(renewISO) : null;
    const renewLabel = renewDate && !isNaN(renewDate.getTime())
      ? renewDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    const credits = this.orgCredits;
    const creditsBlock = credits && Number(credits.credits_total) > 0
      ? this._usageMeter({
          icon: 'fa-bolt',
          label: window.__('Créditos'),
          used: Number(credits.credits_total) - Number(credits.credits_available || 0),
          total: Number(credits.credits_total),
          formatter: (n) => Number(n).toLocaleString('en-US'),
        })
      : '';

    const storage = this.orgStorage;
    const storageBlock = storage && Number(storage.max_mb) > 0
      ? this._usageMeter({
          icon: 'fa-database',
          label: window.__('Almacenamiento'),
          used: Number(storage.used_mb) || 0,
          total: Number(storage.max_mb) || 0,
          formatter: (n) => this.formatStorage(n) || `${n} MB`,
        })
      : '';

    host.hidden = false;
    host.innerHTML = `
      <div class="planes-org-context-main">
        <div class="planes-org-context-org">
          <span class="planes-org-context-eyebrow">${hasActive ? window.__('Plan actual') : window.__('Sin plan activo para')}</span>
          <span class="planes-org-context-plan">${this.escapeHtml(orgName ? `${orgName} · ${planName}` : planName)}</span>
        </div>
        ${renewLabel ? `<div class="planes-org-context-renew"><i class="fas fa-sync-alt"></i> ${window.__('Renueva el')} ${this.escapeHtml(renewLabel)}</div>` : ''}
      </div>
      ${(creditsBlock || storageBlock) ? `<div class="planes-org-context-usage">${creditsBlock}${storageBlock}</div>` : ''}
    `;
  }

  _usageMeter({ icon, label, used, total, formatter }) {
    const safeTotal = Math.max(0, total);
    const safeUsed  = Math.min(Math.max(0, used), safeTotal);
    const pct = safeTotal > 0 ? Math.round((safeUsed / safeTotal) * 100) : 0;
    const fmt = formatter || ((n) => String(n));
    const danger = pct >= 90 ? ' is-danger' : pct >= 75 ? ' is-warning' : '';
    return `
      <div class="planes-usage-meter${danger}">
        <div class="planes-usage-meter-head">
          <span class="planes-usage-meter-label"><i class="fas ${icon}"></i> ${this.escapeHtml(label)}</span>
          <span class="planes-usage-meter-value">${this.escapeHtml(fmt(safeUsed))} <span>/ ${this.escapeHtml(fmt(safeTotal))}</span></span>
        </div>
        <div class="planes-usage-meter-bar"><span style="width:${pct}%"></span></div>
      </div>
    `;
  }

  _renderPlansList() {
    const container = this.container?.querySelector('#planesList');
    if (!container) return;
    if (!this.plans.length) {
      container.innerHTML = this.emptyState({
        iconSrc: '/recursos/icons/Planes.svg',
        icon: 'fa-bolt',
        title: window.__('No hay planes disponibles.'),
        subtitle: window.__('Aún no hay planes para mostrar. Vuelve más tarde o contáctanos si necesitas un plan a medida.'),
      });
      return;
    }
    container.innerHTML = this.plans.map((plan) => this._planCardHtml(plan)).join('');
  }

  _planCardHtml(plan) {
    const { monthly, annual } = this.formatPrice(plan);
    const monthlyEquivalent = annual > 0 ? Math.round(annual / 12) : monthly;
    const features = this.buildFeatureBullets(plan);
    const cta = this.ctaForPlan(plan);
    const current = this.isCurrentPlan(plan);

    const classes = [
      'plan-card-small',
      'glass-black',
      plan.is_popular ? 'plan-card-small--popular' : '',
      current ? 'plan-card-small--current' : '',
    ].filter(Boolean).join(' ');

    const priceBlock = `
      <div class="plan-card-price">
        <span class="price-monthly">$${monthly}<span>${window.__('/mes')}</span></span>
        <span class="price-annual">
          $${monthlyEquivalent}<span>${window.__('/mes')}</span>
          <small>${window.__('facturado anualmente')} · $${annual.toLocaleString('en-US')}${window.__('/año')}</small>
        </span>
      </div>`;

    const badges = [];
    if (current) badges.push(`<span class="plan-card-badge plan-card-badge--current">${window.__('Plan actual')}</span>`);
    else if (plan.is_popular) badges.push(`<span class="plan-card-badge">${window.__('Recomendado')}</span>`);

    // En la card del plan actual no renderizamos botón: queda un status footer
    // discreto en su lugar (el badge "Current plan" arriba ya identifica la card).
    const ctaBlock = current
      ? `<div class="plan-card-current-status"><i class="fas fa-check-circle"></i> ${window.__('Estás en este plan')}</div>`
      : `<button type="button"
          class="btn btn-primary plan-card-cta plan-card-cta--${cta.kind}"
          data-plan="${plan.id}"
          data-cta="${cta.kind}">
          <i class="fas ${cta.icon}"></i> ${cta.label}
        </button>`;

    return `
      <div class="${classes}" data-plan="${plan.id}">
        ${badges.join('')}
        <h3 class="plan-card-name">${this.escapeHtml(plan.name || '')}</h3>
        ${plan.description ? `<p class="plan-card-desc">${this.escapeHtml(plan.description)}</p>` : ''}
        ${priceBlock}
        <ul class="plan-card-details">
          ${features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        ${ctaBlock}
      </div>
    `;
  }

  // ─── events ──────────────────────────────────────────────────────────

  _bindEvents() {
    const container = this.container;
    if (!container) return;

    const toggleMonthly = container.querySelector('#toggleMonthly');
    const toggleAnnual = container.querySelector('#toggleAnnual');
    if (toggleMonthly && toggleAnnual) {
      this.addEventListener(toggleMonthly, 'click', () => this._setBillingPeriod('monthly'));
      this.addEventListener(toggleAnnual,  'click', () => this._setBillingPeriod('annual'));
    }

    container.querySelectorAll('.plan-card-cta').forEach((btn) => {
      this.addEventListener(btn, 'click', (e) => this._onCtaClick(e));
    });
  }

  init() { this._bindEvents(); }

  _setBillingPeriod(period) {
    this.billingPeriod = period;
    this._applyBillingPeriod();
  }

  _applyBillingPeriod() {
    const root = this.container;
    if (!root) return;
    const isAnnual = this.billingPeriod === 'annual';
    root.querySelector('#toggleMonthly')?.classList.toggle('active', !isAnnual);
    root.querySelector('#toggleAnnual')?.classList.toggle('active', isAnnual);
    // CSS rules target .planes-page.billing-annual y .planes-hero.billing-annual
    // — no el container padre. Toggle en los elementos correctos.
    root.querySelector('.planes-page')?.classList.toggle('billing-annual', isAnnual);
    root.querySelector('.planes-hero')?.classList.toggle('billing-annual', isAnnual);
  }

  _onCtaClick(e) {
    const btn = e.currentTarget;
    const kind = btn.getAttribute('data-cta');
    const planId = btn.getAttribute('data-plan');
    this._handleCtaKind(kind, planId);
  }

  _handleCtaKind(kind, planId) {
    if (kind === 'current') return;
    if (!window.billingService) {
      const msg = window.__('Billing service no disponible. Recarga la página.');
      if (window.showToast) window.showToast(msg, 'error'); else alert(msg);
      return;
    }
    const billing = this.billingPeriod === 'annual' ? 'year' : 'month';
    window.billingService.startCheckout({
      target:  'subscription',
      planId,
      billing,
      gateway: 'auto',
    });
  }
}

window.PlanesView = PlanesView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlanesView;
}
