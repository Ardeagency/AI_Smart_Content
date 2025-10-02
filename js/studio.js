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
            // Configuraciones principales
            brand: null,
            product: null,
            offer: null,
            themes: [],
            category: null,
            
            // Configuraciones de audiencia
            audience: {
                persona: '',
                interests: [],
                pains: [],
                contexts: [],
                languages: []
            },
            
            // Configuraciones de UGC
            ugc: null,
            
            // Configuraciones estéticas
            aesthetics: {
                mood: 'motivador',
                colors: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'],
                lighting: 'natural',
                camera: 'close-up',
                pace: 'medio',
                overlays: []
            },
            
            // Configuraciones de escenarios
            scenario: null,
            
            // Configuraciones de formato y localización
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
        this.aesthetics = {};
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
            // Cargar todos los datos del usuario (con manejo individual de errores)
            const loadPromises = [
                this.loadBrands(),
                this.loadProducts(),
                this.loadOffers(),
                this.loadAvatars(),
                this.loadStyleCatalog(),
                this.loadAudience(),
                this.loadUGC(),
                this.loadAesthetics(),
                this.loadScenarios(),
                this.loadBrandGuidelines(),
                this.loadCompliance(),
                this.loadDistribution()
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


    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async loadBrands() {
        try {
            console.log('=== CARGANDO MARCAS ===');
            if (!this.userId) {
                console.log('No hay userId, saltando carga de marcas');
                return;
            }

            // Cargar brand_guidelines con datos del proyecto
            const { data: brands, error } = await this.supabase
                .from('brand_guidelines')
                .select(`
                    id,
                    project_id,
                    name,
                    tone_of_voice,
                    keywords_yes,
                    keywords_no,
                    dos_donts,
                    brand_assets,
                    reference_links,
                    logo_file_id,
                    brand_file_ids,
                    created_at,
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
                    availability,
                    name,
                    main_image_id,
                    gallery_file_ids,
                    created_at,
                    projects!inner(
                        id,
                        name,
                        website
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
                    kpis,
                    created_at,
                    projects!inner(
                        id,
                        name,
                        website
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

            // Cargar audiencia de todos los proyectos del usuario
            const { data: audience, error } = await this.supabase
                .from('audience')
                .select(`
                    id,
                    project_id,
                    buyer_persona,
                    interests,
                    pains,
                    contexts,
                    language_codes,
                    created_at,
                    projects!inner(
                        id,
                        name,
                        website
                    )
                `)
                .eq('projects.user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading audience:', error);
                this.showNotification('Error cargando audiencia', 'error');
                return;
            }

            this.audience = audience || [];
            console.log('Audiencia cargada desde Supabase:', this.audience);

        } catch (error) {
            console.error('Error in loadAudience:', error);
            this.showNotification('Error cargando audiencia', 'error');
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

            // Cargar escenarios de todos los proyectos del usuario
            const { data: scenarios, error } = await this.supabase
                .from('scenarios')
                .select(`
                    id,
                    project_id,
                    main_location,
                    ambience,
                    hygiene,
                    backdrop,
                    scenario_file_ids,
                    projects!inner(name, website)
                `)
                .eq('projects.user_id', this.userId);

            if (error) {
                console.error('Error loading scenarios:', error);
                this.showNotification('Error cargando escenarios', 'error');
                return;
            }

            this.scenarios = scenarios || [];
            this.renderScenarios();

        } catch (error) {
            console.error('Error in loadScenarios:', error);
        }
    }

    async loadBrandGuidelines() {
        try {
            if (!this.userId) return;

            // Cargar guías de marca de todos los proyectos del usuario
            const { data: guidelines, error } = await this.supabase
                .from('brand_guidelines')
                .select(`
                    id,
                    project_id,
                    name,
                    tone_of_voice,
                    keywords_yes,
                    keywords_no,
                    dos_donts,
                    brand_assets,
                    reference_links,
                    logo_file_id,
                    brand_file_ids,
                    projects!inner(name, website)
                `)
                .eq('projects.user_id', this.userId);

            if (error) {
                console.error('Error loading brand guidelines:', error);
                return;
            }

            this.brandGuidelines = guidelines || [];
            this.renderBrandGuidelines();

        } catch (error) {
            console.error('Error in loadBrandGuidelines:', error);
        }
    }

    async loadCompliance() {
        try {
            if (!this.userId) return;

            // Cargar configuraciones de cumplimiento de todos los proyectos del usuario
            const { data: compliance, error } = await this.supabase
                .from('compliance')
                .select(`
                    id,
                    project_id,
                    claims_allowed,
                    claims_forbidden,
                    platform_restrictions,
                    advertising_labels,
                    projects!inner(name, website)
                `)
                .eq('projects.user_id', this.userId);

            if (error) {
                console.error('Error loading compliance:', error);
                return;
            }

            this.compliance = compliance || [];
            this.renderCompliance();

        } catch (error) {
            console.error('Error in loadCompliance:', error);
        }
    }

    async loadDistribution() {
        try {
            if (!this.userId) return;

            // Cargar configuraciones de distribución de todos los proyectos del usuario
            const { data: distribution, error } = await this.supabase
                .from('distribution')
                .select(`
                    id,
                    project_id,
                    platforms,
                    formats,
                    utm_params,
                    ab_variables,
                    created_at,
                    projects!inner(
                        id,
                        name,
                        website
                    )
                `)
                .eq('projects.user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading distribution:', error);
                // No fallar la carga completa por un error de distribución
                this.distribution = [];
                return;
            }

            this.distribution = distribution || [];
            console.log('Distribución cargada desde Supabase:', this.distribution);

        } catch (error) {
            console.error('Error in loadDistribution:', error);
        }
    }

    // =======================================
    // Pre-población de configuraciones
    // =======================================

    prePopulateConfigurations() {
        console.log('=== PRE-POBLANDO CONFIGURACIONES ===');
        console.log('Datos disponibles:');
        console.log('- brands:', this.brands.length, this.brands);
        console.log('- products:', this.products.length, this.products);
        console.log('- offers:', this.offers.length, this.offers);
        console.log('- audience:', this.audience?.length || 0, this.audience);
        
        // Pre-seleccionar la primera marca si existe
        if (this.brands.length > 0) {
            this.studioConfig.brand = this.brands[0];
            console.log('Marca seleccionada:', this.studioConfig.brand);
            this.updateBrandFields(this.studioConfig.brand);
        } else {
            console.log('No hay marcas disponibles');
        }

        // Pre-seleccionar el primer producto si existe
        if (this.products.length > 0) {
            this.studioConfig.product = this.products[0];
            console.log('Producto seleccionado:', this.studioConfig.product);
            this.updateProductFields(this.studioConfig.product);
        }

        // Pre-seleccionar la primera oferta si existe
        if (this.offers.length > 0) {
            this.studioConfig.offer = this.offers[0];
            console.log('Oferta seleccionada:', this.studioConfig.offer);
            this.updateOfferFields(this.studioConfig.offer);
        }

        // Pre-seleccionar la primera audiencia si existe
        if (this.audience && this.audience.length > 0) {
            this.studioConfig.audience = this.audience[0];
            console.log('Audiencia seleccionada:', this.studioConfig.audience);
            this.updateAudienceFields(this.studioConfig.audience);
        }

        // Pre-poblar configuración de ubicación
        if (this.audience && this.audience.country) {
            this.studioConfig.location = {
                country: this.audience.country,
                language: this.audience.language || 'es',
                accent: this.getAccentFromCountry(this.audience.country)
            };
        }

        // Pre-seleccionar el primer avatar UGC si existe
        if (this.ugc.length > 0) {
            this.studioConfig.ugc = this.ugc[0];
        }

        // Pre-seleccionar el primer escenario si existe
        if (this.scenarios.length > 0) {
            this.studioConfig.scenario = this.scenarios[0];
        }

        // Pre-seleccionar el primer estilo si existe
        if (this.styleCatalog.length > 0) {
            this.studioConfig.style = this.styleCatalog[0];
        }

        // Inicializar campos del sidebar primero
        this.initializeSidebarFields();

        // Poblar dropdowns del sidebar integrado
        this.populateDropdowns();

        // Actualizar la visualización
        this.updateConfigDisplay();
        this.showNotification('Configuraciones pre-pobladas con tus datos', 'success');
    }

    initializeSidebarFields() {
        // Inicializar campos de marca
        const brandName = document.getElementById('brand-name');
        const brandTone = document.getElementById('brand-tone');
        const brandKeywords = document.getElementById('brand-keywords');
        const brandProhibited = document.getElementById('brand-prohibited');
        const brandReferences = document.getElementById('brand-references');
        const brandLogoPreview = document.getElementById('brand-logo-preview');

        if (brandName) brandName.textContent = 'Selecciona una marca';
        if (brandTone) brandTone.value = '';
        if (brandKeywords) brandKeywords.value = '';
        if (brandProhibited) brandProhibited.value = '';
        if (brandReferences) brandReferences.innerHTML = '<span class="no-links">Sin enlaces</span>';
        if (brandLogoPreview) brandLogoPreview.innerHTML = '<div class="no-image">Sin logo</div>';

        // Inicializar campos de producto
        const productType = document.getElementById('product-type');
        const productDescription = document.getElementById('product-description');
        const productName = document.getElementById('product-name');

        if (productType) productType.textContent = 'Selecciona un producto';
        if (productDescription) productDescription.value = '';
        if (productName) productName.textContent = 'Selecciona un producto';

        // Inicializar campos de oferta
        const offerObjective = document.getElementById('offer-objective');
        const offerDiscount = document.getElementById('offer-discount');
        const offerValidity = document.getElementById('offer-validity');
        const offerCTA = document.getElementById('offer-cta');
        const offerCTAUrl = document.getElementById('offer-cta-url');
        const offerTags = document.getElementById('offer-tags');

        if (offerObjective) offerObjective.value = '';
        if (offerDiscount) offerDiscount.value = '';
        if (offerValidity) offerValidity.value = '';
        if (offerCTA) offerCTA.value = '';
        if (offerCTAUrl) offerCTAUrl.value = '';
        if (offerTags) offerTags.value = '';

        // Inicializar campos de audiencia
        const audiencePersona = document.getElementById('audience-persona');
        if (audiencePersona) audiencePersona.value = '';

        // Inicializar categoría
        const selectedCategory = document.getElementById('selected-category');
        if (selectedCategory) selectedCategory.textContent = 'Selecciona una categoría';

        console.log('Campos del sidebar inicializados');
    }

    populateDropdowns() {
        // Poblar dropdown de marcas
        const brandSelector = document.getElementById('brand-selector');
        if (brandSelector) {
            brandSelector.innerHTML = '<option value="">Seleccionar marca...</option>';
            this.brands.forEach(brand => {
                const option = document.createElement('option');
                option.value = brand.id;
                option.textContent = brand.name;
                if (this.studioConfig.brand && this.studioConfig.brand.id === brand.id) {
                    option.selected = true;
                }
                brandSelector.appendChild(option);
            });
        }

        // Poblar dropdown de productos
        const productSelector = document.getElementById('product-selector');
        if (productSelector) {
            productSelector.innerHTML = '<option value="">Seleccionar producto...</option>';
            this.products.forEach(product => {
                const option = document.createElement('option');
                option.value = product.id;
                option.textContent = product.short_desc || product.name;
                if (this.studioConfig.product && this.studioConfig.product.id === product.id) {
                    option.selected = true;
                }
                productSelector.appendChild(option);
            });
        }

        // Poblar dropdown de ofertas
        const offerSelector = document.getElementById('offer-selector');
        if (offerSelector) {
            offerSelector.innerHTML = '<option value="">Seleccionar oferta...</option>';
            this.offers.forEach(offer => {
                const option = document.createElement('option');
                option.value = offer.id;
                option.textContent = offer.main_objective || 'Oferta sin título';
                if (this.studioConfig.offer && this.studioConfig.offer.id === offer.id) {
                    option.selected = true;
                }
                offerSelector.appendChild(option);
            });
        }

        // Poblar dropdown de audiencia
        const audienceSelector = document.getElementById('audience-selector');
        if (audienceSelector) {
            audienceSelector.innerHTML = '<option value="">Seleccionar audiencia...</option>';
            this.audience.forEach(audience => {
                const option = document.createElement('option');
                option.value = audience.id;
                option.textContent = audience.buyer_persona?.name || 'Audiencia sin nombre';
                if (this.studioConfig.audience && this.studioConfig.audience.id === audience.id) {
                    option.selected = true;
                }
                audienceSelector.appendChild(option);
            });
        }
    }

    getAccentFromCountry(country) {
        const accentMap = {
            'ES': 'spain',
            'MX': 'mexican',
            'AR': 'argentinian',
            'CO': 'colombian',
            'US': 'neutral'
        };
        return accentMap[country] || 'neutral';
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
        this.aesthetics = {};
        this.scenarios = [];
        this.brandGuidelines = [];
        this.compliance = [];
        this.distribution = [];

        // Sin renderizado de modales
    }

    setupEventListeners() {
        // Event listeners para el sidebar integrado
        // Los eventos se manejan directamente en los elementos HTML con onclick

        // Botón hamburger para navegación principal
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const sideNavigation = document.getElementById('sideNavigation');
        const navOverlay = document.getElementById('navOverlay');

        if (hamburgerMenu && sideNavigation && navOverlay) {
            hamburgerMenu.addEventListener('click', () => {
                this.toggleMainNavigation();
            });

            navOverlay.addEventListener('click', () => {
                this.closeMainNavigation();
            });
        }

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

        // Sin funcionalidad de modales

        // Atajos de teclado
        this.setupKeyboardShortcuts();
    }

    // =======================================
    // Funciones de Cards Flotantes
    // =======================================

    toggleConfigCard(panelType, button) {
        // Cerrar card activa si es la misma
        if (this.activeCard === panelType) {
            this.closeConfigCard();
            return;
        }

        // Cerrar card anterior si existe
        this.closeConfigCard();

        // Mostrar nueva card
        this.showConfigCard(panelType, button);
    }

    showConfigCard(panelType, button) {
        // Crear card flotante
        const card = this.createConfigCard(panelType);
        
        // Posicionar card cerca del botón
        const buttonRect = button.getBoundingClientRect();
        const sidebarRect = document.querySelector('.studio-sidebar').getBoundingClientRect();
        
        card.style.position = 'fixed';
        card.style.left = `${sidebarRect.right + 10}px`;
        card.style.top = `${buttonRect.top}px`;
        card.style.zIndex = '1000';
        
        // Agregar al DOM
        document.body.appendChild(card);
        
        // Marcar como activa
        this.activeCard = panelType;
        button.classList.add('active');
        
        // Cerrar al hacer clic fuera
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick.bind(this));
        }, 100);
    }

    closeConfigCard() {
        // Remover card activa
        const existingCard = document.querySelector('.config-card');
        if (existingCard) {
            existingCard.remove();
        }
        
        // Remover estado activo
        document.querySelectorAll('.icon-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Limpiar estado
        this.activeCard = null;
        
        // Remover listener de clic fuera
        document.removeEventListener('click', this.handleOutsideClick.bind(this));
    }

    handleOutsideClick(event) {
        if (!event.target.closest('.config-card') && !event.target.closest('.icon-button')) {
            this.closeConfigCard();
        }
    }

    createConfigCard(panelType) {
        const card = document.createElement('div');
        card.className = 'config-card';
        
        // Configurar contenido según el tipo de panel
        switch (panelType) {
            case 'marca':
                card.innerHTML = this.createBrandCardContent();
                break;
            case 'producto':
                card.innerHTML = this.createProductCardContent();
                break;
            case 'oferta':
                card.innerHTML = this.createOfferCardContent();
                break;
            case 'audiencia':
                card.innerHTML = this.createAudienceCardContent();
                break;
            case 'categoria':
                card.innerHTML = this.createCategoryCardContent();
                break;
            case 'ugc':
                card.innerHTML = this.createUGCCardContent();
                break;
            case 'estilos':
                card.innerHTML = this.createStylesCardContent();
                break;
            case 'formato':
                card.innerHTML = this.createFormatCardContent();
                break;
            case 'estetica':
                card.innerHTML = this.createAestheticsCardContent();
                break;
            case 'escenarios':
                card.innerHTML = this.createScenariosCardContent();
                break;
            case 'generar':
                card.innerHTML = this.createGenerateCardContent();
                break;
            default:
                card.innerHTML = this.createDefaultCardContent(panelType);
        }
        
        return card;
    }

    createBrandCardContent() {
        const selectedBrand = this.studioConfig.brand;
        const brandGuidelines = this.brandGuidelines.find(g => g.project_id === selectedBrand?.id);
        
        return `
            <h4>🔹 Marca</h4>
            
            <!-- Dropdown de selección de marca -->
            <div class="config-option">
                <label>Seleccionar marca:</label>
                <select id="brand-selector" onchange="window.studioManager.selectBrandFromDropdown(this.value)">
                    <option value="">Seleccionar marca...</option>
                    ${this.brands.map(brand => 
                        `<option value="${brand.id}" ${selectedBrand?.id === brand.id ? 'selected' : ''}>${brand.name}</option>`
                    ).join('')}
                </select>
            </div>

            ${selectedBrand ? `
                <!-- Imagen/Logo -->
                <div class="config-option">
                    <label>Logo:</label>
                    <div class="image-preview">
                        ${selectedBrand.logo_file_id ? 
                            `<img src="data:image/jpeg;base64,${selectedBrand.logo_file_id}" alt="Logo" class="preview-image">` : 
                            '<div class="no-image">Sin logo</div>'
                        }
                    </div>
                </div>

                <!-- Nombre (no editable) -->
                <div class="config-option">
                    <label>Nombre:</label>
                    <span class="readonly-field">${selectedBrand.name}</span>
                </div>

                <!-- Tono de voz -->
                <div class="config-option">
                    <label>Tono de voz:</label>
                    <input type="text" value="${brandGuidelines?.tone_of_voice || ''}" 
                           placeholder="Ej: Profesional, Casual, Innovador..." 
                           onchange="window.studioManager.updateBrandTone(this.value)">
                </div>

                <!-- Palabras clave -->
                <div class="config-option">
                    <label>Palabras clave:</label>
                    <input type="text" value="${brandGuidelines?.keywords_yes?.join(', ') || ''}" 
                           placeholder="Separadas por comas..." 
                           onchange="window.studioManager.updateBrandKeywords(this.value)">
                </div>

                <!-- Palabras prohibidas -->
                <div class="config-option">
                    <label>Palabras prohibidas:</label>
                    <input type="text" value="${brandGuidelines?.keywords_no?.join(', ') || ''}" 
                           placeholder="Separadas por comas..." 
                           onchange="window.studioManager.updateBrandProhibited(this.value)">
                </div>

                <!-- Enlaces de referencia -->
                <div class="config-option">
                    <label>Enlaces de referencia:</label>
                    <div class="reference-links">
                        ${brandGuidelines?.reference_links?.map(link => 
                            `<a href="${link}" target="_blank" class="reference-link">${link}</a>`
                        ).join('') || '<span class="no-links">Sin enlaces</span>'}
                    </div>
                </div>
            ` : ''}

            <!-- Botón agregar nueva marca -->
            <div class="config-option">
                <button class="btn btn-secondary" onclick="window.studioManager.createNewBrand()">
                    ➕ Agregar nueva marca
                </button>
            </div>
        `;
    }

    createProductCardContent() {
        const selectedProduct = this.studioConfig.product;
        
        return `
            <h4>🔹 Productos</h4>
            
            <!-- Dropdown de selección de producto -->
            <div class="config-option">
                <label>Seleccionar producto:</label>
                <select id="product-selector" onchange="window.studioManager.selectProductFromDropdown(this.value)">
                    <option value="">Seleccionar producto...</option>
                    ${this.products.map(product => 
                        `<option value="${product.id}" ${selectedProduct?.id === product.id ? 'selected' : ''}>${product.short_desc}</option>`
                    ).join('')}
                </select>
            </div>

            ${selectedProduct ? `
                <!-- Tipo -->
                <div class="config-option">
                    <label>Tipo:</label>
                    <span class="readonly-field">${selectedProduct.category || 'Sin categoría'}</span>
                </div>

                <!-- Descripción corta -->
                <div class="config-option">
                    <label>Descripción corta:</label>
                    <input type="text" value="${selectedProduct.short_desc || ''}" 
                           placeholder="Descripción del producto..." 
                           onchange="window.studioManager.updateProductDescription(this.value)">
                </div>

                <!-- Bloque de checkboxes -->
                <div class="config-option">
                    <label>Elementos a destacar:</label>
                    <div class="checkbox-group">
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedProduct.benefits ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleProductElement('benefits', this.checked)">
                            <span>Beneficios</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedProduct.differentiators ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleProductElement('differentiators', this.checked)">
                            <span>Diferenciadores</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedProduct.usage_steps ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleProductElement('usage_steps', this.checked)">
                            <span>Pasos de uso</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedProduct.ingredients ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleProductElement('ingredients', this.checked)">
                            <span>Ingredientes</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedProduct.price ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleProductElement('price', this.checked)">
                            <span>Precio</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedProduct.variants ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleProductElement('variants', this.checked)">
                            <span>Variantes</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedProduct.availability ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleProductElement('availability', this.checked)">
                            <span>Disponibilidad</span>
                        </label>
                    </div>
                </div>

                <!-- Nombre (no editable) -->
                <div class="config-option">
                    <label>Nombre:</label>
                    <span class="readonly-field">${selectedProduct.name || 'Sin nombre'}</span>
                </div>

                <!-- Imágenes -->
                <div class="config-option">
                    <label>Imágenes:</label>
                    <div class="image-slots">
                        <div class="image-slot">
                            ${selectedProduct.main_image_id ? 
                                `<img src="data:image/jpeg;base64,${selectedProduct.main_image_id}" alt="Imagen 1" class="preview-image">` : 
                                '<div class="no-image">➕ Agregar</div>'
                            }
                        </div>
                        <div class="image-slot">
                            ${selectedProduct.gallery_file_ids?.[0] ? 
                                `<img src="data:image/jpeg;base64,${selectedProduct.gallery_file_ids[0]}" alt="Imagen 2" class="preview-image">` : 
                                '<div class="no-image">➕ Agregar</div>'
                            }
                        </div>
                        <div class="image-slot">
                            ${selectedProduct.gallery_file_ids?.[1] ? 
                                `<img src="data:image/jpeg;base64,${selectedProduct.gallery_file_ids[1]}" alt="Imagen 3" class="preview-image">` : 
                                '<div class="no-image">➕ Agregar</div>'
                            }
                        </div>
                        <div class="image-slot">
                            ${selectedProduct.gallery_file_ids?.[2] ? 
                                `<img src="data:image/jpeg;base64,${selectedProduct.gallery_file_ids[2]}" alt="Imagen 4" class="preview-image">` : 
                                '<div class="no-image">➕ Agregar</div>'
                            }
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Botón nuevo producto -->
            <div class="config-option">
                <button class="btn btn-secondary" onclick="window.studioManager.createNewProduct()">
                    ➕ Nuevo producto
                </button>
            </div>
        `;
    }

    createOfferCardContent() {
        const selectedOffer = this.studioConfig.offer;
        
        return `
            <h4>🔹 Oferta</h4>
            
            <!-- Dropdown de selección de oferta -->
            <div class="config-option">
                <label>Seleccionar oferta:</label>
                <select id="offer-selector" onchange="window.studioManager.selectOfferFromDropdown(this.value)">
                    <option value="">Seleccionar oferta...</option>
                    ${this.offers.map(offer => 
                        `<option value="${offer.id}" ${selectedOffer?.id === offer.id ? 'selected' : ''}>${offer.title}</option>`
                    ).join('')}
                </select>
            </div>

            ${selectedOffer ? `
                <!-- Objetivo principal -->
                <div class="config-option">
                    <label>Objetivo principal:</label>
                    <input type="text" value="${selectedOffer.objective || ''}" 
                           placeholder="Objetivo de la oferta..." 
                           onchange="window.studioManager.updateOfferObjective(this.value)">
                </div>

                <!-- Descuento -->
                <div class="config-option">
                    <label>Descuento (%):</label>
                    <input type="number" value="${selectedOffer.discount || ''}" 
                           placeholder="0" min="0" max="100" 
                           onchange="window.studioManager.updateOfferDiscount(this.value)">
                </div>

                <!-- Validez -->
                <div class="config-option">
                    <label>Validez hasta:</label>
                    <input type="date" value="${selectedOffer.valid_until || ''}" 
                           onchange="window.studioManager.updateOfferValidity(this.value)">
                </div>

                <!-- CTA -->
                <div class="config-option">
                    <label>Call to Action:</label>
                    <input type="text" value="${selectedOffer.cta || ''}" 
                           placeholder="Ej: ¡Compra ahora!" 
                           onchange="window.studioManager.updateOfferCTA(this.value)">
                </div>

                <!-- URL de CTA -->
                <div class="config-option">
                    <label>URL de CTA:</label>
                    <input type="url" value="${selectedOffer.cta_url || ''}" 
                           placeholder="https://..." 
                           onchange="window.studioManager.updateOfferCTAUrl(this.value)">
                </div>

                <!-- Identificadores (tags) -->
                <div class="config-option">
                    <label>Identificadores:</label>
                    <input type="text" value="${selectedOffer.tags?.join(', ') || ''}" 
                           placeholder="Separados por comas..." 
                           onchange="window.studioManager.updateOfferTags(this.value)">
                </div>

                <!-- Botones de acción -->
                <div class="config-option button-group">
                    <button class="btn btn-secondary" onclick="window.studioManager.createNewOffer()">
                        ➕ Crear nueva oferta
                    </button>
                    <button class="btn btn-danger" onclick="window.studioManager.removeOffer()">
                        ❌ Quitar oferta
                    </button>
                </div>
            ` : `
                <!-- Sin oferta seleccionada -->
                <div class="config-option">
                    <button class="btn btn-primary" onclick="window.studioManager.createNewOffer()">
                        ➕ Crear nueva oferta
                    </button>
                </div>
            `}
        `;
    }

    createAudienceCardContent() {
        const selectedAudience = this.studioConfig.audience;
        
        return `
            <h4>🔹 Audiencia</h4>
            
            <!-- Dropdown de selección de audiencia -->
            <div class="config-option">
                <label>Seleccionar audiencia:</label>
                <select id="audience-selector" onchange="window.studioManager.selectAudienceFromDropdown(this.value)">
                    <option value="">Seleccionar audiencia...</option>
                    ${this.audience ? `<option value="${this.audience.id}" selected>${this.audience.full_name}</option>` : ''}
                </select>
            </div>

            ${selectedAudience ? `
                <!-- Comprador-persona -->
                <div class="config-option">
                    <label>Comprador-persona:</label>
                    <input type="text" value="${selectedAudience.persona || ''}" 
                           placeholder="Descripción del comprador ideal..." 
                           onchange="window.studioManager.updateAudiencePersona(this.value)">
                </div>

                <!-- Intereses -->
                <div class="config-option">
                    <label>Intereses:</label>
                    <div class="checkbox-group">
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.interests?.includes('tecnologia') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceInterest('tecnologia', this.checked)">
                            <span>Tecnología</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.interests?.includes('moda') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceInterest('moda', this.checked)">
                            <span>Moda</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.interests?.includes('deportes') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceInterest('deportes', this.checked)">
                            <span>Deportes</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.interests?.includes('viajes') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceInterest('viajes', this.checked)">
                            <span>Viajes</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.interests?.includes('cocina') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceInterest('cocina', this.checked)">
                            <span>Cocina</span>
                        </label>
                    </div>
                </div>

                <!-- Esfuerzos/Dolores -->
                <div class="config-option">
                    <label>Esfuerzos/Dolores:</label>
                    <div class="checkbox-group">
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.pains?.includes('tiempo') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudiencePain('tiempo', this.checked)">
                            <span>Falta de tiempo</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.pains?.includes('dinero') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudiencePain('dinero', this.checked)">
                            <span>Presupuesto limitado</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.pains?.includes('conocimiento') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudiencePain('conocimiento', this.checked)">
                            <span>Falta de conocimiento</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.pains?.includes('confianza') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudiencePain('confianza', this.checked)">
                            <span>Falta de confianza</span>
                        </label>
                    </div>
                </div>

                <!-- Contexto -->
                <div class="config-option">
                    <label>Contexto:</label>
                    <div class="checkbox-group">
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.contexts?.includes('trabajo') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceContext('trabajo', this.checked)">
                            <span>Trabajo</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.contexts?.includes('casa') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceContext('casa', this.checked)">
                            <span>Casa</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.contexts?.includes('movil') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceContext('movil', this.checked)">
                            <span>Móvil</span>
                        </label>
                        <label class="checkbox-item">
                            <input type="checkbox" ${selectedAudience.contexts?.includes('social') ? 'checked' : ''} 
                                   onchange="window.studioManager.toggleAudienceContext('social', this.checked)">
                            <span>Redes sociales</span>
                        </label>
                    </div>
                </div>

                <!-- Idiomas -->
                <div class="config-option">
                    <label>Idiomas:</label>
                    <div class="multi-select">
                        <select multiple onchange="window.studioManager.updateAudienceLanguages(this.selectedOptions)">
                            <option value="es" ${selectedAudience.languages?.includes('es') ? 'selected' : ''}>Español</option>
                            <option value="en" ${selectedAudience.languages?.includes('en') ? 'selected' : ''}>Inglés</option>
                            <option value="fr" ${selectedAudience.languages?.includes('fr') ? 'selected' : ''}>Francés</option>
                            <option value="pt" ${selectedAudience.languages?.includes('pt') ? 'selected' : ''}>Portugués</option>
                        </select>
                    </div>
                </div>

                <!-- Botones de acción -->
                <div class="config-option button-group">
                    <button class="btn btn-secondary" onclick="window.studioManager.createNewAudience()">
                        ➕ Nueva audiencia
                    </button>
                    <button class="btn btn-danger" onclick="window.studioManager.removeAudience()">
                        ❌ Quitar audiencia
                    </button>
                </div>
            ` : `
                <!-- Sin audiencia seleccionada -->
                <div class="config-option">
                    <button class="btn btn-primary" onclick="window.studioManager.createNewAudience()">
                        ➕ Nueva audiencia
                    </button>
                </div>
            `}
        `;
    }

    createCategoryCardContent() {
        const selectedCategory = this.studioConfig.category;
        
        return `
            <h4>🔹 Categoría</h4>
            
            <!-- Selector de categoría -->
            <div class="config-option">
                <label>Categoría seleccionada:</label>
                <span class="readonly-field">${selectedCategory || 'Ninguna'}</span>
            </div>

            <!-- Botón para abrir biblioteca de categorías -->
            <div class="config-option">
                <button class="btn btn-primary" onclick="window.studioManager.openCategoryLibrary()">
                    📚 Abrir biblioteca de categorías
                </button>
            </div>

            <!-- Categorías populares -->
            <div class="config-option">
                <label>Categorías populares:</label>
                <div class="category-tags">
                    <span class="category-tag" onclick="window.studioManager.selectCategory('Tecnología')">Tecnología</span>
                    <span class="category-tag" onclick="window.studioManager.selectCategory('Moda')">Moda</span>
                    <span class="category-tag" onclick="window.studioManager.selectCategory('Belleza')">Belleza</span>
                    <span class="category-tag" onclick="window.studioManager.selectCategory('Hogar')">Hogar</span>
                    <span class="category-tag" onclick="window.studioManager.selectCategory('Deportes')">Deportes</span>
                    <span class="category-tag" onclick="window.studioManager.selectCategory('Alimentación')">Alimentación</span>
                    <span class="category-tag" onclick="window.studioManager.selectCategory('Salud')">Salud</span>
                    <span class="category-tag" onclick="window.studioManager.selectCategory('Entretenimiento')">Entretenimiento</span>
                </div>
            </div>

            <!-- Búsqueda de categoría -->
            <div class="config-option">
                <label>Buscar categoría:</label>
                <input type="text" placeholder="Escribir para buscar..." 
                       onkeyup="window.studioManager.searchCategories(this.value)">
            </div>
        `;
    }

    createFormatCardContent() {
        return `
            <h4>Configuración de Formato</h4>
            <div class="config-option">
                <label>Tipo de video:</label>
                <select>
                    <option value="vertical">Vertical (TikTok/Reels)</option>
                    <option value="horizontal">Horizontal (YouTube)</option>
                    <option value="cuadrado">Cuadrado (Instagram)</option>
                </select>
            </div>
            <div class="config-option">
                <label>Duración:</label>
                <select>
                    <option value="15">15 segundos</option>
                    <option value="30">30 segundos</option>
                    <option value="60">1 minuto</option>
                    <option value="120">2 minutos</option>
                </select>
            </div>
        `;
    }

    createAestheticsCardContent() {
        return `
            <h4>Configuración de Estética</h4>
            <div class="config-option">
                <label>Iluminación:</label>
                <select>
                    <option value="natural">Natural</option>
                    <option value="estudio">Estudio</option>
                    <option value="dramatica">Dramática</option>
                </select>
            </div>
            <div class="config-option">
                <label>Música de fondo:</label>
                <input type="checkbox" checked>
            </div>
        `;
    }

    createScenariosCardContent() {
        return `
            <h4>Configuración de Escenarios</h4>
            <div class="config-option">
                <label>Ubicación:</label>
                <select>
                    <option value="casa">Casa</option>
                    <option value="oficina">Oficina</option>
                    <option value="exterior">Exterior</option>
                    <option value="tienda">Tienda</option>
                </select>
            </div>
            <div class="config-option">
                <label>Ambiente:</label>
                <select>
                    <option value="relajado">Relajado</option>
                    <option value="profesional">Profesional</option>
                    <option value="casual">Casual</option>
                </select>
            </div>
        `;
    }

    createGenerateCardContent() {
        return `
            <h4>Generar Guiones</h4>
            <div class="config-option">
                <label>Cantidad de guiones:</label>
                <select>
                    <option value="1">1 guión</option>
                    <option value="3">3 guiones</option>
                    <option value="5">5 guiones</option>
                    <option value="10">10 guiones</option>
                </select>
            </div>
            <div class="config-option">
                <label>Creatividad:</label>
                <input type="range" min="0" max="100" value="50">
            </div>
            <button class="btn btn-primary" style="width: 100%; margin-top: 12px;" onclick="window.studioManager.handleGenerateScripts()">
                Generar Ahora
            </button>
        `;
    }

    createDefaultCardContent(panelType) {
        return `
            <h4>Configuración de ${panelType.charAt(0).toUpperCase() + panelType.slice(1)}</h4>
            <div class="config-option">
                <label>Opción 1:</label>
                <input type="checkbox">
            </div>
            <div class="config-option">
                <label>Opción 2:</label>
                <input type="checkbox">
            </div>
        `;
    }

    // =======================================
    // Funciones de manejo de interacciones
    // =======================================

    // Funciones para Marca
    selectBrandFromDropdown(brandId) {
        const brand = this.brands.find(b => b.id === brandId);
        if (brand) {
            // Actualizar configuración
            this.studioConfig.brand = brand;
            console.log('Marca seleccionada:', brand);
            
            // Actualizar campos del sidebar
            this.updateBrandFields(brand);
        }
    }

    updateBrandFields(brand) {
        console.log('=== ACTUALIZANDO CAMPOS DE MARCA ===');
        console.log('Datos de marca recibidos:', brand);
        
        // Actualizar campos del sidebar integrado
        const brandName = document.getElementById('brand-name');
        const brandTone = document.getElementById('brand-tone');
        const brandKeywords = document.getElementById('brand-keywords');
        const brandProhibited = document.getElementById('brand-prohibited');
        const brandReferences = document.getElementById('brand-references');
        const brandLogoPreview = document.getElementById('brand-logo-preview');

        console.log('Elementos HTML encontrados:');
        console.log('- brandName:', !!brandName);
        console.log('- brandTone:', !!brandTone);
        console.log('- brandKeywords:', !!brandKeywords);
        console.log('- brandProhibited:', !!brandProhibited);
        console.log('- brandReferences:', !!brandReferences);
        console.log('- brandLogoPreview:', !!brandLogoPreview);

        if (brandName) {
            brandName.textContent = brand.name || 'Sin nombre';
            console.log('Nombre actualizado:', brand.name);
        }
        
        // Los datos ya vienen de brand_guidelines
        if (brandTone) {
            brandTone.value = brand.tone_of_voice || '';
            console.log('Tono actualizado:', brand.tone_of_voice);
        }
        if (brandKeywords) {
            brandKeywords.value = brand.keywords_yes?.join(', ') || '';
            console.log('Keywords actualizadas:', brand.keywords_yes);
        }
        if (brandProhibited) {
            brandProhibited.value = brand.keywords_no?.join(', ') || '';
            console.log('Palabras prohibidas actualizadas:', brand.keywords_no);
        }
        
        if (brandReferences) {
            if (brand.reference_links && brand.reference_links.length > 0) {
                brandReferences.innerHTML = brand.reference_links.map(link => 
                    `<a href="${link}" target="_blank" class="reference-link">${link}</a>`
                ).join('');
                console.log('Enlaces de referencia actualizados:', brand.reference_links);
            } else {
                brandReferences.innerHTML = '<span class="no-links">Sin enlaces</span>';
            }
        }

        // Actualizar logo
        if (brandLogoPreview) {
            if (brand.logo_file_id) {
                console.log('Cargando logo con ID:', brand.logo_file_id);
                // Cargar imagen desde Supabase
                this.loadBrandLogo(brand.logo_file_id, brandLogoPreview);
            } else {
                console.log('No hay logo_file_id para esta marca');
                brandLogoPreview.innerHTML = '<div class="no-image">Sin logo</div>';
            }
        }
    }

    async loadBrandLogo(logoFileId, container) {
        try {
            console.log('Iniciando carga de logo con ID:', logoFileId);
            const logoBase64 = await this.supabaseFileToBase64(logoFileId);
            console.log('Logo cargado (base64 length):', logoBase64 ? logoBase64.length : 0);
            
            if (logoBase64) {
                // Detectar el tipo de imagen basado en el header del base64
                const imageType = this.detectImageType(logoBase64);
                const dataUrl = `data:image/${imageType};base64,${logoBase64}`;
                
                container.innerHTML = `<img src="${dataUrl}" alt="Logo" class="preview-image">`;
                console.log('Logo mostrado en el contenedor con tipo:', imageType);
            } else {
                container.innerHTML = '<div class="no-image">Sin logo</div>';
                console.log('No se pudo cargar el logo');
            }
        } catch (error) {
            console.error('Error loading brand logo:', error);
            container.innerHTML = '<div class="no-image">Error cargando logo</div>';
        }
    }

    updateBrandTone(tone) {
        if (this.studioConfig.brand) {
            // Actualizar tono de voz en la configuración
            console.log('Actualizando tono de voz:', tone);
        }
    }

    updateBrandKeywords(keywords) {
        if (this.studioConfig.brand) {
            // Actualizar palabras clave en la configuración
            console.log('Actualizando palabras clave:', keywords);
        }
    }

    updateBrandProhibited(prohibited) {
        if (this.studioConfig.brand) {
            // Actualizar palabras prohibidas en la configuración
            console.log('Actualizando palabras prohibidas:', prohibited);
        }
    }

    // Funciones para Producto
    selectProductFromDropdown(productId) {
        const product = this.products.find(p => p.id === productId);
        if (product) {
            // Actualizar configuración
            this.studioConfig.product = product;
            console.log('Producto seleccionado:', product);
            
            // Actualizar campos del sidebar
            this.updateProductFields(product);
        }
    }

    updateProductFields(product) {
        console.log('=== ACTUALIZANDO CAMPOS DE PRODUCTO ===');
        console.log('Datos de producto recibidos:', product);
        
        // Actualizar campos del sidebar integrado
        const productType = document.getElementById('product-type');
        const productDescription = document.getElementById('product-description');
        const productName = document.getElementById('product-name');

        console.log('Elementos HTML encontrados:');
        console.log('- productType:', !!productType);
        console.log('- productDescription:', !!productDescription);
        console.log('- productName:', !!productName);
        const productBenefits = document.getElementById('product-benefits');
        const productDifferentiators = document.getElementById('product-differentiators');
        const productUsageSteps = document.getElementById('product-usage-steps');
        const productIngredients = document.getElementById('product-ingredients');
        const productPrice = document.getElementById('product-price');
        const productVariants = document.getElementById('product-variants');
        const productAvailability = document.getElementById('product-availability');

        if (productType) productType.textContent = product.product_type || 'Sin categoría';
        if (productDescription) productDescription.value = product.short_desc || '';
        if (productName) productName.textContent = product.name || 'Sin nombre';

        // Actualizar checkboxes basados en arrays de Supabase
        if (productBenefits) productBenefits.checked = product.benefits && product.benefits.length > 0;
        if (productDifferentiators) productDifferentiators.checked = product.differentiators && product.differentiators.length > 0;
        if (productUsageSteps) productUsageSteps.checked = product.usage_steps && product.usage_steps.length > 0;
        if (productIngredients) productIngredients.checked = product.ingredients && product.ingredients.length > 0;
        if (productPrice) productPrice.checked = !!product.price;
        if (productVariants) productVariants.checked = product.variants && product.variants.length > 0;
        if (productAvailability) productAvailability.checked = !!product.availability;

        // Actualizar imágenes
        this.updateProductImages(product);
    }

    updateProductImages(product) {
        const imageSlots = [
            document.getElementById('product-image-1'),
            document.getElementById('product-image-2'),
            document.getElementById('product-image-3'),
            document.getElementById('product-image-4')
        ];

        // Imagen principal
        if (imageSlots[0]) {
            if (product.main_image_id) {
                this.loadProductImage(product.main_image_id, imageSlots[0]);
            } else {
                imageSlots[0].innerHTML = '<div class="no-image">➕ Agregar</div>';
            }
        }

        // Galería de imágenes
        if (product.gallery_file_ids) {
            for (let i = 0; i < Math.min(product.gallery_file_ids.length, 3); i++) {
                if (imageSlots[i + 1]) {
                    this.loadProductImage(product.gallery_file_ids[i], imageSlots[i + 1]);
                }
            }
        }

        // Llenar slots vacíos
        for (let i = (product.gallery_file_ids?.length || 0) + 1; i < 4; i++) {
            if (imageSlots[i]) {
                imageSlots[i].innerHTML = '<div class="no-image">➕ Agregar</div>';
            }
        }
    }

    async loadProductImage(imageFileId, container) {
        try {
            console.log('Cargando imagen de producto con ID:', imageFileId);
            const imageBase64 = await this.supabaseFileToBase64(imageFileId);
            console.log('Imagen cargada (base64 length):', imageBase64 ? imageBase64.length : 0);
            
            if (imageBase64) {
                // Detectar el tipo de imagen basado en el header del base64
                const imageType = this.detectImageType(imageBase64);
                const dataUrl = `data:image/${imageType};base64,${imageBase64}`;
                
                container.innerHTML = `<img src="${dataUrl}" alt="Imagen" class="preview-image">`;
                console.log('Imagen mostrada en el contenedor con tipo:', imageType);
            } else {
                container.innerHTML = '<div class="no-image">➕ Agregar</div>';
                console.log('No se pudo cargar la imagen');
            }
        } catch (error) {
            console.error('Error loading product image:', error);
            container.innerHTML = '<div class="no-image">Error cargando imagen</div>';
        }
    }

    updateProductDescription(description) {
        if (this.studioConfig.product) {
            this.studioConfig.product.short_desc = description;
            console.log('Actualizando descripción del producto:', description);
        }
    }

    toggleProductElement(element, checked) {
        if (this.studioConfig.product) {
            this.studioConfig.product[element] = checked;
            console.log(`Elemento ${element} del producto:`, checked);
        }
    }

    // Funciones para Oferta
    selectOfferFromDropdown(offerId) {
        const offer = this.offers.find(o => o.id === offerId);
        if (offer) {
            // Actualizar configuración
            this.studioConfig.offer = offer;
            console.log('Oferta seleccionada:', offer);
            
            // Actualizar campos del sidebar
            this.updateOfferFields(offer);
        }
    }

    updateOfferFields(offer) {
        console.log('=== ACTUALIZANDO CAMPOS DE OFERTA ===');
        console.log('Datos de oferta recibidos:', offer);
        
        // Actualizar campos del sidebar integrado
        const offerObjective = document.getElementById('offer-objective');
        const offerDiscount = document.getElementById('offer-discount');
        const offerValidity = document.getElementById('offer-validity');
        const offerCTA = document.getElementById('offer-cta');
        const offerCTAUrl = document.getElementById('offer-cta-url');
        const offerTags = document.getElementById('offer-tags');

        console.log('Elementos HTML encontrados:');
        console.log('- offerObjective:', !!offerObjective);
        console.log('- offerDiscount:', !!offerDiscount);
        console.log('- offerValidity:', !!offerValidity);
        console.log('- offerCTA:', !!offerCTA);
        console.log('- offerCTAUrl:', !!offerCTAUrl);
        console.log('- offerTags:', !!offerTags);

        if (offerObjective) offerObjective.value = offer.main_objective || '';
        if (offerDiscount) offerDiscount.value = offer.kpis?.discount || '';
        if (offerValidity) offerValidity.value = offer.offer_valid_until || '';
        if (offerCTA) offerCTA.value = offer.cta || '';
        if (offerCTAUrl) offerCTAUrl.value = offer.cta_url || '';
        if (offerTags) offerTags.value = offer.kpis?.tags?.join(', ') || '';
    }

    updateOfferObjective(objective) {
        if (this.studioConfig.offer) {
            this.studioConfig.offer.objective = objective;
            console.log('Actualizando objetivo de la oferta:', objective);
        }
    }

    updateOfferDiscount(discount) {
        if (this.studioConfig.offer) {
            this.studioConfig.offer.discount = parseInt(discount);
            console.log('Actualizando descuento de la oferta:', discount);
        }
    }

    updateOfferValidity(validity) {
        if (this.studioConfig.offer) {
            this.studioConfig.offer.valid_until = validity;
            console.log('Actualizando validez de la oferta:', validity);
        }
    }

    updateOfferCTA(cta) {
        if (this.studioConfig.offer) {
            this.studioConfig.offer.cta = cta;
            console.log('Actualizando CTA de la oferta:', cta);
        }
    }

    updateOfferCTAUrl(url) {
        if (this.studioConfig.offer) {
            this.studioConfig.offer.cta_url = url;
            console.log('Actualizando URL de CTA de la oferta:', url);
        }
    }

    updateOfferTags(tags) {
        if (this.studioConfig.offer) {
            this.studioConfig.offer.tags = tags.split(',').map(tag => tag.trim());
            console.log('Actualizando tags de la oferta:', tags);
        }
    }

    removeOffer() {
        this.studioConfig.offer = null;
        this.closeConfigCard();
        this.showNotification('Oferta removida', 'info');
    }

    // Funciones para Audiencia
    selectAudienceFromDropdown(audienceId) {
        const audience = this.audience.find(a => a.id === audienceId);
        if (audience) {
            // Actualizar configuración
            this.studioConfig.audience = audience;
            console.log('Audiencia seleccionada:', audience);
            
            // Actualizar campos del sidebar
            this.updateAudienceFields(audience);
        }
    }

    updateAudienceFields(audience) {
        console.log('=== ACTUALIZANDO CAMPOS DE AUDIENCIA ===');
        console.log('Datos de audiencia recibidos:', audience);
        
        // Actualizar campos del sidebar integrado
        const audiencePersona = document.getElementById('audience-persona');
        const audienceLanguages = document.getElementById('audience-languages');

        console.log('Elementos HTML encontrados:');
        console.log('- audiencePersona:', !!audiencePersona);
        console.log('- audienceLanguages:', !!audienceLanguages);

        if (audiencePersona) audiencePersona.value = audience.buyer_persona?.description || '';
        
        // Actualizar checkboxes de intereses
        if (audience.interests) {
            audience.interests.forEach(interest => {
                const checkbox = document.getElementById(`interest-${interest}`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // Actualizar checkboxes de dolores
        if (audience.pains) {
            audience.pains.forEach(pain => {
                const checkbox = document.getElementById(`pain-${pain}`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // Actualizar checkboxes de contexto
        if (audience.contexts) {
            audience.contexts.forEach(context => {
                const checkbox = document.getElementById(`context-${context}`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // Actualizar idiomas
        if (audienceLanguages && audience.language_codes) {
            Array.from(audienceLanguages.options).forEach(option => {
                option.selected = audience.language_codes.includes(option.value);
            });
        }
    }

    updateAudiencePersona(persona) {
        if (this.studioConfig.audience) {
            this.studioConfig.audience.persona = persona;
            console.log('Actualizando persona de audiencia:', persona);
        }
    }

    toggleAudienceInterest(interest, checked) {
        if (this.studioConfig.audience) {
            if (!this.studioConfig.audience.interests) {
                this.studioConfig.audience.interests = [];
            }
            if (checked) {
                this.studioConfig.audience.interests.push(interest);
            } else {
                this.studioConfig.audience.interests = this.studioConfig.audience.interests.filter(i => i !== interest);
            }
            console.log('Intereses de audiencia:', this.studioConfig.audience.interests);
        }
    }

    toggleAudiencePain(pain, checked) {
        if (this.studioConfig.audience) {
            if (!this.studioConfig.audience.pains) {
                this.studioConfig.audience.pains = [];
            }
            if (checked) {
                this.studioConfig.audience.pains.push(pain);
            } else {
                this.studioConfig.audience.pains = this.studioConfig.audience.pains.filter(p => p !== pain);
            }
            console.log('Dolores de audiencia:', this.studioConfig.audience.pains);
        }
    }

    toggleAudienceContext(context, checked) {
        if (this.studioConfig.audience) {
            if (!this.studioConfig.audience.contexts) {
                this.studioConfig.audience.contexts = [];
            }
            if (checked) {
                this.studioConfig.audience.contexts.push(context);
            } else {
                this.studioConfig.audience.contexts = this.studioConfig.audience.contexts.filter(c => c !== context);
            }
            console.log('Contextos de audiencia:', this.studioConfig.audience.contexts);
        }
    }

    updateAudienceLanguages(selectedOptions) {
        if (this.studioConfig.audience) {
            this.studioConfig.audience.languages = Array.from(selectedOptions).map(option => option.value);
            console.log('Idiomas de audiencia:', this.studioConfig.audience.languages);
        }
    }

    removeAudience() {
        this.studioConfig.audience = null;
        this.closeConfigCard();
        this.showNotification('Audiencia removida', 'info');
    }

    // Funciones para Categoría
    selectCategory(category) {
        this.studioConfig.category = category;
        this.closeConfigCard();
        this.showNotification(`Categoría seleccionada: ${category}`, 'success');
    }

    openCategoryLibrary() {
        // Implementar ventana flotante de biblioteca de categorías
        this.showNotification('Abriendo biblioteca de categorías...', 'info');
    }

    searchCategories(query) {
        // Implementar búsqueda de categorías
        console.log('Buscando categorías:', query);
    }

    // Funciones de creación
    createNewBrand() {
        this.showNotification('Creando nueva marca...', 'info');
    }

    createNewProduct() {
        this.showNotification('Creando nuevo producto...', 'info');
    }

    createNewOffer() {
        this.showNotification('Creando nueva oferta...', 'info');
    }

    createNewAudience() {
        this.showNotification('Creando nueva audiencia...', 'info');
    }

    toggleMainNavigation() {
        const sideNavigation = document.getElementById('sideNavigation');
        const navOverlay = document.getElementById('navOverlay');
        
        if (sideNavigation && navOverlay) {
            sideNavigation.classList.toggle('nav-open');
            navOverlay.classList.toggle('active');
        }
    }

    closeMainNavigation() {
        const sideNavigation = document.getElementById('sideNavigation');
        const navOverlay = document.getElementById('navOverlay');
        
        if (sideNavigation && navOverlay) {
            sideNavigation.classList.remove('nav-open');
            navOverlay.classList.remove('active');
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
        
        // Actualizar UI para mostrar marca seleccionada
        this.updateBrandUI(brand);
        
        // Cargar detalles de la marca seleccionada
        this.loadBrandDetails(brand);
    }

    updateProductSelection(product) {
        console.log('Producto seleccionado:', product);
        
        // Actualizar UI para mostrar producto seleccionado
        this.updateProductUI(product);
        
        // Cargar detalles del producto seleccionado
        this.loadProductDetails(product);
    }

    updateOfferSelection(offer) {
        console.log('Oferta seleccionada:', offer);
        
        // Actualizar UI para mostrar oferta seleccionada
        this.updateOfferUI(offer);
        
        // Cargar detalles de la oferta seleccionada
        this.loadOfferDetails(offer);
    }

    updateStyleSelection(style) {
        console.log('Estilo seleccionado:', style);
        this.updateStyleUI(style);
    }

    updateConfigDisplay() {
        console.log('Configuración actual:', this.studioConfig);
        
        // Mostrar resumen de configuración en el canvas
        this.displayConfigSummary();
    }

    // =======================================
    // Funciones de actualización de UI
    // =======================================

    updateBrandUI(brand) {
        // Actualizar indicadores visuales de marca seleccionada
        document.querySelectorAll('.brand-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const selectedCard = document.querySelector(`[data-brand="${brand.id}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
    }

    updateProductUI(product) {
        // Actualizar indicadores visuales de producto seleccionado
        document.querySelectorAll('.product-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`[data-product="${product.id}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    }

    updateOfferUI(offer) {
        // Actualizar indicadores visuales de oferta seleccionada
        document.querySelectorAll('.offer-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`[data-offer="${offer.id}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    }

    updateStyleUI(style) {
        // Actualizar indicadores visuales de estilo seleccionado
        document.querySelectorAll('.style-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const selectedCard = document.querySelector(`[data-style="${style.id}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
    }

    displayConfigSummary() {
        const canvasArea = document.querySelector('.canvas-area');
        if (!canvasArea) return;

        // Canvas vacío - solo mostrar placeholder
        canvasArea.innerHTML = `
            <div class="canvas-placeholder">
                <i data-lucide="monitor" class="placeholder-icon"></i>
                <span class="placeholder-text">Canvas de Preview</span>
            </div>
        `;
        
        // Re-inicializar iconos
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }


    // =======================================
    // Funciones de carga de detalles
    // =======================================

    loadBrandDetails(brand) {
        // Cargar detalles específicos de la marca seleccionada
        const brandGuidelines = this.brandGuidelines.find(g => g.project_id === brand.id);
        if (brandGuidelines) {
            this.studioConfig.brandGuidelines = brandGuidelines;
        }
    }

    loadProductDetails(product) {
        // Cargar detalles específicos del producto seleccionado
        console.log('Cargando detalles del producto:', product);
    }

    loadOfferDetails(offer) {
        // Cargar detalles específicos de la oferta seleccionada
        console.log('Cargando detalles de la oferta:', offer);
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

    renderBrandGuidelines() {
        // Renderizar guías de marca en el modal de marca
        console.log('Renderizando guías de marca:', this.brandGuidelines);
    }

    renderCompliance() {
        // Renderizar configuraciones de cumplimiento
        console.log('Renderizando cumplimiento:', this.compliance);
    }

    renderDistribution() {
        // Renderizar configuraciones de distribución
        console.log('Renderizando distribución:', this.distribution);
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
        this.updateConfigDisplay();
    }

    selectScenario(scenario) {
        this.studioConfig.scenario = scenario;
        this.showNotification('Escenario seleccionado', 'success');
        this.updateConfigDisplay();
    }

    // =======================================
    // Administración de configuraciones y envío al webhook
    // =======================================

    // Función para convertir archivo a base64 (solo el string base64)
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result;
                // Extraer solo el base64 sin el prefijo data:image/...
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    // Función para convertir archivo a data URL completa
    async fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    // Función para obtener archivos de Supabase Storage
    async getFileFromSupabase(fileId) {
        try {
            if (!this.supabase) {
                console.error('Supabase no está inicializado');
                return null;
            }
            
            console.log('Obteniendo información del archivo:', fileId);
            
            // Primero obtener la información del archivo desde la tabla files
            const { data: fileInfo, error: fileError } = await this.supabase
                .from('files')
                .select('path, bucket')
                .eq('id', fileId)
                .single();
            
            if (fileError || !fileInfo) {
                console.error('Error getting file info:', fileError);
                return null;
            }
            
            console.log('Información del archivo:', fileInfo);
            
            // Descargar el archivo desde el bucket correcto
            const bucket = fileInfo.bucket || 'ugc-assets';
            console.log('Descargando desde bucket:', bucket, 'path:', fileInfo.path);
            
            const { data, error } = await this.supabase.storage
                .from(bucket)
                .download(fileInfo.path);
            
            if (error) {
                console.error('Error downloading file:', error);
                return null;
            }
            
            console.log('Archivo descargado exitosamente:', fileId);
            return data;
        } catch (error) {
            console.error('Error getting file from Supabase:', error);
            return null;
        }
    }

    // Función para detectar el tipo de imagen basado en el header del base64
    detectImageType(base64String) {
        if (!base64String) return 'jpeg';
        
        // Los primeros caracteres del base64 indican el tipo de archivo
        const header = base64String.substring(0, 10);
        
        if (header.startsWith('/9j/') || header.startsWith('/9j4')) {
            return 'jpeg';
        } else if (header.startsWith('iVBORw0KGgo')) {
            return 'png';
        } else if (header.startsWith('R0lGOD')) {
            return 'gif';
        } else if (header.startsWith('UklGR')) {
            return 'webp';
        } else {
            // Por defecto, asumir JPEG
            return 'jpeg';
        }
    }

    // Función para convertir archivo de Supabase a base64
    async supabaseFileToBase64(fileId) {
        try {
            const file = await this.getFileFromSupabase(fileId);
            if (!file) return null;
            
            return await this.fileToBase64(file);
        } catch (error) {
            console.error('Error converting Supabase file to base64:', error);
            return null;
        }
    }

    async generateConfigJSON() {
        console.log('=== GENERANDO CONFIGURACIÓN JSON ===');
        console.log('Brand:', this.studioConfig.brand);
        console.log('Product:', this.studioConfig.product);
        console.log('Offer:', this.studioConfig.offer);
        console.log('UGC:', this.studioConfig.ugc);
        
        // Generar JSON con todas las configuraciones seleccionadas
        const configData = {
            // Metadatos
            timestamp: new Date().toISOString(),
            user_id: this.userId,
            project_id: this.currentProjectId,
            
            // Configuraciones principales
            brand: this.studioConfig.brand ? {
                id: this.studioConfig.brand.id,
                name: this.studioConfig.brand.name,
                country: this.studioConfig.brand.country,
                website: this.studioConfig.brand.website,
                languages: this.studioConfig.brand.languages,
                // Guías de marca
                guidelines: this.studioConfig.brandGuidelines ? {
                    tone_of_voice: this.studioConfig.brandGuidelines.tone_of_voice,
                    keywords_yes: this.studioConfig.brandGuidelines.keywords_yes,
                    keywords_no: this.studioConfig.brandGuidelines.keywords_no,
                    dos_donts: this.studioConfig.brandGuidelines.dos_donts,
                    brand_assets: this.studioConfig.brandGuidelines.brand_assets,
                    reference_links: this.studioConfig.brandGuidelines.reference_links
                } : null,
                // Archivos de la marca (logo, assets)
                files: {
                    logo: null, // Se llenará con base64 si existe
                    assets: []  // Array de archivos base64
                }
            } : null,
            
            product: this.studioConfig.product ? {
                id: this.studioConfig.product.id,
                name: this.studioConfig.product.short_desc,
                benefits: this.studioConfig.product.benefits,
                differentiators: this.studioConfig.product.differentiators,
                ingredients: this.studioConfig.product.ingredients,
                price: this.studioConfig.product.price,
                usage_steps: this.studioConfig.product.usage_steps,
                // Archivos del producto
                files: {
                    main_image: null, // Imagen principal en base64
                    gallery: []       // Galería de imágenes en base64
                }
            } : null,
            
            offer: this.studioConfig.offer ? {
                id: this.studioConfig.offer.id,
                objective: this.studioConfig.offer.main_objective,
                description: this.studioConfig.offer.offer_desc,
                cta: this.studioConfig.offer.cta,
                cta_url: this.studioConfig.offer.cta_url,
                valid_until: this.studioConfig.offer.offer_valid_until
            } : null,
            
            // Configuraciones de audiencia
            audience: this.studioConfig.audience,
            
            // Configuraciones de UGC
            ugc: this.studioConfig.ugc ? {
                id: this.studioConfig.ugc.id,
                type: this.studioConfig.ugc.avatar_type,
                traits: this.studioConfig.ugc.traits,
                energy: this.studioConfig.ugc.energy,
                gender: this.studioConfig.ugc.gender,
                languages: this.studioConfig.ugc.languages,
                values: this.studioConfig.ugc.values,
                // Archivos del avatar
                files: {
                    avatar_image: null, // Imagen del avatar en base64
                    avatar_video: null  // Video del avatar en base64
                }
            } : null,
            
            // Configuraciones estéticas
            aesthetics: {
                ...this.studioConfig.aesthetics,
                // Archivos de música
                files: {
                    music: null // Archivo de música en base64
                }
            },
            
            // Configuraciones de escenarios
            scenario: this.studioConfig.scenario ? {
                id: this.studioConfig.scenario.id,
                location: this.studioConfig.scenario.location,
                ambience: this.studioConfig.scenario.ambience,
                background: this.studioConfig.scenario.background,
                // Archivos de referencia visual
                files: {
                    references: [] // Array de archivos de referencia en base64
                }
            } : null,
            
            // Configuraciones de formato
            format: {
                style: this.studioConfig.style,
                format: this.studioConfig.format,
                location: this.studioConfig.location,
                gender: this.studioConfig.gender,
                age: this.studioConfig.age,
                creativity: this.studioConfig.creativity
            },
            
            // Temas y categoría
            themes: this.studioConfig.themes,
            category: this.studioConfig.category
        };

        // Cargar archivos como base64
        console.log('Cargando archivos como base64...');
        await this.loadFilesAsBase64(configData);
        
        console.log('Configuración final generada:', configData);
        console.log('Tamaño final:', JSON.stringify(configData).length, 'caracteres');

        return configData;
    }

    // Función para cargar todos los archivos como base64
    async loadFilesAsBase64(configData) {
        try {
            // Cargar archivos de la marca
            if (configData.brand) {
                // Buscar logo de la marca en brand_guidelines
                const brandGuidelines = this.brands.find(b => b.id === configData.brand.id);
                if (brandGuidelines && brandGuidelines.logo_file_id) {
                    configData.brand.files.logo = await this.supabaseFileToBase64(brandGuidelines.logo_file_id);
                }
                
                // Buscar assets de la marca
                if (brandGuidelines && brandGuidelines.brand_assets) {
                    for (const assetId of brandGuidelines.brand_assets) {
                        const assetBase64 = await this.supabaseFileToBase64(assetId);
                        if (assetBase64) {
                            configData.brand.files.assets.push(assetBase64);
                        }
                    }
                }

                // Cargar archivos locales de la marca (si el usuario subió archivos)
                await this.loadLocalFiles('brand', configData.brand.files);
            }

            // Cargar archivos del producto
            if (configData.product) {
                const product = this.products.find(p => p.id === configData.product.id);
                if (product) {
                    console.log('Procesando imágenes del producto:', product);
                    
                    // Imagen principal
                    if (product.main_image_id) {
                        console.log('Cargando imagen principal:', product.main_image_id);
                        configData.product.files.main_image = await this.supabaseFileToBase64(product.main_image_id);
                        console.log('Imagen principal cargada:', !!configData.product.files.main_image);
                    }
                    
                    // Galería de imágenes
                    if (product.gallery_file_ids && product.gallery_file_ids.length > 0) {
                        console.log('Cargando galería de imágenes:', product.gallery_file_ids);
                        for (const imageId of product.gallery_file_ids) {
                            const imageBase64 = await this.supabaseFileToBase64(imageId);
                            if (imageBase64) {
                                configData.product.files.gallery.push(imageBase64);
                                console.log('Imagen de galería cargada:', imageId);
                            } else {
                                console.warn('No se pudo cargar imagen de galería:', imageId);
                            }
                        }
                        console.log('Total imágenes en galería:', configData.product.files.gallery.length);
                    }
                }

                // Cargar archivos locales del producto
                await this.loadLocalFiles('producto', configData.product.files);
            }

            // Cargar archivos del UGC
            if (configData.ugc) {
                const ugc = this.ugc.find(u => u.id === configData.ugc.id);
                if (ugc) {
                    // Imagen del avatar
                    if (ugc.avatar_image_id) {
                        configData.ugc.files.avatar_image = await this.supabaseFileToBase64(ugc.avatar_image_id);
                    }
                    
                    // Video del avatar
                    if (ugc.avatar_video_id) {
                        configData.ugc.files.avatar_video = await this.supabaseFileToBase64(ugc.avatar_video_id);
                    }
                }

                // Cargar archivos locales del UGC
                await this.loadLocalFiles('ugc', configData.ugc.files);
            }

            // Cargar archivos de música de estética
            if (configData.aesthetics && this.aesthetics.music_file_id) {
                configData.aesthetics.files.music = await this.supabaseFileToBase64(this.aesthetics.music_file_id);
            }

            // Cargar archivos locales de estética
            await this.loadLocalFiles('estetica', configData.aesthetics.files);

            // Cargar archivos de referencia de escenarios
            if (configData.scenario && this.scenarios.find(s => s.id === configData.scenario.id)) {
                const scenario = this.scenarios.find(s => s.id === configData.scenario.id);
                if (scenario && scenario.reference_file_ids) {
                    for (const refId of scenario.reference_file_ids) {
                        const refBase64 = await this.supabaseFileToBase64(refId);
                        if (refBase64) {
                            configData.scenario.files.references.push(refBase64);
                        }
                    }
                }

                // Cargar archivos locales de escenarios
                await this.loadLocalFiles('escenarios', configData.scenario.files);
            }

        } catch (error) {
            console.error('Error loading files as base64:', error);
        }
    }

    // Función para cargar archivos locales subidos por el usuario
    async loadLocalFiles(section, filesObject) {
        try {
            // Buscar inputs de archivo en los modales
            const modal = document.getElementById(`modal-${section}`);
            if (!modal) return;

            // Buscar todos los inputs de archivo en el modal
            const fileInputs = modal.querySelectorAll('input[type="file"]');
            
            for (const input of fileInputs) {
                if (input.files && input.files.length > 0) {
                    for (const file of input.files) {
                        const base64 = await this.fileToDataURL(file);
                        
                        // Determinar el tipo de archivo basado en el input
                        if (input.id.includes('logo') || input.id.includes('imagen')) {
                            if (filesObject.logo === null) {
                                filesObject.logo = base64;
                            } else {
                                filesObject.assets.push(base64);
                            }
                        } else if (input.id.includes('gallery') || input.id.includes('galeria')) {
                            filesObject.gallery.push(base64);
                        } else if (input.id.includes('video')) {
                            filesObject.avatar_video = base64;
                        } else if (input.id.includes('music') || input.id.includes('musica')) {
                            filesObject.music = base64;
                        } else if (input.id.includes('reference') || input.id.includes('referencia')) {
                            filesObject.references.push(base64);
                        } else {
                            // Archivo genérico
                            filesObject.assets.push(base64);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading local files:', error);
        }
    }


    async sendToWebhook(configData) {
        try {
            // URL del webhook real
            const webhookUrl = 'https://ardeagency.app.n8n.cloud/webhook-test/4635dddf-f8f9-4cc2-be0f-54e1c542d702';
            
            console.log('Enviando datos al webhook:', {
                url: webhookUrl,
                dataSize: JSON.stringify(configData).length,
                userId: this.userId,
                hasSupabase: !!this.supabase
            });
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': this.userId || 'demo-user', // Cambiar a header personalizado
                    'X-Project-ID': this.currentProjectId || 'demo-project'
                },
                body: JSON.stringify(configData)
            });

            console.log('Respuesta del webhook:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error del webhook:', errorText);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('Resultado del webhook:', result);
            this.showNotification('Configuración enviada exitosamente', 'success');
            return result;

        } catch (error) {
            console.error('Error sending to webhook:', error);
            this.showNotification(`Error enviando configuración: ${error.message}`, 'error');
            throw error;
        }
    }


    async handleGenerateScripts() {
        try {
            console.log('=== INICIANDO GENERACIÓN DE GUIONES ===');
            console.log('Configuración actual:', this.studioConfig);
            console.log('Usuario ID:', this.userId);
            console.log('Proyecto ID:', this.currentProjectId);
            console.log('Supabase disponible:', !!this.supabase);

            // Validar configuración mínima
            if (!this.studioConfig.brand) {
                console.warn('No hay marca seleccionada');
                this.showNotification('Selecciona una marca antes de generar guiones', 'error');
                return;
            }

            if (!this.studioConfig.product) {
                console.warn('No hay producto seleccionado');
                this.showNotification('Selecciona un producto antes de generar guiones', 'error');
                return;
            }

            console.log('Configuración válida, generando JSON...');

            // Mostrar loading
            this.showLoading();

            // Generar JSON de configuración con archivos
            const configData = await this.generateConfigJSON();
            console.log('Configuración generada:', configData);
            console.log('Tamaño de la configuración:', JSON.stringify(configData).length, 'caracteres');

            // Enviar al webhook
            console.log('Enviando al webhook...');
            const result = await this.sendToWebhook(configData);
            
            // Mostrar resultado
            this.showScriptsResult(result);

        } catch (error) {
            console.error('Error generating scripts:', error);
            this.showNotification(`Error generando guiones: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    showScriptsResult(result) {
        // Canvas vacío - no mostrar resultado
        const canvasArea = document.querySelector('.canvas-area');
        if (canvasArea) {
            canvasArea.innerHTML = `
                <div class="canvas-placeholder">
                    <i data-lucide="monitor" class="placeholder-icon"></i>
                    <span class="placeholder-text">Canvas de Preview</span>
                </div>
            `;
        }
        
        // Re-inicializar iconos
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    showLoading() {
        // No mostrar loading en el canvas
        console.log('Generando guiones...');
    }

    hideLoading() {
        // No hacer nada - canvas permanece vacío
        console.log('Generación completada');
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

// Función global para logout
function logout() {
    if (window.studioManager && window.studioManager.supabase) {
        window.studioManager.supabase.auth.signOut().then(() => {
            window.location.href = 'login.html';
        });
    } else {
        // Fallback si no hay Supabase
        window.location.href = 'login.html';
    }
}
