/**
 * OrganizationView — Panel administrativo técnico de la organización.
 *
 * No es branding (eso vive en BrandOrganizationView). Aquí: miembros,
 * facturación, actividad operativa, notificaciones y seguridad. Solo
 * timezone/locale son editables a nivel de datos generales — el resto del
 * config (nombre, logo, slogan, autonomy, sub-marcas) NO se edita acá.
 *
 * Tabs: General · Miembros · Facturación · Actividad · Notificaciones · Seguridad
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

    // Sub-marcas (read-only)
    this.brandContainers = [];

    // Centro de control (conteos por entidad)
    this.controlStats = null;
    this.prodRange = 7;

    // Uso (consumo de créditos)
    this.usageRange = 30;
    this.usage = null;

    // Notificaciones
    this.notifications = [];

    // Seguridad (audit)
    this.auditLog = [];
    this.auditFilter = { action: '', user: '' };

    // Seguridad (MFA — FEAT-020)
    this.mfaFactors = [];          // auth.mfa.listFactors().totp[]
    this.mfaOrgRequired = false;   // organizations.mfa_required
    this.mfaEnroll = null;         // { factorId, qr, secret } durante el flujo de enroll
  }

  renderHTML() {
    return `
<div class="organization-container">
  <div class="organization-header">
    <div>
      <h1 class="organization-title">${__('Configuración')}</h1>
    </div>
    <div class="organization-header-status" id="orgHeaderStatus"></div>
  </div>

  <div class="organization-tabs" role="tablist">
    <button type="button" class="tab-btn active" data-tab="general" role="tab" aria-selected="true">${__('General')}</button>
    <button type="button" class="tab-btn" data-tab="members" role="tab" aria-selected="false">${__('Miembros')}</button>
    <button type="button" class="tab-btn" data-tab="billing" role="tab" aria-selected="false">${__('Facturación')}</button>
    <button type="button" class="tab-btn" data-tab="activity" role="tab" aria-selected="false">${__('Uso')}</button>
    <button type="button" class="tab-btn" data-tab="notifications" role="tab" aria-selected="false">${__('Notificaciones')}</button>
    <button type="button" class="tab-btn" data-tab="security" role="tab" aria-selected="false">${__('Seguridad')}</button>
  </div>

  <div class="organization-content">

    <!-- ── General ──────────────────────────────────────── -->
    <div class="tab-content active" id="generalTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>${__('Centro de control')}</h2>
            <p class="org-section-desc">${__('Vista general de las entidades y la producción de tu organización. Pulsa una tarjeta para gestionarla.')}</p>
          </div>
        </div>
        <div class="org-ctrl-stats" id="orgCtrlStats"><p class="org-placeholder">${__('Cargando…')}</p></div>
      </section>

      <div class="org-general-config">
      <section class="org-section org-section-form">
        <h2>${__('Datos regionales')}</h2>
        <p class="org-section-desc">${__('Estos valores afectan reportes, scheduling y formato de fechas/idioma del workspace.')}</p>
        <form id="orgGeneralForm" class="org-form">
          <div class="org-form-grid">
            <div class="form-group">
              <label for="orgTimezone">${__('Zona horaria')}</label>
              <select id="orgTimezone" class="form-input"></select>
            </div>
            <div class="form-group">
              <label for="orgLocale">${__('Idioma')}</label>
              <select id="orgLocale" class="form-input">
                <option value="es">${__('Español')}</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
              </select>
            </div>
          </div>
          <div class="org-form-actions">
            <button type="submit" class="btn btn-primary" id="orgGeneralSubmit">
              <i class="aisc-ico aisc-ico--save"></i> ${__('Guardar')}
            </button>
          </div>
        </form>
      </section>

      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>${__('Marcas gestionadas')}</h2>
            <p class="org-section-desc">${__('Workspaces de datos aislados (audiencias, campañas, integraciones y contenido). La provisión inicial la gestiona el equipo de plataforma.')}</p>
          </div>
          <a href="mailto:info@ardeagency.com?subject=Solicitud%20de%20nueva%20marca%20gestionada&body=Hola%20equipo%2C%0A%0AQuiero%20a%C3%B1adir%20una%20nueva%20marca%20gestionada%20a%20mi%20organizaci%C3%B3n.%0A%0ANombre%20de%20la%20marca%3A%20%0AMercado%2Fregi%C3%B3n%3A%20%0APlataformas%20a%20conectar%3A%20%0AObjetivos%20iniciales%3A%20%0A%0AGracias." class="btn btn-secondary btn-sm" id="orgRequestBrandBtn"><i class="aisc-ico aisc-ico--send"></i> ${__('Solicitar nueva marca')}</a>
        </div>
        <div class="org-subbrands-list" id="orgSubbrandsList"><p class="org-placeholder">${__('Cargando…')}</p></div>
      </section>
      </div>
    </div>

    <!-- ── Miembros ─────────────────────────────────────── -->
    <div class="tab-content" id="membersTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>${__('Miembros')}</h2>
            <p class="org-section-desc">${__('Roles y acceso al workspace.')}</p>
          </div>
          <button type="button" class="btn btn-primary" id="orgInviteBtn">
            <i class="aisc-ico aisc-ico--user-registration"></i> ${__('Invitar')}
          </button>
        </div>
        <div class="org-members-list" id="orgMembersList"></div>
      </section>

      <section class="org-section" id="orgInvitationsSection" hidden>
        <h3>${__('Invitaciones pendientes')}</h3>
        <div class="org-invitations-list" id="orgInvitationsList"></div>
      </section>
    </div>

    <!-- ── Facturación ──────────────────────────────────── -->
    <div class="tab-content" id="billingTab" role="tabpanel">
      <section class="org-section">
        <div class="org-billing-summary" id="orgBillingSummary"><p class="org-placeholder">${__('Cargando…')}</p></div>
      </section>

      <section class="org-section">
        <div class="org-billing-limits" id="orgBillingLimits"></div>
      </section>

      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>${__('Historial de facturas')}</h2>
            <p class="org-section-desc">${__('Facturas pagadas y pagos únicos de paquetes de créditos.')}</p>
          </div>
        </div>
        <div class="org-billing-invoices" id="orgBillingInvoices"><p class="org-placeholder">${__('Cargando…')}</p></div>
      </section>
    </div>

    <!-- ── Uso ──────────────────────────────────────────── -->
    <div class="tab-content" id="activityTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>${__('Uso')}</h2>
            <p class="org-section-desc">${__('Consumo de créditos de la plataforma por día — scrapers, flujos, generación e IA.')}</p>
          </div>
          <div class="org-usage-range" id="orgUsageRange" role="tablist">
            <button type="button" class="org-range-pill" data-range="7">${__('7 días')}</button>
            <button type="button" class="org-range-pill org-range-pill--active" data-range="30">${__('30 días')}</button>
            <button type="button" class="org-range-pill" data-range="90">${__('90 días')}</button>
          </div>
        </div>
        <div class="org-usage-stats" id="orgUsageStats"></div>
        <div class="org-usage-chart-card" id="orgUsageChart"><p class="org-placeholder">${__('Cargando…')}</p></div>
        <div class="org-usage-breakdown-card" id="orgUsageBreakdown"></div>
      </section>
    </div>

    <!-- ── Notificaciones ───────────────────────────────── -->
    <div class="tab-content" id="notificationsTab" role="tabpanel">
      <section class="org-section">
        <h2>${__('Notificaciones recientes')}</h2>
        <div class="org-notifications-list" id="orgNotificationsList"><p class="org-placeholder">${__('Cargando…')}</p></div>
      </section>
      <section class="org-section">
        <h2>${__('Preferencias')}</h2>
        <p class="org-section-desc org-placeholder">${__('Configuración de canales (email, in-app, Slack) por tipo de evento — próximamente.')}</p>
      </section>
    </div>

    <!-- ── Seguridad ────────────────────────────────────── -->
    <div class="tab-content" id="securityTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>${__('Registro de actividad (audit log)')}</h2>
            <p class="org-section-desc">${__('Acciones realizadas en la organización. Se conserva para compliance.')}</p>
          </div>
          <div class="org-audit-filters">
            <select id="auditFilterAction" class="form-input form-input-sm">
              <option value="">${__('Todas las acciones')}</option>
            </select>
            <select id="auditFilterUser" class="form-input form-input-sm">
              <option value="">${__('Todos los miembros')}</option>
            </select>
          </div>
        </div>
        <div class="org-audit-list" id="orgAuditList"><p class="org-placeholder">${__('Cargando…')}</p></div>
      </section>
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>${__('Autenticación de dos factores (2FA)')}</h2>
            <p class="org-section-desc">${__('Añade un código de 6 dígitos generado por una app autenticadora (Google Authenticator, Authy, 1Password) además de tu contraseña. No requiere SMS — funciona offline desde tu celular.')}</p>
          </div>
        </div>

        <div class="org-mfa-personal" id="orgMfaPersonal">
          <p class="org-placeholder">${__('Cargando…')}</p>
        </div>

        <div class="org-mfa-policy" id="orgMfaPolicy" hidden>
          <h3 style="margin-top: 1.5rem; font-size: 0.95rem;">${__('Política de organización')}</h3>
          <p class="org-section-desc">${__('Como propietario, puedes exigir 2FA a todos los miembros antes de que puedan acceder.')}</p>
          <label class="org-toggle">
            <input type="checkbox" id="orgMfaRequireToggle">
            <span class="org-toggle-label">${__('Exigir 2FA a todos los miembros de esta organización')}</span>
          </label>
          <p class="org-mfa-policy-hint" id="orgMfaPolicyHint"></p>
        </div>
      </section>
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>${__('Sesiones activas')}</h2>
            <p class="org-section-desc">${__('Dispositivos donde tu cuenta tiene sesión abierta. Cierra cualquier sesión que no reconozcas.')}</p>
          </div>
          <button type="button" class="btn btn-secondary" id="orgSessionsRevokeAllBtn">
            <i class="aisc-ico aisc-ico--logout"></i> ${__('Cerrar todas las otras sesiones')}
          </button>
        </div>
        <div class="org-sessions-list" id="orgSessionsList">
          <p class="org-placeholder">${__('Cargando…')}</p>
        </div>
      </section>
    </div>

  </div>

  <footer class="organization-footer">
    <div class="organization-footer-left">
      <span>ARDE Agency S.A.S. — Medellín, Colombia</span>
      <span class="organization-footer-sep">·</span>
      <a href="mailto:info@ardeagency.com">info@ardeagency.com</a>
    </div>
    <nav class="organization-footer-links" aria-label="Legal">
      <a href="https://aismartcontent.io/privacy-policy" target="_blank" rel="noopener">${__('Política de privacidad')}</a>
      <span class="organization-footer-sep">·</span>
      <a href="https://aismartcontent.io/terms-and-conditions" target="_blank" rel="noopener">${__('Términos de servicio')}</a>
      <span class="organization-footer-sep">·</span>
      <a href="https://aismartcontent.io/data-deletion" target="_blank" rel="noopener">${__('Eliminación de datos')}</a>
      <span class="organization-footer-sep">·</span>
      <a href="https://aismartcontent.io/contact" target="_blank" rel="noopener">${__('Contacto')}</a>
    </nav>
  </footer>
</div>

<!-- ── Modal: Invitar miembro ─────────────────────────── -->
<div class="modal org-modal" id="orgInviteModal" aria-hidden="true">
  <div class="modal-content">
    <div class="modal-header">
      <h3>${__('Invitar miembro')}</h3>
      <button type="button" class="modal-close" id="orgInviteModalClose" aria-label="${__('Cerrar')}">&times;</button>
    </div>
    <form id="orgInviteForm">
      <div class="form-group">
        <label for="inviteEmail">${__('Email del usuario')}</label>
        <input type="email" id="inviteEmail" class="form-input" required placeholder="usuario@empresa.com">
      </div>
      <div class="form-group">
        <label for="inviteRole">${__('Rol')}</label>
        <select id="inviteRole" class="form-input">
          <option value="member">${__('Miembro')}</option>
          <option value="admin">${__('Administrador')}</option>
          <option value="viewer">${__('Viewer (solo lectura)')}</option>
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="orgInviteCancel">${__('Cancelar')}</button>
        <button type="submit" class="btn btn-primary">${__('Enviar invitación')}</button>
      </div>
    </form>
  </div>
</div>

<!-- ── Modal: Activar 2FA (TOTP enroll) ────────────────── -->
<div class="modal org-modal" id="orgMfaEnrollModal" aria-hidden="true">
  <div class="modal-content" style="max-width: 480px;">
    <div class="modal-header">
      <h3>${__('Activar autenticación de 2 pasos')}</h3>
      <button type="button" class="modal-close" id="orgMfaEnrollClose" aria-label="${__('Cerrar')}">&times;</button>
    </div>
    <div id="orgMfaEnrollBody">
      <ol class="org-mfa-steps">
        <li>${__('Abre tu app autenticadora (Google Authenticator, Authy, 1Password).')}</li>
        <li>${__('Escanea este código QR. Si no puedes, copia el código manualmente.')}</li>
        <li>${__('Ingresa el código de 6 dígitos que muestra tu app.')}</li>
      </ol>
      <div class="org-mfa-qr-wrap" id="orgMfaQrWrap">
        <p class="org-placeholder">${__('Generando código…')}</p>
      </div>
      <div class="form-group" id="orgMfaSecretWrap" hidden>
        <label>${__('Código manual (si el QR no funciona)')}</label>
        <input type="text" id="orgMfaSecret" class="form-input" readonly style="font-family: monospace; letter-spacing: 1px;">
      </div>
      <form id="orgMfaEnrollForm">
        <div class="form-group">
          <label for="orgMfaCode">${__('Código de 6 dígitos')}</label>
          <input type="text" id="orgMfaCode" class="form-input" required maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" style="font-size: 1.5rem; letter-spacing: 0.3rem; text-align: center; font-family: monospace;">
        </div>
        <p class="org-mfa-error" id="orgMfaEnrollError" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="orgMfaEnrollCancel">${__('Cancelar')}</button>
          <button type="submit" class="btn btn-primary" id="orgMfaEnrollSubmit">${__('Verificar y activar')}</button>
        </div>
      </form>
    </div>
  </div>
</div>
`;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.orgId = this.routeParams?.orgId ||
      window.appState?.get?.('selectedOrganizationId') ||
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
    this.updateHeaderContext(__('Configuración'), null, this.org?.name || null);
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
      await this._loadOrg();
      // Pintar YA el tab por defecto (General) + estado del header: solo dependen de
      // _loadOrg (1 query). Antes esperaban a las 17 queries del Promise.all -> la
      // pagina se sentia "pesada"/congelada. El render del batch de abajo los repite
      // (idempotente) para re-aplicar canEdit cuando canManageMembers ya este resuelto.
      this._renderHeaderStatus();
      this._renderGeneral();
      await Promise.all([
        this._loadMembers(),
        this._loadInvitations(),
        this._loadBrandContainers(),
        this._loadControlStats(),
        this._loadUsage(),
        this._loadNotifications(),
        this._loadAuditLog(),
        this._loadMfa(),
      ]);

      this._renderHeaderStatus();
      this._renderGeneral();
      this._renderControlStats();
      this._renderSubbrands();
      this._renderMembers();
      this._renderInvitations();
      this._renderUsage();
      this._renderNotifications();
      this._renderAuditLog();
      this._renderMfa();
      this._renderSessions();
    } catch (e) {
      console.error('OrganizationView _loadAll:', e);
      this._showError(e.message || __('Error al cargar la configuración.'));
    }
  }

  async _loadOrg() {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('id, name, owner_user_id, created_at, deleted_at, timezone, locale, mfa_required')
      .eq('id', this.orgId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(__('Organización no encontrada.'));
    this.org = data;
    this.isOwner = this.org.owner_user_id === this.userId;
    this.mfaOrgRequired = Boolean(data.mfa_required);
  }

  // ── MFA (FEAT-020) ───────────────────────────────────────
  async _loadMfa() {
    try {
      const { data, error } = await this.supabase.auth.mfa.listFactors();
      if (error) throw error;
      this.mfaFactors = (data?.totp || []).filter((f) => f.status === 'verified' || f.status === 'unverified');
    } catch (e) {
      console.warn('OrganizationView _loadMfa:', e.message);
      this.mfaFactors = [];
    }
  }

  _renderMfa() {
    const personal = this.querySelector('#orgMfaPersonal');
    if (personal) {
      const verified = this.mfaFactors.filter((f) => f.status === 'verified');
      if (verified.length === 0) {
        personal.innerHTML = `
          <div class="org-mfa-status org-mfa-status--off">
            <i class="aisc-ico aisc-ico--shield"></i>
            <div>
              <strong>${__('2FA no activa')}</strong>
              <p>${__('Tu cuenta usa solo email + contraseña. Activa la autenticación de 2 pasos para una capa extra de seguridad.')}</p>
            </div>
            <button type="button" class="btn btn-primary" id="orgMfaEnrollBtn">
              <i class="aisc-ico aisc-ico--lock"></i> ${__('Activar 2FA')}
            </button>
          </div>
        `;
      } else {
        const f = verified[0];
        const created = f.created_at ? new Date(f.created_at).toLocaleDateString() : '—';
        personal.innerHTML = `
          <div class="org-mfa-status org-mfa-status--on">
            <i class="aisc-ico aisc-ico--shield"></i>
            <div>
              <strong>${__('2FA activa')}</strong>
              <p>${__('Factor TOTP enrolado el {fecha}. En tu próximo login se te pedirá el código de 6 dígitos.', { fecha: this.escapeHtml(created) })}</p>
            </div>
            <button type="button" class="btn btn-secondary" data-factor-id="${this.escapeHtml(f.id)}" id="orgMfaUnenrollBtn">
              <i class="aisc-ico aisc-ico--delete"></i> ${__('Desactivar')}
            </button>
          </div>
        `;
      }
    }

    const policy = this.querySelector('#orgMfaPolicy');
    if (policy) {
      if (this.isOwner) {
        policy.hidden = false;
        const toggle = this.querySelector('#orgMfaRequireToggle');
        const hint   = this.querySelector('#orgMfaPolicyHint');
        if (toggle) toggle.checked = this.mfaOrgRequired;
        if (hint) {
          hint.textContent = this.mfaOrgRequired
            ? __('Todos los miembros deben activar 2FA antes de poder acceder. Quienes aún no la tengan serán redirigidos al flujo de activación en su próximo login.')
            : __('Cada miembro decide si activa 2FA por su cuenta. Actívalo arriba para tu propia cuenta.');
        }
      } else {
        policy.hidden = true;
      }
    }
  }

  _bindMfaEvents() {
    const enrollBtn = this.querySelector('#orgMfaEnrollBtn');
    if (enrollBtn) enrollBtn.addEventListener('click', () => this._openMfaEnrollModal());

    const unenrollBtn = this.querySelector('#orgMfaUnenrollBtn');
    if (unenrollBtn) unenrollBtn.addEventListener('click', (e) => {
      const factorId = e.currentTarget.dataset.factorId;
      this._unenrollMfa(factorId);
    });

    const toggle = this.querySelector('#orgMfaRequireToggle');
    if (toggle) toggle.addEventListener('change', (e) => this._toggleOrgMfaRequired(e.target.checked));

    const modal = this.querySelector('#orgMfaEnrollModal');
    if (modal) {
      const close = modal.querySelector('#orgMfaEnrollClose');
      const cancel = modal.querySelector('#orgMfaEnrollCancel');
      if (close) close.addEventListener('click', () => this._closeMfaEnrollModal());
      if (cancel) cancel.addEventListener('click', () => this._closeMfaEnrollModal());
      const form = modal.querySelector('#orgMfaEnrollForm');
      if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this._submitMfaEnroll(); });
    }
  }

  async _openMfaEnrollModal() {
    const modal = this.querySelector('#orgMfaEnrollModal');
    const qrWrap = this.querySelector('#orgMfaQrWrap');
    const secretWrap = this.querySelector('#orgMfaSecretWrap');
    const secretInput = this.querySelector('#orgMfaSecret');
    const errorEl = this.querySelector('#orgMfaEnrollError');
    const codeInput = this.querySelector('#orgMfaCode');
    if (!modal) return;

    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    if (codeInput) codeInput.value = '';
    if (qrWrap) qrWrap.innerHTML = `<p class="org-placeholder">${__('Generando código…')}</p>`;
    if (secretWrap) secretWrap.hidden = true;

    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('modal-open');

    // Limpiar factors unverified previos (Supabase exige un solo factor unverified a la vez)
    try {
      const stale = this.mfaFactors.filter((f) => f.status === 'unverified');
      for (const f of stale) {
        await this.supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    } catch (e) {
      console.warn('OrganizationView _openMfaEnrollModal cleanup:', e.message);
    }

    try {
      const { data, error } = await this.supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `${this.org?.name || 'AI Smart Content'} (${new Date().toISOString().slice(0, 10)})`,
      });
      if (error) throw error;

      this.mfaEnroll = {
        factorId: data.id,
        qr:       data.totp?.qr_code,    // SVG data URL
        secret:   data.totp?.secret,
      };

      if (qrWrap && this.mfaEnroll.qr) {
        // Supabase devuelve el QR como SVG inline (string) o data URL.
        // Para data URLs de SVG no podemos usar innerHTML con un <img src="..."> en
        // template string porque el SVG contiene comillas y >, que rompen el atributo.
        // → property assignment via createElement evita cualquier escape de HTML.
        const qr = this.mfaEnroll.qr;
        qrWrap.replaceChildren();
        if (qr.startsWith('data:image')) {
          const img = document.createElement('img');
          img.src = qr;
          img.alt = __('QR 2FA');
          img.style.cssText = 'width:200px;height:200px;background:white;padding:8px;border-radius:8px;';
          qrWrap.appendChild(img);
        } else if (qr.includes('<svg')) {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:inline-block;background:white;padding:8px;border-radius:8px;width:216px;height:216px;';
          wrap.innerHTML = qr;
          qrWrap.appendChild(wrap);
        } else {
          const p = document.createElement('p');
          p.className = 'org-placeholder';
          p.textContent = __('QR no disponible. Usa el código manual.');
          qrWrap.appendChild(p);
        }
      }
      if (secretInput && this.mfaEnroll.secret) {
        secretInput.value = this.mfaEnroll.secret;
        secretWrap.hidden = false;
      }
      if (codeInput) codeInput.focus();
    } catch (e) {
      console.error('OrganizationView _openMfaEnrollModal enroll:', e);
      if (errorEl) {
        errorEl.textContent = __('No se pudo iniciar el enroll: {error}', { error: e.message || __('error desconocido') });
        errorEl.hidden = false;
      }
    }
  }

  _closeMfaEnrollModal() {
    const modal = this.querySelector('#orgMfaEnrollModal');
    if (modal) {
      modal.classList.remove('modal-open');
      modal.setAttribute('aria-hidden', 'true');
    }
    // Si quedó un factor unverified al cerrar sin verificar, lo limpiamos
    if (this.mfaEnroll?.factorId) {
      const factorId = this.mfaEnroll.factorId;
      this.supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
      this.mfaEnroll = null;
    }
  }

  async _submitMfaEnroll() {
    const codeInput = this.querySelector('#orgMfaCode');
    const errorEl   = this.querySelector('#orgMfaEnrollError');
    const submitBtn = this.querySelector('#orgMfaEnrollSubmit');
    if (!codeInput || !this.mfaEnroll) return;
    const code = String(codeInput.value || '').trim();
    if (!/^[0-9]{6}$/.test(code)) {
      if (errorEl) { errorEl.textContent = __('El código debe ser de 6 dígitos numéricos.'); errorEl.hidden = false; }
      return;
    }
    if (errorEl) errorEl.hidden = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const { data: chal, error: chalErr } = await this.supabase.auth.mfa.challenge({ factorId: this.mfaEnroll.factorId });
      if (chalErr) throw chalErr;

      const { data: verify, error: verErr } = await this.supabase.auth.mfa.verify({
        factorId:    this.mfaEnroll.factorId,
        challengeId: chal.id,
        code,
      });
      if (verErr) throw verErr;

      // ✓ Verificado — limpiamos el enroll state y refrescamos
      this.mfaEnroll = null;
      const modal = this.querySelector('#orgMfaEnrollModal');
      if (modal) {
        modal.classList.remove('modal-open');
        modal.setAttribute('aria-hidden', 'true');
      }
      this._toast(__('2FA activada. En tu próximo login se pedirá el código.'));
      await this._loadMfa();
      this._renderMfa();
      this._bindMfaEvents();
    } catch (e) {
      console.error('OrganizationView _submitMfaEnroll:', e);
      if (errorEl) {
        errorEl.textContent = __('Código inválido o expirado: {error}', { error: e.message || __('intenta de nuevo') });
        errorEl.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async _unenrollMfa(factorId) {
    if (!factorId) return;
    if (!confirm(__('¿Desactivar 2FA? Tu cuenta volverá a quedar solo con email + contraseña.'))) return;
    try {
      const { error } = await this.supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      this._toast(__('2FA desactivada.'));
      await this._loadMfa();
      this._renderMfa();
      this._bindMfaEvents();
    } catch (e) {
      console.error('OrganizationView _unenrollMfa:', e);
      this._toast(__('No se pudo desactivar: {error}', { error: e.message || __('error') }));
    }
  }

  async _toggleOrgMfaRequired(required) {
    try {
      const { data, error } = await this.supabase.rpc('set_org_mfa_required', {
        p_org_id:   this.orgId,
        p_required: required,
      });
      if (error) throw error;
      this.mfaOrgRequired = Boolean(data);
      this._toast(required ? __('Política activada: 2FA exigida para todos los miembros.') : __('Política desactivada.'));
      this._renderMfa();
      this._bindMfaEvents();
    } catch (e) {
      console.error('OrganizationView _toggleOrgMfaRequired:', e);
      this._toast(__('No se pudo guardar: {error}', { error: e.message || __('error') }));
      // revertir UI
      const toggle = this.querySelector('#orgMfaRequireToggle');
      if (toggle) toggle.checked = this.mfaOrgRequired;
    }
  }

  // ── Sesiones activas (FEAT-020) ────────────────────────
  _renderSessions() {
    const wrap = this.querySelector('#orgSessionsList');
    if (!wrap) return;

    // Supabase no expone auth.sessions al cliente — solo podemos mostrar la sesión
    // actual y permitir cerrar globalmente vía signOut({ scope: 'others' }).
    const ua = navigator.userAgent || __('Navegador desconocido');
    const platform = navigator.platform || '';
    const sessionStartIso = (() => {
      try {
        const raw = localStorage.getItem('sb-' + (this.supabase?.supabaseUrl || '').split('//')[1]?.split('.')[0] + '-auth-token');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.expires_at ? new Date((parsed.expires_at - 3600) * 1000).toISOString() : null;
      } catch { return null; }
    })();
    const sessionStartHuman = sessionStartIso ? new Date(sessionStartIso).toLocaleString() : __('desconocido');

    wrap.innerHTML = `
      <div class="org-session-card">
        <i class="aisc-ico aisc-ico--laptop"></i>
        <div class="org-session-info">
          <strong>${__('Esta sesión')} <span class="org-session-badge">${__('actual')}</span></strong>
          <p>${this.escapeHtml(ua.slice(0, 120))}</p>
          <p class="org-session-meta">${__('Plataforma:')} ${this.escapeHtml(platform || '—')} · ${__('Iniciada:')} ${this.escapeHtml(sessionStartHuman)}</p>
        </div>
      </div>
      <p class="org-section-desc" style="margin-top: 0.75rem; font-size: 0.85rem;">
        ${__('Si tienes acceso desde otros dispositivos o navegadores y quieres revocarlos, usa el botón "Cerrar todas las otras sesiones" arriba. Esta sesión actual no se cerrará.')}
      </p>
    `;
  }

  _bindSessionsEvents() {
    const revokeAllBtn = this.querySelector('#orgSessionsRevokeAllBtn');
    if (revokeAllBtn) revokeAllBtn.addEventListener('click', () => this._revokeOtherSessions());
  }

  async _revokeOtherSessions() {
    if (!confirm(__('¿Cerrar todas las otras sesiones? Tendrás que volver a iniciar sesión en cualquier otro dispositivo o navegador.'))) return;
    try {
      const { error } = await this.supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      this._toast(__('Todas las otras sesiones fueron cerradas.'));
    } catch (e) {
      console.error('OrganizationView _revokeOtherSessions:', e);
      this._toast(__('No se pudo cerrar: {error}', { error: e.message || __('error') }));
    }
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
        .from('profiles').select('id, full_name, email').in('id', userIds);
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
      .eq('organization_id', this.orgId).eq('status', 'pending').order('created_at', { ascending: false });
    this.invitations = data || [];
  }

  async _loadBrandContainers() {
    const { data } = await this.supabase
      .from('brand_containers')
      .select('id, nombre_marca, created_at')
      .eq('organization_id', this.orgId).order('created_at', { ascending: true });
    this.brandContainers = data || [];
  }

  // ── Centro de control: conteos por entidad ──
  // brand_entities/products/services son org-scope directos; brand_places
  // (escenarios) y brand_characters (actores) cuelgan de entity_id; producciones
  // = flow_runs en el rango. Conteos con head:true (no traen filas).
  async _loadControlStats() {
    const sb = this.supabase, org = this.orgId;
    const days = this.prodRange || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const cnt = (q) => q.then((r) => r.count || 0).catch(() => 0);
    try {
      const [ents, products, services, productions] = await Promise.all([
        sb.from('brand_entities').select('id').eq('organization_id', org),
        cnt(sb.from('products').select('*', { count: 'exact', head: true }).eq('organization_id', org)),
        cnt(sb.from('services').select('*', { count: 'exact', head: true }).eq('organization_id', org)),
        cnt(sb.from('flow_runs').select('*', { count: 'exact', head: true }).eq('organization_id', org).gte('created_at', since)),
      ]);
      const entIds = (ents.data || []).map((e) => e.id);
      let places = 0, characters = 0;
      if (entIds.length) {
        [places, characters] = await Promise.all([
          cnt(sb.from('brand_places').select('*', { count: 'exact', head: true }).in('entity_id', entIds)),
          cnt(sb.from('brand_characters').select('*', { count: 'exact', head: true }).in('entity_id', entIds)),
        ]);
      }
      this.controlStats = { identities: entIds.length, products, services, places, characters, productions, days };
    } catch (e) {
      console.warn('OrganizationView _loadControlStats:', e?.message || e);
      this.controlStats = { identities: 0, products: 0, services: 0, places: 0, characters: 0, productions: 0, days };
    }
  }

  _renderControlStats() {
    const el = this.querySelector('#orgCtrlStats');
    if (!el) return;
    const s = this.controlStats || { identities: 0, products: 0, services: 0, places: 0, characters: 0, productions: 0, days: this.prodRange };
    const fmt = (n) => Number(n || 0).toLocaleString('es');
    const card = (route, emoji, accent, value, label, extra = '') => `
      <div class="org-ctrl-card" role="button" tabindex="0" data-route="${route}">
        <div class="org-ctrl-top">
          <span class="org-ctrl-chip" style="background:${accent}29;color:${accent}">${emoji}</span>
          ${extra}
        </div>
        <span class="org-ctrl-num">${fmt(value)}</span>
        <span class="org-ctrl-label">${label}</span>
        <span class="org-ctrl-link" style="color:${accent}">${__('Ver todas')} →</span>
      </div>`;
    const prodFilter = `
      <span class="org-ctrl-spacer"></span>
      <select class="org-prod-range" title="${__('Rango')}">
        <option value="7"${s.days === 7 ? ' selected' : ''}>${__('7 días')}</option>
        <option value="30"${s.days === 30 ? ' selected' : ''}>${__('30 días')}</option>
        <option value="90"${s.days === 90 ? ' selected' : ''}>${__('90 días')}</option>
      </select>`;
    el.innerHTML =
      card('/identities', '🪪', '#06b6d4', s.identities, __('Identidades')) +
      card('/products',   '📦', '#7c3aed', s.products,   __('Productos')) +
      card('/services',   '🛠️', '#22c55e', s.services,   __('Servicios')) +
      card('/places',     '🏞️', '#f59e0b', s.places,     __('Escenarios')) +
      card('/characters', '🎭', '#ef4444', s.characters, __('Actores')) +
      card('/brand-storage', '🏢', '#3b82f6', this.brandContainers.length, __('Marcas gestionadas')) +
      card('/production', '🎬', '#ec4899', s.productions, __('Producciones'), prodFilter);
  }

  // ── Uso: consumo de créditos por día y por área (fuente) ──
  // credit_usage.credits_delta < 0 = consumo. El área (studio/video/vera/
  // production/background/system) viene de feature_costs vía CreditCosts.get(kind).
  async _loadUsage() {
    const days = this.usageRange || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    try { await (window.CreditCosts?.getMap?.()); } catch (_) {}
    const { data } = await this.supabase
      .from('credit_usage').select('kind, credits_delta, created_at')
      .eq('organization_id', this.orgId)
      .lt('credits_delta', 0)
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    const rows = data || [];
    const byDayMap = {};
    const byArea = { studio: 0, video: 0, vera: 0, production: 0, background: 0, system: 0 };
    let total = 0;
    rows.forEach((r) => {
      const day = (r.created_at || '').slice(0, 10);
      if (!day) return;
      const area = (window.CreditCosts?.get?.(r.kind)?.area) || 'background';
      const c = Math.abs(Number(r.credits_delta) || 0);
      if (!byDayMap[day]) byDayMap[day] = { day, total: 0, byArea: {} };
      byDayMap[day].byArea[area] = (byDayMap[day].byArea[area] || 0) + c;
      byDayMap[day].total += c;
      byArea[area] = (byArea[area] || 0) + c;
      total += c;
    });
    const byDay = Object.values(byDayMap).sort((a, b) => a.day.localeCompare(b.day));
    const peak = byDay.reduce((m, d) => (d.total > (m ? m.total : 0) ? d : m), null);
    const topAreaKey = Object.entries(byArea).sort((a, b) => b[1] - a[1])[0];
    this.usage = {
      days, byDay, byArea, total,
      peak,
      topAreaKey: total > 0 && topAreaKey ? topAreaKey[0] : null,
      events: rows.length,
    };
  }

  async _loadNotifications() {
    const { data } = await this.supabase
      .from('org_notifications')
      .select('id, type, severity, title, body, action_url, action_label, status, read_at, created_at')
      .eq('organization_id', this.orgId).order('created_at', { ascending: false }).limit(20);
    this.notifications = data || [];
  }

  async _loadBilling() {
    if (!this.supabase || !this.orgId) return;
    try {
      const [{ data: subRows }, { data: stripeInvs }, { data: wompiTxs }, planRow, caps, usageToday] = await Promise.all([
        this.supabase.from('subscriptions')
          .select('id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end,canceled_at,provider,next_charge_at,stripe_subscription_id,wompi_last_transaction_id')
          .eq('organization_id', this.orgId).order('updated_at', { ascending: false }).limit(1),
        this.supabase.from('stripe_invoices')
          .select('invoice_id,amount_paid_cents,currency,status,hosted_invoice_url,invoice_pdf,paid_at,created_at,period_start,period_end')
          .eq('organization_id', this.orgId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('wompi_transactions')
          .select('transaction_id,reference,target,amount_in_cents,currency,status,payment_method_type,finalized_at,created_at')
          .eq('organization_id', this.orgId).eq('status', 'APPROVED').order('created_at', { ascending: false }).limit(50),
        // plan en uso (puede ser distinto del de la sub si está en trial / sin sub)
        this._billingPlan(),
        this.supabase.from('org_claude_caps').select('*').eq('organization_id', this.orgId).maybeSingle().then((r) => r.data).catch(() => null),
        this.supabase.from('v_org_claude_usage_today').select('*').eq('organization_id', this.orgId).maybeSingle().then((r) => r.data).catch(() => null),
      ]);
      this.billingSub      = (subRows && subRows[0]) || null;
      this.billingInvoices = stripeInvs || [];
      this.billingWompiTxs = wompiTxs   || [];
      this.billingPlanRow  = planRow    || null;
      this.billingCaps     = caps       || null;
      this.billingUsageToday = usageToday || null;
    } catch (e) {
      console.warn('[organization] _loadBilling error:', e?.message || e);
    }
    this._renderBilling();
  }

  async _billingPlan() {
    if (!this.billingSub?.plan_id) return null;
    const { data } = await this.supabase
      .from('plans').select('id,name,display_order').eq('id', this.billingSub.plan_id).maybeSingle();
    return data || null;
  }

  _renderBilling() {
    const summary = this.querySelector('#orgBillingSummary');
    const list    = this.querySelector('#orgBillingInvoices');
    if (!summary || !list) return;

    const sub      = this.billingSub;
    const plan     = this.billingPlanRow;
    const past_due = sub?.status === 'past_due';
    const canceled = sub?.status === 'canceled' || sub?.cancel_at_period_end;

    const providerLabel = sub?.provider === 'wompi' ? __('Wompi (COP)') : sub?.provider === 'stripe' ? __('Stripe (USD)') : '—';
    const planName      = plan?.name || sub?.plan_id || __('Sin plan');
    const nextRenew     = sub?.provider === 'wompi' ? sub?.next_charge_at : sub?.current_period_end;
    const nextRenewStr  = nextRenew ? new Date(nextRenew).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const statusLabel   = ({ active: __('Activa'), trial: __('En prueba'), past_due: __('Pago pendiente'), canceled: __('Cancelada') }[sub?.status]) || (sub?.status || __('Sin suscripción'));

    const banner = past_due
      ? `<div class="org-error-banner" style="margin-bottom:1rem;">${__('Tu último pago no se procesó correctamente. Actualiza tu método de pago para evitar la suspensión del servicio.')}</div>`
      : canceled
      ? `<div class="org-warning-banner" style="margin-bottom:1rem;background:#3a2410;border:1px solid #6b3a17;color:#fbbf24;padding:.75rem 1rem;border-radius:8px;">${__('Tu suscripción terminará el {fecha}.', { fecha: this.escapeHtml(nextRenewStr) })}</div>`
      : '';

    const stripePortalBtn = sub?.provider === 'stripe'
      ? `<button type="button" class="btn btn-secondary" id="orgBillingPortalBtn"><i class="aisc-ico aisc-ico--external-link"></i> ${__('Gestionar suscripción')}</button>`
      : '';
    const hasActiveSub = sub && ['active','trial','past_due'].includes(sub.status);
    const cancelBtn = hasActiveSub && !sub.cancel_at_period_end
      ? `<button type="button" class="btn btn-secondary" id="orgBillingCancelBtn"><i class="aisc-ico aisc-ico--close"></i> ${__('Cancelar suscripción')}</button>`
      : '';
    const reactivateBtn = hasActiveSub && sub.cancel_at_period_end
      ? `<button type="button" class="btn btn-secondary" id="orgBillingReactivateBtn"><i class="aisc-ico aisc-ico--refresh"></i> ${__('Reactivar suscripción')}</button>`
      : '';
    const upgradeBtn = `<a href="${this.escapeHtml(this._plansHref())}" class="btn btn-primary"><i class="aisc-ico aisc-ico--arrow-up"></i> ${__('Ver planes')}</a>`;

    const limits = this.querySelector('#orgBillingLimits');

    // Pagos unificados (Stripe + Wompi) — para "último pago" y el historial.
    const stripeRows = (this.billingInvoices || []).map((inv) => ({
      key: inv.invoice_id, provider: 'stripe',
      date: inv.paid_at || inv.created_at,
      amount: (inv.amount_paid_cents || 0) / 100,
      currency: (inv.currency || 'usd').toUpperCase(),
      status: inv.status,
      desc: __('Período {periodo}', { periodo: this._fmtPeriod(inv.period_start, inv.period_end) }),
      url: inv.hosted_invoice_url || inv.invoice_pdf || null,
    }));
    const wompiRows = (this.billingWompiTxs || []).map((tx) => ({
      key: tx.transaction_id, provider: 'wompi',
      date: tx.finalized_at || tx.created_at,
      amount: (tx.amount_in_cents || 0) / 100,
      currency: tx.currency || 'COP',
      status: tx.status,
      desc: tx.target === 'subscription' ? __('Suscripción') : __('Paquete de créditos'),
      url: null,
    }));
    const all = [...stripeRows, ...wompiRows].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastPaid = all[0] || null;

    const statusTone = (past_due || canceled) ? 'warn' : sub ? 'ok' : 'muted';
    const card = (label, emoji, accent, value, sub2, pill) => `
      <div class="org-bill-card">
        <div class="org-bill-card-top">
          <span class="org-bill-chip" style="background:${accent}29;color:${accent}">${emoji}</span>
          <span class="org-bill-card-label">${this.escapeHtml(label)}</span>
        </div>
        <div class="org-bill-card-val">
          <span class="org-bill-card-value">${this.escapeHtml(value)}</span>
          ${pill ? `<span class="org-bill-pill org-bill-pill--${pill.tone}">${this.escapeHtml(pill.text)}</span>` : ''}
        </div>
        <span class="org-bill-card-sub">${this.escapeHtml(sub2)}</span>
      </div>`;
    const nextSub = canceled ? __('La suscripción termina pronto') : (lastPaid ? this._fmtMoney(lastPaid.amount, lastPaid.currency) : '—');

    summary.innerHTML = `
      ${banner}
      <div class="org-bill-cards">
        ${card(__('Plan actual'), '💳', '#7c3aed', planName, providerLabel, { text: statusLabel, tone: statusTone })}
        ${card(__('Próximo pago'), '📅', '#06b6d4', nextRenewStr, nextSub)}
        ${card(__('Último pago'), '✅', '#22c55e', lastPaid ? this._fmtDate(lastPaid.date) : '—', lastPaid ? this._fmtMoney(lastPaid.amount, lastPaid.currency) : __('sin pagos aún'))}
      </div>
      <div class="org-bill-actions">${upgradeBtn} ${stripePortalBtn} ${cancelBtn} ${reactivateBtn}</div>
    `;

    if (limits) this._renderBillingLimits(limits);

    if (all.length === 0) {
      list.innerHTML = `<p class="org-placeholder">${__('Sin facturas todavía. Las verás aquí después de tu primer pago.')}</p>`;
    } else {
      const paidPill = (s) => {
        const ok = ['paid', 'APPROVED', 'succeeded'].includes(s);
        return `<span class="org-bill-pill org-bill-pill--${ok ? 'ok' : 'muted'}">${this.escapeHtml(ok ? __('Pagado') : (s || '—'))}</span>`;
      };
      list.innerHTML = `
        <div class="org-bill-table">
          <div class="org-bill-trow org-bill-trow--head">
            <span>${__('Fecha')}</span><span>${__('Concepto')}</span>
            <span class="org-bill-right">${__('Monto')}</span><span>${__('Estado')}</span><span></span>
          </div>
          ${all.map((r) => `
            <div class="org-bill-trow">
              <span class="org-bill-date">${this.escapeHtml(this._fmtDate(r.date))}</span>
              <span class="org-bill-desc">${this.escapeHtml(r.desc || '—')} <em>· ${r.provider === 'wompi' ? 'Wompi' : 'Stripe'}</em></span>
              <span class="org-bill-right org-bill-amount">${this.escapeHtml(this._fmtMoney(r.amount, r.currency))}</span>
              <span>${paidPill(r.status)}</span>
              <span class="org-bill-right">${r.url ? `<a href="${this.escapeHtml(r.url)}" target="_blank" rel="noopener" class="org-bill-pdf">PDF ↗</a>` : '—'}</span>
            </div>`).join('')}
        </div>`;
    }

    this.querySelector('#orgBillingPortalBtn')?.addEventListener('click', () => { window.billingService?.openCustomerPortal(); });
    this.querySelector('#orgBillingCancelBtn')?.addEventListener('click', () => this._cancelSubscription(false));
    this.querySelector('#orgBillingReactivateBtn')?.addEventListener('click', () => this._cancelSubscription(true));
    this.querySelector('#orgCapsForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._saveCaps(); });
  }

  _renderBillingLimits(el) {
    const caps = this.billingCaps || {};
    const today = this.billingUsageToday || {};
    const canEdit = this.isOwner || this.canManageMembers;
    const dailyCap = caps.daily_usd_cap;
    const usedToday = today.cost_usd_today ?? today.usd ?? null;
    const pct = (dailyCap && usedToday != null) ? Math.min(100, Math.round((usedToday / dailyCap) * 100)) : 0;
    const warnPct = caps.warn_threshold != null ? Math.round(caps.warn_threshold * 100) : '';
    const todayStr = (usedToday != null ? this._fmtMoney(usedToday, 'USD') : '$0.00') + (dailyCap ? ' / ' + this._fmtMoney(dailyCap, 'USD') : '');
    el.innerHTML = `
      <div class="org-bill-limits-head">
        <h3 class="org-uchart-title">${__('Límites de uso automático')}</h3>
        <p class="org-uchart-desc">${__('Topes de consumo del agente. Al alcanzar el umbral de aviso te notificamos; al llegar al cap se pausan las operaciones automáticas.')}</p>
      </div>
      <form id="orgCapsForm" class="org-bill-limits-form">
        <div class="org-bill-fields">
          <div class="org-bill-field"><label for="capsDaily">${__('Cap diario (USD)')}</label><input type="number" min="0" step="0.01" id="capsDaily" class="form-input" placeholder="${__('ej. 10')}" value="${dailyCap ?? ''}"></div>
          <div class="org-bill-field"><label for="capsMonthly">${__('Cap mensual (USD)')}</label><input type="number" min="0" step="0.01" id="capsMonthly" class="form-input" placeholder="${__('ej. 200')}" value="${caps.monthly_usd_cap ?? ''}"></div>
          <div class="org-bill-field"><label for="capsWarn">${__('Umbral de aviso (%)')}</label><input type="number" min="0" max="100" step="1" id="capsWarn" class="form-input" placeholder="${__('ej. 80')}" value="${warnPct}"></div>
        </div>
        <div class="org-bill-today">
          <div class="org-bill-today-row"><span>${__('Consumo automático de hoy')}</span><strong>${this.escapeHtml(todayStr)}</strong></div>
          <div class="org-bill-today-track"><span class="org-bill-today-fill" style="width:${pct}%"></span></div>
        </div>
        <div class="org-bill-limits-actions">
          <button type="submit" class="btn btn-primary" id="orgCapsSubmit"${canEdit ? '' : ' disabled'}><i class="aisc-ico aisc-ico--save"></i> ${__('Guardar límites')}</button>
        </div>
      </form>`;
    if (!canEdit) el.querySelectorAll('input').forEach((i) => { i.disabled = true; });
  }

  async _saveCaps() {
    const btn = this.querySelector('#orgCapsSubmit');
    const num = (sel) => { const v = this.querySelector(sel)?.value; if (v === '' || v == null) return null; const n = Number(v); return isNaN(n) ? null : n; };
    const payload = {
      organization_id: this.orgId,
      daily_usd_cap: num('#capsDaily'),
      monthly_usd_cap: num('#capsMonthly'),
      warn_threshold: (() => { const v = num('#capsWarn'); return v == null ? null : v / 100; })(),
    };
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="aisc-ico fa-spin aisc-ico--loader"></i> ${__('Guardando…')}`; }
    try {
      const { error } = await this.supabase.from('org_claude_caps').upsert(payload, { onConflict: 'organization_id' });
      if (error) throw error;
      this.billingCaps = { ...(this.billingCaps || {}), ...payload };
      this._toast(__('Límites actualizados'));
    } catch (e) {
      alert(e.message || __('No se pudo guardar los límites.'));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = `<i class="aisc-ico aisc-ico--save"></i> ${__('Guardar límites')}`; }
    }
  }

  async _cancelSubscription(undo) {
    const action = undo ? __('reactivar') : __('cancelar');
    if (!undo && !window.confirm(__('¿Cancelar la suscripción al final del período actual? Mantendrás acceso hasta entonces y no se hará otro cobro automático.'))) return;

    try {
      const supabase = window.supabaseService?.getClient ? await window.supabaseService.getClient() : window.supabase;
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ organization_id: this.orgId, undo: !!undo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || __('No se pudo {accion}', { accion: action }));
      const msg = undo ? __('Suscripción reactivada. El próximo cobro procederá como antes.')
                       : __('Suscripción cancelada. Mantienes acceso hasta el {fecha}.', { fecha: this._fmtDate(data.cancel_at) });
      (window.showToast || window.alert)(msg, 'success');
      this._billingLoaded = false;
      await this._loadBilling();
    } catch (e) {
      (window.showToast || window.alert)(__('Error: {error}', { error: e.message }), 'error');
    }
  }

  _fmtPeriod(start, end) {
    if (!start || !end) return '—';
    const opts = { day: 'numeric', month: 'short' };
    return `${new Date(start).toLocaleDateString('es', opts)} – ${new Date(end).toLocaleDateString('es', opts)}`;
  }
  _fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  _fmtMoney(amount, currency) {
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
    catch (_) { return `${amount.toFixed(2)} ${currency}`; }
  }
  _plansHref() {
    if (typeof window.getOrgPathPrefix === 'function' && this.org?.name) {
      const prefix = window.getOrgPathPrefix(this.orgId, this.org.name);
      if (prefix) return `${prefix}/plans`;
    }
    return '/plans';
  }

  async _loadAuditLog() {
    const { data } = await this.supabase
      .from('user_audit_log')
      .select('id, action, resource_type, resource_id, user_id, user_email, metadata, created_at')
      .eq('organization_id', this.orgId).order('created_at', { ascending: false }).limit(200);
    this.auditLog = data || [];
  }

  // ── Render ─────────────────────────────────────────────
  _renderHeaderStatus() {
    const el = this.querySelector('#orgHeaderStatus');
    if (!el || !this.org) return;
    const archived = !!this.org.deleted_at;
    el.innerHTML = archived
      ? `<span class="org-status-pill org-status-pill--archived"><i class="aisc-ico aisc-ico--archive"></i> ${__('Archivada')}</span>`
      : `<span class="org-status-pill org-status-pill--active">${__('Activa')}</span>`;
  }

  _renderGeneral() {
    if (!this.org) return;
    const tz = this.querySelector('#orgTimezone');
    const lc = this.querySelector('#orgLocale');
    if (tz) tz.value = this.org.timezone || 'UTC';
    if (lc) lc.value = this.org.locale || 'es';
    const canEdit = this.isOwner || this.canManageMembers;
    if (tz) tz.disabled = !canEdit;
    if (lc) lc.disabled = !canEdit;
    const submitBtn = this.querySelector('#orgGeneralSubmit');
    if (submitBtn) submitBtn.disabled = !canEdit;
  }

  _renderSubbrands() {
    const el = this.querySelector('#orgSubbrandsList');
    if (!el) return;
    if (!this.brandContainers.length) {
      el.innerHTML = `<p class="org-members-empty">${__('Aún no tienes marcas gestionadas. Pulsa "Solicitar nueva marca" para iniciar el proceso de provisión.')}</p>`;
      return;
    }
    el.innerHTML = this.brandContainers.map((b) => {
      const since = b.created_at ? new Date(b.created_at).toLocaleDateString('es') : '—';
      return `
        <div class="org-subbrand-row">
          <div class="org-subbrand-info">
            <span class="org-subbrand-name">${this.escapeHtml(b.nombre_marca || __('Marca'))}</span>
            <span class="org-subbrand-meta">${__('Activa desde {fecha}', { fecha: this.escapeHtml(since) })}</span>
          </div>
          <span class="org-subbrand-lock" title="${__('Provisión gestionada por el equipo de plataforma')}"><i class="aisc-ico aisc-ico--lock"></i> ${__('Gestionada por plataforma')}</span>
        </div>`;
    }).join('');
  }

  _renderMembers() {
    const listEl = this.querySelector('#orgMembersList');
    if (!listEl) return;
    const canManage = this.canManageMembers;
    if (!this.membersWithProfile.length) {
      listEl.innerHTML = `<p class="org-members-empty">${__('Sin miembros cargados.')}</p>`;
      return;
    }
    listEl.innerHTML = this.membersWithProfile.map((m) => {
      const display = m.full_name || m.email || (m.user_id ? m.user_id.slice(0, 8) + '…' : __('Miembro'));
      const isCurrent = m.user_id === this.userId;
      const isOrgOwner = this.org?.owner_user_id === m.user_id;
      const roleLabel = isOrgOwner ? __('Propietario') : (m.role || 'member');
      const canChangeRole = canManage && !isOrgOwner && !isCurrent;
      const canRemove = canManage && !isOrgOwner && !isCurrent;
      const rolePicker = canChangeRole
        ? `<select class="org-role-select" data-member-id="${this.escapeHtml(m.id)}">
             <option value="admin"${m.role === 'admin' ? ' selected' : ''}>${__('Administrador')}</option>
             <option value="member"${m.role === 'member' ? ' selected' : ''}>${__('Miembro')}</option>
             <option value="viewer"${m.role === 'viewer' ? ' selected' : ''}>${__('Viewer')}</option>
           </select>`
        : `<span class="org-member-role org-role-${(roleLabel || 'member').toLowerCase()}">${this.escapeHtml(roleLabel)}</span>`;
      const removeBtn = canRemove
        ? `<button type="button" class="btn btn-ghost btn-sm org-member-remove" data-member-id="${this.escapeHtml(m.id)}" title="${__('Quitar')}"><i class="aisc-ico aisc-ico--close"></i></button>`
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
        <div class="org-invitation-row">
          <div class="org-invitation-info">
            <span class="org-invitation-email">${this.escapeHtml(inv.email)}</span>
            <span class="org-invitation-meta">${this.escapeHtml(inv.role)} · ${__('expira {fecha}', { fecha: expires })}</span>
          </div>
          <div class="org-invitation-actions">
            <button type="button" class="btn btn-ghost btn-sm org-invitation-revoke" data-invitation-id="${this.escapeHtml(inv.id)}">${__('Revocar')}</button>
          </div>
        </div>`;
    }).join('');
  }

  // Áreas (fuentes) del consumo, en orden de apilado (arriba → abajo).
  static USAGE_AREAS = [
    { key: 'studio',     label: 'Studio' },
    { key: 'video',      label: 'Video' },
    { key: 'vera',       label: 'Vera' },
    { key: 'production', label: 'Producción' },
    { key: 'background', label: 'Scrapers' },
    { key: 'system',     label: 'Sistema' },
  ];

  _usageColor(area) { return (window.CreditCosts?.getAreaColor?.(area)) || '#64748b'; }
  _fmtCredits(n) { return Math.round(Number(n) || 0).toLocaleString('es'); }
  _fmtCreditsK(n) {
    n = Number(n) || 0;
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }
  _fmtDay(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }
  _niceMax(v) {
    v = Math.max(1, v);
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * pow;
  }

  _renderUsage() {
    // Pills de rango activas
    this.querySelectorAll('#orgUsageRange .org-range-pill').forEach((p) => {
      p.classList.toggle('org-range-pill--active', Number(p.dataset.range) === this.usageRange);
    });

    const u = this.usage;
    const statsEl = this.querySelector('#orgUsageStats');
    const chartEl = this.querySelector('#orgUsageChart');
    const bdEl = this.querySelector('#orgUsageBreakdown');
    const empty = !u || u.total <= 0;

    // ── Stat cards ──
    if (statsEl) {
      if (empty) {
        statsEl.innerHTML = '';
      } else {
        const topMeta = OrganizationView.USAGE_AREAS.find((a) => a.key === u.topAreaKey);
        const topPct = u.topAreaKey ? Math.round((u.byArea[u.topAreaKey] / u.total) * 100) : 0;
        statsEl.innerHTML = [
          this._usageStat(__('Créditos consumidos · {d}d', { d: u.days }), this._fmtCredits(u.total), __('{n} operaciones', { n: u.events })),
          this._usageStat(__('Promedio diario'), this._fmtCredits(u.total / u.days), __('créditos / día')),
          this._usageStat(__('Día pico'), u.peak ? this._fmtCredits(u.peak.total) : '—', u.peak ? this._fmtDay(u.peak.day) : __('sin datos')),
          this._usageStat(__('Fuente principal'), topMeta ? topMeta.label : '—', topMeta ? __('{p}% del consumo', { p: topPct }) : '—', topMeta ? this._usageColor(topMeta.key) : null),
        ].join('');
      }
    }

    // ── Gráfica apilada ──
    if (chartEl) {
      if (empty) {
        chartEl.innerHTML = `<p class="org-placeholder">${__('Sin consumo de créditos registrado en este período.')}</p>`;
      } else {
        const niceMax = this._niceMax(Math.max(...u.byDay.map((d) => d.total)));
        const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => this._fmtCreditsK(niceMax * f));
        const legend = OrganizationView.USAGE_AREAS.map((a) =>
          `<span class="org-uchart-leg"><i style="background:${this._usageColor(a.key)}"></i>${this.escapeHtml(a.label)}</span>`).join('');
        const bars = u.byDay.map((d) => {
          const hPct = Math.max(1, (d.total / niceMax) * 100);
          const segs = OrganizationView.USAGE_AREAS.filter((a) => (d.byArea[a.key] || 0) > 0).map((a) => {
            const segPct = (d.byArea[a.key] / d.total) * 100;
            return `<div class="org-uchart-seg" style="height:${segPct}%;background:${this._usageColor(a.key)}"></div>`;
          }).join('');
          const tip = `${this._fmtDay(d.day)} · ${this._fmtCredits(d.total)} ${__('créditos')}`;
          return `<div class="org-uchart-col"><div class="org-uchart-bar" style="height:${hPct}%" title="${this.escapeHtml(tip)}">${segs}</div></div>`;
        }).join('');
        // Etiquetas X: hasta 6 fechas equiespaciadas
        const n = u.byDay.length;
        const idxs = n <= 6 ? u.byDay.map((_, i) => i) : [0, 1, 2, 3, 4, 5].map((k) => Math.round(k * (n - 1) / 5));
        const xlabels = [...new Set(idxs)].map((i) => `<span>${this.escapeHtml(this._fmtDay(u.byDay[i].day))}</span>`).join('');
        chartEl.innerHTML = `
          <div class="org-uchart-head">
            <div>
              <h3 class="org-uchart-title">${__('Consumo diario por fuente')}</h3>
              <p class="org-uchart-desc">${__('Créditos consumidos por día, apilados por área de la plataforma.')}</p>
            </div>
            <div class="org-uchart-legend">${legend}</div>
          </div>
          <div class="org-uchart-body">
            <div class="org-uchart-yaxis">${ticks.map((t) => `<span>${this.escapeHtml(t)}</span>`).join('')}</div>
            <div class="org-uchart-plotcol">
              <div class="org-uchart-plot">${bars}</div>
              <div class="org-uchart-xaxis">${xlabels}</div>
            </div>
          </div>`;
      }
    }

    // ── Desglose por fuente ──
    if (bdEl) {
      if (empty) {
        bdEl.innerHTML = '';
      } else {
        const rows = OrganizationView.USAGE_AREAS
          .map((a) => ({ ...a, value: u.byArea[a.key] || 0 }))
          .filter((a) => a.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((a) => {
            const pct = Math.round((a.value / u.total) * 100);
            const col = this._usageColor(a.key);
            return `
              <div class="org-bd-row">
                <span class="org-bd-label"><i style="background:${col}"></i>${this.escapeHtml(a.label)}</span>
                <span class="org-bd-track"><span class="org-bd-fill" style="width:${(a.value / u.total) * 100}%;background:${col}"></span></span>
                <span class="org-bd-value">${this._fmtCredits(a.value)}</span>
                <span class="org-bd-pct">${pct}%</span>
              </div>`;
          }).join('');
        bdEl.innerHTML = `
          <h3 class="org-uchart-title">${__('Consumo por fuente · {d} días', { d: u.days })}</h3>
          <div class="org-bd-rows">${rows}</div>`;
      }
    }
  }

  _usageStat(label, value, sub, accent) {
    return `
      <div class="org-ustat">
        <span class="org-ustat-label">${this.escapeHtml(label)}</span>
        <span class="org-ustat-value"${accent ? ` style="color:${accent}"` : ''}>${this.escapeHtml(value)}</span>
        <span class="org-ustat-sub">${this.escapeHtml(sub)}</span>
      </div>`;
  }

  _renderNotifications() {
    const list = this.querySelector('#orgNotificationsList');
    if (!list) return;
    if (!this.notifications.length) {
      list.innerHTML = `<p class="org-members-empty">${__('No hay notificaciones recientes.')}</p>`;
      return;
    }
    list.innerHTML = this.notifications.map((n) => {
      const when = n.created_at ? new Date(n.created_at).toLocaleString('es') : '';
      const sev = (n.severity || 'info').toLowerCase();
      const unread = !n.read_at ? '<span class="org-notif-dot"></span>' : '';
      return `
        <div class="org-notif-row org-notif-row--${this.escapeHtml(sev)}">
          ${unread}
          <div class="org-notif-info">
            <span class="org-notif-title">${this.escapeHtml(n.title || n.type || __('Notificación'))}</span>
            ${n.body ? `<span class="org-notif-body">${this.escapeHtml(n.body)}</span>` : ''}
            <span class="org-notif-meta">${this.escapeHtml(when)} · ${this.escapeHtml(n.type || '')}</span>
          </div>
          ${n.action_url ? `<a href="${this.escapeHtml(n.action_url)}" class="btn btn-secondary btn-sm">${this.escapeHtml(n.action_label || __('Abrir'))}</a>` : ''}
        </div>`;
    }).join('');
  }

  _renderAuditLog() {
    const listEl = this.querySelector('#orgAuditList');
    if (!listEl) return;
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
    if (!rows.length) { listEl.innerHTML = `<p class="org-members-empty">${__('Sin actividad registrada.')}</p>`; return; }
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
  _showError(msg) {
    const c = this.container || document.getElementById('app-container');
    if (c) c.querySelector('.organization-content')?.insertAdjacentHTML('beforebegin',
      `<div class="org-error-banner" role="alert">${this.escapeHtml(msg)}</div>`);
  }

  // ── Eventos ────────────────────────────────────────────
  _bindEvents() {
    const tabs = this.querySelectorAll('.organization-tabs .tab-btn');
    const panels = this.querySelectorAll('.organization-content .tab-content');
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        tabs.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        panels.forEach((p) => { p.classList.remove('active'); });
        btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
        this.querySelector('#' + tab + 'Tab')?.classList.add('active');
        if (tab === 'billing' && !this._billingLoaded) {
          this._billingLoaded = true;
          this._loadBilling();
        }
      });
    });

    this.querySelector('#orgGeneralForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._saveGeneral(); });
    this.querySelector('#orgInviteBtn')?.addEventListener('click', () => this._openInviteModal());

    this.querySelector('#orgCtrlStats')?.addEventListener('click', (e) => {
      if (e.target.closest('.org-prod-range')) return;
      const card = e.target.closest('.org-ctrl-card[data-route]');
      if (!card) return;
      const prefix = (this.orgId && typeof window.getOrgPathPrefix === 'function')
        ? window.getOrgPathPrefix(this.orgId, this.org?.name || '') : '';
      window.router?.navigate((prefix || '') + card.dataset.route);
    });
    this.querySelector('#orgCtrlStats')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.org-ctrl-card[data-route]');
      if (!card) return;
      e.preventDefault();
      const prefix = (this.orgId && typeof window.getOrgPathPrefix === 'function')
        ? window.getOrgPathPrefix(this.orgId, this.org?.name || '') : '';
      window.router?.navigate((prefix || '') + card.dataset.route);
    });
    this.querySelector('#orgCtrlStats')?.addEventListener('change', async (e) => {
      const sel = e.target.closest('.org-prod-range');
      if (!sel) return;
      this.prodRange = Number(sel.value);
      await this._loadControlStats();
      this._renderControlStats();
    });

    this.querySelector('#orgUsageRange')?.addEventListener('click', async (e) => {
      const pill = e.target.closest('.org-range-pill');
      if (!pill) return;
      const range = Number(pill.dataset.range);
      if (!range || range === this.usageRange) return;
      this.usageRange = range;
      this.querySelector('#orgUsageChart').innerHTML = `<p class="org-placeholder">${__('Cargando…')}</p>`;
      await this._loadUsage();
      this._renderUsage();
    });

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

    document.getElementById('orgInviteModalClose')?.addEventListener('click', () => this._closeInviteModal());
    document.getElementById('orgInviteCancel')?.addEventListener('click', () => this._closeInviteModal());

    this._bindMfaEvents();
    this._bindSessionsEvents();
    document.getElementById('orgInviteForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._submitInvite(); });

    this.querySelector('#auditFilterAction')?.addEventListener('change', (e) => { this.auditFilter.action = e.target.value; this._renderAuditLog(); });
    this.querySelector('#auditFilterUser')?.addEventListener('change', (e) => { this.auditFilter.user = e.target.value; this._renderAuditLog(); });
  }

  // ── Acciones ───────────────────────────────────────────
  async _saveGeneral() {
    const btn = this.querySelector('#orgGeneralSubmit');
    const payload = {
      timezone: this.querySelector('#orgTimezone')?.value || 'UTC',
      locale: this.querySelector('#orgLocale')?.value || 'es',
    };
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="aisc-ico fa-spin aisc-ico--loader"></i> ${__('Guardando…')}`; }
    try {
      const { error } = await this.supabase.from('organizations').update(payload).eq('id', this.orgId);
      if (error) throw error;
      this.org = { ...this.org, ...payload };
      this._toast(__('Configuración regional guardada'));
    } catch (e) {
      alert(e.message || __('No se pudo guardar.'));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = `<i class="aisc-ico aisc-ico--save"></i> ${__('Guardar')}`; }
    }
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
    if (!this.canManageMembers) return;
    const email = document.getElementById('inviteEmail')?.value?.trim();
    const role = (document.getElementById('inviteRole')?.value || 'member').toLowerCase();
    if (!email) return;
    const btn = document.querySelector('#orgInviteForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = __('Enviando…'); }
    try {
      const { data: existing } = await this.supabase
        .from('organization_invitations').select('id').eq('organization_id', this.orgId).eq('email', email).eq('status', 'pending').maybeSingle();
      if (existing) { alert(__('Ya existe una invitación pendiente para ese email.')); return; }
      const { data: profile } = await this.supabase.from('profiles').select('id').eq('email', email).maybeSingle();
      if (profile && this.members.some((m) => m.user_id === profile.id)) { alert(__('Ese usuario ya es miembro.')); return; }
      const { error } = await this.supabase.from('organization_invitations').insert({ organization_id: this.orgId, email, role, invited_by: this.userId });
      if (error) throw error;
      this._closeInviteModal();
      await this._loadInvitations();
      this._renderInvitations();
      this._toast(__('Invitación enviada'));
    } catch (e) {
      alert(e.message || __('No se pudo enviar la invitación.'));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = __('Enviar invitación'); }
    }
  }

  async _revokeInvitation(invitationId) {
    if (!invitationId || !confirm(__('¿Revocar esta invitación?'))) return;
    const { error } = await this.supabase.from('organization_invitations').update({ status: 'revoked' }).eq('id', invitationId);
    if (error) { alert(error.message || __('Error.')); return; }
    await this._loadInvitations(); this._renderInvitations();
    this._toast(__('Invitación revocada'));
  }

  async _changeRole(memberId, role) {
    if (!memberId || !role || !this.canManageMembers) return;
    const { error } = await this.supabase.from('organization_members').update({ role }).eq('id', memberId).eq('organization_id', this.orgId);
    if (error) { alert(error.message || __('No se pudo cambiar el rol.')); return; }
    await this._loadMembers(); this._renderMembers();
    this._toast(__('Rol actualizado'));
  }

  async _removeMember(memberId) {
    if (!memberId || !this.canManageMembers) return;
    const m = this.members.find((x) => x.id === memberId);
    if (!m || m.user_id === this.org?.owner_user_id) return;
    if (!confirm(__('¿Quitar a este miembro de la organización?'))) return;
    const { error } = await this.supabase.from('organization_members').delete().eq('id', memberId).eq('organization_id', this.orgId);
    if (error) { alert(error.message || __('Error.')); return; }
    await this._loadMembers(); this._renderMembers();
    this._toast(__('Miembro eliminado'));
  }

  _toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg, 'success');
  }
}

window.OrganizationView = OrganizationView;
