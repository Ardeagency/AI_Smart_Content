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
        this.activeFilter = 'todos'; // Filtro activo por categoría
        this.availableCategories = new Set(); // Categorías disponibles basadas en productos
        this.initialized = false; // Evitar múltiples inicializaciones
        // NO llamar init() automáticamente - debe ser llamado explícitamente cuando el DOM esté listo
    }

    /**
     * Helper para validar UUIDs - evita duplicación de código
     */
    isValidUUID(uuid) {
        if (!uuid || typeof uuid !== 'string') return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    // Mapeo completo de todas las categorías posibles
    getCategoryMap() {
        return {
            'todos': { label: 'Todos', icon: 'fa-th' },
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

    // Detectar categorías disponibles basándose en productos existentes
    detectAvailableCategories() {
        if (!this.products || this.products.length === 0) {
            this.availableCategories = new Set(['todos']);
            return;
        }

        // Obtener todas las categorías únicas de los productos
        const categories = new Set(['todos']); // Siempre incluir "Todos"
        
        this.products.forEach(product => {
            const tipo = product.tipo_producto || 'otro';
            if (tipo) {
                categories.add(tipo);
            }
        });

        this.availableCategories = categories;
    }

    async init() {
        // NO evitar múltiples inicializaciones - siempre recargar datos frescos
        // Resetear estado para asegurar carga limpia
        this.products = [];
        this.brandContainerId = null;
        this.initialized = false;

        await this.initSupabase();
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            console.warn('⚠️ Supabase no inicializado correctamente o usuario no autenticado');
            // Usar router si está disponible
            if (window.router) {
                window.router.navigate('/login', true);
            } else {
                window.location.href = '/login';
            }
            return;
        }

        // NO hacer disponible globalmente - cada vista crea su propia instancia (sin caché)
        // window.productsManager = this; // Comentado para evitar caché fantasma

        await this.loadBrandContainer();
        await this.loadUserData();
        this.setupEventListeners();
        
        // Esperar a que el DOM esté listo antes de cargar productos
        await this.waitForDOMReady();
        
        // Esperar específicamente a que los elementos necesarios estén disponibles
        const requiredElements = ['productsGallery', 'productsGrid', 'emptyState'];
        await this.waitForElements(requiredElements, 20); // 20 intentos = 2 segundos máximo
        
        // Verificar que los elementos estén disponibles
        const productsGallery = document.getElementById('productsGallery');
        const productsGrid = document.getElementById('productsGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (!productsGallery || !productsGrid || !emptyState) {
            console.error('❌ Elementos del DOM no disponibles después de espera - los productos pueden no renderizarse');
            // Continuar de todos modos, loadProducts() manejará el error
        }
        
        await this.loadProducts();
        
        // Marcar como inicializado
        this.initialized = true;
        // Sidebar se actualiza automáticamente por SidebarManager (persistente)
    }

    /**
     * Esperar a que los elementos del DOM estén disponibles
     * Busca primero en todo el documento, luego en app-container y productsGallery
     */
    async waitForElements(elementIds, maxAttempts = 10) {
        const elements = {};
        const attempts = {};
        
        for (const id of elementIds) {
            attempts[id] = 0;
        }

        return new Promise((resolve) => {
            const checkElements = () => {
                let allFound = true;
                
                for (const id of elementIds) {
                    if (!elements[id]) {
                        // Buscar primero en todo el documento
                        let element = document.getElementById(id);
                        
                        // Si no se encuentra, buscar en app-container
                        if (!element) {
                            const appContainer = document.getElementById('app-container');
                            if (appContainer) {
                                element = appContainer.querySelector(`#${id}`);
                            }
                        }
                        
                        // Si aún no se encuentra, buscar dentro de productsGallery
                        if (!element) {
                            const productsGallery = document.getElementById('productsGallery');
                            if (productsGallery) {
                                element = productsGallery.querySelector(`#${id}`);
                            }
                        }
                        
                        if (element) {
                            elements[id] = element;
                        } else {
                            allFound = false;
                            attempts[id]++;
                        }
                    }
                }

                if (allFound) {
                    resolve(elements);
                } else {
                    const maxAttemptsReached = elementIds.some(id => attempts[id] >= maxAttempts);
                    if (maxAttemptsReached) {
                        const missing = elementIds.filter(id => !elements[id]);
                        console.warn(`⚠️ Elementos del DOM no encontrados después de ${maxAttempts} intentos:`, missing);
                        resolve(elements);
                    } else {
                        setTimeout(checkElements, 100);
                    }
                }
            };

            // Iniciar verificación
            checkElements();
        });
    }

    /**
     * Esperar a que el DOM esté completamente listo
     */
    async waitForDOMReady() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                // Usar requestAnimationFrame para asegurar que el DOM esté renderizado
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        resolve();
                    });
                });
            } else {
                window.addEventListener('load', () => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            resolve();
                        });
                    });
                });
            }
        });
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

    /**
     * Validar que el cliente de Supabase sea válido
     */
    isValidSupabaseClient(client) {
        if (!client) return false;
        if (typeof client.from !== 'function') return false;
        if (!client.auth || typeof client.auth.getUser !== 'function') return false;
        return true;
    }

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
            else if (window.supabase && typeof window.supabase.from === 'function') {
                this.supabase = window.supabase;
            }
            // Prioridad 4: Funciones legacy
            else if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase(15000);
            } else if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
                this.supabase = window.supabaseClient;
            } else if (typeof initSupabase === 'function') {
                this.supabase = await initSupabase();
            }

            // Validar que el cliente tenga los métodos necesarios
            if (!this.supabase || typeof this.supabase.from !== 'function' || !this.supabase.auth) {
                throw new Error('Cliente de Supabase no válido');
            }

            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            
            if (userError || !user) {
                throw new Error('Usuario no autenticado');
            }

            // Validar que userId sea un UUID válido
            if (!this.isValidUUID(user.id)) {
                throw new Error('userId no válido');
            }

            this.userId = user.id;
        } catch (error) {
            console.error('Error inicializando Supabase:', error);
            throw error;
        }
    }

    async loadBrandContainer() {
        // Validar cliente y userId antes de hacer consulta
        if (!this.supabase || typeof this.supabase.from !== 'function' || !this.userId) {
            this.brandContainerId = null;
            return;
        }

        try {
            // Validar que userId sea un UUID válido
            if (!this.isValidUUID(this.userId)) {
                console.warn('⚠️ userId no es un UUID válido:', this.userId);
                this.brandContainerId = null;
                return;
            }

            // Cargar brand_container asociado al usuario (según schema.sql línea 72-89)
            const { data: brandContainer, error } = await this.supabase
                .from('brand_containers')
                .select('id')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // Si no hay registros o hay error, continuar sin brandContainerId
            if (error) {
                if (error.code === 'PGRST116') {
                    // No hay brand_container, continuar sin él (es normal si el usuario no ha creado uno)
                    this.brandContainerId = null;
                    return;
                }
                if (error.status === 400 || error.code === '400') {
                    console.warn('⚠️ Error 400 cargando brand_container:', error.message);
                }
                this.brandContainerId = null;
                return;
            }

            if (brandContainer && brandContainer.id) {
                this.brandContainerId = brandContainer.id;
            } else {
                this.brandContainerId = null;
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

        // Los tabs se renderizarán después de cargar productos
    }

    renderCategoryTabs() {
        // Buscar contenedor de tabs (ya existe en el HTML)
        let tabsContainer = document.getElementById('categoryTabs');
        if (!tabsContainer) {
            // Intentar buscar en app-container
            const appContainer = document.getElementById('app-container');
            if (appContainer) {
                tabsContainer = appContainer.querySelector('#categoryTabs');
            }
            if (!tabsContainer) {
            return;
            }
        }

        // Si no hay categorías disponibles, no mostrar tabs
        if (!this.availableCategories || this.availableCategories.size === 0) {
            tabsContainer.innerHTML = '';
            return;
        }

        const categoryMap = this.getCategoryMap();
        
        // Filtrar solo las categorías disponibles y ordenarlas
        const availableCategoriesList = Array.from(this.availableCategories)
            .map(catId => ({
                id: catId,
                ...categoryMap[catId]
            }))
            .filter(cat => cat.label) // Solo incluir si existe en el mapeo
            .sort((a, b) => {
                // "Todos" siempre primero
                if (a.id === 'todos') return -1;
                if (b.id === 'todos') return 1;
                // Resto alfabéticamente por label
                return a.label.localeCompare(b.label);
            });

        // Si solo hay "Todos" y no hay productos, no mostrar tabs
        if (availableCategoriesList.length === 1 && availableCategoriesList[0].id === 'todos' && this.products.length === 0) {
            tabsContainer.innerHTML = '';
            return;
        }

        tabsContainer.innerHTML = availableCategoriesList.map(cat => `
            <button class="category-tab ${this.activeFilter === cat.id ? 'active' : ''}" 
                    data-category="${cat.id}"
                    title="${cat.label}">
                <i class="fas ${cat.icon}"></i>
                <span>${cat.label}</span>
            </button>
        `).join('');

        // Event listeners para los tabs
        tabsContainer.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.setActiveFilter(category);
            });
        });
    }

    setActiveFilter(category) {
        // Validar que la categoría esté disponible
        if (!this.availableCategories.has(category)) {
            category = 'todos';
        }
        
        this.activeFilter = category;
        this.renderCategoryTabs(); // Re-renderizar tabs para actualizar estado activo
        this.renderProducts(); // Re-renderizar productos con el nuevo filtro
    }

    async loadProducts() {
        // ============================================
        // VALIDACIONES INICIALES
        // ============================================
        
        // Validar cliente de Supabase
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            this.products = [];
            return;
        }

        // Buscar elementos del DOM - ser más flexible con loadingState
        let loadingState = document.getElementById('loadingState');
        let emptyState = document.getElementById('emptyState');
        let productsGrid = document.getElementById('productsGrid');

        if (!loadingState || !emptyState || !productsGrid) {
            const appContainer = document.getElementById('app-container');
            if (appContainer) {
                loadingState = loadingState || appContainer.querySelector('#loadingState');
                emptyState = emptyState || appContainer.querySelector('#emptyState');
                productsGrid = productsGrid || appContainer.querySelector('#productsGrid');
            }
        }
        
        if (!loadingState || !emptyState || !productsGrid) {
            const productsGallery = document.getElementById('productsGallery');
            if (productsGallery) {
                loadingState = loadingState || productsGallery.querySelector('#loadingState');
                emptyState = emptyState || productsGallery.querySelector('#emptyState');
                productsGrid = productsGrid || productsGallery.querySelector('#productsGrid');
            }
        }
        
        // Si productsGrid y emptyState están disponibles, continuar aunque loadingState no esté
        // loadingState es opcional para mostrar/ocultar, pero no crítico
        if (!productsGrid || !emptyState) {
            console.error('❌ Elementos críticos del DOM no encontrados (productsGrid o emptyState)');
            return;
        }
        
        // Si loadingState no está, crear uno temporal o simplemente continuar
        if (!loadingState) {
            // Crear un elemento temporal para evitar errores
            loadingState = document.createElement('div');
            loadingState.id = 'loadingState';
            loadingState.style.display = 'none';
            const productsGallery = document.getElementById('productsGallery');
            if (productsGallery) {
                productsGallery.insertBefore(loadingState, productsGallery.firstChild);
            }
        }

        // Mostrar estado de carga
            loadingState.style.display = 'block';
            emptyState.style.display = 'none';
            productsGrid.style.display = 'none';

        // Validar brandContainerId
            if (!this.brandContainerId) {
                loadingState.style.display = 'none';
                emptyState.style.display = 'block';
                this.products = [];
                return;
            }

        // Validar UUID
        if (!this.isValidUUID(this.brandContainerId)) {
            emptyState.style.display = 'block';
            this.products = [];
            return;
        }

        try {
            // ============================================
            // PASO 1: OBTENER PRODUCTS según schema.sql (línea 307-328)
            // ============================================
            // products.brand_container_id -> brand_containers.id
            const { data: products, error: productsError } = await this.supabase
                .from('products')
                .select('id, brand_container_id, tipo_producto, nombre_producto, descripcion_producto, beneficio_1, beneficio_2, beneficio_3, diferenciacion, modo_uso, ingredientes, precio_producto, moneda, variantes_producto, created_at, updated_at, entity_id')
                .eq('brand_container_id', this.brandContainerId)
                .order('created_at', { ascending: false });

            if (productsError) {
                if (productsError.status === 400 || productsError.code === '400') {
                    console.error('❌ Error cargando productos:', productsError.message);
                }
                throw productsError;
            }

            if (!products || products.length === 0) {
                emptyState.style.display = 'block';
                this.products = [];
                return;
            }

            // ============================================
            // PASO 2: OBTENER PRODUCT_IMAGES según schema.sql (línea 297-306)
            // ============================================
            // product_images.product_id -> products.id
            const productIds = products
                .map(p => p.id)
                .filter(id => id && this.isValidUUID(id));

            if (productIds.length > 0) {
                const { data: allImages, error: imagesError } = await this.supabase
                        .from('product_images')
                    .select('id, product_id, image_url, image_type, image_order, created_at')
                    .in('product_id', productIds)
                    .order('product_id, image_order', { ascending: true });

                if (!imagesError && allImages) {
                    // Agrupar imágenes por product_id
                    const imagesByProduct = {};
                    allImages.forEach(image => {
                        if (!imagesByProduct[image.product_id]) {
                            imagesByProduct[image.product_id] = [];
                        }
                        imagesByProduct[image.product_id].push(image);
                    });

                    // Asignar imágenes a cada producto
                    products.forEach(product => {
                        product.images = imagesByProduct[product.id] || [];
                    });
                    } else {
                    // Si hay error, asignar array vacío
                    products.forEach(product => {
                        product.images = [];
                    });
                }
            } else {
                // Si no hay productIds válidos, asignar array vacío
                products.forEach(product => {
                    product.images = [];
                });
            }

            // ============================================
            // ASIGNAR PRODUCTOS Y RENDERIZAR
            // ============================================
            this.products = products;
            
            // Detectar categorías disponibles
            this.detectAvailableCategories();
            
            // Validar y ajustar filtro activo
            if (!this.availableCategories.has(this.activeFilter)) {
                this.activeFilter = 'todos';
            }
            
            // Renderizar
            this.renderCategoryTabs();
            await this.renderProducts();

        } catch (error) {
            console.error('❌ Error completo cargando productos:', error);
            if (emptyState) emptyState.style.display = 'block';
            if (productsGrid) productsGrid.style.display = 'none';
        }
    }

    async renderProducts() {
        // Buscar elementos directamente sin espera (ya deberían estar disponibles)
        let emptyState = document.getElementById('emptyState');
        let productsGrid = document.getElementById('productsGrid');

        if (!emptyState || !productsGrid) {
            // Intentar buscar en el container de la vista si existe
            const viewContainer = document.getElementById('app-container');
            if (viewContainer) {
                emptyState = emptyState || viewContainer.querySelector('#emptyState');
                productsGrid = productsGrid || viewContainer.querySelector('#productsGrid');
            }
        }

        if (!emptyState || !productsGrid) {
            // Intentar buscar en productsGallery
            const productsGallery = document.getElementById('productsGallery');
            if (productsGallery) {
                emptyState = emptyState || productsGallery.querySelector('#emptyState');
                productsGrid = productsGrid || productsGallery.querySelector('#productsGrid');
            }
        }

        if (!productsGrid || !emptyState) {
            console.error('❌ Elementos críticos del DOM no encontrados para renderizar productos');
            
            // Intentar una última vez después de un breve delay
            await new Promise(resolve => setTimeout(resolve, 500));
            productsGrid = document.getElementById('productsGrid');
            emptyState = document.getElementById('emptyState');
            
            if (!productsGrid || !emptyState) {
                console.error('❌ Elementos aún no disponibles después de espera adicional');
            return;
        }
        }

        this.renderProductsWithElements(emptyState, productsGrid);
    }

    renderProductsWithElements(emptyState, productsGrid) {
        if (!this.products || this.products.length === 0) {
            emptyState.style.display = 'block';
            productsGrid.style.display = 'none';
            return;
        }

        // Filtrar productos por categoría activa
        const filteredProducts = this.activeFilter === 'todos' 
            ? this.products 
            : this.products.filter(p => (p.tipo_producto || 'otro') === this.activeFilter);

        if (filteredProducts.length === 0) {
            emptyState.style.display = 'block';
            productsGrid.style.display = 'none';
            
            // Actualizar mensaje del estado vacío según la categoría
            const emptyStateTitle = emptyState.querySelector('h3');
            const emptyStateText = emptyState.querySelector('p');
            if (emptyStateTitle && emptyStateText) {
                const categoryMap = this.getCategoryMap();
                const categoryInfo = categoryMap[this.activeFilter];
                
                if (this.activeFilter === 'todos') {
                    emptyStateTitle.textContent = 'No hay productos';
                    emptyStateText.textContent = 'Aún no has creado ningún producto';
                } else if (categoryInfo) {
                    emptyStateTitle.textContent = `No hay productos en ${categoryInfo.label}`;
                    emptyStateText.textContent = 'Intenta seleccionar otra categoría o crea un nuevo producto';
                } else {
                    emptyStateTitle.textContent = 'No hay productos en esta categoría';
                    emptyStateText.textContent = 'Intenta seleccionar otra categoría o crea un nuevo producto';
                }
            }
            return;
        }

        emptyState.style.display = 'none';
        productsGrid.style.display = 'block';
        productsGrid.innerHTML = '';

        // Renderizar productos con animación escalonada
        filteredProducts.forEach((product, index) => {
            try {
                const card = this.createProductCard(product);
                if (!card) {
                    console.error(`❌ Error: createProductCard retornó null para producto ${product.id}`);
                    return;
                }
                
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                productsGrid.appendChild(card);
                
                // Animación escalonada
                setTimeout(() => {
                    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 50);
            } catch (error) {
                console.error(`❌ Error renderizando producto ${product.id}:`, error);
            }
        });

        // Remover clase de renderizado después de un momento
        setTimeout(() => {
            productsGrid.classList.remove('rendering');
        }, filteredProducts.length * 50 + 100);
    }

    createProductCard(product) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = product.id;
        card.dataset.tipoProducto = product.tipo_producto || 'otro';

        const mainImage = product.images && product.images.length > 0 
            ? product.images[0].image_url 
            : null;

        card.innerHTML = `
            <div class="product-card-image">
                ${mainImage 
                    ? `<img src="${mainImage}" alt="${product.nombre_producto}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'no-image\\'><i class=\\'fas fa-image\\'></i><span>Sin imagen</span></div>'">` 
                    : `<div class="no-image"><i class="fas fa-image"></i><span>Sin imagen</span></div>`
                }
            </div>
        `;

        // Event listener para click en la card - navegar al detalle
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.router) {
                window.router.navigate(`/products/${product.id}`);
            } else {
                window.location.href = `/products/${product.id}`;
            }
        });

        return card;
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
            // Validar brandContainerId antes de insertar
            if (!this.isValidUUID(this.brandContainerId)) {
                throw new Error('brand_container_id no válido');
            }

            // Validar campos requeridos según schema.sql (línea 307-328)
            if (!formData.tipo_producto || !formData.nombre_producto || !formData.descripcion_producto) {
                throw new Error('Los campos tipo_producto, nombre_producto y descripcion_producto son requeridos');
            }

            const { error } = await this.supabase
                .from('products')
                .insert(formData);

            if (error) {
                if (error.status === 400 || error.code === '400') {
                    console.error('❌ Error creando producto:', error.message);
                    throw new Error(`Error al crear producto: ${error.message}`);
                }
                throw error;
            }

            this.closeNewProductModal();
            await this.loadProducts();
            
            // Mostrar notificación en lugar de alert
            this.showNotification('✅ Producto creado exitosamente', 'success');

        } catch (error) {
            console.error('Error creando producto:', error);
            this.showNotification(`❌ Error al crear el producto: ${error.message}`, 'error');
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
                    // Continuar aunque falle el storage (no crítico)
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
            // Validar brandContainerId antes de operar
            if (!this.isValidUUID(this.brandContainerId)) {
                throw new Error('brand_container_id no válido');
            }

            // Validar campos requeridos según schema.sql (línea 307-328)
            if (!formData.tipo_producto || !formData.nombre_producto || !formData.descripcion_producto) {
                throw new Error('Los campos tipo_producto, nombre_producto y descripcion_producto son requeridos');
            }

            if (this.currentProduct) {
                // Actualizar producto existente según schema.sql (línea 307-328)
                const { error } = await this.supabase
                    .from('products')
                    .update({
                        ...formData,
                        updated_at: new Date().toISOString() // Actualizar timestamp según schema (línea 323)
                    })
                    .eq('id', this.currentProduct.id);

                if (error) {
                    if (error.status === 400 || error.code === '400') {
                    console.error('❌ Error actualizando producto:', error.message);
                        throw new Error(`Error al actualizar producto: ${error.message}`);
                    }
                    throw error;
                }
            } else {
                // Crear nuevo producto según schema.sql (línea 307-328)
                const { error } = await this.supabase
                    .from('products')
                    .insert(formData);

                if (error) {
                    if (error.status === 400 || error.code === '400') {
                    console.error('❌ Error creando producto:', error.message);
                        throw new Error(`Error al crear producto: ${error.message}`);
                    }
                    throw error;
                }
            }

            await this.loadProducts();
            this.showNotification(
                this.currentProduct ? '✅ Producto actualizado exitosamente' : '✅ Producto creado exitosamente',
                'success'
            );

        } catch (error) {
            console.error('Error guardando producto:', error);
            this.showNotification(`❌ Error al guardar el producto: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this.currentProduct ? 'Guardar Cambios' : 'Crear Producto';
        }
    }

    async deleteProduct(productId) {
        // Validar que productId sea un UUID válido
        if (!this.isValidUUID(productId)) {
            console.error('❌ Error: productId no es un UUID válido');
            return;
        }

        try {
            // Eliminar imágenes primero según schema.sql (línea 297-306)
            const { error: imagesError } = await this.supabase
                .from('product_images')
                .delete()
                .eq('product_id', productId);

            if (imagesError) {
                if (imagesError.status === 400 || imagesError.code === '400') {
                    console.error('❌ Error eliminando imágenes del producto:', imagesError.message);
                }
            }

            // Eliminar producto según schema.sql (línea 307-328)
            const { error } = await this.supabase
                .from('products')
                .delete()
                .eq('id', productId);

            if (error) {
                if (error.status === 400 || error.code === '400') {
                    console.error('❌ Error eliminando producto:', error.message);
                    throw new Error(`Error al eliminar producto: ${error.message}`);
                }
                throw error;
            }

            await this.loadProducts();
            this.showNotification('✅ Producto eliminado exitosamente', 'success');

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

