/**
 * SignInView - Acceso para usuarios existentes.
 * Patrón SPA: HTML inline, sin template.
 * Sin opción de registro — la plataforma es por invitación.
 */
class SignInView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.form = null;
    this.signinMain = null;
    this.signinRecover = null;
  }

  async updateHeader() {
    // Sin header de usuario en páginas públicas
  }

  renderHTML() {
    return `
      <div class="signin-container signin-container--split">
        <aside class="signin-visual" aria-hidden="true">
          <div class="signin-visual-frame"></div>
        </aside>

        <div class="signin-form-side">
          <div class="signin-card">
            <div class="signin-brand">
              <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="signin-brand-logo" width="180" height="72" decoding="async">
            </div>

            <div class="signin-success-banner" id="signinPasswordChangedBanner" hidden>
              <span class="signin-success-banner-icon" aria-hidden="true">✓</span>
              <span>Contraseña actualizada. Inicia sesión con tu nueva contraseña.</span>
            </div>

            <div class="signin-main" id="signinMain">
              <form id="form_signin" novalidate>
                <div class="auth-state active" data-state="signin">
                  <div class="signin-field">
                    <label class="signin-field-label" for="signinEmail">Email Address</label>
                    <input type="email" class="form-input" id="signinEmail" name="email" placeholder="name@company.com" autocomplete="email" required>
                  </div>
                  <div class="signin-field">
                    <label class="signin-field-label" for="signinPassword">Password</label>
                    <input type="password" class="form-input" id="signinPassword" name="password" placeholder="********" autocomplete="current-password" required>
                  </div>
                  <button type="button" class="signin-forgot signin-forgot-btn" id="linkForgotPassword">¿Olvidaste tu contraseña?</button>
                  <button type="submit" class="btn btn-primary signin-submit" id="btnSignIn">Login</button>
                </div>
              </form>

              <p class="signin-invite">¿No tienes acceso? <a href="/contacto" class="signin-invite-link" data-href="/contacto">Solicítalo aquí</a></p>
            </div>

            <div class="signin-recover" id="signinRecover" aria-hidden="true" hidden>
              <h2 class="signin-recover-title">Recuperar contraseña</h2>
              <p class="signin-recover-desc">Te enviaremos un enlace a tu correo para restablecer la contraseña. Debes hacer clic en el enlace para verificar que eres tú.</p>
              <div class="signin-recover-form" id="recoverForm">
                <input type="email" class="form-input" id="recoverEmail" placeholder="Correo electrónico" autocomplete="email" required>
                <button type="button" class="btn btn-primary" id="btnSendRecover">Enviar enlace</button>
              </div>
              <div class="signin-recover-success" id="recoverSuccess" hidden>
                <p class="signin-recover-success-text">Si existe una cuenta con ese correo, recibirás un enlace en unos minutos. Revisa también la carpeta de spam.</p>
              </div>
              <button type="button" class="signin-recover-back signin-recover-back-btn" id="linkRecoverBack">Volver al inicio de sesión</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async onEnter() {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('password_changed') === '1') {
      // Sólo se puede consultar el DOM DESPUÉS de render; lo movemos a init.
      this._showPasswordChangedBanner = true;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }

  async init() {
    if (this._showPasswordChangedBanner) {
      const banner = this.querySelector('#signinPasswordChangedBanner');
      if (banner) banner.hidden = false;
      this._showPasswordChangedBanner = false;
    }

    this.form = this.querySelector('#form_signin');
    const linkForgot = this.querySelector('#linkForgotPassword');

    if (!this.form) {
      console.error('SignInView: formulario no encontrado');
      return;
    }

    this.addEventListener(this.form, 'submit', (e) => {
      e.preventDefault();
      this.handleSignIn();
    });

    this.signinMain = this.querySelector('#signinMain');
    this.signinRecover = this.querySelector('#signinRecover');
    if (linkForgot) {
      this.addEventListener(linkForgot, 'click', (e) => {
        e.preventDefault();
        this.showRecoverState();
      });
    }
    const btnSendRecover = this.querySelector('#btnSendRecover');
    const linkRecoverBack = this.querySelector('#linkRecoverBack');
    if (btnSendRecover) {
      this.addEventListener(btnSendRecover, 'click', () => this.handleSendRecoverLink());
    }
    if (linkRecoverBack) {
      this.addEventListener(linkRecoverBack, 'click', (e) => {
        e.preventDefault();
        this.hideRecoverState();
      });
    }
  }

  async handleSignIn() {
    const email = this.querySelector('#signinEmail')?.value?.trim();
    const password = this.querySelector('#signinPassword')?.value;
    const btn = this.querySelector('#btnSignIn');

    if (!email || !password) {
      alert('Introduce email y contraseña.');
      return;
    }
    if (!window.authService) {
      alert('Error: servicio de autenticación no disponible.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Iniciando sesión...';
    }

    try {
      const result = await window.authService.login(email, password);
      if (result.success && result.redirectRoute) {
        if (window.router) window.router.navigate(result.redirectRoute, true);
        else window.location.href = `/#${result.redirectRoute}`;
        return;
      }
      if (result.error === 'EMAIL_NOT_VERIFIED' || (result.message && result.message.includes('verifica'))) {
        alert('Por favor verifica tu email antes de iniciar sesión. Revisa tu bandeja de entrada.');
        return;
      }
      const msg = result.error && result.error.includes('Invalid')
        ? 'Email o contraseña incorrectos.'
        : (result.error || 'Error al iniciar sesión.');
      alert(msg);
    } catch (err) {
      console.error('Error en login:', err);
      alert('Error al iniciar sesión. Intenta de nuevo.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    }
  }

  showRecoverState() {
    if (this.signinMain) this.signinMain.style.display = 'none';
    if (this.signinRecover) {
      this.signinRecover.removeAttribute('hidden');
      this.signinRecover.setAttribute('aria-hidden', 'false');
    }
    const form = this.querySelector('#recoverForm');
    const success = this.querySelector('#recoverSuccess');
    if (form) form.hidden = false;
    if (success) success.hidden = true;
    const emailInput = this.querySelector('#recoverEmail');
    if (emailInput) {
      emailInput.value = this.querySelector('#signinEmail')?.value?.trim() || '';
      emailInput.focus();
    }
  }

  hideRecoverState() {
    if (this.signinMain) this.signinMain.style.display = '';
    if (this.signinRecover) {
      this.signinRecover.setAttribute('hidden', '');
      this.signinRecover.setAttribute('aria-hidden', 'true');
    }
  }

  async handleSendRecoverLink() {
    const emailInput = this.querySelector('#recoverEmail');
    const email = emailInput?.value?.trim();
    if (!email) {
      if (emailInput) emailInput.focus();
      return;
    }
    if (!window.authService) {
      alert('Servicio no disponible.');
      return;
    }

    const btn = this.querySelector('#btnSendRecover');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Enviando...';
    }

    const result = await window.authService.resetPassword(email);

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enviar enlace';
    }

    if (result.success) {
      const form = this.querySelector('#recoverForm');
      const success = this.querySelector('#recoverSuccess');
      if (form) form.hidden = true;
      if (success) success.hidden = false;
    } else {
      alert(result.error || 'Error al enviar el correo. Intenta de nuevo.');
    }
  }
}

window.SignInView = SignInView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignInView;
}
