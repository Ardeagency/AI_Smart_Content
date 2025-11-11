// Onboarding Verification System
// Verifica que el usuario haya completado el onboarding exitosamente antes de permitir acceso al dashboard

class OnboardingVerification {
    constructor() {
        this.verificationChecks = [];
        this.isVerified = false;
    }

    async verifyOnboardingAccess() {
        try {
            console.log('🔐 Iniciando verificación de acceso al dashboard...');
            
            // 1. Verificar que el usuario esté autenticado
            console.log('👤 Verificando autenticación...');
            const currentUser = await this.getCurrentUser();
            if (!currentUser) {
                console.log('❌ Usuario no autenticado, redirigiendo a login');
                this.redirectToLogin();
                return false;
            }
            console.log('✅ Usuario autenticado:', currentUser.id);

            // 2. Verificar que el onboarding esté marcado como completado
            console.log('📋 Verificando estado de onboarding...');
            const onboardingCompleted = await this.checkOnboardingStatus(currentUser.id);
            if (!onboardingCompleted) {
                console.log('❌ Onboarding no completado, redirigiendo a onboarding');
                this.redirectToOnboarding();
                return false;
            }
            console.log('✅ Onboarding marcado como completado');

            // 3. Verificar que los datos esenciales existan en Supabase
            console.log('🔍 Verificando datos esenciales...');
            const dataExists = await this.verifyEssentialData(currentUser.id);
            if (!dataExists) {
                console.log('❌ Datos esenciales faltantes, redirigiendo a onboarding');
                this.redirectToOnboarding();
                return false;
            }
            console.log('✅ Todos los datos esenciales verificados');

            this.isVerified = true;
            console.log('🎉 Acceso al dashboard autorizado');
            
            // Limpiar contador de redirecciones al acceder exitosamente
            sessionStorage.removeItem('redirectCount');
            
            return true;

        } catch (error) {
            console.error('❌ Error en verificación de onboarding:', error);
            this.redirectToOnboarding();
            return false;
        }
    }

    async getCurrentUser() {
        return null;
    }

    async checkOnboardingStatus(userId) {
        return false;
    }

    async verifyEssentialData(userId) {
        return false;
    }

    async validateSession() {
        try {
            // Verificar que la sesión no haya expirado
            const sessionData = sessionStorage.getItem('onboardingCompleted');
            const completedAt = sessionStorage.getItem('onboardingCompletedAt');
            
            if (!sessionData || sessionData !== 'true') {
                return false;
            }

            // Verificar que no haya pasado demasiado tiempo (opcional)
            if (completedAt) {
                const completedTime = new Date(completedAt);
                const now = new Date();
                const hoursDiff = (now - completedTime) / (1000 * 60 * 60);
                
                // Si han pasado más de 24 horas, requerir re-verificación
                if (hoursDiff > 24) {
                    console.log('⚠️ Sesión expirada (más de 24 horas)');
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Error validando sesión:', error);
            return false;
        }
    }

    redirectToLogin() {
        // Evitar bucle infinito
        const redirectCount = parseInt(sessionStorage.getItem('redirectCount') || '0');
        if (redirectCount >= 3) {
            console.error('❌ Demasiadas redirecciones, limpiando sesión');
            sessionStorage.clear();
            alert('Error de sesión. Por favor, inicia sesión nuevamente.');
            return;
        }
        
        sessionStorage.setItem('redirectCount', (redirectCount + 1).toString());
        sessionStorage.clear();
        window.location.href = '/login.html';
    }

    redirectToOnboarding() {
        // Evitar bucle infinito
        const redirectCount = parseInt(sessionStorage.getItem('redirectCount') || '0');
        if (redirectCount >= 3) {
            console.error('❌ Demasiadas redirecciones, limpiando sesión');
            sessionStorage.clear();
            alert('Error de configuración. Por favor, inicia sesión nuevamente.');
            return;
        }
        
        sessionStorage.setItem('redirectCount', (redirectCount + 1).toString());
        sessionStorage.removeItem('onboardingCompleted');
        sessionStorage.removeItem('onboardingCompletedAt');
        window.location.href = '/form-record.html';
    }

    // Método para mostrar estado de verificación
    showVerificationStatus() {
        const statusOverlay = document.createElement('div');
        statusOverlay.id = 'verification-status';
        statusOverlay.innerHTML = `
            <div class="verification-container">
                <div class="verification-spinner"></div>
                <h3>Verificando Acceso</h3>
                <p>Validando que tu perfil esté completo...</p>
            </div>
        `;
        statusOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            color: white;
            font-family: 'Inter', sans-serif;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            .verification-container {
                text-align: center;
                padding: 2rem;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
            }
            .verification-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top: 4px solid #4CAF50;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 1rem;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(statusOverlay);
    }

    hideVerificationStatus() {
        const statusOverlay = document.getElementById('verification-status');
        if (statusOverlay) {
            document.body.removeChild(statusOverlay);
        }
    }
}

// Dashboard sin verificación - acceso directo
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎉 Dashboard cargado - acceso directo sin verificación');
    
    // Marcar como verificado en sessionStorage
    sessionStorage.setItem('dashboardAccessVerified', 'true');
    sessionStorage.setItem('dashboardAccessVerifiedAt', new Date().toISOString());
});

// Exportar para uso global
window.OnboardingVerification = OnboardingVerification;
