/**
 * DashboardView — orquestador de los 4 tabs del dashboard de organización.
 *
 * Arquitectura:
 *   - Esta clase es el CORE. Solo conoce: routing entre tabs, shell HTML,
 *     suscripciones realtime compartidas y helpers compartidos (Chart.js,
 *     escape, destrucción de charts).
 *   - Cada tab vive en su propio mixin en js/views/dashboard/{Tab}.mixin.js.
 *     Los mixins aplican sobre DashboardView.prototype al cargarse y definen
 *     `_renderMyBrands`, `_renderCompetence`, `_renderTendencies`, `_renderStrategy`.
 *   - El loader (js/app.js) carga DashboardView.js + los 4 mixins en orden, en ese
 *     orden — gracias a `defer` el orden está garantizado.
 *
 * Estado:
 *   - TABS_ENABLED por tab (todos en false mientras se reconstruyen). Cuando un
 *     mixin esté listo, se flipea su entrada a true y _renderTab lo invoca.
 *   - Los mixins son responsables de inicializar su propio estado (this._mbData,
 *     this._stratData, etc.) de forma lazy en su primer render.
 *
 * ARDE Agency S.A.S. — spec: dashboard_mi_marca_spec.docx
 */
class DashboardView extends BaseView {

  // Activación granular por tab. En 'false' renderiza el placeholder
  // "Próximamente" (definido en _renderComingSoon). Flipear a 'true' cuando
  // el mixin del tab esté listo.
  static TABS_ENABLED = {
    'my-brands':  false,
    'competence': false,
    'tendencies': false,
    'strategy':   false,
  };

  constructor() {
    super();
    this._activeTab     = 'my-brands';
    this._charts        = [];
    this._chartJsReady  = false;
    this._supabase      = null;
    this._orgId         = null;
    this._channels      = []; // Suscripciones realtime activas (limpiar en onLeave)
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    await this._initDataLayer();
  }

  async _initDataLayer() {
    try {
      if (window.supabaseService) this._supabase = await window.supabaseService.getClient();
      else if (window.supabase)  this._supabase = window.supabase;
    } catch (_) {}

    const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    // El router resuelve /org/:orgIdShort/:orgNameSlug → routeParams.orgId (UUID).
    // Nunca usar orgIdShort directo: la columna organization_id es uuid → 400 Bad Request.
    let candidate =
      this.routeParams?.orgId ||
      window.currentOrgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      null;

    if (!isUuid(candidate)
        && this.routeParams?.orgIdShort
        && this.routeParams?.orgNameSlug
        && typeof window.resolveOrgIdFromShortAndSlug === 'function') {
      try {
        const r = await window.resolveOrgIdFromShortAndSlug(
          this.routeParams.orgIdShort,
          this.routeParams.orgNameSlug
        );
        if (isUuid(r?.id)) candidate = r.id;
      } catch (_) {}
    }

    this._orgId = isUuid(candidate) ? candidate : null;
    if (!this._orgId) {
      console.warn('[DashboardView] No se pudo resolver organization_id (UUID).');
      return;
    }

    this._subscribeRealtime();
  }

  onLeave() {
    this._unsubscribeRealtime();
    this._destroyCharts();
  }

  /* ── Realtime subscriptions ─────────────────────────────────
     Las tablas críticas alimentan distintos tabs. Cuando llega un cambio,
     se invalida la cache del scope afectado y, si el tab activo coincide,
     se re-renderiza. Cada mixin se hace cargo de su propia invalidación
     vía el handler _onRealtimeChange y de exponer su servicio (_mbService,
     _compService, etc.) si necesita filtros adicionales por entity_id.

     `intelligence_signals` no tiene `organization_id` directo — se filtra
     en el handler usando los entity_ids cacheados en los services. */
  _subscribeRealtime() {
    if (!this._supabase || !this._orgId) return;
    if (this._channels.length) return;

    const orgFilter = `organization_id=eq.${this._orgId}`;

    const sub = (name, table, filter, scopes) => {
      const ch = this._supabase
        .channel(`dash-${name}-${this._orgId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => {
          this._onRealtimeChange(scopes, payload);
        })
        .subscribe();
      this._channels.push(ch);
    };

    sub('vpa',   'vera_pending_actions',  orgFilter, ['strategy']);
    sub('vuln',  'brand_vulnerabilities', orgFilter, ['my-brands', 'strategy']);
    sub('bm',    'body_missions',         orgFilter, ['strategy']);
    sub('rp',    'retail_prices',         orgFilter, ['competence']);
    sub('tt',    'trend_topics',          orgFilter, ['tendencies']);

    // intelligence_signals: filtro lo hace el handler (la tabla no tiene
    // organization_id; verificamos entity_id contra los services al recibir).
    const ch = this._supabase
      .channel(`dash-sig-${this._orgId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'intelligence_signals' }, (payload) => {
        const entityId = payload?.new?.entity_id;
        const known = (this._mbService?.entityIds || this._compService?.entityIds || []);
        if (entityId && known.length && !known.includes(entityId)) return;
        this._onRealtimeChange(['my-brands', 'tendencies'], payload);
      })
      .subscribe();
    this._channels.push(ch);
  }

  _unsubscribeRealtime() {
    for (const ch of this._channels) {
      try { ch.unsubscribe(); } catch (_) {}
    }
    this._channels = [];
  }

  _onRealtimeChange(scopes, _payload) {
    // Cada mixin invalida su propia cache aquí cuando se reescriba.
    // Por ahora, con todos los tabs en "Próximamente", solo importa re-renderizar
    // si el tab activo está listado.
    if (scopes.includes('my-brands'))  this._mbData    = null;
    if (scopes.includes('competence')) this._compData  = null;
    if (scopes.includes('tendencies')) this._tendData  = null;
    if (scopes.includes('strategy'))   this._stratData = null;

    if (!scopes.includes(this._activeTab)) return;
    if (!document.getElementById('insightTabBody')) return;

    this._destroyCharts();
    this._renderTab(this._activeTab);
  }

  _destroyCharts() {
    this._charts.forEach(c => { try { c.destroy(); } catch (_) {} });
    this._charts = [];
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Dashboard', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();
    this._setupTabs();
    this._renderTab(this._activeTab);
  }

  renderHTML() {
    return this._buildShell();
  }

  _buildShell() {
    // Grupo izquierdo (Mi Marca / Competencia / Tendencias) y Estrategia separado a la derecha.
    const leftTabs  = [
      { id: 'my-brands',  label: 'Mi Marca'    },
      { id: 'competence', label: 'Competencia' },
      { id: 'tendencies', label: 'Tendencias'  },
    ];
    const rightTabs = [
      { id: 'strategy',   label: 'Estrategia'  },
    ];
    const pill = (t) => `
      <button class="mb-firebar-tab${this._activeTab === t.id ? ' is-active' : ''}" data-tab="${t.id}">
        <span>${t.label}</span>
      </button>`;
    return `
      <div class="insight-page page-content" id="insightPage">
        <div class="mb-firebar" id="insightSubnav" data-mb-firebar>
          <div class="mb-firebar-bg" aria-hidden="true">
            <div class="mb-firebar-gradient"></div>
            <div class="background-film-grain"></div>
          </div>
          <div class="mb-firebar-tabs mb-firebar-tabs--left">
            ${leftTabs.map(pill).join('')}
          </div>
          <div class="mb-firebar-tabs mb-firebar-tabs--right">
            ${rightTabs.map(pill).join('')}
          </div>
        </div>
        <div class="insight-tab-body" id="insightTabBody"></div>
      </div>`;
  }

  _setupTabs() {
    const nav = document.getElementById('insightSubnav');
    if (!nav) return;
    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this._destroyCharts();
      this._activeTab = btn.dataset.tab;
      nav.querySelectorAll('.mb-firebar-tab')
        .forEach(b => b.classList.toggle('is-active', b.dataset.tab === this._activeTab));
      this._renderTab(this._activeTab);
    });
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    if (!DashboardView.TABS_ENABLED?.[tabId]) {
      this._renderComingSoon(tabId, body);
      return;
    }
    if (tabId === 'my-brands')  return this._renderMyBrands(body);
    if (tabId === 'competence') return this._renderCompetence(body);
    if (tabId === 'tendencies') return this._renderTendencies(body);
    if (tabId === 'strategy')   return this._renderStrategy(body);
  }

  _renderComingSoon(tabId, body) {
    const meta = {
      'my-brands':  { title: 'Mi Marca',    desc: 'Pulso operativo, identidad narrativa, comercial y diagnóstico de salud de marca.' },
      'competence': { title: 'Competencia', desc: 'Precios, narrativa rival, vulnerabilidades y mapa de inversión publicitaria.' },
      'tendencies': { title: 'Tendencias',  desc: 'Señales emergentes, contexto cultural, cambios de algoritmo y estética dominante.' },
      'strategy':   { title: 'Estrategia',  desc: 'Sintetizador del plan diario / semanal / mensual con score de salud y nivel de amenaza.' },
    }[tabId] || { title: 'Dashboard', desc: '' };

    body.innerHTML = `
      <div class="dash-coming-soon" style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        min-height:60vh;padding:48px 24px;text-align:center;gap:16px;
      ">
        <div style="
          width:72px;height:72px;border-radius:50%;
          background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(236,72,153,.15));
          display:flex;align-items:center;justify-content:center;
          font-size:32px;
        ">⏳</div>
        <h2 style="margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;">
          ${meta.title} — Próximamente
        </h2>
        <p style="margin:0;max-width:560px;color:var(--text-muted,#6b7280);line-height:1.6;font-size:15px;">
          ${meta.desc}
        </p>
        <p style="margin:0;font-size:13px;color:var(--text-muted,#9ca3af);">
          Estamos puliendo este panel. Volvé pronto.
        </p>
      </div>`;
  }

  /* ── Helpers compartidos por todos los mixins ──────────────────────────── */

  async _ensureChartJs() {
    if (window.Chart) { this._chartJsReady = true; return; }
    await this.loadScript(
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
      'Chart', 8000
    );
    this._chartJsReady = true;
  }

  /** Registrar Chart.js en this._charts para destruirlo en onLeave. */
  _reg(chart) { this._charts.push(chart); return chart; }

  _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

window.DashboardView = DashboardView;
