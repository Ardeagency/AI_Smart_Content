/**
 * App - Aplicación principal de la SPA
 * 
 * Arquitectura de rutas:
 * - Públicas: /, /login, /signin (sin navegación)
 * - Organización: /org/:org_id/... (sidebar SaaS); tras login el usuario entra directo a su org
 * - Desarrollador: /dev/... (sidebar PaaS)
 */

/** Query `?v=` en JS lazy: en cada deploy de Netlify, el comando `[build]` reemplaza
 * `__BUILD_ID__` por `$COMMIT_REF` (el SHA del commit), garantizando un cache key único.
 * En dev local (sin pasar por el build), el placeholder permanece literal y caemos a un
 * timestamp por sesión, así el navegador trae JS fresco sin necesidad de hard reload. */
const APP_LAZY_SCRIPT_VER = (() => {
  const v = '__BUILD_ID__';
  return v.startsWith('__') ? String(Date.now()) : v;
})();

class App {
  constructor() {
    this.initialized = false;
    this.router = null;
    // url -> Promise. Cacheamos la promesa pendiente (no solo el resultado)
    // para evitar race conditions: si _loadScript se invoca concurrentemente
    // con el mismo url, el segundo call reusa la promise en vuelo en vez de
    // insertar otro <script> (lo que duplicaría declaraciones de clase).
    this._loadedScripts = new Map();
  }

  _loadScript(src) {
    let url = src;
    if (typeof src === 'string' && src.startsWith('/') && !/^https?:\/\//i.test(src)) {
      const base = src.split(/[?#]/)[0];
      // Módulos bajo /js/config/ y /js/utils/: URL limpia (sin ?v=). Evita 404 cacheados en CDN
      // cuando el archivo se añadió después y la clave de caché incluía query antigua.
      const isSharedModule = /\/js\/(config|utils)\//.test(base);
      url = isSharedModule ? base : `${base}?v=${APP_LAZY_SCRIPT_VER}`;
    }
    if (this._loadedScripts.has(url)) return this._loadedScripts.get(url);
    const promise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => {
        // Permitir reintento al borrar la entrada cacheada del Map.
        this._loadedScripts.delete(url);
        reject(new Error(`Failed to load ${url}`));
      };
      document.head.appendChild(s);
    });
    this._loadedScripts.set(url, promise);
    return promise;
  }

  async _loadScripts(srcs) {
    for (const src of srcs) await this._loadScript(src);
  }

  /**
   * Carga un modulo CSS por ruta (route-split). Modulos pesados y exclusivos de
   * una vista (ej. command-center.css) ya NO viajan en bundle.css; se inyectan
   * solo cuando el usuario entra a esa ruta.
   *
   * Cascada: el <link> se inserta ANTES del <link> de bundle.css para preservar
   * el invariante original (los modulos van antes que las reglas propias de
   * bundle.css, que deben seguir ganando a igual especificidad). Antes vivian
   * como @import al tope de bundle.css; insertar aqui mantiene ese orden.
   *
   * FOUC: la promesa resuelve en onload del <link>, asi el router no pinta la
   * vista hasta tener su CSS (mismo patron que con los <script>).
   */
  _loadCss(href, opts) {
    const append = !!(opts && opts.append);
    const url = `${href}?v=${APP_LAZY_SCRIPT_VER}`;
    if (this._loadedCss && this._loadedCss.has(url)) return this._loadedCss.get(url);
    if (!this._loadedCss) this._loadedCss = new Map();
    const promise = new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      // onload/onerror: no bloqueamos la vista si el CSS falla (degradado > pantalla en blanco).
      link.onload = () => resolve();
      link.onerror = () => { this._loadedCss.delete(url); resolve(); };
      const bundleLink = document.querySelector('link[rel="stylesheet"][href*="css/bundle.css"]');
      if (append) {
        // append: el modulo gana sobre bundle.css (sus reglas van al final del head).
        // Lo usa developer.css en /dev/*: sus overrides genericos (.btn/.app-header)
        // deben ganar igual que cuando era @import dentro del bundle.
        document.head.appendChild(link);
      } else if (bundleLink && bundleLink.parentNode) {
        // default: antes de bundle.css (preserva cascada modulo-antes-de-reglas-propias).
        bundleLink.parentNode.insertBefore(link, bundleLink);
      } else {
        document.head.appendChild(link);
      }
    });
    this._loadedCss.set(url, promise);
    return promise;
  }

  _lazy(globalName, deps, cssHrefs) {
    const self = this;
    return async function() {
      // CSS (si lo hay) y JS en paralelo: la red baja ambos a la vez; await junta.
      // cssHrefs: string '/css/...' o { href, append } (append => gana sobre bundle).
      const cssPromise = (cssHrefs && cssHrefs.length)
        ? Promise.all(cssHrefs.map((h) => (typeof h === 'string' ? self._loadCss(h) : self._loadCss(h.href, h))))
        : null;
      if (deps && deps.length) await self._loadScripts(deps);
      if (cssPromise) await cssPromise;
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

      // Rutas públicas no cargan el bundle de Navigation (lazy-nav lo difiere
      // hasta que el usuario pase el auth check). Sin Navigation, nadie llama
      // updateBodyLayout, así que body se queda sin clase y #app-container
      // mantiene su padding-top:45px por defecto — banda negra fantasma arriba
      // del hero en /login. Aplicamos no-nav antes del primer paint para
      // evitarlo. En rutas auth, Navigation.render() reemplaza esta clase
      // por has-sidebar/has-header-only con su propio reset.
      const PUBLIC_FIRST_PAINT = new Set(['/', '/login', '/signin', '/cambiar-contrasena', '/demo']);
      if (window.SECRET_SIGNUP) {
        PUBLIC_FIRST_PAINT.add(window.SECRET_SIGNUP.base);
        PUBLIC_FIRST_PAINT.add(window.SECRET_SIGNUP.continue);
      }
      const initialPath = window.location.pathname || '/';
      if (PUBLIC_FIRST_PAINT.has(initialPath)) {
        document.body.classList.add('no-nav');
      }

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

    // input-registry y los mixins de marca usan window.ColorPickerModal
    // (compartido desde 2026-05-12). Cargar antes que input-registry.
    const inputDeps = ['/js/utils/brand-colors.js', '/js/components/ColorPickerModal.js', '/js/flags-data.js', '/js/input-registry.js'];
    // developer.css (351KB) ya NO esta en el bundle global: se carga por ruta aqui.
    // append:true => va al final del <head> para que sus overrides genericos
    // (.btn/.app-header) ganen sobre bundle.css en /dev/* (como cuando era @import).
    const DEV_CSS = [{ href: '/css/modules/developer.css', append: true }];
    const devBase = ['/js/views/DevBaseView.js'];
    const devInput = ['/js/views/DevBaseView.js', '/js/flags-data.js', '/js/components/ColorPickerModal.js', '/js/input-registry.js'];

    // ── Raíz: redirige a /home si hay sesión, a /login si no. Login es la landing. ──
    const rootRedirectView = class extends (window.BaseView || class {}) {
      async render() {
        const c = document.getElementById('app-container');
        if (c) c.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo...</p></div>';
        const isAuth = window.router && typeof window.router.checkAuthentication === 'function'
          ? await window.router.checkAuthentication()
          : false;
        const target = isAuth
          ? (typeof window.router.getAuthenticatedRedirect === 'function' ? await window.router.getAuthenticatedRedirect() : '/home')
          : '/login';
        if (window.router) window.router.navigate(target, true);
      }
    };
    r.register('/', rootRedirectView, pub);

    // ── Públicas (cargadas sincrónicamente) ──
    r.register('/login', window.SignInView, pub);
    r.register('/signin', window.SignInView, pub);

    // ── /demo: signup anónimo + redirect a IGNIS en modo read-only ──
    // Los RLS bloquean writes y data sensible para JWT.is_anonymous=true.
    r.register('/demo', window.DemoEntryView, pub);

    // ── Sign up secreto (self-service) ──
    // El "secreto" es la URL: ruta NO enlazada en ningún sitio. Para ROTAR el
    // acceso basta cambiar SIGNUP_SECRET_SLUG (los enlaces viejos dejan de
    // funcionar). El usuario crea su propia cuenta + organización (queda owner).
    // base = wizard; continue = destino del enlace de confirmación del email.
    const SIGNUP_SECRET_SLUG = 'onyx-7h3k9p';
    window.SECRET_SIGNUP = {
      slug: SIGNUP_SECRET_SLUG,
      base: `/registro/${SIGNUP_SECRET_SLUG}`,
      continue: `/registro/${SIGNUP_SECRET_SLUG}/continuar`,
    };
    const SIGNUP_CSS = [{ href: '/css/modules/secret-signup.css', append: true }];
    r.register(window.SECRET_SIGNUP.base, this._lazy('SecretSignupView', ['/js/views/SecretSignupView.js'], SIGNUP_CSS), pub);
    r.register(window.SECRET_SIGNUP.continue, this._lazy('SecretSignupContinueView', ['/js/views/SecretSignupContinueView.js'], SIGNUP_CSS), pub);

    // ── Públicas (lazy) ──
    r.register('/cambiar-contrasena', this._lazy('CambiarContrasenaView', ['/js/views/CambiarContrasenaView.js']), pub);
    // /verification: usuario aún no ha verificado su correo (pública — viene de
    // login con EMAIL_NOT_VERIFIED). /creation_process: ya verificó pero no
    // tiene org/role asignado (auth — espera al aprovisionamiento del workspace).
    r.register('/verification', this._lazy('VerificationView', ['/js/views/VerificationView.js']), pub);
    r.register('/creation_process', this._lazy('CreationProcessView', ['/js/views/CreationProcessView.js']), auth);
    // Privacidad/Términos/Eliminación de datos migradas a la landing aismartcontent.io.
    // Los redirects 301 viven en netlify.toml; no se registran rutas SPA para evitar
    // que el router las intercepte y ejecute el redirect en el servidor.

    // ── Redirect legacy home/hogar a organización o settings ──
    const redirectToDefaultOrg = async () => {
      const auth = window.authService;
      let userId = auth?.getCurrentUser()?.id;
      if (!userId && window.supabase) {
        const { data: { user } } = await window.supabase.auth.getUser();
        userId = user?.id;
      }
      let url = '/home';
      if (userId) {
        if (auth && typeof auth.getDefaultUserRoute === 'function') {
          url = await auth.getDefaultUserRoute(userId);
        } else if (window.router && typeof window.router._getDefaultUserRouteFallback === 'function') {
          url = await window.router._getDefaultUserRouteFallback(userId);
        }
      }
      if (window.router) window.router.navigate(url, true);
    };
    // Mismo patrón que rootRedirectView (/): toda la lógica vive en render().
    // El override anterior tenía onEnter() pero el router solo llama render(),
    // así que el redirect nunca corría y la página se quedaba en "Redirigiendo...".
    const redirectToDefaultView = class extends (window.BaseView || class {}) {
      async render() {
        const c = document.getElementById('app-container');
        if (c) c.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo...</p></div>';
        await redirectToDefaultOrg();
      }
    };

    r.register('/home', redirectToDefaultView, auth);
    r.register('/hogar', redirectToDefaultView, auth);

    // ── Org: Dashboard ──
    // El god-class fue dividido en core + 4 mixins (uno por tab). Los mixins
    // aplican Object.assign sobre DashboardView.prototype al cargarse, así que
    // deben ir DESPUÉS de DashboardView.js. El orden secuencial está garantizado
    // por _loadScripts (await por cada src).
    const dashboardLoader = this._lazy('DashboardView', [
      '/js/components/AudienceMap.js',
      '/js/views/DashboardView.js',
      '/js/views/dashboard/MyBrands.mixin.js',
      '/js/views/dashboard/Competence.mixin.js',
      '/js/views/dashboard/Tendencies.mixin.js',
      '/js/views/dashboard/Strategy.mixin.js',
    ], ['/css/modules/insight.css']);
    r.register('/org/:orgIdShort/:orgNameSlug/dashboard', dashboardLoader, auth);
    r.register('/dashboard', dashboardLoader, auth);

    // ── Org: Production ──
    const productionLoader = this._lazy('ProductionView', ['/js/views/ProductionView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/production', productionLoader, auth);
    r.register('/production', productionLoader, auth);

    // ── Org: Monitoring (centro de monitoreo: perfiles + sensores + url watchers) ──
    // insight.css + monitoring.css route-split (clases .mb-/.insight-/.dash- namespaced, verificado SEGURO).
    const monitoringLoader = this._lazy('MonitoringView', ['/js/views/MonitoringView.js'], ['/css/modules/insight.css', '/css/modules/monitoring.css']);
    r.register('/org/:orgIdShort/:orgNameSlug/monitoring', monitoringLoader, auth);
    r.register('/monitoring', monitoringLoader, auth);

    // ── Org: Tasks (registrar pronto para que /org/.../tasks coincida con prioridad) ──
    const tasksLoader = this._lazy('TasksView', ['/js/views/TasksView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/tasks', tasksLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/tasks/:taskId', tasksLoader, auth);
    r.register('/tasks', tasksLoader, auth);
    r.register('/tasks/:taskId', tasksLoader, auth);

    // ── Org: Execution History (sesiones de produccion manual reabribles) ──
    const execHistoryLoader = this._lazy('ExecutionHistoryView', ['/js/views/ExecutionHistoryView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/execution-history', execHistoryLoader, auth);
    r.register('/execution-history', execHistoryLoader, auth);

    // ── Deps compartidas de marca: mixins que aplican sobre BrandstorageView
    // y/o BrandOrganizationView según cuál esté definido al cargar.
    // Typography, Uploads y ColorEditor son idénticos entre ambas vistas.
    // InfoPanel difiere (sub-marca vs organización) → cada vista tiene el suyo.
    const brandSharedDeps = [
      '/js/utils/brand-colors.js',
      '/js/components/ColorPickerModal.js',
      '/js/config/brand-schema.js'
    ];
    const brandSharedMixins = [
      '/js/views/brand-mixins/Typography.mixin.js',
      '/js/views/brand-mixins/Uploads.mixin.js',
      '/js/views/brand-mixins/ColorEditor.mixin.js'
    ];

    // ── Org: Marca organizacional (sin galería Brand Storage) ──
    // El InfoPanel de sub-marca se comparte con BrandstorageView: cuando el
    // workspace tiene 1 sola sub-marca, la card INFO abre el mismo panel.
    const brandViewLoader = this._lazy('BrandOrganizationView', [
      ...brandSharedDeps,
      '/js/views/BrandOrganizationView.js',
      ...brandSharedMixins,
      '/js/views/brandstorage/InfoPanel.mixin.js'
    ]);
    r.register('/org/:orgIdShort/:orgNameSlug/brand', brandViewLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/brand/:brandId', brandViewLoader, auth);
    r.register('/brands', brandViewLoader, auth);
    r.register('/brands/:brandId', brandViewLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/brand-organization', brandViewLoader, auth);
    r.register('/brand-organization', brandViewLoader, auth);

    // ── Org: Brand Storage — DESACTIVADO temporalmente durante la demo. ──
    // Las conexiones de plataformas se hacen desde Identidad (brand-organization)
    // via el panel INFO. Redirigimos brand-storage -> brand-organization.
    // Para REACTIVAR: descomentar el loader + sus 3 r.register, y borrar el redirect.
    // const brandStorageViewLoader = this._lazy('BrandstorageView', [
    //   ...brandSharedDeps,
    //   '/js/views/BrandstorageView.js',
    //   ...brandSharedMixins,
    //   '/js/views/brandstorage/InfoPanel.mixin.js'
    // ]);
    // r.register('/org/:orgIdShort/:orgNameSlug/brand-storage', brandStorageViewLoader, auth);
    // r.register('/brand-storage', brandStorageViewLoader, auth);
    // r.register('/brandstorage', brandStorageViewLoader, auth);
    const redirectBrandStorageToBrand = class extends (window.BaseView || class {}) {
      async onEnter() {
        if (!window.router) return;
        const p = this.routeParams || {};
        const target = (p.orgIdShort && p.orgNameSlug)
          ? `/org/${p.orgIdShort}/${p.orgNameSlug}/brand`
          : '/brand-organization';
        window.router.navigate(target, true);
      }
      async render() {
        const c = document.getElementById('app-container');
        if (c) c.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo...</p></div>';
      }
    };
    r.register('/org/:orgIdShort/:orgNameSlug/brand-storage', redirectBrandStorageToBrand, auth);
    r.register('/brand-storage', redirectBrandStorageToBrand, auth);
    r.register('/brandstorage', redirectBrandStorageToBrand, auth);

    // El mixin Canvas debe ir DESPUÉS de CommandCenterView.js (extiende su prototype).
    // command-center.css (108KB) sale del bundle global y se carga solo aqui:
    // sus clases .cc-* estan namespaced y verificadas sin colision con modulos globales.
    const commandCenterLoader = this._lazy('CommandCenterView', ['/js/views/CommandCenterView.js', '/js/views/commandcenter/Canvas.mixin.js', '/js/views/commandcenter/CanvasStore.js'], ['/css/modules/command-center.css']);
    // Canónico: shortId del brand_container + slug del nombre (mismo patrón que /org/...).
    // El shortId garantiza unicidad incluso si dos sub-marcas comparten nombre.
    r.register('/org/:orgIdShort/:orgNameSlug/command-center/:subBrandShortId/:subBrandSlug', commandCenterLoader, auth);
    r.register('/command-center/:subBrandShortId/:subBrandSlug', commandCenterLoader, auth);
    // Legacy: slug-only. Resuelve por slug (primer match) para compatibilidad con bookmarks.
    r.register('/org/:orgIdShort/:orgNameSlug/command-center/:subBrandSlug', commandCenterLoader, auth);
    r.register('/command-center/:subBrandSlug', commandCenterLoader, auth);

    // OAuth callback para integraciones OAuth propias (Google/Facebook)
    r.register(
      '/brand-integration-callback',
      this._lazy('BrandIntegrationCallbackView', ['/js/views/BrandIntegrationCallbackView.js']),
      pub
    );

    // ── Org: Product detail — :entityId reemplaza al antiguo :brandId ──
    const productsLoader = this._lazy('ProductsView', ['/js/products.js', '/js/views/ProductsView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/product-detail/:entityId/:productId', productsLoader, auth);
    r.register('/product-detail/:entityId/:productId', productsLoader, auth);

    // ── Org: Productos (listado masonry) ──
    const productsListLoader = this._lazy('ProductsListView', ['/js/views/ProductsListView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/products', productsListLoader, auth);
    r.register('/products', productsListLoader, auth);

    // ── Org: Servicios (grid de cards) ──
    const servicesLoader = this._lazy('ServicesView', ['/js/views/ServicesView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/services', servicesLoader, auth);
    r.register('/services', servicesLoader, auth);

    // ── Org: Escenarios / Sets (listado masonry) ──
    const placesListLoader = this._lazy('PlacesView', ['/js/views/PlacesView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/places', placesListLoader, auth);
    r.register('/places', placesListLoader, auth);

    // ── Org: Personajes / Characters (listado masonry) ──
    const charactersListLoader = this._lazy('CharactersView', ['/js/views/CharactersView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/characters', charactersListLoader, auth);
    r.register('/characters', charactersListLoader, auth);

    // ── Legacy: /identities → /products (bookmarks viejos) ──
    const redirectIdentitiesToProducts = class extends (window.BaseView || class {}) {
      async onEnter() {
        if (!window.router) return;
        const p = this.routeParams || {};
        const target = (p.orgIdShort && p.orgNameSlug)
          ? `/org/${p.orgIdShort}/${p.orgNameSlug}/products`
          : '/products';
        window.router.navigate(target, true);
      }
      async render() {
        const c = document.getElementById('app-container');
        if (c) c.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo...</p></div>';
      }
    };
    r.register('/org/:orgIdShort/:orgNameSlug/identities', redirectIdentitiesToProducts, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/identities/:entityId', redirectIdentitiesToProducts, auth);
    r.register('/identities', redirectIdentitiesToProducts, auth);
    r.register('/identities/:entityId', redirectIdentitiesToProducts, auth);

    // ── Org: Studio ──
    const studioLoader = this._lazy('StudioView', [...inputDeps, '/js/services/FlowWebhookService.js', '/js/products.js', '/js/views/StudioView.js']);
    const catalogLoader = this._lazy('FlowCatalogView', ['/js/views/FlowCatalogView.js']);
    // 'saved' (My Flows) ANTES de :categoryId para que el literal gane al param.
    r.register('/org/:orgIdShort/:orgNameSlug/studio/flows/saved', catalogLoader, auth);
    r.register('/studio/flows/saved', catalogLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/studio/flows/sub/:subcategoryId', catalogLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/studio/flows/:categoryId', catalogLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/studio/flows', catalogLoader, auth);
    r.register('/studio/flows/sub/:subcategoryId', catalogLoader, auth);
    r.register('/studio/flows/:categoryId', catalogLoader, auth);
    r.register('/studio/flows', catalogLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/studio/catalog/sub/:subcategoryId', catalogLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/studio/catalog/:categoryId', catalogLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/studio/catalog', catalogLoader, auth);
    r.register('/studio/catalog/sub/:subcategoryId', catalogLoader, auth);
    r.register('/studio/catalog/:categoryId', catalogLoader, auth);
    r.register('/studio/catalog', catalogLoader, auth);

    r.register('/org/:orgIdShort/:orgNameSlug/studio', studioLoader, auth);
    r.register('/studio', studioLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/studio/:flowSlug', studioLoader, auth);
    r.register('/studio/:flowSlug', studioLoader, auth);

    // ── Org: Vera (chat) ──
    const veraLoader = this._lazy('VeraView', ['/js/views/VeraView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/vera', veraLoader, auth);
    r.register('/vera', veraLoader, auth);

    // ── Org: Video (Kling 3.0 / KIE) ──
    const videoLoader = this._lazy('VideoView', ['/js/views/VideoView.js']);
    r.register('/org/:orgIdShort/:orgNameSlug/video', videoLoader, auth);
    r.register('/video', videoLoader, auth);

    // ── Créditos (tienda de créditos — paquetes desde Supabase) ──
    const creditsLoader = this._lazy('CreditsShopView', ['/js/views/CreditsShopView.js']);
    r.register('/credits', creditsLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/credits', creditsLoader, auth);

    // ── Planes (comparativa 5 tiers + plan actual) ──
    const planesLoader = this._lazy('PlanesView', ['/js/views/PlanesView.js']);
    r.register('/plans', planesLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/plans', planesLoader, auth);

    // ── Cancel flow (1-click compliant: FTC click-to-cancel + CA law) ──
    const cancelLoader = this._lazy('CancelSubscriptionView', ['/js/views/CancelSubscriptionView.js']);
    r.register('/plans/cancel', cancelLoader, auth);
    r.register('/org/:orgIdShort/:orgNameSlug/plans/cancel', cancelLoader, auth);

    // ── Org: Organization ──
    r.register('/org/:orgIdShort/:orgNameSlug/organization', this._lazy('OrganizationView', ['/js/views/OrganizationView.js']), auth);

    // ── Create ──
    r.register('/create', this._lazy('CreateView', ['/js/views/CreateView.js']), auth);

    // ── Dev: Portal PaaS ──
    r.register('/dev/dashboard', this._lazy('DevDashboardView', [...devBase, '/js/views/DevDashboardView.js'], DEV_CSS), auth);
    const devFlowsLoader = this._lazy('DevFlowsView', [...devBase, '/js/views/DevFlowsView.js'], DEV_CSS);
    r.register('/dev/flows', devFlowsLoader, auth);
    r.register('/dev/flows/:flowId', devFlowsLoader, auth);
    r.register('/dev/logs', this._lazy('DevLogsView', [...devBase, '/js/views/DevLogsView.js'], DEV_CSS), auth);
    const devBuilderLoader = this._lazy('DevBuilderView', [...devInput, '/js/services/FlowWebhookService.js', '/js/views/DevBuilderView.js', '/js/views/builder/BuilderInputs.js', '/js/views/builder/BuilderModules.js', '/js/views/builder/BuilderPersistence.js', '/js/views/builder/BuilderProductivity.js', '/js/views/builder/BuilderAdvanced.js', '/js/views/builder/BuilderGraph.js', '/js/views/builder/BuilderEnterprise.js'], DEV_CSS);
    r.register('/dev/builder', devBuilderLoader, auth);
    r.register('/dev/builder/:flowId', devBuilderLoader, auth);
    const devTestLoader = this._lazy('DevTestView', [...devInput, '/js/services/FlowWebhookService.js', '/js/views/DevTestView.js'], DEV_CSS);
    r.register('/dev/test', devTestLoader, auth);
    r.register('/dev/test/:flowId', devTestLoader, auth);
    r.register('/dev/webhooks', this._lazy('DevWebhooksView', [...devBase, '/js/services/FlowWebhookService.js', '/js/views/DevWebhooksView.js'], DEV_CSS), auth);
    r.register('/dev/web-vitals', this._lazy('DevWebVitalsView', [...devBase, '/js/views/DevWebVitalsView.js'], DEV_CSS), auth);

    // ── Dev Lead ──
    r.register('/dev/provisioning/users', this._lazy('DevLeadUserProvisioningView', [...devBase, '/js/views/DevLeadUserProvisioningView.js'], DEV_CSS), auth);
    r.register('/dev/provisioning/create-org', this._lazy('DevLeadCreateOrgView', [...devBase, '/js/views/DevLeadCreateOrgView.js'], DEV_CSS), auth);
    r.register('/dev/lead/team', this._lazy('DevLeadTeamView', [...devBase, '/js/views/DevLeadTeamView.js'], DEV_CSS), auth);
    r.register('/dev/lead/consumers', this._lazy('DevLeadConsumersView', [...devBase, '/js/views/DevLeadConsumersView.js'], DEV_CSS), auth);
    r.register('/dev/lead/orgs', this._lazy('DevLeadOrgsView', [...devBase, '/js/views/DevLeadOrgsView.js'], DEV_CSS), auth);
    r.register('/dev/lead/categories', this._lazy('DevLeadCategoriesView', [...devBase, '/js/views/DevLeadCategoriesView.js'], DEV_CSS), auth);
    r.register('/dev/lead/input-schemas', this._lazy('DevLeadInputSchemasView', [...devBase, '/js/views/DevLeadInputSchemasView.js'], DEV_CSS), auth);
    // "Entrenamiento" (LLM): vista unificada con pestañas Entrenar + Conocimientos.
    const veraTrainingLoader = this._lazy('DevLeadVeraTrainingView', [...devBase, '/js/views/DevLeadVeraTrainingView.js'], DEV_CSS);
    r.register('/dev/lead/vera-training', veraTrainingLoader, auth);
    r.register('/dev/lead/lexicon', this._lazy('DevLeadLexiconView', [...devBase, '/js/views/DevLeadLexiconView.js'], DEV_CSS), auth);
    r.register('/dev/lead/billing', this._lazy('DevLeadBillingView', [...devBase, '/js/views/DevLeadBillingView.js'], DEV_CSS), auth);

    // ── 404 ──
    // El 404 de la plataforma vive en la landing (aismartcontent.io/404).
    // Usamos location.replace para reemplazar el entry en history y que
    // el botón "atrás" no devuelva al usuario a la URL rota.
    const BV = window.BaseView || class {};
    r.register('/404', class extends BV {
      async render() {
        window.location.replace('https://aismartcontent.io/404');
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
            color: #1a1a1a;
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
