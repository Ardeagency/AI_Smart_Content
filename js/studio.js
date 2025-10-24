class StudioManager {
    constructor() {
        // Configuración básica
        this.userId = null;
        this.currentProjectId = null;
        this.supabase = null;
        
        // Datos del usuario
        this.brands = [];
        this.products = [];
        this.productImages = [];
        this.selectedProductImages = [];
        this.offers = [];
        this.audience = [];
        this.ugc = [];
        this.aesthetics = [];
        this.scenarios = [];
        this.brandGuidelines = [];
        this.compliance = [];
        this.distribution = [];
        
        // Configuración de cards flotantes
        this.activeCard = null;
        
        this.init();
    }

    async init() {
        try {
            await this.waitForSupabase();
            this.setupSupabase();
            await this.checkAuthentication();
            await this.loadUserData();
            this.setupEventListeners();
            // Lucide removido - ya no es necesario
        } catch (error) {
            console.error('Error initializing Studio:', error);
            this.showNotification('Error inicializando Studio', 'error');
        }
    }

    /* =======================================
       Inicialización
       ======================================= */

    async waitForSupabase() {
        let attempts = 0;
        const maxAttempts = 50;
        
        while (attempts < maxAttempts) {
            if (window.supabaseClient && window.supabaseClient.supabase) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        throw new Error('Supabase no está disponible después de esperar');
    }

    async checkAuthentication() {
        try {
            if (!this.supabase) {
                console.log('Supabase no está disponible, continuando en modo demo');
                return;
            }

            const { data: { session } } = await this.supabase.auth.getSession();
            if (session && session.user) {
                this.userId = session.user.id;
                console.log('Usuario autenticado:', this.userId);
            } else {
                console.log('No hay sesión activa, continuando en modo demo');
            }
        } catch (error) {
            console.log('Error verificando autenticación:', error);
            console.log('Continuando en modo demo');
        }
    }

    setupSupabase() {
        if (window.supabaseClient && window.supabaseClient.supabase) {
            this.supabase = window.supabaseClient.supabase;
            console.log('Supabase configurado correctamente');
        } else {
            console.log('Supabase no está disponible en window.supabaseClient');
        }
    }

    async loadUserData() {
        if (!this.supabase || !this.userId) {
            console.log('Modo demo: sin datos');
            this.loadDemoData();
            // También cargar imágenes de producto en modo demo
            await this.loadProductImages();
            return;
        }

        try {
            // Inicializar campos del sidebar primero
            this.initializeSidebarFields();
            
            // Cargar datos del usuario
            const loadPromises = [
                this.loadBrands(),
                this.loadProducts(),
                this.loadProductImages(),
                // this.loadOffers(),
                // this.loadAvatars(),
                // this.loadStyleCatalog(),
                // this.loadAudience(),
                // this.loadUGC(),
                // this.loadAesthetics(),
                // this.loadScenarios(),
                // this.loadBrandGuidelines(),
                // this.loadCompliance(),
                // this.loadDistribution()
            ];

            // Ejecutar todas las cargas, pero no fallar si alguna falla
            await Promise.allSettled(loadPromises);

            // Pre-poblar configuraciones con datos del usuario
            this.prePopulateConfigurations();

        } catch (error) {
            console.error('Error loading user data:', error);
            this.loadDemoData();
        }
    }

    // Función de Lucide removida - ya no es necesaria

    // =======================================
    // Funciones de carga de datos (mantener las existentes)
    // =======================================

    async loadBrands() {
        try {
            console.log('=== CARGANDO MARCAS ===');
            if (!this.supabase || !this.userId) {
                console.log('Modo demo: cargando marcas de ejemplo');
                this.loadDemoBrands();
                return;
            }

            const { data: brands, error } = await this.supabase
                .from('brand_guidelines')
                .select(`
                    id,
                    project_id,
                    tone_of_voice,
                    keywords_yes,
                    keywords_no,
                    dos_donts,
                    reference_links,
                    projects!inner(
                        id,
                        name,
                        website,
                        country,
                        languages
                    )
                `)
                .eq('projects.user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading brands:', error);
                console.log('Fallback a modo demo debido a error de Supabase');
                this.loadDemoBrands();
                return;
            }

            this.brands = brands || [];
            console.log('Marcas cargadas desde Supabase:', this.brands);
            
            // Actualizar el dropdown de marcas
            this.updateBrandSelector();

        } catch (error) {
            console.error('Error in loadBrands:', error);
            this.showNotification('Error cargando marcas', 'error');
        }
    }

    async loadProducts() {
        try {
            console.log('=== CARGANDO PRODUCTOS ===');
            if (!this.supabase || !this.userId) {
                console.log('Modo demo: cargando productos de ejemplo');
                this.loadDemoProducts();
                return;
            }

            const { data: products, error } = await this.supabase
                .from('products')
                .select(`
                    id,
                    project_id,
                    name,
                    product_type,
                    short_desc,
                    benefits,
                    differentiators,
                    usage_steps,
                    ingredients,
                    price,
                    variants,
                    projects!inner(
                        id,
                        name,
                        website,
                        country,
                        languages
                    )
                `)
                .eq('projects.user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading products:', error);
                console.log('Fallback a modo demo debido a error de Supabase');
                this.loadDemoProducts();
                return;
            }

            this.products = products || [];
            console.log('Productos cargados desde Supabase:', this.products);
            
            // Actualizar el dropdown de productos
            this.updateProductSelector();

        } catch (error) {
            console.error('Error in loadProducts:', error);
            this.showNotification('Error cargando productos', 'error');
        }
    }

    // ... (mantener todas las otras funciones de carga de datos existentes)
    // Por simplicidad, no las incluyo todas aquí, pero se mantendrían igual


    // =======================================
    // Funciones de UI (mantener las existentes)
    // =======================================

    showLoading(message) {
        const canvasArea = document.querySelector('.canvas-area');
        if (!canvasArea) return;

        canvasArea.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    showNotification(message, type = 'info') {
        // Implementar notificaciones
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    // =======================================
    // Funciones de demo (mantener las existentes)
    // =======================================

    loadDemoData() {
        console.log('Cargando datos de demo...');
        // Cargar datos de demo
        this.loadDemoBrands();
        this.loadDemoProducts();
        
        // Inicialmente ocultar secciones de productos e imágenes
        this.hideProductSection();
        this.hideImageSection();
        
        // No cargar imágenes hasta que se seleccione un producto
        // this.loadProductImages();
    }

    // Función para cargar marcas de ejemplo en modo demo
    loadDemoBrands() {
        this.brands = [
            {
                id: 'demo-brand-1',
                project_id: 'demo-project-1',
                projects: { 
                    id: 'demo-project-1', 
                    name: 'Marca Demo 1', 
                    website: 'https://demo1.com/productos' 
                },
                tone_of_voice: 'Profesional y confiable',
                keywords_yes: ['innovación', 'calidad', 'confianza'],
                keywords_no: ['barato', 'descuento', 'oferta']
            },
            {
                id: 'demo-brand-2',
                project_id: 'demo-project-2',
                projects: { 
                    id: 'demo-project-2', 
                    name: 'Marca Demo 2', 
                    website: 'https://demo2.com/catalogo' 
                },
                tone_of_voice: 'Joven y dinámico',
                keywords_yes: ['fresco', 'moderno', 'divertido'],
                keywords_no: ['aburrido', 'tradicional', 'formal']
            }
        ];
        this.updateBrandSelector();
        console.log('Marcas de demo cargadas:', this.brands.length);
    }

    // Función para cargar productos de ejemplo en modo demo
    loadDemoProducts() {
        this.products = [
            {
                id: 'demo-product-1',
                project_id: 'demo-project-1',
                name: 'Producto Demo 1',
                product_type: 'Electrónico',
                short_desc: 'Un producto innovador para el hogar',
                benefits: ['Fácil de usar', 'Eficiente', 'Duradero'],
                price: 299.99,
                projects: {
                    id: 'demo-project-1',
                    name: 'Marca Demo 1',
                    website: 'https://demo1.com/productos'
                }
            },
            {
                id: 'demo-product-2',
                project_id: 'demo-project-1',
                name: 'Producto Demo 2',
                product_type: 'Ropa',
                short_desc: 'Ropa cómoda y elegante',
                benefits: ['Confortable', 'Estiloso', 'Versátil'],
                price: 89.99,
                projects: {
                    id: 'demo-project-1',
                    name: 'Marca Demo 1',
                    website: 'https://demo1.com/productos'
                }
            },
            {
                id: 'demo-product-3',
                project_id: 'demo-project-2',
                name: 'Producto Demo 3',
                product_type: 'Accesorio',
                short_desc: 'Accesorio moderno y funcional',
                benefits: ['Práctico', 'Elegante', 'Duradero'],
                price: 149.99,
                projects: {
                    id: 'demo-project-2',
                    name: 'Marca Demo 2',
                    website: 'https://demo2.com/catalogo'
                }
            }
        ];
        this.updateProductSelector();
        console.log('Productos de demo cargados:', this.products.length);
    }

    initializeSidebarFields() {
        // Implementar inicialización de campos del sidebar
    }

    // Función para actualizar el selector de marcas
    updateBrandSelector() {
        const brandSelector = document.getElementById('brand-selector');
        if (!brandSelector) return;

        // Limpiar opciones existentes
        brandSelector.innerHTML = '<option value="">Seleccionar marca...</option>';

        // Agregar marcas desde Supabase
        this.brands.forEach(brand => {
            const option = document.createElement('option');
            option.value = brand.id;
            option.textContent = brand.projects?.name || `Marca ${brand.id}`;
            brandSelector.appendChild(option);
        });

        console.log('Selector de marcas actualizado:', this.brands.length, 'marcas');
    }

    // Función para actualizar el selector de productos (filtrado por marca)
    updateProductSelector(selectedBrandId = null) {
        const productSelector = document.getElementById('product-selector');
        if (!productSelector) return;

        // Limpiar opciones existentes
        productSelector.innerHTML = '<option value="">Seleccionar producto...</option>';

        // Si no hay marca seleccionada, no mostrar productos
        if (!selectedBrandId) {
            console.log('No hay marca seleccionada, ocultando productos');
            this.hideProductSection();
            return;
        }

        // Filtrar productos por marca seleccionada
        const filteredProducts = this.products.filter(product => {
            // Buscar la marca asociada al producto
            const brand = this.brands.find(b => b.id === selectedBrandId);
            console.log('Filtrando productos:', {
                selectedBrandId,
                brand: brand ? { id: brand.id, project_id: brand.project_id } : null,
                product: { id: product.id, project_id: product.project_id, name: product.name }
            });
            return brand && product.project_id === brand.project_id;
        });

        // Agregar productos filtrados
        filteredProducts.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = product.name || `Producto ${product.id}`;
            productSelector.appendChild(option);
        });

        console.log('Selector de productos actualizado:', filteredProducts.length, 'productos para marca', selectedBrandId);
        
        // Mostrar sección de productos
        this.showProductSection();
    }

    // Función para manejar la selección de marca desde el dropdown
    async selectBrandFromDropdown(brandId) {
        const brandNameElement = document.getElementById('selected-brand-name');
        if (brandNameElement) {
            if (brandId) {
                const brand = this.brands.find(b => b.id === brandId);
                brandNameElement.textContent = brand ? (brand.projects?.name || 'Marca seleccionada') : 'Marca seleccionada';
            } else {
                brandNameElement.textContent = 'Selecciona una marca';
            }
        }

        console.log('Marca seleccionada:', brandId);
        
        // Actualizar productos basado en la marca seleccionada
        this.updateProductSelector(brandId);
        
        // Limpiar selección de producto e imágenes cuando cambia la marca
        this.clearProductSelection();
        this.clearSelectedImages(); // Solo limpiar selección, no ocultar sección
    }

    // Función para mostrar/ocultar sección de productos
    showProductSection() {
        const productSection = document.getElementById('product-images-section');
        if (productSection) {
            productSection.style.display = 'block';
            console.log('Sección de productos mostrada');
        }
    }

    hideProductSection() {
        const productSection = document.getElementById('product-images-section');
        if (productSection) {
            productSection.style.display = 'none';
            console.log('Sección de productos ocultada');
        }
    }

    // Función para mostrar/ocultar sección de imágenes
    showImageSection() {
        const imageSection = document.getElementById('product-images-section');
        if (imageSection) {
            imageSection.style.display = 'block';
            console.log('Sección de imágenes mostrada');
        }
    }

    hideImageSection() {
        const imageSection = document.getElementById('product-images-section');
        if (imageSection) {
            imageSection.style.display = 'none';
            console.log('Sección de imágenes ocultada');
        }
    }

    // Función para limpiar selección de producto
    clearProductSelection() {
        const productSelector = document.getElementById('product-selector');
        if (productSelector) {
            productSelector.value = '';
        }
        
        const productNameElement = document.getElementById('selected-product-name');
        if (productNameElement) {
            productNameElement.textContent = 'Selecciona un producto';
        }
    }

    // Función para limpiar selección de imágenes
    clearImageSelection() {
        this.clearSelectedImages();
        // No ocultar la sección, solo limpiar la selección
        // this.hideImageSection();
    }

    prePopulateConfigurations() {
        // Implementar pre-población de configuraciones
    }

    setupEventListeners() {
        // Implementar event listeners
    }

    // =======================================
    // Funciones de navegación (mantener las existentes)
    // =======================================

    showSidebarSection(sectionNumber) {
        // Implementar navegación del sidebar
    }

    // =======================================
    // Funciones de logout (mantener las existentes)
    // =======================================

    logout() {
        if (window.studioManager && window.studioManager.supabase) {
            window.studioManager.supabase.auth.signOut().then(() => {
                window.location.href = '/login.html';
            });
        }
    }

    /* =======================================
       FUNCIONES DE IMÁGENES DE PRODUCTO DINÁMICAS
       ======================================= */

    // Función para cargar imágenes de producto desde Supabase
    async loadProductImages(productId = null) {
        console.log('🖼️ loadProductImages llamada con productId:', productId);
        try {
            console.log('🔍 Estado de Supabase:', {
                supabase: !!this.supabase,
                userId: this.userId,
                productId: productId
            });
            
            if (!this.supabase || !this.userId) {
                console.log('Modo demo: cargando imágenes de ejemplo');
                this.loadDemoProductImages();
                return;
            }

            // Intentar consultar la tabla files para obtener imágenes de producto
            let query = this.supabase
                .from('files')
                .select('*')
                .eq('user_id', this.userId)
                .in('category', ['product_image', 'product_gallery']);

            if (productId) {
                // Buscar el producto seleccionado para obtener su project_id
                const selectedProduct = this.products.find(p => p.id === productId);
                if (selectedProduct && selectedProduct.project_id) {
                    query = query.eq('project_id', selectedProduct.project_id);
                    console.log('Filtrando imágenes por project_id:', selectedProduct.project_id);
                } else {
                    console.log('Producto no encontrado o sin project_id:', productId);
                }
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) {
                console.error('Error cargando imágenes de producto:', error);
                console.log('Fallback a modo demo debido a error de Supabase');
                this.loadDemoProductImages();
                return;
            }

            this.productImages = data || [];
            this.renderProductImages();
            this.updateSelectedImagesSummary();
            
            // Mostrar sección de imágenes si hay imágenes disponibles
            if (this.productImages.length > 0) {
                this.showImageSection();
            } else {
                this.hideImageSection();
            }

        } catch (error) {
            console.error('Error cargando imágenes de producto:', error);
            this.showNotification('Error cargando imágenes de producto', 'error');
        }
    }

    // Función para cargar imágenes de ejemplo en modo demo
    loadDemoProductImages() {
        console.log('📸 Cargando imágenes de demo...');
        this.productImages = [
            {
                id: 'demo-1',
                project_id: 'demo-project-1',
                product_id: 'demo-product-1',
                image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=300&fit=crop&crop=center',
                image_name: 'Zapatos Deportivos',
                created_at: new Date().toISOString()
            },
            {
                id: 'demo-2',
                project_id: 'demo-project-1',
                product_id: 'demo-product-1',
                image_url: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=300&h=300&fit=crop&crop=center',
                image_name: 'Auriculares Inalámbricos',
                created_at: new Date().toISOString()
            },
            {
                id: 'demo-3',
                project_id: 'demo-project-1',
                product_id: 'demo-product-2',
                image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop&crop=center',
                image_name: 'Reloj Inteligente',
                created_at: new Date().toISOString()
            },
            {
                id: 'demo-4',
                project_id: 'demo-project-2',
                product_id: 'demo-product-3',
                image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop&crop=center',
                image_name: 'Cámara Profesional',
                created_at: new Date().toISOString()
            },
            {
                id: 'demo-5',
                project_id: 'demo-project-2',
                product_id: 'demo-product-3',
                image_url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=300&h=300&fit=crop&crop=center',
                image_name: 'Gafas de Sol',
                created_at: new Date().toISOString()
            },
            {
                id: 'demo-6',
                project_id: 'demo-project-1',
                product_id: 'demo-product-1',
                image_url: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300&h=300&fit=crop&crop=center',
                image_name: 'Smartphone',
                created_at: new Date().toISOString()
            }
        ];
        this.renderProductImages();
        
        // Mostrar sección de imágenes en modo demo
        this.showImageSection();
    }

    // Función para renderizar las imágenes de producto
    renderProductImages() {
        console.log('🎨 Renderizando imágenes de producto...', this.productImages.length);
        const container = document.getElementById('dynamic-product-images');
        if (!container) {
            console.error('❌ No se encontró el contenedor dynamic-product-images');
            return;
        }

        if (this.productImages.length === 0) {
            container.innerHTML = `
                <div class="loading-placeholder">
                    <span>No hay imágenes disponibles</span>
                </div>
            `;
            return;
        }

        // Limpiar contenedor
        container.innerHTML = '';

        // Renderizar cada imagen
        this.productImages.forEach((image, index) => {
            // Manejar tanto estructura de Supabase (files) como estructura de demo
            const imageUrl = image.image_url || (image.path ? `https://ksjeikudvqseoosyhsdd.supabase.co/storage/v1/object/public/ugc/${image.path}` : '');
            const imageName = image.image_name || image.description || `Imagen ${index + 1}`;
            const imageId = image.id;
            
            // Crear elemento de imagen
            const imageOption = document.createElement('div');
            imageOption.className = 'dynamic-image-option';
            imageOption.innerHTML = `
                    <input type="checkbox" 
                           id="dynamic-product-img-${imageId}" 
                           name="product_images" 
                           value="${imageUrl}"
                           onchange="window.studioManager.toggleProductImage('${imageId}', this.checked)">
                    <label for="dynamic-product-img-${imageId}">
                    <img src="${imageUrl}" alt="${imageName}" loading="lazy" 
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JbWFnZW48L3RleHQ+Cjwvc3ZnPg=='">
                        <div class="image-overlay">
                            <div class="overlay-content">
                                ${imageName}
                            </div>
                        </div>
                    </label>
            `;
            
            container.appendChild(imageOption);
        });

        console.log(`✅ ${this.productImages.length} imágenes renderizadas correctamente`);
    }

    // Función para manejar la selección/deselección de imágenes
    toggleProductImage(imageId, isSelected) {
        const image = this.productImages.find(img => img.id === imageId);
        if (!image) return;

        if (isSelected) {
            if (!this.selectedProductImages.find(img => img.id === imageId)) {
                this.selectedProductImages.push(image);
            }
        } else {
            this.selectedProductImages = this.selectedProductImages.filter(img => img.id !== imageId);
        }

        this.updateSelectedImagesSummary();
        this.updateUGCData();
    }

    // Función para actualizar el resumen de imágenes seleccionadas
    updateSelectedImagesSummary() {
        const summaryContainer = document.getElementById('selected-images-summary');
        if (!summaryContainer) return;

        if (this.selectedProductImages.length === 0) {
            summaryContainer.innerHTML = '<span class="no-selection">Ninguna imagen seleccionada</span>';
            return;
        }

        summaryContainer.innerHTML = this.selectedProductImages.map(image => `
            <div class="selected-image-tag">
                <span>${image.image_name}</span>
                <button class="remove-btn" onclick="window.studioManager.removeSelectedImage('${image.id}')" title="Quitar imagen">×</button>
            </div>
        `).join('');
    }

    // Función para quitar una imagen seleccionada
    removeSelectedImage(imageId) {
        this.selectedProductImages = this.selectedProductImages.filter(img => img.id !== imageId);
        
        // Desmarcar el checkbox
        const checkbox = document.getElementById(`dynamic-product-img-${imageId}`);
        if (checkbox) checkbox.checked = false;
        
        this.updateSelectedImagesSummary();
        this.updateUGCData();
    }

    // Función para limpiar todas las imágenes seleccionadas
    clearSelectedImages() {
        this.selectedProductImages = [];
        
        // Desmarcar todos los checkboxes
        const checkboxes = document.querySelectorAll('input[name="product_images"]');
        checkboxes.forEach(cb => cb.checked = false);
        
        this.updateSelectedImagesSummary();
        this.updateUGCData();
        this.showNotification('Imágenes seleccionadas limpiadas', 'info');
    }

    // Función para actualizar los datos UGC con las imágenes seleccionadas
    updateUGCData() {
        // Esta función se llamará cuando se generen los datos UGC
        // para incluir las imágenes seleccionadas
    }

    // Función para refrescar las imágenes de producto
    async refreshProductImages() {
        const productSelector = document.getElementById('product-selector');
        const selectedProductId = productSelector ? productSelector.value : null;
        
        this.showNotification('Actualizando imágenes...', 'info');
        await this.loadProductImages(selectedProductId);
        this.showNotification('Imágenes actualizadas', 'success');
    }

    // Función para manejar la selección de producto desde el dropdown
    async selectProductFromDropdown(productId) {
        const productNameElement = document.getElementById('selected-product-name');
        const productUrlElement = document.getElementById('selected-product-url');
        
        if (productNameElement) {
            if (productId) {
                const product = this.products.find(p => p.id === productId);
                productNameElement.textContent = product ? product.name : 'Producto seleccionado';
                
                // Actualizar URL del producto
                if (productUrlElement && product) {
                    const productUrl = product.projects?.website || 'URL no disponible';
                    productUrlElement.textContent = productUrl;
                    productUrlElement.style.color = productUrl !== 'URL no disponible' ? '#4CAF50' : '#f44336';
                }
            } else {
                productNameElement.textContent = 'Selecciona un producto';
                if (productUrlElement) {
                    productUrlElement.textContent = 'Selecciona un producto para ver su URL';
                    productUrlElement.style.color = '#666';
                }
            }
        }

        // Si no hay producto seleccionado, ocultar imágenes
        if (!productId) {
            this.hideImageSection();
            this.clearSelectedImages();
            return;
        }

        // Cargar imágenes del producto seleccionado
        await this.loadProductImages(productId);
        
        // No limpiar selección anterior, solo cargar nuevas imágenes
        // this.clearSelectedImages(); // Comentado para mantener selección
    }

    // Función para obtener las URLs de las imágenes seleccionadas
    getSelectedProductImageUrls() {
        return this.selectedProductImages.map(image => {
            // Manejar tanto estructura de Supabase (files) como estructura de demo
            return image.image_url || (image.path ? `https://ksjeikudvqseoosyhsdd.supabase.co/storage/v1/object/public/ugc/${image.path}` : '');
        });
    }


    /* =======================================
       FUNCIONES FALTANTES DEL SIDEBAR
       ======================================= */

    // Funciones de Avatar
    selectAvatarFromDropdown(avatarId) {
        console.log('Avatar seleccionado:', avatarId);
        // Implementar lógica de selección de avatar
    }

    updateCharacterType(characterType) {
        console.log('Tipo de personaje actualizado:', characterType);
        // Implementar lógica de tipo de personaje
    }

    toggleTrait(trait, isChecked) {
        console.log(`Trait ${trait}:`, isChecked);
        // Implementar lógica de traits
    }

    toggleEnergy(energy, isChecked) {
        console.log(`Energía ${energy}:`, isChecked);
        // Implementar lógica de energía
    }

    toggleGender(gender, isChecked) {
        console.log(`Género ${gender}:`, isChecked);
        // Implementar lógica de género
    }

    toggleVoice(voice, isChecked) {
        console.log(`Voz ${voice}:`, isChecked);
        // Implementar lógica de voz
    }

    updateAvatarLanguage(language) {
        console.log('Idioma del avatar actualizado:', language);
        // Implementar lógica de idioma
    }

    toggleValue(value, isChecked) {
        console.log(`Valor ${value}:`, isChecked);
        // Implementar lógica de valores
    }

    updateAvatarAge(age) {
        console.log('Edad del avatar actualizada:', age);
        const ageDisplay = document.getElementById('age-display');
        if (ageDisplay) {
            ageDisplay.textContent = `${age} años`;
        }
    }

    updateAvatarCountry(country) {
        console.log('País del avatar actualizado:', country);
        // Implementar lógica de país
    }

    toggleAccent(accent, isChecked) {
        console.log(`Acento ${accent}:`, isChecked);
        // Implementar lógica de acento
    }

    handleAvatarImageUpload(files) {
        console.log('Imágenes de avatar subidas:', files);
        // Implementar lógica de subida de imágenes
    }

    handleAvatarVideoUpload(files) {
        console.log('Video de avatar subido:', files);
        // Implementar lógica de subida de video
    }

    createNewAvatar() {
        console.log('Creando nuevo avatar...');
        // Implementar lógica de creación de avatar
    }

    // Funciones de Estilo
    selectStyleFromDropdown(styleId) {
        console.log('Estilo seleccionado:', styleId);
        // Implementar lógica de selección de estilo
    }

    removeStyle() {
        console.log('Removiendo estilo...');
        // Implementar lógica de remoción de estilo
    }

    // Funciones de Estética
    selectAestheticFromDropdown(aestheticId) {
        console.log('Estética seleccionada:', aestheticId);
        // Implementar lógica de selección de estética
    }

    toggleMood(mood, isChecked) {
        console.log(`Ánimo ${mood}:`, isChecked);
        // Implementar lógica de ánimo
    }

    togglePalette(palette, isChecked) {
        console.log(`Paleta ${palette}:`, isChecked);
        // Implementar lógica de paleta
    }

    toggleLighting(lighting, isChecked) {
        console.log(`Iluminación ${lighting}:`, isChecked);
        // Implementar lógica de iluminación
    }

    toggleCamera(camera, isChecked) {
        console.log(`Cámara ${camera}:`, isChecked);
        // Implementar lógica de cámara
    }

    togglePace(pace, isChecked) {
        console.log(`Paso ${pace}:`, isChecked);
        // Implementar lógica de paso
    }

    createNewAesthetic() {
        console.log('Creando nueva estética...');
        // Implementar lógica de creación de estética
    }

    removeAesthetic() {
        console.log('Removiendo estética...');
        // Implementar lógica de remoción de estética
    }

    toggleFreeMode(mode) {
        console.log(`Modo libre ${mode}:`, true);
        // Implementar lógica de modo libre
    }

    // Funciones de Plataforma
    togglePlatform(platform, isChecked) {
        console.log(`Plataforma ${platform}:`, isChecked);
        // Implementar lógica de plataforma
    }

    toggleFormat(format, isChecked) {
        console.log(`Formato ${format}:`, isChecked);
        // Implementar lógica de formato
    }

    // Funciones de Escenario
    selectScenarioFromDropdown(scenarioId) {
        console.log('Escenario seleccionado:', scenarioId);
        // Implementar lógica de selección de escenario
    }

    toggleLocation(location, isChecked) {
        console.log(`Ubicación ${location}:`, isChecked);
        // Implementar lógica de ubicación
    }

    toggleAmbience(ambience, isChecked) {
        console.log(`Ambiente ${ambience}:`, isChecked);
        // Implementar lógica de ambiente
    }

    toggleHygiene(hygiene, isChecked) {
        console.log(`Higiene ${hygiene}:`, isChecked);
        // Implementar lógica de higiene
    }

    toggleBackdrop(backdrop, isChecked) {
        console.log(`Fondo ${backdrop}:`, isChecked);
        // Implementar lógica de fondo
    }

    createNewScenario() {
        console.log('Creando nuevo escenario...');
        // Implementar lógica de creación de escenario
    }

    // Funciones de IA
    updateCreativity(creativity) {
        console.log('Creatividad actualizada:', creativity);
        const creativityDisplay = document.getElementById('creativity-display');
        if (creativityDisplay) {
            creativityDisplay.textContent = creativity;
        }
    }

    // Funciones de Navegación del Sidebar
    showSidebarSection(sectionNumber) {
        console.log(`Mostrando sección ${sectionNumber} del sidebar`);
        
        // Ocultar todas las secciones
        const sections = document.querySelectorAll('.studio-sidebar');
        sections.forEach(section => {
            section.style.display = 'none';
        });
        
        // Mostrar la sección seleccionada
        const targetSection = document.getElementById(`sidebar-section-${sectionNumber}`);
        if (targetSection) {
            targetSection.style.display = 'block';
            console.log(`✅ Sección ${sectionNumber} mostrada`);
        } else {
            console.error(`❌ Sección ${sectionNumber} no encontrada`);
        }
    }

    // Funciones de Generación
    generateScripts() {
        console.log('Generando guiones...');
        // Implementar lógica de generación de guiones
    }

    testGenerateScenes() {
        console.log('Probando generación de escenas...');
        // Implementar lógica de prueba de escenas
    }

    testGenerateFinalUGC() {
        console.log('Probando generación final de UGC...');
        // Implementar lógica de prueba de UGC final
    }

}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.studioManager = new StudioManager();
});

// Función global para logout
function logout() {
    if (window.studioManager && window.studioManager.supabase) {
        window.studioManager.supabase.auth.signOut().then(() => {
            window.location.href = '/login.html';
        });
    }
}

// Función global para navegación de sidebar (fallback)
function showSidebarSection(sectionNumber) {
    if (window.studioManager && window.studioManager.showSidebarSection) {
        window.studioManager.showSidebarSection(sectionNumber);
    }
}


// Funciones globales para manejo de imágenes de producto
function refreshProductImages() {
    if (window.studioManager && window.studioManager.refreshProductImages) {
        window.studioManager.refreshProductImages();
    }
}

function clearSelectedImages() {
    if (window.studioManager && window.studioManager.clearSelectedImages) {
        window.studioManager.clearSelectedImages();
    }
}
