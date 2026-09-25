/**
 * InvitacionView — /invitacion/:token: la única puerta de entrada al SaaS cerrado
 * (ADR-0048; contrato BD 6d1c421 y backend 5953f12, 24/09). Misma tarjeta que el login.
 *
 * - Con sesión: aceptar_invitacion(token) → la marca que devuelve.
 * - Sin sesión: nombre + contraseña → POST /v1/invitaciones/alta → entrar con el correo
 *   que devuelve y esa misma contraseña → aceptar_invitacion → la marca.
 *   409 ya_tiene_cuenta → /login?next=/invitacion/<token> (al volver con sesión, aceptar).
 * - Nada de signUp desde el cliente. El token sale de la URL en cuanto se lee
 *   (replaceState) y nunca va a logs.
 */
class InvitacionView extends BaseView {
  constructor() {
    super();
    this._token = null;
  }

  async updateHeader() { /* página de acceso: sin shell */ }

  renderHTML() {
    return `
      <div class="signin-container signin-container--simple">
        <div class="signin-card">
          <div class="signin-brand">
            <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="signin-brand-logo" width="180" height="72" decoding="async">
          </div>
          <div id="invitacionCuerpo" aria-live="polite">
            <p class="signin-recover-desc">${__('Revisando tu invitación…')}</p>
          </div>
        </div>
      </div>`;
  }

  async onEnter() {
    this._token = String(this.routeParams?.token || '').toLowerCase();
    // El token no se queda en la barra de direcciones ni en el historial.
    try { window.history.replaceState(null, '', '/invitacion'); } catch (_) { /* nada */ }
  }

  async init() {
    if (!window.InvitacionesDatos?.tokenValido(this._token)) {
      this._final(__('Este enlace de invitación no es válido'), __('Revisa que lo hayas copiado completo o pide uno nuevo a quien te invitó.'));
      return;
    }
    const conSesion = await window.authService?.isAuthenticated?.().catch(() => false);
    if (conSesion) await this._aceptar();
    else this._formulario();
  }

  _cuerpo() { return this.querySelector('#invitacionCuerpo'); }

  /** Único punto de pintado HTML de la tarjeta. */
  _pintar(html) {
    const el = this._cuerpo();
    if (el) window.Estado.pintar(el, html);
    return el;
  }

  _final(titulo, texto, accion) {
    const el = this._pintar(`
      <h1 class="signin-recover-title">${this.escapeHtml(titulo)}</h1>
      <p class="signin-recover-desc">${this.escapeHtml(texto)}</p>
      ${accion ? `<button type="button" class="btn btn--blanco signin-submit" id="invitacionAccion">${this.escapeHtml(accion.texto)}</button>` : ''}`);
    if (el && accion) this.addEventListener(el.querySelector('#invitacionAccion'), 'click', accion.hacer);
  }

  _todaviaNo() {
    this._final(__('Las invitaciones se activan en unos días'), __('Guarda este correo: el enlace seguirá sirviendo cuando abramos las altas. Si tienes prisa, escríbenos a contact@aismartcontent.io.'));
  }

  async _aceptar() {
    const el = this._cuerpo();
    if (el) {
      const p = document.createElement('p');
      p.className = 'signin-recover-desc';
      p.textContent = __('Entrando a tu marca…');
      el.replaceChildren(p);
    }
    try {
      const r = await window.InvitacionesDatos.aceptar(this._token);
      window.contextoService?.limpiar?.();
      const destino = r?.short && r?.slug ? `/org/${r.short}/${r.slug}/dashboard` : '/home';
      window.showToast?.(r?.ya_era_miembro ? __('Ya eras parte de {m}.', { m: r.name || '' }) : __('Te damos la bienvenida a {m}.', { m: r?.name || '' }), { type: 'success' });
      window.router?.navigate(destino, true);
    } catch (e) {
      const c = String(e?.code || '');
      if (window.InvitacionesDatos.todaviaNo(e)) { this._todaviaNo(); return; }
      if (c === '42501') {
        this._final(__('Esta invitación es para otro correo'), __('Entraste con una cuenta distinta a la invitada. Sal y entra con el correo al que llegó la invitación.'), {
          texto: __('Salir y entrar con el otro correo'),
          hacer: async () => { await window.authService?.logout?.(); window.router?.navigate(`/login?next=${encodeURIComponent('/invitacion/' + this._token)}`, true); },
        });
        return;
      }
      if (c === '23505') {
        this._final(__('Esta invitación ya se usó'), __('Si ya eres parte de la marca, entra desde el inicio.'), { texto: __('Ir al inicio'), hacer: () => window.router?.navigate('/home', true) });
        return;
      }
      console.warn('[invitacion] aceptar:', c || e?.message);
      this._final(__('Esta invitación ya no sirve'), __('Pide una nueva a quien te invitó.'));
    }
  }

  _formulario() {
    const el = this._pintar(`
      <h1 class="signin-recover-title">${__('Te invitaron a AI Smart Content')}</h1>
      <p class="signin-recover-desc">${__('Crea tu acceso para entrar a la marca que te invitó.')}</p>
      <form id="invitacionForm" novalidate>
        <div class="signin-field">
          <label class="signin-field-label" for="invNombre">${__('Tu nombre')}</label>
          <input type="text" class="form-input" id="invNombre" name="nombre" autocomplete="name" maxlength="120" required>
        </div>
        <div class="signin-field">
          <label class="signin-field-label" for="invClave">${__('Contraseña')}</label>
          <input type="password" class="form-input" id="invClave" name="clave" autocomplete="new-password" minlength="12" maxlength="72" required aria-describedby="invClaveAyuda">
          <small class="signin-field-hint" id="invClaveAyuda">${__('Entre 12 y 72 caracteres, con al menos una letra y un número.')}</small>
        </div>
        <p class="signin-mfa-error" id="invError" role="alert" hidden></p>
        <button type="submit" class="btn btn--blanco signin-submit" id="invEnviar">${__('Crear acceso y entrar')}</button>
        <button type="button" class="signin-recover-back signin-recover-back-btn" id="invYaTengo">${__('Ya tengo cuenta')}</button>
      </form>`);
    if (!el) return;
    const form = el.querySelector('#invitacionForm');
    this.addEventListener(form, 'submit', (e) => { e.preventDefault(); this._alta(form); });
    this.addEventListener(el.querySelector('#invYaTengo'), 'click', () => window.router?.navigate(`/login?next=${encodeURIComponent('/invitacion/' + this._token)}`, true));
    form.nombre.focus();
  }

  async _alta(form) {
    const error = form.querySelector('#invError');
    const boton = form.querySelector('#invEnviar');
    const decir = (m, campo) => { error.textContent = m; error.hidden = !m; if (campo) campo.focus(); };
    const nombre = form.nombre.value.trim();
    const clave = form.clave.value;
    decir('');
    if (!nombre) { decir(__('Escribe tu nombre.'), form.nombre); return; }
    const motivo = window.InvitacionesDatos.motivoContrasena(clave);
    if (motivo) { decir(__('La contraseña necesita entre 12 y 72 caracteres, con al menos una letra y un número.'), form.clave); return; }

    boton.disabled = true;
    boton.textContent = __('Creando tu acceso…');
    try {
      const r = await window.InvitacionesDatos.alta(this._token, clave, nombre);
      const entrar = await window.authService.login(r.email, clave, {});
      if (!entrar?.success && !entrar?.requiresMfa) {
        // El acceso existe: que entre por el login (con el correo ya puesto) y vuelva aquí.
        window.router?.navigate(`/login?next=${encodeURIComponent('/invitacion/' + this._token)}`, true);
        return;
      }
      await this._aceptar();
    } catch (e) {
      const c = String(e?.codigo || e?.code || '');
      boton.disabled = false;
      boton.textContent = __('Crear acceso y entrar');
      if (c === 'ya_tiene_cuenta') { window.router?.navigate(`/login?next=${encodeURIComponent('/invitacion/' + this._token)}`, true); return; }
      if (c === 'invitacion_no_valida') { this._final(__('Esta invitación ya no sirve'), __('Pide una nueva a quien te invitó.')); return; }
      if (c === 'contrasena_debil') { decir(__('Esa contraseña es muy fácil de adivinar. Prueba con otra.'), form.clave); return; }
      if (c === 'entrada_invalida') { decir(__('Revisa tu nombre y la contraseña.'), form.nombre); return; }
      if (c === 'demasiadas_peticiones') { decir(__('Demasiados intentos. Prueba de nuevo en {n} segundos.', { n: e?.retryAfter || 60 })); return; }
      if (window.InvitacionesDatos.todaviaNo(e)) { this._todaviaNo(); return; }
      console.warn('[invitacion] alta:', c || e?.message);
      decir(__('No pudimos crear tu acceso. Intenta de nuevo en un momento.'));
    }
  }
}
window.InvitacionView = InvitacionView;
