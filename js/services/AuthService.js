/**
 * AuthService - Servicio centralizado de autenticación
 * Maneja login, logout, verificación de sesión y redirecciones
 * 
 * Soporta arquitectura MPA + SPA:
 * Un solo modo: la consola es del cliente. El panel de staff vive en AISC-Admin.
 */
class AuthService {
  constructor() {
    this.currentUser = null;
    this.isAuth = false;
    this.supabase = null;
    this.listeners = [];
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
      const estaba = this.isAuth;
      this.isAuth = false;
      this.currentUser = null;
      this.notifyListeners('signed_out', null);
      // La sesión se cerró SIN pasar por logout() (caducó, se revocó o se cerró en
      // otra pestaña): llevar a /login con el motivo y el destino, no dejar la vista rota.
      if (estaba && !this._saliendo && window.router?.irALogin) window.router.irALogin('sesion');
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
      // SaaS cerrado (L1, 24/09): una sesión anónima (el viejo /demo) no entra.
      if (user && !error && user.is_anonymous) {
        await this.supabase.auth.signOut().catch(() => {});
        this.isAuth = false;
        return false;
      }
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

      // Anonymous flag viene del JWT, no de profiles. Capturarlo aquí para que
      // DemoGuard pueda detectar sesiones del preview público sin queries extra.
      let isAnonymous = false;
      try {
        const { data: { user: authUser } } = await this.supabase.auth.getUser();
        isAnonymous = !!(authUser && authUser.is_anonymous);
      } catch (_) { /* keep false */ }

      if (profile && !error) {
        this.currentUser = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role || 'user',
          is_anonymous: isAnonymous,
          locale: profile.locale || 'es' // idioma preferido del usuario (i18n)
        };

        this._userDataLoadedAt = Date.now();

        // i18n: aplicar el idioma del perfil (respeta la eleccion local si existe).
        if (window.i18n && typeof window.i18n.applyUserLocale === 'function') {
          window.i18n.applyUserLocale(this.currentUser.locale);
        }

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
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Demo visitor',
            email_verified: user.email_confirmed_at ? true : false,
            is_anonymous: !!user.is_anonymous,
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
  /** `opciones.captchaToken` (Turnstile) viaja a GoTrue cuando la consola lo tiene; sin él, el camino de hoy. */
  async login(email, password, opciones = {}) {
    if (!this.supabase) {
      this.supabase = await this.getSupabaseClient();
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase no está disponible' };
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password,
        ...(opciones.captchaToken ? { options: { captchaToken: opciones.captchaToken } } : {}),
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

      // ── FEAT-020 · MFA check ────────────────────────────────────
      // Si el user tiene un factor TOTP verificado, exige challenge antes de
      // redirigir. SignInView muestra el step de código y llama verifyMfa().
      try {
        const { data: aal } = await this.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal && aal.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
          const { data: factors } = await this.supabase.auth.mfa.listFactors();
          const verifiedTotp = (factors?.totp || []).filter((f) => f.status === 'verified');
          if (verifiedTotp.length > 0) {
            return {
              success:     false,
              requiresMfa: true,
              factorId:    verifiedTotp[0].id,
              factorName:  verifiedTotp[0].friendly_name || 'Authenticator',
              userId:      data.user.id,
            };
          }
        }
      } catch (mfaErr) {
        console.warn('AuthService.login MFA check skipped:', mfaErr.message);
      }

      // ── FEAT-020 · enforce-per-org check ─────────────────────────
      // Si alguna de las orgs del user tiene mfa_required=true y el user no
      // tiene factor verificado, no completamos el login: redirigimos al tab
      // Seguridad de OrganizationView para enroll forzado.
      try {
        // Base nueva (ADR-0052): la exigencia viene por marca en mi_contexto()
        // (organizations.mfa_required); el estado del factor lo da el cliente.
        const ctx = await window.contextoService.cargar({ fresco: true });
        const exige = (ctx?.organizations || []).find((o) => o.mfa_required);
        if (exige) {
          const { data: factors } = await this.supabase.auth.mfa.listFactors();
          const verificado = (factors?.totp || []).some((f) => f.status === 'verified');
          if (!verificado) {
            return {
              success:           false,
              requiresMfaEnroll: true,
              enforceOrgId:      exige.id,
              message:           'Tu organización requiere activar 2FA. Te llevamos al flujo de activación.',
            };
          }
        }
      } catch (enfErr) {
        console.warn('AuthService.login enforce check skipped:', enfErr.message);
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
   * FEAT-020 · Verifica un código TOTP de 6 dígitos para upgrade aal1 → aal2.
   * Llamar después de que login() devolviera { requiresMfa: true }.
   * @returns { success, redirectRoute } | { success: false, error }
   */
  async verifyMfa(factorId, code) {
    if (!this.supabase) this.supabase = await this.getSupabaseClient();
    if (!this.supabase) return { success: false, error: 'Supabase no está disponible' };

    if (!factorId || !/^[0-9]{6}$/.test(String(code || '').trim())) {
      return { success: false, error: 'Código inválido (deben ser 6 dígitos).' };
    }

    try {
      const { data: chal, error: chalErr } = await this.supabase.auth.mfa.challenge({ factorId });
      if (chalErr) return { success: false, error: chalErr.message };

      const { error: verErr } = await this.supabase.auth.mfa.verify({
        factorId,
        challengeId: chal.id,
        code: String(code).trim(),
      });
      if (verErr) return { success: false, error: verErr.message };

      // Sesión upgradeada a aal2 — refrescamos datos de user y resolvemos redirect
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user) await this.loadUserData(user.id);
      const redirectRoute = user ? await this.determineRedirectRoute(user.id) : '/';
      return { success: true, user: this.currentUser, redirectRoute };
    } catch (e) {
      console.error('AuthService.verifyMfa:', e);
      return { success: false, error: e.message || 'Error verificando código.' };
    }
  }

  /**
   * FEAT-020 · Magic link — envía email con link de acceso (sin password).
   */
  async sendMagicLink(email) {
    if (!this.supabase) this.supabase = await this.getSupabaseClient();
    if (!this.supabase) return { success: false, error: 'Supabase no está disponible' };
    try {
      const { error } = await this.supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e) {
      console.error('AuthService.sendMagicLink:', e);
      return { success: false, error: e.message || 'Error enviando link.' };
    }
  }

  /**
   * Logout
   */
  async logout() {
    // Salida PEDIDA: SIGNED_OUT no debe tratarla como sesión caducada.
    this._saliendo = true;
    if (this.supabase) {
      try {
        await this.supabase.auth.signOut();
      } catch (error) {
        console.error('Error en logout:', error);
      }
    }
    this._saliendo = false;

    this.isAuth = false;
    this.currentUser = null;
    this.clearMembershipCache();

    // Invalidar caché de orgs del resolver para que el próximo usuario no vea las orgs del anterior
    if (typeof window.clearOrgResolverCache === 'function') {
      window.clearOrgResolverCache();
    }

    // Limpiar sesión local
    if (window.sessionManager) {
      window.sessionManager.clearSession();
    } else {
      localStorage.removeItem('user_session');
      sessionStorage.removeItem('user_session');
    }

    // Notificar listeners
    this.notifyListeners('signed_out', null);

    // Tras cerrar sesión devolvemos al usuario a la landing oficial
    // (https://aismartcontent.io). El acceso al login vive en la landing como
    // "Acceder" → console.aismartcontent.io/login.
    window.location.href = 'https://aismartcontent.io';
  }

  /**
   * Determinar ruta de redirección para usuario autenticado: su primera organización o /creation_process.
   */
  async determineRedirectRoute(userId) {
    if (!userId) return '/creation_process';

    try {
      return await this.getDefaultUserRoute(userId);
    } catch (error) {
      console.error('Error determinando ruta:', error);
      return '/creation_process';
    }
  }

  /**
   * Obtener ruta por defecto para usuario consumidor: primera org (Dashboard)
   * o /creation_process si todavía no tiene org/role/workspace asignado.
   * @param {string} userId - ID del usuario
   * @returns {Promise<string>} /org/:id/dashboard o /creation_process
   */
  async getDefaultUserRoute(userId) {
    if (!this.supabase || !userId) return '/creation_process';
    try {
      const selectedId = localStorage.getItem('selectedOrganizationId') || window.appState?.get?.('selectedOrganizationId');
      // Base nueva (ADR-0052): mis marcas vienen de mi_contexto(), no de organization_members.
      const list = await window.contextoService.orgs();
      if (list.length === 0) return '/creation_process';
      const org = selectedId ? list.find((x) => x.id === selectedId) || list[0] : list[0];
      // Corte: mientras el Tablero esté «en obras» (dashboard_* de v1 sin equivalente),
      // la persona entra por su MARCA: es lo primero que JC pidió ver funcionando.
      const destino = (window.EnObras && window.EnObras.es('/dashboard')) ? 'brand' : 'dashboard';
      if (typeof window.getOrgPathPrefix === 'function') {
        const prefix = window.getOrgPathPrefix(org.id, org.name);
        return prefix ? `${prefix}/${destino}` : '/creation_process';
      }
      return `/org/${org.id}/${destino}`;
    } catch (e) {
      console.warn('getDefaultUserRoute:', e);
      return '/creation_process';
    }
  }

  /**
   * Guardar el idioma preferido del usuario (i18n).
   * Memoria + persistencia opcional en perfil.
   * El servicio window.i18n ya maneja localStorage y el repintado; aqui solo
   * persistimos en profiles.locale para que cruce dispositivos.
   * @param {string} locale - 'es' | 'en' | ...
   * @param {boolean} persist - Si debe guardarse en la base de datos (default true)
   */
  async setUserLocale(locale, persist = true) {
    if (this.currentUser) {
      this.currentUser.locale = locale;
    }
    // ADR-0040: el idioma se guarda SOLO por public.guardar_preferencias (valida y
    // escribe la fila propia), nunca con un update directo a profiles.
    if (persist && this.supabase && this.currentUser?.id) {
      const { error } = await this.supabase.rpc('guardar_preferencias', { p_locale: locale });
      if (error) console.warn('[auth] guardar_preferencias:', error.code, error.message);
    }
  }

  /**
   * Capabilities por organización.
   *
   * - Owner bypass: el dueño (organizations.owner_user_id) siempre tiene todas las caps.
   * - Caso general: lee organization_members.{role,permissions} del usuario en la org activa.
   *
   * El cache vive en this._membershipCache (key=orgId, value={role,permissions,ts}).
   * Si no hay membership cargada para la org activa, hasPermission() retorna false
   * en lugar de bloquear; el caller decide si necesita pedir loadMembership() antes.
   */
  async loadMembership(orgId) {
    if (!orgId || !this.currentUser?.id) return null;
    if (!this.supabase) this.supabase = await this.getSupabaseClient();
    if (!this.supabase) return null;

    this._membershipCache = this._membershipCache || new Map();
    const now = Date.now();
    const cached = this._membershipCache.get(orgId);
    if (cached && (now - cached.ts) < 60_000) return cached;

    // Base nueva (ADR-0052): rol y permisos LITERALES vienen de mi_contexto().
    // El rol solo habilita; el permiso autoriza (ADR-0004). No hay owner bypass en
    // el cliente: si el dueño tiene todo es porque la base se lo dio en permissions.
    await window.contextoService.cargar();
    const o = window.contextoService.org(orgId);
    const role = o?.role || null;
    const permissions = window.contextoService.capacidadesV1(orgId) || {};
    const isOwner = role === 'owner';

    const entry = { role, permissions, permisos: o?.permissions || [], isOwner, ts: now };
    this._membershipCache.set(orgId, entry);
    return entry;
  }

  /** Limpia el cache de memberships (login/logout/cambio de org). */
  clearMembershipCache(orgId) {
    if (window.contextoService && !orgId) window.contextoService.limpiar();
    if (!this._membershipCache) return;
    if (orgId) this._membershipCache.delete(orgId);
    else this._membershipCache.clear();
  }

  /**
   * Sync check de capability. Devuelve false si la membership aún no se cargó:
   * el caller debe haber llamado a loadMembership(orgId) antes.
   * @param {string} cap - clave de capability (ej 'studio.create')
   * @param {string} [orgId] - orgId; default = window.currentOrgId
   * @returns {boolean}
   */
  hasPermission(cap, orgId) {
    const targetOrg = orgId || window.currentOrgId;
    if (!targetOrg || !this._membershipCache) return false;
    const entry = this._membershipCache.get(targetOrg);
    if (!entry) return false;
    // Permiso literal de v2 (p. ej. 'producir_contenido') o capability de v1 ('studio.create').
    if (Array.isArray(entry.permisos) && entry.permisos.includes(cap)) return true;
    return entry.permissions?.[cap] === true;
  }

  /** Rol del usuario en la org activa (o la indicada). */
  getOrgRole(orgId) {
    const targetOrg = orgId || window.currentOrgId;
    if (!targetOrg || !this._membershipCache) return null;
    return this._membershipCache.get(targetOrg)?.role || null;
  }

  /** Map de capabilities efectivas del usuario en la org activa. */
  getCapabilities(orgId) {
    const targetOrg = orgId || window.currentOrgId;
    if (!targetOrg || !this._membershipCache) return null;
    const entry = this._membershipCache.get(targetOrg);
    if (!entry) return null;
    return entry.permissions;
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
   * Notificar a los listeners (internos + ventana global vía CustomEvent).
   * El evento `auth:<event>` permite que módulos no-AuthService (apiClient,
   * ErrorLogger, analytics) reaccionen sin acoplarse al constructor.
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error en listener de auth:', error);
      }
    });
    try {
      window.dispatchEvent(new CustomEvent(`auth:${event}`, { detail: data }));
    } catch (_) { /* CustomEvent puede fallar en navegadores muy viejos */ }
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
  async resetPassword(email, opciones = {}) {
    if (!this.supabase) {
      this.supabase = await this.getSupabaseClient();
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase no está disponible' };
    }

    // /cambiar-contrasena es ruta de la app (console), no de la landing.
    // Usamos el origin actual para que el flujo funcione tanto en producción
    // (console.aismartcontent.io) como en deploy previews de Netlify.
    const redirectTo = `${window.location.origin}/cambiar-contrasena`;

    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
        ...(opciones.captchaToken ? { captchaToken: opciones.captchaToken } : {}),
      });

      if (error) {
        const msg = error.message || '';
        const isServerError = (error.status === 500) || /500|internal server error/i.test(msg);
        if (isServerError) {
          return {
            success: false,
            error: `Error del servidor. Añade esta URL en Supabase (Authentication → URL Configuration → Redirect URLs): ${redirectTo}`
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
          error: `Error del servidor. Añade esta URL en Supabase (Authentication → URL Configuration → Redirect URLs): ${redirectTo}`
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
