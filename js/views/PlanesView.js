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
/**
 * PlanesStarfield — el cielo de /plans: puntos que caen hacia el centro.
 *
 * Por que canvas y no CSS: el campo anterior eran mosaicos de radial-gradient a
 * la deriva. Un mosaico no puede tener particulas que NAZCAN en el borde, se
 * aceleren hacia un punto y MUERAN ahi — cada punto necesita su propia posicion,
 * su propia edad y su propia velocidad. Con DOM serian ~140 nodos animandose a
 * 60fps; en canvas es un solo elemento y ~140 arcos por cuadro, que no le pesa
 * a nadie.
 *
 * El movimiento no es un zoom: cada particula conserva algo de giro, asi que
 * entra en espiral y se acelera al acercarse (el mismo rasgo que hace leer la
 * caida como gravedad y no como un acercamiento de camara). Al llegar al pozo
 * se apaga y renace en el borde con angulo nuevo: el bucle no tiene costura
 * porque en ningun momento se reinicia el campo entero, solo mueren y nacen
 * particulas sueltas.
 */
class PlanesStarfield {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.raf = null;
    this.last = 0;
    this._onResize = this._onResize.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.canvas) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'planes-starfield';
    canvas.setAttribute('aria-hidden', 'true');
    // Va al <body> y no al contenedor de la vista: el router reescribe el
    // innerHTML del contenedor y se llevaria el canvas por delante.
    document.body.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._resize();

    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);

    // Con reduced-motion se dibuja el cielo UNA vez y se deja quieto: quien pide
    // menos movimiento sigue mereciendo el fondo, no un rectangulo vacio.
    if (this._reducedMotion()) {
      this.particles.forEach((p) => { p.r = p.spawnR * (0.15 + Math.random() * 0.85); });
      this._draw();
      return;
    }

    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frame);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
  }

  _reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) { return false; }
  }

  _onResize() {
    if (!this.canvas) return;
    this._resize();
    if (this._reducedMotion()) this._draw();
  }

  /** Pausa con la pestana oculta: un rAF de fondo gasta bateria sin que nadie mire. */
  _onVisibility() {
    if (!this.canvas || this._reducedMotion()) return;
    if (document.hidden) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    } else if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this._frame);
    }
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Tope de 2 en el DPR: en pantallas 3x el canvas cuadruplica pixeles para una
    // ganancia que en puntos de 1px nadie ve.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.cx = w / 2;
    this.cy = h / 2;
    // Nacen mas alla de la esquina: si nacieran justo en el borde se veria
    // aparecer la particula de la nada en pantalla.
    this.spawnR = Math.hypot(w, h) / 2 * 1.08;

    const objetivo = Math.round((w * h) / 14000);
    const total = Math.max(90, Math.min(260, objetivo));
    this._fitParticles(total);
  }

  _fitParticles(total) {
    while (this.particles.length > total) this.particles.pop();
    while (this.particles.length < total) {
      // Al crear el campo se reparten por todo el radio; despues cada una
      // renace en el borde. Sin esto, el primer cuadro seria un anillo.
      this.particles.push(this._spawn(Math.random()));
    }
    this.particles.forEach((p) => { p.spawnR = this.spawnR; });
  }

  _spawn(fraccionInicial) {
    const r = this.spawnR * (fraccionInicial != null ? fraccionInicial : 1 + Math.random() * 0.15);
    return {
      r,
      spawnR: this.spawnR,
      ang: Math.random() * Math.PI * 2,
      // Cada una cae a su ritmo: un campo con velocidad unica se lee como una
      // sola pieza moviendose, no como muchas cosas cayendo.
      vel: 26 + Math.random() * 34,
      giro: (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.05),
      size: 0.5 + Math.random() * 1.0,
      brillo: 0.4 + Math.random() * 0.55
    };
  }

  _frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05); // capado: volver de otra pestana no teletransporta el campo
    this.last = now;
    this._step(dt);
    this._draw();
    this.raf = requestAnimationFrame(this._frame);
  }

  _step(dt) {
    const nucleo = 70;   // dentro de esto ya no acelera mas ni gira mas rapido
    const muerte = 26;   // aqui se apaga y renace

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const rEfectivo = Math.max(p.r, nucleo);
      // El tiron crece al acercarse. Exponente 0.6 en vez del 2 de Newton: la
      // ley real dispara la velocidad tan cerca del centro que la particula
      // desaparece de golpe; 0.6 conserva la sensacion de caida acelerada y
      // deja verla llegar.
      const factor = Math.pow(p.spawnR / rEfectivo, 0.6);

      p.r -= p.vel * factor * dt;
      p.ang += p.giro * factor * dt;

      if (p.r <= muerte) this.particles[i] = this._spawn();
    }
  }

  _draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.cx * 2, this.cy * 2);

    const entrada = this.spawnR * 0.88;  // por encima de esto todavia esta apareciendo
    const salida = 150;                  // por debajo de esto ya se esta apagando

    for (const p of this.particles) {
      let alfa = p.brillo;
      // Nace y muere en fundido; una particula que aparece o se corta de golpe
      // delata el truco.
      if (p.r > entrada) alfa *= Math.max(0, (p.spawnR - p.r) / (p.spawnR - entrada));
      if (p.r < salida)  alfa *= Math.max(0, (p.r - 26) / (salida - 26));
      if (alfa <= 0.01) continue;

      ctx.beginPath();
      ctx.arc(this.cx + Math.cos(p.ang) * p.r, this.cy + Math.sin(p.ang) * p.r, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alfa.toFixed(3)})`;
      ctx.fill();
    }
  }
}

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
          icon: 'aisc-ico aisc-ico--zap',
          label: window.__('Créditos'),
          used: Number(credits.credits_total) - Number(credits.credits_available || 0),
          total: Number(credits.credits_total),
          formatter: (n) => Number(n).toLocaleString('en-US'),
        })
      : '';

    const storage = this.orgStorage;
    const storageBlock = storage && Number(storage.max_mb) > 0
      ? this._usageMeter({
          icon: 'aisc-ico aisc-ico--database',
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
          <small>${window.__('facturado anualmente')} · $${annual.toLocaleString('en-US')}${window.__('/año')}</small>
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
    this._starfield = new PlanesStarfield();
    this._starfield.start();
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
