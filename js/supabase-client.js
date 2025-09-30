// Supabase Client - Production Configuration
// Configuración completa de Supabase para producción

class SupabaseClient {
    constructor() {
        this.isReadyFlag = false;
        this.supabase = null;
        this.adminClient = null;
        this.init();
    }

    async init() {
        try {
            // Configuración directa - REEMPLAZA CON TUS CREDENCIALES REALES
            const SUPABASE_URL = 'https://ksjeikudvqseoosyhsdd.supabase.co';
            const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzamVpa3VkdnFzZW9vc3loc2RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTA3NjcsImV4cCI6MjA3Mzg4Njc2N30.WDwu2axnbJ1NZ_0F3keI-uZk7taOt_mUaEGV4EJzEBM';
            const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzamVpa3VkdnFzZW9vc3loc2RkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODMxMDc2NywiZXhwIjoyMDczODg2NzY3fQ.YZPSrRsVklxwyjYdAKd47oB7w4dH4BF7df0MSkbRSp8';

            // Verificar si las variables están configuradas correctamente
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
                console.error('❌ Supabase no está configurado correctamente.');
                console.error('Asegúrate de que todas las credenciales estén configuradas');
                this.isReadyFlag = false;
                return;
            }
            
            this.SUPABASE_URL = SUPABASE_URL;
            this.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
            this.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;

            // Cargar Supabase desde CDN si no está disponible
            if (typeof window !== 'undefined' && !window.supabase) {
                await this.loadSupabaseFromCDN();
            }

            // Crear cliente de Supabase
            if (window.supabase) {
                this.supabase = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY, {
                    auth: {
                        autoRefreshToken: true,
                        persistSession: true,
                        detectSessionInUrl: true
                    }
                });
                
                // Cliente administrativo para operaciones que requieren service role
                this.adminClient = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_SERVICE_ROLE_KEY, {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    }
                });
                
                // Limpiar sesiones corruptas al inicializar
                await this.cleanCorruptSessions();
                
                this.isReadyFlag = true;
                console.log('✅ Supabase client inicializado correctamente');
            } else {
                throw new Error('No se pudo cargar la librería de Supabase');
            }
        } catch (error) {
            console.error('❌ Error inicializando Supabase:', error);
            this.isReadyFlag = false;
        }
    }


    async loadSupabaseFromCDN() {
        return new Promise((resolve, reject) => {
            if (window.supabase) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => {
                console.log('✅ Supabase library cargada desde CDN');
                resolve();
            };
            script.onerror = () => {
                console.error('❌ Error cargando Supabase desde CDN');
                reject(new Error('No se pudo cargar Supabase'));
            };
            document.head.appendChild(script);
        });
    }

    async cleanCorruptSessions() {
        try {
            // Intentar obtener la sesión actual
            const { data: session, error } = await this.supabase.auth.getSession();
            
            if (error && error.message.includes('Invalid Refresh Token')) {
                console.log('🧹 Detectada sesión corrupta, limpiando...');
                
                // Limpiar localStorage de Supabase
                const keys = Object.keys(localStorage);
                keys.forEach(key => {
                    if (key.startsWith('sb-') || key.includes('supabase')) {
                        localStorage.removeItem(key);
                        console.log(`🗑️ Removido: ${key}`);
                    }
                });
                
                // Limpiar sessionStorage también
                const sessionKeys = Object.keys(sessionStorage);
                sessionKeys.forEach(key => {
                    if (key.startsWith('sb-') || key.includes('supabase')) {
                        sessionStorage.removeItem(key);
                        console.log(`🗑️ Removido de session: ${key}`);
                    }
                });
                
                console.log('✅ Sesiones corruptas limpiadas');
            }
        } catch (error) {
            console.log('⚠️ Error limpiando sesiones (ignorado):', error.message);
        }
    }

    isReady() {
        return this.isReadyFlag;
    }

    getAdminClient() {
        return this.adminClient;
    }

    // Métodos de autenticación
    async auth() {
        if (!this.isReady()) {
            throw new Error('Supabase no está disponible');
        }
        return this.supabase.auth;
    }

    // Métodos de base de datos
    from(table) {
        if (!this.isReady()) {
            throw new Error('Supabase no está disponible');
        }
        return this.supabase.from(table);
    }

    // Métodos de storage
    storage() {
        if (!this.isReady()) {
            throw new Error('Supabase no está disponible');
        }
        return this.supabase.storage;
    }

    // Métodos de funciones edge
    functions() {
        if (!this.isReady()) {
            throw new Error('Supabase no está disponible');
        }
        return this.supabase.functions;
    }
}

// Crear instancia global e inicializar
window.supabaseClient = new SupabaseClient();

// Asegurar que se inicialice cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await window.supabaseClient.init();
            console.log('✅ Supabase Client inicializado después de DOMContentLoaded');
        } catch (error) {
            console.error('❌ Error inicializando Supabase después de DOMContentLoaded:', error);
        }
    });
} else {
    // Si el DOM ya está cargado, reinicializar
    setTimeout(async () => {
        try {
            await window.supabaseClient.init();
            console.log('✅ Supabase Client reinicializado');
        } catch (error) {
            console.error('❌ Error reinicializando Supabase:', error);
        }
    }, 100);
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseClient;
}

console.log('🔧 Supabase Client cargado (configuración de producción)');

// Función de diagnóstico global
window.debugSupabase = function() {
    console.log('🔍 DIAGNÓSTICO DE SUPABASE:');
    console.log('- window.supabaseClient exists:', !!window.supabaseClient);
    console.log('- isReady():', window.supabaseClient?.isReady?.());
    console.log('- supabase client:', window.supabaseClient?.supabase);
    console.log('- admin client:', window.supabaseClient?.adminClient);
    console.log('- URL:', window.supabaseClient?.SUPABASE_URL);
    console.log('- Has anon key:', !!window.supabaseClient?.SUPABASE_ANON_KEY);
    console.log('- window.supabase library:', !!window.supabase);
    
    if (window.supabaseClient?.isReady()) {
        console.log('✅ Supabase está listo');
        
        // Test básico de conexión
        window.supabaseClient.supabase.auth.getSession()
            .then(({ data, error }) => {
                if (error) {
                    console.log('❌ Error en test de conexión:', error);
                } else {
                    console.log('✅ Test de conexión exitoso');
                }
            })
            .catch(err => {
                console.log('❌ Error en test de conexión:', err);
            });
    } else {
        console.log('❌ Supabase NO está listo');
        
        // Intentar inicializar manualmente
        console.log('🔄 Intentando inicializar manualmente...');
        window.supabaseClient.init()
            .then(() => {
                console.log('✅ Inicialización manual exitosa');
            })
            .catch(err => {
                console.log('❌ Error en inicialización manual:', err);
            });
    }
};

// Función para limpiar sesiones corruptas manualmente
window.clearSupabaseSessions = function() {
    console.log('🧹 Limpiando todas las sesiones de Supabase...');
    
    // Limpiar localStorage
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
            console.log(`🗑️ Removido de localStorage: ${key}`);
        }
    });
    
    // Limpiar sessionStorage
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
            sessionStorage.removeItem(key);
            console.log(`🗑️ Removido de sessionStorage: ${key}`);
        }
    });
    
    console.log('✅ Todas las sesiones de Supabase han sido limpiadas');
    console.log('💡 Recarga la página para aplicar los cambios');
};
