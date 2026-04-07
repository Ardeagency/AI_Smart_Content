/**
 * FormRecordView - Ruta legacy. Redirige a /create.
 */
class FormRecordView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'form-record.html';
    this.formRecord = null;
  }

  async onEnter() {
    if (window.router) {
      window.router.navigate('/create', true);
      return;
    }

    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    } else {
      const isAuth = await this.checkAuthentication();
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        else window.location.href = '/login.html';
        return;
      }
    }
  }

  async init() {
    const container = document.getElementById('app-container');
    if (container) {
      container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo...</p></div>';
    }
  }

  async checkAuthentication() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return false;
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user !== null;
    } catch {
      return false;
    }
  }

  async getSupabaseClient() {
    if (window.supabaseService?.getClient) {
      return await window.supabaseService.getClient();
    }
    if (window.appLoader?.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch {
        return null;
      }
    }
    return window.supabase || null;
  }

  async onLeave() {}
}

// Hacer disponible globalmente
window.FormRecordView = FormRecordView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormRecordView;
}

