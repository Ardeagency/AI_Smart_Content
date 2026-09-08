/**
 * ImageView — página de generación de IMAGEN con nano-banana-pro (vía KIE).
 *
 * Hermana de VideoView: mismo esqueleto (canvas + consola abajo + sidebar de
 * dos pestañas) y las mismas piezas de contexto de marca, Escenas y Stack de
 * activos. Lo que cambia es lo que no existe en una foto:
 *
 *  - Fuera Frames Clave (no hay arco entre un inicio y un final), fuera las
 *    referencias de video y audio, fuera Audio & Atmósfera, y fuera del panel
 *    de dirección todo lo que es movimiento (cámara, pacing, transiciones).
 *  - Entra Fotografía: profundidad de campo y fondo, que en video no se
 *    controlan por separado y en una imagen son media dirección.
 *
 * A diferencia de /video, esta página SÍ produce: functions/kie-image-create.js
 * existe y devuelve un taskId. De ahí en adelante el camino es el mismo que ya
 * usaban las ediciones de Studio — polling con kling-video-status (poller
 * genérico de KIE, el nombre es histórico), persistencia en R2 vía
 * kie-output-persist, cobro real con kie-task-finalize (kind 'image_generated')
 * y registro en system_ai_outputs.
 *
 * Los topes de referencias los promete el sidebar y los aplica el código: si
 * cambian, cambian en los dos sitios Y en kie-image-create.js. Un límite que
 * la UI anuncia y nadie aplica se paga en el error de la API, cuando el
 * usuario ya subió los archivos.
 *
 * Las reglas del panel están cubiertas por test/image-panel.test.js.
 */
class ImageView extends BaseView {
  static documentTitle = 'Imagen';

  /** POST: crear tarea de generación en KIE. */
  static get IMAGE_CREATE_API() {
    return '/.netlify/functions/kie-image-create';
  }
  /**
   * GET: estado de la tarea. El archivo conserva el nombre `kling-video-status`
   * por historia, pero es el poller genérico de cualquier taskId de kie.ai
   * (lo comparten Studio en js/living.js y VideoView). No renombrar sin migrar
   * a los tres.
   */
  static get KIE_TASK_STATUS_API() {
    return '/.netlify/functions/kling-video-status';
  }
  /**
   * Cupo de referencias visuales. Es un tope NUESTRO, conservador: KIE no
   * documenta el máximo de `image_input` y un rechazo llega cuando el usuario
   * ya subió los archivos. Debe coincidir con MAX_REFERENCE_IMAGES en
   * functions/kie-image-create.js.
   */
  static get IMAGE_REF_LIMIT() { return 6; }
  /**
   * Cuántas imágenes del producto entran como bloqueo. Dos bastan para fijar
   * la identidad del objeto; meter las cuatro que guarda el catálogo se comería
   * el cupo entero con un solo producto.
   */
  static get IMAGE_PRODUCT_LOCK_IMAGES() { return 2; }
  /** Bucket donde viven las referencias subidas a mano. */
  static get IMAGE_STORAGE_BUCKET() { return 'production-outputs'; }
  /** Doc KIE: empezar polling 2-3s. Una imagen no tarda lo que un video: 6 min de techo. */
  static get POLL_INTERVAL_MS() { return 3000; }
  static get POLL_MAX_DURATION_MS() { return 6 * 60 * 1000; }
  /** Tope del textarea del brief (px); no debe comerse el canvas. */
  static get BRIEF_MAX_HEIGHT_PX() { return 200; }
  /** Tope adicional como fracción del alto de ventana (gana el menor). */
  static get BRIEF_MAX_VIEWPORT_FRAC() { return 0.26; }

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
    // Referencias visuales: [{ name, url, storagePath, origen, lock }].
    // `origen` distingue de dónde salió cada una — 'manual' (subida por el
    // usuario), 'produccion' (elegida en Escenas) o 'activo' (producto del
    // Stack). Importa porque solo las manuales viven en nuestro bucket y solo
    // esas se borran al quitarlas; las otras son URLs que ya existían.
    this.imageRefs = [];
    // Producciones previas (Escenas) y selección activa.
    this.imageProductions = [];
    this.selectedProductionIds = new Set();
    // Stack de activos: qué producto/servicio/entidad debe respetar la imagen.
    this.assetScope = 'product';
    this.selectedAssetId = '';
    // Dirección de fotografía (pestaña Fotografía). No son params de la API:
    // se traducen a lenguaje de dirección dentro del prompt, server-side.
    this.photography = {
      preset: '',
      shotType: '',
      lens: '',
      framing: '',
      depthOfField: '',
      backdrop: '',
      lightType: '',
      contrastLevel: '',
      temperature: '',
      tone: '',
      colorGrade: '',
      energyLevel: ''
    };
    // Tokens del último prompt cocinado — van al finalize para cobrar el costo
    // real (KIE + OpenAI + markup) en vez de un estimado.
    this._promptTokens = null;
    this._lastKieOutputId = null;
    this._generating = false;
  }

  /**
   * Presets de producción. Son plantillas de prompt, no params de la API:
   * llenan de una todos los campos del panel.
   */
  static get PHOTOGRAPHY_PRESETS() {
    return {
      '': { label: 'None' },
      'product-hero': { label: 'Product Hero', shotType: 'Hero Product Frame', lens: '50mm (Balanced)', framing: 'Centered', depthOfField: 'Shallow depth', backdrop: 'Seamless studio', lightType: 'Studio commercial', contrastLevel: 'Medium', temperature: 'Neutral', tone: 'Clean commercial', colorGrade: 'Neutral', energyLevel: 'Moderate' },
      'luxury-still': { label: 'Luxury Still', shotType: 'Close-up', lens: '85mm (Portrait Compression)', framing: 'Negative space left', depthOfField: 'Heavy bokeh', backdrop: 'Dark void', lightType: 'Rim light', contrastLevel: 'High', temperature: 'Warm', tone: 'Minimal luxury', colorGrade: 'Muted tones', energyLevel: 'Low' },
      'social-performance': { label: 'Social Performance', shotType: 'Medium Shot', lens: '35mm (Natural)', framing: 'Rule of thirds', depthOfField: 'Deep focus', backdrop: 'Lifestyle set', lightType: 'Natural daylight', contrastLevel: 'Medium', temperature: 'Warm', tone: 'Bright energetic', colorGrade: 'Warm', energyLevel: 'High' },
      'editorial-fashion': { label: 'Editorial Fashion', shotType: 'Wide Shot', lens: '24mm (Wide Environmental)', framing: 'Dynamic off-center', depthOfField: 'Deep focus', backdrop: 'Textured surface', lightType: 'Hard contrast', contrastLevel: 'Ultra contrast', temperature: 'Cold', tone: 'Editorial fashion', colorGrade: 'High saturation', energyLevel: 'High' },
      'ecommerce-clean': { label: 'Ecommerce Clean', shotType: 'Hero Product Frame', lens: '50mm (Balanced)', framing: 'Symmetrical', depthOfField: 'Deep focus', backdrop: 'Seamless studio', lightType: 'Soft diffused', contrastLevel: 'Low', temperature: 'Neutral', tone: 'Clean commercial', colorGrade: 'Neutral', energyLevel: 'Low' },
      'macro-detail': { label: 'Macro Detail', shotType: 'Macro Detail', lens: '100mm Macro', framing: 'Centered', depthOfField: 'Macro focus stack', backdrop: 'Textured surface', lightType: 'Soft diffused', contrastLevel: 'High', temperature: 'Neutral', tone: 'Hyperreal product', colorGrade: 'Neutral', energyLevel: 'Moderate' }
    };
  }

  static get PHOTO_OPTIONS() {
    return {
      shotType: ['Macro Detail', 'Close-up', 'Medium Shot', 'Wide Shot', 'Hero Product Frame', 'Flat Lay', 'Top Down', 'Low Angle', 'High Angle'],
      lens: ['24mm (Wide Environmental)', '35mm (Natural)', '50mm (Balanced)', '85mm (Portrait Compression)', '100mm Macro'],
      framing: ['Centered', 'Rule of thirds', 'Negative space left', 'Negative space right', 'Symmetrical', 'Dynamic off-center'],
      depthOfField: ['Deep focus', 'Shallow depth', 'Heavy bokeh', 'Macro focus stack'],
      backdrop: ['Seamless studio', 'Natural environment', 'Textured surface', 'Gradient sweep', 'Dark void', 'Lifestyle set'],
      lightType: ['Soft diffused', 'Hard contrast', 'Rim light', 'Backlit silhouette', 'Studio commercial', 'Natural daylight', 'Dramatic spotlight'],
      contrastLevel: ['Low', 'Medium', 'High', 'Ultra contrast'],
      temperature: ['Neutral', 'Warm', 'Cold'],
      tone: ['Clean commercial', 'Cinematic dramatic', 'Hyperreal product', 'Minimal luxury', 'Dark premium', 'Bright energetic', 'Editorial fashion', 'Documentary'],
      colorGrade: ['Neutral', 'Warm', 'Cold', 'High saturation', 'Muted tones'],
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
    // Toda lectura/escritura de tablas pasa por el servicio (regla de oro de
    // la auditoría 2026-07-02: las vistas no llaman supabase.from() directo).
    this.data = new window.ImageDataService(this.supabase);
    this.organizationId = window.currentOrgId || this.routeParams?.orgId || null;
  }

  renderHTML() {
    // Las clases `video-*` son el esqueleto compartido con /video: toda la
    // hoja css/modules/video.css cuelga de `.video-view-container`, así que
    // renombrarlas aquí dejaría la página sin estilos. `image-view-container`
    // solo aporta lo que difiere (css/modules/image.css).
    return `
      <div class="organization-container video-view-container image-view-container" id="imagePage">
        <div class="video-layout">
          <div class="video-content-row">
            <main class="video-main">
              <section class="video-canvas video-canva-view" id="imageCanvaView" aria-label="${window.__('Canvas — imagen')}">

                <div class="video-canvas-idle" id="imageCanvasIdle">
                  <div class="video-canvas-idle-content">
                    <p class="video-canvas-idle__eyebrow">Stand by</p>
                    <h3 class="video-canvas-idle__title">${window.__('Listo para fotografiar')}</h3>
                    <p class="video-canvas-idle__hint">${window.__('Describe la imagen abajo: qué se ve, dónde y con qué intención. La dirección de fotografía la pones en el panel de la derecha.')}</p>
                  </div>
                </div>

                <div class="video-status-area" id="imageStatusArea" style="display: none;">
                  <div class="video-status-card" id="imageStatusCard">
                    <div class="video-status-spinner" id="imageStatusSpinner" style="display: none;"></div>
                    <p class="video-status-text" id="imageStatusText">—</p>
                  </div>
                </div>

                <div class="video-result-area" id="imageResultArea" style="display: none;">
                  <div class="video-result-card">
                    <div class="video-result-card-header">
                      <span class="video-result-output-badge">OUTPUT</span>
                      <h2 class="video-result-title">${window.__('Imagen generada')}</h2>
                    </div>
                    <div class="video-result-player-wrap image-result-wrap">
                      <img id="imageResultPicture" class="video-result-player image-result-picture" alt="${window.__('Imagen generada')}">
                    </div>
                    <div class="video-result-actions">
                      <a id="imageResultDownload" class="btn btn-secondary video-download-btn" href="#" download target="_blank" rel="noopener">
                        <i class="aisc-ico aisc-ico--dowload"></i> ${window.__('Descargar')}
                      </a>
                    </div>
                  </div>
                </div>

                <div class="video-error-area" id="imageErrorArea" style="display: none;">
                  <div class="video-error-card">
                    <div class="video-error-icon-wrap"><i class="aisc-ico aisc-ico--alert-warning"></i></div>
                    <p class="video-error-text" id="imageErrorText">—</p>
                  </div>
                </div>

                <div class="video-productions-panel video-productions-panel-inline" id="imageProductionsPanel" aria-hidden="true" style="display: none;">
                  <div class="video-productions-panel-card">
                    <div class="video-productions-panel-header">
                      <h3 class="video-prompt-panel-title">${window.__('Producciones')}</h3>
                      <button type="button" class="video-productions-panel-close" id="imageProductionsPanelClose" aria-label="${window.__('Cerrar')}"><i class="aisc-ico aisc-ico--close"></i></button>
                    </div>
                    <div class="video-productions-gallery" id="imageProductionsGallery"></div>
                  </div>
                </div>

              </section>

              <section class="video-director-console-zone video-prompt-wrap video-main-director" id="imageFooterControl" aria-label="${window.__('Consola de fotografía')}">
                <div class="video-prompt-footer-card video-prompt-footer-card-center">
                  <div class="video-prompt-footer-card-inner video-director-console">

                    <input type="file" id="imageConsoleUpload" accept="image/jpeg,image/png,image/jpg,image/webp" multiple style="display: none;" aria-hidden="true">

                    <div class="video-director-console-content">
                      <textarea
                        id="imagePromptInput"
                        class="video-director-brief-input"
                        placeholder="${window.__('Describe la imagen: sujeto, escenario y qué debe transmitir. Un buen brief pesa más que diez ajustes.')}"
                        rows="2"
                        autocomplete="off"
                        aria-label="${window.__('Brief de la imagen')}"
                      ></textarea>
                    </div>
                    <div class="video-director-attachments-row">
                      <div class="video-attachments-list" id="imageElementsList" aria-live="polite"></div>
                      <div class="video-director-variables-row" id="imageDirectorVariables" aria-label="${window.__('Variables de fotografía')}"></div>
                    </div>

                    <div class="video-director-controls">
                      <button type="button" class="video-director-btn-add" id="imagePromptAdd" aria-label="${window.__('Añadir referencia visual')}"><i class="aisc-ico aisc-ico--add"></i></button>
                      <div class="video-prompt-aspect-wrap">
                        <select id="imageAspectRatio" class="video-director-select" aria-label="${window.__('Relación de aspecto')}">
                          <option value="1:1" selected>1:1</option>
                          <option value="4:5">4:5</option>
                          <option value="5:4">5:4</option>
                          <option value="3:4">3:4</option>
                          <option value="4:3">4:3</option>
                          <option value="2:3">2:3</option>
                          <option value="3:2">3:2</option>
                          <option value="9:16">9:16</option>
                          <option value="16:9">16:9</option>
                          <option value="21:9">21:9</option>
                          <option value="auto">${window.__('Adaptable')}</option>
                        </select>
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-aspect-wrap">
                        <select id="imageResolution" class="video-director-select" aria-label="${window.__('Resolución')}">
                          <option value="1K">1K</option>
                          <option value="2K" selected>2K</option>
                          <option value="4K">4K</option>
                        </select>
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-aspect-wrap">
                        <select id="imageOutputFormat" class="video-director-select" aria-label="${window.__('Formato de archivo')}">
                          <option value="png" selected>PNG</option>
                          <option value="jpg">JPG</option>
                        </select>
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
                      </div>
                      <button type="button" class="video-director-btn-generate" id="imagePromptSend" aria-label="${window.__('Generar la imagen')}" data-state="production"><i class="aisc-ico aisc-ico--image"></i><span>${window.__('GENERAR')}</span></button>
                    </div>

                  </div>
                </div>
              </section>
            </main>

            <aside class="video-sidebar-console" aria-label="${window.__('Panel de producción')}">
              <div class="video-sidebar-tabs" role="tablist" aria-label="${window.__('Secciones del panel')}">
                <button type="button" class="video-sidebar-tab is-active" role="tab" id="imageSidebarTabRecursos" data-sidebar-tab="recursos" aria-selected="true" aria-controls="imageSidebarPanelRecursos">
                  <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i><span>${window.__('Recursos')}</span>
                </button>
                <button type="button" class="video-sidebar-tab" role="tab" id="imageSidebarTabFoto" data-sidebar-tab="fotografia" aria-selected="false" aria-controls="imageSidebarPanelFoto">
                  <i class="aisc-ico aisc-ico--camera" aria-hidden="true"></i><span>${window.__('Fotografía')}</span>
                </button>
              </div>
              <div class="video-prompt-footer-card video-sidebar-card">
                <div class="video-prompt-footer-card-inner video-sidebar-inner">

                <div class="video-sidebar-panel is-active" data-sidebar-panel="recursos" role="tabpanel" id="imageSidebarPanelRecursos" aria-labelledby="imageSidebarTabRecursos">

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Contexto de producción')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('A qué campaña pertenece la imagen, a quién le habla, y qué producciones o productos debe respetar la IA al generarla.')}</p>
                    <div class="video-escenas-block">
                      <div class="video-escenas-header">
                        <h4 class="video-prompt-panel-title">${window.__('Escenas')}</h4>
                        <button type="button" class="video-escenas-all-btn" id="imageProductionsBtn" aria-label="${window.__('Todas las producciones')}">${window.__('Todas')}</button>
                      </div>
                      <div class="video-escenas-carousel-wrap">
                        <div class="video-escenas-carousel" id="imageEscenasCarousel"></div>
                      </div>
                    </div>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿De qué trata?')}</h4>
                      <select id="imageCampaignSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Concepto de campaña')}" data-conceptual="1">
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
                      <select id="imageAudienceSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Audiencia conceptual')}" data-conceptual="1">
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
                    <div class="video-left-block video-asset-stack-block" id="imageAssetStackBlock">
                      <h4 class="video-prompt-panel-title">${window.__('Stack de activos')}</h4>
                      <p class="video-field-help video-asset-stack-help" id="imageAssetStackHelp">${window.__('Producto = bloqueo de referencia (la imagen no debe cambiar el producto)')}</p>
                      <div class="video-asset-scope-wrap">
                        <select id="imageAssetScope" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Alcance')}">
                          <option value="product">${window.__('Producto')}</option>
                          <option value="service">${window.__('Servicio')}</option>
                          <option value="brand_world">${window.__('Mundo de marca')}</option>
                          <option value="collection">${window.__('Colección')}</option>
                        </select>
                      </div>
                      <div class="video-asset-products-carousel-wrap" id="imageAssetProductsCarouselWrap">
                        <div class="video-asset-products-carousel" id="imageAssetProductsCarousel"></div>
                      </div>
                      <select id="imageAssetSelect" class="video-prompt-db-select video-asset-select video-asset-select-other" aria-label="${window.__('Activo')}" style="display: none;">
                        <option value="">${window.__('— Ninguno')}</option>
                      </select>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Referencias visuales')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Imágenes que la IA usa como guía de estilo, escena o producto. No se copian: orientan.')}</p>
                    <input type="file" id="imageRefUpload" accept="image/jpeg,image/png,image/jpg,image/webp" multiple style="display: none;" aria-hidden="true">

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Imágenes')} <span class="seedance-ref-limit" id="imageRefCount">0 / ${ImageView.IMAGE_REF_LIMIT}</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="imageAddRef" aria-label="${window.__('Añadir referencia visual')}"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="imageRefList" aria-live="polite"></div>
                    </div>
                  </div>

                </div>

                <div class="video-sidebar-panel" data-sidebar-panel="fotografia" role="tabpanel" id="imageSidebarPanelFoto" aria-labelledby="imageSidebarTabFoto" hidden>

                  <div class="video-sidebar-section video-sidebar-cine video-cinematography-panel">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Dirección de fotografía')}</h3>
                      <div class="video-sidebar-section-actions">
                        <button type="button" class="video-sidebar-section-icon-btn" id="imagePhotoResetBtn" aria-label="${window.__('Restablecer fotografía')}" title="${window.__('Restablecer todos los valores')}"><i class="aisc-ico aisc-ico--refresh"></i></button>
                      </div>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Encuadre, luz, profundidad y color. Si no sabes por dónde empezar, elige un Preset de producción y se llena el resto.')}</p>
                    <div class="video-cine-preset-wrap">
                      <label class="video-cine-label">${window.__('Preset de producción')}</label>
                      <select id="imagePhotoPreset" class="video-cine-select" aria-label="${window.__('Preset de producción')}">
                        <option value="">${window.__('Ninguno')}</option>
                        <option value="product-hero">Product Hero</option>
                        <option value="luxury-still">Luxury Still</option>
                        <option value="social-performance">Social Performance</option>
                        <option value="editorial-fashion">Editorial Fashion</option>
                        <option value="ecommerce-clean">Ecommerce Clean</option>
                        <option value="macro-detail">Macro Detail</option>
                      </select>
                    </div>
                    <div class="video-cine-selected-tags" id="imagePhotoSelectedTags" aria-live="polite"></div>
                    <div class="video-cine-tabs" role="tablist" aria-label="${window.__('Categoría de dirección')}">
                      <button type="button" class="video-cine-tab is-active" role="tab" aria-selected="true" data-tab="frame"><i class="aisc-ico aisc-ico--crop" aria-hidden="true"></i><span>${window.__('Encuadre')}</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="lighting"><i class="aisc-ico aisc-ico--idea" aria-hidden="true"></i><span>${window.__('Luz')}</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="mood"><i class="aisc-ico aisc-ico--palette" aria-hidden="true"></i><span>Mood</span></button>
                      <button type="button" class="video-cine-tab" role="tab" aria-selected="false" data-tab="depth"><i class="aisc-ico aisc-ico--filter" aria-hidden="true"></i><span>${window.__('Profundidad')}</span></button>
                    </div>
                    <div class="video-cine-panels">
                      <div class="video-cine-panel is-active" data-panel="frame" role="tabpanel">
                        <p class="video-cine-block-hint">${window.__('Desde dónde se mira y con qué lente. Decide qué tan cerca está el sujeto y cuánto aire queda alrededor.')}</p>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Tipo de toma')}</label><select id="imagePhotoShotType" class="video-cine-select"></select></div>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Lente')}</label><select id="imagePhotoLens" class="video-cine-select"></select></div>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Encuadre')}</label><select id="imagePhotoFraming" class="video-cine-select"></select></div>
                      </div>
                      <div class="video-cine-panel" data-panel="lighting" role="tabpanel" hidden>
                        <p class="video-cine-block-hint">${window.__('La iluminación dicta la emoción: suave para algo cálido, contrastada para drama.')}</p>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Tipo de luz')}</label><select id="imagePhotoLightType" class="video-cine-select"></select></div>
                        <div class="video-cine-row-pair">
                          <div class="video-cine-row"><label class="video-cine-label">${window.__('Contraste')}</label><select id="imagePhotoContrast" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">${window.__('Temperatura')}</label><select id="imagePhotoTemperature" class="video-cine-select"></select></div>
                        </div>
                      </div>
                      <div class="video-cine-panel" data-panel="mood" role="tabpanel" hidden>
                        <p class="video-cine-block-hint">${window.__('La paleta y la energía emocional. Define si se siente premium, vibrante o dramático.')}</p>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Tono')}</label><select id="imagePhotoTone" class="video-cine-select"></select></div>
                        <div class="video-cine-row-pair">
                          <div class="video-cine-row"><label class="video-cine-label">Color Grade</label><select id="imagePhotoColorGrade" class="video-cine-select"></select></div>
                          <div class="video-cine-row"><label class="video-cine-label">${window.__('Energía')}</label><select id="imagePhotoEnergyLevel" class="video-cine-select"></select></div>
                        </div>
                      </div>
                      <div class="video-cine-panel" data-panel="depth" role="tabpanel" hidden>
                        <p class="video-cine-block-hint">${window.__('Qué tanto se separa el sujeto del fondo, y sobre qué fondo cae. En una foto fija es media dirección.')}</p>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Profundidad de campo')}</label><select id="imagePhotoDepthOfField" class="video-cine-select"></select></div>
                        <div class="video-cine-row"><label class="video-cine-label">${window.__('Fondo')}</label><select id="imagePhotoBackdrop" class="video-cine-select"></select></div>
                      </div>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Estilo Visual')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Mood general y nivel de realismo de la imagen.')}</p>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Mood visual')}</label>
                      <select id="imageMood" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Commercial photography">${window.__('Fotografía comercial')}</option>
                        <option value="Editorial">Editorial</option>
                        <option value="Documentary">${window.__('Documental')}</option>
                        <option value="Fine art">${window.__('Fine art')}</option>
                        <option value="Dreamlike">${window.__('Sueño / Onírico')}</option>
                        <option value="Bright lifestyle">${window.__('Lifestyle luminoso')}</option>
                      </select>
                    </div>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Realismo')}</label>
                      <select id="imageRealism" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Photorealistic">${window.__('Fotorrealista')}</option>
                        <option value="Stylized">${window.__('Estilizado')}</option>
                        <option value="Hyperreal">${window.__('Hiperreal')}</option>
                        <option value="Illustration">${window.__('Ilustración')}</option>
                        <option value="3D render">${window.__('Render 3D')}</option>
                      </select>
                    </div>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Acabado')}</label>
                      <select id="imageFinish" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Clean digital">${window.__('Digital limpio')}</option>
                        <option value="Analog film grain">${window.__('Grano de película')}</option>
                        <option value="High gloss">${window.__('Alto brillo')}</option>
                        <option value="Matte">${window.__('Mate')}</option>
                      </select>
                    </div>
                  </div>

                </div>

                </div>
              </div>
              <button type="button" class="video-sidebar-help" id="imageSidebarHelpBtn" aria-label="${window.__('Ayuda Imagen')}" title="${window.__('Ayuda Imagen')}">?</button>
              <div class="video-sidebar-help-popover" id="imageSidebarHelpPopover" role="dialog" aria-label="${window.__('Ayuda Imagen')}">
                <h4>${window.__('Imagen — nano-banana Pro')}</h4>
                <p><strong>${window.__('Recursos')}</strong>${window.__(': el material que le entregas. Hasta {limite} referencias visuales que dan estilo, escena o producto. Si eliges un producto en el Stack, sus fotos entran como bloqueo: eso no debe cambiar.', { limite: ImageView.IMAGE_REF_LIMIT })}</p>
                <p><strong>${window.__('Fotografía')}</strong>${window.__(': cómo se ve. Encuadre, luz, profundidad y color no son parámetros de la API — se traducen a lenguaje de dirección dentro del prompt. Un Preset de producción llena todo de una.')}</p>
                <p><strong>${window.__('Formato')}</strong>${window.__(': el ratio y la resolución sí son parámetros reales. 4K cuesta más créditos que 1K.')}</p>
              </div>
            </aside>
          </div>

        </div>
      </div>
    `;
  }

  async init() {
    this.idleArea = this.container.querySelector('#imageCanvasIdle');
    this.statusArea = this.container.querySelector('#imageStatusArea');
    this.statusText = this.container.querySelector('#imageStatusText');
    this.statusSpinner = this.container.querySelector('#imageStatusSpinner');
    this.resultArea = this.container.querySelector('#imageResultArea');
    this.resultPicture = this.container.querySelector('#imageResultPicture');
    this.resultDownload = this.container.querySelector('#imageResultDownload');
    this.errorArea = this.container.querySelector('#imageErrorArea');
    this.errorText = this.container.querySelector('#imageErrorText');

    this.sendBtn = this.container.querySelector('#imagePromptSend');
    this.promptInput = this.container.querySelector('#imagePromptInput');

    if (this.sendBtn && this.sendBtn.dataset.boundImageSend !== '1') {
      this.sendBtn.dataset.boundImageSend = '1';
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
      this.promptInput.addEventListener('input', () => this.scheduleResizePromptInput());
      this.promptInput.addEventListener('paste', () => this.scheduleResizePromptInput());
    }

    // ── Pestañas del sidebar: Recursos | Fotografía ──
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

    // ── Referencias visuales ──
    const addRefBtn = this.container.querySelector('#imageAddRef');
    if (addRefBtn && addRefBtn.dataset.boundRef !== '1') {
      addRefBtn.dataset.boundRef = '1';
      addRefBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openRefPicker();
      });
    }
    const refInput = this.container.querySelector('#imageRefUpload');
    if (refInput && refInput.dataset.boundRef !== '1') {
      refInput.dataset.boundRef = '1';
      refInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length) await this.addRefs(files);
      });
    }
    const refList = this.container.querySelector('#imageRefList');
    if (refList && refList.dataset.boundRemove !== '1') {
      refList.dataset.boundRemove = '1';
      refList.addEventListener('click', (e) => {
        const btnQuitar = e.target.closest('.seedance-ref-remove');
        if (!btnQuitar) return;
        e.preventDefault();
        const idx = parseInt(btnQuitar.getAttribute('data-ref-index'), 10);
        if (!Number.isNaN(idx)) this.removeRef(idx);
      });
    }

    // "+" de la consola: atajo al mismo grupo de referencias.
    const consoleAdd = this.container.querySelector('#imagePromptAdd');
    const consoleInput = this.container.querySelector('#imageConsoleUpload');
    if (consoleAdd && consoleInput && consoleAdd.dataset.boundAdd !== '1') {
      consoleAdd.dataset.boundAdd = '1';
      consoleAdd.addEventListener('click', (e) => {
        e.preventDefault();
        consoleInput.click();
      });
      consoleInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        const imagenes = files.filter((f) => f.type.startsWith('image/'));
        if (imagenes.length < files.length) {
          this._notify(window.__('{n} archivo(s) no son imágenes y se ignoran: aquí solo entran referencias visuales.', { n: files.length - imagenes.length }));
        }
        if (imagenes.length) await this.addRefs(imagenes);
      });
    }

    // Chips junto al prompt: una sola delegación para todas las bajas.
    const chipsEl = this.container.querySelector('#imageElementsList');
    if (chipsEl && chipsEl.dataset.boundChips !== '1') {
      chipsEl.dataset.boundChips = '1';
      chipsEl.addEventListener('click', (e) => {
        const btnQuitar = e.target.closest('[data-attachment-remove]');
        if (!btnQuitar) return;
        e.preventDefault();
        this.removeAttachment(btnQuitar.getAttribute('data-attachment-remove'));
      });
    }

    this.renderRefs();
    this.renderAttachmentChips();

    // Contexto de marca ANTES del Stack de activos y de Escenas: ambos pintan
    // desde dbData.products, y si corren primero el carrusel nace diciendo
    // "no hay productos con imágenes" aunque los haya.
    await this.loadBrandData();
    const campaignSelect = this.container.querySelector('#imageCampaignSelect');
    const audienceSelect = this.container.querySelector('#imageAudienceSelect');
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
    const productionsBtn = this.container.querySelector('#imageProductionsBtn');
    const panelClose = this.container.querySelector('#imageProductionsPanelClose');
    if (productionsBtn && productionsBtn.dataset.boundProds !== '1') {
      productionsBtn.dataset.boundProds = '1';
      productionsBtn.addEventListener('click', (e) => { e.preventDefault(); this.openProductionsPanel(); });
    }
    if (panelClose && panelClose.dataset.boundProds !== '1') {
      panelClose.dataset.boundProds = '1';
      panelClose.addEventListener('click', (e) => { e.preventDefault(); this.closeProductionsPanel(); });
    }

    // ── Stack de activos ──
    const assetScope = this.container.querySelector('#imageAssetScope');
    const assetSelect = this.container.querySelector('#imageAssetSelect');
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
    await this.loadImageProductions();
    this.renderEscenasCarousel();

    // ── Fotografía ──
    this.initPhotography();
    const resetBtn = this.container.querySelector('#imagePhotoResetBtn');
    if (resetBtn && resetBtn.dataset.boundReset !== '1') {
      resetBtn.dataset.boundReset = '1';
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!confirm(window.__('¿Restablecer todos los valores de Fotografía?'))) return;
        Object.keys(this.photography).forEach((k) => { this.photography[k] = ''; });
        this.syncPhotographyToSelects();
        this.renderPhotographySelectedTags();
        this.renderDirectorVariables();
        const presetEl = this.container.querySelector('#imagePhotoPreset');
        if (presetEl) presetEl.value = '';
      });
    }

    // Botón de ayuda del sidebar
    const helpBtn = this.container.querySelector('#imageSidebarHelpBtn');
    const helpPopover = this.container.querySelector('#imageSidebarHelpPopover');
    if (helpBtn && helpPopover && helpBtn.dataset.boundHelp !== '1') {
      helpBtn.dataset.boundHelp = '1';
      helpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        helpPopover.classList.toggle('is-open');
      });
      this._helpOutsideHandler = (e) => {
        if (!helpPopover.classList.contains('is-open')) return;
        if (helpPopover.contains(e.target) || helpBtn.contains(e.target)) return;
        helpPopover.classList.remove('is-open');
      };
      this.addEventListener(document, 'click', this._helpOutsideHandler);
    }

    this.scheduleResizePromptInput();
    this._resizeBriefOnWin = () => this.scheduleResizePromptInput();
    this.addEventListener(window, 'resize', this._resizeBriefOnWin);
  }

  /** Altura del textarea según contenido (vacío ≈ una línea; crece hasta un máximo). */
  scheduleResizePromptInput() {
    if (this._resizeBriefRaf) cancelAnimationFrame(this._resizeBriefRaf);
    this._resizeBriefRaf = requestAnimationFrame(() => {
      this._resizeBriefRaf = null;
      this.resizePromptInput();
    });
  }

  resizePromptInput() {
    const ta = this.promptInput;
    if (!ta || ta.tagName !== 'TEXTAREA') return;
    const maxPx = Math.min(
      ImageView.BRIEF_MAX_HEIGHT_PX,
      Math.floor(window.innerHeight * ImageView.BRIEF_MAX_VIEWPORT_FRAC)
    );
    const minPx = 44;
    ta.style.height = '0px';
    const sh = ta.scrollHeight;
    ta.style.height = `${Math.min(Math.max(sh, minPx), maxPx)}px`;
    ta.style.overflowY = sh > maxPx ? 'auto' : 'hidden';
  }

  // ── Contexto de marca ────────────────────────────────────────────────────

  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      // Regla central de aislamiento: marca dentro de la org activa, sin fallback
      // cross-org a user_id (ver js/org-url.js resolveActiveBrandContainerId).
      const uid = this.userId || (await this.supabase.auth.getUser())?.data?.user?.id || null;
      return await window.resolveActiveBrandContainerId(this.supabase, this.organizationId, uid);
    } catch (e) {
      console.error('ImageView getBrandContainerId:', e);
      return null;
    }
  }

  async loadBrandData() {
    this.brandContainerId = await this.getBrandContainerId();
    if (!this.data || !this.brandContainerId) return;
    try {
      const ctx = await this.data.loadBrandContext(this.brandContainerId, this.organizationId || window.currentOrgId);
      this.dbData = { ...this.dbData, ...ctx };
      this.renderCampaignDropdown();
      this.renderAudienceDropdown();
    } catch (e) {
      console.error('ImageView loadBrandData:', e);
    }
  }

  renderCampaignDropdown() {
    // Conceptual: opciones hardcoded en el HTML, NO se popula desde BD. Las
    // campañas aquí son conceptos (Brand awareness, Product launch…), no
    // campañas reales del CRM; el backend recibe el string y lo usa de contexto.
    const select = this.container.querySelector('#imageCampaignSelect');
    if (!select) return;
    if (this.selectedCampaignId && Array.from(select.options).some((o) => o.value === this.selectedCampaignId)) {
      select.value = this.selectedCampaignId;
    }
  }

  renderAudienceDropdown() {
    const select = this.container.querySelector('#imageAudienceSelect');
    if (!select) return;
    if (this.selectedAudienceId && Array.from(select.options).some((o) => o.value === this.selectedAudienceId)) {
      select.value = this.selectedAudienceId;
    }
  }

  // ── Canvas: estados ──────────────────────────────────────────────────────

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
    if (this.resultPicture) this.resultPicture.src = url;
    if (this.resultDownload) {
      this.resultDownload.href = url;
      this.resultDownload.download = '';
    }
  }

  showError(message) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'block';
    if (this.errorText) this.errorText.textContent = message;
  }

  /** Habilita/inhabilita el botón para que dos clics no disparen dos tareas (dos cobros). */
  _setGenerating(activo) {
    this._generating = activo;
    if (!this.sendBtn) return;
    this.sendBtn.disabled = activo;
    this.sendBtn.classList.toggle('is-busy', activo);
  }

  /**
   * Persiste la imagen de KIE en R2 (media.aismartcontent.io) vía
   * kie-output-persist: el worker de ingesta la descarga server-side, así que
   * los bytes no pasan por el browser. Devuelve URLs completas.
   */
  async persistKieImage(kieImageUrl, taskId) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session?.access_token) return null;

    this.showStatus(window.__('Guardando en tu cuenta…'), true);
    const res = await fetch('/.netlify/functions/kie-output-persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ kie_url: kieImageUrl, task_id: taskId, kind: 'generated' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || window.__('Descarga fallida: {status}', { status: res.status }));
    return { publicUrl: data.public_url || null, storagePath: data.storage_path };
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
      campaigns: (d.campaigns || []).map((c) => ({ name: c.nombre_campana, description: c.descripcion_interna, audience_id: c.persona_id, contexto_temporal: c.contexto_temporal, objetivos_estrategicos: c.objetivos_estrategicos, tono_modificador: c.tono_modificador }))
    };
  }

  async saveSystemAIOutput(record) {
    if (!this.supabase || !this.data) return null;
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user?.id) return null;
      const brandContainerId = this.brandContainerId || await this.getBrandContainerId();
      if (!brandContainerId) return null;
      // Schema unificado runs_outputs <-> system_ai_outputs (2026-05-22): los
      // campos comunes se pueblan desde el state del view; el caller solo pasa
      // lo específico (provider, output_type, prompt_used, metadata…).
      const row = {
        brand_container_id: brandContainerId,
        organization_id: this.organizationId || null,
        user_id: user.id,
        campaign_id: null,
        persona_id: null,
        brief_id: this._resolveSelectedBriefId(),
        entity_id: this._resolveSelectedEntityId(),
        ...record,
        updated_at: new Date().toISOString()
      };
      return await this.data.insertOutput(row);
    } catch (e) {
      console.warn('ImageView saveSystemAIOutput:', e);
      return null;
    }
  }

  /**
   * campaign_id y persona_id quedan en null a propósito: los selects de esta
   * página son CONCEPTUALES (strings como "Product launch"), no FKs a
   * campaigns/audience_personas. Meter el string en una columna uuid revienta
   * el insert entero y la imagen se perdería después de haberse cobrado.
   */
  _resolveSelectedBriefId() {
    return null;
  }

  /**
   * Resuelve entity_id desde el activo elegido en el Stack, según scope.
   * products.entity_id y services.entity_id son FK a brand_entities y dan el
   * linaje canónico al output. null si no hay activo o el scope no aplica.
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
    if (!this.data || !id) return;
    try {
      await this.data.updateOutput(id, updates);
    } catch (e) {
      console.warn('ImageView updateSystemAIOutput:', e);
    }
  }

  /**
   * Aviso al usuario. Una referencia rechazada en silencio se lee como
   * aceptada y el error aparece después, en KIE.
   */
  _notify(message, type = 'warning') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, { type, duration: 5000 });
    } else if (window.alert) {
      window.alert(message);
    }
  }

  _refCount() {
    return (this.imageRefs || []).length;
  }

  // ── Referencias visuales ────────────────────────────────────────────────

  /** Sube un adjunto y devuelve { url, storagePath }. Lanza si algo falla. */
  async _uploadFile(file) {
    if (!this.supabase || !this.supabase.storage) {
      throw new Error(window.__('Almacenamiento no disponible. Recarga la página y reintenta.'));
    }
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user?.id) throw new Error(window.__('Inicia sesión para subir referencias.'));
    const bucket = ImageView.IMAGE_STORAGE_BUCKET;
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/jpeg/, 'jpg');
    const storagePath = `image-refs/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
  _removeStorage(storagePath) {
    if (!storagePath || !this.supabase?.storage) return;
    this.supabase.storage
      .from(ImageView.IMAGE_STORAGE_BUCKET)
      .remove([storagePath])
      .catch((err) => console.warn('[ImageView] limpieza de Storage falló', storagePath, err));
  }

  openRefPicker() {
    const input = this.container.querySelector('#imageRefUpload');
    if (input) input.click();
  }

  /**
   * Valida el cupo, sube y registra cada archivo. Secuencial a propósito:
   * subir seis imágenes en paralelo satura la conexión y deja huérfanos en el
   * bucket si el usuario se va a mitad.
   */
  async addRefs(files) {
    const limite = ImageView.IMAGE_REF_LIMIT;
    const libre = Math.max(0, limite - this._refCount());
    if (libre === 0) {
      this._notify(window.__('Ya tienes el máximo de {limite} referencias. Quita una para añadir otra.', { limite }));
      return;
    }
    const usables = files.slice(0, libre);
    if (files.length > libre) {
      this._notify(window.__('Solo caben {libre} más: se ignoran {sobran}.', { libre, sobran: files.length - libre }));
    }
    for (const file of usables) {
      try {
        const subido = await this._uploadFile(file);
        this.imageRefs.push({ name: file.name, origen: 'manual', ...subido });
        this.renderRefs();
        this.renderAttachmentChips();
      } catch (err) {
        console.error('ImageView ref upload:', err);
        this._notify(window.__('No se pudo subir "{name}": ', { name: file.name }) + (err.message || ''), 'error');
      }
    }
  }

  removeRef(index) {
    const item = (this.imageRefs || [])[index];
    if (!item) return;
    // Solo las subidas por el usuario viven en nuestro bucket. Las que vienen
    // de una producción o de un producto son URLs ajenas: borrarlas del
    // Storage se llevaría por delante la producción original.
    if (item.origen === 'manual') this._removeStorage(item.storagePath);
    this.imageRefs.splice(index, 1);
    // Quitar el chip también tiene que apagar su origen; si no, la tarjeta
    // sigue marcada en el carrusel y el próximo sync la vuelve a meter.
    if (item.origen === 'produccion' && item._productionId != null) {
      this.selectedProductionIds.delete(item._productionId);
      this.renderEscenasCarousel();
      this.renderProductionsGallery();
    }
    if (item.origen === 'activo') {
      this.selectedAssetId = '';
      const assetSelect = this.container.querySelector('#imageAssetSelect');
      if (assetSelect) assetSelect.value = '';
      this.renderAssetProductsCarousel();
    }
    this.renderRefs();
    this.renderAttachmentChips();
  }

  renderRefs() {
    const items = this.imageRefs || [];
    const countEl = this.container.querySelector('#imageRefCount');
    if (countEl) countEl.textContent = `${items.length} / ${ImageView.IMAGE_REF_LIMIT}`;
    const listEl = this.container.querySelector('#imageRefList');
    if (!listEl) return;
    listEl.innerHTML = items.map((item, idx) => {
      const nombre = this.escapeHtml(item.name || 'imagen');
      // Una referencia de producto NO es inspiración: es la instrucción de que
      // eso no cambie. Sin distintivo se ve idéntica a una imagen de estilo y
      // el usuario no sabe cuál está bloqueando.
      const candado = item.lock
        ? `<span class="seedance-ref-lock" aria-hidden="true" title="${window.__('Bloqueo de producto')}"><i class="aisc-ico aisc-ico--bookmark"></i></span>`
        : '';
      const titulo = item.lock ? `${nombre} — ${window.__('bloqueo de producto')}` : nombre;
      return `<span class="seedance-ref-item${item.lock ? ' is-lock' : ''}" title="${titulo}"><img class="seedance-ref-thumb" src="${this.escapeHtml(item.url)}" alt="" loading="lazy">${candado}<button type="button" class="seedance-ref-remove" data-ref-index="${idx}" aria-label="${window.__('Quitar {name}', { name: nombre })}">&times;</button></span>`;
    }).join('');
  }

  /** Fila de chips junto al prompt: lo adjunto, a la vista, sin abrir el sidebar. */
  renderAttachmentChips() {
    const listEl = this.container.querySelector('#imageElementsList');
    if (!listEl) return;
    const chips = (this.imageRefs || []).map((item, idx) => ({
      label: item.name || 'imagen',
      url: item.url,
      quitar: `ref:${idx}`
    }));

    if (chips.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      this.scheduleResizePromptInput();
      return;
    }
    listEl.style.display = 'flex';
    listEl.innerHTML = chips.map((c) => {
      const etiqueta = this.escapeHtml(c.label);
      return `<span class="video-attachment-chip" title="${etiqueta}"><span class="video-attachment-thumbs"><span class="video-attachment-thumb-wrap"><img class="video-attachment-thumb" src="${this.escapeHtml(c.url)}" alt="" loading="lazy"></span></span><button type="button" class="video-attachment-remove" data-attachment-remove="${c.quitar}" aria-label="${window.__('Quitar {name}', { name: etiqueta })}">&times;</button></span>`;
    }).join('');
    this.scheduleResizePromptInput();
  }

  /** Traduce el data-attachment-remove del chip a la baja correspondiente. */
  removeAttachment(token) {
    const partes = String(token || '').split(':');
    if (partes[0] !== 'ref') return;
    const idx = parseInt(partes[1], 10);
    if (!Number.isNaN(idx)) this.removeRef(idx);
  }

  // ── Escenas: producciones previas como material de referencia ───────────

  async loadImageProductions() {
    if (!this.data || !this.supabase) return;
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user?.id) return;
      this.imageProductions = await this.data.loadImageProductions({
        organizationId: this.organizationId,
        userId: user.id
      });
    } catch (e) {
      console.warn('ImageView loadImageProductions:', e);
      this.imageProductions = [];
    }
  }

  /** Pinta una lista de producciones (carrusel del sidebar o galería del panel). */
  _renderProduccionesEn(selector, claseItem, claseThumb, claseVacio, textoVacio) {
    const cont = this.container.querySelector(selector);
    if (!cont) return;
    if (this.imageProductions.length === 0) {
      cont.innerHTML = `<p class="${claseVacio}">${textoVacio}</p>`;
      return;
    }
    cont.innerHTML = this.imageProductions.map((p) => {
      const seleccionada = this.selectedProductionIds.has(p.id);
      const url = this.escapeHtml(p.media_url || '');
      return `
        <div class="${claseItem} ${seleccionada ? 'is-selected' : ''}" data-id="${this.escapeHtml(p.id)}" role="button" tabindex="0" aria-pressed="${seleccionada}" aria-label="${window.__('Seleccionar producción')}">
          <div class="${claseThumb}-wrap"><img class="${claseThumb} ${claseThumb}-img" src="${url}" alt="" loading="lazy" decoding="async"></div>
        </div>`;
    }).join('');
    cont.querySelectorAll('.' + claseItem).forEach((el) => {
      el.addEventListener('click', () => this.toggleProduccion(el.dataset.id));
    });
  }

  renderEscenasCarousel() {
    this._renderProduccionesEn(
      '#imageEscenasCarousel', 'video-escena-item', 'video-escena-thumb', 'video-escenas-empty',
      window.__('Aún no hay imágenes producidas. Las de tus flows aparecerán aquí.')
    );
  }

  renderProductionsGallery() {
    this._renderProduccionesEn(
      '#imageProductionsGallery', 'video-production-item', 'video-production-thumb', 'video-productions-empty',
      window.__('Aún no hay imágenes producidas. Las de tus flows aparecerán aquí.')
    );
  }

  toggleProduccion(id) {
    if (id == null) return;
    if (this.selectedProductionIds.has(id)) this.selectedProductionIds.delete(id);
    else this.selectedProductionIds.add(id);
    this.syncProductionSelectionToRefs();
    this.renderEscenasCarousel();
    this.renderProductionsGallery();
  }

  /**
   * Vuelca las producciones elegidas en las referencias — el mismo cupo que
   * las subidas a mano, porque el límite es de KIE y no le importa de dónde
   * salió cada archivo. Si una no cabe, se deselecciona y se avisa: dejarla
   * marcada sin estar en el payload sería mentir.
   */
  syncProductionSelectionToRefs() {
    this.imageRefs = this.imageRefs.filter((r) => r.origen !== 'produccion');
    let rechazadas = 0;
    Array.from(this.selectedProductionIds).forEach((id) => {
      const p = this.imageProductions.find((prod) => String(prod.id) === String(id));
      if (!p || !p.media_url) return;
      if (this._refCount() >= ImageView.IMAGE_REF_LIMIT) {
        this.selectedProductionIds.delete(id);
        rechazadas += 1;
        return;
      }
      this.imageRefs.push({
        name: `${window.__('Escena')} ${String(p.id).slice(0, 8)}`,
        url: p.media_url,
        storagePath: null,
        origen: 'produccion',
        _productionId: p.id
      });
    });
    if (rechazadas) {
      this._notify(window.__('{n} escena(s) no caben: ya estás en el máximo de referencias. Quita una y vuelve a intentar.', { n: rechazadas }));
    }
    this.renderRefs();
    this.renderAttachmentChips();
  }

  async openProductionsPanel() {
    const panel = this.container.querySelector('#imageProductionsPanel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    await this.loadImageProductions();
    this.renderProductionsGallery();
  }

  closeProductionsPanel() {
    const panel = this.container.querySelector('#imageProductionsPanel');
    if (!panel) return;
    const btn = this.container.querySelector('#imageProductionsBtn');
    if (btn && typeof btn.focus === 'function') btn.focus();
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    this.renderEscenasCarousel();
  }

  // ── Stack de activos: el producto que la imagen no debe alterar ─────────

  /** Muestra carrusel de productos u otro scope (dropdown). */
  updateAssetStackScopeUI() {
    const block = this.container.querySelector('#imageAssetStackBlock');
    const carouselWrap = this.container.querySelector('#imageAssetProductsCarouselWrap');
    const assetSelect = this.container.querySelector('#imageAssetSelect');
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
    const select = this.container.querySelector('#imageAssetSelect');
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
    const carousel = this.container.querySelector('#imageAssetProductsCarousel');
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
   * El activo elegido entra como referencia marcada con `lock`. No es
   * inspiración: es la instrucción de que el producto NO cambie. Ocupa cupo
   * igual, porque para KIE es una imagen de referencia más.
   */
  syncAssetSelectionToRefs() {
    this.imageRefs = this.imageRefs.filter((r) => r.origen !== 'activo');
    const scope = this.assetScope || 'product';
    if (scope !== 'product' || !this.selectedAssetId) {
      this.renderRefs();
      this.renderAttachmentChips();
      return;
    }
    const product = (this.dbData.products || []).find((p) => String(p.id) === String(this.selectedAssetId));
    const urls = (product && Array.isArray(product.image_urls) ? product.image_urls : [])
      .filter(Boolean)
      .slice(0, ImageView.IMAGE_PRODUCT_LOCK_IMAGES);
    const libre = ImageView.IMAGE_REF_LIMIT - this._refCount();
    if (urls.length && libre <= 0) {
      this.selectedAssetId = '';
      this._notify(window.__('No cabe el producto: ya estás en el máximo de referencias.'));
      this.renderAssetProductsCarousel();
    } else {
      urls.slice(0, Math.max(0, libre)).forEach((url) => {
        this.imageRefs.push({
          name: product.nombre_producto || window.__('Producto'),
          url,
          storagePath: null,
          origen: 'activo',
          lock: true,
          _assetId: product.id
        });
      });
    }
    this.renderRefs();
    this.renderAttachmentChips();
  }

  // ── Dirección de fotografía ─────────────────────────────────────────────

  /** Pares [id del select, clave del state]. Fuente única para llenar, leer y repintar. */
  static get PHOTO_SELECT_CONFIG() {
    return [
      ['imagePhotoShotType', 'shotType'],
      ['imagePhotoLens', 'lens'],
      ['imagePhotoFraming', 'framing'],
      ['imagePhotoDepthOfField', 'depthOfField'],
      ['imagePhotoBackdrop', 'backdrop'],
      ['imagePhotoLightType', 'lightType'],
      ['imagePhotoContrast', 'contrastLevel'],
      ['imagePhotoTemperature', 'temperature'],
      ['imagePhotoTone', 'tone'],
      ['imagePhotoColorGrade', 'colorGrade'],
      ['imagePhotoEnergyLevel', 'energyLevel']
    ];
  }

  initPhotography() {
    const opts = ImageView.PHOTO_OPTIONS;
    const fill = (id, values, current) => {
      const el = this.container.querySelector('#' + id);
      if (!el) return;
      el.innerHTML = `<option value="">${window.__('— Ninguno')}</option>`
        + values.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('');
    };
    ImageView.PHOTO_SELECT_CONFIG.forEach(([id, key]) => fill(id, opts[key] || [], this.photography[key]));

    const presetEl = this.container.querySelector('#imagePhotoPreset');
    if (presetEl) {
      presetEl.addEventListener('change', () => {
        const key = presetEl.value;
        const presets = ImageView.PHOTOGRAPHY_PRESETS;
        if (!key || !presets[key]) return;
        const p = presets[key];
        this.photography.preset = key;
        ImageView.PHOTO_SELECT_CONFIG.forEach(([, k]) => { if (p[k] != null) this.photography[k] = p[k]; });
        this.syncPhotographyToSelects();
        this.renderPhotographySelectedTags();
        this.renderDirectorVariables();
      });
    }

    ImageView.PHOTO_SELECT_CONFIG.forEach(([id, key]) => {
      const el = this.container.querySelector('#' + id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.photography[key] = el.value;
        this.renderPhotographySelectedTags();
        this.renderDirectorVariables();
      });
    });

    // Tabs de la pestaña Fotografía
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

    this.renderPhotographySelectedTags();
    this.renderDirectorVariables();
    this.enhancePhotographyWithTiles();
  }

  /**
   * Convierte cada <select> en una rejilla de tiles con icono y tooltip. El
   * select sigue siendo el modelo (lo lee syncPhotographyToSelects y los
   * tests); los tiles son lo que el usuario mira.
   */
  enhancePhotographyWithTiles() {
    const FALLBACK_ICONS = {
      shotType: 'aisc-ico aisc-ico--camera',
      lens: 'aisc-ico aisc-ico--camera',
      framing: 'aisc-ico aisc-ico--crop',
      depthOfField: 'aisc-ico aisc-ico--filter',
      backdrop: 'aisc-ico aisc-ico--image',
      lightType: 'aisc-ico aisc-ico--idea',
      contrastLevel: 'aisc-ico aisc-ico--moon',
      temperature: 'fa-temperature-three-quarters',
      tone: 'aisc-ico aisc-ico--palette',
      colorGrade: 'aisc-ico aisc-ico--palette',
      energyLevel: 'aisc-ico aisc-ico--fire'
    };

    // Descripciones por VALOR: al hover, el tooltip explica qué hace el efecto
    // en lenguaje claro, para quien no viene de fotografía.
    const VALUE_DESCRIPTIONS = {
      // Tipo de toma
      'Macro Detail': window.__('Detalle extremo del objeto. Textura, materiales y acabados en primer plano.'),
      'Close-up': window.__('Plano cerrado sobre el sujeto. Íntimo y directo.'),
      'Medium Shot': window.__('Plano medio. Sujeto y algo de contexto alrededor.'),
      'Wide Shot': window.__('Plano abierto. El entorno cuenta tanto como el sujeto.'),
      'Hero Product Frame': window.__('El producto como protagonista absoluto del encuadre.'),
      'Flat Lay': window.__('Vista cenital sobre superficie. Ordenado, editorial, muy de catálogo.'),
      'Top Down': window.__('Cámara desde arriba. Muestra distribución y composición.'),
      'Low Angle': window.__('Desde abajo. Engrandece al sujeto, lo hace imponente.'),
      'High Angle': window.__('Desde arriba. Contexto y sensación de observación.'),

      // Lente
      '24mm (Wide Environmental)': window.__('Gran angular. Abarca el entorno y exagera la profundidad.'),
      '35mm (Natural)': window.__('Mirada natural, parecida al ojo humano. Versátil y honesto.'),
      '50mm (Balanced)': window.__('Equilibrado, sin distorsión. El estándar del producto.'),
      '85mm (Portrait Compression)': window.__('Comprime el fondo y separa al sujeto. Retrato premium.'),
      '100mm Macro': window.__('Máximo detalle a corta distancia. Texturas y materiales.'),

      // Encuadre
      'Centered': window.__('Sujeto al centro. Estable, directo, comercial clásico.'),
      'Rule of thirds': window.__('Sujeto descentrado sobre líneas guía. Natural y dinámico.'),
      'Negative space left': window.__('Aire a la izquierda. Deja sitio para texto o copy.'),
      'Negative space right': window.__('Aire a la derecha. Deja sitio para texto o copy.'),
      'Symmetrical': window.__('Composición simétrica. Orden, calma, autoridad.'),
      'Dynamic off-center': window.__('Composición descentrada y con tensión. Editorial.'),

      // Profundidad de campo
      'Deep focus': window.__('Todo nítido, del frente al fondo. Muestra el conjunto.'),
      'Shallow depth': window.__('Sujeto nítido, fondo suave. Separa sin borrar el contexto.'),
      'Heavy bokeh': window.__('Fondo muy desenfocado. Aísla al sujeto por completo.'),
      'Macro focus stack': window.__('Nitidez total incluso en macro. Cada textura se ve.'),

      // Fondo
      'Seamless studio': window.__('Fondo infinito de estudio. Limpio, sin distracciones.'),
      'Natural environment': window.__('El producto en un entorno real. Creíble y cercano.'),
      'Textured surface': window.__('Superficie con material visible (piedra, madera, tela).'),
      'Gradient sweep': window.__('Degradado suave de color. Moderno y gráfico.'),
      'Dark void': window.__('Fondo oscuro sin detalle. Premium y dramático.'),
      'Lifestyle set': window.__('Escena montada de vida real. Contexto de uso.'),

      // Luz
      'Soft diffused': window.__('Luz suave y envolvente, sin sombras duras. Cálida y limpia.'),
      'Hard contrast': window.__('Luces fuertes y sombras marcadas. Dramatismo visual.'),
      'Rim light': window.__('Luz que recorta el contorno. Premium, separa del fondo.'),
      'Backlit silhouette': window.__('Sujeto a contraluz, silueta contra la luz. Misterio.'),
      'Studio commercial': window.__('Iluminación de estudio profesional. Pareja y comercial.'),
      'Natural daylight': window.__('Luz natural de día. Auténtico, lifestyle, accesible.'),
      'Dramatic spotlight': window.__('Foco concentrado sobre el sujeto. Protagonismo total.'),

      // Contraste
      'Low': window.__('Contraste bajo. Tonos planos y suaves, look documental o vintage.'),
      'Medium': window.__('Contraste balanceado. Look natural y versátil.'),
      'High': window.__('Contraste alto. Imagen punchy y vibrante.'),
      'Ultra contrast': window.__('Contraste extremo. Look gráfico, casi de moda editorial.'),

      // Temperatura
      'Neutral': window.__('Temperatura neutra. Colores reales sin tinte cálido ni frío.'),
      'Warm': window.__('Tonos cálidos (amarillos, naranjas). Acogedor, dorado, premium.'),
      'Cold': window.__('Tonos fríos (azules). Tecnológico, sereno, sofisticado.'),

      // Tono
      'Clean commercial': window.__('Look comercial clásico. Limpio, claro, vende sin distracciones.'),
      'Cinematic dramatic': window.__('Look de cine con paleta rica y tensión.'),
      'Hyperreal product': window.__('Producto hiperdetallado, casi macro. Saca lo mejor del objeto.'),
      'Minimal luxury': window.__('Estética minimal premium. Pocos elementos, mucho aire.'),
      'Dark premium': window.__('Paleta oscura y elegante. Gama alta nocturna.'),
      'Bright energetic': window.__('Colores vivos y luminosos. Joven y social.'),
      'Editorial fashion': window.__('Estética de revista de moda. Sofisticado y aspiracional.'),
      'Documentary': window.__('Look auténtico y crudo. Sin filtros, real, humano.'),

      // Color grade / energía
      'High saturation': window.__('Colores muy saturados. Vibrante y llamativo.'),
      'Muted tones': window.__('Tonos apagados y elegantes. Premium discreto.'),
      'Moderate': window.__('Energía visual contenida. Equilibrio entre calma y presencia.'),
      'Peak': window.__('Energía visual máxima. Vivo, saturado, alta intensidad.')
    };

    const VALUE_ICONS = {
      'Macro Detail': 'aisc-ico aisc-ico--search',
      'Close-up': 'aisc-ico aisc-ico--minimize',
      'Medium Shot': 'aisc-ico aisc-ico--user',
      'Wide Shot': 'aisc-ico aisc-ico--expand',
      'Hero Product Frame': 'aisc-ico aisc-ico--product',
      'Flat Lay': 'aisc-ico aisc-ico--grid',
      'Top Down': 'aisc-ico aisc-ico--arrow-down',
      'Low Angle': 'aisc-ico aisc-ico--arrow-up',
      'High Angle': 'aisc-ico aisc-ico--arrow-down',

      '24mm (Wide Environmental)': 'aisc-ico aisc-ico--expand',
      '35mm (Natural)': 'aisc-ico aisc-ico--camera',
      '50mm (Balanced)': 'aisc-ico aisc-ico--circle',
      '85mm (Portrait Compression)': 'aisc-ico aisc-ico--user',
      '100mm Macro': 'aisc-ico aisc-ico--search',

      'Centered': 'aisc-ico aisc-ico--goal',
      'Rule of thirds': 'aisc-ico aisc-ico--grid',
      'Negative space left': 'aisc-ico aisc-ico--arrow-left',
      'Negative space right': 'aisc-ico aisc-ico--arrow-right',
      'Symmetrical': 'aisc-ico aisc-ico--crop',
      'Dynamic off-center': 'aisc-ico aisc-ico--zap',

      'Deep focus': 'aisc-ico aisc-ico--layers',
      'Shallow depth': 'aisc-ico aisc-ico--filter',
      'Heavy bokeh': 'aisc-ico aisc-ico--circle',
      'Macro focus stack': 'aisc-ico aisc-ico--search',

      'Seamless studio': 'aisc-ico aisc-ico--store',
      'Natural environment': 'aisc-ico aisc-ico--sun',
      'Textured surface': 'aisc-ico aisc-ico--grid',
      'Gradient sweep': 'aisc-ico aisc-ico--palette',
      'Dark void': 'aisc-ico aisc-ico--moon',
      'Lifestyle set': 'aisc-ico aisc-ico--characters',

      'Soft diffused': 'aisc-ico aisc-ico--cloud',
      'Hard contrast': 'fa-mountain-sun',
      'Rim light': 'aisc-ico aisc-ico--moon',
      'Backlit silhouette': 'aisc-ico aisc-ico--user-slash',
      'Studio commercial': 'aisc-ico aisc-ico--store',
      'Natural daylight': 'aisc-ico aisc-ico--sun',
      'Dramatic spotlight': 'aisc-ico aisc-ico--goal',

      'Low': 'aisc-ico aisc-ico--loader',
      'Medium': 'aisc-ico aisc-ico--moon',
      'High': 'aisc-ico aisc-ico--circle',
      'Ultra contrast': 'fa-circle-radiation',

      'Neutral': 'aisc-ico aisc-ico--circle',
      'Warm': 'aisc-ico aisc-ico--fire',
      'Cold': 'fa-snowflake',

      'Clean commercial': 'aisc-ico aisc-ico--eraser',
      'Cinematic dramatic': 'aisc-ico aisc-ico--characters',
      'Hyperreal product': 'aisc-ico aisc-ico--product',
      'Minimal luxury': 'fa-gem',
      'Dark premium': 'aisc-ico aisc-ico--moon',
      'Bright energetic': 'aisc-ico aisc-ico--zap',
      'Editorial fashion': 'aisc-ico aisc-ico--book',
      'Documentary': 'aisc-ico aisc-ico--camera',

      'High saturation': 'aisc-ico aisc-ico--palette',
      'Muted tones': 'aisc-ico aisc-ico--circle',
      'Moderate': 'aisc-ico aisc-ico--circle',
      'Peak': 'aisc-ico aisc-ico--fire'
    };

    // Registro de repintados: syncPhotographyToSelects() los llama tras asignar
    // valores por código (un preset, el reset), porque esa asignación no
    // dispara 'change' y los tiles se quedarían mudos.
    this._photoTileRenderers = [];
    ImageView.PHOTO_SELECT_CONFIG.forEach(([id, key]) => {
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
          const icon = VALUE_ICONS[opt.value] || fallbackIcon;
          const desc = VALUE_DESCRIPTIONS[opt.value] || '';
          const descAttr = desc ? ` data-desc="${this.escapeHtml(desc)}"` : '';
          return `
            <button type="button" class="video-cine-tile${current === opt.value ? ' is-selected' : ''}" data-value="${this.escapeHtml(opt.value)}" aria-pressed="${current === opt.value ? 'true' : 'false'}"${descAttr} aria-label="${this.escapeHtml(opt.text)}${desc ? ' — ' + this.escapeHtml(desc) : ''}">
              <i class="fas ${icon} video-cine-tile__icon" aria-hidden="true"></i>
              <span class="video-cine-tile__label">${this.escapeHtml(opt.text)}</span>
              ${desc ? `<span class="video-cine-tile__tooltip" role="tooltip">${this.escapeHtml(desc)}</span>` : ''}
            </button>`;
        }).join('');
      };
      renderTiles();
      this._photoTileRenderers.push(renderTiles);
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

  syncPhotographyToSelects() {
    ImageView.PHOTO_SELECT_CONFIG.forEach(([id, key]) => {
      const el = this.container.querySelector('#' + id);
      if (!el) return;
      const value = this.photography[key];
      el.value = value !== undefined && value !== null ? String(value) : '';
    });
    // Los <select> son el modelo, pero lo que el usuario MIRA son los tiles.
    // Asignar .value por código no dispara 'change', así que sin este repintado
    // elegir un preset llenaría los selects sin marcar un solo tile.
    this.repaintPhotographyTiles();
  }

  /** Repinta los grids de tiles desde el valor actual de su <select> espejo. */
  repaintPhotographyTiles() {
    (this._photoTileRenderers || []).forEach((repintar) => repintar());
  }

  renderPhotographySelectedTags() {
    const el = this.container.querySelector('#imagePhotoSelectedTags');
    if (!el) return;
    const c = this.photography;
    const tags = [
      c.lens && { key: 'lens', label: c.lens },
      c.lightType && { key: 'lightType', label: c.lightType },
      c.depthOfField && { key: 'depthOfField', label: c.depthOfField }
    ].filter(Boolean);
    if (tags.length === 0) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    el.innerHTML = `<span class="video-cine-selected-label">${window.__('Estilo seleccionado:')}</span>` + tags.map((t) =>
      `<span class="video-cine-tag" data-key="${t.key}">${t.label.replace(/"/g, '&quot;')}<button type="button" class="video-cine-tag-remove" aria-label="${window.__('Quitar {key}', { key: t.key })}">&times;</button></span>`
    ).join('');
    this._bindTagRemoval(el);
  }

  renderDirectorVariables() {
    const el = this.container.querySelector('#imageDirectorVariables');
    if (!el) return;
    const c = this.photography;
    const tags = [
      c.shotType && { label: c.shotType, key: 'shotType' },
      c.lens && { label: c.lens, key: 'lens' },
      c.framing && { label: c.framing, key: 'framing' },
      c.depthOfField && { label: c.depthOfField, key: 'depthOfField' },
      c.lightType && { label: c.lightType, key: 'lightType' },
      c.tone && { label: c.tone, key: 'tone' }
    ].filter(Boolean);
    if (tags.length === 0) {
      el.innerHTML = '';
      el.style.display = 'none';
      this.scheduleResizePromptInput();
      return;
    }
    el.style.display = 'flex';
    el.className = 'video-director-variables-row video-cine-selected-tags';
    el.innerHTML = `<span class="video-cine-selected-label">${window.__('Variables:')}</span>` + tags.map((t) =>
      `<span class="video-cine-tag video-director-variable-tag" data-key="${t.key}">${t.label.replace(/"/g, '&quot;')}<button type="button" class="video-cine-tag-remove" aria-label="${window.__('Quitar {key}', { key: t.key })}">&times;</button></span>`
    ).join('');
    this._bindTagRemoval(el);
    this.scheduleResizePromptInput();
  }

  /** Quitar un tag apaga la variable en el state y repinta las dos filas. */
  _bindTagRemoval(contenedor) {
    contenedor.querySelectorAll('.video-cine-tag-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = btn.closest('.video-cine-tag')?.dataset?.key;
        if (!key) return;
        this.photography[key] = '';
        this.syncPhotographyToSelects();
        this.renderPhotographySelectedTags();
        this.renderDirectorVariables();
      });
    });
  }

  // ── Generación ──────────────────────────────────────────────────────────

  /**
   * Lee la consola y el sidebar y los deja en el shape que espera
   * functions/kie-image-create.js. Los nombres de campo son NUESTROS: el
   * mapeo a lo que KIE reconoce vive en la función, en un solo sitio.
   */
  buildImagePayload() {
    const val = (sel, fallback) => {
      const el = this.container.querySelector(sel);
      return el && el.value ? String(el.value) : fallback;
    };
    return {
      prompt: this.promptInput ? this.promptInput.value.trim() : '',
      aspect_ratio: val('#imageAspectRatio', '1:1'),
      resolution: val('#imageResolution', '2K'),
      output_format: val('#imageOutputFormat', 'png'),
      reference_images: this.imageRefs.map((r) => r.url),
      // Subconjunto de reference_images que NO debe alterarse (Stack de
      // activos). Van además en reference_images porque para KIE ocupan cupo
      // como cualquier otra imagen; el lock es una instrucción del prompt, no
      // un campo aparte de la API.
      product_lock_urls: this.imageRefs.filter((r) => r.lock).map((r) => r.url),
      photography: { ...this.photography },
      direction: {
        mood: val('#imageMood', ''),
        realism: val('#imageRealism', ''),
        finish: val('#imageFinish', '')
      },
      campaign: this.selectedCampaignId || null,
      audience: this.selectedAudienceId || null,
      brand_context: this.buildBrandContextForAPI(),
      organization_id: this.organizationId || null
    };
  }

  async startGeneration() {
    if (this._generating) return;
    const payload = this.buildImagePayload();

    if (!payload.prompt) {
      this.showError(window.__('Escribe primero qué imagen quieres: sujeto, escenario y qué debe transmitir.'));
      return;
    }
    if (!this.organizationId) {
      this.showError(window.__('Selecciona una organización para generar imágenes.'));
      return;
    }
    if (!this.supabase) {
      this.showError(window.__('Sesión no disponible. Recarga la página y reintenta.'));
      return;
    }

    this._setGenerating(true);
    this.showStatus(window.__('Preparando la toma…'), true);

    let created;
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error(window.__('Inicia sesión para generar imágenes.'));

      const res = await fetch(ImageView.IMAGE_CREATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload)
      });
      // Un 404 devuelve HTML: sin este guard el error sería "Unexpected token <".
      let data = {};
      try { data = await res.json(); }
      catch (parseErr) {
        throw new Error(
          window.__('El servicio de imagen no respondió correctamente (estado {status}).', { status: res.status }),
          { cause: parseErr }
        );
      }
      if (!res.ok || !data.taskId) throw new Error(data.error || window.__('No se pudo iniciar la generación'));
      created = data;
    } catch (err) {
      this._setGenerating(false);
      this.showError(err.message || window.__('No se pudo iniciar la generación'));
      return;
    }

    this._promptTokens = {
      input: created.openai_input_tokens || 0,
      output: created.openai_output_tokens || 0,
      model: created.openai_model || null
    };

    // Fila en 'processing' ANTES del polling: si el usuario cierra la pestaña,
    // queda constancia de la tarea en vez de un cobro sin output.
    this._lastKieOutputId = await this.saveSystemAIOutput({
      provider: 'kie',
      output_type: 'image',
      external_job_id: created.taskId,
      status: 'processing',
      prompt_used: created.prompt || payload.prompt,
      models: { generator: created.kie_model || null, prompter: created.openai_model || null },
      technical_params: created.technical_params || {
        aspect_ratio: payload.aspect_ratio,
        resolution: payload.resolution,
        output_format: payload.output_format
      },
      metadata: {
        kind: 'image_generated',
        reference_count: created.reference_count ?? payload.reference_images.length,
        product_lock_count: payload.product_lock_urls.length,
        photography: payload.photography,
        direction: payload.direction,
        campaign_concept: payload.campaign,
        audience_concept: payload.audience
      }
    });

    this.showStatus(window.__('Generando la imagen. Suele tardar menos de un minuto…'), true);
    await this.pollTask(created.taskId);
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

  /** Cierra el intento: apaga el polling, libera el botón y marca la fila. */
  async _failRun(message) {
    this.stopPolling();
    this._setGenerating(false);
    this.showError(message);
    if (this._lastKieOutputId) {
      await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: message });
      this._lastKieOutputId = null;
    }
  }

  async pollTask(taskId) {
    const statusUrl = `${ImageView.KIE_TASK_STATUS_API}?taskId=${encodeURIComponent(taskId)}`;
    const pollStartedAt = Date.now();

    const poll = async () => {
      if (Date.now() - pollStartedAt > ImageView.POLL_MAX_DURATION_MS) {
        await this._failRun(window.__('La generación superó el tiempo máximo de espera (6 min). Reintenta con un brief más corto o menos referencias.'));
        return;
      }
      // Pausamos el fetch a KIE cuando la pestaña está oculta. El timeout se
      // sigue midiendo contra wall-clock, así que no se alarga la espera total.
      if (document.hidden) return;
      try {
        const res = await fetch(statusUrl);
        let data = {};
        try { data = await res.json(); }
        catch (parseErr) {
          console.error('[Image] GET', statusUrl, ': respuesta no es JSON. Status:', res.status, parseErr);
          await this._failRun(window.__('El servicio de imagen no respondió correctamente (estado {status}). Intenta de nuevo en unos minutos.', { status: res.status }));
          return;
        }
        if (!res.ok) {
          await this._failRun(data.error || window.__('Error al consultar el estado'));
          return;
        }

        const state = data.data?.state;
        if (state === 'success') {
          this.stopPolling();
          let resultJson = data.data?.resultJson;
          if (typeof resultJson === 'string') {
            try { resultJson = JSON.parse(resultJson); } catch (_) { /* noop */ }
          }
          const urls = resultJson?.resultUrls;
          const kieUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
          if (!kieUrl) {
            await this._failRun(window.__('No se encontró URL de la imagen en la respuesta'));
            return;
          }
          try {
            const uploaded = await this.persistKieImage(kieUrl, taskId);
            if (!uploaded?.publicUrl) {
              await this._failRun(window.__('No se pudo guardar la imagen en tu cuenta'));
              return;
            }
            this.showResult(uploaded.publicUrl);
            this._setGenerating(false);

            // Cobro dinámico: kie-task-finalize lee creditsConsumed real de KIE
            // y le suma los tokens de OpenAI del prompt + el markup del kind.
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
                    kind: 'image_generated',
                    organization_id: this.organizationId,
                    source_output_id: this._lastKieOutputId || null,
                    openai_input_tokens: this._promptTokens?.input || 0,
                    openai_output_tokens: this._promptTokens?.output || 0,
                    openai_model: this._promptTokens?.model || 'gpt-4o-mini'
                  })
                });
                finalizeResult = await finalizeRes.json().catch(() => null);
                if (!finalizeRes.ok) {
                  console.warn('[Image] finalize falló, imagen guardada sin cobro:', finalizeResult);
                } else if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
                  window.appNavigation.loadCreditsFromDb(this.organizationId);
                }
              }
            } catch (e) {
              console.warn('[Image] finalize exception:', e);
            }

            if (this._lastKieOutputId) {
              // Merge de metadata: preserva kind y campos del insert original.
              await this.updateSystemAIOutput(this._lastKieOutputId, {
                status: 'completed',
                storage_path: uploaded.storagePath,
                metadata: {
                  kind: 'image_generated',
                  resultUrls: urls,
                  image_url: uploaded.publicUrl,
                  kie_source_url: kieUrl,
                  credits_charged: finalizeResult?.credits_charged ?? null,
                  cost_breakdown: finalizeResult?.cost_breakdown ?? null
                },
                error_message: null
              });
              this._lastKieOutputId = null;
            }
            // La imagen recién hecha entra al carrusel de Escenas sin recargar.
            await this.loadImageProductions();
            this.renderEscenasCarousel();
          } catch (err) {
            await this._failRun(err.message || window.__('Error al guardar la imagen'));
          }
          return;
        }
        if (state === 'fail') {
          const rawMsg = data.data?.failMsg || data.data?.failCode || window.__('La generación falló');
          await this._failRun(rawMsg);
          return;
        }

        this.showStatus(window.__('Generando la imagen. Suele tardar menos de un minuto…'), true);
      } catch (err) {
        await this._failRun(err.message || window.__('Error al consultar el estado'));
      }
    };

    await poll();
    if (!this._generating) return; // ya terminó (éxito o fallo) en el primer poll
    this._pollInterval = setInterval(poll, ImageView.POLL_INTERVAL_MS);
    // Al volver a la pestaña, un poll inmediato evita esperar 3s al próximo tick.
    this._pollVisibilityHandler = () => { if (!document.hidden) poll(); };
    this.addEventListener(document, 'visibilitychange', this._pollVisibilityHandler);
  }

  _teardown() {
    this.stopPolling();
    if (this._resizeBriefOnWin) {
      window.removeEventListener('resize', this._resizeBriefOnWin);
      this._resizeBriefOnWin = null;
    }
    if (this._helpOutsideHandler) {
      document.removeEventListener('click', this._helpOutsideHandler);
      this._helpOutsideHandler = null;
    }
  }

  onLeave() {
    this._teardown();
  }

  destroy() {
    this._teardown();
    super.destroy();
  }
}

window.ImageView = ImageView;
