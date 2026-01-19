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
                    console.log(`  📸 Output ${index + 1}:`, {
                        id: output.id,
                        storage_path: output.storage_path,
                        storage_object_id: output.storage_object_id,
                        file_url: output.file_url,
                        metadata: output.metadata,
                        has_prompt: !!output.prompt_used,
                        created_at: output.created_at
                    });
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
                // Log detallado de lo que devuelve la RPC
                this.latestGeneratedContent.forEach((item, index) => {
                    const imageUrl = item.image_url || item.url || item.storage_url || item.imageUrl;
                    console.log(`  📸 RPC Item ${index + 1}:`, {
                        image_url: imageUrl,
                        storage_path: item.storage_path,
                        prompt_used: item.prompt_used,
                        style_trend: item.style_trend,
                        created_at: item.created_at,
                        full_item: item
                    });
                    
                    // Validar URL si existe
                    if (imageUrl) {
                        try {
                            const urlObj = new URL(imageUrl);
                            console.log(`    ✅ URL ${index + 1} es válida:`, imageUrl);
                        } catch (error) {
                            console.warn(`    ⚠️ URL ${index + 1} no es válida:`, imageUrl, error);
                        }
                    } else {
                        console.warn(`    ⚠️ RPC Item ${index + 1} no tiene image_url`);
                    }
                });
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
            
            // Validar y procesar URLs de la RPC
            todayProductions = await Promise.all(latestContent.slice(0, 3).map(async (item) => {
                // Intentar obtener URL desde diferentes campos posibles
                let imageUrl = item.image_url || item.url || item.storage_url || item.imageUrl;
                
                console.log('🔍 Procesando item RPC:', {
                    image_url: item.image_url,
                    url: item.url,
                    storage_url: item.storage_url,
                    storage_path: item.storage_path,
                    found_url: imageUrl
                });
                
                // Verificar si la URL está incompleta o truncada
                const isUrlIncomplete = imageUrl && (
                    (imageUrl.includes('supabase.co/storage/v') && !imageUrl.includes('/object/public/')) ||
                    imageUrl.endsWith('-') ||
                    imageUrl.endsWith('...') ||
                    (imageUrl.includes('supabase.co') && imageUrl.split('supabase.co/storage/')[1]?.split('/').length < 3) ||
                    !imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)
                );
                
                if (isUrlIncomplete) {
                    console.warn('⚠️ URL de RPC parece estar incompleta/truncada:', imageUrl);
                    console.log('🔧 Intentando reconstruir desde storage_path...');
                    imageUrl = null; // Forzar reconstrucción desde storage_path
                }
                
                // Si la URL de la RPC no es válida o no existe, intentar obtener desde storage_path si está disponible
                if (!imageUrl || (!imageUrl.startsWith('http') && !imageUrl.startsWith('/'))) {
                    if (item.storage_path && this.supabase) {
                        // Intentar obtener URL desde storage_path
                        // El storage_path parece tener el formato: 'production-outputs/.../img_X.jpg'
                        const storagePath = item.storage_path;
                        
                        // Extraer el bucket y la ruta del storage_path
                        let bucketName = 'production-outputs'; // Bucket por defecto
                        let filePath = storagePath;
                        
                        // Si storage_path incluye el nombre del bucket al inicio, extraerlo
                        if (storagePath.includes('/')) {
                            const parts = storagePath.split('/');
                            // Verificar si el primer segmento es un bucket conocido
                            const knownBuckets = ['production-outputs', 'generated-content', 'flow-outputs', 'content-images'];
                            if (knownBuckets.includes(parts[0])) {
                                bucketName = parts[0];
                                filePath = parts.slice(1).join('/');
                            }
                        }
                        
                        console.log(`🔧 Construyendo URL desde storage_path:`, {
                            original_path: storagePath,
                            bucket: bucketName,
                            file_path: filePath
                        });
                        
                        // Intentar verificar si el bucket existe listando su contenido
                        let bucketExists = false;
                        try {
                            const { data: buckets, error: bucketsError } = await this.supabase.storage.listBuckets();
                            if (!bucketsError && buckets) {
                                bucketExists = buckets.some(b => b.id === bucketName || b.name === bucketName);
                                console.log(`ℹ️ Bucket '${bucketName}' existe:`, bucketExists);
                            }
                        } catch (error) {
                            console.warn(`⚠️ No se pudo verificar existencia del bucket:`, error);
                        }
                        
                        // Si el bucket no existe, intentar con buckets alternativos
                        const bucketsToTry = bucketExists 
                            ? [bucketName] 
                            : ['production-outputs', 'generated-content', 'flow-outputs', 'content-images', 'product-images', 'brand-files'];
                        
                        for (const bucket of bucketsToTry) {
                            try {
                                const { data: { publicUrl }, error: urlError } = this.supabase.storage
                                    .from(bucket)
                                    .getPublicUrl(filePath);
                                
                                if (urlError) {
                                    if (urlError.message?.includes('not found') || urlError.message?.includes('does not exist')) {
                                        console.log(`ℹ️ Bucket '${bucket}' no existe, intentando siguiente...`);
                                        continue;
                                    }
                                    console.warn(`⚠️ Error obteniendo URL pública desde bucket '${bucket}' path '${filePath}':`, urlError);
                                    continue;
                                }
                                
                                if (publicUrl) {
                                    // Verificar que la URL tenga el formato correcto
                                    if (publicUrl.includes('/object/public/') && publicUrl.includes(bucket)) {
                                        imageUrl = publicUrl;
                                        console.log(`✅ URL construida correctamente desde bucket '${bucket}':`, imageUrl);
                                        break;
                                    } else {
                                        console.warn(`⚠️ URL generada no tiene formato esperado:`, publicUrl);
                                    }
                                }
                            } catch (error) {
                                console.warn(`⚠️ Error al construir URL desde bucket '${bucket}':`, error);
                                continue;
                            }
                        }
                        
                        if (!imageUrl) {
                            console.error(`❌ No se pudo construir URL desde storage_path '${storagePath}' en ningún bucket disponible`);
                        }
                    }
                }
                
                return {
                    image_url: imageUrl,
                    prompt_used: item.prompt_used,
                    style_trend: item.style_trend,
                    created_at: item.created_at
                };
            }));
            
            console.log('📊 Resumen de producciones obtenidas desde RPC:', {
                total: todayProductions.length,
                con_url: todayProductions.filter(p => p.image_url).length,
                urls: todayProductions.map(p => p.image_url)
            });
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
                let imageUrl = output.file_url;
                
                // Si no hay file_url, intentar obtener desde storage_path o storage_object_id
                if (!imageUrl && this.supabase) {
                    // Opción 1: Si hay storage_object_id, intentar obtener desde storage.objects
                    if (output.storage_object_id) {
                        try {
                            // Buscar en storage.objects usando el ID
                            const { data: objects, error: objError } = await this.supabase
                                .from('storage.objects')
                                .select('bucket_id, name')
                                .eq('id', output.storage_object_id)
                                .maybeSingle();
                            
                            if (!objError && objects) {
                                const { data: { publicUrl } } = this.supabase.storage
                                    .from(objects.bucket_id)
                                    .getPublicUrl(objects.name);
                                imageUrl = publicUrl;
                                console.log(`✅ URL obtenida desde storage_object_id:`, imageUrl);
                            }
                        } catch (error) {
                            console.warn('⚠️ Error obteniendo URL desde storage_object_id:', error);
                        }
                    }
                    
                    // Opción 2: Si hay storage_path, intentar obtener URL
                    if (!imageUrl && output.storage_path) {
                        const storagePath = output.storage_path;
                        
                        // Si storage_path es solo una carpeta (termina en /), buscar archivos en esa carpeta
                        if (storagePath.endsWith('/')) {
                            // Buscar archivos en diferentes buckets posibles
                            const possibleBuckets = ['production-outputs', 'generated-content', 'flow-outputs', 'content-images', 'images'];
                            
                            for (const bucket of possibleBuckets) {
                                try {
                                    // Listar archivos en la carpeta
                                    const { data: files, error: listError } = await this.supabase.storage
                                        .from(bucket)
                                        .list(storagePath, {
                                            limit: 1,
                                            sortBy: { column: 'created_at', order: 'desc' }
                                        });
                                    
                                    if (listError) {
                                        // Si el bucket no existe o no hay permisos, continuar con el siguiente
                                        if (listError.message?.includes('not found') || listError.message?.includes('does not exist')) {
                                            console.log(`ℹ️ Bucket '${bucket}' no existe o no accesible`);
                                        } else {
                                            console.warn(`⚠️ Error listando archivos en bucket '${bucket}' carpeta '${storagePath}':`, listError);
                                        }
                                        continue;
                                    }
                                    
                                    if (files && files.length > 0) {
                                        const fileName = files[0].name;
                                        const fullPath = storagePath + fileName;
                                        const { data: { publicUrl }, error: urlError } = this.supabase.storage
                                            .from(bucket)
                                            .getPublicUrl(fullPath);
                                        
                                        if (urlError) {
                                            console.warn(`⚠️ Error obteniendo URL pública desde bucket '${bucket}' path '${fullPath}':`, urlError);
                                            continue;
                                        }
                                        
                                        imageUrl = publicUrl;
                                        console.log(`✅ URL obtenida desde carpeta '${storagePath}' en bucket '${bucket}':`, imageUrl);
                                        break;
                                    }
                                } catch (bucketError) {
                                    // Continuar con el siguiente bucket
                                    continue;
                                }
                            }
                        } else {
                            // storage_path es un archivo completo, intentar obtener URL desde diferentes buckets
                            const possibleBuckets = ['production-outputs', 'generated-content', 'flow-outputs', 'content-images', 'images'];
                            
                            for (const bucket of possibleBuckets) {
                                try {
                                    const { data: { publicUrl }, error: urlError } = this.supabase.storage
                                        .from(bucket)
                                        .getPublicUrl(storagePath);
                                    
                                    if (urlError) {
                                        // Si el bucket no existe o no hay permisos, continuar con el siguiente
                                        if (urlError.message?.includes('not found') || urlError.message?.includes('does not exist')) {
                                            console.log(`ℹ️ Bucket '${bucket}' no existe o no accesible`);
                                        } else {
                                            console.warn(`⚠️ Error obteniendo URL pública desde bucket '${bucket}' path '${storagePath}':`, urlError);
                                        }
                                        continue;
                                    }
                                    
                                    if (publicUrl) {
                                        // No validar con fetch para evitar demoras, solo usar la URL generada
                                        imageUrl = publicUrl;
                                        console.log(`✅ URL obtenida desde bucket '${bucket}' path '${storagePath}':`, imageUrl);
                                        break;
                                    }
                                } catch (bucketError) {
                                    // Continuar con el siguiente bucket
                                    continue;
                                }
                            }
                        }
                    }
                    
                    // Opción 3: Revisar metadata por si tiene información de URL
                    if (!imageUrl && output.metadata) {
                        if (output.metadata.image_url) {
                            imageUrl = output.metadata.image_url;
                            console.log('✅ URL obtenida desde metadata:', imageUrl);
                        } else if (output.metadata.url) {
                            imageUrl = output.metadata.url;
                            console.log('✅ URL obtenida desde metadata.url:', imageUrl);
                        } else if (output.metadata.storage_url) {
                            imageUrl = output.metadata.storage_url;
                            console.log('✅ URL obtenida desde metadata.storage_url:', imageUrl);
                        }
                    }
                }
                
                if (!imageUrl) {
                    console.warn('⚠️ No se pudo obtener URL para output:', {
                        id: output.id,
                        storage_path: output.storage_path,
                        storage_object_id: output.storage_object_id,
                        file_url: output.file_url,
                        metadata: output.metadata
                    });
                } else {
                    console.log('✅ URL obtenida para output:', {
                        id: output.id,
                        url: imageUrl,
                        source: output.file_url ? 'file_url' : 
                               output.storage_object_id ? 'storage_object_id' :
                               output.metadata?.image_url ? 'metadata.image_url' :
                               'storage_path'
                    });
                }
                
                return {
                    image_url: imageUrl,
                    prompt_used: output.prompt_used,
                    created_at: output.created_at
                };
            }));
            
            console.log('📊 Resumen de producciones obtenidas desde flow_outputs:', {
                total: todayProductions.length,
                con_url: todayProductions.filter(p => p.image_url).length,
                urls: todayProductions.map(p => p.image_url)
            });
        }

        // Renderizar items (siempre mostrar 3)
        const items = [];
        for (let i = 0; i < 3; i++) {
            if (todayProductions[i] && todayProductions[i].image_url) {
                const item = todayProductions[i];
                let imageUrl = item.image_url;
                
                console.log(`🖼️ Procesando imagen ${i + 1}:`, {
                    original_url: imageUrl,
                    has_prompt: !!item.prompt_used,
                    has_style: !!item.style_trend
                });
                
                // Validar que sea una URL válida
                if (!imageUrl || (!imageUrl.startsWith('http') && !imageUrl.startsWith('/'))) {
                    console.warn(`⚠️ URL de imagen ${i + 1} inválida (no empieza con http o /):`, imageUrl);
                    items.push(`
                        <div class="visual-day-item">
                            <div class="visual-day-placeholder">
                                <i class="fas fa-image"></i>
                            </div>
                        </div>
                    `);
                    continue;
                }
                
                // Validar URL antes de renderizar (verificar que sea accesible)
                let isValidUrl = false;
                try {
                    // Verificar que la URL tenga un formato válido
                    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                        const urlObj = new URL(imageUrl);
                        isValidUrl = urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
                        
                        // Verificar que la URL de Supabase tenga el formato correcto
                        if (imageUrl.includes('supabase.co/storage/v1/object/public/')) {
                            const pathAfterPublic = imageUrl.split('object/public/')[1];
                            if (!pathAfterPublic || pathAfterPublic.trim() === '') {
                                console.warn(`⚠️ URL ${i + 1} de Supabase está incompleta (falta ruta después de object/public/):`, imageUrl);
                                isValidUrl = false;
                            } else {
                                console.log(`✅ URL ${i + 1} de Supabase tiene formato válido:`, imageUrl);
                                isValidUrl = true;
                            }
                        } else {
                            console.log(`✅ URL ${i + 1} tiene formato válido:`, imageUrl);
                            isValidUrl = true;
                        }
                    } else if (imageUrl.startsWith('/')) {
                        isValidUrl = true;
                        console.log(`✅ URL ${i + 1} es ruta relativa válida:`, imageUrl);
                    } else {
                        console.warn(`⚠️ URL ${i + 1} no es válida (formato desconocido):`, imageUrl);
                        isValidUrl = false;
                    }
                } catch (urlError) {
                    console.warn(`⚠️ Error validando URL ${i + 1}:`, imageUrl, urlError);
                    isValidUrl = false;
                }
                
                if (!isValidUrl) {
                    console.warn(`⚠️ URL ${i + 1} no pasó validación, usando placeholder`);
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
                
                // Validar que la URL no sea solo el dominio de Supabase sin ruta
                if (imageUrl.includes('supabase.co/storage/v1/object/public/') && 
                    !imageUrl.split('object/public/')[1]) {
                    console.warn(`⚠️ URL ${i + 1} parece estar incompleta (solo dominio):`, imageUrl);
                    items.push(`
                        <div class="visual-day-item">
                            <div class="visual-day-placeholder">
                                <i class="fas fa-image"></i>
                            </div>
                        </div>
                    `);
                    continue;
                }
                
                // Agregar timestamp para evitar caché
                const imageUrlWithCache = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
                
                console.log(`🎨 Renderizando imagen ${i + 1} con URL:`, imageUrlWithCache);
                
                items.push(`
                    <div class="visual-day-item">
                        <img src="${this.escapeHtml(imageUrlWithCache)}" 
                             alt="Visual generado por IA" 
                             loading="lazy"
                             onerror="console.error('❌ Error cargando imagen ${i + 1}:', '${this.escapeHtml(imageUrl)}'); this.parentElement.innerHTML='<div class=\\'visual-day-placeholder\\'><i class=\\'fas fa-image\\'></i></div>';"
                             onload="console.log('✅ Imagen ${i + 1} cargada exitosamente');">
                        ${promptInfo}
                        ${styleInfo}
                    </div>
                `);
            } else {
                console.log(`ℹ️ No hay imagen ${i + 1} disponible`);
                items.push(`
                    <div class="visual-day-item">
                        <div class="visual-day-placeholder">
                            <i class="fas fa-image"></i>
                        </div>
                    </div>
                `);
            }
        }

        console.log('🎨 Renderizando', items.length, 'items en el Hero');
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
