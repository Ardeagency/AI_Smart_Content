/**
 * CommandCenterView — v4
 * Alineado con schema actual:
 * - audience_personas  (carrusel + modal completo)
 * - audience_segments  (targeting real por plataforma)
 * - campaigns          (KPIs cacheados + status/platform badge)
 * - brand_analytics_snapshots / heatmap vía GET /api/insights/snapshots-list
 *   (service role; el cliente Supabase suele ver [] por RLS)
 * - brand_integrations        (estado de sync)
 * - Dashboard analytics: dedupe por platform+period_type; KPI cards + historial
 */
class CommandCenterView extends BaseView {
  constructor() {
    super();
    this._subBrandSlug    = '';
    this._organizationId  = null;
    this._containerRow    = null;
    this._audiences       = [];   // audience_personas
    this._segments        = [];   // audience_segments
    this._campaigns       = [];   // campaigns (con cached metrics)
    this._snapshots       = [];   // brand_analytics_snapshots
    this._heatmaps        = [];   // brand_audience_heatmap
    this._integrations    = [];   // brand_integrations (sync status)
    this._supabase        = null;
    this._editingAudience = null;
  }

  /* ── Redirect legacy ──────────────────────────────────────────────── */
  async _redirectLegacyIfNeeded(container) {
    const path = window.location.pathname || '';
    if (path.startsWith('/org/')) return false;
    if (!path.startsWith('/command-center/')) return false;
    const orgId =
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') || '';
    if (!orgId || typeof window.getOrgPathPrefix !== 'function') return false;
    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    if (!supabase) return false;
    let orgName = '';
    try {
      const { data, error } = await supabase
        .from('organizations').select('name').eq('id', orgId).maybeSingle();
      if (!error && data?.name) orgName = String(data.name);
    } catch (_) { /* noop */ }
    const prefix = window.getOrgPathPrefix(orgId, orgName);
    if (!prefix) return false;
    const slug = (this.routeParams && this.routeParams.subBrandSlug) ||
      path.replace(/^\/command-center\//, '').split('/')[0];
    if (!slug) return false;
    if (container) container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo…</p></div>';
    window.router?.navigate(
      `${prefix}/command-center/${encodeURIComponent(slug)}${window.location.search || ''}`, true);
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

  /**
   * Snapshots y heatmap: el cliente Supabase a menudo recibe [] por RLS aunque existan filas.
   * Misma comprobación de acceso que /api/insights/mybrand; lectura con service role en el edge.
   */
  async _fetchSnapshotsHeatmapViaApi(brandContainerId) {
    if (!this._supabase || !brandContainerId) return null;
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return null;
      const qs = new URLSearchParams({
        brand_container_id: String(brandContainerId),
        limit: '25',
      });
      const res = await fetch(`/api/insights/snapshots-list?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      });
      const raw = await res.text();
      let json = null;
      try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* noop */ }
      if (!res.ok || !json?.ok) {
        console.warn('CommandCenterView: snapshots-list', res.status, json?.error || raw?.slice?.(0, 200));
        return null;
      }
      return { snapshots: json.snapshots || [], heatmaps: json.heatmaps || [] };
    } catch (e) {
      console.warn('CommandCenterView: snapshots-list', e);
      return null;
    }
  }

  /* ── Lifecycle ────────────────────────────────────────────────────── */
  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  /* ── HTML skeleton ────────────────────────────────────────────────── */
  renderHTML() {
    return `
<div class="cc-page" id="commandCenterPage">

  <!-- PERSONAS ────────────────────────────────────────────────────── -->
  <section class="cc-section cc-section--audiences">
    <div class="cc-aud-glow" aria-hidden="true"></div>
    <div class="cc-section--audiences-body">
      <div class="cc-section-head">
        <div class="cc-section-head-main">
          <h2 class="cc-section-title">Personas</h2>
        </div>
        <div class="cc-aud-head-count-wrap" aria-live="polite" aria-atomic="true">
          <span class="cc-aud-head-count-num" id="ccAudCount" aria-label="Total de personas">0</span>
        </div>
      </div>
      <div class="cc-carousel-wrap">
        <div class="cc-carousel" id="ccAudCarousel">
          <div class="cc-loading"><span></span><span></span><span></span></div>
        </div>
      </div>
      <div class="cc-empty" id="ccAudEmpty" style="display:none;">
        <i class="fas fa-users-slash"></i>
        <p>No hay personas para esta sub-marca.</p>
      </div>
    </div>
  </section>

  <!-- DOS COLUMNAS ────────────────────────────────────────────────── -->
  <div class="cc-two-col" id="ccTwoCol" style="display:none;">

    <!-- IZQUIERDA: Campañas ─────────────────────────────────────── -->
    <aside class="cc-col cc-col--left">
      <div class="cc-section-head cc-section-head--campaigns">
        <div class="cc-section-head-main">
          <h2 class="cc-section-title cc-section-title--campaigns">Campañas</h2>
        </div>
        <div class="cc-camp-head-count-wrap" aria-live="polite" aria-atomic="true">
          <span class="cc-camp-head-count-num" id="ccCampCount" aria-label="Total de campañas">0</span>
        </div>
      </div>
      <div class="cc-list" id="ccCampList"></div>
      <div class="cc-empty cc-empty--inline" id="ccCampEmpty" style="display:none;">
        <i class="fas fa-bullhorn"></i>
        <p>No hay campañas para esta sub-marca.</p>
      </div>
    </aside>

    <!-- DERECHA: Inteligencia de mercado ────────────────────────── -->
    <div class="cc-col cc-col--right cc-col--intel">
      <h2 class="cc-published-title">Inteligencia de mercado</h2>
      <div class="cc-published-stack">

        <!-- Segmentos por plataforma -->
        <section class="cc-published-slice" aria-label="Segmentos de audiencia por plataforma">
          <div class="cc-intel-subtitle">
            <i class="fas fa-crosshairs"></i> Segmentos de audiencia
          </div>
          <div id="ccSegmentsWrap"></div>
        </section>

        <hr class="cc-published-divider" aria-hidden="true" />

        <!-- Dashboard analytics (dedupe + KPIs) -->
        <section class="cc-published-slice" aria-label="Dashboard analytics">
          <div class="cc-intel-subtitle">
            <i class="fas fa-chart-line"></i> Dashboard analytics
          </div>
          <div id="ccSnapshotsWrap"></div>
        </section>

        <hr class="cc-published-divider" aria-hidden="true" />

        <!-- Heatmap -->
        <section class="cc-published-slice" aria-label="Mejor momento para publicar">
          <div class="cc-intel-subtitle">
            <i class="fas fa-fire"></i> Mejor momento para publicar
          </div>
          <div id="ccHeatmapWrap"></div>
        </section>

        <hr class="cc-published-divider" aria-hidden="true" />

        <!-- Estado de integraciones -->
        <section class="cc-published-slice" aria-label="Estado de integraciones">
          <div class="cc-intel-subtitle">
            <i class="fas fa-plug"></i> Integraciones
          </div>
          <div id="ccIntegrationsWrap"></div>
        </section>

      </div>
    </div>
  </div>
</div>

<!-- MODAL: Editar persona ───────────────────────────────────────── -->
<div class="cc-modal-backdrop" id="ccAudienceModalBackdrop" style="display:none;">
  <div class="cc-modal cc-modal--wide" role="dialog" aria-modal="true" aria-labelledby="ccAudienceModalTitle">
    <div class="cc-modal-head">
      <h3 class="cc-modal-title" id="ccAudienceModalTitle">Editar persona</h3>
      <button class="cc-modal-close" type="button" id="ccAudienceModalClose" aria-label="Cerrar">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <form class="cc-modal-form" id="ccAudienceForm">
      <div class="cc-modal-grid">
        <label class="cc-field cc-field--full">
          <span>Nombre</span>
          <input id="ccAudFormName" type="text" required maxlength="120" />
        </label>
        <label class="cc-field">
          <span>Awareness level</span>
          <select id="ccAudFormAwareness">
            <option value="">Sin definir</option>
            <option value="unaware">Unaware</option>
            <option value="problem_aware">Problem aware</option>
            <option value="solution_aware">Solution aware</option>
            <option value="product_aware">Product aware</option>
            <option value="most_aware">Most aware</option>
          </select>
        </label>
        <label class="cc-field cc-field--full">
          <span>Descripción</span>
          <textarea id="ccAudFormDescription" rows="2" maxlength="1200"></textarea>
        </label>
        <label class="cc-field">
          <span>Dolores <small>(uno por línea)</small></span>
          <textarea id="ccAudFormPains" rows="3" placeholder="Dolor 1&#10;Dolor 2"></textarea>
        </label>
        <label class="cc-field">
          <span>Deseos <small>(uno por línea)</small></span>
          <textarea id="ccAudFormDesires" rows="3" placeholder="Deseo 1&#10;Deseo 2"></textarea>
        </label>
        <label class="cc-field">
          <span>Objeciones <small>(uno por línea)</small></span>
          <textarea id="ccAudFormObjeciones" rows="3" placeholder="Objeción 1&#10;Objeción 2"></textarea>
        </label>
        <label class="cc-field">
          <span>Gatillos de compra <small>(uno por línea)</small></span>
          <textarea id="ccAudFormGatillos" rows="3" placeholder="Gatillo 1&#10;Gatillo 2"></textarea>
        </label>
      </div>
      <div class="cc-modal-actions">
        <button class="btn btn-secondary btn-sm" type="button" id="ccAudienceCancelBtn">Cancelar</button>
        <button class="btn btn-primary btn-sm" type="submit" id="ccAudienceSaveBtn">Guardar cambios</button>
      </div>
    </form>
  </div>
</div>`;
  }

  /* ── Render ───────────────────────────────────────────────────────── */
  async render() {
    const container = document.getElementById('app-container');
    if (await this._redirectLegacyIfNeeded(container)) return;
    await super.render();
    await this._loadData();
    this._setupEventListeners();
  }

  /* ── Data fetching ────────────────────────────────────────────────── */
  async _loadData() {
    this._subBrandSlug   = String(this.routeParams?.subBrandSlug || '').trim().toLowerCase();
    this._organizationId = this._resolveOrganizationId();

    if (!this._organizationId) {
      this.updateHeaderContext('Command Center', this._subBrandSlug || '—', window.currentOrgName || '');
      this._setError('Selecciona una organización o inicia sesión de nuevo.');
      return;
    }

    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    this._supabase = supabase || null;
    if (!supabase) { this._setError('No hay conexión con la base de datos.'); return; }

    const slugFn = typeof window.getOrgSlug === 'function'
      ? window.getOrgSlug
      : (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    /* Resolver brand_container por slug */
    let match = null;
    try {
      const { data } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, created_at')
        .eq('organization_id', this._organizationId)
        .order('created_at', { ascending: false });
      const containers = Array.isArray(data) ? data : [];
      match = containers.find((r) => slugFn(r.nombre_marca) === this._subBrandSlug) || null;
    } catch (e) { console.warn('CommandCenterView: brand_containers', e); }

    const displayName = match
      ? (String(match.nombre_marca || '').trim() || 'Sub-marca')
      : this._subBrandSlug || '—';
    this.updateHeaderContext('Command Center', displayName, window.currentOrgName || '');

    if (!match) {
      this._setError(`No se encontró la sub-marca "${displayName}". Revisa el nombre en Brand Storage.`);
      return;
    }

    this._containerRow = match;
    const bid = match.id;

    /* Fetch paralelo (snapshots + heatmap vía API: RLS suele devolver [] al cliente) */
    try {
      const [audRes, segRes, campRes, intRes] = await Promise.all([
        supabase
          .from('audience_personas')
          .select('id, name, description, awareness_level, alignment_score, dolores, deseos, objeciones, gatillos_compra, datos_demograficos, datos_psicograficos, real_age_distribution, real_gender_distribution, real_interests, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),

        supabase
          .from('audience_segments')
          .select('id, persona_id, platform, external_audience_name, external_audience_type, age_range, genders, interests, behaviors, estimated_size, size_lower_bound, size_upper_bound, status, source, last_synced_at')
          .eq('brand_container_id', bid)
          .order('platform', { ascending: true }),

        supabase
          .from('campaigns')
          .select('id, nombre_campana, descripcion_interna, persona_id, cta, cta_url, platform, platform_objective, status, budget_daily, budget_total, budget_currency, starts_at, ends_at, cached_impressions, cached_clicks, cached_spend, cached_conversions, cached_roas, cached_ctr, last_synced_at, source, updated_at, created_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),

        supabase
          .from('brand_integrations')
          .select('id, platform, external_account_name, is_active, last_sync_at, updated_at')
          .eq('brand_container_id', bid)
          .order('platform', { ascending: true }),
      ]);

      this._audiences    = !audRes.error  && Array.isArray(audRes.data)  ? audRes.data  : [];
      this._segments     = !segRes.error  && Array.isArray(segRes.data)  ? segRes.data  : [];
      this._campaigns    = !campRes.error && Array.isArray(campRes.data) ? campRes.data : [];
      this._integrations = !intRes.error  && Array.isArray(intRes.data)  ? intRes.data  : [];
    } catch (e) {
      console.warn('CommandCenterView: fetch', e);
      this._audiences = [];
      this._segments  = [];
      this._campaigns = [];
      this._integrations = [];
    }

    const sh = await this._fetchSnapshotsHeatmapViaApi(bid);
    this._snapshots = Array.isArray(sh?.snapshots) ? sh.snapshots : [];
    this._heatmaps  = Array.isArray(sh?.heatmaps)  ? sh.heatmaps  : [];

    document.getElementById('ccTwoCol')?.style && (document.getElementById('ccTwoCol').style.display = '');

    this._renderAudiencesCarousel();
    this._renderCampaigns();
    this._renderSegments();
    this._renderSnapshots();
    this._renderHeatmap();
    this._renderIntegrations();
    this.updateLinksForRouter();
  }

  /* ── CARRUSEL: audience_personas ──────────────────────────────────── */
  _renderAudiencesCarousel() {
    const carousel = document.getElementById('ccAudCarousel');
    const count    = document.getElementById('ccAudCount');
    const empty    = document.getElementById('ccAudEmpty');
    if (!carousel) return;

    const rows = Array.isArray(this._audiences) ? this._audiences : [];
    if (count) count.textContent = String(rows.length);

    if (!rows.length) {
      carousel.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    const awarenessOrder = ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'];
    const awarenessLabel = {
      unaware: 'Unaware', problem_aware: 'Problem aware', solution_aware: 'Solution aware',
      product_aware: 'Product aware', most_aware: 'Most aware',
    };

    carousel.innerHTML = rows.map((a) => {
      const scoreNum  = a.alignment_score != null ? Math.round(Number(a.alignment_score) * 100) : null;
      const scoreBadge = scoreNum != null
        ? `<span class="cc-aud-score cc-aud-score--${scoreNum >= 70 ? 'hi' : scoreNum >= 40 ? 'mid' : 'lo'}" title="Alignment score">${scoreNum}%</span>`
        : '';
      const awarenessIdx = awarenessOrder.indexOf(a.awareness_level || '');
      const levelClass   = awarenessIdx >= 0 ? `cc-aud-level--${a.awareness_level}` : '';
      const levelText    = awarenessLabel[a.awareness_level] || 'Sin awareness';
      const dolorCount   = Array.isArray(a.dolores) ? a.dolores.length : 0;
      const deseoCount   = Array.isArray(a.deseos)  ? a.deseos.length  : 0;
      return `
      <article class="cc-aud-card" data-audience-id="${this.escapeHtml(String(a.id))}" role="button" tabindex="0" title="Editar persona">
        <div class="cc-aud-card-top">
          <h3 class="cc-aud-name">${this.escapeHtml(a.name || 'Sin nombre')}</h3>
          ${scoreBadge}
        </div>
        <span class="cc-aud-level ${levelClass}">${this.escapeHtml(levelText)}</span>
        ${(dolorCount || deseoCount) ? `
        <div class="cc-aud-card-stats">
          ${dolorCount ? `<span><i class="fas fa-bolt"></i> ${dolorCount} dolor${dolorCount !== 1 ? 'es' : ''}</span>` : ''}
          ${deseoCount ? `<span><i class="fas fa-star"></i> ${deseoCount} deseo${deseoCount !== 1 ? 's' : ''}</span>` : ''}
        </div>` : ''}
      </article>`;
    }).join('');
  }

  /* ── CAMPAÑAS (izquierda) ─────────────────────────────────────────── */
  _renderCampaigns() {
    const list  = document.getElementById('ccCampList');
    const empty = document.getElementById('ccCampEmpty');
    const count = document.getElementById('ccCampCount');
    const rows  = Array.isArray(this._campaigns) ? this._campaigns : [];
    if (count) count.textContent = String(rows.length);
    if (!list) return;

    if (!rows.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    const statusClass = { active: 'cc-badge--green', conceptual: 'cc-badge--blue', draft: 'cc-badge--gray', paused: 'cc-badge--yellow', ended: 'cc-badge--red', archived: 'cc-badge--gray' };
    const platformLabel = { meta_instagram: 'Instagram', meta_facebook: 'Facebook', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest', organic: 'Orgánico', internal: 'Interno' };
    const fmt = (v) => { if (v == null || v === '') return '—'; const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('es-ES') : String(v); };
    const fmtMoney = (v, currency) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency || 'USD'}` : null; };
    const fmtPct = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : null; };

    list.innerHTML = rows.map((c) => {
      const stBadge  = `<span class="cc-badge ${statusClass[c.status] || 'cc-badge--gray'}">${this.escapeHtml(c.status || 'draft')}</span>`;
      const platLabel = platformLabel[c.platform] || (c.platform ? c.platform.replace(/_/g, ' ') : null);
      const platBadge = platLabel ? `<span class="cc-badge cc-badge--platform">${this.escapeHtml(platLabel)}</span>` : '';

      const hasMetrics = c.cached_impressions || c.cached_clicks || c.cached_spend || c.cached_roas;
      const metricsRow = hasMetrics ? `
        <div class="cc-camp-metrics">
          ${c.cached_impressions ? `<span class="cc-kpi"><i class="fas fa-eye"></i> ${fmt(c.cached_impressions)}</span>` : ''}
          ${c.cached_clicks      ? `<span class="cc-kpi"><i class="fas fa-mouse-pointer"></i> ${fmt(c.cached_clicks)}</span>` : ''}
          ${c.cached_roas        ? `<span class="cc-kpi cc-kpi--roas"><i class="fas fa-chart-line"></i> ${fmt(c.cached_roas)}x ROAS</span>` : ''}
          ${c.cached_ctr         ? `<span class="cc-kpi">${fmtPct(c.cached_ctr) || '—'} CTR</span>` : ''}
          ${c.cached_spend       ? `<span class="cc-kpi cc-kpi--spend"><i class="fas fa-dollar-sign"></i> ${fmtMoney(c.cached_spend, c.budget_currency) || '—'}</span>` : ''}
        </div>` : '';

      const budgetStr = fmtMoney(c.budget_daily, c.budget_currency);
      const totalStr  = fmtMoney(c.budget_total, c.budget_currency);
      const budgetRow = (budgetStr || totalStr) ? `
        <div class="cc-camp-budget">
          ${budgetStr ? `<span><i class="fas fa-calendar-day"></i> ${budgetStr}/día</span>` : ''}
          ${totalStr  ? `<span><i class="fas fa-wallet"></i> ${totalStr} total</span>` : ''}
        </div>` : '';

      const cta = String(c.cta || c.platform_objective || c.descripcion_interna || '').trim();
      const ctaRow = cta ? `<p class="cc-camp-cta">${this.escapeHtml(cta.length > 80 ? cta.slice(0, 80) + '…' : cta)}</p>` : '';

      return `
      <div class="cc-camp-row">
        <div class="cc-camp-row-head">
          <span class="cc-camp-name">${this.escapeHtml(c.nombre_campana || 'Campaña')}</span>
          <div class="cc-camp-badges">${stBadge}${platBadge}</div>
        </div>
        ${ctaRow}
        ${metricsRow}
        ${budgetRow}
      </div>`;
    }).join('');
  }

  /* ── SEGMENTOS por plataforma (derecha) ───────────────────────────── */
  _renderSegments() {
    const root = document.getElementById('ccSegmentsWrap');
    if (!root) return;
    const rows = Array.isArray(this._segments) ? this._segments : [];

    if (!rows.length) {
      root.innerHTML = `<p class="cc-api-hint">No hay segmentos de audiencia definidos. Créalos o impórtalos desde Brand Storage.</p>`;
      return;
    }

    const genderMap = { male: 'Hombres', female: 'Mujeres', 1: 'Hombres', 2: 'Mujeres' };
    const platLabel = { meta: 'Meta', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest' };
    const statusClass = { active: 'cc-badge--green', draft: 'cc-badge--gray', paused: 'cc-badge--yellow', deleted: 'cc-badge--red', error: 'cc-badge--red' };
    const fmtSize = (n) => { if (!n) return null; const num = Number(n); return num >= 1e6 ? `${(num / 1e6).toFixed(1)}M` : num >= 1e3 ? `${(num / 1e3).toFixed(0)}K` : String(num); };

    /* Agrupar por plataforma */
    const byPlatform = {};
    rows.forEach((s) => {
      const p = s.platform || 'otros';
      (byPlatform[p] = byPlatform[p] || []).push(s);
    });

    root.innerHTML = Object.entries(byPlatform).map(([plat, segs]) => {
      const platName = platLabel[plat] || plat;
      const cards = segs.map((s) => {
        const age = s.age_range && typeof s.age_range === 'object'
          ? `Edades: ${s.age_range.min ?? s.age_range.age_min ?? '?'}–${s.age_range.max ?? s.age_range.age_max ?? '?'}`
          : '';
        const genders = Array.isArray(s.genders) && s.genders.length
          ? `Género: ${s.genders.map((g) => genderMap[g] || genderMap[String(g).toLowerCase()] || g).join(', ')}`
          : '';
        const interestList = Array.isArray(s.interests) ? s.interests : [];
        const interests = interestList.length
          ? `Intereses: ${interestList.map((i) => (i && (i.name || i.id || String(i)))).filter(Boolean).slice(0, 8).join(', ')}`
          : '';
        const sizeStr = fmtSize(s.estimated_size) ||
          (fmtSize(s.size_lower_bound) && fmtSize(s.size_upper_bound)
            ? `${fmtSize(s.size_lower_bound)}–${fmtSize(s.size_upper_bound)}`
            : null);
        const badge = `<span class="cc-badge ${statusClass[s.status] || 'cc-badge--gray'}">${s.status || 'draft'}</span>`;
        const synced = s.last_synced_at
          ? `<span class="cc-seg-sync">Sync: ${new Date(s.last_synced_at).toLocaleDateString('es-ES')}</span>` : '';
        return `
        <div class="cc-seg-card">
          <div class="cc-seg-card-head">
            <span class="cc-seg-name">${this.escapeHtml(s.external_audience_name || s.external_audience_type || 'Segmento')}</span>
            <div>${badge}${synced}</div>
          </div>
          ${(age || genders || interests) ? `
          <ul class="cc-api-target-list">
            ${age       ? `<li>${this.escapeHtml(age)}</li>` : ''}
            ${genders   ? `<li>${this.escapeHtml(genders)}</li>` : ''}
            ${interests ? `<li>${this.escapeHtml(interests)}</li>` : ''}
          </ul>` : ''}
          ${sizeStr ? `<div class="cc-seg-size"><i class="fas fa-users"></i> ${this.escapeHtml(sizeStr)} personas</div>` : ''}
        </div>`;
      }).join('');

      return `
      <div class="cc-api-card">
        <div class="cc-api-card-head"><span class="cc-api-card-title">${this.escapeHtml(platName)}</span></div>
        ${cards}
      </div>`;
    }).join('');
  }

  /**
   * Convierte `brand_analytics_snapshots.metrics` (JSON anidado) en pares label/value
   * para la UI. Soporta shapes reales: Facebook (page + metrics.metrics) y GA4 (overview + traffic_sources).
   */
  _snapshotTilesFromMetrics(metrics, platform) {
    const m = metrics && typeof metrics === 'object' ? metrics : {};
    const p = String(platform || m.platform || '').toLowerCase();
    const tiles = [];
    const push = (label, value) => {
      if (value === undefined || value === null || value === '') return;
      if (typeof value === 'object') return;
      const str = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
      tiles.push({ label, value: str });
    };

    if (p.includes('facebook') || p === 'meta' || p.includes('instagram')) {
      const page = m.page && typeof m.page === 'object' ? m.page : {};
      const inner = m.metrics && typeof m.metrics === 'object' ? m.metrics : {};
      push('Página', page.name);
      push('Categoría', page.category);
      push('Fans', page.total_fans);
      push('Seguidores', page.total_followers);
      push('Engagement', inner.engagement_rate);
      push('Eng. en posts', inner.post_engagements);
      push('Vistas página', inner.page_views);
      push('Nuevos seguidores', inner.new_followers);
      push('Clics CTA', inner.cta_clicks);
      push('Dejaron de seguir', inner.unfollows);
      return tiles;
    }

    if (p.includes('google_analytics') || p.includes('analytics')) {
      const ov = m.overview && typeof m.overview === 'object' ? m.overview : {};
      push('Sesiones', ov.sessions);
      push('Usuarios', ov.total_users);
      push('Páginas vistas', ov.page_views);
      push('Tasa rebote', ov.bounce_rate);
      push('Nuevos usuarios', ov.new_users);
      push('Duración media', ov.avg_session_duration);
      push('Conversiones', ov.conversions);
      const sources = Array.isArray(m.traffic_sources) ? m.traffic_sources : [];
      if (sources.length) {
        const txt = sources.slice(0, 5).map((s) => `${s.channel}: ${s.users ?? s.sessions ?? '—'}`).join(' · ');
        tiles.push({ label: 'Tráfico', value: txt });
      }
      const tops = Array.isArray(m.top_pages) ? m.top_pages : [];
      if (tops.length) {
        const line = tops.slice(0, 3).map((pg) => {
          const t = (pg.title || pg.path || '').trim();
          const short = t.length > 42 ? `${t.slice(0, 42)}…` : t;
          return `${short} (${pg.page_views ?? 0} pv)`;
        }).join(' · ');
        tiles.push({ label: 'Top páginas', value: line });
      }
      return tiles;
    }

    /* Genérico: solo primitivos en 1 nivel + objetos como conteo */
    Object.entries(m).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (typeof v === 'object' && !Array.isArray(v)) {
        const inner = Object.entries(v).filter(([, x]) => x !== null && typeof x !== 'object');
        inner.slice(0, 6).forEach(([ik, iv]) => push(`${k} · ${ik}`, iv));
      } else if (typeof v !== 'object') {
        push(k.replace(/_/g, ' '), v);
      }
    });
    return tiles.slice(0, 14);
  }

  /** Ordena por fin de período (más reciente primero). */
  _snapshotSortKey(row) {
    const t = new Date(row?.period_end || row?.computed_at || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  /**
   * Agrupa snapshots por (platform + period_type). Cada grupo queda ordenado
   * del más reciente al más viejo — evita listar 20 ventanas mensuales casi iguales.
   */
  _groupSnapshotsByPlatformPeriod(rows) {
    const sorted = [...(Array.isArray(rows) ? rows : [])].sort(
      (a, b) => this._snapshotSortKey(b) - this._snapshotSortKey(a),
    );
    const groups = new Map();
    sorted.forEach((r) => {
      const key = `${String(r.platform || '—')}||${String(r.period_type || '—')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    return groups;
  }

  /** KPIs destacados para tarjetas grandes (GA + Facebook). */
  _snapshotHeroKpis(metrics, platform) {
    const tiles = this._snapshotTilesFromMetrics(metrics, platform);
    const pick = (label) => tiles.find((t) => t.label === label);
    const p = String(platform || '').toLowerCase();
    if (p.includes('google_analytics') || p.includes('analytics')) {
      return [
        pick('Sesiones'),
        pick('Usuarios'),
        pick('Páginas vistas'),
        pick('Tasa rebote'),
      ].filter(Boolean);
    }
    if (p.includes('facebook') || p.includes('meta') || p.includes('instagram')) {
      return [
        pick('Fans'),
        pick('Seguidores'),
        pick('Engagement'),
        pick('Eng. en posts'),
      ].filter(Boolean);
    }
    return tiles.slice(0, 4);
  }

  _renderSnapshotHeroCard(s) {
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
    const plat = String(s.platform || '—');
    const platLabel = plat.includes('google') ? 'Google Analytics' : plat.includes('facebook') ? 'Facebook (página)' : plat;
    const kpis = this._snapshotHeroKpis(s.metrics, s.platform);
    const kpiHtml = kpis.length
      ? kpis.map((t) => `
        <div class="cc-dash-kpi">
          <span class="cc-dash-kpi-val">${this.escapeHtml(t.value)}</span>
          <span class="cc-dash-kpi-lbl">${this.escapeHtml(t.label)}</span>
        </div>`).join('')
      : '<p class="cc-api-hint">Sin KPIs reconocibles.</p>';

    const pLower = plat.toLowerCase();
    const metaHint = (pLower.includes('facebook') || pLower.includes('meta'))
      ? `<p class="cc-dash-hint">Métricas de <strong>página</strong>. Ceros en engagement suelen indicar que aún no hay actividad medida en el rango o falta sync de posts/ads.</p>`
      : '';

    return `
    <article class="cc-dash-card">
      <header class="cc-dash-card-head">
        <h3 class="cc-dash-card-title">${this.escapeHtml(platLabel)}</h3>
        <span class="cc-dash-card-meta">${this.escapeHtml(s.period_type || '')} · ${fmtDate(s.period_start)} → ${fmtDate(s.period_end)}</span>
      </header>
      <div class="cc-dash-kpi-grid">${kpiHtml}</div>
      ${metaHint}
    </article>`;
  }

  /* ── Dashboard analytics (dedupe + historial) ─────────────────────── */
  _renderSnapshots() {
    const root = document.getElementById('ccSnapshotsWrap');
    if (!root) return;
    const rows = Array.isArray(this._snapshots) ? this._snapshots : [];

    if (!rows.length) {
      root.innerHTML = `<p class="cc-api-hint">Sin snapshots de analytics. Se generan al sincronizar GA / Facebook para esta marca.</p>`;
      return;
    }

    const groups = this._groupSnapshotsByPlatformPeriod(rows);
    const primaries = [];
    groups.forEach((arr) => {
      if (arr[0]) primaries.push(arr[0]);
    });
    primaries.sort((a, b) => {
      const order = (p) => {
        const x = String(p.platform || '').toLowerCase();
        if (x.includes('google_analytics') || x.includes('analytics')) return 0;
        if (x.includes('facebook') || x.includes('meta')) return 1;
        return 2;
      };
      const oa = order(a);
      const ob = order(b);
      if (oa !== ob) return oa - ob;
      return this._snapshotSortKey(b) - this._snapshotSortKey(a);
    });

    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '');
    const historyRows = [];
    groups.forEach((arr) => {
      arr.slice(1).forEach((r) => historyRows.push(r));
    });
    historyRows.sort((a, b) => this._snapshotSortKey(b) - this._snapshotSortKey(a));
    const historyTrim = historyRows.slice(0, 24);

    const heroHtml = `<div class="cc-dash-heroes">${primaries.map((s) => this._renderSnapshotHeroCard(s)).join('')}</div>`;

    const dupNote = rows.length > primaries.length
      ? `<p class="cc-dash-dup-note"><i class="fas fa-info-circle"></i> Se ocultaron <strong>${rows.length - primaries.length}</strong> filas duplicadas (misma plataforma y tipo de período; se muestra solo el snapshot más reciente arriba).</p>`
      : '';

    const fmtDt = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
    const histBody = historyTrim.length
      ? `<table class="cc-dash-hist-table">
          <thead><tr><th>Plataforma</th><th>Tipo</th><th>Ventana</th><th>Calculado</th></tr></thead>
          <tbody>
            ${historyTrim.map((r) => `
            <tr>
              <td>${this.escapeHtml(r.platform || '—')}</td>
              <td>${this.escapeHtml(r.period_type || '—')}</td>
              <td>${this.escapeHtml(fmtDate(r.period_start))} → ${this.escapeHtml(fmtDate(r.period_end))}</td>
              <td class="cc-dash-hist-muted">${this.escapeHtml(fmtDt(r.computed_at))}</td>
            </tr>`).join('')}
          </tbody>
        </table>`
      : '<p class="cc-api-hint">No hay períodos anteriores agrupados.</p>';

    const historyHtml = `
    <details class="cc-dash-history">
      <summary>Historial de snapshots <span class="cc-dash-history-count">(${historyTrim.length})</span></summary>
      ${histBody}
    </details>`;

    root.innerHTML = `${dupNote}${heroHtml}${historyHtml}`;
  }

  /* ── HEATMAP (derecha) ────────────────────────────────────────────── */
  _renderHeatmap() {
    const root = document.getElementById('ccHeatmapWrap');
    if (!root) return;
    const rows = Array.isArray(this._heatmaps) ? this._heatmaps : [];

    if (!rows.length) {
      const snapN = Array.isArray(this._snapshots) ? this._snapshots.length : 0;
      root.innerHTML = snapN
        ? `<p class="cc-api-hint">No hay filas en <code>brand_audience_heatmap</code> para esta marca (0). Arriba sí tienes <strong>${snapN}</strong> snapshot(s) en <code>brand_analytics_snapshots</code>. El heatmap se escribe al flujo de sync Meta / análisis de posts (p. ej. <code>api-brand-sync-meta</code>), no al mismo job que los snapshots.</p>`
        : `<p class="cc-api-hint">Sin datos de heatmap. Se rellenan al sincronizar Meta o analizar publicaciones del contenedor.</p>`;
      return;
    }

    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    root.innerHTML = rows.map((h) => {
      const bestHour = h.best_hour != null ? `${String(h.best_hour).padStart(2, '0')}:00` : '—';
      const bestDay  = h.best_day  != null ? (days[h.best_day] || h.best_day)            : '—';

      const hourEng = h.hour_engagement && typeof h.hour_engagement === 'object' ? h.hour_engagement : {};
      const engNums = Object.values(hourEng).map(Number).filter(Number.isFinite);
      const maxEng  = engNums.length ? Math.max(...engNums) : 1;
      const bars    = Object.entries(hourEng).sort(([a], [b]) => Number(a) - Number(b)).map(([hr, val]) => {
        const pct = Math.round((Number(val) / maxEng) * 100);
        const active = Number(hr) === h.best_hour ? ' cc-heat-bar--best' : '';
        return `<div class="cc-heat-bar${active}" style="height:${pct}%" title="${String(hr).padStart(2,'0')}:00 — ${Number(val).toLocaleString('es-ES')}"></div>`;
      }).join('');

      return `
      <div class="cc-heat-card">
        <div class="cc-heat-head">
          <span class="cc-api-card-title">${this.escapeHtml(h.platform || 'Plataforma')}</span>
          <span class="cc-heat-best"><i class="fas fa-clock"></i> ${bestDay} ${bestHour}</span>
        </div>
        ${bars ? `<div class="cc-heat-chart" aria-label="Engagement por hora">${bars}</div>` : ''}
      </div>`;
    }).join('');
  }

  /* ── INTEGRACIONES: estado de sync ───────────────────────────────── */
  _renderIntegrations() {
    const root = document.getElementById('ccIntegrationsWrap');
    if (!root) return;
    const rows = Array.isArray(this._integrations) ? this._integrations : [];

    if (!rows.length) {
      root.innerHTML = `<p class="cc-api-hint">Sin integraciones. Conéctalas en Brand Storage.</p>`;
      return;
    }

    const fmtSync = (d) => {
      if (!d) return 'Nunca';
      const diff = Date.now() - new Date(d).getTime();
      const m = Math.round(diff / 60000);
      if (m < 60)  return `hace ${m} min`;
      const h = Math.round(m / 60);
      if (h < 24)  return `hace ${h}h`;
      return `hace ${Math.round(h / 24)}d`;
    };

    root.innerHTML = `
    <div class="cc-integrations-list">
      ${rows.map((i) => `
      <div class="cc-intg-row">
        <span class="cc-intg-dot ${i.is_active ? 'cc-intg-dot--on' : 'cc-intg-dot--off'}"></span>
        <span class="cc-intg-name">${this.escapeHtml(i.external_account_name || i.platform || '—')}</span>
        <span class="cc-intg-platform">${this.escapeHtml(i.platform || '')}</span>
        <span class="cc-intg-sync">${fmtSync(i.last_sync_at)}</span>
      </div>`).join('')}
    </div>`;
  }

  /* ── MODAL: abrir / cerrar / guardar ─────────────────────────────── */
  _setupEventListeners() {
    const carousel     = document.getElementById('ccAudCarousel');
    const backdrop     = document.getElementById('ccAudienceModalBackdrop');
    const closeBtn     = document.getElementById('ccAudienceModalClose');
    const cancelBtn    = document.getElementById('ccAudienceCancelBtn');
    const form         = document.getElementById('ccAudienceForm');

    if (carousel) {
      carousel.addEventListener('click', (ev) => {
        const card = ev.target.closest('.cc-aud-card[data-audience-id]');
        if (card) this._openAudienceModal(card.getAttribute('data-audience-id'));
      });
      carousel.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const card = ev.target.closest('.cc-aud-card[data-audience-id]');
        if (!card) return;
        ev.preventDefault();
        this._openAudienceModal(card.getAttribute('data-audience-id'));
      });
    }
    if (closeBtn)  closeBtn.onclick  = () => this._closeAudienceModal();
    if (cancelBtn) cancelBtn.onclick = () => this._closeAudienceModal();
    if (backdrop)  backdrop.onclick  = (ev) => { if (ev.target === backdrop) this._closeAudienceModal(); };
    if (form)      form.addEventListener('submit', async (ev) => { ev.preventDefault(); await this._saveAudienceFromModal(); });
  }

  _openAudienceModal(audienceId) {
    const row = this._audiences.find((a) => String(a.id) === String(audienceId));
    if (!row) return;
    this._editingAudience = row;
    const $ = (id) => document.getElementById(id);
    const toLines = (arr) => (Array.isArray(arr) ? arr.join('\n') : '');

    if ($('ccAudFormName'))        $('ccAudFormName').value        = row.name || '';
    if ($('ccAudFormAwareness'))   $('ccAudFormAwareness').value   = row.awareness_level || '';
    if ($('ccAudFormDescription')) $('ccAudFormDescription').value = row.description || '';
    if ($('ccAudFormPains'))       $('ccAudFormPains').value       = toLines(row.dolores);
    if ($('ccAudFormDesires'))     $('ccAudFormDesires').value     = toLines(row.deseos);
    if ($('ccAudFormObjeciones'))  $('ccAudFormObjeciones').value  = toLines(row.objeciones);
    if ($('ccAudFormGatillos'))    $('ccAudFormGatillos').value    = toLines(row.gatillos_compra);

    const backdrop = $('ccAudienceModalBackdrop');
    if (backdrop) backdrop.style.display = 'flex';
    setTimeout(() => $('ccAudFormName')?.focus(), 0);
  }

  _closeAudienceModal() {
    this._editingAudience = null;
    const backdrop = document.getElementById('ccAudienceModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
  }

  async _saveAudienceFromModal() {
    if (!this._supabase || !this._editingAudience?.id) return;
    const $ = (id) => document.getElementById(id);
    const saveBtn = $('ccAudienceSaveBtn');
    const toArr   = (raw) => String(raw || '').split('\n').map((v) => v.trim()).filter(Boolean);

    const name       = $('ccAudFormName')?.value?.trim() || '';
    const awareness  = $('ccAudFormAwareness')?.value || null;
    const description = $('ccAudFormDescription')?.value?.trim() || null;
    const dolores     = toArr($('ccAudFormPains')?.value);
    const deseos      = toArr($('ccAudFormDesires')?.value);
    const objeciones  = toArr($('ccAudFormObjeciones')?.value);
    const gatillos_compra = toArr($('ccAudFormGatillos')?.value);

    if (!name) { window.alert('El nombre es obligatorio.'); return; }
    if (saveBtn) saveBtn.disabled = true;

    try {
      const payload = {
        name, awareness_level: awareness || null, description,
        dolores, deseos, objeciones, gatillos_compra,
        updated_at: new Date().toISOString(),
      };
      const { error } = await this._supabase
        .from('audience_personas')
        .update(payload)
        .eq('id', this._editingAudience.id);
      if (error) throw error;

      const idx = this._audiences.findIndex((a) => String(a.id) === String(this._editingAudience.id));
      if (idx >= 0) this._audiences[idx] = { ...this._audiences[idx], ...payload };

      this._renderAudiencesCarousel();
      this._closeAudienceModal();
    } catch (e) {
      console.error('CommandCenterView save persona:', e);
      window.alert(e?.message || 'No se pudo guardar la persona.');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  /* ── Error state ──────────────────────────────────────────────────── */
  _setError(msg) {
    const twoCol  = document.getElementById('ccTwoCol');
    const carousel = document.getElementById('ccAudCarousel');
    const empty   = document.getElementById('ccAudEmpty');
    const count   = document.getElementById('ccAudCount');
    if (twoCol)   twoCol.style.display = 'none';
    if (carousel) carousel.innerHTML   = '';
    if (count)    count.textContent    = '0';
    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>${this.escapeHtml(msg)}</p>`;
    }
  }
}

window.CommandCenterView = CommandCenterView;
