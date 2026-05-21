/**
 * ProductsListView — Listado de productos de la organización (masonry).
 * Hereda el patrón del Identities original, pero solo productos.
 */
class ProductsListView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.products = [];
    this.productImageById = {};
    this._fallbackEntityId = null;
    this._onResizeBound = null;
  }

  renderHTML() {
    return `
<div class="products-list-page" id="productsListPage">
  <div class="products-list-header">
    <h1 class="products-list-title">Productos</h1>
    <div class="products-list-header-actions">
      <button type="button" class="products-list-add-btn" id="productsListAddBtn" aria-label="Agregar producto">
        <span>+ Producto</span>
      </button>
    </div>
  </div>

  <section class="products-list-section" id="productsListSection" style="display:none;">
    <div class="products-list-section-head">
      <div class="products-list-section-head-main">
        <h2 class="products-list-section-title">Catálogo</h2>
        <span class="products-list-section-count" id="productsListCount">0</span>
      </div>
    </div>
    <div class="products-list-masonry" id="productsListMasonry"></div>
  </section>

  <div class="products-list-empty" id="productsListEmpty" style="display:none;">
    <i class="fas fa-box-open" aria-hidden="true"></i>
    <p>Aún no hay productos. Crea el primero con + Producto.</p>
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
    await this._loadData();
    this._renderProductsMasonry();
    this._setupEventListeners();
  }

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
      console.error('ProductsListView _initSupabase:', e);
    }
  }

  async _loadData() {
    if (!this.supabase || !this.organizationId) {
      this.products = [];
      this.productImageById = {};
      return;
    }

    const orgId = this.organizationId;
    try {
      const fetcher = () => this._fetchProductsData(orgId);
      const result = window.apiClient
        ? await window.apiClient.query(`products-list:${orgId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();

      this.products = result.products;
      this.productImageById = result.productImageById;
      this._fallbackEntityId = result.fallbackEntityId;
    } catch (e) {
      console.error('ProductsListView _loadData:', e);
      if (window.errorLogger) window.errorLogger.capture(e, { source: 'ProductsListView._loadData' });
      this.products = [];
      this.productImageById = {};
      this._fallbackEntityId = null;
    }
  }

  async _fetchProductsData(orgId) {
    const { data: productsData, error: productsError } = await this.supabase
      .from('products')
      .select('id, entity_id, nombre_producto, descripcion_producto, tipo_producto, precio_producto, moneda')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (productsError) throw productsError;

    const products = productsData || [];

    const productIds = products.map((p) => p.id);
    const productImageById = {};
    if (productIds.length) {
      const { data: imagesData, error: imagesError } = await this.supabase
        .from('product_images')
        .select('product_id, image_url, image_order')
        .in('product_id', productIds)
        .not('image_url', 'is', null)
        .order('image_order', { ascending: true });
      if (imagesError) throw imagesError;
      (imagesData || []).forEach((img) => {
        const url = (img.image_url || '').trim();
        if (!url) return;
        if (!productImageById[img.product_id]) productImageById[img.product_id] = url;
      });
    }

    let fallbackEntityId = null;
    const orphan = products.some((p) => !p.entity_id);
    if (orphan) {
      const { data: ents } = await this.supabase
        .from('brand_entities')
        .select('id')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true })
        .limit(1);
      fallbackEntityId = ents?.[0]?.id || null;
    }

    return { products, productImageById, fallbackEntityId };
  }

  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`products-list:${this.organizationId}`);
    }
  }

  async _ensureEntityId() {
    if (!this.supabase || !this.organizationId) return null;
    const { data: rows, error } = await this.supabase
      .from('brand_entities')
      .select('id')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      console.error('ProductsListView _ensureEntityId:', error);
      return null;
    }
    if (rows?.length) return rows[0].id;

    const { data: created, error: insErr } = await this.supabase
      .from('brand_entities')
      .insert({
        organization_id: this.organizationId,
        name: 'Identity principal',
        entity_type: 'other',
        description: null,
      })
      .select('id')
      .single();
    if (insErr) {
      console.error('ProductsListView _ensureEntityId insert:', insErr);
      return null;
    }
    return created?.id || null;
  }

  _navigateToProductDetail(entityId, productId) {
    if (!entityId || !productId || !window.router) return;
    const orgId = this.routeParams?.orgId;
    const orgSlug = this.routeParams?.orgNameSlug;
    let url;
    if (orgId && orgSlug && typeof window.getOrgPathPrefix === 'function') {
      url = `${window.getOrgPathPrefix(orgId, orgSlug)}/product-detail/${entityId}/${productId}`;
    } else if (orgId && orgSlug) {
      url = `/org/${orgId}/${orgSlug}/product-detail/${entityId}/${productId}`;
    } else {
      url = `/product-detail/${entityId}/${productId}`;
    }
    window.router.navigate(url, true);
  }

  async _onAddProduct() {
    if (!this.supabase || !this.organizationId) return;
    const btn = document.getElementById('productsListAddBtn');
    if (btn) btn.disabled = true;
    try {
      const entityId = await this._ensureEntityId();
      if (!entityId) {
        alert('No se pudo obtener una identidad para vincular el producto.');
        return;
      }
      const { data, error } = await this.supabase
        .from('products')
        .insert({
          organization_id: this.organizationId,
          entity_id: entityId,
          tipo_producto: 'otro',
          nombre_producto: 'nuevo producto',
          descripcion_producto: 'Pendiente de descripción.',
          moneda: 'USD',
        })
        .select('id')
        .single();
      if (error) throw error;
      if (!data?.id) return;
      this._invalidateCache();
      this._navigateToProductDetail(entityId, data.id);
    } catch (e) {
      console.error('ProductsListView _onAddProduct:', e);
      alert(e?.message || 'Error al crear el producto');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _renderProductsMasonry() {
    const section = document.getElementById('productsListSection');
    const empty = document.getElementById('productsListEmpty');
    const container = document.getElementById('productsListMasonry');
    const count = document.getElementById('productsListCount');
    if (!container) return;

    if (count) count.textContent = String(this.products.length || 0);

    if (!this.products.length) {
      container.innerHTML = '';
      if (section) section.style.display = 'none';
      if (empty) empty.style.display = '';
      return;
    }
    if (section) section.style.display = '';
    if (empty) empty.style.display = 'none';

    const itemHtmls = this.products.map((p, i) => this._renderProductCard(p, i));

    // Justified rows layout (mismo patrón que Production via window.applyJustifiedLayout).
    container.innerHTML = `<div class="living-masonry-grid products-list-masonry-grid">${itemHtmls.join('')}</div>`;

    const grid = container.querySelector('.living-masonry-grid');
    if (grid && window.applyJustifiedLayout) {
      window.applyJustifiedLayout(grid, { targetHeight: 260 });
    }

    container.querySelectorAll('.product-list-card').forEach((card) => {
      const productId = card.getAttribute('data-product-id');
      const entityId = card.getAttribute('data-entity-id');
      const open = () => {
        if (!productId || !entityId) return;
        this._navigateToProductDetail(entityId, productId);
      };
      card.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          e.preventDefault();
          e.stopPropagation();
          const action = actionBtn.getAttribute('data-action');
          if (action === 'delete') this._onDeleteProduct(productId, actionBtn);
          else if (action === 'duplicate') this._onDuplicateProduct(productId, actionBtn);
          return;
        }
        open();
      });
      card.addEventListener('keydown', (e) => {
        if (e.target.closest('[data-action]')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  async _onDeleteProduct(productId, btn) {
    if (!productId || !this.supabase) return;
    if (!confirm('¿Eliminar este producto? Se borrarán también sus imágenes.')) return;
    if (btn) btn.disabled = true;
    try {
      const { error } = await this.supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      this._invalidateCache();
      await this._loadData();
      this._renderProductsMasonry();
      this._showNotification('Producto eliminado', 'success');
    } catch (e) {
      console.error('ProductsListView _onDeleteProduct:', e);
      this._showNotification(e?.message || 'Error al eliminar el producto', 'error');
      if (btn) btn.disabled = false;
    }
  }

  async _onDuplicateProduct(productId, btn) {
    if (!productId || !this.supabase || !this.organizationId) return;
    if (btn) btn.disabled = true;
    try {
      const { data: product, error: fetchError } = await this.supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
      if (fetchError || !product) throw fetchError || new Error('No se pudo cargar el producto');

      const { id: _id, created_at: _c, updated_at: _u, ...rest } = product;
      const copyData = {
        ...rest,
        nombre_producto: (product.nombre_producto || 'Producto').trim() + ' (copia)',
      };
      const { data: newProduct, error: insertError } = await this.supabase
        .from('products')
        .insert(copyData)
        .select('id')
        .single();
      if (insertError || !newProduct?.id) throw insertError || new Error('No se pudo crear la copia');

      const { data: images } = await this.supabase
        .from('product_images')
        .select('image_url, image_type, image_order')
        .eq('product_id', productId)
        .order('image_order', { ascending: true });
      if (images && images.length) {
        await this.supabase.from('product_images').insert(
          images.map((img) => ({
            product_id: newProduct.id,
            image_url: img.image_url,
            image_type: img.image_type,
            image_order: img.image_order,
          }))
        );
      }

      this._invalidateCache();
      await this._loadData();
      this._renderProductsMasonry();
      this._showNotification('Producto duplicado', 'success');
    } catch (e) {
      console.error('ProductsListView _onDuplicateProduct:', e);
      this._showNotification(e?.message || 'Error al duplicar el producto', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 2rem;
      padding: 0.75rem 1.1rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 10000;
      font-size: 0.85rem;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2800);
  }

  _renderProductCard(p, _i) {
    const imageUrl = this.productImageById[p.id] || '';
    const name = p.nombre_producto || 'Producto';
    const entityId = p.entity_id || this._fallbackEntityId || '';
    const safeName = this.escapeHtml(name);
    return `
      <div class="living-masonry-item">
        <article class="history-image-card product-list-card" data-product-id="${p.id}" data-entity-id="${entityId}" role="button" tabindex="0" aria-label="${safeName}">
          ${imageUrl
            ? `<img src="${this.escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" onerror="this.parentNode.classList.add('product-list-card-broken'); this.outerHTML='<div class=&quot;product-list-card-placeholder&quot;><i class=&quot;fas fa-image&quot; aria-hidden=&quot;true&quot;></i></div>';">`
            : `<div class="product-list-card-placeholder"><i class="fas fa-image" aria-hidden="true"></i></div>`
          }
          <div class="product-list-card-actions">
            <button type="button" class="glass product-list-card-action" data-action="duplicate" title="Duplicar producto" aria-label="Duplicar producto"><i class="fas fa-copy" aria-hidden="true"></i></button>
            <button type="button" class="glass product-list-card-action product-list-card-action--danger" data-action="delete" title="Eliminar producto" aria-label="Eliminar producto"><i class="fas fa-trash" aria-hidden="true"></i></button>
          </div>
          <div class="history-card-flow-name">${safeName}</div>
        </article>
      </div>
    `;
  }

  _setupEventListeners() {
    if (!this._onResizeBound) {
      this._onResizeBound = () => this._renderProductsMasonry();
      window.addEventListener('resize', this._onResizeBound);
    }
    const addBtn = document.getElementById('productsListAddBtn');
    if (addBtn) addBtn.onclick = () => this._onAddProduct();
  }

  async onLeave() {
    if (this._onResizeBound) {
      window.removeEventListener('resize', this._onResizeBound);
      this._onResizeBound = null;
    }
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

window.ProductsListView = ProductsListView;
