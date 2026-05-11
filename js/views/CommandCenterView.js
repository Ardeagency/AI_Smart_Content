/**
 * CommandCenterView — v5
 * Centro de control: enfoque de mercado (no historial ni segmentación fina).
 * - Personas conceptuales + campañas con persona_id
 * - Última lectura por canal (snapshots dedupe; API por RLS)
 * - Conexiones existentes: integraciones + segmentos con vínculo a persona
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
    this._snapshots       = [];   // brand_analytics_snapshots (vía API)
    this._integrations    = [];   // brand_integrations (sync status)
    this._pendingActions  = [];   // vera_pending_actions (status='pending')
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

  <!-- OPTIMIZACIÓN: comentarios de Vera. Sección oculta hasta que haya comentarios reales -->
  <section class="cc-section cc-section--optim" id="ccOptimSection" style="display:none;" aria-label="Optimización propuesta por Vera">
    <div class="cc-optim-bg" aria-hidden="true">
      <div class="cc-optim-gradient"></div>
    </div>
    <div class="cc-optim-body">
      <div class="cc-section-head">
        <div class="cc-section-head-main">
          <h2 class="cc-section-title">Optimización</h2>
          <p class="cc-section-lede">Lecturas y recomendaciones de Vera sobre tus campañas y audiencia real. Aprueba para que se materialice en el próximo plan.</p>
        </div>
        <div class="cc-optim-count-wrap" aria-live="polite" aria-atomic="true">
          <span class="cc-optim-count-num" id="ccVeraInboxCount" aria-label="Total de comentarios">0</span>
          <span class="cc-optim-count-label" id="ccVeraInboxLabel">comentarios</span>
        </div>
      </div>
      <div class="cc-optim-list" id="ccVeraInboxList"></div>
    </div>
  </section>

  <!-- LAYOUT ENTORNO: mapa LEFT (flex 1) + sidebar derecho 380px ────── -->
  <div class="cc-entorno-layout" id="ccTwoCol" style="display:none;">

    <!-- IZQUIERDA: Mapa con overlays (controles, leyenda, filtro) ───── -->
    <div class="cc-entorno-map">
      <!-- Loading overlay -->
      <div class="cc-entorno-loading" id="ccEntornoLoading" style="display:none;">
        <div class="cc-entorno-spinner"></div>
        <div class="cc-entorno-loading-text">Cargando lectura del mercado…</div>
      </div>

      <!-- Bottom-left panel: Campañas reales + tráfico generado por cada una -->
      <div class="cc-entorno-bl-panel" id="ccEntornoBlPanel" style="display:none;">
        <div class="cc-entorno-bl-head">
          <span class="cc-entorno-bl-title">Campañas reales</span>
          <span class="cc-entorno-bl-count" id="ccEntornoBlCount">0</span>
        </div>
        <div class="cc-entorno-bl-list" id="ccEntornoBlList"></div>
        <div class="cc-entorno-bl-empty" id="ccEntornoBlEmpty" style="display:none;">
          Sin campañas en integraciones conectadas todavía.
        </div>
      </div>

      <!-- Choropleth canvas container -->
      <div class="cc-entorno-map-canvas" id="ccAudienceMap"></div>
    </div>

    <!-- DERECHA: Sidebar (breadcrumb + secciones scrollable) ────────── -->
    <aside class="cc-entorno-sidebar">
      <!-- Breadcrumb -->
      <div class="cc-entorno-breadcrumb">
        <span class="cc-entorno-bc-item">Panel</span>
        <i class="fas fa-chevron-right cc-entorno-bc-sep"></i>
        <span class="cc-entorno-bc-item cc-entorno-bc-current" id="ccEntornoBcCurrent">Lectura del mercado</span>
        <button class="cc-entorno-bc-expand" id="ccEntornoExpand" title="Expandir" aria-label="Expandir">
          <i class="fas fa-up-right-and-down-left-from-center"></i>
        </button>
      </div>

      <!-- ENTORNO GLOBAL -->
      <section class="cc-entorno-section">
        <h3 class="cc-entorno-section-title">Entorno Global</h3>
        <div class="cc-entorno-kpi-grid">
          <div class="cc-entorno-kpi">
            <div class="cc-entorno-kpi-value" id="ccKpiCountries">—</div>
            <div class="cc-entorno-kpi-label">Países activos</div>
          </div>
          <div class="cc-entorno-kpi">
            <div class="cc-entorno-kpi-value" id="ccKpiAudiences">—</div>
            <div class="cc-entorno-kpi-label">Audiencias</div>
          </div>
          <div class="cc-entorno-kpi">
            <div class="cc-entorno-kpi-value" id="ccKpiCampaigns">—</div>
            <div class="cc-entorno-kpi-label">Campañas</div>
          </div>
          <div class="cc-entorno-kpi">
            <div class="cc-entorno-kpi-value" id="ccKpiPersonas">—</div>
            <div class="cc-entorno-kpi-label">Personas</div>
          </div>
          <div class="cc-entorno-kpi">
            <div class="cc-entorno-kpi-value" id="ccKpiIntegrations">—</div>
            <div class="cc-entorno-kpi-label">Integraciones</div>
          </div>
          <div class="cc-entorno-kpi">
            <div class="cc-entorno-kpi-value" id="ccKpiPending">—</div>
            <div class="cc-entorno-kpi-label">Pendientes Vera</div>
          </div>
        </div>
        <div class="cc-entorno-kpi cc-entorno-kpi--wide">
          <div class="cc-entorno-kpi-value" id="ccKpiActive">—</div>
          <div class="cc-entorno-kpi-label">Audiencia activa (últimos 30 días)</div>
        </div>
      </section>

      <!-- ENTORNO ESTRATÉGICO -->
      <section class="cc-entorno-section">
        <h3 class="cc-entorno-section-title">Entorno Estratégico</h3>

        <!-- País destacado -->
        <div class="cc-entorno-subsection">
          <h4 class="cc-entorno-subsection-title">País destacado</h4>
          <div class="cc-entorno-featured" id="ccFeaturedCountry">
            <div class="cc-entorno-featured-header">
              <div class="cc-entorno-featured-avatar" id="ccFeaturedFlag">🌐</div>
              <div class="cc-entorno-featured-info">
                <h5 id="ccFeaturedName">Sin datos</h5>
                <p id="ccFeaturedSub">Conecta una integración para ver tu mercado real</p>
              </div>
            </div>
            <div class="cc-entorno-featured-stats">
              <div class="cc-entorno-featured-stat">
                <div class="cc-entorno-featured-stat-value" id="ccFeaturedShare">—</div>
                <div class="cc-entorno-featured-stat-label">% audiencia</div>
              </div>
              <div class="cc-entorno-featured-stat">
                <div class="cc-entorno-featured-stat-value" id="ccFeaturedAge">—</div>
                <div class="cc-entorno-featured-stat-label">Edad top</div>
              </div>
              <div class="cc-entorno-featured-stat">
                <div class="cc-entorno-featured-stat-value" id="ccFeaturedGender">—</div>
                <div class="cc-entorno-featured-stat-label">Género top</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Audiencias conceptuales -->
        <div class="cc-entorno-subsection">
          <div class="cc-entorno-subsection-head">
            <h4 class="cc-entorno-subsection-title">Audiencias conceptuales</h4>
            <span class="cc-entorno-subsection-count" id="ccAudCount">0</span>
          </div>
          <div class="cc-carousel-wrap">
            <div class="cc-carousel" id="ccAudCarousel">
              <div class="cc-loading"><span></span><span></span><span></span></div>
            </div>
          </div>
          <div class="cc-empty cc-empty--compact" id="ccAudEmpty" style="display:none;">
            <i class="fas fa-users-slash"></i>
            <span>Sin personas</span>
          </div>
        </div>

        <!-- Comparación demográfica (género + edad) -->
        <div class="cc-entorno-subsection">
          <h4 class="cc-entorno-subsection-title">Comparación demográfica</h4>
          <div class="cc-map-breakdowns" id="ccAudienceBreakdowns"></div>
        </div>
      </section>
    </aside>
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
          .select('id, nombre_campana, descripcion_interna, persona_id, cta, cta_url, platform, platform_objective, status, budget_daily, budget_total, budget_currency, starts_at, ends_at, cached_impressions, cached_clicks, cached_spend, cached_conversions, cached_roas, cached_ctr, last_synced_at, source, updated_at, created_at, match_scores, real_demographics')
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
      this._snapshots = [];
    }

    const sh = await this._fetchSnapshotsHeatmapViaApi(bid);
    this._snapshots = Array.isArray(sh?.snapshots) ? sh.snapshots : [];

    // Bandeja de Vera: pending_actions sin resolver para esta marca
    this._pendingActions = await this._fetchPendingActions(bid);

    document.getElementById('ccTwoCol')?.style && (document.getElementById('ccTwoCol').style.display = '');

    this._renderVeraInbox();
    this._renderAudiencesCarousel();
    this._renderCampaigns();
    this._renderAudienceMap();
    this._renderEntornoKpis();
    this._renderFeaturedCountry();
    // Fuentes conectadas removido de esta vista: foco solo en la lectura más reciente.
    this.updateLinksForRouter();
  }

  /* ── Vera Inbox: pending_actions ──────────────────────────────────────── */
  async _fetchPendingActions(brandContainerId) {
    if (!brandContainerId || !this._supabase) return [];
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return [];
      const qs = new URLSearchParams({ brand_container_id: String(brandContainerId), status: 'pending' });
      const res = await fetch(`/api/vera/pending-actions?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.actions) ? json.actions : [];
    } catch (e) {
      console.warn('CommandCenterView: fetchPendingActions:', e?.message);
      return [];
    }
  }

  /* ── OPTIMIZACIÓN — comentarios de Vera ──────────────────────────── */
  _renderVeraInbox() {
    const section = document.getElementById('ccOptimSection');
    const list    = document.getElementById('ccVeraInboxList');
    const count   = document.getElementById('ccVeraInboxCount');
    const label   = document.getElementById('ccVeraInboxLabel');
    const empty   = document.getElementById('ccOptimEmpty');
    if (!list) return;

    // Filtrar placeholders/stubs: cualquier acción marcada como tal o con un
    // reasoning que indique "bootstrap stub" no es análisis real y no debe
    // ensuciar la bandeja de Optimización.
    const rawActions = Array.isArray(this._pendingActions) ? this._pendingActions : [];
    const actions = rawActions.filter((a) => {
      if (a?.proposed_payload?.placeholder === true) return false;
      if (typeof a?.vera_reasoning === 'string' && /bootstrap\s*stub/i.test(a.vera_reasoning)) return false;
      return true;
    });

    // Si no hay comentarios reales, ocultar la sección entera (no mostrar
    // header con "0 comentarios" — ruido visual sin valor).
    if (actions.length === 0) {
      if (section) section.style.display = 'none';
      list.innerHTML = '';
      if (empty) empty.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';

    if (count) count.textContent = String(actions.length);
    if (label) label.textContent = actions.length === 1 ? 'comentario' : 'comentarios';
    if (empty) empty.style.display = 'none';

    const personaNameById = this._personaNameById();
    const fmtPct = (n) => Number.isFinite(Number(n)) ? `${Math.round(Number(n) * 100)}%` : '—';
    const labelByType = {
      link_campaign_to_persona:    'Vincular campaña a persona',
      link_segment_to_persona:     'Vincular audiencia a persona',
      update_persona:              'Actualizar persona',
      create_audience:             'Crear nueva audiencia',
      update_audience:             'Actualizar audiencia',
      update_brand_container:      'Actualizar marca',
      strategic_recommendation_for_campaign: 'Recomendación estratégica',
      update_shopify_product_seo:  'Optimizar SEO de producto',
    };

    list.innerHTML = actions.map((a) => {
      const summary = a.proposed_payload?.summary || a.vera_reasoning || '';
      const typeLabel = labelByType[a.action_type] || a.action_type;
      const personaTarget = a.proposed_payload?.persona_id ? (personaNameById[String(a.proposed_payload.persona_id)] || '') : '';
      const reasoningRow = a.vera_reasoning && summary !== a.vera_reasoning
        ? `<p class="cc-vera-inbox-reason">${this.escapeHtml(a.vera_reasoning.slice(0, 200))}</p>`
        : '';
      const conf = Number.isFinite(Number(a.vera_confidence)) ? fmtPct(a.vera_confidence) : null;
      const confBadge = conf ? `<span class="cc-vera-inbox-conf" title="Confianza de Vera">${conf}</span>` : '';
      const personaRow = personaTarget ? `<span class="cc-vera-inbox-meta"><i class="fas fa-user"></i> ${this.escapeHtml(personaTarget)}</span>` : '';
      return `
      <article class="cc-vera-inbox-card" data-action-id="${a.id}">
        <div class="cc-vera-inbox-card-head">
          <span class="cc-vera-inbox-card-type">${this.escapeHtml(typeLabel)}</span>
          ${confBadge}
        </div>
        ${summary ? `<p class="cc-vera-inbox-summary">${this.escapeHtml(summary)}</p>` : ''}
        ${reasoningRow}
        ${personaRow}
        <div class="cc-vera-inbox-actions">
          <button type="button" class="btn btn-sm btn-primary cc-vera-inbox-btn-approve" data-id="${a.id}">
            <i class="fas fa-check"></i> Aprobar
          </button>
          <button type="button" class="btn btn-sm btn-secondary cc-vera-inbox-btn-reject" data-id="${a.id}">
            <i class="fas fa-times"></i> Descartar
          </button>
        </div>
      </article>`;
    }).join('');

    // Listeners
    list.querySelectorAll('.cc-vera-inbox-btn-approve').forEach((btn) => {
      btn.addEventListener('click', (e) => this._approvePendingAction(e.currentTarget.dataset.id));
    });
    list.querySelectorAll('.cc-vera-inbox-btn-reject').forEach((btn) => {
      btn.addEventListener('click', (e) => this._rejectPendingAction(e.currentTarget.dataset.id));
    });
  }

  async _approvePendingAction(actionId) {
    if (!actionId) return;
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/vera/pending-actions/${actionId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        alert(`No se pudo aprobar: ${err.slice(0, 120)}`);
        return;
      }
      // Quitar localmente y re-renderizar
      this._pendingActions = this._pendingActions.filter((a) => a.id !== actionId);
      this._renderVeraInbox();
    } catch (e) {
      console.error('approve action:', e);
    }
  }

  async _rejectPendingAction(actionId) {
    if (!actionId) return;
    const reason = window.prompt('¿Por qué descartas esta sugerencia? (opcional)') || '';
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/vera/pending-actions/${actionId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        alert(`No se pudo descartar: ${err.slice(0, 120)}`);
        return;
      }
      this._pendingActions = this._pendingActions.filter((a) => a.id !== actionId);
      this._renderVeraInbox();
    } catch (e) {
      console.error('reject action:', e);
    }
  }

  /* ── Manual link inline (entity → persona) ────────────────────────── */
  async _linkEntityToPersona({ entityType, entityId, personaId }) {
    if (!entityType || !entityId) return false;
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return false;
      const res = await fetch('/api/integrations/link', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, persona_id: personaId || null }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        alert(`No se pudo vincular: ${err.slice(0, 200)}`);
        return false;
      }
      // Refrescar la fila localmente y re-render
      const list = entityType === 'campaign' ? this._campaigns : this._segments;
      const row = list.find((x) => x.id === entityId);
      if (row) row.persona_id = personaId || null;
      if (entityType === 'campaign') this._renderCampaigns();
      else this._renderSegments();
      return true;
    } catch (e) {
      console.error('link entity:', e);
      return false;
    }
  }

  _personaPickerHTML(currentPersonaId, entityType, entityId) {
    const personas = Array.isArray(this._audiences) ? this._audiences : [];
    const opts = personas.map((p) => `<option value="${p.id}" ${currentPersonaId === p.id ? 'selected' : ''}>${this.escapeHtml(p.name || 'Persona')}</option>`).join('');
    return `
      <select class="cc-link-picker" data-entity-type="${entityType}" data-entity-id="${entityId}" aria-label="Vincular a persona">
        <option value="">— Sin vincular —</option>
        ${opts}
      </select>`;
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

  /** Mapa id → nombre de persona (para enlazar campañas y segmentos). */
  _personaNameById() {
    const m = {};
    (this._audiences || []).forEach((p) => {
      if (p?.id) m[String(p.id)] = String(p.name || '').trim() || 'Persona';
    });
    return m;
  }

  /* ── CAMPAÑAS (izquierda) ─────────────────────────────────────────── */
  _renderCampaigns() {
    const list  = document.getElementById('ccCampList');
    const empty = document.getElementById('ccCampEmpty');
    const count = document.getElementById('ccCampCount');
    const rows  = Array.isArray(this._campaigns) ? this._campaigns : [];
    const personaById = this._personaNameById();
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
      const pName = c.persona_id ? personaById[String(c.persona_id)] : '';
      const personaRow = `
        <div class="cc-camp-persona ${pName ? '' : 'cc-camp-persona--missing'}">
          <i class="fas ${pName ? 'fa-user-circle' : 'fa-unlink'}" aria-hidden="true"></i>
          <span class="cc-camp-persona-label">${pName ? 'Mercado objetivo:' : 'Sin persona vinculada — la IA no puede cerrar el circuito.'}</span>
          ${this._personaPickerHTML(c.persona_id || '', 'campaign', c.id)}
        </div>`;

      // MatchBars: solo si hay persona linkada y match_scores tiene contenido evaluable
      const ms = c.match_scores || {};
      const hasMatch = pName && (ms.age != null || ms.gender != null || ms.geo != null);
      const matchBars = hasMatch && window.MatchBars
        ? `<div class="cc-camp-match">${window.MatchBars.render(ms)}</div>`
        : '';

      return `
      <div class="cc-camp-row">
        <div class="cc-camp-row-head">
          <span class="cc-camp-name">${this.escapeHtml(c.nombre_campana || 'Campaña')}</span>
          <div class="cc-camp-badges">${stBadge}${platBadge}</div>
        </div>
        ${personaRow}
        ${matchBars}
        ${ctaRow}
        ${metricsRow}
        ${budgetRow}
      </div>`;
    }).join('');
  }

  /* ── ENTORNO GLOBAL · KPI grid ───────────────────────────────────── */
  _renderEntornoKpis() {
    const audiences    = Array.isArray(this._audiences) ? this._audiences : [];
    const campaigns    = Array.isArray(this._campaigns) ? this._campaigns : [];
    const integrations = Array.isArray(this._integrations) ? this._integrations.filter(i => i.is_active) : [];
    const pending      = Array.isArray(this._pendingActions) ? this._pendingActions.filter(a => !a?.proposed_payload?.placeholder) : [];

    // Países activos: contar países con data agregada (campañas + personas)
    const countrySet = new Set();
    for (const c of campaigns) {
      const cc = c?.real_demographics?.country;
      if (!cc) continue;
      for (const [k, v] of Object.entries(cc)) {
        const imp = Number(v?.impressions) || 0;
        if (imp > 0 && /^[A-Z]{2}$/.test(k)) countrySet.add(k);
      }
    }
    for (const p of audiences) {
      const cc = p?.real_location_distribution?.countries;
      if (!cc) continue;
      for (const [k, v] of Object.entries(cc)) {
        if (k.startsWith('_')) continue;
        if (/^[A-Z]{2}$/.test(k) && Number(v) > 0) countrySet.add(k);
      }
    }

    // Activos últimos 30d = campañas con last_synced_at < 30d O snapshots recientes
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activeCount = campaigns.filter(c => {
      const t = c.last_synced_at ? Date.parse(c.last_synced_at) : NaN;
      return Number.isFinite(t) && t > cutoff;
    }).length;

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const fmt = (n) => Number.isFinite(n) ? n.toLocaleString('es') : '—';

    setText('ccKpiCountries',    fmt(countrySet.size));
    setText('ccKpiAudiences',    fmt(Array.isArray(this._segments) ? this._segments.length : 0));
    setText('ccKpiCampaigns',    fmt(campaigns.length));
    setText('ccKpiPersonas',     fmt(audiences.length));
    setText('ccKpiIntegrations', fmt(integrations.length));
    setText('ccKpiPending',      fmt(pending.length));
    setText('ccKpiActive',       activeCount > 0 ? `${fmt(activeCount)} campañas` : 'Sin actividad reciente');
  }

  /* ── ENTORNO ESTRATÉGICO · País destacado ─────────────────────────── */
  _renderFeaturedCountry() {
    const FLAG = (iso2) => {
      if (!iso2 || iso2.length !== 2) return '🌐';
      const cp = (c) => 0x1F1E6 + c.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      try { return String.fromCodePoint(cp(iso2[0]), cp(iso2[1])); } catch { return '🌐'; }
    };
    const COUNTRY_NAMES = {
      MX: 'México', CO: 'Colombia', US: 'Estados Unidos', AR: 'Argentina', PE: 'Perú',
      CL: 'Chile', EC: 'Ecuador', VE: 'Venezuela', ES: 'España', BR: 'Brasil',
      CA: 'Canadá', FR: 'Francia', DE: 'Alemania', IT: 'Italia', GB: 'Reino Unido',
      PT: 'Portugal', JP: 'Japón', CN: 'China', IN: 'India', AU: 'Australia',
    };

    // Agregar país top desde personas (campañas paused tienen 0 data)
    const countryAgg = {};
    for (const p of (this._audiences || [])) {
      const cc = p?.real_location_distribution?.countries;
      if (!cc) continue;
      for (const [k, v] of Object.entries(cc)) {
        if (k.startsWith('_')) continue;
        if (!/^[A-Z]{2}$/.test(k)) continue;
        countryAgg[k] = (countryAgg[k] || 0) + (Number(v) || 0);
      }
    }
    const total = Object.values(countryAgg).reduce((s, v) => s + v, 0);
    const top = Object.entries(countryAgg).sort((a, b) => b[1] - a[1])[0];

    if (!top || total === 0) return; // mantiene placeholder "Sin datos"

    // Inferir top age + gender de personas con location de ese país
    const ageAgg = {}, genderAgg = {};
    for (const p of (this._audiences || [])) {
      const cc = p?.real_location_distribution?.countries || {};
      if (!Object.keys(cc).includes(top[0])) continue;
      for (const [k, v] of Object.entries(p?.real_age_distribution || {})) {
        if (k.startsWith('_')) continue;
        ageAgg[k] = (ageAgg[k] || 0) + (Number(v) || 0);
      }
      for (const [k, v] of Object.entries(p?.real_gender_distribution || {})) {
        if (k.startsWith('_') || k === 'unknown') continue;
        genderAgg[k] = (genderAgg[k] || 0) + (Number(v) || 0);
      }
    }
    const topAge    = Object.entries(ageAgg).sort((a, b) => b[1] - a[1])[0];
    const topGender = Object.entries(genderAgg).sort((a, b) => b[1] - a[1])[0];

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('ccFeaturedFlag',   FLAG(top[0]));
    setText('ccFeaturedName',   COUNTRY_NAMES[top[0]] || top[0]);
    setText('ccFeaturedSub',    'País con mayor presencia en tu audiencia real');
    setText('ccFeaturedShare',  `${Math.round((top[1] / total) * 100)}%`);
    setText('ccFeaturedAge',    topAge ? topAge[0] : '—');
    setText('ccFeaturedGender', topGender ? (topGender[0] === 'male' ? 'Hombres' : topGender[0] === 'female' ? 'Mujeres' : topGender[0]) : '—');
  }

  /* ── Panel bottom-left del mapa: campañas reales + tráfico generado ──── */
  _renderRealCampaignsPanel() {
    const root  = document.getElementById('ccEntornoBlPanel');
    const list  = document.getElementById('ccEntornoBlList');
    const count = document.getElementById('ccEntornoBlCount');
    const empty = document.getElementById('ccEntornoBlEmpty');
    if (!root || !list) return;

    // "Reales" = campañas pulled de integraciones (tienen external_campaign_id)
    // de cualquier plataforma — Meta, TikTok, X, Google Ads, etc. cuando existan
    const camps = (Array.isArray(this._campaigns) ? this._campaigns : [])
      .filter(c => c && c.external_campaign_id);

    if (count) count.textContent = String(camps.length);
    root.style.display = '';

    if (camps.length === 0) {
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    // Mapeo plataforma → label corto + clase de color
    const platLabel = {
      meta_facebook:  { code: 'FB',  klass: 'meta' },
      meta_instagram: { code: 'IG',  klass: 'meta' },
      google_ads:     { code: 'GA',  klass: 'google' },
      tiktok_ads:     { code: 'TT',  klass: 'tiktok' },
      linkedin_ads:   { code: 'LI',  klass: 'linkedin' },
      pinterest_ads:  { code: 'PT',  klass: 'pinterest' },
      twitter_ads:    { code: 'X',   klass: 'twitter' },
      organic:        { code: '∼',   klass: 'organic' },
      internal:       { code: 'IN',  klass: 'internal' },
    };

    const statusClass = { active: 'on', paused: 'mute', draft: 'mute', ended: 'mute', archived: 'mute' };
    const fmtNum = (n) => {
      const x = Number(n);
      if (!Number.isFinite(x) || x === 0) return null;
      if (x >= 1_000_000) return `${(x/1_000_000).toFixed(1)}M`;
      if (x >= 1_000)     return `${(x/1_000).toFixed(1)}K`;
      return String(Math.round(x));
    };
    const FLAG = (iso2) => {
      if (!iso2 || iso2.length !== 2) return '';
      try { const cp = (c) => 0x1F1E6 + c.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0); return String.fromCodePoint(cp(iso2[0]), cp(iso2[1])); } catch { return ''; }
    };

    // Ordenar: activas primero, luego por impressions desc
    const sorted = [...camps].sort((a, b) => {
      const ar = (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1);
      if (ar !== 0) return ar;
      return (Number(b.cached_impressions) || 0) - (Number(a.cached_impressions) || 0);
    });

    list.innerHTML = sorted.slice(0, 20).map((c) => {
      const pl = platLabel[c.platform] || { code: (c.platform || '?').slice(0, 2).toUpperCase(), klass: 'other' };
      const sCls = statusClass[c.status] || 'mute';
      const imp = fmtNum(c.cached_impressions);
      // Top país y top edad de real_demographics si existe
      const rd = c.real_demographics || {};
      const countries = rd.country || {};
      const topCountry = Object.entries(countries)
        .filter(([k]) => /^[A-Z]{2}$/.test(k))
        .sort((a, b) => (Number(b[1]?.impressions) || 0) - (Number(a[1]?.impressions) || 0))[0];
      const topCountryCode = topCountry?.[0] || null;
      const ages = rd.age || {};
      const topAge = Object.entries(ages).sort((a, b) => (Number(b[1]?.impressions) || 0) - (Number(a[1]?.impressions) || 0))[0]?.[0] || null;

      const trafficBits = [
        imp ? `<span class="cc-bl-traffic-bit"><i class="fas fa-eye"></i> ${imp}</span>` : '',
        topCountryCode ? `<span class="cc-bl-traffic-bit">${FLAG(topCountryCode)} ${topCountryCode}</span>` : '',
        topAge ? `<span class="cc-bl-traffic-bit"><i class="fas fa-user"></i> ${topAge}</span>` : '',
      ].filter(Boolean).join('');

      const trafficRow = trafficBits
        ? `<div class="cc-bl-traffic">${trafficBits}</div>`
        : `<div class="cc-bl-traffic cc-bl-traffic--empty">Sin tráfico reciente</div>`;

      return `
        <div class="cc-bl-item" data-campaign-id="${c.id}">
          <div class="cc-bl-item-head">
            <span class="cc-bl-platform cc-bl-platform--${pl.klass}">${pl.code}</span>
            <span class="cc-bl-name">${this.escapeHtml(c.nombre_campana || c.external_campaign_name || 'Campaña')}</span>
            <span class="cc-bl-status cc-bl-status--${sCls}">${this.escapeHtml(c.status || 'draft')}</span>
          </div>
          ${trafficRow}
        </div>`;
    }).join('');
  }

  /* ── Mapa choropleth + breakdowns (segmentación real) ─────────────── */
  async _renderAudienceMap() {
    const mapEl    = document.getElementById('ccAudienceMap');
    const breakEl  = document.getElementById('ccAudienceBreakdowns');
    if (!mapEl) return;

    // Filtra claves "_raw", "_totals", "_sources", "_updated_at" del jsonb de personas
    const isInternalKey = (k) => typeof k === 'string' && k.startsWith('_');

    // Acepta dos shapes:
    //   campaigns.real_demographics: { age: { "25-34": {impressions, reach} } }
    //   personas.real_*:             { age: { "25-34": 0.45 } }  (fracción 0-1)
    // Devuelve número absoluto o fracción según el caso. El choropleth normaliza por max.
    const toNumeric = (v) => {
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object' && typeof v.impressions === 'number') return v.impressions;
      return 0;
    };

    const agg = { age: {}, gender: {}, country: {} };
    let source = null;  // 'campaigns' | 'personas' | null

    // ── 1) Intento PRIMERO: agregar campaigns.real_demographics (data por
    //    campaña, granular). Solo si tiene cualquier valor > 0.
    const camps = Array.isArray(this._campaigns) ? this._campaigns : [];
    for (const c of camps) {
      const rd = c.real_demographics;
      if (!rd || typeof rd !== 'object') continue;
      for (const axis of ['age', 'gender', 'country']) {
        const dist = rd[axis];
        if (!dist || typeof dist !== 'object') continue;
        for (const [k, v] of Object.entries(dist)) {
          if (isInternalKey(k)) continue;
          const n = toNumeric(v);
          if (n <= 0) continue;
          agg[axis][k] = (agg[axis][k] || 0) + n;
          source = 'campaigns';
        }
      }
    }

    // ── 2) Fallback: si campañas no aportaron data, agregar audience_personas.real_*
    //    (data brand-wide poblada por sensores meta_audience_demographics + ga4)
    if (!source) {
      const personas = Array.isArray(this._audiences) ? this._audiences : [];
      for (const p of personas) {
        const ageDist     = p.real_age_distribution      || {};
        const genderDist  = p.real_gender_distribution   || {};
        const locDist     = p.real_location_distribution || {};
        for (const [k, v] of Object.entries(ageDist)) {
          if (isInternalKey(k)) continue;
          const n = toNumeric(v); if (n <= 0) continue;
          agg.age[k] = (agg.age[k] || 0) + n;
          source = 'personas';
        }
        for (const [k, v] of Object.entries(genderDist)) {
          if (isInternalKey(k) || k === 'unknown') continue;
          const n = toNumeric(v); if (n <= 0) continue;
          agg.gender[k] = (agg.gender[k] || 0) + n;
          source = 'personas';
        }
        const countries = locDist.countries || {};
        for (const [k, v] of Object.entries(countries)) {
          if (isInternalKey(k)) continue;
          // Solo aceptamos ISO-A2 (2 letras mayúsculas); descartamos nombres
          // ("Colombia", "United States") que vienen del fallback GA4 raw.
          if (typeof k !== 'string' || k.length !== 2 || !/^[A-Z]{2}$/.test(k)) continue;
          const n = toNumeric(v); if (n <= 0) continue;
          agg.country[k] = (agg.country[k] || 0) + n;
          source = 'personas';
        }
      }
    }

    if (!source) {
      mapEl.innerHTML = `<div class="cc-map-empty"><i class="fas fa-satellite-dish"></i><p>Aún no hay lectura del mercado. Conecta una integración (Meta/Google) o espera a que los sensores corran (próxima corrida diaria).</p></div>`;
      if (breakEl) breakEl.innerHTML = '';
      return;
    }

    // Mapa choropleth (country) — pasa números directos al AudienceMap component
    if (window.AudienceMap) {
      try { await window.AudienceMap.render(mapEl, agg.country); }
      catch (e) { console.warn('AudienceMap render:', e?.message); }
    } else {
      mapEl.innerHTML = `<div class="cc-map-empty">Cargando mapa…</div>`;
    }

    // Panel bottom-left: lista de campañas reales (todas las integraciones) + tráfico
    this._renderRealCampaignsPanel();

    // Breakdowns: género + edad como mini-barras CSS
    if (breakEl) {
      const totalGender = Object.values(agg.gender).reduce((s, v) => s + Number(v || 0), 0);
      const totalAge    = Object.values(agg.age).reduce((s, v) => s + Number(v || 0), 0);

      const genderRows = totalGender > 0
        ? Object.entries(agg.gender)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 4)
            .map(([k, v]) => {
              const pct = Math.round((Number(v) / totalGender) * 100);
              const label = k === 'male' ? 'Hombres' : k === 'female' ? 'Mujeres' : k;
              return `<div class="cc-break-row" role="progressbar" aria-valuenow="${pct}" aria-label="${label}: ${pct}%">
                <span class="cc-break-label">${label}</span>
                <div class="cc-break-bar-wrap"><div class="cc-break-bar" style="width:${pct}%"></div></div>
                <span class="cc-break-pct">${pct}%</span>
              </div>`;
            }).join('')
        : '';

      const ageRows = totalAge > 0
        ? Object.entries(agg.age)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 6)
            .map(([k, v]) => {
              const pct = Math.round((Number(v) / totalAge) * 100);
              return `<div class="cc-break-row" role="progressbar" aria-valuenow="${pct}" aria-label="Edad ${k}: ${pct}%">
                <span class="cc-break-label">${k}</span>
                <div class="cc-break-bar-wrap"><div class="cc-break-bar" style="width:${pct}%"></div></div>
                <span class="cc-break-pct">${pct}%</span>
              </div>`;
            }).join('')
        : '';

      breakEl.innerHTML = `
        ${genderRows ? `<div class="cc-break-group"><h4 class="cc-break-title">Género</h4>${genderRows}</div>` : ''}
        ${ageRows    ? `<div class="cc-break-group"><h4 class="cc-break-title">Edad</h4>${ageRows}</div>` : ''}`;
    }
  }

  /* ── Conexión con canales (segmentos ↔ persona) — legacy, sin render ─ */
  _renderSegments() {
    const root = document.getElementById('ccSegmentsWrap');
    if (!root) return;
    const rows = Array.isArray(this._segments) ? this._segments : [];
    const personaById = this._personaNameById();

    if (!rows.length) {
      root.innerHTML = `<p class="cc-api-hint">Cuando existan audiencias enlazadas en Meta/Google con una <strong>persona</strong> de esta marca, verás aquí la <strong>conexión</strong> entre lo conceptual y lo que ya corre en canales — no es un listado de segmentación.</p>`;
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
        const pSeg = s.persona_id ? personaById[String(s.persona_id)] : '';
        const personaLine = `
          <div class="cc-seg-persona ${pSeg ? '' : 'cc-seg-persona--missing'}">
            <span>${pSeg ? 'Persona:' : 'Sin persona vinculada'}</span>
            ${this._personaPickerHTML(s.persona_id || '', 'segment', s.id)}
          </div>`;
        return `
        <div class="cc-seg-card">
          <div class="cc-seg-card-head">
            <span class="cc-seg-name">${this.escapeHtml(s.external_audience_name || s.external_audience_type || 'Audiencia en canal')}</span>
            <div>${badge}${synced}</div>
          </div>
          ${personaLine}
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
    const pLower = plat.toLowerCase();

    let channelHint = '';
    let qualitativeSignal = 'Señal integrada para contrastar enfoque de campaña y lectura de mercado.';
    if (pLower.includes('facebook') || pLower.includes('meta')) {
      channelHint = '<p class="cc-dash-hint">Lectura de <strong>página</strong> (no ads). Señal mínima de presencia; la IA la contrasta con tu enfoque conceptual.</p>';
      qualitativeSignal = 'Actividad social integrada como señal contextual de presencia de marca.';
    } else if (pLower.includes('google_analytics') || pLower.includes('analytics')) {
      channelHint = '<p class="cc-dash-hint">Lectura de <strong>sitio</strong>. Complementa el mercado objetivo con intención de visita, no sustituye a la persona.</p>';
      qualitativeSignal = 'Intención de visita integrada como señal contextual para decisiones de mensaje.';
    }

    const latestAt = s.period_end || s.computed_at || s.updated_at || s.created_at || null;

    return `
    <article class="cc-dash-card">
      <header class="cc-dash-card-head">
        <h3 class="cc-dash-card-title">${this.escapeHtml(platLabel)}</h3>
        <span class="cc-dash-card-meta">Última actualización: ${this.escapeHtml(fmtDate(latestAt) || '—')}</span>
      </header>
      <p class="cc-dash-hint">${this.escapeHtml(qualitativeSignal)}</p>
      ${channelHint}
    </article>`;
  }

  /* ── Lectura del mercado: solo última actualización por canal (sin historial) ─ */
  _renderSnapshots() {
    const root = document.getElementById('ccSnapshotsWrap');
    if (!root) return;
    const rows = Array.isArray(this._snapshots) ? this._snapshots : [];

    if (!rows.length) {
      root.innerHTML = `<p class="cc-api-hint">Sin lectura reciente del mercado. Conecta GA / Facebook y deja correr el sync para alimentar a la IA con señales mínimas.</p>`;
      return;
    }

    const latestByPlatform = new Map();
    rows.forEach((row) => {
      const key = String(row.platform || '—').toLowerCase();
      const prev = latestByPlatform.get(key);
      if (!prev || this._snapshotSortKey(row) > this._snapshotSortKey(prev)) {
        latestByPlatform.set(key, row);
      }
    });
    const primaries = Array.from(latestByPlatform.values());
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

    const heroHtml = `<div class="cc-dash-heroes">${primaries.map((s) => this._renderSnapshotHeroCard(s)).join('')}</div>`;
    root.innerHTML = heroHtml;
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

    // Delegated listener para los dropdowns "Vincular persona" en campaigns + segments.
    // Live: aunque _renderCampaigns/_renderSegments re-rendericen, el listener sobrevive
    // porque está colgado del page root.
    const page = document.getElementById('commandCenterPage');
    if (page) {
      page.addEventListener('change', async (ev) => {
        const sel = ev.target.closest && ev.target.closest('.cc-link-picker');
        if (!sel) return;
        const entityType = sel.getAttribute('data-entity-type');
        const entityId   = sel.getAttribute('data-entity-id');
        const personaId  = sel.value || null;
        sel.disabled = true;
        const ok = await this._linkEntityToPersona({ entityType, entityId, personaId });
        sel.disabled = false;
        if (!ok) sel.value = personaId === null ? '' : personaId; // revert visual si falló
      });
    }
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
