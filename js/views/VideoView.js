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

        <div class="video-productions-panel" id="videoProductionsPanel" aria-hidden="true" style="display: none;">
          <div class="video-productions-panel-backdrop" id="videoProductionsPanelBackdrop"></div>
          <div class="video-productions-panel-card">
            <div class="video-productions-panel-header">
              <h3 class="video-prompt-panel-title">Producciones</h3>
              <button type="button" class="video-productions-panel-close" id="videoProductionsPanelClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
            </div>
            <div class="video-productions-carousel-wrap">
              <div class="video-productions-carousel" id="videoProductionsCarousel"></div>
            </div>
            <p class="video-productions-panel-hint" id="videoProductionsPanelHint">Selecciona una o más producciones</p>
          </div>
        </div>

        <footer class="video-page-footer video-prompt-wrap" aria-label="Prompt de generación">
          <div class="video-prompt-cards-row">
            <div class="video-prompt-footer-card">
              <div class="video-prompt-footer-card-inner glass-black">
                <div class="video-prompt-left-section">
                  <div class="video-prompt-left-block">
                    <h3 class="video-prompt-panel-title">Producciones</h3>
                    <button type="button" class="video-prompt-db-select video-prompt-productions-btn" id="videoProductionsBtn" aria-label="Ver producciones">
                      <i class="fas fa-film"></i> Ver producciones
                    </button>
                  </div>
                  <div class="video-prompt-left-block">
                    <h3 class="video-prompt-panel-title">Entidades de la marca</h3>
                    <div class="video-prompt-db-toolbar">
                      <select id="videoEntityTypeSelect" class="video-prompt-db-select" aria-label="Tipo de entidad">
                        <option value="producto">Producto</option>
                        <option value="servicio">Servicio</option>
                      </select>
                      <select id="videoEntitySelect" class="video-prompt-db-select" aria-label="Entidad">
                        <option value="">Ninguno</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="video-prompt-footer-card video-prompt-footer-card-center">
              <div class="video-prompt-footer-card-inner glass-black">
                <div class="video-prompt-inner">
                  <input type="file" id="videoImageUpload" accept="image/*" multiple style="display: none;" aria-hidden="true">
                  <div class="video-kling-elements-list" id="videoKlingElementsList" aria-live="polite"></div>
                  <label for="videoPromptInput" class="video-prompt-label visually-hidden">Describe tu video</label>
                  <input
                    type="text"
                    id="videoPromptInput"
                    class="video-prompt-input"
                    placeholder="¿Qué video quieres generar? Usa @nombre para referenciar elementos."
                    autocomplete="off"
                    aria-label="Prompt para generar video"
                  />
                  <div class="video-prompt-actions">
                    <button type="button" class="video-prompt-btn video-prompt-btn-add" id="videoPromptAdd" aria-label="Subir imágenes">
                      <i class="fas fa-plus"></i>
                    </button>
                    <div class="video-prompt-duration-wrap">
                      <select id="videoDuration" class="video-prompt-aspect" aria-label="Duración del video">
                        <option value="5">5s</option>
                        <option value="10">10s</option>
                        <option value="15">15s</option>
                      </select>
                      <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                    </div>
                    <button type="button" class="video-prompt-toggle video-prompt-multi-shots" id="videoMultiShots" title="Multi shots" aria-pressed="false">
                      <i class="fas fa-film"></i><span>Multi shots</span>
                    </button>
                    <button type="button" class="video-prompt-toggle video-prompt-multi-prompt" id="videoMultiPrompt" title="Multi prompt" aria-pressed="false">
                      <i class="fas fa-align-left"></i><span>Multi prompt</span>
                    </button>
                    <button type="button" class="video-prompt-toggle video-prompt-sound active" id="videoSound" title="Sonido" aria-pressed="true">
                      <i class="fas fa-volume-up"></i><span>Sonido</span>
                    </button>
                    <div class="video-prompt-aspect-wrap">
                      <select id="videoAspectRatio" class="video-prompt-aspect" aria-label="Relación de aspecto">
                        <option value="16:9">16:9</option>
                        <option value="9:16">9:16</option>
                        <option value="1:1">1:1</option>
                      </select>
                      <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                    </div>
                    <button type="button" class="video-prompt-btn video-prompt-btn-send" id="videoPromptSend" aria-label="Generar video">
                      <i class="fas fa-paper-plane"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="video-prompt-footer-card">
              <div class="video-prompt-footer-card-inner glass-black">
                <h3 class="video-prompt-panel-title">Efectos de video</h3>
                <p class="video-prompt-panel-placeholder">Próximamente</p>
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
    const entityTypeSelect = this.container.querySelector('#videoEntityTypeSelect');
    const entitySelect = this.container.querySelector('#videoEntitySelect');
    if (entityTypeSelect) {
      entityTypeSelect.addEventListener('change', () => {
        this.renderEntityDropdown();
        this.syncProductSelectionToKling();
      });
    }
    if (entitySelect) {
      entitySelect.addEventListener('change', () => this.syncProductSelectionToKling());
    }
    const productionsBtn = this.container.querySelector('#videoProductionsBtn');
    const panelClose = this.container.querySelector('#videoProductionsPanelClose');
    const panelBackdrop = this.container.querySelector('#videoProductionsPanelBackdrop');
    if (productionsBtn) productionsBtn.addEventListener('click', () => this.openProductionsPanel());
    if (panelClose) panelClose.addEventListener('click', () => this.closeProductionsPanel());
    if (panelBackdrop) panelBackdrop.addEventListener('click', () => this.closeProductionsPanel());
    await this.loadBrandData();
    this.renderEntityDropdown();
    await this.loadVideoProductions();
    this.container.querySelectorAll('.video-prompt-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pressed = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', pressed);
        btn.classList.toggle('active', pressed);
      });
    });
  }

  openProductionsPanel() {
    const panel = this.container.querySelector('#videoProductionsPanel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
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
        let video_url = null;
        if (o.storage_path && typeof o.storage_path === 'string' && o.storage_path.trim()) {
          if (o.storage_path.startsWith('http')) video_url = o.storage_path;
          else video_url = this.getPublicUrlFromStorage('production-outputs', o.storage_path);
        }
        if (!video_url && o.metadata && typeof o.metadata === 'object') {
          video_url = o.metadata.video_url || o.metadata.url || o.metadata.file_url || null;
        }
        return { ...o, video_url };
      }).filter((o) => o.video_url);
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
      const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const videoUrl = (p.video_url || '').replace(/"/g, '&quot;');
      return `
        <div class="video-production-item" data-id="${id}" role="button" tabindex="0">
          <input type="checkbox" class="video-production-check" id="prod-${id}" ${selected ? 'checked' : ''} aria-label="Seleccionar producción">
          <div class="video-production-thumb-wrap">
            <video class="video-production-thumb" src="${videoUrl}" preload="metadata" muted playsinline></video>
          </div>
          <span class="video-production-date">${dateStr}</span>
        </div>
      `;
    }).join('');
    carousel.querySelectorAll('.video-production-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('video-production-check')) return;
        const id = el.dataset.id;
        const check = el.querySelector('.video-production-check');
        if (this.selectedProductionIds.has(id)) {
          this.selectedProductionIds.delete(id);
          if (check) check.checked = false;
        } else {
          this.selectedProductionIds.add(id);
          if (check) check.checked = true;
        }
      });
    });
    carousel.querySelectorAll('.video-production-check').forEach((check) => {
      check.addEventListener('change', (e) => {
        const item = e.target.closest('.video-production-item');
        const id = item?.dataset?.id;
        if (!id) return;
        if (e.target.checked) this.selectedProductionIds.add(id);
        else this.selectedProductionIds.delete(id);
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
    const typeSelect = this.container.querySelector('#videoEntityTypeSelect');
    const entitySelect = this.container.querySelector('#videoEntitySelect');
    if (!entitySelect || (typeSelect && typeSelect.value !== 'producto')) {
      this.klingElements = this.klingElements.filter((el) => !el._fromProductSelection);
      this.renderKlingElementsList();
      return;
    }
    const productId = entitySelect.value;
    this.klingElements = this.klingElements.filter((el) => !el._fromProductSelection);
    if (productId) {
      const product = (this.dbData.products || []).find((p) => String(p.id) === String(productId));
      if (product && Array.isArray(product.image_urls) && product.image_urls.length >= 2 && product.image_urls.length <= 4) {
        const name = this.sanitizeElementName((product.nombre_producto || 'producto').slice(0, 24));
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

  renderEntityDropdown() {
    const typeSelect = this.container.querySelector('#videoEntityTypeSelect');
    const entitySelect = this.container.querySelector('#videoEntitySelect');
    if (!typeSelect || !entitySelect) return;
    const type = typeSelect.value || 'producto';
    const items = type === 'servicio' ? (this.dbData.services || []) : (this.dbData.products || []);
    const nameKey = type === 'servicio' ? 'nombre_servicio' : 'nombre_producto';
    const currentValue = entitySelect.value;
    const options = items.map((item) => {
      const name = (item[nameKey] || (type === 'servicio' ? 'Servicio' : 'Producto')).replace(/"/g, '&quot;').slice(0, 50);
      return `<option value="${String(item.id)}">${name}</option>`;
    }).join('');
    entitySelect.innerHTML = '<option value="">Ninguno</option>' + options;
    if (currentValue) entitySelect.value = currentValue;
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
            const entitySelect = this.container.querySelector('#videoEntitySelect');
            if (entitySelect) entitySelect.value = '';
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
