/**
 * PlacesView — Listado de lugares fisicos de la organizacion (masonry).
 * Mismo patron UX que ProductsListView: + Lugar + Adjuntar lugar con modal
 * (URL/Fotos+Archivos), hover-actions de eliminar/duplicar.
 *
 * Diferencias clave vs Products:
 *  - Lugares se vinculan via entity_id (brand_places no tiene organization_id directo)
 *  - Refresca el listado en lugar de redirigir a detail (no hay PlaceDetailView aun)
 *  - Campos especificos: ambiente_y_vibra, amenidades, address/city/country
 */
class PlacesView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.places = [];
    this.placeImageById = {};
    this._onResizeBound = null;
  }

  renderHTML() {
    return `
<div class="products-list-page" id="placesListPage">
  <div class="products-list-header">
    <div class="products-list-header-actions">
      <button type="button" class="products-list-add-btn" id="placesListAttachBtn" aria-label="${__('Adjuntar escenario desde URL o fotos')}">
        <i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i>
        <span>${__('Adjuntar escenario')}</span>
      </button>
      <button type="button" class="products-list-add-btn" id="placesListAddBtn" aria-label="${__('Agregar escenario')}">
        <span>${__('+ Escenario')}</span>
      </button>
    </div>
  </div>

  <section class="products-list-section" id="placesListSection">
    <div class="products-list-section-head">
      <div class="products-list-section-head-main">
        <h2 class="products-list-section-title">${__('Catálogo')}</h2>
        <span class="products-list-section-count" id="placesListCount">0</span>
      </div>
    </div>
    <div class="products-list-masonry" id="placesListMasonry">${this.masonrySkeleton(12, 'products-list-masonry-grid')}</div>
  </section>

  ${this.emptyState({
    id: 'placesListEmpty',
    hidden: true,
    icon: 'aisc-ico aisc-ico--places',
    iconSrc: '/recursos/icons/Places.svg',
    title: __('Crea tu primer escenario'),
    subtitle: __('Sube fotos o una URL y Vera arma la ficha del lugar: ambiente, amenidades y características visuales. Aparecerán aquí como sets para tus producciones.'),
    primaryLabel: __('+ Escenario'),
    secondaryLabel: __('Adjuntar escenario'),
  })}
</div>`;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) { if (window.router) window.router.navigate('/login', true); return; }
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
    this._renderPlacesMasonry();
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
      console.error('PlacesView _initSupabase:', e);
    }
  }

  async _loadData() {
    if (!this.supabase || !this.organizationId) {
      this.places = [];
      this.placeImageById = {};
      return;
    }
    const orgId = this.organizationId;
    try {
      const fetcher = () => this._fetchPlacesData(orgId);
      const result = window.apiClient
        ? await window.apiClient.query(`places-list:${orgId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this.places = result.places;
      this.placeImageById = result.placeImageById;
    } catch (e) {
      console.error('PlacesView _loadData:', e);
      if (window.errorLogger) window.errorLogger.capture(e, { source: 'PlacesView._loadData' });
      this.places = [];
      this.placeImageById = {};
    }
  }

  /** Corte: public.elements_full (kind scenario) por CatalogoDataService, con las fotos por file_id. */
  async _fetchPlacesData(orgId) {
    if (!window.CatalogoDatos) return { places: [], placeImageById: {}, fallbackEntityId: null };
    const lista = await window.CatalogoDatos.elementos(orgId, 'scenario');
    const placeImageById = {};
    lista.forEach((e) => { if (e.imagen) placeImageById[e.id] = e.imagen; });
    return { places: lista, placeImageById, fallbackEntityId: null };
  }

  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`places-list:${this.organizationId}`);
    }
  }

  /** En la base nueva no hay «entidad» contenedora: el elemento es su propia identidad. */
  async _ensureEntityId() {
    return null;
  }

  async _onAddPlace() {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const btn = this.container?.querySelector('[id$="AddBtn"]') || document.querySelector('[id$="AddBtn"]');
    if (btn) btn.disabled = true;
    try {
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'scenario', { nombre_lugar: __('nuevo escenario'), description: __('Pendiente de descripción.'), place_type: 'otro' });
      if (!creado?.id) throw new Error(__('No se pudo crear'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      if (typeof this._navigateToProductDetail === 'function') this._navigateToProductDetail(creado.id, creado.id);
    } catch (e) {
      console.error('_onAddPlace:', e);
      alert(e?.message || __('Error al crear'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _renderPlacesMasonry() {
    const section = document.getElementById('placesListSection');
    const empty = document.getElementById('placesListEmpty');
    const container = document.getElementById('placesListMasonry');
    const count = document.getElementById('placesListCount');
    if (!container) return;

    if (count) count.textContent = String(this.places.length || 0);

    const page = document.getElementById('placesListPage');
    if (!this.places.length) {
      container.innerHTML = '';
      if (section) section.style.display = 'none';
      if (empty) empty.style.display = '';
      if (page) page.classList.add('is-empty');
      return;
    }
    if (page) page.classList.remove('is-empty');
    if (section) section.style.display = '';
    if (empty) empty.style.display = 'none';

    const itemHtmls = this.places.map((p, i) => this._renderPlaceCard(p, i));
    container.innerHTML = `<div class="living-masonry-grid products-list-masonry-grid">${itemHtmls.join('')}</div>`;
    const grid = container.querySelector('.living-masonry-grid');
    if (grid && window.applyJustifiedLayout) window.applyJustifiedLayout(grid, { targetHeight: 260 });

    container.querySelectorAll('.product-list-card').forEach((card) => {
      const placeId = card.getAttribute('data-place-id');
      card.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        e.preventDefault(); e.stopPropagation();
        const action = actionBtn.getAttribute('data-action');
        if (action === 'delete') this._onDeletePlace(placeId, actionBtn);
        else if (action === 'duplicate') this._onDuplicatePlace(placeId, actionBtn);
      });
    });
  }

  _renderPlaceCard(p, _i) {
    const imageUrl = this.placeImageById[p.id] || '';
    const name = p.nombre_lugar || __('Lugar');
    const safeName = this.escapeHtml(name);
    return `
      <div class="living-masonry-item">
        <article class="history-image-card product-list-card" data-place-id="${p.id}" role="button" tabindex="0" aria-label="${safeName}">
          ${imageUrl
            ? `<img src="${this.escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" onerror="this.parentNode.classList.add('product-list-card-broken'); this.outerHTML='<div class=&quot;product-list-card-placeholder&quot;><i class=&quot;fas fa-map-marker-alt&quot; aria-hidden=&quot;true&quot;></i></div>';">`
            : `<div class="product-list-card-placeholder"><i class="aisc-ico aisc-ico--places" aria-hidden="true"></i></div>`
          }
          <div class="product-list-card-actions">
            <button type="button" class="glass product-list-card-action" data-action="duplicate" title="${__('Duplicar lugar')}" aria-label="${__('Duplicar lugar')}"><i class="aisc-ico aisc-ico--copy" aria-hidden="true"></i></button>
            <button type="button" class="glass product-list-card-action product-list-card-action--danger" data-action="delete" title="${__('Eliminar lugar')}" aria-label="${__('Eliminar lugar')}"><i class="aisc-ico aisc-ico--delete" aria-hidden="true"></i></button>
          </div>
          <div class="history-card-flow-name">${safeName}</div>
        </article>
      </div>
    `;
  }

  /** Archivar (PATCH archived_at): no se borra, las producciones lo referencian. */
  async _onDeletePlace(placeId, btn) {
    if (!placeId || !window.CatalogoDatos) return;
    if (!confirm(__('¿Quitar este elemento del catálogo? Sus producciones se conservan.'))) return;
    if (btn) btn.disabled = true;
    try {
      const fue = await window.CatalogoDatos.archivar(placeId);
      if (!fue) throw new Error(__('No se pudo quitar (¿sin permiso editar_marca?).'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Elemento archivado'), 'success');
    } catch (e) {
      console.error('_onDeletePlace:', e);
      this._showNotification(e?.message || __('Error al quitar'), 'error');
      if (btn) btn.disabled = false;
    }
  }

  async _onDuplicatePlace(placeId, btn) {
    if (!placeId || !window.CatalogoDatos) return;
    if (btn) btn.disabled = true;
    try {
      const copia = await window.CatalogoDatos.duplicar(placeId);
      if (!copia?.id) throw new Error(__('No se pudo crear la copia'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Duplicado'), 'success');
    } catch (e) {
      console.error('_onDuplicatePlace:', e);
      this._showNotification(e?.message || __('Error al duplicar'), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _onAttachPlace() {
    if (!window.Modal || typeof window.Modal.show !== 'function') {
      this._showNotification(__('Modal no disponible'), 'error');
      return;
    }
    const body = `
      <div class="attach-product-wizard" data-step="picker">
        <section class="attach-product-step attach-product-step--picker" data-panel="picker">
          <p class="attach-product-intro">${__('Elegi como queres que Vera obtenga la información del lugar. La ficha se crea automáticamente y solo te cobra el costo real de OpenAI.')}</p>
          <div class="attach-product-options">
            <button type="button" class="attach-product-option" data-go="url" aria-label="${__('Adjuntar lugar por URL')}">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="aisc-ico aisc-ico--link" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">${__('URL del lugar')}</h4>
              </div>
              <p class="attach-product-option-desc">${__('Pega el enlace de la página del lugar (Google Maps, sitio propio, TripAdvisor, etc.). Vera extraerá nombre, dirección, descripción, fotos y características detectadas.')}</p>
              <span class="attach-product-option-cta">${__('Continuar')} <i class="aisc-ico aisc-ico--arrow-right" aria-hidden="true"></i></span>
            </button>

            <button type="button" class="attach-product-option" data-go="attach" aria-label="${__('Adjuntar fotos y archivos del lugar')}">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">${__('Adjuntar fotos y archivos')}</h4>
              </div>
              <p class="attach-product-option-desc">${__('Subi fotos del lugar (interior, exterior, fachada) y archivos como brochures o PDFs. Vera analiza el espacio con visión y arma la ficha con ambiente, amenidades y características visuales.')}</p>
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
          <div class="attach-product-field-group" data-group="photos">
            <span class="attach-product-field-label">${__('Fotos del lugar')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir fotos del lugar')}">
              <input type="file" class="attach-product-photos-input" multiple accept="image/jpeg,image/png,image/webp,image/jpg" hidden />
              <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra fotos o hace click para elegirlas')}</span>
              <span class="attach-product-dropzone-hint">${__('JPG, PNG, WebP · max 10 imágenes · 25MB c/u')}</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>

          <div class="attach-product-field-group" data-group="files">
            <span class="attach-product-field-label">${__('Archivos del lugar')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir archivos del lugar')}">
              <input type="file" class="attach-product-file-input" multiple accept=".pdf,.doc,.docx,.txt,.md" hidden />
              <i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra archivos o hace click para elegirlos')}</span>
              <span class="attach-product-dropzone-hint">PDF, DOC, DOCX, TXT, MD</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>

          <button type="button" class="attach-product-submit" data-action="submit-attach">
            <i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>
            <span>${__('Analizar con Vera')}</span>
          </button>
        </section>

        <section class="attach-product-step attach-product-step--loading" data-panel="loading" hidden>
          <div class="attach-product-loading">
            <div class="attach-product-spinner" aria-hidden="true"></div>
            <h4 class="attach-product-loading-title">${__('Creando ficha del lugar')}</h4>
            <p class="attach-product-loading-hint" data-loading-hint>${__('Vera esta preparando la ficha. Te recargamos el listado en un momento.')}</p>
          </div>
        </section>
      </div>
    `;

    const handle = window.Modal.show({ title: __('Adjuntar lugar'), body, className: 'attach-product-modal' });
    if (!handle) return;
    const root = handle.bodyEl;
    const wizard = root.querySelector('.attach-product-wizard');

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
      picker:  { title: __('Adjuntar lugar'),           icon: null,            back: false, backTo: null     },
      url:     { title: __('URL del lugar'),            icon: 'aisc-ico aisc-ico--link',       back: true,  backTo: 'picker' },
      attach:  { title: __('Adjuntar fotos y archivos'),icon: 'aisc-ico aisc-ico--paperclip',  back: true,  backTo: 'picker' },
      loading: { title: __('Creando ficha del lugar'),  icon: null,            back: false, backTo: null     },
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

    const urlInput = root.querySelector('.attach-product-url-input');
    const attachPanel = root.querySelector('[data-panel="attach"]');
    const photos = this._wireDropzone(attachPanel?.querySelector('[data-group="photos"]'), 'aisc-ico aisc-ico--image');
    const docs = this._wireDropzone(attachPanel?.querySelector('[data-group="files"]'), 'aisc-ico aisc-ico--document');

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
      await this._analyzeUrlAndCreatePlace({ url: value, hostname: parsed.hostname, modalHandle: handle, hintEl: hint });
    });

    root.querySelector('[data-action="submit-attach"]')?.addEventListener('click', async (e) => {
      const submitBtn = e.currentTarget;
      const photoFiles = Array.from(photos.input?.files || []);
      const docFiles = Array.from(docs.input?.files || []);
      if (!photoFiles.length && !docFiles.length) { this._showNotification(__('Adjunta al menos una foto o un archivo'), 'error'); return; }
      if (photoFiles.length) {
        const invalid = photoFiles.find((f) => !/^image\//.test(f.type));
        if (invalid) return this._showNotification(__('"{name}" no es una imagen', { name: invalid.name }), 'error');
        if (photoFiles.length > 10) return this._showNotification(__('Máximo 10 imágenes por ficha'), 'error');
        const oversize = photoFiles.find((f) => f.size > 25 * 1024 * 1024);
        if (oversize) return this._showNotification(__('"{name}" supera 25MB', { name: oversize.name }), 'error');
      }
      submitBtn.disabled = true;
      goToStep('loading');
      const hint = root.querySelector('[data-loading-hint]');
      if (photoFiles.length) {
        await this._analyzePhotosAndCreatePlace({
          files: photoFiles,
          docFiles: docFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          modalHandle: handle, hintEl: hint
        });
      } else {
        if (hint) hint.textContent = __('Guardando {n} archivo(s) para procesamiento.', { n: docFiles.length });
        await this._createPendingPlace({
          files: docFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          modalHandle: handle,
        });
      }
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
          <button type="button" class="attach-product-file-remove" data-remove-idx="${idx}" aria-label="${__('Quitar')}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>
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
      dropzone.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') input?.click(); });
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); }
      });
      ['dragover', 'dragenter'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); }));
      ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('is-dragover'); }));
      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && input) { input.files = files; renderList(files); }
      });
    }
    return { input, list };
  }

  /**
   * Corte: la ficha por IA (api-*-generate-fiche) se apagó con las functions; el
   * elemento se crea con sus fotos (POST /v1/archivos → attributes.imagenes) y
   * la ficha se completa a mano o, más adelante, con el flujo de catálogo.
   */
  async _analyzePhotosAndCreatePlace({ files, modalHandle, hintEl }) {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const setHint = (t) => { if (hintEl) hintEl.textContent = t; };
    try {
      setHint(__('Creando el elemento…'));
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'scenario', { nombre_lugar: __('nuevo escenario'), description: __('Pendiente de descripción.') });
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
      console.error('_analyzePhotosAndCreatePlace:', e);
      setHint(e?.message || __('No se pudo crear'));
    }
  }

  async _analyzeUrlAndCreatePlace({ url, hostname, modalHandle, hintEl }) {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const setHint = (t) => { if (hintEl) hintEl.textContent = t; };
    try {
      setHint(__('Creando el elemento…'));
      const nombre = typeof this._nameFromUrl === 'function' ? this._nameFromUrl(url) : (hostname || __('nuevo escenario'));
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'scenario', { nombre_lugar: nombre || __('nuevo escenario'), description: __('Pendiente de descripción.'), url });
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
      console.error('_analyzeUrlAndCreatePlace:', e);
      setHint(e?.message || __('No se pudo crear'));
    }
  }

  /** La ficha por IA llega como flujo de catálogo (backend catalogo.enriquecer); aquí solo se dice. */
  async _callFichePlaceFunction({ modalHandle, setHint } = {}) {
    if (typeof setHint === 'function') setHint(__('La ficha por IA llega con el flujo de catálogo.'));
    modalHandle?.close?.();
    return null;
  }

  async _createPendingPlace({ files = null, modalHandle = null } = {}) {
    return this._analyzePhotosAndCreatePlace({ files: files || [], modalHandle, hintEl: null });
  }

  _showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `position:fixed;top:80px;right:2rem;padding:0.75rem 1.1rem;background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};color:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.25);z-index:10000;font-size:0.85rem;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2800);
  }

  _setupEventListeners() {
    if (!this._onResizeBound) {
      this._onResizeBound = () => this._renderPlacesMasonry();
      window.addEventListener('resize', this._onResizeBound);
    }
    const addBtn = document.getElementById('placesListAddBtn');
    if (addBtn) addBtn.onclick = () => this._onAddPlace();
    const attachBtn = document.getElementById('placesListAttachBtn');
    if (attachBtn) attachBtn.onclick = () => this._onAttachPlace();
    // CTAs del empty state premium
    const emptyAdd = document.querySelector('#placesListEmpty [data-empty-add]');
    if (emptyAdd) emptyAdd.onclick = () => this._onAddPlace();
    const emptyAttach = document.querySelector('#placesListEmpty [data-empty-attach]');
    if (emptyAttach) emptyAttach.onclick = () => this._onAttachPlace();
  }

  async onLeave() {
    if (this._onResizeBound) {
      window.removeEventListener('resize', this._onResizeBound);
      this._onResizeBound = null;
    }
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

window.PlacesView = PlacesView;
