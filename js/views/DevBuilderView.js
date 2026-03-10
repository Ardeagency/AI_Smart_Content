/**
 * DevBuilderView.js
 * Constructor visual de flujos de IA para el Portal de Desarrolladores (PaaS)
 * Permite crear y editar content_flows con input_schema y ui_layout_config
 */

class DevBuilderView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.flowId = null; // null = nuevo flujo, UUID = editando
    this.isEditMode = false;
    
    // Estado del flujo (alineado con content_flows en schema: execution_mode, subcategory_id, show_in_catalog)
    this.flowData = {
      name: '',
      description: '',
      category_id: null,
      subcategory_id: null,
      output_type: 'text',
      flow_category_type: 'manual',
      token_cost: 1,
      flow_image_url: null,
      status: 'draft',
      version: '1.0.0',
      execution_mode: 'single_step',
      show_in_catalog: false
    };

    /** Campos por defecto para flujos automated (programación). Se guardan en flow_modules.input_schema del primer módulo.
     * tipo_entidad condiciona el campo Entidad: productos → image_selector (carrusel múltiple), servicio → dropdown. */
    this.DEFAULT_SCHEDULE_SCHEMA = {
      fields: [
        { key: 'cron_expression', label: 'Programación', input_type: 'cron_schedule', required: true },
        { key: 'tipo_entidad', label: 'Tipo de entidad', input_type: 'select', required: true, options: [{ value: 'productos', label: 'Productos' }, { value: 'servicio', label: 'Servicio' }], defaultValue: 'productos' },
        { key: 'entity_id', label: 'Entidad', input_type: 'entity_selector' },
        { key: 'campaign_id', label: 'Campaña', input_type: 'select', required: true, options: [{ value: '', label: 'Selecciona campaña...' }] },
        { key: 'audience_id', label: 'Audiencia', input_type: 'select', required: true, options: [{ value: '', label: 'Selecciona audiencia...' }] },
        { key: 'aspect_ratio', label: 'Formato', input_type: 'aspect_ratio', options: [{ value: '1:1', label: '1:1' }, { value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }, { value: '4:5', label: '4:5' }], defaultValue: '1:1' },
        { key: 'production_count', label: 'Producciones por ejecución', input_type: 'num_stepper', min: 1, max: 10, step: 1, defaultValue: 1 },
        { key: 'production_specifications', label: 'Especificaciones', input_type: 'textarea' }
      ]
    };
    
    // Schema de inputs (array de campos)
    this.inputSchema = [];
    
    // Configuración de UI
    this.uiLayoutConfig = {
      theme: 'default',
      columns: 1,
      showLabels: true,
      showHelperText: true,
      submitButtonText: 'Generar',
      submitButtonPosition: 'right'
    };
    
    // Detalles técnicos por módulo (flow_technical_details). Clave = flow_module_id.
    this.flowTechnicalDetailsByModule = {};
    // Compat: webhooks del primer módulo para validaciones/publicar (se sincronizan desde flowModules[0])
    this.technicalDetails = {
      webhook_url_test: '',
      webhook_url_prod: '',
      webhook_method: 'POST',
      platform_name: 'n8n',
      editor_url: ''
    };
    
    // Panel derecho Detalles técnicos: key del módulo seleccionado (uuid o 'idx_0', 'idx_1'...)
    this.technicalDetailsPanelModuleKey = null;
    
    // Templates de componentes disponibles
    this.componentTemplates = [];
    
    // Categorías y subcategorías disponibles
    this.categories = [];
    this.subcategories = [];
    
    // ID del flow_module que se está editando en Técnico (flow_technical_details se enlaza a este id)
    this.currentFlowModuleId = null;
    // Lista de módulos del grafo de ejecución (flow_modules). Cada uno: id?, name, step_order, execution_type, webhook_url_test, webhook_url_prod, is_human_approval_required, next_module_id
    this.flowModules = [];
    // Campo siendo editado
    this.selectedFieldIndex = null;
    
    // Drag state
    this.draggedFieldIndex = null;
    
    // Unsaved changes
    this.hasUnsavedChanges = false;

    // Listeners en document (se eliminan en destroy para evitar fugas)
    this._documentListeners = [];
  }

  renderHTML() {
    return `
      <!-- Header del Builder = pestañas (Configuración, Módulos, Inputs, Ficha) -->
      <header class="builder-tabs-header" id="builderTabsHeader">
        <div class="builder-tabs">
          <button class="builder-tab active" data-tab="settings">
            <i class="ph ph-gear"></i> Configuración
          </button>
          <button class="builder-tab" data-tab="technical">
            <i class="ph ph-stack"></i> Módulos
          </button>
          <button class="builder-tab" data-tab="inputs">
            <i class="ph ph-textbox"></i> Inputs
          </button>
          <button class="builder-tab" data-tab="ficha">
            <i class="ph ph-cardholder"></i> Ficha del Flujo
              </button>
        </div>
      </header>

      <!-- Main Builder Container -->
      <main class="builder-main">
        <!-- Panel izquierdo: Componentes (oculto por defecto; solo visible en pestaña Inputs) -->
        <aside class="builder-sidebar builder-components" style="display: none;">
          <div class="builder-sidebar-header builder-components-header">
            <h3 class="builder-components-title">Componentes</h3>
            <div class="builder-components-search-wrap">
              <i class="ph ph-magnifying-glass builder-components-search-icon"></i>
              <input type="text" class="builder-components-search" id="componentsSearchInput" placeholder="Buscar" aria-label="Buscar componentes">
            </div>
          </div>
          <div class="builder-components-list" id="componentsList"></div>
        </aside>

        <!-- Panel central: contenido de pestañas -->
        <div class="builder-canvas-wrapper">
          <!-- Tab 1: Configuración — grid: portada|nombre, descripción, url, técnico, versión|créditos|catálogo, categoría|subcategoría|tipo -->
          <div class="builder-tab-content active" id="tabSettings">
            <div class="builder-settings-form builder-config-grid">
              <div class="builder-config-row builder-config-row--portada-name">
                <div class="settings-field builder-config-cell builder-config-cell--portada">
                  <label for="flowImagePreview">Portada / media</label>
                  <div class="flow-image-upload" id="flowImageUpload">
                    <div class="image-preview image-preview--upload" id="flowImagePreview" title="Subir portada">
                      <i class="ph ph-image"></i>
                      <span>Subir portada</span>
                    </div>
                    <div class="image-actions">
                      <button type="button" class="btn-small secondary" id="removeImageBtn" style="display: none;"><i class="ph ph-trash"></i> Eliminar</button>
                    </div>
                    <input type="file" id="flowImageInput" accept="image/*,video/*" style="display: none;">
                  </div>
                </div>
                <div class="settings-field builder-config-cell builder-config-cell--name">
                  <label for="flowNameConfig">Nombre del flujo *</label>
                  <input type="text" id="flowNameConfig" placeholder="Ej: Generador de Reels Virales" maxlength="100">
                </div>
              </div>
              <div class="builder-config-row builder-config-row--description">
                <div class="settings-field builder-config-cell builder-config-cell--full">
                  <label for="flowDescription">Descripción</label>
                  <textarea id="flowDescription" placeholder="Describe qué hace este flujo..." rows="3"></textarea>
                </div>
              </div>
              <div class="builder-config-row builder-config-row--url">
                <div class="settings-field builder-config-cell builder-config-cell--full">
                  <label for="flowUrlInput">URL del flujo</label>
                  <div class="flow-url-field" id="flowUrlWrap">
                    <input type="text" class="flow-url-input" id="flowUrlInput" placeholder="— Guarda el flujo para ver la URL">
                    <button type="button" class="btn-small" id="copyFlowUrlBtn" style="display: none;"><i class="ph ph-copy"></i> Copiar</button>
                  </div>
                </div>
              </div>
              <div class="builder-config-row builder-config-row--technical-name">
                <div class="settings-field builder-config-cell builder-config-cell--full">
                  <label for="flowTechnicalName">Nombre técnico</label>
                  <input type="text" id="flowTechnicalName" placeholder="Ej: reels_viral_generator (solo referencia interna)">
                  <span class="field-help">Referencia para desarrolladores y n8n. No se muestra a usuarios.</span>
                </div>
              </div>
              <div class="builder-config-row builder-config-row--version-credits-catalog">
                <div class="settings-field builder-config-cell">
                  <label for="flowVersion">Versión</label>
                  <input type="text" id="flowVersion" value="1.0.0" placeholder="1.0.0">
                </div>
                <div class="settings-field builder-config-cell" id="settingsTokenCostWrap">
                  <label for="flowTokenCost">Créditos (por ejecución)</label>
                  <input type="number" id="flowTokenCost" min="0" max="100" value="1">
                </div>
                <div class="settings-field builder-config-cell builder-config-cell--catalog">
                  <label class="toggle-field">
                    <input type="checkbox" id="uiShowInCatalog">
                    <span>Mostrar en catálogo</span>
                  </label>
                </div>
              </div>
              <div class="builder-config-row builder-config-row--category-type">
                <div class="settings-field builder-config-cell">
                  <label for="flowCategory">Categoría</label>
                  <select id="flowCategory">
                    <option value="">Seleccionar categoría...</option>
                  </select>
                </div>
                <div class="settings-field builder-config-cell">
                  <label for="flowSubcategory">Subcategoría</label>
                  <select id="flowSubcategory">
                    <option value="">Seleccionar subcategoría...</option>
                  </select>
                </div>
                <div class="settings-field builder-config-cell">
                  <label for="flowTypePicker">Tipo de flujo</label>
                  <input type="hidden" id="flowType" value="manual">
                  <div class="flow-type-picker" id="flowTypePicker" role="listbox" aria-label="Tipo de flujo">
                    <div class="flow-type-picker-option" data-value="manual" role="option">Manual</div>
                    <div class="flow-type-picker-option" data-value="automated" role="option"><i class="ph ph-check"></i> Automatizado (sistema)</div>
                  </div>
                </div>
              </div>
              <span class="field-help block">Los flujos automatizados no aparecen en la librería de usuarios.</span>
            </div>
          </div>

          <!-- Tab 2: Módulos. Layout: contenido principal + panel derecho dentro del tab (respeta header/footer). -->
          <div class="builder-tab-content builder-tab-technical" id="tabTechnical">
            <div class="technical-tab-layout">
              <div class="technical-tab-main">
            <div class="builder-settings-form builder-config-fullwidth">
                  <div class="settings-section technical-section-mode" id="technicalWebhookSection">
                    <h4 class="technical-section-title"><i class="ph ph-play-circle"></i> Modo de ejecución del flujo</h4>
                <div class="settings-field">
                      <label for="executionMode">Modo</label>
                      <select id="executionMode">
                        <option value="single_step">Un solo módulo</option>
                        <option value="multi_step">Varios módulos (lineal)</option>
                        <option value="sequential">Secuencial con decisiones</option>
                      </select>
                </div>
                </div>
                  <div class="settings-section technical-section-modules">
                    <h4 class="technical-section-title"><i class="ph ph-stack"></i> Módulos del flujo</h4>
                    <div id="technicalModulesList" class="technical-modules-list"></div>
                    <div class="technical-modules-actions">
                      <button type="button" class="btn-small btn-primary-modules" id="technicalAddModuleBtn"><i class="ph ph-plus"></i> Nuevo módulo</button>
                      <button type="button" class="btn-small btn-ghost" id="technicalDetailsPanelBtn" title="Abrir detalles técnicos del módulo seleccionado"><i class="ph ph-wrench"></i> Detalles técnicos</button>
                    </div>
                  </div>
                  <div class="settings-section technical-automated-block" id="technicalAutomatedBlock" style="display: none;">
                    <h4><i class="ph ph-clock-countdown"></i> Tipo de ejecución</h4>
                    <div class="automated-execution-info">
                      <p><strong>CRON JOB / PROGRAMADO</strong></p>
                      <p>Estado: Activo en n8n</p>
                      <p class="field-help">Este flujo no usa webhook; se dispara por el sistema.</p>
                    </div>
                  </div>
                  <div class="settings-section">
                    <h4><i class="ph ph-code"></i> Schema JSON (input_schema)</h4>
                    <div class="json-preview" id="jsonSchemaPreview">
                      <pre><code>{ "fields": [] }</code></pre>
                    </div>
                    <button class="btn-small" id="copySchemaBtn"><i class="ph ph-copy"></i> Copiar JSON</button>
                  </div>
                </div>
              </div>
              <!-- Panel derecho: dentro del tab, debajo del header y respetando footer -->
              <div class="builder-panel-right" id="technicalDetailsPanel">
              <div class="builder-panel-right-header">
                <h4><i class="ph ph-wrench"></i> Detalles técnicos</h4>
                <button type="button" class="btn-icon btn-ghost" id="technicalDetailsPanelClose" title="Cerrar"><i class="ph ph-x"></i></button>
              </div>
              <div class="builder-panel-right-body">
                  <div class="settings-field">
                  <label for="techDetailsModuleSelect">Módulo</label>
                  <select id="techDetailsModuleSelect">
                    <option value="">— Seleccionar módulo —</option>
                    </select>
                  </div>
                <div id="techDetailsFormWrap" class="tech-details-form" style="display: none;">
                  <div class="settings-field">
                    <label for="techDetailsWebhookMethod">Método HTTP</label>
                    <select id="techDetailsWebhookMethod">
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                  </div>
                  <div class="settings-field">
                    <label for="techDetailsPlatformName">Plataforma</label>
                    <select id="techDetailsPlatformName">
                      <option value="n8n">n8n</option>
                      <option value="make">Make</option>
                      <option value="zapier">Zapier</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div class="settings-field">
                    <label for="techDetailsPlatformFlowId">ID del flujo en la plataforma</label>
                    <input type="text" id="techDetailsPlatformFlowId" placeholder="ej. workflow id en n8n">
                </div>
                <div class="settings-field">
                    <label for="techDetailsPlatformFlowName">Nombre del flujo en la plataforma</label>
                    <input type="text" id="techDetailsPlatformFlowName" placeholder="Nombre en n8n/Make">
                </div>
                  <div class="settings-field">
                    <label for="techDetailsEditorUrl">URL del Editor</label>
                    <input type="url" id="techDetailsEditorUrl" placeholder="URL del editor en la plataforma">
              </div>
                  <div class="settings-field">
                    <label for="techDetailsCredentialId">Credential ID</label>
                    <input type="text" id="techDetailsCredentialId" placeholder="Opcional">
                </div>
                  <div class="settings-field">
                    <label class="checkbox-label">
                      <input type="checkbox" id="techDetailsIsHealthy" checked>
                      <span>Estado saludable (is_healthy)</span>
                    </label>
              </div>
                  <div class="settings-field">
                    <label for="techDetailsAvgExecutionTimeMs">Tiempo medio ejecución (ms)</label>
                    <input type="number" id="techDetailsAvgExecutionTimeMs" min="0" placeholder="Opcional">
                </div>
                  <div class="settings-field">
                    <label>Última comprobación de salud</label>
                    <input type="text" id="techDetailsLastHealthCheck" readonly placeholder="—">
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>

          <!-- Tab 3: Inputs (único con componentes y propiedades) -->
          <div class="builder-tab-content" id="tabInputs">
            <div class="builder-canvas" id="builderCanvas">
              <div class="canvas-empty-state" id="canvasEmptyState">
                <i class="ph ph-plus-circle"></i>
                <h4>Arrastra componentes aquí</h4>
                <p>Construye el formulario de entrada de tu flujo</p>
              </div>
              <div class="canvas-empty-state canvas-automated-state" id="canvasAutomatedState" style="display: none;">
                <i class="ph ph-robot"></i>
                <h4>Flujo automatizado</h4>
                <p>Este flujo se ejecuta automáticamente por el sistema (Cron/Trigger). No requiere intervención del usuario final, por lo que no tiene formulario de entrada.</p>
              </div>
              <div class="canvas-fields" id="canvasFields">
                <!-- Los campos se agregan aquí -->
              </div>
            </div>
          </div>

          <!-- Tab 4: Ficha del Flujo (vista oficial: imagen, nombre, descripción, inputs preview, métricas si publicado) -->
          <div class="builder-tab-content" id="tabFicha">
            <div class="builder-ficha-wrapper" id="builderFichaWrapper">
              <div class="ficha-card" id="fichaCard">
                <div class="ficha-image" id="fichaImage">
                  <i class="ph ph-image"></i>
                  <span>Sin imagen</span>
                </div>
                <div class="ficha-body">
                  <h2 class="ficha-title" id="fichaTitle">Nombre del flujo</h2>
                  <p class="ficha-description" id="fichaDescription">Descripción del flujo.</p>
                  <div class="ficha-meta" id="fichaMeta">
                    <span class="ficha-version" id="fichaVersion">v1.0.0</span>
                    <span class="ficha-credits" id="fichaCredits">— créditos</span>
                    <span class="ficha-output" id="fichaOutput">—</span>
                  </div>
                  <div class="ficha-stats" id="fichaStats" style="display: none;">
                    <span class="ficha-stat"><i class="ph ph-heart"></i> <strong id="fichaLikes">0</strong> likes</span>
                    <span class="ficha-stat"><i class="ph ph-bookmark-simple"></i> <strong id="fichaSaves">0</strong> guardados</span>
                    <span class="ficha-stat"><i class="ph ph-play"></i> <strong id="fichaRuns">0</strong> ejecuciones</span>
                  </div>
                </div>
              </div>
              <aside class="ficha-sidebar">
                <h4><i class="ph ph-textbox"></i> Inputs (vista consumidor)</h4>
                <div class="ficha-inputs-preview" id="fichaInputsPreview">
                  <p class="ficha-inputs-empty">Sin campos de entrada.</p>
                </div>
              </aside>
            </div>
          </div>
        </div>

        <!-- Panel derecho: Propiedades (oculto por defecto; solo visible en pestaña Inputs) -->
        <aside class="builder-sidebar builder-properties" style="display: none;">
          <div class="builder-sidebar-header">
            <h3><i class="ph ph-sliders-horizontal"></i> Propiedades</h3>
          </div>
          <div class="builder-properties-content" id="propertiesPanel">
            <div class="properties-empty">
              <i class="ph ph-cursor-click"></i>
              <p>Selecciona un campo para editar sus propiedades</p>
            </div>
          </div>
        </aside>
      </main>

      <!-- Footer: mensaje + estado + todas las acciones -->
      <footer class="builder-footer" id="builderFooter">
        <div class="builder-footer-message" id="builderFooterMessage"></div>
        <span class="flow-status-badge draft" id="flowStatusBadge">Borrador</span>
        <div class="builder-footer-actions" id="builderFooterActions">
          <button type="button" class="btn-builder-footer btn-save-draft" id="btnSaveDraft" style="display: none;">
            <i class="ph ph-floppy-disk"></i> Guardar flujo
          </button>
          <button type="button" class="btn-builder-footer btn-update-flow" id="btnUpdateFlow" style="display: none;">
            <i class="ph ph-pencil-simple"></i> Actualizar flujo
          </button>
          <button type="button" class="btn-builder-footer" id="testFlowBtn">
            <i class="ph ph-play"></i> Probar
          </button>
          <button type="button" class="btn-builder-footer btn-primary-footer" id="btnPublish" style="display: none;">
            <i class="ph ph-rocket-launch"></i> Publicar
          </button>
          <button type="button" class="btn-builder-footer btn-request-review" id="btnRequestReview" style="display: none;">
            <i class="ph ph-hand-waving"></i> Solicitar revisión
          </button>
          <button type="button" class="btn-builder-footer btn-approve-publish" id="btnApprovePublish" style="display: none;">
            <i class="ph ph-check-circle"></i> Aprobar y publicar
          </button>
          <button type="button" class="btn-builder-footer btn-reject" id="btnReject" style="display: none;">
            <i class="ph ph-x-circle"></i> Rechazar
          </button>
          <button type="button" class="btn-builder-footer btn-unpublish" id="btnUnpublish" style="display: none;">
            <i class="ph ph-arrow-counter-clockwise"></i> Despublicar
          </button>
        </div>
      </footer>

      <!-- Modal: Test -->
      <div class="modal builder-modal" id="testModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3><i class="ph ph-play"></i> Probar Flujo</h3>
            <button class="modal-close" id="closeTestModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="test-container">
              <div class="test-form" id="testFormContainer">
                <!-- Formulario de prueba -->
              </div>
              <div class="test-results" id="testResults" style="display: none;">
                <h4>Resultado:</h4>
                <pre id="testResultOutput"></pre>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-builder-secondary" id="closeTestBtn">Cerrar</button>
            <button class="btn-builder-primary" id="runTestBtn">
              <i class="ph ph-play"></i> Ejecutar
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Confirmar eliminar -->
      <div class="modal builder-modal" id="deleteModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h3><i class="ph ph-warning"></i> Confirmar eliminación</h3>
            <button class="modal-close" id="closeDeleteModal">&times;</button>
          </div>
          <div class="modal-body">
            <p>¿Estás seguro de que deseas eliminar este flujo?</p>
            <p class="text-danger">Esta acción no se puede deshacer.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-builder-secondary" id="cancelDeleteBtn">Cancelar</button>
            <button class="btn-builder-danger" id="confirmDeleteBtn">
              <i class="ph ph-trash"></i> Eliminar
            </button>
          </div>
        </div>
      </div>

    `;
  }

  async init() {
    await this.initSupabase();
    this.checkUrlParams();
    await this.loadCategories();
    await this.loadSubcategories();
    await this.loadComponentTemplates();

    // Debounce para actualizar canvas/JSON/footer al editar propiedades (evita lag al escribir)
    var self = this;
    this.debouncedRefreshUI = (typeof window.Performance !== 'undefined' && window.Performance.debounce)
      ? window.Performance.debounce(function () {
          self.renderCanvas();
          self.updateJsonPreview();
          self.renderFooter();
        }, 160)
      : function () {
          self.renderCanvas();
          self.updateJsonPreview();
          self.renderFooter();
        };

    if (this.flowId) {
      await this.loadFlow();
    }

    this.setupEventListeners();
    this.setupFooterListeners();
    this.renderCanvas();
    this.updateJsonPreview();
    this.renderFooter();
    this.applyFlowTypeUI();
    // Aplicar layout de la pestaña activa al cargar (oculta Componentes/Propiedades si está en Configuración)
    this.applyTabLayout('settings');
  }

  async initSupabase() {
    if (window.supabase) {
      this.supabase = window.supabase;
    } else if (window.authService?.supabase) {
      this.supabase = window.authService.supabase;
    }
    
    const user = window.authService?.getCurrentUser();
    this.userId = user?.id;
  }

  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    // Aceptar flowId de ruta (/dev/builder/:flowId) o query id / flow (Mis Flujos y Lead usan ?flow=)
    const flowId = this.routeParams?.flowId || urlParams.get('id') || urlParams.get('flow');
    
    if (flowId && flowId !== 'new') {
      this.flowId = flowId;
      this.isEditMode = true;
      // Normalizar URL a ?id= para consistencia cuando se usó ?flow=
      if (urlParams.get('flow') && !urlParams.get('id')) {
        const url = new URL(window.location.href);
        url.searchParams.delete('flow');
        url.searchParams.set('id', flowId);
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    }
  }

  async loadCategories() {
    if (!this.supabase) return;
    
    try {
      const { data, error } = await this.supabase
        .from('content_categories')
        .select('id, name, description')
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      
      this.categories = data || [];
      this.renderCategorySelect();
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  renderCategorySelect() {
    const select = this.querySelector('#flowCategory');
    if (!select) return;
    
    select.innerHTML = '<option value="">Seleccionar categoría...</option>';
    
    this.categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      if (this.flowData.category_id === cat.id) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  async loadSubcategories() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('content_subcategories')
        .select('id, name, description')
        .order('order_index', { ascending: true });
      if (error) throw error;
      this.subcategories = data || [];
      this.renderSubcategorySelect();
    } catch (err) {
      console.error('Error loading subcategories:', err);
    }
  }

  renderSubcategorySelect() {
    const select = this.querySelector('#flowSubcategory');
    if (!select) return;
    select.innerHTML = '<option value="">Seleccionar subcategoría...</option>';
    this.subcategories.forEach(sub => {
      const option = document.createElement('option');
      option.value = sub.id;
      option.textContent = sub.name;
      if (this.flowData.subcategory_id === sub.id) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  /**
   * Normaliza una plantilla (de BD o fallback) para que tenga forma consistente y base_schema
   * con input_type/type correctos (canvas y propiedades usan esto).
   */
  normalizeComponentTemplate(row) {
    const base = { ...row };
    const schema = base.base_schema && typeof base.base_schema === 'object' ? { ...base.base_schema } : {};
    const nameKey = (base.name || '').toLowerCase().replace(/\s+/g, '_');
    // Plantillas BD pueden traer container_type (SECTION, DIVIDER, HEADING, DESCRIPTION) sin input_type
    const containerType = (schema.container_type || '').toLowerCase();
    if (containerType && ['section', 'divider', 'heading', 'description'].indexOf(containerType) >= 0) {
      schema.input_type = containerType;
      schema.type = containerType;
      schema.is_structural = true;
    } else {
      const inferredType = nameKey === 'dropdown' ? 'dropdown' : (schema.input_type || schema.type || nameKey || 'text');
      schema.input_type = schema.input_type || schema.type || inferredType;
      schema.type = schema.type || schema.input_type;
    }
    if ((schema.input_type === 'dropdown' || schema.input_type === 'select') && !Array.isArray(schema.options)) {
      schema.options = schema.options || [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }];
    }
    base.id = base.id || base.name || nameKey;
    base.base_schema = schema;
    base.default_ui_config = base.default_ui_config && typeof base.default_ui_config === 'object' ? base.default_ui_config : {};
    return base;
  }

  async loadComponentTemplates() {
    if (!this.supabase) {
      this.componentTemplates = this.getDefaultTemplates().map(t => this.normalizeComponentTemplate(t));
      this.renderComponentsList();
      return;
    }
    
    try {
      const { data, error } = await this.supabase
        .from('ui_component_templates')
        .select('id, name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index')
        .eq('is_active', true)
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      
      const fromDb = data && data.length > 0 ? data.map(row => this.normalizeComponentTemplate(row)) : [];
      this.componentTemplates = fromDb.length > 0 ? fromDb : this.getDefaultTemplates().map(t => this.normalizeComponentTemplate(t));
      this.renderComponentsList();
    } catch (err) {
      console.error('Error loading component templates:', err);
      this.componentTemplates = this.getDefaultTemplates().map(t => this.normalizeComponentTemplate(t));
      this.renderComponentsList();
    }
  }

  getDefaultTemplates() {
    if (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.getDefaultTemplates) {
      return window.InputRegistry.getDefaultTemplates();
    }
    return [
      { id: 'string', name: 'Texto', description: 'Texto (línea, multilínea o prompt)', category: 'basic', icon_name: 'textbox', base_schema: { input_type: 'string', mode: 'single_line', placeholder: '', maxLength: 255 } },
      { id: 'dropdown', name: 'Dropdown', description: 'Menú desplegable', category: 'basic', icon_name: 'caret-down', base_schema: { input_type: 'dropdown', options: [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }] } },
      { id: 'choice_chips', name: 'Chips (única)', description: 'Opciones en chips', category: 'basic', icon_name: 'squares-four', base_schema: { input_type: 'choice_chips', options: [] } },
      { id: 'multi_select_chips', name: 'Chips (múltiple)', description: 'Selección múltiple en chips', category: 'basic', icon_name: 'squares-four', base_schema: { input_type: 'multi_select_chips', options: [] } },
      { id: 'radio', name: 'Radio', description: 'Opciones radio (una opción)', category: 'basic', icon_name: 'radio-button', base_schema: { input_type: 'radio', options: [] } },
      { id: 'checkboxes', name: 'Checkboxes (una opción)', description: 'Opciones con casillas: una elegida → variable = valor (ej. cabello = rubio)', category: 'basic', icon_name: 'list-checks', base_schema: { input_type: 'checkboxes', data_type: 'string', options: [{ value: 'rubio', label: 'Rubio' }, { value: 'negro', label: 'Negro' }, { value: 'castaño', label: 'Castaño' }] } },
      { id: 'selection_checkboxes', name: 'Checkboxes (múltiples)', description: 'Varias opciones → variable = array', category: 'basic', icon_name: 'check-square', base_schema: { input_type: 'selection_checkboxes', data_type: 'array', options: [] } },
      { id: 'num_stepper', name: 'Número (stepper)', description: 'Número con +/-', category: 'basic', icon_name: 'hash', base_schema: { input_type: 'num_stepper', min: 0, max: 100, step: 1 } },
      { id: 'range', name: 'Slider', description: 'Control deslizante', category: 'advanced', icon_name: 'sliders', base_schema: { input_type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 } },
      { id: 'toggle_switch', name: 'Switch', description: 'Interruptor sí/no', category: 'basic', icon_name: 'toggle-left', base_schema: { input_type: 'toggle_switch', defaultValue: false } },
      { id: 'tags', name: 'Tags', description: 'Etiquetas', category: 'basic', icon_name: 'tags', base_schema: { input_type: 'tags' } },
      { id: 'flags', name: 'Flags', description: 'Dropdown: idioma, país o etnia (flag_category).', category: 'basic', icon_name: 'flag', base_schema: { input_type: 'flags', flag_category: 'language', options: [] } },
      { id: 'colores', name: 'Colores', description: 'Círculos de colores seleccionables (máx. 6).', category: 'basic', icon_name: 'palette', base_schema: { input_type: 'colores', max_selections: 6, options: [{ value: '#000000', label: 'Negro' }, { value: '#ef4444', label: 'Rojo' }, { value: '#22c55e', label: 'Verde' }, { value: '#3b82f6', label: 'Azul' }, { value: '#eab308', label: 'Amarillo' }, { value: '#8b5cf6', label: 'Violeta' }] } },
      { id: 'aspect_ratio', name: 'Aspect ratio', description: 'Formato de producción (1:1, 16:9, etc.).', category: 'basic', icon_name: 'crop', base_schema: { input_type: 'aspect_ratio', type: 'aspect_ratio', data_type: 'string', defaultValue: '1:1', options: [{ value: '2:3', label: '2:3' }, { value: '3:4', label: '3:4' }, { value: '4:5', label: '4:5' }, { value: '9:16', label: '9:16' }, { value: '3:2', label: '3:2' }, { value: '4:3', label: '4:3' }, { value: '5:4', label: '5:4' }, { value: '16:9', label: '16:9' }, { value: '21:9', label: '21:9' }, { value: '1:1', label: '1:1' }] } },
      { id: 'scope_picker', name: 'Scope picker (enfoque)', description: 'Enfoque de la producción. Toggle «Que la IA decida» y opciones personalizables.', category: 'basic', icon_name: 'target', base_schema: { input_type: 'scope_picker', type: 'scope_picker', data_type: 'object', options: [] } },
      { id: 'brand_selector', name: 'Selector de Marca', description: 'Marca del usuario', category: 'context', icon_name: 'storefront', base_schema: { input_type: 'brand_selector' } },
      { id: 'entity_selector', name: 'Selector de Entidad', description: 'Producto/servicio', category: 'context', icon_name: 'package', base_schema: { input_type: 'entity_selector' } },
      { id: 'audience_selector', name: 'Selector de Audiencia', description: 'Audiencia', category: 'context', icon_name: 'users', base_schema: { input_type: 'audience_selector' } },
      { id: 'product_selector', name: 'Selector de Producto', description: 'Producto', category: 'context', icon_name: 'package', base_schema: { input_type: 'product_selector' } },
      { id: 'image_selector', name: 'Selector de imagen', description: 'Imagen (productos/referencias)', category: 'media', icon_name: 'image', base_schema: { input_type: 'image_selector' } },
      { id: 'tone_selector', name: 'Tono', description: 'Tono del contenido', category: 'semantic', icon_name: 'microphone', base_schema: { input_type: 'tone_selector' } },
      { id: 'length_selector', name: 'Longitud', description: 'Longitud del texto', category: 'semantic', icon_name: 'ruler', base_schema: { input_type: 'length_selector' } },
      { id: 'section', name: 'Sección', description: 'Agrupador', category: 'structural', icon_name: 'layout', base_schema: { input_type: 'section' } },
      { id: 'divider', name: 'Divisor', description: 'Línea separadora', category: 'structural', icon_name: 'minus', base_schema: { input_type: 'divider' } },
      { id: 'heading', name: 'Título', description: 'Encabezado', category: 'structural', icon_name: 'text-h', base_schema: { input_type: 'heading' } },
      { id: 'description', name: 'Descripción', description: 'Texto informativo', category: 'structural', icon_name: 'info', base_schema: { input_type: 'description' } }
    ];
  }

  // --- Inputs: BuilderInputs.js ---
  // --- Modules: BuilderModules.js ---
  // --- Persistence: BuilderPersistence.js ---

  getFlowPublicUrl() {
    if (!this.flowId) return null;
    const origin = window.location.origin || '';
    const pathname = (window.location.pathname || '').replace(/\/$/, '') || '';
    return `${origin}${pathname}/#/studio?flow=${this.flowId}`;
  }

  /**
   * Aplica el layout según la pestaña activa: solo Inputs muestra componentes y propiedades.
   */
  applyTabLayout(tabId) {
    const main = this.querySelector('.builder-main');
    const componentsSidebar = this.querySelector('.builder-sidebar.builder-components');
    const propertiesSidebar = this.querySelector('.builder-sidebar.builder-properties');
    if (!main) return;
    const isInputs = tabId === 'inputs';
    main.classList.toggle('builder-tab-inputs-active', isInputs);
    if (componentsSidebar) componentsSidebar.style.display = isInputs ? '' : 'none';
    if (propertiesSidebar) propertiesSidebar.style.display = isInputs ? '' : 'none';
    if (tabId === 'ficha') this.renderFicha();
  }

  /**
   * Actualiza la vista "Ficha del Flujo" (tarjeta oficial + preview inputs + métricas si publicado).
   */
  renderFicha() {
    const title = this.querySelector('#fichaTitle');
    const desc = this.querySelector('#fichaDescription');
    const imgWrap = this.querySelector('#fichaImage');
    const version = this.querySelector('#fichaVersion');
    const credits = this.querySelector('#fichaCredits');
    const output = this.querySelector('#fichaOutput');
    const stats = this.querySelector('#fichaStats');
    const likesEl = this.querySelector('#fichaLikes');
    const savesEl = this.querySelector('#fichaSaves');
    const runsEl = this.querySelector('#fichaRuns');
    const inputsPreview = this.querySelector('#fichaInputsPreview');

    if (title) title.textContent = this.flowData.name || 'Sin nombre';
    if (desc) desc.textContent = this.flowData.description || 'Sin descripción.';
    if (version) version.textContent = 'v' + (this.flowData.version || '1.0.0');
    if (credits) credits.textContent = (this.flowData.token_cost ?? 0) + ' créditos por ejecución';
    if (output) output.textContent = this.flowData.output_type || '—';

    if (imgWrap) {
      if (this.flowData.flow_image_url) {
        const url = this.flowData.flow_image_url;
        const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(url) || url.includes('video');
        if (isVideo) {
          imgWrap.innerHTML = `<video src="${url}" alt="" muted playsinline></video>`;
        } else {
          imgWrap.innerHTML = `<img src="${url}" alt="">`;
        }
      } else {
        imgWrap.innerHTML = '<i class="ph ph-image"></i><span>Sin imagen</span>';
      }
    }

    const isPublished = this.flowData.status === 'published';
    if (stats) stats.style.display = isPublished ? 'flex' : 'none';
    if (isPublished && likesEl) likesEl.textContent = this.flowData.likes_count ?? 0;
    if (isPublished && savesEl) savesEl.textContent = this.flowData.saves_count ?? 0;
    if (isPublished && runsEl) runsEl.textContent = this.flowData.run_count ?? 0;

    if (inputsPreview) {
      if (this.inputSchema.length === 0) {
        inputsPreview.innerHTML = '<p class="ficha-inputs-empty">Sin campos de entrada.</p>';
      } else {
        inputsPreview.innerHTML = this.generateFormPreview();
      }
    }
  }

  /**
   * Actualiza el estado visual del picker Manual / Automatizado.
   * Los flujos automatizados usan la misma UI que los manuales (módulos, inputs, etc.).
   */
  updateFlowTypePicker(value) {
    const picker = this.querySelector('#flowTypePicker');
    if (!picker) return;
    picker.querySelectorAll('.flow-type-picker-option').forEach((opt) => {
      const optValue = opt.getAttribute('data-value');
      opt.classList.toggle('is-selected', optValue === value);
    });
  }

  applyFlowTypeUI() {
    this.isAutomatedFlow = this.flowData.flow_category_type === 'automated';

    const main = this.querySelector('.builder-main');
    const componentsSidebar = this.querySelector('.builder-sidebar.builder-components');
    const canvasEmpty = this.querySelector('#canvasEmptyState');
    const canvasAutomated = this.querySelector('#canvasAutomatedState');
    const canvasFields = this.querySelector('#canvasFields');
    const technicalWebhook = this.querySelector('#technicalWebhookSection');
    const technicalAutomated = this.querySelector('#technicalAutomatedBlock');
    const tokenCostInput = this.querySelector('#flowTokenCost');
    const uiShowInCatalog = this.querySelector('#uiShowInCatalog');
    const testFlowBtn = this.querySelector('#testFlowBtn');
    const tabModules = this.querySelector('.builder-tab[data-tab="technical"]');

    if (this.isAutomatedFlow) {
      // Flujo automated: canvas usa input_schema del primer módulo (flow_modules.input_schema)
      if (this.inputSchema.length === 0) {
        this.inputSchema = JSON.parse(JSON.stringify(this.DEFAULT_SCHEDULE_SCHEMA.fields));
        this.hasUnsavedChanges = true;
      }
      if (main) main.classList.add('builder-mode-automated');
      if (componentsSidebar) componentsSidebar.style.display = 'none';
      const builderCanvas = this.querySelector('#builderCanvas');
      if (builderCanvas) builderCanvas.classList.add('builder-canvas--automated');
      if (canvasEmpty) canvasEmpty.style.display = 'none';
      if (canvasAutomated) canvasAutomated.style.display = 'none';
      if (canvasFields) canvasFields.style.display = 'block';
      if (technicalWebhook) technicalWebhook.style.display = 'none';
      if (technicalAutomated) technicalAutomated.style.display = 'block';
      if (tokenCostInput) {
        tokenCostInput.min = 0;
        tokenCostInput.max = 100;
        tokenCostInput.disabled = false;
        tokenCostInput.value = this.flowData.token_cost ?? 1;
      }
      if (uiShowInCatalog) {
        uiShowInCatalog.disabled = true;
        uiShowInCatalog.checked = false;
      }
      if (testFlowBtn) testFlowBtn.style.display = 'none';
      if (tabModules) tabModules.style.display = '';
      this.renderCanvas();
      this.updateJsonPreview();
      return;
    }

    // Flujo manual: lista de componentes visible, canvas con input_schema
    if (main) main.classList.remove('builder-mode-automated');
    const builderCanvas = this.querySelector('#builderCanvas');
    if (builderCanvas) builderCanvas.classList.remove('builder-canvas--automated');
    if (componentsSidebar) componentsSidebar.style.display = '';
    if (canvasEmpty) canvasEmpty.style.display = (this.inputSchema.length === 0) ? 'flex' : 'none';
    if (canvasAutomated) canvasAutomated.style.display = 'none';
    if (canvasFields) canvasFields.style.display = (this.inputSchema.length > 0) ? 'block' : 'none';
    if (technicalWebhook) technicalWebhook.style.display = 'block';
    if (technicalAutomated) technicalAutomated.style.display = 'none';
    if (tokenCostInput) {
      tokenCostInput.min = 0;
      tokenCostInput.max = 100;
      tokenCostInput.disabled = false;
      tokenCostInput.value = this.flowData.token_cost ?? 1;
    }
    if (uiShowInCatalog) {
      uiShowInCatalog.disabled = false;
      uiShowInCatalog.checked = !!this.flowData.show_in_catalog;
    }
    if (testFlowBtn) testFlowBtn.style.display = '';
    if (tabModules) tabModules.style.display = '';
    this.renderCanvas();
    this.updateJsonPreview();
  }

  updateStatusBadge() {
    const badge = this.querySelector('#flowStatusBadge');
    if (!badge) return;
    
    const statusLabels = {
      draft: 'Borrador',
      checking: 'En Revisión',
      testing: 'En Pruebas',
      published: 'Publicado'
    };
    
    badge.className = `flow-status-badge ${this.flowData.status}`;
    badge.textContent = statusLabels[this.flowData.status] || 'Borrador';
  }

  isLead() {
    return window.authService?.isLead?.() === true;
  }

  isFlowOwner() {
    return this.userId && this.flowData.owner_id === this.userId;
  }

  get flowOwnerId() {
    return this.flowData.owner_id;
  }

  renderFooter() {
    const messageEl = this.querySelector('#builderFooterMessage');
    const actionsEl = this.querySelector('#builderFooterActions');
    if (!messageEl || !actionsEl) return;

    const status = this.flowData.status || 'draft';
    const isLead = this.isLead();
    const buttons = {
      saveDraft: this.querySelector('#btnSaveDraft'),
      updateFlow: this.querySelector('#btnUpdateFlow'),
      publish: this.querySelector('#btnPublish'),
      requestReview: this.querySelector('#btnRequestReview'),
      approvePublish: this.querySelector('#btnApprovePublish'),
      reject: this.querySelector('#btnReject'),
      unpublish: this.querySelector('#btnUnpublish')
    };

    const hideAll = () => {
      Object.values(buttons).forEach(b => { if (b) b.style.display = 'none'; });
    };
    const show = (btn) => { if (btn) btn.style.display = 'inline-flex'; };

    messageEl.textContent = '';
    messageEl.className = 'builder-footer-message';
    hideAll();

    if (status === 'draft') {
      if (this.hasUnsavedChanges) {
        messageEl.textContent = 'Tienes cambios sin guardar.';
        messageEl.classList.add('has-changes');
      }
      show(buttons.saveDraft);
      if (isLead) show(buttons.publish);
      else show(buttons.requestReview);
    } else if (status === 'checking') {
      if (isLead) {
        messageEl.textContent = 'Flujo en revisión. Puedes aprobar o rechazar.';
        show(buttons.approvePublish);
        show(buttons.reject);
      } else {
        messageEl.textContent = 'Esperando aprobación...';
        messageEl.classList.add('waiting');
      }
    } else if (status === 'published') {
      messageEl.textContent = 'Estás editando un flujo en vivo. Los cambios afectarán a los clientes.';
      messageEl.classList.add('published-warning');
      show(buttons.updateFlow);
      if (isLead) show(buttons.unpublish);
    } else {
      messageEl.textContent = '';
      show(buttons.saveDraft);
    }
  }

  updateImagePreview(url) {
    const preview = this.querySelector('#flowImagePreview');
    const removeBtn = this.querySelector('#removeImageBtn');
    
    if (preview) {
      if (url) {
        const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(url) || url.includes('video');
        if (isVideo) {
          preview.innerHTML = `<video src="${url}" alt="Portada del flujo" muted playsinline></video>`;
        } else {
          preview.innerHTML = `<img src="${url}" alt="Portada del flujo">`;
        }
      } else {
        preview.innerHTML = '<i class="ph ph-image"></i><span>Subir portada</span>';
      }
    }
    
    if (removeBtn) {
      removeBtn.style.display = url ? 'inline-flex' : 'none';
    }
  }

  setupEventListeners() {
    // Nombre del flujo (Configuración)
    const nameConfig = this.querySelector('#flowNameConfig');
    if (nameConfig) {
      nameConfig.addEventListener('input', (e) => {
        this.flowData.name = e.target.value;
      this.hasUnsavedChanges = true;
      this.renderFooter();
      });
    }

    // URL del flujo: copiar
    const copyFlowUrlBtn = this.querySelector('#copyFlowUrlBtn');
    if (copyFlowUrlBtn) {
      copyFlowUrlBtn.addEventListener('click', () => {
        const urlEl = this.querySelector('#flowUrlInput');
        const url = urlEl?.value?.trim() || this.getFlowPublicUrl();
        if (url) {
          navigator.clipboard.writeText(url).then(() => this.showNotification('URL copiada', 'success')).catch(() => {});
        }
      });
    }
    
    // Tabs
    this.querySelectorAll('.builder-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
    
    // Test button
    const testBtn = this.querySelector('#testFlowBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => this.showTestModal());
    }

    // Settings form listeners
    this.setupSettingsListeners();
    
    // Technical form listeners
    this.setupTechnicalListeners();
    
    // Modal listeners
    this.setupModalListeners();
    
    // Image upload
    this.setupImageUpload();
    
    // Copy schema button
    const copySchemaBtn = this.querySelector('#copySchemaBtn');
    if (copySchemaBtn) {
      copySchemaBtn.addEventListener('click', () => this.copySchema());
    }

    // Tecla Delete/Backspace: eliminar el input seleccionado (solo en pestaña Inputs y si no estamos en un input de texto)
    var keydownHandler = (e) => this.handleBuilderKeydown(e);
    document.addEventListener('keydown', keydownHandler);
    this._documentListeners.push({ element: document, event: 'keydown', handler: keydownHandler });
  }

  destroy() {
    if (this._documentListeners && this._documentListeners.length) {
      this._documentListeners.forEach(function (item) {
        if (item.element && typeof item.element.removeEventListener === 'function') {
          item.element.removeEventListener(item.event, item.handler);
        }
      });
      this._documentListeners = [];
    }
    if (typeof super.destroy === 'function') super.destroy();
  }

  handleBuilderKeydown(e) {
    const isInputsTab = this.querySelector('#tabInputs')?.classList?.contains('active');
    if (!isInputsTab || this.selectedFieldIndex === null || this.inputSchema.length === 0) return;
    const key = e.key;
    if (key !== 'Delete' && key !== 'Backspace') return;
    const target = document.activeElement;
    const isTextInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (isTextInput) return;
    e.preventDefault();
    this.deleteField(this.selectedFieldIndex);
  }

  setupFooterListeners() {
    const saveDraft = this.querySelector('#btnSaveDraft');
    const updateFlow = this.querySelector('#btnUpdateFlow');
    const publish = this.querySelector('#btnPublish');
    const requestReview = this.querySelector('#btnRequestReview');
    const approvePublish = this.querySelector('#btnApprovePublish');
    const reject = this.querySelector('#btnReject');
    const unpublish = this.querySelector('#btnUnpublish');

    if (saveDraft) saveDraft.addEventListener('click', () => this.saveFlow());
    if (updateFlow) updateFlow.addEventListener('click', () => this.saveFlow());
    if (publish) publish.addEventListener('click', () => this.publishFlow());
    if (requestReview) requestReview.addEventListener('click', () => this.requestReview());
    if (approvePublish) approvePublish.addEventListener('click', () => this.approveAndPublish());
    if (reject) reject.addEventListener('click', () => this.rejectFlow());
    if (unpublish) unpublish.addEventListener('click', () => this.unpublishFlow());
  }

  switchTab(tabId) {
    // Update tab buttons
    this.querySelectorAll('.builder-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    
    // Update tab content (tabFicha → id="tabFicha")
    const tabContentId = tabId === 'ficha' ? 'tabFicha' : `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`;
    this.querySelectorAll('.builder-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === tabContentId);
    });

    this.applyTabLayout(tabId);
  }

  setupSettingsListeners() {
    const fields = {
      flowDescription: (v) => this.flowData.description = v,
      flowCategory: (v) => this.flowData.category_id = v || null,
      flowSubcategory: (v) => this.flowData.subcategory_id = v || null,
      flowTokenCost: (v) => this.flowData.token_cost = parseInt(v, 10) >= 0 ? parseInt(v, 10) : 1,
      flowVersion: (v) => this.flowData.version = v
    };
    
    Object.entries(fields).forEach(([id, setter]) => {
      const el = this.querySelector(`#${id}`);
      if (el) {
        el.addEventListener('input', (e) => {
          setter(e.target.value);
          this.hasUnsavedChanges = true;
        });
        el.addEventListener('change', (e) => {
          setter(e.target.value);
          this.hasUnsavedChanges = true;
        });
      }
    });

    // Tipo de flujo: picker Manual / Automatizado + input hidden
    const flowTypeInput = this.querySelector('#flowType');
    const flowTypePicker = this.querySelector('#flowTypePicker');
    if (flowTypePicker && flowTypeInput) {
      flowTypePicker.querySelectorAll('.flow-type-picker-option').forEach((opt) => {
        opt.addEventListener('click', () => {
          const v = opt.getAttribute('data-value');
          if (v === 'automated' && !this.isLead()) {
            this.showNotification('Solo los Lead pueden crear o convertir flujos en automatizados.', 'warning');
            return;
          }
          flowTypeInput.value = v;
          flowTypeInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }
    if (flowTypeInput) {
      flowTypeInput.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === 'automated' && !this.isLead()) {
          e.target.value = this.flowData.flow_category_type || 'manual';
          this.showNotification('Solo los Lead pueden crear o convertir flujos en automatizados.', 'warning');
          this.updateFlowTypePicker(e.target.value);
          return;
        }
        this.flowData.flow_category_type = v;
        this.hasUnsavedChanges = true;
        this.updateFlowTypePicker(v);
        this.applyFlowTypeUI();
        this.renderFooter();
      });
    }

    const uiShowInCatalog = this.querySelector('#uiShowInCatalog');
    if (uiShowInCatalog) {
      uiShowInCatalog.addEventListener('change', (e) => {
        this.flowData.show_in_catalog = e.target.checked;
        this.hasUnsavedChanges = true;
      });
    }

    const flowTechnicalName = this.querySelector('#flowTechnicalName');
    if (flowTechnicalName) {
      flowTechnicalName.addEventListener('input', (e) => {
        this.uiLayoutConfig.technical_name = e.target.value || '';
        this.hasUnsavedChanges = true;
      });
    }
  }

  setupTechnicalListeners() {
    const fields = {
      webhookMethod: (v) => { this.technicalDetails.webhook_method = v; this.onFieldChange(); },
      platformName: (v) => { this.technicalDetails.platform_name = v; this.onFieldChange(); },
      editorUrl: (v) => { this.technicalDetails.editor_url = v; this.onFieldChange(); }
    };
    Object.entries(fields).forEach(([id, setter]) => {
      const el = this.querySelector(`#${id}`);
      if (el) {
        el.addEventListener('input', (e) => setter(e.target.value));
        el.addEventListener('change', (e) => setter(e.target.value));
      }
    });
  }

  setupModalListeners() {
    // Test modal
    const closeTest = this.querySelector('#closeTestModal');
    const closeTestBtn = this.querySelector('#closeTestBtn');
    const testModal = this.querySelector('#testModal');
    const runTestBtn = this.querySelector('#runTestBtn');
    
    if (testModal) {
      if (closeTest) {
        closeTest.addEventListener('click', () => {
          testModal.style.display = 'none';
        });
      }
      if (closeTestBtn) {
        closeTestBtn.addEventListener('click', () => {
          testModal.style.display = 'none';
        });
      }
      testModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        testModal.style.display = 'none';
      });
    }
    
    if (runTestBtn) {
      runTestBtn.addEventListener('click', () => this.runTest());
    }
    
    // Delete modal
    const closeDelete = this.querySelector('#closeDeleteModal');
    const cancelDelete = this.querySelector('#cancelDeleteBtn');
    const confirmDelete = this.querySelector('#confirmDeleteBtn');
    const deleteModal = this.querySelector('#deleteModal');
    
    if (deleteModal) {
      if (closeDelete) {
        closeDelete.addEventListener('click', () => {
          deleteModal.style.display = 'none';
        });
      }
      if (cancelDelete) {
        cancelDelete.addEventListener('click', () => {
          deleteModal.style.display = 'none';
        });
      }
      deleteModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        deleteModal.style.display = 'none';
      });
    }
    
    if (confirmDelete) {
      confirmDelete.addEventListener('click', () => this.confirmDelete());
    }
  }

  setupImageUpload() {
    const preview = this.querySelector('#flowImagePreview');
    const removeBtn = this.querySelector('#removeImageBtn');
    const fileInput = this.querySelector('#flowImageInput');
    
    if (preview && fileInput) {
      preview.addEventListener('click', (e) => {
        if (!e.target.closest('#removeImageBtn')) fileInput.click();
      });
      
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          await this.uploadImage(file);
        }
        e.target.value = '';
      });
    }
    
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.flowData.flow_image_url = null;
        this.updateImagePreview(null);
        this.hasUnsavedChanges = true;
      });
    }
  }

  async uploadImage(file) {
    if (!this.supabase) {
      this.showNotification('No se puede subir la portada', 'error');
      return;
    }

    const MAX_SIZE_MB = 50;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      this.showNotification(
        `El archivo es demasiado grande. Tamaño máximo: ${MAX_SIZE_MB} MB. Tu archivo: ${(file.size / 1024 / 1024).toFixed(1)} MB`,
        'error'
      );
      return;
    }
    
    try {
      const fileExt = file.name.split('.').pop().toLowerCase();
      const flowSlug = this.flowId || `temp_${this.userId}`;
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${fileExt}`;
      const filePath = `${flowSlug}/${fileName}`;
      const bucket = 'images_flows';
      
      const { error } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });
      
      if (error) throw error;
      
      const { data: urlData } = this.supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);
      
      this.flowData.flow_image_url = urlData.publicUrl;
      this.updateImagePreview(urlData.publicUrl);
      this.hasUnsavedChanges = true;
      
      this.showNotification('Portada subida correctamente', 'success');
    } catch (err) {
      console.error('Error subiendo portada:', err);
      const msg = err?.message?.includes('maximum allowed size')
        ? `Archivo demasiado grande. Máximo ${MAX_SIZE_MB} MB. Comprime la imagen o elige otra.`
        : (err?.message || 'Error al subir la portada');
      this.showNotification(msg, 'error');
    }
  }

  showTestModal() {
    if (!this.technicalDetails.webhook_url_test && !this.technicalDetails.webhook_url_prod) {
      this.showNotification('Configura un webhook primero', 'warning');
      this.switchTab('technical');
      return;
    }
    
    const modal = this.querySelector('#testModal');
    const container = this.querySelector('#testFormContainer');
    const results = this.querySelector('#testResults');
    
    if (!modal || !container) return;
    
    // Generar formulario de prueba funcional
    container.innerHTML = this.generateTestForm();
    if (results) results.style.display = 'none';
    
    modal.style.display = 'flex';
    
    // Setup range inputs
    container.querySelectorAll('input[type="range"]').forEach(range => {
      const valueDisplay = range.nextElementSibling;
      range.addEventListener('input', () => {
        if (valueDisplay) valueDisplay.textContent = range.value;
      });
    });
  }

  generateTestForm() {
    if (this.inputSchema.length === 0) {
      return `
        <div class="test-empty">
          <i class="ph ph-warning"></i>
          <p>No hay campos definidos para probar</p>
        </div>
      `;
    }
    const Registry = window.InputRegistry;
    if (Registry && Registry.renderFormFieldWithWrapper) {
      return this.inputSchema.map(field => Registry.renderFormFieldWithWrapper(field, {
        idPrefix: 'test_',
        wrapperClass: 'test-field',
        showLabel: true,
        showHelper: true,
        showRequired: true,
        required: field.required
      })).join('');
    }
    return this.inputSchema.filter(f => {
      const t = (f.input_type || f.type || '').toLowerCase();
      return ['section', 'divider', 'heading', 'description', 'description_block'].indexOf(t) < 0;
    }).map(field => {
      const id = 'test_' + (field.key || 'field');
      return `<div class="test-field"><label for="${id}">${field.label || field.key}${field.required ? ' <span class="required">*</span>' : ''}</label><input type="text" id="${id}" name="${field.key}" ${field.required ? 'required' : ''}>${field.description ? `<span class="field-help">${field.description}</span>` : ''}</div>`;
    }).join('');
  }

  showDeleteModal() {
    const modal = this.querySelector('#deleteModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  showNotification(message, type = 'info') {
    // Reutilizar sistema de notificaciones existente o crear uno simple
    const existing = document.querySelector('.builder-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `builder-notification ${type}`;
    notification.innerHTML = `
      <i class="ph ph-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : type === 'warning' ? 'warning' : 'info'}"></i>
      <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

window.DevBuilderView = DevBuilderView;

