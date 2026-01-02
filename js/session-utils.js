// Utilidades para manejo de sesión del usuario
// Funciones compartidas entre landing y app

class SessionManager {
  constructor() {
    this.sessionKey = 'user_session';
    this.pendingApprovalKey = 'pending_approval';
  }

  // Obtener sesión del usuario
  getSession() {
    // Intentar desde localStorage primero
    let sessionData = localStorage.getItem(this.sessionKey);
    
    // Si no existe, intentar desde sessionStorage
    if (!sessionData) {
      sessionData = sessionStorage.getItem(this.sessionKey);
    }

    if (sessionData) {
      try {
        return JSON.parse(sessionData);
      } catch (e) {
        console.error('Error al parsear sesión:', e);
        this.clearSession();
        return null;
      }
    }

    return null;
  }

  // Guardar sesión
  saveSession(userData, rememberMe = false) {
    const session = {
      userId: userData.id || userData.userId,
      email: userData.email,
      full_name: userData.full_name,
      email_verified: userData.email_verified,
      timestamp: Date.now()
    };

    if (rememberMe) {
      localStorage.setItem(this.sessionKey, JSON.stringify(session));
    } else {
      sessionStorage.setItem(this.sessionKey, JSON.stringify(session));
    }
  }

  // Limpiar sesión
  clearSession() {
    localStorage.removeItem(this.sessionKey);
    sessionStorage.removeItem(this.sessionKey);
    localStorage.removeItem(this.pendingApprovalKey);
  }

  // Verificar si el usuario tiene permisos (siempre true, acceso libre)
  hasPermission(allowedRoles = null) {
    const session = this.getSession();
    return session !== null;
  }


  // Verificar estado del usuario usando Supabase
  async checkUserStatus() {
    const session = this.getSession();
    
    if (!session || !session.userId) {
      console.warn('checkUserStatus: No hay sesión o userId');
      return null;
    }

    try {
      // Usar SupabaseService si está disponible
      let supabaseClient = null;
      
      if (window.supabaseService) {
        supabaseClient = await window.supabaseService.getClient();
      } else if (window.appLoader && window.appLoader.waitFor) {
        supabaseClient = await window.appLoader.waitFor();
      } else if (window.supabase && typeof window.supabase.from === 'function') {
        supabaseClient = window.supabase;
      }

      if (!supabaseClient || !supabaseClient.from) {
        console.error('checkUserStatus: Cliente de Supabase no disponible');
        return null;
      }

      // Consultar user_profiles directamente
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('id, email, phone_number, email_verified')
        .eq('id', session.userId)
        .single();

      if (error) {
        console.error('checkUserStatus: Error de Supabase:', error);
        // Si el error es que no se encontró el registro, retornar null
        if (error.code === 'PGRST116') {
          return null;
        }
        // Para otros errores, también retornar null
        return null;
      }

      if (!data) {
        console.warn('checkUserStatus: No se encontró data del usuario');
        return null;
      }

      console.log('checkUserStatus: Usuario encontrado:', { role: data.role, is_active: data.is_active });
      return data;
    } catch (error) {
      console.error('checkUserStatus: Error exception:', error);
      return null;
    }
  }

  // Redirigir si no tiene permisos
  redirectIfUnauthorized(allowedRoles = null, redirectTo = '/') {
    if (!this.hasPermission(allowedRoles)) {
      // Usar router si está disponible
      if (window.router) {
        window.router.navigate(redirectTo, true);
      } else {
        window.location.href = redirectTo;
      }
      return true;
    }
    return false;
  }
}

// Exportar instancia global
if (typeof window !== 'undefined') {
  window.sessionManager = new SessionManager();
}

