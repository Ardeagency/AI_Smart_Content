/**
 * AccountView - User Space: perfil, seguridad y preferencias del usuario.
 * Rutas: /account/profile, /account/security, /account/preferences
 * Sin contexto organización.
 */
class AccountView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.tab = 'profile';
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
    const tabParam = this.routeParams && this.routeParams.tab;
    const allowed = ['profile', 'security', 'preferences'];
    this.tab = tabParam && allowed.includes(tabParam) ? tabParam : this.getTabFromPath();
    const titles = { profile: 'Perfil', security: 'Seguridad', preferences: 'Preferencias' };
    const title = titles[this.tab] || 'Cuenta';

    return `
      <div class="account-view user-space-view">
        <header class="user-space-header">
          <a href="/home" class="back-to-home" data-nav-home><i class="fas fa-arrow-left"></i> Home</a>
          <h1 class="user-space-title">${this.escapeHtml(title)}</h1>
        </header>
        <nav class="account-tabs">
          <a href="/account/profile" class="account-tab ${this.tab === 'profile' ? 'active' : ''}" data-route="/account/profile">Perfil</a>
          <a href="/account/security" class="account-tab ${this.tab === 'security' ? 'active' : ''}" data-route="/account/security">Seguridad</a>
          <a href="/account/preferences" class="account-tab ${this.tab === 'preferences' ? 'active' : ''}" data-route="/account/preferences">Preferencias</a>
        </nav>
        <main class="account-content">
          ${this.getTabContent()}
        </main>
      </div>
    `;
  }

  getTabFromPath() {
    const path = window.location.pathname || '';
    const m = path.match(/\/account\/(profile|security|preferences)/);
    const tab = m ? m[1] : 'profile';
    const allowed = ['profile', 'security', 'preferences'];
    return allowed.includes(tab) ? tab : 'profile';
  }

  getTabContent() {
    if (this.tab === 'profile') {
      return `
        <div class="account-panel">
          <p class="account-placeholder">Datos de perfil del usuario (nombre, email, avatar).</p>
          <p><a href="/home" data-nav-home>Volver a Home</a></p>
        </div>
      `;
    }
    if (this.tab === 'security') {
      return `
        <div class="account-panel">
          <p class="account-placeholder">Contraseña, sesiones, verificación en dos pasos.</p>
          <p><a href="/home" data-nav-home>Volver a Home</a></p>
        </div>
      `;
    }
    return `
      <div class="account-panel">
        <p class="account-placeholder">Idioma, notificaciones, tema.</p>
        <p><a href="/home" data-nav-home>Volver a Home</a></p>
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

window.AccountView = AccountView;
