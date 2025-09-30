/**
 * Studio Manager - UGC Studio
 * Maneja la funcionalidad completa del Studio con datos reales de Supabase
 */

class StudioManager {
    constructor() {
        this.supabase = null;
        this.userId = null;
        this.currentProjectId = null;
        
        // Estado global de configuración
        this.studioConfig = {
            brand: null,
            product: null,
            offer: null,
            themes: [],
            category: null,
            style: null,
            format: 'horizontal',
            location: { 
                country: 'ES', 
                language: 'es', 
                accent: 'neutral' 
            },
            gender: 'masculino',
            age: '25-34',
            creativity: 75,
        };
        
        // Datos cargados
        this.brands = [];
        this.products = [];
        this.offers = [];
        this.avatars = [];
        this.styleCatalog = [];
        
        // Nuevas secciones
        this.audience = {};
        this.ugc = [];
        this.compliance = {};
        this.aesthetics = {};
        this.scenarios = [];
        
        this.init();
    }

    async init() {
        try {
            await this.waitForSupabase();
            this.setupSupabase();
            await this.checkAuthentication();
            await this.loadUserData();
            this.setupEventListeners();
            this.initializeLucideIcons();
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
            return;
        }

        try {
            // Cargar todos los datos del usuario
            await Promise.all([
                this.loadBrands(),
                this.loadProducts(),
                this.loadOffers(),
                this.loadAvatars(),
                this.loadStyleCatalog(),
                this.loadAudience(),
                this.loadUGC(),
                this.loadCompliance(),
                this.loadAesthetics(),
                this.loadScenarios()
            ]);

        } catch (error) {
            console.error('Error loading user data:', error);
            this.loadDemoData();
        }
    }


    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async loadBrands() {
        try {
            if (!this.userId) return;

            // Cargar proyectos del usuario (espacios de trabajo)
            const { data: projects, error } = await this.supabase
                .from('projects')
                .select(`
                    id,
                    name,
                    website,
                    country,
                    languages,
                    created_at,
                    updated_at
                `)
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading projects:', error);
                this.showNotification('Error cargando proyectos', 'error');
                return;
            }

            // Los proyectos son los espacios de trabajo (marcas)
            this.brands = projects || [];
            console.log('Proyectos cargados:', this.brands);
            this.renderBrands();

        } catch (error) {
            console.error('Error in loadBrands:', error);
            this.showNotification('Error cargando marcas', 'error');
        }
    }

    async loadProducts() {
        try {
            if (!this.userId) return;

            // Cargar productos de todos los proyectos del usuario
            const { data: products, error } = await this.supabase
                .from('products')
                .select(`
                    id,
                    project_id,
                    product_type,
                    short_desc,
                    benefits,
                    differentiators,
                    usage_steps,
                    ingredients,
                    price,
                    variants,
                    main_image_id,
                    gallery_file_ids,
                    projects!inner(name, website)
                `)
                .eq('projects.user_id', this.userId);

            if (error) {
                console.error('Error loading products:', error);
                this.showNotification('Error cargando productos', 'error');
                return;
            }

            this.products = products || [];
            this.renderProducts();

        } catch (error) {
            console.error('Error in loadProducts:', error);
            this.showNotification('Error cargando productos', 'error');
        }
    }

    async loadOffers() {
        try {
            if (!this.userId) return;

            // Cargar ofertas de todos los proyectos del usuario
            const { data: offers, error } = await this.supabase
                .from('offers')
                .select(`
                    id,
                    project_id,
                    main_objective,
                    offer_desc,
                    cta,
                    cta_url,
                    offer_valid_until,
                    projects!inner(name, website)
                `)
                .eq('projects.user_id', this.userId);

            if (error) {
                console.error('Error loading offers:', error);
                this.showNotification('Error cargando ofertas', 'error');
                return;
            }

            this.offers = offers || [];
            this.renderOffers();

        } catch (error) {
            console.error('Error in loadOffers:', error);
            this.showNotification('Error cargando ofertas', 'error');
        }
    }

    async loadAvatars() {
        try {
            if (!this.userId) return;

            // Cargar avatares de todos los proyectos del usuario
            const { data: avatars, error } = await this.supabase
                .from('avatars')
                .select(`
                    id,
                    project_id,
                    avatar_type,
                    traits,
                    energy,
                    gender,
                    voice,
                    languages,
                    values,
                    avatar_image_id,
                    avatar_video_id,
                    projects!inner(name, website)
                `)
                .eq('projects.user_id', this.userId);

            if (error) {
                console.error('Error loading avatars:', error);
                this.showNotification('Error cargando avatares', 'error');
                return;
            }

            this.avatars = avatars || [];
            this.renderAvatars();

        } catch (error) {
            console.error('Error in loadAvatars:', error);
            this.showNotification('Error cargando avatares', 'error');
        }
    }

    async loadStyleCatalog() {
        try {
            if (!this.userId) return;

            // Cargar estilos de todos los proyectos del usuario
            const { data: styles, error } = await this.supabase
                .from('style_catalog')
                .select(`
                    id,
                    project_id,
                    prompt,
                    video_file_id,
                    name,
                    label,
                    category,
                    filters,
                    config,
                    projects!inner(name, website)
                `)
                .eq('projects.user_id', this.userId);

            if (error) {
                console.error('Error loading styles:', error);
                this.showNotification('Error cargando estilos', 'error');
                return;
            }

            this.styleCatalog = styles || [];
            this.renderStyles();

        } catch (error) {
            console.error('Error in loadStyleCatalog:', error);
            this.showNotification('Error cargando estilos', 'error');
        }
    }

    // =======================================
    // Nuevas secciones: Audiencia, UGC, Cumplimientos, Estética, Escenarios
    // =======================================

    async loadAudience() {
        try {
            if (!this.userId) return;

            // Cargar datos de audiencia desde user_profiles
            const { data: profile, error } = await this.supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', this.userId)
                .single();

            if (error) {
                console.error('Error loading audience:', error);
                return;
            }

            this.audience = profile || {};
            this.renderAudience();

        } catch (error) {
            console.error('Error in loadAudience:', error);
        }
    }

    async loadUGC() {
        try {
            if (!this.userId) return;

            // Cargar avatares UGC de todos los proyectos del usuario
            const { data: ugc, error } = await this.supabase
                .from('avatars')
                .select(`
                    id,
                    project_id,
                    avatar_type,
                    traits,
                    energy,
                    gender,
                    voice,
                    languages,
                    values,
                    avatar_image_id,
                    avatar_video_id,
                    projects!inner(name, website)
                `)
                .eq('projects.user_id', this.userId);

            if (error) {
                console.error('Error loading UGC:', error);
                return;
            }

            this.ugc = ugc || [];
            this.renderUGC();

        } catch (error) {
            console.error('Error in loadUGC:', error);
        }
    }

    async loadCompliance() {
        try {
            if (!this.userId) return;

            // Usar configuración por defecto para cumplimientos
            this.compliance = {
                regulations: [],
                declarations: [],
                restrictions: [],
                disclaimers: '',
                min_age: '13'
            };
            this.renderCompliance();

        } catch (error) {
            console.error('Error in loadCompliance:', error);
        }
    }

    async loadAesthetics() {
        try {
            if (!this.userId) return;

            // Usar configuración por defecto para estética
            this.aesthetics = {
                mood: 'motivador',
                colors: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'],
                lighting: 'natural',
                camera: 'close-up',
                pace: 'medio',
                overlays: []
            };
            this.renderAesthetics();

        } catch (error) {
            console.error('Error in loadAesthetics:', error);
        }
    }

    async loadScenarios() {
        try {
            if (!this.userId) return;

            // Usar configuración por defecto para escenarios
            this.scenarios = [
                {
                    id: 'default-1',
                    location: 'Gimnasio',
                    ambience: 'urbano',
                    background: 'liso',
                    project_name: 'Escenario por defecto'
                },
                {
                    id: 'default-2', 
                    location: 'Cocina',
                    ambience: 'natural',
                    background: 'casa',
                    project_name: 'Escenario por defecto'
                }
            ];
            this.renderScenarios();

        } catch (error) {
            console.error('Error in loadScenarios:', error);
        }
    }

    loadDemoData() {
        // Modo demo sin datos - solo limpiar arrays
        this.brands = [];
        this.products = [];
        this.offers = [];
        this.avatars = [];
        this.styleCatalog = [];
        
        // Nuevas secciones
        this.audience = {};
        this.ugc = [];
        this.compliance = {};
        this.aesthetics = {};
        this.scenarios = [];

        this.renderBrands();
        this.renderProducts();
        this.renderOffers();
        this.renderAvatars();
        this.renderStyles();
        this.renderAudience();
        this.renderUGC();
        this.renderCompliance();
        this.renderAesthetics();
        this.renderScenarios();
    }

    setupEventListeners() {
        // Botones de sidebar
        document.querySelectorAll('.icon-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const panelName = button.getAttribute('data-panel');
                this.toggleFloatingPanel(panelName);
            });
        });

        // Botón generar guiones
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.handleGenerateScripts());
        }

        // Slider de creatividad
        const creativitySlider = document.getElementById('creativity-range');
        if (creativitySlider) {
            creativitySlider.addEventListener('input', (e) => {
                this.studioConfig.creativity = parseInt(e.target.value);
                this.updateSliderValue(e.target.value);
            });
        }

        // Cerrar modales al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('brand-modal-overlay')) {
                const modalName = e.target.id.replace('modal-', '');
                this.closeModal(modalName);
            }
        });

        // Atajos de teclado
        this.setupKeyboardShortcuts();
    }

    toggleFloatingPanel(panelName) {
        const modal = document.getElementById(`modal-${panelName}`);
        if (modal) {
            if (modal.classList.contains('active')) {
                this.closeModal(panelName);
            } else {
                this.openModal(panelName);
            }
        }
    }

    openModal(modalName) {
        const modal = document.getElementById(`modal-${modalName}`);
        const button = document.querySelector(`[data-panel="${modalName}"]`);
        
        if (modal) {
            // Cerrar modal activo si existe
            document.querySelectorAll('.brand-modal-overlay.active').forEach(m => {
                m.classList.remove('active');
            });
            
            modal.classList.add('active');
            
            if (button) {
                button.classList.add('active');
            }
        }
    }

    closeModal(modalName) {
        const modal = document.getElementById(`modal-${modalName}`);
        const button = document.querySelector(`[data-panel="${modalName}"]`);
        
        if (modal) {
            modal.classList.remove('active');
            
            if (button) {
                button.classList.remove('active');
            }
        }
    }

    renderBrands() {
        const brandGrid = document.querySelector('#modal-marca .brand-grid');
        if (!brandGrid) {
            console.error('No se encontró el contenedor de marcas');
            return;
        }

        brandGrid.innerHTML = '';
        
        console.log('Renderizando marcas:', this.brands);
        
        if (!this.brands || this.brands.length === 0) {
            console.log('No hay marcas para mostrar');
            return;
        }
        
        this.brands.forEach(brand => {
            const brandCard = document.createElement('div');
            brandCard.className = 'brand-card';
            const brandName = brand.name || (brand.projects && brand.projects.name) || 'Sin nombre';
            const brandCountry = brand.country || 'Sin país';
            brandCard.innerHTML = `
                <div class="brand-avatar">${brandName.charAt(0).toUpperCase()}</div>
                <div class="brand-info">
                    <span class="brand-name">${brandName}</span>
                    <span class="brand-category">${brandCountry}</span>
                </div>
            `;
            
            brandCard.addEventListener('click', () => {
                this.selectBrand(brand);
            });
            
            brandGrid.appendChild(brandCard);
        });

        // Solo UN botón agregar nueva marca
        const addButton = document.createElement('button');
        addButton.className = 'add-new-button';
        addButton.innerHTML = `
            <i data-lucide="plus"></i>
            <span>Nueva Marca</span>
        `;
        addButton.addEventListener('click', () => this.createNewBrand());
        brandGrid.appendChild(addButton);
    }

    renderProducts() {
        const productList = document.querySelector('#modal-producto .product-list');
        if (!productList) {
            console.error('No se encontró el contenedor de productos');
            return;
        }

        productList.innerHTML = '';
        
        if (!this.products || this.products.length === 0) {
            console.log('No hay productos para mostrar');
            return;
        }
        
        this.products.forEach(product => {
            const productItem = document.createElement('div');
            productItem.className = 'product-item';
            const projectName = product.projects ? product.projects.name : 'Sin proyecto';
            productItem.innerHTML = `
                <i data-lucide="box" class="product-icon"></i>
                <div class="product-info">
                    <span class="product-name">${product.short_desc}</span>
                    <span class="product-brand">${projectName}</span>
                    <span class="product-price">$${product.price}</span>
                </div>
            `;
            
            productItem.addEventListener('click', () => {
                this.selectProduct(product);
            });
            
            productList.appendChild(productItem);
        });

        // Solo UN botón agregar nuevo producto
        const addButton = document.createElement('button');
        addButton.className = 'add-new-button';
        addButton.innerHTML = `
            <i data-lucide="plus"></i>
            <span>Nuevo Producto</span>
        `;
        addButton.addEventListener('click', () => this.createNewProduct());
        productList.appendChild(addButton);
    }

    renderOffers() {
        const offerList = document.querySelector('#modal-oferta .offer-list');
        if (!offerList) {
            console.error('No se encontró el contenedor de ofertas');
            return;
        }

        offerList.innerHTML = '';
        
        if (!this.offers || this.offers.length === 0) {
            console.log('No hay ofertas para mostrar');
            return;
        }
        
        this.offers.forEach(offer => {
            const offerItem = document.createElement('div');
            offerItem.className = 'offer-item';
            const projectName = offer.projects ? offer.projects.name : 'Sin proyecto';
            offerItem.innerHTML = `
                <div class="offer-badge">${offer.main_objective}</div>
                <div class="offer-info">
                    <span class="offer-name">${offer.offer_desc}</span>
                    <span class="offer-brand">${projectName}</span>
                    <span class="offer-period">${offer.cta}</span>
                </div>
            `;
            
            offerItem.addEventListener('click', () => {
                this.selectOffer(offer);
            });
            
            offerList.appendChild(offerItem);
        });

        // Solo UN botón agregar nueva oferta
        const addButton = document.createElement('button');
        addButton.className = 'add-new-button';
        addButton.innerHTML = `
            <i data-lucide="plus"></i>
            <span>Nueva Oferta</span>
        `;
        addButton.addEventListener('click', () => this.createNewOffer());
        offerList.appendChild(addButton);
    }

    renderAvatars() {
        // Implementar renderizado de avatares
        console.log('Avatares cargados:', this.avatars);
    }

    renderStyles() {
        const styleGrid = document.querySelector('#modal-estilos .style-grid');
        if (!styleGrid) return;

        styleGrid.innerHTML = '';
        
        this.styleCatalog.forEach(style => {
            const styleCard = document.createElement('div');
            styleCard.className = 'style-card';
            const projectName = style.projects ? style.projects.name : 'Sin proyecto';
            styleCard.innerHTML = `
                <div class="style-preview ${style.category ? style.category.toLowerCase() : 'default'}"></div>
                <span class="style-name">${style.name || 'Sin nombre'}</span>
                <span class="style-brand">${projectName}</span>
            `;
            
            styleCard.addEventListener('click', () => {
                this.selectStyle(style);
            });
            
            styleGrid.appendChild(styleCard);
        });
    }

    selectBrand(brand) {
        this.studioConfig.brand = brand;
        this.updateBrandSelection(brand);
        this.closeModal('marca');
        this.updateConfigDisplay();
    }

    selectProduct(product) {
        this.studioConfig.product = product;
        this.updateProductSelection(product);
        this.closeModal('producto');
        this.updateConfigDisplay();
    }

    selectOffer(offer) {
        this.studioConfig.offer = offer;
        this.updateOfferSelection(offer);
        this.closeModal('oferta');
        this.updateConfigDisplay();
    }

    selectStyle(style) {
        this.studioConfig.style = style;
        this.updateStyleSelection(style);
        this.closeModal('estilos');
        this.updateConfigDisplay();
    }

    updateBrandSelection(brand) {
        console.log('Marca seleccionada:', brand);
    }

    updateProductSelection(product) {
        console.log('Producto seleccionado:', product);
    }

    updateOfferSelection(offer) {
        console.log('Oferta seleccionada:', offer);
    }

    updateStyleSelection(style) {
        console.log('Estilo seleccionado:', style);
    }

    updateConfigDisplay() {
        console.log('Configuración actual:', this.studioConfig);
    }

    updateSliderValue(value) {
        const valueDisplay = document.querySelector('.slider-value');
        if (valueDisplay) {
            valueDisplay.textContent = value;
        }
    }

    async handleGenerateScripts() {
        if (!this.studioConfig.brand || !this.studioConfig.product) {
            this.showNotification('Selecciona al menos una marca y un producto', 'error');
            return;
        }

        try {
            this.showNotification('Generando guiones...', 'info');
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log('Enviando configuración al backend:', this.studioConfig);
            
            this.showNotification('Guiones generados exitosamente', 'success');
            
        } catch (error) {
            console.error('Error generating scripts:', error);
            this.showNotification('Error generando guiones', 'error');
        }
    }

    createNewBrand() {
        console.log('Crear nueva marca');
    }

    createNewProduct() {
        console.log('Crear nuevo producto');
    }

    createNewOffer() {
        console.log('Crear nueva oferta');
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.brand-modal-overlay.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
            
            if (e.key >= '1' && e.key <= '5' && !e.ctrlKey && !e.metaKey) {
                const modals = ['marca', 'producto', 'oferta', 'temas', 'categoria'];
                const modalIndex = parseInt(e.key) - 1;
                if (modals[modalIndex]) {
                    this.openModal(modals[modalIndex]);
                }
            }
            
            if (e.shiftKey && e.key >= '1' && e.key <= '8') {
                const modals = ['estilos', 'formato', 'pais', 'idioma', 'acento', 'genero', 'edad', 'creatividad'];
                const modalIndex = parseInt(e.key) - 1;
                if (modals[modalIndex]) {
                    this.openModal(modals[modalIndex]);
                }
            }
        });
    }

    showNotification(message, type = 'info') {
        console.log(`${type.toUpperCase()}: ${message}`);
    }

    // =======================================
    // Funciones de renderizado para nuevas secciones
    // =======================================

    renderAudience() {
        // Renderizar datos de audiencia en el modal
        console.log('Renderizando audiencia:', this.audience);
        
        // Llenar campos del formulario si hay datos
        if (this.audience && this.audience.full_name) {
            const personaField = document.getElementById('audiencia-persona');
            if (personaField) {
                personaField.value = `${this.audience.full_name}, ${this.audience.country || 'Sin país'}, ${this.audience.language || 'Sin idioma'}`;
            }
        }
    }

    renderUGC() {
        const ugcGrid = document.querySelector('#ugc-grid');
        if (!ugcGrid) return;

        ugcGrid.innerHTML = '';
        
        if (!this.ugc || this.ugc.length === 0) {
            ugcGrid.innerHTML = '<p class="no-data">No hay avatares UGC disponibles</p>';
            return;
        }

        this.ugc.forEach(avatar => {
            const avatarCard = document.createElement('div');
            avatarCard.className = 'ugc-card';
            avatarCard.innerHTML = `
                <div class="ugc-avatar">
                    <i data-lucide="user-circle"></i>
                </div>
                <div class="ugc-info">
                    <span class="ugc-type">${avatar.avatar_type || 'Avatar'}</span>
                    <span class="ugc-gender">${avatar.gender || 'No especificado'}</span>
                </div>
            `;
            
            avatarCard.addEventListener('click', () => {
                this.selectUGC(avatar);
            });
            
            ugcGrid.appendChild(avatarCard);
        });
    }

    renderCompliance() {
        // Renderizar configuración de cumplimiento
        console.log('Renderizando cumplimientos:', this.compliance);
        
        // Llenar campos del formulario con valores por defecto
        if (this.compliance) {
            const edadField = document.getElementById('cumplimiento-edad');
            if (edadField) {
                edadField.value = this.compliance.min_age || '13';
            }
            
            const disclaimersField = document.getElementById('cumplimiento-disclaimers');
            if (disclaimersField) {
                disclaimersField.value = this.compliance.disclaimers || '';
            }
        }
    }

    renderAesthetics() {
        // Renderizar configuración estética
        console.log('Renderizando estética:', this.aesthetics);
        
        // Llenar campos del formulario con valores por defecto
        if (this.aesthetics) {
            const moodField = document.getElementById('estetica-mood');
            if (moodField) {
                moodField.value = this.aesthetics.mood || 'motivador';
            }
            
            const lightingField = document.getElementById('estetica-iluminacion');
            if (lightingField) {
                lightingField.value = this.aesthetics.lighting || 'natural';
            }
            
            const cameraField = document.getElementById('estetica-camara');
            if (cameraField) {
                cameraField.value = this.aesthetics.camera || 'close-up';
            }
            
            const paceField = document.getElementById('estetica-ritmo');
            if (paceField) {
                paceField.value = this.aesthetics.pace || 'medio';
            }
            
            // Llenar color pickers
            if (this.aesthetics.colors) {
                this.aesthetics.colors.forEach((color, index) => {
                    const colorField = document.getElementById(`estetica-color${index + 1}`);
                    if (colorField) {
                        colorField.value = color;
                    }
                });
            }
        }
    }

    renderScenarios() {
        const scenariosGrid = document.querySelector('#escenarios-grid');
        if (!scenariosGrid) return;

        scenariosGrid.innerHTML = '';
        
        if (!this.scenarios || this.scenarios.length === 0) {
            scenariosGrid.innerHTML = '<p class="no-data">No hay escenarios disponibles</p>';
            return;
        }

        this.scenarios.forEach(scenario => {
            const scenarioCard = document.createElement('div');
            scenarioCard.className = 'scenario-card';
            scenarioCard.innerHTML = `
                <div class="scenario-preview"></div>
                <div class="scenario-info">
                    <span class="scenario-location">${scenario.location || 'Sin ubicación'}</span>
                    <span class="scenario-ambience">${scenario.ambience || 'Sin ambiente'}</span>
                </div>
            `;
            
            scenarioCard.addEventListener('click', () => {
                this.selectScenario(scenario);
            });
            
            scenariosGrid.appendChild(scenarioCard);
        });
    }

    // Funciones de selección para nuevas secciones
    selectUGC(avatar) {
        this.studioConfig.ugc = avatar;
        this.showNotification('Avatar UGC seleccionado', 'success');
    }

    selectScenario(scenario) {
        this.studioConfig.scenario = scenario;
        this.showNotification('Escenario seleccionado', 'success');
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.studioManager = new StudioManager();
    
    // Inicializar iconos Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// También inicializar cuando la ventana se carga completamente
window.addEventListener('load', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});
