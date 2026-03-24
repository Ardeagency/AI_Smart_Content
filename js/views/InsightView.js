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
    this._activeTab  = 'my-brands';
    this._dateRange  = '30d';
    this.supabase    = null;
    this.userId      = null;
    this.sessionToken = null;
    this.brandContainer = null;
    this.integrations   = [];
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
    await this._initSupabase();
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

  // ── Supabase ──────────────────────────────────────────────────────────────

  async _initSupabase() {
    try {
      const client = await this.getSupabaseClient();
      if (!client) return;
      this.supabase = client;
      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData?.session;
      if (session) {
        this.userId       = session.user?.id;
        this.sessionToken = session.access_token;
      }
    } catch (e) {
      console.error('[InsightView] initSupabase error:', e?.message);
    }
  }

  async _loadBrandData() {
    if (!this.supabase || !this.userId) return false;
    try {
      const { data: containers } = await this.supabase
        .from('brand_containers')
        .select('id, nombre_marca, logo_url')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(1);
      this.brandContainer = containers?.[0] || null;
      if (!this.brandContainer) return false;

      const { data: integrations } = await this.supabase
        .from('brand_integrations')
        .select('id, platform, external_account_name, external_account_id, is_active, token_expires_at, metadata')
        .eq('brand_container_id', this.brandContainer.id)
        .eq('is_active', true);
      this.integrations = integrations || [];
      return true;
    } catch (e) {
      console.error('[InsightView] loadBrandData error:', e?.message);
      return false;
    }
  }

  _getIntegration(platform) {
    return this.integrations.find(i => i.platform === platform) || null;
  }

  // ── Shell ─────────────────────────────────────────────────────────────────

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
            </button>
          `).join('')}
        </nav>
        <div class="insight-tab-body" id="insightTabBody"></div>
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
    if (tabId === 'my-brands') {
      body.innerHTML = this._loadingHTML('Cargando tus métricas…');
      this._loadMyBrands(body);
      return;
    }
    const map = {
      'competence': () => this._pageComingSoon('Competence', 'fa-chess', 'Analiza a tu competencia: sus publicaciones, métricas y posicionamiento en redes sociales.'),
      'tendencies': () => this._pageComingSoon('Tendencies', 'fa-fire',  'Descubre tendencias de contenido, hashtags y temas relevantes para tu industria en tiempo real.'),
      'strategy':   () => this._pageComingSoon('Strategy',  'fa-route',  'Obtén recomendaciones estratégicas basadas en el rendimiento de tus campañas y el mercado.'),
    };
    body.innerHTML = (map[tabId] || (() => ''))();
  }

  // ── My Brands – lógica principal ──────────────────────────────────────────

  async _loadMyBrands(body) {
    if (!this.supabase) await this._initSupabase();
    const ok = await this._loadBrandData();

    if (!ok || !this.brandContainer) {
      body.innerHTML = this._pageConnectPrompt();
      this._bindConnectPrompt();
      return;
    }

    const metaInteg = this._getIntegration('facebook');
    if (!metaInteg) {
      body.innerHTML = this._pageConnectPrompt();
      this._bindConnectPrompt();
      return;
    }

    // Integración Meta encontrada → mostrar dashboard con loading
    body.innerHTML = this._metaDashboardShell(metaInteg, this._dateRange);
    this._bindDateRangePicker(body, metaInteg);

    await this._fetchAndRenderMeta(body, metaInteg, this._dateRange);
  }

  async _fetchAndRenderMeta(body, integ, dateRange) {
    const metricsEl   = body.querySelector('#insightMetaMetrics');
    const campaignsEl = body.querySelector('#insightMetaCampaigns');
    if (metricsEl)   metricsEl.innerHTML   = this._loadingHTML('Cargando métricas…');
    if (campaignsEl) campaignsEl.innerHTML = '';

    if (!this.sessionToken) {
      const { data: s } = await this.supabase.auth.getSession();
      this.sessionToken = s?.session?.access_token || null;
    }
    if (!this.sessionToken) {
      if (metricsEl) metricsEl.innerHTML = this._errorHTML('No hay sesión activa.');
      return;
    }

    try {
      const res = await fetch('/api/insights/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionToken}`
        },
        body: JSON.stringify({ platform: 'facebook', integration_id: integ.id, date_range: dateRange })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);

      const { accounts = [], insights, campaigns = [] } = json.data || {};

      if (metricsEl)   metricsEl.innerHTML   = this._renderMetaMetrics(insights, accounts[0]);
      if (campaignsEl) campaignsEl.innerHTML = this._renderCampaignsTable(campaigns);
    } catch (e) {
      if (metricsEl) metricsEl.innerHTML = this._errorHTML(e?.message || 'Error al obtener métricas.');
    }
  }

  _bindDateRangePicker(body, integ) {
    body.querySelectorAll('[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._dateRange = btn.dataset.range;
        body.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('active', b === btn));
        this._fetchAndRenderMeta(body, integ, this._dateRange);
      });
    });
  }

  _bindConnectPrompt() {
    const btn = document.getElementById('insightGoToBrands');
    if (btn) {
      btn.addEventListener('click', () => {
        localStorage.setItem('brands_open_info', '1');
        window.router?.navigate('/brands');
      });
    }
  }

  // ── HTML builders ─────────────────────────────────────────────────────────

  _loadingHTML(msg = 'Cargando…') {
    return `
      <div class="insight-loading">
        <i class="fas fa-spinner fa-spin"></i>
        <span>${msg}</span>
      </div>
    `;
  }

  _errorHTML(msg) {
    return `
      <div class="insight-error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <span>${this._esc(msg)}</span>
      </div>
    `;
  }

  _metaDashboardShell(integ, activeRange) {
    const accountName = integ.external_account_name ? this._esc(integ.external_account_name) : 'Cuenta Meta';
    const picture = integ.metadata?.picture || null;
    const ranges = [
      { id: '7d',  label: '7 días'  },
      { id: '30d', label: '30 días' },
      { id: '90d', label: '90 días' },
    ];
    return `
      <div class="insight-meta-dashboard">

        <!-- Header de la integración -->
        <div class="imd-header">
          <div class="imd-account">
            ${picture
              ? `<img src="${this._esc(picture)}" class="imd-avatar" alt="">`
              : `<div class="imd-avatar-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" fill="#1877F2"/></svg></div>`
            }
            <div class="imd-account-info">
              <span class="imd-account-name">${accountName}</span>
              <span class="imd-platform-badge"><i class="fas fa-circle imd-dot"></i> Meta · Facebook Ads</span>
            </div>
          </div>

          <!-- Selector de rango -->
          <div class="imd-range-picker">
            ${ranges.map(r => `
              <button class="imd-range-btn${activeRange === r.id ? ' active' : ''}" data-range="${r.id}">
                ${r.label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Tarjetas de métricas -->
        <div id="insightMetaMetrics" class="imd-metrics-grid"></div>

        <!-- Tabla de campañas -->
        <div id="insightMetaCampaigns" class="imd-campaigns-section"></div>

      </div>
    `;
  }

  _renderMetaMetrics(insights, account) {
    if (!insights) {
      return `<div class="imd-no-data"><i class="fas fa-info-circle"></i> Sin datos de Ads para este período. Verifica que tengas campañas activas.</div>`;
    }

    const fmt = (v, decimals = 0) => v != null ? Number(v).toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';
    const currency = account?.currency || 'USD';

    const metrics = [
      { icon: 'fa-dollar-sign',   color: 'meta-green',  label: 'Gasto total',    value: `${fmt(insights.spend, 2)} ${currency}` },
      { icon: 'fa-eye',           color: 'meta-blue',   label: 'Impresiones',    value: fmt(insights.impressions)               },
      { icon: 'fa-users',         color: 'meta-indigo', label: 'Alcance',        value: fmt(insights.reach)                     },
      { icon: 'fa-mouse-pointer', color: 'meta-purple', label: 'Clics',          value: fmt(insights.clicks)                    },
      { icon: 'fa-percentage',    color: 'meta-orange', label: 'CTR',            value: `${fmt(insights.ctr, 2)}%`               },
      { icon: 'fa-chart-bar',     color: 'meta-cyan',   label: 'CPM',            value: `${fmt(insights.cpm, 2)} ${currency}`   },
      { icon: 'fa-mouse-pointer', color: 'meta-pink',   label: 'CPC',            value: `${fmt(insights.cpc, 2)} ${currency}`   },
    ];

    return metrics.map(m => `
      <div class="imd-metric-card">
        <div class="imd-metric-icon imd-icon--${m.color}">
          <i class="fas ${m.icon}"></i>
        </div>
        <div class="imd-metric-body">
          <span class="imd-metric-value">${m.value}</span>
          <span class="imd-metric-label">${m.label}</span>
        </div>
      </div>
    `).join('');
  }

  _renderCampaignsTable(campaigns) {
    if (!campaigns || campaigns.length === 0) return '';

    const statusLabel = (s) => {
      const map = { ACTIVE: 'Activa', PAUSED: 'Pausada', ARCHIVED: 'Archivada', DELETED: 'Eliminada' };
      return map[s] || s || '—';
    };
    const statusClass = (s) => s === 'ACTIVE' ? 'imd-status--active' : s === 'PAUSED' ? 'imd-status--paused' : 'imd-status--other';

    const rows = campaigns.map(c => {
      const ins = c.insights?.data?.[0] || {};
      return `
        <tr>
          <td class="imd-camp-name">${this._esc(c.name || '—')}</td>
          <td><span class="imd-status-badge ${statusClass(c.status)}">${statusLabel(c.status)}</span></td>
          <td>${ins.impressions ? Number(ins.impressions).toLocaleString('es') : '—'}</td>
          <td>${ins.reach       ? Number(ins.reach).toLocaleString('es')       : '—'}</td>
          <td>${ins.clicks      ? Number(ins.clicks).toLocaleString('es')      : '—'}</td>
          <td>${ins.spend       ? `$${Number(ins.spend).toLocaleString('es', { minimumFractionDigits: 2 })}` : '—'}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="imd-campaigns-wrap">
        <h3 class="imd-section-title"><i class="fas fa-bullhorn"></i> Campañas</h3>
        <div class="imd-table-scroll">
          <table class="imd-campaigns-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Impresiones</th>
                <th>Alcance</th>
                <th>Clics</th>
                <th>Gasto</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  _pageConnectPrompt() {
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
      </div>
    `;
  }

  _pageComingSoon(title, icon, description) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"><i class="fas ${icon}"></i></div>
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
