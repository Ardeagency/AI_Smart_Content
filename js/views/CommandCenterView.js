/**
 * CommandCenterView — Centro de comando por sub-marca.
 * URL con slug legible (misma lógica que getOrgSlug): /org/.../command-center/:subBrandSlug
 * Muestra audiencias y campañas en la plataforma + cuentas de integración enlazadas a esa sub-marca.
 */
class CommandCenterView extends BaseView {
  constructor() {
    super();
    this._subBrandSlug = '';
    this._organizationId = null;
    this._containerRow = null;
    this._audiences = [];
    this._campaigns = [];
    this._integrations = [];
  }

  /**
   * Ruta legacy sin prefijo /org/... → canonicaliza a /org/{short}/{nameSlug}/command-center/:slug
   * @returns {Promise<boolean>} true si hubo redirección (no continuar render)
   */
  async _redirectLegacyCommandCenterToOrg(container) {
    const path = window.location.pathname || '';
    if (path.startsWith('/org/')) return false;
    if (!path.startsWith('/command-center/')) return false;

    const orgId =
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      '';
    if (!orgId || typeof window.getOrgPathPrefix !== 'function') return false;

    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    if (!supabase) return false;

    let orgName = '';
    try {
      const { data, error } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
      if (!error && data?.name) orgName = String(data.name);
    } catch (e) {
      console.warn('CommandCenterView: org name', e);
    }

    const prefix = window.getOrgPathPrefix(orgId, orgName);
    if (!prefix) return false;

    const slug = (this.routeParams && this.routeParams.subBrandSlug) || path.replace(/^\/command-center\//, '').split('/')[0];
    if (!slug) return false;

    const target = `${prefix}/command-center/${encodeURIComponent(slug)}`;
    if (container) {
      container.innerHTML = '<div class="page-content command-center-page"><p class="text-muted">Redirigiendo…</p></div>';
    }
    if (window.router) window.router.navigate(target + (window.location.search || ''), true);
    return true;
  }

  _resolveOrganizationId() {
    return (
      this.routeParams?.orgId ||
      window.currentOrgId ||
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      null
    );
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) {
        window.router?.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  renderHTML() {
    return `
<div class="command-center-page page-content" id="commandCenterPage">
  <div class="command-center-hero card glass-black" id="commandCenterHero">
    <div class="command-center-hero-main">
      <p class="command-center-kicker">Brand Storage</p>
      <h1 class="command-center-title" id="commandCenterTitle">Cargando…</h1>
      <p class="command-center-slug" id="commandCenterSlug"></p>
    </div>
    <a href="#" class="btn btn-secondary btn-sm" id="commandCenterBackStorage" style="display:none">
      <i class="fas fa-th-large"></i> Galería Brand Storage
    </a>
  </div>

  <div class="command-center-grid">
    <section class="command-center-panel card glass-black" aria-labelledby="cc-audiences-title">
      <div class="command-center-panel-head">
        <h2 id="cc-audiences-title"><i class="fas fa-users"></i> Audiencias (plataforma)</h2>
        <span class="command-center-count" id="ccAudiencesCount">0</span>
      </div>
      <div class="command-center-panel-body" id="ccAudiencesBody">
        <p class="text-muted command-center-muted">Cargando…</p>
      </div>
    </section>

    <section class="command-center-panel card glass-black" aria-labelledby="cc-campaigns-title">
      <div class="command-center-panel-head">
        <h2 id="cc-campaigns-title"><i class="fas fa-bullhorn"></i> Campañas (plataforma)</h2>
        <span class="command-center-count" id="ccCampaignsCount">0</span>
      </div>
      <div class="command-center-panel-body" id="ccCampaignsBody">
        <p class="text-muted command-center-muted">Cargando…</p>
      </div>
    </section>

    <section class="command-center-panel command-center-panel--wide card glass-black" aria-labelledby="cc-integrations-title">
      <div class="command-center-panel-head">
        <h2 id="cc-integrations-title"><i class="fas fa-plug"></i> Integraciones (cuentas conectadas)</h2>
        <span class="command-center-count" id="ccIntegrationsCount">0</span>
      </div>
      <p class="command-center-hint text-muted">Cuentas enlazadas a esta sub-marca. Los datos sincronizados alimentan el dashboard y el resto del workspace.</p>
      <div class="command-center-panel-body" id="ccIntegrationsBody">
        <p class="text-muted command-center-muted">Cargando…</p>
      </div>
    </section>
  </div>
</div>`;
  }

  async render() {
    const container = document.getElementById('app-container');
    if (await this._redirectLegacyCommandCenterToOrg(container)) return;
    await super.render();
    await this._hydrateCommandCenter();
  }

  async _hydrateCommandCenter() {
    this._subBrandSlug = String((this.routeParams && this.routeParams.subBrandSlug) || '')
      .trim()
      .toLowerCase();
    this._organizationId = this._resolveOrganizationId();

    const heroTitle = document.getElementById('commandCenterTitle');
    const heroSlug = document.getElementById('commandCenterSlug');
    const backBtn = document.getElementById('commandCenterBackStorage');

    if (!this._organizationId) {
      if (heroTitle) heroTitle.textContent = 'Sin organización';
      if (heroSlug) heroSlug.textContent = '';
      this._setBodiesError('Selecciona una organización o inicia sesión de nuevo.');
      this.updateHeaderContext('Command Center', this._subBrandSlug || '—', window.currentOrgName || '');
      return;
    }

    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    if (!supabase) {
      this._setBodiesError('No hay conexión con la base de datos.');
      return;
    }

    const slugFn = typeof window.getOrgSlug === 'function' ? window.getOrgSlug : (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let containers = [];
    try {
      const { data, error } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, created_at')
        .eq('organization_id', this._organizationId)
        .order('created_at', { ascending: false });
      if (error) console.warn('CommandCenterView: brand_containers', error);
      containers = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('CommandCenterView:', e);
    }

    const match = containers.find((row) => slugFn(row.nombre_marca) === this._subBrandSlug);

    if (!match) {
      if (heroTitle) heroTitle.textContent = 'Sub-marca no encontrada';
      if (heroSlug) heroSlug.textContent = this._subBrandSlug ? `/${this._subBrandSlug}/` : '';
      this._setBodiesError('No existe una sub-marca con este slug en tu organización. Revisa el nombre en Brand Storage.');
      this.updateHeaderContext('Command Center', this._subBrandSlug || '—', window.currentOrgName || '');
      return;
    }

    this._containerRow = match;
    const displayName = (match.nombre_marca && String(match.nombre_marca).trim()) || 'Sub-marca';
    if (heroTitle) heroTitle.textContent = displayName;
    if (heroSlug) heroSlug.textContent = this._subBrandSlug ? `/${this._subBrandSlug}/` : '';

    const storageHref =
      window.appNavigation && typeof window.appNavigation.getUserSidebarRoute === 'function'
        ? window.appNavigation.getUserSidebarRoute('brand-storage')
        : '/brand-storage';
    if (backBtn) {
      backBtn.href = storageHref;
      backBtn.setAttribute('data-route', storageHref);
      backBtn.style.display = '';
    }

    this.updateHeaderContext('Command Center', displayName, window.currentOrgName || '');

    const bid = match.id;
    try {
      const [audRes, campRes, intRes] = await Promise.all([
        supabase
          .from('audiences')
          .select('id, name, description, awareness_level, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase
          .from('campaigns')
          .select('id, nombre_campana, descripcion_interna, contexto_temporal, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase
          .from('brand_integrations')
          .select('id, platform, external_account_name, is_active, last_sync_at, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
      ]);

      this._audiences = !audRes.error && Array.isArray(audRes.data) ? audRes.data : [];
      this._campaigns = !campRes.error && Array.isArray(campRes.data) ? campRes.data : [];
      this._integrations = !intRes.error && Array.isArray(intRes.data) ? intRes.data : [];
    } catch (e) {
      console.warn('CommandCenterView: fetch panels', e);
      this._audiences = [];
      this._campaigns = [];
      this._integrations = [];
    }

    this._renderAudiencesPanel();
    this._renderCampaignsPanel();
    this._renderIntegrationsPanel();
    this.updateLinksForRouter();
  }

  _setBodiesError(msg) {
    const esc = this.escapeHtml(msg);
    ['ccAudiencesBody', 'ccCampaignsBody', 'ccIntegrationsBody'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<p class="command-center-error">${esc}</p>`;
    });
    const c1 = document.getElementById('ccAudiencesCount');
    const c2 = document.getElementById('ccCampaignsCount');
    const c3 = document.getElementById('ccIntegrationsCount');
    if (c1) c1.textContent = '0';
    if (c2) c2.textContent = '0';
    if (c3) c3.textContent = '0';
  }

  _fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '—';
    }
  }

  _renderAudiencesPanel() {
    const body = document.getElementById('ccAudiencesBody');
    const countEl = document.getElementById('ccAudiencesCount');
    if (countEl) countEl.textContent = String(this._audiences.length);
    if (!body) return;
    if (!this._audiences.length) {
      body.innerHTML = '<p class="text-muted command-center-muted">No hay audiencias definidas en la plataforma para esta sub-marca.</p>';
      return;
    }
    body.innerHTML = `<ul class="command-center-list">
      ${this._audiences
        .map(
          (a) => `
        <li class="command-center-list-item">
          <div class="command-center-list-main">
            <span class="command-center-list-title">${this.escapeHtml(a.name || 'Sin nombre')}</span>
            ${a.description ? `<p class="command-center-list-desc">${this.escapeHtml(String(a.description).slice(0, 160))}${String(a.description).length > 160 ? '…' : ''}</p>` : ''}
          </div>
          <div class="command-center-list-meta">
            ${a.awareness_level ? `<span class="command-center-badge">${this.escapeHtml(a.awareness_level)}</span>` : ''}
            <span class="command-center-date">${this.escapeHtml(this._fmtDate(a.updated_at))}</span>
          </div>
        </li>`
        )
        .join('')}
    </ul>`;
  }

  _renderCampaignsPanel() {
    const body = document.getElementById('ccCampaignsBody');
    const countEl = document.getElementById('ccCampaignsCount');
    if (countEl) countEl.textContent = String(this._campaigns.length);
    if (!body) return;
    if (!this._campaigns.length) {
      body.innerHTML = '<p class="text-muted command-center-muted">No hay campañas configuradas en la plataforma para esta sub-marca.</p>';
      return;
    }
    body.innerHTML = `<ul class="command-center-list">
      ${this._campaigns
        .map(
          (c) => `
        <li class="command-center-list-item">
          <div class="command-center-list-main">
            <span class="command-center-list-title">${this.escapeHtml(c.nombre_campana || 'Sin nombre')}</span>
            ${c.descripcion_interna ? `<p class="command-center-list-desc">${this.escapeHtml(String(c.descripcion_interna).slice(0, 160))}${String(c.descripcion_interna).length > 160 ? '…' : ''}</p>` : ''}
          </div>
          <div class="command-center-list-meta">
            ${c.contexto_temporal ? `<span class="command-center-badge">${this.escapeHtml(c.contexto_temporal)}</span>` : ''}
            <span class="command-center-date">${this.escapeHtml(this._fmtDate(c.updated_at))}</span>
          </div>
        </li>`
        )
        .join('')}
    </ul>`;
  }

  _renderIntegrationsPanel() {
    const body = document.getElementById('ccIntegrationsBody');
    const countEl = document.getElementById('ccIntegrationsCount');
    if (countEl) countEl.textContent = String(this._integrations.length);
    if (!body) return;
    if (!this._integrations.length) {
      body.innerHTML =
        '<p class="text-muted command-center-muted">No hay cuentas de integración enlazadas. Conecta Meta, Google u otros desde Brand Storage.</p>';
      return;
    }
    body.innerHTML = `<ul class="command-center-list">
      ${this._integrations
        .map(
          (i) => `
        <li class="command-center-list-item">
          <div class="command-center-list-main">
            <span class="command-center-list-title">${this.escapeHtml(i.platform || 'Plataforma')}</span>
            <p class="command-center-list-desc">${this.escapeHtml(i.external_account_name || 'Cuenta')}</p>
          </div>
          <div class="command-center-list-meta">
            <span class="command-center-badge${i.is_active ? '' : ' command-center-badge--muted'}">${i.is_active ? 'Activa' : 'Inactiva'}</span>
            <span class="command-center-date" title="Última sincronización">${this.escapeHtml(this._fmtDate(i.last_sync_at || i.updated_at))}</span>
          </div>
        </li>`
        )
        .join('')}
    </ul>`;
  }
}

window.CommandCenterView = CommandCenterView;
