/**
 * Router - Sistema de navegación para SPA
 * 
 * Maneja rutas sin recargar la página usando hash-based routing.
 * Proporciona transiciones suaves, route guards, y cache de templates.
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
    this.viewCache = {};
    this.templateCache = new Map(); // Cache de templates
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
  register(path, viewLoader, options = {}) {
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
    
    // Evitar navegación si ya estamos en esa ruta
    const currentPath = window.location.pathname;
    if (currentPath === normalizedPath) {
      return;
    }
    
    // Usar History API
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
      const path = window.location.pathname || '/';
      
      // Buscar ruta
      let route = this.routes[path];

      if (!route) {
        console.warn(`⚠️ Ruta no encontrada: ${path}, usando 404`);
        // Usar ruta 404 si existe
        const route404 = this.routes['/404'];
        if (route404) {
          // Usar la ruta 404
          route = route404;
        } else {
          console.error(`❌ Ruta no encontrada y 404 no disponible: ${path}`);
          return;
        }
      }

      // Verificar autenticación si es necesario
      if (route.requiresAuth) {
        const isAuth = await this.checkAuthentication();
        if (!isAuth) {
          console.log('⚠️ Ruta protegida, redirigiendo a login...');
          this.navigate('/login', true);
          return;
        }
      }

      // Redirigir si ya está autenticado (ej: login cuando ya hay sesión)
      if (route.redirectIfAuth) {
        const isAuth = await this.checkAuthentication();
        if (isAuth) {
          console.log('✅ Usuario autenticado, redirigiendo...');
          this.navigate('/living', true);
          return;
        }
      }

      // Obtener container
      const container = document.getElementById('app-container');
      if (!container) {
        console.error('❌ Container no encontrado');
        return;
      }

      // Aplicar animación de salida a la vista actual
      if (this.currentView && container) {
        container.classList.add('view-leave');
        // Esperar un poco para la animación
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Limpiar vista actual
      if (this.currentView && typeof this.currentView.destroy === 'function') {
        try {
          await this.currentView.destroy();
        } catch (error) {
          console.error('Error destruyendo vista actual:', error);
        }
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

      if (!ViewClass) {
        console.error('❌ Vista no encontrada para ruta:', path);
        return;
      }

      // Verificar que ViewClass sea una clase antes de instanciar
      if (typeof ViewClass !== 'function') {
        console.error('❌ ViewClass no es una función/clase:', ViewClass);
        return;
      }

      // Crear nueva instancia de vista
      this.currentView = new ViewClass();
      this.currentRoute = path;

      // Aplicar animación de entrada antes de renderizar
      if (container) {
        container.classList.add('view-enter');
      }

      // Renderizar nueva vista
      await this.currentView.render();
      
      // Actualizar navegación activa
      this.updateNavigation();
      
      console.log(`✅ Vista cargada: ${path}`);
    } catch (error) {
      console.error('❌ Error manejando ruta:', error);
      
      // Usar ErrorHandler si está disponible
      if (window.errorHandler) {
        window.errorHandler.showError(error, 'Error cargando la página. Por favor, recarga.');
      } else {
        // Fallback
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
      
      // Comparar href con pathname actual
      if (href) {
        // Normalizar href (puede ser '#/ruta', '/ruta', o 'ruta.html')
        let linkPath = href.replace('#', '').replace('.html', '');
        if (!linkPath.startsWith('/')) {
          linkPath = '/' + linkPath;
        }
        
        // Comparar paths
        if (linkPath === currentPath || 
            (linkPath === '/' && currentPath === '/')) {
          link.classList.add('active');
        }
      }
    });
  }

  /**
   * Obtener ruta actual
   * @returns {string}
   */
  getCurrentRoute() {
    return this.currentRoute || (window.location.hash.slice(1) || '/');
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

