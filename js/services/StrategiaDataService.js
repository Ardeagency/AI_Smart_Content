/**
 * StrategiaDataService — Capa de datos del Dashboard Estrategia
 *
 * Lee vera_pending_actions como tabla núcleo y cruza con
 * brand_vulnerabilities, brand_content_analysis, competitor_ads,
 * retail_prices, intelligence_signals, trend_topics, body_missions,
 * mission_runs, flow_schedules y brand_audience_heatmap.
 *
 * Spec: dashboard_estrategia_spec.docx · ARDE Agency S.A.S.
 */
class StrategiaDataService {
  constructor() {
    this.sb           = null;
    this.orgId        = null;
    this.containerIds = [];
    this.entityIds    = [];
    this._cache       = {};
  }

  /* ── Inicialización ────────────────────────────────────────── */
  async init(supabase, orgId) {
    this.sb    = supabase;
    this.orgId = orgId;
    this._cache = {};

    await Promise.allSettled([
      this.sb.from('brand_containers')
        .select('id')
        .eq('organization_id', orgId)
        .then(({ data }) => { this.containerIds = (data || []).map(c => c.id); }),
      this.sb.from('intelligence_entities')
        .select('id')
        .eq('organization_id', orgId)
        .then(({ data }) => { this.entityIds = (data || []).map(e => e.id); }),
    ]);
    return this;
  }

  _ok(data)  { return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null }; }
  _err(e)    { return { data: null, isEmpty: true, error: e }; }
  _noOrg()   { return !this.sb || !this.orgId; }

  /* ══════════════════════════════════════════════════════════
     CARGA TOTAL
  ══════════════════════════════════════════════════════════ */
  async loadAll() {
    const [sb, pa, cal, hist] = await Promise.allSettled([
      this.loadStatusBar(),
      this.loadPendingActions(),
      this.loadCalendar(),
      this.loadMissionHistory(),
    ]);
    const u = s => s.status === 'fulfilled' ? s.value : this._err(s.reason);
    return { statusBar: u(sb), actions: u(pa), calendar: u(cal), history: u(hist) };
  }

  /* ══════════════════════════════════════════════════════════
     ZONA 1 — Score de Salud Global + Nivel de Amenaza
  ══════════════════════════════════════════════════════════ */
  async loadStatusBar() {
    if (this._noOrg()) return this._ok({ healthScore: 0, threatLevel: 'bajo', pendingCount: 0, topTrend: null, lastSynthesis: null, briefing: null });

    const cids  = this.containerIds.length ? this.containerIds : ['00000000-0000-0000-0000-000000000000'];
    const eids  = this.entityIds.length    ? this.entityIds    : ['00000000-0000-0000-0000-000000000000'];
    const d2h   = new Date(Date.now() - 2  * 3600000).toISOString();
    const d24h  = new Date(Date.now() - 86400000).toISOString();

    const [vR, aR, pR, prR, caR, sigR, trR, bmR] = await Promise.allSettled([
      /* 0 */ this.sb.from('brand_vulnerabilities').select('severity, status').eq('organization_id', this.orgId).in('status', ['open', 'in_progress']),
      /* 1 */ this.sb.from('brand_content_analysis').select('tone_coherence_score').in('brand_container_id', cids).limit(100),
      /* 2 */ this.sb.from('vera_pending_actions').select('id, priority', { count: 'exact' }).eq('organization_id', this.orgId).eq('status', 'pending'),
      /* 3 */ this.sb.from('retail_prices').select('stock_status').eq('organization_id', this.orgId).order('captured_at', { ascending: false }).limit(100),
      /* 4 */ this.sb.from('competitor_ads').select('id').eq('organization_id', this.orgId).gte('first_seen_at', d2h),
      /* 5 */ this.sb.from('intelligence_signals').select('signal_type').in('entity_id', eids).in('signal_type', ['crisis', 'stock_alert', 'negative_review']).gte('captured_at', d24h),
      /* 6 */ this.sb.from('trend_topics').select('keyword, velocity_score, category').eq('organization_id', this.orgId).order('velocity_score', { ascending: false }).limit(1),
      /* 7 */ this.sb.from('body_missions').select('updated_at, result_reference').eq('organization_id', this.orgId).eq('status', 'completed').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const get    = (r, fb = []) => r.status === 'fulfilled' ? (r.value.data || fb) : fb;
    const vulns  = get(vR);
    const anals  = get(aR);
    const pData  = get(pR);
    const pCount = pR.status === 'fulfilled' ? (pR.value.count ?? pData.length) : 0;
    const prices = get(prR);
    const newAds = get(caR);
    const sigs   = get(sigR);
    const trends = get(trR);
    const bm     = bmR.status === 'fulfilled' ? bmR.value.data : null;

    // Health score (spec: tone 25% + vuln 30% + stock 20% + acciones 25%)
    const avgTone   = anals.length ? anals.reduce((s, r) => s + (r.tone_coherence_score || 0), 0) / anals.length : 50;
    const critCount = vulns.filter(v => v.severity === 'critical').length;
    const highCount = vulns.filter(v => v.severity === 'high').length;
    const vulnScore = Math.max(0, 100 - critCount * 25 - highCount * 10);
    const inStock   = prices.filter(p => p.stock_status === 'in_stock').length;
    const stockScore = prices.length > 0 ? (inStock / prices.length) * 100 : 80;
    const hiPri     = pData.filter(a => a.priority >= 8).length;
    const actionScore = Math.max(0, 100 - hiPri * 15);
    const healthScore = Math.round(avgTone * 0.25 + vulnScore * 0.30 + stockScore * 0.20 + actionScore * 0.25);

    // Threat level (spec: new ads 40% + stock/price changes 35% + crisis 25%)
    const stockAlerts  = sigs.filter(s => s.signal_type === 'stock_alert').length;
    const crisisSigs   = sigs.filter(s => ['crisis', 'negative_review'].includes(s.signal_type)).length;
    const threatRaw    = Math.min(100, newAds.length * 20) * 0.40
                       + Math.min(100, stockAlerts * 25)   * 0.35
                       + Math.min(100, crisisSigs * 30)    * 0.25;
    let threatLevel    = 'bajo';
    if (threatRaw >= 75)      threatLevel = 'critico';
    else if (threatRaw >= 50) threatLevel = 'alto';
    else if (threatRaw >= 25) threatLevel = 'medio';

    return this._ok({
      healthScore,
      threatLevel,
      threatTooltip: newAds.length > 0
        ? `${newAds.length} ads nuevos del rival en las últimas 2h`
        : 'Sin actividad rival reciente detectada',
      topTrend:      trends[0] || null,
      pendingCount:  pCount,
      lastSynthesis: bm?.updated_at || null,
      briefing:      bm?.result_reference?.briefing_text || null,
      criticalVulns: critCount,
    });
  }

  /* ══════════════════════════════════════════════════════════
     ZONA 2 — Plan de Acción (vera_pending_actions)
  ══════════════════════════════════════════════════════════ */
  async loadPendingActions() {
    if (this._noOrg()) return this._ok({ hoy: [], semana: [], mes: [] });

    const now   = Date.now();
    const in24h = new Date(now + 86400000).toISOString();
    const in7d  = new Date(now + 7  * 86400000).toISOString();

    const { data, error } = await this.sb
      .from('vera_pending_actions')
      .select('id, action_type, vera_reasoning, vera_confidence, proposed_payload, impact_estimate, expires_at, status, priority, source_signal_id, created_at, updated_at, brand_container_id')
      .eq('organization_id', this.orgId)
      .eq('status', 'pending')
      .order('priority',         { ascending: false })
      .order('vera_confidence',  { ascending: false })
      .limit(50);

    if (error) return this._err(error);
    const actions = data || [];

    // Clasificar por horizonte (spec: expires_at < 24h OR priority ≥ 8 → HOY)
    const hoy    = actions.filter(a =>
      a.priority >= 8 || (a.expires_at && new Date(a.expires_at) <= new Date(in24h))
    );
    const hoySet = new Set(hoy.map(a => a.id));
    const semana = actions.filter(a =>
      !hoySet.has(a.id) && (!a.expires_at || new Date(a.expires_at) <= new Date(in7d))
    );
    const semSet = new Set([...hoySet, ...semana.map(a => a.id)]);
    const mes    = actions.filter(a => !semSet.has(a.id));

    return this._ok({ hoy: hoy.slice(0, 7), semana: semana.slice(0, 10), mes: mes.slice(0, 10) });
  }

  /* ══════════════════════════════════════════════════════════
     ZONA 4 — Calendario Editorial (flow_schedules + heatmap)
  ══════════════════════════════════════════════════════════ */
  async loadCalendar() {
    if (this._noOrg()) return this._ok({ schedules: [], heatmap: [], veraSlots: [] });

    const in7d = new Date(Date.now() + 7 * 86400000).toISOString();
    const cids = this.containerIds.length ? this.containerIds : ['00000000-0000-0000-0000-000000000000'];

    const [sR, hR, vR] = await Promise.allSettled([
      this.sb.from('flow_schedules')
        .select('id, status, next_run_at, metadata_config, cron_expression')
        .eq('organization_id', this.orgId)
        .lte('next_run_at', in7d)
        .order('next_run_at', { ascending: true })
        .limit(30),
      this.sb.from('brand_audience_heatmap')
        .select('best_hour, best_day, platform')
        .in('brand_container_id', cids)
        .limit(3),
      this.sb.from('vera_pending_actions')
        .select('id, action_type, expires_at, vera_confidence, status')
        .eq('organization_id', this.orgId)
        .eq('status', 'pending')
        .not('expires_at', 'is', null)
        .lte('expires_at', in7d)
        .order('expires_at', { ascending: true })
        .limit(20),
    ]);

    return this._ok({
      schedules:  sR.status === 'fulfilled' ? (sR.value.data || []) : [],
      heatmap:    hR.status === 'fulfilled' ? (hR.value.data || []) : [],
      veraSlots:  vR.status === 'fulfilled' ? (vR.value.data || []) : [],
    });
  }

  /* ══════════════════════════════════════════════════════════
     ZONA 5 — Historial de Misiones
  ══════════════════════════════════════════════════════════ */
  async loadMissionHistory() {
    if (this._noOrg()) return this._ok([]);

    const { data, error } = await this.sb
      .from('vera_pending_actions')
      .select('id, action_type, vera_reasoning, vera_confidence, status, executed_at, execution_result, error_message, approved_at, rejected_at, rejection_reason, created_at')
      .eq('organization_id', this.orgId)
      .in('status', ['executed', 'failed', 'rejected', 'approved', 'executing'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) return this._err(error);
    return this._ok(data || []);
  }

  /* ══════════════════════════════════════════════════════════
     ACCIONES DE ESCRITURA (con APPROVE_ACTION)
  ══════════════════════════════════════════════════════════ */
  async approveAction(actionId) {
    const { data, error } = await this.sb
      .from('vera_pending_actions')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', actionId)
      .eq('organization_id', this.orgId)
      .select('id, status')
      .single();
    return error ? this._err(error) : this._ok(data);
  }

  async rejectAction(actionId, reason = '') {
    const { data, error } = await this.sb
      .from('vera_pending_actions')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: reason || null,
      })
      .eq('id', actionId)
      .eq('organization_id', this.orgId)
      .select('id, status')
      .single();
    return error ? this._err(error) : this._ok(data);
  }

  /* ══════════════════════════════════════════════════════════
     DETALLE DE ACCIÓN (Panel de Contexto)
  ══════════════════════════════════════════════════════════ */
  async loadActionDetail(actionId) {
    const { data: action, error } = await this.sb
      .from('vera_pending_actions')
      .select('*')
      .eq('id', actionId)
      .maybeSingle();

    if (error || !action) return this._err(error || new Error('Not found'));

    let signal = null;
    if (action.source_signal_id) {
      const { data } = await this.sb
        .from('intelligence_signals')
        .select('id, signal_type, content_text, ai_analysis, captured_at')
        .eq('id', action.source_signal_id)
        .maybeSingle();
      signal = data;
    }
    return this._ok({ action, signal });
  }
}

window.StrategiaDataService = StrategiaDataService;
