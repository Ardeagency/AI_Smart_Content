/**
 * DashboardView — CompGrid mixin (tab "Competencia", rediseño 2026-07).
 *
 * Reemplaza el cuerpo vacío del tab por un GRID de cards, mismo lenguaje visual
 * que Mi Marca (glass-black sobre el degradado de marca). Cards iniciales:
 *   1. Influencia digital  — barras por perfil COMPETIDOR: cuánta conversación
 *      genera cada uno en el periodo (interacciones reales, no reproducciones).
 *   2. La publicación que más movió — preview del post ganador del periodo:
 *      media (si sigue disponible), copy, métricas y comentarios reales.
 *
 * QUIÉN ENTRA: solo `competidor_directo` y `competidor_indirecto`. Las
 * `referencia_cultural` y `owned_media` NO son competencia y se descartan —
 * comparar tu influencia contra un referente cultural (Nike, un medio) no dice
 * nada del campo de batalla.
 *
 * DATOS (RPCs existentes, cero SQL nuevo):
 *   - dashboard_competencia_top        → agregado por entidad (posts, engagement, followers)
 *   - dashboard_competencia_top_posts  → posts rankeados del periodo
 *   - brand_posts / brand_post_comments (lectura directa) → media, copy y comentarios
 *
 * INTERACCIÓN ≠ REPRODUCCIÓN: el ranking usa likes+comentarios+compartidos+
 * guardados (+ retweets/quotes/bookmarks en X). Las vistas y reproducciones se
 * MUESTRAN, pero no ordenan: son alcance pasivo, no respuesta del público.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const WINDOWS = [
    { k: 'week',  days: 7,   label: () => __('Semana') },
    { k: 'month', days: 30,  label: () => __('Mes') },
    { k: 'year',  days: 365, label: () => __('Año') },
    { k: 'all',   days: null, label: () => __('Todo') },
  ];

  const NET_LABEL = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    x: 'X', twitter: 'X', youtube: 'YouTube', linkedin: 'LinkedIn',
  };

  const TIPO_LABEL = {
    competidor_directo:   () => __('Directo'),
    competidor_indirecto: () => __('Indirecto'),
  };

  // Plataforma → icono (Font Awesome, ya cargado globalmente). Misma tabla que
  // MonitoringView.PLATFORM_ICON: la red se identifica por su icono, nunca
  // repitiéndola en el nombre del perfil.
  const PLATFORM_ICON = {
    instagram: 'fab fa-instagram',
    facebook:  'fab fa-facebook',
    tiktok:    'fab fa-tiktok',
    youtube:   'fab fa-youtube',
    twitter:   'fab fa-x-twitter',
    x:         'fab fa-x-twitter',
    linkedin:  'fab fa-linkedin-in',
  };

  // Solo estos tipos son COMPETENCIA. El resto de perfiles monitoreados
  // (referentes culturales, medios propios) no compiten por el mismo cliente.
  const COMPETIDOR_TIPOS = ['competidor_directo', 'competidor_indirecto'];

  // ¿Se incrusta el reproductor de la red dentro de la card?
  // TikTok: DESACTIVADO (decisión del equipo, 2026-07-22). Su reproductor
  // impone un alto enorme —vertical más su propio footer— y al terminar deja
  // en pantalla contenido de otras marcas. Mientras esté en false, sus posts
  // muestran la portada y el play lleva a la publicación original.
  // Reactivar = poner true; el resto del camino sigue montado.
  const EMBED_HABILITADO = { tiktok: false, youtube: true };

  // Claves de metrics que SON interacción (respuesta del público).
  const INTERACTION_KEYS = ['likes', 'comments', 'shares', 'saves', 'reposts', 'retweets', 'quotes', 'bookmarks', 'replies'];
  // Claves que son ALCANCE (se muestran aparte, nunca suman al ranking).
  const REACH_KEYS = ['plays', 'views', 'video_view_count'];

  Object.assign(DashboardView.prototype, {

    /* ── Entry point del grid de Competencia ── */
    async _renderCompGrid(body) {
      if (!body) return true;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return true; }
      if (this._cgridWindow == null) this._cgridWindow = 'month';
      // Por defecto la lectura NORMALIZADA: en impacto absoluto, una marca que
      // mueve 50x mas aplasta a las demas contra el suelo del eje y el desglose
      // por red se vuelve ilegible. "Por cada 1.000 seguidores" las pone en
      // rango comparable — y es lo que de verdad mide influencia, no tamano.
      if (this._cgridMetric == null) this._cgridMetric = 'per1k';

      if (!body.querySelector('.cgrid')) {
        body.innerHTML = this._buildCompGridShell();
        this._bindCompGrid(body);
      }
      await this._cgridLoadAndPaint(body);
      return true;
    },

    _buildCompGridShell() {
      const seg = WINDOWS.map((w) => `
        <button type="button" class="bgrid-seg-btn${w.k === this._cgridWindow ? ' is-active' : ''}" data-cwindow="${w.k}" role="tab">${this._esc(w.label())}</button>`).join('');
      return `
        <div class="cgrid">
          <div class="cgrid-col">
          <section class="bgrid-card glass-black cgrid-card--influencia">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--chart-bar" aria-hidden="true"></i>${this._esc(__('Influencia digital'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('Cuánta conversación genera cada competidor y en qué red la genera · toca una barra para ver todo lo recolectado'))}</p>
            <div class="cgrid-controls">
              <nav class="bgrid-seg" role="tablist" aria-label="${this._esc(__('Periodo'))}">${seg}</nav>
              <nav class="bgrid-seg bgrid-seg--metric" role="tablist" aria-label="${this._esc(__('Medida'))}">
                <button type="button" class="bgrid-seg-btn${this._cgridMetric === 'per1k' ? ' is-active' : ''}" data-cmetric="per1k" role="tab" title="${this._esc(__('Interacciones por cada 1.000 seguidores — comparable entre marcas de distinto tamaño'))}">${this._esc(__('Por audiencia'))}</button>
                <button type="button" class="bgrid-seg-btn${this._cgridMetric === 'total' ? ' is-active' : ''}" data-cmetric="total" role="tab" title="${this._esc(__('Interacciones totales del periodo'))}">${this._esc(__('Total'))}</button>
              </nav>
            </div>
            <div class="cgrid-bars" id="cgridBars"><div class="cgrid-load">${this._esc(__('Cargando perfiles…'))}</div></div>
            <footer class="bgrid-card-foot" id="cgridBarsFoot"></footer>
          </section>
          <!-- Lectura de Vera perfil por perfil. La escribe ella en su sesión
               de dashboard (vera_dashboard_readings, scope monitoreo); aquí
               solo se pinta. -->
          <section class="bgrid-card cgrid-card--perfiles" id="cgridPerfilesCard" hidden>
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--eye" aria-hidden="true"></i>${this._esc(__('Qué hace cada perfil'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('Lo que Vera aprendió de cada uno: sus temas, su tono y qué te llevas de ahí'))}</p>
            <div class="cgrid-perfiles" id="cgridPerfiles"></div>
          </section>
          </div>
          <!-- Columna derecha. Sin envolver, Observaciones caía en la siguiente
               fila del grid — es decir, bajo "Qué hace cada perfil" — en vez de
               debajo de la publicación destacada. -->
          <div class="cgrid-col">
          <!-- Publicación destacada: SIN superficie — flota sobre el degradado
               y deja que el contenido del rival hable solo. Solo título, sin
               descripción: el contenido se explica a sí mismo. -->
          <section class="bgrid-card glass-black cgrid-card--toppost">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${this._esc(__('Publicación con mayor Tráfico'))}</span>
            </header>
            <div class="cgrid-post" id="cgridTopPost"><div class="cgrid-load">${this._esc(__('Buscando la publicación…'))}</div></div>
          </section>
          <!-- Observaciones por perfil. Antes las armaba una RPC con reglas fijas;
               ahora las escribe Vera en su lectura de Competencia. -->
          <section class="bgrid-card cgrid-card--obs" id="cgridObsCard" hidden>
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--eye" aria-hidden="true"></i>${this._esc(__('Observaciones'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('Lo más destacado de cada perfil en este periodo'))}</p>
            <div class="cgrid-obs" id="cgridObs"></div>
          </section>
          </div>
        </div>`;
    },

    _bindCompGrid(body) {
      if (body.dataset.cgridBound === '1') return;
      body.dataset.cgridBound = '1';
      body.addEventListener('click', (e) => {
        // El drill-down por marca lo maneja el onClick del chart (Chart.js
        // resuelve qué columna se tocó); aquí solo van los filtros.
        const mb = e.target.closest('[data-cmetric]');
        if (mb) {
          const m = mb.dataset.cmetric;
          if (!m || m === this._cgridMetric) return;
          this._cgridMetric = m;
          body.querySelectorAll('[data-cmetric]').forEach((x) => x.classList.toggle('is-active', x.dataset.cmetric === m));
          // Cambiar de medida no cambia los datos: solo se repinta el chart.
          if (this._cgridLastData) this._paintInfluenceBars(body, this._cgridLastData);
          return;
        }
        const btn = e.target.closest('[data-cwindow]');
        if (!btn) return;
        const k = btn.dataset.cwindow;
        if (!k || k === this._cgridWindow) return;
        this._cgridWindow = k;
        // Solo los botones de PERIODO: ambos segmentados comparten
        // .bgrid-seg-btn, y un selector por clase apagaría también el de medida.
        body.querySelectorAll('[data-cwindow]').forEach((b) => b.classList.toggle('is-active', b.dataset.cwindow === k));
        this._cgridLoadAndPaint(body);
      });
    },

    _cgridWindowDays() {
      return (WINDOWS.find((w) => w.k === this._cgridWindow) || WINDOWS[1]).days;
    },

    /* Interacción real de un post: suma de las claves que son RESPUESTA del
       público. engagement_total sirve de piso (no siempre incluye guardados). */
    _cgridInteractions(row) {
      const m = (row && row.metrics) || {};
      let sum = 0;
      INTERACTION_KEYS.forEach((k) => { sum += Number(m[k]) || 0; });
      return Math.max(sum, Number(row && row.engagement_total) || 0);
    },

    _cgridReach(row) {
      const m = (row && row.metrics) || {};
      return REACH_KEYS.reduce((mx, k) => Math.max(mx, Number(m[k]) || 0), 0);
    },

    /* MARCAS competidoras de la org (cacheado). `dashboard_competencia_marcas`
       unifica los perfiles multi-plataforma de un mismo actor en UNA marca
       (por nombre, handle o sitio web, transitivamente) y ya filtra por tipo:
       las referencias culturales y los medios propios no entran. */
    async _cgridBrands(dateFrom, dateTo) {
      const { data } = await Promise.resolve(this._supabase.rpc('dashboard_competencia_marcas', {
        p_org_id: this._orgId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_tipos: COMPETIDOR_TIPOS,
        p_limit: 50,
      })).catch(() => ({ data: null }));
      return Array.isArray(data) ? data : [];
    },

    /* Todos los entity_id competidores, para acotar la búsqueda del post
       ganador. Se resuelve una vez sobre el histórico completo. */
    async _cgridEntityIds() {
      if (this._cgridEntities) return this._cgridEntities;
      const brands = await this._cgridBrands(
        new Date('2015-01-01').toISOString(), new Date().toISOString());
      this._cgridEntities = brands.flatMap((b) => (Array.isArray(b.entity_ids) ? b.entity_ids : []));
      return this._cgridEntities;
    },

    /** Fecha del último post capturado de la competencia: ancla las ventanas.
        Sin ancla, "Semana" sale vacía si el scraper lleva días sin correr. */
    async _cgridLastPost(ids) {
      try {
        if (!ids.length) return null;
        const { data } = await this._supabase.from('brand_posts')
          .select('captured_at').in('entity_id', ids).eq('is_competitor', true)
          .order('captured_at', { ascending: false }).limit(1);
        return (data && data[0] && data[0].captured_at) ? new Date(data[0].captured_at) : null;
      } catch (_) { return null; }
    },

    async _loadCompGridData() {
      const ids = await this._cgridEntityIds();
      if (!ids.length) return { ids: [], brands: [], posts: [] };

      const days = this._cgridWindowDays();
      const now = new Date();
      const last = await this._cgridLastPost(ids);
      const anchor = (last && last < now) ? last : now;
      const dateTo = anchor.toISOString();
      const dateFrom = (days == null ? new Date('2015-01-01') : new Date(anchor.getTime() - days * 86400000)).toISOString();
      const call = (fn, params) => Promise.resolve(this._supabase.rpc(fn, params)).catch(() => ({ data: null }));
      const [brands, ps] = await Promise.all([
        this._cgridBrands(dateFrom, dateTo),
        call('dashboard_competencia_top_posts', {
          p_org_id: this._orgId, p_date_from: dateFrom, p_date_to: dateTo,
          p_entity_ids: ids, p_limit: 25,
        }),
      ]);
      // El rango se guarda: el panel de detalle debe abrirse sobre EXACTAMENTE
      // la misma ventana que se está viendo en la barra.
      this._cgridRange = { from: dateFrom, to: dateTo };
      return { ids, brands, posts: Array.isArray(ps?.data) ? ps.data : [] };
    },

    async _cgridLoadAndPaint(body) {
      let data;
      try { data = await this._loadCompGridData(); }
      catch (e) { console.warn('[CompGrid] load failed:', e); return; }
      this._cgridData = data;
      this._cgridLastData = data;   // el toggle de medida repinta sin recargar
      await this._paintInfluenceBars(body, data);
      this._paintVeraPerfiles(body);
      this._paintTopPost(body, data);
    },

    /* ══ Card 1: Influencia digital ═════════════════════════════════════════
       Barra = interacciones generadas en el periodo (lo que de verdad movió),
       no seguidores: un perfil grande y callado no manda en la conversación.
       Bajo cada barra, el contexto que evita la lectura ingenua: por post,
       cuántos posts, y el tamaño de su audiencia. ═══════════════════════ */
    async _paintInfluenceBars(body, data) {
      const host = body.querySelector('#cgridBars');
      if (!host) return;
      const esc = (s) => this._esc(s);

      if (!data.ids.length) {
        host.innerHTML = `<div class="cgrid-empty">${esc(__('Aún no monitoreas competidores. Agrégalos en Monitoreo para ver quién manda en tu nicho.'))}</div>`;
        return;
      }
      // Una fila por MARCA, no por perfil: la RPC ya unificó los canales de un
      // mismo actor (Instagram + TikTok + Facebook de Paranice = una barra).
      const rows = (data.brands || [])
        .map((r) => ({
          key: r.brand_key,
          entityIds: Array.isArray(r.entity_ids) ? r.entity_ids : [],
          name: r.brand_name || '—',
          tipo: r.tipo || '',
          platforms: Array.isArray(r.platforms) ? r.platforms : [],
          profiles: Array.isArray(r.profiles) ? r.profiles : [],
          followers: Number(r.followers_total) || 0,
          posts: Number(r.total_posts) || 0,
          eng: Number(r.total_engagement) || 0,
          perPost: Number(r.avg_engagement_per_post) || 0,
          per1k: r.eng_per_1k_followers == null ? null : Number(r.eng_per_1k_followers),
          topPlatform: String(r.top_platform || '').toLowerCase(),
        }))
        .filter((r) => r.eng > 0)
        // El orden sigue a la medida activa: en "por audiencia" la que manda es
        // la que mas conversacion saca de su gente, no la mas grande.
        .sort((a, b) => (this._cgridMetric === 'per1k'
          ? (b.per1k || 0) - (a.per1k || 0)
          : b.eng - a.eng));

      if (!rows.length) {
        host.innerHTML = `<div class="cgrid-empty">${esc(__('Sin actividad capturada de tus competidores en este periodo. Prueba una ventana más amplia.'))}</div>`;
        return;
      }

      this._cgridRows = rows;
      const [accent] = this._gridBrandHexes();
      const [r, g, b] = this._hexToRgb(accent);
      const C = (n) => this._compactNum(n);

      // Un tono por PLATAFORMA, igual en todas las barras: si el tono dependiera
      // de la posición dentro de cada marca, el mismo color significaría redes
      // distintas en cada fila y la leyenda mentiría. El orden lo fija el
      // impacto agregado de la red en toda la card.
      const netTotals = {};
      rows.forEach((x) => x.profiles.forEach((p) => {
        const k = String(p.platform || '').toLowerCase();
        if (k) netTotals[k] = (netTotals[k] || 0) + (Number(p.engagement) || 0);
      }));
      const netOrder = Object.keys(netTotals).sort((a, c) => netTotals[c] - netTotals[a]);
      const ALPHAS = [0.95, 0.68, 0.45, 0.3, 0.2, 0.14];
      const netAlpha = (k) => {
        const i = netOrder.indexOf(String(k || '').toLowerCase());
        return ALPHAS[i] != null ? ALPHAS[i] : 0.12;
      };
      this._cgridNetColor = (k) => `rgba(${r},${g},${b},${netAlpha(k)})`;

      // Columnas verticales apiladas por red: una columna por marca, cada
      // segmento la red que aporta ese impacto. Mismo instrumento que Tráfico
      // en Mi Marca, pero el eje Y es impacto social en vez de publicaciones.
      host.innerHTML = `<div class="cgrid-chart-wrap"><canvas id="cgridInfluenceChart"></canvas></div>`;
      try { await this._ensureChartJs(); } catch (_) {}
      this._paintInfluenceChart(host, rows, netOrder);

      // Pie de la card: el contexto que las columnas no pueden llevar encima.
      const foot = body.querySelector('#cgridBarsFoot');
      if (foot) {
        const totPosts = rows.reduce((s, x) => s + x.posts, 0);
        const totEng = rows.reduce((s, x) => s + x.eng, 0);
        const leader = rows[0];
        // En modo normalizado, una marca sin seguidores conocidos sale en cero
        // y parecería muerta: se dice explícitamente en vez de dejarla mentir.
        const sinFol = this._cgridMetric === 'per1k'
          ? rows.filter((x) => !(x.followers > 0)).map((x) => x.name) : [];
        foot.innerHTML = `
          <span>${esc(__('{n} publicaciones', { n: totPosts }))}</span>
          <span class="bgrid-foot-sep">·</span>
          <span>${esc(__('{n} interacciones', { n: C(totEng) }))}</span>
          <span class="bgrid-foot-sep">·</span>
          <span>${esc(__('manda {b} en {p}', { b: leader.name, p: NET_LABEL[leader.topPlatform] || leader.topPlatform }))}</span>
          ${sinFol.length ? `<span class="cgrid-foot-warn">${esc(__('sin dato de seguidores: {l}', { l: sinFol.join(', ') }))}</span>` : ''}`;
      }
    },

    _paintInfluenceChart(host, rows, netOrder) {
      const Chart = window.Chart;
      const canvas = host.querySelector('#cgridInfluenceChart');
      if (!Chart || !canvas) return;
      const C = (n) => this._compactNum(Number(n) || 0);
      const per1k = this._cgridMetric === 'per1k';

      // Impacto de cada marca en cada red (0 si no está en esa red).
      const engRaw = (row, net) => {
        const p = row.profiles.find((x) => String(x.platform || '').toLowerCase() === net);
        return p ? (Number(p.engagement) || 0) : 0;
      };
      // Normalizado: cada segmento se divide entre los seguidores TOTALES de la
      // marca, no entre los de su red. Con denominador común los segmentos
      // siguen sumando el total normalizado de la marca — dividir cada red
      // entre su propia audiencia daría una pila que no suma nada real.
      const engOf = (row, net) => {
        const v = engRaw(row, net);
        if (!per1k) return v;
        return row.followers > 0 ? Math.round(v * 1000 / row.followers) : 0;
      };
      const datasets = netOrder.map((net) => ({
        label: NET_LABEL[net] || net,
        data: rows.map((x) => engOf(x, net)),
        backgroundColor: this._cgridNetColor(net),
        // Solo el segmento superior del apilado lleva las esquinas redondeadas,
        // para que la columna se lea como una sola pieza.
        borderRadius: (ctx) => {
          const val = Number(ctx.raw) || 0;
          if (val <= 0) return 0;
          const ch = ctx.chart;
          let topIdx = -1;
          for (let i = 0; i < ch.data.datasets.length; i++) {
            if (!ch.isDatasetVisible(i)) continue;
            if (Number(ch.data.datasets[i].data[ctx.dataIndex] || 0) > 0) topIdx = i;
          }
          return ctx.datasetIndex === topIdx ? { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 } : 0;
        },
        borderSkipped: false,
        maxBarThickness: 54,
        categoryPercentage: 0.62,
        barPercentage: 0.9,
        stack: 'impacto',
      }));

      const TICK = 'rgba(255,255,255,0.55)', GRID = 'rgba(255,255,255,0.06)';
      try { this._cgridChart?.destroy(); } catch (_) {}
      this._cgridChart = new Chart(canvas, {
        type: 'bar',
        data: { labels: rows.map((x) => x.name), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onClick: (evt, els) => {
            const idx = (els && els.length) ? els[0].index : null;
            if (idx != null && rows[idx]) this._openBrandPanel(rows[idx]);
          },
          onHover: (evt, els) => {
            if (evt.native && evt.native.target) {
              evt.native.target.style.cursor = (els && els.length) ? 'pointer' : 'default';
            }
          },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: TICK, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } },
            },
            tooltip: {
              backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1,
              titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)',
              footerColor: 'rgba(212,209,216,0.6)', padding: 10,
              callbacks: {
                // Una red con 0 en esa marca no aporta lectura: se omite.
                // En modo normalizado se muestra también el valor crudo, para
                // no perder de vista la magnitud real detrás del ratio.
                label: (c) => {
                  if (!(Number(c.raw) > 0)) return null;
                  const x = rows[c.dataIndex];
                  const net = netOrder[c.datasetIndex];
                  return per1k
                    ? `${c.dataset.label}: ${C(c.raw)} / 1k  (${C(engRaw(x, net))})`
                    : `${c.dataset.label}: ${C(c.raw)}`;
                },
                // El pie carga el contexto que no cabe en el eje.
                footer: (items) => {
                  const x = rows[items[0].dataIndex];
                  if (!x) return '';
                  const tipo = TIPO_LABEL[x.tipo] ? TIPO_LABEL[x.tipo]() : '';
                  const l = [];
                  if (tipo) l.push(__('Competidor {t}', { t: tipo.toLowerCase() }));
                  l.push(__('{n} en total · {p} publicaciones', { n: C(x.eng), p: x.posts }));
                  if (x.followers > 0) l.push(__('{n} seguidores', { n: C(x.followers) }));
                  else if (per1k) l.push(__('sin dato de seguidores en este periodo'));
                  l.push(__('toca para ver todo lo recolectado'));
                  return l.join('\n');
                },
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 12, weight: '600' }, maxRotation: 0, autoSkip: false } },
            y: {
              stacked: true, grid: { color: GRID }, border: { display: false }, beginAtZero: true,
              ticks: { color: TICK, font: { size: 10 }, maxTicksLimit: 5, callback: (v) => C(v) },
              title: {
                display: true,
                text: per1k ? __('interacciones por cada 1.000 seguidores') : __('interacciones'),
                color: 'rgba(255,255,255,0.4)', font: { size: 10 },
              },
            },
          },
        },
      });
    },

    /* ══ Qué hace cada perfil — la lectura de Vera ══════════════════════════
       Vera escribe, en su sesión de dashboard (scope `monitoreo`), un bloque
       `perfil_analisis` por cada perfil que estudió: sus temas, su tono, sus
       formatos y qué se lleva la marca de ahí. Aquí solo se agrupan en una
       tabla — el frontend no interpreta ni resume nada por su cuenta.
       Todo texto va ESCAPADO: Vera lee contenido de internet y su salida se
       trata como dato, nunca como markup. ══════════════════════════════════ */
    async _paintVeraPerfiles(body) {
      const card = body.querySelector('#cgridPerfilesCard');
      const host = body.querySelector('#cgridPerfiles');
      if (!card || !host) return;
      const esc = (s) => this._esc(s);

      let reading = null;
      try {
        const { data } = await this._supabase.from('vera_dashboard_readings')
          .select('reading, created_at')
          .eq('organization_id', this._orgId).eq('scope', 'monitoreo').eq('status', 'published')
          .order('created_at', { ascending: false }).limit(1);
        reading = (data && data[0]) || null;
      } catch (_) {}

      // Las dos cards viven de la MISMA lectura: se pinta aquí para no pedirla
      // dos veces a la base.
      this._paintVeraObservaciones(body, reading);

      // Color VIVO de la marca activa (el mismo del degradado del hero y de los
      // charts). Se expone como variable local para que el CSS lo use en el
      // velo de la superficie, los chips y los acentos: sin él la card queda
      // gris sobre gris y se apaga respecto del resto del tab.
      const [accent] = this._gridBrandHexes();
      const [ar, ag, ab] = this._hexToRgb(accent);
      card.style.setProperty('--cgp-accent', accent);
      card.style.setProperty('--cgp-accent-rgb', `${ar}, ${ag}, ${ab}`);

      const bloques = (reading?.reading?.narrative || [])
        .filter((b) => b && b.type === 'perfil_analisis' && b.perfil);
      if (!bloques.length) {
        // Sin lectura todavía: se dice qué falta, no se finge una tabla vacía.
        card.hidden = false;
        host.innerHTML = `<div class="cgrid-empty">${esc(
          reading
            ? __('Vera aún no ha estudiado los perfiles uno a uno. Aparecerán aquí en su próxima lectura de Competencia.')
            : __('Vera todavía no ha escrito su lectura de Competencia. Cuando la haga, aquí verás qué publica cada perfil, con qué tono y qué te llevas de ahí.'),
        )}</div>`;
        return;
      }
      card.hidden = false;

      const ROL = {
        competidor_directo:   { label: __('Directo'),   cls: 'is-dir' },
        competidor_indirecto: { label: __('Indirecto'), cls: 'is-ind' },
        competidor:           { label: __('Competidor'), cls: 'is-dir' },
        referente:            { label: __('Referente'), cls: 'is-ref' },
        referencia_cultural:  { label: __('Referente'), cls: 'is-ref' },
        aliado:               { label: __('Aliado'),    cls: 'is-ali' },
      };
      const chips = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;·]/))
        .map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5)
        .map((x) => `<span class="cgp-chip">${esc(x)}</span>`).join('');

      const filas = bloques.map((b) => {
        const rol = ROL[String(b.rol || '').toLowerCase()] || null;
        const nets = (Array.isArray(b.plataformas) ? b.plataformas : []).map((p) => {
          const k = String(p || '').toLowerCase();
          const ico = PLATFORM_ICON[k];
          return ico ? `<i class="${esc(ico)}" title="${esc(NET_LABEL[k] || k)}" aria-hidden="true"></i>` : '';
        }).join('');
        return `
          <tr>
            <td class="cgp-perfil">
              <span class="cgp-perfil-name">${esc(b.perfil)}</span>
              ${nets ? `<span class="cgp-perfil-nets">${nets}</span>` : ''}
              ${rol ? `<span class="cgp-rol ${rol.cls}">${esc(rol.label)}</span>` : ''}
            </td>
            <td>${chips(b.temas) || '<span class="cgp-na">—</span>'}</td>
            <td class="cgp-tono">${esc(b.tono || '—')}</td>
            <td class="cgp-aprend">${esc(b.aprendizaje || b.que_aprender || '—')}</td>
          </tr>`;
      }).join('');

      const cuando = reading?.created_at ? this._veraFmtDate(reading.created_at) : '';
      host.innerHTML = `
        <div class="cgp-table-wrap">
          <table class="cgp-table">
            <thead><tr>
              <th>${esc(__('Perfil'))}</th>
              <th>${esc(__('De qué habla'))}</th>
              <th>${esc(__('Tono'))}</th>
              <th>${esc(__('Qué te llevas'))}</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
        ${cuando ? `<div class="cgp-firma">${esc(__('Lectura de Vera · {d}', { d: cuando }))}</div>` : ''}`;
    },

    /* ══ Observaciones por perfil — también de la lectura de Vera ═══════════
       Lo más destacado de cada perfil en el periodo. Antes lo armaba una RPC
       con reglas fijas; ahora lo escribe Vera (bloques `observacion_perfil`).
       Se agrupan por ROL, como en la versión anterior: la prioridad de lectura
       es competidor directo → indirecto → referente → aliado. ═════════════ */
    _paintVeraObservaciones(body, reading) {
      const card = body.querySelector('#cgridObsCard');
      const host = body.querySelector('#cgridObs');
      if (!card || !host) return;
      const esc = (s) => this._esc(s);

      const obs = (reading?.reading?.narrative || [])
        .filter((b) => b && b.type === 'observacion_perfil' && b.perfil && b.observacion);
      if (!obs.length) { card.hidden = true; return; }
      card.hidden = false;

      // Un perfil puede tener VARIAS observaciones: ya no se agrupa por rol
      // (eso obligaba a una por perfil y enterraba lo urgente bajo el orden de
      // los roles). Manda la PRIORIDAD que asignó Vera; el rol queda como chip.
      const PRIO = { alta: 0, media: 1, baja: 2 };
      const orden = [...obs].sort((a, b) => {
        const pa = PRIO[String(a.prioridad || '').toLowerCase()] ?? 1;
        const pb = PRIO[String(b.prioridad || '').toLowerCase()] ?? 1;
        return pa - pb;
      });

      const SEV = {
        opportunity: { cls: 'is-opp',    label: __('Oportunidad') },
        threat:      { cls: 'is-threat', label: __('Amenaza') },
        warning:     { cls: 'is-warn',   label: __('Atención') },
        neutral:     { cls: 'is-neu',    label: __('Contexto') },
      };
      const ROL = {
        competidor_directo:   __('Directo'),
        competidor:           __('Directo'),
        competidor_indirecto: __('Indirecto'),
        referente:            __('Referente'),
        referencia_cultural:  __('Referente'),
        aliado:               __('Aliado'),
      };

      host.innerHTML = orden.map((o) => {
        const sev = SEV[String(o.severidad || '').toLowerCase()] || SEV.neutral;
        const rol = ROL[String(o.rol || '').toLowerCase()] || '';
        const prio = String(o.prioridad || '').toLowerCase();
        return `
          <article class="cgo-item ${esc(sev.cls)}">
            <div class="cgo-head">
              <span class="cgo-perfil">${esc(o.perfil)}</span>
              ${rol ? `<span class="cgo-rol">${esc(rol)}</span>` : ''}
              <span class="cgo-sev">${esc(sev.label)}</span>
              ${prio === 'alta' ? `<span class="cgo-prio">${esc(__('Prioridad alta'))}</span>` : ''}
            </div>
            ${o.titulo ? `<h4 class="cgo-titulo">${esc(o.titulo)}</h4>` : ''}
            <p class="cgo-txt">${esc(o.observacion)}</p>
          </article>`;
      }).join('');
    },

    /* ══ Panel de marca (drill-down de una barra) ═══════════════════════════
       Todo lo recolectado de ese competidor en la ventana activa: totales de
       interacción y alcance, desglose por red con su %, historial de actividad
       por día (barras apiladas por plataforma) y las publicaciones. ═══════ */
    async _openBrandPanel(row) {
      const esc = (s) => this._esc(s);
      const rng = this._cgridRange || {};
      const overlay = document.createElement('div');
      overlay.className = 'salud-overlay';
      overlay.innerHTML = `
        <div class="salud-modal cgrid-panel" role="dialog" aria-modal="true">
          <div class="salud-modal-head">
            <span class="salud-modal-title">${esc(row.name)}</span>
            <button type="button" class="salud-modal-close" aria-label="${esc(__('Cerrar'))}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
          </div>
          <div class="salud-modal-body" id="cgridPanelBody">
            <div class="cgrid-load">${esc(__('Reuniendo todo lo recolectado…'))}</div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      // El chart del panel NO se registra en _reg: el auto-refresh del tab
      // destruye los charts registrados y dejaría el canvas del panel en blanco
      // mientras el usuario lo tiene abierto. Ciclo de vida propio.
      const close = () => {
        try { this._cgpChart?.destroy(); } catch (_) {}
        this._cgpChart = null;
        overlay.remove();
      };
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.salud-modal-close')) close(); });
      // Registrado via BaseView para que muera con la vista; ademas se auto-quita
      // al cerrar el modal (no deja un keydown vivo por cada apertura).
      const onEsc = (ev) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
      this.addEventListener(document, 'keydown', onEsc);

      let d = null;
      try {
        const { data } = await this._supabase.rpc('dashboard_competencia_marca_detalle', {
          p_org_id: this._orgId,
          p_entity_ids: row.entityIds,
          p_date_from: rng.from,
          p_date_to: rng.to,
          p_post_limit: 24,
        });
        d = data || null;
      } catch (e) { console.warn('[CompGrid] detalle falló:', e); }

      const host = overlay.querySelector('#cgridPanelBody');
      if (!host) return;
      if (!d || !d.totals || !Number(d.totals.posts)) {
        host.innerHTML = `<div class="cgrid-empty">${esc(__('Sin publicaciones recolectadas de esta marca en el periodo.'))}</div>`;
        return;
      }
      host.innerHTML = this._brandPanelHtml(row, d);
      this._bindCgridMediaFallback(host);
      try { await this._ensureChartJs(); } catch (_) {}
      this._paintBrandDailyChart(host, d);
    },

    _brandPanelHtml(row, d) {
      const esc = (s) => this._esc(s);
      const C = (n) => this._compactNum(Number(n) || 0);
      const t = d.totals || {};
      const nets = Array.isArray(d.by_platform) ? d.by_platform : [];

      const stat = (v, label, hint) => (Number(v) > 0 || label === __('publicaciones'))
        ? `<div class="cgp-stat"><span class="cgp-stat-v">${esc(C(v))}</span><small>${esc(label)}</small>${hint ? `<em>${esc(hint)}</em>` : ''}</div>` : '';

      // Interacción y alcance en filas separadas: mezclarlas invita a sumar
      // reproducciones con likes, que no es la misma unidad.
      const statsHtml = `
        <div class="cgp-stats">
          ${stat(t.posts, __('publicaciones'))}
          ${stat(t.interacciones, __('interacciones'))}
          ${stat(t.likes, __('me gusta'))}
          ${stat(t.comments, __('comentarios'))}
          ${stat(t.saves, __('guardados'))}
          ${stat(t.shares, __('compartidos'))}
        </div>
        <div class="cgp-stats cgp-stats--reach">
          ${stat(t.plays, __('reproducciones'))}
          ${stat(t.views, __('visualizaciones'))}
          ${stat(t.comentarios_recolectados, __('comentarios leídos'), __('disponibles para analizar'))}
        </div>`;

      // Desglose por red: dónde vive su influencia y dónde solo hace ruido.
      const netsHtml = nets.length ? `
        <div class="cgp-block">
          <div class="cgp-block-title">${esc(__('Por plataforma'))}</div>
          <div class="cgp-nets">
            ${nets.map((n) => {
              const key = String(n.platform || '').toLowerCase();
              const ico = PLATFORM_ICON[key];
              const share = Number(n.share_pct) || 0;
              return `
                <div class="cgp-net">
                  <div class="cgp-net-head">
                    ${ico ? `<i class="${esc(ico)}" aria-hidden="true"></i>` : ''}
                    <span class="cgp-net-name">${esc(NET_LABEL[key] || key)}</span>
                    <span class="cgp-net-handle">${esc(String(n.handle || '').replace(/^@+/, '') ? '@' + String(n.handle).replace(/^@+/, '') : '')}</span>
                    <span class="cgp-net-share">${esc(String(share))}%</span>
                  </div>
                  <div class="cgrid-bar-track"><div class="cgrid-bar-fill" style="width:${Math.max(1, share)}%;background:${this._cgridNetColor ? this._cgridNetColor(key) : '#FF6A1A'}"></div></div>
                  <div class="cgp-net-sub">${esc([
                    __('{n} publicaciones', { n: n.posts }),
                    __('{n} interacciones', { n: C(n.interacciones) }),
                    Number(n.plays) > 0 ? __('{n} reproducciones', { n: C(n.plays) }) : null,
                  ].filter(Boolean).join(' · '))}</div>
                </div>`;
            }).join('')}
          </div>
        </div>` : '';

      const dailyHtml = `
        <div class="cgp-block">
          <div class="cgp-block-title">${esc(__('Historial de actividad'))}</div>
          <div class="cgp-chart-wrap"><canvas id="cgpDailyChart"></canvas></div>
        </div>`;

      const posts = Array.isArray(d.posts) ? d.posts : [];
      const postsHtml = posts.length ? `
        <div class="cgp-block">
          <div class="cgp-block-title">${esc(__('Publicaciones recolectadas'))} <span class="cgp-block-n">${esc(__('{n} de {t}', { n: posts.length, t: t.posts }))}</span></div>
          <div class="cgp-posts">
            ${posts.map((p) => this._cgpPostHtml(p)).join('')}
          </div>
        </div>` : '';

      return statsHtml + netsHtml + dailyHtml + postsHtml;
    },

    _cgpPostHtml(p) {
      const esc = (s) => this._esc(s);
      const C = (n) => this._compactNum(Number(n) || 0);
      const key = String(p.platform || '').toLowerCase();
      const ico = PLATFORM_ICON[key];
      const url = this._cgridPostUrl(key, p.post_id, p.handle, p.permalink);
      const when = p.captured_at ? this._veraFmtDate(p.captured_at) : '';
      const a = (p.media_assets && typeof p.media_assets === 'object') ? p.media_assets : {};
      const first = (v) => (Array.isArray(v) && v.length ? v[0] : null);
      const pick = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v)) ? v : null;
      // `archived_url` primero: copia permanente en R2 (ver _cgridMediaHtml).
      const img = [a.archived_url, a.display_url, a.main_image_url, a.cover_image, a.thumbnail_url,
        first(a.thumbnails), first(a.images), first(a.media_urls)].map(pick).find(Boolean);
      const bits = [
        Number(p.likes) > 0 ? `♥ ${C(p.likes)}` : null,
        Number(p.comments) > 0 ? `💬 ${C(p.comments)}` : null,
        Number(p.saves) > 0 ? `🔖 ${C(p.saves)}` : null,
        Number(p.plays) > 0 ? `▶ ${C(p.plays)}` : null,
      ].filter(Boolean).join('  ');
      return `
        <${url ? 'a' : 'div'} class="cgp-post"${url ? ` href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : ''}>
          ${img
            ? `<div class="cgp-post-thumb">
                 <img data-cgrid-media src="${esc(img)}" alt="" loading="lazy">
                 <span class="cgp-post-thumb-fb" data-cgrid-fb hidden aria-hidden="true"><i class="fas fa-image"></i></span>
               </div>`
            : `<div class="cgp-post-thumb cgp-post-thumb--empty" aria-hidden="true"><i class="fas fa-image"></i></div>`}
          <div class="cgp-post-body">
            <div class="cgp-post-head">
              ${ico ? `<i class="${esc(ico)}" aria-hidden="true"></i>` : ''}
              <span class="cgp-post-when">${esc(when)}</span>
              <span class="cgp-post-eng">${esc(C(p.interacciones))}</span>
            </div>
            ${p.content ? `<div class="cgp-post-copy">${esc(String(p.content).slice(0, 140))}</div>` : ''}
            ${bits ? `<div class="cgp-post-bits">${esc(bits)}</div>` : ''}
          </div>
        </${url ? 'a' : 'div'}>`;
    },

    /* Historial de actividad: publicaciones por día APILADAS por red — el mismo
       instrumento que Tráfico en Mi Marca, aplicado al competidor. */
    _paintBrandDailyChart(scope, d) {
      const Chart = window.Chart;
      const canvas = scope.querySelector('#cgpDailyChart');
      if (!Chart || !canvas) return;
      const daily = Array.isArray(d.daily) ? d.daily : [];
      if (!daily.length) return;

      // Solo los últimos 30 días CON actividad: una ventana larga (o "Todo")
      // produciría cientos de columnas de 1px ilegibles.
      const days = [...new Set(daily.map((x) => x.date))].sort().slice(-30);
      const nets = [...new Set(daily.map((x) => x.platform))];
      const byKey = new Map(daily.map((x) => [`${x.date}|${x.platform}`, x]));
      const fmtDay = (iso) => {
        try {
          return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
        } catch (_) { return iso; }
      };

      const datasets = nets.map((n) => ({
        label: NET_LABEL[String(n).toLowerCase()] || n,
        data: days.map((dd) => Number((byKey.get(`${dd}|${n}`) || {}).posts) || 0),
        backgroundColor: this._cgridNetColor ? this._cgridNetColor(n) : 'rgba(255,106,26,0.8)',
        borderRadius: (ctx) => {
          const val = Number(ctx.raw) || 0;
          if (val <= 0) return 0;
          const ch = ctx.chart;
          let topIdx = -1;
          for (let i = 0; i < ch.data.datasets.length; i++) {
            if (!ch.isDatasetVisible(i)) continue;
            if (Number(ch.data.datasets[i].data[ctx.dataIndex] || 0) > 0) topIdx = i;
          }
          return ctx.datasetIndex === topIdx ? { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 } : 0;
        },
        borderSkipped: false,
        maxBarThickness: 26,
        stack: 'posts',
      }));

      const TICK = 'rgba(255,255,255,0.55)', GRID = 'rgba(255,255,255,0.06)';
      try { this._cgpChart?.destroy(); } catch (_) {}
      this._cgpChart = new Chart(canvas, {
        type: 'bar',
        data: { labels: days.map(fmtDay), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { color: TICK, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
            tooltip: { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10 },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: TICK, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { stacked: true, grid: { color: GRID }, border: { display: false }, beginAtZero: true, ticks: { color: TICK, font: { size: 10 }, precision: 0, maxTicksLimit: 4 } },
          },
        },
      });
    },

    /* ══ Card 2: la publicación que más movió ═══════════════════════════════
       Preview real: media si el CDN aún la sirve, copy completo, el desglose de
       métricas y los comentarios que dejó la gente. ═══════════════════════ */
    async _paintTopPost(body, data) {
      const host = body.querySelector('#cgridTopPost');
      if (!host) return;
      const esc = (s) => this._esc(s);

      const ranked = (data.posts || [])
        .map((p) => ({ ...p, _inter: this._cgridInteractions(p) }))
        .filter((p) => p._inter > 0)
        .sort((a, b) => b._inter - a._inter);
      const win = ranked[0];
      if (!win) {
        host.innerHTML = `<div class="cgrid-empty">${esc(__('Sin publicaciones de competencia en este periodo.'))}</div>`;
        return;
      }

      // La RPC recorta el copy a 280 y no trae media: la fila completa se pide
      // aparte (RLS de brand_posts ya cubre al miembro de la org).
      let full = null, comments = [];
      try {
        const { data: rows } = await this._supabase.from('brand_posts')
          .select('content, media_assets, permalink, post_id, profile_handle, network, captured_at, followers_snapshot')
          .eq('id', win.post_id).limit(1);
        full = (rows && rows[0]) || null;
      } catch (_) {}
      try {
        const { data: cs } = await this._supabase.from('brand_post_comments')
          .select('author_handle, content, metrics, sentiment')
          .eq('brand_post_id', win.post_id).limit(80);
        comments = Array.isArray(cs) ? cs : [];
      } catch (_) {}

      const net = String(win.network || full?.network || '').toLowerCase();
      const netLabel = NET_LABEL[net] || (net ? net.charAt(0).toUpperCase() + net.slice(1) : '—');
      const handle = (full?.profile_handle || win.profile_handle || '').replace(/^@+/, '');
      const url = this._cgridPostUrl(net, full?.post_id || win.external_post_id, handle, full?.permalink);
      const when = win.captured_at ? this._veraFmtDate(win.captured_at) : '';
      const copy = String(full?.content || win.content_preview || '').trim();
      const m = win.metrics || {};
      const C = (n) => this._compactNum(n);
      const reach = this._cgridReach(win);

      // Métricas como ICONO + cifra: la etiqueta escrita ocupaba más que el
      // dato y hacía que cinco números pidieran dos líneas. El nombre de cada
      // una sigue disponible en el tooltip y para lectores de pantalla.
      const metric = (v, label, ico) => (Number(v) > 0)
        ? `<div class="cgrid-metric" title="${esc(label)}">
             <i class="${esc(ico)}" aria-hidden="true"></i>
             <span class="cgrid-metric-v">${esc(C(Number(v)))}</span>
             <span class="sr-only">${esc(label)}</span>
           </div>` : '';
      const metrics = [
        metric(m.likes, __('me gusta'), 'fas fa-heart'),
        metric(m.comments, __('comentarios'), 'fas fa-comment'),
        metric(m.saves != null ? m.saves : m.bookmarks, __('guardados'), 'fas fa-bookmark'),
        metric((Number(m.shares) || 0) + (Number(m.reposts) || 0) + (Number(m.retweets) || 0), __('compartidos'), 'fas fa-share'),
        metric(reach, net === 'youtube' || net === 'x' ? __('vistas') : __('reproducciones'), 'fas fa-play'),
      ].filter(Boolean).join('');

      const topComments = comments
        .map((c) => ({ ...c, _l: Number(c.metrics && c.metrics.likes) || 0 }))
        .sort((a, b) => b._l - a._l)
        .slice(0, 4);
      const SENT = { POS: 'pos', NEG: 'neg', NEU: 'neu' };
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

      // El copy NO entra en el fallback de media: aparecería dos veces (dentro
      // del recuadro y otra vez abajo). El fallback es solo el aviso.
      const media = this._cgridMediaHtml(full && full.media_assets, {
        network: net,
        postId:  full?.post_id || win.external_post_id,
        postUrl: url,
      });

      // Copy colapsado ARRIBA de la media: es el contexto de qué se está
      // viendo, no una lectura. Una receta de 40 líneas empujaría la media y
      // las métricas fuera de la pantalla.
      const copyHtml = copy ? `
        <details class="cgrid-post-copy-box">
          <summary class="cgrid-post-copy-sum">
            <span class="cgrid-post-copy-peek">${esc(copy.replace(/\s+/g, ' ').slice(0, 90))}${copy.length > 90 ? '…' : ''}</span>
            <i class="aisc-ico aisc-ico--chevron-down" aria-hidden="true"></i>
          </summary>
          <p class="cgrid-post-copy">${esc(copy)}</p>
        </details>` : '';

      // Orden: la publicación primero (es lo que se viene a ver), luego sus
      // cifras, luego de quién es, el enlace al original y por último el copy
      // completo — que es lo más largo y lo que menos se consulta de un vistazo.
      host.innerHTML = `
        <article class="cgrid-post-card">
          ${media}
          <div class="cgrid-metrics">${metrics}</div>
          <div class="cgrid-post-head">
            <div class="cgrid-post-who">
              <span class="cgrid-post-name">${esc(win.entity_name || '—')}</span>
              <span class="cgrid-post-meta">${esc([handle ? '@' + handle : '', netLabel, when].filter(Boolean).join(' · '))}</span>
            </div>
            <div class="cgrid-post-score">
              <span class="cgrid-post-score-v">${esc(C(win._inter))}</span>
              <small>${esc(__('interacciones'))}</small>
            </div>
          </div>
          ${url ? `<a class="cgrid-post-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"
             title="${esc(__('Ver publicación original'))}" aria-label="${esc(__('Ver publicación original'))}">
             <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>` : ''}
          ${copyHtml}
          ${commentsHtml}
        </article>`;

      this._bindCgridMediaFallback(host);
      // Facade: el reproductor del tercero no se pide hasta que se pulsa el play.
      host.querySelectorAll('[data-cgrid-embed]').forEach((b) => {
        b.addEventListener('click', () => this._cgridMountEmbed(b));
      });
    },

    /* Media del post. Las URLs de CDN de Instagram/TikTok van FIRMADAS y
       caducan: una preview vieja da 403. Por eso todo media se monta con
       fallback tipográfico — nunca un cuadro roto. */
    _cgridMediaHtml(ma, ctx) {
      const esc = (s) => this._esc(s);
      const { network, postId, postUrl } = ctx || {};
      const a = (ma && typeof ma === 'object') ? ma : {};
      const first = (v) => (Array.isArray(v) && v.length ? v[0] : null);
      const pick = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v)) ? v
        : (v && typeof v === 'object' && typeof v.url === 'string') ? v.url : null;
      // `archived_url` PRIMERO: es la copia que ai-engine guardó en R2 al
      // capturar el post. Las URLs originales del CDN vienen firmadas y
      // caducan — la archivada no. Las demás quedan como respaldo para los
      // posts anteriores al archivado.
      const archived = pick(a.archived_url);
      const img = [a.archived_url, a.display_url, a.main_image_url, a.cover_image, a.thumbnail_url,
        first(a.thumbnails), first(a.images), first(a.media_urls), first(a._legacy_array)]
        .map(pick).find(Boolean);
      const rawVideo = pick(a.video_url);
      // `video_url` NO siempre es un archivo reproducible. En TikTok el scraper
      // guarda ahí la URL de la PÁGINA del post
      // (https://www.tiktok.com/@marca/video/123): un <video> con eso recibe
      // HTML, así que pinta sus controles y no arranca nunca — el reproductor
      // parecía roto sin estarlo. Solo se monta <video> con media de verdad.
      const video = this._cgridIsPlayable(rawVideo) ? rawVideo : null;
      const esVideoNoIncrustable = Boolean(rawVideo) && !video;

      // Mismo lenguaje que el resto de la plataforma para media caída (galería
      // de Producción, ficha de producto): glifo centrado sobre superficie
      // neutra, nunca el icono roto del navegador. Sin el copy: ya va arriba,
      // repetirlo aquí lo mostraba dos veces.
      const fallback = `
        <div class="cgrid-media-fb" data-cgrid-fb hidden>
          <i class="fas fa-image cgrid-media-fb-ico" aria-hidden="true"></i>
          <span class="cgrid-media-fb-kicker">${esc(__('Vista previa no disponible'))}</span>
        </div>`;

      if (video) {
        // CASCADA REAL: el video del CDN caduca igual que la imagen, pero la
        // copia archivada NO. Si el video muere se muestra la miniatura
        // archivada en su lugar — recurrir al placeholder teniendo una imagen
        // buena era tirar información. Solo si tampoco hay archivada se cae al
        // aviso.
        return `<div class="cgrid-media">
          <video class="cgrid-media-el" data-cgrid-media${archived ? ` data-cgrid-alt="${esc(archived)}"` : ''} controls preload="metadata" playsinline${img ? ` poster="${esc(img)}"` : ''}>
            <source src="${esc(video)}">
          </video>
          ${archived ? `<img class="cgrid-media-el cgrid-media-alt" data-cgrid-altimg src="${esc(archived)}" alt="" loading="lazy" hidden>` : ''}
          ${fallback}</div>`;
      }
      if (img) {
        // FACADE: la red no publica el archivo, pero sí ofrece un reproductor
        // incrustable (TikTok y YouTube, ambos sin credencial ni costo). Se
        // pinta la portada con su botón de play y el iframe se monta SOLO al
        // pulsarlo: cero peso y cero rastreo de terceros mientras nadie lo
        // pida. Si el embed fallara, la portada y el enlace al original siguen
        // ahí debajo.
        const embed = esVideoNoIncrustable ? this._cgridEmbedUrl(network, postId) : null;
        // Sin reproductor incrustable (o desactivado), el play abre la
        // publicación en la red: mejor un botón que lleva a algún sitio que un
        // icono decorativo que no hace nada.
        const play = embed
          ? `<button type="button" class="cgrid-media-play" data-cgrid-embed="${esc(embed)}" aria-label="${esc(__('Reproducir video'))}"><i class="fas fa-play" aria-hidden="true"></i></button>`
          : (esVideoNoIncrustable && postUrl
            ? `<a class="cgrid-media-play" href="${esc(postUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(__('Ver el video en {r}', { r: NET_LABEL[String(network || '').toLowerCase()] || __('la red') }))}" aria-label="${esc(__('Ver el video en su red'))}"><i class="fas fa-play" aria-hidden="true"></i></a>`
            : (esVideoNoIncrustable ? `<span class="cgrid-media-play is-static" aria-hidden="true"><i class="fas fa-play"></i></span>` : ''));
        return `<div class="cgrid-media">
          <img class="cgrid-media-el" data-cgrid-media src="${esc(img)}" alt="" loading="lazy">
          ${play}
          ${fallback}</div>`;
      }
      return `<div class="cgrid-media">${fallback.replace(' hidden', '')}</div>`;
    },

    /* Reproductor incrustable oficial de la red, cuando existe. Ambos son
       públicos: sin credencial, sin app registrada y sin costo (verificado en
       vivo: el iframe responde 200 y no manda X-Frame-Options ni
       frame-ancestors, o sea que permite incrustarse desde nuestro dominio).
       Instagram queda fuera a propósito: su oEmbed exige token de app de Meta. */
    _cgridEmbedUrl(network, postId) {
      const id = String(postId || '').trim();
      const net = String(network || '').toLowerCase();
      if (!id || EMBED_HABILITADO[net] === false) return null;
      switch (net) {
        case 'tiktok':
          if (!/^\d+$/.test(id)) return null;
          return `https://www.tiktok.com/embed/v2/${id}`;
        case 'youtube':
          // -nocookie: no deja cookies de seguimiento hasta que se reproduce.
          return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
        default:
          return null;
      }
    },

    /* Monta el reproductor de la red en el hueco de la portada. Se llama solo
       desde el click en el play — hasta entonces no se ha pedido nada a un
       tercero. */
    _cgridMountEmbed(btn) {
      const stage = btn.closest('.cgrid-media');
      const src = btn.dataset.cgridEmbed;
      if (!stage || !src || stage.dataset.embedded === '1') return;

      // Se guarda la portada tal cual para poder VOLVER a ella. Al terminar el
      // video, el reproductor de TikTok se queda en su pantalla de "Videos
      // relacionados" — contenido de otros que no pintamos nosotros y que no
      // tiene por qué ocupar la card. Cerrar devuelve la publicación.
      if (!stage.dataset.posterHtml) stage.dataset.posterHtml = stage.innerHTML;
      stage.dataset.posterRatio = stage.style.aspectRatio || '';
      stage.dataset.posterMaxW = stage.style.maxWidth || '';
      stage.dataset.embedded = '1';

      this._cgridSizeEmbed(stage);
      stage.innerHTML = `
        <iframe class="cgrid-media-embed" src="${this._esc(src)}"
          title="${this._esc(__('Reproductor de la publicación'))}"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        <button type="button" class="cgrid-embed-close" data-cgrid-embed-close
          aria-label="${this._esc(__('Cerrar el reproductor'))}" title="${this._esc(__('Cerrar el reproductor'))}">
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>`;

      stage.querySelector('[data-cgrid-embed-close]')
        ?.addEventListener('click', () => this._cgridUnmountEmbed(stage));

      // El alto depende del ancho: si la ventana cambia, se recalcula.
      if (!this._cgridEmbedResize) {
        this._cgridEmbedResize = () => {
          document.querySelectorAll('.cgrid-media[data-embedded="1"]')
            .forEach((s) => this._cgridSizeEmbed(s));
        };
        // Via BaseView: un listener de resize crudo sobrevive al destroy() de
        // la vista y sigue redimensionando embeds que ya no existen.
        this.addEventListener(window, 'resize', this._cgridEmbedResize);
      }
      // Señal OPORTUNISTA de fin de reproducción: el reproductor emite
      // postMessage, pero su formato no es contrato público — si algún día
      // deja de llegar, el botón de cerrar sigue siendo la vía fiable.
      this._cgridBindEmbedMessages();
    },

    /* El embed de TikTok no es solo el video: lleva encabezado de perfil y una
       franja inferior. Un 9:16 a secas recorta ese chrome y deja la pantalla de
       relacionados asomando. Alto = video vertical + el alto del chrome. */
    _cgridSizeEmbed(stage) {
      // El chrome del embed de TikTok: encabezado de perfil arriba, y abajo la
      // franja "Mira más vídeos" + el handle + el copy + la pista de audio.
      const CHROME_PX = 210;
      // ANCHO COMPLETO de la columna. TikTok prioriza el alto para meter su
      // footer, así que con el reproductor acotado a 340px el pie quedaba
      // cortado. Dándole todo el ancho, el alto proporcional alcanza para que
      // se vea entero — y así coincide con el ancho de la portada.
      const w = Math.round(
        stage.parentElement?.getBoundingClientRect().width
        || stage.getBoundingClientRect().width || 340,
      );
      stage.style.aspectRatio = 'auto';
      stage.style.maxWidth = '';
      stage.style.height = `${Math.round(w * 16 / 9) + CHROME_PX}px`;
    },

    /* Vuelve a la portada: el estado exacto de antes de reproducir. */
    _cgridUnmountEmbed(stage) {
      if (!stage || stage.dataset.embedded !== '1') return;
      stage.innerHTML = stage.dataset.posterHtml || '';
      stage.style.height = '';
      stage.style.aspectRatio = stage.dataset.posterRatio || '';
      stage.style.maxWidth = stage.dataset.posterMaxW || '';
      delete stage.dataset.embedded;
      // La portada vuelve a montarse: sus listeners hay que rehacerlos.
      this._bindCgridMediaFallback(stage);
      stage.querySelectorAll('[data-cgrid-embed]').forEach((b) => {
        b.addEventListener('click', () => this._cgridMountEmbed(b));
      });
    },

    /* Escucha mensajes del reproductor para cerrar solo cuando el video acaba.
       Un único listener global, con el origen verificado. Todo lo que no
       reconoce se ignora en silencio. */
    _cgridBindEmbedMessages() {
      if (this._cgridEmbedMsgBound) return;
      this._cgridEmbedMsgBound = true;
      this.addEventListener(window, 'message', (e) => {
        // El origen se resuelve dentro del try: una URL invalida descarta el
        // mensaje ahi mismo, sin dejar la variable a medio asignar.
        let host;
        try { host = new URL(e.origin).hostname.replace(/^www\./, ''); } catch (_) { return; }
        if (host !== 'tiktok.com' && host !== 'youtube-nocookie.com' && host !== 'youtube.com') return;
        let d = e.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
        if (!d || typeof d !== 'object') return;
        // TikTok: {type:'video-status', value:{...}} · YouTube: info.playerState 0 = ended
        const acabo = d.type === 'onStateChange' ? d.info === 0
          : (d.info && d.info.playerState === 0) ? true
          : /end/i.test(String(d.type || '')) || /end/i.test(String(d.value && d.value.status || ''));
        if (!acabo) return;
        document.querySelectorAll('.cgrid-media[data-embedded="1"]').forEach((s) => {
          if (s.querySelector('iframe')?.contentWindow === e.source) this._cgridUnmountEmbed(s);
        });
      });
    },

    /* ¿Esta URL es media que un <video> puede reproducir, o la página del post?
       Los scrapers guardan una u otra según la red, y montarlas igual hacía que
       TikTok mostrara un reproductor muerto. */
    _cgridIsPlayable(u) {
      if (!u) return false;
      try {
        const url = new URL(u);
        const h = url.hostname.toLowerCase().replace(/^www\./, '');
        // Páginas del post: devuelven HTML, jamás un stream.
        if (/^(tiktok\.com|instagram\.com|facebook\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)$/.test(h)) return false;
        return /\.(mp4|m4v|webm|mov|m3u8)$/i.test(url.pathname);
      } catch (_) { return false; }
    },

    _bindCgridMediaFallback(scope) {
      scope.querySelectorAll('[data-cgrid-media]').forEach((el) => {
        const fb = el.parentElement && el.parentElement.querySelector('[data-cgrid-fb]');
        let ok = false;                       // ¿el medio llegó a cargar?
        // Respaldo intermedio: la miniatura archivada, que no caduca. Antes de
        // rendirse al aviso se intenta mostrarla.
        const alt = el.parentElement && el.parentElement.querySelector('[data-cgrid-altimg]');
        const fail = () => {
          if (ok) return;                     // ya cargó: un error tardío no cuenta
          el.hidden = true;
          if (alt && alt.hidden) { alt.hidden = false; return; }
          if (fb) fb.hidden = false;
        };
        // Si el medio carga, el fallback queda descartado para siempre. Un
        // <video> con varios candidatos puede emitir 'error' en un <source>
        // y REPRODUCIR igual — sin esta guarda salía el aviso de "no
        // disponible" encima de un video que se estaba viendo.
        const succeed = () => {
          ok = true;
          el.hidden = false;
          if (fb) fb.hidden = true;
        };
        // Si el respaldo archivado tampoco carga, se cae al aviso.
        if (alt) {
          alt.addEventListener('error', () => { alt.hidden = true; if (fb) fb.hidden = false; }, { once: true });
          this._cgridFitMedia(alt);
        }
        this._cgridFitMedia(el);
        if (el.tagName === 'VIDEO') {
          // `loadedmetadata` es la señal REAL de que el video sirve: el
          // navegador ya conoce duración y dimensiones, o sea que el servidor
          // respondió y el reproductor es usable. Con preload="metadata" puede
          // ser lo ÚNICO que llegue — `loadeddata`/`canplay` esperan datos del
          // primer frame, que no se piden hasta que el usuario le da play.
          el.addEventListener('loadedmetadata', succeed, { once: true });
          el.addEventListener('loadeddata', succeed, { once: true });
          el.addEventListener('canplay', succeed, { once: true });
          // Único fallo terminal: el propio <video> agotó sus candidatos. NO se
          // escucha el error del <source> — un candidato caído no dice nada del
          // resultado final, y era lo que estaba tumbando videos que se veían
          // perfectamente (aparecían un instante y luego el aviso los tapaba).
          el.addEventListener('error', fail, { once: true });
          // readyState >= 1 (HAVE_METADATA) puede darse antes de bindear.
          if (el.readyState >= 1) succeed();
          else if (el.error) fail();
        } else {
          el.addEventListener('load', succeed, { once: true });
          el.addEventListener('error', fail, { once: true });
          // Puede haber resuelto ANTES de bindear (cache, o 403 inmediato):
          // en ese caso ningún evento va a llegar y hay que decidir aquí.
          if (el.complete) { if (el.naturalWidth > 0) succeed(); else fail(); }
        }
      });
    },

    /* El contenedor adopta el FORMATO REAL del medio: un reel vertical de
       TikTok se ve vertical, un post cuadrado cuadrado y un video horizontal
       horizontal. Con una caja de proporción fija, todo lo que no coincidía
       salía recortado — justo la mitad de un 9:16.
       El 4/5 del CSS solo reserva el hueco mientras carga (evita layout shift);
       en cuanto se conocen las dimensiones reales se sustituye. */
    _cgridFitMedia(el) {
      if (!el) return;
      const MAX_H = 600;   // debe coincidir con el max-height del CSS
      const apply = (w, h) => {
        if (!w || !h) return;
        const stage = el.closest('.cgrid-media');
        if (!stage) return;
        stage.style.aspectRatio = `${w} / ${h}`;
        // Acotar por ANCHO, no por alto: un max-height a secas rompería la
        // proporción y devolvería las franjas que se quieren evitar. Limitando
        // el ancho, el alto cae solo dentro del tope y el ratio se respeta.
        stage.style.maxWidth = `${Math.round(MAX_H * (w / h))}px`;
      };
      if (el.tagName === 'VIDEO') {
        const fromVideo = () => apply(el.videoWidth, el.videoHeight);
        if (el.readyState >= 1) fromVideo();
        else el.addEventListener('loadedmetadata', fromVideo, { once: true });
        return;
      }
      const fromImg = () => apply(el.naturalWidth, el.naturalHeight);
      if (el.complete) fromImg();
      else el.addEventListener('load', fromImg, { once: true });
    },

    /* Los posts de competencia NO guardan permalink (0% de cobertura): la URL
       pública se reconstruye desde network + post_id + handle. Mismo algoritmo
       que CompetenciaDataService._postUrl (verificado en vivo contra IG). */
    _cgridPostUrl(net, postId, handle, permalink) {
      if (permalink && /^https?:\/\//i.test(permalink)) return permalink;
      const id = postId != null ? String(postId).trim() : '';
      if (!id) return null;
      const h = String(handle || '').trim().replace(/^@+/, '');
      switch (String(net || '').toLowerCase()) {
        case 'instagram': {
          if (!/^\d+$/.test(id)) return null;
          const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
          let n = BigInt(id), sc = '';
          while (n > 0n) { sc = A[Number(n % 64n)] + sc; n /= 64n; }
          return sc ? `https://www.instagram.com/p/${sc}/` : null;
        }
        case 'tiktok':   return h ? `https://www.tiktok.com/@${h}/video/${id}` : null;
        case 'x':
        case 'twitter':  return h ? `https://x.com/${h}/status/${id}` : `https://x.com/i/status/${id}`;
        case 'youtube':  return `https://www.youtube.com/watch?v=${id}`;
        case 'facebook': return h ? `https://www.facebook.com/${h}/posts/${id}` : `https://www.facebook.com/${id}`;
        default:         return null;
      }
    },
  });
})();
