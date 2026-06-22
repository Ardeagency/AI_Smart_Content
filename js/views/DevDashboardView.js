/**
 * DevDashboardView — "Centro de mando" del portal /dev.
 *
 * Rediseño v2 (Figma node 283:841). Monitoreo global de la plataforma para el
 * rol lead: Atención (alertas accionables), Indicadores (gauges), Tráfico de
 * scraping + Top flujos, KPIs, Motor ai-engine + Salud y eficiencia, y
 * Negocio & FinOps (consumo de créditos, tenants, consumo por org).
 *
 * Datos: RPCs gated a dev/lead (dev_dashboard_*). Todo agrega en el servidor.
 * Visualizaciones (gauges, área-chart, donuts) en SVG vanilla — sin librerías.
 * Datos en vivo sin parpadeo vía liveRefresh/startLivePoll (BaseView).
 *
 * Principio: cero datos falsos. Lo no instrumentado se degrada a "sin datos".
 */
class DevDashboardView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.isLead = false;
    this.devRank = null;
    this._lastUpdate = null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Shell
  // ──────────────────────────────────────────────────────────────────────
  renderHTML() {
    return `
      <div class="dev-dashboard-container dev-dashboard-v2 dev-cmd">
        <header class="dev-dashboard-header dev-cmd-header">
          <div>
            <h1 class="dev-cmd-title">Centro de mando</h1>
            <p class="dev-cmd-subtitle">Monitoreo global de la plataforma — flujos, motor, scrapers, aprendizaje.</p>
          </div>
          <div class="dev-header-actions" id="devHeaderActions">
            <span class="dev-cmd-updated" id="cmdUpdated"></span>
            <button class="dev-cmd-refresh" id="cmdRefresh" title="Actualizar" aria-label="Actualizar">
              <i class="fas fa-rotate"></i>
            </button>
            <span class="dev-rank-pill" id="cmdRankPill" hidden></span>
          </div>
        </header>

        <!-- Atención -->
        <section class="dev-cmd-block" aria-label="Atención">
          <div class="dev-section-header"><h2 class="dev-cmd-h2">Atención</h2></div>
          <div class="dev-attention-row" id="cmdAttention">${this._skeletonAttention()}</div>
        </section>

        <!-- Indicadores -->
        <section class="dev-cmd-block dev-cmd-panel" aria-label="Indicadores">
          <div class="dev-section-header"><h2 class="dev-cmd-h2">Indicadores</h2></div>
          <div class="dev-gauges" id="cmdGauges">${this._skeletonGauges()}</div>
        </section>

        <!-- Tráfico de scraping + Top flujos -->
        <section class="dev-cmd-grid dev-cmd-grid-2-1">
          <div class="dev-cmd-panel" aria-label="Tráfico de scraping">
            <div class="dev-section-header">
              <h2 class="dev-cmd-h2">Tráfico de scraping</h2>
              <span class="dev-section-meta" id="cmdTrafficMeta"></span>
            </div>
            <div class="dev-area-wrap" id="cmdTraffic"></div>
          </div>
          <div class="dev-cmd-panel" aria-label="Top flujos">
            <div class="dev-section-header">
              <h2 class="dev-cmd-h2">Top flujos</h2>
              <span class="dev-section-meta">24h</span>
            </div>
            <div id="cmdTopFlows"></div>
          </div>
        </section>

        <!-- KPIs -->
        <section class="dev-cmd-block">
          <div class="dev-kpi-strip" id="cmdKpis">${this._skeletonKpis()}</div>
        </section>

        <!-- Motor ai-engine + Salud y eficiencia -->
        <section class="dev-cmd-grid dev-cmd-grid-1-2">
          <div class="dev-cmd-panel" aria-label="Motor ai-engine">
            <div class="dev-section-header"><h2 class="dev-cmd-h2">Motor ai-engine</h2></div>
            <div id="cmdEngine"></div>
          </div>
          <div class="dev-cmd-panel" aria-label="Salud y eficiencia">
            <div class="dev-section-header"><h2 class="dev-cmd-h2">Salud y eficiencia</h2></div>
            <div class="dev-bars" id="cmdEfficiency"></div>
          </div>
        </section>

        <!-- Negocio & FinOps -->
        <section class="dev-cmd-block">
          <div class="dev-section-header"><h2 class="dev-cmd-h2">Negocio &amp; FinOps</h2></div>
          <div class="dev-cmd-grid dev-finops-grid" id="cmdFinops"></div>
        </section>

        <!-- Consumo y costo por org -->
        <section class="dev-cmd-block dev-cmd-panel" aria-label="Consumo por org">
          <div class="dev-section-header"><h2 class="dev-cmd-h2">Consumo y costo por org</h2><span class="dev-section-meta">30d</span></div>
          <div id="cmdByOrg"></div>
        </section>
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────
  async init() {
    await this.initSupabase();
    await this.detectRoleAndRank();
    this.renderHeaderChrome();
    this.bindHeader();

    // Carga inicial + datos en vivo (polling silencioso, sin parpadeo).
    this._tick = () => this.liveRefresh('cmd', () => this.loadAll(), (d) => this.applyAll(d));
    await this._tick();
    this.startLivePoll(45000, () => this._tick());
  }

  async initSupabase() {
    try {
      this.supabase = await this.getSupabaseClient();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('[CentroMando] init supabase error', e);
    }
  }

  async detectRoleAndRank() {
    this.isLead = !!(window.authService && window.authService.isLead && window.authService.isLead());
    try {
      if (this.supabase && this.userId) {
        const { data } = await this.supabase
          .from('profiles').select('dev_rank, dev_role').eq('id', this.userId).single();
        if (data) {
          this.devRank = data.dev_rank || null;
          if (!this.isLead) this.isLead = data.dev_role === 'lead';
        }
      }
    } catch (_) { /* rank es decorativo */ }
  }

  renderHeaderChrome() {
    const titleEl = document.getElementById('devHeaderTitle');
    const subEl = document.getElementById('devHeaderSubtitle');
    if (titleEl) titleEl.textContent = 'Centro de mando';
    if (subEl) subEl.textContent = '';
    const pill = document.getElementById('cmdRankPill');
    if (pill && this.devRank) {
      pill.hidden = false;
      pill.textContent = String(this.devRank).toUpperCase();
    }
  }

  bindHeader() {
    const btn = document.getElementById('cmdRefresh');
    if (btn) btn.addEventListener('click', async () => {
      btn.classList.add('spinning');
      this.liveResetSignature('cmd');
      await this._tick();
      setTimeout(() => btn.classList.remove('spinning'), 600);
    });

    // El router es pushState y NO intercepta <a>: delegamos los CTAs internos.
    const root = this.container?.querySelector?.('.dev-cmd') || document.querySelector('.dev-cmd');
    if (root && !root._ctaBound) {
      root._ctaBound = true;
      root.addEventListener('click', (e) => {
        const a = e.target.closest('a.dev-att-cta');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.startsWith('/') && window.router?.navigate) {
          e.preventDefault();
          window.router.navigate(href);
        }
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Carga de datos (un solo fetch agregado; cada RPC es independiente)
  // ──────────────────────────────────────────────────────────────────────
  async loadAll() {
    const rpc = async (name, args) => {
      try {
        const { data, error } = await this.supabase.rpc(name, args || {});
        if (error) throw error;
        return data;
      } catch (e) {
        console.warn(`[CentroMando] ${name}:`, e?.message || e);
        return null;
      }
    };

    const [kpis, indicators, scrapers, topFlows, finops, attention, signals, engineHealth] =
      await Promise.all([
        rpc('dev_dashboard_kpis'),
        rpc('dev_dashboard_indicators'),
        rpc('dev_dashboard_scrapers', { p_days: 14 }),
        rpc('dev_dashboard_top_flows', { p_hours: 24, p_limit: 6 }),
        rpc('dev_dashboard_finops'),
        rpc('dev_dashboard_attention'),
        rpc('dev_dashboard_signals'),
        this.fetchEngineHealth(),
      ]);

    return { kpis, indicators, scrapers, topFlows, finops, attention, signals, engineHealth, _at: Date.now() };
  }

  /** Health del ai-engine: mide latencia con el round-trip del fetch. */
  async fetchEngineHealth() {
    const base = (window.AI_ENGINE_BASE_URL || '').replace(/\/$/, '');
    if (!base) return { ok: false, configured: false };
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${base}/health`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(to);
      const latency = Math.round(performance.now() - t0);
      if (!res.ok) return { ok: false, configured: true, latency, http: res.status };
      const body = await res.json().catch(() => ({}));
      return { ok: true, configured: true, latency, uptime_s: body.uptime_s, version: body.version };
    } catch (e) {
      return { ok: false, configured: true, latency: null, error: e?.name === 'AbortError' ? 'timeout' : 'unreachable' };
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Pintado (cada región se re-pinta solo si cambió la firma global)
  // ──────────────────────────────────────────────────────────────────────
  applyAll(d) {
    if (!d) return;
    this.renderAttention(d.attention, d.signals, d.finops);
    this.renderGauges(d.indicators);
    this.renderTraffic(d.scrapers);
    this.renderTopFlows(d.topFlows);
    this.renderKpis(d.kpis, d.indicators);
    this.renderEngine(d.engineHealth, d.indicators, d.scrapers);
    this.renderEfficiency(d.indicators);
    this.renderFinops(d.finops);
    this.renderByOrg(d.finops);
    this._lastUpdate = d._at;
    this.renderUpdated();
  }

  renderUpdated() {
    const el = document.getElementById('cmdUpdated');
    if (el) el.textContent = 'actualizado ' + this.relTime(this._lastUpdate);
  }

  // ── Atención ──────────────────────────────────────────────────────────
  renderAttention(att, sig, fin) {
    const el = document.getElementById('cmdAttention');
    if (!el) return;
    const cards = [];

    const lowCredits = att?.low_credits_orgs?.count || 0;
    if (lowCredits > 0) cards.push(this.attCard('crit', 'fa-coins',
      `${lowCredits} ${lowCredits === 1 ? 'org' : 'orgs'} con créditos por agotar`,
      'Saldo bajo el 10%', 'Cargar créditos', '/dev/lead/billing'));

    const scrDown = sig?.scrapers_down?.count || 0;
    if (scrDown > 0) {
      const names = (sig.scrapers_down.preview || []).map(p => p.sensor_type).slice(0, 3).join(', ');
      cards.push(this.attCard('warn', 'fa-spider',
        `${scrDown} ${scrDown === 1 ? 'scraper caído' : 'scrapers caídos'}`,
        names || 'última corrida falló', 'Revisar', '/dev/logs'));
    }

    const tokExp = sig?.tokens_expiring?.count || 0;
    if (tokExp > 0) {
      const p0 = (sig.tokens_expiring.preview || [])[0];
      const who = p0 ? `${p0.platform}${p0.account ? ' · ' + p0.account : ''}` : '';
      cards.push(this.attCard('warn', 'fa-key',
        `${tokExp} ${tokExp === 1 ? 'token por expirar' : 'tokens por expirar'}`,
        who || 'próximos 7 días', 'Reconectar', '/dev/lead/orgs'));
    }

    const critErr = att?.critical_errors_24h?.count || 0;
    if (critErr > 0) cards.push(this.attCard('crit', 'fa-triangle-exclamation',
      `${critErr} ${critErr === 1 ? 'error crítico' : 'errores críticos'} · 24h`,
      'Revisa los logs del motor', 'Ver logs', '/dev/logs'));

    if (sig?.queue?.saturated) cards.push(this.attCard('warn', 'fa-layer-group',
      'Cola de generación saturada', `${sig.queue.backlog} jobs en cola`, 'Ver cola', '/dev/logs'));

    const provFail = att?.provisioning_failures_24h?.count || 0;
    if (provFail > 0) cards.push(this.attCard('crit', 'fa-server',
      `${provFail} fallo(s) de provisioning · 24h`, 'Veras sin desplegar', 'Ver orgs', '/dev/lead/orgs'));

    if (!cards.length) {
      el.innerHTML = `<div class="dev-attention-empty"><i class="fas fa-circle-check"></i> Todo en orden — nada requiere tu atención.</div>`;
      return;
    }
    el.innerHTML = cards.join('');
  }

  attCard(tone, icon, title, sub, cta, href) {
    return `
      <div class="dev-att-card tone-${tone}">
        <span class="dev-att-ic"><i class="fas ${icon}"></i></span>
        <div class="dev-att-body">
          <div class="dev-att-title">${this.escapeHtml(title)}</div>
          <div class="dev-att-sub">${this.escapeHtml(sub)}</div>
        </div>
        <a class="dev-att-cta" href="${href}">${this.escapeHtml(cta)}</a>
      </div>`;
  }

  // ── Indicadores (gauges) ──────────────────────────────────────────────
  renderGauges(ind) {
    const el = document.getElementById('cmdGauges');
    if (!el) return;
    if (!ind || ind.is_lead === false) { el.innerHTML = this.leadOnly(); return; }
    const gauges = ind.gauges || [];
    el.innerHTML = gauges.map(g => `
      <div class="dev-gauge">
        ${this.svgGauge(g.value)}
        <div class="dev-gauge-label">${this.escapeHtml(g.label)}</div>
        <div class="dev-gauge-detail">${this.escapeHtml(g.detail || '')}</div>
      </div>`).join('');
  }

  // ── Tráfico de scraping (área) ────────────────────────────────────────
  renderTraffic(scr) {
    const el = document.getElementById('cmdTraffic');
    const meta = document.getElementById('cmdTrafficMeta');
    if (!el) return;
    if (!scr || scr.is_lead === false) { el.innerHTML = this.leadOnly(); return; }
    const traffic = scr.traffic || [];
    if (meta) meta.textContent = `${scr.window_days || 14}d · ${scr.summary?.ok ?? 0}/${scr.summary?.total ?? 0} ok`;
    if (!traffic.length || traffic.every(t => (t.runs || 0) === 0)) {
      el.innerHTML = this.noData('Sin corridas de scraping en el rango.');
      return;
    }
    el.innerHTML = this.svgArea(traffic.map(t => t.runs || 0), traffic.map(t => t.date));
  }

  // ── Top flujos ────────────────────────────────────────────────────────
  renderTopFlows(tf) {
    const el = document.getElementById('cmdTopFlows');
    if (!el) return;
    const rows = tf?.rows || [];
    if (!rows.length) { el.innerHTML = this.noData('Sin runs en las últimas 24h.'); return; }
    el.innerHTML = `
      <table class="dev-table dev-table-dense">
        <thead><tr><th>Flujo</th><th class="num">Runs</th><th class="num">Éxito</th><th class="num">Tokens</th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const pct = Number(r.success_pct ?? 0);
            const lvl = pct >= 90 ? 'ok' : pct >= 70 ? 'warn' : 'crit';
            return `<tr>
              <td class="dev-cell-flow">${this.escapeHtml(r.flow_name || '—')}</td>
              <td class="num">${this.fmt(r.total)}</td>
              <td class="num"><span class="dev-success-badge level-${lvl}">${pct}%</span></td>
              <td class="num">${this.fmtCompact(r.tokens)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  // ── KPIs ──────────────────────────────────────────────────────────────
  renderKpis(kpis, ind) {
    const el = document.getElementById('cmdKpis');
    if (!el) return;
    if (!kpis) { el.innerHTML = this.noData('KPIs no disponibles.'); return; }
    const lead = kpis.is_lead !== false;
    const items = lead ? [
      { label: 'Runs · 24h', value: this.fmt(kpis.runs_24h_total), sub: `${kpis.runs_24h_completed ?? 0} completados` },
      { label: 'Éxito · 24h', value: kpis.success_rate_24h != null ? kpis.success_rate_24h + '%' : '—', sub: 'completados / total' },
      { label: 'Errores · 24h', value: this.fmt(kpis.errors_24h), sub: kpis.error_rate_24h != null ? kpis.error_rate_24h + '% tasa' : '' },
      { label: 'Créditos · 7d', value: this.fmtCompact(kpis.credits_consumed_7d), sub: 'consumidos' },
      { label: 'Flujos', value: this.fmt(kpis.flows_total), sub: `${kpis.flows_published ?? 0} publicados` },
      { label: 'Orgs activas', value: this.fmt(kpis.orgs_active), sub: `${kpis.users_total ?? 0} usuarios` },
    ] : [
      { label: 'Mis runs · 24h', value: this.fmt(kpis.my_runs_24h_total), sub: `${kpis.my_runs_24h_completed ?? 0} ok` },
      { label: 'Éxito · 24h', value: kpis.my_success_rate_24h != null ? kpis.my_success_rate_24h + '%' : '—', sub: '' },
      { label: 'Mis errores · 24h', value: this.fmt(kpis.my_errors_24h), sub: '' },
      { label: 'Mis flujos', value: this.fmt(kpis.my_flows_total), sub: `${kpis.my_flows_published ?? 0} publicados` },
    ];
    el.innerHTML = items.map(k => `
      <div class="dev-kpi-card">
        <div class="dev-kpi-label">${this.escapeHtml(k.label)}</div>
        <div class="dev-kpi-value">${k.value ?? '—'}</div>
        <div class="dev-kpi-sub">${this.escapeHtml(k.sub || '')}</div>
      </div>`).join('');
  }

  // ── Motor ai-engine ───────────────────────────────────────────────────
  renderEngine(h, ind, scr) {
    const el = document.getElementById('cmdEngine');
    if (!el) return;
    let dot, label, value;
    if (!h || !h.configured) {
      dot = 'idle'; label = 'No configurado';
      value = 'Define AI_ENGINE_BASE_URL';
    } else if (h.ok) {
      dot = 'ok'; label = 'Operativo';
      value = (h.latency != null ? `${h.latency}ms` : '') + (h.version ? ` · v${h.version}` : '');
    } else {
      dot = 'crit'; label = h.error === 'timeout' ? 'Sin respuesta' : 'Caído';
      value = h.http ? `HTTP ${h.http}` : (h.error || 'inalcanzable');
    }
    const load = ind?.engine?.load_pct;
    const queued = ind?.engine?.queued;
    el.innerHTML = `
      <div class="dev-engine-head level-${dot}">
        <span class="dev-engine-dot"></span>
        <div class="dev-engine-meta">
          <div class="dev-engine-label">${this.escapeHtml(label)}</div>
          <div class="dev-engine-value">${this.escapeHtml(value || '')}</div>
        </div>
        <a class="dev-att-cta" href="/dev/web-vitals">Ver salud</a>
      </div>
      ${load != null ? `
      <div class="dev-engine-load">
        <div class="dev-bar-head"><span>Carga del motor</span><span>${load}%${queued != null ? ` · ${queued} en cola` : ''}</span></div>
        <div class="dev-bar-track"><div class="dev-bar-fill ${load >= 80 ? 'level-crit' : load >= 50 ? 'level-warn' : 'level-ok'}" style="width:${Math.min(100, load)}%"></div></div>
      </div>` : ''}`;
  }

  // ── Salud y eficiencia (barras) ───────────────────────────────────────
  renderEfficiency(ind) {
    const el = document.getElementById('cmdEfficiency');
    if (!el) return;
    if (!ind || ind.is_lead === false) { el.innerHTML = this.leadOnly(); return; }
    const bars = ind.efficiency || [];
    el.innerHTML = bars.map(b => {
      const v = b.value;
      if (v == null) return `
        <div class="dev-bar">
          <div class="dev-bar-head"><span>${this.escapeHtml(b.label)}</span><span class="muted">sin datos</span></div>
          <div class="dev-bar-track"></div>
        </div>`;
      // "Carga del motor": más alto = peor; el resto: más alto = mejor.
      const inverse = b.key === 'engine_load';
      const lvl = inverse
        ? (v >= 80 ? 'crit' : v >= 50 ? 'warn' : 'ok')
        : (v >= 90 ? 'ok' : v >= 70 ? 'warn' : 'crit');
      return `
        <div class="dev-bar">
          <div class="dev-bar-head"><span>${this.escapeHtml(b.label)}</span><span>${v}%</span></div>
          <div class="dev-bar-track"><div class="dev-bar-fill level-${lvl}" style="width:${Math.min(100, v)}%"></div></div>
        </div>`;
    }).join('');
  }

  // ── Negocio & FinOps ──────────────────────────────────────────────────
  renderFinops(fin) {
    const el = document.getElementById('cmdFinops');
    if (!el) return;
    if (!fin || fin.is_lead === false) { el.innerHTML = this.leadOnly(); return; }

    // Donut 1: consumo de créditos por operación (real; el USD por proveedor no
    // está instrumentado, ver dev_dashboard_finops()).
    const ops = (fin.by_operation || []).map((o, i) => ({
      name: o.operation, value: Number(o.credits || 0), color: this.palette(i)
    })).filter(o => o.value > 0);
    const opsTotal = ops.reduce((s, o) => s + o.value, 0);

    // Donut 2: uso de créditos plataforma (headroom).
    const util = fin.credits?.utilization;
    const used = (fin.credits?.total || 0) - (fin.credits?.available || 0);

    const t = fin.tenants || {};

    el.innerHTML = `
      <div class="dev-cmd-panel dev-finops-card">
        <div class="dev-finops-label">Consumo IA · 30d <span class="dev-finops-note" title="Créditos por operación. El costo en USD por proveedor aún no está instrumentado.">créditos</span></div>
        <div class="dev-donut-body">
          ${ops.length ? this.svgDonut(ops, this.fmtCompact(opsTotal), 'créditos') : this.noData('Sin consumo en 30d.')}
          ${ops.length ? `<ul class="dev-donut-legend">${ops.slice(0, 5).map(o => `
            <li><span class="dev-donut-swatch" style="background:${o.color}"></span>
                <span class="dev-donut-name">${this.escapeHtml(o.name)}</span>
                <span class="dev-donut-count">${this.fmtCompact(o.value)}</span></li>`).join('')}</ul>` : ''}
        </div>
      </div>

      <div class="dev-cmd-panel dev-finops-card">
        <div class="dev-finops-label">Uso de créditos · plataforma</div>
        <div class="dev-donut-body">
          ${util != null ? this.svgDonut(
              [{ name: 'Usado', value: used, color: 'var(--dev-rank-accent, #7C83FF)' },
               { name: 'Disponible', value: (fin.credits?.available || 0), color: 'rgba(255,255,255,0.10)' }],
              util + '%', 'uso') : this.noData('Sin créditos asignados.')}
          <ul class="dev-donut-legend">
            <li><span class="dev-donut-name">Consumo · 7d</span><span class="dev-donut-count">${this.fmtCompact(fin.credits?.consumed_7d)}</span></li>
            <li><span class="dev-donut-name">Consumo · 30d</span><span class="dev-donut-count">${this.fmtCompact(fin.credits?.consumed_30d)}</span></li>
            <li><span class="dev-donut-name">MRR</span><span class="dev-donut-count">$${this.fmt(fin.mrr)}</span></li>
          </ul>
        </div>
      </div>

      <div class="dev-cmd-panel dev-finops-card dev-tenant-card">
        <div class="dev-finops-label">Tenants</div>
        <div class="dev-tenant-grid">
          <div><div class="dev-tenant-num">${this.fmt(t.total)}</div><div class="dev-tenant-cap">activos</div></div>
          <div><div class="dev-tenant-num dev-pos">+${this.fmt(t.new_30d)}</div><div class="dev-tenant-cap">nuevos 30d</div></div>
          <div><div class="dev-tenant-num dev-muted">${this.fmt(t.sleeping)}</div><div class="dev-tenant-cap">dormidos</div></div>
        </div>
      </div>`;
  }

  // ── Consumo por org ───────────────────────────────────────────────────
  renderByOrg(fin) {
    const el = document.getElementById('cmdByOrg');
    if (!el) return;
    if (!fin || fin.is_lead === false) { el.innerHTML = this.leadOnly(); return; }
    const rows = fin.by_org || [];
    if (!rows.length) { el.innerHTML = this.noData('Sin consumo por org en 30d.'); return; }
    el.innerHTML = `
      <table class="dev-table dev-table-dense">
        <thead><tr><th>Org</th><th>Plan</th><th class="num">Créditos · 30d</th><th class="num">Runs · 30d</th><th class="num">Saldo</th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const avail = Number(r.credits_available || 0), total = Number(r.credits_total || 0);
            const ratio = total > 0 ? avail / total : 1;
            const lvl = ratio < 0.10 ? 'crit' : ratio < 0.25 ? 'warn' : 'ok';
            return `<tr>
              <td class="dev-cell-flow">${this.escapeHtml(r.name || '—')}</td>
              <td class="dev-cell-owner">${this.escapeHtml(r.plan || '—')}</td>
              <td class="num">${this.fmt(r.credits_30d)}</td>
              <td class="num">${this.fmt(r.runs_30d)}</td>
              <td class="num"><span class="dev-success-badge level-${lvl}">${this.fmtCompact(avail)}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  // ──────────────────────────────────────────────────────────────────────
  // SVG helpers (vanilla, sin librerías)
  // ──────────────────────────────────────────────────────────────────────
  svgGauge(value) {
    const v = (value == null || isNaN(value)) ? null : Math.max(0, Math.min(100, Number(value)));
    const r = 42, cx = 52, cy = 52, c = 2 * Math.PI * r;
    const off = v == null ? c : c * (1 - v / 100);
    const accent = 'var(--dev-rank-accent, #7C83FF)';
    const text = v == null ? '—' : Math.round(v) + '%';
    return `
      <svg class="dev-gauge-svg" width="104" height="104" viewBox="0 0 104 104" role="img" aria-label="${text}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accent}" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 ${cx} ${cy})"/>
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
          class="dev-gauge-text">${text}</text>
      </svg>`;
  }

  svgDonut(segments, centerText, centerSub) {
    const total = segments.reduce((s, x) => s + Math.max(0, Number(x.value || 0)), 0);
    const r = 46, cx = 60, cy = 60, c = 2 * Math.PI * r, sw = 14;
    let acc = 0;
    const arcs = total > 0 ? segments.map(s => {
      const frac = Math.max(0, Number(s.value || 0)) / total;
      const dash = `${(c * frac).toFixed(1)} ${(c * (1 - frac)).toFixed(1)}`;
      const off = -(c * acc);
      acc += frac;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}"
        stroke-dasharray="${dash}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    }).join('') : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${sw}"/>`;
    return `
      <svg class="dev-donut-svg" width="120" height="120" viewBox="0 0 120 120" role="img">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${sw}"/>
        ${arcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" dominant-baseline="central" class="dev-donut-ctext">${this.escapeHtml(centerText)}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" dominant-baseline="central" class="dev-donut-csub">${this.escapeHtml(centerSub || '')}</text>
      </svg>`;
  }

  svgArea(values, labels) {
    const W = 600, H = 180, pad = 8;
    const n = values.length;
    const max = Math.max(1, ...values);
    const stepX = n > 1 ? (W - pad * 2) / (n - 1) : 0;
    const y = v => H - pad - (v / max) * (H - pad * 2);
    const x = i => pad + i * stepX;
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p).join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${(H - pad).toFixed(1)} L${x(0).toFixed(1)},${(H - pad).toFixed(1)} Z`;
    const accent = 'var(--dev-rank-accent, #7C83FF)';
    const last = values[n - 1];
    return `
      <svg class="dev-area-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Tráfico de scraping">
        <defs>
          <linearGradient id="cmdAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${accent}" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${area}" fill="url(#cmdAreaGrad)"/>
        <path d="${line}" fill="none" stroke="${accent}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
        <circle cx="${x(n - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3.5" fill="${accent}"/>
      </svg>
      <div class="dev-area-axis">
        <span>${this.shortDate(labels[0])}</span>
        <span>pico ${this.fmt(max)}/día</span>
        <span>${this.shortDate(labels[n - 1])}</span>
      </div>`;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Skeletons / estados
  // ──────────────────────────────────────────────────────────────────────
  _skeletonAttention() { return `<div class="dev-attention-empty loading">Cargando alertas…</div>`; }
  _skeletonGauges() { return Array.from({ length: 5 }, () => `<div class="dev-gauge loading"><div class="dev-gauge-svg sk"></div></div>`).join(''); }
  _skeletonKpis() { return Array.from({ length: 6 }, () => `<div class="dev-kpi-card loading"><div class="dev-kpi-value">—</div></div>`).join(''); }
  leadOnly() { return `<div class="dev-attention-empty"><i class="fas fa-lock"></i> Vista global — requiere rol lead.</div>`; }
  noData(msg) { return `<div class="dev-nodata"><i class="fas fa-circle-info"></i> ${this.escapeHtml(msg)}</div>`; }

  // ──────────────────────────────────────────────────────────────────────
  // Formato
  // ──────────────────────────────────────────────────────────────────────
  palette(i) {
    const p = ['#7C83FF', '#22c55e', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444', '#14b8a6', '#eab308'];
    return p[i % p.length];
  }
  fmt(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-CO');
  }
  fmtCompact(n) {
    if (n == null || isNaN(n)) return '—';
    n = Number(n);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  relTime(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 5) return 'ahora';
    if (s < 60) return `hace ${s}s`;
    const m = Math.round(s / 60);
    return `hace ${m}m`;
  }
  shortDate(d) {
    if (!d) return '';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    } catch (_) { return ''; }
  }

  async onLeave() { /* teardown live: lo hace destroy() de BaseView */ }
}

window.DevDashboardView = DevDashboardView;
