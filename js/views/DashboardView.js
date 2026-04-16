/**
 * DashboardView – Panel de inteligencia de marca.
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
class DashboardView extends BaseView {

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
    this._reconnectTimer    = null;   // reintento controlado de Realtime
    this._reconnectAttempts = 0;      // backoff exponencial
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
    this.updateHeaderContext('Dashboard', null, window.currentOrgName || '');
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
      competence:   () => { body.innerHTML = this._competenceLoadingSkeleton(); this._renderCompetence(); },
      tendencies:   () => { body.innerHTML = this._tendenciesLoadingSkeleton(); this._renderTendencies(); },
      strategy:     () => { body.innerHTML = this._monitoringLoadingSkeleton(); this._renderMonitoring(); },
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
    } catch (e) { console.error('[DashboardView] Supabase init:', e); }

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
      .select('id,nombre_marca,organizations(logo_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15);

    this._brandContainers = (containers || []).map((row) => ({
      id: row.id,
      nombre_marca: row.nombre_marca,
      logo_url: row.organizations?.logo_url ?? null,
    }));

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
    await this._ensureChartJs();
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
    this._clearReconnectTimer();
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
          if (this._liveReady) {
            this._reconnectAttempts = 0;
            this._clearReconnectTimer();
          }
          this._updateLiveIndicator(status);
        });
    } catch (e) {
      console.warn('[DashboardView] Realtime unavailable, using polling only:', e.message);
      this._updateLiveIndicator('POLLING');
      this._scheduleRealtimeReconnect('exception');
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
      if (sinceFetch < DashboardView.MIN_REFETCH_INTERVAL) return;

      // Re-fetch de DB (evento: usuario vuelve al tab)
      await this._dbRefresh();

      // Adicionalmente, si el último sync fue hace más de MIN_SYNC_INTERVAL → sync Meta
      if (sinceSyncc >= DashboardView.MIN_SYNC_INTERVAL) {
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
    // Skippeamos el update cuando la pestaña está oculta: el label se refresca al volver
    // vía visibilitychange en _setupVisibilityListener. Evita wakeups innecesarios cada 30s.
    this._labelTimer = setInterval(() => {
      if (document.hidden) return;
      this._updateLastSyncLabel();
    }, 30 * 1000);
  }

  _clearLabelInterval() {
    if (this._labelTimer) { clearInterval(this._labelTimer); this._labelTimer = null; }
  }

  _clearRefreshTimer() {
    if (this._refreshTimer) { clearTimeout(this._refreshTimer); this._refreshTimer = null; }
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _scheduleRealtimeReconnect(source) {
    if (this._reconnectTimer) return; // evita múltiples timers concurrentes
    if (this._activeTab !== 'my-brands' || !this._brandContainerId) return;
    this._reconnectAttempts += 1;
    const delay = Math.min(60000, 5000 * (2 ** Math.max(0, this._reconnectAttempts - 1)));
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._activeTab !== 'my-brands' || !this._brandContainerId) return;
      this._setupRealtimeSubscription();
    }, delay);
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
      if (Date.now() - (this._lastFetchTime || 0) < DashboardView.MIN_REFETCH_INTERVAL) return;
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
    if (sinceLast < DashboardView.MIN_SYNC_INTERVAL) return; // rate-limit

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
      } else if (!res.ok) {
        console.warn('[DashboardView] sync-meta:', res.status, data?.error || '', data?.meta || '');
      }
    } catch (e) {
      console.warn('[DashboardView] Background sync failed:', e.message);
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
      this._scheduleRealtimeReconnect(status);
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
    const kpis         = this._computeKPIs(insight, posts);
    const timeSeries   = this._buildTimeSeries(allPosts, parseInt(this._period) || 30);
    const contentTypes = this._buildContentTypes(allPosts);
    const topPosts     = this._getTopPosts(insight, allPosts);
    const autoInsights = this._generateInsights(kpis, timeSeries, contentTypes, insight);
    const brandName    = insight?.brand?.nombre_marca
      || this._brandContainers.find(b => b.id === this._brandContainerId)?.nombre_marca
      || 'Mi Marca';

    const snap       = insight?.dimensions?.A_activity?.snapshot || {};
    const apiTS      = insight?.dimensions?.A_activity?.time_series || null;
    const audience   = insight?.dimensions?.C_audience || null;
    const stories    = insight?.dimensions?.D_stories  || null;
    const video      = insight?.dimensions?.E_video    || null;
    const narrative  = insight?.dimensions?.B_narrative || {};
    const sentiment  = insight?.dimensions?.G_sentiment || {};
    const diagnostic = insight?.dimensions?.H_diagnostic || {};
    const hasGrowthTS = apiTS && apiTS.dates?.length > 1;

    const vera = this._computeVERAScore(insight, kpis, timeSeries, contentTypes);
    const roas = this._computeOrgROAS(kpis);

    // ── Computar estados dinámicos para cada módulo ──────────────────────────

    // Heatmap: mejor ventana de publicación
    const hm        = insight?.dimensions?.A_activity?.heatmap;
    const hmDays    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const bestHourN = hm?.best_hour ?? null;
    const bestHourStr = bestHourN != null
      ? (bestHourN >= 12 ? `${bestHourN === 12 ? 12 : bestHourN - 12}pm` : `${bestHourN || 12}am`)
      : null;
    const bestDayStr  = hm?.best_day != null ? hmDays[hm.best_day] : null;
    const bestWindowStr = (bestDayStr && bestHourStr) ? `${bestDayStr} ${bestHourStr}` : null;

    // Formato con mayor ROI
    const bestFmt = contentTypes.length
      ? [...contentTypes].sort((a, b) => b.avgEng - a.avgEng)[0]
      : null;
    const worstFmt = contentTypes.length > 1
      ? [...contentTypes].sort((a, b) => b.avgEng - a.avgEng).slice(-1)[0]
      : null;
    const fmtMult = (bestFmt && worstFmt && worstFmt.avgEng > 0)
      ? Math.round((bestFmt.avgEng / worstFmt.avgEng) * 10) / 10
      : null;

    // Sentimiento dominante
    const allEmotions   = narrative.emotion_distribution || sentiment.emotion_distribution || [];
    const dominantEmo   = allEmotions[0]?.emotion || null;
    const totalAnalyzed = narrative.analyzed_posts || 0;

    // Estado por módulo (100% dinámico)
    const s1Status = [
      `Score ${vera.score} · ${vera.label}`,
      vera.trendUp ? '↑ tendencia positiva' : null,
      diagnostic.vulnerabilities?.length
        ? `${diagnostic.vulnerabilities.length} alerta${diagnostic.vulnerabilities.length > 1 ? 's' : ''} activa${diagnostic.vulnerabilities.length > 1 ? 's' : ''}`
        : null,
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');

    const s2Status = [
      kpis.followers > 0 ? `${this._fmt(kpis.followers)} seguidores` : null,
      bestWindowStr ? `Ventana óptima · ${bestWindowStr}` : null,
      audience?.has_data ? 'Demografía disponible' : 'Sin datos demográficos',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');

    const s3Status = [
      kpis.totalPosts > 0 ? `${kpis.totalPosts} posts en ${this._period}` : 'Sin publicaciones',
      fmtMult && fmtMult > 1 ? `${bestFmt.label} · ${fmtMult}x ROI` : bestFmt ? `${bestFmt.label} lidera` : null,
      roas ? `ROAS org. ${roas.label}` : null,
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');

    const s4Status = [
      dominantEmo   ? `${dominantEmo} dominante` : null,
      diagnostic.coherence_avg != null ? `Coherencia ${diagnostic.coherence_avg}/100` : null,
      totalAnalyzed > 0 ? `${totalAnalyzed} posts analizados` : 'Pendiente de análisis IA',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');

    const s5Status = [
      `${autoInsights.length + (vera.score < 65 ? 1 : 0) + (narrative.pillars_orphan?.length ? 1 : 0)} acciones identificadas`,
      `${Object.keys(insight?.dimensions || {}).length} dimensiones cruzadas`,
    ].join(' &nbsp;·&nbsp; ');

    // Descripciones de widgets (100% dinámicas)
    const descHeatmap   = bestWindowStr
      ? `Publicar en <strong>${bestWindowStr}</strong> maximiza tu alcance — ventana óptima calculada de ${allPosts.length} publicaciones`
      : `Publica más contenido para calcular tu ventana de publicación personalizada`;
    const descActivity  = kpis.totalPosts > 0
      ? `${kpis.totalPosts} posts · ${this._fmt(kpis.totalEngagement)} interacciones totales · ${this._fmt(kpis.reach)} reach acumulado`
      : 'Sin publicaciones en el período seleccionado';
    const descGrowth    = kpis.reach > 0
      ? `${this._fmt(kpis.reach)} reach · ${this._fmt(snap.impressions || 0)} impresiones${roas ? ` · Valor equivalente: <strong style="color:#6bcf7f">${roas.label} USD en paid ads</strong>` : ''}`
      : 'Sin datos de reach disponibles — conecta Meta para ver el crecimiento';
    const descTopPosts  = allPosts.length > 0
      ? `${topPosts.length} posts de mayor rendimiento de ${allPosts.length} publicaciones analizadas`
      : 'Sin publicaciones en el período';
    const descFormatROI = fmtMult && fmtMult > 1
      ? `<strong style="color:#fb923c">${bestFmt.label}</strong> genera ${fmtMult}x más engagement que ${worstFmt.label.toLowerCase()} — ${contentTypes.length} formatos comparados`
      : `${contentTypes.length} tipos de contenido comparados por engagement promedio`;
    const descEmotion   = totalAnalyzed > 0
      ? `${totalAnalyzed} posts analizados por IA · Emoción dominante: <strong>${dominantEmo || 'Mixto'}</strong> · Exclusivo VERA`
      : 'Conecta Meta y analiza contenido para ver el espectro emocional de tu audiencia';
    const descTone      = diagnostic.coherence_avg != null
      ? `Coherencia de tono: <strong style="color:${diagnostic.coherence_avg >= 70 ? '#6bcf7f' : '#fb923c'}">${diagnostic.coherence_avg}/100</strong> · ${narrative.top_tones?.length || 0} tonos detectados · ${narrative.analyzed_posts || 0} posts`
      : `${narrative.top_tones?.length || 0} tonos detectados en el contenido publicado`;
    const descAudience  = audience?.has_data
      ? `Segmentación activa · ${audience.top_countries?.length || 0} países mapeados · Datos de Meta Audience Insights`
      : 'Conecta Meta Insights para ver la demografía de tu audiencia';

    return `
      <div class="mb-intel-dashboard" id="mbDashboard">

        <!-- ── TOP BAR ── -->
        <div class="mb-intel-topbar">
          <div class="mb-intel-topbar-left">
            ${this._brandContainers.length > 1 ? `
              <select class="mb-brand-select" id="mbBrandSelect">
                ${this._brandContainers.map(b => `
                  <option value="${this._esc(b.id)}" ${b.id === this._brandContainerId ? 'selected' : ''}>
                    ${this._esc(b.nombre_marca)}
                  </option>`).join('')}
              </select>
            ` : `<span class="mb-intel-brand-name">${this._esc(brandName)}</span>`}
            <div class="mb-live-indicator">
              <span class="mb-live-dot mb-live-dot--connecting" id="mbLiveDot"></span>
              <span class="mb-live-label" id="mbLiveLabel">Conectando…</span>
            </div>
          </div>
          <div class="mb-intel-topbar-right">
            <div class="mb-sync-toast" id="mbSyncToast" style="display:none">
              <i class="fas fa-sync-alt mb-spin"></i><span>Sincronizando…</span>
            </div>
            <div class="mb-last-sync-wrap">
              <i class="fas fa-clock" style="font-size:0.7rem;opacity:0.4"></i>
              <span class="mb-last-sync" id="mbLastSync">Ahora</span>
            </div>
            <div class="mb-period-tabs" id="mbPeriodTabs">
              ${['7d','30d','90d'].map(p => `
                <button class="mb-period-btn${this._period === p ? ' active' : ''}" data-period="${p}">${p}</button>`).join('')}
            </div>
            <button class="mb-refresh-btn" id="mbRefreshBtn" title="Sincronizar ahora">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>

        ${!metaConnected ? `
          <div class="mb-connect-banner">
            <i class="fab fa-facebook-square"></i>
            <span>Conecta Meta para activar métricas de Instagram y Facebook en tiempo real.</span>
            <a href="${window.currentOrgPath ? window.currentOrgPath + '/brand' : '/brands'}" class="mb-connect-link">
              Conectar integración →
            </a>
          </div>
        ` : ''}

        <!-- ── BRAND INTELLIGENCE ── -->
        <div class="mb-intel-block" id="section-brand">
          <div class="mb-intel-header">
            <span class="mb-intel-module">BRAND INTELLIGENCE</span>
            <span class="mb-intel-meta">${s1Status}</span>
          </div>
          <div class="mb-vera-layout">
            ${this._buildVERAScoreHTML(vera)}
            <div class="mb-kpi-grid">
              ${this._buildKPICards(kpis, snap, roas)}
            </div>
          </div>
        </div>

        <!-- ── AUDIENCE INTELLIGENCE ── -->
        <div class="mb-intel-block" id="section-audience">
          <div class="mb-intel-header">
            <span class="mb-intel-module">AUDIENCE INTELLIGENCE</span>
            <span class="mb-intel-meta">${s2Status}</span>
          </div>
          <div class="mb-intel-body">
            <div class="mb-widget mb-widget--wide">
              <div class="mb-widget-header">
                <span class="mb-widget-icon" style="background:rgba(250,204,21,0.12);color:#facc15">
                  <i class="fas fa-broadcast-tower"></i>
                </span>
                <div>
                  <div class="mb-widget-title">Ventana de Publicación Óptima</div>
                  <div class="mb-widget-desc">${descHeatmap}</div>
                </div>
              </div>
              ${this._buildHeatmapHTML(allPosts, insight?.dimensions?.A_activity?.heatmap)}
            </div>
            ${audience?.has_data ? `
            <div class="mb-widget">
              <div class="mb-widget-header">
                <span class="mb-widget-icon" style="background:rgba(244,114,182,0.12);color:#f472b6">
                  <i class="fas fa-users"></i>
                </span>
                <div>
                  <div class="mb-widget-title">Segmentación Demográfica</div>
                  <div class="mb-widget-desc">${descAudience}</div>
                </div>
              </div>
              <div class="mb-chart-wrap-sm"><canvas id="mbGenderChart"></canvas></div>
              ${audience.top_countries?.length ? `
                <div class="mb-widget-divider"></div>
                <div class="mb-widget-sublabel">Distribución geográfica</div>
                <div style="height:130px"><canvas id="mbCountriesChart"></canvas></div>
              ` : ''}
            </div>
            ` : ''}
          </div>
        </div>

        <!-- ── CONTENT PERFORMANCE ── -->
        <div class="mb-intel-block" id="section-content">
          <div class="mb-intel-header">
            <span class="mb-intel-module">CONTENT PERFORMANCE</span>
            <span class="mb-intel-meta">${s3Status}</span>
          </div>
          <div class="mb-intel-body mb-intel-body--stack">

            <div class="mb-widget mb-widget--full">
              <div class="mb-widget-header">
                <span class="mb-widget-icon" style="background:rgba(107,207,127,0.12);color:#6bcf7f">
                  <i class="fas fa-chart-line"></i>
                </span>
                <div>
                  <div class="mb-widget-title">Cadencia de Publicación</div>
                  <div class="mb-widget-desc">${descActivity}</div>
                </div>
              </div>
              <div class="mb-chart-wrap"><canvas id="mbActivityChart"></canvas></div>
            </div>

            ${hasGrowthTS ? `
            <div class="mb-widget mb-widget--full">
              <div class="mb-widget-header">
                <span class="mb-widget-icon" style="background:rgba(96,165,250,0.12);color:#60a5fa">
                  <i class="fas fa-chart-area"></i>
                </span>
                <div>
                  <div class="mb-widget-title">Alcance Orgánico & ROAS</div>
                  <div class="mb-widget-desc">${descGrowth}</div>
                </div>
              </div>
              <div class="mb-chart-wrap"><canvas id="mbGrowthChart"></canvas></div>
            </div>
            ` : ''}

            <div class="mb-intel-row">
              <div class="mb-widget">
                <div class="mb-widget-header">
                  <span class="mb-widget-icon" style="background:rgba(167,139,250,0.12);color:#a78bfa">
                    <i class="fas fa-medal"></i>
                  </span>
                  <div>
                    <div class="mb-widget-title">Posts de Mayor Rendimiento</div>
                    <div class="mb-widget-desc">${descTopPosts}</div>
                  </div>
                </div>
                ${topPosts.length ? this._buildTopPostsHTML(topPosts) : `<div class="mb-empty-sm"><i class="fas fa-images"></i><p>Sin publicaciones en el período</p></div>`}
              </div>
              <div class="mb-widget">
                <div class="mb-widget-header">
                  <span class="mb-widget-icon" style="background:rgba(251,146,60,0.12);color:#fb923c">
                    <i class="fas fa-analytics" style="font-family:inherit"></i>
                    <i class="fas fa-layer-group"></i>
                  </span>
                  <div>
                    <div class="mb-widget-title">ROI por Formato de Contenido</div>
                    <div class="mb-widget-desc">${descFormatROI}</div>
                  </div>
                </div>
                ${contentTypes.length ? `
                  <div class="mb-chart-wrap-sm" style="height:150px"><canvas id="mbContentChart"></canvas></div>
                  <div class="mb-content-legend" id="mbContentLegend"></div>
                  <div class="mb-eng-bars-wrap">
                    ${(() => {
                      const colors = ['#6bcf7f','#60a5fa','#a78bfa','#fb923c','#f472b6','#2dd4bf'];
                      const maxEng = Math.max(...contentTypes.map(x => x.avgEng), 1);
                      return contentTypes.slice(0, 4).map((c, i) => `
                        <div class="mb-eng-bar-row">
                          <span class="mb-eng-bar-label">${c.label}</span>
                          <div class="mb-eng-bar-track">
                            <div class="mb-eng-bar-fill" style="width:${(c.avgEng/maxEng*100).toFixed(0)}%;background:${colors[i]}"></div>
                          </div>
                          <span class="mb-eng-bar-val">${this._fmt(c.avgEng)}</span>
                        </div>`).join('');
                    })()}
                  </div>
                ` : `<div class="mb-empty-sm"><i class="fas fa-chart-pie"></i><p>Sin datos de formato</p></div>`}
              </div>
            </div>

          </div>
        </div>

        <!-- ── EMOTIONAL ANALYTICS ── -->
        <div class="mb-intel-block" id="section-sentiment">
          <div class="mb-intel-header">
            <span class="mb-intel-module">EMOTIONAL ANALYTICS</span>
            <span class="mb-intel-meta">${s4Status}</span>
          </div>
          <div class="mb-intel-body">

            <div class="mb-widget mb-widget--wide">
              <div class="mb-widget-header">
                <span class="mb-widget-icon" style="background:rgba(45,212,191,0.12);color:#2dd4bf">
                  <i class="fas fa-brain"></i>
                </span>
                <div>
                  <div class="mb-widget-title">Análisis de Sentimiento por IA</div>
                  <div class="mb-widget-desc">${descEmotion}</div>
                </div>
              </div>
              ${this._buildEmotionSpectrumHTML(narrative, sentiment)}
            </div>

            <div class="mb-widget">
              <div class="mb-widget-header">
                <span class="mb-widget-icon" style="background:rgba(244,114,182,0.12);color:#f472b6">
                  <i class="fas fa-fingerprint"></i>
                </span>
                <div>
                  <div class="mb-widget-title">Perfil de Tono & Narrativa</div>
                  <div class="mb-widget-desc">${descTone}</div>
                </div>
              </div>
              ${narrative.top_tones?.length ? `
                <div class="mb-chart-wrap-sm" style="height:160px"><canvas id="mbToneChart"></canvas></div>
              ` : `<div class="mb-empty-sm"><i class="fas fa-comment-alt"></i><p>Publica más contenido para calcular el perfil de tono.</p></div>`}
              ${narrative.pillars_active?.length ? `
                <div class="mb-widget-divider"></div>
                <div class="mb-widget-sublabel">Pilares narrativos activos</div>
                <div class="mb-pillars-list">
                  ${narrative.pillars_active.slice(0, 4).map(p => `
                    <div class="mb-pillar-tag mb-pillar-tag--active">
                      <i class="fas fa-check-circle"></i> ${this._esc(p.pillar_name || p.name || '')}
                    </div>`).join('')}
                </div>
                ${narrative.pillars_orphan?.length ? `
                  <div class="mb-widget-sublabel mb-widget-sublabel--warn" style="margin-top:0.75rem">
                    <i class="fas fa-exclamation-circle"></i> Sin actividad reciente
                  </div>
                  <div class="mb-pillars-list">
                    ${narrative.pillars_orphan.slice(0, 3).map(p => `
                      <div class="mb-pillar-tag mb-pillar-tag--orphan">${this._esc(p.pillar_name || p.name || '')}</div>`).join('')}
                  </div>
                ` : ''}
              ` : ''}
            </div>

            ${stories ? `
            <div class="mb-widget">
              <div class="mb-widget-header">
                <span class="mb-widget-icon" style="background:rgba(244,114,182,0.12);color:#f472b6">
                  <i class="fas fa-circle-notch"></i>
                </span>
                <div>
                  <div class="mb-widget-title">Stories Performance</div>
                  <div class="mb-widget-desc">${stories.count} stories · Exit rate: <strong style="color:${stories.exit_rate > 40 ? '#fb923c' : '#6bcf7f'}">${stories.exit_rate != null ? stories.exit_rate + '%' : '—'}</strong> · ${this._fmt(stories.total_reach)} reach</div>
                </div>
              </div>
              ${this._buildStoriesHTML(stories, video)}
            </div>
            ` : video ? `
            <div class="mb-widget">
              <div class="mb-widget-header">
                <span class="mb-widget-icon" style="background:rgba(251,146,60,0.12);color:#fb923c">
                  <i class="fas fa-film"></i>
                </span>
                <div>
                  <div class="mb-widget-title">Video & Reels Performance</div>
                  <div class="mb-widget-desc">${video.count} videos · ${this._fmt(video.total_views)} views · ${video.avg_watch_time_s > 0 ? video.avg_watch_time_s + 's watch time promedio' : 'Watch time en cálculo'}</div>
                </div>
              </div>
              <div class="mb-video-summary">
                <div class="mb-video-kpi">
                  <div class="mb-video-kpi-val">${this._fmt(video.total_views)}</div>
                  <div class="mb-video-kpi-lbl">Views totales</div>
                </div>
                <div class="mb-video-kpi">
                  <div class="mb-video-kpi-val">${video.avg_watch_time_s > 0 ? video.avg_watch_time_s + 's' : '—'}</div>
                  <div class="mb-video-kpi-lbl">Watch time prom.</div>
                </div>
                <div class="mb-video-kpi">
                  <div class="mb-video-kpi-val">${video.count}</div>
                  <div class="mb-video-kpi-lbl">Videos</div>
                </div>
              </div>
            </div>
            ` : ''}

          </div>
        </div>

        <!-- ── NARRATIVE INTELLIGENCE ── -->
        <div class="mb-intel-block" id="section-narrative-intel">
          <div class="mb-intel-header">
            <span class="mb-intel-module">NARRATIVE INTELLIGENCE</span>
            <span class="mb-intel-meta">${narrative.pillars_active?.length || 0} pilares activos · ${narrative.pillars_orphan?.length || 0} temas huérfanos</span>
          </div>
          <div class="mb-intel-body">
            <div class="mb-widget mb-widget--wide">
              <div class="mb-widget-header">
                <span class="mb-widget-icon imb-col--indigo"><i class="fas fa-compass"></i></span>
                <div>
                  <div class="mb-widget-title">Pilares Narrativos</div>
                  <div class="mb-widget-desc">${narrative.pillars_active?.length ? 'Distribución de contenido por pilar estratégico' : 'Se construirá al analizar más contenido'}</div>
                </div>
              </div>
              ${narrative.pillars_active?.length ? `<div class="sd-chart-wrap" id="mbPillarsRadarChart"></div>` : '<div class="mb-empty-sm"><i class="fas fa-compass"></i><p>Publica más contenido para ver tus pilares narrativos</p></div>'}
            </div>
            <div class="mb-widget">
              <div class="mb-widget-header">
                <span class="mb-widget-icon imb-col--purple"><i class="fas fa-shield-alt"></i></span>
                <div>
                  <div class="mb-widget-title">Brand Soul Guard</div>
                  <div class="mb-widget-desc">Coherencia de tono de marca</div>
                </div>
              </div>
              <div style="text-align:center;padding:0.75rem 0">
                <div style="font-size:2.25rem;font-weight:800;color:${(diagnostic.coherence_avg || 0) >= 70 ? '#4ade80' : (diagnostic.coherence_avg || 0) >= 40 ? '#fbbf24' : '#f87171'};line-height:1">${diagnostic.coherence_avg != null ? diagnostic.coherence_avg : '—'}</div>
                <div style="font-size:0.72rem;color:rgba(212,209,216,0.45);margin-top:0.35rem">Coherencia de tono / 100</div>
              </div>
              ${narrative.pillars_orphan?.length ? `
                <hr class="mb-widget-divider">
                <div class="mb-widget-sublabel mb-widget-sublabel--warn">Temas Huérfanos</div>
                <div class="mb-pillars-list">${narrative.pillars_orphan.map(p => `<span class="mb-pillar-tag mb-pillar-tag--orphan"><i class="fas fa-exclamation-circle"></i> ${this._esc(typeof p === 'string' ? p : p.pillar_name || p.name || '?')}</span>`).join('')}</div>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- ── COMMERCIAL INTELLIGENCE ── -->
        ${insight?.dimensions?.F_retail || false ? `
        <div class="mb-intel-block" id="section-commercial">
          <div class="mb-intel-header">
            <span class="mb-intel-module">COMMERCIAL INTELLIGENCE</span>
            <span class="mb-intel-meta">Precios y disponibilidad en retailers</span>
          </div>
          <div class="mb-intel-body mb-intel-body--stack">
            <div class="mb-widget mb-widget--full">
              <div class="mb-widget-header">
                <span class="mb-widget-icon imb-col--orange"><i class="fas fa-store"></i></span>
                <div>
                  <div class="mb-widget-title">MAP Monitor</div>
                  <div class="mb-widget-desc">Rastreo de precios propios en retailers</div>
                </div>
              </div>
              <div class="sd-chart-wrap" id="mbRetailPriceChart"></div>
            </div>
          </div>
        </div>` : ''}

        <!-- ── DIAGNOSTIC SWOT ── -->
        ${diagnostic.vulnerabilities?.length || diagnostic.strengths?.length ? `
        <div class="mb-intel-block" id="section-swot">
          <div class="mb-intel-header">
            <span class="mb-intel-module">SWOT DINÁMICO</span>
            <span class="mb-intel-meta">${diagnostic.vulnerabilities?.length || 0} vulnerabilidades · ${diagnostic.strengths?.length || 0} fortalezas</span>
          </div>
          <div class="mb-intel-row">
            ${diagnostic.strengths?.length ? `<div class="mb-widget">
              <div class="mb-widget-header"><span class="mb-widget-icon imb-col--green"><i class="fas fa-check-circle"></i></span><div><div class="mb-widget-title">Fortalezas</div></div></div>
              ${diagnostic.strengths.slice(0, 5).map(s => `<div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.35rem 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.82rem"><i class="fas fa-check" style="color:#4ade80;margin-top:2px;flex-shrink:0"></i><span style="color:var(--text-primary)">${this._esc(typeof s === 'string' ? s : s.title || '—')}</span></div>`).join('')}
            </div>` : ''}
            ${diagnostic.vulnerabilities?.length ? `<div class="mb-widget">
              <div class="mb-widget-header"><span class="mb-widget-icon imb-col--red"><i class="fas fa-exclamation-triangle"></i></span><div><div class="mb-widget-title">Vulnerabilidades</div></div></div>
              ${diagnostic.vulnerabilities.slice(0, 5).map(v => `<div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.35rem 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.82rem"><i class="fas fa-exclamation-circle" style="color:#f87171;margin-top:2px;flex-shrink:0"></i><span style="color:var(--text-primary)">${this._esc(typeof v === 'string' ? v : v.title || '—')}</span></div>`).join('')}
            </div>` : ''}
          </div>
        </div>` : ''}

        <!-- ── STRATEGIC ACTIONS ── -->
        <div class="mb-intel-block mb-intel-block--last" id="section-strategy">
          <div class="mb-intel-header">
            <span class="mb-intel-module">STRATEGIC ACTIONS</span>
            <span class="mb-intel-meta">${s5Status}</span>
          </div>
          <div class="mb-action-grid">
            ${this._buildStrategicActions(autoInsights, diagnostic, vera, kpis, contentTypes, narrative, roas)}
          </div>
        </div>

      </div>`;
  }

  // ── Score VERA™ ───────────────────────────────────────────────────────────

  _computeVERAScore(insight, kpis, timeSeries, contentTypes) {
    const snap       = insight?.dimensions?.A_activity?.snapshot || {};
    const narrative  = insight?.dimensions?.B_narrative || {};
    const stories    = insight?.dimensions?.D_stories;
    const video      = insight?.dimensions?.E_video;
    const diagnostic = insight?.dimensions?.H_diagnostic || {};
    let score = 0;

    // 1. Engagement rate (0-15 pts)
    const er = parseFloat(kpis.engRate);
    const erPts = !isNaN(er) && kpis.reach > 0 ? Math.min(15, er * 3) : 0;
    score += erPts;

    // 2. Reach (0-10 pts)
    const reachPts = kpis.reach > 50000 ? 10 : kpis.reach > 10000 ? 8 : kpis.reach > 1000 ? 5 : kpis.reach > 0 ? 2 : 0;
    score += reachPts;

    // 3. Posting frequency (0-10 pts)
    const days = parseInt(this._period) || 30;
    const freqPerWeek = (kpis.totalPosts / days) * 7;
    const freqPts = freqPerWeek >= 5 ? 10 : freqPerWeek >= 3 ? 8 : freqPerWeek >= 1 ? 5 : freqPerWeek > 0 ? 2 : 0;
    score += freqPts;

    // 4. Content diversity (0-8 pts)
    const divPts = contentTypes.length >= 3 ? 8 : contentTypes.length === 2 ? 5 : contentTypes.length === 1 ? 2 : 0;
    score += divPts;

    // 5. Tone coherence (0-10 pts)
    const coherence = diagnostic.coherence_avg || narrative.coherence_avg;
    const cohPts = coherence ? Math.min(10, Math.round(coherence / 10)) : 0;
    score += cohPts;

    // 6. Clarity score (0-10 pts)
    const clarity = diagnostic.clarity_avg;
    const claPts = clarity ? Math.min(10, Math.round(clarity / 10)) : 0;
    score += claPts;

    // 7. Saves rate (0-8 pts)
    const savedPct = snap.total_engagement > 0 ? (snap.total_saved / snap.total_engagement) * 100 : 0;
    const savePts = savedPct >= 20 ? 8 : savedPct >= 10 ? 5 : savedPct > 0 ? 2 : 0;
    score += savePts;

    // 8. Stories exit rate (0-8 pts)
    const storyPts = stories
      ? (stories.exit_rate < 20 ? 8 : stories.exit_rate < 35 ? 5 : 2)
      : 0;
    score += storyPts;

    // 9. Video retention (0-8 pts)
    const videoPts = video?.avg_watch_time_s > 0
      ? (video.avg_watch_time_s >= 15 ? 8 : video.avg_watch_time_s >= 5 ? 5 : 2)
      : 0;
    score += videoPts;

    // 10. Followers baseline (0-8 pts)
    const followers = kpis.followers;
    const followerPts = followers >= 50000 ? 8 : followers >= 10000 ? 6 : followers >= 1000 ? 4 : followers > 0 ? 2 : 0;
    score += followerPts;

    // 11. Vulnerability penalty
    const vulnCount = diagnostic.vulnerabilities?.length || 0;
    score = Math.max(0, score - Math.min(10, vulnCount * 2));

    // 12. Engagement trend bonus (0-5 pts)
    const ps = timeSeries.engagement || [];
    const mid = Math.floor(ps.length / 2);
    const recentEng = ps.slice(mid).reduce((a, b) => a + b, 0);
    const oldEng    = ps.slice(0, mid).reduce((a, b) => a + b, 0);
    const trendPts  = recentEng > oldEng * 1.1 ? 5 : recentEng > oldEng * 0.9 ? 2 : 0;
    score += trendPts;

    const finalScore = Math.min(100, Math.round(score));
    let label, color;
    if (finalScore >= 80)      { label = 'Excelente';          color = '#6bcf7f'; }
    else if (finalScore >= 65) { label = 'Bien';               color = '#60a5fa'; }
    else if (finalScore >= 45) { label = 'En proceso';         color = '#facc15'; }
    else                       { label = 'Necesita atención';  color = '#fb923c'; }

    const factors = [
      { label: 'Engagement', pts: erPts,      max: 15 },
      { label: 'Frecuencia', pts: freqPts,    max: 10 },
      { label: 'Coherencia', pts: cohPts,     max: 10 },
      { label: 'Reach',      pts: reachPts,   max: 10 },
      { label: 'Diversidad', pts: divPts,     max: 8  },
      { label: 'Guardados',  pts: savePts,    max: 8  },
      { label: 'Video',      pts: videoPts,   max: 8  },
      { label: 'Stories',    pts: storyPts,   max: 8  },
    ].map(f => ({ ...f, pct: Math.round((f.pts / f.max) * 100) }))
     .sort((a, b) => b.pts - a.pts);

    return { score: finalScore, label, color, factors, trendUp: trendPts > 0 };
  }

  _computeOrgROAS(kpis) {
    const CPM  = 7; // USD avg CPM
    const reach = kpis.reach || 0;
    if (reach === 0) return null;
    const val   = (reach / 1000) * CPM;
    const label = val >= 1000 ? `$${(val / 1000).toFixed(1)}K` : `$${Math.round(val)}`;
    return { reach, value: Math.round(val), cpm: CPM, label };
  }

  _buildVERAScoreHTML(vera) {
    const { score, label, color, factors } = vera;
    // SVG half-arc gauge
    const r = 54, circumference = Math.PI * r;
    const offset = (circumference - (score / 100) * circumference).toFixed(2);
    return `
      <div class="mb-vera-card">
        <div class="mb-vera-gauge-wrap">
          <svg class="mb-vera-gauge" viewBox="0 0 128 82" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 10 72 A ${r} ${r} 0 0 1 118 72"
              stroke="rgba(255,255,255,0.08)" stroke-width="10" fill="none" stroke-linecap="round"/>
            <path d="M 10 72 A ${r} ${r} 0 0 1 118 72"
              stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"
              stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset}"
              class="mb-vera-arc"/>
          </svg>
          <div class="mb-vera-score-inner">
            <div class="mb-vera-number" style="color:${color}">${score}</div>
            <div class="mb-vera-label">${label}</div>
          </div>
        </div>
        <div class="mb-vera-title">Score VERA™</div>
        <div class="mb-vera-sub">Salud de marca · ${this._period}</div>
        <div class="mb-vera-factors">
          ${factors.slice(0, 4).map(f => `
            <div class="mb-vera-factor">
              <span class="mb-vera-factor-name">${f.label}</span>
              <div class="mb-vera-factor-track">
                <div class="mb-vera-factor-fill" style="width:${f.pct}%;background:${f.pct >= 70 ? color : f.pct >= 40 ? '#facc15' : '#fb923c44'}"></div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  _buildKPICards(kpis, snap, roas) {
    const followers  = snap.followers_ig || snap.fans_fb || kpis.followers || 0;
    const impressions = snap.impressions || kpis.impressions || 0;
    const saved       = snap.total_saved || kpis.totalSaved || 0;
    const er          = parseFloat(kpis.engRate);
    const erTier      = !isNaN(er) ? (er >= 5 ? 'top' : er >= 3 ? 'good' : er > 0 ? 'low' : null) : null;

    const cards = [
      { icon: 'fa-users',      color: 'teal',   value: this._fmt(followers),            label: 'Seguidores',  sub: snap.followers_ig > 0 ? 'Instagram' : snap.fans_fb > 0 ? 'Facebook' : 'Total' },
      { icon: 'fa-eye',        color: 'blue',   value: this._fmt(kpis.reach),           label: 'Reach',       sub: `${this._fmt(impressions)} impresiones`, highlight: roas ? `≈ ${roas.label} en ads` : null },
      { icon: 'fa-heart',      color: 'orange', value: this._fmt(kpis.totalEngagement), label: 'Engagement',  sub: `${this._fmt(kpis.totalLikes)} likes · ${this._fmt(kpis.totalComments)} comentarios` },
      { icon: 'fa-percentage', color: 'purple', value: kpis.engRate + '%',              label: 'Eng. Rate',   sub: kpis.reach > 0 ? 'Sobre reach total' : 'Sobre interacciones', tier: erTier },
      { icon: 'fa-bookmark',   color: 'pink',   value: this._fmt(saved),               label: 'Guardados',   sub: snap.ig_posts_count > 0 ? `${snap.ig_posts_count} posts IG` : 'Total saves' },
      { icon: 'fa-file-alt',   color: 'green',  value: this._fmt(kpis.totalPosts),     label: 'Posts',       sub: `${this._fmt(kpis.totalLikes)} likes · ${this._fmt(kpis.totalShares)} shares` },
    ];

    const tierLabel = { top: 'top tier', good: 'buen nivel', low: 'mejorable' };
    const tierColor = { top: '#6bcf7f', good: '#60a5fa', low: '#fb923c' };

    return cards.map(c => `
      <div class="mb-kpi2-card">
        <div class="mb-kpi-icon mb-kpi-icon--${c.color}"><i class="fas ${c.icon}"></i></div>
        <div class="mb-kpi-body">
          <div class="mb-kpi-value">${c.value}</div>
          <div class="mb-kpi-label">${c.label}</div>
          <div class="mb-kpi-sub">${c.sub}</div>
          ${c.highlight ? `<div class="mb-kpi-highlight"><i class="fas fa-coins"></i> ${c.highlight}</div>` : ''}
          ${c.tier ? `<span class="mb-kpi-tier" style="background:${tierColor[c.tier]}22;color:${tierColor[c.tier]}">${tierLabel[c.tier]}</span>` : ''}
        </div>
      </div>`).join('');
  }

  // ── Espectro Emocional ──────────────────────────────────────────────────────

  _buildEmotionSpectrumHTML(narrative, sentiment) {
    const emotions = narrative?.emotion_distribution || sentiment?.emotion_distribution || [];
    if (!emotions.length) {
      return `<div class="mb-empty-sm"><i class="fas fa-heartbeat" style="opacity:0.3"></i><p>Analiza más contenido para ver el espectro emocional de tu audiencia.</p></div>`;
    }

    const emotionCfg = {
      alegría:     { color: '#facc15', icon: '😊', label: 'Alegría' },
      joy:         { color: '#facc15', icon: '😊', label: 'Alegría' },
      inspiración: { color: '#6bcf7f', icon: '✨', label: 'Inspiración' },
      inspiration: { color: '#6bcf7f', icon: '✨', label: 'Inspiración' },
      confianza:   { color: '#2dd4bf', icon: '🤝', label: 'Confianza' },
      trust:       { color: '#2dd4bf', icon: '🤝', label: 'Confianza' },
      entusiasmo:  { color: '#a78bfa', icon: '🔥', label: 'Entusiasmo' },
      enthusiasm:  { color: '#a78bfa', icon: '🔥', label: 'Entusiasmo' },
      confusión:   { color: '#fb923c', icon: '🤔', label: 'Confusión' },
      confusion:   { color: '#fb923c', icon: '🤔', label: 'Confusión' },
      ira:         { color: '#ef4444', icon: '😡', label: 'Ira' },
      anger:       { color: '#ef4444', icon: '😡', label: 'Ira' },
      tristeza:    { color: '#60a5fa', icon: '😢', label: 'Tristeza' },
      sadness:     { color: '#60a5fa', icon: '😢', label: 'Tristeza' },
      sorpresa:    { color: '#f472b6', icon: '😮', label: 'Sorpresa' },
      surprise:    { color: '#f472b6', icon: '😮', label: 'Sorpresa' },
      ironía:      { color: '#87868B', icon: '😏', label: 'Ironía' },
      irony:       { color: '#87868B', icon: '😏', label: 'Ironía' },
      neutral:     { color: '#555', icon: '😐', label: 'Neutral' },
    };

    const total   = emotions.reduce((s, e) => s + e.count, 0) || 1;
    const maxCount = Math.max(...emotions.map(e => e.count), 1);
    const top6    = emotions.slice(0, 6);

    return `
      <div class="mb-emotion-spectrum">
        <div class="mb-emotion-bars">
          ${top6.map(e => {
            const key = (e.emotion || '').toLowerCase();
            const cfg = emotionCfg[key] || { color: '#87868B', icon: '💬', label: e.emotion || key };
            const pct = Math.round((e.count / total) * 100);
            return `
              <div class="mb-emotion-item">
                <span class="mb-emotion-emoji">${cfg.icon}</span>
                <div class="mb-emotion-track">
                  <div class="mb-emotion-fill" style="width:${(e.count/maxCount*100).toFixed(0)}%;background:${cfg.color}"></div>
                </div>
                <div class="mb-emotion-meta">
                  <span class="mb-emotion-name">${cfg.label}</span>
                  <span class="mb-emotion-pct" style="color:${cfg.color}">${pct}%</span>
                </div>
              </div>`;
          }).join('')}
        </div>
        <div class="mb-emotion-donut">
          <canvas id="mbEmotionChart"></canvas>
        </div>
      </div>`;
  }

  // ── Strategic Actions ───────────────────────────────────────────────────────

  _buildStrategicActions(autoInsights, diagnostic, vera, kpis, contentTypes, narrative, roas) {
    const actions = [];
    const orgPath = window.currentOrgPath || '';
    const pathMap = {
      production: orgPath ? `${orgPath}/production` : '/production',
      dashboard:  orgPath ? `${orgPath}/dashboard`  : '/dashboard',
      brand:      orgPath ? `${orgPath}/brand`      : '/brands',
    };

    // 1. Auto-insights → acciones con contexto comercial
    autoInsights.forEach(ins => {
      const priorityMap = { success: 'info', warning: 'high', tip: 'medium' };
      const labelMap    = { success: 'OPORTUNIDAD', warning: 'ALERTA', tip: 'OPTIMIZACIÓN' };
      actions.push({
        priority: priorityMap[ins.type] || 'medium',
        icon:     ins.icon,
        label:    labelMap[ins.type] || 'ANÁLISIS',
        title:    ins.type === 'success' ? 'Rendimiento superior detectado' : ins.type === 'warning' ? 'Patrón de alerta' : 'Optimización disponible',
        text:     ins.text,
        impact:   null,
        cta:      null,
      });
    });

    // 2. ROAS orgánico
    if (roas) {
      actions.push({
        priority: 'info',
        icon:     'fa-coins',
        label:    'ROAS ORGÁNICO',
        title:    `Tu contenido orgánico equivale a ${roas.label} USD en paid media`,
        text:     `El reach orgánico de <strong>${this._fmt(roas.reach)}</strong> personas en ${this._period} tiene un valor de mercado de <strong style="color:#6bcf7f">${roas.label} USD</strong> en publicidad pagada (CPM base: $${roas.cpm}). Usa este dato para justificar inversión en contenido ante stakeholders.`,
        impact:   `${roas.label} USD en valor media`,
        cta:      null,
      });
    }

    // 3. ROI por formato
    if (contentTypes.length >= 2) {
      const sorted = [...contentTypes].sort((a, b) => b.avgEng - a.avgEng);
      const best = sorted[0], worst = sorted[sorted.length - 1];
      if (best.avgEng > worst.avgEng * 1.4) {
        const mult = Math.round((best.avgEng / Math.max(1, worst.avgEng)) * 10) / 10;
        actions.push({
          priority: 'high',
          icon:     'fa-bolt',
          label:    'ROI DE FORMATO',
          title:    `${best.label} genera ${mult}x más engagement — reasignar producción`,
          text:     `Tu formato <strong>${best.label}</strong> tiene un engagement promedio de <strong>${this._fmt(best.avgEng)}</strong> por post vs <strong>${this._fmt(worst.avgEng)}</strong> de ${worst.label.toLowerCase()}. Redistribuir el presupuesto de contenido hacia ${best.label} puede incrementar el engagement total sin aumentar la frecuencia de publicación.`,
          impact:   `+${Math.round((mult - 1) * 100)}% engagement proyectado`,
          cta:      { label: `Crear ${best.label}`, href: pathMap.production },
        });
      }
    }

    // 4. Score VERA bajo → acción específica por factor
    if (vera.score < 65 && vera.factors.length) {
      const weak    = vera.factors[vera.factors.length - 1];
      const gainPts = weak.max - weak.pts;
      actions.push({
        priority: vera.score < 45 ? 'critical' : 'medium',
        icon:     'fa-chart-line',
        label:    'SCORE VERA',
        title:    `Optimizar ${weak.label} puede sumar ${gainPts}pts al Score`,
        text:     `El factor <strong>${weak.label}</strong> está al ${weak.pct}% de su potencial máximo. Es el cuello de botella actual de tu Score VERA (${vera.score}/100). Mejorarlo puede colocar tu marca en la categoría <strong>${vera.score + gainPts >= 80 ? 'Excelente' : vera.score + gainPts >= 65 ? 'Bien' : 'En proceso'}</strong> en el próximo período.`,
        impact:   `+${gainPts} pts Score VERA`,
        cta:      null,
      });
    }

    // 5. Pilares narrativos huérfanos
    if (narrative?.pillars_orphan?.length > 0) {
      const orphan = narrative.pillars_orphan[0];
      actions.push({
        priority: 'medium',
        icon:     'fa-sitemap',
        label:    'NARRATIVA',
        title:    `Pilar inactivo: "${this._esc(orphan.pillar_name || orphan.name || '')}"`,
        text:     `Este pilar narrativo no registra publicaciones en el período analizado. Las marcas con pilares narrativos consistentes tienen un engagement 34% superior al promedio. Activar este pilar fortalece el reconocimiento y la coherencia de marca.`,
        impact:   null,
        cta:      { label: 'Activar este pilar', href: pathMap.production },
      });
    }

    // 6. Vulnerabilidades críticas
    const critVulns = diagnostic?.vulnerabilities?.filter(v => v.severity === 'high' || v.severity === 'critical') || [];
    critVulns.slice(0, 2).forEach(v => {
      actions.push({
        priority: 'critical',
        icon:     'fa-shield-alt',
        label:    'VULNERABILIDAD',
        title:    this._esc(v.title || 'Alerta de marca'),
        text:     this._esc(v.description || 'Requiere atención inmediata.'),
        impact:   'Riesgo de reputación',
        cta:      null,
      });
    });

    // 7. ER bajo
    const er = parseFloat(kpis.engRate);
    if (!isNaN(er) && er < 1 && kpis.reach > 0) {
      actions.push({
        priority: 'high',
        icon:     'fa-chart-bar',
        label:    'ENGAGEMENT RATE',
        title:    `ER del ${er}% — benchmark del sector: 3–5%`,
        text:     `Un ER del ${er}% indica que el contenido no está resonando con suficiente fuerza en tu audiencia. Publicar en la ventana óptima detectada y priorizar el formato de mayor ROI puede triplicar el engagement rate en las próximas 2 semanas sin incrementar el presupuesto.`,
        impact:   'Objetivo: superar 3% ER',
        cta:      null,
      });
    }

    if (!actions.length) {
      actions.push({
        priority: 'info',
        icon:     'fa-check-circle',
        label:    'ESTADO',
        title:    `Métricas dentro de parámetros óptimos`,
        text:     `Tu Score VERA de <strong>${vera.score}</strong> y la cadencia de publicación están en niveles saludables. Mantén la consistencia narrativa y continúa priorizando los formatos de mayor rendimiento para sostener el crecimiento.`,
        impact:   null,
        cta:      null,
      });
    }

    const priorityCfg = {
      critical: { border: '#ef4444', bg: 'rgba(239,68,68,0.06)',  labelColor: '#ef4444', iconColor: '#ef4444' },
      high:     { border: '#fb923c', bg: 'rgba(251,146,60,0.05)', labelColor: '#fb923c', iconColor: '#fb923c' },
      medium:   { border: '#60a5fa', bg: 'rgba(96,165,250,0.04)', labelColor: '#60a5fa', iconColor: '#60a5fa' },
      info:     { border: 'rgba(255,255,255,0.1)', bg: 'rgba(255,255,255,0.02)', labelColor: 'rgba(212,209,216,0.35)', iconColor: '#6bcf7f' },
    };

    return actions.slice(0, 6).map(a => {
      const cfg = priorityCfg[a.priority] || priorityCfg.info;
      return `
        <div class="mb-action-card" style="border-left-color:${cfg.border};background:${cfg.bg}">
          <div class="mb-action-top">
            <span class="mb-action-label" style="color:${cfg.labelColor}">${a.label}</span>
            ${a.impact ? `<span class="mb-action-impact">${a.impact}</span>` : ''}
          </div>
          <div class="mb-action-icon-wrap">
            <span class="mb-action-icon" style="color:${cfg.iconColor}"><i class="fas ${a.icon}"></i></span>
            <div class="mb-action-body">
              <div class="mb-action-title">${a.title}</div>
              <p class="mb-action-text">${a.text}</p>
              ${a.cta ? `<a href="${a.cta.href}" class="mb-action-cta">${a.cta.label} <i class="fas fa-arrow-right"></i></a>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ── KPI Row legacy (kept for compatibility) ────────────────────────────────

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

  _ensureChartJs() {
    if (window.Chart) return Promise.resolve();
    if (window.__chartJsLoadPromise) return window.__chartJsLoadPromise;
    window.__chartJsLoadPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      // SRI: si jsdelivr entrega bytes distintos a los firmados, el navegador rechaza
      // el script y Chart queda undefined — mejor sin gráficas que con código inyectado.
      s.integrity = 'sha384-e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g';
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
    return window.__chartJsLoadPromise;
  }

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
    const narrative  = insight?.dimensions?.B_narrative;
    const sentiment  = insight?.dimensions?.G_sentiment;
    const emotions   = narrative?.emotion_distribution || sentiment?.emotion_distribution || [];

    this._renderActivityChart(timeSeries);
    if (content.length) this._renderContentChart(content);
    if (tones.length)   this._renderToneChart(tones);
    if (emotions.length) this._renderEmotionChart(emotions);

    // Gráficos enriquecidos de API
    if (apiTS?.dates?.length > 1)          this._renderGrowthChart(apiTS);
    if (audience?.gender_groups)           this._renderAudienceGenderChart(audience.gender_groups);
    if (audience?.top_countries?.length)   this._renderAudienceCountriesChart(audience.top_countries);

    // Narrative pillars radar
    if (narrative?.pillars_active?.length) this._renderPillarsRadar(narrative.pillars_active);
  }

  _renderPillarsRadar(pillars) {
    const el = document.getElementById('mbPillarsRadarChart');
    if (!el || !pillars?.length) return;
    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    const labels = pillars.map(p => (typeof p === 'string' ? p : p.pillar_name || p.name || '?').slice(0, 15));
    const data = pillars.map(p => typeof p === 'object' ? (p.post_count || p.count || 1) : 1);
    const engData = pillars.map(p => typeof p === 'object' ? (p.avg_engagement || p.engagement || 0) : 0);
    this._chartInstances.pillarsRadar = new Chart(canvas, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          { label: 'Posts', data, backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#6366f1', borderWidth: 2, pointBackgroundColor: '#6366f1', pointRadius: 4 },
          ...(engData.some(v => v > 0) ? [{ label: 'Engagement', data: engData, backgroundColor: 'rgba(107,207,127,0.15)', borderColor: '#6bcf7f', borderWidth: 2, pointBackgroundColor: '#6bcf7f', pointRadius: 3 }] : [])
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { angleLines: { color: 'rgba(255,255,255,0.06)' }, grid: { color: 'rgba(255,255,255,0.06)' }, pointLabels: { color: 'rgba(212,209,216,0.65)', font: { size: 10 } }, ticks: { display: false } } },
        plugins: { legend: { labels: { color: 'rgba(212,209,216,0.6)', font: { size: 10 } } } }
      }
    });
  }

  _renderEmotionChart(emotions) {
    const el = document.getElementById('mbEmotionChart');
    if (!el) return;
    const emotionColors = {
      alegría: '#facc15', joy: '#facc15',
      inspiración: '#6bcf7f', inspiration: '#6bcf7f',
      confianza: '#2dd4bf', trust: '#2dd4bf',
      entusiasmo: '#a78bfa', enthusiasm: '#a78bfa',
      confusión: '#fb923c', confusion: '#fb923c',
      ira: '#ef4444', anger: '#ef4444',
      tristeza: '#60a5fa', sadness: '#60a5fa',
      sorpresa: '#f472b6', surprise: '#f472b6',
      ironía: '#87868B', irony: '#87868B',
      neutral: '#555',
    };
    const total  = emotions.reduce((s, e) => s + e.count, 0) || 1;
    const top6   = emotions.slice(0, 6);
    const labels = top6.map(e => e.emotion || '');
    const data   = top6.map(e => Math.round((e.count / total) * 100));
    const colors = labels.map(l => emotionColors[l.toLowerCase()] || '#87868B');

    this._chartInstances.emotion = new Chart(el, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: 'rgba(0,0,0,0.3)', borderWidth: 2, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
          tooltip: { backgroundColor: 'rgba(0,0,0,0.85)', padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } }
        }
      }
    });
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

  // ── Competence tab ─────────────────────────────────────────────────────────

  _competenceLoadingSkeleton() {
    return `<div class="sd-loading"><i class="fas fa-spinner fa-spin"></i> Cargando inteligencia competitiva…</div>`;
  }

  async _renderCompetence() {
    const body = document.getElementById('insightTabBody');
    if (!body) return;

    try {
      if (!this._supabase && window.supabaseService) {
        this._supabase = await window.supabaseService.getClient();
      } else if (!this._supabase && window.supabase) {
        this._supabase = window.supabase;
      }
    } catch (e) { console.error('[DashboardView] Supabase init competence:', e); }

    if (!this._supabase) {
      body.innerHTML = this._pageComingSoon('Competence', 'fa-chess', 'No se pudo conectar con la base de datos.');
      return;
    }

    const orgId = window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      window.currentOrgId;

    try {
      const [entitiesRes, competitorAdsRes, vulnerabilitiesRes, pricesRes, compPostsRes, signalsRes] = await Promise.allSettled([
        orgId ? this._supabase
          .from('intelligence_entities')
          .select('id, name, domain, target_identifier, is_active, metadata, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(30) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('competitor_ads')
          .select('id, platform, copy_text, creative_url, last_seen_at, first_seen_at, captured_at, estimated_spend_range, entity_id, intelligence_entities(name)')
          .eq('organization_id', orgId)
          .order('captured_at', { ascending: false })
          .limit(50) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('brand_vulnerabilities')
          .select('id, title, description, severity, status, created_at, metadata')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(20) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('retail_prices')
          .select('id, product_name, price, currency, retailer, stock_status, promo_label, captured_at, scope, entity_id')
          .eq('organization_id', orgId)
          .order('captured_at', { ascending: false })
          .limit(50) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('brand_posts')
          .select('id, content, metrics, sentiment, network, captured_at, entity_id, is_competitor, post_source')
          .eq('is_competitor', true)
          .order('captured_at', { ascending: false })
          .limit(30) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('intelligence_signals')
          .select('id, signal_type, content_text, content_numeric, ai_analysis, captured_at, entity_id')
          .order('captured_at', { ascending: false })
          .limit(30) : Promise.resolve({ data: [], error: null }),
      ]);

      const competitors     = (entitiesRes.status === 'fulfilled' && !entitiesRes.value.error) ? (entitiesRes.value.data || []) : [];
      const ads             = (competitorAdsRes.status === 'fulfilled' && !competitorAdsRes.value.error) ? (competitorAdsRes.value.data || []) : [];
      const vulnerabilities = (vulnerabilitiesRes.status === 'fulfilled' && !vulnerabilitiesRes.value.error) ? (vulnerabilitiesRes.value.data || []) : [];
      const prices          = (pricesRes.status === 'fulfilled' && !pricesRes.value.error) ? (pricesRes.value.data || []) : [];
      const compPosts       = (compPostsRes.status === 'fulfilled' && !compPostsRes.value.error) ? (compPostsRes.value.data || []) : [];
      const signals         = (signalsRes.status === 'fulfilled' && !signalsRes.value.error) ? (signalsRes.value.data || []) : [];

      body.innerHTML = this._renderCompetenceHtml(competitors, ads, vulnerabilities, prices, compPosts, signals);
      await this._ensureChartJs();
      this._renderCompetenceCharts(ads, prices, compPosts);
    } catch (e) {
      console.error('[DashboardView] renderCompetence:', e);
      body.innerHTML = this._pageComingSoon('Competence', 'fa-chess', 'Error cargando datos de competencia.');
    }
  }

  _renderCompetenceHtml(competitors, ads, vulnerabilities, prices, compPosts, signals) {
    const totalComps = competitors.length;
    const totalAds = ads.length;
    const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high').length;
    const ownPrices = prices.filter(p => p.scope === 'brand');
    const compPrices = prices.filter(p => p.scope !== 'brand');
    const outOfStock = compPrices.filter(p => p.stock_status === 'out_of_stock' || p.stock_status === 'unavailable');

    // Share of Voice
    const sovHtml = `
      <div class="sd-sov-header">
        <div class="sd-sov-icon"><i class="fas fa-chess-queen"></i></div>
        <div class="sd-sov-body">
          <div class="sd-sov-title">Infiltración Táctica</div>
          <div class="sd-sov-value">${totalComps} Competidor${totalComps !== 1 ? 'es' : ''} Monitoreados</div>
          <div class="sd-sov-sub">Inteligencia competitiva en tiempo real</div>
        </div>
        <div class="sd-sov-kpis">
          <div class="sd-sov-kpi">
            <div class="sd-sov-kpi-value">${totalAds}</div>
            <div class="sd-sov-kpi-label">Ads activos</div>
          </div>
          <div class="sd-sov-kpi">
            <div class="sd-sov-kpi-value" style="color:${criticalVulns > 0 ? '#f87171' : '#4ade80'}">${criticalVulns}</div>
            <div class="sd-sov-kpi-label">Vulns críticas</div>
          </div>
          <div class="sd-sov-kpi">
            <div class="sd-sov-kpi-value" style="color:${outOfStock.length > 0 ? '#fbbf24' : '#4ade80'}">${outOfStock.length}</div>
            <div class="sd-sov-kpi-label">Sin stock rival</div>
          </div>
        </div>
      </div>`;

    // A. The Price War
    const priceRows = prices.length
      ? prices.slice(0, 15).map(p => {
          const isOwn = p.scope === 'brand';
          const stockClass = (p.stock_status === 'in_stock' || p.stock_status === 'available') ? 'sd-status--active' : (p.stock_status === 'out_of_stock' || p.stock_status === 'unavailable') ? 'sd-severity--critical' : 'sd-status--pending';
          return `<tr>
            <td>${this._esc(p.product_name || '—')}</td>
            <td>${this._esc(p.retailer || '—')}</td>
            <td><strong>${p.price != null ? `${Number(p.price).toLocaleString()} ${p.currency || 'USD'}` : '—'}</strong></td>
            <td><span class="${stockClass}">${this._esc(p.stock_status || '—')}</span></td>
            <td>${p.promo_label ? `<span class="sd-widget-badge sd-widget-badge--orange">${this._esc(p.promo_label)}</span>` : '—'}</td>
            <td><span class="sd-widget-badge ${isOwn ? 'sd-widget-badge--blue' : 'sd-widget-badge--purple'}">${isOwn ? 'Propia' : 'Rival'}</span></td>
            <td>${p.captured_at ? new Date(p.captured_at).toLocaleDateString('es-ES') : '—'}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="7" class="sd-table-empty">Sin datos de precios. Configura sensores de retail para rastrear precios.</td></tr>`;

    const priceWarHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--orange"><i class="fas fa-dollar-sign"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">The Price War</div>
            <div class="sd-dim-subtitle">Inteligencia de precios cross-platform · SKU vs SKU</div>
          </div>
        </div>
        <div class="sd-dim-body sd-dim-body--stack">
          ${prices.length ? `<div class="sd-widget sd-widget--full"><div class="sd-widget-header"><span class="sd-widget-title">Comparativa de Precios por Retailer</span></div><div class="sd-chart-wrap" id="compPriceChart"></div></div>` : ''}
          <div class="sd-widget sd-widget--full">
            <div class="sd-widget-header">
              <span class="sd-widget-title">Monitor de Precios</span>
              <span class="sd-widget-badge sd-widget-badge--blue">${prices.length} registros</span>
            </div>
            <div class="sd-table-wrap">
              <table class="sd-table">
                <thead><tr><th>Producto</th><th>Retailer</th><th>Precio</th><th>Stock</th><th>Promo</th><th>Origen</th><th>Capturado</th></tr></thead>
                <tbody>${priceRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;

    // B. The Content Battle
    const compPostCards = compPosts.length
      ? compPosts.slice(0, 6).map(p => {
          const m = p.metrics && typeof p.metrics === 'object' ? p.metrics : {};
          const likes = m.likes || m.like_count || 0;
          const comments = m.comments || m.comment_count || 0;
          const shares = m.shares || m.share_count || 0;
          const eng = likes + comments + shares;
          const text = (p.content || '').slice(0, 100);
          return `<div class="sd-trend-card">
            <div class="sd-trend-header">
              <span class="sd-trend-keyword">${this._esc(p.network || '—')}</span>
              <span class="sd-trend-source">${eng.toLocaleString()} eng</span>
            </div>
            <p style="font-size:0.82rem;color:var(--text-secondary);margin:0 0 0.4rem;line-height:1.45">${this._esc(text)}${text.length >= 100 ? '…' : ''}</p>
            <div class="sd-trend-meta">
              <span><i class="fas fa-heart" style="color:#f472b6"></i> ${likes.toLocaleString()}</span>
              <span><i class="fas fa-comment" style="color:#60a5fa"></i> ${comments.toLocaleString()}</span>
              <span><i class="fas fa-share" style="color:#4ade80"></i> ${shares.toLocaleString()}</span>
              ${p.captured_at ? `<span>${new Date(p.captured_at).toLocaleDateString('es-ES')}</span>` : ''}
            </div>
          </div>`;
        }).join('')
      : `<div class="sd-empty"><i class="fas fa-eye-slash"></i><p class="sd-empty-title">Sin posts de competencia</p><p class="sd-empty-desc">Configura entidades de inteligencia para monitorear el contenido de tus rivales.</p></div>`;

    const contentBattleHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--blue"><i class="fas fa-swords"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">The Content Battle</div>
            <div class="sd-dim-subtitle">Análisis de narrativa y desempeño del rival</div>
          </div>
        </div>
        <div class="sd-dim-body sd-dim-body--stack">
          ${compPosts.length ? `<div class="sd-widget sd-widget--full"><div class="sd-widget-header"><span class="sd-widget-title">Engagement del rival por red</span></div><div class="sd-chart-wrap" id="compEngChart"></div></div>` : ''}
          <div class="sd-trends-grid">${compPostCards}</div>
        </div>
      </div>`;

    // C. The Attack Surface
    const vulnRows = vulnerabilities.length
      ? vulnerabilities.map(v => {
          const sevClass = `sd-severity--${v.severity || 'medium'}`;
          const statusClass = `sd-status--${v.status || 'open'}`;
          return `<tr>
            <td style="font-weight:600">${this._esc(v.title || '—')}</td>
            <td><span class="${sevClass}">${this._esc(v.severity || '—')}</span></td>
            <td><span class="${statusClass}">${this._esc(v.status || '—')}</span></td>
            <td style="font-size:0.78rem;color:var(--text-secondary);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc((v.description || '').slice(0, 100))}</td>
            <td>${v.created_at ? new Date(v.created_at).toLocaleDateString('es-ES') : '—'}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="5" class="sd-table-empty">Sin vulnerabilidades detectadas. El agente las creará al encontrar debilidades del rival.</td></tr>`;

    const negSignals = signals.filter(s => s.signal_type === 'review_negative' || s.signal_type === 'complaint' || s.signal_type === 'crisis');
    const negSignalRows = negSignals.length
      ? negSignals.slice(0, 8).map(s => `<tr>
          <td><span class="sd-severity--high">${this._esc(s.signal_type)}</span></td>
          <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc((s.content_text || '').slice(0, 120))}</td>
          <td>${s.captured_at ? new Date(s.captured_at).toLocaleDateString('es-ES') : '—'}</td>
        </tr>`).join('')
      : '';

    const attackSurfaceHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--red"><i class="fas fa-crosshairs"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">The Attack Surface</div>
            <div class="sd-dim-subtitle">Vulnerabilidades del rival y oportunidades de ataque</div>
          </div>
        </div>
        ${criticalVulns > 0 ? `<div class="sd-alerts"><div class="sd-alert sd-alert--danger"><i class="fas fa-exclamation-triangle"></i> ${criticalVulns} vulnerabilidad${criticalVulns > 1 ? 'es' : ''} de alto impacto detectada${criticalVulns > 1 ? 's' : ''}. Momento de contraatacar.</div></div>` : ''}
        <div class="sd-dim-body sd-dim-body--stack">
          <div class="sd-widget sd-widget--full">
            <div class="sd-widget-header">
              <span class="sd-widget-title">Vulnerabilidades Detectadas</span>
              <span class="sd-widget-badge ${criticalVulns > 0 ? 'sd-widget-badge--red' : 'sd-widget-badge--green'}">${vulnerabilities.length}</span>
            </div>
            <div class="sd-table-wrap">
              <table class="sd-table">
                <thead><tr><th>Título</th><th>Severidad</th><th>Estado</th><th>Descripción</th><th>Detectada</th></tr></thead>
                <tbody>${vulnRows}</tbody>
              </table>
            </div>
          </div>
          ${negSignalRows ? `<div class="sd-widget sd-widget--full">
            <div class="sd-widget-header">
              <span class="sd-widget-title">Señales Negativas del Rival</span>
              <span class="sd-widget-badge sd-widget-badge--orange">${negSignals.length}</span>
            </div>
            <div class="sd-table-wrap">
              <table class="sd-table">
                <thead><tr><th>Tipo</th><th>Señal</th><th>Detectada</th></tr></thead>
                <tbody>${negSignalRows}</tbody>
              </table>
            </div>
          </div>` : ''}
        </div>
      </div>`;

    // D. Ad Intelligence
    const adRows = ads.length
      ? ads.slice(0, 15).map(a => {
          const ent = a.intelligence_entities;
          const entName = ent && typeof ent === 'object' && !Array.isArray(ent) ? ent.name : (Array.isArray(ent) ? ent[0]?.name : null);
          const copy = a.copy_text || '';
          const spend = a.estimated_spend_range && typeof a.estimated_spend_range === 'object' ? a.estimated_spend_range : null;
          const spendStr = spend ? `${spend.min || '?'}–${spend.max || '?'} ${spend.currency || 'USD'}` : '—';
          const when = a.last_seen_at || a.captured_at;
          const daysSeen = a.first_seen_at && a.last_seen_at
            ? Math.max(1, Math.ceil((new Date(a.last_seen_at) - new Date(a.first_seen_at)) / 86400000))
            : null;
          return `<tr>
            <td style="font-weight:600">${this._esc(entName || '—')}</td>
            <td><span class="sd-widget-badge sd-widget-badge--purple">${this._esc(a.platform || '—')}</span></td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc(copy.slice(0, 100))}</td>
            <td>${spendStr}</td>
            <td>${daysSeen ? `${daysSeen}d` : '—'}</td>
            <td>${a.creative_url ? `<a href="${this._esc(a.creative_url)}" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none"><i class="fas fa-external-link-alt"></i></a>` : '—'}</td>
            <td>${when ? new Date(when).toLocaleDateString('es-ES') : '—'}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="7" class="sd-table-empty">Sin anuncios detectados. El agente los capturará al encontrar campañas activas del rival.</td></tr>`;

    const adIntelHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--purple"><i class="fas fa-bullhorn"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Ad Intelligence</div>
            <div class="sd-dim-subtitle">Inversión publicitaria y estrategia de pauta del rival</div>
          </div>
        </div>
        <div class="sd-dim-body sd-dim-body--stack">
          ${ads.length ? `<div class="sd-dim-row">
            <div class="sd-widget"><div class="sd-widget-header"><span class="sd-widget-title">Distribución por Plataforma</span></div><div class="sd-chart-wrap sd-chart-wrap--sm" id="compAdsPlatformChart"></div></div>
            <div class="sd-widget"><div class="sd-widget-header"><span class="sd-widget-title">Actividad Temporal</span></div><div class="sd-chart-wrap sd-chart-wrap--sm" id="compAdsTimelineChart"></div></div>
          </div>` : ''}
          <div class="sd-widget sd-widget--full">
            <div class="sd-widget-header">
              <span class="sd-widget-title">Radar de Pauta Digital</span>
              <span class="sd-widget-badge sd-widget-badge--purple">${ads.length} ads</span>
            </div>
            <div class="sd-table-wrap">
              <table class="sd-table">
                <thead><tr><th>Entidad</th><th>Plataforma</th><th>Copy</th><th>Inversión Est.</th><th>Duración</th><th>Creative</th><th>Visto</th></tr></thead>
                <tbody>${adRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;

    // Competitors table
    const competitorRows = competitors.length
      ? competitors.map(c => {
          const meta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
          const followers = meta.followers_count != null ? Number(meta.followers_count).toLocaleString() : '—';
          const engagement = meta.engagement_rate != null ? (Number(meta.engagement_rate) * 100).toFixed(2) + '%' : '—';
          const source = c.domain || meta.source || '—';
          const lastAt = meta.last_analyzed_at || c.created_at;
          const activeClass = c.is_active ? 'sd-status--active' : 'sd-status--paused';
          return `<tr>
            <td style="font-weight:600">${this._esc(c.name)}</td>
            <td><span class="sd-widget-badge sd-widget-badge--blue">${this._esc(source)}</span></td>
            <td>${this._esc(c.target_identifier || '—')}</td>
            <td>${followers}</td>
            <td>${engagement}</td>
            <td><span class="${activeClass}">${c.is_active ? 'activo' : 'pausado'}</span></td>
            <td>${lastAt ? new Date(lastAt).toLocaleDateString('es-ES') : '—'}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="7" class="sd-table-empty">Sin competidores registrados. Agrega entidades de inteligencia para monitorearlos.</td></tr>`;

    const competitorsSection = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--indigo"><i class="fas fa-binoculars"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Entidades Monitoreadas</div>
            <div class="sd-dim-subtitle">Perfiles, tiendas y fuentes bajo vigilancia</div>
          </div>
        </div>
        <div class="sd-widget sd-widget--full">
          <div class="sd-table-wrap">
            <table class="sd-table">
              <thead><tr><th>Nombre</th><th>Dominio</th><th>Identificador</th><th>Seguidores</th><th>Engagement</th><th>Estado</th><th>Último análisis</th></tr></thead>
              <tbody>${competitorRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    return `<div class="sd-dashboard">${sovHtml}${priceWarHtml}${contentBattleHtml}${attackSurfaceHtml}${adIntelHtml}${competitorsSection}</div>`;
  }

  _renderCompetenceCharts(ads, prices, compPosts) {
    if (typeof Chart === 'undefined') return;

    const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'rgba(212,209,216,0.6)', font: { size: 11 } } } }, scales: { x: { ticks: { color: 'rgba(212,209,216,0.4)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: 'rgba(212,209,216,0.4)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } };

    // Price comparison chart
    if (prices.length) {
      const el = document.getElementById('compPriceChart');
      if (el) {
        const byRetailer = {};
        prices.forEach(p => {
          if (!p.retailer || p.price == null) return;
          if (!byRetailer[p.retailer]) byRetailer[p.retailer] = { own: [], comp: [] };
          (p.scope === 'brand' ? byRetailer[p.retailer].own : byRetailer[p.retailer].comp).push(Number(p.price));
        });
        const labels = Object.keys(byRetailer).slice(0, 8);
        const ownAvg = labels.map(r => { const arr = byRetailer[r].own; return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; });
        const compAvg = labels.map(r => { const arr = byRetailer[r].comp; return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; });
        if (labels.length) {
          const canvas = document.createElement('canvas');
          el.appendChild(canvas);
          this._chartInstances.compPrice = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [
              { label: 'Tu marca', data: ownAvg, backgroundColor: 'rgba(96,165,250,0.7)', borderRadius: 4 },
              { label: 'Competencia', data: compAvg, backgroundColor: 'rgba(248,113,113,0.7)', borderRadius: 4 }
            ] },
            options: { ...chartOpts, plugins: { ...chartOpts.plugins, title: { display: false } } }
          });
        }
      }
    }

    // Competitor posts engagement by network
    if (compPosts.length) {
      const el = document.getElementById('compEngChart');
      if (el) {
        const byNet = {};
        compPosts.forEach(p => {
          const net = p.network || 'other';
          const m = p.metrics && typeof p.metrics === 'object' ? p.metrics : {};
          const eng = (m.likes || m.like_count || 0) + (m.comments || m.comment_count || 0) + (m.shares || m.share_count || 0);
          if (!byNet[net]) byNet[net] = { total: 0, count: 0 };
          byNet[net].total += eng;
          byNet[net].count += 1;
        });
        const labels = Object.keys(byNet);
        const avgs = labels.map(n => Math.round(byNet[n].total / byNet[n].count));
        const colors = labels.map(n => n === 'instagram' ? 'rgba(225,48,108,0.7)' : n === 'facebook' ? 'rgba(24,119,242,0.7)' : n === 'tiktok' ? 'rgba(255,255,255,0.7)' : n === 'youtube' ? 'rgba(255,0,0,0.7)' : 'rgba(167,139,250,0.7)');
        const canvas = document.createElement('canvas');
        el.appendChild(canvas);
        this._chartInstances.compEng = new Chart(canvas, {
          type: 'bar',
          data: { labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)), datasets: [{ label: 'Engagement promedio', data: avgs, backgroundColor: colors, borderRadius: 4 }] },
          options: { ...chartOpts, indexAxis: 'y', plugins: { ...chartOpts.plugins, legend: { display: false } } }
        });
      }
    }

    // Ads platform distribution (doughnut)
    if (ads.length) {
      const el = document.getElementById('compAdsPlatformChart');
      if (el) {
        const byPlatform = {};
        ads.forEach(a => { const p = a.platform || 'other'; byPlatform[p] = (byPlatform[p] || 0) + 1; });
        const labels = Object.keys(byPlatform);
        const data = labels.map(l => byPlatform[l]);
        const bgColors = ['rgba(96,165,250,0.8)', 'rgba(192,132,252,0.8)', 'rgba(251,146,60,0.8)', 'rgba(244,114,182,0.8)', 'rgba(45,212,191,0.8)', 'rgba(163,163,163,0.8)'];
        const canvas = document.createElement('canvas');
        el.appendChild(canvas);
        this._chartInstances.compAdsPlatform = new Chart(canvas, {
          type: 'doughnut',
          data: { labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)), datasets: [{ data, backgroundColor: bgColors.slice(0, labels.length), borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { color: 'rgba(212,209,216,0.6)', font: { size: 11 }, padding: 12 } } } }
        });
      }
    }

    // Ads timeline (line chart by month)
    if (ads.length) {
      const el = document.getElementById('compAdsTimelineChart');
      if (el) {
        const byMonth = {};
        ads.forEach(a => {
          const d = a.captured_at || a.first_seen_at;
          if (!d) return;
          const key = d.slice(0, 7);
          byMonth[key] = (byMonth[key] || 0) + 1;
        });
        const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
        const canvas = document.createElement('canvas');
        el.appendChild(canvas);
        this._chartInstances.compAdsTimeline = new Chart(canvas, {
          type: 'line',
          data: { labels: sorted.map(([k]) => k), datasets: [{ label: 'Ads detectados', data: sorted.map(([, v]) => v), borderColor: '#c084fc', backgroundColor: 'rgba(192,132,252,0.1)', fill: true, tension: 0.3, pointRadius: 3 }] },
          options: { ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: false } } }
        });
      }
    }
  }

  // ── Strategy (Centro de Comando) ──────────────────────────────────────────

  _monitoringLoadingSkeleton() {
    return `<div class="sd-loading"><i class="fas fa-spinner fa-spin"></i> Cargando centro de comando…</div>`;
  }

  async _renderMonitoring() {
    const body = document.getElementById('insightTabBody');
    if (!body) return;

    try {
      if (!this._supabase && window.supabaseService) {
        this._supabase = await window.supabaseService.getClient();
      } else if (!this._supabase && window.supabase) {
        this._supabase = window.supabase;
      }
    } catch (e) { console.error('[DashboardView] Supabase init strategy:', e); }

    if (!this._supabase) {
      body.innerHTML = this._pageComingSoon('Strategy', 'fa-route', 'No se pudo conectar con la base de datos.');
      return;
    }

    const orgId = window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      window.currentOrgId;

    try {
      const [triggersRes, missionsRes, missionRunsRes, sensorRunsRes, vulnsRes] = await Promise.allSettled([
        orgId ? this._supabase
          .from('monitoring_triggers')
          .select('id, sensor_type, status, config, cadence, cadence_value, priority, next_run_at, last_run_at, last_run_status, created_at, brand_container_id')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('body_missions')
          .select('id, mission_type, status, action_payload, result_reference, created_at, updated_at, brand_container_id')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(20) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('mission_runs')
          .select('id, mission_id, status, trigger_type, started_at, completed_at, duration_ms, result, error_message, tokens_used, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(30) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('sensor_runs')
          .select('id, trigger_id, sensor_type, status, started_at, finished_at, duration_ms, error_message, stats, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(30) : Promise.resolve({ data: [], error: null }),
        orgId ? this._supabase
          .from('brand_vulnerabilities')
          .select('id, title, severity, status')
          .eq('organization_id', orgId)
          .eq('status', 'open')
          .limit(10) : Promise.resolve({ data: [], error: null }),
      ]);

      const triggers = (triggersRes.status === 'fulfilled' && !triggersRes.value.error) ? (triggersRes.value.data || []) : [];
      const missions = (missionsRes.status === 'fulfilled' && !missionsRes.value.error) ? (missionsRes.value.data || []) : [];
      const missionRuns = (missionRunsRes.status === 'fulfilled' && !missionRunsRes.value.error) ? (missionRunsRes.value.data || []) : [];
      const sensorRuns = (sensorRunsRes.status === 'fulfilled' && !sensorRunsRes.value.error) ? (sensorRunsRes.value.data || []) : [];
      const openVulns = (vulnsRes.status === 'fulfilled' && !vulnsRes.value.error) ? (vulnsRes.value.data || []) : [];

      body.innerHTML = this._renderStrategyHtml(triggers, missions, missionRuns, sensorRuns, openVulns, orgId);
      this._bindStrategyEvents(triggers, orgId);
    } catch (e) {
      console.error('[DashboardView] renderStrategy:', e);
      body.innerHTML = this._pageComingSoon('Strategy', 'fa-route', 'Error cargando centro de comando.');
    }
  }

  _renderStrategyHtml(triggers, missions, missionRuns, sensorRuns, openVulns, orgId) {
    const activeTriggers = triggers.filter(t => t.status === 'active').length;
    const activeMissions = missions.filter(m => m.status === 'running' || m.status === 'pending').length;
    const completedMissions = missions.filter(m => m.status === 'completed').length;
    const failedRuns = missionRuns.filter(r => r.status === 'failed').length;
    const totalTokens = missionRuns.reduce((sum, r) => sum + (r.tokens_used || 0), 0);
    const successSensorRuns = sensorRuns.filter(r => r.status === 'success').length;
    const failedSensorRuns = sensorRuns.filter(r => r.status === 'failed').length;

    // Health scores (simplified calculation)
    const brandHealth = Math.max(0, Math.min(100, 100 - (openVulns.filter(v => v.severity === 'critical').length * 25) - (openVulns.filter(v => v.severity === 'high').length * 10)));
    const opsHealth = sensorRuns.length ? Math.round((successSensorRuns / sensorRuns.length) * 100) : 100;
    const missionHealth = missionRuns.length ? Math.round(((missionRuns.length - failedRuns) / missionRuns.length) * 100) : 100;
    const healthColor = (v) => v >= 75 ? '#4ade80' : v >= 50 ? '#fbbf24' : '#f87171';

    // SOV header
    const sovHtml = `
      <div class="sd-sov-header">
        <div class="sd-sov-icon"><i class="fas fa-chess-king"></i></div>
        <div class="sd-sov-body">
          <div class="sd-sov-title">Centro de Comando Estratégico</div>
          <div class="sd-sov-value">${activeMissions} Misión${activeMissions !== 1 ? 'es' : ''} Activa${activeMissions !== 1 ? 's' : ''}</div>
          <div class="sd-sov-sub">${activeTriggers} sensores activos · ${totalTokens.toLocaleString()} tokens consumidos</div>
        </div>
        <div class="sd-sov-kpis">
          <div class="sd-sov-kpi"><div class="sd-sov-kpi-value" style="color:#4ade80">${completedMissions}</div><div class="sd-sov-kpi-label">Completadas</div></div>
          <div class="sd-sov-kpi"><div class="sd-sov-kpi-value" style="color:${failedRuns ? '#f87171' : '#4ade80'}">${failedRuns}</div><div class="sd-sov-kpi-label">Fallidas</div></div>
          <div class="sd-sov-kpi"><div class="sd-sov-kpi-value">${openVulns.length}</div><div class="sd-sov-kpi-label">Alertas abiertas</div></div>
        </div>
      </div>`;

    // D. Health Score
    const healthHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--green"><i class="fas fa-heartbeat"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Salud Organizacional</div>
            <div class="sd-dim-subtitle">Score agregado de marca, operaciones y misiones</div>
          </div>
        </div>
        <div class="sd-health-grid">
          <div class="sd-health-card">
            <div class="sd-health-score" style="color:${healthColor(brandHealth)}">${brandHealth}</div>
            <div class="sd-health-label">Marca</div>
            <div class="sd-health-bar"><div class="sd-health-fill" style="width:${brandHealth}%;background:${healthColor(brandHealth)}"></div></div>
          </div>
          <div class="sd-health-card">
            <div class="sd-health-score" style="color:${healthColor(opsHealth)}">${opsHealth}</div>
            <div class="sd-health-label">Operaciones</div>
            <div class="sd-health-bar"><div class="sd-health-fill" style="width:${opsHealth}%;background:${healthColor(opsHealth)}"></div></div>
          </div>
          <div class="sd-health-card">
            <div class="sd-health-score" style="color:${healthColor(missionHealth)}">${missionHealth}</div>
            <div class="sd-health-label">Misiones</div>
            <div class="sd-health-bar"><div class="sd-health-fill" style="width:${missionHealth}%;background:${healthColor(missionHealth)}"></div></div>
          </div>
        </div>
      </div>`;

    // A. Active Missions
    const missionCards = missions.length
      ? missions.slice(0, 8).map(m => {
          const statusCls = `sd-mission-card--${m.status || 'pending'}`;
          const statusBadge = `sd-status--${m.status || 'pending'}`;
          const payload = m.action_payload && typeof m.action_payload === 'object' ? m.action_payload : {};
          const result = m.result_reference && typeof m.result_reference === 'object' ? m.result_reference : {};
          const runs = missionRuns.filter(r => r.mission_id === m.id);
          const lastRun = runs[0];
          return `<div class="sd-mission-card ${statusCls}">
            <div class="sd-mission-top">
              <span class="sd-mission-type">${this._esc(m.mission_type || '—')}</span>
              <span class="${statusBadge}">${this._esc(m.status || '—')}</span>
            </div>
            <div class="sd-mission-body">
              <div class="sd-mission-title">${this._esc(payload.title || payload.description || m.mission_type || 'Misión')}</div>
              ${result.summary ? `<div class="sd-mission-desc">${this._esc(result.summary.slice(0, 120))}</div>` : ''}
            </div>
            <div class="sd-mission-footer">
              ${lastRun?.duration_ms ? `<span><i class="fas fa-clock"></i> ${(lastRun.duration_ms / 1000).toFixed(1)}s</span>` : ''}
              ${lastRun?.tokens_used ? `<span><i class="fas fa-coins"></i> ${lastRun.tokens_used} tokens</span>` : ''}
              <span>${m.created_at ? new Date(m.created_at).toLocaleDateString('es-ES') : ''}</span>
            </div>
          </div>`;
        }).join('')
      : `<div class="sd-empty"><i class="fas fa-rocket"></i><p class="sd-empty-title">Sin misiones registradas</p><p class="sd-empty-desc">El agente creará misiones al detectar señales que requieren acción.</p></div>`;

    const missionsHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--purple"><i class="fas fa-rocket"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Misiones Activas</div>
            <div class="sd-dim-subtitle">Acciones autónomas ejecutadas por el agente</div>
          </div>
        </div>
        <div class="sd-missions-grid">${missionCards}</div>
      </div>`;

    // B. Sensors & Triggers (enhanced)
    const triggerRows = triggers.length
      ? triggers.map(t => {
          const statusCls = `sd-status--${t.status || 'paused'}`;
          const cfg = t.config && typeof t.config === 'object' ? t.config : {};
          const label = cfg.label || cfg.name || t.sensor_type || '—';
          const kw = Array.isArray(cfg.keywords) ? cfg.keywords : (typeof cfg.keywords === 'string' ? cfg.keywords.split(/\s+/) : []);
          const keywords = kw.filter(Boolean).slice(0, 4);
          const triggerSensorRuns = sensorRuns.filter(r => r.trigger_id === t.id);
          const successCount = triggerSensorRuns.filter(r => r.status === 'success').length;
          const failCount = triggerSensorRuns.filter(r => r.status === 'failed').length;
          const lastRunStatus = t.last_run_status || (triggerSensorRuns[0]?.status) || '—';
          return `<tr>
            <td style="font-weight:600">${this._esc(label)}</td>
            <td><span class="sd-widget-badge sd-widget-badge--blue">${this._esc(t.sensor_type || '—')}</span></td>
            <td>${keywords.length ? keywords.map(k => `<span class="sd-trend-kw">${this._esc(String(k))}</span>`).join(' ') : '—'}</td>
            <td><span class="${statusCls}">${this._esc(t.status || '—')}</span></td>
            <td style="font-size:0.78rem"><span style="color:#4ade80">${successCount}</span> / <span style="color:#f87171">${failCount}</span></td>
            <td>${t.last_run_at ? new Date(t.last_run_at).toLocaleDateString('es-ES') : '—'}</td>
            <td>
              <div style="display:flex;gap:0.35rem">
                <button type="button" class="btn btn-ghost btn-sm insight-trigger-toggle" data-trigger-id="${t.id}" data-status="${t.status}" title="${t.status === 'active' ? 'Pausar' : 'Activar'}">
                  <i class="fas ${t.status === 'active' ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                <button type="button" class="btn btn-ghost btn-sm insight-trigger-delete" data-trigger-id="${t.id}" title="Eliminar">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="7" class="sd-table-empty">Sin monitores activos. Crea uno para vigilar señales.</td></tr>`;

    const sensorsHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--cyan"><i class="fas fa-satellite"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Sensores y Triggers</div>
            <div class="sd-dim-subtitle">Monitores activos con estadísticas de ejecución</div>
          </div>
          ${orgId ? `<button type="button" class="btn btn-primary btn-sm" id="addTriggerBtn" style="margin-left:auto"><i class="fas fa-plus"></i> Nuevo Monitor</button>` : ''}
        </div>
        <div class="sd-widget sd-widget--full">
          <div class="sd-table-wrap">
            <table class="sd-table">
              <thead><tr><th>Nombre</th><th>Tipo</th><th>Keywords</th><th>Estado</th><th>Éxitos/Fallos</th><th>Último run</th><th>Acciones</th></tr></thead>
              <tbody id="triggersTableBody">${triggerRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    // C. Recent Mission Runs timeline
    const runRows = missionRuns.length
      ? missionRuns.slice(0, 10).map(r => {
          const statusCls = `sd-status--${r.status || 'pending'}`;
          return `<tr>
            <td><span class="${statusCls}">${this._esc(r.status || '—')}</span></td>
            <td>${this._esc(r.trigger_type || '—')}</td>
            <td>${r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
            <td>${r.tokens_used || '—'}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem;color:${r.error_message ? '#f87171' : 'var(--text-secondary)'}">${this._esc(r.error_message || (r.result?.summary || '').slice(0, 80) || '—')}</td>
            <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('es-ES') : '—'}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="6" class="sd-table-empty">Sin ejecuciones de misiones registradas.</td></tr>`;

    const runsHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--orange"><i class="fas fa-history"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Timeline de Ejecuciones</div>
            <div class="sd-dim-subtitle">Historial reciente de misiones y resultados</div>
          </div>
        </div>
        <div class="sd-widget sd-widget--full">
          <div class="sd-table-wrap">
            <table class="sd-table">
              <thead><tr><th>Estado</th><th>Trigger</th><th>Duración</th><th>Tokens</th><th>Resultado / Error</th><th>Fecha</th></tr></thead>
              <tbody>${runRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    return `<div class="sd-dashboard">${sovHtml}${healthHtml}${missionsHtml}${sensorsHtml}${runsHtml}</div>`;
  }

  _bindStrategyEvents(triggers, orgId) {
    document.getElementById('addTriggerBtn')?.addEventListener('click', () => this._openAddTriggerModal(orgId));

    document.querySelectorAll('.insight-trigger-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-trigger-id');
        const currentStatus = btn.getAttribute('data-status');
        const newStatus = currentStatus === 'active' ? 'paused' : 'active';
        if (!this._supabase || !id) return;
        await this._supabase.from('monitoring_triggers').update({ status: newStatus }).eq('id', id);
        this._renderMonitoring();
      });
    });

    document.querySelectorAll('.insight-trigger-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-trigger-id');
        if (!confirm('¿Eliminar este monitor?') || !this._supabase || !id) return;
        await this._supabase.from('monitoring_triggers').delete().eq('id', id);
        this._renderMonitoring();
      });
    });
  }

  _openAddTriggerModal(orgId) {
    document.getElementById('insightTriggerModal')?.remove();
    const TRIGGER_TYPES = ['keyword', 'mention', 'hashtag', 'competitor', 'sentiment', 'trend', 'price', 'stock'];
    const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'facebook', 'youtube', 'web', 'amazon', 'mercadolibre'];
    const typeOpts = TRIGGER_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

    const modalHtml = `
      <div class="modal-overlay" id="insightTriggerModal">
        <div class="modal">
          <div class="modal-header"><h3>Nuevo Monitor</h3><button type="button" class="modal-close" id="triggerModalClose"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="form-group"><label for="trg_name">Nombre <span class="form-required">*</span></label><input type="text" id="trg_name" class="form-input" placeholder="Ej: Menciones de marca" required></div>
            <div class="form-group"><label for="trg_type">Tipo</label><select id="trg_type" class="form-input">${typeOpts}</select></div>
            <div class="form-group"><label for="trg_keywords">Keywords (uno por línea)</label><textarea id="trg_keywords" class="form-input" rows="3" placeholder="Palabra clave 1\nPalabra clave 2"></textarea></div>
            <div class="form-group"><label>Plataformas</label><div class="insight-platforms-checkboxes">${PLATFORMS.map(p => `<label class="insight-platform-check"><input type="checkbox" name="trg_platform" value="${p}"> ${p}</label>`).join('')}</div></div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-ghost" id="triggerModalCancel">Cancelar</button><button type="button" class="btn btn-primary" id="triggerModalSubmit">Crear</button></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('triggerModalClose')?.addEventListener('click', () => document.getElementById('insightTriggerModal')?.remove());
    document.getElementById('triggerModalCancel')?.addEventListener('click', () => document.getElementById('insightTriggerModal')?.remove());
    document.getElementById('triggerModalSubmit')?.addEventListener('click', async () => {
      const name = document.getElementById('trg_name')?.value?.trim();
      if (!name) { alert('El nombre es obligatorio.'); return; }
      const keywords = (document.getElementById('trg_keywords')?.value || '')
        .split(/\n/).map(s => s.trim()).filter(Boolean);
      const platforms = [...document.querySelectorAll('input[name="trg_platform"]:checked')].map(el => el.value);
      const sensorType = document.getElementById('trg_type')?.value || 'keyword';
      const { data: bcRow, error: bcErr } = await this._supabase
        .from('brand_containers')
        .select('id')
        .eq('organization_id', orgId)
        .limit(1)
        .maybeSingle();
      if (bcErr || !bcRow?.id) {
        alert('No hay una marca (brand_container) en esta organización; no se puede crear el monitor.');
        return;
      }
      const payload = {
        organization_id: orgId,
        brand_container_id: bcRow.id,
        sensor_type: sensorType,
        status: 'active',
        config: { label: name, keywords, platforms },
      };
      const { error } = await this._supabase.from('monitoring_triggers').insert(payload);
      if (error) { alert('Error al crear monitor.'); return; }
      document.getElementById('insightTriggerModal')?.remove();
      this._renderMonitoring();
    });
  }

  // ── Tendencies tab ─────────────────────────────────────────────────────────

  _tendenciesLoadingSkeleton() {
    return `<div class="sd-loading"><i class="fas fa-spinner fa-spin"></i> Cargando el pulso del mundo…</div>`;
  }

  async _renderTendencies() {
    const body = document.getElementById('insightTabBody');
    if (!body) return;

    try {
      if (!this._supabase && window.supabaseService) {
        this._supabase = await window.supabaseService.getClient();
      } else if (!this._supabase && window.supabase) {
        this._supabase = window.supabase;
      }
    } catch (e) { console.error('[DashboardView] Supabase init tendencies:', e); }

    if (!this._supabase) {
      body.innerHTML = this._pageComingSoon('Tendencies', 'fa-fire', 'No se pudo conectar con la base de datos.');
      return;
    }

    const orgId = window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      window.currentOrgId;

    try {
      let trends = [], signals = [], prices = [], ownPosts = [];
      if (orgId) {
        const [trendRes, retailRes, entRes, postsRes] = await Promise.all([
          this._supabase
            .from('trend_topics')
            .select('id, keyword, source, category, velocity_score, relevance_score, sentiment, detected_at, metadata, scope')
            .eq('organization_id', orgId)
            .order('velocity_score', { ascending: false, nullsFirst: false })
            .limit(50),
          this._supabase
            .from('retail_prices')
            .select('id, product_name, price, currency, retailer, captured_at, stock_status')
            .eq('organization_id', orgId)
            .order('captured_at', { ascending: false })
            .limit(20),
          this._supabase
            .from('intelligence_entities')
            .select('id')
            .eq('organization_id', orgId)
            .limit(500),
          this._supabase
            .from('brand_posts')
            .select('content, network')
            .eq('is_competitor', false)
            .limit(200),
        ]);
        trends = trendRes.error ? [] : (trendRes.data || []);
        prices = retailRes.error ? [] : (retailRes.data || []);
        ownPosts = postsRes.error ? [] : (postsRes.data || []);
        const entityIds = (entRes.data || []).map(r => r.id).filter(Boolean);
        if (entityIds.length) {
          const sigRes = await this._supabase
            .from('intelligence_signals')
            .select('id, signal_type, content_text, content_numeric, ai_analysis, captured_at, entity_id')
            .in('entity_id', entityIds)
            .order('captured_at', { ascending: false })
            .limit(30);
          signals = sigRes.error ? [] : (sigRes.data || []);
        }
      }

      body.innerHTML = this._renderTendenciesHtml(trends, signals, prices, ownPosts);
      await this._ensureChartJs();
      this._renderTendenciesCharts(trends, signals);
    } catch (e) {
      console.error('[DashboardView] renderTendencies:', e);
      body.innerHTML = this._pageComingSoon('Tendencies', 'fa-fire', 'Error cargando tendencias.');
    }
  }

  _renderTendenciesHtml(trends, signals, prices, ownPosts) {
    const ownContentLower = ownPosts.map(p => (p.content || '').toLowerCase()).join(' ');
    const totalTrends = trends.length;
    const emerging = trends.filter(t => (t.velocity_score || 0) < 30);
    const growing = trends.filter(t => (t.velocity_score || 0) >= 30 && (t.velocity_score || 0) < 70);
    const massive = trends.filter(t => (t.velocity_score || 0) >= 70);

    // Sentiment global
    let sentSum = 0, sentCount = 0;
    trends.forEach(t => {
      const s = t.sentiment && typeof t.sentiment === 'object' ? t.sentiment : {};
      if (s.score != null) { sentSum += Number(s.score); sentCount++; }
    });
    const globalSentiment = sentCount ? (sentSum / sentCount) : null;
    const sentLabel = globalSentiment != null ? (globalSentiment > 0.5 ? 'Positivo' : globalSentiment > 0 ? 'Neutro' : 'Negativo') : '—';
    const sentColor = globalSentiment != null ? (globalSentiment > 0.5 ? '#4ade80' : globalSentiment > 0 ? '#fbbf24' : '#f87171') : 'rgba(212,209,216,0.5)';

    // SOV header
    const sovHtml = `
      <div class="sd-sov-header">
        <div class="sd-sov-icon"><i class="fas fa-satellite-dish"></i></div>
        <div class="sd-sov-body">
          <div class="sd-sov-title">El Pulso del Mundo</div>
          <div class="sd-sov-value">${totalTrends} Tendencia${totalTrends !== 1 ? 's' : ''} Activa${totalTrends !== 1 ? 's' : ''}</div>
          <div class="sd-sov-sub">Arbitraje de atención · Señales antes de que sean masivas</div>
        </div>
        <div class="sd-sov-kpis">
          <div class="sd-sov-kpi"><div class="sd-sov-kpi-value" style="color:#60a5fa">${emerging.length}</div><div class="sd-sov-kpi-label">Emergiendo</div></div>
          <div class="sd-sov-kpi"><div class="sd-sov-kpi-value" style="color:#fb923c">${growing.length}</div><div class="sd-sov-kpi-label">Creciendo</div></div>
          <div class="sd-sov-kpi"><div class="sd-sov-kpi-value" style="color:#f87171">${massive.length}</div><div class="sd-sov-kpi-label">Masivas</div></div>
          <div class="sd-sov-kpi"><div class="sd-sov-kpi-value" style="color:${sentColor}">${sentLabel}</div><div class="sd-sov-kpi-label">Mood global</div></div>
        </div>
      </div>`;

    // A. Early Detection
    const getPhase = (v) => {
      if (v >= 70) return { label: 'masivo', cls: 'sd-phase--massive', velCls: 'sd-velocity--hot' };
      if (v >= 30) return { label: 'creciendo', cls: 'sd-phase--growing', velCls: 'sd-velocity--warm' };
      return { label: 'emergiendo', cls: 'sd-phase--emerging', velCls: 'sd-velocity--cool' };
    };

    const trendCards = trends.length
      ? trends.slice(0, 12).map(t => {
          const vel = t.velocity_score || t.relevance_score || 0;
          const phase = getPhase(vel);
          const sent = t.sentiment && typeof t.sentiment === 'object' ? t.sentiment : {};
          const score = sent.score != null ? Number(sent.score) : null;
          const sentEmoji = score != null ? (score > 0.5 ? '🟢' : score > 0 ? '🟡' : '🔴') : '';
          const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
          const keywords = Array.isArray(meta.related_keywords) ? meta.related_keywords.slice(0, 4) : [];
          const isContentGap = !ownContentLower.includes((t.keyword || '').toLowerCase());
          return `<div class="sd-trend-card">
            <div class="sd-trend-header">
              <span class="sd-trend-keyword">${this._esc(t.keyword || '—')}</span>
              <span class="sd-trend-source">${this._esc(t.source || '—')}</span>
            </div>
            <div class="sd-trend-meta">
              <div class="sd-trend-velocity">
                <div class="sd-velocity-bar"><div class="sd-velocity-fill ${phase.velCls}" style="width:${Math.min(100, vel)}%"></div></div>
                <span>${vel}</span>
              </div>
              <span class="sd-trend-phase ${phase.cls}">${phase.label}</span>
              ${sentEmoji ? `<span>${sentEmoji}</span>` : ''}
              ${isContentGap ? `<span class="sd-trend-gap-badge"><i class="fas fa-gem"></i> Océano Azul</span>` : ''}
              ${t.detected_at ? `<span>${new Date(t.detected_at).toLocaleDateString('es-ES')}</span>` : ''}
            </div>
            ${keywords.length ? `<div class="sd-trend-keywords">${keywords.map(k => `<span class="sd-trend-kw">${this._esc(String(k))}</span>`).join('')}</div>` : ''}
          </div>`;
        }).join('')
      : `<div class="sd-empty"><i class="fas fa-satellite-dish"></i><p class="sd-empty-title">Sin tendencias detectadas</p><p class="sd-empty-desc">El agente las generará al escanear fuentes de nicho.</p></div>`;

    const earlyDetectHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--cyan"><i class="fas fa-radar"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Early Detection</div>
            <div class="sd-dim-subtitle">Señales débiles de nicho antes de que sean masivas</div>
          </div>
        </div>
        <div class="sd-dim-body sd-dim-body--stack">
          ${trends.length ? `<div class="sd-widget sd-widget--full"><div class="sd-widget-header"><span class="sd-widget-title">Velocidad de Tendencias</span></div><div class="sd-chart-wrap" id="trendVelocityChart"></div></div>` : ''}
          <div class="sd-trends-grid">${trendCards}</div>
        </div>
      </div>`;

    // B. Real World Sync
    const culturalTrends = trends.filter(t => t.category === 'cultural' || t.category === 'event' || t.category === 'news');
    const culturalCards = culturalTrends.length
      ? culturalTrends.slice(0, 6).map(t => {
          const vel = t.velocity_score || 0;
          const phase = getPhase(vel);
          return `<div class="sd-trend-card">
            <div class="sd-trend-header">
              <span class="sd-trend-keyword">${this._esc(t.keyword || '—')}</span>
              <span class="sd-trend-source">${this._esc(t.category || t.source || '—')}</span>
            </div>
            <div class="sd-trend-meta">
              <span class="sd-trend-phase ${phase.cls}">${phase.label}</span>
              ${t.detected_at ? `<span>${new Date(t.detected_at).toLocaleDateString('es-ES')}</span>` : ''}
            </div>
          </div>`;
        }).join('')
      : `<div class="sd-empty"><i class="fas fa-globe-americas"></i><p class="sd-empty-title">Sin contexto cultural detectado</p><p class="sd-empty-desc">Se llenará con noticias, eventos y cambios climáticos relevantes a tu nicho.</p></div>`;

    const realWorldHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--green"><i class="fas fa-globe-americas"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Real World Sync</div>
            <div class="sd-dim-subtitle">Contexto cultural, climático y social que afecta tu producto</div>
          </div>
        </div>
        <div class="sd-dim-body sd-dim-body--stack">
          <div class="sd-dim-row">
            <div class="sd-widget">
              <div class="sd-widget-header"><span class="sd-widget-title">Sentiment Shift Global</span></div>
              <div style="text-align:center;padding:1rem 0">
                <div style="font-size:2.5rem;font-weight:800;color:${sentColor};line-height:1">${globalSentiment != null ? (globalSentiment * 100).toFixed(0) : '—'}</div>
                <div style="font-size:0.78rem;color:rgba(212,209,216,0.5);margin-top:0.35rem">${sentLabel} · Basado en ${sentCount} tendencias</div>
              </div>
            </div>
            <div class="sd-widget">
              <div class="sd-widget-header"><span class="sd-widget-title">Distribución de Fuentes</span></div>
              <div class="sd-chart-wrap sd-chart-wrap--sm" id="trendSourcesChart"></div>
            </div>
          </div>
          <div class="sd-trends-grid">${culturalCards}</div>
        </div>
      </div>`;

    // C. Platform Pulse
    const platformTrends = {};
    trends.forEach(t => {
      const src = (t.source || 'other').toLowerCase();
      if (!platformTrends[src]) platformTrends[src] = { count: 0, topVel: 0 };
      platformTrends[src].count++;
      if ((t.velocity_score || 0) > platformTrends[src].topVel) platformTrends[src].topVel = t.velocity_score || 0;
    });
    const PLATFORM_ICONS = { instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok', youtube: 'fab fa-youtube', facebook: 'fab fa-facebook', twitter: 'fab fa-twitter', google: 'fab fa-google', web: 'fas fa-globe' };
    const PLATFORM_CSS = { instagram: 'sd-platform-icon--ig', tiktok: 'sd-platform-icon--tt', youtube: 'sd-platform-icon--yt', facebook: 'sd-platform-icon--fb', twitter: 'sd-platform-icon--tw' };

    const platformCards = Object.entries(platformTrends).map(([p, d]) => `
      <div class="sd-platform-card">
        <div class="sd-platform-icon ${PLATFORM_CSS[p] || 'sd-platform-icon--web'}"><i class="${PLATFORM_ICONS[p] || 'fas fa-globe'}"></i></div>
        <div class="sd-platform-body">
          <div class="sd-platform-name">${p.charAt(0).toUpperCase() + p.slice(1)}</div>
          <div class="sd-platform-stat">${d.count} tendencias · Top vel: ${d.topVel}</div>
        </div>
      </div>`).join('');

    const platformPulseHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--pink"><i class="fas fa-broadcast-tower"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Platform Pulse</div>
            <div class="sd-dim-subtitle">Inteligencia algorítmica por plataforma · Formato ganador</div>
          </div>
        </div>
        <div class="sd-dim-body sd-dim-body--stack">
          <div class="sd-platform-grid">${platformCards || '<div class="sd-empty"><p class="sd-empty-desc">Sin datos de plataformas aún.</p></div>'}</div>
          ${trends.length ? `<div class="sd-widget sd-widget--full"><div class="sd-widget-header"><span class="sd-widget-title">Hashtag & Keyword Velocity</span></div><div class="sd-chart-wrap" id="trendKeywordVelChart"></div></div>` : ''}
        </div>
      </div>`;

    // D. Visual Trend
    const hookSignals = signals.filter(s => s.signal_type === 'hook' || s.signal_type === 'narrative_hook' || s.signal_type === 'visual_trend');
    const visualTrends = trends.filter(t => {
      const m = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
      return m.visual_style || t.category === 'visual' || t.category === 'aesthetic';
    });

    const visualCards = [...hookSignals.slice(0, 4).map(s => `
      <div class="sd-trend-card">
        <div class="sd-trend-header">
          <span class="sd-trend-keyword"><i class="fas fa-bolt" style="color:#fbbf24"></i> ${this._esc((s.content_text || '').slice(0, 60))}</span>
          <span class="sd-trend-source">${this._esc(s.signal_type)}</span>
        </div>
        <div class="sd-trend-meta">${s.captured_at ? `<span>${new Date(s.captured_at).toLocaleDateString('es-ES')}</span>` : ''}</div>
      </div>`),
    ...visualTrends.slice(0, 4).map(t => {
      const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
      return `<div class="sd-trend-card">
        <div class="sd-trend-header">
          <span class="sd-trend-keyword"><i class="fas fa-palette" style="color:#c084fc"></i> ${this._esc(t.keyword || '—')}</span>
          <span class="sd-trend-source">${this._esc(meta.visual_style || t.source || '—')}</span>
        </div>
        <div class="sd-trend-meta">${t.detected_at ? `<span>${new Date(t.detected_at).toLocaleDateString('es-ES')}</span>` : ''}</div>
      </div>`;
    })].join('');

    const visualTrendHtml = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--purple"><i class="fas fa-palette"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Visual Trend</div>
            <div class="sd-dim-subtitle">Estética del momento, hooks y ganchos de atención</div>
          </div>
        </div>
        <div class="sd-dim-body sd-dim-body--stack">
          ${visualCards ? `<div class="sd-trends-grid">${visualCards}</div>` : `<div class="sd-empty"><i class="fas fa-palette"></i><p class="sd-empty-title">Sin tendencias visuales</p><p class="sd-empty-desc">El agente detectará estilos de edición, hooks y paletas emergentes.</p></div>`}
        </div>
      </div>`;

    // Intelligence Signals table
    const signalRows = signals.length
      ? signals.slice(0, 15).map(s => {
          const text = (s.content_text || '').slice(0, 140);
          const ai = s.ai_analysis && typeof s.ai_analysis === 'object' ? s.ai_analysis : {};
          return `<tr>
            <td><span class="sd-widget-badge sd-widget-badge--blue">${this._esc(s.signal_type || '—')}</span></td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc(text)}</td>
            <td>${s.content_numeric != null ? Number(s.content_numeric).toLocaleString() : '—'}</td>
            <td style="font-size:0.75rem;color:var(--text-secondary);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ai.summary ? this._esc(ai.summary.slice(0, 80)) : '—'}</td>
            <td>${s.captured_at ? new Date(s.captured_at).toLocaleDateString('es-ES') : '—'}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="5" class="sd-table-empty">Sin señales de inteligencia registradas.</td></tr>`;

    const signalsSection = `
      <div class="sd-dimension">
        <div class="sd-dim-header">
          <div class="sd-dim-icon sd-dim-icon--yellow"><i class="fas fa-signal"></i></div>
          <div class="sd-dim-title-wrap">
            <div class="sd-dim-title">Señales de Inteligencia</div>
            <div class="sd-dim-subtitle">Capturas del agente en fuentes monitoreadas</div>
          </div>
        </div>
        <div class="sd-widget sd-widget--full">
          <div class="sd-table-wrap">
            <table class="sd-table">
              <thead><tr><th>Tipo</th><th>Señal</th><th>Relevancia</th><th>Análisis IA</th><th>Detectada</th></tr></thead>
              <tbody>${signalRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    return `<div class="sd-dashboard">${sovHtml}${earlyDetectHtml}${realWorldHtml}${platformPulseHtml}${visualTrendHtml}${signalsSection}</div>`;
  }

  _renderTendenciesCharts(trends, signals) {
    if (typeof Chart === 'undefined' || !trends.length) return;

    const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'rgba(212,209,216,0.6)', font: { size: 11 } } } }, scales: { x: { ticks: { color: 'rgba(212,209,216,0.4)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: 'rgba(212,209,216,0.4)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } };

    // Velocity chart (horizontal bars — top keywords by velocity)
    const velEl = document.getElementById('trendVelocityChart');
    if (velEl) {
      const top = trends.filter(t => t.velocity_score != null).sort((a, b) => b.velocity_score - a.velocity_score).slice(0, 10);
      const labels = top.map(t => (t.keyword || '').slice(0, 25));
      const data = top.map(t => t.velocity_score);
      const colors = data.map(v => v >= 70 ? 'rgba(248,113,113,0.8)' : v >= 30 ? 'rgba(251,146,60,0.8)' : 'rgba(96,165,250,0.8)');
      const canvas = document.createElement('canvas');
      velEl.appendChild(canvas);
      this._chartInstances.trendVelocity = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Velocity Score', data, backgroundColor: colors, borderRadius: 4 }] },
        options: { ...chartOpts, indexAxis: 'y', plugins: { ...chartOpts.plugins, legend: { display: false } } }
      });
    }

    // Sources distribution (doughnut)
    const srcEl = document.getElementById('trendSourcesChart');
    if (srcEl) {
      const bySource = {};
      trends.forEach(t => { const s = (t.source || 'other').toLowerCase(); bySource[s] = (bySource[s] || 0) + 1; });
      const labels = Object.keys(bySource);
      const data = labels.map(l => bySource[l]);
      const bgColors = ['rgba(225,48,108,0.8)', 'rgba(96,165,250,0.8)', 'rgba(255,0,0,0.8)', 'rgba(24,119,242,0.8)', 'rgba(45,212,191,0.8)', 'rgba(167,139,250,0.8)', 'rgba(163,163,163,0.6)'];
      const canvas = document.createElement('canvas');
      srcEl.appendChild(canvas);
      this._chartInstances.trendSources = new Chart(canvas, {
        type: 'doughnut',
        data: { labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)), datasets: [{ data, backgroundColor: bgColors.slice(0, labels.length), borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { color: 'rgba(212,209,216,0.6)', font: { size: 11 }, padding: 10 } } } }
      });
    }

    // Keyword velocity bar chart
    const kwEl = document.getElementById('trendKeywordVelChart');
    if (kwEl) {
      const top = trends.filter(t => t.velocity_score != null).sort((a, b) => b.velocity_score - a.velocity_score).slice(0, 15);
      const labels = top.map(t => (t.keyword || '').slice(0, 20));
      const data = top.map(t => t.velocity_score);
      const colors = data.map(v => v >= 70 ? 'rgba(248,113,113,0.7)' : v >= 30 ? 'rgba(251,146,60,0.7)' : 'rgba(96,165,250,0.7)');
      const canvas = document.createElement('canvas');
      kwEl.appendChild(canvas);
      this._chartInstances.trendKwVel = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Velocity', data, backgroundColor: colors, borderRadius: 3 }] },
        options: { ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: false } } }
      });
    }
  }
}

window.DashboardView = DashboardView;
