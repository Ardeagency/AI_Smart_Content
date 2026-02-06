/**
 * DevFlowsView - Vista de gestión de flujos de IA (PaaS)
 * 
 * Permite a los desarrolladores:
 * - Ver todos sus flujos
 * - Filtrar por estado (draft, testing, published)
 * - Crear nuevos flujos
 * - Editar flujos existentes
 * - Ver estadísticas de cada flujo
 */
class DevFlowsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'dev/flows.html';
    this.supabase = null;
    this.userId = null;
    this.flows = [];
    this.filteredFlows = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    }

    // Asegurar navegación en modo desarrollador
    if (window.navigation) {
      if (!window.navigation.initialized || window.navigation.currentMode !== 'developer') {
        window.navigation.currentMode = 'developer';
        window.navigation.initialized = false;
        await window.navigation.render();
      }
    }
  }

  /**
   * Renderizar HTML inline
   */
  renderHTML() {
    return `
      <div class="dev-flows-container">
        <!-- Header -->
        <header class="dev-flows-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title">
              <i class="fas fa-diagram-project"></i>
              Mis Flujos de IA
            </h1>
            <p class="dev-header-subtitle">Gestiona y monitorea tus flujos de contenido</p>
          </div>
          <div class="dev-header-actions">
            <button class="btn btn-primary" id="createFlowBtn">
              <i class="fas fa-plus"></i>
              Nuevo Flujo
            </button>
          </div>
        </header>

        <!-- Toolbar: Filtros y búsqueda -->
        <div class="dev-flows-toolbar">
          <div class="dev-flows-filters">
            <button class="dev-filter-btn active" data-filter="all">
              <i class="fas fa-border-all"></i>
              Todos
            </button>
            <button class="dev-filter-btn" data-filter="draft">
              <i class="fas fa-file-alt"></i>
              Borradores
            </button>
            <button class="dev-filter-btn" data-filter="testing">
              <i class="fas fa-flask"></i>
              En Pruebas
            </button>
            <button class="dev-filter-btn" data-filter="published">
              <i class="fas fa-globe"></i>
              Publicados
            </button>
          </div>
          <div class="dev-flows-search">
            <i class="fas fa-search"></i>
            <input type="text" id="flowSearchInput" placeholder="Buscar flujos...">
          </div>
        </div>

        <!-- Grid de flujos -->
        <div class="dev-flows-grid" id="devFlowsGrid"></div>

        <!-- Estado vacío (se mostrará si no hay flujos) -->
        <div class="dev-flows-empty" id="devFlowsEmpty" style="display: none;">
          <div class="dev-empty-icon">
            <i class="fas fa-diagram-project"></i>
          </div>
          <h3>No tienes flujos creados</h3>
          <p>Crea tu primer flujo de IA para empezar a generar contenido automáticamente</p>
          <button class="btn btn-primary" id="createFlowEmptyBtn">
            <i class="fas fa-plus"></i>
            Crear mi primer flujo
          </button>
        </div>
      </div>

      <!-- Modal de confirmación para eliminar -->
      <div class="modal" id="deleteFlowModal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Eliminar Flujo</h3>
            <button class="modal-close" id="deleteModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <p>¿Estás seguro de que deseas eliminar este flujo?</p>
            <p class="modal-warning">Esta acción no se puede deshacer.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="deleteModalCancel">Cancelar</button>
            <button class="btn btn-danger" id="deleteModalConfirm">Eliminar</button>
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
    await this.loadFlows();
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
   * Cargar flujos del desarrollador
   */
  async loadFlows() {
    if (!this.supabase || !this.userId) {
      this.showError('No se pudo inicializar la conexión');
      return;
    }

    try {
      const { data: flows, error } = await this.supabase
        .from('content_flows')
        .select(`
          id,
          name,
          description,
          output_type,
          status,
          run_count,
          likes_count,
          saves_count,
          token_cost,
          version,
          flow_image_url,
          created_at,
          content_categories (name)
        `)
        .eq('owner_id', this.userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.flows = Array.isArray(flows) ? flows : [];
      this.applyFilters();
    } catch (error) {
      console.error('Error cargando flujos:', error);
      this.showError('Error cargando flujos');
    }
  }

  /**
   * Aplicar filtros y renderizar
   */
  applyFilters() {
    let filtered = [...this.flows];

    // Filtrar por estado
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(f => f.status === this.currentFilter);
    }

    // Filtrar por búsqueda
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(f => 
        f.name.toLowerCase().includes(query) ||
        (f.description && f.description.toLowerCase().includes(query))
      );
    }

    this.filteredFlows = filtered;
    this.renderFlows();
  }

  /**
   * Renderizar grid de flujos
   */
  renderFlows() {
    const grid = document.getElementById('devFlowsGrid');
    const empty = document.getElementById('devFlowsEmpty');

    if (!grid) return;

    if (this.filteredFlows.length === 0) {
      grid.style.display = 'none';
      if (empty) {
        empty.style.display = 'flex';
        // Actualizar mensaje según el filtro
        const emptyTitle = empty.querySelector('h3');
        const emptyDesc = empty.querySelector('p');
        
        if (this.flows.length === 0) {
          if (emptyTitle) emptyTitle.textContent = 'No tienes flujos creados';
          if (emptyDesc) emptyDesc.textContent = 'Crea tu primer flujo de IA para empezar a generar contenido automáticamente';
        } else if (this.searchQuery) {
          if (emptyTitle) emptyTitle.textContent = 'Sin resultados';
          if (emptyDesc) emptyDesc.textContent = `No se encontraron flujos para "${this.searchQuery}"`;
        } else {
          if (emptyTitle) emptyTitle.textContent = `Sin flujos en "${this.getFilterLabel(this.currentFilter)}"`;
          if (emptyDesc) emptyDesc.textContent = 'Intenta con otro filtro';
        }
      }
      return;
    }

    grid.style.display = 'grid';
    if (empty) empty.style.display = 'none';

    grid.innerHTML = this.filteredFlows.map(flow => this.renderFlowCard(flow)).join('');

    // Agregar event listeners a las cards
    this.setupFlowCardListeners();
  }

  /**
   * Renderizar card de flujo
   */
  renderFlowCard(flow) {
    const statusClass = `status-${flow.status}`;
    const statusLabel = this.getStatusLabel(flow.status);
    
    return `
      <div class="dev-flow-card" data-flow-id="${flow.id}">
        <div class="dev-flow-card-header">
          <div class="dev-flow-card-image">
            ${flow.flow_image_url 
              ? `<img src="${flow.flow_image_url}" alt="${this.escapeHtml(flow.name)}">`
              : `<div class="dev-flow-card-placeholder"><i class="fas fa-diagram-project"></i></div>`
            }
          </div>
          <span class="dev-flow-card-status ${statusClass}">${statusLabel}</span>
        </div>
        
        <div class="dev-flow-card-body">
          <h3 class="dev-flow-card-title">${this.escapeHtml(flow.name)}</h3>
          <p class="dev-flow-card-desc">${this.escapeHtml(this.truncateText(flow.description, 100))}</p>
          
          <div class="dev-flow-card-meta">
            <span class="dev-flow-card-category">
              <i class="fas fa-tag"></i>
              ${this.escapeHtml(flow.content_categories?.name || flow.output_type)}
            </span>
            <span class="dev-flow-card-version">
              v${flow.version || '1.0.0'}
            </span>
          </div>
        </div>

        <div class="dev-flow-card-stats">
          <div class="dev-flow-stat">
            <i class="fas fa-play"></i>
            <span>${this.formatNumber(flow.run_count || 0)}</span>
          </div>
          <div class="dev-flow-stat">
            <i class="fas fa-heart"></i>
            <span>${this.formatNumber(flow.likes_count || 0)}</span>
          </div>
          <div class="dev-flow-stat">
            <i class="fas fa-bookmark"></i>
            <span>${this.formatNumber(flow.saves_count || 0)}</span>
          </div>
          <div class="dev-flow-stat">
            <i class="fas fa-coins"></i>
            <span>${flow.token_cost || 1}</span>
          </div>
        </div>

        <div class="dev-flow-card-actions">
          <button class="dev-flow-action-btn edit" title="Editar flujo" data-action="edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="dev-flow-action-btn test" title="Probar flujo" data-action="test">
            <i class="fas fa-play"></i>
          </button>
          <button class="dev-flow-action-btn logs" title="Ver logs" data-action="logs">
            <i class="fas fa-terminal"></i>
          </button>
          <button class="dev-flow-action-btn delete" title="Eliminar flujo" data-action="delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Botones de crear flujo
    const createFlowBtn = document.getElementById('createFlowBtn');
    const createFlowEmptyBtn = document.getElementById('createFlowEmptyBtn');

    if (createFlowBtn) {
      createFlowBtn.addEventListener('click', () => this.navigateToBuilder());
    }
    if (createFlowEmptyBtn) {
      createFlowEmptyBtn.addEventListener('click', () => this.navigateToBuilder());
    }

    // Filtros
    const filterBtns = document.querySelectorAll('.dev-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.applyFilters();
      });
    });

    // Búsqueda
    const searchInput = document.getElementById('flowSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.applyFilters();
      });
    }

    // Modal de eliminar
    this.setupDeleteModal();
  }

  /**
   * Configurar listeners de las cards de flujos
   */
  setupFlowCardListeners() {
    const cards = document.querySelectorAll('.dev-flow-card');
    
    cards.forEach(card => {
      const flowId = card.dataset.flowId;

      // Click en la card (no en los botones) → editar
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.dev-flow-action-btn')) {
          this.navigateToBuilder(flowId);
        }
      });

      // Acciones específicas
      card.querySelectorAll('.dev-flow-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          this.handleFlowAction(action, flowId);
        });
      });
    });
  }

  /**
   * Manejar acción de flujo
   */
  handleFlowAction(action, flowId) {
    switch (action) {
      case 'edit':
        this.navigateToBuilder(flowId);
        break;
      case 'test':
        this.testFlow(flowId);
        break;
      case 'logs':
        this.navigateToLogs(flowId);
        break;
      case 'delete':
        this.showDeleteModal(flowId);
        break;
    }
  }

  /**
   * Navegar al builder
   */
  navigateToBuilder(flowId = null) {
    const route = flowId ? `/dev/builder?flow=${flowId}` : '/dev/builder';
    if (window.router) {
      window.router.navigate(route);
    }
  }

  /**
   * Navegar a logs de un flujo específico
   */
  navigateToLogs(flowId) {
    if (window.router) {
      window.router.navigate(`/dev/logs?flow=${flowId}`);
    }
  }

  /**
   * Probar un flujo (ejecutar en modo test)
   */
  async testFlow(flowId) {
    // TODO: Implementar prueba de flujo
    console.log('Testing flow:', flowId);
    alert('Funcionalidad de prueba en desarrollo');
  }

  /**
   * Configurar modal de eliminar
   */
  setupDeleteModal() {
    const modal = document.getElementById('deleteFlowModal');
    const closeBtn = document.getElementById('deleteModalClose');
    const cancelBtn = document.getElementById('deleteModalCancel');
    const confirmBtn = document.getElementById('deleteModalConfirm');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideDeleteModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideDeleteModal());
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.hideDeleteModal();
      });
    }
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmDelete());
    }
  }

  /**
   * Mostrar modal de eliminar
   */
  showDeleteModal(flowId) {
    this.flowToDelete = flowId;
    const modal = document.getElementById('deleteFlowModal');
    if (modal) modal.style.display = 'flex';
  }

  /**
   * Ocultar modal de eliminar
   */
  hideDeleteModal() {
    this.flowToDelete = null;
    const modal = document.getElementById('deleteFlowModal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Confirmar eliminación de flujo
   */
  async confirmDelete() {
    if (!this.flowToDelete || !this.supabase) {
      this.hideDeleteModal();
      return;
    }

    const confirmBtn = document.getElementById('deleteModalConfirm');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...';
    }

    try {
      const { error } = await this.supabase
        .from('content_flows')
        .delete()
        .eq('id', this.flowToDelete)
        .eq('owner_id', this.userId);

      if (error) throw error;

      // Remover de la lista local
      this.flows = this.flows.filter(f => f.id !== this.flowToDelete);
      this.applyFilters();
      this.hideDeleteModal();
    } catch (error) {
      console.error('Error eliminando flujo:', error);
      alert('Error al eliminar el flujo');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Eliminar';
      }
    }
  }

  // ========== Utilidades ==========

  getStatusLabel(status) {
    const labels = {
      'draft': 'Borrador',
      'testing': 'En Pruebas',
      'published': 'Publicado',
      'archived': 'Archivado'
    };
    return labels[status] || status;
  }

  getFilterLabel(filter) {
    const labels = {
      'all': 'Todos',
      'draft': 'Borradores',
      'testing': 'En Pruebas',
      'published': 'Publicados'
    };
    return labels[filter] || filter;
  }

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
window.DevFlowsView = DevFlowsView;
