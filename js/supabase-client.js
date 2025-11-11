/**
 * AI Smart Content - Supabase Client
 * Cliente de Supabase inicializado y disponible globalmente
 */

let supabaseClient = null;
let supabaseReady = false;
let initPromise = null; // Promesa de inicialización para evitar múltiples inicializaciones

// Inicializar Supabase cuando el script se carga
async function initSupabase() {
    // Si ya hay una inicialización en curso, esperar a que termine
    if (initPromise) {
        return initPromise;
    }

    // Si ya está inicializado, retornar el cliente existente
    if (supabaseReady && supabaseClient) {
        return supabaseClient;
    }

    // Crear nueva promesa de inicialización
    initPromise = (async () => {
        try {
            // Verificar que Supabase JS esté disponible
            if (typeof supabase === 'undefined') {
                console.error('❌ Supabase JS library not loaded. Please include: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
                return null;
            }

            // Si ya existe un cliente, reutilizarlo
            if (window.supabaseClient && supabaseClient) {
                supabaseReady = true;
                return supabaseClient;
            }

            // Esperar a que la configuración se cargue desde Netlify Function
            let config = window.SUPABASE_CONFIG;
            
            // Si no está disponible, intentar cargarla
            if (!config || !config.url || !config.anonKey) {
                if (typeof loadSupabaseConfig === 'function') {
                    const loaded = await loadSupabaseConfig();
                    if (loaded) {
                        config = window.SUPABASE_CONFIG;
                    }
                }
            }
            
            // Verificar configuración después de intentar cargarla
            if (!config || !config.url || !config.anonKey) {
                console.error('❌ Supabase configuration not available. Make sure Netlify Function is configured.');
                return null;
            }

            // Crear cliente de Supabase solo si no existe
            if (!supabaseClient) {
                supabaseClient = supabase.createClient(
                    config.url,
                    config.anonKey,
                    {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    }
                );
            }

            // Verificar conexión
            const { data, error } = await supabaseClient.from('users').select('count').limit(1);
            
            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned (es normal)
                console.error('❌ Error connecting to Supabase:', error);
                return null;
            }

            supabaseReady = true;
            console.log('✅ Supabase client initialized successfully');
            
            // Hacer disponible globalmente
            window.supabaseClient = supabaseClient;
            
            return supabaseClient;
        } catch (error) {
            console.error('❌ Error initializing Supabase:', error);
            return null;
        } finally {
            // Limpiar la promesa después de completar
            initPromise = null;
        }
    })();

    return initPromise;
}

// Función para esperar a que Supabase esté listo
function waitForSupabase(timeout = 10000) {
    return new Promise((resolve, reject) => {
        // Si ya está listo, resolver inmediatamente
        if (supabaseReady && supabaseClient) {
            resolve(supabaseClient);
            return;
        }

        // Si no está inicializado, intentar inicializar primero
        if (!supabaseClient) {
            initSupabase().then(client => {
                if (client) {
                    resolve(client);
                } else {
                    // Si falla la inicialización, dar más información sobre el error
                    const config = window.SUPABASE_CONFIG || {};
                    const hasUrl = config.url && config.url.length > 0;
                    const hasKey = config.anonKey && config.anonKey.length > 0;
                    
                    let errorMsg = 'Failed to initialize Supabase';
                    if (!hasUrl || !hasKey) {
                        errorMsg = 'Supabase configuration missing. Please configure SUPABASE_DATABASE_URL and SUPABASE_ANON_KEY in Netlify environment variables.';
                    }
                    
                    reject(new Error(errorMsg));
                }
            }).catch(err => {
                // Mejorar el mensaje de error
                const config = window.SUPABASE_CONFIG || {};
                if (!config.url || !config.anonKey) {
                    reject(new Error('Supabase configuration missing. Make sure Netlify Function is deployed and environment variables are set.'));
                } else {
                    reject(err);
                }
            });
            return;
        }

        // Esperar a que esté listo
        const startTime = Date.now();
        const checkReady = setInterval(() => {
            if (supabaseReady && supabaseClient) {
                clearInterval(checkReady);
                resolve(supabaseClient);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkReady);
                reject(new Error('Supabase initialization timeout'));
            }
        }, 100);
    });
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}

// Exportar para uso en otros módulos
window.initSupabase = initSupabase;
window.waitForSupabase = waitForSupabase;

