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
  // chartjs-chart-geo v4: UMD bundle explícito (sin path defaultea a ESM y NO
  // crea window.ChartGeo → caía al fallback list).
  const GEO_PLUGIN_URL = 'https://cdn.jsdelivr.net/npm/chartjs-chart-geo@4.3.1/build/index.umd.min.js';
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
      await loadScript(GEO_PLUGIN_URL, 'ChartGeo');
      // Algunos builds del UMD de chartjs-chart-geo no auto-registran sus
      // controllers en Chart.js. Si Chart no conoce 'choropleth', registramos
      // explícitamente desde el namespace ChartGeo.
      try {
        const C = window.Chart;
        const G = window.ChartGeo;
        if (C && G && typeof C.register === 'function') {
          if (!C.registry?.controllers?.get('choropleth')) {
            const items = [G.ChoroplethController, G.GeoFeature, G.ProjectionScale, G.ColorScale, G.SizeScale, G.BubbleMapController]
              .filter(Boolean);
            if (items.length > 0) C.register(...items);
          }
        }
      } catch (e) {
        console.warn('AudienceMap: register controllers:', e?.message);
      }
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

  // ── Color de la marca (preferimos --brand-primary, el color sólido que
  //    setea OrgBrandTheme por org). Si no existe, caemos al último stop del
  //    gradient dinámico, y si tampoco, a un naranja cálido por defecto.
  function readBrandHex() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const primary = (cs.getPropertyValue('--brand-primary') || '').trim();
      if (/^#[0-9a-fA-F]{6,8}$/.test(primary)) return primary;
      const grad = (cs.getPropertyValue('--brand-gradient-dynamic') ||
                    cs.getPropertyValue('--brand-gradient') || '').trim();
      const hexes = grad.match(/#[0-9a-fA-F]{6,8}/g);
      if (hexes && hexes.length > 0) return hexes[hexes.length - 1];
    } catch (_) { /* noop */ }
    return '#e09145';
  }

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 8) h = h.slice(0, 6);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0; const l = (max + min) / 2;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r)      h = ((g - b) / d) + (g < b ? 6 : 0);
      else if (max === g) h = ((b - r) / d) + 2;
      else                h = ((r - g) / d) + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
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

    // Color brand sólido (--brand-primary) → hue+sat fijos. La jerarquía la
    // controla LIGHTNESS HSL: más actividad = más oscuro, menos = más pálido.
    const baseHex = readBrandHex();
    const [br, bg, bb] = hexToRgb(baseHex);
    const [brandHue, brandSat] = rgbToHsl(br, bg, bb);

    container.innerHTML = `<canvas class="cc-map-canvas" aria-label="Mapa de distribución de audiencia por país"></canvas>`;
    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    // Curva sqrt para distribuciones long-tail (CO ~81%, resto <10%). La raíz
    // expande los valores chicos para que se diferencien entre sí en vez de
    // quedar todos colapsados en el extremo claro.
    const curve = (x) => Math.sqrt(Math.max(0, Math.min(1, x)));
    // Saturation reforzada para que el color brand se lea, no se acerque a gris
    const sat = Math.min(90, Math.max(70, brandSat));

    const fillFor = (value) => {
      if (value == null) return 'rgba(255,255,255,0.05)';
      const t  = curve(value / maxVal);
      // Dark mode: mas valor = mas BRILLANTE (no mas oscuro). Cola ~42% (tenue)
      // -> top ~66% (vibrante), para que el pais con data resalte sobre el fondo.
      const lightness = 42 + (24 * t);
      return `hsl(${brandHue.toFixed(1)}, ${sat.toFixed(1)}%, ${lightness.toFixed(1)}%)`;
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
          // Hover: por defecto chart.js calcula un hoverBackgroundColor
          // oscureciendo el base → con nuestros HSL claros sale casi negro
          // (el "blob" sobre el cursor). Sobrescribimos a blanco translúcido
          // con borde blanco para que el highlight se vea como un "spotlight".
          hoverBackgroundColor: 'rgba(255, 255, 255, 0.55)',
          hoverBorderColor: 'rgba(255, 255, 255, 0.95)',
          hoverBorderWidth: 1.2,
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
            // No mostrar tooltip para países sin datos, ni para los que
            // redondean a 0% (actividad despreciable). El feature se
            // colorea levemente pero numéricamente no aporta nada.
            filter: (tooltipItem) => {
              const v = Number(tooltipItem.raw?.value);
              if (!Number.isFinite(v) || v <= 0) return false;
              const pct = total > 0 ? Math.round((v / total) * 100) : 0;
              return pct >= 1;
            },
            callbacks: {
              label: (ctx) => {
                const v = Number(ctx.raw?.value);
                const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                return `${ctx.raw.feature.properties.name}: ${pct}%`;
              },
              title: () => null,
            }
          }
        },
        scales: {
          // chartjs-chart-geo v4: si sobrescribes `scales.{projection,color}`
          // pisas los defaults del controller. SIEMPRE declara `type` + `axis`
          // explícitos o el scale builder de chart.js lanza
          // "Cannot read properties of undefined (reading 'axis')".
          // `display:false` apaga la barra "0/0.5/1.0/1.5/2.0" auto-generada
          // del LegendScale en la esquina; `legend.display:false` es la opción
          // documentada pero en v4.3.1 no la respeta — `display:false` sí.
          projection: { axis: 'x', type: 'projection', projection: 'naturalEarth1' },
          color: { axis: 'x', type: 'color', display: false, legend: { display: false } },
        },
      },
    });

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
      // Antes: fallback silencioso. Ahora exponemos el error real al DOM
      // (CommandCenterView lo detecta vía .cc-map-fallback y muestra chip).
      console.error('AudienceMap: fallback to list because choropleth failed:', e?.message, e);
      container.__lastError = e?.message || String(e);
      renderListFallback(container, distribution);
      return null;
    }
  }

  window.AudienceMap = { render };
})();
