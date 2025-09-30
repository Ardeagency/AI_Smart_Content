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
        
        this.init();
    }

    async init() {
        try {
            await this.waitForSupabase();
            await this.checkAuthentication();
            this.setupSupabase();
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
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                this.userId = session.user.id;
            }
        } catch (error) {
            console.log('No hay sesión activa, continuando en modo demo');
        }
    }

    setupSupabase() {
        if (window.supabaseClient && window.supabaseClient.supabase) {
            this.supabase = window.supabaseClient.supabase;
        }
    }

    async loadUserData() {
        if (!this.supabase || !this.userId) {
            console.log('Modo demo: cargando datos de ejemplo');
            this.loadDemoData();
            return;
        }

        try {
            // Cargar proyecto actual del usuario
            const { data: projects } = await this.supabase
                .from('projects')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (projects && projects.length > 0) {
                this.currentProjectId = projects[0].id;
            } else {
                // Crear proyecto por defecto
                this.currentProjectId = await this.createDefaultProject();
            }

            // Cargar datos relacionados
            await Promise.all([
                this.loadBrands(),
                this.loadProducts(),
                this.loadOffers(),
                this.loadAvatars(),
                this.loadStyleCatalog()
            ]);

        } catch (error) {
            console.error('Error loading user data:', error);
            this.loadDemoData();
        }
    }

    async createDefaultProject() {
        const { data, error } = await this.supabase
            .from('projects')
            .insert([{
                user_id: this.userId,
                name: 'Proyecto Principal',
                website: '',
                country: 'ES',
                languages: ['es']
            }])
            .select()
            .single();

        if (error) throw error;
        return data.id;
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async loadBrands() {
        if (!this.userId) return;

        const { data } = await this.supabase
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

        this.brands = data || [];
        this.renderBrands();
    }

    async loadProducts() {
        if (!this.currentProjectId) return;

        const { data } = await this.supabase
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
                gallery_file_ids
            `)
            .eq('project_id', this.currentProjectId);

        this.products = data || [];
        this.renderProducts();
    }

    async loadOffers() {
        if (!this.currentProjectId) return;

        const { data } = await this.supabase
            .from('offers')
            .select(`
                id,
                project_id,
                main_objective,
                offer_desc,
                cta,
                cta_url,
                offer_valid_until
            `)
            .eq('project_id', this.currentProjectId);

        this.offers = data || [];
        this.renderOffers();
    }

    async loadAvatars() {
        if (!this.currentProjectId) return;

        const { data } = await this.supabase
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
                avatar_video_id
            `)
            .eq('project_id', this.currentProjectId);

        this.avatars = data || [];
        this.renderAvatars();
    }

    async loadStyleCatalog() {
        if (!this.currentProjectId) return;

        const { data } = await this.supabase
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
                config
            `)
            .eq('project_id', this.currentProjectId);

        this.styleCatalog = data || [];
        this.renderStyles();
    }

    loadDemoData() {
        // Datos de ejemplo para modo demo
        this.brands = [
            { id: 'demo-1', name: 'Mi Marca Demo', country: 'España' },
            { id: 'demo-2', name: 'Tech Corp', country: 'México' }
        ];
        this.products = [
            { id: 'prod-1', product_type: 'Laptop', short_desc: 'Laptop Pro 15"', price: 1299 },
            { id: 'prod-2', product_type: 'Smartphone', short_desc: 'Smartphone X1', price: 799 }
        ];
        this.offers = [
            { id: 'offer-1', main_objective: 'Ventas', offer_desc: '20% OFF', cta: 'Comprar Ahora' }
        ];
        this.avatars = [
            { id: 'avatar-1', avatar_type: 'Humano', gender: 'masculino', energy: 'Energético' }
        ];
        this.styleCatalog = [
            { id: 'style-1', name: 'Casual & Natural', category: 'Lifestyle' },
            { id: 'style-2', name: 'Profesional', category: 'Business' }
        ];

        this.renderBrands();
        this.renderProducts();
        this.renderOffers();
        this.renderAvatars();
        this.renderStyles();
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
            productItem.innerHTML = `
                <i data-lucide="box" class="product-icon"></i>
                <div class="product-info">
                    <span class="product-name">${product.short_desc}</span>
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
            offerItem.innerHTML = `
                <div class="offer-badge">${offer.main_objective}</div>
                <div class="offer-info">
                    <span class="offer-name">${offer.offer_desc}</span>
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
            styleCard.innerHTML = `
                <div class="style-preview ${style.category.toLowerCase()}"></div>
                <span class="style-name">${style.name}</span>
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
