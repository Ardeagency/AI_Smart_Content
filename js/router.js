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
    this.viewCache = {}; // Cache de templates
    this.viewInstances = {}; // Cache de instancias de vistas (persistencia)
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
    if (!viewLoader) {
      console.error(`❌ Intento de registrar ruta ${path} sin viewLoader`);
      return;
    }
    
    this.routes[path] = {
      viewLoader,
      requiresAuth: options.requiresAuth || false,
      redirectIfAuth: options.redirectIfAuth || false
    };
    
    console.log(`✅ Ruta registrada: ${path}`);
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
   * Con ligero retraso para suavizar la transición
   */
  async handleRoute() {
    // Ligero retraso para suavizar la navegación (solo si hay vista actual)
    if (this.currentView) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
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

      // Si aún no hay ruta, usar 404
      if (!route) {
        console.warn(`⚠️ Ruta no encontrada: ${path}`);
        console.log('📋 Rutas disponibles:', Object.keys(this.routes));
        const route404 = this.routes['/404'];
        if (route404) {
          route = route404;
        } else {
          console.error(`❌ Ruta no encontrada y 404 no disponible: ${path}`);
          // Intentar redirigir a landing si no hay 404
          if (this.routes['/']) {
            console.log('🔄 Redirigiendo a /');
            this.navigate('/', true);
          }
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
          this.navigate('/hogar', true);
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

      // Ocultar vista actual (NO destruir - mantener en cache)
      if (this.currentView) {
        // Guardar instancia en cache antes de ocultar
        if (this.currentRoute) {
          this.viewInstances[this.currentRoute] = this.currentView;
        }
        
        // Solo ocultar, no destruir
        if (this.currentView.container) {
          this.currentView.container.style.display = 'none';
        }
        
        // Llamar onLeave para cleanup temporal (no destruir datos)
        if (typeof this.currentView.onLeave === 'function') {
          try {
            await this.currentView.onLeave();
        } catch (error) {
            console.error('Error en onLeave de vista actual:', error);
          }
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

      // Verificar si ya existe una instancia de esta vista en cache
      let viewInstance = this.viewInstances[path];
      
      if (viewInstance && viewInstance.initialized) {
        // Reutilizar vista existente
        console.log(`♻️ Reutilizando vista existente: ${path}`);
        this.currentView = viewInstance;
        
        // Mostrar la vista
        if (this.currentView.container) {
          this.currentView.container.style.display = '';
        }
        
        // Llamar onEnter para que la vista pueda hacer verificaciones
        if (typeof this.currentView.onEnter === 'function') {
          await this.currentView.onEnter();
        }
      } else {
        // Crear nueva instancia de vista solo si no existe
      this.currentView = new ViewClass();
      this.currentRoute = path;
        
        // Guardar en cache
        this.viewInstances[path] = this.currentView;
      
      // Pasar parámetros de ruta a la vista si los hay
      if (Object.keys(routeParams).length > 0) {
        this.currentView.routeParams = routeParams;
      }

      // Aplicar animación de entrada antes de renderizar
      if (container) {
        container.classList.add('view-enter');
      }

      // Renderizar nueva vista
      await this.currentView.render();
      }
      
      // Si reutilizamos vista, también pasar parámetros si los hay
      if (viewInstance && viewInstance.initialized && Object.keys(routeParams).length > 0) {
        this.currentView.routeParams = routeParams;
      }
      
      // Actualizar navegación activa
      this.updateNavigation();
      
      // Disparar evento personalizado para que Navigation se actualice
      window.dispatchEvent(new CustomEvent('routechange', { detail: { path } }));
      
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

