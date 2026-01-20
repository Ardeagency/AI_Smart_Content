/**
 * StudioView - Vista del editor de contenido (Studio)
 * Maneja la creación y edición de contenido con IA
 */
class StudioView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'studio.html';
    this.studioManager = null;
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
    // Inicializar StudioManager (usar la clase existente si está disponible)
    // Por ahora, cargar el script de studio.js que maneja toda la lógica
    await this.loadStudioScripts();

    // Setup links para usar router si es necesario
    this.setupRouterLinks();
  }

  /**
   * Cargar scripts de Studio usando el método centralizado de BaseView
   */
  async loadStudioScripts() {
    const scripts = [
      { src: 'js/sidebar-manager.js', globalVar: null },
      { src: 'js/campaigns-manager.js', globalVar: null },
      { src: 'js/studio.js', globalVar: null }
    ];

    for (const { src, globalVar } of scripts) {
      await this.loadScript(src, globalVar);
    }

    // Si hay funciones globales que necesitan inicializarse, hacerlo aquí
    // Por ejemplo, si studio.js tiene una función init(), llamarla
  }

  /**
   * Configurar links para usar router
   */
  setupRouterLinks() {
    // Buscar links que apunten a otras páginas y actualizarlos
    const allLinks = this.querySelectorAll('a[href*=".html"]');
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        const route = href.replace('.html', '');
        if (route !== href) {
          link.setAttribute('href', `#${route}`);
          this.addEventListener(link, 'click', (e) => {
            e.preventDefault();
            if (window.router) {
              window.router.navigate(route);
            }
          });
        }
      }
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
   * Hook al salir de la vista - sin limpieza
   */
  async onLeave() {
    // Sin limpieza - el navegador maneja todo automáticamente
  }
}

// Hacer disponible globalmente
window.StudioView = StudioView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StudioView;
}

