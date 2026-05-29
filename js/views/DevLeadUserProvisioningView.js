/**
 * DevLeadUserProvisioningView
 *
 * /dev/provisioning/users — flujo de creacion de usuario (rebuild 2026-05-29).
 *
 * Pasos:
 *   1. Tipo         — Member Org / Owner Org / Developer (cards)
 *   2. Datos        — Sign-up real: name/email/password → provision-user-start
 *   3. Verificacion — espera email confirm, polling cada 3s
 *   4. Final        — form dinamico:
 *                       Member Org → Afiliar (selector org + rol)
 *                       Owner Org  → Crear org (form de marca)
 *                       Developer  → Permisos (dev_role + dev_rank)
 *                     submit → provision-user-finalize
 *
 * Layout: progress bar arriba + contenido centrado vertical+horizontal sobre
 * dot canvas estilo n8n.
 */
class DevLeadUserProvisioningView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userType = null;
    this.currentStep = 'type';
    this.activeJob = null;          // { id, auth_user_id, email, status }
    this.pollTimer = null;
    this.POLL_INTERVAL_MS = 3000;
    this._submitting = false;
    // Step 4 state
    this.orgsList = [];             // cache para member_org
    this.finalizing = false;
    this.finalized = false;
    this.finalizedResult = null;    // { auth_user_id, organization_id, user_type }
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async destroy() {
    this.stopPolling();
    super.destroy();
  }

  STEPS = [
    { key: 'type',   label: 'Tipo' },
    { key: 'data',   label: 'Datos' },
    { key: 'verify', label: 'Verificacion' },
    { key: 'final',  label: null } // dinamico segun userType
  ];

  USER_TYPES = [
    {
      key: 'member_org',
      label: 'Member Org',
      icon: 'fa-user',
      hint: 'Se afilia a una organizacion existente con un rol asignado'
    },
    {
      key: 'owner_org',
      label: 'Owner Org',
      icon: 'fa-crown',
      hint: 'Crea una organizacion nueva y queda como owner'
    },
    {
      key: 'developer',
      label: 'Developer',
      icon: 'fa-code',
      hint: 'Acceso al portal /dev'
    }
  ];

  // ─── Etiquetas dinamicas ─────────────────────────────────────────────

  getStepLabel(step) {
    if (step.key !== 'final') return step.label;
    if (this.userType === 'member_org') return 'Afiliar';
    if (this.userType === 'owner_org')  return 'Crear org';
    if (this.userType === 'developer')  return 'Permisos';
    return 'Configurar';
  }

  platformRoleFor(t) {
    if (t === 'developer') return 'dev';
    return 'user';
  }

  defaultViewFor(t) {
    return t === 'developer' ? 'developer' : 'user';
  }

  statusLabel(s) {
    return {
      pending_email_confirmation: 'Esperando confirmacion del email',
      email_confirmed: 'Email confirmado',
      finalizing: 'Finalizando',
      completed: 'Completado',
      failed: 'Fallo',
      cancelled: 'Cancelado'
    }[s] || s;
  }

  // ─── Render ──────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="provision-page">
        <header class="provision-page-progress">
          ${this.renderProgress()}
        </header>
        <div class="provision-page-center">
          ${this.renderCurrentStep()}
        </div>
      </div>
    `;
  }

  renderProgress() {
    const idx = this.STEPS.findIndex((s) => s.key === this.currentStep);
    // Cuando finalized: todos los steps quedan is-done (no hay current)
    const allDone = this.finalized;
    this.container?.style.setProperty('--provision-step-count', String(this.STEPS.length));
    return `
      <ol class="provision-progress" style="--provision-step-count: ${this.STEPS.length}" aria-label="Progreso del flujo">
        ${this.STEPS.map((s, i) => {
          let state;
          if (allDone) state = 'is-done';
          else if (i < idx) state = 'is-done';
          else if (i === idx) state = 'is-current';
          else state = 'is-pending';
          const marker = (state === 'is-done') ? '<i class="fas fa-check"></i>' : String(i + 1);
          return `
            <li class="provision-progress-item ${state}" data-step="${s.key}">
              <span class="provision-progress-caret" aria-hidden="true">
                <i class="fas fa-caret-down"></i>
              </span>
              <span class="provision-progress-marker">${marker}</span>
              <span class="provision-progress-label">${this.escapeHtml(this.getStepLabel(s))}</span>
            </li>
          `;
        }).join('')}
      </ol>
    `;
  }

  renderCurrentStep() {
    switch (this.currentStep) {
      case 'type':   return this.renderStepType();
      case 'data':   return this.renderStepData();
      case 'verify': return this.renderStepVerify();
      case 'final':  return this.renderStepFinal();
      default:       return '';
    }
  }

  renderStepType() {
    return `
      <div class="provision-type-grid" role="radiogroup" aria-label="Tipo de usuario">
        ${this.USER_TYPES.map((t) => {
          const active = this.userType === t.key;
          return `
            <button
              type="button"
              class="provision-type-card ${active ? 'is-active' : ''}"
              data-user-type="${t.key}"
              role="radio"
              aria-checked="${active ? 'true' : 'false'}"
            >
              <span class="provision-type-icon"><i class="fas ${t.icon}"></i></span>
              <span class="provision-type-label">${this.escapeHtml(t.label)}</span>
              <span class="provision-type-hint">${this.escapeHtml(t.hint)}</span>
            </button>
          `;
        }).join('')}
      </div>
      <footer class="provision-page-actions">
        <button
          type="button"
          class="provision-next-btn"
          data-action="next"
          aria-label="Siguiente"
          ${!this.userType ? 'disabled' : ''}
        >
          <i class="fas fa-arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepData() {
    const typeLabel = this.USER_TYPES.find((t) => t.key === this.userType)?.label || 'usuario';
    return `
      <section class="provision-form-card">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 2 · Datos</span>
          <h2>Crear ${this.escapeHtml(typeLabel.toLowerCase())}</h2>
          <p>Defines la contrasena ahora. El usuario tendra que confirmar su email despues.</p>
        </header>
        <form id="provisionDataForm" class="provision-form" novalidate>
          <div class="provision-field">
            <label for="provisionFullName">Nombre completo</label>
            <input id="provisionFullName" name="full_name" type="text" placeholder="Ej. Maria Garcia" autocomplete="name" required>
          </div>
          <div class="provision-field">
            <label for="provisionEmail">Email</label>
            <input id="provisionEmail" name="email" type="email" placeholder="usuario@ejemplo.com" autocomplete="email" required>
          </div>
          <div class="provision-field">
            <label for="provisionPassword">Contrasena temporal</label>
            <input id="provisionPassword" name="password" type="password" placeholder="Minimo 8 caracteres" autocomplete="new-password" minlength="8" required>
            <small>El usuario podra cambiarla cuando confirme su email.</small>
          </div>
          <p class="provision-form-status" role="status" aria-live="polite" id="provisionDataStatus"></p>
        </form>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Back</button>
        <button
          type="submit"
          form="provisionDataForm"
          class="provision-next-btn"
          data-action="next"
          aria-label="Crear usuario y enviar verificacion"
        >
          <i class="fas fa-arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepVerify() {
    const email = this.activeJob?.email || '';
    return `
      <section class="provision-verify-card">
        <span class="provision-verify-icon">
          <i class="fas fa-envelope-open-text"></i>
        </span>
        <h2>Esperando confirmacion</h2>
        <p>Enviamos un email de verificacion a <strong>${this.escapeHtml(email)}</strong>.</p>
        <div class="provision-verify-spinner"><i class="fas fa-circle-notch fa-spin"></i></div>
        <p class="provision-verify-status" id="provisionVerifyStatus">
          ${this.escapeHtml(this.statusLabel(this.activeJob?.status || 'pending_email_confirmation'))}...
        </p>
        <p class="provision-verify-meta">
          Puedes cerrar esta vista; al volver continua el polling.
          Si el email no llega revisa la configuracion SMTP del proyecto Supabase.
        </p>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Cancelar</button>
      </footer>
    `;
  }

  renderStepFinal() {
    if (this.finalized)  return this.renderStepFinalDone();
    if (this.finalizing) return this.renderStepFinalSubmitting();

    switch (this.userType) {
      case 'member_org': return this.renderStepMemberOrg();
      case 'owner_org':  return this.renderStepOwnerOrg();
      case 'developer':  return this.renderStepDeveloper();
      default:           return '';
    }
  }

  renderStepMemberOrg() {
    const orgOpts = this.orgsList.length === 0
      ? '<option value="" disabled selected>Cargando organizaciones...</option>'
      : '<option value="" disabled selected>Selecciona una organizacion</option>' +
        this.orgsList.map((o) =>
          `<option value="${o.id}">${this.escapeHtml(o.name || o.id)}</option>`
        ).join('');

    const roleOpts = [
      { v: 'viewer',    label: 'Viewer — solo lectura' },
      { v: 'vera_user', label: 'Vera User — chat con Vera y consumo' },
      { v: 'creator',   label: 'Creator — crea contenido (Studio/Video/Production)' },
      { v: 'editor',    label: 'Editor — crea contenido + edita brand + insights' },
      { v: 'admin',     label: 'Admin — todo menos transferir/eliminar org' }
    ].map((r) =>
      `<option value="${r.v}">${this.escapeHtml(r.label)}</option>`
    ).join('');

    return `
      <section class="provision-form-card">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 4 · Afiliar</span>
          <h2>Asignar a una organizacion</h2>
          <p>Elige a que organizacion entra este usuario y con que rol.</p>
        </header>
        <form id="provisionFinalForm" class="provision-form" novalidate>
          <div class="provision-field">
            <label for="provisionOrgSelect">Organizacion</label>
            <select id="provisionOrgSelect" name="organization_id" required>
              ${orgOpts}
            </select>
          </div>
          <div class="provision-field">
            <label for="provisionMemberRole">Rol en la organizacion</label>
            <select id="provisionMemberRole" name="role" required>
              ${roleOpts}
            </select>
            <small>Las capacidades se asignan automaticamente segun el rol. El rol 'owner' solo se crea con Owner Org.</small>
          </div>
          <p class="provision-form-status" role="status" aria-live="polite" id="provisionFinalStatus"></p>
        </form>
      </section>
      <footer class="provision-page-actions">
        <button type="submit" form="provisionFinalForm" class="provision-next-btn" data-action="next" aria-label="Afiliar">
          <i class="fas fa-arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepOwnerOrg() {
    return `
      <section class="provision-form-card">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 4 · Crear org</span>
          <h2>Nueva organizacion</h2>
          <p>El usuario queda como owner. Los demas datos (plan, autonomia, integraciones) se editan despues.</p>
        </header>
        <form id="provisionFinalForm" class="provision-form" novalidate>
          <div class="provision-field">
            <label for="provisionOrgName">Nombre <span style="color:#ef4444">*</span></label>
            <input id="provisionOrgName" name="name" type="text" placeholder="Ej. ACME Corp" maxlength="120" required>
          </div>
          <div class="provision-field">
            <label for="provisionOrgBrandName">Nombre oficial de marca</label>
            <input id="provisionOrgBrandName" name="brand_name_oficial" type="text" placeholder="Ej. ACME Brand SAS" maxlength="120">
          </div>
          <div class="provision-field">
            <label for="provisionOrgSlogan">Slogan</label>
            <input id="provisionOrgSlogan" name="brand_slogan" type="text" placeholder="Frase de marca" maxlength="200">
          </div>
          <div class="provision-field">
            <label for="provisionOrgLogo">Logo URL</label>
            <input id="provisionOrgLogo" name="logo_url" type="url" placeholder="https://...">
            <small>PNG/JPG/SVG via URL publica. Tambien se puede subir despues desde Brand.</small>
          </div>
          <p class="provision-form-status" role="status" aria-live="polite" id="provisionFinalStatus"></p>
        </form>
      </section>
      <footer class="provision-page-actions">
        <button type="submit" form="provisionFinalForm" class="provision-next-btn" data-action="next" aria-label="Crear org">
          <i class="fas fa-arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepDeveloper() {
    const roleOpts = [
      { v: 'viewer',      label: 'Viewer — solo lectura' },
      { v: 'contributor', label: 'Contributor — colabora en flows + builder' },
      { v: 'senior',      label: 'Senior — todo lo de contributor + admin/lexicon' },
      { v: 'lead',        label: 'Lead — todo + provisioning de usuarios' }
    ].map((r) =>
      `<option value="${r.v}" ${r.v === 'contributor' ? 'selected' : ''}>${this.escapeHtml(r.label)}</option>`
    ).join('');

    const rankOpts = [
      { v: 'rookie',  label: 'Rookie' },
      { v: 'junior',  label: 'Junior' },
      { v: 'builder', label: 'Builder' },
      { v: 'expert',  label: 'Expert' },
      { v: 'master',  label: 'Master' },
      { v: 'legend',  label: 'Legend' }
    ].map((r) =>
      `<option value="${r.v}" ${r.v === 'rookie' ? 'selected' : ''}>${this.escapeHtml(r.label)}</option>`
    ).join('');

    return `
      <section class="provision-form-card">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 4 · Permisos</span>
          <h2>Rango y rol developer</h2>
          <p>El rango determina el tema visual del portal /dev. El rol determina que puede tocar.</p>
        </header>
        <form id="provisionFinalForm" class="provision-form" novalidate>
          <div class="provision-field">
            <label for="provisionDevRole">Rol developer</label>
            <select id="provisionDevRole" name="dev_role" required>
              ${roleOpts}
            </select>
          </div>
          <div class="provision-field">
            <label for="provisionDevRank">Rango</label>
            <select id="provisionDevRank" name="dev_rank" required>
              ${rankOpts}
            </select>
            <small>El rango es publico (gradient en /dev). El rol es funcional (permisos).</small>
          </div>
          <p class="provision-form-status" role="status" aria-live="polite" id="provisionFinalStatus"></p>
        </form>
      </section>
      <footer class="provision-page-actions">
        <button type="submit" form="provisionFinalForm" class="provision-next-btn" data-action="next" aria-label="Asignar permisos">
          <i class="fas fa-arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepFinalSubmitting() {
    return `
      <section class="provision-verify-card">
        <div class="provision-verify-spinner"><i class="fas fa-circle-notch fa-spin"></i></div>
        <h2>Finalizando...</h2>
        <p>Guardando perfil, organizacion y permisos.</p>
      </section>
    `;
  }

  renderStepFinalDone() {
    const email = this.activeJob?.email || '';
    const r = this.finalizedResult || {};
    let detail = '';
    if (r.user_type === 'member_org') {
      detail = 'Afiliado a la organizacion seleccionada.';
    } else if (r.user_type === 'owner_org') {
      detail = `Organizacion creada (id ${r.organization_id ? r.organization_id.slice(0,8) : '...'}). El usuario es owner.`;
    } else if (r.user_type === 'developer') {
      detail = 'Permisos developer asignados. Ya puede entrar al portal /dev.';
    }
    return `
      <section class="provision-verify-card provision-final-card">
        <span class="provision-verify-icon provision-verify-icon--success">
          <i class="fas fa-check"></i>
        </span>
        <h2>Usuario creado</h2>
        <p><strong>${this.escapeHtml(email)}</strong> ya puede iniciar sesion.</p>
        <p class="provision-verify-meta">${this.escapeHtml(detail)}</p>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Crear otro</button>
      </footer>
    `;
  }

  // ─── Init / navegacion ───────────────────────────────────────────────

  async init() {
    this.supabase = await this.getSupabaseClient();
    if (!this.supabase) {
      this.showError('Supabase no disponible.');
      return;
    }
    this.wireAll();
  }

  goToStep(stepKey) {
    this.currentStep = stepKey;
    const page = this.container.querySelector('.provision-page');
    if (!page) return;
    page.innerHTML = `
      <header class="provision-page-progress">${this.renderProgress()}</header>
      <div class="provision-page-center">${this.renderCurrentStep()}</div>
    `;
    this.wireAll();

    if (stepKey === 'verify') this.startPolling();
    else this.stopPolling();

    // Entrada al step final: cargar orgs si es member_org
    if (stepKey === 'final' && this.userType === 'member_org' && this.orgsList.length === 0) {
      this.loadOrganizations().then(() => {
        // Re-render del center para refrescar el <select>
        if (this.currentStep === 'final' && !this.finalizing && !this.finalized) {
          const center = this.container.querySelector('.provision-page-center');
          if (center) {
            center.innerHTML = this.renderCurrentStep();
            this.wireAll();
          }
        }
      });
    }
  }

  async loadOrganizations() {
    try {
      const { data, error } = await this.supabase
        .from('organizations')
        .select('id, name')
        .is('deleted_at', null)
        .order('name', { ascending: true });
      if (error) throw error;
      this.orgsList = Array.isArray(data) ? data : [];
    } catch (err) {
      this.showNotification(`No se pudo cargar orgs: ${err.message}`, 'error');
      this.orgsList = [];
    }
  }

  wireAll() {
    // Cards de tipo
    this.container.querySelectorAll('[data-user-type]').forEach((card) => {
      this.addEventListener(card, 'click', () => this.selectUserType(card.getAttribute('data-user-type')));
    });

    // Forms: data (step 2) y final (step 4) tienen submit
    const dataForm = this.container.querySelector('#provisionDataForm');
    if (dataForm) this.addEventListener(dataForm, 'submit', (e) => this.handleDataSubmit(e));

    const finalForm = this.container.querySelector('#provisionFinalForm');
    if (finalForm) this.addEventListener(finalForm, 'submit', (e) => this.handleFinalSubmit(e));

    // Back
    const backBtn = this.container.querySelector('[data-action="back"]');
    if (backBtn) this.addEventListener(backBtn, 'click', () => this.handleBack());

    // Next: solo en step 'type' (en steps con form, el submit lo maneja el form)
    if (!dataForm && !finalForm) {
      const nextBtn = this.container.querySelector('[data-action="next"]');
      if (nextBtn) this.addEventListener(nextBtn, 'click', () => this.handleNext());
    }
  }

  selectUserType(key) {
    this.userType = key;
    this.container.querySelectorAll('.provision-type-card').forEach((c) => {
      const active = c.getAttribute('data-user-type') === key;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    const nextBtn = this.container.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.disabled = false;
    // Re-render progress por si el label de 'final' cambia
    const progressHost = this.container.querySelector('.provision-page-progress');
    if (progressHost) progressHost.innerHTML = this.renderProgress();
  }

  handleBack() {
    if (this.currentStep === 'type') {
      if (window.router) window.router.navigate('/dev/dashboard');
      return;
    }
    if (this.currentStep === 'data') {
      this.goToStep('type');
      return;
    }
    if (this.currentStep === 'verify') {
      const ok = confirm(
        'Cancelar la verificacion?\n\nEl usuario queda creado en Supabase pero sin confirmar.'
      );
      if (!ok) return;
      this.stopPolling();
      this.activeJob = null;
      this.goToStep('data');
      return;
    }
    if (this.currentStep === 'final') {
      // Reset completo para crear otro
      this.activeJob = null;
      this.userType = null;
      this.finalized = false;
      this.finalizing = false;
      this.finalizedResult = null;
      this.goToStep('type');
    }
  }

  // ─── Step 4: finalize backend ────────────────────────────────────────

  async handleFinalSubmit(e) {
    e.preventDefault();
    if (this.finalizing) return;

    const fd = new FormData(e.target);
    const payload = { job_id: this.activeJob?.id, user_type: this.userType };

    if (this.userType === 'member_org') {
      const organization_id = (fd.get('organization_id') || '').toString();
      const role = (fd.get('role') || 'viewer').toString();
      if (!organization_id) return this.setFinalStatus('Selecciona una organizacion.', 'error');
      payload.member_org = { organization_id, role };
    } else if (this.userType === 'owner_org') {
      const name = (fd.get('name') || '').toString().trim();
      if (!name) return this.setFinalStatus('El nombre de la organizacion es obligatorio.', 'error');
      payload.owner_org = {
        name,
        brand_name_oficial: (fd.get('brand_name_oficial') || '').toString().trim() || null,
        brand_slogan: (fd.get('brand_slogan') || '').toString().trim() || null,
        logo_url: (fd.get('logo_url') || '').toString().trim() || null
      };
    } else if (this.userType === 'developer') {
      const dev_role = (fd.get('dev_role') || '').toString();
      const dev_rank = (fd.get('dev_rank') || '').toString();
      if (!dev_role) return this.setFinalStatus('Elige un rol developer.', 'error');
      if (!dev_rank) return this.setFinalStatus('Elige un rango.', 'error');
      payload.developer = { dev_role, dev_rank };
    }

    this.finalizing = true;
    // Re-render: muestra spinner submitting
    const center = this.container.querySelector('.provision-page-center');
    if (center) center.innerHTML = this.renderCurrentStep();

    try {
      const { data, error } = await this.supabase.functions.invoke('provision-user-finalize', { body: payload });
      if (error || !data) throw new Error(error?.message || 'Error al finalizar');

      this.finalizing = false;
      this.finalized = true;
      this.finalizedResult = {
        auth_user_id: data.auth_user_id,
        organization_id: data.organization_id,
        user_type: data.user_type
      };
      // Re-render: progress (todos done) + center (done card)
      const progress = this.container.querySelector('.provision-page-progress');
      if (progress) progress.innerHTML = this.renderProgress();
      if (center) {
        center.innerHTML = this.renderCurrentStep();
        this.wireAll();
      }
    } catch (err) {
      this.finalizing = false;
      if (center) {
        center.innerHTML = this.renderCurrentStep();
        this.wireAll();
      }
      this.setFinalStatus(err?.message || String(err), 'error');
    }
  }

  setFinalStatus(text, type) {
    const el = this.container.querySelector('#provisionFinalStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'provision-form-status';
    if (type === 'error') el.classList.add('is-error');
    if (type === 'success') el.classList.add('is-success');
  }

  handleNext() {
    if (this.currentStep === 'type') {
      if (!this.userType) return;
      this.goToStep('data');
    }
  }

  // ─── Step 2: crear usuario en backend ────────────────────────────────

  async handleDataSubmit(e) {
    e.preventDefault();
    if (this._submitting) return;

    const fd = new FormData(e.target);
    const full_name = (fd.get('full_name') || '').toString().trim();
    const email = (fd.get('email') || '').toString().toLowerCase().trim();
    const password = (fd.get('password') || '').toString();

    if (!full_name) return this.setDataStatus('Falta el nombre completo.', 'error');
    if (!email)      return this.setDataStatus('Falta el email.', 'error');
    if (password.length < 8) return this.setDataStatus('La contrasena debe tener al menos 8 caracteres.', 'error');

    this._submitting = true;
    this.setSubmittingUI(true);
    this.setDataStatus('Creando usuario y enviando email...', '');

    const payload = {
      account: {
        full_name,
        email,
        password,
        role: this.platformRoleFor(this.userType),
        default_view_mode: this.defaultViewFor(this.userType),
        is_developer: this.userType === 'developer',
        dev_role: this.userType === 'developer' ? 'contributor' : null
      }
    };

    try {
      const { data, error } = await this.supabase.functions.invoke('provision-user-start', { body: payload });
      if (error || !data) {
        throw new Error(error?.message || 'Error al crear el usuario');
      }
      this.activeJob = {
        id: data.job_id,
        auth_user_id: data.auth_user_id,
        email: data.email,
        status: data.status
      };
      this._submitting = false;
      this.goToStep('verify');
    } catch (err) {
      this._submitting = false;
      this.setSubmittingUI(false);
      this.setDataStatus(err?.message || String(err), 'error');
    }
  }

  setDataStatus(text, type) {
    const el = this.container.querySelector('#provisionDataStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'provision-form-status';
    if (type === 'error') el.classList.add('is-error');
    if (type === 'success') el.classList.add('is-success');
  }

  setSubmittingUI(yes) {
    const btn = this.container.querySelector('[data-action="next"]');
    if (btn) btn.disabled = !!yes;
    const back = this.container.querySelector('[data-action="back"]');
    if (back) back.disabled = !!yes;
    this.container.querySelectorAll('.provision-field input').forEach((i) => {
      i.disabled = !!yes;
    });
  }

  // ─── Step 3: polling de email confirmation ──────────────────────────

  startPolling() {
    this.stopPolling();
    this.pollOnce();
    this.pollTimer = setInterval(() => this.pollOnce(), this.POLL_INTERVAL_MS);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async pollOnce() {
    if (!this.activeJob) return;
    try {
      const { data, error } = await this.supabase.functions.invoke('provision-user-check', {
        body: { job_id: this.activeJob.id }
      });
      if (error || !data?.job) return;
      const job = data.job;
      this.activeJob = { ...this.activeJob, status: job.status };

      if (['email_confirmed', 'finalizing', 'completed'].includes(job.status)) {
        this.stopPolling();
        this.goToStep('final');
        return;
      }
      if (['failed', 'cancelled'].includes(job.status)) {
        this.stopPolling();
        const status = this.container.querySelector('#provisionVerifyStatus');
        if (status) status.textContent = `${this.statusLabel(job.status)}${job.error ? ': ' + job.error : ''}`;
        return;
      }
      const status = this.container.querySelector('#provisionVerifyStatus');
      if (status) status.textContent = `${this.statusLabel(job.status)}...`;
    } catch (_e) {
      // polling reintenta al siguiente tick
    }
  }
}

window.DevLeadUserProvisioningView = DevLeadUserProvisioningView;
