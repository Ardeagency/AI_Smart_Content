/**
 * DevWebhooksView.js
 * Gestión de Webhooks para el Portal de Desarrolladores (PaaS)
 *
 * - Ver y gestionar webhooks de todos sus flujos
 * - Configurar URLs de test y producción
 * - Health check: verificación de conectividad/disponibilidad (ping HTTP 2xx = saludable)
 * - Rate limiting en chequeo masivo para no saturar endpoints
 * - Opción de auto-refresh periódico (solo mientras la vista está abierta; alertas 24/7 requieren servicio en servidor)
 */

const PLATFORM_OPTIONS = [
  { value: 'n8n', label: 'n8n' },
  { value: 'make', label: 'Make (Integromat)' },
  { value: 'zapier', label: 'Zapier' },
  { value: 'custom', label: 'Custom / Otro' }
];

const PLATFORM_ICONS = {
  n8n: 'graph',
  make: 'arrows-merge',
  zapier: 'lightning',
  custom: 'code'
};

const BULK_HEALTH_CHECK_DELAY_MS = 500;
const HEALTH_CHECK_SUCCESS_STATUS_MIN = 200;
const HEALTH_CHECK_SUCCESS_STATUS_MAX = 299;
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

class DevWebhooksView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;

    this.webhooks = [];
    this.filteredWebhooks = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.platformFilter = 'all';
    this.editingWebhook = null;
    this.healthCheckInProgress = new Set();
    this.autoRefreshTimerId = null;
  }

  renderHTML() {
    return `
      <div class="dev-webhooks-container">
        <!-- Header -->
        <header class="dev-webhooks-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title">
              <i class="ph ph-webhooks-logo"></i>
              Webhooks Manager
            </h1>
            <p class="dev-header-subtitle">Gestiona las conexiones de tus flujos de IA</p>
          </div>
          <div class="dev-header-actions">
            <label class="dev-webhooks-auto-refresh">
              <span>Auto-refresh salud:</span>
              <select id="autoRefreshSelect" class="auto-refresh-select">
                <option value="0">Desactivado</option>
                <option value="300">5 min</option>
                <option value="600">10 min</option>
              </select>
            </label>
            <button class="btn-secondary" id="bulkHealthCheckBtn">
              <i class="ph ph-heartbeat"></i>
              Health Check Global
            </button>
            <button class="btn-primary" id="addWebhookBtn">
              <i class="ph ph-plus"></i>
              Configurar Nuevo
            </button>
          </div>
        </header>
        <p class="dev-webhooks-monitoring-note" id="monitoringNote">
          <i class="ph ph-info"></i> El health check verifica conectividad (HTTP 2xx). Para alertas 24/7 se requiere un servicio en el servidor.
        </p>

        <!-- Stats Overview -->
        <div class="webhooks-stats-grid">
          <div class="webhook-stat-card">
            <div class="stat-icon total">
              <i class="ph ph-link"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value" id="statTotal">0</span>
              <span class="stat-label">Total Webhooks</span>
            </div>
          </div>
          <div class="webhook-stat-card">
            <div class="stat-icon healthy">
              <i class="ph ph-check-circle"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value" id="statHealthy">0</span>
              <span class="stat-label">Saludables</span>
            </div>
          </div>
          <div class="webhook-stat-card">
            <div class="stat-icon unhealthy">
              <i class="ph ph-warning-circle"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value" id="statUnhealthy">0</span>
              <span class="stat-label">Con Problemas</span>
            </div>
          </div>
          <div class="webhook-stat-card">
            <div class="stat-icon unconfigured">
              <i class="ph ph-question"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value" id="statUnconfigured">0</span>
              <span class="stat-label">Sin Configurar</span>
            </div>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="webhooks-toolbar">
          <div class="webhooks-filters">
            <button class="filter-btn active" data-filter="all">
              <i class="ph ph-squares-four"></i>
              Todos
            </button>
            <button class="filter-btn" data-filter="healthy">
              <i class="ph ph-check-circle"></i>
              Saludables
            </button>
            <button class="filter-btn" data-filter="unhealthy">
              <i class="ph ph-warning"></i>
              Con Problemas
            </button>
            <button class="filter-btn" data-filter="unconfigured">
              <i class="ph ph-question"></i>
              Sin Configurar
            </button>
          </div>
          <div class="webhooks-search-area">
            <div class="webhooks-search">
              <i class="ph ph-magnifying-glass"></i>
              <input type="text" id="webhookSearchInput" placeholder="Buscar por nombre o URL...">
            </div>
            <select id="platformFilterSelect" class="platform-filter">
              <option value="all">Todas las plataformas</option>
              ${PLATFORM_OPTIONS.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Webhooks Table -->
        <div class="dev-table-container">
          <table class="dev-table" id="webhooksTable">
            <thead>
              <tr>
                <th class="col-flow">Flujo</th>
                <th class="col-platform">Plataforma</th>
                <th class="col-webhook">Webhook Test</th>
                <th class="col-webhook">Webhook Prod</th>
                <th class="col-status">Estado</th>
                <th class="col-stats">Estadísticas</th>
                <th class="col-actions">Acciones</th>
              </tr>
            </thead>
            <tbody id="webhooksTableBody">
              <tr class="loading-row">
                <td colspan="7">
                  <div class="table-loading">
                    <i class="ph ph-spinner ph-spin"></i>
                    <span>Cargando webhooks...</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Empty State -->
        <div class="webhooks-empty" id="webhooksEmpty" style="display: none;">
          <i class="ph ph-webhooks-logo"></i>
          <h3>Sin webhooks configurados</h3>
          <p>Configura webhooks para conectar tus flujos de IA</p>
          <button class="btn-primary" id="emptyAddBtn">
            <i class="ph ph-plus"></i>
            Configurar Primer Webhook
          </button>
        </div>
      </div>

      <!-- Modal: Editar/Crear Webhook -->
      <div class="modal" id="webhookModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3 id="webhookModalTitle">
              <i class="ph ph-gear"></i>
              Configurar Webhook
            </h3>
            <button class="modal-close" id="closeWebhookModal">&times;</button>
          </div>
          <div class="modal-body">
            <form id="webhookForm">
              <!-- Selector de Flujo (solo para nuevos) -->
              <div class="form-section" id="flowSelectorSection">
                <h4>Flujo</h4>
                <div class="form-field">
                  <label for="webhookFlowSelect">Seleccionar Flujo</label>
                  <select id="webhookFlowSelect" required>
                    <option value="">Seleccionar flujo...</option>
                  </select>
                </div>
              </div>

              <!-- Plataforma -->
              <div class="form-section">
                <h4>Plataforma de Automatización</h4>
                <div class="form-row">
                  <div class="form-field">
                    <label for="webhookPlatform">Plataforma</label>
                    <select id="webhookPlatform">
                      ${PLATFORM_OPTIONS.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-field">
                    <label for="webhookMethod">Método HTTP</label>
                    <select id="webhookMethod">
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                      <option value="PUT">PUT</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- URLs de Webhook -->
              <div class="form-section">
                <h4>URLs de Webhook</h4>
                
                <div class="form-field webhook-url-field">
                  <label for="webhookUrlTest">
                    <i class="ph ph-flask"></i>
                    URL de Test
                  </label>
                  <div class="url-input-group">
                    <input type="url" id="webhookUrlTest" placeholder="https://tu-n8n.com/webhook-test/...">
                    <button type="button" class="btn-icon test-url-btn" data-env="test" title="Probar conexión">
                      <i class="ph ph-play"></i>
                    </button>
                  </div>
                  <span class="field-help">URL para pruebas durante desarrollo</span>
                </div>

                <div class="form-field webhook-url-field">
                  <label for="webhookUrlProd">
                    <i class="ph ph-globe"></i>
                    URL de Producción
                  </label>
                  <div class="url-input-group">
                    <input type="url" id="webhookUrlProd" placeholder="https://tu-n8n.com/webhook/...">
                    <button type="button" class="btn-icon test-url-btn" data-env="prod" title="Probar conexión">
                      <i class="ph ph-play"></i>
                    </button>
                  </div>
                  <span class="field-help">URL para usuarios en producción</span>
                </div>
              </div>

              <!-- Configuración Adicional -->
              <div class="form-section">
                <h4>Configuración Adicional</h4>
                
                <div class="form-row">
                  <div class="form-field">
                    <label for="webhookFlowId">ID del Flujo en Plataforma</label>
                    <input type="text" id="webhookFlowId" placeholder="workflow_abc123">
                    <span class="field-help">Identificador del flujo en n8n/Make</span>
                  </div>
                  <div class="form-field">
                    <label for="webhookFlowName">Nombre en Plataforma</label>
                    <input type="text" id="webhookFlowName" placeholder="Mi Flujo de Contenido">
                  </div>
                </div>

                <div class="form-field">
                  <label for="webhookEditorUrl">URL del Editor</label>
                  <input type="url" id="webhookEditorUrl" placeholder="https://tu-n8n.com/workflow/123">
                  <span class="field-help">Link directo para editar el flujo en la plataforma</span>
                </div>

                <div class="form-field">
                  <label for="webhookCredentialId">ID de Credencial (opcional)</label>
                  <input type="text" id="webhookCredentialId" placeholder="cred_xyz789">
                  <span class="field-help">Para referencia de credenciales API</span>
                </div>
              </div>
            </form>

            <!-- Test Results -->
            <div class="test-results-panel" id="testResultsPanel" style="display: none;">
              <h4><i class="ph ph-terminal"></i> Resultado del Test</h4>
              <div class="test-result" id="testResult">
                <!-- Resultado dinámico -->
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="cancelWebhookBtn">Cancelar</button>
            <button class="btn-primary" id="saveWebhookBtn">
              <i class="ph ph-floppy-disk"></i>
              Guardar
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Health Check Results -->
      <div class="modal" id="healthCheckModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-md">
          <div class="modal-header">
            <h3><i class="ph ph-heartbeat"></i> Health Check Global</h3>
            <button class="modal-close" id="closeHealthModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="health-check-progress" id="healthCheckProgress">
              <div class="progress-bar">
                <div class="progress-fill" id="healthProgressFill"></div>
              </div>
              <p class="progress-text" id="healthProgressText">Verificando webhooks...</p>
            </div>
            <div class="health-check-results" id="healthCheckResults">
              <!-- Resultados dinámicos -->
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-primary" id="closeHealthBtn">Cerrar</button>
          </div>
        </div>
      </div>

      <!-- Modal: Confirmar Eliminación -->
      <div class="modal" id="deleteWebhookModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h3><i class="ph ph-warning"></i> Confirmar Eliminación</h3>
            <button class="modal-close" id="closeDeleteModal">&times;</button>
          </div>
          <div class="modal-body">
            <p>¿Estás seguro de que deseas eliminar la configuración de webhook para este flujo?</p>
            <p class="text-muted">El flujo seguirá existiendo, solo se eliminarán los detalles técnicos.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="cancelDeleteBtn">Cancelar</button>
            <button class="btn-danger" id="confirmDeleteBtn">
              <i class="ph ph-trash"></i>
              Eliminar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    await this.initSupabase();
    await this.loadWebhooks();
    this.setupEventListeners();
  }

  onLeave() {
    if (this.autoRefreshTimerId) {
      clearInterval(this.autoRefreshTimerId);
      this.autoRefreshTimerId = null;
    }
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

  async loadWebhooks() {
    if (!this.supabase || !this.userId) return;
    
    try {
      // Cargar flujos con sus módulos (URLs en flow_modules) y detalles técnicos (flow_technical_details por flow_module_id)
      const { data: flows, error } = await this.supabase
        .from('content_flows')
        .select(`
          id,
          name,
          status,
          run_count,
          flow_modules (
            id,
            name,
            step_order,
            webhook_url_test,
            webhook_url_prod,
            flow_technical_details (
              id,
              platform_name,
              platform_flow_id,
              platform_flow_name,
              editor_url,
              credential_id,
              is_healthy,
              last_health_check,
              avg_execution_time_ms
            )
          )
        `)
        .eq('owner_id', this.userId)
        .order('name', { ascending: true });
      
      if (error) throw error;
      
      // Una fila por flujo (primer módulo); URLs vienen de flow_modules, resto de flow_technical_details
      this.webhooks = (flows || []).map(flow => {
        const module = flow.flow_modules?.[0] || null;
        const tech = module?.flow_technical_details?.[0] || null;
        const webhookTest = module?.webhook_url_test;
        const webhookProd = module?.webhook_url_prod;
        const isConfigured = !!(webhookTest || webhookProd);
        return {
          flowId: flow.id,
          flowName: flow.name,
          flowStatus: flow.status,
          runCount: flow.run_count || 0,
          moduleId: module?.id || null,
          moduleName: module?.name || 'default',
          technical: {
            ...(tech || {}),
            id: tech?.id,
            flow_module_id: module?.id,
            webhook_url_test: webhookTest,
            webhook_url_prod: webhookProd,
            platform_name: tech?.platform_name || 'n8n',
            platform_flow_id: tech?.platform_flow_id,
            platform_flow_name: tech?.platform_flow_name,
            editor_url: tech?.editor_url,
            credential_id: tech?.credential_id,
            is_healthy: tech?.is_healthy,
            last_health_check: tech?.last_health_check,
            avg_execution_time_ms: tech?.avg_execution_time_ms
          },
          _isConfigured: isConfigured
        };
      });
      
      this.applyFilters();
      this.updateStats();
      
    } catch (err) {
      console.error('Error loading webhooks:', err);
      this.showNotification('Error al cargar webhooks', 'error');
    }
  }

  applyFilters() {
    let filtered = [...this.webhooks];
    
    if (this.currentFilter === 'healthy') {
      filtered = filtered.filter(w => w.technical?.is_healthy === true);
    } else if (this.currentFilter === 'unhealthy') {
      filtered = filtered.filter(w => w.technical?.is_healthy === false);
    } else if (this.currentFilter === 'unconfigured') {
      filtered = filtered.filter(w => !w.technical?.webhook_url_test && !w.technical?.webhook_url_prod);
    }
    
    // Filtro de plataforma
    if (this.platformFilter !== 'all') {
      filtered = filtered.filter(w => w.technical?.platform_name === this.platformFilter);
    }
    
    // Búsqueda
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(w => 
        w.flowName.toLowerCase().includes(query) ||
        w.technical?.webhook_url_test?.toLowerCase().includes(query) ||
        w.technical?.webhook_url_prod?.toLowerCase().includes(query) ||
        w.technical?.platform_flow_name?.toLowerCase().includes(query)
      );
    }
    
    this.filteredWebhooks = filtered;
    this.renderTable();
  }

  updateStats() {
    const total = this.webhooks.length;
    const healthy = this.webhooks.filter(w => w.technical?.is_healthy === true).length;
    const unhealthy = this.webhooks.filter(w => w.technical?.is_healthy === false).length;
    const unconfigured = this.webhooks.filter(w => !w.technical?.webhook_url_test && !w.technical?.webhook_url_prod).length;
    
    this.querySelector('#statTotal').textContent = total;
    this.querySelector('#statHealthy').textContent = healthy;
    this.querySelector('#statUnhealthy').textContent = unhealthy;
    this.querySelector('#statUnconfigured').textContent = unconfigured;
  }

  renderTable() {
    const tbody = this.querySelector('#webhooksTableBody');
    const emptyState = this.querySelector('#webhooksEmpty');
    const tableContainer = this.querySelector('.dev-table-container');
    
    if (!tbody) return;
    
    if (this.filteredWebhooks.length === 0) {
      if (tableContainer) tableContainer.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    
    if (tableContainer) tableContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    tbody.innerHTML = this.filteredWebhooks.map(webhook => this.renderTableRow(webhook)).join('');
    
    this.setupTableListeners();
  }

  renderTableRow(webhook) {
    const tech = webhook.technical;
    const hasTest = tech?.webhook_url_test;
    const hasProd = tech?.webhook_url_prod;
    const isConfigured = hasTest || hasProd;
    
    // Estado de salud
    let healthStatus = 'unconfigured';
    let healthIcon = 'question';
    let healthText = 'Sin configurar';
    
    if (isConfigured) {
      if (tech.is_healthy === true) {
        healthStatus = 'healthy';
        healthIcon = 'check-circle';
        healthText = 'Saludable';
      } else if (tech.is_healthy === false) {
        healthStatus = 'unhealthy';
        healthIcon = 'warning';
        healthText = 'Con problemas';
      } else {
        healthStatus = 'unknown';
        healthIcon = 'circle';
        healthText = 'Sin verificar';
      }
    }
    
    const platformIcon = PLATFORM_ICONS[tech?.platform_name] || 'link';
    const platformName = tech?.platform_name || '-';
    
    // Truncar URLs
    const truncateUrl = (url, max = 35) => {
      if (!url) return '-';
      return url.length > max ? url.substring(0, max) + '...' : url;
    };
    
    // Último check
    const lastCheck = tech?.last_health_check 
      ? this.getTimeAgo(new Date(tech.last_health_check))
      : 'Nunca';
    
    // Check en progreso
    const isChecking = this.healthCheckInProgress.has(webhook.flowId);
    
    return `
      <tr data-flow-id="${webhook.flowId}">
        <td class="col-flow">
          <div class="flow-cell">
            <span class="flow-name">${webhook.flowName}</span>
            <span class="flow-status status-${webhook.flowStatus || 'draft'}">
              ${webhook.flowStatus || 'draft'}
            </span>
          </div>
        </td>
        <td class="col-platform">
          <div class="platform-cell">
            <i class="ph ph-${platformIcon}"></i>
            <span>${platformName}</span>
          </div>
        </td>
        <td class="col-webhook">
          <div class="webhook-url-cell ${hasTest ? '' : 'empty'}">
            ${hasTest ? `
              <span class="url-text" title="${tech.webhook_url_test}">${truncateUrl(tech.webhook_url_test)}</span>
              <button class="btn-icon-tiny copy-url" data-url="${tech.webhook_url_test}" title="Copiar">
                <i class="ph ph-copy"></i>
              </button>
            ` : '<span class="no-url">No configurado</span>'}
          </div>
        </td>
        <td class="col-webhook">
          <div class="webhook-url-cell ${hasProd ? '' : 'empty'}">
            ${hasProd ? `
              <span class="url-text" title="${tech.webhook_url_prod}">${truncateUrl(tech.webhook_url_prod)}</span>
              <button class="btn-icon-tiny copy-url" data-url="${tech.webhook_url_prod}" title="Copiar">
                <i class="ph ph-copy"></i>
              </button>
            ` : '<span class="no-url">No configurado</span>'}
          </div>
        </td>
        <td class="col-status">
          <div class="health-status ${healthStatus}">
            <i class="ph ph-${isChecking ? 'spinner ph-spin' : healthIcon}"></i>
            <span>${isChecking ? 'Verificando...' : healthText}</span>
          </div>
          ${tech?.last_health_check ? `<span class="last-check">Último: ${lastCheck}</span>` : ''}
        </td>
        <td class="col-stats">
          <div class="stats-cell">
            <div class="stat-item">
              <i class="ph ph-play"></i>
              <span>${webhook.runCount} runs</span>
            </div>
            ${tech?.avg_execution_time_ms ? `
              <div class="stat-item">
                <i class="ph ph-timer"></i>
                <span>${tech.avg_execution_time_ms}ms</span>
              </div>
            ` : ''}
          </div>
        </td>
        <td class="col-actions">
          <div class="actions-cell">
            <button class="btn-icon-small health-check-btn" data-flow-id="${webhook.flowId}" title="Health Check" ${!isConfigured ? 'disabled' : ''}>
              <i class="ph ph-heartbeat"></i>
            </button>
            <button class="btn-icon-small edit-btn" data-flow-id="${webhook.flowId}" title="Editar">
              <i class="ph ph-pencil"></i>
            </button>
            ${tech?.editor_url ? `
              <a href="${tech.editor_url}" target="_blank" class="btn-icon-small" title="Abrir en plataforma">
                <i class="ph ph-arrow-square-out"></i>
              </a>
            ` : ''}
            ${tech ? `
              <button class="btn-icon-small delete-btn" data-flow-id="${webhook.flowId}" title="Eliminar configuración">
                <i class="ph ph-trash"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }

  setupTableListeners() {
    // Copy URL buttons
    this.querySelectorAll('.copy-url').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        navigator.clipboard.writeText(url).then(() => {
          this.showNotification('URL copiada', 'success');
        });
      });
    });
    
    // Health check buttons
    this.querySelectorAll('.health-check-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const flowId = btn.dataset.flowId;
        this.runHealthCheck(flowId);
      });
    });
    
    // Edit buttons
    this.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const flowId = btn.dataset.flowId;
        this.openEditModal(flowId);
      });
    });
    
    // Delete buttons
    this.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const flowId = btn.dataset.flowId;
        this.showDeleteModal(flowId);
      });
    });
  }

  async runHealthCheck(flowId) {
    const webhook = this.webhooks.find(w => w.flowId === flowId);
    if (!webhook || !webhook.technical) return;
    
    const tech = webhook.technical;
    const testUrl = tech.webhook_url_test;
    const prodUrl = tech.webhook_url_prod;
    
    if (!testUrl && !prodUrl) {
      this.showNotification('No hay URLs configuradas', 'warning');
      return;
    }
    
    this.healthCheckInProgress.add(flowId);
    this.renderTable();
    
    let isHealthy = true;
    let results = [];
    
    const method = tech.webhook_method || 'POST';
    if (testUrl) {
      try {
        const result = await this.pingWebhook(testUrl, method);
        results.push({ env: 'test', ...result });
        if (!result.success) isHealthy = false;
      } catch {
        results.push({ env: 'test', success: false, error: 'Error de conexión' });
        isHealthy = false;
      }
    }
    
    if (prodUrl) {
      try {
        const result = await this.pingWebhook(prodUrl, method);
        results.push({ env: 'prod', ...result });
        if (!result.success) isHealthy = false;
      } catch {
        results.push({ env: 'prod', success: false, error: 'Error de conexión' });
        isHealthy = false;
      }
    }
    
    // Actualizar en BD
    if (this.supabase && tech.id) {
      await this.supabase
        .from('flow_technical_details')
        .update({
          is_healthy: isHealthy,
          last_health_check: new Date().toISOString()
        })
        .eq('id', tech.id);
    }
    
    // Actualizar estado local
    webhook.technical.is_healthy = isHealthy;
    webhook.technical.last_health_check = new Date().toISOString();
    
    this.healthCheckInProgress.delete(flowId);
    this.renderTable();
    this.updateStats();
    
    // Notificación
    if (isHealthy) {
      this.showNotification('Webhook saludable', 'success');
    } else {
      this.showNotification('Problemas detectados en webhook', 'error');
    }
  }

  /**
   * Health check: verificación de conectividad/disponibilidad (ping HTTP).
   * Se considera saludable solo si el status está en rango 2xx; no valida lógica de negocio del flujo.
   */
  _isHealthyStatus(status) {
    if (status == null || typeof status !== 'number') return false;
    return status >= HEALTH_CHECK_SUCCESS_STATUS_MIN && status <= HEALTH_CHECK_SUCCESS_STATUS_MAX;
  }

  async pingWebhook(url, method = 'POST') {
    if (window.FlowWebhookService && typeof window.FlowWebhookService.pingWebhook === 'function') {
      const out = await window.FlowWebhookService.pingWebhook(url, method, 10000);
      if (out && typeof out.success === 'boolean' && out.status != null) {
        out.success = this._isHealthyStatus(out.status) ? out.success : false;
      }
      return out;
    }
    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        method: method === 'GET' ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'GET' ? JSON.stringify({ _ping: true, timestamp: new Date().toISOString() }) : undefined
      });
      const elapsed = Date.now() - startTime;
      const status = response.status;
      return {
        success: this._isHealthyStatus(status),
        status,
        statusText: response.statusText,
        time: elapsed
      };
    } catch (err) {
      return { success: false, error: err.message, time: Date.now() - startTime };
    }
  }

  /**
   * Health check masivo con rate limiting (BULK_HEALTH_CHECK_DELAY_MS entre cada uno).
   * @param {Object} [options]
   * @param {boolean} [options.silent=false] - Si true, no muestra modal (para auto-refresh en segundo plano).
   */
  async runBulkHealthCheck(options = {}) {
    const { silent = false } = options;
    const configuredWebhooks = this.webhooks.filter(w =>
      w.technical?.webhook_url_test || w.technical?.webhook_url_prod
    );

    if (configuredWebhooks.length === 0) {
      if (!silent) this.showNotification('No hay webhooks configurados para verificar', 'warning');
      return;
    }

    const modal = this.querySelector('#healthCheckModal');
    const progressFill = this.querySelector('#healthProgressFill');
    const progressText = this.querySelector('#healthProgressText');
    const resultsContainer = this.querySelector('#healthCheckResults');

    if (!silent) {
      if (modal) modal.style.display = 'flex';
      if (resultsContainer) resultsContainer.innerHTML = '';
    }

    const results = [];
    const total = configuredWebhooks.length;

    for (let i = 0; i < configuredWebhooks.length; i++) {
      const webhook = configuredWebhooks[i];
      if (!silent) {
        const progress = ((i + 1) / total) * 100;
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `Verificando ${webhook.flowName}... (${i + 1}/${total})`;
      }
      await this.runHealthCheck(webhook.flowId);
      const updatedWebhook = this.webhooks.find(w => w.flowId === webhook.flowId);
      results.push({ name: webhook.flowName, healthy: updatedWebhook?.technical?.is_healthy });
      await new Promise(resolve => setTimeout(resolve, BULK_HEALTH_CHECK_DELAY_MS));
    }

    this.renderTable();
    this.updateStats();

    if (!silent) {
      if (progressText) progressText.textContent = '¡Verificación completada!';
      const healthyCount = results.filter(r => r.healthy).length;
      const unhealthyCount = results.filter(r => !r.healthy).length;
      if (resultsContainer) {
        resultsContainer.innerHTML = `
          <div class="health-summary">
            <div class="health-summary-item success">
              <i class="ph ph-check-circle"></i>
              <span>${healthyCount} saludables</span>
            </div>
            <div class="health-summary-item error">
              <i class="ph ph-warning"></i>
              <span>${unhealthyCount} con problemas</span>
            </div>
          </div>
          <div class="health-results-list">
            ${results.map(r => `
              <div class="health-result-item ${r.healthy ? 'success' : 'error'}">
                <i class="ph ph-${r.healthy ? 'check-circle' : 'x-circle'}"></i>
                <span>${r.name}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    }
  }

  openEditModal(flowId = null) {
    const webhook = flowId ? this.webhooks.find(w => w.flowId === flowId) : null;
    this.editingWebhook = webhook;
    
    const modal = this.querySelector('#webhookModal');
    const title = this.querySelector('#webhookModalTitle');
    const flowSelectorSection = this.querySelector('#flowSelectorSection');
    const flowSelect = this.querySelector('#webhookFlowSelect');
    
    // Título
    if (title) {
      title.innerHTML = webhook 
        ? `<i class="ph ph-pencil"></i> Editar Webhook - ${webhook.flowName}`
        : '<i class="ph ph-plus"></i> Configurar Nuevo Webhook';
    }
    
    // Mostrar/ocultar selector de flujo
    if (flowSelectorSection) {
      flowSelectorSection.style.display = webhook ? 'none' : 'block';
    }
    
    // Poblar selector de flujos (solo los que no tienen config)
    if (!webhook && flowSelect) {
      const unconfiguredFlows = this.webhooks.filter(w => !w.technical);
      flowSelect.innerHTML = '<option value="">Seleccionar flujo...</option>' +
        unconfiguredFlows.map(f => `<option value="${f.flowId}">${f.flowName}</option>`).join('');
    }
    
    // Poblar formulario
    if (webhook && webhook.technical) {
      const tech = webhook.technical;
      this.querySelector('#webhookPlatform').value = tech.platform_name || 'n8n';
      this.querySelector('#webhookMethod').value = tech.webhook_method || 'POST';
      this.querySelector('#webhookUrlTest').value = tech.webhook_url_test || '';
      this.querySelector('#webhookUrlProd').value = tech.webhook_url_prod || '';
      this.querySelector('#webhookFlowId').value = tech.platform_flow_id || '';
      this.querySelector('#webhookFlowName').value = tech.platform_flow_name || '';
      this.querySelector('#webhookEditorUrl').value = tech.editor_url || '';
      this.querySelector('#webhookCredentialId').value = tech.credential_id || '';
    } else {
      // Limpiar formulario
      this.querySelector('#webhookForm')?.reset();
    }
    
    // Ocultar resultados de test
    const testPanel = this.querySelector('#testResultsPanel');
    if (testPanel) testPanel.style.display = 'none';
    
    if (modal) modal.style.display = 'flex';
  }

  async saveWebhook() {
    const isNew = !this.editingWebhook;
    let flowId = this.editingWebhook?.flowId;
    const moduleId = this.editingWebhook?.moduleId;
    
    if (isNew) {
      flowId = this.querySelector('#webhookFlowSelect')?.value;
      if (!flowId) {
        this.showNotification('Selecciona un flujo', 'warning');
        return;
      }
    }
    
    const webhookUrlTest = this.querySelector('#webhookUrlTest')?.value?.trim() || null;
    const webhookUrlProd = this.querySelector('#webhookUrlProd')?.value?.trim() || null;
    if (!webhookUrlTest && !webhookUrlProd) {
      this.showNotification('Configura al menos una URL de webhook', 'warning');
      return;
    }
    
    const techData = {
      platform_name: this.querySelector('#webhookPlatform')?.value || 'n8n',
      platform_flow_id: this.querySelector('#webhookFlowId')?.value || null,
      platform_flow_name: this.querySelector('#webhookFlowName')?.value || null,
      editor_url: this.querySelector('#webhookEditorUrl')?.value || null,
      credential_id: this.querySelector('#webhookCredentialId')?.value || null
    };
    
    const saveBtn = this.querySelector('#saveWebhookBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';
    }
    
    try {
      let targetModuleId = moduleId;
      
      if (moduleId) {
        await this.supabase
          .from('flow_modules')
          .update({
            webhook_url_test: webhookUrlTest,
            webhook_url_prod: webhookUrlProd
          })
          .eq('id', moduleId);
        if (this.editingWebhook?.technical?.id) {
          await this.supabase
            .from('flow_technical_details')
            .update(techData)
            .eq('id', this.editingWebhook.technical.id);
        } else {
          await this.supabase
            .from('flow_technical_details')
            .insert({ ...techData, flow_module_id: moduleId });
        }
      } else {
        const { data: existing } = await this.supabase
          .from('flow_modules')
          .select('id')
          .eq('content_flow_id', flowId)
          .limit(1);
        
        if (existing?.[0]?.id) {
          targetModuleId = existing[0].id;
          await this.supabase
            .from('flow_modules')
            .update({
              webhook_url_test: webhookUrlTest,
              webhook_url_prod: webhookUrlProd
            })
            .eq('id', targetModuleId);
        } else {
          const { data: inserted, error: insErr } = await this.supabase
            .from('flow_modules')
            .insert({
              content_flow_id: flowId,
              name: 'default',
              step_order: 1,
              webhook_url_test: webhookUrlTest,
              webhook_url_prod: webhookUrlProd
            })
            .select('id')
            .single();
          if (insErr) throw insErr;
          targetModuleId = inserted?.id;
        }
        await this.supabase
          .from('flow_technical_details')
          .upsert({ ...techData, flow_module_id: targetModuleId }, { onConflict: 'flow_module_id' });
      }
      
      this.showNotification('Webhook guardado correctamente', 'success');
      this.querySelector('#webhookModal').style.display = 'none';
      await this.loadWebhooks();
      
    } catch (err) {
      console.error('Error saving webhook:', err);
      this.showNotification('Error al guardar webhook', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Guardar';
      }
    }
  }

  async testWebhookUrl(env) {
    const urlInput = env === 'test' 
      ? this.querySelector('#webhookUrlTest')
      : this.querySelector('#webhookUrlProd');
    
    const url = urlInput?.value;
    
    if (!url) {
      this.showNotification('Ingresa una URL primero', 'warning');
      return;
    }
    
    const method = this.querySelector('#webhookMethod')?.value || 'POST';
    const testPanel = this.querySelector('#testResultsPanel');
    const testResult = this.querySelector('#testResult');
    
    if (testPanel) testPanel.style.display = 'block';
    if (testResult) {
      testResult.innerHTML = `
        <div class="test-loading">
          <i class="ph ph-spinner ph-spin"></i>
          <span>Probando conexión...</span>
        </div>
      `;
    }
    
    try {
      const result = await this.pingWebhook(url, method);
      
      if (testResult) {
        testResult.innerHTML = `
          <div class="test-result-item ${result.success ? 'success' : 'error'}">
            <div class="result-header">
              <i class="ph ph-${result.success ? 'check-circle' : 'x-circle'}"></i>
              <span class="result-status">${result.success ? 'Conexión exitosa' : 'Error de conexión'}</span>
            </div>
            <div class="result-details">
              ${result.status ? `<span>HTTP ${result.status} ${result.statusText || ''}</span>` : ''}
              <span>Tiempo: ${result.time}ms</span>
              ${result.error ? `<span class="error-msg">${result.error}</span>` : ''}
            </div>
          </div>
        `;
      }
    } catch (err) {
      if (testResult) {
        testResult.innerHTML = `
          <div class="test-result-item error">
            <i class="ph ph-x-circle"></i>
            <span>Error: ${err.message}</span>
          </div>
        `;
      }
    }
  }

  showDeleteModal(flowId) {
    this.editingWebhook = this.webhooks.find(w => w.flowId === flowId);
    
    const modal = this.querySelector('#deleteWebhookModal');
    if (modal) modal.style.display = 'flex';
  }

  async confirmDelete() {
    const editing = this.editingWebhook;
    if (!editing) {
      this.querySelector('#deleteWebhookModal').style.display = 'none';
      return;
    }
    
    try {
      if (editing.technical?.id) {
        const { error } = await this.supabase
          .from('flow_technical_details')
          .delete()
          .eq('id', editing.technical.id);
        if (error) throw error;
      }
      if (editing.moduleId) {
        await this.supabase
          .from('flow_modules')
          .update({ webhook_url_test: null, webhook_url_prod: null })
          .eq('id', editing.moduleId);
      }
      
      this.showNotification('Configuración eliminada', 'success');
      this.querySelector('#deleteWebhookModal').style.display = 'none';
      await this.loadWebhooks();
      
    } catch (err) {
      console.error('Error deleting webhook:', err);
      this.showNotification('Error al eliminar', 'error');
    }
  }

  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'hace unos segundos';
    if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)}d`;
    
    return date.toLocaleDateString();
  }

  setupEventListeners() {
    // Filtros
    this.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.applyFilters();
      });
    });
    
    // Búsqueda
    const searchInput = this.querySelector('#webhookSearchInput');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.searchQuery = e.target.value;
          this.applyFilters();
        }, 300);
      });
    }
    
    // Filtro de plataforma
    const platformFilter = this.querySelector('#platformFilterSelect');
    if (platformFilter) {
      platformFilter.addEventListener('change', (e) => {
        this.platformFilter = e.target.value;
        this.applyFilters();
      });
    }
    
    const bulkHealthBtn = this.querySelector('#bulkHealthCheckBtn');
    if (bulkHealthBtn) {
      bulkHealthBtn.addEventListener('click', () => this.runBulkHealthCheck());
    }

    const autoRefreshSelect = this.querySelector('#autoRefreshSelect');
    if (autoRefreshSelect) {
      autoRefreshSelect.addEventListener('change', (e) => {
        const seconds = parseInt(e.target.value, 10) || 0;
        if (this.autoRefreshTimerId) {
          clearInterval(this.autoRefreshTimerId);
          this.autoRefreshTimerId = null;
        }
        if (seconds > 0) {
          const ms = seconds * 1000;
          this.autoRefreshTimerId = setInterval(() => {
            this.runBulkHealthCheck({ silent: true });
          }, ms);
        }
      });
    }

    const addBtn = this.querySelector('#addWebhookBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openEditModal());
    }
    
    const emptyAddBtn = this.querySelector('#emptyAddBtn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => this.openEditModal());
    }
    
    // Modal de edición
    const webhookModal = this.querySelector('#webhookModal');
    const closeWebhookModal = this.querySelector('#closeWebhookModal');
    const cancelWebhookBtn = this.querySelector('#cancelWebhookBtn');
    const saveWebhookBtn = this.querySelector('#saveWebhookBtn');
    
    if (webhookModal) {
      if (closeWebhookModal) {
        closeWebhookModal.addEventListener('click', () => webhookModal.style.display = 'none');
      }
      if (cancelWebhookBtn) {
        cancelWebhookBtn.addEventListener('click', () => webhookModal.style.display = 'none');
      }
      webhookModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        webhookModal.style.display = 'none';
      });
    }
    
    if (saveWebhookBtn) {
      saveWebhookBtn.addEventListener('click', () => this.saveWebhook());
    }
    
    // Test URL buttons
    this.querySelectorAll('.test-url-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const env = btn.dataset.env;
        this.testWebhookUrl(env);
      });
    });
    
    // Health check modal
    const healthModal = this.querySelector('#healthCheckModal');
    const closeHealthModal = this.querySelector('#closeHealthModal');
    const closeHealthBtn = this.querySelector('#closeHealthBtn');
    
    if (healthModal) {
      if (closeHealthModal) {
        closeHealthModal.addEventListener('click', () => healthModal.style.display = 'none');
      }
      if (closeHealthBtn) {
        closeHealthBtn.addEventListener('click', () => healthModal.style.display = 'none');
      }
      healthModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        healthModal.style.display = 'none';
      });
    }
    
    // Delete modal
    const deleteModal = this.querySelector('#deleteWebhookModal');
    const closeDeleteModal = this.querySelector('#closeDeleteModal');
    const cancelDeleteBtn = this.querySelector('#cancelDeleteBtn');
    const confirmDeleteBtn = this.querySelector('#confirmDeleteBtn');
    
    if (deleteModal) {
      if (closeDeleteModal) {
        closeDeleteModal.addEventListener('click', () => deleteModal.style.display = 'none');
      }
      if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => deleteModal.style.display = 'none');
      }
      deleteModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        deleteModal.style.display = 'none';
      });
    }
    
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener('click', () => this.confirmDelete());
    }
  }

  showNotification(message, type = 'info') {
    const existing = document.querySelector('.webhooks-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `webhooks-notification ${type}`;
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

window.DevWebhooksView = DevWebhooksView;
