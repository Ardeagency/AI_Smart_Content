/**
 * SignInView - Vista de inicio de sesión.
 */
class SignInView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'signin.html';
    this.form = null;
    this.signinMain = null;
    this.signinRecover = null;
  }

  async onEnter() {
    // Sin redirección automática: siempre se muestra la página de login/registro
    // Mostrar banner si vienen de "cambiar contraseña" exitoso
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('password_changed') === '1') {
      const banner = document.getElementById('signinPasswordChangedBanner');
      if (banner) banner.hidden = false;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }

  async init() {
    this.form = this.querySelector('#form_signin');
    const linkForgot = this.querySelector('#linkForgotPassword');

    if (!this.form) {
      console.error('SignInView: elementos del formulario no encontrados');
      return;
    }

    // Envío del formulario (solo inicio de sesión)
    this.addEventListener(this.form, 'submit', (e) => {
      e.preventDefault();
      this.handleSignIn();
    });

    // Olvidaste tu contraseña → mostrar bloque recuperar
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
        if (window.router) {
          window.router.navigate(result.redirectRoute, true);
        } else {
          window.location.href = `/#${result.redirectRoute}`;
        }
        return;
      }

      if (result.error === 'EMAIL_NOT_VERIFIED' || (result.message && result.message.includes('verifica'))) {
        alert('Por favor verifica tu email antes de iniciar sesión. Revisa tu bandeja de entrada.');
        return;
      }

      const msg = result.error && result.error.includes('Invalid') ? 'Email o contraseña incorrectos.' : (result.error || 'Error al iniciar sesión.');
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
