/**
 * DashboardView — VeraReading mixin (transversal a los 4 tabs).
 *
 * Renderiza LA LECTURA DE VERA (vera_dashboard_readings) como banner ejecutivo
 * de cada tab, reemplazando el hero de brand_cmo_brief cuando la lectura existe.
 * La lectura es JSON de BLOQUES TIPADOS producido por la Sesión Dashboard
 * agéntica de VERA en ai-engine — el frontend solo renderiza y ESCAPA todo
 * texto (VERA lee contenido de internet: jamás convertir su output en markup).
 *
 * Tipos de bloque v1: insight · signal_triangulation · hypothesis · receipt ·
 * recommended_move · watchlist_item · delta. Un type desconocido se ignora
 * (forward-compatible con schema_version futuros).
 *
 * Evidencia clicable: cada afirmación referencia claves ev* del mapa
 * reading.evidence; el botón "ver prueba" resuelve la referencia real vía
 * get_vera_evidence y la muestra en window.Modal (post + métricas + link).
 *
 * FALLBACK: sin lectura publicada → cada tab conserva su hero actual. Un error
 * aquí nunca tumba el tab.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const SCOPE_LABEL = {
    mi_marca:   () => __('Mi Marca'),
    monitoreo:  () => __('Competencia'),
    tendencias: () => __('Tendencias'),
    estrategia: () => __('Estrategia'),
  };
  const SEV = {
    opportunity: { cls: 'opp',    label: () => __('oportunidad') },
    warning:     { cls: 'warn',   label: () => __('atención') },
    threat:      { cls: 'threat', label: () => __('amenaza') },
    neutral:     { cls: 'neu',    label: () => __('neutro') },
  };
  const URG = {
    hoy:         () => __('HOY'),
    esta_semana: () => __('ESTA SEMANA'),
    este_mes:    () => __('ESTE MES'),
  };
  const DIR = { up: '▲', down: '▼', new: '●', gone: '○' };

  Object.assign(DashboardView.prototype, {

    async _ensureVeraReadingService() {
      if (this._veraReadingService) {
        // brand filter del tab puede haber cambiado la marca activa
        const f = this._mbFilters || {};
        if (f.brandContainerId) this._veraReadingService.setContainer(f.brandContainerId);
        return this._veraReadingService;
      }
      if (typeof VeraReadingService !== 'function' || !this._supabase) return null;
      this._veraReadingService = new VeraReadingService();
      await this._veraReadingService.init(this._supabase, this._orgId);
      const f = this._mbFilters || {};
      if (f.brandContainerId) this._veraReadingService.setContainer(f.brandContainerId);
      return this._veraReadingService;
    },

    /** Carga (cacheada) la lectura de un scope y la deja en this._veraReadings. Nunca lanza. */
    async _loadVeraReading(scope) {
      try {
        const svc = await this._ensureVeraReadingService();
        if (!svc) return null;
        const res = await svc.getReading(scope);
        this._veraReadings = this._veraReadings || {};
        this._veraReadings[scope] = res;
        return res;
      } catch (e) {
        console.warn('[VeraReading] load failed:', e?.message || e);
        return null;
      }
    },

    /* ── Cuerpo COMPLETO del tab (rediseño 2026-07: la lectura ES el tab) ──
       Reemplaza todo el contenido legacy del tab. Devuelve true siempre:
       lectura si existe, estado de espera si no. El código legacy de cada
       mixin queda intacto (oculto) por si se reactiva. */

    async _renderVeraTabBody(body, scope) {
      if (!body) return true;
      // PROTOCOLO LIBERTAD: en Mi Marca, si Vera publicó su DIAGNÓSTICO libre
      // (formato que ella eligió — HTML/JSON/texto), ese ES el dashboard.
      if (scope === 'mi_marca') {
        await this._loadVeraReading('diagnostico');
        const free = this._buildVeraFreeHtml('diagnostico');
        if (free) {
          body.innerHTML = `<div class="insight-page mb-dash vera-page">${free}</div>`;
          this._bindVeraBand(body);
          this._mountVeraFreeFrames(body);
          return true;
        }
      }
      await this._loadVeraReading(scope);
      const instrument = this._buildVeraInstrumentHtml(scope);
      body.innerHTML = `
        <div class="insight-page mb-dash vera-page">
          ${instrument || this._veraEmptyStateHtml(scope)}
        </div>`;
      this._bindVeraBand(body);
      return true;
    },

    /* ── FORMATO LIBRE: Vera diseñó esto — el frontend solo lo hospeda.
       HTML → iframe sandbox (scripts aislados, sin acceso a la app/sesión:
       libertad visual total con el cliente protegido). JSON → render
       adaptativo de la estructura que ella haya inventado. Texto → prosa. ── */
    _buildVeraFreeHtml(scope) {
      const res = this._veraReadings?.[scope];
      const r = res?.reading;
      if (!r || !r.free || !r.content) return '';
      const esc = (s) => this._esc(s);
      const when = res.created_at ? this._veraFmtDate(res.created_at) : '';
      const auto = String(res.trigger_kind || '').startsWith('auto');

      let bodyHtml = '';
      if (r.format === 'html') {
        bodyHtml = `<iframe class="vera-free-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${esc(__('Diagnóstico de Vera'))}" data-vera-srcdoc></iframe>`;
      } else if (r.format === 'json') {
        let parsed = null;
        try { parsed = JSON.parse(String(r.content).replace(/^```(?:json)?/m, '').replace(/```$/m, '')); } catch (_) {}
        bodyHtml = parsed
          ? `<div class="vera-free-json">${this._veraJsonHtml(parsed, 0)}</div>`
          : `<pre class="vera-free-text">${esc(r.content)}</pre>`;
      } else {
        bodyHtml = `<div class="vera-free-text">${esc(r.content)}</div>`;
      }

      return `
        <section class="mb-section vera-band-section" data-vera-scope="${esc(scope)}">
          <div class="vera-band vera-band--free">
            <div class="vera-band-head">
              <span class="vera-dot" aria-hidden="true"></span>
              <span class="vera-band-kicker">${esc(__('Diagnóstico de marca — hecho por Vera'))}${auto ? ` · ${esc(__('se activó sola'))}` : ''}</span>
              ${when ? `<time class="vera-band-when">${esc(when)}</time>` : ''}
            </div>
            ${bodyHtml}
          </div>
        </section>`;
    },

    /* srcdoc se asigna por DOM (no por string HTML) para que el contenido de
       Vera jamás se interprete en el documento padre. */
    _mountVeraFreeFrames(body) {
      const res = this._veraReadings?.diagnostico;
      const content = res?.reading?.content;
      if (!content) return;
      body.querySelectorAll('iframe[data-vera-srcdoc]').forEach((f) => {
        f.srcdoc = content;
      });
    },

    _veraJsonHtml(v, depth) {
      const esc = (s) => this._esc(s);
      const label = (k) => esc(String(k).replace(/[_-]+/g, ' '));
      if (v === null || v === undefined) return '<span class="vj-null">—</span>';
      if (Array.isArray(v)) {
        return `<ul class="vj-list">${v.map((x) => `<li>${this._veraJsonHtml(x, depth + 1)}</li>`).join('')}</ul>`;
      }
      if (typeof v === 'object') {
        return Object.entries(v).map(([k, val]) => {
          const isBlock = val && typeof val === 'object';
          if (depth === 0) {
            return `<section class="vj-section"><h4 class="vj-h">${label(k)}</h4>${this._veraJsonHtml(val, depth + 1)}</section>`;
          }
          return `<div class="vj-row${isBlock ? ' vj-row--block' : ''}"><span class="vj-k">${label(k)}</span><span class="vj-v">${this._veraJsonHtml(val, depth + 1)}</span></div>`;
        }).join('');
      }
      return `<span class="vj-val">${esc(String(v))}</span>`;
    },

    /* ── INSTRUMENTO (no memo): acción arriba, estado de un vistazo,
       narrativa como soporte expandible. Jerarquía:
       1. headline de Vera  2. tiles de estado con delta  3. LA MOVIDA
       (aprobable → dispara producción)  4. "El porqué" colapsable
       5. watchlist. Lecturas viejas sin tiles/rec_id degradan solas. ── */
    _buildVeraInstrumentHtml(scope) {
      const res = this._veraReadings?.[scope];
      const r = res?.reading;
      if (!r || !r.headline) return '';
      const esc = (s) => this._esc(s);
      const when = res.created_at ? this._veraFmtDate(res.created_at) : '';
      const stale = res.status === 'stale';
      const ev = r.evidence || {};
      const blocks = Array.isArray(r.narrative) ? r.narrative : [];

      const tiles = blocks.filter((b) => b?.type === 'stat_tile');
      const moves = blocks.filter((b) => b?.type === 'recommended_move');
      const watch = blocks.filter((b) => b?.type === 'watchlist_item');
      const why = blocks.filter((b) => !['stat_tile', 'recommended_move', 'watchlist_item'].includes(b?.type));

      const tilesHtml = tiles.length ? `
        <div class="vera-tiles">
          ${tiles.map((t) => `
            <div class="vera-tile">
              <div class="vera-tile-label">${esc(t.label || '')}</div>
              <div class="vera-tile-value">${esc(t.value || '')}</div>
              ${t.delta ? `<div class="vera-tile-delta vera-tile-delta--${esc(t.direction || 'flat')}">${t.direction === 'down' ? '▼' : t.direction === 'up' ? '▲' : '·'} ${esc(t.delta)}</div>` : ''}
              ${t.note ? `<div class="vera-tile-note">${esc(t.note)}</div>` : ''}
            </div>`).join('')}
        </div>` : '';

      const movesHtml = moves.map((m) => this._veraMoveCardHtml(m, ev, res.reading_id)).join('');

      const whyHtml = why.length ? `
        <details class="vera-why">
          <summary>${esc(__('El porqué — la lectura completa de Vera con evidencia'))}</summary>
          <div class="vera-why-body">
            ${why.map((b) => this._veraBlockHtml(b, ev, res.reading_id)).filter(Boolean).join('')}
          </div>
        </details>` : '';

      const watchHtml = watch.length ? `
        <div class="vera-watchrow">
          <div class="vera-watchrow-title">${esc(__('Vera está vigilando'))}</div>
          ${watch.map((b) => this._veraBlockHtml(b, ev, res.reading_id)).filter(Boolean).join('')}
        </div>` : '';

      const conf = r.meta?.data_confidence;
      return `
        <section class="mb-section vera-band-section" data-vera-scope="${esc(scope)}">
          <div class="vera-band">
            <div class="vera-band-head">
              <span class="vera-dot" aria-hidden="true"></span>
              <span class="vera-band-kicker">${esc(__('Lectura de Vera'))} — ${esc(SCOPE_LABEL[scope] ? SCOPE_LABEL[scope]() : scope)}</span>
              ${stale ? `<span class="vera-chip vera-chip--stale">${esc(__('lectura del {d}', { d: when }))}</span>`
                      : (when ? `<time class="vera-band-when">${esc(when)}</time>` : '')}
            </div>
            <h3 class="vera-band-headline">${esc(r.headline)}</h3>
            ${conf ? `<div class="vera-band-conf">${esc(__('confianza de datos: {c}', { c: conf }))}${r.meta?.silence_ok ? ` · ${esc(__('semana quieta — lectura honesta'))}` : ''}</div>` : ''}
            ${tilesHtml}
            ${movesHtml}
            ${whyHtml}
            ${watchHtml}
          </div>
        </section>`;
    },

    /* LA MOVIDA como card accionable. Aprobar → approve_strategic_recommendation
       (Loop V1 la lleva a producción). Sin rec_id (lecturas viejas) → sin botones. */
    _veraMoveCardHtml(m, ev, readingId) {
      const esc = (s) => this._esc(s);
      const urg = URG[m.urgency] ? URG[m.urgency]() : (m.urgency || '');
      const refs = (Array.isArray(m.evidence) ? m.evidence : []).filter((k) => k && ev[k]);
      const evBtns = refs.map((k) => `<button type="button" class="vera-ev" data-vera-ev="${esc(readingId)}|${esc(k)}">${esc(__('ver prueba'))} ${esc(k)}</button>`).join(' ');
      const b = m.brief || {};
      const briefBits = [b.formato, b.canal].filter(Boolean).map((x) => `<span class="vera-move-chip">${esc(x)}</span>`).join('');
      return `
        <div class="vera-move-card" ${m.rec_id ? `data-vera-rec="${esc(m.rec_id)}"` : ''}>
          <div class="vera-move-head">
            <span class="vera-move-kicker">${esc(__('La movida'))}</span>
            ${urg ? `<span class="vera-urg">${esc(urg)}</span>` : ''}
            ${briefBits}
            <span class="vera-move-ev">${evBtns}</span>
          </div>
          <h4 class="vera-move-action">${esc(m.action || '')}</h4>
          <p class="vera-move-rationale">${esc(m.rationale || '')}</p>
          ${b.copy_seed ? `<div class="vera-move-seed"><i class="aisc-ico aisc-ico--quote"></i> ${esc(b.copy_seed)}</div>` : ''}
          ${m.rec_id ? `
          <div class="vera-move-actions">
            <button type="button" class="strat-btn strat-btn--approve" data-vera-rec-action="approve">${esc(__('Aprobar y producir'))}</button>
            <button type="button" class="strat-btn" data-vera-rec-action="iterate">${esc(__('Ajustar'))}</button>
            <button type="button" class="strat-btn strat-btn--reject" data-vera-rec-action="reject">${esc(__('Descartar'))}</button>
          </div>
          <div class="vera-move-done" hidden></div>` : ''}
        </div>`;
    },

    _veraEmptyStateHtml(scope) {
      const esc = (s) => this._esc(s);
      const label = SCOPE_LABEL[scope] ? SCOPE_LABEL[scope]() : scope;
      return `
        <section class="mb-section vera-band-section">
          <div class="vera-band vera-band--empty">
            <div class="vera-band-head">
              <span class="vera-dot" aria-hidden="true"></span>
              <span class="vera-band-kicker">${esc(__('Lectura de Vera'))} — ${esc(label)}</span>
            </div>
            <h3 class="vera-band-headline">${esc(__('Vera está preparando tu lectura de {s}.', { s: label }))}</h3>
            <p class="vera-empty-desc">${esc(__('Sus sensores están recopilando las señales de tu marca, tu competencia y tu nicho. En cuanto Vera termine su análisis, su lectura aparecerá aquí — con la evidencia para comprobarla.'))}</p>
          </div>
        </section>`;
    },

    /* ── HTML de la franja (banner ejecutivo del tab) ─────────────────────── */

    _buildVeraBandHtml(scope, opts = {}) {
      const res = this._veraReadings?.[scope];
      const r = res?.reading;
      if (!r || !r.headline) return '';
      const esc = (s) => this._esc(s);
      const when = res.created_at ? this._veraFmtDate(res.created_at) : '';
      const stale = res.status === 'stale';
      const conf = r.meta?.data_confidence;
      const blocks = (Array.isArray(r.narrative) ? r.narrative : [])
        .map((b) => this._veraBlockHtml(b, r.evidence || {}, res.reading_id))
        .filter(Boolean).join('');

      return `
        <section class="mb-section vera-band-section" data-vera-scope="${esc(scope)}">
          <div class="vera-band">
            <div class="vera-band-head">
              <span class="vera-dot" aria-hidden="true"></span>
              <span class="vera-band-kicker">${esc(__('Lectura de Vera'))} — ${esc(SCOPE_LABEL[scope] ? SCOPE_LABEL[scope]() : scope)}</span>
              ${stale ? `<span class="vera-chip vera-chip--stale">${esc(__('lectura del {d}', { d: when }))}</span>`
                      : (when ? `<time class="vera-band-when">${esc(when)}</time>` : '')}
            </div>
            <h3 class="vera-band-headline">${esc(r.headline)}</h3>
            ${conf ? `<div class="vera-band-conf">${esc(__('confianza de datos: {c}', { c: conf }))}${r.meta?.silence_ok ? ` · ${esc(__('semana quieta — lectura honesta'))}` : ''}</div>` : ''}
            ${blocks ? (opts.expanded
              ? `<div class="vera-full vera-full--open">${blocks}</div>`
              : `<button type="button" class="vera-more" data-vera-toggle aria-expanded="false">${esc(__('Ver la lectura completa con evidencia'))} <i class="aisc-ico aisc-ico--chevron-down"></i></button>
              <div class="vera-full" hidden>${blocks}</div>`) : ''}
          </div>
        </section>`;
    },

    /* ── Un bloque tipado → HTML (todo texto escapado) ────────────────────── */

    _veraBlockHtml(b, evidence, readingId) {
      if (!b || typeof b !== 'object') return '';
      const esc = (s) => this._esc(s);
      const evBtns = (refs) => (Array.isArray(refs) ? refs : [refs])
        .filter((k) => k && evidence[k])
        .map((k) => `<button type="button" class="vera-ev" data-vera-ev="${esc(readingId)}|${esc(k)}">${esc(__('ver prueba'))} ${esc(k)}</button>`)
        .join('');

      switch (b.type) {
        case 'insight': {
          const sev = SEV[b.severity] || SEV.neutral;
          return `
            <div class="vera-blk vera-blk--insight vera-sev--${sev.cls}">
              <div class="vera-blk-lbl"><span>${esc(__('insight'))}</span><span class="vera-sev">${esc(sev.label())}</span>${evBtns(b.evidence)}</div>
              <h4>${esc(b.title || '')}</h4>
              <p>${esc(b.body || '')}</p>
            </div>`;
        }
        case 'signal_triangulation': {
          const sigs = (Array.isArray(b.signals) ? b.signals : []).map((s) => `
            <div class="vera-sig"><span class="vera-sig-dot" aria-hidden="true">◆</span>
              <p>${esc(s.observation || '')} ${s.source_ref && evidence[s.source_ref] ? evBtns(s.source_ref) : ''}</p>
            </div>`).join('');
          return `
            <div class="vera-blk vera-blk--tri">
              <div class="vera-blk-lbl"><span>${esc(__('triangulación de señales'))}</span></div>
              ${sigs}
              <div class="vera-sowhat"><p><strong>${esc(__('¿Y entonces?'))}</strong> ${esc(b.so_what || '')}</p></div>
            </div>`;
        }
        case 'hypothesis':
          return `
            <div class="vera-blk vera-blk--hyp">
              <div class="vera-blk-lbl"><span>${esc(__('hipótesis'))} · ${esc(__('confianza {c}', { c: b.confidence || '—' }))}</span>${evBtns(b.evidence)}</div>
              <p>${esc(b.statement || '')}</p>
              <p class="vera-dim">${esc(__('Cómo verificarla:'))} ${esc(b.how_to_verify || '')}</p>
            </div>`;
        case 'receipt': {
          const who = [b.author_handle, b.platform, (b.engagement != null ? __('{n} interacciones', { n: b.engagement }) : null)]
            .filter(Boolean).join(' · ');
          return `
            <div class="vera-blk vera-blk--receipt">
              <div class="vera-blk-lbl"><span>${esc(__('la prueba — cita real'))}</span>${evBtns(b.source_ref)}</div>
              <blockquote>“${esc(b.quote || '')}”</blockquote>
              ${who ? `<div class="vera-who">${esc(who)}</div>` : ''}
            </div>`;
        }
        case 'recommended_move': {
          const urg = URG[b.urgency] ? URG[b.urgency]() : (b.urgency || '');
          return `
            <div class="vera-blk vera-blk--move">
              <div class="vera-blk-lbl"><span>${esc(__('movida recomendada'))}</span>${urg ? `<span class="vera-urg">${esc(urg)}</span>` : ''}${evBtns(b.evidence)}</div>
              <h4>${esc(b.action || '')}</h4>
              <p class="vera-dim">${esc(b.rationale || '')}</p>
            </div>`;
        }
        case 'watchlist_item':
          return `
            <div class="vera-blk vera-blk--watch">
              <div class="vera-blk-lbl"><span>${esc(__('Vera está vigilando'))}${b.check_back ? ` · ${esc(__('re-chequeo {d}', { d: b.check_back }))}` : ''}</span></div>
              <h4>${esc(b.what || '')}</h4>
              <p class="vera-dim">${esc(b.why_watching || '')}</p>
            </div>`;
        case 'delta':
          return `
            <div class="vera-blk vera-blk--delta vera-delta--${esc(b.direction || 'flat')}">
              <div class="vera-blk-lbl"><span>${esc(__('qué cambió'))}</span></div>
              <p><span class="vera-arrow" aria-hidden="true">${DIR[b.direction] || ''}</span> ${esc(b.changed || '')}</p>
            </div>`;
        default:
          return ''; // type desconocido (schema futuro): se omite sin romper
      }
    },

    /* ── Eventos (delegados, un solo bind por body) ───────────────────────── */

    _bindVeraBand(body) {
      if (!body || body.dataset.veraBound === '1') return;
      body.dataset.veraBound = '1';
      body.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-vera-toggle]');
        if (toggle) {
          const band = toggle.closest('.vera-band');
          const full = band?.querySelector('.vera-full');
          if (!full) return;
          const open = full.hasAttribute('hidden');
          if (open) full.removeAttribute('hidden'); else full.setAttribute('hidden', '');
          toggle.setAttribute('aria-expanded', String(open));
          toggle.innerHTML = `${this._esc(open ? __('Ocultar lectura') : __('Ver la lectura completa con evidencia'))} <i class="aisc-ico aisc-ico--chevron-${open ? 'up' : 'down'}"></i>`;
          return;
        }
        const ev = e.target.closest('[data-vera-ev]');
        if (ev) {
          const [readingId, key] = String(ev.dataset.veraEv || '').split('|');
          if (readingId && key) this._openVeraEvidence(readingId, key, ev);
          return;
        }
        const act = e.target.closest('[data-vera-rec-action]');
        if (act) {
          const card = act.closest('[data-vera-rec]');
          if (card) this._resolveVeraMove(card.dataset.veraRec, act.dataset.veraRecAction, card);
        }
      });
    },

    /* Aprobar y producir / Ajustar / Descartar — mismas RPCs del flujo de
       Estrategia (Loop V1: recommendation-producer lleva lo aprobado a
       producción real). */
    async _resolveVeraMove(recId, action, card) {
      if (!recId || !this._supabase) return;
      let feedback = '';
      if (action === 'iterate') {
        feedback = (window.prompt(__('¿Qué quieres ajustar de esta movida?')) || '').trim();
        if (!feedback) return;
      }
      const btns = card.querySelector('.vera-move-actions');
      if (btns) { btns.style.opacity = '0.5'; btns.style.pointerEvents = 'none'; }
      try {
        let rpc, params;
        if (action === 'approve')      { rpc = 'approve_strategic_recommendation'; params = { p_rec_id: recId }; }
        else if (action === 'reject')  { rpc = 'reject_strategic_recommendation';  params = { p_rec_id: recId, p_reason: '' }; }
        else                           { rpc = 'iterate_strategic_recommendation'; params = { p_rec_id: recId, p_feedback: feedback }; }
        const { error } = await this._supabase.rpc(rpc, params);
        if (error) throw error;
        const done = card.querySelector('.vera-move-done');
        if (btns) btns.hidden = true;
        if (done) {
          done.hidden = false;
          done.textContent = action === 'approve'
            ? __('✓ Aprobada — Vera la lleva a producción. Síguela en Producción.')
            : action === 'reject' ? __('Descartada.') : __('✓ Feedback enviado — Vera la va a iterar.');
          done.className = 'vera-move-done' + (action === 'approve' ? ' vera-move-done--ok' : '');
        }
      } catch (e) {
        console.error('[VeraReading] acción de movida falló:', e?.message || e);
        if (btns) { btns.style.opacity = ''; btns.style.pointerEvents = ''; }
      }
    },

    async _openVeraEvidence(readingId, key, btn) {
      if (!window.Modal || typeof window.Modal.show !== 'function') return;
      if (btn) btn.classList.add('is-loading');
      let res = null;
      try {
        const svc = await this._ensureVeraReadingService();
        res = svc ? await svc.getEvidence(readingId, key) : null;
      } finally {
        if (btn) btn.classList.remove('is-loading');
      }
      window.Modal.show({
        title: __('Evidencia {k}', { k: key }),
        body: this._veraEvidenceHtml(res),
        className: 'dash-modal vera-ev-modal',
      });
    },

    _veraEvidenceHtml(res) {
      const esc = (s) => this._esc(s);
      if (!res) return `<div class="vera-ev-empty">${esc(__('No se pudo resolver esta evidencia.'))}</div>`;
      const kind = String(res.kind || '');

      if ((kind === 'post' || kind === 'comment') && res.post) {
        const p = res.post;
        const net = p.media_type || '';
        const when = p.posted_at ? this._veraFmtDate(p.posted_at) : '';
        return `
          <div class="vera-ev-card">
            <div class="vera-ev-meta">${esc([when, net, p.is_competitor ? __('perfil monitoreado') : __('post propio')].filter(Boolean).join(' · '))}</div>
            ${p.content ? `<blockquote class="vera-ev-quote">${esc(p.content)}</blockquote>` : ''}
            <div class="vera-ev-stats">
              ${p.engagement_total != null ? `<span>${esc(__('{n} interacciones', { n: p.engagement_total }))}</span>` : ''}
              ${p.likes != null ? `<span>♥ ${esc(String(p.likes))}</span>` : ''}
              ${p.comment_count != null ? `<span>💬 ${esc(String(p.comment_count))}</span>` : ''}
            </div>
            ${p.permalink ? `<a class="vera-ev-link" href="${esc(p.permalink)}" target="_blank" rel="noopener noreferrer">${esc(__('Ver publicación original'))} ↗</a>` : ''}
            ${res.note ? `<div class="vera-ev-note">${esc(res.note)}</div>` : ''}
          </div>`;
      }
      if (kind === 'trend' && res.trend) {
        const t = res.trend;
        return `
          <div class="vera-ev-card">
            <div class="vera-ev-meta">${esc(__('Tendencia detectada'))}${t.source ? ` · ${esc(t.source)}` : ''}</div>
            <div class="vera-ev-kw">${esc(t.keyword || '')}</div>
            <div class="vera-ev-stats">
              ${t.velocity_score != null ? `<span>${esc(__('velocidad {v}', { v: t.velocity_score }))}</span>` : ''}
              ${t.relevance_score != null ? `<span>${esc(__('relevancia {v}', { v: t.relevance_score }))}</span>` : ''}
              ${t.category ? `<span>${esc(t.category)}</span>` : ''}
            </div>
          </div>`;
      }
      if (kind === 'signal' && res.signal) {
        const s = res.signal;
        return `
          <div class="vera-ev-card">
            <div class="vera-ev-meta">${esc(__('Señal de mercado'))}${s.source ? ` · ${esc(s.source)}` : ''}</div>
            ${s.title ? `<blockquote class="vera-ev-quote">${esc(s.title)}</blockquote>` : ''}
            ${s.url ? `<a class="vera-ev-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(__('Ver fuente'))} ↗</a>` : ''}
          </div>`;
      }
      if (kind === 'web') {
        return `
          <div class="vera-ev-card">
            <div class="vera-ev-meta">${esc(__('Fuente web'))}</div>
            ${res.title ? `<div class="vera-ev-kw">${esc(res.title)}</div>` : ''}
            ${res.note ? `<div class="vera-ev-note">${esc(res.note)}</div>` : ''}
            ${res.url ? `<a class="vera-ev-link" href="${esc(res.url)}" target="_blank" rel="noopener noreferrer">${esc(res.url)}</a>` : ''}
          </div>`;
      }
      // metric / unknown / no resuelta: mostrar lo que haya, como texto
      const raw = res.raw || res;
      const note = raw && (raw.note || raw.tool)
        ? [raw.tool, raw.note].filter(Boolean).join(' — ')
        : __('Referencia registrada por Vera durante su investigación.');
      return `
        <div class="vera-ev-card">
          <div class="vera-ev-meta">${esc(kind || __('referencia'))}</div>
          <div class="vera-ev-note">${esc(note)}</div>
        </div>`;
    },

    _veraFmtDate(iso) {
      try {
        return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      } catch (_) { return ''; }
    },
  });
})();
