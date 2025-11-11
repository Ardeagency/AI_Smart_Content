/**
 * AI Smart Content - Supabase Configuration
 * Configuración de Supabase usando variables de entorno del servidor
 * 
 * El servidor debe inyectar las variables de entorno antes de servir la página.
 * Variables disponibles:
 * - SUPABASE_DATABASE_URL (URL completa de Supabase, ej: https://xxx.supabase.co)
 * - SUPABASE_ANON_KEY (Clave anónima pública)
 * - SUPABASE_SERVICE_ROLE_KEY (Clave de servicio, solo backend)
 */

// Intentar leer desde múltiples fuentes (en orden de prioridad):
// 1. Variables inyectadas por el servidor en window
// 2. Meta tags en el HTML
// 3. Variables globales del navegador

let supabaseUrl = window.SUPABASE_URL || '';
let supabaseAnonKey = window.SUPABASE_ANON_KEY || '';

// Si no están en window, intentar leer desde meta tags
if (!supabaseUrl || !supabaseAnonKey) {
    const metaUrl = document.querySelector('meta[name="supabase-url"]');
    const metaKey = document.querySelector('meta[name="supabase-anon-key"]');
    
    if (metaUrl) supabaseUrl = metaUrl.getAttribute('content') || supabaseUrl;
    if (metaKey) supabaseAnonKey = metaKey.getAttribute('content') || supabaseAnonKey;
}

// Si aún no están, intentar desde SUPABASE_DATABASE_URL (nombre completo de la variable del servidor)
if (!supabaseUrl && window.SUPABASE_DATABASE_URL) {
    supabaseUrl = window.SUPABASE_DATABASE_URL;
}

// Crear objeto de configuración
const SUPABASE_CONFIG = {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: window.SUPABASE_SERVICE_ROLE_KEY || ''
};

// Verificar que las variables estén configuradas
if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    // Solo mostrar advertencia en desarrollo o si está explícitamente habilitado
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname.includes('localhost');
    
    if (isDevelopment) {
        console.warn('⚠️ Supabase configuration missing.');
        console.warn('⚠️ Server should inject: window.SUPABASE_URL and window.SUPABASE_ANON_KEY');
        console.warn('⚠️ Or add meta tags: <meta name="supabase-url" content="...">');
        console.warn('⚠️ Available variables:', {
            SUPABASE_URL: window.SUPABASE_URL || 'not set',
            SUPABASE_DATABASE_URL: window.SUPABASE_DATABASE_URL || 'not set',
            SUPABASE_ANON_KEY: window.SUPABASE_ANON_KEY ? '***set***' : 'not set'
        });
    }
}

// Hacer disponible globalmente
window.SUPABASE_CONFIG = SUPABASE_CONFIG;

