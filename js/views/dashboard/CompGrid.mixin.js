/**
 * DashboardView — CompGrid mixin (pestaña Competencia, diseño de v1 · 8520ff8a^).
 *
 * El grid de cards de Competencia, mismo lenguaje visual que Mi Marca:
 *   Izquierda  la Intuición (hueco #cgridIntuicion, la pinta Vera4) y las Audiencias que
 *              pesca la competencia (bloques audiencia_competidor de la lectura de Vera).
 *   Derecha    Influencia digital (columnas apiladas por red, una por marca rival), la
 *              Publicación con mayor tráfico y las Observaciones por perfil
 *              (bloques observacion_perfil de la lectura de Vera).
 *   Al pie     las cards del cerebro de Vera (#cgridVera4) y «Lo que están pautando» (CompAds).
 *
 * DATOS (todo por window.DashboardDatos, contrato docs/contratos/dashboard.md):
 *   Influencia digital       social.actividad_diaria (P1) → marcasCompetencia / detalleMarcaCompetencia
 *   Publicación destacada    social.posts_view con interacciones y media (P1) + social.comments
 *   Audiencias, Observaciones  marketing.lecturas_tablero / marketing.readings (narrative v1, existe hoy)
 *   «+» de una audiencia     marketing.audiences (biblioteca de la marca)
 * Lo que la base aún no da se queda en su sitio como «todavía no», en palabras.
 *
 * INTERACCIÓN ≠ REPRODUCCIÓN: el ranking usa likes + comentarios + compartidos + guardados.
 * Las vistas se MUESTRAN, pero no ordenan: son alcance pasivo, no respuesta del público.
 *
 * Sin reproductores incrustados de las redes: la CSP (frame-src) no los admite y no se
 * amplía. La preview es la portada archivada en R2; un video sin archivo lleva al original.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const WINDOWS = [
    { k: 'week',  label: () => __('Semana') },
    { k: 'month', label: () => __('Mes') },
    { k: 'year',  label: () => __('Año') },
    { k: 'all',   label: () => __('Todo') },
  ];

  const NET_LABEL = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    x: 'X', twitter: 'X', youtube: 'YouTube', linkedin: 'LinkedIn',
  };

  const PLATFORM_ICON = {
    instagram: 'fab fa-instagram',
    facebook:  'fab fa-facebook',
    tiktok:    'fab fa-tiktok',
    youtube:   'fab fa-youtube',
    twitter:   'fab fa-x-twitter',
    x:         'fab fa-x-twitter',
    linkedin:  'fab fa-linkedin-in',
  };

  // Claves de metrics que SON interacción (respuesta del público).
  const INTERACTION_KEYS = ['likes', 'comments', 'shares', 'saves', 'reposts', 'retweets', 'quotes', 'bookmarks', 'replies'];

  // Tope de alto de la media (debe coincidir con el tope de ancho que calcula _cgridFitMedia).
  const MAX_H = 600;

  Object.assign(DashboardView.prototype, {

    /* ── Entrada de la pestaña ── */
    async _renderCompGrid(body) {
      if (!body) return;
      if (this._cgridWindow == null) this._cgridWindow = 'month';
      // Por defecto la lectura NORMALIZADA: en impacto absoluto una marca que mueve 50x más
      // aplasta a las demás. "Por cada 1.000 seguidores" las pone en rango comparable.
      if (this._cgridMetric == null) this._cgridMetric = 'per1k';

      if (!body.querySelector('.cgrid')) {
        this._pintar(body, this._buildCompGridShell());
        this._bindCompGrid(body);
      }
      await this._cgridLoadAndPaint(body);
      if (!this._sigue('competence')) return;
      // Cards del cerebro (cards.vera4) del scope monitoreo, al pie del grid.
      if (typeof this._renderVera4 === 'function') await this._renderVera4(body, 'monitoreo', body.querySelector('#cgridVera4'));
    },

    _buildCompGridShell() {
      const esc = (s) => this._esc(s);
      const seg = WINDOWS.map((w) => `
        <button type="button" class="bgrid-seg-btn${w.k === this._cgridWindow ? ' is-active' : ''}" data-cwindow="${w.k}" role="tab">${esc(w.label())}</button>`).join('');
      const cargando = (t) => `<div class="cgrid-load">${esc(t)}</div>`;
      return `
        <div class="cgrid">
          <div class="cgrid-col">
            <div class="bgrid-intuicion" id="cgridIntuicion"></div>
            <section class="bgrid-card cgrid-card--aud" id="cgridAudCard">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--audience" aria-hidden="true"></i>${esc(__('Audiencias'))}</span>
              </header>
              <p class="bgrid-card-sub">${esc(__('A quién está pescando tu competencia · agrégala a tu biblioteca para pescar ahí también'))}</p>
              <div class="cgrid-aud" id="cgridAud">${cargando(__('Leyendo la lectura de Vera…'))}</div>
            </section>
          </div>
          <div class="cgrid-col">
            <section class="bgrid-card glass-black cgrid-card--influencia">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--chart-bar" aria-hidden="true"></i>${esc(__('Influencia digital'))}</span>
              </header>
              <p class="bgrid-card-sub">${esc(__('Cuánta conversación genera cada competidor y en qué red la genera · toca una barra para ver todo lo recolectado'))}</p>
              <div class="cgrid-controls">
                <nav class="bgrid-seg" role="tablist" aria-label="${esc(__('Periodo'))}">${seg}</nav>
                <nav class="bgrid-seg bgrid-seg--metric" role="tablist" aria-label="${esc(__('Medida'))}">
                  <button type="button" class="bgrid-seg-btn${this._cgridMetric === 'per1k' ? ' is-active' : ''}" data-cmetric="per1k" role="tab" title="${esc(__('Interacciones por cada 1.000 seguidores — comparable entre marcas de distinto tamaño'))}">${esc(__('Por audiencia'))}</button>
                  <button type="button" class="bgrid-seg-btn${this._cgridMetric === 'total' ? ' is-active' : ''}" data-cmetric="total" role="tab" title="${esc(__('Interacciones totales del periodo'))}">${esc(__('Total'))}</button>
                </nav>
              </div>
              <div class="cgrid-bars" id="cgridBars">${cargando(__('Cargando perfiles…'))}</div>
              <footer class="bgrid-card-foot" id="cgridBarsFoot"></footer>
            </section>
            <section class="bgrid-card cgrid-card--toppost">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${esc(__('Publicación con mayor tráfico'))}</span>
              </header>
              <div class="cgrid-post" id="cgridTopPost">${cargando(__('Buscando la publicación…'))}</div>
            </section>
            <section class="bgrid-card cgrid-card--obs" id="cgridObsCard">
              <header class="bgrid-card-head">
                <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--eye" aria-hidden="true"></i>${esc(__('Observaciones'))}</span>
              </header>
              <p class="bgrid-card-sub">${esc(__('Lo más destacado de cada perfil en este periodo'))}</p>
              <div class="cgrid-obs" id="cgridObs">${cargando(__('Leyendo la lectura de Vera…'))}</div>
            </section>
          </div>
          <div class="cgrid-v4 vera4" id="cgridVera4"></div>
        </div>`;
    },

    _bindCompGrid(body) {
      if (body.dataset.cgridBound === '1') return;
      body.dataset.cgridBound = '1';
      body.addEventListener('click', (e) => {
        // El "+" agrega sin abrir el detalle; el resto de la ficha lo abre.
        const add = e.target.closest('[data-aud-add]');
        if (add && body.contains(add)) { e.stopPropagation(); this._cgridAddAudiencia(add.dataset.audAdd, add); return; }
        const abrir = e.target.closest('[data-aud-open]');
        if (abrir) { this._openAudienciaModal(abrir.dataset.audOpen); return; }
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
        body.querySelectorAll('[data-cwindow]').forEach((b) => b.classList.toggle('is-active', b.dataset.cwindow === k));
        this._cgridLoadAndPaint(body);
      });
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const abrir = e.target.closest('[data-aud-open]');
        if (abrir && e.target === abrir) { e.preventDefault(); this._openAudienciaModal(abrir.dataset.audOpen); }
      });
    },

    /* Interacción real de un post: suma de las claves que son RESPUESTA del público.
       engagement_total sirve de piso. */
    _cgridInteractions(row) {
      const m = (row && row.metrics) || {};
      let sum = 0;
      INTERACTION_KEYS.forEach((k) => { sum += Number(m[k]) || 0; });
      return Math.max(sum, Number(row && row.engagement_total) || 0);
    },

    /* La ventana activa, anclada a la última publicación capturada de la competencia
       (sin ancla, "Semana" sale vacía si la cosecha lleva días sin correr). */
    async _cgridRangoActivo() {
      const D = window.DashboardDatos;
      const ult = await D.ultimaFecha(this._orgId, 'competitor');
      if (ult.falta) return { falta: ult };
      if (!ult.datos) return { sinPosts: true };
      return { rango: D.rangoDeVentana(this._cgridWindow, { ultima: ult.datos }) };
    },

    async _cgridLoadAndPaint(body) {
      const D = window.DashboardDatos;
      if (!D || !this._orgId) return;
      const ventana = this._cgridWindow;
      const [r, lectura] = await Promise.all([
        this._cgridRangoActivo(),
        this._cgridLectura ? Promise.resolve(this._cgridLectura) : D.lectura(this._orgId, { scope: 'monitoreo', versiones: [1] }),
      ]);
      if (!this._sigue('competence') || ventana !== this._cgridWindow) return;
      this._cgridLectura = lectura;

      let data = { falta: null, sinPosts: false, brands: [], top: null };
      if (r.falta) data = { ...data, falta: r.falta };
      else if (r.sinPosts) data = { ...data, sinPosts: true };
      else {
        this._cgridRange = r.rango;
        const [marcas, top] = await Promise.all([
          D.marcasCompetencia(this._orgId, r.rango),
          D.publicacionDestacada(this._orgId, { source: 'competitor', ...r.rango }),
        ]);
        if (!this._sigue('competence') || ventana !== this._cgridWindow) return;
        data = { ...data, falta: marcas.falta ? marcas : null, brands: marcas.datos || [], top };
      }
      this._cgridLastData = data;
      await this._paintInfluenceBars(body, data);
      this._paintTopPost(body, data);
      await this._paintVeraLecturaMonitoreo(body, lectura);
    },

    /* ══ Influencia digital ═════════════════════════════════════════════════
       Columna = interacciones generadas en el periodo (lo que de verdad movió), no
       seguidores. El pie da el contexto que evita la lectura ingenua. ═════ */
    async _paintInfluenceBars(body, data) {
      const host = body.querySelector('#cgridBars');
      const foot = body.querySelector('#cgridBarsFoot');
      if (!host) return;
      const esc = (s) => this._esc(s);
      const titulo = __('Influencia digital');
      if (foot) this._pintar(foot, '');
      try { this._cgridChart?.destroy(); } catch (e) { console.warn('[CompGrid] chart:', e?.message); }
      this._cgridChart = null;

      if (data.falta) {
        this._pintar(host, this._todaviaNo(titulo, this._faltaTexto(data.falta, __('Necesita la actividad diaria de los perfiles que vigilas. Aparece sola cuando la base la tenga.'))));
        return;
      }
      if (data.sinPosts) {
        this._pintar(host, this._todaviaNo(titulo, __('Aún no hay publicaciones de tu competencia. Agrega sus perfiles en Monitoreo para ver quién manda en tu nicho.')));
        return;
      }
      const per1k = this._cgridMetric === 'per1k';
      // Una fila por MARCA, no por perfil: la vista ya unificó los canales de un mismo actor.
      const rows = (data.brands || [])
        .map((r) => ({
          key: r.brand_key,
          entityIds: Array.isArray(r.entity_ids) ? r.entity_ids : [],
          name: r.brand_name || '—',
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
        .sort((a, b) => (per1k ? (b.per1k || 0) - (a.per1k || 0) : b.eng - a.eng));

      if (!rows.length) {
        this._pintar(host, `<div class="cgrid-empty">${esc(__('Sin actividad capturada de tus competidores en este periodo. Prueba una ventana más amplia.'))}</div>`);
        return;
      }
      // «Por audiencia» sin un solo dato de seguidores sería una gráfica de ceros: se dice.
      if (per1k && !rows.some((x) => x.followers > 0)) {
        this._pintar(host, this._todaviaNo(__('Por audiencia'), __('Necesita los seguidores de cada perfil y la base todavía no los tiene. Mientras tanto, mira «Total».')));
        return;
      }

      this._cgridRows = rows;
      const [accent] = this._coloresMarca();
      const C = (n) => this._compactNum(n);

      // Un tono por PLATAFORMA, igual en todas las columnas. El orden lo fija el impacto
      // agregado de la red en toda la card.
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
      this._cgridNetColor = (k) => this._rgba(accent, netAlpha(k));

      this._pintar(host, '<div class="cgrid-chart-wrap"><canvas id="cgridInfluenceChart"></canvas></div>');
      try { await this._ensureChartJs(); } catch (e) { console.warn('[CompGrid] Chart.js:', e?.message); }
      this._paintInfluenceChart(host, rows, netOrder);

      if (foot) {
        const totPosts = rows.reduce((s, x) => s + x.posts, 0);
        const totEng = rows.reduce((s, x) => s + x.eng, 0);
        const leader = rows[0];
        // En modo normalizado, una marca sin seguidores conocidos sale en cero y parecería
        // muerta: se dice explícitamente.
        const sinFol = per1k ? rows.filter((x) => !(x.followers > 0)).map((x) => x.name) : [];
        this._pintar(foot, `
          <span>${esc(__('{n} publicaciones', { n: totPosts }))}</span>
          <span class="bgrid-foot-sep">·</span>
          <span>${esc(__('{n} interacciones', { n: C(totEng) }))}</span>
          <span class="bgrid-foot-sep">·</span>
          <span>${esc(__('manda {b} en {p}', { b: leader.name, p: NET_LABEL[leader.topPlatform] || leader.topPlatform }))}</span>
          ${sinFol.length ? `<span class="bgrid-foot-sep">·</span><span class="cgrid-foot-warn">${esc(__('sin dato de seguidores: {l}', { l: sinFol.join(', ') }))}</span>` : ''}`);
      }
    },

    _paintInfluenceChart(host, rows, netOrder) {
      const Chart = window.Chart;
      const canvas = host.querySelector('#cgridInfluenceChart');
      if (!Chart || !canvas) return;
      const C = (n) => this._compactNum(Number(n) || 0);
      const per1k = this._cgridMetric === 'per1k';
      const tinta = this._tintaCharts();

      const engRaw = (row, net) => {
        const p = row.profiles.find((x) => String(x.platform || '').toLowerCase() === net);
        return p ? (Number(p.engagement) || 0) : 0;
      };
      // Normalizado: cada segmento se divide entre los seguidores TOTALES de la marca, así los
      // segmentos siguen sumando el total normalizado.
      const engOf = (row, net) => {
        const v = engRaw(row, net);
        if (!per1k) return v;
        return row.followers > 0 ? Math.round(v * 1000 / row.followers) : 0;
      };
      const datasets = netOrder.map((net) => ({
        label: NET_LABEL[net] || net,
        data: rows.map((x) => engOf(x, net)),
        backgroundColor: this._cgridNetColor(net),
        // Solo el segmento superior del apilado lleva las esquinas redondeadas.
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

      this._cgridChart = this._reg(new Chart(canvas, {
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
            if (evt.native && evt.native.target) evt.native.target.style.cursor = (els && els.length) ? 'pointer' : 'default';
          },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: tinta.tick, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } },
            },
            tooltip: {
              ...tinta.tooltip,
              footerColor: this._tok('--text-muted'),
              callbacks: {
                label: (c) => {
                  if (!(Number(c.raw) > 0)) return null;
                  const x = rows[c.dataIndex];
                  const net = netOrder[c.datasetIndex];
                  return per1k
                    ? `${c.dataset.label}: ${C(c.raw)} / 1k  (${C(engRaw(x, net))})`
                    : `${c.dataset.label}: ${C(c.raw)}`;
                },
                footer: (items) => {
                  const x = rows[items[0].dataIndex];
                  if (!x) return '';
                  const l = [__('{n} en total · {p} publicaciones', { n: C(x.eng), p: x.posts })];
                  if (x.followers > 0) l.push(__('{n} seguidores', { n: C(x.followers) }));
                  else if (per1k) l.push(__('sin dato de seguidores en este periodo'));
                  l.push(__('toca para ver todo lo recolectado'));
                  return l.join('\n');
                },
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: this._tok('--white-80'), font: { size: 12, weight: '600' }, maxRotation: 0, autoSkip: false } },
            y: {
              stacked: true, grid: { color: tinta.grid }, border: { display: false }, beginAtZero: true,
              ticks: { color: tinta.tick, font: { size: 10 }, maxTicksLimit: 5, callback: (v) => C(v) },
              title: {
                display: true,
                text: per1k ? __('interacciones por cada 1.000 seguidores') : __('interacciones'),
                color: this._tok('--text-disabled'), font: { size: 10 },
              },
            },
          },
        },
      }));
    },

    /* ══ La lectura de Vera para esta pestaña ═══════════════════════════════
       UNA lectura `monitoreo` (narrative v1) alimenta Observaciones y Audiencias. ══ */
    async _paintVeraLecturaMonitoreo(body, lectura) {
      this._paintVeraObservaciones(body, lectura);
      await this._paintVeraAudiencias(body, lectura);
    },

    /* ══ Observaciones por perfil — de la lectura de Vera (bloques observacion_perfil) ══
       Manda la PRIORIDAD que asignó Vera; el rol y la clasificación van como badge. */
    _paintVeraObservaciones(body, lectura) {
      const host = body.querySelector('#cgridObs');
      if (!host) return;
      const esc = (s) => this._esc(s);
      const titulo = __('Observaciones');
      const reading = lectura && !lectura.falta ? lectura.datos : null;
      const obs = ((reading && reading.reading && reading.reading.narrative) || [])
        .filter((b) => b && b.type === 'observacion_perfil' && b.perfil && b.observacion);
      if (!obs.length) {
        this._pintar(host, this._todaviaNo(titulo, this._faltaTexto(lectura, __('Aparece cuando Vera vuelva a leer a tu competencia.'))));
        return;
      }
      const PRIO = { alta: 0, media: 1, baja: 2 };
      const orden = [...obs].sort((a, b) => {
        const pa = PRIO[String(a.prioridad || '').toLowerCase()] ?? 1;
        const pb = PRIO[String(b.prioridad || '').toLowerCase()] ?? 1;
        return pa - pb;
      });
      const SEV = {
        opportunity: { cls: 'is-opp',    badge: 'badge--exito',       label: __('Oportunidad') },
        threat:      { cls: 'is-threat', badge: 'badge--error',       label: __('Amenaza') },
        warning:     { cls: 'is-warn',   badge: 'badge--advertencia', label: __('Atención') },
        neutral:     { cls: 'is-neu',    badge: '',                   label: __('Contexto') },
      };
      const ROL = {
        competidor_directo:   __('Directo'),
        competidor:           __('Directo'),
        competidor_indirecto: __('Indirecto'),
        referente:            __('Referente'),
        referencia_cultural:  __('Referente'),
        aliado:               __('Aliado'),
      };
      this._pintar(host, orden.map((o) => {
        const sev = SEV[String(o.severidad || '').toLowerCase()] || SEV.neutral;
        const rol = ROL[String(o.rol || '').toLowerCase()] || '';
        const prio = String(o.prioridad || '').toLowerCase();
        return `
          <article class="cgo-item ${sev.cls}">
            <div class="cgo-head">
              <span class="cgo-perfil">${esc(o.perfil)}</span>
              ${rol ? `<span class="badge badge--sm cgo-rol">${esc(rol)}</span>` : ''}
              <span class="badge badge--sm ${sev.badge} cgo-sev">${esc(sev.label)}</span>
              ${prio === 'alta' ? `<span class="badge badge--sm ${sev.badge || 'badge--error'} cgo-prio">${esc(__('Prioridad alta'))}</span>` : ''}
            </div>
            ${o.titulo ? `<h4 class="cgo-titulo">${esc(o.titulo)}</h4>` : ''}
            <p class="cgo-txt">${esc(o.observacion)}</p>
          </article>`;
      }).join(''));
    },

    /* ══ Audiencias que pesca la competencia ════════════════════════════════
       Vera identifica a QUIÉN le habla cada competidor; el «+» la guarda en la biblioteca
       de la marca (marketing.audiences). Carrusel horizontal: fichas para hojear. ══ */
    async _paintVeraAudiencias(body, lectura) {
      const host = body.querySelector('#cgridAud');
      if (!host) return;
      const esc = (s) => this._esc(s);
      const titulo = __('Audiencias');
      const reading = lectura && !lectura.falta ? lectura.datos : null;
      const todas = ((reading && reading.reading && reading.reading.narrative) || [])
        .filter((b) => b && b.type === 'audiencia_competidor' && b.nombre);
      if (!todas.length) {
        this._pintar(host, this._todaviaNo(titulo, this._faltaTexto(lectura, __('Aparece cuando Vera vuelva a leer a tu competencia.'))));
        return;
      }
      // Recomendar lo que la marca YA adoptó es ruido: salen del carrusel.
      const yaEnBiblioteca = await this._cgridAudienciasAdoptadas();
      if (!this._sigue('competence')) return;
      const auds = todas.filter((b) => !yaEnBiblioteca.has(this._cgridAudKey(b.nombre)));
      if (!auds.length) {
        this._pintar(host, `<div class="cgrid-empty">${esc(__('Las audiencias que Vera vio en tu competencia ya están en tu biblioteca.'))}</div>`);
        return;
      }
      this._cgridAuds = auds;
      // Fichas con el color SÓLIDO de la marca; la tinta la resuelve la luminancia.
      const [accent] = this._coloresMarca();
      const card = body.querySelector('#cgridAudCard');
      if (card) card.style.setProperty('--cgp-accent', accent);
      if (typeof this._vestirPanelDeMarca === 'function') this._vestirPanelDeMarca(host, accent);

      this._pintar(host, auds.map((a, i) => `
        <article class="cga-item" data-aud-open="${esc(String(i))}" role="button" tabindex="0"
                 aria-label="${esc(__('Ver la audiencia {n}', { n: a.nombre }))}">
          <div class="cga-top">
            <h4 class="cga-quien">${esc(a.nombre)}</h4>
            ${a.perfil ? `<span class="cga-origen">${esc(__('la pesca {p}', { p: a.perfil }))}</span>` : ''}
          </div>
          <div class="cga-foot">
            <span class="cga-hint">${esc(__('Ver audiencia'))}</span>
            <button type="button" class="btn btn--oscuro btn--icono cga-add" data-aud-add="${esc(String(i))}"
                    title="${esc(__('Agregar a mi biblioteca'))}" aria-label="${esc(__('Agregar a mi biblioteca'))}">
              <i class="fas fa-plus" aria-hidden="true"></i>
            </button>
          </div>
        </article>`).join(''));
    },

    /* Clave de comparación de audiencias: mismo nombre aunque cambien mayúsculas, tildes o espacios. */
    _cgridAudKey(nombre) {
      return String(nombre || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
    },

    /* Nombres de la biblioteca de la marca. Fail-soft: si falla, se recomiendan todas. */
    async _cgridAudienciasAdoptadas() {
      const r = await window.DashboardDatos.audienciasBiblioteca(this._orgId);
      if (r.falta) return new Set();
      return new Set((r.datos || []).map((a) => this._cgridAudKey(a.nombre)));
    },

    /* Detalle de la audiencia: a quién describe, qué le duele, qué quiere, con qué la
       engancha el competidor — y el botón para agregarla. */
    _openAudienciaModal(idx) {
      const a = (this._cgridAuds || [])[Number(idx)];
      if (!a) return;
      const esc = (s) => this._esc(s);
      const lista = (v, cls) => (Array.isArray(v) ? v : []).filter(Boolean)
        .map((x) => `<li class="cgam-li ${cls}">${esc(String(x))}</li>`).join('');
      const html = `
        ${a.perfil ? `<div class="cgam-origen">${esc(__('Audiencia detectada en {p}', { p: a.perfil }))}</div>` : ''}
        ${a.descripcion ? `<p class="cgam-desc">${esc(a.descripcion)}</p>` : ''}
        <div class="cgam-cols">
          ${Array.isArray(a.dolores) && a.dolores.length ? `<div class="cgam-col"><div class="cgam-lbl">${esc(__('Le duele'))}</div><ul class="cgam-ul">${lista(a.dolores, 'is-dolor')}</ul></div>` : ''}
          ${Array.isArray(a.deseos) && a.deseos.length ? `<div class="cgam-col"><div class="cgam-lbl">${esc(__('Quiere'))}</div><ul class="cgam-ul">${lista(a.deseos, 'is-deseo')}</ul></div>` : ''}
        </div>
        ${a.gancho ? `<div class="cgam-gancho"><div class="cgam-lbl">${esc(__('Con qué la engancha'))}</div><p>${esc(a.gancho)}</p></div>` : ''}
        <button type="button" class="btn btn--blanco btn--bloque cgam-add" data-aud-add="${esc(String(idx))}">
          <i class="fas fa-plus" aria-hidden="true"></i> ${esc(__('Agregar a mi biblioteca'))}
        </button>`;
      const capa = this._modal({ titulo: a.nombre, html, clase: 'cgam-modal', tamano: 'md' });
      if (!capa) return;
      capa.cuerpo.addEventListener('click', async (e) => {
        const add = e.target.closest('[data-aud-add]');
        if (!add) return;
        const ok = await this._cgridAddAudiencia(add.dataset.audAdd, add);
        if (ok) capa.cerrar('agregada');
      });
    },

    /* Guarda una audiencia de la competencia en la biblioteca de la marca, dejando
       constancia de qué competidor salió. Devuelve true si quedó guardada. */
    async _cgridAddAudiencia(idx, btn) {
      const a = (this._cgridAuds || [])[Number(idx)];
      if (!a || !btn || btn.disabled) return false;
      const original = [...btn.childNodes].map((n) => n.cloneNode(true));
      btn.disabled = true;
      this._pintar(btn, `<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>${btn.classList.contains('cgam-add') ? ` ${this._esc(__('Guardando…'))}` : ''}`);
      try {
        await window.DashboardDatos.adoptarAudiencia(this._orgId, {
          nombre: String(a.nombre).slice(0, 160),
          descripcion: [a.descripcion, a.perfil ? __('Detectada en {p}.', { p: a.perfil }) : null].filter(Boolean).join(' '),
          dolores: a.dolores,
          deseos: a.deseos,
          gancho: a.gancho ? [a.gancho] : [],
        });
        btn.classList.add('is-done');
        this._pintar(btn, `<i class="fas fa-check" aria-hidden="true"></i>${btn.classList.contains('cgam-add') ? ` ${this._esc(__('En tu biblioteca'))}` : ''}`);
        window.showToast?.(__('«{n}» quedó en tu biblioteca de audiencias.', { n: a.nombre }), { type: 'success' });
        setTimeout(() => this._cgridRetirarAudiencia(idx), btn.closest('.cga-item') ? 420 : 0);
        return true;
      } catch (e) {
        console.warn('[CompGrid] no se pudo guardar la audiencia:', e?.message || e);
        btn.disabled = false;
        btn.replaceChildren(...original);
        btn.classList.add('is-error');
        setTimeout(() => btn.classList.remove('is-error'), 2200);
        const msg = e?.code === '42501' ? __('Tu rol no puede agregar audiencias a la biblioteca de esta marca.') : __('No se pudo guardar la audiencia. Inténtalo de nuevo.');
        window.showToast?.(msg, { type: 'error' });
        return false;
      }
    },

    /* Retira del carrusel la ficha ya adoptada (los data-aud-* apuntan a posiciones fijas). */
    _cgridRetirarAudiencia(idx) {
      const host = document.getElementById('cgridAud');
      const item = host?.querySelector(`.cga-item[data-aud-open="${Number(idx)}"]`);
      if (!item) return;
      item.classList.add('is-adoptada');
      setTimeout(() => {
        item.remove();
        if (host && !host.querySelector('.cga-item')) {
          this._pintar(host, `<div class="cgrid-empty">${this._esc(__('Las audiencias que Vera vio en tu competencia ya están en tu biblioteca.'))}</div>`);
        }
      }, 280);
    },

    /* ══ Panel de marca (drill-down de una columna) ═════════════════════════
       Todo lo recolectado de ese competidor en la ventana activa: totales, desglose por
       red, historial por día (apilado por plataforma) y las publicaciones. ═══════ */
    async _openBrandPanel(row) {
      const esc = (s) => this._esc(s);
      const rng = this._cgridRange || {};
      const capa = this._modal({ titulo: row.name, html: `<div class="cgrid-load">${esc(__('Reuniendo todo lo recolectado…'))}</div>`, clase: 'cgrid-panel' });
      if (!capa) return;
      // El chart del panel no se registra en _reg: tiene su propio ciclo de vida (el del modal).
      capa.cerrada.then(() => {
        try { this._cgpChart?.destroy(); } catch (e) { console.warn('[CompGrid] panel:', e?.message); }
        this._cgpChart = null;
      });
      const r = await window.DashboardDatos.detalleMarcaCompetencia(this._orgId, { perfiles: row.entityIds, desde: rng.desde, hasta: rng.hasta });
      const host = capa.cuerpo;
      if (!host.isConnected) return;
      const d = r.datos;
      if (r.falta || !d || !d.totals || !Number(d.totals.posts)) {
        this._pintar(host, r.falta
          ? this._todaviaNo(__('Todo lo recolectado'), this._faltaTexto(r, __('Necesita la actividad diaria de este competidor.')))
          : `<div class="cgrid-empty">${esc(__('Sin publicaciones recolectadas de esta marca en el periodo.'))}</div>`);
        return;
      }
      this._pintar(host, this._brandPanelHtml(row, d));
      this._bindCgridMediaFallback(host);
      try { await this._ensureChartJs(); } catch (e) { console.warn('[CompGrid] Chart.js:', e?.message); }
      this._paintBrandDailyChart(host, d);
    },

    _brandPanelHtml(row, d) {
      const esc = (s) => this._esc(s);
      const C = (n) => this._compactNum(Number(n) || 0);
      const t = d.totals || {};
      const nets = Array.isArray(d.by_platform) ? d.by_platform : [];
      const stat = (v, label, hint) => (Number(v) > 0 || label === __('publicaciones'))
        ? `<div class="cgp-stat"><span class="cgp-stat-v">${esc(C(v))}</span><small>${esc(label)}</small>${hint ? `<em>${esc(hint)}</em>` : ''}</div>` : '';

      // Interacción y alcance en filas separadas: no son la misma unidad.
      const reach = [stat(t.plays, __('reproducciones')), stat(t.comentarios_recolectados, __('comentarios leídos'), __('disponibles para analizar'))].join('');
      const statsHtml = `
        <div class="cgp-stats">
          ${stat(t.posts, __('publicaciones'))}
          ${stat(t.interacciones, __('interacciones'))}
          ${stat(t.likes, __('me gusta'))}
          ${stat(t.comments, __('comentarios'))}
          ${stat(t.saves, __('guardados'))}
          ${stat(t.shares, __('compartidos'))}
        </div>
        ${reach.trim() ? `<div class="cgp-stats cgp-stats--reach">${reach}</div>` : ''}`;

      const netsHtml = nets.length ? `
        <div class="cgp-block">
          <div class="cgp-block-title">${esc(__('Por plataforma'))}</div>
          <div class="cgp-nets">
            ${nets.map((n) => {
              const key = String(n.platform || '').toLowerCase();
              const ico = PLATFORM_ICON[key];
              const share = Number(n.share_pct) || 0;
              const handle = String(n.handle || '').replace(/^@+/, '');
              return `
                <div class="cgp-net">
                  <div class="cgp-net-head">
                    ${ico ? `<i class="${esc(ico)}" aria-hidden="true"></i>` : ''}
                    <span class="cgp-net-name">${esc(NET_LABEL[key] || key)}</span>
                    <span class="cgp-net-handle">${handle ? esc('@' + handle) : ''}</span>
                    <span class="cgp-net-share">${esc(String(share))}%</span>
                  </div>
                  <div class="cgrid-bar-track"><div class="cgrid-bar-fill" data-var="--lleno-f:${Math.max(1, share) / 100}" data-bg="${esc(this._cgridNetColor ? this._cgridNetColor(key) : this._coloresMarca()[0])}"></div></div>
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
          <div class="cgp-posts">${posts.map((p) => this._cgpPostHtml(p)).join('')}</div>
        </div>` : '';

      return statsHtml + netsHtml + dailyHtml + postsHtml;
    },

    _cgridFecha(iso) {
      if (!iso) return '';
      try {
        const loc = (window.i18n && window.i18n.getLocale && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO';
        return new Date(iso).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) { return ''; }
    },

    /* Una publicación del panel (forma brand_posts de v1 que entrega DashboardDatos). */
    _cgpPostHtml(p) {
      const esc = (s) => this._esc(s);
      const C = (n) => this._compactNum(Number(n) || 0);
      const key = String(p.network || '').toLowerCase();
      const ico = PLATFORM_ICON[key];
      const url = this._cgridPostUrl(key, p.post_id, p.profile_handle, p.permalink);
      const when = this._cgridFecha(p.captured_at);
      const a = (p.media_assets && typeof p.media_assets === 'object') ? p.media_assets : {};
      const first = (v) => (Array.isArray(v) && v.length ? v[0] : null);
      const pick = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v)) ? v : null;
      // `archived_url` primero: copia permanente en R2 (las del CDN caducan).
      const img = [a.archived_url, a.display_url, a.main_image_url, a.cover_image, a.thumbnail_url,
        first(a.thumbnails), first(a.images), first(a.media_urls)].map(pick).find(Boolean);
      const m = p.metrics || {};
      const bits = [
        Number(m.likes) > 0 ? `♥ ${C(m.likes)}` : null,
        Number(m.comments) > 0 ? `💬 ${C(m.comments)}` : null,
        Number(m.saves) > 0 ? `🔖 ${C(m.saves)}` : null,
        Number(m.views) > 0 ? `▶ ${C(m.views)}` : null,
      ].filter(Boolean).join('  ');
      const tag = url ? 'a' : 'div';
      return `
        <${tag} class="cgp-post"${url ? ` href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : ''}>
          ${img
            ? `<div class="cgp-post-thumb">
                 <img data-cgrid-media src="${esc(img)}" alt="" loading="lazy">
                 <span class="cgp-post-thumb-fb" data-cgrid-fb hidden aria-hidden="true"><i class="fas fa-image"></i></span>
               </div>`
            : '<div class="cgp-post-thumb cgp-post-thumb--empty" aria-hidden="true"><i class="fas fa-image"></i></div>'}
          <div class="cgp-post-body">
            <div class="cgp-post-head">
              ${ico ? `<i class="${esc(ico)}" aria-hidden="true"></i>` : ''}
              <span class="cgp-post-when">${esc(when)}</span>
              <span class="cgp-post-eng">${esc(C(p.engagement_total))}</span>
            </div>
            ${p.content ? `<div class="cgp-post-copy">${esc(String(p.content).slice(0, 140))}</div>` : ''}
            ${bits ? `<div class="cgp-post-bits">${esc(bits)}</div>` : ''}
          </div>
        </${tag}>`;
    },

    /* Historial de actividad: publicaciones por día APILADAS por red. */
    _paintBrandDailyChart(scope, d) {
      const Chart = window.Chart;
      const canvas = scope.querySelector('#cgpDailyChart');
      if (!Chart || !canvas) return;
      const daily = Array.isArray(d.daily) ? d.daily : [];
      if (!daily.length) return;
      const tinta = this._tintaCharts();
      // Solo los últimos 30 días CON actividad: "Todo" daría cientos de columnas de 1px.
      const days = [...new Set(daily.map((x) => x.date))].sort().slice(-30);
      const nets = [...new Set(daily.map((x) => x.platform))];
      const byKey = new Map();
      daily.forEach((x) => { const k = `${x.date}|${x.platform}`; byKey.set(k, (byKey.get(k) || 0) + (Number(x.posts) || 0)); });
      const fmtDay = (iso) => {
        try { return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }); } catch (e) { return iso; }
      };
      const [accent] = this._coloresMarca();
      const datasets = nets.map((n, i) => ({
        label: NET_LABEL[String(n).toLowerCase()] || n,
        data: days.map((dd) => byKey.get(`${dd}|${n}`) || 0),
        backgroundColor: this._cgridNetColor ? this._cgridNetColor(n) : this._rgba(accent, [0.95, 0.68, 0.45, 0.3][i] || 0.2),
        borderRadius: (ctx) => {
          const val = Number(ctx.raw) || 0;
          if (val <= 0) return 0;
          const ch = ctx.chart;
          let topIdx = -1;
          for (let j = 0; j < ch.data.datasets.length; j++) {
            if (!ch.isDatasetVisible(j)) continue;
            if (Number(ch.data.datasets[j].data[ctx.dataIndex] || 0) > 0) topIdx = j;
          }
          return ctx.datasetIndex === topIdx ? { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 } : 0;
        },
        borderSkipped: false,
        maxBarThickness: 26,
        stack: 'posts',
      }));
      try { this._cgpChart?.destroy(); } catch (e) { console.warn('[CompGrid] panel:', e?.message); }
      this._cgpChart = new Chart(canvas, {
        type: 'bar',
        data: { labels: days.map(fmtDay), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { color: tinta.tick, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
            tooltip: tinta.tooltip,
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: tinta.tick, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { stacked: true, grid: { color: tinta.grid }, border: { display: false }, beginAtZero: true, ticks: { color: tinta.tick, font: { size: 10 }, precision: 0, maxTicksLimit: 4 } },
          },
        },
      });
    },

    /* ══ La publicación que más movió ═══════════════════════════════════════
       Preview real (portada archivada), copy completo colapsado y los comentarios
       que dejó la gente. ═══════════════════════════════════════════════════ */
    _paintTopPost(body, data) {
      const host = body.querySelector('#cgridTopPost');
      if (!host) return;
      const esc = (s) => this._esc(s);
      const titulo = __('Publicación con mayor tráfico');
      if (data.falta) {
        this._pintar(host, this._todaviaNo(titulo, this._faltaTexto(data.falta, __('Necesita las métricas de las publicaciones de tu competencia.'))));
        return;
      }
      if (data.sinPosts) {
        this._pintar(host, this._todaviaNo(titulo, __('Aún no hay publicaciones de tu competencia.')));
        return;
      }
      const top = data.top || {};
      if (top.falta) {
        this._pintar(host, this._todaviaNo(titulo, this._faltaTexto(top, __('Necesita las métricas de las publicaciones de tu competencia.'))));
        return;
      }
      const win = top.datos && top.datos.post;
      if (!win) {
        this._pintar(host, `<div class="cgrid-empty">${esc(__('Sin publicaciones de competencia en este periodo.'))}</div>`);
        return;
      }
      this._pintar(host, this._cgridPostCardHtml(win, top.datos.comentarios || []));
      this._bindCgridMediaFallback(host);
      this._bindCgridCarrusel(host);
    },

    /* La pieza completa (media + copy + comentarios). Compartida con la Publicación
       destacada de Mi Marca, que puede sumarle su «¿Por qué funcionó?» en `extra`. */
    _cgridPostCardHtml(post, comments, extra = '') {
      const esc = (s) => this._esc(s);
      const C = (n) => this._compactNum(n);
      const net = String(post.network || '').toLowerCase();
      const handle = String(post.profile_handle || '').replace(/^@+/, '');
      const url = this._cgridPostUrl(net, post.post_id, handle, post.permalink);
      const copy = String(post.content || '').trim();
      const topComments = (comments || [])
        .map((c) => ({ ...c, _l: Number(c.metrics && c.metrics.likes) || 0 }))
        .sort((a, b) => b._l - a._l)
        .slice(0, 4);
      const commentsHtml = topComments.length ? `
        <div class="cgrid-comments">
          <div class="cgrid-comments-title">${esc(__('Lo que dijo la gente'))} <span class="cgrid-comments-n">${esc(__('{n} comentarios leídos', { n: comments.length }))}</span></div>
          ${topComments.map((c) => `
            <div class="cgrid-comment">
              <span class="cgrid-comment-who">${esc('@' + String(c.author_handle || '').replace(/^@+/, ''))}</span>
              <span class="cgrid-comment-txt">${esc(String(c.content || '').slice(0, 180))}</span>
              ${c._l > 0 ? `<span class="cgrid-comment-likes">${esc(`♥ ${C(c._l)}`)}</span>` : ''}
            </div>`).join('')}
        </div>` : '';
      const media = this._cgridMediaHtml(post.media_assets, { network: net, postId: post.post_id, postUrl: url });
      const copyHtml = copy ? `
        <details class="cgrid-post-copy-box">
          <summary class="cgrid-post-copy-sum">
            <span class="cgrid-post-copy-peek">${esc(copy.replace(/\s+/g, ' ').slice(0, 90))}${copy.length > 90 ? '…' : ''}</span>
            <i class="aisc-ico aisc-ico--chevron-down" aria-hidden="true"></i>
          </summary>
          <p class="cgrid-post-copy">${esc(copy)}</p>
        </details>` : '';
      return `
        <article class="cgrid-post-card">
          ${media}
          ${copyHtml}
          ${extra}
          ${commentsHtml}
        </article>`;
    },

    /* Array crudo [{url,type,permalink}] → objeto con las claves que espera el resolver.
       NO inventa `archived_url`: esas filas nunca se archivaron. */
    _cgridNormalizeMedia(ma, pick) {
      if (!ma || typeof ma !== 'object') return {};
      if (!Array.isArray(ma)) return ma;
      const items = ma.filter((x) => x && typeof x === 'object' && pick(x));
      if (!items.length) return {};
      const esVideo = (x) => /video|reel|clip/i.test(String(x.type || x.media_type || ''));
      const img = items.find((x) => !esVideo(x)) || items[0];
      const vid = items.find(esVideo);
      return {
        display_url: pick(img),
        video_url: vid ? pick(vid) : undefined,
        permalink: img.permalink || (vid && vid.permalink) || undefined,
      };
    },

    /* Media del post. Las URLs de CDN de Instagram/TikTok van FIRMADAS y caducan: todo
       media se monta con fallback tipográfico — nunca un cuadro roto. Sin reproductores
       incrustados (CSP): la portada archivada es la preview. */
    _cgridMediaHtml(ma, ctx) {
      const esc = (s) => this._esc(s);
      const { network, postUrl } = ctx || {};
      const first = (v) => (Array.isArray(v) && v.length ? v[0] : null);
      const pick = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v)) ? v
        : (v && typeof v === 'object' && typeof v.url === 'string') ? v.url : null;
      const a = this._cgridNormalizeMedia(ma, pick);
      // `archived_url` PRIMERO: la copia en R2 no caduca.
      const archived = pick(a.archived_url);
      const img = [a.archived_url, a.display_url, a.main_image_url, a.cover_image, a.thumbnail_url,
        first(a.thumbnails), first(a.images), first(a.media_urls), first(a._legacy_array)]
        .map(pick).find(Boolean);
      const rawVideo = pick(a.video_url);
      // `video_url` no siempre es un archivo reproducible (en TikTok es la página del post).
      const video = this._cgridIsPlayable(rawVideo) ? rawVideo : null;
      const net0 = String(network || '').toLowerCase();
      const esVideoPost = Boolean(rawVideo) || net0 === 'tiktok' || net0 === 'youtube'
        || /video|reel|clip/i.test(String(a.media_type || ''));
      const esVideoNoReproducible = esVideoPost && !video;

      const fallback = `
        <div class="cgrid-media-fb" data-cgrid-fb hidden>
          <i class="fas fa-image cgrid-media-fb-ico" aria-hidden="true"></i>
          <span class="cgrid-media-fb-kicker">${esc(__('Vista previa no disponible'))}</span>
        </div>`;

      // FORMATO DECLARADO: si el backfill guardó las dimensiones reales, mandan ellas.
      const W = Number(a.width) || 0;
      const H = Number(a.height) || 0;
      const ratioFijo = (W > 0 && H > 0)
        ? ` data-ratio-fijo="1" data-ar="${W} / ${H}" data-maxw="${Math.round(MAX_H * (W / H))}"`
        : '';

      // Un carrusel se pinta como lo que es: una tira deslizable.
      const piezas = Array.isArray(a.items) ? a.items.filter((x) => x && typeof x.url === 'string') : [];
      if (piezas.length > 1) return this._cgridCarruselHtml(piezas, { ratioFijo, fallback });

      if (video) {
        // Si el video del CDN muere, se muestra la miniatura archivada; solo sin ella, el aviso.
        return `<div class="cgrid-media"${ratioFijo}>
          <video class="cgrid-media-el" data-cgrid-media${archived ? ` data-cgrid-alt="${esc(archived)}"` : ''} controls preload="metadata" playsinline${img ? ` poster="${esc(img)}"` : ''}>
            <source src="${esc(video)}">
          </video>
          ${archived ? `<img class="cgrid-media-el cgrid-media-alt" data-cgrid-altimg src="${esc(archived)}" alt="" loading="lazy" hidden>` : ''}
          ${fallback}</div>`;
      }
      if (img) {
        // Video sin archivo reproducible: el play lleva al original.
        const red = NET_LABEL[net0] || __('la red');
        const play = (esVideoNoReproducible && postUrl)
          ? `<a class="cgrid-media-play" href="${esc(postUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(__('Ver el video en {r}', { r: red }))}" aria-label="${esc(__('Ver el video en su red'))}"><i class="fas fa-play" aria-hidden="true"></i></a>`
          : (esVideoNoReproducible ? '<span class="cgrid-media-play is-static" aria-hidden="true"><i class="fas fa-play"></i></span>' : '');
        return `<div class="cgrid-media"${ratioFijo}>
          <img class="cgrid-media-el" data-cgrid-media src="${esc(img)}" alt="" loading="lazy">
          ${play}
          ${fallback}</div>`;
      }
      return `<div class="cgrid-media">${fallback.replace(' hidden', '')}</div>`;
    },

    /* Carrusel: tira deslizable con scroll-snap. Sin librería y sin timers. */
    _cgridCarruselHtml(piezas, ctx) {
      const esc = (s) => this._esc(s);
      const { ratioFijo, fallback } = ctx;
      const slides = piezas.map((p, i) => `
        <div class="cgrid-slide" data-cgrid-slide="${i}" role="group" aria-roledescription="${esc(__('diapositiva'))}"
             aria-label="${esc(__('{n} de {t}', { n: i + 1, t: piezas.length }))}">
          <img class="cgrid-media-el" data-cgrid-media src="${esc(p.url)}" alt="" loading="${i === 0 ? 'eager' : 'lazy'}">
          ${p.type === 'video' ? '<span class="cgrid-slide-video" aria-hidden="true"><i class="fas fa-play"></i></span>' : ''}
        </div>`).join('');
      const puntos = piezas.map((_, i) => `
        <button type="button" class="cgrid-dot${i === 0 ? ' is-active' : ''}" data-cgrid-goto="${i}"
          aria-label="${esc(__('Ir a la pieza {n}', { n: i + 1 }))}"></button>`).join('');
      return `
        <div class="cgrid-media cgrid-media--carrusel"${ratioFijo} data-cgrid-carrusel>
          <div class="cgrid-track" data-cgrid-track>${slides}</div>
          <button type="button" class="cgrid-nav cgrid-nav--prev" data-cgrid-nav="-1" aria-label="${esc(__('Anterior'))}"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
          <button type="button" class="cgrid-nav cgrid-nav--next" data-cgrid-nav="1" aria-label="${esc(__('Siguiente'))}"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
          <span class="cgrid-contador" data-cgrid-contador>${piezas.length > 0 ? `1/${piezas.length}` : ''}</span>
          ${fallback}
          <div class="cgrid-dots" data-cgrid-dots>${puntos}</div>
        </div>`;
    },

    /* Los puntos, las flechas y el contador siguen al scroll real de la tira. */
    _bindCgridCarrusel(scope) {
      if (!scope) return;
      const cajas = [...scope.querySelectorAll('[data-cgrid-carrusel]')];
      if (scope.matches?.('[data-cgrid-carrusel]')) cajas.unshift(scope);
      cajas.forEach((car) => {
        if (car.dataset.carruselBound === '1') return;
        car.dataset.carruselBound = '1';
        const track = car.querySelector('[data-cgrid-track]');
        const dots = [...car.querySelectorAll('[data-cgrid-goto]')];
        const contador = car.querySelector('[data-cgrid-contador]');
        if (!track || !dots.length) return;
        const total = dots.length;
        const indice = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        const sincronizar = () => {
          const i = Math.max(0, Math.min(total - 1, indice()));
          dots.forEach((d, n) => d.classList.toggle('is-active', n === i));
          if (contador) contador.textContent = `${i + 1}/${total}`;
          car.querySelector('.cgrid-nav--prev')?.toggleAttribute('disabled', i === 0);
          car.querySelector('.cgrid-nav--next')?.toggleAttribute('disabled', i === total - 1);
        };
        const ir = (i) => track.scrollTo({ left: Math.max(0, Math.min(total - 1, i)) * track.clientWidth, behavior: 'smooth' });
        this.addEventListener(track, 'scroll', () => {
          if (car._sincroPendiente) return;
          car._sincroPendiente = requestAnimationFrame(() => { car._sincroPendiente = null; sincronizar(); });
        });
        this.addEventListener(car, 'click', (e) => {
          const nav = e.target.closest('[data-cgrid-nav]');
          if (nav) { e.preventDefault(); ir(indice() + Number(nav.dataset.cgridNav)); return; }
          const goto = e.target.closest('[data-cgrid-goto]');
          if (goto) { e.preventDefault(); ir(Number(goto.dataset.cgridGoto)); }
        });
        sincronizar();
      });
    },

    /* Los reproductores incrustados de las redes se retiraron (la CSP no admite sus
       iframes). Se conserva el nombre para quien lo llamaba: no hace nada. */
    _bindCgridEmbeds() {},

    /* ¿Esta URL es media que un <video> puede reproducir, o la página del post? */
    _cgridIsPlayable(u) {
      if (!u) return false;
      try {
        const url = new URL(u);
        const h = url.hostname.toLowerCase().replace(/^www\./, '');
        if (/^(tiktok\.com|instagram\.com|facebook\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)$/.test(h)) return false;
        return /\.(mp4|m4v|webm|mov|m3u8)$/i.test(url.pathname);
      } catch (e) { return false; }
    },

    _bindCgridMediaFallback(scope) {
      if (!scope) return;
      scope.querySelectorAll('[data-cgrid-media]').forEach((el) => {
        const fb = el.parentElement && el.parentElement.querySelector('[data-cgrid-fb]');
        let ok = false;
        // Respaldo intermedio: la miniatura archivada, que no caduca.
        const alt = el.parentElement && el.parentElement.querySelector('[data-cgrid-altimg]');
        const fail = () => {
          if (ok) return;
          el.hidden = true;
          if (alt && alt.hidden) { alt.hidden = false; return; }
          if (fb) fb.hidden = false;
        };
        const succeed = () => {
          ok = true;
          el.hidden = false;
          if (fb) fb.hidden = true;
        };
        if (alt) {
          alt.addEventListener('error', () => { alt.hidden = true; if (fb) fb.hidden = false; }, { once: true });
          this._cgridFitMedia(alt);
        }
        this._cgridFitMedia(el);
        if (el.tagName === 'VIDEO') {
          el.addEventListener('loadedmetadata', succeed, { once: true });
          el.addEventListener('loadeddata', succeed, { once: true });
          el.addEventListener('canplay', succeed, { once: true });
          el.addEventListener('error', fail, { once: true });
          if (el.readyState >= 1) succeed();
          else if (el.error) fail();
        } else {
          el.addEventListener('load', succeed, { once: true });
          el.addEventListener('error', fail, { once: true });
          if (el.complete) { if (el.naturalWidth > 0) succeed(); else fail(); }
        }
      });
    },

    /* El contenedor adopta el FORMATO REAL del medio (un reel vertical se ve vertical).
       El 4/5 del CSS solo reserva el hueco mientras carga. */
    _cgridFitMedia(el) {
      if (!el) return;
      const apply = (w, h) => {
        if (!w || !h) return;
        const stage = el.closest('.cgrid-media');
        if (!stage || stage.dataset.ratioFijo === '1') return;
        stage.style.aspectRatio = `${w} / ${h}`;
        // Acotar por ANCHO: el alto cae solo dentro del tope y el ratio se respeta.
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

    /* Los posts de competencia casi nunca guardan permalink: la URL pública se reconstruye
       desde network + id externo + handle. */
    _cgridPostUrl(net, postId, handle, permalink) {
      if (permalink && /^https?:\/\//i.test(permalink)) return permalink;
      const id = postId != null ? String(postId).trim() : '';
      if (!id) return null;
      const h = String(handle || '').trim().replace(/^@+/, '');
      switch (String(net || '').toLowerCase()) {
        case 'instagram': {
          if (!/^\d+$/.test(id)) return null;
          const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
          let n = BigInt(id);
          let sc = '';
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
