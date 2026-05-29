/**
 * DevLeadUserProvisioningView
 *
 * /dev/provisioning/users — flujo de creacion de usuario (rebuild 2026-05-29).
 *
 * Pasos:
 *   1. Tipo            — Consumer / Developer / Admin (cards)
 *   2. Datos           — Sign-up real: name/email/password → provision-user-start
 *   3. Verificacion    — espera email confirm, polling cada 3s
 *   4. Final (dinamico)— Afiliar (consumer) / Crear org (admin) / Permisos (developer)
 *
 * Layout: progress bar arriba + contenido centrado vertical+horizontal sobre
 * dot canvas estilo n8n. Step 4 aun no implementado.
 */
class DevLeadUserProvisioningView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userType = null;
    this.currentStep = 'type';
    this.activeJob = null; // { id, auth_user_id, email, status }
    this.pollTimer = null;
    this.POLL_INTERVAL_MS = 3000;
    this._submitting = false;
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
      key: 'consumer',
      label: 'Consumer',
      icon: 'fa-user',
      hint: 'Usuario final con acceso a una organizacion'
    },
    {
      key: 'developer',
      label: 'Developer',
      icon: 'fa-code',
      hint: 'Acceso al portal /dev'
    },
    {
      key: 'admin',
      label: 'Admin',
      icon: 'fa-user-shield',
      hint: 'Gestiona la organizacion'
    }
  ];

  // ─── Etiquetas dinamicas ─────────────────────────────────────────────

  getStepLabel(step) {
    if (step.key !== 'final') return step.label;
    if (this.userType === 'consumer')  return 'Afiliar';
    if (this.userType === 'admin')     return 'Crear org';
    if (this.userType === 'developer') return 'Permisos';
    return 'Configurar';
  }

  platformRoleFor(t) {
    if (t === 'developer') return 'dev';
    if (t === 'admin')     return 'admin';
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
    this.container?.style.setProperty('--provision-step-count', String(this.STEPS.length));
    return `
      <ol class="provision-progress" style="--provision-step-count: ${this.STEPS.length}" aria-label="Progreso del flujo">
        ${this.STEPS.map((s, i) => {
          const state = i < idx ? 'is-done' : i === idx ? 'is-current' : 'is-pending';
          const marker = i < idx ? '<i class="fas fa-check"></i>' : String(i + 1);
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
    const email = this.activeJob?.email || '';
    const nextLabel = this.getStepLabel(this.STEPS.find((s) => s.key === 'final'));
    return `
      <section class="provision-verify-card provision-final-card">
        <span class="provision-verify-icon provision-verify-icon--success">
          <i class="fas fa-check"></i>
        </span>
        <h2>Email verificado</h2>
        <p><strong>${this.escapeHtml(email)}</strong> confirmo su correo y ya puede iniciar sesion.</p>
        <p class="provision-verify-meta">
          Siguiente paso (${this.escapeHtml(nextLabel)}) pendiente de implementar.
        </p>
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
  }

  wireAll() {
    // Cards de tipo
    this.container.querySelectorAll('[data-user-type]').forEach((card) => {
      this.addEventListener(card, 'click', () => this.selectUserType(card.getAttribute('data-user-type')));
    });

    // Form submit (step data)
    const form = this.container.querySelector('#provisionDataForm');
    if (form) {
      this.addEventListener(form, 'submit', (e) => this.handleDataSubmit(e));
    }

    // Back
    const backBtn = this.container.querySelector('[data-action="back"]');
    if (backBtn) this.addEventListener(backBtn, 'click', () => this.handleBack());

    // Next solo en step 'type' (en otros pasos es submit del form o no existe)
    if (!form) {
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
      this.activeJob = null;
      this.userType = null;
      this.goToStep('type');
    }
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
