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
    // Los tabs ahora viven DENTRO del hero (sobre el degradado), no en el
    // header global. Limpiamos cualquier subnav residual del header.
    this.clearSubnavFromHeader();
    this._setupHeroTabs();
    this._setupTabs();
    this._setupReportDropdown();
    this._renderTab(this._activeTab);
    // KPIs del hero: se llenan en background (data de marca compartida).
    this._ensureHeroKpis();
  }

  renderHTML() {
    return this._buildShell();
  }

  _buildShell() {
    // Hero a sangre completa (degradado organico por tab) con titulo en peso
    // mixto, los tabs encima del degradado y una tira de KPIs en vidrio.
    // Debajo, el cuerpo del tab activo.
    return `
      <div class="insight-page page-content insight-page--hero" id="insightPage">
        ${this._buildHero(this._activeTab)}
        <div class="insight-tab-body" id="insightTabBody"></div>
      </div>`;
  }

  // Definicion unica de los tabs (orden = orden visual en el hero).
  static TABS = [
    { id: 'my-brands',  label: 'Mi Marca'    },
    { id: 'competence', label: 'Competencia' },
    { id: 'tendencies', label: 'Tendencias'  },
    { id: 'strategy',   label: 'Estrategia'  },
  ];

  // Copy del hero por tab: titulo (parte fuerte + parte ligera) + descripcion.
  // El trio de colores del degradado vive en CSS via [data-tab] (insight.css).
  static HERO_COPY = {
    'my-brands': {
      strong: 'Mi Marca',
      desc: 'El pulso de tu marca: salud, campanas activas y como rinde tu contenido frente a tu audiencia.',
    },
    'competence': {
      strong: 'Competencia',
      desc: 'El campo de batalla: que publican tus competidores, la voz de su audiencia y sus vulnerabilidades.',
    },
    'tendencies': {
      strong: 'Tendencias',
      desc: 'El pulso del nicho: senales emergentes, oceanos azules, lexico vivo y marcas que despuntan.',
    },
    'strategy': {
      strong: 'Estrategia',
      desc: 'Las recomendaciones de Vera: lecturas cruzadas de todas las senales y aprendizaje continuo.',
    },
  };

  // Hero estilo overview: degradado organico animado (por tab) + titulo en
  // peso mixto + tabs sobre el degradado + tira de KPIs en vidrio.
  _buildHero(tabId) {
    const copy = DashboardView.HERO_COPY[tabId] || DashboardView.HERO_COPY['my-brands'];
    const org  = window.currentOrgName || '';
    const light = org ? ` <span class="dash-hero-title-light">de ${this._esc(org)}</span>` : '';
    return `
      <section class="dash-hero" id="dashHero" data-tab="${this._esc(tabId)}" aria-label="Resumen del dashboard">
        <div class="dash-hero-grad" aria-hidden="true"></div>
        <div class="dash-hero-inner">
          <h1 class="dash-hero-title" id="dashHeroTitle"><strong>${this._esc(copy.strong)}</strong>${light}</h1>
          <p class="dash-hero-desc" id="dashHeroDesc">${this._esc(copy.desc)}</p>
          <nav class="dash-hero-tabs" id="dashHeroTabs" role="tablist">
            ${DashboardView.TABS.map((t) => `
              <button class="dash-hero-tab${this._activeTab === t.id ? ' is-active' : ''}" role="tab" data-tab="${t.id}">${this._esc(t.label)}</button>`).join('')}
          </nav>
          <div class="dash-hero-kpis" id="dashHeroKpis">${this._buildHeroKpis(null)}</div>
        </div>
      </section>`;
  }

  // Tira de KPIs del hero. Con `data` pinta valores reales; sin data, skeleton.
  _buildHeroKpis(data) {
    const items = this._heroKpiItems(data);
    return items.map((k) => {
      const delta = k.delta
        ? `<span class="dash-kpi-delta is-${k.delta.dir}"><i class="fas fa-arrow-${k.delta.dir === 'down' ? 'down' : 'up'}"></i>${this._esc(k.delta.txt)}</span>`
        : '';
      const valCls = k.loading ? ' is-loading' : '';
      const suffix = k.suffix ? `<span class="dash-kpi-suffix">${this._esc(k.suffix)}</span>` : '';
      return `
        <div class="dash-kpi">
          <span class="dash-kpi-label">${this._esc(k.label)}</span>
          <span class="dash-kpi-value${valCls}">${this._esc(k.value)}${suffix}</span>
          ${delta}
        </div>`;
    }).join('');
  }

  // Construye los 5 KPIs a partir de la data de "Mi Marca". Sin data → '—'.
  _heroKpiItems(data) {
    const oi     = data?.optimizationInsights?.data || {};
    const health = data?.health?.data || {};
    const list   = Array.isArray(data?.list) ? data.list : [];
    const loading = !data;
    const num = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('es-CO'));
    const pct = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${Math.round(Number(n))}%`);
    const trend = (n) => {
      if (n == null || !Number.isFinite(Number(n))) return null;
      const v = Math.round(Number(n));
      return { dir: v > 0 ? 'up' : v < 0 ? 'down' : 'flat', txt: `${v > 0 ? '+' : ''}${v}%` };
    };
    return [
      { label: 'Salud de marca', value: health.score != null ? String(Math.round(Number(health.score))) : '—', suffix: health.score != null ? '/100' : '', loading },
      { label: 'Engagement vs previo', value: trend(oi.engagement_vs_prior_period_pct)?.txt || '—', delta: trend(oi.engagement_vs_prior_period_pct), loading },
      { label: 'Posts analizados', value: num(oi.posts_analyzed), loading },
      { label: 'Consistencia', value: pct(oi.posting_consistency?.posting_consistency_pct), loading },
      { label: 'Campanas', value: list.length ? String(list.length) : '—', loading },
    ];
  }

  // Pinta los KPIs reales en el hero (idempotente). Llamado tras cargar la
  // data de "Mi Marca" o por _ensureHeroKpis en background.
  _renderHeroKpis(data) {
    if (data) this._heroKpiData = data;
    const host = document.getElementById('dashHeroKpis');
    if (host) host.innerHTML = this._buildHeroKpis(this._heroKpiData || null);
  }

  // Si aun no hay data de marca cacheada, dispara una carga en background
  // (sin bloquear el render del tab activo) y refresca la tira de KPIs.
  async _ensureHeroKpis() {
    if (this._heroKpiData) { this._renderHeroKpis(); return; }
    // En "Mi Marca" la propia carga del tab alimenta los KPIs: evitamos
    // disparar un segundo loadAll en paralelo (doble rafaga de RPCs).
    if (this._activeTab === 'my-brands') return;
    if (this._heroKpiLoading || !this._orgId) return;
    this._heroKpiLoading = true;
    try {
      await this._ensureCampanasService();
      this._restoreMbFilters();
      const data = await this._loadMyBrandsData();
      this._renderHeroKpis(data);
    } catch (e) {
      console.warn('[Dashboard] hero KPIs load failed:', e);
    } finally {
      this._heroKpiLoading = false;
    }
  }

  // Refresca titulo (peso mixto) + descripcion + el trio de colores (data-tab)
  // y el tab activo, sin reconstruir el degradado (asi la animacion no se
  // reinicia). Los KPIs son de marca: no cambian al cambiar de tab.
  _updateHero(tabId) {
    const copy = DashboardView.HERO_COPY[tabId] || DashboardView.HERO_COPY['my-brands'];
    const hero = document.getElementById('dashHero');
    if (hero) {
      hero.dataset.tab = tabId;
      hero.querySelectorAll('.dash-hero-tab')
        .forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tabId));
    }
    const title = document.getElementById('dashHeroTitle');
    if (title) {
      const org = window.currentOrgName || '';
      const light = org ? ` <span class="dash-hero-title-light">de ${this._esc(org)}</span>` : '';
      title.innerHTML = `<strong>${this._esc(copy.strong)}</strong>${light}`;
    }
    const d = document.getElementById('dashHeroDesc');
    if (d) d.textContent = copy.desc;
  }

  /** Click handler de los tabs del hero (delegado, un solo listener). */
  _setupHeroTabs() {
    const nav = document.getElementById('dashHeroTabs');
    if (!nav || nav._wired) return;
    nav._wired = true;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) this._switchTab(btn.dataset.tab, /* fromUser */ true);
    });
  }

  _setupTabs() {
    // El click de los tabs lo maneja el hero (_setupHeroTabs).
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

    this._updateHero(tabId);
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
