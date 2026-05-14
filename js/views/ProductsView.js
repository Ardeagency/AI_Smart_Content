/**
 * ProductsView - Vista de gestión de productos (lista + detalle tipo e-commerce)
 */
const MAX_PRODUCT_IMAGES = 6;

class ProductsView extends BaseView {
  // Back/forward HTML cache: al volver de un detalle de producto al listado,
  // restaura el grid y la posición de scroll de inmediato.
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.productsManager = null;
    this.supabase = null;
    this.userId = null;
    // Detalle de producto
    this.productId = null;
    this.brandId = null;
    this.productData = null;
    this.productImages = [];
    this.productVariants = [];
    this.brandName = '';
  }

  renderHTML() {
    return `
        <!-- Contenido Principal -->
        <div class="main-content">
            <div class="products-container">
                <!-- Main Content -->
                <div class="products-main">
                    <!-- Page Header: estilo imagen (título + All + filtros dropdown + Nuevo Producto) -->
                    <header class="products-page-header">
                        <h1 class="products-page-title">Productos</h1>
                        <div class="products-header-actions">
                            <div class="products-filters-row" role="group" aria-label="Filtrar por tipo">
                                <button type="button" class="products-filter-all active" id="productsFilterAll" data-category="todos">All</button>
                                <div id="categoryTabs" class="products-filter-dropdowns">
                                    <!-- Filtros por tipo_producto (dropdown style) insertados por JS -->
                                </div>
                            </div>
                            <button class="products-btn-new btn-add-product" id="addProductBtn">
                                <i class="fas fa-plus"></i>
                                <span>Nuevo Producto</span>
                            </button>
                        </div>
                    </header>

                    <!-- Products Gallery -->
                <div class="products-gallery" id="productsGallery">
                    <!-- Empty State -->
                    <div class="empty-state" id="emptyState" style="display: none;">
                        <i class="fas fa-box-open"></i>
                        <h3>No hay productos</h3>
                        <p>Aún no has creado ningún producto</p>
                        <button class="btn-primary" onclick="document.getElementById('addProductBtn').click()">
                            <i class="fas fa-plus"></i>
                            Crear Primer Producto
                        </button>
                    </div>

                    <!-- Products Grid -->
                    <div class="products-grid" id="productsGrid" style="display: none;">
                        <!-- Products will be inserted here -->
                    </div>
                </div>
            </div>
        </div>
    `;
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Verificar autenticación usando AuthService
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    } else {
      // Fallback
      const isAuth = await this.checkAuthentication();
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    }

    // Renderizar Navigation si no está visible
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  /**
   * Renderizar la vista: lista de productos o detalle según ruta
   */
  async render() {
    if (!this.container) {
      console.error('Container no encontrado');
      return;
    }

    const params = this.routeParams || {};
    const productId = params.productId;
    const entityId = params.entityId || params.brandId; // brandId como alias legacy
    const orgId = params.orgId;

    if (productId) {
      // Modo detalle
      this.productId = productId;
      this.brandId = entityId || null; // mantiene compatibilidad interna
      this.container.innerHTML = `
        <div class="product-view">
          <div class="product-view-loading">
            <i class="fas fa-spinner"></i>
            <span>Cargando producto...</span>
          </div>
        </div>
      `;
      this.updateLinksForRouter();
      await this.onEnter();

      this.supabase = await this.getSupabaseClient();
      if (!this.supabase) {
        this.container.querySelector('.product-view').innerHTML = `
          <div class="product-view-error">
            <h2>Error de conexión</h2>
            <p>No se pudo conectar al servicio.</p>
          </div>
        `;
        return;
      }

      let product = null;
      let images = [];
      let brandName = '';
      let variants = [];

      try {
        product = await this.loadProductForDetail(productId);
        if (product) {
          const [imgs, entityName, vrs] = await Promise.all([
            this.loadProductImagesForDetail(productId),
            product.entity_id ? this.loadEntityName(product.entity_id) : Promise.resolve(''),
            this.loadProductVariants(productId)
          ]);
          images = imgs;
          brandName = entityName;
          variants = vrs;
        }
      } catch (e) {
        console.error('Error cargando detalle:', e);
      }

      if (!product) {
        this.container.querySelector('.product-view').innerHTML = `
          <div class="product-view-error">
            <h2>Producto no encontrado</h2>
            <p>El producto solicitado no existe o no tienes acceso.</p>
            <a href="${orgId && typeof window.getOrgPathPrefix === 'function' ? (window.getOrgPathPrefix(orgId, window.currentOrgName || '') + '/products') : (orgId ? `/org/${orgId}/products` : '/products')}" class="product-view-back" data-router-link>
              <i class="fas fa-arrow-left"></i> Volver a Productos
            </a>
          </div>
        `;
        this.updateLinksForRouter();
        await this.init();
        await this.updateHeader();
        this.initialized = true;
        return;
      }

      this.productData = product;
      this.productImages = images;
      this.brandName = brandName || 'Marca';
      this.productVariants = variants;

      const backUrl = orgId && typeof window.getOrgPathPrefix === 'function'
        ? (window.getOrgPathPrefix(orgId, window.currentOrgName || '') + '/products')
        : (orgId ? `/org/${orgId}/products` : '/products');
      const html = this.getProductDetailHTML(product, images, brandName || 'Marca', backUrl, variants);
      this.container.innerHTML = html;
      this.updateLinksForRouter();
      await this.init();
      await this.updateHeader();
      this.initialized = true;
      return;
    }
    
    await super.render();
  }

  /**
   * Cargar producto por ID
   */
  async loadProductForDetail(productId) {
    if (!this.supabase || !productId) return null;
      const { data, error } = await this.supabase
        .from('products')
        .select('*')
      .eq('id', productId)
        .single();
    if (error) return null;
    return data;
  }

  /**
   * Cargar imágenes del producto
   */
  async loadProductImagesForDetail(productId) {
    if (!this.supabase || !productId) return [];
      const { data, error } = await this.supabase
        .from('product_images')
      .select('id, image_url, image_type, image_order')
      .eq('product_id', productId)
        .order('image_order', { ascending: true });
    if (error) return [];
    return data || [];
  }

  /**
   * Cargar nombre de entidad (brand_entity) para mostrar en el detalle
   */
  async loadEntityName(entityId) {
    if (!this.supabase || !entityId) return '';
    const { data, error } = await this.supabase
      .from('brand_entities')
      .select('name')
      .eq('id', entityId)
      .single();
    if (error || !data) return '';
    return data.name || '';
  }

  /**
   * Opciones para tipo_producto (select editable)
   */
  getTipoProductoOptions() {
    return [
      { value: 'bebida', label: 'Bebidas' }, { value: 'bebida_alcoholica', label: 'Bebidas Alcohólicas' },
      { value: 'agua', label: 'Agua' }, { value: 'energetica', label: 'Bebidas Energéticas' },
      { value: 'alimento', label: 'Alimentos' }, { value: 'snack', label: 'Snacks' },
      { value: 'suplemento_alimenticio', label: 'Suplementos' }, { value: 'cosmetico', label: 'Cosméticos' },
      { value: 'skincare', label: 'Skincare' }, { value: 'maquillaje', label: 'Maquillaje' },
      { value: 'perfume', label: 'Perfumes' }, { value: 'cuidado_cabello', label: 'Cuidado del Cabello' },
      { value: 'app', label: 'Apps/Software' }, { value: 'electronico', label: 'Electrónicos' },
      { value: 'smartphone', label: 'Smartphones' }, { value: 'ropa', label: 'Ropa' },
      { value: 'calzado', label: 'Calzado' }, { value: 'accesorio_moda', label: 'Accesorios de Moda' },
      { value: 'otro', label: 'Otros' }
    ];
  }

  /**
   * Generar HTML del detalle: ficha técnica con todos los campos editables
   */
  getProductDetailHTML(product, images, brandName, backUrl, variants = []) {
    const mainImage = images.length > 0 ? images[0].image_url : '';
    const thumbnails = images.slice(0, 20);
    const precio = product.precio_producto != null ? String(product.precio_producto) : '';
    const moneda = product.moneda || 'USD';
    const tipoProducto = product.tipo_producto || 'otro';

    const thumbsHtml = thumbnails.map((img, i) => {
      const isPrincipal = (img.image_type || '') === 'principal';
      return `
      <div class="product-view-thumb-wrap" data-index="${i}" data-image-id="${img.id}">
        <div class="product-view-thumb ${i === 0 ? 'active' : ''}" role="button" tabindex="0">
          <img src="${img.image_url}" alt="Miniatura ${i + 1}" loading="lazy">
          <button type="button" class="product-view-thumb-delete" title="Eliminar foto" aria-label="Eliminar foto" data-image-id="${img.id}"><i class="fas fa-times"></i></button>
          ${thumbnails.length > 1 && !isPrincipal ? `<button type="button" class="product-view-thumb-set-principal" title="Establecer como principal" data-image-id="${img.id}"><i class="fas fa-star"></i></button>` : ''}
        </div>
      </div>`;
    }).join('');

    const tipoOpts = this.getTipoProductoOptions();
    const tipoOptionsHtml = tipoOpts.map(o => `<option value="${this.escapeHtml(o.value)}" ${o.value === tipoProducto ? 'selected' : ''}>${this.escapeHtml(o.label)}</option>`).join('');
    const monedas = [{ v: 'USD', l: 'USD' }, { v: 'EUR', l: 'EUR' }, { v: 'MXN', l: 'MXN' }, { v: 'COP', l: 'COP' }, { v: 'ARS', l: 'ARS' }, { v: 'CLP', l: 'CLP' }];
    const monedaOptionsHtml = monedas.map(m => `<option value="${m.v}" ${moneda === m.v ? 'selected' : ''}>${m.l}</option>`).join('');

    const v = (key) => (product[key] ?? '');
    const vArr = (key) => {
      const arr = product[key];
      return Array.isArray(arr) ? arr.join('\n') : (arr || '');
    };
    const rowInput = (label, field, value, type = 'text', placeholder = '') => `
      <div class="product-view-sheet-row">
        <span class="product-view-sheet-label">${this.escapeHtml(label)}</span>
        <input type="${type}" class="product-view-input product-view-input-inline" data-field="${field}" value="${this.escapeHtml(String(value ?? ''))}" ${placeholder ? ` placeholder="${this.escapeHtml(placeholder)}"` : ''} ${type === 'number' ? ' step="any"' : ''}>
      </div>
    `;
    const rowSelect = (label, field, optionsHtml) => `
      <div class="product-view-sheet-row">
        <span class="product-view-sheet-label">${this.escapeHtml(label)}</span>
        <select class="product-view-select product-view-input-inline" data-field="${field}">${optionsHtml}</select>
      </div>
    `;
    const sectionTextarea = (title, field, value, hint = '') => `
      <div class="product-view-sheet-section">
        <h3 class="product-view-sheet-title">${this.escapeHtml(title)}</h3>
        ${hint ? `<p class="product-view-sheet-hint">${this.escapeHtml(hint)}</p>` : ''}
        <textarea class="product-view-textarea product-view-editable" data-field="${field}" rows="3" placeholder="Opcional">${this.escapeHtml(String(value ?? ''))}</textarea>
      </div>
    `;

    const bgStyleAttr = mainImage ? ` style="--product-bg-image: url('${String(mainImage).replace(/'/g, "\\'")}')"` : '';
    return `
      <div class="product-view"${bgStyleAttr}>
        <a href="${backUrl}" class="product-view-back back-to-products-btn" data-back-url="${backUrl}" data-router-link>
          <i class="fas fa-arrow-left"></i> Volver a Identities
        </a>
        <div class="product-view-grid">
          <div class="product-view-gallery">
            <div class="product-view-thumbnails-wrap">
              <div class="product-view-thumbnails" id="productViewThumbnails" style="${thumbnails.length === 0 ? 'display: none;' : ''}">${thumbsHtml}</div>
              <input type="file" id="productViewImageUpload" accept="image/*" multiple style="position: absolute; width: 0; height: 0; opacity: 0; overflow: hidden; pointer-events: none;" aria-label="Añadir fotos al producto">
              <label for="productViewImageUpload" class="product-view-add-btn" id="productViewAddBtn" role="button" aria-label="Añadir fotos" style="${thumbnails.length >= MAX_PRODUCT_IMAGES ? 'display: none;' : ''}"><i class="fas fa-plus"></i></label>
              ${thumbnails.length >= MAX_PRODUCT_IMAGES ? `<span class="product-view-max-hint" aria-live="polite">Máx. ${MAX_PRODUCT_IMAGES} imágenes</span>` : ''}
            </div>
            <div class="product-view-main-wrap">
              ${mainImage
                ? `<img id="productViewMainImage" src="${mainImage}" alt="${this.escapeHtml(product.nombre_producto || '')}" loading="lazy" decoding="async">`
                : `<div class="product-view-loading" style="min-height: 200px;"><i class="fas fa-image"></i><span>Sin imagen</span></div>`
              }
            </div>
          </div>
          <div class="product-view-info">
            <div class="product-view-sheet-row product-view-title-row">
              <label class="product-view-sheet-label">Nombre del producto</label>
              <input type="text" class="product-view-input product-view-title-input" data-field="nombre_producto" value="${this.escapeHtml(product.nombre_producto || '')}" placeholder="Nombre del producto">
            </div>
            <div class="product-view-sheet">
              ${rowSelect('Tipo de producto', 'tipo_producto', tipoOptionsHtml)}
              ${rowInput('Precio', 'precio_producto', precio, 'number', '0')}
              ${rowSelect('Moneda', 'moneda', monedaOptionsHtml)}
              ${rowInput('URL producto', 'url_producto', v('url_producto'), 'url', 'https://')}
            </div>
            ${sectionTextarea('Descripción', 'descripcion_producto', v('descripcion_producto'), 'Resumen general del producto. Lo primero que Vera lee antes de generar.')}
            ${sectionTextarea('Beneficios principales (uno por línea)', 'beneficios_principales', vArr('beneficios_principales'), 'Resultados o promesas para el cliente: qué consigue al usarlo.')}
            ${sectionTextarea('Diferenciadores (uno por línea)', 'diferenciadores', vArr('diferenciadores'), 'Qué lo separa del mercado o de productos similares.')}
            ${sectionTextarea('Casos de uso', 'casos_de_uso', vArr('casos_de_uso'), 'Momentos, contextos o escenarios concretos donde se usa.')}
            ${sectionTextarea('Materiales / composición', 'materiales_composicion', vArr('materiales_composicion'), 'De qué está hecho: ingredientes, materiales, ratios.')}
            ${sectionTextarea('Características visuales (una por línea)', 'caracteristicas_visuales', vArr('caracteristicas_visuales'), 'Lo que Vera necesita ver para representarlo: textura, acabado, color base, formato.')}
            ${this.getProductVariantsHTML(variants || [])}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Eliminar una imagen del producto (storage + product_images)
   */
  async removeProductImage(imageId) {
    if (!this.supabase || !this.productId) return;
    if (!confirm('¿Eliminar esta foto del producto?')) return;
    try {
      const { data: image, error: fetchError } = await this.supabase
        .from('product_images')
        .select('image_url, image_type')
        .eq('id', imageId)
        .single();
      if (fetchError) throw fetchError;

      const wasPrincipal = (image.image_type || '') === 'principal';
      if (image.image_url) {
        try {
          const url = new URL(image.image_url);
          const pathParts = url.pathname.split('/');
          const idx = pathParts.indexOf('product-images');
          if (idx !== -1) {
            const fileName = pathParts.slice(idx + 1).join('/');
            await this.supabase.storage.from('product-images').remove([fileName]);
          }
        } catch (_) { /* ignorar fallo storage */ }
      }

      const { error: deleteError } = await this.supabase
        .from('product_images')
        .delete()
        .eq('id', imageId);
      if (deleteError) throw deleteError;

      if (wasPrincipal) {
        const { data: remaining } = await this.supabase
          .from('product_images')
          .select('id')
          .eq('product_id', this.productId)
          .order('image_order', { ascending: true })
          .limit(1);
        if (remaining && remaining.length > 0) {
          await this.supabase
            .from('product_images')
            .update({ image_type: 'principal' })
            .eq('id', remaining[0].id);
        }
      }
      await this.refreshDetailImages();
      this.showNotification('Foto eliminada', 'success');
    } catch (err) {
      console.error('Error eliminando imagen:', err);
      this.showNotification('Error al eliminar la foto', 'error');
    }
  }

  /**
   * Subir nuevas fotos al producto
   */
  async uploadProductImages(files) {
    if (!this.supabase || !this.productId || !files || files.length === 0) return;
    const { data: { user } } = await this.supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) {
      this.showNotification('Sesión no disponible. Inicia sesión de nuevo.', 'error');
      return;
    }
    const validFiles = Array.from(files).filter((file) => {
      if (file.size > 5 * 1024 * 1024) {
        this.showNotification(`"${file.name}" es demasiado grande (máx. 5MB)`, 'error');
        return false;
      }
      if (!file.type.startsWith('image/')) {
        this.showNotification(`"${file.name}" no es una imagen válida`, 'error');
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;

    try {
      const { count: existingCount } = await this.supabase
        .from('product_images')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', this.productId);
      const currentCount = existingCount ?? 0;
      if (currentCount >= MAX_PRODUCT_IMAGES) {
        this.showNotification(`Máximo ${MAX_PRODUCT_IMAGES} imágenes por producto. Elimina alguna para añadir más.`, 'error');
        return;
      }
      const slotsLeft = MAX_PRODUCT_IMAGES - currentCount;
      const toUpload = validFiles.slice(0, slotsLeft);
      if (toUpload.length < validFiles.length) {
        this.showNotification(`Solo se pueden añadir ${slotsLeft} más (máx. ${MAX_PRODUCT_IMAGES} por producto).`, 'info');
      }

      this.showNotification('Subiendo fotos...', 'info');

      const { data: existing } = await this.supabase
        .from('product_images')
        .select('image_order')
        .eq('product_id', this.productId)
        .order('image_order', { ascending: false })
        .limit(1);
      let nextOrder = (existing && existing.length > 0) ? (existing[0].image_order + 1) : 0;

      for (const file of toUpload) {
        const ext = (file.name && file.name.split('.').pop()) || 'jpg';
        const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        const fileName = `${userId}/${this.productId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${safeExt}`;
        const { error: uploadError } = await this.supabase.storage
          .from('product-images')
          .upload(fileName, file, { contentType: file.type, cacheControl: '3600', upsert: false });
        if (uploadError) {
          console.error('Supabase storage upload error:', uploadError);
          const msg = uploadError.message || 'Error al subir archivo';
          this.showNotification(msg.length > 80 ? msg.slice(0, 80) + '…' : msg, 'error');
          return;
        }

        const { data: { publicUrl } } = this.supabase.storage.from('product-images').getPublicUrl(fileName);
        const { data: hasPrincipal } = await this.supabase
          .from('product_images')
          .select('id')
          .eq('product_id', this.productId)
          .eq('image_type', 'principal')
          .limit(1);
        const imageType = (!hasPrincipal || hasPrincipal.length === 0) && nextOrder === 0 ? 'principal' : 'secundaria';

        const { error: insertError } = await this.supabase
          .from('product_images')
          .insert({
            product_id: this.productId,
            image_url: publicUrl,
            image_type: imageType,
            image_order: nextOrder
          });
        if (insertError) {
          console.error('Supabase product_images insert error:', insertError);
          const msg = insertError.message || 'Error al guardar la imagen en la base de datos';
          this.showNotification(msg.length > 80 ? msg.slice(0, 80) + '…' : msg, 'error');
          return;
        }
        nextOrder++;
      }
      await this.refreshDetailImages();
      this.showNotification(`${toUpload.length} foto(s) añadida(s)`, 'success');
    } catch (err) {
      console.error('Error subiendo imágenes:', err);
      const msg = (err && err.message) ? err.message : 'Error al subir fotos';
      this.showNotification(msg.length > 80 ? msg.slice(0, 80) + '…' : msg, 'error');
    }
  }

  /**
   * Marcar una imagen como principal
   */
  async setImageAsPrincipal(imageId) {
    if (!this.supabase || !this.productId) return;
    try {
      await this.supabase
        .from('product_images')
        .update({ image_type: 'secundaria' })
        .eq('product_id', this.productId);
      const { error } = await this.supabase
        .from('product_images')
        .update({ image_type: 'principal' })
        .eq('id', imageId);
      if (error) throw error;
      await this.refreshDetailImages();
      this.showNotification('Imagen principal actualizada', 'success');
    } catch (err) {
      console.error('Error estableciendo principal:', err);
      this.showNotification('Error al cambiar imagen principal', 'error');
    }
  }

  /**
   * Recargar imágenes del detalle y actualizar la galería en el DOM
   */
  async refreshDetailImages() {
    if (!this.container || !this.productId) return;
    const images = await this.loadProductImagesForDetail(this.productId);
    this.productImages = images;

    const thumbnailsWrap = this.container.querySelector('#productViewThumbnails');
    const gallery = this.container.querySelector('.product-view-gallery');
    if (!gallery) return;
    const mainWrapRef = gallery.querySelector('.product-view-main-wrap');
    if (!mainWrapRef) return;

    const mainImage = images.length > 0 ? images[0].image_url : '';
    const mainImgRef = mainWrapRef.querySelector('#productViewMainImage');
    const placeholderEl = mainWrapRef.querySelector('.product-view-loading');

    if (mainImage) {
      if (mainImgRef) {
        mainImgRef.src = mainImage;
        mainImgRef.alt = (this.productData && this.productData.nombre_producto) || 'Producto';
        mainImgRef.style.display = '';
        placeholderEl?.remove();
      } else {
        placeholderEl?.remove();
        const img = document.createElement('img');
        img.id = 'productViewMainImage';
        img.src = mainImage;
        img.alt = (this.productData && this.productData.nombre_producto) || 'Producto';
        mainWrapRef.appendChild(img);
      }
    } else {
      if (mainImgRef) {
        mainImgRef.style.display = 'none';
      }
      if (!placeholderEl) {
        const placeholder = document.createElement('div');
        placeholder.className = 'product-view-loading';
        placeholder.style.minHeight = '200px';
        placeholder.innerHTML = '<i class="fas fa-image"></i><span>Sin imagen</span>';
        mainWrapRef.appendChild(placeholder);
      }
    }

    const thumbnails = images.slice(0, 20);
    const thumbsHtml = thumbnails.map((img, i) => {
      const isPrincipal = (img.image_type || '') === 'principal';
      return `
      <div class="product-view-thumb-wrap" data-index="${i}" data-image-id="${img.id}">
        <div class="product-view-thumb ${i === 0 ? 'active' : ''}" role="button" tabindex="0">
          <img src="${img.image_url}" alt="Miniatura ${i + 1}" loading="lazy">
          <button type="button" class="product-view-thumb-delete" title="Eliminar foto" aria-label="Eliminar foto" data-image-id="${img.id}"><i class="fas fa-times"></i></button>
          ${thumbnails.length > 1 && !isPrincipal ? `<button type="button" class="product-view-thumb-set-principal" title="Establecer como principal" data-image-id="${img.id}"><i class="fas fa-star"></i></button>` : ''}
        </div>
      </div>`;
    }).join('');

    const productView = this.container.querySelector('.product-view');
    if (productView) {
      if (mainImage) productView.style.setProperty('--product-bg-image', `url("${mainImage}")`);
      else productView.style.removeProperty('--product-bg-image');
    }

    if (thumbnailsWrap) {
      thumbnailsWrap.innerHTML = thumbsHtml;
      if (thumbnails.length === 0) thumbnailsWrap.style.display = 'none';
      else thumbnailsWrap.style.display = 'flex';
    }

    const addBtn = this.container.querySelector('#productViewAddBtn');
    const thumbWrap = this.container.querySelector('.product-view-thumbnails-wrap');
    if (addBtn) addBtn.style.display = images.length >= MAX_PRODUCT_IMAGES ? 'none' : '';
    if (thumbWrap) {
      let hintEl = thumbWrap.querySelector('.product-view-max-hint');
      if (images.length >= MAX_PRODUCT_IMAGES) {
        if (!hintEl) {
          hintEl = document.createElement('span');
          hintEl.className = 'product-view-max-hint';
          hintEl.setAttribute('aria-live', 'polite');
          hintEl.textContent = `Máx. ${MAX_PRODUCT_IMAGES} imágenes`;
          thumbWrap.appendChild(hintEl);
        }
      } else if (hintEl) hintEl.remove();
    }

    this.bindGalleryEvents();
  }

  /**
   * Enlazar eventos de la galería (clicks en thumbs, eliminar, principal, subir)
   */
  bindGalleryEvents() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;

    const mainImg = container.querySelector('#productViewMainImage');
    const thumbsWrap = container.querySelector('#productViewThumbnails');
    const thumbs = thumbsWrap ? thumbsWrap.querySelectorAll('.product-view-thumb-wrap') : [];

    thumbs.forEach((wrap, index) => {
      const thumb = wrap.querySelector('.product-view-thumb');
      const img = this.productImages[index];
      if (thumb && img && mainImg) {
        thumb.onclick = () => {
          mainImg.src = img.image_url;
          mainImg.alt = (this.productData && this.productData.nombre_producto) || `Imagen ${index + 1}`;
          thumbs.forEach(w => w.querySelector('.product-view-thumb')?.classList.remove('active'));
          thumb.classList.add('active');
        };
      }
      wrap.querySelector('.product-view-thumb-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeProductImage(wrap.getAttribute('data-image-id'));
      });
      wrap.querySelector('.product-view-thumb-set-principal')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setImageAsPrincipal(wrap.getAttribute('data-image-id'));
      });
    });

    // La subida de fotos se maneja por delegación en initProductDetail (listener en container)
  }

  /**
   * Guardar un campo del producto en Supabase
   */
  async saveProductField(fieldName, value) {
    if (!this.supabase || !this.productId) return;
    const payload = { updated_at: new Date().toISOString() };
    const arrayFields = ['beneficios_principales', 'diferenciadores', 'casos_de_uso', 'materiales_composicion', 'caracteristicas_visuales'];
    if (arrayFields.includes(fieldName)) {
      const arr = typeof value === 'string' ? value.split(/\n/).map(s => s.trim()).filter(Boolean) : (Array.isArray(value) ? value : []);
      payload[fieldName] = arr.length ? arr : [];
    } else if (fieldName === 'precio_producto') {
      const num = value === '' ? null : parseFloat(value);
      payload[fieldName] = isNaN(num) ? null : num;
    } else {
      payload[fieldName] = value === '' ? null : value;
    }
    try {
      const { error } = await this.supabase.from('products').update(payload).eq('id', this.productId);
      if (error) throw error;
      if (this.productData) this.productData[fieldName] = payload[fieldName];
      this.showNotification('Guardado', 'success');
    } catch (err) {
      console.error('Error guardando:', err);
      this.showNotification('Error al guardar', 'error');
    }
  }

  /**
   * Cargar variantes del producto ordenadas por position
   */
  async loadProductVariants(productId) {
    if (!this.supabase || !productId) return [];
    const { data, error } = await this.supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error cargando variantes:', error);
      return [];
    }
    return data || [];
  }

  /**
   * HTML de la sección "Variantes" (header + lista + empty state)
   */
  getProductVariantsHTML(variants) {
    const cards = (variants && variants.length)
      ? variants.map(v => this.getVariantCardHTML(v)).join('')
      : `<div class="product-view-variants-empty">Sin variantes. Añade una para dar a Vera contexto sobre versiones específicas del producto.</div>`;
    return `
      <div class="product-view-sheet-section product-view-variants-section">
        <div class="product-view-variants-header">
          <div class="product-view-variants-titlebox">
            <h3 class="product-view-sheet-title">Variantes</h3>
            <p class="product-view-sheet-hint">Versiones específicas del producto (tamaño, color, edición). Cada variante puede tener su propio contexto narrativo para Vera.</p>
          </div>
          <button type="button" class="product-view-variant-add-btn" id="addVariantBtn">
            <i class="fas fa-plus"></i> Añadir variante
          </button>
        </div>
        <div class="product-view-variants-list" id="productVariantsList">${cards}</div>
      </div>
    `;
  }

  /**
   * HTML de una variante (header colapsado + body con los campos relevantes para Vera + acordeón "Detalles")
   */
  getVariantCardHTML(variant) {
    const id = variant.id;
    const name = variant.variant_name || '';
    const img = variant.imagen_url || '';
    const moneda = variant.moneda || (this.productData && this.productData.moneda) || 'USD';
    const monedas = [{ v: 'USD', l: 'USD' }, { v: 'EUR', l: 'EUR' }, { v: 'MXN', l: 'MXN' }, { v: 'COP', l: 'COP' }, { v: 'ARS', l: 'ARS' }, { v: 'CLP', l: 'CLP' }];
    const monedaOpts = monedas.map(m => `<option value="${m.v}" ${moneda === m.v ? 'selected' : ''}>${m.l}</option>`).join('');
    const stockStatuses = ['in_stock', 'out_of_stock', 'pre_order', 'discontinued'];
    const stockOpts = stockStatuses.map(s => `<option value="${s}" ${variant.stock_status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('');
    const pesoUnits = ['kg', 'g', 'lb', 'oz'];
    const pesoOpts = pesoUnits.map(u => `<option value="${u}" ${variant.peso_unidad === u ? 'selected' : ''}>${u}</option>`).join('');
    const dimUnits = ['cm', 'mm', 'in'];
    const dimOpts = dimUnits.map(u => `<option value="${u}" ${variant.dimension_unidad === u ? 'selected' : ''}>${u}</option>`).join('');
    const arrToText = (a) => Array.isArray(a) ? a.join('\n') : (a || '');
    const numVal = (n) => (n == null ? '' : String(n));

    return `
      <div class="product-view-variant-card" data-variant-id="${id}">
        <div class="product-view-variant-header">
          <div class="product-view-variant-thumb">
            ${img
              ? `<img src="${this.escapeHtml(img)}" alt="${this.escapeHtml(name)}" loading="lazy" decoding="async">`
              : `<i class="fas fa-cube"></i>`}
          </div>
          <input type="text" class="product-view-variant-name" data-variant-id="${id}" data-variant-field="variant_name" value="${this.escapeHtml(name)}" placeholder="Nombre de la variante">
          <button type="button" class="product-view-variant-toggle" aria-label="Expandir"><i class="fas fa-chevron-down"></i></button>
          <button type="button" class="product-view-variant-delete" aria-label="Eliminar variante"><i class="fas fa-times"></i></button>
        </div>
        <div class="product-view-variant-body">
          <div class="product-view-variant-grid">
            <div class="product-view-sheet-row">
              <span class="product-view-sheet-label">Precio</span>
              <input type="number" step="any" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="precio" value="${numVal(variant.precio)}" placeholder="0">
            </div>
            <div class="product-view-sheet-row">
              <span class="product-view-sheet-label">Precio comparación</span>
              <input type="number" step="any" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="precio_comparacion" value="${numVal(variant.precio_comparacion)}" placeholder="0">
            </div>
            <div class="product-view-sheet-row">
              <span class="product-view-sheet-label">Moneda</span>
              <select class="product-view-select product-view-input-inline" data-variant-id="${id}" data-variant-field="moneda">${monedaOpts}</select>
            </div>
          </div>

          <div class="product-view-sheet-section">
            <h4 class="product-view-sheet-subtitle">Descripción de la variante</h4>
            <textarea class="product-view-textarea product-view-editable" data-variant-id="${id}" data-variant-field="descripcion_variante" rows="2" placeholder="Qué hace única a esta variante">${this.escapeHtml(variant.descripcion_variante || '')}</textarea>
          </div>

          <div class="product-view-sheet-section">
            <h4 class="product-view-sheet-subtitle">Notas para Vera</h4>
            <p class="product-view-sheet-hint">Contexto libre que no encaje en otros campos. Tono, asociaciones, lo idiosincrático.</p>
            <textarea class="product-view-textarea product-view-editable" data-variant-id="${id}" data-variant-field="notas_contenido" rows="2" placeholder="Notas libres">${this.escapeHtml(variant.notas_contenido || '')}</textarea>
          </div>

          <div class="product-view-sheet-section">
            <h4 class="product-view-sheet-subtitle">Beneficios adicionales (uno por línea)</h4>
            <p class="product-view-sheet-hint">Lo que esta variante suma sobre los beneficios del producto.</p>
            <textarea class="product-view-textarea product-view-editable" data-variant-id="${id}" data-variant-field="beneficios_adicionales" rows="2" placeholder="Opcional">${this.escapeHtml(arrToText(variant.beneficios_adicionales))}</textarea>
          </div>

          <div class="product-view-sheet-section">
            <h4 class="product-view-sheet-subtitle">Características visuales (una por línea)</h4>
            <p class="product-view-sheet-hint">Lo visual específico de esta variante: color, acabado, packaging.</p>
            <textarea class="product-view-textarea product-view-editable" data-variant-id="${id}" data-variant-field="caracteristicas_visuales" rows="2" placeholder="Opcional">${this.escapeHtml(arrToText(variant.caracteristicas_visuales))}</textarea>
          </div>

          <div class="product-view-sheet-row">
            <span class="product-view-sheet-label">URL imagen principal</span>
            <input type="url" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="imagen_url" value="${this.escapeHtml(variant.imagen_url || '')}" placeholder="https://">
          </div>

          <details class="product-view-variant-details">
            <summary>Detalles logísticos</summary>
            <div class="product-view-variant-grid">
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">SKU</span>
                <input type="text" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="sku" value="${this.escapeHtml(variant.sku || '')}" placeholder="Opcional">
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Barcode</span>
                <input type="text" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="barcode" value="${this.escapeHtml(variant.barcode || '')}" placeholder="Opcional">
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Stock</span>
                <input type="number" step="1" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="stock_quantity" value="${numVal(variant.stock_quantity)}" placeholder="0">
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Estado stock</span>
                <select class="product-view-select product-view-input-inline" data-variant-id="${id}" data-variant-field="stock_status">${stockOpts}</select>
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Peso</span>
                <input type="number" step="any" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="peso" value="${numVal(variant.peso)}" placeholder="0">
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Unidad peso</span>
                <select class="product-view-select product-view-input-inline" data-variant-id="${id}" data-variant-field="peso_unidad">${pesoOpts}</select>
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Alto</span>
                <input type="number" step="any" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="alto" value="${numVal(variant.alto)}" placeholder="0">
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Ancho</span>
                <input type="number" step="any" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="ancho" value="${numVal(variant.ancho)}" placeholder="0">
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Largo</span>
                <input type="number" step="any" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="largo" value="${numVal(variant.largo)}" placeholder="0">
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Unidad dimensión</span>
                <select class="product-view-select product-view-input-inline" data-variant-id="${id}" data-variant-field="dimension_unidad">${dimOpts}</select>
              </div>
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Orden</span>
                <input type="number" step="1" class="product-view-input product-view-input-inline" data-variant-id="${id}" data-variant-field="position" value="${numVal(variant.position)}" placeholder="1">
              </div>
              <div class="product-view-sheet-row product-view-checkrow">
                <label><input type="checkbox" data-variant-id="${id}" data-variant-field="disponible" ${variant.disponible !== false ? 'checked' : ''}> Disponible</label>
                <label><input type="checkbox" data-variant-id="${id}" data-variant-field="is_active" ${variant.is_active !== false ? 'checked' : ''}> Activa</label>
              </div>
            </div>
          </details>
        </div>
      </div>
    `;
  }

  /**
   * Insertar una variante nueva con defaults heredados del producto
   */
  async addVariant() {
    if (!this.supabase || !this.productId || !this.productData) return;
    const orgId = this.productData.organization_id;
    if (!orgId) {
      this.showNotification('Producto sin organización asociada', 'error');
      return;
    }
    try {
      const { data, error } = await this.supabase
        .from('product_variants')
        .insert({
          product_id: this.productId,
          organization_id: orgId,
          variant_name: 'Nueva variante',
          moneda: this.productData.moneda || 'USD',
          is_active: true,
          disponible: true,
          stock_status: 'in_stock',
          peso_unidad: 'kg',
          dimension_unidad: 'cm',
          position: (this.productVariants || []).length + 1
        })
        .select()
        .single();
      if (error) throw error;
      this.productVariants = [...(this.productVariants || []), data];
      this.refreshVariantsList();
      this.showNotification('Variante añadida', 'success');
    } catch (err) {
      console.error('Error añadiendo variante:', err);
      this.showNotification('Error al añadir variante', 'error');
    }
  }

  /**
   * Eliminar variante (también elimina relaciones y imágenes asociadas por FK cascade)
   */
  async deleteVariant(variantId) {
    if (!this.supabase || !variantId) return;
    if (!confirm('¿Eliminar esta variante? Se borrarán también sus imágenes y valores de opción asociados.')) return;
    try {
      const { error } = await this.supabase.from('product_variants').delete().eq('id', variantId);
      if (error) throw error;
      this.productVariants = (this.productVariants || []).filter(v => v.id !== variantId);
      this.refreshVariantsList();
      this.showNotification('Variante eliminada', 'success');
    } catch (err) {
      console.error('Error eliminando variante:', err);
      this.showNotification('Error al eliminar variante', 'error');
    }
  }

  /**
   * Guardar un campo individual de una variante
   */
  async saveVariantField(variantId, fieldName, value) {
    if (!this.supabase || !variantId) return;
    const payload = { updated_at: new Date().toISOString() };
    const arrayFields = ['beneficios_adicionales', 'caracteristicas_visuales'];
    const numericFields = ['precio', 'precio_comparacion', 'stock_quantity', 'peso', 'alto', 'ancho', 'largo', 'position'];

    if (arrayFields.includes(fieldName)) {
      const arr = typeof value === 'string' ? value.split(/\n/).map(s => s.trim()).filter(Boolean) : (Array.isArray(value) ? value : []);
      payload[fieldName] = arr.length ? arr : null;
    } else if (numericFields.includes(fieldName)) {
      const num = value === '' ? null : parseFloat(value);
      payload[fieldName] = isNaN(num) ? null : num;
    } else if (typeof value === 'boolean') {
      payload[fieldName] = value;
    } else {
      payload[fieldName] = value === '' ? null : value;
    }

    try {
      const { error } = await this.supabase
        .from('product_variants')
        .update(payload)
        .eq('id', variantId);
      if (error) throw error;
      const v = (this.productVariants || []).find(x => x.id === variantId);
      if (v) v[fieldName] = payload[fieldName];
      this.showNotification('Guardado', 'success');
    } catch (err) {
      console.error('Error guardando variante:', err);
      this.showNotification('Error al guardar variante', 'error');
    }
  }

  /**
   * Re-renderizar lista de variantes y volver a enlazar eventos (tras add/delete)
   */
  refreshVariantsList() {
    if (!this.container) return;
    const list = this.container.querySelector('#productVariantsList');
    if (!list) return;
    const variants = this.productVariants || [];
    list.innerHTML = variants.length
      ? variants.map(v => this.getVariantCardHTML(v)).join('')
      : `<div class="product-view-variants-empty">Sin variantes. Añade una para dar a Vera contexto sobre versiones específicas del producto.</div>`;
    this.bindVariantEvents();
  }

  /**
   * Enlazar eventos de variantes: toggle expand, delete, edición inline con autosave
   */
  bindVariantEvents() {
    if (!this.container) return;
    const list = this.container.querySelector('#productVariantsList');
    if (!list) return;

    // Delegación: toggle expand + delete
    list.onclick = (e) => {
      const toggle = e.target.closest('.product-view-variant-toggle');
      if (toggle) {
        const card = toggle.closest('.product-view-variant-card');
        card?.classList.toggle('expanded');
        return;
      }
      const del = e.target.closest('.product-view-variant-delete');
      if (del) {
        const card = del.closest('.product-view-variant-card');
        const id = card?.getAttribute('data-variant-id');
        if (id) this.deleteVariant(id);
      }
    };

    // Autosave en cada campo
    list.querySelectorAll('[data-variant-field]').forEach(el => {
      const variantId = el.getAttribute('data-variant-id');
      const fieldName = el.getAttribute('data-variant-field');
      if (!variantId || !fieldName) return;
      const getVal = () => el.type === 'checkbox' ? el.checked : el.value;
      let initial = getVal();
      const saveIfChanged = () => {
        const current = getVal();
        if (current !== initial) {
          this.saveVariantField(variantId, fieldName, current);
          initial = current;
        }
      };
      if (el.tagName === 'SELECT' || el.type === 'checkbox') {
        el.addEventListener('change', saveIfChanged);
      } else {
        el.addEventListener('blur', saveIfChanged);
      }
    });
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatPrice(value) {
    if (value == null) return '';
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  /**
   * Actualizar header: en detalle de producto solo "Productos", sin nombre de marca ni ID
   */
  async updateHeader() {
    await super.updateHeader();
    if (this.productId) {
      this.updateHeaderContext('Productos', null);
    }
  }

  /**
   * Inicializar la vista (lista o detalle)
   */
  async init() {
    if (this.productId && this.container) {
      this.initProductDetail();
      return;
    }

    this.productsManager = null;
    this.supabase = null;
    this.userId = null;

    if (!window.ProductsManager) {
      await this.loadScript('js/products.js', 'ProductsManager');
    }

    if (window.ProductsManager) {
      this.productsManager = new window.ProductsManager();
      await this.productsManager.init();
    }

    this.setupRouterLinks();
  }

  /**
   * Inicializar pantalla de detalle: galería, volver y campos editables (guardar al salir del campo)
   */
  initProductDetail() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;

    const backBtn = container.querySelector('.back-to-products-btn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = backBtn.getAttribute('data-back-url') || '/products';
        if (window.router) window.router.navigate(url);
      });
    }

    // Un solo listener en el container; la vista actual se guarda en el container para que al cambiar de producto siga funcionando
    const containerEl = container;
    containerEl._productViewUploadRef = this;
    if (!containerEl._productViewUploadListenerBound) {
      containerEl._productViewUploadListenerBound = true;
      containerEl.addEventListener('change', function productViewUploadDelegate(e) {
        if (e.target && e.target.id === 'productViewImageUpload') {
          const input = e.target;
          const fileArray = input.files ? Array.from(input.files) : [];
          input.value = '';
          const view = containerEl._productViewUploadRef;
          if (fileArray.length && view && typeof view.uploadProductImages === 'function') {
            view.uploadProductImages(fileArray);
          }
        }
      });
    }

    this.bindGalleryEvents();
    this.bindVariantEvents();

    const addVariantBtn = container.querySelector('#addVariantBtn');
    if (addVariantBtn) {
      addVariantBtn.onclick = (e) => {
        e.preventDefault();
        this.addVariant();
      };
    }

    // Campos editables: guardar al perder foco (blur) o al cambiar (select)
    container.querySelectorAll('[data-field]').forEach(el => {
      const fieldName = el.getAttribute('data-field');
      const initialValue = el.value !== undefined ? el.value : el.textContent;

      const saveIfChanged = () => {
        const current = el.value !== undefined ? el.value : el.textContent;
        if (current !== initialValue) {
          this.saveProductField(fieldName, current);
        }
      };

      if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => this.saveProductField(fieldName, el.value));
      } else {
        el.addEventListener('blur', saveIfChanged);
      }
    });
  }

  /**
   * Configurar links para usar router
   */
  getOrgBasePath() {
    const orgId = this.routeParams?.orgId;
    if (!orgId || typeof window.getOrgPathPrefix !== 'function') return '';
    return window.getOrgPathPrefix(orgId, window.currentOrgName || '');
  }

  setupRouterLinks() {
    const basePath = this.getOrgBasePath();
    const productionLinks = this.querySelectorAll('a[href*="production"]');
    const studioLinks = this.querySelectorAll('a[href*="studio"]');

    productionLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate(basePath ? `${basePath}/production` : '/production');
        }
      });
    });

    studioLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate(basePath ? `${basePath}/studio` : '/studio');
        }
      });
    });
  }

  /**
   * Verificar autenticación
   */
  async checkAuthentication() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return false;

    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    // Usar SupabaseService si está disponible
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    
    // Fallback a app-loader
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch (error) {
        return null;
      }
    }
    return window.supabase || null;
  }

  /**
   * Mostrar notificación
   */
  showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 2rem;
      padding: 1rem 1.5rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Hook al salir de la vista
   */
  async onLeave() {
    this.productsManager = null;
    this.supabase = null;
    this.userId = null;
    this.productId = null;
    this.brandId = null;
    this.productData = null;
    this.productImages = [];
    this.brandName = '';
  }
}

// Hacer disponible globalmente
window.ProductsView = ProductsView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductsView;
}

