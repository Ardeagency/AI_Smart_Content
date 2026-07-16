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

  // Auto-actualizacion en vivo: cada cuanto el tab activo re-lee datos en
  // background (silencioso, sin skeleton ni recargar la pagina). Complementa al
  // realtime de Supabase (que solo dispara si la tabla tiene replication on);
  // el polling cubre datos que llegan via scrapers/jobs/RPCs agregadas.
  static AUTO_REFRESH_MS = 60000;

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
    // Canales realtime los gestiona BaseView (this._liveChannels) via liveSubscribe/liveUnsubscribe.
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
    // Mini tutorial para usuarios recién creados (flag dejado por el signup).
    try { window.OnboardingTour && window.OnboardingTour.maybeStart(); } catch (_) {}
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
    // Auto-refresh periodico (polling cada 60s) DESACTIVADO a proposito.
    // Recargaba toda la data en un timer ciego y, como los RPC devuelven
    // timestamps volatiles (computed_at: now()), la firma de datos cambiaba en
    // cada tick y forzaba un rebuild completo de innerHTML + destruccion/recreacion
    // de charts => parpadeo visible aunque nada cambiara. La data ahora se refresca
    // solo por eventos reales (realtime, ver _subscribeRealtime), al entrar al tab,
    // cambiar filtros o navegar. Ese es el patron profesional: refrescar por evento
    // genuino, no por reloj. Para reactivar: this._startAutoRefresh();
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
        <summary class="dash-report-btn"><i class="aisc-ico aisc-ico--document"></i><span>${__('Crear informe')}</span><i class="aisc-ico dash-report-caret aisc-ico--chevron-down"></i></summary>
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
            <i class="aisc-ico living-filter-menu-caret aisc-ico--chevron-down" aria-hidden="true"></i>
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
    this._stopAutoRefresh();
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
    if (!this._orgId) return;
    if (this._liveChannels?.length) return;

    const orgFilter = `organization_id=eq.${this._orgId}`;
    const sub = (name, table, scopes) => ({
      name, table, filter: orgFilter,
      onChange: (payload) => this._onRealtimeChange(scopes, payload),
    });

    this.liveSubscribe([
      sub('vpa',  'vera_pending_actions',  ['strategy']),
      sub('vuln', 'brand_vulnerabilities', ['my-brands', 'strategy']),
      sub('bm',   'body_missions',         ['strategy']),
      sub('rp',   'retail_prices',         ['competence']),
      sub('tt',   'trend_topics',          ['tendencies']),
      // FEAT-023: invalida sección Mis Campañas si cambian ad_insights_daily o campaigns.
      sub('aid',  'ad_insights_daily',     ['my-brands']),
      sub('camp', 'campaigns',             ['my-brands']),
      sub('cb',   'campaign_briefs',       ['my-brands']),
      // intelligence_signals: filtro lo hace el handler (la tabla no tiene
      // organization_id; verificamos entity_id contra los services al recibir).
      {
        name: 'sig', table: 'intelligence_signals', event: 'INSERT',
        onChange: (payload) => {
          const entityId = payload?.new?.entity_id;
          const known = (this._mbService?.entityIds || this._compService?.entityIds || []);
          if (entityId && known.length && !known.includes(entityId)) return;
          this._onRealtimeChange(['my-brands', 'tendencies'], payload);
        },
      },
      // PROTOCOLO LIBERTAD: cuando Vera publica una lectura/diagnóstico nuevo,
      // el dashboard del cliente se actualiza SOLO. Mapea el scope de la fila
      // a su tab; scope 'diagnostico' vive en Mi Marca.
      {
        name: 'vera', table: 'vera_dashboard_readings', filter: orgFilter,
        onChange: (payload) => {
          if ((payload?.new?.status || 'published') !== 'published') return;
          const SCOPE_TAB = {
            mi_marca: 'my-brands', diagnostico: 'my-brands',
            monitoreo: 'competence', tendencias: 'tendencies', estrategia: 'strategy',
          };
          const tab = SCOPE_TAB[payload?.new?.scope];
          if (!tab) return;
          this._veraReadingService?.invalidate?.();
          this._veraReadings = null;
          this._onRealtimeChange([tab], payload);
        },
      },
    ]);
  }

  _unsubscribeRealtime() {
    this.liveUnsubscribe();
  }

  _onRealtimeChange(scopes, _payload) {
    this._invalidateScopes(scopes);
    if (!scopes.includes(this._activeTab)) return;
    if (!document.getElementById('insightTabBody')) return;
    // Re-render silencioso (sin skeleton): el usuario ve la data nueva aparecer
    // en su sitio, no una recarga del layout.
    this._refreshActiveTabSilently();
  }

  /* Invalida el cache local del mixin + el del apiClient para los scopes dados,
     de modo que el proximo loadAll vaya a Supabase y no devuelva data stale.
     Compartido por el realtime (_onRealtimeChange) y el polling (_startAutoRefresh). */
  _invalidateScopes(scopes) {
    const orgId = this._orgId;
    if (scopes.includes('my-brands'))  {
      this._mbData = null;
      this._mbCampanasData = null;
      window.apiClient?.invalidate((k) => k.startsWith(`dash:mi-brand:${orgId}`) || k.startsWith(`dash:campanas:${orgId}`));
    }
    if (scopes.includes('competence')) { this._compData  = null; window.apiClient?.invalidate((k) => k.startsWith(`dash:competencia:${orgId}`)); }
    if (scopes.includes('tendencies')) { this._tendData  = null; window.apiClient?.invalidate((k) => k.startsWith(`dash:tendencias:${orgId}`)); }
    if (scopes.includes('strategy'))   { this._stratData = null; window.apiClient?.invalidate(`dash:strategia:${orgId}`); }
  }

  /* ── Auto-actualizacion en vivo (polling silencioso) ───────────────────
     Cada AUTO_REFRESH_MS, mientras la pestana este visible, re-lee los datos
     del tab activo y los re-pinta SIN skeleton (this._silentRefresh suprime
     los skeletons de cada mixin). Pausa cuando el documento esta oculto y
     refresca de inmediato al volver. No corre si el usuario tiene un menu
     abierto (dropdown de filtros/informe) para no interrumpir su interaccion. */
  _startAutoRefresh() {
    if (this._autoRefreshTimer || !this._orgId) return;
    const period = DashboardView.AUTO_REFRESH_MS || 60000;
    this._autoRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      this._invalidateScopes([this._activeTab]);
      this._refreshActiveTabSilently();
    }, period);
    // Al volver a una pestaña que estuvo oculta, refrescar enseguida (la data
    // pudo cambiar mientras no se veia) en vez de esperar al proximo tick.
    this._onVisRefresh = () => {
      if (document.hidden) return;
      this._invalidateScopes([this._activeTab]);
      this._refreshActiveTabSilently();
    };
    document.addEventListener('visibilitychange', this._onVisRefresh);
  }

  _stopAutoRefresh() {
    if (this._autoRefreshTimer) { clearInterval(this._autoRefreshTimer); this._autoRefreshTimer = null; }
    if (this._onVisRefresh) { document.removeEventListener('visibilitychange', this._onVisRefresh); this._onVisRefresh = null; }
  }

  /* Re-pinta el tab activo en background sin skeleton ni parpadeo de charts.
     - this._silentRefresh hace que los _render*Skeleton sean no-op: el contenido
       viejo se queda en pantalla hasta que el innerHTML nuevo lo reemplaza.
     - Los charts viejos se preservan visibles hasta el swap y se destruyen
       despues (evita el frame en blanco de destruir-antes-de-cargar).
     - Re-lee la frescura para que el chip "Datos al …" avance. */
  async _refreshActiveTabSilently() {
    if (this._silentRefresh) return;                       // ya hay un refresh en vuelo
    const body = document.getElementById('insightTabBody');
    if (!body || document.hidden) return;
    // No interrumpir si el usuario tiene un menu abierto (filtros / crear informe).
    if (document.querySelector('details.dash-report-dd[open], details.living-filter--menu[open]')) return;

    const tab = this._activeTab;
    const page = document.getElementById('insightPage');
    const prevCharts = this._charts;
    this._charts = [];                                     // el render nuevo registra aqui (si pinta)
    this._silentRefresh = true;
    this._silentChanged = false;                           // el gate (_shouldRepaint) lo pone true si hubo repaint real
    page?.classList.add('is-refreshing');
    try {
      this._freshness = undefined;                         // forzar re-lectura de frescura
      await this._ensureFreshness();
      if (this._activeTab !== tab) return;                 // el usuario cambio de tab mientras tanto
      await this._renderTab(tab);
    } catch (e) {
      console.warn('[Dashboard] auto-refresh failed:', e?.message || e);
    } finally {
      this._silentRefresh = false;
      page?.classList.remove('is-refreshing');
      if (this._silentChanged) {
        // Hubo repaint real: this._charts ya tiene los charts nuevos; destruir los viejos.
        prevCharts.forEach(c => { try { c.destroy(); } catch (_) {} });
      } else {
        // Sin cambios (o el usuario cambio de tab): el mixin abortó el repaint.
        // Conservar el DOM y los charts viejos intactos = cero parpadeo.
        this._charts = prevCharts;
      }
    }
  }

  /* _dataSignature(data) lo provee BaseView (firma djb2 compartida por toda
     la plataforma). El Dashboard solo agrega su orquestacion por tab/charts. */

  /* Decide si el tab debe re-pintarse con estos datos. Es el corazon del
     "refresh sin parpadeo":
       - Render normal (no silencioso): siempre pinta y memoriza la firma.
       - Refresh silencioso (polling / realtime): solo pinta si la firma cambio
         respecto al ultimo pintado de ese tab. Si no cambio, devuelve false y
         el mixin debe `return` sin tocar el DOM ni registrar charts; el
         orquestador conserva todo intacto. */
  _shouldRepaint(tab, data) {
    if (!this._renderSig) this._renderSig = {};
    // Guard de tab activo: el body (#insightTabBody) es COMPARTIDO por los 4 tabs.
    // Un render en vuelo (carga lenta o refresh silencioso) de un tab que el usuario
    // YA abandono jamas debe pintar el body — sobrescribiria el cuerpo del tab actual.
    if (tab !== this._activeTab) return false;
    const sig = this._dataSignature(data);
    if (!this._silentRefresh) { this._renderSig[tab] = sig; this._bodyTab = tab; return true; }
    // Saltar el repaint solo es seguro si el body YA muestra ESTE tab con la misma
    // firma. Si el body tiene el cuerpo de otro tab (el usuario cambio de tab mientras
    // un refresh silencioso estaba en vuelo), hay que pintar si o si — de lo contrario
    // queda el body de otro tab bajo el hero/tab nuevo (bug: "estoy en Tendencias pero
    // el tab dice Competencia").
    if (this._bodyTab === tab && sig != null && this._renderSig[tab] === sig) return false; // sin cambios reales
    this._renderSig[tab] = sig;
    this._bodyTab = tab;
    this._silentChanged = true;
    return true;
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
    this._mountTabDatePicker();
    this._setupTabs();
    this._setupReportDropdown();
    this._renderTab(this._activeTab);
    // KPIs del hero: se llenan en background (data de marca compartida).
    this._ensureHeroKpis();
    // Marca de agua: logo de la org en la esquina inferior derecha del hero.
    this._loadHeroLogo();
    // Burbujas de integraciones activas en la barra de filtros (async → repinta).
    this._ensureHeroIntegrations().then(() => this._renderHeroActions());
  }

  /* ── Integraciones activas del hero ─────────────────────────────────
     Plataformas sociales conectadas de la org (brand_integrations.is_active de
     sus brand_containers), como burbujas en la barra de filtros. Cache en la
     instancia. Devuelve un array de claves normalizadas (instagram/facebook/…). */
  async _ensureHeroIntegrations() {
    if (this._heroIntegrations !== undefined) return this._heroIntegrations;
    this._heroIntegrations = []; // valor por defecto (guard de "en vuelo"/sin datos)
    if (!this._supabase || !this._orgId) return this._heroIntegrations;
    try {
      let ids = (this._campanasService?.containers || []).map((c) => c.id).filter(Boolean);
      if (!ids.length) {
        const { data: cs } = await this._supabase
          .from('brand_containers').select('id').eq('organization_id', this._orgId);
        ids = (cs || []).map((c) => c.id).filter(Boolean);
      }
      if (!ids.length) return this._heroIntegrations;
      const { data } = await this._supabase
        .from('brand_integrations')
        .select('platform')
        .in('brand_container_id', ids)
        .eq('is_active', true);
      // TODAS las integraciones activas (sociales + marketplaces: Mercado Libre,
      // Shopify, etc.), no solo las sociales. Normaliza twitter→x y deduplica.
      const set = new Set();
      (data || []).forEach((r) => {
        let p = String(r.platform || '').toLowerCase().trim();
        if (!p) return;
        if (p === 'twitter') p = 'x';
        set.add(p);
      });
      // Meta: la fila 'facebook' es la conexion de Meta, que enlaza la Pagina de
      // Facebook Y su cuenta de Instagram vinculada (NO existe una fila 'instagram'
      // propia). Si Meta esta activo, mostramos ambas burbujas — el usuario espera
      // ver Instagram, no solo Facebook.
      if (set.has('facebook')) set.add('instagram');
      // Orden de presentacion estable: sociales primero, luego marketplaces/web.
      const ORDER = ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'linkedin', 'mercadolibre', 'shopify', 'google'];
      this._heroIntegrations = [...set].sort((a, b) => {
        const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    } catch (_) { /* silencioso: las burbujas son informativas */ }
    return this._heroIntegrations;
  }

  /* Burbujas de plataformas integradas + burbuja "+" para agregar otra (lleva a
     Identidad/INFO). Se inyecta en la barra de filtros de cada tab. */
  _buildIntegrationBubbles() {
    const list = Array.isArray(this._heroIntegrations) ? this._heroIntegrations : [];
    // Sociales → icono de marca de FontAwesome (en el subset). Marketplaces/web
    // (Mercado Libre, Shopify) → SVG de /recursos/icons (FA no trae esos glifos).
    const META = {
      instagram:    { icon: 'fab fa-instagram', label: 'Instagram' },
      facebook:     { icon: 'fab fa-facebook',  label: 'Facebook' },
      tiktok:       { icon: 'fab fa-tiktok',    label: 'TikTok' },
      x:            { icon: 'fab fa-x-twitter', label: 'X' },
      youtube:      { icon: 'fab fa-youtube',   label: 'YouTube' },
      linkedin:     { icon: 'fab fa-linkedin',  label: 'LinkedIn' },
      google:       { icon: 'fab fa-google',    label: 'Google' },
      shopify:      { icon: 'fab fa-shopify',   label: 'Shopify' },
      mercadolibre: { iconSrc: '/recursos/icons/mercadolibre.svg', label: 'Mercado Libre' },
    };
    const bubbles = list.map((p) => {
      // Fallback para plataformas sin mapeo: icono genérico de tienda + su nombre.
      const m = META[p] || { iconSrc: '/recursos/icons/store.svg', label: this._capitalize ? this._capitalize(p) : p };
      const inner = m.iconSrc
        ? `<img src="${this._esc(m.iconSrc)}" alt="" aria-hidden="true">`
        : `<i class="${this._esc(m.icon)}"></i>`;
      return `<span class="dash-integ-bubble" title="${this._esc(m.label)}" aria-label="${this._esc(m.label)}">${inner}</span>`;
    }).join('');
    return `
      <div class="dash-integ" role="group" aria-label="${__('Integraciones activas')}">
        ${bubbles}
        <button type="button" class="dash-integ-bubble dash-integ-add" data-action="add-integration" title="${__('Agregar integración')}" aria-label="${__('Agregar integración')}"><i class="aisc-ico aisc-ico--add"></i></button>
      </div>`;
  }

  /* ── Marca de agua del hero ─────────────────────────────────────────
     Logo de la org (organizations.logo_url) en la esquina superior derecha
     del hero. El COLOR es dinamico segun la luminancia del degradado bajo el
     logo: blanco sobre fondo oscuro (default), gris oscuro sobre fondo palido
     (para que no desaparezca). Si no hay logo, el <img> queda oculto. */
  async _loadHeroLogo() {
    const img = document.getElementById('dashHeroLogo');
    if (!img || !this._supabase || !this._orgId) return;
    try {
      // Cache en instancia para no re-consultar al cambiar de tab.
      if (this._orgLogoUrl === undefined) {
        const { data } = await this._supabase
          .from('organizations')
          .select('logo_url')
          .eq('id', this._orgId)
          .maybeSingle();
        this._orgLogoUrl = String(data?.logo_url || '').trim() || null;
      }
      if (this._orgLogoUrl) {
        // Anti-parpadeo: el <img> arranca INVISIBLE (opacity:0 en CSS + hidden).
        // Al revelarlo, unhide + tint en el MISMO tick (sin rAF intermedio): al
        // salir de display:none con la opacidad final ya fijada, el navegador lo
        // pinta directo en su estado final (0.16 blanco / 0.30 palido) sin animar
        // desde ningun valor => cero flash. El re-tint del onload recoge el
        // degradado real de la marca (OrgBrandTheme aplica post-render).
        const reveal = () => {
          // Re-tint (2do onload con el degradado real ya aplicado): solo re-mide,
          // no re-dispara la animacion de entrada.
          if (img.dataset.revealed === '1') { this._tintHeroLogo(); return; }
          img.hidden = false;
          this._tintHeroLogo();            // fija opacidad+filtro finales inline
          img.dataset.revealed = '1';
          // Animacion de entrada: heroLogoIn (backwards) pinta opacity:0 desde el
          // primer frame y sube suave hasta la opacidad final => sin flash y con
          // entrada profesional. Se agrega en el MISMO tick (no rAF) para que
          // funcione aunque el tab este en background.
          img.classList.add('is-entering');
          // Tras la entrada, habilitar transiciones para re-tintes posteriores.
          img.addEventListener('animationend', () => img.classList.add('is-tinted'), { once: true });
        };
        img.onload = reveal;
        img.onerror = () => { img.hidden = true; };
        img.src = this._orgLogoUrl;
        // Imagen ya cacheada (tipico al refrescar): onload puede no disparar → revelar a mano.
        if (img.complete && img.naturalWidth) reveal();
      }
    } catch (_) { /* silencioso: la marca de agua es decorativa */ }
  }

  /* Tinta el logo del hero segun la luminancia del degradado bajo el logo.
     Logica compartida en BaseView.tintLogoByGradient (blanco/gris dinamico). */
  _tintHeroLogo() {
    const img = document.getElementById('dashHeroLogo');
    if (!img) return;
    // El hero ya no se rellena con el degradado de marca (solo luz ambiente): el
    // fondo del hero es SIEMPRE oscuro, sin importar la paleta de la org. Por eso
    // la marca de agua va siempre en blanco (antes se tintaba por la luminancia
    // del degradado, que ahora ya no representa el fondo real).
    img.style.filter = 'brightness(0) invert(1) drop-shadow(0 2px 6px rgba(0,0,0,0.35))';
    img.style.opacity = '0.16';
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
        strong: __('El pulso de tu marca'),
        desc: __('Salud, campañas activas y cómo rinde tu contenido frente a tu audiencia.'),
      },
      'competence': {
        strong: __('El campo de batalla'),
        desc: __('Qué publican tus competidores, la voz de su audiencia y dónde son vulnerables.'),
      },
      'tendencies': {
        strong: __('Lo que se mueve en tu nicho'),
        desc: __('Señales emergentes, océanos azules, léxico vivo y marcas que despuntan.'),
      },
      'strategy': {
        strong: __('El siguiente movimiento'),
        desc: __('Las recomendaciones de Vera: lecturas cruzadas de todas las señales y aprendizaje continuo.'),
      },
    };
  }

  // Hero estilo overview: degradado dinamico de la marca + titulo en
  // peso mixto + tabs sobre el degradado + cards del plan de accion.
  _buildHero(tabId) {
    const copy = DashboardView.HERO_COPY[tabId] || DashboardView.HERO_COPY['my-brands'];
    // Filtros TAB-AWARE en el banner: cada tab muestra los suyos aquí (no en el
    // cuerpo). El manejo de cambios se centraliza en _setupHeroFilters.
    const actions = `<div class="dash-hero-actions" id="dashHeroActions">${this._buildTabFiltersBar(tabId)}</div>`;
    return `
      <section class="dash-hero" id="dashHero" data-tab="${this._esc(tabId)}" aria-label="Resumen del dashboard">
        <div class="dash-hero-grad" aria-hidden="true"></div>
        <img class="dash-hero-logo" id="dashHeroLogo" alt="" aria-hidden="true" hidden style="opacity:0" />
        <div class="dash-hero-inner">
          <div class="dash-hero-top">
            <div class="dash-hero-headings">
              <h1 class="dash-hero-title" id="dashHeroTitle"><strong>${this._esc(copy.strong)}</strong></h1>
              <p class="dash-hero-desc" id="dashHeroDesc">${this._esc(copy.desc)}</p>
            </div>
          </div>
          <nav class="dash-hero-tabs" id="dashHeroTabs" role="tablist">
            ${DashboardView.TABS.map((t) => `
              <button class="dash-hero-tab${this._activeTab === t.id ? ' is-active' : ''}" role="tab" data-tab="${t.id}">${this._esc(t.label)}</button>`).join('')}
          </nav>
          ${actions}
          <div class="dash-hero-cards" id="dashHeroCards">${this._buildHeroCards(null)}</div>
        </div>
      </section>`;
  }

  // Cards del plan de accion en el hero. Categoria en lenguaje natural (Lo que
  // funciona / Oportunidad / Lo que te resta / Riesgo) en vez del verbo jerga;
  // reusan las clases .mb-plan-* del cuerpo, con overrides scopeados a
  // .dash-hero-cards para la jerarquia (sujeto primero + linea de accion al pie).
  // Sin el parrafo "why" largo ni el boton de expandir. Sin data → 4 shimmers.
  _buildHeroCards(data) {
    // REDISEÑO VERA 2026-07: las 4 cards del hero se OCULTAN — la lectura de
    // Vera (vera_dashboard_readings) es ahora el contenido del tab. El código
    // de abajo queda intacto por si se reactivan.
    return '';
    // eslint-disable-next-line no-unreachable
    const skel = () => Array.from({ length: 4 }, () => `<div class="dash-hero-card-skeleton"></div>`).join('');
    // El hero es TAB-AWARE: en Competencia muestra las cards del campo de batalla
    // (fórmula del nicho / vulnerabilidad rival / te están ganando / amenaza), no
    // las de Mi Marca.
    if (this._activeTab === 'competence') {
      if (!this._compData || typeof this._computeCompetitionCards !== 'function') return skel();
      const c = this._computeCompetitionCards(this._compData);
      return this._renderHeroCardDefs([
        { kind: 'explota',  label: __('Fórmula del nicho'),    action: __('Estudia su fórmula'), item: c.funciona },
        { kind: 'optimiza', label: __('Vulnerabilidad rival'), action: __('Atácalo'),            item: c.oportunidad },
        { kind: 'elimina',  label: __('Te están ganando'),     action: __('Cierra la brecha'),   item: c.resta },
        { kind: 'vigila',   label: __('Amenaza'),              action: __('Vigílalo'),           item: c.riesgo },
      ]);
    }
    if (this._activeTab === 'tendencies') {
      if (!this._tendData || typeof this._computeTendenciesCards !== 'function') return skel();
      const c = this._computeTendenciesCards(this._tendData);
      return this._renderHeroCardDefs([
        { kind: 'explota',  label: __('Tendencia caliente'), action: __('Súbete a la ola'), item: c.funciona },
        { kind: 'optimiza', label: __('Oportunidad'),        action: __('Ocúpalo'),         item: c.oportunidad },
        { kind: 'elimina',  label: __('Marca emergente'),    action: __('Vigílala'),        item: c.resta },
        { kind: 'vigila',   label: __('Próximo evento'),     action: __('Prepáralo'),       item: c.riesgo },
      ]);
    }
    if (this._activeTab === 'strategy') {
      if (!this._stratData || typeof this._computeStrategyCards !== 'function') return skel();
      const c = this._computeStrategyCards(this._stratData);
      return this._renderHeroCardDefs([
        { kind: 'explota',  label: __('Tu mejor jugada'),  action: __('Apruébalo'),    item: c.funciona },
        { kind: 'optimiza', label: __('Por decidir'),      action: __('Revísalas'),    item: c.oportunidad },
        { kind: 'elimina',  label: __('Baja prioridad'),   action: __('Despriorízalas'), item: c.resta },
        { kind: 'vigila',   label: __('En producción'),    action: __('Mídelo'),       item: c.riesgo },
      ]);
    }
    if (!data || typeof this._computeActionPlanItems !== 'function') return skel();
    const insights = Array.isArray(data?.whatWorks?.data) ? data.whatWorks.data : [];
    const items = this._computeActionPlanItems(data, insights);
    return this._renderHeroCardDefs([
      { kind: 'explota',  label: __('Lo que funciona'), action: __('Produce más de esto'),  item: items.explota  },
      { kind: 'optimiza', label: __('Oportunidad'),     action: __('Aplícalo ya'),          item: items.optimiza },
      { kind: 'elimina',  label: __('Lo que te resta'), action: __('Redúcelo o evítalo'),   item: items.elimina  },
      { kind: 'vigila',   label: __('Riesgo'),          action: __('Revísalo'),             item: items.vigila   },
    ]);
  }

  // Render compartido de las cards del hero (Mi Marca + Competencia). Jerarquía:
  // categoría → sujeto arriba → evidencia → acción al pie. Guarda los items por
  // categoría para abrir el detalle (modal) al hacer click.
  _renderHeroCardDefs(defs) {
    this._heroPlanItems = {};
    const skel = () => Array.from({ length: 4 }, () => `<div class="dash-hero-card-skeleton"></div>`).join('');
    const cards = defs.filter((d) => d.item).map((d) => {
      const it = d.item;
      this._heroPlanItems[d.kind] = it;
      const metric = it.metric
        ? `<div class="mb-plan-metric"><span class="mb-plan-metric-val">${this._esc(it.metric)}</span>${it.metricSub ? `<span class="mb-plan-metric-sub">${this._esc(it.metricSub)}</span>` : ''}</div>`
        : '';
      // CTA unificado en todas las cards del hero: siempre "Ver detalles" (el detalle
      // abre el modal consultor). Se ignora it.action/d.action a proposito.
      const action = __('Ver detalles');
      const hasDetail = !!it.detail;
      const attrs = hasDetail ? ` data-plan-kind="${d.kind}" role="button" tabindex="0"` : '';
      return `
        <div class="mb-plan-col mb-plan-col--${d.kind}${hasDetail ? ' is-clickable' : ''}"${attrs}>
          <div class="mb-plan-col-head"><span class="mb-plan-cat">${this._esc(d.label)}</span></div>
          ${it.title ? `<div class="mb-plan-title">${this._esc(it.title)}</div>` : ''}
          ${metric}
          <div class="mb-plan-action">${this._esc(action)}<span class="mb-plan-action-arrow">→</span></div>
        </div>`;
    });
    return cards.join('') || skel();
  }

  // Pinta las cards reales en el hero (idempotente). Llamado tras cargar la
  // data de "Mi Marca" o por _ensureHeroCards en background.
  _renderHeroCards(data) {
    if (data) this._heroKpiData = data;
    const host = document.getElementById('dashHeroCards');
    if (!host) return;
    host.innerHTML = this._buildHeroCards(this._heroKpiData || null);
    // Click en una card → modal de detalle (consultor). Listener delegado una vez.
    if (!host._planBound) {
      host._planBound = true;
      const open = (e) => {
        const col = e.target.closest('.mb-plan-col[data-plan-kind]');
        if (!col) return;
        const it = this._heroPlanItems && this._heroPlanItems[col.getAttribute('data-plan-kind')];
        if (it && it.detail) this._openPlanDetail(it.detail);
      };
      host.addEventListener('click', open);
      host.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
    }
  }

  // Modal de detalle "consultor" de una card del plan: por que te conviene /
  // como lo exploto / evidencia y confianza. Reusa la primitiva Modal.show.
  async _openPlanDetail(detail) {
    if (!detail || !window.Modal || typeof window.Modal.show !== 'function') return;
    const secs = (detail.sections || []).map((s) => `
      <div class="plan-detail-sec">
        <div class="plan-detail-h">${this._esc(s.h)}</div>
        <div class="plan-detail-b">${this._esc(s.b)}</div>
      </div>`).join('');
    // Lista de findings (señales) — la usan las 4 cards. El borde toma el color de
    // la card (verde=funciona, azul=oportunidad; rojo/ámbar por severidad en las
    // negativas). El número se formatea según el tipo (lift%, conversión, ratio).
    const sevCls = (s) => (Number(s) >= 40 ? 'bad' : Number(s) >= 15 ? 'mid' : 'low');
    const findCls = (s) => (detail.color === 'explota' ? 'good' : detail.color === 'optimiza' ? 'opp' : sevCls(s));
    const CAT = { reputacion: __('Reputación'), desempeno: __('Desempeño'), tono: __('Tono'), tema: __('Tema'), formato: __('Formato'), pilar: __('Pilar'), caida_causal: __('Tendencia'), campana: __('Campaña'), top_post: __('Top post'), rival: __('Rival'), engagement: __('Brecha'), volumen: __('Volumen'), tendencia: __('Tendencia'), gap: __('Gap'), evento: __('Evento'), rec: __('Recomendación') };
    const findNum = (f) => (f.lift != null ? `${f.lift > 0 ? '+' : ''}${f.lift}%` : (f.total != null ? `${f.n}/${f.total}` : (f.n != null ? this._compactNum(f.n) : '')));
    const findBlock = (Array.isArray(detail.findings) && detail.findings.length) ? `
      <div class="plan-detail-sec">
        <div class="plan-find">
          ${detail.findings.map((f) => `
            <div class="plan-find-row plan-find-row--${findCls(f.severity)}">
              <span class="plan-find-cat">${this._esc(CAT[f.category] || CAT[f.key] || f.category || f.key || '')}</span>
              <span class="plan-find-label">${this._esc(f.label || '')}</span>
              <span class="plan-find-n">${this._esc(findNum(f))}</span>
            </div>`).join('')}
        </div>
      </div>` : '';
    // Para Riesgo de reputación, evidencia real (comentarios hostiles/negativos) al abrir.
    const evBlock = detail.risk ? `
      <div class="plan-detail-sec">
        <div class="plan-detail-h">${this._esc(__('Comentarios señalados'))}</div>
        <div class="plan-detail-evidence" data-plan-evidence>
          <div class="plan-ev-loading"><i class="aisc-ico fa-spin aisc-ico--loader"></i> ${this._esc(__('Cargando evidencia…'))}</div>
        </div>
      </div>` : '';
    const body = `
      <div class="plan-detail plan-detail--${this._esc(detail.color || '')}">
        ${detail.title ? `<div class="plan-detail-title">${this._esc(detail.title)}</div>` : ''}
        ${secs}
        ${findBlock}
        ${evBlock}
      </div>`;
    const { bodyEl } = window.Modal.show({ title: detail.category || detail.title || '', body, className: 'dash-modal plan-detail-modal' });

    if (detail.risk && bodyEl) {
      const host = bodyEl.querySelector('[data-plan-evidence]');
      try {
        await this._ensureCampanasService();
        const f = this._mbFilters || {};
        const posts = await this._campanasService.getRiskEvidence({
          dateFromIso: f.dateFrom || null, dateToIso: f.dateTo || null,
          windowDays: f.windowDays || 99999,
          brandIds: f.brandContainerId ? [f.brandContainerId] : null,
        });
        if (host) host.innerHTML = this._renderRiskEvidence(posts);
      } catch (e) {
        if (host) host.innerHTML = `<div class="plan-ev-empty">${this._esc(__('No se pudo cargar la evidencia.'))}</div>`;
      }
    }
  }

  // Lista de COMENTARIOS del público señalados (evidencia de riesgo): autor +
  // texto del comentario + emoción + post sobre el que comentó + enlace. Responde
  // "¿qué dijo la gente, en qué post y por qué es hostil?".
  _renderRiskEvidence(comments) {
    if (!Array.isArray(comments) || !comments.length) {
      return `<div class="plan-ev-empty">${this._esc(__('Sin comentarios hostiles ni negativos del público en el periodo. 👍'))}</div>`;
    }
    const netLabel = (n) => {
      const s = String(n || '').toLowerCase();
      if (s.includes('insta')) return 'Instagram';
      if (s.includes('face')) return 'Facebook';
      if (s.includes('tik')) return 'TikTok';
      if (s.includes('linkedin')) return 'LinkedIn';
      if (s.includes('twitter') || s === 'x') return 'X';
      return n ? n.charAt(0).toUpperCase() + n.slice(1) : '—';
    };
    const fmtDate = (ts) => { try { return new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; } };
    const HOSTILE = ['anger', 'disgust'];
    const emoLabel = { anger: __('Ira'), disgust: __('Asco'), sadness: __('Tristeza'), fear: __('Miedo'), surprise: __('Sorpresa'), joy: __('Alegría') };
    return comments.map((c) => {
      const emo = String(c.emotion || '').toLowerCase();
      const hostile = HOSTILE.includes(emo) || Number(c.sentiment_score) <= -0.7;
      const neg = /^neg/i.test(String(c.sentiment || ''));
      const tags = [];
      if (hostile) tags.push(`<span class="plan-ev-badge is-risk">${this._esc(__('Hostil'))}</span>`);
      else if (neg) tags.push(`<span class="plan-ev-badge is-neg">${this._esc(__('Negativo'))}</span>`);
      if (emo && emo !== 'others') tags.push(`<span class="plan-ev-badge">${this._esc(emoLabel[emo] || c.emotion)}</span>`);
      const author = c.author ? '@' + String(c.author).replace(/^@/, '') : __('Anónimo');
      const link = c.permalink ? `<a class="plan-ev-link" href="${this._esc(c.permalink)}" target="_blank" rel="noopener">${this._esc(__('Ver publicación'))} →</a>` : '';
      return `
        <div class="plan-ev-post">
          <div class="plan-ev-row">
            <span class="plan-ev-net">${this._esc(netLabel(c.network))} · ${this._esc(author)}</span>
            <span class="plan-ev-date">${this._esc(fmtDate(c.posted_at))}</span>
          </div>
          ${c.snippet ? `<div class="plan-ev-snippet">“${this._esc(c.snippet)}”</div>` : ''}
          <div class="plan-ev-badges">${tags.join('')}</div>
          ${c.post_snippet ? `<div class="plan-ev-context">${this._esc(__('En tu post'))}: “${this._esc(c.post_snippet)}”</div>` : ''}
          ${link}
        </div>`;
    }).join('');
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
      title.innerHTML = `<strong>${this._esc(copy.strong)}</strong>`;
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

  // Barra del banner — REDISEÑO VERA 2026-07: se eliminan los filtros
  // (Fecha/Plataforma/Perfil/Estrategia); quedan SOLO las burbujas de
  // integraciones y el botón Crear informe. Los builders por tab
  // (_buildMbFiltersBar, etc.) quedan intactos por si se reactivan.
  _buildTabFiltersBar(_tabId) {
    return `
      <header class="living-history-filters mb-filters-bar">
        ${typeof this._buildIntegrationBubbles === 'function' ? this._buildIntegrationBubbles() : ''}
        ${typeof this._reportDropdown === 'function' ? this._reportDropdown() : ''}
      </header>`;
  }

  // Re-renderiza la barra de filtros del banner para el tab activo y monta su date
  // picker. Se llama al cambiar de tab y al cargar la data (opciones dinámicas).
  _renderHeroActions() {
    const host = document.getElementById('dashHeroActions');
    if (host) host.innerHTML = this._buildTabFiltersBar(this._activeTab);
    this._mountTabDatePicker();
  }

  _mountTabDatePicker() {
    const hero = document.getElementById('dashHero');
    const t = this._activeTab;
    if (t === 'competence') this._mountCompDatePicker?.(hero);
    else if (t === 'tendencies') this._mountTendDatePicker?.(hero);
    else this._mountMbDatePicker?.(hero);  // Estrategia no tiene date picker (solo status)
  }

  /** Manejo CENTRALIZADO de filtros del banner (todos los tabs). Selects → change;
      menús custom (Plataforma) → click. El date picker llama a su _onXFilterChange
      por su cuenta. Se rutea al handler del tab activo. */
  _setupHeroFilters() {
    const hero = document.getElementById('dashHero');
    if (!hero || hero._filtersWired) return;
    hero._filtersWired = true;

    const route = (patch) => {
      const t = this._activeTab;
      if (t === 'competence') this._onCompFilterChange?.(patch);
      else if (t === 'tendencies') this._onTendFilterChange?.(patch);
      else if (t === 'strategy') this._onStratFilterChange?.(patch);
      else this._onMbFilterChange?.(patch);
    };

    hero.addEventListener('change', (e) => {
      const el = e.target.closest('[data-mb-filter],[data-comp-filter],[data-tend-filter],[data-strat-filter]');
      if (!el) return;
      const key = el.dataset.mbFilter || el.dataset.compFilter || el.dataset.tendFilter || el.dataset.stratFilter;
      const v = el.value;
      if (key === 'platform') return route({ platforms: v ? [v] : null });
      if (key === 'windowDays') return route({ windowDays: Number(v) || (this._activeTab === 'competence' ? 99999 : this._activeTab === 'tendencies' ? 90 : 30) });
      if (key === 'entityId') return route({ entityId: v || null });
      if (key === 'source') return route({ source: v || '' });
      if (key === 'status') return route({ status: v || 'proposed' });
      if (key === 'brandContainerId') return route({ brandContainerId: v || null });
      route({ [key]: v });
    });

    hero.addEventListener('click', (e) => {
      // Burbuja "+" de integraciones: lleva a Identidad con el panel INFO abierto
      // (donde se conectan/agregan plataformas). Mismo destino que el CTA de
      // "Conectar plataformas" del empty state de Mi Marca.
      if (e.target.closest('[data-action="add-integration"]')) {
        e.preventDefault();
        if (!window.router) return;
        try { localStorage.setItem('brands_open_info', '1'); } catch (_) {}
        const path = window.location.pathname || '';
        const base = path.startsWith('/org/') ? path.split('/').slice(0, 4).join('/') : '';
        window.router.navigate(base ? `${base}/brand` : '/brand-organization');
        return;
      }
      const sel = this._handleFilterMenuClick(e);
      if (sel && sel.key === 'platform') route({ platforms: sel.value ? [sel.value] : null });
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
    this._renderHeroCards();    // cards del hero TAB-AWARE (Mi Marca vs Competencia)
    this._renderHeroActions();  // filtros del banner TAB-AWARE
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
    if (!this._restoredFromCache && !this._silentRefresh) { this._renderTabSkeleton(body); this._bodyTab = tabId; }
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
