/**
 * MiBrandaDataService — Capa de datos del Dashboard Mi Marca
 *
 * Consulta todas las tablas de Supabase necesarias para los 20 widgets
 * del dashboard, agregando datos de TODOS los brand_containers de la org.
 * Cada método devuelve { data, isEmpty, error } para manejo graceful.
 *
 * Spec: dashboard_mi_marca_spec.docx · ARDE Agency S.A.S.
 */
class MiBrandaDataService {
  constructor() {
    this.sb          = null;   // Supabase client
    this.orgId       = null;   // organization_id activa
    this.containerIds = [];    // IDs de brand_containers de la org
    this.containers   = [];    // Objetos completos de brand_containers
    this._cache       = {};    // Cache en-sesión keyed por method name
  }

  /* ── Inicialización ──────────────────────────────────────── */
  async init(supabase, orgId) {
    this.sb    = supabase;
    this.orgId = orgId;
    this._cache = {};

    const { data, error } = await this.sb
      .from('brand_containers')
      .select('id, nombre_marca, verbal_dna, palabras_clave, palabras_prohibidas, arquetipo, propuesta_valor')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[MiBrandaDataService] No se pudieron cargar brand_containers:', error.message);
      this.containerIds = [];
      this.containers   = [];
    } else {
      this.containers   = data || [];
      this.containerIds = this.containers.map(c => c.id);
    }
    return this;
  }

  /** Utilidad: resultado vacío estandarizado */
  _empty(data = null) {
    return { data, isEmpty: true, error: null };
  }
  _ok(data) {
    return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null };
  }
  _err(error) {
    return { data: null, isEmpty: true, error };
  }

  /** Si no hay containers, todos los widgets quedan vacíos */
  _noContainers() {
    return !this.sb || !this.orgId || this.containerIds.length === 0;
  }

  /* ══════════════════════════════════════════════════════════
     CARGA TOTAL — Promise.allSettled para máxima resiliencia
  ══════════════════════════════════════════════════════════ */
  async loadAll() {
    const [
      kpis, ritmo, heatmap, formatos, fatiga,
      pilares, soulGuard, semantica, destacado,
      mapMonitor, stock, ofertas, crecimiento,
      sentimiento, shadowMentions, influencia, claridad,
      blindSpots, fuga, crisis, swot,
      missions,
    ] = await Promise.allSettled([
      this.loadKPIs(),
      this.loadRitmoPublicacion(),
      this.loadHeatmap(),
      this.loadFormatos(),
      this.loadFatigaCurve(),
      this.loadPilares(),
      this.loadBrandSoulGuard(),
      this.loadSemantica(),
      this.loadDestacado(),
      this.loadMAPMonitor(),
      this.loadStockDigital(),
      this.loadOfertas(),
      this.loadCrecimientoKPIs(),
      this.loadSentimientoBiometrico(),
      this.loadShadowMentions(),
      this.loadInfluencia(),
      this.loadClaridad(),
      this.loadBlindSpots(),
      this.loadFugaAudiencia(),
      this.loadCrisisDetection(),
      this.loadSWOT(),
      this.loadBodyMissions(),
    ]);

    const unwrap = (settled) => settled.status === 'fulfilled'
      ? settled.value
      : this._err(settled.reason);

    return {
      kpis:           unwrap(kpis),
      ritmo:          unwrap(ritmo),
      heatmap:        unwrap(heatmap),
      formatos:       unwrap(formatos),
      fatiga:         unwrap(fatiga),
      pilares:        unwrap(pilares),
      soulGuard:      unwrap(soulGuard),
      semantica:      unwrap(semantica),
      destacado:      unwrap(destacado),
      mapMonitor:     unwrap(mapMonitor),
      stock:          unwrap(stock),
      ofertas:        unwrap(ofertas),
      crecimiento:    unwrap(crecimiento),
      sentimiento:    unwrap(sentimiento),
      shadowMentions: unwrap(shadowMentions),
      influencia:     unwrap(influencia),
      claridad:       unwrap(claridad),
      blindSpots:     unwrap(blindSpots),
      fuga:           unwrap(fuga),
      crisis:         unwrap(crisis),
      swot:           unwrap(swot),
      missions:       unwrap(missions),
      containers:     this.containers,
    };
  }

  /* ══════════════════════════════════════════════════════════
     KPIs — Strip superior del dashboard
  ══════════════════════════════════════════════════════════ */
  async loadKPIs() {
    if (this._noContainers()) return this._empty({ posts7d: 0, engagementRate: null, sentimentScore: null, mapCompliance: null, crisisOpen: 0, mentions24h: 0 });
    const ids = this.containerIds;
    const now  = new Date();
    const d7   = new Date(now - 7  * 86400000).toISOString();
    const d1   = new Date(now - 1  * 86400000).toISOString();

    const [postsR, sentR, mapR, crisisR, mentionsR] = await Promise.allSettled([
      // Posts propios últimos 7 días
      this.sb.from('brand_posts')
        .select('id', { count: 'exact', head: true })
        .in('brand_container_id', ids)
        .eq('post_source', 'own')
        .eq('is_competitor', false)
        .gte('captured_at', d7),
      // Score de coherencia de tono promedio
      this.sb.from('brand_content_analysis')
        .select('tone_coherence_score, clarity_score')
        .in('brand_container_id', ids),
      // MAP compliance: precios vs MAP
      this.sb.from('retail_prices')
        .select('price, sku, retailer, captured_at')
        .eq('organization_id', this.orgId)
        .order('captured_at', { ascending: false })
        .limit(200),
      // Crisis abiertas
      this.sb.from('brand_vulnerabilities')
        .select('id, severity', { count: 'exact' })
        .eq('organization_id', this.orgId)
        .in('status', ['open', 'in_progress']),
      // Menciones 24h
      this.sb.from('intelligence_signals')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.orgId)
        .eq('signal_type', 'mention')
        .gte('captured_at', d1),
    ]);

    const posts7d     = postsR.status === 'fulfilled'    ? (postsR.value.count    || 0) : 0;
    const analyses    = sentR.status  === 'fulfilled'    ? (sentR.value.data      || []) : [];
    const prices      = mapR.status   === 'fulfilled'    ? (mapR.value.data       || []) : [];
    const crisisRows  = crisisR.status === 'fulfilled'   ? (crisisR.value.data    || []) : [];
    const mentions24h = mentionsR.status === 'fulfilled' ? (mentionsR.value.count || 0) : 0;

    // Engagement rate: promedio de tone_coherence como proxy (0-100)
    const sentimentScore = analyses.length
      ? Math.round(analyses.reduce((s, r) => s + (r.tone_coherence_score || 0), 0) / analyses.length)
      : null;

    // MAP compliance: % precios que están OK (necesita entity MAP price — simplificado)
    const mapCompliance = prices.length > 0 ? null : null; // Se calcula en loadMAPMonitor

    // Crisis index: severity-weighted
    const crisisOpen = crisisRows.filter(r => r.status !== 'resolved').length;

    return this._ok({
      posts7d, sentimentScore, mapCompliance, crisisOpen, mentions24h,
      brandCount: this.containers.length,
    });
  }

  /* ══════════════════════════════════════════════════════════
     DIM A · OPERATIVIDAD Y PULSO
  ══════════════════════════════════════════════════════════ */

  /** Widget 1 — Ritmo de publicación: posts por día 30d + latencia */
  async loadRitmoPublicacion() {
    if (this._noContainers()) return this._empty([]);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await this.sb
      .from('brand_posts')
      .select('captured_at, network, post_source')
      .in('brand_container_id', this.containerIds)
      .eq('post_source', 'own')
      .eq('is_competitor', false)
      .gte('captured_at', since)
      .order('captured_at', { ascending: true });
    if (error) return this._err(error);

    // Agrupar por día
    const byDay = {};
    (data || []).forEach(p => {
      const day = p.captured_at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });

    // Rellenar días sin posts
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, label: `${d.getDate()}/${d.getMonth()+1}`, count: byDay[key] || 0 });
    }
    return this._ok(days);
  }

  /** Widget 2 — Mapa de calor horario */
  async loadHeatmap() {
    if (this._noContainers()) return this._empty(null);
    const { data, error } = await this.sb
      .from('brand_audience_heatmap')
      .select('platform, hour_engagement, day_engagement, best_hour, best_day, computed_at')
      .in('brand_container_id', this.containerIds)
      .order('computed_at', { ascending: false });
    if (error) return this._err(error);
    if (!data || data.length === 0) return this._empty(null);

    // Consolidar: merge hour_engagement sumando por hora
    const merged = { hour: {}, day: {}, bestHour: null, bestDay: null };
    data.forEach(row => {
      const hMap = row.hour_engagement || {};
      const dMap = row.day_engagement  || {};
      Object.entries(hMap).forEach(([h, v]) => { merged.hour[h] = (merged.hour[h] || 0) + v; });
      Object.entries(dMap).forEach(([d, v]) => { merged.day[d]  = (merged.day[d]  || 0) + v; });
      if (row.best_hour != null && merged.bestHour == null) merged.bestHour = row.best_hour;
      if (row.best_day  != null && merged.bestDay  == null) merged.bestDay  = row.best_day;
    });
    return this._ok(merged);
  }

  /** Widget 3 — Formatos dominantes */
  async loadFormatos() {
    if (this._noContainers()) return this._empty([]);
    const { data, error } = await this.sb
      .from('brand_posts')
      .select('media_assets, metrics')
      .in('brand_container_id', this.containerIds)
      .eq('post_source', 'own')
      .eq('is_competitor', false)
      .not('media_assets', 'is', null);
    if (error) return this._err(error);

    const counts = {};
    const reach  = {};
    (data || []).forEach(p => {
      const assets = Array.isArray(p.media_assets) ? p.media_assets : [];
      const type   = (assets[0]?.type || assets[0]?.media_type || 'imagen').toLowerCase();
      const label  = this._normalizeFormat(type);
      counts[label] = (counts[label] || 0) + 1;
      reach[label]  = (reach[label]  || 0) + (p.metrics?.reach || 0);
    });

    const result = Object.keys(counts).map(label => ({
      label, count: counts[label],
      reach: reach[label] || 0,
      pct: 0, // se calcula abajo
    }));
    const total = result.reduce((s, r) => s + r.count, 0);
    result.forEach(r => { r.pct = total > 0 ? Math.round(r.count / total * 100) : 0; });
    result.sort((a, b) => b.count - a.count);
    return this._ok(result);
  }

  _normalizeFormat(type) {
    if (type.includes('video') || type.includes('reel')) return 'Reel / Video';
    if (type.includes('carousel') || type.includes('carrusel')) return 'Carrusel';
    if (type.includes('image') || type.includes('imagen') || type.includes('photo')) return 'Imagen';
    if (type.includes('story')) return 'Story';
    if (type.includes('text') || type.includes('texto')) return 'Texto';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  /** Widget 4 — Curva de fatiga de contenido */
  async loadFatigaCurve() {
    if (this._noContainers()) return this._empty([]);
    const { data, error } = await this.sb
      .from('brand_content_analysis')
      .select('brand_post_id, fatigue_risk, tone_coherence_score, analyzed_at')
      .in('brand_container_id', this.containerIds)
      .order('analyzed_at', { ascending: true })
      .limit(90);
    if (error) return this._err(error);
    return this._ok(data || []);
  }

  /* ══════════════════════════════════════════════════════════
     DIM B · IDENTIDAD Y NARRATIVA
  ══════════════════════════════════════════════════════════ */

  /** Widget 5 — Pilares narrativos */
  async loadPilares() {
    if (this._noContainers()) return this._empty([]);
    const { data, error } = await this.sb
      .from('brand_narrative_pillars')
      .select('pillar_name, pillar_type, post_count, avg_engagement, avg_reach, last_post_at, brand_container_id')
      .in('brand_container_id', this.containerIds)
      .order('post_count', { ascending: false });
    if (error) return this._err(error);

    // Consolidar pilares con mismo nombre entre brands
    const merged = {};
    (data || []).forEach(p => {
      const key = p.pillar_name;
      if (!merged[key]) {
        merged[key] = { ...p };
      } else {
        merged[key].post_count      += p.post_count || 0;
        merged[key].avg_engagement   = ((merged[key].avg_engagement || 0) + (p.avg_engagement || 0)) / 2;
        merged[key].avg_reach        = ((merged[key].avg_reach || 0) + (p.avg_reach || 0)) / 2;
        if (!merged[key].last_post_at || p.last_post_at > merged[key].last_post_at) {
          merged[key].last_post_at = p.last_post_at;
        }
      }
    });
    return this._ok(Object.values(merged).sort((a, b) => (b.post_count || 0) - (a.post_count || 0)));
  }

  /** Widget 6 — Brand Soul Guard: coherencia de tono */
  async loadBrandSoulGuard() {
    if (this._noContainers()) return this._empty(null);
    const { data, error } = await this.sb
      .from('brand_content_analysis')
      .select('tone_detected, tone_coherence_score, dominant_emotion, analyzed_at')
      .in('brand_container_id', this.containerIds)
      .order('analyzed_at', { ascending: false })
      .limit(100);
    if (error) return this._err(error);
    if (!data || data.length === 0) return this._empty(null);

    // Agrupar tono
    const toneCounts = {};
    let totalScore = 0;
    data.forEach(r => {
      const t = r.tone_detected || 'Indefinido';
      toneCounts[t] = (toneCounts[t] || 0) + 1;
      totalScore += (r.tone_coherence_score || 0);
    });
    const coherenceAvg = Math.round(totalScore / data.length);

    const tones = Object.entries(toneCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, pct: Math.round(count / data.length * 100) }));

    // Verbal DNA del primer container para tono base
    const tonoBase = this.containers[0]?.verbal_dna?.tono_base || null;

    return this._ok({ coherenceAvg, tones, tonoBase, totalAnalyzed: data.length });
  }

  /** Widget 7 — Semántica de impacto */
  async loadSemantica() {
    if (this._noContainers()) return this._empty([]);

    // Palabras clave de brand_containers
    const palabras = [];
    this.containers.forEach(c => {
      (c.palabras_clave || []).forEach(w => palabras.push(w));
    });

    // why_it_worked keywords de content analysis
    const { data, error } = await this.sb
      .from('brand_content_analysis')
      .select('why_it_worked, clarity_score')
      .in('brand_container_id', this.containerIds)
      .not('why_it_worked', 'eq', '{}')
      .limit(50);
    if (error && !palabras.length) return this._err(error);

    const keywords = {};
    palabras.forEach(w => { if (w) keywords[w.toLowerCase()] = (keywords[w.toLowerCase()] || 0) + 3; });
    (data || []).forEach(r => {
      const wiw = r.why_it_worked || {};
      (wiw.keywords || wiw.words || wiw.top_words || []).forEach(w => {
        if (typeof w === 'string') keywords[w.toLowerCase()] = (keywords[w.toLowerCase()] || 0) + 1;
        else if (w?.word) keywords[w.word.toLowerCase()] = (keywords[w.word.toLowerCase()] || 0) + (w.weight || 1);
      });
    });

    const result = Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, weight]) => ({ word, weight }));

    return this._ok(result);
  }

  /** Widget 8 — Análisis de destacados */
  async loadDestacado() {
    if (this._noContainers()) return this._empty(null);
    const { data, error } = await this.sb
      .from('brand_posts')
      .select('id, content, media_assets, metrics, captured_at, network, brand_container_id')
      .in('brand_container_id', this.containerIds)
      .eq('post_source', 'own')
      .eq('is_competitor', false)
      .order('captured_at', { ascending: false })
      .limit(100);
    if (error) return this._err(error);
    if (!data || data.length === 0) return this._empty(null);

    // El post con mayor reach
    const top = data.reduce((best, p) => {
      const r = p.metrics?.reach || p.metrics?.impressions || 0;
      return r > (best.metrics?.reach || best.metrics?.impressions || 0) ? p : best;
    }, data[0]);

    // Análisis asociado
    const { data: analysis } = await this.sb
      .from('brand_content_analysis')
      .select('why_it_worked, clarity_score, tone_detected, dominant_emotion')
      .eq('brand_post_id', top.id)
      .maybeSingle();

    return this._ok({ post: top, analysis: analysis || null });
  }

  /* ══════════════════════════════════════════════════════════
     DIM C · COMERCIAL Y DISTRIBUCIÓN
  ══════════════════════════════════════════════════════════ */

  /** Widget 9 — MAP Monitor */
  async loadMAPMonitor() {
    const { data: prices, error } = await this.sb
      .from('retail_prices')
      .select('retailer, sku, price, currency, promo_label, stock_status, captured_at, entity_id')
      .eq('organization_id', this.orgId)
      .order('captured_at', { ascending: false })
      .limit(300);
    if (error) return this._err(error);

    // Entities para obtener MAP (precio base)
    const { data: entities } = await this.sb
      .from('brand_entities')
      .select('id, name, price')
      .eq('organization_id', this.orgId)
      .not('price', 'is', null);

    const mapByEntity = {};
    (entities || []).forEach(e => { mapByEntity[e.id] = { name: e.name, map: e.price }; });

    // Latest price per (retailer, sku)
    const latest = {};
    (prices || []).forEach(p => {
      const key = `${p.retailer}|${p.sku}`;
      if (!latest[key]) latest[key] = p;
    });

    const rows = Object.values(latest).map(p => {
      const entity = mapByEntity[p.entity_id];
      const mapPrice = entity?.map || null;
      const delta = mapPrice ? p.price - mapPrice : null;
      let status = 'ok';
      if (delta !== null) {
        if (delta < 0) status = 'alert';
        else if (delta > mapPrice * 0.05) status = 'warning';
      }
      return {
        retailer: p.retailer, sku: p.sku,
        product: entity?.name || p.sku,
        price: p.price, currency: p.currency || 'MXN',
        map: mapPrice, delta, status,
        promo: p.promo_label, stock: p.stock_status,
        capturedAt: p.captured_at,
      };
    });
    return this._ok(rows);
  }

  /** Widget 10 — Stock Digital */
  async loadStockDigital() {
    const { data, error } = await this.sb
      .from('retail_prices')
      .select('retailer, sku, stock_status, captured_at, entity_id')
      .eq('organization_id', this.orgId)
      .order('captured_at', { ascending: false });
    if (error) return this._err(error);

    // Latest status per (sku, retailer)
    const latest = {};
    (data || []).forEach(p => {
      const key = `${p.sku}|${p.retailer}`;
      if (!latest[key]) latest[key] = p;
    });
    return this._ok(Object.values(latest));
  }

  /** Widget 11 — Efectividad de Ofertas */
  async loadOfertas() {
    const { data, error } = await this.sb
      .from('retail_prices')
      .select('retailer, promo_label, promo_details, price, captured_at')
      .eq('organization_id', this.orgId)
      .not('promo_label', 'is', null)
      .order('captured_at', { ascending: false })
      .limit(200);
    if (error) return this._err(error);
    return this._ok(data || []);
  }

  /** Widget 12 — Crecimiento compuesto de KPIs */
  async loadCrecimientoKPIs() {
    if (this._noContainers()) return this._empty([]);
    const { data, error } = await this.sb
      .from('brand_analytics_snapshots')
      .select('platform, period_type, period_start, period_end, metrics')
      .in('brand_container_id', this.containerIds)
      .eq('period_type', 'day')
      .order('period_start', { ascending: true })
      .limit(120);
    if (error) return this._err(error);
    return this._ok(data || []);
  }

  /* ══════════════════════════════════════════════════════════
     DIM D · SOCIAL Y PERCEPCIÓN
  ══════════════════════════════════════════════════════════ */

  /** Widget 13 — Sentimiento biométrico (emociones específicas) */
  async loadSentimientoBiometrico() {
    if (this._noContainers()) return this._empty(null);
    const { data, error } = await this.sb
      .from('brand_posts')
      .select('sentiment, captured_at')
      .in('brand_container_id', this.containerIds)
      .eq('post_source', 'own')
      .not('sentiment', 'eq', '{}')
      .order('captured_at', { ascending: false })
      .limit(200);
    if (error) return this._err(error);
    if (!data || data.length === 0) return this._empty(null);

    // Agregar emotion_breakdown
    const emotions = {};
    (data || []).forEach(p => {
      const eb = p.sentiment?.emotion_breakdown || {};
      Object.entries(eb).forEach(([emotion, val]) => {
        emotions[emotion] = (emotions[emotion] || 0) + (typeof val === 'number' ? val : 1);
      });
    });
    // Overall positivo/negativo
    const positivo = (data || []).filter(p => p.sentiment?.overall === 'positive').length;
    const negativo = (data || []).filter(p => p.sentiment?.overall === 'negative').length;
    return this._ok({ emotions, positivo, negativo, total: data.length });
  }

  /** Widget 14 — Shadow Mentions */
  async loadShadowMentions() {
    const { data, error } = await this.sb
      .from('intelligence_signals')
      .select('id, signal_type, content_text, ai_analysis, captured_at, entity_id')
      .eq('organization_id', this.orgId)
      .eq('signal_type', 'mention')
      .order('captured_at', { ascending: false })
      .limit(50);
    if (error) return this._err(error);
    return this._ok(data || []);
  }

  /** Widget 15 — Índice de Influencia Real */
  async loadInfluencia() {
    const { data, error } = await this.sb
      .from('intelligence_entities')
      .select('id, name, target_identifier, domain, metadata')
      .eq('organization_id', this.orgId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return this._err(error);

    // Enriquecer con influence_score de intelligence_signals
    const ids = (data || []).map(e => e.id);
    let signals = [];
    if (ids.length) {
      const { data: sigData } = await this.sb
        .from('intelligence_signals')
        .select('entity_id, ai_analysis')
        .in('entity_id', ids)
        .eq('organization_id', this.orgId);
      signals = sigData || [];
    }

    const scoreByEntity = {};
    signals.forEach(s => {
      const score = s.ai_analysis?.influence_score || 0;
      if (!scoreByEntity[s.entity_id] || score > scoreByEntity[s.entity_id]) {
        scoreByEntity[s.entity_id] = score;
      }
    });

    const enriched = (data || []).map(e => ({
      ...e,
      influenceScore: scoreByEntity[e.id] || e.metadata?.influence_score || 0,
      followers: e.metadata?.followers || e.metadata?.followers_count || null,
      platform: e.domain || e.metadata?.platform || 'web',
    })).sort((a, b) => b.influenceScore - a.influenceScore);

    return this._ok(enriched);
  }

  /** Widget 16 — Claridad de comunicación */
  async loadClaridad() {
    if (this._noContainers()) return this._empty([]);
    const { data, error } = await this.sb
      .from('brand_content_analysis')
      .select('clarity_score, tone_coherence_score, analyzed_at, brand_post_id')
      .in('brand_container_id', this.containerIds)
      .order('analyzed_at', { ascending: true })
      .limit(90);
    if (error) return this._err(error);
    return this._ok(data || []);
  }

  /* ══════════════════════════════════════════════════════════
     DIM E · DIAGNÓSTICO Y VULNERABILIDADES
  ══════════════════════════════════════════════════════════ */

  /** Widget 17 — Blind Spots */
  async loadBlindSpots() {
    if (this._noContainers()) return this._empty({ pillars: [], vulnerabilities: [] });

    const [pillarsR, vulnR] = await Promise.allSettled([
      this.sb.from('brand_narrative_pillars')
        .select('pillar_name, post_count, avg_engagement, last_post_at')
        .in('brand_container_id', this.containerIds)
        .eq('post_count', 0),
      this.sb.from('brand_vulnerabilities')
        .select('id, title, description, severity, status, scope, created_at')
        .eq('organization_id', this.orgId)
        .in('status', ['open', 'in_progress'])
        .eq('scope', 'brand')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const pillars = pillarsR.status === 'fulfilled' ? (pillarsR.value.data || []) : [];
    const vulns   = vulnR.status   === 'fulfilled' ? (vulnR.value.data   || []) : [];
    return this._ok({ pillars, vulnerabilities: vulns });
  }

  /** Widget 18 — Fuga de Audiencia */
  async loadFugaAudiencia() {
    if (this._noContainers()) return this._empty(null);
    const { data, error } = await this.sb
      .from('brand_posts')
      .select('id, metrics, network, captured_at')
      .in('brand_container_id', this.containerIds)
      .eq('post_source', 'own')
      .not('metrics', 'is', null)
      .order('captured_at', { ascending: false })
      .limit(50);
    if (error) return this._err(error);

    // Buscar retention curve en metrics
    const withRetention = (data || []).filter(p =>
      p.metrics?.video_retention_curve && Array.isArray(p.metrics.video_retention_curve)
    );
    if (withRetention.length === 0) return this._empty(null);

    // Promedio de las curves
    const len = withRetention[0].metrics.video_retention_curve.length;
    const avg = Array(len).fill(0);
    withRetention.forEach(p => {
      p.metrics.video_retention_curve.forEach((v, i) => { avg[i] += v / withRetention.length; });
    });
    return this._ok({ curve: avg, sampleSize: withRetention.length });
  }

  /** Widget 19 — Detección de Crisis de Baja Intensidad */
  async loadCrisisDetection() {
    const [vulnR, signalsR, missionsR] = await Promise.allSettled([
      this.sb.from('brand_vulnerabilities')
        .select('id, title, description, severity, status, created_at, detected_signal_id, scope')
        .eq('organization_id', this.orgId)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(20),
      this.sb.from('intelligence_signals')
        .select('id, signal_type, content_text, ai_analysis, captured_at')
        .eq('organization_id', this.orgId)
        .eq('signal_type', 'mention')
        .gte('captured_at', new Date(Date.now() - 48 * 3600000).toISOString())
        .order('captured_at', { ascending: false })
        .limit(30),
      this.sb.from('body_missions')
        .select('id, mission_type, status, action_payload, result_reference, created_at')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    return this._ok({
      vulnerabilities: vulnR.status === 'fulfilled'    ? (vulnR.value.data    || []) : [],
      recentSignals:   signalsR.status === 'fulfilled' ? (signalsR.value.data || []) : [],
      missions:        missionsR.status === 'fulfilled'? (missionsR.value.data|| []) : [],
    });
  }

  /** Widget 20 — SWOT Dinámico */
  async loadSWOT() {
    if (this._noContainers()) return this._empty({ strengths: [], weaknesses: [], opportunities: [], threats: [] });
    const [vulnR, analysisR] = await Promise.allSettled([
      this.sb.from('brand_vulnerabilities')
        .select('title, description, severity, scope, status')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false })
        .limit(30),
      this.sb.from('brand_content_analysis')
        .select('why_it_worked, tone_coherence_score, clarity_score')
        .in('brand_container_id', this.containerIds)
        .order('analyzed_at', { ascending: false })
        .limit(20),
    ]);

    const vulns    = vulnR.status === 'fulfilled' ? (vulnR.value.data || []) : [];
    const analyses = analysisR.status === 'fulfilled' ? (analysisR.value.data || []) : [];

    // Classify vulnerabilities into SWOT
    const strengths     = [];
    const weaknesses    = [];
    const opportunities = [];
    const threats       = [];

    // High clarity/coherence posts → strengths
    analyses.filter(a => (a.clarity_score || 0) > 75).slice(0, 3).forEach(a => {
      const w = a.why_it_worked?.summary || a.why_it_worked?.reason;
      if (w) strengths.push({ text: w, score: a.clarity_score });
    });
    // Resolved vulnerabilities → strengths
    vulns.filter(v => v.status === 'resolved').slice(0, 2).forEach(v => {
      strengths.push({ text: `Resuelto: ${v.title}`, score: 80 });
    });

    // Open vulnerabilities → weaknesses or threats by scope
    vulns.filter(v => v.status !== 'resolved').forEach(v => {
      if (v.scope === 'brand' && ['low', 'medium'].includes(v.severity)) {
        weaknesses.push({ text: v.title, severity: v.severity });
      } else if (['high', 'critical'].includes(v.severity)) {
        threats.push({ text: v.title, severity: v.severity });
      }
    });

    // Orphaned pillars → opportunities
    // (populated from loadBlindSpots if called before)
    return this._ok({ strengths, weaknesses, opportunities, threats, vulnsTotal: vulns.length });
  }

  /** Body Missions — OpenClaw activity log */
  async loadBodyMissions() {
    const { data, error } = await this.sb
      .from('body_missions')
      .select('id, mission_type, status, action_payload, result_reference, created_at')
      .eq('organization_id', this.orgId)
      .order('created_at', { ascending: false })
      .limit(8);
    if (error) return this._err(error);
    return this._ok(data || []);
  }
}

window.MiBrandaDataService = MiBrandaDataService;
