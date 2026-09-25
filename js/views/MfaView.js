/**
 * MfaView — /mfa (ADR-0049, L6 24/09): verificación en dos pasos cuando la marca la
 * exige. Llega aquí la persona cuya marca dice `acceso=false && mfa_required &&
 * !mfa_cumplida` (el router la trae) o a quien el login le pide activarla.
 *
 * - Con un factor TOTP verificado: pide el código (desafío) y sube la sesión a aal2.
 * - Sin factor: enrola uno (QR + clave manual) y lo verifica con el primer código.
 * Al terminar vuelve a `?next=` (solo ruta interna) o a su marca. Misma tarjeta que el login.
 */
class MfaView extends BaseView {
  constructor() {
    super();
    this._factor = null;
    this._next = null;
  }

  async updateHeader() { /* página de acceso: sin shell */ }

  renderHTML() {
    return `
      <div class="signin-container signin-container--simple">
        <div class="signin-card">
          <div class="signin-brand">
            <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="signin-brand-logo" width="180" height="72" decoding="async">
          </div>
          <div id="mfaCuerpo" aria-live="polite"><p class="signin-recover-desc">${__('Preparando la verificación…')}</p></div>
          <button type="button" class="signin-recover-back signin-recover-back-btn" id="mfaSalir">${__('Salir')}</button>
        </div>
      </div>`;
  }

  async onEnter() {
    const next = new URLSearchParams(window.location.search).get('next');
    this._next = next && window.rutaInterna?.(next) && !next.startsWith('/mfa') ? next : null;
  }

  async init() {
    this.addEventListener(this.querySelector('#mfaSalir'), 'click', async () => {
      await window.authService?.logout?.();
      window.router?.navigate('/login', true);
    });
    let estado = null;
    try { estado = await window.authService.mfaEstado(); } catch (e) { console.warn('[mfa] estado:', e?.message || e); }
    if (!estado) { this._decir(__('No pudimos preparar la verificación. Recarga la página.')); return; }
    if (estado.nivel === 'aal2') { await this._terminar(); return; }
    if (estado.factores.length) { this._factor = estado.factores[0]; this._desafio(); return; }
    await this._enrolar();
  }

  _cuerpo() { return this.querySelector('#mfaCuerpo'); }

  _decir(texto) {
    const el = this._cuerpo();
    if (!el) return;
    const p = document.createElement('p');
    p.className = 'signin-recover-desc';
    p.textContent = texto;
    el.replaceChildren(p);
  }

  _formCodigo(titulo, texto, extra = '') {
    const el = this._cuerpo();
    window.Estado.pintar(el, `
      <h1 class="signin-recover-title">${this.escapeHtml(titulo)}</h1>
      <p class="signin-recover-desc">${this.escapeHtml(texto)}</p>
      ${extra}
      <form id="mfaForm" novalidate>
        <label class="signin-field-label" for="mfaCodigo">${__('Código de 6 dígitos')}</label>
        <input type="text" class="form-input signin-mfa-code" id="mfaCodigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
        <p class="signin-mfa-error" id="mfaError" role="alert" hidden></p>
        <button type="submit" class="btn btn--blanco signin-submit" id="mfaVerificar">${__('Verificar')}</button>
      </form>`);
    const form = el.querySelector('#mfaForm');
    this.addEventListener(form, 'submit', (e) => { e.preventDefault(); this._verificar(form); });
    form.querySelector('#mfaCodigo').focus();
    return el;
  }

  _desafio() {
    this._formCodigo(__('Verificación en dos pasos'), __('Tu marca la exige. Abre tu app autenticadora ({app}) y escribe el código.', { app: this._factor.nombre }));
  }

  async _enrolar() {
    let e;
    try { e = await window.authService.mfaEnrolar(); } catch (err) {
      console.warn('[mfa] enrolar:', err?.message || err);
      this._decir(__('No pudimos empezar la activación. Recarga la página o escríbenos a contact@aismartcontent.io.'));
      return;
    }
    this._factor = { id: e.factorId, nombre: 'AI Smart Content' };
    const el = this._formCodigo(
      __('Activa la verificación en dos pasos'),
      __('Tu marca la exige. Escanea el código con Google Authenticator, 1Password o similar y escribe el código que te muestre.'),
      `<figure class="mfa-qr" id="mfaQr"><figcaption>${__('¿No puedes escanear? Escribe esta clave:')} <code id="mfaClave"></code></figcaption></figure>`,
    );
    // El QR (data:image/svg+xml) y la clave entran por DOM, no por HTML.
    if (/^data:image\/svg\+xml/.test(e.qr)) {
      const img = document.createElement('img');
      img.src = e.qr; img.width = 180; img.height = 180;
      img.alt = __('Código QR para tu app autenticadora');
      el.querySelector('#mfaQr').prepend(img);
    }
    el.querySelector('#mfaClave').textContent = e.secreto;
  }

  async _verificar(form) {
    const codigo = form.querySelector('#mfaCodigo').value.trim();
    const error = form.querySelector('#mfaError');
    const boton = form.querySelector('#mfaVerificar');
    error.hidden = true;
    if (!/^[0-9]{6}$/.test(codigo)) { error.textContent = __('El código debe ser de 6 dígitos.'); error.hidden = false; return; }
    boton.disabled = true;
    const r = await window.authService.verifyMfa(this._factor.id, codigo);
    boton.disabled = false;
    if (!r.success) { error.textContent = __('Ese código no funcionó. Espera al siguiente y vuelve a intentarlo.'); error.hidden = false; return; }
    await this._terminar(r.redirectRoute);
  }

  async _terminar(ruta) {
    window.contextoService?.limpiar?.();
    window.router?.navigate(this._next || ruta || '/home', true);
  }
}
window.MfaView = MfaView;
