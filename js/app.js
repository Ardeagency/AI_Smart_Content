/**
 * App - Aplicación principal de la SPA
 * Orquesta la inicialización de todos los componentes
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

      if (window.router) {
        setTimeout(() => {
          if (Object.keys(window.router.routes).length > 0) {
            window.router.handleRoute();
          } else {
            setTimeout(() => {
              if (Object.keys(window.router.routes).length > 0) {
                window.router.handleRoute();
              }
            }, 500);
          }
        }, 200);
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
   * 
   * Arquitectura MPA + SPA:
   * - Rutas públicas (MPA): /, /login, /planes
   * - Rutas SaaS (SPA para usuarios): /hogar, /living, /studio, /brands, etc.
   * - Rutas PaaS (Portal de desarrolladores): /dev/*
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
      FormRecordView: typeof window.FormRecordView !== 'undefined',
      HogarView: typeof window.HogarView !== 'undefined',
      LivingView: typeof window.LivingView !== 'undefined',
      StudioView: typeof window.StudioView !== 'undefined',
      
      // Vistas PaaS (desarrolladores)
      DevDashboardView: typeof window.DevDashboardView !== 'undefined',
      DevFlowsView: typeof window.DevFlowsView !== 'undefined',
      DevLogsView: typeof window.DevLogsView !== 'undefined',
      DevBuilderView: typeof window.DevBuilderView !== 'undefined',
      DevTestView: typeof window.DevTestView !== 'undefined',
      DevWebhooksView: typeof window.DevWebhooksView !== 'undefined'
    };

    // Rutas públicas
    // Las vistas se cargan desde los scripts en index.html
    if (viewsAvailable.LandingView) {
      this.router.register('/', window.LandingView, {
        requiresAuth: false,
        redirectIfAuth: false
      });
    }

    // Redirigir /login a la landing (el modal de login está en la landing)
    if (viewsAvailable.LandingView) {
      this.router.register('/login', window.LandingView, {
        requiresAuth: false,
        redirectIfAuth: true // Si ya está autenticado, redirigir
      });
    }

    if (viewsAvailable.PlanesView) {
      this.router.register('/planes', window.PlanesView, {
        requiresAuth: false,
        redirectIfAuth: false
      });
    }

    // Rutas protegidas - Nueva estructura
    if (viewsAvailable.BrandsView) {
      this.router.register('/brands', window.BrandsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Rutas dinámicas de brands (detalle)
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

      // Rutas dinámicas de products (detalle)
      this.router.register('/products/:productId', window.ProductsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.CampaignsView) {
      this.router.register('/campaigns', window.CampaignsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Rutas dinámicas de campaigns (detalle)
      this.router.register('/campaigns/:campaignId', window.CampaignsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.AudiencesView) {
      this.router.register('/audiences', window.AudiencesView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Rutas dinámicas de audiences (detalle)
      this.router.register('/audiences/:audienceId', window.AudiencesView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.CreateView) {
      this.router.register('/create', window.CreateView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/create/guided', window.CreateView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/create/pro', window.CreateView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      this.router.register('/create/templates', window.CreateView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.ContentView) {
      this.router.register('/content', window.ContentView, {
        requiresAuth: true,
        redirectIfAuth: false
      });

      // Rutas dinámicas de content (detalle)
      this.router.register('/content/:contentId', window.ContentView, {
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

    // Rutas legacy (mantener compatibilidad temporal)
    if (viewsAvailable.FormRecordView) {
      this.router.register('/form-record', window.FormRecordView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.HogarView) {
      this.router.register('/hogar', window.HogarView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    if (viewsAvailable.LivingView) {
      this.router.register('/living', window.LivingView, {
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

    // ========================================
    // RUTAS PaaS - Portal de Desarrolladores
    // ========================================
    
    // Dashboard de desarrollador
    if (viewsAvailable.DevDashboardView) {
      this.router.register('/dev/dashboard', window.DevDashboardView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Gestión de flujos
    if (viewsAvailable.DevFlowsView) {
      this.router.register('/dev/flows', window.DevFlowsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Logs y debug
    if (viewsAvailable.DevLogsView) {
      this.router.register('/dev/logs', window.DevLogsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Builder de flujos (constructor visual)
    if (viewsAvailable.DevBuilderView) {
      this.router.register('/dev/builder', window.DevBuilderView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Test de flujos (testing de webhooks)
    if (viewsAvailable.DevTestView) {
      this.router.register('/dev/test', window.DevTestView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
      // Alias para ejecuciones
      this.router.register('/dev/runs', window.DevTestView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Colaboradores (placeholder - usará DevDashboardView temporalmente)
    if (viewsAvailable.DevDashboardView) {
      this.router.register('/dev/collaborators', window.DevDashboardView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Marketplace (placeholder - usará DevFlowsView temporalmente)
    if (viewsAvailable.DevFlowsView) {
      this.router.register('/dev/marketplace', window.DevFlowsView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Webhooks Manager (gestión de URLs y configuración técnica)
    if (viewsAvailable.DevWebhooksView) {
      this.router.register('/dev/webhooks', window.DevWebhooksView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Documentación (placeholder)
    if (viewsAvailable.DevDashboardView) {
      this.router.register('/dev/docs', window.DevDashboardView, {
        requiresAuth: true,
        redirectIfAuth: false
      });
    }

    // Ruta 404
    const BaseView = window.BaseView || class {};
    this.router.register('/404', class extends BaseView {
      async render() {
        const container = document.getElementById('app-container');
        if (container) {
          container.innerHTML = `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 400px;
              padding: 2rem;
              text-align: center;
            ">
              <h1 style="font-size: 4rem; color: var(--text-primary, #ecebda); margin-bottom: 1rem;">404</h1>
              <p style="color: var(--text-secondary, #a0a0a0); margin-bottom: 2rem;">Página no encontrada</p>
              <button onclick="window.router.navigate('/')" style="
                padding: 0.75rem 1.5rem;
                background: var(--primary-color, #ecebda);
                color: var(--bg-dark, #1a1a1a);
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
              ">Ir al Inicio</button>
            </div>
          `;
        }
      }
    });

  }

  /**
   * Mostrar error de inicialización
   * @param {Error} error - Error ocurrido
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
  // DOM ya está listo, inicializar inmediatamente
  initializeApp();
}

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}

