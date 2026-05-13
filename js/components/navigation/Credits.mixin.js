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
    // Reset del cache local de la org Y del apiClient para que la próxima
    // lectura vaya a la BD. Lo dispara el evento 'credits-updated' que emiten
    // Studio (consumo) y la tienda de créditos (compra).
    this._orgCacheTime = 0;
    if (window.apiClient && this.currentOrgId) {
      window.apiClient.invalidate(`nav:credits:${this.currentOrgId}`);
    }
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
    return String(Math.round(credits));
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
    const verticalFill = document.querySelector('.nav-credits-vertical-fill');
    if (!silent) {
      if (tokensEl) tokensEl.textContent = '…';
      if (barFill) barFill.style.width = '0%';
      if (verticalFill) verticalFill.style.height = '0%';
    }
    try {
      // TTL corto (15 s) porque los créditos bajan con cada uso en Studio. SWR
      // garantiza pintar el valor previo al instante; el polling de 25 s en
      // _startCreditsRefreshInterval invalida y refresca de fondo. El evento
      // 'credits-updated' (refreshCredits) invalida cuando se compran/usan.
      const fetcher = async () => {
        const { data, error } = await supabase
          .from('organization_credits')
          .select('credits_available, credits_total')
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) throw error;
        return data;
      };
      const data = window.apiClient
        ? await window.apiClient.query(`nav:credits:${orgId}`, fetcher, { ttl: 15 * 1000, staleWhileRevalidate: true })
        : await fetcher();

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
      if (verticalFill && verticalFill.style.height !== nextWidth) {
        verticalFill.style.height = nextWidth;
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
  /**
   * Lee uso de almacenamiento desde storage_usage (BD) y actualiza el DOM del sidebar.
   * Schema: storage_usage(organization_id, used_mb, max_mb). max_mb se sincroniza con
   * el plan activo via trigger subscriptions_storage_max_sync; used_mb via trigger
   * brand_assets_storage_recompute.
   * @param {string|null} [organizationId]
   */
  async loadStorageFromDb(organizationId) {
    const orgId = organizationId || this.currentOrgId;
    if (!orgId) return;
    const supabase = await this.getSupabase();
    if (!supabase) return;
    const valueEl = document.getElementById('navStorageValue');
    if (!valueEl) return;
    try {
      // Storage cambia solo cuando suben/borran assets (trigger en DB). Cache
      // 2 min. Para refresh inmediato tras upload, llamar
      // apiClient.invalidate(`nav:storage:${orgId}`).
      const fetcher = async () => {
        const { data, error } = await supabase
          .from('storage_usage')
          .select('used_mb, max_mb')
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) throw error;
        return data;
      };
      const data = window.apiClient
        ? await window.apiClient.query(`nav:storage:${orgId}`, fetcher, { ttl: 2 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();

      const used = data ? Number(data.used_mb) || 0 : 0;
      const max = data ? Number(data.max_mb) || 0 : 0;
      const next = max > 0
        ? `${this._formatStorageDisplay(used)} / ${this._formatStorageDisplay(max)}`
        : this._formatStorageDisplay(used);
      if (valueEl.textContent !== next) valueEl.textContent = next;

      // Progress bar + threshold colors + dot indicator (>80% warning, >95% danger)
      const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
      const fillEl = document.getElementById('navUpgradeProgressFill');
      const dotEl = document.getElementById('navUpgradeDot');
      const card = document.getElementById('navUpgradeCard');
      if (fillEl) {
        fillEl.style.width = `${pct}%`;
        fillEl.classList.toggle('is-warning', pct >= 80 && pct < 95);
        fillEl.classList.toggle('is-danger', pct >= 95);
      }
      if (dotEl) dotEl.hidden = pct < 80;
      if (card) card.setAttribute('aria-valuenow', String(Math.round(pct)));
    } catch (e) {
      console.warn('Navigation: loadStorageFromDb', e);
      valueEl.textContent = '—';
    }
  },

  /**
   * Devuelve el "outcome-focused benefit" del próximo tier según el plan actual.
   * Si el usuario ya está en tier top (Business/Enterprise), devuelve null y la
   * UI oculta el CTA via .is-pro class.
   */
  _getUpgradeBenefitForPlan(planRaw) {
    const slug = String(planRaw || '').trim().toLowerCase();
    if (!slug || slug === 'free' || slug === 'gratis') return 'Unlock 50GB + unlimited brands';
    if (slug.includes('starter')) return 'Add team seats + advanced AI';
    if (slug === 'pro' || slug.includes('profesional')) return 'Get dedicated support + custom limits';
    if (slug.includes('business') || slug.includes('enterprise')) return null;
    return 'Unlock more storage and brands';
  },

  /** True si el plan actual es top-tier (no debería ver CTA). */
  _isTopTierPlan(planRaw) {
    const slug = String(planRaw || '').trim().toLowerCase();
    return slug.includes('business') || slug.includes('enterprise');
  },

  /**
   * MB → "12 MB", "1.4 GB", "1 TB" (sin overflow de decimales).
   */
  _formatStorageDisplay(mb) {
    const v = Number(mb) || 0;
    if (v >= 1048576) return (Math.floor(v / 104857.6) / 10).toFixed(1) + ' TB';
    if (v >= 1024) return (Math.floor(v / 102.4) / 10).toFixed(1) + ' GB';
    return Math.round(v) + ' MB';
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

    // Upgrade card: badge de plan + benefit dinámico + is-pro toggle
    const planRaw = this._orgCache.plan || 'Free';
    const planBadgeEl = document.getElementById('navUpgradePlanBadge');
    const benefitEl = document.getElementById('navUpgradeBenefit');
    const upgradeCardEl = document.getElementById('navUpgradeCard');
    if (planBadgeEl) {
      // Capitaliza primera letra: "free" → "Free", "starter" → "Starter"
      const display = String(planRaw).replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      planBadgeEl.textContent = display || 'Free';
    }
    const benefit = this._getUpgradeBenefitForPlan(planRaw);
    if (benefitEl) benefitEl.textContent = benefit || '';
    if (upgradeCardEl) upgradeCardEl.classList.toggle('is-pro', this._isTopTierPlan(planRaw));
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
