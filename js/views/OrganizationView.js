/**
 * OrganizationView - Configuración de la organización (workspace)
 * Permite al usuario consumidor administrar datos administrativos y técnicos:
 * nombre, miembros, roles, y previsualizar metadata (id, créditos, propietario, etc).
 * No es un dashboard; es una página de configuración.
 */
class OrganizationView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.orgId = null;
    this.org = null;
    this.members = [];
    this.brandContainers = [];
    this.organizationIntegrations = [];
    this.integrationsSummary = { active: 0, total: 0 };
    this.credits = { credits_available: 0, credits_total: 0, updated_at: null };
    this.storage = { used_mb: 0, max_mb: 0, updated_at: null };
    this.isOwner = false;
    this.canManageMembers = false;
  }

  renderHTML() {
    return `
<div class="organization-container">
    <div class="organization-header">
        <h1 class="organization-title">Configuración de la organización</h1>
        <p class="organization-subtitle">Administra los datos y la información técnica de tu espacio de trabajo.</p>
    </div>

    <!-- Tabs -->
    <div class="organization-tabs" role="tablist">
        <button type="button" class="tab-btn active" data-tab="overview" role="tab" aria-selected="true">Información general</button>
        <button type="button" class="tab-btn" data-tab="users" role="tab" aria-selected="false">Usuarios y roles</button>
        <button type="button" class="tab-btn" data-tab="permissions" role="tab" aria-selected="false">Permisos</button>
        <button type="button" class="tab-btn" data-tab="integrations" role="tab" aria-selected="false">Integraciones</button>
        <button type="button" class="tab-btn" data-tab="business-units" role="tab" aria-selected="false">Unidades de negocio</button>
        <button type="button" class="tab-btn" data-tab="billing" role="tab" aria-selected="false">Facturación</button>
    </div>

    <div class="organization-content">
        <!-- Tab: Información general -->
        <div class="tab-content active" id="overviewTab" role="tabpanel">
            <div class="organization-overview">
                <section class="org-section org-section-form">
                    <h2>Datos de la organización</h2>
                    <p class="org-section-desc">Nombre y datos editables del espacio de trabajo.</p>
                    <form id="orgGeneralForm" class="org-form">
                        <div class="form-group">
                            <label for="orgName">Nombre de la organización</label>
                            <input type="text" id="orgName" name="name" class="form-input" required placeholder="Ej. Mi Empresa">
                        </div>
                        <div class="form-group">
                            <label for="orgBrandNameOficial">Nombre oficial de marca</label>
                            <input type="text" id="orgBrandNameOficial" name="brand_name_oficial" class="form-input" placeholder="Nombre comercial oficial">
                        </div>
                        <div class="form-group">
                            <label for="orgBrandSlogan">Slogan</label>
                            <input type="text" id="orgBrandSlogan" name="brand_slogan" class="form-input" placeholder="Slogan de la organización">
                        </div>
                        <div class="form-group">
                            <label for="orgLevelAutonomy">Nivel de autonomía del agente</label>
                            <select id="orgLevelAutonomy" name="level_of_autonomy" class="form-input">
                                <option value="manual">Manual — Todas las acciones requieren aprobación</option>
                                <option value="parcial">Parcial — Sugerencias automáticas, acciones manuales</option>
                                <option value="total">Total — El agente actúa de forma autónoma</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary" id="orgGeneralSubmit">
                            <i class="fas fa-save"></i> Guardar cambios
                        </button>
                    </form>
                </section>
                <section class="org-section org-section-meta">
                    <h2>Metadata (solo lectura)</h2>
                    <p class="org-section-desc">Información técnica según el schema: organizaciones, créditos, almacenamiento.</p>
                    <div class="org-metadata" id="orgMetadata">
                        <div class="metadata-row"><span class="metadata-label">ID</span><code class="metadata-value" id="metaId">—</code></div>
                        <div class="metadata-row"><span class="metadata-label">Estado</span><span class="metadata-value" id="metaStatus">—</span></div>
                        <div class="metadata-row"><span class="metadata-label">Creada</span><span class="metadata-value" id="metaCreated">—</span></div>
                        <div class="metadata-row"><span class="metadata-label">Propietario (user_id)</span><code class="metadata-value" id="metaOwner">—</code></div>
                        <div class="metadata-row"><span class="metadata-label">Créditos disponibles</span><span class="metadata-value" id="metaCreditsAvailable">—</span></div>
                        <div class="metadata-row"><span class="metadata-label">Créditos totales</span><span class="metadata-value" id="metaCreditsTotal">—</span></div>
                        <div class="metadata-row"><span class="metadata-label">Créditos (actualizado)</span><span class="metadata-value" id="metaCreditsUpdated">—</span></div>
                        <div class="metadata-row"><span class="metadata-label">Almacenamiento usado (MB)</span><span class="metadata-value" id="metaStorageUsed">—</span></div>
                        <div class="metadata-row"><span class="metadata-label">Almacenamiento máximo (MB)</span><span class="metadata-value" id="metaStorageMax">—</span></div>
                        <div class="metadata-row"><span class="metadata-label">Almacenamiento (actualizado)</span><span class="metadata-value" id="metaStorageUpdated">—</span></div>
                    </div>
                </section>
            </div>
        </div>

        <!-- Tab: Usuarios y roles -->
        <div class="tab-content" id="usersTab" role="tabpanel">
            <div class="organization-users">
                <h2>Usuarios y roles</h2>
                <p class="org-section-desc">Miembros del espacio de trabajo y sus roles. Solo el propietario o un admin pueden invitar o eliminar miembros.</p>
                <div class="org-members-list" id="orgMembersList">
                    <!-- Rellenado por JS -->
                </div>
                <div class="org-members-actions" id="orgMembersActions">
                    <button type="button" class="btn btn-secondary" id="orgInviteMemberBtn" title="Añadir miembro (por email)">
                        <i class="fas fa-user-plus"></i> Añadir miembro
                    </button>
                </div>
            </div>
        </div>

        <!-- Tab: Permisos (placeholder) -->
        <div class="tab-content" id="permissionsTab" role="tabpanel">
            <div class="organization-permissions">
                <h2>Permisos</h2>
                <p class="org-placeholder">Configuración de permisos por rol. Próximamente.</p>
            </div>
        </div>

        <!-- Tab: Integraciones -->
        <div class="tab-content" id="integrationsTab" role="tabpanel">
            <div class="organization-integrations">
                <h2>Integraciones</h2>
                <p class="org-section-desc">Estado de todas las integraciones conectadas a esta organización.</p>
                <section class="org-section">
                    <h3 class="org-integrations-subtitle">Resumen de organización</h3>
                    <div class="org-integration-summary" id="orgIntegrationSummary">
                        <div class="org-summary-item">
                            <span class="org-summary-label">Estado de la organización</span>
                            <span class="org-summary-value" id="orgSummaryStatus">—</span>
                        </div>
                        <div class="org-summary-item">
                            <span class="org-summary-label">Marcas vinculadas</span>
                            <span class="org-summary-value" id="orgSummaryBrands">—</span>
                        </div>
                        <div class="org-summary-item">
                            <span class="org-summary-label">Integraciones activas</span>
                            <span class="org-summary-value" id="orgSummaryIntegrationsActive">—</span>
                        </div>
                        <div class="org-summary-item">
                            <span class="org-summary-label">Total integraciones</span>
                            <span class="org-summary-value" id="orgSummaryIntegrationsTotal">—</span>
                        </div>
                    </div>
                </section>
                <section class="org-section">
                    <h3 class="org-integrations-subtitle">Plataformas</h3>
                    <div class="org-integrations-list" id="orgIntegrationsList">
                        <p class="org-members-empty">Cargando integraciones...</p>
                    </div>
                </section>
            </div>
        </div>

        <!-- Tab: Unidades de negocio -->
        <div class="tab-content" id="business-unitsTab" role="tabpanel">
            <div class="organization-business-units">
                <div class="org-section-header">
                    <h2>Unidades de negocio</h2>
                    <button type="button" class="btn btn-primary btn-sm" id="createBusinessUnitBtn"><i class="fas fa-plus"></i> Nueva unidad</button>
                </div>
                <p class="org-section-desc">Organiza tu estructura interna en unidades de negocio y asigna miembros a cada una.</p>
                <div id="businessUnitsList" class="business-units-list">
                    <p class="org-placeholder">Cargando unidades de negocio…</p>
                </div>
            </div>
        </div>

        <!-- Tab: Facturación (placeholder) -->
        <div class="tab-content" id="billingTab" role="tabpanel">
            <div class="organization-billing">
                <h2>Facturación / Plan</h2>
                <p class="org-placeholder">Información de facturación y plan. Próximamente.</p>
            </div>
        </div>
    </div>
</div>

<!-- Modal: Invitar miembro -->
<div class="modal org-modal" id="orgInviteModal" aria-hidden="true">
    <div class="modal-content">
        <div class="modal-header">
            <h3>Añadir miembro</h3>
            <button type="button" class="modal-close" id="orgInviteModalClose" aria-label="Cerrar">&times;</button>
        </div>
        <form id="orgInviteForm">
            <div class="form-group">
                <label for="inviteEmail">Email del usuario</label>
                <input type="email" id="inviteEmail" class="form-input" required placeholder="usuario@ejemplo.com">
            </div>
            <div class="form-group">
                <label for="inviteRole">Rol</label>
                <select id="inviteRole" class="form-select">
                    <option value="member">Miembro</option>
                    <option value="admin">Administrador</option>
                </select>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="orgInviteCancel">Cancelar</button>
                <button type="submit" class="btn btn-primary">Añadir</button>
            </div>
        </form>
    </div>
</div>
`;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    this.orgId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.orgId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/form_org';
      window.router?.navigate(url, true);
      return;
    }

    if (window.appState) window.appState.set('selectedOrganizationId', this.orgId, true);
    localStorage.setItem('selectedOrganizationId', this.orgId);
  }

  async render() {
    await super.render();
    await this.initSupabase();
    await this.loadOrganizationData();
    this.setupEventListeners();
    this.updateHeaderContext('Configuración de la organización', null, this.org?.name || null);
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      } else if (typeof waitForSupabase === 'function') {
        this.supabase = await waitForSupabase();
      }
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  async loadOrganizationData() {
    if (!this.supabase || !this.orgId) return;

    try {
      const { data: orgData, error: orgError } = await this.supabase
        .from('organizations')
        .select('id, name, owner_user_id, created_at, deleted_at, level_of_autonomy, logo_url, brand_name_oficial, brand_slogan')
        .eq('id', this.orgId)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!orgData) {
        this.showError('Organización no encontrada.');
        return;
      }

      this.org = orgData;
      this.isOwner = this.org.owner_user_id === this.userId;

      const { data: creditsData } = await this.supabase
        .from('organization_credits')
        .select('credits_available, credits_total')
        .eq('organization_id', this.orgId)
        .maybeSingle();

      if (creditsData) {
        this.credits = creditsData;
      }

      const { data: membersData, error: membersError } = await this.supabase
        .from('organization_members')
        .select('id, user_id, role')
        .eq('organization_id', this.orgId);

      if (membersError) throw membersError;
      this.members = membersData || [];

      const myMember = this.members.find(m => m.user_id === this.userId);
      this.canManageMembers = this.isOwner || (myMember && ['owner', 'admin'].includes(myMember.role));

      const { data: brandContainersData, error: brandContainersError } = await this.supabase
        .from('brand_containers')
        .select('id, nombre_marca')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: true });

      if (brandContainersError) throw brandContainersError;
      this.brandContainers = brandContainersData || [];

      if (this.brandContainers.length > 0) {
        const containerIds = this.brandContainers.map(b => b.id);
        const { data: integrationsData, error: integrationsError } = await this.supabase
          .from('brand_integrations')
          .select('id, brand_container_id, platform, external_account_name, is_active, updated_at, last_sync_at')
          .in('brand_container_id', containerIds)
          .order('platform', { ascending: true })
          .order('updated_at', { ascending: false });

        if (integrationsError) throw integrationsError;
        this.organizationIntegrations = integrationsData || [];
      } else {
        this.organizationIntegrations = [];
      }

      this.integrationsSummary = {
        active: this.organizationIntegrations.filter(i => i.is_active).length,
        total: this.organizationIntegrations.length
      };

      const userIds = [...new Set(this.members.map(m => m.user_id).filter(Boolean))];
      let profilesMap = {};
      if (userIds.length > 0) {
        const { data: profiles } = await this.supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        if (profiles) {
          profiles.forEach(p => { profilesMap[p.id] = p; });
        }
      }

      this.membersWithProfile = this.members.map(m => ({
        ...m,
        full_name: profilesMap[m.user_id]?.full_name || null,
        email: profilesMap[m.user_id]?.email || null
      }));

      this.renderOverview();
      this.renderMembers();
      this.renderIntegrations();
    } catch (error) {
      console.error('Error cargando organización:', error);
      this.showError(error.message || 'Error al cargar la organización.');
    }
  }

  renderOverview() {
    if (!this.org) return;

    const nameInput = this.querySelector('#orgName');
    if (nameInput) nameInput.value = this.org.name;

    const brandNameInput = this.querySelector('#orgBrandNameOficial');
    if (brandNameInput) brandNameInput.value = this.org.brand_name_oficial || '';

    const sloganInput = this.querySelector('#orgBrandSlogan');
    if (sloganInput) sloganInput.value = this.org.brand_slogan || '';

    const autonomySelect = this.querySelector('#orgLevelAutonomy');
    if (autonomySelect && this.org.level_of_autonomy) {
      autonomySelect.value = this.org.level_of_autonomy;
    }

    const formatDate = (d) => {
      if (!d) return '—';
      try {
        return new Date(d).toLocaleString('es');
      } catch (_) { return d; }
    };

    const status = this.org.deleted_at ? 'Archivada' : 'Activa';
    this.setText('#metaId', this.org.id || '—');
    this.setText('#metaStatus', status);
    this.setText('#metaCreated', formatDate(this.org.created_at));
    this.setText('#metaOwner', this.org.owner_user_id || '—');
    this.setText('#metaCreditsAvailable', String(this.credits.credits_available ?? '—'));
    this.setText('#metaCreditsTotal', String(this.credits.credits_total ?? '—'));
    this.setText('#metaCreditsUpdated', formatDate(this.credits.updated_at));
    this.setText('#metaStorageUsed', this.storage.used_mb != null ? String(this.storage.used_mb) : '—');
    this.setText('#metaStorageMax', this.storage.max_mb != null ? String(this.storage.max_mb) : '—');
    this.setText('#metaStorageUpdated', formatDate(this.storage.updated_at));

    const submitBtn = this.querySelector('#orgGeneralSubmit');
    if (submitBtn) submitBtn.disabled = !this.isOwner;
    if (!this.isOwner && nameInput) nameInput.readOnly = true;
  }

  renderMembers() {
    const listEl = this.querySelector('#orgMembersList');
    const actionsEl = this.querySelector('#orgMembersActions');
    if (!listEl) return;

    const canManage = this.canManageMembers;

    listEl.innerHTML = (this.membersWithProfile || []).map(m => {
      const display = m.email || m.full_name || m.user_id?.slice(0, 8) + '…';
      const isCurrentUser = m.user_id === this.userId;
      const isOrgOwner = this.org?.owner_user_id === m.user_id;
      const canRemove = canManage && !isOrgOwner && (this.isOwner || (isCurrentUser ? true : true));
      const removeBtn = canManage && !isOrgOwner && !isCurrentUser
        ? `<button type="button" class="btn btn-ghost btn-sm org-member-remove" data-member-id="${m.id}" title="Quitar de la organización"><i class="fas fa-times"></i></button>`
        : '';
      return `
        <div class="org-member-row" data-member-id="${m.id}">
          <div class="org-member-info">
            <span class="org-member-name">${this.escapeHtml(display)}</span>
            ${m.email && m.email !== display ? `<span class="org-member-email">${this.escapeHtml(m.email)}</span>` : ''}
          </div>
          <span class="org-member-role org-role-${(m.role || 'member').toLowerCase()}">${this.escapeHtml(m.role || 'member')}</span>
          ${removeBtn}
        </div>`;
    }).join('') || '<p class="org-members-empty">No hay miembros cargados.</p>';

    if (actionsEl) {
      const inviteBtn = actionsEl.querySelector('#orgInviteMemberBtn');
      if (inviteBtn) inviteBtn.style.display = canManage ? '' : 'none';
    }

    listEl.querySelectorAll('.org-member-remove').forEach(btn => {
      btn.addEventListener('click', (e) => this.removeMember(e.currentTarget.dataset.memberId));
    });
  }

  setText(selector, text) {
    const el = this.querySelector(selector);
    if (el) el.textContent = text;
  }

  formatPlatformLabel(platformRaw) {
    const normalized = (platformRaw || '').toLowerCase().trim();
    const map = {
      google_analytics: 'Google Analytics',
      ga4: 'Google Analytics',
      youtube: 'YouTube',
      google_youtube: 'YouTube',
      google_ads: 'Google Ads',
      meta: 'Meta',
      facebook: 'Meta',
      instagram: 'Instagram',
      tiktok: 'TikTok',
      linkedin: 'LinkedIn'
    };
    if (map[normalized]) return map[normalized];
    if (!normalized) return 'Sin plataforma';
    return normalized
      .split('_')
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  renderIntegrations() {
    const listEl = this.querySelector('#orgIntegrationsList');
    if (!listEl) return;

    const status = this.org?.deleted_at ? 'Archivada' : 'Activa';
    const brandCount = this.brandContainers.length;
    this.setText('#orgSummaryStatus', status);
    this.setText('#orgSummaryBrands', String(brandCount));
    this.setText('#orgSummaryIntegrationsActive', String(this.integrationsSummary.active));
    this.setText('#orgSummaryIntegrationsTotal', String(this.integrationsSummary.total));

    if (brandCount === 0) {
      listEl.innerHTML = '<p class="org-members-empty">Esta organización aún no tiene marcas vinculadas.</p>';
      return;
    }

    const integrations = this.organizationIntegrations || [];
    if (integrations.length === 0) {
      listEl.innerHTML = '<p class="org-members-empty">No hay integraciones conectadas todavía.</p>';
      return;
    }

    const brandMap = Object.fromEntries((this.brandContainers || []).map(b => [b.id, b]));
    const grouped = {};
    integrations.forEach(item => {
      const key = (item.platform || 'unknown').toLowerCase();
      if (!grouped[key]) {
        grouped[key] = {
          label: this.formatPlatformLabel(item.platform),
          total: 0,
          active: 0,
          byBrand: {}
        };
      }
      grouped[key].total += 1;
      if (item.is_active) grouped[key].active += 1;
      const brandName = brandMap[item.brand_container_id]?.nombre_marca || 'Marca sin nombre';
      if (!grouped[key].byBrand[brandName]) grouped[key].byBrand[brandName] = 0;
      grouped[key].byBrand[brandName] += 1;
    });

    const rows = Object.values(grouped)
      .sort((a, b) => a.label.localeCompare(b.label, 'es'))
      .map(group => {
        const byBrandSummary = Object.entries(group.byBrand)
          .sort((a, b) => a[0].localeCompare(b[0], 'es'))
          .map(([brand, count]) => `${this.escapeHtml(brand)} (${count})`)
          .join(' • ');
        const statusClass = group.active > 0 ? 'is-connected' : 'is-disconnected';
        const statusText = group.active > 0 ? 'Conectada' : 'Sin conexión';
        return `
          <article class="org-integration-card">
            <div class="org-integration-head">
              <h4 class="org-integration-name">${this.escapeHtml(group.label)}</h4>
              <span class="org-integration-badge ${statusClass}">${statusText}</span>
            </div>
            <p class="org-integration-meta">${group.active} activas de ${group.total} configuradas</p>
            <p class="org-integration-brands">${byBrandSummary}</p>
          </article>
        `;
      }).join('');

    listEl.innerHTML = rows;
  }

  setupEventListeners() {
    const tabs = this.querySelectorAll('.organization-tabs .tab-btn');
    const panels = this.querySelectorAll('.organization-content .tab-content');

    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        tabs.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        panels.forEach(p => { p.classList.remove('active'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const panelId = tab + 'Tab';
        const panel = this.querySelector('#' + panelId);
        if (panel) panel.classList.add('active');
        if (tab === 'business-units') this.loadAndRenderBusinessUnits();
      });
    });

    const createBuBtn = this.querySelector('#createBusinessUnitBtn');
    if (createBuBtn) {
      createBuBtn.addEventListener('click', () => this.openCreateBusinessUnitModal());
    }

    const generalForm = this.querySelector('#orgGeneralForm');
    if (generalForm) {
      generalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveOrganizationName();
      });
    }

    const inviteBtn = this.querySelector('#orgInviteMemberBtn');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => this.openInviteModal());
    }

    // Modal está en #modals-portal (movido por BaseView), no en this.container
    const inviteModal = document.getElementById('orgInviteModal');
    const inviteForm = document.getElementById('orgInviteForm');
    const inviteClose = document.getElementById('orgInviteModalClose');
    const inviteCancel = document.getElementById('orgInviteCancel');

    if (inviteClose) inviteClose.addEventListener('click', () => this.closeInviteModal());
    if (inviteCancel) inviteCancel.addEventListener('click', () => this.closeInviteModal());
    if (inviteForm) {
      inviteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitInvite();
      });
    }
    if (inviteModal) {
      inviteModal.addEventListener('click', (e) => {
        if (e.target === inviteModal) this.closeInviteModal();
      });
    }
  }

  async saveOrganizationName() {
    if (!this.supabase || !this.orgId || !this.isOwner) return;

    const nameInput = this.querySelector('#orgName');
    const submitBtn = this.querySelector('#orgGeneralSubmit');
    const name = nameInput?.value?.trim();
    if (!name) {
      alert('El nombre no puede estar vacío.');
      return;
    }

    const brandNameOficial = this.querySelector('#orgBrandNameOficial')?.value?.trim() || null;
    const brandSlogan = this.querySelector('#orgBrandSlogan')?.value?.trim() || null;
    const levelOfAutonomy = this.querySelector('#orgLevelAutonomy')?.value || null;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
      const updatePayload = { name };
      if (brandNameOficial !== undefined) updatePayload.brand_name_oficial = brandNameOficial;
      if (brandSlogan !== undefined) updatePayload.brand_slogan = brandSlogan;
      if (levelOfAutonomy) updatePayload.level_of_autonomy = levelOfAutonomy;

      const { error } = await this.supabase
        .from('organizations')
        .update(updatePayload)
        .eq('id', this.orgId)
        .eq('owner_user_id', this.userId);

      if (error) throw error;
      this.org = { ...this.org, ...updatePayload };
      this.updateHeaderContext('Configuración de la organización', null, name);
    } catch (error) {
      console.error('Error guardando organización:', error);
      alert(error.message || 'No se pudo guardar.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
      }
    }
  }

  openInviteModal() {
    const modal = document.getElementById('orgInviteModal');
    const form = document.getElementById('orgInviteForm');
    if (modal) {
      modal.classList.add('modal-open');
      modal.setAttribute('aria-hidden', 'false');
      if (form) form.reset();
    }
  }

  closeInviteModal() {
    const modal = document.getElementById('orgInviteModal');
    if (modal) {
      modal.classList.remove('modal-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async submitInvite() {
    if (!this.supabase || !this.orgId || !this.canManageMembers) return;

    const emailInput = document.getElementById('inviteEmail');
    const roleSelect = document.getElementById('inviteRole');
    const email = emailInput?.value?.trim();
    const role = (roleSelect?.value || 'member').toLowerCase();
    if (!email) return;

    const submitBtn = document.querySelector('#orgInviteForm button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando...'; }

    try {
      // Verificar que no haya invitación pendiente ya
      const { data: existingInvite } = await this.supabase
        .from('organization_invitations')
        .select('id, status')
        .eq('organization_id', this.orgId)
        .eq('email', email)
        .in('status', ['pending'])
        .maybeSingle();

      if (existingInvite) {
        alert('Ya existe una invitación pendiente para ese email.');
        return;
      }

      // Verificar que no sea ya miembro
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (profile) {
        const existing = this.members.find(m => m.user_id === profile.id);
        if (existing) {
          alert('Ese usuario ya es miembro de la organización.');
          return;
        }
      }

      // Crear invitación en organization_invitations
      const { error: inviteError } = await this.supabase
        .from('organization_invitations')
        .insert({
          organization_id: this.orgId,
          email,
          role: role === 'admin' ? 'admin' : 'member',
          invited_by: this.userId,
        });

      if (inviteError) throw inviteError;

      this.closeInviteModal();
      alert(`Invitación enviada a ${email}. El usuario podrá aceptarla desde su perfil.`);
      await this.loadOrganizationData();
    } catch (error) {
      console.error('Error enviando invitación:', error);
      alert(error.message || 'No se pudo enviar la invitación.');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Añadir'; }
    }
  }

  async removeMember(memberId) {
    if (!this.supabase || !this.canManageMembers || !memberId) return;
    const member = this.members.find(m => m.id === memberId);
    if (!member || member.user_id === this.org?.owner_user_id) return;
    if (!confirm('¿Quitar a este miembro de la organización?')) return;

    try {
      const { error } = await this.supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId)
        .eq('organization_id', this.orgId);

      if (error) throw error;
      await this.loadOrganizationData();
    } catch (error) {
      console.error('Error quitando miembro:', error);
      alert(error.message || 'No se pudo quitar el miembro.');
    }
  }

  showError(message) {
    const container = this.container || document.getElementById('app-container');
    if (container) {
      container.querySelector('.organization-content')?.insertAdjacentHTML('beforebegin',
        `<div class="org-error-banner" role="alert">${this.escapeHtml(message)}</div>`);
    }
  }

  async loadAndRenderBusinessUnits() {
    const listEl = this.querySelector('#businessUnitsList');
    if (!listEl) return;
    if (!this.supabase || !this.orgId) {
      listEl.innerHTML = '<p class="org-placeholder">No se pudo cargar las unidades de negocio.</p>';
      return;
    }

    listEl.innerHTML = '<p class="org-placeholder">Cargando…</p>';
    try {
      const { data: units, error } = await this.supabase
        .from('business_units')
        .select('id, name, description, created_at')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (!units || !units.length) {
        listEl.innerHTML = '<p class="org-placeholder">Sin unidades de negocio. Crea una para estructurar tu organización.</p>';
        return;
      }

      // Load user assignments for each unit
      const unitIds = units.map(u => u.id);
      const { data: assignments } = await this.supabase
        .from('user_business_units')
        .select('business_unit_id, user_id, profiles(full_name, email)')
        .in('business_unit_id', unitIds);

      const assignmentsByUnit = {};
      (assignments || []).forEach(a => {
        if (!assignmentsByUnit[a.business_unit_id]) assignmentsByUnit[a.business_unit_id] = [];
        assignmentsByUnit[a.business_unit_id].push(a);
      });

      listEl.innerHTML = units.map(u => {
        const members = assignmentsByUnit[u.id] || [];
        const memberHtml = members.length
          ? members.map(m => {
              const profile = m.profiles;
              const name = (Array.isArray(profile) ? profile[0] : profile)?.full_name || (Array.isArray(profile) ? profile[0] : profile)?.email || m.user_id;
              return `<span class="bu-member-tag">${this.escapeHtml(name)}</span>`;
            }).join('')
          : '<span class="bu-member-tag bu-member-empty">Sin miembros asignados</span>';

        return `
          <div class="business-unit-card" data-bu-id="${u.id}">
            <div class="bu-card-header">
              <h3 class="bu-name">${this.escapeHtml(u.name)}</h3>
              <div class="bu-card-actions">
                <button type="button" class="btn btn-ghost btn-sm bu-assign-btn" data-bu-id="${u.id}" title="Asignar miembro"><i class="fas fa-user-plus"></i></button>
                <button type="button" class="btn btn-ghost btn-sm bu-delete-btn" data-bu-id="${u.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            ${u.description ? `<p class="bu-desc">${this.escapeHtml(u.description)}</p>` : ''}
            <div class="bu-members">${memberHtml}</div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.bu-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => this.deleteBusinessUnit(btn.getAttribute('data-bu-id')));
      });
      listEl.querySelectorAll('.bu-assign-btn').forEach(btn => {
        btn.addEventListener('click', () => this.openAssignMemberToBuModal(btn.getAttribute('data-bu-id')));
      });
    } catch (e) {
      console.error('OrganizationView loadBusinessUnits:', e);
      listEl.innerHTML = '<p class="org-placeholder">Error cargando unidades de negocio.</p>';
    }
  }

  openCreateBusinessUnitModal() {
    document.getElementById('orgBuModal')?.remove();
    const modalHtml = `
      <div class="modal-overlay" id="orgBuModal">
        <div class="modal">
          <div class="modal-header"><h3>Nueva Unidad de Negocio</h3><button type="button" class="modal-close" id="buModalClose"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="form-group"><label for="bu_name">Nombre <span class="form-required">*</span></label><input type="text" id="bu_name" class="form-input" placeholder="Ej: E-commerce" required></div>
            <div class="form-group"><label for="bu_desc">Descripción</label><textarea id="bu_desc" class="form-input" rows="2"></textarea></div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-ghost" id="buModalCancel">Cancelar</button><button type="button" class="btn btn-primary" id="buModalSubmit">Crear</button></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('buModalClose')?.addEventListener('click', () => document.getElementById('orgBuModal')?.remove());
    document.getElementById('buModalCancel')?.addEventListener('click', () => document.getElementById('orgBuModal')?.remove());
    document.getElementById('buModalSubmit')?.addEventListener('click', async () => {
      const name = document.getElementById('bu_name')?.value?.trim();
      if (!name) { alert('El nombre es obligatorio.'); return; }
      const { error } = await this.supabase.from('business_units').insert({
        organization_id: this.orgId,
        name,
        description: document.getElementById('bu_desc')?.value?.trim() || null,
      });
      if (error) { alert('Error al crear la unidad.'); return; }
      document.getElementById('orgBuModal')?.remove();
      await this.loadAndRenderBusinessUnits();
    });
  }

  async deleteBusinessUnit(buId) {
    if (!confirm('¿Eliminar esta unidad de negocio?')) return;
    const { error } = await this.supabase.from('business_units').delete().eq('id', buId);
    if (error) { alert('Error al eliminar.'); return; }
    await this.loadAndRenderBusinessUnits();
  }

  openAssignMemberToBuModal(buId) {
    document.getElementById('orgBuAssignModal')?.remove();
    const memberOpts = this.members.map(m => {
      const profile = m.profiles;
      const label = (Array.isArray(profile) ? profile[0] : profile)?.full_name ||
        (Array.isArray(profile) ? profile[0] : profile)?.email || m.user_id;
      return `<option value="${m.user_id}">${this.escapeHtml(label)}</option>`;
    }).join('');

    if (!memberOpts) { alert('No hay miembros disponibles para asignar.'); return; }

    const modalHtml = `
      <div class="modal-overlay" id="orgBuAssignModal">
        <div class="modal">
          <div class="modal-header"><h3>Asignar miembro</h3><button type="button" class="modal-close" id="buAssignClose"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="form-group"><label for="bu_assign_user">Miembro</label><select id="bu_assign_user" class="form-input"><option value="">Seleccionar…</option>${memberOpts}</select></div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-ghost" id="buAssignCancel">Cancelar</button><button type="button" class="btn btn-primary" id="buAssignSubmit">Asignar</button></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('buAssignClose')?.addEventListener('click', () => document.getElementById('orgBuAssignModal')?.remove());
    document.getElementById('buAssignCancel')?.addEventListener('click', () => document.getElementById('orgBuAssignModal')?.remove());
    document.getElementById('buAssignSubmit')?.addEventListener('click', async () => {
      const userId = document.getElementById('bu_assign_user')?.value;
      if (!userId) { alert('Selecciona un miembro.'); return; }
      const { error } = await this.supabase.from('user_business_units').insert({ business_unit_id: buId, user_id: userId });
      if (error) { alert('Error al asignar.'); return; }
      document.getElementById('orgBuAssignModal')?.remove();
      await this.loadAndRenderBusinessUnits();
    });
  }
}

window.OrganizationView = OrganizationView;
