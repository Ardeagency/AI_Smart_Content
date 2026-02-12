/**
 * FormRecordView - Vista del formulario de registro de datos
 * Maneja el formulario multi-paso para onboarding
 */
class FormRecordView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'form-record.html';
    this.formRecord = null;
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Verificar autenticación usando AuthService
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    } else {
      // Fallback
      const isAuth = await this.checkAuthentication();
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        } else {
          window.location.href = '/login.html';
        }
        return;
      }
    }
  }

  /**
   * Inicializar la vista
   */
  async init() {
    // Renderizar Navigation si no está visible
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    // Cargar script si es necesario usando el método centralizado
    if (!window.FormRecord) {
      await this.loadScript('js/form-record.js', 'FormRecord');
    }

    // Inicializar FormRecord
    if (window.FormRecord) {
      this.formRecord = new window.FormRecord();
      await this.formRecord.init();
    } else {
      console.error('❌ No se pudo cargar FormRecord');
    }

    // Setup botón de "Ir al Living"
    const goToLivingBtn = this.querySelector('#goToLivingBtn');
    if (goToLivingBtn) {
      this.addEventListener(goToLivingBtn, 'click', () => {
        if (window.router) {
          window.router.navigate('/living');
        } else {
          window.location.href = '/living.html';
        }
      });
    }
  }

  /**
   * Verificar autenticación
   */
  async checkAuthentication() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return false;

    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    // Usar SupabaseService si está disponible
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    
    // Fallback a app-loader
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch (error) {
        return null;
      }
    }
    return window.supabase || null;
  }

  /**
   * Hook al salir de la vista - sin limpieza
   */
  async onLeave() {
    // Sin limpieza - el navegador maneja todo automáticamente
  }
}

// Hacer disponible globalmente
window.FormRecordView = FormRecordView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormRecordView;
}

