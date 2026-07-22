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
            <p class="bgrid-card-sub">${this._esc(__('Cuánta conversación genera cada competidor en el periodo · likes, comentarios, compartidos y guardados'))}</p>
            <nav class="bgrid-seg" role="tablist" aria-label="${this._esc(__('Periodo'))}">${seg}</nav>
            <div class="cgrid-bars" id="cgridBars"><div class="cgrid-load">${this._esc(__('Cargando perfiles…'))}</div></div>
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

      const [accent] = this._gridBrandHexes();
      const [r, g, b] = this._hexToRgb(accent);
      const max = Math.max(...rows.map((x) => x.eng));
      const C = (n) => this._compactNum(n);

      host.innerHTML = rows.map((x, i) => {
        const pct = Math.max(2, Math.round(x.eng / max * 100));
        // El líder va en acento pleno; el resto se atenúa por posición para que
        // la jerarquía se lea sin necesidad de comparar números.
        const alpha = i === 0 ? 0.95 : Math.max(0.18, 0.62 - i * 0.07);
        const tipo = TIPO_LABEL[x.tipo] ? TIPO_LABEL[x.tipo]() : '';
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
          <div class="cgrid-bar-row${i === 0 ? ' is-leader' : ''}">
            <div class="cgrid-bar-top">
              <span class="cgrid-bar-name">${esc(x.name)}</span>
              <span class="cgrid-bar-nets">${nets}</span>
              ${tipo ? `<span class="cgrid-bar-tipo" data-tipo="${esc(x.tipo)}">${esc(tipo)}</span>` : ''}
              ${i === 0 ? `<span class="cgrid-bar-lead">${esc(__('Más influencia'))}</span>` : ''}
              <span class="cgrid-bar-val">${esc(C(x.eng))}</span>
            </div>
            <div class="cgrid-bar-track">
              <div class="cgrid-bar-fill" style="width:${pct}%;background:rgba(${r},${g},${b},${alpha})"></div>
            </div>
            <div class="cgrid-bar-sub">${esc(bits.join(' · '))}${canales ? `<span class="cgrid-bar-canales">${esc(canales)}</span>` : ''}</div>
          </div>`;
      }).join('');
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
