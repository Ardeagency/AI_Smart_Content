/**
 * AuthService - Servicio centralizado de autenticación
 * Maneja login, logout, verificación de sesión y redirecciones
 * 
 * Soporta arquitectura MPA + SPA:
 * - Modo 'user': Usuario SaaS consumidor → SPA operativa
 * - Modo 'developer': Desarrollador PaaS → Portal de desarrollo
 */
class AuthService {
  constructor() {
    this.currentUser = null;
    this.isAuth = false;
    this.supabase = null;
    this.listeners = [];
    this.userMode = 'user';
    this._sessionCheckedAt = 0;
    this._userDataLoadedAt = 0;
    this._SESSION_TTL = 30000;
    this._USERDATA_TTL = 60000;
    this._checkingSession = null;
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
        const client = await window.appLoader.waitFor();
        return client || null;
      } catch (error) {
        // Timeout o fallo de carga: no duplicar mensaje (app-loader ya avisa); el app sigue sin Supabase
        if (error?.message !== 'Timeout esperando Supabase') {
          console.error('Error obteniendo Supabase:', error);
        }
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
    const now = Date.now();
    if (this.isAuth && this.currentUser && (now - this._sessionCheckedAt) < this._SESSION_TTL) {
      return true;
    }

    if (this._checkingSession) return this._checkingSession;

    this._checkingSession = this._doCheckSession(now);
    try {
      return await this._checkingSession;
    } finally {
      this._checkingSession = null;
    }
  }

  async _doCheckSession(now) {
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
        this._sessionCheckedAt = now;
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
   * Incluye default_view_mode para determinar flujo MPA/SPA
   */
  async loadUserData(userId) {
    if (!this.supabase || !userId) return;

    const now = Date.now();
    if (this.currentUser && this.currentUser.id === userId && (now - this._userDataLoadedAt) < this._USERDATA_TTL) {
      return;
    }

    try {
      const { data: profile, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profile && !error) {
        this.currentUser = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role || 'user',
          // Campos para arquitectura MPA + SPA
          default_view_mode: profile.default_view_mode || 'user', // 'user' | 'developer'
          is_developer: !!profile.is_developer,
          dev_role: profile.dev_role || 'contributor', // 'contributor' | 'lead'
          dev_rank: profile.dev_rank || 'novice'
        };

        this.userMode = this.currentUser.default_view_mode;
        this._userDataLoadedAt = Date.now();
        localStorage.setItem('userViewMode', this.userMode);

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
            role: 'user',
            default_view_mode: 'user'
          };
          this.userMode = 'user';
          localStorage.setItem('userViewMode', 'user');
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
   * Determinar ruta de redirección para usuario autenticado.
   * Según modo: developer → /dev/dashboard, user → primera organización (Production) o /settings.
   */
  async determineRedirectRoute(userId) {
    if (!userId) return '/settings';

    try {
      const viewMode = this.userMode || localStorage.getItem('userViewMode') || 'user';
      if (viewMode === 'developer') {
        return '/dev/dashboard';
      }
      return await this.getDefaultUserRoute(userId);
    } catch (error) {
      console.error('Error determinando ruta:', error);
      return '/settings';
    }
  }

  /**
   * Obtener ruta por defecto para usuario consumidor: primera org (Production) o /settings si no tiene org.
   * @param {string} userId - ID del usuario
   * @returns {Promise<string>} /org/:id/production o /settings
   */
  async getDefaultUserRoute(userId) {
    if (!this.supabase || !userId) return '/settings';
    try {
      const selectedId = localStorage.getItem('selectedOrganizationId') || window.appState?.get?.('selectedOrganizationId');
      const [membersRes, ownedRes] = await Promise.all([
        this.supabase.from('organization_members').select('organization_id, organizations(id, name)').eq('user_id', userId),
        this.supabase.from('organizations').select('id, name').eq('owner_user_id', userId)
      ]);
      const list = [];
      (membersRes.data || []).forEach((m) => {
        const o = m.organizations;
        const id = o?.id ?? m.organization_id;
        if (id) list.push({ id, name: (o && o.name) || '' });
      });
      (ownedRes.data || []).forEach((o) => {
        if (o?.id && !list.some((x) => x.id === o.id)) list.push({ id: o.id, name: o.name || '' });
      });
      if (list.length === 0) return '/settings';
      const org = selectedId ? list.find((x) => x.id === selectedId) || list[0] : list[0];
      if (typeof window.getOrgPathPrefix === 'function') {
        const prefix = window.getOrgPathPrefix(org.id, org.name);
        return prefix ? `${prefix}/production` : '/settings';
      }
      return `/org/${org.id}/production`;
    } catch (e) {
      console.warn('getDefaultUserRoute:', e);
      return '/settings';
    }
  }

  /**
   * Obtener el modo de vista actual del usuario
   * @returns {'user' | 'developer'}
   */
  getUserMode() {
    return this.userMode || localStorage.getItem('userViewMode') || 'user';
  }

  /**
   * Cambiar el modo de vista del usuario
   * @param {'user' | 'developer'} mode - Nuevo modo
   * @param {boolean} persist - Si debe guardarse en la base de datos
   */
  async setUserMode(mode, persist = false) {
    if (mode !== 'user' && mode !== 'developer') {
      console.error('Modo inválido:', mode);
      return;
    }

    this.userMode = mode;
    localStorage.setItem('userViewMode', mode);

    if (this.currentUser) {
      this.currentUser.default_view_mode = mode;
    }

    // Persistir en la base de datos si se solicita
    if (persist && this.supabase && this.currentUser?.id) {
      try {
        await this.supabase
          .from('profiles')
          .update({ default_view_mode: mode })
          .eq('id', this.currentUser.id);
      } catch (error) {
        console.error('Error actualizando modo de vista:', error);
      }
    }

    // Notificar listeners del cambio de modo
    this.notifyListeners('mode_changed', { mode });
  }

  /**
   * Verificar si el usuario actual está viendo en modo desarrollador
   * @returns {boolean}
   */
  isDeveloper() {
    return this.getUserMode() === 'developer';
  }

  /**
   * Verificar si la cuenta del usuario tiene rol de desarrollador (profiles.is_developer)
   * @returns {boolean}
   */
  userHasDeveloperRole() {
    return this.currentUser?.is_developer === true;
  }

  /**
   * Verificar si el usuario es desarrollador Lead (control total de BD y sección Equipo/Categorías/etc.)
   * Solo dev_role === 'lead' tiene acceso a /dev/lead/*
   * @returns {boolean}
   */
  isLead() {
    return this.currentUser?.dev_role === 'lead';
  }

  /**
   * Verificar si se debe mostrar el switcher Consumidor/Desarrollador en el dropdown.
   * Se muestra si is_developer = true O si default_view_mode = 'developer' (tiene acceso a vista desarrollador).
   * @returns {boolean}
   */
  shouldShowDeveloperSwitcher() {
    const u = this.currentUser;
    if (!u) return false;
    return u.is_developer === true || u.default_view_mode === 'developer';
  }

  /**
   * Verificar si el usuario está en una ruta de desarrollador
   * @returns {boolean}
   */
  isInDevRoute() {
    const currentPath = window.location.pathname || '/';
    return currentPath.startsWith('/dev');
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
  async socialLogin(provider, oauthOptions = {}) {
    if (!this.supabase) {
      this.supabase = await this.getSupabaseClient();
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase no está disponible' };
    }

    try {
      const providerName = String(provider || '').toLowerCase().trim();
      const options = {
        // Default: vuelve al home para que el router aplique redirectIfAuth.
        redirectTo: oauthOptions.redirectTo || `${window.location.origin}/`
      };

      // Facebook normalmente requiere solicitar email de forma explícita.
      if (providerName === 'facebook') {
        options.scopes = oauthOptions.scopes || 'email public_profile';
      } else if (oauthOptions.scopes) {
        options.scopes = oauthOptions.scopes;
      }

      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: providerName,
        options
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
        redirectTo: 'https://aismartcontent.io/cambiar-contrasena'
      });

      if (error) {
        const msg = error.message || '';
        const isServerError = (error.status === 500) || /500|internal server error/i.test(msg);
        if (isServerError) {
          return {
            success: false,
            error: 'Error del servidor. Añade esta URL en Supabase (Authentication → URL Configuration → Redirect URLs): https://aismartcontent.io/cambiar-contrasena'
          };
        }
        return { success: false, error: msg };
      }

      return { success: true };
    } catch (err) {
      console.error('Error en reset password:', err);
      const is500 = (err?.status === 500) || (err?.message && String(err.message).includes('500'));
      if (is500) {
        return {
          success: false,
          error: 'Error del servidor. Añade esta URL en Supabase (Authentication → URL Configuration → Redirect URLs): https://aismartcontent.io/cambiar-contrasena'
        };
      }
      return { success: false, error: err?.message || 'Error al enviar el correo. Intenta de nuevo.' };
    }
  }
}

// Crear instancia global
window.authService = new AuthService();

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthService;
}
