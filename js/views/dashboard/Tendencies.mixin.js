/**
 * DashboardView — Tendencies mixin (tab "Tendencias").
 *
 * Consume las 7 RPCs `dashboard_tendencias_*` (ver
 * SQL/migrations/migration_FEAT-016_dashboard_tendencias_rpcs.sql) vía
 * `TendenciasDataService` y renderiza secciones verticales:
 *
 *   1. KPIs strip                    (7 cards)
 *   2. Demanda de Audiencia          (chart by intent + lista high-intent + donuts geo/source)
 *   3. Targeted Trends               (bar by_origin + line velocity diaria + tabla top match)
 *   4. Marcas Emergentes             (cards aprobar/rechazar)
 *   5. Niche Signals                 (donut by source + tabla top velocity)
 *   6. Lexicon Emergence             (stacked bar by dimension + lista pending)
 *   7. Market Pulse                  (velocity_by_type + category templates + aviso de gaps)
 *
 * Aplica sobre DashboardView.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {

    /* ── Entry point ─────────────────────────────────────────── */
    async _renderTendencies(body) {
      // Lazy state init
      if (!this._tendInit) {
        this._tendData    = null;
        this._tendService = null;
        this._tendWindow  = 30;
        this._tendBody    = null;
        this._tendInit    = true;
      }
      this._tendBody = body;

      // 1. Skeleton inmediato
      body.innerHTML = this._buildTendenciesSkeleton();

      // 2. Cargar Chart.js + service en paralelo
      await Promise.allSettled([
        this._ensureChartJs(),
        this._ensureTendenciasService(),
      ]);

      // 3. Cargar datos
      if (!this._tendData && this._tendService) {
        this._tendData = await this._tendService.loadAll({
          windowDays: this._tendWindow,
        });
      }

      // 4. Render con datos
      body.innerHTML = this._buildTendenciesHTML(this._tendData);
      this._initTendenciesCharts(this._tendData);
      this._wireTendenciesEvents();
    },

    async _ensureTendenciasService() {
      if (this._tendService) return;
      if (!window.TendenciasDataService) {
        try {
          await this.loadScript('/js/services/TendenciasDataService.js', 'TendenciasDataService', 6000);
        } catch (_) { return; }
      }
      if (!this._supabase || !this._orgId) return;
      try {
        this._tendService = await new window.TendenciasDataService().init(this._supabase, this._orgId);
      } catch (e) {
        console.warn('[Tendencies] init service:', e);
      }
    },

    /* ── Skeleton ────────────────────────────────────────────── */
    _buildTendenciesSkeleton() {
      const skel = (h) => `<div class="mb-skel-block" style="height:${h}px"></div>`;
      return `
        <div class="tnd-page">
          <div class="tnd-kpis">${Array(7).fill('<div class="tnd-kpi"><div class="mb-skel-block" style="height:64px"></div></div>').join('')}</div>
          <div class="tnd-section">${skel(220)}</div>
          <div class="tnd-section">${skel(220)}</div>
          <div class="tnd-section">${skel(180)}</div>
        </div>`;
    },

    /* ── HTML principal ──────────────────────────────────────── */
    _buildTendenciesHTML(d) {
      this._injectTendenciesCSS();

      if (!d) {
        return `<div class="tnd-page"><div class="tnd-empty-large">No se pudo cargar el servicio de Tendencias.</div></div>`;
      }

      const k       = d.kpis?.data?.kpis || {};
      const window_ = d.windowDays || 30;
      const audience = d.audience?.data || {};
      const targeted = d.targeted?.data || {};
      const emerging = d.emerging?.data || {};
      const niche    = d.niche?.data    || {};
      const lexicon  = d.lexicon?.data  || {};
      const pulse    = d.pulse?.data    || {};

      return `
        <div class="tnd-page">

          <!-- ─── Header ─────────────────────────────────────── -->
          <header class="tnd-header">
            <div>
              <h1 class="tnd-title">Tendencias del mercado</h1>
              <p class="tnd-subtitle">Pulso de audiencia, trends y marcas emergentes en tu nicho · ventana ${window_} días</p>
            </div>
            <div class="tnd-header-actions">
              <select class="tnd-window-select" id="tndWindowSelect" aria-label="Ventana de tiempo">
                <option value="7"  ${window_ === 7  ? 'selected' : ''}>7 días</option>
                <option value="30" ${window_ === 30 ? 'selected' : ''}>30 días</option>
                <option value="90" ${window_ === 90 ? 'selected' : ''}>90 días</option>
              </select>
              <button type="button" class="tnd-refresh-btn" id="tndRefreshBtn" title="Recargar">↻</button>
            </div>
          </header>

          <!-- ─── KPIs strip ─────────────────────────────────── -->
          <section class="tnd-kpis">
            ${this._buildTndKpi('Topics tracked',     k.topicsTracked,    'palabras únicas detectadas')}
            ${this._buildTndKpi('Demanda audiencia',  k.audienceSignals,  'señales de intent capturadas')}
            ${this._buildTndKpi('Targeted trends',    k.targetedTrends,   'noticias filtradas por nicho')}
            ${this._buildTndKpi('Marcas emergentes',  k.emergingBrandsPending, 'pendientes de revisión', 'accent')}
            ${this._buildTndKpi('Velocidad 24h',      k.velocityLast24h,  'eventos en últimas 24h')}
            ${this._buildTndKpi('Lexicón aprobado',   k.lexiconApproved,  'términos ya validados')}
            ${this._buildTndKpi('Lexicón pendiente',  k.lexiconPending,   'esperan revisión', 'warn')}
          </section>

          <!-- ─── 1. Demanda de Audiencia ───────────────────── -->
          <section class="tnd-section">
            <header class="tnd-section-head">
              <h2>Demanda de Audiencia</h2>
              <p>Lo que tu nicho está buscando en Google y YouTube — separado por intención comercial</p>
            </header>
            <div class="tnd-grid-2">
              <article class="tnd-widget">
                <header><h3>Por intención × valor comercial</h3></header>
                <div class="tnd-chart-wrap"><canvas id="tndChartIntent"></canvas></div>
                ${(audience.by_intent || []).length === 0 ? `<div class="tnd-empty">Sin señales en este período</div>` : ''}
              </article>
              <article class="tnd-widget">
                <header><h3>Top consultas con valor comercial alto/medio</h3></header>
                ${this._buildTndHighIntentList(audience.top_high_intent)}
              </article>
            </div>
            <div class="tnd-grid-2">
              <article class="tnd-widget">
                <header><h3>Distribución geográfica</h3></header>
                <div class="tnd-chart-wrap" style="height:200px"><canvas id="tndChartGeo"></canvas></div>
              </article>
              <article class="tnd-widget">
                <header><h3>Por fuente</h3></header>
                <div class="tnd-chart-wrap" style="height:200px"><canvas id="tndChartSource"></canvas></div>
              </article>
            </div>
          </section>

          <!-- ─── 2. Targeted Trends (Google News smart query) ── -->
          <section class="tnd-section">
            <header class="tnd-section-head">
              <h2>Targeted Trends</h2>
              <p>Noticias capturadas por keywords de tu marca, productos, audiencia y competidores</p>
            </header>
            <div class="tnd-grid-2">
              <article class="tnd-widget">
                <header><h3>Volumen por origen de keyword</h3></header>
                <div class="tnd-chart-wrap"><canvas id="tndChartOrigin"></canvas></div>
              </article>
              <article class="tnd-widget">
                <header><h3>Velocidad diaria</h3></header>
                <div class="tnd-chart-wrap"><canvas id="tndChartVelocity"></canvas></div>
              </article>
            </div>
            <article class="tnd-widget tnd-widget--wide">
              <header>
                <h3>Top noticias por match con tus keywords</h3>
                <span class="tnd-vera-safe-pill">${this._buildTndVeraSafePill(targeted.vera_safe_breakdown)}</span>
              </header>
              ${this._buildTndTrendsTable(targeted.top_by_match)}
            </article>
          </section>

          <!-- ─── 3. Marcas Emergentes ──────────────────────── -->
          <section class="tnd-section">
            <header class="tnd-section-head">
              <h2>Marcas Emergentes</h2>
              <p>Competidores nuevos detectados antes de que sean masivos · aprueba para auto-provisionar sensores</p>
            </header>
            ${this._buildTndEmergingSection(emerging)}
          </section>

          <!-- ─── 4. Niche Signals ──────────────────────────── -->
          <section class="tnd-section">
            <header class="tnd-section-head">
              <h2>Niche Signals</h2>
              <p>Keywords que vibran en tus redes monitoreadas · ordenadas por velocity</p>
            </header>
            <div class="tnd-grid-2">
              <article class="tnd-widget">
                <header><h3>Por red social</h3></header>
                <div class="tnd-chart-wrap" style="height:240px"><canvas id="tndChartNicheSource"></canvas></div>
              </article>
              <article class="tnd-widget">
                <header><h3>Top keywords por velocidad</h3></header>
                ${this._buildTndNicheTable(niche.top_velocity)}
              </article>
            </div>
          </section>

          <!-- ─── 5. Lexicon Emergence ──────────────────────── -->
          <section class="tnd-section">
            <header class="tnd-section-head">
              <h2>Lexicon Emergence</h2>
              <p>Vocabulario aprendido por dimensión · catálogo global compartido</p>
            </header>
            <div class="tnd-grid-2">
              <article class="tnd-widget">
                <header><h3>Por dimensión</h3></header>
                <div class="tnd-chart-wrap"><canvas id="tndChartLexicon"></canvas></div>
              </article>
              <article class="tnd-widget">
                <header><h3>Pendientes de revisión</h3></header>
                ${this._buildTndLexiconPendingList(lexicon.pending)}
              </article>
            </div>
          </section>

          <!-- ─── 6. Market Pulse ───────────────────────────── -->
          <section class="tnd-section">
            <header class="tnd-section-head">
              <h2>Pulso del Mercado</h2>
              <p>Velocity por tipo de señal y plantillas de categoría disponibles</p>
            </header>
            ${this._buildTndPulseSection(pulse)}
          </section>

        </div>`;
    },

    /* ── KPI card ────────────────────────────────────────────── */
    _buildTndKpi(label, value, sub, tone = '') {
      const fmt = (n) => {
        const v = Number(n);
        if (n == null || !isFinite(v)) return '—';
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
        if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'k';
        return String(v);
      };
      return `
        <article class="tnd-kpi ${tone ? 'tnd-kpi--' + tone : ''}">
          <div class="tnd-kpi-label">${this._esc(label)}</div>
          <div class="tnd-kpi-value">${fmt(value)}</div>
          <div class="tnd-kpi-sub">${this._esc(sub || '')}</div>
        </article>`;
    },

    /* ── Audience: lista high-intent ─────────────────────────── */
    _buildTndHighIntentList(items) {
      if (!Array.isArray(items) || !items.length) {
        return `<div class="tnd-empty">Sin consultas de alta intención en este período</div>`;
      }
      // Deduplicar por discovered_term + geo (mismas queries pueden repetirse en distintos scrapes)
      const seen = new Set();
      const dedup = items.filter(it => {
        const k = `${it.discovered_term}|${it.geo}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, 12);

      const rows = dedup.map(it => {
        const intent = it.commercial_intent || '—';
        const tone = intent === 'high' ? 'tnd-pill--high' : intent === 'medium' ? 'tnd-pill--med' : 'tnd-pill--low';
        return `
          <li class="tnd-hi-row">
            <div class="tnd-hi-text">
              <span class="tnd-hi-term">${this._esc(it.discovered_term || '')}</span>
              <span class="tnd-hi-meta">${this._esc(it.intent_category || '')} · ${this._esc(it.geo || '')}</span>
            </div>
            <span class="tnd-pill ${tone}">${intent}</span>
          </li>`;
      }).join('');
      return `<ul class="tnd-hi-list">${rows}</ul>`;
    },

    /* ── Targeted: vera_safe pill ────────────────────────────── */
    _buildTndVeraSafePill(b) {
      if (!b || !b.total) return '';
      const pct = Math.round(100 * (b.safe || 0) / b.total);
      return `<span class="tnd-pill tnd-pill--info" title="${b.safe} safe / ${b.unsafe} unsafe / ${b.total} total">vera_safe ${pct}%</span>`;
    },

    /* ── Targeted: tabla de top by match ─────────────────────── */
    _buildTndTrendsTable(items) {
      if (!Array.isArray(items) || !items.length) {
        return `<div class="tnd-empty">Sin trends capturados en este período</div>`;
      }
      const rows = items.slice(0, 15).map(it => {
        const safeIcon = it.vera_safe ? '🟢' : '⚠️';
        const match = Number(it.match_strength || 0).toFixed(2);
        return `
          <tr>
            <td><span class="tnd-mono">${safeIcon} ${match}</span></td>
            <td>
              <a href="${this._esc(it.url || '#')}" target="_blank" rel="noopener" class="tnd-tt-title">${this._esc(it.title || 'Sin título')}</a>
              <div class="tnd-tt-meta">${this._esc(it.source || '')} · ${this._esc(it.geo || '')} · ${this._esc(it.keyword_origin || '')}: <em>${this._esc(it.trigger_keyword || '')}</em></div>
            </td>
          </tr>`;
      }).join('');
      return `
        <div class="tnd-table-wrap">
          <table class="tnd-table">
            <thead><tr><th style="width:80px">Match</th><th>Noticia</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    },

    /* ── Emerging brands section ─────────────────────────────── */
    _buildTndEmergingSection(emerging) {
      const pending  = emerging?.pending  || [];
      const approved = emerging?.approved || [];

      const pendingCards = pending.length
        ? pending.map(c => this._buildTndEmergingCard(c, true)).join('')
        : `<div class="tnd-empty">No hay marcas pendientes de revisión</div>`;

      const approvedRows = approved.length
        ? `<ul class="tnd-emerg-approved">${approved.map(c => `
            <li>
              <strong>${this._esc(c.candidate_name || '—')}</strong>
              <span class="tnd-meta">${this._esc(c.niche || '—')} · ${(c.detected_geos || []).join(', ')} · ${c.approved_entities_count || 0} entities</span>
            </li>`).join('')}</ul>`
        : '';

      return `
        <div class="tnd-emerg-pending">${pendingCards}</div>
        ${approved.length ? `
          <div class="tnd-emerg-approved-wrap">
            <h3 class="tnd-emerg-h3">Aprobadas recientemente</h3>
            ${approvedRows}
          </div>` : ''}
      `;
    },

    _buildTndEmergingCard(c, withActions) {
      const geos  = (c.detected_geos || []).join(', ') || '—';
      const seeds = (c.detected_in_seeds || []).slice(0, 3).join(', ') || '—';
      return `
        <article class="tnd-emerg-card" data-cid="${this._esc(c.id)}">
          <header class="tnd-emerg-card-head">
            <div>
              <h3 class="tnd-emerg-name">${this._esc(c.candidate_name || '—')}</h3>
              <div class="tnd-emerg-niche">${this._esc(c.niche || 'sin nicho')}</div>
            </div>
            <span class="tnd-pill tnd-pill--info">${c.detection_count || 0} detecciones</span>
          </header>
          <div class="tnd-emerg-meta">
            <div><span>Geos:</span> ${this._esc(geos)}</div>
            <div><span>Detectada en seeds:</span> ${this._esc(seeds)}</div>
            <div><span>Rank avg:</span> ${c.avg_rank_position != null ? Number(c.avg_rank_position).toFixed(1) : '—'}</div>
          </div>
          ${withActions ? `
            <div class="tnd-emerg-actions">
              <button type="button" class="tnd-btn tnd-btn--approve" data-action="approve" data-id="${this._esc(c.id)}">✓ Aprobar</button>
              <button type="button" class="tnd-btn tnd-btn--reject"  data-action="reject"  data-id="${this._esc(c.id)}">✕ Rechazar</button>
            </div>` : ''}
        </article>`;
    },

    /* ── Niche signals tabla ─────────────────────────────────── */
    _buildTndNicheTable(items) {
      if (!Array.isArray(items) || !items.length) {
        return `<div class="tnd-empty">Sin niche signals en este período</div>`;
      }
      const rows = items.slice(0, 15).map(it => `
        <tr>
          <td><strong>${this._esc(it.keyword || '—')}</strong></td>
          <td><span class="tnd-mono">${this._esc(it.source || '—')}</span></td>
          <td><span class="tnd-mono">${Number(it.velocity_score || 0).toFixed(1)}</span></td>
        </tr>`).join('');
      return `
        <div class="tnd-table-wrap">
          <table class="tnd-table">
            <thead><tr><th>Keyword</th><th style="width:120px">Red</th><th style="width:80px">Velocity</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    },

    /* ── Lexicon pending list ────────────────────────────────── */
    _buildTndLexiconPendingList(items) {
      if (!Array.isArray(items) || !items.length) {
        return `<div class="tnd-empty">No hay términos pendientes de revisión</div>`;
      }
      const rows = items.slice(0, 12).map(it => `
        <li class="tnd-lex-row">
          <div>
            <strong>${this._esc(it.word || '—')}</strong>
            <span class="tnd-meta">${this._esc(it.dimension || '')} · ${this._esc(it.category_value || '')}</span>
          </div>
          <span class="tnd-pill tnd-pill--low">${this._esc(it.source || 'auto')}</span>
        </li>`).join('');
      return `<ul class="tnd-lex-list">${rows}</ul>`;
    },

    /* ── Pulse section ───────────────────────────────────────── */
    _buildTndPulseSection(pulse) {
      const velocity = pulse?.velocity_by_type || {};
      const sentiment = pulse?.sentiment_breakdown || {};
      const formats = pulse?.format_breakdown || [];
      const templates = pulse?.category_templates || [];

      const velocityCards = Object.keys(velocity).length
        ? Object.entries(velocity).map(([type, v]) => `
            <article class="tnd-pulse-card">
              <div class="tnd-pulse-type">${this._esc(type)}</div>
              <div class="tnd-pulse-now">${v.last_24h || 0}</div>
              <div class="tnd-pulse-meta">${v.last_1h || 0} en 1h · ${v.last_6h || 0} en 6h · ${v.total || 0} total</div>
            </article>`).join('')
        : `<div class="tnd-empty">Sin velocity data en este período</div>`;

      const tplPills = templates.length
        ? templates.slice(0, 10).map(t => `<span class="tnd-tpl-pill" title="${this._esc(t.description || '')}">${this._esc(t.display_name || t.id || '?')}</span>`).join('')
        : '';

      const sentTotal = sentiment.total || 0;
      const sentValid = (sentiment.positivo || 0) + (sentiment.negativo || 0) + (sentiment.neutro || 0);
      const sentNote = sentTotal > 0 && sentValid === 0
        ? `<div class="tnd-pulse-note">⚠ Sentiment computado sobre ${sentTotal} posts pero sin clasificación poblada upstream — pendiente fix</div>`
        : '';

      const fmtNote = formats.length && formats.every(f => f.asset_type === 'unknown')
        ? `<div class="tnd-pulse-note">⚠ Asset type sin clasificar (${formats[0]?.posts || 0} posts) — pendiente clasificador upstream</div>`
        : '';

      return `
        <div class="tnd-pulse-grid">${velocityCards}</div>
        ${templates.length ? `
          <div class="tnd-pulse-templates">
            <div class="tnd-pulse-templates-title">Plantillas disponibles para tu categoría</div>
            <div class="tnd-tpl-pills">${tplPills}</div>
          </div>` : ''}
        ${sentNote}
        ${fmtNote}
      `;
    },

    /* ── Charts ──────────────────────────────────────────────── */
    _initTendenciesCharts(d) {
      if (!window.Chart || !d) return;

      const colors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#22c55e', '#ef4444'];
      const trans  = (hex, a) => {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return `rgba(${r},${g},${b},${a})`;
      };

      // 1. Audience by_intent — stacked horizontal bar (intent_category × commercial_intent)
      const intentCanvas = document.getElementById('tndChartIntent');
      const byIntent = d.audience?.data?.by_intent || [];
      if (intentCanvas && byIntent.length) {
        const cats = [...new Set(byIntent.map(r => r.intent_category))];
        const intents = ['high', 'medium', 'low'];
        const intentColor = { high: '#22c55e', medium: '#f59e0b', low: '#94a3b8' };
        const datasets = intents.map(int => ({
          label: int,
          data: cats.map(c => {
            const m = byIntent.find(r => r.intent_category === c && r.commercial_intent === int);
            return m ? Number(m.total) : 0;
          }),
          backgroundColor: intentColor[int],
          borderRadius: 4,
          borderWidth: 0,
        }));
        this._reg(new Chart(intentCanvas, {
          type: 'bar',
          data: { labels: cats, datasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } },
            scales: {
              x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
              y: { stacked: true, ticks: { color: '#cbd5e1' }, grid: { display: false } },
            },
          },
        }));
      }

      // 2. Audience by_geo — donut
      const geoCanvas = document.getElementById('tndChartGeo');
      const byGeo = d.audience?.data?.by_geo || [];
      if (geoCanvas && byGeo.length) {
        this._reg(new Chart(geoCanvas, {
          type: 'doughnut',
          data: {
            labels: byGeo.map(r => r.geo || '?'),
            datasets: [{ data: byGeo.map(r => Number(r.total)), backgroundColor: colors, borderColor: '#0f172a', borderWidth: 2 }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } } },
          },
        }));
      }

      // 3. Audience by_source — donut
      const srcCanvas = document.getElementById('tndChartSource');
      const bySrc = d.audience?.data?.by_source || [];
      if (srcCanvas && bySrc.length) {
        this._reg(new Chart(srcCanvas, {
          type: 'doughnut',
          data: {
            labels: bySrc.map(r => r.source || '?'),
            datasets: [{ data: bySrc.map(r => Number(r.total)), backgroundColor: colors.slice(2), borderColor: '#0f172a', borderWidth: 2 }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } } },
          },
        }));
      }

      // 4. Targeted by_origin — bar chart
      const originCanvas = document.getElementById('tndChartOrigin');
      const byOrigin = d.targeted?.data?.by_origin || [];
      if (originCanvas && byOrigin.length) {
        this._reg(new Chart(originCanvas, {
          type: 'bar',
          data: {
            labels: byOrigin.map(r => r.keyword_origin || '?'),
            datasets: [{
              label: 'Filas',
              data: byOrigin.map(r => Number(r.total)),
              backgroundColor: trans(colors[0], 0.7),
              borderColor: colors[0],
              borderWidth: 1,
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#94a3b8', maxRotation: 30 }, grid: { display: false } },
              y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
            },
          },
        }));
      }

      // 5. Targeted velocity_series — line
      const velCanvas = document.getElementById('tndChartVelocity');
      const series = d.targeted?.data?.velocity_series || [];
      if (velCanvas && series.length) {
        this._reg(new Chart(velCanvas, {
          type: 'line',
          data: {
            labels: series.map(r => r.day),
            datasets: [{
              label: 'Trends por día',
              data: series.map(r => Number(r.total)),
              borderColor: colors[1],
              backgroundColor: trans(colors[1], 0.15),
              fill: true,
              tension: 0.3,
              pointRadius: 2,
              pointBackgroundColor: colors[1],
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkipPadding: 20 }, grid: { display: false } },
              y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
            },
          },
        }));
      }

      // 6. Niche by_source — donut
      const nicheSrcCanvas = document.getElementById('tndChartNicheSource');
      const nicheBySrc = d.niche?.data?.by_source || [];
      if (nicheSrcCanvas && nicheBySrc.length) {
        this._reg(new Chart(nicheSrcCanvas, {
          type: 'doughnut',
          data: {
            labels: nicheBySrc.map(r => r.source || '?'),
            datasets: [{ data: nicheBySrc.map(r => Number(r.total)), backgroundColor: colors, borderColor: '#0f172a', borderWidth: 2 }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } } },
          },
        }));
      }

      // 7. Lexicon by_dimension — stacked bar
      const lexCanvas = document.getElementById('tndChartLexicon');
      const byDim = d.lexicon?.data?.by_dimension || [];
      if (lexCanvas && byDim.length) {
        this._reg(new Chart(lexCanvas, {
          type: 'bar',
          data: {
            labels: byDim.map(r => r.dimension),
            datasets: [
              { label: 'Aprobados', data: byDim.map(r => Number(r.approved)), backgroundColor: '#22c55e', borderRadius: 4 },
              { label: 'Pendientes', data: byDim.map(r => Number(r.proposed)), backgroundColor: '#f59e0b', borderRadius: 4 },
              { label: 'Rechazados', data: byDim.map(r => Number(r.rejected)), backgroundColor: '#94a3b8', borderRadius: 4 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } },
            scales: {
              x: { stacked: true, ticks: { color: '#cbd5e1' }, grid: { display: false } },
              y: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
            },
          },
        }));
      }
    },

    /* ── Eventos ─────────────────────────────────────────────── */
    _wireTendenciesEvents() {
      const refreshBtn = document.getElementById('tndRefreshBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
          this._tendData = null;
          this._destroyCharts();
          await this._renderTendencies(this._tendBody);
        });
      }
      const sel = document.getElementById('tndWindowSelect');
      if (sel) {
        sel.addEventListener('change', async (e) => {
          this._tendWindow = Number(e.target.value) || 30;
          this._tendData = null;
          this._destroyCharts();
          await this._renderTendencies(this._tendBody);
        });
      }
      // Emerging brand actions: stub UI (sin endpoint hookeado todavía)
      document.querySelectorAll('.tnd-emerg-actions [data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          // TODO: hook a /emerging-brands/approve|reject del ai-engine
          alert(`${action === 'approve' ? 'Aprobar' : 'Rechazar'} marca emergente ${id} — endpoint del ai-engine pendiente de cablear`);
        });
      });
    },

    /* ── CSS scoped al tab ───────────────────────────────────── */
    _injectTendenciesCSS() {
      if (document.getElementById('tnd-css')) return;
      const css = `
        .tnd-page { padding: 16px 0; color: #e2e8f0; }
        .tnd-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:24px; padding:0 4px; }
        .tnd-title { margin:0; font-size:24px; font-weight:600; letter-spacing:-.02em; color:#f1f5f9; }
        .tnd-subtitle { margin:4px 0 0; font-size:13px; color:#94a3b8; }
        .tnd-header-actions { display:flex; gap:8px; align-items:center; }
        .tnd-window-select { background:#1e293b; border:1px solid #334155; color:#e2e8f0; padding:6px 10px; border-radius:6px; font-size:13px; cursor:pointer; }
        .tnd-window-select:hover { border-color:#475569; }
        .tnd-refresh-btn { background:#1e293b; border:1px solid #334155; color:#e2e8f0; width:32px; height:32px; border-radius:6px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; transition:all .15s; }
        .tnd-refresh-btn:hover { border-color:#6366f1; color:#6366f1; transform:rotate(90deg); }

        .tnd-kpis { display:grid; grid-template-columns:repeat(7, 1fr); gap:12px; margin-bottom:32px; }
        @media (max-width: 1280px) { .tnd-kpis { grid-template-columns:repeat(4, 1fr); } }
        @media (max-width: 768px)  { .tnd-kpis { grid-template-columns:repeat(2, 1fr); } }
        .tnd-kpi { background:linear-gradient(135deg, rgba(30,41,59,.6), rgba(15,23,42,.6)); border:1px solid #1e293b; border-radius:10px; padding:14px 16px; transition: all .2s; }
        .tnd-kpi:hover { border-color:#334155; transform:translateY(-2px); }
        .tnd-kpi--accent { border-color:#6366f1; background:linear-gradient(135deg, rgba(99,102,241,.1), rgba(99,102,241,.05)); }
        .tnd-kpi--warn   { border-color:#f59e0b; background:linear-gradient(135deg, rgba(245,158,11,.1), rgba(245,158,11,.05)); }
        .tnd-kpi-label { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; margin-bottom:4px; }
        .tnd-kpi-value { font-size:28px; font-weight:600; color:#f1f5f9; line-height:1; }
        .tnd-kpi-sub   { font-size:11px; color:#64748b; margin-top:6px; }

        .tnd-section { margin-bottom:40px; }
        .tnd-section-head { margin-bottom:14px; }
        .tnd-section-head h2 { margin:0; font-size:18px; font-weight:600; color:#f1f5f9; letter-spacing:-.01em; }
        .tnd-section-head p  { margin:2px 0 0; font-size:13px; color:#94a3b8; }

        .tnd-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
        @media (max-width: 1024px) { .tnd-grid-2 { grid-template-columns:1fr; } }

        .tnd-widget { background:rgba(30,41,59,.4); border:1px solid #1e293b; border-radius:12px; padding:16px; }
        .tnd-widget--wide { grid-column: 1 / -1; }
        .tnd-widget header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
        .tnd-widget header h3 { margin:0; font-size:13px; font-weight:600; color:#cbd5e1; text-transform:uppercase; letter-spacing:.04em; }

        .tnd-chart-wrap { position:relative; height:240px; }

        .tnd-empty { padding:32px 16px; text-align:center; color:#64748b; font-size:13px; }
        .tnd-empty-large { padding:80px 16px; text-align:center; color:#64748b; font-size:14px; }

        /* Lists */
        .tnd-hi-list, .tnd-lex-list { list-style:none; margin:0; padding:0; max-height:280px; overflow-y:auto; }
        .tnd-hi-row, .tnd-lex-row { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid #1e293b; gap:12px; }
        .tnd-hi-row:last-child, .tnd-lex-row:last-child { border-bottom:none; }
        .tnd-hi-text, .tnd-lex-row > div { display:flex; flex-direction:column; min-width:0; flex:1; }
        .tnd-hi-term { font-size:13px; color:#f1f5f9; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tnd-hi-meta, .tnd-meta { font-size:11px; color:#64748b; margin-top:2px; }

        /* Pills */
        .tnd-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:500; text-transform:lowercase; }
        .tnd-pill--high { background:rgba(34,197,94,.15); color:#22c55e; }
        .tnd-pill--med  { background:rgba(245,158,11,.15); color:#f59e0b; }
        .tnd-pill--low  { background:rgba(148,163,184,.15); color:#94a3b8; }
        .tnd-pill--info { background:rgba(99,102,241,.15); color:#818cf8; }

        /* Tablas */
        .tnd-table-wrap { max-height:340px; overflow-y:auto; }
        .tnd-table { width:100%; border-collapse:collapse; font-size:13px; }
        .tnd-table thead th { position:sticky; top:0; background:#0f172a; padding:10px 12px; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#94a3b8; text-align:left; border-bottom:1px solid #1e293b; }
        .tnd-table tbody td { padding:10px 12px; border-bottom:1px solid #1e293b; color:#cbd5e1; vertical-align:top; }
        .tnd-table tbody tr:last-child td { border-bottom:none; }
        .tnd-table tbody tr:hover { background:rgba(99,102,241,.03); }
        .tnd-mono { font-family:'SF Mono', Menlo, monospace; font-size:12px; color:#94a3b8; }
        .tnd-tt-title { color:#e2e8f0; text-decoration:none; font-weight:500; }
        .tnd-tt-title:hover { color:#818cf8; text-decoration:underline; }
        .tnd-tt-meta { font-size:11px; color:#64748b; margin-top:4px; }
        .tnd-tt-meta em { color:#94a3b8; font-style:normal; font-weight:500; }

        /* Vera safe pill in widget header */
        .tnd-vera-safe-pill { font-size:11px; }

        /* Emerging cards */
        .tnd-emerg-pending { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; }
        .tnd-emerg-card { background:linear-gradient(135deg, rgba(99,102,241,.08), rgba(30,41,59,.4)); border:1px solid #334155; border-radius:12px; padding:14px; }
        .tnd-emerg-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:12px; }
        .tnd-emerg-name { margin:0; font-size:16px; font-weight:600; color:#f1f5f9; text-transform:capitalize; }
        .tnd-emerg-niche { font-size:12px; color:#94a3b8; margin-top:2px; text-transform:uppercase; letter-spacing:.04em; }
        .tnd-emerg-meta { font-size:12px; color:#cbd5e1; line-height:1.7; margin-bottom:12px; }
        .tnd-emerg-meta span { color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-right:6px; }
        .tnd-emerg-actions { display:flex; gap:8px; }
        .tnd-btn { flex:1; padding:8px 12px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; transition: all .15s; }
        .tnd-btn--approve { background:rgba(34,197,94,.15); color:#22c55e; }
        .tnd-btn--approve:hover { background:#22c55e; color:#fff; }
        .tnd-btn--reject  { background:rgba(239,68,68,.15); color:#ef4444; }
        .tnd-btn--reject:hover { background:#ef4444; color:#fff; }

        .tnd-emerg-approved-wrap { margin-top:20px; padding-top:14px; border-top:1px solid #1e293b; }
        .tnd-emerg-h3 { margin:0 0 8px; font-size:12px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; }
        .tnd-emerg-approved { list-style:none; margin:0; padding:0; }
        .tnd-emerg-approved li { padding:8px 0; font-size:13px; }
        .tnd-emerg-approved li strong { color:#e2e8f0; text-transform:capitalize; }
        .tnd-emerg-approved li .tnd-meta { margin-left:8px; }

        /* Pulse */
        .tnd-pulse-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px; margin-bottom:16px; }
        .tnd-pulse-card { background:rgba(30,41,59,.5); border:1px solid #1e293b; border-radius:10px; padding:14px 16px; }
        .tnd-pulse-type { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#94a3b8; margin-bottom:6px; }
        .tnd-pulse-now  { font-size:24px; font-weight:600; color:#f1f5f9; line-height:1; }
        .tnd-pulse-meta { font-size:11px; color:#64748b; margin-top:6px; }
        .tnd-pulse-templates { padding:14px 0; }
        .tnd-pulse-templates-title { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; margin-bottom:10px; }
        .tnd-tpl-pills { display:flex; flex-wrap:wrap; gap:6px; }
        .tnd-tpl-pill { display:inline-block; padding:4px 10px; border-radius:999px; background:rgba(99,102,241,.1); border:1px solid rgba(99,102,241,.3); color:#a5b4fc; font-size:11px; cursor:default; }
        .tnd-tpl-pill:hover { background:rgba(99,102,241,.2); }
        .tnd-pulse-note { margin-top:10px; padding:10px 14px; background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.3); border-radius:8px; font-size:12px; color:#fbbf24; }
      `;
      const style = document.createElement('style');
      style.id = 'tnd-css';
      style.textContent = css;
      document.head.appendChild(style);
    },

  });
})();
