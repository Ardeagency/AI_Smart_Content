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
        this.renderVisualsOfDay();
        this.renderLatestProductions();
        this.renderInsights();
        this.renderEntitiesProduction();
        this.renderResources();
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

    renderProductionsOfDay() {
        const productionsOfDayEl = document.getElementById('productionsOfDay');
        if (!productionsOfDayEl) return;

        // Obtener producciones generadas hoy (flow outputs)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayProductions = this.flowOutputs
            .filter(output => {
                const outputDate = new Date(output.created_at);
                outputDate.setHours(0, 0, 0, 0);
                return outputDate.getTime() === today.getTime();
            })
            .slice(0, 3);

        // Si hay menos de 3, rellenar con placeholders
        const items = [];
        for (let i = 0; i < 3; i++) {
            if (todayProductions[i]) {
                items.push(`
                    <div class="production-day-item">
                        <img src="${this.escapeHtml(todayProductions[i].file_url)}" alt="Producción del día" onerror="this.parentElement.innerHTML='<div class=\\'production-day-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'">
                    </div>
                `);
            } else {
                items.push(`
                    <div class="production-day-item">
                        <div class="production-day-placeholder">
                            <i class="fas fa-image"></i>
                        </div>
                    </div>
                `);
            }
        }

        productionsOfDayEl.innerHTML = items.join('');
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

        // Producto favorito: el más reciente
        const favoriteProduct = this.products[0];
        const productionCount = this.flowRuns.filter(run => {
            // Contar producciones que puedan estar relacionadas con este producto
            return run.brand_id && this.products.some(p => p.id === run.brand_id);
        }).length;

        favoriteProductEl.innerHTML = `
            <div class="favorite-product-content">
                <div class="favorite-product-image">
                    ${favoriteProduct.mainImage 
                        ? `<img src="${this.escapeHtml(favoriteProduct.mainImage)}" alt="${this.escapeHtml(favoriteProduct.nombre_producto)}" onerror="this.parentElement.innerHTML='<div class=\\'no-image\\'><i class=\\'fas fa-box\\'></i></div>'">`
                        : `<div class="no-image"><i class="fas fa-box"></i></div>`
                    }
                </div>
                <div class="favorite-product-info">
                    <h3 class="favorite-product-name">${this.escapeHtml(favoriteProduct.nombre_producto)}</h3>
                    <p class="favorite-product-type">${this.escapeHtml(favoriteProduct.tipo_producto || 'Producto')}</p>
                    <div class="favorite-product-stats">
                        <div class="favorite-product-stat">
                            <span class="favorite-product-stat-label">Producciones</span>
                            <span class="favorite-product-stat-value">${productionCount}</span>
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

        // Obtener últimas producciones con sus outputs
        const latestRuns = this.flowRuns.slice(0, 12);

        productionsListEl.innerHTML = latestRuns.map(run => {
            const imageOutput = this.flowOutputs.find(output => output.run_id === run.id);
            const contentType = this.getContentType(run, imageOutput);
            const status = run.status || 'Completado';
            const statusClass = status.toLowerCase().includes('draft') ? 'draft' : 
                               status.toLowerCase().includes('rendering') ? 'rendering' : 'final';

            return `
                <div class="living-production-card">
                    ${imageOutput 
                        ? `<img src="${this.escapeHtml(imageOutput.file_url)}" alt="Producción" onerror="this.style.display='none'">`
                        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.3);"><i class="fas fa-file-image" style="font-size:2rem;"></i></div>`
                    }
                    <div class="living-production-overlay">
                        <div class="living-production-type">${contentType}</div>
                        <div class="living-production-status ${statusClass}">
                            <i class="fas fa-${statusClass === 'final' ? 'check' : statusClass === 'draft' ? 'edit' : 'spinner'}"></i>
                            <span>${this.escapeHtml(status)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderInsights() {
        // Producto Más Producido
        const topProductEl = document.getElementById('topProductionProduct');
        if (topProductEl) {
            if (this.products.length === 0) {
                topProductEl.textContent = '-';
            } else {
                // Contar producciones por producto
                const productCounts = {};
                this.flowRuns.forEach(run => {
                    if (run.brand_id) {
                        productCounts[run.brand_id] = (productCounts[run.brand_id] || 0) + 1;
                    }
                });
                
                const topProductId = Object.keys(productCounts).reduce((a, b) => 
                    productCounts[a] > productCounts[b] ? a : b, Object.keys(productCounts)[0]);
                const topProduct = this.products.find(p => p.id === topProductId);
                topProductEl.textContent = topProduct ? this.escapeHtml(topProduct.nombre_producto) : '-';
            }
        }

        // Producto Favorito
        const favoriteProductEl = document.getElementById('favoriteProduct');
        if (favoriteProductEl) {
            if (this.products.length === 0) {
                favoriteProductEl.textContent = '-';
            } else {
                // El más reciente
                const favoriteProduct = this.products[0];
                favoriteProductEl.textContent = this.escapeHtml(favoriteProduct.nombre_producto);
            }
        }

        // Formato Más Usado
        const topFormatEl = document.getElementById('topFormat');
        if (topFormatEl) {
            const formatCounts = {};
            this.flowRuns.forEach(run => {
                const contentType = this.getContentType(run, null);
                formatCounts[contentType] = (formatCounts[contentType] || 0) + 1;
            });
            
            const topFormat = Object.keys(formatCounts).reduce((a, b) => 
                formatCounts[a] > formatCounts[b] ? a : b, Object.keys(formatCounts)[0]);
            topFormatEl.textContent = topFormat || '-';
        }

        // Tokens Hoy
        const tokensTodayEl = document.getElementById('tokensToday');
        if (tokensTodayEl) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const todayUsage = this.creditUsage.filter(usage => {
                const usageDate = new Date(usage.created_at);
                usageDate.setHours(0, 0, 0, 0);
                return usageDate.getTime() === today.getTime();
            }).reduce((sum, usage) => sum + (usage.credits_used || 0), 0);
            
            tokensTodayEl.textContent = todayUsage.toLocaleString();
        }
    }

    renderEntitiesProduction() {
        const entitiesEl = document.getElementById('entitiesProduction');
        if (!entitiesEl) return;

        if (this.products.length === 0) {
            entitiesEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box"></i>
                    <p>No hay datos de entidades</p>
                </div>
            `;
            return;
        }

        // Contar producciones por producto
        const productCounts = {};
        this.flowRuns.forEach(run => {
            if (run.brand_id) {
                productCounts[run.brand_id] = (productCounts[run.brand_id] || 0) + 1;
            }
        });

        // Ordenar por producción
        const sortedProducts = this.products
            .map(product => ({
                product,
                count: productCounts[product.id] || 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        entitiesEl.innerHTML = sortedProducts.map(({ product, count }) => `
            <div class="living-entity-card">
                <div class="entity-name">${this.escapeHtml(product.nombre_producto)}</div>
                <div class="entity-type">${this.escapeHtml(product.tipo_producto || 'Producto')}</div>
                <div class="entity-stats">
                    <div class="entity-stat">
                        <div class="entity-stat-label">Producciones</div>
                        <div class="entity-stat-value">${count}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderResources() {
        const tokensAvailableEl = document.getElementById('tokensAvailable');
        const tokensUsedEl = document.getElementById('tokensUsed');
        const tokensTotalEl = document.getElementById('tokensTotal');
        const tokensProgressFillEl = document.getElementById('tokensProgressFill');
        const tokensPercentageEl = document.getElementById('tokensPercentage');

        if (!tokensAvailableEl || !tokensUsedEl || !tokensTotalEl || !tokensProgressFillEl || !tokensPercentageEl) return;

        const totalCredits = this.userData?.credits_total || 0;
        const availableCredits = this.userData?.credits_available || 0;
        const usedCredits = totalCredits - availableCredits;

        tokensUsedEl.textContent = usedCredits.toLocaleString();
        tokensAvailableEl.textContent = availableCredits.toLocaleString();
        tokensTotalEl.textContent = totalCredits.toLocaleString();

        const percentage = totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0;
        tokensProgressFillEl.style.width = `${percentage}%`;
        tokensPercentageEl.textContent = `${percentage}%`;
    }

    getContentType(run, output) {
        // Determinar tipo de contenido basado en el run o output
        if (output) {
            const url = output.file_url || '';
            if (url.includes('video') || url.includes('reel') || url.includes('.mp4')) {
                return 'Reel';
            } else if (url.includes('image') || url.includes('.jpg') || url.includes('.png')) {
                return 'Imagen';
            }
        }
        
        // Fallback basado en el status del run
        const status = (run.status || '').toLowerCase();
        if (status.includes('reel') || status.includes('video')) {
            return 'Reel';
        } else if (status.includes('post') || status.includes('image')) {
            return 'Imagen';
        }
        
        return 'Contenido';
    }

    getContentTypeIcon(contentType) {
        const icons = {
            'Reel': 'fas fa-video',
            'Imagen': 'fas fa-image',
            'Post': 'fas fa-square',
            'Contenido': 'fas fa-file-alt'
        };
        return icons[contentType] || icons['Contenido'];
    }

    getInitials(name) {
        if (!name) return 'U';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
        }
        return name.substring(0, 2).toUpperCase();
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
