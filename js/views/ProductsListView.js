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
    <div class="products-list-header-actions">
      <button type="button" class="products-list-add-btn" id="productsListAttachBtn" aria-label="${__('Adjuntar producto desde URL o archivos')}">
        <i class="fas fa-paperclip" aria-hidden="true"></i>
        <span>${__('Adjuntar producto')}</span>
      </button>
      <button type="button" class="products-list-add-btn" id="productsListAddBtn" aria-label="${__('Agregar producto')}">
        <span>${__('+ Producto')}</span>
      </button>
    </div>
  </div>

  <section class="products-list-section" id="productsListSection">
    <div class="products-list-section-head">
      <div class="products-list-section-head-main">
        <h2 class="products-list-section-title">${__('Catálogo')}</h2>
        <span class="products-list-section-count" id="productsListCount">0</span>
      </div>
    </div>
    <div class="products-list-masonry" id="productsListMasonry">${this.masonrySkeleton(12, 'products-list-masonry-grid')}</div>
  </section>

  ${this.emptyState({
    id: 'productsListEmpty',
    hidden: true,
    icon: 'fa-box-open',
    iconSrc: '/recursos/icons/Identities.svg',
    title: __('Crea tu primer producto'),
    subtitle: __('Sube fotos o una URL y Vera arma la ficha: beneficios, diferenciadores y caracteristicas. Apareceran aqui como base para tus producciones.'),
    primaryLabel: __('+ Producto'),
    secondaryLabel: __('Adjuntar producto'),
  })}
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
        alert(__('No se pudo obtener una identidad para vincular el producto.'));
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
      alert(e?.message || __('Error al crear el producto'));
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

    const page = document.getElementById('productsListPage');
    if (!this.products.length) {
      container.innerHTML = '';
      if (section) section.style.display = 'none';
      if (empty) empty.style.display = '';
      if (page) page.classList.add('is-empty');
      return;
    }
    if (section) section.style.display = '';
    if (empty) empty.style.display = 'none';
    if (page) page.classList.remove('is-empty');

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
    if (!confirm(__('¿Eliminar este producto? Se borraran tambien sus imagenes.'))) return;
    if (btn) btn.disabled = true;
    try {
      const { error } = await this.supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      this._invalidateCache();
      await this._loadData();
      this._renderProductsMasonry();
      this._showNotification(__('Producto eliminado'), 'success');
    } catch (e) {
      console.error('ProductsListView _onDeleteProduct:', e);
      this._showNotification(e?.message || __('Error al eliminar el producto'), 'error');
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
      if (fetchError || !product) throw fetchError || new Error(__('No se pudo cargar el producto'));

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
      if (insertError || !newProduct?.id) throw insertError || new Error(__('No se pudo crear la copia'));

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
      this._showNotification(__('Producto duplicado'), 'success');
    } catch (e) {
      console.error('ProductsListView _onDuplicateProduct:', e);
      this._showNotification(e?.message || __('Error al duplicar el producto'), 'error');
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
    const name = p.nombre_producto || __('Producto');
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
            <button type="button" class="glass product-list-card-action" data-action="duplicate" title="${__('Duplicar producto')}" aria-label="${__('Duplicar producto')}"><i class="fas fa-copy" aria-hidden="true"></i></button>
            <button type="button" class="glass product-list-card-action product-list-card-action--danger" data-action="delete" title="${__('Eliminar producto')}" aria-label="${__('Eliminar producto')}"><i class="fas fa-trash" aria-hidden="true"></i></button>
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
    const attachBtn = document.getElementById('productsListAttachBtn');
    if (attachBtn) attachBtn.onclick = () => this._onAttachProduct();
    // CTAs del empty state premium
    const emptyAdd = document.querySelector('#productsListEmpty [data-empty-add]');
    if (emptyAdd) emptyAdd.onclick = () => this._onAddProduct();
    const emptyAttach = document.querySelector('#productsListEmpty [data-empty-attach]');
    if (emptyAttach) emptyAttach.onclick = () => this._onAttachProduct();
  }

  _onAttachProduct() {
    if (!window.Modal || typeof window.Modal.show !== 'function') {
      this._showNotification(__('Modal no disponible'), 'error');
      return;
    }
    const body = `
      <div class="attach-product-wizard" data-step="picker">
        <!-- Paso 1: elegir fuente -->
        <section class="attach-product-step attach-product-step--picker" data-panel="picker">
          <p class="attach-product-intro">${__('Elegi como queres que Vera obtenga la informacion del producto. En ambos casos, la ficha se crea automaticamente con los datos detectados.')}</p>
          <div class="attach-product-options">
            <button type="button" class="attach-product-option" data-go="url" aria-label="${__('Adjuntar producto por URL')}">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="fas fa-link" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">${__('URL del producto')}</h4>
              </div>
              <p class="attach-product-option-desc">${__('Pega el enlace de la pagina del producto. Vera leera la URL, extraera nombre, descripcion, precio, imagenes y caracteristicas, y armara la ficha automaticamente.')}</p>
              <span class="attach-product-option-cta">${__('Continuar')} <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
            </button>

            <button type="button" class="attach-product-option" data-go="attach" aria-label="${__('Adjuntar archivos y fotos del producto')}">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="fas fa-paperclip" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">${__('Adjuntar archivos')}</h4>
              </div>
              <p class="attach-product-option-desc">${__('Subi fotos del producto o archivos como PDFs, fichas tecnicas y catalogos. Vera analizara el contenido y construira la ficha automaticamente.')}</p>
              <span class="attach-product-option-cta">${__('Continuar')} <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
            </button>
          </div>
        </section>

        <!-- Paso 2a: URL -->
        <section class="attach-product-step attach-product-step--form" data-panel="url" hidden>
          <label class="attach-product-field">
            <span class="attach-product-field-label">${__('Enlace')}</span>
            <input type="url" class="attach-product-url-input" placeholder="https://..." autocomplete="off" />
          </label>
          <button type="button" class="attach-product-submit" data-action="submit-url">
            <i class="fas fa-magic" aria-hidden="true"></i>
            <span>${__('Analizar URL con Vera')}</span>
          </button>
        </section>

        <!-- Paso 2b: Adjuntar archivos — ambos inputs (fotos + documentos) en una sola pantalla -->
        <section class="attach-product-step attach-product-step--form" data-panel="attach" hidden>
          <div class="attach-product-field-group" data-group="photos">
            <span class="attach-product-field-label">${__('Fotos del producto')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir fotos del producto')}">
              <input type="file" class="attach-product-photos-input" multiple accept="image/jpeg,image/png,image/webp,image/jpg" hidden />
              <i class="fas fa-image" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra fotos o hace click para elegirlas')}</span>
              <span class="attach-product-dropzone-hint">${__('JPG, PNG, WebP · max 10 imagenes · 25MB c/u')}</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>

          <div class="attach-product-field-group" data-group="files">
            <span class="attach-product-field-label">${__('Archivos del producto')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir archivos del producto')}">
              <input type="file" class="attach-product-file-input" multiple accept=".pdf,.doc,.docx,.txt,.md" hidden />
              <i class="fas fa-paperclip" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra archivos o hace click para elegirlos')}</span>
              <span class="attach-product-dropzone-hint">PDF, DOC, DOCX, TXT, MD</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>

          <button type="button" class="attach-product-submit" data-action="submit-attach">
            <i class="fas fa-magic" aria-hidden="true"></i>
            <span>${__('Analizar con Vera')}</span>
          </button>
        </section>

        <!-- Paso 3: Loading -->
        <section class="attach-product-step attach-product-step--loading" data-panel="loading" hidden>
          <div class="attach-product-loading">
            <div class="attach-product-spinner" aria-hidden="true"></div>
            <h4 class="attach-product-loading-title">${__('Creando ficha del producto')}</h4>
            <p class="attach-product-loading-hint" data-loading-hint>${__('Vera esta preparando la ficha. Te redirigimos al detalle en un momento.')}</p>
          </div>
        </section>
      </div>
    `;

    const handle = window.Modal.show({
      title: __('Adjuntar producto'),
      body,
      className: 'attach-product-modal',
    });
    if (!handle) return;
    const root = handle.bodyEl;
    const wizard = root.querySelector('.attach-product-wizard');

    // Inyecta el boton "Volver" en el header del modal (queda junto al titulo).
    const header = handle.modal.querySelector('.modal-header');
    const titleEl = header?.querySelector('h3');
    let backBtn = null;
    let headerLeft = null;
    if (header && titleEl) {
      headerLeft = document.createElement('div');
      headerLeft.className = 'attach-product-header-left';
      backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'attach-product-back';
      backBtn.hidden = true;
      backBtn.setAttribute('aria-label', __('Volver'));
      backBtn.innerHTML = `<i class="fas fa-arrow-left" aria-hidden="true"></i><span>${this.escapeHtml(__('Volver'))}</span>`;
      backBtn.addEventListener('click', () => {
        const currentStep = wizard?.getAttribute('data-step');
        const target = stepConfig[currentStep]?.backTo || 'picker';
        goToStep(target);
      });
      header.insertBefore(headerLeft, header.firstChild);
      headerLeft.appendChild(backBtn);
      headerLeft.appendChild(titleEl);
    }

    const stepConfig = {
      picker:  { title: __('Adjuntar producto'),          icon: null,            back: false, backTo: null     },
      url:     { title: __('URL del producto'),           icon: 'fa-link',       back: true,  backTo: 'picker' },
      attach:  { title: __('Adjuntar archivos'),          icon: 'fa-paperclip',  back: true,  backTo: 'picker' },
      loading: { title: __('Creando ficha del producto'), icon: null,            back: false, backTo: null     },
    };

    const goToStep = (step) => {
      if (!wizard) return;
      wizard.setAttribute('data-step', step);
      root.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-panel') !== step;
      });
      const cfg = stepConfig[step];
      if (cfg && titleEl) {
        const iconHtml = cfg.icon
          ? `<i class="fas ${cfg.icon} attach-product-header-icon" aria-hidden="true"></i>`
          : '';
        titleEl.innerHTML = `${iconHtml}<span>${this.escapeHtml(cfg.title)}</span>`;
      }
      if (backBtn) backBtn.hidden = !(cfg && cfg.back);
      const visible = root.querySelector(`[data-panel="${step}"]`);
      const focusable = visible?.querySelector('input, button');
      try { focusable?.focus(); } catch (_) {}
    };

    root.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(btn.getAttribute('data-go')));
    });

    const urlInput = root.querySelector('.attach-product-url-input');

    // Wiring generico de dropzones, scopeado a un grupo (un panel puede tener varios grupos).
    const wireDropzone = (groupEl, iconClass = 'fa-file') => {
      if (!groupEl) return { input: null, list: null };
      const dropzone = groupEl.querySelector('.attach-product-dropzone');
      const input = groupEl.querySelector('input[type="file"]');
      const list = groupEl.querySelector('.attach-product-file-list');
      const renderList = (files) => {
        if (!list) return;
        if (!files || !files.length) {
          list.hidden = true; list.innerHTML = ''; return;
        }
        list.hidden = false;
        list.innerHTML = Array.from(files).map((f, idx) => {
          const sizeStr = f.size > 1024 * 1024
            ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.max(1, Math.round(f.size / 1024))} KB`;
          return `<li data-idx="${idx}">
            <i class="fas ${iconClass}" aria-hidden="true"></i>
            <span class="attach-product-file-name">${this.escapeHtml(f.name)}</span>
            <span class="attach-product-file-size">${sizeStr}</span>
            <button type="button" class="attach-product-file-remove" data-remove-idx="${idx}" aria-label="${__('Quitar archivo')}" title="${__('Quitar')}"><i class="fas fa-times" aria-hidden="true"></i></button>
          </li>`;
        }).join('');
      };
      const removeFileAt = (idx) => {
        if (!input || !input.files) return;
        const dt = new DataTransfer();
        Array.from(input.files).forEach((f, i) => { if (i !== idx) dt.items.add(f); });
        input.files = dt.files;
        renderList(input.files);
      };
      if (input) input.addEventListener('change', () => renderList(input.files));
      if (list) {
        list.addEventListener('click', (e) => {
          const removeBtn = e.target.closest('[data-remove-idx]');
          if (!removeBtn) return;
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(removeBtn.getAttribute('data-remove-idx'), 10);
          if (!Number.isNaN(idx)) removeFileAt(idx);
        });
      }
      if (dropzone) {
        dropzone.addEventListener('click', (e) => {
          if (e.target.tagName !== 'INPUT') input?.click();
        });
        dropzone.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); }
        });
        ['dragover', 'dragenter'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
          e.preventDefault();
          dropzone.classList.add('is-dragover');
        }));
        ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
          e.preventDefault();
          dropzone.classList.remove('is-dragover');
        }));
        dropzone.addEventListener('drop', (e) => {
          const files = e.dataTransfer?.files;
          if (files && input) { input.files = files; renderList(files); }
        });
      }
      return { input, list };
    };

    const attachPanel = root.querySelector('[data-panel="attach"]');
    const photos = wireDropzone(attachPanel?.querySelector('[data-group="photos"]'), 'fa-image');
    const docs = wireDropzone(attachPanel?.querySelector('[data-group="files"]'), 'fa-file');

    root.querySelector('[data-action="submit-url"]')?.addEventListener('click', async (e) => {
      const submitBtn = e.currentTarget;
      const value = (urlInput?.value || '').trim();
      if (!value) {
        urlInput?.focus();
        this._showNotification(__('Pega una URL primero'), 'error');
        return;
      }
      let parsed;
      try {
        parsed = new URL(value);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error('protocol');
      } catch (_) {
        urlInput?.focus();
        this._showNotification(__('La URL no es valida'), 'error');
        return;
      }
      submitBtn.disabled = true;
      goToStep('loading');
      const hint = root.querySelector('[data-loading-hint]');
      await this._analyzeUrlAndCreateProduct({ url: value, hostname: parsed.hostname, modalHandle: handle, hintEl: hint });
    });

    root.querySelector('[data-action="submit-attach"]')?.addEventListener('click', async (e) => {
      const submitBtn = e.currentTarget;
      const photoFiles = Array.from(photos.input?.files || []);
      const docFiles = Array.from(docs.input?.files || []);

      if (!photoFiles.length && !docFiles.length) {
        this._showNotification(__('Adjunta al menos una foto o un archivo'), 'error');
        return;
      }
      if (photoFiles.length) {
        const invalid = photoFiles.find((f) => !/^image\//.test(f.type));
        if (invalid) return this._showNotification(__('"{name}" no es una imagen', { name: invalid.name }), 'error');
        if (photoFiles.length > 10) return this._showNotification(__('Maximo 10 imagenes por ficha'), 'error');
        const oversize = photoFiles.find((f) => f.size > 25 * 1024 * 1024);
        if (oversize) return this._showNotification(__('"{name}" supera el limite de 25MB', { name: oversize.name }), 'error');
      }

      submitBtn.disabled = true;
      goToStep('loading');
      const hint = root.querySelector('[data-loading-hint]');

      if (photoFiles.length) {
        // Hay fotos: flow completo con OpenAI Vision. Los archivos doc se guardan en
        // metadata.pending_files para procesamiento server-side futuro.
        await this._analyzePhotosAndCreateProduct({
          files: photoFiles,
          docFiles: docFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          modalHandle: handle,
          hintEl: hint,
        });
      } else {
        // Solo archivos doc, sin fotos: placeholder hasta que cableemos extraccion server-side.
        if (hint) hint.textContent = __('Guardando {n} archivo(s) para procesamiento. Te redirigimos al detalle.', { n: docFiles.length });
        await this._createPendingProduct({
          files: docFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          modalHandle: handle,
        });
      }
    });
  }

  async _analyzePhotosAndCreateProduct({ files, docFiles = [], modalHandle, hintEl }) {
    if (!this.supabase || !this.organizationId || !this.userId) {
      this._showNotification(__('Sesion no disponible'), 'error');
      modalHandle?.close();
      return;
    }
    const setHint = (msg) => { if (hintEl) hintEl.textContent = msg; };
    let productId = null;  // declarado fuera para cleanup en error
    try {
      // 1) Crear producto placeholder para tener product_id antes de subir
      setHint(__('Creando producto inicial...'));
      const entityId = await this._ensureEntityId();
      if (!entityId) throw new Error(__('No se pudo obtener una identidad para vincular el producto'));
      const placeholderMetadata = { ai_generated: false, pending_ai_enrichment: true, source: 'photos' };
      if (docFiles.length) {
        placeholderMetadata.pending_files = docFiles;
        placeholderMetadata.source = 'photos+files';
      }
      const { data: created, error: insertError } = await this.supabase
        .from('products')
        .insert({
          organization_id: this.organizationId,
          entity_id: entityId,
          tipo_producto: 'otro',
          nombre_producto: 'Procesando ficha...',
          descripcion_producto: 'Vera esta analizando las fotos. La ficha se completara en unos segundos.',
          moneda: 'USD',
          metadata: placeholderMetadata,
        })
        .select('id')
        .single();
      if (insertError || !created?.id) throw insertError || new Error(__('No se pudo crear el producto'));
      productId = created.id;

      // 2) Subir imagenes a Supabase Storage
      setHint(__('Subiendo {n} {fotos} a storage...', { n: files.length, fotos: files.length === 1 ? __('foto') : __('fotos') }));
      const imageUrls = [];
      for (const file of files) {
        const ext = (file.name?.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        const fileName = `${this.userId}/${productId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: uploadError } = await this.supabase.storage
          .from('product-images')
          .upload(fileName, file, { contentType: file.type, cacheControl: '3600', upsert: false });
        if (uploadError) throw new Error(__('Error subiendo "{file}": {msg}', { file: file.name, msg: uploadError.message }));
        const { data: { publicUrl } } = this.supabase.storage.from('product-images').getPublicUrl(fileName);
        imageUrls.push(publicUrl);
      }

      // 3) Llamar a la Netlify function que analiza con OpenAI y cobra creditos
      setHint(__('Vera esta analizando las fotos con OpenAI Vision...'));
      await this._callFicheFunction({
        productId, entityId,
        payload: { product_id: productId, organization_id: this.organizationId, image_urls: imageUrls },
        modalHandle, setHint
      });
      productId = null;  // exito: NO limpiar
    } catch (err) {
      console.error('ProductsListView _analyzePhotosAndCreateProduct:', err);
      if (productId) {
        try { await this.supabase.from('products').delete().eq('id', productId); }
        catch (delErr) { console.warn('No se pudo limpiar placeholder:', delErr); }
        this._invalidateCache();
      }
      modalHandle?.close();
    }
  }

  async _analyzeUrlAndCreateProduct({ url, hostname, modalHandle, hintEl }) {
    if (!this.supabase || !this.organizationId || !this.userId) {
      this._showNotification(__('Sesion no disponible'), 'error');
      modalHandle?.close();
      return;
    }
    const setHint = (msg) => { if (hintEl) hintEl.textContent = msg; };
    let productId = null;  // declarado fuera del try para que el catch pueda limpiarlo
    try {
      // 1) Crear producto placeholder
      setHint(__('Creando producto inicial...'));
      const entityId = await this._ensureEntityId();
      if (!entityId) throw new Error(__('No se pudo obtener una identidad para vincular el producto'));
      const { data: created, error: insertError } = await this.supabase
        .from('products')
        .insert({
          organization_id: this.organizationId,
          entity_id: entityId,
          tipo_producto: 'otro',
          nombre_producto: 'Procesando ficha...',
          descripcion_producto: 'Vera esta leyendo la pagina y armando la ficha. Esto toma unos segundos.',
          moneda: 'USD',
          url_producto: url,
          metadata: { ai_generated: false, pending_ai_enrichment: true, source: 'url', source_url: url },
        })
        .select('id')
        .single();
      if (insertError || !created?.id) throw insertError || new Error(__('No se pudo crear el producto'));
      productId = created.id;

      // 2) Llamar a la function (hace scrape + reupload + OpenAI)
      setHint(__('Leyendo {page} y extrayendo datos del producto...', { page: hostname || __('la pagina') }));
      await this._callFicheFunction({
        productId, entityId,
        payload: { product_id: productId, organization_id: this.organizationId, url },
        modalHandle, setHint
      });
      productId = null;  // exito: NO limpiar el producto creado
    } catch (err) {
      console.error('ProductsListView _analyzeUrlAndCreateProduct:', err);
      // Limpiar el placeholder vacio para no dejar basura en BD si fallo el scrape/OpenAI
      if (productId) {
        try { await this.supabase.from('products').delete().eq('id', productId); }
        catch (delErr) { console.warn('No se pudo limpiar placeholder:', delErr); }
        this._invalidateCache();
      }
      modalHandle?.close();
    }
  }

  async _callFicheFunction({ productId, entityId, payload, modalHandle, setHint }) {
    const { data: sessionData } = await this.supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error(__('No hay sesion activa'));

    const resp = await fetch('/.netlify/functions/api-products-generate-fiche', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    // Manejar gateway errors (502/503/504) que no devuelven JSON parseable
    let result;
    try { result = await resp.json(); }
    catch (_) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Gateway HTTP ${resp.status}: ${text.slice(0, 200) || 'sin body'}`);
    }
    if (!resp.ok || !result.ok) {
      const errMsg = result.error || `HTTP ${resp.status}`;
      const detail = result.detail ? ` (${result.detail})` : '';
      if (resp.status === 402) {
        this._showNotification(__('Creditos insuficientes. Necesitas {n} creditos', { n: result.credits_needed?.toFixed?.(4) || '?' }), 'error');
      } else {
        this._showNotification(__('Error generando ficha: {msg}', { msg: `${errMsg}${detail}` }), 'error');
      }
      console.error('[ProductsListView] fiche function error:', result);
      throw new Error(errMsg);
    }

    setHint(__('Ficha generada (costo: {n} creditos). Redirigiendo...', { n: result.credits_charged.toFixed(4) }));
    this._invalidateCache();
    window.apiClient?.invalidate(`nav:credits:${this.organizationId}`);
    modalHandle?.close();
    const imgCount = result.images?.inserted || 0;
    if (result.images?.error) {
      console.warn('[ProductsListView] imagenes no se vincularon:', result.images.error);
      this._showNotification(__('Ficha generada · imagenes no se vincularon: {err}', { err: result.images.error }), 'error');
    } else {
      const sourceLabel = result.source === 'url'
        ? (result.scraped?.brand
            ? __('desde URL ({brand})', { brand: result.scraped.brand })
            : __('desde URL'))
        : __('desde fotos');
      const variantCount = result.variants?.inserted || 0;
      const variantStr = variantCount > 0 ? ` · ${__('{n} variante(s)', { n: variantCount })}` : '';
      this._showNotification(
        __('Ficha generada {source} · {credits} creditos · {n} foto(s)', {
          source: sourceLabel,
          credits: result.credits_charged.toFixed(4),
          n: imgCount,
        }) + variantStr,
        'success'
      );
    }
    this._navigateToProductDetail(entityId, productId);
  }

  async _createPendingProduct({ url = null, files = null, modalHandle = null } = {}) {
    if (!this.supabase || !this.organizationId) {
      this._showNotification(__('Sesion no disponible'), 'error');
      modalHandle?.close();
      return;
    }
    try {
      const entityId = await this._ensureEntityId();
      if (!entityId) throw new Error(__('No se pudo obtener una identidad para vincular el producto'));

      const name = url
        ? this._nameFromUrl(url)
        : (files?.length ? `Producto sin titulo (${files.length} archivo${files.length === 1 ? '' : 's'})` : 'Producto pendiente');

      const metadata = {
        pending_ai_enrichment: true,
        source: url ? 'url' : 'files',
      };
      if (files?.length) metadata.pending_files = files;

      const payload = {
        organization_id: this.organizationId,
        entity_id: entityId,
        tipo_producto: 'otro',
        nombre_producto: name,
        descripcion_producto: 'Vera esta procesando la informacion. La ficha se completara automaticamente.',
        moneda: 'USD',
        metadata,
      };
      if (url) payload.url_producto = url;

      const { data, error } = await this.supabase
        .from('products')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error(__('No se obtuvo el id del producto creado'));

      this._invalidateCache();
      modalHandle?.close();
      this._navigateToProductDetail(entityId, data.id);
    } catch (err) {
      console.error('ProductsListView _createPendingProduct:', err);
      this._showNotification(err?.message || __('No se pudo crear la ficha'), 'error');
      modalHandle?.close();
    }
  }

  _nameFromUrl(url) {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
      const clean = decodeURIComponent(last).replace(/[-_]+/g, ' ').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
      return clean ? clean.replace(/\b\w/g, (c) => c.toUpperCase()) : u.hostname;
    } catch (_) {
      return 'Producto pendiente';
    }
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
