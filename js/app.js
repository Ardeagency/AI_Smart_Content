/**
 * App - Aplicación principal de la SPA
 * 
 * Arquitectura de rutas:
 * - Públicas: /, /login, /signin, /planes (sin navegación)
 * - Home: /home, /hogar (solo header, sin sidebar)
 * - Organización: /org/:org_id/... (sidebar SaaS)
 * - Desarrollador: /dev/... (sidebar PaaS)
 */
class App {
  constructor() {
    this.initialized = false;
    this.router = null;
    this._loadedScripts = new Set();
  }

  _loadScript(src) {
    if (this._loadedScripts.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { this._loadedScripts.add(src); resolve(); };
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async _loadScripts(srcs) {
    for (const src of srcs) await this._loadScript(src);
  }

  _lazy(globalName, deps) {
    const self = this;
    return async function() {
      if (deps && deps.length) await self._loadScripts(deps);
      if (!window[globalName]) throw new Error(`${globalName} not found after loading`);
      return window[globalName];
    };
  }

  /**
   * Inicializar la aplicación
   */
  async init() {
    if (this.initialized) return;

    try {
      this.initRouter();
      this.registerRoutes();

      const [supabaseResult] = await Promise.allSettled([this.initSupabase()]);

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
   * Registrar todas las rutas de la aplicación.
   * Las vistas críticas (Landing, SignIn) se cargan sincrónicamente.
   * El resto se carga bajo demanda (lazy) cuando el usuario navega a esa ruta.
   */
  registerRoutes() {
    if (!this.router) return;
    const r = this.router;
    const pub = { requiresAuth: false, redirectIfAuth: false };
    const auth = { requiresAuth: true, redirectIfAuth: false };

    const inputDeps = ['/js/flags-data.js', '/js/input-registry.js'];
    const devBase = ['/js/views/DevBaseView.js'];
    const devInput = ['/js/views/DevBaseView.js', '/js/flags-data.js', '/js/input-registry.js'];

    // ── Públicas (cargadas sincrónicamente) ──
    r.register('/', window.LandingView, pub);
    r.register('/login', window.SignInView, pub);
    r.register('/signin', window.SignInView, pub);

    // ── Públicas (lazy) ──
    r.register('/planes', this._lazy('PlanesView', ['/js/views/PlanesView.js']), pub);
    r.register('/cambiar-contrasena', this._lazy('CambiarContrasenaView', ['/js/views/CambiarContrasenaView.js']), pub);

    // ── Home / Hogar ──
    const hogarLoader = this._lazy('HogarView', ['/js/views/HogarView.js']);
    r.register('/home', hogarLoader, auth);
    r.register('/hogar', hogarLoader, auth);

    // ── Org: Historial / Living ──
    const livingLoader = this._lazy('LivingView', ['/js/views/LivingView.js']);
    r.register('/org/:orgId/historial', livingLoader, auth);
    r.register('/org/:orgId/living', livingLoader, auth);
    r.register('/historial', livingLoader, auth);
    r.register('/living', livingLoader, auth);

    // ── Org: Brand ──
    const brandsLoader = this._lazy('BrandsView', ['/js/views/BrandsView.js']);
    r.register('/org/:orgId/brand', brandsLoader, auth);
    r.register('/org/:orgId/brand/:brandId', brandsLoader, auth);
    r.register('/brands', brandsLoader, auth);
    r.register('/brands/:brandId', brandsLoader, auth);

    // ── Org: Products ──
    const productsLoader = this._lazy('ProductsView', ['/js/products.js', '/js/views/ProductsView.js']);
    r.register('/org/:orgId/product-detail/:brandId/:productId', productsLoader, auth);
    r.register('/org/:orgId/products', productsLoader, auth);
    r.register('/org/:orgId/products/:brandId', productsLoader, auth);
    r.register('/products', productsLoader, auth);
    r.register('/products/:productId', productsLoader, auth);

    // ── Org: Servicios ──
    const servicesLoader = this._lazy('ServicesView', ['/js/views/ServicesView.js']);
    r.register('/org/:orgId/servicios', servicesLoader, auth);
    r.register('/servicios', servicesLoader, auth);

    // ── Org: Studio ──
    const studioLoader = this._lazy('StudioView', [...inputDeps, '/js/services/FlowWebhookService.js', '/js/products.js', '/js/views/StudioView.js']);
    // Catálogo ANTES que studio/:flowSlug para que /studio/catalog no se interprete como Estudio con flowSlug "catalog"
    const catalogLoader = this._lazy('FlowCatalogView', ['/js/views/FlowCatalogView.js']);
    r.register('/org/:orgId/studio/catalog/sub/:subcategoryId', catalogLoader, auth);
    r.register('/org/:orgId/studio/catalog/:categoryId', catalogLoader, auth);
    r.register('/org/:orgId/studio/catalog', catalogLoader, auth);
    r.register('/studio/catalog/sub/:subcategoryId', catalogLoader, auth);
    r.register('/studio/catalog/:categoryId', catalogLoader, auth);
    r.register('/studio/catalog', catalogLoader, auth);

    r.register('/org/:orgId/studio', studioLoader, auth);
    r.register('/studio', studioLoader, auth);
    r.register('/org/:orgId/studio/:flowSlug', studioLoader, auth);
    r.register('/studio/:flowSlug', studioLoader, auth);

    // ── Org: Audiences ──
    const audiencesLoader = this._lazy('AudiencesView', ['/js/views/AudiencesView.js']);
    r.register('/org/:orgId/audiences', audiencesLoader, auth);
    r.register('/org/:orgId/audiences/:audienceId', audiencesLoader, auth);
    r.register('/audiences', audiencesLoader, auth);

    // ── Org: Campaigns ──
    const campaignsLoader = this._lazy('CampaignsView', ['/js/views/CampaignsView.js']);
    r.register('/org/:orgId/marketing', campaignsLoader, auth);
    r.register('/org/:orgId/campaigns', campaignsLoader, auth);
    r.register('/org/:orgId/campaigns/:campaignId', campaignsLoader, auth);
    r.register('/campaigns', campaignsLoader, auth);
    r.register('/marketing', campaignsLoader, auth);

    // ── Org: Content ──
    const contentLoader = this._lazy('ContentView', ['/js/views/ContentView.js']);
    r.register('/org/:orgId/content', contentLoader, auth);
    r.register('/org/:orgId/content/:contentId', contentLoader, auth);
    r.register('/content', contentLoader, auth);

    // ── Settings ──
    r.register('/settings', this._lazy('SettingsView', ['/js/views/SettingsView.js']), auth);

    // ── Créditos (sidebar footer): con org → organization; sin org → hogar ──
    r.register('/credits', this._lazy('CreditsView', ['/js/views/CreditsView.js']), auth);
    r.register('/org/:orgId/credits', this._lazy('OrganizationView', ['/js/views/OrganizationView.js']), auth);

    // ── Org: Organization ──
    r.register('/org/:orgId/organization', this._lazy('OrganizationView', ['/js/views/OrganizationView.js']), auth);

    // ── Create / Form ──
    r.register('/create', this._lazy('CreateView', ['/js/views/CreateView.js']), auth);
    r.register('/form_org', this._lazy('FormRecordView', ['/js/views/FormRecordView.js']), auth);

    // ── Dev: Portal PaaS ──
    r.register('/dev/dashboard', this._lazy('DevDashboardView', [...devBase, '/js/views/DevDashboardView.js']), auth);
    const devFlowsLoader = this._lazy('DevFlowsView', [...devBase, '/js/views/DevFlowsView.js']);
    r.register('/dev/flows', devFlowsLoader, auth);
    r.register('/dev/flows/:flowId', devFlowsLoader, auth);
    r.register('/dev/logs', this._lazy('DevLogsView', [...devBase, '/js/views/DevLogsView.js']), auth);
    const devBuilderLoader = this._lazy('DevBuilderView', [...devInput, '/js/services/FlowWebhookService.js', '/js/views/DevBuilderView.js', '/js/views/builder/BuilderInputs.js', '/js/views/builder/BuilderModules.js', '/js/views/builder/BuilderPersistence.js']);
    r.register('/dev/builder', devBuilderLoader, auth);
    r.register('/dev/builder/:flowId', devBuilderLoader, auth);
    const devTestLoader = this._lazy('DevTestView', [...devInput, '/js/services/FlowWebhookService.js', '/js/views/DevTestView.js']);
    r.register('/dev/test', devTestLoader, auth);
    r.register('/dev/runs', devTestLoader, auth);
    r.register('/dev/test/:flowId', devTestLoader, auth);
    r.register('/dev/webhooks', this._lazy('DevWebhooksView', [...devBase, '/js/services/FlowWebhookService.js', '/js/views/DevWebhooksView.js']), auth);

    // ── Dev Lead ──
    r.register('/dev/lead/team', this._lazy('DevLeadTeamView', [...devBase, '/js/views/DevLeadTeamView.js']), auth);
    r.register('/dev/lead/categories', this._lazy('DevLeadCategoriesView', [...devBase, '/js/views/DevLeadCategoriesView.js']), auth);
    r.register('/dev/lead/input-schemas', this._lazy('DevLeadInputSchemasView', [...devBase, '/js/views/DevLeadInputSchemasView.js']), auth);
    r.register('/dev/lead/ai-vectors', this._lazy('DevLeadVectorsView', [...devBase, '/js/views/DevLeadVectorsView.js']), auth);
    r.register('/dev/lead/references', this._lazy('DevLeadReferencesView', [...devBase, '/js/views/DevLeadReferencesView.js']), auth);
    r.register('/dev/lead/flows', this._lazy('DevLeadAllFlowsView', [...devBase, '/js/views/DevLeadAllFlowsView.js']), auth);

    // ── 404 ──
    const BV = window.BaseView || class {};
    r.register('/404', class extends BV {
      async render() {
        const c = document.getElementById('app-container');
        if (c) c.innerHTML = `
          <div class="error-page"><div class="error-content">
            <h1>404 En Construcción</h1>
            <p>Esta página está en construcción. En una próxima actualización será agregada.</p>
            <div class="error-actions">
              <button onclick="window.router.navigate('/home')" class="btn-primary"><i class="fas fa-home"></i> Ir a Inicio</button>
              <button onclick="window.history.back()" class="btn-secondary"><i class="fas fa-arrow-left"></i> Volver</button>
            </div>
          </div></div>`;
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
