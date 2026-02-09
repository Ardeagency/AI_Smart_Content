/**
 * DevLeadCategoriesView - Categorías y subcategorías de flujos (solo Lead)
 * CRUD para content_categories y content_subcategories.
 */
class DevLeadCategoriesView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.categories = [];
    this.subcategories = [];
    this.activeTab = 'categories'; // 'categories' | 'subcategories'
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    this.supabase = await this.getSupabaseClient();
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-categories">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-tags"></i> Categorías y subcategorías</h1>
            <p class="dev-header-subtitle">Gestiona categorías y subcategorías para organizar los flujos</p>
          </div>
        </header>

        <div class="dev-lead-tabs">
          <button type="button" class="dev-lead-tab active" data-tab="categories">
            <i class="fas fa-folder"></i> Categorías
          </button>
          <button type="button" class="dev-lead-tab" data-tab="subcategories">
            <i class="fas fa-folder-open"></i> Subcategorías
          </button>
        </div>

        <section class="dev-lead-content dev-lead-categories-panel" id="categoriesPanel">
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-primary" id="addCategoryBtn">
              <i class="fas fa-plus"></i> Nueva categoría
            </button>
          </div>
          <div class="dev-lead-table-wrap">
            <table class="dev-lead-table" id="categoriesTable">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="categoriesBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="categoriesEmpty" style="display: none;">
              <i class="fas fa-folder"></i>
              <p>No hay categorías. Crea la primera.</p>
            </div>
          </div>
        </section>

        <section class="dev-lead-content dev-lead-subcategories-panel" id="subcategoriesPanel" style="display: none;">
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-primary" id="addSubcategoryBtn">
              <i class="fas fa-plus"></i> Nueva subcategoría
            </button>
          </div>
          <div class="dev-lead-table-wrap">
            <table class="dev-lead-table" id="subcategoriesTable">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="subcategoriesBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="subcategoriesEmpty" style="display: none;">
              <i class="fas fa-folder-open"></i>
              <p>No hay subcategorías. Crea la primera.</p>
            </div>
          </div>
        </section>
      </div>

      <!-- Modal categoría -->
      <div class="modal dev-lead-modal" id="categoryModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="categoryModalTitle">Nueva categoría</h3>
            <button type="button" class="modal-close" id="categoryModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="categoryId" value="">
            <div class="form-group">
              <label for="categoryName">Nombre *</label>
              <input type="text" id="categoryName" placeholder="Ej. Marketing" required>
            </div>
            <div class="form-group">
              <label for="categoryDescription">Descripción</label>
              <textarea id="categoryDescription" rows="2" placeholder="Opcional"></textarea>
            </div>
            <div class="form-group">
              <label for="categoryOrder">Orden</label>
              <input type="number" id="categoryOrder" min="0" value="0" placeholder="0">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="categoryModalCancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="categoryModalSave">
              <i class="fas fa-save"></i> Guardar
            </button>
          </div>
        </div>
      </div>

      <!-- Modal subcategoría -->
      <div class="modal dev-lead-modal" id="subcategoryModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="subcategoryModalTitle">Nueva subcategoría</h3>
            <button type="button" class="modal-close" id="subcategoryModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="subcategoryId" value="">
            <div class="form-group">
              <label for="subcategoryName">Nombre *</label>
              <input type="text" id="subcategoryName" placeholder="Ej. Redes sociales" required>
            </div>
            <div class="form-group">
              <label for="subcategoryDescription">Descripción</label>
              <textarea id="subcategoryDescription" rows="2" placeholder="Opcional"></textarea>
            </div>
            <div class="form-group">
              <label for="subcategoryOrder">Orden</label>
              <input type="number" id="subcategoryOrder" min="0" value="0" placeholder="0">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="subcategoryModalCancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="subcategoryModalSave">
              <i class="fas fa-save"></i> Guardar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) return;
    this.loadCategories();
    this.loadSubcategories();
    this.setupTabs();
    this.setupCategoryHandlers();
    this.setupSubcategoryHandlers();
  }

  setupTabs() {
    const tabs = this.container.querySelectorAll('.dev-lead-tab');
    const categoriesPanel = document.getElementById('categoriesPanel');
    const subcategoriesPanel = document.getElementById('subcategoriesPanel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const t = tab.getAttribute('data-tab');
        tabs.forEach(x => x.classList.remove('active'));
        tab.classList.add('active');
        if (t === 'categories') {
          categoriesPanel.style.display = '';
          subcategoriesPanel.style.display = 'none';
        } else {
          categoriesPanel.style.display = 'none';
          subcategoriesPanel.style.display = '';
        }
        this.activeTab = t;
      });
    });
  }

  async loadCategories() {
    const { data, error } = await this.supabase
      .from('content_categories')
      .select('id, name, description, order_index')
      .order('order_index', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error cargando categorías:', error);
      return;
    }
    this.categories = data || [];
    this.renderCategoriesTable();
  }

  renderCategoriesTable() {
    const tbody = document.getElementById('categoriesBody');
    const empty = document.getElementById('categoriesEmpty');
    if (!tbody) return;
    if (this.categories.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = this.categories.map(c => `
      <tr data-id="${c.id}">
        <td>${c.order_index != null ? c.order_index : '-'}</td>
        <td>${this.escapeHtml(c.name)}</td>
        <td>${this.escapeHtml((c.description || '').slice(0, 60))}${(c.description || '').length > 60 ? '…' : ''}</td>
        <td class="dev-lead-actions">
          <button type="button" class="btn-icon edit-category" title="Editar" data-id="${c.id}">
            <i class="fas fa-edit"></i>
          </button>
          <button type="button" class="btn-icon delete-category" title="Eliminar" data-id="${c.id}">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
    this.container.querySelectorAll('.edit-category').forEach(btn => {
      btn.addEventListener('click', () => this.openCategoryModal(btn.getAttribute('data-id')));
    });
    this.container.querySelectorAll('.delete-category').forEach(btn => {
      btn.addEventListener('click', () => this.deleteCategory(btn.getAttribute('data-id')));
    });
  }

  async loadSubcategories() {
    const { data, error } = await this.supabase
      .from('content_subcategories')
      .select('id, name, description, order_index, created_at')
      .order('order_index', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error cargando subcategorías:', error);
      return;
    }
    this.subcategories = data || [];
    this.renderSubcategoriesTable();
  }

  renderSubcategoriesTable() {
    const tbody = document.getElementById('subcategoriesBody');
    const empty = document.getElementById('subcategoriesEmpty');
    if (!tbody) return;
    if (this.subcategories.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = this.subcategories.map(s => `
      <tr data-id="${s.id}">
        <td>${s.order_index != null ? s.order_index : '-'}</td>
        <td>${this.escapeHtml(s.name)}</td>
        <td>${this.escapeHtml((s.description || '').slice(0, 60))}${(s.description || '').length > 60 ? '…' : ''}</td>
        <td class="dev-lead-actions">
          <button type="button" class="btn-icon edit-subcategory" title="Editar" data-id="${s.id}">
            <i class="fas fa-edit"></i>
          </button>
          <button type="button" class="btn-icon delete-subcategory" title="Eliminar" data-id="${s.id}">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
    this.container.querySelectorAll('.edit-subcategory').forEach(btn => {
      btn.addEventListener('click', () => this.openSubcategoryModal(btn.getAttribute('data-id')));
    });
    this.container.querySelectorAll('.delete-subcategory').forEach(btn => {
      btn.addEventListener('click', () => this.deleteSubcategory(btn.getAttribute('data-id')));
    });
  }

  setupCategoryHandlers() {
    const addBtn = document.getElementById('addCategoryBtn');
    if (addBtn) addBtn.addEventListener('click', () => this.openCategoryModal(null));
    const modal = document.getElementById('categoryModal');
    const closeBtn = document.getElementById('categoryModalClose');
    const cancelBtn = document.getElementById('categoryModalCancel');
    const saveBtn = document.getElementById('categoryModalSave');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    if (modal && modal.querySelector('.modal-overlay')) {
      modal.querySelector('.modal-overlay').addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    }
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveCategory());
  }

  setupSubcategoryHandlers() {
    const addBtn = document.getElementById('addSubcategoryBtn');
    if (addBtn) addBtn.addEventListener('click', () => this.openSubcategoryModal(null));
    const modal = document.getElementById('subcategoryModal');
    const closeBtn = document.getElementById('subcategoryModalClose');
    const cancelBtn = document.getElementById('subcategoryModalCancel');
    const saveBtn = document.getElementById('subcategoryModalSave');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    if (modal && modal.querySelector('.modal-overlay')) {
      modal.querySelector('.modal-overlay').addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    }
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveSubcategory());
  }

  openCategoryModal(id) {
    const modal = document.getElementById('categoryModal');
    const titleEl = document.getElementById('categoryModalTitle');
    document.getElementById('categoryId').value = id || '';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryDescription').value = '';
    document.getElementById('categoryOrder').value = '0';
    if (id) {
      const c = this.categories.find(x => x.id === id);
      if (c) {
        if (titleEl) titleEl.textContent = 'Editar categoría';
        document.getElementById('categoryName').value = c.name || '';
        document.getElementById('categoryDescription').value = c.description || '';
        document.getElementById('categoryOrder').value = c.order_index != null ? c.order_index : 0;
      }
    } else {
      if (titleEl) titleEl.textContent = 'Nueva categoría';
    }
    if (modal) { modal.style.display = 'flex'; modal.classList.add('is-open'); }
  }

  async saveCategory() {
    const id = document.getElementById('categoryId').value;
    const name = (document.getElementById('categoryName').value || '').trim();
    if (!name) {
      alert('El nombre es obligatorio.');
      return;
    }
    const description = (document.getElementById('categoryDescription').value || '').trim();
    const orderIndex = parseInt(document.getElementById('categoryOrder').value, 10) || 0;

    if (id) {
      const { error } = await this.supabase
        .from('content_categories')
        .update({ name, description, order_index: orderIndex })
        .eq('id', id);
      if (error) {
        console.error(error);
        alert('Error al actualizar: ' + (error.message || ''));
        return;
      }
    } else {
      const { error } = await this.supabase
        .from('content_categories')
        .insert({ name, description, order_index: orderIndex });
      if (error) {
        console.error(error);
        alert('Error al crear: ' + (error.message || ''));
        return;
      }
    }
    document.getElementById('categoryModal').style.display = 'none';
    await this.loadCategories();
  }

  async deleteCategory(id) {
    const { count } = await this.supabase
      .from('content_flows')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id);
    if (count > 0) {
      alert(`No se puede eliminar: ${count} flujo(s) usan esta categoría. Asigna otra categoría a esos flujos primero.`);
      return;
    }
    if (!confirm('¿Eliminar esta categoría?')) return;
    const { error } = await this.supabase.from('content_categories').delete().eq('id', id);
    if (error) {
      alert('Error al eliminar: ' + (error.message || ''));
      return;
    }
    await this.loadCategories();
  }

  openSubcategoryModal(id) {
    const modal = document.getElementById('subcategoryModal');
    const titleEl = document.getElementById('subcategoryModalTitle');
    document.getElementById('subcategoryId').value = id || '';
    document.getElementById('subcategoryName').value = '';
    document.getElementById('subcategoryDescription').value = '';
    document.getElementById('subcategoryOrder').value = '0';
    if (id) {
      const s = this.subcategories.find(x => x.id === id);
      if (s) {
        if (titleEl) titleEl.textContent = 'Editar subcategoría';
        document.getElementById('subcategoryName').value = s.name || '';
        document.getElementById('subcategoryDescription').value = s.description || '';
        document.getElementById('subcategoryOrder').value = s.order_index != null ? s.order_index : 0;
      }
    } else {
      if (titleEl) titleEl.textContent = 'Nueva subcategoría';
    }
    if (modal) { modal.style.display = 'flex'; modal.classList.add('is-open'); }
  }

  async saveSubcategory() {
    const id = document.getElementById('subcategoryId').value;
    const name = (document.getElementById('subcategoryName').value || '').trim();
    if (!name) {
      alert('El nombre es obligatorio.');
      return;
    }
    const description = (document.getElementById('subcategoryDescription').value || '').trim();
    const orderIndex = parseInt(document.getElementById('subcategoryOrder').value, 10) || 0;

    if (id) {
      const { error } = await this.supabase
        .from('content_subcategories')
        .update({ name, description, order_index: orderIndex })
        .eq('id', id);
      if (error) {
        console.error(error);
        alert('Error al actualizar: ' + (error.message || ''));
        return;
      }
    } else {
      const { error } = await this.supabase
        .from('content_subcategories')
        .insert({ name, description, order_index: orderIndex });
      if (error) {
        console.error(error);
        alert('Error al crear: ' + (error.message || ''));
        return;
      }
    }
    const subModal = document.getElementById('subcategoryModal');
    if (subModal) { subModal.style.display = 'none'; subModal.classList.remove('is-open'); }
    await this.loadSubcategories();
  }

  async deleteSubcategory(id) {
    const { count } = await this.supabase
      .from('content_flows')
      .select('*', { count: 'exact', head: true })
      .eq('subcategory_id', id);
    if (count > 0) {
      alert(`No se puede eliminar: ${count} flujo(s) usan esta subcategoría. Asigna otra subcategoría a esos flujos primero.`);
      return;
    }
    if (!confirm('¿Eliminar esta subcategoría?')) return;
    const { error } = await this.supabase.from('content_subcategories').delete().eq('id', id);
    if (error) {
      alert('Error al eliminar: ' + (error.message || ''));
      return;
    }
    await this.loadSubcategories();
  }

}
window.DevLeadCategoriesView = DevLeadCategoriesView;
