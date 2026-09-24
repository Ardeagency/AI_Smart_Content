/**
 * ServicesView — Listado de servicios de la organización (grid de cards).
 * Aplica el mismo patrón UX que ProductsListView: + Servicio + Adjuntar servicio,
 * hover actions (eliminar/duplicar) y wizard modal con URL/Archivos para generar
 * fichas via OpenAI. Reusa los estilos `.attach-product-*` del modal premium.
 */
class ServicesView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.services = [];
  }

  renderHTML() {
    return `
<div class="services-page" id="servicesPage">
  <div class="services-header">
    <div class="services-header-actions">
      <button type="button" class="services-add-btn" id="servicesAttachBtn" aria-label="${__('Adjuntar servicio desde URL o archivos')}">
        <i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i>
        <span>${__('Adjuntar servicio')}</span>
      </button>
      <button type="button" class="services-add-btn" id="servicesAddBtn" aria-label="${__('Agregar servicio')}">
        <span>${__('+ Servicio')}</span>
      </button>
    </div>
  </div>

  <section class="services-section" id="servicesSection">
    <div class="services-section-head">
      <div class="services-section-head-main">
        <h2 class="services-section-title">${__('Catálogo')}</h2>
        <span class="services-section-count" id="servicesCount">0</span>
      </div>
    </div>
    <div class="services-grid" id="servicesGrid">${this.skeletonGrid(8, 'lg')}</div>
  </section>

  ${this.emptyState({
    id: 'servicesEmpty',
    hidden: true,
    icon: 'aisc-ico aisc-ico--brief',
    iconSrc: '/recursos/icons/Service.svg',
    title: __('Crea tu primer servicio'),
    subtitle: __('Sube fotos o una URL y Vera arma la ficha: entregables, metodología y diferenciadores. Aparecerán aquí para tus producciones.'),
    primaryLabel: __('+ Servicio'),
    secondaryLabel: __('Adjuntar servicio'),
  })}
</div>`;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.organizationId =
      this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
  }

  async render() {
    await super.render();
    await this._initSupabase();
    await this._loadData();
    this._renderServices();
    this._setupEventListeners();
  }

  async _initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('ServicesView _initSupabase:', e);
    }
  }

  async _loadData() {
    if (!this.supabase || !this.organizationId) {
      this.services = [];
      return;
    }
    const orgId = this.organizationId;
    try {
      const fetcher = () => this._fetchServicesData(orgId);
      const result = window.apiClient
        ? await window.apiClient.query(`services-list:${orgId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this.services = result.services;
    } catch (e) {
      console.error('ServicesView _loadData:', e);
      if (window.errorLogger) window.errorLogger.capture(e, { source: 'ServicesView._loadData' });
      this.services = [];
    }
  }

  /** Corte: public.elements_full (kind service) por CatalogoDataService, con las fotos por file_id. */
  async _fetchServicesData(orgId) {
    if (!window.CatalogoDatos) return { services: [], serviceImageById: {}, fallbackEntityId: null };
    const lista = await window.CatalogoDatos.elementos(orgId, 'service');
    const serviceImageById = {};
    lista.forEach((e) => { if (e.imagen) serviceImageById[e.id] = e.imagen; });
    return { services: lista, serviceImageById, fallbackEntityId: null };
  }

  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`services-list:${this.organizationId}`);
    }
  }

  /** En la base nueva no hay «entidad» contenedora: el elemento es su propia identidad. */
  async _ensureEntityId() {
    return null;
  }

  async _onAddService() {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const btn = this.container?.querySelector('[id$="AddBtn"]') || document.querySelector('[id$="AddBtn"]');
    if (btn) btn.disabled = true;
    try {
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'service', { nombre_servicio: __('nuevo servicio'), description: __('Pendiente de descripción.'), tipo_servicio: 'otro' });
      if (!creado?.id) throw new Error(__('No se pudo crear'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      if (typeof this._navigateToProductDetail === 'function') this._navigateToProductDetail(creado.id, creado.id);
    } catch (e) {
      console.error('_onAddService:', e);
      alert(e?.message || __('Error al crear'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _renderServices() {
    const section = document.getElementById('servicesSection');
    const empty = document.getElementById('servicesEmpty');
    const grid = document.getElementById('servicesGrid');
    const count = document.getElementById('servicesCount');
    if (!grid) return;

    if (count) count.textContent = String(this.services.length || 0);

    const page = document.getElementById('servicesPage');
    if (!this.services.length) {
      grid.innerHTML = '';
      if (section) section.style.display = 'none';
      if (empty) empty.style.display = '';
      if (page) page.classList.add('is-empty');
      return;
    }
    if (section) section.style.display = '';
    if (empty) empty.style.display = 'none';
    if (page) page.classList.remove('is-empty');

    grid.innerHTML = this.services.map((s) => {
      const price = s.precio_base != null ? `${s.precio_base} ${s.moneda || 'USD'}` : '';
      const tags = (s.beneficios_principales || []).slice(0, 3);
      const name = this.escapeHtml(s.nombre_servicio || __('Servicio'));
      return `
        <article class="service-card" data-service-id="${s.id}">
          <div class="service-card-actions">
            <button type="button" class="glass service-card-action" data-action="duplicate" title="${__('Duplicar servicio')}" aria-label="${__('Duplicar servicio')}"><i class="aisc-ico aisc-ico--copy" aria-hidden="true"></i></button>
            <button type="button" class="glass service-card-action service-card-action--danger" data-action="delete" title="${__('Eliminar servicio')}" aria-label="${__('Eliminar servicio')}"><i class="aisc-ico aisc-ico--delete" aria-hidden="true"></i></button>
          </div>
          <div class="service-card-head">
            <h3 class="service-card-title">${name}</h3>
            ${price ? `<span class="service-card-price">${this.escapeHtml(price)}</span>` : ''}
          </div>
          ${s.descripcion_servicio ? `<p class="service-card-desc">${this.escapeHtml(s.descripcion_servicio)}</p>` : `<p class="service-card-desc service-card-desc-empty">${__('Sin descripción todavía.')}</p>`}
          <div class="service-card-meta">
            ${s.duracion_estimada ? `<span class="service-card-duration"><i class="aisc-ico aisc-ico--clock" aria-hidden="true"></i> ${this.escapeHtml(s.duracion_estimada)}</span>` : ''}
          </div>
          ${tags.length ? `<div class="service-card-tags">${tags.map((t) => `<span class="service-card-tag">${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.service-card').forEach((card) => {
      const serviceId = card.getAttribute('data-service-id');
      card.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const action = actionBtn.getAttribute('data-action');
        if (action === 'delete') this._onDeleteService(serviceId, actionBtn);
        else if (action === 'duplicate') this._onDuplicateService(serviceId, actionBtn);
      });
    });
  }

  /** Archivar (PATCH archived_at): no se borra, las producciones lo referencian. */
  async _onDeleteService(serviceId, btn) {
    if (!serviceId || !window.CatalogoDatos) return;
    if (!confirm(__('¿Quitar este elemento del catálogo? Sus producciones se conservan.'))) return;
    if (btn) btn.disabled = true;
    try {
      const fue = await window.CatalogoDatos.archivar(serviceId);
      if (!fue) throw new Error(__('No se pudo quitar (¿sin permiso editar_marca?).'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Elemento archivado'), 'success');
    } catch (e) {
      console.error('_onDeleteService:', e);
      this._showNotification(e?.message || __('Error al quitar'), 'error');
      if (btn) btn.disabled = false;
    }
  }

  async _onDuplicateService(serviceId, btn) {
    if (!serviceId || !window.CatalogoDatos) return;
    if (btn) btn.disabled = true;
    try {
      const copia = await window.CatalogoDatos.duplicar(serviceId);
      if (!copia?.id) throw new Error(__('No se pudo crear la copia'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Duplicado'), 'success');
    } catch (e) {
      console.error('_onDuplicateService:', e);
      this._showNotification(e?.message || __('Error al duplicar'), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _onAttachService() {
    if (!window.Modal || typeof window.Modal.show !== 'function') {
      this._showNotification(__('Modal no disponible'), 'error');
      return;
    }
    const body = `
      <div class="attach-product-wizard" data-step="picker">
        <section class="attach-product-step attach-product-step--picker" data-panel="picker">
          <p class="attach-product-intro">${__('Elegi como queres que Vera obtenga la información del servicio. La ficha se crea automáticamente y solo te cobra el costo real de OpenAI.')}</p>
          <div class="attach-product-options">
            <button type="button" class="attach-product-option" data-go="url" aria-label="${__('Adjuntar servicio por URL')}">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="aisc-ico aisc-ico--link" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">${__('URL del servicio')}</h4>
              </div>
              <p class="attach-product-option-desc">${__('Pega el enlace de la página del servicio. Vera leerá la URL y armará la ficha con descripción, beneficios, entregables y metodología detectados.')}</p>
              <span class="attach-product-option-cta">${__('Continuar')} <i class="aisc-ico aisc-ico--arrow-right" aria-hidden="true"></i></span>
            </button>

            <button type="button" class="attach-product-option" data-go="attach" aria-label="${__('Adjuntar archivos del servicio')}">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">${__('Adjuntar archivos')}</h4>
              </div>
              <p class="attach-product-option-desc">${__('Subi PDFs, brochures, fichas técnicas o catálogos del servicio. Vera analizará el contenido y construirá la ficha estructurada.')}</p>
              <span class="attach-product-option-cta">${__('Continuar')} <i class="aisc-ico aisc-ico--arrow-right" aria-hidden="true"></i></span>
            </button>
          </div>
        </section>

        <section class="attach-product-step attach-product-step--form" data-panel="url" hidden>
          <label class="attach-product-field">
            <span class="attach-product-field-label">${__('Enlace')}</span>
            <input type="url" class="attach-product-url-input" placeholder="https://..." autocomplete="off" />
          </label>
          <button type="button" class="attach-product-submit" data-action="submit-url">
            <i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>
            <span>${__('Analizar URL con Vera')}</span>
          </button>
        </section>

        <section class="attach-product-step attach-product-step--form" data-panel="attach" hidden>
          <div class="attach-product-field-group" data-group="files">
            <span class="attach-product-field-label">${__('Archivos del servicio')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir archivos del servicio')}">
              <input type="file" class="attach-product-file-input" multiple accept=".pdf,.doc,.docx,.txt,.md" hidden />
              <i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra archivos o hace click para elegirlos')}</span>
              <span class="attach-product-dropzone-hint">PDF, DOC, DOCX, TXT, MD</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>
          <button type="button" class="attach-product-submit" data-action="submit-files">
            <i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>
            <span>${__('Analizar con Vera')}</span>
          </button>
        </section>

        <section class="attach-product-step attach-product-step--loading" data-panel="loading" hidden>
          <div class="attach-product-loading">
            <div class="attach-product-spinner" aria-hidden="true"></div>
            <h4 class="attach-product-loading-title">${__('Creando ficha del servicio')}</h4>
            <p class="attach-product-loading-hint" data-loading-hint>${__('Vera esta preparando la ficha del servicio. Te recargamos el listado en un momento.')}</p>
          </div>
        </section>
      </div>
    `;

    const handle = window.Modal.show({
      title: __('Adjuntar servicio'),
      body,
      className: 'attach-product-modal',
    });
    if (!handle) return;
    const root = handle.bodyEl;
    const wizard = root.querySelector('.attach-product-wizard');

    // Inyectar back button en el header (mismo patron que productos)
    const header = handle.modal.querySelector('.modal-header');
    const titleEl = header?.querySelector('h3');
    let backBtn = null;
    if (header && titleEl) {
      const headerLeft = document.createElement('div');
      headerLeft.className = 'attach-product-header-left';
      backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'attach-product-back';
      backBtn.hidden = true;
      backBtn.setAttribute('aria-label', __('Volver'));
      backBtn.innerHTML = `<i class="aisc-ico aisc-ico--arrow-left" aria-hidden="true"></i><span>${__('Volver')}</span>`;
      backBtn.addEventListener('click', () => {
        const currentStep = wizard?.getAttribute('data-step');
        const target = stepConfig[currentStep]?.backTo || 'picker';
        goToStep(target);
      });
      header.insertBefore(headerLeft, header.firstChild);
      headerLeft.appendChild(backBtn);
      headerLeft.appendChild(titleEl);
    }

    const stepConfig = {
      picker:  { title: __('Adjuntar servicio'),          icon: null,            back: false, backTo: null },
      url:     { title: __('URL del servicio'),           icon: 'aisc-ico aisc-ico--link',       back: true,  backTo: 'picker' },
      attach:  { title: __('Adjuntar archivos'),          icon: 'aisc-ico aisc-ico--paperclip',  back: true,  backTo: 'picker' },
      loading: { title: __('Creando ficha del servicio'), icon: null,            back: false, backTo: null },
    };

    const goToStep = (step) => {
      if (!wizard) return;
      wizard.setAttribute('data-step', step);
      root.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-panel') !== step;
      });
      const cfg = stepConfig[step];
      if (cfg && titleEl) {
        const iconHtml = cfg.icon ? `<i class="fas ${cfg.icon} attach-product-header-icon" aria-hidden="true"></i>` : '';
        titleEl.innerHTML = `${iconHtml}<span>${this.escapeHtml(cfg.title)}</span>`;
      }
      if (backBtn) backBtn.hidden = !(cfg && cfg.back);
      const visible = root.querySelector(`[data-panel="${step}"]`);
      const focusable = visible?.querySelector('input, button');
      try { focusable?.focus(); } catch (_) {}
    };

    root.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(btn.getAttribute('data-go')));
    });

    // Wiring del dropzone de archivos (con boton de quitar individual)
    const urlInput = root.querySelector('.attach-product-url-input');
    const attachPanel = root.querySelector('[data-panel="attach"]');
    const fileGroup = attachPanel?.querySelector('[data-group="files"]');
    const docs = this._wireDropzone(fileGroup, 'aisc-ico aisc-ico--document');

    root.querySelector('[data-action="submit-url"]')?.addEventListener('click', async (e) => {
      const submitBtn = e.currentTarget;
      const value = (urlInput?.value || '').trim();
      if (!value) { urlInput?.focus(); this._showNotification(__('Pega una URL primero'), 'error'); return; }
      let parsed;
      try {
        parsed = new URL(value);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error('protocol');
      } catch (_) {
        urlInput?.focus(); this._showNotification(__('La URL no es valida'), 'error'); return;
      }
      submitBtn.disabled = true;
      goToStep('loading');
      const hint = root.querySelector('[data-loading-hint]');
      await this._analyzeUrlAndCreateService({ url: value, hostname: parsed.hostname, modalHandle: handle, hintEl: hint });
    });

    root.querySelector('[data-action="submit-files"]')?.addEventListener('click', async (e) => {
      const submitBtn = e.currentTarget;
      const docFiles = Array.from(docs.input?.files || []);
      if (!docFiles.length) {
        this._showNotification(__('Adjunta al menos un archivo'), 'error');
        return;
      }
      submitBtn.disabled = true;
      goToStep('loading');
      const hint = root.querySelector('[data-loading-hint]');
      if (hint) hint.textContent = __('Guardando {n} {files} para procesamiento. Te redirigimos al detalle.', { n: docFiles.length, files: docFiles.length === 1 ? __('archivo') : __('archivos') });
      await this._createPendingService({
        files: docFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
        modalHandle: handle,
      });
    });
  }

  _wireDropzone(groupEl, iconClass = 'aisc-ico aisc-ico--document') {
    if (!groupEl) return { input: null, list: null };
    const dropzone = groupEl.querySelector('.attach-product-dropzone');
    const input = groupEl.querySelector('input[type="file"]');
    const list = groupEl.querySelector('.attach-product-file-list');
    const renderList = (files) => {
      if (!list) return;
      if (!files || !files.length) { list.hidden = true; list.innerHTML = ''; return; }
      list.hidden = false;
      list.innerHTML = Array.from(files).map((f, idx) => {
        const sizeStr = f.size > 1024 * 1024
          ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(f.size / 1024))} KB`;
        return `<li data-idx="${idx}">
          <i class="fas ${iconClass}" aria-hidden="true"></i>
          <span class="attach-product-file-name">${this.escapeHtml(f.name)}</span>
          <span class="attach-product-file-size">${sizeStr}</span>
          <button type="button" class="attach-product-file-remove" data-remove-idx="${idx}" aria-label="${__('Quitar archivo')}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
        </li>`;
      }).join('');
    };
    const removeFileAt = (idx) => {
      if (!input || !input.files) return;
      const dt = new DataTransfer();
      Array.from(input.files).forEach((f, i) => { if (i !== idx) dt.items.add(f); });
      input.files = dt.files;
      renderList(input.files);
    };
    if (input) input.addEventListener('change', () => renderList(input.files));
    if (list) {
      list.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-remove-idx]');
        if (!removeBtn) return;
        e.preventDefault(); e.stopPropagation();
        const idx = parseInt(removeBtn.getAttribute('data-remove-idx'), 10);
        if (!Number.isNaN(idx)) removeFileAt(idx);
      });
    }
    if (dropzone) {
      dropzone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') input?.click();
      });
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); }
      });
      ['dragover', 'dragenter'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
        e.preventDefault(); dropzone.classList.add('is-dragover');
      }));
      ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
        e.preventDefault(); dropzone.classList.remove('is-dragover');
      }));
      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && input) { input.files = files; renderList(files); }
      });
    }
    return { input, list };
  }

  async _analyzeUrlAndCreateService({ url, hostname, modalHandle, hintEl }) {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const setHint = (t) => { if (hintEl) hintEl.textContent = t; };
    try {
      setHint(__('Creando el elemento…'));
      const nombre = typeof this._nameFromUrl === 'function' ? this._nameFromUrl(url) : (hostname || __('nuevo servicio'));
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'service', { nombre_servicio: nombre || __('nuevo servicio'), description: __('Pendiente de descripción.'), url });
      modalHandle?.close?.();
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Elemento creado con su enlace. La lectura automática de la página llega con el flujo de catálogo.'), 'info');
      if (typeof this._navigateToProductDetail === 'function') this._navigateToProductDetail(creado.id, creado.id);
    } catch (e) {
      console.error('_analyzeUrlAndCreateService:', e);
      setHint(e?.message || __('No se pudo crear'));
    }
  }

  /**
   * Corte: la ficha por IA (api-*-generate-fiche) se apagó con las functions; el
   * elemento se crea con sus fotos (POST /v1/archivos → attributes.imagenes) y
   * la ficha se completa a mano o, más adelante, con el flujo de catálogo.
   */
  async _crearServicioConArchivos({ files, modalHandle, hintEl }) {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const setHint = (t) => { if (hintEl) hintEl.textContent = t; };
    try {
      setHint(__('Creando el elemento…'));
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'service', { nombre_servicio: __('nuevo servicio'), description: __('Pendiente de descripción.') });
      const lista = Array.from(files || []).filter((f) => f && /^image\//.test(f.type || ''));
      for (const f of lista) {
        setHint(__('Subiendo {n}…', { n: f.name }));
        try { await window.CatalogoDatos.subirFoto(this.organizationId, creado.id, f); }
        catch (e) { console.warn('[catalogo] foto:', e?.code || e?.message); if (e?.code === 'sin_api') { setHint(__('Las fotos se suben cuando el borde esté configurado.')); break; } }
      }
      modalHandle?.close?.();
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Elemento creado. La ficha por IA llega con el flujo de catálogo: complétala desde su detalle.'), 'info');
      if (typeof this._navigateToProductDetail === 'function') this._navigateToProductDetail(creado.id, creado.id);
    } catch (e) {
      console.error('_crearServicioConArchivos:', e);
      setHint(e?.message || __('No se pudo crear'));
    }
  }

  async _createPendingService({ files = null, modalHandle = null } = {}) {
    return this._crearServicioConArchivos({ files: files || [], modalHandle, hintEl: null });
  }

  _showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `position:fixed;top:80px;right:2rem;padding:0.75rem 1.1rem;background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};color:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.25);z-index:var(--z-modal-backdrop);font-size:0.85rem;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2800);
  }

  _setupEventListeners() {
    const addBtn = document.getElementById('servicesAddBtn');
    if (addBtn) addBtn.onclick = () => this._onAddService();
    const attachBtn = document.getElementById('servicesAttachBtn');
    if (attachBtn) attachBtn.onclick = () => this._onAttachService();
    // CTAs del empty state premium
    const emptyAdd = document.querySelector('#servicesEmpty [data-empty-add]');
    if (emptyAdd) emptyAdd.onclick = () => this._onAddService();
    const emptyAttach = document.querySelector('#servicesEmpty [data-empty-attach]');
    if (emptyAttach) emptyAttach.onclick = () => this._onAttachService();
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

window.ServicesView = ServicesView;
