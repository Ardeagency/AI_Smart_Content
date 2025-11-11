/**
 * AI Smart Content - Auth Guard
 * Verifica que el usuario haya completado el formulario antes de acceder a páginas protegidas
 */

/**
 * Verificar si el usuario ha completado el formulario
 * Si no lo ha completado, redirigir a form-record.html
 */
async function verifyUserAccess() {
    try {
        // Esperar a que Supabase esté listo
        let supabase = null;
        if (typeof waitForSupabase === 'function') {
            supabase = await waitForSupabase();
        } else if (window.supabaseClient) {
            supabase = window.supabaseClient;
        }

        if (!supabase) {
            console.error('❌ Supabase no está disponible');
            // Si no hay Supabase, permitir acceso (modo desarrollo)
            return true;
        }

        // Obtener usuario actual
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
            console.warn('⚠️ No hay usuario autenticado');
            // Si no hay usuario, redirigir al login
            window.location.href = 'login.html';
            return false;
        }

        // Verificar si el usuario completó el formulario
        const { data: userData, error: dataError } = await supabase
            .from('users')
            .select('form_verified')
            .eq('id', user.id)
            .single();

        if (dataError) {
            console.error('❌ Error verificando form_verified:', dataError);
            // Si hay error, permitir acceso (no bloquear)
            return true;
        }

        // Si form_verified es false o null, redirigir al formulario
        if (!userData || userData.form_verified !== true) {
            console.log('⚠️ Usuario no ha completado el formulario, redirigiendo...');
            window.location.href = 'form-record.html';
            return false;
        }

        // Usuario tiene acceso
        return true;
    } catch (error) {
        console.error('❌ Error en verifyUserAccess:', error);
        // En caso de error, permitir acceso (no bloquear)
        return true;
    }
}

// Exportar función globalmente
window.verifyUserAccess = verifyUserAccess;

