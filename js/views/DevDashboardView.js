/**
 * DevDashboardView — Centro de mando del portal /dev
 *
 * Layout en zonas (de urgencia operativa a contexto):
 *   1. Tira de salud  — semáforos agregados (sistema, integraciones, errores, provisioning)
 *   2. Atención hoy   — cards accionables que solo aparecen si hay ítems
 *   3. KPIs           — números reales de la plataforma con sparkline
 *   4. Top flujos     — tabla densa de los flows más usados (24h)
 *   5. Actividad      — timeline mixto (logs + provisioning)
 *   6. Quick actions  — atajos al resto de herramientas /dev
 *
 * Visibilidad por rol:
 *   - Lead (profiles.dev_role='lead')      → datos globales de toda la plataforma
 *   - Dev  (profiles.is_developer=true)    → solo lo suyo; secciones admin-only ocultas
 */
class DevDashboardView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.isLead = false;
    this.myFlowIds = [];
  }

  // ============================================================
  // Render shell
  // ============================================================
  renderHTML() {
    return `
      <div class="dev-dashboard-container dev-dashboard-v2">
        <!-- Header -->
        <header class="dev-dashboard-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title">
              <i class="fas fa-gauge-high"></i>
              <span id="devHeaderTitle">Dashboard</span>
            </h1>
            <p class="dev-header-subtitle" id="devHeaderSubtitle">Cargando vista…</p>
          </div>
          <div class="dev-header-actions" id="devHeaderActions">
            <!-- botones inyectados según rol -->
          </div>
        </header>

        <!-- Zona 1: Tira de salud -->
        <section class="dev-health-strip" id="devHealthStrip" aria-label="Salud del sistema">
          ${this.renderHealthSkeleton()}
        </section>

        <!-- Zona 2: Atención hoy -->
        <section class="dev-attention" aria-label="Necesita tu atención">
          <div class="dev-section-header">
            <h2 class="dev-section-title">
              <i class="fas fa-bell"></i> Necesita tu atención
            </h2>
            <span class="dev-section-meta" id="devAttentionMeta">—</span>
          </div>
          <div class="dev-attention-grid" id="devAttentionGrid">
            <div class="dev-loading"><i class="fas fa-spinner fa-spin"></i><span>Cargando alertas…</span></div>
          </div>
        </section>

        <!-- Zona 3: KPIs -->
        <section class="dev-kpis" aria-label="Plataforma en cifras">
          <div class="dev-section-header">
            <h2 class="dev-section-title">
              <i class="fas fa-chart-simple"></i> Plataforma en cifras
            </h2>
            <span class="dev-section-meta">últimos 7 días</span>
          </div>
          <div class="dev-kpi-grid" id="devKpiGrid">
            ${this.renderKpiSkeleton()}
          </div>
        </section>

        <!-- Zona 4: Top flujos -->
        <section class="dev-section dev-top-flows">
          <div class="dev-section-header">
            <h2 class="dev-section-title">
              <i class="fas fa-fire"></i> Top flujos · 24h
            </h2>
            <a href="/dev/flows" class="dev-section-link" id="devTopFlowsLink">Ver todos →</a>
          </div>
          <div class="dev-table-container">
            <table class="dev-table dev-table-dense" id="devTopFlowsTable">
              <thead>
                <tr>
                  <th>Flujo</th>
                  <th id="devTopOwnerCol">Dueño</th>
                  <th class="num">Runs</th>
                  <th class="num">Éxito</th>
                  <th class="num">Tokens</th>
                  <th>Último estado</th>
                </tr>
              </thead>
              <tbody id="devTopFlowsBody">
                <tr><td colspan="6" class="dev-table-empty"><i class="fas fa-spinner fa-spin"></i> Cargando…</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Zona 5: Actividad reciente -->
        <section class="dev-section dev-activity">
          <div class="dev-section-header">
            <h2 class="dev-section-title">
              <i class="fas fa-stream"></i> Actividad reciente
            </h2>
            <a href="/dev/logs" class="dev-section-link">Ir a logs →</a>
          </div>
          <ul class="dev-activity-list" id="devActivityList">
            <li class="dev-loading"><i class="fas fa-spinner fa-spin"></i><span>Cargando actividad…</span></li>
          </ul>
        </section>

      </div>
    `;
  }

  renderHealthSkeleton() {
    return `
      <div class="dev-health-pill loading"><span class="dev-health-dot"></span><span class="dev-health-label">Sistema</span><span class="dev-health-value">—</span></div>
      <div class="dev-health-pill loading"><span class="dev-health-dot"></span><span class="dev-health-label">Integraciones</span><span class="dev-health-value">—</span></div>
      <div class="dev-health-pill loading"><span class="dev-health-dot"></span><span class="dev-health-label">Errores 24h</span><span class="dev-health-value">—</span></div>
      <div class="dev-health-pill loading"><span class="dev-health-dot"></span><span class="dev-health-label">Provisioning</span><span class="dev-health-value">—</span></div>
    `;
  }

  renderKpiSkeleton() {
    const cells = ['Usuarios', 'Organizaciones', 'Flujos publicados', 'Runs 24h', 'Créditos 7d', 'Tasa de error 24h'];
    return cells.map(label => `
      <div class="dev-kpi-card loading">
        <span class="dev-kpi-label">${label}</span>
        <span class="dev-kpi-value">—</span>
        <span class="dev-kpi-sub">&nbsp;</span>
      </div>
    `).join('');
  }

  // ============================================================
  // Init
  // ============================================================
  async init() {
    await this.initSupabase();
    this.detectRole();
    this.renderHeader();
    if (!this.supabase || !this.userId) {
      this.showError('No se pudo inicializar la sesión');
      return;
    }

    if (!this.isLead) {
      // dev no-lead: necesitamos sus flow ids primero
      await this.loadMyFlowIds();
    }

    this.bindLinkInterception();

    // Cargar zonas en paralelo (cada una falla aislada)
    await Promise.allSettled([
      this.loadHealth(),
      this.loadAttention(),
      this.loadKPIs(),
      this.loadTopFlows(),
      this.loadActivity()
    ]);
  }

  /**
   * Intenta ejecutar un RPC. Si falla por cualquier razón (no aplicado,
   * permisos, etc.) devuelve null y el caller usa el fallback legacy.
   */
  async tryRpc(name, args) {
    try {
      const { data, error } = await this.supabase.rpc(name, args || {});
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn(`[DevDashboard] RPC ${name} no disponible (${e?.message || e}); usando queries directas`);
      return null;
    }
  }

  /**
   * Intercepta clicks en <a href="/..."> internos para usar el router SPA.
   */
  bindLinkInterception() {
    const root = this.container || document.querySelector('.dev-dashboard-v2');
    if (!root) return;
    root.addEventListener('click', (ev) => {
      const a = ev.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (a.target === '_blank' || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      ev.preventDefault();
      if (window.router) window.router.navigate(href);
      else window.location.href = href;
    });
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('[DevDashboard] init supabase error', e);
    }
  }

  detectRole() {
    this.isLead = !!(window.authService && window.authService.isLead && window.authService.isLead());
  }

  async loadMyFlowIds() {
    try {
      const { data } = await this.supabase
        .from('content_flows')
        .select('id')
        .eq('owner_id', this.userId);
      this.myFlowIds = (data || []).map(r => r.id);
    } catch (e) {
      this.myFlowIds = [];
    }
  }

  // ============================================================
  // Header / Quick Actions
  // ============================================================
  renderHeader() {
    const titleEl = document.getElementById('devHeaderTitle');
    const subEl = document.getElementById('devHeaderSubtitle');
    const actEl = document.getElementById('devHeaderActions');

    if (titleEl) titleEl.textContent = this.isLead ? 'Centro de mando' : 'Mi panel de desarrollo';
    if (subEl)   subEl.textContent   = this.isLead
      ? 'Salud global de la plataforma, usuarios y flujos.'
      : 'Salud y actividad de tus flujos.';

    if (!actEl) return;
    const buttons = [];
    if (this.isLead) {
      buttons.push(`<a href="/dev/provisioning/users" class="btn btn-primary"><i class="fas fa-user-plus"></i> Provisionar usuario</a>`);
      buttons.push(`<a href="/dev/builder" class="btn btn-secondary"><i class="fas fa-plus"></i> Nuevo flujo</a>`);
    } else {
      buttons.push(`<a href="/dev/builder" class="btn btn-primary"><i class="fas fa-plus"></i> Nuevo flujo</a>`);
    }
    actEl.innerHTML = buttons.join('');
  }

  // ============================================================
  // Zona 1 — Tira de salud
  // ============================================================
  async loadHealth() {
    const data = await this.tryRpc('dev_dashboard_health');
    if (data) {
      this.renderHealthFromRpc(data);
      return;
    }
    return this.loadHealthLegacy();
  }

  renderHealthFromRpc(d) {
    const el = document.getElementById('devHealthStrip');
    if (!el) return;
    const pills = [];
    if (d.is_lead) {
      pills.push(this.healthPill('fa-heart-pulse',          'Sistema',       this.healthLevel(d.unhealthy_flows, 0, 1),    this.fmtCount(d.unhealthy_flows, 'flujo no sano', 'flujos no sanos')));
      pills.push(this.healthPill('fa-triangle-exclamation', 'Errores 24h',   this.healthLevel(d.recent_errors_24h, 5, 20), this.fmtCount(d.recent_errors_24h, 'evento', 'eventos')));
      pills.push(this.healthPill('fa-server',               'Provisioning',  this.healthLevel(d.prov_failures_7d, 0, 2),   this.fmtCount(d.prov_failures_7d, 'incidente 7d', 'incidentes 7d')));
    } else {
      pills.push(this.healthPill('fa-triangle-exclamation', 'Errores 24h',   this.healthLevel(d.recent_errors_24h, 5, 20), this.fmtCount(d.recent_errors_24h, 'evento', 'eventos')));
    }
    el.innerHTML = pills.join('');
  }

  async loadHealthLegacy() {
    const el = document.getElementById('devHealthStrip');
    if (!el) return;

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const safeCount = async (q) => {
      try { const { count } = await q; return count ?? 0; } catch { return null; }
    };

    let unhealthyFlows = 0;
    let recentErrors = 0;
    let provisioningFails = 0;

    if (this.isLead) {
      const [a, c, d] = await Promise.all([
        safeCount(this.supabase.from('flow_technical_details').select('id', { count: 'exact', head: true }).eq('is_healthy', false)),
        safeCount(this.supabase.from('developer_logs').select('id', { count: 'exact', head: true })
          .in('severity', ['error', 'critical']).gte('created_at', dayAgo)),
        safeCount(this.supabase.from('provisioning_events').select('id', { count: 'exact', head: true })
          .in('event_type', ['health_check_failed', 'provisioning_failed', 'server_degraded']).gte('created_at', sevenDaysAgo))
      ]);
      unhealthyFlows = a; recentErrors = c; provisioningFails = d;
    } else {
      if (this.myFlowIds.length > 0) {
        recentErrors = await safeCount(this.supabase.from('developer_logs')
          .select('id', { count: 'exact', head: true })
          .in('flow_id', this.myFlowIds)
          .in('severity', ['error', 'critical'])
          .gte('created_at', dayAgo));
      }
    }

    const pills = [];
    if (this.isLead) {
      pills.push(this.healthPill('fa-heart-pulse', 'Sistema',         this.healthLevel(unhealthyFlows, 0, 1),     this.fmtCount(unhealthyFlows, 'flujo no sano', 'flujos no sanos')));
      pills.push(this.healthPill('fa-triangle-exclamation', 'Errores 24h', this.healthLevel(recentErrors, 5, 20),  this.fmtCount(recentErrors, 'evento', 'eventos')));
      pills.push(this.healthPill('fa-server', 'Provisioning', this.healthLevel(provisioningFails, 0, 2), this.fmtCount(provisioningFails, 'incidente 7d', 'incidentes 7d')));
    } else {
      pills.push(this.healthPill('fa-triangle-exclamation', 'Errores 24h', this.healthLevel(recentErrors, 5, 20),  this.fmtCount(recentErrors, 'evento', 'eventos')));
    }
    el.innerHTML = pills.join('');
  }

  healthLevel(value, warnAt, critAt) {
    if (value === null) return 'unknown';
    if (value > critAt) return 'critical';
    if (value > warnAt) return 'warn';
    return 'ok';
  }

  healthPill(icon, label, level, valueText) {
    return `
      <div class="dev-health-pill level-${level}">
        <span class="dev-health-dot"></span>
        <i class="fas ${icon}"></i>
        <span class="dev-health-label">${label}</span>
        <span class="dev-health-value">${valueText}</span>
      </div>
    `;
  }

  // ============================================================
  // Zona 2 — Atención hoy
  // ============================================================
  async loadAttention() {
    const data = await this.tryRpc('dev_dashboard_attention');
    if (data) {
      this.renderAttentionFromRpc(data);
      return;
    }
    return this.loadAttentionLegacy();
  }

  renderAttentionFromRpc(d) {
    const grid = document.getElementById('devAttentionGrid');
    const meta = document.getElementById('devAttentionMeta');
    if (!grid) return;

    const cards = [];

    if (d.is_lead) {
      const u = d.unverified_users?.count ?? 0;
      if (u > 0) cards.push(this.attentionCard({
        tone: 'info', icon: 'fa-user-clock', title: 'Usuarios sin verificar',
        count: u, subtitle: 'Forms incompletos en perfil',
        href: '/dev/provisioning/users', cta: 'Provisioning →'
      }));

      const lc = d.low_credits_orgs || {};
      if ((lc.count ?? 0) > 0) cards.push(this.attentionCard({
        tone: 'warn', icon: 'fa-coins', title: 'Créditos bajos',
        count: lc.count, subtitle: '< 10% disponibles',
        items: (lc.preview || []).map(c => `${c.credits_available} / ${c.credits_total} créditos`),
        href: '/dev/lead/team', cta: 'Revisar orgs →'
      }));

      const ce = d.critical_errors_24h || {};
      if ((ce.count ?? 0) > 0) cards.push(this.attentionCard({
        tone: 'crit', icon: 'fa-circle-exclamation', title: 'Errores críticos 24h',
        count: ce.count, subtitle: 'Revisar y reproducir',
        items: (ce.preview || []).map(l => `${l.severity === 'critical' ? '🔴' : '🟠'} ${this.escapeHtml(l.flow_name || 'Sin flujo')} — ${this.escapeHtml(this.truncateText(l.error_message || '', 50))}`),
        href: '/dev/logs', cta: 'Ver logs →'
      }));

      const pf = d.provisioning_failures_24h || {};
      if ((pf.count ?? 0) > 0) cards.push(this.attentionCard({
        tone: 'crit', icon: 'fa-server', title: 'Provisioning con fallas',
        count: pf.count, subtitle: 'Health checks fallidos en 24h',
        items: (pf.preview || []).map(p => `${this.escapeHtml(p.event_type)} — ${this.escapeHtml(this.truncateText(p.message || '', 50))}`),
        href: '/dev/lead/team', cta: 'Investigar →'
      }));
    } else {
      const er = d.my_errors_24h || {};
      if ((er.count ?? 0) > 0) cards.push(this.attentionCard({
        tone: 'crit', icon: 'fa-circle-exclamation', title: 'Errores en tus flujos',
        count: er.count, subtitle: 'Últimas 24h',
        items: (er.preview || []).map(l => `${l.severity === 'critical' ? '🔴' : '🟠'} ${this.escapeHtml(l.flow_name || 'Sin flujo')} — ${this.escapeHtml(this.truncateText(l.error_message || '', 50))}`),
        href: '/dev/logs', cta: 'Ver logs →'
      }));

      const un = d.my_unread_notifications || {};
      if ((un.count ?? 0) > 0) cards.push(this.attentionCard({
        tone: 'info', icon: 'fa-bell', title: 'Notificaciones sin leer',
        count: un.count, subtitle: 'Mensajes del sistema para ti',
        items: (un.preview || []).map(n => this.escapeHtml(this.truncateText(n.title || '', 60))),
        cta: ''
      }));

      // Fallback informativo si dev sin flows
      if (cards.length === 0 && this.myFlowIds.length === 0) {
        cards.push(this.attentionCard({
          tone: 'info', icon: 'fa-lightbulb', title: 'Aún no tienes flujos',
          count: 0, subtitle: 'Crea tu primer flujo en el Builder',
          href: '/dev/builder', cta: 'Ir al Builder →'
        }));
      }
    }

    if (meta) meta.textContent = cards.length === 0 ? 'todo en orden' : `${cards.length} ${cards.length === 1 ? 'pendiente' : 'pendientes'}`;
    grid.innerHTML = cards.length === 0
      ? `<div class="dev-attention-empty"><i class="fas fa-circle-check"></i><span>No hay nada pendiente — buen trabajo.</span></div>`
      : cards.join('');
  }

  async loadAttentionLegacy() {
    const grid = document.getElementById('devAttentionGrid');
    const meta = document.getElementById('devAttentionMeta');
    if (!grid) return;

    const cards = [];
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    if (this.isLead) {
      // Cards Lead-only
      const tasks = await Promise.allSettled([
        this.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('form_verified', false),
        this.supabase.from('organization_credits').select('organization_id, credits_available, credits_total').limit(50),
        this.supabase.from('developer_logs').select('id, error_message, severity, flow_id, created_at, content_flows(name)', { count: 'exact' })
          .in('severity', ['error', 'critical']).gte('created_at', dayAgo).order('created_at', { ascending: false }).limit(3),
        this.supabase.from('provisioning_events').select('id, event_type, organization_id, created_at, message', { count: 'exact' })
          .in('event_type', ['provisioning_failed', 'health_check_failed']).gte('created_at', dayAgo).order('created_at', { ascending: false }).limit(3)
      ]);

      const [unverified, credits, errors, provFails] = tasks.map(t => t.status === 'fulfilled' ? t.value : null);

      // Card: usuarios sin verificar
      const unverifiedCount = unverified?.count ?? 0;
      if (unverifiedCount > 0) {
        cards.push(this.attentionCard({
          tone: 'info',
          icon: 'fa-user-clock',
          title: 'Usuarios sin verificar',
          count: unverifiedCount,
          subtitle: 'Forms incompletos en perfil',
          href: '/dev/provisioning/users',
          cta: 'Provisioning →'
        }));
      }

      // Card: orgs con créditos bajos (filtro client-side, no se puede comparar columnas en .lt)
      const lowCredits = (credits?.data || []).filter(r => r.credits_total > 0 && r.credits_available / r.credits_total < 0.1);
      if (lowCredits.length > 0) {
        cards.push(this.attentionCard({
          tone: 'warn',
          icon: 'fa-coins',
          title: 'Créditos bajos',
          count: lowCredits.length,
          subtitle: '< 10% disponibles',
          items: lowCredits.slice(0, 3).map(c => `${c.credits_available} / ${c.credits_total} créditos`),
          href: '/dev/lead/team',
          cta: 'Revisar orgs →'
        }));
      }

      // Card: errores críticos
      const errCount = errors?.count ?? 0;
      if (errCount > 0) {
        const items = (errors?.data || []).map(l =>
          `${l.severity === 'critical' ? '🔴' : '🟠'} ${this.escapeHtml(l.content_flows?.name || 'Sin flujo')} — ${this.escapeHtml(this.truncateText(l.error_message, 50))}`);
        cards.push(this.attentionCard({
          tone: 'crit',
          icon: 'fa-circle-exclamation',
          title: 'Errores críticos 24h',
          count: errCount,
          subtitle: 'Revisar y reproducir',
          items,
          href: '/dev/logs',
          cta: 'Ver logs →'
        }));
      }

      // Card: provisioning fallido
      const provCount = provFails?.count ?? 0;
      if (provCount > 0) {
        const items = (provFails?.data || []).map(p =>
          `${this.escapeHtml(p.event_type)} — ${this.escapeHtml(this.truncateText(p.message || '', 50))}`);
        cards.push(this.attentionCard({
          tone: 'crit',
          icon: 'fa-server',
          title: 'Provisioning con fallas',
          count: provCount,
          subtitle: 'Health checks fallidos en 24h',
          items,
          href: '/dev/lead/team',
          cta: 'Investigar →'
        }));
      }
    } else {
      // Dev no-lead: solo lo suyo
      if (this.myFlowIds.length === 0) {
        cards.push(this.attentionCard({
          tone: 'info',
          icon: 'fa-lightbulb',
          title: 'Aún no tienes flujos',
          count: 0,
          subtitle: 'Crea tu primer flujo en el Builder',
          href: '/dev/builder',
          cta: 'Ir al Builder →'
        }));
      } else {
        const tasks = await Promise.allSettled([
          this.supabase.from('developer_logs').select('id, error_message, severity, flow_id, created_at, content_flows(name)', { count: 'exact' })
            .in('flow_id', this.myFlowIds).in('severity', ['error', 'critical']).gte('created_at', dayAgo)
            .order('created_at', { ascending: false }).limit(3),
          this.supabase.from('developer_notifications').select('id, title, severity, flow_id, created_at', { count: 'exact' })
            .eq('recipient_user_id', this.userId).eq('is_read', false)
            .order('created_at', { ascending: false }).limit(3)
        ]);
        const [errors, notifs] = tasks.map(t => t.status === 'fulfilled' ? t.value : null);

        const errCount = errors?.count ?? 0;
        if (errCount > 0) {
          const items = (errors?.data || []).map(l =>
            `${l.severity === 'critical' ? '🔴' : '🟠'} ${this.escapeHtml(l.content_flows?.name || 'Sin flujo')} — ${this.escapeHtml(this.truncateText(l.error_message, 50))}`);
          cards.push(this.attentionCard({
            tone: 'crit',
            icon: 'fa-circle-exclamation',
            title: 'Errores en tus flujos',
            count: errCount,
            subtitle: 'Últimas 24h',
            items,
            href: '/dev/logs',
            cta: 'Ver logs →'
          }));
        }

        const notifCount = notifs?.count ?? 0;
        if (notifCount > 0) {
          const items = (notifs?.data || []).map(n => this.escapeHtml(this.truncateText(n.title, 60)));
          cards.push(this.attentionCard({
            tone: 'info',
            icon: 'fa-bell',
            title: 'Notificaciones sin leer',
            count: notifCount,
            subtitle: 'Mensajes del sistema para ti',
            items,
            cta: ''
          }));
        }
      }
    }

    if (meta) meta.textContent = cards.length === 0 ? 'todo en orden' : `${cards.length} ${cards.length === 1 ? 'pendiente' : 'pendientes'}`;
    grid.innerHTML = cards.length === 0
      ? `<div class="dev-attention-empty"><i class="fas fa-circle-check"></i><span>No hay nada pendiente — buen trabajo.</span></div>`
      : cards.join('');
  }

  attentionCard({ tone, icon, title, count, subtitle, items = [], href, cta }) {
    const itemsHtml = items.length > 0
      ? `<ul class="dev-attention-items">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
      : '';
    const ctaHtml = (href && cta)
      ? `<a class="dev-attention-cta" href="${href}">${cta}</a>`
      : '';
    return `
      <article class="dev-attention-card tone-${tone}">
        <header>
          <span class="dev-attention-icon"><i class="fas ${icon}"></i></span>
          <span class="dev-attention-count">${this.formatNumber(count)}</span>
        </header>
        <h3>${title}</h3>
        <p class="dev-attention-sub">${subtitle}</p>
        ${itemsHtml}
        ${ctaHtml}
      </article>
    `;
  }

  // ============================================================
  // Zona 3 — KPIs
  // ============================================================
  async loadKPIs() {
    const data = await this.tryRpc('dev_dashboard_kpis');
    if (data) {
      this.renderKPIsFromRpc(data);
      return;
    }
    return this.loadKPIsLegacy();
  }

  renderKPIsFromRpc(d) {
    const grid = document.getElementById('devKpiGrid');
    if (!grid) return;
    if (d.is_lead) {
      const cats = Array.isArray(d.flows_by_category) ? d.flows_by_category : [];
      grid.innerHTML = [
        this.kpiCard('Usuarios',                this.formatNumber(d.users_total ?? 0),         'totales en plataforma'),
        this.kpiCard('Organizaciones activas',  this.formatNumber(d.orgs_active ?? 0),         'sin eliminar'),
        this.kpiCard('Flujos totales',          this.formatNumber(d.flows_total ?? 0),         `${this.formatNumber(d.flows_published ?? 0)} publicados · ${this.formatNumber(d.flows_drafts ?? 0)} borradores`),
        this.kpiCard('Runs completados 24h',    this.formatNumber(d.runs_24h_completed ?? 0),  d.success_rate_24h != null ? `tasa éxito ${d.success_rate_24h}%` : '—'),
        this.kpiCard('Créditos consumidos',     this.formatNumber(d.credits_consumed_7d ?? 0), 'últimos 7 días'),
        this.kpiCard('Errores / runs 24h',      d.error_rate_24h != null ? `${d.error_rate_24h}%` : '—', `${this.formatNumber(d.errors_24h ?? 0)} eventos`),
        this.donutCard('Flujos por categoría', cats)
      ].join('');
    } else {
      const cats = Array.isArray(d.my_flows_by_category) ? d.my_flows_by_category : [];
      grid.innerHTML = [
        this.kpiCard('Mis flujos',     this.formatNumber(d.my_flows_total ?? 0),     `${this.formatNumber(d.my_flows_published ?? 0)} publicados · ${this.formatNumber(d.my_flows_drafts ?? 0)} borradores`),
        this.kpiCard('Runs 24h',       this.formatNumber(d.my_runs_24h_total ?? 0),  'todas ejecuciones'),
        this.kpiCard('Tasa éxito 24h', d.my_success_rate_24h != null ? `${d.my_success_rate_24h}%` : '—', `${this.formatNumber(d.my_runs_24h_completed ?? 0)} completados`),
        this.kpiCard('Errores 24h',    this.formatNumber(d.my_errors_24h ?? 0),      'severidad error/critical'),
        this.donutCard('Mis flujos por categoría', cats)
      ].join('');
    }
  }

  async loadKPIsLegacy() {
    const grid = document.getElementById('devKpiGrid');
    if (!grid) return;

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sevenAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    if (this.isLead) {
      const [users, orgs, totalFlows, published, runs24, credits7, errs24, runsTotal24, flowsCat] = await Promise.allSettled([
        this.supabase.from('profiles').select('id', { count: 'exact', head: true }),
        this.supabase.from('organizations').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        this.supabase.from('content_flows').select('id', { count: 'exact', head: true }),
        this.supabase.from('content_flows').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('created_at', dayAgo),
        // credit_usage usa credits_delta; los consumos son negativos.
        this.supabase.from('credit_usage').select('credits_delta').lt('credits_delta', 0).gte('created_at', sevenAgo),
        this.supabase.from('developer_logs').select('id', { count: 'exact', head: true }).in('severity', ['error', 'critical']).gte('created_at', dayAgo),
        this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
        this.supabase.from('content_flows').select('category_id, content_categories(name)').limit(2000)
      ]);

      const usersN     = users.value?.count ?? 0;
      const orgsN      = orgs.value?.count ?? 0;
      const totN       = totalFlows.value?.count ?? 0;
      const pubN       = published.value?.count ?? 0;
      const runs24N    = runs24.value?.count ?? 0;
      const totRuns24  = runsTotal24.value?.count ?? 0;
      const credits7N  = (credits7.value?.data || []).reduce((s, r) => s + Math.abs(Number(r.credits_delta) || 0), 0);
      const errs24N    = errs24.value?.count ?? 0;
      const successPct = totRuns24 > 0 ? Math.round((runs24N / totRuns24) * 100) : null;
      const errorPct   = totRuns24 > 0 ? Math.round((errs24N / totRuns24) * 100) : null;
      const cats       = this.aggregateCategories(flowsCat.value?.data || []);

      grid.innerHTML = [
        this.kpiCard('Usuarios', this.formatNumber(usersN), 'totales en plataforma'),
        this.kpiCard('Organizaciones activas', this.formatNumber(orgsN), 'sin eliminar'),
        this.kpiCard('Flujos totales', this.formatNumber(totN), `${this.formatNumber(pubN)} publicados · ${this.formatNumber(Math.max(totN - pubN, 0))} borradores`),
        this.kpiCard('Runs completados 24h', this.formatNumber(runs24N), successPct !== null ? `tasa éxito ${successPct}%` : '—'),
        this.kpiCard('Créditos consumidos', this.formatNumber(credits7N), 'últimos 7 días'),
        this.kpiCard('Errores / runs 24h', errorPct !== null ? `${errorPct}%` : '—', `${this.formatNumber(errs24N)} eventos`),
        this.donutCard('Flujos por categoría', cats)
      ].join('');
    } else {
      // Dev no-lead — limitar a sus datos
      const ids = this.myFlowIds;
      const [myFlows, myPub, myRuns, myCompleted, myErrs, myRunsTotal, myCats] = await Promise.allSettled([
        this.supabase.from('content_flows').select('id', { count: 'exact', head: true }).eq('owner_id', this.userId),
        this.supabase.from('content_flows').select('id', { count: 'exact', head: true }).eq('owner_id', this.userId).eq('status', 'published'),
        ids.length ? this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).in('flow_id', ids).gte('created_at', dayAgo) : Promise.resolve({ count: 0 }),
        ids.length ? this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).in('flow_id', ids).eq('status', 'completed').gte('created_at', dayAgo) : Promise.resolve({ count: 0 }),
        ids.length ? this.supabase.from('developer_logs').select('id', { count: 'exact', head: true }).in('flow_id', ids).in('severity', ['error', 'critical']).gte('created_at', dayAgo) : Promise.resolve({ count: 0 }),
        ids.length ? this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).in('flow_id', ids).gte('created_at', dayAgo) : Promise.resolve({ count: 0 }),
        this.supabase.from('content_flows').select('category_id, content_categories(name)').eq('owner_id', this.userId).limit(500)
      ]);

      const flowsN = myFlows.value?.count ?? 0;
      const pubN   = myPub.value?.count ?? 0;
      const runs24 = (myRuns.value?.count ?? myRuns.value ?? 0);
      const ok24   = (myCompleted.value?.count ?? myCompleted.value ?? 0);
      const errs24 = (myErrs.value?.count ?? myErrs.value ?? 0);
      const tot24  = (myRunsTotal.value?.count ?? myRunsTotal.value ?? 0);
      const successPct = tot24 > 0 ? Math.round((ok24 / tot24) * 100) : null;
      const cats = this.aggregateCategories(myCats.value?.data || []);

      grid.innerHTML = [
        this.kpiCard('Mis flujos', this.formatNumber(flowsN), `${this.formatNumber(pubN)} publicados · ${this.formatNumber(Math.max(flowsN - pubN, 0))} borradores`),
        this.kpiCard('Runs 24h', this.formatNumber(runs24), 'todas ejecuciones'),
        this.kpiCard('Tasa éxito 24h', successPct !== null ? `${successPct}%` : '—', `${this.formatNumber(ok24)} completados`),
        this.kpiCard('Errores 24h', this.formatNumber(errs24), 'severidad error/critical'),
        this.donutCard('Mis flujos por categoría', cats)
      ].join('');
    }
  }

  /** Agrupa filas {category_id, content_categories:{name}} en [{name, count}] ordenado desc. */
  aggregateCategories(rows) {
    const m = new Map();
    for (const r of rows) {
      const id = r.category_id || '__none__';
      const name = r.content_categories?.name || 'Sin categoría';
      if (!m.has(id)) m.set(id, { category_id: r.category_id, name, count: 0 });
      m.get(id).count += 1;
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }

  kpiCard(label, value, sub) {
    return `
      <div class="dev-kpi-card">
        <span class="dev-kpi-label">${label}</span>
        <span class="dev-kpi-value">${value}</span>
        <span class="dev-kpi-sub">${sub}</span>
      </div>
    `;
  }

  /** Card con donut SVG + leyenda. cats: [{name, count}]. */
  donutCard(label, cats) {
    const total = cats.reduce((s, c) => s + (c.count || 0), 0);
    const palette = ['#e09145', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6', '#64748b'];
    if (total === 0) {
      return `
        <div class="dev-kpi-card dev-kpi-donut">
          <span class="dev-kpi-label">${label}</span>
          <div class="dev-donut-empty"><i class="fas fa-chart-pie"></i> Sin datos</div>
        </div>
      `;
    }
    const top = cats.slice(0, 6);
    const otherCount = cats.slice(6).reduce((s, c) => s + (c.count || 0), 0);
    if (otherCount > 0) top.push({ name: 'Otros', count: otherCount });

    const svg = this.donutSVG(top, palette, 96, 14);
    const legend = top.map((c, i) => `
      <li>
        <span class="dev-donut-swatch" style="background:${palette[i % palette.length]}"></span>
        <span class="dev-donut-name" title="${this.escapeHtml(c.name)}">${this.escapeHtml(c.name)}</span>
        <span class="dev-donut-count">${this.formatNumber(c.count)}</span>
      </li>
    `).join('');

    return `
      <div class="dev-kpi-card dev-kpi-donut">
        <span class="dev-kpi-label">${label}</span>
        <div class="dev-donut-body">
          ${svg}
          <ul class="dev-donut-legend">${legend}</ul>
        </div>
      </div>
    `;
  }

  /** Devuelve un SVG donut. data: [{count}], total se calcula adentro. */
  donutSVG(data, palette, size = 96, thickness = 14) {
    const total = data.reduce((s, c) => s + (c.count || 0), 0);
    const r = (size - thickness) / 2;
    const cx = size / 2, cy = size / 2;
    const C = 2 * Math.PI * r;
    let offset = 0;
    const segments = data.map((c, i) => {
      const frac = (c.count || 0) / total;
      const len = frac * C;
      const seg = `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
          stroke="${palette[i % palette.length]}" stroke-width="${thickness}"
          stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})"/>
      `;
      offset += len;
      return seg;
    }).join('');
    return `
      <svg class="dev-donut-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="Distribución por categoría">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${thickness}"/>
        ${segments}
        <text x="${cx}" y="${cy + 4}" text-anchor="middle"
              font-size="14" font-weight="700" fill="currentColor"
              font-family="system-ui, sans-serif">${this.formatNumber(total)}</text>
      </svg>
    `;
  }

  // ============================================================
  // Zona 4 — Top flujos 24h
  // ============================================================
  async loadTopFlows() {
    // Configurar columnas/links según rol siempre
    const ownerCol = document.getElementById('devTopOwnerCol');
    const link = document.getElementById('devTopFlowsLink');
    if (!this.isLead) {
      if (ownerCol) ownerCol.style.display = 'none';
      if (link) link.href = '/dev/flows';
    } else if (link) {
      link.href = '/dev/lead/flows';
    }

    const data = await this.tryRpc('dev_dashboard_top_flows', { p_hours: 24, p_limit: 10 });
    if (data) {
      this.renderTopFlowsFromRpc(data);
      return;
    }
    return this.loadTopFlowsLegacy();
  }

  renderTopFlowsFromRpc(d) {
    const tbody = document.getElementById('devTopFlowsBody');
    if (!tbody) return;
    const rows = Array.isArray(d.rows) ? d.rows : [];
    const cols = this.isLead ? 6 : 5;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols}" class="dev-table-empty"><i class="fas fa-inbox"></i> Sin runs en 24h</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(t => {
      const successPct = t.success_pct ?? 0;
      const lvl = successPct >= 90 ? 'ok' : successPct >= 70 ? 'warn' : 'crit';
      const ownerCell = this.isLead
        ? `<td class="dev-cell-owner">${this.escapeHtml(t.owner_name || '—')}</td>`
        : '';
      const lastBadge = `<span class="dev-run-status status-${t.last_status}">${this.getRunStatusLabel(t.last_status)}</span>`;
      return `
        <tr>
          <td class="dev-cell-flow"><a href="/dev/builder?flow=${t.flow_id}">${this.escapeHtml(t.flow_name || 'Sin nombre')}</a></td>
          ${ownerCell}
          <td class="num">${this.formatNumber(t.total)}</td>
          <td class="num"><span class="dev-success-badge level-${lvl}">${successPct}%</span></td>
          <td class="num">${this.formatNumber(t.tokens)}</td>
          <td>${lastBadge}</td>
        </tr>
      `;
    }).join('');
  }

  async loadTopFlowsLegacy() {
    const tbody = document.getElementById('devTopFlowsBody');
    if (!tbody) return;

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    let runs;
    try {
      let q = this.supabase
        .from('flow_runs')
        .select('id, flow_id, status, tokens_consumed, content_flows(name, owner_id)')
        .gte('created_at', dayAgo)
        .order('created_at', { ascending: false })
        .limit(500);
      if (!this.isLead) {
        if (this.myFlowIds.length === 0) {
          tbody.innerHTML = `<tr><td colspan="${this.isLead ? 6 : 5}" class="dev-table-empty"><i class="fas fa-inbox"></i> Sin runs en 24h</td></tr>`;
          return;
        }
        q = q.in('flow_id', this.myFlowIds);
      }
      const res = await q;
      runs = res.data || [];
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="${this.isLead ? 6 : 5}" class="dev-table-error"><i class="fas fa-triangle-exclamation"></i> Error cargando ejecuciones</td></tr>`;
      return;
    }

    if (runs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${this.isLead ? 6 : 5}" class="dev-table-empty"><i class="fas fa-inbox"></i> Sin runs en 24h</td></tr>`;
      return;
    }

    // Agregación por flow_id
    const byFlow = new Map();
    for (const r of runs) {
      const k = r.flow_id;
      if (!byFlow.has(k)) {
        byFlow.set(k, {
          flow_id: k,
          name: r.content_flows?.name || 'Sin nombre',
          owner_id: r.content_flows?.owner_id,
          total: 0,
          completed: 0,
          failed: 0,
          tokens: 0,
          lastStatus: r.status
        });
      }
      const agg = byFlow.get(k);
      agg.total += 1;
      if (r.status === 'completed') agg.completed += 1;
      if (r.status === 'failed') agg.failed += 1;
      agg.tokens += r.tokens_consumed || 0;
    }

    const top = Array.from(byFlow.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Resolver dueños si Lead
    let ownerMap = new Map();
    if (this.isLead) {
      const ownerIds = [...new Set(top.map(t => t.owner_id).filter(Boolean))];
      if (ownerIds.length > 0) {
        try {
          const { data } = await this.supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', ownerIds);
          (data || []).forEach(p => ownerMap.set(p.id, p.full_name || p.email || '—'));
        } catch (_) { /* ignore */ }
      }
    }

    tbody.innerHTML = top.map(t => {
      const successPct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0;
      const lvl = successPct >= 90 ? 'ok' : successPct >= 70 ? 'warn' : 'crit';
      const ownerCell = this.isLead
        ? `<td class="dev-cell-owner">${this.escapeHtml(ownerMap.get(t.owner_id) || '—')}</td>`
        : '';
      const lastBadge = `<span class="dev-run-status status-${t.lastStatus}">${this.getRunStatusLabel(t.lastStatus)}</span>`;
      return `
        <tr>
          <td class="dev-cell-flow">
            <a href="/dev/builder?flow=${t.flow_id}">${this.escapeHtml(t.name)}</a>
          </td>
          ${ownerCell}
          <td class="num">${this.formatNumber(t.total)}</td>
          <td class="num"><span class="dev-success-badge level-${lvl}">${successPct}%</span></td>
          <td class="num">${this.formatNumber(t.tokens)}</td>
          <td>${lastBadge}</td>
        </tr>
      `;
    }).join('');
  }

  // ============================================================
  // Zona 5 — Actividad reciente
  // ============================================================
  async loadActivity() {
    const data = await this.tryRpc('dev_dashboard_activity', { p_limit: 20 });
    if (data) {
      this.renderActivityFromRpc(data);
      return;
    }
    return this.loadActivityLegacy();
  }

  renderActivityFromRpc(d) {
    const list = document.getElementById('devActivityList');
    if (!list) return;
    const rows = Array.isArray(d.rows) ? d.rows : [];
    if (rows.length === 0) {
      list.innerHTML = `<li class="dev-empty-state"><i class="fas fa-circle-info"></i><span>Sin actividad reciente</span></li>`;
      return;
    }
    list.innerHTML = rows.map(ev => this.renderActivityItem(ev)).join('');
  }

  renderActivityItem(ev) {
    const time = this.formatTimeAgo(ev.ts);
    const esc = (s) => this.escapeHtml(s || '');

    switch (ev.kind) {
      case 'log': {
        const sev = ev.severity || 'info';
        return `
          <li class="dev-activity-item kind-log severity-${sev}">
            <span class="dev-activity-icon"><i class="fas ${this.getSeverityIcon(sev)}"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">${esc(this.truncateText(ev.message || '', 90))}</div>
              <div class="dev-activity-meta">
                <span>${esc(ev.flow_name || 'Sin flujo')}</span>
                <span>${esc(ev.env || '—')}</span>
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      }
      case 'prov': {
        const isFail = ['provisioning_failed', 'health_check_failed', 'server_degraded'].includes(ev.event_type);
        return `
          <li class="dev-activity-item kind-prov ${isFail ? 'severity-error' : ''}">
            <span class="dev-activity-icon"><i class="fas fa-server"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">${esc(ev.event_type || '')}${ev.message ? ' — ' + esc(this.truncateText(ev.message, 80)) : ''}</div>
              <div class="dev-activity-meta">
                <span>provisioning</span>
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      }
      case 'user_created':
        return `
          <li class="dev-activity-item kind-user">
            <span class="dev-activity-icon"><i class="fas fa-user-plus"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">Nuevo usuario · ${esc(ev.title || '—')}</div>
              <div class="dev-activity-meta">
                <span>${esc(ev.subtitle || 'user')}</span>
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      case 'org_created':
        return `
          <li class="dev-activity-item kind-org">
            <span class="dev-activity-icon"><i class="fas fa-building"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">Nueva organización · ${esc(ev.title || '—')}</div>
              <div class="dev-activity-meta">
                ${ev.subtitle ? `<span>${esc(ev.subtitle)}</span>` : ''}
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      case 'brand_created':
        return `
          <li class="dev-activity-item kind-brand">
            <span class="dev-activity-icon"><i class="fas fa-tag"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">Nueva marca · ${esc(ev.title || '—')}</div>
              <div class="dev-activity-meta">
                ${ev.subtitle ? `<span>en ${esc(ev.subtitle)}</span>` : ''}
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      case 'member_added':
        return `
          <li class="dev-activity-item kind-member">
            <span class="dev-activity-icon"><i class="fas fa-user-group"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">${esc(ev.title || '—')} agregado${ev.subtitle ? ' a ' + esc(ev.subtitle) : ''}</div>
              <div class="dev-activity-meta">
                ${ev.actor_name ? `<span>rol: ${esc(ev.actor_name)}</span>` : ''}
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      case 'flow_created':
        return `
          <li class="dev-activity-item kind-flow">
            <span class="dev-activity-icon"><i class="fas fa-diagram-project"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">Nuevo flujo · ${esc(ev.title || '—')}</div>
              <div class="dev-activity-meta">
                ${ev.actor_name ? `<span>${esc(ev.actor_name)}</span>` : ''}
                ${ev.subtitle ? `<span>${esc(ev.subtitle)}</span>` : ''}
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      case 'flow_published':
        return `
          <li class="dev-activity-item kind-flow severity-info">
            <span class="dev-activity-icon"><i class="fas fa-rocket"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">Flujo publicado · ${esc(ev.title || '—')}</div>
              <div class="dev-activity-meta">
                ${ev.actor_name ? `<span>${esc(ev.actor_name)}</span>` : ''}
                ${ev.subtitle ? `<span>${esc(ev.subtitle)}</span>` : ''}
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      case 'notif':
      default: {
        const sev = ev.severity || 'info';
        return `
          <li class="dev-activity-item kind-notif severity-${sev}">
            <span class="dev-activity-icon"><i class="fas fa-bell"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">${esc(ev.title || '—')}</div>
              <div class="dev-activity-meta">
                <span>notificación</span>
                <span>${time}</span>
              </div>
            </div>
          </li>`;
      }
    }
  }

  async loadActivityLegacy() {
    const list = document.getElementById('devActivityList');
    if (!list) return;

    const events = [];

    try {
      // Logs (Lead: globales, Dev: solo suyos)
      let logsQ = this.supabase
        .from('developer_logs')
        .select('id, error_message, severity, environment, created_at, flow_id, content_flows(name)')
        .order('created_at', { ascending: false })
        .limit(15);
      if (!this.isLead) {
        if (this.myFlowIds.length === 0) {
          // dev sin flujos — saltamos logs
        } else {
          logsQ = logsQ.in('flow_id', this.myFlowIds);
        }
      }
      const logsRes = (this.isLead || this.myFlowIds.length > 0) ? await logsQ : { data: [] };
      (logsRes.data || []).forEach(l => events.push({
        kind: 'log',
        ts: l.created_at,
        severity: l.severity,
        flow_name: l.content_flows?.name,
        env: l.environment,
        message: l.error_message
      }));

      // Provisioning + audit log (Lead) o Notifications (Dev)
      if (this.isLead) {
        const sevenAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const tasks = await Promise.allSettled([
          this.supabase.from('provisioning_events')
            .select('id, event_type, organization_id, created_at, message')
            .order('created_at', { ascending: false }).limit(10),
          this.supabase.from('profiles')
            .select('id, full_name, email, role, created_at')
            .gte('created_at', sevenAgo)
            .order('created_at', { ascending: false }).limit(10),
          this.supabase.from('organizations')
            .select('id, name, brand_name_oficial, created_at, deleted_at')
            .gte('created_at', sevenAgo).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(10),
          this.supabase.from('brand_containers')
            .select('id, nombre_marca, created_at, organization_id, organizations(name)')
            .gte('created_at', sevenAgo)
            .order('created_at', { ascending: false }).limit(10),
          this.supabase.from('content_flows')
            .select('id, name, status, created_at, owner_id, category_id, content_categories(name), profiles!owner_id(full_name, email)')
            .gte('created_at', sevenAgo)
            .order('created_at', { ascending: false }).limit(15),
          this.supabase.from('organization_members')
            .select('id, user_id, organization_id, role, created_at, profiles(full_name, email), organizations(name)')
            .gte('created_at', sevenAgo)
            .order('created_at', { ascending: false }).limit(10)
        ]);
        const [prov, users, orgs, brands, flows, members] = tasks.map(t => t.status === 'fulfilled' ? t.value?.data : null);
        (prov || []).forEach(p => events.push({ kind: 'prov', ts: p.created_at, event_type: p.event_type, message: p.message }));
        (users || []).forEach(u => events.push({ kind: 'user_created', ts: u.created_at, title: u.full_name || u.email, subtitle: u.role }));
        (orgs || []).forEach(o => events.push({ kind: 'org_created', ts: o.created_at, title: o.name, subtitle: o.brand_name_oficial }));
        (brands || []).forEach(b => events.push({ kind: 'brand_created', ts: b.created_at, title: b.nombre_marca, subtitle: b.organizations?.name }));
        (flows || []).forEach(f => events.push({
          kind: f.status === 'published' ? 'flow_published' : 'flow_created',
          ts: f.created_at,
          title: f.name,
          subtitle: f.content_categories?.name,
          actor_name: f.profiles?.full_name || f.profiles?.email
        }));
        (members || []).forEach(m => events.push({
          kind: 'member_added', ts: m.created_at,
          title: m.profiles?.full_name || m.profiles?.email || '—',
          subtitle: m.organizations?.name,
          actor_name: m.role
        }));
      } else {
        const { data } = await this.supabase
          .from('developer_notifications')
          .select('id, title, message, severity, created_at')
          .eq('recipient_user_id', this.userId)
          .order('created_at', { ascending: false })
          .limit(10);
        (data || []).forEach(n => events.push({
          kind: 'notif',
          ts: n.created_at,
          severity: n.severity,
          title: n.title,
          message: n.message
        }));
      }
    } catch (e) {
      console.error('[DevDashboard] activity load error', e);
    }

    if (events.length === 0) {
      list.innerHTML = `<li class="dev-empty-state"><i class="fas fa-circle-info"></i><span>Sin actividad reciente</span></li>`;
      return;
    }

    events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    list.innerHTML = events.slice(0, 20).map(ev => this.renderActivityItem(ev)).join('');
  }

  // ============================================================
  // Utilidades
  // ============================================================
  formatNumber(num) {
    if (num == null || isNaN(num)) return '0';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return String(num);
  }

  fmtCount(n, singular, plural) {
    if (n === null) return 'sin datos';
    return `${this.formatNumber(n)} ${n === 1 ? singular : plural}`;
  }

  formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return 'ahora';
    if (m < 60) return `${m}m`;
    if (h < 24) return `${h}h`;
    if (d < 7) return `${d}d`;
    return date.toLocaleDateString();
  }

  formatTimeUntil(dateStr) {
    if (!dateStr) return '—';
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return 'expirado';
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (d >= 1) return `en ${d}d`;
    return `en ${h}h`;
  }

  getSeverityIcon(severity) {
    return {
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation',
      error: 'fa-circle-xmark',
      critical: 'fa-skull-crossbones'
    }[severity] || 'fa-circle';
  }

  getRunStatusLabel(status) {
    return {
      pending: 'Pendiente',
      running: 'Ejecutando',
      completed: 'Completado',
      failed: 'Fallido'
    }[status] || (status || '—');
  }

  async onLeave() { /* no cleanup needed */ }
}

window.DevDashboardView = DevDashboardView;
