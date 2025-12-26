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
      role: userData.role,
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

  // Verificar si el usuario tiene permisos
  hasPermission(allowedRoles = null) {
    const session = this.getSession();
    
    if (!session) {
      return false;
    }

    // Si el role es 'user', no tiene permisos
    if (session.role === 'user') {
      return false;
    }

    // Si se especifican roles, verificar que esté en la lista
    if (allowedRoles && !allowedRoles.includes(session.role)) {
      return false;
    }

    return true;
  }

  // Verificar si el usuario está pendiente de aprobación
  isPendingApproval() {
    const session = this.getSession();
    return session && session.role === 'user';
  }

  // Verificar estado del usuario usando Supabase
  async checkUserStatus() {
    const session = this.getSession();
    
    if (!session || !session.userId) {
      console.warn('checkUserStatus: No hay sesión o userId');
      return null;
    }

    try {
      // Esperar a que Supabase esté disponible
      let supabaseClient = null;
      let attempts = 0;
      const maxAttempts = 50;
      
      while (attempts < maxAttempts) {
        // Verificar si window.supabase existe y tiene los métodos necesarios
        if (typeof window.supabase !== 'undefined' && window.supabase && window.supabase.from && window.supabase.rpc) {
          supabaseClient = window.supabase;
          break;
        } else if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && typeof supabase !== 'undefined') {
          // Crear cliente y guardarlo en window.supabase para reutilización
          try {
            window.supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            if (window.supabase && window.supabase.from && window.supabase.rpc) {
              supabaseClient = window.supabase;
              break;
            }
          } catch (error) {
            console.error('checkUserStatus: Error al crear cliente de Supabase:', error);
          }
        }
        
        // Esperar un poco antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!supabaseClient || !supabaseClient.from) {
        console.error('checkUserStatus: Cliente de Supabase no disponible después de', maxAttempts, 'intentos');
        return null;
      }

      // Consultar user_profiles directamente
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('id, email, phone_number, role, is_active, email_verified')
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
      window.location.href = redirectTo;
      return true;
    }
    return false;
  }
}

// Exportar instancia global
if (typeof window !== 'undefined') {
  window.sessionManager = new SessionManager();
}

