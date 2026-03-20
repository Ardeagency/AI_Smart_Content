/**
 * CreditsShopView - Página de compra de créditos para la organización.
 * Solo en contexto org: /org/:orgIdShort/:orgNameSlug/credits.
 * Paquetes: 500, 1000, 2000, 5000, 10000 créditos.
 */
class CreditsShopView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.orgId = null;
    this.org = null;
    this.creditsAvailable = 0;
    this.packages = [
      { credits: 500, price: 9, popular: false },
      { credits: 1000, price: 17, popular: true },
      { credits: 2000, price: 32, popular: false },
      { credits: 5000, price: 75, popular: false },
      { credits: 10000, price: 140, popular: false }
    ];
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    this.orgId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.orgId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/form_org';
      window.router?.navigate(url, true);
      return;
    }

    if (window.appState) window.appState.set('selectedOrganizationId', this.orgId, true);
    localStorage.setItem('selectedOrganizationId', this.orgId);
  }

  async render() {
    await super.render();
    await this.initSupabase();
    await this.loadCredits();
    this.setupEventListeners();
    this.updateHeaderContext('Comprar créditos', null, this.org?.name || null);
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
      if (this.supabase) {
        const { data: orgData } = await this.supabase
          .from('organizations')
          .select('id, name')
          .eq('id', this.orgId)
          .maybeSingle();
        if (orgData) this.org = orgData;
      }
    } catch (e) {
      console.error('CreditsShopView initSupabase:', e);
    }
  }

  async loadCredits() {
    if (!this.supabase || !this.orgId) return;
    try {
      const { data } = await this.supabase
        .from('organization_credits')
        .select('credits_available')
        .eq('organization_id', this.orgId)
        .maybeSingle();
      this.creditsAvailable = data?.credits_available ?? 0;
      const el = this.querySelector('#creditsShopAvailable');
      if (el) el.textContent = this.creditsAvailable;
    } catch (e) {
      console.error('CreditsShopView loadCredits:', e);
    }
  }

  renderHTML() {
    const cards = this.packages.map((p) => `
      <div class="credits-shop-card ${p.popular ? 'credits-shop-card--popular' : ''}" data-credits="${p.credits}" data-price="${p.price}">
        ${p.popular ? '<span class="credits-shop-badge">Recomendado</span>' : ''}
        <div class="credits-shop-card-body">
          <div class="credits-shop-card-credits">${p.credits.toLocaleString('es')} créditos</div>
          <div class="credits-shop-card-price">$${p.price}</div>
          <p class="credits-shop-card-desc">Pago único · Se añaden a tu organización</p>
          <button type="button" class="btn btn-primary credits-shop-btn-buy" data-credits="${p.credits}" data-price="${p.price}">
            <i class="fas fa-shopping-cart"></i> Comprar
          </button>
        </div>
      </div>
    `).join('');

    return `
      <div class="organization-container credits-shop-container">
        <div class="organization-header">
          <h1 class="organization-title">Comprar créditos</h1>
          <p class="organization-subtitle">Añade créditos a tu organización para usar en Production y flujos. Elige el paquete que necesites.</p>
          <div class="credits-shop-current" aria-live="polite">
            <span class="credits-shop-current-label">Créditos disponibles:</span>
            <strong class="credits-shop-current-value" id="creditsShopAvailable">${this.creditsAvailable}</strong>
          </div>
        </div>
        <div class="credits-shop-grid" role="list">
          ${cards}
        </div>
        <p class="credits-shop-footer-note">Los créditos se asignan a la organización actual. Para facturación empresarial o cantidades personalizadas, contacta con soporte.</p>
      </div>
    `;
  }

  setupEventListeners() {
    this.querySelectorAll('.credits-shop-btn-buy').forEach((btn) => {
      btn.addEventListener('click', (e) => this.onBuyClick(e));
    });
  }

  onBuyClick(e) {
    const btn = e.currentTarget;
    const credits = parseInt(btn.dataset.credits, 10);
    const price = parseInt(btn.dataset.price, 10);
    if (!credits) return;
    // Placeholder: integrar con pasarela de pago (Stripe, etc.) o redirigir a contacto/facturación
    if (window.router && this.orgId) {
      const prefix = typeof window.getOrgPathPrefix === 'function' && this.org?.name
        ? window.getOrgPathPrefix(this.orgId, this.org.name)
        : `/org/${this.orgId}`;
      window.router.navigate(`${prefix}/organization`, true);
    }
  }
}

window.CreditsShopView = CreditsShopView;
