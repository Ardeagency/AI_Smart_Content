/**
 * DevLeadCreateOrgView — pagina dedicada para crear una organizacion nueva.
 *
 * Mismo lenguaje visual que el wizard de crear usuario (DevLeadUserProvisioningView):
 * progress bar arriba con caret indicador, dot canvas n8n de fondo, contenido
 * centrado, Back pill + Next circular gradient.
 *
 * 3 pasos:
 *   1. Identidad  — name, brand_name_oficial, slogan, logo_url, brand docs,
 *                   idioma, zona horaria.
 *   2. Operacion  — nivel de autonomia (3 radios) + MFA obligatorio (toggle).
 *   3. Revisar    — owner card + summary de todos los datos + boton Crear
 *                   DISABLED (el insert real se cablea despues).
 *
 * Accesible directo en /dev/provisioning/create-org?job=<job_id>. El wizard
 * de provisioning redirige aqui cuando userType=owner_org.
 */
class DevLeadCreateOrgView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.jobId = null;
    this.owner = null;
    this.currentStep = 'identidad';

    this.form = {
      // Step 1 - Identidad basica
      name: '',
      slogan: '',
      logo_file: null,
      logo_preview: '',
      // Step 2 - Metodo + datos
      method: '',                // 'manual' | 'url' | 'docs'
      brand_url: '',             // si method=url
      brand_docs: [],            // si method=docs
      description: '',           // si method=manual
      tone_of_voice: '',
      primary_color: '#000000',
      secondary_color: '#ffffff',
      // Step 3 - Operacion
      timezone: 'America/Bogota',
      locale: 'es',
      level_of_autonomy: 'parcial',
      mfa_required: false
    };
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  STEPS = [
    { key: 'identidad', label: 'Identidad' },
    { key: 'metodo',    label: 'Metodo' },
    { key: 'operacion', label: 'Operacion' },
    { key: 'revisar',   label: 'Revisar' }
  ];

  METHODS = [
    { v: 'manual', icon: 'fa-pen-to-square',   label: 'Manual',     hint: 'Lleno los datos a mano (descripcion, tono, paleta)' },
    { v: 'url',    icon: 'fa-magic-wand-sparkles', label: 'Investigacion inteligente', hint: 'Vera escrapea una URL y detecta la identidad' },
    { v: 'docs',   icon: 'fa-file-lines',      label: 'Documentacion oficial', hint: 'Subo brief, brandbook o presentaciones' }
  ];

  TONES = [
    { v: '',             label: '— Selecciona —' },
    { v: 'amigable',     label: 'Amigable' },
    { v: 'premium',      label: 'Premium' },
    { v: 'tecnico',      label: 'Tecnico' },
    { v: 'profesional',  label: 'Profesional' },
    { v: 'casual',       label: 'Casual' },
    { v: 'inspirador',   label: 'Inspirador' },
    { v: 'divertido',    label: 'Divertido' },
    { v: 'autoritario',  label: 'Autoritario' },
    { v: 'empatico',     label: 'Empatico' },
    { v: 'directo',      label: 'Directo' }
  ];

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
    return `
      <ol class="provision-progress" style="--provision-step-count: ${this.STEPS.length}" aria-label="Progreso del flujo">
        ${this.STEPS.map((s, i) => {
          let state;
          if (i < idx) state = 'is-done';
          else if (i === idx) state = 'is-current';
          else state = 'is-pending';
          const marker = (state === 'is-done') ? '<i class="fas fa-check"></i>' : String(i + 1);
          return `
            <li class="provision-progress-item ${state}" data-step="${s.key}">
              <span class="provision-progress-caret" aria-hidden="true">
                <i class="fas fa-caret-down"></i>
              </span>
              <span class="provision-progress-marker">${marker}</span>
              <span class="provision-progress-label">${this.escapeHtml(s.label)}</span>
            </li>
          `;
        }).join('')}
      </ol>
    `;
  }

  renderCurrentStep() {
    switch (this.currentStep) {
      case 'identidad': return this.renderStepIdentidad();
      case 'metodo':    return this.renderStepMetodo();
      case 'operacion': return this.renderStepOperacion();
      case 'revisar':   return this.renderStepRevisar();
      default:          return '';
    }
  }

  renderStepIdentidad() {
    const f = this.form;
    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 1 · Identidad</span>
          <h2>Identidad basica de la marca</h2>
          <p>Logo, nombre y slogan. Lo demas (descripcion, tono, paleta) se llena en el siguiente paso segun el metodo que elijas.</p>
        </header>

        <form id="createOrgIdentityForm" class="createorg-form-grid" novalidate>
          <div class="provision-field createorg-field-full createorg-logo-wrap">
            <label class="createorg-logo-circle" for="orgLogoFile" id="orgLogoCircle">
              <input type="file" id="orgLogoFile" accept="image/*" hidden>
              ${f.logo_preview
                ? `<img src="${this.escapeHtml(f.logo_preview)}" alt="Logo" class="createorg-logo-img">
                   <button type="button" class="createorg-logo-remove" data-action="logo-remove" aria-label="Quitar logo"><i class="fas fa-times"></i></button>`
                : `<span class="createorg-logo-placeholder"><i class="fas fa-camera"></i></span>`}
            </label>
            <span class="createorg-logo-caption">
              ${f.logo_file
                ? this.escapeHtml(f.logo_file.name) + ' · ' + this.formatSize(f.logo_file.size)
                : 'Adjuntar logo'}
            </span>
            <small class="createorg-logo-hint">PNG · JPG · SVG. Click en el circulo para subir.</small>
          </div>

          <div class="provision-field createorg-field-full">
            <label for="orgName">Nombre <span style="color:#ef4444">*</span></label>
            <input id="orgName" name="name" type="text" placeholder="Ej. ACME Corp" maxlength="120" value="${this.escapeHtml(f.name)}" required>
            <small>El brand_container hereda este mismo nombre automaticamente.</small>
          </div>

          <div class="provision-field createorg-field-full">
            <label for="orgSlogan">Slogan</label>
            <input id="orgSlogan" name="slogan" type="text" placeholder="Frase de marca" maxlength="200" value="${this.escapeHtml(f.slogan)}">
          </div>

          <p class="provision-form-status createorg-field-full" id="createOrgStatus" role="status" aria-live="polite"></p>
        </form>
      </section>

      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Back</button>
        <button type="button" class="provision-next-btn" data-action="next" aria-label="Siguiente">
          <i class="fas fa-arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepMetodo() {
    const f = this.form;
    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 2 · Metodo</span>
          <h2>Como llenamos el brand_container</h2>
          <p>Elige una via: manual, escrape de URL, o subiendo documentos. Tambien puedes saltar este paso y completar despues desde Brand.</p>
        </header>

        <div class="createorg-method-grid" role="radiogroup" aria-label="Metodo">
          ${this.METHODS.map((m) => `
            <label class="createorg-method-option">
              <input type="radio" name="method" value="${m.v}" ${m.v === f.method ? 'checked' : ''}>
              <span class="createorg-method-card">
                <span class="createorg-method-icon"><i class="fas ${m.icon}"></i></span>
                <strong>${this.escapeHtml(m.label)}</strong>
                <small>${this.escapeHtml(m.hint)}</small>
              </span>
            </label>
          `).join('')}
        </div>

        <div class="createorg-method-content" id="createOrgMethodContent">
          ${this.renderMethodForm()}
        </div>
      </section>

      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Back</button>
        <button type="button" class="provision-next-btn" data-action="next" aria-label="Siguiente">
          <i class="fas fa-arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderMethodForm() {
    const m = this.form.method;
    if (!m) {
      return `
        <div class="createorg-method-empty">
          <i class="fas fa-arrow-up"></i>
          Elige un metodo arriba para continuar.
        </div>
      `;
    }
    if (m === 'manual') return this.renderMethodManual();
    if (m === 'url')    return this.renderMethodUrl();
    if (m === 'docs')   return this.renderMethodDocs();
    return '';
  }

  renderMethodManual() {
    const f = this.form;
    return `
      <form id="createOrgManualForm" class="createorg-form-grid" novalidate>
        <div class="provision-field createorg-field-full">
          <label for="orgDescription">Descripcion</label>
          <textarea id="orgDescription" name="description" rows="3" placeholder="A que se dedica la marca, mision, propuesta de valor.">${this.escapeHtml(f.description)}</textarea>
        </div>
        <div class="provision-field">
          <label for="orgTone">Tono de voz</label>
          <select id="orgTone" name="tone_of_voice">
            ${this.TONES.map((t) =>
              `<option value="${t.v}" ${t.v === f.tone_of_voice ? 'selected' : ''}>${this.escapeHtml(t.label)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="provision-field">
          <label>Paleta de colores</label>
          <div class="createorg-palette-row">
            <label class="createorg-color-chip">
              <input id="orgPrimaryColor" type="color" value="${this.escapeHtml(f.primary_color)}">
              <span class="createorg-color-label">Primario</span>
            </label>
            <label class="createorg-color-chip">
              <input id="orgSecondaryColor" type="color" value="${this.escapeHtml(f.secondary_color)}">
              <span class="createorg-color-label">Secundario</span>
            </label>
          </div>
        </div>
      </form>
    `;
  }

  renderMethodUrl() {
    const f = this.form;
    return `
      <form id="createOrgUrlForm" class="createorg-form-grid" novalidate>
        <div class="provision-field createorg-field-full">
          <label for="orgBrandUrl">URL del sitio o redes</label>
          <input id="orgBrandUrl" name="brand_url" type="url" placeholder="https://acme.com" value="${this.escapeHtml(f.brand_url)}">
          <small>Vera escrapeara para inferir descripcion, tono, paleta y mas. Sitio web, Instagram, LinkedIn — funciona con cualquiera de esos.</small>
        </div>
        <div class="createorg-method-hint createorg-field-full">
          <i class="fas fa-magic-wand-sparkles"></i>
          Auto-fill del scraper pendiente de implementacion. Por ahora solo guardamos la URL.
        </div>
      </form>
    `;
  }

  renderMethodDocs() {
    return `
      <form id="createOrgDocsForm" class="createorg-form-grid" novalidate>
        <div class="provision-field createorg-field-full">
          <label>Documentacion oficial</label>
          <label class="createorg-dropzone" for="orgBrandDocs">
            <input type="file" id="orgBrandDocs" multiple accept="application/pdf,image/*,.doc,.docx,.ppt,.pptx" hidden>
            <i class="fas fa-cloud-upload-alt"></i>
            <strong>Adjuntar archivos</strong>
            <small>Brief, brandbook, presentaciones. PDF · DOCX · PPT · imagenes</small>
          </label>
          <ul class="createorg-files-list" id="orgFilesList"></ul>
        </div>
        <div class="createorg-method-hint createorg-field-full">
          <i class="fas fa-magic-wand-sparkles"></i>
          Auto-fill del scraper pendiente. Por ahora guardamos los archivos para procesarlos despues.
        </div>
      </form>
    `;
  }

  renderStepOperacion() {
    const f = this.form;
    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 3 · Operacion</span>
          <h2>Region, autonomia y seguridad</h2>
          <p>Zona horaria + idioma de la org, cuanto puede actuar Vera sin aprobacion humana, y si MFA es obligatorio para entrar.</p>
        </header>

        <h3 class="createorg-subhead">Region</h3>
        <div class="createorg-form-grid" style="margin-bottom: var(--spacing-md);">
          <div class="provision-field">
            <label for="orgTimezone">Zona horaria</label>
            <select id="orgTimezone" name="timezone" required>
              ${this.TIMEZONES.map((tz) =>
                `<option value="${tz}" ${tz === f.timezone ? 'selected' : ''}>${this.escapeHtml(tz)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="provision-field">
            <label for="orgLocale">Idioma</label>
            <select id="orgLocale" name="locale" required>
              ${this.LOCALES.map((l) =>
                `<option value="${l.v}" ${l.v === f.locale ? 'selected' : ''}>${this.escapeHtml(l.label)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <h3 class="createorg-subhead">Nivel de autonomia</h3>
        <div class="createorg-autonomy" role="radiogroup" aria-label="Nivel de autonomia">
          ${this.AUTONOMY.map((a) => `
            <label class="createorg-autonomy-option">
              <input type="radio" name="level_of_autonomy" value="${a.v}" ${a.v === f.level_of_autonomy ? 'checked' : ''}>
              <span class="createorg-autonomy-card">
                <strong>${this.escapeHtml(a.label)}</strong>
                <small>${this.escapeHtml(a.desc)}</small>
              </span>
            </label>
          `).join('')}
        </div>

        <h3 class="createorg-subhead">Seguridad</h3>
        <label class="createorg-toggle">
          <input type="checkbox" id="orgMfaRequired" name="mfa_required" ${f.mfa_required ? 'checked' : ''}>
          <span class="createorg-toggle-track"><span class="createorg-toggle-thumb"></span></span>
          <span class="createorg-toggle-meta">
            <strong>MFA obligatorio</strong>
            <small>Todos los miembros deben enrolar TOTP o llave fisica para acceder a esta org.</small>
          </span>
        </label>
      </section>

      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Back</button>
        <button type="button" class="provision-next-btn" data-action="next" aria-label="Siguiente">
          <i class="fas fa-arrow-right"></i>
        </button>
      </footer>
    `;
  }

  renderStepRevisar() {
    const f = this.form;
    const o = this.owner;
    const initials = (o?.full_name || o?.email || '?')
      .split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

    const ownerBlock = o ? `
      <div class="createorg-review-owner">
        <span class="createorg-owner-avatar">${this.escapeHtml(initials)}</span>
        <span class="createorg-owner-info">
          <strong>${this.escapeHtml(o.full_name || '(sin nombre)')}</strong>
          <span>${this.escapeHtml(o.email || '')}</span>
        </span>
        <span class="createorg-owner-tag">OWNER</span>
      </div>
    ` : `
      <div class="createorg-owner-empty">
        <i class="fas fa-user-slash"></i>
        <p>Sin owner asociado — la org se creara sin owner inicial.</p>
      </div>
    `;

    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 4 · Revisar</span>
          <h2>Confirmar y crear</h2>
          <p>Esto es lo que se va a crear. Si algo falta, regresa con Back.</p>
        </header>

        <div class="createorg-review-section">
          <h3 class="createorg-subhead">Owner</h3>
          ${ownerBlock}
        </div>

        <div class="createorg-review-section">
          <h3 class="createorg-subhead">Identidad basica</h3>
          <div class="createorg-review-grid">
            ${this.tile('Nombre', f.name || '—')}
            ${this.tile('Slogan', f.slogan || '—')}
            ${this.tile('Logo', f.logo_file ? f.logo_file.name : '—')}
          </div>
        </div>

        <div class="createorg-review-section">
          <h3 class="createorg-subhead">Metodo brand_container</h3>
          <div class="createorg-review-grid">
            ${this.tile('Metodo', f.method ? (this.METHODS.find(m=>m.v===f.method)?.label || f.method) : 'Sin elegir')}
            ${f.method === 'url' ? this.tile('URL fuente', f.brand_url || '—') : ''}
            ${f.method === 'docs' ? this.tile('Archivos', `${f.brand_docs.length} archivo(s)`) : ''}
            ${f.method === 'manual' ? this.tile('Tono', f.tone_of_voice || '—') : ''}
            ${f.method === 'manual' ? this.tile('Paleta', `${f.primary_color} · ${f.secondary_color}`) : ''}
            ${f.method === 'manual' ? this.tile('Descripcion', f.description ? (f.description.slice(0,60) + (f.description.length > 60 ? '...' : '')) : '—') : ''}
          </div>
        </div>

        <div class="createorg-review-section">
          <h3 class="createorg-subhead">Operacion</h3>
          <div class="createorg-review-grid">
            ${this.tile('Zona horaria', f.timezone)}
            ${this.tile('Idioma', this.LOCALES.find(l=>l.v===f.locale)?.label || f.locale)}
            ${this.tile('Autonomia', f.level_of_autonomy)}
            ${this.tile('MFA', f.mfa_required ? 'Obligatorio' : 'Opcional')}
          </div>
        </div>

        <div class="createorg-pending-note">
          <i class="fas fa-hourglass-half"></i>
          Paso final pendiente — el insert real se cablea despues
        </div>
      </section>

      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Back</button>
        <button type="button" class="createorg-submit-btn" disabled aria-disabled="true">
          <i class="fas fa-check"></i> Crear organizacion
        </button>
      </footer>
    `;
  }

  tile(label, value) {
    return `
      <div class="createorg-review-tile">
        <span class="createorg-review-label">${this.escapeHtml(label)}</span>
        <strong>${this.escapeHtml(String(value))}</strong>
      </div>
    `;
  }

  // ─── Init + navigation ───────────────────────────────────────────────

  async init() {
    this.supabase = await this.getSupabaseClient();
    if (!this.supabase) {
      this.showError('Supabase no disponible.');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    this.jobId = params.get('job') || null;
    await this.loadJobOwner();
    this.wireAll();
  }

  async loadJobOwner() {
    if (!this.jobId) return;
    try {
      const { data, error } = await this.supabase
        .from('provisioning_jobs')
        .select('id, email, full_name, auth_user_id, payload')
        .eq('id', this.jobId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      this.owner = {
        id: data.auth_user_id,
        email: data.email,
        full_name: data.full_name || data?.payload?.account?.full_name || ''
      };
    } catch (err) {
      this.showNotification(`No se pudo cargar el owner: ${err.message}`, 'error');
    }
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
    // Scroll up al cambiar de paso
    const center = this.container.querySelector('.provision-page-center');
    center?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  wireAll() {
    // Step 1 - Identidad basica
    ['orgName', 'orgSlogan'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'input', () => this.syncForm());
    });

    // Step 2 - Metodo: radios + dynamic form
    this.container.querySelectorAll('input[name="method"]').forEach((r) => {
      this.addEventListener(r, 'change', () => this.handleMethodChange(r.value));
    });
    this.wireMethodFormInputs();

    // Step 3 - Operacion: region selects
    ['orgTimezone', 'orgLocale'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'change', () => this.syncForm());
    });

    // Logo circle (single file)
    const logoInput = this.container.querySelector('#orgLogoFile');
    if (logoInput) this.addEventListener(logoInput, 'change', (e) => this.handleLogoFile(e));
    const logoRemove = this.container.querySelector('[data-action="logo-remove"]');
    if (logoRemove) {
      this.addEventListener(logoRemove, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeLogo();
      });
    }

    // Brand docs file input
    const fileInput = this.container.querySelector('#orgBrandDocs');
    if (fileInput) {
      this.addEventListener(fileInput, 'change', (e) => this.handleFiles(e));
      this.renderFiles();
    }

    // Operacion radios + toggle
    this.container.querySelectorAll('input[name="level_of_autonomy"]').forEach((r) => {
      this.addEventListener(r, 'change', () => this.syncForm());
    });
    const mfa = this.container.querySelector('#orgMfaRequired');
    if (mfa) this.addEventListener(mfa, 'change', () => this.syncForm());

    // Back / Next
    const backBtn = this.container.querySelector('[data-action="back"]');
    if (backBtn) this.addEventListener(backBtn, 'click', () => this.handleBack());
    const nextBtn = this.container.querySelector('[data-action="next"]');
    if (nextBtn) this.addEventListener(nextBtn, 'click', () => this.handleNext());
  }

  syncForm() {
    const f = this.form;
    const get = (id) => (this.container.querySelector('#' + id)?.value || '').trim();
    if (this.currentStep === 'identidad') {
      f.name = get('orgName');
      f.slogan = get('orgSlogan');
    }
    if (this.currentStep === 'metodo') {
      // method radio
      const radio = this.container.querySelector('input[name="method"]:checked');
      f.method = radio?.value || '';
      // dynamic form fields
      if (f.method === 'manual') {
        f.description = this.container.querySelector('#orgDescription')?.value || '';
        f.tone_of_voice = get('orgTone');
        f.primary_color = get('orgPrimaryColor') || '#000000';
        f.secondary_color = get('orgSecondaryColor') || '#ffffff';
      }
      if (f.method === 'url') {
        f.brand_url = get('orgBrandUrl');
      }
    }
    if (this.currentStep === 'operacion') {
      f.timezone = get('orgTimezone') || 'UTC';
      f.locale = get('orgLocale') || 'es';
      const radio = this.container.querySelector('input[name="level_of_autonomy"]:checked');
      f.level_of_autonomy = radio?.value || 'parcial';
      f.mfa_required = !!this.container.querySelector('#orgMfaRequired')?.checked;
    }
  }

  // ─── Step 2: Metodo (radio + dynamic form) ───────────────────────────

  handleMethodChange(value) {
    this.form.method = value;
    // Re-renderiza solo el contenido del metodo, preservando el resto
    const host = this.container.querySelector('#createOrgMethodContent');
    if (host) host.innerHTML = this.renderMethodForm();
    // Highlight de la card activa (radios ya se actualizan solos)
    this.container.querySelectorAll('.createorg-method-option').forEach((opt) => {
      const checked = opt.querySelector('input[type="radio"]')?.checked;
      opt.classList.toggle('is-active', !!checked);
    });
    this.wireMethodFormInputs();
  }

  wireMethodFormInputs() {
    // Manual: description (textarea), tone, palette
    const desc = this.container.querySelector('#orgDescription');
    if (desc) this.addEventListener(desc, 'input', () => this.syncForm());
    ['orgTone', 'orgPrimaryColor', 'orgSecondaryColor'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'change', () => this.syncForm());
    });
    // URL: brand_url
    const url = this.container.querySelector('#orgBrandUrl');
    if (url) this.addEventListener(url, 'input', () => this.syncForm());
    // Docs: dropzone (file input)
    const docsInput = this.container.querySelector('#orgBrandDocs');
    if (docsInput) {
      this.addEventListener(docsInput, 'change', (e) => this.handleFiles(e));
      this.renderFiles();
    }
  }

  handleLogoFile(e) {
    const file = (e.target.files || [])[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.setStatus('El logo debe ser una imagen (PNG/JPG/SVG).', 'error');
      e.target.value = '';
      return;
    }
    this.form.logo_file = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      this.form.logo_preview = ev.target?.result || '';
      this.refreshLogoCircle();
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // permite re-seleccionar el mismo archivo si lo borran
  }

  removeLogo() {
    this.form.logo_file = null;
    this.form.logo_preview = '';
    this.refreshLogoCircle();
  }

  refreshLogoCircle() {
    const wrap = this.container.querySelector('.createorg-logo-wrap');
    if (!wrap) return;
    const f = this.form;
    const circleHTML = f.logo_preview
      ? `<img src="${this.escapeHtml(f.logo_preview)}" alt="Logo" class="createorg-logo-img">
         <button type="button" class="createorg-logo-remove" data-action="logo-remove" aria-label="Quitar logo"><i class="fas fa-times"></i></button>`
      : `<span class="createorg-logo-placeholder"><i class="fas fa-camera"></i></span>`;
    const circle = wrap.querySelector('#orgLogoCircle');
    if (circle) {
      // Mantener el input file vivo, solo cambiar el contenido visual
      const input = circle.querySelector('#orgLogoFile');
      circle.innerHTML = '';
      if (input) circle.appendChild(input);
      circle.insertAdjacentHTML('beforeend', circleHTML);
    }
    const caption = wrap.querySelector('.createorg-logo-caption');
    if (caption) {
      caption.textContent = f.logo_file
        ? `${f.logo_file.name} · ${this.formatSize(f.logo_file.size)}`
        : 'Adjuntar logo';
    }
    // Re-wire del remove button (innerHTML lo recreo)
    const newRemove = wrap.querySelector('[data-action="logo-remove"]');
    if (newRemove) {
      this.addEventListener(newRemove, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeLogo();
      });
    }
  }

  handleFiles(e) {
    const files = Array.from(e.target.files || []);
    this.form.brand_docs = [...this.form.brand_docs, ...files];
    this.renderFiles();
    e.target.value = ''; // reset para re-seleccionar el mismo si lo borraron
  }

  renderFiles() {
    const list = this.container.querySelector('#orgFilesList');
    if (!list) return;
    if (this.form.brand_docs.length === 0) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = this.form.brand_docs.map((f, i) => `
      <li class="createorg-file-item">
        <i class="fas fa-file"></i>
        <span class="createorg-file-name">${this.escapeHtml(f.name)}</span>
        <span class="createorg-file-size">${this.formatSize(f.size)}</span>
        <button type="button" class="createorg-file-remove" data-remove="${i}" aria-label="Quitar">
          <i class="fas fa-times"></i>
        </button>
      </li>
    `).join('');
    list.querySelectorAll('[data-remove]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => {
        const idx = parseInt(btn.getAttribute('data-remove'), 10);
        this.form.brand_docs.splice(idx, 1);
        this.renderFiles();
      });
    });
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  handleBack() {
    const idx = this.STEPS.findIndex((s) => s.key === this.currentStep);
    if (idx <= 0) {
      // Primer paso → volver al wizard de provisioning
      if (window.router) window.router.navigate('/dev/provisioning/users');
      else window.location.href = '/dev/provisioning/users';
      return;
    }
    this.goToStep(this.STEPS[idx - 1].key);
  }

  handleNext() {
    const idx = this.STEPS.findIndex((s) => s.key === this.currentStep);
    if (idx === this.STEPS.length - 1) return; // ultimo paso, sin next
    const err = this.validateStep(this.currentStep);
    if (err) {
      this.setStatus(err, 'error');
      return;
    }
    this.setStatus('', '');
    this.goToStep(this.STEPS[idx + 1].key);
  }

  validateStep(key) {
    if (key === 'identidad') {
      if (!this.form.name) return 'El nombre es obligatorio.';
    }
    return null;
  }

  setStatus(text, type) {
    const el = this.container.querySelector('#createOrgStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'provision-form-status';
    if (type === 'error') el.classList.add('is-error');
  }
}

window.DevLeadCreateOrgView = DevLeadCreateOrgView;
