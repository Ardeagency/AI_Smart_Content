/**
 * DevLeadUserProvisioningView
 * Registro manual de usuarios (solo Lead), sistema independiente de Team.
 */
class DevLeadUserProvisioningView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.step = 1;
    this.maxStep = 4;
    this.organizations = [];
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  renderHTML() {
    return `
      <div class="builder-main">
        <div class="builder-settings-form" style="max-width:720px; margin:0 auto; padding: var(--spacing-xl, 1.5rem);">

          <!-- Progreso -->
          <div class="provision-progress" id="provisionProgress">
            ${[1,2,3,4].map((n) => `
              <div class="provision-progress-step${n === 1 ? ' is-active' : ''}" data-step="${n}">
                <div class="provision-progress-dot">${n}</div>
                <span class="provision-progress-label">${['Cuenta','Permisos','Organización','Confirmar'][n-1]}</span>
              </div>
            `).join('')}
          </div>

          <form id="manualProvisioningForm">

            <!-- PASO 1: Cuenta base -->
            <div data-step="1" class="provision-step">
              <div class="settings-section">
                <h4><i class="fas fa-user"></i> Cuenta base</h4>
                <p class="section-description">Credenciales y rol del nuevo usuario en la plataforma.</p>

                <div class="settings-field">
                  <label>Nombre completo</label>
                  <input type="text" name="full_name" placeholder="Ej. María García" required>
                </div>
                <div class="settings-field">
                  <label>Correo electrónico</label>
                  <input type="email" name="email" placeholder="usuario@empresa.com" required>
                </div>
                <div class="settings-field">
                  <label>Contraseña temporal</label>
                  <input type="password" name="password" placeholder="Mínimo 8 caracteres" required minlength="8">
                </div>
              </div>

              <div class="settings-section">
                <h4><i class="fas fa-id-badge"></i> Rol y acceso</h4>
                <div class="settings-field">
                  <label>Rol en la plataforma</label>
                  <select name="platform_role">
                    <option value="user">User — consumidor estándar</option>
                    <option value="admin">Admin — administrador</option>
                    <option value="dev">Dev — desarrollador</option>
                  </select>
                </div>
                <div class="settings-field">
                  <label>Vista por defecto</label>
                  <select name="default_view_mode">
                    <option value="user">User — vista consumidor</option>
                    <option value="developer">Developer — portal dev</option>
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
            </div>

            <!-- PASO 2: Permisos -->
            <div data-step="2" class="provision-step" style="display:none;">
              <div class="settings-section">
                <h4><i class="fas fa-lock-open"></i> Permisos de acceso</h4>
                <p class="section-description">Módulos habilitados para este usuario.</p>
                <div class="provision-perms-grid">
                  <label class="provision-perm-item"><input type="checkbox" name="perm_studio" checked> Studio</label>
                  <label class="provision-perm-item"><input type="checkbox" name="perm_video" checked> Video</label>
                  <label class="provision-perm-item"><input type="checkbox" name="perm_brands" checked> Brand</label>
                  <label class="provision-perm-item"><input type="checkbox" name="perm_production" checked> Production</label>
                  <label class="provision-perm-item"><input type="checkbox" name="perm_developer"> Dev Portal</label>
                  <label class="provision-perm-item"><input type="checkbox" name="perm_dev_lead"> Dev Lead</label>
                </div>
              </div>
            </div>

            <!-- PASO 3: Organización -->
            <div data-step="3" class="provision-step" style="display:none;">
              <div class="settings-section">
                <h4><i class="fas fa-building"></i> Organización</h4>
                <p class="section-description">Define la afiliación organizacional del usuario.</p>

                <div class="settings-field">
                  <label>Modo de organización</label>
                  <select id="orgModeSelect" name="org_mode">
                    <option value="none">Sin organización inicial</option>
                    <option value="existing">Afiliar a organización existente</option>
                    <option value="create">Crear nueva organización y afiliar</option>
                  </select>
                </div>
                <div class="settings-field" id="existingOrgField" style="display:none;">
                  <label>Organización existente</label>
                  <select id="existingOrgSelect" name="organization_id">
                    <option value="">Cargando...</option>
                  </select>
                </div>
                <div class="settings-field" id="newOrgField" style="display:none;">
                  <label>Nombre de la nueva organización</label>
                  <input type="text" id="newOrgNameInput" name="new_organization_name" placeholder="Ej. ACME Corp">
                </div>
                <div class="settings-field" id="orgRoleField" style="display:none;">
                  <label>Rol dentro de la organización</label>
                  <select id="orgRoleSelect" name="organization_role">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- PASO 4: Confirmación -->
            <div data-step="4" class="provision-step" style="display:none;">
              <div class="settings-section">
                <h4><i class="fas fa-check-circle"></i> Confirmar registro</h4>
                <p class="section-description">Revisa los datos antes de crear la cuenta.</p>
                <div id="provisionSummary" class="provision-summary"></div>
              </div>
            </div>

            <!-- Navegación -->
            <div class="provision-nav">
              <button type="button" class="btn btn-secondary" id="provisionPrevBtn" disabled>
                <i class="fas fa-arrow-left"></i> Anterior
              </button>
              <span id="provisioningStepLabel" class="provision-step-counter">Paso 1 de 4</span>
              <div style="display:flex;gap:8px;align-items:center;">
                <button type="button" class="btn btn-primary" id="provisionNextBtn">
                  Siguiente <i class="fas fa-arrow-right"></i>
                </button>
                <button type="submit" class="btn btn-primary" id="provisionSubmitBtn" style="display:none;">
                  <i class="fas fa-user-plus"></i> Registrar usuario
                </button>
              </div>
            </div>

            <p id="provisioningStatus" class="pp-form__status" role="status" aria-live="polite"></p>
          </form>
        </div>
      </div>
    `;
  }

  async init() {
    this.supabase = await this.getSupabaseClient();
    if (!this.supabase) {
      this.showError('Supabase no disponible.');
      return;
    }

    await this.loadOrganizations();

    const form = this.container.querySelector('#manualProvisioningForm');
    const prevBtn = this.container.querySelector('#provisionPrevBtn');
    const nextBtn = this.container.querySelector('#provisionNextBtn');
    const orgMode = this.container.querySelector('#orgModeSelect');

    this.addEventListener(prevBtn, 'click', () => this.goToStep(this.step - 1));
    this.addEventListener(nextBtn, 'click', () => this.handleNext());
    this.addEventListener(orgMode, 'change', () => this.updateOrgModeUI());
    this.addEventListener(form, 'submit', (e) => this.handleSubmit(e));
    this.updateOrgModeUI();
    this.refreshStepUI();
  }

  async loadOrganizations() {
    const { data } = await this.supabase
      .from('organizations')
      .select('id, name')
      .order('name', { ascending: true });

    this.organizations = Array.isArray(data) ? data : [];
    const select = this.container.querySelector('#existingOrgSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Seleccionar organización...</option>' +
      this.organizations.map((org) => `<option value="${org.id}">${this.escapeHtml(org.name || org.id)}</option>`).join('');
  }

  updateOrgModeUI() {
    const mode = this.container.querySelector('#orgModeSelect')?.value || 'none';
    const existingField = this.container.querySelector('#existingOrgField');
    const newOrgField = this.container.querySelector('#newOrgField');
    const orgRoleField = this.container.querySelector('#orgRoleField');
    if (!existingField || !newOrgField || !orgRoleField) return;

    existingField.style.display = mode === 'existing' ? '' : 'none';
    newOrgField.style.display = mode === 'create' ? '' : 'none';
    orgRoleField.style.display = (mode === 'existing' || mode === 'create') ? '' : 'none';
  }

  handleNext() {
    if (!this.validateCurrentStep()) return;
    this.goToStep(this.step + 1);
  }

  goToStep(next) {
    if (next < 1 || next > this.maxStep) return;
    this.step = next;
    this.refreshStepUI();
  }

  refreshStepUI() {
    this.container.querySelectorAll('.provision-step').forEach((el) => {
      el.style.display = Number(el.getAttribute('data-step')) === this.step ? '' : 'none';
    });

    this.container.querySelectorAll('.provision-progress-step').forEach((el) => {
      const n = Number(el.getAttribute('data-step'));
      el.classList.toggle('is-active', n === this.step);
      el.classList.toggle('is-done', n < this.step);
    });

    const prevBtn = this.container.querySelector('#provisionPrevBtn');
    const nextBtn = this.container.querySelector('#provisionNextBtn');
    const submitBtn = this.container.querySelector('#provisionSubmitBtn');
    const label = this.container.querySelector('#provisioningStepLabel');

    if (label) label.textContent = `Paso ${this.step} de ${this.maxStep}`;
    if (prevBtn) prevBtn.disabled = this.step === 1;
    if (nextBtn) nextBtn.style.display = this.step === this.maxStep ? 'none' : '';
    if (submitBtn) submitBtn.style.display = this.step === this.maxStep ? '' : 'none';

    if (this.step === 4) this.renderSummary();
  }

  validateCurrentStep() {
    const form = this.container.querySelector('#manualProvisioningForm');
    if (!form) return false;
    const get = (name) => form.elements[name];

    if (this.step === 1) {
      const required = ['full_name', 'email', 'password'];
      for (const key of required) {
        const value = (get(key)?.value || '').trim();
        if (!value) {
          this.setStatus(`Completa ${key}.`, 'is-error');
          return false;
        }
      }
      if ((get('password')?.value || '').length < 8) {
        this.setStatus('La contraseña debe tener mínimo 8 caracteres.', 'is-error');
        return false;
      }
    }

    if (this.step === 3) {
      const mode = get('org_mode')?.value || 'none';
      if (mode === 'existing' && !(get('organization_id')?.value || '').trim()) {
        this.setStatus('Selecciona una organización existente.', 'is-error');
        return false;
      }
      if (mode === 'create' && !(get('new_organization_name')?.value || '').trim()) {
        this.setStatus('Ingresa el nombre de la nueva organización.', 'is-error');
        return false;
      }
    }

    this.setStatus('', '');
    return true;
  }

  renderSummary() {
    const form = this.container.querySelector('#manualProvisioningForm');
    const summary = this.container.querySelector('#provisionSummary');
    if (!form || !summary) return;

    const getVal = (name) => (form.elements[name]?.value || '').trim();
    const orgMode = getVal('org_mode') || 'none';
    const orgName = orgMode === 'existing'
      ? (this.organizations.find((o) => o.id === getVal('organization_id'))?.name || 'N/A')
      : orgMode === 'create'
        ? getVal('new_organization_name')
        : 'Sin organización';

    const perms = [
      ['perm_studio', 'Studio'],
      ['perm_video', 'Video'],
      ['perm_brands', 'Brand'],
      ['perm_production', 'Production'],
      ['perm_developer', 'Dev'],
      ['perm_dev_lead', 'Dev Lead']
    ].filter(([key]) => form.elements[key]?.checked).map(([, label]) => label);

    const field = (label, value) =>
      `<div><strong>${label}</strong>${this.escapeHtml(value)}</div>`;

    summary.innerHTML =
      field('Nombre', getVal('full_name')) +
      field('Email', getVal('email')) +
      field('Rol plataforma', getVal('platform_role') || 'user') +
      field('Vista default', getVal('default_view_mode') || 'user') +
      field('Dev role', getVal('dev_role') || 'none') +
      field('Permisos', perms.join(', ') || 'Sin permisos') +
      field('Organización', orgName) +
      field('Rol organización', getVal('organization_role') || 'N/A');
  }

  collectPayload() {
    const form = this.container.querySelector('#manualProvisioningForm');
    const value = (name) => (form.elements[name]?.value || '').trim();
    const checked = (name) => !!form.elements[name]?.checked;

    const permissions = {
      studio: checked('perm_studio'),
      video: checked('perm_video'),
      brands: checked('perm_brands'),
      production: checked('perm_production'),
      developer: checked('perm_developer'),
      dev_lead: checked('perm_dev_lead')
    };

    return {
      account: {
        full_name: value('full_name'),
        email: value('email').toLowerCase(),
        password: value('password'),
        role: value('platform_role') || 'user',
        default_view_mode: value('default_view_mode') || 'user',
        is_developer: !!value('dev_role'),
        dev_role: value('dev_role') || null
      },
      permissions,
      organization: {
        mode: value('org_mode') || 'none',
        organization_id: value('organization_id') || null,
        new_organization_name: value('new_organization_name') || null,
        organization_role: value('organization_role') || null
      },
      created_by_lead_id: window.authService?.getCurrentUser?.()?.id || null
    };
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (!this.validateCurrentStep()) return;

    const payload = this.collectPayload();
    const submitBtn = this.container.querySelector('#provisionSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    }

    try {
      // Flujo recomendado: función admin con service-role en backend.
      // Se intenta por aliases para compatibilidad mientras se estabiliza naming.
      const candidates = ['admin-create-user', 'lead-provision-user', 'dev-create-user'];
      let result = null;
      let lastError = null;
      for (const fnName of candidates) {
        const { data, error } = await this.supabase.functions.invoke(fnName, { body: payload });
        if (!error && data) {
          result = data;
          break;
        }
        lastError = error;
      }

      if (!result) {
        throw new Error(lastError?.message || 'No existe una función backend de aprovisionamiento (admin-create-user / lead-provision-user).');
      }

      this.setStatus('Usuario creado correctamente.', 'is-success');
      event.target.reset();
      this.step = 1;
      this.updateOrgModeUI();
      this.refreshStepUI();
    } catch (error) {
      this.setStatus(`Error: ${error.message}`, 'is-error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Crear usuario';
      }
    }
  }

  setStatus(text, klass) {
    const el = this.container.querySelector('#provisioningStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-success', 'is-error');
    if (klass) el.classList.add(klass);
  }
}

window.DevLeadUserProvisioningView = DevLeadUserProvisioningView;
