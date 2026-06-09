/**
 * DashboardView — Strategy mixin (tab "Estrategia").
 *
 * El cerebro que UNIFICA. Las strategic_recommendations de Vera ya cruzan
 * Mi Marca (lift interno, mejores topics/tonos) + Competencia (white space,
 * vs rivales). Aqui se presentan como plan de accion:
 *   1. Aprendizaje  — tasa de aprobacion + propuestas + en produccion
 *   2. Pendientes   — action cards con aprobar / iterar / rechazar
 *   3. En produccion — lo que Vera ya esta ejecutando
 *
 * Datos: StrategiaDataService (dashboard_strategy_master + recommendations).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const fmt = { int: (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO')) };
  const CONF = {
    alta:  { label: 'Alta confianza',  color: '#6e9f81' },
    media: { label: 'Media confianza', color: '#9c8e6b' },
    baja:  { label: 'Baja confianza',  color: '#8a8a8e' },
  };

  Object.assign(DashboardView.prototype, {

    async _renderStrategy(body) {
      if (!body) return;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return; }
      await this._ensureStrategiaService();
      this._restoreStratFilters();
      this._renderStratSkeleton(body);
      try {
        const data = await this._strategiaService.loadAll({ status: this._stratFilters.status });
        this._stratData = data;
        body.innerHTML = this._buildStrategiaHtml(data);
        this._bindStrategyHandlers(body);
      } catch (e) {
        console.error('[Strategy] load failed:', e);
        body.innerHTML = `<div class="insight-page" style="text-align:center;padding-top:4rem;color:var(--text-secondary);">${__('No se pudo cargar Estrategia.')} ${this._esc(e?.message || '')}</div>`;
      }
    },

    _stratFiltersKey() { return `strat:filters:v1:${this._orgId || 'global'}`; },
    _restoreStratFilters() {
      if (this._stratFilters) return this._stratFilters;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(this._stratFiltersKey()) || 'null'); } catch (_) {}
      this._stratFilters = { status: stored?.status || 'proposed' };
      return this._stratFilters;
    },
    async _onStratFilterChange(patch) {
      this._stratFilters = { ...(this._stratFilters || {}), ...patch };
      try { localStorage.setItem(this._stratFiltersKey(), JSON.stringify(this._stratFilters)); } catch (_) {}
      const body = document.getElementById('insightTabBody');
      if (body) this._renderStrategy(body);
    },

    async _ensureStrategiaService() {
      if (this._strategiaService) return this._strategiaService;
      if (typeof StrategiaDataService !== 'function' || !this._supabase) return null;
      this._strategiaService = new StrategiaDataService();
      await this._strategiaService.init(this._supabase, this._orgId);
      return this._strategiaService;
    },

    _renderStratSkeleton(body) {
      if (this._silentRefresh) return; // auto-refresh: conservar contenido hasta el swap
      body.innerHTML = `
        <div class="insight-page mb-dash">
          <div class="mb-gauge-skeleton skeleton-shimmer" style="height:80px;"></div>
          <div style="height:1rem;"></div>
          ${BaseView.skeletonGrid ? BaseView.skeletonGrid(2) : ''}
        </div>`;
    },

    _buildStrategiaHtml(data) {
      const master = data?.master?.data || {};
      const proposed = Array.isArray(data?.proposed?.data) ? data.proposed.data : [];
      const inProd = Array.isArray(master.in_production) ? master.in_production : [];
      return `
        <div class="insight-page mb-dash" id="stratPage">
          ${this._buildStratFiltersBar()}
          ${this._buildStratHeader(master, proposed.length)}
          ${this._buildStratPending(proposed)}
          ${this._buildStratInProduction(inProd)}
        </div>`;
    },

    _buildStratFiltersBar() {
      const f = this._stratFilters || { status: 'proposed' };
      // Estrategia = estado de las recomendaciones (p_status). Fecha no es un
      // parametro de las RPCs de estrategia → pendiente de backend.
      const statusOpts = [
        { v: 'proposed', label: __('Pendientes') },
        { v: 'approved', label: __('Aprobadas') },
        { v: 'rejected', label: __('Descartadas') },
      ].map(o => `<option value="${o.v}"${f.status === o.v ? ' selected' : ''}>${o.label}</option>`).join('');
      return `
        <header class="living-history-filters mb-filters-bar" id="stratFilters">
          <div class="living-filter living-filter--disabled" title="${__('Próximamente')}">
            <label class="living-filter-label">${__('Fecha')}</label>
            <select class="living-filter-select" disabled><option>${__('Todo el periodo')}</option></select>
          </div>
          <div class="living-filter">
            <label class="living-filter-label" for="stratFilterStatus">${__('Estrategia')}</label>
            <select class="living-filter-select" id="stratFilterStatus" data-strat-filter="status">${statusOpts}</select>
          </div>
          ${this._reportDropdown()}
        </header>`;
    },

    _buildStratHeader(master, pendingCount) {
      const ls = master.learning_stats || {};
      const rate = Number.isFinite(Number(ls.approval_rate)) ? `${Math.round(Number(ls.approval_rate))}%` : '—';
      return `
        <section class="strat-header">
          <div class="strat-header-main">
            <span class="strat-header-title">${__('Estrategia de Vera')}</span>
            <span class="strat-header-sub">${__('Recomendaciones que cruzan tu marca, tu competencia y lo que te funciona — para que apruebes, ajustes o descartes.')}</span>
          </div>
          <div class="strat-stats">
            <div class="strat-stat"><span class="strat-stat-val">${fmt.int(pendingCount)}</span><span class="strat-stat-lbl">${__('Pendientes')}</span></div>
            <div class="strat-stat"><span class="strat-stat-val">${fmt.int((master.in_production || []).length)}</span><span class="strat-stat-lbl">${__('En producción')}</span></div>
            <div class="strat-stat"><span class="strat-stat-val">${rate}</span><span class="strat-stat-lbl">${__('Tasa de aprobación')}</span></div>
            <div class="strat-stat"><span class="strat-stat-val">${fmt.int(ls.total_proposals)}</span><span class="strat-stat-lbl">${__('Propuestas totales')}</span></div>
          </div>
        </section>`;
    },

    _buildStratPending(list) {
      const status = this._stratFilters?.status || 'proposed';
      const meta = {
        proposed: { title: __('Recomendaciones pendientes'), hint: __('Cada una cruza tu marca + tu competencia · aprueba, ajusta o descarta'), empty: __('Sin recomendaciones pendientes. Vera propondrá nuevas en su próximo ciclo.') },
        approved: { title: __('Recomendaciones aprobadas'),  hint: __('Las que aprobaste — en camino a producción'), empty: __('Aún no has aprobado recomendaciones.') },
        rejected: { title: __('Recomendaciones descartadas'), hint: __('Las que decidiste no ejecutar'), empty: __('No has descartado recomendaciones.') },
      }[status] || { title: __('Recomendaciones'), hint: '', empty: __('Sin recomendaciones.') };
      if (!list.length) {
        return `
          <section class="mb-section">
            <div class="mb-section-head"><span class="mb-section-title">${meta.title}</span></div>
            <div class="mb-causal-empty">${meta.empty}</div>
          </section>`;
      }
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">${meta.title}</span>
            ${meta.hint ? `<span class="mb-section-hint">${meta.hint}</span>` : ''}
          </div>
          <div class="strat-cards">${list.map(r => this._buildRecCard(r, status)).join('')}</div>
        </section>`;
    },

    _buildRecCard(r, status = 'proposed') {
      const conf = CONF[String(r.confidence || '').toLowerCase()] || { label: r.confidence || '', color: '#87868b' };
      const cap = (s) => { const t = String(s || '').replace(/_/g, ' '); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
      const chips = [r.tone, r.topic, r.format].filter(Boolean)
        .map(x => `<span class="strat-chip">${this._esc(cap(x))}</span>`).join('');
      return `
        <article class="strat-card" data-rec-id="${this._esc(r.id)}">
          <div class="strat-card-head">
            <span class="strat-card-title">${this._esc(r.title)}</span>
            ${conf.label ? `<span class="strat-card-conf" style="color:${conf.color};border-color:${conf.color};">${this._esc(conf.label)}</span>` : ''}
          </div>
          ${r.description ? `<p class="strat-card-desc">${this._esc(r.description)}</p>` : ''}
          ${chips ? `<div class="strat-card-chips">${chips}</div>` : ''}
          ${r.copy_seed ? `<div class="strat-card-copy"><i class="fas fa-quote-left"></i> ${this._esc(r.copy_seed)}</div>` : ''}
          ${status === 'proposed' ? `
          <div class="strat-card-actions">
            <button type="button" class="strat-btn strat-btn--approve" data-rec-action="approve">${__('Aprobar')}</button>
            <button type="button" class="strat-btn" data-rec-action="iterate">${__('Ajustar')}</button>
            <button type="button" class="strat-btn strat-btn--reject" data-rec-action="reject">${__('Descartar')}</button>
          </div>` : ''}
        </article>`;
    },

    _buildStratInProduction(list) {
      if (!list.length) return '';
      const rows = list.map(r => `
        <div class="strat-prod-row">
          <span class="strat-prod-dot"></span>
          <span class="strat-prod-title">${this._esc(r.title)}</span>
          <span class="strat-prod-meta">${this._esc([r.tone, r.format].filter(Boolean).join(' · '))}</span>
        </div>`).join('');
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">${__('En producción')}</span>
            <span class="mb-section-hint">${__('Lo que Vera ya está ejecutando')}</span>
          </div>
          <div class="strat-prod-list">${rows}</div>
        </section>`;
    },

    _bindStrategyHandlers(body) {
      if (!body || body.dataset.stratBound === '1') return;
      body.dataset.stratBound = '1';
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-rec-action]');
        if (!btn) return;
        const card = btn.closest('[data-rec-id]');
        if (!card) return;
        this._resolveRecommendation(card.dataset.recId, btn.dataset.recAction, card);
      });
      body.addEventListener('change', (e) => {
        const el = e.target.closest('[data-strat-filter]');
        if (el && el.dataset.stratFilter === 'status') {
          this._onStratFilterChange({ status: el.value || 'proposed' });
        }
      });
    },

    async _resolveRecommendation(recId, action, card) {
      if (!recId || !this._strategiaService) return;
      let feedback = '';
      if (action === 'iterate') {
        feedback = (window.prompt('¿Qué quieres ajustar de esta recomendación?') || '').trim();
        if (!feedback) return; // cancelado
      }
      if (card) { card.style.opacity = '0.5'; card.style.pointerEvents = 'none'; }
      try {
        if (action === 'approve')      await this._strategiaService.approve(recId);
        else if (action === 'reject')  await this._strategiaService.reject(recId, '');
        else if (action === 'iterate') await this._strategiaService.iterate(recId, feedback);
        // Re-render para reflejar el nuevo estado (en produccion / aprendizaje).
        if (window.apiClient) window.apiClient.invalidate?.((k) => k.startsWith('dash:strategia'));
        const bodyEl = document.getElementById('insightTabBody');
        if (bodyEl) this._renderStrategy(bodyEl);
      } catch (e) {
        console.error('[Strategy] action failed:', e?.message || e);
        if (card) { card.style.opacity = ''; card.style.pointerEvents = ''; }
      }
    },
  });
})();
