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
    positivo: { label: 'Positivo', color: '#6e9f81' },
    positive: { label: 'Positivo', color: '#6e9f81' },
    negativo: { label: 'Negativo', color: '#b3796f' },
    negative: { label: 'Negativo', color: '#b3796f' },
    neutro:   { label: 'Neutro',   color: '#8a8a8e' },
    neutral:  { label: 'Neutro',   color: '#8a8a8e' },
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
        if (this._activeTab === 'tendencies' && !this._silentRefresh) this._renderHeroActions(); // filtros del banner (opciones de fuente)
        if (!this._shouldRepaint('tendencies', data)) return; // refresh silencioso sin cambios: no re-pintar
        body.innerHTML = this._buildTendenciasHtml(data);
        this._bindTendenciesHandlers(body);
      } catch (e) {
        console.error('[Tendencies] load failed:', e);
        if (this._silentRefresh) return; // fallo transitorio del polling: conservar la vista actual
        body.innerHTML = `<div class="insight-page" style="text-align:center;padding-top:4rem;color:var(--text-secondary);">${__('No se pudo cargar Tendencias.')} ${this._esc(e?.message || '')}</div>`;
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
      this._tendFilters = {
        windowDays: Number(stored?.windowDays) > 0 ? Number(stored.windowDays) : 90,
        source: stored?.source || '',
        dateFrom: stored?.dateFrom || null,
        dateTo:   stored?.dateTo   || null,
      };
      return this._tendFilters;
    },
    async _onTendFilterChange(patch) {
      this._tendFilters = { ...(this._tendFilters || {}), ...patch };
      try { localStorage.setItem(this._tendFiltersKey(), JSON.stringify(this._tendFilters)); } catch (_) {}
      const body = document.getElementById('insightTabBody');
      if (body) this._renderTendencies(body);
    },

    _renderTendSkeleton(body) {
      if (this._silentRefresh) return; // auto-refresh: conservar contenido hasta el swap
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
          ${this._buildTendPulse(data?.kpis?.data, data?.pulse?.data)}
          ${this._buildTendSignals(data?.signals?.data)}
          ${this._buildTendGaps(data?.gaps?.data)}
          ${this._buildTendLexicon(data?.lexicon?.data)}
          ${this._buildTendBrands(data?.brands?.data)}
          ${this._buildTendRealWorld(data?.world?.data)}
        </div>`;
    },

    _buildTendFiltersBar(data) {
      const f = this._tendFilters || { windowDays: 90, source: '' };

      // Tendencia = filtro por fuente de la señal (client-side sobre lo cargado).
      const sources = Array.isArray(data?.signals?.data?.by_source) ? data.signals.data.by_source : [];
      const srcOpts = [
        `<option value=""${!f.source ? ' selected' : ''}>${__('Todas las fuentes')}</option>`,
        ...sources.map(s => `<option value="${this._esc(s.source)}"${f.source === s.source ? ' selected' : ''}>${this._esc(this._prettyPlatform(s.source))}</option>`),
      ].join('');

      return `
        <header class="living-history-filters mb-filters-bar" id="tendFilters">
          ${this._tendFechaControl()}
          <div class="living-filter">
            <label class="living-filter-label" for="tendFilterSource">${__('Tendencia')}</label>
            <select class="living-filter-select" id="tendFilterSource" data-tend-filter="source">${srcOpts}</select>
          </div>
          ${this._reportDropdown()}
        </header>`;
    },

    _tendFechaControl() {
      if (typeof DateRangePicker !== 'function') {
        return `<div class="living-filter"><label class="living-filter-label">${__('Fecha')}</label>
          <select class="living-filter-select" disabled><option>${__('Últimos 90 días')}</option></select></div>`;
      }
      return this._ensureTendDatePicker().html();
    },
    _ensureTendDatePicker() {
      if (!this._tendDatePicker) {
        const f = this._tendFilters || {};
        this._tendDatePicker = new DateRangePicker({
          from: f.dateFrom || null, to: f.dateTo || null,
          allLabel: __('Últimos 90 días'),
          onChange: (r) => {
            // La RPC solo soporta "ultimos N dias": el rango se traduce a window_d
            // contando desde la fecha de inicio hasta hoy.
            let windowDays = 90;
            if (r.from) windowDays = Math.max(1, Math.ceil((Date.now() - new Date(r.from).getTime()) / 86400000));
            this._onTendFilterChange({
              dateFrom: r.from ? r.from.toISOString() : null,
              dateTo:   r.to   ? r.to.toISOString()   : null,
              windowDays,
            });
          },
        });
      }
      return this._tendDatePicker;
    },
    _mountTendDatePicker(scope) {
      if (typeof DateRangePicker !== 'function' || !this._tendDatePicker) return;
      const el = (scope || document).querySelector('[data-drp]');
      if (el) this._tendDatePicker.mount(el);
    },

    /* ── 1. Pulso del nicho: KPIs vivos + clima de sentimiento ────────── */
    _buildTendPulse(kpisWrap, pulse) {
      const k = (kpisWrap && kpisWrap.kpis) ? kpisWrap.kpis : {};
      const sent = (pulse && pulse.sentiment_breakdown) ? pulse.sentiment_breakdown : null;
      const kpiCards = `
        <div class="comp-kpis">
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(k.topicsTracked)}</span><span class="comp-kpi-lbl">${__('Señales rastreadas')}</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(k.velocityLast24h)}</span><span class="comp-kpi-lbl">${__('Velocidad 24h')}</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(k.lexiconApproved)}</span><span class="comp-kpi-lbl">${__('Palabras aprendidas')}</span></div>
          <div class="comp-kpi"><span class="comp-kpi-val">${fmt.int(k.emergingBrandsPending)}</span><span class="comp-kpi-lbl">${__('Marcas emergentes')}</span></div>
        </div>`;
      let climate = '';
      if (sent && Number(sent.total) > 0) {
        const total = Number(sent.total) || 1;
        const pos = Math.round((Number(sent.positivo) || 0) / total * 100);
        const neg = Math.round((Number(sent.negativo) || 0) / total * 100);
        const neu = Math.max(0, 100 - pos - neg);
        climate = `
          <div class="tend-climate">
            <span class="tend-climate-label">${__('Clima del nicho')}</span>
            <div class="tend-climate-bar">
              <span class="tend-climate-seg" style="width:${pos}%;background:var(--dash-pos,#6e9f81);" title="${__('Positivo {n}%', { n: pos })}"></span>
              <span class="tend-climate-seg" style="width:${neu}%;background:rgba(255,255,255,0.14);" title="${__('Neutro {n}%', { n: neu })}"></span>
              <span class="tend-climate-seg" style="width:${neg}%;background:var(--dash-neg,#b3796f);" title="${__('Negativo {n}%', { n: neg })}"></span>
            </div>
            <span class="tend-climate-legend">${__('{pos}% positivo · {neu}% neutro · {neg}% negativo · {total} señales', { pos: `<b style="color:var(--dash-pos,#6e9f81);">${pos}%</b>`, neu, neg: `<b style="color:var(--dash-neg,#b3796f);">${neg}%</b>`, total: fmt.int(sent.total) })}</span>
          </div>`;
      }
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">${__('Pulso del nicho')}</span>
            <span class="mb-section-hint">${__('Lo que se mueve afuera — la mirada externa de Vera')}</span>
          </div>
          ${kpiCards}
          ${climate}
        </section>`;
    },

    /* ── 2. Señales emergentes: keywords con velocidad (filtradas) ─────── */
    _buildTendSignals(signals) {
      const raw = Array.isArray(signals?.top_velocity) ? signals.top_velocity : [];
      const srcFilter = this._tendFilters?.source || '';
      const list = raw
        .filter(s => Number(s.relevance_score) >= MIN_SIGNAL_RELEVANCE)
        .filter(s => !srcFilter || s.source === srcFilter)
        .slice(0, 24);
      const bySource = Array.isArray(signals?.by_source) ? signals.by_source : [];
      const head = `
        <div class="mb-section-head">
          <span class="mb-section-title">${__('Señales emergentes del nicho')}</span>
          <span class="mb-section-hint">${__('Temas que aceleran afuera — ordenados por velocidad, filtrados por calidad')}</span>
        </div>`;
      if (!list.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">${__('Sin señales de calidad en esta ventana. El motor de tendencias fue recalibrado; las próximas corridas (cuando se reactiven los scrapers) poblarán esto con señales reales del nicho.')}</div>
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
          <span class="mb-section-title">${__('Océanos azules')}</span>
          <span class="mb-section-hint">${__('El mercado lo pide y tu competencia no lo cubre — terreno libre para capturar')}</span>
        </div>`;
      if (!list.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">${__('Aún no hay señal de demanda suficiente para detectar océanos azules. Se enciende cuando los sensores de audiencia (Google Trends, noticias del nicho) vuelvan a correr.')}</div>
          </section>`;
      }
      const cards = list.map((g) => {
        const blue = g.is_blue_ocean === true || Number(g.competitor_post_count) === 0;
        const mb = g.market_breakdown || {};
        const aud = Array.isArray(g.sample_audience_searches) ? g.sample_audience_searches.filter(Boolean) : [];
        const news = Array.isArray(g.sample_news) ? g.sample_news.filter(Boolean) : [];
        const samples = [...aud.slice(0, 2).map(a => a?.sample), ...news.slice(0, 1).map(n => n?.sample)].filter(Boolean);
        const breakdown = [
          Number(mb.trend_topics) > 0 ? __('{n} en redes', { n: fmt.int(mb.trend_topics) }) : '',
          Number(mb.audience_demand) > 0 ? __('{n} búsquedas', { n: fmt.int(mb.audience_demand) }) : '',
          Number(mb.targeted_news) > 0 ? __('{n} noticias', { n: fmt.int(mb.targeted_news) }) : '',
        ].filter(Boolean).join(' · ');
        return `
          <article class="tend-gap-card${blue ? ' tend-gap-card--blue' : ''}">
            <div class="tend-gap-head">
              <span class="tend-gap-topic">${this._esc(g.topic_label || g.topic)}</span>
              ${blue ? `<span class="tend-gap-badge"><i class="fas fa-water"></i> ${__('Océano azul')}</span>` : `<span class="tend-gap-cover">${__('{n} posts de rivales', { n: fmt.int(g.competitor_post_count) })}</span>`}
            </div>
            ${g.topic_description ? `<p class="tend-gap-desc">${this._esc(g.topic_description)}</p>` : ''}
            <div class="tend-gap-stats">
              <span class="tend-gap-stat">${__('{n} señales de mercado', { n: `<b>${fmt.int(g.market_signal_count)}</b>` })}${breakdown ? ` <span class="tend-gap-bd">(${breakdown})</span>` : ''}</span>
            </div>
            ${samples.length ? `<ul class="tend-gap-samples">${samples.map(s => `<li>${this._esc(s)}</li>`).join('')}</ul>` : ''}
          </article>`;
      }).join('');
      const note = Number(totals.topics_with_zero_competitor_coverage) > 0
        ? `<div class="tend-gaps-note">${__('{a} de {b} temas con demanda no tienen NINGÚN rival cubriéndolos.', { a: fmt.int(totals.topics_with_zero_competitor_coverage), b: fmt.int(totals.topics_with_market_signal) })}</div>`
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
          <span class="mb-section-title">${__('Léxico emergente del nicho')}</span>
          <span class="mb-section-hint">${__('Las palabras que Vera aprendió escuchando tu nicho — el idioma con el que debes hablarle')}</span>
        </div>`;
      if (!approved.length && !byDim.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">${__('Vera aún no ha consolidado vocabulario del nicho.')}</div>
          </section>`;
      }
      const dims = byDim.map(d => `
        <div class="tend-dim">
          <span class="tend-dim-name">${this._esc(this._tendDimLabel(d.dimension))}</span>
          <span class="tend-dim-counts">${__('{n} aprendidas', { n: `<b>${fmt.int(d.approved)}</b>` })}${Number(d.proposed) > 0 ? __(' · {n} en revisión', { n: fmt.int(d.proposed) }) : ''}</span>
        </div>`).join('');
      const words = approved.map(w => `<span class="tend-word">${this._esc(w.word)}<span class="tend-word-dim">${this._esc(this._tendDimLabel(w.dimension))}</span></span>`).join('');
      const pendNote = pending.length
        ? `<div class="tend-lex-note"><i class="fas fa-hourglass-half"></i> ${__('{n} palabra(s) nuevas esperando tu revisión en el Léxico.', { n: fmt.int(pending.length) })}</div>`
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
        topic: __('Tema'), tone: __('Tono'), format: __('Formato'), mood: __('Ánimo'),
        emotion: __('Emoción'), style: __('Estilo'), audience: __('Audiencia'),
        cluster_candidate: __('Clúster nuevo'),
      }[dim] || (dim ? String(dim).replace(/_/g, ' ') : '—');
    },

    /* ── 5. Marcas emergentes: nuevos jugadores en el nicho ───────────── */
    _buildTendBrands(brands) {
      const pending = Array.isArray(brands?.pending) ? brands.pending : [];
      const head = `
        <div class="mb-section-head">
          <span class="mb-section-title">${__('Marcas emergentes')}</span>
          <span class="mb-section-hint">${__('Nuevos jugadores que Vera detectó entrando a tu nicho — vigílalos antes de que crezcan')}</span>
        </div>`;
      if (!pending.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">${__('Sin marcas emergentes pendientes. Vera avisará cuando un jugador nuevo aparezca repetidamente en tu nicho.')}</div>
          </section>`;
      }
      const cards = pending.slice(0, 12).map((b) => {
        const geos = Array.isArray(b.detected_geos) ? b.detected_geos.filter(Boolean) : [];
        return `
          <article class="tend-brand-card">
            <div class="tend-brand-head">
              <span class="tend-brand-name">${this._esc(b.candidate_name)}</span>
              <span class="tend-brand-count">${__('{n}× detectada', { n: fmt.int(b.detection_count) })}</span>
            </div>
            <div class="tend-brand-meta">
              ${b.niche ? `<span class="tend-brand-niche">${this._esc(b.niche)}</span>` : ''}
              ${geos.length ? `<span class="tend-brand-geo"><i class="fas fa-location-dot"></i> ${this._esc(geos.slice(0, 3).join(', '))}</span>` : ''}
              ${Number(b.best_rank_position) > 0 ? `<span class="tend-brand-rank">${__('mejor posición #{n}', { n: fmt.int(b.best_rank_position) })}</span>` : ''}
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
          <span class="mb-section-title">${__('Sincronización con el mundo')}</span>
          <span class="mb-section-hint">${__('Festivos, efemérides y clima — para que tu contenido llegue cuando el mundo está mirando')}</span>
        </div>`;
      if (!holidays.length && !history.length) {
        return `
          <section class="mb-section">
            ${head}
            <div class="mb-causal-empty">${__('Los sensores del mundo real (festivos, efemérides, clima) están en pausa. Se encenderán con la próxima activación de scrapers y te avisarán de fechas clave con anticipación.')}</div>
          </section>`;
      }
      const holRows = holidays.slice(0, 8).map((h) => `
        <div class="tend-world-row">
          <span class="tend-world-when">${Number(h.days_until) >= 0 ? __('en {n} día(s)', { n: fmt.int(h.days_until) }) : '—'}</span>
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
        const key = el.dataset.tendFilter;
        if (key === 'windowDays') this._onTendFilterChange({ windowDays: Number(el.value) || 90 });
        else if (key === 'source') this._onTendFilterChange({ source: el.value || '' });
      });
    },
  });
})();
