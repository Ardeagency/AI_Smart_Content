/**
 * CommandCenterView — Dashboard de campañas por sub-marca.
 * URL: /org/:orgIdShort/:orgNameSlug/command-center/:subBrandSlug
 *
 * Layout:
 *   ┌────────────────────────────┐
 *   │         TOP HERO           │  full-width: nombre + stats rápidas
 *   ├──────────────┬─────────────┤
 *   │              │  PANEL B    │  derecha arriba: Audiencias
 *   │  PANEL A     ├─────────────┤
 *   │ (Campañas)   │  PANEL C    │  derecha abajo: Integraciones
 *   └──────────────┴─────────────┘
 */
class CommandCenterView extends BaseView {
  constructor() {
    super();
    this._subBrandSlug   = '';
    this._organizationId = null;
    this._containerRow   = null;
    this._audiences      = [];
    this._campaigns      = [];
    this._integrations   = [];
  }

  // ── Redirect legacy /command-center/:slug → /org/.../command-center/:slug ────────

  async _redirectLegacy(container) {
    const path = window.location.pathname || '';
    if (path.startsWith('/org/') || !path.startsWith('/command-center/')) return false;

    const orgId = window.appState?.get?.('selectedOrganizationId') || localStorage.getItem('selectedOrganizationId') || '';
    if (!orgId || typeof window.getOrgPathPrefix !== 'function') return false;

    const supabase = window.supabaseService ? await window.supabaseService.getClient() : window.supabase;
    if (!supabase) return false;

    let orgName = '';
    try {
      const { data } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
      if (data?.name) orgName = String(data.name);
    } catch (e) {
      console.warn('CommandCenterView redirect:', e);
    }

    const prefix = window.getOrgPathPrefix(orgId, orgName);
    if (!prefix) return false;

    const slug = this.routeParams?.subBrandSlug || path.replace(/^\/command-center\//, '').split('/')[0];
    if (!slug) return false;

    if (container) container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo…</p></div>';
    window.router?.navigate(`${prefix}/command-center/${encodeURIComponent(slug)}`, true);
    return true;
  }

  _resolveOrgId() {
    return this.routeParams?.orgId || window.currentOrgId
      || window.appState?.get?.('selectedOrganizationId')
      || localStorage.getItem('selectedOrganizationId') || null;
  }

  // ── Auth hook ──────────────────────────────────────────────────────────────────

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  // ── Template ───────────────────────────────────────────────────────────────────

  renderHTML() {
    return `
<div class="cc-page page-content" id="commandCenterPage">

  <!-- TOP HERO: nombre de la sub-marca + quick-stats -->
  <div class="cc-hero card glass-black" id="ccHero">
    <div class="cc-hero-name" id="commandCenterTitle">—</div>
    <div class="cc-hero-stats" id="ccHeroStats">
      <span class="cc-stat" id="ccStatCampaigns"><i class="fas fa-bullhorn"></i> — campañas</span>
      <span class="cc-stat" id="ccStatAudiences"><i class="fas fa-users"></i> — audiencias</span>
      <span class="cc-stat" id="ccStatIntegrations"><i class="fas fa-plug"></i> — integraciones</span>
    </div>
    <a href="#" class="cc-hero-back btn btn-secondary btn-sm" id="commandCenterBackStorage" style="display:none">
      <i class="fas fa-th-large"></i> Brand Storage
    </a>
  </div>

  <!-- BODY: 1 izquierda grande · 2 derecha apiladas -->
  <div class="cc-body">

    <!-- PANEL A — izquierda: Campañas -->
    <section class="cc-panel cc-panel--left card glass-black" aria-label="Campañas">
      <div class="cc-panel-head">
        <h2 class="cc-panel-title"><i class="fas fa-bullhorn"></i> Campañas</h2>
        <span class="cc-panel-count" id="ccCampCount">0</span>
      </div>
      <div class="cc-panel-body" id="ccCampBody">
        <div class="cc-loading"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    </section>

    <!-- Columna derecha: 2 paneles apilados -->
    <div class="cc-right-col">

      <!-- PANEL B — arriba: Audiencias -->
      <section class="cc-panel card glass-black" aria-label="Audiencias">
        <div class="cc-panel-head">
          <h2 class="cc-panel-title"><i class="fas fa-users"></i> Audiencias</h2>
          <span class="cc-panel-count" id="ccAudCount">0</span>
        </div>
        <div class="cc-panel-body" id="ccAudBody">
          <div class="cc-loading"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
      </section>

      <!-- PANEL C — abajo: Integraciones -->
      <section class="cc-panel card glass-black" aria-label="Integraciones">
        <div class="cc-panel-head">
          <h2 class="cc-panel-title"><i class="fas fa-plug"></i> Integraciones</h2>
          <span class="cc-panel-count" id="ccIntCount">0</span>
        </div>
        <div class="cc-panel-body" id="ccIntBody">
          <div class="cc-loading"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
      </section>

    </div>
  </div>

</div>`;
  }

  // ── Render lifecycle ───────────────────────────────────────────────────────────

  async render() {
    const container = document.getElementById('app-container');
    if (await this._redirectLegacy(container)) return;
    await super.render();
    await this._hydrate();
  }

  // ── Data + hydration ───────────────────────────────────────────────────────────

  async _hydrate() {
    this._subBrandSlug   = String(this.routeParams?.subBrandSlug || '').trim().toLowerCase();
    this._organizationId = this._resolveOrgId();

    if (!this._organizationId) {
      this._setError('Sin organización activa. Inicia sesión de nuevo.');
      this.updateHeaderContext('Command Center', '—', window.currentOrgName || '');
      return;
    }

    const supabase = window.supabaseService ? await window.supabaseService.getClient() : window.supabase;
    if (!supabase) { this._setError('Sin conexión a la base de datos.'); return; }

    const slugFn = typeof window.getOrgSlug === 'function'
      ? window.getOrgSlug
      : (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // 1. Resolver brand_container por slug
    let containers = [];
    try {
      const { data } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, created_at')
        .eq('organization_id', this._organizationId)
        .order('created_at', { ascending: false });
      containers = Array.isArray(data) ? data : [];
    } catch (e) { console.warn('CommandCenterView:', e); }

    const match = containers.find((r) => slugFn(r.nombre_marca) === this._subBrandSlug);

    if (!match) {
      this._setError('Sub-marca no encontrada. Verifica el nombre en Brand Storage.');
      this.updateHeaderContext('Command Center', this._subBrandSlug || '—', window.currentOrgName || '');
      return;
    }

    this._containerRow = match;
    const displayName  = String(match.nombre_marca || 'Sub-marca').trim();
    const titleEl      = document.getElementById('commandCenterTitle');
    if (titleEl) titleEl.textContent = displayName;

    // Back button
    const backBtn = document.getElementById('commandCenterBackStorage');
    if (backBtn) {
      const href = window.appNavigation?.getUserSidebarRoute?.('brand-storage') || '/brand-storage';
      backBtn.href = href;
      backBtn.setAttribute('data-route', href);
      backBtn.style.display = '';
    }

    this.updateHeaderContext('Command Center', displayName, window.currentOrgName || '');

    // 2. Cargar datos en paralelo
    const bid = match.id;
    try {
      const [audRes, campRes, intRes] = await Promise.all([
        supabase.from('audiences')
          .select('id, name, description, awareness_level, datos_demograficos, datos_psicograficos, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase.from('campaigns')
          .select('id, nombre_campana, descripcion_interna, contexto_temporal, objetivos_estrategicos, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase.from('brand_integrations')
          .select('id, platform, external_account_name, is_active, last_sync_at, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
      ]);
      this._audiences    = !audRes.error  && Array.isArray(audRes.data)  ? audRes.data  : [];
      this._campaigns    = !campRes.error && Array.isArray(campRes.data) ? campRes.data : [];
      this._integrations = !intRes.error  && Array.isArray(intRes.data)  ? intRes.data  : [];
    } catch (e) {
      console.warn('CommandCenterView fetch:', e);
      this._audiences = []; this._campaigns = []; this._integrations = [];
    }

    // 3. Actualizar hero stats
    const sc = document.getElementById('ccStatCampaigns');
    const sa = document.getElementById('ccStatAudiences');
    const si = document.getElementById('ccStatIntegrations');
    if (sc) sc.innerHTML = `<i class="fas fa-bullhorn"></i> ${this._campaigns.length} campaña${this._campaigns.length !== 1 ? 's' : ''}`;
    if (sa) sa.innerHTML = `<i class="fas fa-users"></i> ${this._audiences.length} audiencia${this._audiences.length !== 1 ? 's' : ''}`;
    if (si) si.innerHTML = `<i class="fas fa-plug"></i> ${this._integrations.length} integración${this._integrations.length !== 1 ? 'es' : ''}`;

    // 4. Renderizar paneles
    this._renderCampaigns();
    this._renderAudiences();
    this._renderIntegrations();
    this.updateLinksForRouter();
  }

  // ── Paneles ────────────────────────────────────────────────────────────────────

  _renderCampaigns() {
    const body    = document.getElementById('ccCampBody');
    const countEl = document.getElementById('ccCampCount');
    if (countEl) countEl.textContent = String(this._campaigns.length);
    if (!body) return;

    if (!this._campaigns.length) {
      body.innerHTML = this._empty('No hay campañas configuradas para esta sub-marca.');
      return;
    }
    body.innerHTML = `<ul class="cc-list">
      ${this._campaigns.map((c) => {
        const name   = this.escapeHtml(c.nombre_campana || 'Sin nombre');
        const desc   = c.descripcion_interna ? this.escapeHtml(String(c.descripcion_interna).slice(0, 120)) : '';
        const ctx    = c.contexto_temporal ? this.escapeHtml(c.contexto_temporal) : '';
        const date   = this._fmtDate(c.updated_at);
        return `
          <li class="cc-list-item">
            <div class="cc-list-main">
              <span class="cc-list-name">${name}</span>
              ${desc ? `<p class="cc-list-desc">${desc}${String(c.descripcion_interna || '').length > 120 ? '…' : ''}</p>` : ''}
            </div>
            <div class="cc-list-aside">
              ${ctx ? `<span class="cc-badge">${ctx}</span>` : ''}
              <span class="cc-date">${this.escapeHtml(date)}</span>
            </div>
          </li>`;
      }).join('')}
    </ul>`;
  }

  _renderAudiences() {
    const body    = document.getElementById('ccAudBody');
    const countEl = document.getElementById('ccAudCount');
    if (countEl) countEl.textContent = String(this._audiences.length);
    if (!body) return;

    if (!this._audiences.length) {
      body.innerHTML = this._empty('No hay audiencias definidas para esta sub-marca.');
      return;
    }
    body.innerHTML = `<ul class="cc-list">
      ${this._audiences.map((a) => {
        const name  = this.escapeHtml(a.name || 'Sin nombre');
        const level = a.awareness_level ? this.escapeHtml(a.awareness_level) : '';
        const date  = this._fmtDate(a.updated_at);
        const demo  = a.datos_demograficos && typeof a.datos_demograficos === 'object'
          ? this.escapeHtml(Object.entries(a.datos_demograficos).slice(0, 2).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · '))
          : '';
        return `
          <li class="cc-list-item">
            <div class="cc-list-main">
              <span class="cc-list-name">${name}</span>
              ${demo ? `<p class="cc-list-desc">${demo}</p>` : ''}
            </div>
            <div class="cc-list-aside">
              ${level ? `<span class="cc-badge">${level}</span>` : ''}
              <span class="cc-date">${this.escapeHtml(date)}</span>
            </div>
          </li>`;
      }).join('')}
    </ul>`;
  }

  _renderIntegrations() {
    const body    = document.getElementById('ccIntBody');
    const countEl = document.getElementById('ccIntCount');
    if (countEl) countEl.textContent = String(this._integrations.length);
    if (!body) return;

    if (!this._integrations.length) {
      body.innerHTML = this._empty('Sin cuentas conectadas. Conecta Meta, Google u otros desde Brand Storage.');
      return;
    }
    body.innerHTML = `<ul class="cc-list">
      ${this._integrations.map((i) => {
        const platform = this.escapeHtml(i.platform || 'Plataforma');
        const account  = this.escapeHtml(i.external_account_name || 'Cuenta');
        const sync     = this._fmtDate(i.last_sync_at || i.updated_at);
        const active   = !!i.is_active;
        return `
          <li class="cc-list-item">
            <div class="cc-list-main">
              <span class="cc-list-name">${platform}</span>
              <p class="cc-list-desc">${account}</p>
            </div>
            <div class="cc-list-aside">
              <span class="cc-badge cc-badge--${active ? 'on' : 'off'}">${active ? 'Activa' : 'Inactiva'}</span>
              <span class="cc-date">${this.escapeHtml(sync)}</span>
            </div>
          </li>`;
      }).join('')}
    </ul>`;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────

  _setError(msg) {
    ['ccCampBody', 'ccAudBody', 'ccIntBody'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<p class="cc-empty-msg">${this.escapeHtml(msg)}</p>`;
    });
    ['ccCampCount', 'ccAudCount', 'ccIntCount'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0';
    });
  }

  _empty(msg) {
    return `<p class="cc-empty-msg">${this.escapeHtml(msg)}</p>`;
  }

  _fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
  }
}

window.CommandCenterView = CommandCenterView;
