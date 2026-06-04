/**
 * DashboardView — orquestador de los 4 tabs del dashboard de organización.
 *
 * Arquitectura:
 *   - Esta clase es el CORE. Solo conoce: routing entre tabs, shell HTML,
 *     suscripciones realtime compartidas y helpers compartidos (Chart.js,
 *     escape, destrucción de charts).
 *   - Cada tab vive en su propio mixin en js/views/dashboard/{Tab}.mixin.js.
 *     Los mixins aplican sobre DashboardView.prototype al cargarse y definen
 *     `_renderMyBrands`, `_renderCompetence`, `_renderTendencies`, `_renderStrategy`.
 *   - El loader (js/app.js) carga DashboardView.js + los 4 mixins en orden, en ese
 *     orden — gracias a `defer` el orden está garantizado.
 *
 * Estado:
 *   - TABS_ENABLED por tab (todos en false mientras se reconstruyen). Cuando un
 *     mixin esté listo, se flipea su entrada a true y _renderTab lo invoca.
 *   - Los mixins son responsables de inicializar su propio estado (this._mbData,
 *     this._stratData, etc.) de forma lazy en su primer render.
 *
 * ARDE Agency S.A.S. — spec: dashboard_mi_marca_spec.docx
 */
class DashboardView extends BaseView {
  static documentTitle = 'Inicio';

  // Habilita back/forward HTML cache: al volver desde Studio/Production al
  // dashboard, restaura HTML+scroll instant; los tabs refrescan en background.
  static cacheable = true;

  // Activación granular por tab. En 'false' renderiza el placeholder
  // "Próximamente" (definido en _renderComingSoon). Flipear a 'true' cuando
  // el mixin del tab esté listo.
  static TABS_ENABLED = {
    'my-brands':  true,   // FEAT-023 Ola 1: sección "Mis Campañas" activa
    'competence': true,   // Competencia: campo de batalla + voz de audiencia + vulnerabilidades
    'tendencies': true,   // Tendencias: pulso del nicho + señales + océanos azules + léxico + marcas emergentes
    'strategy':   true,   // Estrategia: recomendaciones de Vera (cross-signal) + aprendizaje
  };

  constructor() {
    super();
    this._activeTab     = this._resolveInitialTab();
    this._charts        = [];
    this._chartJsReady  = false;
    this._supabase      = null;
    this._orgId         = null;
    this._channels      = []; // Suscripciones realtime activas (limpiar en onLeave)
    this._onHashChange  = null;
  }

  /**
   * Resuelve el tab activo al cargar la vista:
   *   1. URL hash (#tendencies) si es un tab habilitado
   *   2. Primer tab habilitado en TABS_ENABLED
   *   3. Fallback a 'my-brands'
   * Permite que recargar en /dashboard#tendencies preserve el tab activo
   * y que la URL sea compartible (/dashboard#strategy abre directo en Estrategia).
   */
  _resolveInitialTab() {
    const enabled = DashboardView.TABS_ENABLED || {};
    const hash = (typeof location !== 'undefined' ? (location.hash || '') : '').replace(/^#/, '');
    if (hash && enabled[hash] === true) return hash;
    const firstEnabled = Object.entries(enabled).find(([, v]) => v === true);
    return firstEnabled ? firstEnabled[0] : 'my-brands';
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    await this._initDataLayer();
  }

  async _initDataLayer() {
    try {
      if (window.supabaseService) this._supabase = await window.supabaseService.getClient();
      else if (window.supabase)  this._supabase = window.supabase;
    } catch (_) {}

    const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    // El router resuelve /org/:orgIdShort/:orgNameSlug → routeParams.orgId (UUID).
    // Nunca usar orgIdShort directo: la columna organization_id es uuid → 400 Bad Request.
    let candidate =
      this.routeParams?.orgId ||
      window.currentOrgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      null;

    if (!isUuid(candidate)
        && this.routeParams?.orgIdShort
        && this.routeParams?.orgNameSlug
        && typeof window.resolveOrgIdFromShortAndSlug === 'function') {
      try {
        const r = await window.resolveOrgIdFromShortAndSlug(
          this.routeParams.orgIdShort,
          this.routeParams.orgNameSlug
        );
        if (isUuid(r?.id)) candidate = r.id;
      } catch (_) {}
    }

    this._orgId = isUuid(candidate) ? candidate : null;
    if (!this._orgId) {
      console.warn('[DashboardView] No se pudo resolver organization_id (UUID).');
      return;
    }

    this._subscribeRealtime();
    await this._ensureFreshness();
  }

  /* ── Frescura de datos ──────────────────────────────────────────────
     Una sola RPC org-scoped (dashboard_data_freshness) cacheada en la
     instancia. Devuelve { own_posts, competitor_posts, latest } (timestamptz).
     Cada tab pinta el timestamp relevante a su scope via _freshnessChip(). */
  async _ensureFreshness() {
    if (this._freshness !== undefined) return this._freshness;
    this._freshness = null;
    try {
      if (this._supabase && this._orgId) {
        const { data } = await this._supabase.rpc('dashboard_data_freshness', { p_org_id: this._orgId });
        this._freshness = data || null;
      }
    } catch (_) { this._freshness = null; }
    return this._freshness;
  }

  /** Chip "Datos al {fecha}" para inyectar en la barra de filtros de cada tab. */
  _freshnessChip(scope) {
    const f = this._freshness;
    if (!f) return '';
    const ts = ({ 'my-brands': f.own_posts, 'competence': f.competitor_posts }[scope]) || f.latest;
    if (!ts) return '';
    const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    const stale = days > 3 ? ' dash-freshness--stale' : '';
    return `<span class="dash-freshness${stale}" title="Ultima captura de datos del scraping">
      <i class="dash-freshness-dot"></i> Datos al ${this._esc(this._fmtFreshness(ts, days))}
    </span>`;
  }

  _fmtFreshness(ts, days) {
    try {
      const d = new Date(ts);
      const dateStr = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
      if (days <= 0) return `hoy (${dateStr})`;
      if (days === 1) return `ayer (${dateStr})`;
      return dateStr;
    } catch (_) { return ''; }
  }

  /* ── Dropdown "Crear informe" (barra de filtros, derecha) ──────────────
     <details> nativo: el toggle no necesita JS. Solo manejamos el click de
     opcion + cierre al hacer click afuera, via un listener delegado unico. */
  _reportDropdown() {
    const opts = [
      { k: 'competencia', label: 'Informes de competencia' },
      { k: 'diagnostico', label: 'Diagnostico de marca' },
      { k: 'ventas',      label: 'Informes de ventas' },
      { k: 'productos',   label: 'Research de productos' },
    ];
    return `
      <details class="dash-report-dd">
        <summary class="dash-report-btn"><i class="fas fa-file-circle-plus"></i><span>Crear informe</span><i class="fas fa-chevron-down dash-report-caret"></i></summary>
        <div class="dash-report-menu">
          ${opts.map((o) => `<button type="button" class="dash-report-item" data-report="${o.k}">${o.label}</button>`).join('')}
        </div>
      </details>`;
  }

  _setupReportDropdown() {
    if (this._reportClickHandler) return;
    this._reportClickHandler = (e) => {
      // Cerrar dropdowns abiertos al hacer click afuera.
      document.querySelectorAll('details.dash-report-dd[open]').forEach((dd) => {
        if (!dd.contains(e.target)) dd.removeAttribute('open');
      });
      const item = e.target.closest('[data-report]');
      if (!item) return;
      const dd = item.closest('details.dash-report-dd');
      if (dd) dd.removeAttribute('open');
      this._onCreateReport(item.dataset.report);
    };
    document.addEventListener('click', this._reportClickHandler);
  }

  _onCreateReport(type) {
    const labels = {
      competencia: 'Informes de competencia',
      diagnostico: 'Diagnostico de marca',
      ventas: 'Informes de ventas',
      productos: 'Research de productos',
    };
    const label = labels[type] || 'Informe';
    if (typeof window.showToast === 'function') {
      window.showToast(`${label}: proximamente`, { type: 'info' });
    }
  }

  onLeave() {
    this.clearSubnavFromHeader();
    [this._mbDatePicker, this._compDatePicker, this._tendDatePicker]
      .forEach(p => { try { p?.destroy?.(); } catch (_) {} });
    this._unsubscribeRealtime();
    this._destroyCharts();
    if (this._onHashChange) {
      window.removeEventListener('hashchange', this._onHashChange);
      this._onHashChange = null;
    }
    if (this._reportClickHandler) {
      document.removeEventListener('click', this._reportClickHandler);
      this._reportClickHandler = null;
    }
  }

  /* ── Realtime subscriptions ─────────────────────────────────
     Las tablas críticas alimentan distintos tabs. Cuando llega un cambio,
     se invalida la cache del scope afectado y, si el tab activo coincide,
     se re-renderiza. Cada mixin se hace cargo de su propia invalidación
     vía el handler _onRealtimeChange y de exponer su servicio (_mbService,
     _compService, etc.) si necesita filtros adicionales por entity_id.

     `intelligence_signals` no tiene `organization_id` directo — se filtra
     en el handler usando los entity_ids cacheados en los services. */
  _subscribeRealtime() {
    if (!this._supabase || !this._orgId) return;
    if (this._channels.length) return;

    const orgFilter = `organization_id=eq.${this._orgId}`;

    const sub = (name, table, filter, scopes) => {
      const ch = this._supabase
        .channel(`dash-${name}-${this._orgId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => {
          this._onRealtimeChange(scopes, payload);
        })
        .subscribe();
      this._channels.push(ch);
    };

    sub('vpa',   'vera_pending_actions',  orgFilter, ['strategy']);
    sub('vuln',  'brand_vulnerabilities', orgFilter, ['my-brands', 'strategy']);
    sub('bm',    'body_missions',         orgFilter, ['strategy']);
    sub('rp',    'retail_prices',         orgFilter, ['competence']);
    sub('tt',    'trend_topics',          orgFilter, ['tendencies']);

    // FEAT-023: invalida sección Mis Campañas si cambian ad_insights_daily o campaigns.
    sub('aid',   'ad_insights_daily',     orgFilter, ['my-brands']);
    sub('camp',  'campaigns',             orgFilter, ['my-brands']);
    sub('cb',    'campaign_briefs',       orgFilter, ['my-brands']);

    // intelligence_signals: filtro lo hace el handler (la tabla no tiene
    // organization_id; verificamos entity_id contra los services al recibir).
    const ch = this._supabase
      .channel(`dash-sig-${this._orgId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'intelligence_signals' }, (payload) => {
        const entityId = payload?.new?.entity_id;
        const known = (this._mbService?.entityIds || this._compService?.entityIds || []);
        if (entityId && known.length && !known.includes(entityId)) return;
        this._onRealtimeChange(['my-brands', 'tendencies'], payload);
      })
      .subscribe();
    this._channels.push(ch);
  }

  _unsubscribeRealtime() {
    for (const ch of this._channels) {
      try { ch.unsubscribe(); } catch (_) {}
    }
    this._channels = [];
  }

  _onRealtimeChange(scopes, _payload) {
    // Invalida tanto el cache local del mixin como el del apiClient para que
    // el próximo _fetchAll() vaya a Supabase (no devuelva data stale).
    const orgId = this._orgId;
    if (scopes.includes('my-brands'))  {
      this._mbData = null;
      this._mbCampanasData = null;
      window.apiClient?.invalidate((k) => k.startsWith(`dash:mi-brand:${orgId}`) || k.startsWith(`dash:campanas:${orgId}`));
    }
    if (scopes.includes('competence')) { this._compData  = null; window.apiClient?.invalidate((k) => k.startsWith(`dash:competencia:${orgId}`)); }
    if (scopes.includes('tendencies')) { this._tendData  = null; window.apiClient?.invalidate((k) => k.startsWith(`dash:tendencias:${orgId}`)); }
    if (scopes.includes('strategy'))   { this._stratData = null; window.apiClient?.invalidate(`dash:strategia:${orgId}`); }

    if (!scopes.includes(this._activeTab)) return;
    if (!document.getElementById('insightTabBody')) return;

    this._destroyCharts();
    this._renderTab(this._activeTab);
  }

  _destroyCharts() {
    this._charts.forEach(c => { try { c.destroy(); } catch (_) {} });
    this._charts = [];
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Dashboard', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();
    this.moveSubnavToHeader(this._buildHeaderTabs(), (tab) => this._switchTab(tab, /* fromUser */ true));
    this._setupTabs();
    this._setupReportDropdown();
    this._renderTab(this._activeTab);
  }

  renderHTML() {
    return this._buildShell();
  }

  _buildShell() {
    // La barra de tabs ya no vive en la pagina: se inyecta en el header
    // principal (segunda fila), solo en /dashboard. Ver _buildHeaderTabs().
    return `
      <div class="insight-page page-content" id="insightPage">
        ${this._buildBanner(this._activeTab)}
        <div class="insight-tab-body" id="insightTabBody"></div>
      </div>`;
  }

  // Copy del banner por tab: titulo + descripcion de que hace cada vista.
  static BANNER_COPY = {
    'my-brands': {
      title: 'Mi Marca',
      desc: 'El pulso de tu marca en un solo lugar: salud, campanas activas y como rinde tu contenido frente a tu audiencia.',
    },
    'competence': {
      title: 'Competencia',
      desc: 'El campo de batalla: que publican tus competidores, la voz de su audiencia y donde estan sus vulnerabilidades.',
    },
    'tendencies': {
      title: 'Tendencias',
      desc: 'El pulso del nicho: senales emergentes, oceanos azules, lexico vivo y las marcas que estan despuntando.',
    },
    'strategy': {
      title: 'Estrategia',
      desc: 'Las recomendaciones de Vera: lecturas cruzadas de todas las senales y aprendizaje continuo para decidir mejor.',
    },
  };

  // Banner con gradiente animado de marca. Tab-aware: titulo + descripcion
  // cambian segun la vista activa (ver _updateBanner en _switchTab).
  _buildBanner(tabId) {
    const copy = DashboardView.BANNER_COPY[tabId] || DashboardView.BANNER_COPY['my-brands'];
    return `
      <section class="dash-banner" id="dashBanner" aria-label="Resumen del dashboard">
        <div class="dash-banner-content">
          <h1 class="dash-banner-title" id="dashBannerTitle">${this._esc(copy.title)}</h1>
          <p class="dash-banner-desc" id="dashBannerDesc">${this._esc(copy.desc)}</p>
        </div>
      </section>`;
  }

  // Refresca titulo + descripcion del banner sin reconstruir el gradiente
  // (asi la animacion no se reinicia al cambiar de tab).
  _updateBanner(tabId) {
    const copy = DashboardView.BANNER_COPY[tabId] || DashboardView.BANNER_COPY['my-brands'];
    const t = document.getElementById('dashBannerTitle');
    const d = document.getElementById('dashBannerDesc');
    if (t) t.textContent = copy.title;
    if (d) d.textContent = copy.desc;
  }

  /** Tabs para inyectar en el header principal (mismo patron que Production). */
  _buildHeaderTabs() {
    const leftTabs  = [
      { id: 'my-brands',  label: 'Mi Marca'    },
      { id: 'competence', label: 'Competencia' },
      { id: 'tendencies', label: 'Tendencias'  },
    ];
    const rightTabs = [
      { id: 'strategy',   label: 'Estrategia'  },
    ];
    const pill = (t) => `
      <button class="mb-firebar-tab${this._activeTab === t.id ? ' is-active' : ''}" data-tab="${t.id}">
        <span>${t.label}</span>
      </button>`;
    return `
      <div class="dash-header-tabs" id="dashHeaderTabs">
        <div class="mb-firebar-tabs mb-firebar-tabs--left">${leftTabs.map(pill).join('')}</div>
        <div class="mb-firebar-tabs mb-firebar-tabs--right">${rightTabs.map(pill).join('')}</div>
      </div>`;
  }

  _setupTabs() {
    // El click de los tabs lo maneja el slot del header (moveSubnavToHeader).
    // hashchange: que el back/forward del browser cambie el tab.
    // Solo registrar una vez (este método se llama en cada render).
    if (!this._onHashChange) {
      this._onHashChange = () => {
        const target = this._resolveInitialTab();
        if (target !== this._activeTab) this._switchTab(target, /* fromUser */ false);
      };
      window.addEventListener('hashchange', this._onHashChange);
    }
  }

  _switchTab(tabId, fromUser) {
    if (!tabId || tabId === this._activeTab) return;
    this._destroyCharts();
    this._activeTab = tabId;

    // Persistir en URL para que recargar conserve el tab y la URL sea compartible.
    // replaceState evita saturar el history con cada click; el back/forward sigue
    // funcionando porque hashchange dispara aunque el path sea el mismo.
    if (fromUser) {
      try {
        const newUrl = location.pathname + location.search + '#' + tabId;
        history.replaceState(history.state, '', newUrl);
      } catch (_) {
        location.hash = tabId;
      }
    }

    const nav = document.getElementById('headerProductionSlot');
    if (nav) {
      nav.querySelectorAll('.mb-firebar-tab')
        .forEach(b => b.classList.toggle('is-active', b.dataset.tab === tabId));
    }
    this._updateBanner(tabId);
    this._renderTab(tabId);
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    if (!DashboardView.TABS_ENABLED?.[tabId]) {
      this._renderComingSoon(tabId, body);
      return;
    }
    // Skeleton inmediato: el usuario ve la silueta del layout mientras el
    // mixin fetchea data y reemplaza el HTML. Evita "salto" de empty a fresh.
    if (!this._restoredFromCache) this._renderTabSkeleton(body);
    if (tabId === 'my-brands')  return this._renderMyBrands(body);
    if (tabId === 'competence') return this._renderCompetence(body);
    if (tabId === 'tendencies') return this._renderTendencies(body);
    if (tabId === 'strategy')   return this._renderStrategy(body);
  }

  _renderTabSkeleton(body) {
    // 4 KPIs + 2 cards grandes con shimmer; cubre el shape de los 4 tabs.
    body.innerHTML = `
      <div class="dash-skeleton" style="padding: 1rem 0; display: flex; flex-direction: column; gap: 1rem;">
        ${BaseView.skeletonGrid(4)}
        <div class="skeleton-grid skeleton-grid--3">
          ${BaseView.skeletonCard('lg')}
          ${BaseView.skeletonCard('lg')}
          ${BaseView.skeletonCard('lg')}
        </div>
      </div>`;
  }

  _renderComingSoon(_tabId, body) {
    body.innerHTML = `
      <div class="dash-coming-soon" style="
        display:flex;align-items:center;justify-content:center;
        min-height:60vh;padding:48px 24px;
      ">
        <h2 style="margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;">
          Próximamente
        </h2>
      </div>`;
  }

  /* ── Helpers compartidos por todos los mixins ──────────────────────────── */

  async _ensureChartJs() {
    if (window.Chart) { this._chartJsReady = true; return; }
    await this.loadScript(
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
      'Chart', 8000
    );
    this._chartJsReady = true;
  }

  /** Registrar Chart.js en this._charts para destruirlo en onLeave. */
  _reg(chart) { this._charts.push(chart); return chart; }

  _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

window.DashboardView = DashboardView;
