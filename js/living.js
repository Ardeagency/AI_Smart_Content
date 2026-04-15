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
        this.brandContainerId = null;
        this.organizationId = null;
        this.latestGeneratedContent = [];
        this.systemAiOutputs = []; // Producciones de system_ai_outputs (excl. OpenAI)
        this.eventListenersSetup = false;
        this.initialized = false;
        // Filtros del historial
        this.filterDateFrom = null;
        this.filterDateTo = null;
        this.filterContentType = '';
        this.filterFlowName = '';
        this._calendarMonth = null;
        this._calendarYear = null;
        this._dateRangeStart = null;
        this._dateRangeEnd = null;
        this._historyFiltersSetup = false;
        this._historyVisibleCount = 0;
        this._historyCurrentItems = [];
        this._historyScrollBound = false;
        this._historyLoadingMore = false;
        this._historySourcesLoading = false;
        this._historyPageSize = 40;
        this._historySourceBatchSize = 60;
        this._flowRunsOffset = 0;
        this._flowRunsHasMore = true;
        this._latestGeneratedOffset = 0;
        this._latestGeneratedHasMore = true;
        this._systemAiOffset = 0;
        this._systemAiHasMore = true;
        
        // Datos de la Sección 3: Tráfico y Control de Producción
        this.section3Data = {
            studioStatus: null,
            topEntity: null,
            formatDistribution: null,
            activityTimeline: null,
            activeCampaign: null,
            keyProductions: null,
            productionEfficiency: null,
            teamOverview: null
        };
        
        // NO llamar init() automáticamente - debe ser llamado explícitamente
    }

    async init() {
        // Evitar múltiples inicializaciones
        if (this.initialized) {
            return;
        }

        const historyContainer = document.getElementById('livingHistoryContent');
        if (historyContainer) {
            historyContainer.innerHTML = this.renderHistorySkeletons();
        }
        this.ensureViewerModalInPortal();

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
            
            // Cargar datos base primero (en paralelo)
            await Promise.allSettled([
                this.loadUserData(),
                this.loadProjectData()
            ]);

            // Cargar brand_id antes de las consultas que lo necesitan
            await this.loadBrandId();

            // Cargar datos relacionados usando Promise.allSettled para que errores no detengan todo
            await Promise.allSettled([
                this.loadProducts(),
                this.loadCreditUsage()
            ]);

            // Historial incremental: primera tanda ligera para evitar latencia alta inicial
            await this.loadMoreHistorySources({ reset: true });

            // Renderizar solo Historial (sin sección 3 ni hero)
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
            const sources = [
                () => window.supabaseService ? window.supabaseService.getClient() : null,
                () => typeof waitForSupabase === 'function' ? waitForSupabase() : null,
                () => window.supabaseClient,
                () => window.appLoader?.waitFor?.('supabase'),
                () => window.supabase
            ];

            for (const getClient of sources) {
                try {
                    const client = await getClient();
                    if (client && this.isValidSupabaseClient(client)) {
                        this.supabase = client;
                        const { data: { user }, error } = await client.auth.getUser();
                        if (!error && user?.id) {
                            this.userId = user.id;
                            return;
                        }
                    }
                } catch (_) {}
            }

            console.warn('⚠️ No se pudo inicializar Supabase con ningún método disponible');
        } catch (error) {
            console.error('❌ Error inicializando Supabase:', error);
        }
    }

    /**
     * Validar que el cliente de Supabase tenga los métodos necesarios
     */
    isValidSupabaseClient(client) {
        return client && 
               typeof client.from === 'function' && 
               typeof client.auth === 'object' &&
               typeof client.auth.getUser === 'function';
    }

    async loadUserData() {
        if (!this.supabase || !this.userId) { this.userData = null; return; }
        try {
            const { data, error } = await this.supabase
                .from('profiles').select('*').eq('id', this.userId).maybeSingle();
            if (error) throw error;
            this.userData = data;
        } catch (error) {
            console.error('❌ Error cargando datos de usuario:', error);
            this.userData = null;
        }
    }

    async loadProjectData() {
        if (!this.supabase || !this.userId) { this.projectData = null; return; }
        try {
            const { data, error } = await this.supabase
                .from('brand_containers').select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1).maybeSingle();
            if (error) throw error;
            this.projectData = data;
        } catch (error) {
            console.error('❌ Error cargando datos del proyecto:', error);
            this.projectData = null;
        }
    }

    /**
     * Cargar productos para el dashboard Living
     * NOTA: Esta función es una versión simplificada que solo carga datos básicos.
     * Para funcionalidad completa (con imágenes), usar ProductsManager.
     */
    async loadProducts() {
        if (!this.supabase) { this.products = []; return; }
        const orgId = this.organizationId || this.projectData?.organization_id || null;
        if (!orgId && !this.brandContainerId) { this.products = []; return; }
        try {
            let q = this.supabase
                .from('products')
                .select('id, nombre_producto, tipo_producto, precio_producto, moneda, created_at');
            if (orgId) q = q.eq('organization_id', orgId);
            else q = q.eq('brand_container_id', this.brandContainerId);
            const { data, error } = await q.order('created_at', { ascending: false });
            if (error) throw error;
            this.products = data || [];
        } catch (error) {
            console.error('❌ Error cargando productos:', error);
            this.products = [];
        }
    }

    async loadFlowRuns({ reset = false } = {}) {
        if (!this.supabase || (!this.brandId && !this.userId)) {
            if (reset) this.flowRuns = [];
            return [];
        }
        if (reset) {
            this.flowRuns = [];
            this._flowRunsOffset = 0;
            this._flowRunsHasMore = true;
        }
        if (!this._flowRunsHasMore) return [];
        try {
            const from = this._flowRunsOffset;
            const to = from + this._historySourceBatchSize - 1;
            let query = this.supabase
                .from('flow_runs')
                .select('*, content_flows(name)')
                .order('created_at', { ascending: false })
                .range(from, to);

            query = this.brandId ? query.eq('brand_id', this.brandId) : query.eq('user_id', this.userId);
            let { data, error } = await query;

            if (error) {
                // Fallback sin join si la relación falla
                query = this.supabase.from('flow_runs').select('*')
                    .order('created_at', { ascending: false }).range(from, to);
                query = this.brandId ? query.eq('brand_id', this.brandId) : query.eq('user_id', this.userId);
                const res = await query;
                if (res.error) {
                    this._flowRunsHasMore = false;
                    return [];
                }
                const newRuns = res.data || [];
                if (newRuns.length < this._historySourceBatchSize) this._flowRunsHasMore = false;
                this._flowRunsOffset += newRuns.length;
                const existing = new Set((this.flowRuns || []).map(r => r?.id).filter(Boolean));
                this.flowRuns = [...(this.flowRuns || []), ...newRuns.filter(r => r?.id && !existing.has(r.id))];
                return newRuns;
            }
            const newRuns = data || [];
            if (newRuns.length < this._historySourceBatchSize) this._flowRunsHasMore = false;
            this._flowRunsOffset += newRuns.length;
            const existing = new Set((this.flowRuns || []).map(r => r?.id).filter(Boolean));
            this.flowRuns = [...(this.flowRuns || []), ...newRuns.filter(r => r?.id && !existing.has(r.id))];
            return newRuns;
        } catch (error) {
            console.error('❌ Error cargando flow runs:', error);
            this._flowRunsHasMore = false;
            return [];
        }
    }

    async loadFlowOutputs({ reset = false, runIds = [] } = {}) {
        if (!this.supabase) {
            if (reset) this.flowOutputs = [];
            return;
        }
        if (reset) this.flowOutputs = [];
        try {
            const targetRunIds = (runIds && runIds.length ? runIds : this.flowRuns.map(r => r?.id).filter(Boolean));
            if (!targetRunIds.length) return;

            const { data, error } = await this.supabase
                .from('runs_outputs').select('*')
                .in('run_id', targetRunIds)
                .order('created_at', { ascending: false });
            if (error) throw error;
            const newOutputs = data || [];
            const existing = new Set((this.flowOutputs || []).map(o => o?.id).filter(Boolean));
            this.flowOutputs = [...(this.flowOutputs || []), ...newOutputs.filter(o => o?.id && !existing.has(o.id))];
        } catch (error) {
            console.error('❌ Error cargando flow outputs:', error);
        }
    }

    async loadCreditUsage() {
        if (!this.supabase || !this.userId) { this.creditUsage = []; return; }
        try {
            const { data, error } = await this.supabase
                .from('credit_usage').select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false }).limit(100);
            if (error) throw error;
            this.creditUsage = data || [];
        } catch (error) {
            console.error('❌ Error cargando credit usage:', error);
            this.creditUsage = [];
        }
    }

    async loadBrandId() {
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            this.brandId = null;
            return;
        }

        try {
            // Reutilizar brandContainerId de loadProjectData() si ya se cargó
            if (!this.brandContainerId && this.projectData?.id) {
                this.brandContainerId = this.projectData.id;
                if (!this.organizationId && this.projectData.organization_id) {
                    this.organizationId = this.projectData.organization_id;
                }
            }

            if (!this.brandContainerId) {
                this.brandId = null;
                return;
            }

            const { data: brand, error: brandError } = await this.supabase
                .from('brands')
                .select('id')
                .eq('project_id', this.brandContainerId)
                .maybeSingle();

            if (brandError) {
                if (brandError.status === 400 || brandError.code === '400') {
                    console.warn('⚠️ Error 400 cargando brands en loadBrandId:', brandError.message);
                }
                this.brandId = null;
                return;
            }
            this.brandId = brand?.id || null;
        } catch (error) {
            console.error('❌ Error cargando brand_id:', error);
            this.brandId = null;
        }
    }

    async loadLatestGeneratedContent({ reset = false } = {}) {
        if (!this.supabase || !this.brandId) {
            if (reset) this.latestGeneratedContent = [];
            return;
        }
        if (reset) {
            this.latestGeneratedContent = [];
            this._latestGeneratedOffset = 0;
            this._latestGeneratedHasMore = true;
        }
        if (!this._latestGeneratedHasMore) return;

        try {
            const { data: runs, error: runsError } = await this.supabase
                .from('flow_runs').select('id')
                .eq('brand_id', this.brandId)
                .order('created_at', { ascending: false })
                .range(this._latestGeneratedOffset, this._latestGeneratedOffset + this._historySourceBatchSize - 1);
            if (runsError || !runs?.length) {
                this._latestGeneratedHasMore = false;
                return;
            }

            const runIds = runs.map(r => r.id).filter(Boolean);
            if (!runIds.length) {
                this._latestGeneratedHasMore = false;
                return;
            }

            const { data: outputs, error: outputsError } = await this.supabase
                .from('runs_outputs')
                .select('id, run_id, output_type, storage_path, storage_object_id, prompt_used, generated_copy, text_content, metadata, created_at, generated_hashtags, creative_rationale')
                .in('run_id', runIds)
                .order('created_at', { ascending: false })
                .limit(this._historySourceBatchSize);

            if (outputsError) {
                this._latestGeneratedHasMore = false;
                return;
            }
            const page = outputs || [];
            this._latestGeneratedOffset += runIds.length;
            if (runIds.length < this._historySourceBatchSize) this._latestGeneratedHasMore = false;
            const existing = new Set((this.latestGeneratedContent || []).map(o => o?.id).filter(Boolean));
            this.latestGeneratedContent = [...(this.latestGeneratedContent || []), ...page.filter(o => o?.id && !existing.has(o.id))];
        } catch (error) {
            console.error('❌ Error loading latest generated content:', error);
            this._latestGeneratedHasMore = false;
        }
    }

    /**
     * Carga producciones de system_ai_outputs (solo las que NO son de OpenAI).
     * Se usa brand_container_id y user_id; provider != 'openai'.
     */
    async loadSystemAiOutputs({ reset = false } = {}) {
        if (!this.supabase || !this.brandContainerId || !this.userId) {
            if (reset) this.systemAiOutputs = [];
            return;
        }
        if (reset) {
            this.systemAiOutputs = [];
            this._systemAiOffset = 0;
            this._systemAiHasMore = true;
        }
        if (!this._systemAiHasMore) return;
        try {
            const { data, error } = await this.supabase
                .from('system_ai_outputs')
                .select('id, brand_container_id, user_id, provider, output_type, status, storage_path, storage_object_id, prompt_used, text_content, metadata, created_at')
                .eq('brand_container_id', this.brandContainerId)
                .eq('user_id', this.userId)
                .neq('provider', 'openai')
                .order('created_at', { ascending: false })
                .range(this._systemAiOffset, this._systemAiOffset + this._historySourceBatchSize - 1);
            if (error) {
                console.warn('⚠️ Error cargando system_ai_outputs:', error.message || error.code);
                this._systemAiHasMore = false;
                return;
            }
            const page = data || [];
            if (page.length < this._historySourceBatchSize) this._systemAiHasMore = false;
            this._systemAiOffset += page.length;
            const existing = new Set((this.systemAiOutputs || []).map(o => o?.id).filter(Boolean));
            this.systemAiOutputs = [...(this.systemAiOutputs || []), ...page.filter(o => o?.id && !existing.has(o.id))];
        } catch (error) {
            console.error('❌ Error cargando system_ai_outputs:', error);
            this._systemAiHasMore = false;
        }
    }

    async loadMoreHistorySources({ reset = false } = {}) {
        if (this._historySourcesLoading) return;
        this._historySourcesLoading = true;
        try {
            if (reset) {
                this._historyVisibleCount = 0;
                this._flowRunsHasMore = true;
                this._latestGeneratedHasMore = true;
                this._systemAiHasMore = true;
            }
            const newRuns = await this.loadFlowRuns({ reset });
            const newRunIds = (newRuns || []).map(r => r?.id).filter(Boolean);
            await this.loadFlowOutputs({ reset, runIds: newRunIds });
            await Promise.allSettled([
                this.loadLatestGeneratedContent({ reset }),
                this.loadSystemAiOutputs({ reset })
            ]);
        } finally {
            this._historySourcesLoading = false;
        }
    }

    // ============================================
    // SECCIÓN 3: TRÁFICO Y CONTROL DE PRODUCCIÓN
    // ============================================

    async loadSection3Data() {
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase)) {
            return;
        }

        try {
            // Cargar todas las métricas en paralelo
            await Promise.allSettled([
                this.loadStudioStatus(),
                this.loadTopEntity(),
                this.loadFormatDistribution(),
                this.loadActivityTimeline(),
                this.loadActiveCampaign(),
                this.loadKeyProductions(),
                this.loadProductionEfficiency(),
                this.loadTeamOverview()
            ]);
        } catch (error) {
            console.error('❌ Error cargando datos de la sección 3:', error);
        }
    }

    async loadStudioStatus() {
        if (!this.brandId) return;

        try {
            const { data, error } = await this.supabase.rpc('get_studio_activity_status', {
                p_brand_id: this.brandId
            });

            if (error) {
                console.warn('⚠️ Error cargando estado del estudio:', error);
                this.section3Data.studioStatus = null;
                return;
            }

            this.section3Data.studioStatus = data;
        } catch (error) {
            console.error('❌ Error en loadStudioStatus:', error);
            this.section3Data.studioStatus = null;
        }
    }

    async loadTopEntity() {
        if (!this.brandContainerId) return;

        try {
            const { data, error } = await this.supabase.rpc('get_top_produced_entity', {
                p_brand_container_id: this.brandContainerId
            });

            if (error) {
                console.warn('⚠️ Error cargando entidad más producida:', error);
                this.section3Data.topEntity = null;
                return;
            }

            this.section3Data.topEntity = data;
        } catch (error) {
            console.error('❌ Error en loadTopEntity:', error);
            this.section3Data.topEntity = null;
        }
    }

    async loadFormatDistribution() {
        if (!this.brandId) return;

        try {
            const { data, error } = await this.supabase.rpc('get_production_format_distribution', {
                p_brand_id: this.brandId
            });

            if (error) {
                console.warn('⚠️ Error cargando distribución de formatos:', error);
                this.section3Data.formatDistribution = null;
                return;
            }

            this.section3Data.formatDistribution = data;
        } catch (error) {
            console.error('❌ Error en loadFormatDistribution:', error);
            this.section3Data.formatDistribution = null;
        }
    }

    async loadActivityTimeline() {
        if (!this.brandId) return;

        try {
            const { data, error } = await this.supabase.rpc('get_activity_timeline', {
                p_brand_id: this.brandId,
                p_days: 30
            });

            if (error) {
                console.warn('⚠️ Error cargando timeline de actividad:', error);
                this.section3Data.activityTimeline = null;
                return;
            }

            this.section3Data.activityTimeline = data;
        } catch (error) {
            console.error('❌ Error en loadActivityTimeline:', error);
            this.section3Data.activityTimeline = null;
        }
    }

    async loadActiveCampaign() {
        if (!this.brandId) return;

        try {
            const { data, error } = await this.supabase.rpc('get_active_campaign_summary', {
                p_brand_id: this.brandId
            });

            if (error) {
                console.warn('⚠️ Error cargando campaña activa:', error);
                this.section3Data.activeCampaign = null;
                return;
            }

            this.section3Data.activeCampaign = data;
        } catch (error) {
            console.error('❌ Error en loadActiveCampaign:', error);
            this.section3Data.activeCampaign = null;
        }
    }

    async loadKeyProductions() {
        if (!this.brandId) return;

        try {
            const { data, error } = await this.supabase.rpc('get_key_productions', {
                p_brand_id: this.brandId,
                p_limit: 5
            });

            if (error) {
                this.section3Data.keyProductions = null;
                if (!this._keyProductionsErrorLogged) {
                    this._keyProductionsErrorLogged = true;
                    console.warn('⚠️ Producciones destacadas no disponibles:', error.message || error.code);
                }
                return;
            }

            this.section3Data.keyProductions = data;
        } catch (err) {
            this.section3Data.keyProductions = null;
            if (!this._keyProductionsErrorLogged) {
                this._keyProductionsErrorLogged = true;
                console.warn('⚠️ Producciones destacadas:', err?.message || err);
            }
        }
    }

    async loadProductionEfficiency() {
        if (!this.brandId) return;

        try {
            const { data, error } = await this.supabase.rpc('get_production_efficiency', {
                p_brand_id: this.brandId
            });

            if (error) {
                console.warn('⚠️ Error cargando eficiencia de producción:', error);
                this.section3Data.productionEfficiency = null;
                return;
            }

            this.section3Data.productionEfficiency = data;
        } catch (error) {
            console.error('❌ Error en loadProductionEfficiency:', error);
            this.section3Data.productionEfficiency = null;
        }
    }

    async loadTeamOverview() {
        if (!this.organizationId) return;

        try {
            const { data, error } = await this.supabase.rpc('get_team_living_overview', {
                p_organization_id: this.organizationId
            });

            if (error) {
                this.section3Data.teamOverview = null;
                if (!this._teamOverviewErrorLogged) {
                    this._teamOverviewErrorLogged = true;
                    console.warn('⚠️ Overview del equipo no disponible:', error.message || error.code);
                }
                return;
            }

            this.section3Data.teamOverview = data;
        } catch (err) {
            this.section3Data.teamOverview = null;
            if (!this._teamOverviewErrorLogged) {
                this._teamOverviewErrorLogged = true;
                console.warn('⚠️ Overview del equipo:', err?.message || err);
            }
        }
    }

    async renderAll() {
        this.ensureViewerModalInPortal();
        await this.renderHistorySection();
    }

    ensureViewerModalInPortal() {
        const modal = document.getElementById('livingViewerModal');
        const portal = document.getElementById('modals-portal');
        if (!modal || !portal) return;
        if (modal.parentElement !== portal) {
            portal.appendChild(modal);
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
            
            // Buscar prompt en múltiples campos posibles según el schema de runs_outputs
            // El schema tiene: prompt_used, generated_copy, text_content, metadata
            let prompt = item.prompt_used || 
                        item.prompt || 
                        item.generated_copy || 
                        item.text_content || 
                        '';
            
            // Si no hay prompt directo, buscar en metadata
            if (!prompt && item.metadata) {
                if (typeof item.metadata === 'string') {
                    try {
                        const metadata = JSON.parse(item.metadata);
                        prompt = metadata.prompt || metadata.prompt_used || metadata.generated_prompt || '';
                    } catch (e) {
                        // metadata no es JSON válido, ignorar
                    }
                } else if (typeof item.metadata === 'object') {
                    prompt = item.metadata.prompt || 
                            item.metadata.prompt_used || 
                            item.metadata.generated_prompt || 
                            '';
                }
            }
            
            // Construir URL completa si es necesario
            let finalImageUrl = imageUrl;
            // Validar que storage_path sea válido antes de usarlo
            if (!finalImageUrl && item.storage_path && typeof item.storage_path === 'string' && item.storage_path.trim() !== '') {
                finalImageUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_path);
            }
            // Si storage_path falló, intentar con storage_object_id
            if (!finalImageUrl && item.storage_object_id && typeof item.storage_object_id === 'string' && item.storage_object_id.trim() !== '') {
                // storage_object_id puede ser un UUID, necesitamos el path real
                // Por ahora, intentar usarlo directamente si parece un path
                if (item.storage_object_id.includes('/') || item.storage_object_id.includes('.')) {
                    finalImageUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_object_id);
                }
            }
            
            return this.renderCard(finalImageUrl, prompt, index, true, { item: item, output: null, run: null });
        }).join('');
        
        this.setupDownloadButtons(heroGrid);
    }

    async renderHistorySection() {
        const container = document.getElementById('livingHistoryContent');
        if (!container) return;

        // Todo el contenido producido: una tarjeta por cada output (flow_outputs), no una por run
        const fromRuns = (this.flowOutputs || []).map(output => {
            const run = (this.flowRuns || []).find(r => r.id === output.run_id);
            const fileUrl = this.resolveOutputMediaUrl(output) || output?.file_url || output?.storage_path || null;
            let contentType = 'text';
            if (fileUrl) {
                const url = (fileUrl + '').toLowerCase();
                if (url.includes('.mp4') || url.includes('.mov') || url.includes('.webm') || url.includes('video') || url.includes('reel') || url.includes('clip')) {
                    contentType = 'video';
                } else if (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp') || url.includes('image') || url.includes('img')) {
                    contentType = 'image';
                }
            } else if (output?.output_type) {
                const type = (output.output_type + '').toLowerCase();
                if (type.includes('video') || type.includes('reel') || type.includes('clip')) contentType = 'video';
                else if (type.includes('image') || type.includes('img') || type.includes('still')) contentType = 'image';
            }
            let prompt = output?.prompt_used || output?.prompt || output?.generated_copy || output?.text_content || '';
            if (!prompt && output?.metadata) {
                try {
                    const meta = typeof output.metadata === 'string' ? JSON.parse(output.metadata) : output.metadata;
                    prompt = meta?.prompt || meta?.prompt_used || meta?.generated_prompt || '';
                } catch (_) {}
            }
            if (!prompt && run) prompt = run.status || '';
            const resolvedUrl = fileUrl && (String(fileUrl).startsWith('http') || String(fileUrl).startsWith('//')) ? fileUrl : (output?.storage_path ? (this.getPublicUrlFromStorage('production-outputs', output.storage_path) || this.getPublicUrlFromStorage('outputs', output.storage_path)) : null) || fileUrl;
            return {
                contentType,
                fileUrl: resolvedUrl,
                prompt,
                run: run || { id: output.run_id },
                output,
                created_at: output?.created_at || run?.created_at,
                _outputId: output?.id
            };
        }).filter(it => it.output != null);

        const fromGenerated = (this.latestGeneratedContent || []).map(item => {
            let resolvedUrl = this.resolveOutputMediaUrl(item) || item.image_url || item.url || item.storage_url || item.file_url || null;
            if (!resolvedUrl && item.storage_path && typeof item.storage_path === 'string' && item.storage_path.trim() !== '') {
                resolvedUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_path) || this.getPublicUrlFromStorage('outputs', item.storage_path);
            }
            if (!resolvedUrl && item.storage_object_id && typeof item.storage_object_id === 'string' && (item.storage_object_id.includes('/') || item.storage_object_id.includes('.'))) {
                resolvedUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_object_id);
            }
            if (resolvedUrl && !resolvedUrl.startsWith('http') && !resolvedUrl.startsWith('//')) resolvedUrl = null;
            let prompt = item.prompt_used || item.prompt || item.generated_copy || item.text_content || '';
            if (!prompt && item.metadata) {
                try {
                    const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
                    prompt = meta?.prompt || meta?.prompt_used || meta?.generated_prompt || '';
                } catch (_) {}
            }
            const outputType = (item.output_type || '').toLowerCase();
            let contentType = 'image';
            if (outputType.includes('video') || outputType.includes('reel') || outputType.includes('clip')) contentType = 'video';
            else if (outputType.includes('image') || outputType.includes('img') || resolvedUrl) contentType = 'image';
            else contentType = 'text';
                return {
                    contentType,
                fileUrl: resolvedUrl,
                prompt,
                run: { id: item.run_id },
                output: item,
                created_at: item.created_at,
                _outputId: item.id
            };
        });

        // Producciones de system_ai_outputs (no OpenAI): mismo formato que fromGenerated
        const fromSystemAi = (this.systemAiOutputs || []).map(item => {
            let resolvedUrl = this.resolveOutputMediaUrl(item) || null;
            if (!resolvedUrl && item.storage_path && typeof item.storage_path === 'string' && item.storage_path.trim() !== '') {
                resolvedUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_path) || this.getPublicUrlFromStorage('outputs', item.storage_path);
            }
            if (!resolvedUrl && item.storage_object_id && typeof item.storage_object_id === 'string' && (item.storage_object_id.includes('/') || item.storage_object_id.includes('.'))) {
                resolvedUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_object_id);
            }
            if (resolvedUrl && !resolvedUrl.startsWith('http') && !resolvedUrl.startsWith('//')) resolvedUrl = null;
            let prompt = item.prompt_used || item.text_content || '';
            if (!prompt && item.metadata) {
                try {
                    const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
                    prompt = meta?.prompt || meta?.prompt_used || meta?.generated_prompt || (meta?.text_content || '');
                } catch (_) {}
            }
            const outputType = (item.output_type || '').toLowerCase();
            let contentType = 'image';
            if (outputType.includes('video') || outputType.includes('reel') || outputType.includes('clip')) contentType = 'video';
            else if (outputType.includes('image') || outputType.includes('img') || resolvedUrl) contentType = 'image';
            else contentType = 'text';
            return {
                contentType,
                fileUrl: resolvedUrl,
                prompt,
                run: { id: null, content_flows: { name: 'System AI' } },
                output: item,
                created_at: item.created_at,
                _outputId: item.id
            };
        });

        const hasTextContent = (it) => {
            const prompt = (it.prompt || '').trim();
            if (prompt) return true;
            const out = it.output;
            if (out && ((out.generated_copy || '').trim() || (out.text_content || '').trim())) return true;
            return false;
        };

        const seenIds = new Set();
        let allItems = [...fromRuns, ...fromGenerated, ...fromSystemAi]
            .filter(it => {
                const id = it._outputId || it.run?.id + '-' + (it.output?.id || it.created_at);
                if (seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
            })
            .filter(it => {
                // No mostrar runs sin output (tarjetas fantasma)
                if (it.run && !it.output) return false;
                // No mostrar ítems de tipo "text" sin contenido mostrable
                if ((it.contentType || '') === 'text' && !hasTextContent(it)) return false;
                return true;
            })
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        // Aplicar filtros
        if (this.filterDateFrom != null) {
            const from = new Date(this.filterDateFrom);
            from.setHours(0, 0, 0, 0);
            allItems = allItems.filter(it => {
                const d = new Date(it.created_at || 0);
                d.setHours(0, 0, 0, 0);
                return d >= from;
            });
        }
        if (this.filterDateTo != null) {
            const to = new Date(this.filterDateTo);
            to.setHours(23, 59, 59, 999);
            allItems = allItems.filter(it => new Date(it.created_at || 0) <= to);
        }
        if (this.filterContentType) {
            allItems = allItems.filter(it => (it.contentType || '') === this.filterContentType);
        }
        if (this.filterFlowName) {
            allItems = allItems.filter(it => this.getFlowName(it.run) === this.filterFlowName);
        }

        this._historyCurrentItems = allItems;

        if (allItems.length === 0) {
            container.innerHTML = this.renderEmptyState();
            return;
        }

        if (!this._historyVisibleCount) {
            this._historyVisibleCount = Math.min(this._historyPageSize, allItems.length);
        } else {
            this._historyVisibleCount = Math.min(this._historyVisibleCount, allItems.length);
        }

        const visibleItems = allItems.slice(0, this._historyVisibleCount);

        const COLUMNS = 5;
        const itemHtmls = visibleItems.map((item, index) => {
            if (item.contentType === 'video') {
                let thumbnailUrl = item.fileUrl;
                if (!thumbnailUrl && item.output) thumbnailUrl = this.resolveOutputMediaUrl(item.output);
                if (thumbnailUrl && !thumbnailUrl.startsWith('http') && !thumbnailUrl.startsWith('//') && item.output) {
                    const sp = item.output.storage_path;
                    if (sp && typeof sp === 'string' && sp.trim() !== '') {
                        const u = this.getPublicUrlFromStorage('production-outputs', sp) || this.getPublicUrlFromStorage('outputs', sp);
                        if (u) thumbnailUrl = u;
                    }
                }
                const card = this.renderVideoCard(thumbnailUrl, item.run, item.output, item.prompt, index);
                return `<div class="living-masonry-item living-masonry-item-video">${card}</div>`;
            }
            if (item.contentType === 'text') {
                return this.renderTextCard(item.run, item.output, index);
            }
            let imageUrl = item.fileUrl;
            if (imageUrl && !imageUrl.startsWith('http') && item.output) {
                const sp = item.output.storage_path || item.output.storage_object_id;
                if (sp && typeof sp === 'string' && sp.trim() !== '') {
                    const u = this.getPublicUrlFromStorage('production-outputs', sp);
                    if (u) imageUrl = u;
                }
            }
            return this.renderHistoryImageCard(imageUrl, item.run, item.output, item.prompt, index);
        });

        const columns = Array.from({ length: COLUMNS }, () => []);
        itemHtmls.forEach((html, i) => {
            columns[i % COLUMNS].push(html);
        });
        const gridHtml = `<div class="living-masonry-grid living-history-masonry">${columns.map(col => `<div class="living-masonry-column">${col.join('')}</div>`).join('')}</div>`;
        container.innerHTML = gridHtml;

        this.setupHistoryCardListeners(container);
        this.setupHistoryFilters();
        this.setupHistoryInfiniteScroll();
    }

    setupHistoryInfiniteScroll() {
        if (this._historyScrollBound) return;
        this._historyScrollBound = true;
        this._onHistoryScroll = () => {
            this.maybeLoadMoreHistoryOnScroll();
        };
        window.addEventListener('scroll', this._onHistoryScroll, { passive: true });
        this.maybeLoadMoreHistoryOnScroll();
    }

    async maybeLoadMoreHistoryOnScroll() {
        if (this._historyLoadingMore) return;
        const container = document.getElementById('livingHistoryContent');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const nearBottom = rect.bottom - window.innerHeight < 320;
        if (!nearBottom) return;

        this._historyLoadingMore = true;
        try {
            const localTotal = (this._historyCurrentItems || []).length;
            if (this._historyVisibleCount < localTotal) {
                this._historyVisibleCount = Math.min(this._historyVisibleCount + this._historyPageSize, localTotal);
                await this.renderHistorySection();
                return;
            }

            const hasMoreRemote = this._flowRunsHasMore || this._latestGeneratedHasMore || this._systemAiHasMore;
            if (hasMoreRemote) {
                await this.loadMoreHistorySources();
                const newTotal = (this._historyCurrentItems || []).length;
                this._historyVisibleCount = Math.min(this._historyVisibleCount + this._historyPageSize, newTotal || this._historyVisibleCount + this._historyPageSize);
                await this.renderHistorySection();
            }
        } finally {
            this._historyLoadingMore = false;
        }
    }
    
    setupHistoryFilters() {
        this.populateFlowFilter();
        if (this._historyFiltersSetup) return;
        this._historyFiltersSetup = true;

        const typeSelect = document.getElementById('livingFilterType');
        const flowSelect = document.getElementById('livingFilterFlow');
        if (typeSelect) typeSelect.addEventListener('change', () => {
            this.filterContentType = (typeSelect.value || '').trim();
            this._historyVisibleCount = 0;
            this.renderHistorySection();
        });
        if (flowSelect) flowSelect.addEventListener('change', () => {
            this.filterFlowName = (flowSelect.value || '').trim();
            this._historyVisibleCount = 0;
            this.renderHistorySection();
        });

        const trigger = document.getElementById('livingDateTrigger');
        const dropdown = document.getElementById('livingDateDropdown');
        const valueEl = document.getElementById('livingDateValue');
        const prevBtn = document.getElementById('livingDatePrev');
        const nextBtn = document.getElementById('livingDateNext');
        const gridEl = document.getElementById('livingDateGrid');
        const monthYearEl = document.getElementById('livingDateMonthYear');
        const clearBtn = document.getElementById('livingDateClear');

        const now = new Date();
        if (this._calendarMonth == null) this._calendarMonth = now.getMonth();
        if (this._calendarYear == null) this._calendarYear = now.getFullYear();

        const formatDateRange = () => {
            if (!this.filterDateFrom && !this.filterDateTo) return 'Seleccionar';
            const fmt = d => d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
            if (this.filterDateFrom && this.filterDateTo) return `${fmt(this.filterDateFrom)} - ${fmt(this.filterDateTo)}`;
            return fmt(this.filterDateFrom || this.filterDateTo);
        };

        const renderCalendar = () => {
            if (!gridEl || !monthYearEl) return;
            const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            monthYearEl.textContent = `${monthNames[this._calendarMonth]} ${this._calendarYear}`;
            const first = new Date(this._calendarYear, this._calendarMonth, 1);
            const startPad = (first.getDay() + 6) % 7; // Lunes = 0
            const daysInMonth = new Date(this._calendarYear, this._calendarMonth + 1, 0).getDate();
            const prevMonthDays = new Date(this._calendarYear, this._calendarMonth, 0).getDate();
            let html = '';
            for (let i = 0; i < startPad; i++) {
                const d = prevMonthDays - startPad + 1 + i;
                html += `<span class="living-date-cell other-month" data-day="${d}" data-other="1">${d}</span>`;
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(this._calendarYear, this._calendarMonth, d);
                const ts = date.getTime();
                const isToday = date.getTime() === today.getTime();
                let cls = 'living-date-cell';
                if (isToday) cls += ' today';
                const from = this.filterDateFrom ? new Date(this.filterDateFrom).setHours(0, 0, 0, 0) : null;
                const to = this.filterDateTo ? new Date(this.filterDateTo).setHours(0, 0, 0, 0) : null;
                if (from !== null && to !== null && ts >= from && ts <= to) {
                    if (ts === from) cls += ' range-start';
                    else if (ts === to) cls += ' range-end';
                    else cls += ' in-range';
                }
                html += `<span class="${cls}" data-day="${d}" data-year="${this._calendarYear}" data-month="${this._calendarMonth}">${d}</span>`;
            }
            const totalCells = startPad + daysInMonth;
            const remainder = totalCells % 7;
            const nextFill = remainder ? 7 - remainder : 0;
            for (let n = 1; n <= nextFill; n++) {
                html += `<span class="living-date-cell other-month" data-day="${n}" data-other="1">${n}</span>`;
            }
            gridEl.innerHTML = html;
        };

        const onGridClick = (e) => {
            const cell = e.target.closest('.living-date-cell');
            if (!cell || cell.classList.contains('other-month')) return;
            const day = parseInt(cell.getAttribute('data-day'), 10);
            const month = parseInt(cell.getAttribute('data-month'), 10);
            const year = parseInt(cell.getAttribute('data-year'), 10);
            const date = new Date(year, month, day);
            if (this.filterDateFrom == null || (this.filterDateFrom != null && this.filterDateTo != null)) {
                this.filterDateFrom = new Date(date);
                this.filterDateTo = null;
        } else {
                if (date < this.filterDateFrom) {
                    this.filterDateTo = new Date(this.filterDateFrom);
                    this.filterDateFrom = new Date(date);
                } else {
                    this.filterDateTo = new Date(date);
                }
            }
            if (valueEl) valueEl.textContent = formatDateRange();
            valueEl?.classList.toggle('has-range', !!(this.filterDateFrom || this.filterDateTo));
            renderCalendar();
            this._historyVisibleCount = 0;
            this.renderHistorySection();
        };
        gridEl?.addEventListener('click', onGridClick);

        const openDropdown = () => {
            if (trigger && dropdown) {
                const rect = trigger.getBoundingClientRect();
                dropdown.style.left = rect.left + 'px';
                dropdown.style.top = (rect.bottom + 4) + 'px';
            }
            dropdown?.classList.add('is-open');
            dropdown?.setAttribute('aria-hidden', 'false');
            trigger?.setAttribute('aria-expanded', 'true');
            renderCalendar();
        };
        const closeDropdown = () => {
            dropdown?.classList.remove('is-open');
            dropdown?.setAttribute('aria-hidden', 'true');
            trigger?.setAttribute('aria-expanded', 'false');
            if (dropdown) dropdown.style.left = dropdown.style.top = '';
        };

        trigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown?.classList.contains('is-open')) closeDropdown();
            else openDropdown();
        });
        prevBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._calendarMonth--;
            if (this._calendarMonth < 0) { this._calendarMonth = 11; this._calendarYear--; }
            renderCalendar();
        });
        nextBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._calendarMonth++;
            if (this._calendarMonth > 11) { this._calendarMonth = 0; this._calendarYear++; }
            renderCalendar();
        });
        clearBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.filterDateFrom = null;
            this.filterDateTo = null;
            if (valueEl) valueEl.textContent = 'Seleccionar';
            valueEl?.classList.remove('has-range');
            renderCalendar();
            this._historyVisibleCount = 0;
            this.renderHistorySection();
            closeDropdown();
        });
        if (this._docClickCloseDropdown) document.removeEventListener('click', this._docClickCloseDropdown);
        this._docClickCloseDropdown = (e) => {
            if (dropdown?.classList.contains('is-open') && !dropdown.contains(e.target) && trigger && !trigger.contains(e.target))
                closeDropdown();
        };
        document.addEventListener('click', this._docClickCloseDropdown);

        if (valueEl) valueEl.textContent = formatDateRange();
        valueEl?.classList.toggle('has-range', !!(this.filterDateFrom || this.filterDateTo));
    }

    populateFlowFilter() {
        const flowSelect = document.getElementById('livingFilterFlow');
        if (!flowSelect) return;
        const names = [];
        const set = new Set();
        (this.flowRuns || []).forEach(run => {
            const name = this.getFlowName(run);
            if (name && !set.has(name)) { set.add(name); names.push(name); }
        });
        if ((this.systemAiOutputs || []).length > 0 && !set.has('System AI')) {
            set.add('System AI');
            names.push('System AI');
        }
        const current = flowSelect.value;
        flowSelect.innerHTML = '<option value="">Todos los flujos</option>' + names.map(n => `<option value="${this.escapeHtml(n)}">${this.escapeHtml(n)}</option>`).join('');
        if (set.has(current)) flowSelect.value = current;
    }
    
    getFlowName(run) {
        if (!run) return 'Producción';
        const flow = run.content_flows;
        if (flow && typeof flow === 'object' && flow.name) return flow.name;
        if (run.flow_name) return run.flow_name;
        return 'Producción';
    }
    
    renderVideoCard(thumbnailUrl, run, output, prompt, index) {
        const finalUrl = thumbnailUrl && (thumbnailUrl.startsWith('http') || thumbnailUrl.startsWith('//')) ? thumbnailUrl : null;
        const productionId = run?.id || output?.id;
        const flowName = this.getFlowName(run);
        const promptSafe = (prompt || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const cardData = JSON.stringify({
            imageUrl: finalUrl,
            prompt: prompt || '',
            item: { item: null, output: output, run: run }
        }).replace(/"/g, '&quot;');
        
        const isVideoUrl = finalUrl && /\.(mp4|webm|mov)(\?|$)/i.test(finalUrl);
        const thumbnailHtml = finalUrl
            ? (isVideoUrl
                ? `<video class="history-video-card-thumbnail" src="${this.escapeHtml(finalUrl)}" muted playsinline preload="metadata" loading="lazy" crossorigin="anonymous" onerror="var w=this.closest('.history-video-card-thumbnail-wrap'); if(w){ var d=document.createElement('div'); d.className='history-video-card-thumbnail'; d.style.cssText='background:#0F1115;display:flex;align-items:center;justify-content:center;min-width:180px;min-height:120px'; d.innerHTML='<i class=\\'fas fa-video\\' style=\\'font-size:2rem;color:var(--living-text-muted)\\'>\\x3c/i>'; w.innerHTML=''; w.appendChild(d); }"></video>`
                : `<img src="${this.escapeHtml(finalUrl)}" alt="Video thumbnail" class="history-video-card-thumbnail" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'history-video-card-thumbnail\\' style=\\'background: #0F1115; display: flex; align-items: center; justify-content: center;\\'><i class=\\'fas fa-video\\' style=\\'font-size: 2rem; color: var(--living-text-muted);\\'></i></div>';" onload="this.parentElement.style.width=this.naturalWidth/(this.naturalHeight/240)+'px';" />`)
            : `<div class="history-video-card-thumbnail" style="background: #0F1115; display: flex; align-items: center; justify-content: center; width: 180px;">
                <i class="fas fa-video" style="font-size: 2rem; color: var(--living-text-muted);"></i>
            </div>`;
        return `
            <div class="history-video-card" data-production-id="${productionId}" data-run-id="${run?.id || ''}" data-card-info="${this.escapeHtml(cardData)}">
                <div class="history-video-card-thumbnail-wrap">${thumbnailHtml}</div>
                <div class="history-card-actions">
                    <button class="history-card-download" title="Descargar" data-image-url="${this.escapeHtml(finalUrl || '')}">
                    <i class="fas fa-download"></i>
                </button>
                    <button class="history-card-copy-prompt" title="Copiar prompt" data-prompt="${this.escapeHtml(promptSafe)}">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <div class="history-card-flow-name">${this.escapeHtml(flowName)}</div>
            </div>
        `;
    }

    renderHistoryImageCard(imageUrl, run, output, prompt, index) {
        const finalUrl = imageUrl && imageUrl.startsWith('http') ? imageUrl : null;
        const productionId = run?.id || output?.id;
        const flowName = this.getFlowName(run);
        const promptSafe = (prompt || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
                    <div class="history-card-actions">
                        <button class="history-card-download" title="Descargar" data-image-url="${this.escapeHtml(finalUrl || '')}">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="history-card-copy-prompt" title="Copiar prompt" data-prompt="${this.escapeHtml(promptSafe)}">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div class="history-card-flow-name">${this.escapeHtml(flowName)}</div>
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
                <p class="living-history-empty-message">No hay producción</p>
            </div>
        `;
    }

    /**
     * Skeletons de carga para el contenedor History/Community (misma estructura masonry).
     */
    renderHistorySkeletons() {
        const COLUMNS = 5;
        const SKELETONS_PER_COLUMN = 4;
        const columns = [];
        for (let c = 0; c < COLUMNS; c++) {
            const skeletons = [];
            for (let i = 0; i < SKELETONS_PER_COLUMN; i++) {
                const isWide = (c + i) % 3 === 0;
                skeletons.push(
                    `<div class="living-history-skeleton ${isWide ? 'living-history-skeleton--wide' : 'living-history-skeleton--tall'}"></div>`
                );
            }
            columns.push(`<div class="living-masonry-column">${skeletons.join('')}</div>`);
        }
        return `<div class="living-masonry-grid living-history-masonry">${columns.join('')}</div>`;
    }

    /**
     * Configura el botón "Ir a Producción" del estado vacío (navega a Studio con contexto org si aplica)
     */
    setupEmptyStateCta(container) {
        if (!container) return;
        const cta = container.querySelector('[data-living-empty-cta="studio"]');
        if (!cta || !window.router) return;
        cta.addEventListener('click', (e) => {
            e.preventDefault();
            const path = window.location.pathname || '';
            const base = path.startsWith('/org/') ? path.split('/').slice(0, 4).join('/') : '';
            const studioPath = base ? `${base}/studio` : '/studio';
            window.router.navigate(studioPath);
        });
    }

    setupHistoryCardListeners(container, type) {
        const selector = type
            ? `.history-${type}-card, .history-text-card`
            : '.history-video-card, .history-image-card, .history-text-card';
        const cards = container.querySelectorAll(selector);
        cards.forEach(card => {
            const downloadBtns = card.querySelectorAll('.history-card-download');
            downloadBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (btn.dataset.imageUrl) this.downloadImage(btn.dataset.imageUrl);
                });
            });
            const copyBtns = card.querySelectorAll('.history-card-copy-prompt');
            copyBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const raw = (btn.dataset.prompt || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                    if (raw && navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(raw).then(() => {
                            if (typeof window.showToast === 'function') window.showToast('Prompt copiado');
                            else btn.classList.add('history-copy-ok');
                        }).catch(() => {});
                    }
                });
            });
            
            // Reproducción al pasar el cursor sobre la tarjeta de vídeo
            if (card.classList.contains('history-video-card')) {
                const wrap = card.querySelector('.history-video-card-thumbnail-wrap');
                card.addEventListener('mouseenter', () => {
                    const video = wrap && wrap.querySelector('video');
                    if (video) {
                        video.muted = true;
                        video.play().catch(() => {});
                    }
                });
                card.addEventListener('mouseleave', () => {
                    const video = wrap && wrap.querySelector('video');
                    if (video) {
                        video.pause();
                        video.currentTime = 0;
                    }
                });
            }
            
            card.addEventListener('click', (e) => {
                if (e.target.closest('.history-card-download, .history-card-copy-prompt')) return;
                
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
                        // Navegación a vista de producción
                        if (window.router) {
                            window.router.navigate('/identities');
                        }
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
        
        // 1️⃣ Estado del Estudio
        if (this.section3Data.studioStatus) {
            const status = this.section3Data.studioStatus;
            const statusIcon = status.status === 'active' ? 'fas fa-circle' : 
                             status.status === 'paused' ? 'fas fa-pause-circle' : 
                             'fas fa-stop-circle';
            const statusColor = status.status === 'active' ? '#4ade80' : 
                               status.status === 'paused' ? '#fbbf24' : 
                               '#6b7280';
            
            highlights.push({
                title: 'Estado del Estudio',
                value: status.message || 'Sin actividad',
                label: status.last_activity ? 
                    `Última actividad: ${new Date(status.last_activity).toLocaleDateString('es-ES')}` : 
                    'Sin actividad reciente',
                icon: statusIcon,
                status: status.status,
                statusColor: statusColor
            });
        }
        
        // 2️⃣ Entidad Más Producida
        if (this.section3Data.topEntity && this.section3Data.topEntity.entity_name) {
            highlights.push({
                title: 'Entidad Dominante',
                value: this.section3Data.topEntity.entity_name,
                label: `${this.section3Data.topEntity.total_productions} producciones`,
                icon: 'fas fa-star',
                subtitle: this.section3Data.topEntity.entity_type
            });
        }
        
        // 3️⃣ Formato de Producción Dominante
        if (this.section3Data.formatDistribution && this.section3Data.formatDistribution.formats) {
            const topFormat = this.section3Data.formatDistribution.formats[0];
            if (topFormat) {
                const formatIcon = topFormat.type === 'image' ? 'fas fa-image' :
                                 topFormat.type === 'video' ? 'fas fa-video' :
                                 'fas fa-file-alt';
                
                highlights.push({
                    title: 'Formato Preferido',
                    value: `${topFormat.percentage}%`,
                    label: topFormat.type,
                    icon: formatIcon,
                    subtitle: `${topFormat.count} de ${this.section3Data.formatDistribution.total}`
                });
            }
        }
        
        // 7️⃣ Eficiencia del Sistema
        if (this.section3Data.productionEfficiency) {
            const eff = this.section3Data.productionEfficiency;
            highlights.push({
                title: 'Eficiencia',
                value: eff.efficiency_percentage ? `${eff.efficiency_percentage}%` : '0%',
                label: `${eff.total_outputs} outputs / ${eff.total_runs} runs`,
                icon: 'fas fa-chart-line'
            });
        }
        
        // Campaña Activa (si existe)
        if (this.section3Data.activeCampaign && this.section3Data.activeCampaign.has_active_campaign) {
            const campaign = this.section3Data.activeCampaign;
            highlights.push({
                title: 'Campaña Activa',
                value: campaign.campaign_name || 'Campaña sin nombre',
                label: `${campaign.total_productions} producciones`,
                icon: 'fas fa-bullhorn',
                subtitle: campaign.last_production ? 
                    `Última: ${new Date(campaign.last_production).toLocaleDateString('es-ES')}` : 
                    null
            });
        }
        
        // Fallback: Métricas básicas si no hay datos de sección 3
        if (highlights.length === 0) {
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
            const totalProductions = (this.flowOutputs?.length || 0) + (this.systemAiOutputs?.length || 0);
            if (totalProductions > 0) {
                highlights.push({
                    title: 'Producido',
                    value: totalProductions,
                    label: 'renders generados',
                    icon: 'fas fa-images'
                });
            }
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

        highlightsContent.innerHTML = highlights.map(highlight => {
            const statusStyle = highlight.statusColor ? 
                `style="color: ${highlight.statusColor};"` : '';
            
            return `
            <div class="highlight-card">
                <div class="highlight-card-title">
                    <i class="${highlight.icon}" ${statusStyle}></i> ${highlight.title}
                </div>
                <div class="highlight-card-value">${this.escapeHtml(String(highlight.value))}</div>
                <div class="highlight-card-label">${this.escapeHtml(highlight.label)}</div>
                ${highlight.subtitle ? `<div class="highlight-card-subtitle">${this.escapeHtml(highlight.subtitle)}</div>` : ''}
            </div>
        `;
        }).join('');
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
        
        // Abrir modal de previsualización al click en cards
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
                if (!cardData) return;
                try {
                    let unescapedData = cardData;
                    if (cardData.includes('&quot;')) {
                        unescapedData = cardData.replace(/&quot;/g, '"');
                    }
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
            });
        });
        
        // Agregar estilos para transición suave de imágenes
        const images = container.querySelectorAll('.featured-card-visual img');
        images.forEach(img => {
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.5s ease';
        });
    }
    
    /**
     * Obtiene la extensión para el nombre de descarga según la URL o tipo de contenido.
     * @param {string} url - URL del recurso
     * @returns {string} - Extensión con punto (ej: .jpg, .png, .mp4)
     */
    getDownloadExtension(url) {
        if (!url || typeof url !== 'string') return '.jpg';
        const path = url.split('?')[0].toLowerCase();
        const match = path.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|webm|avi|mkv|pdf|svg|heic)(\?|$)/i);
        if (match) return '.' + match[1].toLowerCase().replace('jpeg', 'jpg');
        if (path.includes('video') || path.includes('reel') || path.includes('clip')) return '.mp4';
        return '.jpg';
    }

    /**
     * Descarga el archivo localmente (imagen o video). No abre en pestaña; fuerza descarga.
     * Soporta jpg, png, webp, gif, mp4, mov, webm, etc.
     */
    async downloadImage(imageUrl) {
        if (!imageUrl || !imageUrl.startsWith('http')) return;
        const ext = this.getDownloadExtension(imageUrl);
        const filename = `production-${Date.now()}${ext}`;
        try {
            const response = await fetch(imageUrl, { mode: 'cors' });
            if (!response.ok) throw new Error(response.statusText);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.warn('Descarga por fetch fallida, intentando enlace directo:', error?.message);
            try {
                const link = document.createElement('a');
                link.href = imageUrl;
                link.download = filename;
                link.rel = 'noopener noreferrer';
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (e) {
                console.error('Error descargando:', e);
            }
        }
    }
    
    openViewerModal(data) {
        const modal = document.getElementById('livingViewerModal');
        const image = document.getElementById('livingViewerImage');
        const videoEl = document.getElementById('livingViewerVideo');
        const promptEl = document.getElementById('livingViewerPrompt');
        const metadataEl = document.getElementById('livingViewerMetadata');
        const correctionSection = document.getElementById('livingViewerCorrectionSection');
        const correctionInput = document.getElementById('livingViewerCorrectionInput');
        const correctionBtn = document.getElementById('livingViewerCorrectionBtn');
        const correctionStatus = document.getElementById('livingViewerCorrectionStatus');
        const closeBtn = document.getElementById('livingViewerClose');
        const backdrop = document.getElementById('livingViewerBackdrop');
        
        if (!modal || !image || !promptEl || !metadataEl) {
            console.error('❌ Elementos del modal no encontrados');
            return;
        }

        const item = data.item || {};
        const output = item.output || {};
        const run = item.run || {};
        let mediaUrl = data.imageUrl && (data.imageUrl.startsWith('http') || data.imageUrl.startsWith('//')) ? data.imageUrl : '';
        if (!mediaUrl && output) mediaUrl = this.resolveOutputMediaUrl(output) || '';
        if (!mediaUrl && output) {
            mediaUrl = output.file_url || output.url || output.image_url || '';
            if ((!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) && output.metadata) {
                const metaFromOutput = typeof output.metadata === 'object'
                    ? output.metadata
                    : (() => { try { return JSON.parse(output.metadata || '{}'); } catch (_) { return {}; } })();
                mediaUrl = metaFromOutput.result_url || metaFromOutput.image_url || metaFromOutput.url || '';
            }
        }
        const outputType = (output.output_type || '').toLowerCase();
        const isVideo = !!(mediaUrl && /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl)) || outputType.includes('video') || outputType.includes('reel') || outputType.includes('clip');
        if (isVideo && !mediaUrl && output) {
            const rawPath = output.storage_path && typeof output.storage_path === 'string' ? output.storage_path.trim() : '';
            if (rawPath) mediaUrl = this.getPublicUrlFromStorage('production-outputs', rawPath) || this.getPublicUrlFromStorage('outputs', rawPath) || '';
            if (!mediaUrl && output.metadata) {
                const meta = typeof output.metadata === 'object' ? output.metadata : (() => { try { return JSON.parse(output.metadata || '{}'); } catch (_) { return {}; } })();
                mediaUrl = meta.video_url || meta.url || meta.file_url || meta.videoUrl || meta.output_url || meta.publicUrl || meta.src || '';
            }
        }

        if (videoEl) {
            videoEl.pause();
            videoEl.removeAttribute('src');
            videoEl.load();
            videoEl.style.display = 'none';
        }
        image.style.display = '';
        const visualWrap = modal.querySelector('.living-viewer-visual');
        if (visualWrap) visualWrap.classList.remove('living-viewer-visual--video');

        if (isVideo && videoEl && mediaUrl) {
            image.src = '';
            image.alt = '';
            image.style.display = 'none';
            if (visualWrap) visualWrap.classList.add('living-viewer-visual--video');
            videoEl.setAttribute('src', mediaUrl);
            videoEl.style.display = 'block';
            videoEl.controls = true;
            videoEl.muted = false;
            videoEl.load();
            videoEl.play().catch(() => {});
            this.setupImageZoom(null);
        } else {
            if (mediaUrl) {
                image.src = mediaUrl;
                image.alt = data.prompt || 'Producción';
                image.style.transform = 'scale(1)';
                image.style.transformOrigin = 'center center';
            } else {
                image.src = '';
                image.alt = 'Sin imagen disponible';
            }
            this.setupImageZoom(image);
        }
        
        const promptText = data.prompt || 'Sin prompt disponible';
        promptEl.textContent = promptText;
        
        // runs_outputs: model, output_type, metadata, technical_params, created_at; opcionales: generated_copy, creative_rationale, generated_hashtags, text_content
        const technicalParams = (() => {
            if (!output || output.technical_params == null) return {};
            if (typeof output.technical_params === 'object') return output.technical_params;
            if (typeof output.technical_params === 'string') {
                try { return JSON.parse(output.technical_params); } catch (_) { return {}; }
            }
            return {};
        })();
        const modelName = (technicalParams && technicalParams.model)
            ? String(technicalParams.model)
            : ((output.metadata && typeof output.metadata === 'object' && output.metadata.model)
                ? output.metadata.model
                : this.getFlowName(run));
        const meta = output.metadata && typeof output.metadata === 'object' ? output.metadata : {};
        const quality = technicalParams.quality || meta.quality || '';
        let creationDate = null;
        if (output.created_at) creationDate = new Date(output.created_at).toLocaleString('es-ES');
        else if (item.item && item.item.created_at) creationDate = new Date(item.item.created_at).toLocaleString('es-ES');
        
        const productionImageUrl = (data.imageUrl && typeof data.imageUrl === 'string' && (data.imageUrl.startsWith('http') || data.imageUrl.startsWith('//'))) ? data.imageUrl : '';
        const rows = [];
        if (creationDate) rows.push(`<div class="info-row"><span class="info-label">Fecha de producción</span><span class="info-value">${this.escapeHtml(creationDate)}</span></div>`);
        rows.push(`<div class="info-row"><span class="info-label">Model</span><span class="info-value">${this.escapeHtml(modelName)}</span></div>`);
        if (output.generated_copy && output.generated_copy.trim()) rows.push(`<div class="info-row info-row-copy"><span class="info-label">Copy</span><span class="info-value">${this.escapeHtml(output.generated_copy.trim())}</span></div>`);
        if (output.generated_hashtags && (Array.isArray(output.generated_hashtags) ? output.generated_hashtags.length : typeof output.generated_hashtags === 'object')) {
            const tags = Array.isArray(output.generated_hashtags) ? output.generated_hashtags : (output.generated_hashtags.tags || output.generated_hashtags.values || []);
            if (tags.length) rows.push(`<div class="info-row"><span class="info-label">Hashtags</span><span class="info-value">${this.escapeHtml(tags.join(' '))}</span></div>`);
        }
        if (output.creative_rationale && output.creative_rationale.trim()) rows.push(`<div class="info-row"><span class="info-label">creative_rationale</span><span class="info-value">${this.escapeHtml(output.creative_rationale.trim())}</span></div>`);
        if (output.text_content && output.text_content.trim()) rows.push(`<div class="info-row"><span class="info-label">text_content</span><span class="info-value">${this.escapeHtml(output.text_content.trim())}</span></div>`);
        rows.push(`<div class="info-row info-row-images"><span class="info-label">${isVideo ? 'Video' : 'Imagen'}</span>${isVideo ? (productionImageUrl ? `<span class="info-value">Vídeo</span>` : '<span class="info-value">—</span>') : (productionImageUrl ? `<img class="info-thumb info-thumb-production" src="${this.escapeHtml(productionImageUrl)}" alt="Producción" loading="lazy" />` : '<span class="info-value">—</span>')}</div>`);
        if (quality) rows.push(`<div class="info-row"><span class="info-label">Quality</span><span class="info-value">${this.escapeHtml(String(quality))}</span></div>`);
        metadataEl.innerHTML = rows.join('');
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        const portal = document.getElementById('modals-portal');
        if (portal) portal.setAttribute('aria-hidden', 'false');
        setTimeout(() => {
            const btn = document.getElementById('livingViewerClose');
            if (btn && typeof btn.focus === 'function') btn.focus();
        }, 0);

        const closeModal = () => {
            const v = document.getElementById('livingViewerVideo');
            if (v) {
                v.pause();
                v.removeAttribute('src');
                v.load();
                v.style.display = 'none';
            }
            const img = document.getElementById('livingViewerImage');
            if (img) img.style.display = '';
            const wrap = document.querySelector('.living-viewer-visual');
            if (wrap) wrap.classList.remove('living-viewer-visual--video');
            modal.classList.remove('active');
            document.body.style.overflow = '';
            if (portal) portal.setAttribute('aria-hidden', 'true');
        };
        
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        const newBackdrop = backdrop.cloneNode(true);
        backdrop.parentNode.replaceChild(newBackdrop, backdrop);
        
        document.getElementById('livingViewerClose').addEventListener('click', closeModal);
        document.getElementById('livingViewerBackdrop').addEventListener('click', closeModal);
        
        const finalCopyBtn = document.getElementById('livingViewerCopyPrompt');
        if (finalCopyBtn && promptText) {
            finalCopyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(promptText).then(() => {
                        if (typeof window.showToast === 'function') window.showToast('Prompt copiado');
                    }).catch(() => {});
                }
            });
        }

        // Limpieza defensiva: eliminar cualquier botón legacy "Ver todo" si quedó en caché del DOM
        modal.querySelectorAll('.living-viewer-see-all').forEach((el) => el.remove());

        if (correctionSection && correctionInput && correctionBtn && correctionStatus) {
            correctionInput.value = '';
            correctionStatus.textContent = '';
            const showCorrection = !isVideo;
            correctionSection.style.display = showCorrection ? '' : 'none';

            const newCorrectionBtn = correctionBtn.cloneNode(true);
            correctionBtn.parentNode.replaceChild(newCorrectionBtn, correctionBtn);
            const activeCorrectionBtn = document.getElementById('livingViewerCorrectionBtn');
            if (activeCorrectionBtn && showCorrection) {
                activeCorrectionBtn.addEventListener('click', async () => {
                    const correctionText = (correctionInput.value || '').trim();
                    if (!correctionText) {
                        correctionStatus.textContent = 'Escribe qué quieres corregir.';
                        return;
                    }
                    activeCorrectionBtn.disabled = true;
                    correctionInput.disabled = true;
                    correctionStatus.textContent = 'Regenerando imagen…';
                    try {
                        const result = await this.regenerateProductionImage({
                            sourceImageUrl: mediaUrl,
                            prompt: promptText,
                            correction: correctionText,
                            output,
                            run,
                            onStatus: (msg) => { correctionStatus.textContent = msg; }
                        });
                        if (result?.image_url) {
                            image.src = result.image_url;
                            image.alt = result.prompt || promptText || 'Producción regenerada';
                            if (result.prompt) {
                                promptEl.textContent = result.prompt;
                            }
                            correctionStatus.textContent = 'Imagen regenerada correctamente.';
                            if (typeof window.showToast === 'function') window.showToast('Producción regenerada');
                        } else {
                            correctionStatus.textContent = 'No se pudo regenerar la imagen.';
                        }
                    } catch (err) {
                        correctionStatus.textContent = `Error: ${err?.message || 'No se pudo regenerar'}`;
                    } finally {
                        activeCorrectionBtn.disabled = false;
                        correctionInput.disabled = false;
                    }
                });
            }
        }
        
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    async saveSystemAIOutput(record) {
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase)) return null;
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user?.id) return null;
            if (!this.brandContainerId && this.projectData?.id) this.brandContainerId = this.projectData.id;
            if (!this.brandContainerId) return null;
            const row = {
                brand_container_id: this.brandContainerId,
                user_id: user.id,
                ...record,
                updated_at: new Date().toISOString()
            };
            const { data, error } = await this.supabase.from('system_ai_outputs').insert(row).select('id').single();
            if (error) return null;
            return data?.id || null;
        } catch (_) {
            return null;
        }
    }

    async updateSystemAIOutput(id, updates) {
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !id) return;
        try {
            await this.supabase.from('system_ai_outputs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
        } catch (e) {
            console.warn('LivingManager updateSystemAIOutput:', e);
        }
    }

    /** Mismo intervalo y máximo que VideoView (KIE). */
    static get _NANO_POLL_INTERVAL_MS() { return 3000; }
    static get _NANO_POLL_MAX_MS() { return 12 * 60 * 1000; }

    async _pollKieNanoBananaTask(taskId) {
        const statusUrl = `/.netlify/functions/kling-video-status?taskId=${encodeURIComponent(taskId)}`;
        const started = Date.now();
        while (Date.now() - started < LivingManager._NANO_POLL_MAX_MS) {
            const res = await fetch(statusUrl);
            let data = {};
            try {
                data = await res.json();
            } catch (_) {
                throw new Error('Respuesta no válida al consultar el estado de la tarea');
            }
            if (!res.ok) {
                throw new Error(data?.error || 'Error al consultar el estado');
            }
            const state = data?.data?.state;
            if (state === 'success') {
                let resultJson = data?.data?.resultJson;
                if (typeof resultJson === 'string') {
                    try { resultJson = JSON.parse(resultJson); } catch (_) { resultJson = {}; }
                }
                const urls = resultJson?.resultUrls;
                const kieUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
                if (!kieUrl) throw new Error('No se encontró URL de imagen en la respuesta');
                return { kieUrl, resultUrls: urls };
            }
            if (state === 'fail' || state === 'failed') {
                const rawMsg = data?.data?.failMsg || data?.data?.failCode || 'La generación falló';
                throw new Error(rawMsg);
            }
            await new Promise((r) => setTimeout(r, LivingManager._NANO_POLL_INTERVAL_MS));
        }
        throw new Error('La generación superó el tiempo máximo de espera (12 min). Reintenta con un prompt más corto.');
    }

    /**
     * Descarga binario vía proxy Netlify; si falla (p. ej. 502), intenta fetch directo en el navegador si el origen envía CORS.
     */
    async _fetchKieAssetBlob(kieUrl) {
        const proxyUrl = `/.netlify/functions/kie-video-download?videoUrl=${encodeURIComponent(kieUrl)}`;
        let lastStatus = 0;
        let proxyErrMsg = '';
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
            const res = await fetch(proxyUrl);
            lastStatus = res.status;
            if (res.ok) {
                const blob = await res.blob();
                return { blob, contentType: res.headers.get('content-type') };
            }
            try {
                const j = await res.json();
                proxyErrMsg = j.error || j.message || '';
            } catch (_) {}
        }
        try {
            const direct = await fetch(kieUrl, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
            lastStatus = direct.status;
            if (direct.ok) {
                const blob = await direct.blob();
                return { blob, contentType: direct.headers.get('content-type') };
            }
        } catch (e) {
            console.warn('LivingManager: descarga directa no disponible (CORS o red):', e?.message || e);
        }
        throw new Error(proxyErrMsg || `Descarga fallida (${lastStatus}). Reintenta en unos segundos.`);
    }

    async _downloadAndUploadKieNanoImage(kieImageUrl, taskId) {
        if (!this.supabase?.storage) return null;
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user?.id) return null;
        const bucket = 'production-outputs';
        const extGuess = (kieImageUrl.split('.').pop() || 'png').split('?')[0].toLowerCase() || 'png';
        const ext = ['png', 'jpg', 'jpeg', 'webp'].includes(extGuess) ? (extGuess === 'jpeg' ? 'jpg' : extGuess) : 'png';
        const safeTaskId = (taskId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || String(Date.now());
        const storagePath = `kie-nano-banana/${user.id}/${safeTaskId}.${ext}`;
        const { blob, contentType } = await this._fetchKieAssetBlob(kieImageUrl);
        const ct = contentType || (ext === 'png' ? 'image/png' : 'image/jpeg');
        const { error } = await this.supabase.storage.from(bucket).upload(storagePath, blob, {
            contentType: ct,
            upsert: true
        });
        if (error) throw error;
        const { data: urlData } = this.supabase.storage.from(bucket).getPublicUrl(storagePath);
        return { publicUrl: urlData?.publicUrl || null, storagePath };
    }

    async regenerateProductionImage({ sourceImageUrl, prompt, correction, output, run, onStatus }) {
        const setStatus = typeof onStatus === 'function' ? onStatus : () => {};
        const flowName = this.getFlowName(run);
        const technicalParams = output?.technical_params && typeof output.technical_params === 'object' ? output.technical_params : {};
        const metadata = output?.metadata && typeof output.metadata === 'object' ? output.metadata : {};

        setStatus('Creando tarea de generación…');
        const createRes = await fetch('/.netlify/functions/kie-nano-banana-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: sourceImageUrl,
                prompt: prompt || '',
                correction: correction || '',
                flow_name: flowName,
                technical_params: technicalParams,
                metadata
            })
        });
        let createData = {};
        try {
            createData = await createRes.json();
        } catch (_) {
            throw new Error('El servidor respondió con un formato inválido. ¿Está desplegada kie-nano-banana-create?');
        }
        if (!createRes.ok) {
            const serverMsg = (createData.kieBody && (createData.kieBody.msg || createData.kieBody.message)) || createData.error || createData.failMsg || 'Error al crear la tarea';
            throw new Error(serverMsg);
        }
        const taskId = createData.taskId;
        const refinedPrompt = createData.prompt || '';
        if (!taskId) {
            throw new Error('No se recibió taskId del servidor');
        }

        let outputId = await this.saveSystemAIOutput({
            provider: 'kie_api',
            output_type: 'image',
            status: 'processing',
            external_job_id: taskId,
            prompt_used: refinedPrompt || prompt || '',
            text_content: correction,
            metadata: {
                source: 'kie-nano-banana-pro',
                flow_name: flowName,
                regenerated_from: sourceImageUrl,
                refined_prompt: refinedPrompt,
                technical_params: technicalParams,
                model: createData.model || 'nano-banana-pro'
            }
        });

        try {
            setStatus('Generando imagen (Nano Banana Pro). Esto puede tardar unos minutos…');
            const { kieUrl, resultUrls } = await this._pollKieNanoBananaTask(taskId);

            setStatus('Descargando y guardando en tu cuenta…');
            const uploaded = await this._downloadAndUploadKieNanoImage(kieUrl, taskId);
            if (!uploaded?.publicUrl) {
                throw new Error('No se pudo guardar la imagen en tu cuenta');
            }

            if (outputId) {
                await this.updateSystemAIOutput(outputId, {
                    status: 'completed',
                    storage_path: uploaded.storagePath,
                    metadata: {
                        source: 'kie-nano-banana-pro',
                        flow_name: flowName,
                        regenerated_from: sourceImageUrl,
                        refined_prompt: refinedPrompt,
                        resultUrls,
                        image_url: uploaded.publicUrl,
                        kie_source_url: kieUrl,
                        technical_params: technicalParams,
                        model: createData.model || 'nano-banana-pro'
                    },
                    error_message: null
                });
            }

            this.systemAiOutputs.unshift({
                id: outputId || `local-${Date.now()}`,
                output_type: 'image',
                prompt_used: refinedPrompt || prompt || '',
                text_content: correction,
                metadata: {
                    source: 'kie-nano-banana-pro',
                    flow_name: flowName,
                    regenerated_from: sourceImageUrl,
                    refined_prompt: refinedPrompt,
                    result_url: uploaded.publicUrl,
                    technical_params: technicalParams
                },
                created_at: new Date().toISOString(),
                storage_path: uploaded.storagePath,
                storage_object_id: null,
                file_url: uploaded.publicUrl
            });

            return {
                image_url: uploaded.publicUrl,
                prompt: refinedPrompt,
                task_id: taskId,
                storage_path: uploaded.storagePath
            };
        } catch (err) {
            if (outputId) {
                await this.updateSystemAIOutput(outputId, {
                    status: 'failed',
                    error_message: err?.message || 'Error en regeneración'
                });
            }
            throw err;
        }
    }
    
    /**
     * Elimina el output mostrado en el modal: borra en BD, actualiza listas y cierra el modal.
     * @param {Object} data - Objeto con item.output o item.item (runs_outputs)
     * @param {Function} closeModal - Función para cerrar el modal
     */
    async handleViewerDeleteOutput(data, closeModal) {
        const itemBlock = data?.item || {};
        const outputId = itemBlock.output?.id ?? itemBlock.item?.id;
        if (!outputId) {
            if (typeof window.showToast === 'function') window.showToast('No se puede eliminar este output');
            return;
        }
        if (!confirm('¿Eliminar este output por completo? Esta acción no se puede deshacer.')) {
            return;
        }
        try {
            if (this.supabase && this.isValidSupabaseClient(this.supabase)) {
                const { error } = await this.supabase.from('runs_outputs').delete().eq('id', outputId);
                if (error) throw error;
            }
            this.flowOutputs = (this.flowOutputs || []).filter(o => o.id !== outputId);
            this.latestGeneratedContent = (this.latestGeneratedContent || []).filter(o => o.id !== outputId);
            this.systemAiOutputs = (this.systemAiOutputs || []).filter(o => o.id !== outputId);
            closeModal();
            await this.renderHistorySection();
            const heroGrid = document.getElementById('livingHeroGrid');
            if (heroGrid) await this.renderHeroSection();
            if (typeof window.showToast === 'function') window.showToast('Output eliminado');
        } catch (err) {
            console.error('❌ Error al eliminar output:', err);
            if (typeof window.showToast === 'function') window.showToast('Error al eliminar: ' + (err?.message || 'Error desconocido'));
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
        // Los event listeners para las cards se configuran en setupDownloadButtons()
        // después de que se renderizan las cards
    }

    /**
     * Resuelve la URL pública de un output (imagen o video).
     * Prueba storage_path en 'production-outputs' y 'outputs', y metadata (video_url, url, file_url, etc.).
     */
    resolveOutputMediaUrl(output) {
        if (!output) return null;
        let url = output.file_url || output.image_url || output.url || output.storage_url || null;
        const rawPath = output.storage_path && typeof output.storage_path === 'string' ? output.storage_path.trim() : '';
        if (!url && rawPath) {
            if (rawPath.startsWith('http')) url = rawPath;
            else url = this.getPublicUrlFromStorage('production-outputs', rawPath) || this.getPublicUrlFromStorage('outputs', rawPath);
        }
        if (!url && output.metadata) {
            const meta = typeof output.metadata === 'string' ? (() => { try { return JSON.parse(output.metadata); } catch (_) { return {}; } })() : output.metadata;
            url = meta.video_url || meta.url || meta.file_url || meta.videoUrl || meta.output_url || meta.publicUrl || meta.src || null;
        }
        return url && (url.startsWith('http') || url.startsWith('//')) ? url : null;
    }

    getPublicUrlFromStorage(bucketName, filePath) {
        // Validar parámetros antes de hacer la llamada
        if (!this.supabase || !bucketName || !filePath) {
            return null;
        }

        // Validar que el cliente tenga storage
        if (!this.supabase.storage || typeof this.supabase.storage.from !== 'function') {
            console.warn('⚠️ Cliente de Supabase no tiene storage disponible');
            return null;
        }

        // Validar que filePath sea un string válido
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            console.warn('⚠️ filePath no es válido:', filePath);
            return null;
        }

        try {
            // Limpiar el path si viene con el nombre del bucket
            let cleanPath = filePath.trim();
            if (cleanPath.startsWith(`${bucketName}/`)) {
                cleanPath = cleanPath.replace(`${bucketName}/`, '');
            } else if (cleanPath.startsWith('/')) {
                cleanPath = cleanPath.substring(1);
            }

            // Validar que el path limpio no esté vacío
            if (!cleanPath || cleanPath.trim() === '') {
                console.warn('⚠️ Path limpio está vacío después de procesar:', filePath);
                return null;
            }

            // Obtener URL pública desde Supabase Storage
            // getPublicUrl retorna directamente { data: { publicUrl: string } }
            const result = this.supabase.storage
                .from(bucketName)
                .getPublicUrl(cleanPath);

            // Validar que el resultado tenga la estructura esperada
            if (result && result.data && result.data.publicUrl) {
                return result.data.publicUrl;
            }

            // Fallback: intentar acceder directamente a publicUrl si la estructura es diferente
            if (result && result.publicUrl) {
                return result.publicUrl;
            }

            console.warn('⚠️ getPublicUrl no retornó una URL válida:', result);
            return null;
        } catch (error) {
            // Si es un error 400, loguear más información
            if (error.status === 400 || error.code === '400') {
                console.warn('⚠️ Error 400 obteniendo URL pública de storage:', error.message);
                console.warn('⚠️ Parámetros:', { bucketName, filePath });
            } else {
            console.warn('⚠️ Error obteniendo URL pública de storage:', error);
            }
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

    destroy() {
        if (this._docClickCloseDropdown) {
            document.removeEventListener('click', this._docClickCloseDropdown);
            this._docClickCloseDropdown = null;
        }
        if (this._onHistoryScroll) {
            window.removeEventListener('scroll', this._onHistoryScroll);
            this._onHistoryScroll = null;
        }
        this.supabase = null;
        this.userId = null;
        this.userData = null;
        this.projectData = null;
        this.products = [];
        this.flowRuns = [];
        this.flowOutputs = [];
        this.latestGeneratedContent = [];
        this.systemAiOutputs = [];
        this.initialized = false;
        this.eventListenersSetup = false;
        this._historyFiltersSetup = false;
        this._historyScrollBound = false;
        this._historyLoadingMore = false;
        this._historySourcesLoading = false;
        this._historyVisibleCount = 0;
        this._historyCurrentItems = [];
    }
}

// Hacer disponible globalmente para que pueda ser usado por ProductionView
if (typeof window !== 'undefined') {
    window.LivingManager = LivingManager;
}

// NO inicializar automáticamente - ProductionView se encargará de crear la instancia cuando sea necesario
// Esto evita conflictos cuando se navega entre rutas
