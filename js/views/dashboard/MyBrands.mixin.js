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
       Cards se construyen una a una. Por ahora: solo Brand Health.
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
        </div>`;
    },

    /* ════════════════════════════════════════════════════════════════
       HERO: Brand Health Gauge
       Estado: gauge siempre visible, diagnóstico colapsable con toggle TR.
       Preferencia guardada en localStorage por org.
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
      const expanded = this._isHealthExpanded();
      const gapsCount = gaps.length;

      return `
        <section class="mb-health-card ${expanded ? 'is-expanded' : 'is-collapsed'}" data-health-card>
          <button type="button"
                  class="mb-health-toggle"
                  data-health-toggle
                  aria-label="${expanded ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}"
                  title="${expanded ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}">
            <span class="mb-health-toggle-label">
              ${expanded ? 'Ocultar análisis' : `Ver análisis${gapsCount ? ' · ' + gapsCount + ' gap' + (gapsCount === 1 ? '' : 's') : ''}`}
            </span>
            <svg class="mb-health-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

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
            </div>

            <!-- Diagnóstico column (colapsable) -->
            <div class="mb-health-diagnosis" data-health-diagnosis aria-hidden="${!expanded}">
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

    _healthExpandedKey() {
      return `mb:health-expanded:${this._orgId || 'global'}`;
    },

    _isHealthExpanded() {
      try {
        return localStorage.getItem(this._healthExpandedKey()) === '1';
      } catch (_) { return false; }
    },

    _setHealthExpanded(value) {
      try {
        if (value) localStorage.setItem(this._healthExpandedKey(), '1');
        else       localStorage.removeItem(this._healthExpandedKey());
      } catch (_) { /* ignore */ }
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

    _bindMyBrandsHandlers(body) {
      if (!body) return;

      // Toggle del diagnóstico del Brand Health gauge
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-health-toggle]');
        if (!btn) return;

        const card = btn.closest('[data-health-card]');
        if (!card) return;

        const expanded = card.classList.contains('is-expanded');
        card.classList.toggle('is-expanded', !expanded);
        card.classList.toggle('is-collapsed', expanded);

        // Actualizar texto + aria + icono rotación los maneja CSS
        const labelEl = btn.querySelector('.mb-health-toggle-label');
        if (labelEl) {
          const gapsBadge = labelEl.textContent.match(/\d+ gap/);
          labelEl.textContent = expanded
            ? `Ver análisis${gapsBadge ? ' · ' + gapsBadge[0] + 's' : ''}`
            : 'Ocultar análisis';
        }
        const diag = card.querySelector('[data-health-diagnosis]');
        if (diag) diag.setAttribute('aria-hidden', expanded ? 'true' : 'false');
        btn.setAttribute('aria-label', expanded ? 'Ver diagnóstico' : 'Ocultar diagnóstico');
        btn.setAttribute('title', expanded ? 'Ver diagnóstico' : 'Ocultar diagnóstico');

        this._setHealthExpanded(!expanded);
      });
    },
  });
})();
