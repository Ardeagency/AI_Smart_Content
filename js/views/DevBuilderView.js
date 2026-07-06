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
      // Valores posibles en BD: manual | autopilot
      flow_category_type: 'manual',
      token_cost: 1,
      // Pricing dinamico/estatico (2026-05-25):
      //   auto = cobra payload.tokens_cost reportado por n8n cada run (real-time)
      //   fixed = cobra siempre token_cost (precio plano set por dev)
      // El RPC siempre trackea credit_pricing_first/avg/min/max_observed para
      // que el dev portal pueda sugerir un precio basado en uso real.
      credit_pricing_mode: 'auto',
      credit_pricing_first_observed: null,
      credit_pricing_first_observed_at: null,
      credit_pricing_runs_observed: 0,
      credit_pricing_avg_observed: null,
      credit_pricing_min_observed: null,
      credit_pricing_max_observed: null,
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
      <!-- Header del Builder: pestañas (izq) + meta del flow (der: status, issues, versions, cost, undo/redo) -->
      <header class="builder-tabs-header" id="builderTabsHeader">
        <div class="builder-tabs">
          <button class="builder-tab active" data-tab="settings">
            <i class="aisc-ico aisc-ico--settings"></i> Configuración
          </button>
          <button class="builder-tab" data-tab="technical">
            <i class="aisc-ico aisc-ico--layers"></i> Módulos
          </button>
          <button class="builder-tab" data-tab="inputs">
            <i class="aisc-ico aisc-ico--textbox"></i> Inputs
          </button>
          <button class="builder-tab" data-tab="ficha">
            <i class="aisc-ico aisc-ico--credit-card"></i> Ficha del Flujo
          </button>
        </div>
        <div class="builder-header-meta">
          <span class="flow-status-badge draft" id="flowStatusBadge">Borrador</span>
          <span class="builder-autosave-indicator" id="builderAutosaveIndicator" hidden></span>
          <button type="button" class="builder-issues-btn" id="builderIssuesBtn" title="Problemas detectados" aria-haspopup="dialog">
            <i class="aisc-ico aisc-ico--alert-warning"></i> <span class="builder-issues-label">Issues</span>
            <span class="builder-issues-count" id="builderIssuesCount" hidden>0</span>
          </button>
          <button type="button" class="builder-versions-btn" id="builderVersionsBtn" title="Historial de versiones" aria-haspopup="dialog">
            <i class="aisc-ico aisc-ico--history"></i> <span class="builder-versions-label">Versiones</span>
          </button>
          <span class="builder-cost-badge" id="builderCostBadge" title="Coste estimado por ejecución"></span>
          <button type="button" class="builder-undo-btn" id="builderUndoBtn" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled>
            <i class="aisc-ico aisc-ico--refresh"></i>
          </button>
          <button type="button" class="builder-redo-btn" id="builderRedoBtn" title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" disabled>
            <i class="aisc-ico aisc-ico--refresh"></i>
          </button>
        </div>
      </header>

      <!-- Main Builder Container -->
      <main class="builder-main">
        <!-- Panel izquierdo: Biblioteca (estilo Weavy): rail estrecho con secciones + panel con search + grid -->
        <aside class="builder-sidebar builder-components" hidden>
          <nav class="components-rail" id="componentsRail" aria-label="Secciones de biblioteca"></nav>
          <div class="components-panel">
            <div class="builder-sidebar-header builder-components-header">
              <h3 class="builder-components-title" id="componentsSectionTitle">Biblioteca</h3>
              <div class="builder-components-search-wrap">
                <i class="aisc-ico builder-components-search-icon aisc-ico--search"></i>
                <input type="text" class="builder-components-search" id="componentsSearchInput" placeholder="Buscar" aria-label="Buscar componentes">
              </div>
            </div>
            <div class="builder-components-list" id="componentsList"></div>
          </div>
        </aside>

        <!-- Panel central: contenido de pestañas -->
        <div class="builder-canvas-wrapper">
          <!-- Tab 1: Configuración — izquierda: banner + nombre + descripción | derecha: el resto -->
          <div class="builder-tab-content active" id="tabSettings">
            <div class="builder-config-layout">
              <!-- Izquierda: portada, nombre y descripción del flujo -->
              <div class="builder-config-section builder-config-section--cover">
                <div class="flow-cover-container" id="flowImageUpload">
                  <div class="flow-cover-preview" id="flowImagePreview" title="Subir portada">
                    <i class="aisc-ico aisc-ico--image"></i>
                    <span>Subir portada</span>
                  </div>
                  <div class="flow-cover-actions" aria-hidden="true">
                    <button type="button" class="flow-cover-btn glass-black" id="removeImageBtn" title="Quitar portada" aria-label="Quitar portada" hidden><i class="aisc-ico aisc-ico--delete"></i></button>
                    <button type="button" class="flow-cover-btn glass-black" id="changeCoverBtn" title="Cambiar portada" aria-label="Cambiar portada"><i class="aisc-ico aisc-ico--image"></i></button>
                  </div>
                  <input type="file" id="flowImageInput" accept="image/*,video/*" hidden>
                </div>
                <div class="settings-field">
                  <label for="flowNameConfig">Nombre del flujo *</label>
                  <input type="text" id="flowNameConfig" placeholder="Ej: Generador de Reels Virales" maxlength="100">
                </div>
                <div class="settings-field settings-field--description">
                  <label for="flowDescription">Descripción</label>
                  <textarea id="flowDescription" placeholder="Una línea: qué hace este flujo" rows="4" maxlength="140"></textarea>
                </div>
              </div>
              <!-- Derecha: catálogo, versión, tipo de flujo, categoría, subcategoría, output, modelo de cobro -->
              <div class="builder-config-section builder-config-section--details">
                <label class="toggle-switch-row">
                  <input type="checkbox" id="uiShowInCatalog" checked class="toggle-switch-input">
                  <span class="toggle-switch" aria-hidden="true"></span>
                  <span class="toggle-switch-label">Mostrar en catálogo</span>
                </label>
                <div class="builder-config-details-grid">
                  <div class="settings-field">
                    <label for="flowVersion">Versión</label>
                    <input type="text" id="flowVersion" value="1.0.0" placeholder="1.0.0">
                  </div>
                  <div class="settings-field">
                    <label for="flowTypePicker">Tipo de flujo</label>
                    <input type="hidden" id="flowType" value="manual">
                    <div class="flow-type-tabs" id="flowTypePicker" role="tablist" aria-label="Tipo de flujo">
                      <button type="button" class="flow-type-tab" role="tab" data-value="manual" title="Input 100% dinámico">Manual</button>
                      <button type="button" class="flow-type-tab" role="tab" data-value="autopilot" title="Generación programable">Autopilot</button>
                    </div>
                  </div>
                  <div class="settings-field">
                    <label for="flowCategory">Categoría</label>
                    <select id="flowCategory">
                      <option value="">Seleccionar categoría...</option>
                    </select>
                  </div>
                  <div class="settings-field">
                    <label for="flowSubcategory">Subcategoría</label>
                    <select id="flowSubcategory">
                      <option value="">Seleccionar subcategoría...</option>
                    </select>
                  </div>
                  <div class="settings-field builder-config-field--full">
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
                <div class="settings-field settings-field--pricing" id="settingsTokenCostWrap">
                  <label>Modelo de cobro</label>
                  <div class="pricing-mode-toggle" role="radiogroup" aria-label="Modelo de cobro">
                    <button type="button" class="pricing-mode-btn" data-pricing-mode="auto" role="radio" aria-checked="true">
                      <i class="aisc-ico aisc-ico--zap"></i>
                      <div>
                        <strong>Automatico</strong>
                        <span>Cobra lo que reporte n8n cada run</span>
                      </div>
                    </button>
                    <button type="button" class="pricing-mode-btn" data-pricing-mode="fixed" role="radio" aria-checked="false">
                      <i class="aisc-ico aisc-ico--lock"></i>
                      <div>
                        <strong>Fijo</strong>
                        <span>Cobra siempre el mismo precio</span>
                      </div>
                    </button>
                  </div>
                  <div class="settings-field pricing-fixed-row" id="pricingFixedRow" hidden>
                    <label for="flowTokenCost">Creditos por ejecucion</label>
                    <input type="number" id="flowTokenCost" min="0" max="1000" step="0.01" value="1">
                  </div>
                  <div class="pricing-observed" id="pricingObservedBox" hidden>
                    <div class="pricing-observed-header">
                      <i class="aisc-ico aisc-ico--growth"></i>
                      <span>Uso real observado</span>
                      <span class="pricing-observed-runs" id="pricingObservedRuns">— runs</span>
                    </div>
                    <div class="pricing-observed-grid">
                      <div class="pricing-observed-cell">
                        <span class="pricing-observed-label">Primer run</span>
                        <span class="pricing-observed-value" id="pricingObservedFirst">—</span>
                      </div>
                      <div class="pricing-observed-cell">
                        <span class="pricing-observed-label">Promedio</span>
                        <span class="pricing-observed-value" id="pricingObservedAvg">—</span>
                      </div>
                      <div class="pricing-observed-cell">
                        <span class="pricing-observed-label">Min</span>
                        <span class="pricing-observed-value" id="pricingObservedMin">—</span>
                      </div>
                      <div class="pricing-observed-cell">
                        <span class="pricing-observed-label">Max</span>
                        <span class="pricing-observed-value" id="pricingObservedMax">—</span>
                      </div>
                    </div>
                    <button type="button" class="pricing-observed-apply" id="pricingApplyAvgBtn" hidden>
                      <i class="aisc-ico aisc-ico--sparkle"></i>
                      Usar promedio como precio fijo
                    </button>
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
                  <div class="settings-section technical-section-modules">
                    <div id="technicalModulesList" class="modules-node-map-wrap">
                      <div class="modules-node-map" id="modulesNodeMap"></div>
                      <div class="modules-node-map-actions">
                        <button type="button" class="btn-small btn-primary-modules" id="technicalAddModuleBtn"><i class="aisc-ico aisc-ico--add"></i> Añadir módulo</button>
                        <button type="button" class="btn-small btn-ghost" id="technicalDetailsPanelBtn" title="Detalles técnicos"><i class="aisc-ico aisc-ico--settings"></i> Detalles técnicos</button>
                      </div>
                    </div>
                    <!-- Modal: editar nodo (doble clic en un nodo) -->
                    <div class="modal-overlay" id="moduleNodeModal" role="dialog" aria-labelledby="moduleNodeModalTitle" aria-modal="true" hidden>
                      <div class="modal-content modal-module-node">
                        <div class="modal-header">
                          <h3 id="moduleNodeModalTitle">Editar módulo</h3>
                          <button type="button" class="btn-icon btn-ghost modal-close" id="moduleNodeModalClose" aria-label="Cerrar"><i class="aisc-ico aisc-ico--close"></i></button>
                        </div>
                        <div class="modal-body">
                          <input type="hidden" id="moduleNodeModalIndex" value="">
                          <div class="settings-field">
                            <label for="moduleNodeModalName">Nombre del nodo</label>
                            <input type="text" id="moduleNodeModalName" placeholder="Ej: Módulo 1">
                          </div>
                          <div class="settings-field">
                            <label for="moduleNodeModalExecutionType">Tipo de ejecución</label>
                            <select id="moduleNodeModalExecutionType">
                              <option value="webhook">n8n</option>
                              <option value="comfy">ComfyUI</option>
                            </select>
                          </div>
                          <div class="settings-field" id="moduleNodeModalComfyField" hidden>
                            <label for="moduleNodeModalComfyFlow">Flujo del servidor (ComfyUI)</label>
                            <select id="moduleNodeModalComfyFlow"></select>
                            <span class="field-help">Solo aparecen flujos del servidor no conectados a otro flow (conexión 1:1 segura).</span>
                          </div>
                          <div id="moduleNodeModalN8nFields">
                            <div class="settings-field">
                              <label for="moduleNodeModalUrlTest">URL Test</label>
                              <input type="url" id="moduleNodeModalUrlTest" placeholder="https://...">
                            </div>
                            <div class="settings-field">
                              <label for="moduleNodeModalUrlProd">URL Producción</label>
                              <input type="url" id="moduleNodeModalUrlProd" placeholder="https://...">
                            </div>
                          </div>
                          <div class="settings-field">
                            <label for="moduleNodeModalNext">Siguiente módulo</label>
                            <select id="moduleNodeModalNext">
                              <option value="">— Auto (siguiente por orden) —</option>
                            </select>
                            <span class="field-help">Por defecto el flujo sigue al módulo siguiente por step_order. Selecciona uno específico para crear un salto.</span>
                          </div>
                          <div class="settings-field">
                            <label for="moduleNodeModalRoutingRules">Routing rules (JSON)</label>
                            <textarea id="moduleNodeModalRoutingRules" class="property-json-editor" rows="4" placeholder='{"condition": "input.tipo == \"video\"", "next_module_id": "uuid-del-modulo-video"}'></textarea>
                            <span class="field-help">Opcional. Condicionales para enrutar a distintos módulos según el output. Si está vacío se usa next_module_id.</span>
                          </div>
                          <div class="settings-field">
                            <label for="moduleNodeModalOutputSchema">Output schema esperado (JSON)</label>
                            <textarea id="moduleNodeModalOutputSchema" class="property-json-editor" rows="3" placeholder='{"type":"object","properties":{"titulo":{"type":"string"},"imagen_url":{"type":"string"}}}'></textarea>
                            <span class="field-help">Describe el shape del output. Habilita autocompletar de variables {{ $modulo.output.x }} en módulos siguientes.</span>
                          </div>
                          <label class="toggle-switch-row" style="margin-top: 8px;">
                            <input type="checkbox" id="moduleNodeModalHumanApproval" class="toggle-switch-input">
                            <span class="toggle-switch" aria-hidden="true"></span>
                            <span class="toggle-switch-label">Requiere aprobación humana</span>
                          </label>
                          <!-- Outputs de módulos anteriores: drag a cualquier input/textarea para insertar la expression -->
                          <div class="module-drag-vars-panel" id="moduleNodeDragVarsPanel" hidden>
                            <div class="module-drag-vars-header">
                              <i class="aisc-ico aisc-ico--flows"></i>
                              <span>Outputs disponibles</span>
                              <span class="module-drag-vars-hint">Arrastra a un campo</span>
                            </div>
                            <div class="module-drag-vars-list" id="moduleNodeDragVarsList"></div>
                          </div>
                        </div>
                        <div class="modal-footer">
                          <button type="button" class="btn-small btn-ghost" id="moduleNodeModalSandbox"><i class="aisc-ico aisc-ico--play"></i> Probar módulo</button>
                          <div style="flex: 1;"></div>
                          <button type="button" class="btn-small btn-ghost" id="moduleNodeModalCancel">Cancelar</button>
                          <button type="button" class="btn-small btn-primary-modules" id="moduleNodeModalSave"><i class="aisc-ico aisc-ico--check"></i> Guardar</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Panel derecho: dentro del tab, debajo del header y respetando footer -->
              <div class="builder-panel-right" id="technicalDetailsPanel">
              <div class="builder-panel-right-header">
                <h4><i class="aisc-ico aisc-ico--settings"></i> Detalles técnicos</h4>
                <button type="button" class="btn-icon btn-ghost" id="technicalDetailsPanelClose" title="Cerrar"><i class="aisc-ico aisc-ico--close"></i></button>
              </div>
              <div class="builder-panel-right-body">
                  <div class="settings-field">
                  <label for="techDetailsModuleSelect">Módulo</label>
                  <select id="techDetailsModuleSelect">
                    <option value="">— Seleccionar módulo —</option>
                    </select>
                  </div>
                <div id="techDetailsFormWrap" class="tech-details-form" hidden>
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
                    <label for="techDetailsSignatureSecret">Signature secret (HMAC-SHA256)</label>
                    <div class="signature-secret-row">
                      <input type="text" id="techDetailsSignatureSecret" placeholder="Click «Generar» para crear un secret" readonly>
                      <button type="button" class="btn-small btn-ghost" id="techDetailsSignatureGenerate" title="Generar nuevo secret"><i class="aisc-ico aisc-ico--refresh"></i></button>
                      <button type="button" class="btn-small btn-ghost" id="techDetailsSignatureCopy" title="Copiar secret"><i class="aisc-ico aisc-ico--copy"></i></button>
                    </div>
                    <span class="field-help">Cada request al webhook incluirá el header <code>X-Flow-Signature: sha256=&lt;HMAC(secret, body)&gt;</code>. Verifica en tu endpoint para garantizar autenticidad.</span>
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
                <i class="aisc-ico aisc-ico--add"></i>
                <h4>Arrastra componentes aquí</h4>
                <p>Construye el formulario de entrada de tu flujo</p>
              </div>
              <div class="canvas-empty-state canvas-automated-state" id="canvasAutomatedState" hidden>
                <i class="aisc-ico aisc-ico--bot"></i>
                <h4>Flujo automatizado</h4>
                <p>Este flujo se ejecuta automáticamente por el sistema (Cron/Trigger). No requiere intervención del usuario final, por lo que no tiene formulario de entrada.</p>
              </div>
              <div class="canvas-fields" id="canvasFields">
                <!-- Los campos se agregan aquí -->
              </div>
            </div>
          </div>

          <!-- Tab 4: Ficha del Flujo: visualización de la card de flow + visualización del formulario -->
          <div class="builder-tab-content" id="tabFicha">
            <div class="builder-ficha-wrapper" id="builderFichaWrapper">
              <section class="ficha-section ficha-section--card" aria-labelledby="fichaCardHeading">
                <h3 id="fichaCardHeading" class="ficha-section-title"><i class="aisc-ico aisc-ico--credit-card"></i> Vista de la card</h3>
                <div class="ficha-flow-card-wrap" id="fichaFlowCardWrap">
                  <!-- Se rellena con renderFichaFlowCard() -->
                </div>
              </section>
              <section class="ficha-section ficha-section--form" aria-labelledby="fichaFormHeading">
                <h3 id="fichaFormHeading" class="ficha-section-title"><i class="aisc-ico aisc-ico--play"></i> Vista en el Studio</h3>
                <div class="ficha-inputs-preview" id="fichaInputsPreview">
                  <p class="ficha-inputs-empty">Sin campos de entrada.</p>
                </div>
              </section>
            </div>
          </div>
        </div>

        <!-- Panel derecho: Propiedades (oculto por defecto; solo visible en pestaña Inputs) -->
        <aside class="builder-sidebar builder-properties" hidden>
          <div class="builder-sidebar-header">
            <h3><i class="aisc-ico aisc-ico--filter"></i> Propiedades</h3>
          </div>
          <div class="builder-properties-content" id="propertiesPanel">
            <div class="properties-empty">
              <i class="aisc-ico aisc-ico--cursor-click"></i>
              <p>Selecciona un campo para editar sus propiedades</p>
            </div>
          </div>
        </aside>
      </main>

      <!-- Footer: solo acciones primarias (la meta del flow vive en el header) -->
      <footer class="builder-footer" id="builderFooter">
        <div class="builder-footer-actions" id="builderFooterActions">
          <button type="button" class="btn-builder-footer btn-save-draft" id="btnSaveDraft" hidden>Guardar flujo</button>
          <button type="button" class="btn-builder-footer btn-update-flow" id="btnUpdateFlow" hidden>Actualizar flujo</button>
          <button type="button" class="btn-builder-footer" id="testFlowBtn">Probar</button>
          <button type="button" class="btn-builder-footer btn-primary-footer" id="btnPublish" hidden>Publicar</button>
          <button type="button" class="btn-builder-footer btn-request-review" id="btnRequestReview" hidden>Solicitar revisión</button>
          <button type="button" class="btn-builder-footer btn-approve-publish" id="btnApprovePublish" hidden>Aprobar y publicar</button>
          <button type="button" class="btn-builder-footer btn-reject" id="btnReject" hidden>Rechazar</button>
          <button type="button" class="btn-builder-footer btn-unpublish" id="btnUnpublish" hidden>Despublicar</button>
        </div>
      </footer>

      <!-- Modal: Test -->
      <div class="modal builder-modal" id="testModal" hidden>
        <div class="modal-overlay"></div>
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3><i class="aisc-ico aisc-ico--play"></i> Probar Flujo</h3>
            <button class="modal-close" id="closeTestModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="test-container">
              <div class="test-form" id="testFormContainer">
                <!-- Formulario de prueba -->
              </div>
              <div class="test-results" id="testResults" hidden>
                <h4>Resultado:</h4>
                <pre id="testResultOutput"></pre>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-builder-secondary" id="closeTestBtn">Cerrar</button>
            <button class="btn-builder-primary" id="runTestBtn">
              <i class="aisc-ico aisc-ico--play"></i> Ejecutar
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Historial de versiones (Fase 4) -->
      <div class="modal builder-modal builder-versions-modal" id="versionsModal" hidden role="dialog" aria-labelledby="versionsTitle" aria-modal="true">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-versions">
          <div class="modal-header">
            <h3 id="versionsTitle"><i class="aisc-ico aisc-ico--history"></i> Historial de versiones</h3>
            <button type="button" class="modal-close" id="versionsClose" aria-label="Cerrar">&times;</button>
          </div>
          <div class="modal-body">
            <div class="versions-list" id="versionsList">
              <p class="versions-empty">Cargando…</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal: Sandbox de módulo aislado (Fase 2B) -->
      <div class="modal builder-modal builder-sandbox-modal" id="moduleSandboxModal" hidden role="dialog" aria-labelledby="moduleSandboxTitle" aria-modal="true">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-lg modal-sandbox">
          <div class="modal-header">
            <h3 id="moduleSandboxTitle"><i class="aisc-ico aisc-ico--play"></i> Probar módulo aislado</h3>
            <button type="button" class="modal-close" id="moduleSandboxClose" aria-label="Cerrar">&times;</button>
          </div>
          <div class="modal-body">
            <div class="sandbox-target">
              <strong id="sandboxTargetName">Módulo</strong>
              <span class="sandbox-target-meta" id="sandboxTargetMeta"></span>
            </div>
            <div class="sandbox-section">
              <label for="sandboxEnvSelect" class="sandbox-section-label">Entorno</label>
              <select id="sandboxEnvSelect">
                <option value="test">Test (URL test)</option>
                <option value="prod">Producción (URL prod)</option>
              </select>
            </div>
            <div class="sandbox-section">
              <label for="sandboxInput" class="sandbox-section-label">Payload de entrada (JSON)</label>
              <textarea id="sandboxInput" class="property-json-editor sandbox-input" rows="8" placeholder='{"inputs": {"campo": "valor"}}'></textarea>
              <div class="sandbox-input-actions">
                <button type="button" class="btn-small btn-ghost" id="sandboxFillFromInputs"><i class="aisc-ico aisc-ico--sparkle"></i> Rellenar con defaults del schema</button>
                <button type="button" class="btn-small btn-ghost" id="sandboxFillEmpty">Vaciar</button>
              </div>
            </div>
            <div class="sandbox-section" id="sandboxResultSection" hidden>
              <div class="sandbox-section-label">
                Resultado
                <span class="sandbox-status" id="sandboxStatus"></span>
                <span class="sandbox-duration" id="sandboxDuration"></span>
              </div>
              <pre class="sandbox-output" id="sandboxOutput"></pre>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-small btn-ghost" id="sandboxCancelBtn">Cerrar</button>
            <button type="button" class="btn-small btn-primary-modules" id="sandboxRunBtn"><i class="aisc-ico aisc-ico--play"></i> Ejecutar</button>
          </div>
        </div>
      </div>

      <!-- Modal: Variables picker (insertar {{ $modulo.output.x }}) -->
      <div class="modal builder-modal builder-variables-modal" id="variablesModal" hidden role="dialog" aria-labelledby="variablesTitle" aria-modal="true">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-variables">
          <div class="modal-header">
            <h3 id="variablesTitle"><i class="aisc-ico aisc-ico--coding"></i> Insertar variable</h3>
            <button type="button" class="modal-close" id="variablesClose" aria-label="Cerrar">&times;</button>
          </div>
          <div class="modal-body">
            <input type="text" class="variables-search" id="variablesSearch" placeholder="Buscar variable…" aria-label="Buscar variable">
            <div class="variables-list" id="variablesList"></div>
          </div>
        </div>
      </div>

      <!-- Modal: Command palette (Cmd/Ctrl+K) -->
      <div class="modal builder-modal builder-command-palette" id="commandPaletteModal" hidden role="dialog" aria-labelledby="commandPaletteTitle" aria-modal="true">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-command-palette">
          <div class="command-palette-input-wrap">
            <i class="aisc-ico command-palette-icon aisc-ico--search"></i>
            <input type="text" class="command-palette-input" id="commandPaletteInput" placeholder="Buscar campo por label, key o tipo…" aria-label="Buscar campo">
            <span class="command-palette-hint">↑↓ navegar · Enter abrir · Esc cerrar</span>
          </div>
          <div class="command-palette-results" id="commandPaletteResults" role="listbox" aria-labelledby="commandPaletteTitle"></div>
          <h3 id="commandPaletteTitle" class="visually-hidden">Buscador de campos</h3>
        </div>
      </div>

      <!-- Panel: Issues -->
      <div class="modal builder-modal builder-issues-modal" id="issuesModal" hidden role="dialog" aria-labelledby="issuesModalTitle" aria-modal="true">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-issues">
          <div class="modal-header">
            <h3 id="issuesModalTitle"><i class="aisc-ico aisc-ico--alert-warning"></i> Problemas detectados</h3>
            <button type="button" class="modal-close" id="issuesModalClose" aria-label="Cerrar">&times;</button>
          </div>
          <div class="modal-body">
            <div class="issues-list" id="issuesList">
              <p class="issues-empty">Sin problemas detectados.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal: Confirmar eliminar -->
      <div class="modal builder-modal" id="deleteModal" hidden>
        <div class="modal-overlay"></div>
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h3><i class="aisc-ico aisc-ico--alert-warning"></i> Confirmar eliminación</h3>
            <button class="modal-close" id="closeDeleteModal">&times;</button>
          </div>
          <div class="modal-body">
            <p>¿Estás seguro de que deseas eliminar este flujo?</p>
            <p class="text-danger">Esta acción no se puede deshacer.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-builder-secondary" id="cancelDeleteBtn">Cancelar</button>
            <button class="btn-builder-danger" id="confirmDeleteBtn">
              <i class="aisc-ico aisc-ico--delete"></i> Eliminar
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
    this.moveBuilderTabsToAppHeader();
    this.renderCanvas();
    this.updateJsonPreview();
    this.renderFooter();
    this.applyFlowTypeUI();
    // Aplicar layout de la pestaña activa al cargar (oculta Componentes/Propiedades si está en Configuración)
    this.applyTabLayout('settings');
    // Fase 2A: productividad (auto-save, undo/redo, Cmd+K, Issues)
    if (typeof this.initProductivity === 'function') this.initProductivity();

    // FEAT-034: si se llegó con ?test=1 (desde "Probar" en Mis Flujos), abrir el
    // modal de prueba una vez el flujo está cargado y la UI montada.
    if (this.autoOpenTest && typeof this.showTestModal === 'function') {
      this.autoOpenTest = false;
      this.showTestModal();
    }
  }

  /**
   * Mover las pestañas del Builder (Configuración, Módulos, Inputs, Ficha) al header principal de la app.
   * Solo en Builder: las tabs viven en #headerBuilderSlot dentro de #appHeader.
   */
  moveBuilderTabsToAppHeader() {
    const tabsHeader = document.getElementById('builderTabsHeader');
    const slot = document.getElementById('headerBuilderSlot');
    const appHeader = document.getElementById('appHeader');
    if (tabsHeader && slot && appHeader) {
      slot.appendChild(tabsHeader);
      slot.setAttribute('aria-hidden', 'false');
      appHeader.classList.add('app-header--builder');
    }
    // Fase 3: marcar el modo Builder con clase concreta (reemplaza :has(.builder-footer) frágil)
    const appContainer = document.getElementById('app-container') || document.querySelector('#app-container');
    if (appContainer) appContainer.classList.add('app-builder-mode');
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

    // FEAT-034: "Probar flujo" desde la card de Mis Flujos abre el builder con
    // ?test=1 → auto-abrir el modal de prueba (reusa el runner real del builder,
    // no un stub aparte). Solo tras cargar el flujo (requiere webhook configurado).
    this.autoOpenTest = urlParams.get('test') === '1' && !!this.flowId;
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
      const flowType = this.flowData.flow_category_type || 'manual';
      // Filtrar por for_flow_type del template: null = aplica a todos; otro valor = solo a ese tipo de flujo
      const { data, error } = await this.supabase
        .from('ui_component_templates')
        .select('id, name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index, for_flow_type, template_level')
        .eq('is_active', true)
        .or(`for_flow_type.is.null,for_flow_type.eq.${flowType}`)
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
    const pathname = (window.location.pathname || '').replace(/\/+$/, '') || '';
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
    if (isInputs) {
      // Re-renderiza canvas para reaplicar selección y listeners
      this.renderCanvas();
      this.renderPropertiesPanel();
    }
    if (tabId === 'ficha') this.renderFicha();
  }

  /**
   * Actualiza la vista "Ficha del Flujo": card de catalogo real + embed del Studio real.
   * El embed usa el mismo InputRegistry que Studio, asi los pickers se ven y comportan igual.
   */
  renderFicha() {
    const cardWrap = this.querySelector('#fichaFlowCardWrap');
    const inputsPreview = this.querySelector('#fichaInputsPreview');

    if (cardWrap) cardWrap.innerHTML = this.renderFichaFlowCard();

    if (!inputsPreview) return;

    if (this.inputSchema.length === 0) {
      inputsPreview.innerHTML = '<p class="ficha-inputs-empty">Sin campos de entrada.</p>';
      return;
    }

    inputsPreview.innerHTML = this.renderFichaStudioEmbed();
    this.initFichaStudioPickers();
  }

  /**
   * Construye el shell del Studio real para usar como preview en la pestana Ficha.
   * Espeja la estructura de StudioView.renderHTML() (manual mode) pero scopeado
   * dentro de .ficha-studio-embed para que viva embebido sin position: absolute.
   */
  renderFichaStudioEmbed() {
    const name = this.escapeHtml(this.flowData.name || 'Sin nombre');
    const cost = this.flowData.token_cost ?? 1;
    return `
      <div class="ficha-studio-embed" aria-label="Vista previa del Studio">
        <div class="studio-layout ficha-studio-embed__layout">
          <main class="studio-center">
            <div class="studio-canvas-empty" id="fichaStudioCanvas"></div>
            <footer class="studio-footer">
              <div class="studio-footer-credits">
                <div class="studio-credits-icon"><i class="aisc-ico aisc-ico--credits"></i></div>
                <span class="studio-credits-text">— creditos restantes</span>
                <span class="studio-credits-cost">${cost} creditos esta produccion</span>
              </div>
              <button type="button" class="studio-btn-producir" id="fichaStudioProducirBtn" disabled aria-disabled="true" title="Vista previa, no ejecutable">
                Producir
              </button>
            </footer>
          </main>
          <aside class="studio-sidebar-creative">
            <div class="studio-sidebar-content">
              <div class="studio-flow-form-wrap">
                <h3 class="studio-form-title">${name}</h3>
                <form class="studio-flow-form" id="fichaStudioFlowForm" onsubmit="return false;"></form>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  /**
   * Pinta los campos del input_schema en el form del embed usando InputRegistry,
   * el mismo motor que usa Studio. Inicializa pickers para que sean interactivos
   * (Producir queda deshabilitado para evitar side effects).
   */
  initFichaStudioPickers() {
    const formEl = this.querySelector('#fichaStudioFlowForm');
    if (!formEl) return;
    const fields = this.inputSchema || [];
    const Registry = window.InputRegistry;
    if (Registry && Registry.renderFormFromSchema) {
      formEl.innerHTML = Registry.renderFormFromSchema(fields, {
        idPrefix: 'ficha-studio-',
        wrapperClass: 'studio-field',
        showLabel: true,
        showHelper: true,
        showRequired: true
      });
      if (Registry.initFormPickers) Registry.initFormPickers(formEl);
    } else {
      formEl.innerHTML = '<p class="studio-form-empty">InputRegistry no disponible.</p>';
    }
  }

  /** Icono Font Awesome para tipo de output (igual que en catálogo de flows). */
  getOutputTypeIcon(type) {
    const t = (type || 'text').toLowerCase();
    if (t === 'video') return 'aisc-ico aisc-ico--video';
    if (t === 'image' || t === 'imagen') return 'aisc-ico aisc-ico--image';
    if (t === 'audio') return 'aisc-ico aisc-ico--music';
    if (t === 'document') return 'aisc-ico aisc-ico--document';
    if (t === 'mixed') return 'aisc-ico aisc-ico--layers';
    return 'fa-align-left';
  }

  getOutputTypeLabel(type) {
    const t = (type || 'text').toLowerCase();
    const labels = { text: 'Texto', image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento', mixed: 'Mixto' };
    return labels[t] || t;
  }

  getExecutionModeLabel(mode) {
    const m = (mode || 'single_step').toLowerCase();
    const labels = { single_step: 'Un paso', multi_step: 'Multi paso', sequential: 'Secuencial' };
    return labels[m] || m;
  }

  /**
   * Genera el HTML de la card de flujo igual que en "Mis flujos" (DevFlowsView): misma estructura
   * dev-flow-card-wrapper + flow-card--with-footer + flow-card-footer--dev.
   */
  renderFichaFlowCard() {
    // Espejo 1:1 de FlowCatalogView.renderFlowCard(): asi el dev ve exactamente
    // la card que vera el usuario final en el catalogo publico.
    const name = this.escapeHtml(this.flowData.name || 'Sin nombre');
    const cost = this.flowData.token_cost ?? 1;
    const version = (this.flowData.version || '1.0.0').toString();
    const type = this.flowData.flow_category_type || 'manual';
    const isAutopilotLike = (type === 'autopilot');

    const badges = [];
    if (isAutopilotLike) badges.push('<span class="flow-card-badge flow-card-badge--auto">Autopilot</span>');

    // Leer del state (no del DOM) para evitar races con loadCategories/loadSubcategories
    const categoryRow = this.categories.find(c => c.id === this.flowData.category_id);
    const subcategoryRow = this.subcategories.find(s => s.id === this.flowData.subcategory_id);
    const primaryTag = subcategoryRow?.name || categoryRow?.name || null;
    const primaryTagHtml = primaryTag
      ? `<span class="flow-card-info-tag">${this.escapeHtml(primaryTag)}</span>`
      : '';
    const outputTypeLabel = this.getOutputTypeLabel(this.flowData.output_type);
    const executionLabel = this.getExecutionModeLabel(this.flowData.execution_mode);

    const img = this.flowData.flow_image_url
      ? (/\.(mp4|webm|mov)(\?|$)/i.test(this.flowData.flow_image_url)
          ? `<video src="${this.escapeHtml(this.flowData.flow_image_url)}" class="flow-card-img" muted loop playsinline autoplay preload="metadata" aria-hidden="true"></video>`
          : `<img src="${this.escapeHtml(this.flowData.flow_image_url)}" alt="${name}" class="flow-card-img" loading="lazy">`)
      : `<div class="flow-card-placeholder"><i class="fas ${this.getOutputTypeIcon(this.flowData.output_type)}"></i></div>`;

    return `
      <div class="dev-flow-card-wrapper dev-flow-card-wrapper--ficha-preview">
        <article class="flow-card flow-card--catalog flow-card--ficha-preview" aria-hidden="true">
          <div class="flow-card-media">
            ${img}
            <div class="flow-card-gradient" aria-hidden="true"></div>
            <div class="flow-card-badges">${badges.join('')}</div>
            <div class="flow-card-actions">
              <button type="button" class="flow-card-icon-btn flow-card-icon-like" data-action="like" title="Like" aria-label="Like" tabindex="-1"><i class="aisc-ico aisc-ico--likes"></i></button>
              <button type="button" class="flow-card-icon-btn flow-card-icon-save" data-action="save" title="Guardar" aria-label="Guardar" tabindex="-1"><i class="aisc-ico aisc-ico--bookmark"></i></button>
            </div>
            <div class="flow-card-info">
              <h3 class="flow-card-title">${name}</h3>
              <div class="flow-card-info-meta">
                ${primaryTagHtml}
                <span class="flow-card-info-credits" title="Creditos por ejecucion"><i class="aisc-ico aisc-ico--zap"></i>${cost}</span>
              </div>
              <div class="flow-card-info-extra">
                <span class="flow-card-info-pill">${outputTypeLabel}</span>
                <span class="flow-card-info-pill">${executionLabel}</span>
                <span class="flow-card-info-pill">v${version}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    `;
  }

  /**
   * Actualiza el estado visual del picker Manual / Automatizado.
   * Los flujos automatizados usan la misma UI que los manuales (módulos, inputs, etc.).
   */
  updateFlowTypePicker(value) {
    const picker = this.querySelector('#flowTypePicker');
    if (!picker) return;
    picker.querySelectorAll('.flow-type-tab').forEach((tab) => {
      const tabValue = tab.getAttribute('data-value');
      const selected = tabValue === value;
      tab.classList.toggle('is-selected', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  applyFlowTypeUI() {
    const type = this.flowData.flow_category_type || 'manual';
    const isAutopilotLike = (type === 'autopilot');
    this.isAutomatedFlow = isAutopilotLike;

    const main = this.querySelector('.builder-main');
    const componentsSidebar = this.querySelector('.builder-sidebar.builder-components');
    const canvasEmpty = this.querySelector('#canvasEmptyState');
    const canvasAutomated = this.querySelector('#canvasAutomatedState');
    const canvasFields = this.querySelector('#canvasFields');
    const tokenCostInput = this.querySelector('#flowTokenCost');
    const uiShowInCatalog = this.querySelector('#uiShowInCatalog');
    const testFlowBtn = this.querySelector('#testFlowBtn');
    const tabsHeader = document.getElementById('builderTabsHeader');
    const tabModules = tabsHeader ? tabsHeader.querySelector('.builder-tab[data-tab="technical"]') : this.querySelector('.builder-tab[data-tab="technical"]');

    // Ambos tipos de flujo (manual, autopilot) comparten la misma experiencia de
    // Builder: siempre con módulos e inputs disponibles.
    // Para autopilot, si no hay schema aún, se preinicializa con DEFAULT_SCHEDULE_SCHEMA,
    // pero no se oculta nada de la UI.
    if (isAutopilotLike && this.inputSchema.length === 0) {
      this.inputSchema = JSON.parse(JSON.stringify(this.DEFAULT_SCHEDULE_SCHEMA.fields));
      this.hasUnsavedChanges = true;
    }

    if (main) {
      main.classList.remove('builder-mode-automated');
    }
    const builderCanvas = this.querySelector('#builderCanvas');
    if (builderCanvas) {
      builderCanvas.classList.remove('builder-canvas--automated');
    }
    if (componentsSidebar) {
      componentsSidebar.hidden = false; componentsSidebar.style.display = '';
    }
    if (canvasEmpty) {
      canvasEmpty.style.display = (this.inputSchema.length === 0) ? 'flex' : 'none';
    }
    if (canvasAutomated) {
      // Mantener este empty state oculto; ya no se usa para bloquear inputs.
      canvasAutomated.style.display = 'none';
    }
    if (canvasFields) {
      canvasFields.style.display = (this.inputSchema.length > 0) ? 'block' : 'none';
    }
    if (tokenCostInput) {
      const minCost = 1;
      tokenCostInput.min = minCost;
      tokenCostInput.max = 100;
      tokenCostInput.disabled = false;
      // Si el actual viola el mínimo (p.ej. era manual con 0), normaliza
      const cur = this.flowData.token_cost ?? 1;
      const norm = Math.max(minCost, cur);
      if (norm !== cur) this.flowData.token_cost = norm;
      tokenCostInput.value = norm;
    }
    if (uiShowInCatalog) {
      uiShowInCatalog.disabled = false;
      uiShowInCatalog.checked = !!this.flowData.show_in_catalog;
    }
    if (testFlowBtn) {
      testFlowBtn.hidden = false; testFlowBtn.style.display = '';
    }
    if (tabModules) {
      tabModules.hidden = false; tabModules.style.display = '';
    }
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
    const actionsEl = this.querySelector('#builderFooterActions');
    if (!actionsEl) return;

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

    hideAll();

    if (status === 'draft') {
      show(buttons.saveDraft);
      if (isLead) show(buttons.publish);
      else show(buttons.requestReview);
    } else if (status === 'checking') {
      if (isLead) {
        show(buttons.approvePublish);
        show(buttons.reject);
      }
    } else if (status === 'published') {
      show(buttons.updateFlow);
      if (isLead) show(buttons.unpublish);
    } else {
      show(buttons.saveDraft);
    }
  }

  updateImagePreview(url) {
    const preview = this.querySelector('#flowImagePreview');
    const removeBtn = this.querySelector('#removeImageBtn');
    
    if (preview) {
      if (url) {
        const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url) || url.includes('video');
        if (isVideo) {
          preview.innerHTML = `<video src="${url}" muted loop playsinline autoplay preload="metadata"></video>`;
        } else {
          preview.innerHTML = `<img src="${url}" alt="Portada del flujo">`;
        }
      } else {
        preview.innerHTML = '<i class="aisc-ico aisc-ico--image"></i><span>Subir portada</span>';
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
    this.setupPricingListeners();

    // Modal listeners
    this.setupModalListeners();
    
    // Image upload
    this.setupImageUpload();
    
    // Tecla Delete/Backspace: eliminar el input seleccionado (solo en pestaña Inputs y si no estamos en un input de texto)
    var keydownHandler = (e) => this.handleBuilderKeydown(e);
    document.addEventListener('keydown', keydownHandler);
    this._documentListeners.push({ element: document, event: 'keydown', handler: keydownHandler });

    // Escape global: cierra el último modal visible
    var escapeHandler = (e) => this.handleBuilderEscape(e);
    document.addEventListener('keydown', escapeHandler);
    this._documentListeners.push({ element: document, event: 'keydown', handler: escapeHandler });

    // beforeunload: avisar si hay cambios sin guardar
    var beforeUnloadHandler = (e) => {
      if (this.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    this._documentListeners.push({ element: window, event: 'beforeunload', handler: beforeUnloadHandler });
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
    // Fase 3: limpiar marca del modo Builder cuando se sale de la vista
    const appContainer = document.getElementById('app-container') || document.querySelector('#app-container');
    if (appContainer) appContainer.classList.remove('app-builder-mode');
    const appHeader = document.getElementById('appHeader');
    if (appHeader) appHeader.classList.remove('app-header--builder');
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
    // No borrar si hay un modal visible
    if (this.hasVisibleModal()) return;
    e.preventDefault();
    this.deleteField(this.selectedFieldIndex);
  }

  hasVisibleModal() {
    const modals = this.querySelectorAll('.modal, .modal-overlay');
    for (const m of modals) {
      if (m.hasAttribute('hidden')) continue;
      const cs = window.getComputedStyle(m);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') return true;
    }
    return false;
  }

  handleBuilderEscape(e) {
    if (e.key !== 'Escape') return;
    // Cerrar el último modal visible (top-most)
    const modals = Array.from(this.querySelectorAll('.modal, .modal-overlay')).filter(m => {
      if (m.hasAttribute('hidden')) return false;
      const cs = window.getComputedStyle(m);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    if (modals.length === 0) return;
    const last = modals[modals.length - 1];
    if (last.id === 'moduleNodeModal' && typeof this.closeModuleNodeModal === 'function') {
      this.closeModuleNodeModal();
    } else {
      last.style.display = 'none';
    }
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
    // Update tab buttons (viven en #builderTabsHeader, movidos al header de la app)
    const tabsContainer = document.getElementById('builderTabsHeader');
    const tabButtons = tabsContainer ? tabsContainer.querySelectorAll('.builder-tab') : this.querySelectorAll('.builder-tab');
    tabButtons.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update tab content (tabFicha → id="tabFicha")
    const tabContentId = tabId === 'ficha' ? 'tabFicha' : `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`;
    this.querySelectorAll('.builder-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === tabContentId);
    });

    this.applyTabLayout(tabId);
  }

  /**
   * Bind del toggle de pricing (auto/fixed) + boton "usar promedio como fijo".
   * El render del bloque (visibility del fixed-row y populacion del observed-box)
   * lo hace renderPricingPanel(), llamado cada vez que cambia flowData.
   */
  setupPricingListeners() {
    const toggle = this.querySelector('.pricing-mode-toggle');
    if (toggle && !toggle._bound) {
      toggle._bound = true;
      toggle.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pricing-mode]');
        if (!btn) return;
        const mode = btn.getAttribute('data-pricing-mode');
        if (mode !== 'auto' && mode !== 'fixed') return;
        if (this.flowData.credit_pricing_mode === mode) return;
        this.flowData.credit_pricing_mode = mode;
        this.hasUnsavedChanges = true;
        this.renderPricingPanel();
      });
    }
    const applyBtn = this.querySelector('#pricingApplyAvgBtn');
    if (applyBtn && !applyBtn._bound) {
      applyBtn._bound = true;
      applyBtn.addEventListener('click', () => {
        const avg = Number(this.flowData.credit_pricing_avg_observed);
        if (!Number.isFinite(avg) || avg <= 0) return;
        // Redondear a 2 decimales para que el input no muestre 3.499999...
        const rounded = Math.round(avg * 100) / 100;
        this.flowData.token_cost = rounded;
        this.flowData.credit_pricing_mode = 'fixed';
        this.hasUnsavedChanges = true;
        this.renderPricingPanel();
        const input = this.querySelector('#flowTokenCost');
        if (input) input.value = rounded;
      });
    }
  }

  /**
   * Pinta el toggle activo + visibilidad del input fixed + datos observados.
   * Idempotente: se puede llamar tantas veces como sea necesario tras
   * cualquier cambio en flowData.credit_pricing_*.
   */
  renderPricingPanel() {
    const mode = this.flowData.credit_pricing_mode || 'auto';
    // Toggle activo
    this.querySelectorAll('.pricing-mode-btn').forEach((btn) => {
      const m = btn.getAttribute('data-pricing-mode');
      const active = m === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    // Input fijo visible solo cuando mode=fixed
    const fixedRow = this.querySelector('#pricingFixedRow');
    if (fixedRow) fixedRow.hidden = mode !== 'fixed';

    // Observed stats: visible solo si hay al menos 1 run observado
    const runs = Number(this.flowData.credit_pricing_runs_observed || 0);
    const box = this.querySelector('#pricingObservedBox');
    if (box) box.hidden = runs <= 0;
    if (runs <= 0) return;

    const fmt = (v) => (v == null || !Number.isFinite(Number(v))) ? '—' : `${Number(v).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} cred`;
    const setText = (id, v) => { const el = this.querySelector(`#${id}`); if (el) el.textContent = v; };
    setText('pricingObservedRuns', `${runs} ${runs === 1 ? 'run' : 'runs'}`);
    setText('pricingObservedFirst', fmt(this.flowData.credit_pricing_first_observed));
    setText('pricingObservedAvg', fmt(this.flowData.credit_pricing_avg_observed));
    setText('pricingObservedMin', fmt(this.flowData.credit_pricing_min_observed));
    setText('pricingObservedMax', fmt(this.flowData.credit_pricing_max_observed));

    // Boton apply-avg solo si en auto y hay avg distinto al token_cost actual
    const applyBtn = this.querySelector('#pricingApplyAvgBtn');
    if (applyBtn) {
      const avg = Number(this.flowData.credit_pricing_avg_observed);
      const canApply = mode === 'auto' && Number.isFinite(avg) && avg > 0;
      applyBtn.hidden = !canApply;
    }
  }

  setupSettingsListeners() {
    const fields = {
      flowDescription: (v) => this.flowData.description = v,
      flowCategory: (v) => this.flowData.category_id = v || null,
      flowSubcategory: (v) => this.flowData.subcategory_id = v || null,
      flowTokenCost: (v) => {
        // Numeric ahora (no int) — soporta decimales tipo 3.25 cred.
        const n = parseFloat(v);
        const min = 0.01;
        this.flowData.token_cost = isNaN(n) ? min : Math.max(min, n);
      },
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

    // Tipo de flujo: picker Manual | Autopilot
    const flowTypeInput = this.querySelector('#flowType');
    const flowTypePicker = this.querySelector('#flowTypePicker');
    const leadOnlyTypes = ['autopilot'];
    if (flowTypePicker && flowTypeInput) {
      flowTypePicker.querySelectorAll('.flow-type-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          const v = tab.getAttribute('data-value');
          if (leadOnlyTypes.includes(v) && !this.isLead()) {
            this.showNotification('Solo los Lead pueden crear o convertir flujos en Autopilot.', 'warning');
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
        if (leadOnlyTypes.includes(v) && !this.isLead()) {
          e.target.value = this.flowData.flow_category_type || 'manual';
          this.showNotification('Solo los Lead pueden crear o convertir flujos en Autopilot.', 'warning');
          this.updateFlowTypePicker(e.target.value);
          return;
        }
        this.flowData.flow_category_type = v;
        this.hasUnsavedChanges = true;
        this.updateFlowTypePicker(v);
        this.applyFlowTypeUI();
        this.renderFooter();
        // Refrescar paleta de componentes según el nuevo tipo (algunos templates son específicos)
        this.loadComponentTemplates();
      });
    }
    this.updateFlowTypePicker(this.flowData.flow_category_type || 'manual');

    const uiShowInCatalog = this.querySelector('#uiShowInCatalog');
    if (uiShowInCatalog) {
      uiShowInCatalog.addEventListener('change', (e) => {
        this.flowData.show_in_catalog = e.target.checked;
        this.hasUnsavedChanges = true;
      });
    }

    const flowOutputType = this.querySelector('#flowOutputType');
    if (flowOutputType) {
      flowOutputType.addEventListener('change', (e) => {
        this.flowData.output_type = e.target.value || 'text';
        this.hasUnsavedChanges = true;
      });
    }
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
    const changeCoverBtn = this.querySelector('#changeCoverBtn');
    const fileInput = this.querySelector('#flowImageInput');
    
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await this.uploadImage(file);
        e.target.value = '';
      });
    }
    if (changeCoverBtn && fileInput) {
      changeCoverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }
    if (preview && fileInput) {
      preview.addEventListener('click', (e) => {
        if (!e.target.closest('.flow-cover-btn')) fileInput.click();
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
    if (!this.userId) {
      this.showNotification('Inicia sesión para subir la portada', 'error');
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
    if (!this.flowId) {
      this.showNotification('Guarda el flujo antes de probarlo', 'warning');
      return;
    }
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
          <i class="aisc-ico aisc-ico--alert-warning"></i>
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
      <i class="aisc-ico ${type === 'success' ? 'aisc-ico--check' : type === 'error' ? 'aisc-ico--close' : type === 'warning' ? 'aisc-ico--alert-warning' : 'aisc-ico--alert-info'}"></i>
      <span>${message}</span>
    `;
    
    document.body.appendChild(notification);

    const duration = (type === 'error' || type === 'warning') ? 6000 : 3000;
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }
}

window.DevBuilderView = DevBuilderView;

