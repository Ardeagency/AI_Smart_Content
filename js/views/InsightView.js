/**
 * InsightView – Panel de inteligencia de marca.
 * Sub-páginas: My Brands · Competence · Tendencies · Strategy
 *
 * My Brands — arquitectura event-driven (sin polling/cron):
 *
 *  EVENTO               ACCIÓN
 *  ─────────────────────────────────────────────────────────
 *  mount                fetch DB → si stale → sync Meta
 *  realtime push        solo re-fetch DB (no re-sync Meta)
 *  visibilitychange     si >MIN_REFETCH → re-fetch;
 *                       si además stale → sync Meta
 *  user: refresh btn    sync Meta + re-fetch
 *  user: brand/period   sync Meta + re-fetch
 *
 *  Guards:
 *  - _syncing flag         → un solo sync a la vez
 *  - MIN_SYNC_INTERVAL     → mínimo 2 min entre syncs a Meta
 *  - MIN_REFETCH_INTERVAL  → mínimo 30s entre re-fetches
 *  - debounce 1.5s en Realtime → absorbe ráfagas de cambios
 */
class InsightView extends BaseView {

  static MIN_SYNC_INTERVAL   = 2 * 60 * 1000;  // 2 min entre syncs Meta
  static MIN_REFETCH_INTERVAL = 30 * 1000;       // 30s entre re-fetches DB

  constructor() {
    super();
    this._activeTab         = 'my-brands';
    this._supabase          = null;
    this._brandContainerId  = null;
    this._brandContainers   = [];
    this._period            = '30d';
    this._chartInstances    = {};

    // Event-driven live state (sin polling/cron)
    this._realtimeChannel   = null;
    this._labelTimer        = null;   // único timer: actualizar "hace X min" label
    this._refreshTimer      = null;   // debounce Realtime
    this._visibilityHandler = null;
    this._lastFetchTime     = null;   // último re-fetch de DB
    this._lastSyncTime      = null;   // último sync con Meta API
    this._syncing           = false;
    this._liveReady         = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

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
    this._teardownLive();
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
      const newTab = btn.dataset.tab;
      if (newTab !== 'my-brands') this._teardownLive();
      this._activeTab = newTab;
      nav.querySelectorAll('.insight-subnav-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.tab === this._activeTab));
      this._renderTab(this._activeTab);
    });
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    this._destroyCharts();
    const map = {
      'my-brands':  () => { body.innerHTML = this._myBrandsLoadingSkeleton(); this._renderMyBrands(); },
      competence:   () => { body.innerHTML = this._pageComingSoon('Competence', 'fa-chess', 'Analiza a tu competencia: publicaciones, métricas y posicionamiento en redes sociales.'); },
      tendencies:   () => { body.innerHTML = this._pageComingSoon('Tendencies', 'fa-fire', 'Tendencias de contenido, hashtags y temas relevantes para tu industria en tiempo real.'); },
      strategy:     () => { body.innerHTML = this._pageComingSoon('Strategy', 'fa-route', 'Recomendaciones estratégicas basadas en el rendimiento de tus campañas y el mercado.'); },
    };
    (map[tabId] || (() => {}))();
  }

  _destroyCharts() {
    Object.values(this._chartInstances).forEach(c => { try { c.destroy(); } catch (_) {} });
    this._chartInstances = {};
  }

  // ── My Brands: init & data loading ────────────────────────────────────────

  async _renderMyBrands() {
    try {
      if (window.supabaseService) {
        this._supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this._supabase = window.supabase;
      }
    } catch (e) { console.error('[InsightView] Supabase init:', e); }

    if (!this._supabase) {
      document.getElementById('insightTabBody').innerHTML = this._myBrandsError('No se pudo conectar con la base de datos.');
      return;
    }

    const { data: { user } } = await this._supabase.auth.getUser();
    if (!user) {
      document.getElementById('insightTabBody').innerHTML = this._myBrandsError('Sesión no válida. Recarga la página.');
      return;
    }

    const { data: containers } = await this._supabase
      .from('brand_containers')
      .select('id,nombre_marca,logo_url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15);

    this._brandContainers = containers || [];

    if (!this._brandContainers.length) {
      document.getElementById('insightTabBody').innerHTML = this._myBrandsNoBrands();
      return;
    }

    const saved = localStorage.getItem('mb_selected_brand');
    if (saved && this._brandContainers.find(b => b.id === saved)) {
      this._brandContainerId = saved;
    } else {
      this._brandContainerId = this._brandContainers[0].id;
    }

    await this._loadAndRenderDashboard(false);
  }

  /**
   * Carga y renderiza el dashboard completo.
   * @param {boolean} isLiveRefresh - Si true, no re-subscribe a realtime
   */
  async _loadAndRenderDashboard(isLiveRefresh = false) {
    if (this._syncing && isLiveRefresh) return; // evitar renders concurrentes en live
    const body = document.getElementById('insightTabBody');
    if (!body) return;

    if (!isLiveRefresh) {
      body.innerHTML = this._myBrandsLoadingSkeleton();
    }

    const { data: { session } } = await this._supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      body.innerHTML = this._myBrandsError('Sesión expirada. Recarga la página.');
      return;
    }

    const bcId = this._brandContainerId;

    const [insightRes, postsRes] = await Promise.all([
      fetch(`/api/insights/mybrand?brand_container_id=${bcId}&period=${this._period}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })),

      fetch(`/api/brand/posts-meta?brand_container_id=${bcId}&limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).catch(() => ({ ok: false }))
    ]);

    this._destroyCharts();
    body.innerHTML = this._myBrandsDashboardHTML(insightRes, postsRes);
    this._setupDashboardEvents(insightRes, postsRes);
    this._renderCharts(insightRes, postsRes);
    this._lastFetchTime = Date.now();  // timestamp del último re-fetch de DB
    this._updateLastSyncLabel();

    // Primera carga: setup live (sin polling)
    if (!isLiveRefresh) {
      this._liveReady = false;
      this._setupLive();
    } else {
      this._updateLiveIndicator(this._liveReady ? 'SUBSCRIBED' : 'CONNECTING');
    }

    // Evento MOUNT/BRAND-CHANGE: auto-sync Meta si stale
    if (insightRes?.stale && postsRes?.ok !== false && !isLiveRefresh) {
      this._triggerBackgroundSync(token, bcId);
    }
  }

  // ── Live: event-driven (sin polling/cron) ────────────────────────────────

  _setupLive() {
    this._setupRealtimeSubscription();  // evento: DB change (WebSocket)
    this._setupVisibilityListener();    // evento: tab focus
    this._setupLabelInterval();         // único timer: label "hace X min"
  }

  _teardownLive() {
    this._clearLabelInterval();
    this._removeVisibilityListener();
    this._clearRefreshTimer();
    if (this._realtimeChannel && this._supabase) {
      try { this._supabase.removeChannel(this._realtimeChannel); } catch (_) {}
      this._realtimeChannel = null;
    }
    this._liveReady = false;
  }

  async _setupRealtimeSubscription() {
    if (!this._supabase || !this._brandContainerId) return;

    // Limpiar canal anterior
    if (this._realtimeChannel) {
      try { await this._supabase.removeChannel(this._realtimeChannel); } catch (_) {}
      this._realtimeChannel = null;
    }

    const bcId = this._brandContainerId;
    this._updateLiveIndicator('CONNECTING');

    try {
      this._realtimeChannel = this._supabase
        .channel(`mb-live-${bcId}-${Date.now()}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'brand_posts',
          filter: `brand_container_id=eq.${bcId}`
        }, () => this._scheduleRefresh('realtime:posts'))
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'brand_analytics_snapshots',
          filter: `brand_container_id=eq.${bcId}`
        }, () => this._scheduleRefresh('realtime:snapshots'))
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'brand_audience_heatmap',
          filter: `brand_container_id=eq.${bcId}`
        }, () => this._scheduleRefresh('realtime:heatmap'))
        .subscribe(status => {
          this._liveReady = (status === 'SUBSCRIBED');
          this._updateLiveIndicator(status);
        });
    } catch (e) {
      console.warn('[InsightView] Realtime unavailable, using polling only:', e.message);
      this._updateLiveIndicator('POLLING');
    }
  }

  _setupVisibilityListener() {
    this._removeVisibilityListener();
    this._visibilityHandler = async () => {
      if (document.visibilityState !== 'visible') return;
      if (this._activeTab !== 'my-brands' || !this._brandContainerId) return;

      const sinceFetch = Date.now() - (this._lastFetchTime || 0);
      const sinceSyncc = Date.now() - (this._lastSyncTime  || 0);

      // Solo re-fetch si han pasado más de MIN_REFETCH_INTERVAL
      if (sinceFetch < InsightView.MIN_REFETCH_INTERVAL) return;

      // Re-fetch de DB (evento: usuario vuelve al tab)
      await this._dbRefresh();

      // Adicionalmente, si el último sync fue hace más de MIN_SYNC_INTERVAL → sync Meta
      if (sinceSyncc >= InsightView.MIN_SYNC_INTERVAL) {
        const { data: { session } } = await this._supabase.auth.getSession();
        if (session?.access_token) {
          this._triggerBackgroundSync(session.access_token, this._brandContainerId);
        }
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  _removeVisibilityListener() {
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }

  _setupLabelInterval() {
    this._clearLabelInterval();
    this._labelTimer = setInterval(() => this._updateLastSyncLabel(), 30 * 1000);
  }

  _clearLabelInterval() {
    if (this._labelTimer) { clearInterval(this._labelTimer); this._labelTimer = null; }
  }

  _clearRefreshTimer() {
    if (this._refreshTimer) { clearTimeout(this._refreshTimer); this._refreshTimer = null; }
  }

  /**
   * Re-fetch solo desde DB (evento: Realtime push).
   * NO llama a Meta API. Debounce 1.5s para absorber ráfagas.
   */
  _scheduleRefresh(source) {
    this._clearRefreshTimer();
    this._refreshTimer = setTimeout(async () => {
      this._refreshTimer = null;
      if (this._activeTab !== 'my-brands' || !this._brandContainerId) return;
      // Guard: no re-fetch si ya se hizo hace menos de MIN_REFETCH_INTERVAL
      if (Date.now() - (this._lastFetchTime || 0) < InsightView.MIN_REFETCH_INTERVAL) return;
      await this._dbRefresh();
    }, 1500);
  }

  /**
   * Re-fetch de DB sin sync Meta. Actualiza UI.
   */
  async _dbRefresh() {
    await this._loadAndRenderDashboard(true);
  }

  /**
   * Llama a /api/brand/sync-meta (Meta API) en background.
   * Guard: solo un sync a la vez + mínimo MIN_SYNC_INTERVAL entre syncs.
   */
  async _triggerBackgroundSync(token, bcId) {
    if (this._syncing) return;
    const sinceLast = Date.now() - (this._lastSyncTime || 0);
    if (sinceLast < InsightView.MIN_SYNC_INTERVAL) return; // rate-limit

    this._syncing = true;
    this._setSyncToast(true);

    try {
      const res = await fetch('/api/brand/sync-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brand_container_id: bcId })
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        this._lastSyncTime = Date.now();
        // Realtime dispara el refresh cuando la DB cambia.
        // Si Realtime no está disponible, _scheduleRefresh actúa como fallback.
        this._scheduleRefresh('sync-complete');
      }
    } catch (e) {
      console.warn('[InsightView] Background sync failed:', e.message);
    } finally {
      this._syncing = false;
      this._setSyncToast(false);
    }
  }

  // ── Live indicators ────────────────────────────────────────────────────────

  _updateLiveIndicator(status) {
    const dot   = document.getElementById('mbLiveDot');
    const label = document.getElementById('mbLiveLabel');
    if (!dot || !label) return;

    dot.className = 'mb-live-dot';
    if (status === 'SUBSCRIBED') {
      dot.classList.add('mb-live-dot--live');
      label.textContent = 'En vivo';
    } else if (status === 'POLLING') {
      dot.classList.add('mb-live-dot--poll');
      label.textContent = 'Actualización automática';
    } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
      dot.classList.add('mb-live-dot--error');
      label.textContent = 'Reconectando…';
      // Reintentar después de 10s
      setTimeout(() => this._setupRealtimeSubscription(), 10000);
    } else {
      dot.classList.add('mb-live-dot--connecting');
      label.textContent = 'Conectando…';
    }
  }

  _updateLastSyncLabel() {
    const el = document.getElementById('mbLastSync');
    if (!el) return;
    const ref = this._lastFetchTime;
    if (!ref) { el.textContent = 'Ahora'; return; }
    const mins = Math.floor((Date.now() - ref) / 60000);
    el.textContent = mins === 0 ? 'Ahora' : `Hace ${mins} min`;
  }

  _setSyncToast(visible) {
    const el = document.getElementById('mbSyncToast');
    if (!el) return;
    el.style.display = visible ? 'flex' : 'none';
    if (visible) {
      const btn = document.getElementById('mbRefreshBtn');
      if (btn) btn.querySelector('i')?.classList.add('mb-spin');
    } else {
      const btn = document.getElementById('mbRefreshBtn');
      if (btn) btn.querySelector('i')?.classList.remove('mb-spin');
    }
  }

  // ── My Brands: HTML builders ───────────────────────────────────────────────

  _myBrandsLoadingSkeleton() {
    return `
      <div class="mb-loading-wrap">
        <div class="mb-loading-spinner"></div>
        <p class="mb-loading-text">Cargando datos de tu marca…</p>
      </div>`;
  }

  _myBrandsNoBrands() {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"><i class="fas fa-layer-group"></i></div>
        <h2 class="insight-cs-title">Sin marcas configuradas</h2>
        <p class="insight-cs-desc">Crea tu primera marca para comenzar a ver métricas e insights de rendimiento.</p>
        <a href="${window.currentOrgPath ? window.currentOrgPath + '/brand' : '/brands'}" class="mb-btn-primary">
          <i class="fas fa-plus"></i> Crear marca
        </a>
      </div>`;
  }

  _myBrandsError(msg) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"><i class="fas fa-exclamation-circle" style="color:#fb923c"></i></div>
        <h2 class="insight-cs-title">Error</h2>
        <p class="insight-cs-desc">${this._esc(msg)}</p>
      </div>`;
  }

  _myBrandsDashboardHTML(insight, posts) {
    const allPosts = [
      ...(posts?.facebook_posts || []),
      ...(posts?.instagram_posts || [])
    ].sort((a, b) => new Date(b.created_time) - new Date(a.created_time));

    const metaConnected = posts?.ok && (posts.facebook_posts?.length > 0 || posts.instagram_posts?.length > 0);
    const kpis          = this._computeKPIs(insight, posts);
    const timeSeries    = this._buildTimeSeries(allPosts, parseInt(this._period) || 30);
    const contentTypes  = this._buildContentTypes(allPosts);
    const topPosts      = this._getTopPosts(insight, allPosts);
    const autoInsights  = this._generateInsights(kpis, timeSeries, contentTypes, insight);
    const brandName     = insight?.brand?.nombre_marca
      || this._brandContainers.find(b => b.id === this._brandContainerId)?.nombre_marca
      || 'Mi Marca';

    const snap        = insight?.dimensions?.A_activity?.snapshot || {};
    const apiTS       = insight?.dimensions?.A_activity?.time_series || null;
    const audience    = insight?.dimensions?.C_audience || null;
    const stories     = insight?.dimensions?.D_stories  || null;
    const video       = insight?.dimensions?.E_video    || null;
    const hasGrowthTS = apiTS && apiTS.dates?.length > 1;

    return `
      <div class="mb-dashboard" id="mbDashboard">

        <!-- Header -->
        <div class="mb-header">
          <div class="mb-header-left">
            ${this._brandContainers.length > 1 ? `
              <select class="mb-brand-select" id="mbBrandSelect">
                ${this._brandContainers.map(b => `
                  <option value="${this._esc(b.id)}" ${b.id === this._brandContainerId ? 'selected' : ''}>
                    ${this._esc(b.nombre_marca)}
                  </option>`).join('')}
              </select>
            ` : `<span class="mb-brand-name">${this._esc(brandName)}</span>`}

            <!-- Indicador live -->
            <div class="mb-live-indicator">
              <span class="mb-live-dot mb-live-dot--connecting" id="mbLiveDot"></span>
              <span class="mb-live-label" id="mbLiveLabel">Conectando…</span>
            </div>
          </div>

          <div class="mb-header-right">
            <!-- Sync toast inline -->
            <div class="mb-sync-toast" id="mbSyncToast" style="display:none">
              <i class="fas fa-sync-alt mb-spin"></i>
              <span>Sincronizando…</span>
            </div>

            <!-- Última actualización -->
            <div class="mb-last-sync-wrap">
              <i class="fas fa-clock" style="font-size:0.7rem;opacity:0.4"></i>
              <span class="mb-last-sync" id="mbLastSync">Ahora</span>
            </div>

            <div class="mb-period-tabs" id="mbPeriodTabs">
              ${['7d','30d','90d'].map(p => `
                <button class="mb-period-btn${this._period === p ? ' active' : ''}" data-period="${p}">
                  ${p === '7d' ? '7d' : p === '30d' ? '30d' : '90d'}
                </button>`).join('')}
            </div>

            <button class="mb-refresh-btn" id="mbRefreshBtn" title="Sincronizar ahora">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>

        ${!metaConnected ? `
          <div class="mb-connect-banner">
            <i class="fab fa-facebook-square"></i>
            <span>Conecta Meta para ver métricas de Instagram y Facebook en tiempo real.</span>
            <a href="${window.currentOrgPath ? window.currentOrgPath + '/brand' : '/brands'}" class="mb-connect-link">
              Conectar ahora →
            </a>
          </div>
        ` : ''}

        <!-- BLOQUE 1: KPIs principales -->
        ${this._buildKPIRow(kpis, snap)}

        ${autoInsights.length ? this._buildInsightsHTML(autoInsights) : ''}

        <!-- BLOQUE 2: Actividad (posts/engagement por día) -->
        <div class="mb-section">
          <div class="mb-section-header">
            <h3 class="mb-section-title"><span class="mb-dot mb-dot--green"></span>Actividad</h3>
            <span class="mb-section-sub">Posts y engagement por día</span>
          </div>
          <div class="mb-chart-wrap">
            <canvas id="mbActivityChart"></canvas>
          </div>
        </div>

        <!-- BLOQUE 3: Crecimiento (reach + impressions desde API) -->
        ${hasGrowthTS ? `
        <div class="mb-section">
          <div class="mb-section-header">
            <h3 class="mb-section-title"><span class="mb-dot mb-dot--blue"></span>Crecimiento</h3>
            <span class="mb-section-sub">Reach e impresiones diarias de cuenta</span>
          </div>
          <div class="mb-chart-wrap">
            <canvas id="mbGrowthChart"></canvas>
          </div>
        </div>
        ` : ''}

        <!-- Grid 2: Top Posts + Content Type -->
        <div class="mb-grid-2">

          <div class="mb-section">
            <div class="mb-section-header">
              <h3 class="mb-section-title"><span class="mb-dot mb-dot--orange"></span>Mejores posts</h3>
            </div>
            ${topPosts.length ? this._buildTopPostsHTML(topPosts) : `
              <div class="mb-empty-sm"><i class="fas fa-images"></i><p>Sin posts disponibles</p></div>`}
          </div>

          <div class="mb-section">
            <div class="mb-section-header">
              <h3 class="mb-section-title"><span class="mb-dot mb-dot--purple"></span>Tipo de Contenido</h3>
            </div>
            ${contentTypes.length ? `
              <div class="mb-chart-wrap-sm"><canvas id="mbContentChart"></canvas></div>
              <div class="mb-content-legend" id="mbContentLegend"></div>
            ` : `<div class="mb-empty-sm"><i class="fas fa-chart-pie"></i><p>Sin datos</p></div>`}
          </div>

        </div>

        <!-- BLOQUE 4: Engagement Rate -->
        <div class="mb-section">
          <div class="mb-section-header">
            <h3 class="mb-section-title"><span class="mb-dot mb-dot--blue"></span>Engagement Rate</h3>
            <span class="mb-section-sub">Interacciones por post a lo largo del tiempo</span>
          </div>
          <div class="mb-chart-wrap">
            <canvas id="mbEngRateChart"></canvas>
          </div>
        </div>

        <!-- BLOQUE 5: Audiencia demographics (nuevo) -->
        ${audience?.has_data ? `
        <div class="mb-grid-2">

          <div class="mb-section">
            <div class="mb-section-header">
              <h3 class="mb-section-title"><span class="mb-dot mb-dot--pink"></span>Audiencia por Género/Edad</h3>
              <span class="mb-section-sub">Distribución de seguidores</span>
            </div>
            <div class="mb-chart-wrap-sm"><canvas id="mbGenderChart"></canvas></div>
          </div>

          <div class="mb-section">
            <div class="mb-section-header">
              <h3 class="mb-section-title"><span class="mb-dot mb-dot--teal"></span>Top Países</h3>
              <span class="mb-section-sub">Países de tu audiencia</span>
            </div>
            ${audience.top_countries?.length ? `
              <div class="mb-chart-wrap-sm"><canvas id="mbCountriesChart"></canvas></div>
            ` : `<div class="mb-empty-sm"><p>Sin datos de ubicación</p></div>`}
          </div>

        </div>
        ` : ''}

        <!-- Grid 2: Heatmap + Tono / Stories -->
        <div class="mb-grid-2">

          <div class="mb-section">
            <div class="mb-section-header">
              <h3 class="mb-section-title"><span class="mb-dot mb-dot--yellow"></span>Audiencia activa</h3>
              <span class="mb-section-sub">Días y horas con más actividad</span>
            </div>
            ${this._buildHeatmapHTML(allPosts, insight?.dimensions?.A_activity?.heatmap)}
          </div>

          ${stories ? `
          <div class="mb-section">
            <div class="mb-section-header">
              <h3 class="mb-section-title"><span class="mb-dot mb-dot--pink"></span>Stories</h3>
              <span class="mb-section-sub">Últimas ${stories.count} stories publicadas</span>
            </div>
            ${this._buildStoriesHTML(stories, video)}
          </div>
          ` : `
          <div class="mb-section">
            <div class="mb-section-header">
              <h3 class="mb-section-title"><span class="mb-dot mb-dot--pink"></span>Tono de Contenido</h3>
            </div>
            ${(insight?.dimensions?.B_narrative?.top_tones?.length) ? `
              <div class="mb-chart-wrap-sm"><canvas id="mbToneChart"></canvas></div>
            ` : `<div class="mb-empty-sm"><i class="fas fa-comment-alt"></i><p>Analiza posts para ver el tono de tu contenido.</p></div>`}
          </div>
          `}

        </div>

        ${stories && insight?.dimensions?.B_narrative?.top_tones?.length ? `
        <div class="mb-section">
          <div class="mb-section-header">
            <h3 class="mb-section-title"><span class="mb-dot mb-dot--pink"></span>Tono de Contenido</h3>
          </div>
          <div class="mb-chart-wrap-sm" style="max-height:180px"><canvas id="mbToneChart"></canvas></div>
        </div>
        ` : ''}

      </div>`;
  }

  _buildKPIRow(kpis, snap = {}) {
    const followers  = snap.followers_ig || snap.fans_fb || kpis.followers || 0;
    const impressions = snap.impressions || kpis.impressions || 0;
    const saved       = snap.total_saved || kpis.totalSaved || 0;
    const cards = [
      { icon: 'fa-users',      color: 'teal',   value: this._fmt(followers),             label: 'Seguidores',   sub: snap.followers_ig > 0 ? 'Instagram' : snap.fans_fb > 0 ? 'Facebook' : 'Total' },
      { icon: 'fa-eye',        color: 'blue',   value: this._fmt(kpis.reach),            label: 'Reach',        sub: kpis.reach > 0 ? `${this._fmt(impressions)} impresiones` : 'Sin datos de reach' },
      { icon: 'fa-heart',      color: 'orange', value: this._fmt(kpis.totalEngagement),  label: 'Engagement',   sub: `${this._fmt(kpis.totalLikes)} likes · ${this._fmt(kpis.totalComments)} comentarios` },
      { icon: 'fa-percentage', color: 'purple', value: kpis.engRate + '%',               label: 'Eng. Rate',    sub: kpis.reach > 0 ? 'Sobre reach total' : 'Sobre interacciones' },
      { icon: 'fa-bookmark',   color: 'pink',   value: this._fmt(saved),                 label: 'Guardados',    sub: snap.ig_posts_count > 0 ? `${snap.ig_posts_count} posts IG` : 'Total saves' },
      { icon: 'fa-file-alt',   color: 'green',  value: this._fmt(kpis.totalPosts),       label: 'Posts',        sub: kpis.totalPosts > 0 ? `${this._fmt(kpis.totalLikes)} likes · ${this._fmt(kpis.totalShares)} shares` : 'Sin publicaciones' },
    ];
    return `
      <div class="mb-kpi-row mb-kpi-row--6">
        ${cards.map(c => `
          <div class="mb-kpi-card">
            <div class="mb-kpi-icon mb-kpi-icon--${c.color}"><i class="fas ${c.icon}"></i></div>
            <div class="mb-kpi-body">
              <div class="mb-kpi-value">${c.value}</div>
              <div class="mb-kpi-label">${c.label}</div>
              <div class="mb-kpi-sub">${c.sub}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  _buildTopPostsHTML(topPosts) {
    return `
      <div class="mb-top-posts">
        ${topPosts.slice(0, 5).map((p, i) => {
          // Soporte tanto para posts live (facebook_posts) como posts enriquecidos (DB)
          const m       = p.metrics || {};
          const likes   = m.likes    || p.likes    || p.like_count    || 0;
          const comments= m.comments || p.comments || p.comments_count|| 0;
          const shares  = m.shares   || p.shares   || 0;
          const reach   = m.reach    || 0;
          const saved   = m.saved    || 0;
          const views   = m.video_views || 0;
          const eng     = (p.engagement_total || 0) || (likes + comments + shares + saved);
          const preview = (p.content_preview || p.message || p.content || p.caption || '').slice(0, 100);
          const dateStr = p.captured_at || p.created_time || p.timestamp || '';
          const date    = dateStr ? new Date(dateStr).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '';
          const mediaAsset = p.media_assets?.[0] || null;
          const pic     = mediaAsset?.url || p.picture || null;
          const mediaType = mediaAsset?.type?.toUpperCase() || p.media_type || 'image';
          const network = p.network || 'facebook';
          const icon    = network === 'instagram' ? 'fa-instagram fab' : 'fa-facebook-square fab';
          const isVideo = ['VIDEO', 'REEL'].includes(mediaType);
          return `
            <div class="mb-post-card">
              <div class="mb-post-rank">${i + 1}</div>
              ${pic ? `
                <div class="mb-post-thumb-wrap">
                  <img class="mb-post-thumb" src="${this._esc(pic)}" alt="" loading="lazy" onerror="this.style.display='none'">
                  ${isVideo ? `<span class="mb-post-video-badge"><i class="fas fa-play"></i></span>` : ''}
                </div>
              ` : ''}
              <div class="mb-post-content">
                <div class="mb-post-meta">
                  <i class="${icon}" style="font-size:0.75rem;opacity:0.6"></i>
                  ${date ? `<span class="mb-post-date">${date}</span>` : ''}
                  ${isVideo ? `<span class="mb-post-type-badge">REEL/VIDEO</span>` : ''}
                </div>
                ${preview ? `<p class="mb-post-preview">${this._esc(preview)}</p>` : ''}
                <div class="mb-post-stats">
                  <span><i class="fas fa-heart"></i> ${this._fmt(likes)}</span>
                  <span><i class="fas fa-comment"></i> ${this._fmt(comments)}</span>
                  ${shares > 0 ? `<span><i class="fas fa-share"></i> ${this._fmt(shares)}</span>` : ''}
                  ${saved > 0  ? `<span><i class="fas fa-bookmark"></i> ${this._fmt(saved)}</span>` : ''}
                  ${reach > 0  ? `<span class="mb-post-reach"><i class="fas fa-eye"></i> ${this._fmt(reach)}</span>` : ''}
                  ${views > 0  ? `<span><i class="fas fa-play"></i> ${this._fmt(views)}</span>` : ''}
                </div>
                <div class="mb-post-eng-row">
                  <span class="mb-post-eng-badge">${this._fmt(eng)} eng</span>
                  ${reach > 0 ? `<span class="mb-post-er-badge">${((eng/reach)*100).toFixed(1)}% ER</span>` : ''}
                </div>
                ${p.analysis?.why_it_worked ? `<p class="mb-post-why">"${this._esc(p.analysis.why_it_worked)}"</p>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  _buildStoriesHTML(stories, video) {
    const exitRateStr = stories.exit_rate != null ? `${stories.exit_rate}%` : '—';
    return `
      <div class="mb-stories-wrap">
        <div class="mb-stories-kpis">
          <div class="mb-story-kpi">
            <div class="mb-story-kpi-val">${this._fmt(stories.total_reach)}</div>
            <div class="mb-story-kpi-lbl"><i class="fas fa-eye"></i> Reach</div>
          </div>
          <div class="mb-story-kpi">
            <div class="mb-story-kpi-val">${this._fmt(stories.total_impr)}</div>
            <div class="mb-story-kpi-lbl"><i class="fas fa-chart-bar"></i> Impresiones</div>
          </div>
          <div class="mb-story-kpi">
            <div class="mb-story-kpi-val">${this._fmt(stories.total_replies)}</div>
            <div class="mb-story-kpi-lbl"><i class="fas fa-reply"></i> Respuestas</div>
          </div>
          <div class="mb-story-kpi ${stories.exit_rate > 30 ? 'mb-story-kpi--warn' : ''}">
            <div class="mb-story-kpi-val">${exitRateStr}</div>
            <div class="mb-story-kpi-lbl"><i class="fas fa-sign-out-alt"></i> Exit rate</div>
          </div>
        </div>
        ${stories.exit_rate > 40 ? `
          <div class="mb-story-insight mb-story-insight--warn">
            <i class="fas fa-exclamation-triangle"></i>
            El ${exitRateStr} de exit rate es alto. Considera hacer stories más cortas o más dinámicas.
          </div>` : stories.total_replies > 0 ? `
          <div class="mb-story-insight mb-story-insight--ok">
            <i class="fas fa-comment-dots"></i>
            Tus stories generan respuestas — señal de alta conexión con la audiencia.
          </div>` : ''}
        ${video ? `
          <div class="mb-story-video-summary">
            <span><i class="fas fa-film"></i> ${video.count} videos/reels</span>
            <span><i class="fas fa-play"></i> ${this._fmt(video.total_views)} views</span>
            ${video.avg_watch_time_s > 0 ? `<span><i class="fas fa-clock"></i> ${video.avg_watch_time_s}s promedio</span>` : ''}
          </div>
        ` : ''}
      </div>`;
  }

  _buildInsightsHTML(insights) {
    return `
      <div class="mb-insights-row">
        ${insights.map(ins => `
          <div class="mb-insight-pill mb-insight-pill--${ins.type}">
            <i class="fas ${ins.icon}"></i>
            <span>${ins.text}</span>
          </div>`).join('')}
      </div>`;
  }

  _buildHeatmapHTML(allPosts, apiHeatmap) {
    const days   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const startH = 6, endH = 23, hours = endH - startH + 1;

    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    allPosts.forEach(p => {
      const d = new Date(p.created_time);
      if (isNaN(d)) return;
      matrix[d.getDay()][d.getHours()] += Math.max(1, (p.likes || 0) + (p.comments || 0) + (p.shares || 0));
    });

    const hasData  = matrix.flat().some(v => v > 0);
    const hourSums = Array(24).fill(0);
    const daySums  = Array(7).fill(0);
    matrix.forEach((row, d) => row.forEach((v, h) => { hourSums[h] += v; daySums[d] += v; }));

    let bestHour = hourSums.indexOf(Math.max(...hourSums));
    let bestDay  = daySums.indexOf(Math.max(...daySums));
    if (!hasData && apiHeatmap) { bestHour = apiHeatmap.best_hour ?? bestHour; bestDay = apiHeatmap.best_day ?? bestDay; }

    const max = Math.max(...matrix.flat(), 1);
    let cells = '';
    for (let d = 0; d < 7; d++) {
      for (let h = startH; h <= endH; h++) {
        const val      = matrix[d][h];
        const alpha    = 0.06 + (val / max) * 0.8;
        const isBest   = d === bestDay && h === bestHour;
        cells += `<div class="mb-hm-cell${isBest ? ' mb-hm-cell--best' : ''}"
          style="background:rgba(107,207,127,${alpha.toFixed(2)})"
          title="${days[d]} ${h}:00${val > 0 ? ' — ' + val + ' interacciones' : ''}"></div>`;
      }
    }

    const bh = bestHour >= 12 ? `${bestHour === 12 ? 12 : bestHour - 12}pm` : `${bestHour === 0 ? 12 : bestHour}am`;

    return `
      <div class="mb-heatmap-wrap">
        <div class="mb-heatmap">
          <div class="mb-hm-days">${days.map(d => `<div class="mb-hm-d-label">${d}</div>`).join('')}</div>
          <div class="mb-hm-grid" style="--hm-cols:${hours}">${cells}</div>
          <div class="mb-hm-hours" style="--hm-cols:${hours}">
            ${Array.from({ length: hours }, (_, i) => {
              const h = i + startH;
              return `<div class="mb-hm-h-label">${h % 6 === 0 ? h + 'h' : ''}</div>`;
            }).join('')}
          </div>
        </div>
        ${(hasData || apiHeatmap) ? `
          <div class="mb-hm-insight">
            <i class="fas fa-lightbulb"></i>
            Tu audiencia responde mejor los <strong>${days[bestDay]}</strong> a las <strong>${bh}</strong>
          </div>` : `
          <div class="mb-empty-sm" style="margin-top:0.75rem">
            <p>Publica más contenido para ver el heatmap de audiencia.</p>
          </div>`}
      </div>`;
  }

  // ── My Brands: interactions ────────────────────────────────────────────────

  _setupDashboardEvents(insightRes, postsRes) {
    const sel = document.getElementById('mbBrandSelect');
    if (sel) {
      sel.addEventListener('change', async () => {
        this._teardownLive();
        this._brandContainerId = sel.value;
        localStorage.setItem('mb_selected_brand', sel.value);
        await this._loadAndRenderDashboard(false);
      });
    }

    const periodTabs = document.getElementById('mbPeriodTabs');
    if (periodTabs) {
      periodTabs.addEventListener('click', async e => {
        const btn = e.target.closest('[data-period]');
        if (!btn || btn.dataset.period === this._period) return;
        this._teardownLive();
        this._period = btn.dataset.period;
        await this._loadAndRenderDashboard(false);
      });
    }

    const refreshBtn = document.getElementById('mbRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        if (this._syncing) return;
        refreshBtn.querySelector('i')?.classList.add('mb-spin');
        const { data: { session } } = await this._supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          // Evento USER: bypass rate-limit del MIN_SYNC_INTERVAL
          this._lastSyncTime = null;
          await this._triggerBackgroundSync(token, this._brandContainerId);
        } else {
          await this._dbRefresh();
        }
        refreshBtn.querySelector('i')?.classList.remove('mb-spin');
      });
    }
  }

  // ── My Brands: charts ──────────────────────────────────────────────────────

  _renderCharts(insight, posts) {
    if (!window.Chart) return;
    Chart.defaults.color       = 'rgba(212,209,216,0.55)';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.07)';
    Chart.defaults.font.family = 'Inter, sans-serif';
    Chart.defaults.font.size   = 11;

    const allPosts   = [...(posts?.facebook_posts || []), ...(posts?.instagram_posts || [])]
      .sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
    const days       = parseInt(this._period) || 30;
    const timeSeries = this._buildTimeSeries(allPosts, days);
    const content    = this._buildContentTypes(allPosts);
    const tones      = insight?.dimensions?.B_narrative?.top_tones || [];
    const apiTS      = insight?.dimensions?.A_activity?.time_series;
    const audience   = insight?.dimensions?.C_audience;

    this._renderActivityChart(timeSeries);
    this._renderEngRateChart(allPosts, days);
    if (content.length) this._renderContentChart(content);
    if (tones.length)   this._renderToneChart(tones);

    // Nuevos gráficos con data enriquecida de API
    if (apiTS?.dates?.length > 1)          this._renderGrowthChart(apiTS);
    if (audience?.gender_groups)           this._renderAudienceGenderChart(audience.gender_groups);
    if (audience?.top_countries?.length)   this._renderAudienceCountriesChart(audience.top_countries);
  }

  _renderActivityChart(ts) {
    const el = document.getElementById('mbActivityChart');
    if (!el) return;
    this._chartInstances.activity = new Chart(el, {
      type: 'line',
      data: {
        labels: ts.labels,
        datasets: [
          { label: 'Posts', data: ts.posts, yAxisID: 'yPosts', borderColor: '#6bcf7f', backgroundColor: 'rgba(107,207,127,0.08)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3, pointHoverRadius: 5 },
          { label: 'Engagement', data: ts.engagement, yAxisID: 'yEng', borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.08)', borderWidth: 2, tension: 0.4, fill: false, pointRadius: 3, pointHoverRadius: 5 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'top', align: 'end' }, tooltip: { backgroundColor: 'rgba(0,0,0,0.85)', padding: 10, cornerRadius: 8 } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 8 } },
          yPosts: { type: 'linear', position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { stepSize: 1, precision: 0 } },
          yEng:   { type: 'linear', position: 'right', grid: { drawOnChartArea: false } },
        }
      }
    });
  }

  _renderEngRateChart(allPosts, days) {
    const el = document.getElementById('mbEngRateChart');
    if (!el) return;
    const cutoff   = new Date(Date.now() - days * 86400000);
    const filtered = allPosts.filter(p => p.created_time && new Date(p.created_time) >= cutoff).slice(-30);
    const labels   = filtered.map(p => new Date(p.created_time).toLocaleDateString('es', { day: 'numeric', month: 'short' }));
    const vals     = filtered.map(p => {
      const eng = (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
      return parseFloat((eng / Math.max(1, eng + 100) * 100).toFixed(2));
    });
    this._chartInstances.engRate = new Chart(el, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Engagement', data: vals, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.12)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3, pointHoverRadius: 5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,0.85)', padding: 10, cornerRadius: 8, callbacks: { label: ctx => `Índice: ${ctx.parsed.y}` } } },
        scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: 'rgba(255,255,255,0.05)' } } }
      }
    });
  }

  _renderContentChart(contentTypes) {
    const el = document.getElementById('mbContentChart');
    if (!el) return;
    const colors = ['#6bcf7f','#60a5fa','#a78bfa','#fb923c','#f472b6','#2dd4bf'];
    const labels = contentTypes.map(c => c.label);
    const data   = contentTypes.map(c => c.count);
    this._chartInstances.content = new Chart(el, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderColor: 'rgba(0,0,0,0.3)', borderWidth: 2, hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,0.85)', padding: 10, cornerRadius: 8 } }
      },
      plugins: [{
        afterRender: () => {
          const legendEl = document.getElementById('mbContentLegend');
          if (!legendEl || legendEl.dataset.built) return;
          legendEl.dataset.built = '1';
          legendEl.innerHTML = contentTypes.map((c, i) => `
            <div class="mb-legend-item">
              <span class="mb-legend-dot" style="background:${colors[i]}"></span>
              <span>${c.label}</span>
              <span class="mb-legend-count">${c.count}</span>
            </div>`).join('');
        }
      }]
    });
  }

  _renderToneChart(tones) {
    const el = document.getElementById('mbToneChart');
    if (!el) return;
    const toneColors = { positivo: '#6bcf7f', inspirador: '#60a5fa', educativo: '#a78bfa', urgente: '#fb923c', neutral: '#87868B', emocional: '#f472b6', informativo: '#2dd4bf', humorístico: '#facc15' };
    const colors = tones.map(t => toneColors[t.tone?.toLowerCase()] || '#87868B');
    this._chartInstances.tone = new Chart(el, {
      type: 'bar',
      data: { labels: tones.map(t => t.tone), datasets: [{ data: tones.map(t => t.pct || t.count), backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 5 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,0.85)', padding: 10, cornerRadius: 8, callbacks: { label: ctx => ` ${ctx.parsed.x}%` } } },
        scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }
      }
    });
  }

  _renderGrowthChart(apiTS) {
    const el = document.getElementById('mbGrowthChart');
    if (!el) return;
    // Mostrar labels más cortos (solo día/mes)
    const labels = apiTS.dates.map(d => new Date(d + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' }));
    this._chartInstances.growth = new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Reach',
            data: apiTS.reach,
            yAxisID: 'yReach',
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,0.1)',
            borderWidth: 2, tension: 0.4, fill: true, pointRadius: 2, pointHoverRadius: 5
          },
          {
            label: 'Impresiones',
            data: apiTS.impressions,
            yAxisID: 'yReach',
            borderColor: '#a78bfa',
            backgroundColor: 'rgba(167,139,250,0.06)',
            borderWidth: 2, tension: 0.4, fill: false, pointRadius: 2, pointHoverRadius: 5
          },
          ...(apiTS.profile_views?.some(v => v > 0) ? [{
            label: 'Visitas perfil',
            data: apiTS.profile_views,
            yAxisID: 'ySmall',
            borderColor: '#2dd4bf',
            backgroundColor: 'transparent',
            borderWidth: 1.5, tension: 0.4, fill: false, pointRadius: 2, pointHoverRadius: 4,
            borderDash: [4, 3]
          }] : []),
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'top', align: 'end' }, tooltip: { backgroundColor: 'rgba(0,0,0,0.85)', padding: 10, cornerRadius: 8 } },
        scales: {
          x:      { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 10 } },
          yReach: { type: 'linear', position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => this._fmt(v) } },
          ySmall: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => this._fmt(v) } },
        }
      }
    });
  }

  _renderAudienceGenderChart(genderGroups) {
    const el = document.getElementById('mbGenderChart');
    if (!el) return;
    // Agrupar: M total, F total, U total
    const mTotal = Object.values(genderGroups.M || {}).reduce((s, v) => s + v, 0);
    const fTotal = Object.values(genderGroups.F || {}).reduce((s, v) => s + v, 0);
    const uTotal = Object.values(genderGroups.U || {}).reduce((s, v) => s + v, 0);
    const total  = mTotal + fTotal + uTotal;
    if (total === 0) return;
    const labels = [], data = [], colors = [];
    if (mTotal > 0) { labels.push('Masculino'); data.push(mTotal); colors.push('#60a5fa'); }
    if (fTotal > 0) { labels.push('Femenino');  data.push(fTotal); colors.push('#f472b6'); }
    if (uTotal > 0) { labels.push('No especif.'); data.push(uTotal); colors.push('#87868B'); }
    this._chartInstances.gender = new Chart(el, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: 'rgba(0,0,0,0.3)', borderWidth: 2, hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { display: true, position: 'bottom' },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)', padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => ` ${ctx.label}: ${((ctx.parsed / total) * 100).toFixed(1)}%` }
          }
        }
      }
    });
  }

  _renderAudienceCountriesChart(topCountries) {
    const el = document.getElementById('mbCountriesChart');
    if (!el) return;
    const labels = topCountries.map(c => c.country);
    const data   = topCountries.map(c => c.count);
    const total  = data.reduce((s, v) => s + v, 0);
    this._chartInstances.countries = new Chart(el, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: '#60a5faCC', borderColor: '#60a5fa', borderWidth: 1, borderRadius: 4 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)', padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => ` ${ctx.parsed.x.toLocaleString()} (${((ctx.parsed.x / total) * 100).toFixed(1)}%)` }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => this._fmt(v) } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // ── Data processing ────────────────────────────────────────────────────────

  _computeKPIs(insight, postsData) {
    const allPosts      = [...(postsData?.facebook_posts || []), ...(postsData?.instagram_posts || [])];
    const totalLikes    = allPosts.reduce((s, p) => s + (p.likes    || p.like_count    || 0), 0);
    const totalComments = allPosts.reduce((s, p) => s + (p.comments || p.comments_count|| 0), 0);
    const totalShares   = allPosts.reduce((s, p) => s + (p.shares   || 0), 0);
    const totalPosts    = allPosts.length;
    const snap          = insight?.dimensions?.A_activity?.snapshot || {};
    // Prefer enriched snapshot data over computed from posts
    const reach         = snap.reach    || snap.reach_ig    || snap.total_reach || 0;
    const impressions   = snap.impressions || 0;
    const followers     = snap.followers_ig || snap.fans_fb  || 0;
    const totalSaved    = snap.total_saved  || 0;
    const totalEngagement = snap.total_engagement ||
      (totalLikes + totalComments + totalShares + totalSaved);
    const engRate = reach > 0
      ? ((totalEngagement / reach) * 100).toFixed(1)
      : totalPosts > 0 ? (totalEngagement / totalPosts).toFixed(1) : '0.0';
    return { totalPosts, totalLikes, totalComments, totalShares, totalSaved, totalEngagement, reach, impressions, followers, engRate };
  }

  _buildTimeSeries(allPosts, days = 30) {
    const now     = new Date();
    const labels  = [];
    const dateMap = {};
    for (let i = days - 1; i >= 0; i--) {
      const key = new Date(now - i * 86400000).toISOString().slice(0, 10);
      labels.push(key);
      dateMap[key] = { posts: 0, engagement: 0 };
    }
    allPosts.forEach(p => {
      if (!p.created_time) return;
      const key = new Date(p.created_time).toISOString().slice(0, 10);
      if (!dateMap[key]) return;
      dateMap[key].posts++;
      dateMap[key].engagement += (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
    });
    return {
      labels:     labels.map(l => new Date(l + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })),
      posts:      labels.map(l => dateMap[l].posts),
      engagement: labels.map(l => dateMap[l].engagement),
    };
  }

  _buildContentTypes(allPosts) {
    const counts = {}, engMap = {};
    allPosts.forEach(p => {
      let type = (p.media_type || 'IMAGE').toUpperCase();
      if (type === 'CAROUSEL_ALBUM') type = 'CARRUSEL';
      else if (type === 'IMAGE')     type = 'IMAGEN';
      else if (type === 'TEXT' || type === 'LINK') type = 'TEXTO';
      counts[type] = (counts[type] || 0) + 1;
      engMap[type] = (engMap[type] || 0) + (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
    });
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count, avgEng: Math.round((engMap[label] || 0) / count) }))
      .sort((a, b) => b.count - a.count);
  }

  _getTopPosts(insight, allPosts) {
    const analyzed = insight?.dimensions?.G_sentiment?.top_posts || insight?.dimensions?.D_sentiment?.top_posts || [];
    if (analyzed.length >= 3) return analyzed;
    return [...allPosts]
      .map(p => ({ ...p, _eng: (p.likes || 0) + (p.comments || 0) + (p.shares || 0) }))
      .sort((a, b) => b._eng - a._eng)
      .slice(0, 5);
  }

  _generateInsights(kpis, timeSeries, contentTypes, insight) {
    const insights = [];
    const { posts: ps, engagement: engs } = timeSeries;
    const mid    = Math.floor(ps.length / 2);
    const rPosts = ps.slice(mid).reduce((a, b) => a + b, 0);
    const oPosts = ps.slice(0, mid).reduce((a, b) => a + b, 0);
    const rEng   = engs.slice(mid).reduce((a, b) => a + b, 0);
    const oEng   = engs.slice(0, mid).reduce((a, b) => a + b, 0);

    if (rPosts > oPosts * 1.4 && rEng < oEng * 0.9 && rPosts > 0) {
      insights.push({ type: 'warning', icon: 'fa-exclamation-triangle', text: 'Publicaste más recientemente, pero el engagement bajó. Menos puede ser más.' });
    }
    if (contentTypes.length >= 2) {
      const sorted = [...contentTypes].sort((a, b) => b.avgEng - a.avgEng);
      const best = sorted[0], worst = sorted[sorted.length - 1];
      if (best.avgEng > worst.avgEng * 1.5) {
        insights.push({ type: 'tip', icon: 'fa-lightbulb', text: `Los posts de <strong>${best.label}</strong> generan ${Math.round(best.avgEng / Math.max(1, worst.avgEng))}x más engagement que los de ${worst.label.toLowerCase()}.` });
      }
    }
    const er = parseFloat(kpis.engRate);
    if (!isNaN(er) && kpis.reach > 0) {
      if (er >= 5)   insights.push({ type: 'success', icon: 'fa-trophy',     text: `Engagement rate de <strong>${er}%</strong>. Excelente — top tier >5%.` });
      else if (er < 1) insights.push({ type: 'warning', icon: 'fa-chart-line', text: `Engagement rate de <strong>${er}%</strong>. El objetivo es superar el 3%.` });
    }

    // Insights enriquecidos desde API data
    const snap     = insight?.dimensions?.A_activity?.snapshot || {};
    const stories  = insight?.dimensions?.D_stories;
    const video    = insight?.dimensions?.E_video;
    const heatmap  = insight?.dimensions?.A_activity?.heatmap;

    if (snap.total_saved > 0 && snap.total_engagement > 0) {
      const savedPct = Math.round((snap.total_saved / snap.total_engagement) * 100);
      if (savedPct >= 15) {
        insights.push({ type: 'success', icon: 'fa-bookmark', text: `<strong>${savedPct}%</strong> de tus interacciones son guardados — señal de contenido de alto valor.` });
      }
    }
    if (stories?.exit_rate > 40) {
      insights.push({ type: 'warning', icon: 'fa-sign-out-alt', text: `Exit rate de stories: <strong>${stories.exit_rate}%</strong>. Considera hacer stories más cortas o dinámicas.` });
    }
    if (video?.avg_watch_time_s > 0) {
      if (video.avg_watch_time_s < 3) {
        insights.push({ type: 'warning', icon: 'fa-film', text: `Watch time promedio de <strong>${video.avg_watch_time_s}s</strong>. Los primeros 3 segundos son críticos para retener.` });
      } else if (video.avg_watch_time_s >= 15) {
        insights.push({ type: 'success', icon: 'fa-film', text: `Watch time promedio de <strong>${video.avg_watch_time_s}s</strong> — excelente retención de video.` });
      }
    }
    if (heatmap?.best_hour != null) {
      const bh = heatmap.best_hour;
      const bhStr = bh >= 12 ? `${bh === 12 ? 12 : bh - 12}pm` : `${bh === 0 ? 12 : bh}am`;
      const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const bdStr = days[heatmap.best_day] || '';
      if (bdStr) {
        insights.push({ type: 'tip', icon: 'fa-clock', text: `Tu audiencia responde mejor los <strong>${bdStr}</strong> a las <strong>${bhStr}</strong>.` });
      }
    }

    return insights;
  }

  // ── Formatters ─────────────────────────────────────────────────────────────

  _fmt(n) {
    if (n == null || isNaN(n)) return '—';
    if (n === 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n);
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

window.InsightView = InsightView;
