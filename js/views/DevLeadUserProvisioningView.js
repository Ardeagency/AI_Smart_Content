/**
 * DevLeadUserProvisioningView
 * Alta manual de usuarios (solo Lead), separada de Team.
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
      <div class="dev-lead-container dev-lead-user-provisioning">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-user-shield"></i> Alta Manual de Usuarios</h1>
            <p class="dev-header-subtitle">Sistema independiente para creación de cuentas y afiliación organizacional</p>
          </div>
        </header>

        <section class="dev-lead-content">
          <div class="dev-lead-toolbar" style="margin-bottom:12px;">
            <span id="provisioningStepLabel">Paso 1 de 4</span>
          </div>

          <form id="manualProvisioningForm" class="dev-lead-form">
            <div data-step="1" class="provision-step">
              <h3>Fase 1 · Cuenta base</h3>
              <div class="dev-lead-toolbar" style="gap:10px;flex-wrap:wrap;">
                <input class="input" type="text" name="full_name" placeholder="Nombre completo" required style="min-width:260px;">
                <input class="input" type="email" name="email" placeholder="Correo" required style="min-width:260px;">
                <input class="input" type="password" name="password" placeholder="Contraseña temporal" required minlength="8" style="min-width:260px;">
              </div>
              <div class="dev-lead-toolbar" style="gap:10px;flex-wrap:wrap;margin-top:10px;">
                <select class="input" name="platform_role" style="min-width:220px;">
                  <option value="user">Rol plataforma: user</option>
                  <option value="admin">Rol plataforma: admin</option>
                  <option value="dev">Rol plataforma: dev</option>
                </select>
                <select class="input" name="default_view_mode" style="min-width:220px;">
                  <option value="user">Vista por defecto: user</option>
                  <option value="developer">Vista por defecto: developer</option>
                </select>
                <select class="input" name="dev_role" style="min-width:220px;">
                  <option value="">Dev role: none</option>
                  <option value="contributor">Dev role: contributor</option>
                  <option value="lead">Dev role: lead</option>
                </select>
              </div>
            </div>

            <div data-step="2" class="provision-step" style="display:none;">
              <h3>Fase 2 · Permisos</h3>
              <div style="display:grid;gap:8px;">
                <label><input type="checkbox" name="perm_studio" checked> Acceso Studio</label>
                <label><input type="checkbox" name="perm_video" checked> Acceso Video</label>
                <label><input type="checkbox" name="perm_brands" checked> Acceso Brand</label>
                <label><input type="checkbox" name="perm_production" checked> Acceso Production</label>
                <label><input type="checkbox" name="perm_developer"> Acceso Dev</label>
                <label><input type="checkbox" name="perm_dev_lead"> Acceso Dev Lead</label>
              </div>
            </div>

            <div data-step="3" class="provision-step" style="display:none;">
              <h3>Fase 3 · Organización</h3>
              <div class="dev-lead-toolbar" style="gap:10px;flex-wrap:wrap;">
                <select class="input" id="orgModeSelect" name="org_mode" style="min-width:260px;">
                  <option value="none">Sin organización inicial</option>
                  <option value="existing">Afiliar a organización existente</option>
                  <option value="create">Crear organización nueva y afiliar</option>
                </select>
                <select class="input" id="existingOrgSelect" name="organization_id" style="min-width:300px;display:none;">
                  <option value="">Seleccionar organización...</option>
                </select>
                <input class="input" type="text" id="newOrgNameInput" name="new_organization_name" placeholder="Nombre nueva organización" style="min-width:300px;display:none;">
                <select class="input" id="orgRoleSelect" name="organization_role" style="min-width:220px;display:none;">
                  <option value="member">Rol en organización: member</option>
                  <option value="admin">Rol en organización: admin</option>
                  <option value="viewer">Rol en organización: viewer</option>
                </select>
              </div>
            </div>

            <div data-step="4" class="provision-step" style="display:none;">
              <h3>Fase 4 · Confirmación</h3>
              <div id="provisionSummary" class="dev-lead-placeholder">Revisa los datos antes de crear.</div>
            </div>

            <div class="dev-lead-toolbar" style="margin-top:16px; gap:10px;">
              <button type="button" class="btn btn-secondary" id="provisionPrevBtn" disabled>
                <i class="fas fa-arrow-left"></i> Anterior
              </button>
              <button type="button" class="btn btn-primary" id="provisionNextBtn">
                Siguiente <i class="fas fa-arrow-right"></i>
              </button>
              <button type="submit" class="btn btn-primary" id="provisionSubmitBtn" style="display:none;">
                <i class="fas fa-user-plus"></i> Crear usuario
              </button>
            </div>
            <p id="provisioningStatus" class="pp-form__status" role="status" aria-live="polite" style="margin-top:10px;"></p>
          </form>
        </section>
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
    const existing = this.container.querySelector('#existingOrgSelect');
    const newOrg = this.container.querySelector('#newOrgNameInput');
    const orgRole = this.container.querySelector('#orgRoleSelect');
    if (!existing || !newOrg || !orgRole) return;

    existing.style.display = mode === 'existing' ? '' : 'none';
    newOrg.style.display = mode === 'create' ? '' : 'none';
    orgRole.style.display = mode === 'existing' || mode === 'create' ? '' : 'none';
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
      const step = Number(el.getAttribute('data-step'));
      el.style.display = step === this.step ? '' : 'none';
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

    summary.innerHTML = `
      <div><strong>Nombre:</strong> ${this.escapeHtml(getVal('full_name'))}</div>
      <div><strong>Email:</strong> ${this.escapeHtml(getVal('email'))}</div>
      <div><strong>Rol plataforma:</strong> ${this.escapeHtml(getVal('platform_role') || 'user')}</div>
      <div><strong>Vista default:</strong> ${this.escapeHtml(getVal('default_view_mode') || 'user')}</div>
      <div><strong>Dev role:</strong> ${this.escapeHtml(getVal('dev_role') || 'none')}</div>
      <div><strong>Permisos:</strong> ${this.escapeHtml(perms.join(', ') || 'Sin permisos')}</div>
      <div><strong>Organización:</strong> ${this.escapeHtml(orgName)}</div>
      <div><strong>Rol organización:</strong> ${this.escapeHtml(getVal('organization_role') || 'N/A')}</div>
    `;
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
