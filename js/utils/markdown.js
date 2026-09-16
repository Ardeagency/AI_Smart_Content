/**
 * MarkdownLite — el markdown que usan los avisos y las notas de Vera: tablas,
 * títulos, negrita/cursiva, listas con guión y párrafos. Nada más.
 *
 * Salió de Navigation.js (ADR-0054 §7: el código va donde le toca) y es la
 * MISMA transformación: primero se escapa el HTML (seguridad, ADR-0045), y
 * las etiquetas que insertamos van después del escape, así nunca se expone
 * texto crudo del modelo o de una persona como marcado.
 */
(function () {
  'use strict';

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render(text) {
    if (!text) return '';
    let s = escapar(String(text));

    // 1) Tablas markdown
    s = s.replace(
      /(^\|[^\n]+\|$\n^\|[\s\-:|]+\|$\n(?:^\|[^\n]+\|$\n?)+)/gm,
      (block) => {
        const rows = block.trim().split('\n').map((r) => r.trim());
        if (rows.length < 2) return block;
        const split = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = split(rows[0]);
        const data = rows.slice(2).map(split);
        const th = head.map((c) => `<th>${c}</th>`).join('');
        const tb = data.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
        return `<table class="notif-md-table"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>\n`;
      }
    );

    // 2) Títulos
    s = s.replace(/^### (.+)$/gm, '<div class="notif-md-h3">$1</div>');
    s = s.replace(/^## (.+)$/gm, '<div class="notif-md-h2">$1</div>');
    s = s.replace(/^# (.+)$/gm, '<div class="notif-md-h1">$1</div>');

    // 3) Negrita + cursiva
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

    // 4) Listas con guión
    s = s.replace(/((?:^- .+$\n?)+)/gm, (block) => {
      const items = block.trim().split('\n').map((l) => l.replace(/^- /, '').trim());
      return '<ul class="notif-md-list">' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>\n';
    });

    // 5) Párrafos: dobles saltos = bloque separado; simples = <br>
    return s.split(/\n\n+/).map((chunk) => {
      const t = chunk.trim();
      if (!t) return '';
      if (/^<(table|ul|div class="notif-md-h)/.test(t)) return t;
      return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  window.MarkdownLite = Object.freeze({ render, escapar });
})();
