/**
 * CuentaView — la cuenta de la PERSONA (L5, 24/09), aparte de la configuración de
 * la marca: /org/:s/:slug/cuenta/{perfil|preferencias|seguridad}.
 *
 * - Perfil: quién eres para la consola (de mi_contexto().profile). Solo lectura: cambiar
 *   nombre o correo no tiene puerta de persona en la base; se dice con palabras.
 * - Preferencias: idioma y zona horaria por public.guardar_preferencias (ADR-0040).
 * - Seguridad: cambiar la contraseña con la sesión abierta. La verificación en dos
 *   pasos llega con ADR-0049 (L6): hasta entonces, «todavía no» dicho claro.
 */
class CuentaView extends BaseView {
  constructor() {
    super();
    this.perfil = null;
  }

  static SLUGS = ['perfil', 'preferencias', 'seguridad'];

  get pestana() {
    const t = String(this.routeParams?.tab || 'perfil').toLowerCase();
    return CuentaView.SLUGS.includes(t) ? t : 'perfil';
  }

  renderHTML() {
    const titulos = { perfil: __('Perfil'), preferencias: __('Preferencias'), seguridad: __('Seguridad') };
    return `
      <div class="ajustes-page">
        <header class="ajustes-cabecera">
          <p class="ajustes-eyebrow">${__('Tu cuenta')}</p>
          <h1 class="ajustes-titulo">${titulos[this.pestana]}</h1>
        </header>
        <div id="cuentaCuerpo" aria-busy="true"><div class="skeleton skeleton-text skeleton-text--lg"></div><div class="skeleton skeleton-text"></div></div>
      </div>`;
  }

  async render() {
    await super.render();
    window.PestanasDeAjustes?.montar(this, 'cuenta', this.pestana);
    this.updateHeaderContext(__('Tu cuenta'));
    try { this.perfil = window.ShellDatos ? await window.ShellDatos.perfil() : null; } catch (_) { this.perfil = null; }
    const u = window.authService?.getCurrentUser?.() || {};
    this.perfil = Object.assign({ email: u.email, full_name: u.full_name || u.user_metadata?.full_name }, this.perfil || {});
    this.pintar();
  }

  destroy() {
    window.PestanasDeAjustes?.desmontar(this);
    super.destroy();
  }

  pintar() {
    const el = this.querySelector('#cuentaCuerpo');
    if (!el) return;
    el.removeAttribute('aria-busy');
    const tab = this.pestana === 'preferencias' ? this._preferencias() : this.pestana === 'seguridad' ? this._seguridad() : this._perfil();
    window.Estado.pintar(el, tab.html);
    if (tab.enlazar) tab.enlazar(el);
  }

  _perfil() {
    const p = this.perfil || {};
    const nombre = p.full_name || '';
    const iniciales = (nombre || p.email || '·').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
    return { html: `
      <section class="ajustes-bloque">
        <div class="ajustes-persona">
          <span class="shell-avatar shell-avatar--grande" aria-hidden="true">${this.escapeHtml(iniciales)}</span>
          <dl class="ajustes-datos">
            <div><dt>${__('Nombre')}</dt><dd>${this.escapeHtml(nombre || '—')}</dd></div>
            <div><dt>${__('Correo')}</dt><dd>${this.escapeHtml(p.email || '—')}</dd></div>
          </dl>
        </div>
        <p class="ajustes-nota">${__('Para cambiar tu nombre o tu correo escríbenos a {correo}: los validamos contigo antes de tocarlos.', { correo: '<a class="ajustes-enlace" href="mailto:contact@aismartcontent.io">contact@aismartcontent.io</a>' })}</p>
      </section>` };
  }

  _preferencias() {
    const p = this.perfil || {};
    const idioma = window.i18n?.getLocale?.() || p.locale || 'es';
    const zona = p.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';
    let zonas;
    try { zonas = Intl.supportedValuesOf('timeZone'); } catch (_) { zonas = [zona]; }
    if (!zonas.includes(zona)) zonas.unshift(zona);
    const html = `
      <form class="ajustes-bloque ajustes-form" id="cuentaPreferencias" novalidate>
        <fieldset class="ajustes-campo">
          <legend>${__('Idioma de la consola')}</legend>
          <div class="shell-segmento" role="radiogroup">
            <label><input type="radio" name="idioma" value="es"${idioma === 'es' ? ' checked' : ''}> Español</label>
            <label><input type="radio" name="idioma" value="en"${idioma === 'en' ? ' checked' : ''}> English</label>
          </div>
        </fieldset>
        <label class="ajustes-campo">
          <span>${__('Tu zona horaria')}</span>
          <select name="zona" class="form-select">${zonas.map((z) => `<option value="${this.escapeHtml(z)}"${z === zona ? ' selected' : ''}>${this.escapeHtml(z.replace(/_/g, ' '))}</option>`).join('')}</select>
          <small>${__('Las fechas y horas de la consola se muestran en esta zona. La de la marca se cambia en Configuración.')}</small>
        </label>
        <p class="ajustes-error" role="alert" hidden></p>
        <div class="ajustes-acciones"><button type="submit" class="btn btn--blanco">${__('Guardar preferencias')}</button></div>
      </form>`;
    const enlazar = (el) => {
    const form = el.querySelector('form');
    this.addEventListener(form, 'submit', async (e) => {
      e.preventDefault();
      const error = form.querySelector('.ajustes-error');
      const boton = form.querySelector('button[type="submit"]');
      const locale = form.idioma.value;
      const timezone = form.zona.value;
      error.hidden = true;
      boton.disabled = true;
      try {
        await window.ShellDatos.guardarPreferencias({ locale, timezone });
        this.perfil = Object.assign({}, this.perfil, { locale, timezone });
        window.showToast?.(__('Preferencias guardadas.'), { type: 'success' });
        // Cambiar el idioma repinta la vista: se hace al final y sin volver a escribir.
        if (window.i18n?.setLocale && locale !== window.i18n.getLocale()) await window.i18n.setLocale(locale, { persist: false });
      } catch (err) {
        error.textContent = err?.code === '22023' ? (err.message || __('La base no aceptó ese valor.')) : __('No pudimos guardar tus preferencias. Intenta de nuevo.');
        error.hidden = false;
      } finally {
        boton.disabled = false;
      }
    });
    };
    return { html, enlazar };
  }

  _seguridad() {
    const html = `
      <form class="ajustes-bloque ajustes-form" id="cuentaContrasena" novalidate>
        <h2 class="ajustes-subtitulo">${__('Contraseña')}</h2>
        <label class="ajustes-campo"><span>${__('Nueva contraseña')}</span>
          <input type="password" name="nueva" class="form-input" autocomplete="new-password" minlength="8" required></label>
        <label class="ajustes-campo"><span>${__('Repítela')}</span>
          <input type="password" name="repetida" class="form-input" autocomplete="new-password" minlength="8" required></label>
        <p class="ajustes-error" role="alert" hidden></p>
        <div class="ajustes-acciones"><button type="submit" class="btn btn--blanco">${__('Cambiar contraseña')}</button></div>
      </form>
      <section class="ajustes-bloque">
        <h2 class="ajustes-subtitulo">${__('Verificación en dos pasos')}</h2>
        <p class="ajustes-nota">${__('Todavía no se activa desde tu cuenta: llega en los próximos días. Si tu marca la exige, te lo pediremos al entrar.')}</p>
      </section>`;
    const enlazar = (el) => {
    const form = el.querySelector('#cuentaContrasena');
    this.addEventListener(form, 'submit', async (e) => {
      e.preventDefault();
      const error = form.querySelector('.ajustes-error');
      const boton = form.querySelector('button[type="submit"]');
      const nueva = form.nueva.value;
      error.hidden = true;
      if (nueva.length < 8) { error.textContent = __('La contraseña debe tener al menos 8 caracteres.'); error.hidden = false; form.nueva.focus(); return; }
      if (nueva !== form.repetida.value) { error.textContent = __('Las contraseñas no coinciden.'); error.hidden = false; form.repetida.focus(); return; }
      boton.disabled = true;
      const r = await window.authService.cambiarContrasena(nueva);
      boton.disabled = false;
      if (!r.ok) { error.textContent = r.error || __('No pudimos cambiar la contraseña.'); error.hidden = false; return; }
      form.reset();
      window.showToast?.(__('Contraseña cambiada. La próxima vez entra con la nueva.'), { type: 'success' });
    });
    };
    return { html, enlazar };
  }
}
window.CuentaView = CuentaView;
