/**
 * CommandCenterView — v5
 * Centro de control: enfoque de mercado (no historial ni segmentación fina).
 * - Personas conceptuales + campañas con persona_id
 * - Última lectura por canal (snapshots dedupe; API por RLS)
 * - Conexiones existentes: integraciones + segmentos con vínculo a persona
 */
class CommandCenterView extends BaseView {
  static get documentTitle() { return __('Command Center'); }

  constructor() {
    super();
    this._subBrandSlug    = '';
    this._organizationId  = null;
    this._containerRow    = null;
    this._audiences       = [];   // audience_personas
    this._segments        = [];   // audience_segments
    this._campaigns       = [];   // campaigns (con cached metrics)
    this._integrations    = [];   // brand_integrations (sync status)
    this._supabase        = null;

    // Canvas (v6): Command Center es un canvas de nodos audiencias↔campanas.
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
    if (container) container.innerHTML = `<div class="page-content"><p class="text-muted">${__('Redirigiendo…')}</p></div>`;
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
    // Vista inmersiva (como Vera): al entrar se colapsa el sidebar global de
    // navegacion para dar todo el ancho al canvas. Recuerda el estado previo y
    // lo restaura en onLeave() — no toca la preferencia global del usuario.
    try { window.appNavigation?.collapseForImmersive?.(); } catch (_) { /* noop */ }
  }

  // Al salir del Command Center restauramos el sidebar global de navegacion.
  onLeave() {
    try { window.appNavigation?.restoreFromImmersive?.(); } catch (_) { /* noop */ }
  }

  /* ── HTML skeleton ────────────────────────────────────────────────── */
  renderHTML() {
    return `
<div class="cc-page" id="commandCenterPage">

  <!-- LAYOUT CANVAS: el lienzo abarca todo; el panel va flotante dentro ── -->
  <div class="cc-cc-layout" id="ccTwoCol" style="display:none;">
    <div class="cc-canvas-wrap">
      <div class="cc-canvas-toolbar">
        <div class="cc-canvas-toolbar-group">
          <!-- Nombre de la estrategia activa: editable inline (sin borde ni fondo),
               con lapiz que indica que se puede editar. Vive a la izquierda de los
               botones de crear. Render/listeners en CanvasStore. -->
          <label class="cc-strat-name" id="ccStratName" title="${__('Editar nombre de la estrategia')}">
            <input class="cc-strat-name-input" id="ccStratNameInput" type="text" spellcheck="false"
                   aria-label="${__('Nombre de la estrategia')}" placeholder="${__('Estrategia')}" />
            <i class="fas fa-pen cc-strat-name-pen" aria-hidden="true"></i>
          </label>
          <span class="cc-toolbar-divider" aria-hidden="true"></span>
          <button class="cc-canvas-btn cc-canvas-btn--primary" id="ccBtnCreateAudience" type="button" title="${__('Crear Objetivo de Audiencia')}">
            <i class="fas fa-user-plus"></i><span>${__('Objetivo de Audiencia')}</span>
          </button>
          <button class="cc-canvas-btn cc-canvas-btn--primary cc-canvas-btn--anchor" id="ccBtnCreateCampaign" type="button" title="${__('Crear Objetivo de Campana (ancla de la estrategia)')}">
            <i class="fas fa-bullseye"></i><span>${__('Objetivo de Campana')}</span>
          </button>
          <div class="cc-report-dd" id="ccReportDD">
            <button class="cc-canvas-btn" id="ccBtnReport" type="button" title="${__('Crear informe con Vera (Claude)')}">
              <i class="fas fa-file-lines"></i><span>${__('Crear informe')}</span><i class="fas fa-chevron-down cc-report-caret"></i>
            </button>
            <div class="cc-report-menu" id="ccReportMenu" role="menu" style="display:none;">
              <button type="button" role="menuitem" data-scope="all"><i class="fas fa-layer-group"></i> ${__('Informar todo')}</button>
              <button type="button" role="menuitem" data-scope="campaign"><i class="fas fa-bullhorn"></i> ${__('Campana seleccionada')}</button>
              <button type="button" role="menuitem" data-scope="audience"><i class="fas fa-users"></i> ${__('Audiencia seleccionada')}</button>
              <button type="button" role="menuitem" data-scope="ecosystem"><i class="fas fa-brain"></i> ${__('Aprendizaje del ecosistema')}</button>
              <button type="button" role="menuitem" data-scope="selection"><i class="fas fa-bullseye"></i> ${__('Seleccionado')}</button>
            </div>
          </div>
          <!-- Anotaciones del lienzo (viven solo dentro de la estrategia): se crean
               desde el header, ya no como tipos de nodo en la seccion Nodos. -->
          <button class="cc-canvas-btn" id="ccBtnCreateNote" type="button" title="${__('Crear nota (anotacion del lienzo)')}">
            <i class="fas fa-note-sticky"></i><span>${__('Crear nota')}</span>
          </button>
          <button class="cc-canvas-btn" id="ccBtnCreateGroup" type="button" title="${__('Crear grupo (frame para agrupar nodos)')}">
            <i class="fas fa-object-group"></i><span>${__('Crear grupo')}</span>
          </button>
        </div>
        <div class="cc-canvas-toolbar-group">
          <button class="cc-canvas-btn" id="ccBtnRelayout" type="button" title="${__('Reorganizar nodos')}">
            <i class="fas fa-th"></i><span>${__('Reorganizar')}</span>
          </button>
          <button class="cc-canvas-btn cc-canvas-btn--icon" id="ccBtnZoomOut" type="button" title="${__('Alejar')}" aria-label="${__('Alejar')}"><span class="cc-zoom-glyph">&minus;</span></button>
          <button class="cc-canvas-btn cc-canvas-btn--icon" id="ccBtnZoomReset" type="button" title="${__('Centrar')}" aria-label="${__('Centrar zoom')}"><i class="fas fa-up-right-and-down-left-from-center"></i></button>
          <button class="cc-canvas-btn cc-canvas-btn--icon" id="ccBtnZoomIn" type="button" title="${__('Acercar')}" aria-label="${__('Acercar')}"><span class="cc-zoom-glyph">+</span></button>
        </div>
      </div>

      <div class="cc-canvas" id="ccCanvas">
        <svg class="cc-canvas-edges" id="ccCanvasEdges" aria-hidden="true"></svg>
        <div class="cc-canvas-world" id="ccCanvasWorld"></div>
        <div class="cc-canvas-empty" id="ccCanvasEmpty" style="display:none;">
          <i class="fas fa-diagram-project"></i>
          <p class="cc-canvas-empty-title">${__('Centro de estrategia')}</p>
          <p>${__('Vera construye estrategias de campana usando nodos guia para analizar y producir. Esta pagina es tu centro de monitoreo para visualizar las estrategias creadas.')}</p>
        </div>

        <!-- Minimapa flotante (esquina inferior izquierda), estilo n8n/React Flow -->
        <div class="cc-minimap-float" id="ccMinimapWrap" style="display:none;">
          <canvas id="ccMinimap" class="cc-minimap" width="220" height="140"></canvas>
        </div>

        <!-- Sidebar de Estrategias (izquierda, SIEMPRE abierto — no colapsable).
             Lista tipo historial: cada estrategia es un item; la activa lleva
             acento de marca. El boton "Nueva estrategia" vive en el header.
             Render/listeners en CanvasStore. -->
        <aside class="cc-strat-panel" id="ccStratPanel" aria-label="${__('Estrategias')}">
          <div class="cc-strat-head">
            <span class="cc-strat-title"><i class="fas fa-layer-group"></i> ${__('Estrategias')}</span>
            <button class="cc-canvas-btn cc-strat-new" id="ccStratNew" type="button" title="${__('Nueva estrategia')}">
              <i class="fas fa-plus"></i><span>${__('Nueva')}</span>
            </button>
          </div>
          <div class="cc-strat-list" id="ccStratList"></div>
          <!-- Presupuesto de marketing del MERCADO (brand_container): total
               editable + cuanto esta asignado en objetivos. La asignacion es
               la decision de CMO — sin techo comun no hay gobierno 60/40. -->
          <div class="cc-strat-budget" id="ccStratBudget"></div>
          <!-- Secuencia estrategica: los pasos del marketing profesional
               (SOSTAC) derivados del estado REAL de la BD. Vera cubre el
               diagnostico; el resto se completa construyendo en el canvas. -->
          <div class="cc-strat-steps" id="ccStratSteps"></div>
        </aside>

        <!-- Panel flotante = biblioteca tipo Figma: rail de iconos (siempre
             visible, sin texto) + panel de datos que se abre al seleccionar
             una seccion. Colapsado por defecto = solo el rail. -->
        <!-- El rail queda fijo a la derecha; el panel de datos abre a su
             izquierda. Orden DOM: panel (izq) primero, rail (der) ultimo. -->
        <aside class="cc-floating-panel" id="ccSidebar">
          <!-- Panel de datos de la seccion activa (abre a la izquierda) -->
          <div class="cc-fp-panel" role="tabpanel" aria-labelledby="ccPanelTitle">
            <div class="cc-fp-head">
              <button class="cc-fp-toggle" id="ccPanelToggle" type="button" title="${__('Cerrar seccion')}" aria-label="${__('Cerrar seccion')}">
                <i class="fas fa-times"></i>
              </button>
              <span class="cc-fp-title" id="ccPanelTitle">${__('Biblioteca')}</span>
            </div>
            <div class="cc-fp-body" id="ccPanelBody"></div>
          </div>
          <!-- Rail de navegacion (fijo a la derecha, iconos sin texto) -->
          <nav class="cc-fp-rail" id="ccPanelRail" role="tablist" aria-orientation="vertical" aria-label="${__('Biblioteca')}"></nav>
        </aside>
      </div>
    </div>
  </div>

  <!-- Modal del informe generado por Claude -->
  <div class="cc-report-backdrop" id="ccReportBackdrop" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="ccReportTitle">
    <div class="cc-report-modal glass-black">
      <header class="cc-report-head">
        <h3 class="cc-report-title" id="ccReportTitle"><i class="fas fa-file-lines"></i> ${__('Informe')}</h3>
        <div class="cc-report-head-actions">
          <button type="button" class="cc-report-act" id="ccReportCopy" title="${__('Copiar')}" aria-label="${__('Copiar')}"><i class="fas fa-copy"></i></button>
          <button type="button" class="cc-report-act" id="ccReportDownload" title="${__('Descargar .md')}" aria-label="${__('Descargar')}"><i class="fas fa-download"></i></button>
          <button type="button" class="cc-report-act" id="ccReportClose" title="${__('Cerrar')}" aria-label="${__('Cerrar')}"><i class="fas fa-times"></i></button>
        </div>
      </header>
      <div class="cc-report-body" id="ccReportBody"></div>
      <footer class="cc-report-foot" id="ccReportFoot"></footer>
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
    this._setupLive();
  }

  /* Las 4 queries del bundle (audiencias/segmentos/campanas/integraciones)
     scopeadas por brand_container. Compartido por _loadData (cacheado) y el
     refresh en vivo (fresco). */
  async _fetchCcBundle(supabase, bid) {
    const [audRes, segRes, campRes, intRes] = await Promise.all([
      supabase
        .from('audience_personas')
        .select('id, name, description, awareness_level, alignment_score, dolores, deseos, objeciones, gatillos_compra, datos_demograficos, datos_psicograficos, target_age_min, target_age_max, target_genders, is_liked, is_featured, is_active, real_age_distribution, real_gender_distribution, real_location_distribution, real_interests, updated_at')
        .eq('brand_container_id', bid)
        .order('updated_at', { ascending: false }),
      supabase
        .from('audience_segments')
        .select('id, persona_id, campaign_id, platform, external_audience_name, external_audience_type, age_range, genders, interests, behaviors, estimated_size, size_lower_bound, size_upper_bound, status, source, last_synced_at')
        .eq('brand_container_id', bid)
        .order('platform', { ascending: true }),
      supabase
        .from('campaigns')
        .select('id, organization_id, nombre_campana, descripcion_interna, persona_id, brief_id, cta, cta_url, platform, platform_objective, status, budget_daily, budget_total, budget_currency, starts_at, ends_at, cached_impressions, cached_clicks, cached_spend, cached_conversions, cached_roas, cached_ctr, last_synced_at, source, updated_at, created_at, match_scores, real_demographics')
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
  }

  /* Datos en vivo: realtime sobre campanas/audiencias/segmentos/integraciones
     de esta sub-marca + polling de respaldo. Re-pinta solo los paneles resumen
     (lista de campanas + mini-dash); el canvas de nodos ya es live via
     CanvasStore (no lo tocamos). Teardown automatico en BaseView.destroy(). */
  _setupLive() {
    const bid = this._containerRow?.id;
    if (!this._supabase || !bid || this._liveReady) return;
    this._liveReady = true;

    const snapshot = () => ({
      campaigns: this._campaigns, audiences: this._audiences,
      segments: this._segments, integrations: this._integrations,
    });
    if (!this._liveSig) this._liveSig = {};
    this._liveSig['cc'] = this._dataSignature(snapshot());

    this._liveTick = () => this.liveRefresh('cc',
      async () => {
        window.apiClient?.invalidate?.(`cc:bundle:${bid}`);
        const bundle = await this._fetchCcBundle(this._supabase, bid);
        this._audiences = bundle.audiences; this._segments = bundle.segments;
        this._campaigns = bundle.campaigns; this._integrations = bundle.integrations;
        return bundle;
      },
      () => { this._renderCampaigns(); this._renderMiniDash?.(); });

    const f = `brand_container_id=eq.${bid}`;
    this.liveSubscribe([
      { name: 'camp', table: 'campaigns',         filter: f, onChange: () => this._liveTick() },
      { name: 'aud',  table: 'audience_personas', filter: f, onChange: () => this._liveTick() },
      { name: 'seg',  table: 'audience_segments', filter: f, onChange: () => this._liveTick() },
      { name: 'int',  table: 'brand_integrations',filter: f, onChange: () => this._liveTick() },
    ]);
    this.startLivePoll(60000, () => this._liveTick());
  }

  /* ── Data fetching ────────────────────────────────────────────────── */
  async _loadData() {
    this._subBrandShortId = String(this.routeParams?.subBrandShortId || '').trim().toLowerCase();
    this._subBrandSlug    = String(this.routeParams?.subBrandSlug || '').trim().toLowerCase();
    this._organizationId  = this._resolveOrganizationId();

    if (!this._organizationId) {
      this.updateHeaderContext(__('Command Center'), this._subBrandSlug || '—', window.currentOrgName || '');
      this._setError(__('Selecciona una organización o inicia sesión de nuevo.'));
      return;
    }

    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    this._supabase = supabase || null;
    if (!supabase) { this._setError(__('No hay conexión con la base de datos.')); return; }

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
        .select('id, nombre_marca, created_at, marketing_budget, marketing_budget_currency')
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
      ? (String(match.nombre_marca || '').trim() || __('Sub-marca'))
      : (this._subBrandSlug || this._subBrandShortId || '—');
    this.updateHeaderContext(__('Command Center'), displayName, window.currentOrgName || '');

    if (!match) {
      this._setError(__('No se encontró la sub-marca "{displayName}". Revisa el nombre en Brand Storage.', { displayName }));
      return;
    }

    this._containerRow = match;
    const bid = match.id;

    /* Fetch paralelo (snapshots + heatmap vía API: RLS suele devolver [] al cliente)
       Cacheado vía apiClient 60s + SWR por brand_container_id. */
    try {
      const bundle = window.apiClient
        ? await window.apiClient.query(`cc:bundle:${bid}`, () => this._fetchCcBundle(supabase, bid), { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await this._fetchCcBundle(supabase, bid);
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

    const twoCol = document.getElementById('ccTwoCol');
    if (twoCol) twoCol.style.display = '';

    this._renderCampaigns();    // alimenta la lista compacta del mini-dashboard
    this._renderCanvas();       // (mixin Canvas) nodos + aristas
    this._renderMiniDash();     // (mixin Canvas) stats + conteos
    this.updateLinksForRouter();
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
    const platformLabel = { meta_instagram: 'Instagram', meta_facebook: 'Facebook', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest', organic: __('Orgánico'), internal: __('Interno') };
    // Label de "Resultados" según el objetivo real de la campaña (Meta/Google).
    // Si no podemos inferir el tipo, default a "resultados" (genérico).
    const resultLabel = (obj) => {
      const s = String(obj || '').toLowerCase();
      if (s.includes('lead'))                                     return __('leads');
      if (s.includes('purchase') || s.includes('sales') || s.includes('conversion')) return __('compras');
      if (s.includes('install') || s.includes('app'))             return __('instalaciones');
      if (s.includes('message') || s.includes('chat'))            return __('mensajes');
      if (s.includes('engagement') || s.includes('reach'))        return __('interacciones');
      if (s.includes('traffic') || s.includes('link_click'))      return __('clics');
      if (s.includes('view') || s.includes('thruplay'))           return __('vistas');
      return __('resultados');
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
          <span class="cc-camp-name" title="${this.escapeHtml(c.nombre_campana || __('Campaña'))}">${this.escapeHtml(c.nombre_campana || __('Campaña'))}</span>
          <div class="cc-camp-badges">${stBadge}${platBadge}</div>
        </div>
        <dl class="cc-camp-stats">
          <div class="cc-camp-stat"><dt>${__('Publicada')}</dt><dd>${this.escapeHtml(fmtDate(c.starts_at || c.created_at))}</dd></div>
          <div class="cc-camp-stat"><dt>${__('Resultados')}</dt><dd>${fmtCompact(resultsValue)} <small>${this.escapeHtml(resultsLbl)}</small></dd></div>
          <div class="cc-camp-stat"><dt>${__('Gastos')}</dt><dd>${this.escapeHtml(fmtMoney(c.cached_spend, c.budget_currency))}</dd></div>
        </dl>
      </div>`;
    }).join('');
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

    // Anotaciones desde el header: crean la nota/grupo en el centro visible del
    // canvas (las funciones del mixin esperan coords de cliente y las convierten
    // a coords de mundo internamente).
    const createAtCanvasCenter = (fnName) => {
      const canvas = document.getElementById('ccCanvas');
      if (!canvas || typeof this[fnName] !== 'function') return;
      const r = canvas.getBoundingClientRect();
      this[fnName](r.left + r.width / 2, r.top + r.height / 2);
    };
    document.getElementById('ccBtnCreateNote')?.addEventListener('click', () => createAtCanvasCenter('_createStickyAt'));
    document.getElementById('ccBtnCreateGroup')?.addEventListener('click', () => createAtCanvasCenter('_createGroupAt'));

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
    const prefix = isAudience ? __('Nueva audiencia') : __('Nueva campaña');

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
      // Scope por estrategia: marcar como creado-en-sesion (visible aunque el
      // placement aun no persista) y escribir el placement de inmediato.
      const key = isAudience ? `aud:${data.id}` : `camp:${data.id}`;
      if (!this._sessionCreated) this._sessionCreated = new Set();
      this._sessionCreated.add(key);
      this._renderCanvas();
      const pos = this._positions && this._positions[key];
      if (pos && this._store) this._store.setNodePosition(key, pos.x, pos.y);
      if (typeof this._persistPlacementPosition === 'function') this._persistPlacementPosition(key);
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
