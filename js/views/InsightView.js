/**
 * InsightView – Dashboard principal de métricas de redes sociales y anuncios.
 * Conecta Meta Ads (Facebook/Instagram) y Google Analytics 4.
 *
 * Es la primera página que ve el usuario al iniciar sesión.
 *
 * Scopes OAuth necesarios (configurar en Netlify env vars):
 *   FACEBOOK_OAUTH_SCOPES = ads_read,ads_management,read_insights,pages_read_engagement
 *   GOOGLE_OAUTH_SCOPES   = openid email profile https://www.googleapis.com/auth/analytics.readonly
 */
class InsightView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.integrations = {};      // { facebook: row, google: row }
    this.dateRange = '30d';      // '7d' | '30d' | '90d'
    this._metaData = null;
    this._googleData = null;
    this._ga4PropertyId = '';
    this._loadingMeta = false;
    this._loadingGoogle = false;
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
    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
    if (this.organizationId) localStorage.setItem('selectedOrganizationId', this.organizationId);
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Insight', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;

    container.innerHTML = this._buildShell();
    this._setupDateTabs();

    try {
      await this._initSupabase();
      await this._loadBrandContainer();
      await this._loadIntegrations();
      this._renderPlatformCards();
      await this._fetchAll();
      this._renderMetrics();
    } catch (err) {
      console.error('InsightView render:', err);
      this._showError(err?.message || 'Error al cargar Insight.');
    }
  }

  // ── Init helpers ─────────────────────────────────────────────────────────

  async _initSupabase() {
    if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
    else if (window.supabase) this.supabase = window.supabase;
    if (!this.supabase) throw new Error('Supabase no disponible');
  }

  async _loadBrandContainer() {
    if (!this.supabase) return;
    let q = this.supabase.from('brand_containers').select('id');
    if (this.organizationId) q = q.eq('organization_id', this.organizationId);
    else {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user?.id) q = q.eq('user_id', user.id);
    }
    const { data, error } = await q.order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!error && data?.id) this.brandContainerId = data.id;
  }

  async _loadIntegrations() {
    if (!this.brandContainerId || !this.supabase) return;
    const { data, error } = await this.supabase
      .from('brand_integrations')
      .select('id, platform, external_account_id, external_account_name, access_token, scope, metadata, token_expires_at, is_active')
      .eq('brand_container_id', this.brandContainerId)
      .in('platform', ['facebook', 'google'])
      .eq('is_active', true);
    if (error || !data) return;
    this.integrations = {};
    data.forEach(row => { this.integrations[row.platform] = row; });
    const googleInteg = this.integrations['google'];
    if (googleInteg?.metadata?.ga4_property_id) {
      this._ga4PropertyId = googleInteg.metadata.ga4_property_id;
    }
  }

  // ── OAuth connect/disconnect ──────────────────────────────────────────────

  async _connectPlatform(platform) {
    if (!this.brandContainerId) {
      this._showError('Crea o conecta una marca antes de integrar plataformas.');
      return;
    }
    const session = await this.supabase.auth.getSession();
    const accessToken = session?.data?.session?.access_token;
    if (!accessToken) { alert('Sesión no válida. Inicia sesión de nuevo.'); return; }

    const returnTo = window.location.pathname + (window.location.search || '');
    const startUrl = `${window.location.origin}/api/integrations/${encodeURIComponent(platform)}/start` +
      `?brand_container_id=${encodeURIComponent(this.brandContainerId)}` +
      `&return_to=${encodeURIComponent(returnTo)}`;

    const btn = document.querySelector(`[data-connect-platform="${platform}"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="insight-spinner"></span> Conectando...`; }

    try {
      const res = await fetch(startUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(t || `Error ${res.status}`); }
      const json = await res.json();
      if (!json.authorize_url) throw new Error('No se pudo generar la URL de autorización.');
      window.location.href = json.authorize_url;
    } catch (e) {
      console.error('connectPlatform:', e);
      alert(e?.message || 'No se pudo iniciar la conexión.');
      if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-plug"></i> Conectar`; }
    }
  }

  async _disconnectPlatform(platform) {
    const integ = this.integrations[platform];
    if (!integ?.id) return;
    if (!confirm(`¿Desconectar ${platform === 'facebook' ? 'Meta' : 'Google Analytics'}? Se eliminarán los tokens guardados.`)) return;
    const { error } = await this.supabase.from('brand_integrations').delete().eq('id', integ.id);
    if (error) { alert('Error al desconectar: ' + error.message); return; }
    delete this.integrations[platform];
    if (platform === 'facebook') this._metaData = null;
    else this._googleData = null;
    this._renderPlatformCards();
    this._renderMetrics();
  }

  // ── API calls ─────────────────────────────────────────────────────────────

  async _fetchAll() {
    const promises = [];
    if (this.integrations['facebook']) promises.push(this._fetchMeta());
    if (this.integrations['google']) promises.push(this._fetchGoogle());
    await Promise.allSettled(promises);
  }

  async _fetchMeta() {
    const integ = this.integrations['facebook'];
    if (!integ) return;
    this._loadingMeta = true;
    this._showSectionLoader('insight-meta-body');
    try {
      const session = await this.supabase.auth.getSession();
      const accessToken = session?.data?.session?.access_token;
      const res = await fetch(`${window.location.origin}/api/insights/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ platform: 'facebook', integration_id: integ.id, date_range: this.dateRange })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      this._metaData = json.data;
    } catch (e) {
      console.error('_fetchMeta:', e);
      this._metaData = { _error: e?.message || 'Error al cargar métricas de Meta.' };
    } finally {
      this._loadingMeta = false;
    }
  }

  async _fetchGoogle() {
    const integ = this.integrations['google'];
    if (!integ) return;
    if (!this._ga4PropertyId) return; // User must provide property ID
    this._loadingGoogle = true;
    this._showSectionLoader('insight-google-body');
    try {
      const session = await this.supabase.auth.getSession();
      const accessToken = session?.data?.session?.access_token;
      const res = await fetch(`${window.location.origin}/api/insights/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          platform: 'google',
          integration_id: integ.id,
          date_range: this.dateRange,
          ga4_property_id: this._ga4PropertyId
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      this._googleData = json.data;
    } catch (e) {
      console.error('_fetchGoogle:', e);
      this._googleData = { _error: e?.message || 'Error al cargar métricas de Google Analytics.' };
    } finally {
      this._loadingGoogle = false;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _buildShell() {
    return `
      <div class="insight-page page-content" id="insightPage">
        <div class="insight-header">
          <div class="insight-header-left">
            <h1 class="insight-title">Insight</h1>
            <p class="insight-subtitle">Métricas de tus campañas y canales digitales en tiempo real.</p>
          </div>
          <div class="insight-header-right">
            <div class="insight-date-tabs" id="insightDateTabs">
              <button class="insight-date-tab ${this.dateRange === '7d' ? 'active' : ''}" data-range="7d">7 días</button>
              <button class="insight-date-tab ${this.dateRange === '30d' ? 'active' : ''}" data-range="30d">30 días</button>
              <button class="insight-date-tab ${this.dateRange === '90d' ? 'active' : ''}" data-range="90d">90 días</button>
            </div>
            <button class="insight-refresh-btn" id="insightRefreshBtn" title="Actualizar datos">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>

        <div class="insight-platforms" id="insightPlatforms">
          <!-- Platform cards rendered by JS -->
        </div>

        <div id="insightMetricsArea">
          <!-- KPI strip + section data rendered by JS -->
        </div>
      </div>
    `;
  }

  _renderPlatformCards() {
    const el = document.getElementById('insightPlatforms');
    if (!el) return;

    const meta = this.integrations['facebook'];
    const google = this.integrations['google'];

    el.innerHTML = `
      <div class="insight-platform-card ${meta ? 'connected' : ''}">
        <div class="insight-platform-logo insight-platform-meta">
          <svg width="24" height="24" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="25" cy="25" rx="25" ry="25" fill="none"/>
            <path d="M34.6 7C30.3 7 27.5 9.2 25.8 12.9L25 14.7L24.2 12.9C22.5 9.2 19.7 7 15.4 7C9.7 7 5 12.1 5 18.4C5 27.6 14.1 35.5 25 43C35.9 35.5 45 27.6 45 18.4C45 12.1 40.3 7 34.6 7Z" fill="currentColor"/>
          </svg>
        </div>
        <div class="insight-platform-info">
          <span class="insight-platform-name">Meta Ads</span>
          <span class="insight-platform-account">${meta ? this._esc(meta.external_account_name || 'Conectado') : 'No conectado'}</span>
        </div>
        <div class="insight-platform-actions">
          ${meta
            ? `<span class="insight-platform-badge connected"><i class="fas fa-check-circle"></i> Activo</span>
               <button class="insight-platform-disconnect" data-disconnect-platform="facebook" title="Desconectar">
                 <i class="fas fa-unlink"></i>
               </button>`
            : `<button class="insight-connect-btn btn btn-primary btn-sm" data-connect-platform="facebook">
                 <i class="fas fa-plug"></i> Conectar
               </button>`
          }
        </div>
      </div>

      <div class="insight-platform-card ${google ? 'connected' : ''}">
        <div class="insight-platform-logo insight-platform-google">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </div>
        <div class="insight-platform-info">
          <span class="insight-platform-name">Google Analytics 4</span>
          <span class="insight-platform-account">${google ? this._esc(google.external_account_name || 'Conectado') : 'No conectado'}</span>
        </div>
        <div class="insight-platform-actions">
          ${google
            ? `<span class="insight-platform-badge connected"><i class="fas fa-check-circle"></i> Activo</span>
               <button class="insight-platform-disconnect" data-disconnect-platform="google" title="Desconectar">
                 <i class="fas fa-unlink"></i>
               </button>`
            : `<button class="insight-connect-btn btn btn-primary btn-sm" data-connect-platform="google">
                 <i class="fas fa-plug"></i> Conectar
               </button>`
          }
        </div>
      </div>
    `;

    el.querySelectorAll('[data-connect-platform]').forEach(btn => {
      btn.addEventListener('click', () => this._connectPlatform(btn.dataset.connectPlatform));
    });
    el.querySelectorAll('[data-disconnect-platform]').forEach(btn => {
      btn.addEventListener('click', () => this._disconnectPlatform(btn.dataset.disconnectPlatform));
    });
  }

  _renderMetrics() {
    const area = document.getElementById('insightMetricsArea');
    if (!area) return;

    const hasMeta = !!this.integrations['facebook'];
    const hasGoogle = !!this.integrations['google'];

    if (!hasMeta && !hasGoogle) {
      area.innerHTML = this._emptyStateHTML();
      return;
    }

    // KPI strip from Meta
    const kpiHTML = hasMeta ? this._buildKpiStrip() : '';

    // Sections
    const metaHTML = hasMeta ? this._buildMetaSection() : '';
    const googleHTML = hasGoogle ? this._buildGoogleSection() : '';

    area.innerHTML = `${kpiHTML}${metaHTML}${googleHTML}`;
    this._setupPropertyIdForm();
  }

  _buildKpiStrip() {
    const d = this._metaData;
    if (!d) return '';
    if (d._error) return `<div class="insight-section-error"><i class="fas fa-exclamation-circle"></i> ${this._esc(d._error)}</div>`;

    const ins = d.insights || {};
    const fmt = (v) => v != null ? Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—';
    const fmtCurrency = (v) => v != null ? `$${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

    const kpis = [
      { icon: 'fa-eye', label: 'Alcance', value: fmt(ins.reach), sub: 'personas únicas' },
      { icon: 'fa-chart-bar', label: 'Impresiones', value: fmt(ins.impressions), sub: 'total de vistas' },
      { icon: 'fa-mouse-pointer', label: 'Clics', value: fmt(ins.clicks), sub: `CTR ${ins.ctr ? Number(ins.ctr).toFixed(2) + '%' : '—'}` },
      { icon: 'fa-dollar-sign', label: 'Inversión', value: fmtCurrency(ins.spend), sub: `CPC ${ins.cpc ? '$' + Number(ins.cpc).toFixed(2) : '—'}` }
    ];

    return `
      <div class="insight-kpi-strip">
        ${kpis.map(k => `
          <div class="insight-kpi-card">
            <div class="insight-kpi-icon"><i class="fas ${k.icon}"></i></div>
            <div class="insight-kpi-body">
              <div class="insight-kpi-value">${k.value}</div>
              <div class="insight-kpi-label">${k.label}</div>
              <div class="insight-kpi-sub">${k.sub}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _buildMetaSection() {
    const d = this._metaData;
    const inner = this._buildMetaInner(d);
    return `
      <div class="insight-section" id="insightMetaSection">
        <div class="insight-section-header">
          <div class="insight-section-title">
            <span class="insight-section-dot meta"></span>
            <span>Meta Ads</span>
          </div>
          ${d && !d._error && d.accounts?.length
            ? `<span class="insight-section-account">${this._esc(d.accounts[0]?.name || '')}</span>`
            : ''}
        </div>
        <div class="insight-section-body" id="insight-meta-body">${inner}</div>
      </div>
    `;
  }

  _buildMetaInner(d) {
    if (!d) return this._skeletonHTML();
    if (d._error) return `<div class="insight-section-error"><i class="fas fa-exclamation-circle"></i> ${this._esc(d._error)}</div>`;
    if (!d.campaigns?.length && !d.insights) {
      return `<div class="insight-empty-small"><i class="fas fa-satellite-dish"></i><p>Sin datos para este período. Verifica que tu cuenta de anuncios tenga actividad.</p></div>`;
    }

    const ins = d.insights || {};
    const fmtCur = (v) => v ? `$${Number(v).toFixed(2)}` : '$0.00';
    const fmt = (v) => v ? Number(v).toLocaleString('es-ES') : '0';

    const campaigns = (d.campaigns || []).map(c => {
      const ci = c.insights?.data?.[0] || {};
      return `
        <tr class="insight-table-row">
          <td class="insight-table-cell">
            <span class="insight-campaign-name">${this._esc(c.name)}</span>
          </td>
          <td class="insight-table-cell">
            <span class="insight-status-badge insight-status-${(c.status || '').toLowerCase()}">${this._esc(c.status || '—')}</span>
          </td>
          <td class="insight-table-cell insight-num">${fmt(ci.impressions)}</td>
          <td class="insight-table-cell insight-num">${fmt(ci.reach)}</td>
          <td class="insight-table-cell insight-num">${fmt(ci.clicks)}</td>
          <td class="insight-table-cell insight-num">${fmtCur(ci.spend)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="insight-table-wrap">
        <table class="insight-table">
          <thead>
            <tr>
              <th class="insight-table-th">Campaña</th>
              <th class="insight-table-th">Estado</th>
              <th class="insight-table-th insight-num">Impresiones</th>
              <th class="insight-table-th insight-num">Alcance</th>
              <th class="insight-table-th insight-num">Clics</th>
              <th class="insight-table-th insight-num">Inversión</th>
            </tr>
          </thead>
          <tbody>${campaigns || '<tr><td colspan="6" class="insight-table-empty">Sin campañas activas en este período.</td></tr>'}</tbody>
        </table>
      </div>
    `;
  }

  _buildGoogleSection() {
    const d = this._googleData;
    const inner = this._buildGoogleInner(d);
    return `
      <div class="insight-section" id="insightGoogleSection">
        <div class="insight-section-header">
          <div class="insight-section-title">
            <span class="insight-section-dot google"></span>
            <span>Google Analytics 4</span>
          </div>
        </div>
        <div class="insight-section-body" id="insight-google-body">${inner}</div>
      </div>
    `;
  }

  _buildGoogleInner(d) {
    const integ = this.integrations['google'];
    if (!integ) return '';

    if (!this._ga4PropertyId) {
      return `
        <div class="insight-property-form" id="insightPropertyForm">
          <div class="insight-empty-small">
            <i class="fas fa-search"></i>
            <p>Ingresa tu <strong>Property ID de GA4</strong> para ver métricas.</p>
            <small>Encuéntralo en <a href="https://analytics.google.com" target="_blank" rel="noopener">Google Analytics</a> → Admin → Property Settings → Property ID (formato: 123456789)</small>
          </div>
          <div class="insight-property-input-wrap">
            <input type="text" class="form-input insight-property-input" id="insightGa4PropertyId"
              placeholder="123456789" value="${this._esc(this._ga4PropertyId)}" maxlength="20">
            <button class="btn btn-primary insight-property-save" id="insightSavePropertyId">
              <i class="fas fa-check"></i> Aplicar
            </button>
          </div>
        </div>
      `;
    }

    if (!d) return this._skeletonHTML();
    if (d._error) return `
      <div class="insight-section-error"><i class="fas fa-exclamation-circle"></i> ${this._esc(d._error)}</div>
      ${this._buildPropertyIdEditButton()}
    `;

    // Extract metric values from GA4 response
    const metricHeaders = (d.metricHeaders || []).map(h => h.name);
    const row = d.rows?.[0]?.metricValues || [];
    const get = (name) => {
      const idx = metricHeaders.indexOf(name);
      return idx >= 0 && row[idx] ? row[idx].value : null;
    };

    const fmt = (v) => v != null ? Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }) : '—';
    const fmtPct = (v) => v != null ? (Number(v) * 100).toFixed(1) + '%' : '—';
    const fmtSec = (v) => {
      if (!v) return '—';
      const s = Math.round(Number(v));
      const m = Math.floor(s / 60), sec = s % 60;
      return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    const metrics = [
      { icon: 'fa-users', label: 'Sesiones', value: fmt(get('sessions')), color: 'blue' },
      { icon: 'fa-user', label: 'Usuarios Activos', value: fmt(get('activeUsers')), color: 'green' },
      { icon: 'fa-user-plus', label: 'Nuevos Usuarios', value: fmt(get('newUsers')), color: 'purple' },
      { icon: 'fa-file-alt', label: 'Páginas Vistas', value: fmt(get('screenPageViews')), color: 'orange' },
      { icon: 'fa-arrow-left', label: 'Tasa de Rebote', value: fmtPct(get('bounceRate')), color: 'red' },
      { icon: 'fa-clock', label: 'Duración Media', value: fmtSec(get('averageSessionDuration')), color: 'teal' }
    ];

    return `
      <div class="insight-ga4-grid">
        ${metrics.map(m => `
          <div class="insight-ga4-card insight-ga4-card--${m.color}">
            <div class="insight-ga4-icon"><i class="fas ${m.icon}"></i></div>
            <div class="insight-ga4-value">${m.value}</div>
            <div class="insight-ga4-label">${m.label}</div>
          </div>
        `).join('')}
      </div>
      ${this._buildPropertyIdEditButton()}
    `;
  }

  _buildPropertyIdEditButton() {
    return `
      <div class="insight-property-edit-wrap">
        <button class="insight-property-edit-btn" id="insightEditPropertyId">
          <i class="fas fa-edit"></i> Cambiar Property ID (${this._esc(this._ga4PropertyId)})
        </button>
      </div>
    `;
  }

  _setupPropertyIdForm() {
    const saveBtn = document.getElementById('insightSavePropertyId');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const input = document.getElementById('insightGa4PropertyId');
        const val = (input?.value || '').trim().replace(/^properties\//, '');
        if (!val || !/^\d+$/.test(val)) { alert('Ingresa un Property ID válido (solo números).'); return; }
        this._ga4PropertyId = val;
        this._googleData = null;
        this._renderMetrics();
        await this._fetchGoogle();
        this._renderMetrics();
      });
    }
    const editBtn = document.getElementById('insightEditPropertyId');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this._ga4PropertyId = '';
        this._googleData = null;
        this._renderMetrics();
      });
    }
  }

  _emptyStateHTML() {
    return `
      <div class="insight-empty-state">
        <div class="insight-empty-icon"><i class="fas fa-chart-line"></i></div>
        <h2 class="insight-empty-title">Conecta tus cuentas para ver métricas</h2>
        <p class="insight-empty-desc">
          Vincula Meta Ads y Google Analytics 4 para obtener tus métricas de campañas,
          alcance, conversiones y tráfico web en un solo lugar.
        </p>
        <div class="insight-empty-actions">
          <button class="btn btn-primary" data-connect-platform="facebook">
            <i class="fas fa-plug"></i> Conectar Meta Ads
          </button>
          <button class="btn btn-secondary" data-connect-platform="google">
            <i class="fas fa-plug"></i> Conectar Google Analytics
          </button>
        </div>
      </div>
    `;
  }

  _skeletonHTML() {
    return `
      <div class="insight-skeleton">
        <div class="insight-skel-row">
          <div class="insight-skel-block w60"></div><div class="insight-skel-block w30"></div>
        </div>
        <div class="insight-skel-row">
          <div class="insight-skel-block w80"></div><div class="insight-skel-block w40"></div><div class="insight-skel-block w50"></div>
        </div>
        <div class="insight-skel-row">
          <div class="insight-skel-block w70"></div><div class="insight-skel-block w35"></div><div class="insight-skel-block w45"></div>
        </div>
        <div class="insight-skel-row">
          <div class="insight-skel-block w55"></div><div class="insight-skel-block w25"></div><div class="insight-skel-block w60"></div>
        </div>
      </div>
    `;
  }

  // ── Event setup ───────────────────────────────────────────────────────────

  _setupDateTabs() {
    const tabs = document.getElementById('insightDateTabs');
    if (tabs) {
      tabs.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-range]');
        if (!btn) return;
        this.dateRange = btn.dataset.range;
        tabs.querySelectorAll('.insight-date-tab').forEach(t => t.classList.toggle('active', t.dataset.range === this.dateRange));
        this._metaData = null;
        this._googleData = null;
        this._renderMetrics();
        await this._fetchAll();
        this._renderMetrics();
      });
    }
    const refreshBtn = document.getElementById('insightRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        this._metaData = null;
        this._googleData = null;
        this._renderMetrics();
        await this._fetchAll();
        this._renderMetrics();
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
      });
    }
  }

  // ── Misc helpers ──────────────────────────────────────────────────────────

  _showSectionLoader(id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = this._skeletonHTML();
  }

  _showError(msg) {
    const area = document.getElementById('insightMetricsArea');
    if (area) area.innerHTML = `<div class="insight-section-error insight-section-error--large"><i class="fas fa-exclamation-triangle"></i> ${this._esc(msg)}</div>`;
  }

  _esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
}

window.InsightView = InsightView;
