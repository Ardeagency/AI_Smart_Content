/**
 * DemoEntryView - Public entry point for the IGNIS read-only preview.
 *
 * Lifecycle:
 *   1. Render a splash with the brand logo and a status line.
 *   2. Call supabase.auth.signInAnonymously() — the database trigger
 *      demo_attach_anonymous_user_trg auto-joins the new user to IGNIS
 *      with role='demo'.
 *   3. Persist selectedOrganizationId so the rest of the SPA picks IGNIS.
 *   4. Redirect to /org/000000000001/ignis/vera (Vera is the wow-factor landing).
 *
 * If the visitor already has a non-anonymous session, route them home — we
 * never downgrade a real account into demo mode.
 */
class DemoEntryView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
  }

  async updateHeader() { /* no header on public splash */ }

  renderHTML() {
    return `
      <div class="demo-entry">
        <div class="demo-entry__card">
          <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="demo-entry__logo" width="180" height="72" decoding="async">
          <h1 class="demo-entry__title">${window.__('Preparando tu preview')}</h1>
          <p class="demo-entry__status" id="demoEntryStatus">${window.__('Conectando con la plataforma…')}</p>
          <div class="demo-entry__spinner" aria-hidden="true"></div>
          <p class="demo-entry__hint">${window.__('Vas a explorar <strong>IGNIS</strong>, una marca de demostración. Podrás navegar y conversar con Vera — los cambios están deshabilitados.')}</p>
        </div>
      </div>
    `;
  }

  _setStatus(msg) {
    const el = document.getElementById('demoEntryStatus');
    if (el) el.textContent = msg;
  }

  async init() {
    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;

    if (!supabase) {
      this._setStatus(window.__('No se pudo cargar Supabase. Recarga la página.'));
      return;
    }

    // If already signed in as a real user, send them home.
    try {
      const { data: { user: existing } } = await supabase.auth.getUser();
      if (existing && existing.is_anonymous !== true) {
        this._setStatus(window.__('Ya tienes sesión iniciada. Redirigiendo…'));
        if (window.router) window.router.navigate('/home', true);
        return;
      }
    } catch (_) { /* continue with anon flow */ }

    this._setStatus(window.__('Creando sesión anónima…'));

    let session = null;
    if (typeof supabase.auth.signInAnonymously === 'function') {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('[DemoEntry] signInAnonymously failed', error);
        this._setStatus(window.__('No pudimos abrir el preview. Intenta de nuevo.'));
        return;
      }
      session = data.session;
    } else {
      // Fallback for older supabase-js: hit /auth/v1/signup with empty body.
      try {
        const url = window.SUPABASE_URL || (supabase && supabase.supabaseUrl) || '';
        const key = window.SUPABASE_ANON_KEY || (supabase && supabase.supabaseKey) || '';
        const resp = await fetch(`${url}/auth/v1/signup`, {
          method: 'POST',
          headers: { 'apikey': key, 'Content-Type': 'application/json' },
          body: '{}'
        });
        const data = await resp.json();
        if (!resp.ok || !data.access_token) {
          this._setStatus(window.__('Anon auth no disponible en este entorno.'));
          return;
        }
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });
        session = (await supabase.auth.getSession()).data.session;
      } catch (e) {
        console.error('[DemoEntry] fallback signup failed', e);
        this._setStatus(window.__('No pudimos abrir el preview.'));
        return;
      }
    }

    if (!session) {
      this._setStatus(window.__('Sesión no se inicializó. Recarga la página.'));
      return;
    }

    const ignisId = window.IGNIS_ORG_ID || 'a1000000-0000-0000-0000-000000000001';

    // Pin IGNIS as the active org so the rest of the SPA renders against it.
    try {
      localStorage.setItem('selectedOrganizationId', ignisId);
    } catch (_) { /* private mode */ }

    // Race condition fix: signInAnonymously resolves the promise, but
    // authService.loadUserData runs asynchronously via onAuthStateChange.
    // If we navigate before it finishes, the router's loadMembership() bails
    // (no currentUser.id yet), the capabilities check fails, and the router
    // redirects /vera → /vera in a loop until Chrome's navigation-throttle
    // kicks in. Force a sequential load here.
    this._setStatus(window.__('Cargando tu perfil…'));
    try {
      if (window.authService && typeof window.authService.loadUserData === 'function') {
        await window.authService.loadUserData(session.user.id);
      }
      // Pre-warm membership cache so the router can cap-check synchronously.
      if (window.authService && typeof window.authService.loadMembership === 'function') {
        await window.authService.loadMembership(ignisId);
      }
    } catch (e) {
      console.warn('[DemoEntry] preload user/membership failed', e);
    }

    // Best-effort tracking — never block the redirect.
    try {
      if (window.DemoGuard && window.DemoGuard._trackEvent) {
        window.DemoGuard._trackEvent('demo_session_started', { ua: navigator.userAgent });
      }
    } catch (_) {}

    this._setStatus(window.__('Listo. Abriendo la plataforma…'));

    // Landing del demo: Dashboard (vista general analítica de IGNIS).
    // Ruta: /org/:orgIdShort/:orgNameSlug/dashboard. Cap requerida
    // insights.view, que el rol 'demo' ya tiene en capabilities.js.
    const target = '/org/000000000001/ignis/dashboard';
    if (window.router) {
      window.router.navigate(target, true);
    } else {
      window.location.replace(target);
    }
  }
}

window.DemoEntryView = DemoEntryView;
