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
  }

  /**
   * Inicializar la vista
   */
  async init() {
    // Reutilizar LivingManager existente o crear uno nuevo
    if (window.livingManager && window.livingManager.initialized) {
      // Si ya existe y está inicializado, solo re-renderizar
      this.livingManager = window.livingManager;
      await this.livingManager.renderAll();
    } else {
      // Si no existe o no está inicializado, crear uno nuevo
      if (window.LivingManager) {
        this.livingManager = new window.LivingManager();
        window.livingManager = this.livingManager; // Guardar referencia global
        await this.livingManager.init();
      } else {
        // Si LivingManager no está disponible, cargar el script
        await this.loadLivingScript();
        if (window.LivingManager) {
          this.livingManager = new window.LivingManager();
          window.livingManager = this.livingManager; // Guardar referencia global
          await this.livingManager.init();
        }
      }
    }

    // Setup links para usar router
    this.setupRouterLinks();
  }

  /**
   * Cargar script de Living si no está disponible
   */
  async loadLivingScript() {
    return new Promise((resolve, reject) => {
      if (window.LivingManager) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'js/living.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Error cargando living.js'));
      document.head.appendChild(script);
    });
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
   * NO destruir LivingManager - se reutiliza entre navegaciones
   */
  async onLeave() {
    // No hacer nada - dejar que el manager persista
    // El modal se mantiene en el body y no se pierde
  }
}

// Hacer disponible globalmente
window.LivingView = LivingView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LivingView;
}

