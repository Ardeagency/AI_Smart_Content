/**
 * PlanesView — Página /plans profesional (2026 SaaS standard).
 *
 * 3 tiers (Creator/Team/Agency) — sin Free ni Enterprise (eliminados 2026-05-14).
 *
 * Stripe NO conectado: CTAs marcan "Próximamente" hasta integrar.
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
      ]);
      this.plans = Array.isArray(plans) ? plans : [];
      this._renderPlansList();
      this._renderComparisonTable();
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

  async _loadCurrentSubscription() {
    const orgId = window.currentOrgId
      || window.appState?.get('selectedOrganizationId')
      || localStorage.getItem('selectedOrganizationId');
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
    return this.currentSubscription?.plan_id === plan.id
      && this.currentSubscription?.status === 'active';
  }

  ctaForPlan(plan) {
    if (this.isCurrentPlan(plan)) return { label: 'Plan actual', icon: 'fa-check', kind: 'current' };
    return { label: 'Empezar prueba 14 días', icon: 'fa-arrow-right', kind: 'trial' };
  }

  buildFeatureBullets(plan) {
    const items = [];
    if (plan.credits_monthly > 0) {
      items.push(`<strong>${plan.credits_monthly.toLocaleString('es')}</strong> créditos / mes`);
    }
    if (plan.max_handles > 0) {
      items.push(`Hasta <strong>${plan.max_handles}</strong> marcas / handles`);
    }
    const storage = this.formatStorage(plan.storage_mb);
    if (storage) items.push(`<strong>${storage}</strong> de Storage`);
    if (plan.features?.vera_full) items.push(`Vera completo (chat + acciones)`);
    else if (plan.features?.vera_basic) items.push(`Vera chat`);
    if (plan.features?.team_seats) items.push(`<strong>${plan.features.team_seats}</strong> miembros`);
    if (plan.features?.insights) items.push(`Insights & analytics`);
    if (plan.features?.brand_kits) items.push(`<strong>${plan.features.brand_kits}</strong> brand kits`);
    if (plan.features?.sub_brands) items.push(`Sub-marcas (multi-cliente)`);
    if (plan.features?.custom_domain) items.push(`Custom domain`);
    if (plan.features?.priority_support) items.push(`Soporte prioritario`);
    return items;
  }

  // ─── render ──────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="planes-page">
        <header class="planes-hero">
          <div class="planes-hero-background"><div class="planes-background-gradient"></div></div>
          <div class="planes-hero-content">
            <h1 class="planes-hero-title">Precios simples para equipos serios</h1>
            <p class="planes-hero-subtitle">Prueba 14 días sin tarjeta. Cancela cuando quieras.</p>

            <div class="planes-billing-toggle" role="group" aria-label="Tipo de facturación">
              <button type="button" class="planes-toggle-btn" data-billing="monthly" id="toggleMonthly">Mensual</button>
              <button type="button" class="planes-toggle-btn active" data-billing="annual" id="toggleAnnual">
                Anual <span class="planes-toggle-discount">Ahorra 20%</span>
              </button>
            </div>

            <div class="planes-plans" id="planesList">${this._planSkeletonHtml(5)}</div>
          </div>
        </header>

        <!-- Trust strip — TODO: reemplazar placeholders con logos reales -->
        <section class="planes-trust-strip">
          <p class="planes-trust-eyebrow">Equipos que confían en AI Smart Content</p>
          <div class="planes-trust-logos">
            <span class="planes-trust-logo-slot" data-todo="logo-1">{{LOGO_1}}</span>
            <span class="planes-trust-logo-slot" data-todo="logo-2">{{LOGO_2}}</span>
            <span class="planes-trust-logo-slot" data-todo="logo-3">{{LOGO_3}}</span>
            <span class="planes-trust-logo-slot" data-todo="logo-4">{{LOGO_4}}</span>
            <span class="planes-trust-logo-slot" data-todo="logo-5">{{LOGO_5}}</span>
          </div>
        </section>

        <!-- Testimonial — TODO: reemplazar con quote real + foto -->
        <section class="planes-testimonial">
          <blockquote class="planes-testimonial-quote">
            "{{TESTIMONIO — quote de 2-3 líneas de un cliente real, idealmente CMO o Head of Content de una marca conocida}}"
          </blockquote>
          <div class="planes-testimonial-attribution">
            <span class="planes-testimonial-avatar" data-todo="testimonial-avatar"></span>
            <div>
              <div class="planes-testimonial-name">{{NOMBRE}}</div>
              <div class="planes-testimonial-role">{{ROL · EMPRESA}}</div>
            </div>
          </div>
        </section>

        <!-- Comparison table -->
        <section class="planes-comparison">
          <h2 class="planes-comparison-title">Compara los planes en detalle</h2>
          <div id="planesComparison"></div>
        </section>

        <!-- FAQ -->
        <section class="planes-faq">
          <h2 class="planes-faq-title">Preguntas frecuentes</h2>
          <div class="planes-faq-list">${this._faqHtml()}</div>
        </section>

        <!-- Final CTA -->
        <section class="planes-final-cta">
          <h2>¿Listo para empezar?</h2>
          <p>Prueba 14 días sin tarjeta. Cancela cuando quieras.</p>
          <div class="planes-final-cta-actions">
            <button type="button" class="btn btn-primary" id="finalCtaTrial">Empezar prueba 14 días</button>
          </div>
        </section>
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

  _renderPlansList() {
    const container = this.container?.querySelector('#planesList');
    if (!container) return;
    if (!this.plans.length) {
      container.innerHTML = `<div class="planes-empty">No hay planes disponibles.</div>`;
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
      plan.is_popular ? 'plan-card-small--popular' : '',
      current ? 'plan-card-small--current' : '',
    ].filter(Boolean).join(' ');

    const priceBlock = `
      <div class="plan-card-price">
        <span class="price-monthly">$${monthly}<span>/mes</span></span>
        <span class="price-annual">
          $${monthlyEquivalent}<span>/mes</span>
          <small>facturado anual · $${annual.toLocaleString('es')}/año</small>
        </span>
      </div>`;

    const badges = [];
    if (current) badges.push('<span class="plan-card-badge plan-card-badge--current">Plan actual</span>');
    else if (plan.is_popular) badges.push('<span class="plan-card-badge">Recomendado</span>');

    return `
      <div class="${classes}" data-plan="${plan.id}">
        ${badges.join('')}
        <h3 class="plan-card-name">${this.escapeHtml(plan.name || '')}</h3>
        ${plan.description ? `<p class="plan-card-desc">${this.escapeHtml(plan.description)}</p>` : ''}
        ${priceBlock}
        <ul class="plan-card-details">
          ${features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <button type="button"
          class="btn ${current ? 'btn-secondary' : 'btn-primary'} plan-card-cta"
          data-plan="${plan.id}"
          data-cta="${cta.kind}"
          ${current ? 'disabled' : ''}>
          <i class="fas ${cta.icon}"></i> ${cta.label}
        </button>
      </div>
    `;
  }

  _renderComparisonTable() {
    const host = this.container?.querySelector('#planesComparison');
    if (!host) return;
    if (!this.plans.length) { host.innerHTML = ''; return; }

    const rows = [
      { section: 'Volumen' },
      { label: 'Créditos / mes',          get: (p) => p.credits_monthly > 0 ? p.credits_monthly.toLocaleString('es') : '—' },
      { label: 'Marcas / handles',        get: (p) => p.max_handles > 0 ? p.max_handles : '—' },
      { label: 'Storage',                 get: (p) => this.formatStorage(p.storage_mb) || '—' },
      { label: 'Miembros',                get: (p) => p.features?.team_seats || '1' },

      { section: 'Vera (asistente IA)' },
      { label: 'Chat con Vera',           get: (p) => p.features?.vera_full || p.features?.vera_basic ? '✓' : '—' },
      { label: 'Acciones autónomas',      get: (p) => p.features?.vera_full ? '✓' : '—' },

      { section: 'Contenido' },
      { label: 'Studio (imágenes)',       get: () => '✓' },
      { label: 'Video',                   get: () => '✓' },
      { label: 'Production flows',        get: () => '✓' },

      { section: 'Brand & Analytics' },
      { label: 'Brand kits',              get: (p) => p.features?.brand_kits || '—' },
      { label: 'Sub-marcas (agencia)',    get: (p) => p.features?.sub_brands ? '✓' : '—' },
      { label: 'Insights & analytics',    get: (p) => p.features?.insights ? '✓' : '—' },

      { section: 'Soporte' },
      { label: 'Soporte prioritario',     get: (p) => p.features?.priority_support ? '✓' : '—' },
      { label: 'Custom domain',           get: (p) => p.features?.custom_domain ? '✓' : '—' },
    ];

    host.innerHTML = `
      <div class="planes-comparison-table-wrap">
        <table class="planes-comparison-table">
          <thead>
            <tr>
              <th scope="col"></th>
              ${this.plans.map((p) => `<th scope="col">${this.escapeHtml(p.name)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              if (r.section) {
                return `<tr class="planes-comparison-section"><th colspan="${this.plans.length + 1}">${this.escapeHtml(r.section)}</th></tr>`;
              }
              return `
                <tr>
                  <th scope="row">${this.escapeHtml(r.label)}</th>
                  ${this.plans.map((p) => `<td>${r.get(p)}</td>`).join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  _faqHtml() {
    const items = [
      {
        q: '¿Qué es un crédito y cuánto cuesta cada acción?',
        a: 'Un crédito es la unidad universal de consumo. Imagen Studio ≈ 10 cr, Video corto ≈ 100 cr, Vera chat ≈ 1 cr. Antes de cada generación verás el costo estimado. Lista completa en la página de Créditos dentro del producto.'
      },
      {
        q: '¿Los créditos hacen rollover?',
        a: 'Sí. En planes mensuales rollover de 1 mes (no se pierden al renovar inmediatamente). Los packs comprados aparte expiran a los 12 meses — más que la industria.'
      },
      {
        q: '¿Qué pasa si me quedo sin créditos a mitad de mes?',
        a: 'Puedes comprar un pack extra (single payment, no cambia tu plan) o activar auto-recarga que compra créditos cuando bajas de un umbral que tú defines.'
      },
      {
        q: '¿Puedo cambiar de plan, pausar o cancelar cuando quiera?',
        a: 'Sí. Upgrade aplica inmediato con prorrateo. Downgrade aplica al siguiente ciclo. Cancelación 1 click sin guilt-tripping ni llamadas obligatorias.'
      },
      {
        q: '¿Cuánto ahorro con plan anual?',
        a: '20% vs mensual. Equivale a 2.4 meses gratis al año.'
      },
      {
        q: '¿Hay reembolsos?',
        a: 'La prueba de 14 días no requiere tarjeta. Tras facturar te damos 7 días para reembolso si no funcionó. Sin letra pequeña.'
      },
      {
        q: '¿Usan mi data de marca para entrenar modelos?',
        a: 'No. Los modelos provienen de proveedores (OpenAI, Anthropic, etc.) y tu data nunca alimenta entrenamientos globales. Para acuerdos custom (DPA, compliance) contáctanos.'
      },
      {
        q: '¿Quién es dueño del contenido que genero?',
        a: 'Tú. Total propiedad comercial en todos los planes.'
      },
      {
        q: '¿Vera habla mi idioma?',
        a: 'Vera entiende y responde en español, inglés y portugués hoy. Pídenos roadmap para otros idiomas.'
      },
    ];
    return items.map((it, idx) => `
      <details class="planes-faq-item" data-idx="${idx}">
        <summary class="planes-faq-q">${this.escapeHtml(it.q)}</summary>
        <p class="planes-faq-a">${this.escapeHtml(it.a)}</p>
      </details>
    `).join('');
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

    const finalTrial = container.querySelector('#finalCtaTrial');
    if (finalTrial) this.addEventListener(finalTrial, 'click', () => this._handleCtaKind('trial', null));
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
    root.classList.toggle('billing-annual', isAnnual);
  }

  _onCtaClick(e) {
    const btn = e.currentTarget;
    const kind = btn.getAttribute('data-cta');
    const planId = btn.getAttribute('data-plan');
    this._handleCtaKind(kind, planId);
  }

  _handleCtaKind(kind, planId) {
    if (kind === 'current') return;
    const msg = 'Stripe no está conectado todavía. Próximamente podrás iniciar la prueba de 14 días aquí.';
    if (window.showToast) window.showToast(msg, 'info');
    else alert(msg);
  }
}

window.PlanesView = PlanesView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlanesView;
}
