/**
 * InvitationsView - User Space: invitaciones pendientes a organizaciones.
 * Ruta: /invitations. Sin contexto organización.
 */
class InvitationsView extends BaseView {
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
      <div class="invitations-view user-space-view">
        <header class="user-space-header">
          <a href="/home" class="back-to-home" data-nav-home><i class="fas fa-arrow-left"></i> Home</a>
          <h1 class="user-space-title">Invitaciones</h1>
        </header>
        <main class="invitations-content">
          <div class="account-panel">
            <p class="account-placeholder">Invitaciones pendientes a organizaciones aparecerán aquí.</p>
            <p><a href="/home" data-nav-home>Volver a Home</a></p>
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

window.InvitationsView = InvitationsView;
