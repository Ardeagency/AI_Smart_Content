/**
 * FlowCatalogView - Catálogo de flujos para el consumidor.
 * Agrupa flujos por tipo de producción (video, imagen, texto, etc.).
 * Al seleccionar un flujo, navega a Studio con ese flujo preseleccionado.
 */
class FlowCatalogView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.flows = [];
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
          <p class="flow-catalog-subtitle">Elige un flujo por tipo de producción y empieza a crear en Studio</p>
        </header>
        <div class="flow-catalog-sections" id="flowCatalogSections"></div>
        <div class="flow-catalog-empty" id="flowCatalogEmpty" style="display: none;">
          <p>No hay flujos disponibles en este momento.</p>
        </div>
      </div>
    `;
  }

  async init() {
    await this.initSupabase();
    await this.loadFlows();
    this.renderSections();
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

  async loadFlows() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('content_flows')
        .select('id, name, description, token_cost, output_type, flow_image_url, category_id, content_categories(name)')
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

  groupByOutputType() {
    const order = ['video', 'image', 'text', 'audio', 'document', 'mixed'];
    const groups = {};
    this.flows.forEach(f => {
      const type = (f.output_type || 'text').toLowerCase();
      if (!groups[type]) groups[type] = [];
      groups[type].push(f);
    });
    const sorted = order.filter(t => groups[t]?.length);
    const rest = Object.keys(groups).filter(t => !order.includes(t));
    return { keys: [...sorted, ...rest], groups };
  }

  getOutputTypeLabel(type) {
    const labels = {
      video: 'Video',
      image: 'Imagen',
      imagen: 'Imagen',
      text: 'Texto',
      audio: 'Audio',
      document: 'Documento',
      mixed: 'Mixto'
    };
    return labels[(type || 'text').toLowerCase()] || type;
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

  renderSections() {
    const sectionsEl = document.getElementById('flowCatalogSections');
    const emptyEl = document.getElementById('flowCatalogEmpty');
    if (!sectionsEl) return;

    if (this.flows.length === 0) {
      sectionsEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const { keys, groups } = this.groupByOutputType();
    const html = keys.map(type => {
      const list = groups[type] || [];
      const cards = list.map(f => this.renderFlowCard(f)).join('');
      return `
        <section class="flow-catalog-section" data-output-type="${type}">
          <h2 class="flow-catalog-section-title">
            <i class="fas ${this.getOutputTypeIcon(type)}"></i>
            ${this.getOutputTypeLabel(type)}
          </h2>
          <div class="flow-catalog-grid">${cards}</div>
        </section>
      `;
    }).join('');

    sectionsEl.innerHTML = html;

    sectionsEl.querySelectorAll('.flow-catalog-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-flow-id');
        if (window.appState) window.appState.set('selectedFlowId', id, true);
        else localStorage.setItem('selectedFlowId', id);
        const path = this.getStudioPath();
        if (window.router) window.router.navigate(path);
      });
    });
  }

  renderFlowCard(flow) {
    const name = this.escapeHtml(flow.name);
    const desc = flow.description ? this.escapeHtml(flow.description.slice(0, 120)) : '';
    const category = flow.content_categories?.name;
    const cost = flow.token_cost ?? 1;
    const img = flow.flow_image_url
      ? `<img src="${this.escapeHtml(flow.flow_image_url)}" alt="${name}" class="flow-catalog-card-img">`
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

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.FlowCatalogView = FlowCatalogView;
