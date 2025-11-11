/**
 * AI Smart Content - Supabase Client
 * Cliente de Supabase inicializado y disponible globalmente
 */

let supabaseClient = null;
let supabaseReady = false;

// Inicializar Supabase cuando el script se carga
async function initSupabase() {
    try {
        // Verificar que Supabase JS esté disponible
        if (typeof supabase === 'undefined') {
            console.error('❌ Supabase JS library not loaded. Please include: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
            return null;
        }

        // Obtener configuración (puede estar en window.SUPABASE_CONFIG o como constante global)
        const config = window.SUPABASE_CONFIG || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG : null);
        
        if (!config || !config.url || !config.anonKey) {
            console.warn('⚠️ Supabase configuration incomplete. Some features may not work.');
            console.warn('⚠️ Make sure supabase-config.js is loaded before supabase-client.js');
            return null;
        }

        // Crear cliente de Supabase
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
    }
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
                    reject(new Error('Failed to initialize Supabase'));
                }
            }).catch(reject);
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

