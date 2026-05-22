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

      <form id="provisionForm" class="provision-form">
        <div class="provision-grid">

          <section class="provision-card provision-card--identity">
            <header class="provision-card-head">
              <span class="provision-card-icon"><i class="fas fa-user"></i></span>
              <div>
                <h3>Identidad</h3>
                <p>Quien sera este usuario.</p>
              </div>
            </header>
            <div class="provision-card-body">
              <div class="settings-field">
                <label>Nombre completo</label>
                <input type="text" name="full_name" placeholder="Ej. Maria Garcia" required>
              </div>
              <div class="settings-field">
                <label>Email</label>
                <input type="email" name="email" placeholder="usuario@gmail.com" required>
              </div>
              <div class="settings-field">
                <label>Contrasena temporal</label>
                <input type="password" name="password" placeholder="Minimo 8 caracteres" required minlength="8">
                <small class="field-hint">El Lead la define ahora; el usuario solo confirmara el email.</small>
              </div>
            </div>
          </section>

          <section class="provision-card provision-card--platform">
            <header class="provision-card-head">
              <span class="provision-card-icon"><i class="fas fa-id-badge"></i></span>
              <div>
                <h3>Cuenta plataforma</h3>
                <p>Rol y vista por defecto.</p>
              </div>
            </header>
            <div class="provision-card-body">
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
              <div class="settings-field">
                <label>Dev role (portal developer)</label>
                <select name="dev_role">
                  <option value="">Ninguno</option>
                  <option value="contributor">Contributor</option>
                  <option value="lead">Lead</option>
                </select>
              </div>
            </div>
          </section>

          <section class="provision-card provision-card--org">
            <header class="provision-card-head">
              <span class="provision-card-icon"><i class="fas fa-building"></i></span>
              <div>
                <h3>Organizacion</h3>
                <p>Donde vive este usuario.</p>
              </div>
            </header>
            <div class="provision-card-body">
              <div class="settings-field">
                <label>Modo</label>
                <select id="orgModeSelect" name="org_mode">
                  <option value="none">Sin organizacion</option>
                  <option value="existing">Afiliar a existente</option>
                  <option value="create">Crear nueva</option>
                </select>
              </div>
              <div class="settings-field" id="existingOrgField" hidden>
                <label>Organizacion existente</label>
                <select id="existingOrgSelect" name="organization_id">
                  <option value="">Seleccionar...</option>
                  ${this.organizations.map((o) => `<option value="${o.id}">${this.escapeHtml(o.name || o.id)}</option>`).join('')}
                </select>
              </div>
              <div class="settings-field" id="newOrgField" hidden>
                <label>Nombre nueva organizacion</label>
                <input type="text" name="new_organization_name" placeholder="Ej. ACME Corp">
              </div>
            </div>
          </section>

          <section class="provision-card provision-card--perms" id="orgPermissionsSection" hidden>
            <header class="provision-card-head">
              <span class="provision-card-icon"><i class="fas fa-user-shield"></i></span>
              <div>
                <h3>Rol y permisos en la organizacion</h3>
                <p>Elige un rol base; los checkboxes precargan el preset. Puedes ajustarlos uno a uno.</p>
              </div>
            </header>
            <div class="provision-card-body">
              <div class="settings-field">
                <label>Rol base</label>
                <select id="orgRoleSelect" name="organization_role">
                  ${(window.OrgCapabilities?.ROLES || []).map((r) => `
                    <option value="${r.key}">${this.escapeHtml(r.label)} — ${this.escapeHtml(r.desc)}</option>
                  `).join('')}
                </select>
              </div>

              ${this.renderCapabilitiesMatrix()}
            </div>
          </section>

        </div>

        <footer class="provision-action-bar">
          <p id="provisionStatus" class="provision-status" role="status" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary" id="provisionStartBtn">
            <i class="fas fa-paper-plane"></i> Crear y enviar verificacion
          </button>
        </footer>
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
    this.addEventListener(orgMode, 'change', () => this.updateOrgModeUI());

    const orgRoleSelect = this.container.querySelector('#orgRoleSelect');
    if (orgRoleSelect) {
      this.addEventListener(orgRoleSelect, 'change', () => this.applyRolePreset(orgRoleSelect.value));
      this.applyRolePreset(orgRoleSelect.value); // initial preset
    }
    this.updateOrgModeUI();

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
        if (confirm('¿Cancelar este job? Si delete_auth está activo se borra también el auth.user.')) {
          this.cancelJob(id, true);
        }
      });
    });
  }

  updateOrgModeUI() {
    const mode = this.container.querySelector('#orgModeSelect')?.value || 'none';
    const existingField = this.container.querySelector('#existingOrgField');
    const newOrgField   = this.container.querySelector('#newOrgField');
    const permsSection  = this.container.querySelector('#orgPermissionsSection');
    if (!existingField || !newOrgField || !permsSection) return;
    existingField.hidden = mode !== 'existing';
    newOrgField.hidden   = mode !== 'create';
    permsSection.hidden  = !(mode === 'existing' || mode === 'create');
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
