/**
 * FlowCatalogView - Catálogo en 3 capas: Inspiración (Hero + Objectives),
 * Descubrimiento (Quick Start + Trending), Exploración (Categories + Grid).
 * - content_categories = intenciones. content_subcategories = temas profesionales.
 */
class FlowCatalogView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.flows = [];
    this.categories = [];
    this.subcategories = [];
    this.recentlyUsedFlowIds = [];
    this.favoriteFlowIds = [];
    this.searchQuery = '';
    this.selectedCategoryId = null;
    this.selectedSubcategoryId = null;
    this.selectedObjectiveId = null;
    this.sortBy = 'score'; // score | name | cost | new
  }

  static OBJECTIVES = [
    { id: 'comercial', label: 'Comercial de producto', icon: 'fa-box-open' },
    { id: 'social', label: 'Social media content', icon: 'fa-share-alt' },
    { id: 'lanzamientos', label: 'Lanzamientos', icon: 'fa-rocket' },
    { id: 'branding', label: 'Branding & storytelling', icon: 'fa-palette' },
    { id: 'educacion', label: 'Educación / tutoriales', icon: 'fa-graduation-cap' },
    { id: 'experiencia', label: 'Experiencia / espacios', icon: 'fa-cube' },
    { id: 'automatizacion', label: 'Automatización / always-on', icon: 'fa-bolt' }
  ];

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
  }

  getStudioPath() {
    return this.organizationId ? `/org/${this.organizationId}/studio` : '/studio';
  }

  renderHTML() {
    return `
      <div class="flow-catalog" id="flowCatalogContainer">
        <!-- 1. HERO BANNER -->
        <section class="flow-catalog-hero" id="flowCatalogHero">
          <div class="flow-catalog-hero-inner">
            <div class="flow-catalog-hero-content">
              <h2 class="flow-catalog-hero-title" id="flowCatalogHeroTitle">Create Daily Social Content Automatically</h2>
              <p class="flow-catalog-hero-sub" id="flowCatalogHeroSub">AI Dynamic Mix Flow</p>
              <a href="#" class="flow-catalog-hero-cta" id="flowCatalogHeroCta">Probar ahora</a>
            </div>
            <div class="flow-catalog-hero-media" id="flowCatalogHeroMedia"></div>
          </div>
        </section>

        <!-- 2. QUICK START -->
        <section class="flow-catalog-section" id="flowCatalogQuickStart">
          <h3 class="flow-catalog-section-title">Acceso rápido</h3>
          <div class="flow-catalog-quick-scroll" id="flowCatalogQuickScroll"></div>
        </section>

        <!-- 3. EXPLORE BY OBJECTIVE -->
        <section class="flow-catalog-section" id="flowCatalogObjectives">
          <h3 class="flow-catalog-section-title">Explorar por objetivo</h3>
          <div class="flow-catalog-objectives-grid" id="flowCatalogObjectivesGrid"></div>
        </section>

        <!-- 4. EXPLORE BY CATEGORY + 5. ALL FLOWS GRID -->
        <section class="flow-catalog-section flow-catalog-section--grid">
          <h3 class="flow-catalog-section-title">Todos los flujos</h3>
          <div class="flow-catalog-toolbar">
            <div class="flow-catalog-search-wrap">
              <i class="fas fa-search flow-catalog-search-icon"></i>
              <input type="search" id="flowCatalogSearch" class="flow-catalog-search" placeholder="Buscar: ej. mostrar producto premium..." autocomplete="off">
            </div>
            <div class="flow-catalog-toolbar-right">
              <span class="flow-catalog-filter-label">Intención</span>
              <div class="flow-catalog-filters" id="flowCatalogFilters"></div>
              <span class="flow-catalog-filter-label flow-catalog-filter-label--sub">Tema profesional</span>
              <div class="flow-catalog-filters flow-catalog-filters--sub" id="flowCatalogFiltersSub"></div>
              <select id="flowCatalogSort" class="flow-catalog-sort" aria-label="Ordenar">
                <option value="score">Más relevantes</option>
                <option value="new">Más recientes</option>
                <option value="name">Nombre</option>
                <option value="cost">Menor coste</option>
              </select>
            </div>
          </div>
          <div class="flow-catalog-masonry" id="flowCatalogMasonry"></div>
          <div class="flow-catalog-empty" id="flowCatalogEmpty" style="display: none;">
            <i class="fas fa-inbox"></i>
            <p>No hay flujos que coincidan.</p>
          </div>
        </section>
      </div>
    `;
  }

  async init() {
    await this.initSupabase();
    await this.loadCategories();
    await this.loadSubcategories();
    await this.loadFlows();
    await this.loadRecentlyUsed();
    await this.loadFavorites();
    this.enrichFlowsWithCategories();
    this.renderHero();
    this.renderQuickStart();
    this.renderObjectives();
    this.renderFilters();
    this.renderSubcategoryFilters();
    this.renderGrid();
    this.bindEvents();
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
        .order('order_index', { ascending: true })
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
        .order('order_index', { ascending: true })
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
      const { data, error } = await this.supabase
        .from('content_flows')
        .select('id, name, description, token_cost, output_type, flow_image_url, category_id, subcategory_id, flow_category_type, likes_count, saves_count, run_count, created_at')
        .eq('is_active', true)
        .eq('flow_category_type', 'manual')
        .order('name');
      this.flows = !error && data ? data : [];
    } catch (e) {
      console.error('FlowCatalog loadFlows:', e);
      this.flows = [];
    }
  }

  async loadRecentlyUsed() {
    this.recentlyUsedFlowIds = [];
    if (!this.supabase || !this.userId) return;
    try {
      const { data } = await this.supabase
        .from('flow_runs')
        .select('flow_id')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        const seen = new Set();
        data.forEach(r => {
          if (r.flow_id && !seen.has(r.flow_id)) {
            seen.add(r.flow_id);
            this.recentlyUsedFlowIds.push(r.flow_id);
          }
        });
      }
    } catch (e) {
      console.error('FlowCatalog loadRecentlyUsed:', e);
    }
  }

  async loadFavorites() {
    this.favoriteFlowIds = [];
    if (!this.supabase || !this.userId) return;
    try {
      const { data } = await this.supabase
        .from('user_flow_favorites')
        .select('flow_id')
        .eq('user_id', this.userId)
        .eq('is_favorite', true);
      if (data) this.favoriteFlowIds = data.map(r => r.flow_id).filter(Boolean);
    } catch (e) {
      console.error('FlowCatalog loadFavorites:', e);
    }
  }

  enrichFlowsWithCategories() {
    this.flows.forEach(f => {
      const cat = f.category_id && this.categories.length ? this.categories.find(c => c.id === f.category_id) : null;
      const sub = f.subcategory_id && this.subcategories.length ? this.subcategories.find(s => s.id === f.subcategory_id) : null;
      f.content_categories = cat ? { id: cat.id, name: cat.name, description: cat.description } : null;
      f.content_subcategories = sub ? { id: sub.id, name: sub.name, description: sub.description } : null;
    });
  }

  flowScore(flow) {
    const runs = (flow.run_count || 0) * 0.4;
    const likes = (flow.likes_count || 0) * 0.2;
    const saves = (flow.saves_count || 0) * 0.2;
    const created = flow.created_at ? new Date(flow.created_at).getTime() : 0;
    const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
    const recency = ageDays <= 30 ? 1 : ageDays <= 90 ? 0.5 : 0.2;
    return runs + likes + saves + recency * 0.2;
  }

  isNew(flow) {
    if (!flow.created_at) return false;
    const days = (Date.now() - new Date(flow.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }

  isTrending(flow) {
    const score = this.flowScore(flow);
    const sorted = [...this.flows].sort((a, b) => this.flowScore(b) - this.flowScore(a));
    const top = sorted.slice(0, Math.max(5, Math.ceil(this.flows.length * 0.2)));
    return top.some(f => f.id === flow.id);
  }

  getFeaturedForHero() {
    if (!this.flows.length) return null;
    const sorted = [...this.flows].sort((a, b) => this.flowScore(b) - this.flowScore(a));
    return sorted[0];
  }

  getQuickStartFlows() {
    const recent = this.recentlyUsedFlowIds.map(id => this.flows.find(f => f.id === id)).filter(Boolean);
    const fav = this.favoriteFlowIds.map(id => this.flows.find(f => f.id === id)).filter(Boolean);
    const trending = [...this.flows].sort((a, b) => this.flowScore(b) - this.flowScore(a)).slice(0, 6);
    const combined = [];
    const seen = new Set();
    [...fav, ...recent, ...trending].forEach(f => {
      if (f && !seen.has(f.id)) {
        seen.add(f.id);
        combined.push(f);
      }
    });
    return combined.slice(0, 12);
  }

  getFilteredFlows() {
    const q = (this.searchQuery || '').trim().toLowerCase();
    const catId = this.selectedCategoryId;
    const subId = this.selectedSubcategoryId;
    const objId = this.selectedObjectiveId;

    let list = this.flows.filter(f => {
      if (catId && f.category_id !== catId) return false;
      if (subId && f.subcategory_id !== subId) return false;
      if (objId) {
        const obj = FlowCatalogView.OBJECTIVES.find(o => o.id === objId);
        if (obj && obj.categoryNames && obj.categoryNames.length) {
          const catName = (f.content_categories?.name || '').toLowerCase();
          if (!obj.categoryNames.some(n => catName.includes(n.toLowerCase()))) return false;
        }
      }
      if (!q) return true;
      const name = (f.name || '').toLowerCase();
      const desc = (f.description || '').toLowerCase();
      const catName = (f.content_categories?.name || '').toLowerCase();
      const subName = (f.content_subcategories?.name || '').toLowerCase();
      return name.includes(q) || desc.includes(q) || catName.includes(q) || subName.includes(q);
    });

    if (this.sortBy === 'score') list = [...list].sort((a, b) => this.flowScore(b) - this.flowScore(a));
    else if (this.sortBy === 'new') list = [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (this.sortBy === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (this.sortBy === 'cost') list = [...list].sort((a, b) => (a.token_cost || 0) - (b.token_cost || 0));
    return list;
  }

  renderHero() {
    const hero = this.getFeaturedForHero();
    const titleEl = document.getElementById('flowCatalogHeroTitle');
    const subEl = document.getElementById('flowCatalogHeroSub');
    const ctaEl = document.getElementById('flowCatalogHeroCta');
    const mediaEl = document.getElementById('flowCatalogHeroMedia');
    if (!titleEl || !ctaEl) return;

    if (hero) {
      titleEl.textContent = hero.description ? hero.description.slice(0, 60) + (hero.description.length > 60 ? '…' : '') : hero.name;
      if (subEl) subEl.textContent = hero.name;
      const img = hero.flow_image_url
        ? `<img src="${this.escapeHtml(hero.flow_image_url)}" alt="" class="flow-catalog-hero-img">`
        : `<div class="flow-catalog-hero-placeholder"><i class="fas ${this.getOutputTypeIcon(hero.output_type)}"></i></div>`;
      if (mediaEl) mediaEl.innerHTML = img;
      ctaEl.href = '#';
      ctaEl.onclick = (e) => {
        e.preventDefault();
        this.openFlow(hero.id);
      };
    } else {
      titleEl.textContent = 'Catálogo de flujos';
      if (subEl) subEl.textContent = 'Elige un flujo y crea en Studio';
      if (mediaEl) mediaEl.innerHTML = '';
      ctaEl.href = this.getStudioPath();
    }
  }

  renderQuickStart() {
    const wrap = document.getElementById('flowCatalogQuickScroll');
    if (!wrap) return;
    const list = this.getQuickStartFlows();
    if (!list.length) {
      wrap.innerHTML = '<p class="flow-catalog-quick-empty">Usa flujos para ver aquí tus recientes y favoritos.</p>';
      return;
    }
    wrap.innerHTML = list.map(f => this.renderFlowCard(f, 'quick')).join('');
    wrap.querySelectorAll('.flow-catalog-card').forEach(card => {
      card.addEventListener('click', () => this.openFlow(card.getAttribute('data-flow-id')));
    });
  }

  renderObjectives() {
    const grid = document.getElementById('flowCatalogObjectivesGrid');
    if (!grid) return;
    grid.innerHTML = FlowCatalogView.OBJECTIVES.map(obj => `
      <button type="button" class="flow-catalog-objective-card" data-objective-id="${this.escapeHtml(obj.id)}">
        <i class="fas ${obj.icon}"></i>
        <span>${this.escapeHtml(obj.label)}</span>
      </button>
    `).join('');
    grid.querySelectorAll('.flow-catalog-objective-card').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedObjectiveId = this.selectedObjectiveId === btn.getAttribute('data-objective-id') ? null : btn.getAttribute('data-objective-id');
        grid.querySelectorAll('.flow-catalog-objective-card').forEach(b => b.classList.remove('flow-catalog-objective-card--active'));
        if (this.selectedObjectiveId) btn.classList.add('flow-catalog-objective-card--active');
        document.getElementById('flowCatalogMasonry')?.scrollIntoView({ behavior: 'smooth' });
        this.renderGrid();
      });
    });
  }

  renderFilters() {
    const wrap = document.getElementById('flowCatalogFilters');
    if (!wrap) return;
    const chips = ['<button type="button" class="flow-catalog-chip flow-catalog-chip--active" data-category-id="">Todos</button>'];
    this.categories.forEach(cat => {
      chips.push(`<button type="button" class="flow-catalog-chip" data-category-id="${this.escapeHtml(cat.id)}">${this.escapeHtml(cat.name)}</button>`);
    });
    wrap.innerHTML = chips.join('');
  }

  renderSubcategoryFilters() {
    const wrap = document.getElementById('flowCatalogFiltersSub');
    if (!wrap) return;
    const chips = ['<button type="button" class="flow-catalog-chip flow-catalog-chip-sub flow-catalog-chip--active" data-subcategory-id="">Todos</button>'];
    this.subcategories.forEach(sub => {
      chips.push(`<button type="button" class="flow-catalog-chip flow-catalog-chip-sub" data-subcategory-id="${this.escapeHtml(sub.id)}">${this.escapeHtml(sub.name)}</button>`);
    });
    wrap.innerHTML = chips.join('');
  }

  bindEvents() {
    const searchEl = document.getElementById('flowCatalogSearch');
    const filtersWrap = document.getElementById('flowCatalogFilters');
    const filtersSubWrap = document.getElementById('flowCatalogFiltersSub');
    const sortEl = document.getElementById('flowCatalogSort');

    if (searchEl) {
      searchEl.addEventListener('input', () => { this.searchQuery = searchEl.value; this.renderGrid(); });
      searchEl.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchEl.value = ''; this.searchQuery = ''; this.renderGrid(); searchEl.blur(); }
      });
    }
    if (filtersWrap) {
      filtersWrap.addEventListener('click', e => {
        const chip = e.target.closest('.flow-catalog-chip[data-category-id]');
        if (!chip) return;
        this.selectedCategoryId = chip.getAttribute('data-category-id') || null;
        if (this.selectedCategoryId === '') this.selectedCategoryId = null;
        filtersWrap.querySelectorAll('.flow-catalog-chip').forEach(c => c.classList.remove('flow-catalog-chip--active'));
        chip.classList.add('flow-catalog-chip--active');
        this.renderGrid();
      });
    }
    if (filtersSubWrap) {
      filtersSubWrap.addEventListener('click', e => {
        const chip = e.target.closest('.flow-catalog-chip[data-subcategory-id]');
        if (!chip) return;
        this.selectedSubcategoryId = chip.getAttribute('data-subcategory-id') || null;
        if (this.selectedSubcategoryId === '') this.selectedSubcategoryId = null;
        filtersSubWrap.querySelectorAll('.flow-catalog-chip').forEach(c => c.classList.remove('flow-catalog-chip--active'));
        chip.classList.add('flow-catalog-chip--active');
        this.renderGrid();
      });
    }
    if (sortEl) {
      sortEl.addEventListener('change', () => { this.sortBy = sortEl.value; this.renderGrid(); });
    }
  }

  renderGrid() {
    const masonryEl = document.getElementById('flowCatalogMasonry');
    const emptyEl = document.getElementById('flowCatalogEmpty');
    if (!masonryEl) return;

    const list = this.getFilteredFlows();
    if (list.length === 0) {
      masonryEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    masonryEl.innerHTML = list.map(f => this.renderFlowCard(f, 'grid')).join('');
    masonryEl.querySelectorAll('.flow-catalog-card').forEach(card => {
      card.addEventListener('click', () => this.openFlow(card.getAttribute('data-flow-id')));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
    });
  }

  openFlow(flowId) {
    if (window.appState) window.appState.set('selectedFlowId', flowId, true);
    else localStorage.setItem('selectedFlowId', flowId);
    if (window.router) window.router.navigate(this.getStudioPath());
  }

  renderFlowCard(flow, variant = 'grid') {
    const name = this.escapeHtml(flow.name);
    const desc = flow.description ? this.escapeHtml(flow.description.slice(0, 120)) : '';
    const category = flow.content_categories?.name;
    const subcategory = flow.content_subcategories?.name;
    const cost = flow.token_cost ?? 1;
    const typeLabel = (flow.flow_category_type || 'manual') === 'automated' ? 'Automated' : 'Manual';
    const isNew = this.isNew(flow);
    const isTrend = this.isTrending(flow);
    const likes = flow.likes_count || 0;
    const saves = flow.saves_count || 0;
    const runs = flow.run_count || 0;

    const img = flow.flow_image_url
      ? `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-catalog-card-img" loading="lazy">`
      : `<div class="flow-catalog-card-placeholder"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i></div>`;

    const badges = [];
    if (isNew) badges.push('<span class="flow-catalog-badge flow-catalog-badge--new">Nuevo</span>');
    if (isTrend) badges.push('<span class="flow-catalog-badge flow-catalog-badge--trending">Trending</span>');
    badges.push(`<span class="flow-catalog-badge flow-catalog-badge--type">${typeLabel}</span>`);

    const humanTitle = desc ? desc.slice(0, 50) + (desc.length > 50 ? '…' : '') : name;

    return `
      <article class="flow-catalog-card flow-catalog-card--${variant}" data-flow-id="${flow.id}" role="button" tabindex="0">
        <div class="flow-catalog-card-media">
          ${img}
          <div class="flow-catalog-card-badges">${badges.join('')}</div>
        </div>
        <div class="flow-catalog-card-body">
          <h3 class="flow-catalog-card-title">${this.escapeHtml(humanTitle)}</h3>
          <p class="flow-catalog-card-subtitle">${name}</p>
          ${variant === 'grid' && (category || subcategory) ? `<div class="flow-catalog-card-meta">
            ${category ? `<span class="flow-catalog-card-cat">${this.escapeHtml(category)}</span>` : ''}
            ${subcategory ? `<span class="flow-catalog-card-subcat">${this.escapeHtml(subcategory)}</span>` : ''}
          </div>` : ''}
          <div class="flow-catalog-card-stats">
            ${variant === 'grid' ? `<span title="Ejecuciones"><i class="fas fa-play"></i> ${runs}</span><span title="Likes"><i class="fas fa-heart"></i> ${likes}</span><span title="Guardados"><i class="fas fa-bookmark"></i> ${saves}</span>` : ''}
            <span class="flow-catalog-card-cost">${cost} crédito(s)</span>
          </div>
        </div>
      </article>
    `;
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

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.FlowCatalogView = FlowCatalogView;
