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
        this.initialized = false;
        // NO llamar init() automáticamente - debe ser llamado explícitamente
    }

    async init() {
        // Evitar múltiples inicializaciones
        if (this.initialized) {
            console.log('ℹ️ LivingManager ya está inicializado, saltando...');
            return;
        }

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
            
            this.initialized = true;
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
            // La tabla correcta es brand_containers, no projects
            // brand_containers no tiene columna is_active
            const { data, error } = await this.supabase
                .from('brand_containers')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
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

            if (containerError) {
                if (containerError.status === 400 || containerError.code === '400') {
                    console.warn('⚠️ Error 400 cargando brand_container:', containerError.message);
                }
                throw containerError;
            }
            
            if (!container || !container.id) {
                this.products = [];
                return;
            }

            // Products usa brand_container_id, no project_id
            const { data, error } = await this.supabase
                .from('products')
                .select('*')
                .eq('brand_container_id', container.id)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.status === 400 || error.code === '400') {
                    console.warn('⚠️ Error 400 cargando productos:', error.message);
                    console.warn('⚠️ brand_container_id:', container.id);
                }
                throw error;
            }
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

            // Filtrar por brand_id si está disponible y es válido, sino por user_id
            if (this.brandId && this.brandId !== null && this.brandId !== undefined) {
                query = query.eq('brand_id', this.brandId);
            } else if (this.userId && this.userId !== null && this.userId !== undefined) {
                query = query.eq('user_id', this.userId);
            } else {
                // Si no hay filtros válidos, retornar array vacío
                console.warn('⚠️ No hay brand_id ni user_id válido para filtrar flow_runs');
                this.flowRuns = [];
                return;
            }

            const { data, error } = await query;

            if (error) {
                // Si es un error 400, loguear más información
                if (error.status === 400 || error.code === 'PGRST301') {
                    console.warn('⚠️ Error 400 en loadFlowRuns:', error.message);
                    console.warn('⚠️ Parámetros:', { brandId: this.brandId, userId: this.userId });
                }
                throw error;
            }
            this.flowRuns = data || [];
        } catch (error) {
            console.error('❌ Error cargando flow runs:', error);
            this.flowRuns = [];
        }
    }

    async loadFlowOutputs() {
        if (!this.supabase || !this.flowRuns.length) return;

        try {
            const runIds = this.flowRuns
                .map(run => run?.id)
                .filter(id => id !== null && id !== undefined);
            
            if (runIds.length === 0) {
                this.flowOutputs = [];
                return;
            }

            const { data, error } = await this.supabase
                .from('flow_outputs')
                .select('*')
                .in('run_id', runIds)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.status === 400 || error.code === '400') {
                    console.warn('⚠️ Error 400 cargando flow_outputs:', error.message);
                    console.warn('⚠️ runIds:', runIds);
                }
                throw error;
            }
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
        // Función RPC eliminada para evitar errores 400
        // Usar flow_outputs directamente en su lugar
        if (!this.supabase) {
            this.latestGeneratedContent = [];
            return;
        }

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

            // Cargar contenido desde flow_outputs usando método seguro (sin joins complejos)
            // Esto evita errores 400 de consultas complejas
            // Paso 1: Obtener flow_runs por brand_id
            const { data: runs, error: runsError } = await this.supabase
                .from('flow_runs')
                .select('id')
                .eq('brand_id', this.brandId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (runsError) {
                if (runsError.status === 400 || runsError.code === '400') {
                    console.warn('⚠️ Error 400 cargando flow_runs:', runsError.message);
                }
                this.latestGeneratedContent = [];
                return;
            }

            if (!runs || runs.length === 0) {
                this.latestGeneratedContent = [];
                return;
            }

            // Paso 2: Obtener flow_outputs usando los run_ids
            const runIds = runs.map(r => r.id).filter(id => id !== null && id !== undefined);
            
            if (runIds.length === 0) {
                this.latestGeneratedContent = [];
                return;
            }

            const { data: outputs, error: outputsError } = await this.supabase
                .from('flow_outputs')
                .select('*')
                .in('run_id', runIds)
                .order('created_at', { ascending: false })
                .limit(10);

            if (outputsError) {
                if (outputsError.status === 400 || outputsError.code === '400') {
                    console.warn('⚠️ Error 400 cargando flow_outputs:', outputsError.message);
                }
                this.latestGeneratedContent = [];
                return;
            }

            this.latestGeneratedContent = outputs || [];

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
        // Mover el modal fuera de #app-container al body
        this.moveModalToBody();
        
        // Renderizar las 3 secciones
        await this.renderHeroSection();
        await this.renderHistorySection();
        await this.renderHighlightsSection();
    }
    
    moveModalToBody() {
        const modal = document.getElementById('livingViewerModal');
        if (!modal) return;
        
        // Verificar si el modal está dentro de #app-container
        const appContainer = document.getElementById('app-container');
        if (appContainer && appContainer.contains(modal)) {
            // Mover el modal al body
            document.body.appendChild(modal);
            console.log('✅ Modal movido fuera de #app-container al body');
        }
    }

    async renderHeroSection() {
        const heroGrid = document.getElementById('livingHeroGrid');
        if (!heroGrid) return;
        
        // Solo producciones automatizadas (latestGeneratedContent)
        // "Esto es lo que tu sistema produjo"
        const automatedContent = this.latestGeneratedContent || [];
        
        if (automatedContent.length === 0) {
            heroGrid.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--living-text-muted); opacity: 0.6;">
                    <p style="font-size: 0.938rem;">Sistema en espera de producción</p>
                </div>
            `;
            return;
        }

        heroGrid.innerHTML = automatedContent.map((item, index) => {
            const imageUrl = item.image_url || item.url || item.storage_url || item.file_url;
            const prompt = item.prompt_used || item.prompt || '';
            
            // Construir URL completa si es necesario
            let finalImageUrl = imageUrl;
            if (!finalImageUrl && item.storage_path) {
                finalImageUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_path);
            }
            
            return this.renderCard(finalImageUrl, prompt, index, true, { item: item, output: null, run: null });
        }).join('');
        
        this.setupDownloadButtons(heroGrid);
    }

    async renderHistorySection() {
        const videosContainer = document.getElementById('livingHistoryVideos');
        const imagesContainer = document.getElementById('livingHistoryImages');
        
        if (!videosContainer || !imagesContainer) return;
        
        // Producciones de flujos que el usuario haya usado
        // Excluir las que ya están en hero (latestGeneratedContent)
        const automatedIds = new Set((this.latestGeneratedContent || []).map(item => item.id || item.run_id));
        
        const historyItems = this.flowRuns
            .filter(run => !automatedIds.has(run.id))
            .map(run => {
                const output = this.flowOutputs.find(o => o.run_id === run.id);
                const fileUrl = output?.file_url || output?.storage_path || null;
                
                // Detectar tipo de contenido
                let contentType = 'text';
                if (fileUrl) {
                    const url = fileUrl.toLowerCase();
                    if (url.includes('.mp4') || url.includes('.mov') || url.includes('.webm') || 
                        url.includes('video') || url.includes('reel') || url.includes('clip')) {
                        contentType = 'video';
                    } else if (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || 
                               url.includes('.webp') || url.includes('image') || url.includes('img')) {
                        contentType = 'image';
                    }
                } else if (output?.output_type) {
                    const type = output.output_type.toLowerCase();
                    if (type.includes('video') || type.includes('reel') || type.includes('clip')) {
                        contentType = 'video';
                    } else if (type.includes('image') || type.includes('img') || type.includes('still')) {
                        contentType = 'image';
                    }
                }
                
                return {
                    contentType,
                    fileUrl,
                    prompt: output?.prompt_used || run.status || '',
                    run: run,
                    output: output,
                    created_at: run.created_at || output?.created_at
                };
            })
            .sort((a, b) => {
                // Ordenar por fecha más reciente primero
                const dateA = new Date(a.created_at || 0);
                const dateB = new Date(b.created_at || 0);
                return dateB - dateA;
            });
        
        // Separar videos e imágenes/texto
        const videos = historyItems.filter(item => item.contentType === 'video');
        const images = historyItems.filter(item => item.contentType === 'image');
        const texts = historyItems.filter(item => item.contentType === 'text');
        
        // Si no hay ningún contenido, mostrar estado vacío solo en imágenes
        if (videos.length === 0 && images.length === 0 && texts.length === 0) {
            videosContainer.innerHTML = '';
            imagesContainer.innerHTML = this.renderEmptyState();
            return;
        }
        
        // Renderizar videos (scroll horizontal)
        if (videos.length === 0) {
            videosContainer.innerHTML = '';
        } else {
            videosContainer.innerHTML = videos.map((item, index) => {
                let thumbnailUrl = item.fileUrl;
                if (thumbnailUrl && !thumbnailUrl.startsWith('http') && item.output) {
                    const storagePath = item.output.storage_path || item.output.storage_object_id;
                    if (storagePath) {
                        thumbnailUrl = this.getPublicUrlFromStorage('production-outputs', storagePath) || thumbnailUrl;
                    }
                }
                
                return this.renderVideoCard(thumbnailUrl, item.run, item.output, item.prompt, index);
            }).join('');
            
            this.setupHistoryCardListeners(videosContainer, 'video');
        }
        
        // Renderizar imágenes y textos (masonry)
        const allVisualItems = [...images, ...texts];
        if (allVisualItems.length === 0) {
            imagesContainer.innerHTML = this.renderEmptyState();
        } else {
            imagesContainer.innerHTML = allVisualItems.map((item, index) => {
                if (item.contentType === 'text') {
                    return this.renderTextCard(item.run, item.output, index);
                } else {
                    let imageUrl = item.fileUrl;
                    if (imageUrl && !imageUrl.startsWith('http') && item.output) {
                        const storagePath = item.output.storage_path || item.output.storage_object_id;
                        if (storagePath) {
                            imageUrl = this.getPublicUrlFromStorage('production-outputs', storagePath) || imageUrl;
                        }
                    }
                    return this.renderHistoryImageCard(imageUrl, item.run, item.output, item.prompt, index);
                }
            }).join('');
            
            this.setupHistoryCardListeners(imagesContainer, 'image');
        }
    }
    
    renderVideoCard(thumbnailUrl, run, output, prompt, index) {
        const finalUrl = thumbnailUrl && thumbnailUrl.startsWith('http') ? thumbnailUrl : null;
        const productionId = run?.id || output?.id;
        const cardData = JSON.stringify({
            imageUrl: finalUrl,
            prompt: prompt || '',
            item: { item: null, output: output, run: run }
        }).replace(/"/g, '&quot;');
        
        return `
            <div class="history-video-card" data-production-id="${productionId}" data-run-id="${run?.id || ''}" data-card-info="${this.escapeHtml(cardData)}">
                ${finalUrl
                    ? `<img src="${this.escapeHtml(finalUrl)}" alt="Video thumbnail" class="history-video-card-thumbnail" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'history-video-card-thumbnail\\' style=\\'background: #0F1115; display: flex; align-items: center; justify-content: center;\\'><i class=\\'fas fa-video\\' style=\\'font-size: 2rem; color: var(--living-text-muted);\\'></i></div>';" onload="this.parentElement.style.width=this.naturalWidth/(this.naturalHeight/240)+'px';" />`
                    : `<div class="history-video-card-thumbnail" style="background: #0F1115; display: flex; align-items: center; justify-content: center; width: 180px;">
                        <i class="fas fa-video" style="font-size: 2rem; color: var(--living-text-muted);"></i>
                    </div>`
                }
                <i class="fas fa-video history-video-card-video-icon"></i>
                <button class="history-video-card-download" title="Descargar" data-image-url="${this.escapeHtml(finalUrl || '')}">
                    <i class="fas fa-download"></i>
                </button>
                <div class="history-video-card-duration">--:--</div>
                <div class="history-video-card-overlay"></div>
            </div>
        `;
    }

    renderHistoryImageCard(imageUrl, run, output, prompt, index) {
        const finalUrl = imageUrl && imageUrl.startsWith('http') ? imageUrl : null;
        const productionId = run?.id || output?.id;
        const cardData = JSON.stringify({
            imageUrl: finalUrl,
            prompt: prompt || '',
            item: { item: null, output: output, run: run }
        }).replace(/"/g, '&quot;');
        
        return `
            <div class="living-masonry-item">
                <div class="history-image-card" data-production-id="${productionId}" data-run-id="${run?.id || ''}" data-card-info="${this.escapeHtml(cardData)}">
                    ${finalUrl
                        ? `<img src="${this.escapeHtml(finalUrl)}" alt="Producción" loading="lazy" onerror="this.parentElement.innerHTML='<div style=\\'padding: 2rem; text-align: center; color: var(--living-text-muted);\\'><i class=\\'fas fa-image\\'></i></div>';" />`
                        : `<div style="padding: 2rem; text-align: center; color: var(--living-text-muted);">
                            <i class="fas fa-image" style="font-size: 2rem;"></i>
                        </div>`
                    }
                    <div class="history-image-card-overlay">
                        <button class="history-image-card-action" title="Descargar" data-image-url="${this.escapeHtml(finalUrl || '')}">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="history-image-card-action" title="Ver detalles">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderTextCard(run, output, index) {
        const productionId = run?.id || output?.id;
        
        return `
            <div class="living-masonry-item">
                <div class="history-text-card" data-production-id="${productionId}" data-run-id="${run?.id || ''}">
                    <div class="history-text-card-icon">?</div>
                    <div class="history-text-card-title">Producción de texto</div>
                </div>
            </div>
        `;
    }
    
    renderEmptyState() {
        return `
            <div class="living-history-empty">
                <div class="living-history-empty-illustration">
                    <i class="fas fa-layer-group" style="font-size: 3rem; color: var(--living-text-muted); opacity: 0.3;"></i>
                </div>
                <h3 class="living-history-empty-title">Aún no hay historial</h3>
                <p class="living-history-empty-description">
                    Cuando ejecutes flujos y generes contenido, aquí quedará registrado todo tu trabajo creativo.
                </p>
                <a href="#" class="living-history-empty-cta" onclick="if(window.router){window.router.navigate('/production');return false;}">
                    Ir a Producción
                </a>
            </div>
        `;
    }

    setupHistoryCardListeners(container, type) {
        const cards = container.querySelectorAll(`.history-${type}-card, .history-text-card`);
        cards.forEach(card => {
            // Prevenir clicks en botones de acción
            const actions = card.querySelectorAll('.history-video-card-download, .history-image-card-action');
            actions.forEach(action => {
                action.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (action.dataset.imageUrl) {
                        this.downloadImage(action.dataset.imageUrl);
                    }
                });
            });
            
            // Click en la card abre vista de visualización editorial
            card.addEventListener('click', (e) => {
                // No abrir si se clickeó un botón de acción
                if (e.target.closest('.history-video-card-download, .history-image-card-action')) {
                    return;
                }
                
                const cardData = card.dataset.cardInfo;
                if (cardData) {
                    try {
                        let unescapedData = cardData.replace(/&quot;/g, '"');
                        unescapedData = unescapedData
                            .replace(/&#39;/g, "'")
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>');
                        
                        const data = JSON.parse(unescapedData);
                        this.openViewerModal(data);
                    } catch (error) {
                        console.error('❌ Error parsing card data:', error);
                    }
                } else {
                    // Para cards de texto, redirigir a producción
                    const productionId = card.dataset.productionId;
                    const runId = card.dataset.runId;
                    if (productionId || runId) {
                        console.log('📋 Redirigiendo a producción:', { productionId, runId });
                        // TODO: Implementar navegación a vista de producción
                    }
                }
            });
        });
    }
    
    groupProductionsByNarrative(items) {
        // Agrupar por narrativa: "Hoy", "Ayer", "Esta semana", "Este mes"
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        
        const groups = {
            'Generado hoy': [],
            'Generado ayer': [],
            'Generado esta semana': [],
            'Generado este mes': [],
            'Anteriores': []
        };
        
        items.forEach(item => {
            const itemDate = new Date(item.created_at || 0);
            
            if (itemDate >= today) {
                groups['Generado hoy'].push(item);
            } else if (itemDate >= yesterday) {
                groups['Generado ayer'].push(item);
            } else if (itemDate >= weekAgo) {
                groups['Generado esta semana'].push(item);
            } else if (itemDate >= monthAgo) {
                groups['Generado este mes'].push(item);
            } else {
                groups['Anteriores'].push(item);
            }
        });
        
        // Eliminar grupos vacíos
        Object.keys(groups).forEach(key => {
            if (groups[key].length === 0) {
                delete groups[key];
            }
        });
        
        return groups;
    }

    async renderHighlightsSection() {
        const highlightsContent = document.getElementById('livingHighlightsContent');
        if (!highlightsContent) return;
        
        // Cards de destacados: mesa del productor
        // "Esto es lo que impulsa y mide tu producción"
        const highlights = [];
        
        // Flujos ejecutados
        if (this.flowRuns.length > 0) {
            highlights.push({
                title: 'Ejecutado',
                value: this.flowRuns.length,
                label: 'flujos procesados',
                icon: 'fas fa-project-diagram'
            });
        }
        
        // Productos
            if (this.products.length > 0) {
            highlights.push({
                title: 'Productos',
                value: this.products.length,
                label: 'en tu marca',
                icon: 'fas fa-box'
            });
        }
        
        // Producciones totales
        const totalProductions = (this.latestGeneratedContent?.length || 0) + this.flowRuns.length;
        if (totalProductions > 0) {
            highlights.push({
                title: 'Producido',
                value: totalProductions,
                label: 'renders generados',
                icon: 'fas fa-images'
            });
        }
        
        if (highlights.length === 0) {
            highlightsContent.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--living-text-muted);">
                    <i class="fas fa-chart-line" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    <p>No hay datos destacados aún</p>
                </div>
            `;
            return;
        }

        highlightsContent.innerHTML = highlights.map(highlight => `
            <div class="highlight-card">
                <div class="highlight-card-title">
                    <i class="${highlight.icon}"></i> ${highlight.title}
                </div>
                <div class="highlight-card-value">${highlight.value}</div>
                <div class="highlight-card-label">${highlight.label}</div>
            </div>
        `).join('');
    }

    renderCard(imageUrl, prompt, index, isHero = false, itemData = null) {
        const finalImageUrl = imageUrl && imageUrl.startsWith('http') ? imageUrl : null;
        const cardData = JSON.stringify({
            imageUrl: finalImageUrl,
            prompt: prompt || '',
            item: itemData
        });
        
        // Escapar JSON para atributo HTML: escapar comillas dobles con &quot;
        // El navegador desescapará automáticamente cuando leamos con dataset
        const escapedCardData = cardData.replace(/"/g, '&quot;');

            return `
            <div class="featured-card" data-index="${index}" data-image-url="${this.escapeHtml(finalImageUrl || '')}" data-card-info="${escapedCardData}">
                <div class="featured-card-visual">
                    ${finalImageUrl
                        ? `<img src="${this.escapeHtml(finalImageUrl)}" alt="${this.escapeHtml(prompt)}" loading="${index < 3 ? 'eager' : 'lazy'}" onerror="this.parentElement.innerHTML='<div class=\\'featured-card-visual-placeholder\\'><i class=\\'fas fa-image\\'></i></div>';" onload="this.style.opacity='1';">`
                        : `<div class="featured-card-visual-placeholder"><i class="fas fa-image"></i></div>`
                    }
                        </div>
                <div class="featured-card-prompt-overlay">
                    <div class="featured-card-prompt-title">Prompt</div>
                    <div class="featured-card-prompt-text">${this.escapeHtml(prompt)}</div>
                    </div>
                <button class="featured-card-download-btn" title="Descargar imagen" data-image-url="${this.escapeHtml(finalImageUrl || '')}">
                    <i class="fas fa-download"></i>
                </button>
                </div>
            `;
    }

    setupDownloadButtons(container) {
        const downloadBtns = container.querySelectorAll('.featured-card-download-btn');
        downloadBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const imageUrl = btn.dataset.imageUrl;
                if (imageUrl && imageUrl.startsWith('http')) {
                    this.downloadImage(imageUrl);
                }
            });
        });
        
        // Agregar event listeners para abrir modal de visualización
        const cards = container.querySelectorAll('.featured-card');
        cards.forEach((card, idx) => {
            // Remover listener anterior si existe para evitar duplicados
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
            
            newCard.addEventListener('click', (e) => {
                // No abrir modal si se clickeó el botón de descarga
                if (e.target.closest('.featured-card-download-btn')) {
                    return;
                }
                
                const cardData = newCard.dataset.cardInfo;
                if (!cardData) {
                    console.warn('⚠️ No se encontró data-card-info en la card', newCard);
                    return;
                }
                
                try {
                    // El navegador debería desescapar automáticamente, pero por si acaso
                    // desescapamos manualmente las entidades HTML
                    let unescapedData = cardData;
                    // Si todavía tiene &quot;, desescapar
                    if (cardData.includes('&quot;')) {
                        unescapedData = cardData.replace(/&quot;/g, '"');
                    }
                    // También manejar otros escapes comunes
                    unescapedData = unescapedData
                        .replace(/&#39;/g, "'")
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>');
                    
                    const data = JSON.parse(unescapedData);
                    console.log('✅ Abriendo modal con datos:', data);
                    this.openViewerModal(data);
                } catch (error) {
                    console.error('❌ Error parsing card data:', error);
                    console.error('Raw data:', cardData);
                    console.error('Card element:', newCard);
                }
            });
        });
        
        // Agregar estilos para transición suave de imágenes
        const images = container.querySelectorAll('.featured-card-visual img');
        images.forEach(img => {
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.5s ease';
        });
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
    
    openViewerModal(data) {
        const modal = document.getElementById('livingViewerModal');
        const image = document.getElementById('livingViewerImage');
        const promptEl = document.getElementById('livingViewerPrompt');
        const metadataEl = document.getElementById('livingViewerMetadata');
        const closeBtn = document.getElementById('livingViewerClose');
        const backdrop = document.getElementById('livingViewerBackdrop');
        const downloadBtn = document.getElementById('livingViewerDownload');
        
        if (!modal || !image || !promptEl || !metadataEl) {
            console.error('❌ Elementos del modal no encontrados');
            return;
        }

        // Cargar imagen
        if (data.imageUrl) {
            image.src = data.imageUrl;
            image.alt = data.prompt || 'Producción';
            // Resetear zoom al cargar nueva imagen
            image.style.transform = 'scale(1)';
            image.style.transformOrigin = 'center center';
        } else {
            image.src = '';
            image.alt = 'Sin imagen disponible';
        }
        
        // Guardar URL de imagen para descarga
        if (downloadBtn) {
            downloadBtn.dataset.imageUrl = data.imageUrl || '';
        }
        
        // Configurar zoom en la imagen
        this.setupImageZoom(image);
        
        // Cargar prompt
        promptEl.textContent = data.prompt || 'Sin prompt disponible';
        
        // Cargar metadatos
        const item = data.item || {};
        const output = item.output || {};
        const run = item.run || {};
        const itemData = item.item || {};
        
        const metadataItems = [];
        
        // Solo mostrar la fecha sin label
        let creationDate = null;
        if (output.created_at) {
            creationDate = new Date(output.created_at).toLocaleString('es-ES');
        } else if (itemData.created_at) {
            creationDate = new Date(itemData.created_at).toLocaleString('es-ES');
        }
        
        // Solo mostrar la fecha, sin otros metadatos
        metadataEl.innerHTML = creationDate
            ? `<div style="color: var(--living-text-muted); font-size: 13px;">${this.escapeHtml(creationDate)}</div>`
            : '<div style="color: var(--living-text-muted); font-size: 13px;">Fecha no disponible</div>';
        
        // Mostrar modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Cerrar modal - remover listeners anteriores para evitar duplicados
        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
        
        // Remover listeners anteriores
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        const newBackdrop = backdrop.cloneNode(true);
        backdrop.parentNode.replaceChild(newBackdrop, backdrop);
        const newDownloadBtn = downloadBtn ? downloadBtn.cloneNode(true) : null;
        if (downloadBtn && newDownloadBtn) {
            downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
        }
        
        // Agregar nuevos listeners
        document.getElementById('livingViewerClose').addEventListener('click', closeModal);
        document.getElementById('livingViewerBackdrop').addEventListener('click', closeModal);
        
        // Listener para botón de descarga
        if (newDownloadBtn) {
            const finalDownloadBtn = document.getElementById('livingViewerDownload');
            if (finalDownloadBtn) {
                finalDownloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const imageUrl = finalDownloadBtn.dataset.imageUrl;
                    if (imageUrl && imageUrl.startsWith('http')) {
                        this.downloadImage(imageUrl);
                    }
                });
            }
        }
        
        // Cerrar con ESC
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    setupCategoryFilters() {
        const categoryBtns = document.querySelectorAll('.category-btn');
        
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remover active de todos
                categoryBtns.forEach(b => b.classList.remove('active'));
                // Agregar active al clickeado
                btn.classList.add('active');
                
                const category = btn.dataset.category;
                this.filterByCategory(category);
            });
        });
    }

    filterByCategory(category) {
        // Guardar categoría activa para usar en renderUnifiedGrid
        this.activeCategory = category;
        // Re-renderizar el grid unificado con el filtro aplicado
        this.renderUnifiedGrid();
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
        // Los event listeners para las cards se configuran en setupDownloadButtons()
        // después de que se renderizan las cards
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

    setupImageZoom(image) {
        if (!image) return;
        
        let scale = 1;
        const minScale = 1;
        const maxScale = 3;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let translateX = 0;
        let translateY = 0;
        
        // Zoom con rueda del mouse
        image.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const oldScale = scale;
            scale = Math.max(minScale, Math.min(maxScale, scale + delta));
            
            if (scale !== oldScale) {
                // Calcular el punto relativo en la imagen antes del zoom
                const rect = image.getBoundingClientRect();
                const x = (e.clientX - rect.left - rect.width / 2) / oldScale;
                const y = (e.clientY - rect.top - rect.height / 2) / oldScale;
                
                // Ajustar translate para mantener el punto bajo el cursor
                translateX = -x * (scale - oldScale);
                translateY = -y * (scale - oldScale);
                
                image.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
                image.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
            }
        });
        
        // Arrastrar cuando está con zoom
        image.addEventListener('mousedown', (e) => {
            if (scale > 1) {
                isDragging = true;
                startX = e.clientX - translateX * scale;
                startY = e.clientY - translateY * scale;
                image.style.cursor = 'grabbing';
            }
        });
        
        image.addEventListener('mousemove', (e) => {
            if (isDragging && scale > 1) {
                translateX = (e.clientX - startX) / scale;
                translateY = (e.clientY - startY) / scale;
                image.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
            }
        });
        
        image.addEventListener('mouseup', () => {
            isDragging = false;
            if (scale > 1) {
                image.style.cursor = 'grab';
            }
        });
        
        image.addEventListener('mouseleave', () => {
            isDragging = false;
        });
        
        // Doble click para resetear zoom
        image.addEventListener('dblclick', () => {
            scale = 1;
            translateX = 0;
            translateY = 0;
            image.style.transform = 'scale(1)';
            image.style.cursor = 'zoom-in';
        });
        
        // Cursor inicial
        image.style.cursor = 'zoom-in';
        image.style.transition = 'transform 0.1s ease-out';
    }

    // Método destroy() eliminado - sin limpieza manual
}

// Hacer disponible globalmente para que pueda ser usado por LivingView
if (typeof window !== 'undefined') {
    window.LivingManager = LivingManager;
}

// NO inicializar automáticamente - LivingView se encargará de crear la instancia cuando sea necesario
// Esto evita conflictos cuando se navega entre rutas
