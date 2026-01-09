/**
 * InsightsView - Vista de aprendizaje e insights
 * Análisis de qué funciona y qué no
 */
class InsightsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'insights.html';
    this.supabase = null;
    this.userId = null;
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
    if (window.navigation && !window.navigation.initialized) {
      await window.navigation.render();
    }
  }

  async render() {
    await super.render();
    await this.initSupabase();
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

  setupEventListeners() {
    // TODO: Configurar event listeners
  }
}

window.InsightsView = InsightsView;
