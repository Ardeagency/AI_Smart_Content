/**
 * ProductsView - Vista de gestión de productos
 * Maneja el CRUD de productos
 */
class ProductsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'products.html';
    this.productsManager = null;
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Verificar autenticación usando AuthService
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    } else {
      // Fallback
      const isAuth = await this.checkAuthentication();
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    }

    // Renderizar Navigation si no está visible
    if (window.navigation && !window.navigation.initialized) {
      await window.navigation.render();
    }
  }

  /**
   * Inicializar la vista
   */
  async init() {
    // Cargar script de Products si no está disponible
    if (!window.ProductsManager) {
      await this.loadProductsScript();
    }

    // Inicializar ProductsManager
    if (window.ProductsManager) {
      // Crear instancia solo si no existe
      if (!this.productsManager) {
        this.productsManager = new window.ProductsManager();
        // NO llamar init() automáticamente - ProductsManager.init() se llama desde el template
        // porque necesita que el DOM esté renderizado
        if (this.container && this.container.innerHTML) {
          await this.productsManager.init();
        }
      }
    }

    // Setup links para usar router
    this.setupRouterLinks();
  }

  /**
   * Cargar script de Products si no está disponible
   */
  async loadProductsScript() {
    return new Promise((resolve, reject) => {
      if (window.ProductsManager) {
        resolve();
        return;
      }

      // Verificar si el script ya está cargado
      const existingScript = document.querySelector('script[src="js/products.js"]');
      if (existingScript) {
        // Esperar a que se cargue
        const checkInterval = setInterval(() => {
          if (window.ProductsManager) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!window.ProductsManager) {
            reject(new Error('ProductsManager no se cargó'));
          }
        }, 5000);
        return;
      }

      const script = document.createElement('script');
      script.src = 'js/products.js';
      script.onload = () => {
        // Esperar un poco para que la clase se registre
        setTimeout(() => {
          if (window.ProductsManager) {
            resolve();
          } else {
            reject(new Error('ProductsManager no se registró después de cargar'));
          }
        }, 100);
      };
      script.onerror = () => reject(new Error('Error cargando products.js'));
      document.head.appendChild(script);
    });
  }

  /**
   * Configurar links para usar router
   */
  setupRouterLinks() {
    const livingLinks = this.querySelectorAll('a[href*="living"]');
    const studioLinks = this.querySelectorAll('a[href*="studio"]');

    livingLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate('/living');
        }
      });
    });

    studioLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate('/studio');
        }
      });
    });
  }

  /**
   * Verificar autenticación
   */
  async checkAuthentication() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return false;

    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    // Usar SupabaseService si está disponible
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    
    // Fallback a app-loader
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch (error) {
        return null;
      }
    }
    return window.supabase || null;
  }

  /**
   * Cleanup al salir de la vista
   */
  async onLeave() {
    // Limpiar ProductsManager si existe
    if (this.productsManager && typeof this.productsManager.destroy === 'function') {
      await this.productsManager.destroy();
    }
  }
}

// Hacer disponible globalmente
window.ProductsView = ProductsView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductsView;
}

