/**
 * LandingView - Vista de la página principal (landing)
 * Maneja el modal de login y la navegación inicial
 */
class LandingView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'landing.html';
    this.loginBtn = null;
    this.loginModal = null;
    this.loginForm = null;
    this.closeLoginModal = null;
    this.toggleLoginPassword = null;
    this.closeEmailNotification = null;
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // La landing page siempre se muestra, no redirige automáticamente
    // Solo redirige después de un login exitoso
    console.log('✅ Landing page cargada');
  }

  /**
   * Inicializar la vista
   */
  async init() {
    // Setup elementos del DOM
    this.loginBtn = this.querySelector('#loginBtn');
    this.loginModal = this.querySelector('#loginModal');
    this.loginForm = this.querySelector('#loginForm');
    this.closeLoginModal = this.querySelector('#closeLoginModal');
    this.toggleLoginPassword = this.querySelector('#toggleLoginPassword');
    this.closeEmailNotification = this.querySelector('#closeEmailNotification');

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Botón de login - mostrar modal
    if (this.loginBtn) {
      this.addEventListener(this.loginBtn, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.loginModal) {
          this.loginModal.classList.add('active');
        }
      });
    }

    // Cerrar modal de login
    if (this.closeLoginModal) {
      this.addEventListener(this.closeLoginModal, 'click', () => {
        if (this.loginModal) {
          this.loginModal.classList.remove('active');
        }
      });
    }
    
    // Cerrar modal al hacer clic fuera
    if (this.loginModal) {
      this.addEventListener(this.loginModal, 'click', (e) => {
        if (e.target === this.loginModal) {
          this.loginModal.classList.remove('active');
        }
      });
    }

    // Cerrar modal al hacer clic fuera
    if (this.loginModal) {
      this.addEventListener(this.loginModal, 'click', (e) => {
        if (e.target === this.loginModal) {
          this.loginModal.classList.remove('active');
        }
      });
    }

    // Toggle password visibility
    if (this.toggleLoginPassword) {
      const passwordInput = this.querySelector('#password');
      if (passwordInput) {
        this.addEventListener(this.toggleLoginPassword, 'click', () => {
          const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
          passwordInput.setAttribute('type', type);
          
          const icon = this.toggleLoginPassword.querySelector('i');
          if (icon) {
            if (type === 'text') {
              icon.classList.remove('fa-eye');
              icon.classList.add('fa-eye-slash');
              this.toggleLoginPassword.setAttribute('aria-label', 'Ocultar contraseña');
            } else {
              icon.classList.remove('fa-eye-slash');
              icon.classList.add('fa-eye');
              this.toggleLoginPassword.setAttribute('aria-label', 'Mostrar contraseña');
            }
          }
        });
      }
    }

    // Cerrar notificación de email no verificado
    if (this.closeEmailNotification) {
      this.addEventListener(this.closeEmailNotification, 'click', () => {
        this.hideEmailNotVerifiedNotification();
      });
    }
    
    // Cerrar notificación de usuario no aprobado
    const closeUserNotification = this.querySelector('#closeUserNotification');
    if (closeUserNotification) {
      this.addEventListener(closeUserNotification, 'click', () => {
        this.hideUserNotApprovedNotification();
      });
    }
    
    // Cerrar notificaciones al hacer clic fuera
    const emailNotification = this.querySelector('#emailNotVerifiedNotification');
    if (emailNotification) {
      this.addEventListener(emailNotification, 'click', (e) => {
        if (e.target === emailNotification) {
          this.hideEmailNotVerifiedNotification();
        }
      });
    }
    
    const userNotification = this.querySelector('#userNotApprovedNotification');
    if (userNotification) {
      this.addEventListener(userNotification, 'click', (e) => {
        if (e.target === userNotification) {
          this.hideUserNotApprovedNotification();
        }
      });
    }

    // Manejar envío del formulario de login
    if (this.loginForm) {
      this.addEventListener(this.loginForm, 'submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    // Cerrar modales con ESC
    this.addEventListener(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.loginModal && this.loginModal.classList.contains('active')) {
          this.loginModal.classList.remove('active');
        }
      }
    });
  }

  /**
   * Manejar login
   */
  async handleLogin() {
    const emailInput = this.querySelector('#username');
    const passwordInput = this.querySelector('#password');
    
    if (!emailInput || !passwordInput) {
      alert('Error: Campos no encontrados');
      return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;
    
    // Validación básica
    if (!email || !password) {
      alert('Por favor completa todos los campos');
      return;
    }

    // Usar AuthService si está disponible
    if (window.authService) {
      const result = await window.authService.login(email, password);
      
      if (result.success) {
        // Verificar si hay error de email no verificado
        if (result.error === 'EMAIL_NOT_VERIFIED') {
          this.showEmailNotVerifiedNotification();
          if (this.loginModal) this.loginModal.classList.remove('active');
          return;
        }
        
        // Redirigir según el resultado
        if (window.router) {
          window.router.navigate(result.redirectRoute || '/products');
        } else {
          window.location.href = '/products.html';
        }
      } else {
        alert(result.error || 'Error al iniciar sesión');
      }
      return;
    }

    // Fallback: lógica antigua (mantener compatibilidad)
    const supabase = await this.getSupabaseClient();
    if (!supabase) {
      alert('Error: No se puede conectar con el servidor');
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password
      });

      if (authError) {
        alert(authError.message || 'Error al iniciar sesión');
        return;
      }

      if (!authData.user) {
        alert('Error al iniciar sesión');
        return;
      }

      // Guardar sesión usando sessionManager
      const userData = {
        id: authData.user.id,
        userId: authData.user.id,
        email: authData.user.email,
        full_name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0],
        email_verified: authData.user.email_confirmed_at ? true : false
      };
      this.saveUserSession(userData, false);

      // Redirigir
      if (window.router) {
        window.router.navigate('/products');
      } else {
        window.location.href = '/products.html';
      }
    } catch (error) {
      console.error('Error en login:', error);
      alert('Error al iniciar sesión: ' + (error.message || 'Error desconocido'));
    }
  }

  /**
   * Verificar si hay un usuario pendiente (sin redirigir automáticamente)
   * Este método ya no redirige, solo verifica el estado del usuario
   */
  async checkPendingUser() {
    const session = this.getUserSession();
    if (!session) return null;

    const userStatus = await this.checkUserStatus(session.userId);
    if (!userStatus) {
      // Si no se puede verificar, limpiar sesión
      this.clearUserSession();
      return null;
    }

    // Retornar el estado sin redirigir
    return userStatus;
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    // Usar SupabaseService si está disponible
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    
    // Fallback a app-loader
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch (error) {
        console.error('Error obteniendo Supabase:', error);
        return null;
      }
    }
    
    return window.supabase || null;
  }

  /**
   * Obtener sesión de usuario
   */
  getUserSession() {
    if (typeof window.sessionManager !== 'undefined') {
      return window.sessionManager.getSession();
    }
    // Fallback local
    const sessionData = localStorage.getItem('user_session');
    if (sessionData) {
      try {
        return JSON.parse(sessionData);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Guardar sesión de usuario
   */
  saveUserSession(userData, rememberMe) {
    if (typeof window.sessionManager !== 'undefined') {
      window.sessionManager.saveSession(userData, rememberMe);
      return;
    }
    // Fallback local
    const session = {
      userId: userData.id || userData.userId,
      email: userData.email,
      full_name: userData.full_name,
      role: userData.role,
      email_verified: userData.email_verified
    };
    
    if (rememberMe) {
      localStorage.setItem('user_session', JSON.stringify(session));
    } else {
      sessionStorage.setItem('user_session', JSON.stringify(session));
    }
  }

  /**
   * Limpiar sesión de usuario
   */
  clearUserSession() {
    if (typeof window.sessionManager !== 'undefined') {
      window.sessionManager.clearSession();
      return;
    }
    // Fallback local
    localStorage.removeItem('user_session');
    sessionStorage.removeItem('user_session');
  }

  /**
   * Verificar estado del usuario
   */
  async checkUserStatus(userId) {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return null;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('id', userId)
        .single();
      
      if (error || !data) {
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error al verificar estado:', error);
      return null;
    }
  }

  /**
   * Mostrar notificación de email no verificado
   */
  /**
   * Mostrar notificación de email no verificado
   */
  showEmailNotVerifiedNotification() {
    const emailNotification = this.querySelector('#emailNotVerifiedNotification');
    if (emailNotification) {
      emailNotification.classList.add('active');
    }
  }

  /**
   * Mostrar notificación de usuario no aprobado
   */
  showUserNotApprovedNotification() {
    const userNotification = this.querySelector('#userNotApprovedNotification');
    if (userNotification) {
      userNotification.classList.add('active');
    }
  }

  /**
   * Ocultar notificación de email no verificado
   */
  hideEmailNotVerifiedNotification() {
    const notification = this.querySelector('#emailNotVerifiedNotification');
    if (notification) {
      notification.classList.remove('active');
    }
  }
  
  /**
   * Ocultar notificación de usuario no aprobado
   */
  hideUserNotApprovedNotification() {
    const notification = this.querySelector('#userNotApprovedNotification');
    if (notification) {
      notification.classList.remove('active');
    }
  }

  /**
   * Mostrar notificación de usuario no aprobado
   */
  showUserNotApprovedNotification() {
    alert('Tu cuenta está pendiente de aprobación. Por favor, contacta al administrador.');
  }
}

// Hacer disponible globalmente
window.LandingView = LandingView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandingView;
}

