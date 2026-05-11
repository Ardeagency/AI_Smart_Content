/**
 * MatchBars — renderiza 3 barras CSS + composite score para "audience match".
 *
 * Sin Chart.js (10 canvases en pantalla = 1 MB GPU + 150ms init). CSS render <5ms total.
 * A11y nativa: role="progressbar" aria-valuenow=N por barra.
 *
 * Uso:
 *   const html = window.MatchBars.render({
 *     age: 80, gender: 60, geo: 76, composite: 72,
 *     missing: { age: false, gender: false, geo: false }
 *   });
 *   container.innerHTML = html;
 */
(function () {
  function colorForScore(score) {
    if (score == null) return 'var(--cc-bar-empty, #2a2a2a)';
    if (score >= 80)   return 'var(--accent-warm, #e09145)';
    if (score >= 50)   return 'var(--cc-bar-mid, #a86a30)';
    return 'var(--cc-bar-low, #5a5a5a)';
  }

  function labelForComposite(score) {
    if (score == null)  return 'Sin datos';
    if (score >= 80)    return 'Alineado';
    if (score >= 50)    return 'Parcial';
    return 'Desviado';
  }

  function row(label, score, missing) {
    if (missing) {
      return `
        <div class="cc-match-row cc-match-row--missing" role="presentation">
          <span class="cc-match-label">${label}</span>
          <div class="cc-match-bar-wrap" title="Sin datos para evaluar este eje">
            <div class="cc-match-bar cc-match-bar--empty"></div>
          </div>
          <span class="cc-match-value">—</span>
        </div>`;
    }
    const pct = Math.max(0, Math.min(100, Number(score) || 0));
    const color = colorForScore(pct);
    return `
      <div class="cc-match-row" role="progressbar" aria-label="${label}: ${pct}%" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <span class="cc-match-label">${label}</span>
        <div class="cc-match-bar-wrap">
          <div class="cc-match-bar" style="width:${pct}%;background:${color};"></div>
        </div>
        <span class="cc-match-value">${pct}%</span>
      </div>`;
  }

  function render(scores) {
    if (!scores || typeof scores !== 'object') return '';
    const missing = scores.missing || {};
    const composite = scores.composite;
    const label = labelForComposite(composite);

    return `
      <div class="cc-match-block" data-composite="${composite ?? ''}">
        <div class="cc-match-head">
          <div class="cc-match-composite">
            <span class="cc-match-composite-num" style="color:${colorForScore(composite)}">${composite ?? '—'}<small>%</small></span>
            <span class="cc-match-composite-label">${label} con persona</span>
          </div>
        </div>
        <div class="cc-match-bars">
          ${row('Edad',   scores.age,    !!missing.age)}
          ${row('Género', scores.gender, !!missing.gender)}
          ${row('Geo',    scores.geo,    !!missing.geo)}
        </div>
      </div>`;
  }

  // No init events — es puro render.
  window.MatchBars = { render };
})();
