/**
 * BrandIntegrationCallbackView
 * Maneja el callback OAuth de Facebook/Google.
 *
 * Flujo Facebook:
 *  1. Exchange code → token (backend guarda todas las páginas en metadata)
 *  2. Si hay 1 página  → auto-selecciona y redirige
 *  3. Si hay >1 página → muestra selector, usuario elige 1, guarda y redirige
 *  4. Si hay 0 páginas → muestra error con instrucciones
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
            <i class="fas fa-sync-alt fa-spin"></i>
            <p>Conectando integración…</p>
          </div>
        </div>
      </div>`;
  }

  async onEnter() {
    // Protección contra doble llamada dentro de la misma instancia
    if (this._processing) return;
    this._processing = true;

    try {
      this.supabase = window.supabaseService
        ? await window.supabaseService.getClient()
        : window.supabase;
      if (!this.supabase) throw new Error('Supabase no disponible.');

      const params = new URLSearchParams(window.location.search || '');
      const oauthError = params.get('error');
      const code  = params.get('code');
      const state = params.get('state');

      if (oauthError) throw new Error(oauthError);
      if (!code || !state) throw new Error('Faltan parámetros OAuth (code/state).');

      // Shopify firma el redirect con HMAC sobre el query string ordenado.
      // Capturamos los params del callback para que el backend los verifique.
      const callbackParams = {};
      for (const [k, v] of params.entries()) callbackParams[k] = v;

      // Protección contra doble envío del mismo código (Facebook solo permite 1 uso)
      const codeKey = `_obic_${code.slice(-12)}`;
      if (sessionStorage.getItem(codeKey)) {
        this._redirect(sessionStorage.getItem('_obic_return') || '/brands');
        return;
      }
      sessionStorage.setItem(codeKey, '1');

      // Limpiar URL para que un re-render del router no reintente el exchange
      if (window.history?.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      const { data: sd } = await this.supabase.auth.getSession();
      const token = sd?.session?.access_token;
      if (!token) throw new Error('Sesión no válida. Inicia sesión y vuelve a intentarlo.');

      // Intercambiar el código por tokens (backend también captura /me/accounts)
      // callback_params + shop + hmac: necesarios para verificar HMAC de Shopify
      // (los Meta/Google ignoran estos campos extra)
      const res = await fetch(`${location.origin}/api/integrations/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code,
          state,
          shop:            callbackParams.shop || undefined,
          hmac:            callbackParams.hmac || undefined,
          callback_params: callbackParams
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);

      const returnTo = json.return_to || '/brands';
      sessionStorage.setItem('_obic_return', returnTo);

      // Solo Facebook necesita selección de página
      if (json.platform !== 'facebook') {
        this._showSuccess(json.platform, returnTo);
        return;
      }

      const pages   = Array.isArray(json.pages) ? json.pages : [];
      const integId = json.integ_id || null;

      // Sin páginas: mostrar error con instrucciones
      if (pages.length === 0) {
        this._showNoPages(returnTo);
        return;
      }

      // 1 sola página: auto-seleccionar sin molestar al usuario
      if (pages.length === 1) {
        await this._savePage(integId, pages[0]);
        this._showSuccess('facebook', returnTo);
        return;
      }

      // Múltiples páginas: el usuario elige cuál conectar a esta marca
      this._showPicker({ pages, integId, returnTo });

    } catch (e) {
      console.error('[BrandIntegrationCallback]', e);
      this._showError(e?.message || String(e));
    }
  }

  // ── Guardar página seleccionada ───────────────────────────────────────────

  async _savePage(integId, page) {
    if (!integId) return;
    const pic = typeof page.picture === 'string'
      ? page.picture
      : (page.picture?.data?.url || null);

    const { data: rows } = await this.supabase
      .from('brand_integrations').select('metadata').eq('id', integId).limit(1);
    const meta = rows?.[0]?.metadata || {};

    await this.supabase
      .from('brand_integrations')
      .update({
        metadata: {
          ...meta,
          selected_page_id:      page.id,
          selected_page_name:    page.name || null,
          selected_page_picture: pic
        }
      })
      .eq('id', integId);
  }

  // ── Pantalla: selección de página ─────────────────────────────────────────

  _showPicker({ pages, integId, returnTo }) {
    const wrap = document.getElementById('bic-container');
    if (!wrap) return;

    wrap.innerHTML = `
      <div class="bic-page-picker">
        <div class="bic-page-picker-head">
          <i class="fab fa-facebook bic-fb-icon"></i>
          <h2>¿Qué página quieres conectar?</h2>
          <p>Tu cuenta tiene acceso a <strong>${pages.length} páginas</strong>. Elige la que corresponde a esta marca.</p>
        </div>
        <ul class="bic-page-list" id="bicPageList">
          ${pages.map((pg) => {
            const pic  = typeof pg.picture === 'string' ? pg.picture : (pg.picture?.data?.url || null);
            const hasIg = !!pg.instagram_business_account?.id;
            return `
              <li class="bic-page-item" data-id="${this._esc(pg.id)}">
                <label class="bic-page-label">
                  <input type="radio" name="bic_page" value="${this._esc(pg.id)}" class="bic-page-radio">
                  <div class="bic-page-info">
                    ${pic
                      ? `<img src="${this._esc(pic)}" class="bic-page-avatar" alt="" loading="lazy" decoding="async">`
                      : `<div class="bic-page-avatar bic-page-avatar--placeholder"><i class="fab fa-facebook"></i></div>`}
                    <div class="bic-page-text">
                      <strong>${this._esc(pg.name)}</strong>
                      ${hasIg ? `<span class="bic-page-ig"><i class="fab fa-instagram"></i> Instagram Business vinculado</span>` : ''}
                    </div>
                  </div>
                </label>
              </li>`;
          }).join('')}
        </ul>
        <div class="bic-page-actions">
          <button id="bicConfirmBtn" class="bic-confirm-btn" disabled>
            <i class="fas fa-check"></i> Conectar esta página
          </button>
        </div>
        <p class="bic-page-note">Solo se conectará la página elegida. El resto quedará excluido.</p>
      </div>`;

    const list = document.getElementById('bicPageList');
    const btn  = document.getElementById('bicConfirmBtn');

    list?.addEventListener('change', (e) => {
      if (e.target?.name !== 'bic_page') return;
      list.querySelectorAll('.bic-page-item').forEach((li) => li.classList.remove('is-selected'));
      e.target.closest('.bic-page-item')?.classList.add('is-selected');
      if (btn) btn.disabled = false;
    });

    btn?.addEventListener('click', async () => {
      const radio = list?.querySelector('input[name="bic_page"]:checked');
      if (!radio) return;
      const page = pages.find((p) => p.id === radio.value);
      if (!page) return;

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';

      try {
        await this._savePage(integId, page);
        this._showSuccess('facebook', returnTo);
      } catch (err) {
        console.error('[BrandIntegrationCallback] save page error:', err);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Conectar esta página';
        alert('No se pudo guardar. Inténtalo de nuevo.');
      }
    });
  }

  // ── Pantalla: sin páginas ─────────────────────────────────────────────────

  _showNoPages(returnTo) {
    const wrap = document.getElementById('bic-container');
    if (!wrap) return;
    const safeReturn = this._safeInternalPath(returnTo);
    wrap.innerHTML = `
      <div class="bic-error">
        <i class="fas fa-flag"></i>
        <h2>No se encontraron páginas</h2>
        <p>
          Tu cuenta de Facebook no devolvió ninguna Página. Puede ocurrir si no seleccionaste
          ninguna en el paso de autorización de Meta.
        </p>
        <ul style="text-align:left;font-size:.88rem;line-height:1.6;color:var(--text-secondary);max-width:440px;margin:0 auto 1.25rem">
          <li>Haz clic en <strong>Volver</strong> y vuelve a conectar Meta.</li>
          <li>En el diálogo de Facebook, en el paso <em>"Elige qué páginas conectar"</em>,
              asegúrate de seleccionar al menos una página antes de continuar.</li>
          <li>Si no eres Administrador de ninguna Página, primero crea una o pide acceso de administrador.</li>
        </ul>
        <button type="button" class="bic-confirm-btn" data-bic-back="1">
          <i class="fas fa-arrow-left"></i> Volver
        </button>
      </div>`;
    wrap.querySelector('[data-bic-back="1"]')?.addEventListener('click', () => this._redirect(safeReturn));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Valida que `path` sea una ruta interna segura (misma app, sin esquema, sin `//`
   * para que el router no lo interprete como protocol-relative). Si no lo es,
   * devuelve `/brands` (fallback seguro).
   *
   * Rechazamos deliberadamente `?`, `#`, `%`, `&`, `=`, espacios y comillas —
   * nunca necesarios en una ruta interna y sí utilizables para XSS/open-redirect
   * si el valor llegara a un atributo HTML o a `window.location.href`.
   */
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

  _showSuccess(platform, returnTo) {
    const safe = this._safeInternalPath(returnTo);
    const wrap = document.getElementById('bic-container');
    if (!wrap) { this._redirect(safe); return; }
    const label = platform === 'google' ? 'Google' : (platform === 'shopify' ? 'Shopify' : 'Meta');
    wrap.innerHTML = `
      <div class="bic-success">
        <div class="bic-success-check"><i class="fas fa-check"></i></div>
        <h2>Integracion conectada</h2>
        <p>${this._esc(label)} se conecto correctamente a tu marca.</p>
        <button type="button" class="bic-confirm-btn" data-bic-continue="1">
          <i class="fas fa-arrow-right"></i> Continuar
        </button>
      </div>`;
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
    wrap.innerHTML = `
      <div class="bic-error">
        <i class="fas fa-exclamation-triangle"></i>
        <h2>Error al conectar</h2>
        <p>${this._esc(msg)}</p>
        <button type="button" class="bic-confirm-btn" data-bic-back="1">
          <i class="fas fa-arrow-left"></i> Volver a Marcas
        </button>
      </div>`;
    wrap.querySelector('[data-bic-back="1"]')?.addEventListener('click', () => this._redirect('/brands'));
  }

  // Alias local: `_esc` existía antes; delegamos en `this.escapeHtml` (BaseView).
  _esc(text) { return this.escapeHtml(text); }
}

window.BrandIntegrationCallbackView = BrandIntegrationCallbackView;
if (typeof module !== 'undefined' && module.exports) module.exports = BrandIntegrationCallbackView;
