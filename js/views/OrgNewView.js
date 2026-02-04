/**
 * OrgNewView - User Space: crear nueva organización.
 * Ruta: /org/new. Sin contexto organización (es el paso previo a tener una).
 */
class OrgNewView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
  }

  async onEnter() {
    const isAuth = window.authService
      ? await window.authService.checkAccess(true)
      : await this.checkAuthentication();
    if (!isAuth) {
      if (window.router) window.router.navigate('/login', true);
      return;
    }
    if (window.appState) window.appState.clearWorkspaceContext();
  }

  async renderHTML() {
    return `
      <div class="org-new-view user-space-view">
        <header class="user-space-header">
          <a href="/home" class="back-to-home" data-nav-home><i class="fas fa-arrow-left"></i> Home</a>
          <h1 class="user-space-title">Nueva organización</h1>
        </header>
        <main class="org-new-content">
          <div class="account-panel">
            <p class="account-placeholder">Formulario para crear una nueva organización. Puedes usar el de Home (modal) o implementar aquí un flujo dedicado.</p>
            <p><a href="/home" data-nav-home>Volver a Home</a> y crear desde allí, o implementar formulario aquí.</p>
          </div>
        </main>
      </div>
    `;
  }

  async init() {
    this.container.querySelectorAll('[data-nav-home], .back-to-home').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.router) window.router.navigate('/home');
      });
    });
  }

  async checkAuthentication() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return false;
    const { data: { user }, error } = await supabase.auth.getUser();
    return !error && !!user;
  }
}

window.OrgNewView = OrgNewView;
