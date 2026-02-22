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
      window.router?.navigate('/hogar');
      return;
    }
    localStorage.setItem('selectedOrganizationId', this.organizationId);
    this.selectedCategoryId = this.routeParams?.categoryId || null;
  }

  getStudioPath() {
    return this.organizationId ? `/org/${this.organizationId}/studio` : '/studio';
  }

  getCatalogPath(categoryId) {
    const base = this.organizationId ? `/org/${this.organizationId}/studio/catalog` : '/studio/catalog';
    return categoryId ? `${base}/${categoryId}` : base;
  }

  renderHTML() {
    const isCategoryView = !!this.selectedCategoryId;
    return `
      <div class="flow-catalog" id="flowCatalogContainer">
        <div class="flow-catalog-loading" id="flowCatalogLoading">
          <i class="fas fa-circle-notch fa-spin"></i>
          <p>Cargando catálogo...</p>
        </div>
        <div class="flow-catalog-content" id="flowCatalogContent" style="display: none;">
          <!-- HERO: carousel horizontal (nuevos en home / populares en categoría) -->
          <section class="flow-catalog-hero-section" id="flowCatalogHeroSection">
            <div class="flow-catalog-hero-track" id="flowCatalogHeroTrack"></div>
            <button type="button" class="flow-catalog-hero-nav flow-catalog-hero-prev" id="heroPrev" aria-label="Anterior"><i class="fas fa-chevron-left"></i></button>
            <button type="button" class="flow-catalog-hero-nav flow-catalog-hero-next" id="heroNext" aria-label="Siguiente"><i class="fas fa-chevron-right"></i></button>
          </section>

          <!-- Continue where you left off / Guardados (solo home) -->
          ${!isCategoryView ? `
          <section class="flow-catalog-row-section" id="sectionSaved">
            <h2 class="flow-catalog-row-title">Continuar donde lo dejaste</h2>
            <div class="flow-catalog-row-scroll" id="rowSaved"></div>
          </section>` : ''}

          <!-- Categorías principales (strip horizontal) -->
          <section class="flow-catalog-row-section" id="sectionCategories">
            <h2 class="flow-catalog-row-title">Explorar por intención</h2>
            <div class="flow-catalog-categories-strip" id="categoriesStrip"></div>
          </section>

          ${!isCategoryView ? `
          <!-- Flujos que te han gustado (rating >= 4) -->
          <section class="flow-catalog-row-section" id="sectionLiked">
            <h2 class="flow-catalog-row-title">Flujos que te han gustado</h2>
            <div class="flow-catalog-row-scroll" id="rowLiked"></div>
          </section>

          <!-- Últimos utilizados -->
          <section class="flow-catalog-row-section" id="sectionRecent">
            <h2 class="flow-catalog-row-title">Últimos flujos utilizados</h2>
            <div class="flow-catalog-row-scroll" id="rowRecent"></div>
          </section>

          <!-- Recomendados para ti -->
          <section class="flow-catalog-row-section" id="sectionRecommended">
            <h2 class="flow-catalog-row-title">Flujos que te podrían interesar</h2>
            <div class="flow-catalog-row-scroll" id="rowRecommended"></div>
          </section>

          <!-- En tendencia -->
          <section class="flow-catalog-row-section" id="sectionTrending">
            <h2 class="flow-catalog-row-title">Flujos en tendencia</h2>
            <div class="flow-catalog-row-scroll" id="rowTrending"></div>
          </section>

          <!-- Amados por el público -->
          <section class="flow-catalog-row-section" id="sectionLoved">
            <h2 class="flow-catalog-row-title">Flujos amados por el público</h2>
            <div class="flow-catalog-row-scroll" id="rowLoved"></div>
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
        <!-- Drawer expanded view (click en card) -->
        <div class="flow-catalog-drawer" id="flowCatalogDrawer" aria-hidden="true">
          <div class="flow-catalog-drawer-backdrop" id="flowCatalogDrawerBackdrop"></div>
          <div class="flow-catalog-drawer-panel" id="flowCatalogDrawerPanel">
            <button type="button" class="flow-catalog-drawer-close" id="flowCatalogDrawerClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
            <div class="flow-catalog-drawer-content" id="flowCatalogDrawerContent"></div>
          </div>
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
      this.loadSubcategories(),
      this.loadFlows()
    ]);
    this.enrichFlowsWithCategories();
    if (this.userId) {
      await Promise.all([
        this.loadFavorites(),
        this.loadRecentRuns()
      ]);
    }
    if (this.selectedCategoryId) {
      this.computeSubcategoriesInCategory();
    }

    document.getElementById('flowCatalogLoading').style.display = 'none';
    document.getElementById('flowCatalogContent').style.display = 'block';

    this.renderHero();
    this.renderCategoriesStrip();
    if (this.selectedCategoryId) {
      this.renderSubcategoriesStrip();
      this.renderRecentInCategory();
      this.renderGalleryBySubcategory();
    } else {
      this.renderSectionSaved();
      this.renderSectionLiked();
      this.renderSectionRecent();
      this.renderSectionRecommended();
      this.renderSectionTrending();
      this.renderSectionLoved();
    }
    this.bindHeroNav();
    this.bindCategoryClicks();
    this.bindCardInteractions();
    this.bindDrawer();
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
        .select('id, name, description, order_index')
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

  async loadFlows() {
    if (!this.supabase) return;
    try {
      let q = this.supabase
        .from('content_flows')
        .select('id, name, description, token_cost, output_type, flow_image_url, category_id, subcategory_id, flow_category_type, execution_mode, execution_strategy, likes_count, saves_count, run_count, created_at, status, version, ui_layout_config')
        .eq('is_active', true)
        .eq('show_in_catalog', true);
      if (this.selectedCategoryId) {
        q = q.eq('category_id', this.selectedCategoryId);
      }
      const { data, error } = await q.order('created_at', { ascending: false });
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

  getHeroFlows() {
    const published = this.getPublishedFlows();
    if (this.selectedCategoryId) {
      return [...published].sort((a, b) => {
        const scoreA = (a.run_count || 0) + (a.likes_count || 0) + (a.saves_count || 0);
        const scoreB = (b.run_count || 0) + (b.likes_count || 0) + (b.saves_count || 0);
        return scoreB - scoreA;
      }).slice(0, 10);
    }
    return [...published].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 10);
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
      .filter(f => f && f.category_id === this.selectedCategoryId);
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

  isNew(flow) {
    if (!flow.created_at) return false;
    const days = (Date.now() - new Date(flow.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 7;
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

  /** Un solo badge por card: NUEVO (< 7 días) > TRENDING > DRAFT */
  getCardBadge(flow) {
    if (this.isNew(flow)) return { class: 'flow-card-badge--new', text: 'Nuevo' };
    if (this.isTrending(flow)) return { class: 'flow-card-badge--trending', text: 'Trending' };
    if ((flow.status || '').toLowerCase() === 'draft') return { class: 'flow-card-badge--draft', text: 'Borrador' };
    return null;
  }

  getExecutionModeLabel(mode) {
    const m = (mode || '').toLowerCase();
    if (m === 'multi_step' || m === 'sequential') return 'Multi-paso';
    return 'Un paso';
  }

  getFlowCategoryTypeLabel(type) {
    const t = (type || 'manual').toLowerCase();
    return t === 'automated' ? 'Automático' : 'Manual';
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

  isFlowSaved(flowId) {
    return this.favorites.some(f => f.flow_id === flowId);
  }

  isFlowLiked(flowId) {
    return this.favorites.some(f => f.flow_id === flowId && f.rating != null && f.rating >= 4);
  }

  renderFlowCard(flow, options = {}) {
    const name = this.escapeHtml(flow.name);
    const desc = flow.description
      ? this.escapeHtml(flow.description.slice(0, 85)) + (flow.description.length > 85 ? '…' : '')
      : '';
    const cost = flow.token_cost ?? 1;
    const likes = flow.likes_count || 0;
    const saves = flow.saves_count || 0;
    const runs = flow.run_count || 0;
    const showStats = runs > 0 || likes > 0 || saves > 0;
    const badge = this.getCardBadge(flow);
    const badgeHtml = badge
      ? `<span class="flow-card-badge ${badge.class}">${this.escapeHtml(badge.text)}</span>`
      : '';
    const img = flow.flow_image_url
      ? `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-card-img" loading="lazy">`
      : `<div class="flow-card-placeholder"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i><span class="flow-card-placeholder-name">${name}</span></div>`;
    const outputTypeLabel = this.getOutputTypeLabel(flow.output_type);
    const executionLabel = this.getExecutionModeLabel(flow.execution_mode);
    const categoryTypeLabel = this.getFlowCategoryTypeLabel(flow.flow_category_type);
    const isSaved = this.isFlowSaved(flow.id);
    const isLiked = this.isFlowLiked(flow.id);
    const chips = [
      outputTypeLabel,
      executionLabel,
      categoryTypeLabel
    ].map(l => `<span class="flow-card-chip">${this.escapeHtml(l)}</span>`).join('');
    return `
      <article class="flow-card flow-card--catalog" data-flow-id="${flow.id}" role="button" tabindex="0">
        <div class="flow-card-hero">
          <div class="flow-card-media-inner">${img}</div>
          <div class="flow-card-badges">${badgeHtml}</div>
        </div>
        <div class="flow-card-overlay">
          <h3 class="flow-card-title">${name}</h3>
          ${desc ? `<p class="flow-card-desc">${desc}</p>` : ''}
          <div class="flow-card-chips">${chips}</div>
          <div class="flow-card-stats">
            ${showStats ? `
            <span class="flow-card-stat"><i class="fas fa-play"></i> ${runs}</span>
            <span class="flow-card-stat"><i class="fas fa-heart"></i> ${likes}</span>
            <span class="flow-card-stat"><i class="fas fa-bookmark"></i> ${saves}</span>
            ` : (this.isNew(flow) ? '<span class="flow-card-stat flow-card-stat--new">Nuevo</span>' : '')}
            <span class="flow-card-actions-icons">
              <button type="button" class="flow-card-icon-btn flow-card-like ${isLiked ? 'is-active' : ''}" data-flow-id="${flow.id}" data-action="like" aria-label="Me gusta"><i class="fas fa-heart"></i></button>
              <button type="button" class="flow-card-icon-btn flow-card-save ${isSaved ? 'is-active' : ''}" data-flow-id="${flow.id}" data-action="save" aria-label="Guardar"><i class="fas fa-bookmark"></i></button>
            </span>
          </div>
          <div class="flow-card-cta-row">
            <span class="flow-card-cost-pill"><i class="fas fa-coins"></i> ${cost}</span>
            <button type="button" class="flow-card-cta" data-flow-id="${flow.id}">Iniciar</button>
          </div>
        </div>
      </article>
    `;
  }

  renderHeroSlide(flow) {
    const name = this.escapeHtml(flow.name);
    const desc = flow.description ? this.escapeHtml(flow.description.slice(0, 120)) + (flow.description.length > 120 ? '…' : '') : '';
    const img = flow.flow_image_url
      ? `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="" class="flow-hero-slide-img">`
      : `<div class="flow-hero-slide-placeholder"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i></div>`;
    return `
      <div class="flow-hero-slide" data-flow-id="${flow.id}">
        <div class="flow-hero-slide-inner">
          <div class="flow-hero-slide-content">
            <h2 class="flow-hero-slide-title">${this.escapeHtml(flow.description ? flow.description.slice(0, 50) : flow.name)}</h2>
            <p class="flow-hero-slide-sub">${name}</p>
            ${desc ? `<p class="flow-hero-slide-desc">${desc}</p>` : ''}
            <button type="button" class="flow-hero-slide-cta" data-flow-id="${flow.id}">Iniciar flujo</button>
          </div>
          <div class="flow-hero-slide-media">${img}</div>
        </div>
      </div>
    `;
  }

  renderHero() {
    const list = this.getHeroFlows();
    const track = document.getElementById('flowCatalogHeroTrack');
    if (!track) return;
    if (list.length === 0) {
      track.innerHTML = '<div class="flow-hero-slide flow-hero-empty"><p>No hay flujos destacados</p></div>';
      return;
    }
    track.innerHTML = list.map(f => this.renderHeroSlide(f)).join('');
    track.querySelectorAll('.flow-hero-slide-cta, .flow-hero-slide').forEach(el => {
      const flowId = el.dataset.flowId || el.closest('[data-flow-id]')?.dataset?.flowId;
      if (flowId) {
        el.addEventListener('click', (e) => {
          if (e.target.classList.contains('flow-hero-slide-cta')) e.preventDefault();
          this.openFlow(flowId);
        });
      }
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
    const strip = document.getElementById('subcategoriesStrip');
    if (!strip) return;
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
  }

  renderSectionSaved() {
    const saved = this.getSavedFlows();
    this.renderRow('rowSaved', saved, 'Aún no tienes flujos guardados.');
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

  renderRecentInCategory() {
    const list = this.getRecentInCategoryFlows();
    this.renderRow('rowRecentCategory', list, 'Aún no has usado flujos en esta categoría.');
  }

  renderGalleryBySubcategory() {
    const gallery = document.getElementById('galleryBySub');
    if (!gallery) return;
    const rows = this.getFlowsBySubcategory();
    if (rows.length === 0) {
      gallery.innerHTML = '';
      return;
    }
    gallery.innerHTML = rows.map(({ sub, flows }) => `
      <section class="flow-catalog-sub-row flow-catalog-row-section" data-subcategory-id="${this.escapeHtml(sub?.id || '')}">
        <h2 class="flow-catalog-row-title">${this.escapeHtml(sub?.name || '')}</h2>
        <div class="flow-catalog-row-scroll">${flows.map(f => this.renderFlowCard(f)).join('')}</div>
      </section>
    `).join('');
    gallery.querySelectorAll('.flow-catalog-sub-row').forEach(row => {
      const subId = row.querySelector('.flow-card')?.closest('.flow-catalog-sub-row')?.dataset?.subcategoryId;
      if (subId) row.dataset.subcategoryId = subId;
    });
  }

  bindHeroNav() {
    const track = document.getElementById('flowCatalogHeroTrack');
    const prev = document.getElementById('heroPrev');
    const next = document.getElementById('heroNext');
    if (!track || !prev || !next) return;
    const scroll = (dir) => {
      const step = track.offsetWidth * 0.8;
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    };
    prev.addEventListener('click', () => scroll(-1));
    next.addEventListener('click', () => scroll(1));
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

  bindCardInteractions() {
    document.querySelectorAll('#flowCatalogContent .flow-catalog-row-scroll').forEach(el => this.attachCardListeners(el));
  }

  attachCardListeners(container) {
    if (!container) return;
    container.querySelectorAll('.flow-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.flow-card-cta, .flow-card-icon-btn')) return;
        const flow = this.flowsById.get(card.dataset.flowId);
        if (flow) this.openDrawer(flow);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
    });
    container.querySelectorAll('.flow-card-cta').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.openFlow(btn.dataset.flowId);
      });
    });
    container.querySelectorAll('.flow-card-like').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this.toggleLike(btn.dataset.flowId, btn); });
    });
    container.querySelectorAll('.flow-card-save').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this.toggleSave(btn.dataset.flowId, btn); });
    });
  }

  openDrawer(flow) {
    const drawer = document.getElementById('flowCatalogDrawer');
    const content = document.getElementById('flowCatalogDrawerContent');
    if (!drawer || !content) return;
    content.innerHTML = this.renderDrawerContent(flow);
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    content.querySelector('.flow-catalog-drawer-cta')?.addEventListener('click', () => this.openFlow(flow.id));
    content.querySelectorAll('.flow-card-like').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); this.toggleLike(flow.id, btn); }));
    content.querySelectorAll('.flow-card-save').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); this.toggleSave(flow.id, btn); }));
  }

  closeDrawer() {
    const drawer = document.getElementById('flowCatalogDrawer');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  renderDrawerContent(flow) {
    const name = this.escapeHtml(flow.name);
    const desc = flow.description ? this.escapeHtml(flow.description) : '';
    const cost = flow.token_cost ?? 1;
    const outputLabel = this.getOutputTypeLabel(flow.output_type);
    const isSaved = this.isFlowSaved(flow.id);
    const isLiked = this.isFlowLiked(flow.id);
    const img = flow.flow_image_url
      ? `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-catalog-drawer-img">`
      : '';
    const inputsNote = flow.ui_layout_config && Object.keys(flow.ui_layout_config).length
      ? '<p class="flow-catalog-drawer-meta"><strong>Inputs:</strong> según configuración del flujo.</p>'
      : '';
    return `
      <div class="flow-catalog-drawer-body">
        ${img}
        <h2 class="flow-catalog-drawer-title">${name}</h2>
        ${desc ? `<div class="flow-catalog-drawer-desc">${desc}</div>` : ''}
        <p class="flow-catalog-drawer-meta"><strong>Salida:</strong> ${this.escapeHtml(outputLabel)} · <strong>Costo:</strong> ${cost} crédito(s)</p>
        ${inputsNote}
        <div class="flow-catalog-drawer-actions">
          <button type="button" class="flow-card-icon-btn flow-card-like ${isLiked ? 'is-active' : ''}" data-flow-id="${flow.id}" aria-label="Me gusta"><i class="fas fa-heart"></i></button>
          <button type="button" class="flow-card-icon-btn flow-card-save ${isSaved ? 'is-active' : ''}" data-flow-id="${flow.id}" aria-label="Guardar"><i class="fas fa-bookmark"></i></button>
          <button type="button" class="flow-catalog-drawer-cta">Iniciar</button>
        </div>
      </div>
    `;
  }

  bindDrawer() {
    const backdrop = document.getElementById('flowCatalogDrawerBackdrop');
    const closeBtn = document.getElementById('flowCatalogDrawerClose');
    [backdrop, closeBtn].forEach(el => {
      if (el) el.addEventListener('click', () => this.closeDrawer());
    });
  }

  async toggleSave(flowId, buttonEl) {
    if (!this.userId) {
      if (window.router) window.router.navigate('/login', true);
      return;
    }
    const isSaved = this.isFlowSaved(flowId);
    if (buttonEl) {
      buttonEl.classList.toggle('is-active', !isSaved);
      buttonEl.disabled = true;
    }
    try {
      if (isSaved) {
        await this.supabase.from('user_flow_favorites').delete().eq('user_id', this.userId).eq('flow_id', flowId);
        this.favorites = this.favorites.filter(f => f.flow_id !== flowId);
      } else {
        const { data: existing } = await this.supabase.from('user_flow_favorites').select('id').eq('user_id', this.userId).eq('flow_id', flowId).maybeSingle();
        if (existing) {
          await this.supabase.from('user_flow_favorites').update({ is_favorite: true, last_used_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await this.supabase.from('user_flow_favorites').insert({ user_id: this.userId, flow_id: flowId, is_favorite: true, last_used_at: new Date().toISOString() });
        }
        this.favorites.push({ flow_id: flowId, is_favorite: true });
      }
      const flow = this.flowsById.get(flowId);
      if (flow) flow.saves_count = Math.max(0, (flow.saves_count || 0) + (isSaved ? -1 : 1));
      this.updateCardStats(flowId);
    } catch (e) {
      console.error('FlowCatalog toggleSave:', e);
      if (buttonEl) buttonEl.classList.toggle('is-active', isSaved);
    }
    if (buttonEl) buttonEl.disabled = false;
  }

  async toggleLike(flowId, buttonEl) {
    if (!this.userId) {
      if (window.router) window.router.navigate('/login', true);
      return;
    }
    const isLiked = this.isFlowLiked(flowId);
    if (buttonEl) {
      buttonEl.classList.toggle('is-active', !isLiked);
      buttonEl.disabled = true;
    }
    try {
      const { data: row } = await this.supabase.from('user_flow_favorites').select('id').eq('user_id', this.userId).eq('flow_id', flowId).maybeSingle();
      if (isLiked) {
        if (row) await this.supabase.from('user_flow_favorites').update({ rating: null }).eq('id', row.id);
        this.favorites = this.favorites.map(f => f.flow_id === flowId ? { ...f, rating: null } : f);
      } else {
        const payload = { user_id: this.userId, flow_id: flowId, is_favorite: true, rating: 5, last_used_at: new Date().toISOString() };
        if (row) await this.supabase.from('user_flow_favorites').update({ rating: 5, last_used_at: payload.last_used_at }).eq('id', row.id);
        else await this.supabase.from('user_flow_favorites').insert(payload);
        const idx = this.favorites.findIndex(f => f.flow_id === flowId);
        if (idx >= 0) this.favorites[idx] = { ...this.favorites[idx], rating: 5 };
        else this.favorites.push({ flow_id: flowId, is_favorite: true, rating: 5 });
      }
      const flow = this.flowsById.get(flowId);
      if (flow) flow.likes_count = Math.max(0, (flow.likes_count || 0) + (isLiked ? -1 : 1));
      this.updateCardStats(flowId);
    } catch (e) {
      console.error('FlowCatalog toggleLike:', e);
      if (buttonEl) buttonEl.classList.toggle('is-active', isLiked);
    }
    if (buttonEl) buttonEl.disabled = false;
  }

  updateCardStats(flowId) {
    const flow = this.flowsById.get(flowId);
    if (!flow) return;
    const card = document.querySelector(`.flow-card[data-flow-id="${flowId}"]`);
    if (!card) return;
    card.querySelectorAll('.flow-card-stat').forEach(el => {
      const icon = el.querySelector('i');
      if (!icon) return;
      if (icon.classList.contains('fa-play')) el.innerHTML = `<i class="fas fa-play"></i> ${flow.run_count || 0}`;
      else if (icon.classList.contains('fa-heart')) el.innerHTML = `<i class="fas fa-heart"></i> ${flow.likes_count || 0}`;
      else if (icon.classList.contains('fa-bookmark')) el.innerHTML = `<i class="fas fa-bookmark"></i> ${flow.saves_count || 0}`;
    });
  }

  openFlow(flowId) {
    if (window.appState) window.appState.set('selectedFlowId', flowId, true);
    else localStorage.setItem('selectedFlowId', flowId);
    if (window.router) window.router.navigate(this.getStudioPath());
  }
}

window.FlowCatalogView = FlowCatalogView;
