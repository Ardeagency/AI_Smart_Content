/**
 * DashboardView — BrandGrid mixin (Mi Marca, rediseño 2026-07).
 *
 * Reemplaza el cuerpo vacío del tab Mi Marca por un GRID de cards que leen
 * datos crudos de brand_posts (sin clasificador). Cards iniciales:
 *   1. Actividad de publicación — barras APILADAS por red (todas: ig/fb/tiktok/x/yt)
 *      por periodo, con estado + barra de salud + filtro Semana/Mes/Año/Todo.
 *   2. Latidos — impacto social digital por periodo (heart-rate), todas las redes.
 *
 * RPCs (Fase 2, ya desacopladas del clasificador):
 *   - dashboard_mimarca_health           → salud 0-100 (cadencia+impacto+recencia)
 *   - dashboard_mimarca_activity         → { status, networks[], series[] } por red/periodo
 *   - dashboard_brand_engagement_trend   → filas con social_impact ponderado por periodo
 *
 * Charts vía Chart.js (this._ensureChartJs / this._reg / this._destroyCharts).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const WINDOWS = [
    { k: 'week',  days: 7,    label: () => __('Semana') },
    { k: 'month', days: 30,   label: () => __('Mes') },
    { k: 'year',  days: 365,  label: () => __('Año') },
    { k: 'all',   days: null, label: () => __('Todo') },
  ];

  // Etiqueta legible por red.
  const NET_LABEL = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    x: 'X', twitter: 'X', youtube: 'YouTube', linkedin: 'LinkedIn',
  };

  const STATUS_LABEL = {
    activo: () => __('Activo'), irregular: () => __('Irregular'),
    lento: () => __('Lento'), dormido: () => __('Dormido'), sin_datos: () => __('Sin datos'),
  };

  Object.assign(DashboardView.prototype, {

    /* ── Entry point del grid de Mi Marca ── */
    async _renderBrandGrid(body) {
      if (!body) return true;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return true; }
      if (this._gridWindow == null) this._gridWindow = 'month';

      // Shell una sola vez (persistente entre refresh); los charts se repintan.
      if (!body.querySelector('.bgrid')) {
        body.innerHTML = this._buildBrandGridShell();
        this._bindBrandGrid(body);
      }
      await this._gridLoadAndPaint(body);
      return true;
    },

    _buildBrandGridShell() {
      const seg = WINDOWS.map((w) => `
        <button type="button" class="bgrid-seg-btn${w.k === this._gridWindow ? ' is-active' : ''}" data-window="${w.k}" role="tab">${this._esc(w.label())}</button>`).join('');
      return `
        <div class="bgrid">
          <div class="bgrid-col">
          <section class="bgrid-card glass-black bgrid-card--activity">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--actividad" aria-hidden="true"></i>${this._esc(__('Tráfico'))}</span>
              <button type="button" class="bgrid-details-btn" data-salud-details aria-label="${this._esc(__('Ver detalles de salud'))}" title="${this._esc(__('Ver detalles de salud'))}"><i class="aisc-ico aisc-ico--chart-bar" aria-hidden="true"></i></button>
            </header>
            <div class="bgrid-salud-arc" id="bgridSaludArc"></div>
            <nav class="bgrid-seg" role="tablist" aria-label="${this._esc(__('Periodo'))}">${seg}</nav>
            <div class="bgrid-chart-wrap"><canvas id="bgridActivityChart"></canvas><div class="bgrid-empty" id="bgridActivityEmpty" hidden>${this._esc(__('Sin publicaciones en este periodo'))}</div></div>
            <footer class="bgrid-card-foot" id="bgridActivityFoot"></footer>
          </section>
          <section class="bgrid-card bgrid-card--campaigns" id="bgridCampaignsCard" hidden>
            <header class="bgrid-card-head">
              <span class="bgrid-card-title bgrid-card-title--dark"><i class="aisc-ico aisc-ico--campaign" aria-hidden="true"></i>${this._esc(__('Campañas'))}</span>
            </header>
            <div class="bgrid-campaigns" id="bgridCampaigns"></div>
          </section>
          </div>
          <div class="bgrid-col">
            <div class="bgrid-observacion" id="bgridObservacion"></div>
            <section class="bgrid-card glass-black bgrid-card--latidos">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${this._esc(__('Interacciones'))}</span>
              </header>
              <p class="bgrid-card-sub">${this._esc(__('Cuántas interacciones producen tus redes por periodo · toca una barra para ver ese día'))}</p>
              <div class="bgrid-chart-wrap bgrid-chart-wrap--latidos"><canvas id="bgridLatidosChart"></canvas><div class="bgrid-empty" id="bgridLatidosEmpty" hidden>${this._esc(__('Sin señal de impacto en este periodo'))}</div></div>
            </section>
            <div class="bgrid-vd" id="bgridVD"></div>
          </div>
          <div class="bgrid-vera" id="bgridVera"></div>
          <!-- Producto destacado cierra la pagina: es el ultimo bloque, con
               ancho acotado (no full-bleed) y superficie de card canonica. -->
          <section class="bgrid-card bgrid-card--prodstar">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--star" aria-hidden="true"></i>${this._esc(__('Producto destacado'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('Cuál producto empujas más y cuáles estás olvidando'))}</p>
            <div class="vera-prodstar" id="bgridProdStar" data-prodstar="1">
              <div class="vera-prodstar-load">${this._esc(__('Cargando productos…'))}</div>
            </div>
          </section>
        </div>`;
    },

    _bindBrandGrid(body) {
      if (body.dataset.bgridBound === '1') return;
      body.dataset.bgridBound = '1';
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-salud-details]')) { this._openSaludDetails(this._gridHealth); return; }
        const btn = e.target.closest('[data-window]');
        if (!btn) return;
        const k = btn.dataset.window;
        if (!k || k === this._gridWindow) return;
        this._gridWindow = k;
        body.querySelectorAll('.bgrid-seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.window === k));
        this._gridLoadAndPaint(body);
      });
    },

    _gridWindowDays() {
      return (WINDOWS.find((w) => w.k === this._gridWindow) || WINDOWS[1]).days;
    },

    /** Fecha del último post propio (cacheada) para anclar las ventanas. */
    async _gridLastOwnPost() {
      try {
        if (!this._gridBcIds) {
          const { data: cs } = await this._supabase.from('brand_containers').select('id').eq('organization_id', this._orgId);
          this._gridBcIds = (cs || []).map((c) => c.id).filter(Boolean);
        }
        if (!this._gridBcIds.length) return null;
        const { data } = await this._supabase.from('brand_posts')
          .select('captured_at').in('brand_container_id', this._gridBcIds)
          .eq('post_source', 'own').order('captured_at', { ascending: false }).limit(1);
        return (data && data[0] && data[0].captured_at) ? new Date(data[0].captured_at) : null;
      } catch (_) { return null; }
    },

    async _loadBrandGridData() {
      const days = this._gridWindowDays();
      // Ancla al último post propio: si la marca lleva días sin publicar, "Semana"
      // (últimos 7 días) saldría vacía. Anclando, cada filtro muestra la data más
      // reciente disponible en su granularidad.
      const now = new Date();
      const last = await this._gridLastOwnPost();
      const anchor = (last && last < now) ? last : now;
      const dateTo = anchor.toISOString();
      const dateFrom = (days == null ? new Date('2015-01-01') : new Date(anchor.getTime() - days * 86400000)).toISOString();
      const p = { p_org_id: this._orgId, p_date_from: dateFrom, p_date_to: dateTo };
      // rpc() devuelve un builder thenable (sin .catch nativo): Promise.resolve lo
      // normaliza a Promise real antes de encadenar el fallback.
      const call = (fn, params) => Promise.resolve(this._supabase.rpc(fn, params)).catch(() => ({ data: null }));
      const [h, a, i] = await Promise.all([
        call('dashboard_mimarca_health_v2', p),
        call('dashboard_mimarca_activity', p),
        call('dashboard_brand_engagement_trend', { ...p, p_post_source: 'own' }),
      ]);
      return {
        health: h?.data || null,
        activity: a?.data || null,
        impact: Array.isArray(i?.data) ? i.data : [],
      };
    },

    async _gridLoadAndPaint(body) {
      let data;
      try { data = await this._loadBrandGridData(); }
      catch (e) { console.warn('[BrandGrid] load failed:', e); return; }
      this._gridHealth = data.health || null;
      this._paintSaludArc(body, data);
      this._paintGridStatus(body, data);
      try { await this._ensureChartJs(); } catch (_) {}
      this._destroyCharts();
      this._paintActivityChart(body, data);
      this._paintLatidosChart(body, data);
      this._paintCampaigns(body);
      this._paintProductoEstrella(body);
      this._renderVeraCards(body);
    },

    /* Card Campañas: SOLO campañas activas. Superficie por defecto (no glass).
       Cada fila: mini-gauge de rendimiento + nombre/objetivo + badge de impacto. */
    async _paintCampaigns(body) {
      const card = body.querySelector('#bgridCampaignsCard');
      const host = body.querySelector('#bgridCampaigns');
      if (!card || !host) return;
      let rows = [];
      try {
        const { data } = await this._supabase.from('campaigns')
          .select('nombre_campana, external_campaign_name, platform_objective, cached_ctr, cached_roas, cached_conversions, cached_clicks, cached_spend')
          .eq('organization_id', this._orgId).eq('status', 'active')
          .order('cached_spend', { ascending: false, nullsFirst: false });
        rows = Array.isArray(data) ? data : [];
      } catch (_) {}
      if (!rows.length) { card.hidden = true; return; }
      card.hidden = false;
      host.innerHTML = rows.map((c) => this._campaignRowHtml(c)).join('');
    },

    /* Efectividad de la campaña segun su OBJETIVO y la KPI que de verdad importa,
       contra benchmarks Meta 2025 (fuentes en research):
         - Ventas    → ROAS   (sano 3-5; <2 no rentable)
         - Leads     → CVR    (conversion/clicks)
         - Trafico/  → CTR    (fuerte >1.5%; pobre <0.5%; mediana 2.19%)
           default
       Devuelve { score 0-100, tier, label }. Verde=efectiva, rojo=no. */
    _campaignEffectiveness(c) {
      const obj = String(c.platform_objective || '');
      const ctr = Number(c.cached_ctr) || 0;
      const roas = c.cached_roas == null ? null : Number(c.cached_roas);
      const conv = Number(c.cached_conversions) || 0;
      const clicks = Number(c.cached_clicks) || 0;
      const cvr = clicks > 0 ? (conv / clicks * 100) : null;
      let val, exc, buena, reg;
      if (obj === 'OUTCOME_SALES' || (roas != null && roas > 0)) {
        val = roas || 0; exc = 5; buena = 3; reg = 2;          // ROAS
      } else if (obj === 'OUTCOME_LEADS' && cvr != null) {
        val = cvr; exc = 8; buena = 4; reg = 2;                // CVR %
      } else {
        val = ctr; exc = 3; buena = 1.5; reg = 0.8;            // CTR %
      }
      let tier, label;
      if (val >= exc) { tier = 'exc'; label = __('Excelente'); }
      else if (val >= buena) { tier = 'buena'; label = __('Buena'); }
      else if (val >= reg) { tier = 'regular'; label = __('Regular'); }
      else { tier = 'baja'; label = __('Baja'); }
      const score = Math.round(Math.max(0, Math.min(100, val / exc * 100)));
      return { score, tier, label };
    },

    _campaignRowHtml(c) {
      const esc = (s) => this._esc(s);
      const OBJ = { OUTCOME_SALES: __('Ventas'), OUTCOME_TRAFFIC: __('Tráfico'), OUTCOME_LEADS: __('Leads'),
        OUTCOME_ENGAGEMENT: __('Interacción'), OUTCOME_AWARENESS: __('Reconocimiento'), OUTCOME_APP_PROMOTION: __('App') };
      const objLabel = OBJ[c.platform_objective] || String(c.platform_objective || '').replace('OUTCOME_', '');
      const eff = this._campaignEffectiveness(c);
      const ctr = Number(c.cached_ctr) || 0;
      const roas = c.cached_roas == null ? null : Number(c.cached_roas);
      const conv = Number(c.cached_conversions) || 0;
      const clicks = Number(c.cached_clicks) || 0;
      const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
      const bits = [];
      if (roas != null) bits.push(`ROAS ${roas.toFixed(1)}x`);
      bits.push(`CTR ${ctr.toFixed(1)}%`);
      if (roas != null && conv > 0) bits.push(`${fmtK(conv)} conv`);
      else if (clicks > 0) bits.push(`${fmtK(clicks)} clics`);
      const desc = `${objLabel ? objLabel + ' · ' : ''}${bits.join(' · ')}`;
      const name = c.nombre_campana || c.external_campaign_name || __('Campaña');
      return `
        <div class="camp-row">
          ${this._miniGauge(eff.score, eff.tier)}
          <div class="camp-body">
            <div class="camp-name">${esc(name)}</div>
            <div class="camp-desc">${esc(desc)}</div>
          </div>
          <span class="camp-badge" data-tier="${eff.tier}">${esc(eff.label)}</span>
        </div>`;
    },

    _miniGauge(score, tier) {
      const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
      const R = 15.5, C = 2 * Math.PI * R, dash = C * s / 100;
      const COL = { exc: '#46c98a', buena: '#84cba0', regular: '#e6a94e', baja: '#e77a7a' };
      const col = COL[tier] || '#46c98a';
      return `
        <svg class="camp-gauge" viewBox="0 0 40 40" aria-label="${s}">
          <circle cx="20" cy="20" r="15.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="3.5"/>
          <circle cx="20" cy="20" r="15.5" fill="none" stroke="${col}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 20 20)"/>
          <text x="20" y="20" text-anchor="middle" dominant-baseline="central" class="camp-gauge-num">${s}</text>
        </svg>`;
    },

    /* ══ Cards de Vera (schema cards.v2) ═══════════════════════════════════
       Vera compone cards tipadas (observacion/virtudes/desventajas/audiencia/
       algoritmo), cada una con bloques: markdown seguro y/o charts (solo datos,
       los pintamos nosotros en estilo de marca). Cero HTML libre. ══════════ */
    async _renderVeraCards(body) {
      const obsHost = body.querySelector('#bgridObservacion');
      const host = body.querySelector('#bgridVera');
      if (!obsHost && !host) return;
      let reading = null;
      try {
        const { data } = await this._supabase.from('vera_dashboard_readings')
          .select('reading, created_at')
          .eq('organization_id', this._orgId).eq('scope', 'mi_marca').eq('status', 'published')
          .order('created_at', { ascending: false }).limit(1);
        reading = (data && data[0]) ? data[0].reading : null;
      } catch (_) {}
      const vdHost = body.querySelector('#bgridVD');
      const all = (reading && reading.schema === 'cards.v2' && Array.isArray(reading.cards)) ? reading.cards : [];
      // Colocación por tipo: observacion arriba de Interacciones (transparente);
      // virtudes+desventajas como PAR hermano bajo Interacciones; resto full-width.
      const obs = [], virt = [], desv = [], rest = [];
      all.forEach((c) => {
        const t = c && c.type;
        if (t === 'observacion') obs.push(c);
        else if (t === 'virtudes') virt.push(c);
        else if (t === 'desventajas') desv.push(c);
        else rest.push(c);
      });
      const obsItems = obs.map((c, i) => ({ card: c, key: 'obs' + i }));
      const virtItems = virt.map((c, i) => ({ card: c, key: 'pos' + i }));
      const desvItems = desv.map((c, i) => ({ card: c, key: 'neg' + i }));
      const restItems = rest.map((c, i) => ({ card: c, key: 'v' + i }));
      if (obsHost) obsHost.innerHTML = obsItems.map((x) => this._veraCardHtml(x.card, x.key, true)).join('');
      if (vdHost) vdHost.innerHTML = this._veraDuoHtml(virtItems, desvItems);
      if (host) host.innerHTML = restItems.length ? `<div class="vera-cards">${restItems.map((x) => this._veraCardHtml(x.card, x.key)).join('')}</div>` : '';
      try { await this._ensureChartJs(); } catch (_) {}
      this._paintVeraCharts(body, obsItems.concat(virtItems, desvItems, restItems));
      // Bloque vivo: pide su propio dato al RPC, por eso va aparte de los charts.
      this._paintProductoEstrella(body);
    },

    /* Virtudes + Desventajas como PAR hermano: dos paneles lado a lado (verde/rojo). */
    _veraDuoHtml(virtItems, desvItems) {
      if (!virtItems.length && !desvItems.length) return '';
      const esc = (s) => this._esc(s);
      const panel = (items, side, label, icon) => {
        if (!items.length) return '';
        const content = items.map(({ card, key }) => {
          const blocks = Array.isArray(card.blocks) ? card.blocks : (card.markdown ? [{ type: 'markdown', markdown: card.markdown }] : []);
          return `
            <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${icon}" aria-hidden="true"></i>${esc(label)}</span>
            ${card.title ? `<h4 class="vera-card-title">${esc(card.title)}</h4>` : ''}
            <div class="vera-card-body">${blocks.map((b, bi) => this._veraBlockHtml(b, key, bi)).join('')}</div>`;
        }).join('');
        return `<div class="vera-duo-panel" data-side="${side}">${content}</div>`;
      };
      return `<div class="vera-duo">${panel(virtItems, 'pos', __('Virtudes'), 'star')}${panel(desvItems, 'neg', __('Desventajas'), 'alert')}</div>`;
    },

    _veraCardHtml(card, key, bare) {
      const META = {
        observacion: { label: __('Observaciones'), icon: 'eye' },
        virtudes:    { label: __('Virtudes'),      icon: 'star' },
        desventajas: { label: __('Desventajas'),   icon: 'alert' },
        audiencia:   { label: __('Audiencias'),    icon: 'audience' },
        algoritmo:   { label: __('Tu Algoritmo'),  icon: 'compass' },
      };
      const m = META[card && card.type];
      if (!m) return '';   // tipo desconocido → se ignora (forward-compatible)
      // Audiencia = simbiosis: viz (choropleth + pyramid) a la izquierda, comentario a la derecha.
      if (card.type === 'audiencia' && !bare) return this._veraAudienciaHtml(card, key, m);
      const esc = (s) => this._esc(s);
      const blocks = Array.isArray(card.blocks) ? card.blocks
        : (card.markdown ? [{ type: 'markdown', markdown: card.markdown }] : []);
      const inner = blocks.map((b, bi) => this._veraBlockHtml(b, key, bi)).join('');
      const tone = ['positive', 'neutral', 'warning', 'critical'].includes(card.tone) ? card.tone : 'neutral';
      return `
        <section class="vera-card vera-card--${this._esc(card.type)}${bare ? ' vera-card--bare' : ''}" data-tone="${tone}">
          <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${m.icon}" aria-hidden="true"></i>${esc(m.label)}</span>
          ${card.title ? `<h3 class="vera-card-title">${esc(card.title)}</h3>` : ''}
          <div class="vera-card-body">${inner}</div>
        </section>`;
    },

    /* Bloque tabla: estructura JSON (columns + rows) → tabla estilizada.
       Ej.: temas/tonos por plataforma y a quién te muestra el algoritmo. */
    _veraTableHtml(block) {
      const esc = (s) => this._esc(s);
      const cols = Array.isArray(block.columns) ? block.columns : [];
      const rows = Array.isArray(block.rows) ? block.rows : [];
      const ttl = block.title ? `<div class="vera-chart-title">${esc(block.title)}</div>` : '';
      const head = cols.length ? `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : '';
      const body = `<tbody>${rows.map((r) => {
        const cells = Array.isArray(r) ? r : (Array.isArray(r.cells) ? r.cells : []);
        return `<tr>${cells.map((cell, i) => `<td${i === 0 ? ' class="vera-td-lead"' : ''}>${this._mdInline(esc(String(cell == null ? '' : cell)))}</td>`).join('')}</tr>`;
      }).join('')}</tbody>`;
      return `<div class="vera-table-wrap">${ttl}<table class="vera-table">${head}${body}</table></div>`;
    },

    /* Audiencia: choropleth (arriba) + population pyramid (abajo) a la izquierda,
       comentario de Vera (markdown) a la derecha. */
    _veraAudienciaHtml(card, key, m) {
      const esc = (s) => this._esc(s);
      const blocks = Array.isArray(card.blocks) ? card.blocks : [];
      const isViz = (b) => b && (b.type === 'choropleth' || b.type === 'pyramid');
      const vizHtml = blocks.map((b, bi) => isViz(b) ? this._veraBlockHtml(b, key, bi) : '').join('');
      const restHtml = blocks.map((b, bi) => (b && !isViz(b)) ? this._veraBlockHtml(b, key, bi) : '').join('');
      const tone = ['positive', 'neutral', 'warning', 'critical'].includes(card.tone) ? card.tone : 'neutral';
      return `
        <section class="vera-card vera-card--audiencia" data-tone="${tone}">
          <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${m.icon}" aria-hidden="true"></i>${esc(m.label)}</span>
          ${card.title ? `<h3 class="vera-card-title">${esc(card.title)}</h3>` : ''}
          <div class="vera-aud-grid">
            <div class="vera-aud-viz">${vizHtml}</div>
            <div class="vera-aud-comment vera-card-body">${restHtml}</div>
          </div>
        </section>`;
    },

    _veraBlockHtml(block, cardIdx, blockIdx) {
      const t = block && block.type;
      const cid = `veraChart-${cardIdx}-${blockIdx}`;
      const ttl = (block && block.title) ? `<div class="vera-chart-title">${this._esc(block.title)}</div>` : '';
      if (t === 'markdown') return `<div class="vera-md">${this._safeMarkdown(block.markdown)}</div>`;
      if (t === 'chart') return `<div class="vera-chart">${ttl}<div class="vera-chart-wrap"><canvas id="${cid}"></canvas></div></div>`;
      if (t === 'pyramid') return `<div class="vera-chart">${ttl}<div class="vera-chart-wrap vera-chart-wrap--pyramid"><canvas id="${cid}"></canvas></div></div>`;
      if (t === 'choropleth') return `<div class="vera-chart vera-choropleth">${ttl}<div class="vera-chart-wrap vera-chart-wrap--map"><canvas id="${cid}"></canvas><div class="vera-geo-fallback" id="${cid}-fb" hidden></div></div></div>`;
      if (t === 'stat') {
        const esc = (s) => this._esc(s);
        return `<div class="vera-stat"><span class="vera-stat-value">${esc(block.value != null ? String(block.value) : '')}</span><span class="vera-stat-label">${esc(block.label || '')}</span></div>`;
      }
      if (t === 'table') return this._veraTableHtml(block);
      // Bloque VIVO: sin datos de Vera. Se pinta llamando al RPC (ver
      // _paintProductoEstrella) para que cifras e imágenes sean autoritativas.
      if (t === 'producto_estrella') {
        return `<div class="vera-prodstar" id="${cid}" data-prodstar="1">${ttl}
          <div class="vera-prodstar-load">${this._esc(__('Cargando productos…'))}</div>
        </div>`;
      }
      return '';
    },

    /* ══ Producto destacado ═════════════════════════════════════════════════
       Ficha del producto estrella (imagen + señales) a la izquierda; a la
       derecha la tabla de familias por presencia, con su cuadrante. Responde
       "cuál es la estrella y cuáles se están olvidando".
       El cuadrante sale del RPC: cruza cuánto empuja la marca el producto en su
       contenido contra cuánto responde el público. NO incluye pauta pagada —
       no existe vínculo producto↔campaña en el modelo. ═══════════════════ */
    async _paintProductoEstrella(scope) {
      // Idempotente: lo llaman el shell y también _renderVeraCards (si Vera
      // coloca el bloque). Sin este filtro el panel fijo se pintaría dos veces.
      const hosts = Array.from(scope.querySelectorAll('[data-prodstar]'))
        .filter((h) => h.dataset.prodstarPainted !== '1');
      if (!hosts.length) return;
      hosts.forEach((h) => { h.dataset.prodstarPainted = '1'; });

      const esc = (s) => this._esc(s);
      let productos = [];
      let fallo = null;
      try {
        if (!this._gridBcIds || !this._gridBcIds.length) {
          const { data: cs } = await this._supabase.from('brand_containers').select('id').eq('organization_id', this._orgId);
          this._gridBcIds = (cs || []).map((c) => c.id).filter(Boolean);
        }
        const bcId = (this._gridBcIds || [])[0];
        if (!bcId) {
          fallo = 'sin brand_container para la org';
        } else {
          // supabase-js devuelve {data,error}: el error NO llega como rechazo de
          // promesa. Antes se perdía y la card decía "sin datos" sin explicar.
          const res = await this._supabase.rpc('dashboard_producto_estrella', { p_brand_container_id: bcId });
          if (res && res.error) fallo = res.error.message || String(res.error);
          else productos = (res && res.data && Array.isArray(res.data.productos)) ? res.data.productos : [];
        }
      } catch (e) { fallo = (e && e.message) ? e.message : String(e); }
      if (fallo) console.warn('[ProductoEstrella] no se pudo cargar:', fallo);

      // Los que están en 0% no aportan lectura: si la marca nunca los nombró,
      // no hay nada que "recuperar" — solo ensucian la lista. Se ocultan.
      productos = productos.filter((p) => Number(p && p.share_of_voice_pct) > 0);

      if (!productos.length) {
        hosts.forEach((h) => {
          const l = h.querySelector('.vera-prodstar-load');
          if (l) l.textContent = __('Sin datos de producto en este periodo');
        });
        return;
      }

      const QUAD = {
        estrella:    { label: __('Estrella'),    cls: 'is-star' },
        olvidado:    { label: __('Olvidado'),    cls: 'is-forgotten' },
        desperdicio: { label: __('Desperdicio'), cls: 'is-waste' },
        cola:        { label: __('Cola'),        cls: 'is-tail' },
      };
      // Estrella = el que más empujas. El resto baja de MÁS a MENOS usado: se lee
      // como un descenso — arriba lo que sostienes, abajo lo que ya soltaste.
      const hero = productos.find((p) => p.cuadrante === 'estrella') || productos[0];
      const olvidados = productos.filter((p) => p !== hero)
        .sort((a, b) => (b.share_of_voice_pct || 0) - (a.share_of_voice_pct || 0))
        .slice(0, 6);
      const q = QUAD[hero.cuadrante] || QUAD.cola;
      // La imagen la resuelve el RPC contra nuestro storage, nunca Vera: una URL
      // emitida por el modelo sería una vía para inyectar destinos arbitrarios.
      const img = hero.imagen_url
        ? `<img class="vera-prodstar-img" src="${esc(hero.imagen_url)}" alt="${esc(hero.producto)}" loading="lazy" data-prodstar-fit="1">`
        : `<div class="vera-prodstar-img vera-prodstar-img--empty" aria-hidden="true"></div>`;
      const sig = (v, l) => `<div class="vera-prodstar-sig"><span>${esc(String(v))}</span><small>${esc(l)}</small></div>`;

      const fichaHtml = `
        <div class="vera-prodstar-meta">
          <span class="vera-prodstar-badge ${q.cls}">${esc(q.label)}</span>
          <h4 class="vera-prodstar-name">${esc(hero.producto)}</h4>
          <div class="vera-prodstar-sigs">
            ${sig((hero.share_of_voice_pct != null ? hero.share_of_voice_pct : 0) + '%', __('de tu contenido'))}
            ${sig(hero.engagement_promedio != null ? hero.engagement_promedio : 0, __('interacción media'))}
            ${sig(hero.menciones_publico != null ? hero.menciones_publico : 0, __('lo nombra el público'))}
          </div>
        </div>`;

      const items = olvidados.map((p) => {
        const pq = QUAD[p.cuadrante] || QUAD.cola;
        const dias = (p.dias_sin_mencion == null) ? '—' : `${p.dias_sin_mencion}d`;
        const thumb = p.imagen_url
          ? `<img class="vera-prodstar-thumb" src="${esc(p.imagen_url)}" alt="" loading="lazy">`
          : `<span class="vera-prodstar-thumb vera-prodstar-thumb--empty" aria-hidden="true"></span>`;
        return `<li class="vera-prodstar-item">
            ${thumb}
            <span class="vera-prodstar-item-name">${esc(p.producto)}</span>
            <span class="vera-prodstar-item-sov">${esc(String(p.share_of_voice_pct != null ? p.share_of_voice_pct : 0))}%</span>
            <span class="vera-prodstar-item-days" title="${esc(__('sin mencionar'))}">${esc(dias)}</span>
            <span class="vera-prodstar-badge ${pq.cls}">${esc(pq.label)}</span>
          </li>`;
      }).join('');
      const listaHtml = `
        <div class="vera-prodstar-aside">
          <div class="vera-prodstar-aside-title">${esc(__('Los que estás olvidando'))}</div>
          <ul class="vera-prodstar-list">${items}</ul>
        </div>`;

      // La foto del producto es el LIENZO: encima, una sola card glass-black
      // reúne la ficha de la estrella y la lista de los que se están olvidando.
      // Sin hover — todo está a la vista desde el primer vistazo.
      const stageHtml = `
        <figure class="vera-prodstar-stage">
          ${img}
          <figcaption class="vera-prodstar-panel glass-black">
            ${fichaHtml}
            ${listaHtml}
          </figcaption>
        </figure>`;

      hosts.forEach((h) => {
        const l = h.querySelector('.vera-prodstar-load');
        if (l) l.remove();
        h.insertAdjacentHTML('beforeend', `<div class="vera-prodstar-grid">${stageHtml}</div>`);
        h.querySelectorAll('[data-prodstar-fit]').forEach((el) => this._prodstarFitStage(el));
      });
    },

    /* El contenedor toma el FORMATO REAL de la foto (igual que la galería de
       Producción): así la imagen se ve completa, sin recorte ni franjas negras.
       El 4/5 del CSS solo reserva el hueco mientras carga (evita layout shift). */
    _prodstarFitStage(img) {
      const apply = () => {
        const stage = img.closest('.vera-prodstar-stage');
        if (!stage || !img.naturalWidth || !img.naturalHeight) return;
        stage.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        img.classList.add('is-loaded');
      };
      if (img.complete) apply();
      else {
        img.addEventListener('load', apply, { once: true });
        img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true });
      }
    },

    _safeMarkdown(md) {
      let s = String(md == null ? '' : md);
      s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return s.split(/\n{2,}/).map((blk) => {
        const lines = blk.split('\n');
        if (lines.every((l) => /^\s*-\s+/.test(l) || !l.trim()) && /-\s+/.test(blk)) {
          return `<ul>${lines.filter((l) => l.trim()).map((l) => `<li>${this._mdInline(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`;
        }
        if (lines.every((l) => /^\s*\d+\.\s+/.test(l) || !l.trim()) && /\d+\.\s+/.test(blk)) {
          return `<ol>${lines.filter((l) => l.trim()).map((l) => `<li>${this._mdInline(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
        }
        const h = blk.match(/^(#{1,3})\s+(.*)$/);
        if (h) { const lvl = Math.min(4, h[1].length + 2); return `<h${lvl}>${this._mdInline(h[2])}</h${lvl}>`; }
        return `<p>${lines.map((l) => this._mdInline(l)).join('<br>')}</p>`;
      }).join('');
    },

    _mdInline(s) {
      return String(s)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    },

    _paintVeraCharts(scope, items) {
      const Chart = window.Chart;
      if (!Chart) return;
      const [accent] = this._gridBrandHexes();
      const [r, g, bl] = this._hexToRgb(accent);
      const palette = [1, 0.66, 0.42, 0.27, 0.17].map((a) => `rgba(${r},${g},${bl},${a})`);
      const TICK = 'rgba(255,255,255,0.5)', GRID = 'rgba(255,255,255,0.06)';
      const TT = { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10 };
      items.forEach(({ card, key }) => {
        (Array.isArray(card.blocks) ? card.blocks : []).forEach((b, bi) => {
          if (!b) return;
          const canvas = scope.querySelector(`#veraChart-${key}-${bi}`);
          if (!canvas) return;
          if (b.type === 'pyramid') { this._paintPyramid(canvas, b); return; }
          if (b.type === 'choropleth') { this._paintChoropleth(canvas, b, scope.querySelector(`#veraChart-${key}-${bi}-fb`)); return; }
          if (b.type !== 'chart') return;
          const kind = ['bar', 'line', 'donut', 'area'].includes(b.kind) ? b.kind : 'bar';
          const labels = Array.isArray(b.labels) ? b.labels : [];
          const series = Array.isArray(b.series) ? b.series : [];
          const yFmt = (v) => b.format === 'percent' ? v + '%' : v;
          let cfg;
          if (kind === 'donut') {
            const values = (series[0] && Array.isArray(series[0].values)) ? series[0].values : [];
            cfg = { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => palette[i % palette.length]), borderColor: 'rgba(0,0,0,0.25)', borderWidth: 2 }] },
              options: { responsive: true, maintainAspectRatio: false, cutout: '62%',
                plugins: { legend: { position: 'right', labels: { color: TICK, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } }, tooltip: TT } } };
          } else {
            const isLine = (kind === 'line' || kind === 'area');
            const datasets = series.map((sr, i) => ({
              label: sr.name || '', data: Array.isArray(sr.values) ? sr.values : [],
              backgroundColor: isLine ? `rgba(${r},${g},${bl},0.14)` : palette[i % palette.length],
              borderColor: palette[i % palette.length], borderWidth: isLine ? 2 : 0,
              fill: kind === 'area', tension: 0.35, borderRadius: isLine ? 0 : 6, maxBarThickness: 34, pointRadius: 0,
            }));
            cfg = { type: isLine ? 'line' : 'bar', data: { labels, datasets }, options: {
              responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
              plugins: { legend: { display: series.length > 1, position: 'bottom', labels: { color: TICK, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } }, tooltip: TT },
              scales: { x: { grid: { display: false }, ticks: { color: TICK, font: { size: 10 }, maxRotation: 0, autoSkip: true } },
                y: { grid: { color: GRID }, border: { display: false }, beginAtZero: true, ticks: { color: TICK, font: { size: 10 }, maxTicksLimit: 5, callback: yFmt } } } } };
          }
          this._reg(new Chart(canvas, cfg));
        });
      });
    },

    /* Population pyramid: barras horizontales espejadas (hombres izq / mujeres der)
       por grupo de edad. Tall/vertical = grupos de edad apilados en el eje Y. */
    _paintPyramid(canvas, block) {
      const Chart = window.Chart;
      if (!Chart || !canvas) return;
      const [accent] = this._gridBrandHexes();
      const [r, g, bl] = this._hexToRgb(accent);
      const groups = Array.isArray(block.groups) ? block.groups : [];
      const male = (Array.isArray(block.male) ? block.male : []).map((v) => -Math.abs(Number(v) || 0));
      const female = (Array.isArray(block.female) ? block.female : []).map((v) => Math.abs(Number(v) || 0));
      const TICK = 'rgba(255,255,255,0.5)', GRID = 'rgba(255,255,255,0.06)';
      const TT = { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10 };
      this._reg(new Chart(canvas, {
        type: 'bar',
        data: { labels: groups, datasets: [
          { label: __('Hombres'), data: male, backgroundColor: `rgba(${r},${g},${bl},0.42)`, borderRadius: 4, maxBarThickness: 15 },
          { label: __('Mujeres'), data: female, backgroundColor: `rgba(${r},${g},${bl},0.95)`, borderRadius: 4, maxBarThickness: 15 },
        ] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: TICK, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
            tooltip: { ...TT, callbacks: { label: (c) => `${c.dataset.label}: ${Math.abs(c.raw)}%` } },
          },
          scales: {
            x: { grid: { color: GRID }, border: { display: false }, ticks: { color: TICK, font: { size: 9 }, callback: (v) => Math.abs(v) + '%' } },
            y: { grid: { display: false }, border: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
          },
        },
      }));
    },

    /* Carga perezosa de chartjs-chart-geo + topojson del mundo (una vez). */
    async _ensureGeoChart() {
      if (!window.ChartGeo) {
        await this.loadScript('https://cdn.jsdelivr.net/npm/chartjs-chart-geo@4.3.4/build/index.umd.min.js', 'ChartGeo', 9000);
        try { const G = window.ChartGeo; window.Chart.register(G.ChoroplethController, G.GeoFeature, G.ColorScale, G.ProjectionScale); } catch (_) {}
      }
      if (!this._geoTopo) {
        this._geoTopo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then((r) => r.json());
      }
    },

    /* Choropleth de audiencia por país. Si la librería geo falla, cae a barras. */
    async _paintChoropleth(canvas, block, fbEl) {
      const A3_NUM = { MEX: '484', COL: '170', USA: '840', PER: '604', ESP: '724', ARG: '032', CHL: '152', BRA: '076', ECU: '218', VEN: '862', GTM: '320', BOL: '068', DOM: '214', HND: '340', PRY: '600', SLV: '222', NIC: '558', CRI: '188', PAN: '591', URY: '858', PRI: '630', CAN: '124', GBR: '826', FRA: '250', DEU: '276', ITA: '380' };
      try {
        await this._ensureGeoChart();
        const G = window.ChartGeo, Chart = window.Chart;
        if (!G || !this._geoTopo || !G.topojson) throw new Error('geo-unavailable');
        const topo = this._geoTopo;
        const features = G.topojson.feature(topo, topo.objects.countries).features;
        const valByNum = {};
        (Array.isArray(block.data) ? block.data : []).forEach((d) => { valByNum[String(A3_NUM[d.code] || d.code)] = Number(d.value) || 0; });
        const nameByNum = {};
        (Array.isArray(block.data) ? block.data : []).forEach((d) => { nameByNum[String(A3_NUM[d.code] || d.code)] = d.name || d.code; });
        const [accent] = this._gridBrandHexes();
        const [r, g, bl] = this._hexToRgb(accent);
        const data = features.map((f) => ({ feature: f, value: valByNum[String(f.id)] != null ? valByNum[String(f.id)] : 0 }));
        this._reg(new Chart(canvas, {
          type: 'choropleth',
          data: { labels: features.map((f) => f.properties && f.properties.name), datasets: [{ label: '', outline: features, data, borderColor: 'rgba(255,255,255,0.06)', borderWidth: 0.4 }] },
          options: {
            responsive: true, maintainAspectRatio: false, showOutline: true, showGraticule: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const num = String(c.raw.feature.id); return `${nameByNum[num] || (c.raw.feature.properties && c.raw.feature.properties.name)}: ${c.raw.value}%`; } } } },
            scales: {
              projection: { axis: 'x', projection: 'equalEarth' },
              color: { axis: 'x', display: false, interpolate: (v) => `rgba(${r},${g},${bl},${(0.10 + 0.88 * (v || 0)).toFixed(3)})` },
            },
          },
        }));
        if (canvas) canvas.hidden = false;
        if (fbEl) fbEl.hidden = true;
      } catch (e) {
        // Fallback robusto: barras por país (nunca queda roto).
        if (canvas) canvas.hidden = true;
        if (fbEl) { fbEl.hidden = false; fbEl.innerHTML = this._geoBarsHtml(block); }
      }
    },

    _geoBarsHtml(block) {
      const rows = (Array.isArray(block.data) ? block.data : []).slice().sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
      if (!rows.length) return '';
      const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
      const [accent] = this._gridBrandHexes();
      return `<div class="vera-geo-bars">${rows.map((r) => `
        <div class="vera-geo-row">
          <span class="vera-geo-name">${this._esc(r.name || r.code || '')}</span>
          <div class="vera-geo-track"><div class="vera-geo-fill" style="width:${Math.round((Number(r.value) || 0) / max * 100)}%;background:${this._esc(accent)}"></div></div>
          <span class="vera-geo-val">${Number(r.value) || 0}%</span>
        </div>`).join('')}</div>`;
    },

    /* Tier de salud/rendimiento (misma lógica que Campañas): benchmark → nivel
       con color semántico. Verde=bien, ámbar=regular, rojo=mal. */
    _healthTier(score) {
      const s = Number(score) || 0;
      if (s >= 85) return { tier: 'exc', label: __('Excelente'), color: '#46c98a' };
      if (s >= 70) return { tier: 'buena', label: __('Buena'), color: '#84cba0' };
      if (s >= 40) return { tier: 'regular', label: __('Regular'), color: '#e6a94e' };
      return { tier: 'baja', label: __('Baja'), color: '#e77a7a' };
    },

    /* Arco (gauge) de salud de marca. Solo el arco + score; el desglose va al modal. */
    _paintSaludArc(body, data) {
      const host = body.querySelector('#bgridSaludArc');
      if (!host) return;
      const h = data.health || {};
      const score = (h.score == null) ? null : Math.round(Number(h.score));
      if (score == null) {
        host.innerHTML = `<div class="bgrid-arc-empty">${this._esc(__('Conecta tus plataformas para ver la salud de tu marca.'))}</div>`;
        return;
      }
      const t = this._healthTier(score);
      const pct = Math.max(0, Math.min(100, score));
      const R = 80, LEN = Math.PI * R;          // longitud del semicírculo
      const dash = LEN * pct / 100;
      host.innerHTML = `
        <div class="bgrid-arc">
          <svg class="bgrid-arc-svg" viewBox="0 0 200 118" role="img" aria-label="${this._esc(__('Salud'))} ${score}/100">
            <path d="M 18 98 A 80 80 0 0 1 182 98" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="15" stroke-linecap="round"/>
            <path d="M 18 98 A 80 80 0 0 1 182 98" fill="none" stroke="${t.color}" stroke-width="15" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${LEN.toFixed(1)}"/>
          </svg>
          <div class="bgrid-arc-center">
            <span class="bgrid-arc-score">${score}<span class="bgrid-arc-max">/100</span></span>
            <span class="bgrid-arc-verdict" style="color:${t.color}">${this._esc(t.label)}</span>
          </div>
        </div>`;
    },

    /* Modal de desglose de salud por canal + métrica. */
    _openSaludDetails(h) {
      if (!h || !Array.isArray(h.channels) || !h.channels.length) return;
      const esc = (s) => this._esc(s);
      const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
      const chans = h.channels.map((c) => `
        <div class="salud-ch">
          <div class="salud-ch-head">
            <span class="salud-ch-name">${esc(c.label)}</span>
            <span class="salud-ch-score" data-tier="${this._healthTier(c.score).tier}">${clamp(c.score)}%</span>
          </div>
          ${(c.metrics || []).map((m) => {
            const on = Math.round(clamp(m.score) / 100 * 28);
            const segs = Array.from({ length: 28 }, (_, i) => `<i class="salud-seg${i < on ? ' is-on' : ''}"></i>`).join('');
            return `
            <div class="salud-metric">
              <div class="salud-metric-top"><span>${esc(m.label)}</span><span class="salud-metric-pct">${clamp(m.score)}%</span></div>
              <div class="salud-seg-bar" data-tier="${this._healthTier(m.score).tier}">${segs}</div>
            </div>`;
          }).join('')}
        </div>`).join('');
      const overlay = document.createElement('div');
      overlay.className = 'salud-overlay';
      overlay.innerHTML = `
        <div class="salud-modal" role="dialog" aria-modal="true">
          <div class="salud-modal-head">
            <span class="salud-modal-title">${esc(__('Salud por canal'))}</span>
            <button type="button" class="salud-modal-close" aria-label="${esc(__('Cerrar'))}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
          </div>
          <div class="salud-modal-body">${chans}</div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.salud-modal-close')) close(); });
      document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
    },

    /* Footer del tráfico (última publicación / total). El pill de estado se eliminó. */
    _paintGridStatus(body, data) {
      const foot = body.querySelector('#bgridActivityFoot');
      if (!foot) return;
      const total = Number(data.activity?.total || 0);
      const days = data.activity?.days_since;
      const last = (days == null) ? __('Sin publicaciones recientes')
        : (days <= 0 ? __('Publicaste hoy') : __('Hace {n} días', { n: Math.round(days) }));
      foot.innerHTML = `<span>${this._esc(__('{n} publicaciones', { n: total }))}</span><span class="bgrid-foot-sep">·</span><span>${this._esc(last)}</span>`;
    },

    /* Acento vivo de marca para los charts. NUNCA negro: los charts se pintan
       sobre el degradado oscuro, así que un tono oscuro se pierde. Priorizamos
       las CSS vars de marca (las mismas que tiñen la barra de salud en naranja)
       y descartamos hexes casi-negros de getLastBrandHexes. */
    _gridBrandHexes() {
      const isVivid = (h) => { try { const [r, g, b] = this._hexToRgb(h); return (r + g + b) > 180; } catch (_) { return false; } };
      const cs = getComputedStyle(document.documentElement);
      const light = (cs.getPropertyValue('--brand-color-light') || '').trim();
      const dark = (cs.getPropertyValue('--brand-color-dark') || '').trim();
      // 1) var de marca viva; 2) hex vivo del tema dinámico; 3) naranja plataforma.
      const candidates = [light, dark];
      try {
        const hexes = window.OrgBrandTheme?.getLastBrandHexes?.();
        if (Array.isArray(hexes)) candidates.push(...hexes);
      } catch (_) {}
      const vivid = candidates.filter(Boolean).find(isVivid);
      return [vivid || '#FF6A1A'];
    },

    _hexToRgb(hex) {
      const m = String(hex).replace('#', '');
      const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
      const int = parseInt(n, 16);
      return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
    },

    /* Chart 1: barras apiladas por red. */
    _paintActivityChart(body, data) {
      const Chart = window.Chart;
      const canvas = body.querySelector('#bgridActivityChart');
      const empty = body.querySelector('#bgridActivityEmpty');
      const series = Array.isArray(data.activity?.series) ? data.activity.series : [];
      if (!Chart || !canvas) return;
      if (!series.length) { canvas.hidden = true; if (empty) empty.hidden = false; return; }
      canvas.hidden = false; if (empty) empty.hidden = true;

      // Redes presentes, ordenadas por volumen total (stacking estable).
      const totals = {};
      series.forEach((b) => Object.entries(b.networks || {}).forEach(([n, c]) => { totals[n] = (totals[n] || 0) + Number(c || 0); }));
      const nets = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
      const [accent] = this._gridBrandHexes();
      const [r, g, bl] = this._hexToRgb(accent);
      const alphas = [1, 0.72, 0.5, 0.34, 0.22, 0.15];

      const labels = series.map((b) => b.label);
      const datasets = nets.map((n, idx) => ({
        label: NET_LABEL[n] || (n.charAt(0).toUpperCase() + n.slice(1)),
        data: series.map((b) => Number(b.networks?.[n] || 0)),
        backgroundColor: `rgba(${r},${g},${bl},${alphas[idx] != null ? alphas[idx] : 0.12})`,
        // Solo se redondean las esquinas SUPERIORES, y solo en el segmento que
        // queda ARRIBA del stack (el ultimo dataset visible con valor > 0 en ese
        // dia). El resto de segmentos van cuadrados para que el stack se vea como
        // una sola barra continua con la punta redondeada.
        borderRadius: (ctx) => {
          const val = Number(ctx.raw != null ? ctx.raw : (ctx.dataset.data[ctx.dataIndex] || 0));
          if (val <= 0) return 0;
          const ch = ctx.chart;
          let topIdx = -1;
          for (let d = 0; d < ch.data.datasets.length; d++) {
            if (!ch.isDatasetVisible(d)) continue;
            if (Number(ch.data.datasets[d].data[ctx.dataIndex] || 0) > 0) topIdx = d;
          }
          return ctx.datasetIndex === topIdx
            ? { topLeft: 7, topRight: 7, bottomLeft: 0, bottomRight: 0 }
            : 0;
        },
        borderSkipped: false,
        maxBarThickness: 30,
        categoryPercentage: 0.6,
        barPercentage: 0.92,
        stack: 'posts',
      }));

      const TICK = 'rgba(255,255,255,0.55)';
      const GRID = 'rgba(255,255,255,0.06)';
      this._reg(new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { color: TICK, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
            tooltip: { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10 },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: TICK, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { stacked: true, grid: { color: GRID }, border: { display: false }, beginAtZero: true, ticks: { color: TICK, font: { size: 10 }, precision: 0, maxTicksLimit: 5 } },
          },
        },
      }));
    },

    /* Chart 2: Interacciones — TOTAL de interacciones (likes+comentarios+
       reproducciones+guardados+…) por periodo. Suma cruda (total_engagement),
       no ponderada. Click en una barra → publicaciones de ese día. */
    _paintLatidosChart(body, data) {
      const Chart = window.Chart;
      const canvas = body.querySelector('#bgridLatidosChart');
      const empty = body.querySelector('#bgridLatidosEmpty');
      if (!Chart || !canvas) return;

      // Sumar total de interacciones por periodo (filas = periodo × marca).
      const byBucket = new Map();
      (data.impact || []).forEach((row) => {
        const key = row.period_start || row.period_label;
        const prev = byBucket.get(key) || { label: row.period_label, v: 0, start: row.period_start, end: row.period_end };
        prev.v += Number(row.total_engagement || 0);
        byBucket.set(key, prev);
      });
      const buckets = Array.from(byBucket.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([, v]) => v);
      if (!buckets.length) { canvas.hidden = true; if (empty) empty.hidden = false; return; }
      canvas.hidden = false; if (empty) empty.hidden = true;

      const [accent] = this._gridBrandHexes();
      const [r, g, bl] = this._hexToRgb(accent);
      const max = Math.max(1, ...buckets.map((b) => b.v));
      // CANDLESTICK / latido: cada barra FLOTA centrada en la línea media. La
      // altura usa escala LOGARÍTMICA: el rango real es enorme (un periodo puede
      // tener 260x otro), y con raíz/lineal los periodos chicos quedan como
      // puntitos. Log comprime el rango → todos los periodos se ven como barras
      // con variación. Intensidad = color.
      const norm = (v) => Math.log((v || 0) + 1) / Math.log(max + 1);
      const floatData = buckets.map((b) => {
        const half = Math.max(0.06, 0.46 * norm(b.v));
        return [0.5 - half, 0.5 + half];
      });
      // Dos tonos como el heart-rate de referencia: latido bajo = gris,
      // latido alto = naranja de marca. Se interpola por intensidad.
      const colors = buckets.map((b) => {
        const t = norm(b.v);
        const mix = (from, to) => Math.round(from + (to - from) * t);
        const a = (0.45 + 0.55 * t).toFixed(3);
        return `rgba(${mix(145, r)},${mix(145, g)},${mix(150, bl)},${a})`;
      });
      const TICK = 'rgba(255,255,255,0.5)';

      this._reg(new Chart(canvas, {
        type: 'bar',
        data: { labels: buckets.map((b) => b.label), datasets: [{
          label: __('Interacciones'),
          data: floatData,
          backgroundColor: colors,
          borderRadius: 20,
          borderSkipped: false,
          maxBarThickness: 9,
          categoryPercentage: 0.9,
          barPercentage: 0.55,
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onClick: (evt, els) => {
            const idx = (els && els.length) ? els[0].index : null;
            if (idx != null && buckets[idx]) this._openInteraccionesDay(buckets[idx]);
          },
          onHover: (evt, els) => { evt.native.target.style.cursor = (els && els.length) ? 'pointer' : 'default'; },
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10,
              callbacks: { label: (c) => `${__('Interacciones')}: ${Math.round(buckets[c.dataIndex].v).toLocaleString()}` } },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: TICK, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
            y: { min: 0, max: 1, display: false, grid: { display: false }, border: { display: false } },
          },
        },
      }));
    },

    /* Drill-down: publicaciones del periodo clickeado, ordenadas por interacciones
       (la primera = la que más produjo). */
    async _openInteraccionesDay(bucket) {
      const ids = this._gridBcIds || [];
      if (!ids.length || !bucket) return;
      let rows = [];
      try {
        let q = this._supabase.from('brand_posts')
          .select('network, content, engagement_total, captured_at, profile_handle')
          .in('brand_container_id', ids).eq('post_source', 'own')
          .order('engagement_total', { ascending: false, nullsFirst: false }).limit(50);
        if (bucket.start) q = q.gte('captured_at', bucket.start);
        if (bucket.end) q = q.lt('captured_at', bucket.end);
        const { data } = await q;
        rows = Array.isArray(data) ? data : [];
      } catch (_) {}
      const esc = (s) => this._esc(s);
      const fmtNet = (n) => NET_LABEL[String(n || '').toLowerCase()] || (n ? n.charAt(0).toUpperCase() + n.slice(1) : '—');
      const body = rows.length
        ? rows.map((p, i) => `
            <div class="inter-post${i === 0 ? ' inter-post--top' : ''}">
              <div class="inter-post-head">
                <span class="inter-post-net">${esc(fmtNet(p.network))}</span>
                ${i === 0 ? `<span class="inter-post-badge">${esc(__('Más interacciones'))}</span>` : ''}
                <span class="inter-post-eng">${Number(p.engagement_total || 0).toLocaleString()}</span>
              </div>
              ${p.content ? `<div class="inter-post-snippet">${esc(String(p.content).slice(0, 160))}</div>` : ''}
            </div>`).join('')
        : `<div class="inter-empty">${esc(__('Sin publicaciones ese periodo'))}</div>`;
      const overlay = document.createElement('div');
      overlay.className = 'salud-overlay';
      overlay.innerHTML = `
        <div class="salud-modal" role="dialog" aria-modal="true">
          <div class="salud-modal-head">
            <span class="salud-modal-title">${esc(__('Interacciones'))} · ${esc(bucket.label || '')}</span>
            <button type="button" class="salud-modal-close" aria-label="${esc(__('Cerrar'))}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
          </div>
          <div class="salud-modal-body">${body}</div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.salud-modal-close')) close(); });
      document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
    },
  });
})();
