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
   * @param {string} path - Ruta (ej: '/', '/login', '/living')
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
        this.navigate('/settings' + query, true);
        return;
      }

      let route = this.routes[path];
      let routeParams = {};

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
            const defaultUrl = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
              ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
              : '/settings';
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

      // Tema de marca para toda la org: resaltados en production, products, flows, identity, settings
      if (window.OrgBrandTheme) {
        if (window.currentOrgId) {
          window.OrgBrandTheme.applyOrgBrandTheme(window.currentOrgId);
        } else {
          window.OrgBrandTheme.clearOrgBrandTheme();
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
      if (path !== '/' && path !== '/login' && path !== '/signin') {
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
        this.handleRoute();
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

  /**
   * Obtener ruta de redirección para usuario autenticado
   * Soporta arquitectura MPA + SPA según modo del usuario
   * @returns {Promise<string>}
   */
  async getAuthenticatedRedirect() {
    // Prioridad 1: Usar AuthService para determinar ruta
    if (window.authService && typeof window.authService.determineRedirectRoute === 'function') {
      const user = window.authService.getCurrentUser();
      if (user?.id) {
        return await window.authService.determineRedirectRoute(user.id);
      }
    }

    // Prioridad 2: Verificar modo guardado en localStorage
    const userMode = localStorage.getItem('userViewMode');
    if (userMode === 'developer') {
      return '/dev/dashboard';
    }

    // Default: ir a configuración (usuario entra directo a su org vía determineRedirectRoute)
    return '/settings';
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

