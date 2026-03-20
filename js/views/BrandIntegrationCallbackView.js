/**
 * BrandIntegrationCallbackView
 * Callback para completar la conexión OAuth (Google/Facebook) y persistir en `brand_integrations`.
 */
class BrandIntegrationCallbackView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this._processed = false;
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

  async init() {
    if (this._processed) return;
    this._processed = true;
    await this.processOAuthCallback();
  }

  async processOAuthCallback() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const platform = String(params.get('platform') || '').toLowerCase().trim();
      const brandContainerId = String(params.get('brand_container_id') || '').trim();
      const returnTo = String(params.get('return_to') || '').trim();

      if (!platform || !brandContainerId) {
        this.showError('Faltan parámetros de la integración (platform / brand_container_id).');
        return;
      }

      if (!['google', 'facebook'].includes(platform)) {
        this.showError('Plataforma no soportada en esta ruta.');
        return;
      }

      if (!window.authService) {
        this.showError('Servicio de autenticación no disponible.');
        return;
      }

      const ok = await this.waitForAuth(15000);
      if (!ok) {
        this.showError('No se pudo completar el login. Vuelve a intentar.');
        return;
      }

      const supabase = window.supabase || (window.supabaseService && await window.supabaseService.getClient());
      if (!supabase) {
        this.showError('Supabase no está disponible.');
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        this.showError('No se pudo obtener el usuario autenticado.');
        return;
      }
      const user = userData.user;

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session?.access_token) {
        this.showError('No se pudo obtener la sesión OAuth para guardar la integración.');
        return;
      }

      const tokenExpiresAt = session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null;

      const scope = platform === 'facebook'
        ? ['email', 'public_profile']
        : ['email', 'profile'];

      const integrationPayload = {
        brand_container_id: brandContainerId,
        platform,
        external_account_id: user.id,
        external_account_name: user.email || user.id,
        access_token: session.access_token,
        refresh_token: session.refresh_token || null,
        token_expires_at: tokenExpiresAt,
        is_active: true,
        scope,
        account_url: null,
        metadata: {
          provider: platform,
          provider_user_id: user.id,
          email: user.email || null
        },
        updated_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString()
      };

      // Si no existe la integración, la creamos. Si existe, actualizamos la data.
      const { data: existing } = await supabase
        .from('brand_integrations')
        .select('id')
        .eq('brand_container_id', brandContainerId)
        .eq('platform', platform)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from('brand_integrations')
          .update(integrationPayload)
          .eq('id', existing.id);
      } else {
        await supabase.from('brand_integrations').insert(integrationPayload);
      }

      // Limpia query params para evitar bucles al navegar atrás/adelante
      if (returnTo) this.navigateToReturnTo(returnTo);
      else if (window.router) window.router.navigate('/settings', true);
      else window.location.href = '/settings';
    } catch (e) {
      console.error('BrandIntegrationCallbackView error:', e);
      this.showError(e?.message || 'Error al procesar la integración.');
    }
  }

  async waitForAuth(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await window.authService.isAuthenticated();
        if (ok) return true;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  navigateToReturnTo(returnTo) {
    try {
      const url = new URL(returnTo, window.location.origin);
      const pathWithSearch = url.pathname + (url.search || '');
      if (window.router) window.router.navigate(pathWithSearch, true);
      else window.location.href = pathWithSearch;
    } catch (_) {
      if (window.router) window.router.navigate('/settings', true);
      else window.location.href = '/settings';
    }
  }

  showError(message) {
    const c = document.getElementById('app-container');
    if (!c) return;
    c.innerHTML = `
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
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h2 style="color: var(--text-primary, #ecebda); margin-bottom: 0.5rem;">Error</h2>
        <p style="color: var(--text-secondary, #a0a0a0); max-width: 520px;">${message}</p>
        <button onclick="window.location.reload()" class="btn-primary" style="
          margin-top: 1.25rem;
          padding: 0.8rem 1.4rem;
          border: none;
          border-radius: 10px;
          cursor: pointer;
        ">Recargar</button>
      </div>
    `;
  }
}

window.BrandIntegrationCallbackView = BrandIntegrationCallbackView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrandIntegrationCallbackView;
}

