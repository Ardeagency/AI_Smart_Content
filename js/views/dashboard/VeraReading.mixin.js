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
      await this._loadVeraReading(scope);
      const band = this._buildVeraBandHtml(scope, { expanded: true });
      body.innerHTML = `
        <div class="insight-page mb-dash vera-page">
          ${band || this._veraEmptyStateHtml(scope)}
        </div>`;
      this._bindVeraBand(body);
      return true;
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
        }
      });
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
