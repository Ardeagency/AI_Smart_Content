// ===== CONFIGURACIÓN DE SUPABASE =====

// Configuración de Supabase
const SUPABASE_CONFIG = {
    url: 'https://wxrptuuhmumgikpbfbcn.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4cnB0dXVobXVtZ2lrcGJmYmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMzIzMTAsImV4cCI6MjA3MzcwODMxMH0.l_D-HRA4h5VUbY_I7f2l9sN0-wH6dQD_mA2UUMqhPpU'
};

// Inicializar cliente de Supabase
let supabase;

// Función para inicializar Supabase
function initSupabase() {
    if (typeof supabase === 'undefined') {
        // Cargar Supabase desde CDN si no está disponible
        if (!window.supabase) {
            console.error('Supabase no está cargado. Asegúrate de incluir el script de Supabase.');
            return null;
        }
        
        supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('✅ Supabase inicializado correctamente');
    }
    return supabase;
}

// Función para verificar conexión
async function testSupabaseConnection() {
    try {
        const client = initSupabase();
        if (!client) return false;
        
        // Probar conexión con una consulta simple
        const { data, error } = await client
            .from('users')
            .select('count')
            .limit(1);
            
        if (error) {
            console.error('❌ Error de conexión con Supabase:', error);
            return false;
        }
        
        console.log('✅ Conexión con Supabase exitosa');
        return true;
    } catch (error) {
        console.error('❌ Error al conectar con Supabase:', error);
        return false;
    }
}

// Función para manejar errores de Supabase
function handleSupabaseError(error, operation = 'operación') {
    console.error(`Error en ${operation}:`, error);
    
    let message = 'Error de conexión con la base de datos';
    
    if (error.message) {
        if (error.message.includes('duplicate key')) {
            message = 'Este registro ya existe en la base de datos';
        } else if (error.message.includes('foreign key')) {
            message = 'Error de referencia en la base de datos';
        } else if (error.message.includes('not null')) {
            message = 'Faltan campos obligatorios';
        } else {
            message = error.message;
        }
    }
    
    return {
        success: false,
        message: message,
        error: error
    };
}

// Función para mostrar notificaciones de error
function showSupabaseError(error, operation = 'operación') {
    const result = handleSupabaseError(error, operation);
    
    // Crear notificación de error
    const notification = document.createElement('div');
    notification.className = 'notification notification-error';
    notification.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${result.message}</span>
    `;

    // Estilos
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-weight: 500;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    // Remover después de 5 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Exportar funciones para uso global
window.SupabaseConfig = {
    init: initSupabase,
    testConnection: testSupabaseConnection,
    handleError: handleSupabaseError,
    showError: showSupabaseError
};

// Inicializar automáticamente cuando se carga el script
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    testSupabaseConnection();
});
