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
   * Etiqueta legible para tipo_producto (ficha técnica)
   */
  getTipoProductoLabel(tipo) {
    const map = {
      todos: 'Todos', bebida: 'Bebidas', bebida_alcoholica: 'Bebidas Alcohólicas',
      agua: 'Agua', energetica: 'Bebidas Energéticas', alimento: 'Alimentos', snack: 'Snacks',
      suplemento_alimenticio: 'Suplementos', cosmetico: 'Cosméticos', skincare: 'Skincare',
      maquillaje: 'Maquillaje', perfume: 'Perfumes', cuidado_cabello: 'Cuidado del Cabello',
      app: 'Apps/Software', electronico: 'Electrónicos', smartphone: 'Smartphones',
      ropa: 'Ropa', calzado: 'Calzado', accesorio_moda: 'Accesorios de Moda', otro: 'Otros'
    };
    return map[tipo] || tipo || '—';
  }

  /**
   * Generar HTML del detalle: ficha técnica para IA (datos para crear contenido)
   */
  getProductDetailHTML(product, images, brandName, backUrl) {
    const mainImage = images.length > 0 ? images[0].image_url : '';
    const thumbnails = images.slice(0, 8);
    const price = product.precio_producto != null ? Number(product.precio_producto) : null;
    const moneda = product.moneda || 'USD';
    const desc = (product.descripcion_producto || '').trim();
    const variantes = (product.variantes_producto || '').trim();
    const shortId = product.id ? product.id.slice(0, 8) : '';
    const tipoLabel = this.getTipoProductoLabel(product.tipo_producto || '');

    const thumbsHtml = thumbnails.map((img, i) => `
      <div class="product-view-thumb ${i === 0 ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">
        <img src="${img.image_url}" alt="Miniatura ${i + 1}" loading="lazy">
      </div>
    `).join('');

    const benefit1 = (product.beneficio_1 || '').trim();
    const benefit2 = (product.beneficio_2 || '').trim();
    const benefit3 = (product.beneficio_3 || '').trim();
    const diferenciacion = (product.diferenciacion || '').trim();
    const modoUso = (product.modo_uso || '').trim();
    const ingredientes = (product.ingredientes || '').trim();

    const section = (title, content) => content ? `
      <div class="product-view-sheet-section">
        <h3 class="product-view-sheet-title">${this.escapeHtml(title)}</h3>
        <div class="product-view-sheet-value">${this.escapeHtml(content)}</div>
      </div>
    ` : '';

    return `
      <div class="product-view">
        <a href="${backUrl}" class="product-view-back back-to-products-btn" data-back-url="${backUrl}" data-router-link>
          <i class="fas fa-arrow-left"></i> Volver a productos
        </a>
        <nav class="product-view-breadcrumbs" aria-label="Navegación">
          <a href="${backUrl}" data-router-link>Productos</a>
          <span>/</span>
          <span>${this.escapeHtml(brandName)}</span>
          <span>/</span>
          <span>${this.escapeHtml(product.nombre_producto || 'Ficha técnica')}</span>
        </nav>
        <p class="product-view-subtitle">Datos para que los modelos de IA generen contenido de este producto.</p>
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
            <div class="product-view-brand-row">
              <span class="product-view-brand-name">${this.escapeHtml(brandName)}</span>
              ${shortId ? `<span class="product-view-product-id">${this.escapeHtml(shortId)}</span>` : ''}
            </div>
            <h1 class="product-view-title">${this.escapeHtml(product.nombre_producto || 'Sin nombre')}</h1>
            <div class="product-view-sheet">
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Tipo de producto</span>
                <span class="product-view-sheet-value">${this.escapeHtml(tipoLabel)}</span>
              </div>
              ${price != null ? `
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Precio</span>
                <span class="product-view-sheet-value">${this.formatPrice(price)} ${this.escapeHtml(moneda)}</span>
              </div>
              ` : ''}
              ${variantes ? `
              <div class="product-view-sheet-row">
                <span class="product-view-sheet-label">Variantes</span>
                <span class="product-view-sheet-value">${this.escapeHtml(variantes)}</span>
              </div>
              ` : ''}
            </div>
            ${section('Descripción', desc)}
            ${section('Beneficio 1', benefit1)}
            ${section('Beneficio 2', benefit2)}
            ${section('Beneficio 3', benefit3)}
            ${section('Diferenciación', diferenciacion)}
            ${section('Modo de uso', modoUso)}
            ${section('Ingredientes', ingredientes)}
          </div>
        </div>
      </div>
    `;
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
   * Inicializar solo la pantalla de detalle (galería, volver)
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

