/**
 * Router - Sistema de navegación para SPA
 * 
 * Maneja rutas sin recargar la página usando History API.
 * Siempre crea nuevas instancias de vistas (sin caché) para evitar errores de carga.
 * 
 * @class Router
 * @example
 * // Registrar una ruta
 * window.router.register('/mi-ruta', MiVista, {
 *   requiresAuth: true,
 *   redirectIfAuth: false
 * });
 * 
 * // Navegar a una ruta
 * window.router.navigate('/mi-ruta');
 */
class Router {
  constructor() {
    this.routes = {};
    this.currentView = null;
    this.currentRoute = null;
    this._handlingRoute = false;
    this._pendingRoute = null;
    this.init();
  }

  /**
   * Inicializar el router
   */
  init() {
    // Usar History API en lugar de hash-based routing
    // Escuchar cambios en el historial (botones atrás/adelante)
    window.addEventListener('popstate', () => this.handleRoute());
    // Ruta inicial la dispara app.init() una sola vez para evitar doble render y parpadeo
  }

  /**
   * Registrar una ruta
   * @param {string} path - Ruta (ej: '/', '/login', '/production')
   * @param {Function|Promise} viewLoader - Clase de vista o función que retorna la clase
   * @param {Object} options - Opciones de la ruta
   * @param {boolean} options.requiresAuth - Si requiere autenticación
   * @param {boolean} options.redirectIfAuth - Si redirige si ya está autenticado
   */
  register(path, viewLoader, options = {}) {
    if (!viewLoader) return;
    
    this.routes[path] = {
      viewLoader,
      requiresAuth: options.requiresAuth || false,
      redirectIfAuth: options.redirectIfAuth || false
    };
  }

  /**
   * Navegar a una ruta usando History API
   * @param {string} path - Ruta destino
   * @param {boolean} replace - Si true, reemplaza en historial (no agrega entrada)
   */
  navigate(path, replace = false) {
    // Normalizar path
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // Usar History API - siempre navegar (sin verificación de ruta duplicada)
    if (replace) {
      window.history.replaceState({ path: normalizedPath }, '', normalizedPath);
    } else {
      window.history.pushState({ path: normalizedPath }, '', normalizedPath);
    }
    
    // Manejar ruta inmediatamente
    this.handleRoute();
  }

  /**
   * Manejar cambio de ruta
   */
  async handleRoute() {
    if (this._handlingRoute) {
      this._pendingRoute = window.location.pathname;
      return;
    }
    this._handlingRoute = true;

    try {
      let path = window.location.pathname || '/';
      if (!path.startsWith('/')) path = '/' + path;
      if (path === '' || path === '/index.html') path = '/';
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
      if (path.includes('//')) {
        path = path.replace(/\/\/+/g, (m) => (m.length === 2 ? '/org/' : '/'));
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', path + (window.location.search || ''));
        }
      }

      const orgSettingsMatch = path.match(/^\/org\/[^/]+\/[^/]+\/settings$/);
      if (orgSettingsMatch) {
        const query = window.location.search || '';
        this._handlingRoute = false;
        this.navigate('/home' + query, true);
        return;
      }

      let route = this.routes[path];
      let routeParams = {};

      // Reconocer explícitamente /org/.../tasks y /tasks para evitar que otra ruta genérica coincida antes
      const tasksOrgMatch = path.match(/^\/org\/([^/]+)\/([^/]+)\/tasks(?:\/([^/]+))?$/);
      const tasksRootMatch = path.match(/^\/tasks(?:\/([^/]+))?$/);
      if (!route && (tasksOrgMatch || tasksRootMatch)) {
        if (tasksOrgMatch) {
          routeParams.orgIdShort = tasksOrgMatch[1];
          routeParams.orgNameSlug = tasksOrgMatch[2];
          if (tasksOrgMatch[3]) routeParams.taskId = tasksOrgMatch[3];
          route = this.routes[routeParams.taskId ? '/org/:orgIdShort/:orgNameSlug/tasks/:taskId' : '/org/:orgIdShort/:orgNameSlug/tasks'];
        } else if (tasksRootMatch) {
          if (tasksRootMatch[1]) routeParams.taskId = tasksRootMatch[1];
          route = this.routes[routeParams.taskId ? '/tasks/:taskId' : '/tasks'];
        }
      }

      if (!route) {
        for (const [routePattern, routeConfig] of Object.entries(this.routes)) {
          if (routePattern.includes(':')) {
            const patternRegex = new RegExp('^' + routePattern.replace(/:[^/]+/g, '([^/]+)') + '$');
            const match = path.match(patternRegex);
            if (match) {
              const paramNames = routePattern.match(/:[^/]+/g) || [];
              const paramValues = match.slice(1);
              paramNames.forEach((paramName, index) => {
                routeParams[paramName.replace(':', '')] = paramValues[index];
              });
              route = routeConfig;
              break;
            }
          }
        }
      }

      // Resolver org: /org/:orgIdShort/:orgNameSlug/... → routeParams.orgId (UUID)
      // Asegurar sesión cargada antes de resolver (en refresh getCurrentUser puede ser null aún)
      if (routeParams.orgIdShort && routeParams.orgNameSlug) {
        if (window.authService && typeof window.authService.checkSession === 'function') {
          await window.authService.checkSession();
        }
        if (typeof window.resolveOrgIdFromShortAndSlug === 'function') {
          const resolved = await window.resolveOrgIdFromShortAndSlug(routeParams.orgIdShort, routeParams.orgNameSlug);
          if (resolved) {
            routeParams.orgId = resolved.id;
            window.currentOrgId = resolved.id;
            window.currentOrgSlug = routeParams.orgNameSlug;
            window.currentOrgName = resolved.name || '';
          } else {
            this._handlingRoute = false;
            const isAuth = await this.checkAuthentication();
            if (!isAuth) {
              this.navigate('/login', true);
              return;
            }
            let defaultUrl = '/home';
            if (window.authService && window.authService.getCurrentUser()?.id) {
              defaultUrl = typeof window.authService.getDefaultUserRoute === 'function'
                ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
                : await this._getDefaultUserRouteFallback(window.authService.getCurrentUser().id);
            } else if (window.supabase) {
              const { data: { user } } = await window.supabase.auth.getUser();
              if (user?.id) defaultUrl = await this._getDefaultUserRouteFallback(user.id);
            }
            this.navigate(defaultUrl, true);
            return;
          }
        }
      } else if (routeParams.orgId) {
        window.currentOrgId = routeParams.orgId;
        window.currentOrgSlug = window.currentOrgSlug || '';
        window.currentOrgName = window.currentOrgName || '';
      } else {
        window.currentOrgId = null;
        window.currentOrgSlug = null;
        window.currentOrgName = null;
      }

      // Tema de marca: solo 1 vez al entrar a la org (evita flasheo al navegar entre production, products, etc.)
      if (window.OrgBrandTheme) {
        const appliedId = window._orgBrandThemeAppliedId;
        if (window.currentOrgId) {
          if (appliedId !== window.currentOrgId) {
            window._orgBrandThemeAppliedId = window.currentOrgId;
            window.OrgBrandTheme.applyOrgBrandTheme(window.currentOrgId);
          }
        } else {
          if (appliedId != null) {
            window._orgBrandThemeAppliedId = null;
            window.OrgBrandTheme.clearOrgBrandTheme();
          }
        }
      }

      if (!route) {
        const route404 = this.routes['/404'];
        if (route404) {
          route = route404;
        } else if (this.routes['/']) {
          this._handlingRoute = false;
          this.navigate('/', true);
          return;
        } else {
          return;
        }
      }

      // Single auth check (cached) instead of calling twice
      let isAuth = null;
      if (route.requiresAuth || route.redirectIfAuth) {
        isAuth = await this.checkAuthentication();
      }
      if (route.requiresAuth && !isAuth) {
        this._handlingRoute = false;
        this.navigate('/login', true);
        return;
      }
      if (route.redirectIfAuth && isAuth) {
        const redirectRoute = await this.getAuthenticatedRedirect();
        this._handlingRoute = false;
        this.navigate(redirectRoute, true);
        return;
      }

      const container = document.getElementById('app-container');
      if (!container) return;

      // Cleanup anterior (fire-and-forget, no bloquea navegación)
      if (this.currentView) {
        const prevView = this.currentView;
        this.currentView = null;
        if (typeof prevView.onLeave === 'function') {
          try { prevView.onLeave(); } catch (_) {}
        }
        if (typeof prevView.destroy === 'function') {
          try { prevView.destroy(); } catch (_) {}
        }
      }

      // Batch DOM operations
      container.innerHTML = '';
      container.classList.remove('view-leave', 'view-enter');

      let ViewClass;
      if (typeof route.viewLoader === 'function') {
        const isClass = route.viewLoader.prototype && route.viewLoader.prototype.constructor === route.viewLoader;
        if (isClass) {
          ViewClass = route.viewLoader;
        } else {
          const result = await route.viewLoader();
          ViewClass = result.default || result;
        }
      } else {
        ViewClass = route.viewLoader;
      }

      if (!ViewClass || typeof ViewClass !== 'function') return;

      // Mostrar/ocultar fondo de la landing (imagen en index.html #landing-background-wrap)
      if (path === '/') {
        document.body.classList.add('route-landing');
      } else {
        document.body.classList.remove('route-landing');
      }

      this.currentView = new ViewClass();
      this.currentRoute = path;
      if (Object.keys(routeParams).length > 0) {
        this.currentView.routeParams = routeParams;
      }

      if (window.appNavigation && typeof window.appNavigation.render === 'function') {
        await window.appNavigation.render();
      }

      await this.currentView.render();

      // Animación de entrada suave en todas las páginas (igual que landing/login). Landing y login ya usan body.entrance-done.
      const publicNoEntrance = ['/', '/login', '/signin', '/politica-de-privacidad', '/terminos-de-servicio', '/eliminacion-de-datos'];
      if (!publicNoEntrance.includes(path)) {
        container.classList.remove('view-enter');
        void container.offsetHeight;
        container.classList.add('view-enter');
      }

      window.dispatchEvent(new CustomEvent('routechange', { detail: { path, params: routeParams } }));
    } catch (error) {
      console.error('Error manejando ruta:', error);
      if (window.errorHandler) {
        window.errorHandler.showError(error, 'Error cargando la página. Por favor, recarga.');
      } else {
        this.showError('Error cargando la página. Por favor, recarga.');
      }
    } finally {
      if (window.appLoader && typeof window.appLoader.hideSpinner === 'function') {
        window.appLoader.hideSpinner();
      }
      this._handlingRoute = false;
      if (this._pendingRoute) {
        const pending = this._pendingRoute;
        this._pendingRoute = null;
        // Evitar doble render/parpadeo: no volver a manejar la misma ruta que acabamos de renderizar
        if (pending !== this.currentRoute) {
          this.handleRoute();
        }
      }
    }
  }

  /**
   * Verificar autenticación
   * @returns {Promise<boolean>}
   */
  async checkAuthentication() {
    // Prioridad 1: Usar AuthService
    if (window.authService && typeof window.authService.isAuthenticated === 'function') {
      return await window.authService.isAuthenticated();
    }
    
    // Prioridad 2: Usar SupabaseService
    if (window.supabaseService) {
      try {
        const client = await window.supabaseService.getClient();
        if (client) {
          const { data: { user }, error } = await client.auth.getUser();
          return !error && user !== null;
        }
      } catch (error) {
        return false;
      }
    }
    
    // Fallback: verificar Supabase directamente
    if (window.supabase) {
      try {
        const { data: { user }, error } = await window.supabase.auth.getUser();
        return !error && user !== null;
      } catch (error) {
        return false;
      }
    }
    
    return false;
  }

  async _getDefaultUserRouteFallback(userId) {
    const supabase = window.supabase || (window.supabaseService && (await window.supabaseService.getClient()));
    if (!supabase || !userId) return '/create';
    try {
      const [membersRes, ownedRes] = await Promise.all([
        supabase.from('organization_members').select('organization_id, organizations(id, name)').eq('user_id', userId),
        supabase.from('organizations').select('id, name').eq('owner_user_id', userId)
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
      if (list.length === 0) return '/create';
      const selectedId = localStorage.getItem('selectedOrganizationId');
      const org = selectedId ? list.find((x) => x.id === selectedId) || list[0] : list[0];
      if (typeof window.getOrgPathPrefix === 'function') {
        const prefix = window.getOrgPathPrefix(org.id, org.name);
        return prefix ? `${prefix}/dashboard` : '/create';
      }
      return `/org/${org.id}/dashboard`;
    } catch (e) {
      return '/create';
    }
  }

  async getAuthenticatedRedirect() {
    if (window.authService && typeof window.authService.determineRedirectRoute === 'function') {
      const user = window.authService.getCurrentUser();
      if (user?.id) return await window.authService.determineRedirectRoute(user.id);
    }
    const supabase = window.supabase || (window.supabaseService && (await window.supabaseService.getClient()));
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) return await this._getDefaultUserRouteFallback(user.id);
    }
    if (localStorage.getItem('userViewMode') === 'developer') return '/dev/dashboard';
    return '/create';
  }

  /**
   * Verificar si la ruta actual es una ruta de desarrollador
   * @returns {boolean}
   */
  isDevRoute() {
    const currentPath = window.location.pathname || '/';
    return currentPath.startsWith('/dev');
  }

  /**
   * Verificar si la ruta actual requiere modo desarrollador
   * @param {string} path - Ruta a verificar
   * @returns {boolean}
   */
  requiresDevMode(path) {
    return path.startsWith('/dev');
  }

  getCurrentRoute() {
    return this.currentRoute || window.location.pathname || '/';
  }

  /**
   * Mostrar error al usuario
   * @param {string} message - Mensaje de error
   */
  showError(message) {
    const container = document.getElementById('app-container');
    if (container) {
      container.innerHTML = `
        <div class="error-container" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 2rem;
          text-align: center;
        ">
          <div class="error-icon" style="font-size: 3rem; color: var(--accent-warm, #e09145); margin-bottom: 1rem;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h2 style="color: var(--text-primary, #ecebda); margin-bottom: 1rem;">Error</h2>
          <p style="color: var(--text-secondary, #a0a0a0);">${message}</p>
          <button onclick="window.location.reload()" style="
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: var(--primary-color, #ecebda);
            color: var(--bg-dark, #1a1a1a);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          ">Recargar Página</button>
        </div>
      `;
    }
  }
}

// Crear instancia global del router
window.router = new Router();

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Router;
}

