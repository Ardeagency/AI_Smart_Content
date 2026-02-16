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
    
    // Estado del flujo (alineado con content_flows en schema: execution_mode, subcategory_id)
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
      execution_mode: 'single_step'
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
    
    // Detalles técnicos
    this.technicalDetails = {
      webhook_url_test: '',
      webhook_url_prod: '',
      webhook_method: 'POST',
      platform_name: 'n8n',
      editor_url: ''
    };
    
    // Templates de componentes disponibles
    this.componentTemplates = [];
    
    // Categorías disponibles
    this.categories = [];
    
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
      <!-- Header del Builder = pestañas (Configuración, Técnico, Inputs, Ficha) -->
      <header class="builder-tabs-header" id="builderTabsHeader">
        <div class="builder-tabs">
          <button class="builder-tab active" data-tab="settings">
            <i class="ph ph-gear"></i> Configuración
          </button>
          <button class="builder-tab" data-tab="technical">
            <i class="ph ph-code"></i> Técnico
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
          <!-- Tab 1: Configuración (lo primero que ve el desarrollador; sin componentes ni propiedades) -->
          <div class="builder-tab-content active" id="tabSettings">
            <div class="builder-settings-form builder-config-fullwidth">
              <div class="settings-section">
                <h4><i class="ph ph-identification-card"></i> Identidad del flujo</h4>
                <div class="settings-field">
                  <label for="flowNameConfig">Nombre público del flujo *</label>
                  <input type="text" id="flowNameConfig" placeholder="Ej: Generador de Reels Virales" maxlength="100">
                </div>
                <div class="settings-field">
                  <label for="flowTechnicalName">Nombre técnico</label>
                  <input type="text" id="flowTechnicalName" placeholder="Ej: reels_viral_generator (solo referencia interna)">
                  <span class="field-help">Referencia para desarrolladores y n8n. No se muestra a usuarios.</span>
                </div>
                <div class="settings-field">
                  <label for="flowUrlInput">URL del flujo</label>
                  <div class="flow-url-field" id="flowUrlWrap">
                    <input type="text" class="flow-url-input" id="flowUrlInput" placeholder="— Guarda el flujo para ver la URL">
                    <button type="button" class="btn-small" id="copyFlowUrlBtn" style="display: none;"><i class="ph ph-copy"></i> Copiar</button>
                  </div>
                </div>
              </div>
              <div class="settings-section">
                <h4><i class="ph ph-info"></i> Descripción e imagen</h4>
                <div class="settings-field">
                  <label for="flowDescription">Descripción</label>
                  <textarea id="flowDescription" placeholder="Describe qué hace este flujo..." rows="3"></textarea>
                </div>
                <div class="flow-image-upload" id="flowImageUpload">
                  <div class="image-preview image-preview--upload" id="flowImagePreview" title="Subir portada">
                    <i class="ph ph-image"></i>
                    <span>Subir portada</span>
                  </div>
                  <div class="image-actions">
                    <button class="btn-small secondary" id="removeImageBtn" style="display: none;"><i class="ph ph-trash"></i> Eliminar</button>
                  </div>
                  <input type="file" id="flowImageInput" accept="image/*,video/*" style="display: none;">
                </div>
              </div>
              <div class="settings-section">
                <h4><i class="ph ph-sliders"></i> Versión, créditos y categoría</h4>
                <div class="settings-row">
                  <div class="settings-field">
                    <label for="flowVersion">Versión</label>
                    <input type="text" id="flowVersion" value="1.0.0" placeholder="1.0.0">
                  </div>
                  <div class="settings-field" id="settingsTokenCostWrap">
                    <label for="flowTokenCost">Créditos (por ejecución)</label>
                    <input type="number" id="flowTokenCost" min="0" max="100" value="1">
                  </div>
                </div>
                <div class="settings-row">
                  <div class="settings-field">
                    <label for="flowCategory">Categoría</label>
                    <select id="flowCategory">
                      <option value="">Seleccionar categoría...</option>
                    </select>
                  </div>
                  <div class="settings-field">
                    <label for="flowOutputType">Tipo de output</label>
                    <select id="flowOutputType">
                      <option value="text">Texto</option>
                      <option value="image">Imagen</option>
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                      <option value="document">Documento</option>
                      <option value="mixed">Mixto</option>
                    </select>
                  </div>
                </div>
                <div class="settings-row">
                  <div class="settings-field">
                    <label for="flowType">Tipo de flujo</label>
                    <select id="flowType">
                      <option value="manual">Manual</option>
                      <option value="automated">Automatizado (sistema)</option>
                    </select>
                  </div>
                  <div class="settings-toggles settings-catalog-visibility" id="settingsCatalogVisibility">
                    <label class="toggle-field">
                      <input type="checkbox" id="uiHiddenFromCatalog">
                      <span>Oculto del catálogo</span>
                    </label>
                  </div>
                </div>
                <span class="field-help block">Los flujos automatizados no aparecen en la librería de usuarios.</span>
              </div>
              <div class="settings-section">
                <h4><i class="ph ph-layout"></i> Apariencia del formulario (inputs)</h4>
                <div class="settings-row">
                  <div class="settings-field">
                    <label for="uiTheme">Tema</label>
                    <select id="uiTheme">
                      <option value="default">Default</option>
                      <option value="minimal">Minimal</option>
                      <option value="card">Card</option>
                      <option value="wizard">Wizard</option>
                    </select>
                  </div>
                  <div class="settings-field">
                    <label for="uiColumns">Columnas</label>
                    <select id="uiColumns">
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </div>
                </div>
                <div class="settings-toggles">
                  <label class="toggle-field">
                    <input type="checkbox" id="uiShowLabels" checked>
                    <span>Mostrar labels</span>
                  </label>
                  <label class="toggle-field">
                    <input type="checkbox" id="uiShowHelperText" checked>
                    <span>Mostrar texto de ayuda</span>
                  </label>
                </div>
                <div class="settings-row">
                  <div class="settings-field">
                    <label for="uiSubmitText">Texto del botón</label>
                    <input type="text" id="uiSubmitText" value="Generar" placeholder="Generar">
                  </div>
                  <div class="settings-field">
                    <label for="uiSubmitPosition">Posición del botón</label>
                    <select id="uiSubmitPosition">
                      <option value="right">Derecha</option>
                      <option value="center">Centro</option>
                      <option value="full">Ancho completo</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 2: Técnico (webhooks, editor, plataforma; sin componentes ni propiedades) -->
          <div class="builder-tab-content" id="tabTechnical">
            <div class="builder-settings-form builder-config-fullwidth">
              <div class="settings-section" id="technicalWebhookSection">
                <h4><i class="ph ph-webhooks-logo"></i> Webhooks</h4>
                <div class="settings-field">
                  <label for="webhookTest">URL de Prueba (Test)</label>
                  <input type="url" id="webhookTest" placeholder="https://tu-n8n.com/webhook-test/...">
                  <span class="field-help">URL del webhook en modo prueba</span>
                </div>
                <div class="settings-field">
                  <label for="webhookProd">URL de Producción</label>
                  <input type="url" id="webhookProd" placeholder="https://tu-n8n.com/webhook/...">
                  <span class="field-help">URL usada por usuarios finales</span>
                </div>
                <div class="settings-row">
                  <div class="settings-field">
                    <label for="webhookMethod">Método HTTP</label>
                    <select id="webhookMethod">
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                      <option value="PUT">PUT</option>
                    </select>
                  </div>
                  <div class="settings-field">
                    <label for="platformName">Plataforma</label>
                    <select id="platformName">
                      <option value="n8n">n8n</option>
                      <option value="make">Make</option>
                      <option value="zapier">Zapier</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>
                <div class="settings-field">
                  <label for="editorUrl">URL del Editor</label>
                  <input type="url" id="editorUrl" placeholder="https://tu-n8n.com/workflow/123">
                  <span class="field-help">Link para editar el flujo en la plataforma</span>
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
                <h4><i class="ph ph-code"></i> Schema JSON</h4>
                <p class="section-description">Estructura de datos que recibe tu webhook</p>
                <div class="json-preview" id="jsonSchemaPreview">
                  <pre><code>{ "fields": [] }</code></pre>
                </div>
                <button class="btn-small" id="copySchemaBtn"><i class="ph ph-copy"></i> Copiar JSON</button>
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
                  <p class="ficha-inputs-empty">Sin campos de entrada o flujo automatizado.</p>
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
        <span class="builder-status-badge draft" id="flowStatusBadge">Borrador</span>
        <div class="builder-footer-actions" id="builderFooterActions">
          <button type="button" class="btn-builder-footer btn-back" id="builderBackBtn">
            <i class="ph ph-arrow-left"></i> Mis Flujos
          </button>
          <button type="button" class="btn-builder-footer btn-save-draft" id="btnSaveDraft" style="display: none;">
            <i class="ph ph-floppy-disk"></i> Guardar flujo
          </button>
          <button type="button" class="btn-builder-footer btn-update-flow" id="btnUpdateFlow" style="display: none;">
            <i class="ph ph-pencil-simple"></i> Actualizar flujo
          </button>
          <button type="button" class="btn-builder-footer" id="previewFlowBtn">
            <i class="ph ph-eye"></i> Preview
          </button>
          <button type="button" class="btn-builder-footer" id="testFlowBtn">
            <i class="ph ph-play"></i> Probar
          </button>
          <button type="button" class="btn-builder-footer" id="viewJsonSchemaBtn">
            <i class="ph ph-brackets-curly"></i> Ver JSON Schema
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
          <button type="button" class="btn-builder-footer btn-test-run" id="btnTestRun" style="display: none;">
            <i class="ph ph-play"></i> Probar (Test Run)
          </button>
          <div class="builder-footer-more">
            <button type="button" class="btn-builder-footer btn-icon" id="moreActionsBtn" title="Más acciones">
              <i class="ph ph-dots-three-vertical"></i>
            </button>
            <div class="builder-dropdown builder-dropdown-footer" id="moreActionsDropdown" style="display: none;">
              <button type="button" class="dropdown-item" id="publishFlowBtn"><i class="ph ph-rocket-launch"></i> Publicar</button>
              <button type="button" class="dropdown-item" id="duplicateFlowBtn"><i class="ph ph-copy"></i> Duplicar</button>
              <button type="button" class="dropdown-item" id="exportFlowBtn"><i class="ph ph-export"></i> Exportar JSON</button>
              <hr>
              <button type="button" class="dropdown-item danger" id="deleteFlowBtn"><i class="ph ph-trash"></i> Eliminar</button>
            </div>
          </div>
        </div>
      </footer>

      <!-- Modal: Preview -->
      <div class="modal builder-modal" id="previewModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3><i class="ph ph-eye"></i> Preview del Flujo</h3>
            <button class="modal-close" id="closePreviewModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="preview-container" id="previewContainer">
              <!-- Preview del formulario -->
            </div>
          </div>
        </div>
      </div>

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

      <!-- Modal: Ver JSON Schema -->
      <div class="modal builder-modal" id="jsonSchemaModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3><i class="ph ph-brackets-curly"></i> JSON Schema (input para n8n)</h3>
            <button class="modal-close" id="closeJsonSchemaModal">&times;</button>
          </div>
          <div class="modal-body builder-json-modal-body">
            <pre class="builder-json-schema-pre" id="jsonSchemaModalPre"><code id="jsonSchemaModalCode">{ "fields": [] }</code></pre>
            <p class="builder-json-hint">Estructura que recibirá tu webhook. Asegúrate de que las <code>key</code> de cada campo coincidan con lo que espera n8n.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-builder-secondary" id="copyJsonSchemaModalBtn">
              <i class="ph ph-copy"></i> Copiar
            </button>
            <button class="btn-builder-primary" id="closeJsonSchemaModalBtn">Cerrar</button>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    await this.initSupabase();
    this.checkUrlParams();
    await this.loadCategories();
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

  async loadComponentTemplates() {
    if (!this.supabase) {
      // Usar templates por defecto si no hay BD
      this.componentTemplates = this.getDefaultTemplates();
      this.renderComponentsList();
      return;
    }
    
    try {
      const { data, error } = await this.supabase
        .from('ui_component_templates')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      
      this.componentTemplates = data && data.length > 0 ? data : this.getDefaultTemplates();
      this.renderComponentsList();
    } catch (err) {
      console.error('Error loading component templates:', err);
      this.componentTemplates = this.getDefaultTemplates();
      this.renderComponentsList();
    }
  }

  getDefaultTemplates() {
    if (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.getDefaultTemplates) {
      return window.InputRegistry.getDefaultTemplates();
    }
    return [
      { id: 'text', name: 'Texto Corto', description: 'Campo de texto', category: 'basic', icon_name: 'textbox', base_schema: { input_type: 'text', placeholder: '', maxLength: 255 } },
      { id: 'textarea', name: 'Texto Largo', description: 'Área de texto', category: 'basic', icon_name: 'article', base_schema: { input_type: 'textarea', placeholder: '', rows: 4 } },
      { id: 'select', name: 'Selector', description: 'Lista desplegable', category: 'basic', icon_name: 'list-bullets', base_schema: { input_type: 'select', options: [] } },
      { id: 'number', name: 'Número', description: 'Campo numérico', category: 'basic', icon_name: 'hash', base_schema: { input_type: 'number', min: 0, max: 100, step: 1 } },
      { id: 'checkbox', name: 'Checkbox', description: 'Casilla', category: 'basic', icon_name: 'check-square', base_schema: { input_type: 'checkbox', defaultValue: false } },
      { id: 'radio', name: 'Radio', description: 'Opciones', category: 'basic', icon_name: 'radio-button', base_schema: { input_type: 'radio', options: [] } },
      { id: 'range', name: 'Slider', description: 'Control deslizante', category: 'advanced', icon_name: 'sliders', base_schema: { input_type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 } },
      { id: 'brand_selector', name: 'Selector de Marca', description: 'Marca del usuario', category: 'context', icon_name: 'storefront', base_schema: { input_type: 'brand_selector' } },
      { id: 'entity_selector', name: 'Selector de Entidad', description: 'Producto/servicio', category: 'context', icon_name: 'package', base_schema: { input_type: 'entity_selector' } },
      { id: 'audience_selector', name: 'Selector de Audiencia', description: 'Audiencia', category: 'context', icon_name: 'users', base_schema: { input_type: 'audience_selector' } }
    ];
  }

  renderComponentsList() {
    const container = this.querySelector('#componentsList');
    if (!container) return;

    // Agrupar por categoría (taxonomía: basic, smart_text, semantic, brand, media, controls, structural)
    const groups = {
      basic: { name: 'Básicos', icon: 'shapes', items: [] },
      smart_text: { name: 'Texto / IA', icon: 'terminal', items: [] },
      semantic: { name: 'Semánticos', icon: 'microphone', items: [] },
      brand: { name: 'Marca y contexto', icon: 'storefront', items: [] },
      context: { name: 'Contexto', icon: 'database', items: [] },
      media: { name: 'Media', icon: 'image', items: [] },
      controls: { name: 'Controles', icon: 'sliders', items: [] },
      advanced: { name: 'Avanzados', icon: 'gear-six', items: [] },
      structural: { name: 'Estructura', icon: 'square', items: [] },
      ai: { name: 'IA', icon: 'magic-wand', items: [] }
    };
    this.componentTemplates.forEach(template => {
      const category = template.category || 'basic';
      if (groups[category]) {
        groups[category].items.push(template);
      } else {
        groups.basic.items.push(template);
      }
    });

    const escapeAttr = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const escapeHtml = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

    let html = '';

    Object.entries(groups).forEach(([key, group]) => {
      if (group.items.length === 0) return;

      html += `
        <div class="component-group" data-group-key="${escapeAttr(key)}">
          <div class="component-group-header">
            <span>${escapeHtml(group.name)}</span>
          </div>
          <div class="component-group-items component-group-grid">
            ${group.items.map(template => {
              const searchText = [template.name, template.description].filter(Boolean).join(' ').toLowerCase();
              const iconName = template.icon_name || 'textbox';
              const templateJson = JSON.stringify(template.base_schema).replace(/'/g, '&#39;');
              return `
              <div class="component-item"
                   draggable="true"
                   data-template-id="${escapeAttr(template.id)}"
                   data-template="${escapeAttr(templateJson)}"
                   data-search="${escapeAttr(searchText)}">
                <i class="ph ph-${escapeHtml(iconName)}"></i>
                <span class="component-name">${escapeHtml(template.name)}</span>
              </div>
            `;
            }).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.setupComponentsSearch();
    this.setupDragAndDrop();
  }

  setupComponentsSearch() {
    const input = this.querySelector('#componentsSearchInput');
    const container = this.querySelector('#componentsList');
    if (!input || !container) return;

    const filter = () => {
      const q = (input.value || '').trim().toLowerCase();
      container.querySelectorAll('.component-group').forEach(groupEl => {
        const items = groupEl.querySelectorAll('.component-item');
        let visibleCount = 0;
        items.forEach(item => {
          const search = (item.getAttribute('data-search') || '').trim();
          const show = !q || search.includes(q);
          item.classList.toggle('component-item-hidden', !show);
          if (show) visibleCount++;
        });
        groupEl.classList.toggle('component-group-empty', visibleCount === 0);
      });
    };

    input.addEventListener('input', filter);
    input.addEventListener('change', filter);
  }

  setupDragAndDrop() {
    // Componentes arrastrables
    const components = this.querySelectorAll('.component-item');
    components.forEach(comp => {
      comp.addEventListener('dragstart', (e) => this.handleComponentDragStart(e));
      comp.addEventListener('dragend', (e) => this.handleDragEnd(e));
    });
    
    // Canvas como drop zone
    const canvas = this.querySelector('#builderCanvas');
    if (canvas) {
      canvas.addEventListener('dragover', (e) => this.handleDragOver(e));
      canvas.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      canvas.addEventListener('drop', (e) => this.handleDrop(e));
    }
  }

  handleComponentDragStart(e) {
    const item = e.target.closest('.component-item');
    if (!item) return;
    const templateId = item.dataset.templateId;
    const templateData = item.dataset.template;
    if (!templateId || !templateData) return;

    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'new_component',
      templateId,
      templateData: JSON.parse(templateData)
    }));

    item.classList.add('dragging');
    this.querySelector('#builderCanvas')?.classList.add('drag-active');
  }

  handleDragEnd(e) {
    const item = e.target.closest('.component-item');
    if (item) item.classList.remove('dragging');
    this.querySelector('#builderCanvas')?.classList.remove('drag-active', 'drag-over');
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this.querySelector('#builderCanvas')?.classList.add('drag-over');
  }

  handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      this.querySelector('#builderCanvas')?.classList.remove('drag-over');
    }
  }

  handleDrop(e) {
    e.preventDefault();
    this.querySelector('#builderCanvas')?.classList.remove('drag-active', 'drag-over');
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      
      if (data.type === 'new_component') {
        this.addField(data.templateId, data.templateData);
      } else if (data.type === 'reorder') {
        // Reordenamiento de campos existentes
        this.reorderField(data.fromIndex, this.getDropIndex(e));
      }
    } catch (err) {
      console.error('Error handling drop:', err);
    }
  }

  addField(templateId, baseSchema) {
    const template = this.componentTemplates.find(t => t.id === templateId);
    const fieldName = this.generateFieldKey(template?.name || templateId);
    
    const newField = {
      key: fieldName,
      label: template?.name || 'Campo',
      required: false,
      placeholder: baseSchema.placeholder || '',
      description: '',
      ...baseSchema,
      // Asegurar input_type para que el canvas renderice el tipo correcto (number, select, checkbox, etc.)
      input_type: baseSchema.input_type || baseSchema.type || 'text',
      ui: {
        width: 'full',
        hidden: false
      }
    };
    
    this.inputSchema.push(newField);
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    this.updateJsonPreview();
    
    // Seleccionar el nuevo campo
    this.selectField(this.inputSchema.length - 1);
  }

  generateFieldKey(baseName) {
    const base = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    let key = base;
    let counter = 1;
    
    while (this.inputSchema.some(f => f.key === key)) {
      key = `${base}_${counter}`;
      counter++;
    }
    
    return key;
  }

  reorderField(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    
    const [field] = this.inputSchema.splice(fromIndex, 1);
    this.inputSchema.splice(toIndex, 0, field);
    
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    
    if (this.selectedFieldIndex === fromIndex) {
      this.selectedFieldIndex = toIndex;
    }
  }

  getDropIndex(e) {
    const fields = this.querySelectorAll('.canvas-field');
    let index = this.inputSchema.length;
    
    fields.forEach((field, i) => {
      const rect = field.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      
      if (e.clientY < midY && index === this.inputSchema.length) {
        index = i;
      }
    });
    
    return index;
  }

  renderCanvas() {
    const canvas = this.querySelector('#canvasFields');
    const emptyState = this.querySelector('#canvasEmptyState');
    
    if (!canvas) return;
    
    if (this.inputSchema.length === 0) {
      canvas.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    
    canvas.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    canvas.innerHTML = this.inputSchema.map((field, index) => this.renderCanvasField(field, index)).join('');
    
    this.setupCanvasFieldListeners();
  }

  renderCanvasField(field, index) {
    const isSelected = this.selectedFieldIndex === index;
    const inputPreview = this.renderInputPreview(field);
    
    return `
      <div class="canvas-field ${isSelected ? 'selected' : ''}" 
           data-index="${index}"
           draggable="true">
        <button type="button" class="canvas-field-remove" title="Eliminar (Delete)" aria-label="Eliminar">
          <i class="ph ph-x"></i>
        </button>
        <div class="canvas-field-header">
          <div class="canvas-field-drag">
            <i class="ph ph-dots-six-vertical"></i>
          </div>
          <div class="canvas-field-info">
            <span class="field-label">${field.label || field.key}</span>
            <span class="field-type">${field.input_type || field.type || 'text'}</span>
            ${field.required ? '<span class="field-required">*</span>' : ''}
          </div>
          <div class="canvas-field-actions">
            <button type="button" class="field-action-btn duplicate-field" title="Duplicar">
              <i class="ph ph-copy"></i>
            </button>
            <button type="button" class="field-action-btn delete-field" title="Eliminar">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </div>
        <div class="canvas-field-preview">
          ${inputPreview}
        </div>
      </div>
    `;
  }

  renderInputPreview(field) {
    if (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.renderPreview) {
      return window.InputRegistry.renderPreview(field);
    }
    const placeholder = (field.placeholder || '').replace(/"/g, '&quot;');
    return `<input type="text" class="preview-input" placeholder="${placeholder}" disabled>`;
  }

  setupCanvasFieldListeners() {
    const fields = this.querySelectorAll('.canvas-field');
    
    fields.forEach((field, index) => {
      // Click para seleccionar (no si se hace clic en acciones o en la X)
      field.addEventListener('click', (e) => {
        if (!e.target.closest('.field-action-btn') && !e.target.closest('.canvas-field-remove')) {
          this.selectField(index);
        }
      });
      
      // Drag para reordenar
      field.addEventListener('dragstart', (e) => {
        this.draggedFieldIndex = index;
        e.dataTransfer.setData('text/plain', JSON.stringify({
          type: 'reorder',
          fromIndex: index
        }));
        field.classList.add('dragging');
      });
      
      field.addEventListener('dragend', () => {
        field.classList.remove('dragging');
        this.draggedFieldIndex = null;
      });
      
      field.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedFieldIndex !== null && this.draggedFieldIndex !== index) {
          field.classList.add('drag-target');
        }
      });
      
      field.addEventListener('dragleave', () => {
        field.classList.remove('drag-target');
      });
      
      field.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        field.classList.remove('drag-target');
        
        if (this.draggedFieldIndex !== null && this.draggedFieldIndex !== index) {
          this.reorderField(this.draggedFieldIndex, index);
        }
      });
      
      // Botones de acción (header y X esquina)
      const duplicateBtn = field.querySelector('.duplicate-field');
      const deleteBtn = field.querySelector('.delete-field');
      const removeXBtn = field.querySelector('.canvas-field-remove');
      
      if (duplicateBtn) {
        duplicateBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.duplicateField(index);
        });
      }
      
      const doDelete = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.deleteField(index);
      };
      if (deleteBtn) deleteBtn.addEventListener('click', doDelete);
      if (removeXBtn) removeXBtn.addEventListener('click', doDelete);
    });
  }

  selectField(index) {
    this.selectedFieldIndex = index;
    
    // Update visual selection
    this.querySelectorAll('.canvas-field').forEach((f, i) => {
      f.classList.toggle('selected', i === index);
    });
    
    this.renderPropertiesPanel();
  }

  duplicateField(index) {
    const original = this.inputSchema[index];
    const duplicate = {
      ...JSON.parse(JSON.stringify(original)),
      key: this.generateFieldKey(original.key),
      label: `${original.label} (copia)`
    };
    
    this.inputSchema.splice(index + 1, 0, duplicate);
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    this.selectField(index + 1);
    this.updateJsonPreview();
  }

  deleteField(index) {
    this.inputSchema.splice(index, 1);
    this.hasUnsavedChanges = true;
    
    if (this.selectedFieldIndex === index) {
      this.selectedFieldIndex = null;
      this.renderPropertiesPanel();
    } else if (this.selectedFieldIndex > index) {
      this.selectedFieldIndex--;
    }
    
    this.renderCanvas();
    this.updateJsonPreview();
  }

  renderPropertiesPanel() {
    const panel = this.querySelector('#propertiesPanel');
    if (!panel) return;
    
    if (this.selectedFieldIndex === null || !this.inputSchema[this.selectedFieldIndex]) {
      panel.innerHTML = `
        <div class="properties-empty">
          <i class="ph ph-cursor-click"></i>
          <p>Selecciona un campo para editar sus propiedades</p>
        </div>
      `;
      return;
    }
    
    const field = this.inputSchema[this.selectedFieldIndex];
    const dataType = field.data_type || this.inferDataType(field);
    const defaultValueBlock = this.renderDefaultValueBlock(field, dataType);
    
    panel.innerHTML = `
      <div class="properties-form">
        <div class="property-group">
          <h4>General</h4>
          
          <div class="property-field">
            <label for="propKey">Key (ID)</label>
            <input type="text" id="propKey" value="${field.key}" pattern="[a-z0-9_]+">
            <span class="field-help">Identificador único (solo letras minúsculas, números y _)</span>
          </div>
          
          <div class="property-field">
            <label for="propLabel">Label</label>
            <input type="text" id="propLabel" value="${(field.label || '').replace(/"/g, '&quot;')}">
          </div>
          
          <div class="property-field">
            <label for="propPlaceholder">Placeholder</label>
            <input type="text" id="propPlaceholder" value="${(field.placeholder || '').replace(/"/g, '&quot;')}">
          </div>
          
          <div class="property-field">
            <label for="propDescription">Texto de ayuda</label>
            <input type="text" id="propDescription" value="${(field.description || '').replace(/"/g, '&quot;')}">
          </div>
          
          <div class="property-field">
            <label for="propDataType">Tipo de dato</label>
            <select id="propDataType">
              <option value="string" ${dataType === 'string' ? 'selected' : ''}>String</option>
              <option value="number" ${dataType === 'number' ? 'selected' : ''}>Number</option>
              <option value="boolean" ${dataType === 'boolean' ? 'selected' : ''}>Boolean</option>
              <option value="array" ${dataType === 'array' ? 'selected' : ''}>Array</option>
              <option value="object" ${dataType === 'object' ? 'selected' : ''}>Object (JSON)</option>
            </select>
            <span class="field-help">Tipo del valor (string, number, boolean, array, object)</span>
          </div>
          
          ${defaultValueBlock}
          
          <div class="property-toggle">
            <label>
              <input type="checkbox" id="propRequired" ${field.required ? 'checked' : ''}>
              <span>Campo requerido</span>
            </label>
          </div>
        </div>
        
        ${this.renderTypeSpecificProperties(field)}
        
        <div class="property-group">
          <h4>Apariencia</h4>
          
          <div class="property-field">
            <label for="propWidth">Ancho</label>
            <select id="propWidth">
              <option value="full" ${(field.ui?.width || 'full') === 'full' ? 'selected' : ''}>Completo</option>
              <option value="half" ${field.ui?.width === 'half' ? 'selected' : ''}>Mitad</option>
              <option value="third" ${field.ui?.width === 'third' ? 'selected' : ''}>Tercio</option>
            </select>
          </div>
          
          <div class="property-toggle">
            <label>
              <input type="checkbox" id="propHidden" ${field.ui?.hidden ? 'checked' : ''}>
              <span>Oculto por defecto</span>
            </label>
          </div>
        </div>
        
        <div class="property-group">
          <h4>Variables / Config (JSON)</h4>
          <div class="property-field">
            <label for="propExtraConfig">Configuración extra (objeto JSON)</label>
            <textarea id="propExtraConfig" class="property-json-editor" rows="4" placeholder='{ "key": "value" }'></textarea>
            <span class="field-help">Objeto JSON opcional (variables, flags, config). Se guarda en el campo.</span>
          </div>
        </div>
      </div>
    `;
    
    this.setupPropertiesListeners();
    this.syncDefaultValueAndExtraConfigToDom(field, dataType);
  }

  inferDataType(field) {
    const t = (field.input_type || field.type || '').toLowerCase();
    if (['number', 'range', 'stepper', 'rating'].indexOf(t) >= 0) return 'number';
    if (['checkbox', 'switch', 'boolean', 'toggle'].indexOf(t) >= 0) return 'boolean';
    if (['select', 'multi_select', 'tone_selector', 'mood_selector', 'length_selector', 'radio'].indexOf(t) >= 0) return 'string';
    if (['tag_input', 'gallery_picker'].indexOf(t) >= 0) return 'array';
    if (['brand_selector', 'entity_selector', 'audience_selector', 'campaign_selector', 'product_selector', 'image_selector'].indexOf(t) >= 0) return 'object';
    return field.data_type || 'string';
  }

  renderDefaultValueBlock(field, dataType) {
    const type = field.input_type || field.type;
    const isNumberFamily = ['number', 'range', 'stepper', 'rating'].indexOf((type || '').toLowerCase()) >= 0;
    const isBooleanFamily = ['checkbox', 'switch', 'boolean', 'toggle'].indexOf((type || '').toLowerCase()) >= 0;
    if (isNumberFamily) {
      return ''; // min/max/step/defaultValue se editan en tipo Número
    }
    if (isBooleanFamily) {
      const checked = field.defaultValue === true;
      return `
        <div class="property-field">
          <label>Valor por defecto</label>
          <div class="property-toggle">
            <label>
              <input type="checkbox" id="propDefaultValueBool" ${checked ? 'checked' : ''}>
              <span>Activado por defecto</span>
            </label>
          </div>
        </div>
      `;
    }
    if (dataType === 'array') {
      return `
        <div class="property-field">
          <label for="propDefaultValueJson">Valor por defecto (array JSON)</label>
          <textarea id="propDefaultValueJson" class="property-json-editor" rows="3" placeholder='["item1", "item2"]'></textarea>
        </div>
      `;
    }
    if (dataType === 'object') {
      return `
        <div class="property-field">
          <label for="propDefaultValueJson">Valor por defecto (objeto JSON)</label>
          <textarea id="propDefaultValueJson" class="property-json-editor" rows="3" placeholder='{ "id": "", "name": "" }'></textarea>
        </div>
      `;
    }
    const strVal = (typeof field.defaultValue === 'string') ? field.defaultValue : '';
    return `
      <div class="property-field">
        <label for="propDefaultValueStr">Valor por defecto</label>
        <input type="text" id="propDefaultValueStr" value="${strVal.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">
      </div>
    `;
  }

  syncDefaultValueAndExtraConfigToDom(field, dataType) {
    const type = (field.input_type || field.type || '').toLowerCase();
    const isArrayOrObject = dataType === 'array' || dataType === 'object';
    if (isArrayOrObject) {
      const jsonEl = this.querySelector('#propDefaultValueJson');
      if (jsonEl) {
        try {
          const val = field.defaultValue;
          jsonEl.value = (dataType === 'array' && Array.isArray(val)) || (dataType === 'object' && val && typeof val === 'object' && !Array.isArray(val))
            ? JSON.stringify(val, null, 2) : (dataType === 'array' ? '[]' : '{}');
        } catch (_) {
          jsonEl.value = dataType === 'array' ? '[]' : '{}';
        }
      }
    }
    const extraEl = this.querySelector('#propExtraConfig');
    if (extraEl && field.extra_config) {
      try {
        extraEl.value = typeof field.extra_config === 'object' ? JSON.stringify(field.extra_config, null, 2) : (field.extra_config || '{}');
      } catch (_) {
        extraEl.value = '{}';
      }
    } else if (extraEl && field.config && typeof field.config === 'object') {
      try {
        extraEl.value = JSON.stringify(field.config, null, 2);
      } catch (_) {
        extraEl.value = '{}';
      }
    }
    const optionsArrayEl = this.querySelector('#propOptionsArray');
    if (optionsArrayEl && field.options) {
      optionsArrayEl.value = field.options.map(function (o) {
        if (o == null) return '';
        return (o.label !== undefined && o.label !== null ? o.label : (o.value !== undefined && o.value !== null ? o.value : o));
      }).join('\n');
    }
  }

  renderTypeSpecificProperties(field) {
    const type = field.input_type || field.type || 'text';
    const family = (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.getPropertyFamily)
      ? window.InputRegistry.getPropertyFamily(type) : type;
    const escapeProp = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
    switch (family) {
      case 'text':
      case 'textarea':
        return `
          <div class="property-group">
            <h4>Texto</h4>
            <div class="property-field">
              <label for="propMaxLength">Máximo caracteres</label>
              <input type="number" id="propMaxLength" value="${field.maxLength || ''}" min="1">
            </div>
            ${(field.input_type || field.type) === 'textarea' ? `
              <div class="property-field">
                <label for="propRows">Filas</label>
                <input type="number" id="propRows" value="${field.rows || 4}" min="2" max="20">
              </div>
            ` : ''}
          </div>
        `;
      
      case 'number':
      case 'range':
        // number, range y tipos numéricos del registry
        return `
          <div class="property-group">
            <h4>Número</h4>
            <div class="property-row">
              <div class="property-field">
                <label for="propMin">Mínimo</label>
                <input type="number" id="propMin" value="${field.min ?? 0}">
              </div>
              <div class="property-field">
                <label for="propMax">Máximo</label>
                <input type="number" id="propMax" value="${field.max ?? 100}">
              </div>
            </div>
            <div class="property-row">
              <div class="property-field">
                <label for="propStep">Incremento</label>
                <input type="number" id="propStep" value="${field.step ?? 1}" min="0.01">
              </div>
              <div class="property-field">
                <label for="propDefaultValue">Valor inicial</label>
                <input type="number" id="propDefaultValue" value="${field.defaultValue ?? ''}">
              </div>
            </div>
          </div>
        `;
      
      case 'select':
      case 'radio': {
        const options = field.options || [];
        const isSelect = (field.input_type || field.type || '').toLowerCase() === 'select' || (field.input_type || field.type || '').toLowerCase() === 'multi_select';
        return `
          <div class="property-group">
            <h4>Lista desplegable</h4>
            ${isSelect ? `
            <div class="property-toggle" style="margin-bottom: 12px;">
              <label>
                <input type="checkbox" id="propMultiselect" ${field.is_multiple ? 'checked' : ''}>
                <span>Multiselección</span>
              </label>
              <span class="field-help block">Permite elegir varias opciones a la vez.</span>
            </div>
            ` : ''}
            <div class="property-field">
              <label for="propOptionsArray">Opciones como array (una por línea)</label>
              <textarea id="propOptionsArray" class="property-json-editor options-array-textarea" rows="5" placeholder="Una opción por línea, ej.:&#10;opcion 1&#10;opcion 2&#10;opcion 3"></textarea>
              <span class="field-help">Escribe o pega una opción por línea. Se usa como valor y etiqueta. También puedes editar fila por fila abajo.</span>
            </div>
            <div class="property-field">
              <label>Opciones (valor / etiqueta)</label>
            </div>
            <div class="options-editor" id="optionsEditor">
              ${options.map((opt, i) => `
                <div class="option-row" data-index="${i}">
                  <input type="text" class="option-value" placeholder="Valor" value="${escapeProp(opt.value !== undefined ? opt.value : opt)}">
                  <input type="text" class="option-label" placeholder="Label" value="${escapeProp(opt.label !== undefined ? opt.label : opt)}">
                  <button class="btn-icon remove-option" title="Eliminar">
                    <i class="ph ph-x"></i>
                  </button>
                </div>
              `).join('')}
            </div>
            <button class="btn-small" id="addOptionBtn">
              <i class="ph ph-plus"></i> Agregar opción
            </button>
          </div>
        `;
      }
      
      default:
        if (type === 'entity_selector') {
          const entityTypes = field.entityTypes || ['product', 'service', 'place'];
          return `
            <div class="property-group">
              <h4>Tipos de Entidad</h4>
              <div class="entity-types-toggles">
                <label class="property-toggle">
                  <input type="checkbox" data-type="product" ${entityTypes.includes('product') ? 'checked' : ''}>
                  <span>Productos</span>
                </label>
                <label class="property-toggle">
                  <input type="checkbox" data-type="service" ${entityTypes.includes('service') ? 'checked' : ''}>
                  <span>Servicios</span>
                </label>
                <label class="property-toggle">
                  <input type="checkbox" data-type="place" ${entityTypes.includes('place') ? 'checked' : ''}>
                  <span>Lugares</span>
                </label>
              </div>
            </div>
          `;
        }
        return '';
    }
  }

  setupPropertiesListeners() {
    const field = this.inputSchema[this.selectedFieldIndex];
    if (!field) return;
    
    // General properties
    const keyInput = this.querySelector('#propKey');
    const labelInput = this.querySelector('#propLabel');
    const placeholderInput = this.querySelector('#propPlaceholder');
    const descriptionInput = this.querySelector('#propDescription');
    const requiredCheckbox = this.querySelector('#propRequired');
    const widthSelect = this.querySelector('#propWidth');
    const hiddenCheckbox = this.querySelector('#propHidden');
    
    if (keyInput) {
      keyInput.addEventListener('change', (e) => {
        const newKey = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (newKey && !this.inputSchema.some((f, i) => i !== this.selectedFieldIndex && f.key === newKey)) {
          field.key = newKey;
          this.onFieldChange();
        } else {
          e.target.value = field.key;
        }
      });
    }
    
    if (labelInput) {
      labelInput.addEventListener('input', (e) => {
        field.label = e.target.value;
        this.onFieldChange();
      });
    }
    
    if (placeholderInput) {
      placeholderInput.addEventListener('input', (e) => {
        field.placeholder = e.target.value;
        this.onFieldChange();
      });
    }
    
    if (descriptionInput) {
      descriptionInput.addEventListener('input', (e) => {
        field.description = e.target.value;
        this.onFieldChange();
      });
    }
    
    if (requiredCheckbox) {
      requiredCheckbox.addEventListener('change', (e) => {
        field.required = e.target.checked;
        this.onFieldChange();
      });
    }
    
    if (widthSelect) {
      widthSelect.addEventListener('change', (e) => {
        if (!field.ui) field.ui = {};
        field.ui.width = e.target.value;
        this.onFieldChange();
      });
    }
    
    if (hiddenCheckbox) {
      hiddenCheckbox.addEventListener('change', (e) => {
        if (!field.ui) field.ui = {};
        field.ui.hidden = e.target.checked;
        this.onFieldChange();
      });
    }
    
    const dataTypeSelect = this.querySelector('#propDataType');
    if (dataTypeSelect) {
      dataTypeSelect.addEventListener('change', (e) => {
        field.data_type = e.target.value;
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    
    const defaultValueStr = this.querySelector('#propDefaultValueStr');
    if (defaultValueStr) {
      defaultValueStr.addEventListener('input', (e) => {
        field.defaultValue = e.target.value;
        this.onFieldChange();
      });
    }
    
    const defaultValueBool = this.querySelector('#propDefaultValueBool');
    if (defaultValueBool) {
      defaultValueBool.addEventListener('change', (e) => {
        field.defaultValue = e.target.checked;
        this.onFieldChange();
      });
    }
    
    const defaultValueJson = this.querySelector('#propDefaultValueJson');
    if (defaultValueJson) {
      defaultValueJson.addEventListener('blur', (e) => {
        const raw = (e.target.value || '').trim();
        if (!raw) {
          field.defaultValue = (field.data_type === 'array') ? [] : {};
          this.onFieldChange();
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          if (field.data_type === 'array' && !Array.isArray(parsed)) {
            e.target.value = JSON.stringify(field.defaultValue, null, 2);
            return;
          }
          if (field.data_type === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed))) {
            e.target.value = JSON.stringify(field.defaultValue || {}, null, 2);
            return;
          }
          field.defaultValue = parsed;
          e.target.value = JSON.stringify(parsed, null, 2);
          this.onFieldChange();
        } catch (err) {
          this.showNotification('JSON inválido en valor por defecto', 'error');
        }
      });
    }
    
    const extraConfigEl = this.querySelector('#propExtraConfig');
    if (extraConfigEl) {
      extraConfigEl.addEventListener('blur', (e) => {
        const raw = (e.target.value || '').trim();
        if (!raw) {
          delete field.extra_config;
          delete field.config;
          this.onFieldChange();
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            this.showNotification('La config extra debe ser un objeto JSON', 'error');
            return;
          }
          field.extra_config = parsed;
          e.target.value = JSON.stringify(parsed, null, 2);
          this.onFieldChange();
        } catch (err) {
          this.showNotification('JSON inválido en configuración extra', 'error');
        }
      });
    }
    
    // Type-specific properties
    this.setupTypeSpecificListeners(field);
  }

  setupTypeSpecificListeners(field) {
    // Text/Textarea
    const maxLengthInput = this.querySelector('#propMaxLength');
    const rowsInput = this.querySelector('#propRows');
    
    if (maxLengthInput) {
      maxLengthInput.addEventListener('change', (e) => {
        field.maxLength = parseInt(e.target.value) || null;
        this.onFieldChange();
      });
    }
    
    if (rowsInput) {
      rowsInput.addEventListener('change', (e) => {
        field.rows = parseInt(e.target.value) || 4;
        this.onFieldChange();
      });
    }
    
    // Number/Range
    const minInput = this.querySelector('#propMin');
    const maxInput = this.querySelector('#propMax');
    const stepInput = this.querySelector('#propStep');
    const defaultValueInput = this.querySelector('#propDefaultValue');
    
    if (minInput) {
      minInput.addEventListener('change', (e) => {
        field.min = parseFloat(e.target.value) || 0;
        this.onFieldChange();
      });
    }
    
    if (maxInput) {
      maxInput.addEventListener('change', (e) => {
        field.max = parseFloat(e.target.value) || 100;
        this.onFieldChange();
      });
    }
    
    if (stepInput) {
      stepInput.addEventListener('change', (e) => {
        field.step = parseFloat(e.target.value) || 1;
        this.onFieldChange();
      });
    }
    
    if (defaultValueInput) {
      defaultValueInput.addEventListener('change', (e) => {
        field.defaultValue = parseFloat(e.target.value) || null;
        this.onFieldChange();
      });
    }
    
    const multiselectCheckbox = this.querySelector('#propMultiselect');
    if (multiselectCheckbox) {
      multiselectCheckbox.addEventListener('change', (e) => {
        field.is_multiple = e.target.checked;
        this.onFieldChange();
      });
    }
    
    const optionsArrayTa = this.querySelector('#propOptionsArray');
    if (optionsArrayTa) {
      optionsArrayTa.addEventListener('blur', (e) => {
        const text = (e.target.value || '').trim();
        if (!text) {
          field.options = [];
          this.renderPropertiesPanel();
          this.onFieldChange();
          return;
        }
        const lines = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
        field.options = lines.map(function (line) { return { value: line, label: line }; });
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    
    // Select/Radio options
    const addOptionBtn = this.querySelector('#addOptionBtn');
    const optionsEditor = this.querySelector('#optionsEditor');
    
    if (addOptionBtn) {
      addOptionBtn.addEventListener('click', () => {
        if (!field.options) field.options = [];
        field.options.push({ value: '', label: '' });
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    
    if (optionsEditor) {
      optionsEditor.querySelectorAll('.option-row').forEach((row, index) => {
        const valueInput = row.querySelector('.option-value');
        const labelInput = row.querySelector('.option-label');
        const removeBtn = row.querySelector('.remove-option');
        
        if (valueInput) {
          valueInput.addEventListener('input', (e) => {
            if (!field.options[index]) field.options[index] = {};
            if (typeof field.options[index] === 'string') {
              field.options[index] = { value: e.target.value, label: field.options[index] };
            } else {
              field.options[index].value = e.target.value;
            }
            this.onFieldChange();
          });
        }
        
        if (labelInput) {
          labelInput.addEventListener('input', (e) => {
            if (!field.options[index]) field.options[index] = {};
            if (typeof field.options[index] === 'string') {
              field.options[index] = { value: field.options[index], label: e.target.value };
            } else {
              field.options[index].label = e.target.value;
            }
            this.onFieldChange();
          });
        }
        
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            field.options.splice(index, 1);
            this.renderPropertiesPanel();
            this.onFieldChange();
          });
        }
      });
    }
    
    // Entity types
    const entityTypeCheckboxes = this.querySelectorAll('.entity-types-toggles input[data-type]');
    entityTypeCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        field.entityTypes = Array.from(this.querySelectorAll('.entity-types-toggles input[data-type]:checked'))
          .map(cb => cb.dataset.type);
        this.onFieldChange();
      });
    });
  }

  onFieldChange() {
    this.hasUnsavedChanges = true;
    this.debouncedRefreshUI();
  }

  updateJsonPreview() {
    const preview = this.querySelector('#jsonSchemaPreview code');
    if (!preview) return;
    
    const schema = {
      fields: this.inputSchema
    };
    
    preview.textContent = JSON.stringify(schema, null, 2);
  }

  async loadFlow() {
    if (!this.supabase || !this.flowId) return;
    
    try {
      // Cargar flujo principal
      const { data: flow, error } = await this.supabase
        .from('content_flows')
        .select('*')
        .eq('id', this.flowId)
        .single();
      
      if (error) throw error;
      
      if (!flow) {
        this.showNotification('Flujo no encontrado', 'error');
        window.router?.navigate('/dev/flows');
        return;
      }
      
      // Verificar permisos
      if (flow.owner_id !== this.userId) {
        // TODO: Verificar si es colaborador
        this.showNotification('No tienes permisos para editar este flujo', 'error');
        window.router?.navigate('/dev/flows');
        return;
      }
      
      // Cargar datos (alineado con content_flows: subcategory_id, execution_mode)
      this.flowData = {
        name: flow.name,
        description: flow.description || '',
        category_id: flow.category_id,
        subcategory_id: flow.subcategory_id || null,
        output_type: flow.output_type || 'text',
        flow_category_type: flow.flow_category_type || 'manual',
        token_cost: flow.token_cost || 1,
        flow_image_url: flow.flow_image_url,
        status: flow.status || 'draft',
        version: flow.version || '1.0.0',
        owner_id: flow.owner_id,
        execution_mode: flow.execution_mode || 'single_step'
      };
      
      this.inputSchema = [];
      
      // Cargar ui_layout_config
      if (flow.ui_layout_config && Object.keys(flow.ui_layout_config).length > 0) {
        this.uiLayoutConfig = { ...this.uiLayoutConfig, ...flow.ui_layout_config };
      }
      
      // Cargar detalles técnicos e input_schema: flow_technical_details por flow_module_id; webhooks e input_schema en flow_modules
      const { data: flowModule } = await this.supabase
        .from('flow_modules')
        .select('id, webhook_url_test, webhook_url_prod, input_schema')
        .eq('content_flow_id', this.flowId)
        .limit(1)
        .maybeSingle();
      
      if (flowModule) {
        if (flowModule.input_schema?.fields) {
          this.inputSchema = flowModule.input_schema.fields;
        } else if (Array.isArray(flowModule.input_schema)) {
          this.inputSchema = flowModule.input_schema;
        }
        const { data: techDetails } = await this.supabase
          .from('flow_technical_details')
          .select('platform_name, editor_url')
          .eq('flow_module_id', flowModule.id)
          .maybeSingle();
        
        this.technicalDetails = {
          webhook_url_test: flowModule.webhook_url_test || '',
          webhook_url_prod: flowModule.webhook_url_prod || '',
          webhook_method: 'POST',
          platform_name: techDetails?.platform_name || 'n8n',
          editor_url: techDetails?.editor_url || ''
        };
      }
      if (this.inputSchema.length === 0 && flow.input_schema?.fields) {
        this.inputSchema = flow.input_schema.fields;
      } else if (this.inputSchema.length === 0 && Array.isArray(flow.input_schema)) {
        this.inputSchema = flow.input_schema;
      }
      // Normalizar input_type en cada campo para que el canvas muestre el cascarón correcto (number, select, checkbox, etc.)
      this.inputSchema = this.inputSchema.map(f => ({ ...f, input_type: f.input_type || f.type || 'text' }));
      
      // Actualizar UI y adaptar por tipo (manual vs automated)
      this.populateForm();
      this.applyFlowTypeUI();
      
    } catch (err) {
      console.error('Error loading flow:', err);
      this.showNotification('Error al cargar el flujo', 'error');
    }
  }

  populateForm() {
    const nameConfig = this.querySelector('#flowNameConfig');
    if (nameConfig) nameConfig.value = this.flowData.name;

    // URL del flujo (editable para copiar/pegar o ajustar)
    const flowUrlInput = this.querySelector('#flowUrlInput');
    const copyFlowUrlBtn = this.querySelector('#copyFlowUrlBtn');
    const flowUrl = this.getFlowPublicUrl();
    if (flowUrlInput) {
      flowUrlInput.value = flowUrl || '';
      flowUrlInput.placeholder = '— Guarda el flujo para ver la URL';
    }
    if (copyFlowUrlBtn) copyFlowUrlBtn.style.display = flowUrl ? 'inline-flex' : 'none';

    // Nombre técnico (ui_layout_config.technical_name)
    const technicalName = this.querySelector('#flowTechnicalName');
    if (technicalName) technicalName.value = this.uiLayoutConfig.technical_name || '';
    
    // Status badge
    this.updateStatusBadge();
    
    // Configuración
    const descInput = this.querySelector('#flowDescription');
    const categorySelect = this.querySelector('#flowCategory');
    const outputTypeSelect = this.querySelector('#flowOutputType');
    const flowTypeSelect = this.querySelector('#flowType');
    const tokenCostInput = this.querySelector('#flowTokenCost');
    const versionInput = this.querySelector('#flowVersion');
    
    if (descInput) descInput.value = this.flowData.description;
    if (categorySelect) categorySelect.value = this.flowData.category_id || '';
    if (outputTypeSelect) outputTypeSelect.value = this.flowData.output_type;
    if (flowTypeSelect) flowTypeSelect.value = this.flowData.flow_category_type;
    if (tokenCostInput) tokenCostInput.value = this.flowData.token_cost ?? 1;
    if (versionInput) versionInput.value = this.flowData.version;
    
    // Image preview
    if (this.flowData.flow_image_url) {
      this.updateImagePreview(this.flowData.flow_image_url);
    }
    
    // UI Layout
    const uiTheme = this.querySelector('#uiTheme');
    const uiColumns = this.querySelector('#uiColumns');
    const uiShowLabels = this.querySelector('#uiShowLabels');
    const uiShowHelperText = this.querySelector('#uiShowHelperText');
    const uiSubmitText = this.querySelector('#uiSubmitText');
    const uiSubmitPosition = this.querySelector('#uiSubmitPosition');
    
    if (uiTheme) uiTheme.value = this.uiLayoutConfig.theme || 'default';
    if (uiColumns) uiColumns.value = this.uiLayoutConfig.columns || '1';
    if (uiShowLabels) uiShowLabels.checked = this.uiLayoutConfig.showLabels !== false;
    if (uiShowHelperText) uiShowHelperText.checked = this.uiLayoutConfig.showHelperText !== false;
    if (uiSubmitText) uiSubmitText.value = this.uiLayoutConfig.submitButtonText || 'Generar';
    if (uiSubmitPosition) uiSubmitPosition.value = this.uiLayoutConfig.submitButtonPosition || 'right';
    
    const uiHiddenFromCatalog = this.querySelector('#uiHiddenFromCatalog');
    if (uiHiddenFromCatalog) uiHiddenFromCatalog.checked = !!this.uiLayoutConfig.hidden_from_catalog;
    
    // Technical details
    const webhookTest = this.querySelector('#webhookTest');
    const webhookProd = this.querySelector('#webhookProd');
    const webhookMethod = this.querySelector('#webhookMethod');
    const platformName = this.querySelector('#platformName');
    const editorUrl = this.querySelector('#editorUrl');
    
    if (webhookTest) webhookTest.value = this.technicalDetails.webhook_url_test;
    if (webhookProd) webhookProd.value = this.technicalDetails.webhook_url_prod;
    if (webhookMethod) webhookMethod.value = this.technicalDetails.webhook_method;
    if (platformName) platformName.value = this.technicalDetails.platform_name;
    if (editorUrl) editorUrl.value = this.technicalDetails.editor_url;
    
    // Render canvas
    this.renderCanvas();
    this.updateJsonPreview();
  }

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
    if (componentsSidebar) componentsSidebar.style.display = (isInputs && !this.isAutomatedFlow) ? '' : 'none';
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
      if (this.isAutomatedFlow || this.inputSchema.length === 0) {
        inputsPreview.innerHTML = '<p class="ficha-inputs-empty">Sin campos de entrada o flujo automatizado.</p>';
      } else {
        inputsPreview.innerHTML = this.generateFormPreview();
      }
    }
  }

  /**
   * Adapta la interfaz según flow_category_type (manual vs automated).
   * Modo Sistema: oculta componentes, muestra mensaje en canvas, webhooks → CRON, token cost 0, oculto catálogo.
   */
  applyFlowTypeUI() {
    const isAutomated = this.flowData.flow_category_type === 'automated';
    this.isAutomatedFlow = isAutomated;

    const main = this.querySelector('.builder-main');
    const componentsSidebar = this.querySelector('.builder-sidebar.builder-components');
    const canvasEmpty = this.querySelector('#canvasEmptyState');
    const canvasAutomated = this.querySelector('#canvasAutomatedState');
    const canvasFields = this.querySelector('#canvasFields');
    const technicalWebhook = this.querySelector('#technicalWebhookSection');
    const technicalAutomated = this.querySelector('#technicalAutomatedBlock');
    const tokenCostInput = this.querySelector('#flowTokenCost');
    const hiddenFromCatalog = this.querySelector('#uiHiddenFromCatalog');
    const testFlowBtn = this.querySelector('#testFlowBtn');
    const btnTestRun = this.querySelector('#btnTestRun');

    if (isAutomated) {
      this.flowData.token_cost = 0;
      if (this.uiLayoutConfig.hidden_from_catalog === undefined) {
        this.uiLayoutConfig.hidden_from_catalog = true;
      }
      if (main) main.classList.add('builder-mode-automated');
      if (componentsSidebar) componentsSidebar.classList.add('builder-sidebar-hidden');
      if (canvasEmpty) canvasEmpty.style.display = 'none';
      if (canvasFields) canvasFields.style.display = 'none';
      if (canvasAutomated) canvasAutomated.style.display = 'flex';
      if (technicalWebhook) technicalWebhook.style.display = 'none';
      if (technicalAutomated) technicalAutomated.style.display = 'block';
      if (tokenCostInput) {
        tokenCostInput.value = 0;
        tokenCostInput.min = 0;
        tokenCostInput.max = 0;
        tokenCostInput.disabled = true;
      }
      if (hiddenFromCatalog) {
        hiddenFromCatalog.checked = true;
        hiddenFromCatalog.disabled = true;
      }
      if (testFlowBtn) testFlowBtn.style.display = 'none';
      if (btnTestRun) btnTestRun.style.display = 'none';
    } else {
      if (main) main.classList.remove('builder-mode-automated');
      if (componentsSidebar) componentsSidebar.classList.remove('builder-sidebar-hidden');
      if (canvasEmpty) canvasEmpty.style.display = 'flex';
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
      if (hiddenFromCatalog) {
        hiddenFromCatalog.disabled = false;
        hiddenFromCatalog.checked = !!this.uiLayoutConfig.hidden_from_catalog;
      }
      if (testFlowBtn) testFlowBtn.style.display = '';
      if (btnTestRun) btnTestRun.style.display = '';
    }
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
    
    badge.className = `builder-status-badge ${this.flowData.status}`;
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
      unpublish: this.querySelector('#btnUnpublish'),
      testRun: this.querySelector('#btnTestRun')
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
      if (!this.isAutomatedFlow) show(buttons.testRun);
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
        if (!this.isAutomatedFlow) show(buttons.testRun);
      }
    } else if (status === 'published') {
      messageEl.textContent = 'Estás editando un flujo en vivo. Los cambios afectarán a los clientes.';
      messageEl.classList.add('published-warning');
      show(buttons.updateFlow);
      if (!this.isAutomatedFlow) show(buttons.testRun);
      if (isLead) show(buttons.unpublish);
    } else {
      messageEl.textContent = '';
      show(buttons.saveDraft);
      if (!this.isAutomatedFlow) show(buttons.testRun);
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
    // Back button
    const backBtn = this.querySelector('#builderBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.handleBack());
    }
    
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
    
    // Preview button (footer)
    const previewBtn = this.querySelector('#previewFlowBtn');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => this.showPreview());
    }
    
    // Test button
    const testBtn = this.querySelector('#testFlowBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => this.showTestModal());
    }

    // Ver JSON Schema
    const viewJsonSchemaBtn = this.querySelector('#viewJsonSchemaBtn');
    if (viewJsonSchemaBtn) {
      viewJsonSchemaBtn.addEventListener('click', () => this.showJsonSchemaModal());
    }
    
    // More actions menu
    const moreActionsBtn = this.querySelector('#moreActionsBtn');
    const moreActionsDropdown = this.querySelector('#moreActionsDropdown');
    if (moreActionsBtn && moreActionsDropdown) {
      moreActionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreActionsDropdown.style.display = moreActionsDropdown.style.display === 'none' ? 'block' : 'none';
      });
      var closeDropdown = function () {
        moreActionsDropdown.style.display = 'none';
      };
      document.addEventListener('click', closeDropdown);
      this._documentListeners.push({ element: document, event: 'click', handler: closeDropdown });
    }
    
    // Publish button
    const publishBtn = this.querySelector('#publishFlowBtn');
    if (publishBtn) {
      publishBtn.addEventListener('click', () => this.publishFlow());
    }
    
    // Duplicate button
    const duplicateBtn = this.querySelector('#duplicateFlowBtn');
    if (duplicateBtn) {
      duplicateBtn.addEventListener('click', () => this.duplicateFlow());
    }
    
    // Export button
    const exportBtn = this.querySelector('#exportFlowBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportFlow());
    }
    
    // Delete button
    const deleteBtn = this.querySelector('#deleteFlowBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.showDeleteModal());
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
    const testRun = this.querySelector('#btnTestRun');

    if (saveDraft) saveDraft.addEventListener('click', () => this.saveFlow());
    if (updateFlow) updateFlow.addEventListener('click', () => this.saveFlow());
    if (publish) publish.addEventListener('click', () => this.publishFlow());
    if (requestReview) requestReview.addEventListener('click', () => this.requestReview());
    if (approvePublish) approvePublish.addEventListener('click', () => this.approveAndPublish());
    if (reject) reject.addEventListener('click', () => this.rejectFlow());
    if (unpublish) unpublish.addEventListener('click', () => this.unpublishFlow());
    if (testRun) testRun.addEventListener('click', () => this.showTestModal());
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
      flowOutputType: (v) => this.flowData.output_type = v,
      flowTokenCost: (v) => this.flowData.token_cost = parseInt(v, 10) >= 0 ? parseInt(v, 10) : 1,
      flowVersion: (v) => this.flowData.version = v,
      uiTheme: (v) => this.uiLayoutConfig.theme = v,
      uiColumns: (v) => this.uiLayoutConfig.columns = parseInt(v) || 1,
      uiSubmitText: (v) => this.uiLayoutConfig.submitButtonText = v,
      uiSubmitPosition: (v) => this.uiLayoutConfig.submitButtonPosition = v
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

    // Tipo de flujo: solo Lead puede cambiar a "automated"
    const flowTypeSelect = this.querySelector('#flowType');
    if (flowTypeSelect) {
      flowTypeSelect.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === 'automated' && !this.isLead()) {
          e.target.value = this.flowData.flow_category_type || 'manual';
          this.showNotification('Solo los Lead pueden crear o convertir flujos en automatizados.', 'warning');
          return;
        }
        this.flowData.flow_category_type = v;
        this.hasUnsavedChanges = true;
        this.applyFlowTypeUI();
        this.renderFooter();
      });
    }
    
    // Checkboxes
    const uiShowLabels = this.querySelector('#uiShowLabels');
    const uiShowHelperText = this.querySelector('#uiShowHelperText');
    const uiHiddenFromCatalog = this.querySelector('#uiHiddenFromCatalog');
    
    if (uiShowLabels) {
      uiShowLabels.addEventListener('change', (e) => {
        this.uiLayoutConfig.showLabels = e.target.checked;
        this.hasUnsavedChanges = true;
      });
    }
    
    if (uiShowHelperText) {
      uiShowHelperText.addEventListener('change', (e) => {
        this.uiLayoutConfig.showHelperText = e.target.checked;
        this.hasUnsavedChanges = true;
      });
    }

    if (uiHiddenFromCatalog) {
      uiHiddenFromCatalog.addEventListener('change', (e) => {
        this.uiLayoutConfig.hidden_from_catalog = e.target.checked;
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
      webhookTest: (v) => this.technicalDetails.webhook_url_test = v,
      webhookProd: (v) => this.technicalDetails.webhook_url_prod = v,
      webhookMethod: (v) => this.technicalDetails.webhook_method = v,
      platformName: (v) => this.technicalDetails.platform_name = v,
      editorUrl: (v) => this.technicalDetails.editor_url = v
    };
    
    Object.entries(fields).forEach(([id, setter]) => {
      const el = this.querySelector(`#${id}`);
      if (el) {
        el.addEventListener('input', (e) => {
          setter(e.target.value);
          this.hasUnsavedChanges = true;
        });
      }
    });
  }

  setupModalListeners() {
    // Preview modal
    const closePreview = this.querySelector('#closePreviewModal');
    const previewModal = this.querySelector('#previewModal');
    if (closePreview && previewModal) {
      closePreview.addEventListener('click', () => {
        previewModal.style.display = 'none';
      });
      previewModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        previewModal.style.display = 'none';
      });
    }
    
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

    // JSON Schema modal
    const jsonSchemaModal = this.querySelector('#jsonSchemaModal');
    const closeJsonSchemaModal = this.querySelector('#closeJsonSchemaModal');
    const closeJsonSchemaModalBtn = this.querySelector('#closeJsonSchemaModalBtn');
    const copyJsonSchemaModalBtn = this.querySelector('#copyJsonSchemaModalBtn');
    if (jsonSchemaModal) {
      if (closeJsonSchemaModal) {
        closeJsonSchemaModal.addEventListener('click', () => { jsonSchemaModal.style.display = 'none'; });
      }
      if (closeJsonSchemaModalBtn) {
        closeJsonSchemaModalBtn.addEventListener('click', () => { jsonSchemaModal.style.display = 'none'; });
      }
      jsonSchemaModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        jsonSchemaModal.style.display = 'none';
      });
    }
    if (copyJsonSchemaModalBtn) {
      copyJsonSchemaModalBtn.addEventListener('click', () => this.copySchema());
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

  async saveFlow() {
    if (!this.supabase || !this.userId) {
      this.showNotification('No se puede guardar. Inicia sesión.', 'error');
      return;
    }
    
    if (!this.flowData.name.trim()) {
      this.showNotification('El nombre del flujo es requerido', 'error');
      this.querySelector('#flowNameConfig')?.focus();
      return;
    }
    
    const saveBtn = this.querySelector('#btnSaveDraft') || this.querySelector('#btnUpdateFlow');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';
    }
    
    try {
      const flowPayload = {
        name: this.flowData.name.trim(),
        description: this.flowData.description,
        category_id: this.flowData.category_id,
        subcategory_id: this.flowData.subcategory_id || null,
        output_type: this.flowData.output_type,
        flow_category_type: this.flowData.flow_category_type,
        token_cost: this.flowData.token_cost,
        flow_image_url: this.flowData.flow_image_url,
        status: this.flowData.status,
        version: this.flowData.version,
        execution_mode: this.flowData.execution_mode || 'single_step',
        ui_layout_config: this.uiLayoutConfig
      };
      
      let flowId = this.flowId;
      
      if (this.isEditMode && flowId) {
        // Update existing flow
        const { error } = await this.supabase
          .from('content_flows')
          .update(flowPayload)
          .eq('id', flowId);
        
        if (error) throw error;
      } else {
        // Create new flow
        flowPayload.owner_id = this.userId;
        
        const { data, error } = await this.supabase
          .from('content_flows')
          .insert(flowPayload)
          .select('id')
          .single();
        
        if (error) throw error;
        
        flowId = data.id;
        this.flowId = flowId;
        this.isEditMode = true;
        this.flowData.owner_id = this.userId;
        
        // Update URL without reload
        const newUrl = `/dev/builder?id=${flowId}`;
        window.history.replaceState({}, '', newUrl);
      }
      
      // Save technical details
      await this.saveTechnicalDetails(flowId);
      
      this.hasUnsavedChanges = false;
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Flujo guardado correctamente', 'success');
      
    } catch (err) {
      console.error('Error saving flow:', err);
      this.showNotification('Error al guardar el flujo', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = saveBtn.id === 'btnUpdateFlow'
          ? '<i class="ph ph-pencil-simple"></i> Actualizar flujo'
          : '<i class="ph ph-floppy-disk"></i> Guardar flujo';
      }
    }
  }

  async saveTechnicalDetails(flowId) {
    if (!this.supabase || !flowId) return;
    
    // flow_technical_details usa flow_module_id (no flow_id). Necesitamos un flow_module por flow.
    let { data: modules } = await this.supabase
      .from('flow_modules')
      .select('id')
      .eq('content_flow_id', flowId)
      .limit(1);
    
    let flowModuleId = modules?.[0]?.id;
    if (!flowModuleId) {
      const { data: inserted, error: insertErr } = await this.supabase
        .from('flow_modules')
        .insert({
          content_flow_id: flowId,
          name: 'default',
          step_order: 1,
          input_schema: { fields: this.inputSchema },
          webhook_url_test: this.technicalDetails.webhook_url_test,
          webhook_url_prod: this.technicalDetails.webhook_url_prod
        })
        .select('id')
        .single();
      if (insertErr) {
        console.error('Error creating flow_module:', insertErr);
        return;
      }
      flowModuleId = inserted.id;
    } else {
      await this.supabase
        .from('flow_modules')
        .update({
          input_schema: { fields: this.inputSchema },
          webhook_url_test: this.technicalDetails.webhook_url_test,
          webhook_url_prod: this.technicalDetails.webhook_url_prod
        })
        .eq('id', flowModuleId);
    }
    
    const techPayload = {
      flow_module_id: flowModuleId,
      platform_name: this.technicalDetails.platform_name,
      editor_url: this.technicalDetails.editor_url
    };
    
    const { error } = await this.supabase
      .from('flow_technical_details')
      .upsert(techPayload, { onConflict: 'flow_module_id' });
    
    if (error) {
      console.error('Error saving technical details:', error);
    }
  }

  async publishFlow() {
    if (!this.flowId) {
      this.showNotification('Guarda el flujo primero', 'warning');
      return;
    }
    if (!this.isLead()) {
      this.showNotification('Solo un Lead puede publicar directamente', 'warning');
      return;
    }
    if (this.inputSchema.length === 0) {
      this.showNotification('Agrega al menos un campo de entrada', 'warning');
      return;
    }
    if (!this.technicalDetails.webhook_url_prod && !this.technicalDetails.webhook_url_test) {
      this.showNotification('Configura al menos un webhook', 'warning');
      this.switchTab('technical');
      return;
    }
    try {
      this.flowData.status = 'published';
      await this.saveFlow();
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('¡Flujo publicado exitosamente!', 'success');
    } catch (err) {
      console.error('Error publishing flow:', err);
      this.showNotification('Error al publicar el flujo', 'error');
    }
  }

  async requestReview() {
    if (!this.flowId || !this.supabase) return;
    if (this.flowData.status !== 'draft') return;
    if (!this.flowData.name.trim()) {
      this.showNotification('Guarda el flujo antes de solicitar revisión', 'warning');
      return;
    }
    try {
      const { error } = await this.supabase
        .from('content_flows')
        .update({ status: 'checking' })
        .eq('id', this.flowId);
      if (error) throw error;
      this.flowData.status = 'checking';
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Revisión solicitada. Un Lead aprobará el flujo.', 'success');
    } catch (err) {
      console.error('Error requesting review:', err);
      this.showNotification('Error al solicitar revisión', 'error');
    }
  }

  async approveAndPublish() {
    if (!this.flowId || !this.supabase || !this.isLead()) return;
    try {
      if (!this.technicalDetails.webhook_url_prod && this.technicalDetails.webhook_url_test) {
        this.technicalDetails.webhook_url_prod = this.technicalDetails.webhook_url_test;
        await this.saveTechnicalDetails(this.flowId);
      }
      const { error } = await this.supabase
        .from('content_flows')
        .update({ status: 'published' })
        .eq('id', this.flowId);
      if (error) throw error;
      this.flowData.status = 'published';
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Flujo aprobado y publicado', 'success');
    } catch (err) {
      console.error('Error approving flow:', err);
      this.showNotification('Error al aprobar y publicar', 'error');
    }
  }

  async rejectFlow() {
    if (!this.flowId || !this.supabase || !this.isLead()) return;
    const note = window.prompt('Motivo del rechazo (opcional):') || '';
    try {
      const { error } = await this.supabase
        .from('content_flows')
        .update({ status: 'draft' })
        .eq('id', this.flowId);
      if (error) throw error;
      this.flowData.status = 'draft';
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Flujo rechazado. Vuelve a borrador.', 'info');
      if (note && window.authService?.supabase) {
        // Opcional: crear notificación para el autor
        await window.authService.supabase.from('developer_notifications').insert({
          recipient_user_id: this.flowData.owner_id,
          flow_id: this.flowId,
          severity: 'info',
          title: 'Flujo rechazado',
          message: note || 'Tu flujo fue rechazado y está en borrador.'
        });
      }
    } catch (err) {
      console.error('Error rejecting flow:', err);
      this.showNotification('Error al rechazar', 'error');
    }
  }

  async unpublishFlow() {
    if (!this.flowId || !this.supabase || !this.isLead()) return;
    if (!confirm('¿Despublicar este flujo? Dejará de estar visible para los clientes.')) return;
    try {
      const { error } = await this.supabase
        .from('content_flows')
        .update({ status: 'draft' })
        .eq('id', this.flowId);
      if (error) throw error;
      this.flowData.status = 'draft';
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Flujo despublicado', 'info');
    } catch (err) {
      console.error('Error unpublishing flow:', err);
      this.showNotification('Error al despublicar', 'error');
    }
  }

  async duplicateFlow() {
    if (!this.flowId || !this.supabase) return;
    
    try {
      const flowPayload = {
        name: `${this.flowData.name} (copia)`,
        description: this.flowData.description,
        category_id: this.flowData.category_id,
        subcategory_id: this.flowData.subcategory_id || null,
        output_type: this.flowData.output_type,
        flow_category_type: this.flowData.flow_category_type,
        token_cost: this.flowData.token_cost,
        flow_image_url: this.flowData.flow_image_url,
        status: 'draft',
        version: this.flowData.version,
        execution_mode: this.flowData.execution_mode || 'single_step',
        owner_id: this.userId,
        ui_layout_config: this.uiLayoutConfig
      };
      
      const { data, error } = await this.supabase
        .from('content_flows')
        .insert(flowPayload)
        .select('id')
        .single();
      
      if (error) throw error;
      
      await this.saveTechnicalDetails(data.id);
      
      this.showNotification('Flujo duplicado', 'success');
      window.router?.navigate(`/dev/builder?id=${data.id}`);
      
    } catch (err) {
      console.error('Error duplicating flow:', err);
      this.showNotification('Error al duplicar el flujo', 'error');
    }
  }

  exportFlow() {
    const exportData = {
      name: this.flowData.name,
      description: this.flowData.description,
      output_type: this.flowData.output_type,
      flow_category_type: this.flowData.flow_category_type,
      token_cost: this.flowData.token_cost,
      version: this.flowData.version,
      input_schema: { fields: this.inputSchema },
      ui_layout_config: this.uiLayoutConfig,
      technical: {
        webhook_method: this.technicalDetails.webhook_method,
        platform_name: this.technicalDetails.platform_name
      }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flow_${this.flowData.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showNotification('Flujo exportado', 'success');
  }

  showJsonSchemaModal() {
    const modal = this.querySelector('#jsonSchemaModal');
    const codeEl = this.querySelector('#jsonSchemaModalCode');
    if (!modal || !codeEl) return;
    const schema = { fields: this.inputSchema };
    codeEl.textContent = JSON.stringify(schema, null, 2);
    modal.style.display = 'flex';
  }

  copySchema() {
    const schema = JSON.stringify({ fields: this.inputSchema }, null, 2);
    navigator.clipboard.writeText(schema).then(() => {
      this.showNotification('Schema copiado al portapapeles', 'success');
    }).catch(() => {
      this.showNotification('Error al copiar', 'error');
    });
  }

  showPreview() {
    const modal = this.querySelector('#previewModal');
    const container = this.querySelector('#previewContainer');
    
    if (!modal || !container) return;
    
    // Generar preview del formulario
    container.innerHTML = this.generateFormPreview();
    modal.style.display = 'flex';
  }

  generateFormPreview() {
    if (this.inputSchema.length === 0) {
      return `
        <div class="preview-empty">
          <i class="ph ph-warning"></i>
          <p>No hay campos definidos</p>
        </div>
      `;
    }
    const columns = this.uiLayoutConfig.columns || 1;
    const showLabels = this.uiLayoutConfig.showLabels !== false;
    const showHelperText = this.uiLayoutConfig.showHelperText !== false;
    const Registry = window.InputRegistry;
    const fieldsHtml = this.inputSchema.map(field => {
      const widthClass = field.ui?.width === 'half' ? 'col-half' : field.ui?.width === 'third' ? 'col-third' : 'col-full';
      if (Registry && Registry.renderFormFieldWithWrapper) {
        return Registry.renderFormFieldWithWrapper(field, {
          idPrefix: 'preview_',
          wrapperClass: 'preview-field ' + widthClass,
          showLabel: showLabels,
          showHelper: showHelperText,
          showRequired: true,
          required: field.required,
          disabled: false,
          helperClass: 'helper-text'
        });
      }
      const ph = (field.placeholder || '').replace(/"/g, '&quot;');
      return `<div class="preview-field ${widthClass}"><label>${field.label || field.key}</label><input type="text" name="${field.key || 'field'}" placeholder="${ph}"></div>`;
    }).join('');
    const submitPosition = this.uiLayoutConfig.submitButtonPosition || 'right';
    const submitText = this.uiLayoutConfig.submitButtonText || 'Generar';
    return `
      <div class="preview-form theme-${this.uiLayoutConfig.theme || 'default'}" style="--preview-columns: ${columns}">
        <div class="preview-fields">
          ${fieldsHtml}
        </div>
        <div class="preview-actions position-${submitPosition}">
          <button class="btn-primary preview-submit">
            <i class="ph ph-sparkle"></i>
            ${submitText}
          </button>
        </div>
      </div>
    `;
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
    return this.inputSchema.filter(f => (f.input_type || f.type) !== 'section' && (f.input_type || f.type) !== 'divider' && (f.input_type || f.type) !== 'description_block').map(field => {
      const id = 'test_' + (field.key || 'field');
      return `<div class="test-field"><label for="${id}">${field.label || field.key}${field.required ? ' <span class="required">*</span>' : ''}</label><input type="text" id="${id}" name="${field.key}" ${field.required ? 'required' : ''}>${field.description ? `<span class="field-help">${field.description}</span>` : ''}</div>`;
    }).join('');
  }

  async runTest() {
    const container = this.querySelector('#testFormContainer');
    const results = this.querySelector('#testResults');
    const output = this.querySelector('#testResultOutput');
    const runBtn = this.querySelector('#runTestBtn');
    
    if (!container) return;
    
    // Collect form data
    const formData = {};
    this.inputSchema.forEach(field => {
      const input = container.querySelector(`[name="${field.key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          formData[field.key] = input.checked;
        } else if (input.type === 'radio') {
          const checked = container.querySelector(`[name="${field.key}"]:checked`);
          formData[field.key] = checked ? checked.value : null;
        } else {
          formData[field.key] = input.value;
        }
      }
    });
    
    // Validate required fields
    for (const field of this.inputSchema) {
      if (field.required && !formData[field.key]) {
        this.showNotification(`El campo "${field.label}" es requerido`, 'warning');
        return;
      }
    }
    
    const webhookUrl = this.technicalDetails.webhook_url_test || this.technicalDetails.webhook_url_prod;
    
    if (!webhookUrl) {
      this.showNotification('No hay webhook configurado', 'error');
      return;
    }
    
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Ejecutando...';
    }
    
    try {
      const response = await fetch(webhookUrl, {
        method: this.technicalDetails.webhook_method || 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: formData,
          test_mode: true,
          flow_id: this.flowId,
          timestamp: new Date().toISOString()
        })
      });
      
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      
      if (results && output) {
        results.style.display = 'block';
        output.textContent = JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          data: responseData
        }, null, 2);
      }
      
      if (response.ok) {
        this.showNotification('Prueba ejecutada exitosamente', 'success');
      } else {
        this.showNotification(`Error: ${response.status} ${response.statusText}`, 'error');
      }
      
    } catch (err) {
      console.error('Test error:', err);
      
      if (results && output) {
        results.style.display = 'block';
        output.textContent = JSON.stringify({
          error: err.message,
          type: 'network_error'
        }, null, 2);
      }
      
      this.showNotification('Error de conexión', 'error');
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '<i class="ph ph-play"></i> Ejecutar';
      }
    }
  }

  showDeleteModal() {
    const modal = this.querySelector('#deleteModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  async confirmDelete() {
    if (!this.flowId || !this.supabase) {
      this.querySelector('#deleteModal').style.display = 'none';
      return;
    }
    
    try {
      const { data: modules } = await this.supabase
        .from('flow_modules')
        .select('id')
        .eq('content_flow_id', this.flowId);
      if (modules?.length) {
        for (const m of modules) {
          await this.supabase.from('flow_technical_details').delete().eq('flow_module_id', m.id);
        }
        await this.supabase.from('flow_modules').delete().eq('content_flow_id', this.flowId);
      }
      const { error } = await this.supabase
        .from('content_flows')
        .delete()
        .eq('id', this.flowId);
      
      if (error) throw error;
      
      this.showNotification('Flujo eliminado', 'success');
      window.router?.navigate('/dev/flows');
      
    } catch (err) {
      console.error('Error deleting flow:', err);
      this.showNotification('Error al eliminar el flujo', 'error');
      this.querySelector('#deleteModal').style.display = 'none';
    }
  }

  handleBack() {
    if (this.hasUnsavedChanges) {
      if (confirm('Tienes cambios sin guardar. ¿Deseas salir?')) {
        window.router?.navigate('/dev/flows');
      }
    } else {
      window.router?.navigate('/dev/flows');
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
