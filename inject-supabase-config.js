/**
 * Script de ejemplo para inyectar variables de Supabase desde el servidor
 * 
 * Este script debe ser generado por el servidor ANTES de cargar supabase-config.js
 * El servidor debe reemplazar las variables de entorno reales.
 * 
 * INSTRUCCIONES PARA EL SERVIDOR:
 * 1. Leer las variables de entorno: SUPABASE_DATABASE_URL, SUPABASE_ANON_KEY
 * 2. Inyectar este script en cada HTML antes de los scripts de Supabase
 * 3. Reemplazar los valores {{...}} con las variables reales
 */

(function() {
    'use strict';
    
    // Inyectar variables de Supabase desde las variables de entorno del servidor
    // El servidor debe reemplazar estos valores con las variables reales
    window.SUPABASE_URL = '{{SUPABASE_DATABASE_URL}}' || '';
    window.SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}' || '';
    window.SUPABASE_SERVICE_ROLE_KEY = '{{SUPABASE_SERVICE_ROLE_KEY}}' || '';
    
    // Log para debugging (solo en desarrollo)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('🔧 Supabase config injected:', {
            url: window.SUPABASE_URL ? '✅ Set' : '❌ Missing',
            anonKey: window.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'
        });
    }
})();

