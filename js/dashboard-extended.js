// Extended Dashboard Functionality for All Pages

class DashboardExtended {
    constructor() {
        this.currentPage = 'panel';
        this.data = {
            projects: [],
            products: [],
            brandSettings: {
                name: 'Mi Marca',
                description: 'Descripción de la marca',
                colors: ['#FD624F', '#000000', '#FFFFFF'],
                fonts: [{ name: 'Inter', usage: 'Principal' }],
                tone: 'Amigable y profesional',
                guidelines: {
                    dos: ['Usar colores consistentes', 'Mantener tono amigable'],
                    donts: ['Usar colores fuera de la paleta', 'Tono agresivo']
                },
                assets: []
            },
            avatars: [],
            userProfile: {
                name: 'Usuario',
                email: 'usuario@email.com',
                plan: 'Pro',
                memberSince: '2024',
                settings: {
                    language: 'es',
                    emailNotifications: true,
                    pushNotifications: true,
                    marketingEmails: false,
                    publicProfile: false,
                    shareAnalytics: false
                }
            }
        };
        
        this.init();
    }

    init() {
        this.loadData();
        this.bindExtendedEvents();
        this.loadUserData();
        this.renderCurrentPage();
    }

    loadData() {
        // Load from AppState if available
        if (window.AppState) {
            const state = window.AppState.getState();
            this.data.projects = state.projects || [];
            this.data.userProfile = { ...this.data.userProfile, ...state.user };
            
            // Load brand data from onboarding
            if (state.onboardingData) {
                this.updateBrandFromOnboarding(state.onboardingData);
            }
        }
    }

    loadUserData() {
        // Update user info from onboarding data
        const userData = window.useAppState ? window.useAppState() : null;
        if (userData && userData.onboardingData) {
            this.updateUserProfile(userData.onboardingData);
        }
    }

    updateBrandFromOnboarding(data) {
        this.data.brandSettings = {
            ...this.data.brandSettings,
            name: data.nombre_marca || this.data.brandSettings.name,
            description: data.descripcion_producto || this.data.brandSettings.description,
            tone: this.getToneDisplay(data.tono_voz) || this.data.brandSettings.tone,
            guidelines: {
                dos: data.palabras_usar ? data.palabras_usar.split(',').map(s => s.trim()) : this.data.brandSettings.guidelines.dos,
                donts: data.palabras_evitar ? data.palabras_evitar.split(',').map(s => s.trim()) : this.data.brandSettings.guidelines.donts
            }
        };

        // Auto-create project and product from onboarding
        if (data.nombre_marca && !this.data.projects.length) {
            this.createProjectFromOnboarding(data);
        }

        if (data.tipo_producto && !this.data.products.length) {
            this.createProductFromOnboarding(data);
        }
    }

    updateUserProfile(data) {
        this.data.userProfile = {
            ...this.data.userProfile,
            name: data.nombre_completo || this.data.userProfile.name,
            plan: data.plan_deseado || this.data.userProfile.plan
        };
    }

    getToneDisplay(tone) {
        const toneMap = {
            'amigable': 'Amigable y cercano',
            'premium': 'Premium y elegante',
            'tecnico': 'Técnico y profesional',
            'irreverente': 'Irreverente y atrevido',
            'divertido': 'Divertido y dinámico',
            'profesional': 'Profesional y confiable'
        };
        return toneMap[tone] || tone;
    }

    createProjectFromOnboarding(data) {
        const project = {
            id: this.generateId(),
            name: data.nombre_marca,
            description: data.descripcion_producto,
            status: 'active',
            createdAt: new Date().toISOString(),
            brand: {
                name: data.nombre_marca,
                tone: data.tono_voz,
                guidelines: data.reglas_creativas
            },
            product: {
                type: data.tipo_producto,
                description: data.descripcion_producto,
                benefits: [data.beneficio_1, data.beneficio_2, data.beneficio_3].filter(Boolean)
            },
            ugcCount: 0,
            lastActivity: new Date().toISOString()
        };

        this.data.projects.push(project);
        this.saveData();
    }

    createProductFromOnboarding(data) {
        const product = {
            id: this.generateId(),
            name: data.nombre_marca,
            type: data.tipo_producto,
            description: data.descripcion_producto,
            benefits: [data.beneficio_1, data.beneficio_2, data.beneficio_3].filter(Boolean),
            price: data.precio_producto,
            currency: data.moneda,
            variants: data.variantes_producto,
            usage: data.modo_uso,
            ingredients: data.ingredientes,
            createdAt: new Date().toISOString(),
            status: 'active'
        };

        this.data.products.push(product);
        this.saveData();
    }

    bindExtendedEvents() {
        // Studio Page Events
        this.bindStudioEvents();
        
        // Products Page Events
        this.bindProductsEvents();
        
        // Brand Page Events
        this.bindBrandEvents();
        
        // Avatars Page Events
        this.bindAvatarsEvents();
        
        // Profile Page Events
        this.bindProfileEvents();
    }

    bindStudioEvents() {
        // New Project Button
        document.addEventListener('click', (e) => {
            if (e.target.closest('#newProjectBtn') || e.target.closest('#createFirstProject')) {
                this.showNewProjectModal();
            }
        });

        // Import Project Button
        document.addEventListener('click', (e) => {
            if (e.target.closest('#importProjectBtn')) {
                this.showImportProjectModal();
            }
        });

        // View Controls
        document.addEventListener('click', (e) => {
            if (e.target.closest('.view-btn')) {
                const btn = e.target.closest('.view-btn');
                const view = btn.dataset.view;
                this.changeProjectView(view);
            }
        });
    }

    bindProductsEvents() {
        // Add Product Button
        document.addEventListener('click', (e) => {
            if (e.target.closest('#addProductBtn') || e.target.closest('#addFirstProduct')) {
                this.showNewProductModal();
            }
        });

        // Import Products Button
        document.addEventListener('click', (e) => {
            if (e.target.closest('#importProductsBtn')) {
                this.showImportProductsModal();
            }
        });

        // Product Search
        const productSearch = document.getElementById('productSearch');
        if (productSearch) {
            productSearch.addEventListener('input', (e) => {
                this.filterProducts(e.target.value);
            });
        }

        // Product Filters
        document.addEventListener('click', (e) => {
            if (e.target.closest('.filter-tag')) {
                const tag = e.target.closest('.filter-tag');
                this.setProductFilter(tag.dataset.filter);
            }
        });
    }

    bindBrandEvents() {
        // Edit Brand Button
        document.addEventListener('click', (e) => {
            if (e.target.closest('#editBrandBtn')) {
                this.showEditBrandModal();
            }
        });

        // Export Brand Guide
        document.addEventListener('click', (e) => {
            if (e.target.closest('#exportBrandBtn')) {
                this.exportBrandGuide();
            }
        });

        // Upload Logo
        document.addEventListener('click', (e) => {
            if (e.target.closest('#uploadLogoBtn')) {
                this.uploadBrandLogo();
            }
        });

        // Edit Guidelines
        document.addEventListener('click', (e) => {
            if (e.target.closest('.edit-btn')) {
                const section = e.target.closest('.edit-btn').dataset.section;
                this.editBrandSection(section);
            }
        });

        // Upload Asset
        document.addEventListener('click', (e) => {
            if (e.target.closest('#uploadAssetBtn')) {
                this.uploadBrandAsset();
            }
        });
    }

    bindAvatarsEvents() {
        // Create Avatar Button
        document.addEventListener('click', (e) => {
            if (e.target.closest('#createAvatarBtn') || e.target.closest('#createFirstAvatar')) {
                this.showCreateAvatarModal();
            }
        });

        // Import Avatar Configuration
        document.addEventListener('click', (e) => {
            if (e.target.closest('#importAvatarBtn')) {
                this.showImportAvatarModal();
            }
        });

        // Avatar Type Selection
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-create]')) {
                const type = e.target.closest('[data-create]').dataset.create;
                this.createAvatarType(type);
            }
        });
    }

    bindProfileEvents() {
        // Edit Profile
        document.addEventListener('click', (e) => {
            if (e.target.closest('#editProfileBtn')) {
                this.showEditProfileModal();
            }
        });

        // Change Avatar
        document.addEventListener('click', (e) => {
            if (e.target.closest('#changeAvatarBtn')) {
                this.changeUserAvatar();
            }
        });

        // Settings Changes
        document.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && e.target.id.includes('Notifications') || 
                e.target.id.includes('Profile') || e.target.id.includes('Analytics')) {
                this.updateUserSetting(e.target.id, e.target.checked);
            }
        });

        // Language Change
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                this.updateUserSetting('language', e.target.value);
            });
        }

        // Data Management
        document.addEventListener('click', (e) => {
            if (e.target.closest('#exportDataBtn')) {
                this.exportUserData();
            } else if (e.target.closest('#importDataBtn')) {
                this.importUserData();
            } else if (e.target.closest('#deleteAccountBtn')) {
                this.showDeleteAccountModal();
            }
        });
    }

    renderCurrentPage() {
        // Render based on current page
        if (this.currentPage === 'studio') {
            this.renderStudioPage();
        } else if (this.currentPage === 'productos') {
            this.renderProductsPage();
        } else if (this.currentPage === 'marca') {
            this.renderBrandPage();
        } else if (this.currentPage === 'avatars') {
            this.renderAvatarsPage();
        } else if (this.currentPage === 'perfil') {
            this.renderProfilePage();
        }
    }

    renderStudioPage() {
        const projectsGrid = document.getElementById('projectsGrid');
        const emptyProjects = document.getElementById('emptyProjects');
        
        if (!projectsGrid) return;

        if (this.data.projects.length === 0) {
            projectsGrid.style.display = 'none';
            if (emptyProjects) emptyProjects.style.display = 'block';
        } else {
            projectsGrid.style.display = 'grid';
            if (emptyProjects) emptyProjects.style.display = 'none';
            
            projectsGrid.innerHTML = this.data.projects.map(project => this.createProjectCard(project)).join('');
        }

        this.renderActivityList();
    }

    renderProductsPage() {
        const productsGrid = document.getElementById('productsGrid');
        const emptyProducts = document.getElementById('emptyProducts');
        
        if (!productsGrid) return;

        if (this.data.products.length === 0) {
            productsGrid.style.display = 'none';
            if (emptyProducts) emptyProducts.style.display = 'block';
        } else {
            productsGrid.style.display = 'grid';
            if (emptyProducts) emptyProducts.style.display = 'none';
            
            productsGrid.innerHTML = this.data.products.map(product => this.createProductCard(product)).join('');
        }
    }

    renderBrandPage() {
        this.updateBrandInfo();
        this.updateBrandGuidelines();
        this.updateBrandAssets();
    }

    renderAvatarsPage() {
        const avatarsGrid = document.getElementById('avatarsGrid');
        const emptyAvatars = document.getElementById('emptyAvatars');
        
        if (!avatarsGrid) return;

        if (this.data.avatars.length === 0) {
            avatarsGrid.style.display = 'none';
            if (emptyAvatars) emptyAvatars.style.display = 'block';
        } else {
            avatarsGrid.style.display = 'grid';
            if (emptyAvatars) emptyAvatars.style.display = 'none';
            
            avatarsGrid.innerHTML = this.data.avatars.map(avatar => this.createAvatarCard(avatar)).join('');
        }

        this.updateAvatarAnalytics();
    }

    renderProfilePage() {
        this.updateProfileInfo();
        this.updateProfileSettings();
        this.updateUsageStats();
    }

    // Studio Page Methods
    createProjectCard(project) {
        return `
            <div class="project-card" data-project-id="${project.id}">
                <div class="project-header">
                    <div class="project-status ${project.status}"></div>
                    <h4>${project.name}</h4>
                    <div class="project-menu">
                        <button class="menu-btn">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                </div>
                <div class="project-content">
                    <p>${project.description || 'Sin descripción'}</p>
                    <div class="project-stats">
                        <div class="stat">
                            <span class="stat-value">${project.ugcCount || 0}</span>
                            <span class="stat-label">UGC Generados</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">${this.formatDate(project.lastActivity)}</span>
                            <span class="stat-label">Última actividad</span>
                        </div>
                    </div>
                </div>
                <div class="project-footer">
                    <button class="btn-outline" onclick="dashboardExtended.openProject('${project.id}')">
                        <i class="fas fa-external-link-alt"></i>
                        Abrir
                    </button>
                    <button class="btn-primary" onclick="dashboardExtended.generateUGC('${project.id}')">
                        <i class="fas fa-play"></i>
                        Generar UGC
                    </button>
                </div>
            </div>
        `;
    }

    renderActivityList() {
        const activityList = document.getElementById('activityList');
        if (!activityList) return;

        // Generate sample activities based on projects
        const activities = this.generateRecentActivities();
        
        if (activities.length === 0) {
            activityList.innerHTML = `
                <div class="no-activity">
                    <i class="fas fa-history"></i>
                    <p>No hay actividad reciente</p>
                </div>
            `;
        } else {
            activityList.innerHTML = activities.map(activity => `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas ${activity.icon}"></i>
                    </div>
                    <div class="activity-content">
                        <p>${activity.description}</p>
                        <span class="activity-time">${this.formatDate(activity.timestamp)}</span>
                    </div>
                </div>
            `).join('');
        }
    }

    // Products Page Methods
    createProductCard(product) {
        return `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-image">
                    <div class="product-placeholder">
                        <i class="fas fa-image"></i>
                    </div>
                    <div class="product-type">${product.type}</div>
                </div>
                <div class="product-content">
                    <h4>${product.name}</h4>
                    <p>${product.description}</p>
                    <div class="product-price">
                        ${product.price ? `${product.currency} ${product.price}` : 'Sin precio'}
                    </div>
                    <div class="product-benefits">
                        ${product.benefits ? product.benefits.slice(0, 2).map(benefit => 
                            `<span class="benefit-tag">✓ ${benefit}</span>`
                        ).join('') : ''}
                    </div>
                </div>
                <div class="product-footer">
                    <button class="btn-outline" onclick="dashboardExtended.editProduct('${product.id}')">
                        <i class="fas fa-edit"></i>
                        Editar
                    </button>
                    <button class="btn-primary" onclick="dashboardExtended.useProduct('${product.id}')">
                        <i class="fas fa-magic"></i>
                        Usar en UGC
                    </button>
                </div>
            </div>
        `;
    }

    // Brand Page Methods
    updateBrandInfo() {
        const brandName = document.getElementById('brandName');
        const brandDescription = document.getElementById('brandDescription');
        const brandProjects = document.getElementById('brandProjects');
        const brandAssets = document.getElementById('brandAssets');
        const brandStyles = document.getElementById('brandStyles');

        if (brandName) brandName.textContent = this.data.brandSettings.name;
        if (brandDescription) brandDescription.textContent = this.data.brandSettings.description;
        if (brandProjects) brandProjects.textContent = this.data.projects.length;
        if (brandAssets) brandAssets.textContent = this.data.brandSettings.assets.length;
        if (brandStyles) brandStyles.textContent = '9'; // Static for now
    }

    updateBrandGuidelines() {
        const brandTone = document.getElementById('brandTone');
        const brandDos = document.getElementById('brandDos');
        const brandDonts = document.getElementById('brandDonts');

        if (brandTone) {
            brandTone.innerHTML = `<p>${this.data.brandSettings.tone}</p>`;
        }

        if (brandDos) {
            brandDos.innerHTML = this.data.brandSettings.guidelines.dos.map(item => 
                `<li>${item}</li>`
            ).join('');
        }

        if (brandDonts) {
            brandDonts.innerHTML = this.data.brandSettings.guidelines.donts.map(item => 
                `<li>${item}</li>`
            ).join('');
        }
    }

    updateBrandAssets() {
        const assetsGrid = document.getElementById('brandAssets');
        if (!assetsGrid) return;

        if (this.data.brandSettings.assets.length === 0) {
            assetsGrid.innerHTML = `
                <div class="no-assets">
                    <i class="fas fa-folder-open"></i>
                    <p>No hay assets subidos</p>
                </div>
            `;
        } else {
            assetsGrid.innerHTML = this.data.brandSettings.assets.map(asset => `
                <div class="asset-item">
                    <div class="asset-preview">
                        <i class="fas fa-file"></i>
                    </div>
                    <div class="asset-name">${asset.name}</div>
                </div>
            `).join('');
        }
    }

    // Avatars Page Methods
    createAvatarCard(avatar) {
        return `
            <div class="avatar-card" data-avatar-id="${avatar.id}">
                <div class="avatar-preview">
                    <div class="avatar-image">
                        <i class="fas ${avatar.type === 'ai' ? 'fa-robot' : 'fa-user'}"></i>
                    </div>
                    <div class="avatar-type-badge ${avatar.type}">${avatar.type === 'ai' ? 'IA' : 'Humano'}</div>
                </div>
                <div class="avatar-content">
                    <h4>${avatar.name}</h4>
                    <p>${avatar.description}</p>
                    <div class="avatar-stats">
                        <div class="stat">
                            <span class="stat-value">${avatar.ugcGenerated || 0}</span>
                            <span class="stat-label">UGC Generados</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">${avatar.engagement || '0%'}</span>
                            <span class="stat-label">Engagement</span>
                        </div>
                    </div>
                </div>
                <div class="avatar-footer">
                    <button class="btn-outline" onclick="dashboardExtended.editAvatar('${avatar.id}')">
                        <i class="fas fa-edit"></i>
                        Editar
                    </button>
                    <button class="btn-primary" onclick="dashboardExtended.useAvatar('${avatar.id}')">
                        <i class="fas fa-play"></i>
                        Usar Avatar
                    </button>
                </div>
            </div>
        `;
    }

    updateAvatarAnalytics() {
        const totalUGC = document.getElementById('totalUGC');
        const engagementRate = document.getElementById('engagementRate');
        const activeAvatars = document.getElementById('activeAvatars');

        if (totalUGC) totalUGC.textContent = this.calculateTotalUGC();
        if (engagementRate) engagementRate.textContent = this.calculateAverageEngagement();
        if (activeAvatars) activeAvatars.textContent = this.data.avatars.filter(a => a.status === 'active').length;
    }

    // Profile Page Methods
    updateProfileInfo() {
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        const userPlan = document.getElementById('userPlan');
        const memberSince = document.getElementById('memberSince');

        if (userName) userName.textContent = this.data.userProfile.name;
        if (userEmail) userEmail.textContent = this.data.userProfile.email;
        if (userPlan) userPlan.textContent = `Plan ${this.data.userProfile.plan}`;
        if (memberSince) memberSince.textContent = `Miembro desde ${this.data.userProfile.memberSince}`;
    }

    updateProfileSettings() {
        // Update toggle switches based on user settings
        Object.keys(this.data.userProfile.settings).forEach(setting => {
            const element = document.getElementById(setting);
            if (element && element.type === 'checkbox') {
                element.checked = this.data.userProfile.settings[setting];
            }
        });

        // Update language select
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.value = this.data.userProfile.settings.language;
        }
    }

    updateUsageStats() {
        const totalProjectsEl = document.getElementById('totalProjects');
        const totalGenerationsEl = document.getElementById('totalGenerations');
        const timeSpentEl = document.getElementById('timeSpent');

        if (totalProjectsEl) totalProjectsEl.textContent = this.data.projects.length;
        if (totalGenerationsEl) totalGenerationsEl.textContent = this.calculateTotalGenerations();
        if (timeSpentEl) timeSpentEl.textContent = this.calculateTimeSpent();
    }

    // Utility Methods
    generateId() {
        return 'ugc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'Ayer';
        if (diffDays < 7) return `Hace ${diffDays} días`;
        if (diffDays < 30) return `Hace ${Math.ceil(diffDays / 7)} semanas`;
        return date.toLocaleDateString();
    }

    generateRecentActivities() {
        const activities = [];
        
        this.data.projects.forEach(project => {
            activities.push({
                icon: 'fa-folder-plus',
                description: `Proyecto "${project.name}" creado`,
                timestamp: project.createdAt
            });
        });

        this.data.products.forEach(product => {
            activities.push({
                icon: 'fa-shopping-bag',
                description: `Producto "${product.name}" agregado`,
                timestamp: product.createdAt
            });
        });

        return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
    }

    calculateTotalUGC() {
        return this.data.projects.reduce((total, project) => total + (project.ugcCount || 0), 0);
    }

    calculateAverageEngagement() {
        if (this.data.avatars.length === 0) return '0%';
        const totalEngagement = this.data.avatars.reduce((total, avatar) => {
            return total + (parseFloat(avatar.engagement) || 0);
        }, 0);
        return `${(totalEngagement / this.data.avatars.length).toFixed(1)}%`;
    }

    calculateTotalGenerations() {
        return this.calculateTotalUGC();
    }

    calculateTimeSpent() {
        // Simulate time spent calculation
        const projects = this.data.projects.length;
        const estimatedHours = projects * 2; // 2 hours per project on average
        return `${estimatedHours}h`;
    }

    saveData() {
        // Save to AppState if available
        if (window.updateAppState) {
            window.updateAppState({
                projects: this.data.projects,
                products: this.data.products,
                avatars: this.data.avatars,
                brandSettings: this.data.brandSettings,
                userProfile: this.data.userProfile
            });
        }
    }

    // Modal and Action Methods (Placeholder - just show notifications)
    showNewProjectModal() {
        this.showNotification('Funcionalidad de nuevo proyecto próximamente', 'info');
    }

    showImportProjectModal() {
        this.showNotification('Funcionalidad de importar proyecto próximamente', 'info');
    }

    showNewProductModal() {
        this.showNotification('Funcionalidad de nuevo producto próximamente', 'info');
    }

    showEditBrandModal() {
        this.showNotification('Funcionalidad de editar marca próximamente', 'info');
    }

    showCreateAvatarModal() {
        this.showNotification('Funcionalidad de crear avatar próximamente', 'info');
    }

    showEditProfileModal() {
        this.showNotification('Funcionalidad de editar perfil próximamente', 'info');
    }

    exportBrandGuide() {
        this.showNotification('Exportando guía de marca...', 'success');
    }

    exportUserData() {
        // Create downloadable JSON
        const dataToExport = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            data: this.data
        };
        
        const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ugc-studio-data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Datos exportados correctamente', 'success');
    }

    // Filter and View Methods
    changeProjectView(view) {
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        const projectsGrid = document.getElementById('projectsGrid');
        if (projectsGrid) {
            projectsGrid.className = `projects-${view}`;
        }
    }

    filterProducts(searchTerm) {
        const productCards = document.querySelectorAll('.product-card');
        productCards.forEach(card => {
            const productName = card.querySelector('h4').textContent.toLowerCase();
            const visible = productName.includes(searchTerm.toLowerCase());
            card.style.display = visible ? 'block' : 'none';
        });
    }

    setProductFilter(filter) {
        document.querySelectorAll('.filter-tag').forEach(tag => tag.classList.remove('active'));
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        
        const productCards = document.querySelectorAll('.product-card');
        productCards.forEach(card => {
            if (filter === 'all') {
                card.style.display = 'block';
            } else {
                const productType = card.querySelector('.product-type').textContent.toLowerCase();
                const visible = productType.includes(filter);
                card.style.display = visible ? 'block' : 'none';
            }
        });
    }

    updateUserSetting(setting, value) {
        this.data.userProfile.settings[setting] = value;
        this.saveData();
        this.showNotification('Configuración actualizada', 'success');
    }

    showNotification(message, type = 'info') {
        // Reuse notification system from dashboard.js
        if (window.UGCDashboard && window.UGCDashboard.prototype.showNotification) {
            const dashboard = document.querySelector('.ugc-dashboard') || { showNotification: () => {} };
            if (dashboard.showNotification) {
                dashboard.showNotification(message, type);
            }
        } else {
            // Fallback simple notification
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Initialize extended dashboard
let dashboardExtended;

document.addEventListener('DOMContentLoaded', () => {
    dashboardExtended = new DashboardExtended();
    
    // Make globally available
    window.dashboardExtended = dashboardExtended;
});

// Add CSS for new components
const extendedStyles = document.createElement('style');
extendedStyles.textContent = `
    .project-card, .product-card, .avatar-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 1.5rem;
        transition: all 0.3s ease;
    }
    
    .project-card:hover, .product-card:hover, .avatar-card:hover {
        border-color: var(--primary-color);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
    }
    
    .project-header, .product-header, .avatar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }
    
    .project-status, .product-status, .avatar-status {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--primary-color);
    }
    
    .project-stats, .product-stats, .avatar-stats {
        display: flex;
        gap: 1rem;
        margin: 1rem 0;
    }
    
    .project-footer, .product-footer, .avatar-footer {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
    }
    
    .activity-item {
        display: flex;
        gap: 1rem;
        padding: 1rem 0;
        border-bottom: 1px solid var(--border-color);
    }
    
    .activity-item:last-child {
        border-bottom: none;
    }
    
    .activity-icon {
        width: 40px;
        height: 40px;
        background: rgba(253, 98, 79, 0.1);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--primary-color);
    }
    
    .activity-content p {
        margin: 0;
        color: var(--text-primary);
    }
    
    .activity-time {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }
    
    .product-image, .avatar-preview {
        width: 100%;
        height: 120px;
        background: var(--bg-dark);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 1rem;
        position: relative;
    }
    
    .product-placeholder, .avatar-image {
        font-size: 2rem;
        color: var(--text-secondary);
    }
    
    .product-type, .avatar-type-badge {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        background: var(--primary-color);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.7rem;
        text-transform: uppercase;
    }
    
    .product-benefits {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin: 0.5rem 0;
    }
    
    .benefit-tag {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }
    
    .no-activity, .no-assets {
        text-align: center;
        padding: 2rem;
        color: var(--text-secondary);
    }
    
    .no-activity i, .no-assets i {
        font-size: 2rem;
        margin-bottom: 0.5rem;
        opacity: 0.5;
    }
    
    .projects-list .projects-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .projects-list .project-card {
        display: flex;
        align-items: center;
        padding: 1rem 1.5rem;
    }
    
    .projects-list .project-content {
        flex: 1;
        margin: 0 1rem;
    }
    
    .projects-list .project-stats {
        margin: 0;
    }
`;

document.head.appendChild(extendedStyles);
