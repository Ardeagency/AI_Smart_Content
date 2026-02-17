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
    
    // Categorías disponibles
    this.categories = [];
    
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
                    <input type="url" id="techDetailsEditorUrl" placeholder="https://tu-n8n.com/workflow/123">
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

  /**
   * Normaliza una plantilla (de BD o fallback) para que tenga forma consistente y base_schema
   * con input_type/type correctos (canvas y propiedades usan esto).
   */
  normalizeComponentTemplate(row) {
    const base = { ...row };
    const schema = base.base_schema && typeof base.base_schema === 'object' ? { ...base.base_schema } : {};
    const nameKey = (base.name || '').toLowerCase().replace(/\s+/g, '_');
    // Asegurar input_type y type desde base_schema o inferir desde name (evitar que "dropdown" quede como text)
    const inferredType = nameKey === 'dropdown' ? 'dropdown' : (schema.input_type || schema.type || nameKey || 'text');
    schema.input_type = schema.input_type || schema.type || inferredType;
    schema.type = schema.type || schema.input_type;
    if ((schema.input_type === 'dropdown' || schema.input_type === 'select') && !Array.isArray(schema.options)) {
      schema.options = schema.options || [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }];
    }
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
      { id: 'text', name: 'Texto Corto', description: 'Campo de texto', category: 'basic', icon_name: 'textbox', base_schema: { input_type: 'text', placeholder: '', maxLength: 255 } },
      { id: 'textarea', name: 'Texto Largo', description: 'Área de texto', category: 'basic', icon_name: 'article', base_schema: { input_type: 'textarea', placeholder: '', rows: 4 } },
      { id: 'select', name: 'Selector', description: 'Lista desplegable', category: 'basic', icon_name: 'list-bullets', base_schema: { input_type: 'select', options: [] } },
      { id: 'dropdown', name: 'Dropdown', description: 'Menú desplegable', category: 'basic', icon_name: 'caret-down', base_schema: { input_type: 'dropdown', options: [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }] } },
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

  addField(templateId, templateDataFromDrag) {
    const template = this.componentTemplates.find(t => String(t.id) === String(templateId));
    // Usar siempre el template actual (BD o fallback): base_schema y default_ui_config son la fuente de verdad
    const baseSchema = template?.base_schema && typeof template.base_schema === 'object'
      ? { ...template.base_schema }
      : (templateDataFromDrag && typeof templateDataFromDrag === 'object' ? { ...templateDataFromDrag } : {});
    const defaultUi = template?.default_ui_config && typeof template.default_ui_config === 'object' ? { ...template.default_ui_config } : {};
    const fieldName = this.generateFieldKey(template?.name || templateId);
    
    const newField = {
      key: fieldName,
      label: template?.name || 'Campo',
      required: Boolean(baseSchema.required),
      placeholder: baseSchema.placeholder ?? '',
      description: baseSchema.description ?? '',
      ...baseSchema,
      input_type: baseSchema.input_type || baseSchema.type || 'text',
      ui: {
        width: 'full',
        hidden: false,
        ...defaultUi,
        width: defaultUi.width != null ? defaultUi.width : 'full',
        hidden: defaultUi.hidden != null ? defaultUi.hidden : false
      }
    };
    
    this.inputSchema.push(newField);
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    this.updateJsonPreview();
    
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
    this.enableCanvasPreviewInputs(canvas);
    this.setupCanvasFieldListeners();
  }

  /** Habilita interacción en los controles del canvas (escribir en string, elegir en dropdown, etc.) */
  enableCanvasPreviewInputs(container) {
    if (!container) return;
    container.querySelectorAll('.canvas-field-preview input, .canvas-field-preview select, .canvas-field-preview textarea').forEach(el => {
      el.removeAttribute('disabled');
      el.style.cursor = el.tagName === 'SELECT' ? 'pointer' : 'text';
    });
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
    const type = (field.input_type || field.type || 'text').toLowerCase();
    if (type === 'dropdown' || type === 'select' || type === 'multi_select') {
      const opts = field.options || [];
      const ph = (field.placeholder || 'Seleccionar...').replace(/"/g, '&quot;');
      const options = opts.map(o => {
        const label = o && (o.label !== undefined ? o.label : o.value !== undefined ? o.value : o);
        return `<option>${(label != null ? String(label) : '').replace(/</g, '&lt;')}</option>`;
      }).join('');
      return `<div class="input-dropdown-wrap"><select class="preview-input input-dropdown-select" disabled><option value="">${ph}</option>${options}</select></div>`;
    }
    const placeholder = (field.placeholder || '').replace(/"/g, '&quot;');
    return `<input type="text" class="preview-input" placeholder="${placeholder}" disabled>`;
  }

  setupCanvasFieldListeners() {
    const fields = this.querySelectorAll('.canvas-field');
    
    fields.forEach((field, index) => {
      // Evitar que el clic en el preview (inputs/select) propague y quite foco; solo seleccionar si se clic en header
      const preview = field.querySelector('.canvas-field-preview');
      if (preview) {
        preview.addEventListener('click', (e) => e.stopPropagation());
      }
      // Click en el campo (header, bordes) para seleccionar
      field.addEventListener('click', (e) => {
        if (!e.target.closest('.field-action-btn') && !e.target.closest('.canvas-field-remove') && !e.target.closest('.canvas-field-preview')) {
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
      
      // Sincronizar cambios en el preview (slider, texto, dropdown, etc.) con el campo para que el valor "quede"
      const schemaField = this.inputSchema[index];
      if (schemaField && preview) {
        const sync = () => { this.onFieldChange(); if (this.selectedFieldIndex === index) this.renderPropertiesPanel(); };
        preview.querySelectorAll('input, select, textarea').forEach((el) => {
          const tag = el.tagName.toLowerCase();
          const type = (el.type || '').toLowerCase();
          if (type === 'range') {
            el.addEventListener('input', () => {
              schemaField.defaultValue = parseFloat(el.value);
              const span = el.nextElementSibling || preview.querySelector('.range-value');
              if (span) span.textContent = el.value;
              sync();
            });
          } else if (type === 'number') {
            el.addEventListener('input', () => {
              const n = parseFloat(el.value);
              schemaField.defaultValue = isNaN(n) ? undefined : n;
              sync();
            });
          } else if (type === 'checkbox') {
            el.addEventListener('change', () => {
              schemaField.defaultValue = el.checked;
              sync();
            });
          } else if (tag === 'select') {
            el.addEventListener('change', () => {
              schemaField.defaultValue = el.value === '' ? undefined : el.value;
              sync();
            });
          } else {
            el.addEventListener('input', () => {
              schemaField.defaultValue = el.value;
              sync();
            });
          }
        });
      }
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
            <label for="propKey">Key</label>
            <input type="text" id="propKey" value="${field.key}" pattern="[a-z0-9_]+">
          </div>
          
          <div class="property-field">
            <label for="propLabel">Label</label>
            <input type="text" id="propLabel" value="${(field.label || '').replace(/"/g, '&quot;')}">
          </div>
          
          <div class="property-field">
            <label for="propInputType">Tipo de control</label>
            <select id="propInputType">
              <option value="text" ${(field.input_type || field.type || 'text') === 'text' ? 'selected' : ''}>Texto corto</option>
              <option value="textarea" ${(field.input_type || field.type) === 'textarea' ? 'selected' : ''}>Texto largo</option>
              <option value="dropdown" ${(field.input_type || field.type) === 'dropdown' ? 'selected' : ''}>Dropdown</option>
              <option value="select" ${(field.input_type || field.type) === 'select' ? 'selected' : ''}>Selector (select)</option>
              <option value="number" ${(field.input_type || field.type) === 'number' ? 'selected' : ''}>Número</option>
              <option value="checkbox" ${(field.input_type || field.type) === 'checkbox' ? 'selected' : ''}>Checkbox</option>
              <option value="radio" ${(field.input_type || field.type) === 'radio' ? 'selected' : ''}>Radio</option>
              <option value="range" ${(field.input_type || field.type) === 'range' ? 'selected' : ''}>Slider</option>
            </select>
            <span class="field-help">Define si el campo es texto, dropdown, número, etc. Cambia el aspecto en el canvas y las opciones de abajo.</span>
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
        
      </div>
    `;
    
    this.setupPropertiesListeners();
    this.syncDefaultValueAndExtraConfigToDom(field, dataType);
  }

  inferDataType(field) {
    const t = (field.input_type || field.type || '').toLowerCase();
    if (['number', 'range', 'stepper', 'stepper_num', 'num_stepper', 'rating', 'slider'].indexOf(t) >= 0) return 'number';
    if (['checkbox', 'switch', 'boolean', 'toggle', 'toggle_switch'].indexOf(t) >= 0) return 'boolean';
    if (['select', 'multi_select', 'tone_selector', 'mood_selector', 'length_selector', 'radio'].indexOf(t) >= 0) return 'string';
    if (['tag_input', 'gallery_picker', 'selection_checkboxes'].indexOf(t) >= 0) return 'array';
    if (['brand_selector', 'entity_selector', 'audience_selector', 'campaign_selector', 'product_selector', 'image_selector'].indexOf(t) >= 0) return 'object';
    return field.data_type || 'string';
  }

  renderDefaultValueBlock(field, dataType) {
    const type = (field.input_type || field.type || '').toLowerCase();
    const isNumberFamily = ['number', 'range', 'stepper', 'stepper_num', 'num_stepper', 'rating', 'slider'].indexOf(type) >= 0;
    const isBooleanFamily = ['checkbox', 'switch', 'boolean', 'toggle', 'toggle_switch'].indexOf(type) >= 0;
    const hasOptions = ['dropdown', 'select', 'radio', 'tone_selector', 'mood_selector', 'length_selector'].indexOf(type) >= 0;
    const opts = field.options || [];
    const escapeVal = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
    const optVal = (o) => (o && (o.value !== undefined ? o.value : o.label !== undefined ? o.label : o));
    const optLabel = (o) => (o && (o.label !== undefined ? o.label : o.value !== undefined ? o.value : o));
    if (isNumberFamily) return '';
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
    if (hasOptions && opts.length > 0 && (dataType === 'string' || !dataType)) {
      const current = field.defaultValue != null ? String(field.defaultValue) : '';
      const optionsHtml = '<option value="">— Ninguno —</option>' + opts.map((o) => {
        const v = optVal(o) != null ? String(optVal(o)) : '';
        const lbl = optLabel(o) != null ? String(optLabel(o)) : v;
        return `<option value="${escapeVal(v)}" ${current === v ? 'selected' : ''}>${escapeVal(lbl)}</option>`;
      }).join('');
      return `
        <div class="property-field">
          <label for="propDefaultValueSelect">Valor por defecto</label>
          <select id="propDefaultValueSelect">${optionsHtml}</select>
        </div>
      `;
    }
    if (dataType === 'array') {
      return `
        <div class="property-field">
          <label for="propDefaultValueJson">Valor por defecto (array)</label>
          <textarea id="propDefaultValueJson" class="property-json-editor" rows="3" placeholder='["item1", "item2"]'></textarea>
        </div>
      `;
    }
    if (dataType === 'object') {
      return `
        <div class="property-field">
          <label for="propDefaultValueJson">Valor por defecto (objeto)</label>
          <textarea id="propDefaultValueJson" class="property-json-editor" rows="3" placeholder='{ "id": "", "name": "" }'></textarea>
        </div>
      `;
    }
    const strVal = (typeof field.defaultValue === 'string') ? field.defaultValue : '';
    return `
      <div class="property-field">
        <label for="propDefaultValueStr">Valor por defecto</label>
        <input type="text" id="propDefaultValueStr" value="${escapeVal(strVal)}">
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
    const defaultValueSelectEl = this.querySelector('#propDefaultValueSelect');
    if (defaultValueSelectEl) {
      const v = field.defaultValue != null ? String(field.defaultValue) : '';
      defaultValueSelectEl.value = v;
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
    const type = (field.input_type || field.type || 'text').toLowerCase();
    let family = (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.getPropertyFamily)
      ? window.InputRegistry.getPropertyFamily(type) : type;
    if (type === 'dropdown' || type === 'select' || type === 'multi_select') family = 'select';
    const escapeProp = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
    switch (family) {
      case 'text':
      case 'textarea': {
        const it = (field.input_type || field.type || 'text').toLowerCase();
        const isLong = it === 'textarea' || it === 'prompt_input' || it === 'prompt_system';
        const currentStringType = field.html_type === 'url' ? 'website' : (it === 'prompt_input' ? 'prompt' : (it === 'prompt_system' ? 'system_prompt' : (it === 'textarea' ? 'textarea' : 'text')));
        return `
          <div class="property-group">
            <h4>Texto / String</h4>
            <div class="property-field">
              <label for="propStringMode">Modo de texto</label>
              <select id="propStringMode">
                <option value="short" ${!isLong ? 'selected' : ''}>Texto corto</option>
                <option value="long" ${isLong ? 'selected' : ''}>Texto largo</option>
              </select>
            </div>
            <div class="property-field">
              <label for="propStringDataType">Tipo de texto</label>
              <select id="propStringDataType">
                <option value="text" ${currentStringType === 'text' ? 'selected' : ''}>Texto</option>
                <option value="textarea" ${currentStringType === 'textarea' ? 'selected' : ''}>Textarea</option>
                <option value="website" ${currentStringType === 'website' ? 'selected' : ''}>Website</option>
                <option value="prompt" ${currentStringType === 'prompt' ? 'selected' : ''}>Prompt</option>
                <option value="system_prompt" ${currentStringType === 'system_prompt' ? 'selected' : ''}>System prompt</option>
              </select>
              <span class="field-help">Website = URL; Prompt = entrada para IA; System prompt = prompt de sistema.</span>
            </div>
            <div class="property-field">
              <label for="propMaxLength">Límite de caracteres</label>
              <input type="number" id="propMaxLength" value="${field.maxLength != null ? field.maxLength : ''}" min="1" placeholder="Sin límite">
              <span class="field-help">Opcional. Dejar vacío para sin límite.</span>
            </div>
            ${isLong ? `
              <div class="property-field">
                <label for="propRows">Filas</label>
                <input type="number" id="propRows" value="${field.rows != null ? field.rows : 4}" min="2" max="20">
              </div>
            ` : ''}
          </div>
        `;
      }
      
      case 'number':
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

      case 'stepper':
        return `
          <div class="property-group">
            <h4>Num Stepper</h4>
            <div class="property-row">
              <div class="property-field">
                <label for="propStepperMin">Mínimo</label>
                <input type="number" id="propStepperMin" value="${field.min ?? 0}">
              </div>
              <div class="property-field">
                <label for="propStepperMax">Máximo</label>
                <input type="number" id="propStepperMax" value="${field.max ?? 999}">
              </div>
            </div>
            <div class="property-row">
              <div class="property-field">
                <label for="propStepperStep">Incremento</label>
                <input type="number" id="propStepperStep" value="${field.step ?? 1}" min="0.01">
              </div>
              <div class="property-field">
                <label for="propStepperDefault">Valor inicial</label>
                <input type="number" id="propStepperDefault" value="${field.defaultValue ?? 0}">
              </div>
            </div>
            <div class="property-field">
              <label for="propStepperUnit">Unidad (opcional)</label>
              <input type="text" id="propStepperUnit" value="${escapeProp(field.unit || '')}" placeholder="ej. px, %, kg">
              <span class="field-help">Sufijo mostrado junto al valor (px, %, etc.).</span>
            </div>
          </div>
        `;

      case 'checkbox':
        const checkboxChecked = field.defaultValue === true || field.defaultValue === 'true';
        return `
          <div class="property-group">
            <h4>Checkbox</h4>
            <div class="property-toggle">
              <label>
                <input type="checkbox" id="propCheckboxDefault" ${checkboxChecked ? 'checked' : ''}>
                <span>Marcado por defecto</span>
              </label>
            </div>
          </div>
        `;

      case 'switch':
        const switchChecked = field.defaultValue === true || field.defaultValue === 'true';
        return `
          <div class="property-group">
            <h4>Toggle / Switch</h4>
            <div class="property-toggle">
              <label>
                <input type="checkbox" id="propSwitchDefault" ${switchChecked ? 'checked' : ''}>
                <span>Activado por defecto (on)</span>
              </label>
            </div>
            <span class="field-help">Estado inicial del interruptor.</span>
          </div>
        `;

      case 'range': {
        const sliderMode = field.slider_mode || field.sliderMode || 'num';
        const isDouble = field.is_double_slider || field.isDoubleSlider || false;
        const valueStart = field.value_start ?? field.min ?? 0;
        const valueEnd = field.value_end ?? field.max ?? 100;
        return `
          <div class="property-group">
            <h4>Sliders</h4>
            <div class="property-field">
              <label for="propSliderMode">Tipo de valor</label>
              <select id="propSliderMode">
                <option value="num" ${sliderMode === 'num' ? 'selected' : ''}>Numérico</option>
                <option value="string" ${sliderMode === 'string' ? 'selected' : ''}>String (etiquetas por opción)</option>
              </select>
            </div>
            <div class="property-toggle" style="margin-bottom: 12px;">
              <label>
                <input type="checkbox" id="propDoubleSlider" ${isDouble ? 'checked' : ''}>
                <span>Double slider (rango entre dos valores)</span>
              </label>
            </div>
            ${sliderMode === 'num' ? `
            <div class="property-row">
              <div class="property-field">
                <label for="propSliderMin">Mínimo</label>
                <input type="number" id="propSliderMin" value="${field.min ?? 0}">
              </div>
              <div class="property-field">
                <label for="propSliderMax">Máximo</label>
                <input type="number" id="propSliderMax" value="${field.max ?? 100}">
              </div>
            </div>
            <div class="property-row">
              <div class="property-field">
                <label for="propSliderStep">Paso</label>
                <input type="number" id="propSliderStep" value="${field.step ?? 1}" min="0.01">
              </div>
              ${!isDouble ? `
              <div class="property-field">
                <label for="propSliderDefault">Valor por defecto</label>
                <input type="number" id="propSliderDefault" value="${field.defaultValue ?? 50}">
              </div>
              ` : `
              <div class="property-field">
                <label for="propSliderValueStart">Valor inicio (rango)</label>
                <input type="number" id="propSliderValueStart" value="${valueStart}">
              </div>
              <div class="property-field">
                <label for="propSliderValueEnd">Valor fin (rango)</label>
                <input type="number" id="propSliderValueEnd" value="${valueEnd}">
              </div>
              `}
            </div>
            ` : `
            <div class="property-field">
              <label>Opciones (slider string)</label>
            </div>
            <div class="options-editor options-editor--dropdown" id="optionsEditorSlider">
              ${(field.options || []).length === 0 ? `
                <div class="option-row" data-index="0">
                  <input type="text" class="option-single" placeholder="ej. Bajo" data-index="0">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>
              ` : (field.options || []).map((opt, i) => {
                const v = opt && (opt.value !== undefined ? opt.value : opt.label !== undefined ? opt.label : opt);
                const str = (v != null ? String(v) : '');
                return `
                <div class="option-row" data-index="${i}">
                  <input type="text" class="option-single" placeholder="etiqueta" data-index="${i}" value="${escapeProp(str)}">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>
              `; }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtnSlider">
              <i class="ph ph-plus"></i> Opciones
            </button>
            `}
          </div>
        `;
      }
      
      case 'select':
      case 'radio': {
        const options = field.options || [];
        const it = (field.input_type || field.type || '').toLowerCase();
        const isSelect = it === 'select' || it === 'dropdown' || it === 'multi_select';
        const isDropdown = it === 'dropdown' || it === 'select';
        const isRadio = it === 'radio';
        const isSelectionCheckboxes = it === 'selection_checkboxes';
        const title = isSelectionCheckboxes ? 'Checkboxes (opciones)' : (isRadio ? 'Radio Buttons' : (isDropdown ? 'Dropdown' : 'Lista desplegable'));
        const optVal = (o) => (o && (o.value !== undefined ? o.value : o.label !== undefined ? o.label : o));
        return `
          <div class="property-group">
            <h4>${title}</h4>
            ${isSelect ? `
            <div class="property-toggle" style="margin-bottom: 12px;">
              <label>
                <input type="checkbox" id="propMultiselect" ${field.is_multiple ? 'checked' : ''}>
                <span>Multiselección</span>
              </label>
            </div>
            ` : ''}
            <div class="property-field">
              <label>Opciones</label>
            </div>
            <div class="options-editor options-editor--dropdown" id="optionsEditor">
              ${options.length === 0 ? `
                <div class="option-row" data-index="0">
                  <input type="text" class="option-single" placeholder="ej. rubia" data-index="0">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>
              ` : options.map((opt, i) => {
                const str = escapeProp(optVal(opt) != null ? String(optVal(opt)) : '');
                return `
                <div class="option-row" data-index="${i}">
                  <input type="text" class="option-single" placeholder="ej. rubia" data-index="${i}" value="${str}">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>
              `; }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtn">
              <i class="ph ph-plus"></i> Opciones
            </button>
          </div>
        `;
      }
      
      default: {
        const contextSelectorTypes = ['brand_selector', 'audience_selector', 'campaign_selector', 'product_selector', 'entity_selector'];
        const isContextSelector = contextSelectorTypes.indexOf(type) >= 0;
        const isMediaSelector = type === 'image_selector' || type === 'gallery_picker';
        let html = '';
        if (isContextSelector) {
          const currentContext = field.context_selector_type || type;
          html += `
            <div class="property-group">
              <h4>Selector de contexto</h4>
              <div class="property-field">
                <label for="propContextSelectorType">Qué selecciona</label>
                <select id="propContextSelectorType">
                  <option value="brand_selector" ${currentContext === 'brand_selector' ? 'selected' : ''}>Marca</option>
                  <option value="audience_selector" ${currentContext === 'audience_selector' ? 'selected' : ''}>Audiencia</option>
                  <option value="campaign_selector" ${currentContext === 'campaign_selector' ? 'selected' : ''}>Campaña</option>
                  <option value="product_selector" ${currentContext === 'product_selector' ? 'selected' : ''}>Producto</option>
                  <option value="entity_selector" ${currentContext === 'entity_selector' ? 'selected' : ''}>Entidad (producto/servicio/lugar)</option>
                </select>
              </div>
            </div>
          `;
        }
        if (type === 'entity_selector') {
          const entityTypes = field.entityTypes || ['product', 'service', 'place'];
          html += `
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
        if (isMediaSelector) {
          const mediaSources = [
            { value: 'products', label: 'Productos' },
            { value: 'entities', label: 'Entidades (producto/servicio/lugar)' },
            { value: 'visual_reference', label: 'Referencia visual' },
            { value: 'brand', label: 'Marca' },
            { value: 'audience', label: 'Audiencia' },
            { value: 'campaign', label: 'Campaña' },
            { value: 'other', label: 'Otro' }
          ];
          const currentMedia = field.media_source || 'other';
          html += `
            <div class="property-group">
              <h4>Selector de imagen / Carrusel</h4>
              <div class="property-field">
                <label for="propMediaSource">Función / Origen de imágenes</label>
                <select id="propMediaSource">
                  ${mediaSources.map(function (o) {
                    return '<option value="' + o.value + '"' + (currentMedia === o.value ? ' selected' : '') + '>' + escapeProp(o.label) + '</option>';
                  }).join('')}
                </select>
              </div>
            </div>
          `;
        }
        return html;
      }
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
    
    const inputTypeSelect = this.querySelector('#propInputType');
    if (inputTypeSelect) {
      inputTypeSelect.addEventListener('change', (e) => {
        const newType = e.target.value;
        field.input_type = newType;
        if (field.type !== undefined) field.type = newType;
        if (newType === 'dropdown' || newType === 'select') {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            field.options = [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }];
          }
        }
        if (newType === 'stepper_num' || newType === 'num_stepper') {
          if (field.min == null) field.min = 0;
          if (field.max == null) field.max = 999;
          if (field.step == null) field.step = 1;
          if (field.defaultValue == null) field.defaultValue = 0;
        }
        if (newType === 'selection_checkboxes') {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            field.options = [{ value: '1', label: 'Opción 1' }, { value: '2', label: 'Opción 2' }];
          }
          field.display_style = 'selection_checkboxes';
        }
        if (newType === 'range') {
          if (field.min == null) field.min = 0;
          if (field.max == null) field.max = 100;
          if (field.step == null) field.step = 1;
          if (field.defaultValue == null) field.defaultValue = 50;
        }
        if (newType === 'toggle_switch' || newType === 'switch') {
          field.display_style = 'switch';
          if (field.defaultValue == null) field.defaultValue = false;
        }
        this.renderPropertiesPanel();
        this.renderCanvas();
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
    const defaultValueSelect = this.querySelector('#propDefaultValueSelect');
    if (defaultValueSelect) {
      defaultValueSelect.addEventListener('change', (e) => {
        const v = e.target.value;
        field.defaultValue = v === '' ? undefined : v;
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
    
    // Type-specific properties
    this.setupTypeSpecificListeners(field);
  }

  setupTypeSpecificListeners(field) {
    // Text/Textarea: modo corto/largo, tipo de dato, límite, filas
    const stringModeSelect = this.querySelector('#propStringMode');
    const stringDataTypeSelect = this.querySelector('#propStringDataType');
    const maxLengthInput = this.querySelector('#propMaxLength');
    const rowsInput = this.querySelector('#propRows');
    
    if (stringModeSelect) {
      stringModeSelect.addEventListener('change', (e) => {
        const isLong = e.target.value === 'long';
        const tipo = stringDataTypeSelect ? stringDataTypeSelect.value : 'text';
        if (isLong) {
          if (tipo === 'prompt') field.input_type = 'prompt_input';
          else if (tipo === 'system_prompt') field.input_type = 'prompt_system';
          else field.input_type = 'textarea';
          if (field.rows == null) field.rows = 4;
        } else {
          if (tipo === 'website') {
            field.input_type = 'text';
            field.html_type = 'url';
          } else field.input_type = 'text';
          field.html_type = field.html_type === 'url' ? 'url' : undefined;
          delete field.rows;
        }
        this.renderCanvas();
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    
    if (stringDataTypeSelect) {
      stringDataTypeSelect.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === 'website') {
          field.input_type = 'text';
          field.html_type = 'url';
          field.rows = undefined;
        } else if (v === 'prompt') {
          field.input_type = 'prompt_input';
          field.html_type = undefined;
          if (field.rows == null) field.rows = 4;
        } else if (v === 'system_prompt') {
          field.input_type = 'prompt_system';
          field.html_type = undefined;
          if (field.rows == null) field.rows = 4;
        } else if (v === 'textarea') {
          field.input_type = 'textarea';
          field.html_type = undefined;
          if (field.rows == null) field.rows = 4;
        } else {
          field.input_type = 'text';
          field.html_type = undefined;
          field.rows = undefined;
        }
        this.renderCanvas();
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    
    if (maxLengthInput) {
      maxLengthInput.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        field.maxLength = val === '' ? undefined : parseInt(val, 10) || undefined;
        this.onFieldChange();
      });
    }
    
    if (rowsInput) {
      rowsInput.addEventListener('change', (e) => {
        field.rows = parseInt(e.target.value, 10) || 4;
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
    
    // Stepper (num_stepper / stepper_num)
    const propStepperMin = this.querySelector('#propStepperMin');
    const propStepperMax = this.querySelector('#propStepperMax');
    const propStepperStep = this.querySelector('#propStepperStep');
    const propStepperDefault = this.querySelector('#propStepperDefault');
    const propStepperUnit = this.querySelector('#propStepperUnit');
    if (propStepperMin) propStepperMin.addEventListener('change', (e) => { field.min = parseFloat(e.target.value) || 0; this.onFieldChange(); });
    if (propStepperMax) propStepperMax.addEventListener('change', (e) => { field.max = parseFloat(e.target.value) || 999; this.onFieldChange(); });
    if (propStepperStep) propStepperStep.addEventListener('change', (e) => { field.step = parseFloat(e.target.value) || 1; this.onFieldChange(); });
    if (propStepperDefault) propStepperDefault.addEventListener('change', (e) => { field.defaultValue = parseFloat(e.target.value) || 0; this.onFieldChange(); });
    if (propStepperUnit) propStepperUnit.addEventListener('input', (e) => { field.unit = e.target.value.trim() || undefined; this.onFieldChange(); });
    
    // Checkbox: valor por defecto
    const propCheckboxDefault = this.querySelector('#propCheckboxDefault');
    if (propCheckboxDefault) {
      propCheckboxDefault.addEventListener('change', (e) => {
        field.defaultValue = e.target.checked;
        this.onFieldChange();
      });
    }
    
    // Toggle / Switch: valor por defecto
    const propSwitchDefault = this.querySelector('#propSwitchDefault');
    if (propSwitchDefault) {
      propSwitchDefault.addEventListener('change', (e) => {
        field.defaultValue = e.target.checked;
        this.onFieldChange();
      });
    }
    
    // Sliders: modo, double, min, max, step, valor(es), opciones (string)
    const propSliderMode = this.querySelector('#propSliderMode');
    const propDoubleSlider = this.querySelector('#propDoubleSlider');
    const propSliderMin = this.querySelector('#propSliderMin');
    const propSliderMax = this.querySelector('#propSliderMax');
    const propSliderStep = this.querySelector('#propSliderStep');
    const propSliderDefault = this.querySelector('#propSliderDefault');
    const propSliderValueStart = this.querySelector('#propSliderValueStart');
    const propSliderValueEnd = this.querySelector('#propSliderValueEnd');
    if (propSliderMode) {
      propSliderMode.addEventListener('change', (e) => {
        field.slider_mode = e.target.value;
        if (e.target.value === 'string' && (!Array.isArray(field.options) || field.options.length === 0)) {
          field.options = [{ value: 'bajo', label: 'Bajo' }, { value: 'medio', label: 'Medio' }, { value: 'alto', label: 'Alto' }];
        }
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.onFieldChange();
      });
    }
    if (propDoubleSlider) {
      propDoubleSlider.addEventListener('change', (e) => {
        field.is_double_slider = e.target.checked;
        if (e.target.checked) {
          field.value_start = field.min ?? 0;
          field.value_end = field.max ?? 100;
        } else {
          delete field.value_start;
          delete field.value_end;
        }
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.onFieldChange();
      });
    }
    if (propSliderMin) propSliderMin.addEventListener('change', (e) => { field.min = parseFloat(e.target.value) || 0; this.onFieldChange(); });
    if (propSliderMax) propSliderMax.addEventListener('change', (e) => { field.max = parseFloat(e.target.value) || 100; this.onFieldChange(); });
    if (propSliderStep) propSliderStep.addEventListener('change', (e) => { field.step = parseFloat(e.target.value) || 1; this.onFieldChange(); });
    if (propSliderDefault) propSliderDefault.addEventListener('change', (e) => { field.defaultValue = parseFloat(e.target.value) ?? 50; this.onFieldChange(); });
    if (propSliderValueStart) propSliderValueStart.addEventListener('change', (e) => { field.value_start = parseFloat(e.target.value) ?? field.min; this.onFieldChange(); });
    if (propSliderValueEnd) propSliderValueEnd.addEventListener('change', (e) => { field.value_end = parseFloat(e.target.value) ?? field.max; this.onFieldChange(); });
    
    // Slider string: editor de opciones (mismo patrón que optionsEditor)
    const addOptionBtnSlider = this.querySelector('#addOptionBtnSlider');
    const optionsEditorSlider = this.querySelector('#optionsEditorSlider');
    if (addOptionBtnSlider) {
      addOptionBtnSlider.addEventListener('click', () => {
        if (!field.options) field.options = [];
        field.options.push({ value: '', label: '' });
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.renderCanvas();
        this.onFieldChange();
      });
    }
    if (optionsEditorSlider) {
      optionsEditorSlider.querySelectorAll('.option-row').forEach((row) => {
        const index = parseInt(row.getAttribute('data-index'), 10);
        const singleInput = row.querySelector('.option-single');
        const removeBtn = row.querySelector('.remove-option');
        if (singleInput) {
          singleInput.addEventListener('input', (e) => {
            const text = e.target.value;
            while (field.options.length <= index) field.options.push({ value: '', label: '' });
            field.options[index].value = text;
            field.options[index].label = text;
            this.renderCanvas();
            this.onFieldChange();
          });
        }
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            field.options.splice(index, 1);
            this.renderPropertiesPanel();
            this.setupTypeSpecificListeners(field);
            this.renderCanvas();
            this.onFieldChange();
          });
        }
      });
    }
    
    const multiselectCheckbox = this.querySelector('#propMultiselect');
    if (multiselectCheckbox) {
      multiselectCheckbox.addEventListener('change', (e) => {
        field.is_multiple = e.target.checked;
        this.onFieldChange();
      });
    }
    
    // Select/Dropdown/Radio: opciones (un input por opción o valor/etiqueta)
    const addOptionBtn = this.querySelector('#addOptionBtn');
    const optionsEditor = this.querySelector('#optionsEditor');
    
    if (addOptionBtn) {
      addOptionBtn.addEventListener('click', () => {
        if (!field.options) field.options = [];
        field.options.push({ value: '', label: '' });
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.renderCanvas();
        this.onFieldChange();
      });
    }
    
    if (optionsEditor) {
      optionsEditor.querySelectorAll('.option-row').forEach((row) => {
        const index = parseInt(row.getAttribute('data-index'), 10);
        const singleInput = row.querySelector('.option-single');
        const valueInput = row.querySelector('.option-value');
        const labelInput = row.querySelector('.option-label');
        const removeBtn = row.querySelector('.remove-option');
        
        if (singleInput) {
          singleInput.addEventListener('input', (e) => {
            const text = e.target.value;
            while (field.options.length <= index) field.options.push({ value: '', label: '' });
            field.options[index].value = text;
            field.options[index].label = text;
            this.renderCanvas();
            this.onFieldChange();
          });
        }
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
            this.setupTypeSpecificListeners(field);
            this.renderCanvas();
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
    
    const contextSelectorTypeSelect = this.querySelector('#propContextSelectorType');
    if (contextSelectorTypeSelect) {
      contextSelectorTypeSelect.addEventListener('change', (e) => {
        field.context_selector_type = e.target.value;
        this.onFieldChange();
      });
    }
    
    const mediaSourceSelect = this.querySelector('#propMediaSource');
    if (mediaSourceSelect) {
      mediaSourceSelect.addEventListener('change', (e) => {
        field.media_source = e.target.value;
        this.onFieldChange();
      });
    }
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
      
      // Grafo de ejecución: todos los módulos (flow_modules). flow_technical_details por flow_module_id.
      const { data: modulesList } = await this.supabase
        .from('flow_modules')
        .select('id, name, step_order, execution_type, webhook_url_test, webhook_url_prod, input_schema, output_schema, is_human_approval_required, next_module_id, routing_rules')
        .eq('content_flow_id', this.flowId)
        .order('step_order', { ascending: true });
      
      if (modulesList && modulesList.length > 0) {
        this.flowModules = modulesList.map(m => ({
          id: m.id,
          name: m.name || '',
          step_order: m.step_order,
          execution_type: m.execution_type || 'webhook',
          webhook_url_test: m.webhook_url_test || '',
          webhook_url_prod: m.webhook_url_prod || '',
          is_human_approval_required: !!m.is_human_approval_required,
          next_module_id: m.next_module_id || null,
          output_schema: m.output_schema ?? null,
          routing_rules: m.routing_rules ?? null
        }));
        this.currentFlowModuleId = this.flowModules[0].id;
        const first = modulesList[0];
        if (first.input_schema?.fields) {
          this.inputSchema = first.input_schema.fields;
        } else if (Array.isArray(first.input_schema)) {
          this.inputSchema = first.input_schema;
        }
        const moduleIds = modulesList.map(m => m.id);
        const { data: techDetailsList } = await this.supabase
          .from('flow_technical_details')
          .select('id, flow_module_id, platform_name, platform_flow_id, platform_flow_name, editor_url, credential_id, is_healthy, last_health_check, avg_execution_time_ms')
          .in('flow_module_id', moduleIds);
        this.flowTechnicalDetailsByModule = {};
        (techDetailsList || []).forEach(t => {
          this.flowTechnicalDetailsByModule[t.flow_module_id] = {
            id: t.id,
            platform_name: t.platform_name || 'n8n',
            platform_flow_id: t.platform_flow_id || '',
            platform_flow_name: t.platform_flow_name || '',
            editor_url: t.editor_url || '',
            credential_id: t.credential_id || '',
            is_healthy: t.is_healthy !== false,
            last_health_check: t.last_health_check,
            avg_execution_time_ms: t.avg_execution_time_ms != null ? t.avg_execution_time_ms : ''
          };
        });
        this.technicalDetails = {
          webhook_url_test: first.webhook_url_test || '',
          webhook_url_prod: first.webhook_url_prod || '',
          webhook_method: 'POST',
          platform_name: this.flowTechnicalDetailsByModule[first.id]?.platform_name || 'n8n',
          editor_url: this.flowTechnicalDetailsByModule[first.id]?.editor_url || ''
        };
      } else {
        this.flowModules = [{ name: 'Módulo 1', step_order: 1, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null, input_schema: null }];
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
    
    // Técnico: modo de ejecución y lista de módulos
    const executionMode = this.querySelector('#executionMode');
    if (executionMode) executionMode.value = this.flowData.execution_mode || 'single_step';
    this.renderTechnicalModulesList();
    
    this.setupTechnicalModulesListeners();
    
    // Render canvas
    this.renderCanvas();
    this.updateJsonPreview();
  }

  renderTechnicalModulesList() {
    const listEl = this.querySelector('#technicalModulesList');
    if (!listEl) return;
    const executionTypes = [
      { value: 'webhook', label: 'Webhook' },
      { value: 'python', label: 'Python' },
      { value: 'make', label: 'Make' },
      { value: 'internal', label: 'Internal' },
      { value: 'ai_direct', label: 'AI direct' },
      { value: 'aggregator', label: 'Aggregator' }
    ];
    const mods = this.flowModules.length ? this.flowModules : [{ name: 'Módulo 1', step_order: 1, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null, input_schema: null }];
    if (this.flowModules.length === 0) this.flowModules = mods;
    listEl.innerHTML = mods.map((m, i) => {
      const nextOpts = mods.filter((o, j) => j !== i && o.id).map(o => `<option value="${o.id}" ${m.next_module_id === o.id ? 'selected' : ''}>${this.escapeHtml(o.name || 'Módulo')}</option>`).join('');
      const outputSchemaStr = m.output_schema != null ? (typeof m.output_schema === 'string' ? m.output_schema : JSON.stringify(m.output_schema, null, 2)) : '';
      const routingRulesStr = m.routing_rules != null ? (typeof m.routing_rules === 'string' ? m.routing_rules : JSON.stringify(m.routing_rules, null, 2)) : '';
      return `
        <div class="technical-module-card" data-module-index="${i}">
          <div class="technical-module-header">
            <span class="technical-module-order">${i + 1}</span>
            <input type="text" class="technical-module-name" data-field="name" value="${this.escapeHtml(m.name || '')}" placeholder="Nombre del módulo">
            ${mods.length > 1 ? `<button type="button" class="btn-icon technical-module-remove" title="Quitar módulo"><i class="ph ph-trash"></i></button>` : ''}
          </div>
          <div class="technical-module-fields">
            <h5 class="technical-module-subtitle">Configuración técnica del módulo</h5>
            <div class="settings-row">
              <div class="settings-field">
                <label>Tipo ejecución</label>
                <select class="technical-module-execution" data-field="execution_type">
                  ${executionTypes.map(et => `<option value="${et.value}" ${(m.execution_type || 'webhook') === et.value ? 'selected' : ''}>${et.label}</option>`).join('')}
                </select>
              </div>
              <div class="settings-field">
                <label>URL Test</label>
                <input type="url" class="technical-module-webhook-test" data-field="webhook_url_test" value="${this.escapeHtml(m.webhook_url_test || '')}" placeholder="https://...">
              </div>
            </div>
            <div class="settings-field">
              <label>URL Producción</label>
              <input type="url" class="technical-module-webhook-prod" data-field="webhook_url_prod" value="${this.escapeHtml(m.webhook_url_prod || '')}" placeholder="https://...">
            </div>
            <div class="settings-row">
              <label class="technical-module-approval">
                <input type="checkbox" class="technical-module-human-approval" data-field="is_human_approval_required" ${m.is_human_approval_required ? 'checked' : ''}>
                <span>Requiere aprobación humana</span>
              </label>
            </div>
            <div class="settings-field">
              <label>Siguiente módulo</label>
              <select class="technical-module-next" data-field="next_module_id">
                <option value="">— Ninguno —</option>
                ${nextOpts}
              </select>
            </div>
            <div class="settings-field">
              <label>input_schema (JSON)</label>
              ${i === 0 ? '<p class="field-help"><i class="ph ph-info"></i> Definido en la pestaña Inputs.</p>' : `<textarea class="technical-module-input-schema property-json-editor" data-field="input_schema" rows="2" placeholder="{}">${this.escapeHtml((m.input_schema != null && typeof m.input_schema === 'object') ? JSON.stringify(m.input_schema, null, 2) : (m.input_schema && typeof m.input_schema === 'string' ? m.input_schema : ''))}</textarea>`}
            </div>
            <div class="settings-field">
              <label>output_schema (JSON)</label>
              <textarea class="technical-module-output-schema property-json-editor" data-field="output_schema" rows="2" placeholder="{}">${this.escapeHtml(outputSchemaStr)}</textarea>
            </div>
            <div class="settings-field">
              <label>routing_rules (JSON)</label>
              <textarea class="technical-module-routing-rules property-json-editor" data-field="routing_rules" rows="2" placeholder='{"conditions":[],"default":null}'>${this.escapeHtml(routingRulesStr)}</textarea>
            </div>
          </div>
          <div class="technical-module-footer">
            <button type="button" class="btn-icon btn-ghost technical-module-details-btn" data-module-index="${i}" title="Detalles técnicos de este módulo"><i class="ph ph-wrench"></i></button>
          </div>
        </div>
      `;
    }).join('');
  }

  setupTechnicalModulesListeners() {
    const executionMode = this.querySelector('#executionMode');
    if (executionMode) {
      executionMode.removeEventListener('change', this._boundExecutionModeChange);
      this._boundExecutionModeChange = () => {
        this.flowData.execution_mode = executionMode.value;
        this.onFieldChange();
      };
      executionMode.addEventListener('change', this._boundExecutionModeChange);
    }
    const addBtn = this.querySelector('#technicalAddModuleBtn');
    if (addBtn) {
      addBtn.onclick = () => {
        const nextOrder = this.flowModules.length + 1;
        this.flowModules.push({ name: 'Módulo ' + nextOrder, step_order: nextOrder, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null });
        this.renderTechnicalModulesList();
        this.setupTechnicalModulesListeners();
        this.onFieldChange();
      };
    }
    const listEl = this.querySelector('#technicalModulesList');
    if (listEl) {
      listEl.querySelectorAll('.technical-module-card').forEach(card => {
        const idx = parseInt(card.dataset.moduleIndex, 10);
        if (isNaN(idx)) return;
        card.querySelectorAll('[data-field]').forEach(el => {
          el.addEventListener('input', () => this.syncModuleField(idx, el.dataset.field, el.type === 'checkbox' ? el.checked : el.value));
          el.addEventListener('change', () => this.syncModuleField(idx, el.dataset.field, el.type === 'checkbox' ? el.checked : el.value));
        });
        const removeBtn = card.querySelector('.technical-module-remove');
        if (removeBtn) {
          removeBtn.onclick = () => {
            this.flowModules.splice(idx, 1);
            this.flowModules.forEach((m, i) => { m.step_order = i + 1; });
            this.renderTechnicalModulesList();
            this.setupTechnicalModulesListeners();
            if (this.flowModules[0]) {
              this.technicalDetails.webhook_url_test = this.flowModules[0].webhook_url_test;
              this.technicalDetails.webhook_url_prod = this.flowModules[0].webhook_url_prod;
            }
            this.onFieldChange();
          };
        }
        const detailsBtn = card.querySelector('.technical-module-details-btn');
        if (detailsBtn) {
          detailsBtn.onclick = () => {
            const mod = this.flowModules[idx];
            const key = mod?.id || `idx_${idx}`;
            this.openTechnicalDetailsPanel(key);
          };
        }
      });
    }
    this.setupTechnicalDetailsPanel();
  }

  setupTechnicalDetailsPanel() {
    const panel = this.querySelector('#technicalDetailsPanel');
    const openBtn = this.querySelector('#technicalDetailsPanelBtn');
    const closeBtn = this.querySelector('#technicalDetailsPanelClose');
    const moduleSelect = this.querySelector('#techDetailsModuleSelect');
    const formWrap = this.querySelector('#techDetailsFormWrap');
    if (!panel) return;
    if (openBtn) {
      openBtn.onclick = () => {
        this.fillTechDetailsModuleSelect();
        panel.classList.add('is-open');
        if (!this.technicalDetailsPanelModuleKey && this.flowModules.length > 0) {
          const first = this.flowModules[0];
          this.technicalDetailsPanelModuleKey = first.id || 'idx_0';
          if (moduleSelect) moduleSelect.value = this.technicalDetailsPanelModuleKey;
          this.fillTechDetailsForm(this.technicalDetailsPanelModuleKey);
        }
        if (formWrap) formWrap.style.display = this.technicalDetailsPanelModuleKey ? '' : 'none';
      };
    }
    if (closeBtn) closeBtn.onclick = () => this.closeTechnicalDetailsPanel();
    if (moduleSelect) {
      moduleSelect.onchange = () => {
        const key = moduleSelect.value || null;
        this.syncTechDetailsFromForm();
        this.technicalDetailsPanelModuleKey = key;
        if (key) {
          this.fillTechDetailsForm(key);
          if (formWrap) formWrap.style.display = '';
        } else {
          if (formWrap) formWrap.style.display = 'none';
        }
      };
    }
    const fieldIds = ['techDetailsPlatformName', 'techDetailsPlatformFlowId', 'techDetailsPlatformFlowName', 'techDetailsEditorUrl', 'techDetailsCredentialId', 'techDetailsIsHealthy', 'techDetailsAvgExecutionTimeMs'];
    fieldIds.forEach(id => {
      const el = this.querySelector(`#${id}`);
      if (el) {
        el.addEventListener('input', () => this.syncTechDetailsFromForm());
        el.addEventListener('change', () => this.syncTechDetailsFromForm());
      }
    });
  }

  openTechnicalDetailsPanel(moduleKey) {
    const panel = this.querySelector('#technicalDetailsPanel');
    if (!panel) return;
    this.fillTechDetailsModuleSelect();
    this.technicalDetailsPanelModuleKey = moduleKey;
    const moduleSelect = this.querySelector('#techDetailsModuleSelect');
    if (moduleSelect) moduleSelect.value = moduleKey || '';
    this.fillTechDetailsForm(moduleKey);
    const formWrap = this.querySelector('#techDetailsFormWrap');
    if (formWrap) formWrap.style.display = moduleKey ? '' : 'none';
    panel.classList.add('is-open');
  }

  closeTechnicalDetailsPanel() {
    const panel = this.querySelector('#technicalDetailsPanel');
    if (panel) panel.classList.remove('is-open');
    this.syncTechDetailsFromForm();
  }

  fillTechDetailsModuleSelect() {
    const sel = this.querySelector('#techDetailsModuleSelect');
    if (!sel) return;
    const opts = this.flowModules.map((m, i) => ({
      value: m.id || `idx_${i}`,
      label: m.name || 'Módulo ' + (i + 1)
    }));
    sel.innerHTML = '<option value="">— Seleccionar módulo —</option>' + opts.map(o => `<option value="${this.escapeHtml(o.value)}">${this.escapeHtml(o.label)}</option>`).join('');
    if (this.technicalDetailsPanelModuleKey) sel.value = this.technicalDetailsPanelModuleKey;
  }

  getTechDetailsDefault() {
    return {
      platform_name: 'n8n',
      platform_flow_id: '',
      platform_flow_name: '',
      editor_url: '',
      credential_id: '',
      is_healthy: true,
      last_health_check: null,
      avg_execution_time_ms: ''
    };
  }

  fillTechDetailsForm(moduleKey) {
    if (!moduleKey) return;
    if (!this.flowTechnicalDetailsByModule[moduleKey]) {
      this.flowTechnicalDetailsByModule[moduleKey] = { ...this.getTechDetailsDefault() };
    }
    const t = this.flowTechnicalDetailsByModule[moduleKey];
    const set = (id, value) => { const el = this.querySelector(`#${id}`); if (el) el.value = value ?? ''; };
    const setCheck = (id, value) => { const el = this.querySelector(`#${id}`); if (el) el.checked = !!value; };
    set('techDetailsPlatformName', t.platform_name);
    set('techDetailsPlatformFlowId', t.platform_flow_id);
    set('techDetailsPlatformFlowName', t.platform_flow_name);
    set('techDetailsEditorUrl', t.editor_url);
    set('techDetailsCredentialId', t.credential_id);
    setCheck('techDetailsIsHealthy', t.is_healthy);
    set('techDetailsAvgExecutionTimeMs', t.avg_execution_time_ms === '' || t.avg_execution_time_ms == null ? '' : t.avg_execution_time_ms);
    const lastCheck = this.querySelector('#techDetailsLastHealthCheck');
    if (lastCheck) lastCheck.value = t.last_health_check ? new Date(t.last_health_check).toLocaleString() : '—';
  }

  syncTechDetailsFromForm() {
    if (!this.technicalDetailsPanelModuleKey) return;
    if (!this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey]) {
      this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey] = this.getTechDetailsDefault();
    }
    const t = this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey];
    const get = (id) => { const el = this.querySelector(`#${id}`); return el ? el.value : ''; };
    const getCheck = (id) => { const el = this.querySelector(`#${id}`); return el ? el.checked : false; };
    t.platform_name = get('techDetailsPlatformName') || 'n8n';
    t.platform_flow_id = get('techDetailsPlatformFlowId') || '';
    t.platform_flow_name = get('techDetailsPlatformFlowName') || '';
    t.editor_url = get('techDetailsEditorUrl') || '';
    t.credential_id = get('techDetailsCredentialId') || '';
    t.is_healthy = getCheck('techDetailsIsHealthy');
    const avg = get('techDetailsAvgExecutionTimeMs');
    t.avg_execution_time_ms = avg === '' ? '' : parseInt(avg, 10);
    const firstKey = this.flowModules[0]?.id || 'idx_0';
    if (this.technicalDetailsPanelModuleKey === firstKey) {
      this.technicalDetails.platform_name = t.platform_name || 'n8n';
      this.technicalDetails.editor_url = t.editor_url || '';
    }
    this.onFieldChange();
  }

  syncModuleField(index, field, value) {
    if (!this.flowModules[index]) return;
    if (field === 'is_human_approval_required') this.flowModules[index][field] = !!value;
    else if (field === 'next_module_id') this.flowModules[index][field] = value || null;
    else if (field === 'output_schema' || field === 'routing_rules' || field === 'input_schema') {
      const str = (value || '').trim();
      if (!str) this.flowModules[index][field] = (field === 'input_schema' && index === 0) ? this.flowModules[index][field] : null;
      else {
        try {
          this.flowModules[index][field] = JSON.parse(str);
        } catch (_) {
          this.flowModules[index][field] = value;
        }
      }
    } else this.flowModules[index][field] = value;
    if (index === 0) {
      this.technicalDetails.webhook_url_test = this.flowModules[0].webhook_url_test;
      this.technicalDetails.webhook_url_prod = this.flowModules[0].webhook_url_prod;
    }
    this.onFieldChange();
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

  /**
   * Guarda el grafo de ejecución: flow_modules (módulos) y flow_technical_details por flow_module_id.
   * content_flows.execution_mode ya se guarda en saveFlow().
   */
  async saveTechnicalDetails(flowId) {
    if (!this.supabase || !flowId) return;
    
    const mods = this.flowModules.length ? this.flowModules : [{ name: 'Módulo 1', step_order: 1, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null, input_schema: null }];
    if (mods.length !== this.flowModules.length) this.flowModules = mods;
    
    const keepIds = mods.map(m => m.id).filter(Boolean);
    if (keepIds.length > 0) {
      const { data: existing } = await this.supabase.from('flow_modules').select('id').eq('content_flow_id', flowId);
      const toDelete = (existing || []).filter(r => !keepIds.includes(r.id)).map(r => r.id);
      for (const id of toDelete) {
        await this.supabase.from('flow_technical_details').delete().eq('flow_module_id', id);
        await this.supabase.from('flow_modules').delete().eq('id', id);
      }
    } else {
      const { data: existingMods } = await this.supabase.from('flow_modules').select('id').eq('content_flow_id', flowId);
      for (const row of existingMods || []) {
        await this.supabase.from('flow_technical_details').delete().eq('flow_module_id', row.id);
      }
      await this.supabase.from('flow_modules').delete().eq('content_flow_id', flowId);
    }
    
    // 1) Insertar módulos nuevos para obtener ids
    for (let i = 0; i < mods.length; i++) {
      if (mods[i].id) continue;
      const { data: inserted, error: insertErr } = await this.supabase
        .from('flow_modules')
        .insert({
          content_flow_id: flowId,
          name: mods[i].name || 'Módulo ' + (i + 1),
          step_order: i + 1,
          execution_type: mods[i].execution_type || 'webhook',
          webhook_url_test: mods[i].webhook_url_test || null,
          webhook_url_prod: mods[i].webhook_url_prod || null,
          input_schema: i === 0 ? { fields: this.inputSchema } : ((mods[i].input_schema != null && typeof mods[i].input_schema === 'object') ? mods[i].input_schema : {}),
          is_human_approval_required: !!mods[i].is_human_approval_required,
          next_module_id: null,
          output_schema: (mods[i].output_schema != null && typeof mods[i].output_schema === 'object') ? mods[i].output_schema : null,
          routing_rules: (mods[i].routing_rules != null && typeof mods[i].routing_rules === 'object') ? mods[i].routing_rules : null
        })
        .select('id')
        .single();
      if (insertErr) {
        console.error('Error creating flow_module:', insertErr);
        return;
      }
      mods[i].id = inserted.id;
      const idxKey = `idx_${i}`;
      if (this.flowTechnicalDetailsByModule[idxKey]) {
        this.flowTechnicalDetailsByModule[inserted.id] = this.flowTechnicalDetailsByModule[idxKey];
        delete this.flowTechnicalDetailsByModule[idxKey];
      }
    }
    
    // 2) Actualizar todos los módulos (name, step_order, execution_type, webhooks, input_schema primer módulo, next_module_id, output_schema, routing_rules)
    for (let i = 0; i < mods.length; i++) {
      const payload = {
        name: mods[i].name || 'Módulo ' + (i + 1),
        step_order: i + 1,
        execution_type: mods[i].execution_type || 'webhook',
        webhook_url_test: mods[i].webhook_url_test || null,
        webhook_url_prod: mods[i].webhook_url_prod || null,
        is_human_approval_required: !!mods[i].is_human_approval_required,
        next_module_id: mods[i].next_module_id || null,
        output_schema: (mods[i].output_schema != null && typeof mods[i].output_schema === 'object') ? mods[i].output_schema : null,
        routing_rules: (mods[i].routing_rules != null && typeof mods[i].routing_rules === 'object') ? mods[i].routing_rules : null
      };
      if (i === 0) payload.input_schema = { fields: this.inputSchema };
      else if (mods[i].input_schema != null && typeof mods[i].input_schema === 'object') payload.input_schema = mods[i].input_schema;
      const { error } = await this.supabase
        .from('flow_modules')
        .update(payload)
        .eq('id', mods[i].id);
      if (error) console.error('Error updating flow_module:', error);
    }
    
    this.currentFlowModuleId = mods[0]?.id || null;
    
    // 3) flow_technical_details: uno por módulo
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      const key = mod.id || `idx_${i}`;
      const td = this.flowTechnicalDetailsByModule[key] || {};
    const techPayload = {
        flow_module_id: mod.id,
        platform_name: td.platform_name || 'n8n',
        platform_flow_id: td.platform_flow_id || null,
        platform_flow_name: td.platform_flow_name || null,
        editor_url: td.editor_url || null,
        credential_id: td.credential_id || null,
        is_healthy: td.is_healthy !== false,
        avg_execution_time_ms: td.avg_execution_time_ms !== '' && td.avg_execution_time_ms != null ? parseInt(td.avg_execution_time_ms, 10) : null
      };
      const { error: techErr } = await this.supabase
      .from('flow_technical_details')
      .upsert(techPayload, { onConflict: 'flow_module_id' });
      if (techErr) console.error('Error upserting flow_technical_details:', techErr);
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
