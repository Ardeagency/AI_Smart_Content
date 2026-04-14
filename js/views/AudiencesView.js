/**
 * AudiencesView - Vista de audiencias
 * Segmentos y detalle individual
 */
class AudiencesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.audienceId = null;
  }

  renderHTML() {
    return `
      <!-- Vista de Lista de Audiencias -->
      <div class="audiences-container" id="audiencesListContainer">
          <div class="audiences-header">
              <h1 class="audiences-title">Audiencias</h1>
              <button class="btn btn-primary" id="createAudienceBtn">
                  <i class="fas fa-plus"></i>
                  Nueva Audiencia
              </button>
          </div>

          <div class="audiences-grid" id="audiencesGrid"></div>
      </div>

      <!-- Vista de Detalle de Audiencia -->
      <div class="audience-detail-container" id="audienceDetailContainer" style="display: none;">
          <div class="audience-detail-header">
              <button class="btn btn-secondary" id="backToAudiencesBtn">
                  <i class="fas fa-arrow-left"></i>
                  Volver
              </button>
              <h1 class="audience-detail-title" id="audienceDetailTitle">Audiencia</h1>
          </div>

          <div class="audience-detail-content">
              <div class="audience-section">
                  <h2>Dolor Principal</h2>
                  <p id="audiencePain">-</p>
              </div>
              <div class="audience-section">
                  <h2>Deseos</h2>
                  <p id="audienceDesires">-</p>
              </div>
              <div class="audience-section">
                  <h2>Lenguaje</h2>
                  <p id="audienceLanguage">-</p>
              </div>
              <div class="audience-section">
                  <h2>Objeciones</h2>
                  <p id="audienceObjections">-</p>
              </div>
              <div class="audience-section">
                  <h2>Contenido Recomendado</h2>
                  <p id="audienceContent">-</p>
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
    
    if (this.routeParams && this.routeParams.audienceId) {
      this.audienceId = this.routeParams.audienceId;
      await this.renderAudienceDetail();
    } else {
      const path = window.location.pathname;
      const match = path.match(/\/audiences\/([^\/]+)/);
      if (match) {
        this.audienceId = match[1];
        await this.renderAudienceDetail();
      } else {
        await this.renderAudiencesList();
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

  async renderAudiencesList() {
    console.log('Renderizando lista de audiencias...');
  }

  async renderAudienceDetail() {
    console.log('Renderizando detalle de audiencia:', this.audienceId);
  }

  setupEventListeners() {
    // TODO: Configurar event listeners
  }
}

window.AudiencesView = AudiencesView;
