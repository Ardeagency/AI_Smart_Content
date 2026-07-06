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
class DevFlowsView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.flows = [];
    this.filteredFlows = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
    // Alcance de la vista: 'mine' = mis flujos | 'all' = todos los de la plataforma (solo lead)
    this.scope = 'mine';
    this.allFlows = [];
    this.allFlowsLoaded = false;
    this.ownersMap = {};
  }

  /** ¿El usuario es Lead? Solo entonces se ofrece la sección "Todos los flujos". */
  isLead() {
    return window.authService?.isLead?.() === true;
  }

  renderHTML() {
    return `
      <div class="dev-flows-container">
        <!-- Barra superior: toggle de alcance (solo Lead) + crear flujo -->
        <div class="dev-flows-topbar">
          <!-- Toggle de alcance (solo Lead): Mis flujos / Todos los flujos -->
          <div class="dev-flows-scope-toggle" id="devFlowsScopeToggle" hidden>
            <button type="button" class="dev-scope-btn active" data-scope="mine">
              <i class="aisc-ico aisc-ico--audience"></i> Mis flujos
            </button>
            <button type="button" class="dev-scope-btn" data-scope="all">
              <i class="aisc-ico aisc-ico--flows"></i> Todos los flujos
            </button>
          </div>
          <button class="btn btn-primary dev-flows-create-btn" id="createFlowBtn">
            <i class="aisc-ico aisc-ico--add"></i>
            Nuevo Flujo
          </button>
        </div>

        <!-- Panel: Mis flujos -->
        <div class="dev-flows-scope-panel" data-scope="mine">
          <!-- Toolbar: Filtros y búsqueda -->
          <div class="dev-flows-toolbar">
            <div class="dev-flows-filters">
              <button class="dev-filter-btn active" data-filter="all">
                <i class="aisc-ico aisc-ico--grid"></i>
                Todos
              </button>
              <button class="dev-filter-btn" data-filter="draft">
                <i class="aisc-ico aisc-ico--document"></i>
                Borradores
              </button>
              <button class="dev-filter-btn" data-filter="testing">
                <i class="aisc-ico aisc-ico--flask"></i>
                En Pruebas
              </button>
              <button class="dev-filter-btn" data-filter="published">
                <i class="aisc-ico aisc-ico--globe"></i>
                Publicados
              </button>
            </div>
            <div class="dev-flows-search">
              <i class="aisc-ico aisc-ico--search"></i>
              <input type="text" id="flowSearchInput" placeholder="Buscar flujos...">
            </div>
          </div>

          <!-- Grid de flujos -->
          <div class="dev-flows-grid" id="devFlowsGrid"></div>

          <!-- Estado vacío (se mostrará si no hay flujos) -->
          <div class="dev-flows-empty" id="devFlowsEmpty" hidden>
            <div class="dev-empty-icon">
              <i class="aisc-ico aisc-ico--flows"></i>
            </div>
            <h3>No tienes flujos creados</h3>
            <p>Crea tu primer flujo de IA para empezar a generar contenido automáticamente</p>
            <button class="btn btn-primary" id="createFlowEmptyBtn">
              <i class="aisc-ico aisc-ico--add"></i>
              Crear mi primer flujo
            </button>
          </div>
        </div>

        <!-- Panel: Todos los flujos (solo Lead) -->
        <div class="dev-flows-scope-panel" data-scope="all" hidden>
          <div class="dev-flows-toolbar">
            <p class="dev-header-subtitle dev-flows-all-hint">Vista Lead: todos los flujos de la plataforma. Editar, probar, ver logs o eliminar cualquier flujo.</p>
          </div>
          <div class="dev-flows-grid" id="allFlowsGrid"></div>
          <div class="dev-flows-empty" id="allFlowsEmpty" hidden>
            <div class="dev-empty-icon">
              <i class="aisc-ico aisc-ico--flows"></i>
            </div>
            <h3>No hay flujos en la plataforma</h3>
            <p>Cuando los desarrolladores creen flujos, aparecerán aquí.</p>
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
    this.setupScopeToggle();
  }

  /** Habilita el toggle "Mis flujos / Todos los flujos" solo para Lead y lo cablea. */
  setupScopeToggle() {
    if (!this.isLead()) return;
    const toggle = document.getElementById('devFlowsScopeToggle');
    if (!toggle) return;
    toggle.hidden = false;

    toggle.querySelectorAll('.dev-scope-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setScope(btn.dataset.scope));
    });

  }

  /** Cambia el panel visible y carga la data del alcance bajo demanda. */
  setScope(scope) {
    if (scope !== 'all' || !this.isLead()) scope = 'mine';
    this.scope = scope;

    document.querySelectorAll('#devFlowsScopeToggle .dev-scope-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scope === scope);
    });
    document.querySelectorAll('.dev-flows-scope-panel').forEach(panel => {
      panel.hidden = panel.dataset.scope !== scope;
    });

    if (scope === 'all' && !this.allFlowsLoaded) this.loadAllFlows();
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
          execution_mode,
          flow_category_type,
          flow_image_url,
          created_at,
          content_categories (name),
          content_subcategories (name)
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
   * Renderizar card de flujo — MISMA estructura que FlowCatalogView.renderFlowCard
   * (la card es una previsualización 1:1 del catálogo público), con un footer
   * dev añadido al final con las acciones edit/test/logs/delete.
   */
  renderFlowCard(flow, opts = {}) {
    const name = this.escapeHtml(flow.name);
    const cost = flow.token_cost ?? 1;
    // En "Todos los flujos" (Lead) mostramos el propietario del flujo.
    const ownerName = opts.showOwner
      ? (this.ownersMap[flow.owner_id]?.full_name || this.ownersMap[flow.owner_id]?.email || (flow.owner_id ? flow.owner_id.slice(0, 8) + '…' : 'Sin propietario'))
      : null;

    const badges = [];
    if (this.isNew(flow)) badges.push('<span class="flow-card-badge flow-card-badge--new">Nuevo</span>');
    if (this.isTrending(flow)) badges.push('<span class="flow-card-badge flow-card-badge--trending">Trending</span>');
    const t = flow.flow_category_type || 'manual';
    const isAutopilotLike = (t === 'autopilot');
    if (isAutopilotLike) badges.push('<span class="flow-card-badge flow-card-badge--auto">Autopilot</span>');

    const img = flow.flow_image_url
      ? (/\.(mp4|webm|mov)(\?|$)/i.test(flow.flow_image_url)
          ? `<video src="${this.escapeHtml(flow.flow_image_url)}" class="flow-card-img" muted loop playsinline autoplay preload="metadata" aria-hidden="true"></video>`
          : `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-card-img" loading="lazy">`)
      : `<div class="flow-card-placeholder"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i></div>`;

    const primaryTag = flow.content_subcategories?.name || flow.content_categories?.name || null;
    const primaryTagHtml = primaryTag ? `<span class="flow-card-info-tag">${this.escapeHtml(primaryTag)}</span>` : '';
    const outputTypeLabel = this.getOutputTypeLabel(flow.output_type);
    const executionLabel = this.getExecutionModeLabel(flow.execution_mode);
    const version = (flow.version || '1.0.0').toString();

    return `
      <div class="dev-flow-card-wrapper" data-flow-id="${flow.id}">
        <article class="flow-card flow-card--catalog flow-card--with-footer" data-flow-id="${flow.id}" role="button" tabindex="0">
          <div class="flow-card-media">
            ${img}
            <div class="flow-card-gradient" aria-hidden="true"></div>
            <div class="flow-card-badges">${badges.join('')}</div>
            <div class="flow-card-info">
              <h3 class="flow-card-title">${name}</h3>
              <div class="flow-card-info-meta">
                ${primaryTagHtml}
                <span class="flow-card-info-credits" title="Créditos por ejecución"><i class="aisc-ico aisc-ico--zap"></i>${cost}</span>
              </div>
              <div class="flow-card-info-extra">
                <span class="flow-card-info-pill">${outputTypeLabel}</span>
                <span class="flow-card-info-pill">${executionLabel}</span>
                <span class="flow-card-info-pill">v${version}</span>
                ${ownerName ? `<span class="flow-card-info-pill flow-card-info-pill--owner"><i class="aisc-ico aisc-ico--audience"></i> ${this.escapeHtml(ownerName)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flow-card-footer flow-card-footer--dev">
            <button type="button" class="flow-card-footer-btn edit" title="Editar flujo" data-action="edit" aria-label="Editar"><i class="aisc-ico aisc-ico--edit"></i></button>
            <button type="button" class="flow-card-footer-btn test" title="Probar flujo" data-action="test" aria-label="Probar"><i class="aisc-ico aisc-ico--play"></i></button>
            <button type="button" class="flow-card-footer-btn logs" title="Ver logs" data-action="logs" aria-label="Logs"><i class="aisc-ico aisc-ico--consola-desarrollador"></i></button>
            <button type="button" class="flow-card-footer-btn delete" title="Eliminar flujo" data-action="delete" aria-label="Eliminar"><i class="aisc-ico aisc-ico--delete"></i></button>
          </div>
        </article>
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
  }

  /**
   * Configurar listeners de las cards de flujos
   */
  setupFlowCardListeners(gridSelector = '#devFlowsGrid', allScope = false) {
    const cards = document.querySelectorAll(`${gridSelector} .dev-flow-card-wrapper`);

    cards.forEach(card => {
      const flowId = card.dataset.flowId;

      const clickable = card.querySelector('.flow-card');
      if (clickable) {
        clickable.addEventListener('click', (e) => {
          if (e.target.closest('.flow-card-footer') || e.target.closest('.flow-card-icons')) return;
          this.navigateToBuilder(flowId);
        });
        clickable.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.navigateToBuilder(flowId);
          }
        });
      }

      // Acciones específicas (footer de la card)
      card.querySelectorAll('.flow-card-footer-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          this.handleFlowAction(action, flowId, allScope);
        });
      });
    });
  }

  /**
   * Manejar acción de flujo. allScope = true cuando viene de "Todos los flujos" (Lead).
   */
  handleFlowAction(action, flowId, allScope = false) {
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
        this.showDeleteModal(flowId, allScope);
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
   * Probar un flujo: abre el builder en modo prueba (?test=1). El builder ya
   * tiene el runner real de test (modal + webhook_url_test); reusarlo evita un
   * segundo camino de ejecución paralelo. FEAT-034.
   */
  async testFlow(flowId) {
    if (!flowId) return;
    if (window.router) {
      window.router.navigate(`/dev/builder?flow=${flowId}&test=1`);
    }
  }

  /**
   * Mostrar modal de eliminar (via window.Modal; fallback a confirm nativo).
   */
  showDeleteModal(flowId, allScope = false) {
    this.flowToDelete = flowId;
    // allScope = borrado desde "Todos los flujos" (Lead): sin restricción de owner.
    this.deleteAllScope = allScope === true;

    if (!window.Modal || typeof window.Modal.show !== 'function') {
      if (confirm('¿Eliminar este flujo? Esta acción no se puede deshacer.')) {
        this.confirmDelete();
      } else {
        this.flowToDelete = null;
      }
      return;
    }

    const body = document.createElement('div');
    body.innerHTML = `
      <p>¿Estás seguro de que deseas eliminar este flujo?</p>
      <p class="modal-warning">Esta acción no se puede deshacer.</p>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-modal-cancel>Cancelar</button>
        <button type="button" class="btn btn-danger" data-modal-confirm>Eliminar</button>
      </div>`;

    const { close } = window.Modal.show({
      title: 'Eliminar Flujo',
      body,
      className: 'delete-flow-modal',
      onClose: () => { this.flowToDelete = null; this._deleteModalClose = null; this._deleteConfirmBtn = null; }
    });
    this._deleteModalClose = close;
    this._deleteConfirmBtn = body.querySelector('[data-modal-confirm]');

    body.querySelector('[data-modal-cancel]').addEventListener('click', () => this.hideDeleteModal());
    this._deleteConfirmBtn.addEventListener('click', () => this.confirmDelete());
  }

  /**
   * Ocultar modal de eliminar
   */
  hideDeleteModal() {
    this.flowToDelete = null;
    this.deleteAllScope = false;
    if (this._deleteModalClose) {
      this._deleteModalClose();
      this._deleteModalClose = null;
    }
  }

  /**
   * Confirmar eliminación de flujo
   */
  async confirmDelete() {
    if (!this.flowToDelete || !this.supabase) {
      this.hideDeleteModal();
      return;
    }

    const confirmBtn = this._deleteConfirmBtn;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="aisc-ico fa-spin aisc-ico--loader"></i> Eliminando...';
    }

    try {
      let query = this.supabase
        .from('content_flows')
        .delete()
        .eq('id', this.flowToDelete);
      // En "Mis flujos" se restringe al owner; en "Todos los flujos" (Lead) no.
      if (!this.deleteAllScope) query = query.eq('owner_id', this.userId);

      const { error } = await query;

      if (error) throw error;

      // Remover de las listas locales (ambas pueden contener el flujo)
      const deletedId = this.flowToDelete;
      this.flows = this.flows.filter(f => f.id !== deletedId);
      this.allFlows = this.allFlows.filter(f => f.id !== deletedId);
      if (this.deleteAllScope) this.renderAllFlowsGrid();
      this.applyFilters();
      this.hideDeleteModal();
    } catch (error) {
      console.error('Error eliminando flujo:', error);
      this.showNotification('Error al eliminar el flujo', 'error');
      // El modal sigue abierto: rehabilitar el boton para reintentar.
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Eliminar';
      }
    }
  }

  // ========== Todos los flujos (Lead) ==========

  /** Carga TODOS los flujos de la plataforma + nombres de propietarios. */
  async loadAllFlows(force = false) {
    if (!this.supabase || !this.isLead()) return;
    if (this.allFlowsLoaded && !force) return;

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
          execution_mode,
          flow_category_type,
          flow_image_url,
          created_at,
          owner_id,
          content_categories (name),
          content_subcategories (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.allFlows = Array.isArray(flows) ? flows : [];

      const ownerIds = [...new Set(this.allFlows.map(f => f.owner_id).filter(Boolean))];
      this.ownersMap = {};
      if (ownerIds.length > 0) {
        const { data: profileList } = await this.supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ownerIds);
        (profileList || []).forEach(u => {
          this.ownersMap[u.id] = { full_name: u.full_name, email: u.email };
        });
      }

      this.allFlowsLoaded = true;
      this.renderAllFlowsGrid();
    } catch (error) {
      console.error('Error cargando todos los flujos:', error);
      this.renderAllFlowsGrid();
    }
  }

  /** Galería de TODOS los flujos — mismo formato de cards que "Mis flujos", con el dueño visible. */
  renderAllFlowsGrid() {
    const grid = document.getElementById('allFlowsGrid');
    const empty = document.getElementById('allFlowsEmpty');
    if (!grid) return;

    if (!this.allFlows || this.allFlows.length === 0) {
      grid.style.display = 'none';
      if (empty) empty.style.display = 'flex';
      return;
    }

    grid.style.display = 'grid';
    if (empty) empty.style.display = 'none';

    grid.innerHTML = this.allFlows.map(flow => this.renderFlowCard(flow, { showOwner: true })).join('');
    this.setupFlowCardListeners('#allFlowsGrid', true);
  }

  // ========== Utilidades ==========

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
    const labels = {
      text: 'Texto',
      image: 'Imagen',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
      mixed: 'Mixto'
    };
    return labels[t] || t;
  }

  getExecutionModeLabel(mode) {
    const m = (mode || 'single_step').toLowerCase();
    const labels = { single_step: 'Un paso', multi_step: 'Multi paso', sequential: 'Secuencial' };
    return labels[m] || m;
  }

  getPublishedFlows() {
    const published = this.flows.filter(f => f.status === 'published');
    return published.length > 0 ? published : this.flows;
  }

  isNew(flow) {
    if (!flow.created_at) return false;
    const days = (Date.now() - new Date(flow.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }

  isTrending(flow) {
    const published = this.getPublishedFlows();
    const sorted = [...published].sort((a, b) =>
      (b.run_count || 0) + (b.likes_count || 0) + (b.saves_count || 0) -
      (a.run_count || 0) - (a.likes_count || 0) - (a.saves_count || 0)
    );
    const top = sorted.slice(0, Math.max(5, Math.ceil(published.length * 0.2)));
    return top.some(f => f.id === flow.id);
  }

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

  async onLeave() {
    // Limpieza si es necesaria
  }
}

// Hacer disponible globalmente
window.DevFlowsView = DevFlowsView;
