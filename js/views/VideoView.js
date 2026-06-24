/**
 * VideoView - Página de generación de video con la API de KIE (modelo kling-3.0/video).
 * Flujo: crear tarea (POST kling-video-create) → polling desde cliente (GET kling-video-status?taskId=) hasta success/fail
 * → descargar video (proxy kie-video-download), subir a Supabase, mostrar URL al usuario.
 * Arquitectura asíncrona: las funciones solo crean/consultan; no esperan la generación (evita timeout 524).
 */
class VideoView extends BaseView {
  static documentTitle = 'Video';

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
    // Tokens del ultimo cine-prompt — usados al finalize del video para
    // cobrar dinamico (KIE_real + OpenAI_tokens + 5 markup). Init explicito
    // para que primer acceso no sea undefined (P3#2 audit 2026-05-25).
    this._cinePromptTokens = null;
    this._lastKieOutputId = null;
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
              <section class="video-canvas video-canva-view" id="videoCanvaView" aria-label="${window.__('Canvas — producción')}">

                <div class="video-model-picker-wrap" id="videoModelPicker" role="radiogroup" aria-label="${window.__('Elige tu modelo de video')}">
                  <div class="video-model-picker">
                    <p class="video-model-picker__eyebrow">${window.__('Paso 1 · Decisión')}</p>
                    <h3 class="video-model-picker__title">${window.__('Elige tu modelo de video')}</h3>
                    <p class="video-model-picker__hint">${window.__('Define primero qué quieres producir. Cada modelo tiene su propio set de controles.')}</p>
                    <div class="video-model-picker__grid">
                      <button type="button" class="video-model-card" data-model="kling" role="radio" aria-checked="false">
                        <div class="video-model-card__top">
                          <div class="video-model-card__logo-wrap">
                            <img class="video-model-card__logo" src="/recursos/logos/plataformas/kling.svg" alt="Kling" loading="lazy">
                          </div>
                          <span class="video-model-card__check" aria-hidden="true"><i class="fas fa-check"></i></span>
                        </div>
                        <div class="video-model-card__body">
                          <h4 class="video-model-card__title">Kling 3.0</h4>
                          <p class="video-model-card__desc">${window.__('Generar un clip de video corto')}</p>
                        </div>
                        <div class="video-model-card__footer">
                          <span class="video-model-card__cost"><strong>25</strong> <span>${window.__('créditos')}</span></span>
                          <span class="video-model-card__badge is-active">${window.__('Activo')}</span>
                        </div>
                      </button>
                      <button type="button" class="video-model-card" data-model="seedance" role="radio" aria-checked="false">
                        <div class="video-model-card__top">
                          <div class="video-model-card__logo-wrap">
                            <img class="video-model-card__logo" src="/recursos/logos/plataformas/seedance-bytedance.svg" alt="Seedance" loading="lazy">
                          </div>
                          <span class="video-model-card__check" aria-hidden="true"><i class="fas fa-check"></i></span>
                        </div>
                        <div class="video-model-card__body">
                          <h4 class="video-model-card__title">Seedance 2.0</h4>
                          <p class="video-model-card__desc">${window.__('Crear secuencias de video')}</p>
                        </div>
                        <div class="video-model-card__footer">
                          <span class="video-model-card__cost"><strong>60</strong> <span>${window.__('créditos')}</span></span>
                          <span class="video-model-card__badge is-beta">Beta</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="video-canvas-idle" id="videoCanvasIdle">
                  <div class="video-canvas-idle-content">
                    <p class="video-canvas-idle__eyebrow">Stand by</p>
                    <h3 class="video-canvas-idle__title">${window.__('Listo para producir')}</h3>
                    <p class="video-canvas-idle__hint">${window.__('Describe tu visión en el Director Console. La IA traducirá tu brief a un prompt con la voz de la marca.')}</p>
                  </div>
                </div>

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
                      <h2 class="video-result-title">${window.__('Video generado')}</h2>
                    </div>
                    <div class="video-result-player-wrap">
                      <video id="videoResultPlayer" class="video-result-player" controls playsinline></video>
                    </div>
                    <div class="video-result-actions">
                      <a id="videoResultDownload" class="btn btn-secondary video-download-btn" href="#" download target="_blank" rel="noopener">
                        <i class="fas fa-download"></i> ${window.__('Descargar')}
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
                      <h3 class="video-prompt-panel-title">${window.__('Producciones')}</h3>
                      <button type="button" class="video-productions-panel-close" id="videoProductionsPanelClose" aria-label="${window.__('Cerrar')}"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="video-productions-gallery" id="videoProductionsGallery"></div>
                  </div>
                </div>

              </section>

              <section class="video-director-console-zone video-prompt-wrap video-main-director" id="videoFooterControl" data-for-model="kling" aria-label="${window.__('Director Console Kling — adjuntos y prompt')}">
                <div class="video-prompt-footer-card video-prompt-footer-card-center">
                  <div class="video-prompt-footer-card-inner video-director-console">

                    <input type="file" id="videoImageUpload" accept="image/jpeg,image/png,image/jpg,video/mp4,video/quicktime,video/x-msvideo" multiple style="display: none;" aria-hidden="true">

                    <div class="video-director-console-content">
                      <textarea
                        id="videoPromptInput"
                        class="video-director-brief-input"
                        placeholder="${window.__('Tu idea en texto — no es el prompt final. La IA generará el prompt con la voz de la marca.')}"
                        rows="1"
                        autocomplete="off"
                        aria-label="${window.__('Tu idea (la IA genera el prompt final)')}"
                      ></textarea>
                      <p class="video-field-help video-prompt-timeout-hint" id="videoPromptTimeoutHint" style="display: none;" role="status">${window.__('Prompt largo: para evitar timeout (524), usa modo Estándar, duración 5s, una imagen de referencia, o acorta el texto.')}</p>
                    </div>
                    <div class="video-director-attachments-row">
                      <div class="video-kling-elements-list" id="videoKlingElementsList" aria-live="polite"></div>
                      <div class="video-director-variables-row" id="videoDirectorVariables" aria-label="${window.__('Variables de cinematografía')}"></div>
                    </div>
                    <div class="video-director-controls">
                      <button type="button" class="video-director-btn-add" id="videoPromptAdd" aria-label="${window.__('Añadir imagen o video')}"><i class="fas fa-plus"></i></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle video-prompt-sound active" id="videoSound" title="${window.__('Sonido')}" aria-pressed="true"><i class="fas fa-volume-up"></i><span>${window.__('Sonido')}</span></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle video-prompt-multi-shot" id="videoMultiShot" title="Multi Shot" aria-pressed="false"><i class="fas fa-film"></i><span>Multi Shot</span></button>
                      <div class="video-prompt-mode-wrap">
                        <select id="videoMode" class="video-director-select" aria-label="${window.__('Modo (Estándar reduce riesgo de timeout)')}">
                          <option value="std" selected>${window.__('Estándar')}</option>
                          <option value="pro">Pro</option>
                        </select>
                        <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-aspect-wrap">
                        <select id="videoAspectRatio" class="video-director-select" aria-label="${window.__('Formato')}"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select>
                        <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-duration-wrap">
                        <select id="videoDuration" class="video-director-select" aria-label="${window.__('Duración')}"><option value="5">5s</option><option value="10">10s</option><option value="15">15s</option></select>
                        <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                      </div>
                      <button type="button" class="video-director-btn-generate" id="videoPromptSend" aria-label="${window.__('Generar prompt')}" data-state="prompt"><i class="fas fa-wand-magic-sparkles"></i><span id="videoPromptSendLabel">PROMPT</span></button>
                      <button type="button" class="video-director-btn-regenerate" id="videoRegeneratePromptBtn" aria-label="${window.__('Volver a producir prompt')}" style="display: none;"><i class="fas fa-rotate-right"></i><span>Re-prompt</span></button>
                    </div>
                    <div class="video-storyboard-wrap" id="videoStoryboardWrap" style="display: none;">
                      <h4 class="video-storyboard-title">Storyboard</h4>
                      <div class="video-storyboard-scenes" id="videoStoryboardScenes"></div>
                    </div>

                  </div>
                </div>
              </section>

              <section class="video-director-console-zone video-prompt-wrap video-main-director" id="seedanceFooterControl" data-for-model="seedance" aria-label="${window.__('Director Console Seedance — secuencia narrativa')}" hidden>
                <div class="video-prompt-footer-card video-prompt-footer-card-center">
                  <div class="video-prompt-footer-card-inner video-director-console">

                    <input type="file" id="seedanceImageUpload" accept="image/jpeg,image/png,image/jpg,video/mp4,video/quicktime,video/x-msvideo" multiple style="display: none;" aria-hidden="true">

                    <div class="video-director-console-content">
                      <textarea
                        id="seedancePromptInput"
                        class="video-director-brief-input video-director-brief-input-large"
                        placeholder="${window.__('Storyboard: describe la secuencia completa — apertura, desarrollo y cierre. Seedance produce el arco entero en una sola pasada.')}"
                        rows="3"
                        autocomplete="off"
                        aria-label="${window.__('Storyboard narrativo (Seedance lo cocina con OpenAI)')}"
                      ></textarea>
                    </div>
                    <div class="video-director-attachments-row">
                      <div class="video-kling-elements-list" id="seedanceElementsList" aria-live="polite"></div>
                    </div>

                    <div class="video-director-controls">
                      <button type="button" class="video-director-btn-add" id="seedancePromptAdd" aria-label="${window.__('Añadir referencia visual')}"><i class="fas fa-plus"></i></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle" id="seedanceGenAudioToggle" title="${window.__('Generar audio')}" aria-pressed="true"><i class="fas fa-volume-up"></i><span>Audio</span></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle" id="seedanceWebSearchToggle" title="${window.__('Búsqueda online')}" aria-pressed="false"><i class="fas fa-globe"></i><span>Web</span></button>
                      <div class="video-prompt-aspect-wrap">
                        <select id="seedanceResolution" class="video-director-select" aria-label="${window.__('Resolución')}">
                          <option value="480p">480p</option>
                          <option value="720p" selected>720p</option>
                          <option value="1080p">1080p</option>
                        </select>
                        <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-aspect-wrap">
                        <select id="seedanceAspectRatio" class="video-director-select" aria-label="${window.__('Relación de aspecto')}">
                          <option value="16:9" selected>16:9</option>
                          <option value="9:16">9:16</option>
                          <option value="1:1">1:1</option>
                          <option value="4:3">4:3</option>
                          <option value="3:4">3:4</option>
                          <option value="21:9">21:9 cinemascope</option>
                          <option value="adaptive">${window.__('Adaptable')}</option>
                        </select>
                        <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-duration-wrap seedance-duration-wrap">
                        <input type="number" id="seedanceDuration" class="video-director-select seedance-duration-input" min="4" max="15" step="1" value="5" aria-label="${window.__('Duración en segundos')}">
                        <span class="seedance-duration-unit">s</span>
                      </div>
                      <button type="button" class="video-director-btn-generate" id="seedancePromptSend" aria-label="${window.__('Generar prompt')}" data-state="prompt"><i class="fas fa-wand-magic-sparkles"></i><span>PROMPT</span></button>
                    </div>

                  </div>
                </div>
              </section>
            </main>

            <aside class="video-sidebar-console" data-for-model="kling" aria-label="${window.__('Sidebar Kling — configuraciones predefinidas')}">
              <div class="video-prompt-footer-card video-sidebar-card">
                <div class="video-prompt-footer-card-inner video-sidebar-inner">

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <span class="video-sidebar-section-num">01</span>
                      <h3 class="video-section-label">${window.__('Contexto de producción')}</h3>
                      <div class="video-sidebar-section-actions">
                        <button type="button" class="video-sidebar-section-icon-btn" id="videoCtxAiBtn" aria-label="${window.__('Auto-detectar contexto')}" title="${window.__('Auto-detectar contexto desde campaña activa')}"><i class="fas fa-wand-magic-sparkles"></i></button>
                      </div>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('A qué campaña pertenece este video, a quién le habla, y qué productos o piezas debe respetar la IA al producirlo.')}</p>
                    <div class="video-escenas-block">
                      <div class="video-escenas-header">
                        <h4 class="video-prompt-panel-title">${window.__('Escenas')}</h4>
                        <button type="button" class="video-escenas-all-btn" id="videoProductionsBtn" aria-label="${window.__('Todas las producciones')}">${window.__('Todas')}</button>
                      </div>
                      <div class="video-escenas-carousel-wrap">
                        <div class="video-escenas-carousel" id="videoEscenasCarousel"></div>
                      </div>
                    </div>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿De qué trata?')}</h4>
                      <select id="videoCampaignSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Concepto de campaña')}" data-conceptual="1">
                        <option value="">${window.__('— Sin definir')}</option>
                        <option value="Brand awareness">${window.__('Brand awareness · presentar la marca')}</option>
                        <option value="Product launch">${window.__('Lanzamiento de producto')}</option>
                        <option value="Lifestyle storytelling">${window.__('Lifestyle · contar una historia')}</option>
                        <option value="Educational">${window.__('Educativo · enseñar o explicar')}</option>
                        <option value="Sale / promo">${window.__('Promoción · oferta o descuento')}</option>
                        <option value="Testimonial">${window.__('Testimonial · clientes reales')}</option>
                        <option value="Reactivation">${window.__('Reactivación · clientes dormidos')}</option>
                        <option value="Seasonal moment">${window.__('Momento estacional · fecha clave')}</option>
                        <option value="Behind the scenes">${window.__('Behind the scenes · cercanía marca')}</option>
                      </select>
                    </div>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿A quién le habla?')}</h4>
                      <select id="videoAudienceSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Audiencia conceptual')}" data-conceptual="1">
                        <option value="">${window.__('— Sin definir')}</option>
                        <option value="Young professionals 25-35">${window.__('Profesionales jóvenes (25–35)')}</option>
                        <option value="Established professionals 35-50">${window.__('Profesionales establecidos (35–50)')}</option>
                        <option value="Aspirational youth 18-28">${window.__('Aspiracionales jóvenes (18–28)')}</option>
                        <option value="Mass market">${window.__('Mercado masivo')}</option>
                        <option value="Premium / luxury audience">${window.__('Premium · audiencia de lujo')}</option>
                        <option value="Niche enthusiasts">${window.__('Nicho · entusiastas de la categoría')}</option>
                        <option value="Decision makers B2B">${window.__('Decision makers · B2B')}</option>
                        <option value="Existing customers">${window.__('Clientes existentes')}</option>
                        <option value="Parents / families">${window.__('Padres y familias')}</option>
                      </select>
                    </div>
                    <div class="video-left-block video-asset-stack-block" id="videoAssetStackBlock">
                      <h4 class="video-prompt-panel-title">${window.__('Stack de activos')}</h4>
                      <p class="video-field-help video-asset-stack-help" id="videoAssetStackHelp">${window.__('Producto = bloqueo de referencia (el video no debe cambiar el producto)')}</p>
                      <div class="video-asset-scope-wrap">
                        <select id="videoAssetScope" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Alcance')}">
                          <option value="product">${window.__('Producto')}</option>
                          <option value="service">${window.__('Servicio')}</option>
                          <option value="brand_world">${window.__('Mundo de marca')}</option>
                          <option value="collection">${window.__('Colección')}</option>
                        </select>
                      </div>
                      <div class="video-asset-products-carousel-wrap" id="videoAssetProductsCarouselWrap">
                        <div class="video-asset-products-carousel" id="videoAssetProductsCarousel"></div>
                      </div>
                      <select id="videoAssetSelect" class="video-prompt-db-select video-asset-select video-asset-select-other" aria-label="${window.__('Activo')}" style="display: none;">
                        <option value="">${window.__('— Ninguno')}</option>
                      </select>
                    </div>
                  </div>

                  <div class="video-sidebar-section video-sidebar-cine video-cinematography-panel">
                    <div class="video-sidebar-section-header">
                      <span class="video-sidebar-section-num">02</span>
                      <h3 class="video-section-label">${window.__('Cinematografía')}</h3>
                      <div class="video-sidebar-section-actions">
                        <button type="button" class="video-sidebar-section-icon-btn" id="videoCineResetBtn" aria-label="${window.__('Restablecer cinematografía')}" title="${window.__('Restablecer todos los valores')}"><i class="fas fa-rotate-left"></i></button>
                      </div>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Define el lenguaje visual: cámara, movimiento, luz y mood. Si no sabes por dónde empezar, elige un Production Preset.')}</p>
                    <div class="video-cine-preset-wrap">
                      <label class="video-cine-label">${window.__('Production Preset')}</label>
                      <select id="videoCinePreset" class="video-cine-select" aria-label="${window.__('Production Preset')}">
                        <option value="">${window.__('Ninguno')}</option>
                        <option value="product-launch">Product Launch</option>
                        <option value="luxury-hero">Luxury Hero</option>
                        <option value="social-performance">Social Performance</option>
                        <option value="cinematic-teaser">Cinematic Teaser</option>
                        <option value="ecommerce-clean">Ecommerce Clean</option>
                        <option value="tech-explainer">Tech Explainer</option>
                      </select>
                    </div>
                    <div class="video-cine-selected-tags" id="videoCineSelectedTags" aria-live="polite"></div>
                    <div class="video-cine-tabs" role="tablist" aria-label="${window.__('Categoría de dirección')}">
                      <button type="button" class="video-cine-tab is-active" role="tab" aria-selected="true" data-tab="movement"><i class="fas fa-arrows-up-down-left-right" aria-hidden="true"></i><span>${window.__('Movimiento')}</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="lighting"><i class="fas fa-lightbulb" aria-hidden="true"></i><span>${window.__('Luz')}</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="mood"><i class="fas fa-palette" aria-hidden="true"></i><span>Mood</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="camera"><i class="fas fa-sliders" aria-hidden="true"></i><span>${window.__('Avanzado')}</span></button>
                    </div>
                    <div class="video-cine-panels">
                      <div class="video-cine-panel is-active" data-panel="movement" role="tabpanel">
                        <p class="video-cine-block-hint">${window.__('Cómo se mueve la cámara. Determina el ritmo y la sensación.')}</p>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Tipo de movimiento')}</label><select id="videoCineMovement" class="video-cine-select"></select></div>
                        <div class="video-cine-row-pair">
                          <div class="video-cine-row"><label class="video-cine-label">${window.__('Velocidad')}</label><select id="videoCineMotionSpeed" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">${window.__('Intensidad')}</label><select id="videoCineMotionIntensity" class="video-cine-select"></select></div>
                        </div>
                      </div>
                      <div class="video-cine-panel" data-panel="lighting" role="tabpanel" hidden>
                        <p class="video-cine-block-hint">${window.__('La iluminación dicta la emoción: suave para algo cálido, contrastada para drama.')}</p>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Tipo de luz')}</label><select id="videoCineLightType" class="video-cine-select"></select></div>
                        <div class="video-cine-row-pair">
                          <div class="video-cine-row"><label class="video-cine-label">${window.__('Contraste')}</label><select id="videoCineContrast" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">${window.__('Temperatura')}</label><select id="videoCineTemperature" class="video-cine-select"></select></div>
                        </div>
                      </div>
                      <div class="video-cine-panel" data-panel="mood" role="tabpanel" hidden>
                        <p class="video-cine-block-hint">${window.__('La paleta y la energía emocional. Define si se siente premium, vibrante o dramático.')}</p>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Tono')}</label><select id="videoCineTone" class="video-cine-select"></select></div>
                        <div class="video-cine-row-pair">
                          <div class="video-cine-row"><label class="video-cine-label">Color Grade</label><select id="videoCineColorGrade" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">${window.__('Energía')}</label><select id="videoCineEnergyLevel" class="video-cine-select"></select></div>
                        </div>
                      </div>
                      <div class="video-cine-panel" data-panel="camera" role="tabpanel" hidden>
                        <p class="video-cine-block-hint">${window.__('Controles granulares para usuarios con experiencia. Si lo dejas vacío, la IA elige por ti.')}</p>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Tipo de toma')}</label><select id="videoCineShotType" class="video-cine-select"></select></div>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Lente')}</label><select id="videoCineLens" class="video-cine-select"></select></div>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Encuadre')}</label><select id="videoCineFraming" class="video-cine-select"></select></div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
              <button type="button" class="video-sidebar-help" id="videoSidebarHelpBtn" aria-label="${window.__('Ayuda creativa')}" title="${window.__('Ayuda creativa')}">?</button>
              <div class="video-sidebar-help-popover" id="videoSidebarHelpPopover" role="dialog" aria-label="${window.__('Ayuda creativa')}">
                <h4>${window.__('¿Cómo usar este panel?')}</h4>
                <p><strong>${window.__('Contexto de producción')}</strong> ${window.__('conecta el video a la campaña, audiencia y productos que la IA debe respetar al producirlo.')}</p>
                <p><strong>${window.__('Cinematografía')}</strong> ${window.__('define el lenguaje visual. Si no sabes por dónde empezar, elige un')} <em>Production Preset</em> ${window.__('y la IA llenará el resto.')}</p>
                <p>${window.__('Cada control alimenta el prompt final. No tienes que llenarlos todos — entre más completes, más fiel será el resultado a tu intención.')}</p>
              </div>
            </aside>

            <aside class="video-sidebar-console" data-for-model="seedance" aria-label="${window.__('Sidebar Seedance — secuencias narrativas')}" hidden>
              <div class="video-prompt-footer-card video-sidebar-card">
                <div class="video-prompt-footer-card-inner video-sidebar-inner">

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Contexto de producción')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Tipo de campaña conceptual, audiencia y productos que la secuencia debe respetar.')}</p>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿De qué trata?')}</h4>
                      <select id="seedanceCampaignSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Concepto de campaña')}" data-conceptual="1">
                        <option value="">${window.__('— Sin definir')}</option>
                        <option value="Brand awareness">${window.__('Brand awareness · presentar la marca')}</option>
                        <option value="Product launch">${window.__('Lanzamiento de producto')}</option>
                        <option value="Lifestyle storytelling">${window.__('Lifestyle · contar una historia')}</option>
                        <option value="Educational">${window.__('Educativo · enseñar o explicar')}</option>
                        <option value="Sale / promo">${window.__('Promoción · oferta o descuento')}</option>
                        <option value="Testimonial">${window.__('Testimonial · clientes reales')}</option>
                        <option value="Reactivation">${window.__('Reactivación · clientes dormidos')}</option>
                        <option value="Seasonal moment">${window.__('Momento estacional · fecha clave')}</option>
                        <option value="Behind the scenes">${window.__('Behind the scenes · cercanía marca')}</option>
                      </select>
                    </div>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿A quién le habla?')}</h4>
                      <select id="seedanceAudienceSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Audiencia conceptual')}" data-conceptual="1">
                        <option value="">${window.__('— Sin definir')}</option>
                        <option value="Young professionals 25-35">${window.__('Profesionales jóvenes (25–35)')}</option>
                        <option value="Established professionals 35-50">${window.__('Profesionales establecidos (35–50)')}</option>
                        <option value="Aspirational youth 18-28">${window.__('Aspiracionales jóvenes (18–28)')}</option>
                        <option value="Mass market">${window.__('Mercado masivo')}</option>
                        <option value="Premium / luxury audience">${window.__('Premium · audiencia de lujo')}</option>
                        <option value="Niche enthusiasts">${window.__('Nicho · entusiastas de la categoría')}</option>
                        <option value="Decision makers B2B">${window.__('Decision makers · B2B')}</option>
                        <option value="Existing customers">${window.__('Clientes existentes')}</option>
                        <option value="Parents / families">${window.__('Padres y familias')}</option>
                      </select>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Frames Clave')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Ancla el inicio y/o final de la secuencia con una imagen. La IA construirá el arco narrativo entre ambas.')}</p>
                    <div class="seedance-frames-grid">
                      <button type="button" class="seedance-frame-slot" data-frame="first" id="seedanceFirstFrameSlot">
                        <i class="fas fa-image" aria-hidden="true"></i>
                        <span class="seedance-frame-slot-label">First Frame</span>
                        <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
                      </button>
                      <button type="button" class="seedance-frame-slot" data-frame="last" id="seedanceLastFrameSlot">
                        <i class="fas fa-image" aria-hidden="true"></i>
                        <span class="seedance-frame-slot-label">Last Frame</span>
                        <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
                      </button>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Referencias Multimodales')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Imágenes, videos y audios que la IA usa como inspiración. Mutuamente excluyentes con Frames Clave.')}</p>

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Imágenes')} <span class="seedance-ref-limit" id="seedanceRefImgCount">0 / 9</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefImg"><i class="fas fa-plus" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="seedanceRefImgList" aria-live="polite"></div>
                    </div>

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Videos')} <span class="seedance-ref-limit" id="seedanceRefVidCount">0 / 3 · ≤15s</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefVid"><i class="fas fa-plus" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="seedanceRefVidList" aria-live="polite"></div>
                    </div>

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Audios')} <span class="seedance-ref-limit" id="seedanceRefAudCount">0 / 3 · ≤15s</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefAud"><i class="fas fa-plus" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="seedanceRefAudList" aria-live="polite"></div>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Audio & Atmósfera')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Seedance puede generar el audio de la secuencia. Activar aumenta el costo de créditos.')}</p>
                    <label class="seedance-toggle-row">
                      <input type="checkbox" id="seedanceGenerateAudio">
                      <span class="seedance-toggle-track" aria-hidden="true"><span class="seedance-toggle-thumb"></span></span>
                      <span class="seedance-toggle-label">${window.__('Generar audio')}</span>
                    </label>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('Tipo de sonido')}</h4>
                      <div class="seedance-audio-tiles">
                        <button type="button" class="seedance-audio-tile" data-audio-type="ambient"><i class="fas fa-wind" aria-hidden="true"></i><span>${window.__('Diegético')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="music"><i class="fas fa-music" aria-hidden="true"></i><span>${window.__('Música')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="voice"><i class="fas fa-microphone" aria-hidden="true"></i><span>${window.__('Voz')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="silence"><i class="fas fa-volume-xmark" aria-hidden="true"></i><span>${window.__('Silencio')}</span></button>
                      </div>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Pacing & Narrativa')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Cómo fluye la historia: ritmo, evolución emocional y estilo de transición entre tomas.')}</p>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Ritmo global')}</label>
                      <select id="seedancePacing" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Slow contemplative">${window.__('Lento contemplativo')}</option>
                        <option value="Balanced">${window.__('Equilibrado')}</option>
                        <option value="Fast dynamic">${window.__('Rápido dinámico')}</option>
                      </select>
                    </div>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Arco emocional')}</label>
                      <select id="seedanceArc" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Continuous">${window.__('Continuo')}</option>
                        <option value="Crescendo">Crescendo</option>
                        <option value="Decrescendo">Decrescendo</option>
                        <option value="Climax at end">${window.__('Climax al final')}</option>
                      </select>
                    </div>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Transiciones')}</label>
                      <select id="seedanceTransitions" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Hard cuts">${window.__('Cortes secos')}</option>
                        <option value="Soft fades">${window.__('Fundidos suaves')}</option>
                        <option value="Match cuts">Match cuts</option>
                        <option value="Whip pans">Whip pans</option>
                        <option value="Morph">Morph / dissolve</option>
                      </select>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Estilo Visual')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Mood narrativo y nivel de realismo de la secuencia completa.')}</p>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Mood narrativo')}</label>
                      <select id="seedanceMood" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Cinematic">${window.__('Cinematográfico')}</option>
                        <option value="Documentary">${window.__('Documental')}</option>
                        <option value="Editorial">Editorial</option>
                        <option value="Music video">Music video</option>
                        <option value="Dreamlike">${window.__('Sueño / Onírico')}</option>
                        <option value="Commercial bright">${window.__('Comercial luminoso')}</option>
                      </select>
                    </div>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Realismo')}</label>
                      <select id="seedanceRealism" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Realistic">${window.__('Realista')}</option>
                        <option value="Stylized">${window.__('Estilizado')}</option>
                        <option value="Hyperreal">${window.__('Hiperreal')}</option>
                        <option value="Surreal">Surreal</option>
                        <option value="3D animated">${window.__('3D animado')}</option>
                      </select>
                    </div>
                  </div>

                </div>
              </div>
              <button type="button" class="video-sidebar-help" id="seedanceSidebarHelpBtn" aria-label="${window.__('Ayuda Seedance')}" title="${window.__('Ayuda Seedance')}">?</button>
              <div class="video-sidebar-help-popover" id="seedanceSidebarHelpPopover" role="dialog" aria-label="${window.__('Ayuda Seedance')}">
                <h4>${window.__('Seedance 2.0 — secuencias narrativas')}</h4>
                <p><strong>${window.__('Frames Clave')}</strong>${window.__(': una imagen de inicio + una de cierre. La IA construye el arco entre ambas.')}</p>
                <p><strong>${window.__('Referencias Multimodales')}</strong>${window.__(': imágenes para estilo, videos para movimiento, audios para vibe. Hasta 9/3/3 respectivamente.')}</p>
                <p><strong>Audio</strong>${window.__(': a diferencia de Kling, Seedance genera el audio. Activarlo cuesta créditos extra pero da un video listo para publicar.')}</p>
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
      this.sendBtn.setAttribute('aria-label', window.__('Generar prompt'));
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
    this.modelPickerEl = this.container.querySelector('#videoModelPicker');
    this.modelLabelEl = this.container.querySelector('#videoConsoleModelText');
    this.modelChangeBtn = this.container.querySelector('#videoModelChangeBtn');
    this.modelChangeBtnSeedance = this.container.querySelector('#seedanceModelChangeBtn');

    this.selectedModel = this.selectedModel || null;
    const applyModelPickerState = () => {
      const picked = !!this.selectedModel;
      if (this.modelPickerEl) this.modelPickerEl.style.display = picked ? 'none' : 'flex';
      if (this.idleArea) this.idleArea.style.display = picked ? 'flex' : 'none';
      // Toggle sidebars y director consoles según modelo.
      // Usamos style.display además de el.hidden porque las reglas CSS
      // de .video-sidebar-console / .video-director-console-zone usan
      // display:flex que sobreescribe el atributo hidden HTML.
      this.container.querySelectorAll('[data-for-model]').forEach((el) => {
        const target = el.getAttribute('data-for-model');
        const visible = picked && target === this.selectedModel;
        el.hidden = !visible;
        el.style.display = visible ? '' : 'none';
      });
    };
    this._applyModelPickerState = applyModelPickerState;
    applyModelPickerState();

    this.container.querySelectorAll('.video-model-card[data-model]').forEach((card) => {
      if (card.dataset.boundModelPick === '1') return;
      card.dataset.boundModelPick = '1';
      card.addEventListener('click', (e) => {
        e.preventDefault();
        if (card.disabled || card.classList.contains('is-locked')) return;
        const model = card.getAttribute('data-model');
        if (!model) return;
        this.selectedModel = model;
        this.container.querySelectorAll('.video-model-card[data-model]').forEach((c) => {
          const isSel = c.getAttribute('data-model') === model;
          c.classList.toggle('is-selected', isSel);
          c.setAttribute('aria-checked', isSel ? 'true' : 'false');
        });
        applyModelPickerState();
      });
    });

    if (this.modelChangeBtn && this.modelChangeBtn.dataset.boundModelChange !== '1') {
      this.modelChangeBtn.dataset.boundModelChange = '1';
      this.modelChangeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedModel = null;
        applyModelPickerState();
      });
    }
    if (this.modelChangeBtnSeedance && this.modelChangeBtnSeedance.dataset.boundModelChange !== '1') {
      this.modelChangeBtnSeedance.dataset.boundModelChange = '1';
      this.modelChangeBtnSeedance.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedModel = null;
        applyModelPickerState();
      });
    }

    // Seedance: por ahora backend no existe — el botón PROMPT/Generate avisa.
    const seedanceSend = this.container.querySelector('#seedancePromptSend');
    if (seedanceSend && seedanceSend.dataset.boundSeedancePlaceholder !== '1') {
      seedanceSend.dataset.boundSeedancePlaceholder = '1';
      seedanceSend.addEventListener('click', (e) => {
        e.preventDefault();
        alert(window.__('Backend de Seedance 2.0 en construcción. La UI está lista; cuando conectemos el backend este botón cocinará el storyboard con OpenAI y generará la secuencia.'));
      });
    }
    // Seedance: toggle Audio + Web search (solo UI state, sin wiring backend aún)
    ['seedanceGenAudioToggle', 'seedanceWebSearchToggle'].forEach((id) => {
      const btn = this.container.querySelector('#' + id);
      if (!btn || btn.dataset.boundToggle === '1') return;
      btn.dataset.boundToggle = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', !pressed);
        btn.classList.toggle('active', !pressed);
      });
    });
    // Seedance: help button (mismo patrón que Kling)
    const seedanceHelpBtn = this.container.querySelector('#seedanceSidebarHelpBtn');
    const seedanceHelpPopover = this.container.querySelector('#seedanceSidebarHelpPopover');
    if (seedanceHelpBtn && seedanceHelpPopover && seedanceHelpBtn.dataset.boundHelp !== '1') {
      seedanceHelpBtn.dataset.boundHelp = '1';
      seedanceHelpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        seedanceHelpPopover.classList.toggle('is-open');
      });
      document.addEventListener('click', (e) => {
        if (!seedanceHelpPopover.classList.contains('is-open')) return;
        if (seedanceHelpPopover.contains(e.target) || seedanceHelpBtn.contains(e.target)) return;
        seedanceHelpPopover.classList.remove('is-open');
      });
    }
    // Seedance: audio type tiles (toggle exclusive)
    this.container.querySelectorAll('.seedance-audio-tile[data-audio-type]').forEach((tile) => {
      if (tile.dataset.boundAudio === '1') return;
      tile.dataset.boundAudio = '1';
      tile.addEventListener('click', (e) => {
        e.preventDefault();
        const wasActive = tile.classList.contains('is-active');
        this.container.querySelectorAll('.seedance-audio-tile[data-audio-type]').forEach((t) => t.classList.remove('is-active'));
        if (!wasActive) tile.classList.add('is-active');
      });
    });

    const helpBtn = this.container.querySelector('#videoSidebarHelpBtn');
    const helpPopover = this.container.querySelector('#videoSidebarHelpPopover');
    if (helpBtn && helpPopover && helpBtn.dataset.boundHelp !== '1') {
      helpBtn.dataset.boundHelp = '1';
      helpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        helpPopover.classList.toggle('is-open');
      });
      document.addEventListener('click', (e) => {
        if (!helpPopover.classList.contains('is-open')) return;
        if (helpPopover.contains(e.target) || helpBtn.contains(e.target)) return;
        helpPopover.classList.remove('is-open');
      });
    }

    const resetCineBtn = this.container.querySelector('#videoCineResetBtn');
    if (resetCineBtn && resetCineBtn.dataset.boundReset !== '1') {
      resetCineBtn.dataset.boundReset = '1';
      resetCineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!confirm(window.__('¿Restablecer todos los valores de Cinematografía?'))) return;
        const keys = ['shotType','lens','framing','cameraMovement','motionSpeed','motionIntensity','lightType','contrastLevel','temperature','tone','colorGrade','colorTemp','energyLevel'];
        keys.forEach((k) => { if (this.cinematography) this.cinematography[k] = ''; });
        if (this.cinematography) this.cinematography.preset = '';
        if (typeof this.syncCinematographyToSelects === 'function') this.syncCinematographyToSelects();
        if (typeof this.renderCinematographySelectedTags === 'function') this.renderCinematographySelectedTags();
        if (typeof this.renderDirectorVariables === 'function') this.renderDirectorVariables();
        const presetEl = this.container.querySelector('#videoCinePreset');
        if (presetEl) presetEl.value = '';
        this.container.querySelectorAll('.video-cinematography-panel .video-cine-select').forEach((sel) => {
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }

    const ctxAiBtn = this.container.querySelector('#videoCtxAiBtn');
    if (ctxAiBtn && ctxAiBtn.dataset.boundCtxAi !== '1') {
      ctxAiBtn.dataset.boundCtxAi = '1';
      ctxAiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        alert(window.__('Auto-detección de contexto: próximamente. Por ahora completa Campaign / Audience / Asset Stack manualmente.'));
      });
    }

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
    if (scope === 'product') return (this.dbData.products || []).map((p) => ({ id: p.id, name: p.nombre_producto || window.__('Producto'), type: 'product' }));
    if (scope === 'service') return (this.dbData.services || []).map((s) => ({ id: s.id, name: s.nombre_servicio || window.__('Servicio'), type: 'service' }));
    if (scope === 'brand_world') return (this.dbData.entities || []).map((e) => ({ id: e.id, name: e.name || window.__('Entidad'), type: 'entity' }));
    return [];
  }

  renderAssetDropdown() {
    const select = this.container.querySelector('#videoAssetSelect');
    if (!select) return;
    const items = this.getAssetListByScope();
    const current = select.value || this.selectedAssetId;
    const options = items.map((item) => `<option value="${String(item.id)}">${(item.name || '').slice(0, 50)}</option>`).join('');
    select.innerHTML = `<option value="">${window.__('— Ninguno')}</option>` + options;
    if (current && items.some((i) => String(i.id) === current)) select.value = current;
    else this.selectedAssetId = '';
  }

  /** Carrusel de productos en Asset Stack (solo cuando scope es Product). Imagen seleccionable. */
  renderAssetProductsCarousel() {
    const carousel = this.container.querySelector('#videoAssetProductsCarousel');
    if (!carousel) return;
    const products = (this.dbData.products || []).filter((p) => Array.isArray(p.image_urls) && p.image_urls.length > 0);
    if (products.length === 0) {
      carousel.innerHTML = `<p class="video-asset-products-empty">${window.__('No hay productos con imágenes.')}</p>`;
      return;
    }
    carousel.innerHTML = products.map((p) => {
      const id = p.id;
      const selected = String(this.selectedAssetId) === String(id);
      const imgUrl = (p.image_urls[0] || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      return `
        <div class="video-asset-product-item ${selected ? 'is-selected' : ''}" data-id="${id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${window.__('Seleccionar producto')}">
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
        <span class="video-storyboard-scene-label">${window.__('ESCENA')} ${String(i + 1).padStart(2, '0')}</span>
        <input type="text" class="video-storyboard-scene-brief" placeholder="${window.__('Mini brief')}" value="${(s.brief || '').replace(/"/g, '&quot;')}" data-index="${i}">
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

      const resolveMedia = (o) => {
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
      };

      // Origen 1: runs_outputs (linkeados a flow_runs de la org activa).
      // Sin el filtro de organization_id, un usuario multi-org veria los videos
      // de todas sus orgs mezclados en cualquier workspace.
      let runsQ = this.supabase.from('flow_runs').select('id').eq('user_id', user.id);
      if (this.organizationId) runsQ = runsQ.eq('organization_id', this.organizationId);
      const { data: runs } = await runsQ;
      const runIds = (runs || []).map((r) => r.id).filter(Boolean);
      let fromRuns = [];
      if (runIds.length > 0) {
        const { data: roData } = await this.supabase
          .from('runs_outputs')
          .select('id, run_id, output_type, storage_path, metadata, created_at')
          .in('run_id', runIds)
          .order('created_at', { ascending: false })
          .limit(100);
        fromRuns = roData || [];
      }

      // Origen 2: system_ai_outputs (videos generados desde VideoView mismo
      // o cualquier herramienta standalone). Filtrar por organization_id
      // para que el contexto sea consistente con loadFlowOutputs en
      // LivingManager.
      let fromSystem = [];
      if (this.organizationId) {
        const { data: saoData } = await this.supabase
          .from('system_ai_outputs')
          .select('id, output_type, storage_path, metadata, created_at')
          .eq('organization_id', this.organizationId)
          .neq('provider', 'openai')
          .order('created_at', { ascending: false })
          .limit(100);
        fromSystem = saoData || [];
      }

      const merged = [...fromRuns, ...fromSystem]
        .map(resolveMedia)
        .filter((o) => o.media_url)
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      // Dedupe por id (defensive — runs_outputs y system_ai_outputs tienen
      // namespace de id distinto pero por si acaso).
      const seen = new Set();
      this.videoProductions = merged.filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });
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
      carousel.innerHTML = `<p class="video-escenas-empty">${window.__('Aún no hay producciones. Las producciones de tus flows aparecerán aquí.')}</p>`;
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
        <div class="video-escena-item ${selected ? 'is-selected' : ''}" data-id="${id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${window.__('Seleccionar como escena')}">
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
      gallery.innerHTML = `<p class="video-productions-empty">${window.__('Aún no hay producciones. Las producciones de tus flows aparecerán aquí.')}</p>`;
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
        <div class="video-production-item ${selected ? 'is-selected' : ''}" data-id="${id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${window.__('Seleccionar producción')}">
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
      el.innerHTML = `<option value="">${window.__('— Ninguno')}</option>` + values.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('');
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

    /* Tabs cinematography: click swap panel */
    this.container.querySelectorAll('.video-cine-tab[data-tab]').forEach((tab) => {
      if (tab.dataset.boundTab === '1') return;
      tab.dataset.boundTab = '1';
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const target = tab.getAttribute('data-tab');
        if (!target) return;
        this.container.querySelectorAll('.video-cine-tab').forEach((t) => {
          const active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        this.container.querySelectorAll('.video-cine-panel').forEach((p) => {
          const active = p.getAttribute('data-panel') === target;
          p.classList.toggle('is-active', active);
          p.hidden = !active;
        });
      });
    });

    this.renderCinematographySelectedTags();
    this.renderDirectorVariables();
    this.enhanceCinematographyWithTiles();
  }

  enhanceCinematographyWithTiles() {
    // Fallback por categoría — solo aplica si no hay icono específico por valor
    const FALLBACK_ICONS = {
      shotType: 'fa-video',
      lens: 'fa-camera-retro',
      framing: 'fa-crop',
      cameraMovement: 'fa-arrows-up-down-left-right',
      motionSpeed: 'fa-gauge-high',
      motionIntensity: 'fa-bolt',
      lightType: 'fa-lightbulb',
      contrastLevel: 'fa-circle-half-stroke',
      temperature: 'fa-temperature-three-quarters',
      tone: 'fa-palette',
      colorGrade: 'fa-paintbrush',
      colorTemp: 'fa-droplet',
      energyLevel: 'fa-fire-flame-curved'
    };

    // Descripciones por VALOR — al hover sobre cada tile, tooltip explica
    // qué hace el efecto en lenguaje claro para usuarios sin experiencia.
    const VALUE_DESCRIPTIONS = {
      // Camera movement
      'Static': window.__('La cámara permanece fija. Ideal para tomas limpias y producto en primer plano.'),
      'Slow Push In': window.__('La cámara se acerca lentamente al sujeto. Crea tensión y resalta un punto focal.'),
      'Slow Pull Out': window.__('La cámara se aleja lentamente. Revela el entorno y da contexto al sujeto.'),
      'Dolly Left': window.__('La cámara se desplaza hacia la izquierda manteniendo al sujeto centrado.'),
      'Dolly Right': window.__('La cámara se desplaza hacia la derecha. Sensación de exploración lateral.'),
      'Orbit': window.__('La cámara gira alrededor del sujeto en arco. Cinematográfico y dramático.'),
      '360° Rotation': window.__('Rotación completa alrededor del sujeto. Muestra el producto desde todos los ángulos.'),
      'Handheld': window.__('Movimiento de mano natural con pulso humano. Documental, auténtico, cercano.'),
      'Tracking': window.__('La cámara sigue al sujeto en movimiento. Mantiene foco mientras hay acción.'),
      'FPV': window.__('Punto de vista en primera persona. Inmersivo y dinámico (estilo dron o GoPro).'),

      // Motion speed / intensity
      'Subtle': window.__('Movimiento muy leve, casi imperceptible. Premium y elegante.'),
      'Moderate': window.__('Movimiento controlado y constante. Balance entre energía y calma.'),
      'Dynamic': window.__('Movimiento marcado y enérgico. Llama la atención.'),
      'Aggressive': window.__('Movimiento intenso y rápido. Máxima energía visual.'),

      // Lighting type
      'Soft diffused': window.__('Luz suave y envolvente, sin sombras duras. Sensación cálida y limpia.'),
      'Hard contrast': window.__('Luces fuertes y sombras marcadas. Dramatismo visual.'),
      'Rim light': window.__('Luz que recorta el contorno del sujeto. Premium, lo separa del fondo.'),
      'Backlit silhouette': window.__('Sujeto a contraluz, silueta negra contra luz. Misterio, drama.'),
      'Studio commercial': window.__('Iluminación de estudio profesional. Limpia, pareja, comercial clásico.'),
      'Natural daylight': window.__('Luz natural de día. Auténtico, lifestyle, accesible.'),
      'Dramatic spotlight': window.__('Foco concentrado sobre el sujeto. Aislamiento y protagonismo total.'),

      // Contrast
      'Low': window.__('Contraste bajo. Tonos planos y suaves, look documental o vintage.'),
      'Medium': window.__('Contraste balanceado. Look natural y versátil.'),
      'High': window.__('Contraste alto. Imagen punchy y vibrante.'),
      'Ultra contrast': window.__('Contraste extremo. Look gráfico, casi de moda editorial.'),

      // Temperature
      'Neutral': window.__('Temperatura neutra. Colores reales sin tinte cálido ni frío.'),
      'Warm': window.__('Tonos cálidos (amarillos, naranjas). Acogedor, dorado, premium.'),
      'Cold': window.__('Tonos fríos (azules). Tecnológico, sereno, sofisticado.'),

      // Tone / Mood
      'Clean commercial': window.__('Look comercial clásico. Limpio, claro, vende sin distracciones.'),
      'Cinematic dramatic': window.__('Look de cine con paleta rica y tensión. Storytelling potente.'),
      'Hyperreal product': window.__('Producto hiperdetallado, casi macro. Saca lo mejor del objeto.'),
      'Minimal luxury': window.__('Estética minimal premium. Pocos elementos, mucho aire, lujo callado.'),
      'Dark premium': window.__('Paleta oscura y elegante. Producto de gama alta nocturno.'),
      'Bright energetic': window.__('Colores vivos y luminosos. Joven, social, juvenil.'),
      'Editorial fashion': window.__('Estética de revista de moda. Sofisticado y aspiracional.'),
      'Documentary': window.__('Look auténtico y crudo. Sin filtros, real, humano.'),

      // Color grade / temp / energy
      'High saturation': window.__('Colores muy saturados. Vibrante y llamativo.'),
      'Muted tones': window.__('Tonos apagados y elegantes. Premium discreto.'),
      'Peak': window.__('Energía visual máxima. Cortes rápidos, vivos, alta intensidad.')
    };

    // Mapping de iconos por VALOR — para que el usuario sin experiencia vea el
    // pictograma y entienda qué hace cada opción sin tener que leer.
    const VALUE_ICONS = {
      // Camera movement
      'Static': 'fa-square',
      'Slow Push In': 'fa-down-left-and-up-right-to-center',
      'Slow Pull Out': 'fa-up-right-and-down-left-from-center',
      'Dolly Left': 'fa-arrow-left',
      'Dolly Right': 'fa-arrow-right',
      'Orbit': 'fa-rotate',
      '360° Rotation': 'fa-arrows-spin',
      'Handheld': 'fa-hand',
      'Tracking': 'fa-route',
      'FPV': 'fa-helicopter',

      // Motion speed / intensity (escala visual)
      'Subtle': 'fa-circle',
      'Moderate': 'fa-circle-dot',
      'Dynamic': 'fa-bolt',
      'Aggressive': 'fa-fire',

      // Lighting type
      'Soft diffused': 'fa-cloud',
      'Hard contrast': 'fa-mountain-sun',
      'Rim light': 'fa-circle-half-stroke',
      'Backlit silhouette': 'fa-user-secret',
      'Studio commercial': 'fa-store',
      'Natural daylight': 'fa-sun',
      'Dramatic spotlight': 'fa-bullseye',

      // Contrast
      'Low': 'fa-circle-notch',
      'Medium': 'fa-circle-half-stroke',
      'High': 'fa-circle',
      'Ultra contrast': 'fa-circle-radiation',

      // Temperature
      'Neutral': 'fa-circle',
      'Warm': 'fa-fire',
      'Cold': 'fa-snowflake',

      // Tone / Mood
      'Clean commercial': 'fa-broom',
      'Cinematic dramatic': 'fa-masks-theater',
      'Hyperreal product': 'fa-cube',
      'Minimal luxury': 'fa-gem',
      'Dark premium': 'fa-moon',
      'Bright energetic': 'fa-bolt',
      'Editorial fashion': 'fa-book-open',
      'Documentary': 'fa-camera',

      // Color grade / temp
      'High saturation': 'fa-droplet',
      'Muted tones': 'fa-circle',

      // Energy level
      'Peak': 'fa-fire'
    };

    // SVG animados que comunican el movimiento de cámara visualmente.
    // Cada SVG usa viewBox 32x24 (aspect cinema-ish), stroke currentColor,
    // animaciones CSS por clase (.cine-anim-*) que solo corren on-hover/selected.
    const VALUE_SVG = {
      'Static': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect x="6" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="12" r="1.4" fill="currentColor" class="cine-anim-pulse"/></svg>',
      'Slow Push In': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect x="2.5" y="2.5" width="27" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1" opacity="0.35"/><rect class="cine-anim-push-in" x="9" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/></svg>',
      'Slow Pull Out': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect x="2.5" y="2.5" width="27" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1" opacity="0.35"/><rect class="cine-anim-pull-out" x="9" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/></svg>',
      'Dolly Left': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect class="cine-anim-dolly-left" x="10" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 12h4M4 12l2-2M4 12l2 2" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.55"/></svg>',
      'Dolly Right': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect class="cine-anim-dolly-right" x="8" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M28 12h-4M28 12l-2-2M28 12l-2 2" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.55"/></svg>',
      'Orbit': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><circle cx="16" cy="12" r="2" fill="currentColor"/><ellipse cx="16" cy="12" rx="11" ry="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/><circle class="cine-anim-orbit" cx="27" cy="12" r="1.8" fill="currentColor" style="transform-origin:16px 12px"/></svg>',
      '360° Rotation': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect class="cine-anim-rotate" x="10" y="6" width="12" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/><path d="M6 12a10 8 0 0120 0" stroke="currentColor" stroke-width="1" fill="none" opacity="0.4" stroke-dasharray="2 2"/></svg>',
      'Handheld': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect class="cine-anim-handheld" x="9" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/></svg>',
      'Tracking': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><circle class="cine-anim-tracking-subject" cx="8" cy="12" r="2" fill="currentColor" style="transform-origin:16px 12px"/><rect class="cine-anim-tracking-cam" x="20" y="6" width="9" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/><path d="M11 12h7" stroke="currentColor" stroke-width="1" opacity="0.4" stroke-dasharray="2 2"/></svg>',
      'FPV': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><path class="cine-anim-fpv" d="M4 4l24 8-24 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    };

    const config = [
      ['videoCineShotType', 'shotType'], ['videoCineLens', 'lens'], ['videoCineFraming', 'framing'],
      ['videoCineMovement', 'cameraMovement'], ['videoCineMotionSpeed', 'motionSpeed'], ['videoCineMotionIntensity', 'motionIntensity'],
      ['videoCineLightType', 'lightType'], ['videoCineContrast', 'contrastLevel'], ['videoCineTemperature', 'temperature'],
      ['videoCineTone', 'tone'], ['videoCineColorGrade', 'colorGrade'], ['videoCineEnergyLevel', 'energyLevel'], ['videoCineColorTemp', 'colorTemp']
    ];
    config.forEach(([id, key]) => {
      const sel = this.container.querySelector('#' + id);
      if (!sel) return;
      const row = sel.closest('.video-cine-row');
      if (!row) return;
      let grid = row.querySelector('.video-cine-tile-grid');
      if (!grid) {
        grid = document.createElement('div');
        grid.className = 'video-cine-tile-grid';
        grid.setAttribute('data-target-select', id);
        row.appendChild(grid);
        sel.classList.add('video-cine-select-hidden');
      }
      const fallbackIcon = FALLBACK_ICONS[key] || 'fa-circle';
      const renderTiles = () => {
        const options = Array.from(sel.options).filter((o) => o.value);
        const current = sel.value;
        grid.innerHTML = options.map((opt) => {
          const svg = VALUE_SVG[opt.value];
          const icon = VALUE_ICONS[opt.value] || fallbackIcon;
          const desc = VALUE_DESCRIPTIONS[opt.value] || '';
          const descAttr = desc ? ` data-desc="${this.escapeHtml(desc)}"` : '';
          const visual = svg
            ? `<span class="video-cine-tile__svg" aria-hidden="true">${svg}</span>`
            : `<i class="fas ${icon} video-cine-tile__icon" aria-hidden="true"></i>`;
          return `
            <button type="button" class="video-cine-tile${current === opt.value ? ' is-selected' : ''}${svg ? ' has-svg' : ''}" data-value="${this.escapeHtml(opt.value)}" aria-pressed="${current === opt.value ? 'true' : 'false'}"${descAttr} aria-label="${this.escapeHtml(opt.text)}${desc ? ' — ' + this.escapeHtml(desc) : ''}">
              ${visual}
              <span class="video-cine-tile__label">${this.escapeHtml(opt.text)}</span>
              ${desc ? `<span class="video-cine-tile__tooltip" role="tooltip">${this.escapeHtml(desc)}</span>` : ''}
            </button>`;
        }).join('');
      };
      renderTiles();
      if (grid.dataset.boundTileClick !== '1') {
        grid.dataset.boundTileClick = '1';
        grid.addEventListener('click', (e) => {
          const tile = e.target.closest('.video-cine-tile');
          if (!tile || !grid.contains(tile)) return;
          e.preventDefault();
          const value = tile.getAttribute('data-value');
          sel.value = sel.value === value ? '' : value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          renderTiles();
        });
      }
      sel.addEventListener('change', renderTiles);
    });
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
    el.innerHTML = `<span class="video-cine-selected-label">${window.__('Estilo seleccionado:')}</span>` + tags.map((t) =>
      `<span class="video-cine-tag" data-key="${t.key}">${t.label.replace(/"/g, '&quot;')}<button type="button" class="video-cine-tag-remove" aria-label="${window.__('Quitar {key}', { key: t.key })}">&times;</button></span>`
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
      // Modelo nuevo: las columnas "brand-level" viven en brand_containers
      // (nicho_core, arquetipo, verbal_dna, etc.) y brand_profiles se filtra
      // por brand_container_id en vez de brand_id.
      const { data: brandRow } = await this.supabase
        .from('brand_containers')
        .select(
          'id, nicho_core, sub_nichos, arquetipo, propuesta_valor, mision_vision, verbal_dna, visual_dna, palabras_clave, palabras_prohibidas, objetivos_estrategicos'
        )
        .eq('id', bcId)
        .maybeSingle();
      this.dbData.brand = brandRow || null;
      this.dbData.brandProfiles = [];
      if (brandRow?.id) {
        const { data: profiles } = await this.supabase.from('brand_profiles').select('section, content').eq('brand_container_id', brandRow.id);
        this.dbData.brandProfiles = profiles || [];
      }
      // audiences: tabla legacy reemplazada por audience_personas (BUG-005).
      // campaigns: contexto_temporal/objetivos_estrategicos/tono_modificador
      // viven en campaign_briefs (BUG-006); resolvemos vía embed PostgREST
      // usando la FK campaigns.brief_id → campaign_briefs.id.
      //
      // Scope por tabla (modelo org vs brand_container):
      //  - products/audience_personas/campaigns: tienen brand_container_id,
      //    filtran por sub-marca.
      //  - services/brand_entities: org-scope (compartidos entre todas las
      //    sub-marcas de la org), filtran por organization_id. Filtrar por
      //    brand_container_id en estas tablas dispara 400 (columna inexistente).
      const orgId = this.organizationId || window.currentOrgId;
      const [productsRes, servicesRes, entitiesRes, audiencesRes, campaignsRes] = await Promise.all([
        this.supabase.from('products').select('id, entity_id, nombre_producto, brand_container_id').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        orgId
          ? this.supabase.from('services').select('id, entity_id, nombre_servicio').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] }),
        orgId
          ? this.supabase.from('brand_entities').select('id, name, entity_type, description').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] }),
        this.supabase.from('audience_personas').select('id, name, description, estilo_lenguaje').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('campaigns').select('id, nombre_campana, descripcion_interna, persona_id, brief_id, campaign_briefs:brief_id(contexto_temporal, objetivos_estrategicos, tono_modificador)').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50)
      ]);
      this.dbData.products = productsRes.data || [];
      this.dbData.services = servicesRes.data || [];
      this.dbData.entities = entitiesRes.data || [];
      this.dbData.audiences = audiencesRes.data || [];
      // Aplanar campos del brief al row de campaña para que el resto del
      // código siga accediendo como c.contexto_temporal, c.tono_modificador, etc.
      this.dbData.campaigns = (campaignsRes.data || []).map((c) => {
        const brief = c.campaign_briefs || {};
        return {
          id: c.id,
          nombre_campana: c.nombre_campana,
          descripcion_interna: c.descripcion_interna,
          persona_id: c.persona_id,
          brief_id: c.brief_id,
          contexto_temporal: brief.contexto_temporal || null,
          objetivos_estrategicos: brief.objetivos_estrategicos || null,
          tono_modificador: brief.tono_modificador || null,
        };
      });
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
    // Conceptual: opciones hardcoded en el HTML, NO se popula desde BD.
    // Las campañas en /video son conceptos narrativos (Brand awareness, Product
    // launch, etc.) no campañas reales del CRM. El backend recibe el string
    // conceptual y OpenAI lo usa como contexto del prompt.
    const select = this.container.querySelector('#videoCampaignSelect');
    if (!select) return;
    if (this.selectedCampaignId && Array.from(select.options).some((o) => o.value === this.selectedCampaignId)) {
      select.value = this.selectedCampaignId;
    }
  }

  renderAudienceDropdown() {
    // Conceptual: opciones hardcoded en HTML, NO BD. Misma lógica que campañas.
    const select = this.container.querySelector('#videoAudienceSelect');
    if (!select) return;
    if (this.selectedAudienceId && Array.from(select.options).some((o) => o.value === this.selectedAudienceId)) {
      select.value = this.selectedAudienceId;
    }
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
    el.innerHTML = `<span class="video-cine-selected-label">${window.__('Variables:')}</span>` + tags.map((t) =>
      `<span class="video-cine-tag video-director-variable-tag" data-key="${t.key}">${t.label.replace(/"/g, '&quot;')}<button type="button" class="video-cine-tag-remove" aria-label="${window.__('Quitar {key}', { key: t.key })}">&times;</button></span>`
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

  /**
   * Quita un path de Storage cuando el usuario remueve UNA imagen del
   * elemento. No-op si:
   *  - el elemento no tiene _storagePaths (es producto de la BD, no upload)
   *  - el supabase client no está disponible
   * Fire-and-forget: errores se loggean pero no rompen la UI.
   */
  _removeKlingStoragePath(el, urlIdx) {
    if (!el || !el._storageBucket || !Array.isArray(el._storagePaths)) return;
    if (urlIdx < 0 || urlIdx >= el._storagePaths.length) return;
    const path = el._storagePaths[urlIdx];
    el._storagePaths.splice(urlIdx, 1);
    if (!path || !this.supabase || !this.supabase.storage) return;
    this.supabase.storage.from(el._storageBucket).remove([path]).catch((err) => {
      console.warn('[VideoView] cleanup storage path failed', path, err);
    });
  }

  /**
   * Borra TODOS los archivos del elemento en Storage. Llamar al quitar
   * el elemento entero o cuando queda vacío (sin imágenes restantes).
   * No-op para elementos de producto (sin _storagePaths).
   */
  _removeKlingStorageAll(el) {
    if (!el || !el._storageBucket || !Array.isArray(el._storagePaths)) return;
    const paths = el._storagePaths.slice();
    el._storagePaths = [];
    if (paths.length === 0 || !this.supabase || !this.supabase.storage) return;
    this.supabase.storage.from(el._storageBucket).remove(paths).catch((err) => {
      console.warn('[VideoView] cleanup storage element failed', paths, err);
    });
  }

  async onKlingElementFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const images = files.filter((f) => f.type.startsWith('image/'));
    const videos = files.filter((f) => f.type.startsWith('video/'));

    // Sin validación rígida 2-4: Kling SOLO exige 2-4 cuando se usa
    // kling_elements con @element_name en el prompt. Para image_urls
    // (first/last frame) basta con 1 imagen. El usuario puede subir
    // libremente; truncamos al máximo permitido por el modelo (4
    // imágenes por elemento, 1 video).

    // Nombre auto-generado para que el flujo sea de un solo click
    // (sin modales nativos del browser). El usuario puede editarlo
    // después si necesita referenciar el elemento con @name en el prompt.
    const autoName = (prefix) => {
      const idx = (this.klingElements?.length || 0) + 1;
      return this.sanitizeElementName(`${prefix}_${idx}`);
    };

    // Si solo hay video(s): primer video como elemento de video
    if (videos.length > 0 && images.length === 0) {
      if (videos.length > 1 && typeof window.showToast === 'function') {
        window.showToast(window.__('Se usará solo el primer video — Kling permite uno por elemento.'), { type: 'info', duration: 4000 });
      }
      await this.uploadAndAddKlingElement({ name: autoName('video'), description: '', videoFile: videos[0] });
      return;
    }

    // Si hay imágenes (con o sin videos): usar imágenes, ignorar videos
    if (images.length > 0) {
      if (videos.length > 0 && typeof window.showToast === 'function') {
        window.showToast(window.__('Solo se subieron las imágenes — para usar video, súbelo sin imágenes.'), { type: 'info', duration: 4000 });
      }
      // Truncar a 4 imágenes máximo (límite de Kling por elemento)
      const usable = images.slice(0, 4);
      if (images.length > 4 && typeof window.showToast === 'function') {
        window.showToast(window.__('Se usan las primeras 4 imágenes (subiste {count}). Las restantes se ignoran.', { count: images.length }), { type: 'info', duration: 5000 });
      }
      await this.uploadAndAddKlingElement({ name: autoName('imagen'), description: '', imageFiles: usable });
      return;
    }

    // Ningún tipo reconocido
    const msg = window.__('Formato no soportado. Sube imágenes JPG/PNG o video MP4/MOV.');
    if (typeof window.showToast === 'function') {
      window.showToast(msg, { type: 'warning', duration: 5000 });
    } else if (window.alert) {
      window.alert(msg);
    }
  }

  async uploadAndAddKlingElement({ name, description, imageFiles, videoFile }) {
    if (!this.supabase || !this.supabase.storage) {
      if (window.alert) window.alert(window.__('No se puede subir: sesión o almacenamiento no disponible.'));
      return;
    }
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) {
      if (window.alert) window.alert(window.__('Inicia sesión para subir elementos.'));
      return;
    }
    const bucket = 'production-outputs';
    const elementId = `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const basePath = `kling-elements/${user.id}/${elementId}`;
    const urls = [];
    const storagePaths = [];
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
          storagePaths.push(fileName);
        }
        this.klingElements.push({
          name,
          description: description || undefined,
          element_input_urls: urls,
          _pinned: false,
          // Paths internos del bucket — usados al quitar para hacer cleanup
          _storageBucket: bucket,
          _storagePaths: storagePaths
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
          _pinned: false,
          _storageBucket: bucket,
          _storagePaths: [fileName]
        });
      }
      this.renderKlingElementsList();
    } catch (err) {
      console.error('Error subiendo elemento kling:', err);
      if (window.alert) window.alert(window.__('Error al subir: ') + (err.message || window.__('vuelve a intentarlo.')));
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
              <button type="button" class="video-kling-element-remove-thumb" data-element-index="${idx}" data-url-index="${urlIdx}" aria-label="${window.__('Quitar esta imagen')}">&times;</button>
            </span>`;
          }).join('')
        : '';
      const thumbsContainer = thumbnails ? `<span class="video-kling-element-thumbs">${thumbnails}</span>` : '';
      const hasVideo = (el.element_input_video_urls || []).length > 0;
      const videoLabel = hasVideo ? `<span class="video-kling-element-video-label">@${el.name}</span>` : '';
      const productPinBtn = isProduct ? `<button type="button" class="video-kling-element-pin-chip" data-element-index="${idx}" aria-label="${productPinned ? window.__('Desanclar producto (dejar solo como imagen de referencia)') : window.__('Anclar producto (usar como kling_element en el prompt)')}" title="${productPinned ? window.__('Desanclar') : window.__('Anclar como elemento de referencia')}"><i class="fas fa-thumbtack${productPinned ? ' video-kling-pin-active' : ''}"></i></button>` : '';
      return `
      <span class="video-kling-element-chip" data-index="${idx}">
        ${thumbsContainer}
        ${!thumbsContainer ? `@${el.name}` : ''}
        ${videoLabel}
        ${productPinBtn}
        <button type="button" class="video-kling-element-remove" aria-label="${window.__('Quitar elemento {name}', { name: el.name })}">&times;</button>
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
        // Cleanup en Storage de la imagen específica (solo si fue subida
        // manualmente; las de productos no se borran del bucket).
        this._removeKlingStoragePath(el, urlIdx);
        el.element_input_urls.splice(urlIdx, 1);
        if (el._pinnedIndices) {
          el._pinnedIndices = el._pinnedIndices.filter((i) => i !== urlIdx).map((i) => (i > urlIdx ? i - 1 : i));
          if (el._pinnedIndices.length === 0) delete el._pinnedIndices;
        }
        if (el.element_input_urls.length === 0) {
          // El elemento quedó vacío — borrar lo que reste de Storage
          this._removeKlingStorageAll(el);
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
          // Cleanup en Storage si el elemento fue subido manualmente
          this._removeKlingStorageAll(removed);
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

    this.showStatus(window.__('Descargando y guardando en tu cuenta…'), true);
    try {
      const proxyUrl = `${VideoView.KIE_VIDEO_DOWNLOAD_API}?videoUrl=${encodeURIComponent(kieVideoUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || window.__('Descarga fallida: {status}', { status: res.status }));
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
        <p><strong>${window.__('Dirección visual')}</strong><br>${visual}</p>
        <p><strong>${window.__('Plan de cámara')}</strong><br>${c.shotType || '—'} / ${c.lens || '—'} / ${c.framing || '—'}</p>
        <p><strong>${window.__('Plan de movimiento')}</strong><br>${motion}</p>
        <p><strong>${window.__('Plan de iluminación')}</strong><br>${lighting}</p>
        ${brief ? `<p><strong>${window.__('Director Brief')}</strong><br>${brief.slice(0, 200)}${brief.length > 200 ? '…' : ''}</p>` : ''}
      `;
    }
    if (scoreEl) scoreEl.textContent = window.__('Brand Lock Score: 94%');
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
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    return {
      brand_voice: {
        nicho_core: brand.nicho_core || '',
        sub_nichos: arr(brand.sub_nichos),
        arquetipo: brand.arquetipo || null,
        propuesta_valor: brand.propuesta_valor || null,
        mision_vision: brand.mision_vision || null,
        verbal_dna: obj(brand.verbal_dna),
        visual_dna: obj(brand.visual_dna),
        palabras_clave: arr(brand.palabras_clave),
        palabras_prohibidas: arr(brand.palabras_prohibidas),
        objetivos_estrategicos: arr(brand.objetivos_estrategicos)
      },
      brand_profiles: (d.brandProfiles || []).map((p) => ({ section: p.section, content: p.content })),
      entities: (d.entities || []).map((e) => ({ name: e.name, entity_type: e.entity_type, description: e.description })),
      products: (d.products || []).map((p) => ({ name: p.nombre_producto })),
      audiences: (d.audiences || []).map((a) => ({ name: a.name, description: a.description, estilo_lenguaje: a.estilo_lenguaje })),
      campaigns: (d.campaigns || []).map((c) => ({ name: c.nombre_campana, description: c.descripcion_interna, audience_id: c.persona_id, contexto_temporal: c.contexto_temporal, objetivos_estrategicos: c.objetivos_estrategicos, tono_modificador: c.tono_modificador })),
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
      // Schema unificado runs_outputs <-> system_ai_outputs (2026-05-22).
      // Pueblan automaticamente los campos comunes desde el state del view;
      // el caller solo pasa lo especifico (provider, output_type, prompt,
      // metadata, etc.).
      const briefId = this._resolveSelectedBriefId();
      const entityId = this._resolveSelectedEntityId();
      const row = {
        brand_container_id: brandContainerId,
        organization_id: this.organizationId || null,
        user_id: user.id,
        campaign_id: this.selectedCampaignId || null,
        persona_id: this.selectedAudienceId || null,
        brief_id: briefId,
        entity_id: entityId,
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

  /**
   * Resuelve brief_id desde la campana seleccionada (campaigns.brief_id ya
   * viene aplanado en dbData.campaigns). Devuelve null si no hay campana
   * seleccionada o la campana no tiene brief.
   */
  _resolveSelectedBriefId() {
    if (!this.selectedCampaignId) return null;
    const c = (this.dbData?.campaigns || []).find((x) => String(x.id) === String(this.selectedCampaignId));
    return c?.brief_id || null;
  }

  /**
   * Resuelve entity_id desde el asset seleccionado segun scope (product /
   * service). products.entity_id y services.entity_id son FK a brand_entities
   * y dan el linaje canonico al output. Devuelve null si no hay asset o
   * scope no soportado.
   */
  _resolveSelectedEntityId() {
    if (!this.selectedAssetId) return null;
    const scope = this.assetScope || 'product';
    if (scope === 'product') {
      const p = (this.dbData?.products || []).find((x) => String(x.id) === String(this.selectedAssetId));
      return p?.entity_id || null;
    }
    if (scope === 'service') {
      const s = (this.dbData?.services || []).find((x) => String(x.id) === String(this.selectedAssetId));
      return s?.entity_id || null;
    }
    return null;
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
    this.showStatus(window.__('Generando prompt cinematográfico con IA…'), true);

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
        this.showError(data.error || window.__('Error al generar el prompt'));
        return;
      }
      // Acumular tokens del cine-prompt para cobrar al disparar el video.
      // Las regeneraciones del prompt son gratis; el costo se traslada al
      // createVideo (KIE_kling + sum_openai_tokens + 5 cred markup).
      this._cinePromptTokens = {
        input: Number(data.openai_input_tokens || 0),
        output: Number(data.openai_output_tokens || 0),
        model: data.openai_model || 'gpt-4o-mini'
      };
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
          models: { prompter: 'gpt-4o-mini' },
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
          models: { prompter: 'gpt-4o-mini' },
          metadata: { source: 'openai-cine-prompt', has_cinematography: true }
        });
      } else {
        this.showError(window.__('No se recibió prompt'));
      }
    } catch (err) {
      this.showError(err.message || window.__('Error de conexión'));
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
      sendBtn.setAttribute('aria-label', hasPrompt ? window.__('Generar video (producción)') : window.__('Generar prompt'));
      const icon = sendBtn.querySelector('i');
      if (icon) {
        icon.className = hasPrompt ? 'fas fa-play' : 'fas fa-wand-magic-sparkles';
      }
    }
    if (labelEl) labelEl.textContent = hasPrompt ? window.__('PRODUCCIÓN') : 'PROMPT';
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
      this.showError(window.__('Genera primero el prompt con el botón PROMPT.'));
      return;
    }
    const promptText = (this.promptInput && this.promptInput.value) ? this.promptInput.value.trim() : '';
    if (!promptText) {
      this.showError(window.__('No hay prompt. Usa "Volver a producir" para regenerar el prompt.'));
      return;
    }

    const VIDEO_CREDITS_REQUIRED = 25;
    if (!this.organizationId) {
      this.showError(window.__('Selecciona una organización para producir videos.'));
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
          this.showError(window.__('Tu organización no tiene créditos suficientes. Necesitas al menos {required} créditos para producir un video.', { required: VIDEO_CREDITS_REQUIRED }));
          return;
        }
      }
    }

    const modeEl = this.container.querySelector('#videoMode');
    const mode = modeEl && modeEl.value === 'pro' ? 'pro' : 'std';
    if (this.sendBtn) this.sendBtn.disabled = true;
    this.showStatus(window.__('Creando tarea de generación…'), true);

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
      sound,
      organization_id: this.organizationId || null,
      // Tokens del cine-prompt para cobrar al usuario: el backend calcula
      // KIE_kling_per_second*duration + OpenAI_tokens_cost + 5 cred markup.
      openai_input_tokens: this._cinePromptTokens?.input || 0,
      openai_output_tokens: this._cinePromptTokens?.output || 0,
      openai_model: this._cinePromptTokens?.model || 'gpt-4o-mini'
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
        this.showError(window.__('El servicio de video no respondió correctamente (estado {status}). Intenta de nuevo en unos minutos.', { status: createRes.status }));
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      console.log('[Video] POST', createUrl, '→ status:', createRes.status, 'body:', createData);

      if (!createRes.ok) {
        console.warn('[Video] POST', createUrl, 'error:', createRes.status, createData);
        if (createRes.status === 422 && createData.kieBody) {
          console.warn('[Video] 422 KIE (validación):', createData.kieBody);
        }
        const serverMsg = (createData.kieBody && (createData.kieBody.msg || createData.kieBody.message)) || createData.error || createData.failMsg || window.__('Error al crear la tarea');
        this.showError(serverMsg);
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      const taskId = createData.taskId;
      if (!taskId) {
        console.warn('[Video] POST ok pero sin taskId en body:', createData);
        this.showError(window.__('No se recibió taskId del servidor'));
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      console.log('[Video] Tarea creada, taskId:', taskId, '→ iniciando polling');

      // Reference image: la primera imagen pasada como input al modelo
      // (preserva linaje con el output original que sirvio de seed visual).
      const refImg = Array.isArray(payload.image_urls) && payload.image_urls.length > 0
        ? payload.image_urls[0]
        : null;
      this._lastKieOutputId = await this.saveSystemAIOutput({
        provider: 'kie',
        output_type: 'video',
        status: 'processing',
        external_job_id: taskId,
        prompt_used: promptText,
        reference_image_url: refImg,
        models: { editor: 'kling-3.0/video', prompter: 'gpt-4o-mini' },
        technical_params: {
          mode: payload.mode || 'pro',
          duration: payload.duration,
          aspect_ratio: payload.aspect_ratio,
          output_format: 'mp4'
        },
        metadata: {
          kind: 'video_generated',
          kling_elements_count: (payload.kling_elements || []).length,
          image_urls_count: Array.isArray(payload.image_urls) ? payload.image_urls.length : 0
        }
      });

      this.showStatus(window.__('Generando video (Kling 3.0). Esto puede tardar unos minutos…'), true);
      await this.pollTask(taskId);
    } catch (err) {
      console.error('[Video] Error en startGeneration:', err);
      this.showError(err.message || window.__('Error de conexión'));
    } finally {
      if (this.sendBtn) this.sendBtn.disabled = false;
    }
  }

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._pollVisibilityHandler) {
      document.removeEventListener('visibilitychange', this._pollVisibilityHandler);
      this._pollVisibilityHandler = null;
    }
  }

  async pollTask(taskId) {
    const statusUrl = `${VideoView.KLING_VIDEO_STATUS_API}?taskId=${encodeURIComponent(taskId)}`;
    const pollStartedAt = Date.now();
    console.log('[Video] Polling estado → GET', statusUrl, '(cada', VideoView.POLL_INTERVAL_MS / 1000, 's, máx', VideoView.POLL_MAX_DURATION_MS / 60000, 'min)');

    const poll = async () => {
      if (Date.now() - pollStartedAt > VideoView.POLL_MAX_DURATION_MS) {
        this.stopPolling();
        this.showError(window.__('La generación superó el tiempo máximo de espera (12 min). Comprueba el estado en KIE o reintenta con un prompt más corto.'));
        if (this._lastKieOutputId) {
          await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'Timeout de polling (12 min)' });
          this._lastKieOutputId = null;
        }
        return;
      }
      // Pausamos el fetch a KIE cuando la pestaña está oculta. El timeout se sigue
      // midiendo contra wall-clock (pollStartedAt), así que no se alarga la espera total.
      // Ahorra ~20 llamadas/min a KIE por cada tab en background generando video.
      if (document.hidden) return;
      try {
        const res = await fetch(statusUrl);
        let data = {};
        try {
          data = await res.json();
        } catch (parseErr) {
          console.error('[Video] GET', statusUrl, ': respuesta no es JSON. Status:', res.status, '→ ¿función desplegada?', parseErr);
          this.stopPolling();
          this.showError(window.__('El servicio de video no respondió correctamente (estado {status}). Intenta de nuevo en unos minutos.', { status: res.status }));
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'Status ' + res.status });
            this._lastKieOutputId = null;
          }
          return;
        }

        if (!res.ok) {
          console.warn('[Video] GET', statusUrl, 'error:', res.status, data);
          this.stopPolling();
          this.showError(data.error || window.__('Error al consultar el estado'));
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

                // Cobro dinamico: kie-task-finalize lee creditsConsumed real
                // de KIE + suma OpenAI tokens del cine-prompt + 5 cred markup.
                // Reemplaza el cobro fijo previo de 25 cred (deduct_credits_for_video).
                let finalizeResult = null;
                try {
                  const { data: { session } } = await this.supabase.auth.getSession();
                  const accessToken = session?.access_token;
                  if (accessToken && this.organizationId) {
                    const finalizeRes = await fetch('/.netlify/functions/kie-task-finalize', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                      body: JSON.stringify({
                        task_id: taskId,
                        kind: 'video_generated',
                        organization_id: this.organizationId,
                        source_output_id: this._lastKieOutputId || null,
                        openai_input_tokens: this._cinePromptTokens?.input || 0,
                        openai_output_tokens: this._cinePromptTokens?.output || 0,
                        openai_model: this._cinePromptTokens?.model || 'gpt-4o-mini'
                      })
                    });
                    finalizeResult = await finalizeRes.json().catch(() => null);
                    if (!finalizeRes.ok) {
                      console.warn('[Video] finalize fallo, video guardado sin cobro:', finalizeResult);
                    } else if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
                      window.appNavigation.loadCreditsFromDb(this.organizationId);
                    }
                  }
                } catch (e) {
                  console.warn('[Video] finalize exception:', e);
                }

                if (this._lastKieOutputId) {
                  // Merge metadata: preserva kind y campos del insert original.
                  await this.updateSystemAIOutput(this._lastKieOutputId, {
                    status: 'completed',
                    storage_path: uploaded.storagePath,
                    metadata: {
                      kind: 'video_generated',
                      resultUrls: urls,
                      video_url: uploaded.publicUrl,
                      kie_source_url: kieUrl,
                      credits_charged: finalizeResult?.credits_charged ?? null,
                      cost_breakdown: finalizeResult?.cost_breakdown ?? null
                    },
                    error_message: null
                  });
                  this._lastKieOutputId = null;
                }
              } else {
                this.showError(window.__('No se pudo guardar el video en tu cuenta'));
                if (this._lastKieOutputId) {
                  await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'No se pudo guardar el video en tu cuenta' });
                  this._lastKieOutputId = null;
                }
              }
            } catch (err) {
              this.showError(err.message || window.__('Error al descargar o guardar el video'));
              if (this._lastKieOutputId) {
                await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: err.message || 'Error al descargar o guardar el video' });
                this._lastKieOutputId = null;
              }
            }
          } else {
            this.showError(window.__('No se encontró URL del video en la respuesta'));
            if (this._lastKieOutputId) {
              await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'No se encontró URL del video en la respuesta' });
              this._lastKieOutputId = null;
            }
          }
          return;
        }
        if (state === 'fail') {
          this.stopPolling();
          const rawMsg = data.data?.failMsg || data.data?.failCode || window.__('La generación falló');
          const is524 = String(data.data?.failCode || '') === '524' || /timeout/i.test(rawMsg);
          const msg = is524
            ? window.__('La generación tardó demasiado en KIE (error 524). Prueba: modo Estándar, duración 5s, una sola imagen de referencia, o acorta el prompt.')
            : rawMsg;
          this.showError(msg);
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: msg });
            this._lastKieOutputId = null;
          }
          return;
        }

        this.showStatus(window.__('Generando video (Kling 3.0). Esto puede tardar unos minutos…'), true);
      } catch (err) {
        this.stopPolling();
        this.showError(err.message || window.__('Error al consultar el estado'));
        if (this._lastKieOutputId) {
          await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: err.message || 'Error al consultar el estado' });
          this._lastKieOutputId = null;
        }
      }
    };

    await poll();
    this._pollInterval = setInterval(poll, VideoView.POLL_INTERVAL_MS);
    // Al volver a la pestaña, un poll inmediato evita esperar 3s al próximo tick.
    this._pollVisibilityHandler = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', this._pollVisibilityHandler);
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
