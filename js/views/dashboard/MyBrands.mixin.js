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
        body.innerHTML = this._buildMyBrandsHtml(data);
        this._bindMyBrandsHandlers(body);
      } catch (e) {
        console.error('[MyBrands] loadAll failed:', e);
        body.innerHTML = this._buildMyBrandsErrorHtml(e);
      }
    },

    async _loadMyBrandsData() {
      const f = this._mbFilters || { windowDays: 30, brandContainerId: null };
      return this._campanasService.loadAll({
        windowDays: f.windowDays,
        brandIds:   f.brandContainerId ? [f.brandContainerId] : null,
      });
    },

    /* ── Filtros: estado persistido en localStorage ──────────── */
    _mbFiltersKey() { return `mb:filters:${this._orgId || 'global'}`; },

    _restoreMbFilters() {
      if (this._mbFilters) return this._mbFilters;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(this._mbFiltersKey()) || 'null'); } catch (_) {}
      this._mbFilters = {
        windowDays:        Number(stored?.windowDays) > 0 ? Number(stored.windowDays) : 30,
        brandContainerId:  stored?.brandContainerId || null,
      };
      return this._mbFilters;
    },

    _saveMbFilters() {
      try { localStorage.setItem(this._mbFiltersKey(), JSON.stringify(this._mbFilters || {})); } catch (_) {}
    },

    async _onMbFilterChange(patch) {
      this._mbFilters = { ...(this._mbFilters || {}), ...patch };
      this._saveMbFilters();
      const body = document.getElementById('insightTabBody');
      if (!body) return;
      this._renderMyBrandsSkeleton(body);
      try {
        const data = await this._loadMyBrandsData();
        this._mbCampanasData = data;
        body.innerHTML = this._buildMyBrandsHtml(data);
        this._bindMyBrandsHandlers(body);
      } catch (e) {
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
        <div class="insight-page mb-dash" id="mbPage">
          ${this._buildMbFiltersBar(data)}
          ${this._buildHealthGauge(data?.health?.data)}
          ${this._buildFeaturedSection(data?.featured)}
          ${this._buildSwotCard(data)}
        </div>`;
    },

    /* Seccion "Lo que te esta funcionando" — grid de cards de evidencia. */
    _buildFeaturedSection(featured) {
      const cards = this._buildFeaturedCards(featured);
      if (!cards.trim()) return '';
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">Lo que te esta funcionando</span>
          </div>
          <div class="mb-feat-grid">${cards}</div>
        </section>`;
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
      const hashtag  = (f.hashtag?.data  || [])[0] || null;
      const platform = (f.platform?.data || [])[0] || null;
      const growth   = (f.growth?.data   || [])[0] || null;
      const profile  = (f.profile?.data  || [])[0] || null;

      const pool = [
        (topic && topic.topic) && {
          kind: 'topic', label: 'Tema ganador', headline: topic.topic,
          metricPrimary: `${fmt.int(topic.usage_count)} posts`,
          metricSecondary: `${this._compactNum(topic.total_engagement)} engagement`,
        },
        (tone && tone.tone_name) && {
          kind: 'tone', label: 'Tono efectivo', headline: tone.tone_name,
          metricPrimary: `${fmt.int(tone.posts_count)} posts`,
          metricSecondary: `${this._compactNum(tone.total_engagement)} engagement`,
        },
        (hour && hour.hour != null) && {
          kind: 'hour', label: 'Horario estrella', headline: `${String(hour.hour).padStart(2, '0')}:00`,
          metricPrimary: `${fmt.int(hour.posts_count)} posts publicados`,
          metricSecondary: `${this._compactNum(hour.avg_engagement_per_post)} eng/post`,
        },
        (hashtag && hashtag.hashtag) && {
          kind: 'hashtag', label: 'Hashtag dominante', headline: `#${hashtag.hashtag}`,
          metricPrimary: `${fmt.int(hashtag.usage_count)} usos`,
          metricSecondary: `${this._compactNum(hashtag.total_engagement)} engagement`,
        },
        // ── Backups (rellenan huecos de las primarias) ──
        (platform && platform.platform) && {
          kind: 'platform', label: 'Plataforma estrella', headline: this._prettyPlatform(platform.platform),
          metricPrimary: `${fmt.int(platform.total_posts)} posts`,
          metricSecondary: `${this._compactNum(platform.total_engagement)} engagement`,
        },
        (growth && growth.engagement_growth_percent != null) && {
          kind: 'growth', label: 'Crecimiento',
          headline: `${growth.engagement_growth_percent >= 0 ? '+' : ''}${Math.round(growth.engagement_growth_percent)}%`,
          metricPrimary: 'engagement',
          metricSecondary: `${fmt.int(growth.start_posts)} → ${fmt.int(growth.end_posts)} posts`,
        },
        (profile && profile.brand_name) && {
          kind: 'profile', label: 'Cuenta lider', headline: profile.brand_name,
          metricPrimary: `${fmt.int(profile.total_posts)} posts`,
          metricSecondary: `${this._compactNum(profile.total_engagement)} engagement`,
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
      return `
        <section class="mb-feat-card mb-feat-card--${opts.kind}">
          <div class="mb-feat-label">${this._esc(opts.label)}</div>
          ${has ? `
            <div class="mb-feat-headline" title="${this._esc(opts.headline)}">${this._esc(opts.headline)}</div>
            <div class="mb-feat-metrics">
              <div class="mb-feat-metric-primary">${this._esc(opts.metricPrimary || '')}</div>
              <div class="mb-feat-metric-secondary">${this._esc(opts.metricSecondary || '')}</div>
            </div>
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

      const windowOpts = [
        { v: 7,   label: 'Últimos 7 días' },
        { v: 30,  label: 'Últimos 30 días' },
        { v: 90,  label: 'Últimos 90 días' },
        { v: 365, label: 'Últimos 12 meses' },
      ];
      const winOptsHtml = windowOpts.map(o =>
        `<option value="${o.v}"${Number(f.windowDays) === o.v ? ' selected' : ''}>${o.label}</option>`
      ).join('');

      const brandOptsHtml = [
        `<option value=""${!f.brandContainerId ? ' selected' : ''}>Todas las sub-marcas</option>`,
        ...containers.map(c =>
          `<option value="${this._esc(c.id)}"${f.brandContainerId === c.id ? ' selected' : ''}>${this._esc(c.nombre_marca || '—')}</option>`
        ),
      ].join('');

      return `
        <header class="living-history-filters mb-filters-bar" id="mbFilters">
          <div class="living-filter living-filter-window">
            <label class="living-filter-label" for="mbFilterWindow">Ventana</label>
            <select class="living-filter-select" id="mbFilterWindow" data-mb-filter="windowDays">
              ${winOptsHtml}
            </select>
          </div>
          ${containers.length > 1 ? `
            <div class="living-filter living-filter-brand">
              <label class="living-filter-label" for="mbFilterBrand">Sub-marca</label>
              <select class="living-filter-select" id="mbFilterBrand" data-mb-filter="brandContainerId">
                ${brandOptsHtml}
              </select>
            </div>
          ` : ''}
        </header>`;
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
        elite:     { color: '#6bcf7f', label: 'Élite' },
        saludable: { color: '#4cb37a', label: 'Saludable' },
        atencion:  { color: '#e09145', label: 'Atención' },
        critico:   { color: '#e06464', label: 'Crítico' },
      }[verdict] || { color: '#7c7c7c', label: verdict };

      const gaugeSvg = this._buildGaugeSvg(score, verdictMeta.color, band);

      return `
        <section class="mb-hero">
          <div class="mb-hero-gauge">${gaugeSvg}</div>
          <div class="mb-hero-meta">
            <span class="mb-hero-label">Salud de tu marca</span>
            <span class="mb-hero-verdict" style="color:${verdictMeta.color};">${this._esc(verdictMeta.label)}</span>
            <span class="mb-hero-band">Saludable para tu segmento: <strong>${band.p50}–${band.p75}</strong></span>
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

    _buildHealthEmpty() {
      return `
        <section class="mb-hero mb-hero--empty">
          <p>Calculando salud de tu marca… (sin datos suficientes aún)</p>
        </section>`;
    },

    _bindMyBrandsHandlers(body) {
      if (!body) return;

      // Filtros: cambio de ventana / sub-marca
      body.addEventListener('change', (e) => {
        const el = e.target.closest('[data-mb-filter]');
        if (!el) return;
        const key = el.dataset.mbFilter;
        let value = el.value;
        if (key === 'windowDays') value = Number(value) || 30;
        if (key === 'brandContainerId') value = value || null;
        this._onMbFilterChange({ [key]: value });
      });

    },
  });
})();
