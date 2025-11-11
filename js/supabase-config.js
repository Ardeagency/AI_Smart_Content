/**
 * AI Smart Content - Supabase Configuration
 * Configuración de Supabase usando variables de entorno de Netlify
 * 
 * Este script carga la configuración desde Netlify Functions
 * que expone las variables de entorno del servidor de forma segura.
 */

let SUPABASE_CONFIG = {
    url: '',
    anonKey: '',
    serviceRoleKey: ''
};

// Función para cargar configuración desde Netlify Function
async function loadSupabaseConfig() {
    try {
        // Intentar cargar desde Netlify Function
        const response = await fetch('/.netlify/functions/supabase-config');
        
        if (response.ok) {
            const config = await response.json();
            SUPABASE_CONFIG = {
                url: config.url || '',
                anonKey: config.anonKey || '',
                serviceRoleKey: '' // No se expone en el cliente
            };
            
            // Hacer disponible globalmente
            window.SUPABASE_CONFIG = SUPABASE_CONFIG;
            window.SUPABASE_URL = config.url;
            window.SUPABASE_ANON_KEY = config.anonKey;
            
            console.log('✅ Supabase configuration loaded from Netlify');
            return true;
        } else {
            throw new Error(`Failed to load config: ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Error loading Supabase config from Netlify:', error);
        
        // Fallback: intentar leer desde window (si fue inyectado manualmente)
        const fallbackUrl = window.SUPABASE_URL || window.SUPABASE_DATABASE_URL || '';
        const fallbackKey = window.SUPABASE_ANON_KEY || '';
        
        if (fallbackUrl && fallbackKey) {
            SUPABASE_CONFIG = {
                url: fallbackUrl,
                anonKey: fallbackKey,
                serviceRoleKey: ''
            };
            window.SUPABASE_CONFIG = SUPABASE_CONFIG;
            console.warn('⚠️ Using fallback configuration from window variables');
            return true;
        }
        
        return false;
    }
}

// Cargar configuración inmediatamente
loadSupabaseConfig();

// Exportar función para uso en otros módulos
window.loadSupabaseConfig = loadSupabaseConfig;

