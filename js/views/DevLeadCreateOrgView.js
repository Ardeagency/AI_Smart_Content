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
    this.currentStep = 'mode';
    this.creationMode = null;       // 'manual' | 'auto' — elegido en el paso 1

    this.form = {
      // Step 1 - Identidad basica
      name: '',
      slogan: '',
      logo_file: null,
      logo_preview: '',
      // Step 2 - Metodo + region (region solo si manual; URL/docs lo detecta scraper)
      method: '',                // 'manual' | 'url' | 'docs'
      brand_url: '',             // si method=url
      brand_docs: [],            // si method=docs
      timezone: 'America/Bogota',
      locale: 'es',
      idiomas_contenido: [],     // text[]: ['es','en']
      mercado_objetivo: [],      // text[]: ['CO','MX']
      // Step 3 - Detalles de marca (solo si method=manual)
      // Verbal
      tone_of_voice: '',
      tagline: '',
      pilares: [],               // text[]
      palabras_clave: [],        // text[]
      palabras_prohibidas: [],   // text[]
      propuesta_valor: '',       // text
      mision_vision: '',         // text
      // Visual
      primary_color: '#000000',
      secondary_color: '#ffffff',
      typography_primary: '',
      typography_secondary: '',
      estetica: '',              // text
      temas: [],                 // text[] (sub_nichos)
      // Step 4 - Operacion
      level_of_autonomy: 'parcial',
      mfa_required: false
    };
    // Scraping state (Step 2 con method=url o docs)
    this.scrapeJobId = null;
    this.scrapeStatus = null;       // {status, stage, progress, brand_payload, error, ...}
    this.scrapePollTimer = null;
    this.scrapeError = null;
    this.scraped_brand = false;     // true cuando un scrape exitoso pre-poblo form

    // Standalone (entrada "+ Org" desde el sidebar, sin ?job): el lead elige
    // un usuario existente como owner en un primer paso.
    this.standalone = false;
    this.consumers = [];            // usuarios no-developers para el selector de owner
    this._creating = false;
    this.autoIntegrations = [];     // providers elegidos en la ruta automatica
    // Estado de la ruta automatica (shell → scrape → apply)
    this.autoPhase = null;          // null | 'creating' | 'scraping' | 'done' | 'error'
    this.autoOrgId = null;
    this.autoContainerId = null;    // mercado (brand_container) del org nuevo — para conectar integraciones
    this.autoJobId = null;
    this.autoStatus = null;         // ultimo status del job de scrape
    this.autoError = null;
    this._autoTimer = null;
    // Aprobacion (paginas editables tras el scrape)
    this.approval = null;           // objeto editable cargado del brand_payload
    this.approvalIdx = 0;
    this._approvalSaving = false;
  }

  // Paginas de aprobacion (orden jerarquico). La ultima es resumen/finalizar.
  APPROVAL_PAGES = [
    { key: 'identity',    label: 'Identidad' },
    { key: 'market',      label: 'Mercado e idioma' },
    { key: 'voice',       label: 'Voz y mensaje' },
    { key: 'colors',      label: 'Colores' },
    { key: 'fonts',       label: 'Tipografia' },
    { key: 'products',    label: 'Productos' },
    { key: 'competitors', label: 'Competencia' },
    { key: 'vera',        label: 'Agente Vera' },
    { key: 'owner',       label: 'Owner y miembros' },
    { key: 'review',      label: 'Listo' }
  ];

  // Nichos REALES de mercado (en sync con el enum del backend brand-consolidator).
  MARKET_NICHES = [
    'snacks saludables', 'alimentos y bebidas', 'comida saludable', 'cafe', 'reposteria',
    'bebidas energeticas', 'bebidas funcionales', 'suplementos y nutricion deportiva', 'vitaminas y suplementos',
    'skincare', 'maquillaje', 'cuidado del cabello', 'perfumeria', 'cuidado personal e higiene',
    'moda femenina', 'moda masculina', 'ropa deportiva', 'calzado', 'accesorios de moda', 'joyeria y relojeria',
    'tecnologia y electronica', 'accesorios tecnologicos', 'software y apps', 'gaming',
    'fitness y entrenamiento', 'bienestar y salud', 'salud (servicios medicos)',
    'hogar y decoracion', 'muebles', 'electrodomesticos',
    'educacion y cursos', 'consultoria y agencias', 'servicios financieros y fintech', 'turismo y viajes',
    'mascotas', 'bebes y maternidad', 'automotriz', 'deportes y outdoor',
    'libreria y papeleria', 'jugueteria', 'arte y manualidades', 'ecommerce y retail', 'restaurantes y food service',
    'otro'
  ];

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async destroy() {
    this.stopScrapePolling();
    this.stopAutoPoll();
    super.destroy?.();
  }

  // Steps activos dependen de method: si manual o si el scrape pre-llenó datos
  // se incluye un step 'brand' para revisar/editar la info detectada.
  getActiveSteps() {
    // Paso 1 SIEMPRE: elegir modo (manual vs automatico) — rutas distintas.
    const out = [{ key: 'mode', label: 'Modo' }];

    if (this.creationMode === 'manual') {
      out.push(
        { key: 'identidad', label: 'Identidad' },
        { key: 'metodo',    label: 'Metodo' }
      );
      if (this.form.method === 'manual' || this.scraped_brand) {
        out.push({ key: 'brand', label: 'Marca' });
      }
      out.push(
        { key: 'operacion', label: 'Operacion' },
        { key: 'revisar',   label: 'Revisar' }
      );
    } else if (this.creationMode === 'auto') {
      // Ruta automatica (en construccion — se define con el usuario).
      out.push({ key: 'auto', label: 'Automatico' });
    }

    // Owner va AL FINAL en la ruta MANUAL (por defecto la org se crea a nombre
    // del dev; el owner se conecta opcionalmente al final). En la ruta auto el
    // shell se crea temprano y el owner se asigna luego desde Orgs/Consumidores.
    if (this.standalone && this.creationMode === 'manual') out.push({ key: 'owner', label: 'Owner' });
    return out;
  }

  _isLastStep(key) {
    const s = this.getActiveSteps();
    return s.length > 0 && s[s.length - 1].key === (key || this.currentStep);
  }

  // Footer Back + (Crear si es el ultimo paso, si no Siguiente).
  _footerButtons() {
    const main = this._isLastStep()
      ? `<button type="button" class="createorg-submit-btn" data-action="create"><i class="fas fa-check"></i> Crear organizacion</button>`
      : `<button type="button" class="provision-next-btn" data-action="next" aria-label="Siguiente"><i class="fas fa-arrow-right"></i></button>`;
    return `<button type="button" class="provision-back-btn" data-action="back">Back</button>${main}`;
  }

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
      <div class="provision-page createorg-split">
        ${this.renderSplitBody()}
      </div>
    `;
  }

  // Cuerpo en 2 columnas: izquierda los elementos para crear la org,
  // derecha el progreso/pasos en vertical.
  renderSplitBody() {
    return `
      <main class="createorg-col-left">
        <div class="provision-page-center">${this.renderCurrentStep()}</div>
      </main>
      <aside class="createorg-col-right">
        <span class="createorg-progress-head">Progreso</span>
        <div class="provision-page-progress">${this.renderProgress()}</div>
      </aside>
    `;
  }

  renderProgress() {
    // Durante la aprobacion, el progreso de la derecha refleja las paginas de aprobacion.
    let steps, idx;
    if (this.currentStep === 'auto' && this.autoPhase === 'approving') {
      steps = this.APPROVAL_PAGES;
      idx = this.approvalIdx;
    } else {
      steps = this.getActiveSteps();
      idx = steps.findIndex((s) => s.key === this.currentStep);
    }
    return `
      <ol class="provision-progress" style="--provision-step-count: ${steps.length}" aria-label="Progreso del flujo">
        ${steps.map((s, i) => {
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
      case 'mode':      return this.renderStepMode();
      case 'auto':      return this.renderStepAuto();
      case 'owner':     return this.renderStepOwner();
      case 'identidad': return this.renderStepIdentidad();
      case 'metodo':    return this.renderStepMetodo();
      case 'brand':     return this.renderStepBrand();
      case 'operacion': return this.renderStepOperacion();
      case 'revisar':   return this.renderStepRevisar();
      default:          return '';
    }
  }

  // ─── Paso 1: Modo de creacion (manual vs automatico) ─────────────────
  renderStepMode() {
    const modes = [
      { v: 'manual', icon: 'fa-pen-to-square',       label: 'Crear manualmente',
        hint: 'Tu llenas la identidad, el mercado y el brand DNA paso a paso.' },
      { v: 'auto',   icon: 'fa-magic-wand-sparkles', label: 'Crear automaticamente',
        hint: 'Das una fuente (URL/datos) y Vera investiga y arma la org sola.' }
    ];
    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 1 · Modo</span>
          <h2>Como quieres crear la organizacion?</h2>
          <p>Elige el camino. Manual y automatico siguen rutas completamente distintas.</p>
        </header>
        <div class="provision-type-grid createorg-mode-grid" role="radiogroup" aria-label="Modo de creacion">
          ${modes.map((m) => {
            const active = this.creationMode === m.v;
            return `
              <button type="button" class="provision-type-card ${active ? 'is-active' : ''}" data-mode="${m.v}" role="radio" aria-checked="${active ? 'true' : 'false'}">
                <span class="provision-type-icon"><i class="fas ${m.icon}"></i></span>
                <span class="provision-type-label">${this.escapeHtml(m.label)}</span>
                <span class="provision-type-hint">${this.escapeHtml(m.hint)}</span>
              </button>`;
          }).join('')}
        </div>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Back</button>
        <button type="button" class="provision-next-btn" data-action="next" aria-label="Siguiente" ${this.creationMode ? '' : 'disabled'}><i class="fas fa-arrow-right"></i></button>
      </footer>
    `;
  }

  // Ruta automatica — Paso 2: fuente (URL) + integraciones.
  // Con esto el pipeline (siguiente fase) scrapea la marca: nombre, colores,
  // tipografias, ADN, logo, sistema de comunicacion (OpenAI), competencia,
  // palabras/URLs a monitorear; y si conecta su tienda, importa productos.
  AUTO_PROVIDERS = [
    { v: 'shopify',      icon: 'fa-bag-shopping',  label: 'Shopify' },
    { v: 'mercadolibre', icon: 'fa-store',         label: 'Mercado Libre' },
    { v: 'amazon',       icon: 'fa-box',           label: 'Amazon' },
    { v: 'woocommerce',  icon: 'fa-cart-shopping', label: 'WooCommerce' }
  ];

  renderStepAuto() {
    if (this.autoPhase) return this.renderAutoProgress();
    const f = this.form;
    const chips = this.AUTO_PROVIDERS.map((p) => {
      const on = (this.autoIntegrations || []).includes(p.v);
      return `
        <button type="button" class="createorg-intg-chip ${on ? 'is-on' : ''}" data-intg="${p.v}" aria-pressed="${on ? 'true' : 'false'}">
          <i class="fas ${p.icon}"></i> ${this.escapeHtml(p.label)}
          <span class="createorg-intg-mark"><i class="fas ${on ? 'fa-check' : 'fa-plus'}"></i></span>
        </button>`;
    }).join('');

    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 2 · Fuente</span>
          <h2>Danos tu web y conecta tu tienda</h2>
          <p>Con esto Vera investiga tu marca automaticamente: nombre, colores, tipografias, ADN, logo, sistema de comunicacion, competencia real y palabras/URLs a monitorear. Si conectas tu tienda, importa tus productos.</p>
        </header>
        <form id="createOrgAutoForm" class="createorg-form-grid" novalidate>
          <div class="provision-field createorg-field-full">
            <label for="autoUrl">URL de tu web <span style="color:#ef4444">*</span></label>
            <input id="autoUrl" type="url" class="form-control" placeholder="https://tumarca.com" value="${this.escapeHtml(f.brand_url || '')}">
            <small>De aqui sacamos identidad visual + verbal y la base del analisis.</small>
          </div>
          <div class="provision-field createorg-field-full">
            <label>Conecta integraciones <span class="form-hint" style="font-weight:400">(opcional · importa productos)</span></label>
            <div class="createorg-integrations">${chips}</div>
            <small>La autorizacion OAuth se completa al crear la org (la tienda se vincula al mercado nuevo).</small>
          </div>
          <p class="provision-form-status createorg-field-full" id="createOrgStatus" role="status" aria-live="polite"></p>
        </form>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="back">Back</button>
        <button type="button" class="createorg-submit-btn" data-action="auto-create"><i class="fas fa-magic-wand-sparkles"></i> Crear y analizar</button>
      </footer>
    `;
  }

  // Pantalla de progreso de la ruta automatica (shell → scrape → apply).
  renderAutoProgress() {
    if (this.autoPhase === 'approving') return this.renderApprovalPage();
    if (this.autoPhase === 'noContent') return this.renderNoContent();

    const st = this.autoStatus || {};
    const prog = st.progress || {};
    const pages = prog.pages_crawled != null ? prog.pages_crawled : null;

    if (this.autoPhase === 'done') {
      const ap = prog.apply || {};
      const comp = prog.competitors || {};
      const head = ap.logo
        ? `<img src="${this.escapeHtml(ap.logo)}" alt="logo" class="createorg-done-logo" onerror="this.style.display='none'">`
        : `<span class="provision-verify-icon provision-verify-icon--success"><i class="fas fa-check"></i></span>`;
      return `
        <section class="provision-verify-card provision-final-card">
          ${head}
          <h2>Organizacion creada y analizada</h2>
          <p>Vera investigo <strong>${this.escapeHtml(this.form.brand_url || '')}</strong> y lleno la base de la marca.</p>
          <p class="provision-verify-meta">
            ${ap.logo ? 'logo · ' : ''}${ap.colors != null ? `${ap.colors} colores · ` : ''}${ap.fonts != null ? `${ap.fonts} tipografias · ` : ''}${ap.pillars != null ? `${ap.pillars} pilares` : ''} guardados.
          </p>
          ${comp.seeded ? `<p class="provision-verify-meta"><i class="fas fa-crosshairs"></i> ${comp.competitors || 0} competidores · ${comp.watchers || 0} sitios en monitoreo</p>` : ''}
          ${this._autoIntegrationsBlock()}
        </section>
        <footer class="provision-page-actions">
          <button type="button" class="provision-back-btn" data-action="auto-reset">Crear otra</button>
          <button type="button" class="createorg-submit-btn" data-action="auto-goto-orgs"><i class="fas fa-arrow-right"></i> Ver organizaciones</button>
        </footer>
      `;
    }

    if (this.autoPhase === 'error') {
      return `
        <section class="provision-verify-card">
          <span class="provision-verify-icon" style="color:#ef6b6b"><i class="fas fa-triangle-exclamation"></i></span>
          <h2>Algo fallo en el analisis</h2>
          <p class="provision-verify-status">${this.escapeHtml(this.autoError || 'Error desconocido')}</p>
          <p class="provision-verify-meta">${this.autoOrgId ? 'El shell de la org si se creo — puedes verla en Organizaciones y reintentar el analisis luego.' : ''}</p>
        </section>
        <footer class="provision-page-actions">
          <button type="button" class="provision-back-btn" data-action="auto-reset">Volver</button>
          ${this.autoOrgId ? '<button type="button" class="createorg-submit-btn" data-action="auto-goto-orgs"><i class="fas fa-arrow-right"></i> Ver organizaciones</button>' : ''}
        </footer>
      `;
    }

    // creating | scraping → checklist en vivo de lo que se esta obteniendo
    const phase = prog.phase || (this.autoPhase === 'creating' ? 'queued' : 'crawling');
    const RANK = { queued: 0, crawling: 1, crawling_done: 2, extracting_done: 3, consolidating: 3, consolidating_done: 4, applied: 5, apply_failed: 5, competitors_seeded: 6, competitors_failed: 6 };
    const rank = this.autoPhase === 'creating' ? 0 : (RANK[phase] != null ? RANK[phase] : 1);
    const steps = [
      { label: 'Creando la organizacion', done: 1 },
      { label: 'Navegando tu sitio web', done: 2 },
      { label: 'Analizando paginas y contenido', done: 3 },
      { label: 'Obteniendo el ADN de la marca (IA)', done: 5 },
      { label: 'Guardando identidad y descargando logo', done: 6 },
      { label: 'Buscando la competencia real', done: 99 }
    ];
    const items = steps.map((s, i) => {
      const prevDone = i === 0 ? 0 : steps[i - 1].done;
      const state = rank >= s.done ? 'done' : (rank >= prevDone ? 'active' : 'pending');
      const mark = state === 'done' ? '<i class="fas fa-check"></i>'
        : state === 'active' ? '<i class="fas fa-circle-notch fa-spin"></i>'
        : '<span class="createorg-load-dot"></span>';
      return `<li class="createorg-load-item is-${state}"><span class="createorg-load-mark">${mark}</span><span>${this.escapeHtml(s.label)}</span></li>`;
    }).join('');
    return `
      <section class="provision-verify-card createorg-loading-card">
        <h2>Construyendo tu marca</h2>
        <p class="provision-verify-meta">${st.stage ? this.escapeHtml(st.stage) : 'Vera esta investigando tu sitio...'}${pages != null ? ` · ${pages} paginas` : ''}</p>
        <ul class="createorg-load-list">${items}</ul>
      </section>
    `;
  }

  toggleAutoIntegration(v) {
    const set = new Set(this.autoIntegrations || []);
    set.has(v) ? set.delete(v) : set.add(v);
    this.autoIntegrations = [...set];
    const chip = this.container.querySelector(`[data-intg="${v}"]`);
    if (chip) {
      const on = set.has(v);
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      const mark = chip.querySelector('.createorg-intg-mark i');
      if (mark) mark.className = `fas ${on ? 'fa-check' : 'fa-plus'}`;
    }
  }

  selectCreationMode(v) {
    this.creationMode = v;
    this.container.querySelectorAll('.provision-type-card[data-mode]').forEach((c) => {
      const active = c.getAttribute('data-mode') === v;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    const nextBtn = this.container.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.disabled = false;
    // El set de pasos cambio segun el modo → refrescar el progreso.
    const ph = this.container.querySelector('.provision-page-progress');
    if (ph) ph.innerHTML = this.renderProgress();
  }

  renderStepOwner() {
    const opts = this.consumers.length
      ? '<option value="">— A mi nombre (dev) por ahora —</option>' +
        this.consumers.map((c) => {
          const sel = this.owner?.id === c.id ? 'selected' : '';
          const label = `${c.full_name || '(sin nombre)'} · ${c.email || ''}`;
          return `<option value="${this.escapeHtml(c.id)}" ${sel}>${this.escapeHtml(label)}</option>`;
        }).join('')
      : '<option value="">No hay usuarios consumidores</option>';

    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso final · Owner</span>
          <h2>Conectar un owner</h2>
          <p>Por defecto la organizacion queda a tu nombre (dev) hasta que se conecte un owner. Si quieres, elige ahora un usuario consumidor como owner. Solo se listan usuarios que NO son developers.</p>
        </header>
        <form id="createOrgOwnerForm" class="createorg-form-grid" novalidate>
          <div class="provision-field createorg-field-full">
            <label for="orgOwnerSelect">Usuario owner (opcional)</label>
            <select id="orgOwnerSelect" class="form-control">${opts}</select>
          </div>
          <p class="provision-form-status createorg-field-full" id="createOrgStatus" role="status" aria-live="polite"></p>
        </form>
      </section>
      <footer class="provision-page-actions">
        ${this._footerButtons()}
      </footer>
    `;
  }

  async loadConsumers() {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, email, full_name')
        .or('is_developer.is.null,is_developer.eq.false')
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.consumers = Array.isArray(data) ? data : [];
    } catch (err) {
      this.consumers = [];
      this.showNotification(`No se pudieron cargar usuarios: ${err.message}`, 'error');
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
    if (this.scrapeJobId) return this.renderScrapeProgress();
    if (this.scrapeError)  return this.renderScrapeError();
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

  renderScrapeProgress() {
    const s = this.scrapeStatus || {};
    const prog = s.progress || {};
    const stageMap = {
      queued:        { label: 'En cola',                  pct: 5 },
      crawling:      { label: 'Descubriendo rutas',       pct: 25 },
      extracting:    { label: 'Analizando paginas',       pct: 55 },
      consolidating: { label: 'Consultando Vera (gpt-4o)', pct: 80 },
      done:          { label: 'Listo',                    pct: 100 },
      failed:        { label: 'Fallo',                    pct: 0 },
    };
    const cur = stageMap[s.status] || stageMap.queued;
    const stageText = s.stage || cur.label;

    const detailLines = [];
    if (prog.pages_crawled !== undefined) {
      detailLines.push(`${prog.pages_crawled} paginas crawleadas${prog.queue_remaining ? ` · ${prog.queue_remaining} pendientes` : ''}`);
    }
    if (prog.colors_found !== undefined) {
      detailLines.push(`${prog.colors_found} colores · ${prog.products_found || 0} productos · ${prog.services_found || 0} servicios`);
    }
    if (prog.llm_cost_usd !== undefined) {
      detailLines.push(`gpt-4o ~$${Number(prog.llm_cost_usd).toFixed(3)}`);
    }

    return `
      <div class="createorg-scrape-progress">
        <div class="createorg-scrape-spinner"><i class="fas fa-circle-notch fa-spin"></i></div>
        <strong class="createorg-scrape-stage">${this.escapeHtml(stageText)}</strong>
        <div class="createorg-scrape-bar"><span style="width:${cur.pct}%"></span></div>
        ${detailLines.map((l) => `<small>${this.escapeHtml(l)}</small>`).join('')}
        <p class="createorg-scrape-note">Esto tarda 1-4 minutos segun el tamano del sitio. Puedes esperar aqui.</p>
      </div>
    `;
  }

  renderScrapeError() {
    return `
      <div class="createorg-method-empty">
        <i class="fas fa-triangle-exclamation" style="color:#ef4444"></i>
        <strong>Error al analizar la fuente</strong>
        <small style="display:block;margin-top:4px">${this.escapeHtml(this.scrapeError || 'Error desconocido')}</small>
        <button type="button" class="provision-back-btn" style="margin-top:12px" data-action="scrape-reset">Reintentar</button>
      </div>
    `;
  }

  renderMethodManual() {
    const f = this.form;
    return `
      <form id="createOrgManualForm" class="createorg-form-grid" novalidate>
        <h4 class="createorg-subhead createorg-field-full" style="margin-top:0">Region y mercado</h4>
        <div class="provision-field">
          <label for="orgTimezone">Zona horaria</label>
          <select id="orgTimezone" name="timezone" required>
            ${this.TIMEZONES.map((tz) =>
              `<option value="${tz}" ${tz === f.timezone ? 'selected' : ''}>${this.escapeHtml(tz)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="provision-field">
          <label for="orgLocale">Idioma principal</label>
          <select id="orgLocale" name="locale" required>
            ${this.LOCALES.map((l) =>
              `<option value="${l.v}" ${l.v === f.locale ? 'selected' : ''}>${this.escapeHtml(l.label)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="provision-field createorg-field-full">
          <label for="orgIdiomasContenido">Idiomas de contenido</label>
          <input id="orgIdiomasContenido" name="idiomas_contenido" type="text" placeholder="es, en, pt" value="${this.escapeHtml((f.idiomas_contenido || []).join(', '))}">
          <small>Codigos ISO separados por coma. Si no aplica, deja vacio.</small>
        </div>
        <div class="provision-field createorg-field-full">
          <label for="orgMercado">Mercados objetivo</label>
          <input id="orgMercado" name="mercado_objetivo" type="text" placeholder="CO, MX, US" value="${this.escapeHtml((f.mercado_objetivo || []).join(', '))}">
          <small>Codigos ISO de pais separados por coma.</small>
        </div>
        <p class="createorg-method-hint createorg-field-full" style="margin-top:6px">
          <i class="fas fa-circle-info"></i>
          En el siguiente paso configuras todos los detalles de la marca (colores, tipografia, tono, temas, palabras).
        </p>
      </form>
    `;
  }

  renderStepBrand() {
    const f = this.form;
    const isScraped = this.scraped_brand;
    const detectedBadge = '<span class="createorg-detected-badge" title="Detectado por el scraper"><i class="fas fa-magic-wand-sparkles"></i> auto</span>';
    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso 3 · Marca</span>
          <h2>${isScraped ? 'Revisa lo que detectamos' : 'Detalles del brand container'}</h2>
          <p>${isScraped
            ? 'Vera analizo tu sitio y prellena los campos. Edita lo que necesites antes de continuar.'
            : 'Llena lo que sepas. El resto se completa luego desde Brand.'}</p>
        </header>

        <form id="createOrgBrandForm" class="createorg-form-grid" novalidate>
          <h4 class="createorg-subhead createorg-field-full" style="margin-top:0">Verbal</h4>
          <div class="provision-field">
            <label for="brandTone">Tono de voz</label>
            <select id="brandTone" name="tone_of_voice">
              ${this.TONES.map((t) =>
                `<option value="${t.v}" ${t.v === f.tone_of_voice ? 'selected' : ''}>${this.escapeHtml(t.label)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="provision-field">
            <label for="brandTagline">Tagline</label>
            <input id="brandTagline" name="tagline" type="text" placeholder="Frase corta de marca" maxlength="200" value="${this.escapeHtml(f.tagline)}">
          </div>
          <div class="provision-field createorg-field-full">
            <label for="brandPilares">Pilares de marca</label>
            <input id="brandPilares" name="pilares" type="text" placeholder="autenticidad, innovacion, comunidad" value="${this.escapeHtml((f.pilares || []).join(', '))}">
            <small>Separados por coma.</small>
          </div>
          <div class="provision-field">
            <label for="brandPalabras">Palabras clave</label>
            <input id="brandPalabras" name="palabras_clave" type="text" placeholder="sostenible, premium" value="${this.escapeHtml((f.palabras_clave || []).join(', '))}">
          </div>
          <div class="provision-field">
            <label for="brandProhibidas">Palabras prohibidas</label>
            <input id="brandProhibidas" name="palabras_prohibidas" type="text" placeholder="barato, mediocre" value="${this.escapeHtml((f.palabras_prohibidas || []).join(', '))}">
          </div>
          <div class="provision-field createorg-field-full">
            <label for="brandValor">Propuesta de valor</label>
            <textarea id="brandValor" name="propuesta_valor" rows="2" placeholder="Lo que la marca ofrece y por que importa">${this.escapeHtml(f.propuesta_valor)}</textarea>
          </div>
          <div class="provision-field createorg-field-full">
            <label for="brandMision">Mision / vision</label>
            <textarea id="brandMision" name="mision_vision" rows="2" placeholder="A donde va la marca a largo plazo">${this.escapeHtml(f.mision_vision)}</textarea>
          </div>

          <h4 class="createorg-subhead createorg-field-full">Visual</h4>
          <div class="provision-field">
            <label>Paleta de colores</label>
            <div class="createorg-palette-row">
              <label class="createorg-color-chip">
                <input id="brandPrimary" type="color" value="${this.escapeHtml(f.primary_color)}">
                <span class="createorg-color-label">Primario</span>
              </label>
              <label class="createorg-color-chip">
                <input id="brandSecondary" type="color" value="${this.escapeHtml(f.secondary_color)}">
                <span class="createorg-color-label">Secundario</span>
              </label>
            </div>
          </div>
          <div class="provision-field">
            <label for="brandEstetica">Estetica</label>
            <input id="brandEstetica" name="estetica" type="text" placeholder="minimalista, lujosa, retro..." maxlength="80" value="${this.escapeHtml(f.estetica)}">
          </div>
          <div class="provision-field">
            <label for="brandTypoPrimary">Tipografia primaria</label>
            <input id="brandTypoPrimary" name="typography_primary" type="text" placeholder="Inter, Helvetica, etc." value="${this.escapeHtml(f.typography_primary)}">
          </div>
          <div class="provision-field">
            <label for="brandTypoSecondary">Tipografia secundaria</label>
            <input id="brandTypoSecondary" name="typography_secondary" type="text" placeholder="Playfair, Georgia, etc." value="${this.escapeHtml(f.typography_secondary)}">
          </div>
          <div class="provision-field createorg-field-full">
            <label for="brandTemas">Temas / sub-nichos</label>
            <input id="brandTemas" name="temas" type="text" placeholder="moda, fitness, tech" value="${this.escapeHtml((f.temas || []).join(', '))}">
            <small>Separados por coma.</small>
          </div>
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
    const isManual = f.method === 'manual';
    const stepNum = isManual ? '4' : '3';
    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso ${stepNum} · Operacion</span>
          <h2>Autonomia y seguridad</h2>
          <p>Cuanto puede actuar Vera sin aprobacion humana, y si MFA es obligatorio para entrar a la org. ${isManual ? '' : 'La region (idioma, timezone) se autodetectara de la fuente.'}</p>
        </header>

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
        <i class="fas fa-user-clock"></i>
        <p>Sin owner aun — la org se creara a tu nombre (dev). Conecta un owner en el ultimo paso.</p>
      </div>
    `;

    return `
      <section class="provision-form-card createorg-card-wide">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Paso ${this.form.method === 'manual' ? '5' : '4'} · Revisar</span>
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
            ${f.method === 'url'  ? this.tile('URL fuente', f.brand_url || '—') : ''}
            ${f.method === 'docs' ? this.tile('Archivos', `${f.brand_docs.length} archivo(s)`) : ''}
            ${f.method === 'manual' ? this.tile('Zona horaria', f.timezone) : ''}
            ${f.method === 'manual' ? this.tile('Idioma principal', this.LOCALES.find(l=>l.v===f.locale)?.label || f.locale) : ''}
            ${f.method === 'manual' ? this.tile('Idiomas contenido', (f.idiomas_contenido||[]).join(', ') || '—') : ''}
            ${f.method === 'manual' ? this.tile('Mercados', (f.mercado_objetivo||[]).join(', ') || '—') : ''}
          </div>
        </div>

        ${f.method === 'manual' ? `
        <div class="createorg-review-section">
          <h3 class="createorg-subhead">Marca (verbal)</h3>
          <div class="createorg-review-grid">
            ${this.tile('Tono', f.tone_of_voice || '—')}
            ${this.tile('Tagline', f.tagline || '—')}
            ${this.tile('Pilares', (f.pilares||[]).join(', ') || '—')}
            ${this.tile('Palabras clave', (f.palabras_clave||[]).join(', ') || '—')}
            ${this.tile('Palabras prohibidas', (f.palabras_prohibidas||[]).join(', ') || '—')}
            ${this.tile('Propuesta valor', f.propuesta_valor ? (f.propuesta_valor.slice(0,60) + (f.propuesta_valor.length>60?'...':'')) : '—')}
          </div>
        </div>
        <div class="createorg-review-section">
          <h3 class="createorg-subhead">Marca (visual)</h3>
          <div class="createorg-review-grid">
            ${this.tile('Paleta', `${f.primary_color} · ${f.secondary_color}`)}
            ${this.tile('Estetica', f.estetica || '—')}
            ${this.tile('Tipografia 1', f.typography_primary || '—')}
            ${this.tile('Tipografia 2', f.typography_secondary || '—')}
            ${this.tile('Temas', (f.temas||[]).join(', ') || '—')}
          </div>
        </div>` : ''}

        <div class="createorg-review-section">
          <h3 class="createorg-subhead">Operacion</h3>
          <div class="createorg-review-grid">
            ${this.tile('Autonomia', f.level_of_autonomy)}
            ${this.tile('MFA', f.mfa_required ? 'Obligatorio' : 'Opcional')}
          </div>
        </div>

        <p class="provision-form-status" id="createOrgStatus" role="status" aria-live="polite"></p>
      </section>

      <footer class="provision-page-actions">
        ${this._footerButtons()}
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
    this.standalone = !this.jobId;

    if (this.jobId) {
      await this.loadJobOwner();
    } else {
      // Standalone "+ Org": arranca en Identidad; el owner es el ultimo paso.
      await this.loadConsumers();
    }
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
    page.innerHTML = this.renderSplitBody();
    this.wireAll();
    // Scroll up al cambiar de paso
    const center = this.container.querySelector('.provision-page-center');
    center?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  wireAll() {
    // Paso 1 - Modo (manual / automatico)
    this.container.querySelectorAll('.provision-type-card[data-mode]').forEach((card) => {
      this.addEventListener(card, 'click', () => this.selectCreationMode(card.getAttribute('data-mode')));
    });

    // Ruta automatica - URL + chips de integraciones
    const autoUrl = this.container.querySelector('#autoUrl');
    if (autoUrl) this.addEventListener(autoUrl, 'input', () => this.syncForm());
    this.container.querySelectorAll('[data-intg]').forEach((chip) => {
      this.addEventListener(chip, 'click', () => this.toggleAutoIntegration(chip.getAttribute('data-intg')));
    });

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

    // Step 3 - Brand details (solo si manual)
    if (this.currentStep === 'brand') this.wireBrandStepInputs();

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

    // Owner step: selector de usuario
    const ownerSel = this.container.querySelector('#orgOwnerSelect');
    if (ownerSel) {
      this.addEventListener(ownerSel, 'change', () => {
        const id = ownerSel.value;
        this.owner = id ? (this.consumers.find((c) => c.id === id) || null) : null;
      });
    }

    // Revisar: boton Crear
    const createBtn = this.container.querySelector('[data-action="create"]');
    if (createBtn) this.addEventListener(createBtn, 'click', () => this.handleCreate());

    // Ruta automatica: crear+analizar, reset, ir a orgs
    const autoCreateBtn = this.container.querySelector('[data-action="auto-create"]');
    if (autoCreateBtn) this.addEventListener(autoCreateBtn, 'click', () => this.handleAutoCreate());
    const autoResetBtn = this.container.querySelector('[data-action="auto-reset"]');
    if (autoResetBtn) this.addEventListener(autoResetBtn, 'click', () => this.resetAuto());
    const autoGotoBtn = this.container.querySelector('[data-action="auto-goto-orgs"]');
    if (autoGotoBtn) this.addEventListener(autoGotoBtn, 'click', () => {
      if (window.router) window.router.navigate('/dev/lead/orgs'); else window.location.href = '/dev/lead/orgs';
    });
    this.container.querySelectorAll('[data-connect-intg]').forEach((b) => {
      this.addEventListener(b, 'click', () => this.connectAutoIntegration(b.getAttribute('data-connect-intg')));
    });

    // Aprobacion
    const apNext = this.container.querySelector('[data-action="ap-next"]');
    if (apNext) this.addEventListener(apNext, 'click', () => this.handleApprovalNext());
    const apBack = this.container.querySelector('[data-action="ap-back"]');
    if (apBack) this.addEventListener(apBack, 'click', () => this.handleApprovalBack());
    const apFinish = this.container.querySelector('[data-action="ap-finish"]');
    if (apFinish) this.addEventListener(apFinish, 'click', () => this.handleApprovalFinish());
    const apAddColor = this.container.querySelector('[data-action="ap-add-color"]');
    if (apAddColor) this.addEventListener(apAddColor, 'click', () => this._apAddColor());
    this.container.querySelectorAll('[data-color-rm]').forEach((b) => {
      this.addEventListener(b, 'click', () => this._apRemoveColor(parseInt(b.getAttribute('data-color-rm'), 10)));
    });
    this.container.querySelectorAll('[data-prod-rm]').forEach((b) => {
      this.addEventListener(b, 'click', () => this._apRemoveProduct(parseInt(b.getAttribute('data-prod-rm'), 10)));
    });
    this.container.querySelectorAll('[data-comp-rm]').forEach((b) => {
      this.addEventListener(b, 'click', () => this._apRemoveComp(parseInt(b.getAttribute('data-comp-rm'), 10)));
    });
    const apAddComp = this.container.querySelector('[data-action="ap-add-comp"]');
    if (apAddComp) this.addEventListener(apAddComp, 'click', () => this._apAddComp());

    // Fallback cuando el scrape no pudo obtener la marca
    const fbManual = this.container.querySelector('[data-action="fallback-manual"]');
    if (fbManual) this.addEventListener(fbManual, 'click', () => this._fallbackManual());
    const fbIntg = this.container.querySelector('[data-action="fallback-integrations"]');
    if (fbIntg) this.addEventListener(fbIntg, 'click', () => this._fallbackIntegrations());

    // Pasos finales: Vera, owner/miembros, abrir org
    const veraBtn = this.container.querySelector('[data-action="vera-provision"]');
    if (veraBtn) this.addEventListener(veraBtn, 'click', () => this._veraProvision());
    const addMember = this.container.querySelector('[data-action="owner-add-member"]');
    if (addMember) this.addEventListener(addMember, 'click', () => this._apAddMember());
    this.container.querySelectorAll('[data-member-rm]').forEach((b) => {
      this.addEventListener(b, 'click', () => this._apRemoveMember(parseInt(b.getAttribute('data-member-rm'), 10)));
    });
    const openBtn = this.container.querySelector('[data-action="ap-open"]');
    if (openBtn) this.addEventListener(openBtn, 'click', () => this._apOpenOrg());

    // Back / Next
    const backBtn = this.container.querySelector('[data-action="back"]');
    if (backBtn) this.addEventListener(backBtn, 'click', () => this.handleBack());
    const nextBtn = this.container.querySelector('[data-action="next"]');
    if (nextBtn) this.addEventListener(nextBtn, 'click', () => this.handleNext());
  }

  syncForm() {
    const f = this.form;
    const get = (id) => (this.container.querySelector('#' + id)?.value || '').trim();
    const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
    if (this.currentStep === 'identidad') {
      f.name = get('orgName');
      f.slogan = get('orgSlogan');
    }
    if (this.currentStep === 'auto') {
      f.brand_url = get('autoUrl');
    }
    if (this.currentStep === 'metodo') {
      const radio = this.container.querySelector('input[name="method"]:checked');
      f.method = radio?.value || '';
      if (f.method === 'manual') {
        f.timezone = get('orgTimezone') || 'UTC';
        f.locale = get('orgLocale') || 'es';
        f.idiomas_contenido = csv(get('orgIdiomasContenido'));
        f.mercado_objetivo = csv(get('orgMercado'));
      }
      if (f.method === 'url') {
        f.brand_url = get('orgBrandUrl');
      }
    }
    if (this.currentStep === 'brand') {
      f.tone_of_voice = get('brandTone');
      f.tagline = get('brandTagline');
      f.pilares = csv(get('brandPilares'));
      f.palabras_clave = csv(get('brandPalabras'));
      f.palabras_prohibidas = csv(get('brandProhibidas'));
      f.propuesta_valor = this.container.querySelector('#brandValor')?.value || '';
      f.mision_vision = this.container.querySelector('#brandMision')?.value || '';
      f.primary_color = get('brandPrimary') || '#000000';
      f.secondary_color = get('brandSecondary') || '#ffffff';
      f.estetica = get('brandEstetica');
      f.typography_primary = get('brandTypoPrimary');
      f.typography_secondary = get('brandTypoSecondary');
      f.temas = csv(get('brandTemas'));
    }
    if (this.currentStep === 'operacion') {
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
    // Manual: region (timezone, locale) + idiomas + mercado
    ['orgTimezone', 'orgLocale'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'change', () => this.syncForm());
    });
    ['orgIdiomasContenido', 'orgMercado'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'input', () => this.syncForm());
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

  wireBrandStepInputs() {
    // Step 3 - Brand details
    ['brandTagline', 'brandPilares', 'brandPalabras', 'brandProhibidas', 'brandValor', 'brandMision', 'brandEstetica', 'brandTypoPrimary', 'brandTypoSecondary', 'brandTemas'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'input', () => this.syncForm());
    });
    ['brandTone', 'brandPrimary', 'brandSecondary'].forEach((id) => {
      const el = this.container.querySelector('#' + id);
      if (el) this.addEventListener(el, 'change', () => this.syncForm());
    });
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
    const steps = this.getActiveSteps();
    const idx = steps.findIndex((s) => s.key === this.currentStep);
    if (idx <= 0) {
      // Primer paso → standalone vuelve a Orgs; flujo owner_org vuelve al wizard.
      const dest = this.standalone ? '/dev/lead/orgs' : '/dev/provisioning/users';
      if (window.router) window.router.navigate(dest);
      else window.location.href = dest;
      return;
    }
    this.goToStep(steps[idx - 1].key);
  }

  async handleNext() {
    const steps = this.getActiveSteps();
    const idx = steps.findIndex((s) => s.key === this.currentStep);
    if (idx === steps.length - 1) return; // ultimo paso, sin next
    const err = this.validateStep(this.currentStep);
    if (err) {
      this.setStatus(err, 'error');
      return;
    }
    this.setStatus('', '');

    // Step 2 con method=url o docs: gatillar el scrape antes de avanzar
    if (this.currentStep === 'metodo' && (this.form.method === 'url' || this.form.method === 'docs')) {
      const ok = await this.startBrandScrape();
      if (!ok) return; // error ya mostrado en pane
      return; // polling se encarga de avanzar cuando termine
    }

    this.goToStep(steps[idx + 1].key);
  }

  async startBrandScrape() {
    if (this.form.method === 'url' && !this.form.brand_url) {
      this.scrapeError = 'Falta la URL del sitio.';
      this.refreshMethodPane();
      return false;
    }
    if (this.form.method === 'docs' && (!this.form.brand_docs || this.form.brand_docs.length === 0)) {
      this.scrapeError = 'Adjunta al menos un archivo.';
      this.refreshMethodPane();
      return false;
    }
    if (this.form.method === 'docs') {
      this.scrapeError = 'Scraping desde documentos aun no esta implementado. Usa URL o Manual por ahora.';
      this.refreshMethodPane();
      return false;
    }

    this.scrapeError = null;
    try {
      const res = await fetch('/api/brand-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: this.form.brand_url })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.job_id) {
        this.scrapeError = data?.error || `HTTP ${res.status}`;
        this.refreshMethodPane();
        return false;
      }
      this.scrapeJobId = data.job_id;
      this.scrapeStatus = { status: 'queued', stage: 'En cola' };
      this.refreshMethodPane();
      this.startScrapePolling();
      return true;
    } catch (e) {
      this.scrapeError = e.message || String(e);
      this.refreshMethodPane();
      return false;
    }
  }

  refreshMethodPane() {
    const host = this.container.querySelector('#createOrgMethodContent');
    if (host) host.innerHTML = this.renderMethodForm();
    // Re-wire reset button si esta visible
    const resetBtn = this.container.querySelector('[data-action="scrape-reset"]');
    if (resetBtn) {
      this.addEventListener(resetBtn, 'click', () => {
        this.scrapeError = null;
        this.scrapeJobId = null;
        this.scrapeStatus = null;
        this.refreshMethodPane();
      });
    }
  }

  startScrapePolling() {
    this.stopScrapePolling();
    this.scrapePollTimer = setInterval(() => this.pollScrape(), 2500);
  }

  stopScrapePolling() {
    if (this.scrapePollTimer) { clearInterval(this.scrapePollTimer); this.scrapePollTimer = null; }
  }

  async pollScrape() {
    if (!this.scrapeJobId) return;
    try {
      const res = await fetch(`/api/brand-scrape?job_id=${encodeURIComponent(this.scrapeJobId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.scrapeError = data?.error || `HTTP ${res.status}`;
        this.stopScrapePolling();
        this.scrapeJobId = null;
        this.refreshMethodPane();
        return;
      }
      this.scrapeStatus = data;
      this.refreshMethodPane();

      if (data.status === 'done') {
        this.stopScrapePolling();
        this.applyScrapedPayload(data.brand_payload || {});
      } else if (data.status === 'failed' || data.status === 'cancelled') {
        this.stopScrapePolling();
        this.scrapeError = data.error || `Job ${data.status}`;
        this.scrapeJobId = null;
        this.refreshMethodPane();
      }
    } catch (e) {
      // dejar el polling reintentar en el siguiente tick
    }
  }

  applyScrapedPayload(payload) {
    const f = this.form;
    // Verbal
    if (payload.tono_de_voz) f.tone_of_voice = payload.tono_de_voz;
    if (payload.tagline) f.tagline = payload.tagline;
    if (Array.isArray(payload.pilares) && payload.pilares.length) f.pilares = payload.pilares;
    if (Array.isArray(payload.palabras_clave) && payload.palabras_clave.length) f.palabras_clave = payload.palabras_clave;
    if (Array.isArray(payload.palabras_prohibidas) && payload.palabras_prohibidas.length) f.palabras_prohibidas = payload.palabras_prohibidas;
    if (payload.propuesta_valor) f.propuesta_valor = payload.propuesta_valor;
    if (payload.mision_vision) f.mision_vision = payload.mision_vision;
    // Visual
    if (payload.primary_color) f.primary_color = payload.primary_color;
    if (payload.secondary_color) f.secondary_color = payload.secondary_color;
    if (payload.typography_primary) f.typography_primary = payload.typography_primary;
    if (payload.typography_secondary) f.typography_secondary = payload.typography_secondary;
    if (payload.estetica) f.estetica = payload.estetica;
    if (Array.isArray(payload.temas) && payload.temas.length) f.temas = payload.temas;
    // Region
    if (payload.timezone) f.timezone = payload.timezone;
    if (payload.locale) f.locale = payload.locale;
    if (Array.isArray(payload.idiomas_contenido) && payload.idiomas_contenido.length) f.idiomas_contenido = payload.idiomas_contenido;
    if (Array.isArray(payload.mercado_objetivo) && payload.mercado_objetivo.length) f.mercado_objetivo = payload.mercado_objetivo;
    // Marca el form como scraped → Step 'brand' aparece en getActiveSteps
    this.scraped_brand = true;
    this.scrapeJobId = null;
    this.scrapeStatus = null;
    // Avanza al Step Brand
    this.goToStep('brand');
  }

  // ─── Crear la organizacion (RPC transaccional admin_create_organization) ──
  async handleCreate() {
    if (this._creating) return;
    const f = this.form;
    // Ruta automatica: si no hay nombre, derivarlo del dominio de la URL.
    if (this.creationMode === 'auto' && !f.name && f.brand_url) {
      try { f.name = new URL(f.brand_url).hostname.replace(/^www\./, ''); }
      catch (_) { f.name = f.brand_url; }
    }
    if (!f.name) { this.setStatus('Falta el nombre de la organizacion.', 'error'); return; }

    this._creating = true;
    this.setStatus('', '');
    const btn = this.container.querySelector('[data-action="create"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...'; }

    // Logo: solo si ya es una URL publica. El archivo subido (data URL) se
    // gestiona luego desde Brand para no inflar la fila.
    const logoUrl = (f.logo_preview && /^https?:\/\//i.test(f.logo_preview)) ? f.logo_preview : null;

    const payload = {
      name: f.name,
      brand_slogan: f.slogan || null,
      logo_url: logoUrl,
      owner_user_id: this.owner?.id || null,
      locale: f.locale || 'es',
      timezone: f.timezone || 'America/Bogota',
      level_of_autonomy: f.level_of_autonomy || 'parcial',
      mfa_required: !!f.mfa_required,
      idiomas_contenido: f.idiomas_contenido || [],
      mercado_objetivo: f.mercado_objetivo || [],
      temas: f.temas || [],
      propuesta_valor: f.propuesta_valor || null,
      mision_vision: f.mision_vision || null,
      palabras_clave: f.palabras_clave || [],
      palabras_prohibidas: f.palabras_prohibidas || [],
      primary_color: f.primary_color || null,
      secondary_color: f.secondary_color || null,
      typography_primary: f.typography_primary || null,
      typography_secondary: f.typography_secondary || null,
      pilares: f.pilares || [],
      verbal_dna: { tone_of_voice: f.tone_of_voice || null, tagline: f.tagline || null },
      visual_dna: { estetica: f.estetica || null }
    };

    try {
      const { data, error } = await this.supabase.rpc('admin_create_organization', { p: payload });
      if (error) throw error;
      this.showNotification(`Organizacion "${f.name}" creada.`, 'success');
      const dest = '/dev/lead/orgs';
      if (window.router) window.router.navigate(dest);
      else window.location.href = dest;
    } catch (err) {
      this._creating = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Crear organizacion'; }
      this.setStatus(err?.message || 'Error al crear la organizacion.', 'error');
    }
  }

  // ─── Ruta automatica: shell → scrape → apply (en ai-engine) ──────────
  async handleAutoCreate() {
    if (this._creating) return;
    this.syncForm();
    const f = this.form;
    if (!f.brand_url) { this.setStatus('Agrega la URL de tu web.', 'error'); return; }
    if (!f.name) {
      try { f.name = new URL(f.brand_url).hostname.replace(/^www\./, ''); }
      catch (_) { f.name = f.brand_url; }
    }

    this._creating = true;
    this.autoError = null;
    this.autoPhase = 'creating';
    this._refreshAuto();

    try {
      // 1. Shell de la org (por defecto a nombre del dev) → org_id.
      const { data: orgId, error } = await this.supabase.rpc('admin_create_organization', { p: { name: f.name } });
      if (error) throw error;
      this.autoOrgId = orgId;

      // Mercado (brand_container) del org nuevo — para conectar integraciones luego.
      const { data: bc } = await this.supabase
        .from('brand_containers').select('id')
        .eq('organization_id', orgId).order('created_at', { ascending: true }).limit(1).maybeSingle();
      this.autoContainerId = bc?.id || null;

      // 2. Arrancar el scrape con el org_id (ai-engine aplica el ADN al terminar).
      this.autoPhase = 'scraping';
      this._refreshAuto();
      const res = await fetch('/api/brand-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: f.brand_url, organization_id: orgId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.job_id) throw new Error(data.error || `No se pudo iniciar el analisis (HTTP ${res.status})`);
      this.autoJobId = data.job_id;
      this._pollAuto();
    } catch (err) {
      this._creating = false;
      this.autoPhase = 'error';
      this.autoError = err?.message || String(err);
      this._refreshAuto();
    }
  }

  _pollAuto() {
    this.stopAutoPoll();
    this._autoTimer = setInterval(async () => {
      if (!this.autoJobId) return;
      try {
        const res = await fetch(`/api/brand-scrape?job_id=${encodeURIComponent(this.autoJobId)}`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) return;
        this.autoStatus = d;
        if (d.status === 'done') {
          this.stopAutoPoll();
          this._creating = false;
          // Si el sitio no dio contenido util (bloqueo/SPA vacia), ofrecer fallbacks.
          if (this._scrapeYieldedNothing(d.brand_payload)) { this.autoPhase = 'noContent'; this._refreshAuto(); }
          else this._enterApproval(d);
        } else if (d.status === 'failed' || d.status === 'cancelled') {
          this.stopAutoPoll();
          this._creating = false;
          // No se pudo scrapear (plataforma que bloquea, URL inaccesible, etc.).
          this.autoPhase = 'noContent';
          this.autoError = d.error || null;
          this._refreshAuto();
        } else {
          this.autoPhase = 'scraping';
          this._refreshAuto();
        }
      } catch (_) { /* reintenta al siguiente tick */ }
    }, 2500);
  }

  stopAutoPoll() {
    if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
  }

  // Bloque de la pantalla de exito: conectar tiendas → el OAuth existente dispara
  // el populator (importa productos). Solo providers con endpoint start hoy.
  AUTO_INTG_ENDPOINTS = { shopify: '/api/integrations/shopify/start', mercadolibre: '/api/integrations/meli/start' };
  AUTO_INTG_LABELS = { shopify: 'Shopify', mercadolibre: 'Mercado Libre', amazon: 'Amazon', woocommerce: 'WooCommerce' };

  _autoIntegrationsBlock() {
    const sel = this.autoIntegrations || [];
    if (!sel.length || !this.autoContainerId) return '';
    const supported = sel.filter((p) => this.AUTO_INTG_ENDPOINTS[p]);
    const unsupported = sel.filter((p) => !this.AUTO_INTG_ENDPOINTS[p]);
    const btns = supported.map((p) =>
      `<button type="button" class="btn btn-secondary btn-sm" data-connect-intg="${p}"><i class="fas fa-link"></i> Conectar ${this.escapeHtml(this.AUTO_INTG_LABELS[p] || p)}</button>`
    ).join('');
    const note = unsupported.length
      ? `<p class="provision-verify-meta" style="margin-top:6px">${unsupported.map((p) => this.escapeHtml(this.AUTO_INTG_LABELS[p] || p)).join(', ')}: conexion proximamente.</p>`
      : '';
    return `
      <div class="createorg-auto-intg">
        ${supported.length ? '<p class="provision-verify-meta">Conecta tu tienda para importar productos automaticamente:</p>' : ''}
        ${btns ? `<div class="createorg-auto-intg-btns">${btns}</div>` : ''}
        ${note}
      </div>`;
  }

  async connectAutoIntegration(provider) {
    const endpoint = this.AUTO_INTG_ENDPOINTS[provider];
    if (!endpoint || !this.autoContainerId) return;
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { this.showNotification('Sesion no valida.', 'error'); return; }

      let shop = null;
      if (provider === 'shopify') {
        shop = (window.prompt('Dominio de tu tienda Shopify (ej. mitienda.myshopify.com):') || '').trim();
        if (!shop) return;
      }
      const qs = new URLSearchParams({ brand_container_id: this.autoContainerId, return_to: '/dev/lead/orgs' });
      if (shop) qs.set('shop', shop);
      const res = await fetch(`${location.origin}${endpoint}?${qs.toString()}`, {
        method: 'GET', headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.authorize_url) throw new Error(json?.error || `No se pudo iniciar OAuth (${res.status})`);
      // Redirige al provider; al volver, el exchange encola el populator (importa productos).
      window.location.href = json.authorize_url;
    } catch (err) {
      this.showNotification(err?.message || 'No se pudo conectar la integracion.', 'error');
    }
  }

  _refreshAuto() {
    const center = this.container.querySelector('.provision-page-center');
    if (center) { center.innerHTML = this.renderStepAuto(); this.wireAll(); }
  }

  // El scrape no dio nada util (sitio bloqueado / SPA vacia).
  _scrapeYieldedNothing(bp) {
    if (!bp) return true;
    return !bp.brand_name && !bp.nicho_core && !bp.tono_de_voz && !bp.primary_color
      && !(bp.products_detected && bp.products_detected.length);
  }

  renderNoContent() {
    const url = this.escapeHtml(this.form.brand_url || 'tu sitio');
    return `
      <section class="provision-verify-card">
        <span class="provision-verify-icon" style="color:#e0b250"><i class="fas fa-triangle-exclamation"></i></span>
        <h2>No pudimos obtener tu marca</h2>
        <p>La plataforma de <strong>${url}</strong> no permitio analizar el contenido automaticamente (algunos sitios bloquean el analisis). La organizacion ya se creo — puedes continuar de dos formas:</p>
        <div class="createorg-fallback-opts">
          <button type="button" class="createorg-fallback-opt" data-action="fallback-integrations">
            <i class="fas fa-plug"></i>
            <span><strong>Conectar integraciones</strong><small>Importa tus productos desde tu tienda (Shopify, Mercado Libre)</small></span>
          </button>
          <button type="button" class="createorg-fallback-opt" data-action="fallback-manual">
            <i class="fas fa-pen-to-square"></i>
            <span><strong>Llenar todo manualmente</strong><small>Defines identidad, ADN, colores y demas a mano</small></span>
          </button>
        </div>
      </section>
      <footer class="provision-page-actions">
        <button type="button" class="provision-back-btn" data-action="auto-goto-orgs">Salir</button>
      </footer>
    `;
  }

  _fallbackManual() { this._enterApproval({}); }
  _fallbackIntegrations() {
    this.autoIntegrations = ['shopify', 'mercadolibre'];
    this._enterApproval({});
  }

  resetAuto() {
    this.stopAutoPoll();
    this._creating = false;
    this.autoPhase = null;
    this.autoOrgId = null;
    this.autoJobId = null;
    this.autoStatus = null;
    this.autoError = null;
    this.form.brand_url = '';
    this._refreshAuto();
  }

  // ─── Aprobacion: paginas editables (avanzar = aceptar) ──────────────
  _enterApproval(status) {
    const bp = (status && status.brand_payload) || {};
    const logo = status?.progress?.apply?.logo || null;
    const colors = [];
    if (bp.primary_color)   colors.push({ color_role: 'primary',   hex_value: bp.primary_color });
    if (bp.secondary_color) colors.push({ color_role: 'secondary', hex_value: bp.secondary_color });
    (bp.palette_extra || []).slice(0, 4).forEach((h, i) => { if (h) colors.push({ color_role: `accent_${i + 1}`, hex_value: h }); });
    this.approval = {
      logo,
      name: bp.brand_name || this.form.name || '',
      slogan: bp.tagline || '',
      como_comunica: bp.como_comunica || '',
      products_detected: Array.isArray(bp.products_detected) ? bp.products_detected : [],
      services_detected: Array.isArray(bp.services_detected) ? bp.services_detected : [],
      competitors_count: (status?.progress?.competitors?.competitors) || 0,
      watchers_count: (status?.progress?.competitors?.watchers) || 0,
      nicho_core: bp.nicho_core || '',
      mercado_objetivo: bp.mercado_objetivo || [],
      idiomas_contenido: bp.idiomas_contenido || [],
      locale: bp.locale || 'es',
      timezone: bp.timezone || 'America/Bogota',
      tono_de_voz: bp.tono_de_voz || '',
      propuesta_valor: bp.propuesta_valor || '',
      mision_vision: bp.mision_vision || '',
      pilares: bp.pilares || [],
      palabras_clave: bp.palabras_clave || [],
      palabras_prohibidas: bp.palabras_prohibidas || [],
      colors,
      typography_primary: bp.typography_primary || '',
      typography_secondary: bp.typography_secondary || '',
      estetica: bp.estetica || '',
      competitors: null,  // se carga async desde intelligence_entities
      veraStatus: null, veraError: null,
      ownerId: '', members: [], ownerConsumers: null
    };
    this.approvalIdx = 0;
    this.autoPhase = 'approving';
    this._refreshAutoFull();
    this._loadCompetitors();
    this._loadOwnerConsumers();
  }

  async _loadOwnerConsumers() {
    try { await this.loadConsumers(); this.approval.ownerConsumers = this.consumers || []; }
    catch (_) { this.approval.ownerConsumers = []; }
    if (this.autoPhase === 'approving' && this.APPROVAL_PAGES[this.approvalIdx]?.key === 'owner') this._refreshAutoFull();
  }

  async _veraProvision() {
    if (this.approval.veraStatus === 'provisioning') return;
    this.approval.veraStatus = 'provisioning';
    this.approval.veraError = null;
    this._refreshAutoFull();
    try {
      const { data, error } = await this.supabase.functions.invoke('provision-org-agent', { body: { organization_id: this.autoOrgId } });
      if (error || !data?.success && !data?.already_provisioned) {
        let msg = error?.message || data?.error || 'No se pudo crear Vera';
        try { const ctx = await error?.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch (_) {}
        throw new Error(msg);
      }
      this.approval.veraStatus = 'done';
    } catch (err) {
      this.approval.veraStatus = null;
      this.approval.veraError = err?.message || 'No se pudo crear Vera';
    }
    this._refreshAutoFull();
  }

  _apAddMember() {
    this._collectApproval('owner');
    this.approval.members = [...(this.approval.members || []), { user_id: '', role: 'viewer' }];
    this._refreshAutoFull();
  }
  _apRemoveMember(i) {
    this._collectApproval('owner');
    (this.approval.members || []).splice(i, 1);
    this._refreshAutoFull();
  }

  _apOpenOrg() {
    const prefix = (typeof window.getOrgPathPrefix === 'function') ? window.getOrgPathPrefix(this.autoOrgId, this.approval.name || 'org') : '';
    const dest = prefix ? `${prefix}/dashboard` : '/dev/lead/orgs';
    this.showNotification('Abriendo la organizacion en modo consumidor...', 'success');
    if (window.router) window.router.navigate(dest); else window.location.href = dest;
  }

  async _loadCompetitors() {
    try {
      const { data } = await this.supabase.functions.invoke('admin-update-brand', {
        body: { organization_id: this.autoOrgId, section: 'competitors-list' }
      });
      this.approval.competitors = Array.isArray(data?.competitors) ? data.competitors : [];
    } catch (_) {
      this.approval.competitors = [];
    }
    // Si el usuario esta en la pagina de competencia, refrescar.
    if (this.autoPhase === 'approving' && this.APPROVAL_PAGES[this.approvalIdx]?.key === 'competitors') {
      this._refreshAutoFull();
    }
  }

  _refreshAutoFull() {
    const page = this.container.querySelector('.provision-page');
    if (!page) { this._refreshAuto(); return; }
    page.innerHTML = this.renderSplitBody();
    this.wireAll();
  }

  _hex6(v) { return (/^#[0-9a-f]{6}$/i.test(v || '')) ? v : '#000000'; }
  // Rol del color por POSICION: 1º primary, 2º secondary, resto accent_N.
  _colorRole(i) { return i === 0 ? 'primary' : i === 1 ? 'secondary' : `accent_${i - 1}`; }
  _f(label, id, value, ph) {
    return `<div class="provision-field createorg-field-full"><label for="${id}">${this.escapeHtml(label)}</label><input id="${id}" class="form-control" value="${this.escapeHtml(value || '')}" placeholder="${this.escapeHtml(ph || '')}"></div>`;
  }
  _ta(label, id, value) {
    return `<div class="provision-field createorg-field-full"><label for="${id}">${this.escapeHtml(label)}</label><textarea id="${id}" class="form-control" rows="3">${this.escapeHtml(value || '')}</textarea></div>`;
  }
  _csv(label, id, list, hint) {
    return `<div class="provision-field createorg-field-full"><label for="${id}">${this.escapeHtml(label)}</label><input id="${id}" class="form-control" value="${this.escapeHtml((list || []).join(', '))}">${hint ? `<small>${this.escapeHtml(hint)}</small>` : ''}</div>`;
  }

  _apMeta(key) {
    return {
      identity: ['Confirma la identidad', 'Logo, nombre y slogan de la marca. Edita lo que haga falta y avanza para aceptar.'],
      market:   ['Mercado e idioma', 'Donde y en que idioma opera la marca.'],
      voice:    ['Voz y mensaje', 'El ADN verbal: tono, propuesta, pilares y palabras.'],
      colors:   ['Paleta de colores', 'Los colores detectados de la marca. Ajusta o agrega.'],
      fonts:    ['Tipografia y estetica', 'Las fuentes y el estilo visual.'],
      products: ['Productos detectados', 'Lo que Vera encontro en el sitio. Quita lo que no sea un producto real; al avanzar se guardan.'],
      competitors: ['Competencia y monitoreo', 'Los competidores que Vera identifico. Revisa, corrige o quita; al avanzar se actualiza el monitoreo.'],
      vera:     ['Agente de Vera', 'Activa la automatizacion: crea el equipo de IA Vera para esta marca. Opcional — puedes hacerlo despues.'],
      owner:    ['Owner y miembros', 'Asigna un dueno y miembros a la organizacion. Opcional — por defecto queda a tu nombre (dev).'],
      review:   ['Todo listo', 'Revisa el resumen y abre la org como consumidor para monitorear todo lo creado.']
    }[key] || ['', ''];
  }

  renderApprovalPage() {
    const idx = this.approvalIdx;
    const page = this.APPROVAL_PAGES[idx];
    const total = this.APPROVAL_PAGES.length;
    const isLast = idx === total - 1;
    const [title, hint] = this._apMeta(page.key);
    const body = ({
      identity: () => this._apIdentity(),
      market:   () => this._apMarket(),
      voice:    () => this._apVoice(),
      colors:   () => this._apColors(),
      fonts:    () => this._apFonts(),
      products: () => this._apProducts(),
      competitors: () => this._apCompetitors(),
      vera:     () => this._apVera(),
      owner:    () => this._apOwner(),
      review:   () => this._apReview()
    }[page.key] || (() => ''))();

    return `
      <section class="provision-form-card createorg-card-wide createorg-approval">
        <header class="provision-form-head">
          <span class="provision-form-eyebrow">Revisar ${idx + 1} de ${total} · ${this.escapeHtml(page.label)}</span>
          <h2>${this.escapeHtml(title)}</h2>
          <p>${this.escapeHtml(hint)}</p>
        </header>
        <form id="approvalForm" class="createorg-form-grid" novalidate>
          ${body}
          <p class="provision-form-status createorg-field-full" id="createOrgStatus" role="status" aria-live="polite"></p>
        </form>
      </section>
      <footer class="provision-page-actions">
        ${idx > 0
          ? '<button type="button" class="provision-back-btn" data-action="ap-back">Back</button>'
          : '<button type="button" class="provision-back-btn" data-action="auto-goto-orgs">Salir</button>'}
        ${isLast
          ? '<button type="button" class="provision-back-btn" data-action="auto-goto-orgs">Organizaciones</button><button type="button" class="createorg-submit-btn" data-action="ap-open"><i class="fas fa-eye"></i> Abrir la org</button>'
          : '<button type="button" class="createorg-submit-btn" data-action="ap-next">Aceptar y seguir <i class="fas fa-arrow-right"></i></button>'}
      </footer>
    `;
  }

  _apIdentity() {
    const a = this.approval;
    return `
      ${a.logo ? `<div class="createorg-field-full" style="text-align:center"><img src="${this.escapeHtml(a.logo)}" class="createorg-done-logo" onerror="this.style.display='none'"></div>` : ''}
      ${this._f('Nombre de la marca', 'apName', a.name, 'Ej. ACME')}
      ${this._f('Slogan', 'apSlogan', a.slogan, 'Frase de marca')}
    `;
  }
  _apMarket() {
    const a = this.approval;
    const localeOpts = [['es', 'Espanol'], ['en', 'English'], ['pt', 'Portugues']]
      .map(([v, l]) => `<option value="${v}" ${a.locale === v ? 'selected' : ''}>${l}</option>`).join('');
    const inList = this.MARKET_NICHES.includes(a.nicho_core);
    const nichoOpts = (a.nicho_core && !inList ? `<option value="${this.escapeHtml(a.nicho_core)}" selected>${this.escapeHtml(a.nicho_core)} (detectado)</option>` : '')
      + this.MARKET_NICHES.map((n) => `<option value="${this.escapeHtml(n)}" ${a.nicho_core === n ? 'selected' : ''}>${this.escapeHtml(n)}</option>`).join('');
    return `
      <div class="provision-field createorg-field-full"><label for="apNicho">Nicho / categoria (mercado real)</label><select id="apNicho" class="form-control">${nichoOpts}</select></div>
      ${this._csv('Mercados objetivo (paises)', 'apMercados', a.mercado_objetivo, 'Separados por coma. Ej. CO, MX')}
      ${this._csv('Idiomas de contenido', 'apIdiomas', a.idiomas_contenido, 'Ej. es, en')}
      <div class="provision-field createorg-field-full"><label for="apLocale">Idioma principal</label><select id="apLocale" class="form-control">${localeOpts}</select></div>
      ${this._f('Zona horaria', 'apTz', a.timezone)}
    `;
  }
  _apVoice() {
    const a = this.approval;
    const toneInList = this.TONES.some((t) => t.v === a.tono_de_voz);
    const toneOpts = (a.tono_de_voz && !toneInList ? `<option value="${this.escapeHtml(a.tono_de_voz)}" selected>${this.escapeHtml(a.tono_de_voz)}</option>` : '')
      + this.TONES.map((t) => `<option value="${t.v}" ${a.tono_de_voz === t.v ? 'selected' : ''}>${this.escapeHtml(t.label)}</option>`).join('');
    return `
      <div class="provision-field createorg-field-full"><label for="apTono">Tono de voz</label><select id="apTono" class="form-control">${toneOpts}</select></div>
      ${a.como_comunica ? `<div class="createorg-field-full createorg-insight"><span class="createorg-insight-tag"><i class="fas fa-eye"></i> Cómo comunica (visión)</span><p>${this.escapeHtml(a.como_comunica)}</p></div>` : ''}
      ${this._ta('Propuesta de valor', 'apPropuesta', a.propuesta_valor)}
      ${this._ta('Mision / vision', 'apMision', a.mision_vision)}
      ${this._csv('Pilares', 'apPilares', a.pilares)}
      ${this._csv('Palabras clave', 'apClave', a.palabras_clave)}
      ${this._csv('Palabras prohibidas', 'apProhibidas', a.palabras_prohibidas)}
    `;
  }
  _apColors() {
    const a = this.approval;
    const rows = (a.colors || []).map((c, i) => `
      <div class="createorg-color-row" data-color-idx="${i}">
        <input type="color" data-color-hex value="${this._hex6(c.hex_value)}">
        <span class="createorg-color-role">${this.escapeHtml(this._colorRole(i))}</span>
        <button type="button" class="createorg-color-rm" data-color-rm="${i}" aria-label="Quitar"><i class="fas fa-times"></i></button>
      </div>`).join('');
    return `
      <div class="createorg-field-full">
        <label>Paleta de la marca</label>
        <div id="apColors">${rows || '<p class="cons-dim">Sin colores detectados.</p>'}</div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="ap-add-color"><i class="fas fa-plus"></i> Agregar color</button>
      </div>
    `;
  }
  _apFonts() {
    const a = this.approval;
    return `
      ${this._f('Tipografia principal', 'apFont1', a.typography_primary, 'Ej. Inter')}
      ${this._f('Tipografia secundaria', 'apFont2', a.typography_secondary, 'Ej. Lora')}
      ${this._f('Estetica', 'apEstetica', a.estetica, 'Ej. minimalista, premium')}
    `;
  }
  _apProducts() {
    const items = this.approval.products_detected || [];
    if (!items.length) {
      return '<p class="cons-dim createorg-field-full">No se detectaron productos en el sitio. Si conectas tu tienda en el paso final, se importan completos.</p>';
    }
    const rows = items.map((p, i) => `
      <div class="createorg-list-row" data-prod-idx="${i}">
        ${p.image ? `<img src="${this.escapeHtml(p.image)}" class="createorg-list-thumb" onerror="this.outerHTML='<span class=&quot;createorg-list-thumb createorg-list-thumb--ph&quot;><i class=&quot;fas fa-box&quot;></i></span>'">` : '<span class="createorg-list-thumb createorg-list-thumb--ph"><i class="fas fa-box"></i></span>'}
        <input type="text" class="form-control" data-prod-name value="${this.escapeHtml(p.name || '')}" placeholder="Nombre del producto">
        <button type="button" class="createorg-color-rm" data-prod-rm="${i}" aria-label="Quitar"><i class="fas fa-times"></i></button>
      </div>`).join('');
    return `<div class="createorg-field-full"><label>Productos (${items.length}) — al avanzar se guardan</label><div id="apProducts">${rows}</div></div>`;
  }

  _apCompetitors() {
    const comps = this.approval.competitors;
    if (comps === null) {
      return '<div class="createorg-field-full" style="text-align:center;padding:24px"><i class="fas fa-circle-notch fa-spin"></i> Cargando competencia...</div>';
    }
    const rows = (comps || []).map((c, i) => `
      <div class="createorg-comp-row" data-comp-idx="${i}">
        <input type="text" class="form-control" data-comp-name value="${this.escapeHtml(c.name || '')}" placeholder="Nombre">
        <input type="text" class="form-control" data-comp-web value="${this.escapeHtml(c.website || '')}" placeholder="sitio web (opcional)">
        <button type="button" class="createorg-color-rm" data-comp-rm="${i}" aria-label="Quitar"><i class="fas fa-times"></i></button>
      </div>`).join('');
    return `
      <div class="createorg-field-full">
        <label>Competidores (${(comps || []).length}) — se monitorea su sitio</label>
        <div id="apComps">${rows || '<p class="cons-dim">Sin competidores. Agrega los que conozcas.</p>'}</div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="ap-add-comp"><i class="fas fa-plus"></i> Agregar competidor</button>
      </div>
    `;
  }

  _apVera() {
    const st = this.approval.veraStatus;
    if (st === 'done') {
      return `<div class="createorg-field-full"><div class="createorg-insight"><span class="createorg-insight-tag"><i class="fas fa-robot"></i> Vera en camino</span><p>El agente se esta provisionando (VM dedicada, ~3-5 min). Cuando este healthy podra automatizar contenido, estrategia y monitoreo de la marca.</p></div></div>`;
    }
    return `
      <div class="createorg-field-full">
        <p class="provision-verify-meta">Crea el equipo de IA <strong>Vera</strong> para automatizar contenido, estrategia y monitoreo de esta marca.</p>
        <button type="button" class="createorg-submit-btn" data-action="vera-provision" ${st === 'provisioning' ? 'disabled' : ''}>
          ${st === 'provisioning' ? '<i class="fas fa-spinner fa-spin"></i> Provisionando...' : '<i class="fas fa-robot"></i> Crear agente de Vera'}
        </button>
        ${this.approval.veraError ? `<p class="provision-form-status is-error">${this.escapeHtml(this.approval.veraError)}</p>` : ''}
        <small class="form-hint" style="display:block;margin-top:8px">⚠️ Levanta una VM dedicada de pago + API key Anthropic. Opcional — puedes crearla luego desde Organizaciones. Avanza para omitir.</small>
      </div>
    `;
  }

  _apOwner() {
    const consumers = this.approval.ownerConsumers;
    if (consumers === null) {
      return '<div class="createorg-field-full" style="text-align:center;padding:24px"><i class="fas fa-circle-notch fa-spin"></i> Cargando usuarios...</div>';
    }
    const a = this.approval;
    const ownerOpts = '<option value="">— A mi nombre (dev) por ahora —</option>' +
      consumers.map((c) => `<option value="${this.escapeHtml(c.id)}" ${a.ownerId === c.id ? 'selected' : ''}>${this.escapeHtml((c.full_name || '(sin nombre)') + ' · ' + (c.email || ''))}</option>`).join('');
    const roleList = ['viewer', 'vera_user', 'creator', 'editor', 'admin'];
    const memberRows = (a.members || []).map((m, i) => {
      const userOpts = '<option value="">— Selecciona —</option>' + consumers.map((c) => `<option value="${this.escapeHtml(c.id)}" ${m.user_id === c.id ? 'selected' : ''}>${this.escapeHtml(c.full_name || c.email || '')}</option>`).join('');
      const roleOpts = roleList.map((r) => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${r}</option>`).join('');
      return `<div class="createorg-member-row" data-member-idx="${i}">
        <select class="form-control" data-member-user>${userOpts}</select>
        <select class="form-control createorg-member-role" data-member-role>${roleOpts}</select>
        <button type="button" class="createorg-color-rm" data-member-rm="${i}" aria-label="Quitar"><i class="fas fa-times"></i></button>
      </div>`;
    }).join('');
    return `
      <div class="provision-field createorg-field-full"><label for="apOwnerSel">Owner (opcional)</label><select id="apOwnerSel" class="form-control">${ownerOpts}</select></div>
      <div class="createorg-field-full">
        <label>Miembros (opcional)</label>
        <div id="apMembers">${memberRows}</div>
        ${consumers.length ? '<button type="button" class="btn btn-secondary btn-sm" data-action="owner-add-member"><i class="fas fa-plus"></i> Agregar miembro</button>' : '<p class="cons-dim">Aun no hay usuarios consumidores para afiliar.</p>'}
      </div>
    `;
  }

  _apReview() {
    const a = this.approval;
    return `
      <div class="createorg-field-full">
        <ul class="createorg-review-summary">
          <li><b>Marca:</b> ${this.escapeHtml(a.name || '—')}${a.slogan ? ` — ${this.escapeHtml(a.slogan)}` : ''}</li>
          <li><b>Nicho:</b> ${this.escapeHtml(a.nicho_core || '—')}</li>
          <li><b>Mercados:</b> ${this.escapeHtml((a.mercado_objetivo || []).join(', ') || '—')} · <b>Idiomas:</b> ${this.escapeHtml((a.idiomas_contenido || []).join(', ') || '—')}</li>
          <li><b>Tono:</b> ${this.escapeHtml(a.tono_de_voz || '—')}</li>
          <li><b>Colores:</b> ${(a.colors || []).length} · <b>Pilares:</b> ${(a.pilares || []).length} · <b>Tipografias:</b> ${[a.typography_primary, a.typography_secondary].filter(Boolean).length}</li>
          <li><b>Productos detectados:</b> ${(a.products_detected || []).length} · <b>Servicios:</b> ${(a.services_detected || []).length}</li>
          <li><b>Competencia:</b> ${a.competitors_count || 0} competidores · <b>Monitoreo:</b> ${a.watchers_count || 0} sitios</li>
        </ul>
        ${(a.products_detected || []).length ? `<div class="createorg-insight" style="margin-top:10px"><span class="createorg-insight-tag"><i class="fas fa-box"></i> Productos detectados</span><p>${this.escapeHtml((a.products_detected || []).slice(0, 8).map((p) => p.name).filter(Boolean).join(' · '))}</p></div>` : ''}
        ${this._autoIntegrationsBlock()}
      </div>
    `;
  }

  _collectApproval(key) {
    const a = this.approval;
    const g = (id) => (this.container.querySelector('#' + id)?.value || '').trim();
    const csv = (id) => g(id).split(',').map((s) => s.trim()).filter(Boolean);
    if (key === 'identity') { a.name = g('apName'); a.slogan = g('apSlogan'); }
    else if (key === 'market') { a.nicho_core = g('apNicho'); a.mercado_objetivo = csv('apMercados'); a.idiomas_contenido = csv('apIdiomas'); a.locale = g('apLocale'); a.timezone = g('apTz'); }
    else if (key === 'voice') { a.tono_de_voz = g('apTono'); a.propuesta_valor = g('apPropuesta'); a.mision_vision = g('apMision'); a.pilares = csv('apPilares'); a.palabras_clave = csv('apClave'); a.palabras_prohibidas = csv('apProhibidas'); }
    else if (key === 'colors') {
      // El rol se asigna AUTOMATICAMENTE por posicion (1º primary, 2º secondary, resto accent_N).
      a.colors = [...this.container.querySelectorAll('#apColors .createorg-color-row')]
        .map((r) => (r.querySelector('[data-color-hex]')?.value || '').trim())
        .filter(Boolean)
        .map((hex, i) => ({ color_role: this._colorRole(i), hex_value: hex }));
    }
    else if (key === 'fonts') { a.typography_primary = g('apFont1'); a.typography_secondary = g('apFont2'); a.estetica = g('apEstetica'); }
    else if (key === 'products') {
      a.products_detected = [...this.container.querySelectorAll('#apProducts .createorg-list-row')].map((r) => {
        const i = parseInt(r.getAttribute('data-prod-idx'), 10);
        const orig = (a.products_detected || [])[i] || {};
        return { ...orig, name: (r.querySelector('[data-prod-name]')?.value || '').trim() };
      }).filter((p) => p.name);
    }
    else if (key === 'competitors') {
      if (a.competitors === null) return;
      a.competitors = [...this.container.querySelectorAll('#apComps .createorg-comp-row')].map((r) => ({
        name: (r.querySelector('[data-comp-name]')?.value || '').trim(),
        website: (r.querySelector('[data-comp-web]')?.value || '').trim()
      })).filter((c) => c.name);
    }
    else if (key === 'owner') {
      a.ownerId = this.container.querySelector('#apOwnerSel')?.value || '';
      a.members = [...this.container.querySelectorAll('#apMembers .createorg-member-row')].map((r) => ({
        user_id: r.querySelector('[data-member-user]')?.value || '',
        role: r.querySelector('[data-member-role]')?.value || 'viewer'
      })).filter((m) => m.user_id);
    }
  }

  async _saveApprovalSection(key) {
    if (key === 'review') return { ok: true };
    const a = this.approval;
    let data = {};
    if (key === 'identity') data = { name: a.name, slogan: a.slogan };
    else if (key === 'market') data = { nicho_core: a.nicho_core, mercado_objetivo: a.mercado_objetivo, idiomas_contenido: a.idiomas_contenido, locale: a.locale, timezone: a.timezone };
    else if (key === 'voice') data = { tono_de_voz: a.tono_de_voz, tagline: a.slogan, propuesta_valor: a.propuesta_valor, mision_vision: a.mision_vision, pilares: a.pilares, palabras_clave: a.palabras_clave, palabras_prohibidas: a.palabras_prohibidas };
    else if (key === 'colors') data = { colors: a.colors };
    else if (key === 'fonts') data = { fonts: [a.typography_primary && { font_usage: 'primary', font_family: a.typography_primary }, a.typography_secondary && { font_usage: 'secondary', font_family: a.typography_secondary }].filter(Boolean), estetica: a.estetica };
    else if (key === 'products') data = { products: (a.products_detected || []).map((p) => ({ name: p.name, description: p.description || p.name, image: p.image || null, price: p.price || null, currency: p.currency || null })) };
    else if (key === 'competitors') {
      if (a.competitors === null) return { ok: true };
      data = { competitors: a.competitors };
    }
    else if (key === 'vera') return { ok: true }; // la provision es accion propia del paso
    else if (key === 'owner') {
      data = { owner_user_id: a.ownerId || null, members: (a.members || []).filter((m) => m.user_id) };
    }
    const { data: res, error } = await this.supabase.functions.invoke('admin-update-brand', { body: { organization_id: this.autoOrgId, section: key, data } });
    if (error) {
      let msg = error.message || 'Error al guardar';
      try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch (_) {}
      throw new Error(msg);
    }
    return res;
  }

  async handleApprovalNext() {
    if (this._approvalSaving) return;
    const key = this.APPROVAL_PAGES[this.approvalIdx].key;
    this._collectApproval(key);
    this._approvalSaving = true;
    const btn = this.container.querySelector('[data-action="ap-next"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }
    try {
      await this._saveApprovalSection(key);
      this.approvalIdx++;
      this._approvalSaving = false;
      this._refreshAutoFull();
    } catch (err) {
      this._approvalSaving = false;
      if (btn) { btn.disabled = false; btn.innerHTML = 'Aceptar y seguir'; }
      this.setStatus(err?.message || 'Error al guardar', 'error');
    }
  }

  handleApprovalBack() {
    if (this.approvalIdx > 0) { this.approvalIdx--; this._refreshAutoFull(); }
  }

  handleApprovalFinish() {
    this.showNotification('Marca creada y aprobada.', 'success');
    if (window.router) window.router.navigate('/dev/lead/orgs');
    else window.location.href = '/dev/lead/orgs';
  }

  _apAddColor() {
    this._collectApproval('colors');
    this.approval.colors = [...(this.approval.colors || []), { color_role: 'accent', hex_value: '#000000' }];
    this._refreshAutoFull();
  }
  _apRemoveColor(i) {
    this._collectApproval('colors');
    this.approval.colors.splice(i, 1);
    this._refreshAutoFull();
  }
  _apRemoveProduct(i) {
    this._collectApproval('products');
    (this.approval.products_detected || []).splice(i, 1);
    this._refreshAutoFull();
  }
  _apRemoveComp(i) {
    this._collectApproval('competitors');
    (this.approval.competitors || []).splice(i, 1);
    this._refreshAutoFull();
  }
  _apAddComp() {
    this._collectApproval('competitors');
    this.approval.competitors = [...(this.approval.competitors || []), { name: '', website: '' }];
    this._refreshAutoFull();
  }

  validateStep(key) {
    if (key === 'mode') {
      if (!this.creationMode) return 'Elige como crear la organizacion.';
    }
    if (key === 'auto') {
      if (!this.form.brand_url) return 'Agrega la URL de tu web.';
    }
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
