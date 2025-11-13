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
        this.setupEventListeners();
        await this.loadProducts();
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
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Add product button
        document.getElementById('addProductBtn').addEventListener('click', () => {
            this.openSidebar(null);
        });

        // Sidebar close
        document.getElementById('sidebarClose').addEventListener('click', () => {
            this.closeSidebar();
        });

        // Sidebar overlay
        document.getElementById('sidebarOverlay').addEventListener('click', () => {
            this.closeSidebar();
        });

        // ESC key to close sidebar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSidebar();
            }
        });
    }

    async loadProducts() {
        if (!this.projectId) return;

        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');
        const productsGrid = document.getElementById('productsGrid');

        try {
            loadingState.style.display = 'block';
            emptyState.style.display = 'none';
            productsGrid.style.display = 'none';

            const { data: products, error } = await this.supabase
                .from('products')
                .select('*')
                .eq('project_id', this.projectId)
                .order('created_at', { ascending: false });

            if (error) throw error;

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
                    }
                }
            }

            this.products = products || [];
            this.renderProducts();

        } catch (error) {
            console.error('Error cargando productos:', error);
            loadingState.style.display = 'none';
            emptyState.style.display = 'block';
        }
    }

    renderProducts() {
        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');
        const productsGrid = document.getElementById('productsGrid');
        const grid = productsGrid;

        loadingState.style.display = 'none';

        if (this.products.length === 0) {
            emptyState.style.display = 'block';
            productsGrid.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        productsGrid.style.display = 'grid';
        grid.innerHTML = '';

        this.products.forEach(product => {
            const card = this.createProductCard(product);
            grid.appendChild(card);
        });
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

    openSidebar(productId = null) {
        const sidebar = document.getElementById('productsSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const main = document.querySelector('.products-main');

        sidebar.classList.add('open');
        overlay.classList.add('active');
        main.classList.add('sidebar-open');

        if (productId) {
            this.loadProductDetails(productId);
        } else {
            this.showNewProductForm();
        }
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

    showNewProductForm() {
        const sidebarTitle = document.getElementById('sidebarTitle');
        const sidebarContent = document.getElementById('sidebarContent');

        sidebarTitle.textContent = 'Nuevo Producto';
        this.currentProduct = null;
        this.showProductForm(null);
    }

    showProductForm(product = null) {
        const sidebarContent = document.getElementById('sidebarContent');

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

        sidebarContent.innerHTML = `
            <form class="sidebar-form" id="productForm">
                <div class="form-group">
                    <label>Tipo de producto <span class="required">*</span></label>
                    <select class="form-select" id="tipo_producto" name="tipo_producto" required>
                        ${tipoProductoOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label>Nombre del producto <span class="required">*</span></label>
                    <input type="text" class="form-input" id="nombre_producto" name="nombre_producto" 
                           value="${product?.nombre_producto || ''}" required>
                </div>

                <div class="form-group">
                    <label>Descripción <span class="required">*</span></label>
                    <textarea class="form-textarea" id="descripcion_producto" name="descripcion_producto" 
                              required>${product?.descripcion_producto || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Beneficio 1</label>
                    <input type="text" class="form-input" id="beneficio_1" name="beneficio_1" 
                           value="${product?.beneficio_1 || ''}">
                </div>

                <div class="form-group">
                    <label>Beneficio 2</label>
                    <input type="text" class="form-input" id="beneficio_2" name="beneficio_2" 
                           value="${product?.beneficio_2 || ''}">
                </div>

                <div class="form-group">
                    <label>Beneficio 3</label>
                    <input type="text" class="form-input" id="beneficio_3" name="beneficio_3" 
                           value="${product?.beneficio_3 || ''}">
                </div>

                <div class="form-group">
                    <label>Diferenciación</label>
                    <textarea class="form-textarea" id="diferenciacion" name="diferenciacion">${product?.diferenciacion || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Modo de uso</label>
                    <textarea class="form-textarea" id="modo_uso" name="modo_uso">${product?.modo_uso || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Ingredientes</label>
                    <textarea class="form-textarea" id="ingredientes" name="ingredientes">${product?.ingredientes || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Precio</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <select class="form-select" id="moneda" name="moneda" style="width: 100px;">
                            <option value="USD" ${product?.moneda === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="MXN" ${product?.moneda === 'MXN' ? 'selected' : ''}>MXN</option>
                            <option value="COP" ${product?.moneda === 'COP' ? 'selected' : ''}>COP</option>
                            <option value="ARS" ${product?.moneda === 'ARS' ? 'selected' : ''}>ARS</option>
                            <option value="EUR" ${product?.moneda === 'EUR' ? 'selected' : ''}>EUR</option>
                        </select>
                        <input type="number" class="form-input" id="precio_producto" name="precio_producto" 
                               value="${product?.precio_producto || ''}" step="0.01" min="0" style="flex: 1;">
                    </div>
                </div>

                <div class="form-group">
                    <label>Variantes</label>
                    <textarea class="form-textarea" id="variantes_producto" name="variantes_producto">${product?.variantes_producto || ''}</textarea>
                </div>

                ${product ? this.renderProductImages(product.images || []) : ''}

                <div class="form-actions">
                    <button type="button" class="btn-secondary" id="cancelBtn">Cancelar</button>
                    <button type="submit" class="btn-primary" id="saveBtn">
                        ${product ? 'Guardar Cambios' : 'Crear Producto'}
                    </button>
                </div>
            </form>
        `;

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
        if (!images || images.length === 0) {
            return `
                <div class="product-images-section">
                    <label>Imágenes del producto</label>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                        Las imágenes se pueden agregar desde el formulario de registro inicial.
                    </p>
                </div>
            `;
        }

        let html = `
            <div class="product-images-section">
                <label>Imágenes del producto</label>
                <div class="images-grid">
        `;

        images.forEach(image => {
            html += `
                <div class="image-item">
                    <img src="${image.image_url}" alt="Imagen del producto" loading="lazy">
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        return html;
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
document.addEventListener('DOMContentLoaded', () => {
    new ProductsManager();
});

