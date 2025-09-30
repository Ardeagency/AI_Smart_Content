/**
 * Script de prueba para verificar la lógica de redirección
 * Ejecuta desde la consola del navegador en login.html
 */

async function testRedirectLogic() {
    console.log('🧪 PROBANDO LÓGICA DE REDIRECCIÓN');
    console.log('=====================================');
    
    if (!window.authManager) {
        console.error('❌ AuthManager no está disponible');
        return;
    }

    try {
        // Obtener sesión actual
        const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
        
        if (!session) {
            console.log('❌ No hay sesión activa. Inicia sesión primero.');
            return;
        }

        console.log('👤 Usuario encontrado:', session.user.email);
        console.log('🆔 User ID:', session.user.id);
        
        // Probar lógica de redirección
        const redirectUrl = await window.authManager.determineRedirectUrl(session.user.id);
        
        console.log('🎯 URL de redirección determinada:', redirectUrl);
        
        // Detalles del análisis
        console.log('\n📊 DETALLES DEL ANÁLISIS:');
        console.log('============================');
        
        // Verificar perfil
        const { data: profile } = await window.supabaseClient.supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', session.user.id)
            .single();
            
        console.log('👤 Perfil del usuario:', profile);
        
        // Verificar proyectos
        const { data: projects } = await window.supabaseClient.supabase
            .from('projects')
            .select('*')
            .eq('user_id', session.user.id);
            
        console.log('📁 Proyectos del usuario:', projects);
        
        // Verificar onboarding
        const onboardingCompleted = await window.authManager.checkOnboardingStatus(session.user.id);
        console.log('✅ Onboarding completado:', onboardingCompleted);
        
        console.log('\n🎯 FLUJO DE REDIRECCIÓN:');
        console.log('==========================');
        
        if (!onboardingCompleted) {
            console.log('1️⃣ Usuario NO completó onboarding → onboarding-new.html');
        } else if (projects && projects.length > 0) {
            console.log('2️⃣ Usuario tiene proyectos → main-dashboard.html');
        } else {
            console.log('3️⃣ Usuario completó onboarding pero NO tiene proyectos → onboarding-new.html');
        }
        
        console.log('\n✅ Redirección determinada:', redirectUrl);
        
        // Opción para redirigir automáticamente
        const shouldRedirect = confirm(`¿Quieres ser redirigido a: ${redirectUrl}?`);
        if (shouldRedirect) {
            window.location.href = redirectUrl;
        }
        
    } catch (error) {
        console.error('❌ Error en prueba:', error);
    }
}

// Función para simular diferentes estados de usuario
async function simulateUserState(state) {
    console.log(`🎭 SIMULANDO ESTADO: ${state}`);
    console.log('================================');
    
    if (!window.supabaseClient) {
        console.error('❌ Supabase no está disponible');
        return;
    }

    try {
        const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
        
        if (!session) {
            console.log('❌ No hay sesión activa');
            return;
        }

        switch (state) {
            case 'new_user':
                console.log('🆕 Simulando usuario nuevo (sin perfil)');
                // Esta simulación requeriría eliminar temporalmente el perfil
                break;
                
            case 'onboarded_no_projects':
                console.log('📝 Simulando usuario con onboarding pero sin proyectos');
                // El usuario tendría perfil pero no proyectos
                break;
                
            case 'complete_user':
                console.log('✅ Simulando usuario completo (con proyectos)');
                // El usuario tendría perfil y proyectos
                break;
                
            default:
                console.log('❓ Estado no reconocido');
                return;
        }
        
        const redirectUrl = await window.authManager.determineRedirectUrl(session.user.id);
        console.log('🎯 Redirección para este estado:', redirectUrl);
        
    } catch (error) {
        console.error('❌ Error en simulación:', error);
    }
}

// Hacer funciones disponibles globalmente para pruebas
window.testRedirectLogic = testRedirectLogic;
window.simulateUserState = simulateUserState;

console.log('🧪 Scripts de prueba cargados. Usa:');
console.log('• testRedirectLogic() - Para probar la lógica actual');
console.log('• simulateUserState("new_user"|"onboarded_no_projects"|"complete_user") - Para simular estados');
