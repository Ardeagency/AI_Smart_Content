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
        this.brandId = null;
        this.latestGeneratedContent = [];
        this.eventListenersSetup = false;

        this.init();
    }

    async init() {
        try {
            // Verificar acceso antes de continuar
            if (typeof verifyUserAccess === 'function') {
                const hasAccess = await verifyUserAccess();
                if (!hasAccess) {
                    console.warn('⚠️ Usuario no tiene acceso, deteniendo inicialización');
                    return;
                }
            }

            await this.initSupabase();
            
            if (!this.supabase) {
                console.error('❌ No se pudo inicializar Supabase');
                // Renderizar con datos vacíos para que la UI se muestre
                await this.renderAll();
                return;
            }

            if (!this.userId) {
                console.warn('⚠️ No hay usuario autenticado');
                // Renderizar con datos vacíos para que la UI se muestre
                await this.renderAll();
                return;
            }

            console.log('✅ Supabase inicializado, cargando datos del dashboard...');
            
            // Cargar datos en paralelo cuando sea posible
            await Promise.all([
                this.loadUserData(),
                this.loadProjectData()
            ]);

            if (this.projectData) {
                // Cargar datos relacionados al proyecto
                await Promise.all([
                    this.loadProducts(),
                    this.loadFlowRuns(),
                    this.loadCreditUsage()
                ]);

                // Cargar flow outputs después de flow runs
                if (this.flowRuns.length > 0) {
                    await this.loadFlowOutputs();
                }

                // Cargar contenido generado después de obtener brand_id
                await this.loadLatestGeneratedContent();
            } else {
                console.warn('⚠️ No hay projectData disponible');
            }

            // Renderizar todo
            await this.renderAll();
        } catch (error) {
            console.error('❌ Error en init de LivingManager:', error);
            // Intentar renderizar de todas formas
            try {
                await this.renderAll();
            } catch (renderError) {
                console.error('❌ Error al renderizar:', renderError);
            }
        }

        if (!this.eventListenersSetup) {
            this.setupEventListeners();
            this.eventListenersSetup = true;
        }
    }

    async initSupabase() {
        try {
            // Prioridad 1: Usar SupabaseService si está disponible
            if (window.supabaseService) {
                this.supabase = await window.supabaseService.getClient();
            }
            // Prioridad 2: Usar waitForSupabase
            else if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase();
            }
            // Prioridad 3: Usar supabaseClient global
            else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            }
            // Prioridad 4: Usar appLoader
            else if (window.appLoader && typeof window.appLoader.waitFor === 'function') {
                this.supabase = await window.appLoader.waitFor();
            }
            // Prioridad 5: Usar supabase global
            else if (window.supabase && typeof window.supabase.from === 'function') {
                this.supabase = window.supabase;
            }

            if (this.supabase) {
                const { data: { user }, error: userError } = await this.supabase.auth.getUser();
                if (userError) {
                    console.warn('⚠️ Error obteniendo usuario:', userError);
                }
                if (user) {
                    this.userId = user.id;
                    console.log('✅ Usuario identificado:', this.userId);
                } else {
                    console.warn('⚠️ No hay usuario autenticado');
                }
            } else {
                console.error('❌ No se pudo obtener cliente de Supabase');
            }
        } catch (error) {
            console.error('❌ Error initializing Supabase:', error);
            this.supabase = null;
            this.userId = null;
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
            
            // Cargar brand_id si hay projectData
            if (this.projectData) {
                await this.loadBrandId();
            }
        } catch (error) {
            console.error('Error loading project data:', error);
            this.projectData = null;
        }
    }

    async loadBrandId() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data, error } = await this.supabase
                .from('brands')
                .select('id')
                .eq('project_id', this.projectData.id)
                .maybeSingle();

            if (error) {
                console.error('Error loading brand_id:', error);
                this.brandId = null;
                return;
            }

            this.brandId = data?.id || null;
        } catch (error) {
            console.error('Error loading brand_id:', error);
            this.brandId = null;
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
        if (!this.supabase || !this.flowRuns.length) {
            console.log('ℹ️ No hay flow_runs para cargar outputs');
            this.flowOutputs = [];
            return;
        }

        try {
            const runIds = this.flowRuns.map(run => run.id);
            if (runIds.length === 0) {
                console.log('ℹ️ No hay run_ids para cargar outputs');
                this.flowOutputs = [];
                return;
            }

            const { data, error } = await this.supabase
                .from('flow_outputs')
                .select('*')
                .in('run_id', runIds)
                .eq('output_type', 'image')
                .order('created_at', { ascending: false })
                .limit(20); // Limitar a las últimas 20 imágenes

            if (error) {
                console.error('❌ Error loading flow outputs:', error);
                this.flowOutputs = [];
                return;
            }

            this.flowOutputs = data || [];
            console.log('✅ Flow outputs cargados:', this.flowOutputs.length, 'imágenes');
            
            // Log de URLs disponibles para debug
            if (this.flowOutputs.length > 0) {
                this.flowOutputs.forEach((output, index) => {
                    if (output.storage_path || output.file_url) {
                        console.log(`  📸 Output ${index + 1}:`, {
                            storage_path: output.storage_path,
                            file_url: output.file_url,
                            has_prompt: !!output.prompt_used
                        });
                    }
                });
            }
        } catch (error) {
            console.error('❌ Error loading flow outputs:', error);
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

    async loadLatestGeneratedContent() {
        if (!this.supabase) {
            console.log('ℹ️ Supabase no disponible para cargar contenido generado');
            this.latestGeneratedContent = [];
            return;
        }

        if (!this.brandId) {
            console.log('ℹ️ No hay brand_id disponible para cargar contenido generado');
            this.latestGeneratedContent = [];
            return;
        }

        try {
            const { data, error } = await this.supabase
                .rpc('get_latest_generated_content', {
                    p_brand_id: this.brandId,
                    p_limit: 3 // Obtener las últimas 3 para el Hero
                });

            if (error) {
                // Si la función RPC no existe (error 42804 o similar), usar fallback
                if (error.code === '42804' || error.message?.includes('function') || error.message?.includes('does not exist')) {
                    console.warn('⚠️ Función RPC get_latest_generated_content no disponible, usando fallback');
                    this.latestGeneratedContent = [];
                    return;
                }
                // Error 400 puede ser por parámetros incorrectos
                if (error.code === 'PGRST301' || error.code === '400') {
                    console.warn('⚠️ Error en llamada RPC (posible función no disponible o parámetros incorrectos):', error.message);
                    this.latestGeneratedContent = [];
                    return;
                }
                console.error('❌ Error cargando contenido generado:', error);
                this.latestGeneratedContent = [];
                return;
            }

            this.latestGeneratedContent = data || [];
            if (this.latestGeneratedContent.length > 0) {
                console.log('✅ Contenido generado cargado:', this.latestGeneratedContent.length, 'elementos');
            } else {
                console.log('ℹ️ No hay contenido generado disponible');
            }
        } catch (error) {
            console.error('❌ Error loading latest generated content:', error);
            this.latestGeneratedContent = [];
        }
    }

    async renderAll() {
        await this.renderProductionsOfDay();
        this.renderLatestProductions();
        this.renderInsights();
        this.renderEntityProduction();
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

    async renderProductionsOfDay() {
        const productionsOfDayEl = document.getElementById('productionsOfDay');
        if (!productionsOfDayEl) return;

        // Usar el contenido generado por IA desde la función RPC
        const latestContent = this.latestGeneratedContent || [];
        
        // Si no hay contenido desde RPC, usar fallback a flow outputs
        let todayProductions = [];
        if (latestContent.length > 0) {
            // Usar los datos de la función RPC
            console.log('📸 Usando contenido de RPC:', latestContent.length, 'elementos');
            todayProductions = latestContent.slice(0, 3).map(item => ({
                image_url: item.image_url,
                prompt_used: item.prompt_used,
                style_trend: item.style_trend,
                created_at: item.created_at
            }));
        } else {
            // Fallback: Obtener últimas producciones de flow outputs (no solo de hoy)
            console.log('📸 Usando fallback de flow_outputs:', this.flowOutputs.length, 'elementos disponibles');
            
            // Obtener las últimas imágenes generadas (no solo de hoy)
            const imageOutputs = this.flowOutputs
                .filter(output => {
                    // Filtrar solo outputs de tipo imagen
                    return output.output_type === 'image' && 
                           (output.storage_path || output.file_url || output.storage_object_id);
                })
                .slice(0, 3);

            // Convertir storage_path a URL pública si es necesario
            todayProductions = await Promise.all(imageOutputs.map(async (output) => {
                let imageUrl = output.file_url || output.storage_path;
                
                // Si es storage_path y no es una URL completa, intentar convertir a URL pública
                if (output.storage_path && !output.storage_path.startsWith('http') && !output.storage_path.startsWith('/')) {
                    if (this.supabase && output.storage_path) {
                        try {
                            // Intentar obtener URL pública desde diferentes buckets posibles
                            const possibleBuckets = ['generated-content', 'flow-outputs', 'content-images', 'images'];
                            let publicUrl = null;
                            
                            for (const bucket of possibleBuckets) {
                                try {
                                    const { data } = this.supabase.storage
                                        .from(bucket)
                                        .getPublicUrl(output.storage_path);
                                    if (data && data.publicUrl) {
                                        publicUrl = data.publicUrl;
                                        console.log(`✅ URL pública obtenida desde bucket '${bucket}':`, publicUrl);
                                        break;
                                    }
                                } catch (bucketError) {
                                    // Continuar con el siguiente bucket
                                    continue;
                                }
                            }
                            
                            if (publicUrl) {
                                imageUrl = publicUrl;
                            } else {
                                console.warn('⚠️ No se pudo obtener URL pública para:', output.storage_path);
                            }
                        } catch (error) {
                            console.warn('⚠️ Error al obtener URL pública:', error);
                        }
                    }
                }
                
                return {
                    image_url: imageUrl,
                    prompt_used: output.prompt_used,
                    created_at: output.created_at
                };
            }));
        }

        // Renderizar items (siempre mostrar 3)
        const items = [];
        for (let i = 0; i < 3; i++) {
            if (todayProductions[i] && todayProductions[i].image_url) {
                const item = todayProductions[i];
                const imageUrl = item.image_url;
                
                // Validar que sea una URL válida
                if (!imageUrl || (!imageUrl.startsWith('http') && !imageUrl.startsWith('/'))) {
                    console.warn('⚠️ URL de imagen inválida:', imageUrl);
                    items.push(`
                        <div class="visual-day-item">
                            <div class="visual-day-placeholder">
                                <i class="fas fa-image"></i>
                            </div>
                        </div>
                    `);
                    continue;
                }
                
                const promptInfo = item.prompt_used ? `<div class="visual-day-prompt">${this.escapeHtml(item.prompt_used.substring(0, 50))}...</div>` : '';
                const styleInfo = item.style_trend ? `<div class="visual-day-style">Estilo: ${this.escapeHtml(item.style_trend)}</div>` : '';
                
                items.push(`
                    <div class="visual-day-item">
                        <img src="${this.escapeHtml(imageUrl)}" alt="Visual generado por IA" onerror="this.parentElement.innerHTML='<div class=\\'visual-day-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'">
                        ${promptInfo}
                        ${styleInfo}
                    </div>
                `);
            } else {
                items.push(`
                    <div class="visual-day-item">
                        <div class="visual-day-placeholder">
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

        // Obtener últimas 10 producciones
        const latestRuns = this.flowRuns.slice(0, 10);

        productionsListEl.innerHTML = latestRuns.map(run => {
            // Buscar output de imagen para este run
            const imageOutput = this.flowOutputs.find(output => output.run_id === run.id);
            const product = run.brand_id ? this.products.find(p => p.id === run.brand_id) : null;
            
            // Determinar tipo de contenido y estado
            const contentType = this.getContentType(run, imageOutput);
            const status = this.getProductionStatus(run);

            return `
                <div class="production-card">
                    ${imageOutput 
                        ? `<img src="${this.escapeHtml(imageOutput.file_url)}" alt="Producción" class="production-card-image" onerror="this.style.display='none'">`
                        : `<div class="production-card-image" style="background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3);"><i class="fas fa-image" style="font-size: 3rem;"></i></div>`
                    }
                    <div class="production-card-info">
                        <h4 class="production-card-title">${this.escapeHtml(run.status || 'Producción')}</h4>
                        <div class="production-card-meta">
                            <span class="production-card-status ${status}">${status}</span>
                            ${product ? `<span>${this.escapeHtml(product.nombre_producto)}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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

    renderInsights() {
        // Producto Favorito
        const favoriteProductNameEl = document.getElementById('favoriteProductName');
        if (favoriteProductNameEl) {
            if (this.products.length > 0) {
                const favoriteProduct = this.products[0];
                favoriteProductNameEl.textContent = this.escapeHtml(favoriteProduct.nombre_producto);
            } else {
                favoriteProductNameEl.textContent = '-';
            }
        }

        // Producto Más Producido
        const topProductNameEl = document.getElementById('topProductName');
        if (topProductNameEl) {
            if (this.products.length > 0) {
                // Contar producciones por producto
                const productCounts = {};
                this.flowRuns.forEach(run => {
                    if (run.brand_id) {
                        productCounts[run.brand_id] = (productCounts[run.brand_id] || 0) + 1;
                    }
                });
                
                let topProduct = this.products[0];
                let maxCount = 0;
                this.products.forEach(product => {
                    const count = productCounts[product.id] || 0;
                    if (count > maxCount) {
                        maxCount = count;
                        topProduct = product;
                    }
                });
                
                topProductNameEl.textContent = this.escapeHtml(topProduct.nombre_producto);
            } else {
                topProductNameEl.textContent = '-';
            }
        }

        // Formato Más Usado
        const topFormatNameEl = document.getElementById('topFormatName');
        if (topFormatNameEl) {
            const formatCounts = {};
            this.flowRuns.forEach(run => {
                const contentType = this.getContentType(run, null);
                formatCounts[contentType] = (formatCounts[contentType] || 0) + 1;
            });
            
            let topFormat = 'Contenido';
            let maxCount = 0;
            Object.keys(formatCounts).forEach(format => {
                if (formatCounts[format] > maxCount) {
                    maxCount = formatCounts[format];
                    topFormat = format;
                }
            });
            
            topFormatNameEl.textContent = topFormat;
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
            });
            
            const tokensUsedToday = todayUsage.reduce((sum, usage) => sum + (usage.credits_used || 0), 0);
            tokensTodayEl.textContent = tokensUsedToday.toLocaleString();
        }
    }

    renderEntityProduction() {
        const entityProductionEl = document.getElementById('entityProduction');
        if (!entityProductionEl) return;

        if (this.products.length === 0) {
            entityProductionEl.innerHTML = `
                <div class="empty-state-small">
                    <i class="fas fa-box"></i>
                    <p>No hay datos disponibles</p>
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

        // Ordenar productos por producción
        const sortedProducts = this.products
            .map(product => ({
                product,
                count: productCounts[product.id] || 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        entityProductionEl.innerHTML = sortedProducts.map(({ product, count }) => `
            <div class="entity-item">
                <div class="entity-item-label">${this.escapeHtml(product.nombre_producto)}</div>
                <div class="entity-item-value">${count}</div>
                <div class="entity-item-count">producciones</div>
            </div>
        `).join('');
    }

    renderResources() {
        const tokensAvailableEl = document.getElementById('tokensAvailableResource');
        const tokensUsedTodayEl = document.getElementById('tokensUsedTodayResource');
        const tokensProgressEl = document.getElementById('tokensProgressResource');

        if (!tokensAvailableEl || !tokensUsedTodayEl || !tokensProgressEl) return;

        const totalCredits = this.userData?.credits_total || 0;
        const availableCredits = this.userData?.credits_available || 0;
        const usedCredits = totalCredits - availableCredits;

        // Tokens usados hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayUsage = this.creditUsage.filter(usage => {
            const usageDate = new Date(usage.created_at);
            usageDate.setHours(0, 0, 0, 0);
            return usageDate.getTime() === today.getTime();
        });
        const tokensUsedToday = todayUsage.reduce((sum, usage) => sum + (usage.credits_used || 0), 0);

        tokensAvailableEl.textContent = availableCredits.toLocaleString();
        tokensUsedTodayEl.textContent = tokensUsedToday.toLocaleString();

        const percentage = totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0;
        tokensProgressEl.style.width = `${percentage}%`;
    }

    getProductionStatus(run) {
        const status = (run.status || '').toLowerCase();
        if (status.includes('complete') || status.includes('final')) {
            return 'final';
        } else if (status.includes('render') || status.includes('process')) {
            return 'rendering';
        }
        return 'draft';
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
