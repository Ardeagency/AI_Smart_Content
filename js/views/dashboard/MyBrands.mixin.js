/**
 * DashboardView — MyBrands mixin (tab "Mi Marca").
 *
 * Filosofía (memorias feedback_app_es_consultor_no_dashboard +
 * feedback_dashboards_show_vera_intelligence):
 *   AI Smart Content NO es dashboard de pauta. Es consultor estratégico.
 *   3 bloques por sección: qué falla y POR QUÉ + qué funciona y POR QUÉ +
 *   cómo combinar/optimizar. Métricas son evidencia, no historia.
 *
 * Layout:
 *   1. Gauge de Salud de la Marca (hero) — score + breakdown causal + top gaps
 *   2. Sección "Mis Campañas":
 *      - 🎯 Tu fórmula ganadora (DNA común de winners)
 *      - 🔍 Por qué te está fallando (diagnóstico individual de burners)
 *      - 📋 Brief vs ejecución
 *
 * Servicio: CampanasDataService (6 RPCs paralelas).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const fmt = {
    int:   (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO')),
    money: (n) => (n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('es-CO')),
    pct:   (n, d = 2) => (n == null ? '—' : Number(n).toFixed(d) + '%'),
    num:   (n, d = 2) => (n == null ? '—' : Number(n).toFixed(d)),
  };

  Object.assign(DashboardView.prototype, {

    /* ════════════════════════════════════════════════════════════════
       Entry point
       ════════════════════════════════════════════════════════════════ */
    async _renderMyBrands(body) {
      if (!body) return;
      if (!this._orgId) { this._renderEmptyOrgState(body); return; }

      await this._ensureCampanasService();
      this._renderMyBrandsSkeleton(body);

      try {
        const data = await this._campanasService.loadAll({ windowDays: 365 });
        this._mbCampanasData = data;
        body.innerHTML = this._buildMyBrandsHtml(data);
        this._bindMyBrandsHandlers(body);
      } catch (e) {
        console.error('[MyBrands] loadAll failed:', e);
        body.innerHTML = this._buildMyBrandsErrorHtml(e);
      }
    },

    async _ensureCampanasService() {
      if (this._campanasService) return this._campanasService;
      if (typeof CampanasDataService !== 'function' || !this._supabase) return null;
      this._campanasService = new CampanasDataService();
      await this._campanasService.init(this._supabase, this._orgId);
      return this._campanasService;
    },

    /* ════════════════════════════════════════════════════════════════
       States: skeleton / empty / error
       ════════════════════════════════════════════════════════════════ */
    _renderMyBrandsSkeleton(body) {
      body.innerHTML = `
        <div class="insight-page mb-page">
          <div class="mb-gauge-skeleton skeleton-shimmer"></div>
          <div style="height:1rem;"></div>
          ${BaseView.skeletonGrid ? BaseView.skeletonGrid(5) : ''}
        </div>`;
    },

    _renderEmptyOrgState(body) {
      body.innerHTML = `
        <div class="insight-page" style="text-align:center; padding-top:4rem;">
          <h2 style="margin:0 0 0.5rem; font-size:1.5rem; color:var(--text-primary);">Sin organización activa</h2>
          <p style="color:var(--text-secondary);">Selecciona una marca desde el menú para empezar.</p>
        </div>`;
    },

    _buildMyBrandsErrorHtml(err) {
      const msg = this._esc(err?.message || String(err) || 'Error desconocido');
      return `
        <div class="insight-page" style="text-align:center; padding-top:4rem;">
          <h2 style="margin:0 0 0.5rem; font-size:1.25rem; color:var(--text-primary);">No se pudo cargar el dashboard</h2>
          <p style="color:var(--text-secondary); max-width:520px; margin:0 auto;">${msg}</p>
        </div>`;
    },

    /* ════════════════════════════════════════════════════════════════
       Composición HTML
       ════════════════════════════════════════════════════════════════ */
    _buildMyBrandsHtml(data) {
      return `
        <div class="insight-page" id="mbPage">
          <header class="insight-header">
            <div class="insight-header-left">
              <h1 class="insight-title">Mi Marca</h1>
              <p class="insight-subtitle">Vera analiza tu marca en tiempo real y te dice qué está fallando, por qué, y cómo subir tu salud.</p>
            </div>
          </header>

          ${this._buildHealthGauge(data?.health?.data)}

          ${this._buildCampanasStrategicSection(data)}
        </div>`;
    },

    /* ════════════════════════════════════════════════════════════════
       HERO: Brand Health Gauge
       ════════════════════════════════════════════════════════════════ */
    _buildHealthGauge(h) {
      if (!h || h.score == null) return this._buildHealthEmpty();

      const score    = Number(h.score) || 0;
      const verdict  = h.verdict || 'atencion';
      const band     = h.band || { p25: 50, p50: 65, p75: 80 };
      const gaps     = Array.isArray(h.top_gaps) ? h.top_gaps : [];

      const verdictMeta = {
        elite:     { color: '#6bcf7f', label: 'Élite',       icon: '🏆' },
        saludable: { color: '#4cb37a', label: 'Saludable',   icon: '✅' },
        atencion:  { color: '#e09145', label: 'Atención',    icon: '⚠️' },
        critico:   { color: '#e06464', label: 'Crítico',     icon: '🚨' },
      }[verdict] || { color: '#7c7c7c', label: verdict, icon: '—' };

      const gaugeSvg = this._buildGaugeSvg(score, verdictMeta.color, band);

      return `
        <section class="mb-health-card">
          <div class="mb-health-grid">
            <!-- Gauge column -->
            <div class="mb-health-gauge">
              ${gaugeSvg}
              <div class="mb-health-verdict" style="color:${verdictMeta.color};">
                <span class="mb-health-verdict-icon">${verdictMeta.icon}</span>
                <span class="mb-health-verdict-label">${this._esc(verdictMeta.label)}</span>
              </div>
              <div class="mb-health-band">
                Saludable para tu segmento: <strong>${band.p50}-${band.p75}</strong>
              </div>
              <div class="mb-health-band-method">${this._esc(band.method || '')}</div>
            </div>

            <!-- Diagnóstico column -->
            <div class="mb-health-diagnosis">
              <p class="mb-health-narrative">${this._esc(h.description || '')}</p>

              ${gaps.length > 0 ? `
                <div class="mb-health-gaps">
                  <div class="mb-health-gaps-label">Para subir tu salud, Vera detecta ${gaps.length} gap(s) prioritario(s):</div>
                  ${gaps.map((g, i) => this._buildGapItem(g, i + 1)).join('')}
                </div>
              ` : `
                <div class="mb-health-perfect">
                  ✓ Sin gaps detectados. Mantén la dirección y vigila la próxima auditoría.
                </div>
              `}
            </div>
          </div>
        </section>`;
    },

    /** SVG gauge semicircular con dot al final del arco. */
    _buildGaugeSvg(score, color, band) {
      // Geometría: arco semicircular de radio 80, centro en (100, 100).
      // Arco de 180° → mapeo: 0 = izquierda (angle 180°), 100 = derecha (angle 0°).
      // Coordenadas de los puntos: x = cx + r·cos(angle), y = cy - r·sin(angle).
      const cx = 100, cy = 100, r = 80;
      const pct = Math.max(0, Math.min(100, score)) / 100;
      const angleRad = Math.PI * (1 - pct);            // π → 0 (left → right)
      const endX = cx + r * Math.cos(angleRad);
      const endY = cy - r * Math.sin(angleRad);

      // Marcadores de banda (p25, p50, p75) sobre el arco como ticks
      const tick = (v) => {
        const a = Math.PI * (1 - (Math.max(0, Math.min(100, v)) / 100));
        return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
      };
      const t25 = tick(band.p25);
      const t50 = tick(band.p50);
      const t75 = tick(band.p75);

      // arc path: M (start) A rx ry rotation large-arc sweep (end)
      // start = leftmost = (cx-r, cy) = (20, 100)
      // pct < 1 → sweep usa large-arc-flag = 0 (semicircle nunca cruza más de 180°)
      const startX = cx - r;
      const arcPath = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
      const bgPath  = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

      return `
        <svg class="mb-gauge-svg" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" aria-label="Salud ${score}/100">
          <!-- Background arc -->
          <path d="${bgPath}" stroke="rgba(255,255,255,0.08)" stroke-width="14" stroke-linecap="round" fill="none"/>

          <!-- Tick band marks (p25, p50, p75) -->
          <circle cx="${t25.x.toFixed(2)}" cy="${t25.y.toFixed(2)}" r="2" fill="rgba(255,255,255,0.25)"/>
          <circle cx="${t50.x.toFixed(2)}" cy="${t50.y.toFixed(2)}" r="2" fill="rgba(255,255,255,0.35)"/>
          <circle cx="${t75.x.toFixed(2)}" cy="${t75.y.toFixed(2)}" r="2" fill="rgba(255,255,255,0.5)"/>

          <!-- Progress arc -->
          ${pct > 0 ? `<path d="${arcPath}" stroke="${color}" stroke-width="14" stroke-linecap="round" fill="none"/>` : ''}

          <!-- Dot at the end -->
          ${pct > 0 ? `
            <circle cx="${endX.toFixed(2)}" cy="${endY.toFixed(2)}" r="9" fill="${color}"/>
            <circle cx="${endX.toFixed(2)}" cy="${endY.toFixed(2)}" r="4" fill="#fff"/>
          ` : ''}

          <!-- Central score -->
          <text x="${cx}" y="92" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif"
                font-size="32" font-weight="700" fill="${color}">${Math.round(score)}</text>
          <text x="${cx}" y="112" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif"
                font-size="11" fill="rgba(255,255,255,0.55)" letter-spacing="0.06em">/ 100</text>
        </svg>`;
    },

    _buildGapItem(g, idx) {
      const lift = Number(g.max_lift || 0).toFixed(1);
      return `
        <div class="mb-gap-item">
          <div class="mb-gap-index">${idx}</div>
          <div class="mb-gap-body">
            <div class="mb-gap-head">
              <span class="mb-gap-label">${this._esc(g.label || g.component)}</span>
              <span class="mb-gap-lift" title="Puntos que puedes ganar si lo arreglas">+${lift} pts</span>
            </div>
            <p class="mb-gap-desc">${this._esc(g.gap_description || '')}</p>
            ${g.suggested_action ? `<p class="mb-gap-action">→ ${this._esc(g.suggested_action)}</p>` : ''}
          </div>
        </div>`;
    },

    _buildHealthEmpty() {
      return `
        <section class="mb-health-card mb-health-card--empty">
          <p>Calculando salud de tu marca… (sin datos suficientes aún)</p>
        </section>`;
    },

    /* ════════════════════════════════════════════════════════════════
       Sección Mis Campañas (rediseñada — consultor, no dashboard)
       ════════════════════════════════════════════════════════════════ */
    _buildCampanasStrategicSection(data) {
      const list      = Array.isArray(data?.list?.data) ? data.list.data : [];
      const winBurn   = data?.winnersVsBurners?.data || {};
      const briefs    = Array.isArray(data?.briefVsOutcome?.data) ? data.briefVsOutcome.data : [];

      const winners = Array.isArray(winBurn.winners) ? winBurn.winners : [];
      const burners = Array.isArray(winBurn.burners) ? winBurn.burners : [];

      const hasData = list.some(c => Number(c.window_spend) > 0);
      if (!hasData) return this._buildCampanasEmpty();

      return `
        <section class="mb-campanas-strategic">
          <div class="mb-section-header">
            <h2 class="mb-section-title">Mis Campañas</h2>
            <p class="mb-section-sub">Análisis causal — qué te funciona, qué te falla, y qué hacer.</p>
          </div>

          ${this._buildWinningFormula(winners, list)}

          ${this._buildFailureDiagnosis(burners)}

          ${briefs.length > 0 ? this._buildBriefsBlock(briefs) : ''}
        </section>`;
    },

    /* 🎯 Tu fórmula ganadora — DNA común de winners */
    _buildWinningFormula(winners, allList) {
      if (!winners.length) {
        return `
          <div class="mb-strategic-card mb-strategic-card--info">
            <h3 class="mb-strategic-title">🎯 Tu fórmula ganadora</h3>
            <p class="mb-strategic-empty">Sin campañas convertidoras en la ventana. Cuando tengas al menos 2 que conviertan, Vera identifica el DNA común aquí.</p>
          </div>`;
      }

      // Detectar features comunes simples sobre nombres + plataforma
      const features = this._detectCommonFeatures(winners);
      const avgCPC = winners.reduce((s, w) => s + (Number(w.cost_per_conv) || 0), 0) / winners.length;
      const totalConv = winners.reduce((s, w) => s + (Number(w.conversions) || 0), 0);

      return `
        <div class="mb-strategic-card mb-strategic-card--winner">
          <h3 class="mb-strategic-title">🎯 Tu fórmula ganadora</h3>

          <p class="mb-strategic-headline">
            Tus <strong>${winners.length} campañas</strong> que convierten comparten estos elementos:
          </p>

          <ul class="mb-strategic-features">
            ${features.map(f => `<li><strong>${this._esc(f.label)}:</strong> ${this._esc(f.value)}</li>`).join('')}
          </ul>

          <div class="mb-strategic-evidence">
            <span><strong>${fmt.int(totalConv)}</strong> conversiones · <strong>${fmt.money(avgCPC)}</strong>/conv promedio</span>
          </div>

          <p class="mb-strategic-action">
            <strong>Vera recomienda:</strong> replica este molde antes de lanzar nuevas campañas.
            Si vas a invertir en una geografía o formato distinto, mide chico primero ($200K test) antes de escalar.
          </p>
        </div>`;
    },

    /** Heurística simple: detecta tokens comunes en nombres + plataforma. */
    _detectCommonFeatures(items) {
      const features = [];

      // Plataforma
      const platforms = [...new Set(items.map(i => i.platform).filter(Boolean))];
      if (platforms.length === 1) {
        features.push({ label: 'Plataforma', value: this._platformLabel(platforms[0]) });
      } else if (platforms.length > 1) {
        features.push({ label: 'Plataformas', value: platforms.map(p => this._platformLabel(p)).join(' + ') });
      }

      // Tokens del nombre (extraer palabras que aparecen en ≥2 nombres)
      const tokenCounts = {};
      const stopWords = new Set(['campaña', 'campana', 'campaign', 'de', 'y', 'la', 'el', 'wp', 'meta']);
      items.forEach(i => {
        const name = String(i.nombre_campana || '').toLowerCase();
        const tokens = name.split(/[\s_\-,]+/).filter(t => t && t.length > 2 && !stopWords.has(t));
        const seen = new Set();
        tokens.forEach(t => { if (!seen.has(t)) { seen.add(t); tokenCounts[t] = (tokenCounts[t] || 0) + 1; } });
      });
      const common = Object.entries(tokenCounts)
        .filter(([, c]) => c >= 2 || (items.length === 1 && c >= 1))
        .filter(([, c]) => c === items.length || (items.length >= 3 && c >= 2))
        .map(([t]) => t);
      if (common.length) {
        features.push({ label: 'Patrón en nombres', value: common.map(t => '"' + t + '"').join(', ') });
      }

      // Si no detectó nada, fallback genérico
      if (features.length === 0) {
        features.push({ label: 'Característica común', value: 'Vera necesita más campañas convertidoras para identificar el patrón.' });
      }

      return features;
    },

    /* 🔍 Diagnóstico de falla — por qué cada burner está fallando */
    _buildFailureDiagnosis(burners) {
      if (!burners.length) {
        return `
          <div class="mb-strategic-card mb-strategic-card--info">
            <h3 class="mb-strategic-title">🔍 Diagnóstico de campañas con problema</h3>
            <p class="mb-strategic-empty">Ninguna campaña tu dinero está ardiendo sin retorno. ✓</p>
          </div>`;
      }

      return `
        <div class="mb-strategic-card mb-strategic-card--burner">
          <h3 class="mb-strategic-title">🔍 Por qué te está fallando</h3>
          <p class="mb-strategic-headline">Diagnóstico individual de cada campaña con problema:</p>

          <div class="mb-burner-list">
            ${burners.map(b => `
              <article class="mb-burner-item">
                <div class="mb-burner-name">${this._esc(b.nombre_campana || '—')}</div>
                <div class="mb-burner-evidence">
                  ${fmt.money(b.spend)} gastado · ${fmt.int(b.conversions)} conv · CTR ${fmt.pct(b.ctr_pct, 2)} · ${fmt.pct(b.pct_of_spend, 1)} de tu inversión
                </div>
                <p class="mb-burner-diagnosis">${this._esc(b.description || '')}</p>
              </article>
            `).join('')}
          </div>
        </div>`;
    },

    /* 📋 Brief vs ejecución */
    _buildBriefsBlock(briefs) {
      return `
        <div class="mb-strategic-card mb-strategic-card--brief">
          <h3 class="mb-strategic-title">📋 Brief vs ejecución</h3>
          <p class="mb-strategic-headline">¿Lo que prometiste hacer se está ejecutando?</p>

          <div class="mb-briefs-grid">
            ${briefs.map(b => this._buildBriefCard(b)).join('')}
          </div>
        </div>`;
    },

    _buildBriefCard(b) {
      const out = b.outcome || {};
      const chip = (arr) => Array.isArray(arr) && arr.length
        ? arr.slice(0, 3).map(t => `<span class="mb-chip">${this._esc(t)}</span>`).join('')
        : '<span class="mb-chip mb-chip--muted">—</span>';

      return `
        <article class="mb-brief-card">
          <header class="mb-brief-head">
            <h4 class="mb-brief-name">${this._esc(b.brief_nombre || 'Sin nombre')}</h4>
            <span class="mb-brief-status mb-brief-status--${this._esc(b.status)}">${this._esc(b.status)}</span>
          </header>

          <div class="mb-brief-grid">
            <div class="mb-brief-col">
              <div class="mb-brief-label">Tono prometido</div>
              <div class="mb-brief-chips">${chip(b.tono_modificador)}</div>
              <div class="mb-brief-label" style="margin-top:0.6rem;">Ángulos</div>
              <div class="mb-brief-chips">${chip(b.angulos_venta)}</div>
            </div>

            <div class="mb-brief-col">
              <div class="mb-brief-label">Realidad ejecutada</div>
              <div class="mb-brief-realidad">
                <div><strong>${fmt.int(out.campaigns_count)}</strong> campañas activadas</div>
                <div><strong>${fmt.money(out.spend)}</strong> invertido</div>
                <div><strong>${fmt.int(out.conversions)}</strong> conversiones</div>
                ${out.cost_per_conv ? `<div>${fmt.money(out.cost_per_conv)} <span class="muted">por conv</span></div>` : ''}
              </div>
            </div>
          </div>

          <p class="mb-brief-vera">${this._esc(b.description || '')}</p>
        </article>`;
    },

    _buildCampanasEmpty() {
      return `
        <section class="mb-campanas-strategic">
          <div class="mb-section-header">
            <h2 class="mb-section-title">Mis Campañas</h2>
            <p class="mb-section-sub">Sin campañas activas con data en el periodo.</p>
          </div>
          <div class="mb-strategic-card mb-strategic-card--info">
            <p class="mb-strategic-empty">Conecta una integración Meta y lanza tu primera campaña. Vera empezará a diagnosticar qué funciona y qué falla.</p>
          </div>
        </section>`;
    },

    _platformLabel(p) {
      const m = { meta_facebook: 'Facebook', meta_instagram: 'Instagram', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest' };
      return m[p] || p || '—';
    },

    _bindMyBrandsHandlers(/* body */) {
      // placeholder — drill-down handlers
    },
  });
})();
