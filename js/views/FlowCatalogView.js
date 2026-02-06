/**
 * FlowCatalogView - Biblioteca/catálogo de flujos tipo galería masonry.
 * Navegación por categorías (content_categories), búsqueda y filtros.
 * Al seleccionar un flujo, navega a Studio con ese flujo preseleccionado.
 */
class FlowCatalogView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.flows = [];
    this.categories = [];
    this.searchQuery = '';
    this.selectedCategoryId = null; // null = "Todos"
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
  }

  getStudioPath() {
    return this.organizationId ? `/org/${this.organizationId}/studio` : '/studio';
  }

  renderHTML() {
    return `
      <div class="flow-catalog" id="flowCatalogContainer">
        <header class="flow-catalog-header">
          <h1 class="flow-catalog-title">Catálogo de flujos</h1>
          <p class="flow-catalog-subtitle">Explora por categoría, busca y elige el flujo que quieras para crear en Studio</p>
        </header>
        <div class="flow-catalog-toolbar" id="flowCatalogToolbar">
          <div class="flow-catalog-search-wrap">
            <i class="fas fa-search flow-catalog-search-icon"></i>
            <input type="search" id="flowCatalogSearch" class="flow-catalog-search" placeholder="Buscar por nombre o descripción..." autocomplete="off">
          </div>
          <div class="flow-catalog-filters" id="flowCatalogFilters">
            <button type="button" class="flow-catalog-chip flow-catalog-chip--active" data-category-id="">Todos</button>
          </div>
        </div>
        <div class="flow-catalog-masonry" id="flowCatalogMasonry"></div>
        <div class="flow-catalog-empty" id="flowCatalogEmpty" style="display: none;">
          <i class="fas fa-inbox"></i>
          <p>No hay flujos que coincidan con tu búsqueda.</p>
          <p class="flow-catalog-empty-hint">Prueba otro término o quita el filtro de categoría.</p>
        </div>
      </div>
    `;
  }

  async init() {
    await this.initSupabase();
    await Promise.all([this.loadCategories(), this.loadFlows()]);
    this.renderFilters();
    this.renderMasonry();
    this.bindToolbar();
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }
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
      if (!error && data) {
        this.categories = data;
      } else {
        this.categories = [];
      }
    } catch (e) {
      console.error('FlowCatalog loadCategories:', e);
      this.categories = [];
    }
  }

  async loadFlows() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('content_flows')
        .select('id, name, description, token_cost, output_type, flow_image_url, category_id, content_categories(id, name, description)')
        .eq('is_active', true)
        .order('name');
      if (!error && data) {
        this.flows = data;
      } else {
        this.flows = [];
      }
    } catch (e) {
      console.error('FlowCatalog loadFlows:', e);
      this.flows = [];
    }
  }

  getFilteredFlows() {
    const q = (this.searchQuery || '').trim().toLowerCase();
    const catId = this.selectedCategoryId;

    return this.flows.filter(f => {
      const matchCategory = !catId || (f.category_id && f.category_id === catId);
      if (!matchCategory) return false;

      if (!q) return true;
      const name = (f.name || '').toLowerCase();
      const desc = (f.description || '').toLowerCase();
      const catName = (f.content_categories?.name || '').toLowerCase();
      return name.includes(q) || desc.includes(q) || catName.includes(q);
    });
  }

  renderFilters() {
    const wrap = document.getElementById('flowCatalogFilters');
    if (!wrap) return;

    const chips = [
      '<button type="button" class="flow-catalog-chip flow-catalog-chip--active" data-category-id="">Todos</button>'
    ];
    this.categories.forEach(cat => {
      const name = this.escapeHtml(cat.name);
      chips.push(`<button type="button" class="flow-catalog-chip" data-category-id="${this.escapeHtml(cat.id)}">${name}</button>`);
    });
    wrap.innerHTML = chips.join('');
  }

  bindToolbar() {
    const searchEl = document.getElementById('flowCatalogSearch');
    const filtersWrap = document.getElementById('flowCatalogFilters');

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        this.searchQuery = searchEl.value;
        this.renderMasonry();
      });
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchEl.value = '';
          this.searchQuery = '';
          this.renderMasonry();
          searchEl.blur();
        }
      });
    }

    if (filtersWrap) {
      filtersWrap.addEventListener('click', (e) => {
        const chip = e.target.closest('.flow-catalog-chip');
        if (!chip) return;
        const id = chip.getAttribute('data-category-id') || '';
        this.selectedCategoryId = id === '' ? null : id;
        filtersWrap.querySelectorAll('.flow-catalog-chip').forEach(c => c.classList.remove('flow-catalog-chip--active'));
        chip.classList.add('flow-catalog-chip--active');
        this.renderMasonry();
      });
    }
  }

  renderMasonry() {
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

    const cards = list.map(f => this.renderFlowCard(f)).join('');
    masonryEl.innerHTML = cards;

    masonryEl.querySelectorAll('.flow-catalog-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-flow-id');
        if (window.appState) window.appState.set('selectedFlowId', id, true);
        else localStorage.setItem('selectedFlowId', id);
        const path = this.getStudioPath();
        if (window.router) window.router.navigate(path);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  }

  renderFlowCard(flow) {
    const name = this.escapeHtml(flow.name);
    const desc = flow.description ? this.escapeHtml(flow.description) : '';
    const category = flow.content_categories?.name;
    const cost = flow.token_cost ?? 1;
    const img = flow.flow_image_url
      ? `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-catalog-card-img" loading="lazy">`
      : `<div class="flow-catalog-card-placeholder"><i class="fas ${this.getOutputTypeIcon(flow.output_type)}"></i></div>`;

    return `
      <article class="flow-catalog-card" data-flow-id="${flow.id}" role="button" tabindex="0">
        <div class="flow-catalog-card-media">${img}</div>
        <div class="flow-catalog-card-body">
          <h3 class="flow-catalog-card-title">${name}</h3>
          ${desc ? `<p class="flow-catalog-card-desc">${desc}</p>` : ''}
          <div class="flow-catalog-card-meta">
            ${category ? `<span class="flow-catalog-card-cat">${this.escapeHtml(category)}</span>` : ''}
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
