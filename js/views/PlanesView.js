/**
 * PlanesView — Página /plans profesional (2026 SaaS standard).
 *
 * Corte ADR-0052 (16/09): la vista lee TODO de `window.PlanesDatos`
 * (js/services/PlanesDataService.js) sobre la base nueva: billing.plans +
 * prices + plan_capabilities (la llave es el tier), la suscripción de la marca,
 * `acceso_por_suscripcion`, el saldo (`available`) y `public.storage_usage`.
 * Cambiar de plan o cancelar NO tiene puerta para una persona (decisión de JC,
 * planes.md): los CTA abren «escríbenos», nunca un checkout que no existe.
 *
 * Fase A (2026-05-14): contexto del org en header (plan actual, créditos, storage,
 * próxima renovación), CTAs diferenciados Upgrade/Downgrade/Current/Trial.
 */
class PlanesView extends BaseView {
  /** Idioma activo para fechas y números (ADR-0040: Intl con el locale de la persona, no 'en-US' fijo). */
  static _loc() { return (window.i18n?.getLocale?.() === 'en' ? 'en-US' : 'es-CO'); }

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
      const datos = window.PlanesDatos ? await window.PlanesDatos.cargar(this._resolveOrgId()) : null;
      this.plans = datos?.plans || [];
      this.currentSubscription = datos?.currentSubscription || null;
      this.currentPlan = datos?.currentPlan || null;
      this.acceso = datos?.acceso || null;
      this.orgCredits = datos?.orgCredits || null;
      this.orgStorage = datos?.orgStorage || null;
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

  _resolveOrgId() {
    return this.routeParams?.orgId || window.currentOrgId || null; // de la ruta (L7), no de localStorage
  }

  /** True si la subscription está en estado que cuenta como "activa" (no cancelled/expired). */
  _hasActiveSubscription() {
    const s = this.currentSubscription?.status;
    return s === 'active' || s === 'trialing' || s === 'past_due';
  }

  // ─── formatters ──────────────────────────────────────────────────────

  formatStorage(mb) {
    if (mb == null || mb <= 0) return null;
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
      return { label: window.__('Plan actual'), icon: 'aisc-ico aisc-ico--check', kind: 'current' };
    }
    if (!this._hasActiveSubscription() || !this.currentPlan) {
      return { label: window.__('Iniciar prueba de 14 días'), icon: 'aisc-ico aisc-ico--arrow-right', kind: 'trial' };
    }
    const cur = Number(this.currentPlan.display_order) || 0;
    const tgt = Number(plan.display_order) || 0;
    if (tgt > cur) return { label: window.__('Mejorar a {nombre}', { nombre: plan.name }), icon: 'aisc-ico aisc-ico--arrow-up', kind: 'upgrade' };
    if (tgt < cur) return { label: window.__('Bajar a {nombre}', { nombre: plan.name }), icon: 'aisc-ico aisc-ico--arrow-down', kind: 'downgrade' };
    return { label: window.__('Cambiar a {nombre}', { nombre: plan.name }), icon: 'aisc-ico aisc-ico--refresh', kind: 'switch' };
  }

  buildFeatureBullets(plan) {
    const items = [];
    if (plan.credits_monthly > 0) {
      items.push(`<strong>${plan.credits_monthly.toLocaleString(PlanesView._loc())}</strong> ${window.__('créditos / mes')}`);
    }
    if (plan.max_handles > 0) {
      items.push(window.__('Hasta <strong>{n}</strong> mercados', { n: plan.max_handles }));
    }
    const storage = this.formatStorage(plan.storage_mb);
    if (storage) items.push(`<strong>${storage}</strong> ${window.__('de Almacenamiento')}`);
    else if (plan.sin_limite_almacenamiento) items.push(window.__('Almacenamiento sin límite'));
    if (plan.features?.team_seats) items.push(`<strong>${plan.features.team_seats}</strong> ${window.__('miembros')}`);
    // Capacidades del plan (billing.plan_capabilities): la etiqueta la pone la consola, el dato la base.
    const etiquetas = window.PlanesDatos?.CAPACIDADES || {};
    (plan.features?.capacidades || []).forEach((cap) => items.push(this.escapeHtml(window.__(etiquetas[cap] || cap))));
    return items;
  }

  // ─── render ──────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="planes-page">
        <header class="planes-hero">
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
      ? renewDate.toLocaleDateString(PlanesView._loc(), { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    const credits = this.orgCredits;
    const creditsBlock = credits && Number(credits.credits_total) > 0
      ? this._usageMeter({
          icon: 'aisc-ico aisc-ico--zap',
          label: window.__('Créditos'),
          used: Number(credits.credits_total) - Number(credits.credits_available || 0),
          total: Number(credits.credits_total),
          formatter: (n) => Number(n).toLocaleString(PlanesView._loc()),
        })
      : '';

    const storage = this.orgStorage;
    let storageBlock = '';
    if (storage && Number(storage.max_mb) > 0) {
      storageBlock = this._usageMeter({
        icon: 'aisc-ico aisc-ico--database',
        label: window.__('Almacenamiento'),
        used: Number(storage.used_mb) || 0,
        total: Number(storage.max_mb) || 0,
        formatter: (n) => this.formatStorage(n) || `${n} MB`,
      });
    } else if (storage && storage.max_mb == null) {
      // Tope NULO en billing.plans = sin límite (decisión escrita en la base).
      storageBlock = `<div class="planes-usage-meter"><div class="planes-usage-meter-head"><span class="planes-usage-meter-label"><i class="fas aisc-ico aisc-ico--database"></i> ${window.__('Almacenamiento')}</span><span class="planes-usage-meter-value">${this.escapeHtml(this.formatStorage(Number(storage.used_mb) || 0) || '0 MB')} <span>· ${window.__('sin límite')}</span></span></div></div>`;
    }

    host.hidden = false;
    host.innerHTML = `
      <div class="planes-org-context-main">
        <div class="planes-org-context-org">
          <span class="planes-org-context-eyebrow">${hasActive ? window.__('Plan actual') : window.__('Sin plan activo para')}</span>
          <span class="planes-org-context-plan">${this.escapeHtml(orgName ? `${orgName} · ${planName}` : planName)}</span>
        </div>
        ${renewLabel ? `<div class="planes-org-context-renew"><i class="aisc-ico aisc-ico--refresh"></i> ${window.__('Renueva el')} ${this.escapeHtml(renewLabel)}</div>` : ''}
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
        <div class="planes-usage-meter-bar"><span style="transform:scaleX(${(Number(pct) || 0) / 100})"></span></div>
      </div>
    `;
  }

  _renderPlansList() {
    const container = this.container?.querySelector('#planesList');
    if (!container) return;
    if (!this.plans.length) {
      container.innerHTML = this.emptyState({
        iconSrc: '/recursos/icons/Planes.svg',
        icon: 'aisc-ico aisc-ico--zap',
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
          <small>${window.__('facturado anualmente')} · $${annual.toLocaleString(PlanesView._loc())}${window.__('/año')}</small>
        </span>
      </div>`;

    const badges = [];
    if (current) badges.push(`<span class="plan-card-badge plan-card-badge--current">${window.__('Plan actual')}</span>`);
    else if (plan.is_popular) badges.push(`<span class="plan-card-badge">${window.__('Recomendado')}</span>`);

    // En la card del plan actual no renderizamos botón: queda un status footer
    // discreto en su lugar (el badge "Current plan" arriba ya identifica la card).
    const ctaBlock = current
      ? `<div class="plan-card-current-status"><i class="aisc-ico aisc-ico--check"></i> ${window.__('Estás en este plan')}</div>`
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

  init() {
    this._bindEvents();
    this._starfield = window.Starfield ? new window.Starfield() : null;
    if (this._starfield) this._starfield.start();
  }

  /** El router llama destroy() al cambiar de ruta: sin esto el rAF y el canvas
   *  sobreviven a la vista y siguen pintando sobre las demas paginas. */
  destroy() {
    if (this._starfield) {
      this._starfield.stop();
      this._starfield = null;
    }
    super.destroy();
  }

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
    // Cambiar de plan no tiene puerta para una persona en la base nueva (planes.md):
    // se pide por escrito y lo aplica la plataforma. Nunca un botón que promete.
    if (!window.PlanesDatos?.puedeCambiarPlan()) {
      const plan = this.plans.find((p) => p.id === planId);
      const msg = window.__('Para cambiar al plan {nombre} escríbenos a contact@aismartcontent.io y lo activamos por ti.', { nombre: plan?.name || planId });
      window.showToast(msg, { type: 'info' });
      return;
    }
  }
}

window.PlanesView = PlanesView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlanesView;
}
