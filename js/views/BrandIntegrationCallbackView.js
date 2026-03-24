/**
 * BrandIntegrationCallbackView
 * Callback para integraciones OAuth propias (no Supabase OAuth).
 *
 * Recibe:
 * - code
 * - state (base64url con { platform, brand_container_id, return_to })
 *
 * Para Facebook: si hay varias páginas guardadas, muestra un selector
 * para que el usuario elija UNA antes de continuar.
 */
class BrandIntegrationCallbackView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.supabase = null;
    this._done = false;
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
      </div>
    `;
  }

  async onEnter() {
    if (this._done) return;
    this._done = true;

    try {
      if (window.supabaseService?.getClient) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      } else {
        throw new Error('Supabase no disponible');
      }

      const params = new URLSearchParams(window.location.search || '');
      const error = params.get('error');
      const code  = params.get('code');
      const state = params.get('state');

      if (error) throw new Error(error);
      if (!code || !state) throw new Error('Faltan parámetros de OAuth (code/state).');

      const session = await this.supabase.auth.getSession();
      const accessToken = session?.data?.session?.access_token;
      if (!accessToken) throw new Error('Sesión no válida. Inicia sesión y vuelve a conectar.');

      const res = await fetch(`${window.location.origin}/api/integrations/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ code, state })
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Error ${res.status} al completar el intercambio.`);
      }

      const json = await res.json();
      const returnTo = json?.return_to || '/home';
      const pages    = Array.isArray(json?.pages) ? json.pages : [];
      const integId  = json?.integ_id || null;

      // Si Facebook devuelve varias páginas → mostrar selector antes de continuar
      if (json?.platform === 'facebook' && pages.length > 1 && integId) {
        this._showPagePicker({ pages, integId, returnTo, accessToken });
        return;
      }

      this._redirect(returnTo);
    } catch (e) {
      console.error('BrandIntegrationCallbackView error:', e);
      this._showError(e?.message || String(e));
    }
  }

  // ── Selector de página ────────────────────────────────────────────────────

  _showPagePicker({ pages, integId, returnTo, accessToken }) {
    const container = document.getElementById('bic-container');
    if (!container) return;

    container.innerHTML = `
      <div class="bic-page-picker">
        <div class="bic-page-picker-head">
          <i class="fab fa-facebook bic-fb-icon"></i>
          <h2>¿Qué página quieres usar?</h2>
          <p>Tu cuenta gestiona ${pages.length} páginas. Elige la que quieres conectar a esta marca.</p>
        </div>
        <ul class="bic-page-list" id="bicPageList">
          ${pages.map((pg) => {
            const pic = typeof pg.picture === 'string' ? pg.picture : (pg.picture?.data?.url || null);
            const hasIg = !!pg.instagram_business_account?.id;
            return `
              <li class="bic-page-item" data-page-id="${this.escapeHtml(pg.id)}">
                <label class="bic-page-label">
                  <input type="radio" name="bic_page" value="${this.escapeHtml(pg.id)}" class="bic-page-radio">
                  <div class="bic-page-info">
                    ${pic
                      ? `<img src="${this.escapeHtml(pic)}" class="bic-page-avatar" alt="">`
                      : `<div class="bic-page-avatar bic-page-avatar--placeholder"><i class="fab fa-facebook"></i></div>`}
                    <div class="bic-page-text">
                      <strong>${this.escapeHtml(pg.name)}</strong>
                      ${hasIg
                        ? `<span class="bic-page-ig"><i class="fab fa-instagram"></i> Instagram Business vinculado</span>`
                        : ''}
                    </div>
                  </div>
                </label>
              </li>`;
          }).join('')}
        </ul>
        <div class="bic-page-actions">
          <button id="bicConfirmBtn" class="bic-confirm-btn" disabled>
            <i class="fas fa-check"></i> Usar esta página
          </button>
        </div>
        <p class="bic-page-note">Solo se conectará la página que elijas. Las demás quedarán fuera de esta marca.</p>
      </div>
    `;

    const list    = document.getElementById('bicPageList');
    const confirm = document.getElementById('bicConfirmBtn');

    list?.addEventListener('change', (e) => {
      if (e.target?.name === 'bic_page') {
        list.querySelectorAll('.bic-page-item').forEach((li) => li.classList.remove('is-selected'));
        e.target.closest('.bic-page-item')?.classList.add('is-selected');
        if (confirm) confirm.disabled = false;
      }
    });

    confirm?.addEventListener('click', async () => {
      const checked = list?.querySelector('input[name="bic_page"]:checked');
      if (!checked) return;
      const pageId = checked.value;
      const selectedPage = pages.find((p) => p.id === pageId);

      confirm.disabled = true;
      confirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';

      try {
        // Obtener metadata actual
        const { data: rows } = await this.supabase
          .from('brand_integrations')
          .select('metadata')
          .eq('id', integId)
          .limit(1);
        const existingMeta = rows?.[0]?.metadata || {};

        // Guardar solo la página seleccionada
        await this.supabase
          .from('brand_integrations')
          .update({
            metadata: {
              ...existingMeta,
              selected_page_id: pageId,
              selected_page_name: selectedPage?.name || null,
              selected_page_picture: typeof selectedPage?.picture === 'string'
                ? selectedPage.picture
                : (selectedPage?.picture?.data?.url || null)
            }
          })
          .eq('id', integId);

        this._redirect(returnTo);
      } catch (err) {
        console.error('Error guardando página:', err);
        confirm.disabled = false;
        confirm.innerHTML = '<i class="fas fa-check"></i> Usar esta página';
        this._showError('No se pudo guardar la selección. Inténtalo de nuevo.');
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _redirect(returnTo) {
    if (window.router) window.router.navigate(returnTo, true);
    else window.location.href = returnTo;
  }

  _showError(msg) {
    const c = document.getElementById('bic-container') || document.getElementById('app-container');
    if (c) c.innerHTML = `
      <div class="bic-error">
        <i class="fas fa-exclamation-triangle"></i>
        <h2>Error al conectar</h2>
        <p>${this.escapeHtml(msg)}</p>
        <button onclick="window.router?.navigate('/brands')" class="bic-confirm-btn">
          <i class="fas fa-arrow-left"></i> Volver a Marcas
        </button>
      </div>`;
  }

  escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m] || m));
  }
}

window.BrandIntegrationCallbackView = BrandIntegrationCallbackView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrandIntegrationCallbackView;
}
