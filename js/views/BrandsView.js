/**
 * BrandsView - Vista de marcas
 * Lista de marcas y detalle individual con tabs (Identity, Visual, Assets, AI Rules)
 */
class BrandsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'brands.html';
    this.supabase = null;
    this.userId = null;
    this.brandId = null; // Para vista de detalle
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
    
    // Verificar si hay brandId en los parámetros de ruta o en la URL
    if (this.routeParams && this.routeParams.brandId) {
      this.brandId = this.routeParams.brandId;
      await this.renderBrandDetail();
    } else {
      const path = window.location.pathname;
      const match = path.match(/\/brands\/([^\/]+)/);
      if (match) {
        this.brandId = match[1];
        await this.renderBrandDetail();
      } else {
        await this.renderBrandsList();
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

  async renderBrandsList() {
    // TODO: Cargar y renderizar lista de marcas
    console.log('Renderizando lista de marcas...');
  }

  async renderBrandDetail() {
    // TODO: Cargar y renderizar detalle de marca con tabs
    console.log('Renderizando detalle de marca:', this.brandId);
  }

  setupEventListeners() {
    // TODO: Configurar event listeners
  }
}

window.BrandsView = BrandsView;
