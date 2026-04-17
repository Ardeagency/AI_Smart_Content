/**
 * Navigation — Credits mixin.
 *
 * Lectura de créditos desde `organization_credits`, formateo para display,
 * polling cada 25s con pausa en tabs ocultas, y aplicación del cache de
 * créditos al DOM del sidebar.
 *
 * Aplica sobre Navigation.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof Navigation === 'undefined') return;

  const CreditsMixin = {
  refreshCredits() {
    this._orgCacheTime = 0;
    if (this.currentMode === 'user' && this.currentOrgId) {
      this.loadOrganizationInfo();
    }
  },

  /**
   * Formatea créditos para mostrar: cantidad exacta sin redondear hacia arriba (ej. 1999 → "1.9K", no "2.0K").
   */
  _formatCreditsDisplay(n) {
    const credits = Number(n) || 0;
    if (credits >= 1000) {
      return (Math.floor(credits / 100) / 10).toFixed(1) + 'K';
    }
    return String(credits);
  },

  /**
   * Lee créditos desde la tabla organization_credits (BD) y actualiza el DOM del sidebar.
   * Siempre hace una petición a la BD; no usa valor en memoria.
   * @param {string|null} [organizationId] - Si se pasa (ej. desde Studio), se usa esta org para la consulta.
   * @param {{ silent?: boolean }} [options] - `silent` (default true): no vaciar el DOM a "…"/0% antes del fetch (evita parpadeo al navegar o en polling).
   */
  async loadCreditsFromDb(organizationId, options = {}) {
    const silent = options.silent !== false;
    const orgId = organizationId || this.currentOrgId;
    if (!orgId) return;
    const supabase = await this.getSupabase();
    if (!supabase) return;
    const tokensEl = document.getElementById('navTokensValue');
    const barFill = document.querySelector('.nav-org-credits-bar-fill');
    if (!silent) {
      if (tokensEl) tokensEl.textContent = '…';
      if (barFill) barFill.style.width = '0%';
    }
    try {
      const { data, error } = await supabase
        .from('organization_credits')
        .select('credits_available, credits_total')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) {
        if (tokensEl) tokensEl.textContent = '—';
        console.warn('Navigation: error leyendo créditos', error);
        return;
      }
      const available = data != null ? (data.credits_available ?? 0) : 0;
      const total = data != null ? (data.credits_total ?? 0) : 0;
      const used = total > 0 ? Math.max(0, total - available) : 0;
      const nextLabel =
        total > 0
          ? `${this._formatCreditsDisplay(total)}/${this._formatCreditsDisplay(used)}`
          : '—';
      const pct = total > 0 ? Math.min(100, Math.round((available / total) * 100)) : 0;
      const nextWidth = `${pct}%`;
      if (tokensEl && tokensEl.textContent !== nextLabel) {
        tokensEl.textContent = nextLabel;
      }
      if (barFill && barFill.style.width !== nextWidth) {
        barFill.style.width = nextWidth;
      }
      if (this._orgCache && this._orgCacheId === orgId) {
        this._orgCache.credits = available;
        this._orgCache.credits_total = total;
      }
    } catch (e) {
      if (tokensEl) tokensEl.textContent = '—';
      console.warn('Navigation: loadCreditsFromDb', e);
    }
  },
  _startCreditsRefreshInterval() {
    this._stopCreditsRefreshInterval();
    if (this.currentMode !== 'user' || !this.currentOrgId) return;
    // Pausa el polling cuando la pestaña está oculta: evita hits cada 25s a la DB
    // (RLS + egress). Al volver, un visibilitychange dispara una refresh inmediata
    // para que el saldo de créditos se vea actualizado sin esperar al próximo tick.
    this._creditsRefreshInterval = setInterval(() => {
      if (document.hidden) return;
      if (this.currentMode === 'user' && this.currentOrgId) {
        this.loadCreditsFromDb();
      }
    }, 25000);
    this._creditsVisibilityHandler = () => {
      if (document.hidden) return;
      if (this.currentMode === 'user' && this.currentOrgId) {
        this.loadCreditsFromDb();
      }
    };
    document.addEventListener('visibilitychange', this._creditsVisibilityHandler);
  },

  _stopCreditsRefreshInterval() {
    if (this._creditsRefreshInterval) {
      clearInterval(this._creditsRefreshInterval);
      this._creditsRefreshInterval = null;
    }
    if (this._creditsVisibilityHandler) {
      document.removeEventListener('visibilitychange', this._creditsVisibilityHandler);
      this._creditsVisibilityHandler = null;
    }
  },

  _applyOrgCache() {
    if (!this._orgCache) return;
    const typeEl = document.getElementById('navOrgType');
    const tokensEl = document.getElementById('navTokensValue');
    const barFill = document.querySelector('.nav-org-credits-bar-fill');
    this._renderAdaptiveOrgName(this._orgCache.name || '');
    if (typeEl) typeEl.textContent = this._orgCache.plan || '';
    const available = this._orgCache.credits != null ? this._orgCache.credits : 0;
    const totalRaw = this._orgCache.credits_total != null ? this._orgCache.credits_total : 0;
    const total = totalRaw > 0 ? totalRaw : 0;
    const used = total > 0 ? Math.max(0, total - available) : 0;
    if (tokensEl) {
      tokensEl.textContent =
        total > 0 ? `${this._formatCreditsDisplay(total)}/${this._formatCreditsDisplay(used)}` : '—';
    }
    if (barFill) {
      const denom = total > 0 ? total : 1;
      const pct = Math.min(100, Math.round((available / denom) * 100));
      barFill.style.width = `${pct}%`;
    }
  },
  };

  Object.assign(Navigation.prototype, CreditsMixin);
})();
