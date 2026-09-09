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

    // Uso (consumo de créditos)
    // Rango de Uso: null = ultimos 30 dias (lo resuelve _loadUsage).
    this.usageFrom = null;
    this.usageTo = null;
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
    <button type="button" class="tab-btn" data-tab="billing" role="tab" aria-selected="false">${__('Suscripción')}</button>
    <button type="button" class="tab-btn" data-tab="activity" role="tab" aria-selected="false">${__('Uso')}</button>
    <button type="button" class="tab-btn" data-tab="security" role="tab" aria-selected="false">${__('Seguridad')}</button>
  </div>

  <div class="organization-content">

    <!-- ── General ──────────────────────────────────────── -->
    <div class="tab-content active" id="generalTab" role="tabpanel">
      <!-- Dos columnas. Izquierda: lo que la organizacion HACE (entidades,
           inteligencia, pauta). Derecha: lo que la organizacion ES y lo que
           paga — plan, creditos y su mercado — sobre la imagen de fondo. -->
      <div class="org-general-cols">

        <div class="org-col-main">
          <section class="org-section">
            <div class="org-section-head">
              <div>
                <h2>${__('Centro de control')}</h2>
                <p class="org-section-desc">${__('Vista general de las entidades y la producción de tu organización. Pulsa una tarjeta para gestionarla.')}</p>
              </div>
            </div>
            <div class="org-ctrl-stats" id="orgCtrlStats"><p class="org-placeholder">${__('Cargando…')}</p></div>
          </section>

          <!-- Inteligencia y pauta. Lo llena _renderResumen() con
               OrgSummaryDataService; cada bloque se pinta solo si tiene datos,
               para no dejar tarjetas en cero fingiendo contenido. -->
          <section class="org-section" id="orgResumenSection">
            <div class="org-resumen" id="orgResumen"><p class="org-placeholder">${__('Cargando…')}</p></div>
          </section>
        </div>

        <aside class="org-col-aside">
          <!-- El fondo va en su propia capa para poder oscurecerlo sin tocar el
               texto: una imagen puesta como background del <aside> obligaria a
               bajarle la opacidad al contenido junto con ella. -->
          <div class="org-aside-bg" aria-hidden="true"></div>
          <div class="org-aside-inner">
            <div id="orgAsidePlan"></div>

            <section class="org-section org-aside-section">
              <div class="org-section-head">
                <div>
                  <h2>${__('Inteligencia')}</h2>
                  <p class="org-section-desc">${__('A quién le habla la marca, qué audiencias recibe y a quién vigila.')}</p>
                </div>
              </div>
              <div id="orgAsideMercado"></div>
              <div class="org-subbrands-list" id="orgSubbrandsList"><p class="org-placeholder">${__('Cargando…')}</p></div>
              <a href="mailto:info@ardeagency.com?subject=Solicitud%20de%20nuevo%20mercado&body=Hola%20equipo%2C%0A%0AQuiero%20a%C3%B1adir%20un%20nuevo%20mercado%20a%20mi%20organizaci%C3%B3n.%0A%0ANombre%20de%20la%20marca%3A%20%0AMercado%2Fregi%C3%B3n%3A%20%0APlataformas%20a%20conectar%3A%20%0AObjetivos%20iniciales%3A%20%0A%0AGracias." class="btn btn-secondary btn-sm org-aside-cta" id="orgRequestBrandBtn"><i class="aisc-ico aisc-ico--send"></i> ${__('Solicitar nuevo mercado')}</a>
            </section>
          </div>
        </aside>

      </div>
    </div>

    <!-- ── Miembros ─────────────────────────────────────── -->
    <div class="tab-content" id="membersTab" role="tabpanel">
      <!-- Izquierda: que esta haciendo cada quien. Derecha: quienes son.
           Una lista de miembros sola dice a quien le diste acceso; al lado de la
           bitacora dice ademas si ese acceso se esta usando. -->
      <div class="org-general-cols">

        <div class="org-col-main">
          <section class="org-section">
            <div class="org-section-head">
              <div>
                <h2>${__('Actividad del equipo')}</h2>
                <p class="org-section-desc">${__('Lo que cada miembro ha hecho en los últimos 6 meses.')}</p>
              </div>
            </div>
            <div class="org-actividad" id="orgActividad"><p class="org-placeholder">${__('Cargando…')}</p></div>
          </section>
        </div>

        <aside class="org-col-aside org-col-aside--liso">
          <div class="org-aside-inner">
            <section class="org-section org-aside-section">
              <div class="org-section-head">
                <div>
                  <h2>${__('Miembros')}</h2>
                  <p class="org-section-desc">${__('Roles y acceso al workspace.')}</p>
                </div>
              </div>
              <div class="org-members-list" id="orgMembersList"></div>
              <button type="button" class="btn btn-primary org-aside-cta" id="orgInviteBtn">
                <i class="aisc-ico aisc-ico--user-registration"></i> ${__('Invitar')}
              </button>
            </section>

            <section class="org-section org-aside-section" id="orgInvitationsSection" hidden>
              <h3>${__('Invitaciones pendientes')}</h3>
              <div class="org-invitations-list" id="orgInvitationsList"></div>
            </section>
          </div>
        </aside>

      </div>
    </div>

    <!-- ── Facturación ──────────────────────────────────── -->
    <div class="tab-content" id="billingTab" role="tabpanel">
      <!-- Izquierda: QUE tienes contratado y cuanto te queda. Derecha: el
           papeleo — que te han cobrado, que viene, y con que se paga. Son dos
           preguntas distintas y se consultan en momentos distintos. -->
      <div class="org-general-cols">

        <div class="org-col-main">
          <section class="org-sub-block">
            <h2 class="org-sub-rotulo">${__('Suscripción')}</h2>
            <div class="org-billing-summary" id="orgBillingSummary"><p class="org-placeholder">${__('Cargando…')}</p></div>
          </section>

          <!-- Funciones especiales del plan: extras con vigencia propia
               (empiezan y caducan), distintos de lo que "incluye" el plan de
               forma permanente. Todavia no estan definidas: aqui vive la
               estructura, y el cuerpo lo llena _renderFunciones() en cuanto
               exista de donde leerlas. -->
          <section class="org-sub-block">
            <h2 class="org-sub-rotulo">${__('Funciones especiales activas')}</h2>
            <div class="org-funciones" id="orgFunciones"></div>
          </section>

        </div>

        <aside class="org-col-aside org-col-aside--liso">
          <div class="org-aside-inner">
            <section class="org-sub-block">
              <h2 class="org-sub-rotulo">${__('Próximo cobro')}</h2>
              <div class="org-billing-proximo" id="orgBillingProximo"></div>
            </section>

            <section class="org-sub-block">
              <h2 class="org-sub-rotulo">${__('Método de pago')}</h2>
              <div class="org-billing-pago" id="orgBillingPago"></div>
            </section>

            <section class="org-sub-block">
              <h2 class="org-sub-rotulo">${__('Datos de facturación')}</h2>
              <div class="org-billing-datos" id="orgBillingDatos"></div>
            </section>
          </div>
        </aside>

      </div>

      <!-- Facturas al final y a todo el ancho: es una tabla, y una tabla en una
           columna de 380px se lee peor que en cualquier otro sitio. -->
      <section class="org-sub-block org-sub-block--ancho">
        <h2 class="org-sub-rotulo">${__('Facturas e historial')}</h2>
        <div class="org-billing-invoices" id="orgBillingInvoices"><p class="org-placeholder">${__('Cargando…')}</p></div>
      </section>
    </div>

    <div class="tab-content" id="activityTab" role="tabpanel">
      <!-- Izquierda: la lectura del consumo. Derecha: el saldo y los topes.
           Una es historia, la otra es estado. -->
      <div class="org-general-cols">

        <div class="org-col-main">
          <section class="org-section">
            <div class="org-section-head">
              <div>
                <h2>${__('Uso')}</h2>
                <p class="org-section-desc">${__('Consumo de créditos por día y por función de la plataforma.')}</p>
              </div>
              <div class="org-usage-range" id="orgUsageRange"></div>
            </div>
            <div class="org-usage-stats" id="orgUsageStats"></div>
            <div class="org-usage-chart-card" id="orgUsageChart"><p class="org-placeholder">${__('Cargando…')}</p></div>
            <div class="org-usage-breakdown-card" id="orgUsageBreakdown"></div>

            <!-- Consumo por miembro: rescatado de la vista de creditos vieja
                 (vivia en CreditsShopView antes del commit 07d290c6) y traido
                 aqui, que es donde vive el consumo. -->
            <div class="org-usage-miembros" id="orgUsageMiembros"></div>

            <!-- Historial de movimientos, en lista, como estaba en la vista de
                 creditos antes del rediseño. -->
            <div class="org-usage-historial" id="orgUsageHistorial"></div>
          </section>
        </div>

        <aside class="org-col-aside org-col-aside--liso">
          <div class="org-aside-inner">
            <section class="org-sub-block">
              <h2 class="org-sub-rotulo">${__('Créditos')}</h2>
              <div class="org-billing-credits" id="orgBillingCredits"></div>
            </section>

            <section class="org-sub-block" id="orgBillingLimitsBlock">
              <div class="org-billing-limits" id="orgBillingLimits"></div>
            </section>
          </div>
        </aside>

      </div>
    </div>

    <!-- Aqui vivian las pestañas "Notificaciones" y "Ajustes", retiradas el
         2026-09-09. La de notificaciones listaba org_notifications y tenia un
         bloque de preferencias que nunca se construyo ("proximamente"). La de
         Ajustes guardaba Datos regionales (zona horaria e idioma), que SI
         escribe en organizations: ese formulario se fue con ella y hoy no hay
         donde editar esos dos campos. Ver el mensaje de commit. -->
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
    this._renderResumen();
    this._renderActividad();
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
    // Producciones cuenta HISTORICO, como el resto de la fila. Antes miraba
    // solo los ultimos 7 dias con un selector al lado; retirado el selector, esa
    // ventana quedaba invisible y un "0 Producciones" se leia como "nunca se
    // produjo nada" cuando queria decir "nada esta semana".
    const cnt = (q) => q.then((r) => r.count || 0).catch(() => 0);
    try {
      const [ents, products, services, productions] = await Promise.all([
        sb.from('brand_entities').select('id').eq('organization_id', org),
        cnt(sb.from('products').select('*', { count: 'exact', head: true }).eq('organization_id', org)),
        cnt(sb.from('services').select('*', { count: 'exact', head: true }).eq('organization_id', org)),
        cnt(sb.from('flow_runs').select('*', { count: 'exact', head: true }).eq('organization_id', org)),
      ]);
      const entIds = (ents.data || []).map((e) => e.id);
      let places = 0, characters = 0;
      if (entIds.length) {
        [places, characters] = await Promise.all([
          cnt(sb.from('brand_places').select('*', { count: 'exact', head: true }).in('entity_id', entIds)),
          cnt(sb.from('brand_characters').select('*', { count: 'exact', head: true }).in('entity_id', entIds)),
        ]);
      }
      this.controlStats = { identities: entIds.length, products, services, places, characters, productions };
    } catch (e) {
      console.warn('OrganizationView _loadControlStats:', e?.message || e);
      this.controlStats = { identities: 0, products: 0, services: 0, places: 0, characters: 0, productions: 0 };
    }
  }

  _renderControlStats() {
    const el = this.querySelector('#orgCtrlStats');
    if (!el) return;
    const s = this.controlStats || { identities: 0, products: 0, services: 0, places: 0, characters: 0, productions: 0 };
    const fmt = (n) => Number(n || 0).toLocaleString('es');
    // Cifra, etiqueta y enlace. Nada mas.
    // Se fueron el emoji en su chip de color y el color por tarjeta: siete
    // acentos distintos convertian una fila de datos en un semaforo, y el
    // emoji ocupaba el sitio de la unica cosa que importa aqui, que es el
    // numero. El color de la marca queda para el enlace, en hover.
    const card = (route, value, label) => (route ? `
      <div class="org-ctrl-card" role="button" tabindex="0" data-route="${route}">
        <span class="org-ctrl-num">${fmt(value)}</span>
        <span class="org-ctrl-label">${label}</span>
        <span class="org-ctrl-link">${__('Ver todas')} →</span>
      </div>` : `
      <div class="org-ctrl-card org-ctrl-card--mudo">
        <span class="org-ctrl-num">${fmt(value)}</span>
        <span class="org-ctrl-label">${label}</span>
      </div>`);
    // Las tres cifras de inteligencia entran en la MISMA fila que el resto: son
    // el mismo tipo de dato (cuanto hay de algo, y donde verlo). Las llena
    // _renderResumen(), que corre despues, y vuelve a pedir este render.
    const i = this._intel || null;
    el.innerHTML =
      card('/identities', s.identities, __('Elementos')) +
      card('/products',   s.products,   __('Productos')) +
      card('/services',   s.services,   __('Servicios')) +
      card('/places',     s.places,     __('Escenarios')) +
      card('/characters', s.characters, __('Actores')) +
      card('/production', s.productions, __('Producciones')) +
      // Audiencias y Estrategias NO llevan enlace: hoy no existe pagina propia
      // para ninguna de las dos (audience_personas y strategic_recommendations
      // solo se editan dentro del Command Center, que exige sub-marca en la
      // ruta). Antes que mandar a una pagina que no es, se muestra la cifra sin
      // destino.
      (i ? card(null, i.audiencias, __('Audiencias')) : '') +
      (i ? card(null, i.estrategias, __('Estrategias')) : '') +
      (i ? card('/monitoring', i.vigilados, __('Perfiles monitoreados')) : '');
  }

  // ── Uso: consumo de créditos por día y por área (fuente) ──
  // credit_usage.credits_delta < 0 = consumo. El área (studio/video/vera/
  // production/background/system) viene de feature_costs vía CreditCosts.get(kind).
  async _loadUsage() {
    // El rango lo manda el selector de fechas de la plataforma. Por defecto, los
    // ultimos 30 dias; el picker puede fijar cualquier otro.
    const hasta = this.usageTo ? new Date(this.usageTo) : new Date();
    const desde = this.usageFrom ? new Date(this.usageFrom)
      : new Date(hasta.getTime() - 29 * 24 * 60 * 60 * 1000);
    const dias = Math.max(1, Math.round((hasta - desde) / (24 * 60 * 60 * 1000)) + 1);

    try { await (window.CreditCosts?.getMap?.()); } catch (_) {}
    const { data } = await this.supabase
      // `metadata` entra al select porque de ahi sale la plataforma del scraping:
      // sin ella, Instagram y Facebook caen en el mismo saco.
      .from('credit_usage').select('kind, credits_delta, created_at, metadata, source_id')
      .eq('organization_id', this.orgId)
      // SIN filtro de signo: el historial de abajo muestra TODOS los
      // movimientos, y esconder los positivos taparia justo la anomalia que
      // hay que ver (ver el filtro de la grafica, mas abajo).
      .gte('created_at', desde.toISOString())
      .lte('created_at', new Date(hasta.getTime() + 86399000).toISOString())
      .order('created_at', { ascending: true });

    const rows = data || [];
    const byDayMap = {};
    const porMiembro = {};
    const byArea = {};
    OrganizationView.USAGE_AREAS.forEach((a) => { byArea[a.key] = 0; });
    let total = 0;
    // La grafica solo agrega los movimientos NEGATIVOS, que son el consumo tal
    // como quedo escrito. Los positivos se cuentan aparte y se avisan: en esta
    // base hay 486 filas con signo positivo y 484 de ellas son consumo anotado
    // al reves (vera_chat y claude_tokens entran como abono). Reinterpretarlas
    // aqui seria adivinar; el arreglo va donde se escriben, no en la vista.
    let positivos = 0;
    rows.forEach((r) => {
      const day = (r.created_at || '').slice(0, 10);
      if (!day) return;
      if (Number(r.credits_delta) >= 0) { positivos += 1; return; }
      const cat = OrganizationView._categoriaDe(r.kind, r.metadata?.platform);
      const c = Math.abs(Number(r.credits_delta) || 0);
      // Se guardan CREDITOS y OPERACIONES: el tooltip necesita las dos cosas
      // —cuanto costo y cuantas veces se hizo—, y con solo el gasto no se
      // distingue una operacion cara de veinte baratas.
      if (!byDayMap[day]) byDayMap[day] = { day, total: 0, ops: 0, byArea: {}, opsArea: {} };
      byDayMap[day].byArea[cat] = (byDayMap[day].byArea[cat] || 0) + c;
      byDayMap[day].opsArea[cat] = (byDayMap[day].opsArea[cat] || 0) + 1;
      byDayMap[day].total += c;
      byDayMap[day].ops += 1;
      byArea[cat] = (byArea[cat] || 0) + c;
      total += c;

      // Por miembro, en la misma pasada. `credit_usage` NO tiene columna
      // user_id: la autoria, cuando existe, viaja en metadata.user_id. Lo que
      // no la trae es consumo AUTOMATICO (sensores, scrapers, flujos
      // programados), no un dato perdido — y por eso se agrupa aparte con
      // nombre propio en vez de esconderlo bajo un id.
      const uid = r.metadata?.user_id || '__auto__';
      if (!porMiembro[uid]) porMiembro[uid] = { uid, creditos: 0, eventos: 0, ultima: null, porCat: {} };
      const m = porMiembro[uid];
      m.creditos += c;
      m.eventos += 1;
      m.porCat[cat] = (m.porCat[cat] || 0) + c;
      if (!m.ultima || r.created_at > m.ultima) m.ultima = r.created_at;
    });
    // Se rellenan los dias SIN consumo con cero. Antes se omitian, y el eje X
    // saltaba de "17 ago" a "19 ago" sin explicar el hueco: una barra ausente y
    // un dia sin gasto se veian igual, que es justo lo que no debe pasar.
    const byDay = [];
    for (let t = new Date(desde); t <= hasta; t.setDate(t.getDate() + 1)) {
      const dia = t.toISOString().slice(0, 10);
      byDay.push(byDayMap[dia] || { day: dia, total: 0, ops: 0, byArea: {}, opsArea: {} });
    }
    const peak = byDay.reduce((m, d) => (d.total > (m ? m.total : 0) ? d : m), null);
    const topAreaKey = Object.entries(byArea).sort((a, b) => b[1] - a[1])[0];
    this.usage = {
      days: dias, byDay, byArea, total, peak,
      topAreaKey: total > 0 && topAreaKey ? topAreaKey[0] : null,
      events: rows.filter((r) => Number(r.credits_delta) < 0).length,
      positivos,
      // El historial va de mas reciente a mas antiguo y con TODOS los signos.
      movimientos: [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      porMiembro: Object.values(porMiembro).sort((a, b) => b.creditos - a.creditos),
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
      const [{ data: subRows }, { data: stripeInvs }, { data: wompiTxs }, caps, usageToday] = await Promise.all([
        this.supabase.from('subscriptions')
          .select('id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end,canceled_at,provider,next_charge_at,stripe_subscription_id,wompi_last_transaction_id,wompi_payment_source_id')
          .eq('organization_id', this.orgId).order('updated_at', { ascending: false }).limit(1),
        this.supabase.from('stripe_invoices')
          .select('invoice_id,amount_paid_cents,currency,status,hosted_invoice_url,invoice_pdf,paid_at,created_at,period_start,period_end')
          .eq('organization_id', this.orgId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('wompi_transactions')
          .select('transaction_id,reference,target,amount_in_cents,currency,status,payment_method_type,finalized_at,created_at')
          .eq('organization_id', this.orgId).eq('status', 'APPROVED').order('created_at', { ascending: false }).limit(50),
        this.supabase.from('org_claude_caps').select('*').eq('organization_id', this.orgId).maybeSingle().then((r) => r.data).catch(() => null),
        this.supabase.from('v_org_claude_usage_today').select('*').eq('organization_id', this.orgId).maybeSingle().then((r) => r.data).catch(() => null),
      ]);
      this.billingSub      = (subRows && subRows[0]) || null;
      this.billingInvoices = stripeInvs || [];
      this.billingWompiTxs = wompiTxs   || [];
      // El plan se resuelve DESPUES y no dentro del Promise.all: _billingPlan()
      // necesita this.billingSub, que solo existe cuando el Promise.all termina.
      // Pedirlo en paralelo hacia que leyera billingSub=null y devolviera null
      // SIEMPRE — por eso "Tu plan incluye" salia vacio y el nombre del plan
      // caia al id en minuscula ('team') en vez del name ('Team').
      this.billingPlanRow  = await this._billingPlan();
      this.billingCaps     = caps       || null;
      this.billingUsageToday = usageToday || null;
      try {
        const svc = await new window.OrgSummaryDataService().init(this.supabase, this.orgId);
        this.billingCreditos = await svc._creditos();
        this.billingFunciones = await svc.funciones();
      } catch (_) { this.billingCreditos = null; }
    } catch (e) {
      console.warn('[organization] _loadBilling error:', e?.message || e);
    }
    this._renderBilling();
    this._renderPlanIncluye();
    this._renderBillingCredits();
    this._renderBillingPago();
    this._renderBillingProximo();
    this._renderBillingDatos();
    this._renderFunciones();
  }

  async _billingPlan() {
    if (!this.billingSub?.plan_id) return null;
    const { data } = await this.supabase
      .from('plans')
      .select('id,name,display_order,price_usd_month,price_usd_year,credits_monthly,max_handles,storage_mb,features')
      .eq('id', this.billingSub.plan_id).maybeSingle();
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
    const reactivateBtn = hasActiveSub && sub.cancel_at_period_end
      ? `<button type="button" class="btn btn-secondary" id="orgBillingReactivateBtn"><i class="aisc-ico aisc-ico--refresh"></i> ${__('Reactivar suscripción')}</button>`
      : '';

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
    // El "ultimo pago" ya no se calcula aparte: era para la tarjetita retirada, y
    // el pago mas reciente es la primera fila de la lista de facturas.

    const statusTone = (past_due || canceled) ? 'warn' : sub ? 'ok' : 'muted';

    // Tarjeta unica: nombre del plan, cuando se renueva, y debajo lo que
    // incluye (lo escribe _renderPlanIncluye en el hueco #orgPlanIncluye, que se
    // crea aqui y por eso debe correr DESPUES de este innerHTML).
    // Las tres tarjetitas de "Plan actual / Proximo pago / Ultimo pago" se
    // retiraron: proximo y ultimo pago viven ahora en la columna derecha, y
    // repetirlos aqui era decir lo mismo dos veces en la misma pantalla.
    summary.innerHTML = `
      ${banner}
      <div class="org-plan-card">
        <div class="org-plan-card-head">
          <h3 class="org-plan-card-name">${this._esc(planName)}</h3>
          <span class="org-plan-card-estado org-plan-card-estado--${this._esc(statusTone || 'muted')}">${this._esc(statusLabel)}</span>
        </div>
        <p class="org-plan-card-renueva">${nextRenewStr && nextRenewStr !== '—'
          ? __('Tu plan se renueva el {fecha}', { fecha: this._esc(nextRenewStr) })
          : __('Sin fecha de renovación programada')}</p>
        <div class="org-plan-card-sep"></div>
        <div class="org-plan-incluye" id="orgPlanIncluye"></div>
      </div>
      <div class="org-bill-actions">${stripePortalBtn}${reactivateBtn}</div>
    `;

    if (limits) this._renderBillingLimits(limits);

    // FACTURA PENDIENTE. No hay tabla de facturas por emitir: la proxima se
    // deduce de la suscripcion. Solo se dibuja si existen las TRES cosas —plan,
    // precio y fecha—; con una que falte seria un cobro inventado.
    const planPrecio = this.billingPlanRow?.price_usd_month;
    const pendiente = (nextRenew && planPrecio != null && !canceled)
      ? `<div class="org-bill-table org-bill-table--pend">
          <div class="org-bill-prow org-bill-prow--head">
            <span>${__('Descripción')}</span><span>${__('Vence el')}</span>
            <span>${__('Estado')}</span><span class="org-bill-right">${__('Total')}</span>
          </div>
          <div class="org-bill-prow">
            <span class="org-bill-desc">${this._esc(__('1 × {plan} — mensual', { plan: planName }))}</span>
            <span class="org-bill-date">${this._esc(nextRenewStr)}</span>
            <span><span class="org-bill-pill org-bill-pill--muted">${__('Próxima')}</span></span>
            <span class="org-bill-right org-bill-amount">${this._esc(this._fmtMoney(planPrecio, 'USD'))}</span>
          </div>
        </div>`
      : `<p class="org-placeholder">${__('No hay cobros programados.')}</p>`;

    const paidPill = (st) => {
      const ok = ['paid', 'APPROVED', 'succeeded'].includes(st);
      return `<span class="org-bill-pill org-bill-pill--${ok ? 'ok' : 'muted'}">${this.escapeHtml(ok ? __('Pagado') : (st || '—'))}</span>`;
    };

    // El historial va PLEGADO: sin pagos, un desplegable cerrado ocupa una
    // linea, mientras que una tabla vacia ocupa media pantalla para decir lo
    // mismo.
    const historial = all.length === 0
      ? `<p class="org-placeholder">${__('Sin pagos todavía. Los verás aquí después del primer cobro.')}</p>`
      : `<div class="org-bill-table">
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

    list.innerHTML = `
      ${pendiente}
      <details class="org-bill-historial">
        <summary>${__('Historial de pagos')}${all.length ? ` <span class="org-bill-cuenta">${all.length}</span>` : ''}</summary>
        <div class="org-bill-historial-cuerpo">${historial}</div>
      </details>`;

    this.querySelector('#orgBillingPortalBtn')?.addEventListener('click', () => { window.billingService?.openCustomerPortal(); });
    this.querySelector('#orgBillingCancelBtn')?.addEventListener('click', () => this._cancelSubscription(false));
    this.querySelector('#orgBillingReactivateBtn')?.addEventListener('click', () => this._cancelSubscription(true));
    this.querySelector('#orgCapsForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._saveCaps(); });
  }

  // ─── Suscripcion: plan, creditos, cobro y medio de pago ──────────────

  _esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  _creditosHref() {
    const prefix = (this.orgId && typeof window.getOrgPathPrefix === 'function')
      ? window.getOrgPathPrefix(this.orgId, this.org?.name || '') : '';
    return `${prefix || ''}/creditos`;
  }

  /**
   * "Tu plan incluye" se arma con lo que la fila de `plans` declara de verdad
   * —credits_monthly, max_handles, storage_mb y el jsonb `features`— y no con
   * una lista escrita a mano: si manana cambia el plan en la base, la lista
   * cambia sola. Una lista fija seria una promesa que la base no respalda.
   */
  _renderPlanIncluye() {
    const el = this.querySelector('#orgPlanIncluye');
    if (!el) return;
    const p = this.billingPlanRow;
    if (!p) { el.innerHTML = ''; return; }

    const items = [];
    if (p.credits_monthly > 0) items.push(__('{n} créditos al mes', { n: Number(p.credits_monthly).toLocaleString('es') }));
    if (p.max_handles > 0) items.push(__('Hasta {n} marcas / perfiles', { n: p.max_handles }));
    if (p.storage_mb > 0) {
      const gb = p.storage_mb >= 1024 ? `${Math.round(p.storage_mb / 1024)} GB` : `${p.storage_mb} MB`;
      items.push(__('{s} de almacenamiento', { s: gb }));
    }

    // El jsonb de features es abierto: se traduce lo conocido y lo desconocido
    // se muestra por su clave, para que un plan que gane una feature nueva se
    // vea aunque nadie haya pasado por aqui a bautizarla.
    const nombres = {
      vera_full: __('Vera completa (chat + acciones)'),
      vera_basic: __('Vera chat'),
      insights: __('Insights y analítica'),
      sub_brands: __('Sub-marcas (multi-cliente)'),
      custom_domain: __('Dominio personalizado'),
      priority_support: __('Soporte prioritario'),
    };
    const f = p.features || {};
    Object.keys(f).forEach((k) => {
      const v = f[k];
      if (v === false || v === null || v === 0) return;
      if (k === 'brand_kits') { items.push(__('{n} brand kits', { n: v })); return; }
      if (k === 'team_seats') { items.push(__('{n} miembros', { n: v })); return; }
      items.push(nombres[k] || k.replace(/_/g, ' '));
    });

    el.innerHTML = items.length
      ? `<ul class="org-incluye-list">${items.map((t) => `<li>${this._esc(t)}</li>`).join('')}</ul>`
      : '';
  }

  _renderBillingCredits() {
    const el = this.querySelector('#orgBillingCredits');
    if (!el) return;
    const c = this.billingCreditos;
    if (!c || !c.total) { el.innerHTML = `<p class="org-placeholder">${__('Sin créditos asignados.')}</p>`; return; }
    const pct = c.pctUsado || 0;
    el.innerHTML = `
      <div class="org-cred-head">
        <div>
          <span class="org-res-lbl">${__('Créditos mensuales restantes')}</span>
          <div class="org-cred-num">${Math.round(c.disponibles).toLocaleString('es')}<span class="org-res-num-of"> / ${Math.round(c.total).toLocaleString('es')}</span></div>
        </div>
        <a href="${this._esc(this._creditosHref())}" class="btn btn-secondary btn-sm">${__('Comprar créditos')}</a>
      </div>
      <div class="org-res-bar" role="img" aria-label="${pct}%">
        <span class="org-res-bar-fill" style="transform:scaleX(${pct / 100})"></span>
      </div>
      <span class="org-res-sub">${__('{n}% consumido este ciclo', { n: pct })}</span>`;
  }

  /**
   * Proximo cobro. Wompi cobra por `next_charge_at` y Stripe por
   * `current_period_end`: leer siempre el mismo campo da la fecha equivocada
   * para la mitad de las orgs, asi que se elige segun el proveedor.
   */
  /**
   * Proximo cobro: cuando, cuanto y con que. Wompi cobra por `next_charge_at` y
   * Stripe por `current_period_end`; leer siempre el mismo campo da la fecha
   * equivocada para la mitad de las orgs, asi que se elige segun proveedor.
   */
  _renderBillingProximo() {
    const el = this.querySelector('#orgBillingProximo');
    if (!el) return;
    const sub = this.billingSub;
    if (!sub) { el.innerHTML = `<p class="org-placeholder">${__('Sin suscripción registrada.')}</p>`; return; }

    const fecha = sub.provider === 'wompi' ? sub.next_charge_at : sub.current_period_end;
    const plan = this.billingPlanRow;
    const cancelada = sub.cancel_at_period_end || sub.status === 'canceled';

    if (!fecha || cancelada) {
      el.innerHTML = `<p class="org-pago-linea">${cancelada ? __('La suscripción no se renueva.') : __('Sin cobros programados.')}</p>`;
      return;
    }

    // El medio de pago se nombra por lo que HAY registrado, no por el proveedor
    // declarado en la fila: una suscripcion puede decir "wompi" sin tener aun
    // una fuente de pago guardada, y anunciarlo seria prometer un cobro que no
    // va a ocurrir.
    const medio = sub.wompi_payment_source_id ? __('Wompi (COP)')
      : sub.stripe_subscription_id ? __('Stripe (USD)')
      : null;

    el.innerHTML = `
      <div class="org-prox-fecha">${this._esc(this._fmtDate(fecha))}</div>
      <dl class="org-prox-dl">
        <div><dt>${__('Total')}</dt><dd>${plan?.price_usd_month != null
          ? this._esc(this._fmtMoney(plan.price_usd_month, 'USD'))
          : `<span class="org-res-sinmedir">${__('sin precio en el plan')}</span>`}</dd></div>
        <div><dt>${__('Se cobra con')}</dt><dd>${medio
          ? this._esc(medio)
          : `<span class="org-res-sinmedir">${__('sin método registrado')}</span>`}</dd></div>
      </dl>`;
  }

  /**
   * Medio de pago con forma de tabla. La fila "Añadir" NO abre un formulario de
   * tarjeta: no hay pasarela conectada —medido: wompi_payment_source_id y
   * stripe_subscription_id vacios en toda la base— y capturar datos de tarjeta
   * no es algo que esta vista deba hacer. Se dibuja el hueco con su forma y un
   * camino real: escribir a quien hoy cobra de verdad.
   */
  _renderBillingPago() {
    const el = this.querySelector('#orgBillingPago');
    if (!el) return;
    const sub = this.billingSub;
    const tieneMedio = !!(sub?.wompi_payment_source_id || sub?.stripe_subscription_id);

    const filaMedio = tieneMedio
      ? `<div class="org-pay-row">
           <span class="org-pay-check org-pay-check--on" role="img" aria-label="${__('Predeterminado')}"></span>
           <span class="org-pay-tarjeta"><i class="aisc-ico aisc-ico--credit-card" aria-hidden="true"></i> ${this._esc(sub.stripe_subscription_id ? __('Stripe (USD)') : __('Wompi (COP)'))}</span>
           <span class="org-pay-exp">—</span>
         </div>`
      : `<div class="org-pay-row org-pay-row--vacia">
           <span class="org-pay-check" aria-hidden="true"></span>
           <span class="org-pay-tarjeta">${__('No hay un método de pago registrado.')}</span>
           <span class="org-pay-exp">—</span>
         </div>`;

    el.innerHTML = `
      <div class="org-pay-table">
        <div class="org-pay-row org-pay-row--head">
          <span></span><span>${__('Información de la tarjeta')}</span><span>${__('Fecha de expiración')}</span>
        </div>
        ${filaMedio}
        <a class="org-pay-anadir" href="mailto:info@ardeagency.com?subject=Suscripci%C3%B3n%20-%20m%C3%A9todo%20de%20pago">
          <span class="org-pay-mas" aria-hidden="true">+</span> ${__('Añadir nuevo método de pago')}
        </a>
      </div>
      ${tieneMedio ? '' : `<p class="org-res-sub org-pay-nota">${__('El cobro de esta organización lo gestiona el equipo de plataforma.')}</p>`}`;
  }

  /**
   * Datos de facturacion. La plataforma NO tiene donde guardarlos: no existe
   * tabla ni columnas de razon social, NIT o direccion (lo unico parecido es la
   * vista v_org_billing, que solo refleja plan y creditos). Se muestra lo que si
   * consta y se dice quien lleva el resto, en vez de pintar un formulario cuyo
   * "Guardar" no tendria donde escribir.
   */
  /**
   * Funciones especiales del plan: extras con VIGENCIA PROPIA —empiezan y
   * caducan— a diferencia de lo que el plan incluye de forma permanente, que ya
   * se lista arriba.
   *
   * TODAVIA NO EXISTEN. No hay tabla ni columna donde declararlas: `plans` solo
   * tiene el jsonb `features`, que son banderas sin fecha. Asi que aqui va la
   * ESTRUCTURA con su cabecera y un estado vacio explicito, y no filas de
   * ejemplo: una tabla con nombres inventados se lee como si el cliente tuviera
   * cosas contratadas que nadie le vendio.
   *
   * Para llenarla mas adelante basta darle a `filas` objetos
   * { nombre, detalle, empieza, expira, estado } — el render ya los pinta.
   */
  /**
   * Funciones de la plataforma dentro del plan, partidas en dos: las que la
   * organizacion YA USA y las que tiene disponibles sin estrenar. Salen de
   * `feature_costs` —el catalogo propio, con su costo en creditos— cruzado con
   * `credit_usage` por la clave `kind`, que es la misma en las dos tablas.
   *
   * No es una lista escrita a mano: si se agrega una funcion a feature_costs,
   * aparece aqui sola.
   */
  _renderFunciones() {
    const el = this.querySelector('#orgFunciones');
    if (!el) return;
    const f = this.billingFunciones;
    if (!f || (!f.enUso.length && !f.disponibles.length)) {
      el.innerHTML = `<p class="org-placeholder">${__('No hay funciones declaradas para este plan.')}</p>`;
      return;
    }

    const fila = (x, usada) => `
      <div class="org-fx-row">
        <span class="org-fx-nombre">${this._esc(x.label || x.kind)}${x.description ? `<em>${this._esc(x.description)}</em>` : ''}</span>
        <span class="org-fx-area">${this._esc(x.area || '—')}</span>
        <span class="org-fx-costo">${x.credits_per_action != null
          ? __('{n} cr', { n: x.credits_per_action })
          : '—'}</span>
        <span>${usada
          ? `<span class="org-bill-pill org-bill-pill--ok">${__('{n} usos', { n: Number(x.veces).toLocaleString('es') })}</span>`
          : `<span class="org-bill-pill org-bill-pill--muted">${__('Sin estrenar')}</span>`}</span>
      </div>`;

    const grupo = (titulo, items, usada) => items.length ? `
      <h3 class="org-fx-grupo">${this._esc(titulo)} <span class="org-bill-cuenta">${items.length}</span></h3>
      <div class="org-fx-table">
        <div class="org-fx-row org-fx-row--head">
          <span>${__('Función')}</span><span>${__('Área')}</span>
          <span>${__('Costo')}</span><span>${__('Estado')}</span>
        </div>
        ${items.map((x) => fila(x, usada)).join('')}
      </div>` : '';

    el.innerHTML = grupo(__('En uso'), f.enUso, true) + grupo(__('Disponibles en tu plan'), f.disponibles, false);
  }

  _renderBillingDatos() {
    const el = this.querySelector('#orgBillingDatos');
    if (!el) return;
    el.innerHTML = `
      <p class="org-datos-nombre">${this._esc(this.org?.name || '—')}</p>
      <p class="org-res-sub">${__('Razón social, NIT y dirección no se guardan todavía en la plataforma; los lleva el equipo para emitir tus facturas.')}</p>
      <a class="btn btn-secondary btn-sm org-pago-cta" href="mailto:info@ardeagency.com?subject=Datos%20de%20facturaci%C3%B3n">${__('Actualizar datos')}</a>`;
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
    // Solo se rotula lo EXCEPCIONAL. Una org archivada hay que avisarla; que
    // este activa es el caso normal y no merece una pastilla verde gritando lo
    // obvio en la cabecera de su propia pagina.
    el.innerHTML = archived
      ? `<span class="org-status-pill org-status-pill--archived"><i class="aisc-ico aisc-ico--archive"></i> ${__('Archivada')}</span>`
      : '';
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
  /**
   * El consumo se lee por FUNCION, no por "area" tecnica. Antes eran seis cajones
   * (studio/video/vera/production/background/system) que no le dicen nada a quien
   * paga: "background" eran todos los scrapers juntos. Ahora cada scraper tiene
   * su propia linea porque `credit_usage.metadata.platform` guarda la red
   * —medido: instagram 814 usos, facebook 68, tiktok 67, youtube 69, x 64—.
   *
   * Los colores salen del ESPECTRO DE PLATAFORMA (--pf-1..7 de bundle.css),
   * caminando de naranja a azul noche. No se usa el degradado de la marca del
   * cliente: este grafico habla de la plataforma y su consumo, no de la marca.
   *
   * Las categorias sin uso hoy (imagenes, videos, simulador) se declaran igual:
   * el dia que se estrenen aparecen solas, con su color ya asignado.
   */
  static USAGE_AREAS = [
    { key: 'imagenes',  label: 'Imágenes',    color: '#ff0000' },
    { key: 'videos',    label: 'Videos',      color: '#ff6500' },
    { key: 'flujos',    label: 'Flujos',      color: '#ffb300' },
    { key: 'vera',      label: 'Vera',        color: '#ffe500' },
    { key: 'ig',        label: 'Instagram',   color: '#9acc00' },
    { key: 'fb',        label: 'Facebook',    color: '#00d614' },
    { key: 'tiktok',    label: 'TikTok',      color: '#00e7ff' },
    { key: 'youtube',   label: 'YouTube',     color: '#00a2ff' },
    { key: 'x',         label: 'X',           color: '#0018ee' },
    { key: 'busqueda',  label: 'Búsqueda',    color: '#5b00ea' },
    { key: 'analisis',  label: 'Análisis IA', color: '#900090' },
    { key: 'simulador', label: 'Simulador',   color: '#c2185b' },
    // Ajustes queda NEUTRO a proposito: no es una funcion de la plataforma sino
    // un movimiento manual de saldo, y darle color del arcoiris lo disfrazaria
    // de consumo real.
    { key: 'ajustes',   label: 'Ajustes',     color: '#64748b' },
  ];

  /** kind (+ plataforma del metadata) -> categoria de la grafica. */
  static _categoriaDe(kind, plataforma) {
    const k = String(kind || '');
    if (k === 'apify_scrape') {
      const p = String(plataforma || '').toLowerCase();
      if (p === 'instagram') return 'ig';
      if (p === 'facebook')  return 'fb';
      if (p === 'tiktok')    return 'tiktok';
      if (p === 'youtube')   return 'youtube';
      if (p === 'x' || p === 'twitter') return 'x';
      return 'busqueda';
    }
    if (k.startsWith('studio_image')) return 'imagenes';
    if (k.startsWith('video_')) return 'videos';
    if (k === 'flow_execution' || k === 'production_flow') return 'flujos';
    if (k.startsWith('vera_') || k === 'cmo_brief') return 'vera';
    if (k.startsWith('predictor')) return 'simulador';
    if (k.startsWith('claude_') || k === 'pattern_llm_classify') return 'analisis';
    if (k === 'meta_ads_library_query' || k === 'visibility_probe') return 'busqueda';
    return 'ajustes';
  }

  _usageColor(area) {
    return (OrganizationView.USAGE_AREAS.find((a) => a.key === area) || {}).color || '#64748b';
  }
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

  /**
   * Selector de rango de Uso: el DateRangePicker de la plataforma, el mismo que
   * usan Trafico y Mi Marca, en vez de tres pills de 7/30/90 dias. Se crea UNA
   * vez y se conserva entre repintados, porque guarda el rango elegido.
   */
  /**
   * Consumo por miembro. Rescatado de la vista de creditos vieja y corregido en
   * dos cosas:
   *
   * 1. Los miembros se nombran con su nombre real (membersWithProfile), no con
   *    los primeros 8 caracteres de su uuid como antes.
   * 2. El consumo sin usuario ya no se rotula "Sistema (background)" —que suena
   *    a cajon de descarte— sino "Automático": es la plataforma trabajando sola,
   *    y en esta organizacion es LA MAYORIA. Medido: 2.621 de 2.636 registros no
   *    llevan usuario. Decirlo asi convierte un hueco de datos en el dato.
   */
  /**
   * Tooltip de la grafica. Reemplaza al atributo `title` del navegador, que
   * tardaba un segundo en salir, no se podia estilar y solo mostraba el total:
   * lo util es ver QUE lo gasto ese dia, no cuanto en bruto.
   *
   * Un solo listener en el contenedor —no uno por columna— y el contenido se
   * arma del data-attr que ya trae cada columna.
   */
  _bindUsageTooltip() {
    const plot = this.querySelector('.org-uchart-plot');
    const tip = this.querySelector('#orgUchartTip');
    if (!plot || !tip || plot.dataset.tipBound === '1') return;
    plot.dataset.tipBound = '1';

    const ocultar = () => { tip.hidden = true; };

    this.addEventListener(plot, 'mousemove', (e) => {
      const col = e.target.closest('.org-uchart-col');
      if (!col) { ocultar(); return; }

      const total = col.dataset.total || '0';
      const ops = Number(col.dataset.ops || 0);
      const filas = (col.dataset.detalle || '').split('~').filter(Boolean).map((t) => {
        const [, label, color, valor, veces] = t.split('|');
        return `<div class="org-uchart-tip-row">
          <i style="background:${this._esc(color)}"></i>
          <span>${this._esc(label)}</span>
          <em>${this._esc(veces)}</em>
          <b>${this._esc(valor)}</b>
        </div>`;
      }).join('');

      tip.innerHTML = `
        <div class="org-uchart-tip-head">
          <span>${this._esc(this._fmtDay(col.dataset.dia))}</span>
          <b>${this._esc(total)} ${__('cr')}</b>
        </div>
        ${ops ? `<div class="org-uchart-tip-ops">${__('{n} operaciones', { n: ops.toLocaleString('es') })}</div>` : ''}
        ${filas || `<div class="org-uchart-tip-vacio">${__('Sin consumo')}</div>`}`;
      tip.hidden = false;

      // El tooltip se ancla al plot y se voltea cerca del borde derecho, para
      // que en los ultimos dias no se salga del recuadro.
      const caja = plot.getBoundingClientRect();
      const x = e.clientX - caja.left;
      const y = e.clientY - caja.top;
      const ancho = tip.offsetWidth || 180;
      tip.style.left = `${x + ancho + 24 > caja.width ? x - ancho - 12 : x + 12}px`;
      tip.style.top = `${Math.max(0, y - 12)}px`;
    });

    this.addEventListener(plot, 'mouseleave', ocultar);
  }

  _renderUsageMiembros() {
    const el = this.querySelector('#orgUsageMiembros');
    if (!el) return;
    const filas = this.usage?.porMiembro || [];
    if (!filas.length) { el.innerHTML = ''; return; }

    const nombres = {};
    (this.membersWithProfile || []).forEach((m) => {
      nombres[m.user_id] = m.full_name || m.email || null;
    });
    const total = filas.reduce((a, m) => a + m.creditos, 0) || 1;
    const quien = (uid) => (uid === '__auto__'
      ? __('Automático (sensores y flujos)')
      : (nombres[uid] || `${String(uid).slice(0, 8)}…`));

    el.innerHTML = `
      <div class="org-section-head">
        <div>
          <h3 class="org-uchart-title">${__('Consumo por miembro')}</h3>
          <p class="org-uchart-desc">${__('Quién gastó los créditos del período. Lo automático son sensores y flujos corriendo solos.')}</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="orgUsageCsv">
          <i class="aisc-ico aisc-ico--document"></i> ${__('Exportar CSV')}
        </button>
      </div>
      <div class="org-mem-table">
        <div class="org-mem-row org-mem-row--head">
          <span>${__('Miembro')}</span><span class="org-bill-right">${__('Créditos')}</span>
          <span>${__('Reparto')}</span><span class="org-bill-right">${__('Eventos')}</span>
          <span>${__('Última actividad')}</span>
        </div>
        ${filas.map((m) => {
          const pct = (m.creditos / total) * 100;
          const auto = m.uid === '__auto__';
          return `
            <div class="org-mem-row">
              <span class="org-mem-quien${auto ? ' org-mem-quien--auto' : ''}">${this._esc(quien(m.uid))}</span>
              <span class="org-bill-right org-mem-num">${this._fmtCredits(m.creditos)}</span>
              <span class="org-mem-barra"><span style="width:${pct.toFixed(1)}%"></span></span>
              <span class="org-bill-right org-mem-num">${Number(m.eventos).toLocaleString('es')}</span>
              <span class="org-mem-fecha">${m.ultima ? this._esc(this._fmtDate(m.ultima)) : '—'}</span>
            </div>`;
        }).join('')}
      </div>`;

    const btn = this.querySelector('#orgUsageCsv');
    if (btn) this.addEventListener(btn, 'click', () => this._exportUsageCsv());
  }

  /**
   * CSV del consumo por miembro, con una columna por CATEGORIA DE FUNCION
   * (imagenes, videos, los cinco scrapers…). El export viejo usaba las seis
   * "areas" tecnicas, que es justo el desglose que dejo de servir.
   */
  /**
   * Historial de movimientos, en lista, como estaba en la vista de creditos
   * antes del rediseño. Dos diferencias con aquella:
   *
   * 1. Muestra TODOS los signos. El negativo es consumo y el positivo un abono
   *    —o un consumo mal anotado, que en esta base es lo mas comun: 484 de las
   *    486 filas positivas son vera_chat y claude_tokens entrando como abono—.
   *    Esconderlas taparia justo lo que hay que ver.
   * 2. Pagina en memoria sobre lo que ya se cargo para la grafica, en vez de
   *    pedir otra pagina al servidor por cada click.
   */
  _renderUsageHistorial() {
    const el = this.querySelector('#orgUsageHistorial');
    if (!el) return;
    const todos = this.usage?.movimientos || [];
    if (!todos.length) { el.innerHTML = ''; return; }

    const POR_PAGINA = 25;
    const pagina = this._histPagina || 0;
    const paginas = Math.max(1, Math.ceil(todos.length / POR_PAGINA));
    const visibles = todos.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

    const aviso = this.usage?.positivos
      ? `<p class="org-hist-aviso">${__('{n} movimientos entraron con signo positivo. La gráfica de arriba solo cuenta los negativos, así que ese consumo no aparece en ella.', { n: this.usage.positivos })}</p>`
      : '';

    el.innerHTML = `
      <div class="org-section-head">
        <div>
          <h3 class="org-uchart-title">${__('Historial de movimientos')}</h3>
          <p class="org-uchart-desc">${__('Cada cargo y abono del período, del más reciente al más antiguo.')}</p>
        </div>
      </div>
      ${aviso}
      <div class="org-hist-list">
        ${visibles.map((r) => {
          const delta = Number(r.credits_delta) || 0;
          const cat = OrganizationView._categoriaDe(r.kind, r.metadata?.platform);
          const meta = OrganizationView.USAGE_AREAS.find((a) => a.key === cat);
          const etiqueta = (window.CreditCosts?.get?.(r.kind)?.label) || r.kind;
          const detalle = r.metadata?.description || r.metadata?.handle || r.source_id || '';
          return `
            <div class="org-hist-row">
              <span class="org-hist-cat" style="background:${meta ? meta.color : '#64748b'}" title="${this._esc(meta ? meta.label : cat)}"></span>
              <span class="org-hist-que">
                ${this._esc(etiqueta)}
                ${detalle ? `<em>${this._esc(String(detalle).slice(0, 48))}</em>` : ''}
              </span>
              <span class="org-hist-fecha">${this._esc(this._fmtDate(r.created_at))}</span>
              <span class="org-hist-delta ${delta < 0 ? 'is-debito' : 'is-abono'}">${delta > 0 ? '+' : ''}${delta.toFixed(2)}</span>
            </div>`;
        }).join('')}
      </div>
      ${paginas > 1 ? `
        <div class="org-hist-pager">
          <button type="button" class="btn btn-secondary btn-sm" data-hist="prev" ${pagina === 0 ? 'disabled' : ''}>${__('Anterior')}</button>
          <span>${__('Página {n} de {t}', { n: pagina + 1, t: paginas })}</span>
          <button type="button" class="btn btn-secondary btn-sm" data-hist="next" ${pagina >= paginas - 1 ? 'disabled' : ''}>${__('Siguiente')}</button>
        </div>` : ''}`;

    el.querySelectorAll('[data-hist]').forEach((b) => {
      this.addEventListener(b, 'click', () => {
        this._histPagina = Math.max(0, Math.min(paginas - 1, pagina + (b.dataset.hist === 'next' ? 1 : -1)));
        this._renderUsageHistorial();
      });
    });
  }

  _exportUsageCsv() {
    const filas = this.usage?.porMiembro || [];
    if (!filas.length) return;
    const cats = OrganizationView.USAGE_AREAS;
    const nombres = {};
    (this.membersWithProfile || []).forEach((m) => { nombres[m.user_id] = m.full_name || m.email || null; });

    const cabecera = ['miembro', 'user_id', 'creditos', 'eventos', 'ultima_actividad', ...cats.map((c) => c.key)];
    const cuerpo = filas.map((m) => ([
      m.uid === '__auto__' ? 'automatico' : (nombres[m.uid] || m.uid),
      m.uid === '__auto__' ? '' : m.uid,
      m.creditos.toFixed(2),
      m.eventos,
      m.ultima || '',
      ...cats.map((c) => (m.porCat[c.key] || 0).toFixed(2)),
    ]));

    const csv = [cabecera, ...cuerpo]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `consumo-por-miembro-${this.orgId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _mountUsagePicker() {
    const cont = this.querySelector('#orgUsageRange');
    if (!cont || typeof window.DateRangePicker !== 'function') return;
    if (!this._usageDP) {
      this._usageDP = new window.DateRangePicker({
        from: this.usageFrom || null,
        to: this.usageTo || null,
        // El componente hace `opts.label || __('Fecha')`: una cadena vacia es
        // falsy y pintaria "Fecha". Un espacio lo deja mudo.
        label: ' ',
        allLabel: __('Últimos 30 días'),
        onChange: async ({ from, to }) => {
          this._histPagina = 0;
          this.usageFrom = from || null;
          this.usageTo = to || null;
          await this._loadUsage();
          this._renderUsage();
        },
      });
    }
    cont.innerHTML = this._usageDP.html();
    this._usageDP.mount(cont);
  }

  _renderUsage() {
    this._mountUsagePicker();
    this._renderUsageMiembros();

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
        // Cada columna lleva su desglose en un data-attr: el tooltip se arma al
        // pasar por encima, sin recalcular nada. Un dia en cero se dibuja igual
        // —columna vacia, sin barra— para que el hueco se vea como lo que es.
        const bars = u.byDay.map((d) => {
          if (!d.total) {
            return `<div class="org-uchart-col" data-dia="${this._esc(d.day)}" data-total="0"></div>`;
          }
          const hPct = Math.max(1, (d.total / niceMax) * 100);
          const usados = OrganizationView.USAGE_AREAS.filter((a) => (d.byArea[a.key] || 0) > 0);
          const segs = usados.map((a) => {
            const segPct = (d.byArea[a.key] / d.total) * 100;
            return `<div class="org-uchart-seg" style="height:${segPct}%;background:${this._usageColor(a.key)}"></div>`;
          }).join('');
          const detalle = usados
            .map((a) => `${a.key}|${a.label}|${a.color}|${this._fmtCredits(d.byArea[a.key])}|${d.opsArea[a.key] || 0}`)
            .join('~');
          return `<div class="org-uchart-col" data-dia="${this._esc(d.day)}" data-total="${this._esc(this._fmtCredits(d.total))}" data-ops="${d.ops}" data-detalle="${this._esc(detalle)}">
            <div class="org-uchart-bar" style="height:${hPct}%">${segs}</div>
          </div>`;
        }).join('');
        // Etiquetas X: hasta 6 fechas equiespaciadas
        const n = u.byDay.length;
        const idxs = n <= 6 ? u.byDay.map((_, i) => i) : [0, 1, 2, 3, 4, 5].map((k) => Math.round(k * (n - 1) / 5));
        const xlabels = [...new Set(idxs)].map((i) => `<span>${this.escapeHtml(this._fmtDay(u.byDay[i].day))}</span>`).join('');
        chartEl.innerHTML = `
          <div class="org-uchart-head">
            <div>
              <h3 class="org-uchart-title">${__('Consumo diario por función')}</h3>
              <p class="org-uchart-desc">${__('Créditos por día, apilados por lo que los gastó.')}</p>
            </div>
            <div class="org-uchart-legend">${legend}</div>
          </div>
          <div class="org-uchart-body">
            <div class="org-uchart-yaxis">${ticks.map((t) => `<span>${this.escapeHtml(t)}</span>`).join('')}</div>
            <div class="org-uchart-plotcol">
              <div class="org-uchart-plot">${bars}<div class="org-uchart-tip" id="orgUchartTip" hidden></div></div>
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

    // El tooltip se engancha AL FINAL, no al principio: .org-uchart-plot lo crea
    // el innerHTML de arriba, asi que atado antes el querySelector devuelve null
    // y no se engancha nada. Fue exactamente el bug que lo dejo mudo.
    this._renderUsageHistorial();
    this._bindUsageTooltip();
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
        // Creditos y limites se mudaron a Uso, asi que esa pestana tambien
        // tiene que disparar la carga: si no, se abre Uso y los dos bloques se
        // quedan en "Cargando..." para siempre.
        if ((tab === 'billing' || tab === 'activity') && !this._billingLoaded) {
          this._billingLoaded = true;
          this._loadBilling();
        }
      });
    });

    this.querySelector('#orgGeneralForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._saveGeneral(); });
    this.querySelector('#orgInviteBtn')?.addEventListener('click', () => this._openInviteModal());

    this.querySelector('#orgCtrlStats')?.addEventListener('click', (e) => {
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
    // El rango de Uso lo lleva el DateRangePicker de la plataforma, montado en
    // _mountUsagePicker(); ya no hay pills que escuchar aqui.

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

  /**
   * Bitacora del equipo. Se apoya en membersWithProfile para poner nombre al
   * user_id; un evento cuyo autor ya no es miembro se muestra igual, con el id
   * abreviado — borrar a alguien del workspace no borra lo que hizo.
   */
  async _renderActividad() {
    const el = this.querySelector('#orgActividad');
    if (!el) return;
    if (!window.OrgSummaryDataService || !this.supabase || !this.orgId) { el.innerHTML = ''; return; }

    let act = null;
    try {
      const svc = await new window.OrgSummaryDataService().init(this.supabase, this.orgId);
      act = await svc.actividad(40);
    } catch (e) {
      console.warn('OrganizationView._renderActividad:', e);
    }
    if (!act) { el.innerHTML = ''; return; }

    const nombres = {};
    (this.membersWithProfile || []).forEach((m) => {
      nombres[m.user_id] = m.full_name || m.email || null;
    });
    const quien = (id) => nombres[id] || `${String(id).slice(0, 8)}…`;

    // La laguna se declara SIEMPRE, haya o no eventos: sin esta nota, una
    // bitacora corta se lee como "el equipo no hizo nada" cuando en realidad
    // buena parte de lo que hicieron no quedo firmado.
    const nota = `<p class="org-act-nota">${__('Crear perfiles a monitorear, vigilar sitios y correr el predictor todavía no guardan quién lo hizo, así que esas acciones no aparecen aquí.')}</p>`;

    if (!act.eventos.length) {
      el.innerHTML = `<p class="org-placeholder">${__('Sin actividad registrada en los últimos 6 meses.')}</p>` + nota;
      return;
    }

    const filas = act.eventos.map((e) => `
      <li class="org-act-row">
        <div class="org-act-main">
          <span class="org-act-quien">${this._esc(quien(e.userId))}</span>
          <span class="org-act-que">${this._esc(__(e.etiqueta))}</span>
          ${e.detalle ? `<span class="org-act-detalle">${this._esc(e.detalle)}</span>` : ''}
        </div>
        <time class="org-act-fecha" datetime="${this._esc(e.fecha)}">${this._esc(this._fmtFechaCorta(e.fecha))}</time>
      </li>`).join('');

    el.innerHTML = `<ul class="org-act-list">${filas}</ul>` + nota;
  }

  _fmtFechaCorta(iso) {
    try {
      return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) { return String(iso || '').slice(0, 10); }
  }

  // ─── Resumen de la organizacion ──────────────────────────────────────

  /** Formatea un importe con SU moneda. Nunca con "$" a secas: el gasto de esta
   *  plataforma convive en COP y USD, y un simbolo generico convierte 18 millones
   *  de pesos en dieciocho millones de dolares a los ojos de quien lee. */
  _money(monto, moneda) {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: moneda, maximumFractionDigits: 0,
      }).format(monto);
    } catch (_) {
      return `${Math.round(monto).toLocaleString('es')} ${moneda}`;
    }
  }

  _resumenBloque(titulo, cuerpoHtml) {
    return `<div class="org-res-block">
      <h3 class="org-res-title">${this._esc(titulo)}</h3>
      ${cuerpoHtml}
    </div>`;
  }

  _resumenDato(valor, etiqueta, extra = '') {
    return `<div class="org-res-stat">
      <span class="org-res-num">${valor}</span>
      <span class="org-res-lbl">${this._esc(etiqueta)}</span>
      ${extra ? `<span class="org-res-sub">${extra}</span>` : ''}
    </div>`;
  }

  async _renderResumen() {
    const el = this.querySelector('#orgResumen');
    if (!el) return;
    if (!window.OrgSummaryDataService || !this.supabase || !this.orgId) {
      el.innerHTML = '';
      return;
    }

    let r = null;
    try {
      const svc = await new window.OrgSummaryDataService().init(this.supabase, this.orgId);
      r = await svc.cargar();
    } catch (e) {
      console.warn('OrganizationView._renderResumen:', e);
    }
    if (!r) { el.innerHTML = ''; return; }

    const bloques = [];

    // ── Plan (grande) y creditos → columna derecha ───────────────────
    const aside = this.querySelector('#orgAsidePlan');
    if (aside) {
      let planHtml = '';
      if (r.plan?.nombre) {
        planHtml += `<div class="org-plan-hero">
          <span class="org-plan-eyebrow">${__('Plan de la marca')}</span>
          <span class="org-plan-name">${this._esc(r.plan.nombre)}</span>
          ${r.plan.creditosMes
            ? `<span class="org-plan-sub">${__('{n} créditos / mes', { n: Number(r.plan.creditosMes).toLocaleString('es') })}</span>`
            : ''}
        </div>`;
      }
      if (r.creditos && r.creditos.total > 0) {
        const pct = r.creditos.pctUsado;
        planHtml += `<div class="org-plan-credits">
          <div class="org-plan-credits-head">
            <span class="org-res-lbl">${__('Créditos utilizados')}</span>
            <span class="org-plan-credits-num">${Math.round(r.creditos.usados).toLocaleString('es')}<span class="org-res-num-of"> / ${Math.round(r.creditos.total).toLocaleString('es')}</span></span>
          </div>
          <div class="org-res-bar" role="img" aria-label="${pct}%">
            <span class="org-res-bar-fill" style="transform:scaleX(${(pct || 0) / 100})"></span>
          </div>
          <span class="org-res-sub">${__('Quedan {n}', { n: Math.round(r.creditos.disponibles).toLocaleString('es') })}</span>
        </div>`;
      }
      aside.innerHTML = planHtml;
    }

    // ── Mercado: a quien le habla la marca → columna derecha ─────────
    const elMercado = this.querySelector('#orgAsideMercado');
    if (elMercado && Array.isArray(r.mercado) && r.mercado.length) {
      const marcas = r.mercado.map((m) => {
        const filas = [];
        const lista = (arr) => (Array.isArray(arr) ? arr.filter(Boolean) : []);
        const paises = lista(m.mercado_objetivo);
        const idiomas = lista(m.idiomas_contenido);
        if (paises.length) filas.push(`<dt>${__('Mercado')}</dt><dd>${this._esc(paises.join(' · '))}</dd>`);
        if (idiomas.length) filas.push(`<dt>${__('Idiomas')}</dt><dd>${this._esc(idiomas.join(' · '))}</dd>`);
        if (m.nicho_core) filas.push(`<dt>${__('Nicho')}</dt><dd>${this._esc(m.nicho_core)}</dd>`);
        if (!filas.length) return '';
        return `<div class="org-res-marca"><dl class="org-res-dl">${filas.join('')}</dl></div>`;
      }).filter(Boolean).join('');
      elMercado.innerHTML = marcas;
    }

    // ── Audiencias, vigilancia y estrategias ─────────────────────────
    // Las cifras de inteligencia no viven en un bloque aparte: se suman a la fila
    // de insights de la izquierda, que es donde estan sus hermanas.
    this._intel = {
      audiencias: r.audiencias?.total || 0,
      vigilados: r.vigilancia?.total || 0,
      estrategias: r.estrategias?.total || 0,
    };
    this._renderControlStats();

    // ── Pauta ────────────────────────────────────────────────────────
    if (r.pauta) {
      const p = r.pauta;
      const partes = [];
      if (p.campanas.total) {
        partes.push(this._resumenDato(p.campanas.total, __('Campañas'),
          __('{a} activas · {p} pausadas', { a: p.campanas.activas, p: p.campanas.pausadas })));
      }
      if (p.anuncios.total) {
        const extra = __('{a} activos · {p} pausados', { a: p.anuncios.activos, p: p.anuncios.pausados })
          + (p.anuncios.conProblema ? ` · ${__('{n} con problema', { n: p.anuncios.conProblema })}` : '');
        partes.push(this._resumenDato(p.anuncios.total, __('Anuncios'), extra));
      }
      Object.entries(p.gastoPorMoneda || {}).forEach(([moneda, monto]) => {
        partes.push(this._resumenDato(this._money(monto, moneda), __('Invertido en pauta'),
          p.conversiones ? __('{n} conversiones', { n: Math.round(p.conversiones).toLocaleString('es') }) : ''));
      });
      if (partes.length) {
        bloques.push(`<div class="org-res-block org-res-block--pauta">
          <h3 class="org-res-title">${__('Pauta')}</h3>
          <div class="org-res-grid">${partes.join('')}</div>
        </div>`);
      }
    }

    el.innerHTML = bloques.join('');
  }
}

window.OrganizationView = OrganizationView;
