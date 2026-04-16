/**
 * CommandCenterView — Centro de comando por sub-marca.
 * URL con slug legible (misma lógica que getOrgSlug): /org/.../command-center/:subBrandSlug
 * Muestra audiencias y campañas en la plataforma + cuentas de integración enlazadas a esa sub-marca.
 */
class CommandCenterView extends BaseView {
  constructor() {
    super();
    this._subBrandSlug = '';
    this._organizationId = null;
    this._containerRow = null;
    this._audiences = [];
    this._campaigns = [];
    this._integrations = [];
    this._range = '30d';
    this._paidVsOrganicMetric = 'reach';
    this._snapshots = [];
  }

  /**
   * Ruta legacy sin prefijo /org/... → canonicaliza a /org/{short}/{nameSlug}/command-center/:slug
   * @returns {Promise<boolean>} true si hubo redirección (no continuar render)
   */
  async _redirectLegacyCommandCenterToOrg(container) {
    const path = window.location.pathname || '';
    if (path.startsWith('/org/')) return false;
    if (!path.startsWith('/command-center/')) return false;

    const orgId =
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      '';
    if (!orgId || typeof window.getOrgPathPrefix !== 'function') return false;

    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    if (!supabase) return false;

    let orgName = '';
    try {
      const { data, error } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
      if (!error && data?.name) orgName = String(data.name);
    } catch (e) {
      console.warn('CommandCenterView: org name', e);
    }

    const prefix = window.getOrgPathPrefix(orgId, orgName);
    if (!prefix) return false;

    const slug = (this.routeParams && this.routeParams.subBrandSlug) || path.replace(/^\/command-center\//, '').split('/')[0];
    if (!slug) return false;

    const target = `${prefix}/command-center/${encodeURIComponent(slug)}`;
    if (container) {
      container.innerHTML = '<div class="page-content command-center-page"><p class="text-muted">Redirigiendo…</p></div>';
    }
    if (window.router) window.router.navigate(target + (window.location.search || ''), true);
    return true;
  }

  _resolveOrganizationId() {
    return (
      this.routeParams?.orgId ||
      window.currentOrgId ||
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      null
    );
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) {
        window.router?.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  renderHTML() {
    return `
<div class="command-center-page page-content" id="commandCenterPage">
  <header class="cc-header card glass-black" id="ccHeader">
    <div class="cc-header-left">
      <div class="cc-header-kicker">HEADER</div>
      <div class="cc-header-title">
        <span class="cc-header-title-strong">Campaign Intelligence</span>
        <span class="cc-header-title-sep">·</span>
        <span class="cc-header-brand" id="commandCenterTitle">Cargando…</span>
      </div>
      <div class="cc-header-sub" id="commandCenterSlug"></div>
    </div>
    <div class="cc-header-right">
      <span class="cc-pill" id="ccMetaFresh">Meta · —</span>
      <span class="cc-pill" id="ccGa4Fresh">GA4 · —</span>
      <select class="cc-range" id="ccRangeSelect" aria-label="Rango">
        <option value="7d">Últimos 7 días</option>
        <option value="30d" selected>Últimos 30 días</option>
        <option value="90d">Últimos 90 días</option>
      </select>
      <button type="button" class="btn btn-secondary btn-sm" id="ccRefreshBtn">
        <i class="fas fa-sync"></i> Actualizar
      </button>
      <a href="#" class="btn btn-secondary btn-sm" id="commandCenterBackStorage" style="display:none">
        <i class="fas fa-th-large"></i>
      </a>
    </div>
  </header>

  <section class="cc-section cc-section--pulse" aria-label="Métricas de pulso">
    <div class="cc-section-head">
      <div class="cc-section-title"><span class="cc-step">1</span> Métricas de pulso — KPIs principales</div>
      <span class="cc-tag cc-tag--purple">Snapshot · inmediato</span>
    </div>
    <div class="cc-kpis" id="ccKpis">
      ${this._renderKpiSkeleton()}
    </div>
  </section>

  <div class="cc-grid-2">
    <section class="cc-section card glass-black" aria-label="Pago vs orgánico">
      <div class="cc-section-head cc-section-head--inner">
        <div class="cc-section-title"><span class="cc-step">2</span> Panel pago vs orgánico — comparación central</div>
        <span class="cc-tag cc-tag--green">Core · híbrido</span>
      </div>
      <div class="cc-toggle" role="tablist" aria-label="Métrica">
        <button type="button" class="cc-toggle-btn active" data-metric="reach">Alcance</button>
        <button type="button" class="cc-toggle-btn" data-metric="engagement">Engagement</button>
        <button type="button" class="cc-toggle-btn" data-metric="conversions">Conversiones</button>
        <button type="button" class="cc-toggle-btn" data-metric="cpm">CPM</button>
      </div>
      <div class="cc-chart-wrap" id="ccPaidOrganicChart">
        <div class="cc-chart-placeholder">PaidVsOrganicChart</div>
      </div>
      <div class="cc-mini-table" id="ccCampaignComparisonTable">
        <div class="cc-mini-table-title">Campañas activas (comparación)</div>
        <div class="cc-mini-table-body text-muted">CampaignComparisonTable · pendiente de datos</div>
      </div>
    </section>

    <section class="cc-section card glass-black" aria-label="Audiencia diseñada vs real">
      <div class="cc-section-head cc-section-head--inner">
        <div class="cc-section-title"><span class="cc-step">3</span> Audiencias — perfil real vs diseñado</div>
        <span class="cc-tag cc-tag--green">GA4 · enriquecimiento</span>
      </div>
      <div class="cc-audience-compare" id="ccAudienceCompare">
        <div class="cc-audience-col">
          <div class="cc-audience-col-title">Diseñada</div>
          <div class="cc-audience-body" id="ccAudienceDesigned">Cargando…</div>
        </div>
        <div class="cc-audience-col">
          <div class="cc-audience-col-title">Real (GA4)</div>
          <div class="cc-audience-body" id="ccAudienceReal">Sin datos GA4 aún</div>
        </div>
      </div>
      <div class="cc-audience-footer">
        <div class="cc-align" id="ccAudienceAlign">Alineación: —</div>
        <button type="button" class="btn btn-secondary btn-sm" id="ccSuggestAudienceBtn" disabled>
          Sugerir ajustes
        </button>
      </div>
    </section>
  </div>

  <div class="cc-grid-2">
    <section class="cc-section card glass-black" aria-label="Heatmap de audiencia">
      <div class="cc-section-head cc-section-head--inner">
        <div class="cc-section-title"><span class="cc-step">5</span> Heatmap de audiencia — cuándo publicar</div>
        <span class="cc-tag cc-tag--purple">GA4 + DB · heatmap</span>
      </div>
      <div class="cc-heatmap" id="ccHeatmap">
        ${this._renderHeatmapSkeleton()}
      </div>
      <div class="cc-heatmap-best text-muted" id="ccHeatmapBest">Mejor momento: —</div>
    </section>

    <section class="cc-section card glass-black" aria-label="Ángulos que convierten">
      <div class="cc-section-head cc-section-head--inner">
        <div class="cc-section-title"><span class="cc-step">4</span> Ángulos de venta — validación con dinero real</div>
        <span class="cc-tag cc-tag--orange">Meta Ads · creativos</span>
      </div>
      <div class="cc-angles" id="ccAngles">
        <div class="cc-angles-empty text-muted">AngleRankingList · pendiente de datos</div>
      </div>
      <div class="cc-angles-footer">
        <button type="button" class="btn btn-secondary btn-sm" id="ccGenerateAnglesBtn" disabled>
          Generar nuevos ángulos
        </button>
      </div>
    </section>
  </div>

  <div class="cc-grid-2">
    <section class="cc-section card glass-black" aria-label="Señales de inteligencia">
      <div class="cc-section-head cc-section-head--inner">
        <div class="cc-section-title"><span class="cc-step">6</span> Inteligencia competitiva — señales del mercado</div>
        <span class="cc-tag cc-tag--orange">Sensors · inteligencia</span>
      </div>
      <div class="cc-signals" id="ccSignals">
        <div class="cc-signals-empty text-muted">IntelligenceFeed · pendiente de datos</div>
      </div>
    </section>

    <section class="cc-section card glass-black" aria-label="Campañas activas">
      <div class="cc-section-head cc-section-head--inner">
        <div class="cc-section-title"><span class="cc-step">7</span> Panel de campañas activas — gestión rápida</div>
        <span class="cc-tag cc-tag--gray">DB · operacional</span>
      </div>
      <div class="cc-active-campaigns" id="ccActiveCampaigns">
        <div class="text-muted">Cargando…</div>
      </div>
    </section>
  </div>
</div>`;
  }

  async render() {
    const container = document.getElementById('app-container');
    if (await this._redirectLegacyCommandCenterToOrg(container)) return;
    await super.render();
    await this._hydrateCommandCenter();
  }

  async _hydrateCommandCenter() {
    this._subBrandSlug = String((this.routeParams && this.routeParams.subBrandSlug) || '')
      .trim()
      .toLowerCase();
    this._organizationId = this._resolveOrganizationId();

    const heroTitle = document.getElementById('commandCenterTitle');
    const heroSlug = document.getElementById('commandCenterSlug');
    const backBtn = document.getElementById('commandCenterBackStorage');

    if (!this._organizationId) {
      if (heroTitle) heroTitle.textContent = 'Sin organización';
      if (heroSlug) heroSlug.textContent = '';
      this._setDashboardError('Selecciona una organización o inicia sesión de nuevo.');
      this.updateHeaderContext('Command Center', this._subBrandSlug || '—', window.currentOrgName || '');
      return;
    }

    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    if (!supabase) {
      this._setDashboardError('No hay conexión con la base de datos.');
      return;
    }

    const slugFn = typeof window.getOrgSlug === 'function' ? window.getOrgSlug : (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let containers = [];
    try {
      const { data, error } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, created_at')
        .eq('organization_id', this._organizationId)
        .order('created_at', { ascending: false });
      if (error) console.warn('CommandCenterView: brand_containers', error);
      containers = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('CommandCenterView:', e);
    }

    const match = containers.find((row) => slugFn(row.nombre_marca) === this._subBrandSlug);

    if (!match) {
      if (heroTitle) heroTitle.textContent = 'Sub-marca no encontrada';
      if (heroSlug) heroSlug.textContent = this._subBrandSlug ? `/${this._subBrandSlug}/` : '';
      this._setDashboardError('No existe una sub-marca con este slug en tu organización. Revisa el nombre en Brand Storage.');
      this.updateHeaderContext('Command Center', this._subBrandSlug || '—', window.currentOrgName || '');
      return;
    }

    this._containerRow = match;
    const displayName = (match.nombre_marca && String(match.nombre_marca).trim()) || 'Sub-marca';
    if (heroTitle) heroTitle.textContent = displayName;
    if (heroSlug) heroSlug.textContent = this._subBrandSlug ? `/${this._subBrandSlug}/` : '';

    const storageHref =
      window.appNavigation && typeof window.appNavigation.getUserSidebarRoute === 'function'
        ? window.appNavigation.getUserSidebarRoute('brand-storage')
        : '/brand-storage';
    if (backBtn) {
      backBtn.href = storageHref;
      backBtn.setAttribute('data-route', storageHref);
      backBtn.style.display = '';
    }

    this.updateHeaderContext('Command Center', displayName, window.currentOrgName || '');

    const bid = match.id;
    try {
      const [audRes, campRes, intRes, snapRes] = await Promise.all([
        supabase
          .from('audiences')
          .select('id, name, description, awareness_level, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase
          .from('campaigns')
          .select('id, nombre_campana, descripcion_interna, contexto_temporal, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase
          .from('brand_integrations')
          .select('id, platform, external_account_name, is_active, last_sync_at, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        // Opcional (si existe en DB): snapshots agregados para KPIs (fallback a placeholder si no existe)
        supabase
          .from('brand_analytics_snapshots')
          .select('id, platform, range, data, created_at')
          .eq('brand_container_id', bid)
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      this._audiences = !audRes.error && Array.isArray(audRes.data) ? audRes.data : [];
      this._campaigns = !campRes.error && Array.isArray(campRes.data) ? campRes.data : [];
      this._integrations = !intRes.error && Array.isArray(intRes.data) ? intRes.data : [];
      this._snapshots = !snapRes.error && Array.isArray(snapRes.data) ? snapRes.data : [];
    } catch (e) {
      console.warn('CommandCenterView: fetch panels', e);
      this._audiences = [];
      this._campaigns = [];
      this._integrations = [];
      this._snapshots = [];
    }

    this._renderDashboard();
    this._bindDashboardEvents();
    this.updateLinksForRouter();
  }

  _setDashboardError(msg) {
    const esc = this.escapeHtml(msg);
    const targets = ['ccKpis', 'ccPaidOrganicChart', 'ccCampaignComparisonTable', 'ccAudienceDesigned', 'ccAudienceReal', 'ccHeatmap', 'ccAngles', 'ccSignals', 'ccActiveCampaigns'];
    targets.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="cc-empty">${esc}</div>`;
    });
  }

  _renderKpiSkeleton() {
    const cards = [
      { id: 'spend', label: 'GASTO TOTAL', color: 'green' },
      { id: 'reach', label: 'ALCANCE TOTAL', color: 'blue' },
      { id: 'cpm', label: 'CPM PROMEDIO', color: 'pink' },
      { id: 'conversion_rate', label: 'TASA CONVERSIÓN', color: 'teal' },
      { id: 'organic_efficiency', label: 'EFICIENCIA ORGÁNICA', color: 'orange' },
    ];
    return cards.map((c) => `
      <div class="cc-kpi card glass-black" data-kpi="${c.id}">
        <div class="cc-kpi-label">${c.label}</div>
        <div class="cc-kpi-value">—</div>
        <div class="cc-kpi-delta text-muted">—</div>
        <div class="cc-sparkline cc-sparkline--${c.color}" aria-hidden="true">
          ${Array.from({ length: 14 }).map(() => `<span></span>`).join('')}
        </div>
      </div>`).join('');
  }

  _renderHeatmapSkeleton() {
    const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const cells = [];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 24; c++) cells.push(`<span class="cc-heatmap-cell" data-d="${r}" data-h="${c}"></span>`);
    }
    return `
      <div class="cc-heatmap-head">
        <div class="cc-heatmap-days">${days.map((d) => `<span>${d}</span>`).join('')}</div>
      </div>
      <div class="cc-heatmap-grid">${cells.join('')}</div>
    `;
  }

  _renderDashboard() {
    this._renderFreshnessPills();
    this._renderKpis();
    this._renderActiveCampaigns();
    this._renderAudienceDesigned();
  }

  _renderFreshnessPills() {
    const metaEl = document.getElementById('ccMetaFresh');
    const ga4El = document.getElementById('ccGa4Fresh');
    const meta = (this._integrations || []).find((i) => String(i.platform || '').toLowerCase().includes('meta')) || null;
    const ga4 = (this._integrations || []).find((i) => String(i.platform || '').toLowerCase().includes('google')) || null;
    const metaWhen = meta ? (meta.last_sync_at || meta.updated_at) : null;
    const ga4When = ga4 ? (ga4.last_sync_at || ga4.updated_at) : null;
    if (metaEl) metaEl.textContent = `Meta · ${metaWhen ? `hace ${this._humanizeAgo(metaWhen)}` : '—'}`;
    if (ga4El) ga4El.textContent = `GA4 · ${ga4When ? `hace ${this._humanizeAgo(ga4When)}` : '—'}`;
  }

  _pickSnapshot(platformKey) {
    const rows = Array.isArray(this._snapshots) ? this._snapshots : [];
    const range = this._range || '30d';
    const normalized = String(platformKey || '').toLowerCase();
    return rows.find((r) => String(r.range || '').toLowerCase() === range && String(r.platform || '').toLowerCase() === normalized) ||
      rows.find((r) => String(r.platform || '').toLowerCase() === normalized) ||
      null;
  }

  _num(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x : null;
  }

  _fmtCompact(n) {
    const x = this._num(n);
    if (x == null) return '—';
    try {
      return x >= 1000 ? x.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 }) : x.toLocaleString('en-US');
    } catch {
      return String(x);
    }
  }

  _fmtMoney(n) {
    const x = this._num(n);
    if (x == null) return '—';
    try {
      return x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    } catch {
      return `$${Math.round(x)}`;
    }
  }

  _fmtPct(n) {
    const x = this._num(n);
    if (x == null) return '—';
    return `${(x * 100).toFixed(1)}%`;
  }

  _renderKpis() {
    const wrap = document.getElementById('ccKpis');
    if (!wrap) return;
    // Si no hay snapshots todavía, dejamos skeleton (ya está en HTML) y solo mostramos values si hay data.
    const metaSnap = this._pickSnapshot('meta_ads');
    const ga4Snap = this._pickSnapshot('ga4');
    const dataMeta = metaSnap?.data && typeof metaSnap.data === 'object' ? metaSnap.data : {};
    const dataGa4 = ga4Snap?.data && typeof ga4Snap.data === 'object' ? ga4Snap.data : {};

    const kpiMap = {
      spend: { value: this._fmtMoney(dataMeta.spend), delta: dataMeta.spend_delta },
      reach: { value: this._fmtCompact(dataMeta.reach), delta: dataMeta.reach_delta },
      cpm: { value: dataMeta.cpm != null ? `$${Number(dataMeta.cpm).toFixed(2)}` : '—', delta: dataMeta.cpm_delta },
      conversion_rate: { value: this._fmtPct(dataGa4.conversion_rate), delta: dataGa4.conversion_rate_delta },
      organic_efficiency: { value: dataMeta.organic_efficiency != null ? `${Number(dataMeta.organic_efficiency).toFixed(1)}x` : '—', delta: dataMeta.organic_efficiency_delta, sub: 'engagement/CPM' },
    };

    wrap.querySelectorAll('.cc-kpi').forEach((card) => {
      const key = card.getAttribute('data-kpi');
      const cfg = kpiMap[key];
      if (!cfg) return;
      const valueEl = card.querySelector('.cc-kpi-value');
      const deltaEl = card.querySelector('.cc-kpi-delta');
      if (valueEl) valueEl.textContent = cfg.value ?? '—';
      if (deltaEl) {
        const d = this._num(cfg.delta);
        if (d == null) {
          deltaEl.textContent = '—';
          deltaEl.classList.remove('pos', 'neg');
        } else {
          const pct = (d * 100);
          deltaEl.textContent = `${d >= 0 ? '+' : ''}${pct.toFixed(1)}% vs anterior`;
          deltaEl.classList.toggle('pos', d > 0);
          deltaEl.classList.toggle('neg', d < 0);
        }
      }
    });
  }

  _renderAudienceDesigned() {
    const el = document.getElementById('ccAudienceDesigned');
    if (!el) return;
    const a = Array.isArray(this._audiences) ? this._audiences[0] : null;
    if (!a) {
      el.innerHTML = '<div class="text-muted">Sin audiencias definidas en plataforma.</div>';
      return;
    }
    const rows = [];
    const demo = a.datos_demograficos && typeof a.datos_demograficos === 'object' ? a.datos_demograficos : null;
    const psycho = a.datos_psicograficos && typeof a.datos_psicograficos === 'object' ? a.datos_psicograficos : null;
    if (demo?.edad) rows.push(['Edad', String(demo.edad)]);
    if (demo?.genero) rows.push(['Género', String(demo.genero)]);
    if (demo?.ubicacion) rows.push(['Ubicación', String(demo.ubicacion)]);
    if (psycho?.intereses) rows.push(['Intereses', Array.isArray(psycho.intereses) ? psycho.intereses.slice(0, 3).join(', ') : String(psycho.intereses)]);
    if (!rows.length) rows.push(['Audiencia', a.name || '—']);
    el.innerHTML = rows.map(([k, v]) => `<div class="cc-kv"><span>${this.escapeHtml(k)}</span><strong>${this.escapeHtml(v || '—')}</strong></div>`).join('');
  }

  _renderActiveCampaigns() {
    const el = document.getElementById('ccActiveCampaigns');
    if (!el) return;
    const rows = Array.isArray(this._campaigns) ? this._campaigns : [];
    if (!rows.length) {
      el.innerHTML = '<div class="text-muted">No hay campañas en la plataforma para esta sub-marca.</div>';
      return;
    }
    el.innerHTML = rows.slice(0, 6).map((c) => {
      const name = this.escapeHtml(c.nombre_campana || 'Campaña');
      const pct = Math.max(0, Math.min(100, 20 + (String(c.id || '').length % 70))); // placeholder estable
      return `
        <div class="cc-active-item">
          <div class="cc-active-name">${name}</div>
          <div class="cc-active-bar"><span style="width:${pct}%"></span></div>
          <div class="cc-active-meta text-muted">${pct}% · En revisión</div>
        </div>`;
    }).join('');
  }

  _humanizeAgo(iso) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '—';
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h >= 24) return `${Math.floor(h / 24)}d`;
    if (h >= 1) return `${h}h`;
    if (m >= 1) return `${m}m`;
    return `${s}s`;
  }

  _bindDashboardEvents() {
    const range = document.getElementById('ccRangeSelect');
    if (range && range.dataset.bound !== '1') {
      range.dataset.bound = '1';
      range.addEventListener('change', () => {
        this._range = String(range.value || '30d');
        this._renderKpis();
      });
    }
    const refresh = document.getElementById('ccRefreshBtn');
    if (refresh && refresh.dataset.bound !== '1') {
      refresh.dataset.bound = '1';
      refresh.addEventListener('click', async () => {
        await this._hydrateCommandCenter();
      });
    }
    const toggle = document.querySelector('.cc-toggle');
    if (toggle && toggle.dataset.bound !== '1') {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('.cc-toggle-btn');
        if (!btn) return;
        const metric = btn.getAttribute('data-metric');
        if (!metric) return;
        this._paidVsOrganicMetric = metric;
        toggle.querySelectorAll('.cc-toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
        const ph = document.querySelector('#ccPaidOrganicChart .cc-chart-placeholder');
        if (ph) ph.textContent = `PaidVsOrganicChart · ${metric}`;
      });
    }
  }

  _fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '—';
    }
  }
}

window.CommandCenterView = CommandCenterView;
