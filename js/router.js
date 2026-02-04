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
    // Sistema de caché eliminado - siempre crear nuevas instancias
    this.init();
  }

  /**
   * Inicializar el router
   */
  init() {
    // Usar History API en lugar de hash-based routing
    // Escuchar cambios en el historial (botones atrás/adelante)
    window.addEventListener('popstate', () => this.handleRoute());
    
    // Manejar ruta inicial cuando se carga la página
    window.addEventListener('load', () => this.handleRoute());
    
    // Manejar ruta inicial si no hay evento load
    if (document.readyState === 'complete') {
      this.handleRoute();
    }
  }

  /**
   * Registrar una ruta
   * @param {string} path - Ruta (ej: '/', '/login', '/living')
   * @param {Function|Promise} viewLoader - Clase de vista o función que retorna la clase
   * @param {Object} options - Opciones de la ruta
   * @param {boolean} options.requiresAuth - Si requiere autenticación
   * @param {boolean} options.redirectIfAuth - Si redirige si ya está autenticado
   */
  /**
   * Determina si una ruta es de workspace (/org/:orgId/...)
   */
  isWorkspacePath(path) {
    return /^\/org\/[^/]+\/.+/.test(path);
  }

  /**
   * Determina si es la ruta exacta /org/:orgId (sin módulo)
   */
  isOrgRootPath(path) {
    return /^\/org\/[^/]+\/?$/.test(path);
  }

  register(path, viewLoader, options = {}) {
    if (!viewLoader && !options.redirectTo) return;

    this.routes[path] = {
      viewLoader: viewLoader || null,
      requiresAuth: options.requiresAuth ?? false,
      redirectIfAuth: options.redirectIfAuth ?? false,
      layout: options.layout || 'root', // 'root' | 'workspace'
      redirectTo: options.redirectTo || null // para /org/:orgId → /org/:orgId/living
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
    try {
      // Obtener path actual usando History API
      let path = window.location.pathname || '/';
      
      // Normalizar path (asegurar que empiece con /)
      if (!path.startsWith('/')) {
        path = '/' + path;
      }
      
      // Si el path es solo '/' o está vacío, usar '/'
      if (path === '' || path === '/index.html') {
        path = '/';
      }

      // Regla: /org/:orgId exacto → redirigir a /org/:orgId/living (excepto /org/new, que es User Space)
      if (path !== '/org/new' && this.isOrgRootPath(path)) {
        const orgId = path.replace(/^\/org\//, '').replace(/\/$/, '');
        if (orgId) {
          this.navigate(`/org/${orgId}/living`, true);
          return;
        }
      }
      
      // Buscar ruta exacta primero
      let route = this.routes[path];
      let routeParams = {};

      // Si no hay ruta exacta, buscar rutas dinámicas
      if (!route) {
        // Buscar rutas con parámetros (ej: /brands/:brandId)
        for (const [routePattern, routeConfig] of Object.entries(this.routes)) {
          if (routePattern.includes(':')) {
            // Convertir patrón a regex
            const patternRegex = new RegExp('^' + routePattern.replace(/:[^/]+/g, '([^/]+)') + '$');
            const match = path.match(patternRegex);
            
            if (match) {
              // Extraer nombres de parámetros del patrón
              const paramNames = routePattern.match(/:[^/]+/g) || [];
              const paramValues = match.slice(1);
              
              // Crear objeto de parámetros
              paramNames.forEach((paramName, index) => {
                const key = paramName.replace(':', '');
                routeParams[key] = paramValues[index];
              });
              
              route = routeConfig;
              break;
            }
          }
        }
      }

      if (!route) {
        const route404 = this.routes['/404'];
        if (route404) {
          route = route404;
        } else if (this.routes['/home']) {
          this.navigate('/home', true);
          return;
        } else if (this.routes['/']) {
          this.navigate('/', true);
          return;
        } else {
          return;
        }
      }

      if (route.requiresAuth === undefined) route.requiresAuth = false;
      if (route.redirectIfAuth === undefined) route.redirectIfAuth = false;
      if (route.layout === undefined) route.layout = 'root';

      if (route.requiresAuth) {
        const isAuth = await this.checkAuthentication();
        if (!isAuth) {
          this.navigate('/login', true);
          return;
        }
      }

      if (route.redirectIfAuth) {
        const isAuth = await this.checkAuthentication();
        if (isAuth) {
          this.navigate('/home', true);
          return;
        }
      }

      const appContainer = document.getElementById('app-container');
      if (!appContainer) return;

      const isWorkspaceRoute = this.isWorkspacePath(path);
      let container;

      if (isWorkspaceRoute && routeParams.orgId) {
        // --- WORKSPACE: validar org y usar WorkspaceLayout ---
        if (window.workspaceContext && typeof window.workspaceContext.loadOrganizationContext === 'function') {
          const ok = await window.workspaceContext.loadOrganizationContext(routeParams.orgId);
          if (!ok) return;
        }
        if (window.workspaceLayout) {
          if (!window.workspaceLayout.isMounted()) {
            window.workspaceLayout.mount(appContainer);
            if (window.navigation) await window.navigation.render();
          }
          container = window.workspaceLayout.getContentContainer();
        }
        if (!container) container = appContainer;
      } else {
        // --- ROOT: desmontar workspace si estaba montado ---
        if (window.workspaceLayout && window.workspaceLayout.isMounted()) {
          window.workspaceLayout.unmount();
        }
        container = appContainer;
      }

      if (!container) return;

      container.innerHTML = '';
      container.classList.remove('view-leave', 'view-enter');

      if (!route.viewLoader) {
        this.updateNavigation();
        window.dispatchEvent(new CustomEvent('routechange', { detail: { path } }));
        return;
      }

      // Cargar clase de vista (puede ser lazy loading)
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

      if (!ViewClass || typeof ViewClass !== 'function') {
        console.error('Vista no válida para ruta:', path);
        return;
      }

      this.currentView = new ViewClass();
      this.currentRoute = path;
      this.currentView.routeParams = routeParams || {};
      this.currentView.container = container;

      container.classList.add('view-enter');

      await this.currentView.render();

      this.updateNavigation();
      window.dispatchEvent(new CustomEvent('routechange', { detail: { path } }));
    } catch (error) {
      console.error('Error manejando ruta:', error);
      if (window.errorHandler) {
        window.errorHandler.showError(error, 'Error cargando la página. Por favor, recarga.');
      } else {
        this.showError('Error cargando la página. Por favor, recarga.');
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
   * Actualizar links activos en navegación
   */
  updateNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const currentPath = window.location.pathname || '/';
    
    navLinks.forEach(link => {
      link.classList.remove('active');
      const href = link.getAttribute('href');
      
      if (href) {
        let linkPath = href.replace('#', '').replace('.html', '').split('?')[0];
        if (!linkPath.startsWith('/')) linkPath = '/' + linkPath;
        
        if (linkPath === currentPath ||
            (linkPath === '/' && currentPath === '/') ||
            (linkPath === '/home' && currentPath === '/')) {
          link.classList.add('active');
        }
      }
    });
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

