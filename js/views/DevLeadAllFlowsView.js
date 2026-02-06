/**
 * DevLeadAllFlowsView - Todos los flujos (solo Lead)
 * Lista TODOS los content_flows de todos los desarrolladores. Editar, eliminar, configurar.
 */
class DevLeadAllFlowsView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.flows = [];
    this.ownersMap = {}; // id -> { full_name, email }
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
      if (!window.authService.isLead()) {
        if (window.router) window.router.navigate('/dev/dashboard', true);
        return;
      }
    }
    if (window.navigation && (!window.navigation.initialized || window.navigation.currentMode !== 'developer')) {
      window.navigation.currentMode = 'developer';
      window.navigation.initialized = false;
      await window.navigation.render();
    }
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    this.supabase = await this.getSupabaseClient();
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-all-flows">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-project-diagram"></i> Todos los flujos</h1>
            <p class="dev-header-subtitle">Vista Lead: todos los flujos de la plataforma. Editar, eliminar y configurar cualquier flujo.</p>
          </div>
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-secondary" id="refreshAllFlowsBtn">
              <i class="fas fa-sync-alt"></i> Actualizar
            </button>
          </div>
        </header>
        <section class="dev-lead-content">
          <div class="dev-lead-table-wrap">
            <table class="dev-lead-table" id="allFlowsTable">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Categoría</th>
                  <th>Propietario</th>
                  <th>Runs</th>
                  <th>Creado</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="allFlowsBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="allFlowsEmpty" style="display: none;">
              <i class="fas fa-diagram-project"></i>
              <p>No hay flujos en la plataforma.</p>
            </div>
          </div>
        </section>
      </div>

      <div class="modal dev-lead-modal" id="deleteFlowLeadModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3>Eliminar flujo</h3>
            <button type="button" class="modal-close" id="deleteFlowLeadModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <p>¿Eliminar este flujo? Esta acción no se puede deshacer.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="deleteFlowLeadModalCancel">Cancelar</button>
            <button type="button" class="btn btn-primary btn-danger" id="deleteFlowLeadModalConfirm">
              <i class="fas fa-trash"></i> Eliminar
            </button>
          </div>
        </div>
      </div>`;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) return;
    await this.loadAllFlows();
    const refreshBtn = document.getElementById('refreshAllFlowsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadAllFlows());
    this.setupDeleteModal();
  }

  async loadAllFlows() {
    const { data: flows, error } = await this.supabase
      .from('content_flows')
      .select(`
        id,
        name,
        description,
        status,
        output_type,
        run_count,
        created_at,
        owner_id,
        content_categories (name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando flujos:', error);
      this.renderTable([]);
      return;
    }

    this.flows = Array.isArray(flows) ? flows : [];
    const ownerIds = [...new Set(this.flows.map(f => f.owner_id).filter(Boolean))];
    this.ownersMap = {};
    if (ownerIds.length > 0) {
      const { data: users } = await this.supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', ownerIds);
      if (users) {
        users.forEach(u => {
          this.ownersMap[u.id] = { full_name: u.full_name, email: u.email };
        });
      }
    }
    this.renderTable(this.flows);
  }

  renderTable(flows) {
    const tbody = document.getElementById('allFlowsBody');
    const empty = document.getElementById('allFlowsEmpty');
    if (!tbody) return;

    if (!flows || flows.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = flows.map(f => {
      const owner = f.owner_id ? (this.ownersMap[f.owner_id]?.full_name || this.ownersMap[f.owner_id]?.email || f.owner_id?.slice(0, 8) + '…') : 'Sin propietario';
      const statusLabel = this.getStatusLabel(f.status);
      const dateStr = f.created_at ? new Date(f.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '-';
      return `
        <tr data-id="${f.id}">
          <td>
            <strong>${this.escapeHtml(f.name)}</strong>
            ${f.description ? `<br><span class="dev-lead-flow-desc">${this.escapeHtml(this.truncate(f.description, 50))}</span>` : ''}
          </td>
          <td><span class="dev-lead-status dev-lead-status-${f.status}">${statusLabel}</span></td>
          <td>${this.escapeHtml(f.content_categories?.name || f.output_type || '-')}</td>
          <td>${this.escapeHtml(owner)}</td>
          <td>${f.run_count != null ? f.run_count : 0}</td>
          <td>${dateStr}</td>
          <td class="dev-lead-actions">
            <a href="/dev/builder?flow=${f.id}" class="btn-icon" title="Editar en Builder" data-action="edit"><i class="fas fa-edit"></i></a>
            <a href="/dev/test?flow=${f.id}" class="btn-icon" title="Probar" data-action="test"><i class="fas fa-play"></i></a>
            <a href="/dev/logs?flow=${f.id}" class="btn-icon" title="Logs" data-action="logs"><i class="fas fa-terminal"></i></a>
            <button type="button" class="btn-icon delete-flow-lead" title="Eliminar" data-id="${f.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
    }).join('');

    this.container.querySelectorAll('.delete-flow-lead').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showDeleteModal(btn.getAttribute('data-id'));
      });
    });

    this.container.querySelectorAll('a[data-action="edit"]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.router) window.router.navigate(a.getAttribute('href'));
      });
    });
    this.container.querySelectorAll('a[data-action="test"], a[data-action="logs"]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.router) window.router.navigate(a.getAttribute('href'));
      });
    });
  }

  setupDeleteModal() {
    const modal = document.getElementById('deleteFlowLeadModal');
    const closeBtn = document.getElementById('deleteFlowLeadModalClose');
    const cancelBtn = document.getElementById('deleteFlowLeadModalCancel');
    const confirmBtn = document.getElementById('deleteFlowLeadModalConfirm');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    if (modal?.querySelector('.modal-overlay')) {
      modal.querySelector('.modal-overlay').addEventListener('click', () => { modal.style.display = 'none'; });
    }
    if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmDelete());
  }

  showDeleteModal(flowId) {
    this.flowToDelete = flowId;
    const modal = document.getElementById('deleteFlowLeadModal');
    if (modal) modal.style.display = 'flex';
  }

  async confirmDelete() {
    if (!this.flowToDelete || !this.supabase) {
      document.getElementById('deleteFlowLeadModal').style.display = 'none';
      return;
    }
    const confirmBtn = document.getElementById('deleteFlowLeadModalConfirm');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...';
    }
    const { error } = await this.supabase.from('content_flows').delete().eq('id', this.flowToDelete);
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Eliminar';
    }
    document.getElementById('deleteFlowLeadModal').style.display = 'none';
    if (error) {
      alert('Error al eliminar: ' + (error.message || ''));
      return;
    }
    this.flows = this.flows.filter(f => f.id !== this.flowToDelete);
    this.renderTable(this.flows);
  }

  getStatusLabel(status) {
    const labels = { draft: 'Borrador', testing: 'En Pruebas', published: 'Publicado', archived: 'Archivado' };
    return labels[status] || status || '-';
  }

  truncate(text, max) {
    if (!text) return '';
    return text.length <= max ? text : text.slice(0, max) + '…';
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
window.DevLeadAllFlowsView = DevLeadAllFlowsView;
