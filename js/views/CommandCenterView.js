/**
 * CommandCenterView — v5
 * Centro de control: enfoque de mercado (no historial ni segmentación fina).
 * - Personas conceptuales + campañas con persona_id
 * - Última lectura por canal (snapshots dedupe; API por RLS)
 * - Conexiones existentes: integraciones + segmentos con vínculo a persona
 */
class CommandCenterView extends BaseView {
  static documentTitle = 'Command Center';

  constructor() {
    super();
    this._subBrandSlug    = '';
    this._organizationId  = null;
    this._containerRow    = null;
    this._audiences       = [];   // audience_personas
    this._segments        = [];   // audience_segments
    this._campaigns       = [];   // campaigns (con cached metrics)
    this._integrations    = [];   // brand_integrations (sync status)
    this._pendingActions  = [];   // vera_pending_actions (status='pending')
    this._supabase        = null;

    // Canvas (v6): Command Center es un canvas de nodos audiencias↔campanas.
    // El mapa de mercado queda oculto (this._mapEnabled = false) pero su codigo
    // y HTML siguen vivos en #ccMapLegacy para retomarlo a futuro.
    this._mapEnabled      = false;
    this._canvasScale     = 1;
    this._canvasPan       = { x: 0, y: 0 };
    this._positions       = {};   // { 'aud:<id>'|'camp:<id>': {x,y} }
    this._collapsed       = new Set();  // node keys colapsados
    this._fieldSaveTimers = {};   // debounce por id:field
    this._onCanvas        = new Set();  // ids de campanas reales puestas en el canvas
    this._expandedReal    = new Set();  // ids de campanas reales expandidas (ver ads)
    this._adData          = {};         // cache de conjuntos/ads por campaign_id
    this._activeSection   = null;       // seccion activa del sidebar (null = colapsado, solo rail)
    this._libCache        = {};         // cache de items por seccion lazy
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
    // Preserva los segmentos originales tras /command-center/ — soporta tanto
    // /{shortId}/{slug} (canónico) como /{slug} (legacy) o /{uuid}.
    const tail = path.replace(/^\/command-center\//, '');
    if (!tail) return false;
    if (container) container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo…</p></div>';
    window.router?.navigate(
      `${prefix}/command-center/${tail}${window.location.search || ''}`, true);
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

  <!-- LAYOUT CANVAS: el lienzo abarca todo; el panel va flotante dentro ── -->
  <div class="cc-cc-layout" id="ccTwoCol" style="display:none;">
    <div class="cc-canvas-wrap">
      <div class="cc-canvas-toolbar">
        <div class="cc-canvas-toolbar-group">
          <button class="cc-canvas-btn cc-canvas-btn--primary" id="ccBtnCreateAudience" type="button" title="Crear Objetivo de Audiencia">
            <i class="fas fa-user-plus"></i><span>Objetivo de Audiencia</span>
          </button>
          <button class="cc-canvas-btn cc-canvas-btn--primary cc-canvas-btn--anchor" id="ccBtnCreateCampaign" type="button" title="Crear Objetivo de Campana (ancla de la estrategia)">
            <i class="fas fa-bullseye"></i><span>Objetivo de Campana</span>
          </button>
          <div class="cc-report-dd" id="ccReportDD">
            <button class="cc-canvas-btn" id="ccBtnReport" type="button" title="Crear informe con Vera (Claude)">
              <i class="fas fa-file-lines"></i><span>Crear informe</span><i class="fas fa-chevron-down cc-report-caret"></i>
            </button>
            <div class="cc-report-menu" id="ccReportMenu" role="menu" style="display:none;">
              <button type="button" role="menuitem" data-scope="all"><i class="fas fa-layer-group"></i> Informar todo</button>
              <button type="button" role="menuitem" data-scope="campaign"><i class="fas fa-bullhorn"></i> Campana seleccionada</button>
              <button type="button" role="menuitem" data-scope="audience"><i class="fas fa-users"></i> Audiencia seleccionada</button>
              <button type="button" role="menuitem" data-scope="ecosystem"><i class="fas fa-brain"></i> Aprendizaje del ecosistema</button>
              <button type="button" role="menuitem" data-scope="selection"><i class="fas fa-bullseye"></i> Seleccionado</button>
            </div>
          </div>
        </div>
        <div class="cc-canvas-toolbar-group">
          <button class="cc-canvas-btn" id="ccBtnRelayout" type="button" title="Reorganizar nodos">
            <i class="fas fa-th"></i><span>Reorganizar</span>
          </button>
          <button class="cc-canvas-btn cc-canvas-btn--icon" id="ccBtnZoomOut" type="button" title="Alejar" aria-label="Alejar"><span class="cc-zoom-glyph">&minus;</span></button>
          <button class="cc-canvas-btn cc-canvas-btn--icon" id="ccBtnZoomReset" type="button" title="Centrar" aria-label="Centrar zoom"><i class="fas fa-up-right-and-down-left-from-center"></i></button>
          <button class="cc-canvas-btn cc-canvas-btn--icon" id="ccBtnZoomIn" type="button" title="Acercar" aria-label="Acercar"><span class="cc-zoom-glyph">+</span></button>
        </div>
      </div>

      <div class="cc-canvas" id="ccCanvas">
        <svg class="cc-canvas-edges" id="ccCanvasEdges" aria-hidden="true"></svg>
        <div class="cc-canvas-world" id="ccCanvasWorld"></div>
        <div class="cc-canvas-empty" id="ccCanvasEmpty" style="display:none;">
          <i class="fas fa-diagram-project"></i>
          <p>Sin audiencias ni campanas todavia. Crea una audiencia o conecta una integracion (Meta, Google).</p>
        </div>

        <!-- Minimapa flotante (esquina inferior izquierda), estilo n8n/React Flow -->
        <div class="cc-minimap-float" id="ccMinimapWrap" style="display:none;">
          <canvas id="ccMinimap" class="cc-minimap" width="220" height="140"></canvas>
        </div>

        <!-- Panel flotante = biblioteca tipo Figma: rail de iconos (siempre
             visible, sin texto) + panel de datos que se abre al seleccionar
             una seccion. Colapsado por defecto = solo el rail. -->
        <!-- El rail queda fijo a la derecha; el panel de datos abre a su
             izquierda. Orden DOM: panel (izq) primero, rail (der) ultimo. -->
        <aside class="cc-floating-panel" id="ccSidebar">
          <!-- Panel de datos de la seccion activa (abre a la izquierda) -->
          <div class="cc-fp-panel" role="tabpanel" aria-labelledby="ccPanelTitle">
            <div class="cc-fp-head">
              <button class="cc-fp-toggle" id="ccPanelToggle" type="button" title="Cerrar seccion" aria-label="Cerrar seccion">
                <i class="fas fa-times"></i>
              </button>
              <span class="cc-fp-title" id="ccPanelTitle">Biblioteca</span>
            </div>
            <div class="cc-fp-body" id="ccPanelBody"></div>
          </div>
          <!-- Rail de navegacion (fijo a la derecha, iconos sin texto) -->
          <nav class="cc-fp-rail" id="ccPanelRail" role="tablist" aria-orientation="vertical" aria-label="Biblioteca"></nav>
        </aside>
      </div>
    </div>
  </div>

  <!-- Modal del informe generado por Claude -->
  <div class="cc-report-backdrop" id="ccReportBackdrop" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="ccReportTitle">
    <div class="cc-report-modal glass-black">
      <header class="cc-report-head">
        <h3 class="cc-report-title" id="ccReportTitle"><i class="fas fa-file-lines"></i> Informe</h3>
        <div class="cc-report-head-actions">
          <button type="button" class="cc-report-act" id="ccReportCopy" title="Copiar" aria-label="Copiar"><i class="fas fa-copy"></i></button>
          <button type="button" class="cc-report-act" id="ccReportDownload" title="Descargar .md" aria-label="Descargar"><i class="fas fa-download"></i></button>
          <button type="button" class="cc-report-act" id="ccReportClose" title="Cerrar" aria-label="Cerrar"><i class="fas fa-times"></i></button>
        </div>
      </header>
      <div class="cc-report-body" id="ccReportBody"></div>
      <footer class="cc-report-foot" id="ccReportFoot"></footer>
    </div>
  </div>

  <!-- OCULTO: mapa de mercado. No se elimina; se retoma a futuro con
       this._mapEnabled = true + mostrar #ccMapLegacy. -->
  <div class="cc-entorno-layout" id="ccMapLegacy" style="display:none;">
    <div class="cc-entorno-map">
      <div class="cc-entorno-loading" id="ccEntornoLoading" style="display:none;">
        <div class="cc-entorno-spinner"></div>
        <div class="cc-entorno-loading-text">Cargando lectura del mercado…</div>
      </div>
      <div class="cc-entorno-map-canvas" id="ccAudienceMap"></div>
      <div class="cc-entorno-demog cc-entorno-demog--age" id="ccEntornoDemogAge" style="display:none;">
        <div class="cc-break-group" id="ccBreakAge"></div>
      </div>
      <div class="cc-entorno-demog cc-entorno-demog--gender" id="ccEntornoDemogGender" style="display:none;">
        <div class="cc-break-group" id="ccBreakGender"></div>
      </div>
    </div>
  </div>

  <!-- (Modal editor eliminado: el flujo de crear/editar se definira aparte) -->
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
    this._subBrandShortId = String(this.routeParams?.subBrandShortId || '').trim().toLowerCase();
    this._subBrandSlug    = String(this.routeParams?.subBrandSlug || '').trim().toLowerCase();
    this._organizationId  = this._resolveOrganizationId();

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
    const shortFn = typeof window.getBrandContainerShortId === 'function'
      ? window.getBrandContainerShortId
      : (id) => String(id || '').replace(/-/g, '').slice(-12);

    /* Resolver brand_container.
       Canónico: por shortId (últimos 12 hex del UUID) — único por org.
       Legacy: solo slug llegó en la URL — si la URL fue /command-center/{value} y
         value parece UUID/shortId, lo tratamos como shortId; si parece slug, match
         por nombre (devuelve el primero, comportamiento legacy). */
    let match = null;
    try {
      const { data } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, created_at')
        .eq('organization_id', this._organizationId)
        .order('created_at', { ascending: false });
      const containers = Array.isArray(data) ? data : [];

      const looksLikeId = (v) => /^[a-f0-9]{12}$/.test(v) || /^[a-f0-9-]{36}$/.test(v);
      const idKey = this._subBrandShortId || (looksLikeId(this._subBrandSlug) ? this._subBrandSlug : '');
      if (idKey) {
        match = containers.find((r) => shortFn(r.id) === shortFn(idKey)) || null;
      }
      if (!match && this._subBrandSlug && !looksLikeId(this._subBrandSlug)) {
        match = containers.find((r) => slugFn(r.nombre_marca) === this._subBrandSlug) || null;
      }
    } catch (e) { console.warn('CommandCenterView: brand_containers', e); }

    const displayName = match
      ? (String(match.nombre_marca || '').trim() || 'Sub-marca')
      : (this._subBrandSlug || this._subBrandShortId || '—');
    this.updateHeaderContext('Command Center', displayName, window.currentOrgName || '');

    if (!match) {
      this._setError(`No se encontró la sub-marca "${displayName}". Revisa el nombre en Brand Storage.`);
      return;
    }

    this._containerRow = match;
    const bid = match.id;

    /* Fetch paralelo (snapshots + heatmap vía API: RLS suele devolver [] al cliente)
       Cacheado vía apiClient 60s + SWR por brand_container_id. */
    try {
      const fetchBundle = async () => {
        const [audRes, segRes, campRes, intRes] = await Promise.all([
          supabase
            .from('audience_personas')
            .select('id, name, description, awareness_level, alignment_score, dolores, deseos, objeciones, gatillos_compra, datos_demograficos, datos_psicograficos, target_age_min, target_age_max, target_genders, is_liked, is_featured, is_active, real_age_distribution, real_gender_distribution, real_location_distribution, real_interests, updated_at')
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
        return {
          audiences:    !audRes.error  && Array.isArray(audRes.data)  ? audRes.data  : [],
          segments:     !segRes.error  && Array.isArray(segRes.data)  ? segRes.data  : [],
          campaigns:    !campRes.error && Array.isArray(campRes.data) ? campRes.data : [],
          integrations: !intRes.error  && Array.isArray(intRes.data)  ? intRes.data  : [],
        };
      };
      const bundle = window.apiClient
        ? await window.apiClient.query(`cc:bundle:${bid}`, fetchBundle, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetchBundle();
      this._audiences    = bundle.audiences;
      this._segments     = bundle.segments;
      this._campaigns    = bundle.campaigns;
      this._integrations = bundle.integrations;
    } catch (e) {
      console.warn('CommandCenterView: fetch', e);
      this._audiences = [];
      this._segments  = [];
      this._campaigns = [];
      this._integrations = [];
    }

    // Bandeja de Vera: pending_actions sin resolver para esta marca
    this._pendingActions = await this._fetchPendingActions(bid);

    const twoCol = document.getElementById('ccTwoCol');
    if (twoCol) twoCol.style.display = '';

    /* this._renderVeraInbox(); */ // Sprint 2: reemplazado por Dashboard sidebar
    this._renderCampaigns();    // alimenta la lista compacta del mini-dashboard
    this._renderCanvas();       // (mixin Canvas) nodos + aristas
    this._renderMiniDash();     // (mixin Canvas) stats + conteos
    this._renderAudienceMap();  // no-op mientras this._mapEnabled === false
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
      return;
    }
    if (section) section.style.display = '';

    if (count) count.textContent = String(actions.length);
    if (label) label.textContent = actions.length === 1 ? 'comentario' : 'comentarios';

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
        console.error('approve action failed:', err.slice(0, 200));
        return;
      }
      // Quitar localmente y re-renderizar
      this._pendingActions = this._pendingActions.filter((a) => a.id !== actionId);
      /* this._renderVeraInbox(); */ // Sprint 2: reemplazado por Dashboard sidebar
    } catch (e) {
      console.error('approve action:', e);
    }
  }

  async _rejectPendingAction(actionId) {
    if (!actionId) return;
    // Sin prompt de razon (UX silenciosa). Reason vacio.
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/vera/pending-actions/${actionId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason: '' }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        console.error('reject action failed:', err.slice(0, 200));
        return;
      }
      this._pendingActions = this._pendingActions.filter((a) => a.id !== actionId);
      /* this._renderVeraInbox(); */ // Sprint 2: reemplazado por Dashboard sidebar
    } catch (e) {
      console.error('reject action:', e);
    }
  }

  /** Mapa id → nombre de persona (legacy, queda por si se usa en otro lado). */
  _personaNameById() {
    const m = {};
    (this._audiences || []).forEach((p) => {
      if (p?.id) m[String(p.id)] = String(p.name || '').trim() || 'Persona';
    });
    return m;
  }

  /* ── CAMPAÑAS reales: solo las sincronizadas desde una integración ─── */
  _renderCampaigns() {
    const list  = document.getElementById('ccCampList');
    const empty = document.getElementById('ccCampEmpty');
    const all   = Array.isArray(this._campaigns) ? this._campaigns : [];
    // "Real" = importada de Meta/Google/TikTok/LinkedIn/etc. Indicador robusto:
    // last_synced_at no nulo (la fila vino de un sync, no fue creada a mano).
    const rows = all.filter((c) => c?.last_synced_at);
    if (!list) return;

    if (!rows.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    const statusClass = { active: 'cc-badge--green', conceptual: 'cc-badge--blue', draft: 'cc-badge--gray', paused: 'cc-badge--yellow', ended: 'cc-badge--red', archived: 'cc-badge--gray' };
    const platformLabel = { meta_instagram: 'Instagram', meta_facebook: 'Facebook', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest', organic: 'Orgánico', internal: 'Interno' };
    // Label de "Resultados" según el objetivo real de la campaña (Meta/Google).
    // Si no podemos inferir el tipo, default a "resultados" (genérico).
    const resultLabel = (obj) => {
      const s = String(obj || '').toLowerCase();
      if (s.includes('lead'))                                     return 'leads';
      if (s.includes('purchase') || s.includes('sales') || s.includes('conversion')) return 'compras';
      if (s.includes('install') || s.includes('app'))             return 'instalaciones';
      if (s.includes('message') || s.includes('chat'))            return 'mensajes';
      if (s.includes('engagement') || s.includes('reach'))        return 'interacciones';
      if (s.includes('traffic') || s.includes('link_click'))      return 'clics';
      if (s.includes('view') || s.includes('thruplay'))           return 'vistas';
      return 'resultados';
    };
    const fmtCompact = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return '0';
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return n.toLocaleString('es-ES');
    };
    const fmtMoney = (v, currency) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return `0 ${currency || 'USD'}`;
      const compact = n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString('es-ES', { maximumFractionDigits: 0 });
      return `${compact} ${currency || 'USD'}`;
    };
    const fmtDate = (d) => {
      if (!d) return '—';
      const t = new Date(d);
      return Number.isFinite(t.getTime())
        ? t.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
    };

    list.innerHTML = rows.map((c) => {
      const stBadge   = `<span class="cc-badge ${statusClass[c.status] || 'cc-badge--gray'}">${this.escapeHtml(c.status || 'draft')}</span>`;
      const platLabel = platformLabel[c.platform] || (c.platform ? c.platform.replace(/_/g, ' ') : null);
      const platBadge = platLabel ? `<span class="cc-badge cc-badge--platform">${this.escapeHtml(platLabel)}</span>` : '';

      // Resultados = conversiones del objetivo (leads/compras/etc.). Si la
      // campaña está sincronizada pero el dato es null, mostramos 0 (real:
      // existe en plataforma pero aún no convirtió). Igual para spend.
      const resultsN = Number(c.cached_conversions);
      const resultsValue = Number.isFinite(resultsN) ? resultsN : 0;
      const resultsLbl   = resultLabel(c.platform_objective || c.cta);

      return `
      <div class="cc-camp-row">
        <div class="cc-camp-row-head">
          <span class="cc-camp-name" title="${this.escapeHtml(c.nombre_campana || 'Campaña')}">${this.escapeHtml(c.nombre_campana || 'Campaña')}</span>
          <div class="cc-camp-badges">${stBadge}${platBadge}</div>
        </div>
        <dl class="cc-camp-stats">
          <div class="cc-camp-stat"><dt>Publicada</dt><dd>${this.escapeHtml(fmtDate(c.starts_at || c.created_at))}</dd></div>
          <div class="cc-camp-stat"><dt>Resultados</dt><dd>${fmtCompact(resultsValue)} <small>${this.escapeHtml(resultsLbl)}</small></dd></div>
          <div class="cc-camp-stat"><dt>Gastos</dt><dd>${this.escapeHtml(fmtMoney(c.cached_spend, c.budget_currency))}</dd></div>
        </dl>
      </div>`;
    }).join('');
  }

  /* ── Mapa choropleth + breakdowns (segmentación real) ─────────────── */
  async _renderAudienceMap() {
    // OCULTO (v6): el mapa de mercado vive en #ccMapLegacy pero no se pinta.
    // Reactivar con this._mapEnabled = true + mostrar #ccMapLegacy.
    if (!this._mapEnabled) return;
    const mapEl       = document.getElementById('ccAudienceMap');
    const ageOverlay  = document.getElementById('ccEntornoDemogAge');
    const genOverlay  = document.getElementById('ccEntornoDemogGender');
    const ageEl       = document.getElementById('ccBreakAge');
    const genEl       = document.getElementById('ccBreakGender');
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
      if (ageEl) ageEl.innerHTML = '';
      if (genEl) genEl.innerHTML = '';
      if (ageOverlay) ageOverlay.style.display = 'none';
      if (genOverlay) genOverlay.style.display = 'none';
      return;
    }

    // Mapa choropleth (country). Si AudienceMap.render dispara su fallback
    // interno de lista, lo detectamos por DOM y mostramos un chip visible para
    // poder diagnosticar el motivo real desde la consola del usuario.
    if (window.AudienceMap) {
      try {
        await window.AudienceMap.render(mapEl, agg.country);
        const fellBack = !!mapEl.querySelector('.cc-map-fallback');
        if (fellBack) {
          const errMsg = mapEl.__lastError || 'razón desconocida (revisa consola)';
          const chip = document.createElement('div');
          chip.className = 'cc-map-error-chip';
          chip.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Mapa no disponible: ${this.escapeHtml(errMsg)}`;
          mapEl.appendChild(chip);
        }
      } catch (e) {
        console.warn('AudienceMap render:', e?.message);
        mapEl.innerHTML = `<div class="cc-map-empty"><i class="fas fa-triangle-exclamation"></i><p>Error al cargar el mapa: ${this.escapeHtml(e?.message || String(e))}</p></div>`;
      }
    } else {
      mapEl.innerHTML = `<div class="cc-map-empty">Cargando mapa…</div>`;
    }

    // Breakdowns: edad (bottom-left) + género (bottom-right) — overlays sin fondo
    const totalGender = Object.values(agg.gender).reduce((s, v) => s + Number(v || 0), 0);
    const totalAge    = Object.values(agg.age).reduce((s, v) => s + Number(v || 0), 0);
    const buildRow = (label, pct, aria) => `
      <div class="cc-break-row" role="progressbar" aria-valuenow="${pct}" aria-label="${aria}">
        <span class="cc-break-label">${label}</span>
        <div class="cc-break-bar-wrap"><div class="cc-break-bar" style="width:${pct}%"></div></div>
        <span class="cc-break-pct">${pct}%</span>
      </div>`;

    const genderRows = totalGender > 0
      ? Object.entries(agg.gender)
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .slice(0, 4)
          .map(([k, v]) => {
            const pct = Math.round((Number(v) / totalGender) * 100);
            const label = k === 'male' ? 'Hombres' : k === 'female' ? 'Mujeres' : k;
            return buildRow(label, pct, `${label}: ${pct}%`);
          }).join('')
      : '';

    const ageRows = totalAge > 0
      ? Object.entries(agg.age)
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .slice(0, 6)
          .map(([k, v]) => {
            const pct = Math.round((Number(v) / totalAge) * 100);
            return buildRow(k, pct, `Edad ${k}: ${pct}%`);
          }).join('')
      : '';

    if (ageEl)  ageEl.innerHTML  = ageRows    ? `<h4 class="cc-break-title">Edad</h4>${ageRows}`     : '';
    if (genEl)  genEl.innerHTML  = genderRows ? `<h4 class="cc-break-title">Género</h4>${genderRows}` : '';
    if (ageOverlay) ageOverlay.style.display = ageRows    ? '' : 'none';
    if (genOverlay) genOverlay.style.display = genderRows ? '' : 'none';
  }

  /* ── Listeners: toggle del panel + botones de acción ────────────────
     Los botones "crear campaña/audiencia" disparan CustomEvents globales
     (cc:create-campaign / cc:create-audience) con el brand_container_id en
     el detail. Cuando definamos el flujo (modal, wizard, ruta), nos
     conectamos a esos eventos. Fallback alert para que la UI no se sienta
     muerta mientras tanto. */
  _setupEventListeners() {
    document.getElementById('ccBtnCreateCampaign')?.addEventListener('click', () => this._createAndEdit('campaign'));
    document.getElementById('ccBtnCreateAudience')?.addEventListener('click', () => this._createAndEdit('audience'));

    // Editar/eliminar nodos del canvas se maneja en _setupCanvasListeners (mixin).
    // El modal editor fue eliminado; el flujo de edicion se definira aparte.

    // Canvas (mixin): drag-to-connect, node-drag, pan/zoom, toolbar zoom.
    if (typeof this._setupCanvasListeners === 'function') this._setupCanvasListeners();
  }

  /* ── Crear audiencia / campaña con nombre auto-incrementado ─────────
     Inserta una fila mínima en Supabase y abre el editor para que el
     usuario complete los campos. El nombre default es "Nueva campaña (N)"
     o "Nueva audiencia (N)" donde N es el siguiente disponible. */
  async _createAndEdit(kind) {
    if (!this._supabase || !this._containerRow?.id || !this._organizationId) return;
    const isAudience = kind === 'audience';
    const table  = isAudience ? 'audience_personas' : 'campaigns';
    const nameField = isAudience ? 'name' : 'nombre_campana';
    const prefix = isAudience ? 'Nueva audiencia' : 'Nueva campaña';

    // Calcular siguiente N revisando los registros existentes que matchean
    // el patrón "<prefix> (N)" en esta marca.
    const rows = isAudience
      ? (this._audiences || []).map(a => String(a.name || ''))
      : (this._campaigns || []).map(c => String(c.nombre_campana || ''));
    const re = new RegExp(`^${prefix}\\s*\\((\\d+)\\)$`);
    let maxN = 0;
    rows.forEach((n) => {
      const m = re.exec(n.trim());
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10) || 0);
    });
    const nextN = maxN + 1;
    const defaultName = `${prefix} (${nextN})`;

    // Resolver created_by del usuario actual (best effort)
    let createdBy = null;
    try {
      const { data: { user } } = await this._supabase.auth.getUser();
      createdBy = user?.id || null;
    } catch (_) { /* noop */ }

    const payload = {
      organization_id:    this._organizationId,
      brand_container_id: this._containerRow.id,
      [nameField]:        defaultName,
      created_by:         createdBy,
    };

    try {
      const { data, error } = await this._supabase
        .from(table)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      // Push al state local y re-render
      if (isAudience) {
        this._audiences = [data, ...(this._audiences || [])];
      } else {
        this._campaigns = [data, ...(this._campaigns || [])];
      }
      this._renderCanvas();
      this._renderMiniDash();
      // El nodo queda creado con nombre por defecto. El flujo de edicion
      // (renombrar / completar campos) se definira aparte.
    } catch (e) {
      console.error('CommandCenterView create:', e?.message || e);
    }
  }

  /* ── Confirmación + delete (campañas conceptuales / audiencias) ──────
     Las campañas REALES no se eliminan ni editan desde el frontend — son
     espejo de lo que vive en Meta/Google. Solo se visualizan. */
  async _confirmAndDelete(entityType, entityId, cardEl) {
    if (!this._supabase) return;

    const isAudience = entityType === 'audience';
    const isConcept  = entityType === 'campaign-concept';

    if (!isAudience && !isConcept) return;

    // Sin confirm: borrado directo (la accion viene del trash button = intent claro)

    // Deshabilita el botón mientras se procesa
    const btn = cardEl?.querySelector('.cc-gallery-delete-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

    try {
      const table = isAudience ? 'audience_personas' : 'campaigns';
      const { error } = await this._supabase.from(table).delete().eq('id', entityId);
      if (error) throw error;

      // Quitar localmente del state y re-render. Las galerías de campañas
      // reales no se tocan: no se pueden eliminar desde aquí.
      if (isAudience) {
        this._audiences = (this._audiences || []).filter(a => String(a.id) !== String(entityId));
        this._renderAudienceMap();
      } else {
        // isConcept
        this._campaigns = (this._campaigns || []).filter(c => String(c.id) !== String(entityId));
        this._renderCampaigns();
      }
      this._renderCanvas();
      this._renderMiniDash();
    } catch (e) {
      console.error('CommandCenterView delete:', e?.message || e);
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
  }

  /* ── Error state ──────────────────────────────────────────────────── */
  _setError(msg) {
    const twoCol = document.getElementById('ccTwoCol');
    const empty  = document.getElementById('ccCanvasEmpty');
    if (twoCol) twoCol.style.display = '';
    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = `<i class="fas fa-triangle-exclamation"></i><p>${this.escapeHtml(msg)}</p>`;
    }
  }
}

window.CommandCenterView = CommandCenterView;
