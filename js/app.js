/**
 * App - Aplicación principal de la SPA
 * Orquesta la inicialización de todos los componentes
 */
class App {
  constructor() {
    this.initialized = false;
    this.router = null;
  }

  /**
   * Inicializar la aplicación
   */
  async init() {
    if (this.initialized) {
      console.warn('⚠️ App ya está inicializada');
      return;
    }

    console.log('🚀 Inicializando AI Smart Content SPA...');

    try {
      // 1. Cargar Supabase
      await this.initSupabase();

      // 2. Inicializar Router (ya está creado globalmente, solo verificar)
      this.initRouter();

      // 3. Registrar rutas (se hará después cuando tengamos las vistas)
      // Por ahora solo registramos una ruta de prueba
      this.registerRoutes();

    // 4. Inicializar Navigation component (se hará en Fase 3)
    // this.initNavigation();

      // 5. Manejar ruta inicial (con un pequeño delay para asegurar que todo esté listo)
      if (window.router) {
        // Pequeño delay para asegurar que el DOM esté completamente listo y las rutas estén registradas
        setTimeout(() => {
          // Verificar que las rutas estén registradas
          if (Object.keys(window.router.routes).length > 0) {
            window.router.handleRoute();
          } else {
            console.warn('⚠️ No hay rutas registradas, reintentando...');
            setTimeout(() => window.router.handleRoute(), 100);
          }
        }, 100);
      }

      this.initialized = true;
      console.log('✅ App inicializada correctamente');
    } catch (error) {
      console.error('❌ Error inicializando app:', error);
      this.showInitError(error);
    }
  }

  /**
   * Inicializar Supabase
   */
  async initSupabase() {
    // Esperar a que app-loader cargue Supabase
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        await window.appLoader.waitFor();
        console.log('✅ Supabase cargado');
      } catch (error) {
        console.warn('⚠️ Error cargando Supabase:', error);
        // Continuar aunque Supabase no esté disponible (modo desarrollo)
      }
    } else {
      console.warn('⚠️ app-loader no está disponible');
    }
  }

  /**
   * Inicializar Router
   */
  initRouter() {
    // Router ya está creado globalmente en router.js
    if (!window.router) {
      throw new Error('Router no está disponible');
    }
    
    this.router = window.router;
    console.log('✅ Router inicializado');
  }

  /**
   * Registrar todas las rutas de la aplicación
   */
  registerRoutes() {
    if (!this.router) {
      console.error('❌ Router no está disponible');
      return;
    }

    // Rutas públicas
    // Las vistas se cargan desde los scripts en index.html
    this.router.register('/', window.LandingView, {
      requiresAuth: false,
      redirectIfAuth: false
    });

    this.router.register('/login', window.LoginView, {
      requiresAuth: false,
      redirectIfAuth: true // Si ya está autenticado, redirigir
    });

    this.router.register('/planes', window.PlanesView, {
      requiresAuth: false,
      redirectIfAuth: false
    });

    // Rutas protegidas
    this.router.register('/form-record', window.FormRecordView, {
      requiresAuth: true,
      redirectIfAuth: false
    });

    this.router.register('/living', window.LivingView, {
      requiresAuth: true,
      redirectIfAuth: false
    });

    this.router.register('/studio', window.StudioView, {
      requiresAuth: true,
      redirectIfAuth: false
    });

    this.router.register('/products', window.ProductsView, {
      requiresAuth: true,
      redirectIfAuth: false
    });

    // Ruta 404
    const BaseView = window.BaseView || class {};
    this.router.register('/404', class extends BaseView {
      async render() {
        const container = document.getElementById('app-container');
        if (container) {
          container.innerHTML = `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 400px;
              padding: 2rem;
              text-align: center;
            ">
              <h1 style="font-size: 4rem; color: var(--text-primary, #ecebda); margin-bottom: 1rem;">404</h1>
              <p style="color: var(--text-secondary, #a0a0a0); margin-bottom: 2rem;">Página no encontrada</p>
              <button onclick="window.router.navigate('/')" style="
                padding: 0.75rem 1.5rem;
                background: var(--primary-color, #ecebda);
                color: var(--bg-dark, #1a1a1a);
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
              ">Ir al Inicio</button>
            </div>
          `;
        }
      }
    });

    console.log('✅ Rutas registradas');
    console.log('  Públicas:');
    console.log('    - / (Landing)');
    console.log('    - /login (Login)');
    console.log('    - /planes (Planes)');
    console.log('  Protegidas:');
    console.log('    - /form-record (Form Record)');
    console.log('    - /living (Living/Dashboard)');
    console.log('    - /studio (Studio)');
    console.log('    - /products (Products)');
    console.log('  - /404 (Not Found)');
  }

  /**
   * Mostrar error de inicialización
   * @param {Error} error - Error ocurrido
   */
  showInitError(error) {
    const container = document.getElementById('app-container');
    if (container) {
      container.innerHTML = `
        <div class="error-container" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
          text-align: center;
        ">
          <div class="error-icon" style="font-size: 4rem; color: var(--accent-warm, #e09145); margin-bottom: 1rem;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h1 style="color: var(--text-primary, #ecebda); margin-bottom: 1rem;">Error de Inicialización</h1>
          <p style="color: var(--text-secondary, #a0a0a0); margin-bottom: 2rem;">
            No se pudo inicializar la aplicación.<br>
            ${error.message}
          </p>
          <button onclick="window.location.reload()" style="
            padding: 0.75rem 1.5rem;
            background: var(--primary-color, #ecebda);
            color: var(--bg-dark, #1a1a1a);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          ">Recargar Página</button>
        </div>
      `;
    }
  }
}

// Inicializar app cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  window.app = new App();
  await window.app.init();
});

// También inicializar si el DOM ya está listo
if (document.readyState === 'loading') {
  // DOM aún cargando, el evento DOMContentLoaded se disparará
} else {
  // DOM ya está listo, inicializar inmediatamente
  window.app = new App();
  window.app.init();
}

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}

