/**
 * DashboardView – Panel de inteligencia de marca (organización).
 * Las cuatro secciones están temporalmente en estado «Próximamente».
 */
class DashboardView extends BaseView {

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

  onLeave() {
    // Sin suscripciones ni charts mientras el dashboard esté en «Próximamente».
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Dashboard', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();
    this._setupTabs();
    this._renderTab(this._activeTab);
  }

  renderHTML() {
    return this._buildShell();
  }

  _buildShell() {
    const tabs = [
      { id: 'my-brands',  icon: 'fa-layer-group', label: 'Mi Marca'    },
      { id: 'competence', icon: 'fa-chess',        label: 'Competencia' },
      { id: 'tendencies', icon: 'fa-fire',         label: 'Tendencias'  },
      { id: 'strategy',   icon: 'fa-route',        label: 'Estrategia'  },
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

    const copy = {
      'my-brands': {
        title: 'Mi Marca',
        icon: 'fa-layer-group',
        desc: 'Aquí verás el ADN de tu marca en tiempo real: operatividad, narrativa, comercial y diagnóstico.',
      },
      competence: {
        title: 'Competencia',
        icon: 'fa-chess',
        desc: 'Inteligencia táctica sobre precios, contenido del rival, superficie de ataque y pauta.',
      },
      tendencies: {
        title: 'Tendencias',
        icon: 'fa-fire',
        desc: 'El pulso del mundo: señales emergentes, contexto cultural, plataformas y estética.',
      },
      strategy: {
        title: 'Estrategia',
        icon: 'fa-route',
        desc: 'Centro de comando: misiones, sensores, acciones estratégicas y salud organizacional.',
      },
    };

    const tab = copy[tabId] || copy['my-brands'];
    body.innerHTML = this._pageComingSoon(tab.title, tab.icon, tab.desc);
  }

  _esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  _pageComingSoon(title, icon, description) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"><i class="fas ${icon}"></i></div>
        <h2 class="insight-cs-title">${this._esc(title)}</h2>
        <p class="insight-cs-desc">${this._esc(description)}</p>
        <span class="insight-cs-badge">Próximamente</span>
      </div>`;
  }
}

window.DashboardView = DashboardView;
