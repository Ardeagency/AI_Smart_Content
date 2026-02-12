/**
 * ContentView - Vista de biblioteca de contenido
 * Lista de contenido generado y detalle individual
 */
class ContentView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'content.html';
    this.supabase = null;
    this.userId = null;
    this.contentId = null;
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
