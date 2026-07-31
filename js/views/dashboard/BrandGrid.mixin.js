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

  /* Países del mapa de audiencia: "ISO2/ISO3:id-numérico-del-topojson".
     Los dos códigos en la MISMA entrada para que no puedan divergir — el fallo
     que dejó el mundo entero encendido fue tener solo los de tres letras
     mientras Vera mandaba los de dos. Cubre América entera, Europa occidental y
     los mercados grandes; un país fuera de la tabla se avisa por consola y no
     se pinta, en vez de contaminar la escala. */
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

  // Cuánto late lo que Vera acaba de actualizar. Minuto y medio: el tablero se
  // lee por partes y con calma, y a los 30s la señal se apagaba antes de que la
  // vista llegara a la card de abajo. El apagado lo hace el JS, no el CSS.
  const LATIDO_MS = 90000;

  // Icono de la red (Font Awesome, ya cargado). La plataforma se reconoce por su
  // marca, no leyendo una palabra en gris.
  const PLATFORM_ICON = {
    tiktok:    'fab fa-tiktok',
    instagram: 'fab fa-instagram',
    facebook:  'fab fa-facebook',
    youtube:   'fab fa-youtube',
    x:         'fab fa-x-twitter',
    twitter:   'fab fa-x-twitter',
    linkedin:  'fab fa-linkedin-in',
    ads:       'fas fa-bullseye',
    meta:      'fab fa-meta',
    google:    'fab fa-google',
  };
  const iconoDeRed = (txt) => {
    const t = String(txt || '').toLowerCase();
    const k = Object.keys(PLATFORM_ICON).find((x) => t.includes(x));
    return k ? PLATFORM_ICON[k] : null;
  };

  // Etiqueta legible por red.
  const NET_LABEL = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    x: 'X', twitter: 'X', youtube: 'YouTube', linkedin: 'LinkedIn',
  };

  Object.assign(DashboardView.prototype, {

    /* ── Entry point del grid de Mi Marca ── */
    async _renderBrandGrid(body) {
      if (!body) return true;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return true; }
      if (this._gridWindow == null) this._gridWindow = 'month';
      this._gridBody = body;   // lo necesita el onChange del picker de fechas

      // Shell una sola vez (persistente entre refresh); los charts se repintan.
      if (!body.querySelector('.bgrid')) {
        body.innerHTML = this._buildBrandGridShell();
        this._bindBrandGrid(body);
        // El picker necesita engancharse al DOM ya insertado (su dropdown se
        // portalea a body y se ancla al trigger por getBoundingClientRect).
        this._gridPicker()?.mount(body.querySelector('.bgrid-seg'));
      }
      await this._gridLoadAndPaint(body);
      return true;
    },

    /* El DateRangePicker de la plataforma, reusado como quinto botón del filtro
       de Tráfico. Se crea UNA vez y se conserva entre repintados: el shell solo
       se construye la primera vez, pero la instancia guarda el rango elegido. */
    _gridPicker() {
      if (!this._gridDP && typeof window.DateRangePicker === 'function') {
        const r = this._gridCustomRange || {};
        this._gridDP = new window.DateRangePicker({
          from: r.from || null,
          to: r.to || null,
          // OJO: el componente hace `opts.label || __('Fecha')` — una cadena
          // vacía es falsy y pintaba "Fecha". Se manda un espacio y el CSS lo
          // oculta: aquí el filtro es un pill más, sin etiqueta encima.
          label: ' ',
          allLabel: __('Personalizado'),
          onChange: ({ from, to }) => {
            if (!from && !to) {           // "Limpiar" vuelve al preset por defecto
              this._gridWindow = 'month';
              this._gridCustomRange = null;
            } else {
              this._gridWindow = 'custom';
              this._gridCustomRange = { from, to };
            }
            const body = this._gridBody;
            this._gridSyncSeg(body || document);
            if (body) this._gridLoadAndPaint(body);
          },
        });
      }
      return this._gridDP;
    },

    /** Deja el pill activo acorde a la ventana vigente (presets y personalizado). */
    _gridSyncSeg(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('.bgrid-seg-btn').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.window === this._gridWindow);
      });
      const filtro = root.querySelector('.bgrid-seg [data-drp]');
      if (filtro) filtro.classList.toggle('is-active', this._gridWindow === 'custom');
    },

    _buildBrandGridShell() {
      const seg = WINDOWS.map((w) => `
        <button type="button" class="bgrid-seg-btn${w.k === this._gridWindow ? ' is-active' : ''}" data-window="${w.k}" role="tab">${this._esc(w.label())}</button>`).join('')
        + (this._gridPicker() ? this._gridPicker().html() : '');
      return `
        <div class="bgrid">
          <div class="bgrid-col">
            <!-- LA INTUICIÓN ABRE EL TABLERO (2026-07-31). Arriba del todo en la
                 columna izquierda, ENCIMA de Interacciones: primero lo que Vera
                 ve y nadie más puede decir, después las cifras que lo sostienen.
                 Es la misma decisión que en los otros tres tabs — la Intuición es
                 lo primero de cada tablero, no un cierre.
                 Va sin superficie ni bordes a propósito: no es una card, es la voz
                 de Vera sobre el fondo del tablero. Ver css .vera-card--intuicion.
                 VIVE EN ESTA COLUMNA, no como fila full-width: si fuera fila, la
                 columna derecha (Tráfico) empezaría más abajo y quedaría media
                 página muerta arriba. -->
            <div class="bgrid-intuicion" id="bgridIntuicion"></div>
            <section class="bgrid-card glass-black bgrid-card--latidos">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${this._esc(__('Interacciones'))}</span>
              </header>
              <p class="bgrid-card-sub">${this._esc(__('Cuántas interacciones producen tus redes por periodo · toca una barra para ver ese día'))}</p>
              <div class="bgrid-chart-wrap bgrid-chart-wrap--latidos"><canvas id="bgridLatidosChart"></canvas><div class="bgrid-empty" id="bgridLatidosEmpty" hidden>${this._esc(__('Sin señal de impacto en este periodo'))}</div></div>
            </section>
            <div class="bgrid-vd" id="bgridVD"></div>
            <div class="bgrid-vera" id="bgridVera"></div>
          </div>
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
            <!-- Misma pieza que en Competencia (clases .cgrid-post-*), pero sobre
                 tus propias publicaciones: la tuya que mas movio en el periodo.
                 Va ARRIBA de Campañas y Observaciones: es la evidencia concreta
                 de lo que la marca hizo, y se lee antes que la pauta y que la
                 lectura de Vera sobre ella. El preview es vertical y encaja en
                 el ancho de 480px de esta columna. -->
            <section class="bgrid-card bgrid-card--toppost">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${this._esc(__('Publicación destacada'))}</span>
              </header>
              <div class="cgrid-post" id="bgridTopPost"><div class="cgrid-load">${this._esc(__('Buscando la publicación…'))}</div></div>
            </section>
            <section class="bgrid-card bgrid-card--campaigns" id="bgridCampaignsCard" hidden>
            <header class="bgrid-card-head">
              <span class="bgrid-card-title bgrid-card-title--dark"><i class="aisc-ico aisc-ico--campaign" aria-hidden="true"></i>${this._esc(__('Campañas'))}</span>
            </header>
            <div class="bgrid-campaigns" id="bgridCampaigns"></div>
            </section>
            <!-- Observaciones: MISMA plantilla que Competencia (.cgrid-card--obs /
               .cgrid-obs / .cgo-item), no un volcado de bloques. Cierra la
               columna: primero el pulso, la pieza y la pauta; después la lectura
               de Vera sobre lo que la marca está haciendo. -->
            <section class="bgrid-card cgrid-card--obs" id="bgridObsCard" hidden>
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--eye" aria-hidden="true"></i>${this._esc(__('Observaciones'))}</span>
              ${this._veraRecheckBtn('observacion', __('Volver a consultar Observaciones'))}
            </header>
            <p class="bgrid-card-sub">${this._esc(__('Lo más destacado de tu marca en este periodo'))}</p>
            <div class="cgrid-obs" id="bgridObservacion"></div>
            <!-- El pie va FUERA de .cgrid-obs: esa lista lleva scroll y la hora
                 se iría con ella. -->
            <span class="vera-card-fecha" id="bgridObsFecha" hidden></span>
            </section>
          </div>
          <!-- Producto destacado cierra el bloque de Vera: se reubica al final de
               .vera-cards, debajo de Algoritmo. Publicacion destacada ya no lo
               acompana — se mudo a la columna de Tráfico. -->
          <section class="bgrid-card bgrid-card--prodstar">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--star" aria-hidden="true"></i>${this._esc(__('Producto destacado'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('Cuál producto empujas más y cómo te responde'))}</p>
            <div class="vera-prodstar" id="bgridProdStar" data-prodstar="1">
              <div class="vera-prodstar-load">${this._esc(__('Cargando productos…'))}</div>
            </div>
          </section>
          <!-- Cards del cerebro de Vera (cards.vera4) que viven en Mi Marca:
               Autopsia, Victorias, ¿Lo causé yo?, la plata, la latencia… Banda
               full-width al pie; :empty se colapsa, así que mientras Vera no las
               escriba el tab queda exactamente como está hoy. -->
          <div class="bgrid-v4 vera4" id="bgridVera4"></div>
        </div>`;
    },

    _bindBrandGrid(body) {
      if (body.dataset.bgridBound === '1') return;
      body.dataset.bgridBound = '1';
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-salud-details]')) { this._openSaludDetails(this._gridHealth); return; }
        const re = e.target.closest('[data-vera-recheck]');
        if (re) { this._veraVolverAConsultar(re); return; }
        const btn = e.target.closest('[data-window]');
        if (!btn) return;
        const k = btn.dataset.window;
        if (!k || k === this._gridWindow) return;
        this._gridWindow = k;
        this._gridCustomRange = null;   // elegir un preset descarta el rango a mano
        this._gridSyncSeg(body);
        this._gridLoadAndPaint(body);
      });
    },

    /* El humano le pide a Vera que vuelva a mirar ESTA card.
       OJO: la lectura se regenera ENTERA — el contrato cards.v2 exige las cinco
       cards obligatorias, así que no hay modo parcial. La card pedida viaja en
       la solicitud para que Vera sepa qué quiere el humano que reconsidere.
       Cuesta una sesión de Vera: por eso se confirma antes y el backend limita
       a una cada 3 minutos por marca. */
    async _veraVolverAConsultar(btn) {
      const card = btn.dataset.veraRecheck || '';
      const avisar = (msg, type) => {
        if (typeof window.showToast === 'function') window.showToast(msg, { type });
      };
      // Los containers se cachean en _gridLastOwnPost; si aun no se resolvieron
      // (el usuario pulsa antes de que cargue), se resuelven aqui.
      if (!this._gridBcIds) await this._gridLastOwnPost();
      const bcId = (this._gridBcIds || [])[0];
      if (!bcId) { avisar(__('Todavía no hay una marca cargada.'), 'error'); return; }
      if (!window.confirm(__('¿Le pides a Vera que vuelva a analizar esto? Rehará su lectura completa de Mi Marca y puede tardar unos minutos.'))) return;

      btn.classList.add('is-loading');
      try {
        const { data: sess } = await this._supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) throw new Error(__('Sesión expirada'));
        const base = (window.AI_ENGINE_BASE_URL || 'https://api.aismartcontent.io').replace(/\/+$/, '');
        const res = await fetch(`${base}/dashboard/recheck`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ brandContainerId: bcId, card }),
        });
        const out = await res.json().catch(() => ({}));
        if (res.status === 429) {
          avisar(__('Vera acaba de revisar esta marca. Inténtalo en un momento.'), 'info');
        } else if (res.status === 409) {
          avisar(__('Vera ya está revisando esta marca.'), 'info');
        } else if (!res.ok) {
          throw new Error(out.error || `HTTP ${res.status}`);
        } else {
          avisar(__('Vera está volviendo a analizar. La card se actualiza al terminar.'), 'success');
        }
      } catch (err) {
        console.warn('[BrandGrid] recheck falló:', err);
        avisar(__('No se pudo pedir el reanálisis: {e}', { e: err?.message || '' }), 'error');
      } finally {
        btn.classList.remove('is-loading');
      }
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

    /* Rango de la ventana activa. Ancla al último post propio: si la marca lleva
       días sin publicar, "Semana" (últimos 7 días) saldría vacía. Anclando, cada
       filtro muestra la data más reciente disponible en su granularidad.
       Lo comparten las RPCs del grid y la Publicación destacada, que lee
       brand_posts directo: si cada una calculara su rango, la card podría
       mostrar un post de fuera del periodo que pinta el resto de la página. */
    async _gridRango() {
      // Rango personalizado: manda tal cual, SIN anclar al último post — el
      // usuario pidió esas fechas, no "los N días más recientes con data".
      if (this._gridWindow === 'custom' && this._gridCustomRange) {
        const { from, to } = this._gridCustomRange;
        if (from || to) {
          const desde = from ? new Date(from) : new Date('2015-01-01');
          const hasta = to ? new Date(to) : new Date();
          hasta.setHours(23, 59, 59, 999);   // el día final entra completo
          return { dateFrom: desde.toISOString(), dateTo: hasta.toISOString() };
        }
      }
      const days = this._gridWindowDays();
      const now = new Date();
      const last = await this._gridLastOwnPost();
      const anchor = (last && last < now) ? last : now;
      return {
        dateTo: anchor.toISOString(),
        dateFrom: (days == null ? new Date('2015-01-01') : new Date(anchor.getTime() - days * 86400000)).toISOString(),
      };
    },

    async _loadBrandGridData() {
      const { dateFrom, dateTo } = await this._gridRango();
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
      this._paintTopPostPropio(body);
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
    /* Que lectura de Vera corresponde al filtro activo. Los cuatro presets tienen
       la suya; el rango personalizado no puede tenerla (es arbitrario), asi que
       se le da la del preset de duracion mas parecida — mejor una lectura del
       tramo comparable que una de un periodo al azar. */
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
      // Mas alla de un ano no hay preset mas cercano que "Todo".
      return dias > 365 ? 'all' : mejor;
    },

    /* ══ Lo último que hizo Vera ═══════════════════════════════════════════
       Vera decide qué card actualizar, así que una lectura nueva casi nunca trae
       las seis: trae cinco iguales y una reescrita. De ahí las dos reglas:

       1. Nada se oculta por no haberse actualizado. Cada card sigue mostrando lo
          último que ella escribió — lo garantiza el backend, que refresca la
          MISMA fila del periodo dejando intactas las otras cinco.
       2. Lo que sí cambió late minuto y medio, para que se vea de un vistazo cuál
          fue su última aportación sin tener que releer el tablero entero.

       Se compara contra la huella de la visita anterior, guardada por org y por
       periodo (cambiar de filtro compara contra SU propia historia, no contra la
       del filtro anterior). En la primera visita no late nada: solo se guarda la
       línea base. Si latiera todo, latir dejaría de significar algo. ══════════ */

    /* ══ Cuándo lo escribió Vera ═══════════════════════════════════════════
       Cada card lleva su propia hora (`updated_at`, sellada por ai-engine al
       armar la lectura) porque el tablero cambia por partes: cinco cards de
       ayer y una de hace un minuto viven en la misma fila. Si se usara la fecha
       de la LECTURA, las seis dirían lo mismo y sería mentira en cinco.
       Respaldo para lecturas viejas sin sello: la fecha de la lectura, que es
       lo único cierto que hay de ellas. ═══════════════════════════════════ */

    // En palabras, no en abreviaturas: esto lo lee quien mira su marca, no un
    // panel de monitoreo. "hace 3 min", "hace 1 hora", "hace 2 días".
    _veraHace(iso) {
      const t = iso ? new Date(iso).getTime() : NaN;
      if (!t || Number.isNaN(t)) return '';
      const seg = Math.floor((Date.now() - t) / 1000);
      if (seg < 0) return __('hace un momento');        // reloj del cliente adelantado
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

    // Fecha exacta para el title: el relativo es cómodo, pero cuando alguien
    // pregunta "¿exactamente cuándo?" el dato tiene que estar.
    _veraFechaExacta(iso) {
      try {
        const loc = (window.i18n && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO';
        return new Date(iso).toLocaleString(loc, {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
      } catch (_) { return ''; }
    },

    /* La hora de UNA card: su sello, y si no lo tiene, el de la lectura.
       Devuelve null si no hay ninguno — mejor sin pie que con un "—". */
    _veraFechaDatos(card) {
      const iso = (card && card.updated_at) || this._veraLecturaAt || null;
      const rel = this._veraHace(iso);
      if (!rel) return null;
      return { iso, rel, exacta: this._veraFechaExacta(iso) };
    },

    // El pie, para las plantillas que se escriben como texto. La etiqueta es la
    // misma clave que ya usa Brand Storage ('Última actualización {d}'), con el
    // relativo dentro; al pasar el cursor, la fecha exacta.
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

    // Identidad ESTABLE de cada pieza. Vive en un solo sitio porque la usan dos
    // caminos que no se ven entre sí: la plantilla (que la escribe en el DOM) y
    // el cálculo de huellas (que la compara). Si divergieran, nada latiría nunca.
    _nid(prefijo, sem) {
      const limpio = String(sem == null ? '' : sem)
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
      return `${prefijo}:${limpio || 'x'}`;
    },
    _nidCard(card)  { return this._nid('card', card && card.type); },
    // Las observaciones no traen id: se identifican por su título, y si no lo
    // tienen, por el arranque del texto.
    _nidObs(o)      { return this._nid('obs', (o && (o.titulo || o.observacion)) || ''); },
    _nidAudRec(a)   { return this._nid('audrec', a && a.id); },

    // Huella de contenido: si cambia el texto, cambia el número. No pretende ser
    // criptográfica — solo distinguir "esto es otra cosa" de "esto es lo mismo".
    _huella(v) {
      const s = JSON.stringify(v == null ? '' : v);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(36);
    },

    /* Huella de TODO lo que se pinta: una por card y una por item suelto. Los
       items van aparte porque "Vera reescribió la card" y "Vera añadió una
       observación" son noticias distintas y merecen señales distintas. */
    _veraHuellasDe(cards) {
      const mapa = {};
      // La hora NO entra en la huella. Late lo que cambió para quien lee, y
      // "Vera la volvió a mirar y escribió lo mismo" no es una novedad: sería
      // latir por metadato. (Además, el día que se añadió el sello habrían
      // latido las seis cards a la vez, que es justo lo que vacía la señal.)
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

    /* Marca en el DOM lo que cambió desde la visita anterior y programa su
       apagado. El latido dura LATIDO_MS y se apaga solo: una señal que no se apaga
       deja de ser una señal y pasa a ser decoración. */
    _veraMarcarNovedades(body, huellas) {
      // Un repintado nuevo invalida los apagados en vuelo (el DOM que iban a
      // limpiar ya no existe). Sin esto se acumula un timer por refresco.
      (this._veraLatidos || []).forEach((t) => clearTimeout(t));
      this._veraLatidos = [];

      const key = this._veraHuellasKey();
      let previas = null;
      try { previas = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
      try { localStorage.setItem(key, JSON.stringify(huellas)); } catch (_) {}
      if (!previas || typeof previas !== 'object') return;   // primera visita: solo línea base

      const nuevos = Object.keys(huellas).filter((id) => previas[id] !== huellas[id]);
      if (!nuevos.length) return;

      const marcar = (el) => {
        if (!el) return;
        // Reiniciar la animación si el elemento ya venía latiendo.
        el.classList.remove('is-nuevo');
        void el.offsetWidth;
        el.classList.add('is-nuevo');
        this._veraLatidos.push(setTimeout(() => el.classList.remove('is-nuevo'), LATIDO_MS));
      };
      nuevos.forEach((id) => {
        body.querySelectorAll(`[data-nuevo-id="${id}"]`).forEach(marcar);
      });
    },

    async _renderVeraCards(body) {
      const obsHost = body.querySelector('#bgridObservacion');
      const host = body.querySelector('#bgridVera');
      if (!obsHost && !host) return;
      /* La lectura es POR PERIODO: Vera escribe una version por cada filtro
         (Semana/Mes/Ano/Todo) y aqui se pide la del filtro activo. Antes habia
         una sola lectura sin periodo y se mostraba igual bajo los cuatro
         botones: solo era cierta en "Mes" —la ventana por defecto de sus
         tools— y mentia en los otros tres.
         Respaldo: si el periodo activo aun no tiene lectura propia (Vera no la
         alcanzo a escribir, o es una lectura vieja sin periodo), se muestra la
         mas reciente que haya en vez de dejar el tab en blanco. */
      let reading = null;
      try {
        const base = () => this._supabase.from('vera_dashboard_readings')
          .select('reading, created_at, periodo')
          .eq('organization_id', this._orgId).eq('scope', 'mi_marca').eq('status', 'published')
          // Cada lector pide SU schema: desde que el cerebro (cards.vera4)
          // escribe en los mismos scopes, "la ultima del scope" puede ser de
          // otro contrato y este tab se pintaria vacio.
          .eq('schema_version', 2)
          .order('created_at', { ascending: false }).limit(1);
        const { data } = await base().eq('periodo', this._veraPeriodoActivo());
        let fila = (data && data[0]) ? data[0] : null;
        if (!fila) {
          const { data: fallback } = await base();
          fila = (fallback && fallback[0]) ? fallback[0] : null;
        }
        reading = fila ? fila.reading : null;
        // Respaldo del pie de cada card: solo se usa si la card no trae sello.
        this._veraLecturaAt = fila ? fila.created_at : null;
      } catch (_) {}
      const vdHost = body.querySelector('#bgridVD');
      const all = (reading && reading.schema === 'cards.v2' && Array.isArray(reading.cards)) ? reading.cards : [];
      // Colocación por tipo: observacion arriba de Interacciones (transparente);
      // virtudes+desventajas como PAR hermano bajo Interacciones; resto full-width.
      const obs = [], virt = [], desv = [], audRec = [], aud = [], intu = [], rest = [];
      all.forEach((c) => {
        const t = c && c.type;
        if (t === 'observacion') obs.push(c);
        else if (t === 'virtudes') virt.push(c);
        else if (t === 'desventajas') desv.push(c);
        else if (t === 'audiencias_recomendadas') audRec.push(c);
        // 'audiencia' (demografía real: mapa + pirámide) sale de `rest` para
        // poder colocarla ENCIMA de las recomendadas: primero a quién YA le
        // hablas, después a quién deberías hablarle.
        else if (t === 'audiencia') aud.push(c);
        else if (t === 'intuicion') intu.push(c);   // NIVEL 2: se pinta aparte, arriba
        else rest.push(c);
      });
      const virtItems = virt.map((c, i) => ({ card: c, key: 'pos' + i }));
      const desvItems = desv.map((c, i) => ({ card: c, key: 'neg' + i }));
      const audItems = aud.map((c, i) => ({ card: c, key: 'aud' + i }));
      const restItems = rest.map((c, i) => ({ card: c, key: 'v' + i }));
      const intuItems = intu.map((c, i) => ({ card: c, key: 'intu' + i }));
      // Observaciones: fichas como en Competencia. La card solo se oculta si
      // Vera no ha escrito NINGUNA nunca (no dejamos un marco vacío en la
      // columna). Ojo con la diferencia: "no la actualizó en esta ronda" NO es
      // motivo para ocultarla — sigue mostrando las últimas que escribió.
      if (obsHost) {
        const obsHtml = this._veraObservacionesHtml(obs);
        obsHost.innerHTML = obsHtml;
        const obsCard = body.querySelector('#bgridObsCard');
        if (obsCard) {
          obsCard.hidden = !obsHtml;
          obsCard.setAttribute('data-nuevo-id', this._nid('card', 'observacion'));
        }
        // Su pie también vive en el shell, así que se llena aquí en vez de salir
        // de la plantilla como en las demás cards. Se ESCRIBE sobre el elemento,
        // no se reemplaza: si se fuera el id, el repintado siguiente no lo
        // encontraría y la hora se quedaría congelada.
        const obsFecha = body.querySelector('#bgridObsFecha');
        if (obsFecha) {
          const f = obsHtml ? this._veraFechaDatos(obs[0]) : null;
          obsFecha.hidden = !f;
          obsFecha.textContent = f ? __('Última actualización {d}', { d: f.rel }) : '';
          if (f) obsFecha.title = __('Última actualización {d}', { d: f.exacta });
        }
      }
      // LA INTUICIÓN ABRE EL TABLERO: primera pieza de la columna izquierda,
      // encima de Interacciones. Su hueco se colapsa solo si Vera no la escribió.
      const intuHost = body.querySelector('#bgridIntuicion');
      if (intuHost) {
        const intuHtml = intuItems.map((x) => this._veraCardHtml(x.card, x.key)).join('');
        intuHost.innerHTML = intuHtml ? `<div class="vera-cards">${intuHtml}</div>` : '';
        this._acentuarIntuicion(intuHost);
      }
      if (vdHost) {
        vdHost.innerHTML = this._veraDuoHtml(virtItems, desvItems);
        this._acentuarDuoConMarca(vdHost);
      }
      // Producto destacado y Publicacion destacada viven en el shell, pero se
      // COLOCAN debajo de Algoritmo. Se rescatan antes de limpiar el host: ya
      // estan pintadas y repintarlas costaria otra ronda de consultas.
      const grid = body.querySelector('.bgrid');
      const cierre = [body.querySelector('.bgrid-card--prodstar')];
      cierre.forEach((el) => { if (el && host && host.contains(el) && grid) grid.appendChild(el); });
      // Audiencias recomendadas ABREN el bloque de Vera (arriba de todo el resto,
      // Algoritmo incluido): es la accion — a quien hablarle — antes del analisis.
      // Va como banda FULL-WIDTH propia, fuera del grid de 2 columnas: es el
      // mismo carrusel que las Audiencias de Competencia, que tampoco vive en un
      // grid. Meterla como celda con grid-column: 1/-1 la dejaba en media pagina.
      // Audiencia real (demografía) ABRE el bloque, encima de las recomendadas.
      const audHtml = audItems.map((x) => this._veraCardHtml(x.card, x.key)).join('');
      const audBlock = audHtml ? `<div class="vera-cards">${audHtml}</div>` : '';
      const audRecHtml = audRec.map((c) => this._veraAudRecHtml(c)).join('');
      const restHtml = restItems.map((x) => this._veraCardHtml(x.card, x.key)).join('');
      const restBlock = restHtml ? `<div class="vera-cards">${restHtml}</div>` : '';
      if (host) host.innerHTML = `${audBlock}${audRecHtml}${restBlock}`;
      this._colocarCierreBajoAlgoritmo(body);
      this._bindVeraAudRec(host);
      body.querySelectorAll('[data-panel-marca]').forEach((el) => this._vestirPanelDeMarca(el));
      try { await this._ensureChartJs(); } catch (_) {}
      // Observaciones queda fuera: su plantilla no pinta charts.
      this._paintVeraCharts(body, virtItems.concat(desvItems, intuItems, audItems, restItems));
      // Bloques vivos: piden su propio dato, por eso van aparte de los charts.
      this._paintProductoEstrella(body);
      this._paintTopPostPropio(body);
      // Con la columna derecha ya poblada, se calcula el tope de Observaciones.
      this._ajustarAltoObservaciones(body);
      // Cards del cerebro (cards.vera4) al pie: lectura aparte, consulta aparte.
      // Va después de v2 a propósito — si no hay lectura vera4, el host queda
      // vacío y se colapsa, y el tab no cambia en nada.
      this._renderVera4?.(body, 'mi_marca', body.querySelector('#bgridVera4'));
      // Lo último de Vera, al final: el DOM ya está completo, así que aquí se
      // encuentran todas las piezas que hay que marcar.
      this._veraMarcarNovedades(body, this._veraHuellasDe(all));
    },

    /* ══ Evidencia del producto ═══════════════════════════════════════════
       El modal que abre cada cifra de la card: las publicaciones que la
       componen, los comentarios que nombran el producto, el desglose de la
       interacción y los hashtags. Sin esto la card es un veredicto sin pruebas.
       Los datos salen del RPC dashboard_producto_detalle, que aplica la MISMA
       regla de detección que la card. ═══════════════════════════════════════ */
    async _openProductoEvidencia(prod, seccion, QUAD) {
      if (!prod || !prod.producto) return;
      const esc = (s) => this._esc(s);
      const overlay = document.createElement('div');
      overlay.className = 'salud-overlay';
      overlay.innerHTML = `
        <div class="salud-modal pev-modal" role="dialog" aria-modal="true">
          <div class="salud-modal-head">
            <span class="salud-modal-title">${esc(prod.producto)}</span>
            <button type="button" class="salud-modal-close" aria-label="${esc(__('Cerrar'))}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
          </div>
          <div class="salud-modal-body pev-body"><div class="pev-load">${esc(__('Reuniendo la evidencia…'))}</div></div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.salud-modal-close')) close(); });
      const onEsc = (ev) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
      this.addEventListener(document, 'keydown', onEsc);

      let det = null, fallo = null;
      try {
        const bcId = (this._gridBcIds || [])[0];
        const res = await this._supabase.rpc('dashboard_producto_detalle', {
          p_brand_container_id: bcId, p_familia: prod.producto,
        });
        if (res && res.error) fallo = res.error.message || String(res.error);
        else det = res && res.data;
      } catch (e) { fallo = (e && e.message) ? e.message : String(e); }

      const body = overlay.querySelector('.pev-body');
      if (!body) return;
      if (fallo || !det) {
        console.warn('[ProductoEvidencia]', fallo);
        body.innerHTML = `<div class="pev-load">${esc(__('No se pudo reunir la evidencia'))}</div>`;
        return;
      }
      overlay._det = det;
      body.innerHTML = this._pevShellHtml(det, prod, QUAD);
      this._pevPaintSeccion(overlay, seccion || 'publicaciones');
      body.addEventListener('click', (e) => {
        const t = e.target.closest('[data-pev-tab]');
        if (t) this._pevPaintSeccion(overlay, t.dataset.pevTab);
      });
    },

    _pevShellHtml(det, prod, QUAD) {
      const esc = (s) => this._esc(s);
      const r = det.resumen || {};
      const q = (QUAD && (QUAD[prod.cuadrante] || QUAD.cola)) || null;
      const tabs = [
        { k: 'publicaciones', label: __('Publicaciones'), n: r.publicaciones },
        { k: 'interacciones', label: __('Interacciones'), n: (r.interacciones || {}).total },
        { k: 'menciones',     label: __('Menciones'),     n: r.menciones_publico },
        { k: 'videos',        label: __('Videos'),        n: r.videos },
        { k: 'visuales',      label: __('Sale en la foto'), n: r.apariciones_visuales },
        { k: 'hashtags',      label: __('Hashtags'),      n: r.hashtags_distintos },
      ];
      return `
        ${q ? `<span class="vera-prodstar-badge ${q.cls} pev-badge">${esc(q.label)}</span>` : ''}
        <nav class="pev-tabs" role="tablist">
          ${tabs.map((t) => `
            <button type="button" class="pev-tab" data-pev-tab="${t.k}" role="tab">
              ${esc(t.label)}<span>${esc(this._pevNum(t.n))}</span>
            </button>`).join('')}
        </nav>
        <div class="pev-panel" id="pevPanel"></div>`;
    },

    _pevNum(n) {
      const v = Number(n);
      if (!isFinite(v)) return '—';
      return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.0', '') + 'k' : String(v);
    },

    _pevPaintSeccion(overlay, k) {
      const det = overlay._det || {};
      const panel = overlay.querySelector('#pevPanel');
      if (!panel) return;
      overlay.querySelectorAll('[data-pev-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.pevTab === k));
      const posts = Array.isArray(det.publicaciones) ? det.publicaciones : [];
      if (k === 'interacciones') { panel.innerHTML = this._pevInteraccionesHtml(det.resumen || {}); return; }
      if (k === 'menciones')     { panel.innerHTML = this._pevMencionesHtml(det.menciones || []); return; }
      if (k === 'hashtags')      { panel.innerHTML = this._pevHashtagsHtml(det.hashtags || []); return; }
      if (k === 'videos')        { panel.innerHTML = this._pevPostsHtml(posts.filter((p) => p.es_video)); return; }
      if (k === 'visuales') {
        // Publicaciones donde el producto SE VE pero no se nombra. No cuentan
        // para su presencia — el describer no distingue un pouch de otro — pero
        // son evidencia util: ahi esta el producto sin que nadie lo diga.
        const vis = Array.isArray(det.apariciones_visuales) ? det.apariciones_visuales : [];
        panel.innerHTML = `<p class="pev-nota">${this._esc(__('El producto aparece en la imagen pero la publicación no lo nombra: no suma a su presencia.'))}</p>`
          + this._pevPostsHtml(vis);
        return;
      }
      panel.innerHTML = this._pevPostsHtml(posts);
    },

    /* Cada publicación con su miniatura, su copy y lo que movió. La etiqueta de
       evidencia dice por qué esa publicación cuenta: la nombró en el texto, o el
       producto solo aparece en la imagen. */
    _pevPostsHtml(posts) {
      if (!posts.length) return `<div class="pev-load">${this._esc(__('Sin publicaciones en esta vista'))}</div>`;
      const esc = (s) => this._esc(s);
      return `<ul class="pev-posts">${posts.map((p) => {
        const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString() : '';
        const thumb = p.imagen
          ? `<img class="pev-post-thumb" src="${esc(p.imagen)}" alt="" loading="lazy">`
          : `<span class="pev-post-thumb pev-post-thumb--empty" aria-hidden="true"></span>`;
        const cuerpo = `
          <div class="pev-post-body">
            <div class="pev-post-meta">
              <span class="pev-post-red">${esc(NET_LABEL[p.red] || p.red || '')}</span>
              <span class="pev-post-sep">·</span><span>${esc(fecha)}</span>
              <span class="pev-post-ev" data-ev="${esc(p.evidencia || '')}">${esc(p.evidencia === 'imagen' ? __('solo en la imagen') : __('lo nombra el texto'))}</span>
            </div>
            <p class="pev-post-copy">${esc(p.copy || '')}</p>
            <div class="pev-post-nums">
              <span><strong>${esc(this._pevNum(p.interacciones))}</strong> ${esc(__('interacciones'))}</span>
              <span>${esc(this._pevNum(p.likes))} ${esc(__('me gusta'))}</span>
              <span>${esc(this._pevNum(p.comentarios))} ${esc(__('comentarios'))}</span>
              <span>${esc(this._pevNum(p.compartidos))} ${esc(__('compartidos'))}</span>
              ${Number(p.reproducciones) > 0 ? `<span>${esc(this._pevNum(p.reproducciones))} ${esc(__('reproducciones'))}</span>` : ''}
            </div>
          </div>`;
        return `<li class="pev-post">
            ${p.permalink ? `<a class="pev-post-link" href="${esc(p.permalink)}" target="_blank" rel="noopener">${thumb}</a>` : thumb}
            ${cuerpo}
          </li>`;
      }).join('')}</ul>`;
    },

    /* El desglose que responde: ¿reaccionan mucho o poco, y reaccionan de verdad
       o solo de paso? Un producto que solo junta likes gusta al pasar; uno que
       se comenta, comparte y guarda mueve intención. */
    _pevInteraccionesHtml(r) {
      const esc = (s) => this._esc(s);
      const i = r.interacciones || {};
      const NIVEL = {
        alto:     __('alta'), medio: __('media'),
        bajo:     __('baja'), muy_bajo: __('muy baja'),
      };
      const LECTURA = {
        alto:     __('Tu audiencia responde por encima de lo normal en redes de marca.'),
        medio:    __('Respuesta en el rango normal de una marca de este tamaño.'),
        bajo:     __('Responde poca gente para el tamaño de tu audiencia.'),
        muy_bajo: __('Casi nadie de tu audiencia reacciona: la mayoría ve y sigue de largo.'),
      };
      const REACCION = {
        activa: __('Reacción real: comentan, comparten y guardan, no solo dan me gusta.'),
        tibia:  __('Reacción tibia: algo de conversación, pero la mayoría solo da me gusta.'),
        pasiva: __('Reacción de compromiso: casi todo son me gusta, casi nadie comenta ni comparte.'),
      };
      const t = r.tendencia || {};
      const varia = Number(t.variacion_pct);
      const tendLect = !isFinite(varia) ? null
        : varia >= 15 ? __('Va en subida: las publicaciones recientes mueven más que las primeras.')
        : varia <= -15 ? __('Va en bajada: el público reacciona menos que antes a este producto — desgaste.')
        : __('Estable: reacciona igual que al principio.');
      const fila = (label, v, hint) => `
        <div class="pev-int-row">
          <span class="pev-int-label">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>
          <span class="pev-int-val">${esc(this._pevNum(v))}</span>
        </div>`;
      return `
        <div class="pev-int-head">
          <div class="pev-int-big">
            <strong>${esc(r.tasa_interaccion_pct != null ? r.tasa_interaccion_pct + '%' : '—')}</strong>
            <small>${esc(__('de tu audiencia reacciona a cada publicación'))}</small>
          </div>
          <div class="pev-int-read">
            <p><strong>${esc(__('Respuesta {n}', { n: NIVEL[r.nivel_interaccion] || '—' }))}.</strong> ${esc(LECTURA[r.nivel_interaccion] || '')}</p>
            ${r.nivel_reaccion ? `<p>${esc(REACCION[r.nivel_reaccion])}</p>` : ''}
            ${tendLect ? `<p>${esc(tendLect)}</p>` : ''}
          </div>
        </div>
        <div class="pev-int-grid">
          ${fila(__('Interacciones totales'), i.total)}
          ${fila(__('Me gusta'), i.likes, __('reacción de paso'))}
          ${fila(__('Comentarios'), i.comentarios, __('conversación'))}
          ${fila(__('Compartidos'), i.compartidos, __('te trae público nuevo'))}
          ${fila(__('Guardados'), i.guardados, __('intención de compra'))}
          ${fila(__('Reproducciones'), i.reproducciones, __('alcance de video'))}
          ${fila(__('Audiencia'), r.seguidores)}
        </div>`;
    },

    _pevMencionesHtml(items) {
      if (!items.length) return `<div class="pev-load">${this._esc(__('Nadie ha nombrado este producto en los comentarios'))}</div>`;
      const esc = (s) => this._esc(s);
      return `<ul class="pev-menciones">${items.map((m) => `
        <li class="pev-mencion">
          <div class="pev-mencion-meta">
            <span>${esc(m.autor ? '@' + m.autor : __('Anónimo'))}</span>
            <span class="pev-post-sep">·</span>
            <span>${esc(m.fecha ? new Date(m.fecha).toLocaleDateString() : '')}</span>
            ${m.sentimiento ? `<span class="pev-sent" data-s="${esc(m.sentimiento)}">${esc(m.sentimiento)}</span>` : ''}
          </div>
          <p class="pev-mencion-txt">${esc(m.texto || '')}</p>
        </li>`).join('')}</ul>`;
    },

    _pevHashtagsHtml(items) {
      if (!items.length) return `<div class="pev-load">${this._esc(__('Sin hashtags en estas publicaciones'))}</div>`;
      const esc = (s) => this._esc(s);
      const max = Math.max(...items.map((h) => Number(h.n) || 0), 1);
      return `<ul class="pev-tags">${items.map((h) => `
        <li class="pev-tag">
          <span class="pev-tag-name">#${esc(String(h.tag || '').replace(/^#/, ''))}</span>
          <span class="pev-tag-bar"><i style="width:${Math.round((Number(h.n) || 0) / max * 100)}%"></i></span>
          <span class="pev-tag-n">${esc(String(h.n))}</span>
        </li>`).join('')}</ul>`;
    },

    /* Producto destacado + Publicacion destacada se paran DEBAJO de Algoritmo,
       una en cada columna del grid de cards de Vera; Algoritmo se queda a todo
       el ancho. Si Vera no publico Algoritmo, cada una se queda donde estaba:
       ultimos bloques de la pagina, a su ancho acotado. */
    _colocarCierreBajoAlgoritmo(body) {
      const algo = body.querySelector('.vera-cards .vera-card--algoritmo');
      if (!algo) return;
      const cards = algo.parentElement;
      // Publicacion destacada a la DERECHA de Algoritmo: se inserta justo
      // despues en el DOM para que caiga en la columna 2 de su misma fila.
      // Debajo, Producto destacado. La Intuición YA NO cierra la página: subió al
      // Nivel 2 (host #bgridIntuicion, arriba de todo el análisis de Vera).
      // Publicacion destacada YA NO baja aqui: vive en la columna de Tráfico.
      const prodstar = body.querySelector('.bgrid-card--prodstar');
      if (prodstar) cards.appendChild(prodstar);
    },

    /* La altura de Observaciones la manda la columna del análisis, no el número
       de observaciones: crece con su contenido y, al llegar al alto de la otra
       columna, se topa y scrollea dentro de sí misma. Así no deja hueco debajo
       ni estira la página cuando Vera escribe seis en vez de una.
       Se recalcula con un ResizeObserver porque la columna derecha cambia de
       alto cuando entran los charts y las piezas destacadas (asíncronas).
       No hay bucle: con `align-items: start` la columna derecha mide su propio
       contenido, y tocar el alto de la izquierda no la mueve. */
    _ajustarAltoObservaciones(body) {
      const host = body.querySelector('#bgridObservacion');
      const todas = [...body.querySelectorAll('.bgrid > .bgrid-col')];
      // Por CONTENIDO, no por índice: las columnas se intercambiaron de lado y
      // un [0]/[1] fijo dejaría el cálculo invertido en silencio.
      const colObs = todas.find((c) => c.contains(host));
      const colAnalisis = todas.find((c) => c !== colObs);
      if (!host || !colObs || !colAnalisis) return;
      const ALTO_MINIMO = 240;
      const aplicar = () => {
        const card = host.closest('#bgridObsCard');
        host.style.maxHeight = 'none';
        if (!card || card.hidden) return;
        // Lo que ocupa la columna de Observaciones SIN la lista (Tráfico +
        // Campañas + el encabezado), restado al alto de la del análisis.
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
      // Pasadas de asentamiento: la columna del análisis sigue creciendo después
      // del primer cálculo. Sin esto el tope se congela en el alto que la
      // columna tenía a medio pintar.
      requestAnimationFrame(() => aplicar());
      [600, 2000].forEach((ms) => setTimeout(aplicar, ms));
      // La foto de Publicación destacada es la que más tarda y la que más alto
      // suma: cada imagen que termina de cargar recalcula el tope.
      colAnalisis.querySelectorAll('img').forEach((img) => {
        if (!img.complete) img.addEventListener('load', aplicar, { once: true });
      });
      if (this._obsResizeHandler) window.removeEventListener('resize', this._obsResizeHandler);
      this._obsResizeHandler = () => aplicar();
      window.addEventListener('resize', this._obsResizeHandler);
    },

    /* Bloques a pintar de una card: el JUICIO primero, la evidencia después.
       Antes era un o-excluyente (`blocks ? blocks : markdown`) y una card con
       tabla o chart perdía su texto en silencio: quedaban los números sin una
       línea de criterio, justo lo contrario de la doctrina. Van los dos. */
    _veraBlocksDe(card) {
      return [
        ...(card && card.markdown ? [{ type: 'markdown', markdown: card.markdown }] : []),
        ...(Array.isArray(card && card.blocks) ? card.blocks : []),
      ];
    },

    /* Fortalezas + Debilidades como PAR hermano: dos paneles lado a lado. */
    /* ══ "Volver a consultar" ═══════════════════════════════════════════════
       Toda card que ESCRIBE Vera lleva este botón en su esquina superior
       derecha: es el humano pidiéndole que vuelva a mirar ESE análisis.
       `scope` identifica qué card pidió el repaso — viaja en la solicitud para
       que Vera sepa qué quiere el humano que reconsidere. ══════════════════ */
    _veraRecheckBtn(scope, etiqueta) {
      const t = this._esc(etiqueta || __('Volver a consultar'));
      return `<button type="button" class="vera-recheck" data-vera-recheck="${this._esc(scope)}"
        title="${t}" aria-label="${t}"><i class="aisc-ico aisc-ico--refresh" aria-hidden="true"></i></button>`;
    },

    _veraDuoHtml(virtItems, desvItems) {
      if (!virtItems.length && !desvItems.length) return '';
      const esc = (s) => this._esc(s);
      const panel = (items, side, label, icon) => {
        if (!items.length) return '';
        const content = items.map(({ card, key }) => {
          const blocks = this._veraBlocksDe(card);
          return `
            ${this._veraRecheckBtn(side === 'pos' ? 'virtudes' : 'desventajas', __('Volver a consultar {c}', { c: label }))}
            <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${icon}" aria-hidden="true"></i>${esc(label)}</span>
            ${card.title ? `<h4 class="vera-card-title">${esc(card.title)}</h4>` : ''}
            <div class="vera-card-body">${blocks.map((b, bi) => this._veraBlockHtml(b, key, bi)).join('')}</div>
            ${this._veraFechaHtml(card)}`;
        }).join('');
        // El par no pasa por _veraCardHtml, así que su identidad se escribe aquí:
        // sin esto, Fortalezas y Debilidades no latirían nunca y el fallo sería
        // mudo (la huella existe, pero no hay elemento que la lleve).
        const nid = this._nid('card', side === 'pos' ? 'virtudes' : 'desventajas');
        return `<div class="vera-duo-panel" data-side="${side}" data-nuevo-id="${esc(nid)}">${content}</div>`;
      };
      return `<div class="vera-duo">${panel(virtItems, 'pos', __('Fortalezas'), 'star')}${panel(desvItems, 'neg', __('Debilidades'), 'alert-warning')}</div>`;
    },

    /* El borde de Fortalezas es el unico trazo del par: que lo ponga la marca
       y no el negro del fondo. Alpha bajo para que siga siendo una linea, no
       un marco de color. */
    _acentuarDuoConMarca(host) {
      const duo = host && host.querySelector('.vera-duo');
      if (!duo) return;
      try {
        const [r, g, b] = this._hexToRgb(this._gridBrandHexes()[0]);
        duo.style.setProperty('--duo-acento', `rgba(${r}, ${g}, ${b}, 0.38)`);
      } catch (_) {}
    },

    /* Intuicion: su acento es SIEMPRE el color solido de la marca (nunca un
       morado suelto). Se publica como triplete r,g,b para que los bloques
       (callout/quote) armen sus tintes con la opacidad que necesiten. */
    _acentuarIntuicion(host) {
      const card = host && host.querySelector('.vera-card--intuicion');
      if (!card) return;
      try {
        const [r, g, b] = this._hexToRgb(this._gridBrandHexes()[0]);
        card.style.setProperty('--intu-accent', `${r}, ${g}, ${b}`);
      } catch (_) {}
    },

    /* ══ Audiencias recomendadas ═══════════════════════════════════════════
       A quien deberia hablarle la marca segun lo que Vera aprendio de ella:
       audiencias con demanda que encajan con su producto. Reusa el carrusel de
       fichas de Oceanos Azules (clases cgrid-aud, cga y tend-oc) sobre el color
       de marca — cada ficha es una recomendacion accionable, la X la descarta.
       Es inteligencia de Vera, no un dato en vivo. ══════════════════════════ */
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
          ${this._veraRecheckBtn('audiencias_recomendadas', __('Volver a consultar Audiencias recomendadas'))}
          <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--audience" aria-hidden="true"></i>${esc(__('Audiencias recomendadas'))}</span>
          <p class="bgrid-card-sub">${esc(__('A quién deberías hablarle según lo que Vera aprendió de ti'))}</p>
          <div class="cgrid-aud">${fichas}</div>
          ${this._veraFechaHtml(card)}
        </section>`;
    },

    /* IDs descartadas por el usuario, por org. Sin RPC de decisiones todavia:
       se guardan localmente para que la X no reaparezca al recargar. Cuando
       Vera exponga un store de decisiones, este es el punto de enganche. */
    _audRecKey() { return `audrec:dismissed:${this._orgId || 'global'}`; },
    _audRecDescartadas() {
      if (this._audRecSet) return this._audRecSet;
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(this._audRecKey()) || '[]'); } catch (_) {}
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
        try { localStorage.setItem(this._audRecKey(), JSON.stringify([...set])); } catch (_) {}
        ficha.classList.add('is-adoptada');
        setTimeout(() => {
          ficha.remove();
          if (!sec.querySelector('.cga-item')) sec.remove();
        }, 280);
      });
    },

    /* ══ Observaciones — la MISMA plantilla que Competencia ═════════════════
       Fichas .cgo-item: la clasificación de Vera va en el filete superior, los
       chips dicen dónde y con qué urgencia, y el cuerpo es TEXTO. Aquí no se
       pintan blocks: una observación es un juicio, y un número suelto no es
       una tarjeta — si sostiene el juicio, va dentro de la frase.
       Acepta el molde nuevo (items[]) y degrada una lectura vieja (un solo
       markdown + blocks) a una ficha, conservando el juicio y tirando la
       tabla, para que el tab no quede vacío entre ciclos de Vera. ══════════ */
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
        if (Array.isArray(c && c.items) && c.items.length) {
          c.items.forEach((o) => { if (o && o.observacion) items.push(o); });
        } else if (c && (c.markdown || c.title)) {
          items.push({ titulo: c.title, observacion: this._mdAPlano(c.markdown), severidad: c.tone });
        }
      });
      if (!items.length) return '';
      const PRIO = { alta: 0, media: 1, baja: 2 };
      const orden = [...items].sort((a, b) =>
        (PRIO[String(a.prioridad || '').toLowerCase()] ?? 1) -
        (PRIO[String(b.prioridad || '').toLowerCase()] ?? 1));
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

    /* Markdown → texto plano de un párrafo: solo para degradar lecturas viejas
       a la ficha nueva. Quita marcas, no interpreta. */
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
      // 'observacion' NO vive aquí: tiene su propia plantilla (_veraObservacionesHtml,
      // la misma de Competencia). Si vuelve a este mapa, vuelve la tabla.
      const META = {
        virtudes:    { label: __('Fortalezas'),    icon: 'star' },
        desventajas: { label: __('Debilidades'),   icon: 'alert-warning' },
        audiencia:   { label: __('Audiencias'),    icon: 'audience' },
        // "Algoritmo" a secas: hay otra card de algoritmo en Competencia y el
        // "Tu" no era lo que las separaba. Lo que las separa es el SUJETO —
        // aquí, cómo te lee a ti; allá, qué está premiando en ellos.
        algoritmo:   { label: __('Algoritmo'),     icon: 'compass' },
        intuicion:   { label: __('Intuición'),     icon: 'sparkle' },
      };
      const m = META[card && card.type];
      if (!m) return '';   // tipo desconocido → se ignora (forward-compatible)
      // Audiencia = simbiosis: viz (choropleth + pyramid) a la izquierda, comentario a la derecha.
      if (card.type === 'audiencia' && !bare) return this._veraAudienciaHtml(card, key, m);
      const esc = (s) => this._esc(s);
      const blocks = this._veraBlocksDe(card);
      const esActo = card.type === 'algoritmo';
      const inner = blocks.map((b, bi) => this._veraBlockHtml(
        (esActo && b && b.type === 'markdown') ? { ...b, _actos: true } : b, key, bi)).join('');
      const tone = ['positive', 'neutral', 'warning', 'critical'].includes(card.tone) ? card.tone : 'neutral';
      return `
        <section class="vera-card vera-card--${this._esc(card.type)}${bare ? ' vera-card--bare' : ''}" data-tone="${tone}" data-nuevo-id="${this._esc(this._nidCard(card))}">
          ${this._veraRecheckBtn(card.type, __('Volver a consultar {c}', { c: m.label }))}
          <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${m.icon}" aria-hidden="true"></i>${esc(m.label)}</span>
          ${card.title ? `<h3 class="vera-card-title">${esc(card.title)}</h3>` : ''}
          <div class="vera-card-body">${inner}</div>
          ${this._veraFechaHtml(card)}
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
      // Las celdas que enumeran ("Recetas · Nutrición infantil") se leen mejor
      // como etiquetas sueltas que como una frase con puntos medios.
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

    /* Los párrafos de Vera que abren con un rótulo ("El riesgo:", "Qué hacer:")
       son los tres actos de la lectura: diagnóstico, consecuencia y salida. Se
       pintan como bloques con acento propio en vez de tres párrafos iguales que
       se leen como un documento de Word. */
    _veraActosHtml(md) {
      const ACENTOS = [
        { re: /^(el riesgo|riesgo|ojo|cuidado)\b/i,                          tono: 'riesgo',  icon: 'alert' },
        { re: /^(qué hacer|que hacer|acción|accion|siguiente paso|hazlo)\b/i, tono: 'accion',  icon: 'compass' },
      ];
      const parrafos = String(md == null ? '' : md).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
      if (parrafos.length < 2) return null;
      return `<div class="vera-actos">${parrafos.map((par, i) => {
        const plano = par.replace(/[*_`#>]/g, '').trim();
        const hit = ACENTOS.find((a) => a.re.test(plano));
        const tono = hit ? hit.tono : (i === 0 ? 'lectura' : 'nota');
        const ico = hit ? `<i class="aisc-ico aisc-ico--${hit.icon}" aria-hidden="true"></i>` : '';
        return `<div class="vera-acto" data-tono="${tono}">${ico}<div class="vera-md">${this._safeMarkdown(par)}</div></div>`;
      }).join('')}</div>`;
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
        <section class="vera-card vera-card--audiencia" data-tone="${tone}" data-nuevo-id="${esc(this._nidCard(card))}">
          <span class="vera-card-kind"><i class="aisc-ico aisc-ico--${m.icon}" aria-hidden="true"></i>${esc(m.label)}</span>
          ${card.title ? `<h3 class="vera-card-title">${esc(card.title)}</h3>` : ''}
          <div class="vera-aud-grid">
            <div class="vera-aud-viz">${vizHtml}</div>
            <div class="vera-aud-comment vera-card-body" data-panel-marca="1">${restHtml}</div>
          </div>
          ${this._veraFechaHtml(card)}
        </section>`;
    },

    _veraBlockHtml(block, cardIdx, blockIdx) {
      const t = block && block.type;
      const cid = `veraChart-${cardIdx}-${blockIdx}`;
      const ttl = (block && block.title) ? `<div class="vera-chart-title">${this._esc(block.title)}</div>` : '';
      if (t === 'markdown') {
        // En Tu Algoritmo el texto ES el análisis: se pinta como actos.
        if (block._actos) {
          const actos = this._veraActosHtml(block.markdown);
          if (actos) return actos;
        }
        return `<div class="vera-md">${this._safeMarkdown(block.markdown)}</div>`;
      }
      if (t === 'chart') return `<div class="vera-chart">${ttl}<div class="vera-chart-wrap"><canvas id="${cid}"></canvas></div></div>`;
      if (t === 'pyramid') return `<div class="vera-chart">${ttl}<div class="vera-chart-wrap vera-chart-wrap--pyramid"><canvas id="${cid}"></canvas></div></div>`;
      if (t === 'choropleth') return `<div class="vera-chart vera-choropleth">${ttl}<div class="vera-chart-wrap vera-chart-wrap--map"><canvas id="${cid}"></canvas><div class="vera-geo-fallback" id="${cid}-fb" hidden></div></div></div>`;
      if (t === 'stat') {
        const esc = (s) => this._esc(s);
        return `<div class="vera-stat"><span class="vera-stat-value">${esc(block.value != null ? String(block.value) : '')}</span><span class="vera-stat-label">${esc(block.label || '')}</span></div>`;
      }
      if (t === 'table') return this._veraTableHtml(block);
      // Veredicto destacado: el hallazgo en una caja, con tono.
      if (t === 'callout') {
        const esc = (s) => this._esc(s);
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
      // Cita textual: el copy o el comentario que Vera esta leyendo, como prueba.
      if (t === 'quote') {
        const esc = (s) => this._esc(s);
        return `<figure class="vera-quote">
          <blockquote class="vera-quote-text">${esc(block.text || '')}</blockquote>
          ${block.source ? `<figcaption class="vera-quote-source">${esc(block.source)}</figcaption>` : ''}
        </figure>`;
      }
      // Comparacion a columnas: lo que hiciste / lo que debia decir, senal / lo
      // que esconde, etc. Cada columna con su tono opcional (pos/neg).
      if (t === 'split') {
        const cols = Array.isArray(block.columns) ? block.columns : [];
        if (!cols.length) return '';
        const esc = (s) => this._esc(s);
        const inner = cols.map((c) => {
          const side = ['pos', 'neg'].includes(c && c.side) ? c.side : '';
          return `<div class="vera-split-col"${side ? ` data-side="${side}"` : ''}>
            ${c && c.label ? `<div class="vera-split-label">${esc(c.label)}</div>` : ''}
            ${c && c.markdown ? `<div class="vera-md">${this._safeMarkdown(c.markdown)}</div>` : ''}
          </div>`;
        }).join('');
        return `<div class="vera-block-group">${ttl}<div class="vera-split">${inner}</div></div>`;
      }
      // Bloque VIVO: sin datos de Vera. Se pinta llamando al RPC (ver
      // _paintProductoEstrella) para que cifras e imágenes sean autoritativas.
      if (t === 'producto_estrella') {
        return `<div class="vera-prodstar" id="${cid}" data-prodstar="1">${ttl}
          <div class="vera-prodstar-load">${this._esc(__('Cargando productos…'))}</div>
        </div>`;
      }
      return '';
    },

    /* ══ Publicacion destacada (propia) ══════════════════════════════════════
       Misma pieza que "Publicación con mayor Tráfico" de Competencia — reusa
       sus helpers y sus clases .cgrid-post-* (comp-grid.css entra en esta misma
       ruta) — pero rankeando TUS publicaciones del periodo, no las del rival.

       INTERACCION ≠ REPRODUCCION: ordena por likes+comentarios+compartidos+
       guardados; vistas y reproducciones se muestran pero no rankean.
       Lee brand_posts directo (post_source='own'); la RLS de la org ya cubre
       al miembro. ════════════════════════════════════════════════════════ */
    async _paintTopPostPropio(body) {
      const host = body.querySelector('#bgridTopPost');
      if (!host) return;
      // Idempotente por ventana: lo llaman el ciclo de pintado y tambien
      // _renderVeraCards al reubicar la card. Sin esto la consulta se repite.
      const r = this._gridCustomRange;
      const token = String(this._gridWindow || '') + (r ? `:${r.from || ''}~${r.to || ''}` : '');
      if (host.dataset.tpWindow === token) return;
      host.dataset.tpWindow = token;
      const esc = (s) => this._esc(s);
      const vacio = (txt) => { host.innerHTML = `<div class="cgrid-empty">${esc(txt)}</div>`; };

      let win = null, comments = [];
      try {
        if (!this._gridBcIds) await this._gridLastOwnPost();   // resuelve y cachea los containers
        if (!this._gridBcIds || !this._gridBcIds.length) { vacio(__('Sin publicaciones propias en este periodo.')); return; }
        const { dateFrom, dateTo } = await this._gridRango();
        // Se traen las 40 con mayor engagement_total y se re-rankean con la
        // misma regla de Competencia: engagement_total puede venir nulo o
        // incluir alcance segun la red, metrics es la fuente fiable.
        const { data: rows } = await this._supabase.from('brand_posts')
          .select('id, content, media_assets, permalink, post_id, profile_handle, network, captured_at, author_display_name, metrics, engagement_total, vera_por_que')
          .in('brand_container_id', this._gridBcIds)
          .eq('post_source', 'own')
          .gte('captured_at', dateFrom).lte('captured_at', dateTo)
          .order('engagement_total', { ascending: false, nullsFirst: false }).limit(40);
        const ranked = (rows || [])
          .map((p) => ({ ...p, _inter: this._cgridInteractions(p) }))
          .filter((p) => p._inter > 0)
          .sort((a, b) => b._inter - a._inter);
        win = ranked[0] || null;
      } catch (e) { console.warn('[BrandGrid] top post propio:', e); }
      if (!win) { vacio(__('Sin publicaciones propias con interacción en este periodo.')); return; }

      try {
        const { data: cs } = await this._supabase.from('brand_post_comments')
          .select('author_handle, content, metrics, sentiment')
          .eq('brand_post_id', win.id).limit(80);
        comments = Array.isArray(cs) ? cs : [];
      } catch (_) {}

      const net = String(win.network || '').toLowerCase();
      const handle = String(win.profile_handle || '').replace(/^@+/, '');
      const url = this._cgridPostUrl(net, win.post_id, handle, win.permalink);
      const copy = String(win.content || '').trim();
      const C = (n) => this._compactNum(n);

      const SENT = { POS: 'pos', NEG: 'neg', NEU: 'neu' };
      const topComments = comments
        .map((c) => ({ ...c, _l: Number(c.metrics && c.metrics.likes) || 0 }))
        .sort((a, b) => b._l - a._l)
        .slice(0, 4);
      const commentsHtml = topComments.length ? `
        <div class="cgrid-comments">
          <div class="cgrid-comments-title">${esc(__('Lo que dijo la gente'))}${comments.length ? ` <span class="cgrid-comments-n">${esc(__('{n} comentarios leídos', { n: comments.length }))}</span>` : ''}</div>
          ${topComments.map((c) => `
            <div class="cgrid-comment${c.sentiment ? ` is-${esc(SENT[String(c.sentiment).toUpperCase()] || 'neu')}` : ''}">
              <span class="cgrid-comment-who">@${esc(String(c.author_handle || '').replace(/^@+/, ''))}</span>
              <span class="cgrid-comment-txt">${esc(String(c.content || '').slice(0, 180))}</span>
              ${c._l > 0 ? `<span class="cgrid-comment-likes">♥ ${esc(C(c._l))}</span>` : ''}
            </div>`).join('')}
        </div>` : '';

      const media = this._cgridMediaHtml(win.media_assets, { network: net, postId: win.post_id, postUrl: url });
      const copyHtml = copy ? `
        <details class="cgrid-post-copy-box">
          <summary class="cgrid-post-copy-sum">
            <span class="cgrid-post-copy-peek">${esc(copy.replace(/\s+/g, ' ').slice(0, 90))}${copy.length > 90 ? '…' : ''}</span>
            <i class="aisc-ico aisc-ico--chevron-down" aria-hidden="true"></i>
          </summary>
          <p class="cgrid-post-copy">${esc(copy)}</p>
        </details>` : '';

      /* El PORQUE de Vera, debajo del copy. El numero dice CUAL gano; esto dice
         por que gano — quienes salen, de que trata, como esta hecha y a quien le
         hablaba. Va pegado al post (brand_posts.vera_por_que) y no al periodo,
         porque este ranking se recalcula en vivo: atarlo al periodo acabaria
         mostrando el analisis de una pieza debajo de otra. */
      const porQue = win.vera_por_que && win.vera_por_que.texto ? String(win.vera_por_que.texto) : '';
      const porQueHtml = porQue ? `
        <div class="cgrid-porque">
          <div class="cgrid-porque-title">${esc(__('¿Por qué funcionó?'))}</div>
          <p class="cgrid-porque-txt">${esc(porQue)}</p>
        </div>` : '';

      // La publicacion incrustada YA muestra de quien es, sus cifras y el
      // enlace a la red. Debajo va solo lo que el embed no da: el copy completo
      // colapsado, el porque de Vera y los comentarios cosechados.
      host.innerHTML = `
        <article class="cgrid-post-card">
          ${media}
          ${copyHtml}
          ${porQueHtml}
          ${commentsHtml}
        </article>`;

      this._bindCgridMediaFallback(host);
      this._bindCgridCarrusel(host);
      this._bindCgridEmbeds(host);
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

      // Etiquetas en lenguaje de negocio: quien lee esto decide presupuesto, no
      // interpreta cuadrantes. "Desperdicio" no le dice a nadie qué hacer.
      const QUAD = {
        estrella:    { label: __('Apuesta ganadora'), cls: 'is-star' },
        sostenido:   { label: __('En línea'),         cls: 'is-tail' },
        desperdicio: { label: __('No te rinde'),      cls: 'is-waste' },
        olvidado:    { label: __('Oportunidad'),      cls: 'is-forgotten' },
        secundario:  { label: __('Secundario'),       cls: 'is-tail' },
        cola:        { label: __('Sin tracción'),     cls: 'is-tail' },
        ausente:     { label: __('Sin publicar'),     cls: 'is-tail' },
      };
      // Carátulas: el catálogo se hojea como una pila de portadas. El frente es
      // el producto que MÁS empujas (el RPC ordena por presencia); detrás, en
      // profundidad, el resto — de más a menos publicado. La foto deja de ser un
      // fondo recortado y pasa a ser la pieza, cada una en su propio marco.
      const cards = productos.map((prod, i) => {
        const media = prod.imagen_url
          ? `<img src="${esc(prod.imagen_url)}" alt="" loading="lazy" data-prodstar-fit="1">`
          : `<span class="pdeck-card-empty" aria-hidden="true"></span>`;
        return `<button type="button" class="pdeck-card" data-i="${i}" tabindex="-1" aria-label="${esc(prod.producto)}">
            ${media}
            <span class="pdeck-card-veil" aria-hidden="true"></span>
          </button>`;
      }).join('');
      // Cada línea del bloque es una FAMILIA (Crema de Maní agrupa Crunchy,
      // Natural, con Arequipe…), pero la carátula es la foto de UNA variante:
      // hay que decir cuál o parece que el nombre no corresponde a la imagen.

      const dots = productos.map((prod, i) => `
        <button type="button" class="pdeck-dot" data-i="${i}" aria-label="${esc(prod.producto)}"></button>`).join('');

      const deckHtml = `
        <div class="pdeck" data-active="0">
          <div class="pdeck-stage">${cards}</div>
          <div class="pdeck-info" aria-live="polite"></div>
          <nav class="pdeck-dots" aria-label="${esc(__('Productos'))}">${dots}</nav>
        </div>`;

      hosts.forEach((h) => {
        const l = h.querySelector('.vera-prodstar-load');
        if (l) l.remove();
        h.insertAdjacentHTML('beforeend', deckHtml);
        const deck = h.querySelector('.pdeck');
        deck._productos = productos;
        deck._quad = QUAD;
        h.querySelectorAll('[data-prodstar-fit]').forEach((el) => this._prodstarFitStage(el));
        this._prodDeckBind(deck);
        this._prodDeckGoTo(deck, 0);
      });
    },

    /* La foto entra con fade cuando termina de cargar (el hueco ya está
       reservado por el marco, así que no hay salto de layout). */
    _prodstarFitStage(img) {
      const apply = () => { img.classList.add('is-loaded'); };
      if (img.complete) apply();
      else {
        img.addEventListener('load', apply, { once: true });
        img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true });
      }
    },

    _prodDeckBind(deck) {
      if (!deck || deck.dataset.bound === '1') return;
      deck.dataset.bound = '1';
      deck.addEventListener('click', (e) => {
        const dr = e.target.closest('[data-drill]');
        if (dr) {
          const act = Number(deck.dataset.active || 0);
          this._openProductoEvidencia((deck._productos || [])[act], dr.dataset.drill, deck._quad);
          return;
        }
        const el = e.target.closest('[data-i]');
        if (!el) return;
        this._prodDeckGoTo(deck, Number(el.dataset.i));
      });
      // Teclado: el deck es un solo tab-stop y las flechas hojean (las carátulas
      // llevan tabindex -1 para no meter N paradas en el recorrido).
      deck.tabIndex = 0;
      deck.addEventListener('keydown', (e) => {
        const n = (deck._productos || []).length;
        if (!n) return;
        const cur = Number(deck.dataset.active || 0);
        if (e.key === 'ArrowRight') { e.preventDefault(); this._prodDeckGoTo(deck, (cur + 1) % n); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); this._prodDeckGoTo(deck, (cur - 1 + n) % n); }
      });
    },

    /* Coloca la pila: distancia 0 = al frente; el resto retrocede hacia la
       izquierda con escala, desenfoque y opacidad decrecientes. El orden es
       circular, así que hojear siempre tiene a dónde ir. */
    _prodDeckGoTo(deck, active) {
      if (!deck) return;
      const productos = deck._productos || [];
      const n = productos.length;
      if (!n) return;
      const act = ((active % n) + n) % n;
      deck.dataset.active = String(act);
      deck.querySelectorAll('.pdeck-card').forEach((card, i) => {
        const d = (i - act + n) % n;              // distancia hacia atrás en la pila
        card.style.setProperty('--d', String(d));
        card.style.zIndex = String(100 - d);
        card.classList.toggle('is-front', d === 0);
        card.setAttribute('aria-current', d === 0 ? 'true' : 'false');
      });
      deck.querySelectorAll('.pdeck-dot').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === act);
      });
      const info = deck.querySelector('.pdeck-info');
      if (info) info.innerHTML = this._prodDeckInfoHtml(productos[act], deck._quad);
    },

    _prodDeckInfoHtml(prod, QUAD) {
      if (!prod) return '';
      const esc = (s) => this._esc(s);
      // Cada cifra abre la evidencia que la sustenta: un numero sin poder ver
      // de donde sale es un numero que nadie audita — y que nadie cree.
      const drill = (k) => ` data-drill="${k}" role="button" tabindex="0" title="${esc(__('Ver de dónde sale'))}"`;
      const q = (QUAD && (QUAD[prod.cuadrante] || QUAD.cola)) || { label: '', cls: 'is-tail' };
      const dias = (prod.dias_sin_mencion == null) ? null : Number(prod.dias_sin_mencion);
      const desde = (dias == null) ? __('Nunca lo has publicado')
        : (dias <= 0 ? __('Lo publicaste hoy') : __('Hace {n} días que no lo nombras', { n: dias }));
      const sig = (v, l, k) => `<div class="pdeck-sig${k ? ' is-drill' : ''}"${k ? drill(k) : ''}><span>${esc(String(v))}</span><small>${esc(l)}</small></div>`;
      // La foto es de una variante concreta: se dice cuál cuando no coincide con
      // el nombre de la familia.
      const foto = (prod.imagen_producto && prod.imagen_producto !== prod.producto) ? prod.imagen_producto : null;
      // La etiqueta sin su razon es un veredicto sin argumento: se dice cuanto
      // rinde este producto frente al contenido tipico de la marca.
      const idx = Number(prod.indice_vs_marca);
      const veredicto = (!isFinite(idx) || !idx) ? null
        : idx >= 1.15 ? __('Rinde {x}x lo que rinde tu contenido típico', { x: idx.toFixed(1) })
        : idx <= 0.85 ? __('Rinde {p}% de lo que rinde tu contenido típico', { p: Math.round(idx * 100) })
        : __('Rinde como tu contenido típico');
      return `
        <span class="vera-prodstar-badge ${q.cls}">${esc(q.label)}</span>
        <h4 class="pdeck-name">${esc(prod.producto)}</h4>
        <p class="pdeck-sub">${esc(desde)}${Number(prod.n_productos) > 1 ? ' · ' + esc(__('{n} variantes', { n: prod.n_productos })) : ''}</p>
        <div class="pdeck-sigs">
          ${sig(prod.engagement_promedio != null ? prod.engagement_promedio : 0, __('interacción media'), 'interacciones')}
          ${sig(prod.menciones_publico != null ? prod.menciones_publico : 0, __('lo nombra el público'), 'menciones')}
        </div>
        <div class="pdeck-score">
          <strong>${esc(String(prod.share_of_voice_pct != null ? prod.share_of_voice_pct : 0))}</strong><small>%</small>
        </div>
        <div class="pdeck-score-label">${esc(__('de lo que hablas de producto'))}</div>
        ${veredicto ? `<p class="pdeck-porque">${esc(veredicto)}</p>` : ''}
        <p class="pdeck-foot">
          <span class="pdeck-link"${drill('publicaciones')}>${esc(__('{n} publicaciones', { n: prod.posts != null ? prod.posts : 0 }))}</span>
          ${prod.pct_contenido_total != null ? ' · ' + esc(__('{p}% de todo tu contenido', { p: prod.pct_contenido_total })) : ''}
          ${' · '}<span class="pdeck-link"${drill('publicaciones')}>${esc(__('ver la evidencia'))}</span>
          ${foto ? `<br>${esc(__('En la foto: {v}', { v: foto }))}` : ''}
        </p>`;
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
          // Dentro de un panel del color de la marca, el acento de marca se
          // volveria invisible: el chart se dibuja con la tinta del panel.
          const enPanel = canvas.closest('[data-panel-marca][data-fondo]');
          const tinta = enPanel ? (enPanel.dataset.fondo === 'claro' ? [17, 14, 10] : [255, 255, 255]) : null;
          const kind = ['bar', 'line', 'donut', 'area'].includes(b.kind) ? b.kind : 'bar';
          const labels = Array.isArray(b.labels) ? b.labels : [];
          const series = Array.isArray(b.series) ? b.series : [];
          const yFmt = (v) => b.format === 'percent' ? v + '%' : v;
          const [cr, cg, cb] = tinta || [r, g, bl];
          const paleta = tinta ? [0.92, 0.6, 0.38, 0.24, 0.15].map((a) => `rgba(${cr},${cg},${cb},${a})`) : palette;
          const tick = tinta ? `rgba(${cr},${cg},${cb},0.62)` : TICK;
          const grid = tinta ? `rgba(${cr},${cg},${cb},0.14)` : GRID;
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
    /* ══ El mapa por país ═════════════════════════════════════════════════
       El contrato admite ISO-2 o ISO-3 y el pintor traduce. Hasta hoy solo
       traducía el de TRES letras: con "CO" no había match, los 195 países
       quedaban en 0, y una escala donde todos los valores son iguales pinta el
       mundo entero del color de la marca. El mapa decía justo lo contrario del
       dato — "estás en todas partes" cuando el 83% está en Colombia.
       De ahí las tres reglas de abajo: se traducen los dos códigos, la escala
       se ancla a 0 en vez de dejar que la normalice sola, y si NINGÚN país casa
       no se pinta un mapa falso: se cae a las barras. ══════════════════════ */

    // ISO-2 / ISO-3 → id numérico del topojson, en una sola tabla para que los
    // dos códigos no puedan divergir.
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
      if (/^\d+$/.test(c)) return String(Number(c)).padStart(3, '0');   // ya venía numérico
      return BrandGridGeo.mapa[c] || null;
    },

    /* Traduce el bloque a lo que necesita el mapa. Fuera del pintor porque esto
       —y no el dibujo— es donde estaba el fallo, y así se puede probar. */
    _geoDatos(block) {
      const filas = Array.isArray(block && block.data) ? block.data : [];
      const crudos = filas.map((d) => Number(d && d.value) || 0);
      const maxCrudo = Math.max(0, ...crudos);
      // Vera manda fracciones (0.834) o porcentajes (83.4). Se normaliza a % una
      // sola vez: si el mayor no pasa de 1, era fracción.
      const aPct = (v) => (maxCrudo > 0 && maxCrudo <= 1 ? v * 100 : v);
      const valPorNum = {}, nombrePorNum = {}, sinMapear = [];
      filas.forEach((d) => {
        const num = this._geoNumPorCodigo(d && d.code);
        if (!num) { sinMapear.push((d && d.code) || '?'); return; }
        valPorNum[num] = aPct(Number(d.value) || 0);
        nombrePorNum[num] = (d && d.name) || (d && d.code) || '';
      });
      const pcts = Object.values(valPorNum);
      return {
        valPorNum, nombrePorNum, sinMapear,
        maxPct: pcts.length ? Math.max(...pcts) : 0,
        mapeados: pcts.length,
      };
    },

    async _paintChoropleth(canvas, block, fbEl) {
      try {
        await this._ensureGeoChart();
        const G = window.ChartGeo, Chart = window.Chart;
        if (!G || !this._geoTopo || !G.topojson) throw new Error('geo-unavailable');
        const topo = this._geoTopo;
        const features = G.topojson.feature(topo, topo.objects.countries).features;
        const { valPorNum, nombrePorNum, sinMapear, maxPct, mapeados } = this._geoDatos(block);
        // Ni un país reconocido = no hay mapa que pintar. Antes se pintaba igual
        // y salía el planeta entero encendido.
        if (!mapeados) throw new Error('sin-paises-mapeados');
        if (sinMapear.length) console.warn('[BrandGrid] choropleth: códigos sin mapear ->', sinMapear.join(', '));
        const [accent] = this._gridBrandHexes();
        const [r, g, bl] = this._hexToRgb(accent);
        const data = features.map((f) => {
          const num = String(f.id).padStart(3, '0');
          return { feature: f, value: valPorNum[num] != null ? valPorNum[num] : 0 };
        });
        this._reg(new Chart(canvas, {
          type: 'choropleth',
          data: { labels: features.map((f) => f.properties && f.properties.name), datasets: [{ label: '', outline: features, data, borderColor: 'rgba(255,255,255,0.06)', borderWidth: 0.4 }] },
          options: {
            responsive: true, maintainAspectRatio: false, showOutline: true, showGraticule: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                // Sin dato no hay porcentaje que enseñar: se dice que no lo hay.
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
              // El dominio se fija a mano. Dejando que lo deduzca de los datos,
              // un conjunto donde todos valen lo mismo (o todos 0) degenera y
              // devuelve el tope para TODOS: el mundo entero encendido.
              color: {
                axis: 'x', display: false, min: 0, max: maxPct || 1,
                interpolate: (v) => {
                  const t = Math.max(0, Math.min(1, Number(v) || 0));
                  // Los países sin audiencia se quedan en el fondo, no en un
                  // tono claro de la marca: ausencia no es "poquito".
                  if (t <= 0) return 'rgba(255,255,255,0.05)';
                  return `rgba(${r},${g},${bl},${(0.18 + 0.80 * t).toFixed(3)})`;
                },
              },
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
      // Misma normalización que el mapa: 0.834 y 83.4 son el mismo dato, y aquí
      // se leía crudo — "0.834%" donde debía decir "83.4%".
      const crudos = rows.map((r) => Number(r.value) || 0);
      const maxCrudo = Math.max(0, ...crudos);
      const aPct = (v) => (maxCrudo > 0 && maxCrudo <= 1 ? v * 100 : v);
      const max = Math.max(1, ...crudos.map(aPct));
      const [accent] = this._gridBrandHexes();
      return `<div class="vera-geo-bars">${rows.map((r) => {
        const pct = aPct(Number(r.value) || 0);
        return `
        <div class="vera-geo-row">
          <span class="vera-geo-name">${this._esc(r.name || r.code || '')}</span>
          <div class="vera-geo-track"><div class="vera-geo-fill" style="width:${Math.round(pct / max * 100)}%;background:${this._esc(accent)}"></div></div>
          <span class="vera-geo-val">${Math.round(pct * 10) / 10}%</span>
        </div>`;
      }).join('')}</div>`;
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
      // Registrado via BaseView para que muera con la vista; ademas se auto-quita
      // al cerrar el modal (no deja un keydown vivo por cada apertura).
      const onEsc = (ev) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
      this.addEventListener(document, 'keydown', onEsc);
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

    /* Luminancia relativa (WCAG) del color de marca: decide si sobre él va tinta
       oscura o clara. Sin esto, una marca con color claro (amarillo, lima,
       celeste) se queda con texto blanco ilegible sobre su propio color. */
    _esColorClaro(hex) {
      try {
        const [r, g, b] = this._hexToRgb(hex);
        const lin = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
        return (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)) > 0.42;
      } catch (_) { return false; }
    },

    /* Pinta un panel con el color de la marca y le deja resuelto el juego de
       tintas en variables, para que el CSS no tenga que saber de luminancias. */
    _vestirPanelDeMarca(el, hexOverride) {
      if (!el) return;
      // hexOverride: para quien ya resolvio el color por una via mejor (ej.
      // CompGrid lo lee de brand_colors, no de las CSS vars).
      const accent = hexOverride || this._gridBrandHexes()[0];
      const claro = this._esColorClaro(accent);
      const tinta = claro ? '17, 14, 10' : '255, 255, 255';
      el.dataset.fondo = claro ? 'claro' : 'oscuro';
      el.style.setProperty('--panel-bg', accent);
      el.style.setProperty('--panel-fg', `rgb(${tinta})`);
      el.style.setProperty('--panel-fg-soft', `rgba(${tinta}, 0.72)`);
      el.style.setProperty('--panel-fg-faint', `rgba(${tinta}, 0.5)`);
      el.style.setProperty('--panel-linea', `rgba(${tinta}, 0.16)`);
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
      // Registrado via BaseView para que muera con la vista; ademas se auto-quita
      // al cerrar el modal (no deja un keydown vivo por cada apertura).
      const onEsc = (ev) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
      this.addEventListener(document, 'keydown', onEsc);
    },
  });
})();
