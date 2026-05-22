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
        this.flowInputs = []; // runs_inputs (snapshot del payload por run)
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

        // Estado UI de la grilla: Set de output_ids con like del usuario actual
        // y Set de output_ids seleccionados para bulk-actions.
        this.likedOutputs = new Set();
        this.selectedOutputs = new Set();
        
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
            const fetcher = async () => {
                const { data, error } = await this.supabase
                    .from('profiles').select('*').eq('id', this.userId).maybeSingle();
                if (error) throw error;
                return data;
            };
            this.userData = window.apiClient
                ? await window.apiClient.query(`living:user:${this.userId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
                : await fetcher();
        } catch (error) {
            console.error('❌ Error cargando datos de usuario:', error);
            this.userData = null;
        }
    }

    async loadProjectData() {
        if (!this.supabase || !this.userId) { this.projectData = null; return; }
        try {
            const fetcher = async () => {
                const { data, error } = await this.supabase
                    .from('brand_containers').select('*')
                    .eq('user_id', this.userId)
                    .order('created_at', { ascending: false })
                    .limit(1).maybeSingle();
                if (error) throw error;
                return data;
            };
            this.projectData = window.apiClient
                ? await window.apiClient.query(`living:project:${this.userId}`, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
                : await fetcher();
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
                .select('*, content_flows(name), campaigns(nombre_campana), audience_personas(name)')
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
        // Paralelo: hidratar runs_inputs para los mismos run_ids (tab Input del modal).
        this.loadFlowInputs({ reset, runIds }).catch(() => {});
    }

    /**
     * Carga las filas de runs_inputs para los runs visibles. Alimenta el tab
     * Input del modal: snapshot del payload del usuario (entidad, referencias,
     * briefing). Tolerante a errores: si RLS o tabla no responde, falla silencioso.
     */
    async loadFlowInputs({ reset = false, runIds = [] } = {}) {
        if (!this.supabase) {
            if (reset) this.flowInputs = [];
            return;
        }
        if (reset) this.flowInputs = [];
        try {
            const targetRunIds = (runIds && runIds.length ? runIds : (this.flowRuns || []).map(r => r?.id).filter(Boolean));
            if (!targetRunIds.length) return;
            const { data, error } = await this.supabase
                .from('runs_inputs').select('*')
                .in('run_id', targetRunIds);
            if (error) throw error;
            const newInputs = data || [];
            const existing = new Set((this.flowInputs || []).map(i => i?.id).filter(Boolean));
            this.flowInputs = [...(this.flowInputs || []), ...newInputs.filter(i => i?.id && !existing.has(i.id))];
        } catch (error) {
            // No bloqueamos el modal si falla; el tab Input mostrara estado vacio.
            console.warn('runs_inputs hydrate fallo:', error);
        }
    }

    /**
     * Hidrata el Set de outputs likeados por el usuario actual para esta org.
     * Se llama después de loadFlowOutputs para que las cards renderícen con
     * el estado correcto del corazón.
     */
    async loadLikedOutputs() {
        if (!this.supabase || !this.userId || !this.organizationId) {
            this.likedOutputs = new Set();
            return;
        }
        try {
            const { data, error } = await this.supabase
                .from('production_output_likes')
                .select('output_id')
                .eq('user_id', this.userId)
                .eq('organization_id', this.organizationId);
            if (error) throw error;
            this.likedOutputs = new Set((data || []).map(r => r.output_id));
        } catch (error) {
            console.error('❌ Error cargando likes:', error);
            this.likedOutputs = new Set();
        }
    }

    /**
     * Toggle like sobre un output. Optimistic update + reconciliación contra
     * la BD. Devuelve true si quedó likeado, false si quedó sin like.
     */
    async toggleLike(outputId) {
        if (!this.supabase || !this.userId || !this.organizationId || !outputId) return false;
        const wasLiked = this.likedOutputs.has(outputId);
        // Optimistic
        if (wasLiked) this.likedOutputs.delete(outputId);
        else this.likedOutputs.add(outputId);

        try {
            if (wasLiked) {
                const { error } = await this.supabase
                    .from('production_output_likes')
                    .delete()
                    .eq('output_id', outputId)
                    .eq('user_id', this.userId);
                if (error) throw error;
            } else {
                const { error } = await this.supabase
                    .from('production_output_likes')
                    .insert({
                        output_id: outputId,
                        user_id: this.userId,
                        organization_id: this.organizationId
                    });
                if (error) throw error;
            }
            return !wasLiked;
        } catch (error) {
            // Rollback
            if (wasLiked) this.likedOutputs.add(outputId);
            else this.likedOutputs.delete(outputId);
            console.error('❌ Error toggle like:', error);
            if (typeof window.showToast === 'function') window.showToast('No se pudo guardar el like');
            return wasLiked;
        }
    }

    /**
     * Borra un output. CASCADE en BD limpia los likes asociados. Actualiza
     * la grilla local sin volver a fetch (optimistic).
     */
    async deleteOutput(outputId) {
        if (!this.supabase || !outputId) return false;
        try {
            const { error } = await this.supabase
                .from('runs_outputs')
                .delete()
                .eq('id', outputId);
            if (error) throw error;
            this.flowOutputs = (this.flowOutputs || []).filter(o => o?.id !== outputId);
            this.latestGeneratedContent = (this.latestGeneratedContent || []).filter(o => o?.id !== outputId);
            this.systemAiOutputs = (this.systemAiOutputs || []).filter(o => o?.id !== outputId);
            this.likedOutputs.delete(outputId);
            this.selectedOutputs.delete(outputId);
            return true;
        } catch (error) {
            console.error('❌ Error eliminando output:', error);
            if (typeof window.showToast === 'function') window.showToast('No se pudo eliminar: ' + (error?.message || 'error desconocido'));
            return false;
        }
    }

    /**
     * Borra múltiples outputs en una sola operación de BD.
     */
    async bulkDeleteOutputs(outputIds) {
        if (!this.supabase || !Array.isArray(outputIds) || !outputIds.length) return 0;
        try {
            const { error } = await this.supabase
                .from('runs_outputs')
                .delete()
                .in('id', outputIds);
            if (error) throw error;
            const idSet = new Set(outputIds);
            this.flowOutputs = (this.flowOutputs || []).filter(o => !idSet.has(o?.id));
            this.latestGeneratedContent = (this.latestGeneratedContent || []).filter(o => !idSet.has(o?.id));
            this.systemAiOutputs = (this.systemAiOutputs || []).filter(o => !idSet.has(o?.id));
            outputIds.forEach(id => { this.likedOutputs.delete(id); this.selectedOutputs.delete(id); });
            return outputIds.length;
        } catch (error) {
            console.error('❌ Error bulk delete:', error);
            if (typeof window.showToast === 'function') window.showToast('No se pudieron eliminar: ' + (error?.message || 'error desconocido'));
            return 0;
        }
    }

    /**
     * Copia la URL pública de un asset al portapapeles. Para "compartir".
     */
    async copyShareUrl(url) {
        if (!url) return false;
        try {
            await navigator.clipboard.writeText(url);
            if (typeof window.showToast === 'function') window.showToast('Enlace copiado');
            return true;
        } catch (error) {
            console.error('❌ Error copiando URL:', error);
            if (typeof window.showToast === 'function') window.showToast('No se pudo copiar el enlace');
            return false;
        }
    }

    async loadCreditUsage() {
        if (!this.supabase || !this.organizationId) { this.creditUsage = []; return; }
        try {
            const fetcher = async () => {
                const { data, error } = await this.supabase
                    .from('credit_usage').select('*')
                    .eq('organization_id', this.organizationId)
                    .order('created_at', { ascending: false }).limit(100);
                if (error) throw error;
                return data || [];
            };
            this.creditUsage = window.apiClient
                ? await window.apiClient.query(`living:credit_usage:${this.organizationId}`, fetcher, { ttl: 30 * 1000, staleWhileRevalidate: true })
                : await fetcher();
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

            // Modelo nuevo (post-BUG-005): la tabla intermedia `brands` se
            // eliminó. brand_container ES la marca, así que brandId == brandContainerId.
            // Las RPCs (get_studio_activity_status, etc.) y queries que aún usan
            // `brand_id` como columna legacy reciben el container ID; si no hay
            // datos remapeados, devuelven empty (comportamiento equivalente al
            // anterior cuando brand quedaba null).
            this.brandId = this.brandContainerId;
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
                this.loadSystemAiOutputs({ reset }),
                this.loadLikedOutputs()
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
        await this.renderHistorySection();
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
                return this.renderVideoCard(thumbnailUrl, item.run, item.output, item.prompt, index);
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

        // Justified rows layout (Flickr/Google Photos/Higgsfield). El JS calcula
        // las dimensiones de cada item según su aspect ratio para que cada fila
        // tenga altura uniforme y llene el ancho exacto del container.
        const gridHtml = `<div class="living-masonry-grid living-history-masonry" role="list" aria-label="Producciones">${itemHtmls.join('')}</div>`;
        container.innerHTML = gridHtml;

        const grid = container.querySelector('.living-masonry-grid') || container;
        if (window.applyJustifiedLayout) window.applyJustifiedLayout(grid);
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
    
    /**
     * Overlay común de cards (image + video):
     *  - top-left: checkbox de selección
     *  - top-right: columna vertical con like / copy-prompt / download / kebab
     *  - kebab abre menú con Compartir, Publicar a Meta (soon), Eliminar
     * El estado del like se lee de this.likedOutputs y el de seleccionado de
     * this.selectedOutputs.
     */
    _renderCardOverlay(outputId, finalUrl, promptSafe) {
        const safeId = this.escapeHtml(outputId || '');
        const safeUrl = this.escapeHtml(finalUrl || '');
        const liked = !!(outputId && this.likedOutputs && this.likedOutputs.has(outputId));
        const selected = !!(outputId && this.selectedOutputs && this.selectedOutputs.has(outputId));
        return `
            <button type="button" class="card-select ${selected ? 'is-selected' : ''}" data-action="select" data-output-id="${safeId}" title="Seleccionar" aria-label="Seleccionar producción" aria-pressed="${selected ? 'true' : 'false'}">
                <i class="${selected ? 'fas fa-check-circle' : 'fas fa-circle'}" aria-hidden="true"></i>
            </button>
            <div class="card-overlay-actions">
                <button type="button" class="card-action card-action--like ${liked ? 'is-liked' : ''}" data-action="like" data-output-id="${safeId}" title="Me gusta" aria-label="Me gusta" aria-pressed="${liked ? 'true' : 'false'}">
                    <i class="fas fa-heart" aria-hidden="true"></i>
                </button>
                <button type="button" class="card-action" data-action="copy-prompt" data-prompt="${promptSafe}" title="Copiar prompt" aria-label="Copiar prompt">
                    <i class="fas fa-copy" aria-hidden="true"></i>
                </button>
                <button type="button" class="card-action" data-action="download" data-url="${safeUrl}" title="Descargar" aria-label="Descargar">
                    <i class="fas fa-download" aria-hidden="true"></i>
                </button>
                <div class="card-kebab-wrap">
                    <button type="button" class="card-action card-action--kebab" data-action="kebab" title="Más acciones" aria-label="Más acciones" aria-expanded="false">
                        <i class="fas fa-bars" aria-hidden="true"></i>
                    </button>
                    <div class="card-kebab-menu" role="menu" hidden>
                        <button type="button" role="menuitem" data-action="share" data-url="${safeUrl}">
                            <i class="fas fa-link" aria-hidden="true"></i>
                            <span>Compartir enlace</span>
                        </button>
                        <button type="button" role="menuitem" data-action="publish-meta" disabled aria-disabled="true" title="Próximamente">
                            <i class="fas fa-upload" aria-hidden="true"></i>
                            <span>Publicar a Meta</span>
                            <em class="card-kebab-menu-soon">Próximamente</em>
                        </button>
                        <button type="button" role="menuitem" class="card-kebab-menu-danger" data-action="delete" data-output-id="${safeId}">
                            <i class="fas fa-trash" aria-hidden="true"></i>
                            <span>Eliminar producción</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
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

        const eager = (typeof index === 'number' && index < 4);
        const loadingAttr = eager ? 'eager' : 'lazy';
        const fetchAttr = eager ? 'high' : 'auto';
        const isVideoUrl = finalUrl && /\.(mp4|webm|mov)(\?|$)/i.test(finalUrl);
        // preload="none": el grid no descarga video hasta que el usuario haga hover/abra el modal.
        // El layout JS espera loadedmetadata para conocer dimensiones, asi que damos una clase data-needs-meta
        // que se hidrata bajo demanda en setupHistoryCardListeners (hover) o en applyJustifiedLayout (ya en viewport).
        const thumbnailHtml = finalUrl
            ? (isVideoUrl
                ? `<video class="history-video-card-thumbnail" data-src="${this.escapeHtml(finalUrl)}" muted playsinline preload="none" crossorigin="anonymous" aria-label="Vista previa de video" onerror="var w=this.closest('.history-video-card-thumbnail-wrap'); if(w){ var d=document.createElement('div'); d.className='history-video-card-thumbnail'; d.style.cssText='background:#0F1115;display:flex;align-items:center;justify-content:center'; d.innerHTML='<i class=\\'fas fa-video\\' style=\\'font-size:2rem;color:var(--living-text-muted)\\'>\\x3c/i>'; w.innerHTML=''; w.appendChild(d); }"></video>`
                : `<img src="${this.escapeHtml(finalUrl)}" alt="Vista previa de video" class="history-video-card-thumbnail" loading="${loadingAttr}" decoding="async" fetchpriority="${fetchAttr}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'history-video-card-thumbnail\\' style=\\'background: #0F1115; display: flex; align-items: center; justify-content: center;\\'><i class=\\'fas fa-video\\' style=\\'font-size: 2rem; color: var(--living-text-muted);\\'></i></div>';" />`)
            : `<div class="history-video-card-thumbnail history-video-card-thumbnail--empty" aria-hidden="true">
                <i class="fas fa-video"></i>
            </div>`;
        return `
            <article class="living-masonry-item history-video-card" role="listitem" data-production-id="${productionId}" data-output-id="${this.escapeHtml(output?.id || '')}" data-run-id="${run?.id || ''}" data-card-info="${this.escapeHtml(cardData)}" aria-label="${this.escapeHtml(flowName || 'Produccion de video')}">
                <figure class="history-video-card-thumbnail-wrap">${thumbnailHtml}</figure>
                ${this._renderCardOverlay(output?.id, finalUrl, this.escapeHtml(promptSafe))}
                <figcaption class="history-card-flow-name">${this.escapeHtml(flowName)}</figcaption>
            </article>
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

        const eager = (typeof index === 'number' && index < 4);
        const loadingAttr = eager ? 'eager' : 'lazy';
        const fetchAttr = eager ? 'high' : 'auto';

        return `
            <article class="living-masonry-item history-image-card" role="listitem" data-production-id="${productionId}" data-output-id="${this.escapeHtml(output?.id || '')}" data-run-id="${run?.id || ''}" data-card-info="${this.escapeHtml(cardData)}" aria-label="${this.escapeHtml(flowName || 'Produccion de imagen')}">
                <figure class="history-image-card-media">
                    ${finalUrl
                        ? `<img src="${this.escapeHtml(finalUrl)}" alt="${this.escapeHtml(flowName || 'Produccion')}" loading="${loadingAttr}" decoding="async" fetchpriority="${fetchAttr}" onerror="this.closest('figure').innerHTML='<div class=\\'history-image-card-fallback\\'><i class=\\'fas fa-image\\'></i></div>';" />`
                        : `<div class="history-image-card-fallback" aria-hidden="true"><i class="fas fa-image"></i></div>`
                    }
                </figure>
                ${this._renderCardOverlay(output?.id, finalUrl, this.escapeHtml(promptSafe))}
                <figcaption class="history-card-flow-name">${this.escapeHtml(flowName)}</figcaption>
            </article>
        `;
    }

    renderTextCard(run, output, index) {
        const productionId = run?.id || output?.id;
        return `
            <article class="living-masonry-item history-text-card" role="listitem" data-production-id="${productionId}" data-run-id="${run?.id || ''}" aria-label="Produccion de texto">
                <div class="history-text-card-icon" aria-hidden="true">?</div>
                <p class="history-text-card-title">Produccion de texto</p>
            </article>
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
        const TOTAL = 20;
        const items = [];
        for (let i = 0; i < TOTAL; i++) {
            items.push(
                `<div class="living-masonry-item"><div class="living-history-skeleton"></div></div>`
            );
        }
        return `<div class="living-masonry-grid living-history-masonry">${items.join('')}</div>`;
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

        // Hover de video (preview en mute). preload="none" + data-src: solo descargamos
        // cuando el usuario hace hover por primera vez. Asi el grid no descarga decenas
        // de videos solo por scrollear.
        container.querySelectorAll(selector).forEach(card => {
            if (!card.classList.contains('history-video-card')) return;
            const wrap = card.querySelector('.history-video-card-thumbnail-wrap');
            const hydrate = (video) => {
                if (!video || video.src) return;
                const ds = video.getAttribute('data-src');
                if (ds) { video.src = ds; video.removeAttribute('data-src'); }
            };
            card.addEventListener('mouseenter', () => {
                const video = wrap && wrap.querySelector('video');
                if (!video) return;
                hydrate(video);
                video.muted = true;
                video.play().catch(() => {});
            });
            card.addEventListener('mouseleave', () => {
                const video = wrap && wrap.querySelector('video');
                if (video) { video.pause(); video.currentTime = 0; }
            });
        });

        // Event delegation: una sola handler sobre el container que despacha
        // por data-action. Idempotente — solo se monta una vez por container.
        if (!container._cardDelegationBound) {
            container._cardDelegationBound = true;
            container.addEventListener('click', (e) => this._handleCardClick(e, container, selector));
        }
    }

    /**
     * Despacha clicks dentro del container de history. Si el target es un
     * elemento con data-action, ejecuta esa acción. Si no, abre la preview
     * (stub mientras construimos la nueva ventana).
     */
    async _handleCardClick(e, container, selector) {
        const actionEl = e.target.closest('[data-action]');
        if (actionEl && container.contains(actionEl)) {
            e.stopPropagation();
            e.preventDefault();
            const action = actionEl.dataset.action;
            const card = actionEl.closest(selector);
            const outputId = actionEl.dataset.outputId || card?.dataset.outputId || '';

            switch (action) {
                case 'like': {
                    const nowLiked = await this.toggleLike(outputId);
                    actionEl.classList.toggle('is-liked', nowLiked);
                    actionEl.setAttribute('aria-pressed', nowLiked ? 'true' : 'false');
                    // Subset solo trae fas; el estado liked se diferencia por color
                    // vía la clase .is-liked (no por cambiar fas↔far).
                    break;
                }
                case 'select': {
                    const selected = this.selectedOutputs.has(outputId);
                    if (selected) this.selectedOutputs.delete(outputId);
                    else if (outputId) this.selectedOutputs.add(outputId);
                    actionEl.classList.toggle('is-selected', !selected);
                    actionEl.setAttribute('aria-pressed', selected ? 'false' : 'true');
                    const icon = actionEl.querySelector('i');
                    if (icon) {
                        icon.className = (!selected ? 'fas fa-check-circle' : 'fas fa-circle');
                    }
                    if (card) card.classList.toggle('is-selected', !selected);
                    this._updateSelectionBar();
                    break;
                }
                case 'copy-prompt': {
                    const raw = (actionEl.dataset.prompt || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                    if (raw && navigator.clipboard?.writeText) {
                        try {
                            await navigator.clipboard.writeText(raw);
                            if (typeof window.showToast === 'function') window.showToast('Prompt copiado');
                        } catch (_) {}
                    }
                    break;
                }
                case 'download': {
                    if (actionEl.dataset.url) this.downloadImage(actionEl.dataset.url);
                    break;
                }
                case 'kebab': {
                    const wrap = actionEl.closest('.card-kebab-wrap');
                    const menu = wrap?.querySelector('.card-kebab-menu');
                    if (!menu) break;
                    // Cierra otros menús abiertos.
                    container.querySelectorAll('.card-kebab-menu:not([hidden])').forEach(m => {
                        if (m !== menu) {
                            m.hidden = true;
                            m.previousElementSibling?.setAttribute('aria-expanded', 'false');
                        }
                    });
                    const willOpen = menu.hidden;
                    menu.hidden = !willOpen;
                    actionEl.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
                    break;
                }
                case 'share': {
                    await this.copyShareUrl(actionEl.dataset.url);
                    this._closeAllKebabs(container);
                    break;
                }
                case 'publish-meta': {
                    if (typeof window.showToast === 'function') window.showToast('Publicar a Meta llega pronto');
                    this._closeAllKebabs(container);
                    break;
                }
                case 'delete': {
                    if (!confirm('¿Eliminar esta producción? No se puede deshacer.')) break;
                    const ok = await this.deleteOutput(outputId);
                    if (ok) {
                        const item = card?.closest('.living-masonry-item') || card;
                        item?.remove();
                        this._updateSelectionBar();
                        if (typeof window.showToast === 'function') window.showToast('Producción eliminada');
                    }
                    this._closeAllKebabs(container);
                    break;
                }
            }
            return;
        }

        // Click sobre la card (fuera de los botones) → abrir preview.
        const card = e.target.closest(selector);
        if (!card || !container.contains(card)) return;
        const cardData = card.dataset.cardInfo;
        if (cardData) {
            try {
                const unescaped = cardData
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>');
                const data = JSON.parse(unescaped);
                this.openProductionModal(data);
            } catch (error) {
                console.error('❌ Error parsing card data:', error);
            }
        } else if (card.dataset.productionId || card.dataset.runId) {
            if (window.router) window.router.navigate('/products');
        }
    }

    _closeAllKebabs(container) {
        container.querySelectorAll('.card-kebab-menu:not([hidden])').forEach(m => {
            m.hidden = true;
            m.previousElementSibling?.setAttribute('aria-expanded', 'false');
        });
    }

    /**
     * Renderiza (o actualiza) la barra fija inferior con contador + bulk-delete.
     * Inyectada bajo demanda en <body>; oculta cuando no hay selección.
     */
    _updateSelectionBar() {
        let bar = document.getElementById('productionSelectionBar');
        const count = this.selectedOutputs.size;
        if (!bar) {
            if (count === 0) return;
            bar = document.createElement('div');
            bar.id = 'productionSelectionBar';
            bar.className = 'production-selection-bar';
            bar.innerHTML = `
                <span class="production-selection-bar-count"></span>
                <div class="production-selection-bar-actions">
                    <button type="button" class="btn btn-secondary production-selection-bar-clear" data-action="clear-selection">
                        <i class="fas fa-times"></i> Limpiar
                    </button>
                    <button type="button" class="btn btn-danger production-selection-bar-delete" data-action="bulk-delete">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>
                </div>
            `;
            document.body.appendChild(bar);
            bar.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                if (btn.dataset.action === 'clear-selection') {
                    this._clearSelection();
                } else if (btn.dataset.action === 'bulk-delete') {
                    const ids = Array.from(this.selectedOutputs);
                    if (!ids.length) return;
                    if (!confirm(`¿Eliminar ${ids.length} producción${ids.length === 1 ? '' : 'es'}? No se puede deshacer.`)) return;
                    const n = await this.bulkDeleteOutputs(ids);
                    if (n > 0) {
                        ids.forEach(id => {
                            document.querySelectorAll(`[data-output-id="${CSS.escape(id)}"]`).forEach(el => {
                                const item = el.closest('.living-masonry-item') || el.closest('.history-image-card, .history-video-card');
                                item?.remove();
                            });
                        });
                        this._updateSelectionBar();
                        if (typeof window.showToast === 'function') window.showToast(`${n} producción${n === 1 ? '' : 'es'} eliminada${n === 1 ? '' : 's'}`);
                    }
                }
            });
        }
        const countEl = bar.querySelector('.production-selection-bar-count');
        if (countEl) countEl.textContent = `${count} producción${count === 1 ? '' : 'es'} seleccionada${count === 1 ? '' : 's'}`;
        bar.classList.toggle('is-visible', count > 0);
    }

    _clearSelection() {
        this.selectedOutputs.clear();
        document.querySelectorAll('.card-select.is-selected').forEach(btn => {
            btn.classList.remove('is-selected');
            btn.setAttribute('aria-pressed', 'false');
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-circle';
        });
        document.querySelectorAll('.history-image-card.is-selected, .history-video-card.is-selected').forEach(c => c.classList.remove('is-selected'));
        this._updateSelectionBar();
    }

    // ============================================
    // MODAL DE PREVISUALIZACIÓN
    // ============================================

    /**
     * Abre el modal de previsualización para un output. data viene de las
     * cards: { imageUrl, prompt, item: { output, run } }. El modal renderiza
     * imagen/video, siblings, prompt, info técnica, autor, y conecta acciones.
     */
    async openProductionModal(data) {
        const modal = document.getElementById('productionModal');
        if (!modal) return;
        const item = data?.item || {};
        const output = item.output || {};
        const run = item.run || {};
        const outputId = output?.id || '';

        // Resolver media URL (imagen/video).
        let mediaUrl = data?.imageUrl && /^(https?:|\/\/)/i.test(data.imageUrl) ? data.imageUrl : '';
        if (!mediaUrl) mediaUrl = this.resolveOutputMediaUrl(output) || '';
        if (!mediaUrl && output?.storage_path) {
            mediaUrl = this.getPublicUrlFromStorage('production-outputs', output.storage_path)
                || this.getPublicUrlFromStorage('outputs', output.storage_path) || '';
        }
        const outputType = String(output?.output_type || '').toLowerCase();
        const isVideo = (mediaUrl && /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl))
            || /video|reel|clip/.test(outputType);

        // Pintar visual. Lazy: solo asignamos src al video DESPUES de que el modal sea
        // visible, no antes. Asi un click rapido no dispara descarga si el usuario cierra.
        const imgEl = document.getElementById('pmodalImage');
        const videoEl = document.getElementById('pmodalVideo');
        if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); }
        if (isVideo && mediaUrl) {
            imgEl.hidden = true; imgEl.removeAttribute('src');
            videoEl.hidden = false;
            videoEl.preload = 'metadata';
            // Defer la asignacion hasta el siguiente frame (despues de que clase .is-open haya pintado).
            requestAnimationFrame(() => {
                if (!this._modalState || this._modalState.outputId !== outputId) return;
                videoEl.src = mediaUrl;
                videoEl.load();
                videoEl.play().catch(() => {});
            });
        } else {
            videoEl.hidden = true;
            imgEl.hidden = !mediaUrl;
            if (mediaUrl) {
                imgEl.decoding = 'async';
                imgEl.setAttribute('fetchpriority', 'high');
                imgEl.src = mediaUrl;
            } else {
                imgEl.removeAttribute('src');
            }
            imgEl.alt = (typeof data?.prompt === 'string' ? data.prompt : 'Produccion');
        }

        // Prompt → bloques labeled. La fuente primaria es output.generated_copy
        // (estructurado) o el prompt que pasó la card. El disclosure técnico
        // se llena con metadata.prompt_used si existe.
        this._renderModalPrompt(data?.prompt || output?.generated_copy || output?.prompt_used || '', output, run);

        // Information rows.
        this._renderModalInfo(output, run);

        // Siblings.
        this._renderModalSiblings(run?.id, outputId);

        // Input pane (lo que se uso para generar).
        this._renderModalInput(run, output);

        // Reset a tab Output cada vez que se abre.
        this._switchModalTab('output');

        // Estado del like sincronizado con likedOutputs.
        const likeBtn = modal.querySelector('[data-action="like"]');
        if (likeBtn) {
            const liked = this.likedOutputs.has(outputId);
            likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
            const ic = likeBtn.querySelector('i');
            if (ic) ic.className = 'fas fa-heart';
            likeBtn.classList.toggle('is-liked', liked);
        }

        // Estado interno + abrir.
        this._modalState = { outputId, mediaUrl, prompt: (data?.prompt || ''), runId: run?.id };
        this._bindModalListenersOnce(modal);
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('production-modal-open');
        document.getElementById('pmodalScroll')?.scrollTo(0, 0);
    }

    closeProductionModal() {
        const modal = document.getElementById('productionModal');
        if (!modal) return;
        const videoEl = document.getElementById('pmodalVideo');
        if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); }
        const imgEl = document.getElementById('pmodalImage');
        if (imgEl) { imgEl.removeAttribute('src'); imgEl.hidden = true; }
        // Cerrar overlay de edicion si estaba abierto, liberando canvas y prompt.
        this._closeEditOverlay();
        if (this._siblingObserver) {
            try { this._siblingObserver.disconnect(); } catch (_) {}
            this._siblingObserver = null;
        }
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('production-modal-open');
        // Cerrar kebabs internos.
        modal.querySelectorAll('.pmodal-kebab-menu:not([hidden])').forEach(m => {
            m.hidden = true;
            m.previousElementSibling?.setAttribute('aria-expanded', 'false');
        });
        this._modalState = null;
    }

    /**
     * Renderiza el "prompt" del output como bloques labeled Notion-style.
     * Acepta:
     *   - String plano → 1 bloque "Prompt"
     *   - JSON string (incluso doblemente escapado) con campos
     *     {headline, subline, body, copy, typography_notes, ...} → 1 bloque
     *     por campo, label humanizado, value preservando saltos de línea.
     * Adicionalmente puebla el disclosure "Show generation details" con el
     * prompt técnico crudo (metadata.prompt_used) si existe.
     */
    _renderModalPrompt(rawCopyOrPrompt, output, run) {
        const container = document.getElementById('pmodalPromptBlocks');
        if (!container) return;

        // 1) Determinar la fuente. El "copy" estructurado vive en generated_copy
        //    o como string en prompt_used. Si rawCopyOrPrompt viene null, fallback.
        const source = rawCopyOrPrompt
            || output?.generated_copy
            || output?.prompt_used
            || output?.text_content
            || '';

        const blocks = this._parsePromptBlocks(source);

        if (!blocks.length) {
            container.innerHTML = `<p class="pmodal-prompt-empty">Sin prompt registrado.</p>`;
        } else {
            container.innerHTML = blocks.map(b => `
                <div class="pmodal-prompt-block">
                    <div class="pmodal-prompt-block-head">
                        <span class="pmodal-prompt-block-label">${this.escapeHtml(b.label)}</span>
                        <button type="button" class="pmodal-prompt-block-copy" data-action="copy-block" title="Copiar">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div class="pmodal-prompt-block-value">${this.escapeHtml(b.value)}</div>
                </div>
            `).join('');
        }

        // 2) Disclosure con el prompt técnico crudo (engineer-side).
        const raw = document.getElementById('pmodalPromptRaw');
        const rawText = document.getElementById('pmodalPromptRawText');
        const meta = this._safeParseJSON(output?.metadata) || {};
        const technicalPrompt = (typeof meta.prompt_used === 'string' && meta.prompt_used)
            || (typeof output?.prompt_used === 'string' && output.prompt_used.length > 200 ? output.prompt_used : '')
            || '';
        if (raw && rawText) {
            if (technicalPrompt) {
                raw.hidden = false;
                rawText.textContent = technicalPrompt;
                raw.open = false;
            } else {
                raw.hidden = true;
                rawText.textContent = '';
            }
        }
    }

    /**
     * Parser de prompt → [{label, value}].
     * Acepta string plano, JSON object, o JSON string (doble-escapado).
     * Filtra campos vacíos. Humaniza claves snake_case/camelCase.
     */
    _parsePromptBlocks(input) {
        if (input == null) return [];
        // Si ya es objeto, usarlo directo. Si es string, intentar parse 1-2 niveles.
        let value = input;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            // Doble escape: la string empieza con `"` (es un string JSON que envuelve otro JSON).
            if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || trimmed.startsWith('"{')) {
                try { value = JSON.parse(trimmed); } catch (_) {}
            }
            if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
                try { value = JSON.parse(value); } catch (_) {}
            }
        }

        // Si después de los parses sigue siendo string → un solo bloque "Prompt".
        if (typeof value === 'string') {
            const s = value.trim();
            return s ? [{ label: 'Prompt', value: s }] : [];
        }
        if (Array.isArray(value)) {
            return value
                .map((v, i) => ({
                    label: `Item ${i + 1}`,
                    value: typeof v === 'string' ? v : JSON.stringify(v, null, 2)
                }))
                .filter(b => b.value && b.value.trim());
        }
        if (typeof value !== 'object') return [];

        // Objeto: una entrada por campo. Filtramos vacíos y campos técnicos ruidosos.
        const SKIP = new Set(['id', 'created_at', 'updated_at', 'image_meta', 'prompt_used']);
        const PREFERRED_ORDER = ['headline', 'subline', 'body', 'copy', 'cta', 'tagline', 'description', 'typography_notes', 'rationale', 'notes'];
        const entries = Object.entries(value).filter(([k, v]) => {
            if (SKIP.has(k)) return false;
            if (v == null) return false;
            if (typeof v === 'string' && !v.trim()) return false;
            if (Array.isArray(v) && !v.length) return false;
            return true;
        });
        // Ordenar: preferidos primero, en orden, el resto alfabético.
        entries.sort(([a], [b]) => {
            const ia = PREFERRED_ORDER.indexOf(a);
            const ib = PREFERRED_ORDER.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b);
        });

        return entries.map(([k, v]) => ({
            label: this._humanizePromptKey(k),
            value: typeof v === 'string' ? v.trim() : JSON.stringify(v, null, 2)
        }));
    }

    /** Convierte typography_notes / typographyNotes → "Typography Notes". */
    _humanizePromptKey(key) {
        return String(key || '')
            .replace(/[_-]+/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    _renderModalInfo(output, run) {
        const container = document.getElementById('pmodalInfoRows');
        if (!container) return;
        const tp = this._safeParseJSON(output?.technical_params) || {};
        const meta = this._safeParseJSON(output?.metadata) || {};
        // Modelos: la columna runs_outputs.models es jsonb array (puede traer
        // varios: GPT para el plan creativo + Nanobanana para imagen + Kling
        // para animar). Fallback a tp/meta para rows pre-trigger.
        const rawModels = (Array.isArray(output?.models) ? output.models : null)
            || this._safeParseJSON(output?.models)
            || (tp.model || meta.model || meta.engine || meta.model_name
                ? [tp.model || meta.model || meta.engine || meta.model_name]
                : []);
        const models = Array.isArray(rawModels)
            ? rawModels.map(m => typeof m === 'string' ? m : (m?.name || m?.model || '')).filter(Boolean)
            : [];
        const quality = tp.quality || meta.quality || meta.resolution_tier || (meta.is_4k ? '4k' : '');
        const size = (() => {
            const w = tp.width || meta.width || meta.size_x;
            const h = tp.height || meta.height || meta.size_y;
            if (w && h) return `${w}x${h}`;
            if (meta.size) return String(meta.size);
            return '';
        })();
        const created = output?.created_at || run?.created_at;
        const createdStr = created
            ? new Date(created).toLocaleString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';
        const flowName = this.getFlowName(run);
        // Campania y audiencia: nombres vienen de los joins de loadFlowRuns
        // (campaigns(nombre_campana), audience_personas(name)). Si el run no
        // tiene campaign_id/persona_id, mostramos guion en vez de ocultar la fila,
        // asi el usuario ve que el flujo no estaba ligado a ninguna.
        const campaignName = run?.campaigns?.nombre_campana || (run?.campaign_id ? 'Sin nombre' : '—');
        const audienceName = run?.audience_personas?.name || (run?.persona_id ? 'Sin nombre' : '—');

        // Renderizado especial para modelos: chips en lugar de texto plano.
        const modelsHtml = models.length
            ? `<span class="pmodal-info-models">${models.map(m =>
                `<span class="pmodal-model-chip">${this.escapeHtml(m)}</span>`
              ).join('')}</span>`
            : '<span class="pmodal-info-value">—</span>';

        const rows = [
            ['Flow', flowName || '—', null],
            ['Campana', campaignName, null],
            ['Audiencia', audienceName, null],
            [models.length > 1 ? 'Modelos' : 'Modelo', null, modelsHtml],
            quality ? ['Quality', String(quality), null] : null,
            size ? ['Size', size, null] : null,
            createdStr ? ['Created', createdStr, null] : null
        ].filter(Boolean);

        container.innerHTML = rows.map(([label, value, customHtml]) => `
            <div class="pmodal-info-row">
                <span class="pmodal-info-label">${this.escapeHtml(label)}</span>
                ${customHtml
                    ? customHtml
                    : `<span class="pmodal-info-value">${this.escapeHtml(value)}</span>`
                }
            </div>
        `).join('');
    }

    _humanizeOutputType(t) {
        if (!t) return '';
        const s = String(t).toLowerCase();
        if (s.includes('video') || s.includes('reel') || s.includes('clip')) return 'Video';
        if (s.includes('image') || s.includes('img')) return 'Imagen';
        if (s.includes('text') || s.includes('copy')) return 'Texto';
        return t;
    }

    /**
     * Cambia entre tabs (output / input). Actualiza aria-selected, is-active
     * y hidden de los panes. Idempotente.
     */
    _switchModalTab(tab) {
        const modal = document.getElementById('productionModal');
        if (!modal) return;
        const tabs = modal.querySelectorAll('.pmodal-tab');
        const panes = modal.querySelectorAll('.pmodal-pane');
        tabs.forEach(btn => {
            const active = btn.getAttribute('data-tab') === tab;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panes.forEach(pane => {
            const active = pane.getAttribute('data-pane') === tab;
            pane.classList.toggle('is-active', active);
            if (active) pane.removeAttribute('hidden'); else pane.setAttribute('hidden', '');
        });
        const scroll = document.getElementById('pmodalScroll');
        if (scroll) scroll.scrollTo(0, 0);
    }

    /**
     * Renderiza el tab Input: lo que el usuario adjunto al disparar la
     * produccion. Lee de this.flowInputs (cargado en loadFlowInputs).
     *
     * Estructura del card:
     *  - Entidad (producto/servicio/lugar) con thumbnail + nombre
     *  - Referencias (imagenes adjuntas)
     *  - Briefing (texto libre)
     *  - Audiencia + Campania (resumidas como chips)
     *  - Resto de claves del payload como rows clave/valor
     *
     * Cuando no hay runs_inputs (corrida pre-instrumentacion), muestra estado
     * vacio explicando como llenar el snapshot.
     */
    _renderModalInput(run, output) {
        const container = document.getElementById('pmodalInputContent');
        if (!container) return;
        const inputRow = (this.flowInputs || []).find(i => i?.run_id === run?.id);
        const data = this._safeParseJSON(inputRow?.input_data) || inputRow?.input_data || null;

        if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
            container.innerHTML = `
                <div class="pmodal-input-empty">
                    <i class="fas fa-inbox" aria-hidden="true"></i>
                    <p>No quedo registrado el briefing de esta produccion.</p>
                    <p class="pmodal-input-empty-hint">Las producciones nuevas guardan automaticamente todo lo que usaste para crearlas.</p>
                </div>`;
            return;
        }

        // 1) Entidad (producto / servicio / lugar)
        const entityName = data.entity_name || data.product_name || data.service_name || data.place_name || '';
        const entityImg = data.entity_image_url || data.product_image_url || data.image_url || '';
        const entityType = data.entity_type || (entityName ? 'Entidad' : null);

        // 2) Referencias adjuntadas (imagenes / archivos)
        const refs = []
            .concat(Array.isArray(data.reference_images) ? data.reference_images : [])
            .concat(Array.isArray(data.references) ? data.references : [])
            .concat(Array.isArray(data.mood_images) ? data.mood_images : [])
            .concat(data.reference_image_url ? [data.reference_image_url] : [])
            .filter(Boolean);

        // 3) Briefing
        const briefing = data.briefing || data.brief || data.user_brief || data.instructions || '';

        // 4) Audiencia / Campania (mostradas tambien como chips)
        const audienceName = data.persona_name || data.audience_name || run?.audience_personas?.name || '';
        const campaignName = data.campaign_name || run?.campaigns?.nombre_campana || '';

        // 5) Resto del payload (excluye lo ya pintado arriba)
        const HIDDEN_KEYS = new Set([
            'entity_id','entity_name','entity_image_url','entity_type',
            'product_id','product_name','product_image_url','image_url',
            'service_id','service_name','place_id','place_name',
            'reference_images','references','mood_images','reference_image_url',
            'briefing','brief','user_brief','instructions',
            'persona_id','persona_name','audience_id','audience_name','audience_ids',
            'campaign_id','campaign_ids','campaign_name','brief_id'
        ]);
        const extraRows = Object.entries(data)
            .filter(([k, v]) => !HIDDEN_KEYS.has(k) && v !== null && v !== '' && v !== undefined)
            .map(([k, v]) => {
                const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const valStr = (typeof v === 'object') ? JSON.stringify(v) : String(v);
                return `<div class="pmodal-input-row">
                    <span class="pmodal-info-label">${this.escapeHtml(label)}</span>
                    <span class="pmodal-info-value pmodal-input-row-val">${this.escapeHtml(valStr.length > 200 ? valStr.slice(0, 200) + '…' : valStr)}</span>
                </div>`;
            }).join('');

        const entityHtml = entityName
            ? `<section class="pmodal-section pmodal-input-entity">
                <h3 class="pmodal-section-title"><i class="fas fa-cube"></i> ${this.escapeHtml(entityType || 'Entidad')}</h3>
                <div class="pmodal-entity-card">
                    ${entityImg
                        ? `<img src="${this.escapeHtml(entityImg)}" alt="${this.escapeHtml(entityName)}" class="pmodal-entity-img" loading="lazy" decoding="async">`
                        : `<div class="pmodal-entity-img pmodal-entity-img--empty" aria-hidden="true"><i class="fas fa-cube"></i></div>`
                    }
                    <div class="pmodal-entity-meta">
                        <p class="pmodal-entity-name">${this.escapeHtml(entityName)}</p>
                        ${entityType ? `<p class="pmodal-entity-type">${this.escapeHtml(entityType)}</p>` : ''}
                    </div>
                </div>
            </section>`
            : '';

        const refsHtml = refs.length
            ? `<section class="pmodal-section pmodal-input-refs">
                <h3 class="pmodal-section-title"><i class="fas fa-image"></i> REFERENCIAS</h3>
                <div class="pmodal-refs-grid">
                    ${refs.map((url, i) => `
                        <a class="pmodal-ref-thumb" href="${this.escapeHtml(url)}" target="_blank" rel="noopener" aria-label="Referencia ${i+1}">
                            <img src="${this.escapeHtml(url)}" alt="" loading="lazy" decoding="async">
                        </a>
                    `).join('')}
                </div>
            </section>`
            : '';

        const briefHtml = briefing
            ? `<section class="pmodal-section pmodal-input-brief">
                <h3 class="pmodal-section-title"><i class="fas fa-quote-left"></i> INSTRUCCIONES</h3>
                <p class="pmodal-input-brief-text">${this.escapeHtml(briefing)}</p>
            </section>`
            : '';

        const contextChips = [];
        if (campaignName) contextChips.push(`<span class="pmodal-context-chip"><i class="fas fa-bullhorn"></i> ${this.escapeHtml(campaignName)}</span>`);
        if (audienceName) contextChips.push(`<span class="pmodal-context-chip"><i class="fas fa-users"></i> ${this.escapeHtml(audienceName)}</span>`);
        const contextHtml = contextChips.length
            ? `<section class="pmodal-section pmodal-input-context">
                <div class="pmodal-context-chips">${contextChips.join('')}</div>
            </section>`
            : '';

        const extrasHtml = extraRows
            ? `<section class="pmodal-section pmodal-input-extras">
                <h3 class="pmodal-section-title"><i class="fas fa-list"></i> PARAMETROS</h3>
                <div class="pmodal-info-rows">${extraRows}</div>
            </section>`
            : '';

        container.innerHTML = entityHtml + contextHtml + refsHtml + briefHtml + extrasHtml
            || `<div class="pmodal-input-empty"><i class="fas fa-inbox"></i><p>Sin inputs registrados.</p></div>`;
    }

    _safeParseJSON(v) {
        if (v == null) return null;
        if (typeof v === 'object') return v;
        if (typeof v !== 'string') return null;
        try { return JSON.parse(v); } catch (_) { return null; }
    }

    _renderModalSiblings(runId, currentOutputId) {
        const strip = document.getElementById('pmodalSiblings');
        if (!strip) return;
        if (!runId) { strip.hidden = true; strip.innerHTML = ''; return; }
        const siblings = (this.flowOutputs || []).filter(o => o && o.run_id === runId && o.id !== currentOutputId);
        if (!siblings.length) { strip.hidden = true; strip.innerHTML = ''; return; }
        strip.hidden = false;
        // data-src + IntersectionObserver: las thumbs no descargan hasta que entran al viewport
        // del scroll container. loading="lazy" en <img> dentro de overflow:auto no es confiable.
        strip.innerHTML = siblings.slice(0, 8).map(s => {
            const url = this.resolveOutputMediaUrl(s)
                || (s.storage_path ? (this.getPublicUrlFromStorage('production-outputs', s.storage_path) || this.getPublicUrlFromStorage('outputs', s.storage_path)) : '')
                || '';
            return `
                <button type="button" class="pmodal-sibling" data-output-id="${this.escapeHtml(s.id)}" title="Abrir variante" aria-label="Variante de produccion">
                    ${url ? `<img data-src="${this.escapeHtml(url)}" alt="" decoding="async" loading="lazy">` : `<i class="fas fa-image" aria-hidden="true"></i>`}
                </button>
            `;
        }).join('');
        this._observeSiblingThumbs(strip);
    }

    _observeSiblingThumbs(strip) {
        if (!strip) return;
        if (this._siblingObserver) { try { this._siblingObserver.disconnect(); } catch (_) {} }
        const scrollRoot = document.getElementById('pmodalScroll') || null;
        const hydrate = (img) => {
            const ds = img.getAttribute('data-src');
            if (!ds) return;
            img.src = ds;
            img.removeAttribute('data-src');
        };
        if (!('IntersectionObserver' in window)) {
            strip.querySelectorAll('img[data-src]').forEach(hydrate);
            return;
        }
        this._siblingObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    hydrate(entry.target);
                    obs.unobserve(entry.target);
                }
            });
        }, { root: scrollRoot, rootMargin: '200px', threshold: 0.01 });
        strip.querySelectorAll('img[data-src]').forEach(img => this._siblingObserver.observe(img));
    }

    /**
     * Despacha clicks del toolbar del modal. Cada accion mapea a un endpoint
     * Kie (data-kie-model en el HTML); por ahora solo "edit" abre UI propia,
     * los demas muestran toast porque el backend (Netlify Functions) sigue
     * pendiente. Cuando se conecten, este switch llama al endpoint y refresca.
     */
    _handleToolbarAction(tool, btn) {
        const state = this._modalState || {};
        switch (tool) {
            case 'edit':
                this._openEditOverlay();
                break;
            case 'upscale':
                this._toolbarSoonToast('Mejorar 4K', 'Topaz');
                break;
            case 'remove-bg':
                this._toolbarSoonToast('Sin fondo', 'Recraft');
                break;
            case 'variations':
                this._toolbarSoonToast('Variar', 're-roll');
                break;
            case 'animate':
                if (window.router) window.router.navigate('/video');
                this.closeProductionModal();
                break;
            default:
                break;
        }
    }

    _toolbarSoonToast(label, vendor) {
        const msg = vendor
            ? `${label} (${vendor}) — wire-up con Kie en sprint dedicado.`
            : `${label} — pendiente de wire-up.`;
        if (typeof window.showToast === 'function') window.showToast(msg);
        else console.info(msg);
    }

    // ====================================================================
    // OVERLAY DE EDICION CON MASCARA
    // El usuario pinta una zona sobre la imagen (canvas client-side, no IA)
    // y escribe que quiere cambiar. La mascara se captura como PNG dataURL
    // y se envia junto al prompt al endpoint Kie (cuando este wire-up).
    // ====================================================================

    _openEditOverlay() {
        const overlay = document.getElementById('pmodalEditOverlay');
        const canvas = document.getElementById('pmodalEditCanvas');
        const visual = document.querySelector('.production-modal-visual-inner');
        const img = document.getElementById('pmodalImage');
        if (!overlay || !canvas || !visual || !img || img.hidden || !img.src) {
            if (typeof window.showToast === 'function') window.showToast('Editar solo disponible para imagenes');
            return;
        }
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        canvas.hidden = false;
        this._editState = this._editState || { tool: 'brush', size: 60, drawing: false };

        // Sincronizar tamano del canvas con la imagen ya pintada.
        this._syncEditCanvasSize(img);
        this._bindEditCanvasOnce();
        // Focus al prompt para escritura inmediata.
        setTimeout(() => document.getElementById('pmodalEditPrompt')?.focus(), 50);
    }

    _closeEditOverlay() {
        const overlay = document.getElementById('pmodalEditOverlay');
        const canvas = document.getElementById('pmodalEditCanvas');
        if (overlay) {
            overlay.hidden = true;
            overlay.setAttribute('aria-hidden', 'true');
        }
        if (canvas) canvas.hidden = true;
        this._clearEditCanvas();
        const promptEl = document.getElementById('pmodalEditPrompt');
        if (promptEl) promptEl.value = '';
    }

    _syncEditCanvasSize(img) {
        const canvas = document.getElementById('pmodalEditCanvas');
        if (!canvas || !img) return;
        const rect = img.getBoundingClientRect();
        // Posicionar el canvas exactamente sobre el bounding box renderizado de
        // la imagen. Como el canvas es sibling del img dentro de .production-
        // modal-visual-inner (flex container con padding), calculamos offset
        // relativo a ese contenedor.
        const parent = canvas.parentElement;
        const parentRect = parent.getBoundingClientRect();
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        canvas.style.left = (rect.left - parentRect.left) + 'px';
        canvas.style.top = (rect.top - parentRect.top) + 'px';
    }

    _bindEditCanvasOnce() {
        const canvas = document.getElementById('pmodalEditCanvas');
        if (!canvas || canvas._editBound) return;
        canvas._editBound = true;
        const ctx = canvas.getContext('2d');

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const t = e.touches ? e.touches[0] : e;
            return { x: t.clientX - rect.left, y: t.clientY - rect.top };
        };

        const stroke = (e) => {
            if (!this._editState?.drawing) return;
            e.preventDefault();
            const p = getPos(e);
            const size = this._editState.size;
            if (this._editState.tool === 'brush') {
                ctx.globalCompositeOperation = 'source-over';
                // Blanco al 30% alpha + mix-blend-mode:difference en CSS produce
                // un negativo parcial de la zona pintada: en fondos claros se ve
                // oscuro, en fondos oscuros se ve claro. Visible en cualquier
                // imagen sin introducir color de marca.
                ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
            } else {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.fillStyle = 'rgba(0,0,0,1)';
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
            ctx.fill();
        };

        canvas.addEventListener('mousedown', (e) => { this._editState.drawing = true; stroke(e); });
        canvas.addEventListener('mousemove', stroke);
        window.addEventListener('mouseup', () => { if (this._editState) this._editState.drawing = false; });
        canvas.addEventListener('touchstart', (e) => { this._editState.drawing = true; stroke(e); }, { passive: false });
        canvas.addEventListener('touchmove', stroke, { passive: false });
        canvas.addEventListener('touchend', () => { if (this._editState) this._editState.drawing = false; });

        // Re-sincronizar tamano al cambiar viewport (re-layout de la imagen).
        const img = document.getElementById('pmodalImage');
        if (img) {
            const ro = new ResizeObserver(() => this._syncEditCanvasSize(img));
            ro.observe(img);
        }

        // Slider de tamano de pincel.
        const slider = document.getElementById('pmodalEditBrushSize');
        if (slider) {
            slider.addEventListener('input', (e) => {
                if (this._editState) this._editState.size = parseInt(e.target.value, 10) || 60;
            });
        }
    }

    _setEditTool(tool) {
        if (!this._editState) this._editState = { tool: 'brush', size: 60, drawing: false };
        this._editState.tool = (tool === 'eraser' ? 'eraser' : 'brush');
        document.querySelectorAll('[data-edit-tool]').forEach(el => {
            el.classList.toggle('is-active', el.getAttribute('data-edit-tool') === this._editState.tool);
        });
    }

    _clearEditCanvas() {
        const canvas = document.getElementById('pmodalEditCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /**
     * Aplica la edicion. Captura la mascara (PNG dataURL) + el prompt y por
     * ahora muestra un toast. Cuando el backend Netlify este listo, este
     * metodo hace POST a /.netlify/functions/api-kie-edit con
     *   { image_url: state.mediaUrl, mask_png: dataURL, prompt }.
     */
    _applyEditOverlay() {
        const promptEl = document.getElementById('pmodalEditPrompt');
        const canvas = document.getElementById('pmodalEditCanvas');
        const prompt = (promptEl?.value || '').trim();
        if (!prompt) {
            if (typeof window.showToast === 'function') window.showToast('Describe que quieres cambiar antes de aplicar');
            promptEl?.focus();
            return;
        }
        const hasMask = canvas && this._canvasHasContent(canvas);
        const maskPng = hasMask ? canvas.toDataURL('image/png') : null;
        const msg = hasMask
            ? `Edicion encolada con mascara: "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}"`
            : `Edicion encolada (sin mascara): "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}"`;
        if (typeof window.showToast === 'function') window.showToast(msg);
        // Persistimos en window para inspeccion / wire-up futuro.
        window.__lastEditIntent = { prompt, maskPng, mediaUrl: this._modalState?.mediaUrl, outputId: this._modalState?.outputId };
        this._closeEditOverlay();
    }

    _canvasHasContent(canvas) {
        try {
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            // Scan alpha channel; rapido salir al primer pixel no-transparente.
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] > 0) return true;
            }
            return false;
        } catch (_) {
            return false;
        }
    }

    _bindModalListenersOnce(modal) {
        if (modal._listenersBound) return;
        modal._listenersBound = true;

        // Tabs Output / Input.
        modal.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.pmodal-tab[data-tab]');
            if (!tabBtn) return;
            this._switchModalTab(tabBtn.getAttribute('data-tab'));
        });

        // Toolbar acciones (Editar / Mejorar 4K / Sin fondo / Variar / Animar).
        modal.addEventListener('click', (e) => {
            const toolBtn = e.target.closest('.pmodal-toolpill[data-tool]');
            if (!toolBtn || toolBtn.hasAttribute('disabled')) return;
            const tool = toolBtn.getAttribute('data-tool');
            this._handleToolbarAction(tool, toolBtn);
        });

        // Acciones internas del overlay de edicion.
        modal.addEventListener('click', (e) => {
            const editAction = e.target.closest('[data-edit-action]');
            if (editAction) {
                const act = editAction.getAttribute('data-edit-action');
                if (act === 'cancel') this._closeEditOverlay();
                else if (act === 'apply') this._applyEditOverlay();
                else if (act === 'clear') this._clearEditCanvas();
                return;
            }
            const toolSel = e.target.closest('[data-edit-tool]');
            if (toolSel) {
                this._setEditTool(toolSel.getAttribute('data-edit-tool'));
            }
        });

        modal.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (btn) {
                e.stopPropagation();
                const action = btn.dataset.action;
                const state = this._modalState || {};
                switch (action) {
                    case 'modal-close': this.closeProductionModal(); break;
                    case 'animate': {
                        // Navega a /video — el flujo Animate hoy es generar a partir de la imagen.
                        if (window.router) window.router.navigate('/video');
                        this.closeProductionModal();
                        break;
                    }
                    case 'publish': {
                        if (typeof window.showToast === 'function') window.showToast('Publicar a Meta llega pronto');
                        break;
                    }
                    case 'open-in': {
                        if (state.mediaUrl) window.open(state.mediaUrl, '_blank', 'noopener');
                        break;
                    }
                    case 'reference': {
                        if (typeof window.showToast === 'function') window.showToast('Guardar como referencia llega pronto');
                        break;
                    }
                    case 'download': {
                        if (state.mediaUrl) this.downloadImage(state.mediaUrl);
                        break;
                    }
                    case 'like': {
                        const nowLiked = await this.toggleLike(state.outputId);
                        btn.setAttribute('aria-pressed', nowLiked ? 'true' : 'false');
                        btn.classList.toggle('is-liked', nowLiked);
                        const ic = btn.querySelector('i');
                        if (ic) ic.className = 'fas fa-heart';
                        // Sincronizar también el corazón del overlay de la card en la grilla.
                        const cardLike = document.querySelector(`.history-image-card[data-output-id="${CSS.escape(state.outputId || '')}"] .card-action--like, .history-video-card[data-output-id="${CSS.escape(state.outputId || '')}"] .card-action--like`);
                        if (cardLike) {
                            cardLike.classList.toggle('is-liked', nowLiked);
                            cardLike.setAttribute('aria-pressed', nowLiked ? 'true' : 'false');
                            const cardIcon = cardLike.querySelector('i');
                            if (cardIcon) cardIcon.className = 'fas fa-heart';
                        }
                        break;
                    }
                    case 'share':
                    case 'copy-url': {
                        await this.copyShareUrl(state.mediaUrl);
                        this._closeModalKebabs(modal);
                        break;
                    }
                    case 'copy-prompt': {
                        if (state.prompt && navigator.clipboard?.writeText) {
                            try {
                                await navigator.clipboard.writeText(state.prompt);
                                if (typeof window.showToast === 'function') window.showToast('Prompt copiado');
                            } catch (_) {}
                        }
                        this._closeModalKebabs(modal);
                        break;
                    }
                    case 'copy-block': {
                        // Copia el valor del bloque labeled (Headline / Subline / etc.)
                        const block = btn.closest('.pmodal-prompt-block');
                        const valueEl = block?.querySelector('.pmodal-prompt-block-value');
                        const text = valueEl?.textContent?.trim() || '';
                        if (text && navigator.clipboard?.writeText) {
                            try {
                                await navigator.clipboard.writeText(text);
                                if (typeof window.showToast === 'function') window.showToast('Copiado');
                            } catch (_) {}
                        }
                        break;
                    }
                    case 'kebab': {
                        const wrap = btn.closest('.pmodal-kebab-wrap');
                        const menu = wrap?.querySelector('.pmodal-kebab-menu');
                        if (!menu) break;
                        const willOpen = menu.hidden;
                        modal.querySelectorAll('.pmodal-kebab-menu:not([hidden])').forEach(m => {
                            if (m !== menu) { m.hidden = true; m.previousElementSibling?.setAttribute('aria-expanded', 'false'); }
                        });
                        menu.hidden = !willOpen;
                        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
                        break;
                    }
                    case 'delete': {
                        if (!confirm('¿Eliminar esta producción? No se puede deshacer.')) break;
                        const ok = await this.deleteOutput(state.outputId);
                        if (ok) {
                            document.querySelectorAll(`[data-output-id="${CSS.escape(state.outputId || '')}"]`).forEach(el => {
                                const c = el.closest('.living-masonry-item') || el.closest('.history-image-card, .history-video-card');
                                c?.remove();
                            });
                            this._updateSelectionBar();
                            if (typeof window.showToast === 'function') window.showToast('Producción eliminada');
                            this.closeProductionModal();
                        }
                        break;
                    }
                }
                return;
            }
            // Click en sibling thumbnail: abrir esa variante.
            const sibling = e.target.closest('.pmodal-sibling');
            if (sibling) {
                const sid = sibling.dataset.outputId;
                const sout = (this.flowOutputs || []).find(o => o?.id === sid);
                if (!sout) return;
                const surl = this.resolveOutputMediaUrl(sout)
                    || (sout.storage_path ? this.getPublicUrlFromStorage('production-outputs', sout.storage_path) : '')
                    || '';
                this.openProductionModal({
                    imageUrl: surl,
                    prompt: sout.prompt_used || '',
                    item: { item: null, output: sout, run: (this.flowRuns || []).find(r => r?.id === sout.run_id) || { id: sout.run_id } }
                });
            }
        });

        // Tabs (sólo Details activo; Comments es disabled visualmente).
        modal.querySelectorAll('.pmodal-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.disabled) return;
                modal.querySelectorAll('.pmodal-tab').forEach(t => {
                    t.classList.toggle('is-active', t === tab);
                    t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
                });
            });
        });

        // Toolbar inferior: solo Overview activo, los demás son no-op por ahora.
        modal.querySelectorAll('.pmodal-toolpill').forEach(pill => {
            pill.addEventListener('click', () => {
                if (pill.disabled) {
                    if (typeof window.showToast === 'function') window.showToast(`${pill.textContent.trim()} llega pronto`);
                    return;
                }
            });
        });

        // Prompt See all.
        const promptToggle = document.getElementById('pmodalPromptToggle');
        if (promptToggle) {
            promptToggle.addEventListener('click', () => {
                const txt = document.getElementById('pmodalPromptText');
                if (!txt) return;
                const expanded = txt.classList.toggle('is-expanded');
                promptToggle.querySelector('span').textContent = expanded ? 'Show less' : 'See all';
                promptToggle.querySelector('i').className = expanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
            });
        }

        // Esc cierra.
        if (!this._modalEscBound) {
            this._modalEscBound = true;
            this._modalEscHandler = (e) => {
                if (e.key === 'Escape' && modal.classList.contains('is-open')) this.closeProductionModal();
            };
            document.addEventListener('keydown', this._modalEscHandler);
        }
    }

    _closeModalKebabs(modal) {
        modal.querySelectorAll('.pmodal-kebab-menu:not([hidden])').forEach(m => {
            m.hidden = true;
            m.previousElementSibling?.setAttribute('aria-expanded', 'false');
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
                    this.openProductionModal(data);
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
    
    /** Fecha relativa estilo Twitter ("3h ago", "2d ago", "May 14"). */
    _relativeDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const diffMs = Date.now() - d.getTime();
        const sec = Math.floor(diffMs / 1000);
        if (sec < 60) return 'Just now';
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        const days = Math.floor(hr / 24);
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /** Obtiene otros outputs del mismo run (excluyendo el actual). */

    /** Dispara una descarga del media (image o video) a archivo local. */
    async _downloadMedia(url, filename) {
        if (!url) return;
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(response.statusText);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename || `production-${Date.now()}.${(url.split('.').pop() || 'png').split('?')[0]}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(blobUrl);
        } catch (_) {
            // Fallback: link directo (puede abrir en tab si el server no manda Content-Disposition).
            const link = document.createElement('a');
            link.href = url;
            link.download = filename || '';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            link.remove();
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

    /**
     * Zoom + pan profesional sobre la imagen del viewer.
     *
     * Fórmula: transform = `translate(tx, ty) scale(s)` con transform-origin 0 0.
     * Para zoom hacia el cursor: dado el punto del cursor (cx, cy) relativo al
     * container, mantener el mismo punto bajo el cursor después del zoom:
     *   tx_new = cx - (cx - tx_old) * (s_new / s_old)
     *
     * Listeners se cancelan con AbortController.signal cuando se cierra el modal.
     * Devuelve la función de cleanup.
     */
    destroy() {
        if (this._docClickCloseDropdown) {
            document.removeEventListener('click', this._docClickCloseDropdown);
            this._docClickCloseDropdown = null;
        }
        if (this._onHistoryScroll) {
            window.removeEventListener('scroll', this._onHistoryScroll);
            this._onHistoryScroll = null;
        }
        // La selection bar vive en <body>, no en la vista; al salir de
        // Production hay que removerla manualmente.
        document.getElementById('productionSelectionBar')?.remove();
        this.selectedOutputs?.clear();
        this.likedOutputs?.clear();
        // Modal listener global de Esc.
        if (this._modalEscHandler) {
            document.removeEventListener('keydown', this._modalEscHandler);
            this._modalEscHandler = null;
            this._modalEscBound = false;
        }
        this._modalState = null;
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
