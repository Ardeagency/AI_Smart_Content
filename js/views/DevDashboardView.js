/**
 * DevDashboardView - Dashboard del Portal de Desarrollador PaaS
 * 
 * Muestra métricas y estadísticas para desarrolladores:
 * - Total de flujos creados
 * - Flujos publicados
 * - Ejecuciones exitosas
 * - Rating promedio
 * - Logs recientes
 * - Gráficos de rendimiento
 */
class DevDashboardView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'dev/dashboard.html';
    this.supabase = null;
    this.userId = null;
    this.stats = null;
    this.recentLogs = [];
    this.recentRuns = [];
    this.flows = [];
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Verificar autenticación
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    }

    // Renderizar Navigation en modo desarrollador si no está visible
    if (window.navigation) {
      if (!window.navigation.initialized || window.navigation.currentMode !== 'developer') {
        window.navigation.currentMode = 'developer';
        window.navigation.initialized = false;
        await window.navigation.render();
      }
    }
  }

  /**
   * Renderizar HTML inline (sin template externo)
   */
  renderHTML() {
    return `
      <div class="dev-dashboard-container">
        <!-- Header del Dashboard -->
        <header class="dev-dashboard-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title">
              <i class="fas fa-chart-line"></i>
              Developer Dashboard
            </h1>
            <p class="dev-header-subtitle">Monitorea el rendimiento de tus flujos de IA</p>
          </div>
          <div class="dev-header-actions">
            <button class="btn btn-primary" id="createFlowBtn">
              <i class="fas fa-plus"></i>
              Nuevo Flujo
            </button>
          </div>
        </header>

        <!-- Grid de estadísticas principales -->
        <section class="dev-stats-grid" id="devStatsGrid">
          <div class="dev-stat-card">
            <div class="dev-stat-icon">
              <i class="fas fa-diagram-project"></i>
            </div>
            <div class="dev-stat-content">
              <div class="dev-stat-value" id="statTotalFlows">-</div>
              <div class="dev-stat-label">Flujos Creados</div>
            </div>
          </div>

          <div class="dev-stat-card">
            <div class="dev-stat-icon published">
              <i class="fas fa-globe"></i>
            </div>
            <div class="dev-stat-content">
              <div class="dev-stat-value" id="statPublishedFlows">-</div>
              <div class="dev-stat-label">Flujos Publicados</div>
            </div>
          </div>

          <div class="dev-stat-card">
            <div class="dev-stat-icon runs">
              <i class="fas fa-play-circle"></i>
            </div>
            <div class="dev-stat-content">
              <div class="dev-stat-value" id="statSuccessfulRuns">-</div>
              <div class="dev-stat-label">Ejecuciones Exitosas</div>
            </div>
          </div>

          <div class="dev-stat-card">
            <div class="dev-stat-icon rating">
              <i class="fas fa-star"></i>
            </div>
            <div class="dev-stat-content">
              <div class="dev-stat-value" id="statAvgRating">-</div>
              <div class="dev-stat-label">Rating Promedio</div>
            </div>
          </div>
        </section>

        <!-- Contenedor de dos columnas -->
        <div class="dev-dashboard-columns">
          <!-- Columna izquierda: Flujos recientes -->
          <section class="dev-section dev-flows-section">
            <div class="dev-section-header">
              <h2 class="dev-section-title">
                <i class="fas fa-diagram-project"></i>
                Mis Flujos
              </h2>
              <a href="/dev/flows" class="dev-section-link">Ver todos →</a>
            </div>
            <div class="dev-flows-list" id="devFlowsList"></div>
          </section>

          <!-- Columna derecha: Logs recientes -->
          <section class="dev-section dev-logs-section">
            <div class="dev-section-header">
              <h2 class="dev-section-title">
                <i class="fas fa-terminal"></i>
                Logs Recientes
              </h2>
              <a href="/dev/logs" class="dev-section-link">Ver todos →</a>
            </div>
            <div class="dev-logs-list" id="devLogsList">
              <div class="dev-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Cargando logs...</span>
              </div>
            </div>
          </section>
        </div>

        <!-- Sección de ejecuciones recientes -->
        <section class="dev-section dev-runs-section">
          <div class="dev-section-header">
            <h2 class="dev-section-title">
              <i class="fas fa-history"></i>
              Ejecuciones Recientes
            </h2>
            <a href="/dev/runs" class="dev-section-link">Ver todas →</a>
          </div>
          <div class="dev-runs-table-container">
            <table class="dev-runs-table" id="devRunsTable">
              <thead>
                <tr>
                  <th>Flujo</th>
                  <th>Estado</th>
                  <th>Tokens</th>
                  <th>Respuesta</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody id="devRunsTableBody"></tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  /**
   * Inicializar la vista
   */
  async init() {
    await this.initSupabase();
    await this.loadDashboardData();
    this.setupEventListeners();
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
   * Cargar todos los datos del dashboard
   */
  async loadDashboardData() {
    if (!this.supabase || !this.userId) {
      this.showError('No se pudo inicializar la conexión');
      return;
    }

    try {
      // Cargar datos en paralelo
      await Promise.all([
        this.loadDeveloperStats(),
        this.loadFlows(),
        this.loadRecentLogs(),
        this.loadRecentRuns()
      ]);
    } catch (error) {
      console.error('Error cargando datos del dashboard:', error);
    }
  }

  /**
   * Cargar estadísticas del desarrollador
   */
  async loadDeveloperStats() {
    try {
      // Intentar cargar de developer_stats
      const { data: stats, error } = await this.supabase
        .from('developer_stats')
        .select('*')
        .eq('user_id', this.userId)
        .maybeSingle();

      if (stats) {
        this.stats = stats;
      } else {
        // Calcular estadísticas manualmente
        const [flowsResult, publishedResult, runsResult] = await Promise.all([
          this.supabase
            .from('content_flows')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', this.userId),
          this.supabase
            .from('content_flows')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', this.userId)
            .eq('status', 'published'),
          this.supabase
            .from('flow_runs')
            .select('*', { count: 'exact', head: true })
            .in('flow_id', this.supabase.from('content_flows').select('id').eq('owner_id', this.userId))
            .eq('status', 'completed')
        ]);

        this.stats = {
          total_flows_created: flowsResult.count || 0,
          total_published_flows: publishedResult.count || 0,
          total_successful_runs: runsResult.count || 0,
          avg_flow_rating: 0
        };
      }

      // Actualizar UI
      this.renderStats();
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  }

  /**
   * Renderizar estadísticas en la UI
   */
  renderStats() {
    const elements = {
      statTotalFlows: this.stats?.total_flows_created || 0,
      statPublishedFlows: this.stats?.total_published_flows || 0,
      statSuccessfulRuns: this.formatNumber(this.stats?.total_successful_runs || 0),
      statAvgRating: (this.stats?.avg_flow_rating || 0).toFixed(1)
    };

    Object.entries(elements).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  }

  /**
   * Cargar flujos del desarrollador
   */
  async loadFlows() {
    try {
      const { data: flows, error } = await this.supabase
        .from('content_flows')
        .select(`
          id,
          name,
          description,
          status,
          run_count,
          likes_count,
          created_at,
          flow_image_url
        `)
        .eq('owner_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      this.flows = flows || [];
      this.renderFlows();
    } catch (error) {
      console.error('Error cargando flujos:', error);
      this.renderFlowsError();
    }
  }

  /**
   * Renderizar lista de flujos
   */
  renderFlows() {
    const container = document.getElementById('devFlowsList');
    if (!container) return;

    if (this.flows.length === 0) {
      container.innerHTML = `
        <div class="dev-empty-state">
          <i class="fas fa-diagram-project"></i>
          <p>No tienes flujos creados</p>
          <button class="btn btn-primary btn-sm" id="createFlowEmptyBtn">
            <i class="fas fa-plus"></i> Crear primer flujo
          </button>
        </div>
      `;
      
      const createBtn = document.getElementById('createFlowEmptyBtn');
      if (createBtn) {
        createBtn.addEventListener('click', () => this.navigateToBuilder());
      }
      return;
    }

    container.innerHTML = this.flows.map(flow => `
      <div class="dev-flow-item" data-flow-id="${flow.id}">
        <div class="dev-flow-icon">
          ${flow.flow_image_url 
            ? `<img src="${flow.flow_image_url}" alt="${this.escapeHtml(flow.name)}">`
            : `<i class="fas fa-diagram-project"></i>`
          }
        </div>
        <div class="dev-flow-info">
          <div class="dev-flow-name">${this.escapeHtml(flow.name)}</div>
          <div class="dev-flow-meta">
            <span class="dev-flow-status status-${flow.status}">${this.getStatusLabel(flow.status)}</span>
            <span class="dev-flow-runs"><i class="fas fa-play"></i> ${this.formatNumber(flow.run_count || 0)}</span>
          </div>
        </div>
        <button class="dev-flow-action" title="Editar flujo">
          <i class="fas fa-edit"></i>
        </button>
      </div>
    `).join('');

    // Event listeners para editar flujos
    container.querySelectorAll('.dev-flow-item').forEach(item => {
      item.addEventListener('click', () => {
        const flowId = item.dataset.flowId;
        this.navigateToBuilder(flowId);
      });
    });
  }

  /**
   * Cargar logs recientes
   */
  async loadRecentLogs() {
    try {
      // Obtener IDs de flujos del desarrollador primero
      const { data: flowIds } = await this.supabase
        .from('content_flows')
        .select('id')
        .eq('owner_id', this.userId);

      if (!flowIds || flowIds.length === 0) {
        this.recentLogs = [];
        this.renderLogs();
        return;
      }

      const ids = flowIds.map(f => f.id);

      const { data: logs, error } = await this.supabase
        .from('developer_logs')
        .select(`
          id,
          flow_id,
          severity,
          error_message,
          environment,
          created_at,
          content_flows (name)
        `)
        .in('flow_id', ids)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      this.recentLogs = logs || [];
      this.renderLogs();
    } catch (error) {
      console.error('Error cargando logs:', error);
      this.renderLogsError();
    }
  }

  /**
   * Renderizar lista de logs
   */
  renderLogs() {
    const container = document.getElementById('devLogsList');
    if (!container) return;

    if (this.recentLogs.length === 0) {
      container.innerHTML = `
        <div class="dev-empty-state">
          <i class="fas fa-check-circle"></i>
          <p>Sin errores recientes</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.recentLogs.map(log => `
      <div class="dev-log-item severity-${log.severity}">
        <div class="dev-log-severity">
          <i class="fas ${this.getSeverityIcon(log.severity)}"></i>
        </div>
        <div class="dev-log-content">
          <div class="dev-log-message">${this.escapeHtml(this.truncateText(log.error_message, 80))}</div>
          <div class="dev-log-meta">
            <span class="dev-log-flow">${this.escapeHtml(log.content_flows?.name || 'Unknown')}</span>
            <span class="dev-log-env">${log.environment}</span>
            <span class="dev-log-time">${this.formatTimeAgo(log.created_at)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Cargar ejecuciones recientes
   */
  async loadRecentRuns() {
    try {
      // Obtener IDs de flujos del desarrollador
      const { data: flowIds } = await this.supabase
        .from('content_flows')
        .select('id')
        .eq('owner_id', this.userId);

      if (!flowIds || flowIds.length === 0) {
        this.recentRuns = [];
        this.renderRuns();
        return;
      }

      const ids = flowIds.map(f => f.id);

      const { data: runs, error } = await this.supabase
        .from('flow_runs')
        .select(`
          id,
          flow_id,
          status,
          tokens_consumed,
          webhook_response_code,
          created_at,
          content_flows (name)
        `)
        .in('flow_id', ids)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      this.recentRuns = runs || [];
      this.renderRuns();
    } catch (error) {
      console.error('Error cargando ejecuciones:', error);
      this.renderRunsError();
    }
  }

  /**
   * Renderizar tabla de ejecuciones
   */
  renderRuns() {
    const tbody = document.getElementById('devRunsTableBody');
    if (!tbody) return;

    if (this.recentRuns.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="dev-table-empty">
            <i class="fas fa-inbox"></i>
            Sin ejecuciones recientes
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.recentRuns.map(run => `
      <tr class="status-row-${run.status}">
        <td>
          <span class="dev-run-flow-name">${this.escapeHtml(run.content_flows?.name || 'Unknown')}</span>
        </td>
        <td>
          <span class="dev-run-status status-${run.status}">
            <i class="fas ${this.getRunStatusIcon(run.status)}"></i>
            ${this.getRunStatusLabel(run.status)}
          </span>
        </td>
        <td>
          <span class="dev-run-tokens">${run.tokens_consumed || 0}</span>
        </td>
        <td>
          <span class="dev-run-response ${this.getResponseClass(run.webhook_response_code)}">
            ${run.webhook_response_code || '-'}
          </span>
        </td>
        <td>
          <span class="dev-run-time">${this.formatTimeAgo(run.created_at)}</span>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Botón crear flujo
    const createFlowBtn = document.getElementById('createFlowBtn');
    if (createFlowBtn) {
      createFlowBtn.addEventListener('click', () => this.navigateToBuilder());
    }
  }

  /**
   * Navegar al builder de flujos
   */
  navigateToBuilder(flowId = null) {
    const route = flowId ? `/dev/builder?flow=${flowId}` : '/dev/builder';
    if (window.router) {
      window.router.navigate(route);
    }
  }

  // ========== Utilidades ==========

  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
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

  getStatusLabel(status) {
    const labels = {
      'draft': 'Borrador',
      'testing': 'Pruebas',
      'published': 'Publicado',
      'archived': 'Archivado'
    };
    return labels[status] || status;
  }

  getSeverityIcon(severity) {
    const icons = {
      'info': 'fa-info-circle',
      'warning': 'fa-exclamation-triangle',
      'error': 'fa-times-circle',
      'critical': 'fa-skull-crossbones'
    };
    return icons[severity] || 'fa-circle';
  }

  getRunStatusIcon(status) {
    const icons = {
      'pending': 'fa-clock',
      'running': 'fa-spinner fa-spin',
      'completed': 'fa-check-circle',
      'failed': 'fa-times-circle'
    };
    return icons[status] || 'fa-circle';
  }

  getRunStatusLabel(status) {
    const labels = {
      'pending': 'Pendiente',
      'running': 'Ejecutando',
      'completed': 'Completado',
      'failed': 'Fallido'
    };
    return labels[status] || status;
  }

  getResponseClass(code) {
    if (!code) return '';
    if (code >= 200 && code < 300) return 'response-success';
    if (code >= 400 && code < 500) return 'response-client-error';
    if (code >= 500) return 'response-server-error';
    return '';
  }

  renderFlowsError() {
    const container = document.getElementById('devFlowsList');
    if (container) {
      container.innerHTML = `
        <div class="dev-error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error cargando flujos</p>
        </div>
      `;
    }
  }

  renderLogsError() {
    const container = document.getElementById('devLogsList');
    if (container) {
      container.innerHTML = `
        <div class="dev-error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error cargando logs</p>
        </div>
      `;
    }
  }

  renderRunsError() {
    const tbody = document.getElementById('devRunsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="dev-table-error">
            <i class="fas fa-exclamation-triangle"></i>
            Error cargando ejecuciones
          </td>
        </tr>
      `;
    }
  }

  showError(message) {
    const container = this.container;
    if (container) {
      container.innerHTML = `
        <div class="error-container">
          <i class="fas fa-exclamation-triangle"></i>
          <h2>Error</h2>
          <p>${this.escapeHtml(message)}</p>
          <button class="btn btn-primary" onclick="window.location.reload()">Recargar</button>
        </div>
      `;
    }
  }

  async onLeave() {
    // Limpieza si es necesaria
  }
}

// Hacer disponible globalmente
window.DevDashboardView = DevDashboardView;
