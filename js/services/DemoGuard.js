/**
 * DemoGuard - Detect demo (anonymous) sessions and intercept mutation attempts.
 *
 * A visitor is in demo mode when their Supabase session has is_anonymous=true.
 * We expose a single source of truth via window.DemoGuard so views can:
 *   1. Read DemoGuard.isDemo() to render disabled CTAs.
 *   2. Wrap a click handler with DemoGuard.blockIfDemo(action, fn) to redirect
 *      to the signup modal instead of executing the mutation when in demo.
 *
 * The class is intentionally tiny and dependency-free — it must load before
 * Navigation.js so the banner can render on first paint.
 */
(function () {
  const IGNIS_ORG_ID = 'a1000000-0000-0000-0000-000000000001';

  class DemoGuard {
    constructor() {
      this._signupModal = null;
    }

    /** True when the current Supabase session is anonymous. */
    isDemo() {
      try {
        const u = window.authService && window.authService.getCurrentUser
          ? window.authService.getCurrentUser()
          : (window.authService && window.authService.currentUser);
        return !!(u && (u.is_anonymous === true || u.isAnonymous === true));
      } catch (_) {
        return false;
      }
    }

    /** True if the active org is IGNIS — used to gate demo-only UI affordances. */
    isOnIgnis() {
      return window.currentOrgId === IGNIS_ORG_ID;
    }

    /**
     * Wrap a callback so it is replaced by the signup modal when in demo mode.
     * @param {string} action  Short label shown in the modal ("crear campaña", "generar imagen")
     * @param {Function} fn    Original handler executed only for real users
     */
    blockIfDemo(action, fn) {
      return (...args) => {
        if (this.isDemo()) {
          this.showSignupModal(action);
          return;
        }
        return fn(...args);
      };
    }

    /**
     * Show a centered modal that explains why the action is gated and links to /signin.
     * The modal is created lazily and reused across calls.
     */
    showSignupModal(action) {
      this._trackEvent('cta_modal_opened', { action });

      if (!this._signupModal) {
        const modal = document.createElement('div');
        modal.className = 'demo-cta-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
          <div class="demo-cta-modal__backdrop" data-demo-close="1"></div>
          <div class="demo-cta-modal__card">
            <button type="button" class="demo-cta-modal__close" data-demo-close="1" aria-label="Cerrar">&times;</button>
            <h2 class="demo-cta-modal__title">Esto es solo el preview</h2>
            <p class="demo-cta-modal__action">Para <strong data-demo-action>esta acción</strong> necesitas acceso a la plataforma.</p>
            <p class="demo-cta-modal__body">
              Estás viendo <strong>IGNIS</strong>, una marca de demostración.
              Solicita acceso y te conectamos para configurar tu propia marca.
            </p>
            <div class="demo-cta-modal__actions">
              <a class="btn btn-primary" href="mailto:info@ardeagency.com?subject=Solicitud%20de%20acceso%20-%20AI%20Smart%20Content&body=Hola%2C%20me%20gustar%C3%ADa%20solicitar%20acceso%20a%20AI%20Smart%20Content.%0A%0ANombre%3A%0AEmpresa%3A%0AC%C3%B3mo%20podemos%20ayudarte%3A" data-demo-cta="primary">Solicitar acceso</a>
              <button type="button" class="btn btn-secondary" data-demo-close="1">Seguir explorando</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
          if (e.target && e.target.matches && e.target.matches('[data-demo-close]')) {
            this._hideSignupModal();
          }
          if (e.target && e.target.matches && e.target.matches('[data-demo-cta="primary"]')) {
            this._trackEvent('cta_modal_signup_clicked', { action });
          }
        });
        this._signupModal = modal;
      }
      const actionEl = this._signupModal.querySelector('[data-demo-action]');
      if (actionEl) actionEl.textContent = action || 'esta acción';
      this._signupModal.classList.add('demo-cta-modal--open');
      document.body.classList.add('demo-cta-modal-open');
    }

    _hideSignupModal() {
      if (!this._signupModal) return;
      this._signupModal.classList.remove('demo-cta-modal--open');
      document.body.classList.remove('demo-cta-modal-open');
    }

    /**
     * Fire-and-forget telemetry for demo funnels. Best-effort: any failure is
     * swallowed so we never break the demo over a missing analytics endpoint.
     */
    _trackEvent(name, payload = {}) {
      try {
        const body = JSON.stringify({
          name,
          payload,
          path: location.pathname + location.search,
          ts: new Date().toISOString()
        });
        if (navigator.sendBeacon) {
          const blob = new Blob([body], { type: 'application/json' });
          navigator.sendBeacon('/api/demo-event', blob);
        } else {
          fetch('/api/demo-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
        }
      } catch (_) { /* noop */ }
    }
  }

  /**
   * Monkey-patch the Supabase client so any mutation (insert/update/delete/upsert,
   * storage upload, functions.invoke) opens the signup modal instead of executing
   * when the visitor is anonymous. RLS already blocks these at the DB — this layer
   * gives the visitor a friendly modal rather than a silent failure.
   *
   * Idempotent: only installs once per client instance (tagged with __demoPatched).
   */
  function installSupabaseInterceptor(client, guard) {
    if (!client || client.__demoPatched) return;
    client.__demoPatched = true;

    const blockedResult = (action) => Promise.resolve({
      data: null,
      error: { message: 'demo_blocked', action },
      __demoBlocked: true
    });

    const originalFrom = client.from && client.from.bind(client);
    if (originalFrom) {
      client.from = function patchedFrom(table) {
        const qb = originalFrom(table);
        ['insert', 'update', 'delete', 'upsert'].forEach((m) => {
          if (typeof qb[m] === 'function') {
            const orig = qb[m].bind(qb);
            qb[m] = function patchedMutation(...args) {
              if (guard.isDemo()) {
                guard.showSignupModal(`modificar ${table}`);
                return Object.assign(blockedResult(m), {
                  select: () => blockedResult(m),
                  single: () => blockedResult(m),
                  then: (resolve) => Promise.resolve(blockedResult(m)).then(resolve)
                });
              }
              return orig(...args);
            };
          }
        });
        return qb;
      };
    }

    const originalInvoke = client.functions && client.functions.invoke
      && client.functions.invoke.bind(client.functions);
    if (originalInvoke) {
      client.functions.invoke = function patchedInvoke(fnName, opts) {
        if (guard.isDemo()) {
          guard.showSignupModal(`ejecutar ${fnName}`);
          return blockedResult('invoke');
        }
        return originalInvoke(fnName, opts);
      };
    }

    const originalStorageFrom = client.storage && client.storage.from
      && client.storage.from.bind(client.storage);
    if (originalStorageFrom) {
      client.storage.from = function patchedStorage(bucket) {
        const sb = originalStorageFrom(bucket);
        ['upload', 'update', 'remove', 'move', 'copy'].forEach((m) => {
          if (typeof sb[m] === 'function') {
            const orig = sb[m].bind(sb);
            sb[m] = function patchedStorageMutation(...args) {
              if (guard.isDemo()) {
                guard.showSignupModal(`subir/modificar archivos`);
                return blockedResult(m);
              }
              return orig(...args);
            };
          }
        });
        return sb;
      };
    }
  }

  async function bootstrapInterceptor(guard) {
    try {
      let client = window.supabase;
      if (!client && window.supabaseService && window.supabaseService.getClient) {
        client = await window.supabaseService.getClient();
      }
      if (client) installSupabaseInterceptor(client, guard);
    } catch (e) {
      console.warn('[DemoGuard] interceptor bootstrap failed', e);
    }
  }

  const guard = new DemoGuard();
  window.DemoGuard = guard;
  window.IGNIS_ORG_ID = IGNIS_ORG_ID;

  // Defer until after app-loader has built the client. Cheap retry loop.
  let attempts = 0;
  const tick = () => {
    if (window.supabase) {
      bootstrapInterceptor(guard);
      return;
    }
    if (attempts++ < 50) setTimeout(tick, 100);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
})();
