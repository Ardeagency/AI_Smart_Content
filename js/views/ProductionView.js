/**
 * ProductionView - Vista del dashboard de producción (contenido generado)
 * Maneja el dashboard con información de perfil, productos y campañas
 * 
 * Rutas soportadas:
 * - /org/:orgId/production — con contexto de organización
 * - /production — sin org (usa organización guardada)
 */
class ProductionView extends BaseView {
  static cacheable = true;
  static documentTitle = 'Producción';

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
                    ${this.skeletonGrid(8, 'lg')}
                </div>
            </section>
        </div>
    </main>

    <!-- Modal de previsualización: shell vacío que LivingManager.openProductionModal popula -->
    <div class="production-modal" id="productionModal" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="production-modal-backdrop" data-action="modal-close"></div>
        <div class="production-modal-content">
            <!-- Columna izquierda: asset full-bleed + toolbar inferior overlay -->
            <div class="production-modal-visual">
                <div class="production-modal-visual-inner">
                    <img id="pmodalImage" src="" alt="" hidden>
                    <video id="pmodalVideo" controls playsinline preload="metadata" hidden aria-label="Production video"></video>
                </div>
                <div class="production-modal-toolbar" role="toolbar" aria-label="Acciones sobre la produccion">
                    <button type="button" class="pmodal-toolpill is-active" data-tool="overview"><i class="fas fa-bars"></i><span>Overview</span></button>
                    <button type="button" class="pmodal-toolpill" data-tool="edit" data-kie-model="google/nano-banana-edit" disabled title="Proximamente"><i class="fas fa-pen"></i><span>Editar</span></button>
                    <button type="button" class="pmodal-toolpill" data-tool="upscale" data-kie-model="topaz/image-upscale" disabled title="Proximamente"><i class="fas fa-expand-alt"></i><span>Mejorar 4K</span></button>
                    <button type="button" class="pmodal-toolpill" data-tool="remove-bg" data-kie-model="recraft/remove-background" disabled title="Proximamente"><i class="fas fa-cut"></i><span>Sin fondo</span></button>
                    <button type="button" class="pmodal-toolpill" data-tool="variations" disabled title="Proximamente"><i class="fas fa-arrows-rotate"></i><span>Variar</span></button>
                    <button type="button" class="pmodal-toolpill" data-tool="animate" disabled title="Proximamente"><i class="fas fa-film"></i><span>Animar</span></button>
                </div>
            </div>

            <!-- Columna derecha: header con cerrar, tabs Output/Input, contenido scrolleable, CTAs y footer -->
            <aside class="production-modal-side" aria-label="Detalles de la produccion">
                <header class="pmodal-side-header">
                    <button type="button" class="pmodal-close" data-action="modal-close" aria-label="Cerrar">
                        <i class="fas fa-times"></i>
                    </button>
                </header>

                <nav class="pmodal-tabs" role="tablist" aria-label="Vistas de produccion">
                    <button type="button" class="pmodal-tab is-active" role="tab" aria-selected="true" data-tab="output">
                        Resultado
                    </button>
                    <button type="button" class="pmodal-tab" role="tab" aria-selected="false" data-tab="input">
                        Briefing
                    </button>
                </nav>

                <div class="pmodal-scroll" id="pmodalScroll">
                    <!-- Pane Output: lo que la produccion genero -->
                    <div class="pmodal-pane pmodal-pane--output is-active" data-pane="output" role="tabpanel">
                        <!-- Strip de siblings (otros outputs del mismo run) -->
                        <div class="pmodal-siblings" id="pmodalSiblings" hidden></div>

                        <!-- Prompt: bloques labeled Notion-style + disclosure de generation details -->
                        <section class="pmodal-section pmodal-prompt-section">
                            <div class="pmodal-prompt-blocks" id="pmodalPromptBlocks"></div>
                            <details class="pmodal-prompt-raw" id="pmodalPromptRaw" hidden>
                                <summary>
                                    <i class="fas fa-chevron-right pmodal-prompt-raw-caret"></i>
                                    <span>Show generation details</span>
                                </summary>
                                <pre class="pmodal-prompt-raw-text" id="pmodalPromptRawText"></pre>
                            </details>
                        </section>

                        <!-- Information rows -->
                        <section class="pmodal-section pmodal-info-section">
                            <h3 class="pmodal-section-title"><i class="fas fa-circle-info"></i> INFORMATION</h3>
                            <div class="pmodal-info-rows" id="pmodalInfoRows"></div>
                        </section>
                    </div>

                    <!-- Pane Input: lo que se uso para generar (entidad, referencias, briefing) -->
                    <div class="pmodal-pane pmodal-pane--input" data-pane="input" role="tabpanel" hidden>
                        <div id="pmodalInputContent"></div>
                    </div>
                </div>

                <!-- CTAs primarios -->
                <div class="pmodal-cta-grid">
                    <button type="button" class="pmodal-cta pmodal-cta--accent" data-action="animate">
                        <i class="fas fa-film"></i>
                        <span>Animate</span>
                    </button>
                    <button type="button" class="pmodal-cta pmodal-cta--outline" data-action="publish" disabled title="Próximamente">
                        <i class="fas fa-upload"></i>
                        <span>Publish</span>
                    </button>
                </div>

                <!-- Secundarios -->
                <div class="pmodal-secondary-grid">
                    <button type="button" class="pmodal-secondary" data-action="open-in">
                        <i class="fas fa-external-link-alt"></i>
                        <span>Open in</span>
                    </button>
                    <button type="button" class="pmodal-secondary" data-action="reference" disabled title="Próximamente">
                        <i class="fas fa-bookmark"></i>
                        <span>Reference</span>
                    </button>
                </div>

                <!-- Footer asimétrico: Download wide + cluster icon-buttons -->
                <footer class="pmodal-footer">
                    <button type="button" class="pmodal-footer-download" data-action="download">
                        <i class="fas fa-download"></i>
                        <span>Download</span>
                    </button>
                    <div class="pmodal-footer-icons">
                        <button type="button" class="pmodal-icon-btn" data-action="like" aria-pressed="false" aria-label="Me gusta">
                            <i class="fas fa-heart"></i>
                        </button>
                        <div class="pmodal-kebab-wrap">
                            <button type="button" class="pmodal-icon-btn" data-action="kebab" aria-expanded="false" aria-label="Más">
                                <i class="fas fa-bars"></i>
                            </button>
                            <div class="pmodal-kebab-menu" role="menu" hidden>
                                <button type="button" role="menuitem" data-action="copy-prompt">
                                    <i class="fas fa-copy"></i> Copiar prompt
                                </button>
                                <button type="button" role="menuitem" data-action="copy-url">
                                    <i class="fas fa-link"></i> Copiar enlace
                                </button>
                                <button type="button" role="menuitem" class="pmodal-kebab-danger" data-action="delete">
                                    <i class="fas fa-trash"></i> Eliminar producción
                                </button>
                            </div>
                        </div>
                    </div>
                </footer>
            </aside>
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
        : '/create';
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

    // Portal: re-anclar el modal al <body> para escapar cualquier stacking
    // context del <main> de la vista. Sin esto, z-index del modal queda
    // atrapado dentro del main y el sidebar/header lo tapan.
    this.portalModalToBody();

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
   * Re-ancla el #productionModal a document.body si esta dentro de la vista.
   * Necesario para que el modal cubra header y sidebar (escapar el stacking
   * context del <main>). Idempotente: si ya esta en body, no hace nada.
   */
  portalModalToBody() {
    const modal = document.getElementById('productionModal');
    if (!modal) return;
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  }

  /**
   * Mueve la barra de filtros al header principal (solo Production).
   * El header aplica efecto glass cuando contiene los filtros.
   *
   * Race condition: router.handleRoute lanza Navigation.render() en paralelo con
   * view.render(); si Navigation está re-renderizando cuando este método corre,
   * #headerProductionSlot no existe aún y los filtros quedan en la vista. Hacemos
   * retry breve hasta que el slot aparezca (Navigation.render es async pero rápido).
   */
  moveFiltersToHeader(attempts = 0) {
    const slot = document.getElementById('headerProductionSlot');
    const filters = document.querySelector('.living-history-filters');
    if (!filters) return;
    if (!slot) {
      if (attempts < 20) {
        this._filterMoveTimer = setTimeout(() => this.moveFiltersToHeader(attempts + 1), 50);
      }
      return;
    }
    slot.innerHTML = '';
    slot.appendChild(filters);
    slot.setAttribute('aria-hidden', 'false');
    document.body.classList.add('production-filters-in-header');
  }

  /**
   * Restaura el slot del header al salir de Production.
   */
  clearFiltersFromHeader() {
    if (this._filterMoveTimer) {
      clearTimeout(this._filterMoveTimer);
      this._filterMoveTimer = null;
    }
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

