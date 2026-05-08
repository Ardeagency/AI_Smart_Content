/**
 * CreditsShopView - Página de compra de créditos para la organización.
 * Rutas: /credits y /org/:orgIdShort/:orgNameSlug/credits.
 * Paquetes leídos desde la tabla `credit_packages` (Supabase).
 */
class CreditsShopView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.orgId = null;
    this.org = null;
    this.creditsAvailable = 0;
    this.creditsTotal = 0;
    this.packages = [];
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
    await this.loadPackages();
    await this.loadCredits();
    this.renderPackagesGrid();
    this.setupEventListeners();
    this.updateHeaderContext('Comprar créditos', null, this.org?.name || null);
  }

  async loadPackages() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('credit_packages')
        .select('id, name, credits, price_usd, bonus_credits, display_order, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      this.packages = (data || []).map((p, i, arr) => ({
        id: p.id,
        name: p.name,
        credits: p.credits,
        price: Number(p.price_usd) || 0,
        bonus: p.bonus_credits || 0,
        popular: arr.length >= 2 && i === 1
      }));
    } catch (e) {
      console.error('CreditsShopView loadPackages:', e);
      this.packages = [];
    }
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
        .select('credits_available, credits_total')
        .eq('organization_id', this.orgId)
        .maybeSingle();
      this.creditsAvailable = Number(data?.credits_available ?? 0);
      this.creditsTotal = Number(data?.credits_total ?? 0);
      const elAvail = this.querySelector('#creditsShopAvailable');
      if (elAvail) elAvail.textContent = this.creditsAvailable.toLocaleString('es');
    } catch (e) {
      console.error('CreditsShopView loadCredits:', e);
    }
  }

  renderHTML() {
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
        <div class="credits-shop-grid" id="creditsShopGrid" role="list">
          <div class="credits-shop-loading" style="padding:32px;text-align:center;color:var(--text-muted);">Cargando paquetes…</div>
        </div>
        <p class="credits-shop-footer-note">Los créditos se asignan a la organización actual. Para facturación empresarial o cantidades personalizadas, contacta con soporte.</p>
      </div>
    `;
  }

  renderPackagesGrid() {
    const grid = this.querySelector('#creditsShopGrid');
    if (!grid) return;
    if (!this.packages.length) {
      grid.innerHTML = `<div class="credits-shop-empty" style="padding:32px;text-align:center;color:var(--text-muted);">No hay paquetes disponibles.</div>`;
      return;
    }
    grid.innerHTML = this.packages.map((p) => {
      const totalCredits = p.credits + p.bonus;
      const bonusBadge = p.bonus > 0 ? `<span class="credits-shop-bonus">+${p.bonus.toLocaleString('es')} bonus</span>` : '';
      return `
        <div class="credits-shop-card ${p.popular ? 'credits-shop-card--popular' : ''}" data-pack-id="${p.id}" data-credits="${totalCredits}" data-price="${p.price}">
          ${p.popular ? '<span class="credits-shop-badge">Recomendado</span>' : ''}
          <div class="credits-shop-card-body">
            <div class="credits-shop-card-name">${p.name}</div>
            <div class="credits-shop-card-credits">${p.credits.toLocaleString('es')} créditos ${bonusBadge}</div>
            <div class="credits-shop-card-price">$${p.price}</div>
            <p class="credits-shop-card-desc">Pago único · Se añaden a tu organización</p>
            <button type="button" class="btn btn-primary credits-shop-btn-buy" data-pack-id="${p.id}" data-credits="${totalCredits}" data-price="${p.price}">
              <i class="fas fa-shopping-cart"></i> Comprar
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  setupEventListeners() {
    this.querySelectorAll('.credits-shop-btn-buy').forEach((btn) => {
      btn.addEventListener('click', (e) => this.onBuyClick(e));
    });
  }

  onBuyClick(e) {
    const btn = e.currentTarget;
    const packId = btn.dataset.packId;
    const credits = parseInt(btn.dataset.credits, 10);
    const price = parseFloat(btn.dataset.price);
    if (!packId || !credits) return;
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
