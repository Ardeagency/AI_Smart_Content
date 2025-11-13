/**
 * JavaScript para páginas de autenticación
 * AI Smart Content - Manejo de login/register con Supabase
 */

class AuthManager {
    constructor() {
        this.currentForm = 'login';
        this.supabase = null;
        this.init();
    }

    /**
     * Inicializar la aplicación de autenticación
     */
    async init() {
        await this.initSupabase();
        this.setupEventListeners();
        await this.checkExistingSession();
    }

    /**
     * Inicializar Supabase
     */
    async initSupabase() {
        try {
            // Esperar a que Supabase esté listo
            if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase();
            } else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            }

            if (!this.supabase) {
                console.warn('Supabase no está disponible');
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
        }
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
        if (!this.supabase) {
            await this.initSupabase();
        }

        if (!this.supabase) return;

        try {
            const { data: { session } } = await this.supabase.auth.getSession();
            
                if (session) {
                // Usuario ya está autenticado, redirigir
                    const redirectUrl = await this.determineRedirectUrl(session.user.id);
                        window.location.href = redirectUrl;
            }
        } catch (error) {
            console.error('Error checking session:', error);
        }
    }

    async waitForSupabase() {
        // Usar la función global waitForSupabase
        if (typeof waitForSupabase === 'function') {
            this.supabase = await waitForSupabase();
        } else if (window.supabaseClient) {
            this.supabase = window.supabaseClient;
        }
        return this.supabase;
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
            if (!this.supabase) {
                await this.waitForSupabase();
            }

            if (!this.supabase) {
                throw new Error('Supabase no está disponible');
            }
            
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });

            if (error) {
                throw error;
                }

            if (data.user) {
                this.showNotification('¡Bienvenido de vuelta!', 'success');
                
                // Redirigir después de un breve delay
                setTimeout(async () => {
                const redirectUrl = await this.determineRedirectUrl(data.user.id);
                    window.location.href = redirectUrl;
                }, 1000);
            }
        } catch (error) {
            console.error('Error en login:', error);
            
            let errorMessage = 'Error al iniciar sesión. Intenta nuevamente.';
            if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'Email o contraseña incorrectos';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage = 'Por favor verifica tu email antes de iniciar sesión';
            }
            
            this.showNotification(errorMessage, 'error');
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
            if (!this.supabase) {
                await this.waitForSupabase();
            }

            if (!this.supabase) {
                throw new Error('Supabase no está disponible');
            }

            const fullName = `${firstName.trim()} ${lastName.trim()}`;

            // Registrar usuario en Supabase Auth
            const { data, error } = await this.supabase.auth.signUp({
                email: email.trim(),
                password: password,
                options: {
                    data: {
                        full_name: fullName,
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        country: country
                    }
                }
            });

            if (error) {
                throw error;
            }

            if (data.user) {
                // El trigger handle_new_user() creará automáticamente el registro en public.users
                this.showNotification('¡Cuenta creada exitosamente! Redirigiendo...', 'success');
                
                // Redirigir al formulario de registro de datos
                setTimeout(() => {
                    window.location.href = 'form-record.html';
                }, 1500);
            }
        } catch (error) {
            console.error('Error en registro:', error);
            
            let errorMessage = 'Error al crear la cuenta. Intenta nuevamente.';
            if (error.message.includes('User already registered')) {
                errorMessage = 'Este email ya está registrado. Inicia sesión en su lugar.';
            } else if (error.message.includes('Password')) {
                errorMessage = 'La contraseña no cumple con los requisitos de seguridad';
            } else if (error.message.includes('Email')) {
                errorMessage = 'El email no es válido';
            }
            
            this.showNotification(errorMessage, 'error');
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
            if (!this.supabase) {
                await this.waitForSupabase();
            }
            
            if (!this.supabase) {
                throw new Error('Supabase no está disponible');
            }
            
            const { data, error } = await this.supabase.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: `${window.location.origin}/auth-callback.html`
                }
            });

            if (error) {
                throw error;
            }
        } catch (error) {
            console.error('Error en login social:', error);
            this.showNotification(`Error al iniciar sesión con ${provider}. Intenta nuevamente.`, 'error');
        }
    }

    /**
     * Determinar URL de redirección basado en el estado del usuario
     */
    async determineRedirectUrl(userId) {
        if (!this.supabase || !userId) {
            return 'form-record.html';
        }

        try {
            // Verificar si el usuario tiene proyectos
            const { data: projects, error } = await this.supabase
                .from('projects')
                .select('id')
                .eq('user_id', userId)
                .limit(1);

            if (error) {
                console.error('Error checking projects:', error);
                return 'form-record.html';
            }

            // Verificar si el usuario completó el formulario
            const { data: userData } = await this.supabase
                .from('users')
                .select('form_verified')
                .eq('id', userId)
                .single();

            // Si no completó el formulario, siempre redirigir al formulario
            if (!userData || userData.form_verified !== true) {
                return 'form-record.html';
            }

            // Si completó el formulario, ir al living
            return 'living.html';
        } catch (error) {
            console.error('Error determining redirect:', error);
            return 'form-record.html';
        }
    }

    async checkOnboardingStatus(userId) {
                return false;
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
            if (!this.supabase) {
                await this.waitForSupabase();
            }

            if (!this.supabase) {
                throw new Error('Supabase no está disponible');
            }
            
            const { error } = await this.supabase.auth.resend({
                type: 'signup',
                email: email
            });

            if (error) {
                throw error;
            }

            this.showNotification('Email de verificación reenviado. Revisa tu bandeja de entrada.', 'success');
            this.hideEmailNotConfirmedModal();
        } catch (error) {
            console.error('Error resending verification:', error);
            this.showNotification('Error al reenviar el email. Intenta nuevamente.', 'error');
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
            if (!this.supabase) {
                await this.waitForSupabase();
            }

            if (!this.supabase) {
                throw new Error('Supabase no está disponible');
            }
            
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });

            if (error) {
                throw error;
            }

            this.showNotification('Se ha enviado un email con instrucciones para recuperar tu contraseña', 'success');
        } catch (error) {
            console.error('Error in password recovery:', error);
            this.showNotification('Error al enviar el email de recuperación. Intenta nuevamente.', 'error');
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

// Supabase desactivado - verificación de sesión deshabilitada