/**
 * AudienceMap — choropleth de impressions por país.
 *
 * Estrategia:
 *   · Desktop (>480px): chartjs-chart-geo + world-atlas TopoJSON, color por intensidad.
 *   · Mobile (<=480px): fallback lista flag+barra (mejor legibilidad).
 *
 * Lazy-load: chart.js + chartjs-chart-geo + topojson solo cuando el componente
 * monta. Cache de topojson en memoria entre re-mounts del SPA.
 *
 * Uso:
 *   await window.AudienceMap.render(container, {
 *     'MX': 50000, 'CO': 12000, 'US': 4000
 *   });
 */
(function () {
  const CHARTJS_URL    = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
  const GEO_PLUGIN_URL = 'https://cdn.jsdelivr.net/npm/chartjs-chart-geo@4.3.1';
  const ATLAS_URL      = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

  let _topology = null;
  let _scriptsReady = null;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function loadScript(url, globalKey) {
    return new Promise((resolve, reject) => {
      if (globalKey && window[globalKey]) return resolve();
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload  = () => resolve();
      s.onerror = () => reject(new Error(`load ${url}`));
      document.head.appendChild(s);
    });
  }

  async function ensureScripts() {
    if (_scriptsReady) return _scriptsReady;
    _scriptsReady = (async () => {
      await loadScript(CHARTJS_URL, 'Chart');
      await loadScript(GEO_PLUGIN_URL); // registra controllers/elements en Chart globalmente
    })();
    return _scriptsReady;
  }

  async function ensureTopology() {
    if (_topology) return _topology;
    const res = await fetch(ATLAS_URL);
    if (!res.ok) throw new Error(`atlas fetch ${res.status}`);
    _topology = await res.json();
    return _topology;
  }

  // ISO-A2 (Meta: 'MX', 'CO', etc.) → ISO-N3 numérico (topojson usa nombre del país)
  // Aquí mapeamos por nombre del país en inglés porque world-atlas trae name + id numérico.
  // Simpler approach: matchear por ISO-A3 (no disponible en 110m), o por name.
  // Mejor: usar lookup ISO-A2 → ISO-N3 desde un tabla pequeña inline.
  const ISO2_TO_N3 = {
    MX: 484, CO: 170, US: 840, AR: 32, PE: 604, CL: 152, EC: 218, VE: 862, ES: 724,
    BR: 76, CA: 124, FR: 250, DE: 276, IT: 380, GB: 826, PT: 620, JP: 392, CN: 156,
    IN: 356, AU: 36, ID: 360, PH: 608, TH: 764, MY: 458, VN: 704, KR: 410, RU: 643,
    TR: 792, EG: 818, SA: 682, AE: 784, ZA: 710, NG: 566, KE: 404, MA: 504,
    CR: 188, GT: 320, HN: 340, NI: 558, PA: 591, DO: 214, CU: 192, BO: 68, PY: 600, UY: 858,
    NL: 528, BE: 56, CH: 756, AT: 40, SE: 752, NO: 578, DK: 208, FI: 246, PL: 616, IE: 372,
    GR: 300, RO: 642, CZ: 203, HU: 348, BG: 100, HR: 191, IL: 376,
  };

  const FLAG = (iso2) => {
    if (!iso2 || iso2.length !== 2) return '🌐';
    const cp = (c) => 0x1F1E6 + c.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
    return String.fromCodePoint(cp(iso2[0]), cp(iso2[1]));
  };

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
  }

  // ── Fallback mobile: lista flag+bar ──────────────────────────────────────
  function renderListFallback(container, distribution) {
    const total = Object.values(distribution).reduce((s, v) => s + (Number(v) || 0), 0);
    if (total === 0) {
      container.innerHTML = `<div class="cc-map-empty">Sin datos geográficos todavía.</div>`;
      return;
    }
    const entries = Object.entries(distribution)
      .map(([cc, v]) => ({ cc, v: Number(v) || 0 }))
      .filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 10);

    container.innerHTML = `
      <div class="cc-map-fallback" role="list" aria-label="Distribución por país">
        ${entries.map(({ cc, v }) => {
          const pct = Math.round((v / total) * 100);
          return `
            <div class="cc-map-fallback-row" role="listitem">
              <span class="cc-map-fallback-flag" aria-hidden="true">${FLAG(cc)}</span>
              <span class="cc-map-fallback-code">${cc}</span>
              <div class="cc-map-fallback-bar-wrap" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                <div class="cc-map-fallback-bar" style="width:${pct}%"></div>
              </div>
              <span class="cc-map-fallback-pct">${pct}%</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  // ── Helpers de color: lee --brand-gradient-dynamic y produce una función
  //    de interpolación t∈[0,1] → color (rgb string). Si el degradado no
  //    está disponible, fallback a un naranja cálido sólido.
  function readBrandGradientColors() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const grad = (cs.getPropertyValue('--brand-gradient-dynamic') ||
                    cs.getPropertyValue('--brand-gradient') || '').trim();
      const hexes = grad.match(/#[0-9a-fA-F]{6,8}/g);
      if (hexes && hexes.length > 0) return hexes;
    } catch (_) { /* noop */ }
    return ['#e09145']; // fallback
  }

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 8) h = h.slice(0, 6);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function interpolateColors(stops, t) {
    if (!stops || stops.length === 0) return 'rgb(255,255,255)';
    if (stops.length === 1) return stops[0];
    const tt = Math.max(0, Math.min(1, t));
    const segs = stops.length - 1;
    const idx = Math.min(Math.floor(tt * segs), segs - 1);
    const segT = (tt * segs) - idx;
    const [r1, g1, b1] = hexToRgb(stops[idx]);
    const [r2, g2, b2] = hexToRgb(stops[idx + 1]);
    const r = Math.round(r1 + (r2 - r1) * segT);
    const g = Math.round(g1 + (g2 - g1) * segT);
    const b = Math.round(b1 + (b2 - b1) * segT);
    return `rgb(${r},${g},${b})`;
  }

  // ── Desktop: choropleth con chartjs-chart-geo ────────────────────────────
  async function renderChoropleth(container, distribution) {
    await ensureScripts();
    const topology = await ensureTopology();

    if (!window.ChartGeo) {
      renderListFallback(container, distribution);
      return null;
    }

    const countries = window.ChartGeo.topojson.feature(topology, topology.objects.countries).features;

    const N3_TO_ISO2 = {};
    for (const [iso2, n3] of Object.entries(ISO2_TO_N3)) N3_TO_ISO2[n3] = iso2;

    // value=null para países sin data → caen en `scales.color.missing`
    const data = countries.map((f) => {
      const n3 = parseInt(f.id, 10);
      const iso2 = N3_TO_ISO2[n3];
      const raw  = iso2 ? Number(distribution[iso2] || 0) : 0;
      return { feature: f, value: raw > 0 ? raw : null };
    });

    const valuedEntries = data.filter(d => d.value != null);
    const maxVal = Math.max(0.0001, ...valuedEntries.map(d => d.value));
    const total  = valuedEntries.reduce((s, d) => s + d.value, 0);

    // Lee el degradado de marca al momento de render (refleja la marca actual)
    const gradientStops = readBrandGradientColors();

    container.innerHTML = `<canvas class="cc-map-canvas" aria-label="Mapa de distribución de audiencia por país"></canvas><div class="cc-map-legend"></div>`;
    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    // Pinta directamente vía dataset.backgroundColor — más confiable que
    // scales.color en todos los entornos. Apply alpha por intensidad para
    // que los países con más audiencia se vean dominantes.
    const fillFor = (value) => {
      if (value == null) return 'rgba(255,255,255,0.04)';
      const t = Math.max(0, Math.min(1, value / maxVal));
      // Color base interpolado en el degradado brand (toda la rampa)
      const base = interpolateColors(gradientStops, t);
      // Alpha 0.3 (bajo) → 1.0 (top) para jerarquía visual clara
      const alpha = 0.30 + 0.70 * t;
      // Convertir rgb(R,G,B) a rgba con el alpha calculado
      const m = base.match(/rgb\((\d+),(\d+),(\d+)\)/);
      if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha.toFixed(2)})`;
      return base;
    };

    const chart = new window.Chart(ctx, {
      type: 'choropleth',
      data: {
        labels: data.map(d => d.feature.properties.name),
        datasets: [{
          label: 'Audience',
          data,
          backgroundColor: (ctx) => fillFor(ctx.dataset.data[ctx.dataIndex]?.value),
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 0.4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        showOutline: true,
        showGraticule: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw?.value;
                if (v == null) return null;
                const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                return `${ctx.raw.feature.properties.name}: ${pct}%`;
              },
              title: () => null,
            }
          }
        },
        scales: {
          projection: { axis: 'x', projection: 'naturalEarth1' },
          // chartjs-chart-geo REQUIERE scales.color para choropleth — setear
          // `display:false` rompe el render. Solo hide del legend (barra a la
          // derecha con 0/0.4/0.8). El painting real lo hace dataset.backgroundColor.
          color: {
            legend: { display: false },
          },
        },
      },
    });

    // Leyenda compacta: top-5 países, con un punto del color real del choropleth
    const top5 = [...valuedEntries]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const legend = container.querySelector('.cc-map-legend');
    if (legend && top5.length > 0 && total > 0) {
      legend.innerHTML = top5.map(d => {
        const iso2 = N3_TO_ISO2[parseInt(d.feature.id, 10)] || '';
        const pct = Math.round((d.value / total) * 100);
        const t = d.value / maxVal;
        const color = interpolateColors(gradientStops, t);
        return `<span class="cc-map-legend-item">
          <span class="cc-map-legend-dot" style="background:${color}"></span>
          ${FLAG(iso2)} ${d.feature.properties.name} <strong>${pct}%</strong>
        </span>`;
      }).join('');
    }

    return chart;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  async function render(container, distribution) {
    if (!container) return null;
    distribution = distribution && typeof distribution === 'object' ? distribution : {};
    try {
      if (isMobile()) {
        renderListFallback(container, distribution);
        return null;
      }
      return await renderChoropleth(container, distribution);
    } catch (e) {
      console.warn('AudienceMap: fallback to list because choropleth failed:', e?.message);
      renderListFallback(container, distribution);
      return null;
    }
  }

  window.AudienceMap = { render };
})();
