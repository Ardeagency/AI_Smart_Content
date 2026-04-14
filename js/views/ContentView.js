/**
 * ContentView - Vista de biblioteca de contenido
 * Lista de contenido generado y detalle individual
 */
class ContentView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.contentId = null;
  }

  renderHTML() {
    return `
<!-- Vista de Biblioteca de Contenido -->
<div class="content-container" id="contentListContainer">
    <div class="content-header">
        <h1 class="content-title">Biblioteca de Contenido</h1>
        <div class="content-filters">
            <select id="filterBrand" class="filter-select">
                <option value="">Todas las marcas</option>
            </select>
            <select id="filterProduct" class="filter-select">
                <option value="">Todos los productos</option>
            </select>
            <select id="filterCampaign" class="filter-select">
                <option value="">Todas las campañas</option>
            </select>
            <select id="filterFormat" class="filter-select">
                <option value="">Todos los formatos</option>
            </select>
        </div>
    </div>

    <div class="content-grid" id="contentGrid"></div>
</div>

<!-- Vista de Detalle de Contenido -->
<div class="content-detail-container" id="contentDetailContainer" style="display: none;">
    <div class="content-detail-header">
        <button class="btn btn-secondary" id="backToContentBtn">
            <i class="fas fa-arrow-left"></i>
            Volver
        </button>
        <h1 class="content-detail-title" id="contentDetailTitle">Contenido</h1>
    </div>

    <div class="content-detail-content">
        <div class="content-preview" id="contentPreview">
            <!-- Preview del contenido -->
        </div>
        <div class="content-info">
            <div class="info-section">
                <h3>Prompt Usado</h3>
                <pre id="contentPrompt">-</pre>
            </div>
            <div class="info-section">
                <h3>Variables</h3>
                <pre id="contentVariables">-</pre>
            </div>
            <div class="info-section">
                <h3>Versiones</h3>
                <div id="contentVersions">-</div>
            </div>
            <div class="content-actions">
                <button class="btn btn-secondary" id="duplicateContentBtn">
                    <i class="fas fa-copy"></i>
                    Duplicar
                </button>
                <button class="btn btn-secondary" id="adaptContentBtn">
                    <i class="fas fa-edit"></i>
                    Adaptar
                </button>
                <button class="btn btn-primary" id="exportContentBtn">
                    <i class="fas fa-download"></i>
                    Exportar
                </button>
            </div>
        </div>
    </div>
</div>
    `;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  async render() {
    await super.render();
    await this.initSupabase();
    
    if (this.routeParams && this.routeParams.contentId) {
      this.contentId = this.routeParams.contentId;
      await this.renderContentDetail();
    } else {
      const path = window.location.pathname;
      const match = path.match(/\/content\/([^\/]+)/);
      if (match) {
        this.contentId = match[1];
        await this.renderContentDetail();
      } else {
        await this.renderContentList();
      }
    }
    
    this.setupEventListeners();
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      } else if (typeof waitForSupabase === 'function') {
        this.supabase = await waitForSupabase();
      }

      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) {
          this.userId = user.id;
        }
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  async renderContentList() {
    console.log('Renderizando biblioteca de contenido...');
  }

  async renderContentDetail() {
    console.log('Renderizando detalle de contenido:', this.contentId);
  }

  setupEventListeners() {
    // TODO: Configurar event listeners
  }
}

window.ContentView = ContentView;
