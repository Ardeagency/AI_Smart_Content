/**
 * LoginView - Vista de login dedicada
 * Maneja autenticación de usuarios
 */
class LoginView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'login.html';
    this.loginForm = null;
    this.supabase = null;
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Si ya está autenticado, redirigir usando AuthService
    if (window.authService) {
      const isAuth = await window.authService.isAuthenticated();
      if (isAuth) {
        const user = window.authService.getCurrentUser();
        const redirectRoute = await window.authService.determineRedirectRoute(user?.id);
        if (window.router) {
          window.router.navigate(redirectRoute || '/living');
        } else {
          window.location.href = '/living.html';
        }
        return;
      }
    } else {
      // Fallback
      const isAuth = await this.checkAuthentication();
      if (isAuth) {
        if (window.router) {
          window.router.navigate('/living');
        } else {
          window.location.href = '/living.html';
        }
        return;
      }
    }

    // Inicializar Supabase
    await this.initSupabase();
  }

  /**
   * Inicializar la vista
   */
  async init() {
    // Setup elementos del DOM
    this.loginForm = this.querySelector('#loginForm');
    const togglePassword = this.querySelector('.toggle-password');
    const googleLoginBtn = this.querySelector('#googleLoginBtn');
    const notificationClose = this.querySelector('.notification-close');
    const forgotPassword = this.querySelector('.forgot-password');

    // Setup event listeners
    if (this.loginForm) {
      this.addEventListener(this.loginForm, 'submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    // Toggle password visibility
    if (togglePassword) {
      this.addEventListener(togglePassword, 'click', () => {
        this.togglePasswordVisibility(togglePassword);
      });
    }

    // Google login
    if (googleLoginBtn) {
      this.addEventListener(googleLoginBtn, 'click', () => {
        this.handleSocialLogin('google');
      });
    }

    // Close notification
    if (notificationClose) {
      this.addEventListener(notificationClose, 'click', () => {
        this.hideNotification();
      });
    }

    // Forgot password
    if (forgotPassword) {
      this.addEventListener(forgotPassword, 'click', (e) => {
        e.preventDefault();
        this.handleForgotPassword();
      });
    }
  }

  /**
   * Inicializar Supabase
   */
  async initSupabase() {
    // Usar SupabaseService si está disponible
    if (window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
      return;
    }
    
    // Fallback a app-loader
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        this.supabase = await window.appLoader.waitFor();
      } catch (error) {
        console.error('Error inicializando Supabase:', error);
      }
    } else if (window.supabase) {
      this.supabase = window.supabase;
    }
  }

  /**
   * Verificar autenticación
   */
  async checkAuthentication() {
    if (!this.supabase) {
      await this.initSupabase();
    }

    if (!this.supabase) return false;

    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      return session !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Manejar login
   */
  async handleLogin() {
    const emailInput = this.querySelector('#loginEmail');
    const passwordInput = this.querySelector('#loginPassword');
    const submitButton = this.querySelector('.auth-button');
    const buttonText = submitButton?.querySelector('.button-text');
    const loadingSpinner = submitButton?.querySelector('.loading-spinner');

    if (!emailInput || !passwordInput) {
      this.showNotification('Error: Campos no encontrados', 'error');
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      this.showNotification('Por favor completa todos los campos', 'error');
      return;
    }

    // Mostrar loading
    if (submitButton && buttonText && loadingSpinner) {
      buttonText.style.display = 'none';
      loadingSpinner.style.display = 'block';
      submitButton.disabled = true;
    }

    try {
      // Usar AuthService si está disponible
      if (window.authService) {
        const result = await window.authService.login(email, password);
        
        if (result.success) {
          this.showNotification('¡Bienvenido de vuelta!', 'success');
          
          // Redirigir después de un breve delay
          setTimeout(() => {
            if (window.router) {
              window.router.navigate(result.redirectRoute || '/living');
            } else {
              window.location.href = (result.redirectRoute || '/living') + '.html';
            }
          }, 1000);
        } else {
          let errorMessage = result.error || 'Error al iniciar sesión. Intenta nuevamente.';
          if (result.message) {
            errorMessage = result.message;
          }
          this.showNotification(errorMessage, 'error');
        }
        return;
      }

      // Fallback: lógica antigua
      if (!this.supabase) {
        await this.initSupabase();
      }

      if (!this.supabase) {
        throw new Error('Supabase no está disponible');
      }

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        this.showNotification('¡Bienvenido de vuelta!', 'success');
        
        // Determinar ruta de redirección
        const redirectUrl = await this.determineRedirectUrl(data.user.id);
        
        // Redirigir después de un breve delay
        setTimeout(() => {
          if (window.router) {
            window.router.navigate(redirectUrl);
          } else {
            window.location.href = redirectUrl + '.html';
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Error en login:', error);
      
      let errorMessage = 'Error al iniciar sesión. Intenta nuevamente.';
      if (error.message && error.message.includes('Invalid login credentials')) {
        errorMessage = 'Email o contraseña incorrectos';
      } else if (error.message && error.message.includes('Email not confirmed')) {
        errorMessage = 'Por favor verifica tu email antes de iniciar sesión';
      }
      
      this.showNotification(errorMessage, 'error');
    } finally {
      // Ocultar loading
      if (submitButton && buttonText && loadingSpinner) {
        buttonText.style.display = 'block';
        loadingSpinner.style.display = 'none';
        submitButton.disabled = false;
      }
    }
  }

  /**
   * Determinar URL de redirección basado en el estado del usuario
   */
  async determineRedirectUrl(userId) {
    if (!this.supabase || !userId) {
      return '/form-record';
    }

    try {
      // Verificar si el usuario completó el formulario
      const { data: userData } = await this.supabase
        .from('users')
        .select('form_verified')
        .eq('id', userId)
        .single();

      // Si no completó el formulario, siempre redirigir al formulario
      if (!userData || userData.form_verified !== true) {
        return '/form-record';
      }

      // Si completó el formulario, ir al living
      return '/living';
    } catch (error) {
      console.error('Error determining redirect:', error);
      return '/form-record';
    }
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(button) {
    const targetId = button.dataset.target;
    const input = this.querySelector(`#${targetId}`);
    const icon = button.querySelector('i');

    if (!input || !icon) return;

    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);

    if (type === 'text') {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    } else {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    }
  }

  /**
   * Manejar login social
   */
  async handleSocialLogin(provider) {
    // Usar AuthService si está disponible
    if (window.authService) {
      const result = await window.authService.socialLogin(provider);
      if (!result.success) {
        this.showNotification(result.error || 'Error al iniciar sesión con ' + provider, 'error');
      }
      return;
    }

    // Fallback: lógica antigua
    if (!this.supabase) {
      await this.initSupabase();
    }

    if (!this.supabase) {
      this.showNotification('Error: Supabase no está disponible', 'error');
      return;
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: `${window.location.origin}/#/living`
        }
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error en social login:', error);
      this.showNotification('Error al iniciar sesión con ' + provider + '. Intenta nuevamente.', 'error');
    }
  }

  /**
   * Manejar forgot password
   */
  async handleForgotPassword() {
    const emailInput = this.querySelector('#loginEmail');
    const email = emailInput?.value.trim();

    if (!email) {
      this.showNotification('Por favor ingresa tu email primero', 'error');
      return;
    }

    // Usar AuthService si está disponible
    if (window.authService) {
      const result = await window.authService.resetPassword(email);
      if (result.success) {
        this.showNotification('Se ha enviado un email para restablecer tu contraseña', 'success');
      } else {
        this.showNotification(result.error || 'Error al enviar el email. Intenta nuevamente.', 'error');
      }
      return;
    }

    // Fallback: lógica antigua
    if (!this.supabase) {
      await this.initSupabase();
    }

    if (!this.supabase) {
      this.showNotification('Error: Supabase no está disponible', 'error');
      return;
    }

    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/login`
      });

      if (error) {
        throw error;
      }

      this.showNotification('Se ha enviado un email para restablecer tu contraseña', 'success');
    } catch (error) {
      console.error('Error en forgot password:', error);
      this.showNotification('Error al enviar el email. Intenta nuevamente.', 'error');
    }
  }

  /**
   * Mostrar notificación
   */
  showNotification(message, type = 'info') {
    const notification = this.querySelector('#notification');
    if (!notification) return;

    const icon = notification.querySelector('.notification-icon');
    const messageEl = notification.querySelector('.notification-message');

    if (icon && messageEl) {
      // Remover clases anteriores
      icon.className = 'notification-icon';
      notification.className = 'notification';

      // Agregar clase de tipo
      notification.classList.add(type);
      icon.classList.add(type);

      // Configurar icono según tipo
      const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
      };

      icon.className = `notification-icon ${icons[type] || icons.info}`;
      messageEl.textContent = message;

      // Mostrar notificación
      notification.classList.add('show');

      // Auto ocultar después de 5 segundos
      setTimeout(() => {
        this.hideNotification();
      }, 5000);
    }
  }

  /**
   * Ocultar notificación
   */
  hideNotification() {
    const notification = this.querySelector('#notification');
    if (notification) {
      notification.classList.remove('show');
    }
  }
}

// Hacer disponible globalmente
window.LoginView = LoginView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoginView;
}

