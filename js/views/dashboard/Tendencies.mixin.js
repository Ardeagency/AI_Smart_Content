/**
 * DashboardView — Tendencies mixin (tab "Tendencias").
 *
 * Lente = el MUNDO y el NICHO (la mirada externa de Vera). Distinta a Mi Marca
 * (lo que TU haces) y a Competencia (lo que hacen tus rivales). Aqui se lee lo
 * que se mueve afuera y aun nadie capitaliza. Secciones:
 *   1. Pulso del nicho     — KPIs vivos + clima de sentimiento del mercado
 *   2. Señales emergentes  — keywords con velocidad (filtradas por calidad)
 *   3. Oceanos azules      — el mercado habla / la competencia no cubre (gaps)
 *   4. Lexico emergente    — el idioma del nicho que Vera esta aprendiendo
 *   5. Marcas emergentes   — nuevos jugadores detectados entrando al nicho
 *   6. Sincronizacion mundo— festivos, efemerides y clima (sensores del mundo)
 *
 * Datos: TendenciasDataService (RPCs dashboard_tendencias_*). Reusa helpers
 * compartidos del prototype (_esc, _compactNum, _prettyPlatform).
 *
 * Nota: los scrapers estan en pausa (control de costo Apify). El dashboard lee
 * la data actual y deja cada seccion con un estado vacio honesto que se
 * encendera solo cuando los sensores se reactiven.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const MIN_SIGNAL_RELEVANCE = 0.45; // filtra ruido pre-recalibracion del motor
  const fmt = { int: (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO')) };
  const SENT = {
    positivo: { label: 'Positivo', color: '#6bcf7f' },
    positive: { label: 'Positivo', color: '#6bcf7f' },
    negativo: { label: 'Negativo', color: '#e06464' },
    negative: { label: 'Negativo', color: '#e06464' },
    neutro:   { label: 'Neutro',   color: '#87868b' },
    neutral:  { label: 'Neutro',   color: '#87868b' },
  };

  Object.assign(DashboardView.prototype, {

    async _renderTendencies(body) {
      if (!body) return;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return; }
      await this._ensureTendenciasService();
      this._restoreTendFilters();
      this._renderTendSkeleton(body);
      try {
        this._tendenciasService.setWindow(this._tendFilters.windowDays);
        const data = await this._tendenciasService.loadAll();
        this._tendData = data;
        body.innerHTML = this._buildTendenciasHtml(data);
        this._bindTendenciesHandlers(body);
      } catch (e) {
        console.error('[Tendencies] load failed:', e);
        body.innerHTML = `<div class="insight-page" style="text-align:center;padding-top:4rem;color:var(--text-secondary);">No se pudo cargar Tendencias. ${this._esc(e?.message || '')}</div>`;
      }
    },

    async _ensureTendenciasService() {
      if (this._tendenciasService) return this._tendenciasService;
      if (typeof TendenciasDataService !== 'function' || !this._supabase) return null;
      this._tendenciasService = new TendenciasDataService();
      await this._tendenciasService.init(this._supabase, this._orgId);
      return this._tendenciasService;
    },

    _tendFiltersKey() { return `tend:filters:v1:${this._orgId || 'global'}`; },
    _restoreTendFilters() {
      if (this._tendFilters) return this._tendFilters;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(this._tendFiltersKey()) || 'null'); } catch (_) {}
      this._tendFilters = { windowDays: Number(stored?.windowDays) > 0 ? Number(stored.windowDays) : 90 };
      return this._tendFilters;
    },
    async _onTendFilterChange(patch) {
      this._tendFilters = { ...(this._tendFilters || {}), ...patch };
      try { localStorage.setItem(this._tendFiltersKey(), JSON.stringify(this._tendFilters)); } catch (_) {}
      const body = document.getElementById('insightTabBody');
      if (body) this._renderTendencies(body);
    },

    _renderTendSkeleton(body) {
      body.innerHTML = `
        <div class="insight-page mb-dash">
          <div class="mb-gauge-skeleton skeleton-shimmer" style="height:90px;"></div>
          <div style="height:1rem;"></div>
          ${BaseView.skeletonGrid ? BaseView.skeletonGrid(4) : ''}
        </div>`;
    },

    _buildTendenciasHtml(data) {
      return `
        <div class="insight-page mb-dash" id="tendPage">
          ${this._buildTendFiltersBar()}
          ${this._buildTendPulse(data?.kpis?.data, data?.pulse?.data)}
          ${this._buildTendSignals(data?.signals?.data)}
          ${this._buildTendGaps(data?.gaps?.data)}
          ${this._buildTendLexicon(data?.lexicon?.data)}
          ${this._buildTendBrands(data?.brands?.data)}
          ${this._buildTendRealWorld(data?.world?.data)}
        </div>`;
    },

    _buildTendFiltersBar() {
      const f = this._tendFilters || { windowDays: 90 };
      const opts = [
        { v: 30, label: 'Últimos 30 días' },
        { v: 90, label: 'Últimos 90 días' },
        { v: 365, label: 'Últimos 12 meses' },
      ].map(o => `<option value="${o.v}"${Number(f.windowDays) === o.v ? ' selected' : ''}>${o.label}</option>`).join('');
      return `
        <header class="living-history-filters mb-filters-bar" id="tendFilters">
          <div class="living-filter living-filter-window">
            <label class="living-filter-label" for="tendFilterWindow">Ventana</label>
            <select class="living-filter-select" id="tendFilterWindow" data-tend-filter="windowDays">${opts}</select>
          </div>
        </header>`;
    },

    /* ── 1. Pulso del nicho: KPIs vivos + clima de sentimiento ────────── */
    _buildTendPulse(kpisWrap, pulse) {
      const k = (kpisWrap && kpisWrap.kpis) ? kpisWrap.kpis : {};
      const sent = (pulse && pulse.sentiment_breakdown) ? pulse.sentiment_breakdown : null;
      const kpiCards = `
        <div class="comp-kpis">
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(k.topicsTracked)}</span><span class="comp-kpi-lbl">Señales rastreadas</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(k.velocityLast24h)}</span><span class="comp-kpi-lbl">Velocidad 24h</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(k.lexiconApproved)}</span><span class="comp-kpi-lbl">Palabras aprendidas</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(k.emergingBrandsPending)}</span><span class="comp-kpi-lbl">Marcas emergentes</span></div>
        </div>`;
      let climate = '';
      if (sent && Number(sent.total) > 0) {
        const total = Number(sent.total) || 1;
        const pos = Math.round((Number(sent.positivo) || 0) / total * 100);
        const neg = Math.round((Number(sent.negativo) || 0) / total * 100);
        const neu = Math.max(0, 100 - pos - neg);
        climate = `
          <div class="tend-climate">
            <span class="tend-climate-label">Clima del nicho</span>
            <div class="tend-climate-bar">
              <span class="tend-climate-seg" style="width:${pos}%;background:#6bcf7f;" title="Positivo ${pos}%"></span>
              <span class="tend-climate-seg" style="width:${neu}%;background:#3a3a3d;" title="Neutro ${neu}%"></span>
              <span class="tend-climate-seg" style="width:${neg}%;background:#e06464;" title="Negativo ${neg}%"></span>
            </div>
            <span class="tend-climate-legend"><b style="color:#6bcf7f;">${pos}%</b> positivo · ${neu}% neutro · <b style="color:#e06464;">${neg}%</b> negativo · ${fmt.int(sent.total)} señales</span>
          </div>`;
      }
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">Pulso del nicho</span>
            <span class="mb-section-hint">Lo que se mueve afuera — la mirada externa de Vera</span>
          </div>
          ${kpiCards}
          ${climate}
        </section>`;
    },

    /* ── 2. Señales emergentes: keywords con velocidad (filtradas) ─────── */
    _buildTendSignals(signals) {
      const raw = Array.isArray(signals?.top_velocity) ? signals.top_velocity : [];
      const list = raw
        .filter(s => Number(s.relevance_score) >= MIN_SIGNAL_RELEVANCE)
        .slice(0, 24);
      const bySource = Array.isArray(signals?.by_source) ? signals.by_source : [];
      const head = `
        <div class="mb-section-head">
          <span class="mb-section-title">Señales emergentes del nicho</span>
          <span class="mb-section-hint">Temas que aceleran afuera — ordenados por velocidad, filtrados por calidad</span>
        </div>`;
      if (!list.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">Sin señales de calidad en esta ventana. El motor de tendencias fue recalibrado; las próximas corridas (cuando se reactiven los scrapers) poblarán esto con señales reales del nicho.</div>
          </section>`;
      }
      const chips = list.map((s) => {
        const sm = SENT[String(s.sentiment || '').toLowerCase()] || null;
        const vel = Number(s.velocity_score);
        return `
          <div class="tend-signal" title="relevancia ${Number(s.relevance_score).toFixed(2)}">
            <span class="tend-signal-kw">${this._esc(s.keyword)}</span>
            <span class="tend-signal-meta">
              <span class="tend-signal-src">${this._esc(this._prettyPlatform(s.source))}</span>
              ${Number.isFinite(vel) ? `<span class="tend-signal-vel"><i class="fas fa-bolt"></i> ${vel.toFixed(0)}</span>` : ''}
              ${sm ? `<span class="tend-signal-sent" style="color:${sm.color};">${sm.label}</span>` : ''}
            </span>
          </div>`;
      }).join('');
      const srcLine = bySource.length
        ? `<div class="tend-source-line">${bySource.slice(0, 6).map(s => `<span class="tend-source-pill">${this._esc(this._prettyPlatform(s.source))} · ${fmt.int(s.total)}</span>`).join('')}</div>`
        : '';
      return `
        <section class="mb-section">
          ${head}
          <div class="tend-signals">${chips}</div>
          ${srcLine}
        </section>`;
    },

    /* ── 3. Oceanos azules: el mercado habla / la competencia no cubre ── */
    _buildTendGaps(gaps) {
      const list = (Array.isArray(gaps?.gaps) ? gaps.gaps : [])
        .filter(g => Number(g.market_signal_count) > 0)
        .slice(0, 8);
      const totals = gaps?.totals || {};
      const head = `
        <div class="mb-section-head">
          <span class="mb-section-title">Océanos azules</span>
          <span class="mb-section-hint">El mercado lo pide y tu competencia no lo cubre — terreno libre para capturar</span>
        </div>`;
      if (!list.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">Aún no hay señal de demanda suficiente para detectar océanos azules. Se enciende cuando los sensores de audiencia (Google Trends, noticias del nicho) vuelvan a correr.</div>
          </section>`;
      }
      const cards = list.map((g) => {
        const blue = g.is_blue_ocean === true || Number(g.competitor_post_count) === 0;
        const mb = g.market_breakdown || {};
        const aud = Array.isArray(g.sample_audience_searches) ? g.sample_audience_searches.filter(Boolean) : [];
        const news = Array.isArray(g.sample_news) ? g.sample_news.filter(Boolean) : [];
        const samples = [...aud.slice(0, 2).map(a => a?.sample), ...news.slice(0, 1).map(n => n?.sample)].filter(Boolean);
        const breakdown = [
          Number(mb.trend_topics) > 0 ? `${fmt.int(mb.trend_topics)} en redes` : '',
          Number(mb.audience_demand) > 0 ? `${fmt.int(mb.audience_demand)} búsquedas` : '',
          Number(mb.targeted_news) > 0 ? `${fmt.int(mb.targeted_news)} noticias` : '',
        ].filter(Boolean).join(' · ');
        return `
          <article class="tend-gap-card${blue ? ' tend-gap-card--blue' : ''}">
            <div class="tend-gap-head">
              <span class="tend-gap-topic">${this._esc(g.topic_label || g.topic)}</span>
              ${blue ? `<span class="tend-gap-badge"><i class="fas fa-water"></i> Océano azul</span>` : `<span class="tend-gap-cover">${fmt.int(g.competitor_post_count)} posts de rivales</span>`}
            </div>
            ${g.topic_description ? `<p class="tend-gap-desc">${this._esc(g.topic_description)}</p>` : ''}
            <div class="tend-gap-stats">
              <span class="tend-gap-stat"><b>${fmt.int(g.market_signal_count)}</b> señales de mercado${breakdown ? ` <span class="tend-gap-bd">(${breakdown})</span>` : ''}</span>
            </div>
            ${samples.length ? `<ul class="tend-gap-samples">${samples.map(s => `<li>${this._esc(s)}</li>`).join('')}</ul>` : ''}
          </article>`;
      }).join('');
      const note = Number(totals.topics_with_zero_competitor_coverage) > 0
        ? `<div class="tend-gaps-note">${fmt.int(totals.topics_with_zero_competitor_coverage)} de ${fmt.int(totals.topics_with_market_signal)} temas con demanda no tienen NINGÚN rival cubriéndolos.</div>`
        : '';
      return `
        <section class="mb-section">
          ${head}
          ${note}
          <div class="tend-gaps">${cards}</div>
        </section>`;
    },

    /* ── 4. Lexico emergente: el idioma del nicho que Vera aprende ─────── */
    _buildTendLexicon(lex) {
      const byDim = Array.isArray(lex?.by_dimension) ? lex.by_dimension : [];
      const approved = Array.isArray(lex?.recent_approved) ? lex.recent_approved.slice(0, 24) : [];
      const pending = Array.isArray(lex?.pending) ? lex.pending : [];
      const head = `
        <div class="mb-section-head">
          <span class="mb-section-title">Léxico emergente del nicho</span>
          <span class="mb-section-hint">Las palabras que Vera aprendió escuchando tu nicho — el idioma con el que debes hablarle</span>
        </div>`;
      if (!approved.length && !byDim.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">Vera aún no ha consolidado vocabulario del nicho.</div>
          </section>`;
      }
      const dims = byDim.map(d => `
        <div class="tend-dim">
          <span class="tend-dim-name">${this._esc(this._tendDimLabel(d.dimension))}</span>
          <span class="tend-dim-counts"><b>${fmt.int(d.approved)}</b> aprendidas${Number(d.proposed) > 0 ? ` · ${fmt.int(d.proposed)} en revisión` : ''}</span>
        </div>`).join('');
      const words = approved.map(w => `<span class="tend-word">${this._esc(w.word)}<span class="tend-word-dim">${this._esc(this._tendDimLabel(w.dimension))}</span></span>`).join('');
      const pendNote = pending.length
        ? `<div class="tend-lex-note"><i class="fas fa-hourglass-half"></i> ${fmt.int(pending.length)} palabra(s) nuevas esperando tu revisión en el Léxico.</div>`
        : '';
      return `
        <section class="mb-section">
          ${head}
          ${dims ? `<div class="tend-dims">${dims}</div>` : ''}
          ${words ? `<div class="tend-words">${words}</div>` : ''}
          ${pendNote}
        </section>`;
    },

    _tendDimLabel(dim) {
      return {
        topic: 'Tema', tone: 'Tono', format: 'Formato', mood: 'Ánimo',
        emotion: 'Emoción', style: 'Estilo', audience: 'Audiencia',
        cluster_candidate: 'Clúster nuevo',
      }[dim] || (dim ? String(dim).replace(/_/g, ' ') : '—');
    },

    /* ── 5. Marcas emergentes: nuevos jugadores en el nicho ───────────── */
    _buildTendBrands(brands) {
      const pending = Array.isArray(brands?.pending) ? brands.pending : [];
      const head = `
        <div class="mb-section-head">
          <span class="mb-section-title">Marcas emergentes</span>
          <span class="mb-section-hint">Nuevos jugadores que Vera detectó entrando a tu nicho — vigílalos antes de que crezcan</span>
        </div>`;
      if (!pending.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">Sin marcas emergentes pendientes. Vera avisará cuando un jugador nuevo aparezca repetidamente en tu nicho.</div>
          </section>`;
      }
      const cards = pending.slice(0, 12).map((b) => {
        const geos = Array.isArray(b.detected_geos) ? b.detected_geos.filter(Boolean) : [];
        return `
          <article class="tend-brand-card">
            <div class="tend-brand-head">
              <span class="tend-brand-name">${this._esc(b.candidate_name)}</span>
              <span class="tend-brand-count">${fmt.int(b.detection_count)}× detectada</span>
            </div>
            <div class="tend-brand-meta">
              ${b.niche ? `<span class="tend-brand-niche">${this._esc(b.niche)}</span>` : ''}
              ${geos.length ? `<span class="tend-brand-geo"><i class="fas fa-location-dot"></i> ${this._esc(geos.slice(0, 3).join(', '))}</span>` : ''}
              ${Number(b.best_rank_position) > 0 ? `<span class="tend-brand-rank">mejor posición #${fmt.int(b.best_rank_position)}</span>` : ''}
            </div>
          </article>`;
      }).join('');
      return `
        <section class="mb-section">
          ${head}
          <div class="tend-brands">${cards}</div>
        </section>`;
    },

    /* ── 6. Sincronizacion con el mundo: festivos, efemerides, clima ──── */
    _buildTendRealWorld(world) {
      const holidays = Array.isArray(world?.upcoming_holidays) ? world.upcoming_holidays : [];
      const history  = Array.isArray(world?.today_history) ? world.today_history : [];
      const head = `
        <div class="mb-section-head">
          <span class="mb-section-title">Sincronización con el mundo</span>
          <span class="mb-section-hint">Festivos, efemérides y clima — para que tu contenido llegue cuando el mundo está mirando</span>
        </div>`;
      if (!holidays.length && !history.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">Los sensores del mundo real (festivos, efemérides, clima) están en pausa. Se encenderán con la próxima activación de scrapers y te avisarán de fechas clave con anticipación.</div>
          </section>`;
      }
      const holRows = holidays.slice(0, 8).map((h) => `
        <div class="tend-world-row">
          <span class="tend-world-when">${Number(h.days_until) >= 0 ? `en ${fmt.int(h.days_until)} día(s)` : '—'}</span>
          <div class="tend-world-body">
            <span class="tend-world-name">${this._esc(h.event_name)}</span>
            ${h.geo ? `<span class="tend-world-geo">${this._esc(h.geo)}</span>` : ''}
          </div>
        </div>`).join('');
      return `
        <section class="mb-section">
          ${head}
          ${holRows ? `<div class="tend-world-list">${holRows}</div>` : ''}
        </section>`;
    },

    _bindTendenciesHandlers(body) {
      if (!body || body.dataset.tendBound === '1') return;
      body.dataset.tendBound = '1';
      body.addEventListener('change', (e) => {
        const el = e.target.closest('[data-tend-filter]');
        if (!el) return;
        this._onTendFilterChange({ windowDays: Number(el.value) || 90 });
      });
    },
  });
})();
