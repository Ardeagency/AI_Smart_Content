/**
 * CampaignsView - Vista de campañas
 * Lista de campañas y detalle individual con subsecciones
 */
class CampaignsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'campaigns.html';
    this.supabase = null;
    this.userId = null;
    this.campaignId = null;
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
    
    if (this.routeParams && this.routeParams.campaignId) {
      this.campaignId = this.routeParams.campaignId;
      await this.renderCampaignDetail();
    } else {
      const path = window.location.pathname;
      const match = path.match(/\/campaigns\/([^\/]+)/);
      if (match) {
        this.campaignId = match[1];
        await this.renderCampaignDetail();
      } else {
        await this.renderCampaignsList();
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

  async renderCampaignsList() {
    console.log('Renderizando lista de campañas...');
  }

  async renderCampaignDetail() {
    console.log('Renderizando detalle de campaña:', this.campaignId);
  }

  setupEventListeners() {
    // TODO: Configurar event listeners
  }
}

window.CampaignsView = CampaignsView;
