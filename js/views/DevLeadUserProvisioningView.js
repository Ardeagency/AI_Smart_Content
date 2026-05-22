/**
 * DevLeadUserProvisioningView
 * Registro manual de usuarios (solo Lead). Flujo de 3 etapas:
 *   1. Identidad + permisos + organización (formulario)
 *   2. Espera de confirmación de email (polling cada 3s)
 *   3. Finalización automática (perfiles + org + membresía)
 *
 * Backend: Edge Functions provision-user-{start,check,finalize,cancel}.
 * Reanudable: provisioning_jobs guarda el estado entre sesiones.
 */
class DevLeadUserProvisioningView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.stage = 'form'; // 'form' | 'waiting' | 'done'
    this.organizations = [];
    this.pendingJobs = [];
    this.activeJob = null;
    this.pollTimer = null;
    this.POLL_INTERVAL_MS = 3000;
    // Wizard interno del stage 'form'. Cambia con Next/Back; los inputs viven en
    // sub-secciones del MISMO <form>, asi los valores persisten sin innerHTML reset.
    this.wizardStep = 'signup';
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async destroy() {
    this.stopPolling();
    if (this._scrollSpyObserver) {
      this._scrollSpyObserver.disconnect();
      this._scrollSpyObserver = null;
    }
    super.destroy();
  }

  // ─── Render ────────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="dev-lead-container provision-dashboard">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-user-plus"></i> Crear usuario</h1>
            <p class="dev-header-subtitle">Provisiona un usuario nuevo: identidad, cuenta plataforma, organizacion y permisos en un solo paso.</p>
          </div>
        </header>
        <div class="provision-stage-container" id="provisionStage"></div>
      </div>
    `;
  }

  async init() {
    this.supabase = await this.getSupabaseClient();
    if (!this.supabase) {
      this.showError('Supabase no disponible.');
      return;
    }
    await Promise.all([this.loadOrganizations(), this.loadPendingJobs()]);
    this.renderStage();
  }

  renderStage() {
    const host = this.container.querySelector('#provisionStage');
    if (!host) return;

    if (this.stage === 'form') {
      host.innerHTML = this.renderFormStage();
      this.wireFormStage();
    } else if (this.stage === 'waiting') {
      host.innerHTML = this.renderWaitingStage();
      this.wireWaitingStage();
      this.startPolling();
    } else if (this.stage === 'done') {
      host.innerHTML = this.renderDoneStage();
      this.wireDoneStage();
    }
  }

  // ─── Stage 1: form ─────────────────────────────────────────────────────

  /** Catalogo completo de pasos del wizard. Algunos solo aparecen segun el flujo. */
  WIZARD_STEPS = [
    { key: 'signup',     label: 'Sign up',      sub: 'Identidad y rol' },
    { key: 'org',        label: 'Organizacion', sub: 'Sin org / afiliar / crear' },
    { key: 'create_org', label: 'Crear org',    sub: 'Datos principales' },
    { key: 'perms',      label: 'Permisos',     sub: 'Rol en la organizacion' },
    { key: 'review',     label: 'Listo',        sub: 'Confirmar y enviar' }
  ];

  /**
   * Devuelve los pasos visibles del wizard segun el estado actual del form.
   * - Dev (platform_role=dev o dev_role set): solo signup + review
   * - Consumer: signup → org → [create_org si mode=create] → [perms si org] → review
   */
  getActiveWizardSteps() {
    const form = this.container?.querySelector('#provisionForm');
    const get = (name) => (form?.elements[name]?.value || '').trim();

    const isDev = (get('platform_role') === 'dev') || !!get('dev_role');
    if (isDev) {
      return this.WIZARD_STEPS.filter((s) => s.key === 'signup' || s.key === 'review');
    }
    const mode = get('org_mode') || 'none';
    const hasOrg = (mode === 'existing' || mode === 'create');
    return this.WIZARD_STEPS.filter((s) => {
      if (s.key === 'create_org') return mode === 'create';
      if (s.key === 'perms') return hasOrg;
      return true;
    });
  }

  renderFormStage() {
    const pending = this.pendingJobs.filter((j) =>
      ['pending_email_confirmation', 'email_confirmed', 'finalizing'].includes(j.status)
    );

    const pendingHtml = pending.length === 0 ? '' : `
      <section class="provision-pending-banner">
        <header class="provision-pending-banner-head">
          <h2><i class="fas fa-hourglass-half"></i> Jobs en curso <span class="provision-pending-count">${pending.length}</span></h2>
          <p>Provisionamientos pendientes que puedes reanudar.</p>
        </header>
        <div class="provision-pending-cards">
          ${pending.map((j) => `
            <article class="provision-pending-card">
              <header class="provision-pending-card-head">
                <span class="provision-pending-status status-${j.status}">${this.statusLabel(j.status)}</span>
                <span class="provision-pending-date">${this.formatDate(j.created_at)}</span>
              </header>
              <strong class="provision-pending-email" title="${this.escapeHtml(j.email)}">${this.escapeHtml(j.email)}</strong>
              <div class="provision-pending-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-resume-job="${j.id}">
                  <i class="fas fa-play"></i> Reanudar
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-cancel-job="${j.id}">
                  <i class="fas fa-times"></i> Cancelar
                </button>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;

    return `
      ${pendingHtml}

      <form id="provisionForm" class="provision-wizard-shell">

        <!-- Stepper vertical: pasos del wizard. Se actualiza dinamico en updateWizardStepper(). -->
        <aside class="provision-stepper" aria-label="Pasos del wizard">
          <ol class="provision-stepper-list" id="provisionStepperList"></ol>
        </aside>

        <!-- Wizard body: contiene TODAS las sub-secciones en el DOM (los valores
             persisten entre Next/Back porque no innerHTML-reset). Solo .is-current
             es visible via CSS. -->
        <div class="provision-wizard-body" id="provisionWizardBody">

          <!-- ── STEP signup: identidad + plataforma ── -->
          <section class="provision-step-pane" data-pane="signup">
            <header class="provision-pane-head">
              <span class="provision-pane-eyebrow">Paso 1 · Sign up</span>
              <h2 class="provision-pane-title">Datos del usuario</h2>
              <p class="provision-pane-sub">Identidad y rol en plataforma. El Lead define la contrasena ahora; el usuario solo confirmara el email.</p>
            </header>

            <div class="provision-pane-section">
              <h3 class="provision-pane-section-title">Identidad</h3>
              <div class="provision-grid-2">
                <div class="settings-field">
                  <label>Nombre completo</label>
                  <input type="text" name="full_name" placeholder="Ej. Maria Garcia" required>
                </div>
                <div class="settings-field">
                  <label>Email</label>
                  <input type="email" name="email" placeholder="usuario@gmail.com" required>
                </div>
                <div class="settings-field settings-field--full">
                  <label>Contrasena temporal</label>
                  <input type="password" name="password" placeholder="Minimo 8 caracteres" required minlength="8">
                  <small class="field-hint">El usuario podra cambiarla despues de confirmar el email.</small>
                </div>
              </div>
            </div>

            <div class="provision-pane-section">
              <h3 class="provision-pane-section-title">Rol y vista</h3>
              <div class="provision-grid-2">
                <div class="settings-field">
                  <label>Rol plataforma</label>
                  <select name="platform_role">
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="dev">Dev</option>
                  </select>
                </div>
                <div class="settings-field">
                  <label>Vista por defecto</label>
                  <select name="default_view_mode">
                    <option value="user">User</option>
                    <option value="developer">Developer</option>
                  </select>
                </div>
                <div class="settings-field settings-field--full">
                  <label>Dev role (portal developer)</label>
                  <select name="dev_role">
                    <option value="">Ninguno</option>
                    <option value="contributor">Contributor</option>
                    <option value="lead">Lead</option>
                  </select>
                  <small class="field-hint">Si se asigna, el usuario es dev: no se pediran datos de organizacion en los siguientes pasos.</small>
                </div>
              </div>
            </div>

            <footer class="provision-pane-actions">
              <span class="provision-pane-spacer"></span>
              <button type="button" class="btn btn-primary" data-wizard-next>
                Siguiente <i class="fas fa-arrow-right"></i>
              </button>
            </footer>
          </section>

          <!-- ── STEP org: picker de modo ── -->
          <section class="provision-step-pane" data-pane="org">
            <header class="provision-pane-head">
              <span class="provision-pane-eyebrow">Paso 2 · Organizacion</span>
              <h2 class="provision-pane-title">Donde vive este usuario</h2>
              <p class="provision-pane-sub">Afilialo a una organizacion existente, crea una nueva, o dejalo sin organizacion.</p>
            </header>

            <div class="provision-pane-section">
              <div class="provision-mode-picker" role="radiogroup" aria-label="Modo de organizacion">
                <label class="provision-mode-option">
                  <input type="radio" name="org_mode" value="none" checked>
                  <span class="provision-mode-card">
                    <i class="fas fa-user-slash"></i>
                    <strong>Sin organizacion</strong>
                    <small>El usuario no pertenece a ninguna org todavia.</small>
                  </span>
                </label>
                <label class="provision-mode-option">
                  <input type="radio" name="org_mode" value="existing">
                  <span class="provision-mode-card">
                    <i class="fas fa-building"></i>
                    <strong>Afiliar a existente</strong>
                    <small>Elige una organizacion ya creada en el sistema.</small>
                  </span>
                </label>
                <label class="provision-mode-option">
                  <input type="radio" name="org_mode" value="create">
                  <span class="provision-mode-card">
                    <i class="fas fa-plus-circle"></i>
                    <strong>Crear nueva</strong>
                    <small>Construye una organizacion nueva para este usuario.</small>
                  </span>
                </label>
              </div>

              <div class="settings-field settings-field--full" id="existingOrgField" hidden style="margin-top: var(--spacing-md);">
                <label>Organizacion existente</label>
                <select id="existingOrgSelect" name="organization_id">
                  <option value="">Seleccionar...</option>
                  ${this.organizations.map((o) => `<option value="${o.id}">${this.escapeHtml(o.name || o.id)}</option>`).join('')}
                </select>
              </div>

              <!-- Helper field para evitar input vacio cuando se crea nueva (se llenara en el siguiente step) -->
              <input type="hidden" name="new_organization_name" id="newOrgFieldHidden">
            </div>

            <footer class="provision-pane-actions">
              <button type="button" class="btn btn-secondary" data-wizard-back>
                <i class="fas fa-arrow-left"></i> Atras
              </button>
              <button type="button" class="btn btn-primary" data-wizard-next>
                Siguiente <i class="fas fa-arrow-right"></i>
              </button>
            </footer>
          </section>

          <!-- ── STEP create_org: preview lateral + form (Image #8 style) ── -->
          <section class="provision-step-pane provision-pane--create-org" data-pane="create_org">
            <header class="provision-pane-head">
              <span class="provision-pane-eyebrow">Paso 3 · Crear organizacion</span>
              <h2 class="provision-pane-title">Datos de la nueva organizacion</h2>
              <p class="provision-pane-sub">Define la identidad visible. Otros ajustes (plan, autonomia) se editan despues desde Organizaciones.</p>
            </header>

            <div class="provision-create-org-grid">
              <!-- Preview card: live update al teclear -->
              <aside class="provision-org-preview" aria-label="Vista previa de la organizacion">
                <div class="provision-org-preview-logo" id="orgPreviewLogo">
                  <i class="fas fa-building"></i>
                </div>
                <strong class="provision-org-preview-name" id="orgPreviewName">Nueva organizacion</strong>
                <span class="provision-org-preview-brand" id="orgPreviewBrand" hidden></span>
                <p class="provision-org-preview-slogan" id="orgPreviewSlogan">Pon un nombre para empezar.</p>
                <div class="provision-org-preview-meta">
                  <span><i class="fas fa-crown"></i> Owner: usuario nuevo</span>
                </div>
              </aside>

              <!-- Form de datos -->
              <div class="provision-org-form">
                <div class="settings-field">
                  <label>Nombre <span class="form-required">*</span></label>
                  <input type="text" name="new_organization_name" id="newOrgNameInput" placeholder="Ej. ACME Corp" maxlength="120">
                </div>
                <div class="settings-field">
                  <label>Nombre oficial de marca</label>
                  <input type="text" name="new_brand_name_oficial" id="newOrgBrandNameInput" placeholder="Ej. ACME Brand SAS" maxlength="120">
                </div>
                <div class="settings-field">
                  <label>Slogan</label>
                  <input type="text" name="new_brand_slogan" id="newOrgSloganInput" placeholder="Frase de marca" maxlength="200">
                </div>
                <div class="settings-field">
                  <label>Logo URL</label>
                  <input type="url" name="new_logo_url" id="newOrgLogoInput" placeholder="https://...">
                  <small class="field-hint">Aceptamos PNG/JPG/SVG via URL publica. Puedes subir desde Brand mas adelante.</small>
                </div>
              </div>
            </div>

            <footer class="provision-pane-actions">
              <button type="button" class="btn btn-secondary" data-wizard-back>
                <i class="fas fa-arrow-left"></i> Atras
              </button>
              <button type="button" class="btn btn-primary" data-wizard-next>
                Siguiente <i class="fas fa-arrow-right"></i>
              </button>
            </footer>
          </section>

          <!-- ── STEP perms: rol + capabilities ── -->
          <section class="provision-step-pane" data-pane="perms">
            <header class="provision-pane-head">
              <span class="provision-pane-eyebrow">Permisos en la organizacion</span>
              <h2 class="provision-pane-title">Rol y capacidades</h2>
              <p class="provision-pane-sub">Elige un rol base; los checkboxes se precargan con el preset. Ajusta lo que necesites.</p>
            </header>

            <div class="provision-pane-section">
              <div class="settings-field settings-field--full">
                <label>Rol base</label>
                <select id="orgRoleSelect" name="organization_role">
                  ${(window.OrgCapabilities?.ROLES || []).map((r) => `
                    <option value="${r.key}">${this.escapeHtml(r.label)} — ${this.escapeHtml(r.desc)}</option>
                  `).join('')}
                </select>
              </div>
              <div class="settings-field--full">
                ${this.renderCapabilitiesMatrix()}
              </div>
            </div>

            <footer class="provision-pane-actions">
              <button type="button" class="btn btn-secondary" data-wizard-back>
                <i class="fas fa-arrow-left"></i> Atras
              </button>
              <button type="button" class="btn btn-primary" data-wizard-next>
                Siguiente <i class="fas fa-arrow-right"></i>
              </button>
            </footer>
          </section>

          <!-- ── STEP review: resumen + submit ── -->
          <section class="provision-step-pane" data-pane="review">
            <header class="provision-pane-head">
              <span class="provision-pane-eyebrow">Listo</span>
              <h2 class="provision-pane-title">Revisa y confirma</h2>
              <p class="provision-pane-sub">Esto es lo que se va a crear. Si todo se ve bien, envia la verificacion al usuario.</p>
            </header>

            <div class="provision-review-summary" id="provisionReviewSummary"></div>

            <footer class="provision-pane-actions">
              <button type="button" class="btn btn-secondary" data-wizard-back>
                <i class="fas fa-arrow-left"></i> Atras
              </button>
              <button type="submit" class="btn btn-primary provision-submit" id="provisionStartBtn">
                <i class="fas fa-paper-plane"></i> Crear y enviar verificacion
              </button>
            </footer>
            <p id="provisionStatus" class="provision-status" role="status" aria-live="polite"></p>
          </section>

        </div>

      </form>
    `;
  }

  renderCapabilitiesMatrix() {
    const caps = window.OrgCapabilities;
    if (!caps) return '';
    const byArea = caps.CAPABILITIES.reduce((acc, c) => {
      (acc[c.area] = acc[c.area] || []).push(c);
      return acc;
    }, {});
    return `
      <div class="provision-caps-grid">
        ${Object.entries(byArea).map(([areaKey, list]) => {
          const area = caps.AREAS[areaKey] || { label: areaKey, icon: 'fa-circle' };
          return `
            <div class="provision-caps-area">
              <h5 class="provision-caps-area-title"><i class="fas ${area.icon}"></i> ${this.escapeHtml(area.label)}</h5>
              <div class="provision-caps-list">
                ${list.map((c) => `
                  <label class="provision-cap-item">
                    <input type="checkbox" name="cap_${c.key}" data-cap="${c.key}">
                    <span>${this.escapeHtml(c.label)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  applyRolePreset(roleKey) {
    const caps = window.OrgCapabilities;
    if (!caps) return;
    const preset = caps.PRESETS[roleKey];
    if (!preset) return;
    caps.CAPABILITIES.forEach((c) => {
      const input = this.container.querySelector(`input[name="cap_${c.key}"]`);
      if (input) input.checked = preset[c.key] === true;
    });
  }

  wireFormStage() {
    const form = this.container.querySelector('#provisionForm');
    this.addEventListener(form, 'submit', (e) => this.handleStart(e));

    // Org mode picker: radio (no select) — re-toggle conditional fields y update stepper
    form.querySelectorAll('input[name="org_mode"]').forEach((radio) => {
      this.addEventListener(radio, 'change', () => {
        this.updateOrgModeUI();
        this.updateWizardStepper();
      });
    });

    const orgRoleSelect = this.container.querySelector('#orgRoleSelect');
    if (orgRoleSelect) {
      this.addEventListener(orgRoleSelect, 'change', () => this.applyRolePreset(orgRoleSelect.value));
      this.applyRolePreset(orgRoleSelect.value);
    }

    // Live update del preview de la org en step crear-org
    ['newOrgNameInput', 'newOrgBrandNameInput', 'newOrgSloganInput', 'newOrgLogoInput'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'input', () => this.updateOrgPreview());
    });

    // Cualquier cambio en signup (platform_role / dev_role) recomputa pasos activos
    ['platform_role', 'dev_role'].forEach((name) => {
      const el = form.elements[name];
      if (el) this.addEventListener(el, 'change', () => this.updateWizardStepper());
    });

    // Navegacion Next/Back
    this.container.querySelectorAll('[data-wizard-next]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => this.advanceWizard(+1));
    });
    this.container.querySelectorAll('[data-wizard-back]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => this.advanceWizard(-1));
    });

    // Click en step del stepper (solo a pasos ya completados o el actual)
    this.container.querySelectorAll('.provision-stepper-list').forEach((list) => {
      this.addEventListener(list, 'click', (e) => {
        const item = e.target.closest('.provision-step');
        if (!item) return;
        const key = item.getAttribute('data-step');
        if (!key) return;
        if (item.classList.contains('is-clickable')) this.goToWizardStep(key);
      });
    });

    this.container.querySelectorAll('[data-resume-job]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => {
        const id = btn.getAttribute('data-resume-job');
        const job = this.pendingJobs.find((j) => j.id === id);
        if (job) this.resumeJob(job);
      });
    });
    this.container.querySelectorAll('[data-cancel-job]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => {
        const id = btn.getAttribute('data-cancel-job');
        if (confirm('Cancelar este job? Si delete_auth esta activo se borra tambien el auth.user.')) {
          this.cancelJob(id, true);
        }
      });
    });

    // Estado inicial: stepper + preview + step activo
    this.updateOrgModeUI();
    this.updateOrgPreview();
    this.wizardStep = 'signup';
    this.updateWizardStepper();
    this.showWizardPane('signup');
  }

  /** Renderiza el stepper segun los pasos activos del flujo. */
  updateWizardStepper() {
    const list = this.container.querySelector('#provisionStepperList');
    if (!list) return;
    const active = this.getActiveWizardSteps();
    // Si el step actual ya no es valido (ej: cambio de dev a user), saltar al primero activo
    if (!active.find((s) => s.key === this.wizardStep)) {
      this.wizardStep = active[0]?.key || 'signup';
      this.showWizardPane(this.wizardStep);
    }
    const completedKeys = this.getCompletedSteps(active);
    const currentIdx = active.findIndex((s) => s.key === this.wizardStep);

    list.innerHTML = active.map((s, i) => {
      const state = completedKeys.has(s.key) ? 'is-done'
                  : s.key === this.wizardStep ? 'is-active'
                  : 'is-pending';
      const clickable = (state === 'is-done' || i <= currentIdx) ? 'is-clickable' : '';
      const num = i + 1;
      return `
        <li class="provision-step ${state} ${clickable}" data-step="${s.key}">
          <span class="provision-step-marker"><span class="provision-step-num">${num}</span></span>
          <span class="provision-step-meta">
            <span class="provision-step-title">${this.escapeHtml(s.label)}</span>
            <span class="provision-step-sub">${this.escapeHtml(s.sub)}</span>
          </span>
        </li>
      `;
    }).join('');
  }

  /** Pasos cuyas validaciones pasan = se marcan como done en el stepper. */
  getCompletedSteps(active) {
    const form = this.container.querySelector('#provisionForm');
    const done = new Set();
    if (!form) return done;
    const get = (name) => (form.elements[name]?.value || '').trim();
    const password = form.elements['password']?.value || '';

    // signup
    if (get('full_name') && get('email') && password.length >= 8) done.add('signup');

    // org
    const mode = get('org_mode') || 'none';
    if (mode === 'none') done.add('org');
    else if (mode === 'existing' && get('organization_id')) done.add('org');
    else if (mode === 'create') done.add('org'); // se valida en create_org

    // create_org
    if (mode === 'create' && get('new_organization_name')) done.add('create_org');

    // perms
    if (active.some((s) => s.key === 'perms')) {
      if (get('organization_role')) done.add('perms');
    }

    return done;
  }

  showWizardPane(key) {
    this.container.querySelectorAll('.provision-step-pane').forEach((pane) => {
      pane.classList.toggle('is-current', pane.getAttribute('data-pane') === key);
    });
    // Si entramos al review, repintamos el resumen con el estado vigente del form
    if (key === 'review') this.renderReviewSummary();
    // Scroll up cuando cambias de paso
    const body = this.container.querySelector('#provisionWizardBody');
    if (body && body.scrollTo) body.scrollTo({ top: 0, behavior: 'smooth' });
  }

  advanceWizard(delta) {
    const active = this.getActiveWizardSteps();
    const idx = active.findIndex((s) => s.key === this.wizardStep);
    if (idx === -1) return;

    // Validacion al avanzar (no al retroceder)
    if (delta > 0) {
      const err = this.validateWizardStep(this.wizardStep);
      if (err) { this.setStatus(err, 'is-error'); return; }
      this.setStatus('', '');
    }

    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= active.length) return;
    this.wizardStep = active[nextIdx].key;
    this.updateWizardStepper();
    this.showWizardPane(this.wizardStep);
  }

  goToWizardStep(key) {
    const active = this.getActiveWizardSteps();
    if (!active.find((s) => s.key === key)) return;
    this.wizardStep = key;
    this.updateWizardStepper();
    this.showWizardPane(key);
  }

  /** Validacion local del paso actual. Devuelve string error o null si ok. */
  validateWizardStep(key) {
    const form = this.container.querySelector('#provisionForm');
    if (!form) return null;
    const get = (name) => (form.elements[name]?.value || '').trim();
    const password = form.elements['password']?.value || '';

    if (key === 'signup') {
      if (!get('full_name')) return 'Falta el nombre completo.';
      if (!get('email')) return 'Falta el email.';
      if (password.length < 8) return 'La contrasena debe tener al menos 8 caracteres.';
    }
    if (key === 'org') {
      const mode = get('org_mode') || 'none';
      if (mode === 'existing' && !get('organization_id')) return 'Selecciona la organizacion existente.';
    }
    if (key === 'create_org') {
      if (!get('new_organization_name')) return 'Pon un nombre para la organizacion.';
    }
    if (key === 'perms') {
      if (!get('organization_role')) return 'Elige un rol base.';
    }
    return null;
  }

  /** Live preview del card de la izquierda en el step crear-org. */
  updateOrgPreview() {
    const name = this.container.querySelector('#newOrgNameInput')?.value?.trim() || '';
    const brand = this.container.querySelector('#newOrgBrandNameInput')?.value?.trim() || '';
    const slogan = this.container.querySelector('#newOrgSloganInput')?.value?.trim() || '';
    const logo = this.container.querySelector('#newOrgLogoInput')?.value?.trim() || '';

    const nameEl = this.container.querySelector('#orgPreviewName');
    const brandEl = this.container.querySelector('#orgPreviewBrand');
    const sloganEl = this.container.querySelector('#orgPreviewSlogan');
    const logoEl = this.container.querySelector('#orgPreviewLogo');

    if (nameEl) {
      nameEl.textContent = name || 'Nueva organizacion';
      nameEl.classList.toggle('is-empty', !name);
    }
    if (brandEl) {
      if (brand) {
        brandEl.textContent = brand;
        brandEl.hidden = false;
      } else {
        brandEl.hidden = true;
      }
    }
    if (sloganEl) {
      sloganEl.textContent = slogan || 'Pon un nombre para empezar.';
      sloganEl.classList.toggle('is-empty', !slogan);
    }
    if (logoEl) {
      if (logo && /^https?:\/\//i.test(logo)) {
        logoEl.innerHTML = `<img src="${this.escapeHtml(logo)}" alt="${this.escapeHtml(name || 'Logo')}" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fas fa-building'}))">`;
      } else {
        logoEl.innerHTML = '<i class="fas fa-building"></i>';
      }
    }
  }

  /** Pinta el card de resumen del step final. */
  renderReviewSummary() {
    const host = this.container.querySelector('#provisionReviewSummary');
    if (!host) return;
    const form = this.container.querySelector('#provisionForm');
    const get = (name) => (form.elements[name]?.value || '').trim();
    const password = form.elements['password']?.value || '';

    const mode = get('org_mode') || 'none';
    let orgLine = 'Sin organizacion';
    if (mode === 'existing') {
      const org = this.organizations.find((o) => o.id === get('organization_id'));
      orgLine = `Afiliar a ${org?.name || get('organization_id') || '—'}`;
    } else if (mode === 'create') {
      orgLine = `Crear nueva: ${get('new_organization_name') || '—'}`;
    }

    const role = get('platform_role') || 'user';
    const dev = get('dev_role') || 'ninguno';
    const orgRole = mode !== 'none' ? (get('organization_role') || '—') : null;

    const checks = form.querySelectorAll('input[type="checkbox"][data-cap]');
    const totalCaps = checks.length;
    const onCaps = Array.from(checks).filter((c) => c.checked).length;

    host.innerHTML = `
      <div class="provision-review-grid">
        <div class="provision-review-tile">
          <span class="provision-review-label"><i class="fas fa-user"></i> Usuario</span>
          <strong>${this.escapeHtml(get('full_name') || 'Sin nombre')}</strong>
          <span>${this.escapeHtml(get('email') || 'sin email')}</span>
          <span class="provision-review-meta">contrasena ${password ? '✓ definida' : 'pendiente'}</span>
        </div>
        <div class="provision-review-tile">
          <span class="provision-review-label"><i class="fas fa-id-badge"></i> Plataforma</span>
          <strong>${this.escapeHtml(role)}</strong>
          <span>vista por defecto: ${this.escapeHtml(get('default_view_mode') || 'user')}</span>
          <span class="provision-review-meta">dev role: ${this.escapeHtml(dev)}</span>
        </div>
        <div class="provision-review-tile">
          <span class="provision-review-label"><i class="fas fa-building"></i> Organizacion</span>
          <strong>${this.escapeHtml(orgLine)}</strong>
          ${orgRole ? `<span>rol: ${this.escapeHtml(orgRole)}</span>` : '<span class="provision-review-meta">sin rol</span>'}
          ${mode !== 'none' ? `<span class="provision-review-meta">${onCaps}/${totalCaps} capacidades activas</span>` : ''}
        </div>
      </div>
    `;
  }

  /** Toggle del field "organizacion existente" segun el radio org_mode seleccionado. */
  updateOrgModeUI() {
    const form = this.container.querySelector('#provisionForm');
    if (!form) return;
    const mode = (form.elements['org_mode']?.value) || 'none';
    const existingField = this.container.querySelector('#existingOrgField');
    if (existingField) existingField.hidden = mode !== 'existing';
  }

  async handleStart(event) {
    event.preventDefault();
    const payload = this.collectPayload();
    if (!this.validatePayload(payload)) return;

    const submitBtn = this.container.querySelector('#provisionStartBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    this.setStatus('Creando usuario y enviando email…', '');

    try {
      const { data, error } = await this.supabase.functions.invoke('provision-user-start', { body: payload });
      if (error || !data) throw new Error(error?.message || 'Error al iniciar provisioning');

      this.activeJob = {
        id: data.job_id,
        auth_user_id: data.auth_user_id,
        email: data.email,
        status: data.status,
      };
      this.stage = 'waiting';
      this.renderStage();
    } catch (err) {
      this.setStatus(`Error: ${err.message}`, 'is-error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Crear y enviar verificación';
    }
  }

  collectPayload() {
    const form = this.container.querySelector('#provisionForm');
    const value = (name) => (form.elements[name]?.value || '').trim();
    const checked = (name) => !!form.elements[name]?.checked;

    const caps = window.OrgCapabilities;
    const capabilities = {};
    if (caps) {
      caps.CAPABILITIES.forEach((c) => {
        capabilities[c.key] = checked(`cap_${c.key}`);
      });
    }

    const devRole = value('dev_role') || null;

    return {
      account: {
        full_name: value('full_name'),
        email: value('email').toLowerCase(),
        password: form.elements['password']?.value || '',
        role: value('platform_role') || 'user',
        default_view_mode: value('default_view_mode') || 'user',
        is_developer: devRole !== null && devRole !== '',
        dev_role: devRole,
      },
      organization: {
        mode: value('org_mode') || 'none',
        organization_id: value('organization_id') || null,
        new_organization_name: value('new_organization_name') || null,
        new_brand_name_oficial: value('new_brand_name_oficial') || null,
        new_brand_slogan: value('new_brand_slogan') || null,
        new_logo_url: value('new_logo_url') || null,
        organization_role: value('organization_role') || null,
        capabilities,
      },
    };
  }

  validatePayload(p) {
    if (!p.account.full_name || !p.account.email || !p.account.password) {
      this.setStatus('Completa nombre, email y contraseña.', 'is-error');
      return false;
    }
    if (p.account.password.length < 8) {
      this.setStatus('Contraseña mínima de 8 caracteres.', 'is-error');
      return false;
    }
    if (p.organization.mode === 'existing' && !p.organization.organization_id) {
      this.setStatus('Selecciona la organización existente.', 'is-error');
      return false;
    }
    if (p.organization.mode === 'create' && !p.organization.new_organization_name) {
      this.setStatus('Indica el nombre de la nueva organización.', 'is-error');
      return false;
    }
    return true;
  }

  // ─── Stage 2: waiting ──────────────────────────────────────────────────

  renderWaitingStage() {
    const job = this.activeJob || {};
    return `
      <section class="provision-card provision-card--waiting">
        <header class="provision-card-head">
          <span class="provision-card-icon"><i class="fas fa-envelope-open-text"></i></span>
          <div>
            <h3>Esperando confirmacion</h3>
            <p>
              Enviamos un email de verificacion a <strong>${this.escapeHtml(job.email || '')}</strong>.
              Puedes cerrar esta vista y reanudar mas tarde.
            </p>
          </div>
        </header>
        <div class="provision-card-body">
          <div class="provision-waiting-indicator">
            <div class="provision-spinner"><i class="fas fa-circle-notch fa-spin"></i></div>
            <div class="provision-waiting-status" id="provisionWaitingStatus">
              Esperando que el usuario confirme su email...
            </div>
            <div class="provision-waiting-meta" id="provisionWaitingMeta">
              Job ID: <code>${this.escapeHtml(job.id || '')}</code>
            </div>
          </div>
        </div>
        <footer class="provision-action-bar">
          <p id="provisionStatus" class="provision-status" role="status" aria-live="polite"></p>
          <div class="provision-actions-right">
            <button type="button" class="btn btn-secondary" id="provisionBackBtn">
              <i class="fas fa-arrow-left"></i> Volver al formulario
            </button>
            <button type="button" class="btn btn-danger" id="provisionCancelBtn">
              <i class="fas fa-times"></i> Cancelar provisioning
            </button>
          </div>
        </footer>
      </section>
    `;
  }

  wireWaitingStage() {
    const backBtn   = this.container.querySelector('#provisionBackBtn');
    const cancelBtn = this.container.querySelector('#provisionCancelBtn');
    this.addEventListener(backBtn, 'click', () => {
      this.stopPolling();
      this.stage = 'form';
      this.loadPendingJobs().then(() => this.renderStage());
    });
    this.addEventListener(cancelBtn, 'click', () => {
      if (!this.activeJob) return;
      if (confirm('¿Cancelar el provisioning de ' + this.activeJob.email + '?')) {
        this.cancelJob(this.activeJob.id, true).then(() => {
          this.stopPolling();
          this.activeJob = null;
          this.stage = 'form';
          this.loadPendingJobs().then(() => this.renderStage());
        });
      }
    });
  }

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
        body: { job_id: this.activeJob.id },
      });
      if (error || !data?.job) return;

      const job = data.job;
      this.activeJob = { ...this.activeJob, status: job.status };

      if (job.status === 'email_confirmed') {
        this.stopPolling();
        await this.finalize();
      } else if (job.status === 'failed' || job.status === 'cancelled') {
        this.stopPolling();
        this.setStatus(`Job en estado ${job.status}: ${job.error || ''}`, 'is-error');
      } else {
        const status = this.container.querySelector('#provisionWaitingStatus');
        if (status) status.textContent = `Estado: ${this.statusLabel(job.status)}`;
      }
    } catch (_e) { /* swallow; el polling reintenta */ }
  }

  async finalize() {
    const statusEl = this.container.querySelector('#provisionWaitingStatus');
    if (statusEl) statusEl.textContent = 'Email confirmado. Finalizando provisioning…';

    try {
      const { data, error } = await this.supabase.functions.invoke('provision-user-finalize', {
        body: { job_id: this.activeJob.id },
      });
      if (error || !data) throw new Error(error?.message || 'finalize falló');

      this.activeJob = { ...this.activeJob, ...data };
      this.stage = 'done';
      this.renderStage();
    } catch (err) {
      this.setStatus(`Finalize error: ${err.message}`, 'is-error');
    }
  }

  // ─── Stage 3: done ─────────────────────────────────────────────────────

  renderDoneStage() {
    const j = this.activeJob || {};
    return `
      <section class="provision-card provision-card--done">
        <header class="provision-card-head">
          <span class="provision-card-icon provision-card-icon--success"><i class="fas fa-check-circle"></i></span>
          <div>
            <h3>Usuario aprovisionado</h3>
            <p>Cuenta creada y verificada. Ya puede iniciar sesion.</p>
          </div>
        </header>
        <div class="provision-card-body">
          <div class="provision-done-summary">
            <div><strong>Email:</strong> ${this.escapeHtml(j.email || '')}</div>
            <div><strong>Auth user:</strong> <code>${this.escapeHtml(j.auth_user_id || '')}</code></div>
            ${j.organization_id ? `<div><strong>Organizacion:</strong> <code>${this.escapeHtml(j.organization_id)}</code></div>` : ''}
          </div>
        </div>
        <footer class="provision-action-bar">
          <p class="provision-status"></p>
          <button type="button" class="btn btn-primary" id="provisionResetBtn">
            <i class="fas fa-user-plus"></i> Provisionar otro
          </button>
        </footer>
      </section>
    `;
  }

  wireDoneStage() {
    const btn = this.container.querySelector('#provisionResetBtn');
    this.addEventListener(btn, 'click', () => {
      this.activeJob = null;
      this.stage = 'form';
      this.loadPendingJobs().then(() => this.renderStage());
    });
  }

  // ─── Resume / cancel ──────────────────────────────────────────────────

  async resumeJob(job) {
    this.activeJob = {
      id: job.id,
      auth_user_id: job.auth_user_id,
      email: job.email,
      status: job.status,
    };
    if (job.status === 'email_confirmed') {
      this.stage = 'waiting';
      this.renderStage();
      await this.finalize();
    } else if (job.status === 'finalizing') {
      this.stage = 'waiting';
      this.renderStage();
      await this.finalize();
    } else {
      this.stage = 'waiting';
      this.renderStage();
    }
  }

  async cancelJob(jobId, deleteAuth = false) {
    try {
      await this.supabase.functions.invoke('provision-user-cancel', {
        body: { job_id: jobId, delete_auth: deleteAuth },
      });
      await this.loadPendingJobs();
      if (this.stage === 'form') this.renderStage();
    } catch (err) {
      this.showNotification(`Error cancelando job: ${err.message}`, 'error');
    }
  }

  // ─── Data fetch ────────────────────────────────────────────────────────

  async loadOrganizations() {
    const { data } = await this.supabase
      .from('organizations')
      .select('id, name')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    this.organizations = Array.isArray(data) ? data : [];
  }

  async loadPendingJobs() {
    const { data } = await this.supabase
      .from('provisioning_jobs')
      .select('id, email, status, created_at, auth_user_id')
      .in('status', ['pending_email_confirmation', 'email_confirmed', 'finalizing'])
      .order('created_at', { ascending: false })
      .limit(20);
    this.pendingJobs = Array.isArray(data) ? data : [];
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  statusLabel(status) {
    return {
      pending_email_confirmation: 'Esperando email',
      email_confirmed: 'Email confirmado',
      finalizing: 'Finalizando',
      completed: 'Completado',
      failed: 'Falló',
      cancelled: 'Cancelado',
    }[status] || status;
  }

  formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  setStatus(text, klass) {
    const el = this.container.querySelector('#provisionStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-success', 'is-error');
    if (klass) el.classList.add(klass);
  }
}

window.DevLeadUserProvisioningView = DevLeadUserProvisioningView;
