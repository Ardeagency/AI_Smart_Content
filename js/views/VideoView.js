/**
 * VideoView — página de generación de video con Seedance 2.0 (vía KIE).
 *
 * Un solo modelo: no hay paso de "elegir modelo". Kling 3.0, su Director
 * Console, su panel de Cinematografía, el Asset Stack y el carrusel de
 * Escenas salieron de esta página; el backend de Kling (functions/kling-*)
 * NO se tocó porque js/living.js lo sigue usando como poller genérico de KIE.
 *
 * ESTADO DEL MOTOR (leer antes de tocar):
 *  - Conservado y funcional: polling de la tarea KIE (pollTask), persistencia
 *    del video en R2 (downloadAndUploadKieVideo), cobro dinámico de créditos
 *    (kie-task-finalize, dentro de pollTask), registro en system_ai_outputs
 *    y el contexto de marca (loadBrandData / buildBrandContextForAPI).
 *  - Cableado: Frames Clave y Referencias Multimodales suben a Storage, se
 *    validan (cupo por grupo y duración MEDIDA, no supuesta), se muestran
 *    como chips junto al prompt y salen en buildSeedancePayload(). Frames y
 *    referencias son excluyentes, tal como promete el sidebar.
 *  - Pendiente: el endpoint de creación. No existe
 *    functions/seedance-video-create.js, así que SEEDANCE_BACKEND_READY es
 *    false y el botón PRODUCIR avisa en pantalla en vez de disparar una
 *    tarea contra un endpoint inexistente (un 404 sería un fallo mudo). Al
 *    desplegar la función: poner el flag en true, escribir el POST y mapear
 *    los nombres de campo de buildSeedancePayload() a los de KIE.
 *
 * Las reglas del panel (adjuntos y cinematografía) están cubiertas por
 * test/video-seedance-panel.test.js.
 */
class VideoView extends BaseView {
  static documentTitle = 'Video';

  /**
   * Interruptor único del cableado de Seedance. Mientras sea false la página
   * es operable pero no produce: explica lo que falta en vez de fallar mudo.
   */
  static get SEEDANCE_BACKEND_READY() {
    return false;
  }
  /** POST: crear tarea Seedance en KIE. Pendiente de desplegar. */
  static get SEEDANCE_VIDEO_CREATE_API() {
    return '/.netlify/functions/seedance-video-create';
  }
  /**
   * GET: estado de la tarea. El archivo conserva el nombre `kling-video-status`
   * por historia, pero es el poller genérico de cualquier taskId de kie.ai
   * (lo comparte Studio en js/living.js). No renombrar sin migrar ambos.
   */
  static get KIE_TASK_STATUS_API() {
    return '/.netlify/functions/kling-video-status';
  }
  static get KIE_VIDEO_DOWNLOAD_API() {
    return '/.netlify/functions/kie-video-download';
  }
  /**
   * Topes de las referencias multimodales, tal como los anuncia el sidebar.
   * Si KIE los cambia, cambiar aqui Y el texto del contador: un limite que
   * la UI promete y el codigo no aplica (o al reves) se paga en el error de
   * la API, cuando el usuario ya subio los archivos.
   */
  static get SEEDANCE_REF_LIMITS() {
    return { image: 9, video: 3, audio: 3 };
  }
  /** Duracion maxima de un video/audio de referencia, en segundos. */
  static get SEEDANCE_REF_MAX_SECONDS() { return 15; }
  /** Bucket donde viven los adjuntos de referencia. */
  static get SEEDANCE_STORAGE_BUCKET() { return 'production-outputs'; }
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
    this.supabase = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.dbData = { products: [], services: [], entities: [], audiences: [], campaigns: [] };
    this.selectedCampaignId = '';
    this.selectedAudienceId = '';
    // Frames Clave: { url, storagePath } por slot, o null.
    this.seedanceFrames = { first: null, last: null };
    // Referencias multimodales por tipo:
    //   [{ name, url, storagePath, seconds, origen, lock }]
    // `origen` distingue de dónde salió cada una — 'manual' (subida por el
    // usuario), 'produccion' (elegida en Escenas) o 'activo' (producto o
    // servicio del Stack). Importa porque solo las manuales viven en nuestro
    // bucket y solo esas se borran al quitarlas; las otras son URLs que ya
    // existían. Todas cuentan para el mismo cupo, que es de KIE.
    this.seedanceRefs = { image: [], video: [], audio: [] };
    // Producciones previas (Escenas) y selección activa.
    this.videoProductions = [];
    this.selectedProductionIds = new Set();
    // Stack de activos: qué producto/servicio/entidad debe respetar el video.
    this.assetScope = 'product';
    this.selectedAssetId = '';
    // Slot que disparo el file picker de frames (el input es uno solo).
    this._pendingFrameSlot = null;
    // Dirección de fotografía (pestaña Cinematografía). Viene de Kling: son
    // plantillas de prompt, no params de la API, así que sirven igual para
    // Seedance — se traducen a lenguaje de dirección dentro del prompt.
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

                <div class="video-canvas-idle" id="videoCanvasIdle">
                  <div class="video-canvas-idle-content">
                    <p class="video-canvas-idle__eyebrow">Stand by</p>
                    <h3 class="video-canvas-idle__title">${window.__('Listo para producir')}</h3>
                    <p class="video-canvas-idle__hint">${window.__('Describe la secuencia completa abajo. Seedance 2.0 produce el arco entero — apertura, desarrollo y cierre — en una sola pasada.')}</p>
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
                        <i class="aisc-ico aisc-ico--dowload"></i> ${window.__('Descargar')}
                      </a>
                    </div>
                  </div>
                </div>

                <div class="video-error-area" id="videoErrorArea" style="display: none;">
                  <div class="video-error-card">
                    <div class="video-error-icon-wrap"><i class="aisc-ico aisc-ico--alert-warning"></i></div>
                    <p class="video-error-text" id="videoErrorText">—</p>
                  </div>
                </div>

                <div class="video-productions-panel video-productions-panel-inline" id="videoProductionsPanel" aria-hidden="true" style="display: none;">
                  <div class="video-productions-panel-card">
                    <div class="video-productions-panel-header">
                      <h3 class="video-prompt-panel-title">${window.__('Producciones')}</h3>
                      <button type="button" class="video-productions-panel-close" id="videoProductionsPanelClose" aria-label="${window.__('Cerrar')}"><i class="aisc-ico aisc-ico--close"></i></button>
                    </div>
                    <div class="video-productions-gallery" id="videoProductionsGallery"></div>
                  </div>
                </div>

              </section>

              <section class="video-director-console-zone video-prompt-wrap video-main-director" id="seedanceFooterControl" aria-label="${window.__('Director Console Seedance — secuencia narrativa')}">
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
                      <div class="video-attachments-list" id="seedanceElementsList" aria-live="polite"></div>
                      <div class="video-director-variables-row" id="videoDirectorVariables" aria-label="${window.__('Variables de cinematografía')}"></div>
                    </div>

                    <div class="video-director-controls">
                      <button type="button" class="video-director-btn-add" id="seedancePromptAdd" aria-label="${window.__('Añadir referencia visual')}"><i class="aisc-ico aisc-ico--add"></i></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle" id="seedanceGenAudioToggle" title="${window.__('Generar audio')}" aria-pressed="true"><i class="aisc-ico aisc-ico--volume"></i><span>Audio</span></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle" id="seedanceWebSearchToggle" title="${window.__('Búsqueda online')}" aria-pressed="false"><i class="aisc-ico aisc-ico--globe"></i><span>Web</span></button>
                      <div class="video-prompt-aspect-wrap">
                        <select id="seedanceResolution" class="video-director-select" aria-label="${window.__('Resolución')}">
                          <option value="480p">480p</option>
                          <option value="720p" selected>720p</option>
                          <option value="1080p">1080p</option>
                        </select>
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
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
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-duration-wrap seedance-duration-wrap">
                        <input type="number" id="seedanceDuration" class="video-director-select seedance-duration-input" min="4" max="15" step="1" value="5" aria-label="${window.__('Duración en segundos')}">
                        <span class="seedance-duration-unit">s</span>
                      </div>
                      <button type="button" class="video-director-btn-generate" id="seedancePromptSend" aria-label="${window.__('Producir la secuencia')}" data-state="production"><i class="aisc-ico aisc-ico--play"></i><span>${window.__('PRODUCIR')}</span></button>
                    </div>

                  </div>
                </div>
              </section>
            </main>

            <aside class="video-sidebar-console" aria-label="${window.__('Panel de producción')}">
              <div class="video-sidebar-tabs" role="tablist" aria-label="${window.__('Secciones del panel')}">
                <button type="button" class="video-sidebar-tab is-active" role="tab" id="videoSidebarTabRecursos" data-sidebar-tab="recursos" aria-selected="true" aria-controls="videoSidebarPanelRecursos">
                  <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i><span>${window.__('Recursos')}</span>
                </button>
                <button type="button" class="video-sidebar-tab" role="tab" id="videoSidebarTabCine" data-sidebar-tab="cinematografia" aria-selected="false" aria-controls="videoSidebarPanelCine">
                  <i class="aisc-ico aisc-ico--video" aria-hidden="true"></i><span>${window.__('Cinematografía')}</span>
                </button>
              </div>
              <div class="video-prompt-footer-card video-sidebar-card">
                <div class="video-prompt-footer-card-inner video-sidebar-inner">

                <div class="video-sidebar-panel is-active" data-sidebar-panel="recursos" role="tabpanel" id="videoSidebarPanelRecursos" aria-labelledby="videoSidebarTabRecursos">

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Contexto de producción')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('A qué campaña pertenece la secuencia, a quién le habla, y qué producciones o productos debe respetar la IA al producirla.')}</p>
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

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Frames Clave')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Ancla el inicio y/o final de la secuencia con una imagen. La IA construirá el arco narrativo entre ambas.')}</p>
                    <input type="file" id="seedanceFrameUpload" accept="image/jpeg,image/png,image/jpg,image/webp" style="display: none;" aria-hidden="true">
                    <div class="seedance-frames-grid">
                      <div class="seedance-frame-slot" data-frame="first" id="seedanceFirstFrameSlot" role="button" tabindex="0" aria-label="${window.__('Subir imagen de primer frame')}">
                        <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
                        <span class="seedance-frame-slot-label">First Frame</span>
                        <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
                      </div>
                      <div class="seedance-frame-slot" data-frame="last" id="seedanceLastFrameSlot" role="button" tabindex="0" aria-label="${window.__('Subir imagen de último frame')}">
                        <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
                        <span class="seedance-frame-slot-label">Last Frame</span>
                        <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
                      </div>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Referencias Multimodales')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Imágenes, videos y audios que la IA usa como inspiración. Mutuamente excluyentes con Frames Clave.')}</p>
                    <input type="file" id="seedanceRefImgUpload" accept="image/jpeg,image/png,image/jpg,image/webp" multiple style="display: none;" aria-hidden="true">
                    <input type="file" id="seedanceRefVidUpload" accept="video/mp4,video/quicktime,video/webm" multiple style="display: none;" aria-hidden="true">
                    <input type="file" id="seedanceRefAudUpload" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/mp4,audio/aac" multiple style="display: none;" aria-hidden="true">

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Imágenes')} <span class="seedance-ref-limit" id="seedanceRefImgCount">0 / 9</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefImg"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="seedanceRefImgList" aria-live="polite"></div>
                    </div>

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Videos')} <span class="seedance-ref-limit" id="seedanceRefVidCount">0 / 3 · ≤15s</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefVid"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="seedanceRefVidList" aria-live="polite"></div>
                    </div>

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Audios')} <span class="seedance-ref-limit" id="seedanceRefAudCount">0 / 3 · ≤15s</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefAud"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
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
                        <button type="button" class="seedance-audio-tile" data-audio-type="ambient"><i class="aisc-ico aisc-ico--wind" aria-hidden="true"></i><span>${window.__('Diegético')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="music"><i class="aisc-ico aisc-ico--music" aria-hidden="true"></i><span>${window.__('Música')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="voice"><i class="aisc-ico aisc-ico--microphone" aria-hidden="true"></i><span>${window.__('Voz')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="silence"><i class="aisc-ico aisc-ico--volume" aria-hidden="true"></i><span>${window.__('Silencio')}</span></button>
                      </div>
                    </div>
                  </div>

                </div>

                <div class="video-sidebar-panel" data-sidebar-panel="cinematografia" role="tabpanel" id="videoSidebarPanelCine" aria-labelledby="videoSidebarTabCine" hidden>

                  <div class="video-sidebar-section video-sidebar-cine video-cinematography-panel">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Dirección de fotografía')}</h3>
                      <div class="video-sidebar-section-actions">
                        <button type="button" class="video-sidebar-section-icon-btn" id="videoCineResetBtn" aria-label="${window.__('Restablecer cinematografía')}" title="${window.__('Restablecer todos los valores')}"><i class="aisc-ico aisc-ico--refresh"></i></button>
                      </div>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Cámara, movimiento, luz y mood. Si no sabes por dónde empezar, elige un Production Preset y se llena el resto.')}</p>
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
                      <button type="button" class="video-cine-tab is-active" role="tab" aria-selected="true" data-tab="movement"><i class="aisc-ico aisc-ico--move" aria-hidden="true"></i><span>${window.__('Movimiento')}</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="lighting"><i class="aisc-ico aisc-ico--idea" aria-hidden="true"></i><span>${window.__('Luz')}</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="mood"><i class="aisc-ico aisc-ico--palette" aria-hidden="true"></i><span>Mood</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="camera"><i class="aisc-ico aisc-ico--filter" aria-hidden="true"></i><span>${window.__('Avanzado')}</span></button>
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
              </div>
              <button type="button" class="video-sidebar-help" id="seedanceSidebarHelpBtn" aria-label="${window.__('Ayuda Seedance')}" title="${window.__('Ayuda Seedance')}">?</button>
              <div class="video-sidebar-help-popover" id="seedanceSidebarHelpPopover" role="dialog" aria-label="${window.__('Ayuda Seedance')}">
                <h4>${window.__('Seedance 2.0 — secuencias narrativas')}</h4>
                <p><strong>${window.__('Recursos')}</strong>${window.__(': el material que le entregas. Frames Clave ancla el inicio y el cierre; las Referencias Multimodales dan estilo, movimiento y vibe (hasta 9 imágenes, 3 videos y 3 audios). Frames y referencias no se combinan.')}</p>
                <p><strong>${window.__('Cinematografía')}</strong>${window.__(': cómo se ve. Cámara, movimiento, luz y mood no son parámetros de la API — se traducen a lenguaje de dirección dentro del prompt. Un Production Preset llena todo de una.')}</p>
                <p><strong>Audio</strong>${window.__(': Seedance genera el audio de la secuencia. Activarlo cuesta créditos extra pero devuelve un video listo para publicar.')}</p>
              </div>
            </aside>
          </div>

        </div>
      </div>
    `;
  }

  async init() {
    this.idleArea = this.container.querySelector('#videoCanvasIdle');
    this.statusArea = this.container.querySelector('#videoStatusArea');
    this.statusText = this.container.querySelector('#videoStatusText');
    this.statusSpinner = this.container.querySelector('#videoStatusSpinner');
    this.resultArea = this.container.querySelector('#videoResultArea');
    this.resultPlayer = this.container.querySelector('#videoResultPlayer');
    this.resultDownload = this.container.querySelector('#videoResultDownload');
    this.errorArea = this.container.querySelector('#videoErrorArea');
    this.errorText = this.container.querySelector('#videoErrorText');

    this.sendBtn = this.container.querySelector('#seedancePromptSend');
    this.promptInput = this.container.querySelector('#seedancePromptInput');
    this.aspectSelect = this.container.querySelector('#seedanceAspectRatio');

    // Botón PRODUCIR. No dispara nada mientras el endpoint de creación no
    // exista: startGeneration() explica qué falta, en el canvas.
    if (this.sendBtn && this.sendBtn.dataset.boundSeedanceSend !== '1') {
      this.sendBtn.dataset.boundSeedanceSend = '1';
      this.sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.startGeneration();
      });
    }
    if (this.promptInput) {
      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.startGeneration();
        }
      });
      this.promptInput.addEventListener('input', () => this.scheduleResizeDirectorBriefInput());
      this.promptInput.addEventListener('paste', () => this.scheduleResizeDirectorBriefInput());
    }

    // ── Pestañas del sidebar: Recursos | Cinematografía ──
    this.container.querySelectorAll('.video-sidebar-tab[data-sidebar-tab]').forEach((tab) => {
      if (tab.dataset.boundSidebarTab === '1') return;
      tab.dataset.boundSidebarTab = '1';
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const destino = tab.getAttribute('data-sidebar-tab');
        if (!destino) return;
        this.container.querySelectorAll('.video-sidebar-tab[data-sidebar-tab]').forEach((t) => {
          const activa = t === tab;
          t.classList.toggle('is-active', activa);
          t.setAttribute('aria-selected', activa ? 'true' : 'false');
        });
        this.container.querySelectorAll('.video-sidebar-panel[data-sidebar-panel]').forEach((p) => {
          const activo = p.getAttribute('data-sidebar-panel') === destino;
          p.classList.toggle('is-active', activo);
          p.hidden = !activo;
        });
        // Cada panel scrollea desde su propio inicio: cambiar de pestaña y
        // aterrizar a media altura del panel anterior desorienta.
        const inner = this.container.querySelector('.video-sidebar-inner');
        if (inner) inner.scrollTop = 0;
      });
    });

    // ── Frames Clave ──
    const frameInput = this.container.querySelector('#seedanceFrameUpload');
    if (frameInput && frameInput.dataset.boundFrame !== '1') {
      frameInput.dataset.boundFrame = '1';
      frameInput.addEventListener('change', (e) => this.onSeedanceFrameFileSelected(e));
    }
    this.container.querySelectorAll('.seedance-frame-slot[data-frame]').forEach((slotEl) => {
      if (slotEl.dataset.boundSlot === '1') return;
      slotEl.dataset.boundSlot = '1';
      const slot = slotEl.getAttribute('data-frame');
      const abrir = (e) => {
        // El botón de quitar vive dentro del slot: distinguir por el target,
        // si no, quitar el frame reabre el selector de archivos.
        const quitar = e.target.closest && e.target.closest('[data-frame-remove]');
        e.preventDefault();
        if (quitar) {
          e.stopPropagation();
          this.removeSeedanceFrame(quitar.getAttribute('data-frame-remove'));
          return;
        }
        this.openSeedanceFramePicker(slot);
      };
      slotEl.addEventListener('click', abrir);
      slotEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') abrir(e);
      });
    });

    // ── Referencias multimodales ──
    [
      { kind: 'image', btn: '#seedanceAddRefImg', input: '#seedanceRefImgUpload' },
      { kind: 'video', btn: '#seedanceAddRefVid', input: '#seedanceRefVidUpload' },
      { kind: 'audio', btn: '#seedanceAddRefAud', input: '#seedanceRefAudUpload' }
    ].forEach((g) => {
      const btn = this.container.querySelector(g.btn);
      if (btn && btn.dataset.boundRef !== '1') {
        btn.dataset.boundRef = '1';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openSeedanceRefPicker(g.kind);
        });
      }
      const input = this.container.querySelector(g.input);
      if (input && input.dataset.boundRef !== '1') {
        input.dataset.boundRef = '1';
        input.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files.length) await this.addSeedanceRefs(g.kind, files);
        });
      }
      const list = this.container.querySelector(
        g.kind === 'image' ? '#seedanceRefImgList' : g.kind === 'video' ? '#seedanceRefVidList' : '#seedanceRefAudList'
      );
      if (list && list.dataset.boundRemove !== '1') {
        list.dataset.boundRemove = '1';
        list.addEventListener('click', (e) => {
          const btnQuitar = e.target.closest('.seedance-ref-remove');
          if (!btnQuitar) return;
          e.preventDefault();
          const idx = parseInt(btnQuitar.getAttribute('data-ref-index'), 10);
          if (!Number.isNaN(idx)) this.removeSeedanceRef(btnQuitar.getAttribute('data-ref-kind'), idx);
        });
      }
    });

    // "+" del Director Console: atajo que enruta por tipo al grupo que toca.
    const consoleAdd = this.container.querySelector('#seedancePromptAdd');
    const consoleInput = this.container.querySelector('#seedanceImageUpload');
    if (consoleAdd && consoleInput && consoleAdd.dataset.boundAdd !== '1') {
      consoleAdd.dataset.boundAdd = '1';
      consoleAdd.addEventListener('click', (e) => {
        e.preventDefault();
        if (this._seedanceHasFrames()) {
          this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para añadir referencias.'));
          return;
        }
        consoleInput.click();
      });
      consoleInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;
        const imagenes = files.filter((f) => f.type.startsWith('image/'));
        const videos = files.filter((f) => f.type.startsWith('video/'));
        const sobrantes = files.length - imagenes.length - videos.length;
        if (sobrantes > 0) {
          this._seedanceNotify(window.__('{n} archivo(s) sin formato soportado aquí. Los audios se añaden desde el sidebar.', { n: sobrantes }));
        }
        if (imagenes.length) await this.addSeedanceRefs('image', imagenes);
        if (videos.length) await this.addSeedanceRefs('video', videos);
      });
    }

    // Chips junto al prompt: una sola delegación para todas las bajas.
    const chipsEl = this.container.querySelector('#seedanceElementsList');
    if (chipsEl && chipsEl.dataset.boundChips !== '1') {
      chipsEl.dataset.boundChips = '1';
      chipsEl.addEventListener('click', (e) => {
        const btnQuitar = e.target.closest('[data-attachment-remove]');
        if (!btnQuitar) return;
        e.preventDefault();
        this.removeSeedanceAttachment(btnQuitar.getAttribute('data-attachment-remove'));
      });
    }

    this.renderSeedanceFrames();
    this.renderSeedanceRefs();
    this.renderSeedanceAttachmentChips();

    // Contexto de marca ANTES del Stack de activos y de Escenas: ambos pintan
    // desde dbData.products, y si corren primero el carrusel nace diciendo
    // "no hay productos con imágenes" aunque los haya.
    // Contexto de marca: alimenta buildBrandContextForAPI() y el linaje de
    // system_ai_outputs. Los selects de campaña/audiencia son conceptuales
    // (opciones fijas en el HTML), no vienen de la BD.
    await this.loadBrandData();
    const campaignSelect = this.container.querySelector('#seedanceCampaignSelect');
    const audienceSelect = this.container.querySelector('#seedanceAudienceSelect');
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

    // ── Escenas: producciones previas ──
    const productionsBtn = this.container.querySelector('#videoProductionsBtn');
    const panelClose = this.container.querySelector('#videoProductionsPanelClose');
    if (productionsBtn && productionsBtn.dataset.boundProds !== '1') {
      productionsBtn.dataset.boundProds = '1';
      productionsBtn.addEventListener('click', (e) => { e.preventDefault(); this.openProductionsPanel(); });
    }
    if (panelClose && panelClose.dataset.boundProds !== '1') {
      panelClose.dataset.boundProds = '1';
      panelClose.addEventListener('click', (e) => { e.preventDefault(); this.closeProductionsPanel(); });
    }

    // ── Stack de activos ──
    const assetScope = this.container.querySelector('#videoAssetScope');
    const assetSelect = this.container.querySelector('#videoAssetSelect');
    if (assetScope && assetScope.dataset.boundAsset !== '1') {
      assetScope.dataset.boundAsset = '1';
      assetScope.addEventListener('change', () => {
        this.assetScope = assetScope.value;
        this.selectedAssetId = '';
        this.updateAssetStackScopeUI();
      });
    }
    if (assetSelect && assetSelect.dataset.boundAsset !== '1') {
      assetSelect.dataset.boundAsset = '1';
      assetSelect.addEventListener('change', () => {
        this.selectedAssetId = assetSelect.value || '';
        this.syncAssetSelectionToRefs();
      });
    }
    if (assetScope) this.assetScope = assetScope.value || 'product';
    this.updateAssetStackScopeUI();
    await this.loadVideoProductions();
    this.renderEscenasCarousel();

    // ── Cinematografía ──
    this.initCinematography();
    const resetCineBtn = this.container.querySelector('#videoCineResetBtn');
    if (resetCineBtn && resetCineBtn.dataset.boundReset !== '1') {
      resetCineBtn.dataset.boundReset = '1';
      resetCineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!confirm(window.__('¿Restablecer todos los valores de Cinematografía?'))) return;
        Object.keys(this.cinematography).forEach((k) => { this.cinematography[k] = ''; });
        // syncCinematographyToSelects() ya repinta los tiles.
        this.syncCinematographyToSelects();
        this.renderCinematographySelectedTags();
        this.renderDirectorVariables();
        const presetEl = this.container.querySelector('#videoCinePreset');
        if (presetEl) presetEl.value = '';
      });
    }

    // Seedance: toggle Audio + Web search (solo UI state, sin wiring backend aún)
    ['seedanceGenAudioToggle', 'seedanceWebSearchToggle'].forEach((id) => {
      const btn = this.container.querySelector('#' + id);
      if (!btn) return;
      // El estado inicial viene en aria-pressed desde el HTML; la clase la
      // pone el clic. Sincronizarlas al montar evita que un toggle encendido
      // de origen se vea distinto a uno que el usuario encendió.
      btn.classList.toggle('active', btn.getAttribute('aria-pressed') === 'true');
      if (btn.dataset.boundToggle === '1') return;
      btn.dataset.boundToggle = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!pressed));
        btn.classList.toggle('active', !pressed);
      });
    });
    // Seedance: botón de ayuda del sidebar
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
    // El storyboard de Seedance nace de tres renglones (rows="3"): si le
    // aplicamos el mínimo de una línea, el autoresize lo colapsa en cuanto
    // está vacío y el campo deja de pedir una secuencia.
    const minPx = ta.classList.contains('video-director-brief-input-large') ? 96 : 44;
    ta.style.height = '0px';
    const sh = ta.scrollHeight;
    const next = Math.min(Math.max(sh, minPx), maxPx);
    ta.style.height = `${next}px`;
    ta.style.overflowY = sh > maxPx ? 'auto' : 'hidden';
  }

  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      // Regla central de aislamiento: marca dentro de la org activa, sin fallback
      // cross-org a user_id (ver js/org-url.js resolveActiveBrandContainerId).
      const uid = this.userId || (await this.supabase.auth.getUser())?.data?.user?.id || null;
      return await window.resolveActiveBrandContainerId(this.supabase, this.organizationId, uid);
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
    const select = this.container.querySelector('#seedanceCampaignSelect');
    if (!select) return;
    if (this.selectedCampaignId && Array.from(select.options).some((o) => o.value === this.selectedCampaignId)) {
      select.value = this.selectedCampaignId;
    }
  }

  renderAudienceDropdown() {
    // Conceptual: opciones hardcoded en HTML, NO BD. Misma lógica que campañas.
    const select = this.container.querySelector('#seedanceAudienceSelect');
    if (!select) return;
    if (this.selectedAudienceId && Array.from(select.options).some((o) => o.value === this.selectedAudienceId)) {
      select.value = this.selectedAudienceId;
    }
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
   * Persiste el video de KIE en R2 (media.aismartcontent.io) via kie-output-persist:
   * el worker de ingesta lo descarga server-side — el video ya no pasa por el
   * browser ni por Supabase Storage. Devuelve URLs completas (los lectores hacen
   * pass-through cuando storage_path empieza con http).
   * @param {string} kieVideoUrl - URL del video devuelta por KIE (resultUrls[0])
   * @param {string} taskId - ID de la tarea KIE (para nombre de archivo)
   * @returns {{ publicUrl: string, storagePath: string } | null}
   */
  async downloadAndUploadKieVideo(kieVideoUrl, taskId) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session?.access_token) return null;

    this.showStatus(window.__('Guardando en tu cuenta…'), true);
    try {
      const res = await fetch('/.netlify/functions/kie-output-persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kie_url: kieVideoUrl, task_id: taskId, kind: 'video' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || window.__('Descarga fallida: {status}', { status: res.status }));
      }
      return { publicUrl: data.public_url || null, storagePath: data.storage_path };
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
   * Resuelve entity_id desde el activo elegido en el Stack, segun scope.
   * products.entity_id y services.entity_id son FK a brand_entities y dan el
   * linaje canonico al output. null si no hay activo o el scope no aplica.
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

  /**
   * Aviso al usuario. Un adjunto rechazado en silencio se lee como aceptado
   * y el error aparece 10 minutos despues, en KIE.
   */
  _seedanceNotify(message, type = 'warning') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, { type, duration: 5000 });
    } else if (window.alert) {
      window.alert(message);
    }
  }

  _seedanceHasFrames() {
    return !!(this.seedanceFrames.first || this.seedanceFrames.last);
  }

  _seedanceRefCount() {
    return ['image', 'video', 'audio']
      .reduce((n, kind) => n + (this.seedanceRefs[kind] || []).length, 0);
  }

  /**
   * Mide la duracion REAL leyendo los metadatos del archivo — ni el peso ni
   * el nombre dicen cuanto dura. Devuelve segundos, o null si el navegador
   * no pudo decodificarlo; en ese caso dejamos pasar el archivo a proposito:
   * bloquear por una medicion que fallo es peor que dejar que KIE lo
   * rechace con su propio mensaje.
   */
  _measureMediaSeconds(file, kind) {
    return new Promise((resolve) => {
      let url = null;
      let timer = null;
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (url) URL.revokeObjectURL(url);
        resolve(value);
      };
      timer = setTimeout(() => finish(null), 8000);
      try {
        url = URL.createObjectURL(file);
        const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
        el.preload = 'metadata';
        el.onloadedmetadata = () => {
          const d = Number(el.duration);
          finish(Number.isFinite(d) && d > 0 ? d : null);
        };
        el.onerror = () => finish(null);
        el.src = url;
      } catch (_) {
        finish(null);
      }
    });
  }

  /** Sube un adjunto y devuelve { url, storagePath }. Lanza si algo falla. */
  async _uploadSeedanceFile(file, folder) {
    if (!this.supabase || !this.supabase.storage) {
      throw new Error(window.__('Almacenamiento no disponible. Recarga la página y reintenta.'));
    }
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user?.id) throw new Error(window.__('Inicia sesión para subir referencias.'));
    const bucket = VideoView.SEEDANCE_STORAGE_BUCKET;
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/jpeg/, 'jpg');
    const storagePath = `seedance/${user.id}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(storagePath);
    const url = data?.publicUrl;
    if (!url) throw new Error(window.__('El archivo subió pero Storage no devolvió URL pública.'));
    return { url, storagePath };
  }

  /** Limpieza del bucket al quitar un adjunto. Fire-and-forget: no bloquea la UI. */
  _removeSeedanceStorage(storagePath) {
    if (!storagePath || !this.supabase?.storage) return;
    this.supabase.storage
      .from(VideoView.SEEDANCE_STORAGE_BUCKET)
      .remove([storagePath])
      .catch((err) => console.warn('[VideoView] limpieza de Storage falló', storagePath, err));
  }

  // ── Frames Clave ────────────────────────────────────────────────────────

  openSeedanceFramePicker(slot) {
    if (this._seedanceRefCount() > 0) {
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita las referencias para anclar frames.'));
      return;
    }
    const input = this.container.querySelector('#seedanceFrameUpload');
    if (!input) return;
    this._pendingFrameSlot = slot;
    input.click();
  }

  async onSeedanceFrameFileSelected(e) {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    const slot = this._pendingFrameSlot;
    this._pendingFrameSlot = null;
    if (!file || !slot) return;
    if (!file.type.startsWith('image/')) {
      this._seedanceNotify(window.__('Un frame clave es una imagen (JPG, PNG o WebP).'));
      return;
    }
    const label = slot === 'first' ? 'First Frame' : 'Last Frame';
    try {
      const subido = await this._uploadSeedanceFile(file, 'frames');
      const previo = this.seedanceFrames[slot];
      if (previo) this._removeSeedanceStorage(previo.storagePath);
      this.seedanceFrames[slot] = subido;
      this.renderSeedanceFrames();
      this.renderSeedanceAttachmentChips();
    } catch (err) {
      console.error('VideoView frame upload:', err);
      this._seedanceNotify(window.__('No se pudo subir {label}: ', { label }) + (err.message || ''), 'error');
    }
  }

  removeSeedanceFrame(slot) {
    const frame = this.seedanceFrames[slot];
    if (!frame) return;
    this._removeSeedanceStorage(frame.storagePath);
    this.seedanceFrames[slot] = null;
    this.renderSeedanceFrames();
    this.renderSeedanceAttachmentChips();
  }

  renderSeedanceFrames() {
    [['first', '#seedanceFirstFrameSlot', 'First Frame'], ['last', '#seedanceLastFrameSlot', 'Last Frame']]
      .forEach(([slot, sel, label]) => {
        const el = this.container.querySelector(sel);
        if (!el) return;
        const frame = this.seedanceFrames[slot];
        if (!frame) {
          el.classList.remove('has-image');
          el.style.backgroundImage = '';
          el.innerHTML = `
            <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
            <span class="seedance-frame-slot-label">${label}</span>
            <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
          `;
          return;
        }
        el.classList.add('has-image');
        el.style.backgroundImage = `url("${this.escapeHtml(frame.url)}")`;
        el.innerHTML = `
          <span class="seedance-frame-slot-label">${label}</span>
          <button type="button" class="seedance-frame-slot-remove" data-frame-remove="${slot}" aria-label="${window.__('Quitar {label}', { label })}">&times;</button>
        `;
      });
  }

  // ── Referencias multimodales ────────────────────────────────────────────

  openSeedanceRefPicker(kind) {
    if (this._seedanceHasFrames()) {
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para añadir referencias.'));
      return;
    }
    const inputs = { image: '#seedanceRefImgUpload', video: '#seedanceRefVidUpload', audio: '#seedanceRefAudUpload' };
    const input = this.container.querySelector(inputs[kind]);
    if (input) input.click();
  }

  /**
   * Valida (tipo, cupo y duracion medida), sube y registra cada archivo.
   * Secuencial a proposito: subir 9 imagenes en paralelo satura la conexion
   * y deja huerfanos en el bucket si el usuario se va a mitad.
   */
  async addSeedanceRefs(kind, files) {
    if (this._seedanceHasFrames()) {
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para añadir referencias.'));
      return;
    }
    const limite = VideoView.SEEDANCE_REF_LIMITS[kind];
    const libre = Math.max(0, limite - (this.seedanceRefs[kind] || []).length);
    if (libre === 0) {
      this._seedanceNotify(window.__('Ya tienes el máximo de {limite} en este grupo. Quita una para añadir otra.', { limite }));
      return;
    }
    const usables = files.slice(0, libre);
    if (files.length > libre) {
      this._seedanceNotify(window.__('Solo caben {libre} más en este grupo: se ignoran {sobran}.', { libre, sobran: files.length - libre }));
    }

    for (const file of usables) {
      let seconds = null;
      if (kind === 'video' || kind === 'audio') {
        seconds = await this._measureMediaSeconds(file, kind);
        const tope = VideoView.SEEDANCE_REF_MAX_SECONDS;
        if (seconds != null && seconds > tope) {
          this._seedanceNotify(window.__('"{name}" dura {seconds}s y el tope es {tope}s. Recórtalo antes de subirlo.', {
            name: file.name, seconds: Math.round(seconds), tope
          }));
          continue;
        }
      }
      try {
        const subido = await this._uploadSeedanceFile(file, `${kind}s`);
        this.seedanceRefs[kind].push({ name: file.name, seconds, origen: 'manual', ...subido });
        this.renderSeedanceRefs();
        this.renderSeedanceAttachmentChips();
      } catch (err) {
        console.error('VideoView ref upload:', err);
        this._seedanceNotify(window.__('No se pudo subir "{name}": ', { name: file.name }) + (err.message || ''), 'error');
      }
    }
  }

  removeSeedanceRef(kind, index) {
    const item = (this.seedanceRefs[kind] || [])[index];
    if (!item) return;
    // Solo las subidas por el usuario viven en nuestro bucket. Las que vienen
    // de una producción o de un producto son URLs ajenas: borrarlas del
    // Storage se llevaría por delante la producción original.
    if (item.origen === 'manual') this._removeSeedanceStorage(item.storagePath);
    this.seedanceRefs[kind].splice(index, 1);
    // Quitar el chip también tiene que apagar su origen; si no, la tarjeta
    // sigue marcada en el carrusel y el próximo sync la vuelve a meter.
    if (item.origen === 'produccion' && item._productionId != null) {
      this.selectedProductionIds.delete(item._productionId);
      this.renderEscenasCarousel();
      this.renderProductionsGallery();
    }
    if (item.origen === 'activo') {
      this.selectedAssetId = '';
      const assetSelect = this.container.querySelector('#videoAssetSelect');
      if (assetSelect) assetSelect.value = '';
      this.renderAssetProductsCarousel();
    }
    this.renderSeedanceRefs();
    this.renderSeedanceAttachmentChips();
  }

  // ── Escenas: producciones previas como material de referencia ───────────

  getPublicUrlFromStorage(bucketName, filePath) {
    // R2 (media.aismartcontent.io): storage_path puede ser URL completa -> pass-through
    if (typeof filePath === 'string' && /^(https?:|\/\/)/i.test(filePath.trim())) return filePath.trim();
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

  /** Pinta una lista de producciones (carrusel del sidebar o galería del panel). */
  _renderProduccionesEn(selector, claseItem, claseThumb, claseVacio, textoVacio) {
    const cont = this.container.querySelector(selector);
    if (!cont) return;
    if (this.videoProductions.length === 0) {
      cont.innerHTML = `<p class="${claseVacio}">${textoVacio}</p>`;
      return;
    }
    cont.innerHTML = this.videoProductions.map((p) => {
      const seleccionada = this.selectedProductionIds.has(p.id);
      const url = this.escapeHtml(p.media_url || '');
      const esImagen = p.isImage && !p.isVideo;
      const thumb = esImagen
        ? `<img class="${claseThumb} ${claseThumb}-img" src="${url}" alt="" loading="lazy" decoding="async">`
        : `<video class="${claseThumb}" src="${url}" preload="metadata" muted playsinline crossorigin="anonymous"></video>`;
      return `
        <div class="${claseItem} ${seleccionada ? 'is-selected' : ''}" data-id="${this.escapeHtml(p.id)}" role="button" tabindex="0" aria-pressed="${seleccionada}" aria-label="${window.__('Seleccionar producción')}">
          <div class="${claseThumb}-wrap">${thumb}</div>
        </div>`;
    }).join('');
    cont.querySelectorAll('.' + claseItem).forEach((el) => {
      el.addEventListener('click', () => this.toggleProduccion(el.dataset.id));
    });
  }

  renderEscenasCarousel() {
    this._renderProduccionesEn(
      '#videoEscenasCarousel', 'video-escena-item', 'video-escena-thumb', 'video-escenas-empty',
      window.__('Aún no hay producciones. Las producciones de tus flows aparecerán aquí.')
    );
  }

  renderProductionsGallery() {
    this._renderProduccionesEn(
      '#videoProductionsGallery', 'video-production-item', 'video-production-thumb', 'video-productions-empty',
      window.__('Aún no hay producciones. Las producciones de tus flows aparecerán aquí.')
    );
  }

  toggleProduccion(id) {
    if (id == null) return;
    if (this.selectedProductionIds.has(id)) {
      this.selectedProductionIds.delete(id);
    } else {
      if (this._seedanceHasFrames()) {
        this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para usar una escena como referencia.'));
        return;
      }
      this.selectedProductionIds.add(id);
    }
    this.syncProductionSelectionToRefs();
    this.renderEscenasCarousel();
    this.renderProductionsGallery();
  }

  /**
   * Vuelca las producciones elegidas en las referencias multimodales — el
   * mismo cupo que las subidas a mano, porque el límite es de KIE y no le
   * importa de dónde salió cada archivo. Si una no cabe, se deselecciona y
   * se avisa: dejarla marcada sin estar en el payload sería mentir.
   */
  syncProductionSelectionToRefs() {
    ['image', 'video'].forEach((kind) => {
      this.seedanceRefs[kind] = this.seedanceRefs[kind].filter((r) => r.origen !== 'produccion');
    });
    const rechazadas = [];
    Array.from(this.selectedProductionIds).forEach((id) => {
      const p = this.videoProductions.find((prod) => String(prod.id) === String(id));
      if (!p || !p.media_url) return;
      const kind = p.isVideo ? 'video' : 'image';
      if (this.seedanceRefs[kind].length >= VideoView.SEEDANCE_REF_LIMITS[kind]) {
        this.selectedProductionIds.delete(id);
        rechazadas.push(kind);
        return;
      }
      this.seedanceRefs[kind].push({
        name: `${window.__('Escena')} ${String(p.id).slice(0, 8)}`,
        url: p.media_url,
        storagePath: null,
        seconds: null,
        origen: 'produccion',
        _productionId: p.id
      });
    });
    if (rechazadas.length) {
      this._seedanceNotify(window.__('{n} escena(s) no caben: el grupo ya está en su máximo. Quita una referencia y vuelve a intentar.', { n: rechazadas.length }));
    }
    this.renderSeedanceRefs();
    this.renderSeedanceAttachmentChips();
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
    const btn = this.container.querySelector('#videoProductionsBtn');
    if (btn && typeof btn.focus === 'function') btn.focus();
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    this.renderEscenasCarousel();
  }

  // ── Stack de activos: el producto que el video no debe alterar ──────────

  /** Muestra carrusel de productos u otro scope (dropdown). */
  updateAssetStackScopeUI() {
    const block = this.container.querySelector('#videoAssetStackBlock');
    const carouselWrap = this.container.querySelector('#videoAssetProductsCarouselWrap');
    const assetSelect = this.container.querySelector('#videoAssetSelect');
    const scope = this.assetScope || 'product';
    if (block) block.setAttribute('data-scope', scope);
    const esProducto = scope === 'product';
    if (carouselWrap) carouselWrap.style.display = esProducto ? 'block' : 'none';
    if (assetSelect) assetSelect.style.display = esProducto ? 'none' : 'block';
    if (esProducto) this.renderAssetProductsCarousel();
    else this.renderAssetDropdown();
    this.syncAssetSelectionToRefs();
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
    const actual = select.value || this.selectedAssetId;
    select.innerHTML = `<option value="">${window.__('— Ninguno')}</option>`
      + items.map((i) => `<option value="${this.escapeHtml(i.id)}">${this.escapeHtml((i.name || '').slice(0, 50))}</option>`).join('');
    if (actual && items.some((i) => String(i.id) === String(actual))) select.value = actual;
    else this.selectedAssetId = '';
  }

  /** Carrusel de productos con imagen. Uno solo a la vez: es un bloqueo, no una galería. */
  renderAssetProductsCarousel() {
    const carousel = this.container.querySelector('#videoAssetProductsCarousel');
    if (!carousel) return;
    const products = (this.dbData.products || []).filter((p) => Array.isArray(p.image_urls) && p.image_urls.length > 0);
    if (products.length === 0) {
      carousel.innerHTML = `<p class="video-asset-products-empty">${window.__('No hay productos con imágenes.')}</p>`;
      return;
    }
    carousel.innerHTML = products.map((p) => {
      const seleccionado = String(this.selectedAssetId) === String(p.id);
      return `
        <div class="video-asset-product-item ${seleccionado ? 'is-selected' : ''}" data-id="${this.escapeHtml(p.id)}" role="button" tabindex="0" aria-pressed="${seleccionado}" aria-label="${window.__('Seleccionar producto')}">
          <div class="video-asset-product-thumb-wrap"><img class="video-asset-product-thumb" src="${this.escapeHtml(p.image_urls[0] || '')}" alt="" loading="lazy"></div>
        </div>`;
    }).join('');
    carousel.querySelectorAll('.video-asset-product-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        this.selectedAssetId = String(this.selectedAssetId) === String(id) ? '' : id;
        this.renderAssetProductsCarousel();
        this.syncAssetSelectionToRefs();
      });
    });
  }

  /**
   * El activo elegido entra como referencia de imagen marcada con `lock`.
   * No es inspiración: es la instrucción de que el producto NO cambie. Ocupa
   * cupo igual, porque para KIE es una imagen de referencia más.
   */
  syncAssetSelectionToRefs() {
    this.seedanceRefs.image = this.seedanceRefs.image.filter((r) => r.origen !== 'activo');
    const scope = this.assetScope || 'product';
    if (scope !== 'product' || !this.selectedAssetId) {
      this.renderSeedanceRefs();
      this.renderSeedanceAttachmentChips();
      return;
    }
    if (this._seedanceHasFrames()) {
      this.selectedAssetId = '';
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para bloquear un producto.'));
      this.renderAssetProductsCarousel();
      this.renderSeedanceRefs();
      this.renderSeedanceAttachmentChips();
      return;
    }
    const product = (this.dbData.products || []).find((p) => String(p.id) === String(this.selectedAssetId));
    const urls = (product && Array.isArray(product.image_urls) ? product.image_urls : []).filter(Boolean);
    const libre = VideoView.SEEDANCE_REF_LIMITS.image - this.seedanceRefs.image.length;
    if (urls.length && libre <= 0) {
      this.selectedAssetId = '';
      this._seedanceNotify(window.__('No cabe el producto: el grupo de imágenes ya está en su máximo.'));
      this.renderAssetProductsCarousel();
    } else {
      urls.slice(0, Math.max(0, libre)).forEach((url) => {
        this.seedanceRefs.image.push({
          name: product.nombre_producto || window.__('Producto'),
          url,
          storagePath: null,
          seconds: null,
          origen: 'activo',
          lock: true,
          _assetId: product.id
        });
      });
    }
    this.renderSeedanceRefs();
    this.renderSeedanceAttachmentChips();
  }

  renderSeedanceRefs() {
    const tope = VideoView.SEEDANCE_REF_MAX_SECONDS;
    const grupos = [
      { kind: 'image', list: '#seedanceRefImgList', count: '#seedanceRefImgCount', sufijo: '', icono: 'aisc-ico--image' },
      { kind: 'video', list: '#seedanceRefVidList', count: '#seedanceRefVidCount', sufijo: ` · ≤${tope}s`, icono: 'aisc-ico--film' },
      { kind: 'audio', list: '#seedanceRefAudList', count: '#seedanceRefAudCount', sufijo: ` · ≤${tope}s`, icono: 'aisc-ico--music' }
    ];
    grupos.forEach((g) => {
      const items = this.seedanceRefs[g.kind] || [];
      const countEl = this.container.querySelector(g.count);
      if (countEl) countEl.textContent = `${items.length} / ${VideoView.SEEDANCE_REF_LIMITS[g.kind]}${g.sufijo}`;
      const listEl = this.container.querySelector(g.list);
      if (!listEl) return;
      listEl.innerHTML = items.map((item, idx) => {
        const nombre = this.escapeHtml(item.name || g.kind);
        const dur = item.seconds != null ? ` · ${Math.round(item.seconds)}s` : '';
        const cuerpo = g.kind === 'image'
          ? `<img class="seedance-ref-thumb" src="${this.escapeHtml(item.url)}" alt="" loading="lazy">`
          : `<i class="aisc-ico ${g.icono}" aria-hidden="true"></i><span class="seedance-ref-name">${nombre}${dur}</span>`;
        // Una referencia de producto NO es inspiración: es la instrucción de
        // que eso no cambie. Sin distintivo, en la fila se ve idéntica a una
        // imagen de estilo y el usuario no sabe cuál está bloqueando.
        const candado = item.lock
          ? `<span class="seedance-ref-lock" aria-hidden="true" title="${window.__('Bloqueo de producto')}"><i class="aisc-ico aisc-ico--bookmark"></i></span>`
          : '';
        const titulo = item.lock
          ? `${nombre}${dur} — ${window.__('bloqueo de producto')}`
          : `${nombre}${dur}`;
        return `<span class="seedance-ref-item${item.lock ? ' is-lock' : ''}" title="${titulo}">${cuerpo}${candado}<button type="button" class="seedance-ref-remove" data-ref-kind="${g.kind}" data-ref-index="${idx}" aria-label="${window.__('Quitar {name}', { name: nombre })}">&times;</button></span>`;
      }).join('');
    });
  }

  /** Fila de chips junto al prompt: lo adjunto, a la vista, sin abrir el sidebar. */
  renderSeedanceAttachmentChips() {
    const listEl = this.container.querySelector('#seedanceElementsList');
    if (!listEl) return;
    const chips = [];
    if (this.seedanceFrames.first) chips.push({ label: 'First Frame', url: this.seedanceFrames.first.url, quitar: 'frame:first', esImagen: true });
    if (this.seedanceFrames.last) chips.push({ label: 'Last Frame', url: this.seedanceFrames.last.url, quitar: 'frame:last', esImagen: true });
    ['image', 'video', 'audio'].forEach((kind) => {
      (this.seedanceRefs[kind] || []).forEach((item, idx) => {
        chips.push({ label: item.name || kind, url: item.url, quitar: `ref:${kind}:${idx}`, esImagen: kind === 'image' });
      });
    });

    if (chips.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      this.scheduleResizeDirectorBriefInput();
      return;
    }
    listEl.style.display = 'flex';
    listEl.innerHTML = chips.map((c) => {
      const etiqueta = this.escapeHtml(c.label);
      const cuerpo = c.esImagen
        ? `<span class="video-attachment-thumbs"><span class="video-attachment-thumb-wrap"><img class="video-attachment-thumb" src="${this.escapeHtml(c.url)}" alt="" loading="lazy"></span></span>`
        : `<span class="video-attachment-video-label">${etiqueta}</span>`;
      return `<span class="video-attachment-chip" title="${etiqueta}">${cuerpo}<button type="button" class="video-attachment-remove" data-attachment-remove="${c.quitar}" aria-label="${window.__('Quitar {name}', { name: etiqueta })}">&times;</button></span>`;
    }).join('');
    this.scheduleResizeDirectorBriefInput();
  }

  /** Traduce el data-attachment-remove del chip a la baja correspondiente. */
  removeSeedanceAttachment(token) {
    const partes = String(token || '').split(':');
    if (partes[0] === 'frame') {
      this.removeSeedanceFrame(partes[1]);
    } else if (partes[0] === 'ref') {
      const idx = parseInt(partes[2], 10);
      if (!Number.isNaN(idx)) this.removeSeedanceRef(partes[1], idx);
    }
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
      shotType: 'aisc-ico aisc-ico--video',
      lens: 'aisc-ico aisc-ico--camera',
      framing: 'aisc-ico aisc-ico--crop',
      cameraMovement: 'aisc-ico aisc-ico--move',
      motionSpeed: 'aisc-ico aisc-ico--dashboard',
      motionIntensity: 'aisc-ico aisc-ico--zap',
      lightType: 'aisc-ico aisc-ico--idea',
      contrastLevel: 'aisc-ico aisc-ico--moon',
      temperature: 'fa-temperature-three-quarters',
      tone: 'aisc-ico aisc-ico--palette',
      colorGrade: 'aisc-ico aisc-ico--palette',
      colorTemp: 'aisc-ico aisc-ico--palette',
      energyLevel: 'aisc-ico aisc-ico--fire'
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
      'Slow Push In': 'aisc-ico aisc-ico--minimize',
      'Slow Pull Out': 'aisc-ico aisc-ico--expand',
      'Dolly Left': 'aisc-ico aisc-ico--arrow-left',
      'Dolly Right': 'aisc-ico aisc-ico--arrow-right',
      'Orbit': 'aisc-ico aisc-ico--refresh',
      '360° Rotation': 'aisc-ico aisc-ico--refresh',
      'Handheld': 'aisc-ico aisc-ico--help',
      'Tracking': 'fa-route',
      'FPV': 'fa-helicopter',

      // Motion speed / intensity (escala visual)
      'Subtle': 'aisc-ico aisc-ico--circle',
      'Moderate': 'aisc-ico aisc-ico--circle',
      'Dynamic': 'aisc-ico aisc-ico--zap',
      'Aggressive': 'aisc-ico aisc-ico--fire',

      // Lighting type
      'Soft diffused': 'aisc-ico aisc-ico--cloud',
      'Hard contrast': 'fa-mountain-sun',
      'Rim light': 'aisc-ico aisc-ico--moon',
      'Backlit silhouette': 'aisc-ico aisc-ico--user-slash',
      'Studio commercial': 'aisc-ico aisc-ico--store',
      'Natural daylight': 'aisc-ico aisc-ico--sun',
      'Dramatic spotlight': 'aisc-ico aisc-ico--goal',

      // Contrast
      'Low': 'aisc-ico aisc-ico--loader',
      'Medium': 'aisc-ico aisc-ico--moon',
      'High': 'aisc-ico aisc-ico--circle',
      'Ultra contrast': 'fa-circle-radiation',

      // Temperature
      'Neutral': 'aisc-ico aisc-ico--circle',
      'Warm': 'aisc-ico aisc-ico--fire',
      'Cold': 'fa-snowflake',

      // Tone / Mood
      'Clean commercial': 'aisc-ico aisc-ico--eraser',
      'Cinematic dramatic': 'aisc-ico aisc-ico--characters',
      'Hyperreal product': 'aisc-ico aisc-ico--product',
      'Minimal luxury': 'fa-gem',
      'Dark premium': 'aisc-ico aisc-ico--moon',
      'Bright energetic': 'aisc-ico aisc-ico--zap',
      'Editorial fashion': 'aisc-ico aisc-ico--book',
      'Documentary': 'aisc-ico aisc-ico--camera',

      // Color grade / temp
      'High saturation': 'aisc-ico aisc-ico--palette',
      'Muted tones': 'aisc-ico aisc-ico--circle',

      // Energy level
      'Peak': 'aisc-ico aisc-ico--fire'
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
    // Registro de repintados: syncCinematographyToSelects() los llama tras
    // asignar valores por código (un Production Preset, el reset), porque
    // esa asignación no dispara 'change' y los tiles se quedarían mudos.
    this._cineTileRenderers = [];
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
      const fallbackIcon = FALLBACK_ICONS[key] || 'aisc-ico aisc-ico--circle';
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
      this._cineTileRenderers.push(renderTiles);
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
    // Los <select> son el modelo, pero lo que el usuario MIRA son los tiles.
    // Asignar .value por código no dispara 'change', así que sin este repintado
    // elegir un Production Preset llenaba los selects y no marcaba un solo
    // tile: la pantalla decía "ninguno" mientras el estado ya estaba puesto.
    this.repaintCinematographyTiles();
  }

  /** Repinta los grids de tiles desde el valor actual de su <select> espejo. */
  repaintCinematographyTiles() {
    (this._cineTileRenderers || []).forEach((repintar) => repintar());
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
  /**
   * Lee los controles del Director Console y del sidebar de Seedance y los
   * deja en el shape que espera la funcion de creacion.
   *
   * OJO al cablear: esto es lo que la UI SABE hoy, no el contrato final de
   * KIE. Los nombres de campo (first_frame_url, reference_images…) son
   * nuestros; al escribir seedance-video-create.js hay que mapearlos a los
   * que KIE reconoce — un campo que KIE no entiende lo ignora en silencio.
   */
  buildSeedancePayload() {
    const val = (sel, fallback) => {
      const el = this.container.querySelector(sel);
      return el && el.value ? String(el.value) : fallback;
    };
    const pressed = (sel) => {
      const el = this.container.querySelector(sel);
      return el ? el.getAttribute('aria-pressed') === 'true' : false;
    };
    const checked = (sel) => {
      const el = this.container.querySelector(sel);
      return !!(el && el.checked);
    };
    const audioTile = this.container.querySelector('.seedance-audio-tile.is-active');

    return {
      action: 'createTask',
      prompt: (this.promptInput && this.promptInput.value) ? this.promptInput.value.trim() : '',
      duration: val('#seedanceDuration', '5'),
      resolution: val('#seedanceResolution', '720p'),
      aspect_ratio: val('#seedanceAspectRatio', '16:9'),
      generate_audio: checked('#seedanceGenerateAudio') || pressed('#seedanceGenAudioToggle'),
      audio_type: audioTile ? audioTile.getAttribute('data-audio-type') : null,
      web_search: pressed('#seedanceWebSearchToggle'),
      first_frame_url: this.seedanceFrames.first?.url || null,
      last_frame_url: this.seedanceFrames.last?.url || null,
      reference_images: this.seedanceRefs.image.map((r) => r.url),
      // Subconjunto de reference_images que NO debe alterarse (Stack de
      // activos). Van ademas en reference_images porque para KIE ocupan
      // cupo como cualquier otra imagen; el lock es una instruccion del
      // prompt, no un campo aparte de la API.
      product_lock_urls: this.seedanceRefs.image.filter((r) => r.lock).map((r) => r.url),
      reference_videos: this.seedanceRefs.video.map((r) => r.url),
      reference_audios: this.seedanceRefs.audio.map((r) => r.url),
      direction: {
        pacing: val('#seedancePacing', ''),
        arc: val('#seedanceArc', ''),
        transitions: val('#seedanceTransitions', ''),
        mood: val('#seedanceMood', ''),
        realism: val('#seedanceRealism', '')
      },
      // Dirección de fotografía de la pestaña Cinematografía. No son params
      // de KIE: al cablear el backend van al cocinado del prompt (el mismo
      // buildCinematographyNarrative que ya usa openai-cine-prompt), no al
      // body de la tarea.
      cinematography: { ...this.cinematography },
      campaign: this.selectedCampaignId || null,
      audience: this.selectedAudienceId || null,
      brand_context: this.buildBrandContextForAPI(),
      organization_id: this.organizationId || null,
      openai_input_tokens: this._cinePromptTokens?.input || 0,
      openai_output_tokens: this._cinePromptTokens?.output || 0,
      openai_model: this._cinePromptTokens?.model || 'gpt-4o-mini'
    };
  }

  /**
   * Dispara la produccion. Mientras SEEDANCE_BACKEND_READY sea false no hay
   * a quien disparar: se lo dice al usuario en el canvas en vez de pegarle a
   * un endpoint inexistente (un 404 devolveria HTML y el error seria opaco).
   *
   * Al desplegar functions/seedance-video-create.js queda por escribir solo
   * el POST: la respuesta trae taskId y de ahi en adelante el camino ya
   * existe — saveSystemAIOutput() y pollTask(taskId), que resuelven guardado
   * en R2, cobro de creditos y render del resultado.
   */
  async startGeneration() {
    const payload = this.buildSeedancePayload();

    if (!payload.prompt) {
      this.showError(window.__('Escribe primero el storyboard: qué pasa en la apertura, en el desarrollo y en el cierre.'));
      return;
    }
    if (!this.organizationId) {
      this.showError(window.__('Selecciona una organización para producir videos.'));
      return;
    }
    if (!VideoView.SEEDANCE_BACKEND_READY) {
      this.showError(window.__('Seedance 2.0 todavía no está conectado: falta desplegar la función de creación de tarea. El resto del camino (guardado, créditos y resultado) ya está listo y se enciende con ese despliegue.'));
      return;
    }

    this.showError(window.__('Seedance 2.0 marcado como listo pero sin POST de creación implementado. Completa startGeneration() antes de activar el flag.'));
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
    const statusUrl = `${VideoView.KIE_TASK_STATUS_API}?taskId=${encodeURIComponent(taskId)}`;
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

        this.showStatus(window.__('Generando video (Seedance 2.0). Esto puede tardar unos minutos…'), true);
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
