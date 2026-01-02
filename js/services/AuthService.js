/**
 * AuthService - Servicio centralizado de autenticación
 * Maneja login, logout, verificación de sesión y redirecciones
 */
class AuthService {
  constructor() {
    this.currentUser = null;
    this.isAuth = false;
    this.supabase = null;
    this.listeners = [];
    this.init();
  }

  /**
   * Inicializar el servicio
   */
  async init() {
    // Esperar a que Supabase esté listo
    this.supabase = await this.getSupabaseClient();
    
    // Verificar sesión existente
    await this.checkSession();
    
    // Escuchar cambios de autenticación
    if (this.supabase) {
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.handleAuthStateChange(event, session);
      });
    }
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch (error) {
        console.error('Error obteniendo Supabase:', error);
        return null;
      }
    }
    
    if (window.supabase) {
      return window.supabase;
    }
    
    return null;
  }

  /**
   * Manejar cambios de estado de autenticación
   */
  async handleAuthStateChange(event, session) {
    if (event === 'SIGNED_IN' && session) {
      this.isAuth = true;
      await this.loadUserData(session.user.id);
      this.notifyListeners('signed_in', this.currentUser);
    } else if (event === 'SIGNED_OUT') {
      this.isAuth = false;
      this.currentUser = null;
      this.notifyListeners('signed_out', null);
    } else if (event === 'TOKEN_REFRESHED' && session) {
      await this.loadUserData(session.user.id);
    }
  }

  /**
   * Verificar sesión actual
   */
  async checkSession() {
    if (!this.supabase) {
      this.supabase = await this.getSupabaseClient();
    }

    if (!this.supabase) {
      this.isAuth = false;
      return false;
    }

    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();
      
      if (user && !error) {
        this.isAuth = true;
        await this.loadUserData(user.id);
        return true;
      }
    } catch (error) {
      console.error('Error verificando sesión:', error);
    }

    this.isAuth = false;
    return false;
  }

  /**
   * Cargar datos del usuario
   */
  async loadUserData(userId) {
    if (!this.supabase || !userId) return;

    try {
      // Cargar perfil del usuario desde user_profiles
      const { data: profile, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profile && !error) {
        this.currentUser = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          phone_number: profile.phone_number,
          email_verified: profile.email_verified,
          role: profile.role || 'user'
        };

        // Guardar en sessionManager si está disponible
        if (window.sessionManager) {
          window.sessionManager.saveSession(this.currentUser, false);
        }
      } else {
        // Si no hay perfil, crear uno básico desde auth
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) {
          this.currentUser = {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
            email_verified: user.email_confirmed_at ? true : false,
            role: 'user'
          };
        }
      }
    } catch (error) {
      console.error('Error cargando datos de usuario:', error);
    }
  }

  /**
   * Login con email y contraseña
   */
  async login(email, password) {
    if (!this.supabase) {
      this.supabase = await this.getSupabaseClient();
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase no está disponible' };
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Error al iniciar sesión' };
      }

      // Cargar datos del usuario
      await this.loadUserData(data.user.id);

      // Verificar si el email está verificado
      const emailNotVerified = !this.currentUser.email_verified && !data.user.email_confirmed_at;
      if (emailNotVerified) {
        await this.logout();
        return { 
          success: false, 
          error: 'EMAIL_NOT_VERIFIED',
          message: 'Por favor verifica tu email antes de iniciar sesión'
        };
      }

      // Determinar ruta de redirección
      const redirectRoute = await this.determineRedirectRoute(data.user.id);

      return {
        success: true,
        user: this.currentUser,
        redirectRoute: redirectRoute
      };
    } catch (error) {
      console.error('Error en login:', error);
      return { success: false, error: 'Error al iniciar sesión' };
    }
  }

  /**
   * Logout
   */
  async logout() {
    if (this.supabase) {
      try {
        await this.supabase.auth.signOut();
      } catch (error) {
        console.error('Error en logout:', error);
      }
    }

    this.isAuth = false;
    this.currentUser = null;

    // Limpiar sesión local
    if (window.sessionManager) {
      window.sessionManager.clearSession();
    } else {
      localStorage.removeItem('user_session');
      sessionStorage.removeItem('user_session');
    }

    // Notificar listeners
    this.notifyListeners('signed_out', null);

    // Redirigir al login usando router
    if (window.router) {
      window.router.navigate('/login', true);
    } else {
      window.location.href = '/login.html';
    }
  }

  /**
   * Determinar ruta de redirección basado en el estado del usuario
   */
  async determineRedirectRoute(userId) {
    if (!this.supabase || !userId) return '/form-record';

    try {
      // Verificar si completó el formulario
      const { data: userData } = await this.supabase
        .from('users')
        .select('form_verified')
        .eq('id', userId)
        .single();

      if (!userData || userData.form_verified !== true) {
        return '/form-record';
      }

      return '/living';
    } catch (error) {
      console.error('Error determinando ruta:', error);
      return '/form-record';
    }
  }

  /**
   * Verificar si el usuario está autenticado
   */
  async isAuthenticated() {
    if (this.isAuth && this.currentUser) {
      return true;
    }

    // Verificar nuevamente
    return await this.checkSession();
  }

  /**
   * Obtener usuario actual
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Verificar acceso a una ruta
   */
  async checkAccess(requiredAuth = true) {
    if (!requiredAuth) return true;
    
    return await this.isAuthenticated();
  }

  /**
   * Suscribirse a cambios de autenticación
   */
  subscribe(listener) {
    this.listeners.push(listener);
    
    // Retornar función para desuscribirse
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notificar a los listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error en listener de auth:', error);
      }
    });
  }

  /**
   * Login social (OAuth)
   */
  async socialLogin(provider) {
    if (!this.supabase) {
      this.supabase = await this.getSupabaseClient();
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase no está disponible' };
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: `${window.location.origin}/#/living`
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error en social login:', error);
      return { success: false, error: 'Error al iniciar sesión con ' + provider };
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email) {
    if (!this.supabase) {
      this.supabase = await this.getSupabaseClient();
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase no está disponible' };
    }

    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/login`
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error en reset password:', error);
      return { success: false, error: 'Error al enviar el email' };
    }
  }
}

// Crear instancia global
window.authService = new AuthService();

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthService;
}

