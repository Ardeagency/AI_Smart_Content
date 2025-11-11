/**
 * AI Smart Content - Living Page
 * Página principal de la interfaz de usuario
 */

class LivingManager {
    constructor() {
        this.supabase = null;
        this.userId = null;
        this.userData = null;
        this.projectData = null;
        this.brandData = null;
        this.init();
    }

    async init() {
        await this.initSupabase();
        if (this.supabase && this.userId) {
            console.log('✅ Supabase inicializado, cargando datos...');
            console.log('👤 User ID:', this.userId);
            await this.loadUserData();
            await this.loadProjectData();
            if (this.projectData) {
                console.log('✅ Proyecto encontrado:', this.projectData.id);
                await this.loadBrandData();
                await this.loadBrandFiles();
                await this.loadProducts();
                await this.loadCampaigns();
            } else {
                console.warn('⚠️ No se encontró proyecto para el usuario');
            }
            this.renderAll();
        } else {
            console.error('❌ No se pudo inicializar Supabase o no hay usuario');
            console.log('Supabase:', this.supabase);
            console.log('UserId:', this.userId);
        }
        this.setupEventListeners();
    }

    async initSupabase() {
        try {
            if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase();
            } else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            }

            if (this.supabase) {
                const { data: { user } } = await this.supabase.auth.getUser();
                if (user) {
                    this.userId = user.id;
                }
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
        }
    }

    async loadUserData() {
        if (!this.supabase || !this.userId) return;

        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('id', this.userId)
                .single();

            if (error) throw error;
            this.userData = data;
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async loadProjectData() {
        if (!this.supabase || !this.userId) {
            console.warn('⚠️ No se puede cargar proyecto: Supabase o userId no disponible');
            return;
        }

        try {
            console.log('📋 Cargando proyecto para usuario:', this.userId);
            const { data, error } = await this.supabase
                .from('projects')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    console.warn('⚠️ No se encontró proyecto para el usuario');
                    this.projectData = null;
                } else {
                    console.error('❌ Error cargando proyecto:', error);
                    throw error;
                }
            } else {
                this.projectData = data;
                console.log('✅ Proyecto cargado:', data);
            }
        } catch (error) {
            console.error('❌ Error loading project data:', error);
            this.projectData = null;
        }
    }

    async loadBrandData() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data, error } = await this.supabase
                .from('brands')
                .select('*')
                .eq('project_id', this.projectData.id)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            this.brandData = data;
        } catch (error) {
            console.error('Error loading brand data:', error);
        }
    }

    async loadBrandFiles() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data, error } = await this.supabase
                .from('brand_files')
                .select('*')
                .eq('project_id', this.projectData.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.brandFiles = data || [];
        } catch (error) {
            console.error('Error loading brand files:', error);
            this.brandFiles = [];
        }
    }

    async loadProducts() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data: products, error: productsError } = await this.supabase
                .from('products')
                .select('*')
                .eq('project_id', this.projectData.id)
                .order('created_at', { ascending: false });

            if (productsError) throw productsError;

            // Cargar imágenes de cada producto
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
        } catch (error) {
            console.error('Error loading products:', error);
            this.products = [];
        }
    }

    async loadCampaigns() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data, error } = await this.supabase
                .from('campaigns')
                .select('*')
                .eq('project_id', this.projectData.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.campaigns = data || [];
        } catch (error) {
            console.error('Error loading campaigns:', error);
            this.campaigns = [];
        }
    }

    renderAll() {
        this.renderUserInfo();
        this.renderBrandInfo();
        this.renderBrandGuidelines();
        this.renderMarketsAndLanguages();
        this.renderBrandFiles();
        this.renderProducts();
        this.renderCampaigns();
    }

    renderUserInfo() {
        if (!this.userData) return;

        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        const userPlanEl = document.getElementById('userPlan');

        if (userNameEl) {
            userNameEl.textContent = this.userData.full_name || 'No especificado';
        }
        if (userEmailEl) {
            userEmailEl.textContent = this.userData.email || '-';
        }
        if (userPlanEl) {
            const planNames = {
                'basico': 'Básico',
                'pro': 'Pro',
                'enterprise': 'Enterprise'
            };
            userPlanEl.textContent = planNames[this.userData.plan_type] || this.userData.plan_type || '-';
        }
    }

    renderBrandInfo() {
        if (!this.projectData) return;

        const brandNameEl = document.getElementById('brandName');
        const brandEmailEl = document.getElementById('brandEmail');
        const brandLogoEl = document.getElementById('brandLogo');
        const logoPlaceholderEl = document.getElementById('logoPlaceholder');
        const brandLinksEl = document.getElementById('brandLinks');

        if (brandNameEl) {
            brandNameEl.textContent = this.projectData.nombre_marca || 'Sin nombre';
        }

        if (brandEmailEl && this.userData) {
            brandEmailEl.textContent = this.userData.email || '-';
        }

        // Logo
        if (this.projectData.logo_url) {
            if (brandLogoEl) {
                brandLogoEl.src = this.projectData.logo_url;
                brandLogoEl.style.display = 'block';
            }
            if (logoPlaceholderEl) {
                logoPlaceholderEl.style.display = 'none';
            }
        } else {
            if (brandLogoEl) brandLogoEl.style.display = 'none';
            if (logoPlaceholderEl) logoPlaceholderEl.style.display = 'flex';
        }

        // Links
        if (brandLinksEl) {
            brandLinksEl.innerHTML = '';
            if (this.projectData.sitio_web) {
                const webLink = document.createElement('a');
                webLink.href = this.projectData.sitio_web;
                webLink.target = '_blank';
                webLink.className = 'brand-link';
                webLink.innerHTML = '<i class="fas fa-globe"></i> Sitio Web';
                brandLinksEl.appendChild(webLink);
            }
            if (this.projectData.instagram_url) {
                const igLink = document.createElement('a');
                igLink.href = this.projectData.instagram_url;
                igLink.target = '_blank';
                igLink.className = 'brand-link';
                igLink.innerHTML = '<i class="fab fa-instagram"></i> Instagram';
                brandLinksEl.appendChild(igLink);
            }
            if (this.projectData.tiktok_url) {
                const tiktokLink = document.createElement('a');
                tiktokLink.href = this.projectData.tiktok_url;
                tiktokLink.target = '_blank';
                tiktokLink.className = 'brand-link';
                tiktokLink.innerHTML = '<i class="fab fa-tiktok"></i> TikTok';
                brandLinksEl.appendChild(tiktokLink);
            }
        }
    }

    renderBrandGuidelines() {
        if (!this.brandData) return;

        const tonoVozEl = document.getElementById('tonoVoz');
        const palabrasUsarEl = document.getElementById('palabrasUsar');
        const palabrasEvitarEl = document.getElementById('palabrasEvitar');
        const reglasCreativasEl = document.getElementById('reglasCreativas');

        if (tonoVozEl) {
            const tonoVozNames = {
                'amigable': 'Amigable',
                'premium': 'Premium',
                'tecnico': 'Técnico',
                'irreverente': 'Irreverente',
                'divertido': 'Divertido',
                'profesional': 'Profesional',
                'casual': 'Casual',
                'inspirador': 'Inspirador',
                'autoritario': 'Autoritario',
                'empatico': 'Empático',
                'humoristico': 'Humorístico',
                'serio': 'Serio',
                'joven': 'Joven',
                'tradicional': 'Tradicional',
                'innovador': 'Innovador',
                'calido': 'Cálido',
                'directo': 'Directo',
                'poetico': 'Poético',
                'energico': 'Enérgico',
                'tranquilo': 'Tranquilo'
            };
            tonoVozEl.textContent = tonoVozNames[this.brandData.tono_voz] || this.brandData.tono_voz || '-';
        }

        if (palabrasUsarEl) {
            palabrasUsarEl.textContent = this.brandData.palabras_usar || '-';
        }

        if (palabrasEvitarEl) {
            palabrasEvitarEl.innerHTML = '';
            if (this.brandData.palabras_evitar && Array.isArray(this.brandData.palabras_evitar) && this.brandData.palabras_evitar.length > 0) {
                this.brandData.palabras_evitar.forEach(palabra => {
                    const tag = document.createElement('span');
                    tag.className = 'tag';
                    tag.textContent = palabra;
                    palabrasEvitarEl.appendChild(tag);
                });
            } else {
                palabrasEvitarEl.innerHTML = '<span class="info-value">-</span>';
            }
        }

        if (reglasCreativasEl) {
            reglasCreativasEl.textContent = this.brandData.reglas_creativas || '-';
        }
    }

    renderMarketsAndLanguages() {
        if (!this.projectData) return;

        const mercadosEl = document.getElementById('mercadosObjetivo');
        const idiomasEl = document.getElementById('idiomasContenido');

        if (mercadosEl) {
            mercadosEl.innerHTML = '';
            if (this.projectData.mercado_objetivo && Array.isArray(this.projectData.mercado_objetivo) && this.projectData.mercado_objetivo.length > 0) {
                this.projectData.mercado_objetivo.forEach(mercado => {
                    const tag = document.createElement('span');
                    tag.className = 'tag';
                    tag.textContent = mercado;
                    mercadosEl.appendChild(tag);
                });
            } else {
                mercadosEl.innerHTML = '<span class="info-value">-</span>';
            }
        }

        if (idiomasEl) {
            idiomasEl.innerHTML = '';
            if (this.projectData.idiomas_contenido && Array.isArray(this.projectData.idiomas_contenido) && this.projectData.idiomas_contenido.length > 0) {
                this.projectData.idiomas_contenido.forEach(idioma => {
                    const tag = document.createElement('span');
                    tag.className = 'tag';
                    tag.textContent = idioma;
                    idiomasEl.appendChild(tag);
                });
            } else {
                idiomasEl.innerHTML = '<span class="info-value">-</span>';
            }
        }
    }

    renderBrandFiles() {
        const filesListEl = document.getElementById('brandFilesList');
        if (!filesListEl) return;

        filesListEl.innerHTML = '';

        if (!this.brandFiles || this.brandFiles.length === 0) {
            filesListEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No hay archivos adjuntados</p>
                </div>
            `;
            return;
        }

        this.brandFiles.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';

            const fileExtension = file.file_name.split('.').pop().toLowerCase();
            const iconMap = {
                'pdf': 'fa-file-pdf',
                'doc': 'fa-file-word',
                'docx': 'fa-file-word',
                'zip': 'fa-file-archive',
                'jpg': 'fa-file-image',
                'jpeg': 'fa-file-image',
                'png': 'fa-file-image'
            };
            const icon = iconMap[fileExtension] || 'fa-file';

            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-icon">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="file-details">
                        <p class="file-name">${file.file_name}</p>
                        <span class="file-size">${this.formatFileSize(file.file_size)}</span>
                    </div>
                </div>
                <a href="${file.file_url}" target="_blank" class="file-link">
                    <i class="fas fa-external-link-alt"></i>
                    Ver
                </a>
            `;

            filesListEl.appendChild(fileItem);
        });
    }

    renderProducts() {
        const productsListEl = document.getElementById('productsList');
        if (!productsListEl) return;

        productsListEl.innerHTML = '';

        if (!this.products || this.products.length === 0) {
            productsListEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <p>No hay productos registrados</p>
                </div>
            `;
            return;
        }

        this.products.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card';

            let imagesHTML = '';
            if (product.images && product.images.length > 0) {
                const imagesToShow = product.images.slice(0, 4);
                imagesHTML = `
                    <div class="product-images">
                        ${imagesToShow.map(img => `
                            <img src="${img.image_url}" alt="${product.nombre_producto}" class="product-image" onerror="this.style.display='none'">
                        `).join('')}
                    </div>
                `;
            }

            productCard.innerHTML = `
                ${imagesHTML}
                <h3 class="product-name">${product.nombre_producto}</h3>
                <span class="product-type">${this.formatProductType(product.tipo_producto)}</span>
                <p class="product-description">${product.descripcion_producto || 'Sin descripción'}</p>
            `;

            productsListEl.appendChild(productCard);
        });
    }

    renderCampaigns() {
        const campaignsListEl = document.getElementById('campaignsList');
        if (!campaignsListEl) return;

        campaignsListEl.innerHTML = '';

        if (!this.campaigns || this.campaigns.length === 0) {
            campaignsListEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-megaphone"></i>
                    <p>No hay campañas creadas</p>
                </div>
            `;
            return;
        }

        this.campaigns.forEach(campaign => {
            const campaignCard = document.createElement('div');
            campaignCard.className = 'campaign-card';

            campaignCard.innerHTML = `
                ${campaign.oferta_desc ? `
                    <div class="campaign-item">
                        <div class="campaign-label">Oferta</div>
                        <div class="campaign-value">${campaign.oferta_desc}</div>
                    </div>
                ` : ''}
                <div class="campaign-item">
                    <div class="campaign-label">Audiencia</div>
                    <div class="campaign-value">${campaign.audiencia_desc || '-'}</div>
                </div>
                ${campaign.intenciones ? `
                    <div class="campaign-item">
                        <div class="campaign-label">Intenciones</div>
                        <div class="campaign-value">${campaign.intenciones}</div>
                    </div>
                ` : ''}
                <div class="campaign-item">
                    <div class="campaign-label">Objetivo Principal</div>
                    <div class="campaign-value">${campaign.objetivo_principal || '-'}</div>
                </div>
                ${campaign.cta && campaign.cta_url ? `
                    <a href="${campaign.cta_url}" target="_blank" class="campaign-cta">
                        ${campaign.cta}
                        <i class="fas fa-arrow-right"></i>
                    </a>
                ` : ''}
            `;

            campaignsListEl.appendChild(campaignCard);
        });
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatProductType(type) {
        const typeNames = {
            'bebida': 'Bebida',
            'bebida_alcoholica': 'Bebida Alcohólica',
            'agua': 'Agua',
            'energetica': 'Energética',
            'alimento': 'Alimento',
            'snack': 'Snack',
            'suplemento_alimenticio': 'Suplemento Alimenticio',
            'cosmetico': 'Cosmético',
            'skincare': 'Skincare',
            'maquillaje': 'Maquillaje',
            'perfume': 'Perfume',
            'cuidado_cabello': 'Cuidado del Cabello',
            'cuidado_personal': 'Cuidado Personal',
            'higiene': 'Higiene',
            'app': 'App',
            'electronico': 'Electrónico',
            'smartphone': 'Smartphone',
            'tablet': 'Tablet',
            'accesorio_tech': 'Accesorio Tech',
            'gadget': 'Gadget',
            'ropa': 'Ropa',
            'calzado': 'Calzado',
            'accesorio_moda': 'Accesorio de Moda',
            'reloj': 'Reloj',
            'joyeria': 'Joyería',
            'suplemento': 'Suplemento',
            'vitamina': 'Vitamina',
            'fitness': 'Fitness',
            'bienestar': 'Bienestar',
            'salud': 'Salud',
            'hogar': 'Hogar',
            'decoracion': 'Decoración',
            'mueble': 'Mueble',
            'electrodomestico': 'Electrodoméstico',
            'servicio': 'Servicio',
            'educacion': 'Educación',
            'financiero': 'Financiero',
            'salud_servicio': 'Salud (Servicio)',
            'entretenimiento': 'Entretenimiento',
            'libro': 'Libro',
            'juego': 'Juego',
            'juguete': 'Juguete',
            'automotriz': 'Automotriz',
            'deportivo': 'Deportivo',
            'otro': 'Otro'
        };
        return typeNames[type] || type;
    }

    setupEventListeners() {
        // Navigation ya se maneja en navigation.js
    }
}

// Initialize when DOM is ready
let livingManager;
document.addEventListener('DOMContentLoaded', () => {
    livingManager = new LivingManager();
    window.livingManager = livingManager;
});

