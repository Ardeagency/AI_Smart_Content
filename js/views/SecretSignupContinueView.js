/**
 * SecretSignupContinueView — destino del enlace de confirmación del sign up
 * secreto (window.SECRET_SIGNUP.continue).
 *
 * Al hacer click en el correo de confirmación, GoTrue confirma el email y deja
 * una sesión (el cliente supabase-js la detecta del hash de la URL). Aquí, ya
 * autenticado, invocamos la edge function signup-self-finalize que crea la
 * organización con el usuario como owner (los datos viajan en user_metadata),
 * y redirigimos al dashboard de su nueva org.
 *
 * Ruta pública: el router no debe rebotar a /login antes de que se hidrate la
 * sesión del hash. La vista resuelve la sesión por su cuenta.
 */
class SecretSignupContinueView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
  }

  async updateHeader() { /* pagina publica: sin header */ }

  _t(es) { return (window.__ ? window.__(es) : es); }

  renderHTML() {
    return `
      <div class="ssup-page">
        <div class="ssup-shell ssup-shell--center">
          <div class="ssup-brand">
            <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="ssup-brand-logo" width="170" height="64" decoding="async">
          </div>
          <div class="ssup-continue" id="ssupContinue">
            <div class="ssup-spinner" aria-hidden="true"></div>
            <h1 id="ssupContTitle">${this._t('Preparando tu organización…')}</h1>
            <p id="ssupContStatus">${this._t('Confirmando tu cuenta…')}</p>
          </div>
        </div>
      </div>
    `;
  }

  _set(title, status) {
    const t = this.querySelector('#ssupContTitle');
    const s = this.querySelector('#ssupContStatus');
    if (title != null && t) t.textContent = title;
    if (status != null && s) s.innerHTML = status;
  }

  _fail(msg) {
    const box = this.querySelector('#ssupContinue');
    if (!box) return;
    box.innerHTML = `
      <div class="ssup-verify-icon ssup-verify-icon--err" aria-hidden="true">!</div>
      <h1>${this._t('Algo salió mal')}</h1>
      <p class="ssup-status is-error">${this.escapeHtml(msg)}</p>
      <button type="button" class="ssup-btn ssup-btn-primary" id="ssupRetry">${this._t('Reintentar')}</button>
      <button type="button" class="ssup-btn ssup-btn-ghost" id="ssupToLogin">${this._t('Ir a iniciar sesión')}</button>
    `;
    const retry = this.querySelector('#ssupRetry');
    if (retry) this.addEventListener(retry, 'click', () => this._run());
    const login = this.querySelector('#ssupToLogin');
    if (login) this.addEventListener(login, 'click', () => { if (window.router) window.router.navigate('/login', true); });
  }

  async init() {
    this.supabase = window.supabase
      || (window.supabaseService && (await window.supabaseService.getClient()));
    if (!this.supabase) { this._fail(this._t('No se pudo cargar Supabase. Recarga la página.')); return; }
    await this._run();
  }

  // Espera a que la sesión del hash de confirmación se hidrate (detectSessionInUrl).
  async _waitForSession(maxMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session && session.user) return session;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  }

  async _run() {
    this._set(this._t('Preparando tu organización…'), this._t('Confirmando tu cuenta…'));

    const session = await this._waitForSession();
    if (!session) {
      this._fail(this._t('No detectamos tu sesión. Abre de nuevo el enlace del correo, o inicia sesión.'));
      return;
    }
    if (session.user.is_anonymous === true) {
      this._fail(this._t('Sesión no válida para este paso.'));
      return;
    }

    this._set(null, this._t('Creando tu organización…'));

    try {
      const { data, error } = await this.supabase.functions.invoke('signup-self-finalize', { body: {} });
      if (error) {
        // El cuerpo de error de una Edge Function trae el mensaje real.
        let msg = error.message || String(error);
        try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch (_) {}
        throw new Error(msg);
      }
      const orgId = data && data.organization_id;
      if (!orgId) throw new Error(this._t('No se pudo crear la organización.'));

      // Fijar la org activa para que el resto del SPA la tome.
      try { localStorage.setItem('selectedOrganizationId', orgId); } catch (_) {}

      // Pre-cargar perfil + membresía para evitar carreras del router.
      this._set(this._t('¡Listo!'), this._t('Abriendo tu plataforma…'));
      const uid = session.user.id;
      try {
        if (window.authService && typeof window.authService.loadUserData === 'function') {
          await window.authService.loadUserData(uid);
        }
        if (window.authService && typeof window.authService.loadMembership === 'function') {
          await window.authService.loadMembership(orgId);
        }
      } catch (_) { /* el destino igual resuelve */ }

      let target = '/home';
      try {
        if (window.authService && typeof window.authService.getDefaultUserRoute === 'function') {
          target = await window.authService.getDefaultUserRoute(uid);
        }
      } catch (_) {}

      if (window.router) window.router.navigate(target, true);
      else window.location.replace(target);
    } catch (err) {
      this._fail((err && err.message) ? err.message : String(err));
    }
  }
}

window.SecretSignupContinueView = SecretSignupContinueView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecretSignupContinueView;
}
