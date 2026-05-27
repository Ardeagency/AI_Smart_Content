/**
 * StudioView - Consumidor de flujos (content_flows).
 * Panel central vacío, footer con créditos y coste, sidebar con input_schema y envío a webhook_url.
 * Usa FlowWebhookService para ejecución con timeout y reintentos; deducción de créditos atómica vía RPC.
 */

const DEFAULT_STUDIO_TIMEOUT_MS = 120000;
const DEFAULT_STUDIO_MAX_RETRIES = 3;

class StudioView extends BaseView {
  static cacheable = true;
  static documentTitle = 'Studio';

  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.credits = { available: 0, total: 0 };
    this.flows = [];
    this.selectedFlow = null;
    this.livingManager = null;
    this._livingScopedFlowName = null;
    // Run activo del canvas (modelo Shakker: el canvas muestra solo los outputs de
    // este run). Se siembra desde ?run= en la URL (deep-link) y se actualiza al producir.
    this._activeRunId = null;
  }

  /** Lee el run activo desde la query string (?run=ID). */
  _getRunFromUrl() {
    try {
      return new URLSearchParams(window.location.search).get('run') || null;
    } catch (_) {
      return null;
    }
  }

  /** Refleja (o limpia) el run activo en la URL sin recargar, para deep-link/continuar. */
  _syncRunInUrl(runId) {
    try {
      const url = new URL(window.location.href);
      if (runId) url.searchParams.set('run', runId);
      else url.searchParams.delete('run');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  /**
   * Fija el run activo del canvas: actualiza estado, URL y livingManager, y carga
   * sus outputs. Como los outputs llegan async tras el webhook, hace un poll corto.
   */
  async setActiveRun(runId, { poll = false } = {}) {
    this._activeRunId = runId || null;
    this._syncRunInUrl(runId);
    if (this.livingManager && typeof this.livingManager.setActiveRun === 'function') {
      await this.livingManager.setActiveRun(runId);
      if (poll && runId) this._pollActiveRunOutputs(runId);
    }
  }

  /**
   * Poll tras producir: los outputs del run llegan async (webhook → n8n → ai-engine)
   * y pueden tardar varios minutos (render 4K). Mientras tanto el canvas muestra un
   * skeleton (ver renderEmptyState). El poll NO se rinde tras unos segundos: hace un
   * burst inicial y luego una cola sostenida hasta que aparece el output o se alcanza
   * un tope generoso. En cuanto hay outputs renderizados, detiene el poll (el skeleton
   * ya fue reemplazado por el output real).
   */
  _pollActiveRunOutputs(runId, attempt = 0) {
    if (this._activeRunId !== runId) return; // el usuario cambio de run; abortar
    if (this._activeRunHasOutputs(runId)) return; // ya llegó el output; nada que esperar
    const burst = [4000, 6000, 8000, 10000, 15000];
    const TAIL_MS = 20000;        // cola sostenida cada 20s
    const MAX_ATTEMPTS = 90;      // ~ burst (43s) + 85·20s ≈ 29 min de espera máxima
    if (attempt >= MAX_ATTEMPTS) {
      // Se agotó la espera sin output: tratamos el run como fallido y avisamos
      // al usuario en el canvas (sin popup).
      if (!this._activeRunHasOutputs(runId)) this._renderRunErrorState(runId);
      return;
    }
    const delay = attempt < burst.length ? burst[attempt] : TAIL_MS;
    setTimeout(async () => {
      if (this._activeRunId !== runId || !this.livingManager) return;
      try { await this.livingManager.setActiveRun(runId); } catch (_) {}
      if (this._activeRunHasOutputs(runId)) return; // output ya visible → no seguir
      // ¿El backend marcó el run como fallido? Avisar ya, sin esperar el tope.
      if (await this._isRunFailed(runId)) { this._renderRunErrorState(runId); return; }
      this._pollActiveRunOutputs(runId, attempt + 1);
    }, delay);
  }

  /** ¿El backend marcó este run como fallido? (status 'failed'/'error' en flow_runs). */
  async _isRunFailed(runId) {
    if (!runId || !this.supabase || this._activeRunId !== runId) return false;
    try {
      const { data } = await this.supabase
        .from('flow_runs')
        .select('status')
        .eq('id', runId)
        .maybeSingle();
      const s = (data?.status || '').toLowerCase();
      return s === 'failed' || s === 'error';
    } catch (_) {
      return false;
    }
  }

  /**
   * Reemplaza el skeleton de carga por un estado de error dentro del canvas
   * (sin popup): el flujo de n8n no entregó output a tiempo o el run quedó fallido.
   */
  _renderRunErrorState(runId) {
    if (runId && this._activeRunId !== runId) return;
    if (this._activeRunHasOutputs(runId)) return; // por si el output llegó justo ahora
    try {
      const canvas = document.getElementById('studioCanvas');
      if (!canvas) return;
      const target = canvas.querySelector('.studio-skeleton') || canvas.querySelector('.studio-history-empty');
      const html = `
        <div class="studio-skeleton studio-run-error" role="alert" aria-live="assertive">
          <p class="studio-skeleton-label">Se produjo un error en la producción</p>
          <p class="studio-skeleton-hint">No pudimos generar tu resultado. Intenta de nuevo o ajusta el formulario; si el problema persiste, contacta al administrador.</p>
        </div>`;
      if (target) target.outerHTML = html;
      else canvas.insertAdjacentHTML('afterbegin', html);
    } catch (_) {}
  }

  /** ¿El run activo ya tiene outputs renderizados en el canvas? (skeleton reemplazado) */
  _activeRunHasOutputs(runId) {
    if (runId && this._activeRunId !== runId) return false;
    try {
      const canvas = document.getElementById('studioCanvas');
      return !!(canvas && canvas.querySelector('.living-masonry-item'));
    } catch (_) {
      return false;
    }
  }

  _notify(message, _type = 'info') {
    if (typeof alert === 'function') alert(message);
  }

  /** Ruta base de Studio (con o sin org) para construir URL con slug del flujo. */
  getStudioBasePath() {
    if (!this.organizationId) return '/studio';
    const prefix = typeof window.getOrgPathPrefix === 'function' ? window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') : '';
    return prefix ? `${prefix}/studio` : '/studio';
  }

  /** Convierte el nombre del flujo en slug para la URL (ej: "Product Render Futurista" → "product-render-futurista"). */
  flowNameToSlug(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }

    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.organizationId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/create';
      window.router?.navigate(url, true);
      return;
    }

    localStorage.setItem('selectedOrganizationId', this.organizationId);
  }

  renderHTML() {
    return `
      <div class="studio-layout" id="studioContainer">
        <main class="studio-center">
          <div class="studio-canvas-empty studio-canvas--gallery" id="studioCanvas">
            <div id="livingHistoryContent" class="studio-canvas-living"></div>
          </div>
          <div class="studio-automated-wrap" id="studioAutomatedWrap" style="display: none;">
            <button type="button" class="studio-back-flows studio-back-flows--automated" id="studioBackFlowsAutomated"><i class="fas fa-arrow-left"></i> Elegir otro flujo</button>
            <div class="studio-automation-shell">
              <div class="studio-automation-main">
                <div class="studio-schedule-form-wrap" id="studioScheduleFormWrap">
                  <form class="studio-schedule-form" id="studioScheduleForm"></form>
                </div>
              </div>
              <aside class="studio-automation-summary" id="studioAutomationSummary" aria-label="Resumen de programación">
                <div class="studio-summary-body">
                  <header class="studio-summary-header">
                    <h2 class="studio-summary-title">Resumen</h2>
                  </header>
                  <div class="studio-summary-section">
                    <span class="studio-summary-label">Ejecución</span>
                    <p class="studio-summary-value" id="studioSummaryFreq">—</p>
                    <span class="studio-summary-hint" id="studioSummaryTz"></span>
                  </div>
                  <div class="studio-summary-section">
                    <span class="studio-summary-label">Producciones por ejecución</span>
                    <p class="studio-summary-value" id="studioSummaryCount">—</p>
                  </div>
                  <div class="studio-summary-section">
                    <span class="studio-summary-label">Formato</span>
                    <p class="studio-summary-value" id="studioSummaryFormat">—</p>
                  </div>
                  <div class="studio-summary-section studio-summary-section--cost">
                    <span class="studio-summary-label">Costo por ejecución</span>
                    <p class="studio-summary-value studio-summary-cost" id="studioSummaryCost">—</p>
                    <span class="studio-summary-hint" id="studioSummaryCostHint"></span>
                  </div>
                </div>
                <footer class="studio-summary-footer">
                  <button type="button" class="studio-automation-btn-primary" id="studioScheduleActivate">Activar</button>
                  <button type="button" class="studio-automation-btn-secondary" id="studioScheduleDraft">Borrador</button>
                </footer>
              </aside>
            </div>
          </div>
          <footer class="studio-footer">
            <div class="studio-footer-credits">
              <div class="studio-credits-icon"><i class="fas fa-coins"></i></div>
              <span class="studio-credits-text" id="studioCreditsText">0 créditos restantes</span>
              <span class="studio-credits-cost" id="studioCreditsCost"></span>
            </div>
            <button type="button" class="studio-btn-producir" id="studioProducirBtn" disabled>
              Producir
            </button>
          </footer>
        </main>

        <aside class="studio-sidebar-creative" id="studioSidebar">
          <div class="studio-sidebar-content">
            <div class="studio-flow-form-wrap" id="studioFlowFormWrap">
              <button type="button" class="studio-back-flows" id="studioBackFlows"><i class="fas fa-arrow-left"></i> Elegir otro flujo</button>
              <h3 class="studio-form-title" id="studioFormTitle"></h3>
              <form class="studio-flow-form" id="studioFlowForm"></form>
            </div>
          </div>
        </aside>
      </div>
    `;
  }

  async init() {
    window.studioView = this;
    await this.initSupabase();
    await Promise.all([this.loadCredits(), this.loadFlows()]);

    const flowSlug = (this.routeParams && this.routeParams.flowSlug) ? decodeURIComponent(this.routeParams.flowSlug) : null;
    const preselectedId = (window.appState && window.appState.get('selectedFlowId')) || localStorage.getItem('selectedFlowId');

    let flowToSelect = null;
    if (flowSlug) {
      const found = this.flows.find(f => this.flowNameToSlug(f.name) === flowSlug);
      if (found) flowToSelect = found;
    }
    if (!flowToSelect && preselectedId) {
      const byId = this.flows.find(f => f.id === preselectedId);
      if (byId) flowToSelect = byId;
      if (window.appState) window.appState.set('selectedFlowId', null, true);
      localStorage.removeItem('selectedFlowId');
    }

    if (flowToSelect) {
      this.selectedFlow = flowToSelect;
      this.updateCreditsDisplay();
      this.applyStudioMode(flowToSelect);
      if (!flowSlug && window.router) {
        const slug = this.flowNameToSlug(flowToSelect.name);
        if (slug) window.router.navigate(`${this.getStudioBasePath()}/${encodeURIComponent(slug)}`, true);
      }
    } else {
      // Sin flujo: Studio solo se accede desde flows (seleccionando un flujo). Redirigir a flows.
      const flowsPath = `${this.getStudioBasePath()}/flows`;
      if (window.router) window.router.navigate(flowsPath, true);
      return;
    }

    this.setupEventListeners();
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('Studio initSupabase:', e);
    }
  }

  async loadCredits() {
    if (!this.supabase || !this.organizationId) return;
    try {
      // Misma key que Navigation.loadCreditsFromDb → 1 sola query compartida.
      // El RPC deduct_credits_and_create_run invalida vía 'credits-updated'.
      const orgId = this.organizationId;
      const fetcher = async () => {
        const { data, error } = await this.supabase
          .from('organization_credits')
          .select('credits_available, credits_total')
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) throw error;
        return data;
      };
      const data = window.apiClient
        ? await window.apiClient.query(`nav:credits:${orgId}`, fetcher, { ttl: 15 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      if (data) {
        this.credits.available = data.credits_available ?? 0;
        this.credits.total = data.credits_total ?? 0;
      }
      this.updateCreditsDisplay();
      document.dispatchEvent(new CustomEvent('credits-updated'));
      if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
        await window.appNavigation.loadCreditsFromDb(this.organizationId);
      }
    } catch (e) {
      console.error('Studio loadCredits:', e);
    }
  }

  /**
   * Carga flujos (manuales y automatizados) con su primer módulo si existe (input_schema y webhooks en flow_modules).
   * Los flujos automatizados no son modulares y pueden no tener flow_modules.
   */
  async loadFlows() {
    if (!this.supabase) return;
    try {
      // Flows + flow_modules: cambian solo cuando un dev publica/edita. Cache 2 min + SWR.
      const fetcher = async () => {
        const { data, error } = await this.supabase
          .from('content_flows')
          .select(`
            id,
            name,
            description,
            token_cost,
            output_type,
            execution_mode,
            flow_category_type,
            flow_image_url,
            flow_modules ( step_order, input_schema, webhook_url_test, webhook_url_prod )
          `)
          .eq('is_active', true);
        return !error && data ? data : [];
      };
      const data = window.apiClient
        ? await window.apiClient.query('studio:flows', fetcher, { ttl: 2 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this.flows = data.map(f => this.buildFlowFromFirstModule(f));
    } catch (e) {
      console.error('Studio loadFlows:', e);
      this.flows = [];
    }
  }

  /**
   * Adaptador canónico: construye el objeto flujo que usa Studio a partir de content_flows + flow_modules.
   * Toma el primer módulo (por step_order) para input_schema y webhooks. Para manual y automated
   * los campos de entrada/programación viven en flow_modules.input_schema (único formato).
   */
  buildFlowFromFirstModule(flow) {
    const modules = (flow.flow_modules || []).slice().sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0));
    const first = modules[0] || null;
    const Service = (typeof window !== 'undefined' && window.FlowWebhookService) ? window.FlowWebhookService : null;
    const webhookUrlProd = first && Service ? Service.getWebhookUrl(first, 'prod') : (first?.webhook_url_prod || first?.webhook_url_test || null);
    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      token_cost: flow.token_cost,
      output_type: flow.output_type,
      execution_mode: flow.execution_mode || 'single_step',
      flow_category_type: flow.flow_category_type || 'manual',
      flow_image_url: flow.flow_image_url || null,
      input_schema: first?.input_schema ?? {},
      webhook_url: webhookUrlProd,
      webhook_url_test: first?.webhook_url_test,
      webhook_url_prod: first?.webhook_url_prod
    };
  }

  updateCreditsDisplay() {
    const textEl = document.getElementById('studioCreditsText');
    const costEl = document.getElementById('studioCreditsCost');
    if (textEl) {
      const n = this.credits.available;
      textEl.textContent = `${n.toLocaleString('es')} créditos restantes`;
    }
    if (costEl) {
      if (this.selectedFlow && this.selectedFlow.token_cost != null) {
        costEl.textContent = `${this.selectedFlow.token_cost} créditos esta producción`;
        costEl.style.display = '';
      } else {
        costEl.textContent = '';
        costEl.style.display = 'none';
      }
    }
    const btn = document.getElementById('studioProducirBtn');
    if (btn && this.selectedFlow) {
      const cost = this.selectedFlow.token_cost ?? 1;
      btn.disabled = !this.selectedFlow.webhook_url || this.credits.available < cost;
    }
  }

  selectFlow(flow) {
    this.selectedFlow = flow;
    this.updateCreditsDisplay();
    this.applyStudioMode(flow);

    const slug = this.flowNameToSlug(flow.name);
    if (slug && window.router) {
      window.router.navigate(`${this.getStudioBasePath()}/${encodeURIComponent(slug)}`, true);
    }
  }

  /**
   * Aplica el estado de Studio según el tipo de flujo: manual (sidebar + formulario + canvas)
   * o automático (solo hero + formulario de programación, sin sidebar ni canvas).
   */
  applyStudioMode(flow) {
    const type = flow && flow.flow_category_type ? flow.flow_category_type : 'manual';
    const isAutomated = (type === 'autopilot' || type === 'scraping');
    const container = document.getElementById('studioContainer');
    const canvasEl = document.getElementById('studioCanvas');
    const automatedWrap = document.getElementById('studioAutomatedWrap');
    const sidebar = document.getElementById('studioSidebar');
    const formWrap = document.getElementById('studioFlowFormWrap');
    const btn = document.getElementById('studioProducirBtn');

    if (container) container.classList.toggle('studio-layout--automated', isAutomated);

    if (isAutomated) {
      if (canvasEl) canvasEl.style.display = 'none';
      if (sidebar) sidebar.style.display = 'none';
      if (automatedWrap) {
        automatedWrap.style.display = 'flex';
        this.applyStudioFlowBackground(flow);
        this.renderScheduleForm(flow);
      }
      if (btn) btn.style.display = 'none';
    } else {
      if (canvasEl) canvasEl.style.display = '';
      if (sidebar) sidebar.style.display = '';
      if (automatedWrap) automatedWrap.style.display = 'none';
      if (formWrap) formWrap.style.display = 'block';
      this.renderFlowForm(flow);
      if (btn) {
        btn.style.display = '';
        const cost = flow.token_cost ?? 1;
        btn.disabled = !flow.webhook_url || this.credits.available < cost;
      }
      // Galería de producciones del flujo (mismo masonry justified que /production)
      this.initOrRefreshLivingGallery(flow);
    }
  }

  /**
   * Carga LivingManager bajo demanda y lo arranca filtrado por el flow seleccionado.
   * Si ya esta inicializado, solo actualiza el filterFlowName y re-renderiza.
   */
  async initOrRefreshLivingGallery(flow) {
    if (!flow || !flow.name) return;
    const flowName = flow.name;
    if (this.livingManager && this._livingScopedFlowName === flowName) return;

    if (this.livingManager) {
      // Cambio de flow: el run activo pertenece al flow anterior, se limpia.
      this._activeRunId = null;
      this._syncRunInUrl(null);
      this.livingManager.filterFlowName = flowName;
      this.livingManager.runScoped = true;
      this.livingManager.filterRunId = null;
      this._livingScopedFlowName = flowName;
      this.livingManager._historyVisibleCount = 0;
      if (typeof this.livingManager.renderHistorySection === 'function') {
        await this.livingManager.renderHistorySection();
      }
      return;
    }

    try {
      if (!window.LivingManager) {
        await this.loadScript('js/living.js', 'LivingManager');
      }
      if (!window.LivingManager) return;

      this._ensureProductionModalInBody();

      // Run activo: deep-link (?run=ID) en la primera carga, si existe.
      const activeRun = this._activeRunId || this._getRunFromUrl();
      this._activeRunId = activeRun;

      const lm = new window.LivingManager();
      lm.organizationId = this.organizationId;
      lm.filterFlowName = flowName;
      // Studio: el canvas se scopea a un solo run (modelo Shakker).
      lm.runScoped = true;
      lm.filterRunId = activeRun;
      // Studio scope: empty state propio (mantiene dot-pattern de fondo).
      // Run activo sin outputs todavia → SKELETON de carga (simula el producto que
      // viene en camino). Se mantiene hasta que el output del run aparece y lo
      // reemplaza (el poll persistente sigue trayendo el output aunque tarde).
      lm.renderEmptyState = () => (this.livingManager && this.livingManager.filterRunId)
        ? `
        <div class="studio-skeleton" role="status" aria-live="polite" aria-label="Generando producción">
          <div class="studio-skeleton-grid">
            <div class="studio-skeleton-card"><div class="living-history-skeleton"></div></div>
          </div>
          <p class="studio-skeleton-label">Generando tu producción…</p>
          <p class="studio-skeleton-hint">Esto puede tardar un momento. Tu resultado aparecerá aquí en cuanto esté listo.</p>
        </div>
      `
        : `
        <div class="living-history-empty studio-history-empty">
          <p class="living-history-empty-message">Empieza una nueva produccion</p>
          <p class="living-history-empty-hint">Llena el formulario de la derecha y pulsa Producir. Veras aqui los resultados de este run.</p>
        </div>
      `;
      this.livingManager = lm;
      this._livingScopedFlowName = flowName;
      await lm.init();
      // Si venimos con un run por deep-link, asegurar que sus outputs esten cargados.
      if (activeRun) {
        await lm.setActiveRun(activeRun);
      }
    } catch (e) {
      console.error('Studio initLivingGallery:', e);
    }
  }

  /**
   * Inyecta el shell del #productionModal en <body> si no existe ya (p.ej. cuando el
   * usuario llega a /studio sin haber pasado por /production primero). Idempotente.
   */
  _ensureProductionModalInBody() {
    if (document.getElementById('productionModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = this._buildProductionModalHTML();
    const modal = wrap.firstElementChild;
    if (modal) document.body.appendChild(modal);
  }

  /** HTML del production-modal (mismo shell que ProductionView). LivingManager lo popula. */
  _buildProductionModalHTML() {
    return `
      <div class="production-modal" id="productionModal" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="production-modal-backdrop" data-action="modal-close"></div>
        <div class="production-modal-content">
          <div class="production-modal-visual">
            <div class="production-modal-visual-inner">
              <img id="pmodalImage" src="" alt="" hidden>
              <video id="pmodalVideo" controls playsinline preload="metadata" hidden aria-label="Production video"></video>
              <canvas class="pmodal-edit-canvas" id="pmodalEditCanvas" hidden></canvas>
            </div>
            <div class="production-modal-toolbar" role="toolbar" aria-label="Acciones sobre la produccion">
              <button type="button" class="pmodal-toolpill" data-tool="edit" data-kie-model="google/nano-banana-edit"><i class="fas fa-pen"></i><span>Editar</span></button>
              <button type="button" class="pmodal-toolpill" data-tool="upscale" data-kie-model="topaz/image-upscale"><i class="fas fa-expand-alt"></i><span>Mejorar 4K</span></button>
              <button type="button" class="pmodal-toolpill" data-tool="remove-bg" data-kie-model="recraft/remove-background"><i class="fas fa-cut"></i><span>Sin fondo</span></button>
              <button type="button" class="pmodal-toolpill" data-tool="variations"><i class="fas fa-arrows-rotate"></i><span>Variar</span></button>
              <button type="button" class="pmodal-toolpill" data-tool="animate"><i class="fas fa-film"></i><span>Animar</span></button>
            </div>
            <div class="pmodal-edit-overlay" id="pmodalEditOverlay" hidden aria-hidden="true">
              <div class="pmodal-edit-toolbar" role="toolbar" aria-label="Herramientas de edicion">
                <button type="button" class="pmodal-edit-tool is-active" data-edit-tool="brush" title="Pincel" aria-label="Pincel"><i class="fas fa-paintbrush"></i></button>
                <button type="button" class="pmodal-edit-tool" data-edit-tool="eraser" title="Borrador" aria-label="Borrador"><i class="fas fa-eraser"></i></button>
                <label class="pmodal-edit-size"><i class="fas fa-circle" aria-hidden="true"></i><input type="range" id="pmodalEditBrushSize" min="10" max="200" value="60" aria-label="Tamano del pincel"></label>
                <button type="button" class="pmodal-edit-tool" data-edit-action="clear" title="Limpiar mascara" aria-label="Limpiar mascara"><i class="fas fa-trash"></i></button>
              </div>
              <div class="pmodal-edit-panel pmodal-edit-director">
                <div class="pmodal-edit-director-content">
                  <textarea id="pmodalEditPrompt" class="pmodal-edit-prompt pmodal-edit-director-input" rows="3" placeholder="Tu idea en texto — describe que cambiar en la zona pintada. La IA generara el prompt final." autocomplete="off" aria-label="Describe el cambio"></textarea>
                </div>
                <div class="pmodal-edit-attachments" id="pmodalEditAttachments" hidden></div>
                <div class="pmodal-edit-picker" id="pmodalEditPicker" hidden></div>
                <input type="file" id="pmodalEditFileInput" accept="image/jpeg,image/png,image/webp,image/jpg" style="display:none;" aria-hidden="true">
                <div class="pmodal-edit-director-controls">
                  <button type="button" class="pmodal-edit-add-btn" id="pmodalEditAddBtn" data-edit-action="add-attachment" aria-label="Adjuntar imagen o producto" hidden><i class="fas fa-plus" aria-hidden="true"></i></button>
                  <div class="pmodal-edit-mode-pills" role="tablist" aria-label="Modo de edicion">
                    <button type="button" class="pmodal-edit-mode-pill is-active" role="tab" aria-selected="true" data-edit-mode="remove"><i class="fas fa-eraser" aria-hidden="true"></i><span>Eliminar</span></button>
                    <button type="button" class="pmodal-edit-mode-pill" role="tab" aria-selected="false" data-edit-mode="replace"><i class="fas fa-arrows-rotate" aria-hidden="true"></i><span>Reemplazar</span></button>
                    <button type="button" class="pmodal-edit-mode-pill" role="tab" aria-selected="false" data-edit-mode="fix-product"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Corregir producto</span></button>
                    <button type="button" class="pmodal-edit-mode-pill" role="tab" aria-selected="false" data-edit-mode="change-product"><i class="fas fa-box" aria-hidden="true"></i><span>Cambiar producto</span></button>
                  </div>
                  <div class="pmodal-edit-actions">
                    <button type="button" class="pmodal-edit-btn pmodal-edit-btn--ghost" data-edit-action="cancel">Cancelar</button>
                    <button type="button" class="pmodal-edit-btn pmodal-edit-btn--accent" data-edit-action="apply"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>APLICAR</span></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <aside class="production-modal-side" aria-label="Detalles de la produccion">
            <header class="pmodal-side-header">
              <button type="button" class="pmodal-close" data-action="modal-close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
            </header>
            <nav class="pmodal-tabs" role="tablist" aria-label="Vistas de produccion">
              <button type="button" class="pmodal-tab is-active" role="tab" aria-selected="true" data-tab="output">Resultado</button>
              <button type="button" class="pmodal-tab" role="tab" aria-selected="false" data-tab="input">Briefing</button>
            </nav>
            <div class="pmodal-scroll" id="pmodalScroll">
              <div class="pmodal-pane pmodal-pane--output is-active" data-pane="output" role="tabpanel">
                <div class="pmodal-siblings" id="pmodalSiblings" hidden></div>
                <section class="pmodal-section pmodal-prompt-section">
                  <div class="pmodal-prompt-blocks" id="pmodalPromptBlocks"></div>
                  <details class="pmodal-prompt-raw" id="pmodalPromptRaw" hidden>
                    <summary><i class="fas fa-chevron-right pmodal-prompt-raw-caret"></i><span>Show generation details</span></summary>
                    <pre class="pmodal-prompt-raw-text" id="pmodalPromptRawText"></pre>
                  </details>
                </section>
                <section class="pmodal-section pmodal-info-section">
                  <h3 class="pmodal-section-title"><i class="fas fa-circle-info"></i> INFORMATION</h3>
                  <div class="pmodal-info-rows" id="pmodalInfoRows"></div>
                </section>
              </div>
              <div class="pmodal-pane pmodal-pane--input" data-pane="input" role="tabpanel" hidden>
                <div id="pmodalInputContent"></div>
              </div>
            </div>
            <div class="pmodal-cta-grid">
              <button type="button" class="pmodal-cta pmodal-cta--accent" data-action="animate"><i class="fas fa-film"></i><span>Animate</span></button>
              <button type="button" class="pmodal-cta pmodal-cta--outline" data-action="publish" disabled title="Proximamente"><i class="fas fa-upload"></i><span>Publish</span></button>
            </div>
            <div class="pmodal-secondary-grid">
              <button type="button" class="pmodal-secondary" data-action="open-in"><i class="fas fa-external-link-alt"></i><span>Open in</span></button>
              <button type="button" class="pmodal-secondary" data-action="reference" disabled title="Proximamente"><i class="fas fa-bookmark"></i><span>Reference</span></button>
            </div>
            <footer class="pmodal-footer">
              <button type="button" class="pmodal-footer-download" data-action="download"><i class="fas fa-download"></i><span>Download</span></button>
              <div class="pmodal-footer-icons">
                <button type="button" class="pmodal-icon-btn" data-action="like" aria-pressed="false" aria-label="Me gusta"><i class="fas fa-heart"></i></button>
                <div class="pmodal-kebab-wrap">
                  <button type="button" class="pmodal-icon-btn" data-action="kebab" aria-expanded="false" aria-label="Mas"><i class="fas fa-bars"></i></button>
                  <div class="pmodal-kebab-menu" role="menu" hidden>
                    <button type="button" role="menuitem" data-action="copy-prompt"><i class="fas fa-copy"></i> Copiar prompt</button>
                    <button type="button" role="menuitem" data-action="copy-url"><i class="fas fa-link"></i> Copiar enlace</button>
                    <button type="button" role="menuitem" class="pmodal-kebab-danger" data-action="delete"><i class="fas fa-trash"></i> Eliminar produccion</button>
                  </div>
                </div>
              </div>
            </footer>
          </aside>
        </div>
      </div>
    `;
  }

  /** Aplica la imagen del flujo como fondo del wrap automático (mismo patrón que product-view::before+::after). */
  applyStudioFlowBackground(flow) {
    const wrap = document.getElementById('studioAutomatedWrap');
    if (!wrap) return;
    const url = flow && flow.flow_image_url;
    if (url) wrap.style.setProperty('--studio-flow-bg', `url("${String(url).replace(/"/g, '\\"')}")`);
    else wrap.style.removeProperty('--studio-flow-bg');
  }

  /** Rellena el formulario de programación con input_schema del primer módulo (flujos automáticos). */
  renderScheduleForm(flow) {
    const formEl = document.getElementById('studioScheduleForm');
    if (!formEl || !flow) return;
    const schema = flow.input_schema || {};
    let fields = Array.isArray(schema.fields) ? schema.fields : [];
    // Flujos antiguos: inyectar/normalizar campos para tipo_entidad, campaña/audiencia como dropdown, production_count como num_stepper
    const hasTipoEntidad = fields.some(f => (f.key || f.name) === 'tipo_entidad');
    const hasEntityId = fields.some(f => (f.key || f.name) === 'entity_id');
    if (hasEntityId && !hasTipoEntidad) {
      const entityIdx = fields.findIndex(f => (f.key || f.name) === 'entity_id');
      const tipoField = {
        key: 'tipo_entidad',
        label: 'Tipo de entidad',
        input_type: 'select',
        required: true,
        options: [{ value: 'productos', label: 'Productos' }, { value: 'servicio', label: 'Servicio' }],
        defaultValue: 'productos'
      };
      fields = [...fields.slice(0, entityIdx), tipoField, ...fields.slice(entityIdx)];
    }
    fields = fields.map(f => {
      const key = f.key || f.name;
      if (key === 'campaign_id' && (f.input_type === 'campaign_selector' || f.type === 'campaign_selector')) {
        return { ...f, input_type: 'select', options: f.options && f.options.length ? f.options : [{ value: '', label: 'Selecciona campaña...' }] };
      }
      if (key === 'audience_id' && (f.input_type === 'audience_selector' || f.type === 'audience_selector')) {
        return { ...f, input_type: 'select', options: f.options && f.options.length ? f.options : [{ value: '', label: 'Selecciona audiencia...' }] };
      }
      if (key === 'production_count' && (f.input_type === 'number' || f.type === 'number')) {
        return { ...f, input_type: 'num_stepper', step: f.step != null ? f.step : 1, min: f.min != null ? f.min : 1, max: f.max != null ? f.max : 10, defaultValue: f.defaultValue != null ? f.defaultValue : 1 };
      }
      return f;
    });
    if (fields.length === 0) {
      formEl.innerHTML = '<p class="studio-form-empty">Este flujo no tiene campos de programación definidos.</p>';
      return;
    }
    const Registry = window.InputRegistry;
    if (Registry && Registry.renderFormFromSchema) {
      formEl.innerHTML = Registry.renderFormFromSchema(fields, {
        idPrefix: 'studio-schedule-',
        wrapperClass: 'studio-field',
        showLabel: true,
        showHelper: true,
        showRequired: true
      });
      if (Registry.initFormPickers) Registry.initFormPickers(formEl);
      this._applyScheduleProgramacionWidget(formEl);
      this._applyScheduleFormEntityByType(formEl);
      this._decorateScheduleFormGrid(formEl);
    } else {
      formEl.innerHTML = fields.map(f => this.renderFormField(f)).join('');
    }
  }

  /**
   * Widget de programación: por horas, por día, por semana, personalizado.
   * Reemplaza el control cron_expression y escribe la expresión cron en un hidden.
   */
  _renderScheduleProgramacionWidgetHTML() {
    const prefix = 'studio-schedule-programacion';
    const stepper = (key, min, max, step, defaultValue, label, unit = '') => {
      const val = defaultValue != null ? defaultValue : min;
      return (
        '<div class="studio-programacion-row">' +
        (label ? '<label class="studio-programacion-label">' + this.escapeHtml(label) + '</label>' : '') +
        '<div class="input-stepper-wrap" data-schedule-stepper="' + key + '">' +
        '<input type="number" class="modern-input input-stepper-input" data-schedule-key="' + key + '" value="' + val + '" min="' + min + '" max="' + max + '" step="' + step + '">' +
        '<div class="input-stepper-btns">' +
        '<button type="button" class="input-stepper-btn" data-dir="up" tabindex="-1"><i class="ph ph-caret-up"></i></button>' +
        '<button type="button" class="input-stepper-btn" data-dir="down" tabindex="-1"><i class="ph ph-caret-down"></i></button>' +
        '</div>' +
        (unit ? '<span class="input-stepper-unit">' + this.escapeHtml(unit) + '</span>' : '') +
        '</div></div>'
      );
    };
    const weekdays = [
      { value: '0', label: 'Dom' }, { value: '1', label: 'Lun' }, { value: '2', label: 'Mar' },
      { value: '3', label: 'Mié' }, { value: '4', label: 'Jue' }, { value: '5', label: 'Vie' }, { value: '6', label: 'Sáb' }
    ];
    const weekdayCheckboxes = weekdays.map(d => (
      '<label class="studio-weekday-check"><input type="checkbox" data-schedule-key="schedule_dow" data-dow="' + d.value + '"><span>' + this.escapeHtml(d.label) + '</span></label>'
    )).join('');
    const weekdayCheckboxesCustom = weekdays.map(d => (
      '<label class="studio-weekday-check"><input type="checkbox" data-schedule-key="schedule_custom_dow" data-dow="' + d.value + '"><span>' + this.escapeHtml(d.label) + '</span></label>'
    )).join('');
    return (
      '<div class="studio-programacion-widget" id="' + prefix + '-widget">' +
      '<select class="modern-input input-dropdown-select studio-programacion-select" id="' + prefix + '-type" data-schedule-key="schedule_type" aria-label="Tipo de programación">' +
      '<option value="por_dia">Día</option>' +
      '<option value="por_horas">Hora</option>' +
      '<option value="por_semana">Semanal</option>' +
      '<option value="personalizado">Personalizado</option>' +
      '</select>' +
      '<input type="hidden" name="cron_expression" id="studio-schedule-cron_expression" value="0 */1 * * *">' +
      '<div class="schedule-panel" data-panel="por_horas">' +
      stepper('schedule_hours_interval', 1, 24, 1, 1, 'Cada', 'horas') +
      stepper('schedule_minutes_at', 0, 59, 1, 0, 'En el minuto', '') +
      '</div>' +
      '<div class="schedule-panel" data-panel="por_dia" style="display:none">' +
      stepper('schedule_days_interval', 1, 31, 1, 1, 'Cada', 'días') +
      stepper('schedule_hour_at', 0, 23, 1, 6, 'A la hora', '') +
      stepper('schedule_minute_at', 0, 59, 1, 6, 'En el minuto', '') +
      '</div>' +
      '<div class="schedule-panel" data-panel="por_semana" style="display:none">' +
      stepper('schedule_weeks_interval', 1, 4, 1, 1, 'Cada', 'semanas') +
      '<div class="studio-programacion-row"><span class="studio-programacion-label">Días de la semana</span><div class="studio-weekdays">' + weekdayCheckboxes + '</div></div>' +
      stepper('schedule_week_hour', 0, 23, 1, 9, 'A la hora', '') +
      stepper('schedule_week_minute', 0, 59, 1, 0, 'En el minuto', '') +
      '</div>' +
      '<div class="schedule-panel schedule-panel--personalizado" data-panel="personalizado" style="display:none">' +
      '<div class="studio-programacion-section"><span class="studio-programacion-section-title">Por horas</span>' +
      stepper('schedule_custom_hours_interval', 1, 24, 1, 1, 'Cada', 'horas') +
      stepper('schedule_custom_minutes_at', 0, 59, 1, 0, 'En el minuto', '') +
      '</div>' +
      '<div class="studio-programacion-section"><span class="studio-programacion-section-title">Por día</span>' +
      stepper('schedule_custom_days_interval', 1, 31, 1, 1, 'Cada', 'días') +
      stepper('schedule_custom_hour_at', 0, 23, 1, 6, 'A la hora', '') +
      stepper('schedule_custom_minute_at', 0, 59, 1, 6, 'En el minuto', '') +
      '</div>' +
      '<div class="studio-programacion-section"><span class="studio-programacion-section-title">Por semana</span>' +
      stepper('schedule_custom_weeks_interval', 1, 4, 1, 1, 'Cada', 'semanas') +
      '<div class="studio-programacion-row"><span class="studio-programacion-label">Días de la semana</span><div class="studio-weekdays">' + weekdayCheckboxesCustom + '</div></div>' +
      stepper('schedule_custom_week_hour', 0, 23, 1, 9, 'A la hora', '') +
      stepper('schedule_custom_week_minute', 0, 59, 1, 0, 'En el minuto', '') +
      '</div></div></div>'
    );
  }

  _applyScheduleProgramacionWidget(formEl) {
    const wrapper = formEl.querySelector('.studio-field[data-key="cron_expression"]');
    if (!wrapper) return;
    const controlSlot = wrapper.children[1];
    if (!controlSlot) return;
    const container = document.createElement('div');
    container.className = 'studio-programacion-slot';
    container.innerHTML = this._renderScheduleProgramacionWidgetHTML();
    controlSlot.replaceWith(container);
    this._initScheduleProgramacionWidget(container);
  }

  _initScheduleProgramacionWidget(widgetEl) {
    const prefix = 'studio-schedule-programacion';
    const typeSelect = widgetEl.querySelector('#' + prefix + '-type');
    const hiddenCron = widgetEl.querySelector('input[name="cron_expression"]');
    const panels = widgetEl.querySelectorAll('.schedule-panel');
    if (!typeSelect || !hiddenCron) return;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || min));
    const getVal = (key) => {
      const el = widgetEl.querySelector('[data-schedule-key="' + key + '"]');
      if (!el) return null;
      if (el.type === 'checkbox') return el.checked;
      if (el.type === 'number') return clamp(parseInt(el.value, 10), parseInt(el.min, 10), parseInt(el.max, 10));
      return (el.value || '').trim();
    };
    const setVal = (key, value) => {
      const el = widgetEl.querySelector('[data-schedule-key="' + key + '"]');
      if (el && el.type === 'number') el.value = value;
    };

    const buildCron = () => {
      const type = typeSelect.value || 'por_horas';
      if (type === 'personalizado') {
        const customChecked = widgetEl.querySelectorAll('[data-schedule-key="schedule_custom_dow"]:checked');
        const customDow = Array.from(customChecked).map(c => c.getAttribute('data-dow')).filter(Boolean);
        const customDays = getVal('schedule_custom_days_interval');
        if (customDow.length > 0) {
          const h = getVal('schedule_custom_week_hour') != null ? getVal('schedule_custom_week_hour') : 9;
          const m = getVal('schedule_custom_week_minute') != null ? getVal('schedule_custom_week_minute') : 0;
          return m + ' ' + h + ' * * ' + customDow.join(',');
        }
        if (customDays != null && customDays >= 1) {
          const h = getVal('schedule_custom_hour_at') != null ? getVal('schedule_custom_hour_at') : 6;
          const m = getVal('schedule_custom_minute_at') != null ? getVal('schedule_custom_minute_at') : 6;
          return m + ' ' + h + ' */' + customDays + ' * *';
        }
        const h = getVal('schedule_custom_hours_interval') || 1;
        const m = getVal('schedule_custom_minutes_at') != null ? getVal('schedule_custom_minutes_at') : 0;
        return m + ' */' + h + ' * * *';
      }
      if (type === 'por_horas') {
        const h = getVal('schedule_hours_interval') || 1;
        const m = getVal('schedule_minutes_at') != null ? getVal('schedule_minutes_at') : 0;
        return m + ' */' + h + ' * * *';
      }
      if (type === 'por_dia') {
        const d = getVal('schedule_days_interval') || 1;
        const h = getVal('schedule_hour_at') != null ? getVal('schedule_hour_at') : 6;
        const m = getVal('schedule_minute_at') != null ? getVal('schedule_minute_at') : 6;
        return m + ' ' + h + ' */' + d + ' * *';
      }
      if (type === 'por_semana') {
        const checked = widgetEl.querySelectorAll('[data-schedule-key="schedule_dow"]:checked');
        const dow = Array.from(checked).map(c => c.getAttribute('data-dow')).filter(Boolean);
        const dowStr = dow.length ? dow.join(',') : '1';
        const h = getVal('schedule_week_hour') != null ? getVal('schedule_week_hour') : 9;
        const m = getVal('schedule_week_minute') != null ? getVal('schedule_week_minute') : 0;
        return m + ' ' + h + ' * * ' + dowStr;
      }
      return '0 */1 * * *';
    };

    const updateCron = () => {
      hiddenCron.value = buildCron();
      this.updateCreditsDisplay();
      this._updateScheduleSummary();
    };

    typeSelect.addEventListener('change', () => {
      const type = typeSelect.value;
      panels.forEach(p => {
        p.style.display = p.dataset.panel === type ? '' : 'none';
      });
      updateCron();
    });

    panels.forEach(p => p.style.display = p.dataset.panel === (typeSelect.value || 'por_horas') ? '' : 'none');

    widgetEl.querySelectorAll('.input-stepper-wrap').forEach(wrap => {
      const input = wrap.querySelector('.input-stepper-input');
      const up = wrap.querySelector('.input-stepper-btn[data-dir="up"]');
      const down = wrap.querySelector('.input-stepper-btn[data-dir="down"]');
      if (!input || !up || !down) return;
      const step = parseInt(input.step, 10) || 1;
      const min = parseInt(input.min, 10);
      const max = parseInt(input.max, 10);
      up.addEventListener('click', () => {
        const v = clamp(parseInt(input.value, 10) + step, min, max);
        input.value = v;
        updateCron();
      });
      down.addEventListener('click', () => {
        const v = clamp(parseInt(input.value, 10) - step, min, max);
        input.value = v;
        updateCron();
      });
      input.addEventListener('input', updateCron);
      input.addEventListener('change', updateCron);
    });

    widgetEl.querySelectorAll('[data-schedule-key="schedule_dow"]').forEach(cb => {
      cb.addEventListener('change', updateCron);
    });
    widgetEl.querySelectorAll('[data-schedule-key="schedule_custom_dow"]').forEach(cb => {
      cb.addEventListener('change', updateCron);
    });

    updateCron();
  }

  /**
   * Genera el HTML del control Entidad según tipo_entidad: productos → image_selector (carrusel múltiple), servicio → dropdown.
   */
  _renderScheduleEntityControl(tipoEntidad) {
    const id = 'studio-schedule-entity_id';
    const name = 'entity_id';
    if (tipoEntidad === 'productos') {
      // id en el contenedor visible (para que <label for> apunte a un control focusable y no al hidden)
      return (
        '<div class="image-selector-carousel" id="' + id + '" tabindex="0" role="group" aria-label="Entidad" data-media-source="products" data-selection-mode="multiple" data-key="entity_id" data-field-name="' + name + '">' +
        '<div class="image-selector-carousel-track image-selector-carousel-track--empty" data-empty-msg="Selecciona producto(s)..."></div>' +
        '<input type="hidden" id="studio-schedule-entity_id_value" name="' + name + '" value="">' +
        '</div>'
      );
    }
    return (
      '<div class="input-dropdown-wrap">' +
      '<select class="modern-input input-dropdown-select" id="' + id + '" name="' + name + '" aria-label="Entidad">' +
      '<option value="">Selecciona un servicio...</option>' +
      '</select>' +
      '</div>'
    );
  }

  /**
   * Si el schema tiene tipo_entidad y entity_id, reemplaza el control Entidad por image_selector (productos) o dropdown (servicio).
   */
  _applyScheduleFormEntityByType(formEl) {
    const tipoWrapper = formEl.querySelector('.studio-field[data-key="tipo_entidad"]');
    const entityWrapper = formEl.querySelector('.studio-field[data-key="entity_id"]');
    if (!tipoWrapper || !entityWrapper) return;
    const tipoSelect = formEl.querySelector('select[name="tipo_entidad"]');
    if (!tipoSelect) return;
    const controlSlot = entityWrapper.children[1];
    if (!controlSlot) return;
    const container = document.createElement('div');
    container.className = 'studio-entity-control-slot';
    const update = () => {
      const value = tipoSelect.value || 'productos';
      container.innerHTML = this._renderScheduleEntityControl(value);
      if (value === 'productos') {
        const carousels = container.querySelectorAll('.image-selector-carousel');
        if (carousels.length) this._fillProductCarousels(Array.from(carousels));
      }
    };
    update();
    controlSlot.replaceWith(container);
    tipoSelect.addEventListener('change', update);
  }

  /**
   * Reorganiza los campos del formulario de programación en un grid de 3 tarjetas:
   * Frecuencia, Contexto de producción y Especificaciones.
   */
  _decorateScheduleFormGrid(formEl) {
    if (!formEl || formEl.dataset.studioScheduleGrid === '1') return;
    formEl.dataset.studioScheduleGrid = '1';

    const existingFields = Array.from(formEl.querySelectorAll('.studio-field'));
    if (existingFields.length === 0) return;

    const grid = document.createElement('div');
    grid.className = 'studio-schedule-grid';
    formEl.appendChild(grid);

    const makeCard = (title, modifier) => {
      const section = document.createElement('section');
      section.className = 'studio-schedule-card' + (modifier ? ' ' + modifier : '');
      section.innerHTML =
        '<header class="studio-schedule-card-header">' +
        '<h3 class="studio-schedule-card-title">' + this.escapeHtml(title) + '</h3>' +
        '</header>' +
        '<div class="studio-schedule-card-body"></div>';
      return section;
    };

    const freqCard = makeCard('Frecuencia', 'studio-schedule-card--frequency');
    const ctxCard = makeCard('Contexto de producción', 'studio-schedule-card--context');
    const specsCard = makeCard('Especificaciones', 'studio-schedule-card--specs');

    const freqBody = freqCard.querySelector('.studio-schedule-card-body');
    const ctxBody = ctxCard.querySelector('.studio-schedule-card-body');
    const specsBody = specsCard.querySelector('.studio-schedule-card-body');

    grid.appendChild(freqCard);
    grid.appendChild(ctxCard);
    grid.appendChild(specsCard);

    const moveFieldByKey = (key, target) => {
      if (!key || !target) return;
      const field = formEl.querySelector('.studio-field[data-key="' + key + '"]');
      if (field) target.appendChild(field);
    };

    // Frecuencia: cron + volumen + formato
    moveFieldByKey('cron_expression', freqBody);
    moveFieldByKey('production_count', freqBody);
    moveFieldByKey('aspect_ratio', freqBody);

    // Contexto de producción
    moveFieldByKey('tipo_entidad', ctxBody);
    moveFieldByKey('entity_id', ctxBody);
    moveFieldByKey('campaign_id', ctxBody);
    moveFieldByKey('audience_id', ctxBody);

    // Especificaciones: primer textarea que quede disponible
    let specsField = formEl.querySelector('.studio-field textarea');
    if (specsField) {
      specsField = specsField.closest('.studio-field');
      if (specsField) specsBody.appendChild(specsField);
    }

    // Mover cualquier campo que haya quedado suelto al contexto, para no perder nada.
    const remaining = Array.from(formEl.querySelectorAll('.studio-field')).filter(el => !grid.contains(el));
    remaining.forEach(el => ctxBody.appendChild(el));

    // Listeners para refrescar el Resumen en vivo cuando cambien production_count o aspect_ratio.
    grid.addEventListener('input', () => this._updateScheduleSummary());
    grid.addEventListener('change', () => this._updateScheduleSummary());

    this._bindScheduleSummaryActions();
    this._updateScheduleSummary();
  }

  /**
   * Traduce un cron expression generado por el widget a texto humano.
   * Soporta los patrones que produce buildCron: por_horas, por_dia, por_semana, personalizado.
   */
  _cronToHuman(cron) {
    if (!cron || typeof cron !== 'string') return '—';
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return cron;
    const [min, hour, dom, , dow] = parts;
    const dowNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const pad = (s) => String(parseInt(s, 10) || 0).padStart(2, '0');

    if (dow !== '*' && dow.length > 0) {
      const days = dow.split(',').map(d => dowNames[parseInt(d, 10)] || d).join(', ');
      return `${days} a las ${pad(hour)}:${pad(min)}`;
    }
    if (dom.startsWith('*/')) {
      const n = dom.slice(2);
      return `Cada ${n} ${n === '1' ? 'día' : 'días'} a las ${pad(hour)}:${pad(min)}`;
    }
    if (hour.startsWith('*/')) {
      const n = hour.slice(2);
      return `Cada ${n} ${n === '1' ? 'hora' : 'horas'} (min ${pad(min)})`;
    }
    if (hour !== '*' && dom === '*') {
      return `Diariamente a las ${pad(hour)}:${pad(min)}`;
    }
    return cron;
  }

  /** Refresca el panel Resumen con cron en lenguaje humano, cantidad, formato y costo. */
  _updateScheduleSummary() {
    const cron = document.getElementById('studio-schedule-cron_expression')?.value || '';
    const countEl = document.querySelector('#studioScheduleForm [name="production_count"]');
    const ratioEl = document.querySelector('#studioScheduleForm [name="aspect_ratio"]');
    const count = parseInt(countEl?.value || '1', 10) || 1;
    const tokenCost = parseInt(this.selectedFlow?.token_cost || 0, 10) || 0;
    const totalCost = count * tokenCost;

    const freqEl = document.getElementById('studioSummaryFreq');
    const tzEl = document.getElementById('studioSummaryTz');
    const countSummary = document.getElementById('studioSummaryCount');
    const formatSummary = document.getElementById('studioSummaryFormat');
    const costEl = document.getElementById('studioSummaryCost');
    const costHintEl = document.getElementById('studioSummaryCostHint');

    if (freqEl) freqEl.textContent = this._cronToHuman(cron);
    if (tzEl) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
        tzEl.textContent = `Zona horaria: ${tz}`;
      } catch (_) { tzEl.textContent = ''; }
    }
    if (countSummary) countSummary.textContent = String(count);
    if (formatSummary) formatSummary.textContent = (ratioEl?.value || '—');
    if (costEl) {
      costEl.textContent = totalCost > 0 ? `${totalCost.toLocaleString('es')} créditos` : '—';
    }
    if (costHintEl) {
      costHintEl.textContent = tokenCost > 0
        ? `${count} × ${tokenCost} créditos / imagen`
        : '';
    }
  }

  _bindScheduleSummaryActions() {
    const activateBtn = document.getElementById('studioScheduleActivate');
    const draftBtn = document.getElementById('studioScheduleDraft');
    if (activateBtn && !activateBtn.dataset.bound) {
      activateBtn.dataset.bound = '1';
      activateBtn.addEventListener('click', () => this._saveSchedule('active'));
    }
    if (draftBtn && !draftBtn.dataset.bound) {
      draftBtn.dataset.bound = '1';
      draftBtn.addEventListener('click', () => this._saveSchedule('draft'));
    }
  }

  /** Inserta un flow_schedules con el estado pedido (active | draft). */
  async _saveSchedule(status) {
    if (!this.supabase || !this.selectedFlow) {
      this._notify('No hay flujo seleccionado.');
      return;
    }
    const formEl = document.getElementById('studioScheduleForm');
    if (!formEl) return;

    const data = {};
    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      const name = el.getAttribute('name');
      if (!name || el.type === 'checkbox') return;
      data[name] = (el.value || '').trim();
    });

    const cron = data.cron_expression || document.getElementById('studio-schedule-cron_expression')?.value || '';
    if (!cron) { this._notify('Programación inválida.'); return; }

    const entityVal = document.getElementById('studio-schedule-entity_id_value')?.value || data.entity_id || '';
    const entityIds = entityVal ? entityVal.split(',').filter(Boolean) : null;
    const campaignId = data.campaign_id || null;
    const audienceId = data.audience_id || null;
    const productionCount = parseInt(data.production_count || '1', 10) || 1;
    const aspectRatio = data.aspect_ratio || '1:1';
    const specs = data.production_specifications || '';

    const jobName = `${this.selectedFlow.name} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const brandId = await this.getBrandContainerId();

    const insert = {
      user_id: this.userId,
      flow_id: this.selectedFlow.id,
      brand_id: brandId || null,
      cron_expression: cron,
      status,
      job_name: jobName,
      entity_ids: entityIds,
      campaign_ids: campaignId ? [campaignId] : null,
      campaign_id: campaignId,
      audience_ids: audienceId ? [audienceId] : null,
      persona_id: audienceId,
      production_count: productionCount,
      aspect_ratio: aspectRatio,
      production_specifications: specs || null
    };

    const btnId = status === 'active' ? 'studioScheduleActivate' : 'studioScheduleDraft';
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = true;
    try {
      const { error } = await this.supabase.from('flow_schedules').insert(insert).select('id').single();
      if (error) {
        console.error('[Studio] _saveSchedule:', error);
        this._notify(`Error al ${status === 'active' ? 'activar' : 'guardar borrador'}: ${error.message}`);
        return;
      }
      this._notify(status === 'active' ? 'Programación activada' : 'Borrador guardado');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  renderFlowForm(flow) {
    const titleEl = document.getElementById('studioFormTitle');
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl || !flow) return;

    if (titleEl) titleEl.textContent = flow.name;

    const schema = flow.input_schema || {};
    const fields = Array.isArray(schema) ? schema : (schema.fields || schema.inputs || []);
    if (!Array.isArray(fields) || fields.length === 0) {
      formEl.innerHTML = '<p class="studio-form-empty">Este flujo no requiere datos adicionales.</p>';
      return;
    }

    const Registry = window.InputRegistry;
    if (Registry && Registry.renderFormFromSchema) {
      formEl.innerHTML = Registry.renderFormFromSchema(fields, {
        idPrefix: 'studio-',
        wrapperClass: 'studio-field',
        showLabel: true,
        showHelper: true,
        showRequired: true
      });
      if (Registry.initFormPickers) Registry.initFormPickers(formEl);
    } else {
      formEl.innerHTML = fields.map(f => this.renderFormField(f)).join('');
      if (Registry && Registry.initFormPickers) Registry.initFormPickers(formEl);
      else if (Registry) {
        if (Registry.initColorsPicker) Registry.initColorsPicker(formEl);
        if (Registry.initAspectRatioPicker) Registry.initAspectRatioPicker(formEl);
      }
    }

    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', () => this.updateCreditsDisplay());
      el.addEventListener('change', () => this.updateCreditsDisplay());
    });

    // Poblar carruseles, selectores de enfoque y colores por defecto desde la marca
    setTimeout(() => {
      this.populateImageSelectorCarousels();
      this.populateFocusSelectorAccordions();
      this.populateColoresFromBrand();
    }, 0);
  }

  /**
   * Obtiene los hex de colores de la marca (brand_colors) para un brand_container_id. Máx. 6.
   * Solo lectura; no modifica la marca. Usado para prellenar el campo "colores" en el formulario.
   */
  async getBrandColorsForContainer(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      // Cache 5 min — los colores cambian solo en el editor de marca. Esa vista
      // invalida `brand:colors:${orgId}` y `theme:colors:${orgId}` pero esta
      // key es por brandContainerId, otro plano.
      const fetcher = async () => {
        // brand_colors es org-scoped en el schema actual (no por container).
        // Resolvemos organization_id desde el container y filtramos por org.
        const { data: container, error: e1 } = await this.supabase
          .from('brand_containers')
          .select('organization_id')
          .eq('id', brandContainerId)
          .maybeSingle();
        if (e1 || !container?.organization_id) return [];
        const { data: colors, error: e2 } = await this.supabase
          .from('brand_colors')
          .select('hex_value')
          .eq('organization_id', container.organization_id)
          .order('created_at', { ascending: true });
        if (e2 || !colors || colors.length === 0) return [];
        const seen = new Set();
        const hexes = [];
        for (const row of colors) {
          const raw = (row.hex_value || '').trim().replace(/^#/, '');
          if (!/^[0-9A-Fa-f]{6}$/.test(raw)) continue;
          const hex = '#' + raw;
          if (!seen.has(hex)) {
            seen.add(hex);
            hexes.push(hex);
            if (hexes.length >= 6) break;
          }
        }
        return hexes;
      };
      return window.apiClient
        ? await window.apiClient.query(`studio:brand_colors:${brandContainerId}`, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('Studio getBrandColorsForContainer:', e);
      return [];
    }
  }

  /**
   * Prellena los campos "colores" vacíos con los colores de la marca. Solo afecta al valor del formulario (JSON del webhook); no modifica brand_colors.
   */
  async populateColoresFromBrand() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return;
    const wraps = formEl.querySelectorAll('.input-colors-wrap[data-colors-brand-style="1"]');
    if (wraps.length === 0) return;
    const brandContainerId = await this.getBrandContainerId();
    const brandHexes = brandContainerId ? await this.getBrandColorsForContainer(brandContainerId) : [];
    if (brandHexes.length === 0) return;
    const maxDefault = 6;
    const hexList = brandHexes.slice(0, maxDefault);
    wraps.forEach(wrap => {
      const hidden = wrap.previousElementSibling;
      if (!hidden || !hidden.classList.contains('input-colors-value')) return;
      const current = (hidden.value || '').split(',').map(s => s.trim()).filter(Boolean);
      if (current.length > 0) return;
      const max = Math.max(1, Math.min(12, parseInt(wrap.getAttribute('data-colors-max'), 10) || 6));
      const list = hexList.slice(0, max);
      hidden.value = list.join(',');
      wrap._colorsInit = false;
      wrap.innerHTML = list.map(hex =>
        `<div class="color-swatch" style="background:${hex};" data-hex="${hex}"><button type="button" class="color-delete-btn" title="Eliminar" aria-label="Eliminar color">×</button></div>`
      ).join('') + (list.length < max
        ? '<button type="button" class="color-swatch-add-btn" title="Agregar color" aria-label="Agregar color"><span>+</span></button>'
        : '');
    });
    if (window.InputRegistry && window.InputRegistry.initColorsPicker) {
      window.InputRegistry.initColorsPicker(formEl);
    }
    if (window.InputRegistry && window.InputRegistry.initAspectRatioPicker) {
      window.InputRegistry.initAspectRatioPicker(formEl);
    }
  }

  /**
   * Obtiene el brand_container_id para cargar productos de la marca del usuario.
   * 1) Intenta por organización (brand_containers.organization_id).
   * 2) Si no hay marca en la org, fallback por usuario (brand_containers.user_id) para que el usuario vea sus productos.
   * Misma relación que en products.js: products.brand_container_id → brand_containers.id
   */
  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      const cacheKey = `studio:bc_id:org=${this.organizationId || ''}:user=${this.userId || ''}`;
      const fetcher = async () => {
        // 1) Marca de la organización (cuando la org tiene brand_containers con organization_id)
        if (this.organizationId) {
          const { data: byOrg, error: errOrg } = await this.supabase
            .from('brand_containers')
            .select('id')
            .eq('organization_id', this.organizationId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!errOrg && byOrg && byOrg.id) return byOrg.id;
        }
        // 2) Fallback: marca del usuario (user_id), como en products.js
        if (this.userId) {
          const { data: byUser, error: errUser } = await this.supabase
            .from('brand_containers')
            .select('id')
            .eq('user_id', this.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!errUser && byUser && byUser.id) return byUser.id;
        }
        return null;
      };
      return window.apiClient
        ? await window.apiClient.query(cacheKey, fetcher, { ttl: 10 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('Studio getBrandContainerId:', e);
      return null;
    }
  }

  /**
   * Carga productos con sus imágenes (misma lógica que products.js loadProducts).
   * Tablas: products (brand_container_id), product_images (product_id, image_url, image_type, image_order).
   * Devuelve array de productos con .images = [{ image_url, image_type, image_order }, ...].
   * Imagen principal: primera de la lista o la que tenga image_type === 'principal'.
   */
  async loadProductsWithImages(brandContainerId) {
    // Los productos son org-scope (organization_id); brand_container_id suele venir NULL.
    // Igual que products.js loadProducts(), filtramos por organization_id y solo caemos
    // a brand_container_id si no hay org (caso de marca por usuario sin org).
    const orgId = this.organizationId || null;
    if (!this.supabase || (!orgId && !brandContainerId)) return [];
    try {
      const cacheScope = orgId ? `org:${orgId}` : `bc:${brandContainerId}`;
      const fetcher = async () => {
        let query = this.supabase
          .from('products')
          .select('id, nombre_producto, tipo_producto, brand_container_id, organization_id, created_at');
        query = orgId
          ? query.eq('organization_id', orgId)
          : query.eq('brand_container_id', brandContainerId);
        const { data: products, error: productsError } = await query
          .order('created_at', { ascending: false });
        if (productsError || !products || products.length === 0) return [];

        const productIds = products.map(p => p.id).filter(Boolean);
        const imagesQuery = this.supabase
          .from('product_images')
          .select('id, product_id, image_url, image_type, image_order')
          .order('image_order', { ascending: true });
        const { data: allImages, error: imagesError } = productIds.length === 1
          ? await imagesQuery.eq('product_id', productIds[0])
          : await imagesQuery.in('product_id', productIds);

        if (!imagesError && allImages && allImages.length > 0) {
          const byProduct = {};
          allImages.forEach(img => {
            if (!byProduct[img.product_id]) byProduct[img.product_id] = [];
            byProduct[img.product_id].push(img);
          });
          products.forEach(p => {
            const imgs = byProduct[p.id] || [];
            p.images = imgs.sort((a, b) => {
              if (a.image_type === 'principal') return -1;
              if (b.image_type === 'principal') return 1;
              return (a.image_order ?? 0) - (b.image_order ?? 0);
            });
          });
        } else {
          products.forEach(p => { p.images = []; });
        }
        return products;
      };
      return window.apiClient
        ? await window.apiClient.query(`studio:products:${cacheScope}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('Studio loadProductsWithImages:', e);
      return [];
    }
  }

  /**
   * Rellena los carruseles .image-selector-carousel con productos cuando:
   * - data-media-source="products", o
   * - data-key/data-field-name contiene "product", o
   * - el label del wrapper (.studio-field) contiene "producto" (ej. "productos").
   * Usa la misma estructura de tarjeta que la biblioteca de productos.
   */
  async populateImageSelectorCarousels() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return;

    const bySource = formEl.querySelectorAll('.image-selector-carousel[data-media-source="products"]');
    if (bySource.length > 0) {
      await this._fillProductCarousels(bySource);
      return;
    }
    const allCarousels = Array.from(formEl.querySelectorAll('.image-selector-carousel'));
    const byKey = allCarousels.filter(el => {
      const key = (el.getAttribute('data-key') || el.getAttribute('data-field-name') || '').toLowerCase();
      return key.includes('product');
    });
    if (byKey.length > 0) {
      await this._fillProductCarousels(byKey);
      return;
    }
    const byLabel = allCarousels.filter(carousel => {
      const wrapper = carousel.closest('.studio-field, .form-field');
      if (!wrapper) return false;
      const labelEl = wrapper.querySelector('label');
      const labelText = (labelEl && labelEl.textContent || '').trim().toLowerCase();
      return labelText.includes('producto');
    });
    if (byLabel.length > 0) {
      await this._fillProductCarousels(byLabel);
      return;
    }
    // Fallback: si hay un solo carrusel image_selector y no es "references", asumir productos (ej. flujo "Product Render")
    const notReferences = allCarousels.filter(el => el.getAttribute('data-media-source') !== 'references');
    if (notReferences.length === 1) {
      await this._fillProductCarousels(notReferences);
    }
  }

  /**
   * Rellena los carruseles dados con productos de la marca (internal).
   */
  async _fillProductCarousels(carousels) {
    // Los productos son org-scope; el brand_container es opcional (puede no existir).
    const brandContainerId = await this.getBrandContainerId();
    const products = await this.loadProductsWithImages(brandContainerId);
    if ((this.organizationId || brandContainerId) && (!products || products.length === 0)) {
      console.warn('[Studio] Sin productos para esta org. organization_id=', this.organizationId, 'brand_container_id=', brandContainerId, '- Añade productos en la sección Productos de la app.');
    }

    const escapeHtml = (s) => {
      if (s == null) return '';
      const div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    };

    carousels.forEach(carousel => {
      const track = carousel.querySelector('.image-selector-carousel-track');
      const hiddenInput = carousel.querySelector('input[type="hidden"]');
      const fieldName = carousel.getAttribute('data-field-name') || (hiddenInput && hiddenInput.getAttribute('name'));
      const isMultiple = carousel.getAttribute('data-selection-mode') === 'multiple';

      if (!track) return;

      track.classList.remove('image-selector-carousel-track--empty');
      track.removeAttribute('data-empty-msg');

      if (products.length === 0) {
        track.innerHTML = '<span class="image-selector-empty-msg">No hay productos en esta marca.</span>';
        if (hiddenInput) hiddenInput.value = isMultiple ? '[]' : '';
        return;
      }

      const selectedIds = new Set();

      track.innerHTML = products.map(product => {
        const mainImage = product.images && product.images.length > 0 ? product.images[0].image_url : null;
        const nombre = product.nombre_producto || 'Producto';
        const imgHtml = mainImage
          ? `<img src="${escapeHtml(mainImage)}" alt="${escapeHtml(nombre)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling && (this.nextElementSibling.style.display='flex');">`
          : '';
        const noImageHtml = '<div class="image-selector-card-placeholder" style="' + (mainImage ? 'display:none;' : '') + '"><i class="ph ph-image"></i></div>';
        return (
          '<div class="image-selector-card" data-product-id="' + escapeHtml(product.id) + '" role="button" tabindex="0">' +
          '<div class="image-selector-card-image">' + imgHtml + noImageHtml + '</div>' +
          '<span class="image-selector-card-label">' + escapeHtml(nombre) + '</span>' +
          '</div>'
        );
      }).join('');

      track.querySelectorAll('.image-selector-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-product-id');
          if (!id) return;
          if (isMultiple) {
            if (selectedIds.has(id)) selectedIds.delete(id);
            else selectedIds.add(id);
            card.classList.toggle('selected', selectedIds.has(id));
            if (hiddenInput) hiddenInput.value = JSON.stringify(Array.from(selectedIds));
          } else {
            track.querySelectorAll('.image-selector-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            if (hiddenInput) hiddenInput.value = id;
          }
          this.updateCreditsDisplay();
        });
      });

      if (hiddenInput) hiddenInput.value = isMultiple ? '[]' : '';
    });
  }

  async loadBrandData(brandContainerId) {
    if (!this.supabase || !brandContainerId) return null;
    try {
      const fetcher = async () => {
        const { data: container, error: e1 } = await this.supabase
          .from('brand_containers')
          .select('*')
          .eq('id', brandContainerId)
          .single();
        if (e1 || !container) return null;
        return container;
      };
      return window.apiClient
        ? await window.apiClient.query(`studio:brand_data:${brandContainerId}`, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('Studio loadBrandData:', e);
      return null;
    }
  }

  async loadCampaigns(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      const fetcher = async () => {
        const { data, error } = await this.supabase
          .from('campaigns')
          .select('*')
          .eq('brand_container_id', brandContainerId)
          .order('created_at', { ascending: false });
        return error ? [] : (data || []);
      };
      return window.apiClient
        ? await window.apiClient.query(`studio:campaigns:${brandContainerId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('Studio loadCampaigns:', e);
      return [];
    }
  }

  async loadAudiences(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      const fetcher = async () => {
        const { data, error } = await this.supabase
          .from('audience_personas')
          .select('*')
          .eq('brand_container_id', brandContainerId);
        return error ? [] : (data || []);
      };
      return window.apiClient
        ? await window.apiClient.query(`studio:audiences:${brandContainerId}`, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('Studio loadAudiences:', e);
      return [];
    }
  }

  async loadEntities(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      const fetcher = async () => {
        const { data, error } = await this.supabase
          .from('brand_entities')
          .select('*')
          .eq('brand_container_id', brandContainerId)
          .order('created_at', { ascending: false });
        return error ? [] : (data || []);
      };
      return window.apiClient
        ? await window.apiClient.query(`studio:entities:${brandContainerId}`, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('Studio loadEntities:', e);
      return [];
    }
  }

  /**
   * Enlaza los acordeones scope_picker (enfoque de la producción): toggle "Que la IA decida" y checkboxes
   * de opciones ya renderizadas por el registry. Solo procesa data-focus-type="scope_picker".
   */
  populateFocusSelectorAccordions() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return;

    const accordions = formEl.querySelectorAll('.focus-selector-accordion[data-focus-type="scope_picker"]');
    for (const accordion of accordions) {
      const body = accordion.querySelector('.focus-selector-body');
      const hiddenInput = accordion.querySelector('input[type="hidden"]');
      const letAiCheckbox = accordion.querySelector('.focus-selector-let-ai-decide');
      if (!body || !hiddenInput) continue;

      const updateValue = () => {
        if (!hiddenInput) return;
        if (letAiCheckbox && letAiCheckbox.checked) {
          hiddenInput.value = '{"let_ai_decide":true}';
          return;
        }
        const values = [];
        accordion.querySelectorAll('.focus-selector-checkbox:checked').forEach(cb => {
          const v = cb.getAttribute('data-value');
          if (v != null) values.push(v);
        });
        hiddenInput.value = JSON.stringify({ let_ai_decide: false, values });
      };

      if (letAiCheckbox) {
        letAiCheckbox.addEventListener('change', () => {
          const custom = !letAiCheckbox.checked;
          body.classList.toggle('focus-selector-body--open', custom);
          body.setAttribute('aria-hidden', !custom);
          updateValue();
          this.updateCreditsDisplay();
        });
      }
      accordion.querySelectorAll('.focus-selector-checkbox').forEach(cb => {
        cb.addEventListener('change', () => { updateValue(); this.updateCreditsDisplay(); });
      });

      body.classList.toggle('focus-selector-body--open', !(letAiCheckbox && letAiCheckbox.checked));
      body.setAttribute('aria-hidden', !!(letAiCheckbox && letAiCheckbox.checked));
    }
  }

  renderFormField(field) {
    const name = field.name || field.key || field.id || 'field';
    const fieldNorm = { ...field, key: name, required: field.required !== false };
    if (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.renderFormFieldWithWrapper) {
      return window.InputRegistry.renderFormFieldWithWrapper(fieldNorm, {
        idPrefix: 'studio-',
        wrapperClass: 'studio-field',
        showLabel: true,
        showHelper: true,
        showRequired: true,
        required: fieldNorm.required
      });
    }
    const label = field.label || name;
    const required = fieldNorm.required;
    const type = (field.type || field.input_type || 'text').toLowerCase();
    const placeholder = field.placeholder || '';
    if (type === 'textarea') {
      return `<div class="studio-field"><label for="studio-${name}">${this.escapeHtml(label)}</label><textarea id="studio-${name}" name="${this.escapeHtml(name)}" rows="3" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''}></textarea></div>`;
    }
    if (type === 'number') {
      return `<div class="studio-field"><label for="studio-${name}">${this.escapeHtml(label)}</label><input type="number" id="studio-${name}" name="${this.escapeHtml(name)}" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''} /></div>`;
    }
    if (type === 'select') {
      const options = field.options || [];
      const opts = options.map(o => `<option value="${this.escapeHtml(String(o.value ?? o))}">${this.escapeHtml(String(o.label ?? o))}</option>`).join('');
      return `<div class="studio-field"><label for="studio-${name}">${this.escapeHtml(label)}</label><select id="studio-${name}" name="${this.escapeHtml(name)}" ${required ? 'required' : ''}><option value="">Seleccionar...</option>${opts}</select></div>`;
    }
    return `<div class="studio-field"><label for="studio-${name}">${this.escapeHtml(label)}</label><input type="text" id="studio-${name}" name="${this.escapeHtml(name)}" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''} /></div>`;
  }

  collectFormData() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return {};
    const data = {};
    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      const name = el.getAttribute('name');
      if (!name) return;
      if (el.type === 'checkbox') data[name] = el.checked;
      else {
        const raw = el.value?.trim() ?? '';
        if (raw && (raw.startsWith('{') || raw.startsWith('['))) {
          try {
            data[name] = JSON.parse(raw);
          } catch (_) {
            data[name] = raw;
          }
        } else {
          data[name] = raw;
        }
      }
    });
    return data;
  }

  /**
   * Detecta si un campo del schema es selector de productos (image_selector de productos).
   */
  _isProductSelectorField(field) {
    const type = (field.input_type || field.type || '').toLowerCase();
    if (type !== 'image_selector') return false;
    const source = (field.media_source || field.function_type || '').toLowerCase();
    if (source === 'products') return true;
    const key = (field.key || field.name || '').toLowerCase();
    return key.includes('product');
  }

  /**
   * Reemplaza en el payload los campos "selector de productos" (UUID o array de UUIDs)
   * por el objeto completo de cada producto (con imágenes y todos los datos de BD), vía RPC get_products_full_by_ids.
   * El webhook recibe así todos los datos del producto, no solo el ID.
   */
  async enrichProductPayload(payload) {
    if (!this.supabase || !this.selectedFlow) return payload;
    const schema = this.selectedFlow.input_schema || {};
    const fields = Array.isArray(schema) ? schema : (schema.fields || schema.inputs || []);
    if (!Array.isArray(fields) || fields.length === 0) return payload;

    const productFields = fields.filter(f => this._isProductSelectorField(f));
    if (productFields.length === 0) return payload;

    const out = { ...payload };
    for (const field of productFields) {
      const key = field.key || field.name;
      if (!key || out[key] == null) continue;
      let ids = out[key];
      if (typeof ids === 'string') {
        const trimmed = ids.trim();
        if (!trimmed) continue;
        ids = [trimmed];
      }
      if (!Array.isArray(ids) || ids.length === 0) continue;
      const validIds = ids.filter(id => typeof id === 'string' && id.length > 0);
      if (validIds.length === 0) continue;

      try {
        const { data, error } = await this.supabase.rpc('get_products_full_by_ids', { p_product_ids: validIds });
        if (error) {
          console.warn('[Studio] get_products_full_by_ids:', error.message);
          continue;
        }
        const list = Array.isArray(data) ? data : [];
        out[key] = list.length === 1 && validIds.length === 1 ? list[0] : list;
      } catch (e) {
        console.warn('[Studio] enrichProductPayload:', e);
      }
    }
    return out;
  }

  setupEventListeners() {
    const btn = document.getElementById('studioProducirBtn');
    if (btn) btn.addEventListener('click', () => this.producir());

    const goToCatalog = () => {
      this.selectedFlow = null;
      if (window.router) window.router.navigate(this.getStudioBasePath() + '/flows', true);
    };

    const backFlows = document.getElementById('studioBackFlows');
    if (backFlows) backFlows.addEventListener('click', goToCatalog);

    const backFlowsAutomated = document.getElementById('studioBackFlowsAutomated');
    if (backFlowsAutomated) backFlowsAutomated.addEventListener('click', goToCatalog);
  }

  async producir() {
    if (!this.selectedFlow || !this.selectedFlow.webhook_url) return;
    const cost = this.selectedFlow.token_cost ?? 1;
    if (this.credits.available < cost) {
      this._notify('Créditos insuficientes para esta producción.');
      return;
    }

    const Service = window.FlowWebhookService;
    if (!Service || typeof Service.executeWebhook !== 'function') {
      this._notify('Servicio de ejecución no disponible. Recarga la página.');
      return;
    }

    let payload = this.collectFormData();
    payload = await this.enrichProductPayload(payload);
    const btn = document.getElementById('studioProducirBtn');
    if (btn) btn.disabled = true;

    const timeoutMs = DEFAULT_STUDIO_TIMEOUT_MS;
    const maxRetries = DEFAULT_STUDIO_MAX_RETRIES;
    let runId = null;
    let creditsDeducted = false;

    try {
      // 1) Deducción atómica de créditos + creación de run (RPC).
      // Pasamos campaign/persona/brief para que queden ligados al flow_run
      // (la RPC los inserta directamente). Asi el modal de Production puede
      // mostrar a que campania y audiencia pertenece cada produccion.
      const campaignId = payload?.campaign_id || (Array.isArray(payload?.campaign_ids) ? payload.campaign_ids[0] : null) || null;
      const personaId = payload?.persona_id || payload?.audience_id || null;
      const briefId = payload?.brief_id || null;
      const { data: deductResult, error: rpcError } = await this.supabase
        .rpc('deduct_credits_and_create_run', {
          p_organization_id: this.organizationId,
          p_user_id: this.userId,
          p_flow_id: this.selectedFlow.id,
          p_amount: cost,
          p_brief_id: briefId,
          p_persona_id: personaId,
          p_campaign_id: campaignId
        });

      if (rpcError) {
        console.error('Studio deduct RPC:', rpcError);
        this._notify('No se pudo reservar créditos. Intenta de nuevo.');
        return;
      }

      const success = deductResult?.success === true;
      runId = deductResult?.run_id;
      if (!success || !runId) {
        const msg = deductResult?.error_message === 'insufficient_credits'
          ? 'Créditos insuficientes para esta producción.'
          : (deductResult?.error_message || 'Error al reservar créditos.');
        this._notify(msg);
        return;
      }

      creditsDeducted = true;
      this.credits.available = deductResult.new_available ?? this.credits.available - cost;
      this.updateCreditsDisplay();
      // Invalida apiClient: la próxima lectura (sidebar/tienda) verá créditos frescos.
      window.apiClient?.invalidate(`nav:credits:${this.organizationId}`);

      // 1b) Persistir snapshot del payload del usuario en runs_inputs.
      // Cierra el hueco "runs_inputs vacio": cada produccion deja registro
      // del formulario que la origino (entity ids, referencias, briefing,
      // etc) para auditoria + alimentar el bloque INFORMATION del modal.
      try {
        const moduleId = this.selectedFlow?.flow_module_id
          || this.selectedFlow?.module_id
          || this.selectedFlow?.modules?.[0]?.id
          || null;
        await this.supabase.from('runs_inputs').insert({
          run_id: runId,
          input_data: payload,
          flow_module_id: moduleId,
          organization_id: this.organizationId,
          metadata: {
            captured_from: 'studio_ui',
            flow_id: this.selectedFlow?.id || null
          }
        });
      } catch (inputsErr) {
        // No bloqueamos la produccion si falla el snapshot: log y seguimos.
        console.warn('runs_inputs snapshot fallo (no bloquea produccion):', inputsErr);
      }

      // 1c) Flows MANUALES (single_step/form): enriquecer el payload con el
      // contexto rico (meta.run_id, entities con imagenes, brand_identity,
      // brand_colors, schedule_config) via rpc_build_manual_context — el mismo
      // shape que el body de autopilot, para que el flow n8n moderno lo lea
      // igual. El payload original del form se preserva (merge) por compat.
      let webhookBody = payload;
      try {
        const schema = this.selectedFlow.input_schema || {};
        const fields = Array.isArray(schema) ? schema : (schema.fields || schema.inputs || []);
        const prodFields = (Array.isArray(fields) ? fields : []).filter(f => this._isProductSelectorField(f));
        const entityIds = [];
        for (const f of prodFields) {
          const v = payload[f.key || f.name];
          const arr = Array.isArray(v) ? v : (v ? [v] : []);
          for (const p of arr) { const eid = (p && (p.entity_id || p.id)) || (typeof p === 'string' ? p : null); if (eid) entityIds.push(eid); }
        }
        const coloresVal = Array.isArray(payload.colores) ? payload.colores.join(',') : (payload.colores || null);
        const aspect = payload.aspect_ratio || '1:1';
        const specs = payload.production_specifications || payload.specs || '';
        const { data: ctx, error: ctxErr } = await this.supabase.rpc('rpc_build_manual_context', {
          p_run_id: runId, p_org_id: this.organizationId, p_user_id: this.userId,
          p_flow_id: this.selectedFlow.id, p_entity_ids: entityIds,
          p_colores: coloresVal, p_aspect_ratio: aspect, p_specs: specs
        });
        if (!ctxErr && ctx && typeof ctx === 'object') webhookBody = { ...payload, ...ctx };
        else if (ctxErr) console.warn('[Studio] rpc_build_manual_context:', ctxErr.message);
      } catch (ctxE) {
        console.warn('[Studio] rpc_build_manual_context (no bloquea):', ctxE);
      }

      // 2) Ejecutar webhook con reintentos y timeout
      const res = await Service.executeWebhook({
        url: this.selectedFlow.webhook_url,
        method: (this.selectedFlow.webhook_method || 'POST').toUpperCase(),
        body: webhookBody,
        timeoutMs,
        maxRetries
      });

      if (!res.ok) {
        await this._refundCreditsSafe(runId, cost);
        this.credits.available += cost;
        this.updateCreditsDisplay();
        await this.loadCredits();
        if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
          await window.appNavigation.loadCreditsFromDb(this.organizationId);
        }
        const detail = res.error || res.statusText || `Código ${res.status}`;
        if (res.status === 400) {
          this._notify('Solicitud incorrecta: ' + detail + '. Revisa los datos del formulario.');
        } else if (res.status >= 500) {
          this._notify('Error del servidor del flujo. Intenta más tarde o contacta al administrador.');
        } else {
          this._notify('Error en la producción: ' + detail);
        }
        return;
      }

      // 3) Marcar run como completado
      await this.supabase
        .from('flow_runs')
        .update({
          status: 'completed',
          webhook_response_code: res.status,
          tokens_consumed: cost
        })
        .eq('id', runId);

      await this.loadCredits();
      this.updateCreditsDisplay();
      if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
        await window.appNavigation.loadCreditsFromDb(this.organizationId);
      }
      // Sin popup de éxito: el canvas pasa directo al skeleton de carga.
      // Scope el canvas al run recien creado: solo veremos los outputs de este run.
      // Los outputs llegan async (webhook → n8n → ai-engine), por eso hacemos poll.
      // Si el output no llega (o el run queda fallido) el poll pinta el estado de error.
      await this.setActiveRun(runId, { poll: true });
    } catch (e) {
      if (creditsDeducted && runId) {
        await this._refundCreditsSafe(runId, cost);
        this.credits.available += cost;
        this.updateCreditsDisplay();
        await this.loadCredits();
        if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
          await window.appNavigation.loadCreditsFromDb(this.organizationId);
        }
      }
      const msg = this._messageForProducirError(e);
      console.error('Studio producir:', e);
      this._notify(msg);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async _refundCreditsSafe(runId, amount) {
    try {
      await this.supabase.rpc('refund_credits_for_run', {
        p_organization_id: this.organizationId,
        p_run_id: runId,
        p_amount: amount
      });
      window.apiClient?.invalidate(`nav:credits:${this.organizationId}`);
    } catch (refundErr) {
      console.error('Studio refund fallback:', refundErr);
    }
  }

  _messageForProducirError(e) {
    if (e.name === 'AbortError') {
      return 'Tiempo de espera agotado. El servidor no respondió a tiempo.';
    }
    if (e.name === 'TypeError' && e.cause) {
      return 'Error de conexión. Comprueba tu red e intenta de nuevo.';
    }
    if (e.message && typeof e.message === 'string') {
      return e.message;
    }
    return 'Error al producir. Intenta de nuevo.';
  }

  async onLeave() {
    this.cleanup();
    if (this.livingManager && typeof this.livingManager.destroy === 'function') {
      this.livingManager.destroy();
    }
    this.livingManager = null;
    this._livingScopedFlowName = null;
    window.studioView = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.flows = [];
    this.selectedFlow = null;
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.StudioView = StudioView;
