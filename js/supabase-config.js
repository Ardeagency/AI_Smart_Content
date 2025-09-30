// Supabase Configuration
// Configuración de credenciales de Supabase

// INSTRUCCIONES:
// 1. Ve a tu proyecto en Supabase Dashboard
// 2. Ve a Settings > API
// 3. Copia tu Project URL y API Keys
// 4. Reemplaza los valores abajo con tus credenciales reales

const SUPABASE_CONFIG = {
    // URL de tu proyecto Supabase
    url: 'https://ksjeikudvqseoosyhsdd.supabase.co',
    
    // Anon key (pública, segura para frontend)
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzamVpa3VkdnFzZW9vc3loc2RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTA3NjcsImV4cCI6MjA3Mzg4Njc2N30.WDwu2axnbJ1NZ_0F3keI-uZk7taOt_mUaEGV4EJzEBM',
    
    // Service role key (privada, solo para operaciones administrativas)
    serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzamVpa3VkdnFzZW9vc3loc2RkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODMxMDc2NywiZXhwIjoyMDczODg2NzY3fQ.YZPSrRsVklxwyjYdAKd47oB7w4dH4BF7df0MSkbRSp8'
};

// Verificar si la configuración está completa
function validateConfig() {
    const { url, anonKey, serviceRoleKey } = SUPABASE_CONFIG;
    
    if (!url || url === 'YOUR_SUPABASE_URL') {
        console.error('❌ SUPABASE_URL no está configurado');
        return false;
    }
    
    if (!anonKey || anonKey === 'YOUR_ANON_KEY') {
        console.error('❌ SUPABASE_ANON_KEY no está configurado');
        return false;
    }
    
    if (!serviceRoleKey || serviceRoleKey === 'YOUR_SERVICE_ROLE_KEY') {
        console.error('❌ SUPABASE_SERVICE_ROLE_KEY no está configurado');
        return false;
    }
    
    return true;
}

// Exportar configuración
if (typeof window !== 'undefined') {
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
    window.validateSupabaseConfig = validateConfig;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SUPABASE_CONFIG, validateConfig };
}
