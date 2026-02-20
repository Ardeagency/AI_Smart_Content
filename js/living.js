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
                this.loadFlowRuns(),
                this.loadCreditUsage()
            ]);

            // Cargar flow outputs después de flow runs
            if (this.flowRuns && this.flowRuns.length > 0) {
                await this.loadFlowOutputs();
            }

            // Cargar contenido generado después de obtener brand_id
            await this.loadLatestGeneratedContent();

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
            // Prioridad 1: Usar SupabaseService si está disponible
            if (window.supabaseService) {
                this.supabase = await window.supabaseService.getClient();
                if (this.supabase && this.isValidSupabaseClient(this.supabase)) {
                    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
                    if (!authError && user) {
                        this.userId = user.id;
                    if (this.userId) {
                        // Supabase inicializado desde SupabaseService
                        return;
                        }
                    }
                }
            }

            // Prioridad 2: Usar waitForSupabase si está disponible
            if (typeof waitForSupabase === 'function') {
                const supabaseClient = await waitForSupabase();
                if (supabaseClient && this.isValidSupabaseClient(supabaseClient)) {
                    this.supabase = supabaseClient;
                    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
                    if (!authError && user) {
                        this.userId = user.id;
                        if (this.userId) {
                        // Supabase inicializado desde waitForSupabase
                        return;
                        }
                    }
                }
            }

            // Prioridad 3: Usar window.supabaseClient
            if (window.supabaseClient && this.isValidSupabaseClient(window.supabaseClient)) {
                this.supabase = window.supabaseClient;
                const { data: { user }, error: authError } = await this.supabase.auth.getUser();
                if (!authError && user) {
                    this.userId = user.id;
                    if (this.userId) {
                    // Supabase inicializado desde window.supabaseClient
                    return;
                    }
                }
            }

            // Prioridad 4: Usar appLoader.waitFor
            if (window.appLoader && typeof window.appLoader.waitFor === 'function') {
                const supabaseClient = await window.appLoader.waitFor('supabase');
                if (supabaseClient && this.isValidSupabaseClient(supabaseClient)) {
                    this.supabase = supabaseClient;
                    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
                    if (!authError && user) {
                        this.userId = user.id;
                        if (this.userId) {
                        // Supabase inicializado desde appLoader
                        return;
                        }
                    }
                }
            }

            // Prioridad 5: Usar window.supabase directamente
            if (window.supabase && this.isValidSupabaseClient(window.supabase)) {
                this.supabase = window.supabase;
                const { data: { user }, error: authError } = await this.supabase.auth.getUser();
                if (!authError && user) {
                    this.userId = user.id;
                    if (this.userId) {
                    // Supabase inicializado desde window.supabase
                    return;
                    }
                }
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
        // Validar cliente de Supabase antes de hacer consulta
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            this.userData = null;
            return;
        }

        try {
            // Validar que userId sea válido
            if (!this.userId || this.userId === null || this.userId === undefined || this.userId === '') {
                console.warn('⚠️ userId no válido para loadUserData');
                this.userData = null;
                return;
            }

            // Hacer consulta validando que el cliente tenga el método from
            if (typeof this.supabase.from !== 'function') {
                console.error('❌ Cliente de Supabase no tiene método from()');
                this.userData = null;
                return;
            }

            const { data, error } = await this.supabase
                .from('profiles')
                .select('*')
                .eq('id', this.userId)
                .maybeSingle();

            if (error) {
                if (error.status === 400 || error.code === '400') {
                    console.warn('⚠️ Error 400 cargando profiles:', error.message);
                    this.userData = null;
                    return;
                }
                throw error;
            }
            this.userData = data;
        } catch (error) {
            console.error('❌ Error cargando datos de usuario:', error);
            this.userData = null;
        }
    }

    async loadProjectData() {
        // Validar cliente de Supabase antes de hacer consulta
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            this.projectData = null;
            return;
        }

        try {
            // Validar que userId sea válido
            if (!this.userId || this.userId === null || this.userId === undefined || this.userId === '') {
                console.warn('⚠️ userId no válido para loadProjectData');
                this.projectData = null;
                return;
            }

            // Validar que el cliente tenga el método from
            if (typeof this.supabase.from !== 'function') {
                console.error('❌ Cliente de Supabase no tiene método from()');
                this.projectData = null;
                return;
            }

            // La tabla correcta es brand_containers, no projects
            // brand_containers no tiene columna is_active
            const { data, error } = await this.supabase
                .from('brand_containers')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                if (error.status === 400 || error.code === '400') {
                    console.warn('⚠️ Error 400 cargando brand_containers:', error.message);
                    this.projectData = null;
                    return;
                }
                throw error;
            }
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
        // Validar cliente de Supabase antes de hacer consulta
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            this.products = [];
            return;
        }

        try {
            // Validar que userId sea válido
            if (!this.userId || typeof this.userId !== 'string' || this.userId.trim() === '') {
                console.warn('⚠️ userId no válido para loadProducts');
                this.products = [];
                return;
            }

            // Validar que el cliente tenga el método from
            if (typeof this.supabase.from !== 'function') {
                console.error('❌ Cliente de Supabase no tiene método from()');
                this.products = [];
                return;
            }

            // Usar brandContainerId si ya está cargado, sino cargarlo
            if (!this.brandContainerId) {
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
                    this.products = [];
                    return;
            }
            
            if (!container || !container.id) {
                this.products = [];
                return;
            }

            // Validar que container.id sea un UUID válido
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(container.id)) {
                console.warn('⚠️ container.id no es un UUID válido:', container.id);
                this.products = [];
                return;
                }

                this.brandContainerId = container.id;
            }

            // Products usa brand_container_id según schema.sql (línea 309)
            const { data, error } = await this.supabase
                .from('products')
                .select('id, nombre_producto, tipo_producto, precio_producto, moneda, created_at')
                .eq('brand_container_id', this.brandContainerId)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.status === 400 || error.code === '400') {
                    console.warn('⚠️ Error 400 cargando productos:', error.message);
                    console.warn('⚠️ brand_container_id usado:', this.brandContainerId);
                    this.products = [];
                    return;
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
        // Validar cliente de Supabase antes de hacer consulta
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            this.flowRuns = [];
            return;
        }

        try {
            // Validar que el cliente tenga el método from
            if (typeof this.supabase.from !== 'function') {
                console.error('❌ Cliente de Supabase no tiene método from()');
                this.flowRuns = [];
                return;
            }

            // brand_id ya debería estar cargado antes de llamar a esta función
            // Validar que al menos uno de los IDs sea válido
            const hasValidBrandId = this.brandId && this.brandId !== null && this.brandId !== undefined && this.brandId !== '';
            const hasValidUserId = this.userId && this.userId !== null && this.userId !== undefined && this.userId !== '';

            if (!hasValidBrandId && !hasValidUserId) {
                console.warn('⚠️ No hay brand_id ni user_id válido para filtrar flow_runs');
                this.flowRuns = [];
                return;
            }

            let query = this.supabase
                .from('flow_runs')
                .select('*, content_flows(name)')
                .order('created_at', { ascending: false })
                .limit(100);

            // Filtrar por brand_id si está disponible y es válido, sino por user_id
            if (hasValidBrandId) {
                query = query.eq('brand_id', this.brandId);
            } else {
                query = query.eq('user_id', this.userId);
            }

            let { data, error } = await query;

            if (error) {
                const isBadRequest = error.status === 400 || error.code === '400' || error.code === 'PGRST301' || error.code === 'PGRST116';
                if (isBadRequest) {
                    query = this.supabase.from('flow_runs').select('*').order('created_at', { ascending: false }).limit(100);
                    if (hasValidBrandId) query = query.eq('brand_id', this.brandId);
                    else query = query.eq('user_id', this.userId);
                    const res = await query;
                    this.flowRuns = (res.error) ? [] : (res.data || []);
                    return;
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
        // Validar cliente de Supabase antes de hacer consulta
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.flowRuns || !this.flowRuns.length) {
            this.flowOutputs = [];
            return;
        }

        try {
            // Validar que el cliente tenga el método from
            if (typeof this.supabase.from !== 'function') {
                console.error('❌ Cliente de Supabase no tiene método from()');
                this.flowOutputs = [];
                return;
            }

            const runIds = this.flowRuns
                .map(run => run?.id)
                .filter(id => id !== null && id !== undefined);
            
            if (runIds.length === 0) {
                this.flowOutputs = [];
                return;
            }

            const { data, error } = await this.supabase
                .from('runs_outputs')
                .select('*')
                .in('run_id', runIds)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.status === 400 || error.code === '400') {
                    console.warn('⚠️ Error 400 cargando runs_outputs:', error.message);
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
        // Validar cliente de Supabase antes de hacer consulta
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            this.creditUsage = [];
            return;
        }

        try {
            // Validar que userId sea válido antes de hacer la consulta
            if (!this.userId || this.userId === null || this.userId === undefined || this.userId === '') {
                console.warn('⚠️ userId no válido para loadCreditUsage');
                this.creditUsage = [];
                return;
            }

            // Validar que el cliente tenga el método from
            if (typeof this.supabase.from !== 'function') {
                console.error('❌ Cliente de Supabase no tiene método from()');
                this.creditUsage = [];
                return;
            }

            const { data, error } = await this.supabase
                .from('credit_usage')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                // Si es un error 400, loguear pero no lanzar error
                if (error.status === 400 || error.code === '400') {
                    console.warn('⚠️ Error 400 cargando credit_usage:', error.message);
                    console.warn('⚠️ userId:', this.userId);
                    this.creditUsage = [];
                    return;
                }
                throw error;
            }
            this.creditUsage = data || [];
        } catch (error) {
            console.error('❌ Error cargando credit usage:', error);
            this.creditUsage = [];
        }
    }

    async loadBrandId() {
        // Validar cliente de Supabase antes de hacer consulta
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase) || !this.userId) {
            this.brandId = null;
            return;
        }

        try {
            // Validar que userId sea válido
            if (!this.userId || this.userId === null || this.userId === undefined || this.userId === '') {
                console.warn('⚠️ userId no válido para loadBrandId');
                this.brandId = null;
                return;
            }

            // Validar que el cliente tenga el método from
            if (typeof this.supabase.from !== 'function') {
                console.error('❌ Cliente de Supabase no tiene método from()');
                this.brandId = null;
                return;
            }

            // Primero obtener brand_container por user_id
            const { data: container, error: containerError } = await this.supabase
                .from('brand_containers')
                .select('id, organization_id')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (containerError) {
                if (containerError.status === 400 || containerError.code === '400') {
                    console.warn('⚠️ Error 400 cargando brand_containers en loadBrandId:', containerError.message);
                    this.brandId = null;
                    this.brandContainerId = null;
                    this.organizationId = null;
                    return;
                }
                throw containerError;
            }
            
            if (!container || !container.id) {
                this.brandId = null;
                this.brandContainerId = null;
                this.organizationId = null;
                return;
            }

            // Guardar brand_container_id y organization_id
            this.brandContainerId = container.id;
            this.organizationId = container.organization_id;

            // Luego obtener brand usando project_id que referencia a brand_container.id
            const { data: brand, error: brandError } = await this.supabase
                .from('brands')
                .select('id')
                .eq('project_id', container.id)
                .maybeSingle();

            if (brandError) {
                if (brandError.status === 400 || brandError.code === '400') {
                    console.warn('⚠️ Error 400 cargando brands en loadBrandId:', brandError.message);
                    this.brandId = null;
                    return;
                }
                throw brandError;
            }
            this.brandId = brand?.id || null;
        } catch (error) {
            console.error('❌ Error cargando brand_id:', error);
            this.brandId = null;
        }
    }

    async loadLatestGeneratedContent() {
        // Función RPC eliminada para evitar errores 400
        // Usar runs_outputs directamente (schema real: runs_outputs)
        // Validar cliente de Supabase antes de hacer consulta
        if (!this.supabase || !this.isValidSupabaseClient(this.supabase)) {
            this.latestGeneratedContent = [];
            return;
        }

        try {
            // Validar que el cliente tenga el método from
            if (typeof this.supabase.from !== 'function') {
                console.error('❌ Cliente de Supabase no tiene método from()');
                this.latestGeneratedContent = [];
                return;
            }

            // Primero obtener brand_id si no lo tenemos
            if (!this.brandId) {
                await this.loadBrandId();
            }

            if (!this.brandId) {
                // No hay brand_id disponible, saltando carga de contenido generado
                this.latestGeneratedContent = [];
                return;
            }

            // Cargar contenido desde runs_outputs (schema real) usando método seguro (sin joins complejos)
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

            // Paso 2: Obtener runs_outputs usando los run_ids
            const runIds = runs.map(r => r.id).filter(id => id !== null && id !== undefined);
            
            if (runIds.length === 0) {
                this.latestGeneratedContent = [];
                return;
            }

            // Validar que runIds sean UUIDs válidos antes de usar en .in()
            const validRunIds = runIds.filter(id => {
                // Validar que sea un UUID válido (formato básico)
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return id && typeof id === 'string' && uuidRegex.test(id);
            });

            if (validRunIds.length === 0) {
                console.warn('⚠️ No hay run_ids válidos (UUIDs) para cargar runs_outputs');
                this.latestGeneratedContent = [];
                return;
            }

            // Seleccionar campos específicos incluyendo prompt_used y otros campos de texto
            // Esto asegura que prompt_used se traiga correctamente
            const { data: outputs, error: outputsError } = await this.supabase
                .from('runs_outputs')
                .select('id, run_id, output_type, storage_path, storage_object_id, prompt_used, generated_copy, text_content, metadata, created_at, generated_hashtags, creative_rationale')
                .in('run_id', validRunIds)
                .order('created_at', { ascending: false })
                .limit(10);

            if (outputsError) {
                if (outputsError.status === 400 || outputsError.code === '400') {
                    console.warn('⚠️ Error 400 cargando runs_outputs:', outputsError.message);
                    console.warn('⚠️ runIds usados:', validRunIds);
                }
                this.latestGeneratedContent = [];
                return;
            }

            this.latestGeneratedContent = outputs || [];

            if (this.latestGeneratedContent.length > 0) {
                // Contenido generado cargado
            }
        } catch (error) {
            console.error('❌ Error loading latest generated content:', error);
            this.latestGeneratedContent = [];
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

        // Todo el contenido producido: flow runs + contenido generado (sin excluir)
        const fromRuns = (this.flowRuns || []).map(run => {
                const output = this.flowOutputs.find(o => o.run_id === run.id);
                const fileUrl = output?.file_url || output?.storage_path || null;
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
            if (!prompt) prompt = run.status || '';
            return {
                contentType,
                fileUrl,
                prompt,
                run,
                output,
                created_at: run.created_at || output?.created_at,
                _outputId: output?.id
            };
        });

        const fromGenerated = (this.latestGeneratedContent || []).map(item => {
            const fileUrl = item.image_url || item.url || item.storage_url || item.file_url || null;
            let resolvedUrl = fileUrl;
            if (!resolvedUrl && item.storage_path && typeof item.storage_path === 'string' && item.storage_path.trim() !== '') {
                resolvedUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_path);
            }
            if (!resolvedUrl && item.storage_object_id && typeof item.storage_object_id === 'string' && (item.storage_object_id.includes('/') || item.storage_object_id.includes('.'))) {
                resolvedUrl = this.getPublicUrlFromStorage('production-outputs', item.storage_object_id);
            }
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

        const seenIds = new Set();
        let allItems = [...fromRuns, ...fromGenerated]
            .filter(it => {
                const id = it._outputId || it.run?.id + '-' + (it.output?.id || it.created_at);
                if (seenIds.has(id)) return false;
                seenIds.add(id);
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

        if (allItems.length === 0) {
            container.innerHTML = this.renderEmptyState();
            this.setupEmptyStateCta(container);
            return;
        }
        
        container.innerHTML = allItems.map((item, index) => {
            if (item.contentType === 'video') {
                let thumbnailUrl = item.fileUrl;
                if (thumbnailUrl && !thumbnailUrl.startsWith('http') && item.output) {
                    const sp = item.output.storage_path || item.output.storage_object_id;
                    if (sp && typeof sp === 'string' && sp.trim() !== '') {
                        const u = this.getPublicUrlFromStorage('production-outputs', sp);
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
            }).join('');
            
        this.setupHistoryCardListeners(container);
        this.setupHistoryFilters();
    }
    
    setupHistoryFilters() {
        this.populateFlowFilter();
        if (this._historyFiltersSetup) return;
        this._historyFiltersSetup = true;

        const typeSelect = document.getElementById('livingFilterType');
        const flowSelect = document.getElementById('livingFilterFlow');
        if (typeSelect) typeSelect.addEventListener('change', () => {
            this.filterContentType = (typeSelect.value || '').trim();
            this.renderHistorySection();
        });
        if (flowSelect) flowSelect.addEventListener('change', () => {
            this.filterFlowName = (flowSelect.value || '').trim();
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
            this.renderHistorySection();
        };
        gridEl?.addEventListener('click', onGridClick);

        const openDropdown = () => {
            dropdown?.classList.add('is-open');
            dropdown?.setAttribute('aria-hidden', 'false');
            trigger?.setAttribute('aria-expanded', 'true');
            renderCalendar();
        };
        const closeDropdown = () => {
            dropdown?.classList.remove('is-open');
            dropdown?.setAttribute('aria-hidden', 'true');
            trigger?.setAttribute('aria-expanded', 'false');
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
            this.renderHistorySection();
            closeDropdown();
        });
        document.addEventListener('click', (e) => {
            if (dropdown?.classList.contains('is-open') && !dropdown.contains(e.target) && trigger && !trigger.contains(e.target))
                closeDropdown();
        });

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
        const finalUrl = thumbnailUrl && thumbnailUrl.startsWith('http') ? thumbnailUrl : null;
        const productionId = run?.id || output?.id;
        const flowName = this.getFlowName(run);
        const promptSafe = (prompt || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
                <div class="living-history-empty-illustration">
                    <i class="fas fa-layer-group" style="font-size: 3rem; color: var(--living-text-muted); opacity: 0.3;"></i>
                </div>
                <h3 class="living-history-empty-title">Aún no hay historial</h3>
                <p class="living-history-empty-description">
                    Cuando ejecutes flujos y generes contenido, aquí quedará registrado todo tu trabajo creativo.
                </p>
                <a href="#" class="living-history-empty-cta" data-living-empty-cta="studio">
                    Ir a Producción
                </a>
            </div>
        `;
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
            const base = path.startsWith('/org/') ? path.split('/').slice(0, 3).join('/') : '';
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
                            window.router.navigate('/products');
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
            const totalProductions = (this.latestGeneratedContent?.length || 0) + this.flowRuns.length;
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
        const promptEl = document.getElementById('livingViewerPrompt');
        const metadataEl = document.getElementById('livingViewerMetadata');
        const closeBtn = document.getElementById('livingViewerClose');
        const backdrop = document.getElementById('livingViewerBackdrop');
        
        if (!modal || !image || !promptEl || !metadataEl) {
            console.error('❌ Elementos del modal no encontrados');
            return;
        }

        const item = data.item || {};
        const output = item.output || {};
        const run = item.run || {};

        if (data.imageUrl) {
            image.src = data.imageUrl;
            image.alt = data.prompt || 'Producción';
            image.style.transform = 'scale(1)';
            image.style.transformOrigin = 'center center';
        } else {
            image.src = '';
            image.alt = 'Sin imagen disponible';
        }
        
        this.setupImageZoom(image);
        
        const promptText = data.prompt || 'Sin prompt disponible';
        promptEl.textContent = promptText;
        
        // runs_outputs: model, output_type, metadata, technical_params, created_at; opcionales: generated_copy, creative_rationale, generated_hashtags, text_content
        const modelName = (output.metadata && typeof output.metadata === 'object' && output.metadata.model)
            ? output.metadata.model
            : this.getFlowName(run);
        const outputType = output.output_type || '';
        const technicalParams = output.technical_params && typeof output.technical_params === 'object' ? output.technical_params : {};
        const meta = output.metadata && typeof output.metadata === 'object' ? output.metadata : {};
        const quality = technicalParams.quality || meta.quality || '';
        let creationDate = null;
        if (output.created_at) creationDate = new Date(output.created_at).toLocaleString('es-ES');
        else if (item.item && item.item.created_at) creationDate = new Date(item.item.created_at).toLocaleString('es-ES');
        
        const productionImageUrl = (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('http')) ? data.imageUrl : '';
        const rows = [];
        rows.push(`<div class="info-row"><span class="info-label">Model</span><span class="info-value">${this.escapeHtml(modelName)}</span></div>`);
        if (outputType) rows.push(`<div class="info-row"><span class="info-label">Type</span><span class="info-value">${this.escapeHtml(outputType)}</span></div>`);
        rows.push(`<div class="info-row info-row-images"><span class="info-label">Images</span>${productionImageUrl ? `<img class="info-thumb info-thumb-production" src="${this.escapeHtml(productionImageUrl)}" alt="Producción" loading="lazy" />` : '<span class="info-value">—</span>'}</div>`);
        if (quality) rows.push(`<div class="info-row"><span class="info-label">Quality</span><span class="info-value">${this.escapeHtml(String(quality))}</span></div>`);
        if (creationDate) rows.push(`<div class="info-row"><span class="info-label">Created</span><span class="info-value">${this.escapeHtml(creationDate)}</span></div>`);
        if (output.generated_copy && output.generated_copy.trim()) rows.push(`<div class="info-row info-row-copy"><span class="info-label">Copy</span><span class="info-value">${this.escapeHtml(output.generated_copy.trim())}</span></div>`);
        if (output.creative_rationale && output.creative_rationale.trim()) rows.push(`<div class="info-row"><span class="info-label">Rationale</span><span class="info-value">${this.escapeHtml(output.creative_rationale.trim())}</span></div>`);
        if (output.text_content && output.text_content.trim()) rows.push(`<div class="info-row"><span class="info-label">Text</span><span class="info-value">${this.escapeHtml(output.text_content.trim())}</span></div>`);
        if (output.generated_hashtags && (Array.isArray(output.generated_hashtags) ? output.generated_hashtags.length : typeof output.generated_hashtags === 'object')) {
            const tags = Array.isArray(output.generated_hashtags) ? output.generated_hashtags : (output.generated_hashtags.tags || output.generated_hashtags.values || []);
            if (tags.length) rows.push(`<div class="info-row"><span class="info-label">Hashtags</span><span class="info-value">${this.escapeHtml(tags.join(' '))}</span></div>`);
        }
        metadataEl.innerHTML = rows.join('');
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
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
        
        this.setupViewerSeeAllButtons(modal);
        
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    
    setupViewerSeeAllButtons(modal) {
        if (!modal) return;
        const buttons = modal.querySelectorAll('.living-viewer-see-all');
        buttons.forEach(btn => {
            const section = btn.getAttribute('data-section');
            const textEl = btn.querySelector('.living-viewer-see-all-text');
            const iconEl = btn.querySelector('.living-viewer-see-all-icon');
            let expanded = btn.getAttribute('data-expanded') === 'true';
            const content = section === 'prompt'
                ? modal.querySelector('.living-viewer-prompt-text')
                : modal.querySelector('.living-viewer-info-rows');
            const updateLabel = () => {
                if (textEl) textEl.textContent = expanded ? 'Ver menos' : 'Ver todo';
                if (iconEl) {
                    iconEl.classList.remove('fa-chevron-down', 'fa-chevron-up');
                    iconEl.classList.add(expanded ? 'fa-chevron-up' : 'fa-chevron-down');
                }
                btn.setAttribute('data-expanded', expanded ? 'true' : 'false');
                if (content) content.classList.toggle('expanded', expanded);
            };
            updateLabel();
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                expanded = !expanded;
                updateLabel();
            });
        });
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

    // Método destroy() eliminado - sin limpieza manual
}

// Hacer disponible globalmente para que pueda ser usado por LivingView
if (typeof window !== 'undefined') {
    window.LivingManager = LivingManager;
}

// NO inicializar automáticamente - LivingView se encargará de crear la instancia cuando sea necesario
// Esto evita conflictos cuando se navega entre rutas
