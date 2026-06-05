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

  /**
   * Feature flag: ocultar cards que no tienen datos.
   *
   * Default FALSE en estado de creación del dashboard — todas las cards deben
   * verse aunque estén vacías para que el equipo entienda el shape final.
   *
   * Para activar en producción: cambiar HIDE_EMPTY_DEFAULT a true.
   * Para probar puntualmente sin redeploy: en la consola del navegador
   *   window.MB_HIDE_EMPTY_CARDS = true; (luego re-renderizar tab)
   */
  const HIDE_EMPTY_DEFAULT = false;
  const shouldHideEmpty = () =>
    (typeof window !== 'undefined' && typeof window.MB_HIDE_EMPTY_CARDS === 'boolean')
      ? window.MB_HIDE_EMPTY_CARDS
      : HIDE_EMPTY_DEFAULT;

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
      this._restoreMbFilters();
      this._renderMyBrandsSkeleton(body);

      try {
        const data = await this._loadMyBrandsData();
        this._mbCampanasData = data;
        this._renderHeroCards?.(data); // alimenta las cards del hero
        body.innerHTML = this._buildMyBrandsHtml(data);
        this._bindMyBrandsHandlers(body);
        this._renderLongitudinalCharts(data);
        this._renderAudienceMap(data);
        this._renderAudienceRadar(data);
        this._renderPillarsBubble(data);
      } catch (e) {
        console.error('[MyBrands] loadAll failed:', e);
        body.innerHTML = this._buildMyBrandsErrorHtml(e);
      }
    },

    async _loadMyBrandsData() {
      const f = this._mbFilters || { windowDays: 30, brandContainerId: null };
      return this._campanasService.loadAll({
        dateFromIso: f.dateFrom || null,
        dateToIso:   f.dateTo   || null,
        windowDays:  f.windowDays,
        brandIds:    f.brandContainerId ? [f.brandContainerId] : null,
        platforms:   f.platforms || null,
      });
    },

    /* ── Filtros: estado persistido en localStorage ──────────── */
    // v2: el default pasa a "Todo el periodo" (la data propia real puede ser
    // antigua); bumpear la clave ignora el "30 dias" guardado de antes.
    _mbFiltersKey() { return `mb:filters:v2:${this._orgId || 'global'}`; },

    _restoreMbFilters() {
      if (this._mbFilters) return this._mbFilters;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(this._mbFiltersKey()) || 'null'); } catch (_) {}
      this._mbFilters = {
        windowDays:        Number(stored?.windowDays) > 0 ? Number(stored.windowDays) : 99999,
        brandContainerId:  stored?.brandContainerId || null,
        dateFrom:          stored?.dateFrom || null,   // ISO o null (= todo el periodo)
        dateTo:            stored?.dateTo   || null,
        platforms:         Array.isArray(stored?.platforms) ? stored.platforms : null,
      };
      return this._mbFilters;
    },

    _saveMbFilters() {
      try { localStorage.setItem(this._mbFiltersKey(), JSON.stringify(this._mbFilters || {})); } catch (_) {}
    },

    async _onMbFilterChange(patch) {
      this._mbFilters = { ...(this._mbFilters || {}), ...patch };
      this._saveMbFilters();
      // Los filtros viven en el hero (compartido). Solo tocamos el cuerpo si
      // Mi Marca esta activo; en otros tabs solo refrescamos las cards del hero.
      const onMyBrands = this._activeTab === 'my-brands';
      const body = document.getElementById('insightTabBody');
      if (onMyBrands && body) this._renderMyBrandsSkeleton(body);
      try {
        const data = await this._loadMyBrandsData();
        this._mbCampanasData = data;
        this._renderHeroCards?.(data); // alimenta las cards del hero
        if (!onMyBrands || !body) return;
        body.innerHTML = this._buildMyBrandsHtml(data);
        this._bindMyBrandsHandlers(body);
        this._renderLongitudinalCharts(data);
        this._renderAudienceMap(data);
        this._renderAudienceRadar(data);
        this._renderPillarsBubble(data);
      } catch (e) {
        if (onMyBrands && body) body.innerHTML = this._buildMyBrandsErrorHtml(e);
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
      const insights = Array.isArray(data?.whatWorks?.data) ? data.whatWorks.data : [];
      // Layout 2 columnas: el cuerpo del dashboard a la izquierda (ancho) y la
      // Salud de la marca como sidebar fijo a la derecha (mas angosto). El gauge
      // de salud dejo de ser hero del cuerpo y vive solo en el sidebar.
      return `
        <div class="insight-page mb-dash" id="mbPage">
          <div class="mb-layout">
            <div class="mb-layout-main">
              ${this._buildActionPlanSection(data, insights)}
              ${this._buildLongitudinalSection(data)}
              ${this._buildLeverageSection(insights)}
              ${this._buildEffectiveAudienceSection(data?.audienceEffective?.data, insights)}
              ${this._buildAudienceSection(data?.audiencePatterns?.data)}
              ${this._buildEvolutionSection(data?.evolution?.data)}
            </div>
            <aside class="mb-layout-aside">
              ${this._buildHealthGauge(data?.health?.data)}
              ${this._buildPillarsSection(data?.pillars?.data)}
            </aside>
          </div>
        </div>`;
    },

    /* ── Plan de accion: Explota / Optimiza / Elimina / Vigila ─────────
       Calcula los 4 items (que explotar, optimizar, eliminar y vigilar) a
       partir de la data existente. Lo consume tanto la seccion del cuerpo
       (_buildActionPlanSection) como el hero del dashboard. */
    _computeActionPlanItems(data, insights) {
      const arr = Array.isArray(insights) ? insights : [];
      const boosts = arr.filter((i) => i.kind === 'boost').sort((a, b) => Number(b.lift_pct) - Number(a.lift_pct));
      const drags  = arr.filter((i) => i.kind === 'drag').sort((a, b) => Number(a.lift_pct) - Number(b.lift_pct));
      const tasks  = Array.isArray(data?.health?.data?.tasks)
        ? [...data.health.data.tasks].sort((a, b) => (Number(b.impact_pts) || 0) - (Number(a.impact_pts) || 0))
        : [];
      const orphan = (Array.isArray(data?.pillars?.data) ? data.pillars.data : []).find((p) => p.is_orphan);

      const dimLabel = { tono: 'Tono', tema: 'Tema', formato: 'Formato', horario: 'Horario' };

      // EXPLOTA: el mejor boost (o pilar huerfano si no hay boost).
      let explota = null;
      if (boosts[0]) {
        const b = boosts[0];
        explota = {
          title: `${dimLabel[b.dimension] || b.dimension} "${this._causalValueLabel(b.dimension, b.value)}"`,
          metric: `+${Math.round(Number(b.lift_pct))}% sobre tu promedio`,
          why: orphan ? `Tu pilar "${this._esc(orphan.pillar)}" tambien rinde y lo usas solo ${orphan.share_pct}%.` : 'Usalo mas, lo subexplotas.',
        };
      } else if (orphan) {
        explota = {
          title: `Pilar "${this._esc(orphan.pillar)}"`,
          metric: `+${Math.round(Number(orphan.lift_pct))}% pero solo ${orphan.share_pct}% de tu contenido`,
          why: 'Te funciona y lo subexplotas. Produce mas de esto.',
        };
      }

      // OPTIMIZA: la tarea de salud de mayor impacto.
      let optimiza = tasks[0] ? {
        title: tasks[0].label,
        metric: Number(tasks[0].impact_pts) > 0 ? `+${Math.round(Number(tasks[0].impact_pts))} pts de salud` : '',
        why: tasks[0].detail || '',
      } : null;

      // ELIMINA: lo que mas te resta.
      let elimina = drags[0] ? {
        title: `${dimLabel[drags[0].dimension] || drags[0].dimension} "${this._causalValueLabel(drags[0].dimension, drags[0].value)}"`,
        metric: `${Math.round(Number(drags[0].lift_pct))}% bajo tu promedio`,
        why: `Lo usas ${Number(drags[0].post_count) || 0} ${Number(drags[0].post_count) === 1 ? 'vez' : 'veces'} y rinde por debajo. Reducelo.`,
      } : null;

      // ── Enriquecer con dashboard_brand_optimization_insights (server-side):
      // palancas cuantificadas + momentum + consistencia. Si hay data,
      // sobreescribe los buckets con la señal mas fuerte; si no, cae al
      // synthesis client-side de arriba (whatWorks/health/pillars).
      const oi = data?.optimizationInsights?.data || null;
      if (oi) {
        const ec = [
          oi.best_topic && Number(oi.best_topic.lift_pct) > 0 && { dim: 'Tema', val: oi.best_topic.topic, lift: oi.best_topic.lift_pct, n: oi.best_topic.n },
          oi.best_tone  && Number(oi.best_tone.lift_pct)  > 0 && { dim: 'Tono', val: oi.best_tone.tone,  lift: oi.best_tone.lift_pct,  n: oi.best_tone.n },
        ].filter(Boolean).sort((a, b) => Number(b.lift) - Number(a.lift));
        if (ec[0]) explota = {
          title: `${ec[0].dim} "${this._esc(ec[0].val)}"`,
          metric: `+${Math.round(Number(ec[0].lift))}%`, metricSub: 'sobre tu promedio',
          why: `Tu mejor palanca (${ec[0].n} posts). Produce mas de esto.`, impact: 'alto',
          detailDim: ec[0].dim === 'Tema' ? 'topic' : 'tone', detailValue: ec[0].val,
        };
        const oc = [
          oi.best_hour_co && Number(oi.best_hour_co.lift_pct) > 0 && { txt: `Publica a las ${oi.best_hour_co.hour_co}h`, lift: oi.best_hour_co.lift_pct, dim: 'hour', value: String(oi.best_hour_co.hour_co) },
          oi.best_format  && Number(oi.best_format.lift_pct)  > 0 && { txt: `Usa mas "${oi.best_format.format}"`, lift: oi.best_format.lift_pct, dim: 'format', value: oi.best_format.format },
        ].filter(Boolean).sort((a, b) => Number(b.lift) - Number(a.lift));
        if (oc[0]) optimiza = {
          title: oc[0].txt, metric: `+${Math.round(Number(oc[0].lift))}%`, metricSub: 'engagement',
          why: oi.posting_consistency ? `Consistencia actual: ${Math.round(Number(oi.posting_consistency.posting_consistency_pct))}%.` : '',
          impact: 'medio', detailDim: oc[0].dim, detailValue: oc[0].value,
        };
        const dc = [
          oi.worst_tone    && Number(oi.worst_tone.lift_pct)    < 0 && { title: `Tono "${oi.worst_tone.tone}"`, lift: oi.worst_tone.lift_pct, dim: 'tone', value: oi.worst_tone.tone },
          oi.worst_hour_co && Number(oi.worst_hour_co.lift_pct) < 0 && { title: `Publicar a las ${oi.worst_hour_co.hour_co}h`, lift: oi.worst_hour_co.lift_pct, dim: 'hour', value: String(oi.worst_hour_co.hour_co) },
        ].filter(Boolean).sort((a, b) => Number(a.lift) - Number(b.lift));
        if (dc[0]) elimina = {
          title: dc[0].title, metric: `${Math.round(Number(dc[0].lift))}%`, metricSub: 'bajo tu promedio',
          why: 'Rinde muy por debajo de tu media. Reducelo o evitalo.', impact: 'medio',
          detailDim: dc[0].dim, detailValue: dc[0].value,
        };
      }
      if (explota  && !explota.impact)  explota.impact  = 'alto';
      if (optimiza && !optimiza.impact) optimiza.impact = 'medio';
      if (elimina  && !elimina.impact)  elimina.impact  = 'medio';

      // VIGILA (4ta card) = riesgo de marca desde dashboard_brand_alert_score.
      const alertRows = Array.isArray(data?.alertScore?.data) ? data.alertScore.data : [];
      const risk = alertRows
        .filter((r) => Number(r.risk_score) > 0 || Number(r.high_risk_posts) > 0 || Number(r.negative_sentiment_ratio) > 0)
        .sort((a, b) => Number(b.risk_score) - Number(a.risk_score))[0];
      let vigila = null;
      if (risk) {
        const neg = Math.round(Number(risk.negative_sentiment_ratio || 0) * 100);
        const parts = [];
        if (Number(risk.high_risk_posts) > 0) parts.push(`${Number(risk.high_risk_posts)} posts de riesgo`);
        if (neg > 0) parts.push(`${neg}% sentimiento negativo`);
        if (Number(risk.flags_count) > 0) parts.push(`${Number(risk.flags_count)} flags`);
        vigila = {
          title: risk.brand_name || 'Riesgo de marca',
          metric: parts[0] || `riesgo ${Math.round(Number(risk.risk_score))}`,
          why: parts.slice(1).join(' · ') || (risk.description || 'Revisa sentimiento y flags.'),
          impact: Number(risk.risk_score) >= 50 ? 'alto' : 'medio',
          detailDim: 'sentiment', detailValue: 'negative',
        };
      }

      return { explota, optimiza, elimina, vigila };
    },

    /* Seccion "Momentum" del cuerpo: signos vitales (engagement vs previo,
       volumen y consistencia). Las cards del plan de accion (Explota/Optimiza/
       Elimina/Vigila) ya viven en el hero del dashboard — aqui no se duplican. */
    _buildActionPlanSection(data) {
      const oi = data?.optimizationInsights?.data || null;
      if (!oi) return '';

      const trend = oi.engagement_vs_prior_period_pct;
      const hasTrend = trend != null && Number.isFinite(Number(trend));
      const tNum = Math.round(Number(trend));
      const tCls = !hasTrend ? '' : tNum > 0 ? 'is-up' : tNum < 0 ? 'is-down' : 'is-flat';
      const tStr = !hasTrend ? '—' : `${tNum > 0 ? '+' : ''}${tNum}%`;
      const cons = oi.posting_consistency ? `${Math.round(Number(oi.posting_consistency.posting_consistency_pct))}%` : '—';
      const vital = (val, lbl, cls = '') => `
        <div class="mb-plan-vital">
          <span class="mb-plan-vital-val ${cls}">${this._esc(val)}</span>
          <span class="mb-plan-vital-lbl">${this._esc(lbl)}</span>
        </div>`;

      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-plan-vitals">
            ${vital(tStr, 'Engagement vs periodo previo', tCls)}
            ${vital(fmt.int(oi.posts_analyzed), 'Posts analizados')}
            ${vital(cons, 'Consistencia de publicacion')}
          </div>
        </section>`;
    },

    /* ── Que te impulsa y que te frena: barras divergentes hermanas ────────
       Unifica "lo que funciona" (boost, verde, derecha) y "lo que resta"
       (drag, rojo, izquierda) centradas en tu promedio (=0). Cada barra se
       escala vs el |lift| maximo para que ambos lados sean comparables. */
    _buildLeverageSection(insights) {
      const arr = Array.isArray(insights) ? insights : [];
      const dimLabel = { tono: 'Tono', tema: 'Tema', formato: 'Formato', horario: 'Hora' };
      const detailDim = { tono: 'tone', tema: 'topic', formato: 'format', horario: 'hour' };
      const boosts = arr.filter((i) => i.kind === 'boost' && Number(i.lift_pct) > 0)
        .sort((a, b) => Number(b.lift_pct) - Number(a.lift_pct)).slice(0, 6);
      const drags = arr.filter((i) => i.kind === 'drag' && Number(i.lift_pct) < 0)
        .sort((a, b) => Number(a.lift_pct) - Number(b.lift_pct)).slice(0, 6);
      if (!boosts.length && !drags.length) {
        if (shouldHideEmpty()) return '';
        return `
          <section class="mb-section mb-section--wide">
            <div class="mb-chart-card">
              <div class="mb-card-title">Que te impulsa y que te frena</div>
              <div class="mb-causal-empty" style="margin:0;">No hay contenido propio analizado en esta ventana. Amplia el rango (prueba Todo el periodo).</div>
            </div>
          </section>`;
      }
      const maxAbs = Math.max(1, ...arr.map((i) => Math.abs(Number(i.lift_pct) || 0)));
      const row = (i) => {
        const lift = Math.round(Number(i.lift_pct) || 0);
        const w = Math.max(3, Math.round(Math.abs(lift) / maxAbs * 100));
        const label = `${dimLabel[i.dimension] || i.dimension} "${this._esc(this._causalValueLabel(i.dimension, i.value))}"`;
        const dd = detailDim[i.dimension];
        const attrs = dd ? `data-feat-detail data-dim="${dd}" data-value="${this._esc(i.value)}" data-title="${label}" role="button" tabindex="0"` : '';
        return `
          <div class="mb-lev-row${dd ? ' mb-feat-detail' : ''}" ${attrs}>
            <span class="mb-lev-label">${label}</span>
            <span class="mb-lev-val">${lift > 0 ? '+' : ''}${lift}%</span>
            <div class="mb-lev-track"><span class="mb-lev-bar" style="width:${w}%;"></span></div>
          </div>`;
      };
      const colNote = 'Sin senal clara aun.';
      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-chart-card">
            <div class="mb-card-title">Que te impulsa y que te frena</div>
            <div class="mb-lev">
              <div class="mb-lev-col mb-lev-col--neg">
                <div class="mb-lev-coltitle">Lo que te frena</div>
                ${drags.length ? drags.map(row).join('') : `<div class="mb-lev-empty">${colNote}</div>`}
              </div>
              <div class="mb-lev-col mb-lev-col--pos">
                <div class="mb-lev-coltitle">Lo que te impulsa</div>
                ${boosts.length ? boosts.map(row).join('') : `<div class="mb-lev-empty">${colNote}</div>`}
              </div>
            </div>
          </div>
        </section>`;
    },

    /* ── Analisis longitudinal: series temporales propias de la marca ──────
       Inspirado en el dashboard de AI Partner, pero unico para la marca
       (no por perfil monitoreado). 5 charts Chart.js: historial de actividad,
       tendencia de engagement, patron de horas, sentimientos y crecimiento. */
    _buildLongitudinalSection(data) {
      const L = data?.longitudinal || {};
      const act = Array.isArray(L.activity?.data) ? L.activity.data : [];
      if (!act.length) { if (shouldHideEmpty()) return ''; }
      const card = (id, title) => `
        <div class="mb-long-card">
          <div class="mb-long-card-title">${title}</div>
          <div class="mb-long-canvas"><canvas id="${id}"></canvas></div>
        </div>`;
      return `
        <section class="mb-section mb-section--wide mb-long">
          ${this._buildActivityBanner(data?.activity?.data)}
          ${!act.length ? `<div class="mb-causal-empty">Aun no hay suficiente historial. Amplia el rango (prueba Todo el periodo).</div>` : `
          <div class="mb-long-grid">
            <div class="mb-long-card mb-long-card--wide">
              <div class="mb-long-card-title">Historial de actividad</div>
              <div class="mb-long-canvas"><canvas id="mbLongActivity"></canvas></div>
            </div>
            ${card('mbLongEngagement', 'Tendencia de engagement')}
            <div class="mb-long-card">
              <div class="mb-long-card-title">Patron de horas de publicacion</div>
              ${this._buildPostingHeatmap(L.hours?.data)}
            </div>
            ${card('mbLongSentiment', 'Actividad de sentimientos')}
            ${card('mbLongGrowth', 'Crecimiento')}
          </div>`}
        </section>`;
    },

    /** Heatmap dia-de-semana x hora (intensidad = posts), estilo calendario. */
    _buildPostingHeatmap(rows) {
      const list = Array.isArray(rows) ? rows : [];
      const m = Array.from({ length: 7 }, () => new Array(24).fill(0));
      let max = 0;
      list.forEach((r) => {
        const d = Number(r.day_of_week), h = Number(r.hour_of_day), c = Number(r.posts_count) || 0;
        if (d >= 0 && d < 7 && h >= 0 && h < 24) { m[d][h] += c; if (m[d][h] > max) max = m[d][h]; }
      });
      if (!max) return `<div class="mb-causal-empty" style="margin:0;">Sin datos de horario aun.</div>`;
      const dayName = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      const order = [1, 2, 3, 4, 5, 6, 0];
      const bucket = (v) => { if (v <= 0) return 0; const r = v / max; if (r <= 0.25) return 1; if (r <= 0.5) return 2; if (r <= 0.75) return 3; return 4; };
      const rowsHtml = order.map((d) => {
        const cells = m[d].map((v, h) => `<span class="mb-heat-cell mb-heat-cell--l${bucket(v)}" title="${dayName[d]} ${h}:00 · ${v} ${v === 1 ? 'post' : 'posts'}"></span>`).join('');
        return `<span class="mb-heat-rowlbl">${dayName[d]}</span><div class="mb-heat-cells">${cells}</div>`;
      }).join('');
      return `
        <div class="mb-heat">
          <div class="mb-heat-legend">
            <span><i class="mb-heat-dot mb-heat-dot--l1"></i> Bajo</span>
            <span><i class="mb-heat-dot mb-heat-dot--l2"></i> Medio</span>
            <span><i class="mb-heat-dot mb-heat-dot--l3"></i> Alto</span>
            <span><i class="mb-heat-dot mb-heat-dot--l4"></i> Mejor</span>
          </div>
          <div class="mb-heat-grid">${rowsHtml}</div>
          <div class="mb-heat-axis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div>
        </div>`;
    },

    /** Choropleth de "Tu publico efectivo" — reusa window.AudienceMap (por pais). */
    async _renderAudienceMap(data) {
      const el = document.getElementById('mbEffMap');
      if (!el) return;
      if (typeof window.AudienceMap?.render !== 'function') { el.style.display = 'none'; return; }
      const geo = data?.audienceEffective?.data?.geo;
      const dist = {};
      (Array.isArray(geo) ? geo : []).forEach((g) => {
        const cc = g.country, v = Number(g.conversions) || 0;
        if (cc && /^[A-Z]{2}$/.test(cc) && v > 0) dist[cc] = (dist[cc] || 0) + v;
      });
      if (!Object.keys(dist).length) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.innerHTML = '';
      try { await window.AudienceMap.render(el, dist); } catch (_) {}
    },

    /** Radar "huella emocional" — resonancia por emocion (50 = tu promedio). */
    async _renderAudienceRadar(data) {
      const el = document.getElementById('mbAudienceRadar');
      if (!el) return;
      const list = (Array.isArray(data?.audiencePatterns?.data) ? data.audiencePatterns.data : [])
        .filter((r) => r.is_emotional && r.emotion && r.emotion !== 'emoción').slice(0, 8);
      if (list.length < 3) return;
      try { await this._ensureChartJs(); } catch (_) {}
      const Chart = window.Chart; if (!Chart) return;
      const labels = list.map((r) => this._causalValueLabel('emo', r.emotion));
      const idx = list.map((r) => { const lift = Number(r.lift_pct) || 0; return Math.max(0, Math.min(100, Math.round(50 * (1 + lift / 100)))); });
      const TICK = 'rgba(212,209,216,0.65)', GRID = 'rgba(255,255,255,0.06)';
      try {
        this._reg(new Chart(el.getContext('2d'), {
          type: 'radar',
          data: { labels, datasets: [
            { label: 'Tu promedio', data: labels.map(() => 50), borderColor: 'rgba(255,255,255,0.22)', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false },
            { label: 'Resonancia', data: idx, borderColor: '#7c83ff', backgroundColor: 'rgba(124,131,255,0.18)', borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#7c83ff', fill: true },
          ] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1b1d22', borderColor: '#34363A', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10,
                filter: (it) => it.datasetIndex === 1,
                callbacks: {
                  title: (items) => items[0]?.label || '',
                  label: (c) => { const r = list[c.dataIndex]; const lift = Math.round(Number(r.lift_pct) || 0); const pos = Math.round((Number(r.pos_ratio) || 0) * 100); return `${lift >= 0 ? '+' : ''}${lift}% vs tu promedio · ${pos}% positivo`; },
                },
              },
            },
            scales: { r: { min: 0, max: 100, grid: { color: GRID }, angleLines: { color: GRID }, pointLabels: { color: TICK, font: { size: 10 } }, ticks: { display: false, stepSize: 25 } } },
          },
        }));
      } catch (e) { console.warn('[audience radar]', e?.message); }
    },

    /** Matriz de oportunidad (bubble de cuadrantes) — uso (x) vs rendimiento (y). */
    async _renderPillarsBubble(data) {
      const el = document.getElementById('mbPillarsBubble');
      if (!el) return;
      const list = (Array.isArray(data?.pillars?.data) ? data.pillars.data : []).filter((r) => r.pillar);
      if (list.length < 2) return;
      try { await this._ensureChartJs(); } catch (_) {}
      const Chart = window.Chart; if (!Chart) return;
      const TICK = 'rgba(212,209,216,0.5)', GRID = 'rgba(255,255,255,0.06)';
      const color = (p) => p.orphan ? '#6bcf7f' : (p.y >= 0 ? '#5b9bd5' : '#e0a045');
      const points = list.map((r) => {
        const x = Math.max(0, Number(r.share_pct) || 0);
        const y = Math.round(Number(r.lift_pct) || 0);
        const orphan = r.is_orphan === true;
        return { x, y, r: orphan ? 11 : 8, label: r.pillar, orphan };
      });
      points.forEach((p) => { p.color = color(p); });
      const shares = points.map((p) => p.x), lifts = points.map((p) => p.y);
      const xThreshold = shares.reduce((s, v) => s + v, 0) / shares.length;
      const xMax = Math.max(10, Math.ceil(Math.max(...shares) * 1.2));
      const yMax = Math.max(10, Math.ceil(Math.max(...lifts, 0) * 1.25));
      const yMin = Math.min(0, Math.floor(Math.min(...lifts, 0) * 1.25));
      const quad = {
        id: 'pilQuad',
        beforeDatasetsDraw(chart) {
          const { ctx, chartArea: ca, scales } = chart; if (!ca) return;
          const xMid = scales.x.getPixelForValue(xThreshold), yMid = scales.y.getPixelForValue(0);
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(xMid, ca.top); ctx.lineTo(xMid, ca.bottom); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ca.left, yMid); ctx.lineTo(ca.right, yMid); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '700 9.5px ui-sans-serif, system-ui, sans-serif';
          ctx.textBaseline = 'top'; ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(107,207,127,0.65)'; ctx.fillText('EXPLOTALO', ca.left + 6, ca.top + 5);
          ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(212,209,216,0.38)'; ctx.fillText('TU FORMULA', ca.right - 6, ca.top + 5);
          ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(212,209,216,0.3)'; ctx.fillText('IGNORA', ca.left + 6, ca.bottom - 5);
          ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(224,160,69,0.6)'; ctx.fillText('REVISA', ca.right - 6, ca.bottom - 5);
          ctx.restore();
        },
        afterDatasetsDraw(chart) {
          const { ctx, chartArea: ca, scales } = chart; if (!ca) return;
          ctx.save();
          ctx.font = '600 10.5px ui-sans-serif, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(212,209,216,0.92)'; ctx.textBaseline = 'middle';
          const midX = (ca.left + ca.right) / 2;
          points.forEach((p) => {
            const px = scales.x.getPixelForValue(p.x), py = scales.y.getPixelForValue(p.y);
            if (px > midX) { ctx.textAlign = 'right'; ctx.fillText(p.label, px - p.r - 5, py); }
            else { ctx.textAlign = 'left'; ctx.fillText(p.label, px + p.r + 5, py); }
          });
          ctx.restore();
        },
      };
      try {
        this._reg(new Chart(el.getContext('2d'), {
          type: 'bubble',
          data: { datasets: [{
            data: points,
            backgroundColor: (c) => (points[c.dataIndex].color + '99'),
            borderColor: (c) => points[c.dataIndex].color,
            borderWidth: 1.5,
            hoverBackgroundColor: (c) => points[c.dataIndex].color,
          }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 6, right: 10, bottom: 2, left: 2 } },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1b1d22', borderColor: '#34363A', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10,
                callbacks: {
                  title: () => null,
                  label: (c) => { const p = points[c.dataIndex]; return `${p.label}: ${Math.round(p.x)}% de uso · ${p.y >= 0 ? '+' : ''}${p.y}% rendimiento${p.orphan ? ' · huerfano' : ''}`; },
                },
              },
            },
            scales: {
              x: { min: 0, max: xMax, grid: { color: GRID }, border: { display: false }, title: { display: true, text: '% de uso', color: TICK, font: { size: 10 } }, ticks: { color: TICK, font: { size: 9 }, callback: (v) => v + '%', maxTicksLimit: 6 } },
              y: { min: yMin, max: yMax, grid: { color: GRID }, border: { display: false }, title: { display: true, text: 'Rendimiento vs promedio', color: TICK, font: { size: 10 } }, ticks: { color: TICK, font: { size: 9 }, callback: (v) => (v > 0 ? '+' : '') + v + '%', maxTicksLimit: 6 } },
            },
          },
          plugins: [quad],
        }));
      } catch (e) { console.warn('[pillars bubble]', e?.message); }
    },

    /** Instancia los charts Chart.js del analisis longitudinal (post-render). */
    async _renderLongitudinalCharts(data) {
      this._destroyCharts();
      const L = data?.longitudinal; if (!L) return;
      const act  = Array.isArray(L.activity?.data) ? L.activity.data : [];
      if (!act.length) return;
      const eng  = Array.isArray(L.engagement?.data) ? L.engagement.data : [];
      const sent = Array.isArray(L.sentiment?.data) ? L.sentiment.data : [];
      const hrs  = Array.isArray(L.hours?.data) ? L.hours.data : [];
      try { await this._ensureChartJs(); } catch (_) {}
      const Chart = window.Chart;
      if (!Chart || !document.getElementById('mbLongActivity')) return;

      const TICK = 'rgba(212,209,216,0.45)';
      const GRID = 'rgba(255,255,255,0.05)';
      const grad = (cv, hex) => {
        const ctx = cv.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, cv.height || 180);
        g.addColorStop(0, hex + '4D'); g.addColorStop(1, hex + '00');
        return g;
      };
      const baseOpts = (yFmt) => ({
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#1b1d22', borderColor: '#34363A', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10, displayColors: true },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: TICK, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { grid: { color: GRID }, border: { display: false }, beginAtZero: true, ticks: { color: TICK, font: { size: 10 }, maxTicksLimit: 5, callback: yFmt || ((v) => v) } },
        },
      });
      const compact = (v) => this._compactNum(v);
      const areaDs = (cv, label, dataArr, hex) => ({
        label, data: dataArr, borderColor: hex, backgroundColor: grad(cv, hex),
        fill: true, tension: 0.4, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: hex,
      });
      const reg = (c) => this._reg(c);
      const mk = (id, cfg) => { const cv = document.getElementById(id); if (!cv) return; try { reg(new Chart(cv, cfg)); } catch (e) { console.warn('[long chart]', id, e?.message); } };

      // Colores del degradado dinamico de la marca (los mismos que inyecta
      // OrgBrandTheme desde brand_colors). Fallback: parsear --brand-gradient-dynamic,
      // y si no hay nada, el arcoiris estatico (azul->morado->magenta->naranja).
      const brandHexes = (() => {
        try {
          const fromTheme = window.OrgBrandTheme?.getLastBrandHexes?.() || [];
          if (fromTheme.length >= 2) return fromTheme.slice(0, 4);
          const cs = getComputedStyle(document.documentElement);
          const grad = (cs.getPropertyValue('--brand-gradient-dynamic') ||
                        cs.getPropertyValue('--brand-gradient') || '').trim();
          const m = grad.match(/#[0-9a-fA-F]{6,8}/g);
          if (m && m.length >= 2) return m.slice(0, 4);
        } catch (_) { /* noop */ }
        return ['#0063FF', '#814AC8', '#FF004D', '#FF5C23'];
      })();
      const hexToRgba = (hex, alpha) => {
        let h = hex.replace('#', '');
        if (h.length === 8) h = h.slice(0, 6);
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        return alpha == null ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
      };

      // Gradiente horizontal de marca scriptable: reparte los hex de marca a lo
      // largo del area de plot (ancho real disponible tras el layout).
      const brandStops = (g, alpha) => {
        const n = brandHexes.length;
        brandHexes.forEach((hex, i) => g.addColorStop(n === 1 ? 0 : i / (n - 1), hexToRgba(hex, alpha)));
        return g;
      };
      const brandLine = (cxt) => { const ch = cxt.chart; const { ctx, chartArea } = ch; if (!chartArea) return brandHexes[0]; return brandStops(ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)); };
      const brandFill = (cxt) => { const ch = cxt.chart; const { ctx, chartArea } = ch; if (!chartArea) return hexToRgba(brandHexes[0], 0.16); return brandStops(ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0), 0.16); };

      // 1. Historial de actividad (posts por periodo) — linea con degradado de marca
      const actLabels = act.map((r) => r.period_label);
      mk('mbLongActivity', { type: 'line', data: { labels: actLabels, datasets: [{
        label: 'Posts', data: act.map((r) => Number(r.posts_count) || 0),
        borderColor: brandLine, backgroundColor: brandFill, fill: true, tension: 0.4, borderWidth: 2.5,
        pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: brandHexes[brandHexes.length - 1],
      }] }, options: baseOpts() });

      // 2. Tendencia de engagement
      if (eng.length) {
        const cv = document.getElementById('mbLongEngagement');
        mk('mbLongEngagement', { type: 'line', data: { labels: eng.map((r) => r.period_label), datasets: [areaDs(cv, 'Engagement', eng.map((r) => Number(r.total_engagement) || 0), '#6bcf7f')] }, options: baseOpts(compact) });
      }

      // 3. Patron de horas → heatmap CSS (no Chart.js), construido en _buildPostingHeatmap.

      // 4. Actividad de sentimientos (positivo / negativo / neutro)
      if (sent.length) {
        const sLbl = sent.map((r) => this._fmtMonthLabel(r.period_start));
        const cv = document.getElementById('mbLongSentiment');
        mk('mbLongSentiment', { type: 'line', data: { labels: sLbl, datasets: [
          areaDs(cv, 'Positivo', sent.map((r) => Number(r.positive_posts) || 0), '#6bcf7f'),
          areaDs(cv, 'Neutro', sent.map((r) => Number(r.neutral_posts) || 0), '#8a8a8e'),
          areaDs(cv, 'Negativo', sent.map((r) => Number(r.negative_posts) || 0), '#e06464'),
        ] }, options: { ...baseOpts(), plugins: { legend: { display: true, labels: { color: TICK, boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 10 } } }, tooltip: baseOpts().plugins.tooltip } } });
      }

      // 5. Crecimiento (variacion % de engagement periodo a periodo)
      if (eng.length > 1) {
        const growth = eng.map((r, i) => {
          if (i === 0) return 0;
          const prev = Number(eng[i - 1].total_engagement) || 0;
          const cur = Number(r.total_engagement) || 0;
          return prev > 0 ? Math.round((cur - prev) / prev * 100) : 0;
        });
        const cv = document.getElementById('mbLongGrowth');
        mk('mbLongGrowth', { type: 'line', data: { labels: eng.map((r) => r.period_label), datasets: [areaDs(cv, 'Crecimiento %', growth, '#e0a045')] }, options: baseOpts((v) => `${v}%`) });
      }
    },

    _fmtMonthLabel(ts) {
      try { return new Date(ts).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }); }
      catch (_) { return ''; }
    },

    /* Seccion causal: 'boost' = lo que te impulsa, 'drag' = lo que te resta.
       Cada card muestra el resultado + lift vs tu promedio + el POR QUE
       (emocion + sentimiento) + evidencia + ver detalles. */
    _buildCausalSection(insights, kind) {
      const items = (insights || []).filter((i) => i.kind === kind);
      const title = kind === 'boost' ? 'Lo que te esta funcionando' : 'Lo que te esta restando';
      const hint  = kind === 'boost'
        ? 'Lo que mas conecta con tu gente — y que hacer para aprovecharlo'
        : 'Lo que baja tu rendimiento frente a lo que sueles lograr — y como corregirlo';
      if (!items.length) {
        if (shouldHideEmpty()) return '';
        return `
          <section class="mb-section">
            <div class="mb-section-head"><span class="mb-section-title">${title}</span></div>
            <div class="mb-causal-empty">No hay contenido propio analizado en esta ventana. Amplia el rango (prueba <b>Todo el periodo</b>) para ver el analisis causal de tu marca.</div>
          </section>`;
      }
      // Orden: boost por mayor lift; drag por lift mas negativo.
      items.sort((a, b) => kind === 'boost'
        ? Number(b.lift_pct) - Number(a.lift_pct)
        : Number(a.lift_pct) - Number(b.lift_pct));
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">${title}</span>
            <span class="mb-section-hint">${hint}</span>
          </div>
          <div class="mb-causal-grid">${items.map((i) => this._buildCausalCard(i, kind)).join('')}</div>
        </section>`;
    },

    /* Card causal en formato TODO PUBLICO: lenguaje de a pie + visual que se
       explica solo (numero grande comparativo + pictograma "X de cada 10").
       Estructura de historia: titulo en humano → que significa → evidencia
       → que hacer. La metrica es evidencia, no encabezado. */
    _buildCausalCard(i, kind) {
      const meta = {
        tono:    { detailDim: 'tone',   what: 'forma de hablar', headUp: 'Tu mejor forma de hablar',     headDown: 'Una forma de hablar que te resta', actUp: 'Publica mas con este tono esta semana',  actDown: 'Usa menos este tono' },
        tema:    { detailDim: 'topic',  what: 'tema',            headUp: 'Tu tema mas potente',           headDown: 'Un tema que te resta',             actUp: 'Crea mas contenido sobre este tema',     actDown: 'Habla menos de este tema' },
        formato: { detailDim: 'format', what: 'tipo de post',    headUp: 'Tu tipo de publicacion ganador',headDown: 'Un tipo de publicacion que te resta',actUp: 'Haz mas publicaciones de este tipo',     actDown: 'Reduce este tipo de publicacion' },
        horario: { detailDim: 'hour',   what: 'horario',         headUp: 'Tu mejor hora para publicar',   headDown: 'Una hora que te resta',            actUp: 'Publica mas a esta hora',                actDown: 'Evita publicar a esta hora' },
      }[i.dimension] || { detailDim: i.dimension, what: i.dimension, headUp: 'Lo que te funciona', headDown: 'Lo que te resta', actUp: 'Haz mas de esto', actDown: 'Reduce esto' };

      const isUp   = kind === 'boost';
      const lift   = Math.round(Number(i.lift_pct) || 0);
      const absLift = Math.abs(lift);
      const value  = i.dimension === 'horario'
        ? `las ${String(parseInt(i.value, 10) || 0).padStart(2, '0')}:00`
        : this._causalValueLabel(i.dimension, i.value);
      const posRatio = Number.isFinite(Number(i.pos_ratio)) ? Number(i.pos_ratio) : null;
      const n      = Number(i.post_count) || 0;

      // Encabezado en humano + frase que explica el por que sin jerga.
      const headline = `${isUp ? meta.headUp : meta.headDown}: ${value}`;
      const sent = this._tpSentimentPhrase(posRatio);
      const say = isUp
        ? `Cuando publicas asi, la gente interactua (likes, comentarios, compartidos) un <b>${absLift}% mas</b> que de costumbre${sent ? ` — ${sent}` : ''}.`
        : `Cuando publicas asi, la gente interactua un <b>${absLift}% menos</b> que de costumbre${sent ? ` — ${sent}` : ''}.`;

      // Visual: numero grande comparativo + pictograma de reaccion.
      const filled = posRatio != null ? Math.round(posRatio * 10) : null;
      const picto = filled != null
        ? `<div class="mb-tp-picto">
             ${this._pictograph10(filled)}
             <span class="mb-tp-picto-cap"><b>${filled} de cada 10</b> reaccionan bien</span>
           </div>`
        : '';

      const detailValue = i.dimension === 'horario' ? String(parseInt(i.value, 10) || 0) : i.value;

      return `
        <article class="mb-causal-card mb-tp-card mb-causal-card--${kind}"
                 data-feat-detail data-dim="${this._esc(meta.detailDim)}"
                 data-value="${this._esc(detailValue)}" data-title="${this._esc(headline)}"
                 role="button" tabindex="0">
          <div class="mb-tp-head">
            <span class="mb-tp-mark mb-tp-mark--${isUp ? 'up' : 'down'}">${isUp ? '✓' : '!'}</span>
            <span class="mb-tp-title" title="${this._esc(headline)}">${this._esc(headline)}</span>
          </div>
          <p class="mb-tp-say">${say}</p>
          <div class="mb-tp-viz">
            <div class="mb-tp-big mb-tp-big--${isUp ? 'up' : 'down'}">
              <span class="mb-tp-big-num">${isUp ? '↑' : '↓'} ${absLift}%</span>
              <span class="mb-tp-big-cap">${isUp ? 'mejor' : 'peor'} que de costumbre</span>
            </div>
            ${picto}
          </div>
          <div class="mb-tp-foot">
            <span class="mb-tp-evidence">Lo vimos en ${n} ${n === 1 ? 'publicacion' : 'publicaciones'} tuyas</span>
            <span class="mb-tp-action">${this._esc(isUp ? meta.actUp : meta.actDown)} <i class="fas fa-arrow-right"></i></span>
          </div>
        </article>`;
    },

    /** Traduce el % de reaccion positiva a una frase de a pie (sin "sentimiento"). */
    _tpSentimentPhrase(posRatio) {
      if (posRatio == null) return '';
      const p = Math.round(posRatio * 100);
      if (p >= 70) return 'a casi todos les gusta';
      if (p >= 50) return 'a la mayoria le gusta';
      if (p >= 30) return 'aunque a varios no les convence';
      return 'pero a muchos no les convence';
    },

    /** Pictograma de 10 puntos: X llenos = X de cada 10 (legible sin saber leer datos). */
    _pictograph10(filled) {
      const f = Math.max(0, Math.min(10, Math.round(Number(filled) || 0)));
      let dots = '';
      for (let k = 0; k < 10; k++) dots += `<span class="mb-tp-dot${k < f ? ' mb-tp-dot--on' : ''}"></span>`;
      return `<div class="mb-tp-dots" aria-hidden="true">${dots}</div>`;
    },

    /* Seccion "Patrones de tu publico": resonancia emocional del contenido.
       Que emocion despierta tu contenido y como responde tu audiencia. */
    _buildAudienceSection(rows) {
      // Filtra el label basura 'emoción' del clasificador.
      const list = (Array.isArray(rows) ? rows : []).filter((r) => r.emotion && r.emotion !== 'emoción');
      if (!list.length) {
        if (shouldHideEmpty()) return '';
        return '';
      }
      // Radar ("huella emocional") si hay >=3 emociones; si no, lista fallback.
      const emo = list.filter((r) => r.is_emotional && r.emotion);
      const body = emo.length >= 3
        ? `<div class="mb-aud-radar"><canvas id="mbAudienceRadar"></canvas></div>`
        : `<div class="mb-aud-list">${list.map((r) => this._buildAudienceRow(r)).join('')}</div>`;
      return `
        <section class="mb-section">
          <div class="mb-chart-card">
            <div class="mb-card-title">Patrones de tu publico</div>
            ${body}
          </div>
        </section>`;
    },

    _buildAudienceRow(r) {
      const emotional = r.is_emotional === true;
      const lift = Math.round(Number(r.lift_pct) || 0);
      const isUp = lift >= 0;
      const pos  = Number.isFinite(Number(r.pos_ratio)) ? Math.round(Number(r.pos_ratio) * 100) : null;
      const n    = Number(r.post_count) || 0;
      const name = emotional
        ? this._causalValueLabel('emo', r.emotion)
        : 'Contenido sin carga emocional';
      // Barra de resonancia desde el centro (vs tu promedio).
      const barW = Math.min(50, Math.abs(lift) / 4);
      const clickable = emotional;
      const dataAttrs = clickable
        ? `data-feat-detail data-dim="emotion" data-value="${this._esc(r.emotion)}" data-title="Patrones de tu publico: ${this._esc(name)}" role="button" tabindex="0"`
        : '';
      return `
        <div class="mb-aud-row${clickable ? ' mb-aud-row--clickable' : ''} mb-aud-row--${isUp ? 'up' : 'down'}" ${dataAttrs}>
          <div class="mb-aud-name">
            <span class="mb-aud-emotion">${this._esc(name)}</span>
            <span class="mb-aud-count">${n} ${n === 1 ? 'post' : 'posts'}</span>
          </div>
          <div class="mb-aud-bar"><span style="width:${barW}%;"></span></div>
          <div class="mb-aud-stats">
            <span class="mb-aud-lift mb-aud-lift--${isUp ? 'up' : 'down'}">${isUp ? '▲ +' : '▼ '}${lift}%</span>
            ${pos != null ? `<span class="mb-aud-pos">${pos}% positivo</span>` : ''}
          </div>
        </div>`;
    },

    /* ── Tu publico efectivo: a quien estas convirtiendo (geo + captacion) ── */
    _buildEffectiveAudienceSection(e, insights) {
      if (!e || e.capture_level === 'sin_datos' || !Number(e.total_conversions)) {
        if (shouldHideEmpty()) return '';
        return '';
      }
      const levelMeta = {
        alta:  { color: '#6e9f81', label: 'Alta' },
        media: { color: '#9c8e6b', label: 'Media' },
        baja:  { color: '#b3796f', label: 'Baja' },
      }[e.capture_level] || { color: '#8a8a8e', label: e.capture_level };

      const objLabel = {
        OUTCOME_LEADS: 'Leads / Formularios',
        OUTCOME_SALES: 'Ventas',
        OUTCOME_TRAFFIC: 'Tráfico',
        OUTCOME_ENGAGEMENT: 'Interacción',
        OUTCOME_AWARENESS: 'Reconocimiento',
      }[e.objective] || (e.objective ? this._humanizeMission?.(e.objective) || e.objective : null);

      const geo = Array.isArray(e.geo) ? e.geo : [];
      const flag = (cc) => cc === 'CO' ? '🇨🇴' : cc === 'MX' ? '🇲🇽' : '📍';
      const geoRows = geo.map((g) => {
        const conv = Number(g.conversions) || 0;
        const share = Math.max(0, Number(g.share_pct) || 0);
        const zero = conv === 0;
        return `
          <div class="mb-eff-geo${zero ? ' mb-eff-geo--zero' : ''}">
            <span class="mb-eff-geo-name">${flag(g.country)} ${this._esc(this._causalValueLabel('loc', g.location))}</span>
            <div class="mb-eff-geo-bar"><span style="width:${zero ? 0 : Math.max(4, share)}%;"></span></div>
            <span class="mb-eff-geo-val">${zero ? 'no convierte' : `${this._compactNum(conv)} · ${share}%`}</span>
          </div>`;
      }).join('');

      // Lo que los atrae: top boost de tono + tema de la seccion causal.
      const boosts = (Array.isArray(insights) ? insights : []).filter((i) => i.kind === 'boost');
      const tono = boosts.find((i) => i.dimension === 'tono')?.value;
      const tema = boosts.find((i) => i.dimension === 'tema')?.value;
      const atrae = (tono || tema)
        ? `Lo que mejor los atrae: ${tono ? `tono <b>${this._esc(this._causalValueLabel('tono', tono))}</b>` : ''}${tono && tema ? ' + ' : ''}${tema ? `tema <b>${this._esc(this._causalValueLabel('tema', tema))}</b>` : ''}`
        : '';

      return `
        <section class="mb-section">
          <div class="mb-eff-card">
            <div class="mb-card-title">Tu publico efectivo</div>
            <div class="mb-eff-top">
              <div class="mb-eff-capture">
                <span class="mb-eff-capture-label">Captacion</span>
                <span class="mb-eff-capture-level" style="color:${levelMeta.color};">${this._esc(levelMeta.label)}</span>
              </div>
              <div class="mb-eff-summary">
                <span class="mb-eff-total">${this._compactNum(e.total_conversions)} <span class="mb-eff-total-unit">leads reales</span></span>
                ${objLabel ? `<span class="mb-eff-obj">Objetivo: ${this._esc(objLabel)}</span>` : ''}
              </div>
            </div>
            <div class="mb-eff-geo-block">
              <span class="mb-eff-geo-title">Donde conviertes</span>
              <div class="mb-eff-map" id="mbEffMap"></div>
              <div class="mb-eff-geos">${geoRows}</div>
            </div>
            ${atrae ? `<p class="mb-eff-atrae">${atrae}</p>` : ''}
          </div>
        </section>`;
    },

    /* ── Evolucion: impacto social en el tiempo (la pelicula) ─────────── */
    _buildEvolutionSection(e) {
      const series = Array.isArray(e?.series) ? e.series : [];
      if (!e || e.verdict === 'sin_datos' || series.length < 2) {
        if (shouldHideEmpty()) return '';
        return '';
      }
      const meta = {
        mejorando: { color: '#6e9f81', label: 'Mejorando', icon: 'fas fa-arrow-trend-up' },
        estable:   { color: '#8a8a8e', label: 'Estable',   icon: 'fas fa-arrows-left-right' },
        cayendo:   { color: '#b3796f', label: 'Cayendo',   icon: 'fas fa-arrow-trend-down' },
      }[e.verdict] || { color: '#8a8a8e', label: e.verdict, icon: 'fas fa-chart-line' };

      const chg = Number(e.impact_change_pct);
      const sentChg = Number(e.sentiment_change_pts);
      const chgStr = Number.isFinite(chg) ? `${chg >= 0 ? '+' : ''}${chg}%` : '';
      const summary = e.verdict === 'mejorando'
        ? `Tu impacto viene subiendo (${chgStr}) frente a tus inicios${Number.isFinite(sentChg) && sentChg !== 0 ? ` · sentimiento ${sentChg >= 0 ? '+' : ''}${sentChg} pts` : ''}.`
        : e.verdict === 'cayendo'
        ? `Tu impacto viene cayendo (${chgStr}) frente a tus inicios. Revisa que cambiaste.`
        : `Tu impacto se mantiene estable en el tiempo.`;

      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-evo-card">
            <div class="mb-card-title">Evolucion</div>
            <div class="mb-evo-top">
              <span class="mb-evo-verdict" style="color:${meta.color};"><i class="${meta.icon}"></i> ${this._esc(meta.label)} ${chgStr ? `<span class="mb-evo-chg">${chgStr}</span>` : ''}</span>
              <span class="mb-evo-range">${this._esc(series[0].period)} → ${this._esc(series[series.length - 1].period)} · ${e.months} ${e.months === 1 ? 'mes' : 'meses'} con data</span>
            </div>
            ${this._buildEvolutionSpark(series, meta.color)}
            <p class="mb-evo-summary">${this._esc(summary)}</p>
          </div>
        </section>`;
    },

    /** Sparkline SVG de la serie de impacto en el tiempo. */
    _buildEvolutionSpark(series, color) {
      const vals = series.map((s) => Number(s.impact) || 0);
      const max = Math.max(...vals, 0.001);
      const W = 600, H = 60, pad = 4;
      const n = vals.length;
      const pts = vals.map((v, i) => {
        const x = pad + (n === 1 ? 0 : (i / (n - 1)) * (W - pad * 2));
        const y = H - pad - (v / max) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const dots = vals.map((v, i) => {
        const [x, y] = pts[i].split(',');
        return `<circle cx="${x}" cy="${y}" r="2.2" fill="${color}"/>`;
      }).join('');
      return `
        <div class="mb-evo-spark">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="60" aria-label="Evolucion de impacto">
            <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
            ${dots}
          </svg>
        </div>`;
    },

    /* ── Actividad: ritmo de publicacion propio en el tiempo ──────────── */
    /** Banner de actividad para el tope de Analisis Longitudinal (estado + redes). */
    _buildActivityBanner(a) {
      if (!a || a.status === 'sin_datos' || !Number(a.total)) return '';
      const statusMeta = {
        activo:    { color: '#6e9f81', label: 'Activo' },
        irregular: { color: '#9c8e6b', label: 'Irregular' },
        lento:     { color: '#9c8e6b', label: 'Lento' },
        dormido:   { color: '#b3796f', label: 'Dormido' },
      }[a.status] || { color: '#8a8a8e', label: a.status };
      const days = Number(a.days_since);
      const headline = a.status === 'dormido'
        ? `Llevas <strong>${this._daysHuman(days)}</strong> sin publicar`
        : `Tu ultima publicacion fue hace <strong>${this._daysHuman(days)}</strong>`;
      const nets = (Array.isArray(a.networks) ? a.networks : []).map((n) =>
        `<span class="mb-actb-net">${this._esc(this._prettyPlatform(n.network))} · ${Number(n.posts)} ${Number(n.posts) === 1 ? 'post' : 'posts'} · hace ${this._daysHuman(Number(n.days_since))}</span>`).join('');
      return `
        <div class="mb-actb">
          <div class="mb-actb-status">
            <span class="mb-act-dot" style="background:${statusMeta.color};"></span>
            <span class="mb-actb-label" style="color:${statusMeta.color};">${this._esc(statusMeta.label)}</span>
            <span class="mb-actb-headline">${headline}</span>
          </div>
          ${nets ? `<div class="mb-actb-nets">${nets}</div>` : ''}
        </div>`;
    },

    _buildActivitySection(a) {
      if (!a || a.status === 'sin_datos' || !Number(a.total)) {
        if (shouldHideEmpty()) return '';
        return '';
      }
      const statusMeta = {
        activo:    { color: '#6e9f81', label: 'Activo' },
        irregular: { color: '#9c8e6b', label: 'Irregular' },
        lento:     { color: '#9c8e6b', label: 'Lento' },
        dormido:   { color: '#b3796f', label: 'Dormido' },
      }[a.status] || { color: '#8a8a8e', label: a.status };
      const days = Number(a.days_since);
      const headline = a.status === 'dormido'
        ? `Llevas <strong>${this._daysHuman(days)}</strong> sin publicar`
        : `Tu ultima publicacion fue hace <strong>${this._daysHuman(days)}</strong>`;

      const nets = (Array.isArray(a.networks) ? a.networks : []).map((n) => `
        <div class="mb-act-net">
          <span class="mb-act-net-name">${this._esc(this._prettyPlatform(n.network))}</span>
          <span class="mb-act-net-posts">${Number(n.posts)} ${Number(n.posts) === 1 ? 'post' : 'posts'}</span>
          <span class="mb-act-net-since">hace ${this._daysHuman(Number(n.days_since))}</span>
        </div>`).join('');

      return `
        <section class="mb-section">
          <div class="mb-act-card">
            <div class="mb-card-title">Actividad</div>
            <div class="mb-act-status">
              <span class="mb-act-dot" style="background:${statusMeta.color};"></span>
              <span class="mb-act-status-label" style="color:${statusMeta.color};">${this._esc(statusMeta.label)}</span>
              <span class="mb-act-headline">${headline}</span>
            </div>
            ${this._buildActivitySparkline(a.timeline)}
            <div class="mb-act-nets">${nets}</div>
          </div>
        </section>`;
    },

    _buildActivitySparkline(timeline) {
      const list = (Array.isArray(timeline) ? timeline : []).slice(-24);
      if (list.length < 2) return '';
      const max = Math.max(1, ...list.map((t) => Number(t.posts) || 0));
      const bars = list.map((t) => {
        const h = Math.round((Number(t.posts) || 0) / max * 100);
        return `<span class="mb-act-bar" style="height:${Math.max(3, h)}%;" title="${this._esc(t.month)}: ${Number(t.posts)} posts"></span>`;
      }).join('');
      const first = list[0]?.month || '';
      const last  = list[list.length - 1]?.month || '';
      return `
        <div class="mb-act-spark-wrap">
          <div class="mb-act-spark">${bars}</div>
          <div class="mb-act-spark-axis"><span>${this._esc(first)}</span><span>${this._esc(last)}</span></div>
        </div>`;
    },

    _daysHuman(d) {
      const n = Number(d) || 0;
      if (n < 60) return `${n} dias`;
      return `${n} dias (${Math.round(n / 30)} meses)`;
    },

    /* ── Pilares narrativos: de que hablas + temas huerfanos ──────────── */
    _buildPillarsSection(rows) {
      const list = (Array.isArray(rows) ? rows : []).filter((r) => r.pillar);
      if (!list.length) {
        if (shouldHideEmpty()) return '';
        return '';
      }
      const avg = list.reduce((s, r) => s + (Number(r.share_pct) || 0), 0) / Math.max(1, list.length);
      // Veredicto en lenguaje plano por pilar. rank = prioridad de accion.
      const verdictOf = (r) => {
        const share = Number(r.share_pct) || 0, lift = Number(r.lift_pct) || 0;
        if (r.is_orphan || (lift > 0 && share < avg * 0.6)) return { k: 'explota', rank: 0, label: 'Explotalo', icon: 'fa-gem', say: (ls, s) => `Rinde ${ls} pero es solo el ${s}% de tu contenido — produce mas de esto.` };
        if (lift < 0 && share >= avg) return { k: 'revisa', rank: 1, label: 'Revisa', icon: 'fa-triangle-exclamation', say: (ls, s) => `Es el ${s}% de tu contenido pero rinde ${ls} — replantealo o reducelo.` };
        if (lift >= 0) return { k: 'formula', rank: 2, label: 'Tu formula', icon: 'fa-circle-check', say: (ls, s) => `Rinde ${ls} y ya es el ${s}% de lo que publicas — mantenlo.` };
        return { k: 'flojo', rank: 3, label: 'Bajo perfil', icon: 'fa-circle-minus', say: (ls, s) => `Poco uso (${s}%) y rinde ${ls} — baja prioridad.` };
      };
      const cards = list.map((r) => ({ r, v: verdictOf(r) }))
        .sort((a, b) => a.v.rank - b.v.rank || Math.abs(Number(b.r.lift_pct) || 0) - Math.abs(Number(a.r.lift_pct) || 0))
        .map(({ r, v }) => {
          const share = Math.round(Number(r.share_pct) || 0);
          const lift = Math.round(Number(r.lift_pct) || 0);
          const ls = `${lift >= 0 ? '+' : ''}${lift}%`;
          const barW = Math.min(100, Math.max(3, share));
          return `
            <div class="mb-pil2 mb-pil2--${v.k}" data-feat-detail data-dim="pillar" data-value="${this._esc(r.pillar)}" data-title="Pilar: ${this._esc(r.pillar)}" role="button" tabindex="0">
              <div class="mb-pil2-top">
                <span class="mb-pil2-verdict"><i class="fas ${v.icon}"></i> ${v.label}</span>
                <span class="mb-pil2-name">${this._esc(r.pillar)}</span>
                <span class="mb-pil2-lift">${ls}</span>
              </div>
              <p class="mb-pil2-say">${this._esc(v.say(ls, share))}</p>
              <div class="mb-pil2-foot">
                <div class="mb-pil2-track"><span class="mb-pil2-fill" style="width:${barW}%;"></span></div>
                <span class="mb-pil2-share">${share}% de tu contenido</span>
              </div>
            </div>`;
        }).join('');
      return `
        <section class="mb-section">
          <div class="mb-pil2-list">${cards}</div>
        </section>`;
    },

    _buildPillarRow(r) {
      const share = Math.max(0, Math.min(100, Number(r.share_pct) || 0));
      const lift  = Math.round(Number(r.lift_pct) || 0);
      const isUp  = lift >= 0;
      const orphan = r.is_orphan === true;
      return `
        <div class="mb-pil-row${orphan ? ' mb-pil-row--orphan' : ''} mb-pil-row--clickable"
             data-feat-detail data-dim="pillar" data-value="${this._esc(r.pillar)}"
             data-title="Pilar: ${this._esc(r.pillar)}" role="button" tabindex="0">
          <div class="mb-pil-name">
            <span class="mb-pil-pillar">${this._esc(r.pillar)}</span>
            ${orphan ? `<span class="mb-pil-orphan-badge">Huerfano · explotalo</span>` : ''}
          </div>
          <div class="mb-pil-share">
            <div class="mb-pil-bar"><span style="width:${share}%;"></span></div>
            <span class="mb-pil-share-pct">${share}%</span>
          </div>
          <span class="mb-pil-lift mb-pil-lift--${isUp ? 'up' : 'down'}">${isUp ? '▲ +' : '▼ '}${lift}%</span>
        </div>`;
    },

    /** Formatea el valor de la dimension para mostrar. */
    _causalValueLabel(dim, val) {
      if (dim === 'horario') return `${val}`;
      const s = String(val || '').replace(/_/g, ' ');
      return s.charAt(0).toUpperCase() + s.slice(1);
    },

    /* ════════════════════════════════════════════════════════════════
       Diagnóstico Estratégico (SWOT dinámico)
       Virtudes (qué hace bien la marca) | Vulnerabilidades (golpes)
       ════════════════════════════════════════════════════════════════ */
    _buildSwotCard(data) {
      const virtudes = this._deriveVirtudes(data);
      const vulnerabilidades = this._deriveVulnerabilidades(data);

      const hasAny = virtudes.length > 0 || vulnerabilidades.length > 0;
      if (!hasAny && shouldHideEmpty()) return '';

      return `
        <section class="mb-swot-card">
          <header class="mb-swot-header">
            <div class="mb-swot-title">Diagnóstico Estratégico</div>
            <div class="mb-swot-subtitle">Vera detecta qué estás haciendo bien y dónde te están golpeando.</div>
          </header>

          <div class="mb-swot-grid">
            <div class="mb-swot-col mb-swot-col--virtudes">
              <div class="mb-swot-col-header">
                <span class="mb-swot-col-dot mb-swot-col-dot--pos"></span>
                <span class="mb-swot-col-name">Virtudes</span>
                <span class="mb-swot-col-count">${virtudes.length}</span>
              </div>
              ${virtudes.length === 0
                ? `<div class="mb-swot-empty">Vera aún no detecta fortalezas claras en la ventana.</div>`
                : `<ul class="mb-swot-list">${virtudes.map(v => this._buildSwotItem(v, 'pos')).join('')}</ul>`
              }
            </div>

            <div class="mb-swot-col mb-swot-col--vulnerabilidades">
              <div class="mb-swot-col-header">
                <span class="mb-swot-col-dot mb-swot-col-dot--neg"></span>
                <span class="mb-swot-col-name">Vulnerabilidades</span>
                <span class="mb-swot-col-count">${vulnerabilidades.length}</span>
              </div>
              ${vulnerabilidades.length === 0
                ? `<div class="mb-swot-empty">Sin vulnerabilidades activas. ✓</div>`
                : `<ul class="mb-swot-list">${vulnerabilidades.map(v => this._buildSwotItem(v, 'neg')).join('')}</ul>`
              }
            </div>
          </div>
        </section>`;
    },

    _buildSwotItem(item, polarity) {
      const sev = item.severity ? ` mb-swot-item--${item.severity}` : '';
      return `
        <li class="mb-swot-item mb-swot-item--${polarity}${sev}">
          <div class="mb-swot-item-head">
            <span class="mb-swot-item-label">${this._esc(item.label)}</span>
            ${item.tag ? `<span class="mb-swot-item-tag">${this._esc(item.tag)}</span>` : ''}
          </div>
          ${item.detail ? `<p class="mb-swot-item-detail">${this._esc(item.detail)}</p>` : ''}
        </li>`;
    },

    /** Virtudes: combina componentes de salud "bueno", featured top y winners. */
    _deriveVirtudes(data) {
      const out = [];
      const health = data?.health?.data;
      const featured = data?.featured || {};
      const wb = data?.winnersVsBurners?.data || {};

      // 1. Componentes de salud con verdict 'bueno'
      if (Array.isArray(health?.breakdown)) {
        for (const b of health.breakdown) {
          if (b.verdict === 'bueno' && b.gap_description) {
            out.push({
              label:  b.label,
              tag:    `${b.raw_score}/100`,
              detail: b.gap_description,
            });
          }
        }
      }

      // 2. Featured top — qué te está funcionando
      const topic = (featured.topic?.data || [])[0];
      if (topic?.topic) {
        out.push({
          label:  `Tema "${topic.topic}"`,
          tag:    `${this._compactNum(topic.total_engagement)} eng`,
          detail: `Tu tema más exitoso en la ventana — ${topic.usage_count} posts.`,
        });
      }
      const tone = (featured.tones?.data || [])[0];
      if (tone?.tone_name) {
        out.push({
          label:  `Tono "${tone.tone_name}"`,
          tag:    `${this._compactNum(tone.total_engagement)} eng`,
          detail: `Tu tono más efectivo — ${tone.posts_count} posts conectan con tu audiencia.`,
        });
      }
      const hour = (featured.hour?.data || [])[0];
      if (hour?.hour != null) {
        out.push({
          label:  `Horario ${String(hour.hour).padStart(2, '0')}:00`,
          tag:    `${this._compactNum(hour.avg_engagement_per_post)} eng/post`,
          detail: `Tu micro-momento ganador del día — ${hour.posts_count} publicaciones lo confirman.`,
        });
      }

      // 3. Winners de campañas
      const winners = Array.isArray(wb.winners) ? wb.winners : [];
      for (const w of winners.slice(0, 2)) {
        out.push({
          label:  w.nombre_campana,
          tag:    `${this._compactNum(w.conversions)} conv`,
          detail: w.description || `Campaña convirtiendo a $${Math.round(w.cost_per_conv || 0).toLocaleString('es-CO')}/conv.`,
        });
      }

      return out.slice(0, 6);
    },

    /** Vulnerabilidades: brand_vulnerabilities + top_gaps + burners. */
    _deriveVulnerabilidades(data) {
      const out = [];
      const health = data?.health?.data;
      const wb = data?.winnersVsBurners?.data || {};
      const vulns = Array.isArray(data?.vulnerabilities?.data) ? data.vulnerabilities.data : [];

      // 1. Vulnerabilidades registradas (de brand_vulnerabilities)
      const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
      const sortedVulns = [...vulns].sort((a, b) =>
        (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9)
      );
      for (const v of sortedVulns.slice(0, 4)) {
        out.push({
          label:    v.title || 'Vulnerabilidad detectada',
          tag:      v.severity || 'medium',
          severity: v.severity,
          detail:   v.description || '',
        });
      }

      // 2. Top gaps del health (con verdict bajo)
      if (Array.isArray(health?.top_gaps)) {
        for (const g of health.top_gaps.slice(0, 3)) {
          out.push({
            label:  g.label,
            tag:    `−${Number(g.max_lift || 0).toFixed(0)} pts`,
            detail: g.gap_description || '',
          });
        }
      }

      // 3. Burner campaigns (gasto sin retorno)
      const burners = Array.isArray(wb.burners) ? wb.burners : [];
      for (const b of burners.slice(0, 2)) {
        out.push({
          label:  b.nombre_campana,
          tag:    `${fmt.money(b.spend)} gasto`,
          detail: b.description || `Inversión sin conversiones medibles en la ventana.`,
        });
      }

      return out.slice(0, 8);
    },

    /* ── Cards featured con pool priorizado ───────────────────────────────
       4 dimensiones primarias (Tema/Tono/Horario/Hashtag) + 3 backups
       (Plataforma/Crecimiento/Cuenta). Si una primaria viene vacia (0 data),
       NO se muestra hueco: se rellena con el siguiente backup que SI tiene
       datos. Se renderizan las primeras 4 con datos del pool ordenado. */
    _buildFeaturedCards(featured) {
      const f = featured || {};
      const topic    = (f.topic?.data    || [])[0] || null;
      const tone     = (f.tones?.data    || [])[0] || null;
      const hour     = (f.hour?.data     || [])[0] || null;
      const hashtag   = (f.hashtag?.data   || [])[0] || null;
      const sentiment = (f.sentiment?.data || [])[0] || null;
      const growth    = (f.growth?.data    || [])[0] || null;
      const profile   = (f.profile?.data   || [])[0] || null;

      const pool = [
        (topic && topic.topic) && {
          kind: 'topic', label: 'Tema ganador', headline: topic.topic,
          metricPrimary: `${fmt.int(topic.usage_count)} posts`,
          metricSecondary: `${this._compactNum(topic.total_engagement)} engagement`,
          dim: 'topic', value: topic.topic,
        },
        (tone && tone.tone_name) && {
          kind: 'tone', label: 'Tono efectivo', headline: tone.tone_name,
          metricPrimary: `${fmt.int(tone.posts_count)} posts`,
          metricSecondary: `${this._compactNum(tone.total_engagement)} engagement`,
          dim: 'tone', value: tone.tone_name,
        },
        (hour && hour.hour != null) && {
          kind: 'hour', label: 'Horario estrella', headline: `${String(hour.hour).padStart(2, '0')}:00`,
          metricPrimary: `${fmt.int(hour.posts_count)} posts publicados`,
          metricSecondary: `${this._compactNum(hour.avg_engagement_per_post)} eng/post`,
          dim: 'hour', value: String(hour.hour),
        },
        (hashtag && hashtag.hashtag) && {
          kind: 'hashtag', label: 'Hashtag dominante', headline: `#${hashtag.hashtag}`,
          metricPrimary: `${fmt.int(hashtag.usage_count)} usos`,
          metricSecondary: `${this._compactNum(hashtag.total_engagement)} engagement`,
          dim: 'hashtag', value: hashtag.hashtag,
        },
        // ── Backups (rellenan huecos de las primarias) ──
        (sentiment && sentiment.dominant_label && Number(sentiment.dominant_count) > 0) && {
          kind: 'sentiment', label: 'Sentimiento dominante', headline: sentiment.dominant_label,
          metricPrimary: `${fmt.int(sentiment.dominant_count)} posts`,
          metricSecondary: `${Math.round(Number(sentiment.dominant_ratio || 0) * 100)}% del total`,
          dim: 'sentiment', value: sentiment.dominant,
        },
        (growth && growth.engagement_growth_percent != null) && {
          kind: 'growth', label: 'Crecimiento',
          headline: `${growth.engagement_growth_percent >= 0 ? '+' : ''}${Math.round(growth.engagement_growth_percent)}%`,
          metricPrimary: 'engagement',
          metricSecondary: `${fmt.int(growth.start_posts)} → ${fmt.int(growth.end_posts)} posts`,
          dim: 'growth', value: '',
        },
        (profile && profile.brand_name) && {
          kind: 'profile', label: 'Cuenta lider', headline: profile.brand_name,
          metricPrimary: `${fmt.int(profile.total_posts)} posts`,
          metricSecondary: `${this._compactNum(profile.total_engagement)} engagement`,
          dim: 'profile', value: '',
        },
      ].filter(Boolean);

      // Sin ninguna señal con datos: card vacia informativa (o nada si hide).
      if (!pool.length) {
        if (shouldHideEmpty()) return '';
        return this._buildFeaturedCard({
          kind: 'topic', label: 'Tema ganador', headline: null,
          emptyHint: 'Sin datos suficientes en la ventana.',
        });
      }

      return pool.slice(0, 4).map((c) => this._buildFeaturedCard(c)).join('');
    },

    /** Nombre legible de plataforma para la card "Plataforma estrella". */
    _prettyPlatform(p) {
      const m = {
        tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook',
        youtube: 'YouTube', x: 'X', twitter: 'X', linkedin: 'LinkedIn', pinterest: 'Pinterest',
      };
      const key = String(p || '').toLowerCase();
      return m[key] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : '—');
    },

    _buildFeaturedCard(opts) {
      const has = !!opts.headline;
      if (!has && shouldHideEmpty()) return '';
      // Card clickable solo si tiene datos + dimension para abrir el detalle.
      const clickable = has && !!opts.dim;
      const detailTitle = `${opts.label}: ${opts.headline}`;
      const dataAttrs = clickable
        ? `data-feat-detail data-dim="${this._esc(opts.dim)}" data-value="${this._esc(opts.value || '')}" data-title="${this._esc(detailTitle)}" role="button" tabindex="0"`
        : '';
      return `
        <section class="mb-feat-card mb-feat-card--${opts.kind}${clickable ? ' mb-feat-card--clickable' : ''}" ${dataAttrs}>
          <div class="mb-feat-label">${this._esc(opts.label)}</div>
          ${has ? `
            <div class="mb-feat-headline" title="${this._esc(opts.headline)}">${this._esc(opts.headline)}</div>
            <div class="mb-feat-metrics">
              <div class="mb-feat-metric-primary">${this._esc(opts.metricPrimary || '')}</div>
              <div class="mb-feat-metric-secondary">${this._esc(opts.metricSecondary || '')}</div>
            </div>
            ${clickable ? `<div class="mb-feat-detail-hint">Ver detalles <i class="fas fa-arrow-right"></i></div>` : ''}
          ` : `
            <div class="mb-feat-empty">${this._esc(opts.emptyHint)}</div>
          `}
        </section>`;
    },

    /** Formatea números grandes como 84.7K, 1.9M. */
    _compactNum(n) {
      if (n == null) return '—';
      const num = Number(n);
      if (!isFinite(num)) return '—';
      if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (Math.abs(num) >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
      return Math.round(num).toLocaleString('es-CO');
    },

    /* ── Barra de filtros (estilo Production .living-filter) ─── */
    _buildMbFiltersBar(data) {
      const f = this._mbFilters || { windowDays: 30, brandContainerId: null };
      const containers = data?.containers || this._campanasService?.containers || [];

      // Mi Marca = fecha (calendario de rango) + plataforma. (Campañas no aplica:
      // post_patterns no tiene dimension de campaña.)
      const cur = (f.platforms && f.platforms[0]) || '';
      const platOpts = [
        ['', 'Todas'], ['instagram', 'Instagram'], ['facebook', 'Facebook'],
      ].map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`).join('');
      return `
        <header class="living-history-filters mb-filters-bar" id="mbFilters">
          ${this._mbFechaControl()}
          <div class="living-filter">
            <label class="living-filter-label" for="mbFilterPlatform">Plataforma</label>
            <select class="living-filter-select" id="mbFilterPlatform" data-mb-filter="platform">${platOpts}</select>
          </div>
          ${this._reportDropdown()}
        </header>`;
    },

    _mbFechaControl() {
      if (typeof DateRangePicker !== 'function') {
        return `<div class="living-filter"><label class="living-filter-label">Fecha</label>
          <select class="living-filter-select" disabled><option>Todo el periodo</option></select></div>`;
      }
      return this._ensureMbDatePicker().html();
    },
    _ensureMbDatePicker() {
      if (!this._mbDatePicker) {
        const f = this._mbFilters || {};
        this._mbDatePicker = new DateRangePicker({
          from: f.dateFrom || null, to: f.dateTo || null,
          onChange: (r) => this._onMbFilterChange({
            dateFrom: r.from ? r.from.toISOString() : null,
            dateTo:   r.to   ? r.to.toISOString()   : null,
          }),
        });
      }
      return this._mbDatePicker;
    },
    _mountMbDatePicker(scope) {
      if (typeof DateRangePicker !== 'function' || !this._mbDatePicker) return;
      const el = (scope || document).querySelector('[data-drp]');
      if (el) this._mbDatePicker.mount(el);
    },

    /* ════════════════════════════════════════════════════════════════
       HERO: Brand Health Gauge (card cuadrada, solo gauge)
       Diagnóstico/análisis se reintroducirá después en otro formato.
       ════════════════════════════════════════════════════════════════ */
    _buildHealthGauge(h) {
      if (!h || h.score == null) {
        if (shouldHideEmpty()) return '';
        return this._buildHealthEmpty();
      }

      const score    = Number(h.score) || 0;
      const verdict  = h.verdict || 'atencion';
      const band     = h.band || { p25: 50, p50: 65, p75: 80 };

      const verdictMeta = {
        elite:     { color: '#6e9f81', label: 'Élite' },
        saludable: { color: '#6e9f81', label: 'Saludable' },
        atencion:  { color: '#9c8e6b', label: 'Atención' },
        critico:   { color: '#b3796f', label: 'Crítico' },
      }[verdict] || { color: '#8a8a8e', label: verdict };

      const gaugeSvg = this._buildGaugeSvg(score, verdictMeta.color, band);
      const target = Number(h.target);
      const gap    = Number(h.gap);
      const objetivo = Number.isFinite(target)
        ? `Objetivo de tu segmento: <strong>${target}</strong>${gap > 0 ? ` · te faltan <strong>${gap}</strong> pts` : ' · objetivo alcanzado ✓'}`
        : `Saludable para tu segmento: <strong>${band.p50}–${band.p75}</strong>`;

      // Sidebar vertical (solo en Mi Marca): gauge centrado + componentes +
      // alertas (componentes en zona baja) + tareas (el plan de salud).
      return `
        <section class="mb-health-card mb-health-card--aside">
          <span class="mb-hero-label">Salud de tu marca</span>
          <div class="mb-health-ring mb-health-ring--${this._esc(verdict)}" style="--score:${Math.max(0, Math.min(100, Math.round(score)))}">
            <div class="mb-health-ring-center">
              <span class="mb-health-score">${Math.round(score)}</span>
              <span class="mb-health-max">/100</span>
              <span class="mb-health-band">${this._esc(verdictMeta.label)}</span>
            </div>
          </div>
          <span class="mb-health-objetivo">${objetivo}</span>
          ${this._buildHealthComponents(h.components)}
          ${this._buildHealthAlerts(h.components)}
          ${this._buildHealthTasks(h.tasks)}
        </section>`;
    },

    /* Alertas del sidebar: componentes de salud en zona baja (<50) como chips.
       Datos ya disponibles en h.components — sin RPC extra. */
    _buildHealthAlerts(components) {
      const list = (Array.isArray(components) ? components : [])
        .filter((c) => (Number(c.score) || 0) < 50)
        .sort((a, b) => (Number(a.score) || 0) - (Number(b.score) || 0));
      if (!list.length) return '';
      const chips = list.map((c) => {
        const sc = Math.round(Number(c.score) || 0);
        const crit = sc < 40;
        return `<span class="mb-alert-chip${crit ? ' mb-alert-chip--crit' : ''}"><i class="fas fa-triangle-exclamation"></i> ${this._esc(c.label || c.key)} ${sc}</span>`;
      }).join('');
      return `
        <div class="mb-aside-alerts">
          <div class="mb-aside-block-title">Alertas</div>
          <div class="mb-alert-chips">${chips}</div>
        </div>`;
    },

    _buildHealthComponents(components) {
      const list = Array.isArray(components) ? components : [];
      if (!list.length) return '';
      return `<div class="mb-hc-comps">${list.map((c) => {
        const sc = Math.max(0, Math.min(100, Number(c.score) || 0));
        const lvl = sc >= 70 ? 'good' : sc >= 40 ? 'mid' : 'low';
        return `
          <div class="mb-hc-comp mb-hc-comp--${lvl}">
            <div class="mb-hc-comp-head">
              <span class="mb-hc-comp-label">${this._esc(c.label || c.key)}</span>
              <span class="mb-hc-comp-score mb-hc-comp-score--${lvl}">${sc}</span>
            </div>
            <div class="mb-hc-bar"><span class="mb-hc-bar-fill mb-hc-bar-fill--${lvl}" style="width:${sc}%;"></span></div>
            <div class="mb-hc-comp-detail">${this._esc(c.detail || '')}</div>
          </div>`;
      }).join('')}</div>`;
    },

    _buildHealthTasks(tasks) {
      const list = Array.isArray(tasks) ? tasks : [];
      if (!list.length) return '';
      const sorted = [...list].sort((a, b) => (Number(b.impact_pts) || 0) - (Number(a.impact_pts) || 0));
      return `
        <div class="mb-health-tasks">
          <div class="mb-health-tasks-title">Tareas para llegar a tu objetivo</div>
          <ul class="mb-hc-tasks">
            ${sorted.map((t) => `
              <li class="mb-hc-task">
                <span class="mb-hc-task-check"><i class="far fa-circle"></i></span>
                <div class="mb-hc-task-body">
                  <span class="mb-hc-task-label">${this._esc(t.label || '')}</span>
                  ${t.detail ? `<span class="mb-hc-task-detail">${this._esc(t.detail)}</span>` : ''}
                </div>
                ${Number(t.impact_pts) > 0 ? `<span class="mb-hc-task-impact">+${Math.round(Number(t.impact_pts))} pts</span>` : ''}
              </li>`).join('')}
          </ul>
        </div>`;
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

    _buildHealthEmpty() {
      return `
        <section class="mb-hero mb-hero--empty">
          <p>Calculando salud de tu marca… (sin datos suficientes aún)</p>
        </section>`;
    },

    _bindMyBrandsHandlers(body) {
      if (!body) return;
      // El #insightTabBody persiste entre renders → bindear una sola vez por
      // elemento (la delegacion sigue cubriendo el HTML reescrito).
      if (body.dataset.mbBound === '1') return;
      body.dataset.mbBound = '1';

      // Filtros: cambio de ventana / sub-marca
      body.addEventListener('change', (e) => {
        const el = e.target.closest('[data-mb-filter]');
        if (!el) return;
        const key = el.dataset.mbFilter;
        if (key === 'platform') { this._onMbFilterChange({ platforms: el.value ? [el.value] : null }); return; }
        let value = el.value;
        if (key === 'windowDays') value = Number(value) || 30;
        if (key === 'brandContainerId') value = value || null;
        this._onMbFilterChange({ [key]: value });
      });

      // Click en una card featured → abrir ventana de detalle con sus posts.
      body.addEventListener('click', (e) => {
        const card = e.target.closest('[data-feat-detail]');
        if (!card) return;
        this._openFeaturedDetail(card.dataset.dim, card.dataset.value, card.dataset.title);
      });
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('[data-feat-detail]');
        if (!card) return;
        e.preventDefault();
        this._openFeaturedDetail(card.dataset.dim, card.dataset.value, card.dataset.title);
      });
    },

    /* ════════════════════════════════════════════════════════════════
       Ventana de detalle (drawer derecho) — publicaciones detras de una card
       ════════════════════════════════════════════════════════════════ */
    _ensureDetailDrawer() {
      let ov = document.getElementById('mbDetailOverlay');
      let dr = document.getElementById('mbDetailDrawer');
      if (!dr) {
        ov = document.createElement('div');
        ov.id = 'mbDetailOverlay';
        ov.className = 'mb-detail-overlay';
        dr = document.createElement('aside');
        dr.id = 'mbDetailDrawer';
        dr.className = 'mb-detail-drawer';
        dr.setAttribute('role', 'dialog');
        dr.setAttribute('aria-modal', 'true');
        dr.setAttribute('aria-label', 'Detalle de publicaciones');
        dr.innerHTML = `
          <header class="mb-detail-head">
            <div class="mb-detail-head-text">
              <span class="mb-detail-title" id="mbDetailTitle">Detalles</span>
              <span class="mb-detail-sub" id="mbDetailSub"></span>
            </div>
            <button class="mb-detail-close" id="mbDetailClose" type="button" aria-label="Cerrar"><i class="fas fa-times"></i></button>
          </header>
          <div class="mb-detail-body" id="mbDetailBody"></div>`;
        document.body.appendChild(ov);
        document.body.appendChild(dr);
        ov.addEventListener('click', () => this._closeDetailDrawer());
        dr.querySelector('#mbDetailClose').addEventListener('click', () => this._closeDetailDrawer());
        this._detailEscHandler = (e) => { if (e.key === 'Escape') this._closeDetailDrawer(); };
      }
      return { ov, dr };
    },

    async _openFeaturedDetail(dim, value, title) {
      if (!dim || !this._supabase || !this._orgId) return;
      const { ov, dr } = this._ensureDetailDrawer();
      const titleEl = document.getElementById('mbDetailTitle');
      const subEl   = document.getElementById('mbDetailSub');
      const bodyEl  = document.getElementById('mbDetailBody');
      if (titleEl) titleEl.textContent = title || 'Detalles';
      if (subEl)   subEl.textContent = 'Cargando…';
      if (bodyEl)  bodyEl.innerHTML = `<div class="mb-detail-loading"><i class="fas fa-circle-notch fa-spin"></i></div>`;

      ov.classList.add('active');
      dr.classList.add('active');
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', this._detailEscHandler);

      try {
        const win = this._mbCampanasData?.window || {};
        const f = this._mbFilters || {};
        const { data, error } = await this._supabase.rpc('dashboard_brand_posts_by_dimension', {
          p_org_id:              this._orgId,
          p_date_from:           win.date_from,
          p_date_to:             win.date_to,
          p_brand_container_ids: f.brandContainerId ? [f.brandContainerId] : null,
          p_post_source:         'own',
          p_dimension:           dim,
          p_value:               value || null,
          p_limit:               100,
        });
        if (error) throw error;
        const posts = Array.isArray(data) ? data : [];
        if (subEl) subEl.textContent = `${posts.length} ${posts.length === 1 ? 'publicacion' : 'publicaciones'}`;
        this._renderDetailPosts(bodyEl, posts);
      } catch (e) {
        console.error('[detail] load failed:', e?.message || e);
        if (subEl) subEl.textContent = '';
        if (bodyEl) bodyEl.innerHTML = `<div class="mb-detail-empty"><i class="fas fa-triangle-exclamation"></i><p>No se pudieron cargar las publicaciones.</p></div>`;
      }
    },

    _closeDetailDrawer() {
      const ov = document.getElementById('mbDetailOverlay');
      const dr = document.getElementById('mbDetailDrawer');
      if (ov) ov.classList.remove('active');
      if (dr) dr.classList.remove('active');
      document.body.style.overflow = '';
      if (this._detailEscHandler) document.removeEventListener('keydown', this._detailEscHandler);
    },

    _renderDetailPosts(bodyEl, posts) {
      if (!bodyEl) return;
      if (!posts.length) {
        bodyEl.innerHTML = `<div class="mb-detail-empty"><i class="fas fa-inbox"></i><p>Sin publicaciones en esta ventana.</p></div>`;
        return;
      }
      bodyEl.innerHTML = `<ul class="mb-detail-list">${posts.map((p) => this._detailPostHtml(p)).join('')}</ul>`;
    },

    _detailPostHtml(p) {
      const m = p.metrics || {};
      const likes    = Number(m.likes ?? m.reactions ?? 0) || 0;
      const comments = Number(m.comments ?? 0) || 0;
      const shares   = Number(m.shares ?? 0) || 0;
      const net  = this._prettyPlatform(p.network);
      const date = this._detailDate(p.captured_at);
      const sent = this._detailSentiment(p.sentiment_text);
      const content = this._esc(String(p.content || '').slice(0, 240)) || '<span class="mb-detail-post-empty">(sin texto)</span>';
      return `
        <li class="mb-detail-post">
          <div class="mb-detail-post-top">
            <span class="mb-detail-post-net">${this._esc(net)}</span>
            ${sent}
            <span class="mb-detail-post-date">${this._esc(date)}</span>
          </div>
          <p class="mb-detail-post-content">${content}</p>
          <div class="mb-detail-post-foot">
            <span class="mb-detail-post-metric"><i class="fas fa-heart"></i> ${this._compactNum(likes)}</span>
            <span class="mb-detail-post-metric"><i class="fas fa-comment"></i> ${this._compactNum(comments)}</span>
            <span class="mb-detail-post-metric"><i class="fas fa-retweet"></i> ${this._compactNum(shares)}</span>
            <span class="mb-detail-post-eng">${this._compactNum(p.engagement_total)} eng</span>
          </div>
        </li>`;
    },

    _detailSentiment(s) {
      if (!s) return '';
      const u = String(s).toUpperCase();
      if (u.startsWith('POS')) return `<span class="mb-detail-chip mb-detail-chip--pos">Positivo</span>`;
      if (u.startsWith('NEG')) return `<span class="mb-detail-chip mb-detail-chip--neg">Negativo</span>`;
      return `<span class="mb-detail-chip mb-detail-chip--neu">Neutro</span>`;
    },

    _detailDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }) +
             ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    },
  });
})();
