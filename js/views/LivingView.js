/**
 * LivingView - Vista del dashboard principal (Living)
 * Maneja el dashboard con información de perfil, productos y campañas
 */
class LivingView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'living.html';
    this.livingManager = null;
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

    // Si la vista ya está inicializada pero LivingManager no está inicializado o necesita reinicialización
    // Esto puede pasar cuando se vuelve a entrar a la vista desde otra ruta
    if (this.initialized && (!this.livingManager || !this.livingManager.initialized)) {
      console.log('ℹ️ Reinicializando LivingManager al volver a entrar a la vista...');
      await this.init();
    }
  }

  /**
   * Inicializar la vista
   */
  async init() {
    // Si ya hay una instancia y está inicializada, reinicializarla
    if (this.livingManager && this.livingManager.initialized) {
      console.log('ℹ️ Reinicializando LivingManager...');
      await this.livingManager.destroy();
      this.livingManager = null;
    }

    // Cargar script si es necesario usando el método centralizado de BaseView
    if (!window.LivingManager) {
      await this.loadScript('js/living.js', 'LivingManager');
    }

    // Inicializar LivingManager
    if (window.LivingManager) {
      this.livingManager = new window.LivingManager();
      await this.livingManager.init();
    } else {
      console.error('❌ No se pudo cargar LivingManager');
    }

    // Setup links para usar router
    this.setupRouterLinks();
  }

  /**
   * Configurar links para usar router
   */
  setupRouterLinks() {
    const productsLinks = this.querySelectorAll('a[href*="products"]');
    const studioLinks = this.querySelectorAll('a[href*="studio"]');

    productsLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate('/products');
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
    // Limpiar LivingManager si existe
    if (this.livingManager && typeof this.livingManager.destroy === 'function') {
      await this.livingManager.destroy();
    }
  }
}

// Hacer disponible globalmente
window.LivingView = LivingView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LivingView;
}

