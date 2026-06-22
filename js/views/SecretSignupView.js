/**
 * SecretSignupView — Sign up secreto self-service.
 *
 * Ruta NO enlazada (el "secreto" es la URL): window.SECRET_SIGNUP.base.
 * Permite que un usuario cree SU PROPIA cuenta sin un Lead. Reusa el shell del
 * login (video de fondo + card glass + footer).
 *
 * Flujo (2 pantallas, sin pasos):
 *   1. Cuenta    — Continuar con Google / Facebook, o nombre + correo + contraseña.
 *   2. Verificar — pantalla "revisa tu correo" (solo para el alta por email).
 *
 * - Email/password: supabase.auth.signUp() nativo. Crea el usuario sin confirmar,
 *   envía el email de confirmación y guarda en user_metadata.pending_org los
 *   datos por defecto de la organización. El emailRedirectTo apunta a la página
 *   de continuación, que tras confirmar invoca signup-self-finalize y crea la org.
 * - Google/Facebook: supabase.auth.signInWithOAuth() con redirectTo a la página
 *   de continuación (el email del proveedor ya viene verificado).
 *
 * La organización se crea con un nombre por defecto (el del usuario); se refina
 * después dentro de la plataforma.
 */
class SecretSignupView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.step = 'cuenta';           // 'cuenta' | 'verify'
    this._submitting = false;
    this._resendCooldownUntil = 0;
    this._cooldownTimer = null;
    this.form = { full_name: '', email: '', password: '' };
    this.createdEmail = '';
    this._hasSession = false;
    this._sessionEmail = '';
  }

  async updateHeader() { /* pagina publica: sin header */ }

  // Corre ANTES de renderHTML: detectamos sesión aquí para que el banner ya
  // aparezca en el primer pintado (no redirigimos: es una página de registro).
  async onEnter() {
    await super.onEnter?.();
    try {
      this.supabase = window.supabase
        || (window.supabaseService && (await window.supabaseService.getClient()));
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user && user.is_anonymous !== true) {
          this._hasSession = true;
          this._sessionEmail = user.email || '';
        }
      }
    } catch (_) { /* seguir con el registro */ }
  }

  _t(es) { return (window.__ ? window.__(es) : es); }

  _continuePath() {
    return (window.SECRET_SIGNUP && window.SECRET_SIGNUP.continue) || '/registro/continuar';
  }

  // Datos por defecto de la organización (ya no se piden en el alta).
  _defaultPendingOrg() {
    const name = this.form.full_name || (this.form.email || '').split('@')[0] || '';
    return {
      name,
      brand_name_oficial: name,
      level_of_autonomy: 'parcial',
      idiomas_contenido: ['es'],
      mercado_objetivo: [],
    };
  }

  // ─── Render ──────────────────────────────────────────────────────────

  renderHTML() {
    const year = new Date().getFullYear();
    return `
      <div class="signin-container signin-container--hero ssup-scope">
        <video class="signin-hero-video" autoplay muted loop playsinline preload="auto"
               poster="https://res.cloudinary.com/dmruwjuxn/image/upload/v1779481981/__8_kejphv.jpg">
          <source src="https://res.cloudinary.com/dmruwjuxn/video/upload/v1779651061/Home_banner_kjnlcm.mp4" type="video/mp4">
        </video>
        <div class="signin-card ssup-card">
          <div class="signin-brand">
            <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="signin-brand-logo" width="180" height="72" decoding="async">
          </div>
          ${this._hasSession ? `
            <div class="ssup-banner" id="ssupBanner">
              <span>${this._t('Ya tienes una sesión iniciada como')} <strong>${this.escapeHtml(this._sessionEmail)}</strong>.</span>
              <button type="button" class="ssup-banner-btn" id="ssupEnter">${this._t('Iniciar sesión')}</button>
            </div>
          ` : ''}
          <div class="ssup-body" id="ssupBody">
            ${this.renderStep()}
          </div>
        </div>
        <footer class="signin-footer">
          <span class="signin-footer-copy">${year} AI SMART CONTENT by ARDE AGENCY S.A.S. ${this._t('Todos los derechos reservados.')}</span>
          <span class="signin-footer-links">
            <a href="https://aismartcontent.io/privacy-policy" target="_blank" rel="noopener">${this._t('Privacidad')}</a>
            <span aria-hidden="true">·</span>
            <a href="https://aismartcontent.io/terms-and-conditions" target="_blank" rel="noopener">${this._t('Términos')}</a>
            <span aria-hidden="true">·</span>
            <a href="https://aismartcontent.io/contact" target="_blank" rel="noopener">${this._t('Contacto')}</a>
          </span>
        </footer>
      </div>
    `;
  }

  renderStep() {
    return this.step === 'verify' ? this.renderStepVerify() : this.renderStepCuenta();
  }

  renderStepCuenta() {
    const f = this.form;
    return `
      <header class="ssup-head">
        <h1>${this._t('Crea tu cuenta')}</h1>
        <p>${this._t('Empieza con tu proveedor favorito o con tu correo.')}</p>
      </header>

      <div class="ssup-oauth">
        <button type="button" class="ssup-oauth-btn" data-oauth="google">
          ${this._googleIcon()}<span>${this._t('Continuar con Google')}</span>
        </button>
        <button type="button" class="ssup-oauth-btn" data-oauth="facebook">
          ${this._facebookIcon()}<span>${this._t('Continuar con Facebook')}</span>
        </button>
      </div>

      <div class="ssup-divider"><span>${this._t('o')}</span></div>

      <form id="ssupCuentaForm" class="ssup-form" novalidate autocomplete="on">
        <div class="ssup-field">
          <label for="ssupName">${this._t('Nombre completo')}</label>
          <input class="form-input" id="ssupName" name="full_name" type="text" placeholder="${this._t('Ej. María García')}" autocomplete="name" value="${this.escapeHtml(f.full_name)}" required>
        </div>
        <div class="ssup-field">
          <label for="ssupEmail">${this._t('Correo electrónico')}</label>
          <input class="form-input" id="ssupEmail" name="email" type="email" placeholder="tu@correo.com" autocomplete="email" value="${this.escapeHtml(f.email)}" required>
        </div>
        <div class="ssup-field">
          <label for="ssupPass">${this._t('Contraseña')}</label>
          <input class="form-input" id="ssupPass" name="password" type="password" placeholder="${this._t('Mínimo 8 caracteres')}" autocomplete="new-password" minlength="8" value="${this.escapeHtml(f.password)}" required>
        </div>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
        <button type="submit" class="ssup-btn ssup-btn-primary ssup-btn-block" data-action="create">${this._t('Crear cuenta')}</button>
      </form>
    `;
  }

  renderStepVerify() {
    return `
      <div class="ssup-verify">
        <div class="ssup-verify-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16v12H4z"></path><path d="M4 6l8 7 8-7"></path>
          </svg>
        </div>
        <h1>${this._t('Verifica tu correo')}</h1>
        <p>${this._t('Te enviamos un enlace de confirmación a')} <strong>${this.escapeHtml(this.createdEmail)}</strong>. ${this._t('Ábrelo para activar tu cuenta y entrar.')}</p>
        <p class="ssup-hint">${this._t('¿No te llega? Revisa spam o promociones.')}</p>
        <button type="button" class="ssup-btn ssup-btn-primary ssup-btn-block" id="ssupResend">${this._t('Reenviar correo')}</button>
        <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-block" data-action="back-cuenta">${this._t('Volver')}</button>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
      </div>
    `;
  }

  _googleIcon() {
    return `<svg class="ssup-oauth-ico" viewBox="0 0 18 18" aria-hidden="true" width="18" height="18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>`;
  }

  _facebookIcon() {
    return `<svg class="ssup-oauth-ico" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
      <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z"/>
    </svg>`;
  }

  // ─── Init / navegación ───────────────────────────────────────────────

  async init() {
    this.supabase = this.supabase || window.supabase
      || (window.supabaseService && (await window.supabaseService.getClient()));
    if (!this.supabase) {
      this._setStatus(this._t('No se pudo cargar Supabase. Recarga la página.'), 'error');
      return;
    }
    this.wire();
    const enter = this.querySelector('#ssupEnter');
    if (enter) this.addEventListener(enter, 'click', () => this._handleEnter());
  }

  // El usuario ya tiene sesión: lo llevamos a su cuenta (no cerramos sesión aquí;
  // si decide crear una nueva, _handleCreate/_handleOAuth cierran la actual).
  async _handleEnter() {
    let target = '/home';
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user && window.authService && typeof window.authService.getDefaultUserRoute === 'function') {
        target = await window.authService.getDefaultUserRoute(user.id);
      }
    } catch (_) {}
    if (window.router) window.router.navigate(target, true);
    else window.location.href = target;
  }

  wire() {
    this.querySelectorAll('[data-oauth]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => this._handleOAuth(btn.getAttribute('data-oauth')));
    });

    const cuentaForm = this.querySelector('#ssupCuentaForm');
    if (cuentaForm) this.addEventListener(cuentaForm, 'submit', (e) => { e.preventDefault(); this._handleCreate(); });

    const resend = this.querySelector('#ssupResend');
    if (resend) this.addEventListener(resend, 'click', () => this._handleResend());

    const back = this.querySelector('[data-action="back-cuenta"]');
    if (back) this.addEventListener(back, 'click', () => this._goto('cuenta'));
  }

  _goto(step) {
    this.step = step;
    const body = this.querySelector('#ssupBody');
    if (body) { body.innerHTML = this.renderStep(); this.wire(); }
  }

  _captureCuenta() {
    this.form.full_name = (this.querySelector('#ssupName')?.value || '').trim();
    this.form.email = (this.querySelector('#ssupEmail')?.value || '').toLowerCase().trim();
    this.form.password = this.querySelector('#ssupPass')?.value || '';
  }

  _validateCuenta() {
    const f = this.form;
    if (!f.full_name) return this._setStatus(this._t('Falta tu nombre.'), 'error'), false;
    if (!f.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return this._setStatus(this._t('Correo inválido.'), 'error'), false;
    if (f.password.length < 8) return this._setStatus(this._t('La contraseña debe tener al menos 8 caracteres.'), 'error'), false;
    return true;
  }

  async _ensureSignedOut() {
    if (!this._hasSession) return;
    try { await this.supabase.auth.signOut(); } catch (_) {}
    this._hasSession = false;
    const banner = this.querySelector('#ssupBanner');
    if (banner) banner.remove();
  }

  async _handleOAuth(provider) {
    if (this._submitting) return;
    this._submitting = true;
    this._setStatus('', '');
    await this._ensureSignedOut();
    try {
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}${this._continuePath()}` },
      });
      if (error) throw error;
      // signInWithOAuth redirige al proveedor; no hay más que hacer aquí.
    } catch (err) {
      this._submitting = false;
      this._setStatus((err && err.message) ? err.message : String(err), 'error');
    }
  }

  async _handleCreate() {
    if (this._submitting) return;
    this._captureCuenta();
    if (!this._validateCuenta()) return;

    this._submitting = true;
    this._setSubmitting(true);
    this._setStatus(this._t('Creando tu cuenta y enviando el correo…'), '');

    await this._ensureSignedOut();

    const f = this.form;
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: f.email,
        password: f.password,
        options: {
          emailRedirectTo: `${window.location.origin}${this._continuePath()}`,
          data: { full_name: f.full_name, pending_org: this._defaultPendingOrg() },
        },
      });
      if (error) throw error;

      this.createdEmail = f.email;

      if (data && data.session) {
        // Confirmación deshabilitada: ir directo a continuar.
        if (window.router) window.router.navigate(this._continuePath(), true);
        return;
      }
      this._submitting = false;
      this._goto('verify');
    } catch (err) {
      this._submitting = false;
      this._setSubmitting(false);
      this._setStatus((err && err.message) ? err.message : String(err), 'error');
    }
  }

  async _handleResend() {
    if (Date.now() < this._resendCooldownUntil) return;
    const email = this.createdEmail;
    if (!email) return;
    try {
      const { error } = await this.supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}${this._continuePath()}` },
      });
      if (error) { this._setStatus(error.message, 'error'); return; }
      this._setStatus(this._t('Correo reenviado. Revisa tu bandeja.'), 'ok');
      this._startCooldown(60);
    } catch (err) {
      this._setStatus((err && err.message) || String(err), 'error');
    }
  }

  _startCooldown(seconds) {
    this._resendCooldownUntil = Date.now() + seconds * 1000;
    const btn = this.querySelector('#ssupResend');
    const tick = () => {
      const rem = Math.max(0, Math.ceil((this._resendCooldownUntil - Date.now()) / 1000));
      if (!btn) return;
      if (rem <= 0) { btn.disabled = false; btn.textContent = this._t('Reenviar correo'); if (this._cooldownTimer) { clearInterval(this._cooldownTimer); this._cooldownTimer = null; } return; }
      btn.disabled = true; btn.textContent = `${this._t('Reenviar en')} ${rem}s`;
    };
    tick();
    if (this._cooldownTimer) clearInterval(this._cooldownTimer);
    this._cooldownTimer = setInterval(tick, 1000);
  }

  _setSubmitting(yes) {
    const btn = this.querySelector('[data-action="create"]');
    if (btn) btn.disabled = !!yes;
  }

  _setStatus(text, type) {
    const el = this.querySelector('#ssupStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'ssup-status';
    if (type === 'error') el.classList.add('is-error');
    if (type === 'ok') el.classList.add('is-ok');
  }

  destroy() {
    if (this._cooldownTimer) { clearInterval(this._cooldownTimer); this._cooldownTimer = null; }
    super.destroy?.();
  }
}

window.SecretSignupView = SecretSignupView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecretSignupView;
}
