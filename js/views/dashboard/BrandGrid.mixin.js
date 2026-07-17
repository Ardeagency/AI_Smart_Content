/**
 * DashboardView — BrandGrid mixin (Mi Marca, rediseño 2026-07).
 *
 * Reemplaza el cuerpo vacío del tab Mi Marca por un GRID de cards que leen
 * datos crudos de brand_posts (sin clasificador). Cards iniciales:
 *   1. Actividad de publicación — barras APILADAS por red (todas: ig/fb/tiktok/x/yt)
 *      por periodo, con estado + barra de salud + filtro Semana/Mes/Año/Todo.
 *   2. Latidos — impacto social digital por periodo (heart-rate), todas las redes.
 *
 * RPCs (Fase 2, ya desacopladas del clasificador):
 *   - dashboard_mimarca_health           → salud 0-100 (cadencia+impacto+recencia)
 *   - dashboard_mimarca_activity         → { status, networks[], series[] } por red/periodo
 *   - dashboard_brand_engagement_trend   → filas con social_impact ponderado por periodo
 *
 * Charts vía Chart.js (this._ensureChartJs / this._reg / this._destroyCharts).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const WINDOWS = [
    { k: 'week',  days: 7,    label: () => __('Semana') },
    { k: 'month', days: 30,   label: () => __('Mes') },
    { k: 'year',  days: 365,  label: () => __('Año') },
    { k: 'all',   days: null, label: () => __('Todo') },
  ];

  // Etiqueta legible por red.
  const NET_LABEL = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    x: 'X', twitter: 'X', youtube: 'YouTube', linkedin: 'LinkedIn',
  };

  const STATUS_LABEL = {
    activo: () => __('Activo'), irregular: () => __('Irregular'),
    lento: () => __('Lento'), dormido: () => __('Dormido'), sin_datos: () => __('Sin datos'),
  };

  Object.assign(DashboardView.prototype, {

    /* ── Entry point del grid de Mi Marca ── */
    async _renderBrandGrid(body) {
      if (!body) return true;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return true; }
      if (this._gridWindow == null) this._gridWindow = 'month';

      // Shell una sola vez (persistente entre refresh); los charts se repintan.
      if (!body.querySelector('.bgrid')) {
        body.innerHTML = this._buildBrandGridShell();
        this._bindBrandGrid(body);
      }
      await this._gridLoadAndPaint(body);
      return true;
    },

    _buildBrandGridShell() {
      const seg = WINDOWS.map((w) => `
        <button type="button" class="bgrid-seg-btn${w.k === this._gridWindow ? ' is-active' : ''}" data-window="${w.k}" role="tab">${this._esc(w.label())}</button>`).join('');
      return `
        <div class="bgrid">
          <section class="bgrid-card glass-black bgrid-card--activity">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--actividad" aria-hidden="true"></i>${this._esc(__('Actividad de publicación'))}</span>
            </header>
            <div class="bgrid-status" id="bgridStatus"></div>
            <nav class="bgrid-seg" role="tablist" aria-label="${this._esc(__('Periodo'))}">${seg}</nav>
            <div class="bgrid-chart-wrap"><canvas id="bgridActivityChart"></canvas><div class="bgrid-empty" id="bgridActivityEmpty" hidden>${this._esc(__('Sin publicaciones en este periodo'))}</div></div>
            <footer class="bgrid-card-foot" id="bgridActivityFoot"></footer>
          </section>
          <section class="bgrid-card glass-black bgrid-card--latidos">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${this._esc(__('Latidos'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('El impacto social que producen tus redes'))}</p>
            <div class="bgrid-chart-wrap bgrid-chart-wrap--latidos"><canvas id="bgridLatidosChart"></canvas><div class="bgrid-empty" id="bgridLatidosEmpty" hidden>${this._esc(__('Sin señal de impacto en este periodo'))}</div></div>
          </section>
        </div>`;
    },

    _bindBrandGrid(body) {
      if (body.dataset.bgridBound === '1') return;
      body.dataset.bgridBound = '1';
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-window]');
        if (!btn) return;
        const k = btn.dataset.window;
        if (!k || k === this._gridWindow) return;
        this._gridWindow = k;
        body.querySelectorAll('.bgrid-seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.window === k));
        this._gridLoadAndPaint(body);
      });
    },

    _gridWindowDays() {
      return (WINDOWS.find((w) => w.k === this._gridWindow) || WINDOWS[1]).days;
    },

    /** Fecha del último post propio (cacheada) para anclar las ventanas. */
    async _gridLastOwnPost() {
      try {
        if (!this._gridBcIds) {
          const { data: cs } = await this._supabase.from('brand_containers').select('id').eq('organization_id', this._orgId);
          this._gridBcIds = (cs || []).map((c) => c.id).filter(Boolean);
        }
        if (!this._gridBcIds.length) return null;
        const { data } = await this._supabase.from('brand_posts')
          .select('captured_at').in('brand_container_id', this._gridBcIds)
          .eq('post_source', 'own').order('captured_at', { ascending: false }).limit(1);
        return (data && data[0] && data[0].captured_at) ? new Date(data[0].captured_at) : null;
      } catch (_) { return null; }
    },

    async _loadBrandGridData() {
      const days = this._gridWindowDays();
      // Ancla al último post propio: si la marca lleva días sin publicar, "Semana"
      // (últimos 7 días) saldría vacía. Anclando, cada filtro muestra la data más
      // reciente disponible en su granularidad.
      const now = new Date();
      const last = await this._gridLastOwnPost();
      const anchor = (last && last < now) ? last : now;
      const dateTo = anchor.toISOString();
      const dateFrom = (days == null ? new Date('2015-01-01') : new Date(anchor.getTime() - days * 86400000)).toISOString();
      const p = { p_org_id: this._orgId, p_date_from: dateFrom, p_date_to: dateTo };
      // rpc() devuelve un builder thenable (sin .catch nativo): Promise.resolve lo
      // normaliza a Promise real antes de encadenar el fallback.
      const call = (fn, params) => Promise.resolve(this._supabase.rpc(fn, params)).catch(() => ({ data: null }));
      const [h, a, i] = await Promise.all([
        call('dashboard_mimarca_health', p),
        call('dashboard_mimarca_activity', p),
        call('dashboard_brand_engagement_trend', { ...p, p_post_source: 'own' }),
      ]);
      return {
        health: h?.data || null,
        activity: a?.data || null,
        impact: Array.isArray(i?.data) ? i.data : [],
      };
    },

    async _gridLoadAndPaint(body) {
      let data;
      try { data = await this._loadBrandGridData(); }
      catch (e) { console.warn('[BrandGrid] load failed:', e); return; }
      this._paintGridStatus(body, data);
      try { await this._ensureChartJs(); } catch (_) {}
      this._destroyCharts();
      this._paintActivityChart(body, data);
      this._paintLatidosChart(body, data);
    },

    /* Estado (pill) + barra de salud. */
    _paintGridStatus(body, data) {
      const host = body.querySelector('#bgridStatus');
      if (!host) return;
      const h = data.health || {};
      const st = data.activity?.status || 'sin_datos';
      const stLabel = (STATUS_LABEL[st] || STATUS_LABEL.sin_datos)();
      const score = (h.score == null) ? null : Math.round(Number(h.score));
      const verdictLabel = { saludable: __('Saludable'), atencion: __('Atención'), critico: __('Crítico') }[h.verdict] || '';
      const bar = (score == null)
        ? `<div class="bgrid-health-empty">${this._esc(__('Conecta tus plataformas para ver la salud de tu marca.'))}</div>`
        : `
          <div class="bgrid-health">
            <div class="bgrid-health-top">
              <span class="bgrid-health-label">${this._esc(__('Salud de tu marca'))}</span>
              <span class="bgrid-health-score">${score}<span class="bgrid-health-max">/100</span></span>
            </div>
            <div class="bgrid-health-track"><div class="bgrid-health-fill" data-verdict="${this._esc(h.verdict || '')}" style="width:${Math.max(2, Math.min(100, score))}%"></div></div>
            ${verdictLabel ? `<span class="bgrid-health-verdict">${this._esc(verdictLabel)}</span>` : ''}
          </div>`;
      host.innerHTML = `
        <div class="bgrid-status-row">
          <span class="bgrid-status-pill" data-status="${this._esc(st)}"><i class="bgrid-status-dot" aria-hidden="true"></i>${this._esc(stLabel)}</span>
        </div>
        ${bar}`;

      // Footer: última publicación / total en el periodo.
      const foot = body.querySelector('#bgridActivityFoot');
      if (foot) {
        const total = Number(data.activity?.total || 0);
        const days = data.activity?.days_since;
        const last = (days == null) ? __('Sin publicaciones recientes')
          : (days <= 0 ? __('Publicaste hoy') : __('Hace {n} días', { n: Math.round(days) }));
        foot.innerHTML = `<span>${this._esc(__('{n} publicaciones', { n: total }))}</span><span class="bgrid-foot-sep">·</span><span>${this._esc(last)}</span>`;
      }
    },

    /* Acento vivo de marca para los charts. NUNCA negro: los charts se pintan
       sobre el degradado oscuro, así que un tono oscuro se pierde. Priorizamos
       las CSS vars de marca (las mismas que tiñen la barra de salud en naranja)
       y descartamos hexes casi-negros de getLastBrandHexes. */
    _gridBrandHexes() {
      const isVivid = (h) => { try { const [r, g, b] = this._hexToRgb(h); return (r + g + b) > 180; } catch (_) { return false; } };
      const cs = getComputedStyle(document.documentElement);
      const light = (cs.getPropertyValue('--brand-color-light') || '').trim();
      const dark = (cs.getPropertyValue('--brand-color-dark') || '').trim();
      // 1) var de marca viva; 2) hex vivo del tema dinámico; 3) naranja plataforma.
      const candidates = [light, dark];
      try {
        const hexes = window.OrgBrandTheme?.getLastBrandHexes?.();
        if (Array.isArray(hexes)) candidates.push(...hexes);
      } catch (_) {}
      const vivid = candidates.filter(Boolean).find(isVivid);
      return [vivid || '#FF6A1A'];
    },

    _hexToRgb(hex) {
      const m = String(hex).replace('#', '');
      const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
      const int = parseInt(n, 16);
      return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
    },

    /* Chart 1: barras apiladas por red. */
    _paintActivityChart(body, data) {
      const Chart = window.Chart;
      const canvas = body.querySelector('#bgridActivityChart');
      const empty = body.querySelector('#bgridActivityEmpty');
      const series = Array.isArray(data.activity?.series) ? data.activity.series : [];
      if (!Chart || !canvas) return;
      if (!series.length) { canvas.hidden = true; if (empty) empty.hidden = false; return; }
      canvas.hidden = false; if (empty) empty.hidden = true;

      // Redes presentes, ordenadas por volumen total (stacking estable).
      const totals = {};
      series.forEach((b) => Object.entries(b.networks || {}).forEach(([n, c]) => { totals[n] = (totals[n] || 0) + Number(c || 0); }));
      const nets = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
      const [accent] = this._gridBrandHexes();
      const [r, g, bl] = this._hexToRgb(accent);
      const alphas = [1, 0.72, 0.5, 0.34, 0.22, 0.15];

      const labels = series.map((b) => b.label);
      const datasets = nets.map((n, idx) => ({
        label: NET_LABEL[n] || (n.charAt(0).toUpperCase() + n.slice(1)),
        data: series.map((b) => Number(b.networks?.[n] || 0)),
        backgroundColor: `rgba(${r},${g},${bl},${alphas[idx] != null ? alphas[idx] : 0.12})`,
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 30,
        categoryPercentage: 0.6,
        barPercentage: 0.92,
        stack: 'posts',
      }));

      const TICK = 'rgba(255,255,255,0.55)';
      const GRID = 'rgba(255,255,255,0.06)';
      this._reg(new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { color: TICK, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
            tooltip: { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10 },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: TICK, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { stacked: true, grid: { color: GRID }, border: { display: false }, beginAtZero: true, ticks: { color: TICK, font: { size: 10 }, precision: 0, maxTicksLimit: 5 } },
          },
        },
      }));
    },

    /* Chart 2: Latidos — impacto social por periodo, intensidad = color. */
    _paintLatidosChart(body, data) {
      const Chart = window.Chart;
      const canvas = body.querySelector('#bgridLatidosChart');
      const empty = body.querySelector('#bgridLatidosEmpty');
      if (!Chart || !canvas) return;

      // Sumar social_impact por periodo (filas = periodo × marca).
      const byBucket = new Map();
      (data.impact || []).forEach((row) => {
        const key = row.period_start || row.period_label;
        const prev = byBucket.get(key) || { label: row.period_label, v: 0 };
        prev.v += Number(row.social_impact || 0);
        byBucket.set(key, prev);
      });
      const buckets = Array.from(byBucket.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([, v]) => v);
      if (!buckets.length) { canvas.hidden = true; if (empty) empty.hidden = false; return; }
      canvas.hidden = false; if (empty) empty.hidden = true;

      const [accent] = this._gridBrandHexes();
      const [r, g, bl] = this._hexToRgb(accent);
      const max = Math.max(1, ...buckets.map((b) => b.v));
      // CANDLESTICK / latido: cada barra FLOTA centrada en la línea media; su
      // media-altura crece con el impacto (raíz → los latidos chicos siguen
      // visibles y el pico no aplasta al resto). Intensidad = color.
      const floatData = buckets.map((b) => {
        const half = Math.max(0.02, 0.46 * Math.sqrt(b.v / max));
        return [0.5 - half, 0.5 + half];
      });
      // Dos tonos como el heart-rate de referencia: latido bajo = gris,
      // latido alto = naranja de marca. Se interpola por intensidad.
      const colors = buckets.map((b) => {
        const t = Math.sqrt(b.v / max);
        const mix = (from, to) => Math.round(from + (to - from) * t);
        const a = (0.45 + 0.55 * t).toFixed(3);
        return `rgba(${mix(145, r)},${mix(145, g)},${mix(150, bl)},${a})`;
      });
      const TICK = 'rgba(255,255,255,0.5)';

      this._reg(new Chart(canvas, {
        type: 'bar',
        data: { labels: buckets.map((b) => b.label), datasets: [{
          label: __('Impacto social'),
          data: floatData,
          backgroundColor: colors,
          borderRadius: 20,
          borderSkipped: false,
          maxBarThickness: 9,
          categoryPercentage: 0.9,
          barPercentage: 0.55,
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10,
              callbacks: { label: (c) => `${__('Impacto')}: ${Math.round(buckets[c.dataIndex].v).toLocaleString()}` } },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: TICK, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
            y: { min: 0, max: 1, display: false, grid: { display: false }, border: { display: false } },
          },
        },
      }));
    },
  });
})();
