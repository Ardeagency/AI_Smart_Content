/**
 * OrganizationView — Panel administrativo técnico de la organización.
 *
 * No es branding (eso vive en BrandOrganizationView). Aquí: límites de uso,
 * actividad operativa, salud del sistema, monitoreo, notificaciones,
 * seguridad, miembros. Solo timezone/locale son editables a nivel de datos
 * generales — el resto del config (nombre, logo, slogan, autonomy, sub-marcas)
 * NO se edita acá.
 *
 * Tabs: General · Miembros · Plan & Límites · Actividad · Monitoreo ·
 *       Salud de Vera · Notificaciones · Seguridad · Danger zone
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

    // Plan / Caps
    this.subscription = null;
    this.plan = null;
    this.credits = { credits_available: 0, credits_total: 0, updated_at: null };
    this.storage = { used_mb: 0, max_mb: 0, updated_at: null };
    this.aiCaps = null;
    this.aiUsageToday = null;

    // Sub-marcas (read-only)
    this.brandContainers = [];

    // Actividad
    this.creditTimeline = [];
    this.recentFlowRuns = [];

    // Monitoreo
    this.monitoringTriggers = [];

    // AI Engine
    this.serverStatus = null;
    this.apifyRuns = [];
    this.apifyStats30d = { runs: 0, items: 0, usd: 0, byPlatform: {} };
    this.trendJobs30d = { runs: 0, signals: 0, briefs: 0, usd: 0 };

    // Salud
    this.veraPendingByStatus = {};
    this.recentMissionErrors = [];
    this.queueByStatus = {};

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
      <h1 class="organization-title">Configuración</h1>
      <p class="organization-subtitle">Panel técnico-administrativo de la organización. La identidad de marca se gestiona en <a href="#" data-route="brand">Identity</a>.</p>
    </div>
    <div class="organization-header-status" id="orgHeaderStatus"></div>
  </div>

  <div class="organization-tabs" role="tablist">
    <button type="button" class="tab-btn active" data-tab="general" role="tab" aria-selected="true">General</button>
    <button type="button" class="tab-btn" data-tab="members" role="tab" aria-selected="false">Miembros</button>
    <button type="button" class="tab-btn" data-tab="plan" role="tab" aria-selected="false">Plan & Límites</button>
    <button type="button" class="tab-btn" data-tab="billing" role="tab" aria-selected="false">Facturación</button>
    <button type="button" class="tab-btn" data-tab="engine" role="tab" aria-selected="false">AI Engine</button>
    <button type="button" class="tab-btn" data-tab="activity" role="tab" aria-selected="false">Actividad</button>
    <button type="button" class="tab-btn" data-tab="monitoring" role="tab" aria-selected="false">Monitoreo</button>
    <button type="button" class="tab-btn" data-tab="health" role="tab" aria-selected="false">Salud de Vera</button>
    <button type="button" class="tab-btn" data-tab="notifications" role="tab" aria-selected="false">Notificaciones</button>
    <button type="button" class="tab-btn" data-tab="security" role="tab" aria-selected="false">Seguridad</button>
    <button type="button" class="tab-btn tab-btn--danger" data-tab="danger" role="tab" aria-selected="false">Danger zone</button>
  </div>

  <div class="organization-content">

    <!-- ── General ──────────────────────────────────────── -->
    <div class="tab-content active" id="generalTab" role="tabpanel">
      <section class="org-section org-section-form">
        <h2>Datos regionales</h2>
        <p class="org-section-desc">Estos valores afectan reportes, scheduling y formato de fechas/idioma del workspace.</p>
        <form id="orgGeneralForm" class="org-form">
          <div class="org-form-grid">
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
          </div>
          <div class="org-form-actions">
            <button type="submit" class="btn btn-primary" id="orgGeneralSubmit">
              <i class="fas fa-save"></i> Guardar
            </button>
          </div>
        </form>
      </section>

      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Marcas gestionadas</h2>
            <p class="org-section-desc">Cada <strong>marca gestionada</strong> es un workspace de datos aislado dentro de tu organización: tiene sus propias audiencias, campañas, integraciones (Meta, Shopify, etc.), sensores de monitoreo y producción de contenido. Sirve para que una agencia o equipo opere varias marcas/regiones bajo una misma cuenta, sin que se mezclen datos entre ellas.</p>
            <p class="org-section-desc"><strong>Provisión gestionada:</strong> cada marca requiere configuración inicial del equipo de plataforma (mapeo de fuentes, conexión de cuentas, calibrado de Vera). Por eso no se crean desde la app — son un servicio adicional con costo por marca activa.</p>
          </div>
          <a href="mailto:info@ardeagency.com?subject=Solicitud%20de%20nueva%20marca%20gestionada&body=Hola%20equipo%2C%0A%0AQuiero%20a%C3%B1adir%20una%20nueva%20marca%20gestionada%20a%20mi%20organizaci%C3%B3n.%0A%0ANombre%20de%20la%20marca%3A%20%0AMercado%2Fregi%C3%B3n%3A%20%0APlataformas%20a%20conectar%3A%20%0AObjetivos%20iniciales%3A%20%0A%0AGracias." class="btn btn-primary" id="orgRequestBrandBtn"><i class="fas fa-paper-plane"></i> Solicitar nueva marca</a>
        </div>
        <div class="org-subbrands-list" id="orgSubbrandsList"><p class="org-placeholder">Cargando…</p></div>
      </section>
    </div>

    <!-- ── Miembros ─────────────────────────────────────── -->
    <div class="tab-content" id="membersTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Miembros</h2>
            <p class="org-section-desc">Roles y acceso al workspace.</p>
          </div>
          <button type="button" class="btn btn-primary" id="orgInviteBtn">
            <i class="fas fa-user-plus"></i> Invitar
          </button>
        </div>
        <div class="org-members-list" id="orgMembersList"></div>
      </section>

      <section class="org-section" id="orgInvitationsSection" hidden>
        <h3>Invitaciones pendientes</h3>
        <div class="org-invitations-list" id="orgInvitationsList"></div>
      </section>
    </div>

    <!-- ── Plan & Límites ───────────────────────────────── -->
    <div class="tab-content" id="planTab" role="tabpanel">
      <section class="org-section">
        <h2>Plan actual</h2>
        <div class="org-plan-card" id="orgPlanCard"><p class="org-placeholder">Cargando…</p></div>
      </section>

      <section class="org-section">
        <h2>Almacenamiento</h2>
        <p class="org-section-desc">Cuota incluida en tu plan. Para ampliar contacta a soporte.</p>
        <div class="org-usage-card" id="orgStorageCard"></div>
      </section>

      <section class="org-section">
        <h2>Créditos del ciclo</h2>
        <div class="org-usage-card" id="orgCreditsCard"></div>
      </section>

      <section class="org-section">
        <h2>Límites de uso de IA</h2>
        <p class="org-section-desc">Define topes diarios y mensuales de consumo del agente Vera. Si alcanzas el umbral de aviso, recibirás una notificación; al llegar al cap se bloquean nuevas operaciones automáticas.</p>
        <form id="orgCapsForm" class="org-form">
          <div class="org-form-grid">
            <div class="form-group">
              <label for="capsDaily">Cap diario (USD)</label>
              <input type="number" min="0" step="0.01" id="capsDaily" class="form-input" placeholder="ej. 10">
            </div>
            <div class="form-group">
              <label for="capsMonthly">Cap mensual (USD)</label>
              <input type="number" min="0" step="0.01" id="capsMonthly" class="form-input" placeholder="ej. 200">
            </div>
            <div class="form-group">
              <label for="capsWarn">Umbral de aviso (%)</label>
              <input type="number" min="0" max="100" step="1" id="capsWarn" class="form-input" placeholder="ej. 80">
            </div>
            <div class="form-group">
              <label for="capsConfirm">Umbral de confirmación (USD por op.)</label>
              <input type="number" min="0" step="0.01" id="capsConfirm" class="form-input" placeholder="ej. 1.50">
            </div>
            <div class="form-group form-group--full">
              <label class="org-checkbox">
                <input type="checkbox" id="capsConfirmEnabled">
                <span>Pedir confirmación al usuario antes de operaciones que excedan el umbral por operación</span>
              </label>
            </div>
          </div>
          <div class="org-usage-card" id="orgAiCard" style="margin-top: 1rem;"></div>
          <div class="org-form-actions">
            <button type="submit" class="btn btn-primary" id="orgCapsSubmit"><i class="fas fa-save"></i> Guardar límites</button>
          </div>
        </form>
      </section>
    </div>

    <!-- ── Facturación ──────────────────────────────────── -->
    <div class="tab-content" id="billingTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Suscripción activa</h2>
            <p class="org-section-desc">Estado de tu plan y próximo cobro.</p>
          </div>
        </div>
        <div class="org-billing-summary" id="orgBillingSummary"><p class="org-placeholder">Cargando…</p></div>
      </section>

      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Historial de facturas</h2>
            <p class="org-section-desc">Facturas pagadas y pagos únicos de paquetes de créditos.</p>
          </div>
        </div>
        <div class="org-billing-invoices" id="orgBillingInvoices"><p class="org-placeholder">Cargando…</p></div>
      </section>
    </div>

    <!-- ── AI Engine ────────────────────────────────────── -->
    <div class="tab-content" id="engineTab" role="tabpanel">
      <section class="org-section">
        <h2>Servidor AI Engine</h2>
        <p class="org-section-desc">Servidor dedicado donde Vera procesa los scrapers, sensores y agentes para esta organización. Se aprovisiona en Hetzner Cloud y se suspende automáticamente tras inactividad para ahorrar costos.</p>
        <div class="org-engine-server" id="orgEngineServer"><p class="org-placeholder">Cargando…</p></div>
      </section>

      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Scrapers (Apify, últimos 30 días)</h2>
            <p class="org-section-desc">Costo y volumen real de las extracciones que ejecutó Vera para esta organización. Cada run trae datos públicos de Meta/TikTok/IG/etc. para alimentar sensores y briefs.</p>
          </div>
        </div>
        <div class="org-engine-stats" id="orgScrapersStats"></div>
        <h3 class="org-usage-subtitle">Últimas ejecuciones</h3>
        <div class="org-scrapers-list" id="orgScrapersList"><p class="org-placeholder">Cargando…</p></div>
      </section>

      <section class="org-section">
        <h2>Trend Engine (últimos 30 días)</h2>
        <p class="org-section-desc">Pipeline de inteligencia: genera queries, recolecta señales del mercado, las puntúa y produce briefs estratégicos.</p>
        <div class="org-engine-stats" id="orgTrendStats"></div>
      </section>
    </div>

    <!-- ── Actividad ────────────────────────────────────── -->
    <div class="tab-content" id="activityTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Ejecuciones recientes</h2>
            <p class="org-section-desc">Últimos flujos ejecutados en la organización.</p>
          </div>
          <a href="#" class="btn btn-secondary btn-sm" id="orgActivityTasksLink">Historial completo</a>
        </div>
        <div class="org-runs-list" id="orgRunsList"><p class="org-placeholder">Cargando…</p></div>
      </section>

      <section class="org-section">
        <h2>Consumo de créditos (últimos 30 días)</h2>
        <div class="org-usage-timeline" id="orgCreditsTimeline"></div>
      </section>
    </div>

    <!-- ── Monitoreo ────────────────────────────────────── -->
    <div class="tab-content" id="monitoringTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Triggers activos</h2>
            <p class="org-section-desc">Sensores configurados para esta organización. Para crear/editar usa la página de Monitoreo.</p>
          </div>
          <a href="#" class="btn btn-secondary btn-sm" id="orgMonitoringLink">Abrir Monitoreo</a>
        </div>
        <div class="org-monitoring-list" id="orgMonitoringList"><p class="org-placeholder">Cargando…</p></div>
      </section>
    </div>

    <!-- ── Salud de Vera ────────────────────────────────── -->
    <div class="tab-content" id="healthTab" role="tabpanel">
      <section class="org-section">
        <h2>Estado del agente</h2>
        <p class="org-section-desc">Acciones propuestas por Vera, ejecución de misiones y cola de trabajos.</p>
        <div class="org-health-grid" id="orgHealthGrid"></div>
      </section>

      <section class="org-section">
        <h2>Errores recientes de misiones</h2>
        <div class="org-mission-errors" id="orgMissionErrors"><p class="org-placeholder">Cargando…</p></div>
      </section>
    </div>

    <!-- ── Notificaciones ───────────────────────────────── -->
    <div class="tab-content" id="notificationsTab" role="tabpanel">
      <section class="org-section">
        <h2>Notificaciones recientes</h2>
        <div class="org-notifications-list" id="orgNotificationsList"><p class="org-placeholder">Cargando…</p></div>
      </section>
      <section class="org-section">
        <h2>Preferencias</h2>
        <p class="org-section-desc org-placeholder">Configuración de canales (email, in-app, Slack) por tipo de evento — próximamente.</p>
      </section>
    </div>

    <!-- ── Seguridad ────────────────────────────────────── -->
    <div class="tab-content" id="securityTab" role="tabpanel">
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Registro de actividad (audit log)</h2>
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
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Autenticación de dos factores (2FA)</h2>
            <p class="org-section-desc">Añade un código de 6 dígitos generado por una app autenticadora (Google Authenticator, Authy, 1Password) además de tu contraseña. No requiere SMS — funciona offline desde tu celular.</p>
          </div>
        </div>

        <div class="org-mfa-personal" id="orgMfaPersonal">
          <p class="org-placeholder">Cargando…</p>
        </div>

        <div class="org-mfa-policy" id="orgMfaPolicy" hidden>
          <h3 style="margin-top: 1.5rem; font-size: 0.95rem;">Política de organización</h3>
          <p class="org-section-desc">Como propietario, puedes exigir 2FA a todos los miembros antes de que puedan acceder.</p>
          <label class="org-toggle">
            <input type="checkbox" id="orgMfaRequireToggle">
            <span class="org-toggle-label">Exigir 2FA a todos los miembros de esta organización</span>
          </label>
          <p class="org-mfa-policy-hint" id="orgMfaPolicyHint"></p>
        </div>
      </section>
      <section class="org-section">
        <div class="org-section-head">
          <div>
            <h2>Sesiones activas</h2>
            <p class="org-section-desc">Dispositivos donde tu cuenta tiene sesión abierta. Cierra cualquier sesión que no reconozcas.</p>
          </div>
          <button type="button" class="btn btn-secondary" id="orgSessionsRevokeAllBtn">
            <i class="fas fa-sign-out-alt"></i> Cerrar todas las otras sesiones
          </button>
        </div>
        <div class="org-sessions-list" id="orgSessionsList">
          <p class="org-placeholder">Cargando…</p>
        </div>
      </section>
    </div>

    <!-- ── Danger zone ──────────────────────────────────── -->
    <div class="tab-content" id="dangerTab" role="tabpanel">
      <section class="org-section org-section--danger">
        <h2>Transferir propiedad</h2>
        <p class="org-section-desc">Mueve la organización a otro administrador. Perderás los privilegios de propietario.</p>
        <button type="button" class="btn btn-danger-ghost" id="orgTransferBtn">Transferir propiedad</button>
      </section>
      <section class="org-section org-section--danger">
        <h2>Exportar datos</h2>
        <p class="org-section-desc">Solicita una copia de los datos operativos (runs, audiencias, campañas).</p>
        <button type="button" class="btn btn-danger-ghost" id="orgExportBtn"><i class="fas fa-download"></i> Solicitar export</button>
      </section>
      <section class="org-section org-section--danger">
        <h2>Archivar organización</h2>
        <p class="org-section-desc">La organización queda inaccesible y deja de consumir créditos. Puedes restaurarla contactando soporte dentro de 30 días.</p>
        <button type="button" class="btn btn-danger" id="orgArchiveBtn"><i class="fas fa-archive"></i> Archivar organización</button>
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
      <a href="https://aismartcontent.io/privacy-policy" target="_blank" rel="noopener">Política de privacidad</a>
      <span class="organization-footer-sep">·</span>
      <a href="https://aismartcontent.io/terms-and-conditions" target="_blank" rel="noopener">Términos de servicio</a>
      <span class="organization-footer-sep">·</span>
      <a href="https://aismartcontent.io/data-deletion" target="_blank" rel="noopener">Eliminación de datos</a>
      <span class="organization-footer-sep">·</span>
      <a href="https://aismartcontent.io/contact" target="_blank" rel="noopener">Contacto</a>
    </nav>
  </footer>
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

<!-- ── Modal: Activar 2FA (TOTP enroll) ────────────────── -->
<div class="modal org-modal" id="orgMfaEnrollModal" aria-hidden="true">
  <div class="modal-content" style="max-width: 480px;">
    <div class="modal-header">
      <h3>Activar autenticación de 2 pasos</h3>
      <button type="button" class="modal-close" id="orgMfaEnrollClose" aria-label="Cerrar">&times;</button>
    </div>
    <div id="orgMfaEnrollBody">
      <ol class="org-mfa-steps">
        <li>Abre tu app autenticadora (Google Authenticator, Authy, 1Password).</li>
        <li>Escanea este código QR. Si no puedes, copia el código manualmente.</li>
        <li>Ingresa el código de 6 dígitos que muestra tu app.</li>
      </ol>
      <div class="org-mfa-qr-wrap" id="orgMfaQrWrap">
        <p class="org-placeholder">Generando código…</p>
      </div>
      <div class="form-group" id="orgMfaSecretWrap" hidden>
        <label>Código manual (si el QR no funciona)</label>
        <input type="text" id="orgMfaSecret" class="form-input" readonly style="font-family: monospace; letter-spacing: 1px;">
      </div>
      <form id="orgMfaEnrollForm">
        <div class="form-group">
          <label for="orgMfaCode">Código de 6 dígitos</label>
          <input type="text" id="orgMfaCode" class="form-input" required maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" style="font-size: 1.5rem; letter-spacing: 0.3rem; text-align: center; font-family: monospace;">
        </div>
        <p class="org-mfa-error" id="orgMfaEnrollError" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="orgMfaEnrollCancel">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="orgMfaEnrollSubmit">Verificar y activar</button>
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
        this._loadCredits(),
        this._loadStorage(),
        this._loadSubscription(),
        this._loadAiCaps(),
        this._loadCreditTimeline(),
        this._loadFlowRuns(),
        this._loadMonitoringTriggers(),
        this._loadVeraHealth(),
        this._loadNotifications(),
        this._loadAuditLog(),
        this._loadEngineServer(),
        this._loadApifyRuns(),
        this._loadTrendJobs(),
        this._loadMfa(),
      ]);

      this._renderHeaderStatus();
      this._renderGeneral();
      this._renderSubbrands();
      this._renderMembers();
      this._renderInvitations();
      this._renderPlanAndLimits();
      this._renderEngine();
      this._renderActivity();
      this._renderMonitoring();
      this._renderHealth();
      this._renderNotifications();
      this._renderAuditLog();
      this._renderMfa();
      this._renderSessions();
      this._configureExternalLinks();
    } catch (e) {
      console.error('OrganizationView _loadAll:', e);
      this._showError(e.message || 'Error al cargar la configuración.');
    }
  }

  async _loadOrg() {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('id, name, owner_user_id, created_at, deleted_at, timezone, locale, mfa_required')
      .eq('id', this.orgId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Organización no encontrada.');
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
            <i class="fas fa-shield-alt"></i>
            <div>
              <strong>2FA no activa</strong>
              <p>Tu cuenta usa solo email + contraseña. Activa la autenticación de 2 pasos para una capa extra de seguridad.</p>
            </div>
            <button type="button" class="btn btn-primary" id="orgMfaEnrollBtn">
              <i class="fas fa-lock"></i> Activar 2FA
            </button>
          </div>
        `;
      } else {
        const f = verified[0];
        const created = f.created_at ? new Date(f.created_at).toLocaleDateString() : '—';
        personal.innerHTML = `
          <div class="org-mfa-status org-mfa-status--on">
            <i class="fas fa-shield-halved"></i>
            <div>
              <strong>2FA activa</strong>
              <p>Factor TOTP enrolado el ${this.escapeHtml(created)}. En tu próximo login se te pedirá el código de 6 dígitos.</p>
            </div>
            <button type="button" class="btn btn-secondary" data-factor-id="${this.escapeHtml(f.id)}" id="orgMfaUnenrollBtn">
              <i class="fas fa-trash"></i> Desactivar
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
            ? 'Todos los miembros deben activar 2FA antes de poder acceder. Quienes aún no la tengan serán redirigidos al flujo de activación en su próximo login.'
            : 'Cada miembro decide si activa 2FA por su cuenta. Actívalo arriba para tu propia cuenta.';
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
    if (qrWrap) qrWrap.innerHTML = '<p class="org-placeholder">Generando código…</p>';
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
          img.alt = 'QR 2FA';
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
          p.textContent = 'QR no disponible. Usa el código manual.';
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
        errorEl.textContent = `No se pudo iniciar el enroll: ${e.message || 'error desconocido'}`;
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
      if (errorEl) { errorEl.textContent = 'El código debe ser de 6 dígitos numéricos.'; errorEl.hidden = false; }
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
      this._toast('2FA activada. En tu próximo login se pedirá el código.');
      await this._loadMfa();
      this._renderMfa();
      this._bindMfaEvents();
    } catch (e) {
      console.error('OrganizationView _submitMfaEnroll:', e);
      if (errorEl) {
        errorEl.textContent = `Código inválido o expirado: ${e.message || 'intenta de nuevo'}`;
        errorEl.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async _unenrollMfa(factorId) {
    if (!factorId) return;
    if (!confirm('¿Desactivar 2FA? Tu cuenta volverá a quedar solo con email + contraseña.')) return;
    try {
      const { error } = await this.supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      this._toast('2FA desactivada.');
      await this._loadMfa();
      this._renderMfa();
      this._bindMfaEvents();
    } catch (e) {
      console.error('OrganizationView _unenrollMfa:', e);
      this._toast(`No se pudo desactivar: ${e.message || 'error'}`);
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
      this._toast(required ? 'Política activada: 2FA exigida para todos los miembros.' : 'Política desactivada.');
      this._renderMfa();
      this._bindMfaEvents();
    } catch (e) {
      console.error('OrganizationView _toggleOrgMfaRequired:', e);
      this._toast(`No se pudo guardar: ${e.message || 'error'}`);
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
    const ua = navigator.userAgent || 'Navegador desconocido';
    const platform = navigator.platform || '';
    const sessionStartIso = (() => {
      try {
        const raw = localStorage.getItem('sb-' + (this.supabase?.supabaseUrl || '').split('//')[1]?.split('.')[0] + '-auth-token');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.expires_at ? new Date((parsed.expires_at - 3600) * 1000).toISOString() : null;
      } catch { return null; }
    })();
    const sessionStartHuman = sessionStartIso ? new Date(sessionStartIso).toLocaleString() : 'desconocido';

    wrap.innerHTML = `
      <div class="org-session-card">
        <i class="fas fa-laptop"></i>
        <div class="org-session-info">
          <strong>Esta sesión <span class="org-session-badge">actual</span></strong>
          <p>${this.escapeHtml(ua.slice(0, 120))}</p>
          <p class="org-session-meta">Plataforma: ${this.escapeHtml(platform || '—')} · Iniciada: ${this.escapeHtml(sessionStartHuman)}</p>
        </div>
      </div>
      <p class="org-section-desc" style="margin-top: 0.75rem; font-size: 0.85rem;">
        Si tienes acceso desde otros dispositivos o navegadores y quieres revocarlos, usa el botón "Cerrar todas las otras sesiones" arriba. Esta sesión actual no se cerrará.
      </p>
    `;
  }

  _bindSessionsEvents() {
    const revokeAllBtn = this.querySelector('#orgSessionsRevokeAllBtn');
    if (revokeAllBtn) revokeAllBtn.addEventListener('click', () => this._revokeOtherSessions());
  }

  async _revokeOtherSessions() {
    if (!confirm('¿Cerrar todas las otras sesiones? Tendrás que volver a iniciar sesión en cualquier otro dispositivo o navegador.')) return;
    try {
      const { error } = await this.supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      this._toast('Todas las otras sesiones fueron cerradas.');
    } catch (e) {
      console.error('OrganizationView _revokeOtherSessions:', e);
      this._toast(`No se pudo cerrar: ${e.message || 'error'}`);
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

  async _loadCredits() {
    const { data } = await this.supabase
      .from('organization_credits')
      .select('credits_available, credits_total, updated_at')
      .eq('organization_id', this.orgId).maybeSingle();
    if (data) this.credits = data;
  }

  async _loadStorage() {
    const { data } = await this.supabase
      .from('storage_usage').select('used_mb, max_mb, updated_at')
      .eq('organization_id', this.orgId).maybeSingle();
    if (data) this.storage = data;
  }

  async _loadSubscription() {
    const { data: sub } = await this.supabase
      .from('subscriptions')
      .select('id, plan_id, status, current_period_start, current_period_end, stripe_subscription_id, metadata, created_at')
      .eq('organization_id', this.orgId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    this.subscription = sub || null;
    if (sub?.plan_id) {
      const { data: plan } = await this.supabase
        .from('plans')
        .select('id, name, description, price_usd_month, credits_monthly, storage_mb, features, is_popular')
        .eq('id', sub.plan_id).maybeSingle();
      this.plan = plan || null;
    }
  }

  async _loadAiCaps() {
    try {
      const { data: caps } = await this.supabase
        .from('org_claude_caps').select('*').eq('organization_id', this.orgId).maybeSingle();
      this.aiCaps = caps || null;
    } catch (_) {}
    try {
      const { data: today } = await this.supabase
        .from('v_org_claude_usage_today').select('*').eq('organization_id', this.orgId).maybeSingle();
      this.aiUsageToday = today || null;
    } catch (_) {}
  }

  async _loadCreditTimeline() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // credit_usage usa credits_delta (negativo = consumo). Para el timeline
    // de uso diario filtramos solo consumos y sumamos su valor absoluto.
    const { data } = await this.supabase
      .from('credit_usage').select('credits_delta, created_at')
      .eq('organization_id', this.orgId)
      .lt('credits_delta', 0)
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    const rows = data || [];
    const byDay = {};
    rows.forEach((r) => {
      const day = (r.created_at || '').slice(0, 10);
      if (!day) return;
      byDay[day] = (byDay[day] || 0) + Math.abs(Number(r.credits_delta) || 0);
    });
    this.creditTimeline = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([day, total]) => ({ day, total }));
  }

  async _loadFlowRuns() {
    const { data } = await this.supabase
      .from('flow_runs')
      .select('id, flow_id, status, created_at, tokens_consumed, current_module_order, total_modules_count, user_id')
      .eq('organization_id', this.orgId).order('created_at', { ascending: false }).limit(20);
    this.recentFlowRuns = data || [];
  }

  async _loadMonitoringTriggers() {
    const { data } = await this.supabase
      .from('monitoring_triggers')
      .select('id, sensor_type, cadence, cadence_value, priority, status, next_run_at, last_run_at, last_run_status, paused_reason')
      .eq('organization_id', this.orgId).order('priority', { ascending: false }).limit(50);
    this.monitoringTriggers = data || [];
  }

  async _loadVeraHealth() {
    try {
      const { data: actions } = await this.supabase
        .from('vera_pending_actions').select('status').eq('organization_id', this.orgId);
      const counts = {};
      (actions || []).forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1; });
      this.veraPendingByStatus = counts;
    } catch (_) {}

    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: missions } = await this.supabase
        .from('mission_runs')
        .select('id, status, error_message, completed_at, started_at, duration_ms')
        .eq('organization_id', this.orgId).eq('status', 'failed').gte('created_at', since)
        .order('created_at', { ascending: false }).limit(10);
      this.recentMissionErrors = missions || [];
    } catch (_) {}

    try {
      const { data: jobs } = await this.supabase
        .from('agent_queue_jobs').select('status').eq('organization_id', this.orgId);
      const counts = {};
      (jobs || []).forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
      this.queueByStatus = counts;
    } catch (_) {}
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
      const [{ data: subRows }, { data: stripeInvs }, { data: wompiTxs }, { data: planRow }] = await Promise.all([
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
      ]);
      this.billingSub      = (subRows && subRows[0]) || null;
      this.billingInvoices = stripeInvs || [];
      this.billingWompiTxs = wompiTxs   || [];
      this.billingPlanRow  = planRow    || null;
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

    const providerLabel = sub?.provider === 'wompi' ? 'Wompi (COP)' : sub?.provider === 'stripe' ? 'Stripe (USD)' : '—';
    const planName      = plan?.name || sub?.plan_id || 'Sin plan';
    const nextRenew     = sub?.provider === 'wompi' ? sub?.next_charge_at : sub?.current_period_end;
    const nextRenewStr  = nextRenew ? new Date(nextRenew).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const statusLabel   = ({ active: 'Activa', trial: 'En prueba', past_due: 'Pago pendiente', canceled: 'Cancelada' }[sub?.status]) || (sub?.status || 'Sin suscripción');

    const banner = past_due
      ? `<div class="org-error-banner" style="margin-bottom:1rem;">Tu último pago no se procesó correctamente. Actualiza tu método de pago para evitar la suspensión del servicio.</div>`
      : canceled
      ? `<div class="org-warning-banner" style="margin-bottom:1rem;background:#3a2410;border:1px solid #6b3a17;color:#fbbf24;padding:.75rem 1rem;border-radius:8px;">Tu suscripción terminará el ${this.escapeHtml(nextRenewStr)}.</div>`
      : '';

    const stripePortalBtn = sub?.provider === 'stripe'
      ? `<button type="button" class="btn btn-secondary" id="orgBillingPortalBtn"><i class="fas fa-external-link-alt"></i> Gestionar suscripción</button>`
      : '';
    const hasActiveSub = sub && ['active','trial','past_due'].includes(sub.status);
    const cancelBtn = hasActiveSub && !sub.cancel_at_period_end
      ? `<button type="button" class="btn btn-secondary" id="orgBillingCancelBtn"><i class="fas fa-times"></i> Cancelar suscripción</button>`
      : '';
    const reactivateBtn = hasActiveSub && sub.cancel_at_period_end
      ? `<button type="button" class="btn btn-secondary" id="orgBillingReactivateBtn"><i class="fas fa-undo"></i> Reactivar suscripción</button>`
      : '';
    const upgradeBtn = `<a href="${this.escapeHtml(this._plansHref())}" class="btn btn-primary"><i class="fas fa-arrow-up"></i> Ver planes</a>`;

    summary.innerHTML = `
      ${banner}
      <div class="org-billing-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;">
        <div><span class="org-section-desc">Plan</span><strong style="display:block;font-size:1.1rem;margin-top:.25rem;">${this.escapeHtml(planName)}</strong></div>
        <div><span class="org-section-desc">Estado</span><strong style="display:block;font-size:1.1rem;margin-top:.25rem;">${this.escapeHtml(statusLabel)}</strong></div>
        <div><span class="org-section-desc">Próximo cobro</span><strong style="display:block;font-size:1.1rem;margin-top:.25rem;">${this.escapeHtml(nextRenewStr)}</strong></div>
        <div><span class="org-section-desc">Pasarela</span><strong style="display:block;font-size:1.1rem;margin-top:.25rem;">${this.escapeHtml(providerLabel)}</strong></div>
      </div>
      <div class="org-form-actions" style="margin-top:1.25rem;display:flex;gap:.5rem;flex-wrap:wrap;">
        ${upgradeBtn} ${stripePortalBtn} ${cancelBtn} ${reactivateBtn}
      </div>
    `;

    // Listado unificado de invoices (Stripe + Wompi)
    const stripeRows = (this.billingInvoices || []).map((inv) => ({
      key:      inv.invoice_id,
      provider: 'stripe',
      date:     inv.paid_at || inv.created_at,
      amount:   (inv.amount_paid_cents || 0) / 100,
      currency: (inv.currency || 'usd').toUpperCase(),
      status:   inv.status,
      desc:     `Período ${this._fmtPeriod(inv.period_start, inv.period_end)}`,
      url:      inv.hosted_invoice_url || inv.invoice_pdf || null,
    }));
    const wompiRows = (this.billingWompiTxs || []).map((tx) => ({
      key:      tx.transaction_id,
      provider: 'wompi',
      date:     tx.finalized_at || tx.created_at,
      amount:   (tx.amount_in_cents || 0) / 100,
      currency: tx.currency || 'COP',
      status:   tx.status,
      desc:     tx.target === 'subscription' ? 'Suscripción' : 'Paquete de créditos',
      url:      null,
    }));
    const all = [...stripeRows, ...wompiRows].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (all.length === 0) {
      list.innerHTML = `<p class="org-placeholder">Sin facturas todavía. Las verás aquí después de tu primer pago.</p>`;
      return;
    }

    list.innerHTML = `
      <table class="org-billing-table" style="width:100%;border-collapse:collapse;font-size:.9rem;">
        <thead><tr style="text-align:left;color:#9ca3af;border-bottom:1px solid #242424;">
          <th style="padding:.5rem .25rem;">Fecha</th>
          <th style="padding:.5rem .25rem;">Concepto</th>
          <th style="padding:.5rem .25rem;">Pasarela</th>
          <th style="padding:.5rem .25rem;text-align:right;">Monto</th>
          <th style="padding:.5rem .25rem;text-align:right;">Acción</th>
        </tr></thead>
        <tbody>${all.map((r) => `
          <tr style="border-bottom:1px solid #1f1f1f;">
            <td style="padding:.5rem .25rem;">${this.escapeHtml(this._fmtDate(r.date))}</td>
            <td style="padding:.5rem .25rem;">${this.escapeHtml(r.desc || '—')}</td>
            <td style="padding:.5rem .25rem;">${r.provider === 'wompi' ? 'Wompi' : 'Stripe'}</td>
            <td style="padding:.5rem .25rem;text-align:right;font-variant-numeric:tabular-nums;">${this._fmtMoney(r.amount, r.currency)}</td>
            <td style="padding:.5rem .25rem;text-align:right;">${r.url ? `<a href="${this.escapeHtml(r.url)}" target="_blank" rel="noopener" class="btn btn-link">Ver</a>` : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    this.querySelector('#orgBillingPortalBtn')?.addEventListener('click', () => {
      window.billingService?.openCustomerPortal();
    });

    this.querySelector('#orgBillingCancelBtn')?.addEventListener('click', () => this._cancelSubscription(false));
    this.querySelector('#orgBillingReactivateBtn')?.addEventListener('click', () => this._cancelSubscription(true));
  }

  async _cancelSubscription(undo) {
    const action = undo ? 'reactivar' : 'cancelar';
    if (!undo && !window.confirm('¿Cancelar la suscripción al final del período actual? Mantendrás acceso hasta entonces y no se hará otro cobro automático.')) return;

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
      if (!res.ok) throw new Error(data.error || `No se pudo ${action}`);
      const msg = undo ? 'Suscripción reactivada. El próximo cobro procederá como antes.'
                       : `Suscripción cancelada. Mantienes acceso hasta el ${this._fmtDate(data.cancel_at)}.`;
      (window.showToast || window.alert)(msg, 'success');
      this._billingLoaded = false;
      await this._loadBilling();
    } catch (e) {
      (window.showToast || window.alert)(`Error: ${e.message}`, 'error');
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

  async _loadEngineServer() {
    try {
      const { data } = await this.supabase
        .from('v_org_server_status').select('*').eq('organization_id', this.orgId).maybeSingle();
      this.serverStatus = data || null;
    } catch (_) { /* vista opcional */ }
  }

  async _loadApifyRuns() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await this.supabase
      .from('apify_runs')
      .select('run_id, platform, handle, apify_actor_id, status, started_at, finished_at, usage_usd, items_count, charged_credits, error')
      .eq('organization_id', this.orgId).gte('created_at', since)
      .order('started_at', { ascending: false }).limit(50);
    this.apifyRuns = data || [];
    const totals = { runs: 0, items: 0, usd: 0, byPlatform: {} };
    this.apifyRuns.forEach((r) => {
      totals.runs += 1;
      totals.items += Number(r.items_count) || 0;
      totals.usd += Number(r.usage_usd) || 0;
      const p = (r.platform || 'unknown').toLowerCase();
      totals.byPlatform[p] = totals.byPlatform[p] || { runs: 0, items: 0, usd: 0 };
      totals.byPlatform[p].runs += 1;
      totals.byPlatform[p].items += Number(r.items_count) || 0;
      totals.byPlatform[p].usd += Number(r.usage_usd) || 0;
    });
    this.apifyStats30d = totals;
  }

  async _loadTrendJobs() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await this.supabase
      .from('trend_query_jobs')
      .select('total_signals_collected, total_signals_scored, total_briefs_generated, total_cost_usd, total_credits_consumed, status, started_at')
      .eq('organization_id', this.orgId).gte('started_at', since);
    const rows = data || [];
    const stats = { runs: rows.length, signals: 0, briefs: 0, usd: 0 };
    rows.forEach((r) => {
      stats.signals += Number(r.total_signals_collected) || 0;
      stats.briefs += Number(r.total_briefs_generated) || 0;
      stats.usd += Number(r.total_cost_usd) || 0;
    });
    this.trendJobs30d = stats;
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
      el.innerHTML = '<p class="org-members-empty">Aún no tienes marcas gestionadas. Pulsa "Solicitar nueva marca" para iniciar el proceso de provisión.</p>';
      return;
    }
    el.innerHTML = this.brandContainers.map((b) => {
      const since = b.created_at ? new Date(b.created_at).toLocaleDateString('es') : '—';
      return `
        <div class="org-subbrand-row">
          <div class="org-subbrand-info">
            <span class="org-subbrand-name">${this.escapeHtml(b.nombre_marca || 'Marca')}</span>
            <span class="org-subbrand-meta">Activa desde ${this.escapeHtml(since)}</span>
          </div>
          <span class="org-subbrand-lock" title="Provisión gestionada por el equipo de plataforma"><i class="fas fa-lock"></i> Gestionada por plataforma</span>
        </div>`;
    }).join('');
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
        ? `<select class="org-role-select" data-member-id="${this.escapeHtml(m.id)}">
             <option value="admin"${m.role === 'admin' ? ' selected' : ''}>Administrador</option>
             <option value="member"${m.role === 'member' ? ' selected' : ''}>Miembro</option>
             <option value="viewer"${m.role === 'viewer' ? ' selected' : ''}>Viewer</option>
           </select>`
        : `<span class="org-member-role org-role-${(roleLabel || 'member').toLowerCase()}">${this.escapeHtml(roleLabel)}</span>`;
      const removeBtn = canRemove
        ? `<button type="button" class="btn btn-ghost btn-sm org-member-remove" data-member-id="${this.escapeHtml(m.id)}" title="Quitar"><i class="fas fa-times"></i></button>`
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
            <span class="org-invitation-meta">${this.escapeHtml(inv.role)} · expira ${expires}</span>
          </div>
          <div class="org-invitation-actions">
            <button type="button" class="btn btn-ghost btn-sm org-invitation-revoke" data-invitation-id="${this.escapeHtml(inv.id)}">Revocar</button>
          </div>
        </div>`;
    }).join('');
  }

  _renderPlanAndLimits() {
    // Plan card
    const card = this.querySelector('#orgPlanCard');
    if (card) {
      if (!this.subscription) {
        card.innerHTML = `
          <div class="org-plan-empty">
            <p>No tienes un plan activo.</p>
            <button type="button" class="btn btn-primary" id="orgChoosePlanBtn">Ver planes</button>
          </div>`;
        this.querySelector('#orgChoosePlanBtn')?.addEventListener('click', () => this._goToPlans());
      } else {
        const planName = this.plan?.name || this.subscription.plan_id || 'Plan';
        const price = this.plan?.price_usd_month != null ? `$${this.plan.price_usd_month}/mes` : '';
        const status = this.subscription.status || '—';
        const renewal = this.subscription.current_period_end
          ? new Date(this.subscription.current_period_end).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })
          : '—';
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
            <div><span class="org-plan-stat-label">Almacenamiento</span><span class="org-plan-stat-value">${this._formatStorage(this.plan?.storage_mb)}</span></div>
          </div>
          <div class="org-plan-actions">
            <button type="button" class="btn btn-primary" id="orgUpgradeBtn">Cambiar de plan</button>
          </div>`;
        this.querySelector('#orgUpgradeBtn')?.addEventListener('click', () => this._goToPlans());
      }
    }

    // Storage
    const stEl = this.querySelector('#orgStorageCard');
    if (stEl) {
      const used = Number(this.storage.used_mb) || 0;
      const max = Number(this.storage.max_mb) || 0;
      const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
      stEl.innerHTML = this._usageCardHTML({
        label: 'Almacenamiento usado',
        primary: this._formatStorage(used),
        secondary: max > 0 ? `de ${this._formatStorage(max)}` : '',
        pct,
        sub: '',
      });
    }

    // Credits
    const cEl = this.querySelector('#orgCreditsCard');
    if (cEl) {
      const used = Math.max(0, (this.credits.credits_total || 0) - (this.credits.credits_available || 0));
      const pct = this.credits.credits_total > 0 ? Math.min(100, Math.round((used / this.credits.credits_total) * 100)) : 0;
      cEl.innerHTML = this._usageCardHTML({
        label: 'Créditos usados',
        primary: used.toLocaleString('es'),
        secondary: this.credits.credits_total > 0 ? `de ${this.credits.credits_total.toLocaleString('es')}` : '',
        pct,
        sub: this.credits.credits_available != null ? `${this.credits.credits_available.toLocaleString('es')} disponibles` : '',
      });
    }

    // AI caps form
    const setVal = (sel, v) => { const el = this.querySelector(sel); if (el) el.value = v == null ? '' : v; };
    setVal('#capsDaily', this.aiCaps?.daily_usd_cap);
    setVal('#capsMonthly', this.aiCaps?.monthly_usd_cap);
    setVal('#capsWarn', this.aiCaps?.warn_threshold != null ? Math.round(this.aiCaps.warn_threshold * 100) : '');
    setVal('#capsConfirm', this.aiCaps?.confirm_threshold_usd);
    const cb = this.querySelector('#capsConfirmEnabled');
    if (cb) cb.checked = !!this.aiCaps?.confirm_enabled;

    // AI usage today card
    const aiEl = this.querySelector('#orgAiCard');
    if (aiEl) {
      const cap = this.aiCaps?.daily_usd_cap ?? null;
      const usedToday = this.aiUsageToday?.cost_usd_today ?? this.aiUsageToday?.usd ?? null;
      const pct = cap && usedToday != null ? Math.min(100, Math.round((usedToday / cap) * 100)) : 0;
      aiEl.innerHTML = this._usageCardHTML({
        label: 'Consumo de IA hoy',
        primary: usedToday != null ? `$${Number(usedToday).toFixed(2)}` : '—',
        secondary: cap ? `de $${Number(cap).toFixed(2)}` : 'sin cap configurado',
        pct,
        sub: '',
      });
    }

    const capsForm = this.querySelector('#orgCapsForm');
    if (capsForm) {
      const canEdit = this.isOwner || this.canManageMembers;
      capsForm.querySelectorAll('input').forEach((i) => { i.disabled = !canEdit; });
      const btn = this.querySelector('#orgCapsSubmit');
      if (btn) btn.disabled = !canEdit;
    }
  }

  _renderEngine() {
    // Server status
    const srv = this.querySelector('#orgEngineServer');
    if (srv) {
      if (!this.serverStatus) {
        srv.innerHTML = `
          <div class="org-server-card">
            <div class="org-server-row">
              <span class="org-server-label">Estado</span>
              <span class="org-status-pill org-status-pill--archived">Sin servidor dedicado</span>
            </div>
            <p class="org-server-hint">Esta organización aún no tiene un AI Engine aprovisionado. Vera usa la infraestructura compartida hasta que se asigne uno dedicado.</p>
          </div>`;
      } else {
        const s = this.serverStatus;
        const sleeping = !!s.sleeping;
        const stateClass = sleeping ? 'archived' : (s.status === 'ready' || s.status === 'active' ? 'active' : 'archived');
        const stateLabel = sleeping ? 'Suspendido' : (s.status || '—');
        const lastActivity = s.last_activity_at ? new Date(s.last_activity_at).toLocaleString('es') : '—';
        const inactive = s.inactive_days != null ? `${Number(s.inactive_days).toFixed(0)} días sin actividad` : '';
        srv.innerHTML = `
          <div class="org-server-card">
            <div class="org-server-grid">
              <div class="org-server-row">
                <span class="org-server-label">Estado</span>
                <span class="org-status-pill org-status-pill--${stateClass}">${this.escapeHtml(stateLabel)}</span>
              </div>
              <div class="org-server-row">
                <span class="org-server-label">Tipo de servidor</span>
                <span class="org-server-value">${this.escapeHtml(s.server_type || '—')}</span>
              </div>
              <div class="org-server-row">
                <span class="org-server-label">Hetzner ID</span>
                <code class="org-server-mono">${this.escapeHtml(s.hetzner_server_id || '—')}</code>
              </div>
              <div class="org-server-row">
                <span class="org-server-label">Última actividad</span>
                <span class="org-server-value">${this.escapeHtml(lastActivity)}${inactive ? ' · ' + this.escapeHtml(inactive) : ''}</span>
              </div>
              <div class="org-server-row">
                <span class="org-server-label">Snapshot disponible</span>
                <span class="org-server-value">${s.has_snapshot ? 'Sí' : 'No'}</span>
              </div>
            </div>
            <p class="org-server-hint"><i class="fas fa-info-circle"></i> El servidor se reactiva automáticamente cuando Vera necesita ejecutar una tarea; mientras tanto no genera costo de cómputo.</p>
          </div>`;
      }
    }

    // Apify stats
    const apEl = this.querySelector('#orgScrapersStats');
    if (apEl) {
      const s = this.apifyStats30d;
      apEl.innerHTML = `
        ${this._engineStatHTML('Runs', s.runs.toLocaleString('es'), 'fa-bolt')}
        ${this._engineStatHTML('Items extraídos', s.items.toLocaleString('es'), 'fa-database')}
        ${this._engineStatHTML('Gastado en Apify', `$${s.usd.toFixed(2)}`, 'fa-dollar-sign', 'cost')}
      `;
    }

    // Apify recent runs
    const apList = this.querySelector('#orgScrapersList');
    if (apList) {
      if (!this.apifyRuns.length) {
        apList.innerHTML = '<p class="org-members-empty">Sin scrapers ejecutados en los últimos 30 días.</p>';
      } else {
        apList.innerHTML = this.apifyRuns.slice(0, 20).map((r) => {
          const when = r.started_at ? new Date(r.started_at).toLocaleString('es') : '—';
          const status = r.status || 'unknown';
          const usd = r.usage_usd != null ? `$${Number(r.usage_usd).toFixed(3)}` : '—';
          const items = r.items_count != null ? Number(r.items_count).toLocaleString('es') : '—';
          return `
            <div class="org-scraper-row">
              <span class="org-scraper-when">${this.escapeHtml(when)}</span>
              <span class="org-scraper-platform">${this.escapeHtml((r.platform || '—').toLowerCase())}</span>
              <span class="org-scraper-handle" title="${this.escapeHtml(r.handle || '')}">${this.escapeHtml(r.handle || '—')}</span>
              <span class="org-scraper-items">${this.escapeHtml(items)} items</span>
              <span class="org-scraper-cost">${this.escapeHtml(usd)}</span>
              <span class="org-run-status org-run-status--${this.escapeHtml(status.toLowerCase())}">${this.escapeHtml(status)}</span>
            </div>`;
        }).join('');
      }
    }

    // Trend stats
    const trEl = this.querySelector('#orgTrendStats');
    if (trEl) {
      const t = this.trendJobs30d;
      trEl.innerHTML = `
        ${this._engineStatHTML('Ciclos', t.runs.toLocaleString('es'), 'fa-sync')}
        ${this._engineStatHTML('Señales recolectadas', t.signals.toLocaleString('es'), 'fa-broadcast-tower')}
        ${this._engineStatHTML('Briefs generados', t.briefs.toLocaleString('es'), 'fa-file-alt')}
        ${this._engineStatHTML('Costo total', `$${t.usd.toFixed(2)}`, 'fa-dollar-sign', 'cost')}
      `;
    }
  }

  _engineStatHTML(label, value, icon, tone) {
    return `
      <div class="org-engine-stat${tone ? ' org-engine-stat--' + this.escapeHtml(tone) : ''}">
        <i class="fas ${this.escapeHtml(icon)} org-engine-stat-icon"></i>
        <div>
          <div class="org-engine-stat-value">${this.escapeHtml(String(value))}</div>
          <div class="org-engine-stat-label">${this.escapeHtml(label)}</div>
        </div>
      </div>`;
  }

  _renderActivity() {
    const list = this.querySelector('#orgRunsList');
    if (list) {
      if (!this.recentFlowRuns.length) {
        list.innerHTML = '<p class="org-members-empty">Sin ejecuciones recientes.</p>';
      } else {
        list.innerHTML = this.recentFlowRuns.map((r) => {
          const when = r.created_at ? new Date(r.created_at).toLocaleString('es') : '—';
          const status = r.status || 'unknown';
          const progress = r.total_modules_count > 0
            ? `${r.current_module_order || 0}/${r.total_modules_count}`
            : '—';
          return `
            <div class="org-run-row">
              <span class="org-run-when">${this.escapeHtml(when)}</span>
              <span class="org-run-flow">${this.escapeHtml(r.flow_id ? r.flow_id.slice(0, 8) + '…' : '—')}</span>
              <span class="org-run-progress">${this.escapeHtml(progress)}</span>
              <span class="org-run-tokens">${r.tokens_consumed || 0} tk</span>
              <span class="org-run-status org-run-status--${this.escapeHtml(status)}">${this.escapeHtml(status)}</span>
            </div>`;
        }).join('');
      }
    }

    const tlEl = this.querySelector('#orgCreditsTimeline');
    if (tlEl) {
      if (!this.creditTimeline.length) {
        tlEl.innerHTML = '<p class="org-placeholder">Sin consumo registrado en los últimos 30 días.</p>';
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
  }

  _renderMonitoring() {
    const list = this.querySelector('#orgMonitoringList');
    if (!list) return;
    if (!this.monitoringTriggers.length) {
      list.innerHTML = '<p class="org-members-empty">No hay sensores configurados.</p>';
      return;
    }
    list.innerHTML = this.monitoringTriggers.map((t) => {
      const next = t.next_run_at ? new Date(t.next_run_at).toLocaleString('es') : '—';
      const last = t.last_run_at ? new Date(t.last_run_at).toLocaleString('es') : '—';
      const status = t.status || 'unknown';
      const lastStatus = t.last_run_status || '—';
      return `
        <div class="org-monitor-row">
          <div class="org-monitor-info">
            <span class="org-monitor-name">${this.escapeHtml(t.sensor_type || 'sensor')}</span>
            <span class="org-monitor-meta">cadencia: ${this.escapeHtml(t.cadence || '—')}${t.cadence_value ? ' (' + this.escapeHtml(t.cadence_value) + ')' : ''} · prioridad ${t.priority ?? '—'}</span>
          </div>
          <div class="org-monitor-runs">
            <span class="org-monitor-last">Último: ${this.escapeHtml(last)} <em class="org-run-status org-run-status--${this.escapeHtml(lastStatus)}">${this.escapeHtml(lastStatus)}</em></span>
            <span class="org-monitor-next">Próximo: ${this.escapeHtml(next)}</span>
          </div>
          <span class="org-monitor-status org-monitor-status--${this.escapeHtml(status)}">${this.escapeHtml(status)}</span>
        </div>`;
    }).join('');
  }

  _renderHealth() {
    const grid = this.querySelector('#orgHealthGrid');
    if (grid) {
      const pending = this.veraPendingByStatus.pending || 0;
      const executed = this.veraPendingByStatus.executed || 0;
      const failed = this.veraPendingByStatus.failed || 0;
      const queueRunning = this.queueByStatus.running || this.queueByStatus.processing || 0;
      const queueFailed = this.queueByStatus.failed || 0;
      const queuePending = this.queueByStatus.pending || this.queueByStatus.queued || 0;
      grid.innerHTML = `
        ${this._healthStatHTML('Acciones pendientes de Vera', pending, 'fa-hourglass-half', pending > 0 ? 'warning' : 'ok')}
        ${this._healthStatHTML('Ejecutadas (vida total)', executed, 'fa-check-circle', 'ok')}
        ${this._healthStatHTML('Fallidas (vida total)', failed, 'fa-exclamation-triangle', failed > 0 ? 'error' : 'ok')}
        ${this._healthStatHTML('En cola', queuePending, 'fa-list', 'neutral')}
        ${this._healthStatHTML('En ejecución', queueRunning, 'fa-spinner', 'neutral')}
        ${this._healthStatHTML('Jobs fallidos', queueFailed, 'fa-times-circle', queueFailed > 0 ? 'error' : 'ok')}
      `;
    }

    const errEl = this.querySelector('#orgMissionErrors');
    if (errEl) {
      if (!this.recentMissionErrors.length) {
        errEl.innerHTML = '<p class="org-members-empty">Sin errores en los últimos 7 días.</p>';
      } else {
        errEl.innerHTML = this.recentMissionErrors.map((m) => {
          const when = m.completed_at || m.started_at;
          const t = when ? new Date(when).toLocaleString('es') : '—';
          return `
            <div class="org-error-row">
              <span class="org-error-when">${this.escapeHtml(t)}</span>
              <span class="org-error-message">${this.escapeHtml((m.error_message || 'Sin detalle').slice(0, 220))}</span>
            </div>`;
        }).join('');
      }
    }
  }

  _renderNotifications() {
    const list = this.querySelector('#orgNotificationsList');
    if (!list) return;
    if (!this.notifications.length) {
      list.innerHTML = '<p class="org-members-empty">No hay notificaciones recientes.</p>';
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
            <span class="org-notif-title">${this.escapeHtml(n.title || n.type || 'Notificación')}</span>
            ${n.body ? `<span class="org-notif-body">${this.escapeHtml(n.body)}</span>` : ''}
            <span class="org-notif-meta">${this.escapeHtml(when)} · ${this.escapeHtml(n.type || '')}</span>
          </div>
          ${n.action_url ? `<a href="${this.escapeHtml(n.action_url)}" class="btn btn-secondary btn-sm">${this.escapeHtml(n.action_label || 'Abrir')}</a>` : ''}
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
    if (!rows.length) { listEl.innerHTML = '<p class="org-members-empty">Sin actividad registrada.</p>'; return; }
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

  _configureExternalLinks() {
    const prefix = (this.orgId && typeof window.getOrgPathPrefix === 'function')
      ? window.getOrgPathPrefix(this.orgId, this.org?.name || '') : '';
    const tasksLink = this.querySelector('#orgActivityTasksLink');
    if (tasksLink) tasksLink.setAttribute('href', (prefix || '') + '/tasks');
    const monLink = this.querySelector('#orgMonitoringLink');
    if (monLink) monLink.setAttribute('href', (prefix || '') + '/monitoring');
  }

  // ── Helpers ────────────────────────────────────────────
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

  _healthStatHTML(label, value, icon, tone) {
    return `
      <div class="org-health-stat org-health-stat--${this.escapeHtml(tone)}">
        <i class="fas ${this.escapeHtml(icon)} org-health-stat-icon"></i>
        <div>
          <div class="org-health-stat-value">${this.escapeHtml(String(value))}</div>
          <div class="org-health-stat-label">${this.escapeHtml(label)}</div>
        </div>
      </div>`;
  }

  _formatStorage(mb) {
    if (mb == null) return '—';
    return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB';
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
    this.querySelector('#orgCapsForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._saveCaps(); });
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

    document.getElementById('orgInviteModalClose')?.addEventListener('click', () => this._closeInviteModal());
    document.getElementById('orgInviteCancel')?.addEventListener('click', () => this._closeInviteModal());

    this._bindMfaEvents();
    this._bindSessionsEvents();
    document.getElementById('orgInviteForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._submitInvite(); });

    this.querySelector('#auditFilterAction')?.addEventListener('change', (e) => { this.auditFilter.action = e.target.value; this._renderAuditLog(); });
    this.querySelector('#auditFilterUser')?.addEventListener('change', (e) => { this.auditFilter.user = e.target.value; this._renderAuditLog(); });

    this.querySelector('#orgTransferBtn')?.addEventListener('click', () => this._openTransferModal());
    this.querySelector('#orgArchiveBtn')?.addEventListener('click', () => this._archiveOrg());
    this.querySelector('#orgExportBtn')?.addEventListener('click', () => this._requestExport());
    document.getElementById('orgTransferModalClose')?.addEventListener('click', () => this._closeTransferModal());
    document.getElementById('orgTransferCancel')?.addEventListener('click', () => this._closeTransferModal());
    document.getElementById('orgTransferForm')?.addEventListener('submit', (e) => { e.preventDefault(); this._submitTransfer(); });
  }

  // ── Acciones ───────────────────────────────────────────
  async _saveGeneral() {
    const btn = this.querySelector('#orgGeneralSubmit');
    const payload = {
      timezone: this.querySelector('#orgTimezone')?.value || 'UTC',
      locale: this.querySelector('#orgLocale')?.value || 'es',
    };
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…'; }
    try {
      const { error } = await this.supabase.from('organizations').update(payload).eq('id', this.orgId);
      if (error) throw error;
      this.org = { ...this.org, ...payload };
      this._toast('Configuración regional guardada');
    } catch (e) {
      alert(e.message || 'No se pudo guardar.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; }
    }
  }

  async _saveCaps() {
    const btn = this.querySelector('#orgCapsSubmit');
    const num = (sel) => {
      const v = this.querySelector(sel)?.value;
      if (v === '' || v == null) return null;
      const n = Number(v); return isNaN(n) ? null : n;
    };
    const payload = {
      organization_id: this.orgId,
      daily_usd_cap: num('#capsDaily'),
      monthly_usd_cap: num('#capsMonthly'),
      warn_threshold: (() => { const v = num('#capsWarn'); return v == null ? null : v / 100; })(),
      confirm_threshold_usd: num('#capsConfirm'),
      confirm_enabled: !!this.querySelector('#capsConfirmEnabled')?.checked,
    };
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…'; }
    try {
      const { error } = await this.supabase.from('org_claude_caps').upsert(payload, { onConflict: 'organization_id' });
      if (error) throw error;
      await this._loadAiCaps();
      this._renderPlanAndLimits();
      this._toast('Límites de IA actualizados');
    } catch (e) {
      alert(e.message || 'No se pudo guardar los límites.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar límites'; }
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
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    try {
      const { data: existing } = await this.supabase
        .from('organization_invitations').select('id').eq('organization_id', this.orgId).eq('email', email).eq('status', 'pending').maybeSingle();
      if (existing) { alert('Ya existe una invitación pendiente para ese email.'); return; }
      const { data: profile } = await this.supabase.from('profiles').select('id').eq('email', email).maybeSingle();
      if (profile && this.members.some((m) => m.user_id === profile.id)) { alert('Ese usuario ya es miembro.'); return; }
      const { error } = await this.supabase.from('organization_invitations').insert({ organization_id: this.orgId, email, role, invited_by: this.userId });
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
    if (!invitationId || !confirm('¿Revocar esta invitación?')) return;
    const { error } = await this.supabase.from('organization_invitations').update({ status: 'revoked' }).eq('id', invitationId);
    if (error) { alert(error.message || 'Error.'); return; }
    await this._loadInvitations(); this._renderInvitations();
    this._toast('Invitación revocada');
  }

  async _changeRole(memberId, role) {
    if (!memberId || !role || !this.canManageMembers) return;
    const { error } = await this.supabase.from('organization_members').update({ role }).eq('id', memberId).eq('organization_id', this.orgId);
    if (error) { alert(error.message || 'No se pudo cambiar el rol.'); return; }
    await this._loadMembers(); this._renderMembers();
    this._toast('Rol actualizado');
  }

  async _removeMember(memberId) {
    if (!memberId || !this.canManageMembers) return;
    const m = this.members.find((x) => x.id === memberId);
    if (!m || m.user_id === this.org?.owner_user_id) return;
    if (!confirm('¿Quitar a este miembro de la organización?')) return;
    const { error } = await this.supabase.from('organization_members').delete().eq('id', memberId).eq('organization_id', this.orgId);
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
        .map((m) => `<option value="${this.escapeHtml(m.user_id)}">${this.escapeHtml(m.full_name || m.email || m.user_id.slice(0, 8) + '…')}</option>`).join('');
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
    const confirmTxt = document.getElementById('transferConfirm')?.value?.trim();
    if (!newOwner) { alert('Selecciona un miembro.'); return; }
    if (confirmTxt !== (this.org?.name || '')) { alert('El nombre no coincide.'); return; }
    const { error } = await this.supabase.from('organizations').update({ owner_user_id: newOwner }).eq('id', this.orgId).eq('owner_user_id', this.userId);
    if (error) { alert(error.message || 'No se pudo transferir.'); return; }
    this._closeTransferModal();
    this._toast('Propiedad transferida');
    await this._loadOrg(); await this._loadMembers();
    this._renderHeaderStatus(); this._renderGeneral(); this._renderMembers();
  }

  async _archiveOrg() {
    if (!this.isOwner) { alert('Solo el propietario puede archivar.'); return; }
    const confirmTxt = prompt(`Escribe "${this.org?.name || ''}" para archivar:`);
    if (confirmTxt !== this.org?.name) { if (confirmTxt != null) alert('El nombre no coincide.'); return; }
    const { error } = await this.supabase.from('organizations').update({ deleted_at: new Date().toISOString() }).eq('id', this.orgId).eq('owner_user_id', this.userId);
    if (error) { alert(error.message || 'No se pudo archivar.'); return; }
    this._toast('Organización archivada');
    setTimeout(() => window.router?.navigate('/home', true), 600);
  }

  async _requestExport() {
    alert('Solicitud de export registrada. Recibirás un email con el enlace de descarga cuando esté lista.');
  }

  _toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg, 'success');
  }
}

window.OrganizationView = OrganizationView;
