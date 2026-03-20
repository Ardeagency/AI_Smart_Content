/**
 * LivingView - Vista del dashboard principal (Living)
 * Maneja el dashboard con información de perfil, productos y campañas
 * 
 * Rutas soportadas:
 * - /org/:orgId/production - Con contexto de organización
 * - /production - Sin org (usa organización guardada)
 * - /org/:orgId/historial, /historial, /living - Legacy (misma vista)
 */
class LivingView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'living.html';
    this.livingManager = null;
    this.orgId = null;
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Verificar autenticación
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    } else {
      const isAuth = await this.checkAuthentication();
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }

    // Obtener orgId de los parámetros de ruta o del estado
    this.orgId = this.routeParams?.orgId || 
                 window.appState?.get('selectedOrganizationId') ||
                 localStorage.getItem('selectedOrganizationId');
    
    // Si no hay orgId, redirigir a organización por defecto o configuración
    if (!this.orgId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/form_org';
      window.router?.navigate(url, true);
      return;
    }

    // Guardar orgId para uso futuro
    if (window.appState) {
      window.appState.set('selectedOrganizationId', this.orgId, true);
    }
    localStorage.setItem('selectedOrganizationId', this.orgId);
  }

  /**
   * Inicializar la vista
   */
  async init() {
    // Mover filtros al header principal (solo en Production)
    this.moveFiltersToHeader();

    // Cargar script si es necesario
    if (!window.LivingManager) {
      await this.loadScript('js/living.js', 'LivingManager');
    }

    // Crear instancia de LivingManager con el orgId
    if (window.LivingManager) {
      this.livingManager = new window.LivingManager();
      // Pasar orgId al manager
      this.livingManager.organizationId = this.orgId;
      await this.livingManager.init();
    } else {
      console.error('No se pudo cargar LivingManager');
    }

    // Setup links para usar router con orgId
    this.setupRouterLinks();
  }

  /**
   * Mueve la barra de filtros al header principal (solo Production).
   * El header aplica efecto glass cuando contiene los filtros.
   */
  moveFiltersToHeader() {
    const slot = document.getElementById('headerProductionSlot');
    const filters = document.querySelector('.living-history-filters');
    if (slot && filters) {
      slot.innerHTML = '';
      slot.appendChild(filters);
      slot.setAttribute('aria-hidden', 'false');
      document.body.classList.add('production-filters-in-header');
    }
  }

  /**
   * Restaura el slot del header al salir de Production.
   */
  clearFiltersFromHeader() {
    const slot = document.getElementById('headerProductionSlot');
    if (slot) {
      slot.innerHTML = '';
      slot.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('production-filters-in-header');
  }

  /**
   * Configurar links para usar router con contexto de organización
   */
  setupRouterLinks() {
    const basePath = (this.orgId && typeof window.getOrgPathPrefix === 'function')
      ? window.getOrgPathPrefix(this.orgId, window.currentOrgName || '')
      : '';
    
    const productsLinks = this.querySelectorAll('a[href*="products"]');
    const studioLinks = this.querySelectorAll('a[href*="studio"]');
    const brandLinks = this.querySelectorAll('a[href*="brand"]');

    productsLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        window.router?.navigate(`${basePath}/products`);
      });
    });

    studioLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        window.router?.navigate(`${basePath}/studio`);
      });
    });

    brandLinks.forEach(link => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        window.router?.navigate(`${basePath}/brand`);
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
   * Hook al salir de la vista
   */
  async onLeave() {
    this.clearFiltersFromHeader();
    if (this.livingManager && typeof this.livingManager.destroy === 'function') {
      this.livingManager.destroy();
    }
    this.livingManager = null;
  }
}

// Hacer disponible globalmente
window.LivingView = LivingView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LivingView;
}

