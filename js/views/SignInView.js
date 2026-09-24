/**
 * SignInView - Acceso para usuarios existentes.
 * Patrón SPA: HTML inline, sin template.
 * Sin opción de registro — la plataforma es por invitación.
 * Dos estados intercambiables sobre la misma card:
 *   1. signin-main      → login (email + password)
 *   2. signin-recover   → recuperar contraseña
 */
class SignInView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.form = null;
    this.signinMain = null;
    this.signinRecover = null;
    this.signinMfa = null;
    this._pendingMfa = null; // { factorId, factorName }
  }

  async updateHeader() {
    // Sin header de usuario en páginas públicas
  }

  renderHTML() {
    const year = new Date().getFullYear();
    return `
      <div class="signin-container signin-container--hero">
        <video class="signin-hero-video" autoplay muted loop playsinline preload="metadata"
               poster="https://res.cloudinary.com/dmruwjuxn/image/upload/v1779481981/__8_kejphv.jpg">
          <source src="${window.AISC_LOGIN_VIDEO_URL || 'https://tsdpbqcwjckbfsdqacam.supabase.co/storage/v1/object/public/web-assets/home-banner-web.mp4'}" type="video/mp4">
        </video>
        <div class="signin-card">
          <div class="signin-brand">
            <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="signin-brand-logo" width="180" height="72" decoding="async">
          </div>

          <div class="signin-success-banner" id="signinSesionBanner" role="status" hidden>
            <span>${__('Tu sesión terminó. Vuelve a entrar y seguimos donde ibas.')}</span>
          </div>

          <div class="signin-success-banner" id="signinPasswordChangedBanner" hidden>
            <span class="signin-success-banner-icon" aria-hidden="true">✓</span>
            <span>${__('Contraseña actualizada. Inicia sesión con tu nueva contraseña.')}</span>
          </div>

          <div class="signin-main" id="signinMain">
            <form id="form_signin" novalidate>
              <div class="auth-state active" data-state="signin">
                <div class="signin-field">
                  <label class="signin-field-label" for="signinEmail">${__('Correo electrónico')}</label>
                  <input type="email" class="form-input" id="signinEmail" name="email" placeholder="${__('nombre@empresa.com')}" autocomplete="email" required>
                </div>
                <div class="signin-field">
                  <label class="signin-field-label" for="signinPassword">${__('Contraseña')}</label>
                  <input type="password" class="form-input" id="signinPassword" name="password" placeholder="********" autocomplete="current-password" required>
                </div>
                <button type="button" class="signin-forgot signin-forgot-btn" id="linkForgotPassword">${__('¿Olvidaste tu contraseña?')}</button>
                <div class="signin-turnstile" id="turnstileLogin" hidden></div>
                <p class="signin-mfa-error" id="signinError" role="alert" hidden></p>
                <button type="submit" class="btn btn-primary signin-submit" id="btnSignIn">${__('Iniciar sesión')}</button>
              </div>
            </form>
          </div>

          <div class="signin-mfa" id="signinMfa" aria-hidden="true" hidden>
            <h2 class="signin-recover-title">${__('Verificación de 2 pasos')}</h2>
            <p class="signin-recover-desc">${__('Abre tu app autenticadora ({app}) e ingresa el código de 6 dígitos.', { app: '<span id="mfaFactorName">Authenticator</span>' })}</p>
            <form id="form_mfa" novalidate>
              <input type="text" class="form-input signin-mfa-code" id="mfaCode" placeholder="123456" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" required>
              <p class="signin-mfa-error" id="mfaError" hidden></p>
              <button type="submit" class="btn btn-primary signin-submit" id="btnVerifyMfa">${__('Verificar')}</button>
              <button type="button" class="signin-recover-back signin-recover-back-btn" id="linkMfaBack">${__('Volver')}</button>
            </form>
          </div>

          <div class="signin-recover" id="signinRecover" aria-hidden="true" hidden>
            <h2 class="signin-recover-title">${__('Recuperar contraseña')}</h2>
            <p class="signin-recover-desc">${__('Te enviaremos un enlace a tu correo para restablecer la contraseña. Debes hacer clic en el enlace para verificar que eres tú.')}</p>
            <div class="signin-recover-form" id="recoverForm">
              <input type="email" class="form-input" id="recoverEmail" placeholder="${__('Correo electrónico')}" autocomplete="email" required>
              <div class="signin-turnstile" id="turnstileRecover" hidden></div>
              <p class="signin-mfa-error" id="recoverError" role="alert" hidden></p>
              <button type="button" class="btn btn-primary" id="btnSendRecover">${__('Enviar enlace')}</button>
            </div>
            <div class="signin-recover-success" id="recoverSuccess" hidden>
              <p class="signin-recover-success-text">${__('Si existe una cuenta con ese correo, recibirás un enlace en unos minutos. Revisa también la carpeta de spam.')}</p>
            </div>
            <button type="button" class="signin-recover-back signin-recover-back-btn" id="linkRecoverBack">${__('Volver al inicio de sesión')}</button>
          </div>
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

  async onEnter() {
    const params = new URLSearchParams(window.location.search || '');
    this._motivoSesion = params.get('motivo') === 'sesion';
    const next = params.get('next');
    this._next = next && window.rutaInterna?.(next) ? next : null;
    if (params.get('password_changed') === '1') {
      // Sólo se puede consultar el DOM DESPUÉS de render; lo movemos a init.
      this._showPasswordChangedBanner = true;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + (this._next ? `?next=${encodeURIComponent(this._next)}` : ''));
      }
    }
  }

  async init() {
    if (this._motivoSesion) {
      const b = this.querySelector('#signinSesionBanner');
      if (b) b.hidden = false;
    }
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
    // Captcha (Turnstile): solo si la consola tiene AISC_TURNSTILE_SITE_KEY; sin clave, nada cambia.
    if (window.Turnstile?.activo()) window.Turnstile.pintar('turnstileLogin', { accion: 'login' }).catch((e) => console.warn('[signin] turnstile:', e.message));

    this.signinMain = this.querySelector('#signinMain');
    this.signinRecover = this.querySelector('#signinRecover');
    this.signinMfa = this.querySelector('#signinMfa');
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

    // ── FEAT-020 · MFA ────────────────────────────
    const mfaForm = this.querySelector('#form_mfa');
    if (mfaForm) {
      this.addEventListener(mfaForm, 'submit', (e) => { e.preventDefault(); this.handleVerifyMfa(); });
    }
    const linkMfaBack = this.querySelector('#linkMfaBack');
    if (linkMfaBack) {
      this.addEventListener(linkMfaBack, 'click', async (e) => {
        e.preventDefault();
        if (window.authService) await window.authService.logout(); // descartar sesión AAL1
        this.hideMfaState();
      });
    }
    // /recuperar abre directo la tarjeta de recuperar contraseña.
    if (window.location.pathname === '/recuperar') this.showRecoverState();

    // Navegación SPA para footer (sin full reload)
    const spaLinks = this.querySelectorAll('a[data-href]');
    spaLinks.forEach((link) => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-href');
        if (target && window.router) window.router.navigate(target);
      });
    });
  }

  /** Error dentro de la tarjeta, nunca en un diálogo del navegador. `id` = el <p role="alert"> a usar. */
  _error(msg, id = 'signinError') {
    const el = this.querySelector(`#${id}`);
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  /** Tras entrar: vuelve a `?next=` si es una ruta interna; si no, a la ruta por defecto. */
  _irTrasEntrar(ruta) {
    const destino = this._next || ruta;
    if (window.router) window.router.navigate(destino, true);
    else window.location.href = destino;
  }

  async handleSignIn() {
    const email = this.querySelector('#signinEmail')?.value?.trim();
    const password = this.querySelector('#signinPassword')?.value;
    const btn = this.querySelector('#btnSignIn');

    this._error('');
    if (!email || !password) {
      this._error(__('Escribe tu correo y tu contraseña.'));
      return;
    }
    if (!window.authService) {
      this._error(__('No pudimos conectar con el servicio de acceso. Recarga la página.'));
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = __('Iniciando sesión...');
    }

    let captchaToken;
    try { captchaToken = window.Turnstile ? window.Turnstile.token('turnstileLogin') : null; }
    catch (e) { this._error(e.message); if (btn) { btn.disabled = false; btn.textContent = __('Iniciar sesión'); } return; }

    try {
      const result = await window.authService.login(email, password, { captchaToken });
      if (captchaToken && !result.success) window.Turnstile.reiniciar('turnstileLogin');
      if (result.success && result.redirectRoute) {
        this._irTrasEntrar(result.redirectRoute);
        return;
      }

      // FEAT-020 · MFA challenge requerido
      if (result.requiresMfa) {
        this._pendingMfa = { factorId: result.factorId, factorName: result.factorName || 'Authenticator' };
        this.showMfaState();
        return;
      }

      // FEAT-020 · org exige MFA pero user no tiene factor → forzar enroll
      // Activar el factor desde la consola llega con ADR-0049 (L6); hasta entonces se dice.
      if (result.requiresMfaEnroll) {
        this._error(__('Tu marca exige verificación en dos pasos y tu cuenta aún no la tiene activa. Escríbenos a contact@aismartcontent.io y la activamos contigo.'));
        return;
      }

      if (result.error === 'EMAIL_NOT_VERIFIED' || (result.message && result.message.includes('verifica'))) {
        const target = `/verification?email=${encodeURIComponent(email)}`;
        if (window.router) window.router.navigate(target, true);
        else window.location.href = target;
        return;
      }
      const msg = result.error && result.error.includes('Invalid')
        ? __('El correo o la contraseña no coinciden.')
        : (result.error || __('No pudimos iniciar sesión. Intenta de nuevo.'));
      this._error(msg);
    } catch (err) {
      console.error('Error en login:', err);
      this._error(__('No pudimos iniciar sesión. Intenta de nuevo.'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = __('Iniciar sesión');
      }
    }
  }

  // ── FEAT-020 · MFA state ────────────────────────────────
  showMfaState() {
    if (this.signinMain) this.signinMain.style.display = 'none';
    if (this.signinRecover) {
      this.signinRecover.setAttribute('hidden', '');
      this.signinRecover.setAttribute('aria-hidden', 'true');
    }
    if (this.signinMfa) {
      this.signinMfa.removeAttribute('hidden');
      this.signinMfa.setAttribute('aria-hidden', 'false');
    }
    const factorName = this.querySelector('#mfaFactorName');
    if (factorName && this._pendingMfa) factorName.textContent = this._pendingMfa.factorName;
    const code = this.querySelector('#mfaCode');
    if (code) { code.value = ''; code.focus(); }
    const err = this.querySelector('#mfaError');
    if (err) { err.hidden = true; err.textContent = ''; }
  }

  hideMfaState() {
    this._pendingMfa = null;
    if (this.signinMain) this.signinMain.style.display = '';
    if (this.signinMfa) {
      this.signinMfa.setAttribute('hidden', '');
      this.signinMfa.setAttribute('aria-hidden', 'true');
    }
  }

  async handleVerifyMfa() {
    if (!this._pendingMfa) return this.hideMfaState();
    const codeInput = this.querySelector('#mfaCode');
    const errorEl   = this.querySelector('#mfaError');
    const btn       = this.querySelector('#btnVerifyMfa');
    const code = String(codeInput?.value || '').trim();
    if (!/^[0-9]{6}$/.test(code)) {
      if (errorEl) { errorEl.textContent = __('El código debe ser de 6 dígitos.'); errorEl.hidden = false; }
      return;
    }
    if (errorEl) errorEl.hidden = true;
    if (btn) { btn.disabled = true; btn.textContent = __('Verificando...'); }
    try {
      const result = await window.authService.verifyMfa(this._pendingMfa.factorId, code);
      if (result.success && result.redirectRoute) {
        this._irTrasEntrar(result.redirectRoute);
        return;
      }
      if (errorEl) {
        errorEl.textContent = result.error || __('Código inválido. Intenta de nuevo.');
        errorEl.hidden = false;
      }
    } catch (e) {
      console.error('handleVerifyMfa:', e);
      if (errorEl) { errorEl.textContent = __('Error inesperado verificando código.'); errorEl.hidden = false; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = __('Verificar'); }
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
    if (window.Turnstile?.activo()) window.Turnstile.pintar('turnstileRecover', { accion: 'recuperar' }).catch((e) => console.warn('[signin] turnstile:', e.message));
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
    this._error('', 'recoverError');
    if (!window.authService) {
      this._error(__('No pudimos conectar con el servicio de acceso. Recarga la página.'), 'recoverError');
      return;
    }

    const btn = this.querySelector('#btnSendRecover');
    if (btn) {
      btn.disabled = true;
      btn.textContent = __('Enviando...');
    }

    let captchaToken;
    try { captchaToken = window.Turnstile ? window.Turnstile.token('turnstileRecover') : null; }
    catch (e) { this._error(e.message, 'recoverError'); if (btn) { btn.disabled = false; btn.textContent = __('Enviar enlace'); } return; }
    const result = await window.authService.resetPassword(email, { captchaToken });
    if (captchaToken) window.Turnstile.reiniciar('turnstileRecover');

    if (btn) {
      btn.disabled = false;
      btn.textContent = __('Enviar enlace');
    }

    if (result.success) {
      const form = this.querySelector('#recoverForm');
      const success = this.querySelector('#recoverSuccess');
      if (form) form.hidden = true;
      if (success) success.hidden = false;
    } else {
      this._error(result.error || __('No pudimos enviar el correo. Intenta de nuevo.'), 'recoverError');
    }
  }
}

window.SignInView = SignInView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignInView;
}
