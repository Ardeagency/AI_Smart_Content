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
        if (!this._shouldRepaint('my-brands', data)) return; // refresh silencioso sin cambios: no re-pintar
        if (this._isMyBrandsEmpty(data)) { this._renderConnectPlatformsEmpty(body); return; }
        this._renderHeroCards?.(data); // alimenta las cards del hero
        body.innerHTML = this._buildMyBrandsHtml(data);
        this._bindMyBrandsHandlers(body);
        this._renderLongitudinalCharts(data);
        this._renderPillarsBubble(data);
        this._renderToneTopicDonuts(data);
      } catch (e) {
        console.error('[MyBrands] loadAll failed:', e);
        if (this._silentRefresh) return; // fallo transitorio del polling: conservar la vista actual
        body.innerHTML = this._buildMyBrandsErrorHtml(e);
      }
    },

    async _loadMyBrandsData() {
      const f = this._mbFilters || { windowDays: 30, brandContainerId: null };
      const [data, platformPerf] = await Promise.all([
        this._campanasService.loadAll({
          dateFromIso: f.dateFrom || null,
          dateToIso:   f.dateTo   || null,
          windowDays:  f.windowDays,
          brandIds:    f.brandContainerId ? [f.brandContainerId] : null,
          platforms:   f.platforms || null,
        }),
        this._loadPlatformPerf().catch(() => null),
      ]);
      if (data) data.platformPerf = platformPerf;
      return data;
    },

    /* Rendimiento por plataforma para la card de Salud ("cual rinde mejor"):
       - Redes sociales: engagement/post de TUS posts propios, por red.
       - Marketplaces (Mercado Libre, etc.): reputacion del vendedor (metrica
         distinta a engagement — no se mezcla en la misma escala). */
    async _loadPlatformPerf() {
      if (!this._supabase || !this._orgId) return null;
      let ids = (this._campanasService?.containers || []).map((c) => c.id).filter(Boolean);
      if (!ids.length) {
        const { data: cs } = await this._supabase.from('brand_containers').select('id').eq('organization_id', this._orgId);
        ids = (cs || []).map((c) => c.id).filter(Boolean);
      }
      if (!ids.length) return null;
      const [postsRes, integRes] = await Promise.all([
        this._supabase.from('brand_posts')
          .select('network, engagement_total, sentiment_score')
          .in('brand_container_id', ids).eq('post_source', 'own').limit(5000),
        this._supabase.from('brand_integrations')
          .select('platform, is_active, rep:metadata->seller_reputation_level, power:metadata->power_seller_status')
          .in('brand_container_id', ids).eq('is_active', true),
      ]);
      const agg = {};
      (postsRes.data || []).forEach((p) => {
        const n = String(p.network || '').toLowerCase(); if (!n) return;
        if (!agg[n]) agg[n] = { posts: 0, eng: 0, sentSum: 0, sentN: 0 };
        agg[n].posts++; agg[n].eng += Number(p.engagement_total) || 0;
        if (p.sentiment_score != null) { agg[n].sentSum += Number(p.sentiment_score); agg[n].sentN++; }
      });
      const social = Object.keys(agg).map((n) => ({
        network: n, posts: agg[n].posts,
        engPerPost: Math.round(agg[n].eng / agg[n].posts),
        sentiment: agg[n].sentN ? agg[n].sentSum / agg[n].sentN : null,
      })).sort((a, b) => b.engPerPost - a.engPerPost);
      const MKT = new Set(['mercadolibre', 'shopify', 'amazon']);
      const marketplaces = (integRes.data || [])
        .filter((r) => MKT.has(String(r.platform || '').toLowerCase()))
        .map((r) => ({ platform: String(r.platform).toLowerCase(), reputation: r.rep || null, power: r.power || null }));
      return { social, marketplaces };
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
        if (this._isMyBrandsEmpty(data)) { this._renderConnectPlatformsEmpty(body); return; }
        body.innerHTML = this._buildMyBrandsHtml(data);
        this._bindMyBrandsHandlers(body);
        this._renderLongitudinalCharts(data);
        this._renderPillarsBubble(data);
        this._renderToneTopicDonuts(data);
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
      if (this._silentRefresh) return; // auto-refresh: conservar contenido hasta el swap
      body.innerHTML = `
        <div class="insight-page mb-page">
          <div class="mb-gauge-skeleton skeleton-shimmer"></div>
          <div style="height:1rem;"></div>
          ${BaseView.skeletonGrid ? BaseView.skeletonGrid(5) : ''}
        </div>`;
    },

    _renderEmptyOrgState(body) {
      if (!body) return;
      if (body.querySelector('[data-mb-empty="no-org"]')) return; // idempotente (ver _renderConnectPlatformsEmpty)
      body.innerHTML = `
        <div class="insight-page" data-mb-empty="no-org">
          ${this.emptyState({
            iconSrc: '/recursos/icons/dashboard.svg',
            icon: 'fa-building',
            title: __('Sin organización activa'),
            subtitle: __('Selecciona una marca desde el menú para empezar.'),
          })}
        </div>`;
    },

    /* El tablero se alimenta de brand_posts de las plataformas conectadas. Si no
       hay NINGUNA señal de datos (ni salud, ni posts, ni actividad, ni recepción),
       lo tratamos como "marca sin plataformas conectadas" y mostramos un empty
       state propio (distinto al del resto de paginas) con CTA "Conectar
       plataformas". Conservador: cualquier señal real de datos evita el empty. */
    _isMyBrandsEmpty(data) {
      if (!data) return true;
      // OJO: NO usar health.score como señal de "hay datos". El RPC de salud
      // FABRICA un score (ej. 18/100 "Crítico") a partir de ceros aunque no
      // exista contenido — penaliza a una org recien creada por no publicar. La
      // señal real es la EXISTENCIA DE POSTS. La serie de actividad puede venir
      // rellena de periodos en cero, asi que sumamos posts_count en vez de mirar
      // solo el length; topPosts/comments solo traen filas si hay contenido.
      const rows = (b) => (Array.isArray(b?.data) ? b.data : []);
      const sumPosts = (b) => rows(b).reduce((s, r) => s + (Number(r?.posts_count) || 0), 0);
      const hasPosts =
        sumPosts(data.longitudinal?.activity) > 0 ||
        sumPosts(data.activity) > 0 ||
        rows(data.topPosts).length > 0 ||
        rows(data.comments).length > 0;
      return !hasPosts;
    },

    _renderConnectPlatformsEmpty(body) {
      if (!body) return;
      // Idempotente: el auto-refresh (60s) re-entra aqui porque la firma de datos
      // cambia (los RPC traen computed_at: now()). Si el empty YA esta en pantalla
      // no reconstruimos el DOM — evita el repintado del spotlight (mask-image) y
      // el parpadeo/lag periodico. Chequeo por DOM real (robusto ante cambio de tab).
      if (body.querySelector('[data-mb-empty="connect"]')) return;
      // Sin datos, las cards del plan del hero quedarian en shimmer infinito. Las
      // vaciamos para que el empty state sea limpio (banner + tabs siguen visibles).
      const heroCards = document.getElementById('dashHeroCards');
      if (heroCards) heroCards.innerHTML = '';
      body.innerHTML = `
        <div class="insight-page" data-mb-empty="connect">
          ${this.emptyState({
            iconSrc: '/recursos/icons/dashboard.svg',
            icon: 'fa-circle-nodes',
            title: __('Conecta tus plataformas'),
            subtitle: __('El tablero analiza la salud de tu marca a partir de tus redes sociales. Conecta Instagram, TikTok, X u otras plataformas para empezar a ver métricas, audiencia y las recomendaciones de Vera.'),
            primaryLabel: __('Conectar plataformas'),
            primaryAction: 'connect-platforms',
          })}
        </div>`;
      this._bindConnectPlatformsCta(body);
    },

    _bindConnectPlatformsCta(body) {
      const btn = body && body.querySelector('[data-action="connect-platforms"]');
      if (!btn || !window.router) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        // Lleva a Identidad (brand-organization) y deja la señal para que la vista
        // abra automaticamente el panel INFO, donde estan las conexiones de
        // plataformas. (brand-storage esta desactivado durante la demo.)
        try { localStorage.setItem('brands_open_info', '1'); } catch (_) {}
        const path = window.location.pathname || '';
        const base = path.startsWith('/org/') ? path.split('/').slice(0, 4).join('/') : '';
        window.router.navigate(base ? `${base}/brand` : '/brand-organization');
      });
    },

    _buildMyBrandsErrorHtml(err) {
      const msg = this._esc(err?.message || String(err) || __('Error desconocido'));
      return `
        <div class="insight-page" style="text-align:center; padding-top:4rem;">
          <h2 style="margin:0 0 0.5rem; font-size:1.25rem; color:var(--text-primary);">${__('No se pudo cargar el dashboard')}</h2>
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
              ${this._buildLongitudinalSection(data)}
              ${this._buildReceptionSection(data?.postReception?.data)}
              ${this._buildToneTopicSection(data?.featured)}
              ${this._buildCommentsSection(data?.comments?.data)}
              ${this._buildLeverageSection(insights)}
              ${this._buildTopPostsSection(data?.topPosts?.data)}
            </div>
            <aside class="mb-layout-aside">
              ${this._buildHealthGauge(data?.health?.data, data?.platformPerf)}
              ${this._buildBrandDiagnosisCard(data?.health?.data, data?.pillars?.data)}
            </aside>
          </div>
        </div>`;
    },

    /* ── Plan de accion: Explota / Optimiza / Elimina / Vigila ─────────
       Calcula los 4 items (que explotar, optimizar, eliminar y vigilar) a
       partir de la data existente. Lo consume tanto la seccion del cuerpo
       (_buildActionPlanSection) como el hero del dashboard. */
    /* ── Plan de accion ESTRATEGICO: Lo que funciona / Oportunidad / Lo que te
       resta / Riesgo. Selecciona por IMPACTO real (pilares > palancas), con
       baseline explicito, guardrail de muestra (n>=5 = fiable; n<5 = señal
       temprana) y anclaje al Brand DNA. Cada item trae un `detail` (modal
       consultor: por que / como / evidencia). Lo consume el hero del dashboard. */
    _computeActionPlanItems(data, insights) {
      const N_MIN = 5;
      const r = (x) => Math.round(Number(x) || 0);
      // Las 4 cards se arman desde RPCs de SÍNTESIS (what_wins / opportunities /
      // what_drags / risk_composite). `detail` arma el modal cuando no hay findings.
      const detail = (color, cat, ttl, why, how, evid) => ({
        color, category: cat, title: ttl,
        sections: [
          { h: __('¿Por qué te conviene?'), b: why },
          { h: __('¿Cómo lo exploto?'), b: how },
          { h: __('Evidencia y confianza'), b: evid },
        ],
      });
      // ── LO QUE FUNCIONA = SÍNTESIS de virtudes (dashboard_brand_what_wins): pilares/dims
      // ganadores + por qué funcionó el top post + mejor campaña de conversión.
      let explota = null;
      const ww = data?.whatWins?.data || null;
      const wwFindings = (ww && Array.isArray(ww.findings)) ? ww.findings : [];
      const wwDom = (ww && ww.dominant) || wwFindings[0] || null;
      if (wwDom) {
        const subj = wwDom.subject || '';
        const lift = Math.abs(r(wwDom.lift));
        const byKey = {
          campana:  { title: __('Tu campaña "{s}" convirtió alto', { s: subj }), metric: this._compactNum(wwDom.n), sub: __('conversiones — reusa el enfoque'), action: __('Reúsalo') },
          top_post: { title: __('Tu mejor post tiene un gancho ganador'),       metric: '',                        sub: subj ? __('gatillo: {s}', { s: subj }) : __('replícalo'), action: __('Replícalo') },
          pilar:    { title: __('Tu pilar "{s}" sostiene la marca', { s: subj }), metric: `+${lift}%`, sub: __('{n} posts sobre tu promedio', { n: wwDom.n }), action: __('Protégelo') },
          tono:     { title: __('Tu tono "{s}" rinde', { s: subj }),             metric: `+${lift}%`, sub: __('{n} posts sobre tu promedio', { n: wwDom.n }), action: __('Produce más de esto') },
          tema:     { title: __('Tu tema "{s}" rinde', { s: subj }),             metric: `+${lift}%`, sub: __('{n} posts sobre tu promedio', { n: wwDom.n }), action: __('Produce más de esto') },
          formato:  { title: __('Tu formato "{s}" rinde', { s: subj }),          metric: `+${lift}%`, sub: __('{n} posts sobre tu promedio', { n: wwDom.n }), action: __('Úsalo más') },
        };
        const g = byKey[wwDom.key] || byKey.tono;
        explota = {
          title: g.title, metric: g.metric, metricSub: g.sub,
          action: g.action, impact: 'alto',
          earlySignal: (wwDom.n != null && wwDom.key !== 'campana' && wwDom.n < N_MIN),
          detail: {
            color: 'explota', category: __('Lo que funciona'), title: __('Tus fortalezas'),
            findings: wwFindings,
            sections: [{
              h: __('¿Qué está ganando?'),
              b: __('Tus fortalezas con mayor impacto — combina campañas, posts, pilares, tonos y temas. Replica y potencia las de arriba:'),
            }],
          },
        };
      }

      // ── OPORTUNIDAD: SÍNTESIS de subexplotados (alto lift + bajo uso) desde
      //    dashboard_brand_opportunities: pilares huérfanos + tonos/temas/formatos
      //    poco usados. El glance lidera con la mayor oportunidad; detalle = todas.
      let optimiza = null;
      const op = data?.opportunities?.data || null;
      const opFindings = (op && Array.isArray(op.findings)) ? op.findings : [];
      const opDom = (op && op.dominant) || opFindings[0] || null;
      if (opDom) {
        const subj = opDom.subject || '';
        const lift = Math.abs(r(opDom.lift));
        const titleByKey = {
          pilar:   __('"{s}" rinde pero casi no lo usas', { s: subj }),
          tono:    __('Tu tono "{s}" rinde pero lo usas poco', { s: subj }),
          tema:    __('Tu tema "{s}" rinde pero lo usas poco', { s: subj }),
          formato: __('Tu formato "{s}" rinde pero lo usas poco', { s: subj }),
        };
        optimiza = {
          title: titleByKey[opDom.key] || __('"{s}" rinde pero lo usas poco', { s: subj }),
          metric: `+${lift}%`,
          metricSub: opDom.n != null ? __('solo {n} posts', { n: opDom.n }) : __('subexplotado'),
          action: opDom.early ? __('Prueba 3-4 posts y mide') : __('Súbelo en tu mezcla'),
          impact: 'medio', earlySignal: !!opDom.early,
          detail: {
            color: 'optimiza', category: __('Oportunidad'), title: __('Oportunidades subexplotadas'),
            findings: opFindings,
            sections: [{
              h: __('¿Qué rinde y no aprovechas?'),
              b: __('Esto rinde sobre tu promedio pero casi no lo usas — súbelo en tu mezcla y mide. Las de muestra chica, valídalas con 3-4 posts antes de escalar:'),
            }],
          },
        };
      }

      // ── LO QUE TE RESTA: SÍNTESIS de fugas (no una). Viene de
      //    dashboard_brand_what_drags: drags de tono/tema/formato + pilar
      //    sobre-invertido + caída causal temporal, rankeados por costo.
      let elimina = null;
      const wd = data?.whatDrags?.data || null;
      const wdFindings = (wd && Array.isArray(wd.findings)) ? wd.findings : [];
      const wdDom = (wd && wd.dominant) || wdFindings[0] || null;
      if (wdDom) {
        const subj = wdDom.subject || '';
        const lift = Math.abs(r(wdDom.lift));
        const titleByKey = {
          pilar:        __('Pilar "{s}" te resta', { s: subj }),
          tono:         __('Tu tono "{s}" te resta', { s: subj }),
          tema:         __('Tu tema "{s}" te resta', { s: subj }),
          formato:      __('Tu formato "{s}" te resta', { s: subj }),
          caida_causal: __('Tu impacto viene cayendo'),
        };
        const subByKey = {
          pilar:        __('sobre-invertido en tu mezcla ({n} posts)', { n: wdDom.n }),
          caida_causal: __('desde que usas más "{s}"', { s: subj }),
        };
        elimina = {
          title: titleByKey[wdDom.key] || __('"{s}" te resta', { s: subj }),
          metric: `−${lift}%`,
          metricSub: subByKey[wdDom.key] || (wdDom.n != null ? __('{n} posts bajo tu promedio', { n: wdDom.n }) : __('bajo tu promedio')),
          action: __('Replantéalo'), impact: Number(wdDom.severity) >= 15 ? 'alto' : 'medio', earlySignal: false,
          detail: {
            color: 'elimina', category: __('Lo que te resta'), title: __('Fugas de tu marca'),
            findings: wdFindings,
            sections: [{
              h: __('¿Qué te está costando?'),
              b: __('Estas son las fugas que más te restan impacto, de mayor a menor — combina tonos, temas, formatos y pilares. Replantea las de arriba primero:'),
            }],
          },
        };
      }

      // ── RIESGO COMPUESTO (reputación + desempeño): combina cómo reacciona el
      //    público (hostilidad/sentimiento/crisis) con la salud del contenido
      //    propio (posts fuera de tono / Brand Soul, fatiga, claridad). Lidera con
      //    la señal más severa; el detalle desglosa todas. NO es una sola señal.
      const cr = data?.alertScore?.data || null;
      let vigila = null;
      if (cr) {
        const findings = Array.isArray(cr.findings) ? cr.findings : [];
        const dom = cr.dominant || findings[0] || null;
        const fMeta = {
          tono_desviado: { sub: __('fuera de tu tono de marca'),   action: __('Realínealo') },
          fatiga:        { sub: __('con fatiga de contenido'),     action: __('Renueva el formato') },
          claridad:      { sub: __('con mensaje poco claro'),      action: __('Aclara el mensaje') },
          hostiles:      { sub: __('comentarios hostiles'),        action: __('Revísalo') },
          negativos:     { sub: __('comentarios negativos'),       action: __('Revísalo') },
          crisis:        { sub: __('señales de crisis'),           action: __('Atiéndelo') },
        };
        if (!dom) {
          vigila = {
            title: __('Riesgo de marca'),
            metric: __('Sin riesgos'), metricSub: __('detectados en el periodo'),
            action: __('Ver detalle'), impact: 'bajo', earlySignal: false,
            detail: detail('vigila', __('Riesgo'), __('Riesgo de marca'),
              __('No detectamos señales de riesgo (reputación ni desempeño) en el periodo. Buena señal — mantén el monitoreo.'),
              __('Sigue publicando con tu tono de marca y atendiendo los comentarios de tu público.'),
              __('{p} posts y {c} comentarios analizados, sin flags.', { p: Number(cr.posts_analyzed) || 0, c: Number(cr.scored_comments) || 0 })),
          };
        } else {
          const m = fMeta[dom.key] || { sub: dom.label, action: __('Revísalo') };
          const metric = dom.total != null ? `${dom.n}/${dom.total}` : `${dom.n}`;
          const sev = Number(dom.severity) || 0;
          const hasRep = findings.some((x) => x.category === 'reputacion');
          vigila = {
            title: __('Riesgo de marca'),
            metric, metricSub: m.sub,
            action: m.action, impact: sev >= 50 ? 'alto' : sev >= 25 ? 'medio' : 'bajo', earlySignal: false,
            detail: {
              color: 'vigila', category: __('Riesgo'),
              title: __('{b} · riesgo de marca', { b: cr.brand_name || __('tu marca') }),
              risk: hasRep, findings,
              sections: [{
                h: __('¿Qué está en riesgo?'),
                b: __('Tu riesgo combina REPUTACIÓN (cómo reacciona tu público) y DESEMPEÑO (si tu contenido mantiene tono, frescura y claridad). Señales activas, de mayor a menor:'),
              }],
            },
          };
        }
      }

      return { explota, optimiza, elimina, vigila };
    },

    /* Seccion "Momentum" del cuerpo: signos vitales (engagement vs previo,
       volumen y consistencia). Las cards del plan de accion (Explota/Optimiza/
       Elimina/Vigila) ya viven en el hero del dashboard — aqui no se duplican. */
    _buildActionPlanSection(data) {
      const oi = data?.optimizationInsights?.data || null;
      if (!oi) return '';

      // Engagement del periodo: interacciones REALES de seguidores que reaccionan
      // (likes + comentarios + compartidos + guardados). Excluye vistas/repro-
      // ducciones a proposito: esas son alcance/publico frio, no compromiso. La
      // RPC lo entrega en `engagement_interactions` (mismo dataset que "posts
      // analizados"). Sustituye al "engagement vs periodo previo", que mostraba
      // "—" cuando no hay un periodo anterior comparable (p. ej. "Todo el periodo").
      const engInteractions = oi.engagement_interactions != null ? Number(oi.engagement_interactions) : null;
      const engStr = engInteractions == null ? '—' : this._compactNum(engInteractions);

      // Consistencia POR SEMANAS: % de semanas del periodo con al menos una
      // publicacion. El subtitulo "N de M semanas activas" la hace auto-explicativa
      // (un cliente entiende de inmediato de donde sale el porcentaje).
      const pc = oi.posting_consistency || null;
      const cons = pc ? `${Math.round(Number(pc.posting_consistency_pct))}%` : '—';
      const consSub = (pc && pc.total_weeks != null)
        ? __('{a} de {b} semanas activas', { a: Number(pc.active_weeks) || 0, b: Number(pc.total_weeks) || 0 })
        : '';

      // El pie (.mb-plan-vital-foot) se ancla al fondo de la celda (margin-top:auto
      // en CSS) para que las ETIQUETAS de las 3 metricas queden alineadas abajo,
      // tengan o no subtitulo. El subtitulo va encima de la etiqueta.
      const vital = (val, lbl, { cls = '', sub = '', tip = '' } = {}) => `
        <div class="mb-plan-vital"${tip ? ` title="${this._esc(tip)}"` : ''}>
          <span class="mb-plan-vital-val ${cls}">${this._esc(val)}</span>
          <div class="mb-plan-vital-foot">
            ${sub ? `<span class="mb-plan-vital-sub">${this._esc(sub)}</span>` : ''}
            <span class="mb-plan-vital-lbl">${this._esc(lbl)}</span>
          </div>
        </div>`;

      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-plan-vitals">
            ${vital(engStr, __('Engagement del periodo'), { tip: __('Interacciones reales de tus seguidores en el periodo: likes, comentarios, compartidos y guardados. No cuenta vistas ni reproducciones (alcance/público frío que no reacciona).') })}
            ${vital(fmt.int(oi.posts_analyzed), __('Posts analizados'), { tip: __('Número de publicaciones propias analizadas en el periodo.') })}
            ${vital(cons, __('Consistencia de publicacion'), { sub: consSub, tip: __('Porcentaje de semanas del periodo en las que publicaste al menos una vez (desde tu primer post).') })}
          </div>
        </section>`;
    },

    /* ════════════════ Widgets de contenido + publico ════════════════ */

    /** Icono FA (brands) por red social. */
    _platformIcon(net) {
      const n = String(net || '').toLowerCase();
      if (n.includes('insta')) return 'fa-instagram';
      if (n.includes('face'))  return 'fa-facebook';
      if (n.includes('tik'))   return 'fa-tiktok';
      if (n === 'x' || n.includes('twit')) return 'fa-x-twitter';
      if (n.includes('you'))   return 'fa-youtube';
      if (n.includes('link'))  return 'fa-linkedin';
      return 'fa-hashtag';
    },
    /** Clase de sentimiento POS/NEU/NEG. */
    _sentClass(s) {
      const v = String(s || '').toUpperCase();
      return v === 'POS' ? 'pos' : v === 'NEG' ? 'neg' : 'neu';
    },
    _capWords(s) { const t = String(s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); },

    /* ── Top posts de tu marca: tabla (perfil/contenido/metricas/analisis/link) ── */
    _sentLabel(s) {
      const v = String(s || '').toUpperCase();
      return v === 'POS' ? __('Positivo') : v === 'NEG' ? __('Critico') : v === 'NEU' ? __('Neutro') : __('Sin datos');
    },
    _fmtPostDate(ts) {
      if (!ts) return '';
      try {
        const d = new Date(ts);
        return d.toLocaleDateString((window.i18n && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) +
          ' ' + d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
      } catch (_) { return ''; }
    },
    _postUrl(p) {
      // Permalink real del post (lo trae el sync de Meta en url_external_id).
      const ext = String(p.url_external_id || '');
      if (/^https?:\/\//.test(ext)) return ext;
      // Fallback: perfil de la cuenta (cuando aun no hay permalink sincronizado).
      const h = String(p.profile_handle || '').replace(/^@/, '');
      const n = String(p.network || '').toLowerCase();
      if (!h) return '';
      if (n.includes('insta')) return `https://www.instagram.com/${h}/`;
      if (n.includes('face'))  return `https://www.facebook.com/${h}`;
      if (n.includes('tik'))   return `https://www.tiktok.com/@${h}`;
      if (n === 'x' || n.includes('twit')) return `https://x.com/${h}`;
      if (n.includes('you'))   return `https://www.youtube.com/@${h}`;
      return '';
    },
    _postMetricsHtml(m) {
      m = m || {};
      const n = (v) => Number(v) || 0;
      const views = n(m.reach) || n(m.impressions) || n(m.video_views);
      const isVideo = n(m.video_views) > 0;
      // Interacciones sociales primero (likes/comentarios/guardados/compartidos),
      // alcance pasivo (vistas/reproducciones) al final.
      const rows = [
        { i: 'fa-heart',    v: n(m.likes),    c: '#e06464', show: true },
        { i: 'fa-comment',  v: n(m.comments), c: '#5b9bd5', show: true },
        { i: 'fa-bookmark', v: n(m.saved),    c: '#e0a045', show: n(m.saved) > 0 },
        { i: 'fa-retweet',  v: n(m.shares),   c: '#6bcf7f', show: n(m.shares) > 0 },
        { i: isVideo ? 'fa-play' : 'fa-eye', v: views, c: '#a78bfa', show: views > 0 },
      ].filter((r) => r.show);
      return rows.map((r) => `<span class="mb-tpt-metric"><i class="fas ${r.i}" style="color:${r.c}"></i> ${this._compactNum(r.v)}</span>`).join('');
    },
    _buildTopPostsSection(rows) {
      const list = (Array.isArray(rows) ? rows : []).slice(0, 3);
      if (!list.length) return '';
      const items = list.map((p) => {
        const topics = (Array.isArray(p.topics) ? p.topics : []).slice(0, 2);
        const sc = this._sentClass(p.sentiment_text);
        const url = this._postUrl(p);
        return `
          <div class="mb-tpt-row">
            <div class="mb-tpt-profile">
              <span class="mb-tpt-net"><i class="fab ${this._platformIcon(p.network)}"></i></span>
              <div>
                <div class="mb-tpt-name">@${this._esc(String(p.profile_handle || '').replace(/^@/, ''))}</div>
                <div class="mb-tpt-date">${this._esc(this._fmtPostDate(p.captured_at))}</div>
              </div>
            </div>
            <div class="mb-tpt-content">${this._esc(p.content_preview || '')}</div>
            <div class="mb-tpt-metrics">${this._postMetricsHtml(p.metrics)}</div>
            <div class="mb-tpt-analysis">
              <span class="mb-tpt-sent mb-tpt-sent--${sc}">${this._sentLabel(p.sentiment_text)}</span>
              ${topics.map((t) => `<span class="mb-tag">${this._esc(this._capWords(t))}</span>`).join('')}
            </div>
            <div class="mb-tpt-go">${url ? `<a class="mb-tpt-link" href="${this._esc(url)}" target="_blank" rel="noopener" aria-label="${__('Abrir perfil')}"><i class="aisc-ico aisc-ico--external-link"></i></a>` : ''}</div>
          </div>`;
      }).join('');
      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-chart-card mb-tpt-card">
            <div class="mb-card-title">${__('Top 3 publicaciones destacadas')}</div>
            <div class="mb-tpt">
              <div class="mb-tpt-head">
                <span>${__('Perfil')}</span><span>${__('Contenido')}</span><span>${__('Métricas')}</span><span>${__('Análisis')}</span><span></span>
              </div>
              ${items}
            </div>
          </div>
        </section>`;
    },

    /* ── Recepción del público: score DINÁMICO por publicación (−100..+100) desde
       el sentimiento de SUS comentarios, no el engagement bruto. Destaca cuál
       resonó más y cuál cayó. ── */
    _buildReceptionSection(rows) {
      const list = (Array.isArray(rows) ? rows : []).filter((r) => Number(r.comments_count) > 0);
      if (!list.length) return '';
      const emoMap = { joy: __('Alegría'), anger: __('Ira'), disgust: __('Asco'), sadness: __('Tristeza'), fear: __('Miedo'), surprise: __('Sorpresa') };
      const item = (r, rank) => {
        const sc = Number(r.reception_score) || 0;
        const cls = sc >= 40 ? 'good' : sc >= 0 ? 'mid' : 'bad';
        const scoreStr = `${sc > 0 ? '+' : ''}${sc.toFixed(1)}`;
        const emoKey = String(r.dominant_emotion || '').toLowerCase();
        const emo = emoKey ? (emoMap[emoKey] || this._capWords(r.dominant_emotion)) : '';
        const n = Number(r.comments_count) || 0;
        const host = Number(r.hostile_count) || 0;
        return `
          <div class="mb-rcp-row">
            <span class="mb-rcp-rank">${rank}</span>
            <span class="mb-rcp-net"><i class="fab ${this._platformIcon(r.network)}"></i></span>
            <div class="mb-rcp-body">
              <div class="mb-rcp-snippet">${this._esc(r.snippet || '')}</div>
              <div class="mb-rcp-meta">
                ${emo ? `<span class="mb-rcp-emo">${this._esc(emo)}</span>` : ''}
                <span>${n} ${n === 1 ? __('comentario') : __('comentarios')}</span>
                ${host > 0 ? `<span class="mb-rcp-host">${host} ${host === 1 ? __('hostil') : __('hostiles')}</span>` : ''}
                ${n < 3 ? `<span class="mb-rcp-early">${__('señal temprana')}</span>` : ''}
              </div>
            </div>
            <div class="mb-rcp-score mb-rcp-score--${cls}">${this._esc(scoreStr)}</div>
            ${r.permalink ? `<a class="mb-rcp-link" href="${this._esc(r.permalink)}" target="_blank" rel="noopener" aria-label="${__('Abrir publicación')}"><i class="aisc-ico aisc-ico--external-link"></i></a>` : ''}
          </div>`;
      };
      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-chart-card mb-rcp-card">
            <div class="mb-card-title">${__('Recepción del público')}</div>
            <div class="mb-rcp-sub">${__('Qué tan bien recibió tu audiencia cada publicación, según el sentimiento de sus comentarios — no el engagement. Escala −100 a +100.')}</div>
            <div class="mb-rcp">${list.slice(0, 6).map((r, i) => item(r, i + 1)).join('')}</div>
          </div>
        </section>`;
    },

    /* ── Tonos + Temas: misma estructura (jerarquia + mas usado + mas efectivo) ── */
    _buildToneTopicSection(featured) {
      const f = featured || {};
      const tones = (Array.isArray(f.tones?.data) ? f.tones.data : []).map((r) => ({
        name: r.tone_name, used: Number(r.posts_count) || 0, eng: Number(r.total_engagement) || 0,
      }));
      const topics = (Array.isArray(f.topics?.data) ? f.topics.data : []).map((r) => ({
        name: r.topic_name, used: Number(r.usage_count) || 0, eng: Number(r.total_engagement) || 0,
      }));
      const toneCard = this._buildHierarchyCard(__('Tonos'), tones, 'mbToneDonut');
      const topicCard = this._buildHierarchyCard(__('Temas'), topics, 'mbTopicDonut');
      if (!toneCard && !topicCard) return '';
      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-long-grid">${toneCard}${topicCard}</div>
        </section>`;
    },

    /** Paleta de segmentos para donas (consistente entre leyenda y chart). */
    _palette() { return ['#6bcf7f', '#5b9bd5', '#e0a045', '#a78bfa', '#e06464', '#22d3ee', '#f472b6']; },

    /** Card jerarquia (tonos/temas): mas usado + mas efectivo + dona + leyenda. */
    _buildHierarchyCard(title, items, canvasId) {
      const list = (Array.isArray(items) ? items : []).filter((x) => x.name && x.used > 0);
      if (!list.length) return '';
      const withAvg = list.map((x) => ({ ...x, avg: x.used > 0 ? x.eng / x.used : 0 }));
      const mostUsed = [...withAvg].sort((a, b) => b.used - a.used)[0];
      const mostEff  = [...withAvg].sort((a, b) => b.avg - a.avg)[0];
      const ranked = [...withAvg].sort((a, b) => b.used - a.used).slice(0, 6);
      const total = ranked.reduce((s, x) => s + x.used, 0) || 0;
      const PAL = this._palette();
      const legend = ranked.map((x, i) => `
        <div class="mb-donut-leg">
          <span class="mb-donut-dot" style="background:${PAL[i % PAL.length]}"></span>
          <span class="mb-donut-leg-name">${this._esc(this._capWords(x.name))}</span>
          <span class="mb-donut-leg-val">${x.used}</span>
        </div>`).join('');
      return `
        <div class="mb-long-card">
          <div class="mb-card-title">${this._esc(title)}</div>
          <div class="mb-hier-stats">
            <div class="mb-hier-stat">
              <span class="mb-hier-stat-cap">${__('Más usado')}</span>
              <span class="mb-hier-stat-val">${this._esc(this._capWords(mostUsed.name))}</span>
              <span class="mb-hier-stat-sub">${__('{n} posts', { n: mostUsed.used })}</span>
            </div>
            <div class="mb-hier-stat mb-hier-stat--eff">
              <span class="mb-hier-stat-cap">${__('Más efectivo')}</span>
              <span class="mb-hier-stat-val">${this._esc(this._capWords(mostEff.name))}</span>
              <span class="mb-hier-stat-sub">${__('{n} eng/post', { n: this._compactNum(Math.round(mostEff.avg)) })}</span>
            </div>
          </div>
          <div class="mb-donut-wrap">
            <div class="mb-donut">
              <canvas id="${canvasId}"></canvas>
              <div class="mb-donut-center"><span class="mb-donut-center-val">${total}</span><span class="mb-donut-center-cap">${__('posts')}</span></div>
            </div>
            <div class="mb-donut-legend">${legend}</div>
          </div>
        </div>`;
    },

    /** Pinta las donas de Tonos y Temas (Chart.js doughnut). */
    async _renderToneTopicDonuts(data) {
      try { await this._ensureChartJs(); } catch (_) { /* noop */ }
      const Chart = window.Chart; if (!Chart) return;
      const PAL = this._palette();
      const f = data?.featured || {};
      const draw = (id, rows, nameKey, usedKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        const list = (Array.isArray(rows) ? rows : []).map((r) => ({ name: r[nameKey], used: Number(r[usedKey]) || 0 }))
          .filter((x) => x.name && x.used > 0).sort((a, b) => b.used - a.used).slice(0, 6);
        if (!list.length) return;
        try {
          this._reg(new Chart(el.getContext('2d'), {
            type: 'doughnut',
            data: { labels: list.map((x) => this._capWords(x.name)), datasets: [{
              data: list.map((x) => x.used),
              backgroundColor: list.map((_, i) => PAL[i % PAL.length]),
              borderColor: '#141517', borderWidth: 2, hoverOffset: 4,
            }] },
            options: {
              responsive: true, maintainAspectRatio: false, cutout: '66%',
              plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10, callbacks: { label: (c) => ' ' + __('{label}: {n} posts', { label: c.label, n: c.parsed }) } },
              },
            },
          }));
        } catch (e) { console.warn('[donut]', id, e?.message); }
      };
      draw('mbToneDonut', f.tones?.data, 'tone_name', 'posts_count');
      draw('mbTopicDonut', f.topics?.data, 'topic_name', 'usage_count');
    },


    /* ── Analisis de comentarios + comentarios de alto impacto ── */
    _buildCommentsSection(c) {
      if (!c || !Number(c.total)) return '';
      const pos = Number(c.pos) || 0, neu = Number(c.neu) || 0, neg = Number(c.neg) || 0;
      const known = (pos + neu + neg) || 1;
      const pct = (n) => Math.round(n / known * 100);
      const emos = (Array.isArray(c.top_emotions) ? c.top_emotions : []).slice(0, 4)
        .map((e) => `<span class="mb-cmt-emo">${this._esc(this._capWords(e.emotion))} <small>${this._compactNum(e.count)}</small></span>`).join('');
      const analisis = `
        <div class="mb-long-card">
          <div class="mb-card-title">${__('Análisis de comentarios')}</div>
          <div class="mb-cmt-total">${this._compactNum(c.total)} <small>${__('comentarios analizados')}</small></div>
          <div class="mb-cmt-sent">
            <span class="mb-cmt-seg mb-cmt-seg--pos" style="width:${pct(pos)}%"></span>
            <span class="mb-cmt-seg mb-cmt-seg--neu" style="width:${pct(neu)}%"></span>
            <span class="mb-cmt-seg mb-cmt-seg--neg" style="width:${pct(neg)}%"></span>
          </div>
          <div class="mb-cmt-legend">
            <span class="mb-cmt-leg mb-cmt-leg--pos">${__('{n}% positivo', { n: pct(pos) })}</span>
            <span class="mb-cmt-leg mb-cmt-leg--neu">${__('{n}% neutro', { n: pct(neu) })}</span>
            <span class="mb-cmt-leg mb-cmt-leg--neg">${__('{n}% negativo', { n: pct(neg) })}</span>
          </div>
          ${emos ? `<div class="mb-cmt-emos"><span class="mb-beh-label">${__('Emociones top')}</span><div class="mb-cmt-emo-list">${emos}</div></div>` : ''}
        </div>`;
      const items = (Array.isArray(c.top) ? c.top : []).slice(0, 5).map((t) => `
        <div class="mb-cmt-item">
          <span class="mb-cmt-dot mb-cmt-dot--${this._sentClass(t.sentiment)}"></span>
          <div class="mb-cmt-item-body">
            <p class="mb-cmt-item-text">${this._esc(t.content || '')}</p>
            <div class="mb-cmt-item-meta">
              <span class="mb-cmt-author">@${this._esc(String(t.author || '').replace(/^@/, ''))}</span>
              <span class="mb-cmt-eng"><i class="aisc-ico aisc-ico--likes"></i> ${this._compactNum(t.likes)}${Number(t.replies) ? ` · <i class="aisc-ico aisc-ico--reply"></i> ${this._compactNum(t.replies)}` : ''}</span>
            </div>
          </div>
        </div>`).join('');
      const impacto = items ? `
        <div class="mb-long-card">
          <div class="mb-card-title">${__('Comentarios de alto impacto')}</div>
          <div class="mb-cmt-list">${items}</div>
        </div>` : '';
      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-long-grid">${analisis}${impacto}</div>
        </section>`;
    },

    /* ── Que te impulsa y que te frena: barras divergentes hermanas ────────
       Unifica "lo que funciona" (boost, verde, derecha) y "lo que resta"
       (drag, rojo, izquierda) centradas en tu promedio (=0). Cada barra se
       escala vs el |lift| maximo para que ambos lados sean comparables. */
    _buildLeverageSection(insights) {
      const arr = Array.isArray(insights) ? insights : [];
      const dimLabel = { tono: __('Tono'), tema: __('Tema'), formato: __('Formato'), horario: __('Hora') };
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
              <div class="mb-card-title">${__('Que te impulsa y que te frena')}</div>
              <div class="mb-causal-empty" style="margin:0;">${__('No hay contenido propio analizado en esta ventana. Amplia el rango (prueba Todo el periodo).')}</div>
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
      const colNote = __('Sin senal clara aun.');
      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-chart-card">
            <div class="mb-card-title">${__('Que te impulsa y que te frena')}</div>
            <div class="mb-lev">
              <div class="mb-lev-col mb-lev-col--neg">
                <div class="mb-lev-coltitle">${__('Lo que te frena')}</div>
                ${drags.length ? drags.map(row).join('') : `<div class="mb-lev-empty">${colNote}</div>`}
              </div>
              <div class="mb-lev-col mb-lev-col--pos">
                <div class="mb-lev-coltitle">${__('Lo que te impulsa')}</div>
                ${boosts.length ? boosts.map(row).join('') : `<div class="mb-lev-empty">${colNote}</div>`}
              </div>
            </div>
          </div>
        </section>`;
    },

    /* ── Analisis longitudinal: series temporales propias de la marca ──────
       Inspirado en el dashboard de AI Partner, pero unico para la marca
       (no por perfil monitoreado). Charts Chart.js: historial de actividad,
       tendencia de engagement + crecimiento (doble eje), patron de horas y sentimientos. */
    _buildLongitudinalSection(data) {
      // Mi Marca V2 — Sprint 1 (docs/DASHBOARDS-V2-MIMARCA-REBUILD.md): esta
      // sección concentraba las cards descriptivas sin veredicto (historial de
      // actividad, tendencia de engagement, heatmap de horas, actividad de
      // sentimientos, chips de alertas). Se retiran de la UI — sus RPCs siguen
      // vivos para Vera y como historial; los charts se auto-desactivan por el
      // guard de canvas inexistente.
      // El banner de recencia ("Activo · Tu ultima publicacion fue hace N dias")
      // tambien se retira por pedido del usuario; _buildActivityBanner queda vivo
      // por si se reutiliza, pero ya no se pinta. La seccion no renderiza nada.
      return '';
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
      if (!max) return `<div class="mb-causal-empty" style="margin:0;">${__('Sin datos de horario aun.')}</div>`;
      const dayName = [__('Dom'), __('Lun'), __('Mar'), __('Mie'), __('Jue'), __('Vie'), __('Sab')];
      const order = [1, 2, 3, 4, 5, 6, 0];
      const bucket = (v) => { if (v <= 0) return 0; const r = v / max; if (r <= 0.25) return 1; if (r <= 0.5) return 2; if (r <= 0.75) return 3; return 4; };
      const rowsHtml = order.map((d) => {
        const cells = m[d].map((v, h) => {
          const t = `${dayName[d]} ${h}:00 · ${v} ${v === 1 ? __('post') : __('posts')}`;
          const cls = `mb-heat-cell mb-heat-cell--l${bucket(v)}${v > 0 ? ' mb-heat-cell--click' : ''}`;
          const attrs = v > 0 ? ` data-mb-hours-modal data-hour="${h}" role="button" tabindex="0"` : '';
          return `<span class="${cls}" title="${t}"${attrs}></span>`;
        }).join('');
        return `<span class="mb-heat-rowlbl">${dayName[d]}</span><div class="mb-heat-cells">${cells}</div>`;
      }).join('');
      return `
        <div class="mb-heat">
          <div class="mb-heat-legend">
            <span><i class="mb-heat-dot mb-heat-dot--l1"></i> ${__('Bajo')}</span>
            <span><i class="mb-heat-dot mb-heat-dot--l2"></i> ${__('Medio')}</span>
            <span><i class="mb-heat-dot mb-heat-dot--l3"></i> ${__('Alto')}</span>
            <span><i class="mb-heat-dot mb-heat-dot--l4"></i> ${__('Mejor')}</span>
          </div>
          <div class="mb-heat-grid">${rowsHtml}</div>
          <div class="mb-heat-axis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div>
        </div>`;
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
          ctx.fillStyle = 'rgba(107,207,127,0.65)'; ctx.fillText(__('EXPLOTALO'), ca.left + 6, ca.top + 5);
          ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(212,209,216,0.38)'; ctx.fillText(__('TU FORMULA'), ca.right - 6, ca.top + 5);
          ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(212,209,216,0.3)'; ctx.fillText(__('IGNORA'), ca.left + 6, ca.bottom - 5);
          ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(224,160,69,0.6)'; ctx.fillText(__('REVISA'), ca.right - 6, ca.bottom - 5);
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
                backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10,
                callbacks: {
                  title: () => null,
                  label: (c) => { const p = points[c.dataIndex]; return __('{label}: {use}% de uso · {sign}{perf}% rendimiento', { label: p.label, use: Math.round(p.x), sign: p.y >= 0 ? '+' : '', perf: p.y }) + (p.orphan ? ' · ' + __('huerfano') : ''); },
                },
              },
            },
            scales: {
              x: { min: 0, max: xMax, grid: { color: GRID }, border: { display: false }, title: { display: true, text: __('% de uso'), color: TICK, font: { size: 10 } }, ticks: { color: TICK, font: { size: 9 }, callback: (v) => v + '%', maxTicksLimit: 6 } },
              y: { min: yMin, max: yMax, grid: { color: GRID }, border: { display: false }, title: { display: true, text: __('Rendimiento vs promedio'), color: TICK, font: { size: 10 } }, ticks: { color: TICK, font: { size: 9 }, callback: (v) => (v > 0 ? '+' : '') + v + '%', maxTicksLimit: 6 } },
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
          tooltip: { backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10, displayColors: true },
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
      const actOpts = baseOpts();
      // Click en el chart → abre el popup enfocado en el periodo mas cercano.
      actOpts.onClick = (evt, els, chart) => {
        let idx = act.length - 1;
        try { const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false); if (pts && pts.length) idx = pts[0].index; } catch (_) {}
        this._openActivityModal(idx);
      };
      mk('mbLongActivity', { type: 'line', data: { labels: actLabels, datasets: [{
        label: __('Posts'), data: act.map((r) => Number(r.posts_count) || 0),
        borderColor: brandLine, backgroundColor: brandFill, fill: true, tension: 0.4, borderWidth: 2.5,
        // Un punto por cada periodo CON publicaciones (posts > 0); los ceros no marcan.
        pointRadius: (ctx) => (Number(ctx.parsed?.y) > 0 ? 3 : 0),
        pointHoverRadius: 5, pointBackgroundColor: brandHexes[brandHexes.length - 1],
        pointBorderColor: brandHexes[brandHexes.length - 1],
      }] }, options: actOpts });

      // 2+5. Tendencia de engagement (eje izq, absoluto, verde) + Crecimiento %
      // (eje der, ambar). Ambas series salen del mismo array `eng` y comparten el
      // eje X, asi que viven en un solo grafico de doble eje Y.
      if (eng.length) {
        const cv = document.getElementById('mbLongEngGrowth');
        const engData = eng.map((r) => Number(r.total_engagement) || 0);
        const datasets = [{
          label: __('Engagement'), data: engData, yAxisID: 'y',
          borderColor: '#6bcf7f', backgroundColor: grad(cv, '#6bcf7f'),
          fill: true, tension: 0.4, borderWidth: 2,
          pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: '#6bcf7f',
        }];
        if (eng.length > 1) {
          const growth = eng.map((r, i) => {
            if (i === 0) return 0;
            const prev = Number(eng[i - 1].total_engagement) || 0;
            const cur = Number(r.total_engagement) || 0;
            return prev > 0 ? Math.round((cur - prev) / prev * 100) : 0;
          });
          datasets.push({
            label: __('Crecimiento %'), data: growth, yAxisID: 'y1',
            borderColor: '#e0a045', backgroundColor: 'transparent',
            fill: false, tension: 0.4, borderWidth: 2, borderDash: [4, 3],
            pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: '#e0a045',
          });
        }
        const opts = baseOpts(compact);
        opts.plugins.legend = { display: true, labels: { color: TICK, boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 10 } } };
        opts.scales.y.position = 'left';
        opts.scales.y.ticks.color = '#6bcf7f';
        opts.scales.y1 = { position: 'right', grid: { display: false }, border: { display: false }, beginAtZero: false, ticks: { color: '#e0a045', font: { size: 10 }, maxTicksLimit: 5, callback: (v) => `${v}%` } };
        mk('mbLongEngGrowth', { type: 'line', data: { labels: eng.map((r) => r.period_label), datasets }, options: opts });
      }

      // 3. Patron de horas → heatmap CSS (no Chart.js), construido en _buildPostingHeatmap.

      // 4. Actividad de sentimientos (positivo / negativo / neutro)
      if (sent.length) {
        const sLbl = sent.map((r) => this._fmtMonthLabel(r.period_start));
        const cv = document.getElementById('mbLongSentiment');
        mk('mbLongSentiment', { type: 'line', data: { labels: sLbl, datasets: [
          areaDs(cv, __('Positivo'), sent.map((r) => Number(r.positive_posts) || 0), '#6bcf7f'),
          areaDs(cv, __('Neutro'), sent.map((r) => Number(r.neutral_posts) || 0), '#8a8a8e'),
          areaDs(cv, __('Negativo'), sent.map((r) => Number(r.negative_posts) || 0), '#e06464'),
        ] }, options: { ...baseOpts(), plugins: { legend: { display: true, labels: { color: TICK, boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 10 } } }, tooltip: baseOpts().plugins.tooltip } } });
      }

    },

    _fmtMonthLabel(ts) {
      try { return new Date(ts).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }); }
      catch (_) { return ''; }
    },

    /* ════════════════════════════════════════════════════════════════
       Popup detallado del Historial de actividad
       Click en un punto del chart → modal (primitiva Modal.show) enfocado en
       ESE periodo: muestra solo sus datos (posts, engagement, sentimiento) con
       flechas ‹ › para navegar. La linea completa queda como contexto, con el
       periodo seleccionado resaltado. Solo cruza activity/engagement/sentiment
       (no inventa metricas).
       ════════════════════════════════════════════════════════════════ */
    _openActivityModal(selIndex) {
      if (!window.Modal || typeof window.Modal.show !== 'function') return;
      const L = this._mbCampanasData?.longitudinal || {};
      const act  = Array.isArray(L.activity?.data)   ? L.activity.data   : [];
      const eng  = Array.isArray(L.engagement?.data) ? L.engagement.data : [];
      const sent = Array.isArray(L.sentiment?.data)  ? L.sentiment.data  : [];
      if (!act.length) return;

      const engByLabel  = new Map(eng.map((r) => [r.period_label, Number(r.total_engagement) || 0]));
      const sentByStart = new Map(sent.map((r) => [r.period_start, r]));
      const C = (n) => this._compactNum(n);
      const N = act.length;
      let sel = Number.isInteger(selIndex) ? Math.max(0, Math.min(N - 1, selIndex)) : N - 1;

      // Datos de UN solo periodo (el seleccionado).
      const periodData = (i) => {
        const r = act[i];
        const posts = Number(r.posts_count) || 0;
        const e = engByLabel.has(r.period_label)
          ? engByLabel.get(r.period_label)
          : (eng[i] ? Number(eng[i].total_engagement) || 0 : null);
        const sd = sentByStart.get(r.period_start);
        const p = sd ? Number(sd.positive_posts) || 0 : 0;
        const n = sd ? Number(sd.neutral_posts)  || 0 : 0;
        const g = sd ? Number(sd.negative_posts) || 0 : 0;
        return { r, posts, e, p, n, g, hasSent: !!sd };
      };

      const stat = (val, lbl) => `
        <div class="mb-actm-stat">
          <span class="mb-actm-stat-val">${val}</span>
          <span class="mb-actm-stat-lbl">${lbl}</span>
        </div>`;

      const body = `
        <div class="mb-actm">
          <div class="mb-actm-nav">
            <button class="mb-actm-navbtn" data-mb-act-prev type="button" aria-label="${__('Anterior')}"><i class="aisc-ico aisc-ico--chevron-left"></i></button>
            <div class="mb-actm-nav-info">
              <div class="mb-actm-period" data-mb-act-label></div>
              <div class="mb-actm-sub" data-mb-act-sub></div>
            </div>
            <button class="mb-actm-navbtn" data-mb-act-next type="button" aria-label="${__('Siguiente')}"><i class="aisc-ico aisc-ico--chevron-right"></i></button>
          </div>
          <div class="mb-actm-stats" data-mb-act-stats></div>
          <div class="mb-actm-content">
            <div class="mb-actm-content-title"><i class="aisc-ico aisc-ico--feed"></i> ${__('Contenido del periodo')}</div>
            <div class="mb-actm-content-body" data-mb-act-content></div>
          </div>
        </div>`;

      const { bodyEl } = window.Modal.show({
        title: __('Historial de actividad'),
        body,
        className: 'dash-modal',
      });

      const labelEl   = bodyEl.querySelector('[data-mb-act-label]');
      const subEl     = bodyEl.querySelector('[data-mb-act-sub]');
      const statsEl   = bodyEl.querySelector('[data-mb-act-stats]');
      const prevBtn   = bodyEl.querySelector('[data-mb-act-prev]');
      const nextBtn   = bodyEl.querySelector('[data-mb-act-next]');
      const contentEl = bodyEl.querySelector('[data-mb-act-content]');

      // Contenido del periodo: posts REALES de ese rango. Cache por indice +
      // token de request para que navegar rapido no pinte resultados viejos.
      const postsCache = new Map();
      let reqToken = 0;
      let lastContentIdx = -1;
      const renderPosts = (posts) => {
        if (!contentEl) return;
        if (posts == null) { contentEl.innerHTML = `<div class="mb-actm-content-empty">${__('No se pudieron cargar las publicaciones.')}</div>`; return; }
        if (!posts.length) { contentEl.innerHTML = `<div class="mb-actm-content-empty">${__('Sin publicaciones en este periodo.')}</div>`; return; }
        contentEl.innerHTML = `
          <div class="mb-tpt">
            <div class="mb-tpt-head"><span>${__('Autor')}</span><span>${__('Contenido')}</span><span>${__('Métricas')}</span><span>${__('Análisis')}</span><span></span></div>
            ${posts.map((p) => this._activityPostRow(p)).join('')}
          </div>`;
      };
      const loadContent = (i) => {
        if (!contentEl) return;
        if (postsCache.has(i)) { renderPosts(postsCache.get(i)); return; }
        const token = ++reqToken;
        contentEl.innerHTML = `<div class="mb-actm-content-loading"><i class="aisc-ico fa-spin aisc-ico--loader"></i></div>`;
        this._loadActivityPeriodPosts(i, act).then((posts) => {
          if (token !== reqToken) return;
          postsCache.set(i, posts);
          renderPosts(posts);
        });
      };

      const render = () => {
        const d = periodData(sel);
        if (labelEl) labelEl.textContent = d.r.period_label || '';
        if (subEl)   subEl.textContent = `${sel + 1} ${__('de')} ${N}`;
        const t = d.p + d.n + d.g;
        const posPct = t ? Math.round(d.p / t * 100) : null;
        const senBar = t
          ? `<div class="mb-actm-senbar" title="${d.p} ${__('Positivo')} · ${d.n} ${__('Neutro')} · ${d.g} ${__('Negativo')}">
               <span style="width:${d.p / t * 100}%;background:#6bcf7f"></span>
               <span style="width:${d.n / t * 100}%;background:#8a8a8e"></span>
               <span style="width:${d.g / t * 100}%;background:#e06464"></span>
             </div>`
          : `<span class="mb-actm-muted">—</span>`;
        if (statsEl) statsEl.innerHTML =
          stat(fmt.int(d.posts), __('Publicaciones')) +
          stat(d.e == null ? '—' : C(d.e), __('Engagement')) +
          stat(posPct == null ? '—' : posPct + '%', __('Positivo')) +
          `<div class="mb-actm-stat mb-actm-stat--sen"><span class="mb-actm-stat-lbl">${__('Sentimiento')}</span>${senBar}</div>`;
        if (prevBtn) prevBtn.disabled = sel <= 0;
        if (nextBtn) nextBtn.disabled = sel >= N - 1;
        if (lastContentIdx !== sel) { lastContentIdx = sel; loadContent(sel); }
      };

      prevBtn?.addEventListener('click', () => { if (sel > 0) { sel--; render(); } });
      nextBtn?.addEventListener('click', () => { if (sel < N - 1) { sel++; render(); } });

      render();
    },

    /** Posts reales del periodo seleccionado (rango [period_start, siguiente)).
        Reusa el RPC de posts destacados acotado por fechas. */
    async _loadActivityPeriodPosts(i, act) {
      if (!this._supabase || !this._orgId) return null;
      const start = act[i]?.period_start;
      if (!start) return [];
      let end;
      if (i < act.length - 1 && act[i + 1]?.period_start) {
        end = new Date(new Date(act[i + 1].period_start).getTime() - 1).toISOString();
      } else {
        end = this._mbCampanasData?.window?.date_to || new Date().toISOString();
      }
      const bcid = this._mbFilters?.brandContainerId;
      try {
        const { data, error } = await this._supabase.rpc('dashboard_brand_top_highlighted_posts', {
          p_org_id:              this._orgId,
          p_brand_container_ids: bcid ? [bcid] : null,
          p_post_source:         'own',
          p_date_from:           start,
          p_date_to:             end,
          p_limit:               50,
        });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.warn('[activity posts]', e?.message || e);
        return null;
      }
    },

    /** Fila de post para el popup (mismo layout que Top posts: perfil/contenido/metricas/analisis/link). */
    _activityPostRow(p) {
      const topics = (Array.isArray(p.topics) ? p.topics : []).slice(0, 2);
      const sc = this._sentClass(p.sentiment_text);
      const url = this._postUrl(p);
      return `
        <div class="mb-tpt-row">
          <div class="mb-tpt-profile">
            <span class="mb-tpt-net"><i class="fab ${this._platformIcon(p.network)}"></i></span>
            <div>
              <div class="mb-tpt-name">@${this._esc(String(p.profile_handle || '').replace(/^@/, ''))}</div>
              <div class="mb-tpt-date">${this._esc(this._fmtPostDate(p.captured_at))}</div>
            </div>
          </div>
          <div class="mb-tpt-content">${this._esc(p.content_preview || '')}</div>
          <div class="mb-tpt-metrics">${this._postMetricsHtml(p.metrics)}</div>
          <div class="mb-tpt-analysis">
            <span class="mb-tpt-sent mb-tpt-sent--${sc}">${this._sentLabel(p.sentiment_text)}</span>
            ${topics.map((t) => `<span class="mb-tag">${this._esc(this._capWords(t))}</span>`).join('')}
          </div>
          <div class="mb-tpt-go">${url ? `<a class="mb-tpt-link" href="${this._esc(url)}" target="_blank" rel="noopener" aria-label="${__('Abrir publicacion')}"><i class="aisc-ico aisc-ico--external-link"></i></a>` : ''}</div>
        </div>`;
    },

    /* ════════════════════════════════════════════════════════════════
       Popup de Patron de horas: click en una celda → publicaciones de ESA hora
       (agregadas en todas las dias de la ventana, hora en zona America/Bogota,
       igual que el heatmap). Navegable entre horas con publicaciones. Mismo
       diseno universal (dash-modal) + tabla de contenido.
       ════════════════════════════════════════════════════════════════ */
    _fmtHour(h) {
      const ampm = h < 12 ? 'AM' : 'PM';
      let hh = h % 12; if (hh === 0) hh = 12;
      return `${hh}:00 ${ampm}`;
    },
    /** Hora 0–23 del post en zona horaria de la marca (America/Bogota). */
    _bogotaHour(ts) {
      if (!ts) return null;
      try {
        const s = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: '2-digit', hour12: false, hourCycle: 'h23' }).format(new Date(ts));
        const h = parseInt(s, 10);
        return Number.isFinite(h) ? (h % 24) : null;
      } catch (_) { return null; }
    },
    /** Trae los posts propios de la ventana y los agrupa por hora (Bogota). */
    async _loadHoursBuckets() {
      const map = new Map();
      if (!this._supabase || !this._orgId) return map;
      const win = this._mbCampanasData?.window || {};
      const bcid = this._mbFilters?.brandContainerId;
      try {
        const { data, error } = await this._supabase.rpc('dashboard_brand_top_highlighted_posts', {
          p_org_id:              this._orgId,
          p_brand_container_ids: bcid ? [bcid] : null,
          p_post_source:         'own',
          p_date_from:           win.date_from || '2000-01-01T00:00:00Z',
          p_date_to:             win.date_to   || new Date().toISOString(),
          p_limit:               500,
        });
        if (error) throw error;
        (Array.isArray(data) ? data : []).forEach((p) => {
          const h = this._bogotaHour(p.captured_at);
          if (h == null) return;
          if (!map.has(h)) map.set(h, []);
          map.get(h).push(p);
        });
      } catch (e) { console.warn('[hours posts]', e?.message || e); }
      return map;
    },
    _openHoursModal(hour) {
      if (!window.Modal || typeof window.Modal.show !== 'function') return;
      const headLabel = `${__('Publicaciones a las')} ${this._fmtHour(hour)}`;
      const body = `
        <div class="mb-actm">
          <div class="mb-actm-nav">
            <button class="mb-actm-navbtn" data-mb-hr-prev type="button" aria-label="${__('Anterior')}"><i class="aisc-ico aisc-ico--chevron-left"></i></button>
            <div class="mb-actm-nav-info">
              <div class="mb-actm-period" data-mb-hr-label>${this._esc(headLabel)}</div>
              <div class="mb-actm-sub" data-mb-hr-sub></div>
            </div>
            <button class="mb-actm-navbtn" data-mb-hr-next type="button" aria-label="${__('Siguiente')}"><i class="aisc-ico aisc-ico--chevron-right"></i></button>
          </div>
          <div class="mb-actm-content" style="border-top:none;padding-top:0">
            <div class="mb-actm-content-body" data-mb-hr-content>
              <div class="mb-actm-content-loading"><i class="aisc-ico fa-spin aisc-ico--loader"></i></div>
            </div>
          </div>
        </div>`;

      const { modal, bodyEl } = window.Modal.show({ title: headLabel, body, className: 'dash-modal' });
      const titleH3   = modal.querySelector('.modal-header h3');
      const labelEl   = bodyEl.querySelector('[data-mb-hr-label]');
      const subEl     = bodyEl.querySelector('[data-mb-hr-sub]');
      const prevBtn   = bodyEl.querySelector('[data-mb-hr-prev]');
      const nextBtn   = bodyEl.querySelector('[data-mb-hr-next]');
      const contentEl = bodyEl.querySelector('[data-mb-hr-content]');

      let hoursList = [];
      let sel = 0;
      const render = () => {
        const h = hoursList[sel];
        const posts = h == null ? [] : (this._hoursBuckets.get(h) || []);
        const label = `${__('Publicaciones a las')} ${this._fmtHour(h == null ? hour : h)}`;
        if (titleH3) titleH3.textContent = label;
        if (labelEl) labelEl.textContent = label;
        if (subEl)   subEl.textContent = `${posts.length} ${posts.length === 1 ? __('publicacion') : __('publicaciones')}`;
        if (prevBtn) prevBtn.disabled = sel <= 0;
        if (nextBtn) nextBtn.disabled = sel >= hoursList.length - 1;
        if (contentEl) contentEl.innerHTML = posts.length
          ? `<div class="mb-tpt">
               <div class="mb-tpt-head"><span>${__('Autor')}</span><span>${__('Contenido')}</span><span>${__('Métricas')}</span><span>${__('Análisis')}</span><span></span></div>
               ${posts.map((p) => this._activityPostRow(p)).join('')}
             </div>`
          : `<div class="mb-actm-content-empty">${__('Sin publicaciones en esta hora.')}</div>`;
      };

      prevBtn?.addEventListener('click', () => { if (sel > 0) { sel--; render(); } });
      nextBtn?.addEventListener('click', () => { if (sel < hoursList.length - 1) { sel++; render(); } });

      this._loadHoursBuckets().then((map) => {
        this._hoursBuckets = map;
        hoursList = [...map.keys()].sort((a, b) => a - b);
        if (!hoursList.length) {
          if (subEl) subEl.textContent = `0 ${__('publicaciones')}`;
          if (contentEl) contentEl.innerHTML = `<div class="mb-actm-content-empty">${__('Sin publicaciones en esta hora.')}</div>`;
          if (prevBtn) prevBtn.disabled = true;
          if (nextBtn) nextBtn.disabled = true;
          return;
        }
        sel = hoursList.indexOf(hour);
        if (sel < 0) sel = 0;
        render();
      });
    },

    /* Seccion causal: 'boost' = lo que te impulsa, 'drag' = lo que te resta.
       Cada card muestra el resultado + lift vs tu promedio + el POR QUE
       (emocion + sentimiento) + evidencia + ver detalles. */
    _buildCausalSection(insights, kind) {
      const items = (insights || []).filter((i) => i.kind === kind);
      const title = kind === 'boost' ? __('Lo que te esta funcionando') : __('Lo que te esta restando');
      const hint  = kind === 'boost'
        ? __('Lo que mas conecta con tu gente — y que hacer para aprovecharlo')
        : __('Lo que baja tu rendimiento frente a lo que sueles lograr — y como corregirlo');
      if (!items.length) {
        if (shouldHideEmpty()) return '';
        return `
          <section class="mb-section">
            <div class="mb-section-head"><span class="mb-section-title">${title}</span></div>
            <div class="mb-causal-empty">${__('No hay contenido propio analizado en esta ventana. Amplia el rango (prueba {x}) para ver el analisis causal de tu marca.', { x: '<b>' + __('Todo el periodo') + '</b>' })}</div>
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
        tono:    { detailDim: 'tone',   what: __('forma de hablar'), headUp: __('Tu mejor forma de hablar'),     headDown: __('Una forma de hablar que te resta'), actUp: __('Publica mas con este tono esta semana'),  actDown: __('Usa menos este tono') },
        tema:    { detailDim: 'topic',  what: __('tema'),            headUp: __('Tu tema mas potente'),           headDown: __('Un tema que te resta'),             actUp: __('Crea mas contenido sobre este tema'),     actDown: __('Habla menos de este tema') },
        formato: { detailDim: 'format', what: __('tipo de post'),    headUp: __('Tu tipo de publicacion ganador'),headDown: __('Un tipo de publicacion que te resta'),actUp: __('Haz mas publicaciones de este tipo'),     actDown: __('Reduce este tipo de publicacion') },
        horario: { detailDim: 'hour',   what: __('horario'),         headUp: __('Tu mejor hora para publicar'),   headDown: __('Una hora que te resta'),            actUp: __('Publica mas a esta hora'),                actDown: __('Evita publicar a esta hora') },
      }[i.dimension] || { detailDim: i.dimension, what: i.dimension, headUp: __('Lo que te funciona'), headDown: __('Lo que te resta'), actUp: __('Haz mas de esto'), actDown: __('Reduce esto') };

      const isUp   = kind === 'boost';
      const lift   = Math.round(Number(i.lift_pct) || 0);
      const absLift = Math.abs(lift);
      const value  = i.dimension === 'horario'
        ? __('las {h}:00', { h: String(parseInt(i.value, 10) || 0).padStart(2, '0') })
        : this._causalValueLabel(i.dimension, i.value);
      const posRatio = Number.isFinite(Number(i.pos_ratio)) ? Number(i.pos_ratio) : null;
      const n      = Number(i.post_count) || 0;

      // Encabezado en humano + frase que explica el por que sin jerga.
      const headline = `${isUp ? meta.headUp : meta.headDown}: ${value}`;
      const sent = this._tpSentimentPhrase(posRatio);
      const say = isUp
        ? __('Cuando publicas asi, la gente interactua (likes, comentarios, compartidos) un <b>{p}% mas</b> que de costumbre', { p: absLift }) + (sent ? ` — ${sent}` : '') + '.'
        : __('Cuando publicas asi, la gente interactua un <b>{p}% menos</b> que de costumbre', { p: absLift }) + (sent ? ` — ${sent}` : '') + '.';

      // Visual: numero grande comparativo + pictograma de reaccion.
      const filled = posRatio != null ? Math.round(posRatio * 10) : null;
      const picto = filled != null
        ? `<div class="mb-tp-picto">
             ${this._pictograph10(filled)}
             <span class="mb-tp-picto-cap">${__('<b>{n} de cada 10</b> reaccionan bien', { n: filled })}</span>
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
              <span class="mb-tp-big-cap">${isUp ? __('mejor que de costumbre') : __('peor que de costumbre')}</span>
            </div>
            ${picto}
          </div>
          <div class="mb-tp-foot">
            <span class="mb-tp-evidence">${n === 1 ? __('Lo vimos en {n} publicacion tuya', { n }) : __('Lo vimos en {n} publicaciones tuyas', { n })}</span>
            <span class="mb-tp-action">${this._esc(isUp ? meta.actUp : meta.actDown)} <i class="aisc-ico aisc-ico--arrow-right"></i></span>
          </div>
        </article>`;
    },

    /** Traduce el % de reaccion positiva a una frase de a pie (sin "sentimiento"). */
    _tpSentimentPhrase(posRatio) {
      if (posRatio == null) return '';
      const p = Math.round(posRatio * 100);
      if (p >= 70) return __('a casi todos les gusta');
      if (p >= 50) return __('a la mayoria le gusta');
      if (p >= 30) return __('aunque a varios no les convence');
      return __('pero a muchos no les convence');
    },

    /** Pictograma de 10 puntos: X llenos = X de cada 10 (legible sin saber leer datos). */
    _pictograph10(filled) {
      const f = Math.max(0, Math.min(10, Math.round(Number(filled) || 0)));
      let dots = '';
      for (let k = 0; k < 10; k++) dots += `<span class="mb-tp-dot${k < f ? ' mb-tp-dot--on' : ''}"></span>`;
      return `<div class="mb-tp-dots" aria-hidden="true">${dots}</div>`;
    },

    /* ── Actividad: ritmo de publicacion propio en el tiempo ──────────── */
    /** Banner de actividad para el tope de Analisis Longitudinal (estado + redes). */
    _buildActivityBanner(a) {
      if (!a || a.status === 'sin_datos' || !Number(a.total)) return '';
      const statusMeta = {
        activo:    { color: '#6e9f81', label: __('Activo') },
        irregular: { color: '#9c8e6b', label: __('Irregular') },
        lento:     { color: '#9c8e6b', label: __('Lento') },
        dormido:   { color: '#b3796f', label: __('Dormido') },
      }[a.status] || { color: '#8a8a8e', label: a.status };
      const days = Number(a.days_since);
      const headline = a.status === 'dormido'
        ? __('Llevas <strong>{d}</strong> sin publicar', { d: this._daysHuman(days) })
        : __('Tu ultima publicacion fue hace <strong>{d}</strong>', { d: this._daysHuman(days) });
      const nets = (Array.isArray(a.networks) ? a.networks : []).map((n) =>
        `<span class="mb-actb-net">${this._esc(this._prettyPlatform(n.network))} · ${__('{c} {posts} · hace {d}', { c: Number(n.posts), posts: Number(n.posts) === 1 ? __('post') : __('posts'), d: this._daysHuman(Number(n.days_since)) })}</span>`).join('');
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
        activo:    { color: '#6e9f81', label: __('Activo') },
        irregular: { color: '#9c8e6b', label: __('Irregular') },
        lento:     { color: '#9c8e6b', label: __('Lento') },
        dormido:   { color: '#b3796f', label: __('Dormido') },
      }[a.status] || { color: '#8a8a8e', label: a.status };
      const days = Number(a.days_since);
      const headline = a.status === 'dormido'
        ? __('Llevas <strong>{d}</strong> sin publicar', { d: this._daysHuman(days) })
        : __('Tu ultima publicacion fue hace <strong>{d}</strong>', { d: this._daysHuman(days) });

      const nets = (Array.isArray(a.networks) ? a.networks : []).map((n) => `
        <div class="mb-act-net">
          <span class="mb-act-net-name">${this._esc(this._prettyPlatform(n.network))}</span>
          <span class="mb-act-net-posts">${Number(n.posts)} ${Number(n.posts) === 1 ? __('post') : __('posts')}</span>
          <span class="mb-act-net-since">${__('hace {d}', { d: this._daysHuman(Number(n.days_since)) })}</span>
        </div>`).join('');

      return `
        <section class="mb-section">
          <div class="mb-act-card">
            <div class="mb-card-title">${__('Actividad')}</div>
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
      if (n < 60) return __('{n} dias', { n });
      return __('{n} dias ({m} meses)', { n, m: Math.round(n / 30) });
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
        if (r.is_orphan || (lift > 0 && share < avg * 0.6)) return { k: 'explota', rank: 0, label: __('Explotalo'), icon: 'fa-gem', say: (ls, s) => __('Rinde {ls} pero es solo el {s}% de tu contenido — produce mas de esto.', { ls, s }) };
        if (lift < 0 && share >= avg) return { k: 'revisa', rank: 1, label: __('Revisa'), icon: 'fa-triangle-exclamation', say: (ls, s) => __('Es el {s}% de tu contenido pero rinde {ls} — replantealo o reducelo.', { ls, s }) };
        if (lift >= 0) return { k: 'formula', rank: 2, label: __('Tu formula'), icon: 'fa-circle-check', say: (ls, s) => __('Rinde {ls} y ya es el {s}% de lo que publicas — mantenlo.', { ls, s }) };
        return { k: 'flojo', rank: 3, label: __('Bajo perfil'), icon: 'fa-circle-minus', say: (ls, s) => __('Poco uso ({s}%) y rinde {ls} — baja prioridad.', { ls, s }) };
      };
      const ranked = list.map((r) => ({ r, v: verdictOf(r) }))
        .sort((a, b) => a.v.rank - b.v.rank || Math.abs(Number(b.r.lift_pct) || 0) - Math.abs(Number(a.r.lift_pct) || 0));

      const stageRows = ranked.map(({ r, v }, i) => {
        const share = Math.round(Number(r.share_pct) || 0);
        const lift = Math.round(Number(r.lift_pct) || 0);
        const ls = `${lift >= 0 ? '+' : ''}${lift}%`;
        const conn = i < ranked.length - 1
          ? `<div class="mb-stage-conn"><span>${share}% de tu contenido</span></div>`
          : '';
        return `
          <div class="mb-stage mb-stage--${v.k}" data-feat-detail data-dim="pillar" data-value="${this._esc(r.pillar)}" data-title="${__('Pilar: {p}', { p: this._esc(r.pillar) })}" role="button" tabindex="0">
            <span class="mb-stage-icon"><i class="fas ${v.icon}"></i></span>
            <div class="mb-stage-main">
              <span class="mb-stage-name">${this._esc(r.pillar)}</span>
              <span class="mb-stage-say">${this._esc(v.say(ls, share))}</span>
            </div>
            <span class="mb-stage-badge">${v.label}</span>
          </div>${conn}`;
      }).join('');

      // Footer resumen (analogo a "System health"): metricas derivadas de los pilares.
      const positives = ranked.filter(({ r }) => (Number(r.lift_pct) || 0) >= 0);
      const rindeShare = Math.round(positives.reduce((s, { r }) => s + (Number(r.share_pct) || 0), 0));
      const toOptimize = ranked.filter(({ v }) => v.k === 'explota' || v.k === 'revisa').length;
      const priority = ranked[0];
      const priorityLabel = priority ? `${priority.v.label.toUpperCase()}: ${this._esc(priority.r.pillar)}` : '';

      return `
        <section class="mb-section">
          <div class="mb-stageflow">
            <div class="mb-stageflow-head">
              <span class="mb-stageflow-title">${__('Pilares de contenido')}</span>
              <span class="mb-stageflow-count">${ranked.length === 1 ? __('{n} pilar', { n: ranked.length }) : __('{n} pilares', { n: ranked.length })}</span>
            </div>
            <div class="mb-stageflow-list">${stageRows}</div>
            <div class="mb-stageflow-foot">
              <div class="mb-stageflow-foot-label">${__('Resumen')}</div>
              <div class="mb-stageflow-stats">
                <div class="mb-stageflow-stat"><span class="mb-stageflow-stat-val">${ranked.length}</span><span class="mb-stageflow-stat-cap">${__('Pilares')}</span></div>
                <div class="mb-stageflow-stat"><span class="mb-stageflow-stat-val">${rindeShare}%</span><span class="mb-stageflow-stat-cap">${__('Rinde +')}</span></div>
                <div class="mb-stageflow-stat${toOptimize ? ' mb-stageflow-stat--warn' : ' mb-stageflow-stat--ok'}"><span class="mb-stageflow-stat-val">${toOptimize}</span><span class="mb-stageflow-stat-cap">${__('A optimizar')}</span></div>
              </div>
              <div class="mb-stageflow-bar"><span style="width:${Math.min(100, Math.max(2, rindeShare))}%;"></span></div>
              <div class="mb-stageflow-foot-meta"><span>${__('Prioridad: {p}', { p: priorityLabel })}</span><span>${__('{n}% rinde', { n: rindeShare })}</span></div>
            </div>
          </div>
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
             data-title="${__('Pilar: {p}', { p: this._esc(r.pillar) })}" role="button" tabindex="0">
          <div class="mb-pil-name">
            <span class="mb-pil-pillar">${this._esc(r.pillar)}</span>
            ${orphan ? `<span class="mb-pil-orphan-badge">${__('Huerfano · explotalo')}</span>` : ''}
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
            <div class="mb-swot-title">${__('Diagnóstico Estratégico')}</div>
            <div class="mb-swot-subtitle">${__('Vera detecta qué estás haciendo bien y dónde te están golpeando.')}</div>
          </header>

          <div class="mb-swot-grid">
            <div class="mb-swot-col mb-swot-col--virtudes">
              <div class="mb-swot-col-header">
                <span class="mb-swot-col-dot mb-swot-col-dot--pos"></span>
                <span class="mb-swot-col-name">${__('Virtudes')}</span>
                <span class="mb-swot-col-count">${virtudes.length}</span>
              </div>
              ${virtudes.length === 0
                ? `<div class="mb-swot-empty">${__('Vera aún no detecta fortalezas claras en la ventana.')}</div>`
                : `<ul class="mb-swot-list">${virtudes.map(v => this._buildSwotItem(v, 'pos')).join('')}</ul>`
              }
            </div>

            <div class="mb-swot-col mb-swot-col--vulnerabilidades">
              <div class="mb-swot-col-header">
                <span class="mb-swot-col-dot mb-swot-col-dot--neg"></span>
                <span class="mb-swot-col-name">${__('Vulnerabilidades')}</span>
                <span class="mb-swot-col-count">${vulnerabilidades.length}</span>
              </div>
              ${vulnerabilidades.length === 0
                ? `<div class="mb-swot-empty">${__('Sin vulnerabilidades activas. ✓')}</div>`
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
          label:  __('Tema "{s}"', { s: topic.topic }),
          tag:    __('{n} eng', { n: this._compactNum(topic.total_engagement) }),
          detail: __('Tu tema más exitoso en la ventana — {n} posts.', { n: topic.usage_count }),
        });
      }
      const tone = (featured.tones?.data || [])[0];
      if (tone?.tone_name) {
        out.push({
          label:  __('Tono "{s}"', { s: tone.tone_name }),
          tag:    __('{n} eng', { n: this._compactNum(tone.total_engagement) }),
          detail: __('Tu tono más efectivo — {n} posts conectan con tu audiencia.', { n: tone.posts_count }),
        });
      }
      const hour = (featured.hour?.data || [])[0];
      if (hour?.hour != null) {
        out.push({
          label:  __('Horario {h}:00', { h: String(hour.hour).padStart(2, '0') }),
          tag:    __('{n} eng/post', { n: this._compactNum(hour.avg_engagement_per_post) }),
          detail: __('Tu micro-momento ganador del día — {n} publicaciones lo confirman.', { n: hour.posts_count }),
        });
      }

      // 3. Winners de campañas
      const winners = Array.isArray(wb.winners) ? wb.winners : [];
      for (const w of winners.slice(0, 2)) {
        out.push({
          label:  w.nombre_campana,
          tag:    __('{n} conv', { n: this._compactNum(w.conversions) }),
          detail: w.description || __('Campaña convirtiendo a ${amount}/conv.', { amount: Math.round(w.cost_per_conv || 0).toLocaleString((window.i18n && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO') }),
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
          label:    v.title || __('Vulnerabilidad detectada'),
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
            tag:    __('−{n} pts', { n: Number(g.max_lift || 0).toFixed(0) }),
            detail: g.gap_description || '',
          });
        }
      }

      // 3. Burner campaigns (gasto sin retorno)
      const burners = Array.isArray(wb.burners) ? wb.burners : [];
      for (const b of burners.slice(0, 2)) {
        out.push({
          label:  b.nombre_campana,
          tag:    __('{n} gasto', { n: fmt.money(b.spend) }),
          detail: b.description || __('Inversión sin conversiones medibles en la ventana.'),
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
          kind: 'topic', label: __('Tema ganador'), headline: topic.topic,
          metricPrimary: __('{n} posts', { n: fmt.int(topic.usage_count) }),
          metricSecondary: __('{n} engagement', { n: this._compactNum(topic.total_engagement) }),
          dim: 'topic', value: topic.topic,
        },
        (tone && tone.tone_name) && {
          kind: 'tone', label: __('Tono efectivo'), headline: tone.tone_name,
          metricPrimary: __('{n} posts', { n: fmt.int(tone.posts_count) }),
          metricSecondary: __('{n} engagement', { n: this._compactNum(tone.total_engagement) }),
          dim: 'tone', value: tone.tone_name,
        },
        (hour && hour.hour != null) && {
          kind: 'hour', label: __('Horario estrella'), headline: `${String(hour.hour).padStart(2, '0')}:00`,
          metricPrimary: __('{n} posts publicados', { n: fmt.int(hour.posts_count) }),
          metricSecondary: __('{n} eng/post', { n: this._compactNum(hour.avg_engagement_per_post) }),
          dim: 'hour', value: String(hour.hour),
        },
        (hashtag && hashtag.hashtag) && {
          kind: 'hashtag', label: __('Hashtag dominante'), headline: `#${hashtag.hashtag}`,
          metricPrimary: __('{n} usos', { n: fmt.int(hashtag.usage_count) }),
          metricSecondary: __('{n} engagement', { n: this._compactNum(hashtag.total_engagement) }),
          dim: 'hashtag', value: hashtag.hashtag,
        },
        // ── Backups (rellenan huecos de las primarias) ──
        (sentiment && sentiment.dominant_label && Number(sentiment.dominant_count) > 0) && {
          kind: 'sentiment', label: __('Sentimiento del público'), headline: sentiment.dominant_label,
          metricPrimary: `${fmt.int(sentiment.dominant_count)} ${__('comentarios')}`,
          metricSecondary: __('{n}% del total', { n: Math.round(Number(sentiment.dominant_ratio || 0) * 100) }),
          dim: 'sentiment', value: sentiment.dominant,
        },
        (growth && growth.engagement_growth_percent != null) && {
          kind: 'growth', label: __('Crecimiento'),
          headline: `${growth.engagement_growth_percent >= 0 ? '+' : ''}${Math.round(growth.engagement_growth_percent)}%`,
          metricPrimary: __('engagement'),
          metricSecondary: __('{a} → {b} posts', { a: fmt.int(growth.start_posts), b: fmt.int(growth.end_posts) }),
          dim: 'growth', value: '',
        },
        (profile && profile.brand_name) && {
          kind: 'profile', label: __('Cuenta lider'), headline: profile.brand_name,
          metricPrimary: __('{n} posts', { n: fmt.int(profile.total_posts) }),
          metricSecondary: __('{n} engagement', { n: this._compactNum(profile.total_engagement) }),
          dim: 'profile', value: '',
        },
      ].filter(Boolean);

      // Sin ninguna señal con datos: card vacia informativa (o nada si hide).
      if (!pool.length) {
        if (shouldHideEmpty()) return '';
        return this._buildFeaturedCard({
          kind: 'topic', label: __('Tema ganador'), headline: null,
          emptyHint: __('Sin datos suficientes en la ventana.'),
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
            ${clickable ? `<div class="mb-feat-detail-hint">${__('Ver detalles')} <i class="aisc-ico aisc-ico--arrow-right"></i></div>` : ''}
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
      const platOptions = [['', __('Todas')], ['instagram', 'Instagram'], ['facebook', 'Facebook']];
      return `
        <header class="living-history-filters mb-filters-bar" id="mbFilters">
          ${this._mbFechaControl()}
          ${this._buildFilterMenu({ label: __('Plataforma'), value: cur, key: 'platform', options: platOptions })}
          ${this._buildIntegrationBubbles()}
          ${this._reportDropdown()}
        </header>`;
    },

    _mbFechaControl() {
      if (typeof DateRangePicker !== 'function') {
        return `<div class="living-filter"><label class="living-filter-label">${__('Fecha')}</label>
          <select class="living-filter-select" disabled><option>${__('Todo el periodo')}</option></select></div>`;
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
    /* Gauge semicircular de segmentos redondeados (estilo "expense tracker"):
       arco rojo->ambar->verde, encendido hasta el score; resto en gris tenue. */
    _buildSegGauge(score) {
      const N = 22;
      const sc = Math.max(0, Math.min(100, Number(score) || 0));
      const lit = Math.round(sc / 100 * N);
      const cx = 100, cy = 100, r = 82, w = 11, gap = 2.4;
      const a0 = 180, span = 180, step = span / N;
      const stops = [[239, 68, 68], [224, 160, 69], [107, 207, 127]];
      const lerp = (a, b, t) => Math.round(a + (b - a) * t);
      const colorAt = (t) => {
        const seg = t <= 0.5 ? 0 : 1;
        const tt = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
        const c0 = stops[seg], c1 = stops[seg + 1];
        return `rgb(${lerp(c0[0], c1[0], tt)},${lerp(c0[1], c1[1], tt)},${lerp(c0[2], c1[2], tt)})`;
      };
      const pt = (ang) => [(cx + r * Math.cos(ang * Math.PI / 180)).toFixed(2), (cy - r * Math.sin(ang * Math.PI / 180)).toFixed(2)];
      let segs = '';
      for (let i = 0; i < N; i++) {
        const [x1, y1] = pt(a0 - i * step - gap / 2);
        const [x2, y2] = pt(a0 - (i + 1) * step + gap / 2);
        const on = i < lit;
        const col = on ? colorAt(N <= 1 ? 0 : i / (N - 1)) : 'rgba(255,255,255,0.08)';
        segs += `<path d="M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
      }
      return `<svg class="mb-health-gauge-svg" viewBox="0 0 200 116" role="img" aria-label="${__('Salud {n} de 100', { n: Math.round(sc) })}">${segs}</svg>`;
    },

    _buildHealthGauge(h) {
      if (!h || h.score == null) {
        if (shouldHideEmpty()) return '';
        return this._buildHealthEmpty();
      }

      const score    = Number(h.score) || 0;
      const verdict  = h.verdict || 'atencion';
      const band     = h.band || { p25: 50, p50: 65, p75: 80 };

      const verdictMeta = {
        elite:     { color: '#6bcf7f', label: __('Élite') },
        saludable: { color: '#6bcf7f', label: __('Saludable') },
        atencion:  { color: '#e0a045', label: __('Atención') },
        critico:   { color: '#ff5c23', label: __('Crítico') },
      }[verdict] || { color: '#8a8a8e', label: verdict };

      const target = Number(h.target);
      const gap    = Number(h.gap);
      const objetivo = Number.isFinite(target)
        ? __('Objetivo de tu segmento: <strong>{t}</strong>', { t: target }) + (gap > 0 ? __(' · te faltan <strong>{g}</strong> pts', { g: gap }) : __(' · objetivo alcanzado ✓'))
        : __('Saludable para tu segmento: <strong>{lo}–{hi}</strong>', { lo: band.p50, hi: band.p75 });

      // Card "Salud de tu marca": salud GLOBAL (gauge + objetivo) + rendimiento
      // POR PLATAFORMA (cual rinde mejor). El diagnostico (dimensiones + tareas +
      // pilares) vive ahora en su propia card (_buildBrandDiagnosisCard).
      return `
        <section class="mb-health-card mb-health-card--aside">
          <span class="mb-hero-label">${__('Salud de tu marca')}</span>
          <div class="mb-health-gauge">
            ${this._buildSegGauge(score)}
            <div class="mb-health-gauge-center">
              <span class="mb-health-score" style="color:${verdictMeta.color}">${Math.round(score)}</span>
              <span class="mb-health-max">/100</span>
              <span class="mb-health-band" style="color:${verdictMeta.color}">${this._esc(verdictMeta.label)}</span>
            </div>
          </div>
          <span class="mb-health-objetivo">${objetivo}</span>
          ${this._buildPlatformPerf(platformPerf)}
        </section>`;
    },

    /* Card "Como mejorar tu salud": el diagnostico accionable — dimensiones
       (humanizadas) + tareas para subir + pilares de contenido. Separado de la
       salud global para que la card de Salud responda "que tan bien estas y por
       plataforma", y esta responda "que hacer para mejorar". */
    _buildBrandDiagnosisCard(h, pillarsRows) {
      const comps   = this._buildHealthComponents(h && h.components);
      const tasks   = this._buildHealthTasks(h && h.tasks);
      const pillars = this._buildPillarsSection(pillarsRows);
      if (!comps && !tasks && !pillars) return '';
      return `
        <section class="mb-health-card mb-health-card--aside mb-diag-card">
          <span class="mb-hero-label">${__('Cómo mejorar tu salud')}</span>
          ${comps}
          ${tasks}
          ${pillars}
        </section>`;
    },

    /* ── Rendimiento por plataforma (dentro de la card de Salud) ─────────
       Redes: engagement/post (barra relativa al mejor + tag "mejor"). Marketplaces:
       reputacion del vendedor (metrica distinta, fila aparte, sin barra). */
    _platPerfMeta(net) {
      const n = String(net || '').toLowerCase();
      const M = {
        instagram:    { label: 'Instagram', icon: 'fab fa-instagram' },
        facebook:     { label: 'Facebook',  icon: 'fab fa-facebook' },
        tiktok:       { label: 'TikTok',    icon: 'fab fa-tiktok' },
        x:            { label: 'X',         icon: 'fab fa-x-twitter' },
        youtube:      { label: 'YouTube',   icon: 'fab fa-youtube' },
        linkedin:     { label: 'LinkedIn',  icon: 'fab fa-linkedin' },
        mercadolibre: { label: 'Mercado Libre', iconSrc: '/recursos/icons/store.svg' },
        shopify:      { label: 'Shopify',   iconSrc: '/recursos/icons/store.svg' },
        amazon:       { label: 'Amazon',    iconSrc: '/recursos/icons/store.svg' },
      };
      return M[n] || { label: this._capWords ? this._capWords(n) : n, iconSrc: '/recursos/icons/store.svg' };
    },
    /** Traduce el seller_reputation_level de Mercado Libre a lenguaje plano. */
    _meliRepMeta(rep) {
      const R = {
        '5_green':       { label: __('Verde'),       sub: __('excelente'), color: '#6bcf7f' },
        '4_light_green': { label: __('Verde claro'), sub: __('buena'),     color: '#9ccc65' },
        '3_yellow':      { label: __('Amarilla'),    sub: __('regular'),   color: '#e0a045' },
        '2_orange':      { label: __('Naranja'),     sub: __('baja'),      color: '#e08545' },
        '1_red':         { label: __('Roja'),        sub: __('crítica'),   color: '#e06464' },
      };
      return R[String(rep || '').toLowerCase()] || null;
    },
    _platIconHtml(m) {
      return m.iconSrc
        ? `<img src="${this._esc(m.iconSrc)}" alt="" aria-hidden="true">`
        : `<i class="${this._esc(m.icon)}"></i>`;
    },
    _buildPlatformPerf(pp) {
      const social = Array.isArray(pp && pp.social) ? pp.social.filter((s) => s.posts > 0) : [];
      const mkts   = Array.isArray(pp && pp.marketplaces) ? pp.marketplaces : [];
      if (!social.length && !mkts.length) return '';
      const max = Math.max(1, ...social.map((s) => s.engPerPost));
      const socialRows = social.map((s, i) => {
        const m = this._platPerfMeta(s.network);
        const w = Math.max(4, Math.round(s.engPerPost / max * 100));
        const best = i === 0 && social.length > 1 && s.engPerPost > 0;
        return `
          <div class="mb-pp-row">
            <span class="mb-pp-ic">${this._platIconHtml(m)}</span>
            <div class="mb-pp-main">
              <div class="mb-pp-head">
                <span class="mb-pp-name">${this._esc(m.label)}${best ? ` <span class="mb-pp-best">${__('mejor')}</span>` : ''}</span>
                <span class="mb-pp-val">${this._compactNum(s.engPerPost)}<small>${__('eng/post')}</small></span>
              </div>
              <div class="mb-pp-bar"><span style="width:${w}%"></span></div>
            </div>
          </div>`;
      }).join('');
      const mktRows = mkts.map((mk) => {
        const m = this._platPerfMeta(mk.platform);
        const rep = this._meliRepMeta(mk.reputation);
        const repHtml = rep
          ? `<span class="mb-pp-rep" style="color:${rep.color}"><i class="fas fa-circle" style="font-size:0.5rem"></i> ${this._esc(rep.label)} <small>${this._esc(rep.sub)}</small></span>`
          : `<span class="mb-pp-rep">${__('Conectado')}</span>`;
        return `
          <div class="mb-pp-row mb-pp-row--mkt">
            <span class="mb-pp-ic">${this._platIconHtml(m)}</span>
            <div class="mb-pp-main">
              <div class="mb-pp-head">
                <span class="mb-pp-name">${this._esc(m.label)}</span>
                ${repHtml}
              </div>
              <div class="mb-pp-sub">${__('Reputación de vendedor')}</div>
            </div>
          </div>`;
      }).join('');
      return `
        <div class="mb-pp">
          <div class="mb-pp-title">${__('Rendimiento por plataforma')}</div>
          ${socialRows}${mktRows}
        </div>`;
    },

    /* Alertas: componentes de salud en zona baja (<50) como chips. Viven en el
       cuerpo, debajo del banner de actividad ("Dormido"). Sin RPC extra. */
    _buildHealthAlerts(components) {
      const list = (Array.isArray(components) ? components : [])
        .filter((c) => (Number(c.score) || 0) < 50)
        .sort((a, b) => (Number(a.score) || 0) - (Number(b.score) || 0));
      if (!list.length) return '';
      const chips = list.map((c) => {
        const sc = Math.round(Number(c.score) || 0);
        const crit = sc < 40;
        return `<span class="mb-alert-chip${crit ? ' mb-alert-chip--crit' : ''}"><i class="aisc-ico aisc-ico--alert-warning"></i> ${this._esc(c.label || c.key)} ${sc}</span>`;
      }).join('');
      return `
        <div class="mb-body-alerts">
          <span class="mb-body-alerts-label">${__('Alertas')}</span>
          <div class="mb-alert-chips">${chips}</div>
        </div>`;
    },

    /** Icono por componente de salud (match por keyword en key/label). */
    _healthCompIcon(c) {
      const s = `${c.key || ''} ${c.label || ''}`.toLowerCase();
      if (/caden|frecuen|public/.test(s)) return 'fa-calendar-day';
      if (/coheren|tono|voz/.test(s))     return 'fa-comment-dots';
      if (/aline|formula|fórmula/.test(s)) return 'fa-bullseye';
      if (/resonan|social|audien/.test(s)) return 'fa-heart';
      if (/tendenc|trend/.test(s))        return 'fa-arrow-trend-up';
      return 'fa-chart-simple';
    },

    /* Etiqueta en lenguaje plano por dimension (el nombre tecnico del RPC no lo
       entiende un usuario normal). Mapea por key; cae al label del RPC si es una
       key nueva. El detalle de cada componente ya explica el numero. */
    _humanCompLabel(c) {
      const map = {
        cadencia:   __('Publicas seguido'),
        coherencia: __('Suenas como tu marca'),
        alineacion: __('Repites lo que funciona'),
        resonancia: __('Le gusta a tu público'),
        trends:     __('Aprovechas lo que sube'),
      };
      return map[String(c.key || '').toLowerCase()] || c.label || c.key;
    },
    _buildHealthComponents(components) {
      const list = Array.isArray(components) ? components : [];
      if (!list.length) return '';
      const lvlColor = { good: '#6bcf7f', mid: '#e0a045', low: '#ff5c23' };
      return `<div class="mb-hc-comps">${list.map((c) => {
        const sc = Math.max(0, Math.min(100, Number(c.score) || 0));
        const lvl = sc >= 70 ? 'good' : sc >= 40 ? 'mid' : 'low';
        return `
          <div class="mb-hc-comp mb-hc-comp--${lvl}">
            <span class="mb-hc-comp-icon"><i class="fas ${this._healthCompIcon(c)}"></i></span>
            <div class="mb-hc-comp-main">
              <div class="mb-hc-comp-head">
                <span class="mb-hc-comp-label">${this._esc(this._humanCompLabel(c))}</span>
                <span class="mb-hc-comp-score mb-hc-comp-score--${lvl}">${sc}</span>
              </div>
              <div class="mb-hc-ticks" style="--pct:${sc}%;--c:${lvlColor[lvl]}"></div>
              <div class="mb-hc-comp-detail">${this._esc(c.detail || '')}</div>
            </div>
          </div>`;
      }).join('')}</div>`;
    },

    _buildHealthTasks(tasks) {
      const list = Array.isArray(tasks) ? tasks : [];
      if (!list.length) return '';
      const sorted = [...list].sort((a, b) => (Number(b.impact_pts) || 0) - (Number(a.impact_pts) || 0));
      return `
        <div class="mb-health-tasks">
          <div class="mb-health-tasks-title">${__('Tareas para llegar a tu objetivo')}</div>
          <ol class="mb-hc-tasks">
            ${sorted.map((t, i) => {
              const pts = Number(t.impact_pts) > 0 ? Math.round(Number(t.impact_pts)) : null;
              return `
              <li class="mb-hc-task">
                <span class="mb-hc-task-pts${pts ? '' : ' mb-hc-task-pts--empty'}">${pts ? `+${pts}<small>${__('pts')}</small>` : ''}</span>
                <span class="mb-hc-task-rail"><span class="mb-hc-task-node">${i + 1}</span></span>
                <div class="mb-hc-task-body">
                  <span class="mb-hc-task-label">${this._esc(t.label || '')}</span>
                  ${t.detail ? `<span class="mb-hc-task-detail">${this._esc(t.detail)}</span>` : ''}
                </div>
              </li>`;
            }).join('')}
          </ol>
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
        <svg class="mb-gauge-svg" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" aria-label="${__('Salud {n} de 100', { n: score })}">
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
          <p>${__('Calculando salud de tu marca… (sin datos suficientes aún)')}</p>
        </section>`;
    },

    _bindMyBrandsHandlers(body) {
      if (!body) return;
      // El #insightTabBody persiste entre renders → bindear una sola vez por
      // elemento (la delegacion sigue cubriendo el HTML reescrito).
      if (body.dataset.mbBound === '1') return;
      body.dataset.mbBound = '1';

      // Filtros tipo <select> (ventana / sub-marca). Plataforma es menu custom (click).
      body.addEventListener('change', (e) => {
        const el = e.target.closest('[data-mb-filter]');
        if (!el) return;
        const key = el.dataset.mbFilter;
        let value = el.value;
        if (key === 'windowDays') value = Number(value) || 30;
        if (key === 'brandContainerId') value = value || null;
        this._onMbFilterChange({ [key]: value });
      });

      // Click: menu de filtro (Plataforma) o card featured.
      body.addEventListener('click', (e) => {
        const sel = this._handleFilterMenuClick(e);
        if (sel) {
          if (sel.key === 'platform') this._onMbFilterChange({ platforms: sel.value ? [sel.value] : null });
          return;
        }
        const actCard = e.target.closest('[data-mb-activity-modal]');
        if (actCard) { if (!e.target.closest('canvas')) this._openActivityModal(); return; }
        const hourCell = e.target.closest('[data-mb-hours-modal]');
        if (hourCell) { this._openHoursModal(Number(hourCell.dataset.hour)); return; }
        const card = e.target.closest('[data-feat-detail]');
        if (!card) return;
        this._openFeaturedDetail(card.dataset.dim, card.dataset.value, card.dataset.title);
      });
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('[data-mb-activity-modal]')) { e.preventDefault(); this._openActivityModal(); return; }
        const hourCell = e.target.closest('[data-mb-hours-modal]');
        if (hourCell) { e.preventDefault(); this._openHoursModal(Number(hourCell.dataset.hour)); return; }
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
        dr.setAttribute('aria-label', __('Detalle de publicaciones'));
        dr.innerHTML = `
          <header class="mb-detail-head">
            <div class="mb-detail-head-text">
              <span class="mb-detail-title" id="mbDetailTitle">${__('Detalles')}</span>
              <span class="mb-detail-sub" id="mbDetailSub"></span>
            </div>
            <button class="mb-detail-close" id="mbDetailClose" type="button" aria-label="${__('Cerrar')}"><i class="aisc-ico aisc-ico--close"></i></button>
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
      if (titleEl) titleEl.textContent = title || __('Detalles');
      if (subEl)   subEl.textContent = __('Cargando…');
      if (bodyEl)  bodyEl.innerHTML = `<div class="mb-detail-loading"><i class="aisc-ico fa-spin aisc-ico--loader"></i></div>`;

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
        if (subEl) subEl.textContent = posts.length === 1 ? __('{n} publicacion', { n: posts.length }) : __('{n} publicaciones', { n: posts.length });
        this._renderDetailPosts(bodyEl, posts);
      } catch (e) {
        console.error('[detail] load failed:', e?.message || e);
        if (subEl) subEl.textContent = '';
        if (bodyEl) bodyEl.innerHTML = `<div class="mb-detail-empty"><i class="aisc-ico aisc-ico--alert-warning"></i><p>${__('No se pudieron cargar las publicaciones.')}</p></div>`;
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
        bodyEl.innerHTML = `<div class="mb-detail-empty"><i class="aisc-ico aisc-ico--inbox"></i><p>${__('Sin publicaciones en esta ventana.')}</p></div>`;
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
      const content = this._esc(String(p.content || '').slice(0, 240)) || `<span class="mb-detail-post-empty">${__('(sin texto)')}</span>`;
      return `
        <li class="mb-detail-post">
          <div class="mb-detail-post-top">
            <span class="mb-detail-post-net">${this._esc(net)}</span>
            ${sent}
            <span class="mb-detail-post-date">${this._esc(date)}</span>
          </div>
          <p class="mb-detail-post-content">${content}</p>
          <div class="mb-detail-post-foot">
            <span class="mb-detail-post-metric"><i class="aisc-ico aisc-ico--likes"></i> ${this._compactNum(likes)}</span>
            <span class="mb-detail-post-metric"><i class="aisc-ico aisc-ico--comments"></i> ${this._compactNum(comments)}</span>
            <span class="mb-detail-post-metric"><i class="aisc-ico aisc-ico--refresh"></i> ${this._compactNum(shares)}</span>
            <span class="mb-detail-post-eng">${__('{n} eng', { n: this._compactNum(p.engagement_total) })}</span>
          </div>
        </li>`;
    },

    _detailSentiment(s) {
      if (!s) return '';
      const u = String(s).toUpperCase();
      if (u.startsWith('POS')) return `<span class="mb-detail-chip mb-detail-chip--pos">${__('Positivo')}</span>`;
      if (u.startsWith('NEG')) return `<span class="mb-detail-chip mb-detail-chip--neg">${__('Negativo')}</span>`;
      return `<span class="mb-detail-chip mb-detail-chip--neu">${__('Neutro')}</span>`;
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
