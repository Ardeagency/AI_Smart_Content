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
  static documentTitle = 'Inicio';

  // Habilita back/forward HTML cache: al volver desde Studio/Production al
  // dashboard, restaura HTML+scroll instant; los tabs refrescan en background.
  static cacheable = true;

  // Activación granular por tab. En 'false' renderiza el placeholder
  // "Próximamente" (definido en _renderComingSoon). Flipear a 'true' cuando
  // el mixin del tab esté listo.
  static TABS_ENABLED = {
    'my-brands':  true,   // FEAT-023 Ola 1: sección "Mis Campañas" activa
    'competence': false,
    'tendencies': false,
    'strategy':   false,
  };

  constructor() {
    super();
    this._activeTab     = this._resolveInitialTab();
    this._charts        = [];
    this._chartJsReady  = false;
    this._supabase      = null;
    this._orgId         = null;
    this._channels      = []; // Suscripciones realtime activas (limpiar en onLeave)
    this._onHashChange  = null;
  }

  /**
   * Resuelve el tab activo al cargar la vista:
   *   1. URL hash (#tendencies) si es un tab habilitado
   *   2. Primer tab habilitado en TABS_ENABLED
   *   3. Fallback a 'my-brands'
   * Permite que recargar en /dashboard#tendencies preserve el tab activo
   * y que la URL sea compartible (/dashboard#strategy abre directo en Estrategia).
   */
  _resolveInitialTab() {
    const enabled = DashboardView.TABS_ENABLED || {};
    const hash = (typeof location !== 'undefined' ? (location.hash || '') : '').replace(/^#/, '');
    if (hash && enabled[hash] === true) return hash;
    const firstEnabled = Object.entries(enabled).find(([, v]) => v === true);
    return firstEnabled ? firstEnabled[0] : 'my-brands';
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
    if (this._onHashChange) {
      window.removeEventListener('hashchange', this._onHashChange);
      this._onHashChange = null;
    }
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

    sub('vpa',   'vera_pending_actions',  orgFilter, ['strategy', 'vera-rail']);
    sub('vuln',  'brand_vulnerabilities', orgFilter, ['my-brands', 'strategy']);
    sub('bm',    'body_missions',         orgFilter, ['strategy']);
    sub('rp',    'retail_prices',         orgFilter, ['competence']);
    sub('tt',    'trend_topics',          orgFilter, ['tendencies']);

    // FEAT-023: invalida sección Mis Campañas si cambian ad_insights_daily o campaigns.
    sub('aid',   'ad_insights_daily',     orgFilter, ['my-brands']);
    sub('camp',  'campaigns',             orgFilter, ['my-brands']);
    sub('cb',    'campaign_briefs',       orgFilter, ['my-brands']);

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
    // Invalida tanto el cache local del mixin como el del apiClient para que
    // el próximo _fetchAll() vaya a Supabase (no devuelva data stale).
    const orgId = this._orgId;
    if (scopes.includes('my-brands'))  {
      this._mbData = null;
      this._mbCampanasData = null;
      window.apiClient?.invalidate((k) => k.startsWith(`dash:mi-brand:${orgId}`) || k.startsWith(`dash:campanas:${orgId}`));
    }
    if (scopes.includes('competence')) { this._compData  = null; window.apiClient?.invalidate((k) => k.startsWith(`dash:competencia:${orgId}`)); }
    if (scopes.includes('tendencies')) { this._tendData  = null; window.apiClient?.invalidate((k) => k.startsWith(`dash:tendencias:${orgId}`)); }
    if (scopes.includes('strategy'))   { this._stratData = null; window.apiClient?.invalidate(`dash:strategia:${orgId}`); }

    // Rail de tareas de Vera: refresca silenciosamente sin importar el tab activo.
    if (scopes.includes('vera-rail')) this._loadVeraTasks();

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

    // Rail de tareas de Vera: bind delegado una vez por shell + carga inicial.
    const railBody = document.getElementById('veraRailBody');
    if (railBody && !railBody.dataset.bound) {
      railBody.dataset.bound = '1';
      this._bindVeraRailHandlers(railBody);
    }
    this._loadVeraTasks();
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
      <div class="insight-shell" id="insightShell">
        <div class="insight-page page-content insight-main" id="insightPage">
          <div class="mb-firebar" id="insightSubnav" data-mb-firebar>
            <div class="mb-firebar-bg" aria-hidden="true">
              <div class="mb-firebar-gradient"></div>
            </div>
            <div class="mb-firebar-tabs mb-firebar-tabs--left">
              ${leftTabs.map(pill).join('')}
            </div>
            <div class="mb-firebar-tabs mb-firebar-tabs--right">
              ${rightTabs.map(pill).join('')}
            </div>
          </div>
          <div class="insight-tab-body" id="insightTabBody"></div>
        </div>
        ${this._buildVeraRailShell()}
      </div>`;
  }

  /* ── Vera Task Rail (sidebar derecho) ──────────────────────────────────
     Timeline de tareas que Vera le asigna a la org para optimizar su
     marketing. Fuente: vera_pending_actions (status='pending') org-scoped.
     Independiente del tab activo: vive en el shell y se refresca por su
     propia suscripcion realtime (scope 'vera-rail'). */
  _buildVeraRailShell() {
    return `
      <aside class="vera-rail" id="veraRail" aria-label="Tareas de Vera para tu marca">
        <header class="vera-rail-head">
          <div class="vera-rail-title-wrap">
            <span class="vera-rail-title">Tareas de Vera</span>
            <span class="vera-rail-sub">Lo que debes hacer para optimizar tu marketing</span>
          </div>
          <span class="vera-rail-count" id="veraRailCount" aria-live="polite" aria-label="Tareas pendientes"></span>
        </header>
        <div class="vera-rail-body" id="veraRailBody"></div>
      </aside>`;
  }

  _setupTabs() {
    const nav = document.getElementById('insightSubnav');
    if (!nav) return;

    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this._switchTab(btn.dataset.tab, /* fromUser */ true);
    });

    // hashchange: que el back/forward del browser cambie el tab.
    // Solo registrar una vez (este método se llama en cada render).
    if (!this._onHashChange) {
      this._onHashChange = () => {
        const target = this._resolveInitialTab();
        if (target !== this._activeTab) this._switchTab(target, /* fromUser */ false);
      };
      window.addEventListener('hashchange', this._onHashChange);
    }
  }

  _switchTab(tabId, fromUser) {
    if (!tabId || tabId === this._activeTab) return;
    this._destroyCharts();
    this._activeTab = tabId;

    // Persistir en URL para que recargar conserve el tab y la URL sea compartible.
    // replaceState evita saturar el history con cada click; el back/forward sigue
    // funcionando porque hashchange dispara aunque el path sea el mismo.
    if (fromUser) {
      try {
        const newUrl = location.pathname + location.search + '#' + tabId;
        history.replaceState(history.state, '', newUrl);
      } catch (_) {
        location.hash = tabId;
      }
    }

    const nav = document.getElementById('insightSubnav');
    if (nav) {
      nav.querySelectorAll('.mb-firebar-tab')
        .forEach(b => b.classList.toggle('is-active', b.dataset.tab === tabId));
    }
    this._renderTab(tabId);
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    if (!DashboardView.TABS_ENABLED?.[tabId]) {
      this._renderComingSoon(tabId, body);
      return;
    }
    // Skeleton inmediato: el usuario ve la silueta del layout mientras el
    // mixin fetchea data y reemplaza el HTML. Evita "salto" de empty a fresh.
    if (!this._restoredFromCache) this._renderTabSkeleton(body);
    if (tabId === 'my-brands')  return this._renderMyBrands(body);
    if (tabId === 'competence') return this._renderCompetence(body);
    if (tabId === 'tendencies') return this._renderTendencies(body);
    if (tabId === 'strategy')   return this._renderStrategy(body);
  }

  _renderTabSkeleton(body) {
    // 4 KPIs + 2 cards grandes con shimmer; cubre el shape de los 4 tabs.
    body.innerHTML = `
      <div class="dash-skeleton" style="padding: 1rem 0; display: flex; flex-direction: column; gap: 1rem;">
        ${BaseView.skeletonGrid(4)}
        <div class="skeleton-grid skeleton-grid--3">
          ${BaseView.skeletonCard('lg')}
          ${BaseView.skeletonCard('lg')}
          ${BaseView.skeletonCard('lg')}
        </div>
      </div>`;
  }

  _renderComingSoon(_tabId, body) {
    body.innerHTML = `
      <div class="dash-coming-soon" style="
        display:flex;align-items:center;justify-content:center;
        min-height:60vh;padding:48px 24px;
      ">
        <h2 style="margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;">
          Próximamente
        </h2>
      </div>`;
  }

  /* ── Vera Task Rail: carga + render + acciones ─────────────────────────── */

  /** Filtra placeholders/stubs de bootstrap para no ensuciar el rail. */
  _filterVeraStubs(rows) {
    return (Array.isArray(rows) ? rows : []).filter((a) => {
      if (a?.proposed_payload?.placeholder === true) return false;
      if (typeof a?.vera_reasoning === 'string' && /bootstrap\s*stub/i.test(a.vera_reasoning)) return false;
      return true;
    });
  }

  async _loadVeraTasks() {
    const bodyEl = document.getElementById('veraRailBody');
    if (!bodyEl) return;
    if (!this._supabase || !this._orgId) { this._renderVeraRailEmpty(bodyEl, 'no-org'); return; }

    // Skeleton solo en la primera carga (refrescos realtime son silenciosos).
    if (!this._veraTasks) this._renderVeraRailSkeleton(bodyEl);

    try {
      const { data, error } = await this._supabase
        .from('vera_pending_actions')
        .select('id,action_type,vera_reasoning,vera_confidence,priority,proposed_payload,impact_estimate,status,created_at,expires_at')
        .eq('organization_id', this._orgId)
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      this._veraTasks = this._filterVeraStubs(data);
      this._renderVeraRail(this._veraTasks);
    } catch (e) {
      console.warn('[VeraRail] load failed:', e?.message || e);
      this._renderVeraRailEmpty(bodyEl, 'error');
    }
  }

  _renderVeraRail(tasks) {
    const bodyEl  = document.getElementById('veraRailBody');
    const countEl = document.getElementById('veraRailCount');
    if (!bodyEl) return;
    if (countEl) countEl.textContent = tasks.length ? String(tasks.length) : '';
    if (!tasks.length) { this._renderVeraRailEmpty(bodyEl, 'clean'); return; }
    bodyEl.innerHTML = `<ol class="vrail-timeline">${
      tasks.map((t, i) => this._buildVeraTaskItem(t, i === tasks.length - 1)).join('')
    }</ol>`;
  }

  _buildVeraTaskItem(t, isLast) {
    const meta   = this._veraActionMeta(t.action_type);
    const time   = this._veraTimeLabel(t.created_at);
    const detail = String(t.vera_reasoning || t.proposed_payload?.summary || '').trim();
    const detailHtml = detail
      ? `<p class="vrail-card-detail">${this._esc(detail.length > 180 ? detail.slice(0, 180) + '…' : detail)}</p>`
      : '';

    const conf     = Number.isFinite(Number(t.vera_confidence)) ? Math.round(Number(t.vera_confidence) * 100) : null;
    const confChip = conf != null ? `<span class="vrail-chip vrail-chip--conf" title="Confianza de Vera">${conf}%</span>` : '';
    const expiry   = this._veraExpiryLabel(t.expires_at);
    const expChip  = expiry ? `<span class="vrail-chip vrail-chip--${expiry.urgent ? 'urgent' : 'soft'}">${this._esc(expiry.label)}</span>` : '';
    const prioChip = (Number(t.priority) >= 8) ? `<span class="vrail-chip vrail-chip--prio">Alta prioridad</span>` : '';

    return `
      <li class="vrail-item${isLast ? ' vrail-item--last' : ''}" data-task-id="${this._esc(t.id)}">
        <div class="vrail-rail-col">
          <span class="vrail-time">${this._esc(time)}</span>
          <span class="vrail-node" style="--vrail-accent:${meta.color};"><i class="${meta.icon}"></i></span>
        </div>
        <div class="vrail-card" style="--vrail-accent:${meta.color};">
          <div class="vrail-card-head">
            <span class="vrail-card-title">${this._esc(meta.title)}</span>
            <button type="button" class="vrail-card-menu" data-vrail-menu aria-label="Opciones de la tarea" title="Opciones">
              <i class="fas fa-ellipsis"></i>
            </button>
          </div>
          ${detailHtml}
          <div class="vrail-card-foot">${prioChip}${expChip}${confChip}</div>
          <div class="vrail-card-actions" data-vrail-actions hidden>
            <button type="button" class="vrail-btn vrail-btn--approve" data-vrail-approve>
              <i class="fas fa-check"></i> Aprobar
            </button>
            <button type="button" class="vrail-btn vrail-btn--dismiss" data-vrail-dismiss>
              Descartar
            </button>
          </div>
        </div>
      </li>`;
  }

  /** Mapa action_type → titulo imperativo + icono + color del nodo. */
  _veraActionMeta(type) {
    const M = {
      pause_campaign:             { title: 'Pausar campaña',            icon: 'fas fa-circle-pause',        color: '#e06464' },
      resume_campaign:            { title: 'Reactivar campaña',         icon: 'fas fa-circle-play',         color: '#4cb37a' },
      launch_campaign:            { title: 'Lanzar campaña',            icon: 'fas fa-rocket',              color: '#a07bd0' },
      create_brief:               { title: 'Crear brief de campaña',    icon: 'fas fa-file-pen',            color: '#5b9bd5' },
      update_brief:               { title: 'Actualizar brief',          icon: 'fas fa-file-pen',            color: '#5b9bd5' },
      update_persona:             { title: 'Actualizar persona',        icon: 'fas fa-user-pen',            color: '#a07bd0' },
      create_audience:            { title: 'Crear audiencia',           icon: 'fas fa-users',               color: '#3fb6a8' },
      update_audience:            { title: 'Actualizar audiencia',      icon: 'fas fa-user-gear',           color: '#3fb6a8' },
      link_brief_to_campaign:     { title: 'Vincular brief a campaña',  icon: 'fas fa-link',                color: '#4cb37a' },
      link_campaign_to_persona:   { title: 'Vincular campaña a persona',icon: 'fas fa-link',                color: '#4cb37a' },
      link_segment_to_persona:    { title: 'Vincular audiencia a persona', icon: 'fas fa-link',             color: '#4cb37a' },
      update_brand_container:     { title: 'Actualizar marca',          icon: 'fas fa-pen-to-square',       color: '#e09145' },
      update_shopify_product_seo: { title: 'Optimizar SEO de producto', icon: 'fas fa-magnifying-glass',    color: '#4cb37a' },
      adjust_price:               { title: 'Ajustar precio',            icon: 'fas fa-tag',                 color: '#e06464' },
      adjust_tone:                { title: 'Ajustar tono del contenido',icon: 'fas fa-wand-magic-sparkles', color: '#00c7d6' },
    };
    return M[type] || { title: this._humanizeType(type), icon: 'fas fa-bolt', color: '#87868b' };
  }

  _humanizeType(t) {
    const s = String(t || 'Tarea').replace(/_/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** HH:MM si es hoy, "Ayer", "Nd" si <7d, o fecha corta. */
  _veraTimeLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    const days = Math.floor((now - d) / 86400000);
    if (days <= 1) return 'Ayer';
    if (days < 7)  return `${days}d`;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  }

  /** Etiqueta de vencimiento de la ventana de oportunidad. */
  _veraExpiryLabel(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const ms = d - new Date();
    if (ms <= 0) return { label: 'Vencida', urgent: true };
    const h = Math.floor(ms / 3600000);
    if (h < 24) return { label: `Vence en ${h}h`, urgent: true };
    const days = Math.round(h / 24);
    return { label: `Vence en ${days}d`, urgent: days <= 2 };
  }

  _bindVeraRailHandlers(bodyEl) {
    bodyEl.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('[data-vrail-menu]');
      if (menuBtn) {
        const actions = menuBtn.closest('.vrail-card')?.querySelector('[data-vrail-actions]');
        if (actions) actions.hidden = !actions.hidden;
        return;
      }
      const approve = e.target.closest('[data-vrail-approve]');
      if (approve) { this._resolveVeraTask(approve.closest('[data-task-id]')?.dataset.taskId, 'approve'); return; }
      const dismiss = e.target.closest('[data-vrail-dismiss]');
      if (dismiss) { this._resolveVeraTask(dismiss.closest('[data-task-id]')?.dataset.taskId, 'reject'); return; }
    });
  }

  async _resolveVeraTask(id, op) {
    if (!id || !this._supabase) return;
    const li = document.querySelector(`.vrail-item[data-task-id="${id}"]`);
    if (li) { li.classList.add('vrail-item--resolving'); li.style.pointerEvents = 'none'; }
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sin sesion');
      const res = await fetch(`/api/vera/pending-actions/${id}/${op}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: op === 'reject' ? JSON.stringify({ reason: '' }) : '{}',
      });
      if (!res.ok) throw new Error((await res.text().catch(() => '')).slice(0, 200));
      this._veraTasks = (this._veraTasks || []).filter((t) => t.id !== id);
      this._renderVeraRail(this._veraTasks);
    } catch (e) {
      console.error('[VeraRail] resolve failed:', e?.message || e);
      if (li) { li.classList.remove('vrail-item--resolving'); li.style.pointerEvents = ''; }
    }
  }

  _renderVeraRailSkeleton(el) {
    el.innerHTML = `<div class="vrail-skeleton">${[0, 1, 2].map(() => `
      <div class="vrail-skel-item">
        <span class="vrail-skel-node skeleton-shimmer"></span>
        <div class="vrail-skel-card skeleton-shimmer"></div>
      </div>`).join('')}</div>`;
  }

  _renderVeraRailEmpty(el, kind) {
    const map = {
      clean:    { icon: 'fas fa-circle-check',        text: 'Sin tareas pendientes. Vera tiene tu marca al dia.' },
      'no-org': { icon: 'fas fa-circle-info',         text: 'Selecciona una marca para ver las tareas de Vera.' },
      error:    { icon: 'fas fa-triangle-exclamation',text: 'No se pudieron cargar las tareas de Vera.' },
    };
    const m = map[kind] || map.clean;
    const countEl = document.getElementById('veraRailCount');
    if (countEl) countEl.textContent = '';
    el.innerHTML = `<div class="vrail-empty"><i class="${m.icon}"></i><p>${m.text}</p></div>`;
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
