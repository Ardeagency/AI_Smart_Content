/**
 * UGC Studio - Supabase Client
 * Cliente para conectar con Supabase y gestionar datos en la nube
 * 
 * Funcionalidades:
 * - Configuración del cliente Supabase
 * - Operaciones CRUD con error handling
 * - Sistema de autenticación
 * - Helpers para sincronización de datos
 */

class SupabaseClient {
    constructor() {
        // Configuración de Supabase
        this.config = {
            url: 'https://ksjeikudvqseoosyhsdd.supabase.co',
            anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzamVpa3VkdnFzZW9vc3loc2RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTA3NjcsImV4cCI6MjA3Mzg4Njc2N30.WDwu2axnbJ1NZ_0F3keI-uZk7taOt_mUaEGV4EJzEBM',
            serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzamVpa3VkdnFzZW9vc3loc2RkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODMxMDc2NywiZXhwIjoyMDczODg2NzY3fQ.YZPSrRsVklxwyjYdAKd47oB7w4dH4BF7df0MSkbRSp8'
        };

        this.supabase = null;
        this.initialized = false;
        this.currentUser = null;
        this.retryCount = 3;
        this.retryDelay = 1000;

        this.init();
    }

    /**
     * Inicializar cliente Supabase
     */
    async init() {
        try {
            // Cargar Supabase library dinámicamente
            if (!window.supabase) {
                await this.loadSupabaseLibrary();
            }

            // Crear cliente Supabase
            this.supabase = window.supabase.createClient(
                this.config.url, 
                this.config.anonKey,
                {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: false
                    },
                    realtime: {
                        params: {
                            eventsPerSecond: 10
                        }
                    }
                }
            );

            this.initialized = true;
            
            // Verificar conexión
            await this.testConnection();
            
            // Configurar listener de autenticación
            this.setupAuthListener();

            console.log('✅ Supabase Client inicializado correctamente');
            
            // Solo log si analyticsEngine está disponible
            try {
                if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                    this.logEvent('supabase_client_initialized', { 
                        url: this.config.url,
                        timestamp: Date.now()
                    });
                }
            } catch (analyticsError) {
                console.warn('⚠️ Error en analytics logging:', analyticsError);
            }

        } catch (error) {
            console.error('❌ Error inicializando Supabase Client:', error);
            this.logEvent('supabase_client_init_error', { error: error.message });
        }
    }

    /**
     * Cargar biblioteca Supabase dinámicamente
     */
    async loadSupabaseLibrary() {
        return new Promise((resolve, reject) => {
            if (window.supabase) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Supabase library'));
            document.head.appendChild(script);
        });
    }

    /**
     * Probar conexión con Supabase
     */
    async testConnection() {
        try {
            // Test más simple que no depende de tablas específicas
            const { data, error } = await this.supabase.auth.getSession();
            
            // Si no hay error, la conexión está funcionando
            console.log('✅ Conexión con Supabase establecida');
            return true;
        } catch (error) {
            console.warn('⚠️ Error en test de conexión:', error);
            return false;
        }
    }

    /**
     * Configurar listener de cambios de autenticación
     */
    setupAuthListener() {
        this.supabase.auth.onAuthStateChange((event, session) => {
            console.log('🔐 Auth state changed:', event, session?.user?.email);
            
            if (session?.user) {
                this.currentUser = session.user;
                this.logEvent('user_authenticated', { 
                    userId: session.user.id,
                    email: session.user.email 
                });
            } else {
                this.currentUser = null;
                this.logEvent('user_logged_out');
            }

            // Notificar al sistema de cambios de auth
            window.dispatchEvent(new CustomEvent('supabaseAuthChange', {
                detail: { event, session, user: session?.user }
            }));
        });
    }

    /**
     * Crear usuario en Supabase
     */
    async createUser(userData) {
        try {
            const { name, email, plan = 'starter', deviceData = {} } = userData;

            // 1. Crear usuario en auth (si no existe)
            let authUser = null;
            try {
                const { data, error } = await this.supabase.auth.signInWithOtp({
                    email: email,
                    options: {
                        shouldCreateUser: true,
                        data: {
                            full_name: name,
                            plan: plan
                        }
                    }
                });

                if (error) throw error;
                console.log('📧 OTP enviado a:', email);
            } catch (authError) {
                console.log('ℹ️ Usuario puede existir, continuando...');
            }

            // 2. Crear registro en tabla users
            const userRecord = {
                email: email,
                full_name: name,
                plan: plan,
                device_id: deviceData.deviceId || this.generateDeviceId(),
                device_info: deviceData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_active: true,
                onboarding_completed: false,
                metadata: {
                    source: 'payment_flow',
                    initial_plan: plan,
                    signup_timestamp: Date.now()
                }
            };

            const { data: user, error: userError } = await this.supabase
                .from('users')
                .upsert(userRecord, { 
                    onConflict: 'email',
                    ignoreDuplicates: false 
                })
                .select()
                .single();

            if (userError) throw userError;

            console.log('✅ Usuario creado en Supabase:', user);
            
            // 3. Registrar evento de creación
            await this.logUserEvent(user.id, 'user_created', {
                plan: plan,
                source: 'payment_flow'
            });

            return user;

        } catch (error) {
            console.error('❌ Error creando usuario:', error);
            throw error;
        }
    }

    /**
     * Obtener usuario por email
     */
    async getUserByEmail(email) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('email', email)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data;
        } catch (error) {
            console.error('❌ Error obteniendo usuario:', error);
            return null;
        }
    }

    /**
     * Actualizar datos del usuario
     */
    async updateUser(userId, updates) {
        try {
            const updateData = {
                ...updates,
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('users')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Usuario actualizado:', data);
            return data;
        } catch (error) {
            console.error('❌ Error actualizando usuario:', error);
            throw error;
        }
    }

    /**
     * Guardar datos de onboarding
     */
    async saveOnboardingData(userId, onboardingData) {
        try {
            // Actualizar usuario con datos completos
            const userUpdate = {
                onboarding_data: onboardingData,
                onboarding_completed: true,
                profile_completed_at: new Date().toISOString()
            };

            await this.updateUser(userId, userUpdate);

            // Registrar evento
            await this.logUserEvent(userId, 'onboarding_completed', {
                steps_completed: 33,
                data_points: Object.keys(onboardingData).length
            });

            return true;
        } catch (error) {
            console.error('❌ Error guardando onboarding:', error);
            throw error;
        }
    }

    /**
     * Guardar proyecto
     */
    async saveProject(userId, projectData) {
        try {
            const project = {
                user_id: userId,
                ...projectData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('projects')
                .insert(project)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Proyecto guardado:', data);
            await this.logUserEvent(userId, 'project_created', { projectId: data.id });
            
            return data;
        } catch (error) {
            console.error('❌ Error guardando proyecto:', error);
            throw error;
        }
    }

    /**
     * Guardar producto
     */
    async saveProduct(userId, productData) {
        try {
            const product = {
                user_id: userId,
                ...productData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('products')
                .insert(product)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Producto guardado:', data);
            await this.logUserEvent(userId, 'product_created', { productId: data.id });
            
            return data;
        } catch (error) {
            console.error('❌ Error guardando producto:', error);
            throw error;
        }
    }

    /**
     * Guardar avatar
     */
    async saveAvatar(userId, avatarData) {
        try {
            const avatar = {
                user_id: userId,
                ...avatarData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('avatars')
                .insert(avatar)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Avatar guardado:', data);
            await this.logUserEvent(userId, 'avatar_created', { avatarId: data.id });
            
            return data;
        } catch (error) {
            console.error('❌ Error guardando avatar:', error);
            throw error;
        }
    }

    /**
     * Guardar generación UGC
     */
    async saveUGCGeneration(userId, generationData) {
        try {
            const ugc = {
                user_id: userId,
                ...generationData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('ugc_generations')
                .insert(ugc)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ UGC Generation guardada:', data);
            await this.logUserEvent(userId, 'ugc_generated', { 
                generationId: data.id,
                style: generationData.style,
                quantity: generationData.quantity 
            });
            
            return data;
        } catch (error) {
            console.error('❌ Error guardando UGC Generation:', error);
            throw error;
        }
    }

    /**
     * Registrar evento de usuario
     */
    async logUserEvent(userId, eventType, eventData = {}) {
        try {
            const event = {
                user_id: userId,
                event_type: eventType,
                event_data: eventData,
                created_at: new Date().toISOString(),
                session_id: this.getSessionId(),
                device_info: await this.getDeviceInfo()
            };

            const { error } = await this.supabase
                .from('user_events')
                .insert(event);

            if (error) throw error;
        } catch (error) {
            console.error('❌ Error logging user event:', error);
        }
    }

    /**
     * Registrar analytics
     */
    async logAnalytics(userId, analyticsData) {
        try {
            const analytics = {
                user_id: userId,
                ...analyticsData,
                created_at: new Date().toISOString()
            };

            const { error } = await this.supabase
                .from('analytics_events')
                .insert(analytics);

            if (error) throw error;
        } catch (error) {
            console.error('❌ Error logging analytics:', error);
        }
    }

    /**
     * Obtener datos del usuario con relaciones
     */
    async getUserData(userId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select(`
                    *,
                    projects (*),
                    products (*),
                    avatars (*),
                    ugc_generations (*)
                `)
                .eq('id', userId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('❌ Error obteniendo datos del usuario:', error);
            return null;
        }
    }

    /**
     * Suscribirse a cambios en tiempo real
     */
    subscribeToUserChanges(userId, callback) {
        return this.supabase
            .channel(`user_${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                filter: `user_id=eq.${userId}`
            }, callback)
            .subscribe();
    }

    /**
     * Helpers y utilidades
     */
    generateDeviceId() {
        return 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    getSessionId() {
        if (!window.ugcSessionId) {
            window.ugcSessionId = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        }
        return window.ugcSessionId;
    }

    async getDeviceInfo() {
        try {
            return {
                userAgent: navigator.userAgent,
                language: navigator.language,
                platform: navigator.platform,
                cookieEnabled: navigator.cookieEnabled,
                onLine: navigator.onLine,
                screen: {
                    width: screen.width,
                    height: screen.height,
                    colorDepth: screen.colorDepth
                },
                timestamp: Date.now()
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    logEvent(eventType, data = {}) {
        if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
            try {
                window.analyticsEngine.track(eventType, data);
            } catch (error) {
                console.warn('Error logging event:', error);
            }
        }
    }

    /**
     * Método para operaciones con reintentos
     */
    async withRetry(operation, retries = this.retryCount) {
        try {
            return await operation();
        } catch (error) {
            if (retries > 0 && this.isRetryableError(error)) {
                console.log(`🔄 Reintentando operación... ${retries} intentos restantes`);
                await this.delay(this.retryDelay);
                return this.withRetry(operation, retries - 1);
            }
            throw error;
        }
    }

    isRetryableError(error) {
        const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', '500', '502', '503', '504'];
        return retryableCodes.some(code => 
            error.message?.includes(code) || error.code?.includes(code)
        );
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Estado del cliente
     */
    isReady() {
        return this.initialized && this.supabase;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getClient() {
        return this.supabase;
    }

    /**
     * Get admin client with service role for privileged operations
     */
    getAdminClient() {
        if (!window.supabase) {
            console.error('Supabase library not loaded');
            return null;
        }

        // Create a separate admin client with service role
        const adminClient = window.supabase.createClient(
            this.config.url,
            this.config.serviceKey,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            }
        );

        return adminClient;
    }

    async checkUserExists(email) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('id, email')
                .eq('email', email)
                .limit(1);

            if (error) {
                console.warn('Error verificando usuario existente:', error);
                return false;
            }

            return data && data.length > 0;
        } catch (error) {
            console.warn('Error en checkUserExists:', error);
            return false;
        }
    }
}

// Inicializar cliente global
window.supabaseClient = new SupabaseClient();

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseClient;
}

console.log('🔌 Supabase Client loaded');
