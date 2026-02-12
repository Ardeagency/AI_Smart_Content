/**
 * AudiencesView - Vista de audiencias
 * Segmentos y detalle individual
 */
class AudiencesView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'audiences.html';
    this.supabase = null;
    this.userId = null;
    this.audienceId = null;
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
