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
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--actividad" aria-hidden="true"></i>${this._esc(__('Tráfico'))}</span>
              <button type="button" class="bgrid-details-btn" data-salud-details aria-label="${this._esc(__('Ver detalles de salud'))}" title="${this._esc(__('Ver detalles de salud'))}"><i class="aisc-ico aisc-ico--chart-bar" aria-hidden="true"></i></button>
            </header>
            <div class="bgrid-salud-arc" id="bgridSaludArc"></div>
            <nav class="bgrid-seg" role="tablist" aria-label="${this._esc(__('Periodo'))}">${seg}</nav>
            <div class="bgrid-chart-wrap"><canvas id="bgridActivityChart"></canvas><div class="bgrid-empty" id="bgridActivityEmpty" hidden>${this._esc(__('Sin publicaciones en este periodo'))}</div></div>
            <footer class="bgrid-card-foot" id="bgridActivityFoot"></footer>
          </section>
          <section class="bgrid-card glass-black bgrid-card--latidos">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${this._esc(__('Interacciones'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('Cuántas interacciones producen tus redes por periodo · toca una barra para ver ese día'))}</p>
            <div class="bgrid-chart-wrap bgrid-chart-wrap--latidos"><canvas id="bgridLatidosChart"></canvas><div class="bgrid-empty" id="bgridLatidosEmpty" hidden>${this._esc(__('Sin señal de impacto en este periodo'))}</div></div>
          </section>
        </div>`;
    },

    _bindBrandGrid(body) {
      if (body.dataset.bgridBound === '1') return;
      body.dataset.bgridBound = '1';
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-salud-details]')) { this._openSaludDetails(this._gridHealth); return; }
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
        call('dashboard_mimarca_health_v2', p),
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
      this._gridHealth = data.health || null;
      this._paintSaludArc(body, data);
      this._paintGridStatus(body, data);
      try { await this._ensureChartJs(); } catch (_) {}
      this._destroyCharts();
      this._paintActivityChart(body, data);
      this._paintLatidosChart(body, data);
    },

    /* Arco (gauge) de salud de marca. Solo el arco + score; el desglose va al modal. */
    _paintSaludArc(body, data) {
      const host = body.querySelector('#bgridSaludArc');
      if (!host) return;
      const h = data.health || {};
      const score = (h.score == null) ? null : Math.round(Number(h.score));
      const verdictLabel = { saludable: __('Saludable'), atencion: __('Atención'), critico: __('Crítico') }[h.verdict] || '';
      if (score == null) {
        host.innerHTML = `<div class="bgrid-arc-empty">${this._esc(__('Conecta tus plataformas para ver la salud de tu marca.'))}</div>`;
        return;
      }
      const [accent] = this._gridBrandHexes();
      const pct = Math.max(0, Math.min(100, score));
      const R = 80, LEN = Math.PI * R;          // longitud del semicírculo
      const dash = LEN * pct / 100;
      host.innerHTML = `
        <div class="bgrid-arc">
          <svg class="bgrid-arc-svg" viewBox="0 0 200 118" role="img" aria-label="${this._esc(__('Salud'))} ${score}/100">
            <defs><linearGradient id="bgridSaludGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="rgba(255,255,255,0.55)"/><stop offset="1" stop-color="${this._esc(accent)}"/>
            </linearGradient></defs>
            <path d="M 18 98 A 80 80 0 0 1 182 98" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="15" stroke-linecap="round"/>
            <path d="M 18 98 A 80 80 0 0 1 182 98" fill="none" stroke="url(#bgridSaludGrad)" stroke-width="15" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${LEN.toFixed(1)}"/>
          </svg>
          <div class="bgrid-arc-center">
            <span class="bgrid-arc-score">${score}<span class="bgrid-arc-max">/100</span></span>
            ${verdictLabel ? `<span class="bgrid-arc-verdict" data-verdict="${this._esc(h.verdict || '')}">${this._esc(verdictLabel)}</span>` : ''}
          </div>
        </div>`;
    },

    /* Modal de desglose de salud por canal + métrica. */
    _openSaludDetails(h) {
      if (!h || !Array.isArray(h.channels) || !h.channels.length) return;
      const esc = (s) => this._esc(s);
      const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
      const chans = h.channels.map((c) => `
        <div class="salud-ch">
          <div class="salud-ch-head">
            <span class="salud-ch-name">${esc(c.label)}</span>
            <span class="salud-ch-score" data-ok="${c.healthy ? '1' : '0'}">${clamp(c.score)}%</span>
          </div>
          ${(c.metrics || []).map((m) => {
            const on = Math.round(clamp(m.score) / 100 * 28);
            const segs = Array.from({ length: 28 }, (_, i) => `<i class="salud-seg${i < on ? ' is-on' : ''}"></i>`).join('');
            return `
            <div class="salud-metric">
              <div class="salud-metric-top"><span>${esc(m.label)}</span><span class="salud-metric-pct">${clamp(m.score)}%</span></div>
              <div class="salud-seg-bar" data-ok="${clamp(m.score) >= 70 ? '1' : '0'}">${segs}</div>
            </div>`;
          }).join('')}
        </div>`).join('');
      const overlay = document.createElement('div');
      overlay.className = 'salud-overlay';
      overlay.innerHTML = `
        <div class="salud-modal" role="dialog" aria-modal="true">
          <div class="salud-modal-head">
            <span class="salud-modal-title">${esc(__('Salud por canal'))}</span>
            <button type="button" class="salud-modal-close" aria-label="${esc(__('Cerrar'))}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
          </div>
          <div class="salud-modal-body">${chans}</div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.salud-modal-close')) close(); });
      document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
    },

    /* Footer del tráfico (última publicación / total). El pill de estado se eliminó. */
    _paintGridStatus(body, data) {
      const foot = body.querySelector('#bgridActivityFoot');
      if (!foot) return;
      const total = Number(data.activity?.total || 0);
      const days = data.activity?.days_since;
      const last = (days == null) ? __('Sin publicaciones recientes')
        : (days <= 0 ? __('Publicaste hoy') : __('Hace {n} días', { n: Math.round(days) }));
      foot.innerHTML = `<span>${this._esc(__('{n} publicaciones', { n: total }))}</span><span class="bgrid-foot-sep">·</span><span>${this._esc(last)}</span>`;
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

    /* Chart 2: Interacciones — TOTAL de interacciones (likes+comentarios+
       reproducciones+guardados+…) por periodo. Suma cruda (total_engagement),
       no ponderada. Click en una barra → publicaciones de ese día. */
    _paintLatidosChart(body, data) {
      const Chart = window.Chart;
      const canvas = body.querySelector('#bgridLatidosChart');
      const empty = body.querySelector('#bgridLatidosEmpty');
      if (!Chart || !canvas) return;

      // Sumar total de interacciones por periodo (filas = periodo × marca).
      const byBucket = new Map();
      (data.impact || []).forEach((row) => {
        const key = row.period_start || row.period_label;
        const prev = byBucket.get(key) || { label: row.period_label, v: 0, start: row.period_start, end: row.period_end };
        prev.v += Number(row.total_engagement || 0);
        byBucket.set(key, prev);
      });
      const buckets = Array.from(byBucket.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([, v]) => v);
      if (!buckets.length) { canvas.hidden = true; if (empty) empty.hidden = false; return; }
      canvas.hidden = false; if (empty) empty.hidden = true;

      const [accent] = this._gridBrandHexes();
      const [r, g, bl] = this._hexToRgb(accent);
      const max = Math.max(1, ...buckets.map((b) => b.v));
      // CANDLESTICK / latido: cada barra FLOTA centrada en la línea media. La
      // altura usa escala LOGARÍTMICA: el rango real es enorme (un periodo puede
      // tener 260x otro), y con raíz/lineal los periodos chicos quedan como
      // puntitos. Log comprime el rango → todos los periodos se ven como barras
      // con variación. Intensidad = color.
      const norm = (v) => Math.log((v || 0) + 1) / Math.log(max + 1);
      const floatData = buckets.map((b) => {
        const half = Math.max(0.06, 0.46 * norm(b.v));
        return [0.5 - half, 0.5 + half];
      });
      // Dos tonos como el heart-rate de referencia: latido bajo = gris,
      // latido alto = naranja de marca. Se interpola por intensidad.
      const colors = buckets.map((b) => {
        const t = norm(b.v);
        const mix = (from, to) => Math.round(from + (to - from) * t);
        const a = (0.45 + 0.55 * t).toFixed(3);
        return `rgba(${mix(145, r)},${mix(145, g)},${mix(150, bl)},${a})`;
      });
      const TICK = 'rgba(255,255,255,0.5)';

      this._reg(new Chart(canvas, {
        type: 'bar',
        data: { labels: buckets.map((b) => b.label), datasets: [{
          label: __('Interacciones'),
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
          interaction: { mode: 'index', intersect: false },
          onClick: (evt, els) => {
            const idx = (els && els.length) ? els[0].index : null;
            if (idx != null && buckets[idx]) this._openInteraccionesDay(buckets[idx]);
          },
          onHover: (evt, els) => { evt.native.target.style.cursor = (els && els.length) ? 'pointer' : 'default'; },
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10,
              callbacks: { label: (c) => `${__('Interacciones')}: ${Math.round(buckets[c.dataIndex].v).toLocaleString()}` } },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: TICK, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
            y: { min: 0, max: 1, display: false, grid: { display: false }, border: { display: false } },
          },
        },
      }));
    },

    /* Drill-down: publicaciones del periodo clickeado, ordenadas por interacciones
       (la primera = la que más produjo). */
    async _openInteraccionesDay(bucket) {
      const ids = this._gridBcIds || [];
      if (!ids.length || !bucket) return;
      let rows = [];
      try {
        let q = this._supabase.from('brand_posts')
          .select('network, content, engagement_total, captured_at, profile_handle')
          .in('brand_container_id', ids).eq('post_source', 'own')
          .order('engagement_total', { ascending: false, nullsFirst: false }).limit(50);
        if (bucket.start) q = q.gte('captured_at', bucket.start);
        if (bucket.end) q = q.lt('captured_at', bucket.end);
        const { data } = await q;
        rows = Array.isArray(data) ? data : [];
      } catch (_) {}
      const esc = (s) => this._esc(s);
      const fmtNet = (n) => NET_LABEL[String(n || '').toLowerCase()] || (n ? n.charAt(0).toUpperCase() + n.slice(1) : '—');
      const body = rows.length
        ? rows.map((p, i) => `
            <div class="inter-post${i === 0 ? ' inter-post--top' : ''}">
              <div class="inter-post-head">
                <span class="inter-post-net">${esc(fmtNet(p.network))}</span>
                ${i === 0 ? `<span class="inter-post-badge">${esc(__('Más interacciones'))}</span>` : ''}
                <span class="inter-post-eng">${Number(p.engagement_total || 0).toLocaleString()}</span>
              </div>
              ${p.content ? `<div class="inter-post-snippet">${esc(String(p.content).slice(0, 160))}</div>` : ''}
            </div>`).join('')
        : `<div class="inter-empty">${esc(__('Sin publicaciones ese periodo'))}</div>`;
      const overlay = document.createElement('div');
      overlay.className = 'salud-overlay';
      overlay.innerHTML = `
        <div class="salud-modal" role="dialog" aria-modal="true">
          <div class="salud-modal-head">
            <span class="salud-modal-title">${esc(__('Interacciones'))} · ${esc(bucket.label || '')}</span>
            <button type="button" class="salud-modal-close" aria-label="${esc(__('Cerrar'))}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
          </div>
          <div class="salud-modal-body">${body}</div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.salud-modal-close')) close(); });
      document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
    },
  });
})();
