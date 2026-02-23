/**
 * DevTestView.js
 * Vista de Testing de Flujos para el Portal de Desarrolladores (PaaS)
 * 
 * Permite a los desarrolladores:
 * - Probar flujos contra webhooks (test/prod)
 * - Ver historial de ejecuciones
 * - Analizar respuestas y errores
 * - Guardar configuraciones de prueba
 * - Ver logs en tiempo real
 */

class DevTestView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    
    // Flujos disponibles
    this.flows = [];
    this.selectedFlow = null;
    this.selectedFlowModule = null; // Módulo actual (webhooks e input_schema viven aquí)
    this.technicalDetails = null;
    
    // Estado del test
    this.isRunning = false;
    this.testInputs = {};
    this.environment = 'test'; // 'test' | 'prod'
    
    // Historial
    this.runHistory = [];
    this.selectedRun = null;
    
    // Logs
    this.logs = [];
    
    // Saved test cases
    this.savedTestCases = [];
    
    // Timer
    this.startTime = null;
    this.elapsedTime = 0;
    this.timerInterval = null;
  }

  onLeave() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  renderHTML() {
    return `
      <div class="dev-test-container">
        <!-- Header -->
        <header class="dev-test-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title">
              <i class="ph ph-flask"></i>
              Test de Flujos
            </h1>
            <p class="dev-header-subtitle">Prueba y depura tus flujos de IA</p>
          </div>
          <div class="dev-header-stats" id="testStats">
            <div class="stat-item">
              <span class="stat-value" id="statTotalRuns">0</span>
              <span class="stat-label">Ejecuciones</span>
            </div>
            <div class="stat-item success">
              <span class="stat-value" id="statSuccessRate">0%</span>
              <span class="stat-label">Éxito</span>
            </div>
            <div class="stat-item">
              <span class="stat-value" id="statAvgTime">0ms</span>
              <span class="stat-label">Tiempo Prom.</span>
            </div>
          </div>
        </header>

        <!-- Main Content -->
        <div class="dev-test-main">
          <!-- Panel Izquierdo: Configuración -->
          <aside class="test-config-panel">
            <!-- Selector de Flujo -->
            <section class="config-section">
              <h3><i class="ph ph-diagram-project"></i> Flujo</h3>
              <div class="flow-selector">
                <select id="flowSelector" class="flow-select">
                  <option value="">Seleccionar flujo...</option>
                </select>
                <button class="btn-icon" id="refreshFlowsBtn" title="Actualizar">
                  <i class="ph ph-arrows-clockwise"></i>
                </button>
              </div>
              <div class="flow-info" id="flowInfo" style="display: none;">
                <div class="flow-info-row">
                  <span class="info-label">Estado:</span>
                  <span class="info-value" id="flowStatus">-</span>
                </div>
                <div class="flow-info-row">
                  <span class="info-label">Versión:</span>
                  <span class="info-value" id="flowVersion">-</span>
                </div>
                <div class="flow-info-row">
                  <span class="info-label">Campos:</span>
                  <span class="info-value" id="flowFields">-</span>
                </div>
              </div>
            </section>

            <!-- Selector de Ambiente -->
            <section class="config-section">
              <h3><i class="ph ph-cloud"></i> Ambiente</h3>
              <div class="environment-toggle">
                <button class="env-btn active" data-env="test" id="envTestBtn">
                  <i class="ph ph-flask"></i>
                  Test
                </button>
                <button class="env-btn" data-env="prod" id="envProdBtn">
                  <i class="ph ph-globe"></i>
                  Producción
                </button>
              </div>
              <div class="webhook-info" id="webhookInfo">
                <span class="webhook-label">Webhook:</span>
                <span class="webhook-url" id="webhookUrl">No configurado</span>
              </div>
            </section>

            <!-- Test Cases Guardados -->
            <section class="config-section">
              <h3>
                <i class="ph ph-folder-simple"></i> Test Cases
                <button class="btn-icon-small" id="saveTestCaseBtn" title="Guardar configuración actual">
                  <i class="ph ph-plus"></i>
                </button>
              </h3>
              <div class="test-cases-list" id="testCasesList">
                <div class="empty-state small">
                  <p>Sin test cases guardados</p>
                </div>
              </div>
            </section>
          </aside>

          <!-- Panel Central: Formulario y Resultados -->
          <main class="test-main-panel">
            <!-- Tabs -->
            <div class="test-tabs">
              <button class="test-tab active" data-tab="inputs">
                <i class="ph ph-textbox"></i>
                Inputs
              </button>
              <button class="test-tab" data-tab="response">
                <i class="ph ph-code"></i>
                Respuesta
                <span class="tab-badge" id="responseBadge" style="display: none;"></span>
              </button>
              <button class="test-tab" data-tab="logs">
                <i class="ph ph-list-bullets"></i>
                Logs
                <span class="tab-badge" id="logsBadge" style="display: none;"></span>
              </button>
            </div>

            <!-- Tab: Inputs -->
            <div class="test-tab-content active" id="tabInputs">
              <div class="inputs-empty" id="inputsEmpty">
                <i class="ph ph-hand-pointing"></i>
                <h4>Selecciona un flujo</h4>
                <p>Elige un flujo para ver sus campos de entrada</p>
              </div>
              <div class="inputs-form" id="inputsForm" style="display: none;">
                <div class="form-fields" id="formFields">
                  <!-- Campos dinámicos -->
                </div>
                <div class="form-actions">
                  <button class="btn-secondary" id="clearInputsBtn">
                    <i class="ph ph-eraser"></i>
                    Limpiar
                  </button>
                  <button class="btn-primary btn-run" id="runTestBtn" disabled>
                    <i class="ph ph-play"></i>
                    <span>Ejecutar Test</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Tab: Respuesta -->
            <div class="test-tab-content" id="tabResponse">
              <div class="response-empty" id="responseEmpty">
                <i class="ph ph-brackets-curly"></i>
                <h4>Sin respuesta</h4>
                <p>Ejecuta un test para ver la respuesta</p>
              </div>
              <div class="response-content" id="responseContent" style="display: none;">
                <div class="response-header">
                  <div class="response-status" id="responseStatus">
                    <span class="status-code"></span>
                    <span class="status-text"></span>
                  </div>
                  <div class="response-time" id="responseTime">
                    <i class="ph ph-timer"></i>
                    <span>0ms</span>
                  </div>
                  <div class="response-actions">
                    <button class="btn-icon-small" id="copyResponseBtn" title="Copiar">
                      <i class="ph ph-copy"></i>
                    </button>
                    <button class="btn-icon-small" id="expandResponseBtn" title="Expandir">
                      <i class="ph ph-arrows-out"></i>
                    </button>
                  </div>
                </div>
                <div class="response-body">
                  <pre id="responseBody"></pre>
                </div>
              </div>
            </div>

            <!-- Tab: Logs -->
            <div class="test-tab-content" id="tabLogs">
              <div class="logs-toolbar">
                <div class="logs-filters">
                  <select id="logSeverityFilter">
                    <option value="all">Todos</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
                <button class="btn-small" id="clearLogsBtn">
                  <i class="ph ph-trash"></i>
                  Limpiar
                </button>
              </div>
              <div class="logs-list" id="logsList">
                <div class="logs-empty">
                  <i class="ph ph-note"></i>
                  <p>Sin logs registrados</p>
                </div>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="test-progress" id="testProgress" style="display: none;">
              <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
              </div>
              <div class="progress-info">
                <span id="progressStatus">Ejecutando...</span>
                <span id="progressTime">0.0s</span>
              </div>
            </div>
          </main>

          <!-- Panel Derecho: Historial -->
          <aside class="test-history-panel">
            <div class="history-header">
              <h3><i class="ph ph-clock-counter-clockwise"></i> Historial</h3>
              <button class="btn-icon-small" id="refreshHistoryBtn" title="Actualizar">
                <i class="ph ph-arrows-clockwise"></i>
              </button>
            </div>
            <div class="history-list" id="historyList"></div>
          </aside>
        </div>
      </div>

      <!-- Modal: Guardar Test Case -->
      <div class="modal" id="saveTestCaseModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h3><i class="ph ph-floppy-disk"></i> Guardar Test Case</h3>
            <button class="modal-close" id="closeSaveModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-field">
              <label for="testCaseName">Nombre</label>
              <input type="text" id="testCaseName" placeholder="Ej: Test con datos mínimos">
            </div>
            <div class="form-field">
              <label for="testCaseDescription">Descripción (opcional)</label>
              <textarea id="testCaseDescription" rows="2" placeholder="Descripción del caso de prueba"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="cancelSaveBtn">Cancelar</button>
            <button class="btn-primary" id="confirmSaveBtn">Guardar</button>
          </div>
        </div>
      </div>

      <!-- Modal: Ver Run Detalle -->
      <div class="modal" id="runDetailModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3><i class="ph ph-info"></i> Detalle de Ejecución</h3>
            <button class="modal-close" id="closeRunModal">&times;</button>
          </div>
          <div class="modal-body" id="runDetailBody">
            <!-- Contenido dinámico -->
          </div>
        </div>
      </div>

      <!-- Modal: Expandir Respuesta -->
      <div class="modal" id="expandResponseModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-xl">
          <div class="modal-header">
            <h3><i class="ph ph-code"></i> Respuesta Completa</h3>
            <button class="modal-close" id="closeExpandModal">&times;</button>
          </div>
          <div class="modal-body">
            <pre id="expandedResponse" class="expanded-response"></pre>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    await this.initSupabase();
    await this.loadFlows();
    this.checkUrlParams();
    this.setupEventListeners();
    this.loadTestCases();
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
    const flowId = urlParams.get('flow');
    
    if (flowId) {
      const selector = this.querySelector('#flowSelector');
      if (selector) {
        selector.value = flowId;
        this.selectFlow(flowId);
      }
    }
  }

  async loadFlows() {
    if (!this.supabase || !this.userId) return;
    
    try {
      const { data, error } = await this.supabase
        .from('content_flows')
        .select(`
          id,
          name,
          description,
          status,
          version,
          flow_category_type,
          token_cost
        `)
        .eq('owner_id', this.userId)
        .order('name', { ascending: true });
      
      if (error) throw error;
      
      this.flows = data || [];
      this.renderFlowSelector();
    } catch (err) {
      console.error('Error loading flows:', err);
      this.showNotification('Error al cargar flujos', 'error');
    }
  }

  renderFlowSelector() {
    const selector = this.querySelector('#flowSelector');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">Seleccionar flujo...</option>';
    
    this.flows.forEach(flow => {
      const option = document.createElement('option');
      option.value = flow.id;
      option.textContent = `${flow.name} (${flow.status || 'draft'})`;
      selector.appendChild(option);
    });
  }

  async selectFlow(flowId) {
    if (!flowId) {
      this.selectedFlow = null;
      this.selectedFlowModule = null;
      this.technicalDetails = null;
      this.updateFlowInfo();
      this.hideInputsForm();
      return;
    }
    
    this.selectedFlow = this.flows.find(f => f.id === flowId);
    
    if (!this.selectedFlow) return;
    
    // Cargar módulo(s) del flujo (webhooks e input_schema están en flow_modules)
    await this.loadFlowModuleAndTechnicalDetails(flowId);
    
    // Actualizar UI
    this.updateFlowInfo();
    this.renderInputsForm();
    this.updateWebhookInfo();
    
    // Cargar historial del flujo
    await this.loadRunHistory();
    
    // Cargar estadísticas
    await this.loadStats();
  }

  /**
   * Carga el primer módulo del flujo (webhook URLs, input_schema) y opcionalmente
   * flow_technical_details por flow_module_id (plataforma, editor_url, health).
   */
  async loadFlowModuleAndTechnicalDetails(flowId) {
    if (!this.supabase) return;
    
    this.selectedFlowModule = null;
    this.technicalDetails = null;
    
    try {
      const { data: modules, error: modError } = await this.supabase
        .from('flow_modules')
        .select('id, name, step_order, webhook_url_test, webhook_url_prod, input_schema')
        .eq('content_flow_id', flowId)
        .order('step_order', { ascending: true });
      
      if (modError) throw modError;
      
      const module = (modules && modules[0]) || null;
      this.selectedFlowModule = module;
      
      // input_schema y webhooks en el flujo para compatibilidad con la UI
      if (this.selectedFlow && module) {
        this.selectedFlow.input_schema = module.input_schema || this.selectedFlow.input_schema;
        this.selectedFlow.webhook_url_test = module.webhook_url_test;
        this.selectedFlow.webhook_url_prod = module.webhook_url_prod;
      }
      
      if (!module) return;
      
      const { data: tech, error: techError } = await this.supabase
        .from('flow_technical_details')
        .select('*')
        .eq('flow_module_id', module.id)
        .maybeSingle();
      
      if (techError && techError.code !== 'PGRST116') throw techError;
      this.technicalDetails = tech || null;
    } catch (err) {
      console.error('Error loading flow module / technical details:', err);
      this.selectedFlowModule = null;
      this.technicalDetails = null;
    }
  }

  updateFlowInfo() {
    const infoPanel = this.querySelector('#flowInfo');
    const statusEl = this.querySelector('#flowStatus');
    const versionEl = this.querySelector('#flowVersion');
    const fieldsEl = this.querySelector('#flowFields');
    
    if (!this.selectedFlow) {
      if (infoPanel) infoPanel.style.display = 'none';
      return;
    }
    
    if (infoPanel) infoPanel.style.display = 'block';
    
    const statusLabels = {
      draft: '<span class="status-badge draft">Borrador</span>',
      testing: '<span class="status-badge testing">En Pruebas</span>',
      published: '<span class="status-badge published">Publicado</span>'
    };
    
    if (statusEl) {
      statusEl.innerHTML = statusLabels[this.selectedFlow.status] || statusLabels.draft;
    }
    
    if (versionEl) {
      versionEl.textContent = this.selectedFlow.version || '1.0.0';
    }
    
    if (fieldsEl) {
      const fields = this.selectedFlow.input_schema?.fields || [];
      fieldsEl.textContent = `${fields.length} campos`;
    }
  }

  updateWebhookInfo() {
    const urlEl = this.querySelector('#webhookUrl');
    if (!urlEl) return;
    
    // URLs viven en flow_modules (selectedFlow ya las tiene copiadas desde loadFlowModuleAndTechnicalDetails)
    let url = null;
    if (this.environment === 'test') {
      url = this.selectedFlow?.webhook_url_test || this.selectedFlowModule?.webhook_url_test;
    } else {
      url = this.selectedFlow?.webhook_url_prod || this.selectedFlowModule?.webhook_url_prod;
    }
    
    if (url) {
      const truncated = url.length > 40 ? url.substring(0, 40) + '...' : url;
      urlEl.innerHTML = `<span title="${url}">${truncated}</span>`;
      urlEl.classList.remove('not-configured');
    } else {
      urlEl.textContent = 'No configurado';
      urlEl.classList.add('not-configured');
    }
  }

  hideInputsForm() {
    const empty = this.querySelector('#inputsEmpty');
    const form = this.querySelector('#inputsForm');
    
    if (empty) empty.style.display = 'flex';
    if (form) form.style.display = 'none';
    
    this.querySelector('#runTestBtn')?.setAttribute('disabled', 'true');
  }

  renderInputsForm() {
    const empty = this.querySelector('#inputsEmpty');
    const form = this.querySelector('#inputsForm');
    const fieldsContainer = this.querySelector('#formFields');
    const runBtn = this.querySelector('#runTestBtn');
    
    if (!this.selectedFlow) {
      this.hideInputsForm();
      return;
    }
    
    const fields = this.selectedFlow.input_schema?.fields || [];
    
    if (fields.length === 0) {
      if (empty) {
        empty.innerHTML = `
          <i class="ph ph-warning"></i>
          <h4>Sin campos definidos</h4>
          <p>Este flujo no tiene campos de entrada configurados</p>
          <a href="/dev/builder?id=${this.selectedFlow.id}" class="btn-link">Configurar en Builder</a>
        `;
        empty.style.display = 'flex';
      }
      if (form) form.style.display = 'none';
      return;
    }
    
    if (empty) empty.style.display = 'none';
    if (form) form.style.display = 'block';
    
// Renderizar campos
    if (fieldsContainer) {
      fieldsContainer.innerHTML = fields.map(field => this.renderInputField(field)).join('');
      this.setupInputListeners();
      if (window.InputRegistry && window.InputRegistry.initColorsPicker) window.InputRegistry.initColorsPicker(fieldsContainer);
      if (window.InputRegistry && window.InputRegistry.initAspectRatioPicker) window.InputRegistry.initAspectRatioPicker(fieldsContainer);
      this.populateColoresFromBrand();
    }

    // Habilitar botón de ejecutar
    if (runBtn) runBtn.removeAttribute('disabled');
    
    // Reset inputs
    this.testInputs = {};
  }

  renderInputField(field) {
    if (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.renderFormFieldWithWrapper) {
      return window.InputRegistry.renderFormFieldWithWrapper(field, {
        idPrefix: 'input_',
        wrapperClass: 'form-field',
        showLabel: true,
        showHelper: true,
        showRequired: true,
        required: field.required
      });
    }
    const type = field.input_type || field.type || 'text';
    const isStructural = type === 'section' || type === 'divider' || type === 'description_block';
    if (isStructural) return '';
    const required = field.required ? '<span class="required">*</span>' : '';
    const description = field.description ? `<span class="field-help">${field.description}</span>` : '';
    let inputHtml = '';
    switch (type) {
      case 'text':
        inputHtml = `<input type="text" id="input_${field.key}" name="${field.key}" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''}>`;
        break;
      case 'textarea':
        inputHtml = `<textarea id="input_${field.key}" name="${field.key}" rows="${field.rows || 4}" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''}></textarea>`;
        break;
      case 'select':
        const options = (field.options || []).map(opt => `<option value="${opt.value || opt}">${opt.label || opt}</option>`).join('');
        inputHtml = `<select id="input_${field.key}" name="${field.key}" ${field.required ? 'required' : ''}><option value="">${field.placeholder || 'Seleccionar...'}</option>${options}</select>`;
        break;
      case 'number':
        inputHtml = `<input type="number" id="input_${field.key}" name="${field.key}" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step || 1}" value="${field.defaultValue ?? ''}" ${field.required ? 'required' : ''}>`;
        break;
      case 'checkbox':
        return `<div class="form-field checkbox-wrapper" data-key="${field.key}"><label class="checkbox-field"><input type="checkbox" id="input_${field.key}" name="${field.key}" ${field.defaultValue ? 'checked' : ''}><span>${field.label}</span></label>${description}</div>`;
      case 'radio':
        const radioOptions = (field.options || []).map((opt, i) => `<label class="radio-option"><input type="radio" name="${field.key}" value="${opt.value || opt}" ${i === 0 ? 'checked' : ''}><span>${opt.label || opt}</span></label>`).join('');
        inputHtml = `<div class="radio-group">${radioOptions}</div>`;
        break;
      case 'range':
        inputHtml = `<div class="range-field"><input type="range" id="input_${field.key}" name="${field.key}" min="${field.min || 0}" max="${field.max || 100}" step="${field.step || 1}" value="${field.defaultValue || 50}"><span class="range-value">${field.defaultValue || 50}</span></div>`;
        break;
      default:
        inputHtml = `<input type="text" id="input_${field.key}" name="${field.key}" placeholder="${field.placeholder || 'UUID (para testing)'}" ${field.required ? 'required' : ''}>`;
    }
    return `<div class="form-field" data-key="${field.key}"><label for="input_${field.key}">${field.label || field.key} ${required}</label>${inputHtml}${description}</div>`;
  }

  setupInputListeners() {
    const fields = this.querySelectorAll('#formFields input, #formFields textarea, #formFields select');
    
    fields.forEach(field => {
      field.addEventListener('input', (e) => {
        const key = e.target.name;
        
        if (e.target.type === 'checkbox') {
          this.testInputs[key] = e.target.checked;
        } else if (e.target.type === 'range') {
          this.testInputs[key] = parseFloat(e.target.value);
          // Update range display
          const display = e.target.parentElement.querySelector('.range-value');
          if (display) display.textContent = e.target.value;
        } else {
          this.testInputs[key] = e.target.value;
        }
      });
      
      field.addEventListener('change', (e) => {
        const key = e.target.name;
        if (e.target.type === 'radio') {
          this.testInputs[key] = e.target.value;
        }
      });
    });
  }

  /**
   * Obtiene los hex de colores de la marca para el usuario actual (primer brand_container). Máx. 6. Solo lectura.
   */
  async getBrandColorsForUser() {
    if (!this.supabase || !this.userId) return [];
    try {
      const { data: container, error: e0 } = await this.supabase
        .from('brand_containers')
        .select('id')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e0 || !container) return [];
      const { data: brand, error: e1 } = await this.supabase
        .from('brands')
        .select('id')
        .eq('project_id', container.id)
        .maybeSingle();
      if (e1 || !brand) return [];
      const { data: colors, error: e2 } = await this.supabase
        .from('brand_colors')
        .select('hex_value')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: true });
      if (e2 || !colors || colors.length === 0) return [];
      const seen = new Set();
      const hexes = [];
      for (const row of colors) {
        const raw = (row.hex_value || '').trim().replace(/^#/, '');
        if (!/^[0-9A-Fa-f]{6}$/.test(raw)) continue;
        const hex = '#' + raw;
        if (!seen.has(hex)) {
          seen.add(hex);
          hexes.push(hex);
          if (hexes.length >= 6) break;
        }
      }
      return hexes;
    } catch (e) {
      console.error('DevTest getBrandColorsForUser:', e);
      return [];
    }
  }

  /**
   * Prellena los campos "colores" vacíos con los colores de la marca del usuario. Solo afecta al valor del formulario (JSON del webhook); no modifica brand_colors.
   */
  async populateColoresFromBrand() {
    const fieldsContainer = this.querySelector('#formFields');
    if (!fieldsContainer) return;
    const wraps = fieldsContainer.querySelectorAll('.input-colors-wrap[data-colors-brand-style="1"]');
    if (wraps.length === 0) return;
    const brandHexes = await this.getBrandColorsForUser();
    if (brandHexes.length === 0) return;
    const hexList = brandHexes.slice(0, 6);
    wraps.forEach(wrap => {
      const hidden = wrap.previousElementSibling;
      if (!hidden || !hidden.classList.contains('input-colors-value')) return;
      const current = (hidden.value || '').split(',').map(s => s.trim()).filter(Boolean);
      if (current.length > 0) return;
      const max = Math.max(1, Math.min(12, parseInt(wrap.getAttribute('data-colors-max'), 10) || 6));
      const list = hexList.slice(0, max);
      hidden.value = list.join(',');
      wrap._colorsInit = false;
      wrap.innerHTML = list.map(hex =>
        `<div class="color-swatch" style="background:${hex};" data-hex="${hex}"><button type="button" class="color-delete-btn" title="Eliminar" aria-label="Eliminar color">×</button></div>`
      ).join('') + (list.length < max
        ? '<button type="button" class="color-swatch-add-btn" title="Agregar color" aria-label="Agregar color"><span>+</span></button>'
        : '');
    });
    if (window.InputRegistry && window.InputRegistry.initColorsPicker) {
      window.InputRegistry.initColorsPicker(fieldsContainer);
    }
    if (window.InputRegistry && window.InputRegistry.initAspectRatioPicker) {
      window.InputRegistry.initAspectRatioPicker(fieldsContainer);
    }
  }

  collectInputs() {
    const inputs = {};
    const fields = this.selectedFlow?.input_schema?.fields || [];
    
    fields.forEach(field => {
      const el = this.querySelector(`[name="${field.key}"]`);
      
      if (!el) return;
      
      if (el.type === 'checkbox') {
        inputs[field.key] = el.checked;
      } else if (el.type === 'radio') {
        const checked = this.querySelector(`[name="${field.key}"]:checked`);
        inputs[field.key] = checked ? checked.value : null;
      } else if (el.type === 'number' || el.type === 'range') {
        inputs[field.key] = el.value ? parseFloat(el.value) : null;
      } else {
        inputs[field.key] = el.value;
      }
    });
    
    return inputs;
  }

  validateInputs() {
    const fields = this.selectedFlow?.input_schema?.fields || [];
    const inputs = this.collectInputs();
    const errors = [];
    
    fields.forEach(field => {
      if (field.required && !inputs[field.key] && inputs[field.key] !== false && inputs[field.key] !== 0) {
        errors.push(`El campo "${field.label || field.key}" es requerido`);
      }
    });
    
    return errors;
  }

  async runTest() {
    if (!this.selectedFlow || this.isRunning) return;
    
    // Validar inputs
    const errors = this.validateInputs();
    if (errors.length > 0) {
      this.showNotification(errors[0], 'warning');
      return;
    }
    
    // Obtener webhook URL
    let webhookUrl = null;
    if (this.environment === 'test') {
      webhookUrl = this.selectedFlow?.webhook_url_test || this.selectedFlowModule?.webhook_url_test;
    } else {
      webhookUrl = this.selectedFlow?.webhook_url_prod || this.selectedFlowModule?.webhook_url_prod;
    }
    
    if (!webhookUrl) {
      this.showNotification('No hay webhook configurado para este ambiente', 'error');
      return;
    }
    
    // Iniciar test
    this.isRunning = true;
    this.startTimer();
    this.showProgress(true);
    this.updateRunButton(true);
    this.addLog('info', `Iniciando test en ambiente ${this.environment.toUpperCase()}`);
    
    const inputs = this.collectInputs();
    const method = this.technicalDetails?.webhook_method || 'POST';
    
    let runId = null;
    let response = null;
    let responseData = null;
    let statusCode = null;
    
    try {
      // Crear registro de ejecución (inputs van en runs_inputs)
      if (this.supabase) {
        const { data: run, error: runError } = await this.supabase
          .from('flow_runs')
          .insert({
            flow_id: this.selectedFlow.id,
            user_id: this.userId,
            status: 'running'
          })
          .select('id')
          .single();
        
        if (!runError && run) {
          runId = run.id;
          if (this.selectedFlowModule?.id) {
            await this.supabase
              .from('runs_inputs')
              .insert({
                run_id: runId,
                flow_module_id: this.selectedFlowModule.id,
                input_data: inputs
              });
          }
        }
      }
      
      this.addLog('info', `Enviando ${method} a ${webhookUrl.substring(0, 50)}...`);
      
      // Ejecutar request
      const requestOptions = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      if (method !== 'GET') {
        requestOptions.body = JSON.stringify({
          inputs,
          flow_id: this.selectedFlow.id,
          environment: this.environment,
          test_mode: true,
          run_id: runId,
          timestamp: new Date().toISOString()
        });
      }
      
      response = await fetch(webhookUrl, requestOptions);
      statusCode = response.status;
      
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      
      // Log resultado
      if (response.ok) {
        this.addLog('success', `Respuesta exitosa: ${statusCode} ${response.statusText}`);
      } else {
        this.addLog('error', `Error: ${statusCode} ${response.statusText}`);
      }
      
      // Mostrar respuesta
      this.showResponse(statusCode, response.statusText, responseData);
      
      // Actualizar registro de ejecución
      if (this.supabase && runId) {
        await this.supabase
          .from('flow_runs')
          .update({
            status: response.ok ? 'completed' : 'failed',
            webhook_response_code: statusCode,
            tokens_consumed: this.selectedFlow.token_cost || 1
          })
          .eq('id', runId);
        
        // Crear log si hay error (con flow_module_id si existe)
        if (!response.ok) {
          await this.supabase
            .from('developer_logs')
            .insert({
              flow_id: this.selectedFlow.id,
              run_id: runId,
              flow_module_id: this.selectedFlowModule?.id || null,
              environment: this.environment,
              severity: 'error',
              error_message: `HTTP ${statusCode}: ${response.statusText}`,
              raw_details: { response: responseData }
            });
        }
      }
      
    } catch (err) {
      console.error('Test error:', err);
      this.addLog('error', `Error de conexión: ${err.message}`);
      
      this.showResponse(0, 'Network Error', { error: err.message, type: 'network_error' });
      
      // Registrar error
      if (this.supabase && runId) {
        await this.supabase
          .from('flow_runs')
          .update({
            status: 'error',
            webhook_response_code: 0
          })
          .eq('id', runId);
        
        await this.supabase
          .from('developer_logs')
          .insert({
            flow_id: this.selectedFlow.id,
            run_id: runId,
            flow_module_id: this.selectedFlowModule?.id || null,
            environment: this.environment,
            severity: 'error',
            error_message: err.message,
            raw_details: { stack: err.stack }
          });
      }
    } finally {
      this.isRunning = false;
      this.stopTimer();
      this.showProgress(false);
      this.updateRunButton(false);
      
      // Recargar historial
      await this.loadRunHistory();
      await this.loadStats();
    }
  }

  startTimer() {
    this.startTime = Date.now();
    this.elapsedTime = 0;
    
    const progressTime = this.querySelector('#progressTime');
    
    this.timerInterval = setInterval(() => {
      this.elapsedTime = Date.now() - this.startTime;
      if (progressTime) {
        progressTime.textContent = `${(this.elapsedTime / 1000).toFixed(1)}s`;
      }
    }, 100);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  showProgress(show) {
    const progress = this.querySelector('#testProgress');
    const progressFill = this.querySelector('#progressFill');
    
    if (progress) {
      progress.style.display = show ? 'block' : 'none';
    }
    
    if (progressFill && show) {
      progressFill.style.width = '0%';
      // Animate progress
      let width = 0;
      const interval = setInterval(() => {
        if (!this.isRunning || width >= 90) {
          clearInterval(interval);
          return;
        }
        width += Math.random() * 10;
        progressFill.style.width = `${Math.min(width, 90)}%`;
      }, 200);
    }
  }

  updateRunButton(running) {
    const btn = this.querySelector('#runTestBtn');
    if (!btn) return;
    
    if (running) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> <span>Ejecutando...</span>';
    } else {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-play"></i> <span>Ejecutar Test</span>';
    }
  }

  showResponse(statusCode, statusText, data) {
    const empty = this.querySelector('#responseEmpty');
    const content = this.querySelector('#responseContent');
    const statusEl = this.querySelector('#responseStatus');
    const timeEl = this.querySelector('#responseTime');
    const bodyEl = this.querySelector('#responseBody');
    const badge = this.querySelector('#responseBadge');
    
    if (empty) empty.style.display = 'none';
    if (content) content.style.display = 'block';
    
    // Status
    if (statusEl) {
      const isSuccess = statusCode >= 200 && statusCode < 300;
      statusEl.innerHTML = `
        <span class="status-code ${isSuccess ? 'success' : 'error'}">${statusCode}</span>
        <span class="status-text">${statusText}</span>
      `;
    }
    
    // Time
    if (timeEl) {
      timeEl.innerHTML = `<i class="ph ph-timer"></i> <span>${this.elapsedTime}ms</span>`;
    }
    
    // Body
    if (bodyEl) {
      const formatted = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
      bodyEl.textContent = formatted;
    }
    
    // Badge
    if (badge) {
      badge.style.display = 'inline-flex';
      badge.className = `tab-badge ${statusCode >= 200 && statusCode < 300 ? 'success' : 'error'}`;
      badge.textContent = statusCode;
    }
    
    // Switch to response tab
    this.switchTab('response');
  }

  addLog(severity, message) {
    const timestamp = new Date().toLocaleTimeString();
    
    this.logs.push({
      severity,
      message,
      timestamp
    });
    
    this.renderLogs();
    
    // Update badge
    const badge = this.querySelector('#logsBadge');
    if (badge) {
      const errorCount = this.logs.filter(l => l.severity === 'error').length;
      if (errorCount > 0) {
        badge.style.display = 'inline-flex';
        badge.className = 'tab-badge error';
        badge.textContent = errorCount;
      } else {
        badge.style.display = this.logs.length > 0 ? 'inline-flex' : 'none';
        badge.className = 'tab-badge';
        badge.textContent = this.logs.length;
      }
    }
  }

  renderLogs() {
    const container = this.querySelector('#logsList');
    if (!container) return;
    
    const filter = this.querySelector('#logSeverityFilter')?.value || 'all';
    const filtered = filter === 'all' ? this.logs : this.logs.filter(l => l.severity === filter);
    
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="logs-empty">
          <i class="ph ph-note"></i>
          <p>Sin logs registrados</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = filtered.map(log => `
      <div class="log-item ${log.severity}">
        <span class="log-time">${log.timestamp}</span>
        <span class="log-severity ${log.severity}">
          <i class="ph ph-${this.getLogIcon(log.severity)}"></i>
        </span>
        <span class="log-message">${log.message}</span>
      </div>
    `).join('');
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  getLogIcon(severity) {
    const icons = {
      info: 'info',
      success: 'check-circle',
      warning: 'warning',
      error: 'x-circle'
    };
    return icons[severity] || 'info';
  }

  async loadRunHistory() {
    if (!this.supabase || !this.selectedFlow) {
      this.renderHistory([]);
      return;
    }
    
    try {
      const { data, error } = await this.supabase
        .from('flow_runs')
        .select(`
          id,
          status,
          created_at,
          tokens_consumed,
          webhook_response_code
        `)
        .eq('flow_id', this.selectedFlow.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      
      this.runHistory = data || [];
      this.renderHistory(this.runHistory);
    } catch (err) {
      console.error('Error loading history:', err);
      this.renderHistory([]);
    }
  }

  renderHistory(runs) {
    const container = this.querySelector('#historyList');
    if (!container) return;
    
    if (runs.length === 0) {
      container.innerHTML = `
        <div class="history-empty">
          <i class="ph ph-clock"></i>
          <p>Sin ejecuciones previas</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = runs.map(run => {
      const date = new Date(run.created_at);
      const timeAgo = this.getTimeAgo(date);
      const statusIcon = this.getStatusIcon(run.status);
      const statusClass = this.getStatusClass(run.status);
      
      return `
        <div class="history-item ${statusClass}" data-run-id="${run.id}">
          <div class="history-status">
            <i class="ph ph-${statusIcon}"></i>
          </div>
          <div class="history-info">
            <div class="history-meta">
              <span class="history-code">${run.webhook_response_code || '-'}</span>
              <span class="history-time">${timeAgo}</span>
            </div>
            <div class="history-status-text">${this.getStatusLabel(run.status)}</div>
          </div>
          <button class="btn-icon-small view-run-btn" title="Ver detalles">
            <i class="ph ph-arrow-right"></i>
          </button>
        </div>
      `;
    }).join('');
    
    // Add click listeners
    container.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const runId = item.dataset.runId;
        this.showRunDetail(runId);
      });
    });
  }

  getStatusIcon(status) {
    const icons = {
      completed: 'check-circle',
      failed: 'x-circle',
      error: 'x-circle',
      running: 'spinner',
      pending: 'clock'
    };
    return icons[status] || 'circle';
  }

  getStatusClass(status) {
    const classes = {
      completed: 'success',
      failed: 'error',
      error: 'error',
      running: 'running',
      pending: 'pending'
    };
    return classes[status] || '';
  }

  getStatusLabel(status) {
    const labels = {
      completed: 'Completado',
      failed: 'Fallido',
      error: 'Error',
      running: 'Ejecutando',
      pending: 'Pendiente'
    };
    return labels[status] || status;
  }

  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'hace unos segundos';
    if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)}d`;
    
    return date.toLocaleDateString();
  }

  async showRunDetail(runId) {
    const run = this.runHistory.find(r => r.id === runId);
    if (!run) return;
    
    let runInputs = {};
    let logs = [];
    
    if (this.supabase) {
      const [inputsRes, logsRes] = await Promise.all([
        this.supabase
          .from('runs_inputs')
          .select('input_data')
          .eq('run_id', runId)
          .order('created_at', { ascending: true }),
        this.supabase
          .from('developer_logs')
          .select('*')
          .eq('run_id', runId)
          .order('created_at', { ascending: true })
      ]);
      
      const firstInput = inputsRes?.data?.[0];
      runInputs = (firstInput && firstInput.input_data) || {};
      logs = logsRes?.data || [];
    }
    
    const modal = this.querySelector('#runDetailModal');
    const body = this.querySelector('#runDetailBody');
    
    if (!modal || !body) return;
    
    const date = new Date(run.created_at);
    
    body.innerHTML = `
      <div class="run-detail">
        <div class="detail-section">
          <h4>Información General</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">ID</span>
              <span class="detail-value code">${run.id}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Estado</span>
              <span class="detail-value">
                <span class="status-badge ${this.getStatusClass(run.status)}">
                  ${this.getStatusLabel(run.status)}
                </span>
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Código HTTP</span>
              <span class="detail-value">${run.webhook_response_code || 'N/A'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Tokens</span>
              <span class="detail-value">${run.tokens_consumed || 0}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Fecha</span>
              <span class="detail-value">${date.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>Inputs Utilizados</h4>
          <pre class="detail-json">${JSON.stringify(runInputs, null, 2)}</pre>
        </div>
        
        ${logs.length > 0 ? `
          <div class="detail-section">
            <h4>Logs</h4>
            <div class="detail-logs">
              ${logs.map(log => `
                <div class="detail-log ${log.severity}">
                  <span class="log-severity">${log.severity}</span>
                  <span class="log-message">${log.error_message}</span>
                  <span class="log-time">${new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <div class="detail-actions">
          <button class="btn-secondary" id="rerunTestBtn">
            <i class="ph ph-arrow-counter-clockwise"></i>
            Re-ejecutar con estos inputs
          </button>
        </div>
      </div>
    `;
    
    const runWithInputs = { ...run, inputs_used: runInputs };
    body.querySelector('#rerunTestBtn')?.addEventListener('click', () => {
      this.loadInputsFromRun(runWithInputs);
      modal.style.display = 'none';
    });
    
    modal.style.display = 'flex';
  }

  loadInputsFromRun(run) {
    const inputData = run?.inputs_used;
    if (!inputData || typeof inputData !== 'object') return;
    
    const fields = this.selectedFlow?.input_schema?.fields || [];
    
    fields.forEach(field => {
      const value = inputData[field.key];
      const el = this.querySelector(`[name="${field.key}"]`);
      
      if (!el || value === undefined) return;
      
      if (el.type === 'checkbox') {
        el.checked = !!value;
      } else if (el.type === 'radio') {
        const radio = this.querySelector(`[name="${field.key}"][value="${value}"]`);
        if (radio) radio.checked = true;
      } else {
        el.value = value;
      }
      
      // Update range display
      if (el.type === 'range') {
        const display = el.parentElement.querySelector('.range-value');
        if (display) display.textContent = value;
      }
    });
    
    this.testInputs = { ...inputData };
    this.showNotification('Inputs cargados', 'success');
  }

  async loadStats() {
    if (!this.supabase || !this.selectedFlow) return;
    
    try {
      // Get all runs for this flow
      const { data: runs, error } = await this.supabase
        .from('flow_runs')
        .select('status, webhook_response_code, created_at')
        .eq('flow_id', this.selectedFlow.id);
      
      if (error) throw error;
      
      const total = runs?.length || 0;
      const successful = runs?.filter(r => r.status === 'completed').length || 0;
      const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
      
      // Get average execution time from technical details
      const avgTime = this.technicalDetails?.avg_execution_time_ms || 0;
      
      // Update UI
      const totalEl = this.querySelector('#statTotalRuns');
      const rateEl = this.querySelector('#statSuccessRate');
      const timeEl = this.querySelector('#statAvgTime');
      
      if (totalEl) totalEl.textContent = total;
      if (rateEl) rateEl.textContent = `${successRate}%`;
      if (timeEl) timeEl.textContent = avgTime > 0 ? `${avgTime}ms` : '-';
      
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }

  // Test Cases
  loadTestCases() {
    const stored = localStorage.getItem(`testCases_${this.userId}`);
    if (stored) {
      try {
        this.savedTestCases = JSON.parse(stored);
      } catch {
        this.savedTestCases = [];
      }
    }
    this.renderTestCases();
  }

  renderTestCases() {
    const container = this.querySelector('#testCasesList');
    if (!container) return;
    
    const flowCases = this.selectedFlow 
      ? this.savedTestCases.filter(tc => tc.flowId === this.selectedFlow.id)
      : [];
    
    if (flowCases.length === 0) {
      container.innerHTML = `
        <div class="empty-state small">
          <p>Sin test cases guardados</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = flowCases.map((tc, index) => `
      <div class="test-case-item" data-index="${index}">
        <div class="test-case-info">
          <span class="test-case-name">${tc.name}</span>
          ${tc.description ? `<span class="test-case-desc">${tc.description}</span>` : ''}
        </div>
        <div class="test-case-actions">
          <button class="btn-icon-small load-test-case" title="Cargar">
            <i class="ph ph-download"></i>
          </button>
          <button class="btn-icon-small delete-test-case" title="Eliminar">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
    
    // Listeners
    container.querySelectorAll('.load-test-case').forEach((btn, i) => {
      btn.addEventListener('click', () => this.loadTestCase(flowCases[i]));
    });
    
    container.querySelectorAll('.delete-test-case').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteTestCase(flowCases[i]);
      });
    });
  }

  showSaveTestCaseModal() {
    if (!this.selectedFlow) {
      this.showNotification('Selecciona un flujo primero', 'warning');
      return;
    }
    
    const modal = this.querySelector('#saveTestCaseModal');
    if (modal) {
      modal.style.display = 'flex';
      this.querySelector('#testCaseName')?.focus();
    }
  }

  saveTestCase() {
    const name = this.querySelector('#testCaseName')?.value?.trim();
    const description = this.querySelector('#testCaseDescription')?.value?.trim();
    
    if (!name) {
      this.showNotification('El nombre es requerido', 'warning');
      return;
    }
    
    const inputs = this.collectInputs();
    
    const testCase = {
      id: Date.now().toString(),
      flowId: this.selectedFlow.id,
      name,
      description,
      inputs,
      environment: this.environment,
      createdAt: new Date().toISOString()
    };
    
    this.savedTestCases.push(testCase);
    localStorage.setItem(`testCases_${this.userId}`, JSON.stringify(this.savedTestCases));
    
    this.querySelector('#saveTestCaseModal').style.display = 'none';
    this.querySelector('#testCaseName').value = '';
    this.querySelector('#testCaseDescription').value = '';
    
    this.renderTestCases();
    this.showNotification('Test case guardado', 'success');
  }

  loadTestCase(testCase) {
    if (!testCase.inputs) return;
    
    const fields = this.selectedFlow?.input_schema?.fields || [];
    
    fields.forEach(field => {
      const value = testCase.inputs[field.key];
      const el = this.querySelector(`[name="${field.key}"]`);
      
      if (!el || value === undefined) return;
      
      if (el.type === 'checkbox') {
        el.checked = !!value;
      } else if (el.type === 'radio') {
        const radio = this.querySelector(`[name="${field.key}"][value="${value}"]`);
        if (radio) radio.checked = true;
      } else {
        const isColores = field.type === 'colores' || field.input_type === 'colores';
        el.value = isColores && Array.isArray(value) ? value.join(',') : value;
      }
      
      if (el.type === 'range') {
        const display = el.parentElement.querySelector('.range-value');
        if (display) display.textContent = value;
      }
      if (field.type === 'colores' || field.input_type === 'colores') {
        const wrap = el.closest('.form-field')?.querySelector('.input-colors-wrap[data-colors-brand-style="1"]');
        if (wrap) {
          const max = Math.max(1, Math.min(12, parseInt(wrap.getAttribute('data-colors-max'), 10) || 6));
          const vals = (Array.isArray(value) ? value : String(value || '').split(',').map(s => s.trim()).filter(Boolean))
            .map(v => (v.startsWith('#') ? v : '#' + v).replace(/^#([0-9A-Fa-f]{6}).*/, '#$1'));
          wrap._colorsInit = false;
          wrap.innerHTML = vals.slice(0, max).map(hex =>
            `<div class="color-swatch" style="background:${hex};" data-hex="${hex}"><button type="button" class="color-delete-btn" title="Eliminar" aria-label="Eliminar color">×</button></div>`
          ).join('') + (vals.length < max
            ? '<button type="button" class="color-swatch-add-btn" title="Agregar color" aria-label="Agregar color"><span>+</span></button>'
            : '');
if (window.InputRegistry && window.InputRegistry.initColorsPicker) {
            window.InputRegistry.initColorsPicker(wrap.closest('#formFields') || wrap.parentElement);
          }
          if (window.InputRegistry && window.InputRegistry.initAspectRatioPicker) {
            window.InputRegistry.initAspectRatioPicker(wrap.closest('#formFields') || wrap.parentElement);
          }
        }
      }
      if (field.type === 'aspect_ratio' || field.input_type === 'aspect_ratio') {
        const grid = el.closest('.form-field')?.querySelector('.aspect-ratio-grid[data-aspect-ratio-picker="1"]');
        if (grid) {
          const val = String(value || '');
          grid.querySelectorAll('.aspect-ratio-card').forEach(btn => {
            const sel = btn.getAttribute('data-value') === val;
            btn.classList.toggle('selected', sel);
            btn.setAttribute('aria-pressed', sel ? 'true' : 'false');
          });
        }
      }
    });

    // Update environment
    if (testCase.environment) {
      this.setEnvironment(testCase.environment);
    }
    
    this.testInputs = { ...testCase.inputs };
    this.showNotification(`Test case "${testCase.name}" cargado`, 'success');
  }

  deleteTestCase(testCase) {
    if (!confirm(`¿Eliminar el test case "${testCase.name}"?`)) return;
    
    this.savedTestCases = this.savedTestCases.filter(tc => tc.id !== testCase.id);
    localStorage.setItem(`testCases_${this.userId}`, JSON.stringify(this.savedTestCases));
    
    this.renderTestCases();
    this.showNotification('Test case eliminado', 'success');
  }

  setEnvironment(env) {
    this.environment = env;
    
    this.querySelector('#envTestBtn')?.classList.toggle('active', env === 'test');
    this.querySelector('#envProdBtn')?.classList.toggle('active', env === 'prod');
    
    this.updateWebhookInfo();
  }

  switchTab(tabId) {
    this.querySelectorAll('.test-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    
    this.querySelectorAll('.test-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    });
  }

  clearInputs() {
    const fields = this.querySelectorAll('#formFields input, #formFields textarea, #formFields select');
    
    fields.forEach(field => {
      if (field.type === 'checkbox') {
        field.checked = false;
      } else if (field.type === 'radio') {
        // Reset to first option
        const first = this.querySelector(`[name="${field.name}"]`);
        if (first) first.checked = true;
      } else if (field.type === 'range') {
        const defaultVal = field.defaultValue || 50;
        field.value = defaultVal;
        const display = field.parentElement?.querySelector('.range-value');
        if (display) display.textContent = defaultVal;
      } else {
        field.value = '';
      }
    });
    
    this.testInputs = {};
    this.showNotification('Inputs limpiados', 'info');
  }

  clearLogs() {
    this.logs = [];
    this.renderLogs();
    
    const badge = this.querySelector('#logsBadge');
    if (badge) badge.style.display = 'none';
  }

  setupEventListeners() {
    // Flow selector
    const flowSelector = this.querySelector('#flowSelector');
    if (flowSelector) {
      flowSelector.addEventListener('change', (e) => this.selectFlow(e.target.value));
    }
    
    // Refresh flows
    const refreshFlowsBtn = this.querySelector('#refreshFlowsBtn');
    if (refreshFlowsBtn) {
      refreshFlowsBtn.addEventListener('click', () => {
        this.loadFlows();
        this.showNotification('Flujos actualizados', 'info');
      });
    }
    
    // Environment toggle
    const envTestBtn = this.querySelector('#envTestBtn');
    const envProdBtn = this.querySelector('#envProdBtn');
    
    if (envTestBtn) {
      envTestBtn.addEventListener('click', () => this.setEnvironment('test'));
    }
    if (envProdBtn) {
      envProdBtn.addEventListener('click', () => this.setEnvironment('prod'));
    }
    
    // Run test
    const runTestBtn = this.querySelector('#runTestBtn');
    if (runTestBtn) {
      runTestBtn.addEventListener('click', () => this.runTest());
    }
    
    // Clear inputs
    const clearInputsBtn = this.querySelector('#clearInputsBtn');
    if (clearInputsBtn) {
      clearInputsBtn.addEventListener('click', () => this.clearInputs());
    }
    
    // Tabs
    this.querySelectorAll('.test-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
    
    // Log filter
    const logFilter = this.querySelector('#logSeverityFilter');
    if (logFilter) {
      logFilter.addEventListener('change', () => this.renderLogs());
    }
    
    // Clear logs
    const clearLogsBtn = this.querySelector('#clearLogsBtn');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => this.clearLogs());
    }
    
    // Refresh history
    const refreshHistoryBtn = this.querySelector('#refreshHistoryBtn');
    if (refreshHistoryBtn) {
      refreshHistoryBtn.addEventListener('click', () => this.loadRunHistory());
    }
    
    // Copy response
    const copyResponseBtn = this.querySelector('#copyResponseBtn');
    if (copyResponseBtn) {
      copyResponseBtn.addEventListener('click', () => {
        const body = this.querySelector('#responseBody')?.textContent;
        if (body) {
          navigator.clipboard.writeText(body).then(() => {
            this.showNotification('Respuesta copiada', 'success');
          });
        }
      });
    }
    
    // Expand response
    const expandResponseBtn = this.querySelector('#expandResponseBtn');
    if (expandResponseBtn) {
      expandResponseBtn.addEventListener('click', () => {
        const body = this.querySelector('#responseBody')?.textContent;
        const expandedEl = this.querySelector('#expandedResponse');
        const modal = this.querySelector('#expandResponseModal');
        
        if (body && expandedEl && modal) {
          expandedEl.textContent = body;
          modal.style.display = 'flex';
        }
      });
    }
    
    // Save test case
    const saveTestCaseBtn = this.querySelector('#saveTestCaseBtn');
    if (saveTestCaseBtn) {
      saveTestCaseBtn.addEventListener('click', () => this.showSaveTestCaseModal());
    }
    
    // Modal listeners
    this.setupModalListeners();
  }

  setupModalListeners() {
    // Save test case modal
    const saveModal = this.querySelector('#saveTestCaseModal');
    const closeSaveModal = this.querySelector('#closeSaveModal');
    const cancelSaveBtn = this.querySelector('#cancelSaveBtn');
    const confirmSaveBtn = this.querySelector('#confirmSaveBtn');
    
    if (saveModal) {
      if (closeSaveModal) {
        closeSaveModal.addEventListener('click', () => saveModal.style.display = 'none');
      }
      if (cancelSaveBtn) {
        cancelSaveBtn.addEventListener('click', () => saveModal.style.display = 'none');
      }
      if (confirmSaveBtn) {
        confirmSaveBtn.addEventListener('click', () => this.saveTestCase());
      }
      saveModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        saveModal.style.display = 'none';
      });
    }
    
    // Run detail modal
    const runModal = this.querySelector('#runDetailModal');
    const closeRunModal = this.querySelector('#closeRunModal');
    
    if (runModal) {
      if (closeRunModal) {
        closeRunModal.addEventListener('click', () => runModal.style.display = 'none');
      }
      runModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        runModal.style.display = 'none';
      });
    }
    
    // Expand response modal
    const expandModal = this.querySelector('#expandResponseModal');
    const closeExpandModal = this.querySelector('#closeExpandModal');
    
    if (expandModal) {
      if (closeExpandModal) {
        closeExpandModal.addEventListener('click', () => expandModal.style.display = 'none');
      }
      expandModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        expandModal.style.display = 'none';
      });
    }
  }

  showNotification(message, type = 'info') {
    const existing = document.querySelector('.dev-test-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `dev-test-notification ${type}`;
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

window.DevTestView = DevTestView;
