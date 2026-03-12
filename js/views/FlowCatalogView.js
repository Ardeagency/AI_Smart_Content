/**
 * FlowCatalogView - Feed inteligente de producción creativa.
 * Dos experiencias: HOME (Discovery Feed) y VIEW POR CATEGORÍA (Contextual Feed).
 */
class FlowCatalogView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.flows = [];
    this.flowsById = new Map();
    this.categories = [];
    this.subcategories = [];
    this.favorites = [];       // { flow_id, rating?, ... }
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
        : '/settings';
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
          <!-- Mensaje cuando no hay flujos en esta sección -->
          <div class="flow-catalog-empty" id="flowCatalogEmpty" style="display: none;" aria-live="polite">
            <p class="flow-catalog-empty-text">PROXIMAMENTE</p>
          </div>

          <!-- HERO: carrusel full-bleed por categoría, auto-avance, sin flechas -->
          <section class="flow-catalog-hero-section" id="flowCatalogHeroSection">
            <div class="flow-catalog-hero-track" id="flowCatalogHeroTrack"></div>
          </section>

          ${!isCategoryView ? `
          <!-- All Flows: catálogo por categoría y subcategoría -->
          <section class="flow-catalog-row-section" id="sectionAllFlows" style="display: none;">
            <h2 class="flow-catalog-row-title">All Flows</h2>
            <div class="flow-catalog-gallery-by-category-sub" id="galleryAllByCategorySub"></div>
          </section>
          ` : `
          <!-- VIEW CATEGORÍA: subcategorías strip -->
          <section class="flow-catalog-row-section" id="sectionSubcategories">
            <h2 class="flow-catalog-row-title">Tema profesional</h2>
            <div class="flow-catalog-categories-strip flow-catalog-subcategories-strip" id="subcategoriesStrip"></div>
          </section>

          <!-- Últimos en esta categoría -->
          <section class="flow-catalog-row-section" id="sectionRecentCategory">
            <h2 class="flow-catalog-row-title">Últimos usados en esta categoría</h2>
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
        this.loadFavorites(),
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
      this.renderSubcategoriesStrip();
      this.renderRecentInCategory();
      this.renderGalleryBySubcategory();
    } else {
      this.renderSectionAllFlows();
    }
    this.bindCategoryClicks();

    const emptyEl = document.getElementById('flowCatalogEmpty');
    if (emptyEl) emptyEl.style.display = this.flows.length === 0 ? '' : 'none';
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
      const { data, error } = await this.supabase
        .from('content_categories')
        .select('id, name, description, order_index, cover_url, cover_type, cover_storage_path')
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('name');
      this.categories = !error && data ? data : [];
    } catch (e) {
      console.error('FlowCatalog loadCategories:', e);
      this.categories = [];
    }
  }

  async loadSubcategories() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('content_subcategories')
        .select('id, name, description, order_index')
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('name');
      this.subcategories = !error && data ? data : [];
    } catch (e) {
      console.error('FlowCatalog loadSubcategories:', e);
      this.subcategories = [];
    }
  }

  /**
   * Carga flujos del catálogo. Filtra por category_id o subcategory_id (content_flows)
   * según la vista activa. Incluye flujos manuales y automatizados con show_in_catalog=true.
   */
  async loadFlows() {
    if (!this.supabase) return;
    try {
      const baseFilter = () => {
        let q = this.supabase
          .from('content_flows')
          .select('id, name, description, token_cost, output_type, flow_image_url, category_id, subcategory_id, flow_category_type, likes_count, saves_count, run_count, created_at, status, version, execution_mode')
          .eq('is_active', true)
          .neq('flow_category_type', 'system'); // Flujos system nunca aparecen en catálogo
        if (this.selectedSubcategoryId) q = q.eq('subcategory_id', this.selectedSubcategoryId);
        else if (this.selectedCategoryId) q = q.eq('category_id', this.selectedCategoryId);
        return q;
      };
      let q = baseFilter().eq('show_in_catalog', true);
      let { data, error } = await q.order('created_at', { ascending: false });
      if (!this.selectedCategoryId && !this.selectedSubcategoryId && (!data || data.length === 0)) {
        const res = await baseFilter().order('created_at', { ascending: false });
        data = res.data;
        error = res.error;
      }
      this.flows = !error && data ? data : [];
      this.flowsById = new Map(this.flows.map(f => [f.id, f]));
    } catch (e) {
      console.error('FlowCatalog loadFlows:', e);
      this.flows = [];
      this.flowsById = new Map();
    }
  }

  async loadFavorites() {
    this.favorites = [];
    if (!this.supabase || !this.userId) return;
    try {
      const { data, error } = await this.supabase
        .from('user_flow_favorites')
        .select('flow_id, rating, is_favorite, last_used_at')
        .eq('user_id', this.userId)
        .eq('is_favorite', true);
      if (!error && data) this.favorites = data;
    } catch (e) {
      console.error('FlowCatalog loadFavorites:', e);
    }
  }

  async loadRecentRuns() {
    this.recentRunFlowIds = [];
    if (!this.supabase || !this.userId) return;
    try {
      const { data, error } = await this.supabase
        .from('flow_runs')
        .select('flow_id')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) {
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
    const subIds = new Set();
    this.flows.forEach(f => {
      if (f.subcategory_id) subIds.add(f.subcategory_id);
    });
    this.subcategoriesInCategory = this.subcategories.filter(s => subIds.has(s.id));
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

  getSavedFlows() {
    return this.favorites
      .map(fav => this.flowsById.get(fav.flow_id))
      .filter(Boolean);
  }

  getLikedFlows() {
    const withRating = this.favorites.filter(f => f.rating != null && f.rating >= 4);
    return withRating
      .map(fav => this.flowsById.get(fav.flow_id))
      .filter(Boolean);
  }

  getRecentFlows() {
    return this.recentRunFlowIds
      .map(id => this.flowsById.get(id))
      .filter(Boolean);
  }

  getRecommendedFlows() {
    const published = this.getPublishedFlows();
    const usedIds = new Set([...this.recentRunFlowIds, ...this.favorites.map(f => f.flow_id)]);
    const usedCategories = new Set();
    this.recentRunFlowIds.forEach(id => {
      const f = this.flowsById.get(id);
      if (f && f.category_id) usedCategories.add(f.category_id);
    });
    const candidates = published.filter(f => !usedIds.has(f.id));
    return [...candidates].sort((a, b) => {
      const aMatch = usedCategories.has(a.category_id) ? 1 : 0;
      const bMatch = usedCategories.has(b.category_id) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      const scoreA = (a.run_count || 0) + (a.likes_count || 0);
      const scoreB = (b.run_count || 0) + (b.likes_count || 0);
      return scoreB - scoreA;
    }).slice(0, 12);
  }

  getTrendingFlows() {
    const published = this.getPublishedFlows();
    return [...published].sort((a, b) => {
      const scoreA = (a.run_count || 0) + (a.likes_count || 0) + (a.saves_count || 0);
      const scoreB = (b.run_count || 0) + (b.likes_count || 0) + (b.saves_count || 0);
      return scoreB - scoreA;
    }).slice(0, 12);
  }

  getLovedFlows() {
    const published = this.getPublishedFlows();
    return [...published].sort((a, b) => {
      const scoreA = (a.likes_count || 0) + (a.saves_count || 0);
      const scoreB = (b.likes_count || 0) + (b.saves_count || 0);
      return scoreB - scoreA;
    }).slice(0, 12);
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
    this.flows.forEach(f => {
      if (!f.subcategory_id) return;
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
    return Array.from(bySub.values()).map(({ sub, flows }) => ({
      sub,
      flows: flows.sort((a, b) => (b.run_count || 0) + (b.likes_count || 0) - (a.run_count || 0) - (a.likes_count || 0))
    }));
  }

  /** En home: agrupa flujos por subcategory_id (content_flows.subcategory_id → content_subcategories). */
  getFlowsBySubcategoryHome() {
    const bySub = new Map();
    this.flows.forEach(f => {
      if (!f.subcategory_id) return;
      if (!bySub.has(f.subcategory_id)) {
        const sub = this.subcategories.find(s => s.id === f.subcategory_id);
        if (sub) bySub.set(f.subcategory_id, { sub, flows: [] });
      }
      bySub.get(f.subcategory_id).flows.push(f);
    });
    return Array.from(bySub.values())
      .map(({ sub, flows }) => ({
        sub,
        flows: flows.sort((a, b) => (b.run_count || 0) + (b.likes_count || 0) - (a.run_count || 0) - (a.likes_count || 0))
      }))
      .filter(({ flows }) => flows.length > 0);
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
    const likes = flow.likes_count || 0;
    const saves = flow.saves_count || 0;
    const runs = flow.run_count || 0;
    const fav = this.favorites.find(f => f.flow_id === flow.id);
    const isLiked = fav && fav.rating != null && fav.rating >= 4;
    const isSaved = fav && fav.is_favorite;

    const badges = [];
    if (this.isNew(flow)) badges.push('<span class="flow-card-badge flow-card-badge--new">Nuevo</span>');
    if (this.isTrending(flow)) badges.push('<span class="flow-card-badge flow-card-badge--trending">Trending</span>');
    const t = flow.flow_category_type || 'manual';
    const isAutopilotLike = (t === 'autopilot' || t === 'scraping');
    if (isAutopilotLike) badges.push('<span class="flow-card-badge flow-card-badge--auto">Autopilot</span>');
    const img = flow.flow_image_url
      ? `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-card-img" loading="lazy">`
      : `<div class="flow-card-placeholder"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i></div>`;

    const tags = [];
    if (flow._categoryName) tags.push(this.escapeHtml(flow._categoryName));
    if (flow._subcategoryName) tags.push(this.escapeHtml(flow._subcategoryName));
    if (isAutopilotLike) tags.push('Autopilot');
    const tagsHtml = tags.map(t => `<span class="flow-card-tag">${t}</span>`).join('');

    const categoryName = flow._categoryName ? this.escapeHtml(flow._categoryName) : '—';
    const subcategoryName = flow._subcategoryName ? this.escapeHtml(flow._subcategoryName) : '—';
    const outputTypeLabel = this.getOutputTypeLabel(flow.output_type);
    const executionLabel = this.getExecutionModeLabel(flow.execution_mode);
    const version = (flow.version || '1.0.0').toString();

    return `
      <article class="flow-card flow-card--catalog" data-flow-id="${flow.id}" role="button" tabindex="0">
        <div class="flow-card-media">
          ${img}
          <div class="flow-card-media-veil" aria-hidden="true"></div>
          <div class="flow-card-badges">${badges.join('')}</div>
          <div class="flow-card-icons flow-card-icons--default">
            <button type="button" class="flow-card-icon-btn flow-card-icon-like ${isLiked ? 'is-active' : ''}" data-action="like" title="Like" aria-label="Like"><i class="fas fa-heart"></i><span class="flow-card-icon-count">${likes}</span></button>
            <span class="flow-card-icon-stat" title="Ejecuciones"><i class="fas fa-play"></i><span class="flow-card-icon-count">${runs}</span></span>
            <button type="button" class="flow-card-icon-btn flow-card-icon-save ${isSaved ? 'is-active' : ''}" data-action="save" title="Guardar" aria-label="Guardar"><i class="fas fa-bookmark"></i><span class="flow-card-icon-count">${saves}</span></button>
          </div>
          <div class="flow-card-overlay flow-card-overlay--default">
            <h3 class="flow-card-title">${name}</h3>
            ${tagsHtml ? `<div class="flow-card-tags flow-card-tags--default">${tagsHtml}</div>` : ''}
          </div>
          <div class="flow-card-overlay flow-card-overlay--hover">
            <div class="flow-card-hover-content">
              <div class="flow-card-credits">${cost}</div>
              <div class="flow-card-meta-list">
                <span class="flow-card-meta-item">${categoryName}</span>
                <span class="flow-card-meta-item">${subcategoryName}</span>
                <span class="flow-card-meta-item">${outputTypeLabel}</span>
                <span class="flow-card-meta-item">${executionLabel}</span>
                <span class="flow-card-meta-item">v${version}</span>
              </div>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Slide de hero: portada de categoría a pantalla completa, degradado abajo, minimalista.
   */
  renderHeroSlide(category) {
    const name = this.escapeHtml(category.name);
    const desc = category.description ? this.escapeHtml(category.description.slice(0, 140)) + (category.description.length > 140 ? '…' : '') : '';
    const coverUrl = category.cover_url || '';
    const isVideo = (category.cover_type || '').toLowerCase() === 'video';
    const bg = coverUrl
      ? (isVideo
          ? `<video class="flow-hero-slide-bg-media flow-hero-slide-video" src="${this.escapeHtml(coverUrl)}" muted loop playsinline aria-hidden="true"></video>`
          : `<img src="${this.escapeHtml(coverUrl)}" alt="" class="flow-hero-slide-bg-media">`)
      : `<div class="flow-hero-slide-placeholder"><i class="fas fa-layer-group"></i></div>`;
    return `
      <div class="flow-hero-slide" data-category-id="${this.escapeHtml(category.id)}">
        <div class="flow-hero-slide-bg">${bg}</div>
        <div class="flow-hero-slide-overlay">
          <div class="flow-hero-slide-content">
            <h2 class="flow-hero-slide-title">${name}</h2>
            ${desc ? `<p class="flow-hero-slide-desc">${desc}</p>` : ''}
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
    if (this.heroAutoAdvanceTimer) {
      clearInterval(this.heroAutoAdvanceTimer);
      this.heroAutoAdvanceTimer = null;
    }
    if (list.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    track.innerHTML = list.map(c => this.renderHeroSlide(c)).join('');
    track.querySelectorAll('.flow-hero-slide-cta, .flow-hero-slide').forEach(el => {
      const categoryId = el.dataset.categoryId || el.closest('[data-category-id]')?.dataset?.categoryId;
      if (categoryId) {
        el.addEventListener('click', (e) => {
          if (el.classList.contains('flow-hero-slide-cta')) e.preventDefault();
          const path = this.getCatalogPath(categoryId);
          if (window.router) {
            e.preventDefault();
            window.router.navigate(path);
          } else {
            window.location.href = path;
          }
        });
      }
    });
    track.querySelectorAll('.flow-hero-slide-video').forEach(video => {
      const slide = video.closest('.flow-hero-slide');
      if (!slide) return;
      slide.addEventListener('mouseenter', () => { video.play().catch(() => {}); });
      slide.addEventListener('mouseleave', () => { video.pause(); });
    });
    if (list.length > 1) {
      this.heroAutoAdvanceTimer = setInterval(() => {
        const maxScroll = track.scrollWidth - track.offsetWidth;
        if (maxScroll <= 0) return;
        const next = track.scrollLeft + track.offsetWidth;
        track.scrollTo({ left: next > maxScroll ? 0 : next, behavior: 'smooth' });
      }, 40000);
    }
  }

  async onLeave() {
    if (this.heroAutoAdvanceTimer) {
      clearInterval(this.heroAutoAdvanceTimer);
      this.heroAutoAdvanceTimer = null;
    }
    if (document && document.body) {
      document.body.classList.remove('route-flows');
    }
  }

  /**
   * Categorías visuales: grid por content_subcategories (schema 254-261).
   * Solo se muestran subcategorías que tienen al menos 1 flujo; si ninguna tiene flujos, la sección entera se oculta.
   */
  renderCategoriesVisualGrid() {
    const section = document.getElementById('sectionCategories');
    const grid = document.getElementById('categoriesVisualGrid');
    if (!section || !grid) return;
    const subcategoriesWithCount = this.subcategories
      .map(sub => ({
        ...sub,
        count: this.flows.filter(f => f.subcategory_id === sub.id).length
      }))
      .filter(sub => sub.count > 0);
    const hasAnyFlows = this.flows.length > 0;
    if (!hasAnyFlows && subcategoriesWithCount.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    const basePath = this.getCatalogPath();
    const onHome = !this.selectedSubcategoryId && !this.selectedCategoryId;
    const cards = [
      { id: '', name: 'Todos', count: onHome ? this.flows.length : 0, isSub: false },
      ...subcategoriesWithCount.map(sub => ({ ...sub, isSub: true }))
    ];
    grid.innerHTML = cards.map(item => {
      const href = item.isSub && item.id ? this.getCatalogPathForSubcategory(item.id) : basePath;
      const isActive = !this.selectedSubcategoryId && !this.selectedCategoryId && !item.id
        ? true
        : this.selectedSubcategoryId === item.id;
      const dataAttr = `data-subcategory-id="${this.escapeHtml(item.id || '')}"`;
      const countText = item.count > 0 ? `${item.count} flujo${item.count !== 1 ? 's' : ''}` : '';
      return `
        <a href="${this.escapeHtml(href)}" class="flow-catalog-category-card ${isActive ? 'active' : ''}" ${dataAttr}>
          <span class="flow-catalog-category-card-name">${this.escapeHtml(item.name)}</span>
          ${countText ? `<span class="flow-catalog-category-card-count">${countText}</span>` : ''}
        </a>
      `;
    }).join('');
    grid.querySelectorAll('a[data-subcategory-id]').forEach(link => {
      link.addEventListener('click', (e) => {
        const id = link.getAttribute('data-subcategory-id');
        const path = id ? this.getCatalogPathForSubcategory(id) : this.getCatalogPath();
        if (window.router) {
          e.preventDefault();
          window.router.navigate(path);
        }
      });
    });
  }

  renderCategoriesStrip() {
    const strip = document.getElementById('categoriesStrip');
    if (!strip) return;
    const basePath = this.getCatalogPath();
    strip.innerHTML = [
      { id: '', name: 'Todos' },
      ...this.categories
    ].map(cat => `
      <a href="${this.escapeHtml(cat.id ? this.getCatalogPath(cat.id) : basePath)}" class="flow-catalog-category-chip ${!cat.id && !this.selectedCategoryId ? 'active' : ''} ${this.selectedCategoryId === cat.id ? 'active' : ''}" data-category-id="${this.escapeHtml(cat.id || '')}">
        ${this.escapeHtml(cat.name)}
      </a>
    `).join('');
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
    strip.innerHTML = this.subcategoriesInCategory.map(sub => `
      <button type="button" class="flow-catalog-category-chip flow-catalog-sub-chip" data-subcategory-id="${this.escapeHtml(sub.id)}">
        ${this.escapeHtml(sub.name)}
      </button>
    `).join('');
    strip.querySelectorAll('[data-subcategory-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const subId = btn.getAttribute('data-subcategory-id');
        document.querySelectorAll('#galleryBySub .flow-catalog-sub-row').forEach(row => {
          row.style.display = row.dataset.subcategoryId === subId ? '' : 'none';
        });
        strip.querySelectorAll('.flow-catalog-sub-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
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

  /** Continuar donde lo dejaste: solo runs recientes del usuario; sección oculta si no hay runs. */
  renderSectionSaved() {
    const recent = this.getRecentFlows();
    this.renderRow('rowSaved', recent, '');
  }

  renderSectionLiked() {
    const liked = this.getLikedFlows();
    this.renderRow('rowLiked', liked, 'Valora flujos con 4+ estrellas para verlos aquí.');
  }

  renderSectionRecent() {
    const recent = this.getRecentFlows();
    this.renderRow('rowRecent', recent, 'Usa flujos para ver aquí los recientes.');
  }

  renderSectionRecommended() {
    const rec = this.getRecommendedFlows();
    this.renderRow('rowRecommended', rec, 'No hay recomendaciones aún.');
  }

  renderSectionTrending() {
    const trend = this.getTrendingFlows();
    this.renderRow('rowTrending', trend, '');
  }

  renderSectionLoved() {
    const loved = this.getLovedFlows();
    this.renderRow('rowLoved', loved, '');
  }

  /**
   * Sección Todos los flujos: mismo catálogo por categoría y subcategoría (content_categories → content_subcategories).
   */
  renderSectionAllFlows() {
    const section = document.getElementById('sectionAllFlows');
    const gallery = document.getElementById('galleryAllByCategorySub');
    if (!section || !gallery) return;
    const data = this.getFlowsByCategoryAndSubcategory();
    if (data.length === 0) {
      section.style.display = 'none';
      gallery.innerHTML = '';
      return;
    }
    section.style.display = '';
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

  renderGalleryBySubcategoryHome() {
    const gallery = document.getElementById('galleryBySubHome');
    if (!gallery) return;
    const rows = this.getFlowsBySubcategoryHome();
    if (rows.length === 0) {
      gallery.closest('.flow-catalog-row-section').style.display = 'none';
      gallery.innerHTML = '';
      return;
    }
    gallery.closest('.flow-catalog-row-section').style.display = '';
    gallery.innerHTML = rows.map(({ sub, flows }) => `
      <section class="flow-catalog-sub-row flow-catalog-row-section">
        <h3 class="flow-catalog-row-title">${this.escapeHtml(sub?.name || '')}</h3>
        <div class="flow-catalog-row-scroll">${flows.map(f => this.renderFlowCard(f)).join('')}</div>
      </section>
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
    if (rows.length === 0) {
      gallery.innerHTML = '';
      gallery.closest('.flow-catalog-gallery-by-sub')?.style.setProperty('display', 'none');
      return;
    }
    gallery.closest('.flow-catalog-gallery-by-sub')?.style.removeProperty('display');
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
  }

  bindCategoryClicks() {
    const strip = document.getElementById('categoriesStrip');
    if (!strip) return;
    strip.querySelectorAll('a[data-category-id]').forEach(link => {
      link.addEventListener('click', (e) => {
        const id = link.getAttribute('data-category-id');
        const path = id ? this.getCatalogPath(id) : this.getCatalogPath();
        if (window.router) {
          e.preventDefault();
          window.router.navigate(path);
        }
      });
    });
  }

  /**
   * Enlaza click en card y botones like/save para todas las .flow-card dentro del contenedor.
   */
  bindFlowCardListeners(container) {
    if (!container) return;
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
    const fav = this.favorites.find(f => f.flow_id === flowId);
    const isLiked = fav && fav.rating != null && fav.rating >= 4;
    try {
      const { data: existing } = await this.supabase.from('user_flow_favorites').select('id').eq('user_id', this.userId).eq('flow_id', flowId).maybeSingle();
      if (existing) {
        await this.supabase.from('user_flow_favorites').update(isLiked ? { rating: null } : { is_favorite: true, rating: 5 }).eq('id', existing.id);
      } else if (!isLiked) {
        await this.supabase.from('user_flow_favorites').insert({ user_id: this.userId, flow_id: flowId, is_favorite: true, rating: 5 });
      }
    } catch (e) {
      console.error('toggleLike:', e);
      return;
    }
    if (flow) flow.likes_count = Math.max(0, (flow.likes_count || 0) + (isLiked ? -1 : 1));
    const idx = this.favorites.findIndex(f => f.flow_id === flowId);
    if (isLiked && idx >= 0) this.favorites[idx].rating = null;
    else if (!isLiked) {
      if (idx >= 0) this.favorites[idx].rating = 5;
      else this.favorites.push({ flow_id: flowId, is_favorite: true, rating: 5 });
    }
    this.updateCardLikeSaveUI(cardEl, flow);
  }

  async toggleSave(flowId, cardEl) {
    if (!this.supabase || !this.userId) return;
    const flow = this.flowsById.get(flowId) || this.flows.find(f => f.id === flowId);
    const fav = this.favorites.find(f => f.flow_id === flowId);
    const isSaved = fav && fav.is_favorite;
    try {
      const { data: existing } = await this.supabase.from('user_flow_favorites').select('id').eq('user_id', this.userId).eq('flow_id', flowId).maybeSingle();
      if (existing) {
        await this.supabase.from('user_flow_favorites').update({ is_favorite: !isSaved }).eq('id', existing.id);
      } else if (!isSaved) {
        await this.supabase.from('user_flow_favorites').insert({ user_id: this.userId, flow_id: flowId, is_favorite: true });
      }
    } catch (e) {
      console.error('toggleSave:', e);
      return;
    }
    if (flow) flow.saves_count = Math.max(0, (flow.saves_count || 0) + (isSaved ? -1 : 1));
    if (isSaved && fav) fav.is_favorite = false;
    else if (!isSaved) {
      const idx = this.favorites.findIndex(f => f.flow_id === flowId);
      if (idx >= 0) this.favorites[idx].is_favorite = true;
      else this.favorites.push({ flow_id: flowId, is_favorite: true });
    }
    this.updateCardLikeSaveUI(cardEl, flow);
  }

  updateCardLikeSaveUI(cardEl, flow) {
    if (!cardEl || !flow) return;
    const likeBtn = cardEl.querySelector('.flow-card-icon-like');
    const saveBtn = cardEl.querySelector('.flow-card-icon-save');
    if (likeBtn) {
      likeBtn.classList.toggle('is-active', this.favorites.some(f => f.flow_id === flow.id && f.rating != null && f.rating >= 4));
      const countEl = likeBtn.querySelector('.flow-card-icon-count');
      if (countEl) countEl.textContent = flow.likes_count ?? 0;
    }
    if (saveBtn) {
      saveBtn.classList.toggle('is-active', this.favorites.some(f => f.flow_id === flow.id && f.is_favorite));
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
