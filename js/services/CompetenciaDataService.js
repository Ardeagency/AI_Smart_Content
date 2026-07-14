/**
 * CompetenciaDataService — capa de datos del tab "Competencia".
 *
 * Lente = rivales. Llama a las RPCs dashboard_competencia_* (org-scoped, RLS):
 *   - kpis            → panorámica del campo de batalla
 *   - top             → ranking de rivales por engagement
 *   - risk            → vulnerabilidades / crisis del rival
 *   - audience_voice  → la voz de su audiencia (pain points de comentarios)
 *
 * Las RPCs filtran por entity (competidores), no por brand_container, y reciben
 * timestamptz. Devuelve { data, isEmpty, error } por bloque para manejo graceful.
 */
class CompetenciaDataService {
  constructor() {
    this.sb = null;
    this.orgId = null;
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    return this;
  }

  _ok(data)  { return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null }; }
  _err(error){ return { data: null, isEmpty: true, error }; }
  _unwrap(s) {
    if (s.status === 'rejected') return this._err(s.reason);
    if (s.value?.error) return this._err(s.value.error);
    return this._ok(s.value?.data);
  }

  _resolveWindow(opts = {}) {
    if (opts.dateFromIso && opts.dateToIso) {
      return { from: new Date(opts.dateFromIso).toISOString(), to: new Date(opts.dateToIso).toISOString() };
    }
    const windowDays = Math.max(1, Number(opts.windowDays || 99999));
    const now = new Date();
    const from = new Date(now.getTime() - windowDays * 86400_000);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  async loadAll(opts = {}) {
    if (!this.sb || !this.orgId) return null;
    const { from, to } = this._resolveWindow(opts);
    // Perfil: si se elige un rival, todo el tab se enfoca en el (p_entity_ids).
    const entityIds = opts.entityId ? [opts.entityId] : null;
    const platforms = Array.isArray(opts.platforms) && opts.platforms.length ? opts.platforms : null;

    const cacheKey = `dash:competencia:${this.orgId}:${from}:${to}:${opts.entityId || 'all'}:${(platforms || []).join(',')}`;
    const run = () => this._fetchAll(from, to, entityIds, platforms);
    if (window.apiClient) {
      return window.apiClient.query(cacheKey, run, { ttl: 60 * 1000, staleWhileRevalidate: true });
    }
    return run();
  }

  async _fetchAll(from, to, entityIds = null, platforms = null) {
    const org = this.orgId;
    const windowD = Math.max(1, Math.round((Date.now() - new Date(from).getTime()) / 86400_000));
    // Ventana previa (misma longitud, inmediatamente anterior) para deltas
    // periodo-vs-periodo. Con ventana "todo el periodo" (99999d) la previa cae
    // en fechas vacias y los deltas no se muestran (guard prev===0): correcto.
    const span = new Date(to).getTime() - new Date(from).getTime();
    const prevFrom = new Date(new Date(from).getTime() - span).toISOString();
    const prevTo = from;
    const [kpis, top, risk, voice, intel, bench, sov, kpisPrev, entColors, monTones, monTopics, cmoBrief] = await Promise.allSettled([
      this.sb.rpc('dashboard_competencia_kpis', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_platforms: platforms }),
      this.sb.rpc('dashboard_competencia_top',  { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_limit: 8, p_platforms: platforms }),
      this.sb.rpc('dashboard_competencia_risk', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_limit: 6, p_platforms: platforms }),
      this.sb.rpc('dashboard_competencia_audience_voice', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_limit: 12, p_platforms: platforms }),
      this.sb.rpc('dashboard_competencia_intelligence', { p_org_id: org, p_window_d: windowD, p_platforms: platforms }),
      // Benchmark Mi Marca vs Competencia (head-to-head). p_brand_container_ids
      // null = todas las marcas propias de la org. Devuelve jsonb {brand, competencia}.
      this.sb.rpc('dashboard_brand_vs_competencia', { p_org_id: org, p_date_from: from, p_date_to: to, p_brand_container_ids: null, p_entity_ids: entityIds }),
      // Share-of-voice por rival (ranking por % de engagement del set competitivo).
      this.sb.rpc('dashboard_competencia_comparison', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_limit: 8 }),
      this.sb.rpc('dashboard_competencia_kpis', { p_org_id: org, p_date_from: prevFrom, p_date_to: prevTo, p_entity_ids: entityIds, p_platforms: platforms }),
      // Color + relevancia + rango por perfil (intelligence_entities). El RPC top no
      // los expone; los traemos aparte (RLS org-scoped): color -> barras de "Influencia
      // digital" (o color de marca si no tiene); relevance -> contexto curado y rango
      // (metadata.rango = nacional|internacional) -> priorizacion del panel lateral
      // "Observaciones". El rango se edita en otra pagina; aqui solo se consume.
      this.sb.from('intelligence_entities').select('id,color,relevance,metadata').eq('organization_id', org),
      // Tonos / Temas agregados de la COMPETENCIA (solo competidor_directo/indirecto,
      // NO referentes ni aliados). Mismas tablas que Mi Marca, aplicadas a rivales.
      this.sb.rpc('dashboard_monitoreo_tones',  { p_org_id: org, p_date_from: from, p_date_to: to, p_limit: 8 }),
      this.sb.rpc('dashboard_monitoreo_topics', { p_org_id: org, p_date_from: from, p_date_to: to, p_limit: 8 }),
      this.sb.from('brand_cmo_brief').select('headline, body').eq('organization_id', this.orgId).eq('scope', 'monitoreo').limit(1)
        .then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })),
    ]);

    const u = (s) => this._unwrap(s);
    // Merge de color + relevancia + rango sobre las filas del ranking (por entity_id).
    const topBlock = u(top);
    if (Array.isArray(topBlock.data)) {
      const rows = (entColors.status === 'fulfilled' && !entColors.value?.error) ? (entColors.value.data || []) : [];
      const metaById = new Map(rows.map((e) => [e.id, {
        color: (Array.isArray(e.color) && e.color[0]) ? e.color[0] : null,
        relevance: (typeof e.relevance === 'string' && e.relevance.trim()) ? e.relevance.trim() : null,
        rango: (e.metadata && typeof e.metadata.rango === 'string' && e.metadata.rango.trim()) ? e.metadata.rango.trim().toLowerCase() : null,
      }]));
      topBlock.data = topBlock.data.map((r) => {
        const m = metaById.get(r.entity_id) || {};
        return { ...r, color: m.color || null, relevance: m.relevance || null, rango: m.rango || null };
      });
    }

    // ── El campo de batalla es SOLO competidores ──────────────────────────
    // Este tab muestra rivales, nunca referentes. Los referentes (y aliados) se
    // monitorean para APRENDER, no para pintarlos como competencia: si se cuelan,
    // un referente como Nike aparece de "lider del nicho", "amenaza" o barra de
    // "Influencia digital" — falso. El RPC `top` devuelve todos los perfiles
    // monitoreados con su `tipo`; aqui filtramos a competidor_directo/indirecto
    // (excluimos referencia_cultural y aliado; conservamos tipo nulo/desconocido,
    // que por defecto es competidor). El unico bloque con `tipo` es `top`, asi que
    // derivamos de el los entity_id validos y recortamos el resto de bloques por id.
    let competitorIds = null;
    if (Array.isArray(topBlock.data)) {
      const isRival = (t) => t !== 'referencia_cultural' && t !== 'aliado';
      topBlock.data = topBlock.data.filter((r) => isRival(r.tipo));
      competitorIds = new Set(topBlock.data.map((r) => r.entity_id));
    }

    // ── "De qué habla" cada perfil: términos recurrentes extraídos del TEXTO de
    // sus posts (rules+math, sin LLM — topics/tone no están poblados para
    // competidores). Fetch acotado a los perfiles del ranking + la ventana.
    if (Array.isArray(topBlock.data) && topBlock.data.length) {
      const ids = topBlock.data.map((r) => r.entity_id).filter(Boolean);
      let posts = [];
      try {
        const { data } = await this.sb.from('brand_posts')
          .select('id,entity_id,content,engagement_total,hashtags,permalink,network,post_id,profile_handle')
          .in('entity_id', ids)
          .eq('is_competitor', true)
          .not('content', 'is', null)
          .gte('captured_at', from).lte('captured_at', to)
          .order('engagement_total', { ascending: false, nullsFirst: false })
          .limit(600);
        posts = Array.isArray(data) ? data : [];
      } catch (_) { /* señales de contenido son opcionales: si falla, no rompe el panel */ }
      // Sentimiento de los COMENTARIOS por post: permite cruzar el tema del copy con
      // la reaccion real de la audiencia (tema con engagement alto Y comentarios
      // positivos = "su audiencia se enfoca en X"). Ademas guardamos una MUESTRA del
      // texto de comentarios pos/neg por post -> el panel de Observaciones se expande
      // y muestra la PRUEBA (posts + comentarios que respaldan cada observacion). Acotado.
      const CMT_SAMPLE = 6; // comentarios guardados por post y por polaridad/señal
      // Señales de demanda que el ai-engine clasifica por comentario (audience_signal):
      // la audiencia del rival no se queja, PIDE (distribución) o DESEA (producto). Es
      // inteligencia de oportunidad, no negatividad.
      const OPP_SIGNALS = ['demanda_distribucion', 'peticion_producto', 'amor_marca'];
      const postComments = {};
      try {
        const postIds = posts.map((p) => p.id).filter(Boolean);
        if (postIds.length) {
          const { data: cmts } = await this.sb.from('brand_post_comments')
            .select('brand_post_id,sentiment,content,author_display_name,author_handle,audience_signal,audience_signal_cue')
            .in('brand_post_id', postIds)
            .not('sentiment', 'is', null)
            .limit(5000);
          for (const c of cmts || []) {
            const m = (postComments[c.brand_post_id] = postComments[c.brand_post_id] || { pos: 0, neg: 0, total: 0, sPos: [], sNeg: [], sigCount: {}, sig: {} });
            m.total += 1;
            const isPos = /^pos/i.test(c.sentiment), isNeg = /^neg/i.test(c.sentiment);
            if (isPos) m.pos += 1; else if (isNeg) m.neg += 1;
            const txt = String(c.content || '').trim();
            const author = c.author_display_name || c.author_handle || '';
            if (txt) {
              const bucket = isNeg ? m.sNeg : isPos ? m.sPos : null;
              if (bucket && bucket.length < CMT_SAMPLE) {
                bucket.push({ text: txt, author, sentiment: isNeg ? 'negative' : 'positive' });
              }
            }
            // Tally de la señal de demanda + muestra de comentarios que la respaldan.
            const sg = c.audience_signal;
            if (sg) {
              m.sigCount[sg] = (m.sigCount[sg] || 0) + 1;
              if (txt && OPP_SIGNALS.includes(sg)) {
                const b = (m.sig[sg] = m.sig[sg] || []);
                if (b.length < CMT_SAMPLE) b.push({ text: txt, author, sentiment: isNeg ? 'negative' : isPos ? 'positive' : 'neutral', cue: c.audience_signal_cue || null });
              }
            }
          }
        }
      } catch (_) { /* comentarios opcionales */ }
      const nameById = {};
      for (const r of topBlock.data) nameById[r.entity_id] = r.entity_name || '';
      const insightById = this._contentInsightsByEntity(posts, nameById, postComments);
      // Opinion del publico: insights derivados de los COMENTARIOS (RPC voice, ya
      // cargado) — sentimiento + emocion de su audiencia. Se fusionan con los de
      // contenido en una sola lista rankeada.
      const voiceRows = (voice.status === 'fulfilled' && !voice.value?.error) ? (voice.value.data || []) : [];
      const voiceById = new Map(voiceRows.map((v) => [v.entity_id, v]));
      // Posts por entidad (para la evidencia de las opiniones del RPC voice, que no
      // llevan tema): las publicaciones del perfil con comentarios de esa polaridad.
      const postsByEntity = {};
      for (const p of posts) { if (p.entity_id) (postsByEntity[p.entity_id] = postsByEntity[p.entity_id] || []).push(p); }
      const opinionEvidence = (eid, pol) => {
        const list = (postsByEntity[eid] || []).filter((p) => { const c = postComments[p.id]; return c && (pol === 'neg' ? c.sNeg.length : c.sPos.length); });
        if (!list.length) return null;
        const cnt = (p) => { const c = postComments[p.id]; return c ? (pol === 'neg' ? c.sNeg.length : c.sPos.length) : 0; };
        const top = list.slice().sort((a, b) => (cnt(b) - cnt(a)) || ((b.engagement_total || 0) - (a.engagement_total || 0))).slice(0, 5);
        const out = top.map((p) => {
          const c = postComments[p.id] || { sPos: [], sNeg: [], pos: 0, neg: 0, total: 0 };
          return { content: p.content, permalink: this._postUrl(p.network, p.post_id, p.profile_handle, p.permalink), network: p.network || null, engagement: Number(p.engagement_total) || 0, pos: c.pos || 0, neg: c.neg || 0, totalComments: c.total || 0, comments: (pol === 'neg' ? c.sNeg : c.sPos).slice(0, 3) };
        }).filter((p) => (p.content && p.content.trim()) || p.comments.length);
        return out.length ? { posts: out } : null;
      };
      // Evidencia de una señal de demanda: los posts cuyos comentarios la disparan.
      const signalEvidence = (eid, signal) => {
        const has = (p) => { const c = postComments[p.id]; return c && c.sig && (c.sig[signal] || []).length; };
        const list = (postsByEntity[eid] || []).filter(has);
        if (!list.length) return null;
        const cnt = (p) => { const c = postComments[p.id]; return (c && c.sig && c.sig[signal] || []).length; };
        const top = list.slice().sort((a, b) => (cnt(b) - cnt(a)) || ((b.engagement_total || 0) - (a.engagement_total || 0))).slice(0, 5);
        const out = top.map((p) => {
          const c = postComments[p.id];
          return { content: p.content, permalink: this._postUrl(p.network, p.post_id, p.profile_handle, p.permalink), network: p.network || null, engagement: Number(p.engagement_total) || 0, pos: c.pos || 0, neg: c.neg || 0, totalComments: c.total || 0, comments: (c.sig[signal] || []).slice(0, 3) };
        }).filter((p) => (p.content && p.content.trim()) || p.comments.length);
        return out.length ? { posts: out } : null;
      };
      // Insights de OPORTUNIDAD por entidad, agregando la señal de demanda de sus
      // comentarios: hueco de distribución, petición de producto, amor de marca. Es lo
      // que a la marca propia le conviene APRENDER de su competencia.
      const SIG_OF_KIND = { demand_gap: 'demanda_distribucion', product_request: 'peticion_producto', brand_love: 'amor_marca' };
      const demandInsights = (eid) => {
        const agg = {}; const cues = {};
        for (const p of (postsByEntity[eid] || [])) {
          const c = postComments[p.id]; if (!c || !c.sigCount) continue;
          for (const [k, v] of Object.entries(c.sigCount)) agg[k] = (agg[k] || 0) + v;
          for (const cm of (c.sig.peticion_producto || [])) if (cm.cue) cues[cm.cue] = (cues[cm.cue] || 0) + 1;
        }
        const out = [];
        if ((agg.demanda_distribucion || 0) >= 2) out.push({ kind: 'demand_gap', count: agg.demanda_distribucion, score: 70 });
        if ((agg.peticion_producto || 0) >= 2) {
          const cue = Object.entries(cues).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
          out.push({ kind: 'product_request', count: agg.peticion_producto, cue, score: 68 });
        }
        if ((agg.amor_marca || 0) >= 3) out.push({ kind: 'brand_love', count: agg.amor_marca, score: 55 });
        for (const s of out) { const ev = signalEvidence(eid, SIG_OF_KIND[s.kind]); if (ev) s.evidence = ev; }
        return out;
      };
      topBlock.data = topBlock.data.map((r) => {
        const content = (insightById[r.entity_id] || {}).insights || [];
        const opinion = this._voiceInsights(voiceById.get(r.entity_id));
        for (const s of opinion) {
          const pol = s.kind === 'opinion_neg' ? 'neg' : s.kind === 'opinion_pos' ? 'pos' : null;
          if (pol) { const ev = opinionEvidence(r.entity_id, pol); if (ev) s.evidence = ev; }
        }
        const demand = demandInsights(r.entity_id);
        return { ...r, insights: [...content, ...opinion, ...demand].sort((a, b) => b.score - a.score) };
      });
    }
    // Recorta un bloque a los perfiles competidores (por entity_id). Se aplica a
    // los bloques que llevan una fila por perfil (voice/risk/share-of-voice): sin
    // esto, la card "Vulnerabilidad rival" o "Amenaza" podria nombrar a un referente.
    const scopeToRivals = (block) => {
      if (competitorIds && block && Array.isArray(block.data)) {
        block.data = block.data.filter((r) => competitorIds.has(r.entity_id));
        block.isEmpty = block.data.length === 0;
      }
      return block;
    };

    return {
      window: { from, to },
      kpis:  u(kpis),
      top:   topBlock,
      risk:  scopeToRivals(u(risk)),
      voice: scopeToRivals(u(voice)),
      intelligence: u(intel),
      benchmark:    u(bench),
      shareOfVoice: scopeToRivals(u(sov)),
      kpisPrev:     u(kpisPrev),
      monitoreoTones:  u(monTones),
      monitoreoTopics: u(monTopics),
      cmoBrief:        u(cmoBrief),
    };
  }

  /** URL publica de un post. Los competidores NO guardan `permalink` (0% cobertura),
      pero si `post_id` (100%) + red + handle. La reconstruimos por red:
      - instagram: el post_id es el media pk numerico -> shortcode base64 -> /p/{sc}/
        (verificado: pk 3939816185620865274 -> /p/DatCfJgRCD6/ = post real de @nike).
      - tiktok/x/youtube/facebook: el post_id se usa directo en el patron de la red.
      Devuelve null si no hay como armarla (la vista oculta el icono). */
  _postUrl(net, postId, handle, permalink) {
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
  }

  /** Inteligencia de contenido por entidad desde el TEXTO de sus posts (rules+math,
      sin LLM). Corre una LIBRERIA de detectores estrategicos y devuelve por entidad
      `insights` = lista RANKEADA de señales {kind, score, ...params} (la vista traduce).
      Distintos perfiles disparan distintos detectores -> el panel varia. Detectores:
        - winner:  el tema que DISPARA su engagement (lift = avg con-tema / avg gral, >=2x).
        - focus:   concentracion tematica (un tema en >=50% de sus posts).
        - viral:   1 post concentra >=45% de su engagement. even: reparto parejo.
        - hashtag: hashtag firma (>=45% de sus posts). terms: temas recurrentes (fallback).
      CALIDAD de terminos: unigramas + BIGRAMAS (frases, mas especificas); filtro de
      DISTINTIVIDAD (descarta terminos usados por >=40% de los perfiles = genericos tipo
      "disponible"/"nuevo"), stopwords ES/EN ampliadas, urls/mentions, palabras <4 letras
      y el nombre propio de la marca. */
  _contentInsightsByEntity(posts, nameById = {}, postComments = {}) {
    const STOP = this._stopwords();
    const ownTokens = this._ownNameTokens(nameById);
    const byEntity = {};
    const termEntities = {}; // termino -> Set de entidades que lo usan (distintividad)
    for (const p of posts || []) {
      const eid = p.entity_id; if (!eid) continue;
      const own = ownTokens[eid] || new Set();
      const { terms, tags } = this._postTerms(p, own, STOP);
      const e = (byEntity[eid] = byEntity[eid] || { df: {}, eng: {}, tagDf: {}, cpos: {}, cneg: {}, ccnt: {}, n: 0, engTotal: 0, engList: [], maxEng: -1, maxTerms: null, posts: [] });
      const eng = Number(p.engagement_total) || 0;
      // Guardamos el post (con su set de terminos) para poder armar la EVIDENCIA de
      // cada observacion: que publicaciones la respaldan y con que comentarios.
      e.posts.push({ id: p.id, content: p.content, url: this._postUrl(p.network, p.post_id, p.profile_handle, p.permalink), network: p.network || null, eng, terms });
      // Sentimiento de los comentarios de ESTE post (si tiene suficientes).
      const cs = postComments[p.id];
      const hasC = cs && cs.total >= 3;
      const cpr = hasC ? cs.pos / cs.total : 0;
      const cnr = hasC ? cs.neg / cs.total : 0;
      e.n += 1; e.engTotal += eng; e.engList.push(eng);
      if (eng > e.maxEng) { e.maxEng = eng; e.maxTerms = terms; } // post top -> tema del viral
      for (const t of terms) {
        e.df[t] = (e.df[t] || 0) + 1; e.eng[t] = (e.eng[t] || 0) + eng;
        (termEntities[t] = termEntities[t] || new Set()).add(eid);
        if (hasC) { e.cpos[t] = (e.cpos[t] || 0) + cpr; e.cneg[t] = (e.cneg[t] || 0) + cnr; e.ccnt[t] = (e.ccnt[t] || 0) + 1; }
      }
      for (const t of tags) e.tagDf[t] = (e.tagDf[t] || 0) + 1;
    }
    // Un termino es GENERICO (no distintivo) si lo usan muchos perfiles.
    const numEntities = Object.keys(byEntity).length;
    const genericMin = Math.max(3, Math.ceil(numEntities * 0.4));
    const distinctive = (t) => (termEntities[t]?.size || 1) < genericMin;
    const isBigram = (t) => t.includes(' ');
    // Ranking de un termino para "terms"/"focus": frecuencia en la entidad, con boost
    // a bigramas (mas especificos) y a lo distintivo (poco compartido).
    const rankScore = (t, df) => df * (isBigram(t) ? 1.8 : 1) * (2 / (termEntities[t]?.size || 1));

    const out = {};
    for (const [eid, e] of Object.entries(byEntity)) {
      const n = e.n; if (!n) { out[eid] = { insights: [] }; continue; }
      const baseAvg = e.engTotal / n;
      const ins = [];
      // Candidatos = terminos distintivos con soporte (df>=2), rankeados.
      const cands = Object.entries(e.df).filter(([t, df]) => df >= 2 && distinctive(t))
        .sort((a, b) => rankScore(b[0], b[1]) - rankScore(a[0], a[1]));
      // Tema que dispara engagement (soporte >=3, lift>=2.0, distintivo). Si ADEMAS
      // sus posts tienen comentarios positivos -> "su audiencia se enfoca en X" (cruce
      // copy x reaccion x engagement, la señal mas fuerte). Si no, solo "le rinde".
      if (baseAvg > 0) {
        let best = null;
        for (const [t, df] of cands) { if (df < 3) continue; const lift = (e.eng[t] / df) / baseAvg; if (lift >= 2.0 && (!best || lift > best.lift)) best = { term: t, lift: Math.round(lift * 10) / 10 }; }
        if (best) {
          const cc = e.ccnt[best.term] || 0;
          const cp = cc ? e.cpos[best.term] / cc : null;
          if (cc >= 2 && cp != null && cp >= 0.45) ins.push({ kind: 'audience_focus', term: best.term, lift: best.lift, pct: Math.round(cp * 100), score: Math.min(97, 52 + (best.lift - 2) * 10) });
          else ins.push({ kind: 'winner', term: best.term, lift: best.lift, score: Math.min(96, 40 + (best.lift - 2) * 12) });
        }
      }
      // focus — concentracion tematica (el tema mas repetido, distintivo).
      if (n >= 5 && cands.length) {
        const [t, df] = cands.reduce((m, c) => (c[1] > m[1] ? c : m), cands[0]);
        const pct = Math.round(df / n * 100);
        if (pct >= 50) ins.push({ kind: 'focus', term: t, pct, score: pct });
      }
      // audience_reject — el TEMA al que su audiencia reacciona negativo (explica el
      // "por que", no solo el %). Tema con mayor negatividad de comentarios (>=2 posts).
      {
        let rej = null;
        for (const [t, cc] of Object.entries(e.ccnt)) {
          if (cc < 2 || !distinctive(t)) continue;
          const nr = (e.cneg[t] || 0) / cc;
          if (nr >= 0.25 && (!rej || nr > rej.nr)) rej = { term: t, nr };
        }
        if (rej) ins.push({ kind: 'audience_reject', term: rej.term, pct: Math.round(rej.nr * 100), score: 64 + Math.min(28, Math.round(rej.nr * 100)) });
      }
      // viral vs even — distribucion del engagement. El viral se ATA a su tema (de que
      // era el post que exploto), para explicar y no solo dar el %.
      if (n >= 5 && e.engTotal > 0) {
        const share = Math.round(Math.max(...e.engList) / e.engTotal * 100);
        if (share >= 45) {
          let vt = null;
          for (const t of e.maxTerms || []) { if (distinctive(t) && (!vt || rankScore(t, e.df[t] || 1) > rankScore(vt, e.df[vt] || 1))) vt = t; }
          // Con tema (causal) mantiene su score alto; sin tema es "numero pelado" -> capado.
          ins.push({ kind: 'viral', pct: share, term: vt, score: vt ? share : Math.min(share, 44) });
        } else if (share <= Math.ceil(100 / n) + 6) ins.push({ kind: 'even', score: 44 });
      }
      // hashtag firma.
      const topTag = Object.entries(e.tagDf).filter(([t]) => distinctive(t)).sort((a, b) => b[1] - a[1])[0];
      if (topTag && n >= 4) { const pct = Math.round(topTag[1] / n * 100); if (pct >= 45) ins.push({ kind: 'hashtag', tag: topTag[0], pct, score: pct - 3 }); }
      // terms — hasta 3 temas recurrentes DISTINTOS (dedup: no repetir una palabra
      // ya usada por otro termino, para no mostrar "goats goodbye" + "goats").
      const terms = [];
      for (const [t] of cands) {
        if (terms.length >= 3) break;
        const words = t.split(' ');
        const dup = terms.some((x) => { const xw = x.split(' '); return words.some((w) => xw.includes(w)); });
        if (!dup) terms.push(t);
      }
      if (terms.length) ins.push({ kind: 'terms', terms, score: 12 });
      ins.sort((a, b) => b.score - a.score);
      // EVIDENCIA por señal: los posts (y sus comentarios) que la respaldan. Permite
      // que el panel se expanda y muestre el "por que" — que publicaciones detecto el
      // sistema y como reacciono la audiencia. Polaridad: rechazo/opinion_neg -> comentarios
      // negativos; enfoque/respaldo -> positivos; el resto -> mezcla.
      const polarityOf = (k) =>
        (k === 'audience_reject' || k === 'opinion_neg') ? 'neg'
        : (k === 'audience_focus' || k === 'opinion_pos') ? 'pos' : null;
      const evidenceFor = (s) => {
        const term = s.term || s.tag || (Array.isArray(s.terms) && s.terms[0]) || null;
        const pol = polarityOf(s.kind);
        let ps = e.posts;
        if (term) ps = ps.filter((p) => p.terms && p.terms.has(term));
        else if (pol) ps = ps.filter((p) => { const c = postComments[p.id]; return c && (pol === 'neg' ? c.sNeg.length : c.sPos.length); });
        else return null;
        if (!ps.length) return null;
        const polCount = (p) => { const c = postComments[p.id]; if (!c) return 0; return pol === 'neg' ? c.sNeg.length : pol === 'pos' ? c.sPos.length : (c.sNeg.length + c.sPos.length); };
        ps = ps.slice().sort((a, b) => (polCount(b) - polCount(a)) || (b.eng - a.eng)).slice(0, 5);
        const posts = ps.map((p) => {
          const c = postComments[p.id] || { sPos: [], sNeg: [], pos: 0, neg: 0, total: 0 };
          const cm = pol === 'neg' ? c.sNeg : pol === 'pos' ? c.sPos : [...c.sNeg, ...c.sPos];
          return {
            content: p.content, permalink: p.url, network: p.network, engagement: p.eng,
            pos: c.pos || 0, neg: c.neg || 0, totalComments: c.total || 0,
            comments: cm.slice(0, 3),
          };
        }).filter((p) => (p.content && p.content.trim()) || p.comments.length);
        return posts.length ? { posts } : null;
      };
      for (const s of ins) { const ev = evidenceFor(s); if (ev) s.evidence = ev; }
      out[eid] = { insights: ins };
    }
    return out;
  }

  /** Opinion del publico = insights desde los COMENTARIOS de su audiencia (RPC
      dashboard_competencia_audience_voice). Detecta reception fuerte (audiencia
      molesta = oportunidad, o audiencia entregada) + emocion dominante. Exige >=10
      comentarios (evita ruido de muestras chicas). */
  _voiceInsights(v) {
    if (!v) return [];
    const total = Number(v.total_comments) || 0;
    if (total < 10) return [];
    const pos = Math.round(Number(v.pos_ratio || 0) * 100);
    const neg = Math.round(Number(v.neg_ratio || 0) * 100);
    const emoRaw = String(v.top_neg_emotion || '').toLowerCase();
    const emo = ['others', 'neutral', ''].includes(emoRaw) ? null : emoRaw;
    // Con mucho comentario neutral, pos/neg absolutos son ~15-55%. Umbrales:
    // negativo notable >=20%; positivo notable si >=50% Y domina 2.5x al negativo.
    const out = [];
    // Score BAJO a proposito (~40-46): "numero pelado" SIN causa -> debe quedar por
    // debajo de las señales causales/contenido (que dicen A QUE / DE QUE) y solo
    // ganarle al fallback "habla de". El causal audience_reject (con tema) las supera.
    if (neg >= 20) out.push({ kind: 'opinion_neg', pct: neg, emotion: emo, score: 40 + Math.min(6, neg - 20) });
    else if (pos >= 50 && pos >= neg * 2.5) out.push({ kind: 'opinion_pos', pct: pos, score: 42 });
    return out;
  }

  /** Extrae de un post: unigramas (>=4 letras, no stopword/nombre-propio) + BIGRAMAS
      (dos unigramas validos consecutivos, p.ej. "energy drink") + hashtags. */
  _postTerms(p, own, STOP) {
    const text = String(p.content || '').toLowerCase();
    const terms = new Set(), tags = new Set();
    for (const m of text.match(/#([\p{L}\p{N}_]{3,})/gu) || []) { const t = m.slice(1).replace(/_/g, ''); if (!own.has(t)) { terms.add(t); tags.add(t); } }
    for (const h of Array.isArray(p.hashtags) ? p.hashtags : []) { const t = String(h).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (t.length >= 3 && !own.has(t)) { terms.add(t); tags.add(t); } }
    const cleaned = text.replace(/https?:\/\/\S+/g, ' ').replace(/[@#][\p{L}\p{N}_]+/gu, ' ');
    let prev = null;
    for (const w of cleaned.match(/[\p{L}]{4,}/gu) || []) {
      const t = w.toLowerCase();
      const ok = !STOP.has(t) && !own.has(t);
      if (ok) { terms.add(t); if (prev) terms.add(prev + ' ' + t); }
      prev = ok ? t : null;
    }
    return { terms, tags };
  }

  _ownNameTokens(nameById) {
    const ownTokens = {};
    for (const [eid, name] of Object.entries(nameById)) {
      const set = new Set();
      const clean = String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ');
      for (const w of clean.match(/[\p{L}]{3,}/gu) || []) set.add(w);
      set.add(clean.replace(/[^\p{L}\p{N}]/gu, ''));
      ownTokens[eid] = set;
    }
    return ownTokens;
  }

  _stopwords() {
    return new Set(('para como este esta esto pero porque tambien cuando donde desde sobre todo toda todos todas mucho mucha muchos muchas hasta entre antes cada solo segun estos estas esos esas otros otras otro otra mientras nuestro nuestra nuestros nuestras tiene tienen hacer hacen sido estan estar sera seran mas menos aqui alla ellos ellas quien quienes cual cuales nada algo muy sin con los las del una uno unos unas ' +
      // genericos ES que se colaban como falsos "temas"
      'finaliza finalizar disponible disponibles nuevo nueva nuevos nuevas gracias ahora mundo mejor mejores gran grande super siempre nunca cosa cosas gente vida dias parte forma tanto quiero quieres puedes puede pueden tienes hacer hecho vamos estamos somos tener decir dice viene sigue siguiente luego entonces mismo misma propio cualquier alguna algun general ademas aunque tener queremos hola bien aqui alli asi cada vez ver aca dale ganas quien fecha hora fotos todos manera parte sabes sabemos hacemos vamos vayan sean mira mirar ' +
      // genericos EN
      'this that with from have your they what when will would about which there their because just like more been were them then does youre dont into over only your ' +
      'watch first tonight team pick come want know love best good great make made time today week live full right going gonna cant wont need feel look thing things everyone everything people really still back down here where while also even much many some most very well through around every check follow link click swipe drop tag tags share comment comments ' +
      // letra chica de sorteos/giveaways (aparecia como falso "tema")
      'purchase necessary void prohibited sweepstakes eligible winner winners entry giveaway official rules odds sponsor enter selected residents apply restrictions ' +
      'http https www com net link bio post posts reel reels story stories nan null undefined video foto photo').split(/\s+/).filter(Boolean));
  }

  /** Drill-down: posts de UN rival (on-demand, no cacheado). */
  async loadActorPosts(entityId, from, to, limit = 30) {
    if (!this.sb || !this.orgId || !entityId) return [];
    const { data, error } = await this.sb.rpc('dashboard_competencia_actor_posts', {
      p_org_id: this.orgId, p_entity_id: entityId,
      p_date_from: from, p_date_to: to, p_limit: limit, p_offset: 0, p_order_by: 'engagement',
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  /**
   * Drill-down de perfil de UN rival (FEAT-037 Fase 2 #4): actividad por periodo,
   * distribuciones de su contenido y sus mejores horas. On-demand, no cacheado.
   * Cada RPC falla de forma aislada (Promise.allSettled) → el drawer degrada por
   * seccion en vez de romperse entero.
   */
  async loadActorProfile(entityId, from, to) {
    if (!this.sb || !this.orgId || !entityId) return null;
    const org = this.orgId, ids = [entityId];
    const [act, dist, hours] = await Promise.allSettled([
      this.sb.rpc('dashboard_competencia_activity_history', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: ids }),
      this.sb.rpc('dashboard_competencia_distributions',    { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: ids }),
      this.sb.rpc('dashboard_competencia_posting_hours',    { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: ids }),
    ]);
    const val = (s) => (s.status === 'fulfilled' && !s.value?.error) ? s.value.data : null;
    return {
      activity:      Array.isArray(val(act))   ? val(act)   : [],
      distributions: val(dist) || null,
      postingHours:  Array.isArray(val(hours)) ? val(hours) : [],
    };
  }
}

window.CompetenciaDataService = CompetenciaDataService;
