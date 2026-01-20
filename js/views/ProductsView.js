/**
 * ProductsView - Vista de gestión de productos
 * Maneja el CRUD de productos y detalle individual
 */
class ProductsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'products.html';
    this.productsManager = null;
    this.productId = null;
    this.productData = null;
    this.productImages = [];
    this.supabase = null;
    this.userId = null;
    this.brandContainerId = null;
    this.savingFields = new Set(); // Para evitar guardados simultáneos
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
   * Renderizar la vista
   */
  async render() {
    // Sistema de caché eliminado - siempre cargar templates frescos

    // Detectar si hay productId en los parámetros de ruta
    if (this.routeParams && this.routeParams.productId) {
      this.productId = this.routeParams.productId;
      await this.initSupabase();
      await this.renderProductDetail();
    } else {
      // Verificar también en el path por si acaso
      const path = window.location.pathname;
      const match = path.match(/\/products\/([^\/]+)/);
      if (match) {
        this.productId = match[1];
        await this.initSupabase();
        await this.renderProductDetail();
      } else {
        // Renderizar lista de productos
        await super.render();
        await this.init();
      }
    }
  }

  /**
   * Inicializar Supabase
   */
  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      } else if (typeof waitForSupabase === 'function') {
        this.supabase = await waitForSupabase();
      }

      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) {
          this.userId = user.id;
        }
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  /**
   * Renderizar detalle del producto
   */
  async renderProductDetail() {
    // Renderizar header primero
    await super.render();
    
    // Cambiar el template a product-detail
    const container = this.container || document.getElementById('app-container');
    if (!container) return;

    // Cargar datos del producto
    await this.loadProductData();
    await this.loadProductImages();
    await this.loadBrandContainer();

    // Obtener el header si existe
    const existingHeader = container.querySelector('.main-header');
    
    // Renderizar HTML del detalle
    container.innerHTML = this.getProductDetailHTML();
    
    // Reinsertar el header si existía
    if (existingHeader) {
      const detailContainer = container.querySelector('.product-detail-container');
      if (detailContainer) {
        container.insertBefore(existingHeader, detailContainer);
      }
    }
    
    // Configurar editabilidad
    this.setupEditableFields();
    this.setupImageUpload();
    this.setupEventListeners();
  }

  /**
   * Cargar datos del producto desde Supabase
   */
  async loadProductData() {
    if (!this.supabase || !this.productId) return;

    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('*')
        .eq('id', this.productId)
        .single();

      if (error) throw error;
      this.productData = data || {};
    } catch (error) {
      console.error('Error cargando producto:', error);
      this.productData = {};
    }
  }

  /**
   * Cargar imágenes del producto
   */
  async loadProductImages() {
    if (!this.supabase || !this.productId) return;

    try {
      const { data, error } = await this.supabase
        .from('product_images')
        .select('*')
        .eq('product_id', this.productId)
        .order('image_order', { ascending: true });

      if (error) throw error;
      this.productImages = data || [];
    } catch (error) {
      console.error('Error cargando imágenes:', error);
      this.productImages = [];
    }
  }

  /**
   * Cargar brand container ID
   */
  async loadBrandContainer() {
    if (!this.supabase || !this.userId) return;

    try {
      // Validar que userId sea válido
      if (!this.userId || typeof this.userId !== 'string' || this.userId.trim() === '') {
        return;
      }

      // Usar maybeSingle() en lugar de single() para evitar errores si no hay registro
      const { data, error } = await this.supabase
        .from('brand_containers')
        .select('id')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        if (error.status === 400 || error.code === '400') {
          console.warn('⚠️ Error 400 cargando brand_container en ProductsView:', error.message);
        }
        return;
      }

      if (data && data.id) {
        this.brandContainerId = data.id;
      }
    } catch (error) {
      console.error('Error cargando brand container:', error);
    }
  }

  /**
   * Obtener HTML del detalle del producto
   */
  getProductDetailHTML() {
    const product = this.productData || {};
    const images = this.productImages || [];
    const categoryMap = this.getCategoryMap();
    const tipoProducto = product.tipo_producto || 'otro';
    const categoryInfo = categoryMap[tipoProducto] || { label: 'Otro', icon: 'fa-box' };

    return `
      <div class="product-detail-container">
        <div class="product-detail-content">
          <!-- Sección de Imágenes (Izquierda) -->
          <div class="product-images-section">
            <div class="product-images-gallery" id="productImagesGallery">
              ${images.length > 0 ? images.map((img, index) => `
                <div class="product-image-item" data-image-id="${img.id}">
                  <img src="${img.image_url}" alt="Imagen ${index + 1}" />
                  <button class="delete-image-btn" data-image-id="${img.id}" title="Eliminar imagen">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              `).join('') : ''}
            </div>
            <div class="product-image-upload">
              <label for="productImageUpload" class="upload-image-btn">
                <i class="fas fa-plus"></i>
                <span>Agregar Imagen</span>
              </label>
              <input type="file" id="productImageUpload" accept="image/*" multiple style="display: none;" />
            </div>
          </div>

          <!-- Sección de Datos (Derecha) -->
          <div class="product-data-section">
            <div class="product-detail-header">
              <button class="back-to-products-btn" onclick="window.router.navigate('/products')">
                <i class="fas fa-arrow-left"></i>
                <span>Volver a Productos</span>
              </button>
            </div>

            <div class="product-fields">
              <!-- Nombre del Producto -->
              <div class="product-field">
                <label>Nombre del Producto</label>
                <div class="editable-field editable-text" data-field="nombre_producto">
                  ${product.nombre_producto || ''}
                </div>
              </div>

              <!-- Tipo de Producto -->
              <div class="product-field">
                <label>Tipo de Producto</label>
                <div class="editable-field editable-select" data-field="tipo_producto" data-type="select">
                  ${categoryInfo.label}
                </div>
              </div>

              <!-- Descripción -->
              <div class="product-field">
                <label>Descripción</label>
                <div class="editable-field editable-textarea" data-field="descripcion_producto">
                  ${product.descripcion_producto || ''}
                </div>
              </div>

              <!-- Beneficios -->
              <div class="product-field">
                <label>Beneficio 1</label>
                <div class="editable-field editable-text" data-field="beneficio_1">
                  ${product.beneficio_1 || ''}
                </div>
              </div>

              <div class="product-field">
                <label>Beneficio 2</label>
                <div class="editable-field editable-text" data-field="beneficio_2">
                  ${product.beneficio_2 || ''}
                </div>
              </div>

              <div class="product-field">
                <label>Beneficio 3</label>
                <div class="editable-field editable-text" data-field="beneficio_3">
                  ${product.beneficio_3 || ''}
                </div>
              </div>

              <!-- Diferenciación -->
              <div class="product-field">
                <label>Diferenciación</label>
                <div class="editable-field editable-textarea" data-field="diferenciacion">
                  ${product.diferenciacion || ''}
                </div>
              </div>

              <!-- Modo de Uso -->
              <div class="product-field">
                <label>Modo de Uso</label>
                <div class="editable-field editable-textarea" data-field="modo_uso">
                  ${product.modo_uso || ''}
                </div>
              </div>

              <!-- Ingredientes -->
              <div class="product-field">
                <label>Ingredientes</label>
                <div class="editable-field editable-textarea" data-field="ingredientes">
                  ${product.ingredientes || ''}
                </div>
              </div>

              <!-- Precio y Moneda -->
              <div class="product-field-row">
                <div class="product-field">
                  <label>Precio</label>
                  <div class="editable-field editable-text" data-field="precio_producto" data-type="number">
                    ${product.precio_producto || ''}
                  </div>
                </div>
                <div class="product-field">
                  <label>Moneda</label>
                  <div class="editable-field editable-select" data-field="moneda" data-type="select">
                    ${product.moneda || 'USD'}
                  </div>
                </div>
              </div>

              <!-- Variantes -->
              <div class="product-field">
                <label>Variantes del Producto</label>
                <div class="editable-field editable-textarea" data-field="variantes_producto">
                  ${product.variantes_producto || ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Obtener mapeo de categorías (igual que ProductsManager)
   */
  getCategoryMap() {
    return {
      'bebida': { label: 'Bebidas', icon: 'fa-glass-water' },
      'bebida_alcoholica': { label: 'Bebidas Alcohólicas', icon: 'fa-wine-glass' },
      'agua': { label: 'Agua', icon: 'fa-droplet' },
      'energetica': { label: 'Bebidas Energéticas', icon: 'fa-bolt' },
      'alimento': { label: 'Alimentos', icon: 'fa-utensils' },
      'snack': { label: 'Snacks', icon: 'fa-cookie' },
      'suplemento_alimenticio': { label: 'Suplementos', icon: 'fa-pills' },
      'cosmetico': { label: 'Cosméticos', icon: 'fa-palette' },
      'skincare': { label: 'Skincare', icon: 'fa-spa' },
      'maquillaje': { label: 'Maquillaje', icon: 'fa-paintbrush' },
      'perfume': { label: 'Perfumes', icon: 'fa-spray-can' },
      'cuidado_cabello': { label: 'Cuidado del Cabello', icon: 'fa-scissors' },
      'app': { label: 'Apps/Software', icon: 'fa-mobile-screen' },
      'electronico': { label: 'Electrónicos', icon: 'fa-laptop' },
      'smartphone': { label: 'Smartphones', icon: 'fa-mobile-screen-button' },
      'ropa': { label: 'Ropa', icon: 'fa-shirt' },
      'calzado': { label: 'Calzado', icon: 'fa-shoe-prints' },
      'accesorio_moda': { label: 'Accesorios de Moda', icon: 'fa-bag-shopping' },
      'otro': { label: 'Otros', icon: 'fa-box' }
    };
  }

  /**
   * Inicializar la vista (para lista de productos)
   */
  async init() {
    // Cargar script de Products si no está disponible usando el método centralizado
    if (!window.ProductsManager) {
      await this.loadScript('js/products.js', 'ProductsManager');
    }

    // Inicializar ProductsManager
    if (window.ProductsManager) {
      // Crear instancia solo si no existe
      if (!this.productsManager) {
        this.productsManager = new window.ProductsManager();
        // NO llamar init() automáticamente - ProductsManager.init() se llama desde el template
        // porque necesita que el DOM esté renderizado
        if (this.container && this.container.innerHTML) {
          await this.productsManager.init();
        }
      }
    }

    // Setup links para usar router
    this.setupRouterLinks();
  }

  /**
   * Configurar links para usar router
   */
  setupRouterLinks() {
    const livingLinks = this.querySelectorAll('a[href*="living"]');
    const studioLinks = this.querySelectorAll('a[href*="studio"]');

    livingLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate('/living');
        }
      });
    });

    studioLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate('/studio');
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
   * Configurar campos editables
   */
  setupEditableFields() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;

    // Textos simples
    container.querySelectorAll('.editable-text').forEach(field => {
      const fieldName = field.getAttribute('data-field');
      const fieldType = field.getAttribute('data-type') || 'text';
      this.makeEditableText(field, fieldName, fieldType);
    });

    // Textareas
    container.querySelectorAll('.editable-textarea').forEach(field => {
      const fieldName = field.getAttribute('data-field');
      this.makeEditableTextarea(field, fieldName);
    });

    // Selects
    container.querySelectorAll('.editable-select').forEach(field => {
      const fieldName = field.getAttribute('data-field');
      if (fieldName === 'tipo_producto') {
        const options = Object.entries(this.getCategoryMap()).map(([value, info]) => ({
          value,
          label: info.label
        }));
        this.makeEditableSelect(field, fieldName, options);
      } else if (fieldName === 'moneda') {
        this.makeEditableSelect(field, fieldName, [
          { value: 'USD', label: 'USD' },
          { value: 'EUR', label: 'EUR' },
          { value: 'MXN', label: 'MXN' },
          { value: 'COP', label: 'COP' },
          { value: 'ARS', label: 'ARS' },
          { value: 'CLP', label: 'CLP' }
        ]);
      }
    });
  }

  /**
   * Hacer campo de texto editable
   */
  makeEditableText(element, fieldName, fieldType = 'text') {
    if (!element) return;

    // Aplicar estilos sin transiciones usando función común de BaseView
    element.style.cursor = 'text';
    this.applyNoTransitionStyles(element);
    
    element.setAttribute('contenteditable', 'true');
    element.classList.add('editable-field');
    element.classList.add('product-editable'); // Clase para protección en forceFixedSize

    const originalValue = this.productData?.[fieldName] || '';

    element.addEventListener('blur', async () => {
      let value = element.textContent.trim();
      
      // Convertir a número si es necesario
      if (fieldType === 'number') {
        value = value ? parseFloat(value) : null;
      }

      if (value !== originalValue) {
        await this.saveProductField(fieldName, value);
      }
    });

    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        element.blur();
      }
    });

    // Agregar listeners para prevenir efectos hover usando función común
    this.addNoHoverListeners(element);
  }

  /**
   * Hacer textarea editable
   */
  makeEditableTextarea(element, fieldName) {
    if (!element) return;

    const originalValue = this.productData?.[fieldName] || '';

    const textarea = document.createElement('textarea');
    textarea.value = originalValue;
    textarea.className = 'editable-textarea product-editable';
    textarea.style.width = '100%';
    textarea.style.minHeight = '100px';
    textarea.style.padding = '0.75rem 1rem';
    textarea.style.background = 'transparent';
    textarea.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    textarea.style.borderRadius = '0';
    textarea.style.color = 'var(--text-primary, #F2F3F5)';
    textarea.style.fontSize = '0.875rem';
    textarea.style.fontFamily = 'inherit';
    textarea.style.resize = 'vertical';
    textarea.style.cursor = 'text';
    this.applyNoTransitionStyles(textarea);
    this.addNoHoverListeners(textarea);

    element.innerHTML = '';
    element.appendChild(textarea);

    textarea.addEventListener('blur', async () => {
      const value = textarea.value.trim();
      if (value !== originalValue) {
        await this.saveProductField(fieldName, value);
        // Actualizar visualmente
        element.innerHTML = value || '<span style="opacity: 0.5;">Sin contenido</span>';
        this.makeEditableTextarea(element, fieldName);
      } else {
        element.innerHTML = originalValue || '<span style="opacity: 0.5;">Sin contenido</span>';
        this.makeEditableTextarea(element, fieldName);
      }
    });

    textarea.focus();
  }

  /**
   * Hacer select editable
   */
  makeEditableSelect(element, fieldName, options) {
    if (!element) return;

    const originalValue = this.productData?.[fieldName] || '';

    const select = document.createElement('select');
    select.className = 'editable-select product-editable'; // Clase para protección
    select.style.width = '100%';
    select.style.padding = '0.75rem 1rem';
    select.style.background = 'transparent';
    select.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    select.style.borderRadius = '0';
    select.style.color = 'var(--text-primary, #F2F3F5)';
    select.style.fontSize = '0.875rem';
    select.style.cursor = 'default';
    
    // Aplicar protección completa usando funciones de BaseView
    this.applyNoTransitionStyles(select);
    this.addNoHoverListeners(select);

    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === originalValue) option.selected = true;
      select.appendChild(option);
    });

    element.innerHTML = '';
    element.appendChild(select);

    select.addEventListener('change', async () => {
      const value = select.value;
      if (value !== originalValue) {
        await this.saveProductField(fieldName, value);
        // Actualizar visualmente
        const selectedOption = options.find(opt => opt.value === value);
        element.innerHTML = selectedOption ? selectedOption.label : value;
        this.makeEditableSelect(element, fieldName, options);
      }
    });

    select.focus();
  }

  /**
   * Guardar campo del producto
   */
  async saveProductField(fieldName, value) {
    if (!this.supabase || !this.productId || this.savingFields.has(fieldName)) {
      return;
    }

    this.savingFields.add(fieldName);

    try {
      const { error } = await this.supabase
        .from('products')
        .update({ [fieldName]: value, updated_at: new Date().toISOString() })
        .eq('id', this.productId);

      if (error) throw error;

      // Actualizar datos locales
      this.productData[fieldName] = value;
      this.showNotification('Campo guardado correctamente', 'success');
    } catch (error) {
      console.error('Error guardando campo:', error);
      this.showNotification('Error al guardar el campo', 'error');
    } finally {
      this.savingFields.delete(fieldName);
    }
  }

  /**
   * Configurar subida de imágenes
   */
  setupImageUpload() {
    const uploadInput = document.getElementById('productImageUpload');
    if (!uploadInput) return;

    uploadInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        await this.uploadProductImage(file);
      }

      // Limpiar input
      uploadInput.value = '';
    });
  }

  /**
   * Subir imagen del producto
   */
  async uploadProductImage(file) {
    if (!this.supabase || !this.productId || !this.brandContainerId) return;

    try {
      // Subir a Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${this.productId}/${Date.now()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from('product-images')
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = this.supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      // Guardar referencia en product_images
      const maxOrder = this.productImages.length > 0
        ? Math.max(...this.productImages.map(img => img.image_order || 0))
        : -1;

      const { data: imageData, error: dbError } = await this.supabase
        .from('product_images')
        .insert({
          product_id: this.productId,
          image_url: publicUrl,
          image_type: 'product',
          image_order: maxOrder + 1
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Recargar imágenes y actualizar UI
      await this.loadProductImages();
      this.renderProductImages();
      this.showNotification('Imagen subida correctamente', 'success');
    } catch (error) {
      console.error('Error subiendo imagen:', error);
      this.showNotification('Error al subir la imagen', 'error');
    }
  }

  /**
   * Renderizar imágenes del producto
   */
  renderProductImages() {
    const gallery = document.getElementById('productImagesGallery');
    if (!gallery) return;

    const images = this.productImages || [];
    gallery.innerHTML = images.map((img, index) => `
      <div class="product-image-item" data-image-id="${img.id}">
        <img src="${img.image_url}" alt="Imagen ${index + 1}" />
        <button class="delete-image-btn" data-image-id="${img.id}" title="Eliminar imagen">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');

    // Reconfigurar event listeners
    this.setupImageDeleteButtons();
  }

  /**
   * Configurar botones de eliminar imagen
   */
  setupImageDeleteButtons() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;

    container.querySelectorAll('.delete-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imageId = btn.getAttribute('data-image-id');
        if (confirm('¿Eliminar esta imagen?')) {
          await this.deleteProductImage(imageId);
        }
      });
    });
  }

  /**
   * Eliminar imagen del producto
   */
  async deleteProductImage(imageId) {
    if (!this.supabase || !imageId) return;

    try {
      // Obtener datos de la imagen
      const { data: imageData, error: fetchError } = await this.supabase
        .from('product_images')
        .select('image_url')
        .eq('id', imageId)
        .single();

      if (fetchError) throw fetchError;

      // Eliminar de la base de datos
      const { error: deleteError } = await this.supabase
        .from('product_images')
        .delete()
        .eq('id', imageId);

      if (deleteError) throw deleteError;

      // Intentar eliminar del storage (opcional, puede fallar si no existe)
      if (imageData?.image_url) {
        const urlParts = imageData.image_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const productId = urlParts[urlParts.length - 2];
        const filePath = `products/${productId}/${fileName}`;
        
        await this.supabase.storage
          .from('product-images')
          .remove([filePath]);
      }

      // Recargar imágenes y actualizar UI
      await this.loadProductImages();
      this.renderProductImages();
      this.showNotification('Imagen eliminada correctamente', 'success');
    } catch (error) {
      console.error('Error eliminando imagen:', error);
      this.showNotification('Error al eliminar la imagen', 'error');
    }
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;

    // Botón de volver
    const backBtn = container.querySelector('.back-to-products-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (window.router) {
          window.router.navigate('/products');
        }
      });
    }

    // Botones de eliminar imagen
    this.setupImageDeleteButtons();
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
   * Hook al salir de la vista - sin limpieza
   */
  async onLeave() {
    // Sin limpieza - el navegador maneja todo automáticamente
  }
}

// Hacer disponible globalmente
window.ProductsView = ProductsView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductsView;
}

