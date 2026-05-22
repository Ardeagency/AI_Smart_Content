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

      <form id="provisionForm" class="provision-shell">

        <!-- Stepper vertical: tabla de contenidos navegable -->
        <aside class="provision-stepper" aria-label="Secciones del formulario">
          <ol class="provision-stepper-list">
            <li class="provision-step is-active" data-step="identity" aria-current="step">
              <a class="provision-step-link" href="#provSecIdentity">
                <span class="provision-step-marker"><span class="provision-step-num">1</span></span>
                <span class="provision-step-meta">
                  <span class="provision-step-title">Identidad</span>
                  <span class="provision-step-sub">Nombre, email, password</span>
                </span>
              </a>
            </li>
            <li class="provision-step" data-step="platform">
              <a class="provision-step-link" href="#provSecPlatform">
                <span class="provision-step-marker"><span class="provision-step-num">2</span></span>
                <span class="provision-step-meta">
                  <span class="provision-step-title">Plataforma</span>
                  <span class="provision-step-sub">Rol y vista por defecto</span>
                </span>
              </a>
            </li>
            <li class="provision-step" data-step="organization">
              <a class="provision-step-link" href="#provSecOrg">
                <span class="provision-step-marker"><span class="provision-step-num">3</span></span>
                <span class="provision-step-meta">
                  <span class="provision-step-title">Organizacion</span>
                  <span class="provision-step-sub">Sin org / existente / nueva</span>
                </span>
              </a>
            </li>
            <li class="provision-step is-optional" data-step="perms">
              <a class="provision-step-link" href="#provSecPerms">
                <span class="provision-step-marker"><span class="provision-step-num">4</span></span>
                <span class="provision-step-meta">
                  <span class="provision-step-title">Permisos</span>
                  <span class="provision-step-sub">Solo si hay organizacion</span>
                </span>
              </a>
            </li>
          </ol>
        </aside>

        <!-- Form principal: secciones flow con anchors para el stepper -->
        <div class="provision-form-body" id="provisionFormBody">

          <section class="provision-section" id="provSecIdentity" data-step="identity">
            <header class="provision-section-head">
              <span class="provision-section-eyebrow">Paso 1</span>
              <h2 class="provision-section-title">Identidad del usuario</h2>
              <p class="provision-section-sub">El Lead define la contrasena ahora; el usuario solo confirma el email.</p>
            </header>
            <div class="provision-section-grid">
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
          </section>

          <section class="provision-section" id="provSecPlatform" data-step="platform">
            <header class="provision-section-head">
              <span class="provision-section-eyebrow">Paso 2</span>
              <h2 class="provision-section-title">Cuenta de plataforma</h2>
              <p class="provision-section-sub">Que rol tiene a nivel sistema y que vista ve por defecto al entrar.</p>
            </header>
            <div class="provision-section-grid">
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
              </div>
            </div>
          </section>

          <section class="provision-section" id="provSecOrg" data-step="organization">
            <header class="provision-section-head">
              <span class="provision-section-eyebrow">Paso 3</span>
              <h2 class="provision-section-title">Organizacion</h2>
              <p class="provision-section-sub">Asigna el usuario a una organizacion existente, crea una nueva, o dejalo suelto.</p>
            </header>
            <div class="provision-section-grid">
              <div class="settings-field settings-field--full">
                <label>Modo</label>
                <select id="orgModeSelect" name="org_mode">
                  <option value="none">Sin organizacion</option>
                  <option value="existing">Afiliar a existente</option>
                  <option value="create">Crear nueva</option>
                </select>
              </div>
              <div class="settings-field settings-field--full" id="existingOrgField" hidden>
                <label>Organizacion existente</label>
                <select id="existingOrgSelect" name="organization_id">
                  <option value="">Seleccionar...</option>
                  ${this.organizations.map((o) => `<option value="${o.id}">${this.escapeHtml(o.name || o.id)}</option>`).join('')}
                </select>
              </div>
              <div class="settings-field settings-field--full" id="newOrgField" hidden>
                <label>Nombre nueva organizacion</label>
                <input type="text" name="new_organization_name" placeholder="Ej. ACME Corp">
              </div>
            </div>
          </section>

          <section class="provision-section" id="provSecPerms" data-step="perms" hidden>
            <header class="provision-section-head">
              <span class="provision-section-eyebrow">Paso 4 — opcional</span>
              <h2 class="provision-section-title">Rol y permisos en la organizacion</h2>
              <p class="provision-section-sub">Elige un rol base; los checkboxes precargan el preset. Ajusta lo que necesites.</p>
            </header>
            <div class="provision-section-grid">
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
          </section>

        </div>

        <!-- Summary panel: live preview de lo que se va a crear + CTA primario -->
        <aside class="provision-summary" aria-label="Resumen de lo que se va a crear">
          <header class="provision-summary-head">
            <h3>Resumen</h3>
            <p>Live preview de lo que se creara al enviar.</p>
          </header>

          <div class="provision-summary-body" id="provisionSummaryBody">

            <div class="provision-summary-tile">
              <span class="provision-summary-tile-label"><i class="fas fa-user"></i> Usuario</span>
              <strong class="provision-summary-tile-value" data-summary="full_name">—</strong>
              <span class="provision-summary-tile-meta" data-summary="email">sin email</span>
            </div>

            <div class="provision-summary-tile">
              <span class="provision-summary-tile-label"><i class="fas fa-id-badge"></i> Plataforma</span>
              <strong class="provision-summary-tile-value" data-summary="platform_role">user</strong>
              <span class="provision-summary-tile-meta">
                vista: <span data-summary="default_view_mode">user</span>
                <span class="provision-summary-divider"></span>
                dev: <span data-summary="dev_role">ninguno</span>
              </span>
            </div>

            <div class="provision-summary-tile">
              <span class="provision-summary-tile-label"><i class="fas fa-building"></i> Organizacion</span>
              <strong class="provision-summary-tile-value" data-summary="org_target">Sin organizacion</strong>
              <span class="provision-summary-tile-meta" data-summary="org_role" hidden></span>
            </div>

            <div class="provision-summary-tile" data-summary-block="caps" hidden>
              <span class="provision-summary-tile-label"><i class="fas fa-user-shield"></i> Permisos</span>
              <strong class="provision-summary-tile-value" data-summary="caps_count">0 capacidades</strong>
              <span class="provision-summary-tile-meta">marca los checkboxes en el paso 4</span>
            </div>
          </div>

          <footer class="provision-summary-foot">
            <p id="provisionStatus" class="provision-status" role="status" aria-live="polite"></p>
            <button type="submit" class="btn btn-primary provision-submit" id="provisionStartBtn">
              <i class="fas fa-paper-plane"></i> Crear y enviar verificacion
            </button>
            <p class="provision-summary-fineprint">El usuario recibira un email para confirmar y activar su cuenta.</p>
          </footer>
        </aside>

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
    const orgMode = this.container.querySelector('#orgModeSelect');
    this.addEventListener(form, 'submit', (e) => this.handleStart(e));
    this.addEventListener(orgMode, 'change', () => {
      this.updateOrgModeUI();
      this.updateSummary();
      this.updateStepperState();
    });

    const orgRoleSelect = this.container.querySelector('#orgRoleSelect');
    if (orgRoleSelect) {
      this.addEventListener(orgRoleSelect, 'change', () => {
        this.applyRolePreset(orgRoleSelect.value);
        this.updateSummary();
      });
      this.applyRolePreset(orgRoleSelect.value); // initial preset
    }
    this.updateOrgModeUI();

    // Live summary: cada cambio en el form actualiza el panel derecho + stepper
    if (form) {
      this.addEventListener(form, 'input', () => {
        this.updateSummary();
        this.updateStepperState();
      });
      this.addEventListener(form, 'change', () => {
        this.updateSummary();
        this.updateStepperState();
      });
    }

    // Scroll spy: marcar paso activo segun la seccion mas visible
    this.setupStepperScrollSpy();

    // Click en step lleva al usuario a esa seccion del form
    this.container.querySelectorAll('.provision-step-link').forEach((link) => {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href')?.replace(/^#/, '');
        const target = targetId ? this.container.querySelector('#' + targetId) : null;
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // Estado inicial del summary
    this.updateSummary();
    this.updateStepperState();
  }

  /**
   * Actualiza el panel de resumen lateral en base al estado actual del form.
   * Read-only: solo lee values, no muta nada del form.
   */
  updateSummary() {
    const form = this.container.querySelector('#provisionForm');
    if (!form) return;
    const val = (name) => (form.elements[name]?.value || '').trim();

    const setText = (key, text, opts = {}) => {
      const el = this.container.querySelector(`[data-summary="${key}"]`);
      if (!el) return;
      el.textContent = text;
      el.classList.toggle('is-empty', opts.empty === true);
    };

    const fullName = val('full_name');
    const email = val('email');
    setText('full_name', fullName || 'Sin nombre', { empty: !fullName });
    setText('email', email || 'sin email', { empty: !email });

    const role = val('platform_role') || 'user';
    const view = val('default_view_mode') || 'user';
    const dev = val('dev_role') || 'ninguno';
    setText('platform_role', role);
    setText('default_view_mode', view);
    setText('dev_role', dev);

    const mode = val('org_mode') || 'none';
    let orgTarget = 'Sin organizacion';
    if (mode === 'existing') {
      const orgId = val('organization_id');
      const org = this.organizations.find((o) => o.id === orgId);
      orgTarget = org ? (org.name || 'Org seleccionada') : 'Selecciona una org';
    } else if (mode === 'create') {
      const newName = val('new_organization_name');
      orgTarget = newName ? `Nueva: ${newName}` : 'Nombre pendiente';
    }
    setText('org_target', orgTarget, { empty: mode !== 'none' && orgTarget.startsWith('Selecciona') });

    const orgRole = val('organization_role');
    const orgRoleEl = this.container.querySelector('[data-summary="org_role"]');
    if (orgRoleEl) {
      if (mode !== 'none' && orgRole) {
        orgRoleEl.textContent = `Rol: ${orgRole}`;
        orgRoleEl.hidden = false;
      } else {
        orgRoleEl.hidden = true;
      }
    }

    // Caps count
    const capsBlock = this.container.querySelector('[data-summary-block="caps"]');
    const capsCountEl = this.container.querySelector('[data-summary="caps_count"]');
    if (capsBlock && capsCountEl) {
      const showCaps = mode !== 'none';
      capsBlock.hidden = !showCaps;
      if (showCaps) {
        const checks = form.querySelectorAll('input[type="checkbox"][data-cap]');
        const total = checks.length;
        const on = Array.from(checks).filter((c) => c.checked).length;
        capsCountEl.textContent = `${on}/${total} capacidades`;
      }
    }
  }

  /**
   * Marca el estado de cada step en el stepper: done si la seccion esta "completa"
   * (todos los required llenos), o pending si no.
   */
  updateStepperState() {
    const form = this.container.querySelector('#provisionForm');
    if (!form) return;
    const val = (name) => (form.elements[name]?.value || '').trim();

    const completeness = {
      identity: !!(val('full_name') && val('email') && (form.elements['password']?.value || '').length >= 8),
      platform: true, // siempre tiene defaults
      organization: (() => {
        const m = val('org_mode') || 'none';
        if (m === 'none') return true;
        if (m === 'existing') return !!val('organization_id');
        if (m === 'create') return !!val('new_organization_name');
        return false;
      })(),
      perms: (val('org_mode') || 'none') === 'none' ? null : true // null = N/A
    };

    this.container.querySelectorAll('.provision-step').forEach((stepEl) => {
      const key = stepEl.getAttribute('data-step');
      stepEl.classList.remove('is-done', 'is-pending', 'is-na');
      const state = completeness[key];
      if (state === true) stepEl.classList.add('is-done');
      else if (state === null) stepEl.classList.add('is-na');
      else stepEl.classList.add('is-pending');
    });
  }

  /** Intersection observer: marca como is-active el step cuya seccion es la mas visible en el viewport */
  setupStepperScrollSpy() {
    if (this._scrollSpyObserver) {
      this._scrollSpyObserver.disconnect();
    }
    const body = this.container.querySelector('#provisionFormBody');
    if (!body) return;
    const sections = Array.from(this.container.querySelectorAll('.provision-section'));
    if (sections.length === 0) return;

    const setActive = (stepKey) => {
      this.container.querySelectorAll('.provision-step').forEach((s) => {
        s.classList.toggle('is-active', s.getAttribute('data-step') === stepKey);
      });
    };

    this._scrollSpyObserver = new IntersectionObserver((entries) => {
      // Toma la entry con mayor intersectionRatio
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) {
        const key = visible.target.getAttribute('data-step');
        if (key) setActive(key);
      }
    }, { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.2, 0.5, 0.8] });

    sections.forEach((s) => this._scrollSpyObserver.observe(s));
  }

  updateOrgModeUI() {
    const mode = this.container.querySelector('#orgModeSelect')?.value || 'none';
    const existingField = this.container.querySelector('#existingOrgField');
    const newOrgField   = this.container.querySelector('#newOrgField');
    const permsSection  = this.container.querySelector('#provSecPerms');
    const permsStep     = this.container.querySelector('.provision-step[data-step="perms"]');
    if (!existingField || !newOrgField || !permsSection) return;
    const orgEnabled = mode === 'existing' || mode === 'create';
    existingField.hidden = mode !== 'existing';
    newOrgField.hidden   = mode !== 'create';
    permsSection.hidden  = !orgEnabled;
    if (permsStep) permsStep.classList.toggle('is-disabled', !orgEnabled);
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
