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
                console.log('Supabase no está disponible');
                return;
            }

            const { data: { session } } = await this.supabase.auth.getSession();
            if (session && session.user) {
                this.userId = session.user.id;
                console.log('Usuario autenticado:', this.userId);
            } else {
                console.log('No hay sesión activa');
            }
        } catch (error) {
            console.log('Error verificando autenticación:', error);
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
            console.log('Sin autenticación: no se pueden cargar datos');
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
                this.loadOffers(),
                this.loadAudiences()
            ];

            // Ejecutar todas las cargas
            await Promise.allSettled(loadPromises);

            // Pre-poblar configuraciones con datos del usuario
            this.prePopulateConfigurations();

        } catch (error) {
            console.error('Error loading user data:', error);
            this.showNotification('Error cargando datos del usuario', 'error');
        }
    }

    // =======================================
    // Funciones de carga de datos
    // =======================================

    async loadBrands() {
        try {
            console.log('=== CARGANDO MARCAS ===');
            if (!this.supabase || !this.userId) {
                console.log('Sin autenticación: no se pueden cargar marcas');
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
                this.showNotification('Error cargando marcas', 'error');
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
                console.log('Sin autenticación: no se pueden cargar productos');
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
                this.showNotification('Error cargando productos', 'error');
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

    async loadOffers() {
        try {
            console.log('=== CARGANDO OFERTAS ===');
            if (!this.supabase || !this.userId) {
                console.log('Sin autenticación: no se pueden cargar ofertas');
                return;
            }

            const { data: offers, error } = await this.supabase
                .from('offers')
                .select(`
                    *,
                    projects!inner(
                        id,
                        name,
                        user_id
                    )
                `)
                .eq('projects.user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading offers:', error);
                this.showNotification('Error cargando ofertas', 'error');
                return;
            }

            this.offers = offers || [];
            console.log('Ofertas cargadas desde Supabase:', this.offers);
            
            // Actualizar el dropdown de ofertas
            this.updateOfferSelector();

        } catch (error) {
            console.error('Error in loadOffers:', error);
            this.showNotification('Error cargando ofertas', 'error');
        }
    }

    async loadAudiences() {
        try {
            console.log('=== CARGANDO AUDIENCIAS ===');
            if (!this.supabase || !this.userId) {
                console.log('Sin autenticación: no se pueden cargar audiencias');
                return;
            }

            const { data: audiences, error } = await this.supabase
                .from('audiences')
                .select(`
                    *,
                    projects!inner(
                        id,
                        name,
                        user_id
                    )
                `)
                .eq('projects.user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading audiences:', error);
                this.showNotification('Error cargando audiencias', 'error');
                return;
            }

            this.audience = audiences || [];
            console.log('Audiencias cargadas desde Supabase:', this.audience);
            
            // Actualizar el dropdown de audiencias
            this.updateAudienceSelector();

        } catch (error) {
            console.error('Error in loadAudiences:', error);
            this.showNotification('Error cargando audiencias', 'error');
        }
    }


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




    initializeSidebarFields() {
        console.log('=== INICIALIZANDO CAMPOS DEL SIDEBAR ===');
        
        // Inicializar información de marca
        const brandInfoContainer = document.getElementById('brand-info');
        if (brandInfoContainer) {
            brandInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">Selecciona una marca</span>
                </div>
            `;
        }
        
        // Inicializar información de producto
        const productInfoContainer = document.getElementById('product-info');
        if (productInfoContainer) {
            productInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">Selecciona un producto</span>
                </div>
            `;
        }
        
        // Inicializar información de oferta
        this.clearOfferInfo();
        
        // Inicializar información de audiencia
        this.clearAudienceInfo();
        
        console.log('Campos del sidebar inicializados correctamente');
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

        // Si no hay marca seleccionada, limpiar productos pero mantener el selector visible
        if (!selectedBrandId) {
            console.log('No hay marca seleccionada, limpiando productos');
            this.hideImageGallery();
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
    }

    // Función para actualizar el selector de ofertas
    updateOfferSelector() {
        const offerSelector = document.getElementById('offer-selector');
        if (!offerSelector) return;

        // Limpiar opciones existentes
        offerSelector.innerHTML = '<option value="">Seleccionar oferta...</option>';

        // Agregar ofertas disponibles
        this.offers.forEach(offer => {
            const option = document.createElement('option');
            option.value = offer.id;
            option.textContent = offer.name || `Oferta ${offer.id}`;
            offerSelector.appendChild(option);
        });

        console.log('Selector de ofertas actualizado:', this.offers.length, 'ofertas');
    }

    // Función para actualizar el selector de audiencias
    updateAudienceSelector() {
        const audienceSelector = document.getElementById('audience-selector');
        if (!audienceSelector) return;

        // Limpiar opciones existentes
        audienceSelector.innerHTML = '<option value="">Seleccionar audiencia...</option>';

        // Agregar audiencias disponibles
        this.audience.forEach(audience => {
            const option = document.createElement('option');
            option.value = audience.id;
            option.textContent = audience.name || `Audiencia ${audience.id}`;
            audienceSelector.appendChild(option);
        });

        console.log('Selector de audiencias actualizado:', this.audience.length, 'audiencias');
    }

    // Función para manejar la selección de marca desde el dropdown
    async selectBrandFromDropdown(brandId) {
        console.log('Marca seleccionada:', brandId);
        
        // Actualizar productos basado en la marca seleccionada
        this.updateProductSelector(brandId);
        
        // Limpiar selección de producto cuando cambia la marca
        this.clearProductSelection();
        
        // Si hay marca seleccionada, cargar y mostrar su información
        if (brandId) {
            const brand = this.brands.find(b => b.id === brandId);
            if (brand) {
                this.updateBrandInfo(brand);
            }
        }
    }


    // Función para mostrar/ocultar galería de imágenes
    showImageGallery() {
        const imageGallery = document.getElementById('product-image-gallery');
        if (imageGallery) {
            imageGallery.style.display = 'block';
            console.log('Galería de imágenes mostrada');
        }
    }

    hideImageGallery() {
        const imageGallery = document.getElementById('product-image-gallery');
        if (imageGallery) {
            imageGallery.style.display = 'none';
            console.log('Galería de imágenes ocultada');
        }
    }

    // Función para limpiar selección de producto
    clearProductSelection() {
        const productSelector = document.getElementById('product-selector');
        if (productSelector) {
            productSelector.value = '';
        }
        
        // Limpiar información del producto en el acordeón
        const productInfoContainer = document.getElementById('product-info');
        if (productInfoContainer) {
            productInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">Selecciona un producto</span>
                </div>
            `;
        }
        
        // Ocultar galería de imágenes
        this.hideImageGallery();
    }

    // Función para actualizar la información de marca en el acordeón
    updateBrandInfo(brandData) {
        console.log('Actualizando información de marca:', brandData);
        
        const brandInfoContainer = document.getElementById('brand-info');
        if (!brandInfoContainer) {
            console.error('No se encontró el contenedor brand-info');
            return;
        }
        
        // Actualizar el contenido del contenedor
        brandInfoContainer.innerHTML = `
            <div class="info-item">
                <span class="info-label">Nombre:</span>
                <span class="info-value">${brandData.projects?.name || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Tono de Voz:</span>
                <span class="info-value">${brandData.tone_of_voice || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Keywords Positivos:</span>
                <span class="info-value">${brandData.keywords_yes ? brandData.keywords_yes.join(', ') : 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Keywords Negativos:</span>
                <span class="info-value">${brandData.keywords_no ? brandData.keywords_no.join(', ') : 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Do's y Don'ts:</span>
                <span class="info-value">${brandData.dos_donts || 'No disponible'}</span>
            </div>
        `;
        
        console.log('Información de marca actualizada correctamente');
    }

    // Función para actualizar la información de producto en el acordeón
    updateProductInfo(productData) {
        console.log('Actualizando información de producto:', productData);
        
        const productInfoContainer = document.getElementById('product-info');
        if (!productInfoContainer) {
            console.error('No se encontró el contenedor product-info');
            return;
        }
        
        // Formatear precio
        const priceDisplay = productData.price && productData.price > 0 ? 
            `$${parseFloat(productData.price).toFixed(2)}` : 
            'No disponible';
        
        // Formatear beneficios
        const benefitsDisplay = productData.benefits && productData.benefits.length > 0 ? 
            productData.benefits.join(', ') : 
            'No disponible';
        
        // Formatear ingredientes
        const ingredientsDisplay = productData.ingredients && productData.ingredients.length > 0 ? 
            productData.ingredients.join(', ') : 
            'No disponible';
        
        // Actualizar el contenido del contenedor
        productInfoContainer.innerHTML = `
            <div class="info-item">
                <span class="info-label">Nombre:</span>
                <span class="info-value">${productData.name || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Tipo de Producto:</span>
                <span class="info-value">${productData.product_type || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Descripción:</span>
                <span class="info-value">${productData.short_desc || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Beneficios:</span>
                <span class="info-value">${benefitsDisplay}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Ingredientes:</span>
                <span class="info-value">${ingredientsDisplay}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Precio:</span>
                <span class="info-value">${priceDisplay}</span>
            </div>
        `;
        
        console.log('Información de producto actualizada correctamente');
    }

    // Función para actualizar la información de oferta en el acordeón
    updateOfferInfo(offerData) {
        console.log('Actualizando información de oferta:', offerData);
        
        const offerInfoContainer = document.getElementById('offer-info');
        if (!offerInfoContainer) {
            console.error('No se encontró el contenedor offer-info');
            return;
        }
        
        // Actualizar el contenido del contenedor
        offerInfoContainer.innerHTML = `
            <div class="info-item">
                <span class="info-label">Nombre:</span>
                <span class="info-value">${offerData.name || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Descripción:</span>
                <span class="info-value">${offerData.description || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Tipo de Oferta:</span>
                <span class="info-value">${offerData.offer_type || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Descuento:</span>
                <span class="info-value">${offerData.discount || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Válido hasta:</span>
                <span class="info-value">${offerData.valid_until || 'No disponible'}</span>
            </div>
        `;
        
        console.log('Información de oferta actualizada correctamente');
    }

    // Función para actualizar la información de audiencia en el acordeón
    updateAudienceInfo(audienceData) {
        console.log('Actualizando información de audiencia:', audienceData);
        
        const audienceInfoContainer = document.getElementById('audience-info');
        if (!audienceInfoContainer) {
            console.error('No se encontró el contenedor audience-info');
            return;
        }
        
        // Actualizar el contenido del contenedor
        audienceInfoContainer.innerHTML = `
            <div class="info-item">
                <span class="info-label">Nombre:</span>
                <span class="info-value">${audienceData.name || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Descripción:</span>
                <span class="info-value">${audienceData.description || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Edad:</span>
                <span class="info-value">${audienceData.age_range || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Intereses:</span>
                <span class="info-value">${audienceData.interests ? audienceData.interests.join(', ') : 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Comportamiento:</span>
                <span class="info-value">${audienceData.behavior || 'No disponible'}</span>
            </div>
        `;
        
        console.log('Información de audiencia actualizada correctamente');
    }

    // Función para limpiar información de oferta
    clearOfferInfo() {
        const offerInfoContainer = document.getElementById('offer-info');
        if (offerInfoContainer) {
            offerInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">No seleccionado</span>
                </div>
            `;
        }
    }

    // Función para limpiar información de audiencia
    clearAudienceInfo() {
        const audienceInfoContainer = document.getElementById('audience-info');
        if (audienceInfoContainer) {
            audienceInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">No seleccionado</span>
                </div>
            `;
        }
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
                console.log('Sin autenticación: no se pueden cargar imágenes');
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
                this.showNotification('Error cargando imágenes de producto', 'error');
                return;
            }

            this.productImages = data || [];
            this.renderProductImages();
            
            // Mostrar galería de imágenes si hay imágenes disponibles
            if (this.productImages.length > 0) {
                this.showImageGallery();
            } else {
                this.hideImageGallery();
            }

        } catch (error) {
            console.error('Error cargando imágenes de producto:', error);
            this.showNotification('Error cargando imágenes de producto', 'error');
        }
    }


    // Función para renderizar las imágenes de producto (solo galería)
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

        // Renderizar cada imagen como galería simple
        this.productImages.forEach((image, index) => {
            // Manejar estructura de Supabase (files)
            const imageUrl = image.image_url || (image.path ? `https://ksjeikudvqseoosyhsdd.supabase.co/storage/v1/object/public/ugc/${image.path}` : '');
            const imageName = image.image_name || image.description || `Imagen ${index + 1}`;
            
            // Crear elemento de imagen simple
            const imageItem = document.createElement('div');
            imageItem.className = 'product-image-item';
            imageItem.innerHTML = `
                    <img src="${imageUrl}" alt="${imageName}" loading="lazy" 
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JbWFnZW48L3RleHQ+Cjwvc3ZnPg=='">
                <div class="image-label">${imageName}</div>
            `;
            
            container.appendChild(imageItem);
        });

        console.log(`✅ ${this.productImages.length} imágenes renderizadas correctamente`);
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
        console.log('Producto seleccionado:', productId);
        
        // Si no hay producto seleccionado, ocultar galería de imágenes
        if (!productId) {
            this.hideImageGallery();
            return;
        }

        // Si hay producto seleccionado, cargar y mostrar su información
        const product = this.products.find(p => p.id === productId);
        if (product) {
            this.updateProductInfo(product);
        }

        // Cargar imágenes del producto seleccionado
        await this.loadProductImages(productId);
    }

    // Función para manejar la selección de oferta desde el dropdown
    async selectOfferFromDropdown(offerId) {
        console.log('Oferta seleccionada:', offerId);
        
        // Si no hay oferta seleccionada, limpiar información
        if (!offerId) {
            this.clearOfferInfo();
            return;
        }

        // Si hay oferta seleccionada, cargar y mostrar su información
        const offer = this.offers.find(o => o.id === offerId);
        if (offer) {
            this.updateOfferInfo(offer);
        }
    }

    // Función para manejar la selección de audiencia desde el dropdown
    async selectAudienceFromDropdown(audienceId) {
        console.log('Audiencia seleccionada:', audienceId);
        
        // Si no hay audiencia seleccionada, limpiar información
        if (!audienceId) {
            this.clearAudienceInfo();
            return;
        }

        // Si hay audiencia seleccionada, cargar y mostrar su información
        const audience = this.audience.find(a => a.id === audienceId);
        if (audience) {
            this.updateAudienceInfo(audience);
        }
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

