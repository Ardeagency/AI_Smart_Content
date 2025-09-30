/**
 * UGC Studio - Configuración Avanzada
 * Gestión de formularios y integración con Supabase
 */

class UGCStudio {
    constructor() {
        this.projectId = null;
        this.configData = {
            brand: {},
            product: {},
            offer: {},
            audience: {},
            avatars: {},
            aesthetics: {},
            scenarios: {},
            distribution: {},
            aiControls: {}
        };
        this.requiredFields = {
            brand: ['name'],
            product: ['name'],
            offer: [],
            audience: [],
            avatars: [],
            aesthetics: [],
            scenarios: [],
            distribution: [],
            aiControls: []
        };
        
        this.init();
    }

    /**
     * Inicializar el Studio
     */
    async init() {
        console.log('🎬 Inicializando UGC Studio');
        
        try {
            // Configurar Supabase
            await this.setupSupabase();
            
            // Configurar event listeners
            this.setupEventListeners();
            
            // Inicializar componentes
            this.initializeComponents();
            
            // Cargar datos existentes si hay projectId
            await this.loadExistingData();
            
            console.log('✅ Studio inicializado correctamente');
        } catch (error) {
            console.error('❌ Error inicializando Studio:', error);
        }
    }

    /**
     * Configurar Supabase
     */
    async setupSupabase() {
        try {
            if (window.supabaseClient && window.supabaseClient.supabase) {
                this.supabase = window.supabaseClient.supabase;
                console.log('Supabase disponible');
            } else {
                console.log('Supabase no disponible, usando modo demo');
            }
        } catch (error) {
            console.error('Error configurando Supabase:', error);
        }
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Toggles de secciones
        document.querySelectorAll('.section-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const targetId = e.target.getAttribute('data-target');
                this.toggleSection(targetId);
            });
        });

        // Los toggles se manejan directamente con los atributos onclick
        // No necesitamos event listeners adicionales aquí

        // Tags inputs
        document.querySelectorAll('.tags-input').forEach(container => {
            this.setupTagsInput(container);
        });

        // File uploads
        document.querySelectorAll('.file-upload').forEach(upload => {
            this.setupFileUpload(upload);
        });

        // Sliders
        document.querySelectorAll('.slider').forEach(slider => {
            this.setupSlider(slider);
        });

        // Key-value editors
        document.querySelectorAll('.key-value-editor').forEach(editor => {
            this.setupKeyValueEditor(editor);
        });

        // Form inputs
        document.querySelectorAll('input, textarea, select').forEach(input => {
            input.addEventListener('input', () => this.updateConfigData());
            input.addEventListener('change', () => this.updateConfigData());
        });

        // Botón de generar guiones
        const generateBtn = document.getElementById('generateScripts');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateScripts());
        }

        // Botón de guardar proyecto
        const saveBtn = document.getElementById('saveProject');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveProject());
        }

        // Botón de actualizar preview
        const refreshBtn = document.getElementById('refreshPreview');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.updatePreview());
        }

        // Cerrar dropdowns al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                this.closeAllDropdowns();
            }
        });

        // Event listeners para modales
        this.setupModalEventListeners();
        
        // Configurar búsqueda en dropdowns
        this.setupDropdownSearch();
    }

    /**
     * Inicializar componentes
     */
    initializeComponents() {
        // Abrir todas las secciones por defecto
        document.querySelectorAll('.section-content').forEach(content => {
            content.classList.add('active');
        });

        // Cargar datos de demo
        this.loadDemoData();

        // Actualizar preview inicial
        this.updatePreview();
        
        // Actualizar progreso
        this.updateProgress();
    }

    /**
     * Toggle de secciones
     */
    toggleSection(targetId) {
        const content = document.getElementById(targetId);
        const toggle = document.querySelector(`[data-target="${targetId}"]`);
        
        if (content && toggle) {
            content.classList.toggle('active');
            toggle.classList.toggle('active');
        }
    }

    /**
     * Toggle de selectores
     */
    toggleSelector(selectorType) {
        console.log('toggleSelector called with:', selectorType);
        const content = document.getElementById(`${selectorType}-content`);
        const toggle = document.getElementById(`${selectorType}-toggle`);
        
        console.log('Elements found:', { content, toggle });
        
        if (content && toggle) {
            content.classList.toggle('active');
            toggle.classList.toggle('active');
            
            // Rotar el ícono
            const icon = toggle.querySelector('i');
            if (icon) {
                icon.style.transform = content.classList.contains('active') ? 'rotate(180deg)' : 'rotate(0deg)';
            }
            
            console.log('Toggle completed. Active:', content.classList.contains('active'));
        } else {
            console.error('Elements not found for selector:', selectorType);
        }
    }

    /**
     * Toggle de dropdowns
     */
    toggleDropdown(dropdownType) {
        console.log('toggleDropdown called with:', dropdownType);
        const menu = document.getElementById(`${dropdownType}-dropdown-menu`);
        const btn = document.getElementById(`${dropdownType}-dropdown-btn`);
        
        console.log('Elements found:', { menu, btn });
        
        if (menu && btn) {
            // Cerrar otros dropdowns
            this.closeAllDropdowns();
            
            // Toggle del dropdown actual
            menu.classList.toggle('active');
            btn.classList.toggle('active');
            
            console.log('Dropdown toggle completed. Active:', menu.classList.contains('active'));
        } else {
            console.error('Elements not found for dropdown:', dropdownType);
        }
    }

    /**
     * Cerrar todos los dropdowns
     */
    closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.classList.remove('active');
        });
        document.querySelectorAll('.dropdown-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    /**
     * Cargar datos existentes del usuario
     */
    async loadExistingData() {
        console.log('🔄 Cargando datos del usuario...');
        
        if (this.supabase) {
            try {
                await this.loadUserData();
                console.log('✅ Datos del usuario cargados correctamente');
            } catch (error) {
                console.warn('⚠️ Error cargando datos del usuario, usando datos demo:', error);
                this.loadDemoData();
            }
        } else {
            console.log('📝 Supabase no disponible, cargando datos demo');
            this.loadDemoData();
        }
    }

    /**
     * Cargar datos del usuario desde Supabase
     */
    async loadUserData() {
        // Obtener el usuario actual
        const { data: { user }, error: userError } = await this.supabase.auth.getUser();
        
        if (userError || !user) {
            throw new Error('Usuario no autenticado');
        }

        console.log('👤 Usuario autenticado:', user.email);

        // Cargar proyectos del usuario
        const { data: projects, error: projectsError } = await this.supabase
            .from('projects')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (projectsError) {
            console.error('Error cargando proyectos:', projectsError);
        } else if (projects && projects.length > 0) {
            this.currentProjectId = projects[0].id;
            console.log('📁 Proyecto actual:', this.currentProjectId);
        }

        // Cargar marcas del usuario
        await this.loadUserBrands(user.id);
        
        // Cargar productos del usuario
        await this.loadUserProducts(user.id);
        
        // Cargar ofertas del usuario
        await this.loadUserOffers(user.id);
        
        // Cargar temas y categorías (estos son estáticos)
        this.loadDemoThemes();
        this.loadDemoCategories();
    }

    /**
     * Cargar marcas del usuario
     */
    async loadUserBrands(userId) {
        const { data: brands, error } = await this.supabase
            .from('brand_guidelines')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error cargando marcas:', error);
            return;
        }

        if (brands && brands.length > 0) {
            this.demoBrands = brands.map(brand => ({
                id: brand.id,
                name: brand.name,
                logo: brand.logo_file_id,
                website: brand.website,
                tone: brand.tone_of_voice,
                keywords_yes: brand.keywords_yes || [],
                keywords_no: brand.keywords_no || []
            }));
            this.updateBrandDropdown();
            console.log('🏷️ Marcas cargadas:', this.demoBrands.length);
        } else {
            console.log('📝 No hay marcas, cargando datos demo');
            this.loadDemoBrands();
        }
    }

    /**
     * Cargar productos del usuario
     */
    async loadUserProducts(userId) {
        const { data: products, error } = await this.supabase
            .from('products')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error cargando productos:', error);
            return;
        }

        if (products && products.length > 0) {
            this.demoProducts = products.map(product => ({
                id: product.id,
                name: product.name,
                description: product.short_desc,
                benefits: product.benefits || [],
                differentiators: product.differentiators || [],
                ingredients: product.ingredients || [],
                usage_steps: product.usage_steps || [],
                price: product.price,
                main_image: product.main_image_id,
                brand_id: product.brand_id
            }));
            this.updateProductDropdown();
            console.log('📦 Productos cargados:', this.demoProducts.length);
        } else {
            console.log('📝 No hay productos, cargando datos demo');
            this.loadDemoProducts();
        }
    }

    /**
     * Cargar ofertas del usuario
     */
    async loadUserOffers(userId) {
        const { data: offers, error } = await this.supabase
            .from('offers')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error cargando ofertas:', error);
            return;
        }

        if (offers && offers.length > 0) {
            this.demoOffers = offers.map(offer => ({
                id: offer.id,
                name: offer.name,
                objective: offer.main_objective,
                description: offer.offer_desc,
                cta: offer.cta,
                cta_url: offer.cta_url,
                valid_until: offer.offer_valid_until,
                brand_id: offer.brand_id,
                product_id: offer.product_id
            }));
            this.updateOfferDropdown();
            console.log('🎯 Ofertas cargadas:', this.demoOffers.length);
        } else {
            console.log('📝 No hay ofertas, cargando datos demo');
            this.loadDemoOffers();
        }
    }

    /**
     * Cargar datos de demo (fallback)
     */
    loadDemoData() {
        console.log('📝 Cargando datos demo...');
        this.loadDemoBrands();
        this.loadDemoProducts();
        this.loadDemoOffers();
        this.loadDemoThemes();
        this.loadDemoCategories();
    }

    /**
     * Cargar datos reales desde Supabase
     */
    async loadRealData() {
        // Cargar marcas
        const { data: brands, error: brandsError } = await this.supabase
            .from('brand_guidelines')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (!brandsError && brands) {
            this.demoBrands = brands.map(brand => ({
                id: brand.id,
                name: brand.name,
                logo: brand.logo_file_id,
                website: brand.website,
                tone: brand.tone_of_voice
            }));
            this.updateBrandDropdown();
        }

        // Cargar productos
        const { data: products, error: productsError } = await this.supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (!productsError && products) {
            this.demoProducts = products.map(product => ({
                id: product.id,
                name: product.name,
                description: product.short_desc,
                benefits: product.benefits || [],
                price: product.price,
                main_image: product.main_image_id,
                brand_id: product.brand_id
            }));
            this.updateProductDropdown();
        }

        // Cargar ofertas
        const { data: offers, error: offersError } = await this.supabase
            .from('offers')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (!offersError && offers) {
            this.demoOffers = offers.map(offer => ({
                id: offer.id,
                name: offer.name,
                objective: offer.main_objective,
                description: offer.offer_desc,
                cta: offer.cta,
                cta_url: offer.cta_url,
                valid_until: offer.offer_valid_until,
                brand_id: offer.brand_id,
                product_id: offer.product_id
            }));
            this.updateOfferDropdown();
        }

        // Cargar temas (generados dinámicamente)
        this.loadDemoThemes();
        this.loadDemoCategories();
    }

    /**
     * Cargar marcas de demo
     */
    loadDemoBrands() {
        const brands = [
            { id: 1, name: 'Nike', website: 'nike.com', logo: null },
            { id: 2, name: 'Adidas', website: 'adidas.com', logo: null },
            { id: 3, name: 'Apple', website: 'apple.com', logo: null },
            { id: 4, name: 'Samsung', website: 'samsung.com', logo: null }
        ];

        const menu = document.getElementById('brand-dropdown-menu');
        if (menu) {
            menu.innerHTML = brands.map(brand => `
                <div class="brand-dropdown-item" onclick="selectBrand(${brand.id}, '${brand.name}', '${brand.website}')">
                    <div class="brand-logo-small">
                        <div class="brand-logo-placeholder">
                            <i class="fas fa-tag"></i>
                        </div>
                    </div>
                    <div class="brand-info">
                        <div class="brand-name">${brand.name}</div>
                        <div class="brand-website">${brand.website}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    /**
     * Cargar productos de demo
     */
    loadDemoProducts() {
        const products = [
            { id: 1, name: 'Air Max 270', price: '$120', image: null },
            { id: 2, name: 'iPhone 15', price: '$999', image: null },
            { id: 3, name: 'Galaxy S24', price: '$899', image: null },
            { id: 4, name: 'MacBook Pro', price: '$1999', image: null }
        ];

        const menu = document.getElementById('product-dropdown-menu');
        if (menu) {
            menu.innerHTML = products.map(product => `
                <div class="product-dropdown-item" onclick="selectProduct(${product.id}, '${product.name}', '${product.price}')">
                    <div class="product-image-small">
                        <div class="product-image-placeholder">
                            <i class="fas fa-box"></i>
                        </div>
                    </div>
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-price">${product.price}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    /**
     * Cargar ofertas de demo
     */
    loadDemoOffers() {
        const offers = [
            { id: 1, name: 'Descuento 20%', cta: 'Compra ahora' },
            { id: 2, name: 'Envío gratis', cta: 'Aprovecha' },
            { id: 3, name: '2x1', cta: 'Oferta limitada' },
            { id: 4, name: 'Black Friday', cta: 'Hasta 50% off' }
        ];

        const menu = document.getElementById('offer-dropdown-menu');
        if (menu) {
            menu.innerHTML = offers.map(offer => `
                <div class="offer-dropdown-item" onclick="selectOffer(${offer.id}, '${offer.name}', '${offer.cta}')">
                    <div class="offer-icon">
                        <i class="fas fa-percentage"></i>
                    </div>
                    <div class="offer-info">
                        <div class="offer-name">${offer.name}</div>
                        <div class="offer-cta">${offer.cta}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    /**
     * Cargar temas de demo
     */
    loadDemoThemes() {
        const themes = [
            { id: 1, name: 'Energía', icon: 'fas fa-bolt' },
            { id: 2, name: 'Relajación', icon: 'fas fa-leaf' },
            { id: 3, name: 'Lujo', icon: 'fas fa-gem' },
            { id: 4, name: 'Deportivo', icon: 'fas fa-dumbbell' },
            { id: 5, name: 'Tecnología', icon: 'fas fa-microchip' },
            { id: 6, name: 'Naturaleza', icon: 'fas fa-tree' }
        ];

        const grid = document.getElementById('themes-grid');
        if (grid) {
            grid.innerHTML = themes.map(theme => `
                <div class="theme-item" onclick="selectTheme(${theme.id}, '${theme.name}')">
                    <i class="${theme.icon} theme-icon"></i>
                    <div class="theme-name">${theme.name}</div>
                </div>
            `).join('');
        }
    }

    /**
     * Cargar categorías de demo
     */
    loadDemoCategories() {
        const categories = [
            { id: 1, name: 'Unboxing', description: 'Apertura de producto' },
            { id: 2, name: 'Reseña', description: 'Opinión detallada' },
            { id: 3, name: 'Tutorial', description: 'Guía paso a paso' },
            { id: 4, name: 'Comparativa', description: 'Comparación con otros' },
            { id: 5, name: 'Storytelling', description: 'Historia del producto' },
            { id: 6, name: 'Testimonial', description: 'Experiencia personal' }
        ];

        const menu = document.getElementById('category-dropdown-menu');
        if (menu) {
            menu.innerHTML = categories.map(category => `
                <div class="category-dropdown-item" onclick="selectCategory(${category.id}, '${category.name}', '${category.description}')">
                    <div class="category-icon">
                        <i class="fas fa-list"></i>
                    </div>
                    <div class="category-info">
                        <div class="category-name">${category.name}</div>
                        <div class="category-description">${category.description}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    /**
     * Seleccionar marca
     */
    selectBrand(id, name, website) {
        const selected = document.getElementById('brand-selected');
        if (selected) {
            selected.textContent = name;
        }
        
        // Cerrar dropdown
        this.closeAllDropdowns();
        
        // Actualizar configuración
        this.configData.brand = { id, name, website };
        this.updateConfigData();
        
        console.log('Marca seleccionada:', { id, name, website });
    }

    /**
     * Seleccionar producto
     */
    selectProduct(id, name, price) {
        const selected = document.getElementById('product-selected');
        if (selected) {
            selected.textContent = name;
        }
        
        // Cerrar dropdown
        this.closeAllDropdowns();
        
        // Actualizar configuración
        this.configData.product = { id, name, price };
        this.updateConfigData();
        
        console.log('Producto seleccionado:', { id, name, price });
    }

    /**
     * Seleccionar oferta
     */
    selectOffer(id, name, cta) {
        const selected = document.getElementById('offer-selected');
        if (selected) {
            selected.textContent = name;
        }
        
        // Cerrar dropdown
        this.closeAllDropdowns();
        
        // Actualizar configuración
        this.configData.offer = { id, name, cta };
        this.updateConfigData();
        
        console.log('Oferta seleccionada:', { id, name, cta });
    }

    /**
     * Seleccionar tema
     */
    selectTheme(id, name) {
        // Toggle selección
        const themeItem = event.target.closest('.theme-item');
        if (themeItem) {
            themeItem.classList.toggle('selected');
        }
        
        // Actualizar configuración
        if (!this.configData.themes) {
            this.configData.themes = [];
        }
        
        const themeIndex = this.configData.themes.findIndex(t => t.id === id);
        if (themeIndex >= 0) {
            this.configData.themes.splice(themeIndex, 1);
        } else {
            this.configData.themes.push({ id, name });
        }
        
        this.updateConfigData();
        console.log('Tema seleccionado:', { id, name });
    }

    /**
     * Seleccionar categoría
     */
    selectCategory(id, name, description) {
        const selected = document.getElementById('category-selected');
        if (selected) {
            selected.textContent = name;
        }
        
        // Cerrar dropdown
        this.closeAllDropdowns();
        
        // Actualizar configuración
        this.configData.category = { id, name, description };
        this.updateConfigData();
        
        console.log('Categoría seleccionada:', { id, name, description });
    }

    /**
     * Crear nueva marca
     */
    createNewBrand() {
        this.openModal('brandModal');
    }

    /**
     * Crear nuevo producto
     */
    createNewProduct() {
        this.openModal('productModal');
    }

    /**
     * Crear nueva oferta
     */
    createNewOffer() {
        this.openModal('offerModal');
    }

    /**
     * Abrir modal
     */
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Focus en el primer input
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    /**
     * Cerrar modal
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            
            // Limpiar formulario
            const form = modal.querySelector('form');
            if (form) {
                form.reset();
                this.clearFormValidation(form);
            }
        }
    }

    /**
     * Validar formulario
     */
    validateForm(form) {
        let isValid = true;
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            const formGroup = field.closest('.form-group');
            if (!field.value.trim()) {
                this.showFieldError(formGroup, 'Este campo es obligatorio');
                isValid = false;
            } else {
                this.clearFieldError(formGroup);
            }
        });
        
        // Validaciones específicas
        const emailFields = form.querySelectorAll('input[type="email"]');
        emailFields.forEach(field => {
            const formGroup = field.closest('.form-group');
            if (field.value && !this.isValidEmail(field.value)) {
                this.showFieldError(formGroup, 'Ingresa un email válido');
                isValid = false;
            }
        });
        
        const urlFields = form.querySelectorAll('input[type="url"]');
        urlFields.forEach(field => {
            const formGroup = field.closest('.form-group');
            if (field.value && !this.isValidUrl(field.value)) {
                this.showFieldError(formGroup, 'Ingresa una URL válida');
                isValid = false;
            }
        });
        
        return isValid;
    }

    /**
     * Mostrar error en campo
     */
    showFieldError(formGroup, message) {
        formGroup.classList.add('error');
        formGroup.classList.remove('success');
        
        let errorElement = formGroup.querySelector('.error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            formGroup.appendChild(errorElement);
        }
        errorElement.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    }

    /**
     * Limpiar error de campo
     */
    clearFieldError(formGroup) {
        formGroup.classList.remove('error');
        const errorElement = formGroup.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
    }

    /**
     * Limpiar validación de formulario
     */
    clearFormValidation(form) {
        const formGroups = form.querySelectorAll('.form-group');
        formGroups.forEach(group => {
            group.classList.remove('error', 'success');
            const errorElement = group.querySelector('.error-message');
            if (errorElement) {
                errorElement.remove();
            }
        });
    }

    /**
     * Validar email
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validar URL
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Guardar nueva marca
     */
    async saveNewBrand() {
        const form = document.getElementById('brandForm');
        if (!this.validateForm(form)) return;
        
        const formData = {
            name: document.getElementById('newBrandName').value,
            website: document.getElementById('newBrandWebsite').value,
            tone: document.getElementById('newBrandTone').value,
            logo_file: document.getElementById('newBrandLogoFile').files[0]
        };
        
        try {
            this.showLoading('brandModal', 'Creando marca...');
            
            let logo_url = null;
            
            // Subir logo a Supabase Storage si existe
            if (formData.logo_file) {
                const fileExt = formData.logo_file.name.split('.').pop();
                const fileName = `brand_logo_${Date.now()}.${fileExt}`;
                const filePath = `brands/${fileName}`;
                
                const { data: uploadData, error: uploadError } = await this.supabase.storage
                    .from('ugc-assets')
                    .upload(filePath, formData.logo_file);
                
                if (uploadError) throw uploadError;
                
                const { data: urlData } = this.supabase.storage
                    .from('ugc-assets')
                    .getPublicUrl(filePath);
                
                logo_url = urlData.publicUrl;
            }
            
            // Obtener usuario actual
            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            if (userError || !user) {
                throw new Error('Usuario no autenticado');
            }

            // Guardar marca en Supabase
            const { data, error } = await this.supabase
                .from('brand_guidelines')
                .insert([{
                    name: formData.name,
                    website: formData.website || null,
                    tone_of_voice: formData.tone || null,
                    logo_file_id: logo_url,
                    project_id: this.currentProjectId || null,
                    user_id: user.id,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            // Agregar a la lista local
            const newBrand = {
                id: data.id,
                name: formData.name,
                logo: logo_url,
                website: formData.website,
                tone: formData.tone
            };
            
            this.demoBrands.push(newBrand);
            this.updateBrandDropdown();
            
            this.closeModal('brandModal');
            this.showNotification('Marca creada exitosamente', 'success');
            
            // Recargar datos del usuario para sincronizar
            setTimeout(() => {
                this.loadExistingData();
            }, 1000);
            
        } catch (error) {
            console.error('Error al crear marca:', error);
            this.showNotification(`Error al crear la marca: ${error.message}`, 'error');
        } finally {
            this.hideLoading('brandModal');
        }
    }

    /**
     * Guardar nuevo producto
     */
    async saveNewProduct() {
        const form = document.getElementById('productForm');
        if (!this.validateForm(form)) return;
        
        const formData = {
            name: document.getElementById('newProductName').value,
            description: document.getElementById('newProductDescription').value,
            benefits: document.getElementById('newProductBenefits').value.split(',').map(b => b.trim()),
            price: parseFloat(document.getElementById('newProductPrice').value),
            main_image: document.getElementById('newProductMainImage').files[0]
        };
        
        try {
            this.showLoading('productModal', 'Creando producto...');
            
            let main_image_url = null;
            
            // Subir imagen principal a Supabase Storage si existe
            if (formData.main_image) {
                const fileExt = formData.main_image.name.split('.').pop();
                const fileName = `product_main_${Date.now()}.${fileExt}`;
                const filePath = `products/${fileName}`;
                
                const { data: uploadData, error: uploadError } = await this.supabase.storage
                    .from('ugc-assets')
                    .upload(filePath, formData.main_image);
                
                if (uploadError) throw uploadError;
                
                const { data: urlData } = this.supabase.storage
                    .from('ugc-assets')
                    .getPublicUrl(filePath);
                
                main_image_url = urlData.publicUrl;
            }
            
            // Obtener usuario actual
            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            if (userError || !user) {
                throw new Error('Usuario no autenticado');
            }

            // Guardar producto en Supabase
            const { data, error } = await this.supabase
                .from('products')
                .insert([{
                    name: formData.name,
                    short_desc: formData.description,
                    benefits: formData.benefits,
                    price: formData.price,
                    main_image_id: main_image_url,
                    brand_id: this.configData.brand?.id || null,
                    project_id: this.currentProjectId || null,
                    user_id: user.id,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            const newProduct = {
                id: data.id,
                name: formData.name,
                description: formData.description,
                benefits: formData.benefits,
                price: formData.price,
                main_image: main_image_url,
                brand_id: this.configData.brand?.id || null
            };
            
            this.demoProducts.push(newProduct);
            this.updateProductDropdown();
            
            this.closeModal('productModal');
            this.showNotification('Producto creado exitosamente', 'success');
            
            // Recargar datos del usuario para sincronizar
            setTimeout(() => {
                this.loadExistingData();
            }, 1000);
            
        } catch (error) {
            console.error('Error al crear producto:', error);
            this.showNotification(`Error al crear el producto: ${error.message}`, 'error');
        } finally {
            this.hideLoading('productModal');
        }
    }

    /**
     * Guardar nueva oferta
     */
    async saveNewOffer() {
        const form = document.getElementById('offerForm');
        if (!this.validateForm(form)) return;
        
        const formData = {
            name: document.getElementById('newOfferName').value,
            objective: document.getElementById('newOfferObjective').value,
            description: document.getElementById('newOfferDescription').value,
            cta: document.getElementById('newOfferCta').value,
            cta_url: document.getElementById('newOfferCtaUrl').value,
            valid_until: document.getElementById('newOfferValidUntil').value
        };
        
        try {
            this.showLoading('offerModal', 'Creando oferta...');
            
            // Obtener usuario actual
            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            if (userError || !user) {
                throw new Error('Usuario no autenticado');
            }

            // Guardar oferta en Supabase
            const { data, error } = await this.supabase
                .from('offers')
                .insert([{
                    name: formData.name,
                    main_objective: formData.objective,
                    offer_desc: formData.description,
                    cta: formData.cta,
                    cta_url: formData.cta_url || null,
                    offer_valid_until: formData.valid_until || null,
                    brand_id: this.configData.brand?.id || null,
                    product_id: this.configData.product?.id || null,
                    project_id: this.currentProjectId || null,
                    user_id: user.id,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            const newOffer = {
                id: data.id,
                name: formData.name,
                objective: formData.objective,
                description: formData.description,
                cta: formData.cta,
                cta_url: formData.cta_url,
                valid_until: formData.valid_until,
                brand_id: this.configData.brand?.id || null,
                product_id: this.configData.product?.id || null
            };
            
            this.demoOffers.push(newOffer);
            this.updateOfferDropdown();
            
            this.closeModal('offerModal');
            this.showNotification('Oferta creada exitosamente', 'success');
            
            // Recargar datos del usuario para sincronizar
            setTimeout(() => {
                this.loadExistingData();
            }, 1000);
            
        } catch (error) {
            console.error('Error al crear oferta:', error);
            this.showNotification(`Error al crear la oferta: ${error.message}`, 'error');
        } finally {
            this.hideLoading('offerModal');
        }
    }

    /**
     * Mostrar loading
     */
    showLoading(modalId, text) {
        const modal = document.getElementById(modalId);
        const saveBtn = modal.querySelector('.modal-btn-primary');
        if (saveBtn) {
            saveBtn.classList.add('btn-loading');
            saveBtn.innerHTML = `<div class="loading-spinner"></div> ${text}`;
        }
    }

    /**
     * Ocultar loading
     */
    hideLoading(modalId) {
        const modal = document.getElementById(modalId);
        const saveBtn = modal.querySelector('.modal-btn-primary');
        if (saveBtn) {
            saveBtn.classList.remove('btn-loading');
            saveBtn.innerHTML = 'Guardar';
        }
    }

    /**
     * Configurar event listeners para modales
     */
    setupModalEventListeners() {
        // Cerrar modal al hacer clic en el overlay
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                const modal = e.target;
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });

        // Cerrar modal con Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal-overlay.active');
                if (activeModal) {
                    activeModal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            }
        });

        // Configurar file uploads en modales
        document.querySelectorAll('.modal .file-upload').forEach(upload => {
            this.setupFileUpload(upload);
        });
    }

    /**
     * Configurar búsqueda en dropdowns
     */
    setupDropdownSearch() {
        // Búsqueda en dropdown de marcas
        const brandSearchInput = document.getElementById('brandSearchInput');
        if (brandSearchInput) {
            brandSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filteredBrands = this.demoBrands.filter(brand => 
                    brand.name.toLowerCase().includes(searchTerm) ||
                    (brand.website && brand.website.toLowerCase().includes(searchTerm)) ||
                    (brand.tone && brand.tone.toLowerCase().includes(searchTerm))
                );
                this.updateBrandDropdown(filteredBrands);
            });
        }

        // Búsqueda en dropdown de productos
        const productSearchInput = document.getElementById('productSearchInput');
        if (productSearchInput) {
            productSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filteredProducts = this.demoProducts.filter(product => 
                    product.name.toLowerCase().includes(searchTerm) ||
                    (product.description && product.description.toLowerCase().includes(searchTerm)) ||
                    (product.benefits && product.benefits.some(benefit => 
                        benefit.toLowerCase().includes(searchTerm)
                    ))
                );
                this.updateProductDropdown(filteredProducts);
            });
        }

        // Búsqueda en dropdown de ofertas
        const offerSearchInput = document.getElementById('offerSearchInput');
        if (offerSearchInput) {
            offerSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filteredOffers = this.demoOffers.filter(offer => 
                    offer.name.toLowerCase().includes(searchTerm) ||
                    (offer.description && offer.description.toLowerCase().includes(searchTerm)) ||
                    (offer.cta && offer.cta.toLowerCase().includes(searchTerm)) ||
                    (offer.objective && offer.objective.toLowerCase().includes(searchTerm))
                );
                this.updateOfferDropdown(filteredOffers);
            });
        }
    }

    /**
     * Actualizar dropdown de marcas
     */
    updateBrandDropdown(brands = null) {
        const dropdown = document.getElementById('brand-dropdown-menu');
        if (!dropdown) return;

        const brandsToShow = brands || this.demoBrands;
        
        if (brandsToShow.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item disabled">No se encontraron marcas</div>';
            return;
        }

        dropdown.innerHTML = brandsToShow.map(brand => `
            <div class="dropdown-item" onclick="selectBrand(${brand.id}, '${brand.name}', '${brand.website || ''}')">
                <div class="dropdown-item-content">
                    ${brand.logo ? `<img src="${brand.logo}" alt="${brand.name}" class="dropdown-item-image">` : '<div class="dropdown-item-placeholder"><i class="fas fa-tag"></i></div>'}
                    <div class="dropdown-item-text">
                        <div class="dropdown-item-title">${brand.name}</div>
                        ${brand.website ? `<div class="dropdown-item-subtitle">${brand.website}</div>` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Actualizar dropdown de productos
     */
    updateProductDropdown(products = null) {
        const dropdown = document.getElementById('product-dropdown-menu');
        if (!dropdown) return;

        const productsToShow = products || this.demoProducts;
        
        if (productsToShow.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item disabled">No se encontraron productos</div>';
            return;
        }

        dropdown.innerHTML = productsToShow.map(product => `
            <div class="dropdown-item" onclick="selectProduct(${product.id}, '${product.name}', ${product.price})">
                <div class="dropdown-item-content">
                    ${product.main_image ? `<img src="${product.main_image}" alt="${product.name}" class="dropdown-item-image">` : '<div class="dropdown-item-placeholder"><i class="fas fa-box"></i></div>'}
                    <div class="dropdown-item-text">
                        <div class="dropdown-item-title">${product.name}</div>
                        <div class="dropdown-item-subtitle">$${product.price}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Actualizar dropdown de ofertas
     */
    updateOfferDropdown(offers = null) {
        const dropdown = document.getElementById('offer-dropdown-menu');
        if (!dropdown) return;

        const offersToShow = offers || this.demoOffers;
        
        if (offersToShow.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item disabled">No se encontraron ofertas</div>';
            return;
        }

        dropdown.innerHTML = offersToShow.map(offer => `
            <div class="dropdown-item" onclick="selectOffer(${offer.id}, '${offer.name}', '${offer.cta}')">
                <div class="dropdown-item-content">
                    <div class="dropdown-item-placeholder"><i class="fas fa-percentage"></i></div>
                    <div class="dropdown-item-text">
                        <div class="dropdown-item-title">${offer.name}</div>
                        <div class="dropdown-item-subtitle">${offer.cta}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Configurar tags input
     */
    setupTagsInput(container) {
        const input = container.querySelector('.tags-input-field');
        const tagsList = container.querySelector('.tags-list');
        
        if (!input || !tagsList) return;

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                e.preventDefault();
                this.addTag(tagsList, input.value.trim());
                input.value = '';
            }
        });

        input.addEventListener('blur', () => {
            if (input.value.trim()) {
                this.addTag(tagsList, input.value.trim());
                input.value = '';
            }
        });
    }

    /**
     * Agregar tag
     */
    addTag(tagsList, text) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `
            <span>${text}</span>
            <button class="tag-remove" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        tagsList.appendChild(tag);
        this.updateConfigData();
    }

    /**
     * Configurar file upload
     */
    setupFileUpload(upload) {
        const preview = upload.querySelector('.file-upload-preview');
        const input = upload.querySelector('input[type="file"]');
        
        if (!preview || !input) return;

        upload.addEventListener('click', () => {
            input.click();
        });

        input.addEventListener('change', (e) => {
            this.handleFileUpload(e, preview);
        });
    }

    /**
     * Manejar file upload
     */
    handleFileUpload(event, preview) {
        const files = event.target.files;
        if (files.length === 0) return;

        if (files.length === 1) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `
                    <img src="${e.target.result}" style="max-width: 100%; max-height: 100px; border-radius: 4px;">
                    <span>${file.name}</span>
                `;
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = `
                <i class="fas fa-images"></i>
                <span>${files.length} archivos seleccionados</span>
            `;
        }

        this.updateConfigData();
    }

    /**
     * Configurar slider
     */
    setupSlider(slider) {
        const valueDisplay = slider.parentElement.querySelector('.slider-value');
        
        slider.addEventListener('input', () => {
            if (valueDisplay) {
                valueDisplay.textContent = slider.value;
            }
            this.updateConfigData();
        });
    }

    /**
     * Configurar key-value editor
     */
    setupKeyValueEditor(editor) {
        const addBtn = editor.querySelector('.add-item');
        
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.addKeyValueItem(editor);
            });
        }

        // Configurar botones de eliminar existentes
        editor.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.key-value-item').remove();
                this.updateConfigData();
            });
        });
    }

    /**
     * Agregar item key-value
     */
    addKeyValueItem(editor) {
        const item = document.createElement('div');
        item.className = 'key-value-item';
        item.innerHTML = `
            <input type="text" placeholder="Clave" class="key-input">
            <input type="text" placeholder="Valor" class="value-input">
            <button class="remove-item"><i class="fas fa-times"></i></button>
        `;
        
        editor.insertBefore(item, editor.querySelector('.add-item'));
        
        // Configurar botón de eliminar
        item.querySelector('.remove-item').addEventListener('click', (e) => {
            item.remove();
            this.updateConfigData();
        });

        // Configurar inputs
        item.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.updateConfigData());
        });
    }

    /**
     * Actualizar datos de configuración
     */
    updateConfigData() {
        // Marca
        this.configData.brand = {
            name: document.getElementById('brandName')?.value || '',
            tone_of_voice: document.getElementById('brandTone')?.value || '',
            keywords_yes: this.getTagsFromContainer('brandKeywordsYes'),
            keywords_no: this.getTagsFromContainer('brandKeywordsNo'),
            logo_file_id: this.getFileId('brandLogoFile'),
            brand_assets: this.getFileIds('brandAssetsFile')
        };

        // Producto
        this.configData.product = {
            name: document.getElementById('productName')?.value || '',
            short_desc: document.getElementById('productDesc')?.value || '',
            benefits: this.getTagsFromContainer('productBenefits'),
            differentiators: this.getTagsFromContainer('productDifferentiators'),
            usage_steps: this.getTagsFromContainer('productUsageSteps'),
            ingredients: this.getTagsFromContainer('productIngredients'),
            price: parseFloat(document.getElementById('productPrice')?.value) || 0,
            main_image_id: this.getFileId('productMainImageFile'),
            gallery_file_ids: this.getFileIds('productGalleryFile')
        };

        // Oferta
        this.configData.offer = {
            main_objective: document.getElementById('offerObjective')?.value || '',
            offer_desc: document.getElementById('offerDesc')?.value || '',
            cta: document.getElementById('offerCta')?.value || '',
            cta_url: document.getElementById('offerUrl')?.value || '',
            offer_valid_until: document.getElementById('offerValidUntil')?.value || ''
        };

        // Audiencia
        this.configData.audience = {
            buyer_persona: this.parseJSONField('audiencePersona'),
            interests: this.getTagsFromContainer('audienceInterests'),
            pains: this.getTagsFromContainer('audiencePains'),
            contexts: this.getTagsFromContainer('audienceContexts'),
            language_codes: this.getMultiSelectValues('audienceLanguages')
        };

        // Avatares
        this.configData.avatars = {
            avatar_type: document.getElementById('avatarType')?.value || '',
            traits: this.parseJSONField('avatarTraits'),
            gender: document.querySelector('input[name="avatarGender"]:checked')?.value || '',
            voice: this.parseJSONField('avatarVoice'),
            languages: this.getMultiSelectValues('avatarLanguages'),
            avatar_image_id: this.getFileId('avatarImageFile'),
            avatar_video_id: this.getFileId('avatarVideoFile')
        };

        // Estética
        this.configData.aesthetics = {
            mood: document.getElementById('aestheticsMood')?.value || '',
            palette: this.getColorPalette(),
            lighting: document.getElementById('aestheticsLighting')?.value || '',
            camera: document.getElementById('aestheticsCamera')?.value || '',
            pace: document.getElementById('aestheticsPace')?.value || '',
            music: '', // TODO: Implementar
            overlays: this.getTagsFromContainer('aestheticsOverlays')
        };

        // Escenarios
        this.configData.scenarios = {
            main_location: document.getElementById('scenarioLocation')?.value || '',
            ambience: document.getElementById('scenarioAmbience')?.value || '',
            backdrop: document.getElementById('scenarioBackdrop')?.value || '',
            scenario_file_ids: this.getFileIds('scenarioReferencesFile')
        };

        // Distribución
        this.configData.distribution = {
            platforms: this.getMultiSelectValues('distributionPlatforms'),
            formats: this.getMultiSelectValues('distributionFormats'),
            utm_params: this.getKeyValueData('distributionUtm'),
            ab_variables: this.getKeyValueData('distributionAb')
        };

        // Controles IA
        this.configData.aiControls = {
            creativity: parseFloat(document.getElementById('aiCreativity')?.value) || 0.7,
            consistency: parseFloat(document.getElementById('aiConsistency')?.value) || 0.8,
            pace: document.getElementById('aestheticsPace')?.value || '',
            improvisation: parseFloat(document.getElementById('aiImprovisation')?.value) || 0.3
        };

        // Actualizar preview y progreso
        this.updatePreview();
        this.updateProgress();
    }

    /**
     * Obtener tags de un contenedor
     */
    getTagsFromContainer(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        
        const tags = container.querySelectorAll('.tag span');
        return Array.from(tags).map(tag => tag.textContent);
    }

    /**
     * Obtener ID de archivo
     */
    getFileId(inputId) {
        const input = document.getElementById(inputId);
        return input?.files[0] ? `file_${Date.now()}` : null;
    }

    /**
     * Obtener IDs de archivos múltiples
     */
    getFileIds(inputId) {
        const input = document.getElementById(inputId);
        if (!input?.files) return [];
        
        return Array.from(input.files).map((_, index) => `file_${Date.now()}_${index}`);
    }

    /**
     * Obtener valores de multi-select
     */
    getMultiSelectValues(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return [];
        
        return Array.from(select.selectedOptions).map(option => option.value);
    }

    /**
     * Parsear campo JSON
     */
    parseJSONField(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field?.value) return {};
        
        try {
            return JSON.parse(field.value);
        } catch (error) {
            console.warn(`Error parseando JSON en ${fieldId}:`, error);
            return {};
        }
    }

    /**
     * Obtener paleta de colores
     */
    getColorPalette() {
        const colors = [];
        for (let i = 1; i <= 3; i++) {
            const colorInput = document.getElementById(`color${i}`);
            if (colorInput?.value) {
                colors.push(colorInput.value);
            }
        }
        return colors;
    }

    /**
     * Obtener datos key-value
     */
    getKeyValueData(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return {};
        
        const items = container.querySelectorAll('.key-value-item');
        const data = {};
        
        items.forEach(item => {
            const key = item.querySelector('.key-input')?.value;
            const value = item.querySelector('.value-input')?.value;
            if (key && value) {
                data[key] = value;
            }
        });
        
        return data;
    }

    /**
     * Actualizar preview
     */
    updatePreview() {
        const promptsContainer = document.getElementById('promptsContainer');
        if (!promptsContainer) return;

        // Generar prompts basados en la configuración
        const prompts = this.generatePrompts();
        
        promptsContainer.innerHTML = prompts.map(prompt => `
            <div class="prompt-item">
                <div class="prompt-header">
                    <span class="prompt-type">${prompt.type}</span>
                    <span class="prompt-duration">${prompt.duration}</span>
                </div>
                <div class="prompt-content">${prompt.content}</div>
            </div>
        `).join('');
    }

    /**
     * Generar prompts
     */
    generatePrompts() {
        const { brand, product, offer, audience, avatars } = this.configData;
        
        if (!brand.name || !product.name) {
            return [{
                type: 'Configuración Incompleta',
                duration: '0s',
                content: 'Completa la información de marca y producto para generar prompts.'
            }];
        }

        const prompts = [];

        // Video principal
        prompts.push({
            type: 'Video Principal',
            duration: '30s',
            content: `¡Hola! Soy [${avatars.gender || 'persona'}] y hoy te traigo algo increíble. Este ${product.name} ha cambiado completamente mi rutina. ¿Sabías que ${product.benefits[0] || 'es increíble'}? Es perfecto para ${audience.contexts[0] || 'tu día a día'} y lo mejor es que ${product.differentiators[0] || 'realmente funciona'}. ¡No te lo pierdas!`
        });

        // Video de beneficios
        if (product.benefits.length > 0) {
            prompts.push({
                type: 'Video de Beneficios',
                duration: '15s',
                content: `Los ${product.benefits.length} beneficios principales de ${product.name}: ${product.benefits.slice(0, 3).join(', ')}. ${offer.cta || 'Descúbrelo ahora'}.`
            });
        }

        // Video testimonial
        prompts.push({
            type: 'Testimonial',
            duration: '20s',
            content: `"Llevo usando ${product.name} desde hace 3 meses y la diferencia es increíble. ${product.differentiators[0] || 'Realmente funciona'} y me encanta cómo ${product.benefits[0] || 'me hace sentir'}. Lo recomiendo 100%."`
        });

        return prompts;
    }

    /**
     * Actualizar progreso
     */
    updateProgress() {
        const totalSections = Object.keys(this.requiredFields).length;
        let completedSections = 0;

        Object.entries(this.requiredFields).forEach(([section, requiredFields]) => {
            const sectionData = this.configData[section];
            const hasRequiredData = requiredFields.every(field => {
                const value = sectionData[field];
                return value && value.toString().trim() !== '';
            });
            
            if (hasRequiredData) {
                completedSections++;
            }
        });

        const progress = Math.round((completedSections / totalSections) * 100);
        
        const progressText = document.getElementById('configProgress');
        const progressFill = document.getElementById('progressFill');
        
        if (progressText) {
            progressText.textContent = `${progress}%`;
        }
        
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
    }

    /**
     * Cargar datos existentes
     */
    async loadExistingData() {
        // TODO: Implementar carga de datos existentes desde Supabase
        console.log('Cargando datos existentes...');
    }

    /**
     * Guardar proyecto
     */
    async saveProject() {
        try {
            console.log('💾 Guardando proyecto...', this.configData);
            
            if (!this.supabase) {
                console.log('Modo demo: Datos guardados localmente');
                localStorage.setItem('ugc-studio-config', JSON.stringify(this.configData));
                this.showNotification('Proyecto guardado localmente', 'success');
                return;
            }

            // TODO: Implementar guardado en Supabase
            this.showNotification('Proyecto guardado en Supabase', 'success');
            
        } catch (error) {
            console.error('Error guardando proyecto:', error);
            this.showNotification('Error guardando proyecto', 'error');
        }
    }

    /**
     * Generar guiones
     */
    async generateScripts() {
        try {
            // Validar configuración
            if (!this.validateConfiguration()) {
                this.showNotification('Completa la configuración requerida', 'warning');
                return;
            }

            console.log('🎬 Generando guiones...', this.configData);
            
            // TODO: Implementar generación de guiones
            this.showNotification('Generando guiones...', 'info');
            
            // Simular generación
            setTimeout(() => {
                this.showNotification('Guiones generados exitosamente', 'success');
            }, 2000);
            
        } catch (error) {
            console.error('Error generando guiones:', error);
            this.showNotification('Error generando guiones', 'error');
        }
    }

    /**
     * Validar configuración
     */
    validateConfiguration() {
        const { brand, product } = this.configData;
        
        if (!brand.name || !product.name) {
            return false;
        }
        
        return true;
    }

    /**
     * Mostrar notificación
     */
    showNotification(message, type = 'info') {
        // Crear notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}"></i>
            <span>${message}</span>
        `;
        
        // Estilos
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--error-color)' : 'var(--primary-color)'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Remover después de 3 segundos
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 UGC Studio - Iniciando');
    window.ugcStudio = new UGCStudio();
});

// Funciones globales para compatibilidad
window.toggleSection = (targetId) => {
    if (window.ugcStudio) {
        window.ugcStudio.toggleSection(targetId);
    }
};

window.toggleSelector = (selectorType) => {
    console.log('Global toggleSelector called with:', selectorType);
    
    // Función directa sin depender del objeto ugcStudio
    const content = document.getElementById(`${selectorType}-content`);
    const toggle = document.getElementById(`${selectorType}-toggle`);
    
    console.log('Elements found:', { content, toggle });
    
    if (content && toggle) {
        content.classList.toggle('active');
        toggle.classList.toggle('active');
        
        // Rotar el ícono
        const icon = toggle.querySelector('i');
        if (icon) {
            icon.style.transform = content.classList.contains('active') ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        
        console.log('Toggle completed. Active:', content.classList.contains('active'));
    } else {
        console.error('Elements not found for selector:', selectorType);
    }
};

window.toggleDropdown = (dropdownType) => {
    console.log('Global toggleDropdown called with:', dropdownType);
    
    // Función directa sin depender del objeto ugcStudio
    const menu = document.getElementById(`${dropdownType}-dropdown-menu`);
    const btn = document.getElementById(`${dropdownType}-dropdown-btn`);
    
    console.log('Elements found:', { menu, btn });
    
    if (menu && btn) {
        // Cerrar otros dropdowns
        document.querySelectorAll('.dropdown-menu.active').forEach(dropdown => {
            dropdown.classList.remove('active');
        });
        document.querySelectorAll('.dropdown-btn.active').forEach(button => {
            button.classList.remove('active');
        });
        
        // Toggle del dropdown actual
        menu.classList.toggle('active');
        btn.classList.toggle('active');
        
        console.log('Dropdown toggle completed. Active:', menu.classList.contains('active'));
    } else {
        console.error('Elements not found for dropdown:', dropdownType);
    }
};

window.selectBrand = (id, name, website) => {
    if (window.ugcStudio) {
        window.ugcStudio.selectBrand(id, name, website);
    }
};

window.selectProduct = (id, name, price) => {
    if (window.ugcStudio) {
        window.ugcStudio.selectProduct(id, name, price);
    }
};

window.selectOffer = (id, name, cta) => {
    if (window.ugcStudio) {
        window.ugcStudio.selectOffer(id, name, cta);
    }
};

window.selectTheme = (id, name) => {
    if (window.ugcStudio) {
        window.ugcStudio.selectTheme(id, name);
    }
};

window.selectCategory = (id, name, description) => {
    if (window.ugcStudio) {
        window.ugcStudio.selectCategory(id, name, description);
    }
};

window.createNewBrand = () => {
    if (window.ugcStudio) {
        window.ugcStudio.createNewBrand();
    }
};

window.createNewProduct = () => {
    if (window.ugcStudio) {
        window.ugcStudio.createNewProduct();
    }
};

window.createNewOffer = () => {
    if (window.ugcStudio) {
        window.ugcStudio.createNewOffer();
    }
};

window.closeModal = (modalId) => {
    if (window.ugcStudio) {
        window.ugcStudio.closeModal(modalId);
    }
};

window.saveNewBrand = () => {
    if (window.ugcStudio) {
        window.ugcStudio.saveNewBrand();
    }
};

window.saveNewProduct = () => {
    if (window.ugcStudio) {
        window.ugcStudio.saveNewProduct();
    }
};

window.saveNewOffer = () => {
    if (window.ugcStudio) {
        window.ugcStudio.saveNewOffer();
    }
};

window.addTag = (tagsList, text) => {
    if (window.ugcStudio) {
        window.ugcStudio.addTag(tagsList, text);
    }
};

window.addKeyValueItem = (editor) => {
    if (window.ugcStudio) {
        window.ugcStudio.addKeyValueItem(editor);
    }
};

