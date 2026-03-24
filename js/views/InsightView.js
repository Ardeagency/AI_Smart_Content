/**
 * InsightView – Panel de inteligencia de marca.
 * Sub-páginas: My Brands · Competence · Tendencies · Strategy
 */
class InsightView extends BaseView {
  constructor() {
    super();
    this._activeTab = 'my-brands';
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Insight', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();
    this._setupTabs();
    this._renderTab(this._activeTab);
  }

  renderHTML() { return this._buildShell(); }

  // ── Shell ──────────────────────────────────────────────────────────────────

  _buildShell() {
    const tabs = [
      { id: 'my-brands',  icon: 'fa-layer-group', label: 'My Brands'  },
      { id: 'competence', icon: 'fa-chess',        label: 'Competence' },
      { id: 'tendencies', icon: 'fa-fire',         label: 'Tendencies' },
      { id: 'strategy',   icon: 'fa-route',        label: 'Strategy'   },
    ];
    return `
      <div class="insight-page page-content" id="insightPage">
        <nav class="insight-subnav" id="insightSubnav">
          ${tabs.map(t => `
            <button class="insight-subnav-btn${this._activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">
              <i class="fas ${t.icon}"></i><span>${t.label}</span>
            </button>`).join('')}
        </nav>
        <div class="insight-tab-body" id="insightTabBody"></div>
      </div>`;
  }

  _setupTabs() {
    const nav = document.getElementById('insightSubnav');
    if (!nav) return;
    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this._activeTab = btn.dataset.tab;
      nav.querySelectorAll('.insight-subnav-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.tab === this._activeTab));
      this._renderTab(this._activeTab);
    });
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    const map = {
      'my-brands':  () => this._pageMyBrands(),
      'competence': () => this._pageComingSoon('Competence', 'fa-chess',  'Analiza a tu competencia: sus publicaciones, métricas y posicionamiento en redes sociales.'),
      'tendencies': () => this._pageComingSoon('Tendencies', 'fa-fire',   'Descubre tendencias de contenido, hashtags y temas relevantes para tu industria en tiempo real.'),
      'strategy':   () => this._pageComingSoon('Strategy',  'fa-route',   'Obtén recomendaciones estratégicas basadas en el rendimiento de tus campañas y el mercado.'),
    };
    body.innerHTML = (map[tabId] || map['my-brands'])();
    if (tabId === 'my-brands') this._bindMyBrandsEvents();
  }

  // ── Sub-páginas ────────────────────────────────────────────────────────────

  _pageMyBrands() {
    return `
      <div class="insight-integrations-prompt">
        <div class="insight-int-platforms">
          <div class="insight-int-logo insight-int-logo--google" title="Google">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div class="insight-int-logo insight-int-logo--meta" title="Meta">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" fill="#1877F2"/>
            </svg>
          </div>
        </div>
        <h2 class="insight-int-title">Conecta tu marca</h2>
        <p class="insight-int-desc">
          Vincula tu cuenta de <strong>Google</strong> y <strong>Meta</strong> para acceder a métricas
          reales en tiempo real: Analytics, YouTube, Facebook, Instagram, Ads y mucho más,
          todo centralizado en un solo panel.
        </p>
        <button class="insight-int-cta" id="insightGoToBrands">
          <i class="fas fa-plug"></i>
          Conectar integraciones
          <i class="fas fa-arrow-right insight-int-cta-arrow"></i>
        </button>
      </div>`;
  }

  _bindMyBrandsEvents() {
    const btn = document.getElementById('insightGoToBrands');
    if (btn) btn.addEventListener('click', () => {
      localStorage.setItem('brands_open_info', '1');
      window.router?.navigate('/brands');
    });
  }

  _pageComingSoon(title, icon, description) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"><i class="fas ${icon}"></i></div>
        <h2 class="insight-cs-title">${title}</h2>
        <p class="insight-cs-desc">${description}</p>
        <span class="insight-cs-badge">Próximamente</span>
      </div>`;
  }
}

window.InsightView = InsightView;
