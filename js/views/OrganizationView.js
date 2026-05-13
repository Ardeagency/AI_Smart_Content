/**
 * OrganizationView — Configuración profesional de la organización.
 *
 * Tabs: General · Miembros · Plan · Uso · Integraciones · Unidades · Audit · Danger
 *
 * No incluye metadata cruda (ID, owner_user_id raw, etc.) — ese tipo de info técnica
 * vive en /dev/lead. Aquí solo lo que un admin de empresa necesita ver/editar.
 */
class OrganizationView extends BaseView {
  static documentTitle = 'Configuración';
  static cacheable = false;

  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.orgId = null;

    // Org core
    this.org = null;
    this.isOwner = false;
    this.canManageMembers = false;

    // Members
    this.members = [];
    this.membersWithProfile = [];
    this.invitations = [];

    // Billing / Usage
    this.subscription = null;
    this.plan = null;
    this.credits = { credits_available: 0, credits_total: 0, updated_at: null };
    this.storage = { used_mb: 0, max_mb: 0, updated_at: null };
    this.creditTimeline = [];          // credit_usage agregado por día
    this.aiUsageToday = null;          // v_org_claude_usage_today
    this.aiCaps = null;                // org_claude_caps

    // Integrations
    this.brandContainers = [];
    this.organizationIntegrations = [];
    this.integrationsSummary = { active: 0, total: 0 };

    // Audit
    this.auditLog = [];
    this.auditFilter = { action: '', user: '' };
  }

  renderHTML() {
    return `
<div class="organization-container">
  <div class="organization-header">
    <div>
      <h1 class="organization-title">Configuración</h1>
      <p class="organization-subtitle">Administra los datos, miembros, plan y seguridad de tu organización.</p>
    </div>
    <div class="organization-header-status" id="orgHeaderStatus"></div>
  </div>

  <div class="organization-tabs" role="tablist">
    <button type="button" class="tab-btn active" data-tab="general" role="tab" aria-selected="true">General</button>
    <button type="button" class="tab-btn" data-tab="members" role="tab" aria-selected="false">Miembros</button>
    <button type="button" class="tab-btn" data-tab="billing" role="tab" aria-selected="false">Plan & Facturación</button>
    <button type="button" class="tab-btn" data-tab="usage" role="tab" aria-selected="false">Uso</button>
    <button type="button" class="tab-btn" data-tab="integrations" role="tab" aria-selected="false">Integraciones</button>
    <button type="button" class="tab-btn" data-tab="business-units" role="tab" aria-selected="false">Unidades</button>
    <button type="button" class="tab-btn" data-tab="audit" role="tab" aria-selected="false">Audit log</button>
    <button type="button" class="tab-btn tab-btn--danger" data-tab="danger" role="tab" aria-selected="false">Danger zone</button>
  </div>

  <div class="organization-content">

    <!-- ── General ──────────────────────────────────────── -->
    <div class="tab-content active" id="generalTab" role="tabpanel">
      <section class="org-section org-section-form">
        <h2>Datos de la organización</h2>
        <p class="org-section-desc">Identidad y configuración regional del workspace.</p>
        <form id="orgGeneralForm" class="org-form">
          <div class="org-form-grid">
            <div class="form-group">
              <label for="orgName">Nombre de la organización</label>
              <input type="text" id="orgName" name="name" class="form-input" required placeholder="Mi Empresa">
            </div>
            <div class="form-group">
              <label for="orgBrandNameOficial">Nombre oficial de marca</label>
              <input type="text" id="orgBrandNameOficial" name="brand_name_oficial" class="form-input" placeholder="Nombre comercial">
            </div>
            <div class="form-group form-group--full">
              <label for="orgBrandSlogan">Slogan</label>
              <input type="text" id="orgBrandSlogan" name="brand_slogan" class="form-input" placeholder="Eslogan de la organización">
            </div>
            <div class="form-group">
              <label for="orgTimezone">Zona horaria</label>
              <select id="orgTimezone" class="form-input"></select>
            </div>
            <div class="form-group">
              <label for="orgLocale">Idioma</label>
              <select id="orgLocale" class="form-input">
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
              </select>
            </div>
            <div class="form-group form-group--full">
              <label for="orgLevelAutonomy">Nivel de autonomía del agente</label>
              <select id="orgLevelAutonomy" name="level_of_autonomy" class="form-input">
                <option value="manual">Manual — todas las acciones requieren aprobación</option>
                <option value="parcial">Parcial — sugerencias automáticas, acciones manuales</option>
                <option value="total">Total — el agente actúa de forma autónoma</option>
              </select>
            </div>
          </div>
          <div class="org-form-actions">
            <button type="submit" class="btn btn-primary" id="orgGeneralSubmit">
              <i class="fas fa-save"></i> Guardar cambios
            </button>
          </div>
        </form>
      </section>

      <section class="org-section">
        <h2>Logo</h2>
        <p class="org-section-desc">PNG/JPG/SVG, máx. 5 MB. Visible en la cabecera y en producciones.</p>
        <div class="org-logo-row">
          <div class="org-logo-preview" id="orgLogoPreview"><i class="fas fa-image"></i></div>
          <div class="org-logo-actions">
            <button type="button" class="btn btn-secondary" id="orgLogoUploadBtn"><i class="fas fa-upload"></i> Subir logo</button>
            <button type="button" class="btn btn-ghost" id="orgLogoRemoveBtn" hidden><i class="fas fa-trash"></i> Quitar</button>
            <input type="file" id="orgLogoInput" accept="image/png,image/jpeg,image/jpg,image/svg+xml" hidden>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Miembros ─────────────────────────────────────── -->
    <div class="tab-content" id="membersTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Miembros</h2>
            <p class="org-section-desc">Roles y acceso al workspace. Solo propietario y administradores pueden gestionar.</p>
          </div>
          <button type="button" class="btn btn-primary" id="orgInviteBtn">
            <i class="fas fa-user-plus"></i> Invitar miembro
          </button>
        </div>
        <div class="org-members-list" id="orgMembersList"></div>
      </section>

      <section class="org-section" id="orgInvitationsSection" hidden>
        <h3>Invitaciones pendientes</h3>
        <div class="org-invitations-list" id="orgInvitationsList"></div>
      </section>
    </div>

    <!-- ── Plan & Facturación ───────────────────────────── -->
    <div class="tab-content" id="billingTab" role="tabpanel">
      <section class="org-section">
        <h2>Plan actual</h2>
        <div class="org-plan-card" id="orgPlanCard"><p class="org-placeholder">Cargando…</p></div>
      </section>
      <section class="org-section">
        <h2>Próximos pagos</h2>
        <p class="org-section-desc">Histórico de facturas y método de pago (gestionado vía Stripe).</p>
        <div class="org-billing-history" id="orgBillingHistory">
          <p class="org-placeholder">Aún no hay facturas registradas. Se completará al integrar Stripe Billing.</p>
        </div>
      </section>
    </div>

    <!-- ── Uso ──────────────────────────────────────────── -->
    <div class="tab-content" id="usageTab" role="tabpanel">
      <section class="org-section">
        <h2>Créditos</h2>
        <div class="org-usage-card" id="orgCreditsCard"></div>
        <h3 class="org-usage-subtitle">Últimos 30 días</h3>
        <div class="org-usage-timeline" id="orgCreditsTimeline"></div>
      </section>

      <section class="org-section">
        <h2>Almacenamiento</h2>
        <div class="org-usage-card" id="orgStorageCard"></div>
      </section>

      <section class="org-section" id="orgAiUsageSection" hidden>
        <h2>IA (Claude / Vera)</h2>
        <div class="org-usage-card" id="orgAiCard"></div>
      </section>
    </div>

    <!-- ── Integraciones ────────────────────────────────── -->
    <div class="tab-content" id="integrationsTab" role="tabpanel">
      <section class="org-section">
        <h2>Resumen</h2>
        <div class="org-integration-summary" id="orgIntegrationSummary">
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
        <h3>Plataformas</h3>
        <div class="org-integrations-list" id="orgIntegrationsList"><p class="org-placeholder">Cargando…</p></div>
      </section>
    </div>

    <!-- ── Unidades de negocio ──────────────────────────── -->
    <div class="tab-content" id="business-unitsTab" role="tabpanel">
      <div class="org-section-head">
        <h2>Unidades de negocio</h2>
        <button type="button" class="btn btn-primary btn-sm" id="createBusinessUnitBtn"><i class="fas fa-plus"></i> Nueva unidad</button>
      </div>
      <p class="org-section-desc">Organiza tu estructura interna y asigna miembros a cada unidad.</p>
      <div id="businessUnitsList" class="business-units-list">
        <p class="org-placeholder">Cargando…</p>
      </div>
    </div>

    <!-- ── Audit log ────────────────────────────────────── -->
    <div class="tab-content" id="auditTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Registro de actividad</h2>
            <p class="org-section-desc">Acciones realizadas en la organización. Se conserva para compliance.</p>
          </div>
          <div class="org-audit-filters">
            <select id="auditFilterAction" class="form-input form-input-sm">
              <option value="">Todas las acciones</option>
            </select>
            <select id="auditFilterUser" class="form-input form-input-sm">
              <option value="">Todos los miembros</option>
            </select>
          </div>
        </div>
        <div class="org-audit-list" id="orgAuditList"><p class="org-placeholder">Cargando…</p></div>
      </section>
    </div>

    <!-- ── Danger zone ──────────────────────────────────── -->
    <div class="tab-content" id="dangerTab" role="tabpanel">
      <section class="org-section org-section--danger">
        <h2>Transferir propiedad</h2>
        <p class="org-section-desc">Mueve la organización a otro administrador. Tras la transferencia perderás los privilegios de propietario.</p>
        <button type="button" class="btn btn-danger-ghost" id="orgTransferBtn">Transferir propiedad</button>
      </section>
      <section class="org-section org-section--danger">
        <h2>Exportar datos</h2>
        <p class="org-section-desc">Solicita una copia de los datos de la organización (productos, audiencias, campañas).</p>
        <button type="button" class="btn btn-danger-ghost" id="orgExportBtn"><i class="fas fa-download"></i> Solicitar export</button>
      </section>
      <section class="org-section org-section--danger">
        <h2>Archivar organización</h2>
        <p class="org-section-desc">La organización queda inaccesible para todos los miembros y deja de consumir créditos. Puedes restaurarla contactando soporte dentro de 30 días.</p>
        <button type="button" class="btn btn-danger" id="orgArchiveBtn"><i class="fas fa-archive"></i> Archivar organización</button>
      </section>
    </div>

  </div>
</div>

<!-- ── Modal: Invitar miembro ─────────────────────────── -->
<div class="modal org-modal" id="orgInviteModal" aria-hidden="true">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Invitar miembro</h3>
      <button type="button" class="modal-close" id="orgInviteModalClose" aria-label="Cerrar">&times;</button>
    </div>
    <form id="orgInviteForm">
      <div class="form-group">
        <label for="inviteEmail">Email del usuario</label>
        <input type="email" id="inviteEmail" class="form-input" required placeholder="usuario@empresa.com">
      </div>
      <div class="form-group">
        <label for="inviteRole">Rol</label>
        <select id="inviteRole" class="form-input">
          <option value="member">Miembro</option>
          <option value="admin">Administrador</option>
          <option value="viewer">Viewer (solo lectura)</option>
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="orgInviteCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Enviar invitación</button>
      </div>
    </form>
  </div>
</div>

<!-- ── Modal: Transferir propiedad ────────────────────── -->
<div class="modal org-modal" id="orgTransferModal" aria-hidden="true">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Transferir propiedad</h3>
      <button type="button" class="modal-close" id="orgTransferModalClose" aria-label="Cerrar">&times;</button>
    </div>
    <form id="orgTransferForm">
      <div class="form-group">
        <label for="transferTo">Nuevo propietario</label>
        <select id="transferTo" class="form-input" required>
          <option value="">Selecciona un miembro…</option>
        </select>
      </div>
      <div class="form-group">
        <label for="transferConfirm">Escribe <strong id="transferOrgNameLabel"></strong> para confirmar</label>
        <input type="text" id="transferConfirm" class="form-input" required placeholder="Nombre exacto de la organización">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="orgTransferCancel">Cancelar</button>
        <button type="submit" class="btn btn-danger">Transferir propiedad</button>
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
        : '/create';
      window.router?.navigate(url, true);
      return;
    }
    if (window.appState) window.appState.set('selectedOrganizationId', this.orgId, true);
    localStorage.setItem('selectedOrganizationId', this.orgId);
  }

  async render() {
    await super.render();
    await this._initSupabase();
    this._populateTimezones();
    await this._loadAll();
    this._bindEvents();
    this.updateHeaderContext('Configuración', null, this.org?.name || null);
  }

  async _initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('OrganizationView _initSupabase:', e);
    }
  }

  _populateTimezones() {
    const sel = this.querySelector('#orgTimezone');
    if (!sel) return;
    const zones = (typeof Intl !== 'undefined' && Intl.supportedValuesOf)
      ? Intl.supportedValuesOf('timeZone')
      : ['UTC', 'America/Bogota', 'America/Mexico_City', 'America/New_York', 'Europe/Madrid'];
    sel.innerHTML = zones.map((z) => `<option value="${this.escapeHtml(z)}">${this.escapeHtml(z)}</option>`).join('');
  }

  // ── Carga ──────────────────────────────────────────────
  async _loadAll() {
    if (!this.supabase || !this.orgId) return;
    try {
      await Promise.all([
        this._loadOrg(),
        this._loadCredits(),
        this._loadStorage(),
      ]);
      await Promise.all([
        this._loadMembers(),
        this._loadInvitations(),
        this._loadSubscription(),
        this._loadBrandContainers(),
        this._loadCreditTimeline(),
        this._loadAiUsage(),
        this._loadAuditLog(),
      ]);
      await this._loadIntegrations();

      this._renderHeaderStatus();
      this._renderGeneral();
      this._renderMembers();
      this._renderInvitations();
      this._renderBilling();
      this._renderUsage();
      this._renderIntegrations();
      this._renderAuditLog();
    } catch (e) {
      console.error('OrganizationView _loadAll:', e);
      this._showError(e.message || 'Error al cargar la configuración.');
    }
  }

  async _loadOrg() {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('id, name, owner_user_id, created_at, deleted_at, level_of_autonomy, logo_url, brand_name_oficial, brand_slogan, timezone, locale')
      .eq('id', this.orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Organización no encontrada.');
    this.org = data;
    this.isOwner = this.org.owner_user_id === this.userId;
  }

  async _loadCredits() {
    const { data } = await this.supabase
      .from('organization_credits')
      .select('credits_available, credits_total, updated_at')
      .eq('organization_id', this.orgId)
      .maybeSingle();
    if (data) this.credits = data;
  }

  async _loadStorage() {
    const { data } = await this.supabase
      .from('storage_usage')
      .select('used_mb, max_mb, updated_at')
      .eq('organization_id', this.orgId)
      .maybeSingle();
    if (data) this.storage = data;
  }

  async _loadMembers() {
    const { data, error } = await this.supabase
      .from('organization_members')
      .select('id, user_id, role, created_at')
      .eq('organization_id', this.orgId);
    if (error) throw error;
    this.members = data || [];

    const myMember = this.members.find((m) => m.user_id === this.userId);
    this.canManageMembers = this.isOwner || (myMember && ['owner', 'admin'].includes(myMember.role));

    const userIds = [...new Set(this.members.map((m) => m.user_id).filter(Boolean))];
    let profilesMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await this.supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (profiles) profiles.forEach((p) => { profilesMap[p.id] = p; });
    }
    this.membersWithProfile = this.members.map((m) => ({
      ...m,
      full_name: profilesMap[m.user_id]?.full_name || null,
      email: profilesMap[m.user_id]?.email || null,
    }));
  }

  async _loadInvitations() {
    const { data } = await this.supabase
      .from('organization_invitations')
      .select('id, email, role, status, expires_at, created_at, invited_by')
      .eq('organization_id', this.orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    this.invitations = data || [];
  }

  async _loadSubscription() {
    const { data: sub } = await this.supabase
      .from('subscriptions')
      .select('id, plan_id, status, current_period_start, current_period_end, stripe_subscription_id, metadata, created_at')
      .eq('organization_id', this.orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    this.subscription = sub || null;
    if (sub?.plan_id) {
      const { data: plan } = await this.supabase
        .from('plans')
        .select('id, name, description, price_usd_month, price_usd_year, credits_monthly, storage_mb, max_handles, features, is_popular')
        .eq('id', sub.plan_id)
        .maybeSingle();
      this.plan = plan || null;
    }
  }

  async _loadBrandContainers() {
    const { data } = await this.supabase
      .from('brand_containers')
      .select('id, nombre_marca')
      .eq('organization_id', this.orgId)
      .order('created_at', { ascending: true });
    this.brandContainers = data || [];
  }

  async _loadIntegrations() {
    if (!this.brandContainers.length) {
      this.organizationIntegrations = [];
      this.integrationsSummary = { active: 0, total: 0 };
      return;
    }
    const containerIds = this.brandContainers.map((b) => b.id);
    const { data } = await this.supabase
      .from('brand_integrations')
      .select('id, brand_container_id, platform, external_account_name, is_active, updated_at, last_sync_at')
      .in('brand_container_id', containerIds)
      .order('platform', { ascending: true })
      .order('updated_at', { ascending: false });
    this.organizationIntegrations = data || [];
    this.integrationsSummary = {
      active: this.organizationIntegrations.filter((i) => i.is_active).length,
      total: this.organizationIntegrations.length,
    };
  }

  async _loadCreditTimeline() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await this.supabase
      .from('credit_usage')
      .select('credits_used, operation_type, created_at')
      .eq('organization_id', this.orgId)
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    const rows = data || [];
    const byDay = {};
    rows.forEach((r) => {
      const day = (r.created_at || '').slice(0, 10);
      if (!day) return;
      byDay[day] = (byDay[day] || 0) + (Number(r.credits_used) || 0);
    });
    this.creditTimeline = Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, total]) => ({ day, total }));
  }

  async _loadAiUsage() {
    try {
      const { data: caps } = await this.supabase
        .from('org_claude_caps')
        .select('*')
        .eq('organization_id', this.orgId)
        .maybeSingle();
      this.aiCaps = caps || null;
    } catch (_) { /* tabla opcional */ }
    try {
      const { data: today } = await this.supabase
        .from('v_org_claude_usage_today')
        .select('*')
        .eq('organization_id', this.orgId)
        .maybeSingle();
      this.aiUsageToday = today || null;
    } catch (_) { /* vista opcional */ }
  }

  async _loadAuditLog() {
    const { data } = await this.supabase
      .from('user_audit_log')
      .select('id, action, resource_type, resource_id, user_id, user_email, metadata, created_at')
      .eq('organization_id', this.orgId)
      .order('created_at', { ascending: false })
      .limit(200);
    this.auditLog = data || [];
  }

  // ── Render ─────────────────────────────────────────────
  _renderHeaderStatus() {
    const el = this.querySelector('#orgHeaderStatus');
    if (!el || !this.org) return;
    const archived = !!this.org.deleted_at;
    el.innerHTML = archived
      ? `<span class="org-status-pill org-status-pill--archived"><i class="fas fa-archive"></i> Archivada</span>`
      : `<span class="org-status-pill org-status-pill--active">Activa</span>`;
  }

  _renderGeneral() {
    if (!this.org) return;
    const set = (sel, v) => { const el = this.querySelector(sel); if (el) el.value = v ?? ''; };
    set('#orgName', this.org.name);
    set('#orgBrandNameOficial', this.org.brand_name_oficial);
    set('#orgBrandSlogan', this.org.brand_slogan);
    set('#orgTimezone', this.org.timezone || 'UTC');
    set('#orgLocale', this.org.locale || 'es');
    set('#orgLevelAutonomy', this.org.level_of_autonomy || 'parcial');

    const preview = this.querySelector('#orgLogoPreview');
    const removeBtn = this.querySelector('#orgLogoRemoveBtn');
    if (preview) {
      if (this.org.logo_url) {
        preview.innerHTML = `<img src="${this.escapeHtml(this.org.logo_url)}" alt="Logo de ${this.escapeHtml(this.org.name || '')}">`;
        if (removeBtn) removeBtn.hidden = false;
      } else {
        preview.innerHTML = `<i class="fas fa-image"></i>`;
        if (removeBtn) removeBtn.hidden = true;
      }
    }

    const canEdit = this.isOwner || this.canManageMembers;
    this.querySelectorAll('.org-form .form-input').forEach((el) => { el.disabled = !canEdit; });
    const submitBtn = this.querySelector('#orgGeneralSubmit');
    if (submitBtn) submitBtn.disabled = !canEdit;
  }

  _renderMembers() {
    const listEl = this.querySelector('#orgMembersList');
    if (!listEl) return;
    const canManage = this.canManageMembers;

    if (!this.membersWithProfile.length) {
      listEl.innerHTML = '<p class="org-members-empty">Sin miembros cargados.</p>';
      return;
    }
    listEl.innerHTML = this.membersWithProfile.map((m) => {
      const display = m.full_name || m.email || (m.user_id ? m.user_id.slice(0, 8) + '…' : 'Miembro');
      const isCurrent = m.user_id === this.userId;
      const isOrgOwner = this.org?.owner_user_id === m.user_id;
      const roleLabel = isOrgOwner ? 'Propietario' : (m.role || 'member');
      const canChangeRole = canManage && !isOrgOwner && !isCurrent;
      const canRemove = canManage && !isOrgOwner && !isCurrent;
      const rolePicker = canChangeRole
        ? `<select class="org-role-select" data-member-id="${this.escapeHtml(m.id)}" data-user-id="${this.escapeHtml(m.user_id || '')}">
             <option value="admin"${m.role === 'admin' ? ' selected' : ''}>Administrador</option>
             <option value="member"${m.role === 'member' ? ' selected' : ''}>Miembro</option>
             <option value="viewer"${m.role === 'viewer' ? ' selected' : ''}>Viewer</option>
           </select>`
        : `<span class="org-member-role org-role-${(roleLabel || 'member').toLowerCase()}">${this.escapeHtml(roleLabel)}</span>`;
      const removeBtn = canRemove
        ? `<button type="button" class="btn btn-ghost btn-sm org-member-remove" data-member-id="${this.escapeHtml(m.id)}" title="Quitar de la organización"><i class="fas fa-times"></i></button>`
        : '';
      return `
        <div class="org-member-row" data-member-id="${this.escapeHtml(m.id)}">
          <div class="org-member-info">
            <span class="org-member-name">${this.escapeHtml(display)}</span>
            ${m.email && m.email !== display ? `<span class="org-member-email">${this.escapeHtml(m.email)}</span>` : ''}
          </div>
          ${rolePicker}
          ${removeBtn}
        </div>`;
    }).join('');

    const inviteBtn = this.querySelector('#orgInviteBtn');
    if (inviteBtn) inviteBtn.style.display = canManage ? '' : 'none';
  }

  _renderInvitations() {
    const section = this.querySelector('#orgInvitationsSection');
    const list = this.querySelector('#orgInvitationsList');
    if (!section || !list) return;
    if (!this.invitations.length) { section.hidden = true; return; }
    section.hidden = false;
    list.innerHTML = this.invitations.map((inv) => {
      const expires = inv.expires_at ? new Date(inv.expires_at).toLocaleDateString('es') : '—';
      return `
        <div class="org-invitation-row" data-invitation-id="${this.escapeHtml(inv.id)}">
          <div class="org-invitation-info">
            <span class="org-invitation-email">${this.escapeHtml(inv.email)}</span>
            <span class="org-invitation-meta">${this.escapeHtml(inv.role)} · expira ${expires}</span>
          </div>
          <div class="org-invitation-actions">
            <button type="button" class="btn btn-ghost btn-sm org-invitation-revoke" data-invitation-id="${this.escapeHtml(inv.id)}">Revocar</button>
          </div>
        </div>`;
    }).join('');
  }

  _renderBilling() {
    const card = this.querySelector('#orgPlanCard');
    if (!card) return;
    if (!this.subscription) {
      card.innerHTML = `
        <div class="org-plan-empty">
          <p>No tienes un plan activo.</p>
          <button type="button" class="btn btn-primary" id="orgChoosePlanBtn">Ver planes</button>
        </div>`;
      this.querySelector('#orgChoosePlanBtn')?.addEventListener('click', () => this._goToPlans());
      return;
    }
    const planName = this.plan?.name || this.subscription.plan_id || 'Plan';
    const price = this.plan?.price_usd_month != null ? `$${this.plan.price_usd_month}/mes` : '';
    const status = this.subscription.status || '—';
    const renewal = this.subscription.current_period_end
      ? new Date(this.subscription.current_period_end).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    const features = Array.isArray(this.plan?.features?.list) ? this.plan.features.list : [];
    card.innerHTML = `
      <div class="org-plan-head">
        <div>
          <h3 class="org-plan-name">${this.escapeHtml(planName)}</h3>
          <span class="org-plan-status org-plan-status--${this.escapeHtml(status)}">${this.escapeHtml(status)}</span>
        </div>
        <div class="org-plan-price">${this.escapeHtml(price)}</div>
      </div>
      <div class="org-plan-stats">
        <div><span class="org-plan-stat-label">Renovación</span><span class="org-plan-stat-value">${this.escapeHtml(renewal)}</span></div>
        <div><span class="org-plan-stat-label">Créditos / mes</span><span class="org-plan-stat-value">${this.plan?.credits_monthly ?? '—'}</span></div>
        <div><span class="org-plan-stat-label">Almacenamiento</span><span class="org-plan-stat-value">${this.plan?.storage_mb != null ? (this.plan.storage_mb >= 1024 ? (this.plan.storage_mb / 1024).toFixed(0) + ' GB' : this.plan.storage_mb + ' MB') : '—'}</span></div>
      </div>
      ${features.length ? `<ul class="org-plan-features">${features.map((f) => `<li><i class="fas fa-check"></i>${this.escapeHtml(f)}</li>`).join('')}</ul>` : ''}
      <div class="org-plan-actions">
        <button type="button" class="btn btn-primary" id="orgUpgradeBtn">Cambiar de plan</button>
      </div>`;
    this.querySelector('#orgUpgradeBtn')?.addEventListener('click', () => this._goToPlans());
  }

  _renderUsage() {
    // Créditos
    const creditsEl = this.querySelector('#orgCreditsCard');
    if (creditsEl) {
      const used = Math.max(0, (this.credits.credits_total || 0) - (this.credits.credits_available || 0));
      const pct = this.credits.credits_total > 0 ? Math.min(100, Math.round((used / this.credits.credits_total) * 100)) : 0;
      creditsEl.innerHTML = this._usageCardHTML({
        label: 'Créditos usados este ciclo',
        primary: used.toLocaleString('es'),
        secondary: this.credits.credits_total > 0 ? `de ${this.credits.credits_total.toLocaleString('es')}` : '',
        pct,
        sub: this.credits.credits_available != null ? `${this.credits.credits_available.toLocaleString('es')} disponibles` : '',
      });
    }

    // Timeline (30 días)
    const tlEl = this.querySelector('#orgCreditsTimeline');
    if (tlEl) {
      if (!this.creditTimeline.length) {
        tlEl.innerHTML = `<p class="org-placeholder">Sin consumo registrado en los últimos 30 días.</p>`;
      } else {
        const max = Math.max(...this.creditTimeline.map((d) => d.total)) || 1;
        tlEl.innerHTML = `
          <div class="org-spark">
            ${this.creditTimeline.map((d) => {
              const h = Math.max(2, Math.round((d.total / max) * 100));
              return `<div class="org-spark-bar" style="height:${h}%" title="${this.escapeHtml(d.day)} — ${d.total} créditos"></div>`;
            }).join('')}
          </div>
          <div class="org-spark-axis">
            <span>${this.escapeHtml(this.creditTimeline[0]?.day || '')}</span>
            <span>${this.escapeHtml(this.creditTimeline[this.creditTimeline.length - 1]?.day || '')}</span>
          </div>`;
      }
    }

    // Storage
    const stEl = this.querySelector('#orgStorageCard');
    if (stEl) {
      const used = Number(this.storage.used_mb) || 0;
      const max = Number(this.storage.max_mb) || 0;
      const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
      const fmt = (mb) => mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB';
      stEl.innerHTML = this._usageCardHTML({
        label: 'Almacenamiento usado',
        primary: fmt(used),
        secondary: max > 0 ? `de ${fmt(max)}` : '',
        pct,
        sub: '',
      });
    }

    // AI
    const aiSec = this.querySelector('#orgAiUsageSection');
    const aiEl = this.querySelector('#orgAiCard');
    if (aiSec && aiEl && (this.aiCaps || this.aiUsageToday)) {
      aiSec.hidden = false;
      const cap = this.aiCaps?.daily_cap_usd ?? this.aiCaps?.monthly_cap_usd ?? null;
      const usedToday = this.aiUsageToday?.cost_usd_today ?? this.aiUsageToday?.usd ?? null;
      const pct = cap && usedToday != null ? Math.min(100, Math.round((usedToday / cap) * 100)) : 0;
      aiEl.innerHTML = this._usageCardHTML({
        label: 'Consumo de IA hoy',
        primary: usedToday != null ? `$${Number(usedToday).toFixed(2)}` : '—',
        secondary: cap ? `de $${Number(cap).toFixed(2)}` : '',
        pct,
        sub: '',
      });
    }
  }

  _usageCardHTML({ label, primary, secondary, pct, sub }) {
    return `
      <div class="org-usage-label">${this.escapeHtml(label)}</div>
      <div class="org-usage-main">
        <span class="org-usage-primary">${this.escapeHtml(primary)}</span>
        ${secondary ? `<span class="org-usage-secondary">${this.escapeHtml(secondary)}</span>` : ''}
      </div>
      <div class="org-usage-bar"><div class="org-usage-bar-fill" style="width:${pct}%"></div></div>
      ${sub ? `<div class="org-usage-sub">${this.escapeHtml(sub)}</div>` : ''}`;
  }

  _renderIntegrations() {
    const listEl = this.querySelector('#orgIntegrationsList');
    if (!listEl) return;
    this._setText('#orgSummaryBrands', String(this.brandContainers.length));
    this._setText('#orgSummaryIntegrationsActive', String(this.integrationsSummary.active));
    this._setText('#orgSummaryIntegrationsTotal', String(this.integrationsSummary.total));

    if (!this.brandContainers.length) {
      listEl.innerHTML = '<p class="org-members-empty">Esta organización aún no tiene marcas vinculadas.</p>';
      return;
    }
    if (!this.organizationIntegrations.length) {
      listEl.innerHTML = '<p class="org-members-empty">Sin integraciones conectadas.</p>';
      return;
    }

    const brandMap = Object.fromEntries(this.brandContainers.map((b) => [b.id, b]));
    const grouped = {};
    this.organizationIntegrations.forEach((item) => {
      const key = this._platformFamily(item.platform);
      if (!grouped[key]) grouped[key] = { label: this._platformLabel(item.platform), total: 0, active: 0, byBrand: {} };
      grouped[key].total += 1;
      if (item.is_active) grouped[key].active += 1;
      const brandName = brandMap[item.brand_container_id]?.nombre_marca || 'Marca sin nombre';
      grouped[key].byBrand[brandName] = (grouped[key].byBrand[brandName] || 0) + 1;
    });

    listEl.innerHTML = Object.values(grouped).sort((a, b) => a.label.localeCompare(b.label, 'es')).map((g) => {
      const statusClass = g.active > 0 ? 'is-connected' : 'is-disconnected';
      const statusText = g.active > 0 ? 'Conectada' : 'Sin conexión';
      const summary = Object.entries(g.byBrand).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([b, c]) => `${this.escapeHtml(b)} (${c})`).join(' • ');
      return `
        <article class="org-integration-card">
          <div class="org-integration-head">
            <h4 class="org-integration-name">${this.escapeHtml(g.label)}</h4>
            <span class="org-integration-badge ${statusClass}">${statusText}</span>
          </div>
          <p class="org-integration-meta">${g.active} activas de ${g.total} configuradas</p>
          <p class="org-integration-brands">${summary}</p>
        </article>`;
    }).join('');
  }

  _renderAuditLog() {
    const listEl = this.querySelector('#orgAuditList');
    if (!listEl) return;
    // Populate filter dropdowns once
    const actionSel = this.querySelector('#auditFilterAction');
    const userSel = this.querySelector('#auditFilterUser');
    if (actionSel && actionSel.options.length <= 1) {
      const actions = [...new Set(this.auditLog.map((r) => r.action).filter(Boolean))].sort();
      actions.forEach((a) => actionSel.insertAdjacentHTML('beforeend', `<option value="${this.escapeHtml(a)}">${this.escapeHtml(a)}</option>`));
    }
    if (userSel && userSel.options.length <= 1) {
      const seen = new Set();
      this.membersWithProfile.forEach((m) => {
        if (!m.user_id || seen.has(m.user_id)) return;
        seen.add(m.user_id);
        const label = m.full_name || m.email || m.user_id.slice(0, 8) + '…';
        userSel.insertAdjacentHTML('beforeend', `<option value="${this.escapeHtml(m.user_id)}">${this.escapeHtml(label)}</option>`);
      });
    }

    let rows = this.auditLog;
    if (this.auditFilter.action) rows = rows.filter((r) => r.action === this.auditFilter.action);
    if (this.auditFilter.user) rows = rows.filter((r) => r.user_id === this.auditFilter.user);

    if (!rows.length) {
      listEl.innerHTML = '<p class="org-members-empty">Sin actividad registrada.</p>';
      return;
    }
    listEl.innerHTML = rows.map((r) => {
      const when = r.created_at ? new Date(r.created_at).toLocaleString('es') : '—';
      const who = r.user_email || r.user_id?.slice(0, 8) + '…' || '—';
      const resource = r.resource_type ? `${r.resource_type}${r.resource_id ? ' · ' + r.resource_id.slice(0, 8) : ''}` : '';
      return `
        <div class="org-audit-row">
          <div class="org-audit-when">${this.escapeHtml(when)}</div>
          <div class="org-audit-who">${this.escapeHtml(who)}</div>
          <div class="org-audit-action"><code>${this.escapeHtml(r.action || '')}</code></div>
          <div class="org-audit-resource">${this.escapeHtml(resource)}</div>
        </div>`;
    }).join('');
  }

  // ── Helpers ────────────────────────────────────────────
  _setText(sel, t) { const el = this.querySelector(sel); if (el) el.textContent = t; }

  _platformFamily(p) {
    const n = (p || '').toLowerCase().trim();
    if (!n) return 'unknown';
    if (['google', 'google_analytics', 'ga4', 'youtube', 'google_youtube', 'google_ads'].includes(n)) return 'google';
    if (['meta', 'facebook', 'instagram'].includes(n)) return 'meta';
    return n;
  }
  _platformLabel(p) {
    const f = this._platformFamily(p);
    const map = { google: 'Google', meta: 'Meta', shopify: 'Shopify', tiktok: 'TikTok', linkedin: 'LinkedIn', unknown: 'Sin plataforma' };
    if (map[f]) return map[f];
    return f.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  _goToPlans() {
    const prefix = (this.orgId && typeof window.getOrgPathPrefix === 'function')
      ? window.getOrgPathPrefix(this.orgId, this.org?.name || '') : '';
    window.router?.navigate((prefix || '') + '/plans');
  }

  _showError(msg) {
    const c = this.container || document.getElementById('app-container');
    if (c) c.querySelector('.organization-content')?.insertAdjacentHTML('beforebegin',
      `<div class="org-error-banner" role="alert">${this.escapeHtml(msg)}</div>`);
  }

  // ── Eventos ────────────────────────────────────────────
  _bindEvents() {
    // Tabs
    const tabs = this.querySelectorAll('.organization-tabs .tab-btn');
    const panels = this.querySelectorAll('.organization-content .tab-content');
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        tabs.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        panels.forEach((p) => { p.classList.remove('active'); });
        btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
        this.querySelector('#' + tab + 'Tab')?.classList.add('active');
        if (tab === 'business-units') this._loadAndRenderBusinessUnits();
      });
    });

    // General form
    this.querySelector('#orgGeneralForm')?.addEventListener('submit', (e) => {
      e.preventDefault(); this._saveGeneral();
    });

    // Logo
    this.querySelector('#orgLogoUploadBtn')?.addEventListener('click', () => this.querySelector('#orgLogoInput')?.click());
    this.querySelector('#orgLogoInput')?.addEventListener('change', (e) => this._uploadLogo(e));
    this.querySelector('#orgLogoRemoveBtn')?.addEventListener('click', () => this._removeLogo());

    // Members
    this.querySelector('#orgInviteBtn')?.addEventListener('click', () => this._openInviteModal());
    this.container.addEventListener('change', (e) => {
      const sel = e.target.closest('.org-role-select');
      if (sel) this._changeRole(sel.getAttribute('data-member-id'), sel.value);
    });
    this.container.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.org-member-remove');
      if (removeBtn) { this._removeMember(removeBtn.getAttribute('data-member-id')); return; }
      const revokeBtn = e.target.closest('.org-invitation-revoke');
      if (revokeBtn) { this._revokeInvitation(revokeBtn.getAttribute('data-invitation-id')); return; }
    });

    // Invite modal
    document.getElementById('orgInviteModalClose')?.addEventListener('click', () => this._closeInviteModal());
    document.getElementById('orgInviteCancel')?.addEventListener('click', () => this._closeInviteModal());
    document.getElementById('orgInviteForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._submitInvite(); });

    // Audit filters
    this.querySelector('#auditFilterAction')?.addEventListener('change', (e) => { this.auditFilter.action = e.target.value; this._renderAuditLog(); });
    this.querySelector('#auditFilterUser')?.addEventListener('change', (e) => { this.auditFilter.user = e.target.value; this._renderAuditLog(); });

    // Business units
    this.querySelector('#createBusinessUnitBtn')?.addEventListener('click', () => this._openCreateBusinessUnitModal());

    // Danger zone
    this.querySelector('#orgTransferBtn')?.addEventListener('click', () => this._openTransferModal());
    this.querySelector('#orgArchiveBtn')?.addEventListener('click', () => this._archiveOrg());
    this.querySelector('#orgExportBtn')?.addEventListener('click', () => this._requestExport());

    // Transfer modal
    document.getElementById('orgTransferModalClose')?.addEventListener('click', () => this._closeTransferModal());
    document.getElementById('orgTransferCancel')?.addEventListener('click', () => this._closeTransferModal());
    document.getElementById('orgTransferForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._submitTransfer(); });
  }

  // ── Acciones ───────────────────────────────────────────
  async _saveGeneral() {
    if (!this.supabase || !this.orgId) return;
    const submitBtn = this.querySelector('#orgGeneralSubmit');
    const payload = {
      name: this.querySelector('#orgName')?.value?.trim() || '',
      brand_name_oficial: this.querySelector('#orgBrandNameOficial')?.value?.trim() || null,
      brand_slogan: this.querySelector('#orgBrandSlogan')?.value?.trim() || null,
      timezone: this.querySelector('#orgTimezone')?.value || 'UTC',
      locale: this.querySelector('#orgLocale')?.value || 'es',
      level_of_autonomy: this.querySelector('#orgLevelAutonomy')?.value || 'parcial',
    };
    if (!payload.name) { alert('El nombre no puede estar vacío.'); return; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…'; }
    try {
      const { error } = await this.supabase.from('organizations').update(payload).eq('id', this.orgId);
      if (error) throw error;
      this.org = { ...this.org, ...payload };
      this.updateHeaderContext('Configuración', null, payload.name);
      this._toast('Cambios guardados');
    } catch (e) {
      alert(e.message || 'No se pudo guardar.');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios'; }
    }
  }

  async _uploadLogo(e) {
    const file = e.target?.files?.[0];
    if (!file || !this.supabase || !this.orgId) return;
    if (file.size > 5 * 1024 * 1024) { alert('Tamaño máximo: 5 MB.'); e.target.value = ''; return; }
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${this.orgId}/logo-${Date.now()}.${ext}`;
    try {
      const { error: upErr } = await this.supabase.storage.from('brand-logos').upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = this.supabase.storage.from('brand-logos').getPublicUrl(path);
      const logoUrl = pub?.publicUrl || '';
      const { error: upRowErr } = await this.supabase.from('organizations').update({ logo_url: logoUrl }).eq('id', this.orgId);
      if (upRowErr) throw upRowErr;
      this.org.logo_url = logoUrl;
      this._renderGeneral();
      this._toast('Logo actualizado');
    } catch (err) {
      alert(err.message || 'No se pudo subir el logo.');
    } finally {
      e.target.value = '';
    }
  }

  async _removeLogo() {
    if (!confirm('¿Quitar el logo?')) return;
    const { error } = await this.supabase.from('organizations').update({ logo_url: null }).eq('id', this.orgId);
    if (error) { alert(error.message || 'Error.'); return; }
    this.org.logo_url = null;
    this._renderGeneral();
    this._toast('Logo eliminado');
  }

  _openInviteModal() {
    const modal = document.getElementById('orgInviteModal');
    const form = document.getElementById('orgInviteForm');
    if (modal) { modal.classList.add('modal-open'); modal.setAttribute('aria-hidden', 'false'); if (form) form.reset(); }
  }
  _closeInviteModal() {
    const modal = document.getElementById('orgInviteModal');
    if (modal) { modal.classList.remove('modal-open'); modal.setAttribute('aria-hidden', 'true'); }
  }

  async _submitInvite() {
    if (!this.supabase || !this.orgId || !this.canManageMembers) return;
    const email = document.getElementById('inviteEmail')?.value?.trim();
    const role = (document.getElementById('inviteRole')?.value || 'member').toLowerCase();
    if (!email) return;
    const btn = document.querySelector('#orgInviteForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    try {
      const { data: existing } = await this.supabase
        .from('organization_invitations')
        .select('id').eq('organization_id', this.orgId).eq('email', email).eq('status', 'pending').maybeSingle();
      if (existing) { alert('Ya existe una invitación pendiente para ese email.'); return; }

      const { data: profile } = await this.supabase
        .from('profiles').select('id').eq('email', email).maybeSingle();
      if (profile && this.members.some((m) => m.user_id === profile.id)) {
        alert('Ese usuario ya es miembro.'); return;
      }

      const { error } = await this.supabase
        .from('organization_invitations')
        .insert({ organization_id: this.orgId, email, role, invited_by: this.userId });
      if (error) throw error;
      this._closeInviteModal();
      await this._loadInvitations();
      this._renderInvitations();
      this._toast('Invitación enviada');
    } catch (e) {
      alert(e.message || 'No se pudo enviar la invitación.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar invitación'; }
    }
  }

  async _revokeInvitation(invitationId) {
    if (!invitationId) return;
    if (!confirm('¿Revocar esta invitación?')) return;
    const { error } = await this.supabase
      .from('organization_invitations').update({ status: 'revoked' }).eq('id', invitationId);
    if (error) { alert(error.message || 'Error.'); return; }
    await this._loadInvitations(); this._renderInvitations();
    this._toast('Invitación revocada');
  }

  async _changeRole(memberId, role) {
    if (!memberId || !role || !this.canManageMembers) return;
    const { error } = await this.supabase
      .from('organization_members').update({ role }).eq('id', memberId).eq('organization_id', this.orgId);
    if (error) { alert(error.message || 'No se pudo cambiar el rol.'); return; }
    await this._loadMembers(); this._renderMembers();
    this._toast('Rol actualizado');
  }

  async _removeMember(memberId) {
    if (!memberId || !this.canManageMembers) return;
    const m = this.members.find((x) => x.id === memberId);
    if (!m || m.user_id === this.org?.owner_user_id) return;
    if (!confirm('¿Quitar a este miembro de la organización?')) return;
    const { error } = await this.supabase
      .from('organization_members').delete().eq('id', memberId).eq('organization_id', this.orgId);
    if (error) { alert(error.message || 'Error.'); return; }
    await this._loadMembers(); this._renderMembers();
    this._toast('Miembro eliminado');
  }

  _openTransferModal() {
    if (!this.isOwner) { alert('Solo el propietario puede transferir.'); return; }
    const sel = document.getElementById('transferTo');
    if (sel) {
      const opts = this.membersWithProfile
        .filter((m) => m.user_id && m.user_id !== this.userId)
        .map((m) => `<option value="${this.escapeHtml(m.user_id)}">${this.escapeHtml(m.full_name || m.email || m.user_id.slice(0, 8) + '…')}</option>`)
        .join('');
      sel.innerHTML = '<option value="">Selecciona un miembro…</option>' + opts;
    }
    const label = document.getElementById('transferOrgNameLabel');
    if (label) label.textContent = this.org?.name || '';
    const modal = document.getElementById('orgTransferModal');
    if (modal) { modal.classList.add('modal-open'); modal.setAttribute('aria-hidden', 'false'); }
  }
  _closeTransferModal() {
    const modal = document.getElementById('orgTransferModal');
    if (modal) { modal.classList.remove('modal-open'); modal.setAttribute('aria-hidden', 'true'); }
  }

  async _submitTransfer() {
    if (!this.isOwner) return;
    const newOwner = document.getElementById('transferTo')?.value;
    const confirm = document.getElementById('transferConfirm')?.value?.trim();
    if (!newOwner) { alert('Selecciona un miembro.'); return; }
    if (confirm !== (this.org?.name || '')) { alert('El nombre de confirmación no coincide.'); return; }
    const { error } = await this.supabase
      .from('organizations').update({ owner_user_id: newOwner }).eq('id', this.orgId).eq('owner_user_id', this.userId);
    if (error) { alert(error.message || 'No se pudo transferir.'); return; }
    this._closeTransferModal();
    this._toast('Propiedad transferida');
    await this._loadOrg(); await this._loadMembers();
    this._renderHeaderStatus(); this._renderGeneral(); this._renderMembers();
  }

  async _archiveOrg() {
    if (!this.isOwner) { alert('Solo el propietario puede archivar.'); return; }
    const confirmTxt = prompt(`Escribe "${this.org?.name || ''}" para archivar la organización:`);
    if (confirmTxt !== this.org?.name) { if (confirmTxt != null) alert('El nombre no coincide.'); return; }
    const { error } = await this.supabase
      .from('organizations').update({ deleted_at: new Date().toISOString() }).eq('id', this.orgId).eq('owner_user_id', this.userId);
    if (error) { alert(error.message || 'No se pudo archivar.'); return; }
    this._toast('Organización archivada');
    setTimeout(() => window.router?.navigate('/home', true), 600);
  }

  async _requestExport() {
    alert('Solicitud de export registrada. Recibirás un email con el enlace de descarga cuando esté lista.');
    // Hook: inserta una fila en una tabla `data_export_jobs` cuando exista. Hoy es placeholder
    // porque la pipeline de export todavía no está implementada (queda en docs/task).
  }

  _toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg, 'success');
  }

  // ── Business units (mantenidas del view anterior) ──────
  async _loadAndRenderBusinessUnits() {
    const listEl = this.querySelector('#businessUnitsList');
    if (!listEl) return;
    if (!this.supabase || !this.orgId) { listEl.innerHTML = '<p class="org-placeholder">No se pudo cargar.</p>'; return; }
    listEl.innerHTML = '<p class="org-placeholder">Cargando…</p>';
    try {
      const { data: units, error } = await this.supabase
        .from('business_units').select('id, name, description, created_at')
        .eq('organization_id', this.orgId).order('created_at', { ascending: true });
      if (error) throw error;
      if (!units?.length) { listEl.innerHTML = '<p class="org-placeholder">Sin unidades. Crea una para estructurar.</p>'; return; }

      const unitIds = units.map((u) => u.id);
      const { data: assignments } = await this.supabase
        .from('user_business_units').select('business_unit_id, user_id, profiles(full_name, email)').in('business_unit_id', unitIds);
      const byUnit = {};
      (assignments || []).forEach((a) => { (byUnit[a.business_unit_id] ||= []).push(a); });

      listEl.innerHTML = units.map((u) => {
        const ms = byUnit[u.id] || [];
        const membersHtml = ms.length
          ? ms.map((m) => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              const n = p?.full_name || p?.email || m.user_id;
              return `<span class="bu-member-tag">${this.escapeHtml(n)}</span>`;
            }).join('')
          : '<span class="bu-member-tag bu-member-empty">Sin miembros</span>';
        return `
          <div class="business-unit-card" data-bu-id="${this.escapeHtml(u.id)}">
            <div class="bu-card-header">
              <h3 class="bu-name">${this.escapeHtml(u.name)}</h3>
              <div class="bu-card-actions">
                <button type="button" class="btn btn-ghost btn-sm bu-assign-btn" data-bu-id="${this.escapeHtml(u.id)}" title="Asignar miembro"><i class="fas fa-user-plus"></i></button>
                <button type="button" class="btn btn-ghost btn-sm bu-delete-btn" data-bu-id="${this.escapeHtml(u.id)}" title="Eliminar"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            ${u.description ? `<p class="bu-desc">${this.escapeHtml(u.description)}</p>` : ''}
            <div class="bu-members">${membersHtml}</div>
          </div>`;
      }).join('');

      listEl.querySelectorAll('.bu-delete-btn').forEach((b) => b.addEventListener('click', () => this._deleteBusinessUnit(b.getAttribute('data-bu-id'))));
      listEl.querySelectorAll('.bu-assign-btn').forEach((b) => b.addEventListener('click', () => this._openAssignMemberModal(b.getAttribute('data-bu-id'))));
    } catch (e) {
      console.error('OrganizationView _loadBusinessUnits:', e);
      listEl.innerHTML = '<p class="org-placeholder">Error cargando unidades.</p>';
    }
  }

  _openCreateBusinessUnitModal() {
    document.getElementById('orgBuModal')?.remove();
    const html = `
      <div class="modal-overlay" id="orgBuModal">
        <div class="modal">
          <div class="modal-header"><h3>Nueva Unidad de Negocio</h3><button type="button" class="modal-close" id="buModalClose"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="form-group"><label for="bu_name">Nombre <span class="form-required">*</span></label><input type="text" id="bu_name" class="form-input" placeholder="E-commerce" required></div>
            <div class="form-group"><label for="bu_desc">Descripción</label><textarea id="bu_desc" class="form-input" rows="2"></textarea></div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-ghost" id="buModalCancel">Cancelar</button><button type="button" class="btn btn-primary" id="buModalSubmit">Crear</button></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const remove = () => document.getElementById('orgBuModal')?.remove();
    document.getElementById('buModalClose')?.addEventListener('click', remove);
    document.getElementById('buModalCancel')?.addEventListener('click', remove);
    document.getElementById('buModalSubmit')?.addEventListener('click', async () => {
      const name = document.getElementById('bu_name')?.value?.trim();
      if (!name) { alert('El nombre es obligatorio.'); return; }
      const { error } = await this.supabase.from('business_units').insert({
        organization_id: this.orgId, name,
        description: document.getElementById('bu_desc')?.value?.trim() || null,
      });
      if (error) { alert('Error al crear.'); return; }
      remove(); await this._loadAndRenderBusinessUnits();
    });
  }

  async _deleteBusinessUnit(buId) {
    if (!confirm('¿Eliminar esta unidad?')) return;
    const { error } = await this.supabase.from('business_units').delete().eq('id', buId);
    if (error) { alert('Error al eliminar.'); return; }
    await this._loadAndRenderBusinessUnits();
  }

  _openAssignMemberModal(buId) {
    document.getElementById('orgBuAssignModal')?.remove();
    const opts = this.membersWithProfile.map((m) => {
      const label = m.full_name || m.email || m.user_id;
      return `<option value="${this.escapeHtml(m.user_id || '')}">${this.escapeHtml(label)}</option>`;
    }).join('');
    if (!opts) { alert('No hay miembros disponibles.'); return; }
    const html = `
      <div class="modal-overlay" id="orgBuAssignModal">
        <div class="modal">
          <div class="modal-header"><h3>Asignar miembro</h3><button type="button" class="modal-close" id="buAssignClose"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="form-group"><label for="bu_assign_user">Miembro</label><select id="bu_assign_user" class="form-input"><option value="">Seleccionar…</option>${opts}</select></div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-ghost" id="buAssignCancel">Cancelar</button><button type="button" class="btn btn-primary" id="buAssignSubmit">Asignar</button></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const remove = () => document.getElementById('orgBuAssignModal')?.remove();
    document.getElementById('buAssignClose')?.addEventListener('click', remove);
    document.getElementById('buAssignCancel')?.addEventListener('click', remove);
    document.getElementById('buAssignSubmit')?.addEventListener('click', async () => {
      const userId = document.getElementById('bu_assign_user')?.value;
      if (!userId) { alert('Selecciona un miembro.'); return; }
      const { error } = await this.supabase.from('user_business_units').insert({ business_unit_id: buId, user_id: userId });
      if (error) { alert('Error al asignar.'); return; }
      remove(); await this._loadAndRenderBusinessUnits();
    });
  }
}

window.OrganizationView = OrganizationView;
