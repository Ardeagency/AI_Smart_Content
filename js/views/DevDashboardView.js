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

        <!-- Zona 6: Quick actions -->
        <footer class="dev-quick-actions" id="devQuickActions" aria-label="Atajos">
          <!-- inyectados según rol -->
        </footer>
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
    this.renderQuickActions();
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

  renderQuickActions() {
    const el = document.getElementById('devQuickActions');
    if (!el) return;
    const items = this.isLead
      ? [
          ['fa-user-plus', 'Provisionar', '/dev/provisioning/users'],
          ['fa-diagram-project', 'Todos los flujos', '/dev/lead/flows'],
          ['fa-users-gear', 'Equipo', '/dev/lead/team'],
          ['fa-tags', 'Categorías', '/dev/lead/categories'],
          ['fa-code', 'Input Schemas', '/dev/lead/input-schemas'],
          ['fa-image', 'Referencias', '/dev/lead/references'],
          ['fa-database', 'AI Vectors', '/dev/lead/ai-vectors'],
          ['fa-headset', 'CRM Leads', '/dev/lead/crm'],
          ['fa-terminal', 'Logs', '/dev/logs'],
          ['fa-link', 'Webhooks', '/dev/webhooks']
        ]
      : [
          ['fa-diagram-project', 'Mis flujos', '/dev/flows'],
          ['fa-hammer', 'Builder', '/dev/builder'],
          ['fa-flask', 'Test', '/dev/test'],
          ['fa-terminal', 'Logs', '/dev/logs'],
          ['fa-link', 'Webhooks', '/dev/webhooks']
        ];
    el.innerHTML = items.map(([icon, label, href]) => `
      <a class="dev-quick-link" href="${href}">
        <i class="fas ${icon}"></i>
        <span>${label}</span>
      </a>
    `).join('');
  }

  // ============================================================
  // Zona 1 — Tira de salud
  // ============================================================
  async loadHealth() {
    const el = document.getElementById('devHealthStrip');
    if (!el) return;

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const sevenDaysAhead = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    // Helpers de conteo
    const safeCount = async (q) => {
      try { const { count } = await q; return count ?? 0; } catch { return null; }
    };

    let unhealthyFlows = 0;
    let expiringTokens = 0;
    let recentErrors = 0;
    let provisioningFails = 0;

    if (this.isLead) {
      const [a, b, c, d] = await Promise.all([
        safeCount(this.supabase.from('flow_technical_details').select('id', { count: 'exact', head: true }).eq('is_healthy', false)),
        safeCount(this.supabase.from('brand_integrations').select('id', { count: 'exact', head: true })
          .eq('is_active', true).gte('token_expires_at', nowIso).lt('token_expires_at', sevenDaysAhead)),
        safeCount(this.supabase.from('developer_logs').select('id', { count: 'exact', head: true })
          .in('severity', ['error', 'critical']).gte('created_at', dayAgo)),
        safeCount(this.supabase.from('provisioning_events').select('id', { count: 'exact', head: true })
          .in('event_type', ['health_check_failed', 'provisioning_failed', 'server_degraded']).gte('created_at', sevenDaysAgo))
      ]);
      unhealthyFlows = a; expiringTokens = b; recentErrors = c; provisioningFails = d;
    } else {
      // Dev no-lead: solo sus flows
      if (this.myFlowIds.length > 0) {
        recentErrors = await safeCount(this.supabase.from('developer_logs')
          .select('id', { count: 'exact', head: true })
          .in('flow_id', this.myFlowIds)
          .in('severity', ['error', 'critical'])
          .gte('created_at', dayAgo));
      } else {
        recentErrors = 0;
      }
    }

    const pills = [];
    if (this.isLead) {
      pills.push(this.healthPill('fa-heart-pulse', 'Sistema',         this.healthLevel(unhealthyFlows, 0, 1),     this.fmtCount(unhealthyFlows, 'flujo no sano', 'flujos no sanos')));
      pills.push(this.healthPill('fa-plug', 'Integraciones', this.healthLevel(expiringTokens, 0, 1),  this.fmtCount(expiringTokens, 'token a expirar', 'tokens a expirar')));
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
    const grid = document.getElementById('devAttentionGrid');
    const meta = document.getElementById('devAttentionMeta');
    if (!grid) return;

    const cards = [];
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sevenAhead = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    if (this.isLead) {
      // Cards Lead-only
      const tasks = await Promise.allSettled([
        this.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('form_verified', false),
        this.supabase.from('brand_integrations').select('id, platform, brand_container_id, token_expires_at', { count: 'exact' })
          .eq('is_active', true).gte('token_expires_at', nowIso).lt('token_expires_at', sevenAhead).order('token_expires_at', { ascending: true }).limit(3),
        this.supabase.from('organization_credits').select('organization_id, credits_available, credits_total').limit(50),
        this.supabase.from('contact_leads').select('id, full_name, company_name, created_at', { count: 'exact' })
          .eq('status', 'nuevo').order('created_at', { ascending: false }).limit(3),
        this.supabase.from('developer_logs').select('id, error_message, severity, flow_id, created_at, content_flows(name)', { count: 'exact' })
          .in('severity', ['error', 'critical']).gte('created_at', dayAgo).order('created_at', { ascending: false }).limit(3),
        this.supabase.from('provisioning_events').select('id, event_type, organization_id, created_at, message', { count: 'exact' })
          .in('event_type', ['provisioning_failed', 'health_check_failed']).gte('created_at', dayAgo).order('created_at', { ascending: false }).limit(3)
      ]);

      const [unverified, expiring, credits, leads, errors, provFails] = tasks.map(t => t.status === 'fulfilled' ? t.value : null);

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

      // Card: tokens a expirar
      const expCount = expiring?.count ?? 0;
      if (expCount > 0) {
        const items = (expiring?.data || []).map(r =>
          `${this.escapeHtml(r.platform)} · vence ${this.formatTimeUntil(r.token_expires_at)}`);
        cards.push(this.attentionCard({
          tone: 'warn',
          icon: 'fa-plug-circle-exclamation',
          title: 'Tokens OAuth a expirar',
          count: expCount,
          subtitle: 'En los próximos 7 días',
          items,
          href: '/dev/lead/team',
          cta: 'Ver integraciones →'
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

      // Card: leads CRM nuevos
      const leadsCount = leads?.count ?? 0;
      if (leadsCount > 0) {
        const items = (leads?.data || []).map(l => `${this.escapeHtml(l.full_name)} · ${this.escapeHtml(l.company_name)}`);
        cards.push(this.attentionCard({
          tone: 'info',
          icon: 'fa-headset',
          title: 'Leads sin atender',
          count: leadsCount,
          subtitle: 'Estado: nuevo',
          items,
          href: '/dev/lead/crm',
          cta: 'Abrir CRM →'
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
    const grid = document.getElementById('devKpiGrid');
    if (!grid) return;

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sevenAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    if (this.isLead) {
      const [users, orgs, published, runs24, credits7, errs24, runsTotal24] = await Promise.allSettled([
        this.supabase.from('profiles').select('id', { count: 'exact', head: true }),
        this.supabase.from('organizations').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        this.supabase.from('content_flows').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('created_at', dayAgo),
        this.supabase.from('credit_usage').select('credits_used').gte('created_at', sevenAgo),
        this.supabase.from('developer_logs').select('id', { count: 'exact', head: true }).in('severity', ['error', 'critical']).gte('created_at', dayAgo),
        this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo)
      ]);

      const usersN     = users.value?.count ?? 0;
      const orgsN      = orgs.value?.count ?? 0;
      const pubN       = published.value?.count ?? 0;
      const runs24N    = runs24.value?.count ?? 0;
      const totRuns24  = runsTotal24.value?.count ?? 0;
      const credits7N  = (credits7.value?.data || []).reduce((s, r) => s + (r.credits_used || 0), 0);
      const errs24N    = errs24.value?.count ?? 0;
      const successPct = totRuns24 > 0 ? Math.round((runs24N / totRuns24) * 100) : null;
      const errorPct   = totRuns24 > 0 ? Math.round((errs24N / totRuns24) * 100) : null;

      grid.innerHTML = [
        this.kpiCard('Usuarios', this.formatNumber(usersN), 'totales en plataforma'),
        this.kpiCard('Organizaciones activas', this.formatNumber(orgsN), 'sin eliminar'),
        this.kpiCard('Flujos publicados', this.formatNumber(pubN), 'estado published'),
        this.kpiCard('Runs completados 24h', this.formatNumber(runs24N), successPct !== null ? `tasa éxito ${successPct}%` : '—'),
        this.kpiCard('Créditos consumidos', this.formatNumber(credits7N), 'últimos 7 días'),
        this.kpiCard('Errores / runs 24h', errorPct !== null ? `${errorPct}%` : '—', `${this.formatNumber(errs24N)} eventos`)
      ].join('');
    } else {
      // Dev no-lead — limitar a sus datos
      const ids = this.myFlowIds;
      const [myFlows, myPub, myRuns, myCompleted, myErrs, myRunsTotal] = await Promise.allSettled([
        this.supabase.from('content_flows').select('id', { count: 'exact', head: true }).eq('owner_id', this.userId),
        this.supabase.from('content_flows').select('id', { count: 'exact', head: true }).eq('owner_id', this.userId).eq('status', 'published'),
        ids.length ? this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).in('flow_id', ids).gte('created_at', dayAgo) : Promise.resolve({ count: 0 }),
        ids.length ? this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).in('flow_id', ids).eq('status', 'completed').gte('created_at', dayAgo) : Promise.resolve({ count: 0 }),
        ids.length ? this.supabase.from('developer_logs').select('id', { count: 'exact', head: true }).in('flow_id', ids).in('severity', ['error', 'critical']).gte('created_at', dayAgo) : Promise.resolve({ count: 0 }),
        ids.length ? this.supabase.from('flow_runs').select('id', { count: 'exact', head: true }).in('flow_id', ids).gte('created_at', dayAgo) : Promise.resolve({ count: 0 })
      ]);

      const flowsN = myFlows.value?.count ?? 0;
      const pubN   = myPub.value?.count ?? 0;
      const runs24 = (myRuns.value?.count ?? myRuns.value ?? 0);
      const ok24   = (myCompleted.value?.count ?? myCompleted.value ?? 0);
      const errs24 = (myErrs.value?.count ?? myErrs.value ?? 0);
      const tot24  = (myRunsTotal.value?.count ?? myRunsTotal.value ?? 0);
      const successPct = tot24 > 0 ? Math.round((ok24 / tot24) * 100) : null;

      grid.innerHTML = [
        this.kpiCard('Mis flujos', this.formatNumber(flowsN), 'creados por mí'),
        this.kpiCard('Publicados', this.formatNumber(pubN), 'visibles a usuarios'),
        this.kpiCard('Runs 24h', this.formatNumber(runs24), 'todas ejecuciones'),
        this.kpiCard('Tasa éxito 24h', successPct !== null ? `${successPct}%` : '—', `${this.formatNumber(ok24)} completados`),
        this.kpiCard('Errores 24h', this.formatNumber(errs24), 'severidad error/critical'),
        this.kpiCard('Borradores', this.formatNumber(flowsN - pubN), 'pendientes de publicar')
      ].join('');
    }
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

  // ============================================================
  // Zona 4 — Top flujos 24h
  // ============================================================
  async loadTopFlows() {
    const tbody = document.getElementById('devTopFlowsBody');
    const ownerCol = document.getElementById('devTopOwnerCol');
    const link = document.getElementById('devTopFlowsLink');
    if (!tbody) return;

    if (!this.isLead) {
      // dev no-lead: oculta columna dueño y enlaza a /dev/flows
      if (ownerCol) ownerCol.style.display = 'none';
      if (link) link.href = '/dev/flows';
    } else {
      if (link) link.href = '/dev/lead/flows';
    }

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
        flow: l.content_flows?.name,
        env: l.environment,
        message: l.error_message
      }));

      // Provisioning (Lead) o Notifications (Dev)
      if (this.isLead) {
        const { data } = await this.supabase
          .from('provisioning_events')
          .select('id, event_type, organization_id, created_at, message')
          .order('created_at', { ascending: false })
          .limit(10);
        (data || []).forEach(p => events.push({
          kind: 'prov',
          ts: p.created_at,
          eventType: p.event_type,
          message: p.message
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
    const top = events.slice(0, 20);

    list.innerHTML = top.map(ev => {
      if (ev.kind === 'log') {
        const sev = ev.severity || 'info';
        return `
          <li class="dev-activity-item kind-log severity-${sev}">
            <span class="dev-activity-icon"><i class="fas ${this.getSeverityIcon(sev)}"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">${this.escapeHtml(this.truncateText(ev.message, 90))}</div>
              <div class="dev-activity-meta">
                <span>${this.escapeHtml(ev.flow || 'Sin flujo')}</span>
                <span>${ev.env || '—'}</span>
                <span>${this.formatTimeAgo(ev.ts)}</span>
              </div>
            </div>
          </li>
        `;
      }
      if (ev.kind === 'prov') {
        const isFail = ['provisioning_failed', 'health_check_failed', 'server_degraded'].includes(ev.eventType);
        return `
          <li class="dev-activity-item kind-prov ${isFail ? 'severity-error' : ''}">
            <span class="dev-activity-icon"><i class="fas fa-server"></i></span>
            <div class="dev-activity-body">
              <div class="dev-activity-title">${this.escapeHtml(ev.eventType)}${ev.message ? ' — ' + this.escapeHtml(this.truncateText(ev.message, 80)) : ''}</div>
              <div class="dev-activity-meta">
                <span>provisioning</span>
                <span>${this.formatTimeAgo(ev.ts)}</span>
              </div>
            </div>
          </li>
        `;
      }
      // notif
      const sev = ev.severity || 'info';
      return `
        <li class="dev-activity-item kind-notif severity-${sev}">
          <span class="dev-activity-icon"><i class="fas fa-bell"></i></span>
          <div class="dev-activity-body">
            <div class="dev-activity-title">${this.escapeHtml(ev.title || '—')}</div>
            <div class="dev-activity-meta">
              <span>notificación</span>
              <span>${this.formatTimeAgo(ev.ts)}</span>
            </div>
          </div>
        </li>
      `;
    }).join('');
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
