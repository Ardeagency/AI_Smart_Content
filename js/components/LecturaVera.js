/**
 * LecturaVera — pinta una lectura de Vera (marketing.readings) como HTML escapado.
 *
 * La forma viva es prosa (`prosa`) + datos (`datos`); las lecturas heredadas de v1
 * traen bloques tipados (insight · stat_tile · recommended_move · watchlist_item ·
 * hypothesis · receipt · signal_triangulation · delta; y las cards del Tablero v4:
 * observacion · silencio · algoritmo · rejilla_codigos…). Vera lee internet: TODO
 * texto se escapa, jamás se convierte en markup. Un type desconocido se omite.
 * Clases: css/modules/vera-reading.css (vera-band, vera-tiles, vera-move-card, vera-blk).
 */
(function () {
  'use strict';

  const esc = (s) => {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  };
  const t = (s, v) => (typeof window.__ === 'function' ? window.__(s, v) : s.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : '')));

  const SEV = { opportunity: ['opp', () => t('oportunidad')], warning: ['warn', () => t('atención')], threat: ['threat', () => t('amenaza')], neutral: ['neu', () => t('neutro')] };
  const URG = { hoy: () => t('HOY'), esta_semana: () => t('ESTA SEMANA'), este_mes: () => t('ESTE MES') };
  const DIR = { up: '▲', down: '▼', new: '●', gone: '○' };
  const CARD = { observacion: 'Observación', silencio: 'Silencio', algoritmo: 'Algoritmo', rejilla_codigos: 'Códigos de marca', ritmo: 'Ritmo', voz: 'Voz', virtudes: 'Virtudes', desventajas: 'Desventajas', intuicion: 'Intuición', audiencia: 'Audiencia', audiencias_recomendadas: 'Audiencias recomendadas' };

  function items(lista) {
    return (Array.isArray(lista) ? lista : []).map((it) => {
      if (typeof it === 'string') return `<li>${esc(it)}</li>`;
      if (!it || typeof it !== 'object') return '';
      const titulo = it.title || it.titulo || it.nombre || it.name || it.q || it.que || it.label || '';
      const cuerpo = it.body || it.texto || it.observacion || it.a || it.value || it.detalle || it.porque || it.why || '';
      return `<li>${titulo ? `<strong>${esc(titulo)}</strong>${cuerpo ? ' — ' : ''}` : ''}${esc(cuerpo)}</li>`;
    }).join('');
  }

  function tile(b) {
    return `
      <div class="vera-tile">
        <div class="vera-tile-label">${esc(b.label || '')}</div>
        <div class="vera-tile-value">${esc(b.value || '')}</div>
        ${b.delta ? `<div class="vera-tile-delta vera-tile-delta--${esc(b.direction || 'flat')}">${b.direction === 'down' ? '▼' : b.direction === 'up' ? '▲' : '·'} ${esc(b.delta)}</div>` : ''}
        ${b.note ? `<div class="vera-tile-note">${esc(b.note)}</div>` : ''}
      </div>`;
  }

  function movida(m) {
    const urg = URG[m.urgency] ? URG[m.urgency]() : (m.urgency || '');
    const b = m.brief || {};
    const chips = [b.formato, b.canal].filter(Boolean).map((x) => `<span class="vera-move-chip">${esc(x)}</span>`).join('');
    return `
      <div class="vera-move-card">
        <div class="vera-move-head">
          <span class="vera-move-kicker">${esc(t('La movida'))}</span>
          ${urg ? `<span class="vera-urg">${esc(urg)}</span>` : ''}
          ${chips}
        </div>
        <h4 class="vera-move-action">${esc(m.action || m.title || '')}</h4>
        <p class="vera-move-rationale">${esc(m.rationale || m.body || '')}</p>
        ${b.copy_seed ? `<div class="vera-move-seed">${esc(b.copy_seed)}</div>` : ''}
      </div>`;
  }

  function bloque(b) {
    if (!b || typeof b !== 'object') return '';
    switch (b.type) {
      case 'stat_tile': return tile(b);
      case 'recommended_move': return movida(b);
      case 'insight': {
        const sev = SEV[b.severity] || SEV.neutral;
        return `<div class="vera-blk vera-blk--insight vera-sev--${sev[0]}"><div class="vera-blk-lbl"><span>${esc(t('insight'))}</span><span class="vera-sev">${esc(sev[1]())}</span></div><h4>${esc(b.title || '')}</h4><p>${esc(b.body || '')}</p></div>`;
      }
      case 'signal_triangulation': {
        const sigs = (Array.isArray(b.signals) ? b.signals : []).map((s) => `<div class="vera-sig"><span class="vera-sig-dot" aria-hidden="true">◆</span><p>${esc(s.observation || '')}</p></div>`).join('');
        return `<div class="vera-blk vera-blk--tri"><div class="vera-blk-lbl"><span>${esc(t('triangulación de señales'))}</span></div>${sigs}<div class="vera-sowhat"><p><strong>${esc(t('¿Y entonces?'))}</strong> ${esc(b.so_what || '')}</p></div></div>`;
      }
      case 'hypothesis':
        return `<div class="vera-blk vera-blk--hyp"><div class="vera-blk-lbl"><span>${esc(t('hipótesis'))} · ${esc(t('confianza {c}', { c: b.confidence || '—' }))}</span></div><p>${esc(b.statement || '')}</p><p class="vera-dim">${esc(t('Cómo verificarla:'))} ${esc(b.how_to_verify || '')}</p></div>`;
      case 'receipt': {
        const who = [b.author_handle, b.platform, (b.engagement != null ? t('{n} interacciones', { n: b.engagement }) : null)].filter(Boolean).join(' · ');
        return `<div class="vera-blk vera-blk--receipt"><div class="vera-blk-lbl"><span>${esc(t('la prueba — cita real'))}</span></div><blockquote>“${esc(b.quote || '')}”</blockquote>${who ? `<div class="vera-who">${esc(who)}</div>` : ''}</div>`;
      }
      case 'watchlist_item':
        return `<div class="vera-blk vera-blk--watch"><div class="vera-blk-lbl"><span>${esc(t('Vera está vigilando'))}${b.check_back ? ` · ${esc(t('re-chequeo {d}', { d: b.check_back }))}` : ''}</span></div><h4>${esc(b.what || '')}</h4><p class="vera-dim">${esc(b.why_watching || '')}</p></div>`;
      case 'delta':
        return `<div class="vera-blk vera-blk--delta vera-delta--${esc(b.direction || 'flat')}"><div class="vera-blk-lbl"><span>${esc(t('qué cambió'))}</span></div><p><span class="vera-arrow" aria-hidden="true">${DIR[b.direction] || ''}</span> ${esc(b.changed || '')}</p></div>`;
      case 'texto':
        return `<div class="vera-blk"><p>${esc(b.body || '')}</p></div>`;
      // Cards del Tablero v4 (mi_marca, BD 210000): observacion (items[{titulo, observacion}]),
      // virtudes/desventajas/intuicion/algoritmo (markdown, title), audiencia (blocks[{type:'stat'…}]),
      // audiencias_recomendadas (items[{name…}]), silencio (items[{que…}]), rejilla_codigos (activos[]).
      case 'observacion': case 'silencio': case 'algoritmo': case 'rejilla_codigos': case 'ritmo': case 'voz':
      case 'virtudes': case 'desventajas': case 'intuicion': case 'audiencia': case 'audiencias_recomendadas': {
        const titulo = b.title || b.titulo || CARD[b.type] || b.type.replace(/_/g, ' ');
        const stats = (Array.isArray(b.blocks) ? b.blocks : []).filter((x) => x && x.type === 'stat').map((x) => tile({ label: x.label, value: x.value, note: x.note, delta: x.delta, direction: x.direction })).join('');
        const lista = items(b.items || b.activos || b.codigos || []);
        return `<div class="vera-blk vera-blk--card"><div class="vera-blk-lbl"><span>${esc(titulo)}</span></div>${b.markdown ? `<p>${esc(b.markdown)}</p>` : ''}${b.body ? `<p>${esc(b.body)}</p>` : ''}${stats ? `<div class="vera-tiles">${stats}</div>` : ''}${lista ? `<ul class="vera-list">${lista}</ul>` : ''}</div>`;
      }
      default:
        return ''; // type desconocido: se omite sin romper
    }
  }

  function datos(obj) {
    const pares = Object.entries(obj || {}).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
    if (!pares.length) return '';
    return `<dl class="vera-datos">${pares.slice(0, 12).map(([k, v]) => `<div><dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd></div>`).join('')}</dl>`;
  }

  function fecha(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; }
  }

  const KIND = { diagnosis: () => t('Diagnóstico'), recommendation: () => t('Recomendación'), observation: () => t('Observación'), retrospective: () => t('Retrospectiva') };

  /**
   * La lectura completa como banda. `opts.accion` = true pinta «Ponerla en marcha»
   * (data-lectura-actuar) cuando aún no se actuó sobre ella.
   */
  function lectura(l, opts = {}) {
    if (!l) return '';
    const tiles = l.tiles?.length ? `<div class="vera-tiles">${l.tiles.map(tile).join('')}</div>` : '';
    const movidas = (l.movidas || []).map(movida).join('');
    const porque = l.porque?.length ? `<details class="vera-why"${opts.abierto ? ' open' : ''}><summary>${esc(t('El porqué — la lectura completa de Vera'))}</summary><div class="vera-why-body">${l.porque.map(bloque).filter(Boolean).join('')}</div></details>` : '';
    const vig = l.vigilancias?.length ? `<div class="vera-watchrow"><div class="vera-watchrow-title">${esc(t('Vera está vigilando'))}</div>${l.vigilancias.map(bloque).join('')}</div>` : '';
    const d = datos(l.datos);
    const apoyo = d ? `<details class="vera-why"><summary>${esc(t('Datos de apoyo'))}</summary><div class="vera-why-body">${d}</div></details>` : '';
    const periodo = l.period_start ? `${fecha(l.period_start)}${l.period_end ? ` → ${fecha(l.period_end)}` : ''}` : fecha(l.created_at);
    // Actuar = PATCH acted_on: la base encola `estrategia.producir` (competencia.md), o sea
    // Vera convierte la recomendación en producción. El botón lo dice así, no «lo hice».
    const estado = l.acted_on
      ? `<span class="vera-chip vera-chip--done">${esc(t('en marcha'))}${l.acted_at ? ` · ${esc(fecha(l.acted_at))}` : ''}</span>`
      : (opts.accion ? `<button type="button" class="strat-btn strat-btn--approve" data-lectura-actuar="${esc(l.id)}" title="${esc(t('Vera la convierte en producción'))}">${esc(t('Ponerla en marcha'))}</button>` : '');
    return `
      <section class="vera-band-section" data-lectura="${esc(l.id)}">
        <div class="vera-band">
          <div class="vera-band-head">
            <span class="vera-dot" aria-hidden="true"></span>
            <span class="vera-band-kicker">${esc(t('Lectura de Vera'))} — ${esc(KIND[l.kind] ? KIND[l.kind]() : l.kind)}${l.de_v1 ? ` <span class="vera-chip vera-chip--stale">${esc(t('lectura de v1'))}</span>` : ''}</span>
            ${periodo ? `<time class="vera-band-when">${esc(periodo)}</time>` : ''}
          </div>
          <h3 class="vera-band-headline">${esc(l.headline)}</h3>
          ${l.confidence != null ? `<div class="vera-band-conf">${esc(t('confianza de datos: {c}', { c: l.confidence }))}</div>` : ''}
          ${l.prosa ? `<div class="vera-prosa">${esc(l.prosa).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').concat('</p>')}</div>` : ''}
          ${tiles}
          ${movidas}
          ${porque}
          ${vig}
          ${apoyo}
          <div class="vera-move-actions">${estado}${l.acted_note ? `<span class="vera-dim">${esc(l.acted_note)}</span>` : ''}</div>
        </div>
      </section>`;
  }

  window.LecturaVera = Object.freeze({ bloque, tile, movida, lectura, datos, escapar: esc });
})();
