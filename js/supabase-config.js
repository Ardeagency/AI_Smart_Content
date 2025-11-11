/**
 * AI Smart Content - Supabase Configuration
 * Configuración de Supabase usando variables de entorno
 */

// Variables de entorno de Supabase
// Estas se configuran en el servidor donde está publicada la plataforma
const SUPABASE_CONFIG = {
    url: window.SUPABASE_URL || process.env.SUPABASE_URL || '',
    anonKey: window.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: window.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
};

// Verificar que las variables estén configuradas
if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    console.warn('⚠️ Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
}

