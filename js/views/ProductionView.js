/**
 * ProductionView - Vista del dashboard de producción (contenido generado)
 * Maneja el dashboard con información de perfil, productos y campañas
 * 
 * Rutas soportadas:
 * - /org/:orgId/production - Con contexto de organización
 * - /production - Sin org (usa organización guardada)
 * - /org/:orgId/historial, /historial, /living - Legacy (misma vista)
 */
class ProductionView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.livingManager = null;
    this.orgId = null;
  }

  renderHTML() {
    return `
    <!-- Contenido Principal: Production (todo el contenido producido) -->
    <main class="main-content living-main-content">
        <div class="living-container">
            <section class="living-history-section">
                <!-- Header de filtros -->
                <header class="living-history-filters">
                    <div class="living-filter living-filter-date">
                        <label class="living-filter-label">Fecha</label>
                        <div class="living-date-trigger" id="livingDateTrigger" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false">
                            <span class="living-date-value" id="livingDateValue">Seleccionar</span>
                            <i class="fas fa-calendar-alt living-date-icon" aria-hidden="true"></i>
                        </div>
                        <div class="living-date-dropdown" id="livingDateDropdown" aria-hidden="true">
                            <div class="living-date-nav">
                                <button type="button" class="living-date-nav-btn" id="livingDatePrev" aria-label="Mes anterior"><i class="fas fa-chevron-left"></i></button>
                                <span class="living-date-month-year" id="livingDateMonthYear">Noviembre 2022</span>
                                <button type="button" class="living-date-nav-btn" id="livingDateNext" aria-label="Mes siguiente"><i class="fas fa-chevron-right"></i></button>
                            </div>
                            <div class="living-date-weekdays">
                                <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
                            </div>
                            <div class="living-date-grid" id="livingDateGrid"></div>
                            <div class="living-date-actions">
                                <button type="button" class="living-date-clear" id="livingDateClear">Limpiar</button>
                            </div>
                        </div>
                    </div>
                    <div class="living-filter living-filter-type">
                        <label class="living-filter-label">Tipo de contenido</label>
                        <select class="living-filter-select" id="livingFilterType">
                            <option value="">Todos</option>
                            <option value="image">Imagen</option>
                            <option value="video">Video</option>
                            <option value="text">Texto</option>
                        </select>
                    </div>
                    <div class="living-filter living-filter-flow">
                        <label class="living-filter-label">Flujo</label>
                        <select class="living-filter-select" id="livingFilterFlow">
                            <option value="">Todos los flujos</option>
                        </select>
                    </div>
                </header>
                <div class="living-history-content living-history-masonry" id="livingHistoryContent">
                </div>
            </section>
        </div>
    </main>

    <!-- Modal de previsualización (estilo referencia: dos columnas, herramientas, autor, prompt, información, acciones) -->
    <div class="living-viewer-modal modal" id="livingViewerModal">
        <div class="living-viewer-backdrop" id="livingViewerBackdrop"></div>
        <div class="living-viewer-container">
            <div class="living-viewer-content">
                <!-- Columna izquierda: solo imagen de la producción -->
                <div class="living-viewer-left">
                    <div class="living-viewer-visual">
                        <img id="livingViewerImage" src="" alt="" />
                        <video id="livingViewerVideo" class="living-viewer-video" controls playsinline preload="metadata" style="display: none;" aria-label="Vídeo de la producción"></video>
                    </div>
                </div>
                <!-- Columna derecha: scroll + cerrar -->
                <div class="living-viewer-right">
                    <header class="living-viewer-right-header">
                        <button type="button" class="living-viewer-close" id="livingViewerClose" aria-label="Cerrar">
                            <i class="fas fa-times"></i>
                        </button>
                    </header>
                    <div class="living-viewer-right-body">
                        <div class="living-viewer-right-scroll">
                            <div class="living-viewer-right-inner">
                                <section class="living-viewer-section">
                                    <div class="living-viewer-section-header">
                                        <div class="living-viewer-section-header-left">
                                            <i class="fas fa-sliders living-viewer-section-icon"></i>
                                            <p class="living-viewer-block-title">Prompt</p>
                                        </div>
                                        <div class="living-viewer-section-header-right">
                                            <button type="button" class="living-viewer-copy-prompt" id="livingViewerCopyPrompt" title="Copiar prompt">Copiar</button>
                                        </div>
                                    </div>
                                    <div class="living-viewer-section-body">
                                        <div class="living-viewer-prompt-text" id="livingViewerPrompt"></div>
                                    </div>
                                </section>
                                <section class="living-viewer-section">
                                    <div class="living-viewer-section-header">
                                        <div class="living-viewer-section-header-left">
                                            <i class="fas fa-info-circle living-viewer-section-icon"></i>
                                            <p class="living-viewer-block-title">Information</p>
                                        </div>
                                    </div>
                                    <div class="living-viewer-section-body living-viewer-info-rows" id="livingViewerMetadata"></div>
                                </section>
                            </div>
                        </div>
                    </div>
                    <footer class="living-viewer-right-footer living-viewer-correction-section" id="livingViewerCorrectionSection" style="display: none;">
                        <input
                            type="text"
                            id="livingViewerCorrectionInput"
                            class="living-viewer-correction-input"
                            placeholder="Corregir producción... Ej: mejorar iluminación del producto, mantener encuadre y fondo"
                            maxlength="500"
                        />
                        <button type="button" id="livingViewerCorrectionBtn" class="living-viewer-correction-btn">Regenerar imagen</button>
                        <p class="living-viewer-correction-status" id="livingViewerCorrectionStatus" aria-live="polite"></p>
                    </footer>
                </div>
            </div>
        </div>
    </div>
`;
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Verificar autenticación
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    } else {
      const isAuth = await this.checkAuthentication();
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }

    // Obtener orgId de los parámetros de ruta o del estado
    this.orgId = this.routeParams?.orgId || 
                 window.appState?.get('selectedOrganizationId') ||
                 localStorage.getItem('selectedOrganizationId');
    
    // Si no hay orgId, redirigir a organización por defecto o configuración
    if (!this.orgId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/form_org';
      window.router?.navigate(url, true);
      return;
    }

    // Guardar orgId para uso futuro
    if (window.appState) {
      window.appState.set('selectedOrganizationId', this.orgId, true);
    }
    localStorage.setItem('selectedOrganizationId', this.orgId);
  }

  /**
   * Inicializar la vista
   */
  async init() {
    // Mover filtros al header principal (solo en Production)
    this.moveFiltersToHeader();

    // Cargar script si es necesario
    if (!window.LivingManager) {
      await this.loadScript('js/living.js', 'LivingManager');
    }

    // Crear instancia de LivingManager con el orgId
    if (window.LivingManager) {
      this.livingManager = new window.LivingManager();
      // Pasar orgId al manager
      this.livingManager.organizationId = this.orgId;
      await this.livingManager.init();
    } else {
      console.error('No se pudo cargar LivingManager');
    }

    // Setup links para usar router con orgId
    this.setupRouterLinks();
  }

  /**
   * Mueve la barra de filtros al header principal (solo Production).
   * El header aplica efecto glass cuando contiene los filtros.
   */
  moveFiltersToHeader() {
    const slot = document.getElementById('headerProductionSlot');
    const filters = document.querySelector('.living-history-filters');
    if (slot && filters) {
      slot.innerHTML = '';
      slot.appendChild(filters);
      slot.setAttribute('aria-hidden', 'false');
      document.body.classList.add('production-filters-in-header');
    }
  }

  /**
   * Restaura el slot del header al salir de Production.
   */
  clearFiltersFromHeader() {
    const slot = document.getElementById('headerProductionSlot');
    if (slot) {
      slot.innerHTML = '';
      slot.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('production-filters-in-header');
  }

  /**
   * Configurar links para usar router con contexto de organización
   */
  setupRouterLinks() {
    const basePath = (this.orgId && typeof window.getOrgPathPrefix === 'function')
      ? window.getOrgPathPrefix(this.orgId, window.currentOrgName || '')
      : '';
    
    const productsLinks = this.querySelectorAll('a[href*="products"]');
    const studioLinks = this.querySelectorAll('a[href*="studio"]');
    const brandLinks = this.querySelectorAll('a[href*="brand"]');

    productsLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        window.router?.navigate(`${basePath}/products`);
      });
    });

    studioLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        window.router?.navigate(`${basePath}/studio`);
      });
    });

    brandLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        window.router?.navigate(`${basePath}/brand`);
      });
    });
  }

  /**
   * Verificar autenticación
   */
  async checkAuthentication() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return false;

    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    // Usar SupabaseService si está disponible
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    
    // Fallback a app-loader
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch (error) {
        return null;
      }
    }
    return window.supabase || null;
  }

  /**
   * Hook al salir de la vista
   */
  async onLeave() {
    this.clearFiltersFromHeader();
    if (this.livingManager && typeof this.livingManager.destroy === 'function') {
      this.livingManager.destroy();
    }
    this.livingManager = null;
  }
}

// Hacer disponible globalmente
window.ProductionView = ProductionView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductionView;
}

