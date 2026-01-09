/**
 * DashboardView - Vista principal del dashboard
 * Muestra widgets con estado general, marcas activas, campañas y contenido reciente
 */
class DashboardView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'dashboard.html';
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
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
    await this.loadDashboardData();
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

  async loadDashboardData() {
    // TODO: Implementar carga de datos del dashboard
    console.log('Cargando datos del dashboard...');
  }

  setupEventListeners() {
    // TODO: Configurar event listeners
  }
}

window.DashboardView = DashboardView;
