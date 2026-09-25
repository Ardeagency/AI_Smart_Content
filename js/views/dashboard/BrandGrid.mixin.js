/**
 * DashboardView — BrandGrid mixin (Mi Marca, diseño de v1 sobre la base nueva).
 *
 * El GRID de Mi Marca, tal como lo pintaba la ruta viva de v1 (8520ff8a^):
 *   columna izquierda  Intuición · Interacciones (latido) · Fortalezas/Debilidades ·
 *                      Audiencias · Audiencias recomendadas · Algoritmo · Producto destacado
 *   columna derecha    Tráfico (arco de salud + barras por red + filtro de periodo) ·
 *                      Publicación destacada · Campañas · Observaciones
 *   al pie             las cards.vera4 de Mi Marca (Vera4.mixin) y «Lo que estás pautando» (BrandAds)
 *
 * DATOS: solo window.DashboardDatos. Tráfico e Interacciones salen de social.actividad_diaria,
 * la Publicación destacada de social.posts_view + social.comments, Campañas de
 * marketing.campanas_rendimiento y las cards de Vera de la lectura cards.v2 del periodo activo.
 * La salud de marca y el producto destacado no tienen fuente todavía (P4): se ven en su sitio
 * como «todavía no». Toda sección sin datos conserva su marco de v1 y dice qué le falta.
 *
 * Todo texto de Vera se escapa (lee posts, comentarios y web). Charts por Chart.js con los
 * colores de la MARCA por token (--org-*, vía this._coloresMarca()).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  /* Países del mapa de audiencia: "ISO2/ISO3:id-numérico-del-topojson" en la MISMA entrada
     para que los dos códigos no puedan divergir. */
  const BrandGridGeo = {
    mapa: null,
    tabla: [
      'AR/ARG:032 BO/BOL:068 BR/BRA:076 CL/CHL:152 CO/COL:170 CR/CRI:188 CU/CUB:192',
      'DO/DOM:214 EC/ECU:218 SV/SLV:222 GT/GTM:320 HN/HND:340 MX/MEX:484 NI/NIC:558',
      'PA/PAN:591 PY/PRY:600 PE/PER:604 PR/PRI:630 UY/URY:858 VE/VEN:862 BZ/BLZ:084',
      'US/USA:840 CA/CAN:124 JM/JAM:388 HT/HTI:332 TT/TTO:780',
      'ES/ESP:724 PT/PRT:620 FR/FRA:250 DE/DEU:276 IT/ITA:380 GB/GBR:826 IE/IRL:372',
      'NL/NLD:528 BE/BEL:056 CH/CHE:756 AT/AUT:040 SE/SWE:752 NO/NOR:578 DK/DNK:208',
      'FI/FIN:246 PL/POL:616 CZ/CZE:203 GR/GRC:300 RO/ROU:642 HU/HUN:348 UA/UKR:804',
      'RU/RUS:643 TR/TUR:792 IL/ISR:376 SA/SAU:682 AE/ARE:784 EG/EGY:818 MA/MAR:504',
      'NG/NGA:566 ZA/ZAF:710 KE/KEN:404 GH/GHA:288 ET/ETH:231',
      'CN/CHN:156 JP/JPN:392 KR/KOR:410 IN/IND:356 ID/IDN:360 PH/PHL:608 VN/VNM:704',
      'TH/THA:764 MY/MYS:458 SG/SGP:702 AU/AUS:036 NZ/NZL:554 PK/PAK:586 BD/BGD:050',
    ].join(' '),
  };

  const WINDOWS = [
    { k: 'week',  days: 7,    label: () => __('Semana') },
    { k: 'month', days: 30,   label: () => __('Mes') },
    { k: 'year',  days: 365,  label: () => __('Año') },
    { k: 'all',   days: null, label: () => __('Todo') },
  ];

  // Cuánto late lo que Vera acaba de actualizar (el apagado lo hace el JS, no el CSS).
  const LATIDO_MS = 90000;

  const PLATFORM_ICON = {
    tiktok: 'fab fa-tiktok', instagram: 'fab fa-instagram', facebook: 'fab fa-facebook',
    youtube: 'fab fa-youtube', x: 'fab fa-x-twitter', twitter: 'fab fa-x-twitter',
    linkedin: 'fab fa-linkedin-in', ads: 'fas fa-bullseye', meta: 'fab fa-meta', google: 'fab fa-google',
  };
  const iconoDeRed = (txt) => {
    const t = String(txt || '').toLowerCase();
    const k = Object.keys(PLATFORM_ICON).find((x) => t.includes(x));
    return k ? PLATFORM_ICON[k] : null;
  };

  const NET_LABEL = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    x: 'X', twitter: 'X', youtube: 'YouTube', linkedin: 'LinkedIn',
  };

  /* Las cards.v2 de Mi Marca: su rótulo, su icono y qué dice cuando todavía no hay lectura. */
  const V2 = {
    intuicion:               { label: () => __('Intuición'),               icon: 'sparkle' },
    observacion:             { label: () => __('Observaciones'),           icon: 'eye' },
    virtudes:                { label: () => __('Fortalezas'),              icon: 'star' },
    desventajas:             { label: () => __('Debilidades'),             icon: 'alert-warning' },
    audiencia:               { label: () => __('Audiencias'),              icon: 'audience' },
    audiencias_recomendadas: { label: () => __('Audiencias recomendadas'), icon: 'audience' },
    algoritmo:               { label: () => __('Algoritmo'),               icon: 'compass' },
  };

  const hoyIso = () => new Date().toISOString().slice(0, 10);
  const menosUnDia = (iso) => new Date(new Date(`${iso}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

  Object.assign(DashboardView.prototype, {

    /* ── Entrada del grid de Mi Marca ── */
    async _renderBrandGrid(body) {
      if (!body) return true;
      if (this._gridWindow == null) this._gridWindow = 'month';
      this._gridBody = body;
      if (!body.querySelector('.bgrid')) {
        this._pintar(body, this._buildBrandGridShell());
        this._bindBrandGrid(body);
        this._gridPicker()?.mount(body.querySelector('.bgrid-seg'));
      }
      await this._gridLoadAndPaint(body);
      return true;
    },

    /* El DateRangePicker de la plataforma, como quinto botón del filtro de Tráfico. */
    _gridPicker() {
      if (!this._gridDP && typeof window.DateRangePicker === 'function') {
        const r = this._gridCustomRange || {};
        this._gridDP = new window.DateRangePicker({
          from: r.from || null,
          to: r.to || null,
          // El componente hace `opts.label || __('Fecha')`: un espacio (que el CSS oculta) evita el rótulo.
          label: ' ',
          allLabel: __('Personalizado'),
          onChange: ({ from, to }) => {
            if (!from && !to) { this._gridWindow = 'month'; this._gridCustomRange = null; }
            else { this._gridWindow = 'custom'; this._gridCustomRange = { from, to }; }
            const body = this._gridBody;
            this._gridSyncSeg(body || document);
            if (body) this._gridLoadAndPaint(body);
          },
        });
      }
      return this._gridDP;
    },

    _gridSyncSeg(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('.bgrid-seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.window === this._gridWindow));
      const filtro = root.querySelector('.bgrid-seg [data-drp]');
      if (filtro) filtro.classList.toggle('is-active', this._gridWindow === 'custom');
    },

    _buildBrandGridShell() {
      const esc = (s) => this._esc(s);
      const seg = WINDOWS.map((w) => `
        <button type="button" class="bgrid-seg-btn${w.k === this._gridWindow ? ' is-active' : ''}" data-window="${w.k}" role="tab">${esc(w.label())}</button>`).join('')
        + (this._gridPicker() ? this._gridPicker().html() : '');
      return `
        <div class="bgrid">
          <div class="bgrid-col">
            <div class="bgrid-intuicion" id="bgridIntuicion"></div>
            <section class="bgrid-card bgrid-card--latidos">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${esc(__('Interacciones'))}</span>
              </header>
              <p class="bgrid-card-sub">${esc(__('Cuántas interacciones producen tus redes por periodo · toca una barra para ver ese día'))}</p>
              <div class="bgrid-chart-wrap bgrid-chart-wrap--latidos" id="bgridLatidosWrap"><canvas id="bgridLatidosChart"></canvas><div class="bgrid-empty" id="bgridLatidosEmpty" hidden>${esc(__('Sin señal de impacto en este periodo'))}</div></div>
              <div class="bgrid-falta" id="bgridLatidosFalta" hidden></div>
            </section>
            <div class="bgrid-vd" id="bgridVD"></div>
            <div class="bgrid-vera" id="bgridVera"></div>
          </div>
          <div class="bgrid-col">
            <section class="bgrid-card glass-black bgrid-card--activity">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--actividad" aria-hidden="true"></i>${esc(__('Tráfico'))}</span>
                <button type="button" class="btn btn--gris btn--icono btn--sm bgrid-details-btn" data-salud-details hidden aria-label="${esc(__('Ver detalles de salud'))}" title="${esc(__('Ver detalles de salud'))}"><i class="aisc-ico aisc-ico--chart-bar" aria-hidden="true"></i></button>
              </header>
              <div class="bgrid-salud-arc" id="bgridSaludArc"></div>
              <nav class="bgrid-seg" role="tablist" aria-label="${esc(__('Periodo'))}">${seg}</nav>
              <div class="bgrid-chart-wrap" id="bgridActivityWrap"><canvas id="bgridActivityChart"></canvas><div class="bgrid-empty" id="bgridActivityEmpty" hidden>${esc(__('Sin publicaciones en este periodo'))}</div></div>
              <div class="bgrid-falta" id="bgridActivityFalta" hidden></div>
              <footer class="bgrid-card-foot" id="bgridActivityFoot"></footer>
            </section>
            <section class="bgrid-card bgrid-card--toppost">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${esc(__('Publicación destacada'))}</span>
              </header>
              <div class="cgrid-post" id="bgridTopPost"><div class="cgrid-load">${esc(__('Buscando la publicación…'))}</div></div>
            </section>
            <section class="bgrid-card bgrid-card--campaigns" id="bgridCampaignsCard">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title bgrid-card-title--dark"><i class="aisc-ico aisc-ico--campaign" aria-hidden="true"></i>${esc(__('Campañas'))}</span>
              </header>
              <div class="bgrid-campaigns" id="bgridCampaigns"></div>
            </section>
            <section class="bgrid-card cgrid-card--obs" id="bgridObsCard">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--eye" aria-hidden="true"></i>${esc(__('Observaciones'))}</span>
              </header>
              <p class="bgrid-card-sub">${esc(__('Lo más destacado de tu marca en este periodo'))}</p>
              <div class="cgrid-obs" id="bgridObservacion"></div>
              <span class="vera-card-fecha" id="bgridObsFecha" hidden></span>
            </section>
          </div>
          <section class="bgrid-card bgrid-card--prodstar">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--star" aria-hidden="true"></i>${esc(__('Producto destacado'))}</span>
            </header>
            <p class="bgrid-card-sub">${esc(__('Cuál producto empujas más y cómo te responde'))}</p>
            <div class="vera-prodstar" id="bgridProdStar"></div>
          </section>
          <div class="bgrid-v4 vera4" id="bgridVera4"></div>
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
        this._gridCustomRange = null;
        this._gridSyncSeg(body);
        this._gridLoadAndPaint(body);
      });
    },

    _gridWindowDays() {
      return (WINDOWS.find((w) => w.k === this._gridWindow) || WINDOWS[1]).days;
    },

    /** Día de la última publicación propia (cacheado por render): ancla las ventanas como en v1. */
    async _gridLastOwnPost() {
      if (this._gridUltima !== undefined) return this._gridUltima;
      const r = await window.DashboardDatos.ultimaFecha(this._orgId, 'own');
      this._gridUltima = r.falta ? null : r.datos;
      return this._gridUltima;
    },

    /* Rango de la ventana activa en 'YYYY-MM-DD'. El personalizado va tal cual (sin anclar). */
    async _gridRango() {
      const D = window.DashboardDatos;
      if (this._gridWindow === 'custom' && this._gridCustomRange) {
        const { from, to } = this._gridCustomRange;
        return D.rangoDeVentana('custom', { desde: from || '2015-01-01', hasta: to || hoyIso() });
      }
      const ultima = await this._gridLastOwnPost();
      return D.rangoDeVentana(this._gridWindow || 'month', { ultima });
    },

    async _gridLoadAndPaint(body) {
      const D = window.DashboardDatos;
      if (!D) return;
      this._gridUltima = undefined;
      const rango = await this._gridRango();
      this._gridRangoActual = rango;
      const r = await D.trafico(this._orgId, rango);
      if (!this._sigue('my-brands')) return;
      const data = { health: null, activity: r.falta ? null : r.datos.activity, impact: r.falta ? [] : r.datos.impact, falta: r };
      this._gridHealth = data.health;
      this._paintSaludArc(body, data);
      this._paintGridStatus(body, data);
      try { await this._ensureChartJs(); } catch (e) { console.warn('[BrandGrid] Chart.js:', e?.message); }
      this._destroyCharts();
      this._paintActivityChart(body, data);
      this._paintLatidosChart(body, data);
      this._paintCampaigns(body);
      this._paintProductoEstrella(body);
      this._paintTopPostPropio(body);
      await this._renderVeraCards(body);
    },

    /* Pinta «todavía no» en el hueco de un chart (sin la vista) y lo esconde; o vuelve a mostrarlo. */
    _gridFalta(body, cual, r, texto) {
      const wrap = body.querySelector(`#bgrid${cual}Wrap`);
      const falta = body.querySelector(`#bgrid${cual}Falta`);
      const hay = !!(r && r.falta);
      if (wrap) wrap.hidden = hay;
      if (falta) {
        falta.hidden = !hay;
        this._pintar(falta, hay ? this._todaviaNo(__('Todavía no'), this._faltaTexto(r, texto)) : '');
      }
      return hay;
    },

    /* Card Campañas: SOLO activas. Cada fila: mini-gauge + nombre/objetivo + badge. */
    async _paintCampaigns(body) {
      const host = body.querySelector('#bgridCampaigns');
      if (!host) return;
      const r = await window.DashboardDatos.campanasActivas(this._orgId);
      if (!this._sigue('my-brands')) return;
      if (r.falta) {
        this._pintar(host, this._todaviaNo(__('Todavía no'), this._faltaTexto(r, __('Aparece cuando la base cruce tus campañas con su rendimiento.'))));
        return;
      }
      const rows = r.datos || [];
      if (!rows.length) {
        this._pintar(host, this._todaviaNo(__('Sin campañas activas'), __('Aparece cuando tengas una campaña corriendo en Meta.')));
        return;
      }
      this._pintar(host, rows.map((c) => this._campaignRowHtml(c)).join(''));
    },

    /* Efectividad según el OBJETIVO y la KPI que importa (benchmarks Meta 2025):
       Ventas → ROAS · Leads → CVR · Tráfico/otros → CTR. */
    _campaignEffectiveness(c) {
      const obj = String(c.platform_objective || '');
      const ctr = Number(c.cached_ctr) || 0;
      const roas = c.cached_roas == null ? null : Number(c.cached_roas);
      const conv = Number(c.cached_conversions) || 0;
      const clicks = Number(c.cached_clicks) || 0;
      const cvr = clicks > 0 ? (conv / clicks * 100) : null;
      let val, exc, buena, reg;
      if (obj === 'OUTCOME_SALES' || (roas != null && roas > 0)) { val = roas || 0; exc = 5; buena = 3; reg = 2; }
      else if (obj === 'OUTCOME_LEADS' && cvr != null) { val = cvr; exc = 8; buena = 4; reg = 2; }
      else { val = ctr; exc = 3; buena = 1.5; reg = 0.8; }
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
      const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n));
      const bits = [];
      if (roas != null) bits.push(`ROAS ${roas.toFixed(1)}x`);
      bits.push(`CTR ${ctr.toFixed(1)}%`);
      if (roas != null && conv > 0) bits.push(`${fmtK(conv)} conv`);
      else if (clicks > 0) bits.push(__('{n} clics', { n: fmtK(clicks) }));
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
      return `
        <svg class="camp-gauge" viewBox="0 0 40 40" aria-label="${s}" data-tier="${this._esc(tier || 'exc')}">
          <circle class="camp-gauge-track" cx="20" cy="20" r="15.5" fill="none" stroke-width="3.5"/>
          <circle class="camp-gauge-val" cx="20" cy="20" r="15.5" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 20 20)"/>
          <text x="20" y="20" text-anchor="middle" dominant-baseline="central" class="camp-gauge-num">${s}</text>
        </svg>`;
    },

    /* ══ Cards de Vera (schema cards.v2), una lectura por periodo ═══════════ */

    /* La lectura del filtro activo; el rango personalizado toma la del preset de duración más parecida. */
    _veraPeriodoActivo() {
      const w = this._gridWindow || 'month';
      if (w !== 'custom') return w;
      const r = this._gridCustomRange;
      if (!r || !r.from || !r.to) return 'month';
      const dias = Math.abs(new Date(r.to) - new Date(r.from)) / 86400000;
      if (!isFinite(dias)) return 'month';
      let mejor = 'all', dist = Infinity;
      WINDOWS.forEach((win) => {
        if (win.days == null) return;
        const d = Math.abs(win.days - dias);
        if (d < dist) { dist = d; mejor = win.k; }
      });
      return dias > 365 ? 'all' : mejor;
    },

    // «hace 3 min», «hace 1 hora», «hace 2 días»: lo lee quien mira su marca.
    _veraHace(iso) {
      const t = iso ? new Date(iso).getTime() : NaN;
      if (!t || Number.isNaN(t)) return '';
      const seg = Math.floor((Date.now() - t) / 1000);
      if (seg < 60) return __('hace un momento');
      const min = Math.floor(seg / 60);
      if (min < 60) return __('hace {n} min', { n: min });
      const h = Math.floor(min / 60);
      if (h < 24) return h === 1 ? __('hace 1 hora') : __('hace {n} horas', { n: h });
      const d = Math.floor(h / 24);
      if (d < 30) return d === 1 ? __('hace 1 día') : __('hace {n} días', { n: d });
      const meses = Math.floor(d / 30);
      return meses === 1 ? __('hace 1 mes') : __('hace {n} meses', { n: meses });
    },

    _veraFechaExacta(iso) {
      try {
        const loc = (window.i18n && window.i18n.getLocale && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO';
        return new Date(iso).toLocaleString(loc, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch (e) { return String(iso || ''); }
    },

    /* La hora de UNA card: su sello, y si no lo tiene, el de la lectura. */
    _veraFechaDatos(card) {
      const iso = (card && card.updated_at) || this._veraLecturaAt || null;
      const rel = this._veraHace(iso);
      if (!rel) return null;
      return { iso, rel, exacta: this._veraFechaExacta(iso) };
    },

    _veraFechaHtml(card) {
      const f = this._veraFechaDatos(card);
      if (!f) return '';
      const txt = __('Última actualización {d}', { d: f.rel });
      const exacta = __('Última actualización {d}', { d: f.exacta });
      return `<span class="vera-card-fecha" title="${this._esc(exacta)}">${this._esc(txt)}</span>`;
    },

    _veraHuellasKey() {
      return `vera:mimarca:huellas:${this._orgId || 'global'}:${this._veraPeriodoActivo()}`;
    },

    // Identidad ESTABLE de cada pieza: la usan la plantilla (DOM) y el cálculo de huellas.
    _nid(prefijo, sem) {
      const limpio = String(sem == null ? '' : sem)
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
      return `${prefijo}:${limpio || 'x'}`;
    },
    _nidCard(card) { return this._nid('card', card && card.type); },
    _nidObs(o) { return this._nid('obs', (o && (o.titulo || o.observacion)) || ''); },
    _nidAudRec(a) { return this._nid('audrec', a && a.id); },

    _huella(v) {
      const s = JSON.stringify(v == null ? '' : v);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(36);
    },

    _veraHuellasDe(cards) {
      const mapa = {};
      const contenido = (c) => { const { updated_at: _sello, ...resto } = c; return resto; };
      (cards || []).forEach((c) => {
        if (!c || !c.type) return;
        mapa[this._nidCard(c)] = this._huella(contenido(c));
        if (!Array.isArray(c.items)) return;
        c.items.forEach((it) => {
          if (!it) return;
          if (c.type === 'audiencias_recomendadas') { if (it.id != null) mapa[this._nidAudRec(it)] = this._huella(it); }
          else if (c.type === 'observacion' && it.observacion) mapa[this._nidObs(it)] = this._huella(it);
        });
      });
      return mapa;
    },

    /* Lo que cambió desde la visita anterior late minuto y medio; la primera visita solo guarda la línea base. */
    _veraMarcarNovedades(body, huellas) {
      (this._veraLatidos || []).forEach((t) => clearTimeout(t));
      this._veraLatidos = [];
      const key = this._veraHuellasKey();
      let previas = null;
      try { previas = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { console.warn('[BrandGrid] huellas:', e?.message); }
      try { localStorage.setItem(key, JSON.stringify(huellas)); } catch (e) { console.warn('[BrandGrid] huellas:', e?.message); }
      if (!previas || typeof previas !== 'object') return;
      const nuevos = Object.keys(huellas).filter((id) => previas[id] !== huellas[id]);
      if (!nuevos.length) return;
      const marcar = (el) => {
        if (!el) return;
        el.classList.remove('is-nuevo');
        void el.offsetWidth;
        el.classList.add('is-nuevo');
        this._veraLatidos.push(setTimeout(() => el.classList.remove('is-nuevo'), LATIDO_MS));
      };
      nuevos.forEach((id) => body.querySelectorAll(`[data-nuevo-id="${CSS.escape(id)}"]`).forEach(marcar));
    },

    /* El marco de una card.v2 sin lectura: su rótulo de v1 y «todavía no» en palabras. */
    _veraShellHtml(tipo, texto) {
      const m = V2[tipo];
      if (!m) return '';
      return `
        <section class="vera-card vera-card--${this._esc(tipo)} vera-card--falta" data-tone="neutral">
          <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${m.icon}" aria-hidden="true"></i>${this._esc(m.label())}</span>
          <div class="vera-card-body">${this._todaviaNo(__('Todavía no'), texto)}</div>
        </section>`;
    },

    async _renderVeraCards(body) {
      const obsHost = body.querySelector('#bgridObservacion');
      const host = body.querySelector('#bgridVera');
      if (!obsHost && !host) return;
      const r = await window.DashboardDatos.lectura(this._orgId, { scope: 'mi_marca', versiones: [2], periodo: this._veraPeriodoActivo() });
      if (!this._sigue('my-brands')) return;
      const reading = r.falta ? null : (r.datos && r.datos.reading);
      this._veraLecturaAt = r.datos ? r.datos.created_at : null;
      const sinLectura = this._faltaTexto(r, __('Aparece cuando Vera vuelva a leer tu marca.'));
      const all = (reading && reading.schema === 'cards.v2' && Array.isArray(reading.cards)) ? reading.cards : [];
      const obs = [], virt = [], desv = [], audRec = [], aud = [], intu = [], rest = [];
      all.forEach((c) => {
        const t = c && c.type;
        if (t === 'observacion') obs.push(c);
        else if (t === 'virtudes') virt.push(c);
        else if (t === 'desventajas') desv.push(c);
        else if (t === 'audiencias_recomendadas') audRec.push(c);
        else if (t === 'audiencia') aud.push(c);
        else if (t === 'intuicion') intu.push(c);
        else rest.push(c);
      });
      const virtItems = virt.map((c, i) => ({ card: c, key: 'pos' + i }));
      const desvItems = desv.map((c, i) => ({ card: c, key: 'neg' + i }));
      const audItems = aud.map((c, i) => ({ card: c, key: 'aud' + i }));
      const restItems = rest.map((c, i) => ({ card: c, key: 'v' + i }));
      const intuItems = intu.map((c, i) => ({ card: c, key: 'intu' + i }));

      // Observaciones (la misma plantilla que Competencia). Sin ninguna: «todavía no» en su sitio.
      if (obsHost) {
        const obsHtml = this._veraObservacionesHtml(obs);
        this._pintar(obsHost, obsHtml || this._todaviaNo(__('Todavía no'), sinLectura));
        const obsCard = body.querySelector('#bgridObsCard');
        if (obsCard) obsCard.setAttribute('data-nuevo-id', this._nid('card', 'observacion'));
        const obsFecha = body.querySelector('#bgridObsFecha');
        if (obsFecha) {
          const f = obsHtml ? this._veraFechaDatos(obs[0]) : null;
          obsFecha.hidden = !f;
          obsFecha.textContent = f ? __('Última actualización {d}', { d: f.rel }) : '';
          if (f) obsFecha.title = __('Última actualización {d}', { d: f.exacta });
        }
      }
      // LA INTUICIÓN ABRE EL TABLERO: primera pieza de la columna izquierda.
      const intuHost = body.querySelector('#bgridIntuicion');
      if (intuHost) {
        const intuHtml = intuItems.map((x) => this._veraCardHtml(x.card, x.key)).join('') || this._veraShellHtml('intuicion', sinLectura);
        this._pintar(intuHost, `<div class="vera-cards">${intuHtml}</div>`);
        this._acentuarIntuicion(intuHost);
      }
      const vdHost = body.querySelector('#bgridVD');
      if (vdHost) {
        this._pintar(vdHost, this._veraDuoHtml(virtItems, desvItems, sinLectura));
        this._acentuarDuoConMarca(vdHost);
      }
      // Audiencia real (mapa + pirámide) abre el bloque; después las recomendadas; después el resto (Algoritmo).
      const audHtml = audItems.map((x) => this._veraCardHtml(x.card, x.key)).join('') || this._veraShellHtml('audiencia', sinLectura);
      const audRecHtml = audRec.map((c) => this._veraAudRecHtml(c)).join('') || this._veraAudRecFaltaHtml(sinLectura);
      const restHtml = restItems.map((x) => this._veraCardHtml(x.card, x.key)).join('')
        + (rest.some((c) => c.type === 'algoritmo') ? '' : this._veraShellHtml('algoritmo', sinLectura));
      if (host) {
        const prodstar = body.querySelector('.bgrid-card--prodstar');
        if (prodstar && host.contains(prodstar)) body.querySelector('.bgrid')?.appendChild(prodstar);
        this._pintar(host, `<div class="vera-cards">${audHtml}</div>${audRecHtml}${restHtml ? `<div class="vera-cards">${restHtml}</div>` : ''}`);
      }
      this._colocarCierreBajoAlgoritmo(body);
      this._bindVeraAudRec(host);
      body.querySelectorAll('[data-panel-marca]').forEach((el) => this._vestirPanelDeMarca(el));
      try { await this._ensureChartJs(); } catch (e) { console.warn('[BrandGrid] Chart.js:', e?.message); }
      this._paintVeraCharts(body, virtItems.concat(desvItems, intuItems, audItems, restItems));
      this._ajustarAltoObservaciones(body);
      // Cards del cerebro (cards.vera4) de Mi Marca, al pie.
      if (typeof this._renderVera4 === 'function') await this._renderVera4(body, 'mi_marca', body.querySelector('#bgridVera4'));
      this._veraMarcarNovedades(body, this._veraHuellasDe(all));
    },

    /* Producto destacado: sin fuente en la base nueva (social.presencia_producto, P4). */
    _paintProductoEstrella(scope) {
      const host = scope.querySelector('#bgridProdStar');
      if (!host) return;
      this._pintar(host, this._todaviaNo(__('Todavía no'), __('Aparece cuando la plataforma mida cuánto nombras cada producto y cómo te responde tu público.')));
    },

    /* Producto destacado cierra el bloque de Vera, a lo ancho, debajo de Algoritmo. */
    _colocarCierreBajoAlgoritmo(body) {
      const algo = body.querySelector('.vera-cards .vera-card--algoritmo');
      if (!algo) return;
      const prodstar = body.querySelector('.bgrid-card--prodstar');
      if (prodstar) algo.parentElement.appendChild(prodstar);
    },

    /* Observaciones crece con su contenido y se topa al alto de la columna del análisis. */
    _ajustarAltoObservaciones(body) {
      const host = body.querySelector('#bgridObservacion');
      const todas = [...body.querySelectorAll('.bgrid > .bgrid-col')];
      const colObs = todas.find((c) => c.contains(host));
      const colAnalisis = todas.find((c) => c !== colObs);
      if (!host || !colObs || !colAnalisis) return;
      const ALTO_MINIMO = 240;
      const aplicar = () => {
        if (!host.isConnected) return;
        host.style.maxHeight = 'none';
        const sinLista = colObs.getBoundingClientRect().height - host.getBoundingClientRect().height;
        const libre = colAnalisis.getBoundingClientRect().height - sinLista;
        if (libre > ALTO_MINIMO) host.style.maxHeight = `${Math.round(libre)}px`;
      };
      aplicar();
      if (this._obsResizeObs) this._obsResizeObs.disconnect();
      if (typeof ResizeObserver === 'function') {
        this._obsResizeObs = new ResizeObserver(() => aplicar());
        this._obsResizeObs.observe(colAnalisis);
      }
      requestAnimationFrame(() => aplicar());
      [600, 2000].forEach((ms) => setTimeout(aplicar, ms));
      colAnalisis.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', aplicar, { once: true }); });
      if (this._obsResizeHandler) window.removeEventListener('resize', this._obsResizeHandler);
      this._obsResizeHandler = () => aplicar();
      this.addEventListener(window, 'resize', this._obsResizeHandler);
    },

    /* Bloques de una card: el JUICIO primero (markdown), la evidencia después. */
    _veraBlocksDe(card) {
      return [
        ...(card && card.markdown ? [{ type: 'markdown', markdown: card.markdown }] : []),
        ...(Array.isArray(card && card.blocks) ? card.blocks : []),
      ];
    },

    /* Fortalezas + Debilidades como PAR hermano. Sin lectura: el par con «todavía no» en cada panel. */
    _veraDuoHtml(virtItems, desvItems, sinLectura) {
      const esc = (s) => this._esc(s);
      const panel = (items, side, label, icon) => {
        const content = items.length ? items.map(({ card, key }) => {
          const blocks = this._veraBlocksDe(card);
          return `
            <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${icon}" aria-hidden="true"></i>${esc(label)}</span>
            ${card.title ? `<h4 class="vera-card-title">${esc(card.title)}</h4>` : ''}
            <div class="vera-card-body">${blocks.map((b, bi) => this._veraBlockHtml(b, key, bi)).join('')}</div>
            ${this._veraFechaHtml(card)}`;
        }).join('') : `
            <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${icon}" aria-hidden="true"></i>${esc(label)}</span>
            <div class="vera-card-body">${this._todaviaNo(__('Todavía no'), sinLectura || __('Aparece cuando Vera vuelva a leer tu marca.'))}</div>`;
        const nid = this._nid('card', side === 'pos' ? 'virtudes' : 'desventajas');
        return `<div class="vera-duo-panel" data-side="${side}" data-nuevo-id="${esc(nid)}">${content}</div>`;
      };
      return `<div class="vera-duo">${panel(virtItems, 'pos', __('Fortalezas'), 'star')}${panel(desvItems, 'neg', __('Debilidades'), 'alert-warning')}</div>`;
    },

    /* El borde del par lo pone la marca, con alfa bajo (una línea, no un marco de color). */
    _acentuarDuoConMarca(host) {
      const duo = host && host.querySelector('.vera-duo');
      if (duo) duo.style.setProperty('--duo-acento', this._rgba(this._coloresMarca()[0], 0.38));
    },

    /* Intuición: su acento es el color sólido de la marca, publicado como triplete r,g,b. */
    _acentuarIntuicion(host) {
      const card = host && host.querySelector('.vera-card--intuicion');
      if (card) card.style.setProperty('--intu-accent', this._rgbDe(this._coloresMarca()[0]).join(', '));
    },

    /* ══ Audiencias recomendadas: fichas sobre el color de marca; la X la descarta (en este navegador). ══ */
    _veraAudRecHtml(card) {
      const items = Array.isArray(card && card.items) ? card.items : [];
      const esc = (s) => this._esc(s);
      const descartadas = this._audRecDescartadas();
      const vivas = items.filter((a) => a && a.id != null && !descartadas.has(String(a.id)));
      if (!vivas.length) return '';
      const priLabel = { alta: __('Alta demanda'), media: __('Demanda media'), baja: __('Demanda baja') };
      const fichas = vivas.map((a) => {
        const chips = (Array.isArray(a.interests) ? a.interests.slice(0, 3) : [])
          .map((t) => `<span class="tend-oc-chip">${esc(String(t))}</span>`).join('');
        const pri = ['alta', 'media', 'baja'].includes(a.priority) ? a.priority : 'media';
        return `
          <article class="cga-item tend-oc" data-audrec-id="${esc(a.id)}" data-nuevo-id="${esc(this._nidAudRec(a))}" data-panel-marca>
            <div class="cga-top">
              <span class="tend-oc-intent tend-oc-intent--${pri}">${esc(priLabel[pri] || priLabel.media)}</span>
              <h4 class="cga-quien">${esc(a.name || '')}</h4>
              ${a.rationale ? `<span class="tend-oc-angle">${esc(a.rationale)}</span>` : ''}
              ${chips ? `<div class="tend-oc-chips">${chips}</div>` : ''}
            </div>
            <div class="cga-foot">
              <span class="cga-hint">${esc(__('el nicho la busca · encaja con tu marca'))}</span>
              <button type="button" class="cga-add tend-oc-no" data-audrec-dismiss
                      title="${esc(__('No me interesa'))}" aria-label="${esc(__('Descartar audiencia'))}">
                <i class="aisc-ico aisc-ico--close" aria-hidden="true"></i>
              </button>
            </div>
          </article>`;
      }).join('');
      return `
        <section class="cgrid-card--aud vera-audrec" data-nuevo-id="${esc(this._nidCard(card))}">
          <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--audience" aria-hidden="true"></i>${esc(__('Audiencias recomendadas'))}</span>
          <p class="bgrid-card-sub">${esc(__('A quién deberías hablarle según lo que Vera aprendió de ti'))}</p>
          <div class="cgrid-aud">${fichas}</div>
          ${this._veraFechaHtml(card)}
        </section>`;
    },

    _veraAudRecFaltaHtml(texto) {
      const esc = (s) => this._esc(s);
      return `
        <section class="cgrid-card--aud vera-audrec vera-audrec--falta">
          <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--audience" aria-hidden="true"></i>${esc(__('Audiencias recomendadas'))}</span>
          <p class="bgrid-card-sub">${esc(__('A quién deberías hablarle según lo que Vera aprendió de ti'))}</p>
          ${this._todaviaNo(__('Todavía no'), texto)}
        </section>`;
    },

    _audRecKey() { return `audrec:dismissed:${this._orgId || 'global'}`; },
    _audRecDescartadas() {
      if (this._audRecSet) return this._audRecSet;
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(this._audRecKey()) || '[]'); } catch (e) { console.warn('[BrandGrid] descartadas:', e?.message); }
      this._audRecSet = new Set(Array.isArray(arr) ? arr.map(String) : []);
      return this._audRecSet;
    },
    _bindVeraAudRec(host) {
      const sec = host && host.querySelector('.vera-audrec');
      if (!sec || sec._audRecBound) return;
      sec._audRecBound = true;
      sec.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-audrec-dismiss]');
        if (!btn) return;
        const ficha = btn.closest('[data-audrec-id]');
        const id = ficha && ficha.dataset.audrecId;
        if (!id) return;
        const set = this._audRecDescartadas();
        set.add(String(id));
        try { localStorage.setItem(this._audRecKey(), JSON.stringify([...set])); } catch (e) { console.warn('[BrandGrid] descartadas:', e?.message); }
        ficha.classList.add('is-adoptada');
        setTimeout(() => {
          ficha.remove();
          if (!sec.querySelector('.cga-item')) sec.remove();
        }, 280);
      });
    },

    /* ══ Observaciones — la MISMA plantilla que Competencia (.cgo-item) ══ */
    _veraObservacionesHtml(cards) {
      const esc = (s) => this._esc(s);
      const SEV = {
        opportunity: { cls: 'is-opp',    label: __('Oportunidad') },
        positive:    { cls: 'is-opp',    label: __('Oportunidad') },
        threat:      { cls: 'is-threat', label: __('Amenaza') },
        critical:    { cls: 'is-threat', label: __('Amenaza') },
        warning:     { cls: 'is-warn',   label: __('Atención') },
        neutral:     { cls: 'is-neu',    label: __('Contexto') },
      };
      const items = [];
      (cards || []).forEach((c) => {
        if (Array.isArray(c && c.items) && c.items.length) c.items.forEach((o) => { if (o && o.observacion) items.push(o); });
        else if (c && (c.markdown || c.title)) items.push({ titulo: c.title, observacion: this._mdAPlano(c.markdown), severidad: c.tone });
      });
      if (!items.length) return '';
      const PRIO = { alta: 0, media: 1, baja: 2 };
      const orden = [...items].sort((a, b) =>
        (PRIO[String(a.prioridad || '').toLowerCase()] ?? 1) - (PRIO[String(b.prioridad || '').toLowerCase()] ?? 1));
      return orden.map((o) => {
        const sev = SEV[String(o.severidad || '').toLowerCase()] || SEV.neutral;
        const prio = String(o.prioridad || '').toLowerCase();
        return `
          <article class="cgo-item ${esc(sev.cls)}" data-nuevo-id="${esc(this._nidObs(o))}">
            <div class="cgo-head">
              ${o.donde ? `<span class="cgo-perfil">${esc(o.donde)}</span>` : ''}
              <span class="cgo-sev">${esc(sev.label)}</span>
              ${prio === 'alta' ? `<span class="cgo-prio">${esc(__('Prioridad alta'))}</span>` : ''}
            </div>
            ${o.titulo ? `<h4 class="cgo-titulo">${esc(o.titulo)}</h4>` : ''}
            <p class="cgo-txt">${esc(o.observacion || '')}</p>
          </article>`;
      }).join('');
    },

    _mdAPlano(md) {
      return String(md || '')
        .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^[>#\-*+\s]+/gm, ' ')
        .replace(/[*_~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    },

    _veraCardHtml(card, key, bare) {
      const META = {
        virtudes:    { label: __('Fortalezas'),  icon: 'star' },
        desventajas: { label: __('Debilidades'), icon: 'alert-warning' },
        audiencia:   { label: __('Audiencias'),  icon: 'audience' },
        algoritmo:   { label: __('Algoritmo'),   icon: 'compass' },
        intuicion:   { label: __('Intuición'),   icon: 'sparkle' },
      };
      const m = META[card && card.type];
      if (!m) return '';
      if (card.type === 'audiencia' && !bare) return this._veraAudienciaHtml(card, key, m);
      const esc = (s) => this._esc(s);
      const blocks = this._veraBlocksDe(card);
      const esActo = card.type === 'algoritmo';
      const inner = blocks.map((b, bi) => this._veraBlockHtml(
        (esActo && b && b.type === 'markdown') ? { ...b, _actos: true } : b, key, bi)).join('');
      const tone = ['positive', 'neutral', 'warning', 'critical'].includes(card.tone) ? card.tone : 'neutral';
      return `
        <section class="vera-card vera-card--${esc(card.type)}${bare ? ' vera-card--bare' : ''}" data-tone="${tone}" data-nuevo-id="${esc(this._nidCard(card))}">
          <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${m.icon}" aria-hidden="true"></i>${esc(m.label)}</span>
          ${card.title ? `<h3 class="vera-card-title">${esc(card.title)}</h3>` : ''}
          <div class="vera-card-body">${inner}</div>
          ${this._veraFechaHtml(card)}
        </section>`;
    },

    _veraTableHtml(block) {
      const esc = (s) => this._esc(s);
      const cols = Array.isArray(block.columns) ? block.columns : [];
      const rows = Array.isArray(block.rows) ? block.rows : [];
      const ttl = block.title ? `<div class="vera-chart-title">${esc(block.title)}</div>` : '';
      const head = cols.length ? `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : '';
      const enumerado = (txt) => {
        const partes = String(txt).split(/\s*[·|]\s*/).map((x) => x.trim()).filter(Boolean);
        if (partes.length < 2) return null;
        return partes.map((x) => this._mdInline(esc(x))).join('<span class="vera-td-sep">·</span>');
      };
      const body = `<tbody>${rows.map((r) => {
        const cells = Array.isArray(r) ? r : (Array.isArray(r.cells) ? r.cells : []);
        return `<tr>${cells.map((cell, i) => {
          const txt = String(cell == null ? '' : cell);
          if (i === 0) {
            const ico = iconoDeRed(txt);
            return `<td class="vera-td-lead">${ico ? `<i class="${ico}" aria-hidden="true"></i>` : ''}${this._mdInline(esc(txt))}</td>`;
          }
          return `<td>${enumerado(txt) || this._mdInline(esc(txt))}</td>`;
        }).join('')}</tr>`;
      }).join('')}</tbody>`;
      return `<div class="vera-table-wrap">${ttl}<table class="vera-table">${head}${body}</table></div>`;
    },

    /* Los párrafos que abren con un rótulo ("El riesgo:", "Qué hacer:") son los tres actos. */
    _veraActosHtml(md) {
      const ACENTOS = [
        { re: /^(el riesgo|riesgo|ojo|cuidado)\b/i, tono: 'riesgo', icon: 'alert' },
        { re: /^(qué hacer|que hacer|acción|accion|siguiente paso|hazlo)\b/i, tono: 'accion', icon: 'compass' },
      ];
      const parrafos = String(md == null ? '' : md).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
      if (parrafos.length < 2) return null;
      return `<div class="vera-actos">${parrafos.map((par, i) => {
        const plano = par.replace(/[*_`#>]/g, '').trim();
        const hit = ACENTOS.find((a) => a.re.test(plano));
        const tono = hit ? hit.tono : (i === 0 ? 'lectura' : 'nota');
        return `<div class="vera-acto" data-tono="${tono}"><div class="vera-md">${this._safeMarkdown(par)}</div></div>`;
      }).join('')}</div>`;
    },

    /* Audiencia: mapa + pirámide a la izquierda, comentario de Vera (sobre el color de marca) a la derecha. */
    _veraAudienciaHtml(card, key, m) {
      const esc = (s) => this._esc(s);
      const blocks = Array.isArray(card.blocks) ? card.blocks : [];
      const isViz = (b) => b && (b.type === 'choropleth' || b.type === 'pyramid');
      const vizHtml = blocks.map((b, bi) => (isViz(b) ? this._veraBlockHtml(b, key, bi) : '')).join('');
      const restHtml = [
        card.markdown ? `<div class="vera-md">${this._safeMarkdown(card.markdown)}</div>` : '',
        ...blocks.map((b, bi) => ((b && !isViz(b)) ? this._veraBlockHtml(b, key, bi) : '')),
      ].join('');
      const tone = ['positive', 'neutral', 'warning', 'critical'].includes(card.tone) ? card.tone : 'neutral';
      return `
        <section class="vera-card vera-card--audiencia" data-tone="${tone}" data-nuevo-id="${esc(this._nidCard(card))}">
          <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${m.icon}" aria-hidden="true"></i>${esc(m.label)}</span>
          ${card.title ? `<h3 class="vera-card-title">${esc(card.title)}</h3>` : ''}
          <div class="vera-aud-grid">
            <div class="vera-aud-viz">${vizHtml}</div>
            ${restHtml ? `<div class="vera-aud-comment vera-card-body" data-panel-marca="1">${restHtml}</div>` : ''}
          </div>
          ${this._veraFechaHtml(card)}
        </section>`;
    },

    _veraBlockHtml(block, cardIdx, blockIdx) {
      const esc = (s) => this._esc(s);
      const t = block && block.type;
      const cid = `veraChart-${cardIdx}-${blockIdx}`;
      const ttl = (block && block.title) ? `<div class="vera-chart-title">${esc(block.title)}</div>` : '';
      if (t === 'markdown') {
        if (block._actos) {
          const actos = this._veraActosHtml(block.markdown);
          if (actos) return actos;
        }
        return `<div class="vera-md">${this._safeMarkdown(block.markdown)}</div>`;
      }
      if (t === 'chart') return `<div class="vera-chart">${ttl}<div class="vera-chart-wrap"><canvas id="${esc(cid)}"></canvas></div></div>`;
      if (t === 'pyramid') return `<div class="vera-chart">${ttl}<div class="vera-chart-wrap vera-chart-wrap--pyramid"><canvas id="${esc(cid)}"></canvas></div></div>`;
      if (t === 'choropleth') return `<div class="vera-chart vera-choropleth">${ttl}<div class="vera-chart-wrap vera-chart-wrap--map"><canvas id="${esc(cid)}"></canvas><div class="vera-geo-fallback" id="${esc(cid)}-fb" hidden></div></div></div>`;
      if (t === 'stat') {
        return `<div class="vera-stat"><span class="vera-stat-value">${esc(block.value != null ? String(block.value) : '')}</span><span class="vera-stat-label">${esc(block.label || '')}</span></div>`;
      }
      if (t === 'table') return this._veraTableHtml(block);
      if (t === 'callout') {
        const tone = ['critical', 'warning', 'positive', 'neutral'].includes(block.tone) ? block.tone : 'neutral';
        const ico = block.icon ? String(block.icon).replace(/[^a-z0-9-]/gi, '') : 'sparkle';
        return `<div class="vera-callout" data-tone="${tone}">
          <i class="aisc-ico aisc-ico--${ico} vera-callout-ico" aria-hidden="true"></i>
          <div class="vera-callout-body">
            ${block.title ? `<p class="vera-callout-title">${esc(block.title)}</p>` : ''}
            ${block.markdown ? `<div class="vera-md">${this._safeMarkdown(block.markdown)}</div>` : ''}
          </div>
        </div>`;
      }
      if (t === 'quote') {
        return `<figure class="vera-quote">
          <blockquote class="vera-quote-text">${esc(block.text || '')}</blockquote>
          ${block.source ? `<figcaption class="vera-quote-source">${esc(block.source)}</figcaption>` : ''}
        </figure>`;
      }
      if (t === 'split') {
        const cols = Array.isArray(block.columns) ? block.columns : [];
        if (!cols.length) return '';
        const inner = cols.map((c) => {
          const side = ['pos', 'neg'].includes(c && c.side) ? c.side : '';
          return `<div class="vera-split-col"${side ? ` data-side="${side}"` : ''}>
            ${c && c.label ? `<div class="vera-split-label">${esc(c.label)}</div>` : ''}
            ${c && c.markdown ? `<div class="vera-md">${this._safeMarkdown(c.markdown)}</div>` : ''}
          </div>`;
        }).join('');
        return `<div class="vera-block-group">${ttl}<div class="vera-split">${inner}</div></div>`;
      }
      return '';
    },

    /* ══ Publicación destacada (propia): la que más interacción movió en el periodo ══ */
    async _paintTopPostPropio(body) {
      const host = body.querySelector('#bgridTopPost');
      if (!host) return;
      const rango = this._gridRangoActual || await this._gridRango();
      const token = `${rango.desde || ''}~${rango.hasta || ''}`;
      if (host.dataset.tpWindow === token) return;
      host.dataset.tpWindow = token;
      const esc = (s) => this._esc(s);
      const r = await window.DashboardDatos.publicacionDestacada(this._orgId, { source: 'own', desde: rango.desde, hasta: rango.hasta });
      if (!this._sigue('my-brands')) return;
      if (r.falta) {
        this._pintar(host, this._todaviaNo(__('Todavía no'), this._faltaTexto(r, __('Necesita las métricas de tus publicaciones.'))));
        return;
      }
      if (!r.datos) {
        this._pintar(host, `<div class="cgrid-empty">${esc(__('Sin publicaciones propias con interacción en este periodo.'))}</div>`);
        return;
      }
      const win = r.datos.post;
      const comments = r.datos.comentarios || [];
      const net = String(win.network || '').toLowerCase();
      const handle = String(win.profile_handle || '').replace(/^@+/, '');
      const url = typeof this._cgridPostUrl === 'function' ? this._cgridPostUrl(net, win.post_id, handle, win.permalink) : (win.permalink || null);
      const copy = String(win.content || '').trim();
      const C = (n) => this._compactNum(n);
      const SENT = { POS: 'pos', NEG: 'neg', NEU: 'neu' };
      const topComments = comments
        .map((c) => ({ ...c, _l: Number(c.metrics && c.metrics.likes) || 0 }))
        .sort((a, b) => b._l - a._l)
        .slice(0, 4);
      const commentsHtml = topComments.length ? `
        <div class="cgrid-comments">
          <div class="cgrid-comments-title">${esc(__('Lo que dijo la gente'))} <span class="cgrid-comments-n">${esc(__('{n} comentarios leídos', { n: comments.length }))}</span></div>
          ${topComments.map((c) => `
            <div class="cgrid-comment${c.sentiment ? ` is-${esc(SENT[String(c.sentiment).toUpperCase()] || 'neu')}` : ''}">
              <span class="cgrid-comment-who">@${esc(String(c.author_handle || '').replace(/^@+/, ''))}</span>
              <span class="cgrid-comment-txt">${esc(String(c.content || '').slice(0, 180))}</span>
              ${c._l > 0 ? `<span class="cgrid-comment-likes">♥ ${esc(C(c._l))}</span>` : ''}
            </div>`).join('')}
        </div>` : '';
      const media = typeof this._cgridMediaHtml === 'function'
        ? this._cgridMediaHtml(win.media_assets, { network: net, postId: win.post_id, postUrl: url })
        : '';
      const copyHtml = copy ? `
        <details class="cgrid-post-copy-box">
          <summary class="cgrid-post-copy-sum">
            <span class="cgrid-post-copy-peek">${esc(copy.replace(/\s+/g, ' ').slice(0, 90))}${copy.length > 90 ? '…' : ''}</span>
            <i class="aisc-ico aisc-ico--chevron-down" aria-hidden="true"></i>
          </summary>
          <p class="cgrid-post-copy">${esc(copy)}</p>
        </details>` : '';
      // «¿Por qué funcionó?»: sin columna en la base nueva (contrato §4.6) — no se inventa.
      this._pintar(host, `<article class="cgrid-post-card">${media}${copyHtml}${commentsHtml}</article>`);
      this._bindCgridMediaFallback?.(host);
      this._bindCgridCarrusel?.(host);
      this._bindCgridEmbeds?.(host);
    },

    _safeMarkdown(md) {
      let s = String(md == null ? '' : md);
      s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      const [r, g, bl] = this._rgbDe(this._coloresMarca()[0]);
      const palette = [1, 0.66, 0.42, 0.27, 0.17].map((a) => `rgba(${r},${g},${bl},${a})`);
      const T = this._tintaCharts();
      const TT = T.tooltip;
      items.forEach(({ card, key }) => {
        (Array.isArray(card.blocks) ? card.blocks : []).forEach((b, bi) => {
          if (!b) return;
          // El markdown de la card va antes de los blocks en el HTML, pero el id del canvas usa el índice
          // en card.blocks (bug de v1: con markdown + chart, el chart salía en blanco). Se busca por ese id.
          const idx = card.markdown && card.type !== 'audiencia' ? bi + 1 : bi;
          const canvas = scope.querySelector(`#${CSS.escape(`veraChart-${key}-${idx}`)}`) || scope.querySelector(`#${CSS.escape(`veraChart-${key}-${bi}`)}`);
          if (!canvas) return;
          if (b.type === 'pyramid') { this._paintPyramid(canvas, b); return; }
          if (b.type === 'choropleth') { this._paintChoropleth(canvas, b, canvas.parentElement.querySelector('.vera-geo-fallback')); return; }
          if (b.type !== 'chart') return;
          const enPanel = canvas.closest('[data-panel-marca][data-fondo]');
          const tinta = enPanel ? (enPanel.dataset.fondo === 'claro' ? [17, 14, 10] : [255, 255, 255]) : null;
          const kind = ['bar', 'line', 'donut', 'area'].includes(b.kind) ? b.kind : 'bar';
          const labels = Array.isArray(b.labels) ? b.labels : [];
          const series = Array.isArray(b.series) ? b.series : [];
          const yFmt = (v) => (b.format === 'percent' ? v + '%' : v);
          const [cr, cg, cb] = tinta || [r, g, bl];
          const paleta = tinta ? [0.92, 0.6, 0.38, 0.24, 0.15].map((a) => `rgba(${cr},${cg},${cb},${a})`) : palette;
          const tick = tinta ? `rgba(${cr},${cg},${cb},0.62)` : T.tick;
          const grid = tinta ? `rgba(${cr},${cg},${cb},0.14)` : T.grid;
          let cfg;
          if (kind === 'donut') {
            const values = (series[0] && Array.isArray(series[0].values)) ? series[0].values : [];
            cfg = { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => paleta[i % paleta.length]), borderColor: 'rgba(0,0,0,0.25)', borderWidth: 2 }] },
              options: { responsive: true, maintainAspectRatio: false, cutout: '62%',
                plugins: { legend: { position: 'right', labels: { color: tick, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } }, tooltip: TT } } };
          } else {
            const isLine = (kind === 'line' || kind === 'area');
            const datasets = series.map((sr, i) => ({
              label: sr.name || '', data: Array.isArray(sr.values) ? sr.values : [],
              backgroundColor: isLine ? `rgba(${cr},${cg},${cb},0.14)` : paleta[i % paleta.length],
              borderColor: paleta[i % paleta.length], borderWidth: isLine ? 2 : 0,
              fill: kind === 'area', tension: 0.35, borderRadius: isLine ? 0 : 6, maxBarThickness: 34, pointRadius: 0,
            }));
            cfg = { type: isLine ? 'line' : 'bar', data: { labels, datasets }, options: {
              responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
              plugins: { legend: { display: series.length > 1, position: 'bottom', labels: { color: tick, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } }, tooltip: TT },
              scales: { x: { grid: { display: false }, ticks: { color: tick, font: { size: 10 }, maxRotation: 0, autoSkip: true } },
                y: { grid: { color: grid }, border: { display: false }, beginAtZero: true, ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 5, callback: yFmt } } } } };
          }
          this._reg(new Chart(canvas, cfg));
        });
      });
    },

    /* Pirámide de población: hombres a la izquierda, mujeres a la derecha. */
    _paintPyramid(canvas, block) {
      const Chart = window.Chart;
      if (!Chart || !canvas) return;
      const acc = this._coloresMarca()[0];
      const groups = Array.isArray(block.groups) ? block.groups : [];
      const male = (Array.isArray(block.male) ? block.male : []).map((v) => -Math.abs(Number(v) || 0));
      const female = (Array.isArray(block.female) ? block.female : []).map((v) => Math.abs(Number(v) || 0));
      const T = this._tintaCharts();
      this._reg(new Chart(canvas, {
        type: 'bar',
        data: { labels: groups, datasets: [
          { label: __('Hombres'), data: male, backgroundColor: this._rgba(acc, 0.42), borderRadius: 4, maxBarThickness: 15 },
          { label: __('Mujeres'), data: female, backgroundColor: this._rgba(acc, 0.95), borderRadius: 4, maxBarThickness: 15 },
        ] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: T.tick, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
            tooltip: { ...T.tooltip, callbacks: { label: (c) => `${c.dataset.label}: ${Math.abs(c.raw)}%` } },
          },
          scales: {
            x: { grid: { color: T.grid }, border: { display: false }, ticks: { color: T.tick, font: { size: 9 }, callback: (v) => Math.abs(v) + '%' } },
            y: { grid: { display: false }, border: { display: false }, ticks: { color: T.tick, font: { size: 11 } } },
          },
        },
      }));
    },

    /* Carga perezosa de chartjs-chart-geo + topojson del mundo (una vez). */
    async _ensureGeoChart() {
      if (!window.ChartGeo) {
        await this.loadScript('https://cdn.jsdelivr.net/npm/chartjs-chart-geo@4.3.4/build/index.umd.min.js', 'ChartGeo', 9000);
        try { const G = window.ChartGeo; window.Chart.register(G.ChoroplethController, G.GeoFeature, G.ColorScale, G.ProjectionScale); } catch (e) { console.warn('[BrandGrid] geo:', e?.message); }
      }
      if (!this._geoTopo) {
        this._geoTopo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then((r) => r.json());
      }
    },

    _geoNumPorCodigo(code) {
      if (!BrandGridGeo.mapa) {
        BrandGridGeo.mapa = {};
        BrandGridGeo.tabla.split(' ').forEach((t) => {
          const [codigos, num] = t.split(':');
          codigos.split('/').forEach((c) => { BrandGridGeo.mapa[c] = num; });
        });
      }
      const c = String(code == null ? '' : code).trim().toUpperCase();
      if (!c) return null;
      if (/^\d+$/.test(c)) return String(Number(c)).padStart(3, '0');
      return BrandGridGeo.mapa[c] || null;
    },

    /* Traduce el bloque a lo que necesita el mapa (fracciones o porcentajes, ISO-2 o ISO-3). */
    _geoDatos(block) {
      const filas = Array.isArray(block && block.data) ? block.data : [];
      const crudos = filas.map((d) => Number(d && d.value) || 0);
      const maxCrudo = Math.max(0, ...crudos);
      const aPct = (v) => (maxCrudo > 0 && maxCrudo <= 1 ? v * 100 : v);
      const valPorNum = {}, nombrePorNum = {}, sinMapear = [];
      filas.forEach((d) => {
        const num = this._geoNumPorCodigo(d && d.code);
        if (!num) { sinMapear.push((d && d.code) || '?'); return; }
        valPorNum[num] = aPct(Number(d.value) || 0);
        nombrePorNum[num] = (d && d.name) || (d && d.code) || '';
      });
      const pcts = Object.values(valPorNum);
      return { valPorNum, nombrePorNum, sinMapear, maxPct: pcts.length ? Math.max(...pcts) : 0, mapeados: pcts.length };
    },

    async _paintChoropleth(canvas, block, fbEl) {
      try {
        await this._ensureGeoChart();
        const G = window.ChartGeo, Chart = window.Chart;
        if (!G || !this._geoTopo || !G.topojson) throw new Error('geo-unavailable');
        const topo = this._geoTopo;
        const features = G.topojson.feature(topo, topo.objects.countries).features;
        const { valPorNum, nombrePorNum, sinMapear, maxPct, mapeados } = this._geoDatos(block);
        if (!mapeados) throw new Error('sin-paises-mapeados');
        if (sinMapear.length) console.warn('[BrandGrid] choropleth: códigos sin mapear ->', sinMapear.join(', '));
        const [r, g, bl] = this._rgbDe(this._coloresMarca()[0]);
        const fondo = this._tok('--white-5');
        const data = features.map((f) => {
          const num = String(f.id).padStart(3, '0');
          return { feature: f, value: valPorNum[num] != null ? valPorNum[num] : 0 };
        });
        this._reg(new Chart(canvas, {
          type: 'choropleth',
          data: { labels: features.map((f) => f.properties && f.properties.name), datasets: [{ label: '', outline: features, data, borderColor: this._tok('--white-6'), borderWidth: 0.4 }] },
          options: {
            responsive: true, maintainAspectRatio: false, showOutline: true, showGraticule: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                filter: (c) => Number(c.raw && c.raw.value) > 0,
                callbacks: {
                  label: (c) => {
                    const num = String(c.raw.feature.id).padStart(3, '0');
                    const nom = nombrePorNum[num] || (c.raw.feature.properties && c.raw.feature.properties.name) || '';
                    return `${nom}: ${Math.round(Number(c.raw.value) * 10) / 10}%`;
                  },
                },
              },
            },
            scales: {
              projection: { axis: 'x', projection: 'equalEarth' },
              color: {
                axis: 'x', display: false, min: 0, max: maxPct || 1,
                interpolate: (v) => {
                  const t = Math.max(0, Math.min(1, Number(v) || 0));
                  if (t <= 0) return fondo;
                  return `rgba(${r},${g},${bl},${(0.18 + 0.80 * t).toFixed(3)})`;
                },
              },
            },
          },
        }));
        if (canvas) canvas.hidden = false;
        if (fbEl) fbEl.hidden = true;
      } catch (e) {
        // Respaldo: barras por país (nunca queda roto).
        console.warn('[BrandGrid] mapa:', e?.message);
        if (canvas) canvas.hidden = true;
        if (fbEl) { fbEl.hidden = false; this._pintar(fbEl, this._geoBarsHtml(block)); }
      }
    },

    _geoBarsHtml(block) {
      const rows = (Array.isArray(block.data) ? block.data : []).slice().sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
      if (!rows.length) return '';
      const crudos = rows.map((r) => Number(r.value) || 0);
      const maxCrudo = Math.max(0, ...crudos);
      const aPct = (v) => (maxCrudo > 0 && maxCrudo <= 1 ? v * 100 : v);
      const max = Math.max(1, ...crudos.map(aPct));
      return `<div class="vera-geo-bars">${rows.map((r) => {
        const pct = aPct(Number(r.value) || 0);
        return `
        <div class="vera-geo-row">
          <span class="vera-geo-name">${this._esc(r.name || r.code || '')}</span>
          <div class="vera-geo-track"><div class="vera-geo-fill" data-var="--lleno-f:${(pct / max).toFixed(3)}"></div></div>
          <span class="vera-geo-val">${Math.round(pct * 10) / 10}%</span>
        </div>`;
      }).join('')}</div>`;
    },

    /* Tier de salud (misma lógica que Campañas). El color lo pone el CSS por data-tier. */
    _healthTier(score) {
      const s = Number(score) || 0;
      if (s >= 85) return { tier: 'exc', label: __('Excelente') };
      if (s >= 70) return { tier: 'buena', label: __('Buena') };
      if (s >= 40) return { tier: 'regular', label: __('Regular') };
      return { tier: 'baja', label: __('Baja') };
    },

    /* Arco de salud de marca. Sin fórmula en la base nueva (social.salud_marca, P4): «todavía no». */
    _paintSaludArc(body, data) {
      const host = body.querySelector('#bgridSaludArc');
      if (!host) return;
      const btn = body.querySelector('[data-salud-details]');
      const h = data.health || {};
      const score = (h.score == null) ? null : Math.round(Number(h.score));
      if (btn) btn.hidden = score == null || !Array.isArray(h.channels) || !h.channels.length;
      if (score == null) {
        this._pintar(host, `<div class="bgrid-arc-empty">${this._todaviaNo(__('Salud de tu marca: todavía no'), __('Aparece cuando esté lista la medición de la salud de tu marca por canal.'))}</div>`);
        return;
      }
      const t = this._healthTier(score);
      const pct = Math.max(0, Math.min(100, score));
      const R = 80, LEN = Math.PI * R;
      const dash = LEN * pct / 100;
      this._pintar(host, `
        <div class="bgrid-arc" data-tier="${t.tier}">
          <svg class="bgrid-arc-svg" viewBox="0 0 200 118" role="img" aria-label="${this._esc(__('Salud'))} ${score}/100">
            <path class="bgrid-arc-track" d="M 18 98 A 80 80 0 0 1 182 98" fill="none" stroke-width="15" stroke-linecap="round"/>
            <path class="bgrid-arc-val" d="M 18 98 A 80 80 0 0 1 182 98" fill="none" stroke-width="15" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${LEN.toFixed(1)}"/>
          </svg>
          <div class="bgrid-arc-center">
            <span class="bgrid-arc-score">${score}<span class="bgrid-arc-max">/100</span></span>
            <span class="bgrid-arc-verdict">${this._esc(t.label)}</span>
          </div>
        </div>`);
    },

    /* Desglose de salud por canal + métrica (modal de la plataforma). */
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
            const segs = [...Array(28)].map((_, i) => `<i class="salud-seg${i < on ? ' is-on' : ''}"></i>`).join('');
            return `
            <div class="salud-metric">
              <div class="salud-metric-top"><span>${esc(m.label)}</span><span class="salud-metric-pct">${clamp(m.score)}%</span></div>
              <div class="salud-seg-bar" data-tier="${this._healthTier(m.score).tier}">${segs}</div>
            </div>`;
          }).join('')}
        </div>`).join('');
      this._modal({ titulo: __('Salud por canal'), html: `<div class="salud-modal-body">${chans}</div>`, clase: 'salud-capa' });
    },

    /* Pie de Tráfico: publicaciones del periodo y hace cuánto fue la última. */
    _paintGridStatus(body, data) {
      const foot = body.querySelector('#bgridActivityFoot');
      if (!foot) return;
      if (!data.activity) { this._pintar(foot, ''); return; }
      const total = Number(data.activity.total || 0);
      const days = data.activity.days_since;
      const last = (days == null) ? __('Sin publicaciones recientes')
        : (days <= 0 ? __('Publicaste hoy') : __('Hace {n} días', { n: Math.round(days) }));
      this._pintar(foot, `<span>${this._esc(__('{n} publicaciones', { n: total }))}</span><span class="bgrid-foot-sep">·</span><span>${this._esc(last)}</span>`);
    },

    /* Compatibilidad con los mixins portados de v1 (CompGrid, Tendencias): el acento de marca por token. */
    _gridBrandHexes() { return this._coloresMarca(); },
    _hexToRgb(color) { return this._rgbDe(color); },

    /* Luminancia relativa (WCAG): sobre un color de marca claro va tinta oscura. */
    _esColorClaro(color) {
      const [r, g, b] = this._rgbDe(color);
      const lin = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)) > 0.42;
    },

    /* Pinta un panel con el color de la marca y deja resuelto el juego de tintas en variables. */
    _vestirPanelDeMarca(el, colorOverride) {
      if (!el) return;
      const accent = colorOverride || this._coloresMarca()[0];
      const claro = this._esColorClaro(accent);
      const tinta = claro ? '17, 14, 10' : '255, 255, 255';
      el.dataset.fondo = claro ? 'claro' : 'oscuro';
      el.style.setProperty('--panel-bg', accent);
      el.style.setProperty('--panel-fg', `rgb(${tinta})`);
      el.style.setProperty('--panel-fg-soft', `rgba(${tinta}, 0.72)`);
      el.style.setProperty('--panel-fg-faint', `rgba(${tinta}, 0.5)`);
      el.style.setProperty('--panel-linea', `rgba(${tinta}, 0.16)`);
    },

    /* Chart 1: barras APILADAS por red (Tráfico). */
    _paintActivityChart(body, data) {
      const Chart = window.Chart;
      const canvas = body.querySelector('#bgridActivityChart');
      const empty = body.querySelector('#bgridActivityEmpty');
      if (this._gridFalta(body, 'Activity', data.falta && data.falta.falta ? data.falta : null, __('Necesita la actividad diaria de tus publicaciones.'))) return;
      const series = Array.isArray(data.activity?.series) ? data.activity.series : [];
      if (!Chart || !canvas) return;
      if (!series.length) { canvas.hidden = true; if (empty) empty.hidden = false; return; }
      canvas.hidden = false; if (empty) empty.hidden = true;
      const totals = {};
      series.forEach((b) => Object.entries(b.networks || {}).forEach(([n, c]) => { totals[n] = (totals[n] || 0) + Number(c || 0); }));
      const nets = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
      const accent = this._coloresMarca()[0];
      const alphas = [1, 0.72, 0.5, 0.34, 0.22, 0.15];
      const labels = series.map((b) => b.label);
      const datasets = nets.map((n, idx) => ({
        label: NET_LABEL[n] || this._capitalize(n),
        data: series.map((b) => Number(b.networks?.[n] || 0)),
        backgroundColor: this._rgba(accent, alphas[idx] != null ? alphas[idx] : 0.12),
        // Solo el segmento de ARRIBA del stack lleva las esquinas superiores redondeadas.
        borderRadius: (ctx) => {
          const val = Number(ctx.raw != null ? ctx.raw : (ctx.dataset.data[ctx.dataIndex] || 0));
          if (val <= 0) return 0;
          const ch = ctx.chart;
          let topIdx = -1;
          for (let d = 0; d < ch.data.datasets.length; d++) {
            if (!ch.isDatasetVisible(d)) continue;
            if (Number(ch.data.datasets[d].data[ctx.dataIndex] || 0) > 0) topIdx = d;
          }
          return ctx.datasetIndex === topIdx ? { topLeft: 7, topRight: 7, bottomLeft: 0, bottomRight: 0 } : 0;
        },
        borderSkipped: false,
        maxBarThickness: 30,
        categoryPercentage: 0.6,
        barPercentage: 0.92,
        stack: 'posts',
      }));
      const T = this._tintaCharts();
      this._reg(new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { color: T.tick, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
            tooltip: T.tooltip,
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: T.tick, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { stacked: true, grid: { color: T.grid }, border: { display: false }, beginAtZero: true, ticks: { color: T.tick, font: { size: 10 }, precision: 0, maxTicksLimit: 5 } },
          },
        },
      }));
    },

    /* Chart 2: Interacciones — barras flotantes centradas (latido), escala logarítmica.
       Clic en una barra → las publicaciones de ese periodo. */
    _paintLatidosChart(body, data) {
      const Chart = window.Chart;
      const canvas = body.querySelector('#bgridLatidosChart');
      const empty = body.querySelector('#bgridLatidosEmpty');
      if (this._gridFalta(body, 'Latidos', data.falta && data.falta.falta ? data.falta : null, __('Necesita la actividad diaria de tus publicaciones.'))) return;
      if (!Chart || !canvas) return;
      const byBucket = new Map();
      (data.impact || []).forEach((row) => {
        const key = row.period_start || row.period_label;
        const prev = byBucket.get(key) || { label: row.period_label, v: 0, start: row.period_start, end: row.period_end };
        prev.v += Number(row.total_engagement || 0);
        byBucket.set(key, prev);
      });
      const buckets = [...byBucket.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([, v]) => v);
      if (!buckets.length) { canvas.hidden = true; if (empty) empty.hidden = false; return; }
      canvas.hidden = false; if (empty) empty.hidden = true;
      const [r, g, bl] = this._rgbDe(this._coloresMarca()[0]);
      const max = Math.max(1, ...buckets.map((b) => b.v));
      const norm = (v) => Math.log((v || 0) + 1) / Math.log(max + 1);
      const floatData = buckets.map((b) => {
        const half = Math.max(0.06, 0.46 * norm(b.v));
        return [0.5 - half, 0.5 + half];
      });
      // Latido bajo = gris, latido alto = color de marca; se interpola por intensidad.
      const colors = buckets.map((b) => {
        const t = norm(b.v);
        const mix = (from, to) => Math.round(from + (to - from) * t);
        const a = (0.45 + 0.55 * t).toFixed(3);
        return `rgba(${mix(145, r)},${mix(145, g)},${mix(150, bl)},${a})`;
      });
      const T = this._tintaCharts();
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
            tooltip: { ...T.tooltip, callbacks: { label: (c) => `${__('Interacciones')}: ${Math.round(buckets[c.dataIndex].v).toLocaleString()}` } },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: T.tick, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
            y: { min: 0, max: 1, display: false, grid: { display: false }, border: { display: false } },
          },
        },
      }));
    },

    /* Publicaciones del periodo tocado, por interacciones (la primera = la que más produjo). */
    async _openInteraccionesDay(bucket) {
      if (!bucket) return;
      const esc = (s) => this._esc(s);
      const capa = this._modal({ titulo: `${__('Interacciones')} · ${bucket.label || ''}`, html: `<div class="inter-empty">${esc(__('Cargando…'))}</div>`, clase: 'inter-capa' });
      if (!capa) return;
      const hasta = bucket.end ? menosUnDia(bucket.end) : bucket.start;
      const r = await window.DashboardDatos.publicaciones(this._orgId, { source: 'own', desde: bucket.start, hasta, limite: 50 });
      const rows = r.falta ? [] : (r.datos || []);
      const fmtNet = (n) => NET_LABEL[String(n || '').toLowerCase()] || this._capitalize(n || '—');
      const html = r.falta
        ? this._todaviaNo(__('Todavía no'), this._faltaTexto(r, __('Necesita las métricas de tus publicaciones.')))
        : rows.length
          ? `<div class="inter-list">${rows.map((p, i) => `
            <div class="inter-post${i === 0 ? ' inter-post--top' : ''}">
              <div class="inter-post-head">
                <span class="inter-post-net">${esc(fmtNet(p.network))}</span>
                ${i === 0 ? `<span class="badge badge--sm inter-post-badge">${esc(__('Más interacciones'))}</span>` : ''}
                <span class="inter-post-eng">${Number(p.engagement_total || 0).toLocaleString()}</span>
              </div>
              ${p.content ? `<div class="inter-post-snippet">${esc(String(p.content).slice(0, 160))}</div>` : ''}
            </div>`).join('')}</div>`
          : `<div class="inter-empty">${esc(__('Sin publicaciones ese periodo'))}</div>`;
      this._pintar(capa.cuerpo, html);
    },
  });
})();
