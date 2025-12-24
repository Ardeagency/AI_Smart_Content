/**
 * AI Smart Content - Products Page
 * Gestión de productos con galería y sidebar
 */

class ProductsManager {
    constructor() {
        this.supabase = null;
        this.userId = null;
        this.projectId = null;
        this.products = [];
        this.currentProduct = null;
        this.init();
    }

    async init() {
        await this.initSupabase();
        if (!this.supabase || !this.userId) {
            window.location.href = 'login.html';
            return;
        }

        await this.loadProject();
        await this.loadUserAndProjectData();
        this.setupEventListeners();
        await this.loadProducts();
        this.updateNavHeader();
    }

    async loadUserAndProjectData() {
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

            // Cargar datos del proyecto
            if (this.projectId) {
                const { data: projectData, error: projectError } = await this.supabase
                    .from('projects')
                    .select('*')
                    .eq('id', this.projectId)
                    .single();

                if (!projectError && projectData) {
                    this.projectData = projectData;
                }
            }
        } catch (error) {
            console.error('Error cargando datos de usuario y proyecto:', error);
        }
    }

    updateNavHeader() {
        const navBrandLogo = document.getElementById('navBrandLogo');
        const navBrandInitials = document.getElementById('navBrandInitials');
        const navBrandName = document.getElementById('navBrandName');
        const navPlanName = document.getElementById('navPlanName');
        const creditsCount = document.getElementById('creditsCount');

        // Actualizar logo de marca
        if (this.projectData && this.projectData.logo_url) {
            if (navBrandLogo) {
                navBrandLogo.src = this.projectData.logo_url + '?t=' + Date.now();
                navBrandLogo.style.display = 'block';
            }
            if (navBrandInitials) {
                navBrandInitials.style.display = 'none';
            }
        } else if (this.projectData && this.projectData.nombre_marca) {
            // Usar iniciales del nombre de marca
            const initials = this.projectData.nombre_marca
                .split(' ')
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase()
                .substring(0, 2);
            if (navBrandInitials) {
                navBrandInitials.textContent = initials;
                navBrandInitials.style.display = 'block';
            }
            if (navBrandLogo) {
                navBrandLogo.style.display = 'none';
            }
        }

        // Actualizar nombre de marca
        if (navBrandName && this.projectData) {
            navBrandName.textContent = this.projectData.nombre_marca || 'Sin marca';
        }

        // Actualizar plan
        if (navPlanName && this.userData) {
            const planNames = {
                'basico': 'Plan Básico',
                'pro': 'Plan Pro',
                'enterprise': 'Plan Enterprise'
            };
            navPlanName.textContent = planNames[this.userData.plan_type] || 'Plan Básico';
        }

        // Actualizar créditos
        if (creditsCount && this.userData) {
            creditsCount.textContent = this.userData.credits_available || 0;
        }

        // Actualizar nombre de marca en el header principal
        const brandNameHeader = document.getElementById('brandNameHeader');
        if (brandNameHeader && this.projectData && this.projectData.nombre_marca) {
            brandNameHeader.textContent = this.projectData.nombre_marca;
        } else if (brandNameHeader) {
            brandNameHeader.textContent = 'Sin marca';
        }
    }

    async initSupabase() {
        try {
            if (typeof waitForSupabase === 'function') {
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

    async loadProject() {
        try {
            const { data: project, error } = await this.supabase
                .from('projects')
                .select('id')
                .eq('user_id', this.userId)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (project) {
                this.projectId = project.id;
            } else {
                // Si no hay proyecto, redirigir al formulario
                window.location.href = 'form-record.html';
            }
        } catch (error) {
            console.error('Error cargando proyecto:', error);
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
        if (!this.projectId) {
            console.warn('⚠️ No hay projectId, no se pueden cargar productos');
            const loadingState = document.getElementById('loadingState');
            const emptyState = document.getElementById('emptyState');
            const productsGrid = document.getElementById('productsGrid');
            if (loadingState) loadingState.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            if (productsGrid) productsGrid.style.display = 'none';
            return;
        }

        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');
        const productsGrid = document.getElementById('productsGrid');

        if (!loadingState || !emptyState || !productsGrid) {
            console.error('❌ Elementos del DOM no encontrados');
            return;
        }

        try {
            console.log('📦 Cargando productos para proyecto:', this.projectId);
            loadingState.style.display = 'block';
            emptyState.style.display = 'none';
            productsGrid.style.display = 'none';

            const { data: products, error } = await this.supabase
                .from('products')
                .select('*')
                .eq('project_id', this.projectId)
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
        document.getElementById('newProductForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProductFromModal();
        });
        document.getElementById('cancelNewProductBtn').addEventListener('click', () => {
            this.closeNewProductModal();
        });

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
        const form = document.getElementById('newProductForm');
        const saveBtn = document.getElementById('saveNewProductBtn');

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = {
            project_id: this.projectId,
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

                ${product ? this.renderProductImages(product.images || []) : ''}

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
        let html = `
            <div class="product-images-section">
                <label>Imágenes del producto</label>
                <div class="images-grid" id="productImagesGrid">
        `;

        if (images && images.length > 0) {
            images.forEach((image, index) => {
                html += `
                    <div class="image-item" data-image-id="${image.id}">
                        <img src="${image.image_url}" alt="Imagen del producto" loading="lazy">
                        <button type="button" class="btn-remove-image" onclick="productsManager.removeProductImage('${image.id}', '${this.currentProduct.id}')" title="Eliminar imagen">
                            <i class="fas fa-times"></i>
                        </button>
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
                    <div class="upload-zone-small" onclick="document.getElementById('newProductImageInput').click()" style="border: 2px dashed var(--border-color); border-radius: 8px; padding: 1rem; text-align: center; cursor: pointer; transition: all 0.3s ease;">
                        <input type="file" id="newProductImageInput" accept="image/*" style="display: none;" onchange="productsManager.handleNewImageUpload(event)">
                        <i class="fas fa-plus" style="font-size: 1.5rem; color: var(--text-secondary); margin-bottom: 0.5rem;"></i>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0;">Haz clic para agregar imagen</p>
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
                .select('image_url')
                .eq('id', imageId)
                .single();

            if (fetchError) throw fetchError;

            // Extraer path del URL para eliminar de storage
            if (image.image_url) {
                const url = new URL(image.image_url);
                const pathParts = url.pathname.split('/');
                const fileName = pathParts.slice(pathParts.indexOf('product-images') + 1).join('/');

                // Eliminar de storage
                await this.supabase.storage
                    .from('product-images')
                    .remove([fileName]);
            }

            // Eliminar de base de datos
            const { error: deleteError } = await this.supabase
                .from('product_images')
                .delete()
                .eq('id', imageId);

            if (deleteError) throw deleteError;

            // Recargar detalles del producto
            await this.loadProductDetails(productId);
            await this.loadProducts();

            this.showNotification('✅ Imagen eliminada exitosamente', 'success');
        } catch (error) {
            console.error('Error eliminando imagen:', error);
            this.showNotification(`❌ Error al eliminar imagen: ${error.message}`, 'error');
        }
    }

    async handleNewImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentProduct || !this.currentProduct.id) {
            this.showNotification('❌ No hay producto seleccionado', 'error');
            return;
        }

        // Validar tamaño (5MB máximo)
        if (file.size > 5 * 1024 * 1024) {
            alert('El archivo es demasiado grande. Máximo 5MB.');
            return;
        }

        try {
            const productId = this.currentProduct.id;
            const fileExt = file.name.split('.').pop();
            const fileName = `${this.userId}/${productId}/${Date.now()}_${file.name}`;

            // Subir imagen
            const { error: uploadError } = await this.supabase.storage
                .from('product-images')
                .upload(fileName, file, {
                    contentType: file.type,
                    cacheControl: '3600'
                });

            if (uploadError) throw uploadError;

            // Obtener URL pública
            const { data: { publicUrl } } = this.supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            // Obtener número de imágenes existentes para el orden
            const { data: existingImages } = await this.supabase
                .from('product_images')
                .select('image_order')
                .eq('product_id', productId)
                .order('image_order', { ascending: false })
                .limit(1);

            const nextOrder = existingImages && existingImages.length > 0 
                ? existingImages[0].image_order + 1 
                : 0;

            // Insertar registro en base de datos
            const { error: insertError } = await this.supabase
                .from('product_images')
                .insert({
                    product_id: productId,
                    image_url: publicUrl,
                    image_type: 'secundaria',
                    image_order: nextOrder
                });

            if (insertError) throw insertError;

            // Limpiar input
            event.target.value = '';

            // Recargar detalles del producto
            await this.loadProductDetails(productId);
            await this.loadProducts();

            this.showNotification('✅ Imagen agregada exitosamente', 'success');
        } catch (error) {
            console.error('Error subiendo imagen:', error);
            this.showNotification(`❌ Error al subir imagen: ${error.message}`, 'error');
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
            project_id: this.projectId,
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
        window.location.href = 'login.html';
    }
}

// Initialize when DOM is ready
let productsManager;
document.addEventListener('DOMContentLoaded', () => {
    productsManager = new ProductsManager();
    window.productsManager = productsManager; // Exponer globalmente para usar en onclick/onchange
});

