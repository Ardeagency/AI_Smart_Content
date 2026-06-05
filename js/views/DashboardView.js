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
  static get documentTitle() { return __('Inicio'); }

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
    return `<span class="dash-freshness${stale}" title="${__('Ultima captura de datos del scraping')}">
      <i class="dash-freshness-dot"></i> ${__('Datos al {fecha}', { fecha: this._esc(this._fmtFreshness(ts, days)) })}
    </span>`;
  }

  _fmtFreshness(ts, days) {
    try {
      const d = new Date(ts);
      const dl = (window.i18n && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO';
      const dateStr = d.toLocaleDateString(dl, { day: 'numeric', month: 'short' });
      if (days <= 0) return __('hoy ({date})', { date: dateStr });
      if (days === 1) return __('ayer ({date})', { date: dateStr });
      return dateStr;
    } catch (_) { return ''; }
  }

  /* ── Dropdown "Crear informe" (barra de filtros, derecha) ──────────────
     <details> nativo: el toggle no necesita JS. Solo manejamos el click de
     opcion + cierre al hacer click afuera, via un listener delegado unico. */
  _reportDropdown() {
    const opts = [
      { k: 'competencia', label: __('Informes de competencia') },
      { k: 'diagnostico', label: __('Diagnostico de marca') },
      { k: 'ventas',      label: __('Informes de ventas') },
      { k: 'productos',   label: __('Research de productos') },
    ];
    return `
      <details class="dash-report-dd">
        <summary class="dash-report-btn"><i class="fas fa-file-circle-plus"></i><span>${__('Crear informe')}</span><i class="fas fa-chevron-down dash-report-caret"></i></summary>
        <div class="dash-report-menu">
          ${opts.map((o) => `<button type="button" class="dash-report-item" data-report="${o.k}">${o.label}</button>`).join('')}
        </div>
      </details>`;
  }

  /* ── Filtro como menu custom (reemplaza <select> nativo) ────────────────
     Pill .living-filter con un <details> dentro: el trigger muestra label +
     valor, y el menu reusa el estilo de "Crear informe". La seleccion la maneja
     un click delegado en cada vista (data-filter-key / data-filter-value). */
  _buildFilterMenu({ label, value, options, key }) {
    const cur = options.find(([v]) => v === (value || '')) || options[0];
    const curLabel = cur ? cur[1] : '';
    return `
      <details class="living-filter living-filter--menu" data-filter-menu>
        <summary class="living-filter-menu-trigger">
          <span class="living-filter-label">${this._esc(label)}</span>
          <span class="living-filter-menu-value">
            <span data-filter-menu-text>${this._esc(curLabel)}</span>
            <i class="fas fa-chevron-down living-filter-menu-caret" aria-hidden="true"></i>
          </span>
        </summary>
        <div class="living-filter-menu">
          ${options.map(([v, l]) => `<button type="button" class="living-filter-menu-item${v === (value || '') ? ' is-active' : ''}" data-filter-key="${this._esc(key)}" data-filter-value="${this._esc(v)}">${this._esc(l)}</button>`).join('')}
        </div>
      </details>`;
  }

  /* Click delegado para los menus de filtro: actualiza el texto del trigger,
     marca el activo y cierra el <details>. Devuelve { key, value } del item
     seleccionado, o null si el click no fue sobre un item. */
  _handleFilterMenuClick(e) {
    const item = e.target.closest('[data-filter-value]');
    if (!item) return null;
    const dd = item.closest('details.living-filter--menu');
    if (dd) {
      dd.removeAttribute('open');
      const txt = dd.querySelector('[data-filter-menu-text]');
      if (txt) txt.textContent = item.textContent;
      dd.querySelectorAll('.living-filter-menu-item').forEach((b) => b.classList.toggle('is-active', b === item));
    }
    return { key: item.dataset.filterKey, value: item.dataset.filterValue || '' };
  }

  _setupReportDropdown() {
    if (this._reportClickHandler) return;
    this._reportClickHandler = (e) => {
      // Cerrar dropdowns abiertos al hacer click afuera (informe + menus de filtro).
      document.querySelectorAll('details.dash-report-dd[open], details.living-filter--menu[open]').forEach((dd) => {
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
      competencia: __('Informes de competencia'),
      diagnostico: __('Diagnostico de marca'),
      ventas: __('Informes de ventas'),
      productos: __('Research de productos'),
    };
    const label = labels[type] || __('Informe');
    if (typeof window.showToast === 'function') {
      window.showToast(__('{label}: próximamente', { label }), { type: 'info' });
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
    // Restaurar filtros guardados antes de construir el hero (los controles
    // reflejan el estado persistido).
    this._restoreMbFilters?.();
    container.innerHTML = this._buildShell();
    // Los tabs ahora viven DENTRO del hero (sobre el degradado), no en el
    // header global. Limpiamos cualquier subnav residual del header.
    this.clearSubnavFromHeader();
    this._setupHeroTabs();
    this._setupHeroFilters();
    this._mountMbDatePicker?.(document.getElementById('dashHero'));
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
    // Hero a sangre completa (degradado dinamico de la marca) con titulo en peso
    // mixto, los tabs encima del degradado y una tira de KPIs en vidrio.
    // Debajo, el cuerpo del tab activo.
    return `
      <div class="insight-page page-content insight-page--hero" id="insightPage">
        ${this._buildHero(this._activeTab)}
        <div class="insight-tab-body" id="insightTabBody"></div>
      </div>`;
  }

  // Definicion unica de los tabs (orden = orden visual en el hero).
  // Getter (no static field) para que __() se evalue con el idioma activo.
  static get TABS() {
    return [
      { id: 'my-brands',  label: __('Mi Marca')    },
      { id: 'competence', label: __('Competencia') },
      { id: 'tendencies', label: __('Tendencias')  },
      { id: 'strategy',   label: __('Estrategia')  },
    ];
  }

  // Copy del hero por tab: titulo (parte fuerte + parte ligera) + descripcion.
  // El degradado del hero es el dinamico de la marca (--brand-gradient-dynamic).
  static get HERO_COPY() {
    return {
      'my-brands': {
        strong: __('Mi Marca'),
        desc: __('El pulso de tu marca: salud, campanas activas y como rinde tu contenido frente a tu audiencia.'),
      },
      'competence': {
        strong: __('Competencia'),
        desc: __('El campo de batalla: que publican tus competidores, la voz de su audiencia y sus vulnerabilidades.'),
      },
      'tendencies': {
        strong: __('Tendencias'),
        desc: __('El pulso del nicho: senales emergentes, oceanos azules, lexico vivo y marcas que despuntan.'),
      },
      'strategy': {
        strong: __('Estrategia'),
        desc: __('Las recomendaciones de Vera: lecturas cruzadas de todas las senales y aprendizaje continuo.'),
      },
    };
  }

  // Hero estilo overview: degradado dinamico de la marca + titulo en
  // peso mixto + tabs sobre el degradado + cards del plan de accion.
  _buildHero(tabId) {
    const copy = DashboardView.HERO_COPY[tabId] || DashboardView.HERO_COPY['my-brands'];
    const org  = window.currentOrgName || '';
    const light = org ? ` <span class="dash-hero-title-light">de ${this._esc(org)}</span>` : '';
    // Filtros (Fecha + Plataforma) + boton "Crear informe": viven en el hero,
    // alineados a la derecha del titulo. Solo aplican a Mi Marca (el CSS los
    // oculta en los demas tabs).
    const actions = (typeof this._buildMbFiltersBar === 'function')
      ? `<div class="dash-hero-actions">${this._buildMbFiltersBar(this._heroKpiData || null)}</div>`
      : '';
    return `
      <section class="dash-hero" id="dashHero" data-tab="${this._esc(tabId)}" aria-label="Resumen del dashboard">
        <div class="dash-hero-grad" aria-hidden="true"></div>
        <div class="dash-hero-inner">
          <div class="dash-hero-top">
            <div class="dash-hero-headings">
              <h1 class="dash-hero-title" id="dashHeroTitle"><strong>${this._esc(copy.strong)}</strong>${light}</h1>
              <p class="dash-hero-desc" id="dashHeroDesc">${this._esc(copy.desc)}</p>
            </div>
            ${actions}
          </div>
          <nav class="dash-hero-tabs" id="dashHeroTabs" role="tablist">
            ${DashboardView.TABS.map((t) => `
              <button class="dash-hero-tab${this._activeTab === t.id ? ' is-active' : ''}" role="tab" data-tab="${t.id}">${this._esc(t.label)}</button>`).join('')}
          </nav>
          <div class="dash-hero-cards" id="dashHeroCards">${this._buildHeroCards(null)}</div>
        </div>
      </section>`;
  }

  // Cards del plan de accion (EXPLOTA/OPTIMIZA/ELIMINA/VIGILA) en el hero.
  // Reusan EXACTAMENTE las clases .mb-plan-* del cuerpo (mismo diseno y
  // proporciones) pero sin el parrafo "why" (texto redundante) ni el boton
  // de expandir. Sin data → 4 placeholders con shimmer.
  _buildHeroCards(data) {
    if (!data || typeof this._computeActionPlanItems !== 'function') {
      return Array.from({ length: 4 }, () => `<div class="dash-hero-card-skeleton"></div>`).join('');
    }
    const insights = Array.isArray(data?.whatWorks?.data) ? data.whatWorks.data : [];
    const items = this._computeActionPlanItems(data, insights);
    const defs = [
      { kind: 'explota',  label: 'Explota',  item: items.explota  },
      { kind: 'optimiza', label: 'Optimiza', item: items.optimiza },
      { kind: 'elimina',  label: 'Elimina',  item: items.elimina  },
      { kind: 'vigila',   label: 'Vigila',   item: items.vigila   },
    ];
    const cards = defs.filter((d) => d.item).map((d) => {
      const it = d.item;
      const metric = it.metric
        ? `<div class="mb-plan-metric"><span class="mb-plan-metric-val">${this._esc(it.metric)}</span>${it.metricSub ? `<span class="mb-plan-metric-sub">${this._esc(it.metricSub)}</span>` : ''}</div>`
        : '';
      return `
        <div class="mb-plan-col mb-plan-col--${d.kind}">
          <div class="mb-plan-col-head"><span class="mb-plan-cat">${d.label}</span></div>
          ${metric}
          ${it.title ? `<div class="mb-plan-title">${this._esc(it.title)}</div>` : ''}
        </div>`;
    });
    return cards.join('') || this._buildHeroCards(null);
  }

  // Pinta las cards reales en el hero (idempotente). Llamado tras cargar la
  // data de "Mi Marca" o por _ensureHeroCards en background.
  _renderHeroCards(data) {
    if (data) this._heroKpiData = data;
    const host = document.getElementById('dashHeroCards');
    if (host) host.innerHTML = this._buildHeroCards(this._heroKpiData || null);
  }

  // Si aun no hay data de marca cacheada, dispara una carga en background
  // (sin bloquear el render del tab activo) y refresca las cards del hero.
  async _ensureHeroKpis() {
    if (this._heroKpiData) { this._renderHeroCards(); return; }
    // En "Mi Marca" la propia carga del tab alimenta las cards: evitamos
    // disparar un segundo loadAll en paralelo (doble rafaga de RPCs).
    if (this._activeTab === 'my-brands') return;
    if (this._heroKpiLoading || !this._orgId) return;
    this._heroKpiLoading = true;
    try {
      await this._ensureCampanasService();
      this._restoreMbFilters();
      const data = await this._loadMyBrandsData();
      this._renderHeroCards(data);
    } catch (e) {
      console.warn('[Dashboard] hero cards load failed:', e);
    } finally {
      this._heroKpiLoading = false;
    }
  }

  // Refresca titulo (peso mixto) + descripcion + el tab activo. data-tab solo
  // controla la visibilidad de las acciones (el degradado es el dinamico de la
  // marca, igual en los 4 tabs). Los KPIs son de marca: no cambian por tab.
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

  /** Cambio de filtros (Plataforma) desde el hero → delega en MyBrands.
      El date picker llama _onMbFilterChange por su cuenta (onChange). */
  _setupHeroFilters() {
    const hero = document.getElementById('dashHero');
    if (!hero || hero._filtersWired) return;
    hero._filtersWired = true;
    hero.addEventListener('change', (e) => {
      const el = e.target.closest('[data-mb-filter]');
      if (!el || typeof this._onMbFilterChange !== 'function') return;
      const key = el.dataset.mbFilter;
      if (key === 'platform') { this._onMbFilterChange({ platforms: el.value ? [el.value] : null }); return; }
      let value = el.value;
      if (key === 'windowDays') value = Number(value) || 30;
      if (key === 'brandContainerId') value = value || null;
      this._onMbFilterChange({ [key]: value });
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
          ${__('Próximamente')}
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
