/**
 * CreateView - Vista de generación de contenido
 * Modos: guiado, experto y plantillas
 */
class CreateView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'create.html';
    this.supabase = null;
    this.userId = null;
    this.mode = 'guided'; // guided, pro, templates
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
    
    // Detectar modo desde la ruta
    const path = window.location.pathname;
    if (path.includes('/create/pro')) {
      this.mode = 'pro';
    } else if (path.includes('/create/templates')) {
      this.mode = 'templates';
    } else {
      this.mode = 'guided';
    }
    
    this.renderMode();
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

  renderMode() {
    const guidedEl = this.querySelector('#guidedMode');
    const proEl = this.querySelector('#proMode');
    const templatesEl = this.querySelector('#templatesMode');

    if (guidedEl) guidedEl.style.display = this.mode === 'guided' ? 'block' : 'none';
    if (proEl) proEl.style.display = this.mode === 'pro' ? 'block' : 'none';
    if (templatesEl) templatesEl.style.display = this.mode === 'templates' ? 'block' : 'none';
  }

  setupEventListeners() {
    // TODO: Configurar event listeners
  }
}

window.CreateView = CreateView;
