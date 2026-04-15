/**
 * IdentitiesView — Gestión exclusiva de brand_entities.
 * No incluye páginas/listados de productos o servicios.
 * Solo se mantiene Product Detail como vista independiente.
 */
class IdentitiesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.entities = [];
  }

  renderHTML() {
    return `
<div class="identities-page" id="identitiesPage">

  <!-- Vista lista -->
  <div class="identities-list-view" id="identitiesListView">
    <div class="identities-header">
      <h1 class="identities-title">Identities</h1>
      <button type="button" class="btn btn-primary" id="addIdentityBtn">
        <i class="fas fa-plus"></i> Nueva Identidad
      </button>
    </div>
    <div class="identities-grid" id="identitiesGrid"></div>
    <div class="identities-empty" id="identitiesEmpty" style="display:none;">
      <i class="fas fa-layer-group"></i>
      <p>No hay identidades registradas en esta organización.</p>
      <button type="button" class="btn btn-primary" id="addIdentityEmptyBtn">
        <i class="fas fa-plus"></i> Crear primera identidad
      </button>
    </div>
  </div>

</div>`;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.organizationId =
      this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
  }

  async render() {
    await super.render();
    await this._initSupabase();

    await this._renderList();
    this._setupEventListeners();
  }

  // ─────────────────────────────────────────────
  // Supabase
  // ─────────────────────────────────────────────

  async _initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('IdentitiesView _initSupabase:', e);
    }
  }

  // ─────────────────────────────────────────────
  // Lista de entidades
  // ─────────────────────────────────────────────

  async _loadEntities() {
    if (!this.supabase || !this.organizationId) return [];
    try {
      const { data, error } = await this.supabase
        .from('brand_entities')
        .select('id, name, entity_type, description, price, currency, metadata, created_at')
        .eq('organization_id', this.organizationId)
        .order('name');
      if (error) throw error;
      this.entities = data || [];
      return this.entities;
    } catch (e) {
      console.error('IdentitiesView _loadEntities:', e);
      return [];
    }
  }

  async _renderList() {
    await this._loadEntities();

    const grid = document.getElementById('identitiesGrid');
    const empty = document.getElementById('identitiesEmpty');
    if (!grid) return;

    if (!this.entities.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = this.entities.map(entity => {
      const typeLabel = this._entityTypeLabel(entity.entity_type);
      const priceLabel = entity.price != null
        ? `<span class="identity-card-price">${entity.price} ${entity.currency || 'USD'}</span>`
        : '';
      return `
        <article class="identity-card" data-entity-id="${entity.id}" role="button" tabindex="0" aria-label="${this.escapeHtml(entity.name)}">
          <div class="identity-card-inner">
            <div class="identity-card-top">
              <span class="identity-type-badge identity-type-${this.escapeHtml(entity.entity_type || 'other')}">${this.escapeHtml(typeLabel)}</span>
              ${priceLabel}
            </div>
            <h3 class="identity-card-name">${this.escapeHtml(entity.name)}</h3>
            ${entity.description ? `<p class="identity-card-desc">${this.escapeHtml(entity.description)}</p>` : ''}
            <div class="identity-card-stats">
              <span class="identity-card-stat"><i class="fas fa-fingerprint"></i> ${this.escapeHtml(typeLabel)}</span>
            </div>
          </div>
          <div class="identity-card-actions">
            <button type="button" class="btn btn-ghost btn-sm js-edit-identity" data-id="${entity.id}">
              <i class="fas fa-pen"></i>
            </button>
            <button type="button" class="btn btn-ghost btn-danger btn-sm js-delete-identity" data-id="${entity.id}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </article>`;
    }).join('');

    grid.querySelectorAll('.js-edit-identity').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = btn.getAttribute('data-id');
        const entity = this.entities.find(e => e.id === id);
        if (entity) this._editEntity(entity);
      });
    });
    grid.querySelectorAll('.js-delete-identity').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id) await this._deleteEntity(id);
      });
    });
  }

  // ─────────────────────────────────────────────
  // CRUD de entidades
  // ─────────────────────────────────────────────

  _buildEntityModalHtml(title, data = {}) {
    const monedas = ['USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP'];
    const monedaOpts = monedas.map(m => `<option value="${m}" ${(data.currency || 'USD') === m ? 'selected' : ''}>${m}</option>`).join('');
    const entityTypes = [
      { value: 'persona', label: 'Persona' },
      { value: 'empresa', label: 'Empresa' },
      { value: 'marca', label: 'Marca' },
      { value: 'product', label: 'Producto' },
      { value: 'persona_juridica', label: 'Persona Jurídica' },
      { value: 'other', label: 'Otro' },
    ];
    const typeOpts = entityTypes.map(t =>
      `<option value="${t.value}" ${(data.entity_type || 'other') === t.value ? 'selected' : ''}>${t.label}</option>`
    ).join('');

    return `
      <div class="modal-overlay" id="identityEntityModal">
        <div class="modal">
          <div class="modal-header">
            <h3>${this.escapeHtml(title)}</h3>
            <button type="button" class="modal-close" id="iemClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="iem_nombre">Nombre <span class="form-required">*</span></label>
              <input type="text" id="iem_nombre" class="form-input" required placeholder="Ej: Marca Principal" value="${this.escapeHtml(data.name || '')}">
            </div>
            <div class="form-group">
              <label for="iem_type">Tipo de entidad</label>
              <select id="iem_type" class="form-input">${typeOpts}</select>
            </div>
            <div class="form-group">
              <label for="iem_desc">Descripción</label>
              <textarea id="iem_desc" class="form-input" rows="3" placeholder="Describe esta identidad">${this.escapeHtml(data.description || '')}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="iem_precio">Precio (opcional)</label>
                <input type="number" id="iem_precio" class="form-input" step="any" placeholder="0" value="${data.price != null ? data.price : ''}">
              </div>
              <div class="form-group">
                <label for="iem_moneda">Moneda</label>
                <select id="iem_moneda" class="form-input">${monedaOpts}</select>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="iemCancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="iemSubmit">Guardar</button>
          </div>
        </div>
      </div>`;
  }

  _collectEntityModalData() {
    const precioRaw = document.getElementById('iem_precio')?.value;
    return {
      name: document.getElementById('iem_nombre')?.value?.trim() || '',
      entity_type: document.getElementById('iem_type')?.value || 'other',
      description: document.getElementById('iem_desc')?.value?.trim() || null,
      price: precioRaw ? parseFloat(precioRaw) : null,
      currency: document.getElementById('iem_moneda')?.value || 'USD',
    };
  }

  _openEntityModal(title, data, onSubmit) {
    document.getElementById('identityEntityModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', this._buildEntityModalHtml(title, data));
    const closeModal = () => document.getElementById('identityEntityModal')?.remove();
    document.getElementById('iemClose')?.addEventListener('click', closeModal);
    document.getElementById('iemCancel')?.addEventListener('click', closeModal);
    document.getElementById('iemSubmit')?.addEventListener('click', async () => {
      const payload = this._collectEntityModalData();
      if (!payload.name) { this._notify('El nombre es obligatorio.', 'error'); return; }
      await onSubmit(payload);
      closeModal();
    });
  }

  async _createEntity() {
    if (!this.supabase || !this.organizationId) return;
    this._openEntityModal('Nueva Identidad', {}, async (payload) => {
      const { error } = await this.supabase.from('brand_entities').insert({
        ...payload,
        organization_id: this.organizationId,
      });
      if (error) { this._notify('Error al crear la identidad.', 'error'); return; }
      this._notify('Identidad creada', 'success');
      await this._renderList();
    });
  }

  async _editEntity(entity) {
    if (!this.supabase) return;
    this._openEntityModal('Editar Identidad', entity, async (payload) => {
      const { error } = await this.supabase
        .from('brand_entities')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', entity.id);
      if (error) { this._notify('Error al guardar.', 'error'); return; }
      this._notify('Cambios guardados', 'success');
      await this._renderList();
    });
  }

  async _deleteEntity(entityId) {
    if (!confirm('¿Eliminar esta identidad? Esta acción no se puede deshacer.')) return;
    if (!this.supabase) return;
    const { error } = await this.supabase.from('brand_entities').delete().eq('id', entityId);
    if (error) { this._notify('Error al eliminar.', 'error'); return; }
    this._notify('Identidad eliminada', 'success');
    await this._renderList();
  }

  // ─────────────────────────────────────────────
  // Event listeners
  // ─────────────────────────────────────────────

  _setupEventListeners() {
    document.getElementById('addIdentityBtn')?.addEventListener('click', () => this._createEntity());
    document.getElementById('addIdentityEmptyBtn')?.addEventListener('click', () => this._createEntity());
  }

  // ─────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────

  _entityTypeLabel(type) {
    const map = {
      persona: 'Persona',
      empresa: 'Empresa',
      marca: 'Marca',
      product: 'Producto',
      other: 'Otro',
      persona_juridica: 'Persona Jurídica',
    };
    return map[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Entidad');
  }

  _notify(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `notification notification-${type}`;
    el.style.cssText = `position:fixed;top:80px;right:2rem;padding:1rem 1.5rem;background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};color:#fff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);z-index:10000;animation:slideIn .3s ease;`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.style.animation = 'slideOut .3s ease'; setTimeout(() => el.remove(), 300); }, 3000);
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

window.IdentitiesView = IdentitiesView;
