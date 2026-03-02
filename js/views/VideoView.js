/**
 * VideoView - Página de generación de video con Kling 3.0 (KIE API).
 * Misma estructura que el resto de vistas: renderHTML() sin template, layout organization-* del bundle.
 * Flujo: crear tarea (createTask) → consultar estado (recordInfo) hasta success/fail → mostrar video o error.
 */
class VideoView extends BaseView {
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
    this.cinematography = {
      preset: '',
      shotType: 'Hero Product Frame',
      lens: '50mm (Balanced)',
      framing: 'Centered',
      cameraMovement: 'Static',
      motionSpeed: 'Subtle',
      motionIntensity: 'Subtle',
      lightType: 'Soft diffused',
      contrastLevel: 'Medium',
      temperature: 'Neutral',
      tone: 'Clean commercial',
      colorGrade: 'Neutral',
      colorTemp: 'Neutral',
      energyLevel: 'Moderate'
    };
    this.cineBlocksCollapsed = { camera: false, movement: false, lighting: false, mood: false };
    this.assetScope = 'product';
    this.selectedAssetId = '';
    this.storyboardScenes = [{ brief: '', duration: '5' }, { brief: '', duration: '5' }];
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
        <div class="video-status-area" id="videoStatusArea" style="display: none;">
          <div class="video-status-card" id="videoStatusCard">
            <p class="video-status-text" id="videoStatusText">—</p>
            <div class="video-status-spinner" id="videoStatusSpinner" style="display: none;"></div>
          </div>
        </div>

        <div class="video-result-area" id="videoResultArea" style="display: none;">
          <div class="video-result-card">
            <h2 class="video-result-title">Video generado</h2>
            <div class="video-result-player-wrap">
              <video id="videoResultPlayer" class="video-result-player" controls playsinline></video>
            </div>
            <a id="videoResultDownload" class="btn btn-secondary video-download-btn" href="#" download target="_blank" rel="noopener">
              <i class="fas fa-download"></i> Descargar
            </a>
          </div>
        </div>

        <div class="video-error-area" id="videoErrorArea" style="display: none;">
          <div class="video-error-card">
            <p class="video-error-text" id="videoErrorText">—</p>
          </div>
        </div>

        <div class="video-productions-panel video-productions-panel-inline" id="videoProductionsPanel" aria-hidden="true" style="display: none;">
          <div class="video-productions-panel-card">
            <div class="video-productions-panel-header">
              <h3 class="video-prompt-panel-title">Production Queue</h3>
              <button type="button" class="video-productions-panel-close" id="videoProductionsPanelClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
            </div>
            <div class="video-productions-carousel-wrap">
              <div class="video-productions-carousel" id="videoProductionsCarousel"></div>
            </div>
          </div>
        </div>

        <footer class="video-page-footer video-prompt-wrap" aria-label="Director Console">
          <div class="video-prompt-cards-row">
            <div class="video-prompt-footer-card video-prompt-footer-card-left">
              <div class="video-prompt-footer-card-inner glass-black video-left-inner">
                <h3 class="video-section-label">Production Context</h3>
                <div class="video-left-block">
                  <h4 class="video-prompt-panel-title">Producciones</h4>
                  <button type="button" class="video-prompt-db-select video-prompt-productions-btn" id="videoProductionsBtn" aria-label="Production Queue">
                    <i class="fas fa-play"></i> Production Queue
                  </button>
                </div>
                <div class="video-left-block video-asset-stack-block">
                  <h4 class="video-prompt-panel-title">Asset Stack</h4>
                  <div class="video-asset-scope-wrap">
                    <select id="videoAssetScope" class="video-prompt-db-select video-asset-scope-select" aria-label="Scope">
                      <option value="product">Product</option>
                      <option value="service">Service</option>
                      <option value="brand_world">Brand World</option>
                      <option value="campaign">Campaign</option>
                      <option value="collection">Collection</option>
                    </select>
                  </div>
                  <select id="videoAssetSelect" class="video-prompt-db-select video-asset-select" aria-label="Asset" style="margin-top: 0.35rem;">
                    <option value="">— None</option>
                  </select>
                  <div class="video-asset-card" id="videoAssetCard">
                    <div class="video-asset-card-placeholder" id="videoAssetCardPlaceholder">Select an asset</div>
                    <div class="video-asset-card-active" id="videoAssetCardActive" style="display: none;">
                      <div class="video-asset-card-name" id="videoAssetCardName"></div>
                      <ul class="video-asset-card-locks" id="videoAssetCardLocks"></ul>
                      <button type="button" class="video-asset-change-btn" id="videoAssetChangeBtn">Change Asset</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="video-prompt-footer-card video-prompt-footer-card-center">
              <div class="video-prompt-footer-card-inner glass-black video-director-console">
                <h3 class="video-section-label video-director-title">Director Console</h3>
                <input type="file" id="videoImageUpload" accept="image/*" multiple style="display: none;" aria-hidden="true">
                <div class="video-kling-elements-list" id="videoKlingElementsList" aria-live="polite"></div>
                <textarea
                  id="videoPromptInput"
                  class="video-prompt-input video-director-brief-input"
                  placeholder="Describe the intention. We handle the production. Use @product to reference assets."
                  rows="4"
                  autocomplete="off"
                  aria-label="Director Brief"
                ></textarea>
                <div class="video-prompt-actions video-prompt-actions-row2">
                  <button type="button" class="video-prompt-toggle video-prompt-sound active" id="videoSound" title="Sound" aria-pressed="true"><i class="fas fa-volume-up"></i><span>Sound</span></button>
                  <div class="video-prompt-aspect-wrap">
                    <select id="videoAspectRatio" class="video-prompt-aspect" aria-label="Format"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select>
                    <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                  </div>
                  <button type="button" class="video-prompt-btn video-prompt-btn-add" id="videoPromptAdd" aria-label="Add"><i class="fas fa-plus"></i></button>
                  <div class="video-prompt-duration-wrap">
                    <select id="videoDuration" class="video-prompt-aspect" aria-label="Duration"><option value="5">5s</option><option value="10">10s</option><option value="15">15s</option></select>
                    <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                  </div>
                  <button type="button" class="video-prompt-btn video-prompt-btn-send" id="videoPromptSend" aria-label="Generate"><i class="fas fa-paper-plane"></i></button>
                </div>
                <div class="video-storyboard-wrap" id="videoStoryboardWrap" style="display: none;">
                  <h4 class="video-storyboard-title">Storyboard</h4>
                  <div class="video-storyboard-scenes" id="videoStoryboardScenes"></div>
                </div>
              </div>
            </div>
            <div class="video-prompt-footer-card video-prompt-footer-card-right">
              <div class="video-prompt-footer-card-inner glass-black video-cinematography-panel">
                <h3 class="video-prompt-panel-title">Cinematography</h3>
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
                    <button type="button" class="video-cine-block-header" aria-expanded="true"><span>Camera</span><i class="fas fa-chevron-down"></i></button>
                    <div class="video-cine-block-content">
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
                    <button type="button" class="video-cine-block-header" aria-expanded="false"><span>Mood</span><i class="fas fa-chevron-down"></i></button>
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
        </footer>
      </div>
    `;
  }

  async init() {
    this.sendBtn = this.container.querySelector('#videoPromptSend');
    this.promptInput = this.container.querySelector('#videoPromptInput');
    if (this.promptInput && this.promptInput.tagName === 'TEXTAREA') {
      this.promptInput.setAttribute('rows', '4');
      this.promptInput.style.minHeight = '120px';
    }
    this.aspectSelect = this.container.querySelector('#videoAspectRatio');
    this.statusArea = this.container.querySelector('#videoStatusArea');
    this.statusText = this.container.querySelector('#videoStatusText');
    this.statusSpinner = this.container.querySelector('#videoStatusSpinner');
    this.resultArea = this.container.querySelector('#videoResultArea');
    this.resultPlayer = this.container.querySelector('#videoResultPlayer');
    this.resultDownload = this.container.querySelector('#videoResultDownload');
    this.errorArea = this.container.querySelector('#videoErrorArea');
    this.errorText = this.container.querySelector('#videoErrorText');

    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.startGeneration());
    }
    if (this.promptInput) {
      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.startGeneration();
        }
      });
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
        this.renderAssetDropdown();
        this.renderAssetCard();
        this.syncProductSelectionToKling();
      });
    }
    if (assetSelect) {
      assetSelect.addEventListener('change', () => {
        this.selectedAssetId = assetSelect.value || '';
        this.renderAssetCard();
        this.syncProductSelectionToKling();
      });
    }
    const changeAssetBtn = this.container.querySelector('#videoAssetChangeBtn');
    if (changeAssetBtn) changeAssetBtn.addEventListener('click', () => this.clearAssetSelection());
    const productionsBtn = this.container.querySelector('#videoProductionsBtn');
    const panelClose = this.container.querySelector('#videoProductionsPanelClose');
    if (productionsBtn) productionsBtn.addEventListener('click', () => this.openProductionsPanel());
    if (panelClose) panelClose.addEventListener('click', () => this.closeProductionsPanel());
    await this.loadBrandData();
    const scopeEl = this.container.querySelector('#videoAssetScope');
    if (scopeEl) this.assetScope = scopeEl.value || 'product';
    this.renderAssetDropdown();
    this.renderAssetCard();
    await this.loadVideoProductions();
    this.initCinematography();
    this.container.querySelectorAll('.video-prompt-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pressed = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', pressed);
        btn.classList.toggle('active', pressed);
        if (btn.id === 'videoMultiShots') {
          const wrap = this.container.querySelector('#videoStoryboardWrap');
          if (wrap) {
            wrap.style.display = pressed ? 'block' : 'none';
            if (pressed) this.renderStoryboardScenes();
          }
        }
      });
    });
  }

  clearAssetSelection() {
    const assetSelect = this.container.querySelector('#videoAssetSelect');
    if (assetSelect) assetSelect.value = '';
    this.selectedAssetId = '';
    this.renderAssetCard();
    this.syncProductSelectionToKling();
  }

  getAssetListByScope() {
    const scope = this.assetScope || 'product';
    if (scope === 'product') return (this.dbData.products || []).map((p) => ({ id: p.id, name: p.nombre_producto || 'Product', type: 'product' }));
    if (scope === 'service') return (this.dbData.services || []).map((s) => ({ id: s.id, name: s.nombre_servicio || 'Service', type: 'service' }));
    if (scope === 'campaign') return (this.dbData.campaigns || []).map((c) => ({ id: c.id, name: c.nombre_campana || 'Campaign', type: 'campaign' }));
    if (scope === 'brand_world') return (this.dbData.entities || []).map((e) => ({ id: e.id, name: e.name || 'Entity', type: 'entity' }));
    return [];
  }

  renderAssetDropdown() {
    const select = this.container.querySelector('#videoAssetSelect');
    if (!select) return;
    const items = this.getAssetListByScope();
    const current = select.value;
    const options = items.map((item) => `<option value="${String(item.id)}">${(item.name || '').slice(0, 50)}</option>`).join('');
    select.innerHTML = '<option value="">— None</option>' + options;
    if (current && items.some((i) => String(i.id) === current)) select.value = current;
    else this.selectedAssetId = '';
  }

  renderAssetCard() {
    const placeholder = this.container.querySelector('#videoAssetCardPlaceholder');
    const active = this.container.querySelector('#videoAssetCardActive');
    const nameEl = this.container.querySelector('#videoAssetCardName');
    const locksEl = this.container.querySelector('#videoAssetCardLocks');
    if (!placeholder || !active) return;
    const id = this.container.querySelector('#videoAssetSelect')?.value || this.selectedAssetId;
    if (!id) {
      placeholder.style.display = 'block';
      active.style.display = 'none';
      return;
    }
    const scope = this.assetScope || 'product';
    let displayName = '';
    const locks = ['Packaging locked', 'Color palette locked', 'Tone locked'];
    if (scope === 'product') {
      const p = (this.dbData.products || []).find((x) => String(x.id) === String(id));
      displayName = p?.nombre_producto || 'Product';
    } else if (scope === 'service') {
      const s = (this.dbData.services || []).find((x) => String(x.id) === String(id));
      displayName = s?.nombre_servicio || 'Service';
    } else if (scope === 'campaign') {
      const c = (this.dbData.campaigns || []).find((x) => String(x.id) === String(id));
      displayName = c?.nombre_campana || 'Campaign';
    } else {
      const e = (this.dbData.entities || []).find((x) => String(x.id) === String(id));
      displayName = e?.name || 'Asset';
    }
    placeholder.style.display = 'none';
    active.style.display = 'block';
    if (nameEl) nameEl.textContent = displayName;
    if (locksEl) locksEl.innerHTML = locks.map((l) => `<li><i class="fas fa-check"></i> ${l}</li>`).join('');
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
    this.renderProductionsCarousel();
  }

  closeProductionsPanel() {
    const panel = this.container.querySelector('#videoProductionsPanel');
    if (!panel) return;
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
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

  renderProductionsCarousel() {
    const carousel = this.container.querySelector('#videoProductionsCarousel');
    if (!carousel) return;
    if (this.videoProductions.length === 0) {
      carousel.innerHTML = '<p class="video-productions-empty">Aún no hay producciones. Las producciones de tus flows aparecerán aquí.</p>';
      return;
    }
    carousel.innerHTML = this.videoProductions.map((p) => {
      const id = p.id;
      const selected = this.selectedProductionIds.has(id);
      const mediaUrl = (p.media_url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const isImg = p.isImage && !p.isVideo;
      const thumbContent = isImg
        ? `<img class="video-production-thumb video-production-thumb-img" src="${mediaUrl}" alt="" loading="lazy" decoding="async">`
        : `<video class="video-production-thumb" src="${mediaUrl}" preload="metadata" muted playsinline crossorigin="anonymous"></video>`;
      return `
        <div class="video-production-item ${selected ? 'is-selected' : ''}" data-id="${id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="Seleccionar producción">
          <div class="video-production-thumb-wrap">
            ${thumbContent}
          </div>
        </div>
      `;
    }).join('');
    carousel.querySelectorAll('.video-production-item').forEach((el) => {
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
      });
    });
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
      el.innerHTML = values.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('');
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
      });
    });

    this.container.querySelectorAll('.video-cine-block-header').forEach((btn) => {
      btn.addEventListener('click', () => {
        const block = btn.closest('.video-cine-block');
        const content = block?.querySelector('.video-cine-block-content');
        if (!content) return;
        const collapsed = content.classList.toggle('video-cine-block-collapsed');
        btn.setAttribute('aria-expanded', !collapsed);
        const icon = btn.querySelector('i.fa-chevron-down');
        if (icon) icon.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0)';
      });
    });

    this.renderCinematographySelectedTags();
  }

  syncCinematographyToSelects() {
    const c = this.cinematography;
    const set = (id, value) => {
      const el = this.container.querySelector(id);
      if (el && value) el.value = value;
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
        if (key && opts[key] && opts[key][0]) {
          this.cinematography[key] = opts[key][0];
          this.syncCinematographyToSelects();
          this.renderCinematographySelectedTags();
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
      const { data: brandRow } = await this.supabase.from('brands').select('id').eq('project_id', bcId).maybeSingle();
      const brandId = brandRow?.id || null;
      const [productsRes, servicesRes, entitiesRes, audiencesRes, campaignsRes] = await Promise.all([
        this.supabase.from('products').select('id, nombre_producto, brand_container_id').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('services').select('id, nombre_servicio, brand_container_id').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('brand_entities').select('id, name, entity_type, description').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        brandId ? this.supabase.from('audiences').select('id, name, description').eq('brand_id', brandId).limit(50) : { data: [], error: null },
        this.supabase.from('campaigns').select('id, nombre_campana, descripcion_interna').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50)
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
    } catch (e) {
      console.error('VideoView loadBrandData:', e);
    }
  }

  syncProductSelectionToKling() {
    const scopeSelect = this.container.querySelector('#videoAssetScope');
    const assetSelect = this.container.querySelector('#videoAssetSelect');
    if (!assetSelect || (scopeSelect && scopeSelect.value !== 'product')) {
      this.klingElements = this.klingElements.filter((el) => !el._fromProductSelection);
      this.renderKlingElementsList();
      return;
    }
    const productId = assetSelect.value;
    this.klingElements = this.klingElements.filter((el) => !el._fromProductSelection);
    if (productId) {
      const product = (this.dbData.products || []).find((p) => String(p.id) === String(productId));
      if (product && Array.isArray(product.image_urls) && product.image_urls.length >= 2 && product.image_urls.length <= 4) {
        const name = this.sanitizeElementName((product.nombre_producto || 'product').slice(0, 24));
        this.klingElements.push({
          name,
          description: product.nombre_producto || undefined,
          element_input_urls: product.image_urls.slice(0, 4),
          _fromProductSelection: true
        });
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
          element_input_urls: urls
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
          element_input_video_urls: [publicUrl]
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
      return;
    }
    listEl.style.display = 'flex';
    listEl.innerHTML = this.klingElements.map((el, idx) => {
      const urls = Array.isArray(el.element_input_urls) ? el.element_input_urls : [];
      const thumbnails = urls.length > 0
        ? urls.map((url) => `<img src="${String(url).replace(/"/g, '&quot;')}" alt="" class="video-kling-element-thumb" loading="lazy">`).join('')
        : '';
      return `
      <span class="video-kling-element-chip" data-index="${idx}">
        ${thumbnails ? `<span class="video-kling-element-thumbs">${thumbnails}</span>` : ''}
        ${thumbnails ? '' : `@${el.name}`}
        <button type="button" class="video-kling-element-remove" aria-label="Quitar elemento ${el.name}">&times;</button>
      </span>
    `;
    }).join('');
    listEl.querySelectorAll('.video-kling-element-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const chip = e.target.closest('.video-kling-element-chip');
        const index = chip ? parseInt(chip.dataset.index, 10) : -1;
        if (index >= 0) {
          this.klingElements.splice(index, 1);
          this.renderKlingElementsList();
          if (this.klingElements.every((el) => !el._fromProductSelection)) {
            const assetSelect = this.container.querySelector('#videoAssetSelect');
            if (assetSelect) assetSelect.value = '';
            this.renderAssetCard();
          }
        }
      });
    });
  }

  hideAllFeedback() {
    if (this.statusArea) this.statusArea.style.display = 'none';
    if (this.resultArea) this.resultArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'none';
  }

  showStatus(message, showSpinner = true) {
    this.hideAllFeedback();
    if (this.statusArea) this.statusArea.style.display = 'block';
    if (this.statusText) this.statusText.textContent = message;
    if (this.statusSpinner) this.statusSpinner.style.display = showSpinner ? 'block' : 'none';
  }

  showResult(url) {
    this.hideAllFeedback();
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

  showError(message) {
    this.hideAllFeedback();
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

  async startGeneration() {
    const mode = 'pro';
    if (this.sendBtn) this.sendBtn.disabled = true;
    this.showStatus('Creando tarea de generación…', true);

    const payload = { action: 'createTask', mode };
    if (this.klingElements.length > 0) {
      payload.kling_elements = this.klingElements.map((el) => {
        const o = { name: el.name };
        if (el.description) o.description = el.description;
        if (el.element_input_urls && el.element_input_urls.length) o.element_input_urls = el.element_input_urls;
        if (el.element_input_video_urls && el.element_input_video_urls.length) o.element_input_video_urls = el.element_input_video_urls;
        return o;
      });
    }

    try {
      const createRes = await fetch('/.netlify/functions/kie-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const createData = await createRes.json();

      if (!createRes.ok) {
        this.showError(createData.error || createData.failMsg || 'Error al crear la tarea');
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      const taskId = createData.taskId;
      if (!taskId) {
        this.showError('No se recibió taskId del servidor');
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      this.showStatus('Generando video (Kling 3.0). Esto puede tardar unos minutos…', true);
      await this.pollTask(taskId);
    } catch (err) {
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
    const poll = async () => {
      try {
        const res = await fetch(`/.netlify/functions/kie-video?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json();

        if (!res.ok) {
          this.stopPolling();
          this.showError(data.error || 'Error al consultar el estado');
          return;
        }

        const state = data.data?.state;
        if (state === 'success') {
          this.stopPolling();
          let resultJson = data.data?.resultJson;
          if (typeof resultJson === 'string') {
            try {
              resultJson = JSON.parse(resultJson);
            } catch (_) {}
          }
          const urls = resultJson?.resultUrls;
          const url = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
          if (url) {
            this.showResult(url);
          } else {
            this.showError('No se encontró URL del video en la respuesta');
          }
          return;
        }
        if (state === 'fail') {
          this.stopPolling();
          const msg = data.data?.failMsg || data.data?.failCode || 'La generación falló';
          this.showError(msg);
          return;
        }

        this.showStatus('Generando video (Kling 3.0). Esto puede tardar unos minutos…', true);
      } catch (err) {
        this.stopPolling();
        this.showError(err.message || 'Error al consultar el estado');
      }
    };

    await poll();
    this._pollInterval = setInterval(poll, 4000);
  }

  onLeave() {
    this.stopPolling();
  }

  destroy() {
    this.stopPolling();
  }
}

window.VideoView = VideoView;
