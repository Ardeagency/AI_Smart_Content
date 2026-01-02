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
    if (window.navigation && !window.navigation.initialized) {
      await window.navigation.render();
    }

    // Inicializar FormRecord (usar la clase existente)
    if (window.FormRecord) {
      this.formRecord = new window.FormRecord();
      await this.formRecord.init();
    } else {
      // Si FormRecord no está disponible, cargar el script
      await this.loadFormRecordScript();
      if (window.FormRecord) {
        this.formRecord = new window.FormRecord();
        await this.formRecord.init();
      }
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
   * Cargar script de FormRecord si no está disponible
   */
  async loadFormRecordScript() {
    return new Promise((resolve, reject) => {
      if (window.FormRecord) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'js/form-record.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Error cargando form-record.js'));
      document.head.appendChild(script);
    });
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
   * Cleanup al salir de la vista
   */
  async onLeave() {
    // Limpiar FormRecord si existe
    if (this.formRecord && typeof this.formRecord.destroy === 'function') {
      await this.formRecord.destroy();
    }
  }
}

// Hacer disponible globalmente
window.FormRecordView = FormRecordView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormRecordView;
}

