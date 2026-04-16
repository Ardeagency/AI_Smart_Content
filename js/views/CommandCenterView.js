/**
 * CommandCenterView — Dashboard de campañas y audiencias por sub-marca.
 * URL: /org/.../command-center/:subBrandSlug
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  AUDIENCIAS (Supabase)  — bloque ancho arriba                   │
 *   ├────────────────────────┬──────────────┬──────────────────────────┤
 *   │  Campañas (Supabase)   │  Campañas    │  Audiencias              │
 *   │                        │  (API)       │  (API)                   │
 *   └────────────────────────┴──────────────┴──────────────────────────┘
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

  /* ── Redirect legacy (sin /org/) ─────────────────────────────────── */
  async _redirectLegacyIfNeeded(container) {
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
    } catch (e) { /* noop */ }
    const prefix = window.getOrgPathPrefix(orgId, orgName);
    if (!prefix) return false;
    const slug = (this.routeParams && this.routeParams.subBrandSlug) ||
      path.replace(/^\/command-center\//, '').split('/')[0];
    if (!slug) return false;
    if (container) container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo…</p></div>';
    window.router?.navigate(`${prefix}/command-center/${encodeURIComponent(slug)}${window.location.search || ''}`, true);
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

  /* ── Lifecycle ────────────────────────────────────────────────────── */
  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  /* ── HTML ─────────────────────────────────────────────────────────── */
  renderHTML() {
    return `
<div class="cc-page page-content" id="commandCenterPage">

  <!-- Bloque de audiencias Supabase — ancho completo arriba -->
  <section class="cc-panel card glass-black" id="ccPanelAudiences">
    <div class="cc-panel-head">
      <div class="cc-panel-title">
        <i class="fas fa-users"></i>
        Audiencias
        <span class="cc-panel-subtitle">Plataforma</span>
      </div>
      <span class="cc-panel-count" id="ccAudCount">—</span>
    </div>
    <div class="cc-panel-body" id="ccAudBody">
      <div class="cc-loading"><span></span><span></span><span></span></div>
    </div>
  </section>

  <!-- Fila inferior: 3 bloques -->
  <div class="cc-bottom-row">

    <!-- Izquierda: Campañas Supabase -->
    <section class="cc-panel card glass-black" id="ccPanelCampaigns">
      <div class="cc-panel-head">
        <div class="cc-panel-title">
          <i class="fas fa-bullhorn"></i>
          Campañas
          <span class="cc-panel-subtitle">Plataforma</span>
        </div>
        <span class="cc-panel-count" id="ccCampCount">—</span>
      </div>
      <div class="cc-panel-body" id="ccCampBody">
        <div class="cc-loading"><span></span><span></span><span></span></div>
      </div>
    </section>

    <!-- Centro: Campañas de API -->
    <section class="cc-panel card glass-black" id="ccPanelApiCampaigns">
      <div class="cc-panel-head">
        <div class="cc-panel-title">
          <i class="fas fa-satellite-dish"></i>
          Campañas
          <span class="cc-panel-subtitle">Integraciones</span>
        </div>
        <span class="cc-panel-count" id="ccApiCampCount">—</span>
      </div>
      <div class="cc-panel-body" id="ccApiCampBody">
        <div class="cc-loading"><span></span><span></span><span></span></div>
      </div>
    </section>

    <!-- Derecha: Audiencias de API -->
    <section class="cc-panel card glass-black" id="ccPanelApiAudiences">
      <div class="cc-panel-head">
        <div class="cc-panel-title">
          <i class="fas fa-plug"></i>
          Audiencias
          <span class="cc-panel-subtitle">Integraciones</span>
        </div>
        <span class="cc-panel-count" id="ccApiAudCount">—</span>
      </div>
      <div class="cc-panel-body" id="ccApiAudBody">
        <div class="cc-loading"><span></span><span></span><span></span></div>
      </div>
    </section>

  </div>
</div>`;
  }

  /* ── Render ───────────────────────────────────────────────────────── */
  async render() {
    const container = document.getElementById('app-container');
    if (await this._redirectLegacyIfNeeded(container)) return;
    await super.render();
    await this._loadData();
  }

  /* ── Data fetching ────────────────────────────────────────────────── */
  async _loadData() {
    this._subBrandSlug = String(this.routeParams?.subBrandSlug || '').trim().toLowerCase();
    this._organizationId = this._resolveOrganizationId();

    if (!this._organizationId) {
      this.updateHeaderContext('Command Center', this._subBrandSlug || '—', window.currentOrgName || '');
      this._setPanelsError('Selecciona una organización o inicia sesión de nuevo.');
      return;
    }

    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;

    if (!supabase) {
      this._setPanelsError('No hay conexión con la base de datos.');
      return;
    }

    const slugFn = typeof window.getOrgSlug === 'function'
      ? window.getOrgSlug
      : (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Resolver brand_container por slug
    let match = null;
    try {
      const { data } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, created_at')
        .eq('organization_id', this._organizationId)
        .order('created_at', { ascending: false });
      const containers = Array.isArray(data) ? data : [];
      match = containers.find((r) => slugFn(r.nombre_marca) === this._subBrandSlug) || null;
    } catch (e) {
      console.warn('CommandCenterView: brand_containers', e);
    }

    const displayName = match
      ? (String(match.nombre_marca || '').trim() || 'Sub-marca')
      : this._subBrandSlug || '—';

    this.updateHeaderContext('Command Center', displayName, window.currentOrgName || '');

    if (!match) {
      this._setPanelsError(`No se encontró la sub-marca "${displayName}". Revisa el nombre en Brand Storage.`);
      return;
    }

    this._containerRow = match;
    const bid = match.id;

    try {
      const [audRes, campRes, intRes] = await Promise.all([
        supabase
          .from('audiences')
          .select('id, name, description, awareness_level, datos_demograficos, datos_psicograficos, dolores, deseos, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase
          .from('campaigns')
          .select('id, nombre_campana, descripcion_interna, contexto_temporal, objetivos_estrategicos, tono_modificador, audience_id, updated_at, created_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase
          .from('brand_integrations')
          .select('id, platform, external_account_name, is_active, token_expires_at, metadata, last_sync_at, updated_at')
          .eq('brand_container_id', bid)
          .order('platform', { ascending: true }),
      ]);
      this._audiences = !audRes.error && Array.isArray(audRes.data) ? audRes.data : [];
      this._campaigns = !campRes.error && Array.isArray(campRes.data) ? campRes.data : [];
      this._integrations = !intRes.error && Array.isArray(intRes.data) ? intRes.data : [];
    } catch (e) {
      console.warn('CommandCenterView: fetch', e);
      this._audiences = [];
      this._campaigns = [];
      this._integrations = [];
    }

    this._renderAll();
    this.updateLinksForRouter();
  }

  /* ── Render panels ────────────────────────────────────────────────── */
  _renderAll() {
    this._renderAudiences();
    this._renderCampaigns();
    this._renderApiCampaigns();
    this._renderApiAudiences();
  }

  /* Audiencias (Supabase) */
  _renderAudiences() {
    const body = document.getElementById('ccAudBody');
    const count = document.getElementById('ccAudCount');
    const rows = this._audiences;
    if (count) count.textContent = String(rows.length);
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = this._emptyState('Aún no hay audiencias definidas para esta sub-marca.');
      return;
    }

    body.innerHTML = `<div class="cc-audience-grid">
      ${rows.map((a) => {
        const demo = (a.datos_demograficos && typeof a.datos_demograficos === 'object') ? a.datos_demograficos : {};
        const psycho = (a.datos_psicograficos && typeof a.datos_psicograficos === 'object') ? a.datos_psicograficos : {};
        const tags = [
          demo.edad && this._tag(String(demo.edad), 'blue'),
          demo.genero && this._tag(String(demo.genero), 'teal'),
          demo.ubicacion && this._tag(String(demo.ubicacion), 'gray'),
          a.awareness_level && this._tag(String(a.awareness_level), 'purple'),
        ].filter(Boolean).join('');
        const painItems = Array.isArray(a.dolores) && a.dolores.length
          ? a.dolores.slice(0, 2).map((d) => `<li>${this.escapeHtml(String(d))}</li>`).join('')
          : '';
        const deseos = Array.isArray(a.deseos) && a.deseos.length
          ? a.deseos.slice(0, 2).map((d) => `<li>${this.escapeHtml(String(d))}</li>`).join('')
          : '';
        return `
        <div class="cc-aud-card">
          <div class="cc-aud-card-head">
            <span class="cc-aud-name">${this.escapeHtml(a.name || 'Sin nombre')}</span>
            ${tags ? `<div class="cc-aud-tags">${tags}</div>` : ''}
          </div>
          ${a.description ? `<p class="cc-aud-desc">${this.escapeHtml(String(a.description).slice(0, 120))}${a.description.length > 120 ? '…' : ''}</p>` : ''}
          ${painItems || deseos ? `
          <div class="cc-aud-insights">
            ${painItems ? `<div class="cc-aud-insight-col"><div class="cc-aud-insight-label">Dolores</div><ul>${painItems}</ul></div>` : ''}
            ${deseos ? `<div class="cc-aud-insight-col"><div class="cc-aud-insight-label">Deseos</div><ul>${deseos}</ul></div>` : ''}
          </div>` : ''}
          <div class="cc-aud-footer">
            <span class="cc-date">${this._fmtDate(a.updated_at)}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  /* Campañas (Supabase) */
  _renderCampaigns() {
    const body = document.getElementById('ccCampBody');
    const count = document.getElementById('ccCampCount');
    const rows = this._campaigns;
    if (count) count.textContent = String(rows.length);
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = this._emptyState('Aún no hay campañas definidas para esta sub-marca.');
      return;
    }

    body.innerHTML = rows.map((c) => {
      const obj = Array.isArray(c.objetivos_estrategicos) ? c.objetivos_estrategicos : [];
      return `
      <div class="cc-camp-item">
        <div class="cc-camp-item-head">
          <span class="cc-camp-name">${this.escapeHtml(c.nombre_campana || 'Campaña')}</span>
          ${c.contexto_temporal ? this._tag(String(c.contexto_temporal), 'blue') : ''}
        </div>
        ${c.descripcion_interna ? `<p class="cc-camp-desc">${this.escapeHtml(String(c.descripcion_interna).slice(0, 100))}${c.descripcion_interna.length > 100 ? '…' : ''}</p>` : ''}
        ${obj.length ? `<div class="cc-camp-obj">${obj.slice(0, 2).map((o) => `<span>${this.escapeHtml(String(o))}</span>`).join('')}</div>` : ''}
        <div class="cc-camp-date">${this._fmtDate(c.updated_at || c.created_at)}</div>
      </div>`;
    }).join('');
  }

  /* Campañas de APIs (desde metadata de integraciones) */
  _renderApiCampaigns() {
    const body = document.getElementById('ccApiCampBody');
    const count = document.getElementById('ccApiCampCount');
    if (!body) return;

    const metaInt = this._integrations.filter((i) =>
      String(i.platform || '').toLowerCase().includes('meta') ||
      String(i.platform || '').toLowerCase().includes('facebook')
    );

    const campaigns = [];
    metaInt.forEach((intg) => {
      const meta = (intg.metadata && typeof intg.metadata === 'object') ? intg.metadata : {};
      const list = Array.isArray(meta.campaigns) ? meta.campaigns : [];
      list.forEach((c) => {
        campaigns.push({ ...c, _platform: intg.platform, _account: intg.external_account_name });
      });
    });

    if (count) count.textContent = String(campaigns.length || metaInt.length || 0);

    if (!campaigns.length) {
      if (metaInt.length) {
        body.innerHTML = this._integrationCards(metaInt, 'Cuentas conectadas — datos de campañas pendientes de sincronización.');
      } else {
        body.innerHTML = this._emptyState('Conecta Meta Ads u otras plataformas desde Brand Storage para ver campañas de las APIs.');
      }
      return;
    }

    body.innerHTML = campaigns.map((c) => {
      const status = c.status || c.effective_status || '';
      const statusColor = status === 'ACTIVE' ? 'green' : status === 'PAUSED' ? 'orange' : 'gray';
      return `
      <div class="cc-api-item">
        <div class="cc-api-item-head">
          <span class="cc-api-name">${this.escapeHtml(c.name || c.id || 'Campaña')}</span>
          ${status ? this._tag(status, statusColor) : ''}
        </div>
        ${c.objective ? `<div class="cc-api-meta">${this.escapeHtml(c.objective)}</div>` : ''}
        ${c._account ? `<div class="cc-api-account">${this.escapeHtml(c._account)}</div>` : ''}
      </div>`;
    }).join('');
  }

  /* Audiencias de APIs (desde metadata de integraciones) */
  _renderApiAudiences() {
    const body = document.getElementById('ccApiAudBody');
    const count = document.getElementById('ccApiAudCount');
    if (!body) return;

    const allInt = this._integrations;

    const apiAudiences = [];
    allInt.forEach((intg) => {
      const meta = (intg.metadata && typeof intg.metadata === 'object') ? intg.metadata : {};
      const list = Array.isArray(meta.audiences) ? meta.audiences
        : Array.isArray(meta.custom_audiences) ? meta.custom_audiences
        : [];
      list.forEach((a) => {
        apiAudiences.push({ ...a, _platform: intg.platform, _account: intg.external_account_name });
      });
    });

    if (count) count.textContent = String(apiAudiences.length || allInt.length || 0);

    if (!apiAudiences.length) {
      if (allInt.length) {
        body.innerHTML = this._integrationCards(allInt, 'Cuentas conectadas — datos de audiencias pendientes de sincronización.');
      } else {
        body.innerHTML = this._emptyState('Conecta Meta, Google u otras plataformas desde Brand Storage para ver audiencias sincronizadas.');
      }
      return;
    }

    body.innerHTML = apiAudiences.map((a) => {
      const sz = a.approximate_count || a.size;
      return `
      <div class="cc-api-item">
        <div class="cc-api-item-head">
          <span class="cc-api-name">${this.escapeHtml(a.name || a.id || 'Audiencia')}</span>
          ${a.subtype ? this._tag(String(a.subtype), 'purple') : ''}
        </div>
        ${sz != null ? `<div class="cc-api-meta">${Number(sz).toLocaleString('es-ES')} personas aprox.</div>` : ''}
        ${a._account ? `<div class="cc-api-account">${this.escapeHtml(a._account)}</div>` : ''}
      </div>`;
    }).join('');
  }

  /* ── Helpers ─────────────────────────────────────────────────────── */
  _integrationCards(intgs, hint) {
    return `
      <div class="cc-int-hint text-muted">${this.escapeHtml(hint)}</div>
      ${intgs.map((i) => `
        <div class="cc-int-item">
          <div class="cc-int-head">
            <span class="cc-int-platform">${this.escapeHtml(i.platform || 'Plataforma')}</span>
            ${this._tag(i.is_active ? 'Activa' : 'Inactiva', i.is_active ? 'green' : 'gray')}
          </div>
          <div class="cc-int-account text-muted">${this.escapeHtml(i.external_account_name || '')}</div>
          ${i.last_sync_at ? `<div class="cc-date">Sync: ${this._fmtDate(i.last_sync_at)}</div>` : ''}
        </div>`).join('')}`;
  }

  _emptyState(msg) {
    return `<div class="cc-empty"><i class="fas fa-inbox"></i><span>${this.escapeHtml(msg)}</span></div>`;
  }

  _tag(text, color) {
    return `<span class="cc-tag cc-tag--${color}">${this.escapeHtml(text)}</span>`;
  }

  _fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return '—'; }
  }

  _setPanelsError(msg) {
    ['ccAudBody', 'ccCampBody', 'ccApiCampBody', 'ccApiAudBody'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="cc-empty">${this.escapeHtml(msg)}</div>`;
    });
    ['ccAudCount', 'ccCampCount', 'ccApiCampCount', 'ccApiAudCount'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0';
    });
  }
}

window.CommandCenterView = CommandCenterView;
