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

        // Verificar configuración
        if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
            console.warn('⚠️ Supabase configuration incomplete. Some features may not work.');
            return null;
        }

        // Crear cliente de Supabase
        supabaseClient = supabase.createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.anonKey,
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

