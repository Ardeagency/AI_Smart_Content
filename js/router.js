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
      // Quitar barra final para que /dev/lead/flows/ coincida con /dev/lead/flows
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
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
        } else if (this.routes['/']) {
          this.navigate('/', true);
          return;
        } else {
          return;
        }
      }

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
          // Redirigir según el modo del usuario (MPA + SPA)
          const redirectRoute = await this.getAuthenticatedRedirect();
          this.navigate(redirectRoute, true);
          return;
        }
      }

      const container = document.getElementById('app-container');
      if (!container) return;

      // Preparar container para nueva vista
      if (container) {
        container.innerHTML = '';
      }

      // Remover clases de animación
      if (container) {
        container.classList.remove('view-leave', 'view-enter');
      }

      // Cargar clase de vista (puede ser lazy loading)
      let ViewClass;
      
      // Verificar si es una función async o una función que retorna una promesa (lazy loading)
      if (typeof route.viewLoader === 'function') {
        // Verificar si es una clase (constructor) o una función de lazy loading
        // Las clases tienen prototype.constructor === themselves
        const isClass = route.viewLoader.prototype && route.viewLoader.prototype.constructor === route.viewLoader;
        
        if (isClass) {
          // Es una clase directa, usar directamente
          ViewClass = route.viewLoader;
        } else {
          // Es una función de lazy loading, ejecutarla
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

      // Siempre crear nueva instancia - sin caché
      this.currentView = new ViewClass();
      this.currentRoute = path;
      
      if (Object.keys(routeParams).length > 0) {
        this.currentView.routeParams = routeParams;
      }

      /* No animar entrada en Hogar/Home para evitar pantalla negra (view-enter empieza en opacity 0) */
      if (container && path !== '/hogar' && path !== '/home') {
        container.classList.add('view-enter');
      }

      // Renderizar la navegación ANTES de la vista
      // Esto actualiza el sidebar/header según la ruta
      if (window.navigation) {
        await window.navigation.render();
      }

      await this.currentView.render();

      // Un solo lugar actualiza la nav: Navigation (vía routechange)
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

    // Default: ir a selector de organizaciones (SaaS)
    return '/hogar';
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

