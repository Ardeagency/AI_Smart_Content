/**
 * DevLeadCreateOrgView — pagina dedicada para crear una organizacion nueva.
 *
 * Esta es la version larga del Step 4 (Crear org) del wizard de provisioning,
 * accesible directo en /dev/provisioning/create-org?job=<job_id>.
 *
 * El wizard de provisioning redirige aqui cuando userType=owner_org tras
 * verificar email — porque crear una org tiene mucho mas detalle que afiliar
 * a una existente o asignar permisos.
 *
 * El boton 'Crear organizacion' es el ULTIMO paso del flow y por ahora queda
 * disabled (implementacion pendiente).
 */
class DevLeadCreateOrgView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.jobId = null;
    this.job = null;        // datos del provisioning_job
    this.owner = null;      // { id, email, full_name } del usuario que sera owner

    // Estado del form (in-memory)
    this.form = {
      name: '',
      brand_name_oficial: '',
      brand_slogan: '',
      logo_url: '',
      timezone: 'America/Bogota',
      locale: 'es',
      level_of_autonomy: 'parcial',
      mfa_required: false
    };
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  TIMEZONES = [
    'UTC',
    'America/Bogota',
    'America/Mexico_City',
    'America/Lima',
    'America/Santiago',
    'America/Argentina/Buenos_Aires',
    'America/Sao_Paulo',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/Madrid',
    'Europe/London',
    'Europe/Berlin'
  ];

  LOCALES = [
    { v: 'es', label: 'Espanol' },
    { v: 'en', label: 'English' },
    { v: 'pt', label: 'Portugues' }
  ];

  AUTONOMY = [
    { v: 'restringido', label: 'Restringido', desc: 'Vera propone, humano aprueba siempre. Curva de aprendizaje gentil.' },
    { v: 'parcial',     label: 'Parcial',     desc: 'Vera ejecuta tareas seguras, escala las complejas. Recomendado.' },
    { v: 'total',       label: 'Total',       desc: 'Vera opera autonoma 24/7. Para orgs maduras con confianza alta.' }
  ];

  renderHTML() {
    return `
      <div class="createorg-page">
        <header class="createorg-page-header">
          <a href="/dev/provisioning/users" class="createorg-breadcrumb" data-route="/dev/provisioning/users">
            <i class="fas fa-arrow-left"></i> Volver al wizard
          </a>
          <h1 class="createorg-page-title">Crear organizacion</h1>
          <p class="createorg-page-subtitle">
            Configura la identidad y operacion. El paso final crea la org y
            asigna al usuario como owner.
          </p>
        </header>

        <div class="createorg-grid">
          <div class="createorg-form-col" id="createOrgFormCol">
            <!-- Owner -->
            <section class="createorg-section">
              <header class="createorg-section-head">
                <span class="createorg-section-eyebrow">Owner</span>
                <h2>Dueno de la organizacion</h2>
                <p>Esta cuenta queda como owner (rol con poder de transferir o eliminar la org).</p>
              </header>
              <div class="createorg-owner-card" id="createOrgOwnerCard">
                <div class="createorg-owner-loading">
                  <i class="fas fa-circle-notch fa-spin"></i> Cargando datos del owner...
                </div>
              </div>
            </section>

            <!-- Identidad -->
            <section class="createorg-section">
              <header class="createorg-section-head">
                <span class="createorg-section-eyebrow">Paso 1 · Identidad</span>
                <h2>Marca</h2>
                <p>Define lo visible: nombre operativo, nombre legal, slogan y logo.</p>
              </header>
              <form id="createOrgIdentityForm" class="createorg-form" novalidate>
                <div class="provision-field">
                  <label for="orgName">Nombre <span style="color:#ef4444">*</span></label>
                  <input id="orgName" name="name" type="text" placeholder="Ej. ACME Corp" maxlength="120" required>
                  <small>Nombre interno de la organizacion. Cambiable despues.</small>
                </div>
                <div class="provision-field">
                  <label for="orgBrandName">Nombre oficial de marca</label>
                  <input id="orgBrandName" name="brand_name_oficial" type="text" placeholder="Ej. ACME Brand SAS" maxlength="120">
                </div>
                <div class="provision-field">
                  <label for="orgSlogan">Slogan</label>
                  <input id="orgSlogan" name="brand_slogan" type="text" placeholder="Frase de marca" maxlength="200">
                </div>
                <div class="provision-field">
                  <label for="orgLogo">Logo URL</label>
                  <input id="orgLogo" name="logo_url" type="url" placeholder="https://...">
                  <small>PNG/JPG/SVG via URL publica. Subida directa disponible despues desde Brand.</small>
                </div>
              </form>
            </section>

            <!-- Region -->
            <section class="createorg-section">
              <header class="createorg-section-head">
                <span class="createorg-section-eyebrow">Paso 2 · Region</span>
                <h2>Zona horaria e idioma</h2>
                <p>Afecta reportes, scheduling, formatos de fecha y el idioma por defecto de Vera.</p>
              </header>
              <form id="createOrgRegionForm" class="createorg-form" novalidate>
                <div class="provision-field">
                  <label for="orgTimezone">Zona horaria</label>
                  <select id="orgTimezone" name="timezone" required>
                    ${this.TIMEZONES.map((tz) =>
                      `<option value="${tz}" ${tz === this.form.timezone ? 'selected' : ''}>${this.escapeHtml(tz)}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="provision-field">
                  <label for="orgLocale">Idioma</label>
                  <select id="orgLocale" name="locale" required>
                    ${this.LOCALES.map((l) =>
                      `<option value="${l.v}" ${l.v === this.form.locale ? 'selected' : ''}>${this.escapeHtml(l.label)}</option>`
                    ).join('')}
                  </select>
                </div>
              </form>
            </section>

            <!-- Operacion -->
            <section class="createorg-section">
              <header class="createorg-section-head">
                <span class="createorg-section-eyebrow">Paso 3 · Operacion</span>
                <h2>Autonomia y seguridad</h2>
                <p>Define cuanto puede actuar Vera sin aprobacion humana, y si MFA es obligatorio para entrar.</p>
              </header>

              <div class="createorg-autonomy" role="radiogroup" aria-label="Nivel de autonomia">
                ${this.AUTONOMY.map((a) => `
                  <label class="createorg-autonomy-option">
                    <input type="radio" name="level_of_autonomy" value="${a.v}" ${a.v === this.form.level_of_autonomy ? 'checked' : ''}>
                    <span class="createorg-autonomy-card">
                      <strong>${this.escapeHtml(a.label)}</strong>
                      <small>${this.escapeHtml(a.desc)}</small>
                    </span>
                  </label>
                `).join('')}
              </div>

              <label class="createorg-toggle">
                <input type="checkbox" id="orgMfaRequired" name="mfa_required" ${this.form.mfa_required ? 'checked' : ''}>
                <span class="createorg-toggle-track"><span class="createorg-toggle-thumb"></span></span>
                <span class="createorg-toggle-meta">
                  <strong>MFA obligatorio</strong>
                  <small>Todos los miembros deben enrolar TOTP/FIDO para acceder a esta org.</small>
                </span>
              </label>
            </section>
          </div>

          <!-- Preview lateral sticky -->
          <aside class="createorg-preview-col" aria-label="Vista previa">
            <div class="createorg-preview-card" id="createOrgPreview">
              <div class="createorg-preview-logo" id="createOrgPreviewLogo">
                <i class="fas fa-building"></i>
              </div>
              <strong class="createorg-preview-name is-empty" id="createOrgPreviewName">Nueva organizacion</strong>
              <span class="createorg-preview-brand" id="createOrgPreviewBrand" hidden></span>
              <p class="createorg-preview-slogan is-empty" id="createOrgPreviewSlogan">Llena el nombre para empezar</p>
              <div class="createorg-preview-meta">
                <span><i class="fas fa-crown"></i> <span id="createOrgPreviewOwner">— Owner pendiente</span></span>
                <span><i class="fas fa-globe"></i> <span id="createOrgPreviewRegion">UTC · es</span></span>
                <span><i class="fas fa-shield-halved"></i> <span id="createOrgPreviewAutonomy">Autonomia parcial</span></span>
              </div>
            </div>
          </aside>
        </div>

        <footer class="createorg-page-footer">
          <button type="button" class="provision-back-btn" data-action="back">Cancelar</button>
          <div class="createorg-footer-pending">
            <i class="fas fa-hourglass-half"></i>
            <span>Paso final pendiente — el insert real se cablea despues</span>
          </div>
          <button type="button" class="createorg-submit-btn" disabled aria-disabled="true">
            <i class="fas fa-check"></i> Crear organizacion
          </button>
        </footer>
      </div>
    `;
  }

  async init() {
    this.supabase = await this.getSupabaseClient();
    if (!this.supabase) {
      this.showError('Supabase no disponible.');
      return;
    }

    // Leer ?job=<id> de la URL
    const params = new URLSearchParams(window.location.search);
    this.jobId = params.get('job') || null;

    await this.loadJobOwner();
    this.renderOwner();

    this.wireForm();
    this.updatePreview();
  }

  async loadJobOwner() {
    if (!this.jobId) return;
    try {
      const { data, error } = await this.supabase
        .from('provisioning_jobs')
        .select('id, email, full_name, auth_user_id, status, payload')
        .eq('id', this.jobId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      this.job = data;
      this.owner = {
        id: data.auth_user_id,
        email: data.email,
        full_name: data.full_name || data?.payload?.account?.full_name || ''
      };
    } catch (err) {
      this.showNotification(`No se pudo cargar el job: ${err.message}`, 'error');
    }
  }

  renderOwner() {
    const host = this.container.querySelector('#createOrgOwnerCard');
    if (!host) return;
    if (!this.owner) {
      host.innerHTML = `
        <div class="createorg-owner-empty">
          <i class="fas fa-user-slash"></i>
          <p>Sin job asociado. La org se crea sin owner — abre desde el wizard de provisioning para tener owner asignado.</p>
        </div>
      `;
      return;
    }
    const o = this.owner;
    const initials = (o.full_name || o.email || '?')
      .split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
    host.innerHTML = `
      <div class="createorg-owner-row">
        <span class="createorg-owner-avatar">${this.escapeHtml(initials)}</span>
        <span class="createorg-owner-info">
          <strong>${this.escapeHtml(o.full_name || '(sin nombre)')}</strong>
          <span>${this.escapeHtml(o.email || '')}</span>
        </span>
        <span class="createorg-owner-tag">OWNER</span>
      </div>
    `;
    const ownerEl = this.container.querySelector('#createOrgPreviewOwner');
    if (ownerEl) ownerEl.textContent = o.full_name || o.email || '— Owner pendiente';
  }

  wireForm() {
    // Inputs identidad
    ['orgName', 'orgBrandName', 'orgSlogan', 'orgLogo'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'input', () => this.syncForm());
    });
    // Selects region
    ['orgTimezone', 'orgLocale'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'change', () => this.syncForm());
    });
    // Radio autonomy
    this.container.querySelectorAll('input[name="level_of_autonomy"]').forEach((r) => {
      this.addEventListener(r, 'change', () => this.syncForm());
    });
    // Toggle MFA
    const mfa = this.container.querySelector('#orgMfaRequired');
    if (mfa) this.addEventListener(mfa, 'change', () => this.syncForm());

    // Back
    const back = this.container.querySelector('[data-action="back"]');
    if (back) {
      this.addEventListener(back, 'click', () => {
        if (window.router) window.router.navigate('/dev/provisioning/users');
        else window.location.href = '/dev/provisioning/users';
      });
    }
  }

  syncForm() {
    const f = this.form;
    const get = (id) => (this.container.querySelector('#' + id)?.value || '').trim();
    f.name = get('orgName');
    f.brand_name_oficial = get('orgBrandName');
    f.brand_slogan = get('orgSlogan');
    f.logo_url = get('orgLogo');
    f.timezone = get('orgTimezone') || 'UTC';
    f.locale = get('orgLocale') || 'es';
    const radio = this.container.querySelector('input[name="level_of_autonomy"]:checked');
    f.level_of_autonomy = radio?.value || 'parcial';
    f.mfa_required = !!this.container.querySelector('#orgMfaRequired')?.checked;
    this.updatePreview();
  }

  updatePreview() {
    const f = this.form;
    const nameEl = this.container.querySelector('#createOrgPreviewName');
    const brandEl = this.container.querySelector('#createOrgPreviewBrand');
    const sloganEl = this.container.querySelector('#createOrgPreviewSlogan');
    const logoEl = this.container.querySelector('#createOrgPreviewLogo');
    const regionEl = this.container.querySelector('#createOrgPreviewRegion');
    const autonomyEl = this.container.querySelector('#createOrgPreviewAutonomy');

    if (nameEl) {
      nameEl.textContent = f.name || 'Nueva organizacion';
      nameEl.classList.toggle('is-empty', !f.name);
    }
    if (brandEl) {
      if (f.brand_name_oficial) {
        brandEl.textContent = f.brand_name_oficial;
        brandEl.hidden = false;
      } else {
        brandEl.hidden = true;
      }
    }
    if (sloganEl) {
      sloganEl.textContent = f.brand_slogan || 'Llena el nombre para empezar';
      sloganEl.classList.toggle('is-empty', !f.brand_slogan);
    }
    if (logoEl) {
      if (f.logo_url && /^https?:\/\//i.test(f.logo_url)) {
        logoEl.innerHTML = `<img src="${this.escapeHtml(f.logo_url)}" alt="${this.escapeHtml(f.name || 'Logo')}" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fas fa-building'}))">`;
      } else {
        logoEl.innerHTML = '<i class="fas fa-building"></i>';
      }
    }
    if (regionEl) regionEl.textContent = `${f.timezone} · ${f.locale}`;
    if (autonomyEl) autonomyEl.textContent = `Autonomia ${f.level_of_autonomy}` + (f.mfa_required ? ' · MFA' : '');
  }
}

window.DevLeadCreateOrgView = DevLeadCreateOrgView;
