/**
 * UGC Studio - Dashboard Supabase Integration
 * Integración del dashboard con Supabase para recolección de datos
 * 
 * Funcionalidades:
 * - Interceptar acciones del dashboard
 * - Guardar proyectos, productos, avatars en Supabase
 * - Sincronizar con base de datos local
 * - Tracking de eventos de usuario
 */

class DashboardSupabaseIntegration {
    constructor() {
        this.currentUser = null;
        this.isInitialized = false;
        
        this.init();
    }

    async init() {
        try {
            // Esperar a que los servicios estén listos
            await this.waitForServices();
            
            // Obtener usuario actual
            this.loadCurrentUser();
            
            // Configurar interceptores
            this.setupInterceptors();
            
            // Configurar listeners de eventos
            this.setupEventListeners();
            
            this.isInitialized = true;
            console.log('✅ Dashboard Supabase Integration inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando Dashboard Integration:', error);
        }
    }

    async waitForServices() {
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            if (window.supabaseClient?.isReady() && 
                window.AppState && 
                window.dashboardExtended) {
                return true;
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error('Servicios del dashboard no disponibles');
    }

    loadCurrentUser() {
        // Intentar cargar desde sessionStorage
        const sessionUser = sessionStorage.getItem('currentUser');
        if (sessionUser) {
            this.currentUser = JSON.parse(sessionUser);
        }

        // Intentar cargar desde AppState
        if (!this.currentUser && window.AppState && typeof window.AppState.getUser === 'function') {
            this.currentUser = window.AppState.getUser();
        }

        // Configurar listener para cambios de usuario
        if (window.AppState) {
            window.AppState.subscribe('user', (user) => {
                this.currentUser = user;
                console.log('👤 Usuario actualizado en Dashboard Integration:', user?.email);
            });
        }

        console.log('👤 Usuario cargado:', this.currentUser?.email);
    }

    setupInterceptors() {
        // Interceptar creación de proyectos
        this.interceptProjectCreation();
        
        // Interceptar creación de productos
        this.interceptProductCreation();
        
        // Interceptar creación de avatars
        this.interceptAvatarCreation();
        
        // Interceptar generaciones UGC
        this.interceptUGCGeneration();
    }

    setupEventListeners() {
        // Escuchar eventos del dashboard
        document.addEventListener('projectCreated', (event) => {
            this.handleProjectCreated(event.detail);
        });

        document.addEventListener('productCreated', (event) => {
            this.handleProductCreated(event.detail);
        });

        document.addEventListener('avatarCreated', (event) => {
            this.handleAvatarCreated(event.detail);
        });

        document.addEventListener('ugcGenerated', (event) => {
            this.handleUGCGenerated(event.detail);
        });

        // Escuchar cambios en forms del dashboard
        this.setupFormListeners();
    }

    interceptProjectCreation() {
        // Hook en el método addProject de AppState
        if (window.AppState && window.AppState.addProject) {
            const originalAddProject = window.AppState.addProject.bind(window.AppState);
            
            window.AppState.addProject = async (projectData) => {
                // Ejecutar método original
                const result = originalAddProject(projectData);
                
                // Guardar en Supabase
                try {
                    await this.saveProjectToSupabase(projectData);
                } catch (error) {
                    console.error('Error guardando proyecto en Supabase:', error);
                }
                
                return result;
            };
        }
    }

    interceptProductCreation() {
        if (window.AppState && window.AppState.addProduct) {
            const originalAddProduct = window.AppState.addProduct.bind(window.AppState);
            
            window.AppState.addProduct = async (productData) => {
                const result = originalAddProduct(productData);
                
                try {
                    await this.saveProductToSupabase(productData);
                } catch (error) {
                    console.error('Error guardando producto en Supabase:', error);
                }
                
                return result;
            };
        }
    }

    interceptAvatarCreation() {
        if (window.AppState && window.AppState.addAvatar) {
            const originalAddAvatar = window.AppState.addAvatar.bind(window.AppState);
            
            window.AppState.addAvatar = async (avatarData) => {
                const result = originalAddAvatar(avatarData);
                
                try {
                    await this.saveAvatarToSupabase(avatarData);
                } catch (error) {
                    console.error('Error guardando avatar en Supabase:', error);
                }
                
                return result;
            };
        }
    }

    interceptUGCGeneration() {
        // Hook en el UGC Generator
        if (window.ugcGenerator) {
            const originalStartGeneration = window.ugcGenerator.startGeneration;
            
            if (originalStartGeneration) {
                window.ugcGenerator.startGeneration = async (config) => {
                    // Ejecutar generación original
                    const result = await originalStartGeneration.call(window.ugcGenerator, config);
                    
                    // Guardar en Supabase
                    try {
                        await this.saveUGCGenerationToSupabase(config, result);
                    } catch (error) {
                        console.error('Error guardando UGC generation en Supabase:', error);
                    }
                    
                    return result;
                };
            }
        }
    }

    setupFormListeners() {
        // Listener para formularios de nuevo proyecto
        document.addEventListener('click', async (event) => {
            if (event.target.id === 'newProjectBtn' || 
                event.target.id === 'createFirstProject') {
                this.showProjectCreationForm();
            }
            
            if (event.target.id === 'addProductBtn' || 
                event.target.id === 'addFirstProduct') {
                this.showProductCreationForm();
            }
            
            if (event.target.id === 'createAvatarBtn' || 
                event.target.id === 'createFirstAvatar') {
                this.showAvatarCreationForm();
            }
        });
    }

    // Métodos para guardar en Supabase
    async saveProjectToSupabase(projectData) {
        if (!this.currentUser?.id || !window.supabaseClient?.isReady()) {
            throw new Error('Usuario o Supabase no disponible');
        }

        const supabaseProject = {
            name: projectData.name || projectData.title,
            description: projectData.description || '',
            project_type: projectData.type || 'ugc',
            status: 'active',
            settings: projectData.data || projectData.settings || {},
            metadata: {
                created_from: 'dashboard',
                local_id: projectData.id,
                ...projectData.metadata
            }
        };

        const savedProject = await window.supabaseClient.saveProject(
            this.currentUser.id, 
            supabaseProject
        );

        // Actualizar datos locales con ID de Supabase
        if (window.AppState) {
            window.AppState.updateProject(projectData.id, {
                supabase_id: savedProject.id,
                synced_at: Date.now()
            });
        }

        console.log('✅ Proyecto guardado en Supabase:', savedProject);
        return savedProject;
    }

    async saveProductToSupabase(productData) {
        if (!this.currentUser?.id || !window.supabaseClient?.isReady()) {
            throw new Error('Usuario o Supabase no disponible');
        }

        const supabaseProduct = {
            name: productData.name,
            description: productData.description || '',
            category: productData.category || productData.type,
            brand: productData.brand || '',
            price: parseFloat(productData.price) || 0,
            currency: productData.currency || 'USD',
            specifications: {
                benefits: productData.benefits || [],
                usage: productData.usage || '',
                ingredients: productData.ingredients || '',
                variants: productData.variants || '',
                ...productData.specifications
            },
            images: productData.images || [],
            metadata: {
                created_from: 'dashboard',
                local_id: productData.id,
                ...productData.metadata
            }
        };

        const savedProduct = await window.supabaseClient.saveProduct(
            this.currentUser.id, 
            supabaseProduct
        );

        if (window.AppState) {
            window.AppState.updateProduct(productData.id, {
                supabase_id: savedProduct.id,
                synced_at: Date.now()
            });
        }

        console.log('✅ Producto guardado en Supabase:', savedProduct);
        return savedProduct;
    }

    async saveAvatarToSupabase(avatarData) {
        if (!this.currentUser?.id || !window.supabaseClient?.isReady()) {
            throw new Error('Usuario o Supabase no disponible');
        }

        const supabaseAvatar = {
            name: avatarData.name,
            avatar_type: avatarData.type === 'IA' ? 'ai' : 'human',
            description: avatarData.description || '',
            characteristics: avatarData.characteristics || {},
            appearance: avatarData.appearance || {},
            voice_settings: avatarData.voice_settings || avatarData.characteristics?.voz || {},
            metadata: {
                created_from: 'dashboard',
                local_id: avatarData.id,
                references: avatarData.references,
                ...avatarData.metadata
            }
        };

        const savedAvatar = await window.supabaseClient.saveAvatar(
            this.currentUser.id, 
            supabaseAvatar
        );

        if (window.AppState) {
            window.AppState.updateAvatar(avatarData.id, {
                supabase_id: savedAvatar.id,
                synced_at: Date.now()
            });
        }

        console.log('✅ Avatar guardado en Supabase:', savedAvatar);
        return savedAvatar;
    }

    async saveUGCGenerationToSupabase(config, result) {
        if (!this.currentUser?.id || !window.supabaseClient?.isReady()) {
            throw new Error('Usuario o Supabase no disponible');
        }

        const ugcGeneration = {
            style_name: config.style || 'Unknown',
            custom_prompt: config.prompt || '',
            quantity: config.quantity || 1,
            format: config.format || 'video',
            status: result.success ? 'completed' : 'failed',
            project_id: config.projectId || null,
            product_id: config.productId || null,
            avatar_id: config.avatarId || null,
            configuration: {
                include_subtitles: config.includeSubtitles,
                include_cta: config.includeCTA,
                include_branding: config.includeBranding,
                ...config.advancedOptions
            },
            results: {
                generated_files: result.files || [],
                processing_time: result.processingTime || 0,
                success: result.success,
                error: result.error
            },
            metadata: {
                created_from: 'dashboard',
                user_agent: navigator.userAgent,
                timestamp: Date.now()
            }
        };

        const savedGeneration = await window.supabaseClient.saveUGCGeneration(
            this.currentUser.id, 
            ugcGeneration
        );

        console.log('✅ UGC Generation guardada en Supabase:', savedGeneration);
        return savedGeneration;
    }

    // Métodos para mostrar formularios
    showProjectCreationForm() {
        const modal = this.createModal('Nuevo Proyecto', `
            <form id="projectForm">
                <div class="form-group">
                    <label>Nombre del Proyecto</label>
                    <input type="text" id="projectName" required>
                </div>
                <div class="form-group">
                    <label>Descripción</label>
                    <textarea id="projectDescription" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label>Tipo de Proyecto</label>
                    <select id="projectType">
                        <option value="ugc">UGC Campaign</option>
                        <option value="brand">Brand Campaign</option>
                        <option value="product">Product Launch</option>
                        <option value="seasonal">Seasonal Campaign</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                    <button type="submit">Crear Proyecto</button>
                </div>
            </form>
        `);

        document.getElementById('projectForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleProjectFormSubmit(e.target);
            modal.remove();
        });
    }

    showProductCreationForm() {
        const modal = this.createModal('Nuevo Producto', `
            <form id="productForm">
                <div class="form-group">
                    <label>Nombre del Producto</label>
                    <input type="text" id="productName" required>
                </div>
                <div class="form-group">
                    <label>Descripción</label>
                    <textarea id="productDescription" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label>Categoría</label>
                    <select id="productCategory">
                        <option value="cosmetic">Cosmético</option>
                        <option value="supplement">Suplemento</option>
                        <option value="beverage">Bebida</option>
                        <option value="app">Software/App</option>
                        <option value="fashion">Moda</option>
                        <option value="electronics">Electrónicos</option>
                        <option value="other">Otro</option>
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Precio</label>
                        <input type="number" id="productPrice" step="0.01">
                    </div>
                    <div class="form-group">
                        <label>Moneda</label>
                        <select id="productCurrency">
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="GBP">GBP</option>
                            <option value="MXN">MXN</option>
                        </select>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                    <button type="submit">Crear Producto</button>
                </div>
            </form>
        `);

        document.getElementById('productForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleProductFormSubmit(e.target);
            modal.remove();
        });
    }

    showAvatarCreationForm() {
        const modal = this.createModal('Nuevo Avatar', `
            <form id="avatarForm">
                <div class="form-group">
                    <label>Nombre del Avatar</label>
                    <input type="text" id="avatarName" required>
                </div>
                <div class="form-group">
                    <label>Tipo de Avatar</label>
                    <select id="avatarType">
                        <option value="ai">Avatar IA</option>
                        <option value="human">Creador Humano</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Descripción</label>
                    <textarea id="avatarDescription" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label>Género</label>
                    <select id="avatarGender">
                        <option value="masculine">Masculino</option>
                        <option value="feminine">Femenino</option>
                        <option value="non-binary">No binario</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Rango de Edad</label>
                    <select id="avatarAge">
                        <option value="18-25">18-25 años</option>
                        <option value="26-35">26-35 años</option>
                        <option value="36-45">36-45 años</option>
                        <option value="46+">46+ años</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                    <button type="submit">Crear Avatar</button>
                </div>
            </form>
        `);

        document.getElementById('avatarForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAvatarFormSubmit(e.target);
            modal.remove();
        });
    }

    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        modal.innerHTML = `
            <div class="modal-content" style="
                background: var(--background-secondary);
                border-radius: 16px;
                padding: 2rem;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
            ">
                <h2 style="margin: 0 0 1.5rem 0; color: var(--text-primary);">${title}</h2>
                ${content}
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    // Handlers para formularios
    async handleProjectFormSubmit(form) {
        const formData = new FormData(form);
        const projectData = {
            id: `project_${Date.now()}`,
            name: formData.get('projectName') || document.getElementById('projectName').value,
            description: formData.get('projectDescription') || document.getElementById('projectDescription').value,
            type: formData.get('projectType') || document.getElementById('projectType').value,
            created: new Date().toISOString(),
            status: 'active'
        };

        try {
            if (window.AppState) {
                window.AppState.addProject(projectData);
            }
            
            this.showSuccessNotification('Proyecto creado exitosamente');
        } catch (error) {
            console.error('Error creando proyecto:', error);
            this.showErrorNotification('Error creando proyecto');
        }
    }

    async handleProductFormSubmit(form) {
        const productData = {
            id: `product_${Date.now()}`,
            name: document.getElementById('productName').value,
            description: document.getElementById('productDescription').value,
            category: document.getElementById('productCategory').value,
            price: parseFloat(document.getElementById('productPrice').value) || 0,
            currency: document.getElementById('productCurrency').value,
            created: new Date().toISOString()
        };

        try {
            if (window.AppState) {
                window.AppState.addProduct(productData);
            }
            
            this.showSuccessNotification('Producto creado exitosamente');
        } catch (error) {
            console.error('Error creando producto:', error);
            this.showErrorNotification('Error creando producto');
        }
    }

    async handleAvatarFormSubmit(form) {
        const avatarData = {
            id: `avatar_${Date.now()}`,
            name: document.getElementById('avatarName').value,
            type: document.getElementById('avatarType').value,
            description: document.getElementById('avatarDescription').value,
            characteristics: {
                gender: document.getElementById('avatarGender').value,
                age_range: document.getElementById('avatarAge').value
            },
            created: new Date().toISOString()
        };

        try {
            if (window.AppState) {
                window.AppState.addAvatar(avatarData);
            }
            
            this.showSuccessNotification('Avatar creado exitosamente');
        } catch (error) {
            console.error('Error creando avatar:', error);
            this.showErrorNotification('Error creando avatar');
        }
    }

    // Métodos de evento handlers
    handleProjectCreated(projectData) {
        console.log('📁 Proyecto creado:', projectData);
        
        try {
            if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                window.analyticsEngine.track('project_created', {
                    project_type: projectData.type,
                    source: 'dashboard'
                });
            }
        } catch (error) {
            console.warn('⚠️ Error en analytics tracking (project_created):', error);
        }
    }

    handleProductCreated(productData) {
        console.log('📦 Producto creado:', productData);
        
        try {
            if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                window.analyticsEngine.track('product_created', {
                    category: productData.category,
                    has_price: !!productData.price,
                    source: 'dashboard'
                });
            }
        } catch (error) {
            console.warn('⚠️ Error en analytics tracking (product_created):', error);
        }
    }

    handleAvatarCreated(avatarData) {
        console.log('👤 Avatar creado:', avatarData);
        
        try {
            if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                window.analyticsEngine.track('avatar_created', {
                    avatar_type: avatarData.type,
                    source: 'dashboard'
                });
            }
        } catch (error) {
            console.warn('⚠️ Error en analytics tracking (avatar_created):', error);
        }
    }

    handleUGCGenerated(generationData) {
        console.log('🎬 UGC generado:', generationData);
        
        try {
            if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                window.analyticsEngine.track('ugc_generated', {
                    style: generationData.style,
                    format: generationData.format,
                    quantity: generationData.quantity,
                    source: 'dashboard'
                });
            }
        } catch (error) {
            console.warn('⚠️ Error en analytics tracking (ugc_generated):', error);
        }
    }

    // Utility methods
    showSuccessNotification(message) {
        this.showNotification(message, 'success');
    }

    showErrorNotification(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10001;
            animation: slideInRight 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // API pública
    getCurrentUser() {
        return this.currentUser;
    }

    isReady() {
        return this.isInitialized && this.currentUser;
    }
}

// Inicializar integración global
window.dashboardSupabaseIntegration = new DashboardSupabaseIntegration();

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardSupabaseIntegration;
}

console.log('🔗 Dashboard Supabase Integration loaded');
