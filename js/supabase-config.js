/**
 * AI Smart Content - Supabase Configuration
 * Configuración de Supabase usando variables de entorno
 */

// Variables de entorno de Supabase
// Estas se configuran en el servidor donde está publicada la plataforma
// Se leen desde window (configuradas por el servidor) o desde variables globales
const SUPABASE_CONFIG = {
    url: window.SUPABASE_URL || '',
    anonKey: window.SUPABASE_ANON_KEY || '',
    serviceRoleKey: window.SUPABASE_SERVICE_ROLE_KEY || ''
};

// Verificar que las variables estén configuradas
if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    console.warn('⚠️ Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    console.warn('⚠️ Make sure these are set as window.SUPABASE_URL and window.SUPABASE_ANON_KEY in your server configuration.');
}

// Hacer disponible globalmente
window.SUPABASE_CONFIG = SUPABASE_CONFIG;

