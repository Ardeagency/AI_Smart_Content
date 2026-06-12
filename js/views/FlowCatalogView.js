/**
 * FlowCatalogView - Feed inteligente de producción creativa.
 * Dos experiencias: HOME (Feed principal) y VIEW POR CATEGORÍA (Contextual Feed).
 */
class FlowCatalogView extends BaseView {
  static cacheable = true;
  static get documentTitle() { return __('Flujos'); }

  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.flows = [];
    this.flowsById = new Map();
    this.categories = [];
    this.subcategories = [];
    this.likedFlowIds = new Set();   // ids con like del user actual (user_flow_likes)
    this.savedFlowIds = new Set();   // ids guardados por la org activa (org_flow_saves)
    this.recentRunFlowIds = [];
    this.selectedCategoryId = null; // null = home, uuid = category view
    this.selectedSubcategoryId = null; // vista por content_subcategories (schema 254-261)
    this.subcategoriesInCategory = []; // subcategories that appear in flows of selected category
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }
    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
    if (!this.organizationId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/create';
      window.router?.navigate(url, true);
      return;
    }
    localStorage.setItem('selectedOrganizationId', this.organizationId);
    if (document && document.body) {
      document.body.classList.add('route-flows');
    }
    // My Flows = vista de guardados (org_flow_saves). Robusto: literal en path o
    // el param :categoryId resuelto a 'saved' si el router cayo en esa ruta.
    this.savedView = /\/studio\/flows\/saved(\/|\?|$)/.test(window.location.pathname || '')
      || this.routeParams?.categoryId === 'saved';
    this.selectedSubcategoryId = this.savedView ? null : (this.routeParams?.subcategoryId || null);
    this.selectedCategoryId = this.savedView ? null : (this.routeParams?.categoryId || null);
    // Estado de la toolbar (Fase 3): busqueda + orden + filtros del home.
    this.searchQuery = '';
    this.sortMode = 'trending';
    this.filterOutput = '';
    this.filterExec = '';
  }

  getStudioPath() {
    if (!this.organizationId) return '/studio';
    const prefix = typeof window.getOrgPathPrefix === 'function' ? window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') : '';
    return prefix ? `${prefix}/studio` : '/studio';
  }

  /** Slug para URL a partir del nombre del flujo (ej: "Product Render Futurista" → "product-render-futurista"). */
  flowNameToSlug(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  getCatalogPath(categoryId) {
    const base = this.getCatalogBasePath();
    return categoryId ? `${base}/${categoryId}` : base;
  }

  getCatalogBasePath() {
    if (!this.organizationId) return '/studio/flows';
    const prefix = typeof window.getOrgPathPrefix === 'function' ? window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') : '';
    return prefix ? `${prefix}/studio/flows` : '/studio/flows';
  }

  /** Ruta para vista por subcategoría (content_subcategories). */
  getCatalogPathForSubcategory(subcategoryId) {
    const base = this.getCatalogBasePath();
    return subcategoryId ? `${base}/sub/${subcategoryId}` : base;
  }

  /** Convierte nombre de categoría en slug para URL (ej: "Posts" → "posts"). */
  categoryNameToSlug(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /** Indica si el valor parece un UUID (categoryId desde URL). */
  isUuid(value) {
    if (!value || typeof value !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  /**
   * Resuelve el slug de la URL (ej. "posts", "stories") al UUID de content_categories.
   * Usa category_id/subcategory_id del schema para filtrar correctamente por categoría.
   * Acepta: coincidencia exacta, singular/plural (post↔posts) y slug que empiece por el segmento (stories ↔ stories-estados).
   */
  resolveCategoryIdFromSlug(slug) {
    if (!slug || typeof slug !== 'string' || !this.categories.length) return null;
    const s = slug.trim().toLowerCase();
    // 1) Coincidencia exacta con slug del nombre
    let cat = this.categories.find(c => this.categoryNameToSlug(c.name) === s);
    if (cat) return cat.id;
    // 2) Slug compuesto: "stories" coincide con "stories-estados", "ads" con "anuncios-ads"
    cat = this.categories.find(c => {
      const catSlug = this.categoryNameToSlug(c.name);
      return catSlug === s || catSlug.startsWith(s + '-') || s.startsWith(catSlug + '-');
    });
    if (cat) return cat.id;
    // 3) Singular/plural: "posts" ↔ "post", "reels" ↔ "reel"
    cat = this.categories.find(c => {
      const catSlug = this.categoryNameToSlug(c.name);
      if (catSlug === s) return true;
      if (s.endsWith('s') && catSlug === s.slice(0, -1)) return true; // posts → post
      if (catSlug.endsWith('s') && catSlug.slice(0, -1) === s) return true; // post → posts
      return false;
    });
    if (cat) return cat.id;
    return null;
  }

  renderHTML() {
    if (this.savedView) {
      return `
      <div class="flow-catalog flow-catalog--saved" id="flowCatalogContainer">
        <div class="flow-catalog-loading" id="flowCatalogLoading" aria-hidden="true">
          <div class="flow-skeleton-section">
            <div class="flow-skeleton-title"></div>
            <div class="flow-skeleton-row">
              ${Array.from({ length: 6 }).map(() => '<div class="flow-skeleton-card"></div>').join('')}
            </div>
          </div>
        </div>
        <div class="flow-catalog-content" id="flowCatalogContent" style="display: none;">
          <header class="flow-catalog-saved-header">
            <h1 class="flow-catalog-saved-title">My Flows</h1>
            <p class="flow-catalog-saved-sub">Tus flujos guardados. Toca el icono de guardar en cualquier flujo del catalogo para tenerlo aqui a la mano.</p>
          </header>
          <section class="flow-catalog-row-section flow-catalog-row-section--unframed">
            <div class="flow-catalog-saved-grid" id="savedFlowsGrid"></div>
          </section>
        </div>
      </div>`;
    }
    const isCategoryView = !!(this.selectedCategoryId || this.selectedSubcategoryId);
    return `
      <div class="flow-catalog" id="flowCatalogContainer">
        <div class="flow-catalog-loading" id="flowCatalogLoading" aria-hidden="true">
          <div class="flow-skeleton-hero"></div>
          ${[0, 1].map(() => `
          <div class="flow-skeleton-section">
            <div class="flow-skeleton-title"></div>
            <div class="flow-skeleton-row">
              ${Array.from({ length: 6 }).map(() => '<div class="flow-skeleton-card"></div>').join('')}
            </div>
          </div>`).join('')}
        </div>
        <div class="flow-catalog-content" id="flowCatalogContent" style="display: none;">
          <!-- HERO: carrusel full-bleed por categoría, auto-avance, sin flechas -->
          <section class="flow-catalog-hero-section" id="flowCatalogHeroSection">
            <div class="flow-catalog-hero-track" id="flowCatalogHeroTrack"></div>
          </section>

          ${!isCategoryView ? `
          <!-- Toolbar marketplace: buscar + orden + filtros (sticky) -->
          <div class="flow-catalog-toolbar" id="flowCatalogToolbar">
            <div class="flow-toolbar-search">
              <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
              <input type="search" id="flowSearchInput" placeholder="${__('Buscar flows...')}" autocomplete="off" aria-label="${__('Buscar flows')}">
              <button type="button" class="flow-search-clear" id="flowSearchClear" style="display:none" aria-label="${__('Limpiar busqueda')}"><i class="fas fa-xmark"></i></button>
            </div>
            <div class="flow-toolbar-controls">
              <select id="flowSortSelect" class="flow-toolbar-select" aria-label="${__('Ordenar')}">
                <option value="trending">${__('Trending')}</option>
                <option value="new">${__('Nuevos')}</option>
                <option value="used">${__('Mas usados')}</option>
                <option value="az">A-Z</option>
              </select>
              <select id="flowFilterOutput" class="flow-toolbar-select" aria-label="${__('Tipo de salida')}">
                <option value="">${__('Todo tipo')}</option>
                <option value="image">${__('Imagen')}</option>
                <option value="video">Video</option>
                <option value="text">${__('Texto')}</option>
                <option value="audio">Audio</option>
                <option value="document">${__('Documento')}</option>
                <option value="mixed">${__('Mixto')}</option>
              </select>
              <select id="flowFilterExec" class="flow-toolbar-select" aria-label="${__('Modo de ejecucion')}">
                <option value="">${__('Todo modo')}</option>
                <option value="single_step">${__('Un paso')}</option>
                <option value="multi_step">${__('Multi paso')}</option>
                <option value="sequential">${__('Secuencial')}</option>
              </select>
            </div>
          </div>

          <!-- Rails de personalizacion (Fase 5): Top 10, Porque usaste X,
               Recomendados para ti. Se rellenan en renderPersonalRails(). -->
          <div class="flow-catalog-rails" id="flowCatalogRails"></div>

          <!-- Catálogo completo: cada categoría se renderiza como su propio
               bloque con header (no hace falta un título paraguas tipo
               "All Flows" — las categorías ya hacen ese trabajo). -->
          <section class="flow-catalog-row-section flow-catalog-row-section--unframed" id="sectionAllFlows" style="display: none;">
            <div class="flow-catalog-gallery-by-category-sub" id="galleryAllByCategorySub"></div>
          </section>

          <!-- Resultados de busqueda/filtro (grid plana). Oculta en browse. -->
          <section class="flow-catalog-results" id="flowCatalogResults" style="display:none">
            <div class="flow-catalog-results-head"><span id="flowResultsCount"></span></div>
            <div class="flow-catalog-results-grid" id="flowResultsGrid"></div>
          </section>
          ` : `
          <!-- VIEW CATEGORÍA: header (sustituye al hero del home) -->
          <header class="flow-catalog-category-header" id="flowCatalogCategoryHeader"></header>

          <!-- Cuerpo: galería (izquierda) + subnav vertical tipo sidebar (derecha) -->
          <div class="flow-catalog-category-body">
            <div class="flow-catalog-category-main">
              <!-- Últimos en esta categoría -->
              <section class="flow-catalog-row-section" id="sectionRecentCategory">
                <h2 class="flow-catalog-row-title">Continuar</h2>
                <div class="flow-catalog-row-scroll" id="rowRecentCategory"></div>
              </section>
              <!-- Galería por subcategoría -->
              <div class="flow-catalog-gallery-by-sub" id="galleryBySub"></div>
            </div>
            <nav class="flow-catalog-subnav-side" id="subcategoriesStrip" aria-label="Subcategorias"></nav>
          </div>
          `}
        </div>
      </div>
    `;
  }

  async init() {
    await this.initSupabase();
    if (!this.supabase) {
      this.showContentError();
      return;
    }
    await Promise.all([
      this.loadCategories(),
      this.loadSubcategories()
    ]);
    if (this.selectedSubcategoryId) {
      this.selectedCategoryId = null;
    } else if (this.selectedCategoryId && !this.isUuid(this.selectedCategoryId)) {
      const resolved = this.resolveCategoryIdFromSlug(this.selectedCategoryId);
      this.selectedCategoryId = resolved;
    }
    await this.loadFlows();
    this.enrichFlowsWithCategories();
    if (this.userId) {
      await Promise.all([
        this.loadLikesAndSaves(),
        this.loadRecentRuns()
      ]);
    }
    if (this.selectedCategoryId) {
      this.computeSubcategoriesInCategory();
    } else if (this.selectedSubcategoryId) {
      const sub = this.subcategories.find(s => s.id === this.selectedSubcategoryId);
      this.subcategoriesInCategory = sub ? [sub] : [];
    }

    document.getElementById('flowCatalogLoading').style.display = 'none';
    document.getElementById('flowCatalogContent').style.display = 'block';

    if (this.savedView) {
      // My Flows: solo render del grid de guardados (sin hero ni categorias).
      this.renderSavedFlows();
      return;
    }

    this.renderHero();
    if (this.selectedCategoryId || this.selectedSubcategoryId) {
      this.renderCategoryHeader();
      this.renderSubcategoriesStrip();
      this.renderRecentInCategory();
      this.renderGalleryBySubcategory();
    } else {
      this.renderPersonalRails();
      this.renderSectionAllFlows();
      this.bindToolbar();
      this.moveToolbarToHeader();
    }

    // Empty states: cada vista los maneja inline en el área donde irían los
    // flujos. renderSectionAllFlows en home y renderGalleryBySubcategory en
    // categoría — ambos inyectan .flow-catalog-empty--in-section cuando no
    // hay rows que mostrar.

    // Deep-link: ?flow=<id> abre el modal de detalle si el flow esta cargado.
    const deepFlowId = new URLSearchParams(window.location.search).get('flow');
    if (deepFlowId && this.getFlowById(deepFlowId)) this.openFlowDetail(deepFlowId);

    this._setupLive();
  }

  /* Datos en vivo: realtime sobre el catalogo (content_flows), likes y saves
     colaborativos y runs recientes, mas polling de respaldo. Solo re-pinta los
     grids del modo actual (sin tocar hero/toolbar) y solo si algo cambio.
     Teardown automatico en destroy() (que llama super.destroy()). */
  _setupLive() {
    if (!this.supabase || this._liveReady) return;
    this._liveReady = true;

    const reload = async () => {
      window.apiClient?.invalidate?.((k) => k.startsWith('flow:flows:'));
      if (this.userId) {
        window.apiClient?.invalidate?.(`flow:likes:${this.userId}`);
        window.apiClient?.invalidate?.(`flow:recent_runs:${this.userId}`);
      }
      if (this.organizationId) window.apiClient?.invalidate?.(`flow:saves:${this.organizationId}`);
      await this.loadFlows();
      this.enrichFlowsWithCategories();
      if (this.userId) await Promise.all([this.loadLikesAndSaves(), this.loadRecentRuns()]);
      return {
        flows: this.flows,
        liked: this.likedFlowIds ? [...this.likedFlowIds] : [],
        saved: this.savedFlowIds ? [...this.savedFlowIds] : [],
        recent: this.recentRunFlowIds || [],
      };
    };

    this._liveTick = () => this.liveRefresh('catalog', reload, () => this._rerenderFlowGrids());

    // Sembrar firma con el estado ya pintado para que el 1er tick no re-pinte de mas.
    if (!this._liveSig) this._liveSig = {};
    this._liveSig['catalog'] = this._dataSignature({
      flows: this.flows,
      liked: this.likedFlowIds ? [...this.likedFlowIds] : [],
      saved: this.savedFlowIds ? [...this.savedFlowIds] : [],
      recent: this.recentRunFlowIds || [],
    });

    const specs = [
      { name: 'cf', table: 'content_flows', onChange: () => this._liveTick() }, // catalogo global
    ];
    if (this.userId) {
      specs.push({ name: 'likes', table: 'user_flow_likes', filter: `user_id=eq.${this.userId}`, onChange: () => this._liveTick() });
      specs.push({ name: 'runs',  table: 'flow_runs',       filter: `user_id=eq.${this.userId}`, onChange: () => this._liveTick() });
    }
    if (this.organizationId) {
      specs.push({ name: 'saves', table: 'org_flow_saves', filter: `organization_id=eq.${this.organizationId}`, onChange: () => this._liveTick() });
    }
    this.liveSubscribe(specs);
    this.startLivePoll(60000, () => this._liveTick());
  }

  /* Re-pinta solo los grids del modo actual (espejo de init sin hero/toolbar/
     deep-link). No toca menus ni el carrusel. */
  _rerenderFlowGrids() {
    if (this.savedView) { this.renderSavedFlows(); return; }
    if (this.selectedCategoryId || this.selectedSubcategoryId) {
      this.renderRecentInCategory();
      this.renderGalleryBySubcategory();
    } else {
      this.renderPersonalRails();
      this.renderSectionAllFlows();
    }
  }

  showContentError() {
    const loading = document.getElementById('flowCatalogLoading');
    const content = document.getElementById('flowCatalogContent');
    if (loading) loading.innerHTML = `<p>${__('No se pudo conectar. Revisa tu sesión.')}</p>`;
    if (content) content.style.display = 'block';
  }

  async initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('FlowCatalog initSupabase:', e);
    }
  }

  async loadCategories() {
    if (!this.supabase) return;
    try {
      // Config global, cambia rarísimo. Cache 10 min + SWR.
      const fetcher = async () => {
        const { data, error } = await this.supabase
          .from('content_categories')
          .select('id, name, description, order_index, cover_url, cover_type, cover_storage_path, is_visible')
          .eq('is_visible', true)
          .order('order_index', { ascending: true, nullsFirst: false })
          .order('name');
        return !error && data ? data : [];
      };
      const list = window.apiClient
        ? await window.apiClient.query('flow:categories', fetcher, { ttl: 10 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this.categories = (list || []).filter((c) => c.is_visible !== false);
    } catch (e) {
      console.error('FlowCatalog loadCategories:', e);
      this.categories = [];
    }
  }

  async loadSubcategories() {
    if (!this.supabase) return;
    try {
      const fetcher = async () => {
        // Embed many-to-many: content_subcategory_categories es el junction
        // que define qué subcategorías aplican a cada categoría. Cargamos
        // los category_ids junto a cada subcategoría para que el strip de
        // chips no dependa de que haya flows asignados.
        const { data, error } = await this.supabase
          .from('content_subcategories')
          .select('id, name, description, order_index, content_subcategory_categories(category_id)')
          .order('order_index', { ascending: true, nullsFirst: false })
          .order('name');
        if (error || !data) return [];
        return data.map(s => ({
          ...s,
          category_ids: (s.content_subcategory_categories || []).map(j => j.category_id)
        }));
      };
      this.subcategories = window.apiClient
        ? await window.apiClient.query('flow:subcategories', fetcher, { ttl: 10 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('FlowCatalog loadSubcategories:', e);
      this.subcategories = [];
    }
  }

  /**
   * Carga flujos del catálogo. Solo flujos publicados y con "mostrar en catálogo" activado.
   * Filtra por category_id o subcategory_id según la vista activa.
   */
  async loadFlows() {
    if (!this.supabase) return;
    try {
      // Cache key incluye los filtros activos para distinguir vistas (home vs categoría/sub).
      const filterKey = this.selectedSubcategoryId ? `sub:${this.selectedSubcategoryId}` : (this.selectedCategoryId ? `cat:${this.selectedCategoryId}` : 'home');
      const fetcher = async () => {
        let q = this.supabase
          .from('content_flows')
          .select('id, name, description, token_cost, output_type, flow_image_url, category_id, subcategory_id, flow_category_type, likes_count, saves_count, run_count, created_at, status, version, execution_mode')
          .eq('is_active', true)
          .eq('status', 'published')
          .eq('show_in_catalog', true)
          .neq('flow_category_type', 'system');
        if (this.selectedSubcategoryId) q = q.eq('subcategory_id', this.selectedSubcategoryId);
        else if (this.selectedCategoryId) q = q.eq('category_id', this.selectedCategoryId);
        const { data, error } = await q.order('created_at', { ascending: false });
        return !error && data ? data : [];
      };
      const flows = window.apiClient
        ? await window.apiClient.query(`flow:flows:${filterKey}`, fetcher, { ttl: 2 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this.flows = flows || [];
      this.flowsById = new Map(this.flows.map(f => [f.id, f]));
    } catch (e) {
      console.error('FlowCatalog loadFlows:', e);
      this.flows = [];
      this.flowsById = new Map();
    }
  }

  async loadLikesAndSaves() {
    this.likedFlowIds = new Set();
    this.savedFlowIds = new Set();
    if (!this.supabase) return;
    try {
      const likesFetcher = async () => {
        if (!this.userId) return [];
        const { data, error } = await this.supabase
          .from('user_flow_likes')
          .select('flow_id')
          .eq('user_id', this.userId);
        return !error && data ? data : [];
      };
      const savesFetcher = async () => {
        if (!this.organizationId) return [];
        const { data, error } = await this.supabase
          .from('org_flow_saves')
          .select('flow_id')
          .eq('organization_id', this.organizationId);
        return !error && data ? data : [];
      };
      const [likes, saves] = await Promise.all([
        window.apiClient
          ? window.apiClient.query(`flow:likes:${this.userId}`, likesFetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
          : likesFetcher(),
        window.apiClient
          ? window.apiClient.query(`flow:saves:${this.organizationId}`, savesFetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
          : savesFetcher()
      ]);
      (likes || []).forEach(r => r.flow_id && this.likedFlowIds.add(r.flow_id));
      (saves || []).forEach(r => r.flow_id && this.savedFlowIds.add(r.flow_id));
    } catch (e) {
      console.error('FlowCatalog loadLikesAndSaves:', e);
    }
  }

  async loadRecentRuns() {
    this.recentRunFlowIds = [];
    if (!this.supabase || !this.userId) return;
    try {
      const fetcher = async () => {
        const { data, error } = await this.supabase
          .from('flow_runs')
          .select('flow_id')
          .eq('user_id', this.userId)
          .order('created_at', { ascending: false })
          .limit(50);
        return !error && data ? data : [];
      };
      const data = window.apiClient
        ? await window.apiClient.query(`flow:recent_runs:${this.userId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      if (data) {
        const seen = new Set();
        data.forEach(r => {
          if (r.flow_id && !seen.has(r.flow_id)) {
            seen.add(r.flow_id);
            this.recentRunFlowIds.push(r.flow_id);
          }
        });
      }
    } catch (e) {
      console.error('FlowCatalog loadRecentRuns:', e);
    }
  }

  enrichFlowsWithCategories() {
    this.flows.forEach(f => {
      const cat = f.category_id && this.categories.length ? this.categories.find(c => c.id === f.category_id) : null;
      const sub = f.subcategory_id && this.subcategories.length ? this.subcategories.find(s => s.id === f.subcategory_id) : null;
      f._categoryName = cat ? cat.name : null;
      f._subcategoryName = sub ? sub.name : null;
    });
  }

  computeSubcategoriesInCategory() {
    // Las subcategorías aplicables a esta categoría vienen del junction
    // content_subcategory_categories (embebido en loadSubcategories como
    // sub.category_ids). NO derivamos de los flows existentes — eso fallaba
    // cuando una categoría aún no tenía flows publicados con subcategoría.
    if (!this.selectedCategoryId) {
      this.subcategoriesInCategory = [];
      return;
    }
    this.subcategoriesInCategory = this.subcategories.filter(s =>
      (s.category_ids || []).includes(this.selectedCategoryId)
    );
  }

  getPublishedFlows() {
    const published = this.flows.filter(f => f.status === 'published');
    return published.length > 0 ? published : this.flows;
  }

  /**
   * Categorías para el carrusel hero: usamos content_categories con cover.
   * Solo se usa en home (sin categoría/subcategoría seleccionada).
   */
  getHeroCategories() {
    if (!this.categories || this.categories.length === 0) return [];
    const withOrder = this.categories.map(c => ({
      ...c,
      _order: c.order_index != null ? c.order_index : 999
    }));
    return withOrder
      .sort((a, b) => a._order - b._order || a.name.localeCompare(b.name));
  }

  getRecentInCategoryFlows() {
    return this.recentRunFlowIds
      .map(id => this.flowsById.get(id))
      .filter(f => {
        if (!f) return false;
        if (this.selectedSubcategoryId) return f.subcategory_id === this.selectedSubcategoryId;
        return f.category_id === this.selectedCategoryId;
      });
  }

  getFlowsBySubcategory() {
    const bySub = new Map();
    const withoutSub = [];
    this.flows.forEach(f => {
      if (!f.subcategory_id) {
        withoutSub.push(f);
        return;
      }
      if (!bySub.has(f.subcategory_id)) {
        const sub = this.subcategories.find(s => s.id === f.subcategory_id);
        if (sub) bySub.set(f.subcategory_id, { sub, flows: [] });
      }
      const entry = bySub.get(f.subcategory_id);
      if (entry) entry.flows.push(f);
    });
    this.subcategoriesInCategory.forEach(s => {
      if (!bySub.has(s.id)) bySub.set(s.id, { sub: s, flows: [] });
    });
    const sortFlows = (arr) => arr.sort((a, b) =>
      (b.run_count || 0) + (b.likes_count || 0) - (a.run_count || 0) - (a.likes_count || 0)
    );
    const result = Array.from(bySub.values()).map(({ sub, flows }) => ({
      sub,
      flows: sortFlows(flows)
    }));
    // Bucket especial: flows con category_id pero sin subcategory_id (común
    // cuando una categoría aún no tiene subcategorías clasificadas).
    // Se renderiza como row sin título — el category header ya etiqueta.
    if (withoutSub.length > 0) {
      result.push({
        sub: { id: null, name: '' },
        flows: sortFlows(withoutSub)
      });
    }
    return result;
  }

  /**
   * En home (Todos): agrupa todos los flujos por categoría (content_categories) y luego por subcategoría (content_subcategories).
   * Misma estructura que el catálogo por categoría: categoría → filas por subcategoría.
   */
  getFlowsByCategoryAndSubcategory() {
    const result = [];
    const categoryOrder = [...this.categories].sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999) || (a.name || '').localeCompare(b.name || ''));
    for (const cat of categoryOrder) {
      const flowsInCat = this.flows.filter(f => f.category_id === cat.id);
      if (flowsInCat.length === 0) continue;
      const bySub = new Map();
      const withoutSub = [];
      flowsInCat.forEach(f => {
        if (!f.subcategory_id) {
          withoutSub.push(f);
          return;
        }
        if (!bySub.has(f.subcategory_id)) {
          const sub = this.subcategories.find(s => s.id === f.subcategory_id);
          bySub.set(f.subcategory_id, { sub: sub || { id: f.subcategory_id, name: 'Sin nombre' }, flows: [] });
        }
        bySub.get(f.subcategory_id).flows.push(f);
      });
      const subOrder = [...this.subcategories].sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999) || (a.name || '').localeCompare(b.name || ''));
      const rows = [];
      subOrder.forEach(sub => {
        if (!bySub.has(sub.id)) return;
        const { flows } = bySub.get(sub.id);
        if (flows.length === 0) return;
        rows.push({
          subcategory: sub,
          flows: flows.sort((a, b) => (b.run_count || 0) + (b.likes_count || 0) - (a.run_count || 0) - (a.likes_count || 0))
        });
      });
      bySub.forEach((entry, id) => {
        if (subOrder.some(s => s.id === id)) return;
        rows.push({
          subcategory: entry.sub,
          flows: entry.flows.sort((a, b) => (b.run_count || 0) + (b.likes_count || 0) - (a.run_count || 0) - (a.likes_count || 0))
        });
      });
      if (withoutSub.length > 0) {
        rows.push({
          subcategory: { id: null, name: '' },
          flows: withoutSub.sort((a, b) => (b.run_count || 0) + (b.likes_count || 0) - (a.run_count || 0) - (a.likes_count || 0))
        });
      }
      result.push({ category: cat, rows });
    }
    const uncategorized = this.flows.filter(f => !f.category_id);
    if (uncategorized.length > 0) {
      result.push({
        category: { id: null, name: 'Sin categoría' },
        rows: [{ subcategory: { id: null, name: '' }, flows: uncategorized }]
      });
    }
    return result;
  }

  isNew(flow) {
    if (!flow.created_at) return false;
    const days = (Date.now() - new Date(flow.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }

  isTrending(flow) {
    const published = this.getPublishedFlows();
    const sorted = [...published].sort((a, b) =>
      (b.run_count || 0) + (b.likes_count || 0) + (b.saves_count || 0) -
      (a.run_count || 0) - (a.likes_count || 0) - (a.saves_count || 0)
    );
    const top = sorted.slice(0, Math.max(5, Math.ceil(published.length * 0.2)));
    return top.some(f => f.id === flow.id);
  }

  // Popular = uso absoluto alto. Umbral fijo: prueba social honesta sin schema nuevo.
  isPopular(flow) {
    return (flow.run_count || 0) >= 50;
  }

  // 1234 -> "1.2k", 1200000 -> "1.2M". Sin decimal redundante (.0).
  formatCount(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(v);
  }

  getOutputTypeIcon(type) {
    const t = (type || 'text').toLowerCase();
    if (t === 'video') return 'fa-video';
    if (t === 'image' || t === 'imagen') return 'fa-image';
    if (t === 'audio') return 'fa-music';
    if (t === 'document') return 'fa-file-alt';
    if (t === 'mixed') return 'fa-layer-group';
    return 'fa-align-left';
  }

  getOutputTypeLabel(type) {
    const t = (type || 'text').toLowerCase();
    const labels = { text: __('Texto'), image: __('Imagen'), video: 'Video', audio: 'Audio', document: __('Documento'), mixed: __('Mixto') };
    return labels[t] || t;
  }

  getExecutionModeLabel(mode) {
    const m = (mode || 'single_step').toLowerCase();
    const labels = { single_step: __('Un paso'), multi_step: __('Multi paso'), sequential: __('Secuencial') };
    return labels[m] || m;
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  renderFlowCard(flow, options = {}) {
    const name = this.escapeHtml(flow.name);
    const cost = flow.token_cost ?? 1;
    const isLiked = this.likedFlowIds.has(flow.id);
    const isSaved = this.savedFlowIds.has(flow.id);

    const badges = [];
    if (this.isNew(flow)) badges.push('<span class="flow-card-badge flow-card-badge--new">Nuevo</span>');
    // Trending (top engagement) tiene prioridad sobre Popular (uso absoluto) para no apilar dos badges de prueba social.
    if (this.isTrending(flow)) badges.push('<span class="flow-card-badge flow-card-badge--trending">Trending</span>');
    else if (this.isPopular(flow)) badges.push('<span class="flow-card-badge flow-card-badge--popular">Popular</span>');
    const t = flow.flow_category_type || 'manual';
    const isAutopilotLike = (t === 'autopilot');
    if (isAutopilotLike) badges.push('<span class="flow-card-badge flow-card-badge--auto">Autopilot</span>');
    // Video: NO autoplay — se reproduce solo en hover (preview Netflix + mejor
    // rendimiento con muchas cards). El play/pause lo maneja bindFlowCardListeners.
    const img = flow.flow_image_url
      ? (/\.(mp4|webm|mov)(\?|$)/i.test(flow.flow_image_url)
          ? `<video src="${this.escapeHtml(flow.flow_image_url)}" class="flow-card-img" muted loop playsinline preload="metadata" aria-hidden="true"></video>`
          : `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-card-img" loading="lazy">`)
      : `<div class="flow-card-placeholder"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i></div>`;

    const primaryTag = flow._subcategoryName || flow._categoryName || null;
    const primaryTagHtml = primaryTag ? `<span class="flow-card-info-tag">${this.escapeHtml(primaryTag)}</span>` : '';
    const outputTypeLabel = this.getOutputTypeLabel(flow.output_type);
    const executionLabel = this.getExecutionModeLabel(flow.execution_mode);
    const version = (flow.version || '1.0.0').toString();
    const runs = flow.run_count || 0;
    const usesHtml = runs > 0
      ? `<span class="flow-card-info-uses" title="Ejecuciones"><i class="fas fa-play"></i>${this.formatCount(runs)} usos</span>`
      : '';

    return `
      <article class="flow-card flow-card--catalog" data-flow-id="${flow.id}" role="button" tabindex="0">
        <div class="flow-card-media">
          ${img}
          <div class="flow-card-gradient" aria-hidden="true"></div>
          <div class="flow-card-badges">${badges.join('')}</div>
          <div class="flow-card-actions">
            <button type="button" class="flow-card-icon-btn flow-card-icon-run" data-action="run" title="Ejecutar" aria-label="Ejecutar"><i class="fas fa-play"></i></button>
            <button type="button" class="flow-card-icon-btn flow-card-icon-like ${isLiked ? 'is-active' : ''}" data-action="like" title="Like" aria-label="Like"><i class="fas fa-heart"></i></button>
            <button type="button" class="flow-card-icon-btn flow-card-icon-save ${isSaved ? 'is-active' : ''}" data-action="save" title="${__('Guardar')}" aria-label="${__('Guardar')}"><i class="fas fa-bookmark"></i></button>
          </div>
          <div class="flow-card-info">
            <h3 class="flow-card-title">${name}</h3>
            <div class="flow-card-info-meta">
              ${primaryTagHtml}
              ${usesHtml}
              <span class="flow-card-info-credits" title="Creditos por ejecucion"><i class="fas fa-bolt"></i>${cost}</span>
            </div>
            <div class="flow-card-info-extra">
              <span class="flow-card-info-pill">${outputTypeLabel}</span>
              <span class="flow-card-info-pill">${executionLabel}</span>
              <span class="flow-card-info-pill">v${version}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Slide de hero: portada de categoría a pantalla completa, degradado abajo, minimalista.
   */
  renderHeroSlide(category, index = 0) {
    const name = this.escapeHtml(category.name);
    const desc = category.description ? this.escapeHtml(category.description.slice(0, 160)) + (category.description.length > 160 ? '…' : '') : '';
    const coverUrl = category.cover_url || '';
    const isVideo = (category.cover_type || '').toLowerCase() === 'video';
    const bg = coverUrl
      ? (isVideo
          ? `<video class="flow-hero-slide-bg-media flow-hero-slide-video" src="${this.escapeHtml(coverUrl)}" muted loop playsinline preload="metadata" aria-hidden="true"></video>`
          : `<img src="${this.escapeHtml(coverUrl)}" alt="" class="flow-hero-slide-bg-media" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">`)
      : `<div class="flow-hero-slide-placeholder"><i class="fas fa-layer-group"></i></div>`;
    return `
      <div class="flow-hero-slide" data-category-id="${this.escapeHtml(category.id)}" data-slide-index="${index}">
        <div class="flow-hero-slide-bg">${bg}</div>
        <div class="flow-hero-slide-overlay">
          <div class="flow-hero-slide-content">
            <span class="flow-hero-slide-eyebrow">${__('Categoría destacada')}</span>
            <h2 class="flow-hero-slide-title">${name}</h2>
            ${desc ? `<p class="flow-hero-slide-desc">${desc}</p>` : ''}
            <span class="flow-hero-slide-cta">
              <i class="fas fa-play"></i>
              <span>${__('Explorar flujos')}</span>
            </span>
          </div>
        </div>
      </div>
    `;
  }

  renderHero() {
    const onHome = !this.selectedCategoryId && !this.selectedSubcategoryId;
    const list = onHome ? this.getHeroCategories() : [];
    const section = document.getElementById('flowCatalogHeroSection');
    const track = document.getElementById('flowCatalogHeroTrack');
    if (!section || !track) return;
    this.clearHeroTimers();
    if (list.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    track.innerHTML = list.map((c, i) => this.renderHeroSlide(c, i)).join('');

    // Dots de paginación con progress bar del slide activo (Netflix style)
    let dotsContainer = section.querySelector('.flow-catalog-hero-dots');
    if (!dotsContainer) {
      dotsContainer = document.createElement('div');
      dotsContainer.className = 'flow-catalog-hero-dots';
      section.appendChild(dotsContainer);
    }
    if (list.length > 1) {
      dotsContainer.style.display = '';
      dotsContainer.innerHTML = list.map((_, i) => `
        <button type="button" class="flow-catalog-hero-dot" data-slide-index="${i}" aria-label="Ir al slide ${i + 1}">
          <span class="flow-catalog-hero-dot-fill"></span>
        </button>
      `).join('');
    } else {
      dotsContainer.style.display = 'none';
    }

    // Navegación slide → categoría
    track.querySelectorAll('.flow-hero-slide').forEach(el => {
      const categoryId = el.dataset.categoryId;
      if (!categoryId) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const path = this.getCatalogPath(categoryId);
        if (window.router) window.router.navigate(path);
        else window.location.href = path;
      });
    });

    // Click en dot → scroll al slide correspondiente
    dotsContainer.querySelectorAll('.flow-catalog-hero-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(dot.dataset.slideIndex, 10);
        track.scrollTo({ left: idx * track.offsetWidth, behavior: 'smooth' });
      });
    });

    const HERO_DURATION_MS = 8000;
    const setActiveDot = (idx) => {
      dotsContainer.querySelectorAll('.flow-catalog-hero-dot').forEach((d, i) => {
        d.classList.toggle('is-active', i === idx);
        const fill = d.querySelector('.flow-catalog-hero-dot-fill');
        if (!fill) return;
        if (i === idx) {
          fill.style.animation = 'none';
          // force reflow para reiniciar la animación
          void fill.offsetWidth;
          fill.style.animation = `flowHeroDotFill ${HERO_DURATION_MS}ms linear forwards`;
        } else {
          fill.style.animation = 'none';
        }
      });
    };

    // Slide activo (visible) → play video del activo, pausa los demás, sync dots
    this.heroActiveIndex = 0;
    const slides = Array.from(track.querySelectorAll('.flow-hero-slide'));
    const syncActiveFromScroll = () => {
      const idx = Math.round(track.scrollLeft / track.offsetWidth);
      if (idx === this.heroActiveIndex) return;
      this.heroActiveIndex = idx;
      slides.forEach((s, i) => {
        s.classList.toggle('is-active', i === idx);
        const video = s.querySelector('.flow-hero-slide-video');
        if (!video) return;
        if (i === idx) video.play().catch(() => {});
        else { video.pause(); try { video.currentTime = 0; } catch {} }
      });
      setActiveDot(idx);
    };
    track.addEventListener('scroll', () => {
      if (this.heroScrollDebounce) clearTimeout(this.heroScrollDebounce);
      this.heroScrollDebounce = setTimeout(syncActiveFromScroll, 80);
    });

    // Activar el primero al cargar
    slides[0]?.classList.add('is-active');
    const firstVideo = slides[0]?.querySelector('.flow-hero-slide-video');
    if (firstVideo) firstVideo.play().catch(() => {});
    setActiveDot(0);

    // Auto-advance Netflix style: 8s. Pausa en hover.
    if (list.length > 1) {
      const advance = () => {
        const maxScroll = track.scrollWidth - track.offsetWidth;
        if (maxScroll <= 0) return;
        const next = track.scrollLeft + track.offsetWidth;
        track.scrollTo({ left: next > maxScroll ? 0 : next, behavior: 'smooth' });
      };
      this.heroAutoAdvanceTimer = setInterval(advance, HERO_DURATION_MS);
      section.addEventListener('mouseenter', () => {
        if (this.heroAutoAdvanceTimer) {
          clearInterval(this.heroAutoAdvanceTimer);
          this.heroAutoAdvanceTimer = null;
        }
        const activeFill = dotsContainer.querySelector('.flow-catalog-hero-dot.is-active .flow-catalog-hero-dot-fill');
        if (activeFill) activeFill.style.animationPlayState = 'paused';
      });
      section.addEventListener('mouseleave', () => {
        if (!this.heroAutoAdvanceTimer) {
          this.heroAutoAdvanceTimer = setInterval(advance, HERO_DURATION_MS);
        }
        const activeFill = dotsContainer.querySelector('.flow-catalog-hero-dot.is-active .flow-catalog-hero-dot-fill');
        if (activeFill) activeFill.style.animationPlayState = 'running';
      });
    }
  }

  /**
   * Header de la vista categoría/subcategoría: nombre + descripción + cover
   * sutil. Sustituye al hero del home cuando estamos navegando dentro de una
   * categoría — antes la página quedaba en blanco si la categoría no tenía
   * flujos.
   */
  renderCategoryHeader() {
    const header = document.getElementById('flowCatalogCategoryHeader');
    if (!header) return;
    let entity = null;
    if (this.selectedSubcategoryId) {
      entity = this.subcategories.find(s => s.id === this.selectedSubcategoryId);
    } else if (this.selectedCategoryId) {
      entity = this.categories.find(c => c.id === this.selectedCategoryId);
    }
    if (!entity) {
      header.style.display = 'none';
      return;
    }
    const name = this.escapeHtml(entity.name || '');
    const desc = entity.description
      ? this.escapeHtml(entity.description.slice(0, 200)) + (entity.description.length > 200 ? '…' : '')
      : '';
    const coverUrl = entity.cover_url || '';
    const isVideo = (entity.cover_type || '').toLowerCase() === 'video';
    const cover = coverUrl
      ? (isVideo
          ? `<video class="flow-catalog-category-header-media" src="${this.escapeHtml(coverUrl)}" muted loop playsinline preload="metadata" autoplay aria-hidden="true"></video>`
          : `<img src="${this.escapeHtml(coverUrl)}" alt="" class="flow-catalog-category-header-media" loading="eager" decoding="async">`)
      : '';
    const totalFlows = (this.flows || []).length;
    const countLabel = totalFlows > 0
      ? `${totalFlows} flujo${totalFlows !== 1 ? 's' : ''}`
      : '';
    header.style.display = '';
    header.innerHTML = `
      <div class="flow-catalog-category-header-bg">${cover}</div>
      <div class="flow-catalog-category-header-content">
        <span class="flow-catalog-category-header-eyebrow">${this.selectedSubcategoryId ? 'Subcategoría' : 'Categoría'}</span>
        <h1 class="flow-catalog-category-header-title">${name}</h1>
        ${desc ? `<p class="flow-catalog-category-header-desc">${desc}</p>` : ''}
        ${countLabel ? `<span class="flow-catalog-category-header-count">${countLabel}</span>` : ''}
      </div>
    `;
  }

  clearHeroTimers() {
    if (this.heroAutoAdvanceTimer) {
      clearInterval(this.heroAutoAdvanceTimer);
      this.heroAutoAdvanceTimer = null;
    }
    if (this.heroScrollDebounce) {
      clearTimeout(this.heroScrollDebounce);
      this.heroScrollDebounce = null;
    }
    // Timers de carrusel por-card (limpia los que quedaron si la card murio en hover).
    if (this._cardCarouselTimers && this._cardCarouselTimers.length) {
      this._cardCarouselTimers.forEach(t => clearInterval(t));
      this._cardCarouselTimers = [];
    }
  }

  async onLeave() {
    this.clearHeroTimers();
    this.closeFlowDetail();
    this.clearToolbarFromHeader();
    if (document && document.body) {
      document.body.classList.remove('route-flows');
    }
  }

  // Red de seguridad: si alguien llama destroy() directo (sin pasar por
  // router.onLeave), los timers siguen activos. Limpiamos aquí también
  // además del cleanup que hereda de BaseView.
  destroy() {
    this.clearHeroTimers();
    this.closeFlowDetail();
    this.clearToolbarFromHeader();
    if (typeof super.destroy === 'function') super.destroy();
  }

  renderSubcategoriesStrip() {
    const strip = document.getElementById('subcategoriesStrip');
    if (!strip) return;
    if (!this.subcategoriesInCategory.length) {
      strip.style.display = 'none';
      return;
    }
    strip.style.display = '';
    const activeSubFromUrl = new URLSearchParams(window.location.search).get('sub');
    const chips = [
      { id: '', name: __('Todos'), isAll: true },
      ...this.subcategoriesInCategory.map(s => ({ id: s.id, name: s.name }))
    ];
    strip.innerHTML = chips.map(chip => `
      <button type="button"
        class="flow-catalog-subnav-item${(activeSubFromUrl ? chip.id === activeSubFromUrl : chip.isAll) ? ' active' : ''}"
        data-subcategory-id="${this.escapeHtml(chip.id)}">
        ${this.escapeHtml(chip.name)}
      </button>
    `).join('');
    const applyFilter = (subId) => {
      const gallery = document.getElementById('galleryBySub');
      if (!gallery) return;
      const rows = gallery.querySelectorAll('.flow-catalog-sub-row');
      let visibleCount = 0;
      rows.forEach(row => {
        const rowSubId = row.dataset.subcategoryId;
        const show = !subId || rowSubId === subId;
        row.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });
      // Empty inline cuando el filtro deja 0 rows visibles (típico cuando
      // la subcategoría está en el junction pero ningún flow la tiene
      // asignada todavía).
      let emptyEl = gallery.querySelector('.flow-catalog-empty--filtered');
      if (subId && visibleCount === 0) {
        if (!emptyEl) {
          emptyEl = document.createElement('div');
          emptyEl.className = 'flow-catalog-empty flow-catalog-empty--in-section flow-catalog-empty--filtered';
          emptyEl.setAttribute('aria-live', 'polite');
          emptyEl.innerHTML = `<p class="flow-catalog-empty-text">${__('Aún no hay flujos de esta técnica')}</p>`;
          gallery.appendChild(emptyEl);
        }
        emptyEl.style.display = '';
      } else if (emptyEl) {
        emptyEl.style.display = 'none';
      }
    };
    const updateUrl = (subId) => {
      const url = new URL(window.location.href);
      if (subId) url.searchParams.set('sub', subId);
      else url.searchParams.delete('sub');
      window.history.replaceState({}, '', url);
    };
    strip.querySelectorAll('[data-subcategory-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const subId = btn.getAttribute('data-subcategory-id');
        applyFilter(subId);
        updateUrl(subId);
        strip.querySelectorAll('.flow-catalog-subnav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    // El filtro inicial vía URL se aplica en renderGalleryBySubcategory()
    // porque ese método es el que crea las rows que vamos a filtrar.
  }

  renderRow(containerId, flows, emptyMessage) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!flows || flows.length === 0) {
      el.closest('.flow-catalog-row-section').style.display = 'none';
      return;
    }
    el.closest('.flow-catalog-row-section').style.display = '';
    el.innerHTML = flows.map(f => this.renderFlowCard(f)).join('');
    this.bindFlowCardListeners(el);
  }

  /**
   * Sección Todos los flujos: mismo catálogo por categoría y subcategoría, o "Próximamente" si no hay flujos.
   */
  /** My Flows: grid de los flujos guardados por la org (org_flow_saves). */
  renderSavedFlows() {
    const grid = document.getElementById('savedFlowsGrid');
    if (!grid) return;
    const saved = this.flows.filter(f => this.savedFlowIds.has(f.id));
    if (!saved.length) {
      grid.innerHTML = `
        <div class="flow-catalog-empty flow-catalog-empty--teach" aria-live="polite">
          <i class="fas fa-bookmark flow-catalog-empty-icon" aria-hidden="true"></i>
          <p class="flow-catalog-empty-title">Aun no has guardado flujos</p>
          <p class="flow-catalog-empty-sub">Explora el catalogo y toca el icono de guardar en los flujos que mas uses. Apareceran aqui para acceso rapido.</p>
        </div>`;
      return;
    }
    grid.innerHTML = saved.map(f => this.renderFlowCard(f)).join('');
    this.bindFlowCardListeners(grid);
  }

  renderSectionAllFlows() {
    const section = document.getElementById('sectionAllFlows');
    const gallery = document.getElementById('galleryAllByCategorySub');
    if (!section || !gallery) return;
    const data = this.getFlowsByCategoryAndSubcategory();
    section.style.display = '';
    if (data.length === 0) {
      gallery.innerHTML = `
        <div class="flow-catalog-empty flow-catalog-empty--teach" aria-live="polite">
          <i class="fas fa-wand-magic-sparkles flow-catalog-empty-icon" aria-hidden="true"></i>
          <p class="flow-catalog-empty-title">Tu catalogo de flows esta por encenderse</p>
          <p class="flow-catalog-empty-sub">${__('Los flows son recetas listas para producir contenido de tu marca: posts, historias, piezas de campaña. En cuanto se publiquen, apareceran aqui organizados por categoria.')}</p>
        </div>`;
      return;
    }
    gallery.innerHTML = data.map(({ category, rows }) => `
      <div class="flow-catalog-category-block" data-category-id="${this.escapeHtml(category?.id || '')}">
        <h3 class="flow-catalog-category-block-title">${this.escapeHtml(category?.name || '')}</h3>
        ${rows.map(({ subcategory, flows }) => `
          <section class="flow-catalog-sub-row flow-catalog-row-section">
            ${subcategory?.name ? `<h4 class="flow-catalog-row-title">${this.escapeHtml(subcategory.name)}</h4>` : ''}
            <div class="flow-catalog-row-scroll">${flows.map(f => this.renderFlowCard(f)).join('')}</div>
          </section>
        `).join('')}
      </div>
    `).join('');
    this.bindFlowCardListeners(gallery);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FEAT-035 Fase 3 — toolbar marketplace (buscar + orden + filtros)
  // ─────────────────────────────────────────────────────────────────────────

  bindToolbar() {
    const input = document.getElementById('flowSearchInput');
    const clearBtn = document.getElementById('flowSearchClear');
    const sortSel = document.getElementById('flowSortSelect');
    const outSel = document.getElementById('flowFilterOutput');
    const execSel = document.getElementById('flowFilterExec');
    if (input) {
      input.addEventListener('input', () => {
        this.searchQuery = input.value;
        if (clearBtn) clearBtn.style.display = input.value ? '' : 'none';
        clearTimeout(this._searchDebounce);
        this._searchDebounce = setTimeout(() => this.updateCatalogView(), 160);
      });
    }
    clearBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      if (input) input.value = '';
      clearBtn.style.display = 'none';
      this.updateCatalogView();
      input?.focus();
    });
    sortSel?.addEventListener('change', () => { this.sortMode = sortSel.value; this.updateCatalogView(); });
    outSel?.addEventListener('change', () => { this.filterOutput = outSel.value; this.updateCatalogView(); });
    execSel?.addEventListener('change', () => { this.filterExec = execSel.value; this.updateCatalogView(); });
  }

  // Mueve la toolbar a la segunda fila del header principal (mismo slot que
  // Production) para ahorrar espacio. Retry breve por la race con Navigation.render.
  moveToolbarToHeader(attempts = 0) {
    const toolbar = document.getElementById('flowCatalogToolbar');
    if (!toolbar) return;
    const slot = document.getElementById('headerProductionSlot');
    if (!slot) {
      if (attempts < 20) this._toolbarMoveTimer = setTimeout(() => this.moveToolbarToHeader(attempts + 1), 50);
      return;
    }
    slot.innerHTML = '';
    slot.appendChild(toolbar);
    slot.setAttribute('aria-hidden', 'false');
    // Reusa la MISMA clase que Production: hereda el crecimiento del header a
    // dos filas (flex-direction column + height auto). Sin esto la barra se
    // desbordaba porque .app-header tiene height fijo.
    document.body.classList.add('production-filters-in-header');
  }

  clearToolbarFromHeader() {
    if (this._toolbarMoveTimer) { clearTimeout(this._toolbarMoveTimer); this._toolbarMoveTimer = null; }
    const slot = document.getElementById('headerProductionSlot');
    if (slot) { slot.innerHTML = ''; slot.setAttribute('aria-hidden', 'true'); }
    document.body.classList.remove('production-filters-in-header');
  }

  // Hay busqueda/filtro/orden activo → modo resultados (grid plana).
  isToolbarActive() {
    return !!((this.searchQuery || '').trim() || this.filterOutput || this.filterExec || this.sortMode !== 'trending');
  }

  getFilteredSortedFlows() {
    const q = (this.searchQuery || '').trim().toLowerCase();
    let list = (this.flows || []).slice();
    if (q) list = list.filter(f => (f.name || '').toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q));
    if (this.filterOutput) list = list.filter(f => (f.output_type || '').toLowerCase() === this.filterOutput);
    if (this.filterExec) list = list.filter(f => (f.execution_mode || '').toLowerCase() === this.filterExec);
    const score = f => (f.run_count || 0) + (f.likes_count || 0) + (f.saves_count || 0);
    switch (this.sortMode) {
      case 'new': list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)); break;
      case 'used': list.sort((a, b) => (b.run_count || 0) - (a.run_count || 0)); break;
      case 'az': list.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      default: list.sort((a, b) => score(b) - score(a)); // trending
    }
    return list;
  }

  updateCatalogView() {
    const hero = document.getElementById('flowCatalogHeroSection');
    const browse = document.getElementById('sectionAllFlows');
    const rails = document.getElementById('flowCatalogRails');
    const results = document.getElementById('flowCatalogResults');
    if (!results) return;
    if (this.isToolbarActive()) {
      if (hero) hero.style.display = 'none';
      if (browse) browse.style.display = 'none';
      if (rails) rails.style.display = 'none';
      results.style.display = '';
      this.renderResults();
    } else {
      if (hero) hero.style.display = '';
      if (browse) browse.style.display = '';
      if (rails) rails.style.display = '';
      results.style.display = 'none';
    }
  }

  renderResults() {
    const grid = document.getElementById('flowResultsGrid');
    const count = document.getElementById('flowResultsCount');
    if (!grid) return;
    const list = this.getFilteredSortedFlows();
    if (count) count.textContent = `${list.length} flow${list.length !== 1 ? 's' : ''}`;
    if (!list.length) {
      grid.innerHTML = `
        <div class="flow-catalog-empty flow-catalog-empty--teach" aria-live="polite">
          <i class="fas fa-magnifying-glass flow-catalog-empty-icon" aria-hidden="true"></i>
          <p class="flow-catalog-empty-title">${__('Sin resultados')}</p>
          <p class="flow-catalog-empty-sub">Prueba con otra busqueda o quita algun filtro.</p>
        </div>`;
      return;
    }
    grid.innerHTML = list.map(f => this.renderFlowCard(f)).join('');
    this.bindFlowCardListeners(grid);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FEAT-035 Fase 5 — rails de personalizacion + descubrimiento (deterministas,
  // sin LLM). Destacado del dia, Hechos para tu marca (afinidad), Novedades,
  // Favoritos de la audiencia, Top 10, rails por subcategoria, Porque usaste X.
  // ─────────────────────────────────────────────────────────────────────────

  _engagementScore(f) {
    return (f.run_count || 0) + (f.likes_count || 0) + (f.saves_count || 0);
  }

  // Seed determinista por dia (YYYYMMDD) → la rotacion cambia 1 vez al dia, no
  // por recarga. Da el efecto "hoy hay algo nuevo" sin aleatoriedad.
  _dailySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  _seededShuffle(arr, seed) {
    const a = arr.slice();
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  getTop10() {
    return (this.flows || []).slice().sort((a, b) => this._engagementScore(b) - this._engagementScore(a)).slice(0, 10);
  }

  // Hechos para tu marca: score de afinidad determinista. Combina lo que TU marca
  // ya uso/guardo/likeo (cat/subcat/output) + desempeño de comunidad + frescura.
  // Mientras mas interactua la marca, mas afina. Sin señales → degrada a popular+nuevo.
  getBrandFitFlows(limit = 12) {
    const flows = this.flows || [];
    if (!flows.length) return [];
    const signalIds = new Set([...this.likedFlowIds, ...this.savedFlowIds, ...(this.recentRunFlowIds || [])]);
    const signalFlows = flows.filter(f => signalIds.has(f.id));
    const cats = new Set(signalFlows.map(f => f.category_id).filter(Boolean));
    const subs = new Set(signalFlows.map(f => f.subcategory_id).filter(Boolean));
    const outs = new Set(signalFlows.map(f => (f.output_type || '').toLowerCase()).filter(Boolean));
    const maxScore = Math.max(1, ...flows.map(f => this._engagementScore(f)));
    const fit = (f) => {
      let aff = 0;
      if (f.subcategory_id && subs.has(f.subcategory_id)) aff += 2;
      if (f.category_id && cats.has(f.category_id)) aff += 1;
      if (outs.has((f.output_type || '').toLowerCase())) aff += 1;
      const community = this._engagementScore(f) / maxScore;
      const fresh = this.isNew(f) ? 0.5 : 0;
      return aff * 2 + community * 1.5 + fresh;
    };
    return flows.slice().sort((a, b) => fit(b) - fit(a)).slice(0, limit);
  }

  // Novedades: creados en los ultimos N dias, mas recientes primero.
  getNewFlows(days = 14, limit = 12) {
    const cutoff = Date.now() - days * 86400000;
    return (this.flows || [])
      .filter(f => f.created_at && new Date(f.created_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  // Favoritos de la audiencia: ranking por likes+saves de la comunidad. Solo los
  // que tienen alguna señal (si todos en 0, el rail se omite).
  getAudienceFavorites(limit = 12) {
    const fav = f => (f.likes_count || 0) + (f.saves_count || 0);
    return (this.flows || []).filter(f => fav(f) > 0).sort((a, b) => fav(b) - fav(a)).slice(0, limit);
  }

  // Destacado del dia: pick rotado por fecha dentro del top de afinidad.
  getDailyFeatured() {
    const pool = this.getBrandFitFlows(8);
    if (!pool.length) return null;
    return pool[this._dailySeed() % pool.length];
  }

  // Rails por subcategoria (estilo Netflix "novelas coreanas"): subcategorias que
  // TIENEN flows, rotando cuales se muestran cada dia. La subcategoria es el estilo
  // visual (Splash Art, Hero Shot, ...). Vacio si ningun flow esta etiquetado.
  getSubcategoryRails(maxRails = 2, perRail = 12) {
    const bySub = new Map();
    (this.flows || []).forEach(f => {
      if (!f.subcategory_id) return;
      if (!bySub.has(f.subcategory_id)) bySub.set(f.subcategory_id, []);
      bySub.get(f.subcategory_id).push(f);
    });
    const subIds = [...bySub.keys()];
    if (!subIds.length) return [];
    return this._seededShuffle(subIds, this._dailySeed())
      .slice(0, maxRails)
      .map(subId => {
        const sub = (this.subcategories || []).find(s => s.id === subId);
        const flows = bySub.get(subId).slice().sort((a, b) => this._engagementScore(b) - this._engagementScore(a));
        return { name: sub?.name || 'Estilo', flows: flows.slice(0, perRail) };
      })
      .filter(r => r.flows.length);
  }

  // "Porque usaste X": semilla = ultimo run; muestra flows afines (misma sub/cat).
  getBecauseYouUsed(limit = 12) {
    const recentId = (this.recentRunFlowIds || [])[0];
    if (!recentId) return null;
    const seed = this.getFlowById(recentId);
    if (!seed) return null;
    const pool = (this.flows || []).filter(f => f.id !== seed.id &&
      (f.subcategory_id === seed.subcategory_id || f.category_id === seed.category_id));
    if (!pool.length) return null;
    pool.sort((a, b) => this._engagementScore(b) - this._engagementScore(a));
    return { seedName: seed.name, flows: pool.slice(0, limit) };
  }

  _railHtml(title, innerHtml) {
    return `
      <section class="flow-catalog-row-section">
        <h2 class="flow-catalog-row-title">${title}</h2>
        <div class="flow-catalog-row-scroll">${innerHtml}</div>
      </section>`;
  }

  renderDailyFeaturedHtml(flow) {
    const name = this.escapeHtml(flow.name);
    const cost = flow.token_cost ?? 1;
    const desc = flow.description
      ? this.escapeHtml(flow.description.slice(0, 150)) + (flow.description.length > 150 ? '…' : '')
      : '';
    const bg = flow.flow_image_url
      ? (/\.(mp4|webm|mov)(\?|$)/i.test(flow.flow_image_url)
          ? `<video src="${this.escapeHtml(flow.flow_image_url)}" class="flow-featured-bg-el" muted loop playsinline autoplay preload="metadata" aria-hidden="true"></video>`
          : `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="" class="flow-featured-bg-el">`)
      : '';
    return `
      <section class="flow-catalog-row-section flow-catalog-featured-section">
        <article class="flow-featured" data-flow-id="${flow.id}" role="button" tabindex="0">
          <div class="flow-featured-bg" aria-hidden="true">${bg}</div>
          <div class="flow-featured-scrim" aria-hidden="true"></div>
          <div class="flow-featured-body">
            <span class="flow-featured-eyebrow">Destacado hoy</span>
            <h2 class="flow-featured-title">${name}</h2>
            ${desc ? `<p class="flow-featured-desc">${desc}</p>` : ''}
            <div class="flow-featured-actions">
              <button type="button" class="flow-featured-cta" data-action="run">
                <i class="fas fa-play" aria-hidden="true"></i><span>${__('Ejecutar')}</span>
                <span class="flow-featured-cost"><i class="fas fa-bolt" aria-hidden="true"></i>${cost}</span>
              </button>
              <button type="button" class="flow-featured-cta flow-featured-cta--ghost" data-action="detail">${__('Ver detalle')}</button>
            </div>
          </div>
        </article>
      </section>`;
  }

  // ── "Continua produciendo": ultimas sesiones de produccion (estilo Record/
  //    ExecutionHistoryView) como primer rail del home, con "Ver todo" → Record.
  getExecPath() {
    if (!this.organizationId) return '/execution-history';
    const prefix = typeof window.getOrgPathPrefix === 'function' ? window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') : '';
    return prefix ? `${prefix}/execution-history` : '/execution-history';
  }

  async _autopilotRunIds() {
    if (!this.supabase) return [];
    try {
      const { data } = await this.supabase.from('runs_inputs').select('run_id').eq('captured_from', 'autopilot_ingest');
      return [...new Set((data || []).map(r => r.run_id).filter(Boolean))];
    } catch (_) { return []; }
  }

  // Sesiones manuales recientes con sus outputs (mismo modelo que Record).
  async loadRecentProductions(limit = 12) {
    if (!this.supabase) return [];
    try {
      const autopilotIds = await this._autopilotRunIds();
      let q = this.supabase.from('flow_runs')
        .select('id, flow_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (this.organizationId) q = q.eq('organization_id', this.organizationId);
      else if (this.userId) q = q.eq('user_id', this.userId);
      if (autopilotIds.length) q = q.not('id', 'in', `(${autopilotIds.join(',')})`);
      const { data: runs, error } = await q;
      if (error || !Array.isArray(runs) || !runs.length) return [];
      const flowIds = [...new Set(runs.map(r => r.flow_id).filter(Boolean))];
      const runIds = runs.map(r => r.id);
      const [flowsRes, outsRes] = await Promise.all([
        flowIds.length ? this.supabase.from('content_flows').select('id, name, flow_image_url').in('id', flowIds) : Promise.resolve({ data: [] }),
        this.supabase.from('runs_outputs').select('run_id, output_type, storage_path, storage_object_id, created_at').in('run_id', runIds).order('created_at', { ascending: false })
      ]);
      const flowMap = (flowsRes.data || []).reduce((a, f) => { a[f.id] = f; return a; }, {});
      const byRun = {};
      (outsRes.data || []).forEach(o => { (byRun[o.run_id] = byRun[o.run_id] || []).push(o); });
      const MAX = 8;
      return runs.map(r => {
        const flow = flowMap[r.flow_id] || null;
        const outs = byRun[r.id] || [];
        const images = [];
        for (const o of outs) {
          if ((o.output_type || '').toLowerCase() === 'text') continue;
          const url = this.getPublicUrlFromStorage('production-outputs', o.storage_path)
            || this.getPublicUrlFromStorage('outputs', o.storage_path)
            || this.getPublicUrlFromStorage('production-outputs', o.storage_object_id);
          if (url && !images.includes(url)) images.push(url);
          if (images.length >= MAX) break;
        }
        if (!images.length && flow?.flow_image_url) images.push(flow.flow_image_url);
        return { ...r, flow_name: flow?.name || 'Flujo eliminado', flow_slug: flow ? this.flowNameToSlug(flow.name) : '', images, output_count: outs.length };
      });
    } catch (e) { console.warn('loadRecentProductions:', e); return []; }
  }

  renderExecCard(r) {
    const status = (r.status || '').toLowerCase();
    const statusClass = status === 'completed' ? 'task-card-badge-active'
      : (status === 'failed' || status === 'error') ? 'task-card-badge-danger'
      : (status === 'running' || status === 'in_progress') ? 'task-card-badge-running'
      : 'task-card-badge-paused';
    const statusLabel = status === 'completed' ? 'Completado'
      : (status === 'failed' || status === 'error') ? 'Error'
      : (status === 'running' || status === 'in_progress') ? 'En curso'
      : (status ? status.charAt(0).toUpperCase() + status.slice(1) : '—');
    const images = Array.isArray(r.images) ? r.images : [];
    const count = r.output_count || 0;
    const disabled = !r.flow_slug;
    const multi = images.length > 1;
    const isVid = (u) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u || '');
    const media = images.length
      ? images.map((url, i) => {
          const vis = i === 0 ? ' is-visible' : '';
          const vsrc = url.includes('#') ? url : url + '#t=0.1';
          return isVid(url)
            ? `<video class="exec-card-img exec-card-img--video${vis}" src="${this.escapeHtml(vsrc)}" muted loop playsinline preload="metadata" aria-hidden="true"></video>`
            : `<img class="exec-card-img${vis}" src="${this.escapeHtml(url)}" alt="" loading="lazy">`;
        }).join('')
      : `<div class="exec-card-placeholder"><i class="fas fa-wand-magic-sparkles"></i></div>`;
    const dots = multi ? `<div class="exec-card-dots" aria-hidden="true">${images.map((_, i) => `<span class="exec-card-dot${i === 0 ? ' is-active' : ''}"></span>`).join('')}</div>` : '';
    return `
      <button type="button" class="exec-card${disabled ? ' exec-card--disabled' : ''}"${multi ? ' data-carousel="1"' : ''} data-run-id="${this.escapeHtml(r.id)}" data-flow-slug="${this.escapeHtml(r.flow_slug)}"${disabled ? ' disabled' : ''}>
        <div class="exec-card-media">
          ${media}
          <div class="exec-card-gradient" aria-hidden="true"></div>
          <span class="exec-card-count"><i class="fas fa-layer-group"></i> ${count}</span>
          <span class="task-card-badge ${statusClass} exec-card-status"><span class="task-card-badge-dot"></span>${this.escapeHtml(statusLabel)}</span>
          ${dots}
          <div class="exec-card-info">
            <h3 class="exec-card-flow">${this.escapeHtml(r.flow_name)}</h3>
            <span class="exec-card-when">${this.escapeHtml(this.relativeTime(r.created_at))}</span>
            <span class="exec-card-resume"><i class="fas fa-arrow-right"></i> Continuar sesion</span>
          </div>
        </div>
      </button>`;
  }

  _bindExecCarousels(container) {
    // Timers rastreados: si la card se destruye estando en hover (re-render por
    // busqueda/filtro o navegacion), el mouseleave no dispara y el interval quedaba
    // inalcanzable. Los limpiamos todos en onLeave/destroy (patron de ExecutionHistoryView).
    this._cardCarouselTimers = this._cardCarouselTimers || [];
    container.querySelectorAll('.exec-card[data-carousel]').forEach(card => {
      const items = Array.from(card.querySelectorAll('.exec-card-img'));
      const dots = Array.from(card.querySelectorAll('.exec-card-dot'));
      if (items.length < 2) return;
      let idx = 0, timer = null;
      const playVid = (el) => { if (el && el.tagName === 'VIDEO') { try { el.currentTime = 0; el.play(); } catch (_) {} } };
      const pauseVid = (el) => { if (el && el.tagName === 'VIDEO') { try { el.pause(); } catch (_) {} } };
      const show = (n, playActive = true) => {
        items[idx]?.classList.remove('is-visible'); pauseVid(items[idx]); dots[idx]?.classList.remove('is-active');
        idx = (n + items.length) % items.length;
        items[idx]?.classList.add('is-visible'); dots[idx]?.classList.add('is-active');
        if (playActive) playVid(items[idx]);
      };
      card.addEventListener('mouseenter', () => { if (!timer) { playVid(items[idx]); timer = setInterval(() => show(idx + 1), 1400); this._cardCarouselTimers.push(timer); } });
      card.addEventListener('mouseleave', () => { if (timer) { clearInterval(timer); timer = null; } items.forEach(pauseVid); show(0, false); });
    });
  }

  async populateContinueProducing() {
    const host = document.getElementById('flowContinueRail');
    if (!host) return;
    const prods = await this.loadRecentProductions(12);
    if (!document.body.contains(host)) return;
    if (!prods.length) { host.remove(); return; }
    const execUrl = this.getExecPath();
    host.innerHTML = `
      <section class="flow-catalog-row-section">
        <div class="flow-rail-head">
          <h2 class="flow-catalog-row-title">Continua produciendo</h2>
          <a class="flow-rail-seeall" href="${execUrl}" data-exec-link>${__('Ver todo')} <i class="fas fa-chevron-right" aria-hidden="true"></i></a>
        </div>
        <div class="flow-catalog-row-scroll flow-continue-rail">${prods.map(r => this.renderExecCard(r)).join('')}</div>
      </section>`;
    host.querySelector('[data-exec-link]')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.router) window.router.navigate(execUrl); else window.location.href = execUrl;
    });
    const scroll = host.querySelector('.flow-continue-rail');
    if (scroll) {
      this.attachRowArrows(scroll);
      scroll.querySelectorAll('.exec-card').forEach(card => {
        if (card.disabled) return;
        card.addEventListener('click', () => {
          const runId = card.getAttribute('data-run-id');
          const slug = card.getAttribute('data-flow-slug');
          if (!runId || !slug) return;
          const url = `${this.getStudioPath()}/${encodeURIComponent(slug)}?run=${encodeURIComponent(runId)}`;
          if (window.router) window.router.navigate(url); else window.location.href = url;
        });
      });
      this._bindExecCarousels(scroll);
    }
  }

  renderPersonalRails() {
    const host = document.getElementById('flowCatalogRails');
    if (!host) return;
    const parts = ['<div id="flowContinueRail"></div>'];
    // Dedupe inteligente: cada rail secundario solo aparece si aporta >= minNew
    // flows que NO se han mostrado arriba. Asi no se repite todo en cada columna
    // y en catalogos chicos simplemente salen menos rails (se ocultan solos).
    const seen = new Set();
    const numberedHtml = (flows) => flows.map((f, i) => `
      <div class="flow-rank-item"><span class="flow-rank-num" aria-hidden="true">${i + 1}</span>${this.renderFlowCard(f)}</div>`).join('');
    const addRail = (title, flows, opts = {}) => {
      if (!flows || !flows.length) return;
      const minNew = opts.minNew ?? 4;
      const fresh = flows.filter(f => !seen.has(f.id));
      if (fresh.length < minNew) return; // no aporta suficiente nuevo → se oculta
      flows.forEach(f => seen.add(f.id));
      parts.push(this._railHtml(title, opts.numbered ? numberedHtml(flows) : flows.map(f => this.renderFlowCard(f)).join('')));
    };

    // Destacado del dia (siempre; 1 flow rotado por fecha)
    const featured = this.getDailyFeatured();
    if (featured) { parts.push(this.renderDailyFeaturedHtml(featured)); seen.add(featured.id); }

    // Hechos para tu marca: rail primario, siempre (siembra el set de vistos)
    addRail(__('Hechos para tu marca'), this.getBrandFitFlows(), { minNew: 0 });

    // Secundarios: condicionales — solo si aportan contenido nuevo suficiente
    addRail(__('Novedades'), this.getNewFlows(), { minNew: 4 });
    addRail(__('Favoritos de la audiencia'), this.getAudienceFavorites(), { minNew: 4 });
    addRail(__('Top 10'), this.getTop10(), { minNew: 5, numbered: true });
    this.getSubcategoryRails().forEach(rail => addRail(this.escapeHtml(rail.name), rail.flows, { minNew: 3 }));
    const because = this.getBecauseYouUsed();
    if (because) addRail(__('Porque usaste {x}', { x: this.escapeHtml(because.seedName) }), because.flows, { minNew: 3 });

    host.innerHTML = parts.join('');
    host.querySelectorAll('.flow-catalog-row-scroll').forEach(scroll => this.bindFlowCardListeners(scroll));

    // Bind del destacado del dia
    const feat = host.querySelector('.flow-featured');
    if (feat) {
      const fid = feat.getAttribute('data-flow-id');
      feat.querySelector('[data-action="run"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.runFlow(fid); });
      feat.querySelector('[data-action="detail"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.openFlowDetail(fid); });
      feat.addEventListener('click', (e) => { if (!e.target.closest('button')) this.openFlowDetail(fid); });
      feat.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openFlowDetail(fid); } });
    }

    // Primer rail: "Continua produciendo" (sesiones recientes, async).
    this.populateContinueProducing();
  }

  renderRecentInCategory() {
    const list = this.getRecentInCategoryFlows();
    this.renderRow('rowRecentCategory', list, 'Aún no has usado flujos en esta categoría.');
  }

  renderGalleryBySubcategory() {
    const gallery = document.getElementById('galleryBySub');
    if (!gallery) return;
    const rows = this.getFlowsBySubcategory().filter(({ flows }) => flows.length > 0);
    gallery.closest('.flow-catalog-gallery-by-sub')?.style.removeProperty('display');
    if (rows.length === 0) {
      // Empty state inline (DESPUÉS del category header). Antes se usaba el
      // flow-catalog-empty global que quedaba ARRIBA del header — feo.
      gallery.innerHTML = `
        <div class="flow-catalog-empty flow-catalog-empty--in-section" aria-live="polite">
          <p class="flow-catalog-empty-text">Aún no hay flujos en esta categoría</p>
        </div>`;
      return;
    }
    gallery.innerHTML = rows.map(({ sub, flows }) => `
      <section class="flow-catalog-sub-row flow-catalog-row-section" data-subcategory-id="${this.escapeHtml(sub?.id || '')}">
        <h2 class="flow-catalog-row-title">${this.escapeHtml(sub?.name || '')}</h2>
        <div class="flow-catalog-row-scroll">${flows.map(f => this.renderFlowCard(f)).join('')}</div>
      </section>
    `).join('');
    this.bindFlowCardListeners(gallery);
    gallery.querySelectorAll('.flow-catalog-sub-row').forEach(row => {
      const subId = row.querySelector('.flow-card')?.closest('.flow-catalog-sub-row')?.dataset?.subcategoryId;
      if (subId) row.dataset.subcategoryId = subId;
    });
    // Filtro inicial vía URL: si ?sub=<id> está presente, ocultar las demás
    // rows y marcar el chip correspondiente como activo.
    const activeSubFromUrl = new URLSearchParams(window.location.search).get('sub');
    if (activeSubFromUrl) {
      gallery.querySelectorAll('.flow-catalog-sub-row').forEach(row => {
        row.style.display = row.dataset.subcategoryId === activeSubFromUrl ? '' : 'none';
      });
    }
  }


  /**
   * Arrows de navegación tipo Netflix para una row scrollable. Aparecen en hover.
   * Idempotente: si ya hay arrows, no las duplica.
   */
  attachRowArrows(rowScrollEl) {
    if (!rowScrollEl) return;
    const section = rowScrollEl.closest('.flow-catalog-row-section');
    if (!section || section.querySelector('.flow-catalog-row-nav')) return;
    const nav = (dir) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `flow-catalog-row-nav flow-catalog-row-nav--${dir}`;
      btn.setAttribute('aria-label', dir === 'left' ? __('Anterior') : __('Siguiente'));
      btn.innerHTML = `<i class="fas fa-chevron-${dir}"></i>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const delta = rowScrollEl.clientWidth * 0.85 * (dir === 'left' ? -1 : 1);
        rowScrollEl.scrollBy({ left: delta, behavior: 'smooth' });
      });
      return btn;
    };
    section.appendChild(nav('left'));
    section.appendChild(nav('right'));

    const updateVisibility = () => {
      const max = rowScrollEl.scrollWidth - rowScrollEl.clientWidth;
      const showLeft = rowScrollEl.scrollLeft > 8;
      const showRight = rowScrollEl.scrollLeft < max - 8;
      section.classList.toggle('has-scroll-left', showLeft);
      section.classList.toggle('has-scroll-right', showRight && max > 0);
    };
    updateVisibility();
    rowScrollEl.addEventListener('scroll', () => {
      if (this._rowNavDebounce) cancelAnimationFrame(this._rowNavDebounce);
      this._rowNavDebounce = requestAnimationFrame(updateVisibility);
    });
    window.addEventListener('resize', updateVisibility, { passive: true });
  }

  /**
   * Enlaza click en card y botones like/save para todas las .flow-card dentro del contenedor.
   * Además, si el container es un .flow-catalog-row-scroll, agrega arrows de navegación.
   */
  bindFlowCardListeners(container) {
    if (!container) return;
    if (container.classList && container.classList.contains('flow-catalog-row-scroll')) {
      this.attachRowArrows(container);
    } else {
      container.querySelectorAll('.flow-catalog-row-scroll').forEach(scroll => this.attachRowArrows(scroll));
    }
    container.querySelectorAll('.flow-card').forEach(card => {
      const flowId = card.getAttribute('data-flow-id');
      card.addEventListener('click', (e) => {
        if (e.target.closest('.flow-card-icon-btn')) return;
        this.openFlow(flowId);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openFlow(flowId); }
      });
      card.querySelector('.flow-card-icon-btn[data-action="run"]')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.runFlow(flowId); });
      card.querySelectorAll('.flow-card-icon-btn[data-action="like"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleLike(flowId); });
      });
      card.querySelectorAll('.flow-card-icon-btn[data-action="save"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleSave(flowId); });
      });
      // Preview en movimiento: el video se reproduce solo en hover (Netflix).
      const vid = card.querySelector('video.flow-card-img');
      if (vid) {
        card.addEventListener('mouseenter', () => { const p = vid.play(); if (p && p.catch) p.catch(() => {}); });
        card.addEventListener('mouseleave', () => { try { vid.pause(); vid.currentTime = 0; } catch (_) {} });
      }
    });
  }

  async toggleLike(flowId) {
    if (!this.supabase || !this.userId) return;
    const flow = this.flowsById.get(flowId) || this.flows.find(f => f.id === flowId);
    try {
      const { data, error } = await this.supabase.rpc('toggle_user_flow_like', { p_flow_id: flowId });
      if (error) throw error;
      const nowLiked = data === true;
      if (nowLiked) this.likedFlowIds.add(flowId);
      else this.likedFlowIds.delete(flowId);
      if (flow) flow.likes_count = Math.max(0, (flow.likes_count || 0) + (nowLiked ? 1 : -1));
      window.apiClient?.invalidate(`flow:likes:${this.userId}`);
    } catch (e) {
      console.error('toggleLike:', e);
      return;
    }
    this.refreshFlowLikeSaveUI(flowId);
  }

  async toggleSave(flowId) {
    if (!this.supabase || !this.organizationId) return;
    const flow = this.flowsById.get(flowId) || this.flows.find(f => f.id === flowId);
    try {
      const { data, error } = await this.supabase.rpc('toggle_org_flow_save', {
        p_org_id: this.organizationId,
        p_flow_id: flowId
      });
      if (error) throw error;
      const nowSaved = data === true;
      if (nowSaved) this.savedFlowIds.add(flowId);
      else this.savedFlowIds.delete(flowId);
      if (flow) flow.saves_count = Math.max(0, (flow.saves_count || 0) + (nowSaved ? 1 : -1));
      window.apiClient?.invalidate(`flow:saves:${this.organizationId}`);
    } catch (e) {
      console.error('toggleSave:', e);
      return;
    }
    this.refreshFlowLikeSaveUI(flowId);
    // En My Flows, desguardar saca el card de la vista al instante.
    if (this.savedView) this.renderSavedFlows();
  }

  // Refresca el estado like/save en TODAS las superficies del flow: cards del
  // catalogo (puede haber varias) y los botones del modal de detalle si esta abierto.
  refreshFlowLikeSaveUI(flowId) {
    const liked = this.likedFlowIds.has(flowId);
    const saved = this.savedFlowIds.has(flowId);
    document.querySelectorAll(`.flow-card[data-flow-id="${flowId}"]`).forEach(cardEl => {
      cardEl.querySelector('.flow-card-icon-like')?.classList.toggle('is-active', liked);
      cardEl.querySelector('.flow-card-icon-save')?.classList.toggle('is-active', saved);
    });
    const detail = document.querySelector(`.flow-detail[data-flow-id="${flowId}"]`);
    if (detail) {
      detail.querySelector('.flow-detail-like')?.classList.toggle('is-active', liked);
      detail.querySelector('.flow-detail-save')?.classList.toggle('is-active', saved);
    }
  }

  // Clic en card → modal de detalle (Netflix takeover). El CTA "Ejecutar" del
  // modal es quien navega a StudioView (runFlow).
  openFlow(flowId) {
    this.openFlowDetail(flowId);
  }

  runFlow(flowId) {
    const flow = this.flowsById?.get(flowId) || this.flows?.find(f => f.id === flowId);
    const slug = flow?.name ? this.flowNameToSlug(flow.name) : '';
    if (slug && window.router) {
      window.router.navigate(`${this.getStudioPath()}/${encodeURIComponent(slug)}`);
      return;
    }
    if (window.appState) window.appState.set('selectedFlowId', flowId, true);
    else localStorage.setItem('selectedFlowId', flowId);
    if (window.router) window.router.navigate(this.getStudioPath());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FEAT-035 Fase 2 — modal de detalle / preview
  // ─────────────────────────────────────────────────────────────────────────

  getFlowById(flowId) {
    return this.flowsById?.get(flowId) || this.flows?.find(f => f.id === flowId) || null;
  }

  // Flows relacionados: misma subcategoria; si no alcanza, misma categoria.
  getRelatedFlows(flow, limit = 12) {
    if (!flow) return [];
    const pool = (this.flows || []).filter(f => f.id !== flow.id);
    const sameSub = flow.subcategory_id
      ? pool.filter(f => f.subcategory_id === flow.subcategory_id)
      : [];
    const sameCat = flow.category_id
      ? pool.filter(f => f.category_id === flow.category_id && !sameSub.includes(f))
      : [];
    const score = (f) => (f.run_count || 0) + (f.likes_count || 0);
    const ranked = [...sameSub, ...sameCat].sort((a, b) => score(b) - score(a));
    return ranked.slice(0, limit);
  }

  // ---- helpers de runs (columna izquierda del modal) ----

  getPublicUrlFromStorage(bucket, filePath) {
    if (!this.supabase?.storage?.from || !bucket || typeof filePath !== 'string' || !filePath.trim()) return null;
    try {
      let path = filePath.trim();
      if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
      else if (path.startsWith('/')) path = path.slice(1);
      const { data } = this.supabase.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (_) { return null; }
  }

  // Resuelve el media de un output (runs_outputs) a una URL mostrable.
  resolveRunMedia(o) {
    if (!o) return null;
    let media_url = null;
    const rawPath = typeof o.storage_path === 'string' ? o.storage_path.trim() : '';
    if (rawPath) {
      media_url = rawPath.startsWith('http')
        ? rawPath
        : (this.getPublicUrlFromStorage('production-outputs', rawPath) || this.getPublicUrlFromStorage('outputs', rawPath));
    }
    const meta = o.metadata && typeof o.metadata === 'object' ? o.metadata : {};
    if (!media_url) media_url = meta.url || meta.image_url || meta.file_url || meta.output_url || meta.publicUrl || meta.src || meta.video_url || null;
    const type = (o.output_type || '').toLowerCase();
    const isVideo = type.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(media_url || '');
    return { media_url, isVideo };
  }

  // Ultimas PRODUCCIONES de ESTE flow (flow_runs por flow_id), sin filtrar por
  // usuario ni por fecha — las mas recientes que existan. El scope de visibilidad
  // lo da RLS (org del usuario).
  async loadFlowRuns(flowId, limit = 2) {
    if (!this.supabase || !flowId) return [];
    try {
      let { data: runs, error } = await this.supabase
        .from('flow_runs')
        .select('id, created_at, status')
        .eq('flow_id', flowId)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) {
        // status puede no existir en algun entorno → reintento minimo
        const r2 = await this.supabase
          .from('flow_runs')
          .select('id, created_at')
          .eq('flow_id', flowId)
          .order('created_at', { ascending: false })
          .limit(8);
        runs = r2.data; error = r2.error;
      }
      if (error || !Array.isArray(runs) || !runs.length) return [];
      const runIds = runs.map(r => r.id);
      const { data: outs } = await this.supabase
        .from('runs_outputs')
        .select('id, run_id, output_type, storage_path, metadata, created_at')
        .in('run_id', runIds)
        .order('created_at', { ascending: false });
      const byRun = new Map();
      (outs || []).forEach(o => { if (!byRun.has(o.run_id)) byRun.set(o.run_id, this.resolveRunMedia(o)); });
      const result = [];
      for (const r of runs) {
        result.push({ ...r, output: byRun.get(r.id) || null });
        if (result.length >= limit) break;
      }
      return result;
    } catch (e) { console.warn('loadFlowRuns:', e); return []; }
  }

  relativeTime(dateStr) {
    const d = dateStr ? new Date(dateStr).getTime() : 0;
    if (!d) return '';
    const min = Math.floor((Date.now() - d) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const days = Math.floor(h / 24);
    if (days < 30) return `hace ${days} d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `hace ${months} mes${months > 1 ? 'es' : ''}`;
    return `hace ${Math.floor(months / 12)} a`;
  }

  _runStatusInfo(status) {
    const s = (status || '').toLowerCase();
    if (['completed', 'success', 'done', 'ready', 'completado'].includes(s)) return { label: __('Listo'), cls: 'ok' };
    if (['failed', 'error'].includes(s)) return { label: __('Fallo'), cls: 'err' };
    if (['running', 'processing', 'pending', 'queued', 'in_progress'].includes(s)) return { label: __('En proceso'), cls: 'run' };
    return { label: s ? this.escapeHtml(s) : 'Run', cls: 'idle' };
  }

  renderRunItem(run) {
    const m = run.output;
    let mediaHtml;
    if (m && m.media_url) {
      mediaHtml = m.isVideo
        ? `<video src="${this.escapeHtml(m.media_url)}" class="flow-detail-run-media-el" muted loop playsinline preload="metadata" aria-hidden="true"></video>`
        : `<img src="${this.escapeHtml(m.media_url)}" alt="" class="flow-detail-run-media-el" loading="lazy">`;
    } else {
      mediaHtml = `<div class="flow-detail-run-ph"><i class="fas fa-image"></i></div>`;
    }
    const st = this._runStatusInfo(run.status);
    return `
      <button type="button" class="flow-detail-run" data-run-id="${this.escapeHtml(run.id)}">
        <div class="flow-detail-run-media">${mediaHtml}</div>
        <div class="flow-detail-run-info">
          <span class="flow-detail-run-status flow-detail-run-status--${st.cls}">${st.label}</span>
          <span class="flow-detail-run-date">${this.relativeTime(run.created_at)}</span>
        </div>
      </button>`;
  }

  async populateFlowRuns(modal, flow) {
    const host = modal.querySelector('[data-runs]');
    if (!host) return;
    const runs = await this.loadFlowRuns(flow.id, 2);
    if (!document.body.contains(host)) return; // modal cerrado mientras cargaba
    if (!runs.length) {
      host.innerHTML = `<div class="flow-detail-runs-empty">Este flow aun no tiene producciones. Cuando se ejecute, veras aqui las ultimas.</div>`;
      return;
    }
    host.innerHTML = runs.map(r => this.renderRunItem(r)).join('');
    host.querySelectorAll('.flow-detail-run').forEach(el => {
      el.addEventListener('click', () => this.openRun(flow, el.getAttribute('data-run-id')));
    });
  }

  openRun(flow, runId) {
    this.closeFlowDetail();
    const slug = flow?.name ? this.flowNameToSlug(flow.name) : '';
    const base = slug ? `${this.getStudioPath()}/${encodeURIComponent(slug)}` : this.getStudioPath();
    const url = runId ? `${base}?run=${encodeURIComponent(runId)}` : base;
    if (window.router) window.router.navigate(url);
    else window.location.href = url;
  }

  renderFlowDetailBody(flow) {
    const name = this.escapeHtml(flow.name);
    const cost = flow.token_cost ?? 1;
    const isLiked = this.likedFlowIds.has(flow.id);
    const isSaved = this.savedFlowIds.has(flow.id);
    const runs = flow.run_count || 0;

    const badges = [];
    if (this.isNew(flow)) badges.push('<span class="flow-card-badge flow-card-badge--new">Nuevo</span>');
    if (this.isTrending(flow)) badges.push('<span class="flow-card-badge flow-card-badge--trending">Trending</span>');
    else if (this.isPopular(flow)) badges.push('<span class="flow-card-badge flow-card-badge--popular">Popular</span>');
    const ftype = flow.flow_category_type || 'manual';
    if (ftype === 'autopilot') badges.push('<span class="flow-card-badge flow-card-badge--auto">Autopilot</span>');

    // El banner del flow es el fondo de toda la card.
    const bg = flow.flow_image_url
      ? (/\.(mp4|webm|mov)(\?|$)/i.test(flow.flow_image_url)
          ? `<video src="${this.escapeHtml(flow.flow_image_url)}" class="flow-detail-bg-el" muted loop playsinline autoplay preload="metadata" aria-hidden="true"></video>`
          : `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="" class="flow-detail-bg-el">`)
      : '';

    const catLabel = [flow._categoryName, flow._subcategoryName].filter(Boolean).map(s => this.escapeHtml(s)).join('  ·  ');
    const desc = flow.description ? this.escapeHtml(flow.description) : 'Sin descripcion disponible para este flow.';

    const meta = [
      runs > 0 ? `<span class="flow-detail-meta-item"><i class="fas fa-play"></i>${this.formatCount(runs)} usos</span>` : '',
      `<span class="flow-detail-meta-item"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i>${this.getOutputTypeLabel(flow.output_type)}</span>`,
      `<span class="flow-detail-meta-item"><i class="fas fa-diagram-project"></i>${this.getExecutionModeLabel(flow.execution_mode)}</span>`,
      `<span class="flow-detail-meta-item">v${this.escapeHtml((flow.version || '1.0.0').toString())}</span>`
    ].filter(Boolean).join('');

    const related = this.getRelatedFlows(flow);
    const suggestHtml = related.length ? `
      <div class="flow-detail-suggest">
        <h3 class="flow-detail-section-title">Flows que te pueden interesar</h3>
        <div class="flow-catalog-row-scroll flow-detail-related-row">
          ${related.map(f => this.renderFlowCard(f)).join('')}
        </div>
      </div>` : '';

    const wrap = document.createElement('div');
    wrap.className = 'flow-detail';
    wrap.dataset.flowId = flow.id;
    wrap.innerHTML = `
      <div class="flow-detail-bg" aria-hidden="true">${bg}</div>
      <div class="flow-detail-bg-scrim" aria-hidden="true"></div>
      <div class="flow-detail-grid">
        <aside class="flow-detail-col flow-detail-col--runs">
          <h3 class="flow-detail-section-title">Ultimas producciones</h3>
          <div class="flow-detail-runs" data-runs>
            <div class="flow-detail-run flow-detail-run--skel"></div>
            <div class="flow-detail-run flow-detail-run--skel"></div>
          </div>
        </aside>
        <div class="flow-detail-col flow-detail-col--info">
          ${catLabel ? `<span class="flow-detail-eyebrow">${catLabel}</span>` : ''}
          <h2 class="flow-detail-title">${name}</h2>
          ${badges.length ? `<div class="flow-detail-badges-inline">${badges.join('')}</div>` : ''}
          <div class="flow-detail-actions">
            <button type="button" class="flow-detail-cta flow-detail-cta--run" data-detail-action="run">
              <i class="fas fa-play" aria-hidden="true"></i>
              <span>${__('Ejecutar')}</span>
              <span class="flow-detail-cta-cost"><i class="fas fa-bolt" aria-hidden="true"></i>${cost}</span>
            </button>
            <button type="button" class="flow-detail-icon-btn flow-detail-save ${isSaved ? 'is-active' : ''}" data-detail-action="save" aria-label="${__('Guardar')}" title="${__('Guardar')}">
              <i class="fas fa-bookmark" aria-hidden="true"></i>
            </button>
            <button type="button" class="flow-detail-icon-btn flow-detail-like ${isLiked ? 'is-active' : ''}" data-detail-action="like" aria-label="Like" title="Like">
              <i class="fas fa-heart" aria-hidden="true"></i>
            </button>
          </div>
          <div class="flow-detail-meta">${meta}</div>
          <p class="flow-detail-desc">${desc}</p>
          ${suggestHtml}
        </div>
      </div>`;
    return wrap;
  }

  openFlowDetail(flowId) {
    const flow = this.getFlowById(flowId);
    if (!flow) { this.runFlow(flowId); return; }
    this.closeFlowDetail();
    if (!window.Modal || typeof window.Modal.show !== 'function') { this.runFlow(flowId); return; }

    const body = this.renderFlowDetailBody(flow);
    const { modal, close } = window.Modal.show({
      title: '',
      body,
      className: 'flow-detail-modal',
      onClose: () => {
        this._detailClose = null;
        this._detailFlowId = null;
        this._setFlowParam(null);
      }
    });
    this._detailClose = close;
    this._detailFlowId = flowId;
    this._setFlowParam(flowId);

    modal.querySelector('[data-detail-action="run"]')?.addEventListener('click', () => {
      close();
      this.runFlow(flowId);
    });
    modal.querySelector('[data-detail-action="like"]')?.addEventListener('click', () => this.toggleLike(flowId));
    modal.querySelector('[data-detail-action="save"]')?.addEventListener('click', () => this.toggleSave(flowId));

    // Footer "Flows que te pueden interesar": abren su propio detalle (swap).
    modal.querySelectorAll('.flow-detail-related-row .flow-card').forEach(card => {
      const relId = card.getAttribute('data-flow-id');
      card.addEventListener('click', (e) => {
        if (e.target.closest('.flow-card-icon-btn')) return;
        this.openFlowDetail(relId);
      });
      card.querySelector('.flow-card-icon-btn[data-action="like"]')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleLike(relId); });
      card.querySelector('.flow-card-icon-btn[data-action="save"]')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleSave(relId); });
    });

    // Columna izquierda: ultimos runs (async).
    this.populateFlowRuns(modal, flow);
  }

  closeFlowDetail() {
    if (typeof this._detailClose === 'function') {
      const fn = this._detailClose;
      this._detailClose = null;
      fn();
    }
  }

  // Sincroniza ?flow=<id> en la URL sin perder otros params (ej. ?sub=).
  _setFlowParam(flowId) {
    try {
      const url = new URL(window.location.href);
      if (flowId) url.searchParams.set('flow', flowId);
      else url.searchParams.delete('flow');
      window.history.replaceState(window.history.state, '', url);
    } catch (_) {}
  }
}

window.FlowCatalogView = FlowCatalogView;
