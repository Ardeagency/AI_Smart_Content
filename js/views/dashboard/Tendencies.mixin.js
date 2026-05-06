/**
 * DashboardView — Tendencies mixin (tab "Tendencias") · V2 narrativa.
 *
 * Diseño storytelling, no BI tool. La pregunta que responde:
 *   "¿Qué está en tendencia esta semana que mi marca debería usar?"
 *
 * Estructura visual:
 *   1. Hero narrativo                — 1 frase grande generada de los datos
 *   2. Bubble pack "Lo que vibra"    — temas + tonos + intents en burbujas
 *   3. Lo que tu audiencia busca     — cards conversacionales con CTA
 *   4. Marcas emergentes             — cards aprobar/rechazar (solo si hay)
 *   5. El mercado habla de…          — 2-3 noticias top + lexicon emergente
 *   6. (collapsable) Detalles        — datos raw para power users
 *
 * Usa el design system del proyecto: --bg-primary, --bg-secondary,
 * --brand-gradient, --warm-1, --color-success, --color-info, etc.
 *
 * Aplica sobre DashboardView.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {

    /* ── Entry point ─────────────────────────────────────────── */
    async _renderTendencies(body) {
      if (!this._tendInit) {
        this._tendData    = null;
        this._tendService = null;
        this._tendWindow  = 30;
        this._tendBody    = null;
        this._tendInit    = true;
      }
      this._tendBody = body;

      body.innerHTML = this._buildTendenciesSkeleton();
      await Promise.allSettled([
        this._ensureTendenciasService(),
      ]);

      if (!this._tendData && this._tendService) {
        this._tendData = await this._tendService.loadAll({
          windowDays: this._tendWindow,
        });
      }

      this._injectTendenciesCSS();
      body.innerHTML = this._buildTendenciesHTML(this._tendData);
      this._wireTendenciesEvents();
    },

    async _ensureTendenciasService() {
      if (this._tendService) return;
      if (!window.TendenciasDataService) {
        try {
          await this.loadScript('/js/services/TendenciasDataService.js', 'TendenciasDataService', 6000);
        } catch (_) { return; }
      }
      if (!this._supabase || !this._orgId) return;
      try {
        this._tendService = await new window.TendenciasDataService().init(this._supabase, this._orgId);
      } catch (e) {
        console.warn('[Tendencies] init service:', e);
      }
    },

    /* ── Skeleton ────────────────────────────────────────────── */
    _buildTendenciesSkeleton() {
      return `
        <div class="tnd-page">
          <div class="tnd-skeleton tnd-skel-hero"></div>
          <div class="tnd-skeleton tnd-skel-bubbles"></div>
          <div class="tnd-skeleton tnd-skel-section"></div>
          <div class="tnd-skeleton tnd-skel-section"></div>
        </div>`;
    },

    /* ── HTML principal ──────────────────────────────────────── */
    _buildTendenciesHTML(d) {
      if (!d) {
        return `<div class="tnd-page"><div class="tnd-empty-large">No se pudo cargar el servicio de Tendencias.</div></div>`;
      }

      const k        = d.kpis?.data?.kpis || {};
      const audience = d.audience?.data || {};
      const targeted = d.targeted?.data || {};
      const emerging = d.emerging?.data || {};
      const niche    = d.niche?.data    || {};
      const lexicon  = d.lexicon?.data  || {};

      return `
        <div class="tnd-page">
          ${this._buildTndHero(d)}
          ${this._buildTndBubbles(niche, audience, lexicon)}
          ${this._buildTndAudienceSearches(audience)}
          ${this._buildTndEmerging(emerging)}
          ${this._buildTndMarketTalks(targeted, lexicon)}
          ${this._buildTndDetailsCollapsed(d, k)}
        </div>`;
    },

    /* ── 1. Hero narrativo ──────────────────────────────────── */
    _buildTndHero(d) {
      const k        = d.kpis?.data?.kpis || {};
      const audience = d.audience?.data || {};
      const top      = (audience.top_high_intent || [])[0];
      const topGeo   = (audience.by_geo || [])[0];
      const emerging = d.emerging?.data?.pending || [];
      const lex      = d.lexicon?.data?.recent_approved || [];

      // Construye 1 frase principal a partir de los datos. Cae a fallbacks
      // si no hay top_high_intent, top_geo, etc.
      let mainLine;
      if (top?.discovered_term) {
        const intent = top.commercial_intent || 'media';
        const geo    = top.geo || (topGeo?.geo || '—');
        mainLine = `
          Tu audiencia está buscando
          <em class="tnd-hero-em">"${this._esc(top.discovered_term)}"</em>
          ${geo !== '—' ? `en <span class="tnd-hero-geo">${this._esc(geo)}</span>,` : ','}
          con <span class="tnd-hero-intent tnd-hero-intent--${intent}">intención ${this._esc(intent)}</span>.
        `;
      } else if (k.audienceSignals > 0) {
        mainLine = `Capturamos <em class="tnd-hero-em">${k.audienceSignals} señales de audiencia</em> esta ventana de tiempo.`;
      } else {
        mainLine = `Aún estamos escuchando el mercado para tu marca. Vuelve en unas horas.`;
      }

      // Subtítulo: contexto adicional en lenguaje natural
      const bits = [];
      if (k.audienceSignals)        bits.push(`${k.audienceSignals} señales`);
      if (lex[0]?.category_value)   bits.push(`tono dominante: <strong>${this._esc(lex[0].category_value)}</strong>`);
      if (emerging.length)          bits.push(`<strong>${emerging.length}</strong> ${emerging.length === 1 ? 'marca' : 'marcas'} emergiendo`);
      if (k.targetedTrends)         bits.push(`${k.targetedTrends} noticias capturadas`);
      const subtitle = bits.length ? bits.join(' · ') : 'Refresca en unos minutos para ver más datos.';

      return `
        <header class="tnd-hero">
          <div class="tnd-hero-eyebrow">
            <span class="tnd-hero-eyebrow-dot"></span>
            Tendencias · últimos ${this._tendWindow} días
          </div>
          <h1 class="tnd-hero-title">${mainLine}</h1>
          <p class="tnd-hero-subtitle">${subtitle}</p>
          <div class="tnd-hero-actions">
            <div class="tnd-window-tabs" role="tablist">
              ${[7, 30, 90].map(n => `
                <button type="button" class="tnd-window-tab ${this._tendWindow === n ? 'is-active' : ''}" data-window="${n}">${n}d</button>
              `).join('')}
            </div>
            <button type="button" class="tnd-refresh" id="tndRefreshBtn" title="Recargar">
              <i class="fas fa-rotate"></i>
            </button>
          </div>
        </header>`;
    },

    /* ── 2. Bubble pack — lo que vibra ──────────────────────── */
    _buildTndBubbles(niche, audience, lexicon) {
      // Combinar fuentes en una sola lista de "items" con type, label, value, color.
      const items = [];

      // Niche keywords (top 6)
      (niche.top_velocity || []).slice(0, 6).forEach(k => {
        items.push({
          type: 'keyword',
          label: k.keyword,
          value: Number(k.velocity_score) || 1,
          tone: 'cool', // cyan
        });
      });

      // Tonos del lexicon recent_approved (top 4 únicos por category_value)
      const seenTones = new Set();
      (lexicon.recent_approved || []).forEach(l => {
        if (l.dimension !== 'tone' && l.dimension !== 'mood') return;
        if (seenTones.has(l.category_value)) return;
        seenTones.add(l.category_value);
        if (items.length < 14) {
          items.push({
            type: 'tone',
            label: l.category_value,
            value: 6, // peso moderado
            tone: 'warm', // naranja brand
          });
        }
      });

      // Intent categories (top 3)
      (audience.by_intent || []).slice(0, 4).forEach(r => {
        if (items.length >= 16) return;
        const label = `${r.intent_category} · ${r.commercial_intent}`;
        items.push({
          type: 'intent',
          label,
          value: Math.max(2, Math.log10(Number(r.total) + 1) * 4),
          tone: r.commercial_intent === 'high' ? 'success' : (r.commercial_intent === 'medium' ? 'warning' : 'neutral'),
        });
      });

      if (!items.length) {
        return `
          <section class="tnd-section tnd-bubbles-section">
            <h2 class="tnd-section-title">Lo que vibra ahora</h2>
            <p class="tnd-section-sub">Temas y tonos dominantes en tu nicho</p>
            <div class="tnd-empty">Aún no detectamos suficiente actividad — vuelve en unas horas.</div>
          </section>`;
      }

      // Calcular tamaño en px proporcional al value (40-140 px diameter)
      const max = Math.max(...items.map(i => i.value));
      const min = Math.min(...items.map(i => i.value));
      const range = Math.max(1, max - min);
      const sizeFor = (v) => Math.round(56 + (v - min) / range * 100); // 56..156

      // Asignar colores del brand gradient en orden
      const toneColors = {
        cool:    { bg: 'rgba(0, 231, 255, 0.18)',  border: 'rgba(0, 231, 255, 0.45)',  text: '#7be9ff' },
        warm:    { bg: 'rgba(255, 101, 0, 0.18)',  border: 'rgba(255, 101, 0, 0.50)',  text: '#ffac6e' },
        success: { bg: 'rgba(0, 214, 20, 0.18)',   border: 'rgba(0, 214, 20, 0.45)',   text: '#7ee896' },
        warning: { bg: 'rgba(255, 229, 0, 0.16)',  border: 'rgba(255, 229, 0, 0.45)',  text: '#ffe97a' },
        neutral: { bg: 'rgba(212, 209, 216, 0.06)', border: 'rgba(212, 209, 216, 0.20)', text: 'rgba(212, 209, 216, 0.75)' },
      };

      // Mezclar items para que no agrupados por tipo (visual más natural)
      const shuffled = [...items].sort((a, b) => b.value - a.value);

      const bubbles = shuffled.map((it, i) => {
        const size = sizeFor(it.value);
        const c = toneColors[it.tone] || toneColors.neutral;
        const fontSize = Math.max(10, Math.min(15, size / 9));
        return `
          <div class="tnd-bubble" style="
            width:${size}px;height:${size}px;
            background:${c.bg};
            border-color:${c.border};
            color:${c.text};
            font-size:${fontSize}px;
            animation-delay:${i * 60}ms;
          " title="${this._esc(it.type)}: ${this._esc(it.label)}">
            <span class="tnd-bubble-label">${this._esc(it.label)}</span>
          </div>`;
      }).join('');

      return `
        <section class="tnd-section tnd-bubbles-section">
          <header class="tnd-section-head">
            <h2 class="tnd-section-title">Lo que vibra ahora</h2>
            <p class="tnd-section-sub">Temas, tonos e intenciones que dominan en tu nicho · tamaño según volumen</p>
          </header>
          <div class="tnd-bubbles-stage">
            ${bubbles}
          </div>
          <div class="tnd-bubbles-legend">
            <span class="tnd-legend-dot" style="background:${toneColors.cool.bg};border-color:${toneColors.cool.border}"></span> palabras
            <span class="tnd-legend-dot" style="background:${toneColors.warm.bg};border-color:${toneColors.warm.border}"></span> tonos
            <span class="tnd-legend-dot" style="background:${toneColors.success.bg};border-color:${toneColors.success.border}"></span> alta intención
            <span class="tnd-legend-dot" style="background:${toneColors.warning.bg};border-color:${toneColors.warning.border}"></span> media
          </div>
        </section>`;
    },

    /* ── 3. Lo que tu audiencia busca ───────────────────────── */
    _buildTndAudienceSearches(audience) {
      const items = audience.top_high_intent || [];
      if (!items.length) return '';

      // Dedup por discovered_term + geo
      const seen = new Set();
      const dedup = items.filter(it => {
        const k = `${it.discovered_term}|${it.geo}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, 5);

      const cards = dedup.map((it, i) => {
        const intent = it.commercial_intent || '—';
        const icon = intent === 'high' ? '🔥' : (intent === 'medium' ? '⚡' : '💡');
        const intentLabel = intent === 'high' ? 'alta intención' : intent === 'medium' ? 'intención media' : 'intención baja';
        return `
          <article class="tnd-search-card" style="animation-delay:${i * 80}ms">
            <div class="tnd-search-icon">${icon}</div>
            <div class="tnd-search-body">
              <div class="tnd-search-term">${this._esc(it.discovered_term || '—')}</div>
              <div class="tnd-search-meta">
                <span class="tnd-meta-pill tnd-meta-pill--geo">${this._esc(it.geo || '—')}</span>
                <span class="tnd-meta-pill tnd-meta-pill--${intent}">${intentLabel}</span>
                ${it.intent_category ? `<span class="tnd-meta-tag">${this._esc(it.intent_category)}</span>` : ''}
              </div>
            </div>
            <button type="button" class="tnd-search-cta" data-action="create-content" data-term="${this._esc(it.discovered_term || '')}">
              Crear contenido
              <i class="fas fa-arrow-right"></i>
            </button>
          </article>`;
      }).join('');

      return `
        <section class="tnd-section">
          <header class="tnd-section-head">
            <h2 class="tnd-section-title">Lo que tu audiencia está buscando</h2>
            <p class="tnd-section-sub">Consultas reales en Google y YouTube · ordenadas por intención comercial</p>
          </header>
          <div class="tnd-search-cards">${cards}</div>
        </section>`;
    },

    /* ── 4. Marcas emergentes ───────────────────────────────── */
    _buildTndEmerging(emerging) {
      const pending  = emerging.pending  || [];
      const approved = emerging.approved || [];
      if (!pending.length && !approved.length) return '';

      const pendingCards = pending.length ? pending.slice(0, 6).map((c, i) => `
        <article class="tnd-emerg-card" style="animation-delay:${i * 80}ms" data-cid="${this._esc(c.id)}">
          <div class="tnd-emerg-card-head">
            <div>
              <h3 class="tnd-emerg-name">${this._esc(c.candidate_name || '—')}</h3>
              <div class="tnd-emerg-niche">${this._esc(c.niche || 'sin nicho')}</div>
            </div>
            <span class="tnd-emerg-detection">${c.detection_count || 0} detecciones</span>
          </div>
          <div class="tnd-emerg-meta">
            <i class="fas fa-globe-americas"></i>
            ${(c.detected_geos || []).join(', ') || '—'}
          </div>
          <div class="tnd-emerg-actions">
            <button type="button" class="tnd-btn tnd-btn--approve" data-action="approve-emerg" data-id="${this._esc(c.id)}">
              <i class="fas fa-check"></i> Aprobar
            </button>
            <button type="button" class="tnd-btn tnd-btn--reject" data-action="reject-emerg" data-id="${this._esc(c.id)}">
              <i class="fas fa-xmark"></i> Rechazar
            </button>
          </div>
        </article>`).join('') : '';

      const approvedRow = approved.length ? `
        <div class="tnd-emerg-approved-strip">
          <span class="tnd-emerg-approved-label"><i class="fas fa-check-circle"></i> Aprobadas:</span>
          ${approved.slice(0, 5).map(c => `<span class="tnd-emerg-approved-pill">${this._esc(c.candidate_name)}</span>`).join('')}
        </div>` : '';

      return `
        <section class="tnd-section">
          <header class="tnd-section-head">
            <h2 class="tnd-section-title">Marcas emergiendo en tu categoría</h2>
            <p class="tnd-section-sub">Competidores nuevos detectados antes de que sean masivos · 1 click los provisiona en multi-plataforma</p>
          </header>
          ${pending.length ? `<div class="tnd-emerg-grid">${pendingCards}</div>` : `<div class="tnd-empty">No hay marcas pendientes ahora.</div>`}
          ${approvedRow}
        </section>`;
    },

    /* ── 5. El mercado habla ────────────────────────────────── */
    _buildTndMarketTalks(targeted, lexicon) {
      const news = (targeted.top_by_match || []).filter(n => n.vera_safe).slice(0, 3);
      const newWords = (lexicon.pending || []).slice(0, 4);

      if (!news.length && !newWords.length) return '';

      const newsItems = news.length ? news.map((n, i) => `
        <article class="tnd-talk-row tnd-talk-row--news" style="animation-delay:${i * 70}ms">
          <div class="tnd-talk-icon"><i class="fas fa-newspaper"></i></div>
          <div class="tnd-talk-body">
            <a href="${this._esc(n.url || '#')}" target="_blank" rel="noopener" class="tnd-talk-title">${this._esc(n.title || 'Sin título')}</a>
            <div class="tnd-talk-meta">
              match <strong>${Number(n.match_strength || 0).toFixed(2)}</strong>
              <span class="tnd-meta-sep">·</span>
              <em>${this._esc(n.trigger_keyword || '')}</em>
              <span class="tnd-meta-sep">·</span>
              ${this._esc(n.geo || '')}
            </div>
          </div>
        </article>`).join('') : '';

      const wordsItems = newWords.length ? newWords.map((w, i) => `
        <article class="tnd-talk-row tnd-talk-row--word" style="animation-delay:${(news.length + i) * 70}ms">
          <div class="tnd-talk-icon"><i class="fas fa-spell-check"></i></div>
          <div class="tnd-talk-body">
            <div class="tnd-talk-title">Nueva palabra: <em>${this._esc(w.word)}</em></div>
            <div class="tnd-talk-meta">
              dimensión <strong>${this._esc(w.dimension)}</strong>
              ${w.category_value ? `<span class="tnd-meta-sep">·</span> ${this._esc(w.category_value)}` : ''}
              <span class="tnd-meta-sep">·</span>
              fuente: ${this._esc(w.source || 'auto')}
            </div>
          </div>
        </article>`).join('') : '';

      return `
        <section class="tnd-section">
          <header class="tnd-section-head">
            <h2 class="tnd-section-title">El mercado habla de…</h2>
            <p class="tnd-section-sub">Noticias top relacionadas con tu marca y vocabulario emergente</p>
          </header>
          <div class="tnd-talks">
            ${newsItems}
            ${wordsItems}
          </div>
        </section>`;
    },

    /* ── 6. Detalles colapsables ────────────────────────────── */
    _buildTndDetailsCollapsed(d, k) {
      const audience = d.audience?.data || {};
      const targeted = d.targeted?.data || {};
      const niche    = d.niche?.data    || {};
      const lexicon  = d.lexicon?.data  || {};

      // KPIs raw
      const kpiRow = (label, value) => `
        <div class="tnd-detail-kpi">
          <div class="tnd-detail-kpi-value">${this._fmtNum(value)}</div>
          <div class="tnd-detail-kpi-label">${this._esc(label)}</div>
        </div>`;

      // Breakdown helpers
      const breakdownList = (items, getLabel, getValue) => items.length
        ? `<ul class="tnd-detail-list">${items.slice(0, 8).map(i => `
            <li><span>${this._esc(getLabel(i))}</span><strong>${this._fmtNum(getValue(i))}</strong></li>
          `).join('')}</ul>`
        : `<div class="tnd-empty tnd-empty--small">Sin datos</div>`;

      return `
        <details class="tnd-details">
          <summary class="tnd-details-summary">
            <i class="fas fa-chevron-right"></i>
            <span>Ver detalles técnicos</span>
            <span class="tnd-details-meta">${this._fmtNum(k.audienceSignals + k.targetedTrends)} señales · ${this._fmtNum(k.topicsTracked)} keywords · ${this._fmtNum(k.lexiconApproved)} términos</span>
          </summary>
          <div class="tnd-details-body">

            <div class="tnd-detail-grid tnd-detail-grid--kpis">
              ${kpiRow('Topics distintos', k.topicsTracked)}
              ${kpiRow('Señales audiencia', k.audienceSignals)}
              ${kpiRow('Trends capturados', k.targetedTrends)}
              ${kpiRow('Marcas pending', k.emergingBrandsPending)}
              ${kpiRow('Velocidad 24h', k.velocityLast24h)}
              ${kpiRow('Lexicón aprobado', k.lexiconApproved)}
              ${kpiRow('Lexicón pendiente', k.lexiconPending)}
            </div>

            <div class="tnd-detail-grid tnd-detail-grid--3">
              <div class="tnd-detail-card">
                <h4>Audiencia · por geo</h4>
                ${breakdownList(audience.by_geo || [], i => i.geo, i => i.total)}
              </div>
              <div class="tnd-detail-card">
                <h4>Audiencia · por fuente</h4>
                ${breakdownList(audience.by_source || [], i => i.source, i => i.total)}
              </div>
              <div class="tnd-detail-card">
                <h4>Targeted · por origen</h4>
                ${breakdownList(targeted.by_origin || [], i => i.keyword_origin, i => i.total)}
              </div>
              <div class="tnd-detail-card">
                <h4>Niche · por red social</h4>
                ${breakdownList(niche.by_source || [], i => i.source, i => i.total)}
              </div>
              <div class="tnd-detail-card">
                <h4>Lexicón · por dimensión</h4>
                ${breakdownList(lexicon.by_dimension || [], i => i.dimension, i => i.total)}
              </div>
              <div class="tnd-detail-card">
                <h4>Audiencia · por intención</h4>
                ${breakdownList(audience.by_intent || [], i => `${i.intent_category} · ${i.commercial_intent}`, i => i.total)}
              </div>
            </div>

          </div>
        </details>`;
    },

    /* ── Helpers ─────────────────────────────────────────────── */
    _fmtNum(n) {
      const v = Number(n);
      if (n == null || !isFinite(v)) return '—';
      if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
      if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'k';
      return String(v);
    },

    /* ── Eventos ─────────────────────────────────────────────── */
    _wireTendenciesEvents() {
      const refreshBtn = document.getElementById('tndRefreshBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
          refreshBtn.classList.add('is-spinning');
          this._tendData = null;
          await this._renderTendencies(this._tendBody);
        });
      }

      // Window tabs (7d / 30d / 90d)
      document.querySelectorAll('.tnd-window-tab').forEach(btn => {
        btn.addEventListener('click', async () => {
          const w = Number(btn.dataset.window) || 30;
          if (w === this._tendWindow) return;
          this._tendWindow = w;
          this._tendData = null;
          await this._renderTendencies(this._tendBody);
        });
      });

      // Acciones (delegación a futuro endpoint del ai-engine; hoy stub)
      document.querySelectorAll('[data-action="approve-emerg"], [data-action="reject-emerg"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action === 'approve-emerg' ? 'aprobar' : 'rechazar';
          alert(`${action} marca emergente — endpoint del ai-engine pendiente de cablear`);
        });
      });

      document.querySelectorAll('[data-action="create-content"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const term = btn.dataset.term || '';
          alert(`Crear contenido para "${term}" — flujo a Studio pendiente de cablear`);
        });
      });
    },

    /* ── CSS ─────────────────────────────────────────────────── */
    _injectTendenciesCSS() {
      if (document.getElementById('tnd-css')) {
        // Si cambia algo, removemos para reinyectar la última versión
        document.getElementById('tnd-css').remove();
      }
      const css = `
        /* ═══ Tendencies Dashboard V2 — narrative & visual ═══ */
        .tnd-page {
          max-width: 1280px;
          margin: 0 auto;
          padding: 24px 16px 64px;
          color: var(--text-primary, #D4D1D8);
        }

        /* ── Skeleton ── */
        .tnd-skeleton {
          background: linear-gradient(90deg,
            rgba(255,255,255,0.04) 0%,
            rgba(255,255,255,0.08) 50%,
            rgba(255,255,255,0.04) 100%);
          background-size: 200% 100%;
          animation: tndShimmer 1.4s ease-in-out infinite;
          border-radius: var(--radius-lg, 16px);
          margin-bottom: 24px;
        }
        .tnd-skel-hero    { height: 200px; }
        .tnd-skel-bubbles { height: 320px; }
        .tnd-skel-section { height: 280px; }
        @keyframes tndShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        /* ── Hero narrativo ── */
        .tnd-hero {
          padding: 32px 8px 28px;
          border-bottom: 1px solid var(--border-divider, #242424);
          margin-bottom: 40px;
          animation: tndFadeIn .5s ease both;
        }
        .tnd-hero-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted, rgba(212,209,216,0.6));
          margin-bottom: 14px;
        }
        .tnd-hero-eyebrow-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--color-success, #00d614);
          box-shadow: 0 0 8px rgba(0, 214, 20, .55);
          animation: tndPulse 2s ease-in-out infinite;
        }
        @keyframes tndPulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .tnd-hero-title {
          margin: 0;
          font-size: clamp(24px, 3.4vw, 38px);
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.25;
          color: #fff;
        }
        .tnd-hero-em {
          font-style: normal;
          background: var(--brand-gradient-1, linear-gradient(90deg,#ff0000,#ff6500,#ffe500));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-weight: 700;
        }
        .tnd-hero-geo {
          background: var(--brand-gradient-2, linear-gradient(90deg,#9acc00,#00d614,#00e7ff));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-weight: 700;
        }
        .tnd-hero-intent {
          display: inline-block;
          padding: 2px 12px;
          border-radius: var(--radius-pill, 9999px);
          font-size: 0.6em;
          font-weight: 600;
          letter-spacing: 0.04em;
          vertical-align: middle;
          transform: translateY(-3px);
          text-transform: uppercase;
        }
        .tnd-hero-intent--high   { background: rgba(0, 214, 20, .15); color: #7ee896; }
        .tnd-hero-intent--medium { background: rgba(255, 229, 0, .15); color: #ffe97a; }
        .tnd-hero-intent--low    { background: rgba(212, 209, 216, .1); color: var(--text-muted); }
        .tnd-hero-subtitle {
          margin: 14px 0 22px;
          font-size: 14px;
          color: var(--text-secondary, rgba(212,209,216,0.85));
          line-height: 1.6;
        }
        .tnd-hero-subtitle strong { color: var(--text-primary, #D4D1D8); }
        .tnd-hero-actions { display: flex; gap: 10px; align-items: center; }
        .tnd-window-tabs {
          display: inline-flex;
          background: var(--white-8, rgba(255,255,255,.06));
          border: 1px solid var(--border-divider, #242424);
          border-radius: var(--radius-sm, 8px);
          padding: 3px;
          gap: 2px;
        }
        .tnd-window-tab {
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .tnd-window-tab:hover { color: var(--text-primary); }
        .tnd-window-tab.is-active {
          background: var(--white-10, rgba(255,255,255,.1));
          color: #fff;
        }
        .tnd-refresh {
          width: 34px; height: 34px;
          border-radius: var(--radius-sm, 8px);
          border: 1px solid var(--border-divider, #242424);
          background: var(--white-8, rgba(255,255,255,.06));
          color: var(--text-secondary);
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: color .15s, background .15s, transform .4s;
        }
        .tnd-refresh:hover { color: #fff; background: var(--white-15, rgba(255,255,255,.15)); }
        .tnd-refresh.is-spinning i { animation: tndSpin .6s linear infinite; }
        @keyframes tndSpin { to { transform: rotate(360deg); } }

        /* ── Sections genéricas ── */
        .tnd-section { margin-bottom: 56px; animation: tndFadeIn .6s ease both; }
        .tnd-section-head { margin-bottom: 24px; padding: 0 4px; }
        .tnd-section-title {
          margin: 0;
          font-size: 22px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .tnd-section-sub {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--text-muted, rgba(212,209,216,0.6));
        }
        .tnd-empty {
          padding: 40px 16px;
          text-align: center;
          color: var(--text-muted);
          font-size: 13px;
          background: var(--bg-secondary, #141517);
          border-radius: var(--radius-lg, 16px);
        }
        .tnd-empty--small { padding: 16px 12px; font-size: 12px; }
        .tnd-empty-large { padding: 80px 16px; text-align: center; color: var(--text-muted); }

        @keyframes tndFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

        /* ── Bubble pack ── */
        .tnd-bubbles-section .tnd-section-head { margin-bottom: 16px; }
        .tnd-bubbles-stage {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 32px 16px;
          min-height: 320px;
          background:
            radial-gradient(ellipse at top, rgba(255, 101, 0, .04), transparent 60%),
            radial-gradient(ellipse at bottom, rgba(0, 231, 255, .04), transparent 60%),
            var(--bg-secondary, #141517);
          border: 1px solid var(--border-divider, #242424);
          border-radius: var(--radius-lg, 16px);
        }
        .tnd-bubble {
          border-radius: 50%;
          border: 1.5px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          font-weight: 600;
          letter-spacing: -0.01em;
          text-align: center;
          line-height: 1.15;
          transition: transform .25s ease, box-shadow .25s ease;
          cursor: default;
          opacity: 0;
          animation: tndBubbleIn .6s cubic-bezier(.34,1.56,.64,1) forwards;
          backdrop-filter: blur(2px);
        }
        .tnd-bubble:hover {
          transform: scale(1.08);
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          z-index: 2;
        }
        .tnd-bubble-label {
          word-break: break-word;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
        }
        @keyframes tndBubbleIn {
          0%   { opacity: 0; transform: scale(.5); }
          100% { opacity: 1; transform: scale(1); }
        }
        .tnd-bubbles-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          justify-content: center;
          margin-top: 14px;
          font-size: 12px;
          color: var(--text-muted);
        }
        .tnd-legend-dot {
          display: inline-block;
          width: 10px; height: 10px;
          border-radius: 50%;
          border: 1px solid;
          margin-right: 4px;
          vertical-align: middle;
        }

        /* ── Search cards ── */
        .tnd-search-cards { display: flex; flex-direction: column; gap: 12px; }
        .tnd-search-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px 22px;
          background: var(--bg-secondary, #141517);
          border: 1px solid var(--border-divider, #242424);
          border-radius: var(--radius-lg, 16px);
          transition: all .2s ease;
          opacity: 0;
          animation: tndFadeIn .5s ease forwards;
        }
        .tnd-search-card:hover {
          border-color: rgba(255,255,255,0.15);
          background: var(--bg-card, #18181c);
          transform: translateX(4px);
        }
        .tnd-search-icon {
          font-size: 28px;
          flex-shrink: 0;
          width: 48px; height: 48px;
          display: flex; align-items: center; justify-content: center;
          background: var(--white-8, rgba(255,255,255,.06));
          border-radius: 12px;
        }
        .tnd-search-body { flex: 1; min-width: 0; }
        .tnd-search-term {
          font-size: 16px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 6px;
          line-height: 1.3;
        }
        .tnd-search-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .tnd-meta-pill {
          display: inline-block;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          border-radius: var(--radius-pill, 9999px);
          text-transform: uppercase;
        }
        .tnd-meta-pill--geo { background: var(--white-8); color: var(--text-secondary); }
        .tnd-meta-pill--high { background: rgba(0, 214, 20, .15); color: #7ee896; }
        .tnd-meta-pill--medium { background: rgba(255, 229, 0, .15); color: #ffe97a; }
        .tnd-meta-pill--low { background: var(--white-8); color: var(--text-muted); }
        .tnd-meta-tag {
          font-size: 11px;
          color: var(--text-muted);
          font-style: italic;
        }
        .tnd-search-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, var(--warm-1, #ff6500), var(--warm-2, #ff0000));
          border: none;
          border-radius: var(--radius-sm, 8px);
          cursor: pointer;
          flex-shrink: 0;
          transition: all .2s ease;
          opacity: 0.92;
        }
        .tnd-search-cta:hover { opacity: 1; transform: translateX(2px); box-shadow: 0 4px 16px rgba(255, 101, 0, .35); }
        .tnd-search-cta i { font-size: 11px; }

        /* ── Emerging brands ── */
        .tnd-emerg-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
        }
        .tnd-emerg-card {
          padding: 18px 20px;
          background: var(--bg-secondary, #141517);
          border: 1px solid var(--border-divider, #242424);
          border-radius: var(--radius-lg, 16px);
          opacity: 0;
          animation: tndFadeIn .5s ease forwards;
          transition: border-color .2s, transform .2s;
        }
        .tnd-emerg-card:hover {
          border-color: rgba(255,255,255,0.15);
          transform: translateY(-2px);
        }
        .tnd-emerg-card-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 12px;
        }
        .tnd-emerg-name {
          margin: 0;
          font-size: 17px;
          font-weight: 600;
          color: #fff;
          text-transform: capitalize;
          line-height: 1.3;
        }
        .tnd-emerg-niche {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .tnd-emerg-detection {
          font-size: 11px;
          font-weight: 600;
          color: var(--color-info, #00e7ff);
          background: rgba(0, 231, 255, .1);
          padding: 4px 10px;
          border-radius: var(--radius-pill, 9999px);
          flex-shrink: 0;
        }
        .tnd-emerg-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }
        .tnd-emerg-meta i { color: var(--text-muted); }
        .tnd-emerg-actions { display: flex; gap: 8px; }
        .tnd-btn {
          flex: 1;
          padding: 9px 12px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
          border: 1px solid;
          border-radius: var(--radius-sm, 8px);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: transparent;
          transition: all .15s ease;
        }
        .tnd-btn i { font-size: 10px; }
        .tnd-btn--approve {
          color: var(--color-success, #00d614);
          border-color: rgba(0, 214, 20, .35);
        }
        .tnd-btn--approve:hover {
          background: rgba(0, 214, 20, .15);
          border-color: var(--color-success);
        }
        .tnd-btn--reject {
          color: var(--color-error, #ff0000);
          border-color: rgba(255, 0, 0, .35);
        }
        .tnd-btn--reject:hover {
          background: rgba(255, 0, 0, .12);
          border-color: var(--color-error);
        }
        .tnd-emerg-approved-strip {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 18px;
          padding: 14px 18px;
          background: rgba(0, 214, 20, .04);
          border: 1px solid rgba(0, 214, 20, .12);
          border-radius: var(--radius-sm, 8px);
        }
        .tnd-emerg-approved-label {
          font-size: 12px;
          font-weight: 600;
          color: #7ee896;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .tnd-emerg-approved-pill {
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-primary);
          background: var(--white-8);
          border-radius: var(--radius-pill, 9999px);
          text-transform: capitalize;
        }

        /* ── Talks (news + lexicon) ── */
        .tnd-talks { display: flex; flex-direction: column; gap: 8px; }
        .tnd-talk-row {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 18px;
          background: var(--bg-secondary, #141517);
          border: 1px solid var(--border-divider, #242424);
          border-radius: var(--radius-md, 12px);
          opacity: 0;
          animation: tndFadeIn .5s ease forwards;
          transition: background .15s, border-color .15s;
        }
        .tnd-talk-row:hover { background: var(--bg-card, #18181c); border-color: rgba(255,255,255,0.12); }
        .tnd-talk-icon {
          width: 34px; height: 34px;
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px;
          font-size: 14px;
        }
        .tnd-talk-row--news .tnd-talk-icon { background: rgba(0, 231, 255, .1); color: var(--color-info, #00e7ff); }
        .tnd-talk-row--word .tnd-talk-icon { background: rgba(255, 101, 0, .1); color: var(--warm-1, #ff6500); }
        .tnd-talk-body { flex: 1; min-width: 0; }
        .tnd-talk-title {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #D4D1D8);
          line-height: 1.4;
          text-decoration: none;
          margin-bottom: 4px;
        }
        a.tnd-talk-title:hover { color: #fff; text-decoration: underline; }
        .tnd-talk-title em { font-style: normal; color: #fff; font-weight: 600; }
        .tnd-talk-meta {
          font-size: 11px;
          color: var(--text-muted);
          letter-spacing: 0.02em;
        }
        .tnd-talk-meta strong { color: var(--text-secondary); font-weight: 600; }
        .tnd-talk-meta em { font-style: normal; color: var(--text-secondary); font-weight: 500; }
        .tnd-meta-sep { margin: 0 6px; opacity: .4; }

        /* ── Details (collapsable) ── */
        .tnd-details {
          margin-top: 32px;
          background: var(--bg-secondary, #141517);
          border: 1px solid var(--border-divider, #242424);
          border-radius: var(--radius-lg, 16px);
          overflow: hidden;
        }
        .tnd-details-summary {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          list-style: none;
          transition: background .15s;
        }
        .tnd-details-summary::-webkit-details-marker { display: none; }
        .tnd-details-summary:hover { background: var(--white-5, rgba(255,255,255,.04)); color: var(--text-primary); }
        .tnd-details-summary i {
          transition: transform .2s ease;
          font-size: 11px;
          color: var(--text-muted);
        }
        .tnd-details[open] .tnd-details-summary i { transform: rotate(90deg); }
        .tnd-details-meta {
          margin-left: auto;
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 500;
        }
        .tnd-details-body {
          padding: 8px 20px 24px;
          border-top: 1px solid var(--border-divider, #242424);
        }
        .tnd-detail-grid--kpis {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 8px;
          margin: 16px 0 24px;
        }
        .tnd-detail-kpi {
          padding: 12px 14px;
          background: var(--white-5, rgba(255,255,255,.04));
          border-radius: var(--radius-sm, 8px);
        }
        .tnd-detail-kpi-value { font-size: 20px; font-weight: 600; color: #fff; line-height: 1; }
        .tnd-detail-kpi-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
        .tnd-detail-grid--3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        @media (max-width: 1024px) { .tnd-detail-grid--3 { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px)  { .tnd-detail-grid--3 { grid-template-columns: 1fr; } }
        .tnd-detail-card {
          padding: 14px 16px;
          background: var(--white-5);
          border-radius: var(--radius-sm, 8px);
        }
        .tnd-detail-card h4 {
          margin: 0 0 10px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .tnd-detail-list { list-style: none; margin: 0; padding: 0; }
        .tnd-detail-list li {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 12px;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-divider);
        }
        .tnd-detail-list li:last-child { border-bottom: none; }
        .tnd-detail-list li strong { color: #fff; font-weight: 600; }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .tnd-page { padding: 16px 12px 48px; }
          .tnd-section { margin-bottom: 40px; }
          .tnd-search-card { flex-direction: column; align-items: stretch; }
          .tnd-search-cta { width: 100%; justify-content: center; }
        }
      `;
      const style = document.createElement('style');
      style.id = 'tnd-css';
      style.textContent = css;
      document.head.appendChild(style);
    },

  });
})();
