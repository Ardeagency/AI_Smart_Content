// ===== SISTEMA DE AUTENTICACIÓN =====

class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
        this.loadSavedAuth();
    }

    bindEvents() {
        // Formulario de login
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Formulario de recuperación de contraseña
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', (e) => this.handleForgotPassword(e));
        }

        // Validación en tiempo real
        const inputs = document.querySelectorAll('.form-input');
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
        });
    }

    checkAuthStatus() {
        // Verificar si el usuario ya está autenticado
        const savedAuth = localStorage.getItem('ugc_studio_auth');
        if (savedAuth) {
            const authData = JSON.parse(savedAuth);
            if (authData.token && authData.expiresAt > Date.now()) {
                this.currentUser = authData.user;
                this.isAuthenticated = true;
                this.redirectToDashboard();
            } else {
                // Token expirado, limpiar datos
                this.logout();
            }
        }
    }

    loadSavedAuth() {
        // Cargar datos de autenticación guardados
        const savedAuth = localStorage.getItem('ugc_studio_auth');
        if (savedAuth) {
            const authData = JSON.parse(savedAuth);
            if (authData.rememberMe && authData.email) {
                const emailInput = document.getElementById('email');
                if (emailInput) {
                    emailInput.value = authData.email;
                }
                const rememberCheckbox = document.getElementById('remember_me');
                if (rememberCheckbox) {
                    rememberCheckbox.checked = true;
                }
            }
        }
    }

    validateField(field) {
        const fieldName = field.name;
        const value = field.value.trim();

        // Limpiar errores previos
        this.clearFieldError(field);

        // Validar email
        if (fieldName === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!value) {
                this.showFieldError(field, 'El correo electrónico es obligatorio');
                return false;
            } else if (!emailRegex.test(value)) {
                this.showFieldError(field, 'Ingresa un correo electrónico válido');
                return false;
            }
        }

        // Validar contraseña
        if (fieldName === 'password') {
            if (!value) {
                this.showFieldError(field, 'La contraseña es obligatoria');
                return false;
            } else if (value.length < 6) {
                this.showFieldError(field, 'La contraseña debe tener al menos 6 caracteres');
                return false;
            }
        }

        // Marcar como válido
        this.showFieldSuccess(field);
        return true;
    }

    showFieldError(field, message) {
        field.classList.add('error');
        field.classList.remove('success');
        
        // Remover mensaje de error anterior
        const existingError = field.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // Agregar nuevo mensaje de error
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        field.parentNode.appendChild(errorDiv);
    }

    showFieldSuccess(field) {
        field.classList.remove('error');
        field.classList.add('success');
        
        // Remover mensaje de error si existe
        const existingError = field.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
    }

    clearFieldError(field) {
        field.classList.remove('error');
        const errorMessage = field.parentNode.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const email = formData.get('email');
        const password = formData.get('password');
        const rememberMe = formData.get('remember_me') === 'on';

        // Validar formulario
        if (!this.validateForm()) {
            this.showNotification('Por favor, corrige los errores en el formulario', 'error');
            return;
        }

        // Mostrar loading
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando sesión...';
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');

        try {
            // Simular autenticación con Supabase
            const authResult = await this.authenticateUser(email, password);
            
            if (authResult.success) {
                // Guardar datos de autenticación
                this.saveAuthData(authResult.user, authResult.token, rememberMe, email);
                
                // Mostrar éxito
                this.showNotification('¡Inicio de sesión exitoso!', 'success');
                
                // Redirigir al dashboard
                setTimeout(() => {
                    this.redirectToDashboard();
                }, 1500);
            } else {
                this.showNotification(authResult.message || 'Error al iniciar sesión', 'error');
            }
        } catch (error) {
            console.error('Error en login:', error);
            this.showNotification('Error de conexión. Inténtalo de nuevo.', 'error');
        } finally {
            // Restaurar botón
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
        }
    }

    async authenticateUser(email, password) {
        try {
            // Usar la API de Supabase
            const result = await window.supabaseAPI.signIn(email, password);
            
            if (!result.success) {
                return {
                    success: false,
                    message: result.message
                };
            }
            
            return {
                success: true,
                user: result.data.user,
                token: result.data.auth.session?.access_token || 'token_' + Date.now()
            };
        } catch (error) {
            return {
                success: false,
                message: error.message || 'Error de autenticación'
            };
        }
    }

    saveAuthData(user, token, rememberMe, email) {
        const authData = {
            user: user,
            token: token,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 horas
            rememberMe: rememberMe,
            email: rememberMe ? email : null
        };
        
        localStorage.setItem('ugc_studio_auth', JSON.stringify(authData));
        this.currentUser = user;
        this.isAuthenticated = true;
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const email = formData.get('reset_email');
        
        if (!email) {
            this.showNotification('Ingresa tu correo electrónico', 'error');
            return;
        }

        // Mostrar loading
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        submitBtn.disabled = true;

        try {
            // Simular envío de email de recuperación
            await this.sendPasswordResetEmail(email);
            this.showNotification('Se ha enviado un enlace de recuperación a tu correo', 'success');
            this.closeForgotPassword();
        } catch (error) {
            this.showNotification('Error al enviar el email. Inténtalo de nuevo.', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    async sendPasswordResetEmail(email) {
        // Simular envío de email
        console.log('Enviando email de recuperación a:', email);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    validateForm() {
        let isValid = true;
        const requiredFields = document.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });
        
        return isValid;
    }

    redirectToDashboard() {
        // Redirigir al dashboard o página principal
        window.location.href = 'index.html';
    }

    logout() {
        localStorage.removeItem('ugc_studio_auth');
        this.currentUser = null;
        this.isAuthenticated = false;
        
        // Redirigir al login si no estamos ya ahí
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
    }

    showNotification(message, type = 'info') {
        // Crear notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // Estilos
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
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

        // Remover después de 4 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
}

// Funciones globales
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.password-toggle i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.className = 'fas fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        toggleBtn.className = 'fas fa-eye';
    }
}

function showForgotPassword() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeForgotPassword() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function loginWithGoogle() {
    // Simular login con Google
    console.log('Iniciando sesión con Google');
    authSystem.showNotification('Funcionalidad de Google en desarrollo', 'info');
}

function loginWithFacebook() {
    // Simular login con Facebook
    console.log('Iniciando sesión con Facebook');
    authSystem.showNotification('Funcionalidad de Facebook en desarrollo', 'info');
}

// Inicializar sistema de autenticación
let authSystem;
document.addEventListener('DOMContentLoaded', () => {
    authSystem = new AuthSystem();
});

// Agregar estilos de animación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
