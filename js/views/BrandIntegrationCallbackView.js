/**
 * BrandIntegrationCallbackView
 * Callback para integraciones OAuth propias (no Supabase OAuth).
 *
 * Recibe:
 * - code
 * - state (base64url con { platform, brand_container_id, return_to })
 *
 * Luego llama a backend (Netlify Function) /api/integrations/exchange para:
 * - intercambiar code por tokens
 * - guardar en brand_integrations
 * - redirigir al return_to
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
        <div class="error-container" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          padding: 2rem;
          text-align: center;
        ">
          <div class="error-icon" style="font-size: 3rem; color: var(--accent-warm, #e09145); margin-bottom: 1rem;">
            <i class="fas fa-sync-alt"></i>
          </div>
          <h2 style="color: var(--text-primary, #ecebda); margin-bottom: 0.5rem;">Conectando integración...</h2>
          <p style="color: var(--text-secondary, #a0a0a0); max-width: 520px;">
            Espera un momento mientras guardamos la información de tu cuenta.
          </p>
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
      const code = params.get('code');
      const state = params.get('state');

      if (error) throw new Error(error);
      if (!code || !state) throw new Error('Faltan parámetros de OAuth (code/state).');

      const session = await this.supabase.auth.getSession();
      const accessToken = session?.access_token;
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

      if (window.router) window.router.navigate(returnTo, true);
      else window.location.href = returnTo;
    } catch (e) {
      console.error('BrandIntegrationCallbackView error:', e);
      const c = document.getElementById('app-container');
      if (c) c.innerHTML = `<div class="page-content" style="padding: 2rem;"><h2 style="color: var(--text-primary, #ecebda); margin-bottom: 0.5rem;">Error</h2><p style="color: var(--text-secondary, #a0a0a0);">${this.escapeHtml(e?.message || String(e))}</p></div>`;
    }
  }

  escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m] || m));
  }
}

window.BrandIntegrationCallbackView = BrandIntegrationCallbackView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrandIntegrationCallbackView;
}

