/**
 * App - Aplicación principal de la SPA
 * 
 * Arquitectura de rutas:
 * - Públicas: /, /login, /planes (sin navegación)
 * - Home: /home, /hogar (solo header, sin sidebar)
 * - Organización: /org/:org_id/... (sidebar SaaS)
 * - Desarrollador: /dev/... (sidebar PaaS)
 */
class App {
  constructor() {
    this.initialized = false;
    this.router = null;
  }

  /**
   * Inicializar la aplicación
   */
  async init() {
    if (this.initialized) return;

    try {
      await this.initSupabase();
      this.initRouter();
      this.registerRoutes();

      if (window.router && Object.keys(window.router.routes).length > 0) {
        window.router.handleRoute();
      }

      this.initialized = true;
    } catch (error) {
      console.error('Error inicializando app:', error);
      this.showInitError(error);
    }
  }

  /**
   * Inicializar Supabase
   */
  async initSupabase() {
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        await window.appLoader.waitFor();
      } catch (error) {
        // Continuar aunque Supabase no esté disponible
      }
    }
  }

  /**
   * Inicializar Router
   */
  initRouter() {
    if (!window.router) {
      throw new Error('Router no está disponible');
    }
    this.router = window.router;
  }

  /**
   * Registrar todas las rutas de la aplicación
   */
  registerRoutes() {
    if (!this.router) return;

    const viewsAvailable = {
      // Vistas públicas
      LandingView: typeof window.LandingView !== 'undefined',
      PlanesView: typeof window.PlanesView !== 'undefined',
      
      // Vistas SaaS (usuarios consumidores)
      BrandsView: typeof window.BrandsView !== 'undefined',
      ProductsView: typeof window.ProductsView !== 'undefined',
      CampaignsView: typeof window.CampaignsView !== 'undefined',
      AudiencesView: typeof window.AudiencesView !== 'undefined',
      CreateView: typeof window.CreateView !== 'undefined',
      ContentView: typeof window.ContentView !== 'undefined',
      SettingsView: typeof window.SettingsView !== 'undefined',
      OrganizationView: typeof window.OrganizationView !== 'undefined',
      FormRecordView: typeof window.FormRecordView !== 'undefined',
      HogarView: typeof window.HogarView !== 'undefined',
      LivingView: typeof window.LivingView !== 'undefined',
      StudioView: typeof window.StudioView !== 'undefined',
      FlowCatalogView: typeof window.FlowCatalogView !== 'undefined',
      
      // Vistas PaaS (desarrolladores)
      DevDashboardView: typeof window.DevDashboardView !== 'undefined',
      DevFlowsView: typeof window.DevFlowsView !== 'undefined',
      DevLogsView: typeof window.DevLogsView !== 'undefined',
      DevBuilderView: typeof window.DevBuilderView !== 'undefined',
      DevTestView: typeof window.DevTestView !== 'undefined',
      DevWebhooksView: typeof window.DevWebhooksView !== 'undefined',
      DevLeadTeamView: typeof window.DevLeadTeamView !== 'undefined',
      DevLeadCategoriesView: typeof window.DevLeadCategoriesView !== 'undefined',
      DevLeadInputSchemasView: typeof window.DevLeadInputSchemasView !== 'undefined',
      DevLeadVectorsView: typeof window.DevLeadVectorsView !== 'undefined',
      DevLeadReferencesView: typeof window.DevLeadReferencesView !== 'undefined',
      DevLeadAllFlowsView: typeof window.DevLeadAllFlowsView !== 'undefined'
    };

    // ========================================
    // RUTAS PÚBLICAS (sin navegación)
    // ========================================
    
    if (viewsAvailable.LandingView) {
      this.router.register('/', window.LandingView, {
        requiresAuth: false,
        redirectIfAuth: false
      });

      this.router.register('/login', window.LandingView, {
        requiresAuth: false,
        redirectIfAuth: true
      });
    }

    if (viewsAvailable.PlanesView) {
      this.router.register('/planes', window.PlanesView, {
        requiresAuth: false,
        redirectIfAuth: false
      });
    }

    // ========================================
    // RUTAS HOME/HOGAR (solo header, sin sidebar)
    // ========================================
    
    if (viewsAvailable.HogarView) {
      this.router.register('/home', window.HogarView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/hogar', window.HogarView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // ========================================
    // RUTAS DE ORGANIZACIÓN /org/:org_id/...
    // Sidebar SaaS - Requieren contexto de organización
    // ========================================

    if (viewsAvailable.LivingView) {
      // Living - Dashboard de organización
      this.router.register('/org/:orgId/living', window.LivingView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.BrandsView) {
      // Brand - Vista de marca de la organización
      this.router.register('/org/:orgId/brand', window.BrandsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Brand con ID específico
      this.router.register('/org/:orgId/brand/:brandId', window.BrandsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.ProductsView) {
      // Product detail (antes que products/:brandId para que no se confunda el param)
      this.router.register('/org/:orgId/product-detail/:brandId/:productId', window.ProductsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Products - Lista de productos
      this.router.register('/org/:orgId/products', window.ProductsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Products con marca específica
      this.router.register('/org/:orgId/products/:brandId', window.ProductsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.StudioView) {
      // Studio - Generador de contenido
      this.router.register('/org/:orgId/studio', window.StudioView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.FlowCatalogView) {
      // Catálogo de flujos (dentro de org) - view por categoría debe ir antes para que el router matchee :categoryId
      this.router.register('/org/:orgId/studio/catalog/:categoryId', window.FlowCatalogView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
      this.router.register('/org/:orgId/studio/catalog', window.FlowCatalogView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.AudiencesView) {
      // Audiences
      this.router.register('/org/:orgId/audiences', window.AudiencesView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/org/:orgId/audiences/:audienceId', window.AudiencesView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.CampaignsView) {
      // Marketing/Campaigns
      this.router.register('/org/:orgId/marketing', window.CampaignsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/org/:orgId/campaigns', window.CampaignsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/org/:orgId/campaigns/:campaignId', window.CampaignsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.ContentView) {
      // Content
      this.router.register('/org/:orgId/content', window.ContentView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/org/:orgId/content/:contentId', window.ContentView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.SettingsView) {
      // Settings de organización (perfil usuario)
      this.router.register('/org/:orgId/settings', window.SettingsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.OrganizationView) {
      // Configuración de la organización (datos administrativos del workspace)
      this.router.register('/org/:orgId/organization', window.OrganizationView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // ========================================
    // RUTAS LEGACY (compatibilidad temporal)
    // Redirigen a rutas con org_id cuando sea posible
    // ========================================

    if (viewsAvailable.LivingView) {
      this.router.register('/living', window.LivingView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.BrandsView) {
      this.router.register('/brands', window.BrandsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/brands/:brandId', window.BrandsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.ProductsView) {
      this.router.register('/products', window.ProductsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/products/:productId', window.ProductsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.StudioView) {
      this.router.register('/studio', window.StudioView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.FlowCatalogView) {
      this.router.register('/studio/catalog/:categoryId', window.FlowCatalogView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
      this.router.register('/studio/catalog', window.FlowCatalogView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.AudiencesView) {
      this.router.register('/audiences', window.AudiencesView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.CampaignsView) {
      this.router.register('/campaigns', window.CampaignsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/marketing', window.CampaignsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.ContentView) {
      this.router.register('/content', window.ContentView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.SettingsView) {
      this.router.register('/settings', window.SettingsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.CreateView) {
      this.router.register('/create', window.CreateView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.FormRecordView) {
      this.router.register('/form-record', window.FormRecordView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // ========================================
    // RUTAS PaaS - Portal de Desarrolladores
    // /dev/* - Sidebar de desarrollador
    // ========================================
    
    if (viewsAvailable.DevDashboardView) {
      this.router.register('/dev/dashboard', window.DevDashboardView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.DevFlowsView) {
      this.router.register('/dev/flows', window.DevFlowsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Flujo específico
      this.router.register('/dev/flows/:flowId', window.DevFlowsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.DevLogsView) {
      this.router.register('/dev/logs', window.DevLogsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.DevBuilderView) {
      this.router.register('/dev/builder', window.DevBuilderView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Builder con flujo específico
      this.router.register('/dev/builder/:flowId', window.DevBuilderView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.DevTestView) {
      this.router.register('/dev/test', window.DevTestView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/dev/runs', window.DevTestView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Test con flujo específico
      this.router.register('/dev/test/:flowId', window.DevTestView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.DevWebhooksView) {
      this.router.register('/dev/webhooks', window.DevWebhooksView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Rutas Lead (solo dev_role === 'lead'; la vista redirige si no es lead)
    if (viewsAvailable.DevLeadTeamView) {
      this.router.register('/dev/lead/team', window.DevLeadTeamView, { requiresAuth: true, redirectIfAuth: false });
    }
    if (viewsAvailable.DevLeadCategoriesView) {
      this.router.register('/dev/lead/categories', window.DevLeadCategoriesView, { requiresAuth: true, redirectIfAuth: false });
    }
    if (viewsAvailable.DevLeadInputSchemasView) {
      this.router.register('/dev/lead/input-schemas', window.DevLeadInputSchemasView, { requiresAuth: true, redirectIfAuth: false });
    }
    if (viewsAvailable.DevLeadVectorsView) {
      this.router.register('/dev/lead/ai-vectors', window.DevLeadVectorsView, { requiresAuth: true, redirectIfAuth: false });
    }
    if (viewsAvailable.DevLeadReferencesView) {
      this.router.register('/dev/lead/references', window.DevLeadReferencesView, { requiresAuth: true, redirectIfAuth: false });
    }
    if (viewsAvailable.DevLeadAllFlowsView) {
      this.router.register('/dev/lead/flows', window.DevLeadAllFlowsView, { requiresAuth: true, redirectIfAuth: false });
    }

    // ========================================
    // RUTA 404 - En construcción
    // ========================================
    
    const BaseView = window.BaseView || class {};
    this.router.register('/404', class extends BaseView {
      async render() {
        const container = document.getElementById('app-container');
        if (container) {
          container.innerHTML = `
            <div class="error-page">
              <div class="error-content">
                <h1>404 En Construcción</h1>
                <p>Esta página está en construcción. En una próxima actualización será agregada.</p>
                <div class="error-actions">
                  <button onclick="window.router.navigate('/home')" class="btn-primary">
                    <i class="fas fa-home"></i> Ir a Inicio
                  </button>
                  <button onclick="window.history.back()" class="btn-secondary">
                    <i class="fas fa-arrow-left"></i> Volver
                  </button>
                </div>
              </div>
            </div>
          `;
        }
      }
    });
  }

  /**
   * Mostrar error de inicialización
   */
  showInitError(error) {
    const container = document.getElementById('app-container');
    if (container) {
      container.innerHTML = `
        <div class="error-container" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
          text-align: center;
        ">
          <div class="error-icon" style="font-size: 4rem; color: var(--accent-warm, #e09145); margin-bottom: 1rem;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h1 style="color: var(--text-primary, #ecebda); margin-bottom: 1rem;">Error de Inicialización</h1>
          <p style="color: var(--text-secondary, #a0a0a0); margin-bottom: 2rem;">
            No se pudo inicializar la aplicación.<br>
            ${error.message}
          </p>
          <button onclick="window.location.reload()" style="
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

function initializeApp() {
  if (window.app && window.app.initialized) return;
  
  window.app = new App();
  window.app.init().catch(error => {
    console.error('Error crítico inicializando app:', error);
  });
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}
