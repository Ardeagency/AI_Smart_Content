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
          <section class="bgrid-card glass-black cgrid-card--influencia">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--chart-bar" aria-hidden="true"></i>${this._esc(__('Influencia digital'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('Cuánta conversación genera cada competidor y en qué red la genera · toca una barra para ver todo lo recolectado'))}</p>
            <nav class="bgrid-seg" role="tablist" aria-label="${this._esc(__('Periodo'))}">${seg}</nav>
            <div class="cgrid-bars" id="cgridBars"><div class="cgrid-load">${this._esc(__('Cargando perfiles…'))}</div></div>
            <div class="cgrid-legend" id="cgridLegend"></div>
          </section>
          <section class="bgrid-card glass-black cgrid-card--toppost">
            <header class="bgrid-card-head">
              <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--fire" aria-hidden="true"></i>${this._esc(__('La publicación que más movió'))}</span>
            </header>
            <p class="bgrid-card-sub">${this._esc(__('El contenido de tu competencia con más respuesta del público en el periodo'))}</p>
            <div class="cgrid-post" id="cgridTopPost"><div class="cgrid-load">${this._esc(__('Buscando la publicación…'))}</div></div>
          </section>
        </div>`;
    },

    _bindCompGrid(body) {
      if (body.dataset.cgridBound === '1') return;
      body.dataset.cgridBound = '1';
      body.addEventListener('click', (e) => {
        const bar = e.target.closest('[data-brand]');
        if (bar) {
          const row = (this._cgridRows || [])[Number(bar.dataset.brand)];
          if (row) this._openBrandPanel(row);
          return;
        }
        const btn = e.target.closest('[data-cwindow]');
        if (!btn) return;
        const k = btn.dataset.cwindow;
        if (!k || k === this._cgridWindow) return;
        this._cgridWindow = k;
        body.querySelectorAll('.bgrid-seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.cwindow === k));
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
      this._paintInfluenceBars(body, data);
      this._paintTopPost(body, data);
    },

    /* ══ Card 1: Influencia digital ═════════════════════════════════════════
       Barra = interacciones generadas en el periodo (lo que de verdad movió),
       no seguidores: un perfil grande y callado no manda en la conversación.
       Bajo cada barra, el contexto que evita la lectura ingenua: por post,
       cuántos posts, y el tamaño de su audiencia. ═══════════════════════ */
    _paintInfluenceBars(body, data) {
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
        .sort((a, b) => b.eng - a.eng);

      if (!rows.length) {
        host.innerHTML = `<div class="cgrid-empty">${esc(__('Sin actividad capturada de tus competidores en este periodo. Prueba una ventana más amplia.'))}</div>`;
        return;
      }

      this._cgridRows = rows;
      const [accent] = this._gridBrandHexes();
      const [r, g, b] = this._hexToRgb(accent);
      const max = Math.max(...rows.map((x) => x.eng));
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

      host.innerHTML = rows.map((x, i) => {
        const pct = Math.max(2, Math.round(x.eng / max * 100));
        const tipo = TIPO_LABEL[x.tipo] ? TIPO_LABEL[x.tipo]() : '';
        // La barra se APILA por plataforma: el ancho total es el impacto de la
        // marca; cada segmento, la tajada que aporta ese canal. Se lee de un
        // vistazo dónde vive de verdad su influencia.
        const segs = x.profiles
          .filter((pr) => Number(pr.share_pct) > 0)
          .map((pr) => {
            const key = String(pr.platform || '').toLowerCase();
            const w = Number(pr.share_pct) || 0;
            const label = `${NET_LABEL[key] || key} · ${w}%`;
            return `<span class="cgrid-bar-seg" style="width:${w}%;background:${this._cgridNetColor(key)}" title="${esc(label)}"></span>`;
          }).join('');
        // Los canales de la marca como iconos: la red se identifica sola, el
        // nombre queda limpio. El canal dominante va resaltado.
        const nets = x.platforms.map((pf) => {
          const key = String(pf || '').toLowerCase();
          const ico = PLATFORM_ICON[key];
          const title = NET_LABEL[key] || key;
          return ico
            ? `<i class="cgrid-bar-ico ${esc(ico)}${key === x.topPlatform ? ' is-top' : ''}" title="${esc(title)}" aria-label="${esc(title)}"></i>`
            : `<span class="cgrid-bar-net">${esc(title)}</span>`;
        }).join('');
        const bits = [
          __('{n}/publicación', { n: C(x.perPost) }),
          __('{n} publicaciones', { n: x.posts }),
        ];
        if (x.followers > 0) bits.push(__('{n} seguidores', { n: C(x.followers) }));
        // Influencia normalizada: separa "grande" de "influyente".
        if (x.per1k != null && x.per1k > 0) bits.push(__('{n} por cada 1.000 seguidores', { n: C(x.per1k) }));
        const canales = x.platforms.length > 1
          ? __('{n} canales unificados', { n: x.platforms.length }) : '';
        return `
          <button type="button" class="cgrid-bar-row${i === 0 ? ' is-leader' : ''}" data-brand="${esc(String(i))}" aria-label="${esc(__('Ver detalle de {b}', { b: x.name }))}">
            <div class="cgrid-bar-top">
              <span class="cgrid-bar-name">${esc(x.name)}</span>
              <span class="cgrid-bar-nets">${nets}</span>
              ${tipo ? `<span class="cgrid-bar-tipo" data-tipo="${esc(x.tipo)}">${esc(tipo)}</span>` : ''}
              ${i === 0 ? `<span class="cgrid-bar-lead">${esc(__('Más influencia'))}</span>` : ''}
              <span class="cgrid-bar-val">${esc(C(x.eng))}</span>
            </div>
            <div class="cgrid-bar-track">
              <div class="cgrid-bar-stack" style="width:${pct}%">${segs}</div>
            </div>
            <div class="cgrid-bar-sub">${esc(bits.join(' · '))}${canales ? `<span class="cgrid-bar-canales">${esc(canales)}</span>` : ''}</div>
          </button>`;
      }).join('');

      // Leyenda única de la card (no una por barra): el tono es consistente.
      const legend = body.querySelector('#cgridLegend');
      if (legend) {
        legend.innerHTML = netOrder.map((key) => {
          const ico = PLATFORM_ICON[key];
          return `<span class="cgrid-leg">
            <i class="cgrid-leg-dot" style="background:${this._cgridNetColor(key)}"></i>
            ${ico ? `<i class="${esc(ico)}" aria-hidden="true"></i>` : ''}${esc(NET_LABEL[key] || key)}</span>`;
        }).join('');
      }
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
      document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });

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
      const img = [a.display_url, a.main_image_url, a.cover_image, a.thumbnail_url,
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
            ? `<div class="cgp-post-thumb"><img data-cgrid-media src="${esc(img)}" alt="" loading="lazy"><span class="cgp-post-thumb-fb" data-cgrid-fb hidden></span></div>`
            : `<div class="cgp-post-thumb cgp-post-thumb--empty" aria-hidden="true"></div>`}
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

      const metric = (v, label) => (Number(v) > 0)
        ? `<div class="cgrid-metric"><span class="cgrid-metric-v">${esc(C(Number(v)))}</span><small>${esc(label)}</small></div>` : '';
      const metrics = [
        metric(m.likes, __('me gusta')),
        metric(m.comments, __('comentarios')),
        metric(m.saves != null ? m.saves : m.bookmarks, __('guardados')),
        metric((Number(m.shares) || 0) + (Number(m.reposts) || 0) + (Number(m.retweets) || 0), __('compartidos')),
        metric(reach, net === 'youtube' || net === 'x' ? __('vistas') : __('reproducciones')),
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

      const media = this._cgridMediaHtml(full && full.media_assets, copy);

      host.innerHTML = `
        <article class="cgrid-post-card">
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
          ${media}
          ${copy ? `<p class="cgrid-post-copy">${esc(copy.slice(0, 600))}${copy.length > 600 ? '…' : ''}</p>` : ''}
          <div class="cgrid-metrics">${metrics}</div>
          ${commentsHtml}
          ${url ? `<a class="cgrid-post-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(__('Ver publicación original'))} ↗</a>` : ''}
        </article>`;

      this._bindCgridMediaFallback(host);
    },

    /* Media del post. Las URLs de CDN de Instagram/TikTok van FIRMADAS y
       caducan: una preview vieja da 403. Por eso todo media se monta con
       fallback tipográfico — nunca un cuadro roto. */
    _cgridMediaHtml(ma, copy) {
      const esc = (s) => this._esc(s);
      const a = (ma && typeof ma === 'object') ? ma : {};
      const first = (v) => (Array.isArray(v) && v.length ? v[0] : null);
      const pick = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v)) ? v
        : (v && typeof v === 'object' && typeof v.url === 'string') ? v.url : null;
      const img = [a.display_url, a.main_image_url, a.cover_image, a.thumbnail_url,
        first(a.thumbnails), first(a.images), first(a.media_urls), first(a._legacy_array)]
        .map(pick).find(Boolean);
      const video = pick(a.video_url);

      const fallback = `
        <div class="cgrid-media-fb" data-cgrid-fb hidden>
          <span class="cgrid-media-fb-kicker">${esc(__('Vista previa no disponible'))}</span>
          ${copy ? `<span class="cgrid-media-fb-copy">${esc(copy.slice(0, 140))}</span>` : ''}
        </div>`;

      if (video) {
        return `<div class="cgrid-media">
          <video class="cgrid-media-el" data-cgrid-media controls preload="metadata" playsinline${img ? ` poster="${esc(img)}"` : ''}>
            <source src="${esc(video)}">
          </video>${fallback}</div>`;
      }
      if (img) {
        return `<div class="cgrid-media">
          <img class="cgrid-media-el" data-cgrid-media src="${esc(img)}" alt="" loading="lazy">${fallback}</div>`;
      }
      return `<div class="cgrid-media">${fallback.replace(' hidden', '')}</div>`;
    },

    _bindCgridMediaFallback(scope) {
      scope.querySelectorAll('[data-cgrid-media]').forEach((el) => {
        const fail = () => {
          el.hidden = true;
          const fb = el.parentElement && el.parentElement.querySelector('[data-cgrid-fb]');
          if (fb) fb.hidden = false;
        };
        el.addEventListener('error', fail, { once: true });
        // <video> no dispara 'error' en el elemento cuando falla el <source>.
        const src = el.querySelector && el.querySelector('source');
        if (src) src.addEventListener('error', fail, { once: true });
      });
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
