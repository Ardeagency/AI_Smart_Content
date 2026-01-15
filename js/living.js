/**
 * Living Dashboard - Dashboard básico y fácil de leer
 * Muestra: tokens, imágenes del día, producto favorito, mayor producción, últimas producciones
 */

class LivingManager {
    constructor() {
        this.supabase = null;
        this.userId = null;
        this.userData = null;
        this.projectData = null;
        this.products = [];
        this.flowRuns = [];
        this.flowOutputs = [];
        this.creditUsage = [];
        this.eventListenersSetup = false;

        this.init();
    }

    async init() {
        // Verificar acceso antes de continuar
        if (typeof verifyUserAccess === 'function') {
            const hasAccess = await verifyUserAccess();
            if (!hasAccess) {
                return;
            }
        }

        await this.initSupabase();
        if (this.supabase && this.userId) {
            console.log('✅ Supabase inicializado, cargando datos del dashboard...');
            await this.loadUserData();
            await this.loadProjectData();
            if (this.projectData) {
                await this.loadProducts();
                await this.loadFlowRuns();
                await this.loadFlowOutputs();
                await this.loadCreditUsage();
            }
            this.renderAll();
        } else {
            console.error('❌ No se pudo inicializar Supabase o no hay usuario');
        }

        if (!this.eventListenersSetup) {
            this.setupEventListeners();
            this.eventListenersSetup = true;
        }
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

            if (error && error.code !== 'PGRST116') throw error;
            
            if (!data) {
                // Crear usuario básico si no existe
                const { data: { user } } = await this.supabase.auth.getUser();
                if (user) {
                    const { error: createError } = await this.supabase
                        .from('users')
                        .insert({
                            id: this.userId,
                            email: user.email,
                            full_name: user.user_metadata?.full_name || user.email,
                            plan_type: 'basico',
                            credits_available: 0,
                            credits_total: 0
                        });
                    
                    if (!createError) {
                        const { data: newData } = await this.supabase
                            .from('users')
                            .select('*')
                            .eq('id', this.userId)
                            .single();
                        this.userData = newData;
                    }
                }
            } else {
                this.userData = data;
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async loadProjectData() {
        if (!this.supabase || !this.userId) return;

        try {
            const { data, error } = await this.supabase
                .from('brand_containers')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            this.projectData = data || null;
        } catch (error) {
            console.error('Error loading project data:', error);
            this.projectData = null;
        }
    }

    async loadProducts() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data: products, error } = await this.supabase
                .from('products')
                .select('*')
                .eq('brand_container_id', this.projectData.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Cargar imágenes de cada producto
            if (products && products.length > 0) {
                for (const product of products) {
                    const { data: images } = await this.supabase
                        .from('product_images')
                        .select('*')
                        .eq('product_id', product.id)
                        .order('image_order', { ascending: true })
                        .limit(1);

                    if (images && images.length > 0) {
                        product.mainImage = images[0].image_url;
                    }
                }
            }

            this.products = products || [];
        } catch (error) {
            console.error('Error loading products:', error);
            this.products = [];
        }
    }

    async loadFlowRuns() {
        if (!this.supabase || !this.userId) return;

        try {
            const { data, error } = await this.supabase
                .from('flow_runs')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            this.flowRuns = data || [];
        } catch (error) {
            console.error('Error loading flow runs:', error);
            this.flowRuns = [];
        }
    }

    async loadFlowOutputs() {
        if (!this.supabase || !this.flowRuns.length) return;

        try {
            const runIds = this.flowRuns.map(run => run.id);
            const { data, error } = await this.supabase
                .from('flow_outputs')
                .select('*')
                .in('run_id', runIds)
                .eq('output_type', 'image')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.flowOutputs = data || [];
        } catch (error) {
            console.error('Error loading flow outputs:', error);
            this.flowOutputs = [];
        }
    }

    async loadCreditUsage() {
        if (!this.supabase || !this.userId) return;

        try {
            const { data, error } = await this.supabase
                .from('credit_usage')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.creditUsage = data || [];
        } catch (error) {
            console.error('Error loading credit usage:', error);
            this.creditUsage = [];
        }
    }

    renderAll() {
        this.renderTokens();
        this.renderImagesOfDay();
        this.renderFavoriteProduct();
        this.renderTopProductionProduct();
        this.renderLatestProductions();
    }

    renderTokens() {
        const tokensUsedEl = document.getElementById('tokensUsed');
        const tokensAvailableEl = document.getElementById('tokensAvailable');
        const tokensTotalEl = document.getElementById('tokensTotal');
        const tokensProgressFillEl = document.getElementById('tokensProgressFill');
        const tokensPercentageEl = document.getElementById('tokensPercentage');

        if (!tokensUsedEl || !tokensAvailableEl || !tokensTotalEl || !tokensProgressFillEl || !tokensPercentageEl) return;

        const totalCredits = this.userData?.credits_total || 0;
        const availableCredits = this.userData?.credits_available || 0;
        const usedCredits = totalCredits - availableCredits;

        tokensUsedEl.textContent = usedCredits.toLocaleString();
        tokensAvailableEl.textContent = availableCredits.toLocaleString();
        tokensTotalEl.textContent = totalCredits.toLocaleString();

        const percentage = totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0;
        tokensProgressFillEl.style.width = `${percentage}%`;
        tokensPercentageEl.textContent = `${percentage}% usado`;
    }

    renderImagesOfDay() {
        const imagesOfDayEl = document.getElementById('imagesOfDay');
        if (!imagesOfDayEl) return;

        // Obtener imágenes generadas hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayImages = this.flowOutputs
            .filter(output => {
                const outputDate = new Date(output.created_at);
                outputDate.setHours(0, 0, 0, 0);
                return outputDate.getTime() === today.getTime();
            })
            .slice(0, 3);

        if (todayImages.length === 0) {
            imagesOfDayEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images"></i>
                    <p>No hay imágenes generadas hoy</p>
                </div>
            `;
            return;
        }

        imagesOfDayEl.innerHTML = todayImages.map(output => `
            <div class="image-of-day-item">
                <img src="${output.file_url}" alt="Imagen generada" onerror="this.parentElement.innerHTML='<div class=\\'image-of-day-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'">
            </div>
        `).join('');
    }

    renderFavoriteProduct() {
        const favoriteProductEl = document.getElementById('favoriteProduct');
        if (!favoriteProductEl) return;

        if (this.products.length === 0) {
            favoriteProductEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-star"></i>
                    <p>No hay productos registrados</p>
                </div>
            `;
            return;
        }

        // Producto favorito: el más usado en producciones (flow_runs con brand_id que corresponde a producto)
        // Por ahora, usar el primer producto como favorito
        const favoriteProduct = this.products[0];

        favoriteProductEl.innerHTML = `
            <div class="favorite-product-content">
                <div class="favorite-product-image">
                    ${favoriteProduct.mainImage 
                        ? `<img src="${favoriteProduct.mainImage}" alt="${favoriteProduct.nombre_producto}" onerror="this.parentElement.innerHTML='<div class=\\'no-image\\'><i class=\\'fas fa-box\\'></i></div>'">`
                        : `<div class="no-image"><i class="fas fa-box"></i></div>`
                    }
                </div>
                <div class="favorite-product-info">
                    <h3 class="favorite-product-name">${this.escapeHtml(favoriteProduct.nombre_producto)}</h3>
                    <p class="favorite-product-type">${this.escapeHtml(favoriteProduct.tipo_producto || 'Producto')}</p>
                    <div class="favorite-product-stats">
                        <div class="favorite-product-stat">
                            <span class="favorite-product-stat-label">Producciones</span>
                            <span class="favorite-product-stat-value">0</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderTopProductionProduct() {
        const topProductionEl = document.getElementById('topProductionProduct');
        if (!topProductionEl) return;

        if (this.products.length === 0) {
            topProductionEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-line"></i>
                    <p>No hay productos registrados</p>
                </div>
            `;
            return;
        }

        // Contar producciones por producto (basado en flow_runs)
        // Por ahora, usar el primer producto
        const topProduct = this.products[0];
        const productionCount = 0; // TODO: Contar flow_runs asociados al producto

        topProductionEl.innerHTML = `
            <div class="top-production-content">
                <div class="top-production-image">
                    ${topProduct.mainImage 
                        ? `<img src="${topProduct.mainImage}" alt="${topProduct.nombre_producto}" onerror="this.parentElement.innerHTML='<div class=\\'no-image\\'><i class=\\'fas fa-box\\'></i></div>'">`
                        : `<div class="no-image"><i class="fas fa-box"></i></div>`
                    }
                </div>
                <div class="top-production-info">
                    <h3 class="top-production-name">${this.escapeHtml(topProduct.nombre_producto)}</h3>
                    <p class="top-production-type">${this.escapeHtml(topProduct.tipo_producto || 'Producto')}</p>
                    <div class="top-production-count">
                        <i class="fas fa-chart-line top-production-count-icon"></i>
                        <span class="top-production-count-value">${productionCount}</span>
                        <span class="top-production-count-label">producciones</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderLatestProductions() {
        const productionsListEl = document.getElementById('productionsList');
        if (!productionsListEl) return;

        if (this.flowRuns.length === 0) {
            productionsListEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <p>No hay producciones recientes</p>
                </div>
            `;
            return;
        }

        // Obtener últimas 10 producciones
        const latestRuns = this.flowRuns.slice(0, 10);

        productionsListEl.innerHTML = latestRuns.map(run => {
            // Buscar output de imagen para este run
            const imageOutput = this.flowOutputs.find(output => output.run_id === run.id);
            const product = this.products.find(p => p.id === run.brand_id) || null;

            return `
                <div class="production-item">
                    <div class="production-image">
                        ${imageOutput 
                            ? `<img src="${imageOutput.file_url}" alt="Producción" onerror="this.parentElement.innerHTML='<div class=\\'no-image\\'><i class=\\'fas fa-file-image\\'></i></div>'">`
                            : `<div class="no-image"><i class="fas fa-file-image"></i></div>`
                        }
                    </div>
                    <div class="production-info">
                        <h4 class="production-title">${run.status || 'Producción'}</h4>
                        ${product ? `<p class="production-product">${this.escapeHtml(product.nombre_producto)}</p>` : ''}
                        <p class="production-date">${this.formatDate(run.created_at)}</p>
                    </div>
                    <div class="production-status">
                        <i class="fas fa-check-circle"></i>
                        <span>${run.status}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    setupEventListeners() {
        // Event listeners básicos si se necesitan
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// Hacer disponible globalmente
window.LivingManager = LivingManager;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LivingManager;
}
