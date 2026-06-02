/**
 * DashboardView — Competence mixin (tab "Competencia").
 *
 * Lente = rivales (distinta a Mi Marca). 3 secciones:
 *   1. El campo de batalla   — panorámica del nicho (kpis) + ranking de rivales
 *   2. La voz de su audiencia — pain points de los comentarios de sus seguidores
 *   3. Vulnerabilidades       — rival débil = momento de capturar su audiencia
 *
 * Datos: CompetenciaDataService (RPCs dashboard_competencia_*). Reusa helpers
 * compartidos del prototype (_esc, _compactNum, _prettyPlatform).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const HIDE_EMPTY = false;
  const fmt = { int: (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO')) };

  Object.assign(DashboardView.prototype, {

    async _renderCompetence(body) {
      if (!body) return;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return; }
      await this._ensureCompetenciaService();
      this._restoreCompFilters();
      this._renderCompSkeleton(body);
      try {
        const data = await this._competenciaService.loadAll({ windowDays: this._compFilters.windowDays });
        this._compData = data;
        body.innerHTML = this._buildCompetenciaHtml(data);
        this._bindCompetenceHandlers(body);
      } catch (e) {
        console.error('[Competence] load failed:', e);
        body.innerHTML = `<div class="insight-page" style="text-align:center;padding-top:4rem;color:var(--text-secondary);">No se pudo cargar Competencia. ${this._esc(e?.message || '')}</div>`;
      }
    },

    async _ensureCompetenciaService() {
      if (this._competenciaService) return this._competenciaService;
      if (typeof CompetenciaDataService !== 'function' || !this._supabase) return null;
      this._competenciaService = new CompetenciaDataService();
      await this._competenciaService.init(this._supabase, this._orgId);
      return this._competenciaService;
    },

    _compFiltersKey() { return `comp:filters:v1:${this._orgId || 'global'}`; },
    _restoreCompFilters() {
      if (this._compFilters) return this._compFilters;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(this._compFiltersKey()) || 'null'); } catch (_) {}
      this._compFilters = { windowDays: Number(stored?.windowDays) > 0 ? Number(stored.windowDays) : 99999 };
      return this._compFilters;
    },
    async _onCompFilterChange(patch) {
      this._compFilters = { ...(this._compFilters || {}), ...patch };
      try { localStorage.setItem(this._compFiltersKey(), JSON.stringify(this._compFilters)); } catch (_) {}
      const body = document.getElementById('insightTabBody');
      if (body) this._renderCompetence(body);
    },

    _renderCompSkeleton(body) {
      body.innerHTML = `
        <div class="insight-page mb-dash">
          <div class="mb-gauge-skeleton skeleton-shimmer" style="height:90px;"></div>
          <div style="height:1rem;"></div>
          ${BaseView.skeletonGrid ? BaseView.skeletonGrid(4) : ''}
        </div>`;
    },

    _buildCompetenciaHtml(data) {
      return `
        <div class="insight-page mb-dash" id="compPage">
          ${this._buildCompFiltersBar()}
          ${this._buildBattlefield(data?.kpis?.data, data?.top?.data)}
          ${this._buildWinningFormula(data?.intelligence?.data)}
          ${this._buildAudienceVoice(data?.voice?.data)}
          ${this._buildRivalRisk(data?.risk?.data)}
        </div>`;
    },

    _buildCompFiltersBar() {
      const f = this._compFilters || { windowDays: 99999 };
      const opts = [
        { v: 30, label: 'Últimos 30 días' },
        { v: 90, label: 'Últimos 90 días' },
        { v: 365, label: 'Últimos 12 meses' },
        { v: 99999, label: 'Todo el periodo' },
      ].map(o => `<option value="${o.v}"${Number(f.windowDays) === o.v ? ' selected' : ''}>${o.label}</option>`).join('');
      return `
        <header class="living-history-filters mb-filters-bar" id="compFilters">
          <div class="living-filter living-filter-window">
            <label class="living-filter-label" for="compFilterWindow">Ventana</label>
            <select class="living-filter-select" id="compFilterWindow" data-comp-filter="windowDays">${opts}</select>
          </div>
        </header>`;
    },

    /* ── 1. El campo de batalla: panorámica + ranking de rivales ──────── */
    _buildBattlefield(k, top) {
      const list = Array.isArray(top) ? top : [];
      const kpis = k || {};
      const sentMap = { positive: 'Positivo', negative: 'Negativo', neutral: 'Neutro' };
      const kpiCards = `
        <div class="comp-kpis">
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(kpis.active_competitors ?? kpis.total_competitors)}</span><span class="comp-kpi-lbl">Rivales activos</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${this._compactNum(kpis.total_engagement)}</span><span class="comp-kpi-lbl">Engagement del nicho</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${this._esc(this._prettyPlatform(kpis.dominant_platform))}</span><span class="comp-kpi-lbl">Plataforma dominante</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${this._esc(sentMap[kpis.dominant_sentiment] || kpis.dominant_sentiment || '—')}</span><span class="comp-kpi-lbl">Sentimiento dominante</span></div>
        </div>`;

      const rows = list.map((r, i) => {
        const tipo = this._compTipoMeta(r.tipo);
        return `
          <div class="comp-rank-row comp-clickable" data-comp-entity="${this._esc(r.entity_id)}" data-comp-name="${this._esc(r.entity_name)}" role="button" tabindex="0">
            <span class="comp-rank-pos">${i + 1}</span>
            <div class="comp-rank-name">
              <span class="comp-rank-brand">${this._esc(r.entity_name)}</span>
              <span class="comp-rank-tipo" style="--ct:${tipo.color};">${tipo.label}</span>
            </div>
            <span class="comp-rank-posts">${fmt.int(r.total_posts)} posts</span>
            <span class="comp-rank-eng">${this._compactNum(r.total_engagement)} eng</span>
            <span class="comp-rank-avg">${this._compactNum(r.avg_engagement_per_post)}/post</span>
          </div>`;
      }).join('');

      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">El campo de batalla</span>
            <span class="mb-section-hint">Quién domina la conversación de tu nicho</span>
          </div>
          ${kpiCards}
          ${list.length ? `<div class="comp-rank">${rows}</div>` : `<div class="mb-causal-empty">Sin rivales con actividad en la ventana.</div>`}
        </section>`;
    },

    /* ── 1b. Qué les funciona: la fórmula ganadora del nicho ──────────── */
    _buildWinningFormula(intel) {
      const combos = Array.isArray(intel?.winning_combos) ? intel.winning_combos.slice(0, 6) : [];
      if (!combos.length) { if (HIDE_EMPTY) return ''; return ''; }
      const cap = (s) => { const t = String(s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
      const rows = combos.map((c) => `
        <div class="comp-combo-row">
          <div class="comp-combo-dims">
            <span class="comp-combo-tag">${this._esc(cap(c.tone))}</span>
            <span class="comp-combo-sep">·</span>
            <span class="comp-combo-tag">${this._esc(cap(c.topic))}</span>
            <span class="comp-combo-sep">·</span>
            <span class="comp-combo-tag">${this._esc(cap(c.format))}</span>
          </div>
          <div class="comp-combo-meta">
            <span class="comp-combo-brands">${this._esc((Array.isArray(c.brands_using) ? c.brands_using : []).join(', '))} · ${fmt.int(c.posts_count)} posts</span>
            <span class="comp-combo-eng">${this._compactNum(c.avg_engagement)}/post</span>
          </div>
        </div>`).join('');
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">Qué les funciona</span>
            <span class="mb-section-hint">La fórmula ganadora de tu nicho — qué replicar o contraatacar</span>
          </div>
          <div class="comp-combos">${rows}</div>
        </section>`;
    },

    /* ── 2. La voz de su audiencia: pain points (el oro) ──────────────── */
    _buildAudienceVoice(voice) {
      const list = Array.isArray(voice) ? voice : [];
      if (!list.length) { if (HIDE_EMPTY) return ''; }
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">La voz de su audiencia</span>
            <span class="mb-section-hint">De qué se quejan sus seguidores — tu munición de contenido</span>
          </div>
          ${list.length ? `<div class="comp-voice-grid">${list.map(v => this._buildVoiceCard(v)).join('')}</div>`
            : `<div class="mb-causal-empty">Aún no hay comentarios analizados de tus rivales.</div>`}
        </section>`;
    },

    _buildVoiceCard(v) {
      const negPct = Number.isFinite(Number(v.neg_ratio)) ? Math.round(Number(v.neg_ratio) * 100) : 0;
      const posPct = Number.isFinite(Number(v.pos_ratio)) ? Math.round(Number(v.pos_ratio) * 100) : 0;
      const negs = (Array.isArray(v.sample_negative) ? v.sample_negative : []).filter(Boolean);
      const poss = (Array.isArray(v.sample_positive) ? v.sample_positive : []).filter(Boolean);
      const quote = (t) => `<li class="comp-voice-quote">${this._esc(t)}</li>`;
      return `
        <article class="comp-voice-card comp-clickable" data-comp-entity="${this._esc(v.entity_id)}" data-comp-name="${this._esc(v.entity_name)}" role="button" tabindex="0">
          <div class="comp-voice-head">
            <span class="comp-voice-name">${this._esc(v.entity_name)}</span>
            <span class="comp-voice-meta">${fmt.int(v.total_comments)} comentarios · <b style="color:#e06464;">${negPct}% neg</b> · ${posPct}% pos</span>
          </div>
          ${negs.length ? `
            <div class="comp-voice-block comp-voice-block--neg">
              <span class="comp-voice-label"><i class="fas fa-triangle-exclamation"></i> Se quejan de</span>
              <ul class="comp-voice-list">${negs.map(quote).join('')}</ul>
            </div>` : ''}
          ${poss.length ? `
            <div class="comp-voice-block comp-voice-block--pos">
              <span class="comp-voice-label"><i class="fas fa-heart"></i> Aman</span>
              <ul class="comp-voice-list">${poss.map(quote).join('')}</ul>
            </div>` : ''}
        </article>`;
    },

    /* ── 3. Vulnerabilidades del rival ────────────────────────────────── */
    _buildRivalRisk(risk) {
      const list = (Array.isArray(risk) ? risk : []).filter(r => Number(r.negative_sentiment_ratio) > 0 || Number(r.flags_count) > 0 || Number(r.high_risk_posts) > 0);
      if (!list.length) { if (HIDE_EMPTY) return ''; }
      const rows = list.map(r => {
        const neg = Math.round(Number(r.negative_sentiment_ratio || 0) * 100);
        return `
          <div class="comp-risk-row">
            <div class="comp-risk-name">
              <span class="comp-risk-brand">${this._esc(r.entity_name)}</span>
              ${r.description ? `<span class="comp-risk-desc">${this._esc(r.description)}</span>` : ''}
            </div>
            <div class="comp-risk-stats">
              ${neg > 0 ? `<span class="comp-risk-chip comp-risk-chip--neg">${neg}% negativo</span>` : ''}
              ${Number(r.high_risk_posts) > 0 ? `<span class="comp-risk-chip">${fmt.int(r.high_risk_posts)} posts de riesgo</span>` : ''}
              ${Number(r.flags_count) > 0 ? `<span class="comp-risk-chip">${fmt.int(r.flags_count)} flags</span>` : ''}
            </div>
          </div>`;
      }).join('');
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">Vulnerabilidades del rival</span>
            <span class="mb-section-hint">Rival con sentimiento negativo = momento de capturar su audiencia</span>
          </div>
          ${list.length ? `<div class="comp-risk-list">${rows}</div>` : `<div class="mb-causal-empty">Ningún rival muestra vulnerabilidad clara ahora.</div>`}
        </section>`;
    },

    _compTipoMeta(tipo) {
      return {
        competidor_directo:   { label: 'Directo',   color: '#e06464' },
        competidor_indirecto: { label: 'Indirecto', color: '#e0a045' },
        referencia_cultural:  { label: 'Referencia', color: '#5b9bd5' },
      }[tipo] || { label: tipo || '—', color: '#87868b' };
    },

    _bindCompetenceHandlers(body) {
      if (!body || body.dataset.compBound === '1') return;
      body.dataset.compBound = '1';
      body.addEventListener('change', (e) => {
        const el = e.target.closest('[data-comp-filter]');
        if (!el) return;
        this._onCompFilterChange({ windowDays: Number(el.value) || 99999 });
      });
      body.addEventListener('click', (e) => {
        const el = e.target.closest('[data-comp-entity]');
        if (!el) return;
        this._openCompetitorDetail(el.dataset.compEntity, el.dataset.compName);
      });
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest('[data-comp-entity]');
        if (!el) return;
        e.preventDefault();
        this._openCompetitorDetail(el.dataset.compEntity, el.dataset.compName);
      });
    },

    /* Drill-down: modal con las publicaciones de UN rival (reusa el modal de detalle). */
    async _openCompetitorDetail(entityId, name) {
      if (!entityId || !this._competenciaService) return;
      const { ov, dr } = this._ensureDetailDrawer();
      const titleEl = document.getElementById('mbDetailTitle');
      const subEl   = document.getElementById('mbDetailSub');
      const bodyEl  = document.getElementById('mbDetailBody');
      if (titleEl) titleEl.textContent = name || 'Rival';
      if (subEl)   subEl.textContent = 'Cargando…';
      if (bodyEl)  bodyEl.innerHTML = `<div class="mb-detail-loading"><i class="fas fa-circle-notch fa-spin"></i></div>`;
      ov.classList.add('active'); dr.classList.add('active');
      document.body.style.overflow = 'hidden';
      if (this._detailEscHandler) document.addEventListener('keydown', this._detailEscHandler);
      try {
        const win = this._compData?.window || {};
        const rows = await this._competenciaService.loadActorPosts(entityId, win.from, win.to, 30);
        const posts = rows.map((r) => ({
          network: r.network, content: r.content_preview, captured_at: r.captured_at,
          engagement_total: r.engagement_total, metrics: r.metrics, sentiment_text: r.sentiment_text,
        }));
        if (subEl) subEl.textContent = `${posts.length} ${posts.length === 1 ? 'publicacion' : 'publicaciones'}`;
        this._renderDetailPosts(bodyEl, posts);
      } catch (e) {
        console.error('[comp detail] load failed:', e?.message || e);
        if (subEl) subEl.textContent = '';
        if (bodyEl) bodyEl.innerHTML = `<div class="mb-detail-empty"><i class="fas fa-triangle-exclamation"></i><p>No se pudieron cargar las publicaciones.</p></div>`;
      }
    },
  });
})();
