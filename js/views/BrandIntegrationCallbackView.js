/**
 * BrandIntegrationCallbackView — a dónde vuelve la persona tras autorizar una
 * plataforma. Desde el corte (ADR-0052) el borde ya hizo el intercambio: aquí
 * solo se cuenta el resultado (`?plataforma=&conectado=1&cuenta=` o `&error=`)
 * y se vuelve a la ficha de marca.
 */
class BrandIntegrationCallbackView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.supabase = null;
    this._processing = false;
  }

  renderHTML() {
    return `
      <div class="page-content">
        <div id="bic-container" class="bic-wrap">
          <div class="bic-spinner">
            <i class="aisc-ico fa-spin aisc-ico--refresh"></i>
            <p>${window.__('Conectando integración…')}</p>
          </div>
        </div>
      </div>`;
  }

  /**
   * Corte ADR-0052 (backend 479fc1b): el intercambio del código lo hace el BORDE en
   * GET /v1/integraciones/:plataforma/callback (cambia el código, resuelve la
   * identidad, escribe integrations.connections, guarda tokens en la bóveda) y
   * vuelve aquí con `?plataforma=<x>&conectado=1&cuenta=<nombre>` o
   * `?plataforma=<x>&error=<texto>`. Esta vista solo lo cuenta y devuelve a la
   * persona a la ficha de marca (o al `return_to` que guardó al conectar).
   * La elección de página de Meta ya no ocurre aquí: la resuelve el borde.
   */
  async onEnter() {
    if (this._processing) return;
    this._processing = true;
    try {
      const params = new URLSearchParams(window.location.search || '');
      const plataforma = String(params.get('plataforma') || params.get('platform') || '').toLowerCase();
      const error = params.get('error');
      const conectado = params.get('conectado') === '1';
      const cuenta = params.get('cuenta') || '';
      if (window.history?.replaceState) window.history.replaceState({}, '', window.location.pathname);
      const returnTo = sessionStorage.getItem('_obic_return') || '/brands';
      // Visita directa (sin nada del borde): no es un fallo, solo no hay nada que contar.
      // El mismo aviso de siempre, sin console.error.
      if (!plataforma && !error && !conectado) {
        this._showError(window.__('La plataforma no devolvió una conexión. Vuelve a intentarlo desde la ficha de marca.'));
        return;
      }
      if (error) throw new Error(error);
      if (!conectado) throw new Error(window.__('La plataforma no devolvió una conexión. Vuelve a intentarlo desde la ficha de marca.'));
      // Un contexto viejo (mi_contexto) taparía la conexión nueva en la ficha.
      if (window.contextoService?.cargar) window.contextoService.cargar({ fresco: true }).catch(() => {});
      this._showSuccess(plataforma, returnTo, cuenta);
    } catch (e) {
      console.error('[BrandIntegrationCallback]', e);
      this._showError(e?.message || String(e));
    }
  }

  _safeInternalPath(path) {
    const s = typeof path === 'string' ? path.trim() : '';
    if (!s || s.length > 200) return '/brands';
    if (!/^\/[A-Za-z0-9_\-/.]*$/.test(s)) return '/brands';
    if (s.includes('//') || s.startsWith('/\\')) return '/brands';
    return s;
  }

  _redirect(to) {
    const safe = this._safeInternalPath(to);
    if (window.router) window.router.navigate(safe, true);
    else window.location.href = safe;
  }

  _showSuccess(platform, returnTo, cuenta = '') {
    const safe = this._safeInternalPath(returnTo);
    const wrap = document.getElementById('bic-container');
    if (!wrap) { this._redirect(safe); return; }
    const label = platform === 'google' ? 'Google'
      : platform === 'shopify' ? 'Shopify'
      : platform === 'mercadolibre' ? 'Mercado Libre'
      : platform === 'x' ? 'X'
      : platform === 'tiktok' ? 'TikTok'
      : platform === 'linkedin' ? 'LinkedIn'
      : 'Meta';
    window.Estado.pintar(wrap, `
      <div class="bic-success">
        <div class="bic-success-check"><i class="aisc-ico aisc-ico--check"></i></div>
        <h2>${window.__('Integración conectada')}</h2>
        <p>${cuenta ? window.__('{label} se conectó a tu marca como «{cuenta}».', { label: this._esc(label), cuenta: this._esc(cuenta) }) : window.__('{label} se conectó correctamente a tu marca.', { label: this._esc(label) })}</p>
        <button type="button" class="bic-confirm-btn" data-bic-continue="1">
          <i class="aisc-ico aisc-ico--arrow-right"></i> ${window.__('Continuar')}
        </button>
      </div>`);
    wrap.querySelector('[data-bic-continue="1"]')?.addEventListener('click', () => {
      if (this._successTimer) clearTimeout(this._successTimer);
      this._redirect(safe);
    });
    // Auto-avanzar tras un momento para que el usuario vea la confirmacion.
    this._successTimer = setTimeout(() => this._redirect(safe), 2200);
  }

  _showError(msg) {
    const wrap = document.getElementById('bic-container') || document.getElementById('app-container');
    if (!wrap) return;
    window.Estado.pintar(wrap, `
      <div class="bic-error">
        <i class="aisc-ico aisc-ico--alert-warning"></i>
        <h2>${window.__('Error al conectar')}</h2>
        <p>${this._esc(msg)}</p>
        <button type="button" class="bic-confirm-btn" data-bic-back="1">
          <i class="aisc-ico aisc-ico--arrow-left"></i> ${window.__('Volver a Marcas')}
        </button>
      </div>`);
    wrap.querySelector('[data-bic-back="1"]')?.addEventListener('click', () => this._redirect('/brands'));
  }

  // Alias local: `_esc` existía antes; delegamos en `this.escapeHtml` (BaseView).
  _esc(text) { return this.escapeHtml(text); }
}

window.BrandIntegrationCallbackView = BrandIntegrationCallbackView;
if (typeof module !== 'undefined' && module.exports) module.exports = BrandIntegrationCallbackView;
