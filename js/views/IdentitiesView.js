/**
 * IdentitiesView — Vista unificada de identidades de la organización.
 * Lista todas las brand_entities; al seleccionar una muestra sus
 * productos (tab) y servicios (tab) con CRUD completo.
 *
 * Schema actual:
 *   brand_entities: id, entity_type, name, description, price, currency,
 *                   metadata, organization_id, created_at, updated_at
 *   products:       entity_id → brand_entities.id  (ya no usa brand_container_id)
 *   services:       entity_id NOT NULL → brand_entities.id
 */
class IdentitiesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.entities = [];
    this.currentEntity = null;
    this.activeTab = 'products';
    this.products = [];
    this.services = [];
    this.currentService = null;
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

  <!-- Vista detalle de entidad -->
  <div class="identity-detail-view" id="identityDetailView" style="display:none;">
    <div class="identity-detail-header">
      <button type="button" class="btn btn-ghost" id="backToIdentitiesBtn">
        <i class="fas fa-arrow-left"></i> Identities
      </button>
      <div class="identity-detail-title-wrap">
        <span class="identity-type-badge" id="identityTypeBadge"></span>
        <h1 class="identity-detail-title" id="identityDetailTitle"></h1>
        <span class="identity-detail-price" id="identityDetailPrice"></span>
      </div>
      <div class="identity-detail-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="editIdentityBtn">
          <i class="fas fa-pen"></i> Editar
        </button>
        <button type="button" class="btn btn-ghost btn-danger btn-sm" id="deleteIdentityBtn">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="identity-tabs" role="tablist">
      <button type="button" class="identity-tab active" id="tabProducts" role="tab" data-tab="products">
        <i class="fas fa-cube"></i> Productos
        <span class="identity-tab-count" id="tabProductsCount"></span>
      </button>
      <button type="button" class="identity-tab" id="tabServices" role="tab" data-tab="services">
        <i class="fas fa-concierge-bell"></i> Servicios
        <span class="identity-tab-count" id="tabServicesCount"></span>
      </button>
    </div>

    <!-- Panel Productos -->
    <div class="identity-tab-panel" id="panelProducts" role="tabpanel">
      <div class="identity-panel-actions">
        <button type="button" class="btn btn-primary" id="addProductBtn">
          <i class="fas fa-plus"></i> Nuevo Producto
        </button>
      </div>
      <div class="identity-products-grid" id="identityProductsGrid"></div>
      <div class="identity-panel-empty" id="identityProductsEmpty" style="display:none;">
        <i class="fas fa-box-open"></i>
        <p>Sin productos aún. Crea el primero.</p>
      </div>
    </div>

    <!-- Panel Servicios -->
    <div class="identity-tab-panel" id="panelServices" role="tabpanel" style="display:none;">
      <div class="identity-panel-actions">
        <button type="button" class="btn btn-primary" id="addServiceBtn">
          <i class="fas fa-plus"></i> Nuevo Servicio
        </button>
      </div>
      <div class="identity-services-grid" id="identityServicesGrid"></div>
      <div class="identity-panel-empty" id="identityServicesEmpty" style="display:none;">
        <i class="fas fa-concierge-bell"></i>
        <p>Sin servicios aún. Crea el primero.</p>
      </div>
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

    const entityId = this.routeParams?.entityId;
    if (entityId) {
      await this._loadEntities();
      const entity = this.entities.find(e => e.id === entityId);
      if (entity) {
        await this._showDetail(entity);
      } else {
        await this._renderList();
      }
    } else {
      await this._renderList();
    }

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
    const listView = document.getElementById('identitiesListView');
    const detailView = document.getElementById('identityDetailView');
    if (listView) listView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';
    this.currentEntity = null;

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

    const counts = await this._loadEntityCounts();

    grid.innerHTML = this.entities.map(entity => {
      const c = counts[entity.id] || { products: 0, services: 0 };
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
              <span class="identity-card-stat"><i class="fas fa-cube"></i> ${c.products} producto${c.products !== 1 ? 's' : ''}</span>
              <span class="identity-card-stat"><i class="fas fa-concierge-bell"></i> ${c.services} servicio${c.services !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div class="identity-card-arrow"><i class="fas fa-chevron-right"></i></div>
        </article>`;
    }).join('');

    grid.querySelectorAll('.identity-card').forEach(card => {
      const id = card.getAttribute('data-entity-id');
      const entity = this.entities.find(e => e.id === id);
      if (!entity) return;
      card.addEventListener('click', () => this._showDetail(entity));
      card.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this._showDetail(entity); }
      });
    });
  }

  async _loadEntityCounts() {
    if (!this.supabase || !this.entities.length) return {};
    const counts = {};
    this.entities.forEach(e => { counts[e.id] = { products: 0, services: 0 }; });

    try {
      const entityIds = this.entities.map(e => e.id);

      // Productos: ahora entity_id FK directo a brand_entities
      const { data: pData } = await this.supabase
        .from('products')
        .select('entity_id')
        .in('entity_id', entityIds)
        .eq('organization_id', this.organizationId);
      (pData || []).forEach(p => {
        if (p.entity_id && counts[p.entity_id]) counts[p.entity_id].products++;
      });

      // Servicios: entity_id FK directo a brand_entities
      const { data: svcData } = await this.supabase
        .from('services')
        .select('entity_id')
        .in('entity_id', entityIds)
        .eq('organization_id', this.organizationId);
      (svcData || []).forEach(s => {
        if (s.entity_id && counts[s.entity_id]) counts[s.entity_id].services++;
      });
    } catch (e) {
      console.error('IdentitiesView _loadEntityCounts:', e);
    }

    return counts;
  }

  // ─────────────────────────────────────────────
  // Vista de detalle de entidad
  // ─────────────────────────────────────────────

  async _showDetail(entity) {
    this.currentEntity = entity;

    const listView = document.getElementById('identitiesListView');
    const detailView = document.getElementById('identityDetailView');
    if (listView) listView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';

    const titleEl = document.getElementById('identityDetailTitle');
    const badgeEl = document.getElementById('identityTypeBadge');
    const priceEl = document.getElementById('identityDetailPrice');
    if (titleEl) titleEl.textContent = entity.name;
    if (badgeEl) {
      badgeEl.textContent = this._entityTypeLabel(entity.entity_type);
      badgeEl.className = `identity-type-badge identity-type-${this.escapeHtml(entity.entity_type || 'other')}`;
    }
    if (priceEl) {
      priceEl.textContent = entity.price != null ? `${entity.price} ${entity.currency || 'USD'}` : '';
    }

    this._updateDetailUrl(entity.id);
    await this._switchTab('products');
  }

  _updateDetailUrl(entityId) {
    const orgId = this.routeParams?.orgId;
    const orgSlug = this.routeParams?.orgNameSlug;
    let url;
    if (orgId && orgSlug && typeof window.getOrgPathPrefix === 'function') {
      url = `${window.getOrgPathPrefix(orgId, orgSlug)}/identities/${entityId}`;
    } else if (orgId && orgSlug) {
      url = `/org/${orgId}/${orgSlug}/identities/${entityId}`;
    } else {
      url = `/identities/${entityId}`;
    }
    if (window.history && window.location.pathname !== url) {
      window.history.replaceState({}, '', url);
    }
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
      Object.assign(this.currentEntity, payload);
      // Actualizar header del detalle
      const titleEl = document.getElementById('identityDetailTitle');
      const badgeEl = document.getElementById('identityTypeBadge');
      const priceEl = document.getElementById('identityDetailPrice');
      if (titleEl) titleEl.textContent = payload.name;
      if (badgeEl) {
        badgeEl.textContent = this._entityTypeLabel(payload.entity_type);
        badgeEl.className = `identity-type-badge identity-type-${this.escapeHtml(payload.entity_type || 'other')}`;
      }
      if (priceEl) priceEl.textContent = payload.price != null ? `${payload.price} ${payload.currency || 'USD'}` : '';
    });
  }

  async _deleteEntity(entityId) {
    if (!confirm('¿Eliminar esta identidad? Se eliminarán también sus productos y servicios. Esta acción no se puede deshacer.')) return;
    if (!this.supabase) return;
    const { error } = await this.supabase.from('brand_entities').delete().eq('id', entityId);
    if (error) { this._notify('Error al eliminar.', 'error'); return; }
    this._notify('Identidad eliminada', 'success');
    this._backToList();
  }

  // ─────────────────────────────────────────────
  // Tabs
  // ─────────────────────────────────────────────

  async _switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.identity-tab').forEach(btn =>
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab)
    );
    const panelProducts = document.getElementById('panelProducts');
    const panelServices = document.getElementById('panelServices');
    if (panelProducts) panelProducts.style.display = tab === 'products' ? 'block' : 'none';
    if (panelServices) panelServices.style.display = tab === 'services' ? 'block' : 'none';

    if (tab === 'products') await this._loadProducts();
    else await this._loadServices();
  }

  // ─────────────────────────────────────────────
  // Productos — entity_id es ahora FK directo
  // ─────────────────────────────────────────────

  async _loadProducts() {
    if (!this.supabase || !this.currentEntity) return;
    const grid = document.getElementById('identityProductsGrid');
    const empty = document.getElementById('identityProductsEmpty');
    if (!grid) return;

    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('id, nombre_producto, tipo_producto, precio_producto, moneda, descripcion_producto, entity_id')
        .eq('organization_id', this.organizationId)
        .eq('entity_id', this.currentEntity.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.products = data || [];
    } catch (e) {
      console.error('IdentitiesView _loadProducts:', e);
      this.products = [];
    }

    const countEl = document.getElementById('tabProductsCount');
    if (countEl) countEl.textContent = this.products.length ? `(${this.products.length})` : '';

    if (!this.products.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    const orgId = this.routeParams?.orgId;
    const orgSlug = this.routeParams?.orgNameSlug;

    grid.innerHTML = this.products.map(p => {
      const price = p.precio_producto != null ? `${p.precio_producto} ${p.moneda || 'USD'}` : null;
      const detailUrl = this._productDetailUrl(p, orgId, orgSlug);
      return `
        <article class="identity-product-card" data-product-id="${p.id}" role="button" tabindex="0">
          <div class="product-card-inner">
            <div class="product-card-icon"><i class="fas fa-cube"></i></div>
            <h3 class="product-card-name">${this.escapeHtml(p.nombre_producto || 'Sin nombre')}</h3>
            ${p.descripcion_producto ? `<p class="product-card-desc">${this.escapeHtml(p.descripcion_producto)}</p>` : ''}
            ${price ? `<span class="product-card-price">${this.escapeHtml(price)}</span>` : ''}
            ${p.tipo_producto ? `<span class="product-card-type">${this.escapeHtml(p.tipo_producto)}</span>` : ''}
          </div>
          <a class="product-card-link" href="${detailUrl}" data-router-link aria-label="Ver detalle de ${this.escapeHtml(p.nombre_producto || '')}">
            <i class="fas fa-chevron-right"></i>
          </a>
        </article>`;
    }).join('');

    grid.querySelectorAll('.identity-product-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('a[data-router-link]')) return;
        const id = card.getAttribute('data-product-id');
        const product = this.products.find(p => p.id === id);
        if (!product) return;
        const url = this._productDetailUrl(product, orgId, orgSlug);
        if (window.router) window.router.navigate(url);
      });
      card.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); card.click(); }
      });
    });

    this.updateLinksForRouter();
  }

  /**
   * URL de detalle de producto.
   * Usa entity_id como parámetro de ruta (antes era brand_container_id).
   */
  _productDetailUrl(product, orgId, orgSlug) {
    const entityId = product.entity_id || this.currentEntity?.id || '';
    if (orgId && orgSlug && typeof window.getOrgPathPrefix === 'function') {
      return `${window.getOrgPathPrefix(orgId, orgSlug)}/product-detail/${entityId}/${product.id}`;
    }
    if (orgId && orgSlug) {
      return `/org/${orgId}/${orgSlug}/product-detail/${entityId}/${product.id}`;
    }
    return `/product-detail/${entityId}/${product.id}`;
  }

  async _showNewProductModal() {
    if (!this.supabase || !this.organizationId || !this.currentEntity) return;
    const monedas = ['USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP'];
    const monedaOpts = monedas.map(m => `<option value="${m}">${m}</option>`).join('');
    const tiposProducto = [
      ['bebida','Bebidas'], ['bebida_alcoholica','Bebidas Alcohólicas'], ['agua','Agua'],
      ['energetica','Bebidas Energéticas'], ['alimento','Alimentos'], ['snack','Snacks'],
      ['suplemento_alimenticio','Suplementos'], ['cosmetico','Cosméticos'], ['skincare','Skincare'],
      ['maquillaje','Maquillaje'], ['perfume','Perfumes'], ['cuidado_cabello','Cuidado del Cabello'],
      ['app','Apps/Software'], ['electronico','Electrónicos'], ['smartphone','Smartphones'],
      ['ropa','Ropa'], ['calzado','Calzado'], ['accesorio_moda','Accesorios de Moda'], ['otro','Otros'],
    ];
    const tipoOpts = tiposProducto.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    document.getElementById('identityProductModal')?.remove();
    const html = `
      <div class="modal-overlay" id="identityProductModal">
        <div class="modal">
          <div class="modal-header">
            <h3>Nuevo Producto</h3>
            <button type="button" class="modal-close" id="ipmClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="ipm_nombre">Nombre del producto <span class="form-required">*</span></label>
              <input type="text" id="ipm_nombre" class="form-input" required placeholder="Ej: Producto A">
            </div>
            <div class="form-group">
              <label for="ipm_tipo">Tipo de producto <span class="form-required">*</span></label>
              <select id="ipm_tipo" class="form-input">${tipoOpts}</select>
            </div>
            <div class="form-group">
              <label for="ipm_desc">Descripción <span class="form-required">*</span></label>
              <textarea id="ipm_desc" class="form-input" rows="3" placeholder="Describe el producto"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="ipm_precio">Precio</label>
                <input type="number" id="ipm_precio" class="form-input" step="any" placeholder="0">
              </div>
              <div class="form-group">
                <label for="ipm_moneda">Moneda</label>
                <select id="ipm_moneda" class="form-input">${monedaOpts}</select>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="ipmCancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="ipmSubmit">Crear Producto</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const closeModal = () => document.getElementById('identityProductModal')?.remove();
    document.getElementById('ipmClose')?.addEventListener('click', closeModal);
    document.getElementById('ipmCancel')?.addEventListener('click', closeModal);
    document.getElementById('ipmSubmit')?.addEventListener('click', async () => {
      const nombre = document.getElementById('ipm_nombre')?.value?.trim();
      const desc = document.getElementById('ipm_desc')?.value?.trim();
      const tipo = document.getElementById('ipm_tipo')?.value;
      if (!nombre) { this._notify('El nombre es obligatorio.', 'error'); return; }
      if (!desc) { this._notify('La descripción es obligatoria.', 'error'); return; }
      const payload = {
        nombre_producto: nombre,
        tipo_producto: tipo || 'otro',
        descripcion_producto: desc,
        precio_producto: parseFloat(document.getElementById('ipm_precio')?.value) || null,
        moneda: document.getElementById('ipm_moneda')?.value || 'USD',
        organization_id: this.organizationId,
        entity_id: this.currentEntity.id,
      };
      const { data, error } = await this.supabase.from('products').insert(payload).select('id').single();
      if (error) { this._notify('Error al crear el producto.', 'error'); console.error(error); return; }
      closeModal();
      this._notify('Producto creado', 'success');
      if (data?.id) {
        const url = this._productDetailUrl(
          { id: data.id, entity_id: this.currentEntity.id },
          this.routeParams?.orgId,
          this.routeParams?.orgNameSlug
        );
        if (window.router) window.router.navigate(url);
      } else {
        await this._loadProducts();
      }
    });
  }

  // ─────────────────────────────────────────────
  // Servicios
  // ─────────────────────────────────────────────

  async _loadServices() {
    if (!this.supabase || !this.currentEntity) return;
    const grid = document.getElementById('identityServicesGrid');
    const empty = document.getElementById('identityServicesEmpty');
    if (!grid) return;

    try {
      const { data, error } = await this.supabase
        .from('services')
        .select('id, nombre_servicio, descripcion_servicio, duracion_estimada, precio_base, moneda, beneficios_principales, diferenciadores, casos_de_uso, entregables, metodologia_pasos, url_servicio')
        .eq('organization_id', this.organizationId)
        .eq('entity_id', this.currentEntity.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.services = data || [];
    } catch (e) {
      console.error('IdentitiesView _loadServices:', e);
      this.services = [];
    }

    const countEl = document.getElementById('tabServicesCount');
    if (countEl) countEl.textContent = this.services.length ? `(${this.services.length})` : '';

    if (!this.services.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = this.services.map(s => {
      const price = s.precio_base != null ? `${s.precio_base} ${s.moneda || 'USD'}` : null;
      return `
        <article class="identity-service-card" data-service-id="${s.id}" role="button" tabindex="0">
          <h3 class="service-card-name">${this.escapeHtml(s.nombre_servicio)}</h3>
          ${s.descripcion_servicio ? `<p class="service-card-desc">${this.escapeHtml(s.descripcion_servicio)}</p>` : ''}
          <div class="service-card-meta">
            ${price ? `<span class="service-card-price">${this.escapeHtml(price)}</span>` : ''}
            ${s.duracion_estimada ? `<span class="service-card-duration"><i class="fas fa-clock"></i> ${this.escapeHtml(s.duracion_estimada)}</span>` : ''}
          </div>
          ${(s.beneficios_principales || []).length ? `
            <div class="service-card-benefits">
              ${s.beneficios_principales.slice(0, 3).map(b => `<span class="service-tag">${this.escapeHtml(b)}</span>`).join('')}
            </div>` : ''}
        </article>`;
    }).join('');

    grid.querySelectorAll('.identity-service-card').forEach(card => {
      const id = card.getAttribute('data-service-id');
      card.addEventListener('click', () => this._showServiceDetail(id));
      card.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this._showServiceDetail(id); }
      });
    });
  }

  async _showServiceDetail(serviceId) {
    if (!this.supabase || !serviceId) return;
    try {
      const { data, error } = await this.supabase.from('services').select('*').eq('id', serviceId).single();
      if (error || !data) return;
      this.currentService = data;
      this._openServiceModal('Editar Servicio', data, (id, payload) => this._updateService(id, payload));
    } catch (e) {
      console.error('IdentitiesView _showServiceDetail:', e);
    }
  }

  _buildServiceModalHtml(title, data = {}) {
    const monedas = ['USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP'];
    const monedaOpts = monedas.map(m => `<option value="${m}" ${(data.moneda || 'USD') === m ? 'selected' : ''}>${m}</option>`).join('');
    const arrToText = key => (Array.isArray(data[key]) ? data[key].join('\n') : (data[key] || ''));
    const taField = (id, label, key, ph = '') => `
      <div class="form-group">
        <label for="${id}">${label} <span class="form-hint">(uno por línea)</span></label>
        <textarea id="${id}" class="form-input" rows="3" placeholder="${ph}">${this.escapeHtml(arrToText(key))}</textarea>
      </div>`;

    return `
      <div class="modal-overlay service-modal-overlay" id="identityServiceModal">
        <div class="modal service-modal">
          <div class="modal-header">
            <h3>${this.escapeHtml(title)}</h3>
            <button type="button" class="modal-close" id="ismClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body service-modal-body">
            <div class="form-group">
              <label for="ism_nombre">Nombre del servicio <span class="form-required">*</span></label>
              <input type="text" id="ism_nombre" class="form-input" required placeholder="Ej: Consultoría estratégica" value="${this.escapeHtml(data.nombre_servicio || '')}">
            </div>
            <div class="form-group">
              <label for="ism_descripcion">Descripción</label>
              <textarea id="ism_descripcion" class="form-input" rows="3" placeholder="Describe qué hace este servicio">${this.escapeHtml(data.descripcion_servicio || '')}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="ism_duracion">Duración estimada</label>
                <input type="text" id="ism_duracion" class="form-input" placeholder="Ej: 2 semanas" value="${this.escapeHtml(data.duracion_estimada || '')}">
              </div>
              <div class="form-group">
                <label for="ism_precio">Precio base</label>
                <input type="number" id="ism_precio" class="form-input" step="any" placeholder="0" value="${data.precio_base != null ? data.precio_base : ''}">
              </div>
              <div class="form-group">
                <label for="ism_moneda">Moneda</label>
                <select id="ism_moneda" class="form-input">${monedaOpts}</select>
              </div>
            </div>
            <div class="form-group">
              <label for="ism_url">URL del servicio</label>
              <input type="url" id="ism_url" class="form-input" placeholder="https://" value="${this.escapeHtml(data.url_servicio || '')}">
            </div>
            ${taField('ism_beneficios', 'Beneficios principales', 'beneficios_principales', 'Principales beneficios...')}
            ${taField('ism_diferenciadores', 'Diferenciadores', 'diferenciadores', 'Qué lo hace único...')}
            ${taField('ism_casos', 'Casos de uso', 'casos_de_uso', 'Cuándo usar este servicio...')}
            ${taField('ism_entregables', 'Entregables', 'entregables', 'Qué se entrega al cliente...')}
            ${taField('ism_metodologia', 'Metodología / Pasos', 'metodologia_pasos', 'Paso 1: ...\nPaso 2: ...')}
          </div>
          <div class="modal-footer">
            ${data.id ? `<button type="button" class="btn btn-ghost btn-danger" id="ismDelete">Eliminar</button>` : ''}
            <button type="button" class="btn btn-ghost" id="ismCancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="ismSubmit">Guardar</button>
          </div>
        </div>
      </div>`;
  }

  _collectServiceModalData() {
    const toArr = id => {
      const el = document.getElementById(id);
      if (!el) return [];
      return el.value.split(/\n/).map(s => s.trim()).filter(Boolean);
    };
    const precioRaw = document.getElementById('ism_precio')?.value;
    return {
      nombre_servicio: document.getElementById('ism_nombre')?.value?.trim() || '',
      descripcion_servicio: document.getElementById('ism_descripcion')?.value?.trim() || null,
      duracion_estimada: document.getElementById('ism_duracion')?.value?.trim() || null,
      precio_base: precioRaw ? parseFloat(precioRaw) : null,
      moneda: document.getElementById('ism_moneda')?.value || 'USD',
      url_servicio: document.getElementById('ism_url')?.value?.trim() || null,
      beneficios_principales: toArr('ism_beneficios'),
      diferenciadores: toArr('ism_diferenciadores'),
      casos_de_uso: toArr('ism_casos'),
      entregables: toArr('ism_entregables'),
      metodologia_pasos: toArr('ism_metodologia'),
    };
  }

  _openServiceModal(title, data, onSubmit) {
    document.getElementById('identityServiceModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', this._buildServiceModalHtml(title, data));
    const closeModal = () => document.getElementById('identityServiceModal')?.remove();
    document.getElementById('ismClose')?.addEventListener('click', closeModal);
    document.getElementById('ismCancel')?.addEventListener('click', closeModal);
    document.getElementById('ismSubmit')?.addEventListener('click', async () => {
      const payload = this._collectServiceModalData();
      if (!payload.nombre_servicio) { this._notify('El nombre es obligatorio.', 'error'); return; }
      await onSubmit(data.id, payload);
      closeModal();
    });
    document.getElementById('ismDelete')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este servicio? Esta acción no se puede deshacer.')) return;
      await this._deleteService(data.id);
      closeModal();
    });
  }

  async _createService() {
    if (!this.supabase || !this.organizationId || !this.currentEntity) return;
    this._openServiceModal('Nuevo Servicio', {}, async (_id, payload) => {
      const { error } = await this.supabase.from('services').insert({
        ...payload,
        organization_id: this.organizationId,
        entity_id: this.currentEntity.id,
      });
      if (error) { this._notify('Error al crear el servicio.', 'error'); console.error(error); return; }
      this._notify('Servicio creado', 'success');
      await this._loadServices();
    });
  }

  async _updateService(serviceId, payload) {
    if (!this.supabase) return;
    const { error } = await this.supabase
      .from('services')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', serviceId);
    if (error) { this._notify('Error al guardar.', 'error'); return; }
    this._notify('Cambios guardados', 'success');
    await this._loadServices();
  }

  async _deleteService(serviceId) {
    if (!this.supabase) return;
    const { error } = await this.supabase.from('services').delete().eq('id', serviceId);
    if (error) { this._notify('Error al eliminar.', 'error'); return; }
    this._notify('Servicio eliminado', 'success');
    this.currentService = null;
    await this._loadServices();
  }

  // ─────────────────────────────────────────────
  // Event listeners
  // ─────────────────────────────────────────────

  _setupEventListeners() {
    document.getElementById('backToIdentitiesBtn')?.addEventListener('click', () => this._backToList());
    document.getElementById('tabProducts')?.addEventListener('click', () => this._switchTab('products'));
    document.getElementById('tabServices')?.addEventListener('click', () => this._switchTab('services'));
    document.getElementById('addProductBtn')?.addEventListener('click', () => this._showNewProductModal());
    document.getElementById('addServiceBtn')?.addEventListener('click', () => this._createService());
    document.getElementById('addIdentityBtn')?.addEventListener('click', () => this._createEntity());
    document.getElementById('addIdentityEmptyBtn')?.addEventListener('click', () => this._createEntity());
    document.getElementById('editIdentityBtn')?.addEventListener('click', () => {
      if (this.currentEntity) this._editEntity(this.currentEntity);
    });
    document.getElementById('deleteIdentityBtn')?.addEventListener('click', () => {
      if (this.currentEntity) this._deleteEntity(this.currentEntity.id);
    });
  }

  _backToList() {
    const orgId = this.routeParams?.orgId;
    const orgSlug = this.routeParams?.orgNameSlug;
    let url;
    if (orgId && orgSlug && typeof window.getOrgPathPrefix === 'function') {
      url = `${window.getOrgPathPrefix(orgId, orgSlug)}/identities`;
    } else if (orgId && orgSlug) {
      url = `/org/${orgId}/${orgSlug}/identities`;
    } else {
      url = '/identities';
    }
    if (window.history) window.history.replaceState({}, '', url);
    this._renderList();
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
