/**
 * ProductsView - Vista de gestión de productos (lista + detalle tipo e-commerce)
 */
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
    if (window.navigation && !window.navigation.initialized) {
      await window.navigation.render();
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
          images = await this.loadProductImagesForDetail(productId);
          const containerId = product.brand_container_id || brandId;
          if (containerId) brandName = await this.loadBrandName(containerId);
        }
      } catch (e) {
        console.error('Error cargando detalle:', e);
      }

      if (!product) {
        this.container.querySelector('.product-view').innerHTML = `
          <div class="product-view-error">
            <h2>Producto no encontrado</h2>
            <p>El producto solicitado no existe o no tienes acceso.</p>
            <a href="${orgId ? `/org/${orgId}/products` + (brandId ? `/${brandId}` : '') : '/products'}" class="product-view-back" data-router-link>
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

      const backUrl = orgId ? `/org/${orgId}/products` + (brandId ? `/${brandId}` : '') : '/products';
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
    const thumbnails = images.slice(0, 8);
    const precio = product.precio_producto != null ? String(product.precio_producto) : '';
    const moneda = product.moneda || 'USD';
    const tipoProducto = product.tipo_producto || 'otro';

    const thumbsHtml = thumbnails.map((img, i) => `
      <div class="product-view-thumb ${i === 0 ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">
        <img src="${img.image_url}" alt="Miniatura ${i + 1}" loading="lazy">
      </div>
    `).join('');

    const tipoOpts = this.getTipoProductoOptions();
    const tipoOptionsHtml = tipoOpts.map(o => `<option value="${this.escapeHtml(o.value)}" ${o.value === tipoProducto ? 'selected' : ''}>${this.escapeHtml(o.label)}</option>`).join('');
    const monedas = [{ v: 'USD', l: 'USD' }, { v: 'EUR', l: 'EUR' }, { v: 'MXN', l: 'MXN' }, { v: 'COP', l: 'COP' }, { v: 'ARS', l: 'ARS' }, { v: 'CLP', l: 'CLP' }];
    const monedaOptionsHtml = monedas.map(m => `<option value="${m.v}" ${moneda === m.v ? 'selected' : ''}>${m.l}</option>`).join('');

    const v = (key) => (product[key] ?? '');
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
            ${thumbnails.length > 0 ? `<div class="product-view-thumbnails" id="productViewThumbnails">${thumbsHtml}</div>` : ''}
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
              ${rowInput('Variantes', 'variantes_producto', v('variantes_producto'), 'text', 'Ej. color, talla')}
            </div>
            ${sectionTextarea('Descripción', 'descripcion_producto', v('descripcion_producto'))}
            ${sectionTextarea('Beneficio 1', 'beneficio_1', v('beneficio_1'))}
            ${sectionTextarea('Beneficio 2', 'beneficio_2', v('beneficio_2'))}
            ${sectionTextarea('Beneficio 3', 'beneficio_3', v('beneficio_3'))}
            ${sectionTextarea('Diferenciación', 'diferenciacion', v('diferenciacion'))}
            ${sectionTextarea('Modo de uso', 'modo_uso', v('modo_uso'))}
            ${sectionTextarea('Ingredientes', 'ingredientes', v('ingredientes'))}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Guardar un campo del producto en Supabase
   */
  async saveProductField(fieldName, value) {
    if (!this.supabase || !this.productId) return;
    const payload = { updated_at: new Date().toISOString() };
    if (fieldName === 'precio_producto') {
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

    const mainImg = container.querySelector('#productViewMainImage');
    const thumbsWrap = container.querySelector('#productViewThumbnails');
    const thumbs = thumbsWrap ? thumbsWrap.querySelectorAll('.product-view-thumb') : [];
    const backBtn = container.querySelector('.back-to-products-btn');

    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = backBtn.getAttribute('data-back-url') || '/products';
        if (window.router) window.router.navigate(url);
      });
    }

    thumbs.forEach((thumb, index) => {
      thumb.addEventListener('click', () => {
        const img = this.productImages[index];
        if (img && mainImg) {
          mainImg.src = img.image_url;
          mainImg.alt = (this.productData && this.productData.nombre_producto) ? this.productData.nombre_producto : `Imagen ${index + 1}`;
        }
        thumbs.forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
      thumb.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          thumb.click();
        }
      });
    });

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
  setupRouterLinks() {
    const basePath = (this.routeParams && this.routeParams.orgId) ? `/org/${this.routeParams.orgId}` : '';
    const livingLinks = this.querySelectorAll('a[href*="living"]');
    const studioLinks = this.querySelectorAll('a[href*="studio"]');

    livingLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate(basePath ? `${basePath}/living` : '/living');
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

