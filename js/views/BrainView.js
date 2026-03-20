/**
 * BrainView — Vera (AI Brain Interface)
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

function parseChartSpec(jsonText) {
  const t = String(jsonText || '').trim();
  if (!t) throw new Error('Spec vacío');
  const spec = JSON.parse(t);
  if (!spec || typeof spec !== 'object') throw new Error('Spec inválido');
  const type = String(spec.type || '').trim().toLowerCase();
  if (!type) throw new Error('Falta spec.type');
  return { ...spec, type };
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

function renderChartBlock(code) {
  try {
    const spec = parseChartSpec(code);
    const svg = renderChartSVG(spec);
    return `<div class="gpt-viz">${svg}</div>`;
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

function renderMarkdown(text, opts = {}) {
  const raw = String(text ?? '');
  let h = escapeHtml(raw);
  const messageId = opts?.messageId ? String(opts.messageId) : '';
  let taskIdx = 0;

  // --- URL sanitizer (prevents javascript: etc.) ---
  const sanitizeUrl = (url) => {
    const u = String(url || '').trim();
    if (!u) return null;
    const lower = u.toLowerCase();
    // Evita requests externos de demos hardcodeadas (ej: via.placeholder.com)
    if (lower.includes('via.placeholder.com') || lower.includes('placehold.co')) return null;
    if (lower.startsWith('javascript:') || lower.startsWith('data:')) return null;
    if (lower.startsWith('http://') || lower.startsWith('https://')) return u;
    // allow site-relative paths (our assets) and simple relative paths
    if (lower.startsWith('/') || lower.startsWith('./')) return u;
    return null;
  };

  const isImageUrl = (url) => {
    const s = String(url || '').trim();
    // Standard: ends with an image extension
    if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(s)) return true;
    // Some CDNs use format as a path segment, e.g. /900x420/png?text=...
    try {
      const u = new URL(s, window.location.origin);
      if (/(^|\/)(png|jpe?g|gif|webp|svg)(\/|$)/i.test(u.pathname)) return true;
      if (/(^|&)format=(png|jpe?g|gif|webp|svg)(&|$)/i.test(u.search)) return true;
    } catch (_) {}
    return false;
  };
  const isVideoUrl = (url) => /\.(mp4|webm|ogg)(\?.*)?$/i.test(String(url || '').trim());

  // Render media (img/video) from a safe URL
  const renderMediaFromUrl = (safeUrl, alt = '') => {
    const u = String(safeUrl || '').trim();
    if (!u) return '';
    if (isImageUrl(u)) {
      return `<img class="gpt-md-img" src="${escapeHtml(u)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
    }
    if (isVideoUrl(u)) {
      return `<video class="gpt-md-video" src="${escapeHtml(u)}" muted playsinline preload="metadata" controls></video>`;
    }
    return '';
  };

  // --- Protect fenced code blocks first ---
  const codeBlocks = [];
  h = h.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({
      lang: (lang || '').trim(),
      code: code.trim()
    });
    return `@@CODEBLOCK_${idx}@@`;
  });

  // Inline code (backticks) — apply before emphasis
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Horizontal rules (---, ***, ___) on their own line
  h = h.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '<hr>');

  // Headings (# to ######) on their own line
  h = h.replace(/^(#{1,6})\s+(.+?)\s*$/gm, (_, hashes, title) => {
    const level = Math.min(6, Math.max(1, hashes.length));
    return `<h${level}>${title}</h${level}>`;
  });

  // Blockquotes: contiguous lines starting with >
  // Nota: como escapamos HTML al inicio, ">" llega como "&gt;"
  h = h.replace(/(^|\n)(&gt;\s.+(?:\n&gt;\s.+)*)/g, (m, start, block) => {
    const inner = block
      .split('\n')
      .map((l) => l.replace(/^&gt;\s?/, ''))
      .join('\n')
      .trim();
    return `${start}<blockquote>${inner}</blockquote>`;
  });

  // Images: ![alt](url)
  h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return `<span>${escapeHtml(`![${alt}](${url})`)}</span>`;
    const media = renderMediaFromUrl(safe, alt);
    return media || `<img class="gpt-md-img" src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
  });

  // Links: [text](url)
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return `<span>${escapeHtml(`[${label}](${url})`)}</span>`;
    const media = renderMediaFromUrl(safe, label);
    if (media) return media;
    const isExternal = /^https?:\/\//i.test(safe);
    const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a class="gpt-md-link" href="${escapeHtml(safe)}"${attrs}>${label}</a>`;
  });

  // Bare URLs on their own line → auto-embed (image/video) or link
  h = h.replace(/^\s*(https?:\/\/[^\s<]+|\/[^\s<]+)\s*$/gm, (m, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return m;
    const media = renderMediaFromUrl(safe, '');
    if (media) return media;
    const isExternal = /^https?:\/\//i.test(safe);
    const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a class="gpt-md-link" href="${escapeHtml(safe)}"${attrs}>${escapeHtml(safe)}</a>`;
  });

  // Strikethrough: ~~text~~
  h = h.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  // Bold+Italic: ***text*** or ___text___
  h = h.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<em><strong>$1</strong></em>');
  h = h.replace(/___([^_\n]+)___/g, '<em><strong>$1</strong></em>');

  // Bold: **text** or __text__
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  h = h.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // Lists (unordered and ordered), line-by-line
  const lines = h.split('\n');
  const out = [];
  let listType = null;

  for (const line of lines) {
    const bullet = line.match(/^[•\-\*\+] (.+)$/);
    const numbered = line.match(/^\d+\. (.+)$/);
    if (bullet) {
      if (listType !== 'ul') {
        if (listType) out.push(`</${listType}>`);
        out.push('<ul>');
        listType = 'ul';
      }
      const task = bullet[1].match(/^\[( |x|X)\]\s+([\s\S]+)$/);
      if (task) {
        const checked = task[1].toLowerCase() === 'x';
        const label = task[2];
        const idx = taskIdx++;
        out.push(
          `<li class="gpt-task-item">` +
            `<label class="gpt-task-label">` +
              `<input class="gpt-task-checkbox" type="checkbox" ${checked ? 'checked' : ''}` +
                ` data-task-idx="${idx}"` +
                (messageId ? ` data-message-id="${escapeHtml(messageId)}"` : '') +
                ` data-task-text="${escapeHtml(label)}"` +
              ` />` +
              `<span class="gpt-task-text">${label}</span>` +
            `</label>` +
          `</li>`
        );
      } else {
        out.push(`<li>${bullet[1]}</li>`);
      }
    } else if (numbered) {
      if (listType !== 'ol') {
        if (listType) out.push(`</${listType}>`);
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${numbered[1]}</li>`);
    } else {
      if (listType) { out.push(`</${listType}>`); listType = null; }
      out.push(line);
    }
  }
  if (listType) out.push(`</${listType}>`);

  // Restore fenced code blocks
  let joined = out.join('\n');
  joined = joined.replace(/@@CODEBLOCK_(\d+)@@/g, (_, idxStr) => {
    const idx = Number(idxStr);
    const item = codeBlocks[idx];
    if (!item) return '';
    const lang = (item.lang || '').toLowerCase();
    if (lang === 'chart' || lang === 'vera-chart' || lang === 'viz') {
      return renderChartBlock(item.code);
    }
    if (lang === 'buttons' || lang === 'quickreplies' || lang === 'quick-replies' || lang === 'actions') {
      return renderButtonsBlock(item.code);
    }
    const langClass = item.lang ? ` class="language-${escapeHtml(item.lang)}"` : '';
    return `<pre><code${langClass}>${escapeHtml(item.code)}</code></pre>`;
  });

  // Paragraphs (double newline). Preserve block-level tags
  return joined.split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return '';
    if (/^<(ul|ol|pre|blockquote|h[1-6]|hr|img|div)/.test(p)) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('');
}

const VERA_AVATAR_SRC = '/recursos/Recursos%20de%20Marca/Recursos/Vera.svg';

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
class BrainView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.aiState = {
      organization_id: null,
      active_conversation_id: null,
      messages: [],
      isLoading: false
    };
    this.organizationName = '';
    this.supabase = null;
    this.userId = null;
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

    this.aiState.organization_id =
      this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.aiState.organization_id) {
      const url =
        window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
          ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
          : '/form_org';
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
      console.warn('BrainView supabase:', e);
    }

    this.organizationName = (window.currentOrgName || '').trim();
    if (!this.organizationName && this.supabase && this.aiState.organization_id) {
      try {
        const { data } = await this.supabase
          .from('organizations')
          .select('name')
          .eq('id', this.aiState.organization_id)
          .maybeSingle();
        this.organizationName = data?.name ? String(data.name) : '';
      } catch (_) {}
    }
    if (!this.organizationName) this.organizationName = 'Organización';
  }

  /* ── HTML skeleton ───────────────────────────────────── */
  renderHTML() {
    return `
      <div id="chatcontainer" class="gpt-layout">
        <div class="gpt-main" id="gptMain">
          <div class="gpt-messages-scroll" id="brainMessagesWrap">
            <div class="gpt-messages-inner" id="brainMessageList"></div>
          </div>
          <div class="gpt-composer-wrap" id="chatInputOverlay">
            <div class="gpt-composer" id="brainInputWrap">
              <textarea
                class="gpt-composer-textarea"
                id="brainInput"
                placeholder="Pregunta lo que quieras"
                rows="1"
              ></textarea>
              <div class="gpt-composer-row">
                <div class="gpt-composer-btns">
                  <button class="gpt-composer-icon" id="brainPlus" title="Adjuntar">
                    <i class="fas fa-paperclip"></i>
                  </button>
                </div>
                <button class="gpt-send-btn" id="brainSend" title="Enviar" disabled>
                  <i class="fas fa-arrow-up"></i>
                </button>
              </div>
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

    await this.loadActiveConversation();

    if (this.aiState.active_conversation_id) {
      await this.loadMessages();
      this.renderMessages();
    } else {
      this.renderWelcome();
    }
  }

  _bindMediaHover() {
    const root = document.getElementById('brainMessageList');
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
        .order('created_at', { ascending: true });
      this.aiState.messages = (!error && data) ? data : [];
    } catch (_) {
      this.aiState.messages = [];
    }
  }

  renderWelcome() {
    const list = document.getElementById('brainMessageList');
    if (!list) return;
    list.innerHTML = `
      <div class="gpt-welcome">
        <h1 class="gpt-welcome-title">Vera está lista.</h1>
        <p class="gpt-welcome-subtitle" style="margin: 8px 0 0; color: var(--text-muted, rgba(212,209,216,0.6));">
          Escribe tu mensaje para comenzar.
        </p>
      </div>
    `;
  }

  _bindTaskEvents() {
    const root = document.getElementById('brainMessageList');
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
    const root = document.getElementById('brainMessageList');
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

  renderMessages() {
    const list = document.getElementById('brainMessageList');
    const scroll = document.getElementById('brainMessagesWrap');
    if (!list) return;

    if (!this.aiState.messages.length) {
      this.renderWelcome();
      return;
    }

    list.innerHTML = this.aiState.messages.map(m => this._msgHTML(m)).join('');
    this._bindMediaHover();
    this._bindTaskEvents();
    this._bindQuickReplyButtons();
    if (scroll) setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 20);
  }

  _msgHTML(m) {
    const id = escapeHtml(m.id || '');
    const isUser = m.role === 'user';
    const isError = m.role === 'error';

    if (isUser) {
      return `
        <div class="gpt-msg gpt-msg--user" data-message-id="${id}">
          <div class="gpt-msg-bubble">${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>
        </div>`;
    }

    return `
      <div class="gpt-msg gpt-msg--assistant${isError ? ' gpt-msg--error' : ''}" data-message-id="${id}">
        <div class="gpt-msg-avatar">
          <img class="gpt-msg-avatar-img" src="${VERA_AVATAR_SRC}" alt="Vera" />
        </div>
        <div class="gpt-msg-content">${renderMarkdown(m.content, { messageId: m.id })}</div>
      </div>`;
  }

  appendMessage(msg) {
    const list = document.getElementById('brainMessageList');
    const scroll = document.getElementById('brainMessagesWrap');
    if (!list) return;
    const welcome = list.querySelector('.gpt-welcome');
    if (welcome) welcome.remove();
    list.insertAdjacentHTML('beforeend', this._msgHTML(msg));
    this._bindMediaHover();
    this._bindTaskEvents();
    this._bindQuickReplyButtons();
    if (scroll) setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 20);
  }

  /* ── Typing indicator ────────────────────────────────── */
  showTypingIndicator() {
    const list = document.getElementById('brainMessageList');
    const scroll = document.getElementById('brainMessagesWrap');
    if (!list) return;
    const welcome = list.querySelector('.gpt-welcome');
    if (welcome) welcome.remove();
    document.getElementById('gptTyping')?.remove();
    list.insertAdjacentHTML('beforeend', `
      <div id="gptTyping" class="gpt-msg gpt-msg--assistant gpt-msg--typing">
        <div class="gpt-msg-avatar">
          <img class="gpt-msg-avatar-img" src="${VERA_AVATAR_SRC}" alt="Vera" />
        </div>
        <div class="gpt-msg-content">
          <div class="gpt-typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    `);
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  hideTypingIndicator() {
    document.getElementById('gptTyping')?.remove();
  }

  /* ── Input binding ───────────────────────────────────── */
  bindInput() {
    const input = document.getElementById('brainInput');
    const sendBtn = document.getElementById('brainSend');
    if (!input) return;

    const autoResize = () => {
      input.style.height = 'auto';
      const next = Math.min(180, input.scrollHeight || 0);
      if (next > 0) input.style.height = `${next}px`;
    };

    const syncSendBtn = () => {
      if (sendBtn) sendBtn.disabled = !(input.value || '').trim() || this.aiState.isLoading;
    };

    this.addEventListener(input, 'input', () => { autoResize(); syncSendBtn(); });
    autoResize();
    syncSendBtn();

    const send = () => {
      const text = (input.value || '').trim();
      if (!text || this.aiState.isLoading) return;
      this.sendMessage(text);
      input.value = '';
      input.style.height = 'auto';
      syncSendBtn();
    };

    this.addEventListener(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    if (sendBtn) this.addEventListener(sendBtn, 'click', send);

    // Plus / mic — placeholder
    const plusBtn = document.getElementById('brainPlus');
    if (plusBtn) this.addEventListener(plusBtn, 'click', () => {});
  }

  /* ── Send message ────────────────────────────────────── */
  async sendMessage(text) {
    if (!this.aiState.organization_id || this.aiState.isLoading) return;
    this.aiState.isLoading = true;

    const sendBtn = document.getElementById('brainSend');
    const input = document.getElementById('brainInput');
    if (sendBtn) sendBtn.disabled = true;

    // Optimistic: append user message immediately
    const userMsg = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    this.aiState.messages.push(userMsg);
    this.appendMessage(userMsg);
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
          // Ayuda al proxy /api/ai/engine-chat a reenviar a ai-engine
          'X-AI-ENGINE-BASE-URL':
            (window.AI_ENGINE_BASE_URL ||
              (() => {
                try { return localStorage.getItem('AI_ENGINE_BASE_URL') || ''; } catch (_) { return ''; }
              })())
        },
        body: JSON.stringify({
          organization_id: this.aiState.organization_id,
          conversation_id: this.aiState.active_conversation_id || undefined,
          message: text
        })
      });

      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      if (json?.conversation_id && !this.aiState.active_conversation_id) {
        this.aiState.active_conversation_id = json.conversation_id;
      }

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
    } catch (err) {
      console.error('BrainView sendMessage:', err);
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
}

window.BrainView = BrainView;
