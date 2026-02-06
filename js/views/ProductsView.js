/**
 * ProductsView - Vista de gestión de productos (lista y CRUD)
 * Detalle de producto eliminado; se hará desde cero.
 */
class ProductsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'products.html';
    this.productsManager = null;
    this.supabase = null;
    this.userId = null;
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
   * Renderizar la vista (solo lista de productos)
   */
  async render() {
    await super.render();
  }

  /**
   * Inicializar la vista (para lista de productos)
   */
  async init() {
    // Resetear estado
    this.productsManager = null;
    this.supabase = null;
    this.userId = null;

    if (!window.ProductsManager) {
      await this.loadScript('js/products.js', 'ProductsManager');
    }

    if (window.ProductsManager) {
      this.productsManager = new window.ProductsManager();
      await this.productsManager.init();
    }

    this.setupRouterLinks();
  }

  /**
   * Configurar links para usar router
   */
  setupRouterLinks() {
    const basePath = (this.routeParams && this.routeParams.orgId) ? `/org/${this.routeParams.orgId}` : '';
    const livingLinks = this.querySelectorAll('a[href*="living"]');
    const studioLinks = this.querySelectorAll('a[href*="studio"]');

    livingLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate(basePath ? `${basePath}/living` : '/living');
        }
      });
    });

    studioLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) {
          window.router.navigate(basePath ? `${basePath}/studio` : '/studio');
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
   * Mostrar notificación
   */
  showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 2rem;
      padding: 1rem 1.5rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Hook al salir de la vista
   */
  async onLeave() {
    this.productsManager = null;
    this.supabase = null;
    this.userId = null;
  }
}

// Hacer disponible globalmente
window.ProductsView = ProductsView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductsView;
}

