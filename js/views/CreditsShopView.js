/**
 * CreditsShopView — Página /credits del producto.
 *
 * Estructura (2026 SaaS standard):
 *   1. Balance card: progress bar + burn rate + projected runout
 *   2. Plan card: plan actual + renewal date + cambiar plan
 *   3. Chart: consumo 30d apilado por feature (CSS bars, sin Chart.js)
 *   4. Alertas + auto-recharge (preferencias)
 *   5. Por miembro del equipo + CSV export
 *   6. Historial de consumo paginado
 *   7. Packs de top-up
 *   8. Link a facturas (página separada — TODO)
 *
 * Stripe NO está conectado: los CTAs marcan "Próximamente" donde aplica.
 */
class CreditsShopView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.supabase = null;
    this.orgId = null;
    this.org = null;
    this.plan = null;
    this.subscription = null;
    this.creditsAvailable = 0;
    this.creditsTotal = 0;
    this.packages = [];
    this.usage30d = [];
    this.usageByMember = [];
    this.recentEvents = [];
    this.alertPrefs = null;
    this.timeRange = 30; // 7 | 30 | 90
    this.recentPage = 0;
    this.RECENT_PAGE_SIZE = 25;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    this.orgId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.orgId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/create';
      window.router?.navigate(url, true);
      return;
    }

    if (window.appState) window.appState.set('selectedOrganizationId', this.orgId, true);
    localStorage.setItem('selectedOrganizationId', this.orgId);
  }

  async render() {
    await super.render();
    await this.initSupabase();
    await Promise.all([
      this.loadCredits(),
      this.loadPlanAndSubscription(),
      this.loadPackages(),
      this.loadAlertPrefs(),
      window.CreditCosts?.getMap?.(),
    ]);
    await this.loadUsage();
    this.renderEverything();
    this.bindEvents();
    this.updateHeaderContext(__('Créditos'), null, this.org?.name || null);
  }

  // ─── data ─────────────────────────────────────────────────────────────

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }
      if (this.supabase) {
        const { data: orgData } = await this.supabase
          .from('organizations')
          .select('id, name')
          .eq('id', this.orgId)
          .maybeSingle();
        if (orgData) this.org = orgData;
      }
    } catch (e) {
      console.error('CreditsShopView initSupabase:', e);
    }
  }

  async loadCredits() {
    if (!this.supabase || !this.orgId) return;
    const { data } = await this.supabase
      .from('organization_credits')
      .select('credits_available, credits_total')
      .eq('organization_id', this.orgId)
      .maybeSingle();
    this.creditsAvailable = Number(data?.credits_available ?? 0);
    this.creditsTotal = Number(data?.credits_total ?? 0);
  }

  async loadPlanAndSubscription() {
    if (!this.supabase || !this.orgId) return;
    const { data: sub } = await this.supabase
      .from('subscriptions')
      .select('plan_id, status, current_period_start, current_period_end')
      .eq('organization_id', this.orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    this.subscription = sub || null;
    if (sub?.plan_id) {
      const { data: plan } = await this.supabase
        .from('plans')
        .select('id, name, price_usd_month, credits_monthly')
        .eq('id', sub.plan_id)
        .maybeSingle();
      this.plan = plan || null;
    }
  }

  async loadPackages() {
    if (!this.supabase) return;
    const { data } = await this.supabase
      .from('credit_packages')
      .select('id, name, credits, price_usd, bonus_credits, is_popular, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    this.packages = (data || []).map((p) => ({
      id: p.id, name: p.name, credits: p.credits, bonus: p.bonus_credits || 0,
      price: Number(p.price_usd) || 0, popular: !!p.is_popular,
    }));
  }

  async loadAlertPrefs() {
    if (!this.supabase || !this.orgId) return;
    const { data } = await this.supabase
      .from('credit_alert_prefs')
      .select('*')
      .eq('organization_id', this.orgId)
      .maybeSingle();
    this.alertPrefs = data || {
      organization_id: this.orgId,
      low_balance_pct_1: 25,
      low_balance_pct_2: 10,
      email_alerts: true,
      auto_recharge_enabled: false,
      auto_recharge_at_pct: 10,
      auto_recharge_pack_id: null,
    };
  }

  async loadUsage() {
    if (!this.supabase || !this.orgId) return;
    const days = this.timeRange;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [rangeRes, recentRes, memberRes] = await Promise.all([
      // Para el chart: solo deltas negativos (consumo).
      this.supabase
        .from('credit_usage')
        .select('kind, credits_delta, created_at')
        .eq('organization_id', this.orgId)
        .lt('credits_delta', 0)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(5000),
      // Historial paginado completo.
      this.supabase
        .from('credit_usage')
        .select('kind, credits_delta, created_at, metadata, source_table, source_id')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false })
        .range(this.recentPage * this.RECENT_PAGE_SIZE,
               this.recentPage * this.RECENT_PAGE_SIZE + this.RECENT_PAGE_SIZE - 1),
      // Por miembro: agregamos en JS (sumar credits_delta agrupando por metadata.user_id).
      this.supabase
        .from('credit_usage')
        .select('credits_delta, metadata, created_at, kind')
        .eq('organization_id', this.orgId)
        .lt('credits_delta', 0)
        .gte('created_at', since),
    ]);

    this.usage30d = rangeRes.data || [];
    this.recentEvents = recentRes.data || [];
    this.usageByMember = this._aggregateByMember(memberRes.data || []);
  }

  _aggregateByMember(rows) {
    const byUser = new Map();
    rows.forEach((r) => {
      const uid = r.metadata?.user_id || 'system';
      if (!byUser.has(uid)) {
        byUser.set(uid, { user_id: uid, used: 0, events: 0, lastActive: null, byKind: {} });
      }
      const m = byUser.get(uid);
      m.used += Math.abs(Number(r.credits_delta) || 0);
      m.events += 1;
      const ts = r.created_at;
      if (!m.lastActive || ts > m.lastActive) m.lastActive = ts;
      m.byKind[r.kind] = (m.byKind[r.kind] || 0) + Math.abs(Number(r.credits_delta) || 0);
    });
    return Array.from(byUser.values()).sort((a, b) => b.used - a.used);
  }

  // ─── derived metrics ─────────────────────────────────────────────────

  get spent30d() {
    return this.usage30d.reduce((acc, r) => acc + Math.abs(Number(r.credits_delta) || 0), 0);
  }

  get burnRatePerDay() {
    return this.spent30d / Math.max(this.timeRange, 1);
  }

  get projectedRunoutDate() {
    const burn = this.burnRatePerDay;
    if (burn <= 0 || this.creditsAvailable <= 0) return null;
    const daysLeft = this.creditsAvailable / burn;
    return new Date(Date.now() + daysLeft * 86400000);
  }

  get renewalDate() {
    return this.subscription?.current_period_end
      ? new Date(this.subscription.current_period_end)
      : null;
  }

  get runoutWarning() {
    const runout = this.projectedRunoutDate;
    const renewal = this.renewalDate;
    if (!runout || !renewal) return null;
    if (runout < renewal) {
      const daysEarly = Math.floor((renewal - runout) / 86400000);
      return daysEarly > 0 ? { runout, daysEarly } : null;
    }
    return null;
  }

  get pctUsed() {
    if (!this.creditsTotal) return 0;
    const used = this.creditsTotal - this.creditsAvailable;
    return Math.max(0, Math.min(100, (used / this.creditsTotal) * 100));
  }

  // ─── render ──────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="credits-page">
        <header class="credits-page-header">
          <h1>${__('Créditos')}</h1>
          <p class="credits-page-subtitle">${__('Saldo, consumo y configuración para {org}.', { org: this.escapeHtml(this.org?.name || __('tu organización')) })}</p>
        </header>

        <div class="credits-top-row">
          <section class="credits-card credits-balance-card" id="creditsBalanceCard">${this.skeletonText('45%','lg')}${this.skeletonText('70%')}${this.skeletonText('55%')}</section>
          <section class="credits-card credits-plan-card" id="creditsPlanCard">${this.skeletonText('40%','lg')}${this.skeletonText('65%')}${this.skeletonText('50%')}</section>
        </div>

        <section class="credits-card credits-chart-card">
          <div class="credits-card-header">
            <h2><i class="fas fa-chart-column"></i> ${__('Consumo')}</h2>
            <div class="credits-range-toggle" role="group">
              <button type="button" class="credits-range-btn" data-range="7">7d</button>
              <button type="button" class="credits-range-btn is-active" data-range="30">30d</button>
              <button type="button" class="credits-range-btn" data-range="90">90d</button>
            </div>
          </div>
          <div id="creditsChart">${this.skeletonCard('lg')}</div>
        </section>

        <section class="credits-card credits-prefs-card">
          <div class="credits-card-header">
            <h2><i class="fas fa-bell"></i> ${__('Alertas y auto-recarga')}</h2>
            <span class="credits-stripe-badge" title="${__('Auto-recarga requiere Stripe')}">
              <i class="fas fa-info-circle"></i> ${__('Auto-recarga: pendiente conectar Stripe')}
            </span>
          </div>
          <div id="creditsPrefs">${this.skeletonRows(2)}</div>
        </section>

        <section class="credits-card">
          <div class="credits-card-header">
            <h2><i class="fas fa-users"></i> ${__('Por miembro del equipo')}</h2>
            <button type="button" class="btn btn-secondary btn-sm" id="creditsExportCsv">
              <i class="fas fa-file-csv"></i> ${__('Exportar CSV')}
            </button>
          </div>
          <div id="creditsByMember">${this.skeletonRows(3)}</div>
        </section>

        <section class="credits-card">
          <div class="credits-card-header">
            <h2><i class="fas fa-clock-rotate-left"></i> ${__('Historial de consumo')}</h2>
          </div>
          <div id="creditsRecent"></div>
        </section>

        <section class="credits-card credits-packs-card">
          <div class="credits-card-header">
            <h2><i class="fas fa-cart-plus"></i> ${__('Comprar créditos extra')}</h2>
            <span class="credits-packs-hint">${__('Pago único · Los créditos se suman a tu saldo · Expira a los 12 meses')}</span>
          </div>
          <div id="creditsPacks"></div>
        </section>

        <footer class="credits-page-footer">
          <a href="#" id="creditsInvoicesLink" class="credits-footer-link">
            <i class="fas fa-receipt"></i> ${__('Ver facturas y recibos')}
          </a>
          <span class="credits-footer-sep">·</span>
          <a href="#" id="creditsContactSupport" class="credits-footer-link">
            <i class="fas fa-life-ring"></i> ${__('Contactar soporte para facturación empresarial')}
          </a>
        </footer>
      </div>
    `;
  }

  renderEverything() {
    this.renderBalance();
    this.renderPlan();
    this.renderChart();
    this.renderPrefs();
    this.renderByMember();
    this.renderRecent();
    this.renderPacks();
  }

  renderBalance() {
    const el = this.querySelector('#creditsBalanceCard');
    if (!el) return;
    const pct = this.pctUsed;
    const warning = this.runoutWarning;
    const burn = this.burnRatePerDay;

    el.innerHTML = `
      <div class="credits-balance-head">
        <span class="credits-balance-label">${__('Créditos disponibles')}</span>
      </div>
      <div class="credits-balance-value">
        ${this.creditsAvailable.toLocaleString('es')}
        <span class="credits-balance-total">/ ${this.creditsTotal.toLocaleString('es')}</span>
      </div>
      <div class="credits-progress" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100">
        <div class="credits-progress-fill ${pct > 90 ? 'is-critical' : pct > 75 ? 'is-warning' : ''}" style="width: ${pct}%"></div>
      </div>
      <div class="credits-balance-meta">
        <div><strong>${Math.round(pct)}%</strong> ${__('consumido')}</div>
        <div><strong>${burn.toFixed(1)}</strong> ${__('cr/día (últimos {n}d)', { n: this.timeRange })}</div>
      </div>
      ${warning ? `
        <div class="credits-runout-warning">
          <i class="fas fa-triangle-exclamation"></i>
          <span>${__('A tu ritmo actual te quedas sin créditos el <strong>{date}</strong> — {days} días antes de la renovación.', { date: this._fmtDate(warning.runout), days: warning.daysEarly })}</span>
        </div>
      ` : ''}
      <div class="credits-balance-actions">
        <button type="button" class="btn btn-primary" id="creditsBuyMore">
          <i class="fas fa-plus"></i> ${__('Comprar créditos')}
        </button>
      </div>
    `;
  }

  renderPlan() {
    const el = this.querySelector('#creditsPlanCard');
    if (!el) return;
    const plansRoute = this._planRoute();

    if (!this.subscription || !this.plan) {
      el.innerHTML = `
        <div class="credits-plan-empty">
          <h3>${__('Sin plan activo')}</h3>
          <p>${__('Actualmente no tienes una suscripción. Activa un plan para recibir créditos mensuales automáticamente.')}</p>
          <a href="${plansRoute}" class="btn btn-primary">
            <i class="fas fa-arrow-right"></i> ${__('Ver planes')}
          </a>
        </div>
      `;
      return;
    }

    const renewal = this.renewalDate;
    el.innerHTML = `
      <div class="credits-plan-head">
        <span class="credits-plan-label">${__('Plan actual')}</span>
        ${this.subscription.status === 'active' ? `<span class="credits-plan-status is-active">${__('Activo')}</span>` : `<span class="credits-plan-status">${this.escapeHtml(this.subscription.status || '')}</span>`}
      </div>
      <div class="credits-plan-name">${this.escapeHtml(this.plan.name)}</div>
      <div class="credits-plan-price">${__('{price}/mes · {credits} créditos/mes', { price: '$' + this.plan.price_usd_month, credits: this.plan.credits_monthly?.toLocaleString('es') })}</div>
      ${renewal ? `<div class="credits-plan-renewal">${__('Renueva el <strong>{date}</strong>', { date: this._fmtDate(renewal) })}</div>` : ''}
      <div class="credits-plan-actions">
        <a href="${plansRoute}" class="btn btn-secondary">${__('Cambiar plan')}</a>
        <a href="${plansRoute}/cancel" class="btn btn-text" id="creditsCancelLink">${__('Cancelar suscripción')}</a>
      </div>
    `;
  }

  renderChart() {
    const el = this.querySelector('#creditsChart');
    if (!el) return;
    if (!this.usage30d.length) {
      el.innerHTML = `<div class="credits-empty">${__('Sin consumo en los últimos {n} días.', { n: this.timeRange })}</div>`;
      return;
    }

    // Agrupar por día y por area.
    const days = this.timeRange;
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({ date: d, byArea: {} });
    }
    const dayMs = 86400000;
    const start = buckets[0].date.getTime();
    this.usage30d.forEach((r) => {
      const t = new Date(r.created_at).getTime();
      const idx = Math.floor((t - start) / dayMs);
      if (idx < 0 || idx >= buckets.length) return;
      const cost = window.CreditCosts?.get(r.kind);
      const area = cost?.area || 'background';
      const credits = Math.abs(Number(r.credits_delta) || 0);
      buckets[idx].byArea[area] = (buckets[idx].byArea[area] || 0) + credits;
    });

    const max = Math.max(1, ...buckets.map((b) => Object.values(b.byArea).reduce((a, v) => a + v, 0)));
    const allAreas = Array.from(new Set(buckets.flatMap((b) => Object.keys(b.byArea))));

    el.innerHTML = `
      <div class="credits-chart-bars" style="--chart-rows: ${buckets.length};">
        ${buckets.map((b) => {
          const totalDay = Object.values(b.byArea).reduce((a, v) => a + v, 0);
          const segs = allAreas.map((area) => {
            const v = b.byArea[area] || 0;
            if (!v) return '';
            const h = (v / max) * 100;
            const color = window.CreditCosts?.getAreaColor(area) || '#64748b';
            return `<span class="credits-chart-seg" style="height:${h}%; background:${color}" title="${this.escapeHtml(area)}: ${v.toFixed(0)} cr"></span>`;
          }).join('');
          return `
            <div class="credits-chart-day" title="${this._fmtDate(b.date)} — ${totalDay.toFixed(0)} cr">
              <div class="credits-chart-stack">${segs}</div>
              <div class="credits-chart-day-label">${b.date.getDate()}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="credits-chart-legend">
        ${allAreas.map((area) => `
          <span class="credits-chart-legend-item">
            <span class="credits-chart-legend-dot" style="background:${window.CreditCosts?.getAreaColor(area) || '#64748b'}"></span>
            <span>${this._areaLabel(area)}</span>
          </span>
        `).join('')}
      </div>
    `;
  }

  renderPrefs() {
    const el = this.querySelector('#creditsPrefs');
    if (!el) return;
    const p = this.alertPrefs;
    const packOptions = this.packages.map((pk) =>
      `<option value="${pk.id}" ${p.auto_recharge_pack_id === pk.id ? 'selected' : ''}>${this.escapeHtml(pk.name)} — ${pk.credits.toLocaleString('es')} cr · $${pk.price}</option>`
    ).join('');

    el.innerHTML = `
      <div class="credits-prefs-grid">
        <div class="credits-pref-row">
          <label class="credits-pref-label">
            <input type="checkbox" id="prefEmail" ${p.email_alerts ? 'checked' : ''}>
            <span>${__('Recibir alertas por email cuando el saldo baje')}</span>
          </label>
          <div class="credits-pref-detail">
            ${__('Alertar al')} <input type="number" id="prefPct1" min="1" max="99" value="${p.low_balance_pct_1}" class="credits-pref-input">${__('% y al')}
            <input type="number" id="prefPct2" min="1" max="99" value="${p.low_balance_pct_2}" class="credits-pref-input">${__('% del saldo')}
          </div>
        </div>

        <div class="credits-pref-row">
          <label class="credits-pref-label">
            <input type="checkbox" id="prefAutoRecharge" ${p.auto_recharge_enabled ? 'checked' : ''}>
            <span>${__('Auto-recarga cuando el saldo baje')}</span>
          </label>
          <div class="credits-pref-detail">
            ${__('Comprar al')}
            <input type="number" id="prefAutoPct" min="1" max="50" value="${p.auto_recharge_at_pct}" class="credits-pref-input">%:
            <select id="prefAutoPack" class="credits-pref-input">
              <option value="">${__('Seleccionar paquete…')}</option>
              ${packOptions}
            </select>
          </div>
        </div>

        <div class="credits-pref-actions">
          <button type="button" class="btn btn-primary btn-sm" id="prefSave">
            <i class="fas fa-check"></i> ${__('Guardar preferencias')}
          </button>
          <span id="prefStatus" class="credits-pref-status"></span>
        </div>
      </div>
    `;
  }

  renderByMember() {
    const el = this.querySelector('#creditsByMember');
    if (!el) return;
    if (!this.usageByMember.length) {
      el.innerHTML = `<div class="credits-empty">${__('Sin consumo del equipo en los últimos {n} días.', { n: this.timeRange })}</div>`;
      return;
    }
    const total = this.usageByMember.reduce((a, m) => a + m.used, 0);
    el.innerHTML = `
      <table class="credits-table">
        <thead>
          <tr>
            <th>${__('Miembro')}</th>
            <th>${__('Créditos usados')}</th>
            <th>${__('% del total')}</th>
            <th>${__('Eventos')}</th>
            <th>${__('Última actividad')}</th>
          </tr>
        </thead>
        <tbody>
          ${this.usageByMember.map((m) => {
            const pct = total > 0 ? (m.used / total * 100) : 0;
            const userLabel = m.user_id === 'system' ? __('Sistema (background)') : `${m.user_id.slice(0, 8)}…`;
            return `
              <tr>
                <td>${this.escapeHtml(userLabel)}</td>
                <td>${m.used.toFixed(0)}</td>
                <td>${pct.toFixed(1)}%</td>
                <td>${m.events}</td>
                <td>${m.lastActive ? this._fmtRelative(m.lastActive) : '—'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  renderRecent() {
    const el = this.querySelector('#creditsRecent');
    if (!el) return;
    if (!this.recentEvents.length) {
      el.innerHTML = `<div class="credits-empty">${__('Sin movimientos recientes.')}</div>`;
      return;
    }
    el.innerHTML = `
      <table class="credits-table">
        <thead>
          <tr>
            <th>${__('Fecha')}</th>
            <th>${__('Tipo')}</th>
            <th>Δ</th>
            <th>${__('Detalle')}</th>
          </tr>
        </thead>
        <tbody>
          ${this.recentEvents.map((r) => {
            const cost = window.CreditCosts?.get(r.kind);
            const delta = Number(r.credits_delta) || 0;
            const cls = delta < 0 ? 'is-debit' : 'is-credit';
            const detail = r.metadata?.description || r.source_id || '';
            return `
              <tr>
                <td>${this._fmtDateTime(r.created_at)}</td>
                <td><i class="fas ${cost?.icon || 'fa-coins'}"></i> ${this.escapeHtml(cost?.label || r.kind)}</td>
                <td class="${cls}">${delta > 0 ? '+' : ''}${delta.toFixed(2)}</td>
                <td>${this.escapeHtml(String(detail).slice(0, 60))}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <div class="credits-recent-pager">
        <button type="button" class="btn btn-text" id="recentPrev" ${this.recentPage === 0 ? 'disabled' : ''}>
          <i class="fas fa-arrow-left"></i> ${__('Anterior')}
        </button>
        <span>${__('Página {n}', { n: this.recentPage + 1 })}</span>
        <button type="button" class="btn btn-text" id="recentNext" ${this.recentEvents.length < this.RECENT_PAGE_SIZE ? 'disabled' : ''}>
          ${__('Siguiente')} <i class="fas fa-arrow-right"></i>
        </button>
      </div>
    `;
  }

  renderPacks() {
    const el = this.querySelector('#creditsPacks');
    if (!el) return;
    if (!this.packages.length) {
      el.innerHTML = `<div class="credits-empty">${__('No hay paquetes disponibles.')}</div>`;
      return;
    }
    el.innerHTML = `
      <div class="credits-packs-grid">
        ${this.packages.map((p) => {
          const total = p.credits + p.bonus;
          return `
            <div class="credits-pack-card ${p.popular ? 'is-popular' : ''}" data-pack-id="${p.id}">
              ${p.popular ? `<span class="credits-pack-badge">${__('Recomendado')}</span>` : ''}
              <div class="credits-pack-name">${this.escapeHtml(p.name)}</div>
              <div class="credits-pack-credits">${p.credits.toLocaleString('es')}<small>${__('créditos')}</small></div>
              ${p.bonus > 0 ? `<div class="credits-pack-bonus">+${p.bonus.toLocaleString('es')} ${__('bonus')}</div>` : ''}
              <div class="credits-pack-price">$${p.price}</div>
              <button type="button" class="btn btn-primary credits-pack-buy" data-pack-id="${p.id}">
                <i class="fas fa-cart-plus"></i> ${__('Comprar')}
              </button>
              <div class="credits-pack-note">${__('Total: {n} cr · Expira en 12 meses', { n: total.toLocaleString('es') })}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ─── events ──────────────────────────────────────────────────────────

  bindEvents() {
    const root = this.container;
    if (!root) return;

    root.querySelectorAll('.credits-range-btn').forEach((btn) => {
      this.addEventListener(btn, 'click', async () => {
        const range = parseInt(btn.getAttribute('data-range'), 10);
        if (!range || range === this.timeRange) return;
        this.timeRange = range;
        root.querySelectorAll('.credits-range-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        await this.loadUsage();
        this.renderBalance();
        this.renderChart();
        this.renderByMember();
      });
    });

    const buyBtn = root.querySelector('#creditsBuyMore');
    if (buyBtn) this.addEventListener(buyBtn, 'click', () => {
      root.querySelector('#creditsPacks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    root.querySelectorAll('.credits-pack-buy').forEach((btn) => {
      this.addEventListener(btn, 'click', (e) => this._onBuyClick(e));
    });

    const exportBtn = root.querySelector('#creditsExportCsv');
    if (exportBtn) this.addEventListener(exportBtn, 'click', () => this._exportCsv());

    const prefSave = root.querySelector('#prefSave');
    if (prefSave) this.addEventListener(prefSave, 'click', () => this._savePrefs());

    const prevBtn = root.querySelector('#recentPrev');
    const nextBtn = root.querySelector('#recentNext');
    if (prevBtn) this.addEventListener(prevBtn, 'click', () => this._changeRecentPage(-1));
    if (nextBtn) this.addEventListener(nextBtn, 'click', () => this._changeRecentPage(+1));
  }

  async _changeRecentPage(delta) {
    this.recentPage = Math.max(0, this.recentPage + delta);
    await this.loadUsage();
    this.renderRecent();
  }

  _onBuyClick(e) {
    const packId = e.currentTarget.getAttribute('data-pack-id');
    if (!packId) return;
    if (!window.billingService) {
      const msg = __('Billing service no disponible. Recarga la página.');
      this.showNotification?.(msg, 'error') || alert(msg);
      return;
    }
    window.billingService.startCheckout({
      target:    'package',
      packageId: packId,
      gateway:   'auto',
    });
  }

  _exportCsv() {
    const rows = [
      ['user_id', 'credits_used', 'events', 'last_active', ...Object.keys(window.CreditCosts?.AREA_COLORS || {})],
      ...this.usageByMember.map((m) => [
        m.user_id, m.used.toFixed(2), m.events, m.lastActive || '',
        ...Object.keys(window.CreditCosts?.AREA_COLORS || {}).map((area) => {
          const sum = Object.entries(m.byKind || {}).reduce((acc, [kind, v]) => {
            return acc + (window.CreditCosts?.get(kind)?.area === area ? v : 0);
          }, 0);
          return sum.toFixed(2);
        }),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credits-by-member-${this.orgId}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async _savePrefs() {
    const root = this.container;
    const status = root.querySelector('#prefStatus');
    const payload = {
      organization_id: this.orgId,
      email_alerts: root.querySelector('#prefEmail')?.checked || false,
      low_balance_pct_1: parseInt(root.querySelector('#prefPct1')?.value, 10) || 25,
      low_balance_pct_2: parseInt(root.querySelector('#prefPct2')?.value, 10) || 10,
      auto_recharge_enabled: root.querySelector('#prefAutoRecharge')?.checked || false,
      auto_recharge_at_pct: parseInt(root.querySelector('#prefAutoPct')?.value, 10) || 10,
      auto_recharge_pack_id: root.querySelector('#prefAutoPack')?.value || null,
    };
    if (status) { status.textContent = __('Guardando…'); status.className = 'credits-pref-status'; }
    const { error } = await this.supabase
      .from('credit_alert_prefs')
      .upsert(payload, { onConflict: 'organization_id' });
    if (status) {
      status.textContent = error ? `${__('Error')}: ${error.message}` : __('Guardado.');
      status.className = `credits-pref-status ${error ? 'is-error' : 'is-success'}`;
      setTimeout(() => { status.textContent = ''; }, 3000);
    }
    if (!error) this.alertPrefs = payload;
  }

  // ─── helpers ─────────────────────────────────────────────────────────

  _planRoute() {
    if (typeof window.getOrgPathPrefix === 'function' && this.org?.name) {
      const prefix = window.getOrgPathPrefix(this.orgId, this.org.name);
      if (prefix) return `${prefix}/plans`;
    }
    return '/plans';
  }

  _fmtDate(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  _fmtDateTime(d) {
    if (!d) return '';
    return new Date(d).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  _fmtRelative(d) {
    if (!d) return '';
    const ts = new Date(d).getTime();
    const diff = Date.now() - ts;
    if (diff < 3600000) return __('hace {n} min', { n: Math.floor(diff / 60000) });
    if (diff < 86400000) return __('hace {n} h', { n: Math.floor(diff / 3600000) });
    if (diff < 7 * 86400000) return __('hace {n} d', { n: Math.floor(diff / 86400000) });
    return this._fmtDate(d);
  }

  _areaLabel(area) {
    const labels = {
      studio: 'Studio', video: 'Video', vera: 'Vera',
      production: __('Producción'), background: __('Segundo plano'), system: __('Sistema'),
    };
    return labels[area] || area;
  }
}

window.CreditsShopView = CreditsShopView;
