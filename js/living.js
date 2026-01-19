/**
 * Living Dashboard - Estructura única estilo Netflix/Flix.id
 * Featured content, categorías y grid de producciones
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
                await this.renderAll();
                return;
            }

            if (!this.userId) {
                console.warn('⚠️ No hay usuario autenticado');
                await this.renderAll();
                return;
            }

            console.log('✅ Supabase inicializado, cargando datos del dashboard...');
            
            // Cargar datos en paralelo cuando sea posible
            await Promise.all([
                this.loadUserData(),
                this.loadProjectData()
            ]);

            // Cargar datos relacionados (no dependen de projectData, usan userId directamente)
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

            // Renderizar todo
            await this.renderAll();
        } catch (error) {
            console.error('❌ Error en init de LivingManager:', error);
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
                if (this.supabase) {
                    const { data: { user } } = await this.supabase.auth.getUser();
                    this.userId = user?.id;
                    if (this.userId) {
                        console.log('✅ Supabase inicializado desde SupabaseService');
                        return;
                    }
                }
            }

            // Prioridad 2: Usar waitForSupabase si está disponible
            if (typeof waitForSupabase === 'function') {
                const supabaseClient = await waitForSupabase();
                if (supabaseClient) {
                    this.supabase = supabaseClient;
                    const { data: { user } } = await this.supabase.auth.getUser();
                    this.userId = user?.id;
                    if (this.supabase && this.userId) {
                        console.log('✅ Supabase inicializado desde waitForSupabase');
                        return;
                    }
                }
            }

            // Prioridad 3: Usar window.supabaseClient
            if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
                const { data: { user } } = await this.supabase.auth.getUser();
                this.userId = user?.id;
                if (this.supabase && this.userId) {
                    console.log('✅ Supabase inicializado desde window.supabaseClient');
                    return;
                }
            }

            // Prioridad 4: Usar appLoader.waitFor
            if (window.appLoader && typeof window.appLoader.waitFor === 'function') {
                const supabaseClient = await window.appLoader.waitFor('supabase');
                if (supabaseClient) {
                    this.supabase = supabaseClient;
                    const { data: { user } } = await this.supabase.auth.getUser();
                    this.userId = user?.id;
                    if (this.supabase && this.userId) {
                        console.log('✅ Supabase inicializado desde appLoader');
                        return;
                    }
                }
            }

            // Prioridad 5: Usar window.supabase directamente
            if (window.supabase) {
                this.supabase = window.supabase;
                const { data: { user } } = await this.supabase.auth.getUser();
                this.userId = user?.id;
                if (this.supabase && this.userId) {
                    console.log('✅ Supabase inicializado desde window.supabase');
                    return;
                }
            }

            console.warn('⚠️ No se pudo inicializar Supabase con ningún método disponible');
        } catch (error) {
            console.error('❌ Error inicializando Supabase:', error);
        }
    }

    async loadUserData() {
        if (!this.supabase || !this.userId) return;

        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('id', this.userId)
                .maybeSingle();

            if (error) throw error;
            this.userData = data;
        } catch (error) {
            console.error('❌ Error cargando datos de usuario:', error);
        }
    }

    async loadProjectData() {
        if (!this.supabase || !this.userId) return;

        try {
            // La tabla projects tiene user_id directamente, no hay user_projects
            const { data, error } = await this.supabase
                .from('projects')
                .select('*')
                .eq('user_id', this.userId)
                .eq('is_active', true)
                .maybeSingle();

            if (error) throw error;
            this.projectData = data;
        } catch (error) {
            console.error('❌ Error cargando datos del proyecto:', error);
            this.projectData = null;
        }
    }

    async loadProducts() {
        if (!this.supabase || !this.userId) return;

        try {
            // Primero obtener brand_container por user_id
            const { data: container, error: containerError } = await this.supabase
                .from('brand_containers')
                .select('id')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (containerError) throw containerError;
            if (!container) {
                this.products = [];
                return;
            }

            // Products usa brand_container_id, no project_id
            const { data, error } = await this.supabase
                .from('products')
                .select('*')
                .eq('brand_container_id', container.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.products = data || [];
        } catch (error) {
            console.error('❌ Error cargando productos:', error);
            this.products = [];
        }
    }

    async loadFlowRuns() {
        if (!this.supabase || !this.userId) return;

        try {
            // flow_runs no tiene project_id, usa brand_id o user_id
            // Primero intentar obtener brand_id
            if (!this.brandId) {
                await this.loadBrandId();
            }

            let query = this.supabase
                .from('flow_runs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            // Filtrar por brand_id si está disponible, sino por user_id
            if (this.brandId) {
                query = query.eq('brand_id', this.brandId);
            } else {
                query = query.eq('user_id', this.userId);
            }

            const { data, error } = await query;

            if (error) throw error;
            this.flowRuns = data || [];
        } catch (error) {
            console.error('❌ Error cargando flow runs:', error);
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
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.flowOutputs = data || [];
        } catch (error) {
            console.error('❌ Error cargando flow outputs:', error);
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
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            this.creditUsage = data || [];
        } catch (error) {
            console.error('❌ Error cargando credit usage:', error);
            this.creditUsage = [];
        }
    }

    async loadBrandId() {
        if (!this.supabase || !this.userId) return;

        try {
            // Primero obtener brand_container por user_id
            const { data: container, error: containerError } = await this.supabase
                .from('brand_containers')
                .select('id')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (containerError) throw containerError;
            
            if (!container) {
                this.brandId = null;
                return;
            }

            // Luego obtener brand usando project_id que referencia a brand_container.id
            const { data: brand, error: brandError } = await this.supabase
                .from('brands')
                .select('id')
                .eq('project_id', container.id)
                .maybeSingle();

            if (brandError) throw brandError;
            this.brandId = brand?.id || null;
        } catch (error) {
            console.error('❌ Error cargando brand_id:', error);
            this.brandId = null;
        }
    }

    async loadLatestGeneratedContent() {
        if (!this.supabase) return;

        try {
            // Primero obtener brand_id si no lo tenemos
            if (!this.brandId) {
                await this.loadBrandId();
            }

            if (!this.brandId) {
                console.log('ℹ️ No hay brand_id disponible, saltando carga de contenido generado');
                this.latestGeneratedContent = [];
                return;
            }

            const { data, error } = await this.supabase
                .rpc('get_latest_generated_content', {
                    p_brand_id: this.brandId,
                    p_limit: 10
                });

            if (error) {
                if (error.code === 'PGRST301' || error.code === '42883') {
                    console.warn('⚠️ Función RPC get_latest_generated_content no disponible:', error.message);
                    this.latestGeneratedContent = [];
                    return;
                }
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
        // Renderizar nueva estructura: Centro de Control Visual
        await this.renderHero();
        await this.renderHistory();
        await this.renderControlCreative();
        await this.renderHighlights();
        this.renderResources();
    }

    /**
     * 1️⃣ HERO - Producción Protagonista
     * Una sola producción dominante elegida por el sistema
     */
    async renderHero() {
        const heroContainer = document.getElementById('livingHero');
        if (!heroContainer) return;
        
        // Obtener la producción protagonista (más reciente, más usada, más descargada, etc.)
        const latestContent = this.latestGeneratedContent || [];
        let heroItem = null;
        
        // Priorizar contenido de RPC (más reciente)
        if (latestContent.length > 0) {
            heroItem = latestContent[0];
        } else if (this.flowRuns.length > 0) {
            // Usar el flow run más reciente
            const latestRun = this.flowRuns[0];
            const output = this.flowOutputs.find(o => o.run_id === latestRun.id);
            heroItem = {
                prompt: output?.prompt_used || latestRun.status || '',
                image_url: output?.file_url || output?.storage_path || null,
                run: latestRun,
                output: output
            };
        }
        
        if (!heroItem) {
            heroContainer.innerHTML = `
                <div class="living-hero-placeholder">
                    <i class="fas fa-sparkles"></i>
                    <h2>Tu producción protagonista aparecerá aquí</h2>
                </div>
            `;
            return;
        }
        
        const prompt = heroItem.prompt_used || heroItem.prompt || 'Producción del sistema';
        let imageUrl = heroItem.image_url || heroItem.url || heroItem.storage_url || heroItem.file_url;
        
        // Construir URL completa si es necesario
        if (imageUrl && !imageUrl.startsWith('http') && heroItem.output) {
            const storagePath = heroItem.output.storage_path || heroItem.output.storage_object_id;
            if (storagePath) {
                imageUrl = this.getPublicUrlFromStorage('production-outputs', storagePath) || imageUrl;
            }
        }
        
        if (!imageUrl && heroItem.storage_path) {
            imageUrl = this.getPublicUrlFromStorage('production-outputs', heroItem.storage_path);
        }
        
        heroContainer.innerHTML = `
            <div class="living-hero-visual">
                ${imageUrl && imageUrl.startsWith('http')
                    ? `<img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(prompt)}" loading="eager" onerror="this.parentElement.innerHTML='<div class=\\'living-hero-placeholder\\'><i class=\\'fas fa-image\\'></i><h2>Error cargando imagen</h2></div>';" onload="this.style.opacity='1';">`
                    : `<div class="living-hero-placeholder"><i class="fas fa-image"></i><h2>Sin imagen disponible</h2></div>`
                }
            </div>
            <div class="living-hero-overlay">
                <h1 class="living-hero-title">${this.escapeHtml(prompt)}</h1>
                <p class="living-hero-subtitle">Producción protagonista del sistema</p>
            </div>
            <button class="living-hero-download" title="Descargar imagen" data-image-url="${this.escapeHtml(imageUrl || '')}">
                <i class="fas fa-download"></i>
            </button>
        `;
        
        // Event listener para descarga
        const downloadBtn = heroContainer.querySelector('.living-hero-download');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = downloadBtn.dataset.imageUrl;
                if (url && url.startsWith('http')) {
                    this.downloadImage(url);
                }
            });
        }
    }
    
    /**
     * 2️⃣ HISTORIAL VIVO - Últimas Producciones
     * Scroll horizontal con continuidad, no grid rígido
     */
    async renderHistory() {
        const historyScroll = document.getElementById('livingHistoryScroll');
        if (!historyScroll) return;
        
        const latestContent = this.latestGeneratedContent || [];
        let historyItems = [];
        
        // Priorizar contenido de RPC (excluyendo el hero)
        if (latestContent.length > 1) {
            historyItems = latestContent.slice(1, 10).map(item => ({
                prompt: item.prompt_used || item.prompt || '',
                image_url: item.image_url || item.url || item.storage_url || item.file_url,
                item: item,
                output: null
            }));
        }
        
        // Completar con flow runs si es necesario
        if (historyItems.length < 10 && this.flowRuns.length > 0) {
            const flowItems = this.flowRuns.slice(0, 10 - historyItems.length).map(run => {
                const output = this.flowOutputs.find(o => o.run_id === run.id);
                return {
                    prompt: output?.prompt_used || run.status || '',
                    image_url: output?.file_url || output?.storage_path || null,
                    run: run,
                    output: output
                };
            });
            historyItems = [...historyItems, ...flowItems];
        }
        
        if (historyItems.length === 0) {
            historyScroll.innerHTML = `
                <div style="padding: 3rem; text-align: center; color: var(--living-text-muted);">
                    <p>No hay producciones recientes</p>
                </div>
            `;
            return;
        }

        historyScroll.innerHTML = historyItems.map((item, index) => {
            const prompt = item.prompt || '';
            let imageUrl = item.image_url || item.url || item.storage_url;
            
            // Construir URL completa
            if (imageUrl && !imageUrl.startsWith('http') && item.output) {
                const storagePath = item.output.storage_path || item.output.storage_object_id;
                if (storagePath) {
                    imageUrl = this.getPublicUrlFromStorage('production-outputs', storagePath) || imageUrl;
                }
            }
            
            if (!imageUrl && item.item?.storage_path) {
                imageUrl = this.getPublicUrlFromStorage('production-outputs', item.item.storage_path);
            }
            
            return `
                <div class="living-history-card" data-index="${index}">
                    <div class="living-history-card-visual">
                        ${imageUrl && imageUrl.startsWith('http')
                            ? `<img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(prompt)}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.2);color:var(--living-text-whisper);\\'><i class=\\'fas fa-image\\'></i></div>';" onload="this.style.opacity='1';">`
                            : `<div style="width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.2);color:var(--living-text-whisper);"><i class="fas fa-image"></i></div>`
                    }
                    </div>
                    <div class="living-history-card-prompt">
                        <div class="living-history-card-prompt-title">Prompt</div>
                        <div class="living-history-card-prompt-text">${this.escapeHtml(prompt)}</div>
                    </div>
                    <button class="living-history-card-download" title="Descargar" data-image-url="${this.escapeHtml(imageUrl || '')}">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            `;
        }).join('');
        
        // Event listeners para descarga
        const downloadBtns = historyScroll.querySelectorAll('.living-history-card-download');
        downloadBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.imageUrl;
                if (url && url.startsWith('http')) {
                    this.downloadImage(url);
                }
            });
        });
    }
    
    /**
     * 3️⃣ CONTROL CREATIVO - Insights
     * Lectura creativa del sistema, no analítica dura
     */
    async renderControlCreative() {
        const controlGrid = document.getElementById('livingControlGrid');
        if (!controlGrid) return;
        
        const insights = [];
        
        // Producto más producido
        if (this.products.length > 0) {
            const mostProducedProduct = this.products[0]; // Simplificado, se puede mejorar con conteo
            insights.push({
                icon: 'fas fa-box',
                title: 'Producto más producido',
                value: mostProducedProduct.nombre_producto || 'N/A',
                description: 'Contenido generado para este producto'
            });
        }
        
        // Tipo de contenido dominante
        const contentTypes = this.flowOutputs.map(o => {
            const url = o.file_url || '';
            if (url.includes('video') || url.includes('.mp4')) return 'video';
            if (url.includes('image') || url.includes('.jpg') || url.includes('.png')) return 'imagen';
            return 'otro';
        });
        const dominantType = contentTypes.reduce((a, b, i, arr) => 
            arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
        , 'imagen');
        
        insights.push({
            icon: dominantType === 'video' ? 'fas fa-video' : 'fas fa-image',
            title: 'Tipo dominante',
            value: dominantType === 'video' ? 'Video' : 'Imagen',
            description: 'Formato más generado por tu sistema'
        });
        
        // Total de producciones
        insights.push({
            icon: 'fas fa-layer-group',
            title: 'Producciones totales',
            value: this.flowRuns.length.toString(),
            description: 'Contenido generado hasta ahora'
        });
        
        // Flujo más usado (simplificado)
        if (this.flowRuns.length > 0) {
            insights.push({
                icon: 'fas fa-project-diagram',
                title: 'Sistema activo',
                value: 'En funcionamiento',
                description: 'Generando contenido automáticamente'
            });
        }
        
        if (insights.length === 0) {
            controlGrid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--living-text-muted);">
                    <p>No hay datos de control creativo disponibles</p>
                </div>
            `;
            return;
        }
        
        controlGrid.innerHTML = insights.map(insight => `
            <div class="living-control-card">
                <div class="living-control-card-icon">
                    <i class="${insight.icon}"></i>
                </div>
                <div class="living-control-card-title">${this.escapeHtml(insight.title)}</div>
                <div class="living-control-card-value">${this.escapeHtml(insight.value)}</div>
                <div class="living-control-card-description">${this.escapeHtml(insight.description)}</div>
            </div>
        `).join('');
    }
    
    /**
     * 4️⃣ DESTACADOS INTELIGENTES - Curaduría del Sistema
     */
    async renderHighlights() {
        const highlightsScroll = document.getElementById('livingHighlightsScroll');
        if (!highlightsScroll) return;
        
        // Usar las siguientes producciones después del historial
        const latestContent = this.latestGeneratedContent || [];
        let highlightItems = [];
        
        if (latestContent.length > 10) {
            highlightItems = latestContent.slice(10, 20).map(item => ({
                prompt: item.prompt_used || item.prompt || '',
                image_url: item.image_url || item.url || item.storage_url || item.file_url,
                item: item
            }));
        }
        
        if (highlightItems.length === 0) {
            highlightsScroll.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--living-text-muted);">
                    <p>No hay destacados disponibles</p>
                </div>
            `;
            return;
        }

        // Reutilizar el mismo estilo de cards del historial
        highlightsScroll.innerHTML = highlightItems.map((item, index) => {
            const prompt = item.prompt || '';
            let imageUrl = item.image_url || item.url || item.storage_url;
            
            if (!imageUrl && item.item?.storage_path) {
                imageUrl = this.getPublicUrlFromStorage('production-outputs', item.item.storage_path);
            }
            
            return `
                <div class="living-highlight-card" data-index="${index}">
                    <div class="living-history-card-visual">
                        ${imageUrl && imageUrl.startsWith('http')
                            ? `<img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(prompt)}" loading="lazy">`
                            : `<div style="width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.2);color:var(--living-text-whisper);"><i class="fas fa-image"></i></div>`
                        }
                    </div>
                    <div class="living-history-card-prompt">
                        <div class="living-history-card-prompt-title">Prompt</div>
                        <div class="living-history-card-prompt-text">${this.escapeHtml(prompt)}</div>
                    </div>
                    <button class="living-history-card-download" title="Descargar" data-image-url="${this.escapeHtml(imageUrl || '')}">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            `;
        }).join('');
        
        // Event listeners para descarga
        const downloadBtns = highlightsScroll.querySelectorAll('.living-history-card-download');
        downloadBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.imageUrl;
                if (url && url.startsWith('http')) {
                    this.downloadImage(url);
                }
            });
        });
    }
    
    /**
     * 5️⃣ RECURSOS - Estado del Sistema (Secundario)
     */
    renderResources() {
        const resourcesContainer = document.getElementById('livingResources');
        if (!resourcesContainer) return;
        
        const creditUsage = this.creditUsage || [];
        const totalCredits = creditUsage.reduce((sum, usage) => sum + (usage.credits_used || 0), 0);
        
        resourcesContainer.innerHTML = `
            <div class="living-resource-item">
                <i class="fas fa-coins"></i>
                <span>Créditos usados: ${totalCredits}</span>
            </div>
            <div class="living-resource-item">
                <i class="fas fa-database"></i>
                <span>Producciones: ${this.flowRuns.length}</span>
                </div>
            `;
    }

    downloadImage(imageUrl) {
        try {
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = `production-${Date.now()}.jpg`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error descargando imagen:', error);
            // Fallback: abrir en nueva pestaña
            window.open(imageUrl, '_blank');
        }
    }

    renderContentGrid(runs = null) {
        const contentGrid = document.getElementById('livingContentGrid');
        if (!contentGrid) return;
        
        // Usar runs proporcionados o todos los flowRuns
        const allProductions = runs || this.flowRuns.slice(0, 12);
        
        if (allProductions.length === 0) {
            contentGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: var(--living-text-muted);">
                    <i class="fas fa-image" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                    <p>No hay producciones aún</p>
                </div>
            `;
            return;
        }

        contentGrid.innerHTML = allProductions.map(run => {
            const imageOutput = this.flowOutputs.find(output => output.run_id === run.id);
            const contentType = this.getContentType(run, imageOutput);
            const imageUrl = imageOutput?.file_url || imageOutput?.storage_path || null;
            const title = run.status || contentType || 'Producción';
            const year = new Date(run.created_at || Date.now()).getFullYear();

            return `
                <div class="content-card" data-run-id="${run.id}">
                    <div class="content-card-image-container">
                        ${imageUrl && imageUrl.startsWith('http')
                            ? `<img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(title)}" class="content-card-image" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'content-card-image-placeholder\\'><i class=\\'fas fa-image\\'></i></div>';" onload="this.style.height='auto'; this.style.minHeight='200px'; this.style.maxHeight='500px';">`
                            : `<div class="content-card-image-placeholder"><i class="fas fa-image"></i></div>`
                        }
                    </div>
                    <div class="content-card-info">
                        <h3 class="content-card-title">${this.escapeHtml(title)}</h3>
                        <div class="content-card-meta">
                            <span class="content-card-rating">
                                <i class="fas fa-star"></i>
                                <span>${(Math.random() * 2 + 6).toFixed(1)}</span>
                            </span>
                            <span class="content-card-year">${year}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    setupCategoryFilters() {
        const categoryBtns = document.querySelectorAll('.category-btn');
        const contentTitle = document.getElementById('livingContentTitle');
        
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remover active de todos
                categoryBtns.forEach(b => b.classList.remove('active'));
                // Agregar active al clickeado
                btn.classList.add('active');
                
                const category = btn.dataset.category;
                this.filterByCategory(category, contentTitle);
            });
        });
    }

    filterByCategory(category, contentTitle) {
        const contentGrid = document.getElementById('livingContentGrid');
        if (!contentGrid) return;
        
        let filteredRuns = this.flowRuns;
        
        if (category !== 'all') {
            filteredRuns = this.flowRuns.filter(run => {
                const imageOutput = this.flowOutputs.find(output => output.run_id === run.id);
                const contentType = this.getContentType(run, imageOutput).toLowerCase();
                
                if (category === 'image') return contentType.includes('imagen') || contentType.includes('image');
                if (category === 'video') return contentType.includes('video') || contentType.includes('reel');
                if (category === 'reel') return contentType.includes('reel');
                if (category === 'product') return run.brand_id && this.products.some(p => p.id === run.brand_id);
                if (category === 'brand') return run.brand_id;
                
                return true;
            });
        }
        
        // Actualizar título
        if (contentTitle) {
            const titles = {
                'all': 'Producciones recientes',
                'image': 'Imágenes',
                'video': 'Videos',
                'reel': 'Reels',
                'product': 'Productos',
                'brand': 'Marcas'
            };
            contentTitle.textContent = titles[category] || 'Producciones recientes';
        }
        
        // Re-renderizar grid con filtro
        if (filteredRuns.length === 0) {
            contentGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: var(--living-text-muted);">
                    <i class="fas fa-filter" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                    <p>No hay producciones en esta categoría</p>
                </div>
            `;
            return;
        }
        
        this.renderContentGrid(filteredRuns.slice(0, 12));
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

    getProductionStatus(run) {
        const status = (run.status || '').toLowerCase();
        if (status.includes('final') || status.includes('completed')) {
            return 'final';
        } else if (status.includes('draft')) {
            return 'draft';
        } else if (status.includes('rendering') || status.includes('processing')) {
            return 'rendering';
        }
        return 'draft';
    }

    setupEventListeners() {
        // Event listeners para featured cards
        const featuredCards = document.querySelectorAll('.featured-card');
        featuredCards.forEach(card => {
            card.addEventListener('click', () => {
                // Navegar a detalle de producción si es necesario
                console.log('Featured card clicked');
            });
        });
    }

    getPublicUrlFromStorage(bucketName, filePath) {
        if (!this.supabase || !bucketName || !filePath) {
            return null;
        }

        try {
            // Limpiar el path si viene con el nombre del bucket
            let cleanPath = filePath;
            if (filePath.startsWith(`${bucketName}/`)) {
                cleanPath = filePath.replace(`${bucketName}/`, '');
            } else if (filePath.startsWith('/')) {
                cleanPath = filePath.substring(1);
            }

            // Obtener URL pública desde Supabase Storage
            const { data } = this.supabase.storage
                .from(bucketName)
                .getPublicUrl(cleanPath);

            return data?.publicUrl || null;
        } catch (error) {
            console.warn('⚠️ Error obteniendo URL pública de storage:', error);
            return null;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.livingManager = new LivingManager();
    });
} else {
    window.livingManager = new LivingManager();
}
