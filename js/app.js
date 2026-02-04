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
   * Registrar rutas: Root Layout + Workspace Layout (/org/:orgId/*)
   * Principio Workspace First: ningún módulo en rutas globales.
   */
  registerRoutes() {
    if (!this.router) return;

    const V = {
      LandingView: typeof window.LandingView !== 'undefined',
      HogarView: typeof window.HogarView !== 'undefined',
      AccountView: typeof window.AccountView !== 'undefined',
      InvitationsView: typeof window.InvitationsView !== 'undefined',
      OrgNewView: typeof window.OrgNewView !== 'undefined',
      PlanesView: typeof window.PlanesView !== 'undefined',
      FormRecordView: typeof window.FormRecordView !== 'undefined',
      LivingView: typeof window.LivingView !== 'undefined',
      BrandsView: typeof window.BrandsView !== 'undefined',
      ProductsView: typeof window.ProductsView !== 'undefined',
      CampaignsView: typeof window.CampaignsView !== 'undefined',
      AudiencesView: typeof window.AudiencesView !== 'undefined',
      CreateView: typeof window.CreateView !== 'undefined',
      SettingsView: typeof window.SettingsView !== 'undefined'
    };

    // ---------- USER SPACE (Home = Control Gateway; sin contexto org) ----------
    if (V.LandingView) {
      this.router.register('/', window.LandingView, { requiresAuth: false, redirectIfAuth: false });
      this.router.register('/login', window.LandingView, { requiresAuth: false, redirectIfAuth: true });
    }
    if (V.HogarView) {
      this.router.register('/home', window.HogarView, { requiresAuth: true, redirectIfAuth: false });
    }
    if (V.AccountView) {
      this.router.register('/account/profile', window.AccountView, { requiresAuth: true });
      this.router.register('/account/security', window.AccountView, { requiresAuth: true });
      this.router.register('/account/preferences', window.AccountView, { requiresAuth: true });
      this.router.register('/account/:tab', window.AccountView, { requiresAuth: true });
    }
    if (V.InvitationsView) {
      this.router.register('/invitations', window.InvitationsView, { requiresAuth: true });
    }
    if (V.OrgNewView) {
      this.router.register('/org/new', window.OrgNewView, { requiresAuth: true });
    }
    if (V.PlanesView) {
      this.router.register('/plans', window.PlanesView, { requiresAuth: false, redirectIfAuth: false });
    }
    if (V.FormRecordView) {
      this.router.register('/onboarding', window.FormRecordView, { requiresAuth: true, redirectIfAuth: false });
    }
    if (V.HogarView) this.router.register('/hogar', window.HogarView, { requiresAuth: true });
    if (V.PlanesView) this.router.register('/planes', window.PlanesView, { requiresAuth: false });

    // ---------- WORKSPACE ROUTES (/org/:orgId/:module) ----------
    if (V.LivingView) {
      this.router.register('/org/:orgId/living', window.LivingView, { requiresAuth: true });
    }
    if (V.BrandsView) {
      this.router.register('/org/:orgId/brand', window.BrandsView, { requiresAuth: true });
      this.router.register('/org/:orgId/brand/:brandId', window.BrandsView, { requiresAuth: true });
    }
    if (V.ProductsView) {
      this.router.register('/org/:orgId/entities', window.ProductsView, { requiresAuth: true });
      this.router.register('/org/:orgId/entities/:productId', window.ProductsView, { requiresAuth: true });
    }
    if (V.CreateView) {
      this.router.register('/org/:orgId/production', window.CreateView, { requiresAuth: true });
    }
    if (V.AudiencesView) {
      this.router.register('/org/:orgId/audiences', window.AudiencesView, { requiresAuth: true });
      this.router.register('/org/:orgId/audiences/:audienceId', window.AudiencesView, { requiresAuth: true });
    }
    if (V.CampaignsView) {
      this.router.register('/org/:orgId/marketing', window.CampaignsView, { requiresAuth: true });
      this.router.register('/org/:orgId/marketing/:campaignId', window.CampaignsView, { requiresAuth: true });
    }
    if (V.SettingsView) {
      this.router.register('/org/:orgId/settings', window.SettingsView, { requiresAuth: true });
    }

    // ---------- 404 ----------
    const BaseView = window.BaseView || class {};
    this.router.register('/404', class extends BaseView {
      async render() {
        const container = this.container || document.getElementById('app-container');
        if (container) {
          container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;padding:2rem;text-align:center;">
              <h1 style="font-size:4rem;color:var(--text-primary,#ecebda);margin-bottom:1rem;">404</h1>
              <p style="color:var(--text-secondary,#a0a0a0);margin-bottom:2rem;">Página no encontrada</p>
              <button onclick="window.router.navigate('/home')" style="padding:0.75rem 1.5rem;background:var(--primary-color,#ecebda);color:var(--bg-dark,#1a1a1a);border:none;border-radius:8px;cursor:pointer;font-weight:600;">Ir al Inicio</button>
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

