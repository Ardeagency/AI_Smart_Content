/**
 * JavaScript para páginas de autenticación
 * UGC Studio - Manejo de login/register con Supabase
 */

class AuthManager {
    constructor() {
        this.currentForm = 'login';
        this.init();
    }

    /**
     * Inicializar la aplicación de autenticación
     */
    init() {
        this.setupEventListeners();
        this.checkExistingSession();
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Tabs de navegación
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Formularios
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            this.handleLogin(e);
        });

        document.getElementById('registerForm').addEventListener('submit', (e) => {
            this.handleRegister(e);
        });

        // Toggle password
        document.querySelectorAll('.toggle-password').forEach(button => {
            button.addEventListener('click', (e) => {
                this.togglePasswordVisibility(e.currentTarget);
            });
        });

        // Password strength
        document.getElementById('registerPassword').addEventListener('input', (e) => {
            this.updatePasswordStrength(e.target.value);
        });

        // Social login buttons
        document.querySelector('.social-button.google').addEventListener('click', () => {
            this.handleSocialLogin('google');
        });

        document.querySelector('.social-button.github').addEventListener('click', () => {
            this.handleSocialLogin('github');
        });

        // Notification close
        document.querySelector('.notification-close').addEventListener('click', () => {
            this.hideNotification();
        });

        // Forgot password
        document.querySelector('.forgot-password').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleForgotPassword();
        });
    }

    /**
     * Verificar sesión existente
     */
    async checkExistingSession() {
        // Esperar a que el cliente de Supabase esté listo
        await this.waitForSupabase();
        
        if (window.supabaseClient && window.supabaseClient.isReady()) {
            try {
                const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
                if (session) {
                    this.showNotification('Ya tienes una sesión activa. Verificando tu cuenta...', 'success');
                    
                    // Verificar si el usuario tiene proyectos para decidir redirección
                    const redirectUrl = await this.determineRedirectUrl(session.user.id);
                    
                    setTimeout(() => {
                        window.location.href = redirectUrl;
                    }, 1500);
                }
            } catch (error) {
                console.log('No hay sesión activa');
            }
        }
    }

    /**
     * Esperar a que Supabase esté disponible
     */
    async waitForSupabase() {
        let attempts = 0;
        while ((!window.supabaseClient || !window.supabaseClient.isReady()) && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!window.supabaseClient || !window.supabaseClient.isReady()) {
            throw new Error('Supabase no está disponible');
        }
    }

    /**
     * Cambiar entre tabs (login/register)
     */
    switchTab(tab) {
        // Actualizar botones
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        // Actualizar formularios
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
        });
        document.querySelector(`[data-form="${tab}"]`).classList.add('active');

        this.currentForm = tab;
    }

    /**
     * Manejar login
     */
    async handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const button = e.target.querySelector('.auth-button');

        if (!email || !password) {
            this.showNotification('Por favor completa todos los campos', 'error');
            return;
        }

        this.setButtonLoading(button, true);

        try {
            await this.waitForSupabase();
            
            const { data, error } = await window.supabaseClient.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                if (error.message === 'Email not confirmed') {
                    this.showEmailNotConfirmedModal(email);
                } else {
                    this.showNotification(this.getErrorMessage(error.message), 'error');
                }
            } else {
                this.showNotification('¡Bienvenido de vuelta! Verificando tu cuenta...', 'success');
                
                // Verificar si el usuario tiene proyectos para decidir redirección
                const redirectUrl = await this.determineRedirectUrl(data.user.id);
                
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 1500);
            }
        } catch (error) {
            console.error('Error en login:', error);
            this.showNotification('Error al iniciar sesión. Intenta nuevamente.', 'error');
        } finally {
            this.setButtonLoading(button, false);
        }
    }

    /**
     * Manejar registro
     */
    async handleRegister(e) {
        e.preventDefault();

        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const country = document.getElementById('country').value;
        const acceptTerms = document.getElementById('acceptTerms').checked;
        const button = e.target.querySelector('.auth-button');

        // Validaciones
        if (!firstName || !lastName || !email || !password || !country) {
            this.showNotification('Por favor completa todos los campos obligatorios', 'error');
            return;
        }

        if (!acceptTerms) {
            this.showNotification('Debes aceptar los términos y condiciones', 'error');
            return;
        }

        if (password.length < 8) {
            this.showNotification('La contraseña debe tener al menos 8 caracteres', 'error');
            return;
        }

        this.setButtonLoading(button, true);

        try {
            await this.waitForSupabase();
            
            const { data, error } = await window.supabaseClient.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: `${firstName} ${lastName}`,
                        country: country,
                        language: 'es'
                    }
                }
            });

            if (error) {
                this.showNotification(this.getErrorMessage(error.message), 'error');
            } else {
                this.showNotification('¡Cuenta creada exitosamente! Revisa tu email para confirmarla.', 'success');
                // Guardar email para verificación
                localStorage.setItem('verificationEmail', email);
                setTimeout(() => {
                    window.location.href = `verify-email.html?email=${encodeURIComponent(email)}`;
                }, 2000);
            }
        } catch (error) {
            console.error('Error en registro:', error);
            this.showNotification('Error al crear la cuenta. Intenta nuevamente.', 'error');
        } finally {
            this.setButtonLoading(button, false);
        }
    }

    /**
     * Toggle visibility de password
     */
    togglePasswordVisibility(button) {
        const targetId = button.dataset.target;
        const input = document.getElementById(targetId);
        const icon = button.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    /**
     * Actualizar indicador de fortaleza de contraseña
     */
    updatePasswordStrength(password) {
        const strengthBar = document.querySelector('.strength-fill');
        const strengthText = document.querySelector('.strength-text');

        if (!password) {
            strengthBar.className = 'strength-fill';
            strengthText.textContent = 'Débil';
            return;
        }

        let score = 0;
        let feedback = 'Débil';

        // Criterios de fortaleza
        if (password.length >= 8) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        // Determinar clase y texto
        strengthBar.className = 'strength-fill';
        
        if (score >= 5) {
            strengthBar.classList.add('very-strong');
            feedback = 'Muy fuerte';
        } else if (score >= 4) {
            strengthBar.classList.add('strong');
            feedback = 'Fuerte';
        } else if (score >= 3) {
            strengthBar.classList.add('medium');
            feedback = 'Media';
        } else if (score >= 1) {
            strengthBar.classList.add('weak');
            feedback = 'Débil';
        }

        strengthText.textContent = feedback;
    }

    /**
     * Manejar login social
     */
    async handleSocialLogin(provider) {
        try {
            await this.waitForSupabase();
            
            this.showNotification(`Redirigiendo a ${provider.charAt(0).toUpperCase() + provider.slice(1)}...`, 'success');
            
            const { data, error } = await window.supabaseClient.supabase.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: `${window.location.origin}/auth-callback.html`
                }
            });

            if (error) {
                throw error;
            }
        } catch (error) {
            console.error(`Error en login social ${provider}:`, error);
            this.showNotification(`Error al conectar con ${provider}`, 'error');
        }
    }

    /**
     * Determinar URL de redirección basado en el estado del usuario
     */
    async determineRedirectUrl(userId) {
        try {
            console.log('🔍 Verificando estado del usuario:', userId);
            
            // 1. Verificar si el usuario completó el onboarding
            const onboardingCompleted = await this.checkOnboardingStatus(userId);
            
            if (!onboardingCompleted) {
                console.log('📝 Usuario no ha completado onboarding, redirigiendo...');
                return 'onboarding-new.html';
            }
            
            // 2. Verificar si el usuario tiene proyectos existentes
            const { data: projects, error } = await window.supabaseClient.supabase
                .from('projects')
                .select('id')
                .eq('user_id', userId)
                .limit(1);

            if (error) {
                console.warn('⚠️ Error verificando proyectos:', error);
                // En caso de error, enviar al onboarding por seguridad
                return 'onboarding-new.html';
            }

            if (projects && projects.length > 0) {
                console.log('📊 Usuario tiene proyectos, redirigiendo al studio');
                // Usuario tiene proyectos, enviar al studio
                return 'studio.html';
            } else {
                console.log('🆕 Usuario completó onboarding pero no tiene proyectos, crear primer proyecto');
                // Usuario completó onboarding pero no tiene proyectos, crear uno nuevo
                return 'onboarding-new.html';
            }
        } catch (error) {
            console.error('❌ Error determinando redirección:', error);
            // En caso de error, enviar al onboarding por seguridad
            return 'onboarding-new.html';
        }
    }

    /**
     * Verificar si el usuario completó el onboarding
     */
    async checkOnboardingStatus(userId) {
        try {
            // Verificar si el usuario tiene un perfil completo
            const { data: profile, error } = await window.supabaseClient.supabase
                .from('user_profiles')
                .select('full_name, country, language, plan_type')
                .eq('user_id', userId)
                .single();

            if (error) {
                console.warn('⚠️ Error verificando perfil:', error);
                return false;
            }

            // Considerar completado si tiene los campos básicos
            return profile && profile.full_name && profile.country && profile.language;
        } catch (error) {
            console.error('❌ Error verificando onboarding:', error);
            return false;
        }
    }

    /**
     * Mostrar modal para email no confirmado
     */
    showEmailNotConfirmedModal(email) {
        const modalHTML = `
            <div class="notification error email-modal" id="emailNotConfirmedModal" style="transform: translateX(0); max-width: 400px; top: 50%; left: 50%; transform: translate(-50%, -50%); position: fixed; z-index: 10000;">
                <div class="notification-content">
                    <i class="notification-icon fas fa-exclamation-triangle"></i>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 8px 0; color: var(--text-primary);">Email no confirmado</h4>
                        <p style="margin: 0 0 15px 0; color: var(--text-secondary); font-size: 0.9rem;">
                            Necesitas confirmar tu email antes de continuar. Revisa tu bandeja de entrada.
                        </p>
                        <button onclick="authManager.resendVerificationEmail('${email}')" class="auth-button" style="width: 100%; margin: 5px 0; padding: 10px; font-size: 0.9rem;">
                            <i class="fas fa-paper-plane"></i> Reenviar verificación
                        </button>
                        <button onclick="authManager.hideEmailNotConfirmedModal()" class="auth-button" style="width: 100%; background: rgba(42, 42, 42, 0.7); margin: 5px 0; padding: 10px; font-size: 0.9rem;">
                            Entendido
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Auto-ocultar después de 30 segundos
        setTimeout(() => {
            this.hideEmailNotConfirmedModal();
        }, 30000);
    }

    /**
     * Ocultar modal de email no confirmado
     */
    hideEmailNotConfirmedModal() {
        const modal = document.getElementById('emailNotConfirmedModal');
        if (modal) {
            modal.remove();
        }
    }

    /**
     * Reenviar email de verificación
     */
    async resendVerificationEmail(email) {
        try {
            await this.waitForSupabase();
            
            const { error } = await window.supabaseClient.supabase.auth.resend({
                type: 'signup',
                email: email
            });

            if (error) {
                throw error;
            }

            this.showNotification('Email de verificación reenviado exitosamente', 'success');
            this.hideEmailNotConfirmedModal();
        } catch (error) {
            console.error('Error reenviando email:', error);
            this.showNotification('Error al reenviar el email de verificación', 'error');
        }
    }

    /**
     * Manejar "Olvidé mi contraseña"
     */
    async handleForgotPassword() {
        const email = document.getElementById('loginEmail').value;

        if (!email) {
            this.showNotification('Ingresa tu email para recuperar la contraseña', 'warning');
            document.getElementById('loginEmail').focus();
            return;
        }

        try {
            await this.waitForSupabase();
            
            const { error } = await window.supabaseClient.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });

            if (error) {
                throw error;
            }

            this.showNotification('Te hemos enviado un email para restablecer tu contraseña', 'success');
        } catch (error) {
            console.error('Error al enviar email de recuperación:', error);
            this.showNotification('Error al enviar el email de recuperación', 'error');
        }
    }

    /**
     * Establecer estado de carga en botón
     */
    setButtonLoading(button, loading) {
        const buttonText = button.querySelector('.button-text');
        const spinner = button.querySelector('.loading-spinner');

        if (loading) {
            button.disabled = true;
            buttonText.style.opacity = '0';
            spinner.style.display = 'block';
        } else {
            button.disabled = false;
            buttonText.style.opacity = '1';
            spinner.style.display = 'none';
        }
    }

    /**
     * Mostrar notificación
     */
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const icon = notification.querySelector('.notification-icon');
        const messageEl = notification.querySelector('.notification-message');

        // Limpiar clases anteriores
        notification.className = 'notification';

        // Configurar icono según tipo
        switch (type) {
            case 'success':
                notification.classList.add('success');
                icon.className = 'notification-icon fas fa-check-circle';
                break;
            case 'error':
                notification.classList.add('error');
                icon.className = 'notification-icon fas fa-exclamation-triangle';
                break;
            case 'warning':
                notification.classList.add('warning');
                icon.className = 'notification-icon fas fa-exclamation-circle';
                break;
            default:
                icon.className = 'notification-icon fas fa-info-circle';
        }

        messageEl.textContent = message;
        notification.classList.add('show');

        // Auto-ocultar después de 5 segundos
        setTimeout(() => {
            this.hideNotification();
        }, 5000);
    }

    /**
     * Ocultar notificación
     */
    hideNotification() {
        const notification = document.getElementById('notification');
        notification.classList.remove('show');
    }

    /**
     * Partículas removidas - ya no se usan
     */

    /**
     * Obtener mensaje de error traducido
     */
    getErrorMessage(error) {
        const errorMessages = {
            'Invalid login credentials': 'Email o contraseña incorrectos',
            'Email not confirmed': 'Por favor confirma tu email antes de continuar',
            'User already registered': 'Este email ya está registrado',
            'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
            'Unable to validate email address: invalid format': 'Formato de email inválido',
            'Database connection error': 'Error de conexión. Intenta nuevamente.',
            'Rate limit exceeded': 'Demasiados intentos. Espera un momento antes de intentar nuevamente.'
        };

        return errorMessages[error] || error || 'Error desconocido';
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

// Manejar el evento de carga de la página para verificar autenticación
window.addEventListener('load', () => {
    // Dar tiempo para que se cargue la configuración de Supabase
    setTimeout(async () => {
        try {
            if (window.supabaseClient && window.supabaseClient.isReady()) {
                const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
                if (session && window.authManager) {
                    // Usar la misma lógica de redirección inteligente
                    const redirectUrl = await window.authManager.determineRedirectUrl(session.user.id);
                    window.location.href = redirectUrl;
                }
            }
        } catch (error) {
            console.log('No hay sesión activa');
        }
    }, 1000);
});