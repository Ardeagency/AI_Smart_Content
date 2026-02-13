/**
 * DevLogsView - Vista de logs y debug para desarrolladores (PaaS)
 * 
 * Permite a los desarrolladores:
 * - Ver logs de sus flujos
 * - Filtrar por severidad (info, warning, error, critical)
 * - Filtrar por ambiente (test, prod)
 * - Filtrar por flujo específico
 * - Ver detalles de cada log
 */
class DevLogsView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.logs = [];
    this.flows = [];
    this.filters = {
      severity: 'all',
      environment: 'all',
      flowId: 'all'
    };
    this.currentPage = 1;
    this.pageSize = 50;
    this.totalLogs = 0;
  }

  renderHTML() {
    return `
      <div class="dev-logs-container">
        <!-- Header -->
        <header class="dev-logs-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title">
              <i class="fas fa-terminal"></i>
              Developer Logs
            </h1>
            <p class="dev-header-subtitle">Monitorea errores y eventos de tus flujos</p>
          </div>
          <div class="dev-header-actions">
            <button class="btn btn-secondary" id="refreshLogsBtn">
              <i class="fas fa-sync-alt"></i>
              Actualizar
            </button>
            <button class="btn btn-secondary" id="clearFiltersBtn">
              <i class="fas fa-filter-circle-xmark"></i>
              Limpiar Filtros
            </button>
          </div>
        </header>

        <!-- Toolbar de filtros -->
        <div class="dev-logs-toolbar">
          <!-- Filtro por severidad -->
          <div class="dev-logs-filter">
            <label>Severidad</label>
            <select id="severityFilter">
              <option value="all">Todas</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <!-- Filtro por ambiente -->
          <div class="dev-logs-filter">
            <label>Ambiente</label>
            <select id="environmentFilter">
              <option value="all">Todos</option>
              <option value="test">Test</option>
              <option value="prod">Producción</option>
            </select>
          </div>

          <!-- Filtro por flujo -->
          <div class="dev-logs-filter">
            <label>Flujo</label>
            <select id="flowFilter">
              <option value="all">Todos los flujos</option>
              <!-- Se cargarán dinámicamente -->
            </select>
          </div>

          <!-- Contador de logs -->
          <div class="dev-logs-count">
            <span id="logsCount">0</span> logs encontrados
          </div>
        </div>

        <!-- Tabla de logs -->
        <div class="dev-logs-table-container">
          <table class="dev-logs-table" id="logsTable">
            <thead>
              <tr>
                <th class="col-severity">Severidad</th>
                <th class="col-flow">Flujo</th>
                <th class="col-module">Módulo</th>
                <th class="col-env">Ambiente</th>
                <th class="col-message">Mensaje</th>
                <th class="col-time">Tiempo</th>
                <th class="col-actions">Acciones</th>
              </tr>
            </thead>
            <tbody id="logsTableBody"></tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div class="dev-logs-pagination" id="logsPagination">
          <!-- Se renderiza dinámicamente -->
        </div>

        <!-- Estado vacío -->
        <div class="dev-logs-empty" id="logsEmpty" style="display: none;">
          <div class="dev-empty-icon">
            <i class="fas fa-check-circle"></i>
          </div>
          <h3>Sin logs</h3>
          <p>No hay logs que coincidan con los filtros seleccionados</p>
        </div>
      </div>

      <!-- Modal de detalle del log -->
      <div class="modal" id="logDetailModal" style="display: none;">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>Detalle del Log</h3>
            <button class="modal-close" id="logDetailClose">&times;</button>
          </div>
          <div class="modal-body" id="logDetailBody">
            <!-- Se renderiza dinámicamente -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Inicializar la vista
   */
  async init() {
    await this.initSupabase();
    
    // Verificar si hay filtro de flujo en la URL
    this.checkUrlParams();
    
    await this.loadFlows();
    await this.loadLogs();
    this.setupEventListeners();
  }

  /**
   * Verificar parámetros de URL
   */
  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const flowId = urlParams.get('flow');
    if (flowId) {
      this.filters.flowId = flowId;
    }
  }

  /**
   * Inicializar Supabase
   */
  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }

      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) {
          this.userId = user.id;
        }
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  /**
   * Cargar flujos del desarrollador (para el filtro)
   */
  async loadFlows() {
    if (!this.supabase || !this.userId) return;

    try {
      const { data: flows, error } = await this.supabase
        .from('content_flows')
        .select('id, name')
        .eq('owner_id', this.userId)
        .order('name');

      if (error) throw error;

      this.flows = flows || [];
      this.renderFlowFilter();
    } catch (error) {
      console.error('Error cargando flujos:', error);
    }
  }

  /**
   * Renderizar opciones del filtro de flujos
   */
  renderFlowFilter() {
    const select = document.getElementById('flowFilter');
    if (!select) return;

    // Mantener la opción "Todos"
    let options = '<option value="all">Todos los flujos</option>';
    
    this.flows.forEach(flow => {
      const selected = this.filters.flowId === flow.id ? 'selected' : '';
      options += `<option value="${flow.id}" ${selected}>${this.escapeHtml(flow.name)}</option>`;
    });

    select.innerHTML = options;
  }

  /**
   * Cargar logs
   */
  async loadLogs() {
    if (!this.supabase || !this.userId) {
      this.showError('No se pudo inicializar la conexión');
      return;
    }

    try {
      // Primero obtener IDs de flujos del desarrollador
      const { data: flowIds } = await this.supabase
        .from('content_flows')
        .select('id')
        .eq('owner_id', this.userId);

      if (!flowIds || flowIds.length === 0) {
        this.logs = [];
        this.totalLogs = 0;
        this.renderLogs();
        return;
      }

      const ids = flowIds.map(f => f.id);

      // Construir query con filtros
      let query = this.supabase
        .from('developer_logs')
        .select(`
          id,
          flow_id,
          run_id,
          flow_module_id,
          environment,
          severity,
          error_message,
          raw_details,
          created_at,
          content_flows (name),
          flow_modules (name)
        `, { count: 'exact' })
        .in('flow_id', ids);

      // Aplicar filtros
      if (this.filters.severity !== 'all') {
        query = query.eq('severity', this.filters.severity);
      }
      if (this.filters.environment !== 'all') {
        query = query.eq('environment', this.filters.environment);
      }
      if (this.filters.flowId !== 'all') {
        query = query.eq('flow_id', this.filters.flowId);
      }

      // Ordenar y paginar
      query = query
        .order('created_at', { ascending: false })
        .range((this.currentPage - 1) * this.pageSize, this.currentPage * this.pageSize - 1);

      const { data: logs, count, error } = await query;

      if (error) throw error;

      this.logs = logs || [];
      this.totalLogs = count || 0;
      this.renderLogs();
      this.renderPagination();
      this.updateLogsCount();
    } catch (error) {
      console.error('Error cargando logs:', error);
      this.showLogsError();
    }
  }

  /**
   * Renderizar tabla de logs
   */
  renderLogs() {
    const tbody = document.getElementById('logsTableBody');
    const empty = document.getElementById('logsEmpty');
    const tableContainer = document.querySelector('.dev-logs-table-container');

    if (!tbody) return;

    if (this.logs.length === 0) {
      if (tableContainer) tableContainer.style.display = 'none';
      if (empty) empty.style.display = 'flex';
      return;
    }

    if (tableContainer) tableContainer.style.display = 'block';
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = this.logs.map(log => `
      <tr class="log-row severity-${log.severity}">
        <td class="col-severity">
          <span class="log-severity-badge ${log.severity}">
            <i class="fas ${this.getSeverityIcon(log.severity)}"></i>
            ${this.capitalize(log.severity)}
          </span>
        </td>
        <td class="col-flow">
          <span class="log-flow-name">${this.escapeHtml(log.content_flows?.name || 'Unknown')}</span>
        </td>
        <td class="col-module">
          <span class="log-module-name">${this.escapeHtml(log.flow_modules?.name || '—')}</span>
        </td>
        <td class="col-env">
          <span class="log-env-badge ${log.environment}">${log.environment}</span>
        </td>
        <td class="col-message">
          <span class="log-message" title="${this.escapeHtml(log.error_message)}">
            ${this.escapeHtml(this.truncateText(log.error_message, 100))}
          </span>
        </td>
        <td class="col-time">
          <span class="log-time" title="${new Date(log.created_at).toLocaleString()}">
            ${this.formatTimeAgo(log.created_at)}
          </span>
        </td>
        <td class="col-actions">
          <button class="log-action-btn" data-log-id="${log.id}" title="Ver detalles">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');

    // Event listeners para ver detalles
    tbody.querySelectorAll('.log-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const logId = btn.dataset.logId;
        this.showLogDetail(logId);
      });
    });
  }

  /**
   * Renderizar paginación
   */
  renderPagination() {
    const pagination = document.getElementById('logsPagination');
    if (!pagination) return;

    const totalPages = Math.ceil(this.totalLogs / this.pageSize);

    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    let html = '';

    // Botón anterior
    html += `
      <button class="pagination-btn" data-page="${this.currentPage - 1}" ${this.currentPage === 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i>
      </button>
    `;

    // Números de página
    const startPage = Math.max(1, this.currentPage - 2);
    const endPage = Math.min(totalPages, this.currentPage + 2);

    if (startPage > 1) {
      html += `<button class="pagination-btn" data-page="1">1</button>`;
      if (startPage > 2) html += `<span class="pagination-ellipsis">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `
        <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" data-page="${i}">
          ${i}
        </button>
      `;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span class="pagination-ellipsis">...</span>`;
      html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    // Botón siguiente
    html += `
      <button class="pagination-btn" data-page="${this.currentPage + 1}" ${this.currentPage === totalPages ? 'disabled' : ''}>
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

    pagination.innerHTML = html;

    // Event listeners
    pagination.querySelectorAll('.pagination-btn').forEach(btn => {
      if (!btn.disabled) {
        btn.addEventListener('click', () => {
          this.currentPage = parseInt(btn.dataset.page);
          this.loadLogs();
        });
      }
    });
  }

  /**
   * Actualizar contador de logs
   */
  updateLogsCount() {
    const count = document.getElementById('logsCount');
    if (count) {
      count.textContent = this.totalLogs;
    }
  }

  /**
   * Mostrar detalle de un log
   */
  showLogDetail(logId) {
    const log = this.logs.find(l => l.id === logId);
    if (!log) return;

    const modal = document.getElementById('logDetailModal');
    const body = document.getElementById('logDetailBody');

    if (!modal || !body) return;

    body.innerHTML = `
      <div class="log-detail">
        <div class="log-detail-header">
          <span class="log-severity-badge ${log.severity}">
            <i class="fas ${this.getSeverityIcon(log.severity)}"></i>
            ${this.capitalize(log.severity)}
          </span>
          <span class="log-env-badge ${log.environment}">${log.environment}</span>
          <span class="log-detail-time">${new Date(log.created_at).toLocaleString()}</span>
        </div>

        <div class="log-detail-section">
          <h4>Flujo</h4>
          <p>${this.escapeHtml(log.content_flows?.name || 'Unknown')}</p>
        </div>

        ${log.flow_modules?.name ? `
          <div class="log-detail-section">
            <h4>Módulo</h4>
            <p>${this.escapeHtml(log.flow_modules.name)}</p>
          </div>
        ` : ''}

        <div class="log-detail-section">
          <h4>Mensaje de Error</h4>
          <pre class="log-detail-message">${this.escapeHtml(log.error_message)}</pre>
        </div>

        ${log.run_id ? `
          <div class="log-detail-section">
            <h4>ID de Ejecución</h4>
            <code>${log.run_id}</code>
          </div>
        ` : ''}

        ${log.raw_details && Object.keys(log.raw_details).length > 0 ? `
          <div class="log-detail-section">
            <h4>Detalles Técnicos</h4>
            <pre class="log-detail-raw">${JSON.stringify(log.raw_details, null, 2)}</pre>
          </div>
        ` : ''}
      </div>
    `;

    modal.style.display = 'flex';
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Filtros
    const severityFilter = document.getElementById('severityFilter');
    const environmentFilter = document.getElementById('environmentFilter');
    const flowFilter = document.getElementById('flowFilter');

    if (severityFilter) {
      severityFilter.addEventListener('change', (e) => {
        this.filters.severity = e.target.value;
        this.currentPage = 1;
        this.loadLogs();
      });
    }

    if (environmentFilter) {
      environmentFilter.addEventListener('change', (e) => {
        this.filters.environment = e.target.value;
        this.currentPage = 1;
        this.loadLogs();
      });
    }

    if (flowFilter) {
      flowFilter.addEventListener('change', (e) => {
        this.filters.flowId = e.target.value;
        this.currentPage = 1;
        this.loadLogs();
      });
    }

    // Botones de header
    const refreshBtn = document.getElementById('refreshLogsBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadLogs());
    }

    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => this.clearFilters());
    }

    // Modal
    const modalClose = document.getElementById('logDetailClose');
    const modal = document.getElementById('logDetailModal');

    if (modalClose) {
      modalClose.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }
  }

  /**
   * Limpiar filtros
   */
  clearFilters() {
    this.filters = {
      severity: 'all',
      environment: 'all',
      flowId: 'all'
    };
    this.currentPage = 1;

    // Resetear selects
    const severityFilter = document.getElementById('severityFilter');
    const environmentFilter = document.getElementById('environmentFilter');
    const flowFilter = document.getElementById('flowFilter');

    if (severityFilter) severityFilter.value = 'all';
    if (environmentFilter) environmentFilter.value = 'all';
    if (flowFilter) flowFilter.value = 'all';

    this.loadLogs();
  }

  // ========== Utilidades ==========

  getSeverityIcon(severity) {
    const icons = {
      'info': 'fa-info-circle',
      'warning': 'fa-exclamation-triangle',
      'error': 'fa-times-circle',
      'critical': 'fa-skull-crossbones'
    };
    return icons[severity] || 'fa-circle';
  }

  capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  }

    showLogsError() {
    const tbody = document.getElementById('logsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="dev-table-error">
            <i class="fas fa-exclamation-triangle"></i>
            Error cargando logs
          </td>
        </tr>
      `;
    }
  }

  async onLeave() {
    // Limpieza si es necesaria
  }
}

// Hacer disponible globalmente
window.DevLogsView = DevLogsView;
