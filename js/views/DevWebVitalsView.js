/**
 * DevWebVitalsView - Dashboard de Web Vitals (FEAT-027)
 *
 * Lee los samples que `js/utils/webvitals.js` envia a `frontend_errors`
 * (ctx->>'source' = 'webvital') via RPC `dashboard_web_vitals(p_days, p_route)`.
 * Muestra 5 cards (LCP/CLS/FCP/INP/TTFB) con p75 + p95 + samples + color segun
 * thresholds de Google, filtro de rango temporal + ruta, y sparkline de p75 por dia.
 *
 * Gated: el RPC valida is_developer() server-side (raise forbidden si no).
 */
class DevWebVitalsView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.days = 30;
    this.route = null;       // null = todas las rutas
    this.data = null;        // respuesta del RPC
  }

  // Thresholds Core Web Vitals de Google. unit: 'ms' | 'score'.
  static get METRICS() {
    return [
      { key: 'LCP', label: 'Largest Contentful Paint', unit: 'ms', good: 2500, ni: 4000 },
      { key: 'INP', label: 'Interaction to Next Paint', unit: 'ms', good: 200, ni: 500 },
      { key: 'CLS', label: 'Cumulative Layout Shift', unit: 'score', good: 0.1, ni: 0.25 },
      { key: 'FCP', label: 'First Contentful Paint', unit: 'ms', good: 1800, ni: 3000 },
      { key: 'TTFB', label: 'Time to First Byte', unit: 'ms', good: 800, ni: 1800 }
    ];
  }

  renderHTML() {
    return `
      <div class="dev-vitals-container">
        ${this._styles()}

        <div class="dev-vitals-toolbar">
          <div class="dev-vitals-filter">
            <label for="vitalsRange">Rango</label>
            <select id="vitalsRange">
              <option value="7">Ultimos 7 dias</option>
              <option value="30" selected>Ultimos 30 dias</option>
              <option value="90">Ultimos 90 dias</option>
            </select>
          </div>
          <div class="dev-vitals-filter">
            <label for="vitalsRoute">Ruta</label>
            <select id="vitalsRoute"><option value="">Todas las rutas</option></select>
          </div>
          <div class="dev-vitals-meta" id="vitalsMeta"></div>
        </div>

        <div class="dev-vitals-grid" id="vitalsGrid">
          ${this._skeletonCards()}
        </div>

        <section class="dev-vitals-trend">
          <h2 class="dev-vitals-trend-title">Tendencia de p75 por dia</h2>
          <div class="dev-vitals-trend-grid" id="vitalsTrend"></div>
        </section>
      </div>
    `;
  }

  async init() {
    await this._initSupabase();
    this._bindEvents();
    await this._load();
  }

  async _initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
    } catch (e) {
      console.error('[WebVitals] supabase init', e);
    }
  }

  _bindEvents() {
    const range = this.container.querySelector('#vitalsRange');
    const route = this.container.querySelector('#vitalsRoute');
    if (range) range.addEventListener('change', () => { this.days = parseInt(range.value, 10) || 30; this._load(); });
    if (route) route.addEventListener('change', () => { this.route = route.value || null; this._load(); });
  }

  async _load() {
    const grid = this.container.querySelector('#vitalsGrid');
    const meta = this.container.querySelector('#vitalsMeta');
    if (grid) grid.innerHTML = this._skeletonCards();
    if (!this.supabase) { if (grid) grid.innerHTML = this._errorCard('No hay conexion con Supabase'); return; }
    try {
      const { data, error } = await this.supabase.rpc('dashboard_web_vitals', { p_days: this.days, p_route: this.route });
      if (error) throw error;
      this.data = data || {};
      this._renderCards();
      this._renderTrend();
      this._populateRoutes();
      if (meta) meta.textContent = `${(this.data.total_samples || 0).toLocaleString()} muestras`;
    } catch (e) {
      console.error('[WebVitals] RPC', e);
      const msg = (e && /forbidden|42501/i.test(e.message || e.code || '')) ? 'Acceso solo para desarrolladores' : (e.message || 'Error cargando datos');
      if (grid) grid.innerHTML = this._errorCard(msg);
    }
  }

  _cardsByMetric() {
    const map = {};
    (this.data?.cards || []).forEach(c => { map[c.metric] = c; });
    return map;
  }

  _renderCards() {
    const grid = this.container.querySelector('#vitalsGrid');
    if (!grid) return;
    const byMetric = this._cardsByMetric();
    grid.innerHTML = DevWebVitalsView.METRICS.map(m => {
      const c = byMetric[m.key];
      if (!c || c.samples == null) {
        return `<article class="dev-vitals-card is-empty">
          <div class="dev-vitals-card-key">${m.key}</div>
          <div class="dev-vitals-card-label">${m.label}</div>
          <div class="dev-vitals-card-empty">Sin muestras</div>
        </article>`;
      }
      const status = this._status(m, Number(c.p75));
      return `<article class="dev-vitals-card status-${status.cls}">
        <div class="dev-vitals-card-head">
          <span class="dev-vitals-card-key">${m.key}</span>
          <span class="dev-vitals-badge status-${status.cls}">${status.label}</span>
        </div>
        <div class="dev-vitals-card-label">${m.label}</div>
        <div class="dev-vitals-card-value">${this._fmt(m, Number(c.p75))}</div>
        <div class="dev-vitals-card-foot">
          <span>p95 ${this._fmt(m, Number(c.p95))}</span>
          <span>${Number(c.samples).toLocaleString()} muestras</span>
        </div>
      </article>`;
    }).join('');
  }

  _renderTrend() {
    const wrap = this.container.querySelector('#vitalsTrend');
    if (!wrap) return;
    const trend = this.data?.trend || [];
    const byMetric = {};
    trend.forEach(t => { (byMetric[t.metric] = byMetric[t.metric] || []).push(t); });
    wrap.innerHTML = DevWebVitalsView.METRICS.map(m => {
      const series = (byMetric[m.key] || []).map(t => Number(t.p75)).filter(v => !Number.isNaN(v));
      if (series.length < 2) {
        return `<div class="dev-vitals-spark"><span class="dev-vitals-spark-key">${m.key}</span><span class="dev-vitals-spark-empty">datos insuficientes</span></div>`;
      }
      const last = series[series.length - 1];
      const status = this._status(m, last);
      return `<div class="dev-vitals-spark">
        <span class="dev-vitals-spark-key">${m.key}</span>
        ${this._sparkline(series, status.color)}
        <span class="dev-vitals-spark-last status-${status.cls}">${this._fmt(m, last)}</span>
      </div>`;
    }).join('');
  }

  _populateRoutes() {
    const sel = this.container.querySelector('#vitalsRoute');
    if (!sel || sel.dataset.filled === '1') return;
    const routes = (this.data?.routes || []).filter(Boolean).sort();
    if (!routes.length) return;
    sel.insertAdjacentHTML('beforeend', routes.map(r => `<option value="${this.escapeHtml(r)}">${this.escapeHtml(r)}</option>`).join(''));
    sel.dataset.filled = '1';
  }

  // ── helpers de presentacion ──────────────────────────────────────
  _status(metric, v) {
    if (v <= metric.good) return { cls: 'good', label: 'Bien', color: '#3fb950' };
    if (v <= metric.ni)   return { cls: 'ni', label: 'Mejorable', color: '#d29922' };
    return { cls: 'poor', label: 'Malo', color: '#f85149' };
  }

  _fmt(metric, v) {
    if (metric.unit === 'score') return v.toFixed(3);
    if (v >= 1000) return (v / 1000).toFixed(2) + ' s';
    return Math.round(v) + ' ms';
  }

  _sparkline(values, color) {
    const w = 120, h = 28, pad = 2;
    const min = Math.min(...values), max = Math.max(...values);
    const span = (max - min) || 1;
    const step = (w - pad * 2) / (values.length - 1);
    const pts = values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="dev-vitals-spark-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  _skeletonCards() {
    return DevWebVitalsView.METRICS.map(m => `<article class="dev-vitals-card is-loading">
      <div class="dev-vitals-card-key">${m.key}</div>
      <div class="dev-vitals-card-label">${m.label}</div>
      <div class="dev-vitals-skeleton"></div>
    </article>`).join('');
  }

  _errorCard(msg) {
    return `<div class="dev-vitals-error"><i class="fas fa-triangle-exclamation"></i> ${this.escapeHtml(msg)}</div>`;
  }

  _styles() {
    return `<style>
      .dev-vitals-container { padding: 1.5rem 2rem; max-width: 1100px; margin: 0 auto; }
      .dev-vitals-toolbar { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; margin: 1.25rem 0; }
      .dev-vitals-filter { display: flex; flex-direction: column; gap: .35rem; }
      .dev-vitals-filter label { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: #9aa0a6; }
      .dev-vitals-filter select { background: #141517; border: 1px solid #242424; color: #e6e6e6; border-radius: 8px; padding: .5rem .75rem; min-width: 180px; }
      .dev-vitals-meta { margin-left: auto; color: #9aa0a6; font-size: .85rem; align-self: center; }
      .dev-vitals-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; }
      .dev-vitals-card { background: #141517; border: 1px solid #242424; border-radius: 14px; padding: 1.1rem 1.2rem; position: relative; }
      .dev-vitals-card.status-good { border-color: rgba(63,185,80,.35); }
      .dev-vitals-card.status-ni { border-color: rgba(210,153,34,.35); }
      .dev-vitals-card.status-poor { border-color: rgba(248,81,73,.4); }
      .dev-vitals-card-head { display: flex; justify-content: space-between; align-items: center; }
      .dev-vitals-card-key { font-weight: 700; font-size: 1rem; color: #e6e6e6; letter-spacing: .02em; }
      .dev-vitals-card-label { font-size: .74rem; color: #9aa0a6; margin-top: .15rem; }
      .dev-vitals-card-value { font-size: 1.9rem; font-weight: 700; margin: .55rem 0 .35rem; }
      .dev-vitals-card.status-good .dev-vitals-card-value { color: #3fb950; }
      .dev-vitals-card.status-ni .dev-vitals-card-value { color: #d29922; }
      .dev-vitals-card.status-poor .dev-vitals-card-value { color: #f85149; }
      .dev-vitals-card-foot { display: flex; justify-content: space-between; font-size: .74rem; color: #9aa0a6; }
      .dev-vitals-badge { font-size: .66rem; padding: .15rem .5rem; border-radius: 999px; font-weight: 600; }
      .dev-vitals-badge.status-good { background: rgba(63,185,80,.15); color: #3fb950; }
      .dev-vitals-badge.status-ni { background: rgba(210,153,34,.15); color: #d29922; }
      .dev-vitals-badge.status-poor { background: rgba(248,81,73,.15); color: #f85149; }
      .dev-vitals-card-empty, .dev-vitals-card.is-empty .dev-vitals-card-label { color: #6b7177; }
      .dev-vitals-card-empty { margin-top: .9rem; font-size: .9rem; }
      .dev-vitals-skeleton { height: 1.9rem; margin: .55rem 0; border-radius: 6px; background: linear-gradient(90deg,#1c1d1f,#242527,#1c1d1f); background-size: 200% 100%; animation: vitalsShimmer 1.2s infinite; }
      @keyframes vitalsShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      .dev-vitals-trend { margin-top: 2rem; }
      .dev-vitals-trend-title { font-size: .95rem; color: #e6e6e6; margin-bottom: .9rem; }
      .dev-vitals-trend-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem; }
      .dev-vitals-spark { display: flex; align-items: center; gap: .6rem; background: #141517; border: 1px solid #242424; border-radius: 10px; padding: .6rem .8rem; }
      .dev-vitals-spark-key { font-weight: 700; font-size: .8rem; color: #9aa0a6; width: 38px; }
      .dev-vitals-spark-svg { flex: 1; height: 28px; }
      .dev-vitals-spark-last { font-size: .85rem; font-weight: 600; }
      .dev-vitals-spark-last.status-good { color: #3fb950; }
      .dev-vitals-spark-last.status-ni { color: #d29922; }
      .dev-vitals-spark-last.status-poor { color: #f85149; }
      .dev-vitals-spark-empty { font-size: .76rem; color: #6b7177; flex: 1; }
      .dev-vitals-error { background: #141517; border: 1px solid rgba(248,81,73,.4); color: #f85149; border-radius: 12px; padding: 1.25rem; grid-column: 1 / -1; }
    </style>`;
  }
}

window.DevWebVitalsView = DevWebVitalsView;
