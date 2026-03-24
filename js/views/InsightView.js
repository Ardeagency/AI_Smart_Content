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
  }

  // ── Sub-páginas ───────────────────────────────────────────────────────────

  _pageMyBrands() {
    return this._pageComingSoon('My Brands', 'fa-layer-group', 'Aquí verás en tiempo real las métricas de tus marcas conectadas: Meta Ads, Google Analytics y más.');
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
