/**
 * ProductsView - Vista de gestión de productos (lista + detalle tipo e-commerce)
 */
const MAX_PRODUCT_IMAGES = 6;

class ProductsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'products.html';
    this.productsManager = null;
    this.supabase = null;
    this.userId = null;
    // Detalle de producto
    this.productId = null;
    this.brandId = null;
    this.productData = null;
    this.productImages = [];
    this.brandName = '';
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
    const brandId = params.brandId;
    const orgId = params.orgId;

    if (productId && (orgId ? brandId : true)) {
      // Modo detalle
      this.productId = productId;
      this.brandId = brandId || null;
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

      try {
        product = await this.loadProductForDetail(productId);
        if (product) {
          const containerId = product.brand_container_id || brandId;
          const [imgs, bn] = await Promise.all([
            this.loadProductImagesForDetail(productId),
            containerId ? this.loadBrandName(containerId) : Promise.resolve('')
          ]);
          images = imgs;
          brandName = bn;
        }
      } catch (e) {
        console.error('Error cargando detalle:', e);
      }

      if (!product) {
        this.container.querySelector('.product-view').innerHTML = `
          <div class="product-view-error">
            <h2>Producto no encontrado</h2>
            <p>El producto solicitado no existe o no tienes acceso.</p>
            <a href="${orgId && typeof window.getOrgPathPrefix === 'function' ? (window.getOrgPathPrefix(orgId, window.currentOrgName || '') + '/products' + (brandId ? `/${brandId}` : '')) : (orgId ? `/org/${orgId}/products` + (brandId ? `/${brandId}` : '') : '/products')}" class="product-view-back" data-router-link>
              <i class="fas fa-arrow-left"></i> Volver a productos
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

      const backUrl = orgId && typeof window.getOrgPathPrefix === 'function'
        ? (window.getOrgPathPrefix(orgId, window.currentOrgName || '') + '/products' + (brandId ? `/${brandId}` : ''))
        : (orgId ? `/org/${orgId}/products` + (brandId ? `/${brandId}` : '') : '/products');
      const html = this.getProductDetailHTML(product, images, brandName || 'Marca', backUrl);
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
   * Cargar nombre de marca (brand_container)
   */
  async loadBrandName(brandContainerId) {
    if (!this.supabase || !brandContainerId) return '';
      const { data, error } = await this.supabase
        .from('brand_containers')
      .select('nombre_marca, logo_url')
      .eq('id', brandContainerId)
      .single();
    if (error || !data) return '';
    return data.nombre_marca || '';
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
  getProductDetailHTML(product, images, brandName, backUrl) {
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
        </div>
        <div class="product-view-thumb-actions">
          ${thumbnails.length > 1 && !isPrincipal ? `<button type="button" class="product-view-thumb-set-principal" title="Establecer como principal" data-image-id="${img.id}"><i class="fas fa-star"></i></button>` : ''}
          <button type="button" class="product-view-thumb-delete" title="Eliminar foto" data-image-id="${img.id}"><i class="fas fa-trash-alt"></i></button>
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
    const sectionTextarea = (title, field, value) => `
      <div class="product-view-sheet-section">
        <h3 class="product-view-sheet-title">${this.escapeHtml(title)}</h3>
        <textarea class="product-view-textarea product-view-editable" data-field="${field}" rows="3" placeholder="Opcional">${this.escapeHtml(String(value ?? ''))}</textarea>
      </div>
    `;

    return `
      <div class="product-view">
        <a href="${backUrl}" class="product-view-back back-to-products-btn" data-back-url="${backUrl}" data-router-link>
          <i class="fas fa-arrow-left"></i> Volver a productos
        </a>
        <nav class="product-view-breadcrumbs" aria-label="Navegación">
          <a href="${backUrl}" data-router-link>Productos</a>
          <span>/</span>
          <span>${this.escapeHtml(product.nombre_producto || 'Ficha técnica')}</span>
        </nav>
        <div class="product-view-grid">
          <div class="product-view-gallery">
            <div class="product-view-main-wrap">
              ${mainImage
                ? `<img id="productViewMainImage" src="${mainImage}" alt="${this.escapeHtml(product.nombre_producto || '')}">`
                : `<div class="product-view-loading" style="min-height: 200px;"><i class="fas fa-image"></i><span>Sin imagen</span></div>`
              }
            </div>
            <div class="product-view-thumbnails-wrap">
              <div class="product-view-thumbnails" id="productViewThumbnails" style="${thumbnails.length === 0 ? 'display: none;' : ''}">${thumbsHtml}</div>
              <input type="file" id="productViewImageUpload" accept="image/*" multiple style="position: absolute; width: 0; height: 0; opacity: 0; overflow: hidden; pointer-events: none;" aria-label="Añadir fotos al producto">
              <label for="productViewImageUpload" class="product-view-add-btn" id="productViewAddBtn" role="button" aria-label="Añadir fotos" style="${thumbnails.length >= MAX_PRODUCT_IMAGES ? 'display: none;' : ''}"><i class="fas fa-plus"></i></label>
              ${thumbnails.length >= MAX_PRODUCT_IMAGES ? `<span class="product-view-max-hint" aria-live="polite">Máx. ${MAX_PRODUCT_IMAGES} imágenes</span>` : ''}
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
            ${sectionTextarea('Descripción', 'descripcion_producto', v('descripcion_producto'))}
            ${sectionTextarea('Beneficios principales (uno por línea)', 'beneficios_principales', vArr('beneficios_principales'))}
            ${sectionTextarea('Diferenciadores (uno por línea)', 'diferenciadores', vArr('diferenciadores'))}
            ${sectionTextarea('Variantes (uno por línea)', 'variantes', vArr('variantes'))}
            ${sectionTextarea('Casos de uso', 'casos_de_uso', vArr('casos_de_uso'))}
            ${sectionTextarea('Materiales / composición', 'materiales_composicion', vArr('materiales_composicion'))}
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
        </div>
        <div class="product-view-thumb-actions">
          ${thumbnails.length > 1 && !isPrincipal ? `<button type="button" class="product-view-thumb-set-principal" title="Establecer como principal" data-image-id="${img.id}"><i class="fas fa-star"></i></button>` : ''}
          <button type="button" class="product-view-thumb-delete" title="Eliminar foto" data-image-id="${img.id}"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
    }).join('');

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
    const arrayFields = ['beneficios_principales', 'diferenciadores', 'variantes', 'casos_de_uso', 'materiales_composicion', 'caracteristicas_visuales'];
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
    const productionLinks = this.querySelectorAll('a[href*="production"], a[href*="historial"], a[href*="living"]');
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

