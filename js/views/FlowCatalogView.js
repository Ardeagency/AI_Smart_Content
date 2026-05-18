/**
 * FlowCatalogView - Feed inteligente de producción creativa.
 * Dos experiencias: HOME (Feed principal) y VIEW POR CATEGORÍA (Contextual Feed).
 */
class FlowCatalogView extends BaseView {
  static cacheable = true;
  static documentTitle = 'Flujos';

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
    this.selectedSubcategoryId = this.routeParams?.subcategoryId || null;
    this.selectedCategoryId = this.routeParams?.categoryId || null;
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
    const isCategoryView = !!(this.selectedCategoryId || this.selectedSubcategoryId);
    return `
      <div class="flow-catalog" id="flowCatalogContainer">
        <div class="flow-catalog-loading" id="flowCatalogLoading">
          <i class="fas fa-circle-notch fa-spin"></i>
          <p>Cargando flows...</p>
        </div>
        <div class="flow-catalog-content" id="flowCatalogContent" style="display: none;">
          <!-- HERO: carrusel full-bleed por categoría, auto-avance, sin flechas -->
          <section class="flow-catalog-hero-section" id="flowCatalogHeroSection">
            <div class="flow-catalog-hero-track" id="flowCatalogHeroTrack"></div>
          </section>

          ${!isCategoryView ? `
          <!-- Catálogo completo: cada categoría se renderiza como su propio
               bloque con header (no hace falta un título paraguas tipo
               "All Flows" — las categorías ya hacen ese trabajo). -->
          <section class="flow-catalog-row-section flow-catalog-row-section--unframed" id="sectionAllFlows" style="display: none;">
            <div class="flow-catalog-gallery-by-category-sub" id="galleryAllByCategorySub"></div>
          </section>
          ` : `
          <!-- VIEW CATEGORÍA: header (sustituye al hero del home) -->
          <header class="flow-catalog-category-header" id="flowCatalogCategoryHeader"></header>

          <!-- Subcategorías strip (chips de navegación dentro de la categoría) -->
          <section class="flow-catalog-row-section flow-catalog-row-section--strip" id="sectionSubcategories">
            <div class="flow-catalog-categories-strip flow-catalog-subcategories-strip" id="subcategoriesStrip"></div>
          </section>

          <!-- Últimos en esta categoría -->
          <section class="flow-catalog-row-section" id="sectionRecentCategory">
            <h2 class="flow-catalog-row-title">Continuar</h2>
            <div class="flow-catalog-row-scroll" id="rowRecentCategory"></div>
          </section>

          <!-- Galería por subcategoría -->
          <div class="flow-catalog-gallery-by-sub" id="galleryBySub"></div>
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

    this.renderHero();
    if (this.selectedCategoryId || this.selectedSubcategoryId) {
      this.renderCategoryHeader();
      this.renderSubcategoriesStrip();
      this.renderRecentInCategory();
      this.renderGalleryBySubcategory();
    } else {
      this.renderSectionAllFlows();
    }

    // Empty states: cada vista los maneja inline en el área donde irían los
    // flujos. renderSectionAllFlows en home y renderGalleryBySubcategory en
    // categoría — ambos inyectan .flow-catalog-empty--in-section cuando no
    // hay rows que mostrar.
  }

  showContentError() {
    const loading = document.getElementById('flowCatalogLoading');
    const content = document.getElementById('flowCatalogContent');
    if (loading) loading.innerHTML = '<p>No se pudo conectar. Revisa tu sesión.</p>';
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
    const labels = { text: 'Texto', image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento', mixed: 'Mixto' };
    return labels[t] || t;
  }

  getExecutionModeLabel(mode) {
    const m = (mode || 'single_step').toLowerCase();
    const labels = { single_step: 'Un paso', multi_step: 'Multi paso', sequential: 'Secuencial' };
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
    if (this.isTrending(flow)) badges.push('<span class="flow-card-badge flow-card-badge--trending">Trending</span>');
    const t = flow.flow_category_type || 'manual';
    const isAutopilotLike = (t === 'autopilot' || t === 'scraping');
    if (isAutopilotLike) badges.push('<span class="flow-card-badge flow-card-badge--auto">Autopilot</span>');
    const img = flow.flow_image_url
      ? `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-card-img" loading="lazy">`
      : `<div class="flow-card-placeholder"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i></div>`;

    const primaryTag = flow._subcategoryName || flow._categoryName || null;
    const primaryTagHtml = primaryTag ? `<span class="flow-card-info-tag">${this.escapeHtml(primaryTag)}</span>` : '';
    const outputTypeLabel = this.getOutputTypeLabel(flow.output_type);
    const executionLabel = this.getExecutionModeLabel(flow.execution_mode);
    const version = (flow.version || '1.0.0').toString();

    return `
      <article class="flow-card flow-card--catalog" data-flow-id="${flow.id}" role="button" tabindex="0">
        <div class="flow-card-media">
          ${img}
          <div class="flow-card-gradient" aria-hidden="true"></div>
          <div class="flow-card-badges">${badges.join('')}</div>
          <div class="flow-card-actions">
            <button type="button" class="flow-card-icon-btn flow-card-icon-like ${isLiked ? 'is-active' : ''}" data-action="like" title="Like" aria-label="Like"><i class="fas fa-heart"></i></button>
            <button type="button" class="flow-card-icon-btn flow-card-icon-save ${isSaved ? 'is-active' : ''}" data-action="save" title="Guardar" aria-label="Guardar"><i class="fas fa-bookmark"></i></button>
          </div>
          <div class="flow-card-info">
            <h3 class="flow-card-title">${name}</h3>
            <div class="flow-card-info-meta">
              ${primaryTagHtml}
              <span class="flow-card-info-credits" title="Créditos por ejecución"><i class="fas fa-bolt"></i>${cost}</span>
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
            <span class="flow-hero-slide-eyebrow">Categoría destacada</span>
            <h2 class="flow-hero-slide-title">${name}</h2>
            ${desc ? `<p class="flow-hero-slide-desc">${desc}</p>` : ''}
            <span class="flow-hero-slide-cta">
              <i class="fas fa-play"></i>
              <span>Explorar flujos</span>
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
  }

  async onLeave() {
    this.clearHeroTimers();
    if (document && document.body) {
      document.body.classList.remove('route-flows');
    }
  }

  // Red de seguridad: si alguien llama destroy() directo (sin pasar por
  // router.onLeave), los timers siguen activos. Limpiamos aquí también
  // además del cleanup que hereda de BaseView.
  destroy() {
    this.clearHeroTimers();
    if (typeof super.destroy === 'function') super.destroy();
  }

  renderSubcategoriesStrip() {
    const section = document.getElementById('sectionSubcategories');
    const strip = document.getElementById('subcategoriesStrip');
    if (!section || !strip) return;
    if (!this.subcategoriesInCategory.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    const activeSubFromUrl = new URLSearchParams(window.location.search).get('sub');
    const chips = [
      { id: '', name: 'Todos', isAll: true },
      ...this.subcategoriesInCategory.map(s => ({ id: s.id, name: s.name }))
    ];
    strip.innerHTML = chips.map(chip => `
      <button type="button"
        class="flow-catalog-category-chip flow-catalog-sub-chip${(activeSubFromUrl ? chip.id === activeSubFromUrl : chip.isAll) ? ' active' : ''}"
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
          emptyEl.innerHTML = '<p class="flow-catalog-empty-text">Aún no hay flujos de esta técnica</p>';
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
        strip.querySelectorAll('.flow-catalog-sub-chip').forEach(b => b.classList.remove('active'));
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
  renderSectionAllFlows() {
    const section = document.getElementById('sectionAllFlows');
    const gallery = document.getElementById('galleryAllByCategorySub');
    if (!section || !gallery) return;
    const data = this.getFlowsByCategoryAndSubcategory();
    section.style.display = '';
    if (data.length === 0) {
      gallery.innerHTML = `
        <div class="flow-catalog-empty flow-catalog-empty--in-section" aria-live="polite">
          <p class="flow-catalog-empty-text">Próximamente</p>
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
      btn.setAttribute('aria-label', dir === 'left' ? 'Anterior' : 'Siguiente');
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
      card.querySelectorAll('.flow-card-icon-btn[data-action="like"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleLike(flowId, card); });
      });
      card.querySelectorAll('.flow-card-icon-btn[data-action="save"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleSave(flowId, card); });
      });
    });
  }

  async toggleLike(flowId, cardEl) {
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
    this.updateCardLikeSaveUI(cardEl, flow);
  }

  async toggleSave(flowId, cardEl) {
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
    this.updateCardLikeSaveUI(cardEl, flow);
  }

  updateCardLikeSaveUI(cardEl, flow) {
    if (!cardEl || !flow) return;
    const likeBtn = cardEl.querySelector('.flow-card-icon-like');
    const saveBtn = cardEl.querySelector('.flow-card-icon-save');
    if (likeBtn) {
      likeBtn.classList.toggle('is-active', this.likedFlowIds.has(flow.id));
      const countEl = likeBtn.querySelector('.flow-card-icon-count');
      if (countEl) countEl.textContent = flow.likes_count ?? 0;
    }
    if (saveBtn) {
      saveBtn.classList.toggle('is-active', this.savedFlowIds.has(flow.id));
      const countEl = saveBtn.querySelector('.flow-card-icon-count');
      if (countEl) countEl.textContent = flow.saves_count ?? 0;
    }
  }

  openFlow(flowId) {
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
}

window.FlowCatalogView = FlowCatalogView;
