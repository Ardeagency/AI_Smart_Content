/**
 * FormRecordView - Vista del formulario de registro (nombre organización + URL web).
 */
class FormRecordView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'form-record.html';
    this.formRecord = null;
  }

  async onEnter() {
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
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    if (!window.FormRecord) {
      await this.loadScript('js/form-record.js', 'FormRecord');
    }

    if (!window.FormRecord) {
      console.error('❌ No se pudo cargar FormRecord');
      return;
    }

    const supabase = await this.getSupabaseClient();
    this.formRecord = new window.FormRecord({ supabase });
    await this.formRecord.init();
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

