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
    this._modalClose = null;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    this.supabase = await this.getSupabaseClient();
    this.coverBucket = 'images_flows';
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-categories">

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
          <div class="dev-org-grid dev-org-grid--h" id="categoriesGrid"></div>
        </section>

        <section class="dev-lead-content dev-lead-subcategories-panel" id="subcategoriesPanel" hidden>
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-primary" id="addSubcategoryBtn">
              <i class="fas fa-plus"></i> Nueva subcategoría
            </button>
          </div>
          <div class="dev-table-container">
            <table class="dev-table" id="subcategoriesTable">
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
            <div class="dev-lead-empty" id="subcategoriesEmpty" hidden>
              <i class="fas fa-folder-open"></i>
              <p>No hay subcategorías. Crea la primera.</p>
            </div>
          </div>
        </section>
      </div>

    `;
  }

  // FEAT-028: cuerpos de modal migrados a window.Modal (mismos IDs de campo).
  _categoryBody() {
    return `
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
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="categoryIsVisible" checked>
          <span>Visible en catálogo de flows</span>
        </label>
        <span class="field-help">Si está desmarcada, la categoría no aparecerá en el catálogo ni en el menú de flows.</span>
      </div>
      <div class="form-group">
        <label>Portada (imagen o video)</label>
        <div class="dev-lead-cover-preview" id="categoryCoverPreview"></div>
        <input type="file" id="categoryCoverFile" accept="image/*,video/*">
        <small class="form-hint">Se usará como hero visual en el catálogo de flujos.</small>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="categoryModalCancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="categoryModalSave"><i class="fas fa-save"></i> Guardar</button>
      </div>
    `;
  }

  _subcategoryBody() {
    return `
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
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="subcategoryModalCancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="subcategoryModalSave"><i class="fas fa-save"></i> Guardar</button>
      </div>
    `;
  }

  closeModal() {
    if (this._modalClose) this._modalClose();
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
          categoriesPanel.hidden = false; categoriesPanel.style.display = '';
          subcategoriesPanel.style.display = 'none';
        } else {
          categoriesPanel.style.display = 'none';
          subcategoriesPanel.hidden = false; subcategoriesPanel.style.display = '';
        }
        this.activeTab = t;
      });
    });
  }

  async loadCategories() {
    const { data, error } = await this.supabase
      .from('content_categories')
      .select('id, name, description, order_index, cover_url, cover_type, cover_storage_path, is_visible, hidden_at')
      .order('order_index', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error cargando categorías:', error);
      return;
    }
    this.categories = data || [];
    this.renderCategoriesTable();
  }

  renderCategoriesTable() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;
    if (this.categories.length === 0) {
      grid.innerHTML = '<div class="dev-org-grid-state"><i class="fas fa-folder"></i> No hay categorías. Crea la primera.</div>';
      return;
    }
    grid.innerHTML = this.categories.map(c => this.renderCategoryCard(c)).join('');
    this.container.querySelectorAll('.edit-category').forEach(btn => {
      btn.addEventListener('click', () => this.openCategoryModal(btn.getAttribute('data-id')));
    });
    this.container.querySelectorAll('.delete-category').forEach(btn => {
      btn.addEventListener('click', () => this.deleteCategory(btn.getAttribute('data-id')));
    });
  }

  // Card horizontal estilo Organizaciones (misma identidad visual, layout en fila).
  renderCategoryCard(c) {
    const id = this.escapeHtml(c.id);
    const name = this.escapeHtml(c.name || '—');
    const desc = this.escapeHtml(c.description || '');
    const visible = c.is_visible !== false;
    const order = c.order_index != null ? c.order_index : '—';
    let media;
    if (c.cover_url) {
      const url = this.escapeHtml(c.cover_url);
      media = (c.cover_type || '').toLowerCase() === 'video'
        ? `<video src="${url}" class="dev-org-card-img" muted loop playsinline autoplay preload="metadata" aria-hidden="true"></video>`
        : `<img src="${url}" class="dev-org-card-img" alt="${name}" loading="lazy" onerror="this.outerHTML='&lt;div class=&quot;dev-org-card-placeholder&quot;&gt;&lt;i class=&quot;fas fa-folder&quot;&gt;&lt;/i&gt;&lt;/div&gt;'">`;
    } else {
      media = `<div class="dev-org-card-placeholder"><i class="fas fa-folder"></i></div>`;
    }
    return `
      <article class="dev-org-card dev-org-card--h" data-id="${id}">
        <div class="dev-org-card-media dev-org-card-media--h">${media}</div>
        <div class="dev-org-card-h-body">
          <div class="dev-org-card-h-top">
            <h3 class="dev-org-card-h-title">${name}</h3>
            <div class="dev-org-card-actions dev-org-card-actions--h">
              <button type="button" class="dev-org-card-icon-btn edit-category" data-id="${id}" title="Editar" aria-label="Editar"><i class="fas fa-edit"></i></button>
              <button type="button" class="dev-org-card-icon-btn dev-org-card-icon-btn--danger delete-category" data-id="${id}" title="Eliminar" aria-label="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          ${desc ? `<p class="dev-org-card-h-desc">${desc}</p>` : ''}
          <div class="dev-org-card-meta dev-org-card-meta--h">
            <span class="dev-org-card-pill"><i class="fas fa-sort"></i> Orden ${order}</span>
            <span class="dev-org-card-pill ${visible ? '' : 'dev-org-card-pill--muted'}"><i class="fas fa-${visible ? 'eye' : 'eye-slash'}"></i> ${visible ? 'Visible' : 'Oculta'}</span>
          </div>
        </div>
      </article>
    `;
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
  }

  setupSubcategoryHandlers() {
    const addBtn = document.getElementById('addSubcategoryBtn');
    if (addBtn) addBtn.addEventListener('click', () => this.openSubcategoryModal(null));
  }

  openCategoryModal(id) {
    // FEAT-028: mostrar primero (inyecta el body), luego poblar campos.
    const { modal, close } = window.Modal.show({ title: id ? 'Editar categoría' : 'Nueva categoría', body: this._categoryBody(), className: 'dev-lead-modal-content' });
    this._modalClose = close;
    modal.querySelector('#categoryModalCancel')?.addEventListener('click', () => close());
    modal.querySelector('#categoryModalSave')?.addEventListener('click', () => this.saveCategory());
    document.getElementById('categoryId').value = id || '';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryDescription').value = '';
    document.getElementById('categoryOrder').value = '0';
    const isVisibleEl = document.getElementById('categoryIsVisible');
    if (isVisibleEl) isVisibleEl.checked = true;
    const coverPreview = document.getElementById('categoryCoverPreview');
    const coverFileInput = document.getElementById('categoryCoverFile');
    if (coverFileInput) coverFileInput.value = '';
    if (coverPreview) coverPreview.innerHTML = '';
    if (id) {
      const c = this.categories.find(x => x.id === id);
      if (c) {
        document.getElementById('categoryName').value = c.name || '';
        document.getElementById('categoryDescription').value = c.description || '';
        document.getElementById('categoryOrder').value = c.order_index != null ? c.order_index : 0;
        if (isVisibleEl) isVisibleEl.checked = c.is_visible !== false;
        if (coverPreview) {
          if (c.cover_url) {
            const safeUrl = this.escapeHtml(c.cover_url);
            if ((c.cover_type || '').toLowerCase() === 'video') {
              coverPreview.innerHTML = `<video src="${safeUrl}" class="dev-lead-cover-thumb" muted loop playsinline></video>`;
            } else {
              coverPreview.innerHTML = `<img src="${safeUrl}" class="dev-lead-cover-thumb" alt="Portada categoría">`;
            }
          } else {
            coverPreview.innerHTML = '<span class="dev-lead-cover-chip dev-lead-cover-chip--empty">Sin portada</span>';
          }
        }
      }
    } else {
      if (coverPreview) {
        coverPreview.innerHTML = '<span class="dev-lead-cover-chip dev-lead-cover-chip--empty">Sin portada</span>';
      }
    }
  }

  async saveCategory() {
    const id = document.getElementById('categoryId').value;
    const name = (document.getElementById('categoryName').value || '').trim();
    if (!name) {
      this.showNotification('El nombre es obligatorio.', 'warning');
      return;
    }
    const description = (document.getElementById('categoryDescription').value || '').trim();
    const orderIndex = parseInt(document.getElementById('categoryOrder').value, 10) || 0;
    const isVisible = document.getElementById('categoryIsVisible') ? document.getElementById('categoryIsVisible').checked : true;
    const coverFileInput = document.getElementById('categoryCoverFile');
    const coverFile = coverFileInput && coverFileInput.files && coverFileInput.files[0] ? coverFileInput.files[0] : null;

    const basePayload = {
      name,
      description,
      order_index: orderIndex,
      is_visible: isVisible,
      hidden_at: isVisible ? null : new Date().toISOString()
    };

    if (id) {
      const payload = { ...basePayload };
      if (coverFile) {
        try {
          if (!this.supabase || !this.supabase.storage || typeof this.supabase.storage.from !== 'function') {
            throw new Error('Storage no disponible en Supabase.');
          }
          const ext = (coverFile.name && coverFile.name.split('.').pop()) || 'bin';
          const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
          const type = (coverFile.type || '').toLowerCase();
          const isVideo = type.startsWith('video/');
          const coverType = isVideo ? 'video' : 'image';
          const fileName = `category-${id}/${Date.now()}_${Math.random().toString(36).substring(2)}.${safeExt}`;
          const storagePath = `covers/${fileName}`;
          const { error: uploadError } = await this.supabase.storage
            .from(this.coverBucket)
            .upload(storagePath, coverFile, { contentType: coverFile.type || undefined, upsert: true });
          if (uploadError) throw uploadError;
          const { data: urlData } = this.supabase.storage.from(this.coverBucket).getPublicUrl(storagePath);
          if (!urlData || !urlData.publicUrl) {
            throw new Error('No se pudo obtener la URL pública de la portada.');
          }
          payload.cover_url = urlData.publicUrl;
          payload.cover_type = coverType;
          payload.cover_storage_path = storagePath;
        } catch (err) {
          console.error('Error subiendo portada:', err);
          this.showNotification('Error al subir la portada: ' + (err && err.message ? err.message : ''), 'error');
          return;
        }
      }
      const { error } = await this.supabase
        .from('content_categories')
        .update(payload)
        .eq('id', id);
      if (error) {
        console.error(error);
        this.showNotification('Error al actualizar: ' + (error.message || ''), 'error');
        return;
      }
    } else {
      // Crear la categoría primero
      const { data, error } = await this.supabase
        .from('content_categories')
        .insert(basePayload)
        .select('id')
        .single();
      if (error) {
        console.error(error);
        this.showNotification('Error al crear: ' + (error.message || ''), 'error');
        return;
      }
      const newId = data && data.id;
      if (coverFile && newId) {
        try {
          if (!this.supabase || !this.supabase.storage || typeof this.supabase.storage.from !== 'function') {
            throw new Error('Storage no disponible en Supabase.');
          }
          const ext = (coverFile.name && coverFile.name.split('.').pop()) || 'bin';
          const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
          const type = (coverFile.type || '').toLowerCase();
          const isVideo = type.startsWith('video/');
          const coverType = isVideo ? 'video' : 'image';
          const fileName = `category-${newId}/${Date.now()}_${Math.random().toString(36).substring(2)}.${safeExt}`;
          const storagePath = `covers/${fileName}`;
          const { error: uploadError } = await this.supabase.storage
            .from(this.coverBucket)
            .upload(storagePath, coverFile, { contentType: coverFile.type || undefined, upsert: true });
          if (uploadError) throw uploadError;
          const { data: urlData } = this.supabase.storage.from(this.coverBucket).getPublicUrl(storagePath);
          if (urlData && urlData.publicUrl) {
            const { error: updateError } = await this.supabase
              .from('content_categories')
              .update({
                cover_url: urlData.publicUrl,
                cover_type: coverType,
                cover_storage_path: storagePath
              })
              .eq('id', newId);
            if (updateError) {
              console.error('Error guardando portada en la categoría nueva:', updateError);
            }
          }
        } catch (err) {
          console.error('Error subiendo portada para nueva categoría:', err);
          // No bloqueamos la creación de la categoría si la portada falla
        }
      }
    }
    this.closeModal();
    await this.loadCategories();
  }

  async deleteCategory(id) {
    const { count } = await this.supabase
      .from('content_flows')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id);
    if (count > 0) {
      this.showNotification(`No se puede eliminar: ${count} flujo(s) usan esta categoría. Asigna otra categoría a esos flujos primero.`, 'warning');
      return;
    }
    if (!confirm('¿Eliminar esta categoría?')) return;
    const { error } = await this.supabase.from('content_categories').delete().eq('id', id);
    if (error) {
      this.showNotification('Error al eliminar: ' + (error.message || ''), 'error');
      return;
    }
    await this.loadCategories();
  }

  openSubcategoryModal(id) {
    // FEAT-028: mostrar primero, luego poblar.
    const { modal, close } = window.Modal.show({ title: id ? 'Editar subcategoría' : 'Nueva subcategoría', body: this._subcategoryBody(), className: 'dev-lead-modal-content' });
    this._modalClose = close;
    modal.querySelector('#subcategoryModalCancel')?.addEventListener('click', () => close());
    modal.querySelector('#subcategoryModalSave')?.addEventListener('click', () => this.saveSubcategory());
    document.getElementById('subcategoryId').value = id || '';
    document.getElementById('subcategoryName').value = '';
    document.getElementById('subcategoryDescription').value = '';
    document.getElementById('subcategoryOrder').value = '0';
    if (id) {
      const s = this.subcategories.find(x => x.id === id);
      if (s) {
        document.getElementById('subcategoryName').value = s.name || '';
        document.getElementById('subcategoryDescription').value = s.description || '';
        document.getElementById('subcategoryOrder').value = s.order_index != null ? s.order_index : 0;
      }
    }
  }

  async saveSubcategory() {
    const id = document.getElementById('subcategoryId').value;
    const name = (document.getElementById('subcategoryName').value || '').trim();
    if (!name) {
      this.showNotification('El nombre es obligatorio.', 'warning');
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
        this.showNotification('Error al actualizar: ' + (error.message || ''), 'error');
        return;
      }
    } else {
      const { error } = await this.supabase
        .from('content_subcategories')
        .insert({ name, description, order_index: orderIndex });
      if (error) {
        console.error(error);
        this.showNotification('Error al crear: ' + (error.message || ''), 'error');
        return;
      }
    }
    this.closeModal();
    await this.loadSubcategories();
  }

  async deleteSubcategory(id) {
    const { count } = await this.supabase
      .from('content_flows')
      .select('*', { count: 'exact', head: true })
      .eq('subcategory_id', id);
    if (count > 0) {
      this.showNotification(`No se puede eliminar: ${count} flujo(s) usan esta subcategoría. Asigna otra subcategoría a esos flujos primero.`, 'warning');
      return;
    }
    if (!confirm('¿Eliminar esta subcategoría?')) return;
    const { error } = await this.supabase.from('content_subcategories').delete().eq('id', id);
    if (error) {
      this.showNotification('Error al eliminar: ' + (error.message || ''), 'error');
      return;
    }
    await this.loadSubcategories();
  }

}
window.DevLeadCategoriesView = DevLeadCategoriesView;
