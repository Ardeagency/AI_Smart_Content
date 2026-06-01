/**
 * VeraView — Vera (chat conversacional)
 *
 * Layout: área de mensajes + composer (sin sidebar ni topbar).
 * Principio: 1 org → 1 cerebro (OpenClaw). Frontend → Backend API → OpenClaw.
 */

/* ─── Helpers ─────────────────────────────────────────── */
function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

/* ─── Vera Charts (SVG) ───────────────────────────────── */
function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.min(b, Math.max(a, x));
}

function safeColor(c, fallback = '#ffffff') {
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
  if (!t) throw new Error('Spec vacío');
  const spec = JSON.parse(t);
  if (!spec || typeof spec !== 'object') throw new Error('Spec inválido');
  const rawType = String(spec.type || spec.kind || spec.chartType || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!rawType) throw new Error('Falta spec.type');
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
    return `<div class="gpt-viz gpt-viz--fallback"><strong>${escapeHtml(title || 'Datos')}</strong><p style="color:var(--text-muted);margin-top:8px">El tipo <code>${escapeHtml(spec.type)}</code> no tiene render visual disponible y no hay datos para tabular.</p></div>`;
  }
  const hint = spec.type ? `<div style="font-size:.8em;color:var(--text-muted);margin-top:4px;">(tipo solicitado: <code>${escapeHtml(spec.type)}</code> — mostrado como tabla)</div>` : '';
  const headerKeys = Array.from(new Set(data.flatMap((d) => d && typeof d === 'object' ? Object.keys(d) : [])));
  const cols = headerKeys.length ? headerKeys : ['valor'];
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

  const palette = [
    '#ff6500', '#ff0000', '#ffe500', '#00d614', '#00e7ff', '#0018ee', '#5b00ea', '#900090'
  ];

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

    const stroke = safeColor(spec.stroke || '#00e7ff', '#00e7ff');
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
    const fill = safeColor(spec.fillColor || '#00d614', '#00d614');
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
        svg += `<text x="${cx}" y="${y + hSeg / 2 + 4}" text-anchor="middle" fill="#0b0b0b" font-family="${fontFamily}" font-size="12" font-weight="600">${escapeHtml(seg.label)}</text>`;
      }
      y += hSeg;
    });
  } else if (type === 'stacked_column' || type === 'stacked-column') {
    if (!isMulti) {
      svg += `<text x="${pad}" y="${plotY + 18}" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="12">stacked_column requiere { categories:[], series:[] }</text>`;
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
          color: safeColor(spec.stroke || '#00e7ff', '#00e7ff'),
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
    svg += `<text x="${pad}" y="${plotY + 18}" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="12">Tipo de gráfico no soportado: ${escapeHtml(type)}</text>`;
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
      svg += `<text x="${lx}" y="${ly + 2}" fill="${escapeHtml(muted)}" font-family="${fontFamily}" font-size="11">+${legendItems.length - maxItems} más</text>`;
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
    const msg = escapeHtml(e?.message || 'Error de chart spec');
    return `<div class="gpt-viz gpt-viz--error"><strong>Chart inválido:</strong> ${msg}<pre><code>${escapeHtml(String(code || '').trim())}</code></pre></div>`;
  }
}

function renderButtonsBlock(code) {
  try {
    const t = String(code || '').trim();
    const spec = JSON.parse(t);
    const buttons = Array.isArray(spec?.buttons) ? spec.buttons : (Array.isArray(spec) ? spec : []);
    if (!Array.isArray(buttons) || buttons.length === 0) {
      throw new Error('Spec sin botones');
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

    if (rows.length === 0) throw new Error('Botones sin texto');

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
    const msg = escapeHtml(e?.message || 'Error de buttons spec');
    return `<div class="gpt-viz gpt-viz--error"><strong>Buttons inválido:</strong> ${msg}<pre><code>${escapeHtml(String(code || '').trim())}</code></pre></div>`;
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
          primaryColor: '#16171b',
          primaryBorderColor: '#3a3a44',
          primaryTextColor: '#E8E5EC',
          // Edges (arrows)
          lineColor: '#6f6f78',
          // Edge labels
          edgeLabelBackground: '#16171b',
          tertiaryColor: '#16171b',
          // Subgraphs (clusters)
          clusterBkg: 'rgba(255,255,255,0.02)',
          clusterBorder: '#2c2c34',
          titleColor: '#D4D1D8',
          // Flowchart specifics
          nodeBorder: '#3a3a44',
          mainBkg: '#16171b',
          secondBkg: '#1a1b1f',
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
  } catch (_) {}
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
const VERA_CHART_PALETTE = [
  '#f5b942', '#3ec47d', '#5b8def', '#ff5b5b', '#a78bfa',
  '#22d3ee', '#fb923c', '#f472b6', '#84cc16', '#facc15',
];

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
  const textColor = '#E8E5EC';
  const subColor = 'rgba(212,209,216,0.65)';
  const gridColor = 'rgba(255,255,255,0.06)';
  const tooltipBg = 'rgba(20,21,25,0.95)';

  const option = {
    backgroundColor: 'transparent',
    color: VERA_CHART_PALETTE,
    textStyle: { color: textColor, fontFamily: 'inherit' },
    title: title ? {
      text: title,
      textStyle: { color: '#F0EDE8', fontWeight: 600, fontSize: 15 },
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
      borderColor: '#2c2c34',
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
        itemStyle: { borderColor: '#0e0f12', borderWidth: 2, borderRadius: 4 },
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
        itemStyle: { borderColor: '#0e0f12', borderWidth: 2 },
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
        inRange: { color: ['#1a1b1f', '#5b8def', '#f5b942', '#ff5b5b'] },
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
        label: { color: '#fff', fontWeight: 500 },
        upperLabel: { show: true, height: 28, color: '#fff' },
        itemStyle: { borderColor: '#0e0f12', borderWidth: 2, gapWidth: 2 },
      }];
      delete option.grid;
      break;
    }
    case 'sunburst': {
      option.series = [{
        type: 'sunburst',
        data: data,
        radius: ['0%', '85%'],
        label: { color: '#fff' },
        itemStyle: { borderColor: '#0e0f12', borderWidth: 2 },
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
        itemStyle: { color: VERA_CHART_PALETTE[0] },
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
        label: { color: '#fff', fontWeight: 500 },
        itemStyle: { borderColor: '#0e0f12', borderWidth: 2 },
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
        itemStyle: { borderColor: '#0e0f12', borderWidth: 1 },
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
        itemStyle: { color: '#3ec47d', color0: '#ff5b5b', borderColor: '#3ec47d', borderColor0: '#ff5b5b' },
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
        itemStyle: { color: 'rgba(91,141,239,0.3)', borderColor: '#5b8def' },
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
      option.calendar = { range: String(year), cellSize: ['auto', 16], itemStyle: { borderColor: '#0e0f12' }, dayLabel: { color: subColor }, monthLabel: { color: subColor }, splitLine: { lineStyle: { color: gridColor } } };
      option.visualMap = { min: spec.min ?? 0, max: spec.max ?? 100, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, textStyle: { color: subColor }, inRange: { color: ['#1a1b1f', '#5b8def', '#f5b942'] } };
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

/** URL del chat: ai-engine externo o Netlify Function en el mismo origen */
function getAiChatUrl() {
  const base = (typeof window !== 'undefined' && window.AI_ENGINE_BASE_URL)
    ? String(window.AI_ENGINE_BASE_URL).trim().replace(/\/+$/, '')
    : '';
  if (!base) {
    // Si el frontend está en HTTPS, evitamos Mixed Content usando el proxy HTTPS del mismo dominio.
    // En ese caso, la función proxy debe tener AI_ENGINE_URL configurado en Netlify.
    const pageIsHttps = window.location?.protocol === "https:";
    if (pageIsHttps) {
      return `${window.location.origin}/api/ai/engine-chat`;
    }
    throw new Error(
      'AI_ENGINE_BASE_URL no configurado. Define window.AI_ENGINE_BASE_URL (ej: http://tu-servidor:3000) o usa HTTPS + proxy /api/ai/engine-chat con AI_ENGINE_URL en Netlify.'
    );
  }

  // Si la página corre en HTTPS y ai-engine solo está en HTTP,
  // el browser bloqueará el request como Mixed Content.
  // En ese caso usamos un proxy bajo el mismo dominio.
  const pageIsHttps = window.location?.protocol === "https:";
  if (pageIsHttps && base.startsWith("http://")) {
    return `${window.location.origin}/api/ai/engine-chat`;
  }

  return `${base}/chat`;
}

/** Task events: solo mismo origen (Netlify) salvo que definas AI_ENGINE_BASE_URL con rutas equivalentes */
function getAiTaskEventUrl() {
  return `${window.location.origin}/api/ai/task-event`;
}

/* ─── View ─────────────────────────────────────────────── */
class VeraView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.aiState = {
      organization_id: null,
      active_conversation_id: null,
      messages: [],
      conversations: [],
      isLoading: false,
      pendingAttachments: []
    };
    this.organizationName = '';
    this.supabase = null;
    this.userId = null;
    this._initWidgetBridge();
  }

  /* ── Bridge para iframes sandbox de VERA (```html / ```artifact) ──
     Escucha 2 tipos de mensajes desde iframes null-origin:
      1) `vera_resize` → ajusta height del iframe.
      2) `vera_action` → widget invoca accion en plataforma (allowlist).

     Guard estatico evita registrar el listener mas de una vez si VeraView
     se instancia varias veces durante la sesion. */
  _initWidgetBridge() {
    if (VeraView.__widgetBridgeBound) return;
    VeraView.__widgetBridgeBound = true;
    // Allowlist de actionType. Read-only ejecutan directo en backend;
    // write actions se persisten en vera_pending_actions para revision humana.
    const ACTION_ALLOWLIST = new Set([
      // Read
      'get_metric',
      'list_campaigns',
      'list_products',
      'list_brands',
      'list_audiences',
      'list_pending_actions',
      // Write con pending_action
      'propose_brief',
      'flag_competitor',
    ]);

    window.addEventListener('message', async (event) => {
      const t = event.data?.type;
      if (!t) return;

      if (t === 'vera_resize') {
        const frames = document.querySelectorAll('.vera-sandbox-frame, .vera-artifact-frame');
        frames.forEach((frame) => {
          try {
            if (frame.contentWindow === event.source) {
              frame.style.height = (event.data.height + 24) + 'px';
            }
          } catch (_) { /* contentWindow puede ser inaccesible si el iframe se removio */ }
        });
        return;
      }

      if (t === 'vera_action') {
        // Validar que event.source es uno de nuestros iframes (anti-spoofing).
        const iframe = [...document.querySelectorAll('.vera-sandbox-frame, .vera-artifact-frame')]
          .find((f) => f.contentWindow === event.source);
        if (!iframe) return; // mensaje no viene de iframe nuestro -> ignorar

        const { requestId, actionType, payload, reasoning } = event.data || {};
        const reply = (ok, data, error) => {
          try { event.source.postMessage({ type: 'vera_action_result', requestId, ok, data, error }, '*'); }
          catch (_) { /* iframe puede haberse removido */ }
        };

        if (!requestId || typeof actionType !== 'string') {
          reply(false, null, 'invalid_request'); return;
        }
        if (!ACTION_ALLOWLIST.has(actionType)) {
          reply(false, null, `action_not_allowed:${actionType}`); return;
        }
        if (!this.aiState.organization_id) {
          reply(false, null, 'no_organization_context'); return;
        }

        try {
          const token = this.supabase
            ? (await this.supabase.auth.getSession())?.data?.session?.access_token
            : null;
          const res = await fetch('/.netlify/functions/api-widget-action', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              organization_id: this.aiState.organization_id,
              conversation_id: this.aiState.active_conversation_id || null,
              brand_container_id: this.aiState.brand_container_id || null,
              actionType,
              payload: payload || {},
              reasoning: reasoning || '',
            }),
          });
          let json = null;
          try { json = await res.json(); } catch (_) {}
          if (!res.ok) {
            reply(false, null, json?.error || `http_${res.status}`); return;
          }
          reply(json?.ok !== false, json?.data, json?.error);
        } catch (e) {
          reply(false, null, e?.message || 'network_error');
        }
        return;
      }
    });
  }

  /* ── onEnter: auth + org data ────────────────────────── */
  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    // Vista inmersiva: al entrar a Vera se colapsa el sidebar global para dar
    // todo el ancho al chat + su propio historial. Recuerda el estado previo y
    // lo restaura en onLeave() — no toca la preferencia global del usuario.
    try { window.appNavigation?.collapseForImmersive?.(); } catch (_) {}

    this.aiState.organization_id =
      this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.aiState.organization_id) {
      const url =
        window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
          ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
          : '/create';
      if (window.router) window.router.navigate(url, true);
      return;
    }

    if (window.appState) window.appState.set('selectedOrganizationId', this.aiState.organization_id, true);
    localStorage.setItem('selectedOrganizationId', this.aiState.organization_id);

    try {
      this.supabase = window.supabase || (window.supabaseService && (await window.supabaseService.getClient()));
      const user = window.authService?.getCurrentUser();
      if (!user?.id && this.supabase) {
        const { data: { user: u } } = await this.supabase.auth.getUser();
        this.userId = u?.id;
      } else {
        this.userId = user?.id;
      }
    } catch (e) {
      console.warn('VeraView supabase:', e);
    }

    this.organizationName = (window.currentOrgName || '').trim();
    if (!this.organizationName && this.supabase && this.aiState.organization_id) {
      try {
        // Reuse el cache de Navigation (`nav:org:${orgId}`): si ya se cargó el
        // sidebar, esta lectura es instantánea sin pegar a Supabase.
        const orgId = this.aiState.organization_id;
        const fetcher = async () => {
          const { data } = await this.supabase
            .from('organizations')
            .select('name')
            .eq('id', orgId)
            .maybeSingle();
          return data ? { name: data.name, plan: '' } : null;
        };
        const cached = window.apiClient
          ? await window.apiClient.query(`nav:org:${orgId}`, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
          : await fetcher();
        this.organizationName = cached?.name ? String(cached.name) : '';
      } catch (err) {
        // Antes era silencio total y el nombre mostraba "Organización" sin pista de por qué.
        console.warn('[VeraView] no se pudo resolver organization.name:', err?.message || err);
      }
    }
    if (!this.organizationName) this.organizationName = 'Organización';
  }

  /* ── HTML skeleton ───────────────────────────────────── */
  renderHTML() {
    return `
      <div id="chatcontainer" class="gpt-layout">
        <aside class="vera-history" id="veraHistory" aria-label="Historial de conversaciones">
          <div class="vera-history-head">
            <span class="vera-history-title"><i class="fas fa-clock-rotate-left"></i>Conversaciones</span>
            <button class="vera-history-collapse" id="veraHistoryCollapse" title="Ocultar historial" aria-label="Ocultar historial">
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
          <button class="vera-history-new" id="veraNewChat" title="Nueva conversación">
            <i class="fas fa-pen"></i><span>Nueva conversación</span>
          </button>
          <div class="vera-history-list" id="veraHistoryList"></div>
        </aside>
        <button class="vera-history-open" id="veraHistoryOpen" title="Mostrar conversaciones" aria-label="Mostrar conversaciones">
          <i class="fas fa-clock-rotate-left"></i>
        </button>
        <div class="vera-history-scrim" id="veraHistoryScrim"></div>
        <div class="gpt-main" id="gptMain">
          <div class="gpt-messages-scroll" id="veraMessagesWrap">
            <div class="gpt-messages-inner" id="veraMessageList"></div>
          </div>
          <div class="gpt-composer-wrap" id="chatInputOverlay">
            <div class="gpt-composer" id="veraInputWrap">
              <div class="gpt-attach-chips" id="veraAttachChips" hidden></div>
              <textarea
                class="gpt-composer-textarea"
                id="veraInput"
                placeholder="Pregunta lo que quieras"
                rows="1"
              ></textarea>
              <div class="gpt-composer-row">
                <div class="gpt-composer-btns">
                  <div class="vera-plus-wrap">
                    <button class="gpt-composer-icon" id="veraPlus" title="Adjuntar" aria-haspopup="true" aria-expanded="false">
                      <i class="fas fa-plus"></i>
                    </button>
                    <div class="vera-plus-menu" id="veraPlusMenu" hidden role="menu">
                      <button class="vera-plus-item" id="veraMenuFiles" role="menuitem">
                        <i class="fas fa-paperclip"></i><span>Agregar archivos o fotos</span>
                      </button>
                      <div class="vera-plus-sep"></div>
                      <button class="vera-plus-item" data-lib-type="product" role="menuitem"><i class="fas fa-box"></i><span>Producto</span></button>
                      <button class="vera-plus-item" data-lib-type="campaign" role="menuitem"><i class="fas fa-bullhorn"></i><span>Campaña</span></button>
                      <button class="vera-plus-item" data-lib-type="campaign_objective" role="menuitem"><i class="fas fa-bullseye"></i><span>Objetivo de campaña</span></button>
                      <button class="vera-plus-item" data-lib-type="audience_objective" role="menuitem"><i class="fas fa-users"></i><span>Objetivo de audiencia</span></button>
                      <button class="vera-plus-item" data-lib-type="brief" role="menuitem"><i class="fas fa-clipboard"></i><span>Brief</span></button>
                      <button class="vera-plus-item" data-lib-type="service" role="menuitem"><i class="fas fa-briefcase"></i><span>Servicios</span></button>
                      <button class="vera-plus-item" data-lib-type="place" role="menuitem"><i class="fas fa-map-pin"></i><span>Lugares</span></button>
                    </div>
                  </div>
                </div>
                <button class="gpt-send-btn" id="veraSend" title="Enviar" disabled>
                  <i class="fas fa-arrow-up"></i>
                </button>
              </div>
              <input type="file" id="veraFileInput" multiple hidden
                accept="image/*,application/pdf,audio/*,video/*,
                       .doc,.docx,.xls,.xlsx,.csv,.txt,.md,
                       application/msword,
                       application/vnd.openxmlformats-officedocument.wordprocessingml.document,
                       application/vnd.ms-excel,
                       application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
                       text/csv,text/plain,text/markdown" />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ── init: wire up everything ────────────────────────── */
  async init() {
    if (!this.container) return;

    this.bindInput();
    this._requestNotificationPermission();

    // Handler global de seleccion de opciones del input-area (CLARIFY / PILLS).
    // Re-asignado en init de cada onEnter — si VeraView se monta varias veces,
    // siempre apunta a la instancia activa.
    window._veraSelectOption = (text) => {
      // Marca la card seleccionada para feedback visual
      document.querySelectorAll('.vera-input-option-card').forEach((c) => {
        c.classList.remove('selected');
        const title = c.querySelector('.vera-option-title')?.textContent;
        if (title === text) c.classList.add('selected');
      });
      // Pequeno delay para que el usuario vea el highlight, luego envia
      setTimeout(() => {
        this._hideInputOptions();
        this.sendMessage(text);
      }, 250);
    };

    // Por defecto Vera abre en "nueva conversación". Solo si la URL apunta a
    // una conversación concreta (?c=<id>) la cargamos — así un refresh mantiene
    // al usuario en la misma conversación (deep-link).
    const urlConvId = this._getUrlConversationId();
    if (urlConvId) {
      this.aiState.active_conversation_id = urlConvId;
      await this.loadMessages();
      if (this.aiState.messages.length) {
        this.renderMessages();
      } else {
        // id inválido / ajeno / sin mensajes → nueva conversación limpia.
        this.aiState.active_conversation_id = null;
        this._setConversationUrl(null);
        this.renderWelcome();
      }
    } else {
      this.renderWelcome();
    }

    // Historial de conversaciones (rail izquierdo, estilo ChatGPT).
    this.bindHistory();
    this._applyHistoryCollapsed();
    await this.loadConversations();
    this.renderHistory();

    // Si entramos por deep-link, completa el slug del título en la URL.
    if (this.aiState.active_conversation_id) {
      const c = (this.aiState.conversations || []).find((x) => x.id === this.aiState.active_conversation_id);
      this._setConversationUrl(this.aiState.active_conversation_id, c?.title);
    }

    // Prefill desde ?q=<prompt> (usado por Monitoring → cards de perfiles).
    // Precarga el textarea sin enviar, deja la URL limpia y enfoca.
    try {
      const params = new URLSearchParams(window.location.search || '');
      const q = params.get('q');
      if (q) {
        const input = document.getElementById('veraInput');
        if (input) {
          input.value = q;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          requestAnimationFrame(() => input.focus());
        }
        params.delete('q');
        const search = params.toString();
        const cleanUrl = window.location.pathname + (search ? '?' + search : '') + window.location.hash;
        window.history.replaceState(null, '', cleanUrl);
      }
    } catch (_) { /* no-op */ }
  }

  _bindMediaHover() {
    const root = document.getElementById('veraMessageList');
    if (!root || root.__veraMediaHoverBound) return;
    root.__veraMediaHoverBound = true;

    root.addEventListener(
      'mouseenter',
      async (e) => {
        const el = e.target?.closest?.('video.gpt-md-video');
        if (!el) return;
        try {
          el.controls = false;
          el.currentTime = 0;
          await el.play();
        } catch (_) {}
      },
      true
    );

    root.addEventListener(
      'mouseleave',
      (e) => {
        const el = e.target?.closest?.('video.gpt-md-video');
        if (!el) return;
        try {
          el.pause();
          el.currentTime = 0;
          el.controls = true;
        } catch (_) {}
      },
      true
    );
  }

  /* ── Active conversation (última sesión) ─────────────── */
  async loadActiveConversation() {
    if (!this.supabase || !this.aiState.organization_id || !this.userId) return;
    const { data } = await this.supabase
      .from('ai_conversations')
      .select('id')
      .eq('organization_id', this.aiState.organization_id)
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) this.aiState.active_conversation_id = data.id;
  }

  /* ── Deep-link de conversación (?c=<id>&t=<slug>) ────── */

  _getUrlConversationId() {
    try { return new URLSearchParams(window.location.search || '').get('c') || ''; }
    catch (_) { return ''; }
  }

  _slugify(s) {
    return String(s || '')
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  // Sincroniza la URL con la conversación activa (replaceState: no ensucia el
  // history). id null/'' → limpia los params (vuelve a /vera = nueva conversación).
  _setConversationUrl(id, title) {
    try {
      const base = window.location.pathname || '/vera';
      if (!id) { window.history.replaceState(null, '', base); return; }
      const params = new URLSearchParams();
      params.set('c', id);
      const slug = this._slugify(title);
      if (slug) params.set('t', slug);
      window.history.replaceState(null, '', `${base}?${params.toString()}`);
    } catch (_) { /* no-op */ }
  }

  /* ── Historial de conversaciones (rail izquierdo) ────── */

  // Al salir de Vera (router.onLeave) restauramos el sidebar global.
  onLeave() {
    try { window.appNavigation?.restoreFromImmersive?.(); } catch (_) {}
  }

  /**
   * Carga las conversaciones del usuario en esta organización. Pide el conteo
   * de mensajes embebido (FK ai_messages_conv_fkey) para filtrar las sesiones
   * vacías (p. ej. "Sesión de voz" sin mensajes) que solo serían ruido.
   */
  async loadConversations() {
    this.aiState.conversations = [];
    if (!this.supabase || !this.aiState.organization_id || !this.userId) return;
    try {
      const { data, error } = await this.supabase
        .from('ai_conversations')
        .select('id, title, updated_at, ai_messages(count)')
        .eq('organization_id', this.aiState.organization_id)
        .eq('user_id', this.userId)
        .order('updated_at', { ascending: false })
        .limit(60);
      if (error || !data) return;
      this.aiState.conversations = data.filter(
        (c) => (c.ai_messages?.[0]?.count || 0) > 0
      );
    } catch (_) { /* lista vacía si falla */ }
  }

  // Agrupa por antigüedad relativa al día actual (estilo ChatGPT).
  _historyBucket(updatedAt) {
    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const now = new Date();
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return 'Anteriores';
    const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diff <= 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff <= 7) return 'Últimos 7 días';
    if (diff <= 30) return 'Últimos 30 días';
    return 'Anteriores';
  }

  _convTitle(c) {
    const t = (c?.title || '').trim();
    if (!t || t === 'Sesión de voz') return 'Conversación';
    return t;
  }

  renderHistory() {
    const list = document.getElementById('veraHistoryList');
    if (!list) return;
    const convs = this.aiState.conversations || [];
    if (!convs.length) {
      list.innerHTML = `<div class="vera-history-empty">Aún no tienes conversaciones.<br>Escribe abajo para empezar.</div>`;
      return;
    }
    const order = ['Hoy', 'Ayer', 'Últimos 7 días', 'Últimos 30 días', 'Anteriores'];
    const groups = {};
    for (const c of convs) {
      const b = this._historyBucket(c.updated_at);
      (groups[b] = groups[b] || []).push(c);
    }
    const active = this.aiState.active_conversation_id;
    let html = '';
    for (const g of order) {
      if (!groups[g]) continue;
      html += `<div class="vera-history-group">${g}</div>`;
      for (const c of groups[g]) {
        const title = this._convTitle(c);
        const safe = escapeHtml(title);
        const attr = safe.replace(/"/g, '&quot;');
        const cls = c.id === active ? 'vera-history-item active' : 'vera-history-item';
        html += `<button class="${cls}" data-conv-id="${c.id}" title="${attr}"><span class="vera-history-item-title">${safe}</span></button>`;
      }
    }
    list.innerHTML = html;
  }

  bindHistory() {
    const list = document.getElementById('veraHistoryList');
    if (list && !list.__veraHistBound) {
      list.__veraHistBound = true;
      list.addEventListener('click', (e) => {
        const item = e.target.closest('.vera-history-item');
        if (!item) return;
        const id = item.getAttribute('data-conv-id');
        if (id) this.selectConversation(id);
      });
    }
    const wire = (id, fn) => {
      const el = document.getElementById(id);
      if (el && !el.__veraBound) { el.__veraBound = true; el.addEventListener('click', fn); }
    };
    wire('veraNewChat', () => this.startNewConversation());
    wire('veraHistoryCollapse', () => this.toggleHistory(true));
    wire('veraHistoryOpen', () => this.toggleHistory(false));
    wire('veraHistoryScrim', () => this.toggleHistory(true));
  }

  /* ── Adjuntar de biblioteca ──────────────────────────────
     Permite adjuntar productos, campañas, audiencias y marcas de la
     plataforma como contexto para Vera. Se anexan como referencias compactas
     (tipo + nombre + id) al mensaje; Vera las lee y puede profundizar con sus
     herramientas. En el chat se muestran como chips, no como texto crudo. */

  // Tipos adjuntables. kind === key. Cada uno define label, icono y un loader
  // que devuelve [{id, name, meta}].
  _libTypeDef(kind) {
    const orgId = this.aiState.organization_id;
    const sb = () => this.supabase;
    const defs = {
      product: {
        label: 'Producto', icon: 'fa-box',
        load: async () => {
          const { data } = await sb().from('products')
            .select('id, nombre_producto, tipo_producto')
            .eq('organization_id', orgId).order('nombre_producto', { ascending: true }).limit(300);
          return (data || []).map((r) => ({ id: r.id, name: r.nombre_producto || 'Producto sin nombre', meta: r.tipo_producto || '' }));
        }
      },
      campaign: {
        label: 'Campaña', icon: 'fa-bullhorn',
        load: async () => {
          const { data } = await sb().from('campaigns')
            .select('id, nombre_campana, status')
            .eq('organization_id', orgId).neq('status', 'conceptual')
            .order('created_at', { ascending: false }).limit(300);
          const st = { active: 'Activa', paused: 'Pausada', draft: 'Borrador', ended: 'Finalizada', archived: 'Archivada' };
          return (data || []).map((r) => ({ id: r.id, name: r.nombre_campana || 'Campaña sin nombre', meta: st[r.status] || r.status || '' }));
        }
      },
      campaign_objective: {
        label: 'Objetivo de campaña', icon: 'fa-bullseye',
        load: async () => {
          const { data } = await sb().from('campaigns')
            .select('id, nombre_campana')
            .eq('organization_id', orgId).eq('status', 'conceptual')
            .order('created_at', { ascending: false }).limit(300);
          return (data || []).map((r) => ({ id: r.id, name: r.nombre_campana || 'Objetivo sin nombre', meta: 'Conceptual' }));
        }
      },
      audience_objective: {
        label: 'Objetivo de audiencia', icon: 'fa-users',
        load: async () => {
          const { data } = await sb().from('audience_personas')
            .select('id, name, awareness_level')
            .eq('organization_id', orgId).order('name', { ascending: true }).limit(300);
          return (data || []).map((r) => ({ id: r.id, name: r.name || 'Audiencia sin nombre', meta: r.awareness_level || '' }));
        }
      },
      brief: {
        label: 'Brief', icon: 'fa-clipboard',
        load: async () => {
          const { data } = await sb().from('brand_containers')
            .select('id, nombre_marca, creative_brief')
            .eq('organization_id', orgId).order('created_at', { ascending: true }).limit(100);
          return (data || [])
            .filter((r) => r.creative_brief && String(r.creative_brief).trim())
            .map((r) => ({ id: r.id, name: `Brief — ${r.nombre_marca || 'Marca'}`, meta: '' }));
        }
      },
      service: {
        label: 'Servicio', icon: 'fa-briefcase',
        load: async () => {
          const { data } = await sb().from('services')
            .select('id, nombre_servicio')
            .eq('organization_id', orgId).order('nombre_servicio', { ascending: true }).limit(300);
          return (data || []).map((r) => ({ id: r.id, name: r.nombre_servicio || 'Servicio sin nombre', meta: '' }));
        }
      },
      place: {
        label: 'Lugar', icon: 'fa-map-pin',
        load: async () => {
          // brand_places no tiene organization_id → se filtra por entity_id de la org.
          const { data: ents } = await sb().from('brand_entities')
            .select('id').eq('organization_id', orgId).limit(500);
          const ids = (ents || []).map((e) => e.id);
          if (!ids.length) return [];
          const { data } = await sb().from('brand_places')
            .select('id, nombre_lugar').in('entity_id', ids).limit(300);
          return (data || []).map((r) => ({ id: r.id, name: r.nombre_lugar || 'Lugar sin nombre', meta: '' }));
        }
      }
    };
    return defs[kind] || null;
  }

  _libKindLabel(kind) {
    const d = this._libTypeDef(kind);
    return d ? d.label : 'Dato';
  }
  _libKindIcon(kind) {
    return ({
      product: 'fa-box', campaign: 'fa-bullhorn', campaign_objective: 'fa-bullseye',
      audience_objective: 'fa-users', brief: 'fa-clipboard', service: 'fa-briefcase', place: 'fa-map-pin'
    })[kind] || 'fa-layer-group';
  }

  // Picker de UN tipo (Producto, Campaña, etc.). La selección se acumula con la
  // de otros tipos ya adjuntados; al confirmar solo se reemplazan los de ESTE tipo.
  _openLibraryPicker(typeKey) {
    if (document.getElementById('veraLibModal')) return;
    if (!this.supabase || !this.aiState.organization_id) return;
    const def = this._libTypeDef(typeKey);
    if (!def) return;

    this._libCache = this._libCache || {};
    const selected = new Map(); // id -> {kind, id, name}
    this.aiState.pendingAttachments
      .filter((a) => a.type === 'library' && a.kind === typeKey)
      .forEach((a) => selected.set(a.refId, { kind: typeKey, id: a.refId, name: a.name }));

    const overlay = document.createElement('div');
    overlay.id = 'veraLibModal';
    overlay.className = 'vera-lib-modal';
    overlay.innerHTML = `
      <div class="vera-lib-scrim" data-lib-close></div>
      <div class="vera-lib-panel" role="dialog" aria-label="Adjuntar ${escapeHtml(def.label)}">
        <div class="vera-lib-head">
          <span class="vera-lib-title"><i class="fas ${def.icon}"></i> Adjuntar ${escapeHtml(def.label)}</span>
          <button class="vera-lib-x" data-lib-close aria-label="Cerrar"><i class="fas fa-times"></i></button>
        </div>
        <input type="text" class="vera-lib-search" id="veraLibSearch" placeholder="Buscar…" />
        <div class="vera-lib-list" id="veraLibList"></div>
        <div class="vera-lib-foot">
          <span class="vera-lib-count" id="veraLibCount">0 seleccionados</span>
          <div class="vera-lib-foot-actions">
            <button class="vera-lib-cancel" data-lib-close>Cancelar</button>
            <button class="vera-lib-confirm" id="veraLibConfirm">Adjuntar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const listEl = overlay.querySelector('#veraLibList');
    const searchEl = overlay.querySelector('#veraLibSearch');
    const countEl = overlay.querySelector('#veraLibCount');
    const confirmBtn = overlay.querySelector('#veraLibConfirm');

    const updateFoot = () => {
      countEl.textContent = `${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`;
    };

    const renderList = (items) => {
      const q = (searchEl.value || '').trim().toLowerCase();
      const filtered = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
      if (!filtered.length) {
        listEl.innerHTML = `<div class="vera-lib-empty">${items.length ? 'Sin resultados.' : `No hay ${def.label.toLowerCase()}s disponibles.`}</div>`;
        return;
      }
      listEl.innerHTML = filtered.map((it) => `
        <label class="vera-lib-item">
          <input type="checkbox" data-lib-id="${escapeHtml(it.id)}"${selected.has(it.id) ? ' checked' : ''} />
          <span class="vera-lib-item-body">
            <span class="vera-lib-item-name">${escapeHtml(it.name)}</span>
            ${it.meta ? `<span class="vera-lib-item-meta">${escapeHtml(it.meta)}</span>` : ''}
          </span>
        </label>`).join('');
    };

    const load = async () => {
      if (!this._libCache[typeKey]) {
        listEl.innerHTML = `<div class="vera-lib-loading"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>`;
        try { this._libCache[typeKey] = await def.load(); }
        catch (_) { this._libCache[typeKey] = []; }
      }
      renderList(this._libCache[typeKey]);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-lib-close]')) overlay.remove();
    });
    listEl.addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-lib-id]');
      if (!cb) return;
      const id = cb.getAttribute('data-lib-id');
      const it = (this._libCache[typeKey] || []).find((x) => x.id === id);
      if (!it) return;
      if (cb.checked) selected.set(id, { kind: typeKey, id, name: it.name });
      else selected.delete(id);
      updateFoot();
    });
    searchEl.addEventListener('input', () => renderList(this._libCache[typeKey] || []));
    confirmBtn.addEventListener('click', () => {
      this._setLibraryAttachmentsForType(typeKey, Array.from(selected.values()));
      overlay.remove();
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });

    updateFoot();
    load();
    setTimeout(() => searchEl.focus(), 50);
  }

  // Reemplaza los adjuntos de biblioteca de UN tipo por la selección dada,
  // conservando los de otros tipos.
  _setLibraryAttachmentsForType(typeKey, items) {
    const keepIds = new Set(items.map((i) => i.id));
    this.aiState.pendingAttachments = this.aiState.pendingAttachments.filter(
      (a) => a.type !== 'library' || a.kind !== typeKey || keepIds.has(a.refId)
    );
    const existing = new Set(
      this.aiState.pendingAttachments.filter((a) => a.type === 'library' && a.kind === typeKey).map((a) => a.refId)
    );
    items.forEach((i) => {
      if (existing.has(i.id)) return;
      this.aiState.pendingAttachments.push({
        id: `lib-${typeKey}-${i.id}`, type: 'library', kind: typeKey,
        refId: i.id, name: i.name, status: 'ready'
      });
    });
    this._renderAttachChips();
    this._syncSendBtn?.();
    const input = document.getElementById('veraInput');
    if (input) requestAnimationFrame(() => input.focus());
  }

  // Bloque de contexto que se ANEXA al mensaje enviado a Vera (no al display).
  _buildLibraryContext(libItems) {
    if (!libItems || !libItems.length) return '';
    const lines = libItems.map((a) => {
      const name = String(a.name || '').replace(/[|\n\r]/g, ' ').trim();
      return `- ${this._libKindLabel(a.kind)} | ${name} | ${a.refId}`;
    });
    return `\n\n<<DATOS_BIBLIOTECA>>\n${lines.join('\n')}\n<</DATOS_BIBLIOTECA>>\nEl usuario adjuntó estos elementos de la biblioteca de la plataforma como foco; úsalos y, si necesitas más detalle, amplíalos con tus herramientas.`;
  }

  // Separa el bloque <<DATOS_BIBLIOTECA>> del texto visible y lo parsea a chips.
  _parseLibraryContext(content) {
    const raw = String(content || '');
    const m = raw.match(/<<DATOS_BIBLIOTECA>>\n([\s\S]*?)\n<<\/DATOS_BIBLIOTECA>>/);
    if (!m) return { text: raw, refs: [] };
    const labelToKind = {
      'Producto': 'product', 'Campaña': 'campaign', 'Objetivo de campaña': 'campaign_objective',
      'Objetivo de audiencia': 'audience_objective', 'Brief': 'brief', 'Servicio': 'service', 'Lugar': 'place'
    };
    const refs = m[1].split('\n').map((line) => {
      const p = line.replace(/^-\s*/, '').split('|').map((s) => s.trim());
      return { kind: labelToKind[p[0]] || 'data', name: p[1] || '', id: p[2] || '' };
    }).filter((r) => r.name);
    const text = raw.replace(/\n*<<DATOS_BIBLIOTECA>>[\s\S]*$/, '').trim();
    return { text, refs };
  }

  _renderLibraryRefs(refs) {
    const list = Array.isArray(refs) ? refs : [];
    if (!list.length) return '';
    const items = list.map((r) => `
      <span class="gpt-msg-att gpt-msg-att--lib" title="${escapeHtml(this._libKindLabel(r.kind))}">
        <i class="fas ${this._libKindIcon(r.kind)}"></i>
        <span>${escapeHtml(r.name)}</span>
      </span>`).join('');
    return `<div class="gpt-msg-attachments gpt-msg-attachments--lib">${items}</div>`;
  }

  _isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
  }

  // collapsed === undefined → alterna. true → oculta, false → muestra.
  toggleHistory(collapsed) {
    const layout = document.getElementById('chatcontainer');
    if (!layout) return;
    const next = collapsed === undefined
      ? !layout.classList.contains('history-collapsed')
      : !!collapsed;
    layout.classList.toggle('history-collapsed', next);
    // En móvil el historial es un drawer temporal: no persistimos su estado.
    if (!this._isMobile()) {
      try { localStorage.setItem('veraHistoryCollapsed', next ? 'true' : 'false'); } catch (_) {}
    }
  }

  _applyHistoryCollapsed() {
    const layout = document.getElementById('chatcontainer');
    if (!layout) return;
    let collapsed = false;
    if (this._isMobile()) {
      collapsed = true; // móvil: drawer cerrado por defecto
    } else {
      try { collapsed = localStorage.getItem('veraHistoryCollapsed') === 'true'; } catch (_) {}
    }
    layout.classList.toggle('history-collapsed', collapsed);
  }

  async selectConversation(id) {
    if (!id) return;
    if (id !== this.aiState.active_conversation_id) {
      this.aiState.active_conversation_id = id;
      await this.loadMessages();
      this.renderMessages();
      this.renderHistory();
      const c = (this.aiState.conversations || []).find((x) => x.id === id);
      this._setConversationUrl(id, c?.title);
    }
    if (this._isMobile()) this.toggleHistory(true);
  }

  startNewConversation() {
    this.aiState.active_conversation_id = null;
    this.aiState.messages = [];
    this._setConversationUrl(null); // vuelve a /vera (nueva conversación)
    this.renderWelcome();
    this.renderHistory();
    const input = document.getElementById('veraInput');
    if (input) requestAnimationFrame(() => input.focus());
    if (this._isMobile()) this.toggleHistory(true);
  }

  // Refresca el rail tras un intercambio (nueva conversación o título nuevo).
  // Debounced: el backend puede tardar en generar el título de la sesión.
  _refreshHistorySoon() {
    if (this._histRefreshTimer) clearTimeout(this._histRefreshTimer);
    this._histRefreshTimer = setTimeout(async () => {
      await this.loadConversations();
      this.renderHistory();
    }, 1200);
  }

  /* Genera el titulo de una conversacion recien creada con OpenAI (Netlify fn
     api-name-conversation), a partir del primer mensaje del usuario. Best-effort,
     una sola vez por conversacion; al exito repinta el rail con el titulo nuevo. */
  _nameConversationSoon(convId) {
    if (!convId) return;
    this._namedConvs = this._namedConvs || new Set();
    if (this._namedConvs.has(convId)) return;
    this._namedConvs.add(convId);
    setTimeout(async () => {
      try {
        const token = this.supabase
          ? (await this.supabase.auth.getSession())?.data?.session?.access_token
          : null;
        const res = await fetch('/.netlify/functions/api-name-conversation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            conversation_id: convId,
            organization_id: this.aiState.organization_id
          })
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (json?.title) {
          await this.loadConversations();
          this.renderHistory();
          // Si esta conversación sigue siendo la activa, refleja el título
          // nuevo en el slug de la URL.
          if (this.aiState.active_conversation_id === convId) {
            this._setConversationUrl(convId, json.title);
          }
        }
      } catch (_) { /* best-effort: si falla, queda "Nueva conversación" */ }
    }, 1500);
  }

  /* ── Messages ────────────────────────────────────────── */
  async loadMessages() {
    if (!this.supabase || !this.aiState.active_conversation_id) {
      this.aiState.messages = [];
      return;
    }
    try {
      const { data, error } = await this.supabase
        .from('ai_messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', this.aiState.active_conversation_id)
        .in('role', ['user', 'assistant', 'error'])
        .order('created_at', { ascending: true });
      this.aiState.messages = (!error && data) ? data : [];
    } catch (_) {
      this.aiState.messages = [];
    }
  }

  // Nombre para el saludo: primero el nombre real del usuario, si no la org.
  _greetingName() {
    const user = (window.authService?.getCurrentUser?.()) || {};
    const emailPrefix = String(user.email || '').split('@')[0];
    const fn = String(user.full_name || '').trim();
    // full_name puede ser el prefijo del email (fallback de AuthService) → lo ignoramos.
    if (fn && fn.toLowerCase() !== emailPrefix.toLowerCase() && fn !== 'Demo visitor') {
      return fn.split(/\s+/)[0];
    }
    const org = (this.organizationName || '').trim();
    if (org && org !== 'Organización') return org;
    return '';
  }

  // Estado "nuevo chat": el composer se centra verticalmente junto al saludo.
  // Con mensajes vuelve a su sitio (anclado abajo).
  _setWelcomeMode(on) {
    const main = document.getElementById('gptMain');
    if (main) main.classList.toggle('is-welcome', !!on);
  }

  renderWelcome() {
    const list = document.getElementById('veraMessageList');
    if (!list) return;
    this._setWelcomeMode(true);
    const name = this._greetingName();
    const greeting = name ? `Hola, ${escapeHtml(name)}` : 'Hola';
    list.innerHTML = `
      <div class="gpt-welcome gpt-welcome--hero">
        <div class="gpt-welcome-mark">
          <img src="${VERA_AVATAR_SRC}" alt="Vera" width="60" height="60" decoding="async" />
        </div>
        <h1 class="gpt-welcome-title">${greeting}</h1>
        <p class="gpt-welcome-subtitle">¿En qué puedo ayudarte hoy?</p>
      </div>
    `;
  }

  _bindTaskEvents() {
    const root = document.getElementById('veraMessageList');
    if (!root || root.__veraTaskBound) return;
    root.__veraTaskBound = true;

    root.addEventListener('change', async (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (!el.classList.contains('gpt-task-checkbox')) return;
      const idx = Number(el.getAttribute('data-task-idx') || '0');
      const taskText = el.getAttribute('data-task-text') || '';
      const sourceMessageId = el.getAttribute('data-message-id') || '';
      const checked = !!el.checked;

      // Persist event so Vera can see it next turn (no immediate assistant reply)
      try {
        const token = this.supabase
          ? (await this.supabase.auth.getSession())?.data?.session?.access_token
          : null;

        await fetch(getAiTaskEventUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            organization_id: this.aiState.organization_id,
            conversation_id: this.aiState.active_conversation_id,
            source_message_id: sourceMessageId,
            task_index: idx,
            task_text: taskText,
            checked
          })
        });
      } catch (err) {
        console.warn('Task event failed:', err);
      }
    });
  }

  _bindQuickReplyButtons() {
    const root = document.getElementById('veraMessageList');
    if (!root || root.__veraQuickRepliesBound) return;
    root.__veraQuickRepliesBound = true;

    root.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button.gpt-qr-btn');
      if (!btn) return;
      const text = btn.getAttribute('data-qr-text') || '';
      if (!text.trim()) return;
      if (this.aiState.isLoading) return;

      // Disable the whole quick reply group after selection (prevents double clicks)
      const group = btn.closest?.('[data-qr=\"true\"]');
      if (group) {
        group.querySelectorAll?.('button.gpt-qr-btn')?.forEach?.((b) => (b.disabled = true));
        group.setAttribute('data-qr-used', 'true');
      }

      this.sendMessage(text.trim());
    });
  }

  /* Opciones interactivas [CLARIFY]/[PILLS]: click en una opcion la ENVIA como
     respuesta del usuario. Delegacion idempotente sobre la lista de mensajes. */
  _bindInteractiveOptions() {
    // Se enlaza en #chatcontainer (no en la lista de mensajes) para cubrir tanto
    // las opciones inline como el widget DOCKEADO sobre el composer.
    const root = document.getElementById('chatcontainer');
    if (!root || root.__veraInteractiveBound) return;
    root.__veraInteractiveBound = true;

    root.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-vera-send]');
      if (!btn) return;
      const block = btn.closest('.vera-interactive');
      if (block && block.classList.contains('answered')) return;
      if (this.aiState.isLoading) return;
      const value = btn.getAttribute('data-vera-send') || '';
      if (!value.trim()) return;
      // Bloquea reenvio y marca la opcion elegida.
      if (block) {
        block.classList.add('answered');
        btn.classList.add('selected');
      }
      this._undockQuestion();
      this.sendMessage(value.trim());
    });
  }

  _focusComposer() {
    const input = document.getElementById('veraInput');
    if (!input) return;
    input.focus();
    try { input.selectionStart = input.selectionEnd = input.value.length; } catch (_) {}
  }

  /* Controlador del widget [CLARIFY]: pager "n de N", teclado (↑↓ opciones,
     ←→ paginas), modos multi (toggle + Confirmar) y rank (drag + Confirmar),
     "Algo más" (foca el composer), "Omitir"/cerrar. El envio en modo single lo
     maneja la delegacion data-vera-send. */
  _initClarifyWidgets() {
    const widgets = document.querySelectorAll('.vera-clarify:not(.__init)');
    widgets.forEach((w) => {
      w.classList.add('__init');
      const pagesEls = Array.from(w.querySelectorAll('.vera-clarify-page'));
      const total = pagesEls.length;
      const qEl = w.querySelector('.vera-clarify-q');
      const countEl = w.querySelector('.vera-clarify-count');
      const confirmBtn = w.querySelector('[data-vera-confirm]');
      let page = 0;
      let focusIdx = -1;

      const currentPage = () => pagesEls[page];
      const currentMode = () => currentPage()?.getAttribute('data-mode') || 'single';
      const currentOpts = () => Array.from(currentPage().querySelectorAll('.vera-opt'));

      const refreshConfirm = () => {
        if (!confirmBtn) return;
        const mode = currentMode();
        if (mode === 'single') { confirmBtn.hidden = true; return; }
        confirmBtn.hidden = false;
        if (mode === 'multi') {
          const any = currentPage().querySelector('.vera-opt--check.checked');
          confirmBtn.disabled = !any;
        } else {
          confirmBtn.disabled = false; // rank: siempre hay un orden valido
        }
      };

      const clearFocus = () => currentOpts().forEach((o) => o.classList.remove('is-focused'));
      const setFocus = (i) => {
        const opts = currentOpts();
        if (!opts.length) return;
        clearFocus();
        focusIdx = (i + opts.length) % opts.length;
        opts[focusIdx].classList.add('is-focused');
        opts[focusIdx].focus({ preventScroll: true });
      };
      const showPage = (i) => {
        if (total < 1) return;
        page = (i + total) % total;
        pagesEls.forEach((p, idx) => { p.hidden = idx !== page; });
        if (qEl) qEl.textContent = currentPage().getAttribute('data-q') || '';
        if (countEl) countEl.textContent = `${page + 1} de ${total}`;
        focusIdx = -1;
        clearFocus();
        refreshConfirm();
      };

      // Cerrar (X) / Omitir descartan la pregunta sin enviar y desmontan el dock.
      const dismiss = () => {
        const dock = w.closest('#veraDock');
        w.classList.add('answered', 'dismissed');
        if (dock) dock.remove();
      };
      const submit = (value) => {
        const v = String(value || '').trim();
        if (!v) return;
        w.classList.add('answered');
        this._undockQuestion();
        this.sendMessage(v);
      };

      // Toggle de checkboxes (modo multi)
      w.addEventListener('click', (e) => {
        const chk = e.target.closest('.vera-opt--check');
        if (!chk || !w.contains(chk)) return;
        chk.classList.toggle('checked');
        chk.setAttribute('aria-pressed', chk.classList.contains('checked') ? 'true' : 'false');
        refreshConfirm();
      });

      // Confirmar (multi / rank): reune la seleccion de la pagina activa y envia.
      confirmBtn?.addEventListener('click', () => {
        const mode = currentMode();
        if (mode === 'multi') {
          const sel = Array.from(currentPage().querySelectorAll('.vera-opt--check.checked'))
            .map((el) => el.getAttribute('data-vera-value') || '').filter(Boolean);
          if (sel.length) submit(sel.join(', '));
        } else if (mode === 'rank') {
          const order = Array.from(currentPage().querySelectorAll('.vera-opt--rank'))
            .map((el) => el.getAttribute('data-vera-value') || '').filter(Boolean);
          if (order.length) submit(order.join(' > '));
        }
      });

      // Drag para reordenar (modo rank)
      this._bindRankDrag(w, refreshConfirm);

      w.querySelector('.vera-clarify-prev')?.addEventListener('click', () => showPage(page - 1));
      w.querySelector('.vera-clarify-next')?.addEventListener('click', () => showPage(page + 1));
      w.querySelector('.vera-clarify-close')?.addEventListener('click', dismiss);
      w.querySelector('[data-vera-skip]')?.addEventListener('click', dismiss);
      w.querySelector('[data-vera-more]')?.addEventListener('click', () => this._focusComposer());

      w.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(focusIdx + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(focusIdx - 1); }
        else if (e.key === 'ArrowRight' && total > 1) { e.preventDefault(); showPage(page + 1); }
        else if (e.key === 'ArrowLeft' && total > 1) { e.preventDefault(); showPage(page - 1); }
        // En modo single, Enter sobre la opcion enfocada dispara su click → envia.
      });

      refreshConfirm();
    });
  }

  /* Drag-and-drop minimo para opciones rank: reordena por posicion y renumera. */
  _bindRankDrag(w, onChange) {
    const renumber = (list) => list.querySelectorAll('.vera-opt-rank-num')
      .forEach((n, i) => { n.textContent = i + 1; });

    w.querySelectorAll('.vera-opt-list').forEach((list) => {
      if (!list.querySelector('.vera-opt--rank')) return;

      list.addEventListener('dragstart', (e) => {
        const li = e.target.closest('.vera-opt--rank');
        if (li) li.classList.add('dragging');
      });
      list.addEventListener('dragend', (e) => {
        const li = e.target.closest('.vera-opt--rank');
        if (li) li.classList.remove('dragging');
        renumber(list);
        if (typeof onChange === 'function') onChange();
      });
      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = list.querySelector('.vera-opt--rank.dragging');
        if (!dragging) return;
        const after = Array.from(list.querySelectorAll('.vera-opt--rank:not(.dragging)'))
          .find((el) => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
        if (after) list.insertBefore(dragging, after);
        else list.appendChild(dragging);
      });
    });
  }

  /* Ancla la pregunta activa (el [CLARIFY] del ultimo turno de Vera) como parte
     del contenedor del input: la mueve a un dock encima del composer. El textarea
     sigue usable debajo. Las preguntas de turnos previos quedan inline como
     registro estatico (.answered). */
  _dockActiveClarify() {
    const list = document.getElementById('veraMessageList');
    const overlay = document.getElementById('chatInputOverlay');
    if (!list || !overlay) return;

    // Si ya hay una pregunta anclada y sigue vigente, no la toques (evita que un
    // re-render intermedio la pierda).
    const existing = document.querySelector('#veraDock .vera-clarify');
    if (existing && !existing.classList.contains('answered') && !existing.classList.contains('dismissed')) {
      return;
    }
    this._undockQuestion();

    // Solo se ancla la pregunta del ULTIMO mensaje (turno mas reciente).
    const lastMsg = list.lastElementChild;
    const active = lastMsg ? lastMsg.querySelector('.vera-clarify:not(.answered):not(.dismissed)') : null;

    // Preguntas historicas → registro estatico inline.
    list.querySelectorAll('.vera-clarify').forEach((w) => { if (w !== active) w.classList.add('answered'); });

    if (!active) return;

    const dock = document.createElement('div');
    dock.id = 'veraDock';
    dock.className = 'vera-dock';
    overlay.insertBefore(dock, overlay.firstChild);
    active.classList.add('is-docked');
    dock.appendChild(active);

    // Si la burbuja fuente quedo sin texto (solo era la pregunta), la ocultamos.
    const srcContent = lastMsg.querySelector?.('.gpt-msg-content');
    if (srcContent && !srcContent.textContent.trim() && !srcContent.querySelector('img,video,iframe,table')) {
      lastMsg.style.display = 'none';
    }
  }

  _undockQuestion() {
    document.getElementById('veraDock')?.remove();
  }

  async renderMessages() {
    const list = document.getElementById('veraMessageList');
    const scroll = document.getElementById('veraMessagesWrap');
    if (!list) return;

    if (!this.aiState.messages.length) {
      this.renderWelcome();
      return;
    }
    this._setWelcomeMode(false);

    // Pre-render asíncrono: para cada mensaje del asistente convertimos markdown
    // a HTML antes de pintar (los del usuario se escapan dentro de _msgHTML).
    const prepared = await Promise.all(this.aiState.messages.map(async (m) => {
      if (m.role === 'assistant' || m.role === 'error' || m.role === 'vera') {
        try {
          const html = await this.renderMarkdown(m.content || '');
          return { ...m, _renderedContent: html };
        } catch (e) {
          console.warn('VeraView.renderMessages: render falló para msg', m.id, e?.message || e);
          return { ...m, _renderedContent: '' };
        }
      }
      return m;
    }));

    this._undockQuestion();
    list.innerHTML = prepared.map(m => this._msgHTML(m)).join('');
    this._bindMediaHover();
    this._bindTaskEvents();
    this._bindQuickReplyButtons();
    this._bindInteractiveOptions();
    this._initClarifyWidgets();
    this._dockActiveClarify();
    this._processChatRichContent(list);
    if (scroll) setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 20);

    // Handler global para action pills emitidos por bloques [ACTIONS].
    if (typeof window !== 'undefined') {
      window._veraSendAction = (text) => this.sendMessage(text);
    }
  }

  /* ── Render adjuntos dentro de un mensaje del usuario ── */
  _renderUserAttachments(attachments) {
    const list = Array.isArray(attachments) ? attachments : [];
    if (!list.length) return '';
    const items = list.map(a => {
      const type = String(a.type || '').toLowerCase();
      const name = escapeHtml(a.name || 'archivo');
      const url = a.url || '#';
      if (type === 'image') {
        return `<a class="gpt-msg-att gpt-msg-att--image" href="${escapeHtml(url)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(url)}" alt="${name}" loading="lazy" />
        </a>`;
      }
      const icon = this._attachmentIconClass(type);
      return `<a class="gpt-msg-att gpt-msg-att--file" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${name}">
        <i class="fas ${icon}"></i>
        <span>${name}</span>
      </a>`;
    }).join('');
    return `<div class="gpt-msg-attachments">${items}</div>`;
  }

  // ── VERA RENDER SYSTEM ─────────────────────────────────────────────────
  // Protocolo de bloques interactivos + marked + DOMPurify.
  // Bloques propios:   [CLARIFY] [PILLS] [STEPS] [METRICS] [ACTIONS]
  // Bloques legacy:    ```chart  ```buttons  ```mermaid

  async _loadMarkdownLibs() {
    if (window.__mdLibsLoaded) return;
    if (VeraView.__mdLibsLoading) return VeraView.__mdLibsLoading;
    VeraView.__mdLibsLoading = (async () => {
      await Promise.all([
        new Promise((res, rej) => {
          if (window.marked) return res();
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/marked@12/marked.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        }),
        new Promise((res, rej) => {
          if (window.DOMPurify) return res();
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        })
      ]);
      if (window.marked?.setOptions) {
        window.marked.setOptions({ breaks: true, gfm: true });
      }
      window.__mdLibsLoaded = true;
    })();
    return VeraView.__mdLibsLoading;
  }

  _parseInteractiveBlocks(text) {
    const blocks = [];
    let processed = String(text || '');

    // [CLARIFY]
    processed = processed.replace(/\[CLARIFY\]([\s\S]*?)\[\/CLARIFY\]/g, (_, content) => {
      const id = `vb_${blocks.length}`;
      const lines = content.trim().split('\n').filter(Boolean);
      let question = '';
      let mode = 'single'; // single | multi | rank
      const cards = [];
      lines.forEach(line => {
        if (line.startsWith('PREGUNTA:')) question = line.replace('PREGUNTA:', '').trim();
        else if (line.startsWith('TIPO:') || line.startsWith('TYPE:')) {
          const v = line.replace(/^(TIPO:|TYPE:)/, '').trim().toLowerCase();
          if (v.startsWith('multi')) mode = 'multi';
          else if (v.startsWith('rank') || v.startsWith('orden') || v.startsWith('prior')) mode = 'rank';
          else mode = 'single';
        }
        else if (line.startsWith('- CARD |')) {
          const parts = line.replace('- CARD |', '').split('|').map(s => s.trim());
          cards.push({ icon: parts[0], title: parts[1], desc: parts[2] || '' });
        }
      });
      blocks.push({ id, type: 'clarify', question, mode, cards });
      return `\n\n{{${id}}}\n\n`;
    });

    // [PILLS]
    processed = processed.replace(/\[PILLS\]([\s\S]*?)\[\/PILLS\]/g, (_, content) => {
      const id = `vb_${blocks.length}`;
      const lines = content.trim().split('\n').filter(Boolean);
      let label = '';
      const options = [];
      lines.forEach(line => {
        if (line.startsWith('LABEL:')) label = line.replace('LABEL:', '').trim();
        else if (line.startsWith('- ')) options.push(line.replace(/^- /, '').trim());
      });
      blocks.push({ id, type: 'pills', label, options });
      return `\n\n{{${id}}}\n\n`;
    });

    // [STEPS]
    processed = processed.replace(/\[STEPS\]([\s\S]*?)\[\/STEPS\]/g, (_, content) => {
      const id = `vb_${blocks.length}`;
      const steps = content.trim().split('\n')
        .filter(l => /^\d+\./.test(l))
        .map(l => l.replace(/^\d+\.\s*/, '').trim());
      blocks.push({ id, type: 'steps', steps });
      return `\n\n{{${id}}}\n\n`;
    });

    // [METRICS]
    processed = processed.replace(/\[METRICS\]([\s\S]*?)\[\/METRICS\]/g, (_, content) => {
      const id = `vb_${blocks.length}`;
      const metrics = content.trim().split('\n')
        .filter(l => l.startsWith('- '))
        .map(l => {
          const parts = l.replace(/^- /, '').split('|').map(s => s.trim());
          return { label: parts[0], value: parts[1], sub: parts[2] || '' };
        });
      blocks.push({ id, type: 'metrics', metrics });
      return `\n\n{{${id}}}\n\n`;
    });

    // [ACTIONS]
    processed = processed.replace(/\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/g, (_, content) => {
      const id = `vb_${blocks.length}`;
      const actions = content.trim().split('\n')
        .filter(l => l.startsWith('- '))
        .map(l => l.replace(/^- /, '').trim());
      blocks.push({ id, type: 'actions', actions });
      return `\n\n{{${id}}}\n\n`;
    });

    // [CONFIRM] — tarea costosa, requiere aprobacion del usuario antes de ejecutar
    processed = processed.replace(/\[CONFIRM\]([\s\S]*?)\[\/CONFIRM\]/g, (_, content) => {
      const id = `vb_${blocks.length}`;
      let usdRange = '';
      let minutesRange = '';
      const reasons = [];
      content.trim().split('\n').forEach((line) => {
        const l = line.trim();
        if (l.startsWith('ESTIMATE_USD:'))      usdRange = l.replace('ESTIMATE_USD:', '').trim();
        else if (l.startsWith('ESTIMATE_MINUTES:')) minutesRange = l.replace('ESTIMATE_MINUTES:', '').trim();
        else if (l.startsWith('REASON:'))       reasons.push(l.replace('REASON:', '').trim());
      });
      blocks.push({ id, type: 'confirm', usdRange, minutesRange, reasons });
      return `\n\n{{${id}}}\n\n`;
    });

    // Agrupa varios [CLARIFY] del mismo mensaje en un solo carrusel (paginas
    // "1 de N"). El primero se vuelve contenedor con .pages; los demas se vacian.
    const clarifyIdx = blocks.reduce((acc, b, i) => (b.type === 'clarify' ? (acc.push(i), acc) : acc), []);
    if (clarifyIdx.length > 1) {
      const first = clarifyIdx[0];
      blocks[first].pages = clarifyIdx.map((i) => ({ question: blocks[i].question, cards: blocks[i].cards, mode: blocks[i].mode || 'single' }));
      clarifyIdx.slice(1).forEach((i) => {
        const id = blocks[i].id;
        blocks[i].type = 'skip';
        processed = processed.replace(new RegExp(`\\{\\{${id}\\}\\}`, 'g'), '');
      });
    }

    return { processed, blocks };
  }

  /* ── Input-area options (CLARIFY / PILLS) ─────────────────
     Cuando VERA emite [CLARIFY] o [PILLS], las opciones aparecen reemplazando
     temporalmente el textarea en el composer. Al seleccionar una, se envia el
     title como mensaje del usuario y vuelve el textarea. */
  _showInputOptions(question, options) {
    const wrap = document.getElementById('veraInputWrap');
    const overlay = document.getElementById('chatInputOverlay');
    if (!overlay) return;

    // Quita opciones anteriores si las hay (multiples CLARIFY en cola)
    document.getElementById('vera-input-options')?.remove();

    // Oculta el textarea
    if (wrap) wrap.style.display = 'none';

    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const escAttr = (s) => String(s ?? '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    const cardsHtml = (options || []).map((opt) => `
      <div class="vera-input-option-card"
           onclick="window._veraSelectOption && window._veraSelectOption('${escAttr(opt.title)}')">
        ${opt.icon ? `<span class="vera-option-icon">${esc(opt.icon)}</span>` : '<span class="vera-option-icon"></span>'}
        <div class="vera-option-body">
          <span class="vera-option-title">${esc(opt.title)}</span>
          ${opt.desc ? `<span class="vera-option-desc">${esc(opt.desc)}</span>` : ''}
        </div>
      </div>`).join('');

    const el = document.createElement('div');
    el.id = 'vera-input-options';
    el.className = 'vera-input-options';
    el.innerHTML = `
      ${question ? `<div class="vera-input-options-label">${esc(question)}</div>` : ''}
      <div class="vera-input-options-cards">${cardsHtml}</div>`;

    overlay.prepend(el);
  }

  _hideInputOptions() {
    document.getElementById('vera-input-options')?.remove();
    const wrap = document.getElementById('veraInputWrap');
    if (wrap) wrap.style.display = '';
  }

  _renderInteractiveBlock(block) {
    const esc = escapeHtml;
    switch (block.type) {
      case 'clarify': {
        // Widget anclado al composer (estilo Claude). Soporta 3 modos por pagina:
        //  - single: click envia de inmediato (data-vera-send).
        //  - multi : checkboxes; "Confirmar" envia la seleccion unida por comas.
        //  - rank  : reordenar arrastrando; "Confirmar" envia el orden con " > ".
        // El composer sigue libre para texto propio.
        const attr = (s) => esc(s).replace(/"/g, '&quot;');
        const pages = (block.pages && block.pages.length)
          ? block.pages
          : [{ question: block.question, cards: block.cards, mode: block.mode || 'single' }];
        const multiPage = pages.length > 1;

        const renderOpt = (c, i, mode) => {
          const val = attr(c.title);
          const body = `${c.icon ? `<span class="vera-opt-icon">${esc(c.icon)}</span>` : ''}
            <span class="vera-opt-body">
              <span class="vera-opt-title">${esc(c.title)}</span>
              ${c.desc ? `<span class="vera-opt-desc">${esc(c.desc)}</span>` : ''}
            </span>`;
          if (mode === 'multi') {
            return `<button type="button" class="vera-opt vera-opt--check" data-vera-value="${val}" aria-pressed="false">
              <span class="vera-opt-check"><i class="fas fa-check"></i></span>${body}
            </button>`;
          }
          if (mode === 'rank') {
            return `<div class="vera-opt vera-opt--rank" draggable="true" data-vera-value="${val}">
              <span class="vera-opt-num vera-opt-rank-num">${i + 1}</span>${body}
              <span class="vera-opt-grip" aria-hidden="true"><i class="fas fa-bars"></i></span>
            </div>`;
          }
          return `<button type="button" class="vera-opt" role="option" data-vera-send="${val}" data-idx="${i}">
            <span class="vera-opt-num">${i + 1}</span>${body}
            <span class="vera-opt-arrow"><i class="fas fa-arrow-right"></i></span>
          </button>`;
        };

        const pagesHtml = pages.map((pg, pi) => {
          const mode = pg.mode || 'single';
          const opts = (pg.cards || []).map((c, i) => renderOpt(c, i, mode)).join('');
          return `<div class="vera-clarify-page" data-page="${pi}" data-mode="${mode}" data-q="${attr(pg.question || '')}"${pi === 0 ? '' : ' hidden'}>
            <div class="vera-opt-list">${opts}</div>
          </div>`;
        }).join('');

        const firstQ = pages[0]?.question || '';
        return `<div class="vera-interactive vera-clarify" data-pages="${pages.length}" data-page="0">
          <div class="vera-clarify-head">
            <p class="vera-clarify-q">${esc(firstQ)}</p>
            <div class="vera-clarify-tools">
              ${multiPage ? `<div class="vera-clarify-pager">
                <button type="button" class="vera-clarify-prev" aria-label="Anterior"><i class="fas fa-chevron-left"></i></button>
                <span class="vera-clarify-count">1 de ${pages.length}</span>
                <button type="button" class="vera-clarify-next" aria-label="Siguiente"><i class="fas fa-chevron-right"></i></button>
              </div>` : ''}
              <button type="button" class="vera-clarify-close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
            </div>
          </div>
          <div class="vera-clarify-pages">${pagesHtml}</div>
          <div class="vera-clarify-more">
            <button type="button" class="vera-clarify-morebtn" data-vera-more>
              <span class="vera-opt-num vera-opt-num--pencil"><i class="fas fa-pen"></i></span>
              <span class="vera-clarify-more-text">Algo más</span>
            </button>
            <div class="vera-clarify-actions">
              <button type="button" class="vera-clarify-skip" data-vera-skip>Omitir</button>
              <button type="button" class="vera-clarify-confirm" data-vera-confirm hidden disabled>Confirmar</button>
            </div>
          </div>
        </div>`;
      }
      case 'skip': return '';
      case 'pills': {
        const attr = (s) => esc(s).replace(/"/g, '&quot;');
        const pillsHtml = block.options.map(o => `
          <button type="button" class="vera-chip" data-vera-send="${attr(o)}">${esc(o)}</button>`).join('');
        return `<div class="vera-interactive">
          ${block.label ? `<p class="vera-interactive-q">${esc(block.label)}</p>` : ''}
          <div class="vera-chip-row">${pillsHtml}</div>
        </div>`;
      }
      case 'steps': {
        const stepsHtml = block.steps.map((s, i) => `
          <div class="vera-step-item">
            <span class="vera-step-num">${i + 1}</span>
            <span class="vera-step-text">${esc(s)}</span>
          </div>`).join('');
        return `<div class="vera-steps-block">${stepsHtml}</div>`;
      }
      case 'metrics': {
        const metricsHtml = block.metrics.map(m => `
          <div class="vera-metric-card">
            <span class="vera-metric-label">${esc(m.label)}</span>
            <span class="vera-metric-value">${esc(m.value)}</span>
            ${m.sub ? `<span class="vera-metric-sub">${esc(m.sub)}</span>` : ''}
          </div>`).join('');
        return `<div class="vera-metrics-grid">${metricsHtml}</div>`;
      }
      case 'actions': {
        const actionsHtml = block.actions.map(a => `
          <button class="vera-action-pill" onclick="window._veraSendAction && window._veraSendAction(${JSON.stringify(a)})">${esc(a)} ↗</button>`).join('');
        return `<div class="vera-actions-row">${actionsHtml}</div>`;
      }
      case 'confirm': {
        const msgId = block._msgId || '';
        const reasonsHtml = (block.reasons || []).map(r => `<li>${esc(r)}</li>`).join('');
        const usd = esc(block.usdRange || '?');
        const mins = esc(block.minutesRange || '?');
        const handler = (action) => `window._veraConfirmAction && window._veraConfirmAction(${JSON.stringify(msgId)}, ${JSON.stringify(action)}, this)`;
        return `<div class="vera-confirm-block" data-msg-id="${esc(msgId)}">
          <div class="vera-confirm-header">
            <span class="vera-confirm-icon">⚠</span>
            <span class="vera-confirm-title">Tarea de alto costo detectada</span>
          </div>
          <div class="vera-confirm-estimate">
            <strong>$${usd} USD</strong>
            <span class="vera-confirm-sep">·</span>
            <span class="vera-confirm-minutes">${mins} min</span>
          </div>
          ${reasonsHtml ? `<ul class="vera-confirm-reasons">${reasonsHtml}</ul>` : ''}
          <div class="vera-confirm-actions">
            <button class="vera-confirm-btn vera-confirm-btn-primary" onclick="${handler('authorize')}">Autorizar</button>
            <button class="vera-confirm-btn" onclick="${handler('simplify')}">Simplificar</button>
            <button class="vera-confirm-btn vera-confirm-btn-cancel" onclick="${handler('cancel')}">Cancelar</button>
          </div>
        </div>`;
      }
      default: return '';
    }
  }

  async renderMarkdown(rawText, msgId = '') {
    await this._loadMarkdownLibs();

    // 1. Extrae bloques interactivos propios antes de pasar a marked
    const { processed, blocks } = this._parseInteractiveBlocks(rawText);
    // Inyecta msgId a los bloques que lo necesiten (e.g. CONFIRM lo usa para
    // localizar la metadata original del ai_message al accionar).
    blocks.forEach((b) => { if (msgId) b._msgId = msgId; });

    // 2. Extrae bloques ```html y ```artifact ANTES de todo. Estos NO pasan por
    //    DOMPurify — se inyectan crudos en un iframe sandbox null-origin
    //    (sandbox="allow-scripts allow-forms allow-modals" SIN allow-same-origin
    //    → el iframe no puede tocar localStorage/cookies del parent).
    // Placeholders en formato {{...}} (NO __x__): el doble guion bajo lo
    // interpreta marked como **bold** y rompe la restauracion (dejaba "legacy_N"
    // en negrita en vez del chart). Las llaves no son sintaxis markdown.
    const htmlBlocks = [];
    let safeText = processed.replace(/```(html|artifact)\n?([\s\S]*?)```/g, (_, type, code) => {
      const id = `{{hb_${htmlBlocks.length}}}`;
      htmlBlocks.push({ id, type: type.toLowerCase(), code: code.trim() });
      return `\n\n${id}\n\n`;
    });

    // 3. Protege bloques legacy (chart/buttons/mermaid) para que marked no los toque
    const legacyPlaceholders = [];
    safeText = safeText.replace(/```(chart|vera-chart|viz|buttons|quickreplies|quick-replies|actions|mermaid)([\s\S]*?)```/g, (match, lang, content) => {
      const pid = `{{legacy_${legacyPlaceholders.length}}}`;
      legacyPlaceholders.push({ pid, lang: lang.toLowerCase(), content: content.replace(/^\n/, '') });
      return `\n\n${pid}\n\n`;
    });

    // 4. marked convierte markdown estándar
    let html = window.marked.parse(safeText);

    // 5. DOMPurify sanitiza el markdown (NO los bloques html/artifact, que
    //    fueron sacados antes y se reinyectan crudos como srcdoc del iframe).
    html = window.DOMPurify.sanitize(html, {
      ADD_TAGS: ['pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
      ADD_ATTR: ['class', 'onclick', 'target', 'rel']
    });

    // 5b. marked emite <table> SIN clase; el estilo de la app vive en
    //     .gpt-md-table (+ wrap para scroll horizontal). Lo añadimos aquí. Las
    //     tablas de charts se inyectan después (paso 6) con su propio markup,
    //     así que este reemplazo solo toca tablas de markdown.
    html = html
      .replace(/<table>/g, '<div class="gpt-md-table-wrap"><table class="gpt-md-table">')
      .replace(/<\/table>/g, '</table></div>');

    // 6. Restaura bloques legacy con sus renders originales
    legacyPlaceholders.forEach(({ pid, lang, content }) => {
      let legacyHtml = '';
      if (['chart', 'vera-chart', 'viz'].includes(lang)) {
        legacyHtml = renderChartBlock(content);
      } else if (['buttons', 'quickreplies', 'quick-replies', 'actions'].includes(lang)) {
        legacyHtml = renderButtonsBlock(content);
      } else if (lang === 'mermaid') {
        // _processChatRichContent() busca .gpt-md-mermaid[data-mermaid] y lo
        // renderiza a SVG con mermaid.js (lee el atributo, no el innerHTML).
        // El <pre> interno es fallback: si mermaid falla, queda el codigo a la
        // vista; si renderiza, mermaid sobreescribe el innerHTML con el SVG.
        const trimmed = String(content || '').trim();
        const safe = trimmed
          .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
          .replace(/</g, '&lt;').replace(/>/g, '&gt;');
        legacyHtml = `<div class="gpt-md-mermaid" data-mermaid="${safe}"><pre class="gpt-md-mermaid-fallback"><code>${escapeHtml(trimmed)}</code></pre></div>`;
      } else {
        legacyHtml = `<pre><code>${escapeHtml(content)}</code></pre>`;
      }
      // marked puede dejar el placeholder solo o envuelto en <p>. Cubrimos ambos.
      html = html.replace(`<p>${pid}</p>`, legacyHtml).split(pid).join(legacyHtml);
    });

    // 7. Restaura bloques html/artifact como iframes sandboxed null-origin.
    //    El bridge `vera_resize` postMessage lo escucha _initWidgetBridge().
    //    Tambien inyectamos `window.__veraAction(actionType, payload, reasoning)`
    //    para que widgets puedan invocar acciones lectura/escritura en la
    //    plataforma a traves del receiver de VeraView -> /api/widget-action.
    htmlBlocks.forEach(({ id, type, code }) => {
      const resizeScript = [
        '<script>',
        '(function(){',
        'function r(){window.parent.postMessage({type:"vera_resize",height:document.documentElement.scrollHeight},"*");}',
        'window.addEventListener("load",r);',
        'try{new ResizeObserver(r).observe(document.body);}catch(e){}',
        // ── Widget action bridge ───────────────────────────────────────
        'window.__veraActionCallbacks = {};',
        'window.__veraAction = function(actionType, payload, reasoning){',
          'return new Promise(function(resolve){',
            'var rid = Math.random().toString(36).slice(2) + Date.now().toString(36);',
            'window.__veraActionCallbacks[rid] = resolve;',
            'setTimeout(function(){if(window.__veraActionCallbacks[rid]){window.__veraActionCallbacks[rid]({ok:false,error:"timeout"});delete window.__veraActionCallbacks[rid];}}, 20000);',
            'window.parent.postMessage({type:"vera_action",requestId:rid,actionType:actionType,payload:payload||{},reasoning:reasoning||""}, "*");',
          '});',
        '};',
        'window.addEventListener("message", function(e){',
          'if(!e.data || e.data.type !== "vera_action_result") return;',
          'var cb = window.__veraActionCallbacks[e.data.requestId];',
          'if(cb){ cb({ok:e.data.ok,data:e.data.data,error:e.data.error}); delete window.__veraActionCallbacks[e.data.requestId]; }',
        '});',
        '})();',
        '<\/script>'
      ].join('');

      const fullHtml = [
        '<!DOCTYPE html><html><head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<style>',
        '*{box-sizing:border-box;margin:0;padding:0}',
        'body{font-family:system-ui,sans-serif;background:#0d0d0f;color:#f0eff5;padding:16px}',
        '</style>',
        '</head><body>',
        code,
        resizeScript,
        '</body></html>'
      ].join('');

      // Para srcdoc: escapar & primero, luego " (orden importa).
      const srcdoc = fullHtml
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');

      let iframeHtml;
      if (type === 'artifact') {
        iframeHtml =
          '<div class="vera-artifact-block">' +
            '<div class="vera-artifact-bar">' +
              '<span>⬡ Artifact · VERA</span>' +
              '<button onclick="this.closest(\'.vera-artifact-block\').querySelector(\'iframe\').requestFullscreen()">⤢ expandir</button>' +
            '</div>' +
            '<iframe class="vera-artifact-frame" ' +
              'sandbox="allow-scripts allow-forms allow-modals" ' +
              'srcdoc="' + srcdoc + '"></iframe>' +
          '</div>';
      } else {
        iframeHtml =
          '<div class="vera-html-block">' +
            '<iframe class="vera-sandbox-frame" ' +
              'sandbox="allow-scripts allow-forms allow-modals" ' +
              'srcdoc="' + srcdoc + '"></iframe>' +
          '</div>';
      }

      // Marked puede envolver el placeholder solo o en <p>. Cubrimos ambos.
      html = html.replace(`<p>${id}</p>`, iframeHtml).replace(id, iframeHtml);
    });

    // 8. Inyecta bloques interactivos en sus placeholders (marked los envuelve en <p>)
    blocks.forEach(block => {
      const re = new RegExp(`(<p>)?\\{\\{${block.id}\\}\\}(<\\/p>)?`, 'g');
      html = html.replace(re, this._renderInteractiveBlock(block));
    });

    return html;
  }
  // ── FIN VERA RENDER SYSTEM ─────────────────────────────────────────────

  _msgHTML(m) {
    const id = escapeHtml(m.id || '');
    const isUser = m.role === 'user';
    const isError = m.role === 'error';

    if (isUser) {
      // Separa el bloque de datos de biblioteca del texto visible. En vivo,
      // m.libraryRefs trae las refs; al recargar se parsean del content.
      const parsed = this._parseLibraryContext(m.content);
      const refs = (m.libraryRefs && m.libraryRefs.length) ? m.libraryRefs : parsed.refs;
      const attHTML = this._renderUserAttachments(m.attachments) + this._renderLibraryRefs(refs);
      const bubble = parsed.text
        ? `<div class="gpt-msg-bubble">${escapeHtml(parsed.text).replace(/\n/g, '<br>')}</div>`
        : '';
      return `
        <div class="gpt-msg gpt-msg--user" data-message-id="${id}">
          ${attHTML}
          ${bubble}
        </div>`;
    }

    // El contenido del asistente llega ya renderizado vía _renderedContent.
    // Fallback: si por alguna razón no se pre-renderizó, mostramos el texto escapado
    // para no romper el layout (el contenido real aparecerá tras el async).
    const content = (typeof m._renderedContent === 'string' && m._renderedContent)
      ? m._renderedContent
      : `<p>${escapeHtml(m.content || '').replace(/\n/g, '<br>')}</p>`;

    return `
      <div class="gpt-msg gpt-msg--assistant${isError ? ' gpt-msg--error' : ''}" data-message-id="${id}">
        <div class="gpt-msg-avatar">
          <img class="gpt-msg-avatar-img" src="${VERA_AVATAR_SRC}" alt="Vera" loading="lazy" decoding="async" />
        </div>
        <div class="gpt-msg-content">${content}</div>
      </div>`;
  }

  async appendMessage(msg) {
    const list = document.getElementById('veraMessageList');
    const scroll = document.getElementById('veraMessagesWrap');
    if (!list) return;
    const welcome = list.querySelector('.gpt-welcome');
    if (welcome) welcome.remove();
    this._setWelcomeMode(false);

    // Pre-render del markdown para mensajes de VERA (asistente/error).
    // Los mensajes del usuario se escapan dentro de _msgHTML (no markdown).
    let prepared = msg;
    if (msg.role === 'assistant' || msg.role === 'error' || msg.role === 'vera') {
      try {
        const html = await this.renderMarkdown(msg.content || '', msg.id || '');
        prepared = { ...msg, _renderedContent: html };
      } catch (e) {
        console.warn('VeraView.renderMarkdown falló, usando fallback escapado:', e?.message || e);
        prepared = { ...msg, _renderedContent: '' };
      }
    }

    list.insertAdjacentHTML('beforeend', this._msgHTML(prepared));
    // Respuesta real de Vera: el backend pudo crear/renombrar la sesión →
    // refresca el rail para reflejar título y orden por updated_at.
    if (msg.role === 'assistant') this._refreshHistorySoon();
    this._bindMediaHover();
    this._bindTaskEvents();
    this._bindQuickReplyButtons();
    this._bindInteractiveOptions();
    this._initClarifyWidgets();
    this._dockActiveClarify();
    this._processChatRichContent(list);
    if (scroll) setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 20);

    // Handler global para action pills (sobrescribe en cada append, OK).
    if (typeof window !== 'undefined') {
      window._veraSendAction = (text) => this.sendMessage(text);
      // Handler de [CONFIRM] — busca metadata.original_message en el ai_message
      // por id y re-envia segun la accion (authorize / simplify / cancel).
      window._veraConfirmAction = (msgId, action, btnEl) => {
        const msg = (this.aiState.messages || []).find((m) => m.id === msgId);
        const meta = msg?.metadata || {};
        const original = meta.original_message || '';
        const attachments = meta.original_attachments || [];
        // Marca el bloque como ya accionado para evitar doble-click + UX clara.
        const block = btnEl?.closest?.('.vera-confirm-block');
        if (block) {
          block.classList.add('vera-confirm-block--dismissed');
          block.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          const tag = document.createElement('div');
          tag.className = 'vera-confirm-status';
          const labels = { authorize: '✓ Autorizado', simplify: '✓ Autorizado (version simplificada)', cancel: '✕ Cancelado' };
          tag.textContent = labels[action] || `accion: ${action}`;
          block.appendChild(tag);
        }
        if (action === 'cancel') return;
        if (!original) {
          console.warn('vera-confirm: original_message vacio en metadata, no se puede re-enviar');
          return;
        }
        this.sendMessage(original, {
          confirmedHighCost: true,
          simplifyRequest: action === 'simplify',
          attachments,
        });
      };
    }
  }

  /* ── Post-render: Mermaid (diagramas) + Prism (syntax highlighting) ──
     Se llama después de inyectar HTML al DOM. Procesa solo elementos NO
     marcados aún con data-vera-processed para idempotencia (evita re-render
     en cada appendMessage). Falla suavemente: si Mermaid/Prism no cargan,
     queda el code block plano. */
  _processChatRichContent(scope) {
    if (!scope) return;

    // Mermaid: convertir <div class="gpt-md-mermaid" data-mermaid="..."> → SVG
    const mermaidNodes = scope.querySelectorAll('.gpt-md-mermaid:not([data-vera-processed])');
    if (mermaidNodes.length) {
      _cleanupMermaidOrphans();
      ensureMermaid().then((mermaid) => {
        if (!mermaid?.render) return;
        mermaidNodes.forEach(async (node, i) => {
          if (node.dataset.veraProcessed) return;
          node.dataset.veraProcessed = '1';
          const rawSrc = node.dataset.mermaid || '';
          if (!rawSrc) return;
          // Pre-procesar: detecta emojis/keywords y aplica colores semánticos.
          // Si el preproceso falla, caemos al source crudo (no romper render).
          let src;
          try {
            src = applyMermaidSemanticClasses(rawSrc) || rawSrc;
          } catch (e) {
            console.warn('Mermaid semantic preprocess failed:', e?.message || e);
            src = rawSrc;
          }
          // Validar sintaxis antes de render: evita que mermaid v10 deje un
          // div temporal huérfano en <body> con el texto "Syntax error in text".
          try {
            const ok = typeof mermaid.parse === 'function'
              ? await mermaid.parse(src, { suppressErrors: true })
              : true;
            if (ok === false) {
              console.warn('Mermaid parse failed; keeping <pre> fallback');
              return;
            }
          } catch (e) {
            console.warn('Mermaid parse error:', e?.message || e);
            _cleanupMermaidOrphans();
            return;
          }
          try {
            const id = `vera-mmd-${Date.now()}-${i}`;
            const { svg } = await mermaid.render(id, src);
            node.innerHTML = svg;
          } catch (e) {
            console.warn('Mermaid render error:', e?.message || e);
            _cleanupMermaidOrphans();
          }
        });
      }).catch((e) => console.warn('Mermaid load error:', e?.message || e));
    }

    // Prism: highlight de <pre><code class="language-XXX"> que aún no esté procesado
    const codeNodes = scope.querySelectorAll('pre > code[class*="language-"]:not([data-vera-processed])');
    if (codeNodes.length) {
      ensurePrism().then((Prism) => {
        if (!Prism?.highlightElement) return;
        codeNodes.forEach((node) => {
          if (node.dataset.veraProcessed) return;
          node.dataset.veraProcessed = '1';
          try { Prism.highlightElement(node); } catch (_) {}
        });
      }).catch((e) => console.warn('Prism load error:', e?.message || e));
    }

    // ECharts: inicializa cualquier <div data-echarts-spec="..."> que aún no esté
    // procesado. Decode base64 → spec → buildEChartsOption → init.
    const echartsNodes = scope.querySelectorAll('div[data-echarts-spec]:not([data-vera-processed])');
    if (echartsNodes.length) {
      ensureECharts().then((echarts) => {
        if (!echarts?.init) {
          console.warn('ECharts no se cargó; charts se mostrarán vacíos');
          return;
        }
        echartsNodes.forEach((node) => {
          if (node.dataset.veraProcessed) return;
          node.dataset.veraProcessed = '1';
          try {
            const encoded = node.dataset.echartsSpec || '';
            const specStr = decodeURIComponent(escape(atob(encoded)));
            const spec = JSON.parse(specStr);
            const built = buildEChartsOption(spec);
            if (!built) {
              // Tipo entró a la cola de ECharts pero buildEChartsOption decidió no soportarlo
              // → mostrar fallback de tabla en el mismo contenedor.
              node.innerHTML = renderChartAsDataTable(spec);
              node.style.height = 'auto';
              return;
            }
            const chart = echarts.init(node, null, { renderer: 'svg' });
            chart.setOption(built.option);
            // Auto-resize cuando el viewport cambia (el chat es responsive)
            const onResize = () => chart.resize();
            window.addEventListener('resize', onResize);
            // Limpieza si el nodo se remueve
            node._veraChartDispose = () => {
              window.removeEventListener('resize', onResize);
              try { chart.dispose(); } catch (_) {}
            };
          } catch (e) {
            console.warn('ECharts init error:', e?.message || e);
            node.innerHTML = `<div class="gpt-viz--error" style="padding:14px;">Error renderizando chart: ${escapeHtml(e?.message || 'unknown')}</div>`;
          }
        });
      }).catch((e) => console.warn('ECharts load error:', e?.message || e));
    }
  }

  /* ── Typing / Activity indicator ────────────────────── */
  showTypingIndicator(statusText) {
    const list = document.getElementById('veraMessageList');
    const scroll = document.getElementById('veraMessagesWrap');
    if (!list) return;
    const welcome = list.querySelector('.gpt-welcome');
    if (welcome) welcome.remove();
    document.getElementById('gptTyping')?.remove();
    list.insertAdjacentHTML('beforeend', `
      <div id="gptTyping" class="gpt-msg gpt-msg--assistant gpt-msg--typing">
        <div class="gpt-msg-avatar">
          <img class="gpt-msg-avatar-img" src="${VERA_AVATAR_SRC}" alt="Vera" loading="lazy" decoding="async" />
        </div>
        <div class="gpt-msg-content">
          <div class="gpt-typing-dots"><span></span><span></span><span></span></div>
          <div class="gpt-typing-status" id="veraStatusText">${statusText ? escapeHtml(statusText) : ''}</div>
        </div>
      </div>
    `);
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  updateTypingStatus(text) {
    const el = document.getElementById('veraStatusText');
    if (el) el.textContent = text || '';
    // Auto-scroll suave
    const scroll = document.getElementById('veraMessagesWrap');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  hideTypingIndicator() {
    document.getElementById('gptTyping')?.remove();
  }

  /**
   * Reproduce un chime de dos tonos usando Web Audio API.
   * No requiere archivos de audio — sintetizado en el navegador.
   * Solo suena si el tiempo de espera fue suficientemente largo (tareas en background).
   */
  _playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      const playTone = (freq, startAt, duration, gainValue) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type      = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);

        gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
        gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);

        osc.start(ctx.currentTime + startAt);
        osc.stop(ctx.currentTime + startAt + duration);
      };

      // Chime de dos tonos — ascendente: Do5 → Mi5
      playTone(523.25, 0,    0.35, 0.25);  // Do5
      playTone(659.25, 0.18, 0.45, 0.20);  // Mi5

      // Cerrar el contexto después de que termine
      setTimeout(() => ctx.close().catch(() => {}), 900);
    } catch (_) {
      // Web Audio no disponible — ignorar silenciosamente
    }
  }

  /**
   * Solicita permiso de notificaciones del navegador (llamar una vez al iniciar).
   */
  async _requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
  }

  /**
   * Muestra una notificación del sistema si la pestaña no tiene foco.
   */
  _showBrowserNotification(text) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.hasFocus()) return; // Solo si el usuario está en otra pestaña

    try {
      const notif = new Notification('Vera terminó de trabajar', {
        body: text ? text.slice(0, 100) : 'Tu solicitud está lista.',
        icon: '/img/vera-avatar.png',
        badge: '/img/vera-avatar.png',
        tag: 'vera-response', // Reemplaza notificaciones anteriores
      });
      notif.onclick = () => { window.focus(); notif.close(); };
      setTimeout(() => notif.close(), 8000);
    } catch (_) {}
  }

  /* ── Input binding ───────────────────────────────────── */
  bindInput() {
    const input = document.getElementById('veraInput');
    const sendBtn = document.getElementById('veraSend');
    if (!input) return;

    const autoResize = () => {
      input.style.height = 'auto';
      const next = Math.min(180, input.scrollHeight || 0);
      if (next > 0) input.style.height = `${next}px`;
    };

    const syncSendBtn = () => {
      if (!sendBtn) return;
      const hasText = !!(input.value || '').trim();
      const hasReadyAttachment = this.aiState.pendingAttachments.some(a => a.status === 'ready');
      sendBtn.disabled = (!hasText && !hasReadyAttachment) || this.aiState.isLoading;
    };
    this._syncSendBtn = syncSendBtn;

    this.addEventListener(input, 'input', () => { autoResize(); syncSendBtn(); });
    autoResize();
    syncSendBtn();

    const send = () => {
      const text = (input.value || '').trim();
      const hasReadyAttachment = this.aiState.pendingAttachments.some(a => a.status === 'ready');
      if ((!text && !hasReadyAttachment) || this.aiState.isLoading) return;
      this.sendMessage(text);
      input.value = '';
      input.style.height = 'auto';
      syncSendBtn();
    };

    this.addEventListener(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    if (sendBtn) this.addEventListener(sendBtn, 'click', send);

    // Menú "+" del composer: archivos/fotos o biblioteca.
    const plusBtn = document.getElementById('veraPlus');
    const plusMenu = document.getElementById('veraPlusMenu');
    const fileInput = document.getElementById('veraFileInput');
    const closeMenu = () => {
      if (!plusMenu) return;
      plusMenu.hidden = true;
      plusBtn?.setAttribute('aria-expanded', 'false');
    };
    this._closeComposerMenu = closeMenu;

    if (plusBtn && plusMenu) {
      this.addEventListener(plusBtn, 'click', (e) => {
        e.stopPropagation();
        if (this.aiState.isLoading) return;
        const open = plusMenu.hidden;
        plusMenu.hidden = !open;
        plusBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      // Cierra al hacer click fuera o con Escape.
      this.addEventListener(document, 'click', (e) => {
        if (plusMenu.hidden) return;
        if (!e.target.closest?.('.vera-plus-wrap')) closeMenu();
      });
      this.addEventListener(document, 'keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
      });
    }

    const filesItem = document.getElementById('veraMenuFiles');
    if (filesItem && fileInput) {
      this.addEventListener(filesItem, 'click', () => { closeMenu(); fileInput.click(); });
    }
    // Items de tipo de biblioteca (Producto, Campaña, etc.) → picker de ese tipo.
    if (plusMenu) {
      this.addEventListener(plusMenu, 'click', (e) => {
        const it = e.target.closest('[data-lib-type]');
        if (!it) return;
        closeMenu();
        this._openLibraryPicker(it.getAttribute('data-lib-type'));
      });
    }
    if (fileInput) {
      this.addEventListener(fileInput, 'change', (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        this._handleFileSelection(files);
      });
    }
  }

  /* ── Adjuntos: tipo MIME → backend type ──────────────── */
  _inferAttachmentType(file) {
    const mime = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (name.endsWith('.docx') ||
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mime === 'application/msword' || name.endsWith('.doc')) return 'word';
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') ||
        mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mime === 'application/vnd.ms-excel' || mime === 'text/csv') return 'spreadsheet';
    if (mime.startsWith('text/') || name.endsWith('.md') || name.endsWith('.txt')) return 'text';
    return 'other';
  }

  /* ── Adjuntos: ícono visual por tipo ─────────────────── */
  _attachmentIconClass(type) {
    return ({
      image: 'fa-image',
      pdf: 'fa-file-pdf',
      audio: 'fa-file-audio',
      video: 'fa-file-video',
      word: 'fa-file-word',
      spreadsheet: 'fa-file-excel',
      text: 'fa-file-lines',
      library: 'fa-layer-group'
    })[type] || 'fa-file';
  }

  /* ── Adjuntos: subir a Supabase Storage ─────────────── */
  async _uploadAttachment(att, file) {
    if (!this.supabase?.storage) throw new Error('Supabase storage no disponible');
    const orgId = this.aiState.organization_id;
    const userId = this.userId || 'anon';
    const safeName = (file.name || 'archivo')
      .replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    // Path con orgId al inicio para alinear con las policies de Storage
    // (storage.foldername(name)[1] = orgId → match con organization_members).
    const path = `${orgId}/chat/${userId}/${Date.now()}-${att.id}-${safeName}`;
    const { error } = await this.supabase.storage
      .from('org-assets')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) throw error;
    const { data } = this.supabase.storage.from('org-assets').getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('No se obtuvo URL pública');
    att.url = data.publicUrl;
    att.path = path;
  }

  /* ── Adjuntos: manejar selección + subir en paralelo ──── */
  _handleFileSelection(files) {
    if (!files?.length) return;
    const MAX_BYTES = 25 * 1024 * 1024; // 25MB por archivo
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        console.warn(`[VeraView] archivo excede 25MB, ignorado: ${file.name}`);
        continue;
      }
      const att = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mime: file.type,
        size: file.size,
        type: this._inferAttachmentType(file),
        url: null,
        status: 'uploading'
      };
      this.aiState.pendingAttachments.push(att);
      this._renderAttachChips();
      this._uploadAttachment(att, file)
        .then(() => { att.status = 'ready'; })
        .catch((err) => {
          console.error('[VeraView] upload falló:', err?.message || err);
          att.status = 'error';
          att.error = err?.message || 'Error al subir';
        })
        .finally(() => {
          this._renderAttachChips();
          this._syncSendBtn?.();
        });
    }
  }

  /* ── Adjuntos: render de chips en composer ───────────── */
  _renderAttachChips() {
    const wrap = document.getElementById('veraAttachChips');
    if (!wrap) return;
    const list = this.aiState.pendingAttachments;
    if (!list.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = list.map(a => {
      const icon = a.type === 'library' ? this._libKindIcon(a.kind) : this._attachmentIconClass(a.type);
      const stateClass = a.status === 'error' ? ' gpt-attach-chip--error'
                        : a.status === 'uploading' ? ' gpt-attach-chip--uploading' : '';
      const spinner = a.status === 'uploading' ? '<i class="fas fa-spinner fa-spin"></i>' : '';
      const errorTitle = a.status === 'error' ? ` title="${escapeHtml(a.error || 'Error')}"` : '';
      return `
        <span class="gpt-attach-chip${stateClass}" data-att-id="${escapeHtml(a.id)}"${errorTitle}>
          <i class="fas ${icon}"></i>
          <span class="gpt-attach-chip-name">${escapeHtml(a.name)}</span>
          ${spinner}
          <button type="button" class="gpt-attach-chip-remove" data-remove-id="${escapeHtml(a.id)}" aria-label="Quitar">
            <i class="fas fa-times"></i>
          </button>
        </span>`;
    }).join('');

    if (!wrap.__bound) {
      wrap.__bound = true;
      wrap.addEventListener('click', (e) => {
        const btn = e.target.closest?.('[data-remove-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-remove-id');
        const idx = this.aiState.pendingAttachments.findIndex(a => a.id === id);
        if (idx >= 0) {
          const att = this.aiState.pendingAttachments[idx];
          // Best-effort cleanup del archivo subido
          if (att.path && this.supabase?.storage) {
            this.supabase.storage.from('org-assets').remove([att.path]).catch(() => {});
          }
          this.aiState.pendingAttachments.splice(idx, 1);
          this._renderAttachChips();
          this._syncSendBtn?.();
        }
      });
    }
  }

  /* ── Send message ──────────────────────────────────────
     opts.confirmedHighCost — pasa true cuando el usuario aceptó la
     advertencia de costo y queremos que el backend salte el pre-check. */
  async sendMessage(text, opts = {}) {
    if (!this.aiState.organization_id || this.aiState.isLoading) return;

    // Al enviar (opcion o texto libre) se retira la pregunta anclada al composer.
    if (!opts.confirmedHighCost) this._undockQuestion();

    // Tomamos snapshot de adjuntos listos y limpiamos pendientes antes de enviar.
    const ready = this.aiState.pendingAttachments.filter(a => a.status === 'ready');
    const libItems = ready.filter(a => a.type === 'library');
    const fileReady = ready.filter(a => a.type !== 'library');
    if (!text && !fileReady.length && !libItems.length) return;
    const attachments = fileReady.map(a => ({
      url: a.url, type: a.type, name: a.name, mime: a.mime
    }));
    // Referencias de biblioteca para mostrar como chips en el mensaje del usuario.
    const libraryRefs = libItems.map(a => ({ kind: a.kind, id: a.refId, name: a.name }));
    // Mensaje que recibe Vera: texto + bloque de contexto de biblioteca.
    const messageToSend = `${text || ''}${this._buildLibraryContext(libItems)}`;
    if (!opts.confirmedHighCost) {
      // Solo limpiamos los adjuntos en el primer intento — si llega
      // confirmación y reenviamos, ya no hay attachments para mostrar como chips.
      this.aiState.pendingAttachments = [];
      this._renderAttachChips();
    }

    this.aiState.isLoading = true;

    const sendBtn = document.getElementById('veraSend');
    const input = document.getElementById('veraInput');
    if (sendBtn) sendBtn.disabled = true;

    // Mostrar mensaje del usuario inmediatamente solo en el primer intento.
    let userMsg = null;
    if (!opts.confirmedHighCost) {
      userMsg = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: text, // display limpio; el contexto de biblioteca va aparte
        attachments,
        libraryRefs,
        created_at: new Date().toISOString()
      };
      this.aiState.messages.push(userMsg);
      this.appendMessage(userMsg);
    }
    this.showTypingIndicator();

    try {
      const token = this.supabase
        ? (await this.supabase.auth.getSession())?.data?.session?.access_token
        : null;

      const res = await fetch(getAiChatUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-AI-ENGINE-BASE-URL': (window.AI_ENGINE_BASE_URL || (() => {
            try { return localStorage.getItem('AI_ENGINE_BASE_URL') || ''; } catch (_) { return ''; }
          })())
        },
        body: JSON.stringify({
          organization_id: this.aiState.organization_id,
          conversation_id: this.aiState.active_conversation_id || undefined,
          message: messageToSend,
          attachments,
          confirmed_high_cost: opts.confirmedHighCost === true,
          simplify_request: opts.simplifyRequest === true,
        })
      });

      if (!res.ok) {
        // Demo rate-limit response → open signup modal instead of generic error.
        if (res.status === 429) {
          try {
            const errJson = await res.clone().json();
            if ((errJson.error === 'demo_rate_limited' || errJson.error === 'demo_global_capacity')
                && window.DemoGuard) {
              this.hideTypingIndicator();
              this.aiState.isLoading = false;
              if (userMsg) this._removeMessage(userMsg.id);
              window.DemoGuard.showSignupModal('seguir conversando con Vera');
              return;
            }
          } catch (_) { /* fall through to generic error */ }
        }
        throw new Error(await res.text());
      }
      const json = await res.json();

      // Guardar conversation_id si es nuevo
      if (json?.conversation_id && !this.aiState.active_conversation_id) {
        this.aiState.active_conversation_id = json.conversation_id;
        // Deep-link: fija ?c=<id> para que un refresh mantenga la conversación.
        this._setConversationUrl(json.conversation_id);
        // Conversación recién creada: refresca el rail para que aparezca y
        // genera un título con OpenAI a partir del primer mensaje del usuario
        // (evita que todo el historial diga "Nueva conversación").
        this._refreshHistorySoon();
        this._nameConversationSoon(json.conversation_id);
      }

      const convId = json?.conversation_id || this.aiState.active_conversation_id;

      if (json?.status === 'cost_confirmation_inline') {
        // ── Backend persistio el [CONFIRM] como ai_message. Llega via Realtime
        //    y se renderiza con 3 botones (Autorizar / Simplificar / Cancelar).
        //    No hacemos nada aqui — solo soltamos el spinner y dejamos que el
        //    bloque aparezca cuando Supabase Realtime lo entregue.
        this.hideTypingIndicator();
        this.aiState.isLoading = false;
        return;

      } else if (json?.status === 'cost_confirmation_required') {
        // ── Fallback legacy: backend devolvio el status viejo (e.g. el INSERT
        //    del [CONFIRM] fallo). Usa el window.confirm() de respaldo.
        this.hideTypingIndicator();
        this.aiState.isLoading = false;
        const accepted = await this._confirmHighCost(json.estimate);
        if (accepted) {
          await this.sendMessage(text, { confirmedHighCost: true });
        } else {
          if (userMsg) this._removeMessage(userMsg.id);
        }
        return;

      } else if (json?.status === 'processing') {
        // ── Modo async: Vera procesa en background ──────────────────────────
        await this._waitForAsyncResponse(convId, token);

      } else {
        // ── Modo sync (legacy / fallback) ───────────────────────────────────
        this.hideTypingIndicator();
        if (json?.message) {
          const assistantMsg = {
            id: `local-assistant-${Date.now()}`,
            role: 'assistant',
            content: json.message,
            created_at: new Date().toISOString()
          };
          this.aiState.messages.push(assistantMsg);
          this.appendMessage(assistantMsg);
        }
      }

    } catch (err) {
      console.error('VeraView sendMessage:', err);
      this.hideTypingIndicator();
      const errMsg = {
        id: `local-error-${Date.now()}`,
        role: 'error',
        content: 'Lo siento, hubo un error al procesar tu mensaje. Inténtalo de nuevo.',
        created_at: new Date().toISOString()
      };
      this.aiState.messages.push(errMsg);
      this.appendMessage(errMsg);
    } finally {
      this.aiState.isLoading = false;
      if (sendBtn) sendBtn.disabled = !(input?.value || '').trim();
    }
  }

  /* Pregunta al usuario si quiere continuar con una tarea costosa.
     v1 con window.confirm() — modal custom queda para iteración futura. */
  async _confirmHighCost(estimate) {
    if (!estimate) return true;
    const usdMin = Number(estimate.usd_min || 0).toFixed(2);
    const usdMax = Number(estimate.usd_max || 0).toFixed(2);
    const minutesRange = `${estimate.minutes_min || 1}-${estimate.minutes_max || 10} min`;
    const reasons = (estimate.reasons || []).map(r => `  • ${r}`).join('\n');
    const msg =
      `⚠️ Vera detectó una tarea potencialmente costosa.\n\n` +
      `Costo estimado: $${usdMin} – $${usdMax} USD\n` +
      `Duración estimada: ${minutesRange}\n\n` +
      `Razones:\n${reasons}\n\n` +
      `¿Continuar con esta tarea?\n` +
      `(Aceptar = ejecutar · Cancelar = replantear o descartar)`;
    return window.confirm(msg);
  }

  _removeMessage(id) {
    const idx = this.aiState.messages.findIndex(m => m.id === id);
    if (idx >= 0) this.aiState.messages.splice(idx, 1);
    document.querySelector(`[data-msg-id="${id}"]`)?.remove();
  }

  /* ── Mensajes de espera cíclicos (cuando no hay status del backend) ─────── */
  _getWaitMessage(elapsedMs) {
    if (elapsedMs < 15_000)  return 'Vera está pensando…';
    if (elapsedMs < 40_000)  return 'Vera está procesando tu solicitud…';
    if (elapsedMs < 90_000)  return 'Vera está trabajando en segundo plano…';
    if (elapsedMs < 180_000) return 'Vera está realizando tareas complejas — puede tardar unos minutos…';
    if (elapsedMs < 360_000) return 'Vera sigue activa — procesando en background…';
    return 'Vera lleva un buen rato trabajando. Si hay algo urgente, puedes enviar otro mensaje.';
  }

  /* ── Espera la respuesta async SOLO via Supabase Realtime ───────────────── */
  //
  // Diseño intencional:
  //   - SIN polling: no se consulta "el último mensaje por fecha" para evitar
  //     que un mensaje anterior aparezca mientras Vera procesa el nuevo.
  //   - SOLO Realtime: escucha INSERTs en ai_messages filtrados por
  //     conversation_id (server-side, Supabase lo garantiza).
  //   - El mensaje se muestra ÚNICAMENTE cuando entra en tiempo real con el
  //     conversation_id exacto de esta conversación.
  //   - Si el tiempo de espera se agota, se avisa al usuario que recargue —
  //     nunca se carga el historial para "adivinar" la respuesta.
  //
  async _waitForAsyncResponse(conversationId, token) {
    return new Promise((resolve) => {
      const startTime    = Date.now();
      // ISO del momento exacto en que el usuario envió el mensaje — filtra mensajes anteriores
      const startIso     = new Date().toISOString();
      const NOTIFY_AFTER_MS = 5_000;
      // 12 minutos — OpenClaw puede tardar hasta 10 min en tareas complejas
      const MAX_WAIT_MS  = 12 * 60 * 1000;
      const TICK_MS      = 5_000;
      // Polling de respaldo: primer check a los 5s, luego cada 6s
      const POLL_FIRST_MS    = 5_000;
      const POLL_INTERVAL_MS = 6_000;

      let resolved     = false;
      let lastStatusAt = Date.now();
      let tickInterval = null;
      let pollInterval = null;
      let channel      = null;

      // ── Cierra la espera y muestra el mensaje ─────────────────────────────
      const finish = (msg) => {
        if (resolved) return;
        resolved = true;
        clearInterval(tickInterval);
        clearInterval(pollInterval);
        try { channel?.unsubscribe(); } catch (_) {}
        this.hideTypingIndicator();

        if (msg) {
          const isError = msg.role === 'error' || msg.metadata?.error;
          const displayMsg = {
            id: msg.id || `local-${Date.now()}`,
            role: isError ? 'error' : 'assistant',
            content: msg.content,
            created_at: msg.created_at || new Date().toISOString()
          };
          this.aiState.messages.push(displayMsg);
          this.appendMessage(displayMsg);

          if (!isError && Date.now() - startTime >= NOTIFY_AFTER_MS) {
            this._playNotificationSound();
            this._showBrowserNotification(msg.content);
          }
        }
        resolve();
      };

      // ── Procesa cada mensaje recibido (Realtime o polling) ────────────────
      const handleMsg = (msg) => {
        if (!msg?.role || !msg?.content) return;

        // Solo mensajes de ESTA conversación
        if (msg.conversation_id && msg.conversation_id !== conversationId) return;

        if (msg.role === 'status') {
          lastStatusAt = Date.now();
          this.updateTypingStatus(msg.content);
          return;
        }

        if (msg.role === 'assistant' || msg.role === 'error') {
          finish(msg);
        }
      };

      // ── Polling de respaldo: busca mensajes NUEVOS (> startIso) ──────────
      // Garantiza que si Realtime falla, igual mostramos la respuesta.
      // El filtro created_at > startIso previene cargar el mensaje anterior.
      const doPoll = async () => {
        if (resolved || !this.supabase) return;
        try {
          const { data } = await this.supabase
            .from('ai_messages')
            .select('id, role, content, created_at, conversation_id')
            .eq('conversation_id', conversationId)
            .in('role', ['assistant', 'error'])
            .gt('created_at', startIso)
            .order('created_at', { ascending: false })
            .limit(1);

          if (data?.length) handleMsg(data[0]);
        } catch (err) {
          // Fallback poll del chat: si esto falla repetidamente, el usuario verá
          // "escribiendo…" sin respuesta. Logueamos para poder diagnosticar.
          console.warn('[VeraView] polling fallback falló:', err?.message || err);
        }
      };

      // ── Ticker de UI ──────────────────────────────────────────────────────
      tickInterval = setInterval(() => {
        if (resolved) return;
        const elapsed = Date.now() - startTime;

        if (elapsed >= MAX_WAIT_MS) {
          clearInterval(tickInterval);
          clearInterval(pollInterval);
          if (!resolved) {
            resolved = true;
            try { channel?.unsubscribe(); } catch (_) {}
            this.hideTypingIndicator();
            const timeoutMsg = {
              id: `local-timeout-${Date.now()}`,
              role: 'error',
              content: 'Vera sigue trabajando en segundo plano. Recarga la página cuando quieras ver su respuesta.',
              created_at: new Date().toISOString()
            };
            this.aiState.messages.push(timeoutMsg);
            this.appendMessage(timeoutMsg);
            resolve();
          }
          return;
        }

        // Mostrar ticker solo si no hay actividad reciente del backend
        if (Date.now() - lastStatusAt > 10_000) {
          this.updateTypingStatus(this._getWaitMessage(elapsed));
        }
      }, TICK_MS);

      // Primer poll a los 5s, luego cada 6s — cubre casos donde Realtime no entrega
      setTimeout(() => { doPoll(); pollInterval = setInterval(doPoll, POLL_INTERVAL_MS); }, POLL_FIRST_MS);

      // ── Supabase Realtime — entrega instantánea ───────────────────────────
      if (!this.supabase) {
        // Sin cliente Supabase no podemos escuchar — informar al usuario
        finish({
          role: 'error',
          content: 'No se pudo conectar al tiempo real. Recarga la página para ver la respuesta de Vera.'
        });
        return;
      }

      try {
        channel = this.supabase
          .channel(`vera-msg-${conversationId}-${Date.now()}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'ai_messages',
            filter: `conversation_id=eq.${conversationId}`,
          }, (payload) => {
            handleMsg(payload.new);
          })
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('VeraView Realtime: canal con error, estado:', status);
            }
          });
      } catch (e) {
        console.warn('VeraView: Realtime no disponible:', e.message);
        finish({
          role: 'error',
          content: 'No se pudo conectar al tiempo real. Recarga la página para ver la respuesta de Vera.'
        });
      }
    });
  }
}

window.VeraView = VeraView;
