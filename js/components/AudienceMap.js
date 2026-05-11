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

  // ── Desktop: choropleth con chartjs-chart-geo ────────────────────────────
  async function renderChoropleth(container, distribution) {
    await ensureScripts();
    const topology = await ensureTopology();

    if (!window.ChartGeo) {
      // Fallback si el plugin no exportó el namespace esperado
      renderListFallback(container, distribution);
      return null;
    }

    // Construir features
    const countries = window.ChartGeo.topojson.feature(topology, topology.objects.countries).features;

    // Mapa N3 → iso2 invertido
    const N3_TO_ISO2 = {};
    for (const [iso2, n3] of Object.entries(ISO2_TO_N3)) N3_TO_ISO2[n3] = iso2;

    const data = countries.map((f) => {
      const n3 = parseInt(f.id, 10);
      const iso2 = N3_TO_ISO2[n3];
      const value = iso2 ? Number(distribution[iso2] || 0) : 0;
      return { feature: f, value };
    });

    const maxVal = Math.max(1, ...data.map(d => d.value));
    const total  = data.reduce((s, d) => s + d.value, 0);

    container.innerHTML = `<canvas class="cc-map-canvas" aria-label="Mapa de distribución de audiencia por país"></canvas><div class="cc-map-legend"></div>`;
    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    const chart = new window.Chart(ctx, {
      type: 'choropleth',
      data: {
        labels: data.map(d => d.feature.properties.name),
        datasets: [{
          label: 'Impressions',
          data,
          backgroundColor: (ctx) => {
            const v = ctx.dataset.data[ctx.dataIndex]?.value || 0;
            if (v === 0) return 'rgba(255,255,255,0.04)';
            const alpha = 0.25 + 0.75 * (v / maxVal);  // intensidad escalada
            return `rgba(224,145,69,${alpha})`;
          },
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 0.5,
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
                const v = ctx.raw?.value || 0;
                if (v === 0) return null;
                const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                return `${ctx.raw.feature.properties.name}: ${v.toLocaleString('es')} imp (${pct}%)`;
              },
              title: () => null,
            }
          }
        },
        scales: {
          projection: { axis: 'x', projection: 'naturalEarth1' },
        },
      },
    });

    // Leyenda compacta: top-5 países
    const top5 = [...data]
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const legend = container.querySelector('.cc-map-legend');
    if (legend && top5.length > 0 && total > 0) {
      legend.innerHTML = top5.map(d => {
        const iso2 = N3_TO_ISO2[parseInt(d.feature.id, 10)] || '';
        const pct = Math.round((d.value / total) * 100);
        return `<span class="cc-map-legend-item">${FLAG(iso2)} ${d.feature.properties.name} <strong>${pct}%</strong></span>`;
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
