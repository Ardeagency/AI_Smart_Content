/**
 * VerificationView - Pantalla mostrada cuando el usuario aún no ha verificado
 * su correo electrónico. Ruta pública: el usuario llega aquí desde el flujo de
 * login (AuthService devuelve `EMAIL_NOT_VERIFIED` y SignInView redirige aquí
 * con `?email=...`) o directamente tras hacer click en un magic-link expirado.
 *
 * No es una vista de "verificar token" — Supabase maneja la confirmación
 * mediante el enlace del email. Esta vista solo le indica al usuario qué hacer
 * y le permite reenviar el correo de verificación.
 */
class VerificationView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this._email = '';
    this._resendCooldownUntil = 0;
    this._cooldownTimer = null;
  }

  async updateHeader() {
    // Sin header de usuario en páginas públicas
  }

  async onEnter() {
    const params = new URLSearchParams(window.location.search || '');
    this._email = (params.get('email') || '').trim().toLowerCase();
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

          <div class="verification-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h16v12H4z"></path>
              <path d="M4 6l8 7 8-7"></path>
            </svg>
          </div>

          <h1 class="verification-title">${__('Verifica tu correo')}</h1>
          <p class="verification-desc">
            ${__('Te enviamos un enlace de verificación. Abre tu bandeja de entrada y haz click en el enlace para activar tu cuenta y continuar el proceso.')}
          </p>
          ${emailHtml}
          <p class="verification-hint">${__('¿No te llega? Revisa la carpeta de spam o promociones.')}</p>

          <button type="button" class="btn btn-primary signin-submit" id="btnResendVerification">
            ${__('Reenviar correo de verificación')}
          </button>
          <p class="verification-status" id="verificationStatus" hidden></p>

          <button type="button" class="signin-recover-back signin-recover-back-btn" id="linkBackToLogin">
            ${__('Volver al inicio de sesión')}
          </button>
        </div>

        <footer class="signin-footer">
          <span class="signin-footer-copy">${year} AI SMART CONTENT by ARDE AGENCY S.A.S. ${__('Todos los derechos reservados.')}</span>
          <span class="signin-footer-links">
            <a href="https://aismartcontent.io/privacy-policy" target="_blank" rel="noopener">${__('Privacidad')}</a>
            <span aria-hidden="true">·</span>
            <a href="https://aismartcontent.io/terms-and-conditions" target="_blank" rel="noopener">${__('Términos')}</a>
            <span aria-hidden="true">·</span>
            <a href="https://aismartcontent.io/contact" target="_blank" rel="noopener">${__('Contacto')}</a>
          </span>
        </footer>
      </div>
    `;
  }

  async init() {
    const btnResend = this.querySelector('#btnResendVerification');
    const linkBack = this.querySelector('#linkBackToLogin');

    if (btnResend) {
      this.addEventListener(btnResend, 'click', () => this.handleResend());
    }
    if (linkBack) {
      this.addEventListener(linkBack, 'click', (e) => {
        e.preventDefault();
        if (window.router) window.router.navigate('/login', true);
        else window.location.href = '/login';
      });
    }
  }

  async handleResend() {
    const btn = this.querySelector('#btnResendVerification');
    const status = this.querySelector('#verificationStatus');

    if (Date.now() < this._resendCooldownUntil) return;

    let email = this._email;
    if (!email) {
      email = (prompt(__('¿A qué correo enviamos el enlace?')) || '').trim().toLowerCase();
      if (!email) return;
      this._email = email;
    }

    if (btn) { btn.disabled = true; btn.textContent = __('Enviando...'); }
    if (status) {
      status.hidden = true;
      status.classList.remove('verification-status--ok', 'verification-status--err');
    }

    try {
      const supabase = window.supabase
        || (window.supabaseService && (await window.supabaseService.getClient()));
      if (!supabase) throw new Error('Supabase no disponible');

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/` }
      });

      if (error) {
        this._showStatus(status, error.message || __('No se pudo reenviar el correo.'), false);
      } else {
        this._showStatus(status, __('Correo reenviado a {email}. Revisa tu bandeja.', { email }), true);
        this._startCooldown(60);
      }
    } catch (err) {
      console.error('VerificationView.handleResend:', err);
      this._showStatus(status, __('Error reenviando el correo. Intenta de nuevo en un momento.'), false);
    } finally {
      if (btn && Date.now() >= this._resendCooldownUntil) {
        btn.disabled = false;
        btn.textContent = __('Reenviar correo de verificación');
      }
    }
  }

  _showStatus(node, msg, ok) {
    if (!node) return;
    node.textContent = msg;
    node.classList.toggle('verification-status--ok', !!ok);
    node.classList.toggle('verification-status--err', !ok);
    node.hidden = false;
  }

  _startCooldown(seconds) {
    this._resendCooldownUntil = Date.now() + seconds * 1000;
    const btn = this.querySelector('#btnResendVerification');
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((this._resendCooldownUntil - Date.now()) / 1000));
      if (!btn) return;
      if (remaining <= 0) {
        btn.disabled = false;
        btn.textContent = __('Reenviar correo de verificación');
        if (this._cooldownTimer) { clearInterval(this._cooldownTimer); this._cooldownTimer = null; }
        return;
      }
      btn.disabled = true;
      btn.textContent = __('Reenviar en {n}s', { n: remaining });
    };
    tick();
    if (this._cooldownTimer) clearInterval(this._cooldownTimer);
    this._cooldownTimer = setInterval(tick, 1000);
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
    if (this._cooldownTimer) { clearInterval(this._cooldownTimer); this._cooldownTimer = null; }
    super.destroy();
  }
}

window.VerificationView = VerificationView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VerificationView;
}
