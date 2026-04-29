/**
 * SignInView - Acceso para usuarios existentes.
 * Patrón SPA: HTML inline, sin template.
 * Sin opción de registro — la plataforma es por invitación.
 * Tres estados intercambiables sobre la misma card:
 *   1. signin-main      → login (email + password)
 *   2. signin-recover   → recuperar contraseña
 *   3. signin-request   → solicitar acceso (lead → contact_leads)
 */
class SignInView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.form = null;
    this.signinMain = null;
    this.signinRecover = null;
    this.signinRequest = null;
  }

  async updateHeader() {
    // Sin header de usuario en páginas públicas
  }

  renderHTML() {
    const year = new Date().getFullYear();
    return `
      <div class="signin-container signin-container--hero">
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

            <p class="signin-invite">¿No tienes acceso? <button type="button" class="signin-invite-link" id="linkRequestAccess">Solicítalo aquí</button></p>
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

          <div class="signin-request" id="signinRequest" aria-hidden="true" hidden>
            <h2 class="signin-request-title">Solicitar acceso</h2>
            <p class="signin-request-desc">Revisamos cada solicitud manualmente y te contactamos en 48 horas hábiles.</p>

            <form class="signin-request-form" id="requestForm" novalidate>
              <div class="signin-field">
                <label class="signin-field-label" for="reqFullName">Nombre completo</label>
                <input type="text" class="form-input" id="reqFullName" name="full_name" autocomplete="name" required>
              </div>
              <div class="signin-field">
                <label class="signin-field-label" for="reqEmail">Correo corporativo</label>
                <input type="email" class="form-input" id="reqEmail" name="email" autocomplete="email" required>
              </div>
              <div class="signin-field">
                <label class="signin-field-label" for="reqCompany">Empresa / marca</label>
                <input type="text" class="form-input" id="reqCompany" name="company" autocomplete="organization" required>
              </div>
              <div class="signin-field">
                <label class="signin-field-label" for="reqRole">Cargo / rol</label>
                <input type="text" class="form-input" id="reqRole" name="role" autocomplete="organization-title">
              </div>
              <div class="signin-field">
                <label class="signin-field-label" for="reqMarket">País / mercado principal</label>
                <input type="text" class="form-input" id="reqMarket" name="market">
              </div>
              <div class="signin-field">
                <label class="signin-field-label" for="reqChallenge">Reto principal en producción de contenido</label>
                <textarea class="form-input signin-request-textarea" id="reqChallenge" name="challenge" rows="3"></textarea>
              </div>
              <div class="signin-field">
                <label class="signin-field-label" for="reqSource">¿Cómo nos encontraste?</label>
                <select class="form-input" id="reqSource" name="source">
                  <option value="">Selecciona</option>
                  <option value="referral">Referido</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="search">Búsqueda</option>
                  <option value="event">Evento</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <button type="submit" class="btn btn-primary signin-submit" id="btnSendRequest">Enviar solicitud</button>
              <p class="signin-request-status" id="requestStatus" role="status" aria-live="polite"></p>
            </form>

            <div class="signin-request-success" id="requestSuccess" hidden>
              <p class="signin-request-success-text">Solicitud recibida. Te contactaremos en 48 horas hábiles.</p>
            </div>

            <button type="button" class="signin-recover-back signin-recover-back-btn" id="linkRequestBack">Volver al inicio de sesión</button>
          </div>
        </div>

        <footer class="signin-footer">
          <span class="signin-footer-copy">${year} AI SMART CONTENT by ARDE AGENCY S.A.S. Todos los derechos reservados.</span>
          <span class="signin-footer-links">
            <a href="/privacidad" data-href="/privacidad">Privacidad</a>
            <span aria-hidden="true">·</span>
            <a href="/terminos" data-href="/terminos">Términos</a>
          </span>
        </footer>
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
    this.signinRequest = this.querySelector('#signinRequest');
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

    // Solicitar acceso → estado request
    const linkRequest = this.querySelector('#linkRequestAccess');
    const requestForm = this.querySelector('#requestForm');
    const linkRequestBack = this.querySelector('#linkRequestBack');
    if (linkRequest) {
      this.addEventListener(linkRequest, 'click', (e) => {
        e.preventDefault();
        this.showRequestState();
      });
    }
    if (requestForm) {
      this.addEventListener(requestForm, 'submit', (e) => {
        e.preventDefault();
        this.handleSendRequest();
      });
    }
    if (linkRequestBack) {
      this.addEventListener(linkRequestBack, 'click', (e) => {
        e.preventDefault();
        this.hideRequestState();
      });
    }

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

  showRequestState() {
    if (this.signinMain) this.signinMain.style.display = 'none';
    if (this.signinRecover) {
      this.signinRecover.setAttribute('hidden', '');
      this.signinRecover.setAttribute('aria-hidden', 'true');
    }
    if (this.signinRequest) {
      this.signinRequest.removeAttribute('hidden');
      this.signinRequest.setAttribute('aria-hidden', 'false');
    }
    const form = this.querySelector('#requestForm');
    const success = this.querySelector('#requestSuccess');
    const status = this.querySelector('#requestStatus');
    if (form) form.hidden = false;
    if (success) success.hidden = true;
    if (status) {
      status.textContent = '';
      status.classList.remove('is-success', 'is-error');
    }
    const first = this.querySelector('#reqFullName');
    if (first) first.focus();
  }

  hideRequestState() {
    if (this.signinMain) this.signinMain.style.display = '';
    if (this.signinRequest) {
      this.signinRequest.setAttribute('hidden', '');
      this.signinRequest.setAttribute('aria-hidden', 'true');
    }
  }

  async handleSendRequest() {
    const form = this.querySelector('#requestForm');
    const status = this.querySelector('#requestStatus');
    const submitBtn = this.querySelector('#btnSendRequest');
    if (!form || !status) return;

    if (!form.checkValidity()) {
      status.textContent = 'Por favor completa los campos requeridos.';
      status.classList.remove('is-success');
      status.classList.add('is-error');
      form.reportValidity();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }
    status.textContent = '';
    status.classList.remove('is-success', 'is-error');

    try {
      const supabase = await this.getSupabaseClient();
      if (!supabase) throw new Error('No se pudo conectar con la base de datos.');

      const formData = new FormData(form);
      const sourceMap = {
        referral: 'referido',
        linkedin: 'linkedin',
        search: 'busqueda',
        event: 'evento',
        other: 'otro'
      };
      const utm = new URLSearchParams(window.location.search || '');

      const payload = {
        full_name: (formData.get('full_name') || '').toString().trim(),
        email: (formData.get('email') || '').toString().trim().toLowerCase(),
        company_name: (formData.get('company') || '').toString().trim(),
        job_title: (formData.get('role') || '').toString().trim() || null,
        country: (formData.get('market') || '').toString().trim() || null,
        main_challenge: (formData.get('challenge') || '').toString().trim() || null,
        how_found: sourceMap[(formData.get('source') || '').toString()] || null,
        source: 'contact_form',
        utm_source: (utm.get('utm_source') || '').trim() || null,
        utm_campaign: (utm.get('utm_campaign') || '').trim() || null,
        metadata: {
          form_path: window.location.pathname,
          form_url: window.location.href,
          submitted_from: 'login_request_state'
        }
      };

      const { error } = await supabase.from('contact_leads').insert(payload);
      if (error) throw error;

      form.hidden = true;
      const success = this.querySelector('#requestSuccess');
      if (success) success.hidden = false;
      form.reset();
    } catch (err) {
      status.textContent = `No pudimos enviar tu solicitud. ${err?.message || 'Intenta de nuevo.'}`;
      status.classList.remove('is-success');
      status.classList.add('is-error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar solicitud';
      }
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
