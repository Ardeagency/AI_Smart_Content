/**
 * DashboardView — Competence mixin (tab "Competencia").
 *
 * Lente = rivales (distinta a Mi Marca). 3 secciones:
 *   1. El campo de batalla   — panorámica del nicho (kpis) + ranking de rivales
 *   2. La voz de su audiencia — pain points de los comentarios de sus seguidores
 *   3. Vulnerabilidades       — rival débil = momento de capturar su audiencia
 *
 * Datos: CompetenciaDataService (RPCs dashboard_competencia_*). Reusa helpers
 * compartidos del prototype (_esc, _compactNum, _prettyPlatform).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const fmt = { int: (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO')) };

  Object.assign(DashboardView.prototype, {

    async _renderCompetence(body) {
      if (!body) return;
      if (!this._orgId) { this._renderEmptyOrgState?.(body); return; }
      await this._ensureCompetenciaService();
      this._restoreCompFilters();
      this._renderCompSkeleton(body);
      try {
        const data = await this._competenciaService.loadAll({
          dateFromIso: this._compFilters.dateFrom || null,
          dateToIso:   this._compFilters.dateTo   || null,
          windowDays: this._compFilters.windowDays,
          entityId: this._compFilters.entityId,
          platforms: this._compFilters.platforms || null,
        });
        this._compData = data;
        // Lista completa de perfiles para el dropdown (solo cuando NO hay foco
        // en un rival, asi no se pierden las demas opciones al filtrar).
        if (!this._compFilters.entityId && Array.isArray(data?.top?.data)) {
          this._compActors = data.top.data;
        }
        if (this._activeTab === 'competence') {
          this._renderHeroCards();                             // cards del hero = campo de batalla
          if (!this._silentRefresh) this._renderHeroActions(); // filtros del banner (opciones de perfil)
        }
        if (!this._shouldRepaint('competence', data)) return; // refresh silencioso sin cambios: no re-pintar
        body.innerHTML = this._buildCompetenciaHtml(data);
        this._bindCompetenceHandlers(body);
        this._renderInfluenceBars(data);
      } catch (e) {
        console.error('[Competence] load failed:', e);
        if (this._silentRefresh) return; // fallo transitorio del polling: conservar la vista actual
        body.innerHTML = `<div class="insight-page" style="text-align:center;padding-top:4rem;color:var(--text-secondary);">${__('No se pudo cargar Competencia.')} ${this._esc(e?.message || '')}</div>`;
      }
    },

    /* ── Cards del hero en Competencia: SÍNTESIS del campo de batalla (no las de
       Mi Marca). Fórmula del nicho (quién/qué domina) + Vulnerabilidad rival (sus
       clientes se quejan → munición) + Te están ganando (brecha vs competencia) +
       Amenaza (rival que domina la atención). Reglas+matemática, sin LLM. */
    _computeCompetitionCards(cd) {
      const top   = Array.isArray(cd?.top?.data)   ? cd.top.data   : [];
      const voice = Array.isArray(cd?.voice?.data) ? cd.voice.data : [];
      const risk  = Array.isArray(cd?.risk?.data)  ? cd.risk.data  : [];
      const bench = cd?.benchmark?.data || null;
      const C = (n) => this._compactNum(Number(n) || 0);
      const byEng = (a, b) => Number(b.total_engagement) - Number(a.total_engagement);

      // ── GUARD GLOBAL (doctrina de renderizado: toda narrativa lleva min_n) ──
      // Sin al menos 1 rival con actividad real (≥3 posts y engagement > 0) NO se
      // fabrican narrativas de rivalidad: "X domina tu nicho — 0 engagement" o
      // "te superan (101 vs 0)" desde ceros destruyen la credibilidad del panel.
      // En su lugar: UNA card de estado honesta (qué está configurado, por qué no
      // hay señal aún, qué hacer).
      const activeRivals = top.filter((r) => Number(r.total_posts) >= 3 && Number(r.total_engagement) > 0);
      if (!activeRivals.length) {
        const n = top.length;
        return {
          funciona: {
            title: n
              ? __('{n} perfiles monitoreados — aún sin señal en esta ventana', { n })
              : __('Aún no monitoreas perfiles'),
            metric: `${n}`,
            metricSub: n
              ? __('los sensores están capturando — amplía el rango o vuelve en 24-48h')
              : __('agrega competidores y referencias en Monitoreo'),
            impact: 'medio', earlySignal: true,
            detail: {
              color: 'vigila', category: __('Estado del monitoreo'), title: __('Tu radar competitivo'),
              findings: top.slice(0, 6).map((r) => ({
                key: 'rival', severity: 20,
                label: __('{r} — configurado, sin actividad capturada en la ventana', { r: r.entity_name }),
              })),
              sections: [{
                h: __('¿Por qué no hay datos?'),
                b: n
                  ? __('Tus perfiles están configurados pero los sensores aún no capturan actividad en el rango elegido. Los primeros datos suelen aparecer en 24-48h desde la configuración; también puedes ampliar el rango de fechas (prueba "Todo el periodo").')
                  : __('Este panel se enciende cuando monitoreas perfiles: agrega a tus competidores (para vigilarlos) y a tus referentes (para aprender de ellos) desde Monitoreo.'),
              }],
            },
          },
          oportunidad: null, resta: null, riesgo: null,
        };
      }

      // 1. FÓRMULA DEL NICHO: el rival líder por engagement + ranking (solo rivales activos).
      let funciona = null;
      const leader = [...activeRivals].sort(byEng)[0];
      if (leader) {
        funciona = {
          title: __('{r} domina tu nicho', { r: leader.entity_name }),
          metric: C(leader.total_engagement),
          metricSub: __('engagement · {a}/post en {p}', { a: C(leader.avg_engagement_per_post), p: leader.platform || '—' }),
          impact: 'alto', earlySignal: false,
          detail: {
            color: 'explota', category: __('Fórmula del nicho'), title: __('Quién domina el nicho'),
            findings: [...top].sort(byEng).slice(0, 5).map((r) => ({
              key: 'rival', n: Number(r.total_engagement) || 0, severity: 50,
              label: __('{r} — {a}/post · {p}% positivo', { r: r.entity_name, a: C(r.avg_engagement_per_post), p: Math.round(Number(r.positive_sentiment_ratio || 0) * 100) }),
            })),
            sections: [{ h: __('¿Qué le funciona al nicho?'), b: __('Estos rivales dominan la conversación. Estudia su fórmula (temas, formatos, cadencia) para competir mejor — no para copiar.') }],
          },
        };
      }

      // 2. VULNERABILIDAD RIVAL: el rival con más insatisfacción + queja real.
      let oportunidad = null;
      const vuln = [...voice].filter((v) => Number(v.neg_ratio) > 0 && Number(v.total_comments) >= 20)
        .sort((a, b) => Number(b.neg_ratio) - Number(a.neg_ratio))[0];
      if (vuln) {
        const negPct = Math.round(Number(vuln.neg_ratio) * 100);
        const sample = Array.isArray(vuln.sample_negative) ? vuln.sample_negative[0] : null;
        oportunidad = {
          title: __('Los clientes de {r} se quejan', { r: vuln.entity_name }),
          metric: `${negPct}%`, metricSub: __('de su público insatisfecho — tu munición'),
          impact: 'medio', earlySignal: false,
          detail: {
            color: 'optimiza', category: __('Vulnerabilidad rival'), title: __('La debilidad del rival = tu oportunidad'),
            findings: [...voice].filter((v) => Number(v.neg_ratio) > 0).sort((a, b) => Number(b.neg_ratio) - Number(a.neg_ratio)).slice(0, 4).map((v) => ({
              key: 'rival', severity: 50,
              label: __('{r} — {p}% negativo · {n} comentarios de su público', { r: v.entity_name, p: Math.round(Number(v.neg_ratio) * 100), n: Number(v.total_comments) || 0 }),
            })),
            sections: [
              { h: __('¿Dónde le duele al rival?'), b: __('Donde la audiencia del rival está insatisfecha, está tu oportunidad: crea contenido que resuelva ese dolor (sin nombrarlos) para captar a su público.') },
              ...(sample ? [{ h: __('Queja real de su público'), b: `“${String(sample).slice(0, 220)}”` }] : []),
            ],
          },
        };
      }

      // 3. TE ESTÁN GANANDO: brecha vs competencia (benchmark).
      // Guard (doctrina): esta card solo existe si la competencia DE VERDAD te
      // supera con datos reales de ambos lados. Antes se generaba incluso con
      // competencia en cero ("te superan 101 vs 0" cuando el 101 era la marca).
      let resta = null;
      const benchOk = bench && bench.brand && bench.competencia
        && Number(bench.competencia.posts) >= 3
        && Number(bench.brand.posts) >= 1
        && Number(bench.competencia.avg_engagement_per_post) > Number(bench.brand.avg_engagement_per_post);
      if (benchOk) {
        const youAvg = Number(bench.brand.avg_engagement_per_post) || 0;
        const compAvg = Number(bench.competencia.avg_engagement_per_post) || 0;
        const gap = youAvg > 0 ? Math.round(compAvg / youAvg) : null;
        resta = {
          title: __('La competencia te supera en engagement'),
          metric: gap ? `${C(gap)}x` : __('te superan'),
          metricSub: __('más engagement/post ({y} vs {c})', { y: C(youAvg), c: C(compAvg) }),
          impact: 'alto', earlySignal: false,
          detail: {
            color: 'elimina', category: __('Te están ganando'), title: __('La brecha competitiva'),
            findings: [
              { key: 'engagement', severity: 60, label: __('Engagement/post: tú {y} vs competencia {c}', { y: C(youAvg), c: C(compAvg) }) },
              { key: 'volumen',    severity: 30, label: __('Volumen: tú {y} posts vs competencia {c}', { y: Number(bench.brand.posts) || 0, c: Number(bench.competencia.posts) || 0 }) },
            ],
            sections: [{ h: __('¿Dónde te están ganando?'), b: __('La competencia domina el engagement del nicho. No compitas en volumen bruto — compite en resonancia: replica lo que sí te funciona (ver Mi Marca) con más constancia.') }],
          },
        };
      }

      // 4. AMENAZA: el rival que más domina la atención del nicho.
      // Guard: solo rivales con actividad real; jamás "tu mayor amenaza — 0 engagement".
      let riesgo = null;
      const threatPool = (risk.length ? risk : activeRivals).filter((r) => Number(r.total_engagement) > 0);
      const threat = [...threatPool].sort(byEng)[0];
      if (threat) {
        riesgo = {
          title: __('{r} es tu mayor amenaza', { r: threat.entity_name }),
          metric: C(threat.total_engagement), metricSub: __('engagement — domina la atención del nicho'),
          impact: 'alto', earlySignal: false,
          detail: {
            color: 'vigila', category: __('Amenaza'), title: __('Amenazas competitivas'),
            findings: [...threatPool].sort(byEng).slice(0, 5).map((r) => ({
              key: 'rival', n: Number(r.total_engagement) || 0, severity: 55,
              label: r.description || __('{r} domina la conversación', { r: r.entity_name }),
            })),
            sections: [{ h: __('¿Quién amenaza tu posición?'), b: __('Estos rivales dominan la atención del nicho. Vigila sus lanzamientos y su pauta; cuando uno tropiece (una crisis), es tu momento de capturar a su público decepcionado.') }],
          },
        };
      }

      return { funciona, oportunidad, resta, riesgo };
    },

    async _ensureCompetenciaService() {
      if (this._competenciaService) return this._competenciaService;
      if (typeof CompetenciaDataService !== 'function' || !this._supabase) return null;
      this._competenciaService = new CompetenciaDataService();
      await this._competenciaService.init(this._supabase, this._orgId);
      return this._competenciaService;
    },

    _compFiltersKey() { return `comp:filters:v1:${this._orgId || 'global'}`; },
    _restoreCompFilters() {
      if (this._compFilters) return this._compFilters;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(this._compFiltersKey()) || 'null'); } catch (_) {}
      this._compFilters = {
        windowDays: Number(stored?.windowDays) > 0 ? Number(stored.windowDays) : 99999,
        entityId: stored?.entityId || null,
        dateFrom: stored?.dateFrom || null,
        dateTo:   stored?.dateTo   || null,
        platforms: Array.isArray(stored?.platforms) ? stored.platforms : null,
      };
      return this._compFilters;
    },
    async _onCompFilterChange(patch) {
      this._compFilters = { ...(this._compFilters || {}), ...patch };
      try { localStorage.setItem(this._compFiltersKey(), JSON.stringify(this._compFilters)); } catch (_) {}
      const body = document.getElementById('insightTabBody');
      if (body) this._renderCompetence(body);
    },

    _renderCompSkeleton(body) {
      if (this._silentRefresh) return; // auto-refresh: conservar contenido hasta el swap
      body.innerHTML = `
        <div class="insight-page mb-dash">
          <div class="mb-gauge-skeleton skeleton-shimmer" style="height:90px;"></div>
          <div style="height:1rem;"></div>
          ${BaseView.skeletonGrid ? BaseView.skeletonGrid(4) : ''}
        </div>`;
    },

    /* ── Estado competitivo (banner ejecutivo full-width sobre el layout) ──────
       Reempaqueta el head-to-head (dashboard_brand_vs_competencia) + el ranking
       (top) + la voz de la audiencia rival YA cargados en una sola lectura de
       CMO: veredicto de POSICION honesto + diagnostico dinamico + pruebas
       verificables. NO dispara RPC nuevo. Se oculta sin perfiles o sin senal
       real (doctrina blanco total). Reusa _computeCompetitionCards (misma
       matematica de rivalidad). CTA reusa data-comp-entity (sin handler nuevo). */
    _buildCompetenceStatusHero(data) {
      if (this._isCompetenceEmpty(data)) return '';
      const brief = data?.cmoBrief?.data;
      const top = Array.isArray(data?.top?.data) ? data.top.data : [];
      const activeRivals = top.filter((r) => Number(r.total_posts) >= 3 && Number(r.total_engagement) > 0);
      const cards = this._computeCompetitionCards(data);
      if (!activeRivals.length || cards?.funciona?.earlySignal) return '';

      const byEng = (a, b) => Number(b.total_engagement) - Number(a.total_engagement);

      const bench = data?.benchmark?.data || null;
      const b = (bench && bench.brand) || null;
      const c = (bench && bench.competencia) || null;
      const bP = Number(b?.posts) || 0, cP = Number(c?.posts) || 0;
      const benchOk = b && c && bP > 0 && cP > 0;
      const bAvg = Number(b?.avg_engagement_per_post) || 0;
      const cAvg = Number(c?.avg_engagement_per_post) || 0;
      const posPctB = bP > 0 ? Math.round((Number(b.positive_posts) || 0) / bP * 100) : null;
      const posPctC = cP > 0 ? Math.round((Number(c.positive_posts) || 0) / cP * 100) : null;
      const sentDiff = (posPctB != null && posPctC != null) ? posPctB - posPctC : null;

      const leader = [...activeRivals].sort(byEng)[0] || null;

      let vm, titleHtml, desc;
      if (benchOk && bAvg > 0 && cAvg > 0) {
        if (bAvg >= cAvg) {
          const x = (bAvg / cAvg).toFixed(1);
          vm = { lvl: 'good', label: __('por delante') };
          titleHtml = `${__('Frente a tu competencia vas')} <span class="mb-bstat-verdict mb-bstat-verdict--good">${vm.label}</span>: ${__('tu engagement por post es {x} el promedio del nicho', { x: `${x}x` })}.`;
          desc = sentDiff != null && sentDiff > 0
            ? __('No solo rindes mas por publicacion: tu audiencia te quiere +{n} pts mas que a la competencia. Capitaliza el afecto — profundiza lo que ya te conecta antes que perseguir su volumen.', { n: sentDiff })
            : __('Rindes mas por publicacion que el promedio de tu nicho. Sosten la constancia y protege esa resonancia; el volumen bruto no gana solo, la conexion si.');
        } else {
          const gap = bAvg > 0 ? Math.round(cAvg / bAvg) : null;
          const behindPct = Math.round((1 - bAvg / cAvg) * 100);
          const far = behindPct >= 40;
          vm = { lvl: far ? 'low' : 'mid', label: __('por detras') };
          titleHtml = `${__('Frente a tu competencia vas')} <span class="mb-bstat-verdict mb-bstat-verdict--${vm.lvl}">${vm.label}</span>: ${gap && gap > 1 ? __('te sacan {x} en engagement por post', { x: `${gap}x` }) : __('rindes {n}% menos por post que su promedio', { n: behindPct })}.`;
          desc = sentDiff != null && sentDiff > 0
            ? __('Te ganan en volumen de engagement, pero tu sentimiento es +{n} pts sobre ellos: no compitas en su ruido, capitaliza el afecto — dobla la apuesta por lo que tu audiencia si celebra.', { n: sentDiff })
            : __('La competencia rinde mas por publicacion. No persigas su volumen bruto: compite en resonancia — replica con mas constancia lo que a ti si te funciona (ver Mi Marca).');
        }
      } else if (leader) {
        vm = { lvl: 'mid', label: __('en observacion') };
        titleHtml = `${__('Tu posicion competitiva esta')} <span class="mb-bstat-verdict mb-bstat-verdict--mid">${vm.label}</span>: ${__('{r} domina la atencion de tu nicho', { r: this._esc(leader.entity_name) })}.`;
        desc = __('Aun no hay suficiente actividad propia para un cara a cara justo. Estudia la formula del lider (temas, formatos, cadencia) para competir mejor — un referente marca el techo, no es tu enemigo.');
      } else {
        return '';
      }

      return `
        <section class="mb-section mb-bstat-section">
          <div class="mb-bstat">
            <div class="mb-bstat-lead">
              ${brief && brief.headline
                ? `<h3 class="mb-bstat-title">${this._esc(brief.headline)}</h3>
                   <p class="mb-bstat-desc">${this._esc(brief.body || '')}</p>`
                : `<h3 class="mb-bstat-title">${titleHtml}</h3>
                   <p class="mb-bstat-desc">${this._esc(desc)}</p>`}
            </div>
          </div>
        </section>`;
    },

    _buildCompetenciaHtml(data) {
      // Sin perfiles monitoreados NO se pintan las secciones a medio-vacio (cada
      // una con su propio texto "aun no..."). Un solo empty state premium de la
      // plataforma, con CTA a Monitoreo. El resto del panel se enciende solo
      // cuando hay perfiles que vigilar.
      if (this._isCompetenceEmpty(data)) return this._buildCompetenceEmptyState();
      // Layout 2 columnas (igual que Mi Marca): cuerpo ancho a la izquierda,
      // panel "Observaciones" como sidebar sticky a la derecha.
      return `
        <div class="insight-page mb-dash" id="compPage">
          ${this._buildCompetenceStatusHero(data)}
          <div class="mb-layout">
            <div class="mb-layout-main comp-main">
              ${this._buildBattlefield(data?.kpis?.data, data?.top?.data, data?.kpisPrev?.data)}
              ${this._buildCompetitorPatterns(data)}
              ${this._buildWinningFormula(data?.intelligence?.data)}
            </div>
            <aside class="mb-layout-aside">
              ${this._buildObservations(data?.top?.data)}
            </aside>
          </div>
        </div>`;
    },

    /* ── Panel lateral "Observaciones": inteligencia de CONTENIDO por perfil,
       agrupada por rol. Por perfil: "Le rinde" (el tema que dispara su engagement =
       lo estrategico) + "Habla de" (temas recurrentes). Extraido del TEXTO de sus
       posts (CompetenciaDataService._contentInsightsByEntity, rules+math sin LLM;
       llega en r.terms + r.winner). Sin CTAs ni relevancia cruda. ──────────────── */
    _buildObservations(top) {
      const list = (Array.isArray(top) ? top : []).filter((r) => Number(r.total_engagement) > 0 || Number(r.total_posts) > 0);
      // Card con el MISMO diseño que "Salud de tu marca" (mb-health-card--aside):
      // titulo + descripcion DENTRO de la card, con acento superior y glow.
      const head = `
          <div class="comp-obs-head-in">
            <span class="mb-hero-label">${__('Observaciones')}</span>
            <span class="comp-obs-hint">${__('Lo más destacado de cada perfil')}</span>
          </div>`;
      if (!list.length) return ''; // card vacía → se oculta
      const brandHex = this._readBrandHex();
      // Rol = seccion (competencia ≠ referente ≠ aliado); orden de secciones = prioridad
      // de rol (directo primero). Rango = etiqueta editable en otra pagina; nacional
      // pesa mas que internacional dentro de cada rol.
      const ROLE_ORDER = [
        { key: 'competidor_directo',   title: __('Competidores directos') },
        { key: 'competidor_indirecto', title: __('Competidores indirectos') },
        { key: 'referencia_cultural',  title: __('Referencias') },
        { key: 'aliado',               title: __('Aliados') },
      ];
      const RANGO = {
        nacional:      { label: __('Nacional'),      rank: 2 },
        internacional: { label: __('Internacional'), rank: 1 },
      };

      const items = list.map((r) => {
        const rangoKey = typeof r.rango === 'string' ? r.rango.trim().toLowerCase() : '';
        const raw = typeof r.color === 'string' ? r.color.trim() : '';
        return {
          tipo: r.tipo,
          name: r.entity_name,
          color: /^#[0-9a-fA-F]{6,8}$/.test(raw) ? raw : brandHex,
          rango: RANGO[rangoKey] || null,
          rangoKey,
          insights: Array.isArray(r.insights) ? r.insights : [],
          posts: Number(r.total_posts) || 0,
          eng: Number(r.total_engagement) || 0,
        };
      });

      // Cada perfil muestra sus 1-2 observaciones ESTRATEGICAS más notables, de una
      // librería de detectores (le rinde / concentra / virales / parejo / hashtag /
      // habla de). Perfiles distintos disparan detectores distintos -> el panel varía.
      // Orden dentro del rol: rango primero (nacional > internacional), luego engagement.
      const prio = (it) => (it.rango ? it.rango.rank : 0) * 1e9 + it.eng;
      const ICO = { audience_focus: 'star', audience_reject: 'alert-warning', winner: 'arrow-up', focus: 'star', viral: 'fire', even: 'check', hashtag: 'flag', terms: 'eye', opinion_neg: 'alert-warning', opinion_pos: 'check' };
      const EMO = { joy: __('alegría'), anger: __('enojo'), disgust: __('rechazo'), sadness: __('tristeza'), fear: __('miedo'), surprise: __('sorpresa') };
      const insightText = (s) => {
        const b = (x) => `<b>${this._esc(x)}</b>`;
        switch (s.kind) {
          case 'audience_focus': return __('Su audiencia se enfoca en {t}: {x}x engagement y comentarios positivos', { t: b(s.term), x: s.lift });
          case 'audience_reject': return __('Su audiencia reacciona negativo a sus posts sobre {t}', { t: b(s.term) });
          case 'winner':  return __('Le rinde hablar de {t}: {x}x su engagement promedio', { t: b(s.term), x: s.lift });
          case 'focus':   return __('Concentra {p}% de sus posts en {t}', { p: s.pct, t: b(s.term) });
          case 'viral':   return s.term
            ? __('Su post viral sobre {t} concentra {p}% de su engagement', { t: b(s.term), p: s.pct })
            : __('Depende de virales: 1 post concentra {p}% de su engagement', { p: s.pct });
          case 'even':    return __('Alcance parejo: reparte el engagement entre sus posts, no depende de virales');
          case 'hashtag': return __('Firma con #{t} en {p}% de sus posts', { t: this._esc(s.tag), p: s.pct });
          case 'terms':   return __('Habla de {t}', { t: (s.terms || []).map((x) => this._esc(x)).join(' · ') });
          case 'opinion_neg': return s.emotion && EMO[s.emotion]
            ? __('Su audiencia reacciona con {e}: {p}% de comentarios negativos', { e: b(EMO[s.emotion]), p: s.pct })
            : __('Su audiencia reacciona negativo: {p}% de sus comentarios', { p: s.pct });
          case 'opinion_pos': return __('Su audiencia lo respalda: {p}% de comentarios positivos', { p: s.pct });
          default:        return '';
        }
      };
      // DIVERSIDAD de observaciones. Cada señal pertenece a una familia; el panel
      // evita repetir siempre la misma. (a) La primaria de cada perfil = mayor
      // (score − penalización por familia ya usada en el panel) → no todas dicen
      // "reacciona negativo". (b) La secundaria es de una familia DISTINTA a la
      // primaria → nada de doble-negativo en una misma tarjeta.
      const FAMILY = {
        audience_focus: 'pos', opinion_pos: 'pos',
        audience_reject: 'neg', opinion_neg: 'neg',
        winner: 'content', focus: 'content', terms: 'content', hashtag: 'content',
        viral: 'dist', even: 'dist',
      };
      const fam = (s) => FAMILY[s.kind] || s.kind;

      // Orden final: secciones por rol, dentro por rango + engagement.
      const known = new Set(ROLE_ORDER.map((s) => s.key));
      const groups = ROLE_ORDER.map((s) => ({ title: s.title, list: items.filter((it) => it.tipo === s.key) }));
      groups.push({ title: __('Otros'), list: items.filter((it) => !known.has(it.tipo)) });
      for (const g of groups) g.list.sort((a, b) => prio(b) - prio(a));

      const famUsed = {};
      const PEN = 34;
      for (const g of groups) for (const it of g.list) {
        const ranked = it.insights || [];
        if (!ranked.length) { it.chosen = []; continue; }
        let primary = null, bestAdj = -Infinity;
        for (const s of ranked) { const adj = s.score - PEN * (famUsed[fam(s)] || 0); if (adj > bestAdj) { bestAdj = adj; primary = s; } }
        famUsed[fam(primary)] = (famUsed[fam(primary)] || 0) + 1;
        let secondary = ranked.find((s) => s !== primary && fam(s) !== fam(primary)) || null;
        // Dedup del TERMINO entre las 2 lineas: si la secundaria es "habla de", quita
        // el tema que ya nombra la primaria (no repetir "tiendas" arriba y abajo).
        if (secondary && secondary.kind === 'terms') {
          const pterm = primary.term || primary.tag || null;
          if (pterm) {
            const pw = pterm.split(' ');
            const filtered = (secondary.terms || []).filter((t) => t !== pterm && !pw.includes(t) && !t.split(' ').includes(pterm));
            secondary = filtered.length
              ? { ...secondary, terms: filtered }
              : (ranked.find((s) => s !== primary && s !== secondary && fam(s) !== fam(primary)) || null);
          }
        }
        it.chosen = [primary, secondary].filter(Boolean);
      }

      const card = (it) => {
        const top = it.chosen || [];
        const primary = top[0]
          ? `<div class="comp-obs-signal comp-obs-signal--strong"><i class="aisc-ico aisc-ico--${ICO[top[0].kind] || 'eye'}"></i><span>${insightText(top[0])}</span></div>`
          : `<div class="comp-obs-terms">${__('{n} posts en la ventana', { n: fmt.int(it.posts) })}</div>`;
        const secondary = top[1] ? `<div class="comp-obs-terms">${insightText(top[1])}</div>` : '';
        return `
        <div class="comp-obs-item">
          <div class="comp-obs-head">
            <span class="comp-obs-dot" style="background:${it.color}"></span>
            <span class="comp-obs-name">${this._esc(it.name)}</span>
            ${it.rango ? `<span class="comp-obs-rango comp-obs-rango--${it.rangoKey}">${this._esc(it.rango.label)}</span>` : ''}
          </div>
          ${primary}${secondary}
        </div>`;
      };

      const sectionsHtml = groups.map((g) => (g.list.length
        ? `<div class="comp-obs-group"><div class="comp-obs-grouptitle">${g.title}</div>${g.list.map(card).join('')}</div>`
        : '')).join('');

      return `<section class="mb-health-card mb-health-card--aside comp-obs-card">${head}<div class="comp-obs">${sectionsHtml}</div></section>`;
    },

    /* Competencia vacia = no hay NINGUN perfil monitoreado (sin actores). Sin
       perfiles, las tres secciones quedarian vacias; en su lugar mostramos el
       empty state unificado. (Si hay perfiles pero aun sin actividad, el panel
       se pinta normal: _buildBattlefield explica el caso 24-48h con chips.) */
    _isCompetenceEmpty(data) {
      const top = Array.isArray(data?.top?.data) ? data.top.data : [];
      return top.length === 0;
    },

    _buildCompetenceEmptyState() {
      return `
        <div class="insight-page" data-comp-empty="monitoring">
          ${this.emptyState({
            iconSrc: '/recursos/icons/monitoring.svg',
            icon: 'aisc-ico aisc-ico--goal',
            title: __('Aún no monitoreas perfiles'),
            subtitle: __('Este panel se enciende cuando monitoreas perfiles: agrega a tus competidores (para vigilarlos) y a tus referentes (para aprender de ellos) desde Monitoreo. Verás quién domina tu nicho, de qué se queja su audiencia y dónde son vulnerables.'),
            primaryLabel: __('Ir a Monitoreo'),
            primaryAction: 'comp-go-monitoring',
          })}
        </div>`;
    },

    _buildCompFiltersBar() {
      const f = this._compFilters || { windowDays: 99999, entityId: null };

      // Perfil = enfocar el tab en un rival (p_entity_ids). Opciones de la lista
      // completa de rivales (capturada sin filtro). Plataforma requiere backend.
      const actors = Array.isArray(this._compActors) ? this._compActors : [];
      const perfilOpts = [
        `<option value=""${!f.entityId ? ' selected' : ''}>${__('Todos los perfiles')}</option>`,
        ...actors.map(a => `<option value="${this._esc(a.entity_id)}"${f.entityId === a.entity_id ? ' selected' : ''}>${this._esc(a.entity_name)}</option>`),
      ].join('');

      const curPlat = (f.platforms && f.platforms[0]) || '';
      const platOptions = [
        ['', __('Todas')], ['instagram', 'Instagram'], ['facebook', 'Facebook'],
        ['tiktok', 'TikTok'], ['x', 'X'], ['youtube', 'YouTube'],
      ];

      return `
        <header class="living-history-filters mb-filters-bar" id="compFilters">
          ${this._compFechaControl()}
          ${this._buildFilterMenu({ label: __('Plataforma'), value: curPlat, key: 'platform', options: platOptions })}
          <div class="living-filter">
            <label class="living-filter-label" for="compFilterPerfil">${__('Perfil')}</label>
            <select class="living-filter-select" id="compFilterPerfil" data-comp-filter="entityId">${perfilOpts}</select>
          </div>
          ${this._buildIntegrationBubbles()}
          ${this._reportDropdown()}
        </header>`;
    },

    _compFechaControl() {
      if (typeof DateRangePicker !== 'function') {
        return `<div class="living-filter"><label class="living-filter-label">${__('Fecha')}</label>
          <select class="living-filter-select" disabled><option>${__('Todo el periodo')}</option></select></div>`;
      }
      return this._ensureCompDatePicker().html();
    },
    _ensureCompDatePicker() {
      if (!this._compDatePicker) {
        const f = this._compFilters || {};
        this._compDatePicker = new DateRangePicker({
          from: f.dateFrom || null, to: f.dateTo || null,
          onChange: (r) => this._onCompFilterChange({
            dateFrom: r.from ? r.from.toISOString() : null,
            dateTo:   r.to   ? r.to.toISOString()   : null,
          }),
        });
      }
      return this._compDatePicker;
    },
    _mountCompDatePicker(scope) {
      if (typeof DateRangePicker !== 'function' || !this._compDatePicker) return;
      const el = (scope || document).querySelector('[data-drp]');
      if (el) this._compDatePicker.mount(el);
    },

    /* Delta periodo-vs-periodo: badge ▲/▼ %. Solo para KPIs numericos y cuando
       hay ventana previa con datos (prev>0). Devuelve '' en otros casos. */
    _kpiDelta(cur, prev) {
      const c = Number(cur), p = Number(prev);
      if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return '';
      const pct = Math.round((c - p) / Math.abs(p) * 100);
      if (pct === 0) return `<span class="comp-kpi-delta is-flat">0%</span>`;
      const up = pct > 0;
      return `<span class="comp-kpi-delta ${up ? 'is-up' : 'is-down'}" title="${__('vs periodo previo')}">${up ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
    },

    /* ── 1. El campo de batalla: panorámica + ranking de rivales ──────── */
    /* ── Tonos / Temas de la COMPETENCIA (solo competidores, no referentes ni
       aliados). Reusa las tablas de patrones de Mi Marca (_buildPatternTable),
       alimentadas por dashboard_monitoreo_tones/topics. ── */
    _buildCompetitorPatterns(data) {
      const map = (r, nameKey, usedKey) => ({
        name: r[nameKey],
        used: Number(r[usedKey]) || 0,
        eng: Number(r.total_engagement) || 0,
        likes: Number(r.total_likes) || 0,
        comments: Number(r.total_comments) || 0,
        pos: Number(r.pos_ratio) || 0,
        neg: Number(r.neg_ratio) || 0,
        trend: Array.isArray(r.trend) ? r.trend.map((v) => Number(v) || 0) : [],
        topPosts: Array.isArray(r.top_posts) ? r.top_posts : [],
      });
      const tones  = (Array.isArray(data?.monitoreoTones?.data)  ? data.monitoreoTones.data  : []).map((r) => map(r, 'tone_name',  'posts_count'));
      const topics = (Array.isArray(data?.monitoreoTopics?.data) ? data.monitoreoTopics.data : []).map((r) => map(r, 'topic_name', 'usage_count'));
      const toneCard  = this._buildPatternTable(__('Tonos de la competencia'), __('Qué tono usan más tus competidores directos'), __('Tono'), tones);
      const topicCard = this._buildPatternTable(__('Temas de la competencia'), __('Qué tema explota más tu competencia'),           __('Tema'), topics);
      if (!toneCard && !topicCard) return '';
      return `
        <section class="mb-section mb-section--wide">
          <div class="mb-long-grid mb-long-grid--single">${toneCard}${topicCard}</div>
        </section>`;
    },

    _buildBattlefield(_k, top, _kPrev) {
      const list = Array.isArray(top) ? top : [];

      // ── Doctrina de renderizado: null ≠ 0. Si ningún perfil tiene actividad
      // capturada, NO se pintan KPIs en cero ni un ranking de ceros (ausencia de
      // ingesta ≠ medición). Un solo empty state con la causa + los perfiles
      // configurados como evidencia de que el radar existe.
      const hasActivity = list.some((r) => Number(r.total_posts) > 0 || Number(r.total_engagement) > 0);
      if (!hasActivity) return ''; // card vacía → se oculta

      // Solo perfiles con actividad medible entran al chart. Los de 0 posts y
      // 0 engagement no se muestran (ni como chips) — no aportan senal.
      const plotted = list.filter((r) => Number(r.total_engagement) > 0 || Number(r.total_posts) > 0);

      // El titulo + descripcion van DENTRO de la card (.comp-sov): el header deja
      // de flotar arriba y queda como cabecera interna, con su regla fina como
      // separador entre el header y el chart.
      return `
        <section class="mb-section">
          <div class="comp-sov">
            <div class="mb-section-head">
              <span class="mb-section-title">${__('Influencia digital')}</span>
              <span class="mb-section-hint">${__('Contenido, sentimiento y engagement de cada perfil — fuerza relativa al líder del nicho')}</span>
            </div>
            ${plotted.length
              ? `<div class="comp-sov-canvas"><canvas id="compInfluenceBars"></canvas></div>
                 <div class="comp-sov-legend" id="compInfluenceLegend"></div>`
              : `<div class="mb-causal-empty">${__('Sin rivales con actividad en la ventana.')}</div>`}
          </div>
        </section>`;
    },

    /* ── Influencia digital: barras agrupadas por perfil (Chart.js) ──────────
       Un grupo por perfil monitoreado; dentro, 3 barras — contenido (posts),
       sentimiento (positivo de su audiencia) y engagement producido — en tonos
       del color del perfil. Contenido y engagement se normalizan al líder del
       nicho (0-100 = % del líder) para caber en un mismo eje; el sentimiento
       ya es % absoluto. El tooltip guarda siempre el valor real. */
    async _renderInfluenceBars(data) {
      const el = document.getElementById('compInfluenceBars');
      if (!el) return;
      this._destroyCharts(); // limpia el chart anterior en re-render (evita fuga)
      const list = (Array.isArray(data?.top?.data) ? data.top.data : [])
        .filter((r) => Number(r.total_engagement) > 0 || Number(r.total_posts) > 0)
        .sort((a, b) => Number(b.total_engagement) - Number(a.total_engagement))
        .slice(0, 8); // no saturar el eje con demasiados grupos
      if (!list.length) return;
      try { await this._ensureChartJs(); } catch (_) { /* noop */ }
      const Chart = window.Chart; if (!Chart) return;
      const TICK = 'rgba(212,209,216,0.5)', GRID = 'rgba(255,255,255,0.06)';
      // Color = el del perfil monitoreado (intelligence_entities.color[0], que
      // llega como r.color); si no tiene, el color dinámico de la marca. NO paleta
      // arbitraria. Mismo criterio que MonitoringView.
      const brandHex = this._readBrandHex();
      const maxPosts = Math.max(...list.map((r) => Number(r.total_posts) || 0), 1);
      const maxEng = Math.max(...list.map((r) => Number(r.total_engagement) || 0), 1);
      // Engagement se normaliza en LOG: con un líder aplastante (p.ej. Nike ~99%
      // del engagement del nicho) la escala lineal deja a todos los demás en ~0 y
      // sus barras desaparecen. Log comprime al líder y levanta a los pequeños
      // manteniendo el orden. Contenido (posts, rango chico) va lineal — más fiel;
      // sentimiento ya es % absoluto. 100 = líder del nicho en cada volumen.
      const logScore = (v, max) => (max <= 0 ? 0 : Math.round(Math.log10(Number(v) + 1) / Math.log10(max + 1) * 100));
      const profiles = list.map((r) => {
        const posts = Number(r.total_posts) || 0;
        const eng = Number(r.total_engagement) || 0;
        const hasSent = r.positive_sentiment_ratio != null;
        const sentPct = hasSent ? Math.round(Number(r.positive_sentiment_ratio) * 100) : null;
        const raw = typeof r.color === 'string' ? r.color.trim() : '';
        return {
          name: r.entity_name,
          tipo: this._compTipoMeta(r.tipo).label,
          color: /^#[0-9a-fA-F]{6,8}$/.test(raw) ? raw : brandHex,
          posts, eng, hasSent, sentPct,
          contentScore: Math.round(posts / maxPosts * 100),
          sentScore: sentPct == null ? 0 : sentPct,
          engScore: logScore(eng, maxEng),
        };
      });
      // 3 métricas = 3 datasets; cada barra se colorea con el color del perfil
      // (indexado por grupo) y una opacidad fija por métrica, así el color dice
      // "qué perfil" y el tono dice "qué métrica".
      const METRICS = [
        { key: 'contentScore', label: __('Contenido'),   alpha: 'FF' },
        { key: 'sentScore',    label: __('Sentimiento'), alpha: 'B0' },
        { key: 'engScore',     label: __('Engagement'),  alpha: '66' },
      ];
      const labels = profiles.map((p) => p.name);
      const datasets = METRICS.map((m) => ({
        label: m.label,
        data: profiles.map((p) => p[m.key]),
        backgroundColor: profiles.map((p) => p.color + m.alpha),
        borderColor: profiles.map((p) => p.color),
        borderWidth: 1,
        borderRadius: 3,
        maxBarThickness: 22,
        _metric: m.key,
      }));
      try {
        this._reg(new Chart(el.getContext('2d'), {
          type: 'bar',
          data: { labels, datasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 14, right: 16, bottom: 4, left: 8 } },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#141517', borderColor: '#242424', borderWidth: 1, titleColor: '#D4D1D8', bodyColor: 'rgba(212,209,216,0.85)', padding: 10,
                callbacks: {
                  title: (items) => {
                    const p = profiles[items[0].dataIndex];
                    return `${p.name} · ${p.tipo}`;
                  },
                  label: (c) => {
                    const p = profiles[c.dataIndex];
                    const metric = c.dataset._metric;
                    if (metric === 'contentScore') return `${__('Contenido')}: ${fmt.int(p.posts)} ${__('posts')}`;
                    if (metric === 'sentScore') return p.hasSent ? `${__('Sentimiento')}: ${p.sentPct}% ${__('positivo')}` : `${__('Sentimiento')}: ${__('sin datos')}`;
                    return `${__('Engagement')}: ${this._compactNum(p.eng)}`;
                  },
                },
              },
            },
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { color: TICK, font: { size: 10 }, autoSkip: false, maxRotation: 30, minRotation: 0 } },
              y: {
                min: 0, max: 100, grid: { color: GRID }, border: { display: false },
                title: { display: true, text: __('Índice comparativo (100 = líder del nicho)'), color: TICK, font: { size: 10 } },
                ticks: { color: TICK, font: { size: 9 }, callback: (v) => v + '%', maxTicksLimit: 6 },
              },
            },
          },
        }));
      } catch (e) { console.warn('[influence bars]', e?.message); }
      // Leyenda color -> perfil (los nombres largos no caben como ticks del eje).
      // Las 3 métricas ya se distinguen por opacidad y por el orden fijo dentro
      // de cada grupo; su leyenda se quitó por redundante.
      const legend = document.getElementById('compInfluenceLegend');
      if (legend) {
        legend.innerHTML = profiles.map((p) => `
          <span class="comp-sov-leg">
            <span class="comp-sov-dot" style="background:${p.color}"></span>
            ${this._esc(p.name)}
          </span>`).join('');
      }
    },

    /* Color dinámico de la marca: --brand-primary → último stop del gradient
       dinámico → cálido por defecto. Fallback cuando el perfil no tiene color
       propio. Mismo criterio que AudienceMap/MonitoringView. */
    _readBrandHex() {
      try {
        const cs = getComputedStyle(document.documentElement);
        const primary = (cs.getPropertyValue('--brand-primary') || '').trim();
        if (/^#[0-9a-fA-F]{6,8}$/.test(primary)) return primary;
        const grad = (cs.getPropertyValue('--brand-gradient-dynamic') ||
                      cs.getPropertyValue('--brand-gradient') || '').trim();
        const hexes = grad.match(/#[0-9a-fA-F]{6,8}/g);
        if (hexes && hexes.length) return hexes[hexes.length - 1];
      } catch (_) { /* noop */ }
      return '#e09145';
    },

    /* ── 1a. Mi Marca vs Competencia: benchmark head-to-head + share-of-voice ──
       dashboard_brand_vs_competencia (jsonb {brand, competencia}) +
       dashboard_competencia_comparison (share-of-voice por rival). */
    _buildBenchmark(bench, sov) {
      const b = (bench && bench.brand) || null;
      const c = (bench && bench.competencia) || null;
      // Sin marca propia con actividad o sin competencia: no mostrar el bloque.
      if (!b || !c) return '';

      const num = (x) => Number(x || 0);
      const bEng = num(b.engagement), cEng = num(c.engagement);
      const bAvg = num(b.avg_engagement_per_post), cAvg = num(c.avg_engagement_per_post);
      const bP = num(b.posts), cP = num(c.posts);
      const bPos = num(b.positive_posts), cPos = num(c.positive_posts);
      // Doctrina: una comparación exige AMBOS lados con actividad. Antes el guard
      // era (bP===0 && cP===0), y con un solo lado activo se colaba la tabla
      // "101 vs 0" y el share-of-voice "Mi Marca 100% / Competencia 0%" — una
      // comparación fabricada. El campo de batalla ya explica la causa del vacío.
      if (bP === 0 || cP === 0) return '';

      // Headline = engagement por post (metrica justa, normalizada por volumen).
      let headline = __('Aun no hay suficiente actividad para comparar engagement por post.');
      let headCls = 'comp-bench-head--neutral';
      if (bAvg > 0 && cAvg > 0) {
        if (bAvg >= cAvg) {
          headline = __('Tu engagement por post es {x} el promedio de tu competencia.', { x: `<b>${(bAvg / cAvg).toFixed(1)}x</b>` });
          headCls = 'comp-bench-head--win';
        } else {
          headline = __('Tu engagement por post esta {x} por debajo del promedio de tu competencia.', { x: `<b>${Math.round((1 - bAvg / cAvg) * 100)}%</b>` });
          headCls = 'comp-bench-head--lose';
        }
      }

      // Share of voice (engagement): mi marca vs total competencia.
      const totalEng = bEng + cEng;
      const brandShare = totalEng > 0 ? (bEng / totalEng * 100) : 0;
      const compShare = 100 - brandShare;

      const posPctB = bP > 0 ? Math.round(bPos / bP * 100) : 0;
      const posPctC = cP > 0 ? Math.round(cPos / cP * 100) : 0;
      const row = (label, bv, cv, bWin, cWin) => `
        <div class="comp-bench-row">
          <span class="comp-bench-metric">${label}</span>
          <span class="comp-bench-val${bWin ? ' is-win' : ''}">${bv}</span>
          <span class="comp-bench-val${cWin ? ' is-win' : ''}">${cv}</span>
        </div>`;
      const rows = [
        row(__('Engagement por post'), this._compactNum(bAvg), this._compactNum(cAvg), bAvg > cAvg, cAvg > bAvg),
        row(__('% posts positivos'), `${posPctB}%`, `${posPctC}%`, posPctB > posPctC, posPctC > posPctB),
        row(__('Engagement total'), this._compactNum(bEng), this._compactNum(cEng), false, false),
        row(__('Posts publicados'), fmt.int(bP), fmt.int(cP), false, false),
      ].join('');

      // Share of voice por rival (% del engagement del set competitivo).
      const sovList = (Array.isArray(sov) ? sov : []).filter(r => Number(r.total_engagement) > 0).slice(0, 6);
      const maxPct = sovList.reduce((m, r) => Math.max(m, Number(r.engagement_pct || 0)), 0) || 1;
      const sovRows = sovList.map(r => {
        const pct = Number(r.engagement_pct || 0);
        const w = Math.max(2, Math.round(pct / maxPct * 100));
        return `
          <div class="comp-bench-sov-row comp-clickable" data-comp-entity="${this._esc(r.entity_id)}" data-comp-name="${this._esc(r.entity_name)}" role="button" tabindex="0">
            <span class="comp-bench-sov-name">${this._esc(r.entity_name)}</span>
            <div class="comp-bench-sov-track"><span class="comp-bench-sov-fill" style="width:${w}%;"></span></div>
            <span class="comp-bench-sov-pct">${pct.toFixed(1)}%</span>
          </div>`;
      }).join('');

      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">${__('Mi Marca vs Competencia')}</span>
            <span class="mb-section-hint">${__('Como te mides contra el promedio de tu nicho')}</span>
          </div>
          <div class="comp-bench-head ${headCls}">${headline}</div>
          <div class="comp-bench-grid">
            <div class="comp-bench-h2h">
              <div class="comp-bench-row comp-bench-row--head">
                <span class="comp-bench-metric"></span>
                <span class="comp-bench-col comp-bench-col--brand">${__('Mi Marca')}</span>
                <span class="comp-bench-col comp-bench-col--comp">${__('Competencia')}</span>
              </div>
              ${rows}
            </div>
            <div class="comp-bench-sov">
              <div class="comp-bench-sov-bar">
                <span class="comp-bench-sov-seg comp-bench-sov-seg--brand" style="width:${brandShare.toFixed(1)}%;"></span>
                <span class="comp-bench-sov-seg comp-bench-sov-seg--comp" style="width:${compShare.toFixed(1)}%;"></span>
              </div>
              <div class="comp-bench-sov-legend">
                <span><i class="comp-bench-dot comp-bench-dot--brand"></i> ${__('Mi Marca {n}%', { n: Math.round(brandShare) })}</span>
                <span><i class="comp-bench-dot comp-bench-dot--comp"></i> ${__('Competencia {n}%', { n: Math.round(compShare) })}</span>
              </div>
              <span class="comp-bench-sov-cap">${__('Share of voice por engagement')}</span>
              ${sovList.length ? `<div class="comp-bench-sov-list">${sovRows}</div>` : ''}
            </div>
          </div>
        </section>`;
    },

    /* ── 1b. Qué les funciona: la fórmula ganadora del nicho ──────────── */
    _buildWinningFormula(intel) {
      const combos = Array.isArray(intel?.winning_combos) ? intel.winning_combos.slice(0, 6) : [];
      if (!combos.length) return ''; // card vacía → se oculta
      const cap = (s) => { const t = String(s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
      const rows = combos.map((c) => `
        <div class="comp-combo-row">
          <div class="comp-combo-dims">
            <span class="comp-combo-tag">${this._esc(cap(c.tone))}</span>
            <span class="comp-combo-sep">·</span>
            <span class="comp-combo-tag">${this._esc(cap(c.topic))}</span>
            <span class="comp-combo-sep">·</span>
            <span class="comp-combo-tag">${this._esc(cap(c.format))}</span>
          </div>
          <div class="comp-combo-meta">
            <span class="comp-combo-brands">${this._esc((Array.isArray(c.brands_using) ? c.brands_using : []).join(', '))} · ${fmt.int(c.posts_count)} posts</span>
            <span class="comp-combo-eng">${this._compactNum(c.avg_engagement)}/post</span>
          </div>
        </div>`).join('');
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">${__('Qué les funciona')}</span>
            <span class="mb-section-hint">${__('La fórmula ganadora de tu nicho — qué replicar o contraatacar')}</span>
          </div>
          <div class="comp-combos">${rows}</div>
        </section>`;
    },

    /* ── 2. La voz de su audiencia: pain points (el oro) ──────────────── */
    _buildAudienceVoice(voice) {
      const list = Array.isArray(voice) ? voice : [];
      if (!list.length) return ''; // card vacía → se oculta
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">${__('La voz de su audiencia')}</span>
            <span class="mb-section-hint">${__('De qué se quejan sus seguidores — tu munición de contenido')}</span>
          </div>
          ${list.length ? `<div class="comp-voice-grid">${list.map(v => this._buildVoiceCard(v)).join('')}</div>`
            : `<div class="mb-causal-empty">${__('Aún no hay comentarios analizados de tus rivales.')}</div>`}
        </section>`;
    },

    _buildVoiceCard(v) {
      const negPct = Number.isFinite(Number(v.neg_ratio)) ? Math.round(Number(v.neg_ratio) * 100) : 0;
      const posPct = Number.isFinite(Number(v.pos_ratio)) ? Math.round(Number(v.pos_ratio) * 100) : 0;
      const negs = (Array.isArray(v.sample_negative) ? v.sample_negative : []).filter(Boolean);
      const poss = (Array.isArray(v.sample_positive) ? v.sample_positive : []).filter(Boolean);
      const quote = (t) => `<li class="comp-voice-quote">${this._esc(t)}</li>`;
      return `
        <article class="comp-voice-card comp-clickable" data-comp-entity="${this._esc(v.entity_id)}" data-comp-name="${this._esc(v.entity_name)}" role="button" tabindex="0">
          <div class="comp-voice-head">
            <span class="comp-voice-name">${this._esc(v.entity_name)}</span>
            <span class="comp-voice-meta">${__('{n} comentarios', { n: fmt.int(v.total_comments) })} · <b style="color:var(--dash-neg,#b3796f);">${__('{n}% neg', { n: negPct })}</b> · ${__('{n}% pos', { n: posPct })}</span>
          </div>
          ${negs.length ? `
            <div class="comp-voice-block comp-voice-block--neg">
              <span class="comp-voice-label"><i class="aisc-ico aisc-ico--alert-warning"></i> ${__('Se quejan de')}</span>
              <ul class="comp-voice-list">${negs.map(quote).join('')}</ul>
            </div>` : ''}
          ${poss.length ? `
            <div class="comp-voice-block comp-voice-block--pos">
              <span class="comp-voice-label"><i class="aisc-ico aisc-ico--likes"></i> ${__('Aman')}</span>
              <ul class="comp-voice-list">${poss.map(quote).join('')}</ul>
            </div>` : ''}
        </article>`;
    },

    /* ── 3. Vulnerabilidades del rival ────────────────────────────────── */
    _buildRivalRisk(risk) {
      const list = (Array.isArray(risk) ? risk : []).filter(r => Number(r.negative_sentiment_ratio) > 0 || Number(r.flags_count) > 0 || Number(r.high_risk_posts) > 0);
      if (!list.length) return ''; // card vacía → se oculta
      const rows = list.map(r => {
        const neg = Math.round(Number(r.negative_sentiment_ratio || 0) * 100);
        return `
          <div class="comp-risk-row">
            <div class="comp-risk-name">
              <span class="comp-risk-brand">${this._esc(r.entity_name)}</span>
              ${r.description ? `<span class="comp-risk-desc">${this._esc(r.description)}</span>` : ''}
            </div>
            <div class="comp-risk-stats">
              ${neg > 0 ? `<span class="comp-risk-chip comp-risk-chip--neg">${__('{n}% negativo', { n: neg })}</span>` : ''}
              ${Number(r.high_risk_posts) > 0 ? `<span class="comp-risk-chip">${__('{n} posts de riesgo', { n: fmt.int(r.high_risk_posts) })}</span>` : ''}
              ${Number(r.flags_count) > 0 ? `<span class="comp-risk-chip">${__('{n} flags', { n: fmt.int(r.flags_count) })}</span>` : ''}
            </div>
          </div>`;
      }).join('');
      return `
        <section class="mb-section">
          <div class="mb-section-head">
            <span class="mb-section-title">${__('Vulnerabilidades del rival')}</span>
            <span class="mb-section-hint">${__('Rival con sentimiento negativo = momento de capturar su audiencia')}</span>
          </div>
          ${list.length ? `<div class="comp-risk-list">${rows}</div>` : `<div class="mb-causal-empty">${__('Ningún rival muestra vulnerabilidad clara ahora.')}</div>`}
        </section>`;
    },

    _compTipoMeta(tipo) {
      return {
        competidor_directo:   { label: __('Directo'),   color: '#b3796f' },
        competidor_indirecto: { label: __('Indirecto'), color: '#9c8e6b' },
        referencia_cultural:  { label: __('Referencia'), color: '#8a8a8e' },
      }[tipo] || { label: tipo || '—', color: '#8a8a8e' };
    },

    _bindCompetenceHandlers(body) {
      if (!body || body.dataset.compBound === '1') return;
      body.dataset.compBound = '1';
      this._bindPatternTableToggle(body);
      body.addEventListener('change', (e) => {
        const el = e.target.closest('[data-comp-filter]');
        if (!el) return;
        const key = el.dataset.compFilter;
        if (key === 'windowDays') this._onCompFilterChange({ windowDays: Number(el.value) || 99999 });
        else if (key === 'entityId') this._onCompFilterChange({ entityId: el.value || null });
      });
      body.addEventListener('click', (e) => {
        const sel = this._handleFilterMenuClick(e);
        if (sel) {
          if (sel.key === 'platform') this._onCompFilterChange({ platforms: sel.value ? [sel.value] : null });
          return;
        }
        // CTA del empty state: ir a Monitoreo (donde se agregan perfiles).
        const goMon = e.target.closest('[data-action="comp-go-monitoring"]');
        if (goMon && window.router) {
          e.preventDefault();
          const path = window.location.pathname || '';
          const base = path.startsWith('/org/') ? path.split('/').slice(0, 4).join('/') : '';
          window.router.navigate(base ? `${base}/monitoring` : '/monitoring');
          return;
        }
        const el = e.target.closest('[data-comp-entity]');
        if (!el) return;
        this._openCompetitorDetail(el.dataset.compEntity, el.dataset.compName);
      });
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest('[data-comp-entity]');
        if (!el) return;
        e.preventDefault();
        this._openCompetitorDetail(el.dataset.compEntity, el.dataset.compName);
      });
    },

    /* Drill-down: modal con las publicaciones de UN rival (reusa el modal de detalle). */
    async _openCompetitorDetail(entityId, name) {
      if (!entityId || !this._competenciaService) return;
      const { ov, dr } = this._ensureDetailDrawer();
      const titleEl = document.getElementById('mbDetailTitle');
      const subEl   = document.getElementById('mbDetailSub');
      const bodyEl  = document.getElementById('mbDetailBody');
      if (titleEl) titleEl.textContent = name || __('Rival');
      if (subEl)   subEl.textContent = __('Cargando…');
      if (bodyEl)  bodyEl.innerHTML = `<div class="mb-detail-loading"><i class="aisc-ico fa-spin aisc-ico--loader"></i></div>`;
      ov.classList.add('active'); dr.classList.add('active');
      document.body.style.overflow = 'hidden';
      if (this._detailEscHandler) document.addEventListener('keydown', this._detailEscHandler);
      try {
        const win = this._compData?.window || {};
        // Perfil completo del rival: posts + actividad + distribuciones + horas
        // (en paralelo). El perfil degrada por seccion; los posts mandan el subtitulo.
        const [rows, profile] = await Promise.all([
          this._competenciaService.loadActorPosts(entityId, win.from, win.to, 30),
          this._competenciaService.loadActorProfile(entityId, win.from, win.to),
        ]);
        const posts = rows.map((r) => ({
          network: r.network, content: r.content_preview, captured_at: r.captured_at,
          engagement_total: r.engagement_total, metrics: r.metrics, sentiment_text: r.sentiment_text,
        }));
        if (subEl) subEl.textContent = __('{n} {pub}', { n: posts.length, pub: posts.length === 1 ? __('publicacion') : __('publicaciones') });
        this._renderCompetitorProfile(bodyEl, profile, posts);
      } catch (e) {
        console.error('[comp detail] load failed:', e?.message || e);
        if (subEl) subEl.textContent = '';
        if (bodyEl) bodyEl.innerHTML = `<div class="mb-detail-empty"><i class="aisc-ico aisc-ico--alert-warning"></i><p>${__('No se pudieron cargar las publicaciones.')}</p></div>`;
      }
    },

    /* FEAT-037: perfil de rival en el drawer = distribuciones + mejores horas +
       actividad reciente + publicaciones. Cada seccion se omite si no hay dato. */
    _renderCompetitorProfile(bodyEl, profile, posts) {
      if (!bodyEl) return;
      const p = profile || {};
      const sections = [];

      const distHtml = this._compDistHtml(p.distributions);
      if (distHtml) sections.push(distHtml);

      const hours = Array.isArray(p.postingHours) ? p.postingHours : [];
      if (hours.length) {
        sections.push(
          `<section class="comp-prof-sec"><h4 class="comp-prof-h">${__('Cuando publica')}</h4>${this._buildPostingHeatmap(hours)}</section>`
        );
      }

      const actHtml = this._compActivityHtml(p.activity);
      if (actHtml) sections.push(actHtml);

      const postsHtml = posts && posts.length
        ? `<ul class="mb-detail-list">${posts.map((x) => this._detailPostHtml(x)).join('')}</ul>`
        : `<div class="mb-detail-empty"><i class="aisc-ico aisc-ico--inbox"></i><p>${__('Sin publicaciones en esta ventana.')}</p></div>`;
      sections.push(`<section class="comp-prof-sec"><h4 class="comp-prof-h">${__('Publicaciones')}</h4>${postsHtml}</section>`);

      bodyEl.innerHTML = sections.join('');
    },

    /* Etiqueta legible de sentimiento (POSITIVE/POS/positive → Positivo). */
    _compSentLabel(s) {
      const u = String(s || '').toUpperCase();
      if (u.startsWith('POS')) return __('Positivo');
      if (u.startsWith('NEG')) return __('Negativo');
      if (u.startsWith('NEU')) return __('Neutro');
      return '';
    },

    /* Barras de distribucion (monocromo) para plataforma / sentimiento / tono. */
    _compDistHtml(dist) {
      if (!dist || typeof dist !== 'object') return '';
      const cats = [
        { key: 'platform',  title: __('Por plataforma'),  fmt: (k) => this._prettyPlatform(k) },
        { key: 'sentiment', title: __('Por sentimiento'), fmt: (k) => this._compSentLabel(k) || k },
        { key: 'tone',      title: __('Por tono'),         fmt: (k) => k },
      ];
      const blocks = cats.map((c) => {
        const obj = dist[c.key];
        if (!obj || typeof obj !== 'object') return '';
        const entries = Object.entries(obj)
          .map(([k, v]) => [k, Number(v) || 0])
          .filter(([k, v]) => v > 0 && k !== 'unknown' && k !== 'sin_tono')
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        if (!entries.length) return '';
        const max = entries[0][1] || 1;
        const rows = entries.map(([k, v]) => `
          <div class="comp-dist-row">
            <span class="comp-dist-lbl">${this._esc(String(c.fmt(k)))}</span>
            <span class="comp-dist-bar"><span style="width:${Math.max(6, Math.round((v / max) * 100))}%"></span></span>
            <span class="comp-dist-val">${this._compactNum(v)}</span>
          </div>`).join('');
        return `<div class="comp-dist-group"><span class="comp-dist-title">${c.title}</span>${rows}</div>`;
      }).filter(Boolean);
      if (!blocks.length) return '';
      return `<section class="comp-prof-sec"><h4 class="comp-prof-h">${__('Como se reparte su contenido')}</h4><div class="comp-dist">${blocks.join('')}</div></section>`;
    },

    /* Actividad reciente por periodo (posts + engagement + sentimiento dominante). */
    _compActivityHtml(activity) {
      const list = Array.isArray(activity) ? activity.slice(-8) : [];
      if (!list.length) return '';
      const rows = list.map((r) => {
        const dom = this._compSentLabel(r.dominant_sentiment);
        const n = Number(r.posts_count) || 0;
        return `
          <div class="comp-act-row">
            <span class="comp-act-lbl">${this._esc(String(r.period_label || ''))}</span>
            <span class="comp-act-posts">${this._compactNum(n)} ${n === 1 ? __('post') : __('posts')}</span>
            <span class="comp-act-eng">${this._compactNum(r.total_engagement)} ${__('eng')}</span>
            ${dom ? `<span class="comp-act-sent">${this._esc(dom)}</span>` : ''}
          </div>`;
      }).join('');
      return `<section class="comp-prof-sec"><h4 class="comp-prof-h">${__('Actividad reciente')}</h4><div class="comp-act">${rows}</div></section>`;
    },
  });
})();
