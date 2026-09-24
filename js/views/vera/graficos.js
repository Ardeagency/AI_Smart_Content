/**
 * Vera · helpers de render sin estado (L7 fase B, 24/09): gráficos SVG/ECharts,
 * Mermaid, Prism, bloques de botones y el ajuste de alto de los iframes sandbox.
 * Movidos TAL CUAL desde js/views/VeraView.js. Script clásico: sus funciones y
 * constantes quedan en el ámbito global que comparten VeraView.js y sus mixins
 * (js/views/vera/*.mixin.js). Se carga ANTES de VeraView.js.
 */
/* exported renderChartBlock, renderButtonsBlock, ensureMermaid, ensurePrism, ensureECharts, buildEChartsOption,
   applyMermaidSemanticClasses, fitSandboxFrame, VERA_AVATAR_SRC, VERA_WORDMARK_SRC */

/* ─── Helpers ─────────────────────────────────────────── */
function escapeHtml(s) {
  // Unificado (PERF-001): las variantes con textContent+innerHTML NO
  // escapaban comillas, y este valor se interpola DENTRO de atributos.
  if (typeof BaseView !== 'undefined' && typeof BaseView.escapeHtml === 'function') {
    return BaseView.escapeHtml(s);
  }
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

/* ─── Vera Charts (SVG) ───────────────────────────────── */
/**
 * Color de un token del prisma (bundle.css :root). Las librerías de gráficos y el
 * tema de Mermaid no entienden var(--x): se lee el valor en tiempo de ejecución,
 * así el chat de Vera usa los MISMOS colores que el resto de la consola (L7).
 */
function tokenColor(nombre, respaldo = 'gray') {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    return v || respaldo;
  } catch (_) { return respaldo; /* sin DOM (tests): color neutro */ }
}
/** El espectro de la plataforma, en el orden de la marca. */
const PRISMA = ['--prisma-naranja', '--prisma-rojo', '--prisma-amarillo', '--prisma-verde', '--prisma-celeste', '--prisma-azul', '--prisma-purpura', '--prisma-violeta', '--prisma-limon', '--prisma-fucsia'];
const veraPaleta = () => PRISMA.map((t) => tokenColor(t));

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.min(b, Math.max(a, x));
}

function safeColor(c, fallback = 'white') {
  const s = String(c || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*(?:0?\.\d+|1(?:\.0)?))?\s*\)$/.test(s)) return s;
  return fallback;
}

// Aliases comunes que LLMs emiten pero el renderer no conoce nativamente.
// Mapean al tipo soportado más cercano semánticamente.
const CHART_TYPE_ALIASES = {
  // Bar variants
  'column':         'bar',
  'columnchart':    'bar',
  'horizontalbar':  'bar',
  'horizontal_bar': 'bar',
  'hbar':           'bar',
  'verticalbar':    'bar',
  // Stacked variants
  'stacked':        'stacked_column',
  'stackedbar':     'stacked_column',
  'stacked_bar':    'stacked_column',
  'stackedcolumn':  'stacked_column',
  // Line variants
  'linechart':      'line',
  'curve':          'spline',
  'smoothline':     'spline',
  'smooth':         'spline',
  // Area variants
  'areachart':      'area',
  'filledarea':     'area',
  // Pie variants
  'piechart':       'pie',
  'doughnut':       'donut',
  'ring':           'donut',
  // Polar variants
  'polararea':      'polar',
  'polar_area':     'polar',
  'polarchart':     'polar',
  // Radar variants
  'radarchart':     'radar',
  'spider':         'radar',
  'web':            'radar',
  // Pyramid variants
  'funnel':         'pyramid',
  // Progress variants
  'progressbar':    'progress',
  'gauge':          'progress',
  'meter':          'progress',
};

function parseChartSpec(jsonText) {
  const t = String(jsonText || '').trim();
  if (!t) throw new Error(__('Spec vacío'));
  const spec = JSON.parse(t);
  if (!spec || typeof spec !== 'object') throw new Error(__('Spec inválido'));
  const rawType = String(spec.type || spec.kind || spec.chartType || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!rawType) throw new Error(__('Falta spec.type'));
  // Normaliza vía alias; si ya es un tipo soportado, queda igual.
  const type = CHART_TYPE_ALIASES[rawType] || CHART_TYPE_ALIASES[rawType.replace(/_/g, '')] || rawType;
  return { ...spec, type };
}

// Renderiza datos como tabla cuando el tipo no es renderable como chart SVG.
// Mejor que "Tipo no soportado" sin contexto: el usuario al menos ve los números.
function renderChartAsDataTable(spec) {
  const title = spec.title ? String(spec.title) : '';
  const data = Array.isArray(spec.data) ? spec.data : [];
  if (!data.length) {
    return `<div class="gpt-viz gpt-viz--fallback"><strong>${escapeHtml(title || __('Datos'))}</strong><p style="color:var(--text-muted);margin-top:8px">${__('El tipo')} <code>${escapeHtml(spec.type)}</code> ${__('no tiene render visual disponible y no hay datos para tabular.')}</p></div>`;
  }
  const hint = spec.type ? `<div style="font-size:.8em;color:var(--text-muted);margin-top:4px;">(${__('tipo solicitado:')} <code>${escapeHtml(spec.type)}</code> ${__('— mostrado como tabla')})</div>` : '';
  const headerKeys = Array.from(new Set(data.flatMap((d) => d && typeof d === 'object' ? Object.keys(d) : [])));
  const cols = headerKeys.length ? headerKeys : [__('valor')];
  const ths = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const rows = data.map((d) => {
    const cells = cols.map((c) => {
      const v = d && typeof d === 'object' ? d[c] : d;
      return `<td>${escapeHtml(String(v ?? ''))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<div class="gpt-viz gpt-viz--fallback">` +
    (title ? `<div style="font-weight:600;font-size:1.05em;margin-bottom:4px;">${escapeHtml(title)}</div>` : '') +
    hint +
    `<div class="gpt-md-table-wrap" style="margin-top:10px;"><table class="gpt-md-table"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table></div>` +
    `</div>`;
}

function svgArcPath(cx, cy, r, startAngle, endAngle) {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const sx = cx + r * Math.cos(startAngle);
  const sy = cy + r * Math.sin(startAngle);
  const ex = cx + r * Math.cos(endAngle);
  const ey = cy + r * Math.sin(endAngle);
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} L ${cx} ${cy} Z`;
}

function svgDonutPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const sx0 = cx + rOuter * Math.cos(startAngle);
  const sy0 = cy + rOuter * Math.sin(startAngle);
  const ex0 = cx + rOuter * Math.cos(endAngle);
  const ey0 = cy + rOuter * Math.sin(endAngle);

  const sx1 = cx + rInner * Math.cos(endAngle);
  const sy1 = cy + rInner * Math.sin(endAngle);
  const ex1 = cx + rInner * Math.cos(startAngle);
  const ey1 = cy + rInner * Math.sin(startAngle);

  return [
    `M ${sx0} ${sy0}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${ex0} ${ey0}`,
    `L ${sx1} ${sy1}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${ex1} ${ey1}`,
    'Z'
  ].join(' ');
}

function buildSmoothPath(points, tension = 0.5) {
  // Catmull-Rom to Bezier smoothing
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const t = clamp(tension, 0, 1);
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * t;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * t;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * t;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * t;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function renderChartSVG(spec) {
  const type = spec.type;
  const title = spec.title ? String(spec.title) : '';
  const width = clamp(spec.width ?? 640, 240, 1200);
  const height = clamp(spec.height ?? 360, 160, 900);

  const bg = safeColor(spec.background || 'transparent', 'transparent');
  const showLegend = spec.legend !== false;
  const fontFamily = 'var(--font-family, ui-sans-serif, system-ui, sans-serif)';
  const textColor = 'var(--text-primary, #D4D1D8)';
  const muted = 'var(--text-muted, rgba(212,209,216,0.6))';
  const border = 'var(--border-light, #212126)';

  const pad = 16;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const data = Array.isArray(spec.data) ? spec.data : [];

  const legendW = showLegend ? Math.min(220, Math.floor(width * 0.34)) : 0;
  const plotW = innerW - legendW;
  const plotH = innerH;

  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title || type)}" xmlns="http://www.w3.org/2000/svg">`;
  if (bg !== 'transparent') {
    svg += `<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="${escapeHtml(bg)}" />`;
  }

  // Title (optional)
  if (title) {
    svg += `<text x="${pad}" y="${pad + 14}" fill="${escapeHtml(textColor)}" font-family="${fontFamily}" font-size="14" font-weight="600">${escapeHtml(title)}</text>`;
  }

  const titleOffset = title ? 22 : 0;
  const plotX = pad;
  const plotY = pad + titleOffset;
  const plotH2 = plotH - titleOffset;

  const legendX = pad + plotW;
  const legendY = plotY;

  const palette = veraPaleta().slice(0, 8);

  const normalized = data.map((d, i) => ({
    label: String(d?.label ?? `Serie ${i + 1}`),
    value: Number(d?.value ?? 0),
    color: safeColor(d?.color, palette[i % palette.length])
  })).filter(d => Number.isFinite(d.value));
  const categories = Array.isArray(spec.categories) ? spec.categories.map((x) => String(x)) : null;
  const series = Array.isArray(spec.series) ? spec.series : null;
  const isMulti = Array.isArray(categories) && categories.length > 0 && Array.isArray(series) && series.length > 0;
  const legendOverride = Array.isArray(spec.__legendSeries) ? spec.__legendSeries : null;

  if (type === 'pie' || type === 'donut') {
    const total = normalized.reduce((a, b) => a + Math.max(0, b.value), 0) || 1;
    const cx = plotX + plotW * 0.46;
    const cy = plotY + plotH2 * 0.5;
    const r = Math.min(plotW, plotH2) * 0.35;
    const rOuter = r;
    const rInner = type === 'donut' ? rOuter * clamp(spec.innerRadius ?? 0.62, 0.2, 0.85) : 0;

    let a0 = -Math.PI / 2;
    for (const seg of normalized) {
      const frac = Math.max(0, seg.value) / total;
      const a1 = a0 + frac * Math.PI * 2;
      if (frac > 0) {
        const path = (type === 'donut')
          ? svgDonutPath(cx, cy, rOuter, rInner, a0, a1)
          : svgArcPath(cx, cy, rOuter, a0, a1);
        svg += `<path d="${path}" fill="${escapeHtml(seg.color)}" />`;
      }
      a0 = a1;
    }
    if (type === 'donut' && spec.centerLabel) {
      svg += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="${escapeHtml(textColor)}" font-family="${fontFamily}" font-size="13" font-weight="600">${escapeHtml(String(spec.centerLabel))}</text>`;
    }
  } else if (type === 'bar') {
    const values = normalized.map(d => d.value);
    const maxV = Math.max(1, ...values);
    const n = normalized.length || 1;
    const gap = clamp(spec.gap ?? 10, 2, 28);
    const bw = Math.max(8, Math.floor((plotW - gap * (n - 1)) / n));
    const baseY = plotY + plotH2 - 20;
    const topY = plotY + 12;
    const hMax = baseY - topY;

    // axis line
    svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW - 14}" y2="${baseY}" stroke="${escapeHtml(border)}" stroke-width="1" />`;

    normalized.forEach((d, i) => {
      const x = plotX + i * (bw + gap);
      const hBar = Math.round((Math.max(0, d.value) / maxV) * hMax);
      const y = baseY - hBar;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${hBar}" rx="6" fill="${escapeHtml(d.color)}" />`;
      if (spec.labels !== false) {
        svg += `<text x="${x + bw / 2}" y="${baseY + 14}" text-anchor="middle" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="10">${escapeHtml(d.label)}</text>`;
      }
    });
  } else if (type === 'line' || type === 'spline' || type === 'area') {
    const pts = normalized.map(d => d.value);
    const maxV = Math.max(1, ...pts);
    const minV = Math.min(0, ...pts);
    const n = normalized.length || 1;
    const baseY = plotY + plotH2 - 20;
    const topY = plotY + 12;
    const hMax = baseY - topY;
    const wMax = plotW - 14;

    const xFor = (i) => plotX + (n === 1 ? wMax / 2 : (i * (wMax / (n - 1))));
    const yFor = (v) => baseY - ((v - minV) / (maxV - minV || 1)) * hMax;

    // grid + axis
    svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + wMax}" y2="${baseY}" stroke="${escapeHtml(border)}" stroke-width="1" />`;

    const stroke = safeColor(spec.stroke || tokenColor('--prisma-celeste'), tokenColor('--prisma-celeste'));
    const points = normalized.map((d, i) => ({ x: xFor(i), y: yFor(d.value) }));
    const dPath = (type === 'spline' && points.length >= 2)
      ? buildSmoothPath(points, spec.tension ?? 0.65)
      : points.reduce((acc, p, i) => acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), '');

    if (type === 'area' && points.length >= 2) {
      const areaFill = safeColor(spec.fill || 'rgba(0,231,255,0.18)', 'rgba(0,231,255,0.18)');
      const areaPath = `${dPath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;
      svg += `<path d="${areaPath}" fill="${escapeHtml(areaFill)}" stroke="none" />`;
    }

    svg += `<path d="${dPath}" fill="none" stroke="${escapeHtml(stroke)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;

    normalized.forEach((d, i) => {
      const x = xFor(i);
      const y = yFor(d.value);
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="${escapeHtml(stroke)}" />`;
      if (spec.labels !== false) {
        svg += `<text x="${x}" y="${baseY + 14}" text-anchor="middle" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="10">${escapeHtml(d.label)}</text>`;
      }
    });
  } else if (type === 'progress') {
    const value = clamp(spec.value ?? 0, 0, 100);
    const label = spec.label ? String(spec.label) : '';
    const track = safeColor(spec.trackColor || 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.12)');
    const fill = safeColor(spec.fillColor || tokenColor('--prisma-verde'), tokenColor('--prisma-verde'));
    const x = plotX;
    const y = plotY + plotH2 * 0.35;
    const w = plotW - 14;
    const hBar = clamp(spec.barHeight ?? 18, 10, 28);
    const r = Math.min(999, Math.floor(hBar / 2));

    svg += `<rect x="${x}" y="${y}" width="${w}" height="${hBar}" rx="${r}" fill="${escapeHtml(track)}" />`;
    svg += `<rect x="${x}" y="${y}" width="${(w * value) / 100}" height="${hBar}" rx="${r}" fill="${escapeHtml(fill)}" />`;
    const txt = label ? `${label} — ${value}%` : `${value}%`;
    svg += `<text x="${x}" y="${y - 8}" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="12">${escapeHtml(txt)}</text>`;
  } else if (type === 'pyramid') {
    // Pyramid chart as stacked trapezoids, top to bottom
    const total = normalized.reduce((a, b) => a + Math.max(0, b.value), 0) || 1;
    const x0 = plotX + 10;
    const y0 = plotY + 10;
    const w0 = plotW - 34;
    const h0 = plotH2 - 24;
    const cx = x0 + w0 / 2;

    let y = y0;
    normalized.forEach((seg, i) => {
      const frac = Math.max(0, seg.value) / total;
      const hSeg = Math.max(10, Math.round(h0 * frac));
      const topW = w0 * (1 - (y - y0) / h0 * 0.7);
      const botW = w0 * (1 - (y + hSeg - y0) / h0 * 0.7);
      const xTopL = cx - topW / 2;
      const xTopR = cx + topW / 2;
      const xBotL = cx - botW / 2;
      const xBotR = cx + botW / 2;
      const path = `M ${xTopL} ${y} L ${xTopR} ${y} L ${xBotR} ${y + hSeg} L ${xBotL} ${y + hSeg} Z`;
      svg += `<path d="${path}" fill="${escapeHtml(seg.color)}" />`;
      if (spec.labels !== false) {
        svg += `<text x="${cx}" y="${y + hSeg / 2 + 4}" text-anchor="middle" fill="${tokenColor('--bg-primary')}" font-family="${fontFamily}" font-size="12" font-weight="600">${escapeHtml(seg.label)}</text>`;
      }
      y += hSeg;
    });
  } else if (type === 'stacked_column' || type === 'stacked-column') {
    if (!isMulti) {
      svg += `<text x="${pad}" y="${plotY + 18}" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="12">${__('stacked_column requiere { categories:[], series:[] }')}</text>`;
    } else {
      const cat = categories;
      const sers = series.map((s, i) => ({
        name: String(s?.name ?? `Serie ${i + 1}`),
        color: safeColor(s?.color, palette[i % palette.length]),
        data: Array.isArray(s?.data) ? s.data.map((v) => Number(v ?? 0)) : []
      }));
      const n = cat.length;
      const gap = clamp(spec.gap ?? 14, 4, 26);
      const bw = Math.max(10, Math.floor((plotW - gap * (n - 1) - 14) / n));
      const baseY = plotY + plotH2 - 20;
      const topY = plotY + 12;
      const hMax = baseY - topY;

      const totals = cat.map((_, i) => sers.reduce((a, s) => a + Math.max(0, (s.data[i] ?? 0)), 0));
      const maxV = Math.max(1, ...totals);

      svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW - 14}" y2="${baseY}" stroke="${escapeHtml(border)}" stroke-width="1" />`;

      for (let i = 0; i < n; i++) {
        const x = plotX + i * (bw + gap);
        let stackY = baseY;
        for (let si = 0; si < sers.length; si++) {
          const v = Math.max(0, sers[si].data[i] ?? 0);
          const hSeg = Math.round((v / maxV) * hMax);
          if (hSeg > 0) {
            stackY -= hSeg;
            svg += `<rect x="${x}" y="${stackY}" width="${bw}" height="${hSeg}" rx="4" fill="${escapeHtml(sers[si].color)}" />`;
          }
        }
        if (spec.labels !== false) {
          svg += `<text x="${x + bw / 2}" y="${baseY + 14}" text-anchor="middle" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="10">${escapeHtml(cat[i])}</text>`;
        }
      }

      spec.__legendSeries = sers.map((s) => ({ label: s.name, color: s.color }));
    }
  } else if (type === 'polar' || type === 'radar') {
    const cat = isMulti ? categories : normalized.map((d) => d.label);
    const sers = isMulti
      ? series.map((s, i) => ({
          name: String(s?.name ?? `Serie ${i + 1}`),
          color: safeColor(s?.color, palette[i % palette.length]),
          data: Array.isArray(s?.data) ? s.data.map((v) => Number(v ?? 0)) : []
        }))
      : [{
          name: String(spec.seriesName || 'Serie 1'),
          color: safeColor(spec.stroke || tokenColor('--prisma-celeste'), tokenColor('--prisma-celeste')),
          data: normalized.map((d) => d.value)
        }];

    const n = cat.length || 1;
    const maxV = Number.isFinite(Number(spec.max)) ? Number(spec.max) : Math.max(1, ...sers.flatMap(s => s.data.map(v => (Number.isFinite(v) ? v : 0))));
    const levels = clamp(spec.levels ?? 4, 3, 7);
    const cx = plotX + (plotW - 14) / 2;
    const cy = plotY + plotH2 / 2;
    const r = Math.min(plotW - 14, plotH2) * 0.36;

    for (let l = 1; l <= levels; l++) {
      const rr = (r * l) / levels;
      let path = '';
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + rr * Math.cos(a);
        const y = cy + rr * Math.sin(a);
        path += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
      }
      path += ' Z';
      svg += `<path d="${path}" fill="none" stroke="${escapeHtml(border)}" stroke-width="1" opacity="0.7" />`;
    }

    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${escapeHtml(border)}" stroke-width="1" opacity="0.9" />`;

      const lx = cx + (r + 14) * Math.cos(a);
      const ly = cy + (r + 14) * Math.sin(a);
      const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
      svg += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="10">${escapeHtml(cat[i])}</text>`;
    }

    sers.forEach((s) => {
      let path = '';
      for (let i = 0; i < n; i++) {
        const v = clamp(s.data[i] ?? 0, 0, maxV);
        const rr = (v / (maxV || 1)) * r;
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + rr * Math.cos(a);
        const y = cy + rr * Math.sin(a);
        path += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
      }
      path += ' Z';
      const fill = safeColor(s.fill || `${s.color}33`, `${s.color}33`);
      svg += `<path d="${path}" fill="${escapeHtml(fill)}" stroke="${escapeHtml(s.color)}" stroke-width="2" />`;
    });

    spec.__legendSeries = sers.map((s) => ({ label: s.name, color: s.color }));
  } else {
    // Unknown
    svg += `<text x="${pad}" y="${plotY + 18}" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="12">${__('Tipo de gráfico no soportado:')} ${escapeHtml(type)}</text>`;
  }

  // Legend
  const legendItems = Array.isArray(spec.__legendSeries) ? spec.__legendSeries : normalized;
  if (showLegend && legendItems.length > 0) {
    const lx = legendX + 12;
    let ly = legendY + 12;
    const maxItems = Math.min(12, legendItems.length);
    for (let i = 0; i < maxItems; i++) {
      const item = legendItems[i];
      svg += `<rect x="${lx}" y="${ly - 10}" width="10" height="10" rx="2" fill="${escapeHtml(item.color)}" />`;
      svg += `<text x="${lx + 16}" y="${ly - 1}" fill="${escapeHtml(textColor)}" font-family="${fontFamily}" font-size="12">${escapeHtml(item.label)}</text>`;
      ly += 18;
    }
    if (legendItems.length > maxItems) {
      svg += `<text x="${lx}" y="${ly + 2}" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="11">${__('+{n} más', { n: legendItems.length - maxItems })}</text>`;
    }
  }

  svg += '</svg>';
  return svg;
}

// Tipos que renderChartSVG sabe pintar nativamente. Si parseChartSpec produce
// algo fuera de esta lista, caemos a renderChartAsDataTable en vez de
// "Tipo de gráfico no soportado" sin contexto.
const SUPPORTED_CHART_TYPES = new Set([
  'pie', 'donut', 'bar', 'line', 'spline', 'area',
  'progress', 'pyramid', 'stacked_column', 'polar', 'radar'
]);

function renderChartBlock(code) {
  try {
    const spec = parseChartSpec(code);

    // Ruta principal: ECharts (~25 tipos nativos, tolerante a múltiples
    // formas de spec). Si el tipo está en su set nativo, emitimos un
    // placeholder con la spec embebida; _processChatRichContent lo inicializa
    // tras montar el DOM (ECharts requiere dimensiones conocidas).
    if (ECHARTS_NATIVE_TYPES.has(spec.type)) {
      // Embebemos la spec como JSON base64 para evitar problemas de quoting
      // dentro del atributo data-*.
      const specStr = JSON.stringify(spec);
      const encoded = typeof window !== 'undefined' && window.btoa
        ? window.btoa(unescape(encodeURIComponent(specStr)))
        : encodeURIComponent(specStr);
      // Altura del área interna del chart (el wrapper .gpt-viz tiene padding;
      // el div interno data-echarts-spec es donde ECharts pinta).
      const height = Math.max(200, Math.min(560, Number(spec.height) || 360));
      return `<div class="gpt-viz gpt-viz--echarts"><div data-echarts-spec="${encoded}" data-echarts-height="${height}" style="width:100%;height:${height}px;"></div></div>`;
    }

    // Ruta legacy: tipos simples soportados por el SVG renderer custom
    if (SUPPORTED_CHART_TYPES.has(spec.type)) {
      const svg = renderChartSVG(spec);
      return `<div class="gpt-viz">${svg}</div>`;
    }

    // Último recurso: mostrar los datos como tabla (mejor que un error críptico)
    return renderChartAsDataTable(spec);
  } catch (e) {
    const msg = escapeHtml(e?.message || __('Error de chart spec'));
    return `<div class="gpt-viz gpt-viz--error"><strong>${__('Chart inválido:')}</strong> ${msg}<pre><code>${escapeHtml(String(code || '').trim())}</code></pre></div>`;
  }
}

function renderButtonsBlock(code) {
  try {
    const t = String(code || '').trim();
    const spec = JSON.parse(t);
    const buttons = Array.isArray(spec?.buttons) ? spec.buttons : (Array.isArray(spec) ? spec : []);
    if (!Array.isArray(buttons) || buttons.length === 0) {
      throw new Error(__('Spec sin botones'));
    }
    const title = spec?.title ? String(spec.title) : '';
    const rows = buttons
      .slice(0, 8)
      .map((b, i) => ({
        label: String(b?.label ?? b?.text ?? `Opción ${i + 1}`),
        text: String(b?.text ?? b?.label ?? ''),
        variant: String(b?.variant ?? 'secondary')
      }))
      .filter((b) => b.text.trim().length > 0);

    if (rows.length === 0) throw new Error(__('Botones sin texto'));

    return (
      `<div class="gpt-qr" data-qr="true">` +
      (title ? `<div class="gpt-qr-title">${escapeHtml(title)}</div>` : '') +
      `<div class="gpt-qr-row">` +
      rows
        .map(
          (b) =>
            `<button type="button" class="gpt-qr-btn gpt-qr-btn--${escapeHtml(b.variant)}" data-qr-text="${escapeHtml(b.text)}">${escapeHtml(b.label)}</button>`
        )
        .join('') +
      `</div>` +
      `</div>`
    );
  } catch (e) {
    const msg = escapeHtml(e?.message || __('Error de buttons spec'));
    return `<div class="gpt-viz gpt-viz--error"><strong>${__('Buttons inválido:')}</strong> ${msg}<pre><code>${escapeHtml(String(code || '').trim())}</code></pre></div>`;
  }
}

/* ─── Lazy loaders para Mermaid (diagramas) y Prism (syntax highlighting) ─── */
const VERA_RICH_LIBS = {
  mermaidLoading: null,
  prismLoading: null,
  echartsLoading: null,
};

function _loadScriptOnce(src, integrity = null) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; }
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function _loadStyleOnce(href, integrity = null) {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    if (integrity) { l.integrity = integrity; l.crossOrigin = 'anonymous'; l.referrerPolicy = 'no-referrer'; }
    l.onload = () => resolve();
    l.onerror = () => reject(new Error(`Failed to load ${href}`));
    document.head.appendChild(l);
  });
}

async function ensureMermaid() {
  if (window.mermaid) return window.mermaid;
  if (VERA_RICH_LIBS.mermaidLoading) return VERA_RICH_LIBS.mermaidLoading;
  VERA_RICH_LIBS.mermaidLoading = (async () => {
    await _loadScriptOnce('https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js');
    if (window.mermaid?.initialize) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        fontFamily: 'inherit',
        // Tema premium matching AI Smart Content. Reemplaza el 'dark' genérico
        // de mermaid (azules pastel) con paleta del brand (neutros oscuros +
        // accent vera-red en clusters).
        themeVariables: {
          // Canvas
          background: 'transparent',
          // Default node
          primaryColor: tokenColor('--bg-secondary'),
          primaryBorderColor: tokenColor('--border-hairline-strong'),
          primaryTextColor: tokenColor('--text-primary'),
          // Edges (arrows)
          lineColor: tokenColor('--text-muted'),
          // Edge labels
          edgeLabelBackground: tokenColor('--bg-secondary'),
          tertiaryColor: tokenColor('--bg-secondary'),
          // Subgraphs (clusters)
          clusterBkg: 'rgba(255,255,255,0.02)',
          clusterBorder: tokenColor('--border-color'),
          titleColor: tokenColor('--text-primary'),
          // Flowchart specifics
          nodeBorder: tokenColor('--border-hairline-strong'),
          mainBkg: tokenColor('--bg-secondary'),
          secondBkg: tokenColor('--bg-card'),
          // Misc
          fontSize: '14px',
        },
        flowchart: {
          curve: 'basis',
          padding: 20,
          nodeSpacing: 60,
          rankSpacing: 70,
          htmlLabels: true,
        },
        sequence: {
          actorMargin: 60,
          messageMargin: 40,
        },
      });
    }
    return window.mermaid;
  })();
  return VERA_RICH_LIBS.mermaidLoading;
}

/**
 * Pre-procesa el código mermaid: detecta emojis/keywords en labels y aplica
 * clases semánticas (critical/warning/success/info) automáticamente. Vera
 * sigue escribiendo "🔴 CRISIS" como antes, esto convierte los emojis en
 * colores reales en vez de mostrar todos los nodos del mismo color.
 *
 * Heurística:
 *   - 🔴 / 🚨 / "crisis|amenaza|riesgo|urgente|error" → critical (rojo)
 *   - 🟡 / ⚠️ / "oportunidad|alerta|warn" → warning (ámbar)
 *   - 🟢 / ✅ / "éxito|positivo|success|ok" → success (verde)
 *   - 🔵 / 💡 / "insight|info|tip" → info (azul)
 */
function applyMermaidSemanticClasses(src) {
  if (!src || typeof src !== 'string') return src;

  // Captura definiciones de nodo: id + apertura + label + cierre.
  // Soporta los shapes comunes de mermaid: [], (), {}, [[]], [()], (()), {{}}.
  const nodeRegex = /(\b[A-Za-z][\w]*)\s*(\[\[|\[\(|\(\(|\(|\[|\{\{|\{|>)([^\]\)\}>]*?)(\]\]|\)\]|\)\)|\)|\]|\}\}|\})/g;

  const patterns = [
    { re: /🔴|🚨|\b(crisis|amenaza|riesgo|urgente|error|critical|critico|crítico)\b/i, cls: 'sem-critical' },
    { re: /🟡|⚠️|⚠|\b(oportunidad|alerta|warning|warn|caution)\b/i,                    cls: 'sem-warning' },
    { re: /🟢|✅|✓|\b(éxito|exito|positivo|success|ok|good|gano|gana)\b/i,             cls: 'sem-success' },
    { re: /🔵|💡|ℹ️|ℹ|\b(insight|info|tip|nota|note)\b/i,                              cls: 'sem-info' },
  ];

  const classMap = { 'sem-critical': [], 'sem-warning': [], 'sem-success': [], 'sem-info': [] };
  let m;
  while ((m = nodeRegex.exec(src)) !== null) {
    const nodeId = m[1];
    const label = m[3] || '';
    // Skip palabras reservadas de mermaid (graph, flowchart, subgraph, end, class, classDef, click)
    if (/^(graph|flowchart|subgraph|end|class|classDef|click|style|linkStyle|direction)$/i.test(nodeId)) continue;
    for (const p of patterns) {
      if (p.re.test(label)) {
        if (!classMap[p.cls].includes(nodeId)) classMap[p.cls].push(nodeId);
        break; // primer match gana
      }
    }
  }

  const anySemantic = Object.values(classMap).some(arr => arr.length > 0);
  if (!anySemantic) return src;

  // Apéndice de classDef + asignaciones. Colores en hex (mermaid no acepta vars CSS).
  const appendix = [
    '',
    'classDef sem-critical fill:#2a1414,stroke:#ff5b5b,stroke-width:2px,color:#ffd6d6',
    'classDef sem-warning  fill:#2a2410,stroke:#f5b942,stroke-width:2px,color:#ffe6b0',
    'classDef sem-success  fill:#0f2a1c,stroke:#3ec47d,stroke-width:2px,color:#c0f0d0',
    'classDef sem-info     fill:#15192e,stroke:#7a8fff,stroke-width:2px,color:#d0d8f5',
  ];
  for (const [cls, ids] of Object.entries(classMap)) {
    if (ids.length > 0) appendix.push(`class ${ids.join(',')} ${cls}`);
  }
  return src + '\n' + appendix.join('\n');
}

// Mermaid v10 inyecta un <div id="d{userId}"> temporal en <body> para medir
// el SVG; si parse/render falla, ese div queda huérfano mostrando
// "Syntax error in text — mermaid version X.Y.Z" flotando en la app.
function _cleanupMermaidOrphans() {
  try {
    document.querySelectorAll('body > [id^="dvera-mmd-"]').forEach((n) => n.remove());
  } catch (_) { /* nodos ya retirados */ }
}

async function ensurePrism() {
  if (window.Prism) return window.Prism;
  if (VERA_RICH_LIBS.prismLoading) return VERA_RICH_LIBS.prismLoading;
  VERA_RICH_LIBS.prismLoading = (async () => {
    await _loadStyleOnce('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css');
    await _loadScriptOnce('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js');
    await _loadScriptOnce('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js');
    if (window.Prism?.plugins?.autoloader) {
      window.Prism.plugins.autoloader.languages_path =
        'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
    }
    return window.Prism;
  })();
  return VERA_RICH_LIBS.prismLoading;
}

/* ─── ECharts (lib completa de charts) ─────────────────────────────
   Carga lazy desde CDN, solo cuando Vera emite un chart. Permite ~25
   tipos nativos (bar/line/pie/donut/scatter/bubble/radar/heatmap/
   treemap/sunburst/gauge/funnel/sankey/candlestick/boxplot/...).
   Para tipos fuera de ese set caemos a renderChartAsDataTable. */
async function ensureECharts() {
  if (window.echarts) return window.echarts;
  if (VERA_RICH_LIBS.echartsLoading) return VERA_RICH_LIBS.echartsLoading;
  VERA_RICH_LIBS.echartsLoading = (async () => {
    await _loadScriptOnce('https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js');
    return window.echarts;
  })();
  return VERA_RICH_LIBS.echartsLoading;
}

// Paleta brand para ECharts — usa los acentos del sistema premium ya cableado
// (L7: el espectro del prisma, leído al pintar; antes 10 hex sueltos de otra paleta)

// Tipos que ECharts puede renderizar nativamente. Si Vera pide un tipo
// fuera de este set, caemos a la tabla de datos.
const ECHARTS_NATIVE_TYPES = new Set([
  'bar', 'horizontalbar', 'stackedbar', 'groupedbar',
  'line', 'spline', 'area', 'stackedarea',
  'pie', 'donut',
  'scatter', 'bubble',
  'radar', 'polar', // polar = Nightingale rose (Chart.js "polarArea")
  'heatmap', 'calendar',
  'treemap', 'sunburst',
  'gauge',
  'funnel', 'pyramid',
  'sankey',
  'candlestick', 'kline', 'boxplot',
  'graph', 'network',
  'themeriver', 'streamgraph',
  'parallel',
  'pictogram', 'pictorialbar',
]);

/**
 * Detecta el formato Chart.js y lo normaliza a la forma interna que el
 * converter consume (`{title, categories, series, data:[{label,value,color}]}`).
 *
 * Chart.js shape (lo que Claude/Vera emite por default):
 *   {
 *     type: "doughnut",
 *     data: { labels: [...], datasets: [{ data: [...], backgroundColor: [...] }] },
 *     options: { plugins: { title: {text}, legend: {...} } }
 *   }
 *
 * No mutamos el mensaje original de Vera — solo lo entendemos.
 */
function _normalizeChartJsSpec(spec) {
  if (!spec?.data || Array.isArray(spec.data) || typeof spec.data !== 'object') return spec;
  const cjsData = spec.data;
  // Detectar: tiene labels y/o datasets
  if (!Array.isArray(cjsData.labels) && !Array.isArray(cjsData.datasets)) return spec;

  const labels = Array.isArray(cjsData.labels) ? cjsData.labels : [];
  const datasets = Array.isArray(cjsData.datasets) ? cjsData.datasets : [];
  const opts = spec.options || {};
  const cjsTitle = opts?.plugins?.title?.text || opts?.title?.text;
  const ds0 = datasets[0] || {};

  // Cutout (doughnut como gauge: "75%" → preservar para el case 'donut')
  const cutout = ds0.cutout || opts?.cutout;

  // Series multi: una por dataset (line/bar multi-serie)
  const series = datasets.map((ds, i) => ({
    name: ds.label || `Serie ${i + 1}`,
    data: ds.data || [],
    _backgroundColor: ds.backgroundColor,
    _borderColor: ds.borderColor,
    _tension: ds.tension,
    _fill: ds.fill,
    _pointRadius: ds.pointRadius,
  }));

  // Data "plana" para charts circulares (pie/donut/polar) — combina labels[i] con dataset[0].data[i]
  const dataFlat = (ds0.data || []).map((v, i) => {
    const base = {
      label: labels[i] != null ? String(labels[i]) : `Item ${i + 1}`,
      // value puede ser número o objeto {x,y,r}
      value: typeof v === 'number' ? v : (typeof v === 'object' ? (v?.value ?? v?.y ?? 0) : Number(v) || 0),
    };
    // Color por slice (cuando backgroundColor es array)
    if (Array.isArray(ds0.backgroundColor) && ds0.backgroundColor[i]) {
      base.color = ds0.backgroundColor[i];
    }
    // Scatter/bubble preservan x,y,r
    if (typeof v === 'object' && v) {
      if (v.x != null) base.x = v.x;
      if (v.y != null) base.y = v.y;
      if (v.r != null) base.r = v.r;
    }
    return base;
  });

  return {
    ...spec,
    // Title: prioriza el explícito; cae al embebido en options.plugins.title.text
    title: spec.title || cjsTitle,
    categories: labels.length ? labels : (spec.categories || null),
    series: series.length > 1 ? series : (spec.series || null),
    data: dataFlat.length ? dataFlat : (Array.isArray(spec.data) ? spec.data : []),
    _cutout: cutout,
    _legendPosition: opts?.plugins?.legend?.position,
  };
}

/**
 * Convierte una spec de Vera (formato simple O Chart.js) a una option de ECharts.
 * Acepta variantes de la spec:
 *   - { type, title, data: [{label, value, color?}] }                  ← simple
 *   - { type, title, categories: [...], series: [{name, data:[...]}] } ← multi-serie
 *   - { type, data: { labels:[...], datasets:[{data:[...]}] }, options }← Chart.js (lo que emite Vera)
 *   - { type, data: [{name, value, children?}] }                       ← treemap/sunburst
 *   - { type, nodes: [...], links: [...] }                             ← sankey/graph
 * Retorna { option, type } o null si el tipo no es soportado.
 */
function buildEChartsOption(rawSpec) {
  // Normalizar formato Chart.js (si aplica) ANTES de chequear el tipo
  const spec = _normalizeChartJsSpec(rawSpec);

  // Type: case-insensitive + sin separadores
  const rawType = String(spec.type || '').toLowerCase().replace(/[\s_-]+/g, '');
  // Aliases adicionales que parseChartSpec no captura cuando viene directo del bloque
  const TYPE_NORMALIZE = {
    doughnut: 'donut',
    polararea: 'polar',
    horizontalbarchart: 'horizontalbar',
    stackedbar: 'stackedbar',
  };
  const normalizedType = TYPE_NORMALIZE[rawType] || rawType;
  if (!ECHARTS_NATIVE_TYPES.has(normalizedType)) return null;
  spec.type = normalizedType;

  const title = spec.title ? String(spec.title) : '';
  const data = Array.isArray(spec.data) ? spec.data : [];
  const categories = Array.isArray(spec.categories) ? spec.categories : null;
  const seriesIn = Array.isArray(spec.series) ? spec.series : null;

  // Theme base — premium dark coherente con el resto del chat
  const textColor = tokenColor('--text-primary');
  const subColor = 'rgba(212,209,216,0.65)';
  const gridColor = 'rgba(255,255,255,0.06)';
  const tooltipBg = 'rgba(20,21,25,0.95)';

  const option = {
    backgroundColor: 'transparent',
    color: veraPaleta(),
    textStyle: { color: textColor, fontFamily: 'inherit' },
    title: title ? {
      text: title,
      textStyle: { color: textColor, fontWeight: 600, fontSize: 15 },
      left: 14, top: 12,
    } : undefined,
    grid: { left: 50, right: 30, top: title ? 50 : 24, bottom: 36, containLabel: true },
    legend: spec.legend !== false ? (() => {
      // Position: Chart.js usa "right"/"left"/"top"/"bottom"; ECharts usa props x/y
      const pos = spec._legendPosition || 'top';
      const cfg = { textStyle: { color: subColor }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 };
      if (pos === 'right')       Object.assign(cfg, { orient: 'vertical', right: 12, top: 'center' });
      else if (pos === 'left')   Object.assign(cfg, { orient: 'vertical', left: 12, top: 'center' });
      else if (pos === 'bottom') Object.assign(cfg, { bottom: 6, left: 'center' });
      else                       Object.assign(cfg, { top: title ? 14 : 8, right: 16 });
      return cfg;
    })() : undefined,
    tooltip: {
      trigger: 'item',
      backgroundColor: tooltipBg,
      borderColor: tokenColor('--border-color'),
      textStyle: { color: textColor, fontSize: 12 },
      extraCssText: 'box-shadow: 0 8px 20px rgba(0,0,0,0.5); border-radius: 8px;',
    },
  };

  // Helpers
  const labels = (d) => d.map((x) => String(x?.label ?? x?.name ?? ''));
  const values = (d) => d.map((x) => Number(x?.value ?? 0));
  const axisStyle = {
    axisLine: { lineStyle: { color: gridColor } },
    axisLabel: { color: subColor, fontSize: 11 },
    splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
  };

  // Usar normalizedType (post-aliasing) — rawType es el raw del input pre-aliasing.
  // Ej: rawType="doughnut" → normalizedType="donut" → case 'donut' hace match.
  switch (normalizedType) {
    case 'bar':
    case 'groupedbar': {
      option.tooltip.trigger = 'axis';
      option.xAxis = { type: 'category', data: categories || labels(data), ...axisStyle };
      option.yAxis = { type: 'value', ...axisStyle };
      option.series = seriesIn
        ? seriesIn.map((s) => ({ type: 'bar', name: s.name, data: s.data, itemStyle: { borderRadius: [6, 6, 0, 0] } }))
        : [{ type: 'bar', data: values(data), itemStyle: { borderRadius: [6, 6, 0, 0] } }];
      break;
    }
    case 'horizontalbar': {
      option.tooltip.trigger = 'axis';
      option.xAxis = { type: 'value', ...axisStyle };
      option.yAxis = { type: 'category', data: categories || labels(data), ...axisStyle };
      option.series = [{ type: 'bar', data: values(data), itemStyle: { borderRadius: [0, 6, 6, 0] } }];
      break;
    }
    case 'stackedbar': {
      option.tooltip.trigger = 'axis';
      option.xAxis = { type: 'category', data: categories, ...axisStyle };
      option.yAxis = { type: 'value', ...axisStyle };
      option.series = (seriesIn || []).map((s) => ({ type: 'bar', name: s.name, stack: 'total', data: s.data, itemStyle: { borderRadius: [4, 4, 0, 0] } }));
      break;
    }
    case 'line':
    case 'spline': {
      option.tooltip.trigger = 'axis';
      option.xAxis = { type: 'category', data: categories || labels(data), boundaryGap: false, ...axisStyle };
      option.yAxis = { type: 'value', ...axisStyle };
      option.series = seriesIn
        ? seriesIn.map((s) => ({ type: 'line', name: s.name, data: s.data, smooth: normalizedType === 'spline', symbolSize: 6, lineStyle: { width: 2.5 } }))
        : [{ type: 'line', data: values(data), smooth: normalizedType === 'spline', symbolSize: 6, lineStyle: { width: 2.5 } }];
      break;
    }
    case 'area':
    case 'stackedarea': {
      option.tooltip.trigger = 'axis';
      option.xAxis = { type: 'category', data: categories || labels(data), boundaryGap: false, ...axisStyle };
      option.yAxis = { type: 'value', ...axisStyle };
      const stack = normalizedType === 'stackedarea' ? 'total' : undefined;
      option.series = seriesIn
        ? seriesIn.map((s) => ({ type: 'line', name: s.name, stack, data: s.data, smooth: true, areaStyle: { opacity: 0.45 }, lineStyle: { width: 2 } }))
        : [{ type: 'line', data: values(data), smooth: true, areaStyle: { opacity: 0.45 }, lineStyle: { width: 2 } }];
      break;
    }
    case 'pie':
    case 'donut': {
      // Chart.js usa "cutout" para definir el inner radius del donut.
      // "75%" → inner 75% del outer → donut delgado (uso típico: gauge fake).
      // Parseamos % literal o número en píxeles.
      let innerR = '45%';
      if (spec._cutout) {
        const c = String(spec._cutout);
        innerR = c.endsWith('%') ? c : `${parseInt(c, 10) || 45}%`;
      }
      option.series = [{
        type: 'pie',
        radius: normalizedType === 'donut' ? [innerR, '72%'] : '72%',
        center: ['50%', '55%'],
        data: data.map((d) => ({ name: d.label || d.name, value: d.value, itemStyle: d.color ? { color: d.color } : undefined })),
        itemStyle: { borderColor: tokenColor('--bg-primary'), borderWidth: 2, borderRadius: 4 },
        label: { color: textColor },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.5)' } },
      }];
      break;
    }
    case 'polar': {
      // Nightingale rose chart = pie con roseType (Chart.js "polarArea")
      option.series = [{
        type: 'pie',
        roseType: 'area',
        radius: ['10%', '72%'],
        center: ['50%', '55%'],
        data: data.map((d) => ({ name: d.label || d.name, value: d.value, itemStyle: d.color ? { color: d.color } : undefined })),
        itemStyle: { borderColor: tokenColor('--bg-primary'), borderWidth: 2 },
        label: { color: textColor },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.5)' } },
      }];
      break;
    }
    case 'scatter':
    case 'bubble': {
      option.tooltip.trigger = 'item';
      option.xAxis = { type: 'value', ...axisStyle };
      option.yAxis = { type: 'value', ...axisStyle };
      const points = data.map((d) => [Number(d.x ?? 0), Number(d.y ?? d.value ?? 0), Number(d.size ?? d.r ?? 8), d.label || d.name || '']);
      option.series = [{
        type: 'scatter',
        data: points,
        symbolSize: normalizedType === 'bubble' ? (val) => Math.sqrt(val[2]) * 4 : 10,
      }];
      break;
    }
    case 'radar': {
      const indicators = (spec.indicators || labels(data)).map((name) => ({ name: String(name), max: spec.max || undefined }));
      option.radar = {
        indicator: indicators,
        axisName: { color: subColor },
        splitLine: { lineStyle: { color: gridColor } },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'] } },
        axisLine: { lineStyle: { color: gridColor } },
      };
      option.series = [{
        type: 'radar',
        data: seriesIn
          ? seriesIn.map((s) => ({ name: s.name, value: s.data, areaStyle: { opacity: 0.25 } }))
          : [{ value: values(data), areaStyle: { opacity: 0.25 } }],
      }];
      delete option.grid;
      break;
    }
    case 'heatmap': {
      const xs = spec.x || [];
      const ys = spec.y || [];
      const values_ = spec.values || data;
      option.tooltip.position = 'top';
      option.xAxis = { type: 'category', data: xs, splitArea: { show: true }, ...axisStyle };
      option.yAxis = { type: 'category', data: ys, splitArea: { show: true }, ...axisStyle };
      option.visualMap = {
        min: spec.min ?? 0, max: spec.max ?? 100, calculable: true, orient: 'horizontal',
        left: 'center', bottom: 0, textStyle: { color: subColor },
        inRange: { color: [tokenColor('--bg-card'), tokenColor('--prisma-azul'), tokenColor('--prisma-amarillo'), tokenColor('--prisma-rojo')] },
      };
      option.series = [{ type: 'heatmap', data: values_, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.5)' } } }];
      break;
    }
    case 'treemap': {
      option.series = [{
        type: 'treemap',
        data: data,
        roam: false,
        breadcrumb: { show: false },
        label: { color: 'white', fontWeight: 500 },
        upperLabel: { show: true, height: 28, color: 'white' },
        itemStyle: { borderColor: tokenColor('--bg-primary'), borderWidth: 2, gapWidth: 2 },
      }];
      delete option.grid;
      break;
    }
    case 'sunburst': {
      option.series = [{
        type: 'sunburst',
        data: data,
        radius: ['0%', '85%'],
        label: { color: 'white' },
        itemStyle: { borderColor: tokenColor('--bg-primary'), borderWidth: 2 },
      }];
      delete option.grid;
      break;
    }
    case 'gauge': {
      const val = Number(spec.value ?? data[0]?.value ?? 0);
      const max = Number(spec.max ?? 100);
      option.series = [{
        type: 'gauge',
        min: 0, max,
        progress: { show: true, width: 16 },
        axisLine: { lineStyle: { width: 16, color: [[1, gridColor]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: subColor, distance: 22 },
        pointer: { show: false },
        detail: { valueAnimation: true, formatter: spec.formatter || '{value}', color: textColor, fontSize: 30, offsetCenter: [0, '5%'] },
        data: [{ value: val, name: spec.subtitle || '' }],
        itemStyle: { color: veraPaleta()[0] },
      }];
      delete option.grid;
      break;
    }
    case 'funnel':
    case 'pyramid': {
      option.series = [{
        type: 'funnel',
        sort: normalizedType === 'pyramid' ? 'ascending' : 'descending',
        data: data.map((d) => ({ name: d.label || d.name, value: d.value })),
        label: { color: 'white', fontWeight: 500 },
        itemStyle: { borderColor: tokenColor('--bg-primary'), borderWidth: 2 },
      }];
      delete option.grid;
      break;
    }
    case 'sankey': {
      option.series = [{
        type: 'sankey',
        data: spec.nodes || [],
        links: spec.links || [],
        nodeAlign: 'justify',
        label: { color: textColor },
        lineStyle: { color: 'gradient', opacity: 0.45, curveness: 0.5 },
        itemStyle: { borderColor: tokenColor('--bg-primary'), borderWidth: 1 },
      }];
      delete option.grid;
      break;
    }
    case 'graph':
    case 'network': {
      option.series = [{
        type: 'graph',
        layout: spec.layout || 'force',
        force: { repulsion: 200, edgeLength: 80 },
        data: spec.nodes || [],
        links: spec.links || spec.edges || [],
        roam: true,
        label: { show: true, color: textColor },
        lineStyle: { color: 'source', curveness: 0.15 },
        emphasis: { focus: 'adjacency' },
      }];
      delete option.grid;
      break;
    }
    case 'candlestick':
    case 'kline': {
      option.tooltip.trigger = 'axis';
      option.xAxis = { type: 'category', data: categories || data.map((d) => d.date || d.label), ...axisStyle };
      option.yAxis = { type: 'value', scale: true, ...axisStyle };
      option.series = [{
        type: 'candlestick',
        data: data.map((d) => [d.open, d.close, d.low, d.high]),
        itemStyle: { color: tokenColor('--color-success'), color0: tokenColor('--color-error'), borderColor: tokenColor('--color-success'), borderColor0: tokenColor('--color-error') },
      }];
      break;
    }
    case 'boxplot': {
      option.tooltip.trigger = 'item';
      option.xAxis = { type: 'category', data: categories || labels(data), ...axisStyle };
      option.yAxis = { type: 'value', ...axisStyle };
      option.series = [{
        type: 'boxplot',
        data: data.map((d) => Array.isArray(d.value) ? d.value : [d.min, d.q1, d.median, d.q3, d.max]),
        itemStyle: { color: tokenColor('--white-12'), borderColor: tokenColor('--prisma-azul') },
      }];
      break;
    }
    case 'themeriver':
    case 'streamgraph': {
      option.tooltip.trigger = 'axis';
      option.singleAxis = { type: 'time', axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: subColor } };
      option.series = [{ type: 'themeRiver', data: data, label: { color: textColor } }];
      delete option.grid;
      delete option.xAxis;
      delete option.yAxis;
      break;
    }
    case 'parallel': {
      option.parallelAxis = (spec.dimensions || []).map((d, i) => ({ dim: i, name: String(d), nameTextStyle: { color: subColor }, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: subColor } }));
      option.parallel = { left: 60, right: 40, top: title ? 50 : 24, bottom: 36 };
      option.series = [{ type: 'parallel', data: data, lineStyle: { width: 1.5, opacity: 0.6 } }];
      delete option.grid;
      delete option.xAxis;
      delete option.yAxis;
      break;
    }
    case 'pictogram':
    case 'pictorialbar': {
      option.tooltip.trigger = 'axis';
      option.xAxis = { type: 'category', data: labels(data), ...axisStyle };
      option.yAxis = { type: 'value', ...axisStyle };
      option.series = [{ type: 'pictorialBar', symbol: spec.symbol || 'circle', symbolRepeat: true, symbolSize: 18, data: values(data), z: 10 }];
      break;
    }
    case 'calendar': {
      const year = spec.year || new Date().getFullYear();
      option.calendar = { range: String(year), cellSize: ['auto', 16], itemStyle: { borderColor: tokenColor('--bg-primary') }, dayLabel: { color: subColor }, monthLabel: { color: subColor }, splitLine: { lineStyle: { color: gridColor } } };
      option.visualMap = { min: spec.min ?? 0, max: spec.max ?? 100, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, textStyle: { color: subColor }, inRange: { color: [tokenColor('--bg-card'), tokenColor('--prisma-azul'), tokenColor('--prisma-amarillo')] } };
      option.series = [{ type: 'heatmap', coordinateSystem: 'calendar', data: data.map((d) => [d.date, d.value]) }];
      delete option.grid;
      delete option.xAxis;
      delete option.yAxis;
      break;
    }
    default:
      return null;
  }

  return { option, type: rawType };
}

// ── renderMarkdown (parser regex casero) ELIMINADO 2026-05-21 ──
// Reemplazado por método de clase VeraView.renderMarkdown() basado en
// marked@12 + DOMPurify@3 + bloques interactivos [CLARIFY|PILLS|STEPS|
// METRICS|ACTIONS]. Ver método más abajo en la clase. Los bloques legacy
// ```chart, ```buttons y ```mermaid siguen renderizándose vía
// renderChartBlock() / renderButtonsBlock() / hook post-render Mermaid.

const VERA_AVATAR_SRC = '/recursos/vera/Vera.svg';
// Logotipo completo (wordmark) para el hero de bienvenida: transparente, sin caja.
const VERA_WORDMARK_SRC = '/recursos/vera/Vera-2.svg';

/**
 * Corte ADR-0052: Vera habla por el borde /v1 (VeraDatos.enviar →
 * POST /v1/conversaciones/:id/mensajes) y responde como filas de ai.messages.
 * El ai-engine (api-ai-engine-chat, task-event, widget-action) se apagó con las
 * functions; lo que iba por ahí (acciones de widget, tareas, aprobaciones) viaja
 * como mensaje a Vera (L7: fuera el código que aún las llamaba).
 */

const FRAME_MIN_H = 160;      // igual que el min-height del CSS
const FRAME_MAX_H = 6000;     // techo duro: más allá, scroll interno
const FRAME_PROBE_H = 640;    // lienzo de sondeo para documentos atados al viewport
const FRAME_STORM_MS = 1500;  // ventana del detector
const FRAME_STORM_MAX = 12;   // ajustes dentro de la ventana antes de congelar

function fitSandboxFrame(frame, data, now = Date.now()) {
  const st = frame.__veraFit
    || (frame.__veraFit = { applied: 0, probed: false, frozen: false, winStart: 0, winCount: 0 });
  if (st.frozen) return st;

  const content = Math.round(Number(data?.content ?? data?.height) || 0);
  const viewport = Math.round(Number(data?.viewport) || 0);
  if (content <= 0) return st;

  const aplicar = (h) => {
    const next = clamp(Math.round(h), FRAME_MIN_H, FRAME_MAX_H);
    if (Math.abs(next - st.applied) < 2) return; // ya estamos ahí
    frame.style.height = `${next}px`;
    st.applied = next;
    if (now - st.winStart > FRAME_STORM_MS) { st.winStart = now; st.winCount = 1; }
    else if ((st.winCount += 1) > FRAME_STORM_MAX) st.frozen = true;
    if (next >= FRAME_MAX_H) st.frozen = true;
  };

  // Sin viewport (iframe viejo en caché): se aplica lo medido tal cual. No puede
  // desbocarse porque el detector de tormenta sigue contando.
  if (!viewport) { aplicar(content); return st; }

  if (Math.abs(content - st.applied) <= 1) return st;
  if (content < viewport - 1 || content > viewport + 1) { aplicar(content); return st; }

  if (!st.probed) { st.probed = true; aplicar(FRAME_PROBE_H); return st; }
  aplicar(content);
  return st;
}

/* ─── View ─────────────────────────────────────────────── */
