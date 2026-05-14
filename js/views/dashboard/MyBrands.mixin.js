/**
 * DashboardView — MyBrands mixin (tab "Mi Marca").
 *
 * Ola 1 (FEAT-023): sección "Mis Campañas" con 4 cards causales construidos
 * sobre `ad_insights_daily` (730 filas reales en IGNIS).
 * Ola 2 (pendiente): pulse orgánico — 15 dimensiones del director creativo
 * (docs/DASHBOARD-MI-MARCA.txt) priorizadas por datos disponibles.
 *
 * Patrón causal (memoria feedback_dashboards_show_vera_intelligence):
 *   "Vera detectó X → evidencia → acción". Nunca métricas crudas.
 *
 * Servicio: CampanasDataService (5 RPCs dashboard_campaign_* paralelas).
 *
 * Aplica sobre DashboardView.prototype al cargarse.
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
       Entry point — llamado por DashboardView._renderTab('my-brands')
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
       Skeleton / empty / error states
       ════════════════════════════════════════════════════════════════ */
    _renderMyBrandsSkeleton(body) {
      body.innerHTML = `
        <div class="mb-page">
          ${BaseView.skeletonGrid ? BaseView.skeletonGrid(5) : '<div class="skeleton-card"></div>'}
          <div style="margin-top:1rem;">${BaseView.skeletonCard ? BaseView.skeletonCard('lg') : '<div class="skeleton-card-lg"></div>'}</div>
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
       Composición HTML — secciones del tab Mi Marca
       ════════════════════════════════════════════════════════════════ */
    _buildMyBrandsHtml(data) {
      const kpis = data?.kpis?.data || {};
      return `
        <div class="insight-page" id="mbPage">
          <header class="insight-header">
            <div class="insight-header-left">
              <h1 class="insight-title">Mi Marca</h1>
              <p class="insight-subtitle">Inteligencia causal de Vera sobre tus campañas reales y la salud orgánica de tu marca.</p>
            </div>
          </header>

          ${this._buildCampanasSection(data)}

          <div class="insight-section">
            <div class="insight-section-header">
              <div class="insight-section-title">
                <span>Pulse orgánico</span>
              </div>
            </div>
            <div class="insight-section-body" style="padding:2rem 1.25rem; text-align:center; color:var(--text-tertiary);">
              <p style="margin:0 0 0.25rem; color:var(--text-secondary);">Próximamente</p>
              <p style="margin:0; font-size:0.8125rem;">Tono ganador, palabras que SÍ encienden, posts que detonaron, ADN actual.</p>
            </div>
          </div>
        </div>`;
    },

    /* ── Sección Mis Campañas (FEAT-023) ──────────────────────── */
    _buildCampanasSection(data) {
      const kpis      = data?.kpis?.data || {};
      const list      = data?.list?.data || [];
      const winBurn   = data?.winnersVsBurners?.data || {};
      const briefs    = data?.briefVsOutcome?.data || [];

      const hasData = (kpis.campaigns_with_data || 0) > 0 || list.length > 0;

      return `
        <section class="mb-campanas">
          <div class="mb-section-header">
            <div>
              <h2 class="mb-section-title">Mis Campañas</h2>
              <p class="mb-section-sub">${this._esc(kpis.description || 'Resumen del periodo.')}</p>
            </div>
          </div>

          ${this._buildKpiStrip(kpis)}

          ${hasData ? this._buildWinnersBurners(winBurn) : ''}

          ${hasData ? this._buildCampaignList(list) : this._buildEmptyCampaigns()}

          ${briefs.length > 0 ? this._buildBriefsBlock(briefs) : ''}
        </section>`;
    },

    _buildKpiStrip(k) {
      const cards = [
        { icon: '💰', label: 'Gasto del periodo',  value: fmt.money(k.spend),       sub: k.campaigns_with_data ? `${k.campaigns_with_data} campaña(s) con data` : 'Sin actividad' },
        { icon: '👁', label: 'Impresiones',         value: fmt.int(k.impressions),   sub: `Alcance ${fmt.int(k.reach)}` },
        { icon: '🖱', label: 'Clicks',              value: fmt.int(k.clicks),        sub: `CTR ${fmt.pct(k.ctr_pct, 2)}` },
        { icon: '🎯', label: 'Conversiones',        value: fmt.int(k.conversions),   sub: k.cost_per_conversion ? `${fmt.money(k.cost_per_conversion)} c/u` : '—' },
        { icon: '📊', label: 'Campañas',            value: `${k.campaigns_active || 0}/${k.campaigns_total || 0}`, sub: `${k.campaigns_active || 0} activas hoy` },
      ];
      return `
        <div class="insight-kpi-strip">
          ${cards.map(c => `
            <div class="insight-kpi-card">
              <div class="insight-kpi-icon">${c.icon}</div>
              <div class="insight-kpi-body">
                <div class="insight-kpi-value">${this._esc(c.value)}</div>
                <div class="insight-kpi-label">${this._esc(c.label)}</div>
                <div class="insight-kpi-sub">${this._esc(c.sub)}</div>
              </div>
            </div>
          `).join('')}
        </div>`;
    },

    /* ── Winners vs Burners — LA JOYA causal ─────────────────── */
    _buildWinnersBurners(wb) {
      const winners = Array.isArray(wb.winners) ? wb.winners : [];
      const burners = Array.isArray(wb.burners) ? wb.burners : [];
      if (!winners.length && !burners.length) return '';

      return `
        <div class="mb-wb-grid">
          <div class="insight-section mb-wb-block mb-wb-burners">
            <div class="insight-section-header">
              <div class="insight-section-title"><span>⚠️ Tu dinero está ardiendo aquí</span></div>
            </div>
            <div class="mb-wb-list">
              ${burners.length === 0
                ? `<p class="mb-wb-empty">Ninguna campaña con gasto sin conversión. ✓</p>`
                : burners.map(b => this._buildWBCard(b, 'burner')).join('')}
            </div>
          </div>

          <div class="insight-section mb-wb-block mb-wb-winners">
            <div class="insight-section-header">
              <div class="insight-section-title"><span>🏆 Lo que SÍ está funcionando</span></div>
            </div>
            <div class="mb-wb-list">
              ${winners.length === 0
                ? `<p class="mb-wb-empty">Aún sin campañas con conversiones medibles.</p>`
                : winners.map(w => this._buildWBCard(w, 'winner')).join('')}
            </div>
          </div>
        </div>`;
    },

    _buildWBCard(item, kind) {
      const cls = kind === 'winner' ? 'mb-wb-card mb-wb-card--winner' : 'mb-wb-card mb-wb-card--burner';
      const metrics = [
        `${fmt.money(item.spend)} gasto`,
        item.conversions ? `${fmt.int(item.conversions)} conv` : '0 conv',
        item.cost_per_conv ? `${fmt.money(item.cost_per_conv)}/conv` : null,
        item.ctr_pct ? `CTR ${fmt.pct(item.ctr_pct, 2)}` : null,
      ].filter(Boolean).join(' · ');

      return `
        <article class="${cls}">
          <div class="mb-wb-name">${this._esc(item.nombre_campana || 'Sin nombre')}</div>
          <div class="mb-wb-metrics">${this._esc(metrics)}</div>
          <p class="mb-wb-vera">${this._esc(item.description || '')}</p>
        </article>`;
    },

    /* ── Lista de campañas ───────────────────────────────────── */
    _buildCampaignList(list) {
      return `
        <div class="insight-section">
          <div class="insight-section-header">
            <div class="insight-section-title"><span>Tus campañas rankeadas por gasto</span></div>
            <div class="insight-section-sub">${list.length} campaña(s)</div>
          </div>
          <div class="mb-camp-table-wrap">
            <table class="mb-camp-table">
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Estado</th>
                  <th>Plataforma</th>
                  <th class="num">Gasto</th>
                  <th class="num">Conv</th>
                  <th class="num">$/Conv</th>
                  <th class="num">CTR</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(c => `
                  <tr data-campaign-id="${this._esc(c.campaign_id)}">
                    <td>
                      <div class="mb-camp-name">${this._esc(c.nombre_campana || '—')}</div>
                      <div class="mb-camp-vera">${this._esc(c.description || '')}</div>
                    </td>
                    <td><span class="mb-camp-status mb-camp-status--${this._esc(c.status)}">${this._esc(c.status)}</span></td>
                    <td class="mb-camp-platform">${this._esc(this._platformLabel(c.platform))}</td>
                    <td class="num">${fmt.money(c.window_spend)}</td>
                    <td class="num">${fmt.int(c.window_conversions)}</td>
                    <td class="num">${c.window_cost_per_conv ? fmt.money(c.window_cost_per_conv) : '—'}</td>
                    <td class="num">${fmt.pct(c.window_ctr_pct, 2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    },

    _platformLabel(p) {
      const m = { meta_facebook: 'Facebook', meta_instagram: 'Instagram', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest' };
      return m[p] || p || '—';
    },

    _buildEmptyCampaigns() {
      return `
        <div class="insight-section" style="padding:2rem 1.25rem; text-align:center;">
          <p style="margin:0 0 0.25rem; color:var(--text-secondary);">Aún no hay campañas con datos en este periodo.</p>
          <p style="margin:0; color:var(--text-tertiary); font-size:0.8125rem;">Vera sincroniza tus insights de Meta cada noche; cuando lances una campaña activa, aparecerá aquí.</p>
        </div>`;
    },

    /* ── Brief vs Realidad ───────────────────────────────────── */
    _buildBriefsBlock(briefs) {
      return `
        <div class="insight-section">
          <div class="insight-section-header">
            <div class="insight-section-title"><span>Brief vs realidad</span></div>
            <div class="insight-section-sub">${briefs.length} brief(s)</div>
          </div>
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
            <h3 class="mb-brief-name">${this._esc(b.brief_nombre || 'Sin nombre')}</h3>
            <span class="mb-brief-status mb-brief-status--${this._esc(b.status)}">${this._esc(b.status)}</span>
          </header>

          <div class="mb-brief-grid">
            <div class="mb-brief-col">
              <div class="mb-brief-label">Tono</div>
              <div class="mb-brief-chips">${chip(b.tono_modificador)}</div>
              <div class="mb-brief-label" style="margin-top:0.75rem;">Ángulos</div>
              <div class="mb-brief-chips">${chip(b.angulos_venta)}</div>
              <div class="mb-brief-label" style="margin-top:0.75rem;">CTA</div>
              <div class="mb-brief-cta">${this._esc(b.cta || '—')}</div>
            </div>

            <div class="mb-brief-col">
              <div class="mb-brief-label">Realidad</div>
              <div class="mb-brief-realidad">
                <div><strong>${fmt.int(out.campaigns_count)}</strong> campaña(s)</div>
                <div><strong>${fmt.money(out.spend)}</strong> gastado</div>
                <div><strong>${fmt.int(out.conversions)}</strong> conversiones</div>
                ${out.cost_per_conv ? `<div>${fmt.money(out.cost_per_conv)} <span class="muted">por conv</span></div>` : ''}
                ${out.ctr_pct ? `<div>${fmt.pct(out.ctr_pct, 2)} <span class="muted">CTR</span></div>` : ''}
              </div>
            </div>
          </div>

          <p class="mb-brief-vera">${this._esc(b.description || '')}</p>
        </article>`;
    },

    /* ── Event handlers ──────────────────────────────────────── */
    _bindMyBrandsHandlers(body) {
      // Click en fila de campaña → drill-down (placeholder por ahora)
      body.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-campaign-id]');
        if (!row) return;
        const id = row.dataset.campaignId;
        if (id) console.log('[MyBrands] drill-down campaign:', id);
      });
    },
  });
})();
