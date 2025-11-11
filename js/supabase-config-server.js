/**
 * AI Smart Content - Supabase Configuration (Server Variables)
 * 
 * Este archivo debe ser inyectado por el servidor con las variables de entorno reales.
 * El servidor debe reemplazar los valores antes de servir la página.
 * 
 * Variables disponibles en el servidor:
 * - SUPABASE_DATABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 * - SUPABASE_JWT_SECRET
 */

// Configuración de Supabase desde variables del servidor
// El servidor debe inyectar estas variables antes de servir la página
window.SUPABASE_URL = '{{SUPABASE_DATABASE_URL}}' || window.SUPABASE_URL || '';
window.SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}' || window.SUPABASE_ANON_KEY || '';
window.SUPABASE_SERVICE_ROLE_KEY = '{{SUPABASE_SERVICE_ROLE_KEY}}' || window.SUPABASE_SERVICE_ROLE_KEY || '';

// Si el servidor no inyecta las variables, intentar leerlas desde el HTML como data attributes
if (!window.SUPABASE_URL || window.SUPABASE_URL === '{{SUPABASE_DATABASE_URL}}') {
    const metaUrl = document.querySelector('meta[name="supabase-url"]');
    const metaKey = document.querySelector('meta[name="supabase-anon-key"]');
    
    if (metaUrl) window.SUPABASE_URL = metaUrl.getAttribute('content');
    if (metaKey) window.SUPABASE_ANON_KEY = metaKey.getAttribute('content');
}

// Crear objeto de configuración
const SUPABASE_CONFIG = {
    url: window.SUPABASE_URL || '',
    anonKey: window.SUPABASE_ANON_KEY || '',
    serviceRoleKey: window.SUPABASE_SERVICE_ROLE_KEY || ''
};

// Verificar que las variables estén configuradas
if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    console.warn('⚠️ Supabase configuration missing.');
    console.warn('⚠️ Make sure the server injects SUPABASE_DATABASE_URL and SUPABASE_ANON_KEY');
    console.warn('⚠️ Or add them as meta tags: <meta name="supabase-url" content="...">');
}

// Hacer disponible globalmente
window.SUPABASE_CONFIG = SUPABASE_CONFIG;

