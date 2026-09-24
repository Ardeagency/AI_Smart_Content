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
        <i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i>
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
    icon: 'aisc-ico aisc-ico--product',
    iconSrc: '/recursos/icons/Identities.svg',
    title: __('Crea tu primer producto'),
    subtitle: __('Sube fotos o una URL y Vera arma la ficha: beneficios, diferenciadores y características. Aparecerán aquí como base para tus producciones.'),
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

  /** Corte: public.elements_full (kind product) por CatalogoDataService, con las fotos por file_id. */
  async _fetchProductsData(orgId) {
    if (!window.CatalogoDatos) return { products: [], productImageById: {}, fallbackEntityId: null };
    const lista = await window.CatalogoDatos.elementos(orgId, 'product');
    const productImageById = {};
    lista.forEach((e) => { if (e.imagen) productImageById[e.id] = e.imagen; });
    return { products: lista, productImageById, fallbackEntityId: null };
  }

  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`products-list:${this.organizationId}`);
    }
  }

  /** En la base nueva no hay «entidad» contenedora: el elemento es su propia identidad. */
  async _ensureEntityId() {
    return null;
  }

  async _onAddProduct() {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const btn = this.container?.querySelector('[id$="AddBtn"]') || document.querySelector('[id$="AddBtn"]');
    if (btn) btn.disabled = true;
    try {
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'product', { nombre_producto: __('nuevo producto'), description: __('Pendiente de descripción.'), tipo_producto: 'otro' });
      if (!creado?.id) throw new Error(__('No se pudo crear'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      if (typeof this._navigateToProductDetail === 'function') this._navigateToProductDetail(creado.id, creado.id);
    } catch (e) {
      console.error('_onAddProduct:', e);
      this._showNotification(e?.message || __('Error al crear'), 'error');
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

  /** Archivar (PATCH archived_at): no se borra, las producciones lo referencian. */
  async _onDeleteProduct(productId, btn) {
    if (!productId || !window.CatalogoDatos) return;
    // Sobre la tarjeta de la que habla (Capas.preguntar); sin tarjeta, confirmación.
    const tarjeta = btn && btn.closest('article');
    const texto = __('¿Quitar este elemento del catálogo? Sus producciones se conservan.');
    const si = tarjeta
      ? await window.Capas.preguntar(tarjeta, { texto, aceptar: __('Quitar') })
      : await window.Capas.confirmar({ titulo: texto, aceptar: __('Quitar'), peligro: true });
    if (!si) return;
    if (btn) btn.disabled = true;
    try {
      const fue = await window.CatalogoDatos.archivar(productId);
      if (!fue) throw new Error(__('No se pudo quitar (¿sin permiso editar_marca?).'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Elemento archivado'), 'success');
    } catch (e) {
      console.error('_onDeleteProduct:', e);
      this._showNotification(e?.message || __('Error al quitar'), 'error');
      if (btn) btn.disabled = false;
    }
  }

  async _onDuplicateProduct(productId, btn) {
    if (!productId || !window.CatalogoDatos) return;
    if (btn) btn.disabled = true;
    try {
      const copia = await window.CatalogoDatos.duplicar(productId);
      if (!copia?.id) throw new Error(__('No se pudo crear la copia'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Duplicado'), 'success');
    } catch (e) {
      console.error('_onDuplicateProduct:', e);
      this._showNotification(e?.message || __('Error al duplicar'), 'error');
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
      z-index: var(--z-modal-backdrop);
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
            : `<div class="product-list-card-placeholder"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>`
          }
          <div class="product-list-card-actions">
            <button type="button" class="glass product-list-card-action" data-action="duplicate" title="${__('Duplicar producto')}" aria-label="${__('Duplicar producto')}"><i class="aisc-ico aisc-ico--copy" aria-hidden="true"></i></button>
            <button type="button" class="glass product-list-card-action product-list-card-action--danger" data-action="delete" title="${__('Eliminar producto')}" aria-label="${__('Eliminar producto')}"><i class="aisc-ico aisc-ico--delete" aria-hidden="true"></i></button>
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
          <p class="attach-product-intro">${__('Elegi como queres que Vera obtenga la información del producto. En ambos casos, la ficha se crea automáticamente con los datos detectados.')}</p>
          <div class="attach-product-options">
            <button type="button" class="attach-product-option" data-go="url" aria-label="${__('Adjuntar producto por URL')}">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="aisc-ico aisc-ico--link" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">${__('URL del producto')}</h4>
              </div>
              <p class="attach-product-option-desc">${__('Pega el enlace de la página del producto. Vera leerá la URL, extraerá nombre, descripción, precio, imágenes y características, y armará la ficha automáticamente.')}</p>
              <span class="attach-product-option-cta">${__('Continuar')} <i class="aisc-ico aisc-ico--arrow-right" aria-hidden="true"></i></span>
            </button>

            <button type="button" class="attach-product-option" data-go="attach" aria-label="${__('Adjuntar archivos y fotos del producto')}">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">${__('Adjuntar archivos')}</h4>
              </div>
              <p class="attach-product-option-desc">${__('Subi fotos del producto o archivos como PDFs, fichas técnicas y catálogos. Vera analizará el contenido y construirá la ficha automáticamente.')}</p>
              <span class="attach-product-option-cta">${__('Continuar')} <i class="aisc-ico aisc-ico--arrow-right" aria-hidden="true"></i></span>
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
            <i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>
            <span>${__('Analizar URL con Vera')}</span>
          </button>
        </section>

        <!-- Paso 2b: Adjuntar archivos — ambos inputs (fotos + documentos) en una sola pantalla -->
        <section class="attach-product-step attach-product-step--form" data-panel="attach" hidden>
          <div class="attach-product-field-group" data-group="photos">
            <span class="attach-product-field-label">${__('Fotos del producto')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir fotos del producto')}">
              <input type="file" class="attach-product-photos-input" multiple accept="image/jpeg,image/png,image/webp,image/jpg" hidden />
              <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra fotos o hace click para elegirlas')}</span>
              <span class="attach-product-dropzone-hint">${__('JPG, PNG, WebP · max 10 imágenes · 25MB c/u')}</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>

          <div class="attach-product-field-group" data-group="files">
            <span class="attach-product-field-label">${__('Archivos del producto')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir archivos del producto')}">
              <input type="file" class="attach-product-file-input" multiple accept=".pdf,.doc,.docx,.txt,.md" hidden />
              <i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra archivos o hace click para elegirlos')}</span>
              <span class="attach-product-dropzone-hint">PDF, DOC, DOCX, TXT, MD</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>

          <button type="button" class="attach-product-submit" data-action="submit-attach">
            <i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>
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

    // La forma PRINCIPAL de la consola: Modal ya trae ← Volver, título con icono y ×.
    const handle = window.Modal.show({
      title: __('Adjuntar producto'),
      body,
      className: 'attach-product-modal',
    });
    if (!handle) return;
    const root = handle.bodyEl;
    const wizard = root.querySelector('.attach-product-wizard');
    const volver = () => {
      const currentStep = wizard?.getAttribute('data-step');
      const target = stepConfig[currentStep]?.backTo || 'picker';
      goToStep(target);
    };

    const stepConfig = {
      picker:  { title: __('Adjuntar producto'),          icon: null,            back: false, backTo: null     },
      url:     { title: __('URL del producto'),           icon: 'aisc-ico aisc-ico--link',       back: true,  backTo: 'picker' },
      attach:  { title: __('Adjuntar archivos'),          icon: 'aisc-ico aisc-ico--paperclip',  back: true,  backTo: 'picker' },
      loading: { title: __('Creando ficha del producto'), icon: null,            back: false, backTo: null     },
    };

    const goToStep = (step) => {
      if (!wizard) return;
      wizard.setAttribute('data-step', step);
      root.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-panel') !== step;
      });
      const cfg = stepConfig[step];
      if (cfg) {
        handle.setTitle(cfg.title, cfg.icon ? `${cfg.icon} attach-product-header-icon` : null);
        handle.setBack(cfg.back ? volver : null);
      }
      const visible = root.querySelector(`[data-panel="${step}"]`);
      const focusable = visible?.querySelector('input, button');
      try { focusable?.focus(); } catch (_) {}
    };

    root.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(btn.getAttribute('data-go')));
    });

    const urlInput = root.querySelector('.attach-product-url-input');

    // Wiring generico de dropzones, scopeado a un grupo (un panel puede tener varios grupos).
    const wireDropzone = (groupEl, iconClass = 'aisc-ico aisc-ico--document') => {
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
            <button type="button" class="attach-product-file-remove" data-remove-idx="${idx}" aria-label="${__('Quitar archivo')}" title="${__('Quitar')}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
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
    const photos = wireDropzone(attachPanel?.querySelector('[data-group="photos"]'), 'aisc-ico aisc-ico--image');
    const docs = wireDropzone(attachPanel?.querySelector('[data-group="files"]'), 'aisc-ico aisc-ico--document');

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
        if (photoFiles.length > 10) return this._showNotification(__('Máximo 10 imágenes por ficha'), 'error');
        const oversize = photoFiles.find((f) => f.size > 25 * 1024 * 1024);
        if (oversize) return this._showNotification(__('"{name}" supera el límite de 25MB', { name: oversize.name }), 'error');
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

  /**
   * Corte: la ficha por IA (api-*-generate-fiche) se apagó con las functions; el
   * elemento se crea con sus fotos (POST /v1/archivos → attributes.imagenes) y
   * la ficha se completa a mano o, más adelante, con el flujo de catálogo.
   */
  async _analyzePhotosAndCreateProduct({ files, modalHandle, hintEl }) {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const setHint = (t) => { if (hintEl) hintEl.textContent = t; };
    try {
      setHint(__('Creando el elemento…'));
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'product', { nombre_producto: __('nuevo producto'), description: __('Pendiente de descripción.') });
      const lista = Array.from(files || []).filter((f) => f && /^image\//.test(f.type || ''));
      for (const f of lista) {
        setHint(__('Subiendo {n}…', { n: f.name }));
        try { await window.CatalogoDatos.subirFoto(this.organizationId, creado.id, f); }
        catch (e) { console.warn('[catalogo] foto:', e?.code || e?.message); if (e?.code === 'sin_api') { setHint(__('Las fotos se suben cuando el borde esté configurado.')); break; } }
      }
      modalHandle?.close?.();
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Elemento creado. La ficha por IA llega con el flujo de catálogo: complétala desde su detalle.'), 'info');
      if (typeof this._navigateToProductDetail === 'function') this._navigateToProductDetail(creado.id, creado.id);
    } catch (e) {
      console.error('_analyzePhotosAndCreateProduct:', e);
      setHint(e?.message || __('No se pudo crear'));
    }
  }

  async _analyzeUrlAndCreateProduct({ url, hostname, modalHandle, hintEl }) {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const setHint = (t) => { if (hintEl) hintEl.textContent = t; };
    try {
      setHint(__('Creando el elemento…'));
      const nombre = typeof this._nameFromUrl === 'function' ? this._nameFromUrl(url) : (hostname || __('nuevo producto'));
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'product', { nombre_producto: nombre || __('nuevo producto'), description: __('Pendiente de descripción.'), url });
      modalHandle?.close?.();
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Elemento creado con su enlace. La lectura automática de la página llega con el flujo de catálogo.'), 'info');
      if (typeof this._navigateToProductDetail === 'function') this._navigateToProductDetail(creado.id, creado.id);
    } catch (e) {
      console.error('_analyzeUrlAndCreateProduct:', e);
      setHint(e?.message || __('No se pudo crear'));
    }
  }

  /** La ficha por IA llega como flujo de catálogo (backend catalogo.enriquecer); aquí solo se dice. */
  async _callFicheFunction({ modalHandle, setHint } = {}) {
    if (typeof setHint === 'function') setHint(__('La ficha por IA llega con el flujo de catálogo.'));
    modalHandle?.close?.();
    return null;
  }

  async _createPendingProduct({ url = null, files = null, modalHandle = null } = {}) {
    return this._analyzePhotosAndCreateProduct({ files: files || [], modalHandle, hintEl: null });
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
