/**
 * AI Smart Content - Products Page
 * Gestión de productos con galería y sidebar
 */

// Evitar redeclaración si ya existe
if (typeof window.ProductsManager === 'undefined') {
  class ProductsManager {
    constructor() {
        this.supabase = null;
        this.userId = null;
        this.brandContainerId = null;
        this.products = [];
        this.currentProduct = null;
        this.init();
    }

    async init() {
        await this.initSupabase();
        if (!this.supabase || !this.userId) {
            // Usar router si está disponible
            if (window.router) {
                window.router.navigate('/login', true);
            } else {
                window.location.href = '/login';
            }
            return;
        }

        await this.loadBrandContainer();
        await this.loadUserData();
        this.setupEventListeners();
        await this.loadProducts();
        // Sidebar se actualiza automáticamente por SidebarManager (persistente)
    }

    async loadUserData() {
        try {
            // Cargar datos del usuario
            const { data: userData, error: userError } = await this.supabase
                .from('users')
                .select('*')
                .eq('id', this.userId)
                .single();

            if (!userError && userData) {
                this.userData = userData;
            }

            // Si hay brandContainerId, cargar datos del brand container
            if (this.brandContainerId) {
                const { data: brandData, error: brandError } = await this.supabase
                    .from('brand_containers')
                    .select('*')
                    .eq('id', this.brandContainerId)
                    .single();

                if (!brandError && brandData) {
                    this.brandData = brandData;
                }
            }
        } catch (error) {
            console.error('Error cargando datos de usuario:', error);
        }
    }

    // updateNavHeader() removido - El sidebar es persistente y se maneja por SidebarManager

    async initSupabase() {
        try {
            // Prioridad 1: Usar SupabaseService
            if (window.supabaseService) {
                this.supabase = await window.supabaseService.getClient();
            }
            // Prioridad 2: Usar appLoader
            else if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
                this.supabase = await window.appLoader.waitFor();
            }
            // Prioridad 3: Usar supabase global
            else if (window.supabase) {
                this.supabase = window.supabase;
            }
            // Prioridad 4: Funciones legacy
            else if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase(15000);
            } else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            } else if (typeof initSupabase === 'function') {
                this.supabase = await initSupabase();
            }

            if (!this.supabase) {
                throw new Error('No se pudo inicializar Supabase');
            }

            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            
            if (userError || !user) {
                throw new Error('Usuario no autenticado');
            }

            this.userId = user.id;
        } catch (error) {
            console.error('Error inicializando Supabase:', error);
            throw error;
        }
    }

    async loadBrandContainer() {
        try {
            // Cargar brand_container asociado al usuario
            const { data: brandContainer, error } = await this.supabase
                .from('brand_containers')
                .select('id')
                .eq('user_id', this.userId)
                .maybeSingle();

            // Si no hay registros o hay error, continuar sin brandContainerId
            if (error) {
                if (error.code === 'PGRST116') {
                    console.log('ℹ️ No hay brand_container, continuando sin él');
                    this.brandContainerId = null;
                    return;
                }
                console.warn('⚠️ Error cargando brand_container:', error.message);
                this.brandContainerId = null;
                return;
            }

            if (brandContainer) {
                this.brandContainerId = brandContainer.id;
                console.log('✅ Brand container cargado:', this.brandContainerId);
            } else {
                this.brandContainerId = null;
                console.log('ℹ️ No hay brand_container asociado');
            }
        } catch (error) {
            console.warn('⚠️ Error cargando brand_container:', error);
            this.brandContainerId = null;
        }
    }

    setupEventListeners() {
        // Add product button - crear producto directamente sin abrir sidebar
        const addProductBtn = document.getElementById('addProductBtn');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', () => {
                this.showNewProductModal();
            });
        }

        // Sidebar close
        const sidebarClose = document.getElementById('sidebarClose');
        if (sidebarClose) {
            sidebarClose.addEventListener('click', () => {
                this.closeSidebar();
            });
        }

        // Sidebar overlay
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                this.closeSidebar();
            });
        }

        // ESC key to close sidebar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSidebar();
            }
        });
    }

    async loadProducts() {
        // Cargar productos - filtrar por brand_container_id
        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');
        const productsGrid = document.getElementById('productsGrid');

        if (!loadingState || !emptyState || !productsGrid) {
            console.error('❌ Elementos del DOM no encontrados');
            return;
        }

        try {
            loadingState.style.display = 'block';
            emptyState.style.display = 'none';
            productsGrid.style.display = 'none';

            // Si no hay brand_container, no hay productos
            if (!this.brandContainerId) {
                console.log('ℹ️ No hay brand_container, mostrando estado vacío');
                loadingState.style.display = 'none';
                emptyState.style.display = 'block';
                this.products = [];
                return;
            }

            console.log('📦 Cargando productos para brand_container:', this.brandContainerId);

            // Consultar productos por brand_container_id
            const { data: products, error } = await this.supabase
                .from('products')
                .select('*')
                .eq('brand_container_id', this.brandContainerId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error cargando productos:', error);
                throw error;
            }

            console.log(`✅ ${products?.length || 0} producto(s) encontrado(s)`);

            // Cargar imágenes para cada producto
            if (products && products.length > 0) {
                for (const product of products) {
                    const { data: images, error: imagesError } = await this.supabase
                        .from('product_images')
                        .select('*')
                        .eq('product_id', product.id)
                        .order('image_order', { ascending: true });

                    if (!imagesError) {
                        product.images = images || [];
                        console.log(`📸 Producto ${product.nombre_producto}: ${images?.length || 0} imagen(es)`);
                    } else {
                        console.warn(`⚠️ Error cargando imágenes para producto ${product.id}:`, imagesError);
                        product.images = [];
                    }
                }
            }

            this.products = products || [];
            console.log('✅ Productos cargados:', this.products.length);
            this.renderProducts();

        } catch (error) {
            console.error('❌ Error completo cargando productos:', error);
            if (loadingState) loadingState.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            if (productsGrid) productsGrid.style.display = 'none';
        }
    }

    renderProducts() {
        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');
        const productsGrid = document.getElementById('productsGrid');

        if (!loadingState || !emptyState || !productsGrid) {
            console.error('❌ Elementos del DOM no encontrados para renderizar productos');
            return;
        }

        loadingState.style.display = 'none';

        if (!this.products || this.products.length === 0) {
            console.log('ℹ️ No hay productos para mostrar');
            emptyState.style.display = 'block';
            productsGrid.style.display = 'none';
            return;
        }

        console.log(`🎨 Renderizando ${this.products.length} producto(s)`);
        emptyState.style.display = 'none';
        productsGrid.style.display = 'grid';
        productsGrid.innerHTML = '';

        this.products.forEach((product, index) => {
            try {
                const card = this.createProductCard(product);
                productsGrid.appendChild(card);
                console.log(`✅ Producto ${index + 1} renderizado: ${product.nombre_producto}`);
            } catch (error) {
                console.error(`❌ Error renderizando producto ${product.id}:`, error);
            }
        });

        console.log('✅ Todos los productos renderizados');
    }

    createProductCard(product) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = product.id;

        const mainImage = product.images && product.images.length > 0 
            ? product.images[0].image_url 
            : null;

        const tipoProductoMap = {
            'bebida': '🥤 Bebida',
            'cosmetico': '💄 Cosmético',
            'skincare': '✨ Skincare',
            'app': '📱 App',
            'ropa': '👕 Ropa',
            'otro': '📦 Otro'
        };

        const tipoLabel = tipoProductoMap[product.tipo_producto] || product.tipo_producto;

        card.innerHTML = `
            <div class="product-card-image">
                ${mainImage 
                    ? `<img src="${mainImage}" alt="${product.nombre_producto}" loading="lazy">` 
                    : `<div class="no-image"><i class="fas fa-image"></i></div>`
                }
                <div class="product-card-badge">${tipoLabel}</div>
            </div>
            <div class="product-card-content">
                <h3 class="product-card-title">${product.nombre_producto || 'Sin nombre'}</h3>
                <p class="product-card-description">${product.descripcion_producto || 'Sin descripción'}</p>
                <div class="product-card-footer">
                    <div class="product-card-price">
                        ${product.precio_producto 
                            ? `${product.moneda || 'USD'} $${parseFloat(product.precio_producto).toFixed(2)}` 
                            : 'Precio no definido'
                        }
                    </div>
                    <div class="product-card-actions">
                        <button class="btn-icon edit" title="Editar" data-product-id="${product.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon delete" title="Eliminar" data-product-id="${product.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Event listeners
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.product-card-actions')) {
                this.openSidebar(product.id);
            }
        });

        card.querySelector('.btn-icon.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openSidebar(product.id);
        });

        card.querySelector('.btn-icon.delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('¿Estás seguro de que deseas eliminar este producto?')) {
                await this.deleteProduct(product.id);
            }
        });

        return card;
    }

    openSidebar(productId) {
        if (!productId) {
            console.warn('No se puede abrir sidebar sin un productId');
            return;
        }

        const sidebar = document.getElementById('productsSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const main = document.querySelector('.products-main');

        sidebar.classList.add('open');
        overlay.classList.add('active');
        main.classList.add('sidebar-open');

        this.loadProductDetails(productId);
    }

    closeSidebar() {
        const sidebar = document.getElementById('productsSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const main = document.querySelector('.products-main');

        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        main.classList.remove('sidebar-open');

        this.currentProduct = null;
    }

    async loadProductDetails(productId) {
        const sidebarContent = document.getElementById('sidebarContent');
        const sidebarTitle = document.getElementById('sidebarTitle');

        sidebarContent.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando...</p></div>';

        try {
            const product = this.products.find(p => p.id === productId);
            if (!product) {
                throw new Error('Producto no encontrado');
            }

            this.currentProduct = product;
            sidebarTitle.textContent = 'Editar Producto';
            this.showProductForm(product);

        } catch (error) {
            console.error('Error cargando detalles:', error);
            sidebarContent.innerHTML = `<div class="error-state"><p>Error al cargar el producto: ${error.message}</p></div>`;
        }
    }

    showNewProductModal() {
        // Crear modal para nuevo producto
        const modal = document.createElement('div');
        modal.className = 'new-product-modal';
        modal.id = 'newProductModal';
        modal.innerHTML = `
            <div class="modal-overlay" id="newProductOverlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Nuevo Producto</h2>
                    <button class="modal-close" id="closeNewProductModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="newProductFormContainer">
                    <!-- Form will be inserted here -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Mostrar formulario
        this.currentProduct = null;
        const formContainer = document.getElementById('newProductFormContainer');
        formContainer.innerHTML = this.getProductFormHTML(null);

        // Event listeners
        document.getElementById('newProductOverlay').addEventListener('click', () => {
            this.closeNewProductModal();
        });
        document.getElementById('closeNewProductModal').addEventListener('click', () => {
            this.closeNewProductModal();
        });
        const form = document.getElementById('new_productForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProductFromModal();
            });
        }
        const cancelBtn = document.getElementById('new_cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeNewProductModal();
            });
        }

        // Mostrar modal
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
    }

    closeNewProductModal() {
        const modal = document.getElementById('newProductModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    async saveProductFromModal() {
        const form = document.getElementById('new_productForm');
        const saveBtn = document.getElementById('new_saveBtn');

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = {
            brand_container_id: this.brandContainerId,
            tipo_producto: document.getElementById('new_tipo_producto').value,
            nombre_producto: document.getElementById('new_nombre_producto').value.trim(),
            descripcion_producto: document.getElementById('new_descripcion_producto').value.trim(),
            beneficio_1: document.getElementById('new_beneficio_1').value.trim() || null,
            beneficio_2: document.getElementById('new_beneficio_2').value.trim() || null,
            beneficio_3: document.getElementById('new_beneficio_3').value.trim() || null,
            diferenciacion: document.getElementById('new_diferenciacion').value.trim() || null,
            modo_uso: document.getElementById('new_modo_uso').value.trim() || null,
            ingredientes: document.getElementById('new_ingredientes').value.trim() || null,
            precio_producto: document.getElementById('new_precio_producto').value ? parseFloat(document.getElementById('new_precio_producto').value) : null,
            moneda: document.getElementById('new_moneda').value,
            variantes_producto: document.getElementById('new_variantes_producto').value.trim() || null
        };

        saveBtn.disabled = true;
        saveBtn.textContent = 'Creando...';

        try {
            const { error } = await this.supabase
                .from('products')
                .insert(formData);

            if (error) throw error;

            this.closeNewProductModal();
            await this.loadProducts();
            alert('Producto creado exitosamente');

        } catch (error) {
            console.error('Error creando producto:', error);
            alert(`Error al crear el producto: ${error.message}`);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Crear Producto';
        }
    }

    getProductFormHTML(product = null) {
        const prefix = product ? '' : 'new_';
        const tipoProductoOptions = `
            <option value="">Seleccionar tipo...</option>
            <optgroup label="Bebidas y Alimentos">
                <option value="bebida" ${product?.tipo_producto === 'bebida' ? 'selected' : ''}>🥤 Bebida</option>
                <option value="bebida_alcoholica" ${product?.tipo_producto === 'bebida_alcoholica' ? 'selected' : ''}>🍷 Bebida Alcohólica</option>
                <option value="agua" ${product?.tipo_producto === 'agua' ? 'selected' : ''}>💧 Agua</option>
                <option value="energetica" ${product?.tipo_producto === 'energetica' ? 'selected' : ''}>⚡ Bebida Energética</option>
                <option value="alimento" ${product?.tipo_producto === 'alimento' ? 'selected' : ''}>🍽️ Alimento</option>
                <option value="snack" ${product?.tipo_producto === 'snack' ? 'selected' : ''}>🍿 Snack</option>
            </optgroup>
            <optgroup label="Belleza y Cuidado Personal">
                <option value="cosmetico" ${product?.tipo_producto === 'cosmetico' ? 'selected' : ''}>💄 Cosmético</option>
                <option value="skincare" ${product?.tipo_producto === 'skincare' ? 'selected' : ''}>✨ Skincare</option>
                <option value="maquillaje" ${product?.tipo_producto === 'maquillaje' ? 'selected' : ''}>🎨 Maquillaje</option>
                <option value="perfume" ${product?.tipo_producto === 'perfume' ? 'selected' : ''}>🌸 Perfume</option>
                <option value="cuidado_cabello" ${product?.tipo_producto === 'cuidado_cabello' ? 'selected' : ''}>💇 Cuidado del Cabello</option>
            </optgroup>
            <optgroup label="Tecnología">
                <option value="app" ${product?.tipo_producto === 'app' ? 'selected' : ''}>📱 App/Software</option>
                <option value="electronico" ${product?.tipo_producto === 'electronico' ? 'selected' : ''}>💻 Electrónico</option>
                <option value="smartphone" ${product?.tipo_producto === 'smartphone' ? 'selected' : ''}>📲 Smartphone</option>
            </optgroup>
            <optgroup label="Moda y Accesorios">
                <option value="ropa" ${product?.tipo_producto === 'ropa' ? 'selected' : ''}>👕 Ropa/Moda</option>
                <option value="calzado" ${product?.tipo_producto === 'calzado' ? 'selected' : ''}>👟 Calzado</option>
                <option value="accesorio_moda" ${product?.tipo_producto === 'accesorio_moda' ? 'selected' : ''}>👜 Accesorio de Moda</option>
            </optgroup>
            <optgroup label="Otros">
                <option value="otro" ${product?.tipo_producto === 'otro' ? 'selected' : ''}>📦 Otro</option>
            </optgroup>
        `;

        return `
            <form class="sidebar-form" id="${prefix}productForm">
                <div class="form-group">
                    <label>Tipo de producto <span class="required">*</span></label>
                    <select class="form-select" id="${prefix}tipo_producto" name="tipo_producto" required>
                        ${tipoProductoOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label>Nombre del producto <span class="required">*</span></label>
                    <input type="text" class="form-input" id="${prefix}nombre_producto" name="nombre_producto" 
                           value="${product?.nombre_producto || ''}" required>
                </div>

                <div class="form-group">
                    <label>Descripción <span class="required">*</span></label>
                    <textarea class="form-textarea" id="${prefix}descripcion_producto" name="descripcion_producto" 
                              required>${product?.descripcion_producto || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Beneficio 1</label>
                    <input type="text" class="form-input" id="${prefix}beneficio_1" name="beneficio_1" 
                           value="${product?.beneficio_1 || ''}">
                </div>

                <div class="form-group">
                    <label>Beneficio 2</label>
                    <input type="text" class="form-input" id="${prefix}beneficio_2" name="beneficio_2" 
                           value="${product?.beneficio_2 || ''}">
                </div>

                <div class="form-group">
                    <label>Beneficio 3</label>
                    <input type="text" class="form-input" id="${prefix}beneficio_3" name="beneficio_3" 
                           value="${product?.beneficio_3 || ''}">
                </div>

                <div class="form-group">
                    <label>Diferenciación</label>
                    <textarea class="form-textarea" id="${prefix}diferenciacion" name="diferenciacion">${product?.diferenciacion || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Modo de uso</label>
                    <textarea class="form-textarea" id="${prefix}modo_uso" name="modo_uso">${product?.modo_uso || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Ingredientes</label>
                    <textarea class="form-textarea" id="${prefix}ingredientes" name="ingredientes">${product?.ingredientes || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Precio</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <select class="form-select" id="${prefix}moneda" name="moneda" style="width: 100px;">
                            <option value="USD" ${product?.moneda === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="MXN" ${product?.moneda === 'MXN' ? 'selected' : ''}>MXN</option>
                            <option value="COP" ${product?.moneda === 'COP' ? 'selected' : ''}>COP</option>
                            <option value="ARS" ${product?.moneda === 'ARS' ? 'selected' : ''}>ARS</option>
                            <option value="EUR" ${product?.moneda === 'EUR' ? 'selected' : ''}>EUR</option>
                        </select>
                        <input type="number" class="form-input" id="${prefix}precio_producto" name="precio_producto" 
                               value="${product?.precio_producto || ''}" step="0.01" min="0" style="flex: 1;">
                    </div>
                </div>

                <div class="form-group">
                    <label>Variantes</label>
                    <textarea class="form-textarea" id="${prefix}variantes_producto" name="variantes_producto">${product?.variantes_producto || ''}</textarea>
                </div>

                ${product ? this.renderProductImages(product.images || []) : `
                <div class="product-images-section">
                    <label style="display: block; margin-bottom: 0.75rem; font-weight: 600; color: var(--text-primary);">
                        Imágenes del producto
                    </label>
                    <div class="add-image-section">
                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.75rem;">
                            Guarda el producto primero para poder agregar imágenes
                        </p>
                    </div>
                </div>
                `}

                <div class="form-actions">
                    <button type="button" class="btn-secondary" id="${prefix}cancelBtn">Cancelar</button>
                    <button type="submit" class="btn-primary" id="${prefix}saveBtn">
                        ${product ? 'Guardar Cambios' : 'Crear Producto'}
                    </button>
                </div>
            </form>
        `;
    }

    showProductForm(product) {
        const sidebarContent = document.getElementById('sidebarContent');
        sidebarContent.innerHTML = this.getProductFormHTML(product);

        // Event listeners
        document.getElementById('productForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProduct();
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.closeSidebar();
        });
    }

    renderProductImages(images) {
        const productId = this.currentProduct?.id || 'new';
        const inputId = `productImageInput_${productId}`;
        
        let html = `
            <div class="product-images-section">
                <label style="display: block; margin-bottom: 0.75rem; font-weight: 600; color: var(--text-primary);">
                    Imágenes del producto
                </label>
                <div class="images-grid" id="productImagesGrid_${productId}">
        `;

        if (images && images.length > 0) {
            // Ordenar imágenes por image_order
            const sortedImages = [...images].sort((a, b) => (a.image_order || 0) - (b.image_order || 0));
            
            sortedImages.forEach((image, index) => {
                const isPrincipal = image.image_type === 'principal';
                html += `
                    <div class="image-item" data-image-id="${image.id}" draggable="true">
                        <div class="image-wrapper">
                            <img src="${image.image_url}" alt="Imagen del producto" loading="lazy">
                            <div class="image-overlay">
                                <div class="image-actions">
                                    <button type="button" class="btn-image-action ${isPrincipal ? 'active' : ''}" 
                                            onclick="productsManager.setImageAsPrincipal('${image.id}', '${productId}')" 
                                            title="${isPrincipal ? 'Imagen principal' : 'Marcar como principal'}">
                                        <i class="fas fa-star"></i>
                                    </button>
                                    <button type="button" class="btn-image-action" 
                                            onclick="productsManager.removeProductImage('${image.id}', '${productId}')" 
                                            title="Eliminar imagen">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                                ${isPrincipal ? '<span class="image-badge">Principal</span>' : ''}
                            </div>
                        </div>
                        <div class="image-order-controls">
                            <button type="button" class="btn-order" onclick="productsManager.moveImageOrder('${image.id}', '${productId}', -1)" 
                                    ${index === 0 ? 'disabled' : ''} title="Mover arriba">
                                <i class="fas fa-arrow-up"></i>
                            </button>
                            <span class="order-number">${index + 1}</span>
                            <button type="button" class="btn-order" onclick="productsManager.moveImageOrder('${image.id}', '${productId}', 1)" 
                                    ${index === sortedImages.length - 1 ? 'disabled' : ''} title="Mover abajo">
                                <i class="fas fa-arrow-down"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
                <div class="add-image-section" style="margin-top: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-secondary);">
                        Agregar nueva imagen
                    </label>
                    <div class="upload-zone-small" onclick="document.getElementById('${inputId}').click()" 
                         style="border: 2px dashed #1B1D1F; border-radius: 8px; padding: 1.5rem; text-align: center; cursor: pointer; transition: all 0.3s ease; background: #121416;">
                        <input type="file" id="${inputId}" accept="image/*" style="display: none;" 
                               onchange="productsManager.handleNewImageUpload(event, '${productId}')" multiple>
                        <i class="fas fa-plus" style="font-size: 1.5rem; color: var(--text-secondary); margin-bottom: 0.5rem;"></i>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0;">Haz clic para agregar imagen</p>
                        <p style="color: var(--text-muted); font-size: 0.75rem; margin: 0.25rem 0 0 0;">Máximo 5MB por imagen</p>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    async removeProductImage(imageId, productId) {
        if (!confirm('¿Estás seguro de que deseas eliminar esta imagen?')) {
            return;
        }

        try {
            // Obtener información de la imagen para eliminar de storage
            const { data: image, error: fetchError } = await this.supabase
                .from('product_images')
                .select('image_url, image_type')
                .eq('id', imageId)
                .single();

            if (fetchError) throw fetchError;

            const wasPrincipal = image.image_type === 'principal';

            // Extraer path del URL para eliminar de storage
            if (image.image_url) {
                const url = new URL(image.image_url);
                const pathParts = url.pathname.split('/');
                const fileName = pathParts.slice(pathParts.indexOf('product-images') + 1).join('/');

                // Eliminar de storage
                const { error: storageError } = await this.supabase.storage
                    .from('product-images')
                    .remove([fileName]);

                if (storageError) {
                    console.warn('Error eliminando de storage:', storageError);
                    // Continuar aunque falle el storage
                }
            }

            // Eliminar de base de datos
            const { error: deleteError } = await this.supabase
                .from('product_images')
                .delete()
                .eq('id', imageId);

            if (deleteError) throw deleteError;

            // Si era la imagen principal, asignar la primera restante como principal
            if (wasPrincipal) {
                const { data: remainingImages } = await this.supabase
                    .from('product_images')
                    .select('id')
                    .eq('product_id', productId)
                    .order('image_order', { ascending: true })
                    .limit(1);

                if (remainingImages && remainingImages.length > 0) {
                    await this.supabase
                        .from('product_images')
                        .update({ image_type: 'principal' })
                        .eq('id', remainingImages[0].id);
                }
            }

            // Recargar detalles del producto
            if (this.currentProduct && this.currentProduct.id === productId) {
                await this.loadProductDetails(productId);
            }
            await this.loadProducts();

            this.showNotification('✅ Imagen eliminada exitosamente', 'success');
        } catch (error) {
            console.error('Error eliminando imagen:', error);
            this.showNotification(`❌ Error al eliminar imagen: ${error.message}`, 'error');
        }
    }

    async setImageAsPrincipal(imageId, productId) {
        try {
            // Primero, quitar principal de todas las imágenes del producto
            await this.supabase
                .from('product_images')
                .update({ image_type: 'secundaria' })
                .eq('product_id', productId);

            // Luego, marcar esta imagen como principal
            const { error } = await this.supabase
                .from('product_images')
                .update({ image_type: 'principal' })
                .eq('id', imageId);

            if (error) throw error;

            // Recargar detalles del producto
            if (this.currentProduct && this.currentProduct.id === productId) {
                await this.loadProductDetails(productId);
            }
            await this.loadProducts();

            this.showNotification('✅ Imagen marcada como principal', 'success');
        } catch (error) {
            console.error('Error marcando imagen como principal:', error);
            this.showNotification(`❌ Error: ${error.message}`, 'error');
        }
    }

    async moveImageOrder(imageId, productId, direction) {
        try {
            // Obtener imagen actual
            const { data: currentImage, error: fetchError } = await this.supabase
                .from('product_images')
                .select('image_order')
                .eq('id', imageId)
                .single();

            if (fetchError) throw fetchError;

            const currentOrder = currentImage.image_order || 0;
            const newOrder = currentOrder + direction;

            // Obtener todas las imágenes del producto ordenadas
            const { data: allImages, error: listError } = await this.supabase
                .from('product_images')
                .select('id, image_order')
                .eq('product_id', productId)
                .order('image_order', { ascending: true });

            if (listError) throw listError;

            // Validar que el nuevo orden esté dentro del rango
            if (newOrder < 0 || newOrder >= allImages.length) {
                return; // No hacer nada si está fuera de rango
            }

            // Encontrar la imagen que está en la posición objetivo
            const targetImage = allImages.find(img => (img.image_order || 0) === newOrder);
            if (!targetImage) return;

            // Intercambiar órdenes
            await this.supabase
                .from('product_images')
                .update({ image_order: newOrder })
                .eq('id', imageId);

            await this.supabase
                .from('product_images')
                .update({ image_order: currentOrder })
                .eq('id', targetImage.id);

            // Recargar detalles del producto
            if (this.currentProduct && this.currentProduct.id === productId) {
                await this.loadProductDetails(productId);
            }
            await this.loadProducts();

        } catch (error) {
            console.error('Error moviendo orden de imagen:', error);
            this.showNotification(`❌ Error al reordenar imagen: ${error.message}`, 'error');
        }
    }

    async handleNewImageUpload(event, productId = null) {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        // Si no hay productId, usar el producto actual
        if (!productId) {
            if (!this.currentProduct || !this.currentProduct.id) {
                this.showNotification('❌ No hay producto seleccionado. Crea o selecciona un producto primero.', 'error');
                event.target.value = '';
                return;
            }
            productId = this.currentProduct.id;
        }

        // Validar archivos
        const validFiles = [];
        for (const file of files) {
            // Validar tamaño (5MB máximo)
            if (file.size > 5 * 1024 * 1024) {
                this.showNotification(`❌ ${file.name} es demasiado grande. Máximo 5MB.`, 'error');
                continue;
            }
            // Validar tipo
            if (!file.type.startsWith('image/')) {
                this.showNotification(`❌ ${file.name} no es una imagen válida.`, 'error');
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length === 0) {
            event.target.value = '';
            return;
        }

        // Si el producto es nuevo (productId === 'new'), guardar primero
        if (productId === 'new') {
            this.showNotification('⚠️ Guarda el producto primero antes de agregar imágenes', 'error');
            event.target.value = '';
            return;
        }

        try {
            // Obtener número de imágenes existentes para el orden
            const { data: existingImages } = await this.supabase
                .from('product_images')
                .select('image_order')
                .eq('product_id', productId)
                .order('image_order', { ascending: false })
                .limit(1);

            let nextOrder = existingImages && existingImages.length > 0 
                ? existingImages[0].image_order + 1 
                : 0;

            // Subir todas las imágenes
            const uploadPromises = validFiles.map(async (file) => {
                const fileExt = file.name.split('.').pop();
                const fileName = `${this.userId}/${productId}/${Date.now()}_${Math.random().toString(36).substring(7)}_${file.name}`;

                // Subir imagen
                const { error: uploadError } = await this.supabase.storage
                    .from('product-images')
                    .upload(fileName, file, {
                        contentType: file.type,
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) throw uploadError;

                // Obtener URL pública
                const { data: { publicUrl } } = this.supabase.storage
                    .from('product-images')
                    .getPublicUrl(fileName);

                // Determinar tipo de imagen (primera imagen sin principal = principal)
                const { data: hasPrincipal } = await this.supabase
                    .from('product_images')
                    .select('id')
                    .eq('product_id', productId)
                    .eq('image_type', 'principal')
                    .limit(1);

                const imageType = (!hasPrincipal || hasPrincipal.length === 0) && nextOrder === 0
                    ? 'principal'
                    : 'secundaria';

                // Insertar registro en base de datos
                const { error: insertError } = await this.supabase
                    .from('product_images')
                    .insert({
                        product_id: productId,
                        image_url: publicUrl,
                        image_type: imageType,
                        image_order: nextOrder
                    });

                if (insertError) throw insertError;
                nextOrder++;
            });

            await Promise.all(uploadPromises);

            // Limpiar input
            event.target.value = '';

            // Recargar detalles del producto
            if (this.currentProduct && this.currentProduct.id === productId) {
                await this.loadProductDetails(productId);
            }
            await this.loadProducts();

            this.showNotification(`✅ ${validFiles.length} imagen(es) agregada(s) exitosamente`, 'success');
        } catch (error) {
            console.error('Error subiendo imagen:', error);
            this.showNotification(`❌ Error al subir imagen(es): ${error.message}`, 'error');
            event.target.value = '';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    async saveProduct() {
        const form = document.getElementById('productForm');
        const saveBtn = document.getElementById('saveBtn');

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = {
            brand_container_id: this.brandContainerId,
            tipo_producto: document.getElementById('tipo_producto').value,
            nombre_producto: document.getElementById('nombre_producto').value.trim(),
            descripcion_producto: document.getElementById('descripcion_producto').value.trim(),
            beneficio_1: document.getElementById('beneficio_1').value.trim() || null,
            beneficio_2: document.getElementById('beneficio_2').value.trim() || null,
            beneficio_3: document.getElementById('beneficio_3').value.trim() || null,
            diferenciacion: document.getElementById('diferenciacion').value.trim() || null,
            modo_uso: document.getElementById('modo_uso').value.trim() || null,
            ingredientes: document.getElementById('ingredientes').value.trim() || null,
            precio_producto: document.getElementById('precio_producto').value ? parseFloat(document.getElementById('precio_producto').value) : null,
            moneda: document.getElementById('moneda').value,
            variantes_producto: document.getElementById('variantes_producto').value.trim() || null
        };

        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
            if (this.currentProduct) {
                // Actualizar producto existente
                const { error } = await this.supabase
                    .from('products')
                    .update(formData)
                    .eq('id', this.currentProduct.id);

                if (error) throw error;
            } else {
                // Crear nuevo producto
                const { error } = await this.supabase
                    .from('products')
                    .insert(formData);

                if (error) throw error;
            }

            this.closeSidebar();
            await this.loadProducts();
            alert(this.currentProduct ? 'Producto actualizado exitosamente' : 'Producto creado exitosamente');

        } catch (error) {
            console.error('Error guardando producto:', error);
            alert(`Error al guardar el producto: ${error.message}`);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this.currentProduct ? 'Guardar Cambios' : 'Crear Producto';
        }
    }

    async deleteProduct(productId) {
        try {
            // Eliminar imágenes primero
            const { error: imagesError } = await this.supabase
                .from('product_images')
                .delete()
                .eq('product_id', productId);

            if (imagesError) {
                console.warn('Error eliminando imágenes:', imagesError);
            }

            // Eliminar producto
            const { error } = await this.supabase
                .from('products')
                .delete()
                .eq('id', productId);

            if (error) throw error;

            await this.loadProducts();
            alert('Producto eliminado exitosamente');

        } catch (error) {
            console.error('Error eliminando producto:', error);
            alert(`Error al eliminar el producto: ${error.message}`);
        }
    }

    async logout() {
        if (this.supabase) {
            await this.supabase.auth.signOut();
        }
        if (window.router) {
            window.router.navigate('/login', true);
        } else {
            window.location.href = '/login';
        }
    }
  }

  // Hacer disponible globalmente
  window.ProductsManager = ProductsManager;
}

// NO inicializar automáticamente - se inicializará desde ProductsView
// La inicialización automática causaba conflictos en SPA

