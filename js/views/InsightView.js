/**
 * InsightView – Panel de inteligencia de marca.
 *
 * Sub-páginas:
 *   my-brands   → Métricas reales de las integraciones activas de la marca
 *   competence  → Análisis de competencia
 *   tendencies  → Tendencias de mercado y contenido
 *   strategy    → Estrategia y recomendaciones
 */
class InsightView extends BaseView {
  constructor() {
    super();
    this._activeTab = 'my-brands';
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

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

  renderHTML() {
    return this._buildShell();
  }

  // ── Shell ─────────────────────────────────────────────────────────────────

  _buildShell() {
    const tabs = [
      { id: 'my-brands',   icon: 'fa-layer-group',  label: 'My Brands'   },
      { id: 'competence',  icon: 'fa-chess',         label: 'Competence'  },
      { id: 'tendencies',  icon: 'fa-fire',          label: 'Tendencies'  },
      { id: 'strategy',    icon: 'fa-route',         label: 'Strategy'    },
    ];

    return `
      <div class="insight-page page-content" id="insightPage">

        <nav class="insight-subnav" id="insightSubnav">
          ${tabs.map(t => `
            <button
              class="insight-subnav-btn${this._activeTab === t.id ? ' active' : ''}"
              data-tab="${t.id}"
            >
              <i class="fas ${t.icon}"></i>
              <span>${t.label}</span>
            </button>
          `).join('')}
        </nav>

        <div class="insight-tab-body" id="insightTabBody">
          <!-- contenido de la sub-página activa -->
        </div>

      </div>
    `;
  }

  // ── Tab routing ───────────────────────────────────────────────────────────

  _setupTabs() {
    const nav = document.getElementById('insightSubnav');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this._activeTab = btn.dataset.tab;
      nav.querySelectorAll('.insight-subnav-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === this._activeTab)
      );
      this._renderTab(this._activeTab);
    });
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    const map = {
      'my-brands':  () => this._pageMyBrands(),
      'competence': () => this._pageComingSoon('Competence', 'fa-chess', 'Analiza a tu competencia: sus publicaciones, métricas y posicionamiento en redes sociales.'),
      'tendencies': () => this._pageComingSoon('Tendencies', 'fa-fire', 'Descubre tendencias de contenido, hashtags y temas relevantes para tu industria en tiempo real.'),
      'strategy':   () => this._pageComingSoon('Strategy',   'fa-route', 'Obtén recomendaciones estratégicas basadas en el rendimiento de tus campañas y el mercado.'),
    };
    body.innerHTML = (map[tabId] || map['my-brands'])();
    if (tabId === 'my-brands') this._bindMyBrandsEvents();
  }

  // ── Sub-páginas ───────────────────────────────────────────────────────────

  _pageMyBrands() {
    return `
      <div class="insight-integrations-prompt">
        <div class="insight-int-platforms">
          <!-- Meta -->
          <div class="insight-int-logo" title="Facebook">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" fill="#1877F2"/>
            </svg>
          </div>
          <!-- Instagram -->
          <div class="insight-int-logo" title="Instagram">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <defs>
                <radialGradient id="ig1" cx="30%" cy="107%" r="150%">
                  <stop offset="0%" stop-color="#fdf497"/>
                  <stop offset="5%" stop-color="#fdf497"/>
                  <stop offset="45%" stop-color="#fd5949"/>
                  <stop offset="60%" stop-color="#d6249f"/>
                  <stop offset="90%" stop-color="#285AEB"/>
                </radialGradient>
              </defs>
              <rect width="24" height="24" rx="6" fill="url(#ig1)"/>
              <circle cx="12" cy="12" r="4" stroke="white" stroke-width="1.8" fill="none"/>
              <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
            </svg>
          </div>
          <!-- Google -->
          <div class="insight-int-logo" title="Google Analytics">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <!-- X / Twitter -->
          <div class="insight-int-logo" title="X (Twitter)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="#000"/>
              <path d="M17.75 3.75h2.95l-6.44 7.37 7.58 10.13h-5.93l-4.64-6.07-5.32 6.07H2.95l6.89-7.87L2.5 3.75h6.08l4.19 5.54 4.98-5.54zm-1.04 15.5h1.63L7.44 5.43H5.69l11.02 13.82z" fill="white"/>
            </svg>
          </div>
          <!-- YouTube -->
          <div class="insight-int-logo" title="YouTube">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="#FF0000"/>
              <path d="M19.8 8.2s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C14.8 5.2 12 5.2 12 5.2s-2.8 0-5 .1c-.4.1-1.2.1-2 .9-.6.6-.8 2-.8 2S4 9.8 4 11.4v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.3.9C8.8 19 12 19 12 19s2.8 0 5-.1c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5c0-1.6-.2-3.2-.2-3.1zm-11.5 6.5V9.3l5.4 2.7-5.4 2.7z" fill="white"/>
            </svg>
          </div>
          <!-- TikTok -->
          <div class="insight-int-logo" title="TikTok">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="#000"/>
              <path d="M16.6 5.2c-.5-.6-.8-1.3-.8-2.2h-2.5v13.2c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2c.2 0 .4 0 .6.1V11.7c-.2 0-.4-.1-.6-.1-2.5 0-4.5 2-4.5 4.5s2 4.5 4.5 4.5 4.5-2 4.5-4.5V9c.9.6 2 1 3.2 1V7.5c-.6 0-1.9-.4-2.4-2.3z" fill="white"/>
            </svg>
          </div>
        </div>

        <h2 class="insight-int-title">Agrega tus integraciones</h2>
        <p class="insight-int-desc">
          Conecta las cuentas de tu marca y accede a métricas reales en tiempo real:<br>
          rendimiento de campañas, alcance, engagement, tráfico web y mucho más,<br>
          todo en un solo panel.
        </p>

        <button class="insight-int-cta" id="insightGoToBrands">
          <i class="fas fa-plug"></i>
          Conectar integraciones
          <i class="fas fa-arrow-right insight-int-cta-arrow"></i>
        </button>
      </div>
    `;
  }

  _bindMyBrandsEvents() {
    const btn = document.getElementById('insightGoToBrands');
    if (btn) {
      btn.addEventListener('click', () => {
        localStorage.setItem('brands_open_info', '1');
        window.router?.navigate('/brands');
      });
    }
  }

  _pageComingSoon(title, icon, description) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon">
          <i class="fas ${icon}"></i>
        </div>
        <h2 class="insight-cs-title">${title}</h2>
        <p class="insight-cs-desc">${description}</p>
        <span class="insight-cs-badge">Próximamente</span>
      </div>
    `;
  }

  // ── Misc ──────────────────────────────────────────────────────────────────

  _esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
}

window.InsightView = InsightView;
