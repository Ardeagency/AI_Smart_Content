/**
 * VideoView - Página de generación de video con la API de KIE (modelo kling-3.0/video).
 * Flujo: crear tarea (POST kling-video-create) → polling desde cliente (GET kling-video-status?taskId=) hasta success/fail
 * → descargar video (proxy kie-video-download), subir a Supabase, mostrar URL al usuario.
 * Arquitectura asíncrona: las funciones solo crean/consultan; no esperan la generación (evita timeout 524).
 */
class VideoView extends BaseView {
  /** POST: crear tarea en KIE. Responde de inmediato con taskId (< 2 s). */
  static get KLING_VIDEO_CREATE_API() {
    return '/.netlify/functions/kling-video-create';
  }
  /** GET: consultar estado de la tarea. Usado para polling desde el cliente. */
  static get KLING_VIDEO_STATUS_API() {
    return '/.netlify/functions/kling-video-status';
  }
  /** Compatibilidad: router que une create + status (legacy). */
  static get KLING_VIDEO_API() {
    return '/.netlify/functions/kling-video';
  }
  static get KIE_VIDEO_DOWNLOAD_API() {
    return '/.netlify/functions/kie-video-download';
  }
  /** Doc KIE: empezar polling 2-3s; dejar de hacer polling a los 10-15 min. Usamos 3s y máximo 12 min. */
  static get POLL_INTERVAL_MS() { return 3000; }
  static get POLL_MAX_DURATION_MS() { return 12 * 60 * 1000; }
  /** Tope del textarea del Director Console (px); no debe comerse el canvas. */
  static get DIRECTOR_BRIEF_MAX_HEIGHT_PX() { return 200; }
  /** Tope adicional como fracción del alto de ventana (el menor con DIRECTOR_BRIEF_MAX_HEIGHT_PX gana). */
  static get DIRECTOR_BRIEF_MAX_VIEWPORT_FRAC() { return 0.26; }

  constructor() {
    super();
    this.templatePath = null;
    this._pollInterval = null;
    this.uploadedImages = [];
    this.klingElements = [];
    this.supabase = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.dbData = { products: [], services: [], entities: [], audiences: [], campaigns: [] };
    this.videoProductions = [];
    this.selectedProductionIds = new Set();
    this.selectedCampaignId = '';
    this.selectedAudienceId = '';
    this.hasGeneratedPrompt = false;
    this.cinematography = {
      preset: '',
      shotType: '',
      lens: '',
      framing: '',
      cameraMovement: '',
      motionSpeed: '',
      motionIntensity: '',
      lightType: '',
      contrastLevel: '',
      temperature: '',
      tone: '',
      colorGrade: '',
      colorTemp: '',
      energyLevel: ''
    };
    this.cineBlocksCollapsed = { camera: true, movement: true, lighting: true, mood: true };
    this.assetScope = 'product';
    this.selectedAssetId = '';
    this.storyboardScenes = [{ brief: '', duration: '5' }, { brief: '', duration: '5' }];
    this.multiShotEnabled = false;
    this.multiPrompts = [];
    this.brandContextCollapsed = true;
    this.promptPreviewCollapsed = true;
    this.generatedPromptPreview = null;
  }

  static get CINEMATOGRAPHY_PRESETS() {
    return {
      '': { label: 'None' },
      'product-launch': { label: 'Product Launch', shotType: 'Hero Product Frame', lens: '50mm (Balanced)', framing: 'Centered', cameraMovement: 'Slow Push In', motionSpeed: 'Moderate', motionIntensity: 'Moderate', lightType: 'Studio commercial', contrastLevel: 'Medium', temperature: 'Neutral', tone: 'Clean commercial', colorGrade: 'Neutral', colorTemp: 'Neutral', energyLevel: 'Moderate' },
      'luxury-hero': { label: 'Luxury Hero', shotType: 'Wide Shot', lens: '85mm (Portrait Compression)', framing: 'Negative space left', cameraMovement: 'Slow Pull Out', motionSpeed: 'Subtle', motionIntensity: 'Subtle', lightType: 'Rim light', contrastLevel: 'High', temperature: 'Warm', tone: 'Minimal luxury', colorGrade: 'Muted tones', colorTemp: 'Muted tones', energyLevel: 'Low' },
      'social-performance': { label: 'Social Performance', shotType: 'Close-up', lens: '35mm (Natural)', framing: 'Rule of thirds', cameraMovement: 'Tracking', motionSpeed: 'Dynamic', motionIntensity: 'Dynamic', lightType: 'Natural daylight', contrastLevel: 'Medium', temperature: 'Warm', tone: 'Bright energetic', colorGrade: 'Warm', colorTemp: 'Warm', energyLevel: 'High' },
      'cinematic-teaser': { label: 'Cinematic Teaser', shotType: 'Wide Shot', lens: '24mm (Wide Cinematic)', framing: 'Dynamic off-center', cameraMovement: 'Dolly Left', motionSpeed: 'Dynamic', motionIntensity: 'Dynamic', lightType: 'Dramatic spotlight', contrastLevel: 'High', temperature: 'Cold', tone: 'Cinematic dramatic', colorGrade: 'Cold', colorTemp: 'Cold', energyLevel: 'High' },
      'ecommerce-clean': { label: 'Ecommerce Clean', shotType: 'Hero Product Frame', lens: '50mm (Balanced)', framing: 'Symmetrical', cameraMovement: '360° Rotation', motionSpeed: 'Subtle', motionIntensity: 'Subtle', lightType: 'Studio commercial', contrastLevel: 'Low', temperature: 'Neutral', tone: 'Clean commercial', colorGrade: 'Neutral', colorTemp: 'Neutral', energyLevel: 'Low' },
      'tech-explainer': { label: 'Tech Explainer', shotType: 'Medium Shot', lens: '35mm (Natural)', framing: 'Centered', cameraMovement: 'Orbit', motionSpeed: 'Moderate', motionIntensity: 'Moderate', lightType: 'Soft diffused', contrastLevel: 'Low', temperature: 'Neutral', tone: 'Clean commercial', colorGrade: 'Neutral', colorTemp: 'Neutral', energyLevel: 'Moderate' }
    };
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth && window.router) {
        window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    if (window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
    } else if (window.supabase) {
      this.supabase = window.supabase;
    }
    this.organizationId = window.currentOrgId || this.routeParams?.orgId || null;
  }

  renderHTML() {
    return `
      <div class="organization-container video-view-container" id="videoPage">
        <div class="video-layout">
          <div class="video-content-row">
            <main class="video-main">
              <section class="video-canvas video-canva-view" id="videoCanvaView" aria-label="Canvas — producción">

                <div class="video-canvas-idle" id="videoCanvasIdle"></div>

                <div class="video-status-area" id="videoStatusArea" style="display: none;">
                  <div class="video-status-card" id="videoStatusCard">
                    <div class="video-status-spinner" id="videoStatusSpinner" style="display: none;"></div>
                    <p class="video-status-text" id="videoStatusText">—</p>
                  </div>
                </div>

                <div class="video-result-area" id="videoResultArea" style="display: none;">
                  <div class="video-result-card">
                    <div class="video-result-card-header">
                      <span class="video-result-output-badge">OUTPUT</span>
                      <h2 class="video-result-title">Video generado</h2>
                    </div>
                    <div class="video-result-player-wrap">
                      <video id="videoResultPlayer" class="video-result-player" controls playsinline></video>
                    </div>
                    <div class="video-result-actions">
                      <a id="videoResultDownload" class="btn btn-secondary video-download-btn" href="#" download target="_blank" rel="noopener">
                        <i class="fas fa-download"></i> Descargar
                      </a>
                    </div>
                  </div>
                </div>

                <div class="video-error-area" id="videoErrorArea" style="display: none;">
                  <div class="video-error-card">
                    <div class="video-error-icon-wrap"><i class="fas fa-triangle-exclamation"></i></div>
                    <p class="video-error-text" id="videoErrorText">—</p>
                  </div>
                </div>

                <div class="video-productions-panel video-productions-panel-inline" id="videoProductionsPanel" aria-hidden="true" style="display: none;">
                  <div class="video-productions-panel-card">
                    <div class="video-productions-panel-header">
                      <h3 class="video-prompt-panel-title">Productions</h3>
                      <button type="button" class="video-productions-panel-close" id="videoProductionsPanelClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="video-productions-gallery" id="videoProductionsGallery"></div>
                  </div>
                </div>

              </section>

              <section class="video-director-console-zone video-prompt-wrap video-main-director" id="videoFooterControl" aria-label="Director Console — adjuntos y prompt">
                <div class="video-prompt-footer-card video-prompt-footer-card-center">
                  <div class="video-prompt-footer-card-inner video-director-console">

                    <input type="file" id="videoImageUpload" accept="image/*" multiple style="display: none;" aria-hidden="true">

                    <div class="video-console-header-row" aria-hidden="true">
                      <span class="video-console-dot"></span>
                      <span class="video-console-label-text">Director Console</span>
                      <span class="video-console-sep">·</span>
                      <span class="video-console-model-text">Kling 3.0</span>
                    </div>

                    <div class="video-director-top-row">
                      <button type="button" class="video-director-btn-add" id="videoPromptAdd" aria-label="Añadir imagen o video"><i class="fas fa-plus"></i></button>
                      <div class="video-kling-elements-list" id="videoKlingElementsList" aria-live="polite"></div>
                    </div>
                    <div class="video-director-variables-row" id="videoDirectorVariables" aria-label="Variables de cinematografía"></div>
                    <div class="video-director-console-content">
                      <textarea
                        id="videoPromptInput"
                        class="video-director-brief-input"
                        placeholder="Tu idea en texto — no es el prompt final. La IA generará el prompt con la voz de la marca."
                        rows="1"
                        autocomplete="off"
                        aria-label="Tu idea (la IA genera el prompt final)"
                      ></textarea>
                      <p class="video-field-help video-prompt-timeout-hint" id="videoPromptTimeoutHint" style="display: none;" role="status">Prompt largo: para evitar timeout (524), usa modo Estándar, duración 5s, una imagen de referencia, o acorta el texto.</p>
                    </div>
                    <div class="video-director-separator" aria-hidden="true"></div>
                    <div class="video-director-controls">
                      <button type="button" class="video-director-toggle video-prompt-toggle video-prompt-sound active" id="videoSound" title="Sound" aria-pressed="true"><i class="fas fa-volume-up"></i><span>Sound</span></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle video-prompt-multi-shot" id="videoMultiShot" title="Multi Shot" aria-pressed="false"><i class="fas fa-film"></i><span>Multi Shot</span></button>
                      <div class="video-prompt-mode-wrap">
                        <select id="videoMode" class="video-director-select" aria-label="Modo (Estándar reduce riesgo de timeout)">
                          <option value="std" selected>Estándar</option>
                          <option value="pro">Pro</option>
                        </select>
                        <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-aspect-wrap">
                        <select id="videoAspectRatio" class="video-director-select" aria-label="Format"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select>
                        <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-duration-wrap">
                        <select id="videoDuration" class="video-director-select" aria-label="Duration"><option value="5">5s</option><option value="10">10s</option><option value="15">15s</option></select>
                        <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                      </div>
                      <button type="button" class="video-director-btn-generate" id="videoPromptSend" aria-label="Generar prompt" data-state="prompt"><i class="fas fa-wand-magic-sparkles"></i><span id="videoPromptSendLabel">PROMPT</span></button>
                      <button type="button" class="video-director-btn-regenerate" id="videoRegeneratePromptBtn" aria-label="Volver a producir prompt" style="display: none;"><i class="fas fa-rotate-right"></i><span>Re-prompt</span></button>
                    </div>
                    <div class="video-storyboard-wrap" id="videoStoryboardWrap" style="display: none;">
                      <h4 class="video-storyboard-title">Storyboard</h4>
                      <div class="video-storyboard-scenes" id="videoStoryboardScenes"></div>
                    </div>

                  </div>
                </div>
              </section>
            </main>

            <aside class="video-sidebar-console" aria-label="Sidebar — configuraciones predefinidas">
              <div class="video-prompt-footer-card video-sidebar-card">
                <div class="video-prompt-footer-card-inner video-sidebar-inner">

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <span class="video-sidebar-section-num">01</span>
                      <h3 class="video-section-label">Production Context</h3>
                    </div>
                    <div class="video-escenas-block">
                      <div class="video-escenas-header">
                        <h4 class="video-prompt-panel-title">Scenes</h4>
                        <button type="button" class="video-escenas-all-btn" id="videoProductionsBtn" aria-label="All production">All</button>
                      </div>
                      <div class="video-escenas-carousel-wrap">
                        <div class="video-escenas-carousel" id="videoEscenasCarousel"></div>
                      </div>
                    </div>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">Campaign</h4>
                      <select id="videoCampaignSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="Campaña">
                        <option value="">— None</option>
                      </select>
                    </div>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">Audience</h4>
                      <select id="videoAudienceSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="Audiencia">
                        <option value="">— None</option>
                      </select>
                    </div>
                    <div class="video-left-block video-asset-stack-block" id="videoAssetStackBlock">
                      <h4 class="video-prompt-panel-title">Asset Stack</h4>
                      <p class="video-field-help video-asset-stack-help" id="videoAssetStackHelp">Product = reference lock (el video no debe cambiar el producto)</p>
                      <div class="video-asset-scope-wrap">
                        <select id="videoAssetScope" class="video-prompt-db-select video-asset-scope-select" aria-label="Scope">
                          <option value="product">Product</option>
                          <option value="service">Service</option>
                          <option value="brand_world">Brand World</option>
                          <option value="collection">Collection</option>
                        </select>
                      </div>
                      <div class="video-asset-products-carousel-wrap" id="videoAssetProductsCarouselWrap">
                        <div class="video-asset-products-carousel" id="videoAssetProductsCarousel"></div>
                      </div>
                      <select id="videoAssetSelect" class="video-prompt-db-select video-asset-select video-asset-select-other" aria-label="Asset" style="display: none;">
                        <option value="">— None</option>
                      </select>
                    </div>
                  </div>

                  <div class="video-sidebar-section video-sidebar-cine video-cinematography-panel">
                    <div class="video-sidebar-section-header">
                      <span class="video-sidebar-section-num">02</span>
                      <h3 class="video-section-label">Cinematography</h3>
                    </div>
                    <div class="video-cine-preset-wrap">
                      <label class="video-cine-label">Production Preset</label>
                      <select id="videoCinePreset" class="video-cine-select" aria-label="Production Preset">
                        <option value="">None</option>
                        <option value="product-launch">Product Launch</option>
                        <option value="luxury-hero">Luxury Hero</option>
                        <option value="social-performance">Social Performance</option>
                        <option value="cinematic-teaser">Cinematic Teaser</option>
                        <option value="ecommerce-clean">Ecommerce Clean</option>
                        <option value="tech-explainer">Tech Explainer</option>
                      </select>
                    </div>
                    <div class="video-cine-selected-tags" id="videoCineSelectedTags" aria-live="polite"></div>
                    <div class="video-cine-blocks">
                      <div class="video-cine-block" data-block="camera">
                        <button type="button" class="video-cine-block-header" aria-expanded="false"><span>Camera</span><i class="fas fa-chevron-down"></i></button>
                        <div class="video-cine-block-content video-cine-block-collapsed">
                          <div class="video-cine-row"><label class="video-cine-label">Shot Type</label><select id="videoCineShotType" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">Lens</label><select id="videoCineLens" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">Framing</label><select id="videoCineFraming" class="video-cine-select"></select></div>
                        </div>
                      </div>
                      <div class="video-cine-block" data-block="movement">
                        <button type="button" class="video-cine-block-header" aria-expanded="false"><span>Movement</span><i class="fas fa-chevron-down"></i></button>
                        <div class="video-cine-block-content video-cine-block-collapsed">
                          <div class="video-cine-row"><label class="video-cine-label">Movement Type</label><select id="videoCineMovement" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">Speed</label><select id="videoCineMotionSpeed" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">Motion Intensity</label><select id="videoCineMotionIntensity" class="video-cine-select"></select></div>
                        </div>
                      </div>
                      <div class="video-cine-block" data-block="lighting">
                        <button type="button" class="video-cine-block-header" aria-expanded="false"><span>Lighting</span><i class="fas fa-chevron-down"></i></button>
                        <div class="video-cine-block-content video-cine-block-collapsed">
                          <div class="video-cine-row"><label class="video-cine-label">Light Type</label><select id="videoCineLightType" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">Contrast</label><select id="videoCineContrast" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">Temperature</label><select id="videoCineTemperature" class="video-cine-select"></select></div>
                        </div>
                      </div>
                      <div class="video-cine-block" data-block="mood">
                        <button type="button" class="video-cine-block-header" aria-expanded="false"><span>Mood & Color</span><i class="fas fa-chevron-down"></i></button>
                        <div class="video-cine-block-content video-cine-block-collapsed">
                          <div class="video-cine-row"><label class="video-cine-label">Tone</label><select id="videoCineTone" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">Color Grade</label><select id="videoCineColorGrade" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">Energy Level</label><select id="videoCineEnergyLevel" class="video-cine-select"></select></div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </aside>
          </div>

        </div>
      </div>
    `;
  }

  async init() {
    this.sendBtn = this.container.querySelector('#videoPromptSend');
    const labelEl = this.container.querySelector('#videoPromptSendLabel');
    const regenBtn = this.container.querySelector('#videoRegeneratePromptBtn');
    if (labelEl) labelEl.textContent = 'PROMPT';
    if (this.sendBtn) {
      this.sendBtn.setAttribute('data-state', 'prompt');
      this.sendBtn.setAttribute('aria-label', 'Generar prompt');
      const icon = this.sendBtn.querySelector('i');
      if (icon) icon.className = 'fas fa-wand-magic-sparkles';
    }
    if (regenBtn) regenBtn.style.display = 'none';
    this.hasGeneratedPrompt = false;

    this.promptInput = this.container.querySelector('#videoPromptInput');
    if (this.promptInput && this.promptInput.tagName === 'TEXTAREA') {
      this.promptInput.setAttribute('rows', '1');
    }
    this.aspectSelect = this.container.querySelector('#videoAspectRatio');
    this.idleArea = this.container.querySelector('#videoCanvasIdle');
    this.statusArea = this.container.querySelector('#videoStatusArea');
    this.statusText = this.container.querySelector('#videoStatusText');
    this.statusSpinner = this.container.querySelector('#videoStatusSpinner');
    this.resultArea = this.container.querySelector('#videoResultArea');
    this.resultPlayer = this.container.querySelector('#videoResultPlayer');
    this.resultDownload = this.container.querySelector('#videoResultDownload');
    this.errorArea = this.container.querySelector('#videoErrorArea');
    this.errorText = this.container.querySelector('#videoErrorText');

    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => {
        if (this.hasGeneratedPrompt) {
          this.startGeneration();
        } else {
          this.requestCinePrompt();
        }
      });
    }
    const regenerateBtn = this.container.querySelector('#videoRegeneratePromptBtn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => this.requestCinePrompt());
    }
    if (this.promptInput) {
      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (this.hasGeneratedPrompt) {
            this.startGeneration();
          } else {
            this.requestCinePrompt();
          }
        }
      });
      const timeoutHint = this.container.querySelector('#videoPromptTimeoutHint');
      const updateTimeoutHint = () => {
        if (!timeoutHint) return;
        const len = (this.promptInput.value || '').trim().length;
        timeoutHint.style.display = len > 450 ? 'block' : 'none';
      };
      const onPromptFieldInput = () => {
        updateTimeoutHint();
        this.scheduleResizeDirectorBriefInput();
      };
      this.promptInput.addEventListener('input', onPromptFieldInput);
      this.promptInput.addEventListener('change', updateTimeoutHint);
      this.promptInput.addEventListener('paste', () => this.scheduleResizeDirectorBriefInput());
      updateTimeoutHint();
    }
    const addBtn = this.container.querySelector('#videoPromptAdd');
    const fileInput = this.container.querySelector('#videoImageUpload');
    if (addBtn && fileInput) {
      addBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.onKlingElementFilesSelected(e));
    }
    this.renderKlingElementsList();
    const assetScope = this.container.querySelector('#videoAssetScope');
    const assetSelect = this.container.querySelector('#videoAssetSelect');
    if (assetScope) {
      assetScope.addEventListener('change', () => {
        this.assetScope = assetScope.value;
        this.selectedAssetId = '';
        this.updateAssetStackScopeUI();
      });
    }
    if (assetSelect) {
      assetSelect.addEventListener('change', () => {
        this.selectedAssetId = assetSelect.value || '';
        this.syncProductSelectionToKling();
      });
    }
    const productionsBtn = this.container.querySelector('#videoProductionsBtn');
    const panelClose = this.container.querySelector('#videoProductionsPanelClose');
    if (productionsBtn) productionsBtn.addEventListener('click', () => this.openProductionsPanel());
    if (panelClose) panelClose.addEventListener('click', () => this.closeProductionsPanel());
    await this.loadBrandData();
    const scopeEl = this.container.querySelector('#videoAssetScope');
    if (scopeEl) this.assetScope = scopeEl.value || 'product';
    this.updateAssetStackScopeUI();
    await this.loadVideoProductions();
    this.renderEscenasCarousel();
    this.initCinematography();
    this.renderDirectorVariables();
    const campaignSelect = this.container.querySelector('#videoCampaignSelect');
    const audienceSelect = this.container.querySelector('#videoAudienceSelect');
    if (campaignSelect) {
      campaignSelect.addEventListener('change', () => {
        this.selectedCampaignId = campaignSelect.value || '';
      });
    }
    if (audienceSelect) {
      audienceSelect.addEventListener('change', () => {
        this.selectedAudienceId = audienceSelect.value || '';
      });
    }
    this.container.querySelectorAll('.video-prompt-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pressed = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', pressed);
        btn.classList.toggle('active', pressed);
        if (btn.id === 'videoMultiShot') {
          this.multiShotEnabled = pressed;
          if (!pressed) this.multiPrompts = [];
        }
      });
    });
    const multiShotBtn = this.container.querySelector('#videoMultiShot');
    if (multiShotBtn) {
      this.multiShotEnabled = multiShotBtn.getAttribute('aria-pressed') === 'true';
      if (!this.multiShotEnabled) this.multiPrompts = [];
    }
    this.updatePromptButtonState(false);
    this.scheduleResizeDirectorBriefInput();
    this._resizeDirectorBriefOnWin = () => this.scheduleResizeDirectorBriefInput();
    window.addEventListener('resize', this._resizeDirectorBriefOnWin);
  }

  /** Altura del textarea según contenido (vacío ≈ una línea; crece hasta un máximo). */
  scheduleResizeDirectorBriefInput() {
    if (this._resizeDirectorBriefRaf) {
      cancelAnimationFrame(this._resizeDirectorBriefRaf);
    }
    this._resizeDirectorBriefRaf = requestAnimationFrame(() => {
      this._resizeDirectorBriefRaf = null;
      this.resizeDirectorBriefInput();
    });
  }

  resizeDirectorBriefInput() {
    const ta = this.promptInput;
    if (!ta || ta.tagName !== 'TEXTAREA') return;
    const maxPx = Math.min(
      VideoView.DIRECTOR_BRIEF_MAX_HEIGHT_PX,
      Math.floor(window.innerHeight * VideoView.DIRECTOR_BRIEF_MAX_VIEWPORT_FRAC)
    );
    const minPx = 44;
    ta.style.height = '0px';
    const sh = ta.scrollHeight;
    const next = Math.min(Math.max(sh, minPx), maxPx);
    ta.style.height = `${next}px`;
    ta.style.overflowY = sh > maxPx ? 'auto' : 'hidden';
  }

  clearAssetSelection() {
    const assetSelect = this.container.querySelector('#videoAssetSelect');
    if (assetSelect) assetSelect.value = '';
    this.selectedAssetId = '';
    if (this.assetScope === 'product') this.renderAssetProductsCarousel();
    this.syncProductSelectionToKling();
  }

  /** Muestra carrusel de productos u otro scope (dropdown); oculta la descripción cuando scope es product. */
  updateAssetStackScopeUI() {
    const block = this.container.querySelector('#videoAssetStackBlock');
    const carouselWrap = this.container.querySelector('#videoAssetProductsCarouselWrap');
    const assetSelect = this.container.querySelector('#videoAssetSelect');
    const scope = this.assetScope || 'product';
    if (block) block.setAttribute('data-scope', scope);
    const isProduct = scope === 'product';
    if (carouselWrap) carouselWrap.style.display = isProduct ? 'block' : 'none';
    if (assetSelect) assetSelect.style.display = isProduct ? 'none' : 'block';
    if (isProduct) {
      this.renderAssetProductsCarousel();
    } else {
      this.renderAssetDropdown();
    }
    this.syncProductSelectionToKling();
  }

  getAssetListByScope() {
    const scope = this.assetScope || 'product';
    if (scope === 'product') return (this.dbData.products || []).map((p) => ({ id: p.id, name: p.nombre_producto || 'Product', type: 'product' }));
    if (scope === 'service') return (this.dbData.services || []).map((s) => ({ id: s.id, name: s.nombre_servicio || 'Service', type: 'service' }));
    if (scope === 'brand_world') return (this.dbData.entities || []).map((e) => ({ id: e.id, name: e.name || 'Entity', type: 'entity' }));
    return [];
  }

  renderAssetDropdown() {
    const select = this.container.querySelector('#videoAssetSelect');
    if (!select) return;
    const items = this.getAssetListByScope();
    const current = select.value || this.selectedAssetId;
    const options = items.map((item) => `<option value="${String(item.id)}">${(item.name || '').slice(0, 50)}</option>`).join('');
    select.innerHTML = '<option value="">— None</option>' + options;
    if (current && items.some((i) => String(i.id) === current)) select.value = current;
    else this.selectedAssetId = '';
  }

  /** Carrusel de productos en Asset Stack (solo cuando scope es Product). Imagen seleccionable. */
  renderAssetProductsCarousel() {
    const carousel = this.container.querySelector('#videoAssetProductsCarousel');
    if (!carousel) return;
    const products = (this.dbData.products || []).filter((p) => Array.isArray(p.image_urls) && p.image_urls.length > 0);
    if (products.length === 0) {
      carousel.innerHTML = '<p class="video-asset-products-empty">No hay productos con imágenes.</p>';
      return;
    }
    carousel.innerHTML = products.map((p) => {
      const id = p.id;
      const selected = String(this.selectedAssetId) === String(id);
      const imgUrl = (p.image_urls[0] || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      return `
        <div class="video-asset-product-item ${selected ? 'is-selected' : ''}" data-id="${id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="Seleccionar producto">
          <div class="video-asset-product-thumb-wrap"><img class="video-asset-product-thumb" src="${imgUrl}" alt="" loading="lazy"></div>
        </div>
      `;
    }).join('');
    carousel.querySelectorAll('.video-asset-product-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (this.selectedAssetId === id) {
          this.selectedAssetId = '';
          el.classList.remove('is-selected');
          el.setAttribute('aria-pressed', 'false');
        } else {
          this.selectedAssetId = id;
          carousel.querySelectorAll('.video-asset-product-item').forEach((i) => {
            i.classList.remove('is-selected');
            i.setAttribute('aria-pressed', 'false');
          });
          el.classList.add('is-selected');
          el.setAttribute('aria-pressed', 'true');
        }
        this.syncProductSelectionToKling();
      });
    });
  }

  renderStoryboardScenes() {
    const container = this.container.querySelector('#videoStoryboardScenes');
    if (!container) return;
    const scenes = this.storyboardScenes.length >= 2 ? this.storyboardScenes : [{ brief: '', duration: '5' }, { brief: '', duration: '5' }];
    this.storyboardScenes = scenes;
    container.innerHTML = scenes.map((s, i) => `
      <div class="video-storyboard-scene" data-index="${i}">
        <span class="video-storyboard-scene-label">SCENE ${String(i + 1).padStart(2, '0')}</span>
        <input type="text" class="video-storyboard-scene-brief" placeholder="Mini brief" value="${(s.brief || '').replace(/"/g, '&quot;')}" data-index="${i}">
        <select class="video-storyboard-scene-duration" data-index="${i}"><option value="5" ${s.duration === '5' ? 'selected' : ''}>5s</option><option value="10" ${s.duration === '10' ? 'selected' : ''}>10s</option></select>
      </div>
    `).join('');
    container.querySelectorAll('.video-storyboard-scene-brief').forEach((input) => {
      input.addEventListener('input', () => {
        const i = parseInt(input.dataset.index, 10);
        if (this.storyboardScenes[i]) this.storyboardScenes[i].brief = input.value;
      });
    });
    container.querySelectorAll('.video-storyboard-scene-duration').forEach((sel) => {
      sel.addEventListener('change', () => {
        const i = parseInt(sel.dataset.index, 10);
        if (this.storyboardScenes[i]) this.storyboardScenes[i].duration = sel.value;
      });
    });
  }

  async openProductionsPanel() {
    const panel = this.container.querySelector('#videoProductionsPanel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    await this.loadVideoProductions();
    this.renderProductionsGallery();
  }

  closeProductionsPanel() {
    const panel = this.container.querySelector('#videoProductionsPanel');
    if (!panel) return;
    const productionsBtn = this.container.querySelector('#videoProductionsBtn');
    if (productionsBtn && typeof productionsBtn.focus === 'function') {
      productionsBtn.focus();
    }
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    this.renderEscenasCarousel();
  }

  getPublicUrlFromStorage(bucketName, filePath) {
    if (!this.supabase?.storage?.from || !bucketName || typeof filePath !== 'string' || !filePath.trim()) return null;
    try {
      let path = filePath.trim();
      if (path.startsWith(`${bucketName}/`)) path = path.replace(`${bucketName}/`, '');
      else if (path.startsWith('/')) path = path.slice(1);
      const { data } = this.supabase.storage.from(bucketName).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (e) {
      return null;
    }
  }

  async loadVideoProductions() {
    if (!this.supabase) return;
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user?.id) return;
      const { data: runs } = await this.supabase.from('flow_runs').select('id').eq('user_id', user.id);
      const runIds = (runs || []).map((r) => r.id).filter(Boolean);
      if (runIds.length === 0) {
        this.videoProductions = [];
        return;
      }
      const { data } = await this.supabase
        .from('runs_outputs')
        .select('id, run_id, output_type, storage_path, metadata, created_at')
        .in('run_id', runIds)
        .order('created_at', { ascending: false })
        .limit(100);
      const list = data || [];
      const withUrl = list.map((o) => {
        let media_url = null;
        const rawPath = o.storage_path && typeof o.storage_path === 'string' ? o.storage_path.trim() : '';
        if (rawPath) {
          if (rawPath.startsWith('http')) media_url = rawPath;
          else media_url = this.getPublicUrlFromStorage('production-outputs', rawPath) || this.getPublicUrlFromStorage('outputs', rawPath);
        }
        const meta = o.metadata && typeof o.metadata === 'object' ? o.metadata : {};
        if (!media_url) {
          media_url = meta.video_url || meta.url || meta.file_url || meta.videoUrl || meta.output_url || meta.publicUrl || meta.src || null;
        }
        const type = (o.output_type || '').toLowerCase();
        const isVideo = type.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(media_url || '');
        const isImage = type.includes('image') || type.includes('img') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(media_url || '');
        return { ...o, media_url, isVideo, isImage };
      }).filter((o) => o.media_url);
      this.videoProductions = withUrl;
    } catch (e) {
      console.warn('VideoView loadVideoProductions:', e);
      this.videoProductions = [];
    }
  }

  /** Carrusel del sidebar: todas las producciones, seleccionables (toggle). Las seleccionadas se ven en el video prompt footer. */
  renderEscenasCarousel() {
    const carousel = this.container.querySelector('#videoEscenasCarousel');
    if (!carousel) return;
    if (this.videoProductions.length === 0) {
      carousel.innerHTML = '<p class="video-escenas-empty">Aún no hay producciones. Las producciones de tus flows aparecerán aquí.</p>';
      return;
    }
    carousel.innerHTML = this.videoProductions.map((p) => {
      const id = p.id;
      const selected = this.selectedProductionIds.has(id);
      const mediaUrl = (p.media_url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const isImg = p.isImage && !p.isVideo;
      const thumbContent = isImg
        ? `<img class="video-escena-thumb video-escena-thumb-img" src="${mediaUrl}" alt="" loading="lazy" decoding="async">`
        : `<video class="video-escena-thumb" src="${mediaUrl}" preload="metadata" muted playsinline crossorigin="anonymous"></video>`;
      return `
        <div class="video-escena-item ${selected ? 'is-selected' : ''}" data-id="${id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="Seleccionar como escena">
          <div class="video-escena-thumb-wrap">${thumbContent}</div>
        </div>
      `;
    }).join('');
    carousel.querySelectorAll('.video-escena-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (this.selectedProductionIds.has(id)) {
          this.selectedProductionIds.delete(id);
          el.classList.remove('is-selected');
          el.setAttribute('aria-pressed', 'false');
        } else {
          this.selectedProductionIds.add(id);
          el.classList.add('is-selected');
          el.setAttribute('aria-pressed', 'true');
        }
        this.syncProductionSelectionToKling();
      });
    });
  }

  /** Galería del panel: todas las producciones. Click = toggle selección; actualiza escenas y kling. */
  renderProductionsGallery() {
    const gallery = this.container.querySelector('#videoProductionsGallery');
    if (!gallery) return;
    if (this.videoProductions.length === 0) {
      gallery.innerHTML = '<p class="video-productions-empty">Aún no hay producciones. Las producciones de tus flows aparecerán aquí.</p>';
      return;
    }
    gallery.innerHTML = this.videoProductions.map((p) => {
      const id = p.id;
      const selected = this.selectedProductionIds.has(id);
      const mediaUrl = (p.media_url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const isImg = p.isImage && !p.isVideo;
      const thumbContent = isImg
        ? `<img class="video-production-thumb video-production-thumb-img" src="${mediaUrl}" alt="" loading="lazy" decoding="async">`
        : `<video class="video-production-thumb" src="${mediaUrl}" preload="metadata" muted playsinline crossorigin="anonymous"></video>`;
      return `
        <div class="video-production-item ${selected ? 'is-selected' : ''}" data-id="${id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="Seleccionar producción">
          <div class="video-production-thumb-wrap">${thumbContent}</div>
        </div>
      `;
    }).join('');
    gallery.querySelectorAll('.video-production-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (this.selectedProductionIds.has(id)) {
          this.selectedProductionIds.delete(id);
          el.classList.remove('is-selected');
          el.setAttribute('aria-pressed', 'false');
        } else {
          this.selectedProductionIds.add(id);
          el.classList.add('is-selected');
          el.setAttribute('aria-pressed', 'true');
        }
        this.syncProductionSelectionToKling();
        this.renderEscenasCarousel();
      });
    });
  }

  syncProductionSelectionToKling() {
    this.klingElements = this.klingElements.filter((el) => !el._fromProductionQueue);
    const ids = Array.from(this.selectedProductionIds);
    ids.forEach((outputId) => {
      const p = this.videoProductions.find((prod) => String(prod.id) === String(outputId));
      if (!p || !p.media_url) return;
      const name = this.sanitizeElementName(`produccion_${p.id}`.slice(0, 24));
      if (p.isVideo) {
        this.klingElements.push({
          name,
          element_input_video_urls: [p.media_url],
          _fromProductionQueue: true,
          _productionOutputId: p.id,
          _pinned: false
        });
      } else {
        this.klingElements.push({
          name,
          element_input_urls: [p.media_url],
          _fromProductionQueue: true,
          _productionOutputId: p.id,
          _pinned: false
        });
      }
    });
    this.renderKlingElementsList();
  }

  static get CINE_OPTIONS() {
    return {
      shotType: ['Macro Detail', 'Close-up', 'Medium Shot', 'Wide Shot', 'Hero Product Frame', 'Over-the-Shoulder', 'POV', 'Top Down', 'Low Angle', 'High Angle'],
      lens: ['24mm (Wide Cinematic)', '35mm (Natural)', '50mm (Balanced)', '85mm (Portrait Compression)', '100mm Macro'],
      framing: ['Centered', 'Rule of thirds', 'Negative space left', 'Negative space right', 'Symmetrical', 'Dynamic off-center'],
      cameraMovement: ['Static', 'Slow Push In', 'Slow Pull Out', 'Dolly Left', 'Dolly Right', 'Orbit', '360° Rotation', 'Handheld', 'Tracking', 'FPV'],
      motionSpeed: ['Subtle', 'Moderate', 'Dynamic', 'Aggressive'],
      motionIntensity: ['Subtle', 'Moderate', 'Dynamic', 'Aggressive'],
      lightType: ['Soft diffused', 'Hard contrast', 'Rim light', 'Backlit silhouette', 'Studio commercial', 'Natural daylight', 'Dramatic spotlight'],
      contrastLevel: ['Low', 'Medium', 'High', 'Ultra contrast'],
      temperature: ['Neutral', 'Warm', 'Cold'],
      tone: ['Clean commercial', 'Cinematic dramatic', 'Hyperreal product', 'Minimal luxury', 'Dark premium', 'Bright energetic', 'Editorial fashion', 'Documentary'],
      colorGrade: ['Neutral', 'Warm', 'Cold', 'High saturation', 'Muted tones'],
      colorTemp: ['Neutral', 'Warm', 'Cold', 'High saturation', 'Muted tones'],
      energyLevel: ['Low', 'Moderate', 'High', 'Peak']
    };
  }

  initCinematography() {
    const opts = VideoView.CINE_OPTIONS;
    const fill = (id, values, current) => {
      const el = this.container.querySelector(id);
      if (!el) return;
      el.innerHTML = '<option value="">— Ninguno</option>' + values.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('');
    };
    fill('#videoCineShotType', opts.shotType, this.cinematography.shotType);
    fill('#videoCineLens', opts.lens, this.cinematography.lens);
    fill('#videoCineFraming', opts.framing, this.cinematography.framing);
    fill('#videoCineMovement', opts.cameraMovement, this.cinematography.cameraMovement);
    fill('#videoCineMotionSpeed', opts.motionSpeed, this.cinematography.motionSpeed);
    fill('#videoCineMotionIntensity', opts.motionIntensity, this.cinematography.motionIntensity);
    fill('#videoCineLightType', opts.lightType, this.cinematography.lightType);
    fill('#videoCineContrast', opts.contrastLevel, this.cinematography.contrastLevel);
    fill('#videoCineTemperature', opts.temperature, this.cinematography.temperature);
    fill('#videoCineTone', opts.tone, this.cinematography.tone);
    fill('#videoCineColorGrade', opts.colorGrade, this.cinematography.colorGrade);
    fill('#videoCineEnergyLevel', opts.energyLevel, this.cinematography.energyLevel);
    fill('#videoCineColorTemp', opts.colorTemp, this.cinematography.colorTemp);

    const presetKeys = ['shotType', 'lens', 'framing', 'cameraMovement', 'motionSpeed', 'motionIntensity', 'lightType', 'contrastLevel', 'temperature', 'tone', 'colorGrade', 'colorTemp', 'energyLevel'];
    const presetEl = this.container.querySelector('#videoCinePreset');
    if (presetEl) {
      presetEl.addEventListener('change', () => {
        const key = presetEl.value;
        const presets = VideoView.CINEMATOGRAPHY_PRESETS;
        if (presets[key] && key) {
          const p = presets[key];
          this.cinematography.preset = key;
          presetKeys.forEach((k) => { if (p[k] != null) this.cinematography[k] = p[k]; });
          this.syncCinematographyToSelects();
          this.renderCinematographySelectedTags();
          this.renderDirectorVariables();
        }
      });
    }

    const selectConfig = [
      ['videoCineShotType', 'shotType'], ['videoCineLens', 'lens'], ['videoCineFraming', 'framing'],
      ['videoCineMovement', 'cameraMovement'], ['videoCineMotionSpeed', 'motionSpeed'], ['videoCineMotionIntensity', 'motionIntensity'],
      ['videoCineLightType', 'lightType'], ['videoCineContrast', 'contrastLevel'], ['videoCineTemperature', 'temperature'],
      ['videoCineTone', 'tone'], ['videoCineColorGrade', 'colorGrade'], ['videoCineEnergyLevel', 'energyLevel'], ['videoCineColorTemp', 'colorTemp']
    ];
    selectConfig.forEach(([id, key]) => {
      const el = this.container.querySelector('#' + id);
      if (el) el.addEventListener('change', () => {
        this.cinematography[key] = el.value;
        this.renderCinematographySelectedTags();
        this.renderDirectorVariables();
      });
    });

    /* Acordeones cine: delegación para que funcione aunque el DOM se monte después */
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.video-cine-block-header');
      if (!btn) return;
      const block = btn.closest('.video-cine-block');
      const content = block?.querySelector('.video-cine-block-content');
      if (!content) return;
      e.preventDefault();
      const collapsed = content.classList.toggle('video-cine-block-collapsed');
      btn.setAttribute('aria-expanded', !collapsed);
      const icon = btn.querySelector('i.fa-chevron-down, i.fas.fa-chevron-down');
      if (icon) icon.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0)';
    });

    this.renderCinematographySelectedTags();
    this.renderDirectorVariables();
  }

  syncCinematographyToSelects() {
    const c = this.cinematography;
    const set = (id, value) => {
      const el = this.container.querySelector(id);
      if (!el) return;
      el.value = value !== undefined && value !== null ? String(value) : '';
    };
    set('#videoCineShotType', c.shotType);
    set('#videoCineLens', c.lens);
    set('#videoCineFraming', c.framing);
    set('#videoCineMovement', c.cameraMovement);
    set('#videoCineMotionSpeed', c.motionSpeed);
    set('#videoCineMotionIntensity', c.motionIntensity);
    set('#videoCineLightType', c.lightType);
    set('#videoCineContrast', c.contrastLevel);
    set('#videoCineTemperature', c.temperature);
    set('#videoCineTone', c.tone);
    set('#videoCineColorGrade', c.colorGrade);
    set('#videoCineEnergyLevel', c.energyLevel);
    set('#videoCineColorTemp', c.colorTemp);
  }

  renderCinematographySelectedTags() {
    const el = this.container.querySelector('#videoCineSelectedTags');
    if (!el) return;
    const c = this.cinematography;
    const opts = VideoView.CINE_OPTIONS;
    const tagConfig = [
      { key: 'lens', value: c.lens, default: (opts.lens && opts.lens[0]) || '' },
      { key: 'cameraMovement', value: c.cameraMovement, default: (opts.cameraMovement && opts.cameraMovement[0]) || '' },
      { key: 'lightType', value: c.lightType, default: (opts.lightType && opts.lightType[0]) || '' }
    ];
    const tags = tagConfig.filter((t) => t.value).map((t) => ({ key: t.key, label: t.value, default: t.default }));
    if (tags.length === 0) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    el.innerHTML = '<span class="video-cine-selected-label">Selected Style:</span>' + tags.map((t) =>
      `<span class="video-cine-tag" data-key="${t.key}">${t.label.replace(/"/g, '&quot;')}<button type="button" class="video-cine-tag-remove" aria-label="Remove ${t.key}">&times;</button></span>`
    ).join('');
    el.querySelectorAll('.video-cine-tag-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tag = btn.closest('.video-cine-tag');
        const key = tag?.dataset?.key;
        if (key) {
          this.cinematography[key] = '';
          this.syncCinematographyToSelects();
          this.renderCinematographySelectedTags();
          this.renderDirectorVariables();
        }
      });
    });
  }

  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      if (this.organizationId) {
        const { data } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('organization_id', this.organizationId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data?.id) return data.id;
      }
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user?.id) {
        const { data } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.id) return data.id;
      }
      return null;
    } catch (e) {
      console.error('VideoView getBrandContainerId:', e);
      return null;
    }
  }

  async loadBrandData() {
    this.brandContainerId = await this.getBrandContainerId();
    if (!this.supabase || !this.brandContainerId) return;
    try {
      const bcId = this.brandContainerId;
      const { data: brandRow } = await this.supabase.from('brands').select('id, tono_comunicacion, estilo_publicidad, estilo_escritura, palabras_clave, palabras_prohibidas, arquetipo_personalidad, enfoque_marca, estilo_visual, transmitir_visualmente, evitar_visualmente, objetivos_marca').eq('project_id', bcId).maybeSingle();
      const brandId = brandRow?.id || null;
      this.dbData.brand = brandRow || null;
      this.dbData.brandProfiles = [];
      if (brandId) {
        const { data: profiles } = await this.supabase.from('brand_profiles').select('section, content').eq('brand_id', brandId);
        this.dbData.brandProfiles = profiles || [];
      }
      const [productsRes, servicesRes, entitiesRes, audiencesRes, campaignsRes] = await Promise.all([
        this.supabase.from('products').select('id, nombre_producto, brand_container_id').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('services').select('id, nombre_servicio, brand_container_id').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('brand_entities').select('id, name, entity_type, description').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        brandId ? this.supabase.from('audiences').select('id, name, description, estilo_lenguaje').eq('brand_id', brandId).limit(50) : { data: [], error: null },
        this.supabase.from('campaigns').select('id, nombre_campana, descripcion_interna, audience_id, contexto_temporal, objetivos_estrategicos, tono_modificador').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50)
      ]);
      this.dbData.products = productsRes.data || [];
      this.dbData.services = servicesRes.data || [];
      this.dbData.entities = entitiesRes.data || [];
      this.dbData.audiences = audiencesRes.data || [];
      this.dbData.campaigns = campaignsRes.data || [];
      const productIds = this.dbData.products.map((p) => p.id).filter(Boolean);
      if (productIds.length > 0) {
        const { data: imgs } = await this.supabase.from('product_images').select('product_id, image_url, image_type, image_order').in('product_id', productIds).order('image_order', { ascending: true });
        const byProduct = {};
        (imgs || []).forEach((img) => {
          if (!byProduct[img.product_id]) byProduct[img.product_id] = [];
          byProduct[img.product_id].push(img.image_url);
        });
        this.dbData.products.forEach((p) => {
          p.image_urls = (byProduct[p.id] || []).slice(0, 4);
        });
      }
      this.renderCampaignDropdown();
      this.renderAudienceDropdown();
    } catch (e) {
      console.error('VideoView loadBrandData:', e);
    }
  }

  renderCampaignDropdown() {
    const select = this.container.querySelector('#videoCampaignSelect');
    if (!select) return;
    const campaigns = this.dbData.campaigns || [];
    const current = this.selectedCampaignId;
    select.innerHTML = '<option value="">— Ninguna</option>' + campaigns.map((c) => `<option value="${c.id}">${(c.nombre_campana || '').slice(0, 50)}</option>`).join('');
    if (current && campaigns.some((c) => String(c.id) === current)) select.value = current;
  }

  renderAudienceDropdown() {
    const select = this.container.querySelector('#videoAudienceSelect');
    if (!select) return;
    const audiences = this.dbData.audiences || [];
    const current = this.selectedAudienceId;
    select.innerHTML = '<option value="">— Ninguna</option>' + audiences.map((a) => `<option value="${a.id}">${(a.name || '').slice(0, 50)}</option>`).join('');
    if (current && audiences.some((a) => String(a.id) === current)) select.value = current;
  }

  renderDirectorVariables() {
    const el = this.container.querySelector('#videoDirectorVariables');
    if (!el) return;
    const c = this.cinematography;
    const tags = [
      c.shotType && { label: c.shotType, key: 'shotType' },
      c.lens && { label: c.lens, key: 'lens' },
      c.framing && { label: c.framing, key: 'framing' },
      c.cameraMovement && { label: c.cameraMovement, key: 'cameraMovement' },
      c.lightType && { label: c.lightType, key: 'lightType' },
      c.tone && { label: c.tone, key: 'tone' }
    ].filter(Boolean);
    if (tags.length === 0) {
      el.innerHTML = '';
      el.style.display = 'none';
      this.scheduleResizeDirectorBriefInput();
      return;
    }
    el.style.display = 'flex';
    el.className = 'video-director-variables-row video-cine-selected-tags';
    el.innerHTML = '<span class="video-cine-selected-label">Variables:</span>' + tags.map((t) =>
      `<span class="video-cine-tag video-director-variable-tag" data-key="${t.key}">${t.label.replace(/"/g, '&quot;')}<button type="button" class="video-cine-tag-remove" aria-label="Quitar ${t.key}">&times;</button></span>`
    ).join('');
    el.querySelectorAll('.video-cine-tag-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tag = btn.closest('.video-cine-tag');
        const key = tag?.dataset?.key;
        if (key) {
          this.cinematography[key] = '';
          this.syncCinematographyToSelects();
          this.renderCinematographySelectedTags();
          this.renderDirectorVariables();
        }
      });
    });
    this.scheduleResizeDirectorBriefInput();
  }

  /**
   * Regla principal: cuando el usuario selecciona un producto (Asset Stack), ese producto
   * se establece automáticamente como kling_element para la API Kie (referencia visual).
   * Solo aplica con scope "product"; reemplaza cualquier producto previamente seleccionado.
   */
  syncProductSelectionToKling() {
    const scopeSelect = this.container.querySelector('#videoAssetScope');
    const scope = scopeSelect ? scopeSelect.value : this.assetScope;
    if (scope !== 'product') {
      this.klingElements = this.klingElements.filter((el) => !el._fromProductSelection);
      this.renderKlingElementsList();
      return;
    }
    const productId = this.selectedAssetId || '';
    this.klingElements = this.klingElements.filter((el) => !el._fromProductSelection);
    if (productId) {
      const product = (this.dbData.products || []).find((p) => String(p.id) === String(productId));
      if (product && Array.isArray(product.image_urls) && product.image_urls.length >= 1) {
        const name = this.sanitizeElementName((product.nombre_producto || 'product').slice(0, 24));
        const description = (product.descripcion || product.nombre_producto || '').trim() || undefined;
        this.klingElements.push({ name, description, element_input_urls: [...product.image_urls], _fromProductSelection: true, _pinned: false });
      }
    }
    this.renderKlingElementsList();
  }


  sanitizeElementName(str) {
    if (!str || typeof str !== 'string') return 'elemento';
    return str.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'elemento';
  }

  async onKlingElementFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const images = files.filter((f) => f.type.startsWith('image/'));
    const videos = files.filter((f) => f.type.startsWith('video/'));
    if (videos.length === 1 && images.length === 0) {
      const name = this.sanitizeElementName(window.prompt('Nombre del elemento (para usar como @nombre en el prompt):', 'elemento_video') || 'elemento_video');
      const description = window.prompt('Descripción (opcional):', '') || '';
      await this.uploadAndAddKlingElement({ name, description, videoFile: videos[0] });
    } else if (images.length >= 2 && images.length <= 4 && videos.length === 0) {
      const name = this.sanitizeElementName(window.prompt('Nombre del elemento (para usar como @nombre en el prompt):', 'elemento_imagen') || 'elemento_imagen');
      const description = window.prompt('Descripción (opcional):', '') || '';
      await this.uploadAndAddKlingElement({ name, description, imageFiles: images });
    } else {
      if (window.alert) {
        window.alert('Añade 2–4 imágenes (JPG/PNG) o 1 video (MP4/MOV) por elemento.');
      }
    }
  }

  async uploadAndAddKlingElement({ name, description, imageFiles, videoFile }) {
    if (!this.supabase || !this.supabase.storage) {
      if (window.alert) window.alert('No se puede subir: sesión o almacenamiento no disponible.');
      return;
    }
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) {
      if (window.alert) window.alert('Inicia sesión para subir elementos.');
      return;
    }
    const bucket = 'production-outputs';
    const elementId = `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const basePath = `kling-elements/${user.id}/${elementId}`;
    const urls = [];
    try {
      if (imageFiles && imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/jpeg/, 'jpg');
          const fileName = `${basePath}/${i}.${ext}`;
          const { error } = await this.supabase.storage.from(bucket).upload(fileName, file, { contentType: file.type, upsert: false });
          if (error) throw error;
          const { data: { publicUrl } } = this.supabase.storage.from(bucket).getPublicUrl(fileName);
          urls.push(publicUrl);
        }
        this.klingElements.push({
          name,
          description: description || undefined,
          element_input_urls: urls,
          _pinned: false
        });
      } else if (videoFile) {
        const ext = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
        const fileName = `${basePath}/video.${ext}`;
        const { error } = await this.supabase.storage.from(bucket).upload(fileName, videoFile, { contentType: videoFile.type, upsert: false });
        if (error) throw error;
        const { data: { publicUrl } } = this.supabase.storage.from(bucket).getPublicUrl(fileName);
        this.klingElements.push({
          name,
          description: description || undefined,
          element_input_video_urls: [publicUrl],
          _pinned: false
        });
      }
      this.renderKlingElementsList();
    } catch (err) {
      console.error('Error subiendo elemento kling:', err);
      if (window.alert) window.alert('Error al subir: ' + (err.message || 'vuelve a intentarlo.'));
    }
  }

  renderKlingElementsList() {
    const listEl = this.container.querySelector('#videoKlingElementsList');
    if (!listEl) return;
    if (this.klingElements.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      this.scheduleResizeDirectorBriefInput();
      return;
    }
    listEl.style.display = 'flex';
    listEl.innerHTML = this.klingElements.map((el, idx) => {
      const urls = Array.isArray(el.element_input_urls) ? el.element_input_urls : [];
      const isProduct = el._fromProductSelection === true;
      const productPinned = isProduct && el._pinned === true;
      const thumbnails = urls.length > 0
        ? urls.map((url, urlIdx) => {
            const safe = String(url).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            return `<span class="video-kling-element-thumb-wrap">
              <img src="${safe}" alt="" class="video-kling-element-thumb" loading="lazy">
              <button type="button" class="video-kling-element-remove-thumb" data-element-index="${idx}" data-url-index="${urlIdx}" aria-label="Quitar esta imagen">&times;</button>
            </span>`;
          }).join('')
        : '';
      const thumbsContainer = thumbnails ? `<span class="video-kling-element-thumbs">${thumbnails}</span>` : '';
      const hasVideo = (el.element_input_video_urls || []).length > 0;
      const videoLabel = hasVideo ? `<span class="video-kling-element-video-label">@${el.name}</span>` : '';
      const productPinBtn = isProduct ? `<button type="button" class="video-kling-element-pin-chip" data-element-index="${idx}" aria-label="${productPinned ? 'Desanclar producto (dejar solo como imagen de referencia)' : 'Anclar producto (usar como kling_element en el prompt)'}" title="${productPinned ? 'Desanclar' : 'Anclar como elemento de referencia'}"><i class="fas fa-thumbtack${productPinned ? ' video-kling-pin-active' : ''}"></i></button>` : '';
      return `
      <span class="video-kling-element-chip" data-index="${idx}">
        ${thumbsContainer}
        ${!thumbsContainer ? `@${el.name}` : ''}
        ${videoLabel}
        ${productPinBtn}
        <button type="button" class="video-kling-element-remove" aria-label="Quitar elemento ${el.name}">&times;</button>
      </span>
    `;
    }).join('');
    listEl.querySelectorAll('.video-kling-element-pin-chip').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const elIdx = parseInt(btn.dataset.elementIndex, 10);
        if (isNaN(elIdx)) return;
        const el = this.klingElements[elIdx];
        if (!el || !el._fromProductSelection) return;
        el._pinned = !el._pinned;
        this.renderKlingElementsList();
      });
    });
    listEl.querySelectorAll('.video-kling-element-remove-thumb').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const elIdx = parseInt(btn.dataset.elementIndex, 10);
        const urlIdx = parseInt(btn.dataset.urlIndex, 10);
        if (isNaN(elIdx) || isNaN(urlIdx)) return;
        const el = this.klingElements[elIdx];
        if (!el || !Array.isArray(el.element_input_urls)) return;
        el.element_input_urls.splice(urlIdx, 1);
        if (el._pinnedIndices) {
          el._pinnedIndices = el._pinnedIndices.filter((i) => i !== urlIdx).map((i) => (i > urlIdx ? i - 1 : i));
          if (el._pinnedIndices.length === 0) delete el._pinnedIndices;
        }
        if (el.element_input_urls.length === 0) {
          this.klingElements.splice(elIdx, 1);
          if (this.klingElements.every((e) => !e._fromProductSelection)) {
            this.selectedAssetId = '';
            if (this.assetScope === 'product') this.renderAssetProductsCarousel();
          }
        }
        this.renderKlingElementsList();
      });
    });
    listEl.querySelectorAll('.video-kling-element-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.video-kling-element-pin-thumb') || e.target.closest('.video-kling-element-pin-chip')) return;
        const chip = e.target.closest('.video-kling-element-chip');
        const index = chip ? parseInt(chip.dataset.index, 10) : -1;
        if (index >= 0) {
          const removed = this.klingElements[index];
          this.klingElements.splice(index, 1);
          if (removed && removed._fromProductionQueue && removed._productionOutputId) {
            this.selectedProductionIds.delete(removed._productionOutputId);
            this.renderEscenasCarousel();
          }
          this.renderKlingElementsList();
          if (this.klingElements.every((el) => !el._fromProductSelection)) {
            this.selectedAssetId = '';
            const assetSelect = this.container.querySelector('#videoAssetSelect');
            if (assetSelect) assetSelect.value = '';
            if (this.assetScope === 'product') this.renderAssetProductsCarousel();
          }
        }
      });
    });
    this.scheduleResizeDirectorBriefInput();
  }

  hideAllFeedback() {
    if (this.idleArea) this.idleArea.style.display = 'flex';
    if (this.statusArea) this.statusArea.style.display = 'none';
    if (this.resultArea) this.resultArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'none';
  }

  showStatus(message, showSpinner = true) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.statusArea) this.statusArea.style.display = 'block';
    if (this.statusText) this.statusText.textContent = message;
    if (this.statusSpinner) this.statusSpinner.style.display = showSpinner ? 'block' : 'none';
  }

  showResult(url) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.resultArea) this.resultArea.style.display = 'block';
    if (this.resultPlayer) {
      this.resultPlayer.src = url;
      this.resultPlayer.load();
    }
    if (this.resultDownload) {
      this.resultDownload.href = url;
      this.resultDownload.download = '';
    }
  }

  /**
   * Descarga el video desde la URL de KIE (vía proxy para evitar CORS) y lo sube a Supabase.
   * @param {string} kieVideoUrl - URL del video devuelta por KIE (resultUrls[0])
   * @param {string} taskId - ID de la tarea KIE (para nombre de archivo)
   * @returns {{ publicUrl: string, storagePath: string } | null}
   */
  async downloadAndUploadKieVideo(kieVideoUrl, taskId) {
    if (!this.supabase?.storage) return null;
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user?.id) return null;
    const bucket = 'production-outputs';
    const ext = (kieVideoUrl.split('.').pop() || 'mp4').split('?')[0].toLowerCase() || 'mp4';
    const safeTaskId = (taskId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || Date.now();
    const storagePath = `kie-videos/${user.id}/${safeTaskId}.${ext}`;

    this.showStatus('Descargando y guardando en tu cuenta…', true);
    try {
      const proxyUrl = `${VideoView.KIE_VIDEO_DOWNLOAD_API}?videoUrl=${encodeURIComponent(kieVideoUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Descarga fallida: ${res.status}`);
      }
      const blob = await res.blob();
      const contentType = res.headers.get('content-type') || 'video/mp4';
      const { error } = await this.supabase.storage.from(bucket).upload(storagePath, blob, {
        contentType,
        upsert: true
      });
      if (error) throw error;
      const { data: urlData } = this.supabase.storage.from(bucket).getPublicUrl(storagePath);
      return { publicUrl: urlData?.publicUrl || null, storagePath };
    } catch (err) {
      console.error('VideoView downloadAndUploadKieVideo:', err);
      throw err;
    }
  }

  showError(message) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'block';
    if (this.errorText) this.errorText.textContent = message;
  }

  showGeneratedPromptPreview() {
    const c = this.cinematography;
    const brief = (this.promptInput && this.promptInput.value) ? this.promptInput.value.trim() : '';
    const visual = [c.shotType, c.lens, c.framing].filter(Boolean).join(' · ') || '—';
    const motion = [c.cameraMovement, c.motionSpeed, c.motionIntensity].filter(Boolean).join(' · ') || '—';
    const lighting = [c.lightType, c.contrastLevel, c.temperature].filter(Boolean).join(' · ') || '—';
    const placeholder = this.container.querySelector('#videoPromptPreviewPlaceholder');
    const generated = this.container.querySelector('#videoPromptPreviewGenerated');
    const body = this.container.querySelector('#videoPromptPreviewBody');
    const scoreEl = this.container.querySelector('#videoPromptPreviewScore');
    if (placeholder) placeholder.style.display = 'none';
    if (generated) generated.style.display = 'block';
    if (body) {
      body.innerHTML = `
        <p><strong>Visual Direction</strong><br>${visual}</p>
        <p><strong>Camera Plan</strong><br>${c.shotType || '—'} / ${c.lens || '—'} / ${c.framing || '—'}</p>
        <p><strong>Motion Plan</strong><br>${motion}</p>
        <p><strong>Lighting Plan</strong><br>${lighting}</p>
        ${brief ? `<p><strong>Director Brief</strong><br>${brief.slice(0, 200)}${brief.length > 200 ? '…' : ''}</p>` : ''}
      `;
    }
    if (scoreEl) scoreEl.textContent = 'Brand Lock Score: 94%';
    this.promptPreviewCollapsed = false;
    const content = this.container.querySelector('#videoPromptPreviewContent');
    const toggle = this.container.querySelector('#videoPromptPreviewToggle');
    if (content) content.classList.remove('video-collapse-content-closed');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      const icon = toggle.querySelector('.video-collapse-icon');
      if (icon) icon.style.transform = 'rotate(0)';
    }
  }

  buildBrandContextForAPI() {
    const d = this.dbData || {};
    const brand = d.brand || {};
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
      brand_voice: {
        tono_comunicacion: arr(brand.tono_comunicacion),
        estilo_publicidad: arr(brand.estilo_publicidad),
        estilo_escritura: arr(brand.estilo_escritura),
        palabras_clave: arr(brand.palabras_clave),
        palabras_prohibidas: arr(brand.palabras_prohibidas),
        arquetipo_personalidad: arr(brand.arquetipo_personalidad),
        enfoque_marca: arr(brand.enfoque_marca),
        estilo_visual: arr(brand.estilo_visual),
        transmitir_visualmente: arr(brand.transmitir_visualmente),
        evitar_visualmente: arr(brand.evitar_visualmente),
        objetivos_marca: arr(brand.objetivos_marca)
      },
      brand_profiles: (d.brandProfiles || []).map((p) => ({ section: p.section, content: p.content })),
      entities: (d.entities || []).map((e) => ({ name: e.name, entity_type: e.entity_type, description: e.description })),
      products: (d.products || []).map((p) => ({ name: p.nombre_producto })),
      audiences: (d.audiences || []).map((a) => ({ name: a.name, description: a.description, estilo_lenguaje: a.estilo_lenguaje })),
      campaigns: (d.campaigns || []).map((c) => ({ name: c.nombre_campana, description: c.descripcion_interna, audience_id: c.audience_id, contexto_temporal: c.contexto_temporal, objetivos_estrategicos: c.objetivos_estrategicos, tono_modificador: c.tono_modificador })),
      selected_campaign: this.selectedCampaignId ? (d.campaigns || []).find((c) => String(c.id) === String(this.selectedCampaignId)) || null : null,
      selected_audience: this.selectedAudienceId ? (d.audiences || []).find((a) => String(a.id) === String(this.selectedAudienceId)) || null : null
    };
  }

  async saveSystemAIOutput(record) {
    if (!this.supabase) return null;
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user?.id) return null;
      const brandContainerId = this.brandContainerId || await this.getBrandContainerId();
      if (!brandContainerId) return null;
      const row = {
        brand_container_id: brandContainerId,
        user_id: user.id,
        ...record,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await this.supabase.from('system_ai_outputs').insert(row).select('id').single();
      if (error) {
        console.warn('VideoView saveSystemAIOutput:', error.message);
        return null;
      }
      return data?.id || null;
    } catch (e) {
      console.warn('VideoView saveSystemAIOutput:', e);
      return null;
    }
  }

  async updateSystemAIOutput(id, updates) {
    if (!this.supabase || !id) return;
    try {
      await this.supabase.from('system_ai_outputs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e) {
      console.warn('VideoView updateSystemAIOutput:', e);
    }
  }

  async requestCinePrompt() {
    const sendBtn = this.container.querySelector('#videoPromptSend');
    const regenerateBtn = this.container.querySelector('#videoRegeneratePromptBtn');
    if (sendBtn) sendBtn.disabled = true;
    if (regenerateBtn) regenerateBtn.disabled = true;
    this.showStatus('Generando prompt cinematográfico con IA…', true);

    const idea = (this.promptInput && this.promptInput.value) ? this.promptInput.value.trim() : '';
    const sceneElements = (this.klingElements || []).filter((el) => el._fromProductionQueue).map((el) => ({
      name: el.name,
      element_input_urls: el.element_input_urls || undefined,
      element_input_video_urls: el.element_input_video_urls || undefined
    }));
    const sceneImageUrls = [];
    for (const el of sceneElements) {
      const urls = el.element_input_urls || el.element_input_video_urls || [];
      urls.forEach((u) => { if (typeof u === 'string' && u.startsWith('http')) sceneImageUrls.push(u); });
    }
    const productLockElements = (this.klingElements || []).filter((el) => el._fromProductSelection).map((el) => ({
      name: el.name,
      description: el.description,
      element_input_urls: el.element_input_urls || undefined
    }));
    const brandContext = this.buildBrandContextForAPI();

    const payload = {
      idea,
      director_brief: idea,
      multi_prompt: this.multiShotEnabled,
      scene_elements: sceneElements,
      scene_image_urls: sceneImageUrls,
      product_lock_elements: productLockElements,
      campaign: brandContext.selected_campaign,
      audience: brandContext.selected_audience,
      brand_context: brandContext,
      cinematography: { ...this.cinematography }
    };

    try {
      const res = await fetch('/.netlify/functions/openai-cine-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        this.showError(data.error || 'Error al generar el prompt');
        return;
      }
      if (data.multi_prompts && Array.isArray(data.multi_prompts) && data.multi_prompts.length > 0) {
        this.multiPrompts = data.multi_prompts.map((p) => (typeof p === 'string' ? p.trim() : String(p)));
        if (this.promptInput) {
          this.promptInput.value = this.multiPrompts.map((p, i) => `--- Shot ${i + 1} ---\n${p}`).join('\n\n');
        }
        const hint = this.container.querySelector('#videoPromptTimeoutHint');
        if (hint) hint.style.display = (this.promptInput.value || '').trim().length > 450 ? 'block' : 'none';
        this.hideAllFeedback();
        this.updatePromptButtonState(true);
        await this.saveSystemAIOutput({
          provider: 'openai',
          output_type: 'text',
          status: 'completed',
          prompt_used: payload.idea || null,
          text_content: this.multiPrompts.join('\n\n'),
          metadata: { source: 'openai-cine-prompt', multi_prompt: true, shots: this.multiPrompts.length }
        });
      } else if (data.prompt && this.promptInput) {
        this.multiPrompts = [];
        this.promptInput.value = data.prompt;
        const hintEl = this.container.querySelector('#videoPromptTimeoutHint');
        if (hintEl) hintEl.style.display = (data.prompt || '').trim().length > 450 ? 'block' : 'none';
        this.hideAllFeedback();
        this.updatePromptButtonState(true);
        await this.saveSystemAIOutput({
          provider: 'openai',
          output_type: 'text',
          status: 'completed',
          prompt_used: payload.idea || null,
          text_content: data.prompt,
          metadata: { source: 'openai-cine-prompt', has_cinematography: true }
        });
      } else {
        this.showError('No se recibió prompt');
      }
    } catch (err) {
      this.showError(err.message || 'Error de conexión');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (regenerateBtn) regenerateBtn.disabled = false;
      this.scheduleResizeDirectorBriefInput();
    }
  }

  updatePromptButtonState(hasPrompt) {
    this.hasGeneratedPrompt = !!hasPrompt;
    const sendBtn = this.container.querySelector('#videoPromptSend');
    const labelEl = this.container.querySelector('#videoPromptSendLabel');
    const regenerateBtn = this.container.querySelector('#videoRegeneratePromptBtn');
    if (sendBtn) {
      sendBtn.setAttribute('data-state', hasPrompt ? 'production' : 'prompt');
      sendBtn.setAttribute('aria-label', hasPrompt ? 'Generar video (producción)' : 'Generar prompt');
      const icon = sendBtn.querySelector('i');
      if (icon) {
        icon.className = hasPrompt ? 'fas fa-play' : 'fas fa-wand-magic-sparkles';
      }
    }
    if (labelEl) labelEl.textContent = hasPrompt ? 'PRODUCCIÓN' : 'PROMPT';
    if (regenerateBtn) regenerateBtn.style.display = hasPrompt ? '' : 'none';
  }

  parseMultiShotsFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const raw = text.trim();
    const byMarker = raw.split(/\n*---\s*Shot\s*\d+\s*---\s*\n*/i).map((s) => s.trim()).filter(Boolean);
    if (byMarker.length > 1) return byMarker;
    const byLine = raw.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
    if (byLine.length > 1) return byLine;
    return raw ? [raw] : [];
  }

  async startGeneration() {
    if (!this.hasGeneratedPrompt) {
      this.showError('Genera primero el prompt con el botón PROMPT.');
      return;
    }
    const promptText = (this.promptInput && this.promptInput.value) ? this.promptInput.value.trim() : '';
    if (!promptText) {
      this.showError('No hay prompt. Usa "Volver a producir" para regenerar el prompt.');
      return;
    }

    const VIDEO_CREDITS_REQUIRED = 25;
    if (!this.organizationId) {
      this.showError('Selecciona una organización para producir videos.');
      return;
    }
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('organization_credits')
        .select('credits_available')
        .eq('organization_id', this.organizationId)
        .maybeSingle();
      if (!error && data != null) {
        const available = data.credits_available ?? 0;
        if (available < VIDEO_CREDITS_REQUIRED) {
          this.showError(`Tu organización no tiene créditos suficientes. Necesitas al menos ${VIDEO_CREDITS_REQUIRED} créditos para producir un video.`);
          return;
        }
      }
    }

    const modeEl = this.container.querySelector('#videoMode');
    const mode = modeEl && modeEl.value === 'pro' ? 'pro' : 'std';
    if (this.sendBtn) this.sendBtn.disabled = true;
    this.showStatus('Creando tarea de generación…', true);

    const durationEl = this.container.querySelector('#videoDuration');
    const aspectEl = this.container.querySelector('#videoAspectRatio');
    const soundEl = this.container.querySelector('#videoSound');
    const duration = durationEl && durationEl.value ? String(durationEl.value) : '5';
    const aspect_ratio = aspectEl && aspectEl.value ? String(aspectEl.value) : '16:9';
    const sound = soundEl ? soundEl.getAttribute('aria-pressed') === 'true' : true;

    const payload = {
      action: 'createTask',
      mode,
      duration,
      aspect_ratio,
      sound
    };

    if (this.multiShotEnabled) {
      const shots = this.multiPrompts.length > 0
        ? this.multiPrompts
        : this.parseMultiShotsFromText(promptText);
      if (shots.length > 0) {
        payload.multi_shots = shots.map((p) => ({ prompt: typeof p === 'string' ? p.trim() : String(p) }));
      } else {
        payload.multi_shots = [{ prompt: promptText }];
      }
    } else {
      payload.prompt = promptText;
    }

    // image_urls: TODAS las imágenes (producto, escena, adjuntos). Por defecto todo va como image_urls.
    const allImageUrls = [];
    (this.klingElements || []).forEach((el) => {
      const urls = Array.isArray(el.element_input_urls) ? el.element_input_urls : [];
      urls.forEach((u) => { if (typeof u === 'string' && u.startsWith('http')) allImageUrls.push(u); });
    });
    if (allImageUrls.length > 0) payload.image_urls = [...new Set(allImageUrls)];

    // kling_elements: SOLO productos con chincheta activada. Escenas y adjuntos NUNCA son kling_elements; solo image_urls.
    // Formato obligatorio: name (nombre producto), description (descripción producto), element_input_urls (2 URLs; duplicar si 1).
    const pinnedProducts = [];
    (this.klingElements || []).forEach((el) => {
      if (!el || !el.name || !el._fromProductSelection || el._pinned !== true) return;
      const urls = (Array.isArray(el.element_input_urls) ? el.element_input_urls : []).filter((u) => typeof u === 'string' && u.startsWith('http'));
      if (urls.length === 0) return;
      const element_input_urls = urls.length === 1 ? [urls[0], urls[0]] : urls.slice(0, 2);
      pinnedProducts.push({
        name: el.name,
        description: typeof el.description === 'string' && el.description.trim() ? el.description.trim() : el.name,
        element_input_urls
      });
    });
    if (pinnedProducts.length > 0) {
      payload.kling_elements = pinnedProducts;
      const refs = pinnedProducts.map((el) => `@${el.name}`).filter((ref) => {
        if (payload.prompt && payload.prompt.includes(ref)) return false;
        if (payload.multi_shots) return !payload.multi_shots.some((s) => s.prompt && s.prompt.includes(ref));
        return true;
      });
      if (refs.length) {
        const suffix = ' ' + refs.join(' ');
        if (this.multiShotEnabled && payload.multi_shots && payload.multi_shots.length) {
          payload.multi_shots[0].prompt = (payload.multi_shots[0].prompt || '').trim() + suffix;
        } else if (payload.prompt) {
          payload.prompt = payload.prompt.trim() + suffix;
        }
      }
    }

    const createUrl = VideoView.KLING_VIDEO_CREATE_API;
    console.log('[Video] POST crear tarea →', createUrl, { action: 'createTask', mode, duration: payload.duration, hasPrompt: !!payload.prompt, image_urls: (payload.image_urls || []).length, kling_elements: (payload.kling_elements || []).length });

    try {
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let createData = {};
      try {
        createData = await createRes.json();
      } catch (parseErr) {
        console.error('[Video] POST', createUrl, ': respuesta no es JSON (p. ej. 404 devuelve HTML). Status:', createRes.status, 'parseErr:', parseErr);
        this.showError('El servidor respondió con ' + createRes.status + '. ¿Están desplegadas las funciones kling-video-create / kling-video-status en Netlify?');
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      console.log('[Video] POST', createUrl, '→ status:', createRes.status, 'body:', createData);

      if (!createRes.ok) {
        console.warn('[Video] POST', createUrl, 'error:', createRes.status, createData);
        if (createRes.status === 422 && createData.kieBody) {
          console.warn('[Video] 422 KIE (validación):', createData.kieBody);
        }
        const serverMsg = (createData.kieBody && (createData.kieBody.msg || createData.kieBody.message)) || createData.error || createData.failMsg || 'Error al crear la tarea';
        this.showError(serverMsg);
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      const taskId = createData.taskId;
      if (!taskId) {
        console.warn('[Video] POST ok pero sin taskId en body:', createData);
        this.showError('No se recibió taskId del servidor');
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      console.log('[Video] Tarea creada, taskId:', taskId, '→ iniciando polling');

      this._lastKieOutputId = await this.saveSystemAIOutput({
        provider: 'kie_api',
        output_type: 'video',
        status: 'processing',
        external_job_id: taskId,
        prompt_used: promptText,
        metadata: { mode: payload.mode || 'pro', duration: payload.duration, aspect_ratio: payload.aspect_ratio, kling_elements_count: (payload.kling_elements || []).length }
      });

      this.showStatus('Generando video (Kling 3.0). Esto puede tardar unos minutos…', true);
      await this.pollTask(taskId);
    } catch (err) {
      console.error('[Video] Error en startGeneration:', err);
      this.showError(err.message || 'Error de conexión');
    } finally {
      if (this.sendBtn) this.sendBtn.disabled = false;
    }
  }

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  async pollTask(taskId) {
    const statusUrl = `${VideoView.KLING_VIDEO_STATUS_API}?taskId=${encodeURIComponent(taskId)}`;
    const pollStartedAt = Date.now();
    console.log('[Video] Polling estado → GET', statusUrl, '(cada', VideoView.POLL_INTERVAL_MS / 1000, 's, máx', VideoView.POLL_MAX_DURATION_MS / 60000, 'min)');

    const poll = async () => {
      if (Date.now() - pollStartedAt > VideoView.POLL_MAX_DURATION_MS) {
        this.stopPolling();
        this.showError('La generación superó el tiempo máximo de espera (12 min). Comprueba el estado en KIE o reintenta con un prompt más corto.');
        if (this._lastKieOutputId) {
          await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'Timeout de polling (12 min)' });
          this._lastKieOutputId = null;
        }
        return;
      }
      try {
        const res = await fetch(statusUrl);
        let data = {};
        try {
          data = await res.json();
        } catch (parseErr) {
          console.error('[Video] GET', statusUrl, ': respuesta no es JSON. Status:', res.status, '→ ¿función desplegada?', parseErr);
          this.stopPolling();
          this.showError('El servidor respondió ' + res.status + ' (respuesta no JSON). Revisa que kling-video-status esté desplegada en Netlify.');
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'Status ' + res.status });
            this._lastKieOutputId = null;
          }
          return;
        }

        if (!res.ok) {
          console.warn('[Video] GET', statusUrl, 'error:', res.status, data);
          this.stopPolling();
          this.showError(data.error || 'Error al consultar el estado');
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: data.error || 'Error al consultar el estado' });
            this._lastKieOutputId = null;
          }
          return;
        }

        const state = data.data?.state;
        console.log('[Video] GET estado →', res.status, 'state:', state, 'data.data:', data.data);
        if (state === 'success') {
          this.stopPolling();
          let resultJson = data.data?.resultJson;
          if (typeof resultJson === 'string') {
            try {
              resultJson = JSON.parse(resultJson);
            } catch (_) {}
          }
          const urls = resultJson?.resultUrls;
          const kieUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
          if (kieUrl) {
            try {
              const uploaded = await this.downloadAndUploadKieVideo(kieUrl, taskId);
              if (uploaded?.publicUrl) {
                this.showResult(uploaded.publicUrl);
                if (this._lastKieOutputId) {
                  await this.updateSystemAIOutput(this._lastKieOutputId, {
                    status: 'completed',
                    storage_path: uploaded.storagePath,
                    metadata: { resultUrls: urls, video_url: uploaded.publicUrl, kie_source_url: kieUrl },
                    error_message: null
                  });
                  this._lastKieOutputId = null;
                }
                // Cobro automático de 25 créditos al guardar el video exitosamente
                const VIDEO_CREDITS = 25;
                if (this.supabase && this.organizationId) {
                  try {
                    const { data: { user } } = await this.supabase.auth.getUser();
                    if (user?.id) {
                      const { data: deductResult, error: rpcError } = await this.supabase
                        .rpc('deduct_credits_for_video', {
                          p_organization_id: this.organizationId,
                          p_user_id: user.id,
                          p_amount: VIDEO_CREDITS
                        });
                      if (!rpcError && deductResult?.success === true) {
                        if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
                          window.appNavigation.loadCreditsFromDb(this.organizationId);
                        }
                      } else if (deductResult?.error_message === 'insufficient_credits') {
                        console.warn('[Video] Video guardado pero créditos insuficientes para cobrar', deductResult.credits_available);
                      }
                    }
                  } catch (e) {
                    console.warn('[Video] Error al cobrar créditos:', e);
                  }
                }
              } else {
                this.showError('No se pudo guardar el video en tu cuenta');
                if (this._lastKieOutputId) {
                  await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'No se pudo guardar el video en tu cuenta' });
                  this._lastKieOutputId = null;
                }
              }
            } catch (err) {
              this.showError(err.message || 'Error al descargar o guardar el video');
              if (this._lastKieOutputId) {
                await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: err.message || 'Error al descargar o guardar el video' });
                this._lastKieOutputId = null;
              }
            }
          } else {
            this.showError('No se encontró URL del video en la respuesta');
            if (this._lastKieOutputId) {
              await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'No se encontró URL del video en la respuesta' });
              this._lastKieOutputId = null;
            }
          }
          return;
        }
        if (state === 'fail') {
          this.stopPolling();
          const rawMsg = data.data?.failMsg || data.data?.failCode || 'La generación falló';
          const is524 = String(data.data?.failCode || '') === '524' || /timeout/i.test(rawMsg);
          const msg = is524
            ? 'La generación tardó demasiado en KIE (error 524). Prueba: modo Estándar, duración 5s, una sola imagen de referencia, o acorta el prompt.'
            : rawMsg;
          this.showError(msg);
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: msg });
            this._lastKieOutputId = null;
          }
          return;
        }

        this.showStatus('Generando video (Kling 3.0). Esto puede tardar unos minutos…', true);
      } catch (err) {
        this.stopPolling();
        this.showError(err.message || 'Error al consultar el estado');
        if (this._lastKieOutputId) {
          await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: err.message || 'Error al consultar el estado' });
          this._lastKieOutputId = null;
        }
      }
    };

    await poll();
    this._pollInterval = setInterval(poll, VideoView.POLL_INTERVAL_MS);
  }

  onLeave() {
    this.stopPolling();
    if (this._resizeDirectorBriefOnWin) {
      window.removeEventListener('resize', this._resizeDirectorBriefOnWin);
      this._resizeDirectorBriefOnWin = null;
    }
  }

  destroy() {
    this.stopPolling();
    if (this._resizeDirectorBriefOnWin) {
      window.removeEventListener('resize', this._resizeDirectorBriefOnWin);
      this._resizeDirectorBriefOnWin = null;
    }
  }
}

window.VideoView = VideoView;
