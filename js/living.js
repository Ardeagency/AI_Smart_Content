/**
 * Living Dashboard - Estructura única estilo Netflix/Flix.id
 * Featured content, categorías y grid de producciones
 */

/**
 * Defaults compartidos para polling de tasks KIE. 5 min cubre el peor caso
 * de Topaz upscale 8x; 3s es el balance entre latencia perceptual y carga
 * en KIE recordInfo endpoint.
 */
const KIE_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const KIE_POLL_INTERVAL_MS = 3000;

/**
 * TTL del cache de _sourceProductInfo por outputId. 5 min es suficiente
 * para que reapariciones del mismo modal no re-fetchen 4 queries a BD,
 * sin quedarse stale si el dev modifica el producto subyacente.
 */
const SOURCE_INFO_CACHE_TTL_MS = 5 * 60 * 1000;

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
        this.pendingEdits = []; // Ediciones en curso: { clientId, taskId, sourceImageUrl, aspectRatio, createdAt }
        this.eventListenersSetup = false;
        this.initialized = false;
        // Filtros del historial
        this.filterDateFrom = null;
        this.filterDateTo = null;
        this.filterContentType = '';
        this.filterFlowName = '';
        // Studio: scoping del canvas a un solo run (modelo "un output pertenece a un run").
        // runScoped=true => el canvas solo muestra outputs del run activo (filterRunId).
        // Sin run activo (filterRunId null) => canvas vacio. Las 3 fuentes se filtran por run_id.
        this.runScoped = false;
        this.filterRunId = null;
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

        // Estado del modal/overlay de Production (P3#2 audit: init defensivo
        // para que primer acceso no sea undefined).
        this._modalState = null;
        this._editMode = 'remove';
        this._editState = null;
        this._selectedProductId = null;
        this._editReferenceImageUrl = '';
        this._editOverlayLastFocus = null;
        this._sourceProductInfo = null;
        this._sourceInfoCache = new Map();
        this._inflightToolbarOps = new Set();
        this._orgProductsCache = null;
        
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
        // La marca SIEMPRE se resuelve dentro de la org activa de la URL, nunca
        // "la más reciente del usuario": un usuario multi-org (ej. dueño de IGNIS
        // y WAKEUP) heredaria la marca de otra org y las producciones/tareas se
        // cruzarian entre workspaces. La org activa la publica el router en
        // window.currentOrgId (resuelta desde /org/{shortId}/{slug}).
        const activeOrgId = this.organizationId || window.currentOrgId || this.routeParams?.orgId || null;
        if (activeOrgId) this.organizationId = activeOrgId;
        try {
            const fetcher = async () => {
                let q = this.supabase.from('brand_containers').select('*');
                // Scope duro a la org activa; solo rutas legacy sin /org/ caen al usuario.
                q = activeOrgId ? q.eq('organization_id', activeOrgId) : q.eq('user_id', this.userId);
                const { data, error } = await q
                    .order('created_at', { ascending: true })
                    .limit(1).maybeSingle();
                if (error) throw error;
                return data;
            };
            // Cache por org (no por usuario) para no arrastrar la marca de otra org.
            const cacheKey = `living:project:${activeOrgId || this.userId}`;
            this.projectData = window.apiClient
                ? await window.apiClient.query(cacheKey, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
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
                .from('runs_outputs')
                .select('id, run_id, output_type, storage_path, storage_object_id, prompt_used, generated_copy, text_content, metadata, technical_params, created_at, generated_hashtags, creative_rationale, models, reference_image_url, entity_id')
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
     * Studio: activa el scope a un run concreto y carga sus outputs directamente
     * por run_id (no depende de que el run este en la pagina reciente de flow_runs).
     * Pasar runId null limpia el scope (canvas vacio). Re-renderiza al terminar.
     */
    async setActiveRun(runId) {
        this.runScoped = true;
        this.filterRunId = runId || null;
        this._historyVisibleCount = 0;
        if (runId) {
            await this.loadFlowOutputs({ reset: false, runIds: [runId] });
        }
        if (typeof this.renderHistorySection === 'function') {
            await this.renderHistorySection();
        }
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
        // Los outputs vienen de 2 tablas: runs_outputs (flows) y system_ai_outputs
        // (generacion directa de modelo). Borrar de la equivocada devolvia 0 filas
        // SIN error -> la card desaparecia optimista pero reaparecia al recargar.
        const table = (this.systemAiOutputs || []).some(o => o?.id === outputId)
            ? 'system_ai_outputs'
            : 'runs_outputs';
        try {
            const { error } = await this.supabase
                .from(table)
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
        // Separar por tabla de origen (runs_outputs vs system_ai_outputs) y borrar
        // de cada una; antes todo iba a runs_outputs y los system_ai no se borraban.
        const sysIds = new Set((this.systemAiOutputs || []).map(o => o?.id).filter(Boolean));
        const fromSystem = outputIds.filter(id => sysIds.has(id));
        const fromRuns = outputIds.filter(id => !sysIds.has(id));
        try {
            if (fromRuns.length) {
                const { error } = await this.supabase.from('runs_outputs').delete().in('id', fromRuns);
                if (error) throw error;
            }
            if (fromSystem.length) {
                const { error } = await this.supabase.from('system_ai_outputs').delete().in('id', fromSystem);
                if (error) throw error;
            }
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
                .select('id, run_id, output_type, storage_path, storage_object_id, prompt_used, generated_copy, text_content, metadata, technical_params, created_at, generated_hashtags, creative_rationale, reference_image_url, entity_id')
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
     * Carga producciones de system_ai_outputs (excluye OpenAI puro tipo
     * generated text). Filtra por organization_id (consistente con
     * runs_outputs). Selecciona los campos FK canonicos.
     */
    async loadSystemAiOutputs({ reset = false } = {}) {
        if (!this.supabase || !this.organizationId) {
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
                .select('id, run_id, brand_container_id, organization_id, user_id, provider, output_type, status, storage_path, storage_object_id, prompt_used, text_content, technical_params, metadata, models, entity_id, reference_image_url, brief_id, persona_id, campaign_id, created_at')
                .eq('organization_id', this.organizationId)
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
            let contentType;
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
            let contentType;
            if (outputType.includes('video') || outputType.includes('reel') || outputType.includes('clip')) contentType = 'video';
            else if (outputType.includes('image') || outputType.includes('img') || resolvedUrl) contentType = 'image';
            else contentType = 'text';
            // Derivar el "Flow" desde metadata.kind: las ediciones standalone
            // no son flujos n8n, son operaciones puntuales (Editar/Mejorar 4K/
            // Sin fondo/Mejorar texto/Video). El label generico "System AI"
            // no aporta nada al usuario.
            const operationName = this._operationNameFromOutput(item, contentType);
            return {
                contentType,
                fileUrl: resolvedUrl,
                prompt,
                run: { id: null, content_flows: { name: operationName } },
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

        // Cards skeleton de ediciones en curso: aparecen siempre al inicio.
        const fromPending = (this.pendingEdits || []).map(p => ({
            contentType: 'image',
            fileUrl: null,
            prompt: p.error ? `Error: ${p.error}` : 'Edicion en curso...',
            run: null,
            output: null,
            created_at: p.createdAt,
            _outputId: p.clientId,
            _isPendingEdit: true,
            _pendingTaskId: p.taskId,
            _pendingSourceImage: p.sourceImageUrl,
            _pendingAspectRatio: p.aspectRatio,
            _pendingLabel: p.label || 'Editando con IA',
            _pendingError: p.error || null
        }));

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
                // Backwards compat (P2#4 audit 2026-05-25): outputs viejos sin
                // storage_path NI URL resolvible quedaban como cards rotas
                // (ghost cards sin imagen). Si es image/video y no hay fileUrl
                // ni texto util, dropear silenciosamente.
                if ((it.contentType === 'image' || it.contentType === 'video')
                    && !it.fileUrl
                    && !it._isPendingEdit) {
                    return false;
                }
                return true;
            })
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        // Skeletons siempre al inicio (sobre cualquier filtro de fecha/tipo).
        allItems = [...fromPending, ...allItems];

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
        // En modo run-scoped el filtro autoritativo es filterRunId (mas abajo): no
        // aplicamos filterFlowName porque descartaria outputs cuyo run aun no esta
        // hidratado en flowRuns (getFlowName no coincidiria) justo tras producir.
        if (this.filterFlowName && !this.runScoped) {
            allItems = allItems.filter(it => this.getFlowName(it.run) === this.filterFlowName);
        }

        // Studio: scope a un solo run. Sin run activo => canvas vacio; con run activo
        // => solo outputs de ese run (cualquier fuente que exponga run_id). Las ediciones
        // standalone (system_ai_outputs, run_id null) no pertenecen a un run y se omiten.
        // Las cards de edicion en curso (_isPendingEdit) se conservan siempre.
        if (this.runScoped) {
            if (!this.filterRunId) {
                allItems = allItems.filter(it => it._isPendingEdit);
            } else {
                allItems = allItems.filter(it => {
                    if (it._isPendingEdit) return true;
                    const rid = (it.run && it.run.id) || (it.output && it.output.run_id) || null;
                    return rid === this.filterRunId;
                });
            }
        }

        this._historyCurrentItems = allItems;

        if (allItems.length === 0) {
            container.innerHTML = this.renderEmptyState();
            this.setupEmptyStateCta(container);
            return;
        }

        if (!this._historyVisibleCount) {
            this._historyVisibleCount = Math.min(this._historyPageSize, allItems.length);
        } else {
            this._historyVisibleCount = Math.min(this._historyVisibleCount, allItems.length);
        }

        const visibleItems = allItems.slice(0, this._historyVisibleCount);

        const itemHtmls = visibleItems.map((item, index) => {
            if (item._isPendingEdit) {
                return this._renderPendingEditSkeleton(item, index);
            }
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
        // Studio usa CSS grid (disableJustified); el resto, masonry justificado.
        if (window.applyJustifiedLayout && !this.disableJustified) window.applyJustifiedLayout(grid);
        if (this.disableJustified) grid.classList.add('living-masonry-grid--css-grid');
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
        // Producciones standalone: agregan una opcion por cada operacion
        // distinta (Editar / Mejorar 4K / Sin fondo / Mejorar texto / Video)
        // detectada en los outputs cargados. Asi el filtro refleja la
        // operacion real y no un literal generico "System AI".
        (this.systemAiOutputs || []).forEach(item => {
            const outputType = (item?.output_type || '').toLowerCase();
            const contentType = outputType.includes('video') ? 'video'
                              : outputType.includes('image') ? 'image'
                              : 'text';
            const name = this._operationNameFromOutput(item, contentType);
            if (name && !set.has(name)) { set.add(name); names.push(name); }
        });
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
     * Etiqueta human-readable para una produccion standalone (sin flow_run).
     * Lee metadata.kind como fuente canonica y cae a output_type para outputs
     * pre-instrumentacion.
     */
    _operationNameFromOutput(output, contentType) {
        const meta = this._safeParseJSON(output?.metadata) || {};
        const kind = (meta?.kind || '').toString();
        const KIND_LABELS = {
            image_edit: 'Editado',
            image_upscale: 'Mejorado 4K',
            image_remove_bg: 'Fondo Eliminado',
            image_fix_text: 'Texto corregido',
            image_reframe: 'Reencuadrado',
            video_generated: 'Video Studio'
        };
        if (KIND_LABELS[kind]) return KIND_LABELS[kind];
        if (contentType === 'video') return 'Video Studio';
        if (contentType === 'image') return 'Imagen';
        if (contentType === 'text') return 'Texto';
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
                <i class="aisc-ico ${selected ? 'aisc-ico--check' : 'aisc-ico--circle'}" aria-hidden="true"></i>
            </button>
            <div class="card-overlay-actions">
                <button type="button" class="card-action card-action--like ${liked ? 'is-liked' : ''}" data-action="like" data-output-id="${safeId}" title="Me gusta" aria-label="Me gusta" aria-pressed="${liked ? 'true' : 'false'}">
                    <i class="aisc-ico aisc-ico--likes" aria-hidden="true"></i>
                </button>
                <button type="button" class="card-action" data-action="copy-prompt" data-prompt="${promptSafe}" title="Copiar prompt" aria-label="Copiar prompt">
                    <i class="aisc-ico aisc-ico--copy" aria-hidden="true"></i>
                </button>
                <button type="button" class="card-action" data-action="download" data-url="${safeUrl}" title="Descargar" aria-label="Descargar">
                    <i class="aisc-ico aisc-ico--dowload" aria-hidden="true"></i>
                </button>
                <div class="card-kebab-wrap">
                    <button type="button" class="card-action card-action--kebab" data-action="kebab" title="Más acciones" aria-label="Más acciones" aria-expanded="false">
                        <i class="aisc-ico aisc-ico--menu" aria-hidden="true"></i>
                    </button>
                    <div class="card-kebab-menu" role="menu" hidden>
                        <button type="button" role="menuitem" data-action="share" data-url="${safeUrl}">
                            <i class="aisc-ico aisc-ico--link" aria-hidden="true"></i>
                            <span>Compartir enlace</span>
                        </button>
                        <button type="button" role="menuitem" data-action="publish-meta">
                            <i class="aisc-ico aisc-ico--upload" aria-hidden="true"></i>
                            <span>Publicar</span>
                        </button>
                        <button type="button" role="menuitem" class="card-kebab-menu-danger" data-action="delete" data-output-id="${safeId}">
                            <i class="aisc-ico aisc-ico--delete" aria-hidden="true"></i>
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
                <i class="aisc-ico aisc-ico--video"></i>
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

        // Cards con alpha (PNG transparente del flujo remove-bg) muestran un
        // fondo glass-black para que el usuario perciba la transparencia. Si
        // no, sobre fondo negro solido pareceria que la imagen tiene fondo.
        const meta = output?.metadata || {};
        const tp = output?.technical_params || {};
        const hasAlpha = meta.kind === 'image_remove_bg'
            || meta.has_alpha === true
            || tp.has_alpha === true;
        const alphaCls = hasAlpha ? ' is-alpha-bg' : '';

        return `
            <article class="living-masonry-item history-image-card${alphaCls}" role="listitem" data-production-id="${productionId}" data-output-id="${this.escapeHtml(output?.id || '')}" data-run-id="${run?.id || ''}" data-card-info="${this.escapeHtml(cardData)}" aria-label="${this.escapeHtml(flowName || 'Produccion de imagen')}">
                <figure class="history-image-card-media">
                    ${finalUrl
                        ? `<img src="${this.escapeHtml(finalUrl)}" alt="${this.escapeHtml(flowName || 'Produccion')}" loading="${loadingAttr}" decoding="async" fetchpriority="${fetchAttr}" onerror="this.closest('figure').innerHTML='<div class=\\'history-image-card-fallback\\'><i class=\\'fas fa-image\\'></i></div>';" />`
                        : `<div class="history-image-card-fallback" aria-hidden="true"><i class="aisc-ico aisc-ico--image"></i></div>`
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
        // Empty state premium canonico (BaseView.emptyState, Figma 133:14). El CTA
        // "Explorar flujos" lo cablea setupEmptyStateCta tras inyectar el markup.
        if (window.BaseView && typeof window.BaseView.emptyState === 'function') {
            return window.BaseView.emptyState({
                iconSrc: '/recursos/icons/Production.svg',
                icon: 'aisc-ico aisc-ico--film',
                title: 'Aún no hay producción',
                subtitle: 'Elige un flujo y produce tu primer contenido. Tus imágenes, videos y textos aparecerán aquí listos para revisar, editar y publicar.',
                primaryLabel: 'Explorar flujos',
                primaryAction: 'flows',
            });
        }
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
     * Configura el botón "Explorar flujos" del estado vacío (navega al catalogo
     * de flujos con contexto org si aplica).
     */
    setupEmptyStateCta(container) {
        if (!container) return;
        const cta = container.querySelector('[data-action="flows"], [data-action="studio"], [data-living-empty-cta="studio"]');
        if (!cta || !window.router) return;
        cta.addEventListener('click', (e) => {
            e.preventDefault();
            const path = window.location.pathname || '';
            const base = path.startsWith('/org/') ? path.split('/').slice(0, 4).join('/') : '';
            const flowsPath = base ? `${base}/studio/flows` : '/studio/flows';
            window.router.navigate(flowsPath);
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
                case 'dismiss-pending': {
                    // Quita el skeleton de error del grid (el usuario ya leyo
                    // el mensaje). El error persiste en console.error para audit.
                    const clientId = actionEl.dataset.clientId || '';
                    if (clientId) {
                        this._removePendingEditCard(clientId);
                        try { this.renderHistorySection(); } catch (_) { /* noop */ }
                    }
                    break;
                }
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
                        icon.className = (!selected ? 'aisc-ico aisc-ico--check' : 'aisc-ico aisc-ico--circle');
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
                    this._closeAllKebabs(container);
                    const cd = card?.dataset.cardInfo;
                    if (cd) {
                        try {
                            const data = JSON.parse(cd
                                .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
                            await this.openProductionModal(data);
                        } catch (_) {}
                    }
                    this.openPublishSheet();
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
            bar.className = 'selbar';
            bar.innerHTML = `
                <div class="selbar-count">
                    <span class="selbar-thumb" id="selbarThumb" aria-hidden="true"></span>
                    <span class="selbar-count-text"></span>
                </div>
                <div class="selbar-actions">
                    <button type="button" class="selbar-btn" data-action="bulk-download"><i class="aisc-ico aisc-ico--dowload"></i><span>Descargar</span></button>
                    <button type="button" class="selbar-btn" data-action="bulk-publish"><i class="aisc-ico aisc-ico--upload"></i><span>Publicar todo</span></button>
                    <button type="button" class="selbar-btn" data-action="add-campaign"><i class="aisc-ico aisc-ico--campaign"></i><span>Agregar a campaña</span></button>
                    <button type="button" class="selbar-icon" data-action="bulk-like" aria-label="Me gusta"><i class="aisc-ico aisc-ico--likes"></i></button>
                    <button type="button" class="selbar-icon selbar-icon--danger" data-action="bulk-delete" aria-label="Eliminar"><i class="aisc-ico aisc-ico--delete"></i></button>
                    <button type="button" class="selbar-icon" data-action="clear-selection" aria-label="Cerrar"><i class="aisc-ico aisc-ico--close"></i></button>
                </div>`;
            document.body.appendChild(bar);
            bar.addEventListener('click', (e) => this._handleSelbarClick(e));
        }
        const countEl = bar.querySelector('.selbar-count-text');
        if (countEl) countEl.textContent = `${count} seleccionada${count === 1 ? '' : 's'}`;
        const thumb = bar.querySelector('#selbarThumb');
        if (thumb) {
            const url = this._selectionThumbUrl();
            thumb.style.backgroundImage = url ? `url("${url}")` : '';
        }
        bar.classList.toggle('is-visible', count > 0);
    }

    async _handleSelbarClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const ids = Array.from(this.selectedOutputs);
        switch (action) {
            case 'clear-selection': this._clearSelection(); break;
            case 'bulk-download': await this._bulkDownload(ids); break;
            case 'bulk-publish':
                if (ids.length) this.openPublishSheet(ids);
                break;
            case 'add-campaign': await this._openCampaignPicker(btn, ids); break;
            case 'bulk-like': await this._bulkLike(ids); break;
            case 'bulk-delete': {
                if (!ids.length) break;
                if (!confirm(`¿Eliminar ${ids.length} producción${ids.length === 1 ? '' : 'es'}? No se puede deshacer.`)) break;
                const n = await this.bulkDeleteOutputs(ids);
                if (n > 0) {
                    ids.forEach(id => document.querySelectorAll(`[data-output-id="${CSS.escape(id)}"]`).forEach(el => {
                        (el.closest('.living-masonry-item') || el.closest('.history-image-card, .history-video-card'))?.remove();
                    }));
                    this._updateSelectionBar();
                    window.showToast?.(`${n} producción${n === 1 ? '' : 'es'} eliminada${n === 1 ? '' : 's'}`);
                }
                break;
            }
        }
    }

    _selectionThumbUrl() {
        const first = Array.from(this.selectedOutputs)[0];
        if (!first) return '';
        const o = (this.flowOutputs || []).find(x => x?.id === first);
        return (o && this.resolveOutputMediaUrl(o)) || '';
    }

    async _bulkDownload(ids) {
        if (!ids.length) return;
        let n = 0;
        for (const id of ids) {
            const o = (this.flowOutputs || []).find(x => x?.id === id);
            const url = o ? this.resolveOutputMediaUrl(o) : null;
            if (url) { this.downloadImage(url); n++; await new Promise(r => setTimeout(r, 350)); }
        }
        window.showToast?.(n ? `Descargando ${n} producción${n === 1 ? '' : 'es'}…` : 'Nada que descargar');
    }

    async _bulkLike(ids) {
        if (!ids.length) return;
        let liked = 0;
        for (const id of ids) {
            if (!this.likedOutputs.has(id)) {
                const now = await this.toggleLike(id);
                if (now) {
                    liked++;
                    document.querySelectorAll(`[data-output-id="${CSS.escape(id)}"] .card-action--like`).forEach(el => {
                        el.classList.add('is-liked'); el.setAttribute('aria-pressed', 'true');
                    });
                }
            }
        }
        window.showToast?.(liked ? `${liked} marcada${liked === 1 ? '' : 's'} como me gusta` : 'Ya estaban marcadas');
    }

    async _openCampaignPicker(anchor, ids) {
        if (!ids.length) return;
        this._closeCampaignPicker();
        let campaigns = [];
        try {
            const { data } = await this.supabase
                .from('campaigns')
                .select('id,nombre_campana,status')
                .eq('organization_id', this.organizationId)
                .order('updated_at', { ascending: false })
                .limit(50);
            campaigns = data || [];
        } catch (_) {}

        const pop = document.createElement('div');
        pop.id = 'campaignPicker';
        pop.className = 'campaign-picker';
        const list = campaigns.length
            ? campaigns.map(c => `
                <button type="button" class="campaign-picker-item" data-campaign-id="${this.escapeHtml(c.id)}">
                    <i class="aisc-ico aisc-ico--campaign"></i>
                    <span class="campaign-picker-name">${this.escapeHtml(c.nombre_campana || 'Campaña')}</span>
                    ${c.status ? `<em class="campaign-picker-status">${this.escapeHtml(c.status)}</em>` : ''}
                </button>`).join('')
            : `<div class="campaign-picker-empty">No hay campañas en esta organizacion.</div>`;
        pop.innerHTML = `
            <div class="campaign-picker-head">Agregar ${ids.length} a una campaña</div>
            <div class="campaign-picker-list">${list}</div>`;
        document.body.appendChild(pop);

        const r = anchor.getBoundingClientRect();
        pop.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - pop.offsetWidth - 12))}px`;
        pop.style.bottom = `${window.innerHeight - r.top + 10}px`;

        pop.addEventListener('click', async (e) => {
            const item = e.target.closest('[data-campaign-id]');
            if (!item) return;
            const campaignId = item.dataset.campaignId;
            try {
                const { error } = await this.supabase
                    .from('runs_outputs').update({ campaign_id: campaignId }).in('id', ids);
                if (error) throw error;
                window.showToast?.(`${ids.length} agregada${ids.length === 1 ? '' : 's'} a la campaña`, { type: 'success' });
                this._closeCampaignPicker();
                this._clearSelection();
            } catch (err) {
                console.error('[campaign] add error:', err);
                window.showToast?.('No se pudo agregar a la campaña', { type: 'error' });
            }
        });
        this._campaignPickerOutside = (ev) => {
            if (!pop.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) this._closeCampaignPicker();
        };
        setTimeout(() => document.addEventListener('click', this._campaignPickerOutside), 0);
    }

    _closeCampaignPicker() {
        document.getElementById('campaignPicker')?.remove();
        if (this._campaignPickerOutside) {
            document.removeEventListener('click', this._campaignPickerOutside);
            this._campaignPickerOutside = null;
        }
    }

    _clearSelection() {
        this.selectedOutputs.clear();
        document.querySelectorAll('.card-select.is-selected').forEach(btn => {
            btn.classList.remove('is-selected');
            btn.setAttribute('aria-pressed', 'false');
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'aisc-ico aisc-ico--circle';
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

        // Fondo ambiente (lightbox): la MISMA media, desenfocada + oscurecida por
        // CSS, llena el contenedor izquierdo detras del asset nitido. El JS solo
        // alimenta el src; el blur/scrim viven en .pmodal-visual-bg-el / scrim.
        const bgImg = document.getElementById('pmodalBgImage');
        const bgVideo = document.getElementById('pmodalBgVideo');
        if (bgVideo) { bgVideo.pause(); bgVideo.removeAttribute('src'); bgVideo.load(); }
        if (mediaUrl && isVideo) {
            if (bgImg) { bgImg.hidden = true; bgImg.removeAttribute('src'); }
            if (bgVideo) {
                bgVideo.hidden = false;
                // Defer igual que el video principal: no descargar si se cierra al instante.
                requestAnimationFrame(() => {
                    if (!this._modalState || this._modalState.outputId !== outputId) return;
                    bgVideo.src = mediaUrl;
                    bgVideo.load();
                    bgVideo.play().catch(() => {});
                });
            }
        } else if (mediaUrl) {
            if (bgVideo) bgVideo.hidden = true;
            if (bgImg) { bgImg.hidden = false; bgImg.src = mediaUrl; }
        } else {
            if (bgImg) { bgImg.hidden = true; bgImg.removeAttribute('src'); }
            if (bgVideo) bgVideo.hidden = true;
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
            if (ic) ic.className = 'aisc-ico aisc-ico--likes';
            likeBtn.classList.toggle('is-liked', liked);
        }

        // Si el output abierto es PNG transparente (remove-bg) marcamos
        // el modal con clase para que el panel visual muestre glass-black
        // en vez de #0a0a0c solido. Asi la transparencia se percibe.
        {
            const meta = output?.metadata || {};
            const tp = output?.technical_params || {};
            const hasAlpha = meta.kind === 'image_remove_bg'
                || meta.has_alpha === true
                || tp.has_alpha === true;
            modal.classList.toggle('has-alpha-output', !!hasAlpha);
        }

        // Estado interno + abrir.
        this._modalState = {
            outputId, mediaUrl, prompt: (data?.prompt || ''), runId: run?.id,
            isVideo: !!isVideo,
            mediaType: isVideo ? 'video' : 'image',
            fileName: (output?.storage_path ? String(output.storage_path).split('/').pop() : (isVideo ? 'video.mp4' : 'imagen.png')),
            caption: (output?.generated_copy || data?.prompt || ''),
            brandContainerId: output?.brand_container_id || null,
            // Referencias para editar el copy (texto/CTA/hashtags) en su tabla.
            output, run
        };
        this._bindModalListenersOnce(modal);
        this._resetModalZoom(); // cada apertura/variante arranca a 100% centrado
        modal.classList.add('is-open');
        modal.inert = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('production-modal-open');
        document.getElementById('pmodalScroll')?.scrollTo(0, 0);
    }

    closeProductionModal() {
        const modal = document.getElementById('productionModal');
        if (!modal) return;
        // Si el focus actual esta dentro del modal, soltarlo ANTES de marcar
        // aria-hidden — sino el browser warning: "Blocked aria-hidden on an
        // element because its descendant retained focus".
        if (modal.contains(document.activeElement) && document.activeElement?.blur) {
            document.activeElement.blur();
        }
        const videoEl = document.getElementById('pmodalVideo');
        if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); }
        const imgEl = document.getElementById('pmodalImage');
        if (imgEl) { imgEl.removeAttribute('src'); imgEl.hidden = true; }
        // Liberar el fondo ambiente (img + video del halo).
        const bgVideoEl = document.getElementById('pmodalBgVideo');
        if (bgVideoEl) { bgVideoEl.pause(); bgVideoEl.removeAttribute('src'); bgVideoEl.load(); bgVideoEl.hidden = true; }
        const bgImgEl = document.getElementById('pmodalBgImage');
        if (bgImgEl) { bgImgEl.removeAttribute('src'); bgImgEl.hidden = true; }
        // Resetear zoom/paneo (limpia el transform de img/video).
        this._resetModalZoom();
        // Cerrar overlay de edicion si estaba abierto, liberando canvas y prompt.
        this._closeEditOverlay();
        if (this._siblingObserver) {
            try { this._siblingObserver.disconnect(); } catch (_) {}
            this._siblingObserver = null;
        }
        modal.classList.remove('is-open');
        // inert ANTES de aria-hidden: saca el foco de cualquier descendiente
        // (boton de toolbar) para no disparar el warning "aria-hidden on focused".
        modal.inert = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('production-modal-open');
        // Cerrar kebabs internos.
        modal.querySelectorAll('.pmodal-kebab-menu:not([hidden])').forEach(m => {
            m.hidden = true;
            m.previousElementSibling?.setAttribute('aria-expanded', 'false');
        });
        this._modalState = null;
    }

    // ── Publish Sheet ───────────────────────────────────────────────────────────
    // Hoja de publicacion a redes (Facebook/Instagram reales; YouTube/X/TikTok
    // "Proximamente"). El diseno vive en el Figma maqueta; estilos en living.css.

    _publishPlatformMeta() {
        const S = (p) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${p}</svg>`;
        return [
            { key: 'facebook',  label: 'Facebook',  tile: '#1877F2', logo: S('<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>') },
            { key: 'instagram', label: 'Instagram', gradient: true, logo: S('<path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.975.975 1.249 2.242 1.311 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.336 2.633-1.311 3.608-.975.975-2.242 1.249-3.608 1.311-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.336-3.608-1.311-.975-.975-1.249-2.242-1.311-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608.975-.975 2.242-1.249 3.608-1.311C8.416 2.175 8.796 2.163 12 2.163zm0 1.802c-3.15 0-3.523.012-4.767.069-.975.045-1.504.207-1.856.344-.466.181-.8.398-1.15.748-.35.35-.567.684-.748 1.15-.137.352-.3.881-.344 1.856-.057 1.244-.069 1.617-.069 4.767s.012 3.523.069 4.767c.045.975.207 1.504.344 1.856.181.466.398.8.748 1.15.35.35.684.567 1.15.748.352.137.881.3 1.856.344 1.244.057 1.617.069 4.767.069s3.523-.012 4.767-.069c.975-.045 1.504-.207 1.856-.344.466-.181.8-.398 1.15-.748.35-.35.567-.684.748-1.15.137-.352.3-.881.344-1.856.057-1.244.069-1.617.069-4.767s-.012-3.523-.069-4.767c-.045-.975-.207-1.504-.344-1.856-.181-.466-.398-.8-.748-1.15-.35-.35-.684-.567-1.15-.748-.352-.137-.881-.3-1.856-.344-1.244-.057-1.617-.069-4.767-.069zM12 6.865a5.135 5.135 0 1 0 0 10.27 5.135 5.135 0 0 0 0-10.27zm0 8.468a3.333 3.333 0 1 1 0-6.666 3.333 3.333 0 0 1 0 6.666zm6.538-8.671a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z"/>') },
            { key: 'youtube',   label: 'YouTube',   tile: '#FF0000', soon: true, logo: S('<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>') },
            { key: 'x',         label: 'X',         tile: '#09090b', soon: true, ring: true, logo: S('<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>') },
            { key: 'tiktok',    label: 'TikTok',    tile: '#09090b', soon: true, ring: true, logo: S('<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>') },
        ];
    }

    _ensurePublishSheet() {
        let sheet = document.getElementById('publishSheet');
        if (sheet) return sheet;
        sheet = document.createElement('div');
        sheet.id = 'publishSheet';
        sheet.className = 'publish-sheet';
        sheet.setAttribute('aria-hidden', 'true');
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.innerHTML = `
            <div class="publish-sheet-backdrop" data-pub="close"></div>
            <div class="publish-sheet-panel" role="document">
                <header class="publish-sheet-header">
                    <div class="publish-sheet-titles">
                        <h2 class="publish-sheet-title">Publicar produccion</h2>
                        <p class="publish-sheet-sub">Selecciona los destinos para este contenido</p>
                    </div>
                    <button type="button" class="publish-sheet-close" data-pub="close" aria-label="Cerrar"><i class="aisc-ico aisc-ico--close"></i></button>
                </header>
                <div class="publish-sheet-body">
                    <div class="publish-preview">
                        <div class="publish-preview-thumb" id="publishThumb"></div>
                        <div class="publish-preview-meta">
                            <div class="publish-preview-top">
                                <span class="publish-preview-name" id="publishFileName">archivo</span>
                                <span class="publish-type-chip" id="publishTypeChip">IMAGEN</span>
                            </div>
                            <span class="publish-preview-sub" id="publishMediaSub">listo para publicar</span>
                        </div>
                    </div>
                    <div class="publish-label">PUBLICAR EN</div>
                    <div class="publish-platforms" id="publishPlatforms"></div>
                    <div class="publish-label">MENSAJE</div>
                    <div class="publish-caption-wrap">
                        <textarea class="publish-caption" id="publishCaption" rows="3" maxlength="2200" placeholder="Escribe un mensaje para esta publicacion..."></textarea>
                        <span class="publish-caption-count" id="publishCaptionCount">0 / 2200</span>
                    </div>
                </div>
                <footer class="publish-sheet-footer">
                    <span class="publish-footer-count" id="publishFooterCount">0 destinos seleccionados</span>
                    <div class="publish-footer-btns">
                        <button type="button" class="publish-btn publish-btn--ghost" data-pub="close">Cancelar</button>
                        <button type="button" class="publish-btn publish-btn--primary" data-pub="submit" disabled>
                            <span>Publicar</span><span class="publish-btn-count" id="publishBtnCount">0</span>
                        </button>
                    </div>
                </footer>
            </div>`;
        document.body.appendChild(sheet);
        this._bindPublishSheetOnce(sheet);
        return sheet;
    }

    _bindPublishSheetOnce(sheet) {
        if (sheet._bound) return;
        sheet._bound = true;
        sheet.addEventListener('click', async (e) => {
            const el = e.target.closest('[data-pub]');
            if (el) {
                const act = el.dataset.pub;
                if (act === 'close') { this.closePublishSheet(); return; }
                if (act === 'submit') { await this._submitPublish(el); return; }
                if (act === 'toggle') {
                    const row = el.closest('.publish-platform');
                    const key = row?.dataset.platform;
                    if (!key || !this._publishCtx) return;
                    const on = !this._publishCtx.selected.has(key);
                    if (on) this._publishCtx.selected.add(key); else this._publishCtx.selected.delete(key);
                    el.classList.toggle('is-on', on);
                    el.setAttribute('aria-checked', on ? 'true' : 'false');
                    this._updatePublishSelectionUI();
                    return;
                }
                if (act === 'connect') {
                    this.closePublishSheet();
                    this.closeProductionModal?.();
                    if (window.router) {
                        const base = (this.organizationId && typeof window.getOrgPathPrefix === 'function')
                            ? window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') : '';
                        window.router.navigate(`${base}/brand`);
                    }
                    return;
                }
            }
        });
        const ta = sheet.querySelector('#publishCaption');
        if (ta) ta.addEventListener('input', () => { if (this._publishCtx) this._publishCtx.caption = ta.value; this._updatePublishCount(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sheet.classList.contains('is-open')) this.closePublishSheet();
        });
    }

    openPublishSheet(multiIds) {
        // Modo multiple: publicar todas las producciones seleccionadas a la vez
        // (caption compartido). El estado de conexion se lee del primer output.
        const isMulti = Array.isArray(multiIds) && multiIds.length > 0;
        let st;
        if (isMulti) {
            const first = (this.flowOutputs || []).find(o => o?.id === multiIds[0]) || null;
            st = {
                outputId: multiIds[0],
                mediaUrl: first ? (this.resolveOutputMediaUrl(first) || '') : '',
                isVideo: false, mediaType: 'image',
                fileName: `${multiIds.length} producciones`,
                caption: '', brandContainerId: first?.brand_container_id || null
            };
        } else {
            st = this._modalState;
        }
        if (!st || !st.outputId) { if (typeof window.showToast === 'function') window.showToast('Abre una produccion para publicar'); return; }
        this._publishCtx = {
            outputId: st.outputId,
            outputIds: isMulti ? multiIds.slice() : null,
            multi: isMulti,
            mediaUrl: st.mediaUrl, mediaType: st.mediaType, isVideo: !!st.isVideo,
            fileName: st.fileName || (st.isVideo ? 'video.mp4' : 'imagen.png'),
            caption: st.caption || '', brandContainerId: st.brandContainerId || null,
            selected: new Set(), connections: null
        };
        const sheet = this._ensurePublishSheet();

        // Preview
        const thumb = sheet.querySelector('#publishThumb');
        if (thumb) {
            thumb.classList.toggle('is-video', !!st.isVideo);
            if (st.isVideo) { thumb.style.backgroundImage = ''; thumb.innerHTML = '<i class="aisc-ico aisc-ico--play"></i>'; }
            else { thumb.innerHTML = ''; thumb.style.backgroundImage = st.mediaUrl ? `url("${st.mediaUrl}")` : ''; }
        }
        sheet.querySelector('#publishFileName').textContent = this._publishCtx.fileName;
        sheet.querySelector('#publishTypeChip').textContent = isMulti ? `${multiIds.length}` : (st.isVideo ? 'VIDEO' : 'IMAGEN');
        sheet.querySelector('#publishMediaSub').textContent = isMulti
            ? 'se publicaran todas las seleccionadas'
            : (st.isVideo ? 'video · listo para publicar' : 'imagen · lista para publicar');

        const ta = sheet.querySelector('#publishCaption');
        if (ta) ta.value = this._publishCtx.caption;
        this._updatePublishCount();

        // Estado de carga inicial
        this._renderPublishPlatforms(null);
        this._updatePublishSelectionUI();

        sheet.classList.add('is-open');
        sheet.inert = false;
        sheet.setAttribute('aria-hidden', 'false');
        document.body.classList.add('publish-sheet-open');
        // Mover el foco a la hoja (el dialogo activo) para que no quede atrapado
        // en un boton del modal de produccion que esta detras.
        sheet.querySelector('.publish-sheet-close')?.focus();

        this._loadPublishConnections();
    }

    closePublishSheet() {
        const sheet = document.getElementById('publishSheet');
        if (!sheet) return;
        if (sheet.contains(document.activeElement) && document.activeElement?.blur) document.activeElement.blur();
        sheet.classList.remove('is-open');
        sheet.inert = true;
        sheet.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('publish-sheet-open');
    }

    async _loadPublishConnections() {
        const ctx = this._publishCtx;
        if (!ctx) return;
        try {
            const token = await this._getAccessToken();
            if (!token) throw new Error('No hay sesion activa');
            const res = await fetch(`/.netlify/functions/api-social-publish?output_id=${encodeURIComponent(ctx.outputId)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            ctx.connections = data.connections || {};
            // Pre-seleccionar las plataformas reales conectadas.
            ctx.selected = new Set(['facebook', 'instagram'].filter(k => ctx.connections[k]?.connected));
            this._renderPublishPlatforms(ctx.connections);
            this._updatePublishSelectionUI();
        } catch (err) {
            console.error('[publish] status error:', err);
            this._renderPublishPlatforms({});
            this._updatePublishSelectionUI();
        }
    }

    _renderPublishPlatforms(connections) {
        const wrap = document.getElementById('publishPlatforms');
        if (!wrap) return;
        const ctx = this._publishCtx || {};
        const loading = connections === null;
        const rows = this._publishPlatformMeta().map(p => {
            const conn = (connections && connections[p.key]) || {};
            const connected = !!conn.connected;
            const selected = ctx.selected?.has(p.key);
            const tileStyle = p.gradient
                ? 'background:linear-gradient(45deg,#f9ce34 0%,#ee2a7b 45%,#6a29c9 100%)'
                : `background:${p.tile}`;
            let right;
            if (loading) {
                right = '<span class="publish-platform-skel"></span>';
            } else if (p.soon) {
                right = '<span class="publish-coming">Proximamente</span>';
            } else if (connected) {
                right = `<button type="button" class="publish-toggle ${selected ? 'is-on' : ''}" data-pub="toggle" role="switch" aria-checked="${selected ? 'true' : 'false'}"><span class="publish-toggle-knob"></span></button>`;
            } else {
                right = '<button type="button" class="publish-connect" data-pub="connect">Conectar</button>';
            }
            const handle = loading ? '' : (p.soon
                ? (p.key === 'youtube' || p.key === 'tiktok' ? 'Solo video' : 'Proximamente')
                : (connected ? this.escapeHtml(conn.account_name || 'Conectado') : 'Sin conectar'));
            const disabledCls = (p.soon || (!loading && !connected)) ? 'is-disabled' : '';
            return `
                <div class="publish-platform ${disabledCls}" data-platform="${p.key}">
                    <div class="publish-platform-left">
                        <span class="publish-platform-tile ${p.ring ? 'has-ring' : ''}" style="${tileStyle}">${p.logo}</span>
                        <span class="publish-platform-text">
                            <span class="publish-platform-name">${p.label}</span>
                            <span class="publish-platform-handle">${handle}</span>
                        </span>
                    </div>
                    <div class="publish-platform-right">${right}</div>
                </div>`;
        }).join('');
        wrap.innerHTML = rows;
    }

    _updatePublishCount() {
        const ta = document.getElementById('publishCaption');
        const cnt = document.getElementById('publishCaptionCount');
        if (ta && cnt) cnt.textContent = `${ta.value.length} / 2200`;
    }

    _updatePublishSelectionUI() {
        const ctx = this._publishCtx;
        const n = ctx?.selected?.size || 0;
        const footer = document.getElementById('publishFooterCount');
        const btnCount = document.getElementById('publishBtnCount');
        const btn = document.querySelector('#publishSheet .publish-btn--primary');
        if (footer) footer.textContent = n === 1 ? '1 destino seleccionado' : `${n} destinos seleccionados`;
        if (btnCount) btnCount.textContent = String(n);
        if (btn) btn.disabled = n === 0;
    }

    async _submitPublish(btn) {
        const ctx = this._publishCtx;
        if (!ctx || !ctx.selected.size) return;
        const platforms = [...ctx.selected];
        const caption = document.getElementById('publishCaption')?.value || ctx.caption || '';
        const ids = (ctx.outputIds && ctx.outputIds.length) ? ctx.outputIds : [ctx.outputId];
        const multi = ids.length > 1;
        if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
        const loadingToast = window.showToast?.(multi ? `Publicando ${ids.length}…` : 'Publicando…', { duration: 0 });
        try {
            const token = await this._getAccessToken();
            if (!token) throw new Error('No hay sesion activa');
            const all = [];
            for (const oid of ids) {
                const res = await fetch('/.netlify/functions/api-social-publish', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ output_id: oid, platforms, caption })
                });
                const data = await res.json().catch(() => ({}));
                if (res.status === 401) throw new Error('Sesion expirada, vuelve a entrar');
                (Array.isArray(data.results) ? data.results : []).forEach(r => all.push({ ...r, output_id: oid }));
            }
            loadingToast?.close?.();
            const ok   = all.filter(r => r.status === 'published');
            const fail = all.filter(r => r.status === 'failed');
            const soon = all.filter(r => r.status === 'not_implemented');

            // Diagnostico explicito en consola: exito (con link) y error (mensaje de Meta).
            console.log('[publish] resultados:', all);
            ok.forEach(r => console.log(`[publish] ✅ ${r.platform}: ${r.remote_url || r.remote_post_id || 'publicado'}`));
            fail.forEach(r => console.error(`[publish] ❌ ${r.platform}: ${r.error || 'fallo desconocido'}`));

            if (ok.length) {
                window.showToast?.(multi ? 'Producciones publicadas' : 'Produccion publicada', { type: 'success' });
                this._renderPublishResult(ok, fail, multi);
            } else if (fail.length) {
                window.showToast?.(`Error en ${fail[0].platform}: ${fail[0].error || 'fallo'}`, { type: 'error' });
            } else if (soon.length) {
                window.showToast?.('Esas plataformas llegan pronto');
            } else {
                window.showToast?.('No se pudo publicar', { type: 'error' });
            }
        } catch (err) {
            loadingToast?.close?.();
            console.error('[publish] error:', err);
            window.showToast?.(`No se pudo publicar: ${err.message}`, { type: 'error' });
        } finally {
            if (btn) { btn.classList.remove('is-loading'); btn.disabled = (this._publishCtx?.selected?.size || 0) === 0; }
        }
    }

    // Estado de exito dentro de la hoja: "Produccion publicada" + link(s) o resumen.
    _renderPublishResult(ok, fail, multi) {
        const sheet = document.getElementById('publishSheet');
        if (!sheet) return;
        const body = sheet.querySelector('.publish-sheet-body');
        const footer = sheet.querySelector('.publish-sheet-footer');
        const labelMap = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', x: 'X', tiktok: 'TikTok' };
        let links;
        if (multi) {
            // Resumen por plataforma (varias producciones → no listamos cada link).
            const byPlat = {};
            (ok || []).forEach(r => { byPlat[r.platform] = (byPlat[r.platform] || 0) + 1; });
            links = Object.entries(byPlat).map(([p, n]) =>
                `<span class="publish-result-link is-static"><i class="aisc-ico aisc-ico--check"></i> ${n} en ${labelMap[p] || p}</span>`).join('');
        } else {
            links = (ok || []).map(r => {
                const label = labelMap[r.platform] || r.platform;
                return r.remote_url
                    ? `<a class="publish-result-link" href="${this.escapeHtml(r.remote_url)}" target="_blank" rel="noopener noreferrer"><i class="aisc-ico aisc-ico--external-link"></i> Ver en ${label}</a>`
                    : `<span class="publish-result-link is-static"><i class="aisc-ico aisc-ico--check"></i> Publicado en ${label}</span>`;
            }).join('');
        }
        const failNote = (fail && fail.length)
            ? `<p class="publish-result-fail">${fail.length} no se pudo${fail.length === 1 ? '' : 'ieron'} publicar.</p>`
            : '';
        if (body) body.innerHTML = `
            <div class="publish-result">
                <div class="publish-result-check"><i class="aisc-ico aisc-ico--check"></i></div>
                <h3 class="publish-result-title">${multi ? 'Producciones publicadas' : 'Produccion publicada'}</h3>
                <div class="publish-result-links">${links}</div>
                ${failNote}
            </div>`;
        if (footer) footer.innerHTML = `
            <span class="publish-footer-count"></span>
            <div class="publish-footer-btns">
                <button type="button" class="publish-btn publish-btn--primary" data-pub="close"><span>Listo</span></button>
            </div>`;
    }

    /**
     * Renderiza el "prompt" del output como bloques labeled Notion-style.
     * Acepta:
     *   - String plano → 1 bloque "Prompt"
     *   - JSON string (incluso doblemente escapado) con campos
     *     {headline, subline, body, copy, typography_notes, ...} → 1 bloque
     *     por campo, label humanizado, value preservando saltos de línea.
     * Debajo del copy anexa los hashtags generados como chips. El prompt
     * técnico crudo NO se muestra aqui: vive en el tab Briefing (PROMPT).
     */
    _renderModalPrompt(rawCopyOrPrompt, output, run) {
        const container = document.getElementById('pmodalPromptBlocks');
        if (!container) return;

        // Resultado = COPY de marketing. Copy + CTA + hashtags viven en UNA sola
        // zona editable y copiable como una unidad. El prompt tecnico va al Briefing.
        const source = output?.generated_copy || output?.text_content || '';
        const blocks = this._parsePromptBlocks(source);
        const copyPlain = blocks.map(b => b.value).join('\n\n').trim();

        const tp = this._safeParseJSON(output?.technical_params) || {};
        const meta = this._safeParseJSON(output?.metadata) || {};
        const cta = String(tp.cta || meta.cta || '').trim();
        const hashtags = this._normalizeHashtags(output?.generated_hashtags);
        const outputId = output?.id || this._modalState?.outputId || '';
        const table = this._outputSourceTable(outputId);

        // Estado del copy para copiar/editar/guardar (leido por los handlers).
        this._modalCopy = { outputId, table, text: copyPlain, cta, hashtags };

        // Ediciones (system_ai_outputs) sin copy: no mostramos la zona.
        if (!(copyPlain || cta || hashtags.length) && table !== 'runs_outputs') {
            container.innerHTML = '';
            return;
        }

        const bodyView = (blocks.length > 1)
            ? blocks.map(b => `
                <div class="pmodal-copy-block">
                    <span class="pmodal-copy-block-label">${this.escapeHtml(b.label)}</span>
                    <div class="pmodal-copy-text">${this.escapeHtml(b.value)}</div>
                </div>`).join('')
            : `<div class="pmodal-copy-text">${copyPlain
                ? this.escapeHtml(copyPlain)
                : '<span class="pmodal-prompt-empty">Sin copy registrado.</span>'}</div>`;
        const ctaView = cta
            ? `<div class="pmodal-copy-cta"><span class="pmodal-copy-cta-label">CTA</span><span>${this.escapeHtml(cta)}</span></div>`
            : '';
        const hashView = hashtags.length
            ? `<div class="pmodal-hashtags">${hashtags.map(h =>
                `<span class="pmodal-hashtag-chip">${this.escapeHtml(h)}</span>`).join('')}</div>`
            : '';

        container.innerHTML = `
            <div class="pmodal-copy-card" id="pmodalCopyCard">
                <div class="pmodal-copy-head">
                    <span class="pmodal-section-title"><i class="aisc-ico aisc-ico--quote"></i> COPY</span>
                    <div class="pmodal-copy-actions">
                        <button type="button" class="pmodal-copy-iconbtn" data-action="edit-copy" title="Editar" aria-label="Editar copy"><i class="aisc-ico aisc-ico--edit"></i></button>
                        <button type="button" class="pmodal-copy-iconbtn" data-action="copy-copyzone" title="Copiar" aria-label="Copiar copy"><i class="aisc-ico aisc-ico--copy"></i></button>
                    </div>
                </div>
                <div class="pmodal-copy-view" data-copy-view>
                    ${bodyView}
                    ${ctaView}
                    ${hashView}
                </div>
                <div class="pmodal-copy-edit" data-copy-edit hidden>
                    <label class="pmodal-copy-field-label">Copy</label>
                    <textarea class="pmodal-copy-input" data-copy-field="text" rows="4" placeholder="Escribe el copy...">${this.escapeHtml(copyPlain)}</textarea>
                    <label class="pmodal-copy-field-label">CTA</label>
                    <input type="text" class="pmodal-copy-input" data-copy-field="cta" placeholder="Llamado a la accion" value="${this.escapeHtml(cta)}">
                    <label class="pmodal-copy-field-label">Hashtags</label>
                    <textarea class="pmodal-copy-input" data-copy-field="hashtags" rows="2" placeholder="#uno #dos #tres">${this.escapeHtml(hashtags.join(' '))}</textarea>
                    <div class="pmodal-copy-edit-actions">
                        <button type="button" class="pmodal-copy-btn" data-action="cancel-copy">Cancelar</button>
                        <button type="button" class="pmodal-copy-btn pmodal-copy-btn--primary" data-action="save-copy">Guardar</button>
                    </div>
                </div>
            </div>`;

        // El prompt tecnico crudo ya vive en el tab Briefing (seccion PROMPT).
    }

    /** Tabla de origen de un output (runs_outputs por defecto; system_ai_outputs si esta ahi). */
    _outputSourceTable(outputId) {
        return (this.systemAiOutputs || []).some(o => o?.id === outputId)
            ? 'system_ai_outputs' : 'runs_outputs';
    }

    /** Aplica un patch a la copia local del output en las 3 fuentes de historial. */
    _patchLocalOutput(outputId, patch) {
        const apply = arr => (arr || []).forEach(o => { if (o?.id === outputId) Object.assign(o, patch); });
        apply(this.flowOutputs);
        apply(this.latestGeneratedContent);
        apply(this.systemAiOutputs);
    }

    /**
     * Guarda la edicion del copy (texto + CTA + hashtags) del output abierto en
     * su tabla de origen, parchea las caches locales y re-renderiza la zona en
     * modo vista. CTA vive en technical_params.cta (merge, no reemplaza el resto).
     */
    async _saveModalCopy(modal, btn) {
        const c = this._modalCopy;
        const state = this._modalState || {};
        if (!c || !c.outputId || !this.supabase) return;
        const ed = modal.querySelector('#pmodalCopyCard [data-copy-edit]');
        if (!ed) return;
        const text = (ed.querySelector('[data-copy-field="text"]')?.value || '').trim();
        const ctaVal = (ed.querySelector('[data-copy-field="cta"]')?.value || '').trim();
        const hashtags = this._normalizeHashtags(ed.querySelector('[data-copy-field="hashtags"]')?.value || '');

        if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

        const output = state.output || {};
        const tp = this._safeParseJSON(output.technical_params) || {};
        const newTp = { ...tp };
        if (ctaVal) newTp.cta = ctaVal; else delete newTp.cta;
        const update = { generated_copy: text, generated_hashtags: hashtags, technical_params: newTp };

        try {
            // eslint-disable-next-line no-restricted-syntax -- update puntual del copy; el resto del modal ya usa supabase directo (misma deuda)
            const { error } = await this.supabase.from(c.table).update(update).eq('id', c.outputId);
            if (error) throw error;
        } catch (err) {
            if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
            if (typeof window.showToast === 'function') window.showToast('No se pudo guardar: ' + (err?.message || 'error'), { type: 'error' });
            return;
        }

        this._patchLocalOutput(c.outputId, { generated_copy: text, generated_hashtags: hashtags, technical_params: newTp });
        if (state.output) {
            state.output.generated_copy = text;
            state.output.generated_hashtags = hashtags;
            state.output.technical_params = newTp;
        }
        state.caption = text || state.caption;
        this._renderModalPrompt(text, state.output, null);
        if (typeof window.showToast === 'function') window.showToast('Copy actualizado');
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

        // Si después de los parses sigue siendo string → un solo bloque "Copy".
        // (Resultado = copy de marketing; el prompt tecnico vive en Briefing.)
        if (typeof value === 'string') {
            const s = value.trim();
            return s ? [{ label: 'Copy', value: s }] : [];
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
        const quality = tp.resolution || tp.quality || meta.quality || meta.resolution_tier || (meta.is_4k ? '4K' : '');
        const aspect = tp.aspect_ratio || meta.aspect_ratio || '';
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
        const kind = this._deriveProductionKind(output);
        const language = this._humanizeLang(tp.language || meta.language || '');
        const composition = tp.composition_mode || meta.composition_mode || '';
        const gradient = this._formatGradient(tp.background_gradient || meta.background_gradient);
        // Campania y audiencia: nombres vienen de los joins de loadFlowRuns
        // (campaigns(nombre_campana), audience_personas(name)). Si el run no
        // estaba ligado a ninguna (campaign_id/persona_id null) NO se muestra la
        // fila — nada de casillas en "—".
        const campaignName = run?.campaigns?.nombre_campana || (run?.campaign_id ? 'Sin nombre' : '');
        const audienceName = run?.audience_personas?.name || (run?.persona_id ? 'Sin nombre' : '');

        // Renderizado especial para modelos: chips en lugar de texto plano.
        const modelsHtml = models.length
            ? `<span class="pmodal-info-models">${models.map(m =>
                `<span class="pmodal-model-chip">${this.escapeHtml(m)}</span>`
              ).join('')}</span>`
            : '';

        // Solo filas con valor real. Nunca placeholders en "—".
        const rows = [
            kind ? ['Tipo', kind, null] : null,
            flowName ? ['Flow', flowName, null] : null,
            campaignName ? ['Campana', campaignName, null] : null,
            audienceName ? ['Audiencia', audienceName, null] : null,
            aspect ? ['Formato', String(aspect), null] : null,
            quality ? ['Resolucion', String(quality), null] : null,
            size ? ['Size', size, null] : null,
            composition ? ['Composicion', this._cap(composition), null] : null,
            gradient ? ['Fondo', null, gradient.html] : null,
            language ? ['Idioma', language, null] : null,
            models.length ? [models.length > 1 ? 'Modelos' : 'Modelo', null, modelsHtml] : null,
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
     * Tipo de produccion legible (Imagen / Video / Texto). output_type suele venir
     * generico ("ai_content") en outputs de flow, asi que si no es explicito lo
     * inferimos por la extension del archivo (storage_path / metadata.storage_path).
     */
    _deriveProductionKind(output) {
        const t = String(output?.output_type || '').toLowerCase();
        if (t.includes('video') || t.includes('reel') || t.includes('clip')) return 'Video';
        if (t.includes('image') || t.includes('img')) return 'Imagen';
        if (t.includes('text') || t.includes('copy')) return 'Texto';
        const path = String(output?.storage_path
            || this._safeParseJSON(output?.metadata)?.storage_path || '').toLowerCase();
        if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(path)) return 'Video';
        if (/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/.test(path)) return 'Imagen';
        if (path) return 'Imagen';
        return output?.text_content || output?.generated_copy ? 'Texto' : '';
    }

    /** Codigo de idioma -> nombre legible. Fallback: el codigo en mayusculas. */
    _humanizeLang(code) {
        const c = String(code || '').trim().toLowerCase();
        if (!c) return '';
        const map = { es: 'Espanol', en: 'Ingles', pt: 'Portugues', fr: 'Frances', de: 'Aleman', it: 'Italiano' };
        return map[c] || c.toUpperCase();
    }

    /** Capitaliza la primera letra. */
    _cap(s) {
        const str = String(s || '');
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }

    /**
     * Formatea background_gradient (jsonb) a una fila con swatch + texto. Valida
     * que los stops sean hex antes de inyectarlos en un style inline. Devuelve
     * { html } o null.
     */
    _formatGradient(g) {
        if (!g || typeof g !== 'object') return null;
        const stops = Array.isArray(g.stops)
            ? g.stops.filter(s => /^#[0-9a-fA-F]{3,8}$/.test(String(s)))
            : [];
        if (stops.length < 2) return null;
        const isRadial = String(g.type || 'linear').toLowerCase() === 'radial';
        const angle = Number.isFinite(+g.angle) ? Math.round(+g.angle) : 90;
        const css = isRadial
            ? `radial-gradient(circle, ${stops.join(', ')})`
            : `linear-gradient(${angle}deg, ${stops.join(', ')})`;
        const label = isRadial ? 'Radial' : `Lineal ${angle}°`;
        const html = `<span class="pmodal-info-value pmodal-gradient-val">`
            + `<span class="pmodal-gradient-swatch" style="background:${css}"></span>`
            + `<span>${this.escapeHtml(label)} · ${stops.map(s => this.escapeHtml(s)).join(' → ')}</span>`
            + `</span>`;
        return { html };
    }

    /** Normaliza generated_hashtags (array o string) a ['#tag', ...]. */
    _normalizeHashtags(raw) {
        let arr = raw;
        if (typeof arr === 'string') arr = this._safeParseJSON(arr) || arr.split(',');
        if (!Array.isArray(arr)) return [];
        return arr.map(h => {
            const s = String(h || '').trim();
            if (!s) return '';
            return s.startsWith('#') ? s : `#${s}`;
        }).filter(Boolean);
    }

    /** Markdown minimo y seguro: **negrita** y saltos de linea. Escapa primero. */
    _lightMarkdown(text) {
        return this.escapeHtml(String(text || ''))
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
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
    /**
     * Extrae el producto/servicio usado desde el input_data de un flow. El
     * selector de Studio guarda el objeto COMPLETO anidado (tipicamente bajo
     * `image_selector`), no al nivel raiz: el nombre en `nombre_producto`, las
     * imagenes en `images[]` ordenadas por `image_order`, la categoria en
     * `tipo_producto`. Por eso el Briefing no mostraba el producto aunque SI
     * quedaba guardado. Devuelve { name, image, category } o null.
     */
    _extractProductSelector(data) {
        if (!data || typeof data !== 'object') return null;
        // Candidatos: la clave conocida image_selector primero, luego cualquier
        // objeto anidado con forma de producto/servicio.
        const candidates = [];
        if (data.image_selector && typeof data.image_selector === 'object') candidates.push(data.image_selector);
        for (const v of Object.values(data)) {
            if (v && typeof v === 'object' && !Array.isArray(v) && v !== data.image_selector
                && (v.nombre_producto || v.nombre_servicio || (Array.isArray(v.images) && v.images.length))) {
                candidates.push(v);
            }
        }
        for (const sel of candidates) {
            if (!sel || typeof sel !== 'object') continue;
            const name = sel.nombre_producto || sel.nombre_servicio || sel.name || sel.product_name || '';
            const images = Array.isArray(sel.images)
                ? [...sel.images]
                    .sort((a, b) => (a?.image_order ?? 99) - (b?.image_order ?? 99))
                    .map(x => x?.image_url || x?.url)
                    .filter(Boolean)
                : [];
            const image = sel.image_url || sel.hero_image_url || images[0] || '';
            const rawCat = sel.tipo_producto || sel.tipo_servicio || sel.entity_type || '';
            const category = rawCat ? (String(rawCat).charAt(0).toUpperCase() + String(rawCat).slice(1)) : '';
            if (name || image || images.length) {
                return { name: name || 'Producto', image, category, images: images.length ? images : (image ? [image] : []) };
            }
        }
        return null;
    }

    /**
     * En un run con VARIOS productos (batch de Studio) hay una fila runs_inputs
     * por producto pero cada output corresponde a UNO. La verdad de cual producto
     * uso este output esta en su reference_image_url, cuyo path lleva el product
     * id: product-images/{marca}/{PRODUCT_ID}/{archivo}. Elegimos la fila de input
     * cuyo image_selector coincide con ese producto; si no hay match (runs de un
     * solo producto o legacy) caemos a la primera fila del run.
     */
    _selectInputRowForOutput(run, output) {
        const rows = (this.flowInputs || []).filter(i => i?.run_id === run?.id);
        if (rows.length <= 1) return rows[0] || null;
        const productId = this._productIdFromProductImageUrl(output?.reference_image_url)
            || output?.entity_id || null;
        if (productId) {
            const match = rows.find(r => {
                const d = this._safeParseJSON(r.input_data) || r.input_data || {};
                const sel = d.image_selector || {};
                if (sel.id && String(sel.id) === String(productId)) return true;
                if (sel.entity_id && String(sel.entity_id) === String(productId)) return true;
                const imgs = Array.isArray(sel.images) ? sel.images : [];
                return imgs.some(im => typeof im?.image_url === 'string' && im.image_url.includes(`/${productId}/`));
            });
            if (match) return match;
        }
        return rows[0];
    }

    /** Extrae el product id (uuid) del path product-images/{marca}/{id}/... */
    _productIdFromProductImageUrl(url) {
        if (!url || typeof url !== 'string') return null;
        const m = url.match(/product-images\/[^/]+\/([0-9a-fA-F-]{36})\//);
        return m ? m[1] : null;
    }

    _renderModalInput(run, output) {
        const container = document.getElementById('pmodalInputContent');
        if (!container) return;
        const inputRow = this._selectInputRowForOutput(run, output);
        let data = this._safeParseJSON(inputRow?.input_data) || inputRow?.input_data || null;

        // El prompt tecnico (prompt_used del output) se muestra en el Briefing.
        const promptText = (output?.prompt_used && String(output.prompt_used).trim() && String(output.prompt_used).trim().toLowerCase() !== 'completed')
            ? String(output.prompt_used) : '';
        // Concepto creativo: razonamiento de la IA (verdad del producto + concepto
        // de render), colapsable al final del Briefing.
        const rationaleRaw = (typeof output?.creative_rationale === 'string') ? output.creative_rationale.trim() : '';
        const noData = !data || (typeof data === 'object' && Object.keys(data).length === 0);

        if (noData && !promptText && !rationaleRaw) {
            container.innerHTML = `
                <div class="pmodal-input-empty">
                    <i class="aisc-ico aisc-ico--inbox" aria-hidden="true"></i>
                    <p>No quedo registrado el briefing de esta produccion.</p>
                    <p class="pmodal-input-empty-hint">Las producciones nuevas guardan automaticamente todo lo que usaste para crearlas.</p>
                </div>`;
            return;
        }
        if (noData) data = {};

        // 1) Entidad (producto / servicio / lugar)
        // El producto usado puede venir denormalizado al nivel raiz (flows viejos)
        // o anidado en el selector de imagenes (image_selector) que arman los flows
        // de Studio: nombre en `nombre_producto`, imagenes en `images[]` ordenadas
        // por `image_order`. Buscamos en ambos para no perder el producto.
        const productSel = this._extractProductSelector(data);
        const entityName = data.entity_name || data.product_name || data.service_name || data.place_name
            || productSel?.name || '';
        const entityImg = data.entity_image_url || data.product_image_url || data.image_url
            || productSel?.image || '';
        const entityType = data.entity_type || (productSel ? 'Producto' : (entityName ? 'Entidad' : null));
        const entityCategory = productSel?.category || '';

        // 2) Referencias adjuntadas (imagenes / archivos)
        const refs = []
            .concat(Array.isArray(data.reference_images) ? data.reference_images : [])
            .concat(Array.isArray(data.references) ? data.references : [])
            .concat(Array.isArray(data.mood_images) ? data.mood_images : [])
            .concat(data.reference_image_url ? [data.reference_image_url] : [])
            .filter(Boolean);

        // 2b) Identidades usadas (productos/marcas) como carrusel con preview chiquita
        const identities = Array.isArray(data.identities) ? data.identities : [];

        // 3) Briefing
        const briefing = data.briefing || data.brief || data.user_brief || data.instructions || '';

        // 4) Audiencia / Campania (mostradas tambien como chips)
        const audienceName = data.persona_name || data.audience_name || run?.audience_personas?.name || '';
        const campaignName = data.campaign_name || run?.campaigns?.nombre_campana || '';

        // 5) PARAMETROS: solo escalares con sentido. Nunca dumps de objetos/arrays ni plumbing interno del motor.
        const HIDDEN_KEYS = new Set([
            'entity_id','entity_name','entity_image_url','entity_type',
            'product_id','product_name','product_image_url','image_url',
            'service_id','service_name','place_id','place_name',
            'reference_images','references','mood_images','reference_image_url',
            'briefing','brief','user_brief','instructions',
            'persona_id','persona_name','audience_id','audience_name','audience_ids',
            'campaign_id','campaign_ids','campaign_name','brief_id',
            'identities','productos','referencias_estilo',
            // aspect_ratio ya se muestra como "Formato" en el tab Resultado
            // (INFORMATION); no lo duplicamos aqui en PARAMETROS.
            'aspect_ratio'
        ]);
        // Plumbing del contexto del motor — jamas se muestra como parametro.
        const PLUMBING_KEYS = new Set([
            'meta','user','credits','entities','products','services',
            'brand_fonts','brand_assets','brand_colors','brand_places','brand_characters',
            'brand_identity','brand_identities','brand_entities','previous_trends',
            'schedule_config','context','raw','payload','captured_from','flow_name',
            'flow_id','flow_slug','org_id','organization_id','user_id',
            'schedule_id','run_id','brand_id','brand_container_id'
        ]);
        const PARAM_LABELS = {
            aspect_ratio: 'Aspect Ratio', output_count: 'Salidas', num_outputs: 'Salidas',
            language: 'Idioma', tone: 'Tono', resolution: 'Resolucion', model: 'Modelo',
            format: 'Formato', duration: 'Duracion', quality: 'Calidad', style: 'Estilo',
            generar_video: 'Video', nota: 'Nota'
        };
        const extraRows = Object.entries(data)
            .filter(([k, v]) => !HIDDEN_KEYS.has(k) && !PLUMBING_KEYS.has(k)
                && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
                && String(v).trim() !== '' && String(v).length <= 80)
            .map(([k, v]) => {
                const label = PARAM_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const valStr = (typeof v === 'boolean') ? (v ? 'Si' : 'No') : String(v);
                return `<div class="pmodal-input-row">
                    <span class="pmodal-info-label">${this.escapeHtml(label)}</span>
                    <span class="pmodal-info-value pmodal-input-row-val">${this.escapeHtml(valStr)}</span>
                </div>`;
            }).join('');

        const productImages = (productSel?.images && productSel.images.length)
            ? productSel.images
            : (entityImg ? [entityImg] : []);
        const entityHtml = entityName
            ? `<section class="pmodal-section pmodal-input-entity">
                <h3 class="pmodal-section-title"><i class="aisc-ico aisc-ico--product"></i> ${this.escapeHtml(entityType || 'Entidad')}</h3>
                <div class="pmodal-entity-head">
                    <p class="pmodal-entity-name">${this.escapeHtml(entityName)}</p>
                    ${(entityCategory || entityType) ? `<p class="pmodal-entity-type">${this.escapeHtml(entityCategory || entityType)}</p>` : ''}
                </div>
                ${productImages.length
                    ? `<div class="pmodal-entity-carousel" role="list">
                        ${productImages.map((u, i) => `
                            <a class="pmodal-entity-shot" role="listitem" href="${this.escapeHtml(u)}" target="_blank" rel="noopener" aria-label="${this.escapeHtml(entityName)} — imagen ${i + 1}">
                                <img src="${this.escapeHtml(u)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none';this.parentElement.classList.add('pmodal-entity-shot--broken');this.parentElement.setAttribute('aria-disabled','true');this.parentElement.removeAttribute('href');this.parentElement.insertAdjacentHTML('beforeend','<i class=\\'aisc-ico aisc-ico--product\\'></i>');">
                            </a>`).join('')}
                    </div>`
                    : `<div class="pmodal-entity-card">
                        <div class="pmodal-entity-img pmodal-entity-img--empty" aria-hidden="true"><i class="aisc-ico aisc-ico--product"></i></div>
                    </div>`
                }
            </section>`
            : '';

        const identitiesHtml = identities.length
            ? `<section class="pmodal-section pmodal-input-identities">
                <h3 class="pmodal-section-title"><i class="aisc-ico aisc-ico--key"></i> IDENTIDADES (${identities.length})</h3>
                <div class="pmodal-refs-grid">
                    ${identities.map((it) => {
                        const nm = this.escapeHtml(it.name || it.entity_name || 'Identidad');
                        const im = it.image_url || it.preview || '';
                        return `<div class="pmodal-ref-thumb" title="${nm}" style="position:relative;">
                            ${im ? `<img src="${this.escapeHtml(im)}" alt="${nm}" loading="lazy" decoding="async">` : `<div class="pmodal-entity-img pmodal-entity-img--empty" aria-hidden="true"><i class="aisc-ico aisc-ico--product"></i></div>`}
                        </div>`;
                    }).join('')}
                </div>
            </section>`
            : '';

        const refsHtml = refs.length
            ? `<section class="pmodal-section pmodal-input-refs">
                <h3 class="pmodal-section-title"><i class="aisc-ico aisc-ico--image"></i> REFERENCIAS</h3>
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
                <h3 class="pmodal-section-title"><i class="aisc-ico aisc-ico--quote"></i> INSTRUCCIONES</h3>
                <p class="pmodal-input-brief-text">${this.escapeHtml(briefing)}</p>
            </section>`
            : '';

        const contextChips = [];
        if (campaignName) contextChips.push(`<span class="pmodal-context-chip"><i class="aisc-ico aisc-ico--campaign"></i> ${this.escapeHtml(campaignName)}</span>`);
        if (audienceName) contextChips.push(`<span class="pmodal-context-chip"><i class="aisc-ico aisc-ico--audience"></i> ${this.escapeHtml(audienceName)}</span>`);
        const contextHtml = contextChips.length
            ? `<section class="pmodal-section pmodal-input-context">
                <div class="pmodal-context-chips">${contextChips.join('')}</div>
            </section>`
            : '';

        const extrasHtml = extraRows
            ? `<section class="pmodal-section pmodal-input-extras">
                <h3 class="pmodal-section-title"><i class="aisc-ico aisc-ico--menu"></i> PARAMETROS</h3>
                <div class="pmodal-info-rows">${extraRows}</div>
            </section>`
            : '';

        const promptHtml = promptText
            ? `<section class="pmodal-section pmodal-input-prompt">
                <h3 class="pmodal-section-title"><i class="aisc-ico aisc-ico--consola-desarrollador"></i> PROMPT</h3>
                <p class="pmodal-input-brief-text" style="white-space:pre-wrap;">${this.escapeHtml(promptText)}</p>
            </section>`
            : '';
        const rationaleHtml = rationaleRaw
            ? `<section class="pmodal-section pmodal-input-rationale">
                <details class="pmodal-rationale">
                    <summary class="pmodal-rationale-summary">
                        <span class="pmodal-section-title"><i class="aisc-ico aisc-ico--sparkle"></i> CONCEPTO CREATIVO</span>
                        <i class="aisc-ico aisc-ico--chevron-right pmodal-rationale-caret"></i>
                    </summary>
                    <div class="pmodal-rationale-body">${this._lightMarkdown(rationaleRaw)}</div>
                </details>
            </section>`
            : '';
        container.innerHTML = entityHtml + identitiesHtml + promptHtml + rationaleHtml + contextHtml + refsHtml + briefHtml + extrasHtml
            || `<div class="pmodal-input-empty"><i class="aisc-ico aisc-ico--inbox"></i><p>Sin inputs registrados.</p></div>`;
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
                    ${url ? `<img data-src="${this.escapeHtml(url)}" alt="" decoding="async" loading="lazy">` : `<i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>`}
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
        // Debounce double-click: si el mismo source+tool esta inflight, ignoramos
        // el click. Cada handler lockea/desbloquea via _toolbarLock(tool, outputId).
        const state = this._modalState || {};
        const outputId = state.outputId || 'no-source';
        const lockKey = `${tool}:${outputId}`;
        if (!this._inflightToolbarOps) this._inflightToolbarOps = new Set();
        if (this._inflightToolbarOps.has(lockKey)) {
            if (typeof window.showToast === 'function') window.showToast('Ya estamos procesando esta accion. Espera unos segundos.');
            return;
        }
        // Edit abre overlay: no lock aqui (el lock va en _applyEditOverlay).
        if (tool === 'edit') { this._openEditOverlay(); return; }
        // Cambiar ratio abre un selector (no dispara directo): el lock va en _applyChangeRatio.
        if (tool === 'change-ratio') { this._toggleRatioPicker(btn); return; }

        // Para click-directos (upscale/remove-bg/fix-text), lock al click + UI feedback.
        this._inflightToolbarOps.add(lockKey);
        if (btn) { btn.setAttribute('aria-busy', 'true'); btn.setAttribute('disabled', ''); }
        const release = () => {
            this._inflightToolbarOps.delete(lockKey);
            if (btn) { btn.removeAttribute('aria-busy'); btn.removeAttribute('disabled'); }
        };
        const run = (fn) => Promise.resolve().then(fn).finally(release);

        switch (tool) {
            case 'upscale':   run(() => this._applyUpscale()); break;
            case 'remove-bg': run(() => this._applyRemoveBg()); break;
            case 'fix-text':  run(() => this._applyFixText()); break;
            default: release(); break;
        }
    }

    /**
     * Selector de ratio (outpaint): popover sobre el toolbar con los formatos
     * destino. Al elegir uno, _applyChangeRatio re-encuadra la imagen extendiendo
     * la escena (no recorta) via nano-banana. Toggle: segundo click lo cierra.
     */
    _toggleRatioPicker(btn) {
        const modal = document.getElementById('productionModal');
        if (!modal) return;
        const closePicker = () => {
            modal.querySelector('.pmodal-ratio-picker')?.remove();
            btn?.setAttribute('aria-expanded', 'false');
            if (this._ratioOutsideHandler) {
                document.removeEventListener('pointerdown', this._ratioOutsideHandler, true);
                this._ratioOutsideHandler = null;
            }
        };
        if (modal.querySelector('.pmodal-ratio-picker')) { closePicker(); return; }

        // Solo aplica a imagenes (no video).
        const video = document.getElementById('pmodalVideo');
        if (video && !video.hidden) {
            if (typeof window.showToast === 'function') window.showToast('Cambiar ratio solo aplica a imagenes');
            return;
        }

        const RATIOS = [
            { ar: '9:16', label: 'Vertical',   w: 9,  h: 16 },
            { ar: '4:5',  label: 'Retrato',    w: 4,  h: 5  },
            { ar: '1:1',  label: 'Cuadrado',   w: 1,  h: 1  },
            { ar: '16:9', label: 'Horizontal', w: 16, h: 9  },
            { ar: '3:2',  label: 'Apaisado',   w: 3,  h: 2  }
        ];
        const pop = document.createElement('div');
        pop.className = 'pmodal-ratio-picker';
        pop.setAttribute('role', 'menu');
        pop.innerHTML = `
            <div class="pmodal-ratio-head">Reencuadrar a</div>
            <div class="pmodal-ratio-opts">
                ${RATIOS.map(r => `
                    <button type="button" class="pmodal-ratio-opt" role="menuitem" data-ratio="${r.ar}" title="${r.label} ${r.ar}">
                        <span class="pmodal-ratio-glyph" style="--rw:${r.w};--rh:${r.h};"></span>
                        <span class="pmodal-ratio-text"><strong>${r.label}</strong><em>${r.ar}</em></span>
                    </button>`).join('')}
            </div>`;
        (modal.querySelector('.production-modal-visual') || modal).appendChild(pop);
        btn?.setAttribute('aria-expanded', 'true');

        pop.addEventListener('click', (e) => {
            const opt = e.target.closest('[data-ratio]');
            if (!opt) return;
            const ratio = opt.getAttribute('data-ratio');
            closePicker();
            this._applyChangeRatio(ratio);
        });
        // Cerrar al click fuera (o al re-tocar el pill).
        this._ratioOutsideHandler = (e) => {
            if (e.target.closest('.pmodal-ratio-picker') || e.target.closest('[data-tool="change-ratio"]')) return;
            closePicker();
        };
        setTimeout(() => document.addEventListener('pointerdown', this._ratioOutsideHandler, true), 0);
    }

    /**
     * Reencuadra la imagen a un ratio destino extendiendo la escena (outpaint)
     * via nano-banana. Mismo flujo que remove-bg: create → pending card →
     * polling → persist. El backend (kie-image-reframe-create) recibe el ratio
     * destino y un prompt de extension; nunca recorta al sujeto.
     */
    async _applyChangeRatio(targetRatio) {
        const state = this._modalState || {};
        const imageUrl = state.mediaUrl;
        const sourceOutputId = state.outputId || null;
        const lockKey = `change-ratio:${sourceOutputId || 'no-source'}`;
        if (!this._inflightToolbarOps) this._inflightToolbarOps = new Set();
        if (this._inflightToolbarOps.has(lockKey)) {
            if (typeof window.showToast === 'function') window.showToast('Ya estamos reencuadrando esta imagen.');
            return;
        }
        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
            if (typeof window.showToast === 'function') window.showToast('No hay URL valida de la imagen original');
            return;
        }
        if (!this.organizationId) {
            if (typeof window.showToast === 'function') window.showToast('Falta organization_id');
            return;
        }
        this._inflightToolbarOps.add(lockKey);
        const release = () => this._inflightToolbarOps.delete(lockKey);

        const sourceInfo = (await this._detectSourceProductInfo().catch(() => null)) || {};
        if (typeof window.showToast === 'function') window.showToast(`Reencuadrando a ${targetRatio} — toma 20-40s`);

        let createPayload;
        try {
            const accessToken = await this._getAccessToken();
            if (!accessToken) throw new Error('No hay sesion activa');
            const res = await fetch('/.netlify/functions/kie-image-reframe-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                    image_url: imageUrl,
                    source_output_id: sourceOutputId,
                    organization_id: this.organizationId,
                    target_aspect_ratio: targetRatio
                })
            });
            let parsed;
            try { parsed = await res.json(); }
            catch (_) {
                const text = await res.text().catch(() => '');
                throw new Error(`Gateway HTTP ${res.status}: ${text.slice(0, 200) || 'sin body'}`);
            }
            if (!res.ok) {
                if (res.status === 402) throw new Error(`Creditos insuficientes (${parsed.credits_needed ?? '?'} cred)`);
                throw new Error(parsed.error || `HTTP ${res.status}`);
            }
            createPayload = parsed;
        } catch (err) {
            console.error('[change-ratio] create error:', err);
            if (typeof window.showToast === 'function') window.showToast(`No se pudo reencuadrar: ${err.message}`);
            release();
            return;
        }

        const clientId = `pending-reframe-${createPayload.taskId}`;
        this.closeProductionModal?.();
        this._addPendingEditCard({
            clientId,
            taskId: createPayload.taskId,
            sourceImageUrl: imageUrl,
            aspectRatio: targetRatio,
            label: `Reencuadrando a ${targetRatio}`
        });

        Promise.resolve(this._runStandaloneKieOp({
            clientId,
            taskId: createPayload.taskId,
            createPayload,
            sourceOutputId,
            sourceImageUrl: imageUrl,
            aspectRatio: targetRatio,
            sourceInfo,
            kind: 'image_reframe',
            downloadKind: 'reframe',
            successLabel: `Imagen reencuadrada a ${targetRatio} en el grid`,
            failLabel: 'Reencuadre fallo',
            buildModels: (cp) => ({ editor: cp.kie_model || null, prompter: null }),
            buildTechnicalParams: (cp, ar) => ({ output_format: 'png', aspect_ratio: ar }),
            buildMetadataExtras: () => ({ reframed_to: targetRatio })
        })).finally(release);
    }

    /**
     * Mejora 4K via kie.ai Topaz upscale. Sin overlay ni prompt — click directo
     * dispara: validacion → POST function → cerrar modal → skeleton card en grid
     * → polling → descarga → upload Storage → insert system_ai_outputs.
     * Reusa todos los helpers del flujo de edit (background tasks).
     */
    async _applyUpscale() {
        const state = this._modalState || {};
        const imageUrl = state.mediaUrl;
        const sourceOutputId = state.outputId || null;
        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
            if (typeof window.showToast === 'function') window.showToast('No hay URL valida de la imagen original');
            return;
        }
        if (!this.organizationId) {
            if (typeof window.showToast === 'function') window.showToast('Falta organization_id');
            return;
        }

        // Snapshot del linaje del source al click (protege contra race si el
        // usuario abre otra produccion mientras esta tarea esta polling).
        const sourceInfo = (await this._detectSourceProductInfo().catch(() => null)) || {};

        let aspectRatio = sourceInfo.aspectRatio || null;
        if (!aspectRatio) {
            try { aspectRatio = await this._detectKieAspectRatio(imageUrl); }
            catch (_) { aspectRatio = '1:1'; }
        }

        // Feedback al usuario: ya sabemos AR antes de disparar (P3#1 audit).
        if (typeof window.showToast === 'function') window.showToast(`Mejorando a 4K en ${aspectRatio} — toma 30-60s`);

        let createPayload;
        try {
            const accessToken = await this._getAccessToken();
            if (!accessToken) throw new Error('No hay sesion activa');
            const res = await fetch('/.netlify/functions/kie-image-upscale-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                    image_url: imageUrl,
                    source_output_id: sourceOutputId,
                    organization_id: this.organizationId,
                    scale: 4
                })
            });
            let parsed;
            try { parsed = await res.json(); }
            catch (_) {
                const text = await res.text().catch(() => '');
                throw new Error(`Gateway HTTP ${res.status}: ${text.slice(0, 200) || 'sin body'}`);
            }
            if (!res.ok) {
                if (res.status === 402) throw new Error(`Creditos insuficientes (${parsed.credits_needed ?? '?'} cred)`);
                throw new Error(parsed.error || `HTTP ${res.status}`);
            }
            createPayload = parsed;
        } catch (err) {
            console.error('[upscale] create error:', err);
            if (typeof window.showToast === 'function') window.showToast(`No se pudo iniciar: ${err.message}`);
            return;
        }

        const clientId = `pending-upscale-${createPayload.taskId}`;
        this.closeProductionModal?.();
        this._addPendingEditCard({
            clientId,
            taskId: createPayload.taskId,
            sourceImageUrl: imageUrl,
            aspectRatio,
            label: 'Mejorando a 4K'
        });

        this._completeUpscaleInBackground({
            clientId,
            taskId: createPayload.taskId,
            createPayload,
            sourceOutputId,
            sourceImageUrl: imageUrl,
            aspectRatio,
            sourceInfo
        });
    }

    _completeUpscaleInBackground(args) {
        return this._runStandaloneKieOp({
            ...args,
            kind: 'image_upscale',
            downloadKind: 'upscale',
            successLabel: 'Imagen mejorada a 4K lista en el grid',
            failLabel: 'Mejora 4K fallo',
            buildModels: (cp) => ({ editor: cp.kie_model || null, prompter: null }),
            buildTechnicalParams: (cp, ar) => ({
                output_format: 'png',
                scale_factor: cp.scale_factor,
                aspect_ratio: ar
            }),
            buildMetadataExtras: (cp) => ({ scale_factor: cp.scale_factor })
        });
    }

    /**
     * Sin fondo via kie.ai Recraft remove-background. Sin overlay ni prompt.
     * Click directo: validacion → POST function → cerrar modal → skeleton →
     * polling → persist server-side (PNG transparente) → insert system_ai_outputs.
     */
    async _applyRemoveBg() {
        const state = this._modalState || {};
        const imageUrl = state.mediaUrl;
        const sourceOutputId = state.outputId || null;
        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
            if (typeof window.showToast === 'function') window.showToast('No hay URL valida de la imagen original');
            return;
        }
        if (!this.organizationId) {
            if (typeof window.showToast === 'function') window.showToast('Falta organization_id');
            return;
        }

        // Snapshot del linaje al click (anti-race entre modales).
        const sourceInfo = (await this._detectSourceProductInfo().catch(() => null)) || {};

        let aspectRatio = sourceInfo.aspectRatio || null;
        if (!aspectRatio) {
            try { aspectRatio = await this._detectKieAspectRatio(imageUrl); }
            catch (_) { aspectRatio = '1:1'; }
        }

        if (typeof window.showToast === 'function') window.showToast(`Quitando fondo en ${aspectRatio} — toma 15-30s`);

        let createPayload;
        try {
            const accessToken = await this._getAccessToken();
            if (!accessToken) throw new Error('No hay sesion activa');
            const res = await fetch('/.netlify/functions/kie-image-remove-bg-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                    image_url: imageUrl,
                    source_output_id: sourceOutputId,
                    organization_id: this.organizationId
                })
            });
            let parsed;
            try { parsed = await res.json(); }
            catch (_) {
                const text = await res.text().catch(() => '');
                throw new Error(`Gateway HTTP ${res.status}: ${text.slice(0, 200) || 'sin body'}`);
            }
            if (!res.ok) {
                if (res.status === 402) throw new Error(`Creditos insuficientes (${parsed.credits_needed ?? '?'} cred)`);
                throw new Error(parsed.error || `HTTP ${res.status}`);
            }
            createPayload = parsed;
        } catch (err) {
            console.error('[remove-bg] create error:', err);
            if (typeof window.showToast === 'function') window.showToast(`No se pudo iniciar: ${err.message}`);
            return;
        }

        const clientId = `pending-removebg-${createPayload.taskId}`;
        this.closeProductionModal?.();
        this._addPendingEditCard({
            clientId,
            taskId: createPayload.taskId,
            sourceImageUrl: imageUrl,
            aspectRatio,
            label: 'Quitando fondo'
        });

        this._completeRemoveBgInBackground({
            clientId,
            taskId: createPayload.taskId,
            createPayload,
            sourceOutputId,
            sourceImageUrl: imageUrl,
            aspectRatio,
            sourceInfo
        });
    }

    _completeRemoveBgInBackground(args) {
        return this._runStandaloneKieOp({
            ...args,
            kind: 'image_remove_bg',
            downloadKind: 'remove-bg',
            successLabel: 'Fondo eliminado, PNG transparente en el grid',
            failLabel: 'Quitar fondo fallo',
            buildModels: (cp) => ({ editor: cp.kie_model || null, prompter: null }),
            buildTechnicalParams: (cp, ar) => ({ output_format: 'png', aspect_ratio: ar, has_alpha: true }),
            buildMetadataExtras: () => ({})
        });
    }

    /**
     * Mejorar texto via GPT Image-2 + OpenAI Vision bridge. Sin overlay ni
     * prompt — auto-detecta producto del output. GPT Image-2 es text-to-image
     * puro, asi que OpenAI Vision lee imagen original + imagenes de producto
     * y genera un prompt detallado que regenera la escena con los textos
     * correctos.
     */
    async _applyFixText() {
        const state = this._modalState || {};
        const imageUrl = state.mediaUrl;
        const sourceOutputId = state.outputId || null;
        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
            if (typeof window.showToast === 'function') window.showToast('No hay URL valida de la imagen original');
            return;
        }
        if (!this.organizationId) {
            if (typeof window.showToast === 'function') window.showToast('Falta organization_id');
            return;
        }

        // Auto-detect producto del output original. Snapshot al click (no
        // diferido) para no condicionarse al estado previo del modal —
        // anti-race con otras producciones abiertas.
        const info = (await this._detectSourceProductInfo().catch(() => null)) || {};
        const productImageUrls = info?.imageUrls || [];
        if (!productImageUrls.length) {
            if (typeof window.showToast === 'function') {
                window.showToast('No detectamos producto en esta produccion. Usa "Editar" → "Corregir producto" y selecciona uno manualmente.');
            }
            return;
        }

        let aspectRatio = info?.aspectRatio || null;
        if (!aspectRatio) {
            try { aspectRatio = await this._detectKieAspectRatio(imageUrl); }
            catch (_) { aspectRatio = 'auto'; }
        }

        if (typeof window.showToast === 'function') window.showToast(`Mejorando textos en ${aspectRatio} — toma 30-60s`);

        let createPayload;
        try {
            const accessToken = await this._getAccessToken();
            if (!accessToken) throw new Error('No hay sesion activa');
            const res = await fetch('/.netlify/functions/kie-image-fix-text-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                    image_url: imageUrl,
                    source_output_id: sourceOutputId,
                    organization_id: this.organizationId,
                    product_id: info?.productId || null,
                    product_name: info?.productName || null,
                    product_image_urls: productImageUrls,
                    aspect_ratio: aspectRatio
                })
            });
            let parsed;
            try { parsed = await res.json(); }
            catch (_) {
                const text = await res.text().catch(() => '');
                throw new Error(`Gateway HTTP ${res.status}: ${text.slice(0, 200) || 'sin body'}`);
            }
            if (!res.ok) {
                if (res.status === 402) throw new Error(`Creditos insuficientes (${parsed.credits_needed ?? '?'} cred)`);
                throw new Error(parsed.error || `HTTP ${res.status}`);
            }
            createPayload = parsed;
        } catch (err) {
            console.error('[fix-text] create error:', err);
            if (typeof window.showToast === 'function') window.showToast(`No se pudo iniciar: ${err.message}`);
            return;
        }

        const clientId = `pending-fixtext-${createPayload.taskId}`;
        this.closeProductionModal?.();
        this._addPendingEditCard({
            clientId,
            taskId: createPayload.taskId,
            sourceImageUrl: imageUrl,
            aspectRatio,
            label: 'Mejorando textos'
        });

        this._completeFixTextInBackground({
            clientId,
            taskId: createPayload.taskId,
            createPayload,
            sourceOutputId,
            sourceImageUrl: imageUrl,
            aspectRatio,
            productId: info?.productId || null,
            productName: info?.productName || null,
            entityId: info?.entityId || null,
            sourceInfo: info
        });
    }

    _completeFixTextInBackground(args) {
        const { productId, productName, entityId, createPayload } = args;
        return this._runStandaloneKieOp({
            ...args,
            kind: 'image_fix_text',
            downloadKind: 'fix-text',
            successLabel: 'Textos mejorados lista en el grid',
            failLabel: 'Mejorar textos fallo',
            entityIdOverride: entityId,
            promptUsed: createPayload.refined_prompt,
            openaiTokens: {
                input: createPayload.openai_input_tokens || 0,
                output: createPayload.openai_output_tokens || 0,
                model: createPayload.openai_model || 'gpt-4o-mini'
            },
            buildModels: (cp) => ({
                editor: cp.kie_model || null,
                prompter: cp.openai_model || null
            }),
            buildTechnicalParams: (_cp, ar) => ({ output_format: 'png', aspect_ratio: ar }),
            buildMetadataExtras: (cp) => ({
                edit_refined_prompt: cp.refined_prompt,
                product_id: productId,
                product_name: productName
            })
        });
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
        // Guardar el elemento que tenia focus para restaurar al cerrar (a11y).
        this._editOverlayLastFocus = document.activeElement;

        // La mascara se pinta sobre la imagen sin transform: resetear el zoom.
        this._resetModalZoom();

        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        // role=dialog + aria-modal: screen readers anuncian como dialogo modal
        // y tab cycle queda contenido (con el focus trap bindeado abajo).
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Editar imagen con IA');
        canvas.hidden = false;
        this._editState = this._editState || { tool: 'brush', size: 60, drawing: false };

        // Sincronizar tamano del canvas con la imagen ya pintada.
        this._syncEditCanvasSize(img);
        this._bindEditCanvasOnce();
        this._bindEditModeControlsOnce();
        this._bindEditOverlayKeyboardOnce(overlay);

        // Reset state: modo default + limpiar selecciones previas.
        this._editMode = 'remove';
        this._selectedProductId = null;
        this._editReferenceImageUrl = '';
        this._refreshEditModeUI();

        // Detectar producto del output abierto en background (no bloquea).
        this._detectSourceProductInfo()
            .then(info => { this._sourceProductInfo = info; })
            .catch(() => { this._sourceProductInfo = null; });

        // Focus al prompt para escritura inmediata.
        setTimeout(() => document.getElementById('pmodalEditPrompt')?.focus(), 50);
    }

    /**
     * A11y: Escape cierra el overlay (NO el modal entero), Tab queda atrapado
     * dentro del overlay para no perder contexto. Idempotente — solo se
     * bindea una vez por overlay element.
     */
    _bindEditOverlayKeyboardOnce(overlay) {
        if (!overlay || overlay._kbBound) return;
        overlay._kbBound = true;
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                this._closeEditOverlay();
                return;
            }
            if (e.key !== 'Tab') return;
            // Focus trap: redirige al primer/ultimo focusable del overlay.
            const focusables = overlay.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
    }

    /**
     * Bindea click en pills, "+", attachments y picker. Idempotente.
     */
    _bindEditModeControlsOnce() {
        const panel = document.querySelector('.pmodal-edit-panel');
        if (!panel || panel._modeControlsBound) return;
        panel._modeControlsBound = true;

        panel.addEventListener('click', (e) => {
            const pill = e.target.closest('[data-edit-mode]');
            if (pill) {
                this._setEditMode(pill.getAttribute('data-edit-mode'));
                return;
            }
            const addBtn = e.target.closest('[data-edit-action="add-attachment"]');
            if (addBtn) { this._toggleEditPicker(); return; }
            const removeAtt = e.target.closest('[data-edit-attachment-remove]');
            if (removeAtt) {
                const type = removeAtt.getAttribute('data-edit-attachment-remove');
                this._removeEditAttachment(type);
                return;
            }
            const productCard = e.target.closest('[data-product-id]');
            if (productCard && panel.contains(productCard)) {
                this._selectedProductId = productCard.getAttribute('data-product-id');
                this._closeEditPicker();
                this._renderEditAttachments();
                return;
            }
            // Click fuera del picker cierra el popover.
            const picker = document.getElementById('pmodalEditPicker');
            if (picker && !picker.hidden && !e.target.closest('#pmodalEditPicker') && !e.target.closest('#pmodalEditAddBtn')) {
                this._closeEditPicker();
            }
        });
    }

    _setEditMode(mode) {
        const valid = new Set(['remove', 'replace', 'fix-product', 'change-product']);
        if (!valid.has(mode)) return;
        this._editMode = mode;
        this._refreshEditModeUI();
    }

    /**
     * Aplica el estado activo a las pills + decide visibilidad del "+" +
     * cierra el picker al cambiar de modo + auto-selecciona producto en
     * fix-product si lo detectamos del meta original. Renderiza attachments.
     */
    _refreshEditModeUI() {
        const mode = this._editMode || 'remove';
        document.querySelectorAll('.pmodal-edit-mode-pill[data-edit-mode]').forEach(pill => {
            const active = pill.getAttribute('data-edit-mode') === mode;
            pill.classList.toggle('is-active', active);
            pill.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        // El "+" solo aparece en modos que aceptan adjuntos.
        const allowsAttachment = (mode === 'replace' || mode === 'fix-product' || mode === 'change-product');
        const addBtn = document.getElementById('pmodalEditAddBtn');
        if (addBtn) addBtn.hidden = !allowsAttachment;

        // Auto-seleccionar producto detectado al entrar a fix-product.
        if (mode === 'fix-product' && !this._selectedProductId && this._sourceProductInfo?.productId) {
            this._selectedProductId = this._sourceProductInfo.productId;
        }

        // Limpiar adjuntos del modo opuesto al cambiar.
        if (mode !== 'replace') this._editReferenceImageUrl = '';
        if (mode !== 'fix-product' && mode !== 'change-product') this._selectedProductId = null;

        this._closeEditPicker();
        this._renderEditAttachments();
    }

    /**
     * Renderiza las cards de adjuntos (producto o URL referencia) arriba de
     * la barra. Las cards llevan thumb + X.
     */
    _renderEditAttachments() {
        const row = document.getElementById('pmodalEditAttachments');
        if (!row) return;
        const cards = [];

        if (this._selectedProductId && Array.isArray(this._orgProductsCache)) {
            const prod = this._orgProductsCache.find(p => p.id === this._selectedProductId);
            if (prod) {
                const thumb = (prod.images && prod.images[0]) || '';
                cards.push(`
                    <div class="pmodal-edit-attachment" title="${this.escapeHtml(prod.name)}">
                        <div class="pmodal-edit-attachment-thumb">${thumb ? `<img src="${this.escapeHtml(thumb)}" alt="">` : ''}</div>
                        <span class="pmodal-edit-attachment-label">${this.escapeHtml(prod.name)}</span>
                        <button type="button" class="pmodal-edit-attachment-remove" data-edit-attachment-remove="product" aria-label="Quitar producto">
                            <i class="aisc-ico aisc-ico--close" aria-hidden="true"></i>
                        </button>
                    </div>
                `);
            }
        }
        if (this._editReferenceImageUrl) {
            cards.push(`
                <div class="pmodal-edit-attachment" title="${this.escapeHtml(this._editReferenceImageUrl)}">
                    <div class="pmodal-edit-attachment-thumb"><img src="${this.escapeHtml(this._editReferenceImageUrl)}" alt=""></div>
                    <span class="pmodal-edit-attachment-label">Referencia</span>
                    <button type="button" class="pmodal-edit-attachment-remove" data-edit-attachment-remove="reference" aria-label="Quitar referencia">
                        <i class="aisc-ico aisc-ico--close" aria-hidden="true"></i>
                    </button>
                </div>
            `);
        }

        if (cards.length === 0) {
            row.hidden = true;
            row.innerHTML = '';
        } else {
            row.hidden = false;
            row.innerHTML = cards.join('');
        }
    }

    _removeEditAttachment(type) {
        if (type === 'product') this._selectedProductId = null;
        else if (type === 'reference') this._editReferenceImageUrl = '';
        this._renderEditAttachments();
    }

    /**
     * Abre el adjuntador segun el modo:
     *   replace        → file picker nativo (sube y adjunta automaticamente)
     *   fix-product    → grid de productos (popover, auto-pre-selecciona)
     *   change-product → grid de productos (popover)
     */
    _toggleEditPicker() {
        const mode = this._editMode || 'remove';
        if (mode === 'replace') {
            this._closeEditPicker();
            this._openReferenceFilePicker();
            return;
        }
        const picker = document.getElementById('pmodalEditPicker');
        if (!picker) return;
        if (!picker.hidden) { this._closeEditPicker(); return; }
        this._renderPickerContent(picker);
        picker.hidden = false;
    }

    /**
     * Dispara el file input nativo y bindea el change handler una sola vez.
     */
    _openReferenceFilePicker() {
        const input = document.getElementById('pmodalEditFileInput');
        if (!input) return;
        if (!input._editChangeBound) {
            input._editChangeBound = true;
            input.addEventListener('change', async () => {
                const file = input.files && input.files[0];
                input.value = ''; // permite re-seleccionar el mismo archivo
                if (!file) return;
                try {
                    const publicUrl = await this._uploadEditReferenceFile(file);
                    if (publicUrl) {
                        this._editReferenceImageUrl = publicUrl;
                        this._renderEditAttachments();
                    }
                } catch (err) {
                    console.error('[edit-overlay] upload ref:', err);
                    if (typeof window.showToast === 'function') {
                        window.showToast(`No se pudo subir la referencia: ${err.message || err}`);
                    }
                }
            });
        }
        input.click();
    }

    /**
     * Sube un archivo de referencia a production-inputs/edit-refs y devuelve
     * la URL publica. Bucket existente, RLS permite insert con auth.
     */
    async _uploadEditReferenceFile(file) {
        if (!this.supabase?.storage) throw new Error('Storage no disponible');
        const userId = this.userId || (await this.supabase.auth.getUser()).data?.user?.id;
        if (!userId) throw new Error('No hay sesion');
        const extMap = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        const ext = extMap[file.type] || (file.name.split('.').pop() || 'png').toLowerCase();
        const path = `edit-refs/${userId}/${Date.now()}.${ext}`;
        const { error } = await this.supabase.storage.from('production-inputs').upload(path, file, {
            contentType: file.type || 'image/png',
            upsert: false
        });
        if (error) throw error;
        const { data: urlData } = this.supabase.storage.from('production-inputs').getPublicUrl(path);
        return urlData?.publicUrl || null;
    }

    _closeEditPicker() {
        const picker = document.getElementById('pmodalEditPicker');
        if (!picker) return;
        picker.hidden = true;
        picker.innerHTML = '';
    }

    _renderPickerContent(picker) {
        const mode = this._editMode || 'remove';
        if (mode === 'fix-product' || mode === 'change-product') {
            const hint = (mode === 'fix-product')
                ? 'Producto a corregir'
                : 'Cambiar por este producto';
            picker.innerHTML = `
                <div class="pmodal-edit-picker-head">
                    <span class="pmodal-edit-picker-title">${hint}</span>
                </div>
                <div class="pmodal-edit-product-grid" id="pmodalEditProductGrid" role="listbox" aria-label="Productos">
                    <div class="pmodal-edit-product-empty">Cargando productos...</div>
                </div>
            `;
            // Cargar y pintar productos.
            (async () => {
                if (!this._orgProductsCache) this._orgProductsCache = await this._loadOrgProducts();
                const grid = picker.querySelector('#pmodalEditProductGrid');
                if (!grid) return;
                const products = this._orgProductsCache || [];
                if (!products.length) {
                    grid.innerHTML = '<div class="pmodal-edit-product-empty">No hay productos</div>';
                    return;
                }
                grid.innerHTML = products.map(p => {
                    const thumb = (p.images && p.images[0]) || '';
                    const selected = (this._selectedProductId === p.id);
                    return `
                        <button type="button"
                                class="pmodal-edit-product-card ${selected ? 'is-selected' : ''}"
                                data-product-id="${this.escapeHtml(p.id)}"
                                title="${this.escapeHtml(p.name)}">
                            <div class="pmodal-edit-product-thumb">${thumb ? `<img src="${this.escapeHtml(thumb)}" alt="" loading="lazy">` : ''}</div>
                            <div class="pmodal-edit-product-name">${this.escapeHtml(p.name)}</div>
                        </button>
                    `;
                }).join('');
            })();
        }
    }

    /**
     * Carga productos de la org con sus imagenes (max 3 por producto).
     * Cache en memoria mientras viva el LivingManager.
     */
    async _loadOrgProducts() {
        if (!this.supabase || !this.organizationId) return [];
        try {
            const { data: products, error } = await this.supabase
                .from('products')
                .select('id, nombre_producto, entity_id')
                .eq('organization_id', this.organizationId)
                .order('nombre_producto', { ascending: true })
                .limit(80);
            if (error) throw error;
            if (!products?.length) return [];

            const ids = products.map(p => p.id);
            const { data: images } = await this.supabase
                .from('product_images')
                .select('product_id, image_url, storage_path, image_order')
                .in('product_id', ids)
                .order('image_order', { ascending: true });

            const byProduct = new Map();
            (images || []).forEach(img => {
                const arr = byProduct.get(img.product_id) || [];
                let url = img.image_url;
                if (!url && img.storage_path) {
                    url = this.getPublicUrlFromStorage('product-images', img.storage_path);
                }
                if (url) arr.push(url);
                byProduct.set(img.product_id, arr);
            });

            return products.map(p => ({
                id: p.id,
                name: p.nombre_producto,
                entity_id: p.entity_id,
                images: (byProduct.get(p.id) || []).slice(0, 3)
            }));
        } catch (err) {
            console.warn('[edit-overlay] _loadOrgProducts:', err?.message || err);
            return [];
        }
    }

    /**
     * Detecta el meta de la produccion abierta en el modal: aspect_ratio +
     * entidad + linaje (brief/persona/campaign) para que las ediciones
     * standalone hereden el contexto del source.
     *
     * Fuentes en orden: runs_outputs (canonica) -> runs_inputs (legacy) ->
     * system_ai_outputs (cadena: editar una edicion).
     *
     * Devuelve { aspectRatio, entityId, entityType, entityName, productId,
     *           productName, imageUrls, briefId, personaId, campaignId } o null.
     */
    async _detectSourceProductInfo() {
        if (!this.supabase) return null;
        const state = this._modalState || {};

        // Cache por outputId (P2#6 audit 2026-05-25). Evita re-disparar 4
        // queries a BD cuando el usuario abre/cierra el mismo modal varias
        // veces, o clickea multiples botones del toolbar en la misma sesion.
        const cacheKey = state.outputId || state.runId;
        const now = Date.now();
        if (!this._sourceInfoCache) this._sourceInfoCache = new Map();
        if (cacheKey) {
            const cached = this._sourceInfoCache.get(cacheKey);
            if (cached && (now - cached.t) < SOURCE_INFO_CACHE_TTL_MS) {
                return cached.v;
            }
        }

        let aspectRatio = null;
        let entityId = null;
        let briefId = null;
        let personaId = null;
        let campaignId = null;
        // run_id del output original: lo conoce el modal (run del output abierto).
        // Permite que las ediciones standalone (Editar/4K/Sin fondo/Mejorar texto)
        // hereden el run y aparezcan en el canvas run-scoped (DEBT 2026-05-26).
        let runId = state.runId || null;

        // 1) runs_outputs (fuente canonica nueva — incluye linaje FK directo).
        if (state.outputId) {
            try {
                const { data } = await this.supabase
                    .from('runs_outputs')
                    .select('run_id, technical_params, metadata, brief_id, persona_id, campaign_id, entity_id')
                    .eq('id', state.outputId)
                    .maybeSingle();
                const tp = data?.technical_params || {};
                const md = data?.metadata || {};
                aspectRatio = tp.aspect_ratio || md.aspect_ratio || null;
                entityId = data?.entity_id || tp.entity_id || md.entity_id || null;
                briefId = data?.brief_id || null;
                personaId = data?.persona_id || null;
                campaignId = data?.campaign_id || null;
                if (!runId) runId = data?.run_id || null;
            } catch (_) { /* noop */ }
        }

        // 2) runs_inputs.input_data (legacy: outputs antes del cambio).
        if ((!aspectRatio || !entityId) && state.runId) {
            try {
                const { data } = await this.supabase
                    .from('runs_inputs')
                    .select('input_data')
                    .eq('run_id', state.runId)
                    .limit(1)
                    .maybeSingle();
                const inp = data?.input_data || {};
                if (!aspectRatio) aspectRatio = inp.aspect_ratio || null;
                if (!entityId) entityId = inp.entity_id || null;
                if (!briefId) briefId = inp.brief_id || null;
                if (!personaId) personaId = inp.persona_id || inp.audience_id || null;
                if (!campaignId) campaignId = inp.campaign_id || null;
            } catch (_) { /* noop */ }
        }

        // 3) system_ai_outputs (cadena: editar una edicion ya hecha).
        if (state.outputId) {
            try {
                const { data } = await this.supabase
                    .from('system_ai_outputs')
                    .select('run_id, metadata, technical_params, brief_id, persona_id, campaign_id, entity_id')
                    .eq('id', state.outputId)
                    .maybeSingle();
                const md = data?.metadata || {};
                const tp = data?.technical_params || {};
                if (!aspectRatio) aspectRatio = md.aspect_ratio || tp.aspect_ratio || null;
                if (!entityId) entityId = data?.entity_id || md.entity_id || md.source_entity_id || null;
                if (!briefId) briefId = data?.brief_id || null;
                if (!personaId) personaId = data?.persona_id || null;
                if (!campaignId) campaignId = data?.campaign_id || null;
                if (!runId) runId = data?.run_id || null;
            } catch (_) { /* noop */ }
        }

        if (!entityId) {
            const val = (aspectRatio || briefId || personaId || campaignId || runId)
                ? { aspectRatio, entityId: null, entityType: null, entityName: null, productId: null, productName: null, imageUrls: [], briefId, personaId, campaignId, runId }
                : null;
            if (cacheKey) this._sourceInfoCache.set(cacheKey, { t: now, v: val });
            return val;
        }

        // Resolver entity_id -> brand_entities -> products|services|brand_places
        let entityType = null, entityName = null, productId = null, productName = null;
        let imageUrls = [];

        try {
            const { data: ent } = await this.supabase
                .from('brand_entities')
                .select('id, name, entity_type')
                .eq('id', entityId)
                .maybeSingle();
            if (ent) {
                entityType = ent.entity_type || null;
                entityName = ent.name || null;
            }
        } catch (_) { /* noop */ }

        try {
            if (entityType === 'product' || !entityType) {
                const { data: prod } = await this.supabase
                    .from('products')
                    .select('id, nombre_producto')
                    .eq('entity_id', entityId)
                    .maybeSingle();
                if (prod?.id) {
                    productId = prod.id;
                    productName = prod.nombre_producto || entityName;
                    const { data: imgs } = await this.supabase
                        .from('product_images')
                        .select('image_url, storage_path')
                        .eq('product_id', prod.id)
                        .order('image_order', { ascending: true })
                        .limit(3);
                    imageUrls = (imgs || [])
                        .map(i => i.image_url || this.getPublicUrlFromStorage('product-images', i.storage_path))
                        .filter(Boolean);
                }
            } else if (entityType === 'service') {
                const { data: svc } = await this.supabase
                    .from('services')
                    .select('id, nombre_servicio')
                    .eq('entity_id', entityId)
                    .maybeSingle();
                if (svc?.id) {
                    productName = svc.nombre_servicio || entityName;
                }
            } else if (entityType === 'place') {
                const { data: place } = await this.supabase
                    .from('brand_places')
                    .select('id, name')
                    .eq('entity_id', entityId)
                    .maybeSingle();
                if (place?.id) {
                    productName = place.name || entityName;
                    const { data: imgs } = await this.supabase
                        .from('place_images')
                        .select('image_url, storage_path')
                        .eq('place_id', place.id)
                        .limit(3);
                    imageUrls = (imgs || [])
                        .map(i => i.image_url || this.getPublicUrlFromStorage('place-images', i.storage_path))
                        .filter(Boolean);
                }
            } else if (entityType === 'character') {
                const { data: character } = await this.supabase
                    .from('brand_characters')
                    .select('id, nombre_personaje')
                    .eq('entity_id', entityId)
                    .maybeSingle();
                if (character?.id) {
                    productName = character.nombre_personaje || entityName;
                    const { data: imgs } = await this.supabase
                        .from('character_images')
                        .select('image_url, storage_path')
                        .eq('character_id', character.id)
                        .order('image_order', { ascending: true })
                        .limit(3);
                    imageUrls = (imgs || [])
                        .map(i => i.image_url || this.getPublicUrlFromStorage('character-images', i.storage_path))
                        .filter(Boolean);
                }
            }
        } catch (_) { /* noop */ }

        const result = { aspectRatio, entityId, entityType, entityName, productId, productName, imageUrls, briefId, personaId, campaignId, runId };
        if (cacheKey) this._sourceInfoCache.set(cacheKey, { t: now, v: result });
        return result;
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
        // A11y: restaurar focus al elemento que lo tenia antes de abrir overlay
        // (tipicamente el boton "Editar" del toolbar). Si no es valido, focus
        // al body para no dejarlo huerfano.
        try {
            const target = this._editOverlayLastFocus;
            if (target && typeof target.focus === 'function' && document.body.contains(target)) {
                target.focus();
            } else {
                document.querySelector('.pmodal-toolpill[data-tool="edit"]')?.focus();
            }
        } catch (_) { /* noop */ }
        this._editOverlayLastFocus = null;
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

        // Estrategia anti-acumulacion: pintar a alpha 1.0 internamente y
        // bajar la opacidad a 30% por CSS sobre todo el canvas. Asi por mas
        // veces que el usuario pase sobre la misma zona, el pixel es siempre
        // blanco alpha 1 → NO se oscurece. La opacidad final visible (30%)
        // se aplica al composite del canvas con la imagen detras, una sola
        // vez, despues del mix-blend-mode.
        const setupBrush = () => {
            const size = this._editState.size;
            if (this._editState.tool === 'brush') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
                ctx.fillStyle = 'rgba(255, 255, 255, 1)';
            } else {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
                ctx.fillStyle = 'rgba(0, 0, 0, 1)';
            }
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        };

        const startStroke = (e) => {
            if (!this._editState) return;
            e.preventDefault();
            this._editState.drawing = true;
            const p = getPos(e);
            const size = this._editState.size;
            setupBrush();
            // Punto inicial visible (un solo arc lleno) por si el usuario
            // hace click sin arrastrar.
            ctx.beginPath();
            ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
            ctx.fill();
            // Iniciar path para los lineTo subsiguientes.
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
        };

        const moveStroke = (e) => {
            if (!this._editState?.drawing) return;
            e.preventDefault();
            const p = getPos(e);
            // lineTo + stroke construyen una linea continua. Como pintamos a
            // alpha 1, repintar el path no acumula opacidad — solo extiende.
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        };

        const endStroke = () => {
            if (this._editState) this._editState.drawing = false;
        };

        canvas.addEventListener('mousedown', startStroke);
        canvas.addEventListener('mousemove', moveStroke);
        // Limpiar el mouseup global de una apertura previa antes de agregar el nuevo,
        // para no acumular un listener en window por cada apertura del modal de edicion.
        if (this._endStrokeHandler) { try { window.removeEventListener('mouseup', this._endStrokeHandler); } catch (_) {} }
        this._endStrokeHandler = endStroke;
        window.addEventListener('mouseup', endStroke);
        canvas.addEventListener('touchstart', startStroke, { passive: false });
        canvas.addEventListener('touchmove', moveStroke, { passive: false });
        canvas.addEventListener('touchend', endStroke);

        // Re-sincronizar tamano al cambiar viewport (re-layout de la imagen).
        const img = document.getElementById('pmodalImage');
        if (img) {
            // Desconectar el ResizeObserver de una apertura previa antes de crear uno nuevo.
            if (this._editCanvasRo) { try { this._editCanvasRo.disconnect(); } catch (_) {} }
            this._editCanvasRo = new ResizeObserver(() => this._syncEditCanvasSize(img));
            this._editCanvasRo.observe(img);
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
     * Aplica la edicion. Captura la mascara (PNG dataURL) + el prompt y dispara
     * el flujo end-to-end contra /.netlify/functions/kie-image-edit-create:
     *   1) sube mascara a Storage (production-inputs/edit-masks).
     *   2) OpenAI Vision genera el prompt para nano-banana.
     *   3) kie.ai encola la tarea -> taskId.
     *   4) polling con kling-video-status (kie usa recordInfo generico).
     *   5) descarga la URL kie, sube a production-outputs/image-edits y
     *      crea una nueva fila en runs_outputs con linaje al output original.
     *   6) refresca el grid y cierra el modal.
     */
    async _applyEditOverlay() {
        const promptEl = document.getElementById('pmodalEditPrompt');
        const canvas = document.getElementById('pmodalEditCanvas');
        const applyBtn = document.querySelector('.pmodal-edit-btn--accent[data-edit-action="apply"]');
        const cancelBtn = document.querySelector('.pmodal-edit-btn--ghost[data-edit-action="cancel"]');
        const userInstruction = (promptEl?.value || '').trim();
        const mode = this._editMode || 'remove';

        if (!canvas || !this._canvasHasContent(canvas)) {
            this._setEditApplyState({ phase: 'error', message: 'Pinta la zona a editar antes de aplicar' });
            return;
        }
        // En remove + replace pedimos texto; en fix/change-product el producto basta.
        const requiresPrompt = (mode === 'remove' || mode === 'replace');
        if (requiresPrompt && !userInstruction) {
            this._setEditApplyState({ phase: 'error', message: 'Describe que quieres cambiar antes de aplicar' });
            promptEl?.focus();
            return;
        }
        if ((mode === 'fix-product' || mode === 'change-product') && !this._selectedProductId) {
            this._setEditApplyState({ phase: 'error', message: 'Selecciona un producto del listado' });
            return;
        }

        const state = this._modalState || {};
        const imageUrl = state.mediaUrl;
        const sourceOutputId = state.outputId || null;

        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
            this._setEditApplyState({ phase: 'error', message: 'No hay URL valida de la imagen original' });
            return;
        }
        if (!this.organizationId) {
            this._setEditApplyState({ phase: 'error', message: 'Falta organization_id en el contexto' });
            return;
        }

        // Resolver imagenes del producto seleccionado (si aplica) desde el cache.
        let productImageUrls = [];
        let productName = '';
        if (this._selectedProductId && Array.isArray(this._orgProductsCache)) {
            const prod = this._orgProductsCache.find(p => p.id === this._selectedProductId);
            if (prod) {
                productImageUrls = prod.images || [];
                productName = prod.name || '';
            }
        }
        // Referencia opcional para modo replace.
        const referenceImageUrl = (mode === 'replace') ? (this._editReferenceImageUrl || '').trim() : '';

        const maskDataUrl = canvas.toDataURL('image/png');

        // Aspect ratio: priorizar el guardado en runs_outputs.technical_params
        // (precision absoluta). Si no esta, detectar via dimensiones reales de
        // la imagen. Sin esto kie con 'auto' colapsa a cuadrado.
        let aspectRatio = this._sourceProductInfo?.aspectRatio || null;
        if (!aspectRatio) {
            try { aspectRatio = await this._detectKieAspectRatio(imageUrl); }
            catch (_) { aspectRatio = '1:1'; }
        }

        // Loading message incluye AR (P3#1 audit): user sabe que va a generar
        // 16:9 vs 1:1 antes de esperar 30-60s.
        this._setEditApplyState({ phase: 'loading', message: `Iniciando edicion en ${aspectRatio}...`, lock: true });

        let createPayload;
        try {
            const accessToken = await this._getAccessToken();
            if (!accessToken) throw new Error('No hay sesion activa. Vuelve a iniciar sesion.');

            const createRes = await fetch('/.netlify/functions/kie-image-edit-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                    image_url: imageUrl,
                    mask_data_url: maskDataUrl,
                    user_instruction: userInstruction,
                    source_output_id: sourceOutputId,
                    organization_id: this.organizationId,
                    aspect_ratio: aspectRatio,
                    mode,
                    product_id: this._selectedProductId || null,
                    product_name: productName || null,
                    product_image_urls: productImageUrls,
                    reference_image_url: referenceImageUrl || null
                })
            });
            let parsed;
            try { parsed = await createRes.json(); }
            catch (_) {
                const text = await createRes.text().catch(() => '');
                throw new Error(`Gateway HTTP ${createRes.status}: ${text.slice(0, 200) || 'sin body'}`);
            }
            if (!createRes.ok) {
                if (createRes.status === 402) {
                    throw new Error(`Creditos insuficientes. Necesitas ${parsed.credits_needed ?? '?'} cred.`);
                }
                throw new Error(parsed.error || `HTTP ${createRes.status}`);
            }
            createPayload = parsed;
        } catch (err) {
            console.error('[edit-overlay] create error:', err);
            this._setEditApplyState({ phase: 'error', message: err.message || 'Error al iniciar la edicion' });
            return;
        }

        // POST OK: cerrar modal + meter skeleton card en el grid.
        const clientId = `pending-edit-${createPayload.taskId}`;
        this._setEditApplyState({ phase: 'idle' });
        if (applyBtn) applyBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        this._closeEditOverlay();
        this.closeProductionModal?.();
        this._addPendingEditCard({
            clientId,
            taskId: createPayload.taskId,
            sourceImageUrl: imageUrl,
            aspectRatio
        });

        // Snapshot del linaje del source al click (anti-race entre modales).
        // _sourceProductInfo se setea async cuando abre el overlay; aqui hago
        // sync para garantizar que es el del modal vigente.
        const sourceInfo = (await this._detectSourceProductInfo().catch(() => null)) || {};

        // Resolver entity_id del producto seleccionado (para preservar linaje
        // en futuras ediciones encadenadas).
        let entityId = null;
        if (this._selectedProductId && Array.isArray(this._orgProductsCache)) {
            entityId = this._orgProductsCache.find(p => p.id === this._selectedProductId)?.entity_id || null;
        }
        if (!entityId && sourceInfo.entityId) {
            entityId = sourceInfo.entityId;
        }

        // Polling + persistencia en background; el modal ya cerro.
        this._completeEditInBackground({
            clientId,
            taskId: createPayload.taskId,
            createPayload,
            userInstruction,
            sourceOutputId,
            sourceImageUrl: imageUrl,
            mode,
            productId: this._selectedProductId || null,
            productName: productName || null,
            entityId,
            referenceImageUrl: referenceImageUrl || null,
            aspectRatio,
            sourceInfo
        });
    }

    /**
     * Detecta el aspect ratio de la imagen original y lo mapea al valor
     * soportado mas cercano por kie nano-banana (1:1, 9:16, 3:4, 2:3, 4:5,
     * 5:4, 3:2, 4:3, 16:9, 21:9).
     */
    _detectKieAspectRatio(imageUrl) {
        return new Promise((resolve, reject) => {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const w = img.naturalWidth || img.width;
                    const h = img.naturalHeight || img.height;
                    if (!w || !h) return reject(new Error('Dimensiones invalidas'));
                    const r = w / h;
                    const options = [
                        { key: '9:16', r: 9 / 16 },
                        { key: '2:3',  r: 2 / 3 },
                        { key: '3:4',  r: 3 / 4 },
                        { key: '4:5',  r: 4 / 5 },
                        { key: '1:1',  r: 1 },
                        { key: '5:4',  r: 5 / 4 },
                        { key: '4:3',  r: 4 / 3 },
                        { key: '3:2',  r: 3 / 2 },
                        { key: '16:9', r: 16 / 9 },
                        { key: '21:9', r: 21 / 9 }
                    ];
                    let best = options[0], bestDiff = Math.abs(Math.log(r) - Math.log(best.r));
                    for (const o of options) {
                        const d = Math.abs(Math.log(r) - Math.log(o.r));
                        if (d < bestDiff) { best = o; bestDiff = d; }
                    }
                    resolve(best.key);
                };
                img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
                img.src = imageUrl;
            } catch (e) { reject(e); }
        });
    }

    /**
     * Inserta una card skeleton de edicion en curso al inicio del grid de
     * Production. Util para que el usuario sepa que hay algo en proceso aun
     * con el modal cerrado.
     */
    _addPendingEditCard({ clientId, taskId, sourceImageUrl, aspectRatio, label }) {
        if (!Array.isArray(this.pendingEdits)) this.pendingEdits = [];
        if (this.pendingEdits.some(p => p.clientId === clientId)) return;
        this.pendingEdits.unshift({
            clientId,
            taskId,
            sourceImageUrl,
            aspectRatio: aspectRatio || '1:1',
            label: label || 'Editando con IA',
            createdAt: new Date().toISOString()
        });
        this._historyVisibleCount = 0;
        try { this.renderHistorySection(); } catch (_) { /* noop */ }
    }

    _removePendingEditCard(clientId) {
        if (!Array.isArray(this.pendingEdits)) return;
        this.pendingEdits = this.pendingEdits.filter(p => p.clientId !== clientId);
    }

    /**
     * Marca un pending card como error en lugar de quitarlo. La card queda
     * visible con badge rojo + mensaje + boton Dismiss para que el usuario
     * NO se pierda el fallo (el toast efimero a veces se cierra antes).
     * Premium SaaS: no silenciar errores.
     */
    _markPendingEditError(clientId, errorMessage) {
        if (!Array.isArray(this.pendingEdits)) return;
        const item = this.pendingEdits.find(p => p.clientId === clientId);
        if (!item) return;
        item.error = String(errorMessage || 'Operacion fallo');
        item.label = `Error: ${item.error}`;
        try { this.renderHistorySection(); } catch (_) { /* noop */ }
    }

    /**
     * Renderiza una card skeleton ocupando el mismo aspect ratio que la
     * imagen origen, mostrando la imagen original tenue + shimmer encima +
     * texto "Editando" para que el justified layout no se rompa.
     */
    _renderPendingEditSkeleton(item, index) {
        const ar = item._pendingAspectRatio || '1:1';
        const [w, h] = ar.split(':').map(Number);
        const ratio = (w > 0 && h > 0) ? (w / h) : 1;
        const src = this.escapeHtml(item._pendingSourceImage || '');
        const label = this.escapeHtml(item._pendingLabel || 'Editando con IA');
        const errorMsg = item._pendingError ? this.escapeHtml(item._pendingError) : '';
        const isError = !!item._pendingError;
        // role="status" + aria-live = anuncio a screen readers cuando se inserta
        // el card o cambia (error). El polite no interrumpe al usuario.
        return `
            <article class="living-masonry-item history-image-card pending-edit-card${isError ? ' pending-edit-card--error' : ''}"
                     role="status"
                     aria-live="polite"
                     aria-atomic="true"
                     data-aspect-ratio="${ratio}"
                     data-pending-client-id="${this.escapeHtml(item._outputId)}"
                     aria-label="${isError ? `Error: ${errorMsg}` : `En progreso: ${label}`}">
                <div class="pending-edit-card-media">
                    ${src ? `<img src="${src}" alt="" class="pending-edit-card-source" loading="lazy">` : ''}
                    ${isError ? '' : '<div class="pending-edit-card-shimmer"></div>'}
                </div>
                <div class="pending-edit-card-overlay">
                    ${isError ? `
                        <i class="aisc-ico pending-edit-card-error-icon aisc-ico--alert-warning" aria-hidden="true"></i>
                        <span class="pending-edit-card-label pending-edit-card-error-label">${errorMsg}</span>
                        <button type="button" class="pending-edit-card-dismiss" data-action="dismiss-pending" data-client-id="${this.escapeHtml(item._outputId)}" aria-label="Cerrar mensaje de error">
                            <i class="aisc-ico aisc-ico--close" aria-hidden="true"></i> Cerrar
                        </button>
                    ` : `
                        <span class="pending-edit-card-spinner" aria-hidden="true"></span>
                        <span class="pending-edit-card-label">${label}</span>
                    `}
                </div>
            </article>
        `;
    }

    /**
     * Polling + descarga + upload + insert + refresh, todo en background.
     * Manda toast al final (exito o error) y remueve el skeleton.
     */
    _completeEditInBackground(args) {
        const { createPayload, userInstruction, mode, productId, productName, entityId } = args;
        return this._runStandaloneKieOp({
            ...args,
            kind: 'image_edit',
            downloadKind: undefined, // _downloadAndUploadEditResult default
            successLabel: 'Edicion lista en el grid',
            failLabel: 'Edicion fallo',
            entityIdOverride: entityId,
            promptUsed: createPayload.refined_prompt,
            openaiTokens: {
                input: createPayload.openai_input_tokens || 0,
                output: createPayload.openai_output_tokens || 0,
                model: createPayload.openai_model || 'gpt-4o-mini'
            },
            buildModels: (cp) => ({
                editor: cp.kie_model || null,
                prompter: cp.openai_model || null
            }),
            buildTechnicalParams: (_cp, ar) => ({ output_format: 'png', aspect_ratio: ar || null }),
            buildMetadataExtras: (cp, sourceOutputId) => ({
                edit_mode: mode || 'remove',
                edit_user_instruction: userInstruction,
                edit_refined_prompt: cp.refined_prompt,
                mask_storage_path: cp.mask_storage_path,
                product_id: productId || null,
                product_name: productName || null
            })
        });
    }

    /**
     * Pinta el estado del CTA apply: idle | loading | error. En loading bloquea
     * Aplicar+Cancelar; en error desbloquea ambos y muestra mensaje inline.
     */
    _setEditApplyState({ phase, message, lock }) {
        const applyBtn = document.querySelector('.pmodal-edit-btn--accent[data-edit-action="apply"]');
        const cancelBtn = document.querySelector('.pmodal-edit-btn--ghost[data-edit-action="cancel"]');
        const panel = document.querySelector('.pmodal-edit-panel');
        if (!panel) return;

        let status = panel.querySelector('.pmodal-edit-status');
        if (!status) {
            status = document.createElement('div');
            status.className = 'pmodal-edit-status';
            // El anchor debe ser hijo directo del panel: usamos el bloque de
            // controles del Director Console (donde viven pills + acciones).
            const anchor = panel.querySelector('.pmodal-edit-director-controls')
                || panel.querySelector('.pmodal-edit-actions');
            if (anchor && anchor.parentElement === panel) {
                panel.insertBefore(status, anchor);
            } else {
                panel.appendChild(status);
            }
        }

        if (phase === 'loading') {
            status.textContent = message || 'Procesando...';
            status.dataset.state = 'loading';
            status.hidden = false;
            if (applyBtn) applyBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = !!lock;
            return;
        }
        if (phase === 'error') {
            status.textContent = message || 'Error';
            status.dataset.state = 'error';
            status.hidden = false;
            if (applyBtn) applyBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            return;
        }
        // idle
        status.textContent = '';
        status.hidden = true;
        delete status.dataset.state;
        if (applyBtn) applyBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
    }

    async _getAccessToken() {
        if (!this.supabase?.auth?.getSession) return null;
        const { data } = await this.supabase.auth.getSession();
        return data?.session?.access_token || null;
    }

    /**
     * Cierra el cobro tras polling success. Llama kie-task-finalize que lee
     * creditsConsumed REAL de KIE y cobra: KIE_real_usd + OpenAI_tokens +
     * markup_per_kind. Patron premium SaaS: no se cobra si la tarea falla.
     *
     * @returns {Promise<{credits_charged, cost_breakdown} | null>} null si
     *   el finalize falla — el frontend debe igual insertar el row pero
     *   loguear el incidente (KIE genero sin que cobraramos = perdida nuestra).
     */
    async _finalizeKieTask({ taskId, kind, sourceOutputId = null, openaiInputTokens = 0, openaiOutputTokens = 0, openaiModel = 'gpt-4o-mini' }) {
        try {
            const accessToken = await this._getAccessToken();
            if (!accessToken) throw new Error('No hay sesion activa');
            const res = await fetch('/.netlify/functions/kie-task-finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                    task_id: taskId,
                    kind,
                    organization_id: this.organizationId,
                    source_output_id: sourceOutputId,
                    openai_input_tokens: openaiInputTokens,
                    openai_output_tokens: openaiOutputTokens,
                    openai_model: openaiModel
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                console.warn('[finalize] failed', { kind, taskId, status: res.status, body: data });
                return null;
            }
            return data;
        } catch (err) {
            console.error('[finalize] exception', { kind, taskId, err });
            return null;
        }
    }

    /**
     * Helper unificado para los 4 background completers (upscale, remove-bg,
     * fix-text, edit). Antes cada uno duplicaba ~80 lineas con la misma
     * estructura: poll → download+upload → finalize → insert → toast/cleanup.
     *
     * Refactor del audit P2#1 (2026-05-25): un solo flujo, los completers
     * son ahora wrappers de 5 lineas que pasan la config especifica al op.
     *
     * @param {Object} opts
     * @param {string} opts.clientId — id del skeleton pending card
     * @param {string} opts.taskId — KIE task id (del create endpoint)
     * @param {Object} opts.createPayload — respuesta del create endpoint
     * @param {string|null} opts.sourceOutputId — output original (para linaje)
     * @param {string} opts.sourceImageUrl — imagen original (reference_image_url)
     * @param {string|null} opts.aspectRatio — aspect ratio detectado
     * @param {Object} opts.sourceInfo — snapshot del linaje (brief/persona/campaign)
     * @param {string} opts.kind — metadata.kind canonico (image_upscale, image_edit, etc)
     * @param {string} opts.downloadKind — etiqueta para storage path (upscale, fix-text, etc)
     * @param {string} opts.successLabel — toast de exito (sin sufijo "cobrado")
     * @param {string} opts.failLabel — toast de fallo (sin mensaje de error)
     * @param {Function} opts.buildTechnicalParams — (createPayload, aspectRatio) => {}
     * @param {Function} opts.buildMetadataExtras — (createPayload, sourceOutputId) => {}
     * @param {Function} opts.buildModels — (createPayload) => { editor, prompter }
     * @param {string|null} [opts.promptUsed] — texto del prompt si aplica
     * @param {string|null} [opts.entityIdOverride] — gana sobre sourceInfo.entityId (edit usa producto seleccionado)
     * @param {{input:number,output:number,model:string}|null} [opts.openaiTokens] — para finalize cobro dinamico
     * @returns {Promise<{credits_charged?:number}|null>} finalize result o null si fallo
     */
    async _runStandaloneKieOp(opts) {
        const {
            clientId, taskId, createPayload, sourceOutputId, sourceImageUrl,
            aspectRatio, sourceInfo, kind, downloadKind, successLabel, failLabel,
            buildTechnicalParams, buildMetadataExtras, buildModels,
            promptUsed = null, entityIdOverride = null, openaiTokens = null
        } = opts;
        try {
            const kieResultUrl = await this._pollKieTask(taskId, { timeoutMs: KIE_POLL_TIMEOUT_MS, intervalMs: KIE_POLL_INTERVAL_MS });
            const { storagePath } = await this._downloadAndUploadEditResult({ kieUrl: kieResultUrl, taskId, kind: downloadKind });

            if (!this.brandContainerId) throw new Error('Falta brand_container_id');
            if (!this.userId) throw new Error('Falta user_id');

            const finalize = await this._finalizeKieTask({
                taskId,
                kind,
                sourceOutputId,
                openaiInputTokens: openaiTokens?.input || 0,
                openaiOutputTokens: openaiTokens?.output || 0,
                openaiModel: openaiTokens?.model || 'gpt-4o-mini'
            });

            const sm = sourceInfo || {};
            const row = {
                brand_container_id: this.brandContainerId,
                organization_id: this.organizationId || null,
                user_id: this.userId,
                provider: 'kie',
                output_type: 'image',
                external_job_id: taskId,
                status: 'completed',
                // Hereda el run del output original (DEBT 2026-05-26): asi la
                // edicion standalone aparece en el canvas run-scoped del run activo.
                run_id: sm.runId || null,
                entity_id: entityIdOverride || sm.entityId || null,
                brief_id: sm.briefId || null,
                persona_id: sm.personaId || null,
                campaign_id: sm.campaignId || null,
                reference_image_url: sourceImageUrl || null,
                models: buildModels(createPayload),
                ...(promptUsed ? { prompt_used: promptUsed } : {}),
                storage_path: storagePath,
                technical_params: buildTechnicalParams(createPayload, aspectRatio),
                metadata: {
                    kind,
                    source_output_id: sourceOutputId,
                    ...buildMetadataExtras(createPayload, sourceOutputId),
                    credits_charged: finalize?.credits_charged ?? null,
                    cost_breakdown: finalize?.cost_breakdown ?? null
                },
                updated_at: new Date().toISOString()
            };
            const { error } = await this.supabase.from('system_ai_outputs').insert(row);
            if (error) throw error;

            this._removePendingEditCard(clientId);
            try { await this.loadMoreHistorySources({ reset: true }); } catch (_) { /* noop */ }
            try { await this.renderHistorySection(); } catch (_) { /* noop */ }
            if (typeof window.showToast === 'function') {
                const c = finalize?.credits_charged;
                const suffix = (typeof c === 'number') ? ` (cobrado: ${c.toFixed(2)} cred)` : '';
                window.showToast(`${successLabel}${suffix}`);
            }
            return finalize;
        } catch (err) {
            console.error(`[${kind}] background error:`, err);
            this._markPendingEditError(clientId, err.message || String(err));
            if (typeof window.showToast === 'function') {
                window.showToast(`${failLabel}: ${err.message || err}`);
            }
            return null;
        }
    }

    /**
     * Poll kling-video-status (que es generico para cualquier taskId de kie.ai).
     * Devuelve la URL de la imagen generada cuando state=success.
     */
    async _pollKieTask(taskId, { timeoutMs = KIE_POLL_TIMEOUT_MS, intervalMs = KIE_POLL_INTERVAL_MS } = {}) {
        const accessToken = await this._getAccessToken();
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const res = await fetch(`/.netlify/functions/kling-video-status?taskId=${encodeURIComponent(taskId)}`, {
                method: 'GET',
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
            });
            const data = await res.json().catch(() => ({}));
            const d = data?.data || {};
            const state = (d.state || d.status || '').toLowerCase();
            if (state === 'success') {
                // kie devuelve resultJson como STRING JSON; hay que parsearlo
                // para sacar resultUrls. Mismo patron que VideoView.
                let resultJson = d.resultJson;
                if (typeof resultJson === 'string') {
                    try { resultJson = JSON.parse(resultJson); } catch (_) { resultJson = null; }
                }
                let urls = resultJson?.resultUrls || d.resultUrls || d.result_urls || [];
                if (typeof urls === 'string') {
                    try { urls = JSON.parse(urls); } catch (_) { urls = [urls]; }
                }
                const url = Array.isArray(urls) ? urls[0] : urls;
                if (!url) {
                    console.warn('[edit-overlay] kie success sin url. data:', d);
                    throw new Error('kie devolvio success sin resultUrls');
                }
                return url;
            }
            if (state === 'fail' || state === 'failed') {
                throw new Error(d.failMsg || d.failReason || 'kie reporto fallo');
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }
        throw new Error('Tiempo de espera agotado esperando a kie.ai');
    }

    /**
     * Persiste el output de kie a Supabase Storage SERVER-SIDE via
     * /.netlify/functions/kie-output-persist. Evita el limite de 6MB de
     * Netlify Functions en el response body (browser-side haria base64 que
     * infla 33% — una imagen 4K de 5-15MB sobrepasa el limite y devuelve 502).
     *
     * @param {{kieUrl: string, taskId: string, kind?: string}} args
     *   kind: 'edit' | 'upscale' | 'remove-bg' | 'variations' (default 'edit')
     */
    async _downloadAndUploadEditResult({ kieUrl, taskId, kind = 'edit' }) {
        const accessToken = await this._getAccessToken();
        if (!accessToken) throw new Error('No hay sesion activa');

        const res = await fetch('/.netlify/functions/kie-output-persist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
                kie_url: kieUrl,
                task_id: taskId,
                kind,
                bucket: 'production-outputs'
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || `Persist HTTP ${res.status}`);
        }
        return {
            storagePath: data.storage_path,
            publicUrl: data.public_url
        };
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
                        this.openPublishSheet();
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
                        if (ic) ic.className = 'aisc-ico aisc-ico--likes';
                        // Sincronizar también el corazón del overlay de la card en la grilla.
                        const cardLike = document.querySelector(`.history-image-card[data-output-id="${CSS.escape(state.outputId || '')}"] .card-action--like, .history-video-card[data-output-id="${CSS.escape(state.outputId || '')}"] .card-action--like`);
                        if (cardLike) {
                            cardLike.classList.toggle('is-liked', nowLiked);
                            cardLike.setAttribute('aria-pressed', nowLiked ? 'true' : 'false');
                            const cardIcon = cardLike.querySelector('i');
                            if (cardIcon) cardIcon.className = 'aisc-ico aisc-ico--likes';
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
                    case 'copy-copyzone': {
                        // Copia la zona completa como texto: copy + CTA + hashtags.
                        const c = this._modalCopy || {};
                        const parts = [];
                        if (c.text) parts.push(c.text);
                        if (c.cta) parts.push(c.cta);
                        if (c.hashtags && c.hashtags.length) parts.push(c.hashtags.join(' '));
                        const text = parts.join('\n\n');
                        if (text && navigator.clipboard?.writeText) {
                            try {
                                await navigator.clipboard.writeText(text);
                                if (typeof window.showToast === 'function') window.showToast('Copy copiado');
                            } catch (_) {}
                        }
                        break;
                    }
                    case 'edit-copy': {
                        const card = modal.querySelector('#pmodalCopyCard');
                        card?.querySelector('[data-copy-view]')?.setAttribute('hidden', '');
                        const ed = card?.querySelector('[data-copy-edit]');
                        if (ed) { ed.hidden = false; ed.querySelector('[data-copy-field="text"]')?.focus(); }
                        card?.classList.add('is-editing');
                        break;
                    }
                    case 'cancel-copy': {
                        // Re-render restaura la vista con los valores originales.
                        if (this._modalState?.output) {
                            this._renderModalPrompt(this._modalState.output.generated_copy, this._modalState.output, null);
                        }
                        break;
                    }
                    case 'save-copy': {
                        await this._saveModalCopy(modal, btn);
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
                promptToggle.querySelector('i').className = expanded ? 'aisc-ico aisc-ico--chevron-up' : 'aisc-ico aisc-ico--chevron-down';
            });
        }

        // Esc cierra el modal. Si el overlay de edit esta abierto, su propio
        // handler captura Escape primero (stopPropagation) y este no se dispara.
        // Defensive: si por alguna razon stopPropagation falla, no cerrar el
        // modal mientras el overlay esta visible.
        if (!this._modalEscBound) {
            this._modalEscBound = true;
            this._modalEscHandler = (e) => {
                if (e.key !== 'Escape' || !modal.classList.contains('is-open')) return;
                const editOverlay = document.getElementById('pmodalEditOverlay');
                if (editOverlay && !editOverlay.hidden) return;
                this.closeProductionModal();
            };
            document.addEventListener('keydown', this._modalEscHandler);
        }

        this._initModalZoom(modal);
    }

    // ====================================================================
    // Zoom + paneo del asset (inspector tipo Lightroom/Figma). Aplica un
    // transform translate+scale al media VISIBLE (img o video). Rueda = zoom
    // al cursor; arrastre = paneo cuando esta acercado; doble clic = toggle.
    // Se desactiva mientras el overlay de edicion esta abierto (la mascara
    // necesita la imagen sin transform). El toolbar/overlay no se transforman.
    // ====================================================================
    _initModalZoom(modal) {
        if (modal._zoomBound) return;
        modal._zoomBound = true;
        const stage = modal.querySelector('.production-modal-visual-inner');
        if (!stage) return;
        this._zoom = { scale: 1, x: 0, y: 0 };
        this._zoomPan = null;

        // Controles minimos (aparecen al hover del visual o cuando hay zoom).
        const visual = modal.querySelector('.production-modal-visual');
        if (visual && !visual.querySelector('.pmodal-zoom-controls')) {
            const ctr = document.createElement('div');
            ctr.className = 'pmodal-zoom-controls';
            ctr.innerHTML = `
                <button type="button" class="pmodal-zoom-btn" data-zoom="out" aria-label="Alejar"><i class="aisc-ico aisc-ico--minus"></i></button>
                <span class="pmodal-zoom-level">100%</span>
                <button type="button" class="pmodal-zoom-btn" data-zoom="in" aria-label="Acercar"><i class="aisc-ico aisc-ico--add"></i></button>
                <button type="button" class="pmodal-zoom-btn pmodal-zoom-reset" data-zoom="reset" aria-label="Ajustar"><i class="aisc-ico aisc-ico--minimize"></i></button>`;
            visual.appendChild(ctr);
            ctr.addEventListener('click', (e) => {
                const b = e.target.closest('[data-zoom]'); if (!b) return;
                const act = b.getAttribute('data-zoom');
                if (act === 'reset') { this._resetModalZoom(); return; }
                // Botones acercan/alejan respecto al centro.
                this._setModalZoom(this._zoom.scale * (act === 'in' ? 1.4 : 1 / 1.4), 0, 0);
            });
        }

        const editing = () => {
            const ov = document.getElementById('pmodalEditOverlay');
            return ov && !ov.hidden;
        };

        // Rueda: zoom hacia el cursor. Normalizamos el delta porque algunos
        // mouse reportan en lineas (deltaMode 1) o paginas (2) en vez de px,
        // lo que hacia el zoom lentisimo. Lo pasamos a px y aplicamos una tasa
        // exponencial agil (~35-45% por muesca tipica).
        stage.addEventListener('wheel', (e) => {
            if (editing()) return;
            e.preventDefault();
            const rect = stage.getBoundingClientRect();
            const ox = e.clientX - (rect.left + rect.width / 2);
            const oy = e.clientY - (rect.top + rect.height / 2);
            let dy = e.deltaY;
            if (e.deltaMode === 1) dy *= 16;        // lineas -> px
            else if (e.deltaMode === 2) dy *= rect.height || 800; // paginas -> px
            // Acotar el paso por evento para que un golpe fuerte de trackpad no
            // salte de golpe.
            dy = Math.max(-120, Math.min(120, dy));
            this._setModalZoom(this._zoom.scale * Math.exp(-dy * 0.004), ox, oy);
        }, { passive: false });

        // Doble clic: alterna 1x <-> 2.5x en el punto del cursor.
        stage.addEventListener('dblclick', (e) => {
            if (editing()) return;
            e.preventDefault();
            const rect = stage.getBoundingClientRect();
            const ox = e.clientX - (rect.left + rect.width / 2);
            const oy = e.clientY - (rect.top + rect.height / 2);
            this._setModalZoom(this._zoom.scale > 1.05 ? 1 : 2.5, ox, oy);
        });

        // Arrastre = paneo (solo cuando esta acercado, para no robar los
        // controles del video al 100%).
        stage.addEventListener('pointerdown', (e) => {
            if (editing() || this._zoom.scale <= 1.001 || e.button !== 0) return;
            e.preventDefault();
            this._zoomPan = { px: e.clientX, py: e.clientY, x: this._zoom.x, y: this._zoom.y };
            stage.classList.add('is-panning');
            try { stage.setPointerCapture(e.pointerId); } catch (_) {}
        });
        stage.addEventListener('pointermove', (e) => {
            if (!this._zoomPan) return;
            this._zoom.x = this._zoomPan.x + (e.clientX - this._zoomPan.px);
            this._zoom.y = this._zoomPan.y + (e.clientY - this._zoomPan.py);
            this._clampZoomPan();
            this._applyModalZoom();
        });
        const endPan = (e) => {
            if (!this._zoomPan) return;
            this._zoomPan = null;
            stage.classList.remove('is-panning');
            try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        stage.addEventListener('pointerup', endPan);
        stage.addEventListener('pointercancel', endPan);
    }

    _zoomTargetEl() {
        const video = document.getElementById('pmodalVideo');
        if (video && !video.hidden) return video;
        const img = document.getElementById('pmodalImage');
        if (img && !img.hidden) return img;
        return null;
    }

    _setModalZoom(scale, ox = 0, oy = 0) {
        if (!this._zoom) this._zoom = { scale: 1, x: 0, y: 0 };
        const s1 = this._zoom.scale;
        const s2 = Math.max(1, Math.min(6, scale));
        if (s2 <= 1.001) {
            this._zoom = { scale: 1, x: 0, y: 0 };
        } else {
            // Mantener fijo el punto bajo el cursor (ox,oy relativos al centro).
            const k = s2 / s1;
            this._zoom.x = ox - k * (ox - this._zoom.x);
            this._zoom.y = oy - k * (oy - this._zoom.y);
            this._zoom.scale = s2;
            this._clampZoomPan();
        }
        this._applyModalZoom();
    }

    _clampZoomPan() {
        const el = this._zoomTargetEl();
        if (!el || !this._zoom) return;
        const s = this._zoom.scale;
        // Limite: el asset escalado no puede salirse de su huella original
        // centrada (no se revela vacio alrededor).
        const maxX = Math.max(0, (s - 1) * el.offsetWidth / 2);
        const maxY = Math.max(0, (s - 1) * el.offsetHeight / 2);
        this._zoom.x = Math.max(-maxX, Math.min(maxX, this._zoom.x));
        this._zoom.y = Math.max(-maxY, Math.min(maxY, this._zoom.y));
    }

    _applyModalZoom() {
        const z = this._zoom || { scale: 1, x: 0, y: 0 };
        const t = `translate(${z.x}px, ${z.y}px) scale(${z.scale})`;
        const img = document.getElementById('pmodalImage');
        const video = document.getElementById('pmodalVideo');
        if (img) img.style.transform = t;
        if (video) video.style.transform = t;
        const stage = document.querySelector('.production-modal-visual-inner');
        if (stage) stage.classList.toggle('is-zoomed', z.scale > 1.001);
        const visual = document.querySelector('.production-modal-visual');
        if (visual) visual.classList.toggle('has-zoom', z.scale > 1.001);
        const lvl = document.querySelector('.pmodal-zoom-level');
        if (lvl) lvl.textContent = Math.round(z.scale * 100) + '%';
    }

    _resetModalZoom() {
        this._zoom = { scale: 1, x: 0, y: 0 };
        this._zoomPan = null;
        this._applyModalZoom();
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
            const statusIcon = status.status === 'active' ? 'aisc-ico aisc-ico--circle' : 
                             status.status === 'paused' ? 'aisc-ico aisc-ico--pause' : 
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
                icon: 'aisc-ico aisc-ico--star',
                subtitle: this.section3Data.topEntity.entity_type
            });
        }
        
        // 3️⃣ Formato de Producción Dominante
        if (this.section3Data.formatDistribution && this.section3Data.formatDistribution.formats) {
            const topFormat = this.section3Data.formatDistribution.formats[0];
            if (topFormat) {
                const formatIcon = topFormat.type === 'image' ? 'aisc-ico aisc-ico--image' :
                                 topFormat.type === 'video' ? 'aisc-ico aisc-ico--video' :
                                 'aisc-ico aisc-ico--document';
                
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
                icon: 'aisc-ico aisc-ico--growth'
            });
        }
        
        // Campaña Activa (si existe)
        if (this.section3Data.activeCampaign && this.section3Data.activeCampaign.has_active_campaign) {
            const campaign = this.section3Data.activeCampaign;
            highlights.push({
                title: 'Campaña Activa',
                value: campaign.campaign_name || 'Campaña sin nombre',
                label: `${campaign.total_productions} producciones`,
                icon: 'aisc-ico aisc-ico--campaign',
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
                    icon: 'aisc-ico aisc-ico--flows'
                });
            }
            
            // Productos
            if (this.products.length > 0) {
                highlights.push({
                    title: 'Productos',
                    value: this.products.length,
                    label: 'en tu marca',
                    icon: 'aisc-ico aisc-ico--product'
                });
            }
            
            // Producciones totales
            const totalProductions = (this.flowOutputs?.length || 0) + (this.systemAiOutputs?.length || 0);
            if (totalProductions > 0) {
                highlights.push({
                    title: 'Producido',
                    value: totalProductions,
                    label: 'renders generados',
                    icon: 'aisc-ico aisc-ico--gallery'
                });
            }
        }
        
        if (highlights.length === 0) {
            highlightsContent.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--living-text-muted);">
                    <i class="aisc-ico aisc-ico--growth" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
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
                        : `<div class="featured-card-visual-placeholder"><i class="aisc-ico aisc-ico--image"></i></div>`
                    }
                        </div>
                <div class="featured-card-prompt-overlay">
                    <div class="featured-card-prompt-title">Prompt</div>
                    <div class="featured-card-prompt-text">${this.escapeHtml(prompt)}</div>
                    </div>
                <button class="featured-card-download-btn" title="Descargar imagen" data-image-url="${this.escapeHtml(finalImageUrl || '')}">
                    <i class="aisc-ico aisc-ico--dowload"></i>
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
        // R2 (media.aismartcontent.io): storage_path puede ser URL completa -> pass-through
        if (typeof filePath === 'string' && /^(https?:|\/\/)/i.test(filePath.trim())) return filePath.trim();
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
        this._closeCampaignPicker?.();
        this.selectedOutputs?.clear();
        this.likedOutputs?.clear();
        // Modal listener global de Esc.
        if (this._modalEscHandler) {
            document.removeEventListener('keydown', this._modalEscHandler);
            this._modalEscHandler = null;
            this._modalEscBound = false;
        }
        this._modalState = null;
        // Observers/listeners que viven mientras hay modal abierto: desconectar al
        // desmontar la vista (antes solo se limpiaban al re-abrir, no al salir).
        if (this._siblingObserver) { try { this._siblingObserver.disconnect(); } catch (_) {} this._siblingObserver = null; }
        if (this._editCanvasRo) { try { this._editCanvasRo.disconnect(); } catch (_) {} this._editCanvasRo = null; }
        if (this._endStrokeHandler) { try { window.removeEventListener('mouseup', this._endStrokeHandler); } catch (_) {} this._endStrokeHandler = null; }
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
