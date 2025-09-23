// Onboarding Verification System
// Verifica que el usuario haya completado el onboarding exitosamente antes de permitir acceso al dashboard

class OnboardingVerification {
    constructor() {
        this.verificationChecks = [];
        this.isVerified = false;
    }

    async verifyOnboardingAccess() {
        try {
            // 1. Verificar que el usuario esté autenticado
            const currentUser = await this.getCurrentUser();
            if (!currentUser) {
                this.redirectToLogin();
                return false;
            }

            // 2. Verificar que el onboarding esté marcado como completado
            const onboardingCompleted = await this.checkOnboardingStatus(currentUser.id);
            if (!onboardingCompleted) {
                this.redirectToOnboarding();
                return false;
            }

            // 3. Verificar que los datos esenciales existan en Supabase
            const dataExists = await this.verifyEssentialData(currentUser.id);
            if (!dataExists) {
                this.redirectToOnboarding();
                return false;
            }

            this.isVerified = true;
            return true;

        } catch (error) {
            this.redirectToOnboarding();
            return false;
        }
    }

    async getCurrentUser() {
        try {
            if (!window.supabaseClient || !window.supabaseClient.getCurrentUser) {
                throw new Error('Supabase client no disponible');
            }
            return await window.supabaseClient.getCurrentUser();
        } catch (error) {
            console.error('Error obteniendo usuario actual:', error);
            return null;
        }
    }

    async checkOnboardingStatus(userId) {
        try {
            const { data, error } = await window.supabaseClient.client
                .from('user_profiles')
                .select('onboarding_completed, onboarding_completed_at')
                .eq('user_id', userId)
                .single();

            if (error) {
                console.error('Error verificando estado de onboarding:', error);
                return false;
            }

            return data && data.onboarding_completed === true;
        } catch (error) {
            console.error('Error en checkOnboardingStatus:', error);
            return false;
        }
    }

    async verifyEssentialData(userId) {
        try {
            // Verificar proyectos
            const { data: projects, error: projectsError } = await window.supabaseClient.client
                .from('projects')
                .select('id')
                .eq('user_id', userId)
                .limit(1);

            if (projectsError || !projects || projects.length === 0) {
                return false;
            }

            // Verificar productos
            const { data: products, error: productsError } = await window.supabaseClient.client
                .from('products')
                .select('id')
                .eq('user_id', userId)
                .limit(1);

            if (productsError) {
                console.warn('Error verificando productos:', productsError);
                return false;
            }

            if (!products || products.length === 0) {
                return false;
            }

            // Verificar avatares
            const { data: avatars, error: avatarsError } = await window.supabaseClient.client
                .from('avatars')
                .select('id')
                .eq('user_id', userId)
                .limit(1);

            if (avatarsError) {
                console.warn('Error verificando avatares:', avatarsError);
                return false;
            }

            if (!avatars || avatars.length === 0) {
                return false;
            }

            return true;

        } catch (error) {
            return false;
        }
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
        sessionStorage.clear();
        window.location.href = '/login.html';
    }

    redirectToOnboarding() {
        sessionStorage.removeItem('onboardingCompleted');
        sessionStorage.removeItem('onboardingCompletedAt');
        window.location.href = '/onboarding-new.html';
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

// Inicializar verificación cuando se carga el dashboard
document.addEventListener('DOMContentLoaded', async () => {
    const verification = new OnboardingVerification();
    
    // Mostrar estado de verificación
    verification.showVerificationStatus();
    
    // Verificar acceso
    const hasAccess = await verification.verifyOnboardingAccess();
    
    if (hasAccess) {
        verification.hideVerificationStatus();
        
        // Marcar como verificado en sessionStorage
        sessionStorage.setItem('dashboardAccessVerified', 'true');
        sessionStorage.setItem('dashboardAccessVerifiedAt', new Date().toISOString());
    }
    // La redirección se maneja en los métodos de verificación
});

// Exportar para uso global
window.OnboardingVerification = OnboardingVerification;
