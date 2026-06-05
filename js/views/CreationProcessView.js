/**
 * CreationProcessView - Pantalla mostrada al usuario que ya verificó su correo
 * pero todavía no tiene una organización, rol o workspace al que entrar.
 *
 * Se usa como ruta de redirección por defecto cuando AuthService no encuentra
 * orgs para el usuario. Mensaje empático: "Estamos trabajando para crear la
 * mejor experiencia para tu marca". Permite cerrar sesión por si el usuario
 * quiere entrar con otra cuenta.
 *
 * Si entretanto la BD ya tiene una org asociada al usuario, esta vista lo
 * detecta en onEnter() y lo redirige automáticamente a su dashboard.
 */
class CreationProcessView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this._pollTimer = null;
    this._email = '';
  }

  async updateHeader() {
    // Sin header de usuario en esta página de espera
  }

  async onEnter() {
    try {
      const supabase = window.supabase
        || (window.supabaseService && (await window.supabaseService.getClient()));
      if (!supabase) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
      this._email = user.email || '';

      // Si el usuario ya tiene org (membership o owned), redirigir al dashboard.
      const hasOrg = await this._userHasOrg(supabase, user.id);
      if (hasOrg) {
        const route = window.authService && typeof window.authService.getDefaultUserRoute === 'function'
          ? await window.authService.getDefaultUserRoute(user.id)
          : `/home`;
        if (route && route !== '/creation_process' && window.router) {
          window.router.navigate(route, true);
        }
      }
    } catch (err) {
      console.warn('CreationProcessView.onEnter:', err);
    }
  }

  async _userHasOrg(supabase, userId) {
    if (!supabase || !userId) return false;
    try {
      const [membersRes, ownedRes] = await Promise.all([
        supabase.from('organization_members').select('organization_id').eq('user_id', userId).limit(1),
        supabase.from('organizations').select('id').eq('owner_user_id', userId).limit(1),
      ]);
      const m = (membersRes.data || []).length > 0;
      const o = (ownedRes.data || []).length > 0;
      return m || o;
    } catch (e) {
      console.warn('CreationProcessView._userHasOrg:', e);
      return false;
    }
  }

  renderHTML() {
    const year = new Date().getFullYear();
    const emailHtml = this._email
      ? `<p class="verification-email"><strong>${this._escape(this._email)}</strong></p>`
      : '';
    return `
      <div class="signin-container signin-container--hero">
        <div class="signin-card verification-card">
          <div class="signin-brand">
            <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="signin-brand-logo" width="180" height="72" decoding="async">
          </div>

          <div class="creation-spinner" aria-hidden="true">
            <div class="creation-spinner-ring"></div>
          </div>

          <h1 class="verification-title">${__('Estamos preparando tu workspace')}</h1>
          <p class="verification-desc">
            ${__('Estamos trabajando para crear la mejor experiencia para tu marca. En cuanto tu espacio esté listo, te enviaremos un correo y podrás entrar a la plataforma.')}
          </p>
          ${emailHtml}
          <p class="verification-hint">${__('Este proceso puede tardar unos minutos. Puedes cerrar esta ventana — te avisaremos por email.')}</p>

          <button type="button" class="btn btn-primary signin-submit" id="btnCheckStatus">
            ${__('Ya verifiqué, refrescar')}
          </button>
          <button type="button" class="signin-recover-back signin-recover-back-btn" id="linkLogout">
            ${__('Cerrar sesión')}
          </button>
        </div>

        <footer class="signin-footer">
          <span class="signin-footer-copy">${year} AI SMART CONTENT by ARDE AGENCY S.A.S. ${__('Todos los derechos reservados.')}</span>
          <span class="signin-footer-links">
            <a href="https://aismartcontent.io/privacy-policy" target="_blank" rel="noopener">${__('Privacidad')}</a>
            <span aria-hidden="true">·</span>
            <a href="https://aismartcontent.io/terms-and-conditions" target="_blank" rel="noopener">${__('Términos')}</a>
            <span aria-hidden="true">·</span>
            <a href="mailto:soporte@ardeagency.com">${__('Soporte')}</a>
          </span>
        </footer>
      </div>
    `;
  }

  async init() {
    const btnCheck = this.querySelector('#btnCheckStatus');
    const linkLogout = this.querySelector('#linkLogout');

    if (btnCheck) {
      this.addEventListener(btnCheck, 'click', () => this._refreshStatus());
    }
    if (linkLogout) {
      this.addEventListener(linkLogout, 'click', async (e) => {
        e.preventDefault();
        if (window.authService && typeof window.authService.logout === 'function') {
          await window.authService.logout();
        } else if (window.router) {
          window.router.navigate('/login', true);
        }
      });
    }

    // Poll suave cada 30s por si el backend termina el aprovisionamiento mientras
    // la pestaña está abierta. No agresivo — el usuario también recibirá el email.
    this._pollTimer = setInterval(() => this._refreshStatus(true), 30000);
  }

  async _refreshStatus(silent = false) {
    const btn = this.querySelector('#btnCheckStatus');
    if (!silent && btn) { btn.disabled = true; btn.textContent = __('Verificando...'); }
    try {
      const supabase = window.supabase
        || (window.supabaseService && (await window.supabaseService.getClient()));
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
      const hasOrg = await this._userHasOrg(supabase, user.id);
      if (hasOrg) {
        const route = window.authService && typeof window.authService.getDefaultUserRoute === 'function'
          ? await window.authService.getDefaultUserRoute(user.id)
          : '/home';
        if (window.router) window.router.navigate(route, true);
        return;
      }
      if (!silent && btn) {
        btn.textContent = __('Aún en proceso — te avisaremos por correo');
        setTimeout(() => {
          if (btn) { btn.disabled = false; btn.textContent = __('Ya verifiqué, refrescar'); }
        }, 2500);
      }
    } catch (err) {
      console.warn('CreationProcessView._refreshStatus:', err);
      if (!silent && btn) { btn.disabled = false; btn.textContent = __('Ya verifiqué, refrescar'); }
    }
  }

  _escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  destroy() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    super.destroy();
  }
}

window.CreationProcessView = CreationProcessView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CreationProcessView;
}
