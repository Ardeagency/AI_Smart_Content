/**
 * SecretSignupView — Sign up secreto self-service.
 *
 * Ruta NO enlazada (el "secreto" es la URL): window.SECRET_SIGNUP.base.
 * Permite que un usuario cree SU PROPIA cuenta + organizacion sin un Lead,
 * reusando la estructura del wizard de crear-usuario del modo dev.
 *
 * Flujo:
 *   1. Cuenta        — nombre, email, password (+confirmar).
 *   2. Organizacion  — nombre de marca, slogan, logo (url opcional), idiomas,
 *                      mercados, nivel de autonomia de Vera.
 *   3. Revisar       — resumen + "Crear cuenta".
 *   → supabase.auth.signUp() nativo: crea el usuario sin confirmar, envia el
 *     email de confirmacion y guarda los datos de la org en user_metadata
 *     (pending_org). El emailRedirectTo apunta a la pagina de continuacion, que
 *     tras la confirmacion invoca la edge function signup-self-finalize y crea
 *     la organizacion con el usuario como owner.
 *   → Pantalla "revisa tu correo" con reenviar.
 *
 * No requiere auth (ruta publica). No se persiste la password en ningun lado
 * distinto de Supabase Auth.
 */
class SecretSignupView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.step = 'cuenta';
    this._submitting = false;
    this._resendCooldownUntil = 0;
    this._cooldownTimer = null;
    this.form = {
      full_name: '',
      email: '',
      password: '',
      password2: '',
      org_name: '',
      slogan: '',
      logo_url: '',
      idiomas: 'es',
      mercados: '',
      level_of_autonomy: 'parcial',
    };
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

  STEPS = [
    { key: 'cuenta', label: 'Cuenta' },
    { key: 'organizacion', label: 'Organización' },
    { key: 'revisar', label: 'Revisar' },
  ];

  AUTONOMY = [
    { v: 'restringido', label: 'Restringido', desc: 'Vera propone, tú apruebas siempre.' },
    { v: 'parcial', label: 'Parcial', desc: 'Vera ejecuta lo seguro, escala lo complejo. Recomendado.' },
    { v: 'total', label: 'Total', desc: 'Vera opera de forma autónoma 24/7.' },
  ];

  _t(es) { return (window.__ ? window.__(es) : es); }

  // ─── Render ──────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="ssup-page">
        <div class="ssup-shell">
          <div class="ssup-brand">
            <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="ssup-brand-logo" width="170" height="64" decoding="async">
          </div>
          ${this._hasSession ? `
            <div class="ssup-banner" id="ssupBanner">
              <span>${this._t('Tienes sesión iniciada como')} <strong>${this.escapeHtml(this._sessionEmail)}</strong>. ${this._t('Para crear una cuenta nueva cerraremos esta sesión.')}</span>
              <button type="button" class="ssup-banner-btn" id="ssupLogout">${this._t('Cerrar sesión')}</button>
            </div>
          ` : ''}
          <div class="ssup-body" id="ssupBody">
            ${this.renderStep()}
          </div>
          <footer class="ssup-footer">
            <span>${new Date().getFullYear()} AI SMART CONTENT · ARDE AGENCY S.A.S.</span>
          </footer>
        </div>
      </div>
    `;
  }

  renderProgress() {
    const idx = this.STEPS.findIndex((s) => s.key === this.step);
    return `
      <ol class="ssup-steps" aria-label="${this._t('Progreso')}">
        ${this.STEPS.map((s, i) => {
          const state = i < idx ? 'is-done' : (i === idx ? 'is-current' : 'is-pending');
          const marker = state === 'is-done' ? '✓' : String(i + 1);
          return `<li class="ssup-step ${state}"><span class="ssup-step-dot">${marker}</span><span class="ssup-step-label">${this.escapeHtml(this._t(s.label))}</span></li>`;
        }).join('')}
      </ol>
    `;
  }

  renderStep() {
    switch (this.step) {
      case 'cuenta': return this.renderStepCuenta();
      case 'organizacion': return this.renderStepOrg();
      case 'revisar': return this.renderStepRevisar();
      case 'verify': return this.renderStepVerify();
      default: return '';
    }
  }

  renderStepCuenta() {
    const f = this.form;
    return `
      ${this.renderProgress()}
      <header class="ssup-head">
        <span class="ssup-eyebrow">${this._t('Paso 1 · Cuenta')}</span>
        <h1>${this._t('Crea tu cuenta')}</h1>
        <p>${this._t('Estos serán tus datos de acceso. Confirmarás tu correo en el siguiente paso.')}</p>
      </header>
      <form id="ssupCuentaForm" class="ssup-form" novalidate autocomplete="on">
        <div class="ssup-field">
          <label for="ssupName">${this._t('Nombre completo')}</label>
          <input id="ssupName" name="full_name" type="text" placeholder="${this._t('Ej. María García')}" autocomplete="name" value="${this.escapeHtml(f.full_name)}" required>
        </div>
        <div class="ssup-field">
          <label for="ssupEmail">${this._t('Correo electrónico')}</label>
          <input id="ssupEmail" name="email" type="email" placeholder="tu@correo.com" autocomplete="email" value="${this.escapeHtml(f.email)}" required>
        </div>
        <div class="ssup-field">
          <label for="ssupPass">${this._t('Contraseña')}</label>
          <input id="ssupPass" name="password" type="password" placeholder="${this._t('Mínimo 8 caracteres')}" autocomplete="new-password" minlength="8" value="${this.escapeHtml(f.password)}" required>
        </div>
        <div class="ssup-field">
          <label for="ssupPass2">${this._t('Confirmar contraseña')}</label>
          <input id="ssupPass2" name="password2" type="password" placeholder="${this._t('Repite la contraseña')}" autocomplete="new-password" minlength="8" value="${this.escapeHtml(f.password2)}" required>
        </div>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
      </form>
      <footer class="ssup-actions">
        <span></span>
        <button type="submit" form="ssupCuentaForm" class="ssup-btn ssup-btn-primary" data-action="next">${this._t('Continuar')} →</button>
      </footer>
    `;
  }

  renderStepOrg() {
    const f = this.form;
    return `
      ${this.renderProgress()}
      <header class="ssup-head">
        <span class="ssup-eyebrow">${this._t('Paso 2 · Organización')}</span>
        <h1>${this._t('Tu organización')}</h1>
        <p>${this._t('Creas tu marca y quedas como owner. Podrás refinar todo el ADN de marca dentro de la plataforma.')}</p>
      </header>
      <form id="ssupOrgForm" class="ssup-form" novalidate>
        <div class="ssup-field">
          <label for="ssupOrgName">${this._t('Nombre de la marca')}</label>
          <input id="ssupOrgName" name="org_name" type="text" placeholder="${this._t('Ej. ACME')}" maxlength="120" value="${this.escapeHtml(f.org_name)}" required>
        </div>
        <div class="ssup-field">
          <label for="ssupSlogan">${this._t('Slogan')} <span class="ssup-opt">(${this._t('opcional')})</span></label>
          <input id="ssupSlogan" name="slogan" type="text" placeholder="${this._t('Frase de marca')}" maxlength="200" value="${this.escapeHtml(f.slogan)}">
        </div>
        <div class="ssup-field">
          <label for="ssupLogo">${this._t('URL del logo')} <span class="ssup-opt">(${this._t('opcional')})</span></label>
          <input id="ssupLogo" name="logo_url" type="url" placeholder="https://…/logo.png" value="${this.escapeHtml(f.logo_url)}">
          <small>${this._t('Puedes subir el logo después dentro de la plataforma.')}</small>
        </div>
        <div class="ssup-row">
          <div class="ssup-field">
            <label for="ssupIdiomas">${this._t('Idiomas de contenido')}</label>
            <input id="ssupIdiomas" name="idiomas" type="text" placeholder="es, en" value="${this.escapeHtml(f.idiomas)}">
            <small>${this._t('Códigos ISO separados por coma.')}</small>
          </div>
          <div class="ssup-field">
            <label for="ssupMercados">${this._t('Mercados')} <span class="ssup-opt">(${this._t('opcional')})</span></label>
            <input id="ssupMercados" name="mercados" type="text" placeholder="CO, MX" value="${this.escapeHtml(f.mercados)}">
            <small>${this._t('Países objetivo, separados por coma.')}</small>
          </div>
        </div>
        <div class="ssup-field">
          <label>${this._t('Nivel de autonomía de Vera')}</label>
          <div class="ssup-autonomy" role="radiogroup">
            ${this.AUTONOMY.map((a) => `
              <label class="ssup-autonomy-opt">
                <input type="radio" name="level_of_autonomy" value="${a.v}" ${a.v === f.level_of_autonomy ? 'checked' : ''}>
                <span class="ssup-autonomy-card">
                  <strong>${this.escapeHtml(this._t(a.label))}</strong>
                  <small>${this.escapeHtml(this._t(a.desc))}</small>
                </span>
              </label>
            `).join('')}
          </div>
        </div>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
      </form>
      <footer class="ssup-actions">
        <button type="button" class="ssup-btn ssup-btn-ghost" data-action="back">← ${this._t('Atrás')}</button>
        <button type="submit" form="ssupOrgForm" class="ssup-btn ssup-btn-primary" data-action="next">${this._t('Continuar')} →</button>
      </footer>
    `;
  }

  renderStepRevisar() {
    const f = this.form;
    const tile = (label, val) => `
      <div class="ssup-tile"><span>${this.escapeHtml(this._t(label))}</span><strong>${this.escapeHtml(val || '—')}</strong></div>`;
    const aut = this.AUTONOMY.find((a) => a.v === f.level_of_autonomy)?.label || f.level_of_autonomy;
    return `
      ${this.renderProgress()}
      <header class="ssup-head">
        <span class="ssup-eyebrow">${this._t('Paso 3 · Revisar')}</span>
        <h1>${this._t('Confirma y crea tu cuenta')}</h1>
        <p>${this._t('Revisa los datos. Te enviaremos un correo para confirmar tu cuenta.')}</p>
      </header>
      <div class="ssup-review">
        <h3>${this._t('Cuenta')}</h3>
        <div class="ssup-grid">
          ${tile('Nombre', f.full_name)}
          ${tile('Correo', f.email)}
        </div>
        <h3>${this._t('Organización')}</h3>
        <div class="ssup-grid">
          ${tile('Marca', f.org_name)}
          ${tile('Slogan', f.slogan)}
          ${tile('Idiomas', f.idiomas)}
          ${tile('Mercados', f.mercados)}
          ${tile('Autonomía', this._t(aut))}
        </div>
      </div>
      <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
      <footer class="ssup-actions">
        <button type="button" class="ssup-btn ssup-btn-ghost" data-action="back">← ${this._t('Atrás')}</button>
        <button type="button" class="ssup-btn ssup-btn-primary" data-action="create">${this._t('Crear cuenta')}</button>
      </footer>
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
        <h1>${this._t('Revisa tu correo')}</h1>
        <p>${this._t('Te enviamos un enlace de confirmación a')} <strong>${this.escapeHtml(this.createdEmail)}</strong>. ${this._t('Ábrelo para activar tu cuenta y crear tu organización.')}</p>
        <p class="ssup-hint">${this._t('¿No te llega? Revisa spam o promociones.')}</p>
        <button type="button" class="ssup-btn ssup-btn-primary" id="ssupResend">${this._t('Reenviar correo')}</button>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
      </div>
    `;
  }

  // ─── Init / navegación ───────────────────────────────────────────────

  async init() {
    this.supabase = window.supabase
      || (window.supabaseService && (await window.supabaseService.getClient()));
    if (!this.supabase) {
      this._setStatus(this._t('No se pudo cargar Supabase. Recarga la página.'), 'error');
      return;
    }
    // No redirigimos aunque haya sesión: es una página de registro. El banner
    // (pintado vía onEnter) ofrece cerrar sesión.
    this.wire();
    const logout = this.querySelector('#ssupLogout');
    if (logout) this.addEventListener(logout, 'click', () => this._handleLogout());
  }

  async _handleLogout() {
    try { await this.supabase.auth.signOut(); } catch (_) {}
    this._hasSession = false;
    this._sessionEmail = '';
    const banner = this.querySelector('#ssupBanner');
    if (banner) banner.remove();
  }

  wire() {
    const cuentaForm = this.querySelector('#ssupCuentaForm');
    if (cuentaForm) this.addEventListener(cuentaForm, 'submit', (e) => { e.preventDefault(); this._captureCuenta(); if (this._validateCuenta()) this._goto('organizacion'); });

    const orgForm = this.querySelector('#ssupOrgForm');
    if (orgForm) this.addEventListener(orgForm, 'submit', (e) => { e.preventDefault(); this._captureOrg(); if (this._validateOrg()) this._goto('revisar'); });

    const back = this.querySelector('[data-action="back"]');
    if (back) this.addEventListener(back, 'click', () => {
      if (this.step === 'organizacion') { this._captureOrg(); this._goto('cuenta'); }
      else if (this.step === 'revisar') this._goto('organizacion');
    });

    const create = this.querySelector('[data-action="create"]');
    if (create) this.addEventListener(create, 'click', () => this._handleCreate());

    const resend = this.querySelector('#ssupResend');
    if (resend) this.addEventListener(resend, 'click', () => this._handleResend());
  }

  _goto(step) {
    this.step = step;
    const body = this.querySelector('#ssupBody');
    if (body) { body.innerHTML = this.renderStep(); this.wire(); }
    const sh = this.querySelector('.ssup-shell');
    sh?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  _captureCuenta() {
    this.form.full_name = (this.querySelector('#ssupName')?.value || '').trim();
    this.form.email = (this.querySelector('#ssupEmail')?.value || '').toLowerCase().trim();
    this.form.password = this.querySelector('#ssupPass')?.value || '';
    this.form.password2 = this.querySelector('#ssupPass2')?.value || '';
  }

  _captureOrg() {
    this.form.org_name = (this.querySelector('#ssupOrgName')?.value || '').trim();
    this.form.slogan = (this.querySelector('#ssupSlogan')?.value || '').trim();
    this.form.logo_url = (this.querySelector('#ssupLogo')?.value || '').trim();
    this.form.idiomas = (this.querySelector('#ssupIdiomas')?.value || '').trim();
    this.form.mercados = (this.querySelector('#ssupMercados')?.value || '').trim();
    const aut = this.querySelector('input[name="level_of_autonomy"]:checked');
    if (aut) this.form.level_of_autonomy = aut.value;
  }

  _validateCuenta() {
    const f = this.form;
    if (!f.full_name) return this._setStatus(this._t('Falta tu nombre.'), 'error'), false;
    if (!f.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return this._setStatus(this._t('Correo inválido.'), 'error'), false;
    if (f.password.length < 8) return this._setStatus(this._t('La contraseña debe tener al menos 8 caracteres.'), 'error'), false;
    if (f.password !== f.password2) return this._setStatus(this._t('Las contraseñas no coinciden.'), 'error'), false;
    return true;
  }

  _validateOrg() {
    if (!this.form.org_name) return this._setStatus(this._t('Ponle un nombre a tu marca.'), 'error'), false;
    return true;
  }

  _splitList(s) {
    return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
  }

  async _handleCreate() {
    if (this._submitting) return;
    this._submitting = true;
    this._setSubmitting(true);
    this._setStatus(this._t('Creando tu cuenta y enviando el correo…'), '');

    // Si había una sesión activa, cerrarla antes de registrar para no mezclar
    // estados (el signUp dejaría una sesión nueva por encima de la vieja).
    if (this._hasSession) {
      try { await this.supabase.auth.signOut(); } catch (_) {}
      this._hasSession = false;
      const banner = this.querySelector('#ssupBanner');
      if (banner) banner.remove();
    }

    const f = this.form;
    const cont = (window.SECRET_SIGNUP && window.SECRET_SIGNUP.continue) || '/registro/continuar';
    const emailRedirectTo = `${window.location.origin}${cont}`;

    const pending_org = {
      name: f.org_name,
      slogan: f.slogan || null,
      brand_name_oficial: f.org_name,
      logo_url: f.logo_url || null,
      level_of_autonomy: f.level_of_autonomy,
      idiomas_contenido: this._splitList(f.idiomas).length ? this._splitList(f.idiomas) : ['es'],
      mercado_objetivo: this._splitList(f.mercados),
    };

    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: f.email,
        password: f.password,
        options: {
          emailRedirectTo,
          data: { full_name: f.full_name, pending_org },
        },
      });
      if (error) throw error;

      this.createdEmail = f.email;

      // Con confirmación de email activada, signUp NO devuelve sesión: el usuario
      // debe abrir el enlace del correo. Mostramos la pantalla de verificación.
      if (data && data.session) {
        // Confirmación deshabilitada en el proyecto: ir directo a continuar.
        if (window.router) window.router.navigate(cont, true);
        return;
      }
      this._submitting = false;
      this._goto('verify');
    } catch (err) {
      this._submitting = false;
      this._setSubmitting(false);
      const msg = (err && err.message) ? err.message : String(err);
      this._setStatus(msg, 'error');
    }
  }

  async _handleResend() {
    if (Date.now() < this._resendCooldownUntil) return;
    const email = this.createdEmail;
    if (!email) return;
    const cont = (window.SECRET_SIGNUP && window.SECRET_SIGNUP.continue) || '/registro/continuar';
    try {
      const { error } = await this.supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}${cont}` },
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
