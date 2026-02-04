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
   * Simplificado - sin lógica compleja de reinicialización
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
   * Simplificado - siempre crear nueva instancia sin limpieza
   */
  async init() {
    // Cargar script si es necesario usando el método centralizado de BaseView
    if (!window.LivingManager) {
      await this.loadScript('js/living.js', 'LivingManager');
    }

    // Siempre crear nueva instancia de LivingManager
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
    const orgId = (this.routeParams && this.routeParams.orgId) || (window.appState && window.appState.getCurrentOrgId());

    productsLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.workspaceContext) window.workspaceContext.navigateToModule('entities', orgId);
        else if (orgId && window.router) window.router.navigate(`/org/${orgId}/entities`);
      });
    });

    studioLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.workspaceContext) window.workspaceContext.navigateToModule('production', orgId);
        else if (orgId && window.router) window.router.navigate(`/org/${orgId}/production`);
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
   * Hook al salir de la vista - sin limpieza
   */
  async onLeave() {
    // Sin limpieza - el navegador maneja todo automáticamente
  }
}

// Hacer disponible globalmente
window.LivingView = LivingView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LivingView;
}

