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
        // Renderizar las 3 secciones
        await this.renderHeroSection();
        await this.renderHistorySection();
        await this.renderHighlightsSection();
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
            
            return this.renderCard(finalImageUrl, prompt, index, true);
        }).join('');
        
        this.setupDownloadButtons(heroGrid);
    }

    async renderHistorySection() {
        const historyGrid = document.getElementById('livingHistoryGrid');
        if (!historyGrid) return;
        
        // Producciones de flujos que el usuario haya usado
        // Excluir las que ya están en hero (latestGeneratedContent)
        const automatedIds = new Set((this.latestGeneratedContent || []).map(item => item.id || item.run_id));
        
        const historyItems = this.flowRuns
            .filter(run => !automatedIds.has(run.id))
            .map(run => {
                const output = this.flowOutputs.find(o => o.run_id === run.id);
                return {
                    prompt: output?.prompt_used || run.status || '',
                    image_url: output?.file_url || output?.storage_path || null,
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
        
        if (historyItems.length === 0) {
            historyGrid.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--living-text-muted); opacity: 0.6;">
                    <p style="font-size: 0.875rem;">Sin producciones ejecutadas</p>
                </div>
            `;
            return;
        }

        // Agrupación narrativa: agrupar por día o tipo
        const groupedItems = this.groupProductionsByNarrative(historyItems);
        
        // Renderizar con agrupación narrativa
        historyGrid.innerHTML = Object.entries(groupedItems).map(([groupTitle, items]) => {
            return `
                <div class="living-history-group">
                    <div class="living-history-group-title">${groupTitle}</div>
                    ${items.map((item, index) => {
                        const imageUrl = item.image_url;
                        const prompt = item.prompt;
                        
                        // Construir URL completa si es necesario
                        let finalImageUrl = imageUrl;
                        if (imageUrl && !imageUrl.startsWith('http') && item.output) {
                            const storagePath = item.output.storage_path || item.output.storage_object_id;
                            if (storagePath) {
                                finalImageUrl = this.getPublicUrlFromStorage('production-outputs', storagePath) || imageUrl;
                            }
                        }
                        
                        return `
                            <div class="living-masonry-item">
                                ${this.renderCard(finalImageUrl, prompt, index, false)}
                </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');
        
        this.setupDownloadButtons(historyGrid);
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

    renderCard(imageUrl, prompt, index, isHero = false) {
        const finalImageUrl = imageUrl && imageUrl.startsWith('http') ? imageUrl : null;
        const cardId = `card-${index}-${Date.now()}`;
        
        return `
            <div class="featured-card" 
                 data-index="${index}" 
                 data-image-url="${this.escapeHtml(finalImageUrl || '')}"
                 data-prompt="${this.escapeHtml(prompt)}"
                 data-card-id="${cardId}">
                <div class="featured-card-visual">
                    ${finalImageUrl
                        ? `<img src="${this.escapeHtml(finalImageUrl)}" alt="${this.escapeHtml(prompt)}" loading="${index < 3 ? 'eager' : 'lazy'}" onerror="this.parentElement.innerHTML='<div class=\\'featured-card-visual-placeholder\\'><i class=\\'fas fa-image\\'></i></div>';" onload="this.style.opacity='1';">`
                        : `<div class="featured-card-visual-placeholder"><i class="fas fa-image"></i></div>`
                    }
                </div>
                ${!isHero ? `
                    <div class="featured-card-prompt-overlay">
                        <div class="featured-card-prompt-title">Prompt</div>
                        <div class="featured-card-prompt-text">${this.escapeHtml(prompt)}</div>
                    </div>
                ` : ''}
                <button class="featured-card-download-btn" 
                        title="Descargar producción" 
                        data-image-url="${this.escapeHtml(finalImageUrl || '')}">
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
