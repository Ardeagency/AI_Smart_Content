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
    this.orgsList = [];             // cache para afiliar
    this.finalizing = false;
    this.finalized = false;
    this.finalizedResult = null;    // { auth_user_id, organization_id, user_type }
    this._draft = null;             // { full_name, email } — borrador del paso 2 (sin password)
    // Camino consumidor, paso final: null (eligiendo) | 'affiliate' (mostrando
    // selector de org). 'create_org' redirige al wizard de org; 'conclude'
    // finaliza directo, sin sub-render.
    this.consumerAction = null;
  }

  // Progreso persistido en localStorage para sobrevivir a un refresh. Sin esto,
  // refrescar en mitad del wizard pierde el job_id y deja un usuario creado en
  // Supabase imposible de retomar (email duplicado). Nunca se guarda la password.
  STORAGE_KEY = 'asc:provisioning-wizard';
  STORAGE_TTL_MS = 12 * 60 * 60 * 1000; // 12h: estado mas viejo se descarta

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

  // El tipo se reduce a Consumidor vs Developer. Para consumidores, la decision
  // de organizacion (crear / afiliar / concluir) se toma DESPUES de verificar el
  // email, no aqui — asi el usuario se crea siempre, incluso si se abandona el
  // paso de org.
  USER_TYPES = [
    {
      key: 'consumer',
      label: 'Consumidor',
      icon: 'fa-user',
      hint: 'Cliente de la plataforma. Tras verificar el email eliges crear/afiliar org o concluir'
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
    if (this.userType === 'developer') return 'Permisos';
    if (this.userType === 'consumer')  return 'Organizacion';
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
          const marker = (state === 'is-done') ? '<i class="aisc-ico aisc-ico--check"></i>' : String(i + 1);
          return `
            <li class="provision-progress-item ${state}" data-step="${s.key}">
              <span class="provision-progress-caret" aria-hidden="true">
                <i class="aisc-ico aisc-ico--chevron-down"></i>
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
          <i class="aisc-ico aisc-ico--arrow-right"></i>
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
          <i class="aisc-ico aisc-ico--arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepVerify() {
    const email = this.activeJob?.email || '';
    return `
      <section class="provision-verify-card">
        <span class="provision-verify-icon">
          <i class="aisc-ico aisc-ico--mail"></i>
        </span>
        <h2>Esperando confirmacion</h2>
        <p>Enviamos un email de verificacion a <strong>${this.escapeHtml(email)}</strong>.</p>
        <div class="provision-verify-spinner"><i class="aisc-ico fa-spin aisc-ico--loader"></i></div>
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

    if (this.userType === 'developer') return this.renderStepDeveloper();
    if (this.userType === 'consumer') {
      // Sub-estado: eligiendo accion vs afiliando a una org existente.
      return this.consumerAction === 'affiliate'
        ? this.renderStepMemberOrg()
        : this.renderStepConsumerChoice();
    }
    return '';
  }

  // Camino consumidor tras verificar el email: el perfil YA esta creado. El Lead
  // decide que hacer con la organizacion.
  renderStepConsumerChoice() {
    const email = this.activeJob?.email || '';
    const options = [
      {
        action: 'create_org',
        icon: 'fa-crown',
        title: 'Crear organizacion',
        hint: 'Crear una marca desde cero. El usuario queda como owner.'
      },
      {
        action: 'affiliate',
        icon: 'fa-building-user',
        title: 'Afiliar a una organizacion',
        hint: 'Conectarlo a una organizacion existente con un rol.'
      },
      {
        action: 'conclude',
        icon: 'fa-check',
        title: 'Concluir usuario',
        hint: 'Dejarlo creado como consumidor y asignar org despues.'
      }
    ];
    return `
      <section class="provision-form-card">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 4 · Organizacion</span>
          <h2>Usuario consumidor creado</h2>
          <p><strong>${this.escapeHtml(email)}</strong> ya existe y puede iniciar sesion. Elige como continuar.</p>
        </header>
        <div class="provision-type-grid" role="radiogroup" aria-label="Accion de organizacion">
          ${options.map((o) => `
            <button type="button" class="provision-type-card" data-consumer-action="${o.action}" role="radio" aria-checked="false">
              <span class="provision-type-icon"><i class="fas ${o.icon}"></i></span>
              <span class="provision-type-label">${this.escapeHtml(o.title)}</span>
              <span class="provision-type-hint">${this.escapeHtml(o.hint)}</span>
            </button>
          `).join('')}
        </div>
        <p class="provision-form-status" role="status" aria-live="polite" id="provisionFinalStatus"></p>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Crear otro</button>
      </footer>
    `;
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
            <small>Las capacidades se asignan automaticamente segun el rol. El rol 'owner' solo se crea al crear una organizacion nueva.</small>
          </div>
          <p class="provision-form-status" role="status" aria-live="polite" id="provisionFinalStatus"></p>
        </form>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back-to-choice">Atras</button>
        <button type="submit" form="provisionFinalForm" class="provision-next-btn" data-action="next" aria-label="Afiliar">
          <i class="aisc-ico aisc-ico--arrow-right"></i>
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
          <i class="aisc-ico aisc-ico--arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepFinalSubmitting() {
    return `
      <section class="provision-verify-card">
        <div class="provision-verify-spinner"><i class="aisc-ico fa-spin aisc-ico--loader"></i></div>
        <h2>Finalizando...</h2>
        <p>Guardando perfil, organizacion y permisos.</p>
      </section>
    `;
  }

  // Destino del boton "Continuar" segun lo que se creo.
  continueDestination() {
    return this.finalizedResult?.user_type === 'developer'
      ? '/dev/lead/team'
      : '/dev/lead/consumers';
  }

  renderStepFinalDone() {
    const email = this.activeJob?.email || '';
    const r = this.finalizedResult || {};
    let title = 'Usuario creado con exito';
    let detail = `${email} ya puede iniciar sesion.`;
    if (r.user_type === 'developer') {
      title = 'Nuevo desarrollador creado con exito';
      detail = `${email} ya puede entrar al portal /dev.`;
    } else if (r.user_type === 'member_org') {
      const orgName = (this.orgsList.find((o) => o.id === r.organization_id) || {}).name || 'la organizacion seleccionada';
      title = 'Usuario afiliado con exito';
      detail = `${email} quedo afiliado a ${orgName}. No se creo ninguna organizacion.`;
    } else if (r.user_type === 'consumer') {
      title = 'Consumidor creado con exito';
      detail = `${email} aparece en Consumidores; puedes asignarle una organizacion cuando quieras.`;
    }
    return `
      <section class="provision-verify-card provision-final-card">
        <span class="provision-verify-icon provision-verify-icon--success">
          <i class="aisc-ico aisc-ico--check"></i>
        </span>
        <h2>${this.escapeHtml(title)}</h2>
        <p class="provision-verify-meta">${this.escapeHtml(detail)}</p>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-next-btn provision-next-btn--wide" data-action="continue">
          Continuar <i class="aisc-ico aisc-ico--arrow-right"></i>
        </button>
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
    // Restaurar progreso tras un refresh. Si no hay nada que restaurar, wire normal.
    const restored = await this.restoreState();
    if (!restored) this.wireAll();
  }

  // ─── Persistencia del progreso (sobrevive refresh) ───────────────────

  _persist() {
    try {
      const state = {
        v: 1,
        savedAt: Date.now(),
        userType: this.userType,
        currentStep: this.currentStep,
        draft: this._draft || null,
        job: this.activeJob || null,
        finalized: this.finalized,
        finalizedResult: this.finalizedResult || null
      };
      // Nada util que guardar todavia → no ensuciar el storage.
      if (!state.userType && !state.job && !state.draft && !state.finalized) {
        localStorage.removeItem(this.STORAGE_KEY);
        return;
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* storage no disponible/lleno: degradar silencioso */ }
  }

  _loadPersisted() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1) return null;
      if (s.savedAt && (Date.now() - s.savedAt) > this.STORAGE_TTL_MS) {
        localStorage.removeItem(this.STORAGE_KEY);
        return null;
      }
      return s;
    } catch (_) { return null; }
  }

  _clearPersisted() {
    try { localStorage.removeItem(this.STORAGE_KEY); } catch (_) {}
  }

  // Retoma el wizard desde el estado guardado. Re-valida el job contra el
  // backend para saltar al paso correcto (puede haberse confirmado el email
  // mientras la vista estaba cerrada). Devuelve true si restauro algo.
  async restoreState() {
    const s = this._loadPersisted();
    if (!s) return false;

    this.userType = s.userType || null;
    this._draft = s.draft || null;

    // Aviso solo cuando ya hay un usuario creado (job/finalizado): el wizard
    // saltara a un paso avanzado y conviene explicar por que.
    if ((s.job && s.job.id) || s.finalized) {
      this.showNotification('Progreso restaurado: seguimos donde lo dejaste.', 'info');
    }

    // Caso ya finalizado (member/developer): mostrar la tarjeta de exito.
    if (s.finalized) {
      this.activeJob = s.job || null;
      this.finalized = true;
      this.finalizedResult = s.finalizedResult || null;
      this.goToStep('final');
      return true;
    }

    // Caso con job en curso: re-validar contra el backend.
    if (s.job && s.job.id) {
      this.activeJob = s.job;
      let job = null;
      try {
        const { data } = await this.supabase.functions.invoke('provision-user-check', {
          body: { job_id: s.job.id }
        });
        job = data && data.job ? data.job : null;
      } catch (_) { /* sin red: confiamos en el estado guardado */ }

      if (job) {
        this.activeJob = { ...this.activeJob, status: job.status, auth_user_id: job.auth_user_id };

        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
          // Estado terminal: nada que retomar, arrancar limpio.
          this._clearPersisted();
          this.activeJob = null;
          this.userType = null;
          this._draft = null;
          return false;
        }
        if (['email_confirmed', 'finalizing'].includes(job.status)) {
          this.goToStep('final');
          return true;
        }
        // pending_email_confirmation
        this.goToStep('verify');
        return true;
      }

      // No se pudo validar (offline): retomar de forma conservadora en verify.
      this.goToStep('verify');
      return true;
    }

    // Sin job: restaurar tipo + borrador del paso 2.
    if (s.currentStep === 'data' && this.userType) {
      this.goToStep('data');
      this._applyDraft();
      return true;
    }
    if (this.userType) {
      this.goToStep('type');
      this._markTypeCard();
      return true;
    }
    return false;
  }

  _applyDraft() {
    if (!this._draft) return;
    const n = this.container.querySelector('#provisionFullName');
    const e = this.container.querySelector('#provisionEmail');
    if (n && this._draft.full_name) n.value = this._draft.full_name;
    if (e && this._draft.email) e.value = this._draft.email;
  }

  _markTypeCard() {
    this.container.querySelectorAll('.provision-type-card').forEach((c) => {
      const active = c.getAttribute('data-user-type') === this.userType;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    const nextBtn = this.container.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.disabled = !this.userType;
  }

  goToStep(stepKey) {
    this.currentStep = stepKey;
    this._persist();
    const page = this.container.querySelector('.provision-page');
    if (!page) return;
    page.innerHTML = `
      <header class="provision-page-progress">${this.renderProgress()}</header>
      <div class="provision-page-center">${this.renderCurrentStep()}</div>
    `;
    this.wireAll();

    if (stepKey === 'verify') this.startPolling();
    else this.stopPolling();

    // Al (re)entrar al paso final del consumidor, arrancar en la pantalla de
    // eleccion (no en un sub-estado 'affiliate' viejo). Las orgs se cargan al
    // elegir "Afiliar".
    if (stepKey === 'final' && this.userType === 'consumer' && !this.finalized) {
      this.consumerAction = null;
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

    // Borrador del paso 2: persistir nombre/email mientras se escribe (sin password)
    // para que un refresh no obligue a re-teclearlos.
    const fullNameInput = this.container.querySelector('#provisionFullName');
    const emailInput = this.container.querySelector('#provisionEmail');
    if (fullNameInput || emailInput) {
      const onDraft = () => {
        this._draft = {
          full_name: fullNameInput?.value || '',
          email: emailInput?.value || ''
        };
        this._persist();
      };
      if (fullNameInput) this.addEventListener(fullNameInput, 'input', onDraft);
      if (emailInput) this.addEventListener(emailInput, 'input', onDraft);
    }

    const finalForm = this.container.querySelector('#provisionFinalForm');
    if (finalForm) this.addEventListener(finalForm, 'submit', (e) => this.handleFinalSubmit(e));

    // Camino consumidor: las 3 opciones tras verificar.
    this.container.querySelectorAll('[data-consumer-action]').forEach((card) => {
      this.addEventListener(card, 'click', () => this.selectConsumerAction(card.getAttribute('data-consumer-action')));
    });
    const backToChoice = this.container.querySelector('[data-action="back-to-choice"]');
    if (backToChoice) this.addEventListener(backToChoice, 'click', () => {
      this.consumerAction = null;
      this.renderFinalCenter();
    });

    // Back
    const backBtn = this.container.querySelector('[data-action="back"]');
    if (backBtn) this.addEventListener(backBtn, 'click', () => this.handleBack());

    // Continuar (pantalla de exito): sale a la seccion relevante.
    const continueBtn = this.container.querySelector('[data-action="continue"]');
    if (continueBtn) this.addEventListener(continueBtn, 'click', () => this.handleContinue());

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
    this._persist();
  }

  handleContinue() {
    const dest = this.continueDestination();
    this.activeJob = null;
    this.userType = null;
    this.finalized = false;
    this.finalizing = false;
    this.finalizedResult = null;
    this.consumerAction = null;
    this._draft = null;
    this._clearPersisted();
    if (window.router) window.router.navigate(dest);
    else window.location.href = dest;
  }

  handleBack() {
    if (this.currentStep === 'type') {
      // Salir del wizard: descartar progreso guardado.
      this._clearPersisted();
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
      this._draft = null;
      this._clearPersisted();
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
      this._draft = null;
      this._clearPersisted();
      this.goToStep('type');
    }
  }

  // ─── Step 4: finalize backend ────────────────────────────────────────

  // ─── Camino consumidor: 3 opciones tras verificar ────────────────────

  selectConsumerAction(action) {
    if (action === 'create_org') {
      // El wizard de crear-org es un flow largo dedicado. Le pasamos el job;
      // alli se crea la org con este usuario como owner y se cierra el job.
      this.stopPolling();
      const target = '/dev/provisioning/create-org?job=' + encodeURIComponent(this.activeJob.id);
      if (window.router) window.router.navigate(target);
      else window.location.href = target;
      return;
    }
    if (action === 'affiliate') {
      this.consumerAction = 'affiliate';
      if (this.orgsList.length === 0) {
        this.loadOrganizations().then(() => {
          if (this.currentStep === 'final' && this.consumerAction === 'affiliate' && !this.finalized) {
            this.renderFinalCenter();
          }
        });
      }
      this.renderFinalCenter();
      return;
    }
    if (action === 'conclude') {
      this.handleConclude();
    }
  }

  // Re-render del centro del paso final + re-wire.
  renderFinalCenter() {
    const center = this.container.querySelector('.provision-page-center');
    if (center) {
      center.innerHTML = this.renderCurrentStep();
      this.wireAll();
    }
  }

  // "Concluir usuario": el perfil consumidor ya existe (se creo al confirmar el
  // email); solo cerramos el job. user_type:'consumer' en finalize hace eso.
  async handleConclude() {
    if (this.finalizing) return;
    await this.runFinalize({ job_id: this.activeJob?.id, user_type: 'consumer' });
  }

  async handleFinalSubmit(e) {
    e.preventDefault();
    if (this.finalizing) return;

    const fd = new FormData(e.target);
    const payload = { job_id: this.activeJob?.id };

    if (this.userType === 'consumer' && this.consumerAction === 'affiliate') {
      const organization_id = (fd.get('organization_id') || '').toString();
      const role = (fd.get('role') || 'viewer').toString();
      if (!organization_id) return this.setFinalStatus('Selecciona una organizacion.', 'error');
      payload.user_type = 'member_org';
      payload.member_org = { organization_id, role };
    } else if (this.userType === 'developer') {
      const dev_role = (fd.get('dev_role') || '').toString();
      const dev_rank = (fd.get('dev_rank') || '').toString();
      if (!dev_role) return this.setFinalStatus('Elige un rol developer.', 'error');
      if (!dev_rank) return this.setFinalStatus('Elige un rango.', 'error');
      payload.user_type = 'developer';
      payload.developer = { dev_role, dev_rank };
    } else {
      return;
    }

    await this.runFinalize(payload);
  }

  async runFinalize(payload) {
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
      this._persist();
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
      this._persist();

      if (['email_confirmed', 'finalizing', 'completed'].includes(job.status)) {
        this.stopPolling();
        // El perfil consumidor ya quedo creado en provision-user-check al
        // confirmar el email. El paso final ofrece crear/afiliar org o concluir.
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
