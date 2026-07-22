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
 * Nota: los scrapers estan en pausa (control de costo). El dashboard lee
 * la data actual y deja cada seccion con un estado vacio honesto que se
 * encendera solo cuando los sensores se reactiven.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const fmt = { int: (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO')) };
  Object.assign(DashboardView.prototype, {

    async _renderTendencies(body) {
      if (!body) return;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return; }
      // REDISEÑO VERA 2026-07: la lectura de Vera ES el tab (legacy oculto abajo).
      // Mientras el cuerpo nuevo se diseña, "Próximas Fechas" es la ÚNICA pieza que
      // se pinta: tiene fuente viva propia (real_world_signals, calendario del
      // mercado) y no depende del pipeline legacy. Ver _renderTendFechasOnly.
      if (this._renderVeraTabBody) {
        await this._renderVeraTabBody(body, 'tendencias');
        await this._renderTendFechasOnly(body);
        return;
      }
      await this._ensureTendenciasService();
      this._restoreTendFilters();
      this._renderTendSkeleton(body);
      try {
        this._tendenciasService.setWindow(this._tendFilters.windowDays);
        const [data] = await Promise.all([
          this._tendenciasService.loadAll(),
          this._loadVeraReading?.('tendencias'),   // lectura de Vera (null → fallback al hero actual)
        ]);
        this._tendData = data;
        if (this._activeTab === 'tendencies') {
          this._renderHeroCards();                             // cards del hero = pulso del nicho
          if (!this._silentRefresh) this._renderHeroActions(); // filtros del banner (opciones de fuente)
        }
        if (!this._shouldRepaint('tendencies', data)) return; // refresh silencioso sin cambios: no re-pintar
        body.innerHTML = this._buildTendenciasHtml(data);
        this._bindTendenciesHandlers(body);
        this._bindVeraBand?.(body);
      } catch (e) {
        console.error('[Tendencies] load failed:', e);
        if (this._silentRefresh) return; // fallo transitorio del polling: conservar la vista actual
        body.innerHTML = `<div class="insight-page" style="text-align:center;padding-top:4rem;color:var(--text-secondary);">${__('No se pudo cargar Tendencias.')} ${this._esc(e?.message || '')}</div>`;
      }
    },

    /* ── Próximas Fechas en solitario (mientras el tab está en rediseño) ──
       Pinta SOLO la card del calendario dentro del cuerpo que dejó vacío
       _renderVeraTabBody. Dispara un único RPC (no loadAll: las otras 4 secciones
       no se muestran, no se pagan). Nunca lanza: si falla, el tab queda como
       estaba. Misma fuente que la tool getUpcomingDates de Vera. */
    async _renderTendFechasOnly(body) {
      if (!body || !this._supabase || !this._orgId) return;
      let world;   // sin valor inicial: el catch retorna, nunca se lee sin asignar
      try {
        const { data, error } = await this._supabase.rpc('dashboard_tendencias_real_world', {
          p_org_id: this._orgId, p_lookahead_days: 90, p_limit_holidays: 16, p_limit_history: 0,
        });
        if (error) throw error;
        world = data;
      } catch (e) {
        console.warn('[Tendencies] fechas load failed:', e?.message || e);
        return;
      }
      const card = this._buildTendFechasCard(world);
      if (!card) return;                       // sin fechas futuras → nada que mostrar
      body.innerHTML = `
        <div class="insight-page mb-dash" id="tendPage">
          <div class="mb-layout-aside" style="max-width:340px;">${card}</div>
        </div>`;
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
      const aside = this._buildTendFechasCard(data?.world?.data);
      // Demanda de busqueda (izq, mas ancho) + Señales emergentes (der). Si falta
      // una, la otra ocupa la fila completa.
      const demand = this._buildTendDemand(data?.demand?.data);
      const signals = this._buildTendSignals(data?.signals?.data);
      const topRow = (demand && signals)
        ? `<div class="tend-2col">${demand}${signals}</div>`
        : (demand || signals || '');
      const main = `
        ${topRow}
        ${this._buildTendGaps(data?.gaps?.data)}
        ${this._buildTendLexicon(data?.lexicon?.data)}
        ${this._buildTendBrands(data?.brands?.data)}`;
      // Con fechas -> layout 2 columnas (cuerpo + sidebar "Proximas Fechas", igual
      // que Mi Marca/Competencia). Sin fechas -> cuerpo a ancho completo.
      const body = aside
        ? `<div class="mb-layout"><div class="tend-main">${main}</div><aside class="mb-layout-aside">${aside}</aside></div>`
        : main;
      return `
        <div class="insight-page mb-dash" id="tendPage">
          ${this._buildTendenciesStatusHero(data)}
          ${body}
        </div>`;
    },

    /* ── Estado del nicho (banner ejecutivo sobre las secciones de Tendencias) ──
       Reempaqueta lo que Vera ve AFUERA (senales con velocidad + oceanos azules
       + calendario del mundo) YA cargado en una lectura de CMO: veredicto = pulso
       del nicho + diagnostico dinamico + pruebas verificables. NO dispara RPC:
       reusa _computeTendenciesCards. Se oculta en blanco total si no hay ninguna
       senal/gap/evento real (scrapers en pausa). Doctrina: cada ocasion = Category
       Entry Point; estar donde la gente busca (SEO/GEO) antes que la competencia. */
    _buildTendenciesStatusHero(data) {
      // Lectura de Vera (vera_dashboard_readings): si existe, ES el banner —
      // cmo_brief y el template rule-based quedan como fallback.
      const vband = this._buildVeraBandHtml?.('tendencias');
      if (vband) return vband;
      const brief = data?.cmoBrief?.data;
      const cards = (typeof this._computeTendenciesCards === 'function')
        ? this._computeTendenciesCards(data) : {};
      const hasHot   = !!cards.funciona;
      const hasBlue  = !!cards.oportunidad;
      const hasEvent = !!cards.riesgo;
      if (!hasHot && !hasBlue && !hasEvent) return '';

      const signals = Array.isArray(data?.signals?.data?.top_velocity) ? data.signals.data.top_velocity : [];
      const hot = [...signals].sort((a, b) => Number(b.velocity_score) - Number(a.velocity_score))[0] || null;

      const gaps = Array.isArray(data?.gaps?.data?.gaps) ? data.gaps.data.gaps : [];
      const realGaps = gaps.filter((g) => Number(g.market_signal_count) > 0);
      const blueList = realGaps.filter((g) => g.is_blue_ocean === true || Number(g.competitor_post_count) === 0);
      const blue = [...blueList].sort((a, b) => Number(a.competitor_post_count || 0) - Number(b.competitor_post_count || 0))[0] || null;

      const holidays = Array.isArray(data?.world?.data?.upcoming_holidays) ? data.world.data.upcoming_holidays : [];
      const nextEv = [...holidays].sort((a, b) => Number(a.days_until) - Number(b.days_until))[0] || null;

      let lvl, label;
      if (hasHot && hasBlue)      { lvl = 'good'; label = __('caliente'); }
      else if (hasHot || hasBlue) { lvl = 'mid';  label = __('en movimiento'); }
      else                        { lvl = 'low';  label = __('en calma'); }

      let titleTail, desc;
      if (hot && blue) {
        titleTail = __('"{k}" esta en tendencia y "{t}" sigue sin dueno', { k: hot.theme, t: blue.topic_label || blue.topic });
        desc = __('"{k}" esta haciendo boom en tu nicho y "{t}" tiene demanda que ningun rival cubre. Cada momento es un Category Entry Point: crea contenido ahora, mientras el tema esta caliente y el terreno libre — asi capturas la ola antes que la competencia.', {
          k: hot.theme, t: blue.topic_label || blue.topic,
        });
      } else if (hot) {
        titleTail = __('"{k}" esta en tendencia en tu nicho', { k: hot.theme });
        desc = __('"{k}" esta haciendo boom en tu nicho ahora. Es un momento fresco que tu audiencia esta viviendo: crea contenido para aprovecharlo mientras esta caliente.', {
          k: hot.theme,
        });
      } else if (blue) {
        const zero = Number(blue.competitor_post_count) === 0;
        titleTail = zero
          ? __('"{t}" — nadie lo cubre todavia', { t: blue.topic_label || blue.topic })
          : __('"{t}" esta subexplotado', { t: blue.topic_label || blue.topic });
        desc = __('El mercado pide "{t}" y tu competencia casi no lo cubre. Es terreno libre: ocupalo con contenido optimizado para SEO y GEO y quedate con esa ocasion como Category Entry Point antes de que lo hagan ellos.', {
          t: blue.topic_label || blue.topic,
        });
      } else {
        titleTail = __('se acerca "{e}" en {d} dia(s)', { e: nextEv.event_name, d: Number(nextEv.days_until) || 0 });
        desc = __('El nicho esta tranquilo, pero "{e}" se acerca. Cada fecha es un Category Entry Point: prepara contenido optimizado para SEO y GEO con anticipacion para llegar cuando el mundo este mirando.', {
          e: nextEv.event_name,
        });
      }

      return `
        <section class="mb-section mb-bstat-section">
          <div class="mb-bstat">
            <div class="mb-bstat-lead">
              ${brief && brief.headline
                ? `<h3 class="mb-bstat-title">${this._esc(brief.headline)}</h3>
                   <p class="mb-bstat-desc">${this._esc(brief.body || '')}</p>`
                : `<h3 class="mb-bstat-title">${__('Tu nicho esta')} <span class="mb-bstat-verdict mb-bstat-verdict--${lvl}">${this._esc(label)}</span>: ${this._esc(titleTail)}.</h3>
                   <p class="mb-bstat-desc">${this._esc(desc)}</p>`}
            </div>
          </div>
        </section>`;
    },

    /* Dia y mes corto ES de un event_date 'YYYY-MM-DD' -> ['20','jul'].
       Parseo manual para no depender de zona horaria. */
    _fmtEventDay(iso) {
      const M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? [String(Number(m[3])), M[Number(m[2]) - 1]] : ['', ''];
    },

    /* Card lateral "Proximas Fechas" (mismo diseño que Salud de tu marca /
       Observaciones: mb-health-card--aside). Cada fecha con su dia exacto + tag
       Utilizar/Descartar (juicio de conveniencia por marca, del collector). */
    _buildTendFechasCard(world) {
      const holidays = Array.isArray(world?.upcoming_holidays) ? world.upcoming_holidays : [];
      if (!holidays.length) return '';
      const rows = [...holidays]
        .sort((a, b) => Number(a.days_until) - Number(b.days_until))
        .slice(0, 10)
        .map((h) => {
          const rd = h.raw_data || {};
          const verdict = String(rd.verdict || '');
          const intl = String(rd.scope || '') === 'international';
          const tag = verdict === 'utilizar'
            ? `<span class="tend-fecha-tag tend-fecha-tag--use">${__('Utilizar')}</span>`
            : verdict === 'descartar'
              ? `<span class="tend-fecha-tag tend-fecha-tag--skip">${__('Descartar')}</span>`
              : '';
          const reason = h.event_description || rd.reason || '';
          const globe = intl ? `<i class="aisc-ico aisc-ico--places tend-fecha-globe" title="${__('Evento internacional')}"></i> ` : '';
          const [d, mon] = this._fmtEventDay(h.event_date);
          return `
            <div class="tend-fecha${verdict === 'descartar' ? ' tend-fecha--muted' : ''}${intl ? ' tend-fecha--intl' : ''}">
              <div class="tend-fecha-date"><span class="tend-fecha-day">${this._esc(d)}</span><span class="tend-fecha-mon">${this._esc(mon)}</span></div>
              <div class="tend-fecha-body">
                <div class="tend-fecha-top"><span class="tend-fecha-name">${globe}${this._esc(h.event_name)}</span>${tag}</div>
                ${reason ? `<span class="tend-fecha-reason">${this._esc(reason)}</span>` : ''}
              </div>
            </div>`;
        }).join('');
      return `
        <section class="mb-health-card mb-health-card--aside">
          <span class="mb-hero-label">${__('Próximas Fechas')}</span>
          <div class="tend-fechas">${rows}</div>
        </section>`;
    },

    /* ── Cards del hero en Tendencias: el PULSO del nicho. Tendencia caliente
       (keyword acelerando) + Oportunidad (content gap / océano azul) + Marca
       emergente (nuevo rival) + Próximo evento (calendario real-world). ── */
    _computeTendenciesCards(td) {
      const signals  = (td?.signals?.data?.top_velocity) || [];
      const gaps     = (td?.gaps?.data?.gaps) || [];
      const brands   = (td?.brands?.data?.pending) || [];
      const holidays = (td?.world?.data?.upcoming_holidays) || [];
      const C = (n) => this._compactNum(Number(n) || 0);

      let funciona = null;
      const hot = [...signals].sort((a, b) => Number(b.velocity_score) - Number(a.velocity_score))[0];
      if (hot) {
        funciona = {
          title: __('"{k}" está en tendencia en tu nicho', { k: hot.theme }),
          metric: String(hot.momentum || '').toLowerCase() === 'alto' ? __('Alto') : __('Medio'),
          metricSub: __('momento — aprovéchalo'),
          impact: 'alto', earlySignal: false,
          detail: { color: 'explota', category: __('En tendencia'), title: __('Señales en tendencia del nicho'),
            findings: [...signals].sort((a, b) => Number(b.velocity_score) - Number(a.velocity_score)).slice(0, 5).map((s) => ({
              key: 'tendencia', n: Number(s.velocity_score) || 0, severity: 50,
              label: this._esc(s.theme || ''),
            })),
            sections: [{ h: __('¿Qué está haciendo boom?'), b: __('Estos momentos están calientes en tu nicho ahora. Crea contenido para aprovecharlos mientras la audiencia los vive — el timing lo es todo.') }],
          },
        };
      }

      let oportunidad = null;
      const blue = [...gaps].sort((a, b) => Number(a.competitor_post_count || 0) - Number(b.competitor_post_count || 0))[0];
      if (blue) {
        const zero = Number(blue.competitor_post_count) === 0;
        oportunidad = {
          title: zero ? __('"{t}" — nadie lo cubre', { t: blue.topic_label || blue.topic }) : __('"{t}" está subexplotado', { t: blue.topic_label || blue.topic }),
          metric: zero ? __('Océano azul') : `${Number(blue.competitor_post_count) || 0}`,
          metricSub: zero ? __('demanda sin competencia — es tuyo') : __('posts de rivales — hay espacio'),
          impact: 'medio', earlySignal: false,
          detail: { color: 'optimiza', category: __('Oportunidad'), title: __('Espacios sin cubrir (content gaps)'),
            findings: [...gaps].slice(0, 5).map((g) => ({
              key: 'gap', n: Number(g.competitor_post_count) || 0, severity: 50,
              label: __('"{t}" · {n} posts de rivales', { t: g.topic_label || g.topic, n: Number(g.competitor_post_count) || 0 }),
            })),
            sections: [{ h: __('¿Qué demanda el nicho que nadie cubre?'), b: __('Hay demanda en estos temas y poca o ninguna cobertura de rivales. Ocúpalos antes de que lo hagan ellos.') }],
          },
        };
      }

      let resta = null;
      const eb = [...brands].sort((a, b) => Number(b.detection_count) - Number(a.detection_count))[0];
      if (eb) {
        resta = {
          title: __('"{n}" emerge en tu nicho', { n: eb.candidate_name }),
          metric: C(eb.detection_count), metricSub: __('detecciones — nuevo competidor'),
          impact: 'medio', earlySignal: false,
          detail: { color: 'elimina', category: __('Marca emergente'), title: __('Nuevos competidores'),
            findings: [...brands].slice(0, 5).map((b) => ({
              key: 'rival', n: Number(b.detection_count) || 0, severity: 45,
              label: __('"{n}" · {c} detecciones', { n: b.candidate_name, c: Number(b.detection_count) || 0 }),
            })),
            sections: [{ h: __('¿Quién está apareciendo?'), b: __('Marcas nuevas que empiezan a aparecer en tu nicho. Vigílalas temprano: hoy son pequeñas, mañana pueden no serlo.') }],
          },
        };
      }

      let riesgo = null;
      const ev = [...holidays].sort((a, b) => Number(a.days_until) - Number(b.days_until))[0];
      if (ev) {
        riesgo = {
          title: __('{e} en {d} días', { e: ev.event_name, d: Number(ev.days_until) || 0 }),
          metric: `${Number(ev.days_until) || 0}d`, metricSub: __('prepara contenido con tiempo'),
          impact: 'medio', earlySignal: false,
          detail: { color: 'vigila', category: __('Próximo evento'), title: __('Calendario del mundo real'),
            findings: [...holidays].slice(0, 5).map((h) => ({
              key: 'evento', n: Number(h.days_until) || 0, severity: 40,
              label: __('{e} · en {d} días', { e: h.event_name, d: Number(h.days_until) || 0 }),
            })),
            sections: [{ h: __('¿Qué se viene?'), b: __('Fechas y eventos relevantes que se acercan. Prepara contenido con anticipación para llegar primero.') }],
          },
        };
      }

      return { funciona, oportunidad, resta, riesgo };
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
          ${this._buildIntegrationBubbles()}
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

    /* ── Señales emergentes: keywords con velocidad (filtradas) ─────── */
    _buildTendSignals(signals) {
      // Señales EN TENDENCIA del nicho: momentos/temas que hacen boom AHORA en la
      // audiencia y que la marca puede aprovechar (Google Trends sintetizado por LLM).
      const list = (Array.isArray(signals?.top_velocity) ? signals.top_velocity : []).slice(0, 12);
      if (!list.length) return ''; // card vacía → se oculta
      const rows = list.map((s) => {
        const alto = String(s.momentum || '') === 'alto';
        const tag = alto
          ? `<span class="tend-sig-row-vel"><i class="aisc-ico aisc-ico--zap"></i> ${__('Alto')}</span>`
          : `<span class="tend-sig-row-vel tend-sig-row-vel--mid">${__('Medio')}</span>`;
        return `
          <div class="tend-sig-row">
            <div class="tend-sig-row-txt">
              <span class="tend-sig-row-name">${this._esc(s.theme)}</span>
              ${s.why ? `<span class="tend-sig-row-sub">${this._esc(s.why)}</span>` : ''}
            </div>
            ${tag}
          </div>`;
      }).join('');
      return `
        <section class="mb-section">
          <div class="mb-long-card">
            <div class="mb-ptbl-head">
              <div class="mb-card-title">${__('Señales en tendencia del nicho')}</div>
              <div class="mb-ptbl-sub">${__('Lo que está haciendo boom AHORA en tu nicho — momentos que tu audiencia vive y puedes aprovechar con contenido')}</div>
            </div>
            <div class="tend-sig-list">${rows}</div>
          </div>
        </section>`;
    },

    /* ── Demanda de busqueda: lo que la gente BUSCA alrededor de tu categoria
       (Google Trends via SerpApi). Señal limpia de nicho — intencion real, sin el
       ruido de referentes. rising = demanda que acelera; top = demanda establecida. */
    _buildTendDemand(demand) {
      const raw = Array.isArray(demand?.top_high_intent) ? demand.top_high_intent : [];
      if (!raw.length) return ''; // sin data viva → se oculta
      // Dedup SOLO por termino EXACTO (el mismo string aparece a la vez en rising y
      // top). NO se fusionan terminos distintos: "yogurt sin azucar" y "yogurt griego
      // sin azucar" son diferentes y ambos se conservan. Si un termino es rising, gana.
      // Merge por termino EXACTO (el mismo string llega en rising y top). NO se
      // fusionan terminos distintos ("yogurt sin azucar" != "yogurt griego sin azucar").
      // interest = indice 0-100 de Google Trends (proxy de VOLUMEN = trafico); growth =
      // % de crecimiento del termino en alza. Un termino puede tener ambos.
      const byTerm = new Map();
      raw.forEach((d) => {
        const key = String(d.discovered_term || '').trim().toLowerCase();
        if (!key) return;
        const rp = d.raw_payload || {};
        const kind = String(rp.kind || '');
        const score = Number(rp.score);
        const e = byTerm.get(key) || {
          term: d.discovered_term, seed: d.seed_keyword, geo: d.geo, interest: null, growth: null, rising: false,
        };
        if (kind === 'top' && Number.isFinite(score)) e.interest = e.interest == null ? score : Math.max(e.interest, score);
        if (kind === 'rising') { e.rising = true; if (Number.isFinite(score)) e.growth = e.growth == null ? score : Math.max(e.growth, score); }
        byTerm.set(key, e);
      });
      // Orden por INTERES desc = mas trafico primero (responde "cual me beneficia").
      const list = [...byTerm.values()].sort((a, b) =>
        (Number(b.interest ?? -1) - Number(a.interest ?? -1)) || (Number(b.growth ?? 0) - Number(a.growth ?? 0)));
      // Bubble chart: tamaño ∝ interes (volumen de busqueda). Top por interes.
      // Se empaqueta con el radio INFLADO (r + PAD) y se dibuja al radio real -> deja
      // aire entre burbujas para que no se peguen.
      const PAL = this._palette();
      const PAD_PACK = 8;
      const bubbles = list.filter((e) => e.interest != null && e.interest > 0)
        .slice(0, 7)
        .map((e, i) => {
          const dr = Math.sqrt(e.interest) * 10;
          return { ...e, color: PAL[i % PAL.length], drawR: dr, r: dr + PAD_PACK };
        });
      const emerging = list.filter((e) => e.interest == null && e.rising).slice(0, 6);
      if (!bubbles.length) return ''; // sin volumen medible → se oculta

      this._packSiblings(bubbles); // usa r (inflado) -> separa; dibujamos con drawR
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxR = 0;
      bubbles.forEach((b) => {
        minX = Math.min(minX, b.x - b.r); minY = Math.min(minY, b.y - b.r);
        maxX = Math.max(maxX, b.x + b.r); maxY = Math.max(maxY, b.y + b.r);
        maxR = Math.max(maxR, b.drawR);
      });
      const vb = `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`;
      const circles = bubbles.map((b) => {
        const showVal = b.drawR >= maxR * 0.34;
        return `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${b.drawR.toFixed(1)}" fill="${b.color}2e" stroke="${b.color}b0" stroke-width="3"></circle>${
          showVal ? `<text x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${b.color}" font-size="${(b.drawR * 0.5).toFixed(1)}" font-weight="700">${b.interest}</text>` : ''}`;
      }).join('');
      const legend = bubbles.map((b) => {
        const growth = b.rising ? (b.growth != null && b.growth >= 900 ? __('Explosivo') : (b.growth != null ? `+${this._compactNum(b.growth)}%` : __('en alza'))) : '';
        return `
          <div class="tend-bub-leg">
            <span class="tend-bub-dot" style="background:${b.color}"></span>
            <div class="tend-bub-leg-txt">
              <span class="tend-bub-leg-name" style="color:${b.color}">${this._esc(b.term)}</span>
              <span class="tend-bub-leg-val">${__('Interés {n}', { n: b.interest })}${growth ? ` · <span class="tend-bub-leg-rise">⚡ ${growth}</span>` : ''}</span>
            </div>
          </div>`;
      }).join('');
      const emergingLine = emerging.length
        ? `<div class="tend-bub-emerging"><i class="aisc-ico aisc-ico--zap"></i> ${__('También en alza (emergentes)')}: ${emerging.map((e) => this._esc(e.term)).join(' · ')}</div>`
        : '';
      return `
        <section class="mb-section">
          <div class="mb-long-card tend-bub-card">
            <div class="mb-ptbl-head">
              <div class="mb-card-title">${__('Demanda de búsqueda del nicho')}</div>
              <div class="mb-ptbl-sub">${__('Lo que la gente busca alrededor de tu categoría (Google Trends). El tamaño de cada burbuja es el interés (0–100): a más grande, más volumen de búsqueda y más tráfico potencial para tu contenido.')}</div>
            </div>
            <div class="tend-bub-viz">
              <svg class="tend-bub-svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${__('Demanda de búsqueda por término')}">${circles}</svg>
            </div>
            <div class="tend-bub-legend">${legend}</div>
            ${emergingLine}
          </div>
        </section>`;
    },

    /* Circle packing (port compacto de d3.packSiblings): posiciona los circulos
       {r} en x,y sin solaparse, agrupados alrededor del centro. */
    _packSiblings(circles) {
      const n = circles.length;
      if (!n) return circles;
      const place = (b, a, c) => {
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2) {
          const a2 = (a.r + c.r) ** 2, b2 = (b.r + c.r) ** 2;
          if (a2 > b2) {
            const x = (d2 + b2 - a2) / (2 * d2), y = Math.sqrt(Math.max(0, b2 / d2 - x * x));
            c.x = b.x - x * dx - y * dy; c.y = b.y - x * dy + y * dx;
          } else {
            const x = (d2 + a2 - b2) / (2 * d2), y = Math.sqrt(Math.max(0, a2 / d2 - x * x));
            c.x = a.x + x * dx - y * dy; c.y = a.y + x * dy + y * dx;
          }
        } else { c.x = a.x + c.r; c.y = a.y; }
      };
      const intersects = (a, b) => {
        const dr = a.r + b.r - 1e-6, dx = b.x - a.x, dy = b.y - a.y;
        return dr > 0 && dr * dr > dx * dx + dy * dy;
      };
      const score = (node) => {
        const a = node._, b = node.next._, ab = a.r + b.r;
        const dx = (a.x * b.r + b.x * a.r) / ab, dy = (a.y * b.r + b.y * a.r) / ab;
        return dx * dx + dy * dy;
      };
      const a0 = circles[0]; a0.x = 0; a0.y = 0;
      if (n === 1) return circles;
      const b0 = circles[1]; a0.x = -b0.r; b0.x = a0.r; b0.y = 0;
      if (n === 2) return circles;
      const c0 = circles[2]; place(b0, a0, c0);
      let A = { _: a0 }, B = { _: b0 }, C = { _: c0 };
      A.next = C.prev = B; B.next = A.prev = C; C.next = B.prev = A;
      pack: for (let i = 3; i < n; ++i) {
        const c = circles[i]; place(A._, B._, c);
        let j = B.next, k = A.prev, sj = B._.r, sk = A._.r;
        do {
          if (sj <= sk) {
            if (intersects(j._, c)) { B = j; A.next = B; B.prev = A; --i; continue pack; }
            sj += j._.r; j = j.next;
          } else {
            if (intersects(k._, c)) { A = k; A.next = B; B.prev = A; --i; continue pack; }
            sk += k._.r; k = k.prev;
          }
        } while (j !== k.next);
        const node = { _: c, prev: A, next: B };
        A.next = B.prev = node; B = node;
        let best = score(A), cur = A, s;
        while ((cur = cur.next) !== B) { if ((s = score(cur)) < best) { A = cur; best = s; } }
        B = A.next;
      }
      return circles;
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
      if (!list.length) return ''; // card vacía → se oculta
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
      if (!approved.length && !byDim.length) return ''; // card vacía → se oculta
      const dims = byDim.map(d => `
        <div class="tend-dim">
          <span class="tend-dim-name">${this._esc(this._tendDimLabel(d.dimension))}</span>
          <span class="tend-dim-counts">${__('{n} aprendidas', { n: `<b>${fmt.int(d.approved)}</b>` })}${Number(d.proposed) > 0 ? __(' · {n} en revisión', { n: fmt.int(d.proposed) }) : ''}</span>
        </div>`).join('');
      const words = approved.map(w => `<span class="tend-word">${this._esc(w.word)}<span class="tend-word-dim">${this._esc(this._tendDimLabel(w.dimension))}</span></span>`).join('');
      const pendNote = pending.length
        ? `<div class="tend-lex-note"><i class="aisc-ico aisc-ico--hourglass"></i> ${__('{n} palabra(s) nuevas esperando tu revisión en el Léxico.', { n: fmt.int(pending.length) })}</div>`
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
      if (!pending.length) return ''; // card vacía → se oculta
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
              ${geos.length ? `<span class="tend-brand-geo"><i class="aisc-ico aisc-ico--places"></i> ${this._esc(geos.slice(0, 3).join(', '))}</span>` : ''}
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
      if (!holidays.length && !history.length) return ''; // card vacía → se oculta
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
