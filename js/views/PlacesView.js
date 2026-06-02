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
    <h1 class="products-list-title">Lugares</h1>
    <div class="products-list-header-actions">
      <button type="button" class="products-list-add-btn" id="placesListAttachBtn" aria-label="Adjuntar lugar desde URL o fotos">
        <i class="fas fa-paperclip" aria-hidden="true"></i>
        <span>Adjuntar lugar</span>
      </button>
      <button type="button" class="products-list-add-btn" id="placesListAddBtn" aria-label="Agregar lugar">
        <span>+ Lugar</span>
      </button>
    </div>
  </div>

  <section class="products-list-section" id="placesListSection">
    <div class="products-list-section-head">
      <div class="products-list-section-head-main">
        <h2 class="products-list-section-title">Catalogo</h2>
        <span class="products-list-section-count" id="placesListCount">0</span>
      </div>
    </div>
    <div class="products-list-masonry" id="placesListMasonry">${this.masonrySkeleton(12, 'products-list-masonry-grid')}</div>
  </section>

  <div class="products-list-empty" id="placesListEmpty" style="display:none;">
    <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
    <p>Aun no hay lugares. Crea el primero con + Lugar o adjunta uno.</p>
  </div>
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

  async _fetchPlacesData(orgId) {
    // brand_places se filtra via brand_entities.organization_id (no tiene FK directo a org)
    // Paso 1: obtener entity_ids de la org
    const { data: entities, error: entError } = await this.supabase
      .from('brand_entities')
      .select('id')
      .eq('organization_id', orgId);
    if (entError) throw entError;
    const entityIds = (entities || []).map((e) => e.id);
    if (entityIds.length === 0) return { places: [], placeImageById: {} };

    // Paso 2: lugares filtrados por esos entities
    const { data: placesData, error: placesError } = await this.supabase
      .from('brand_places')
      .select('id, entity_id, nombre_lugar, descripcion_lugar, place_type, city, country, address')
      .in('entity_id', entityIds)
      .order('created_at', { ascending: false });
    if (placesError) throw placesError;
    const places = placesData || [];

    // Paso 3: thumbnails desde place_images
    const placeIds = places.map((p) => p.id);
    const placeImageById = {};
    if (placeIds.length) {
      const { data: imagesData, error: imagesError } = await this.supabase
        .from('place_images')
        .select('place_id, image_url, image_order')
        .in('place_id', placeIds)
        .not('image_url', 'is', null)
        .order('image_order', { ascending: true });
      if (imagesError) throw imagesError;
      (imagesData || []).forEach((img) => {
        const url = (img.image_url || '').trim();
        if (!url) return;
        if (!placeImageById[img.place_id]) placeImageById[img.place_id] = url;
      });
    }

    return { places, placeImageById };
  }

  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`places-list:${this.organizationId}`);
    }
  }

  async _ensureEntityId() {
    if (!this.supabase || !this.organizationId) return null;
    const { data: rows, error } = await this.supabase
      .from('brand_entities')
      .select('id')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) { console.error('PlacesView _ensureEntityId:', error); return null; }
    if (rows?.length) return rows[0].id;
    const { data: created, error: insErr } = await this.supabase
      .from('brand_entities')
      .insert({ organization_id: this.organizationId, name: 'Identity principal', entity_type: 'other', description: null })
      .select('id').single();
    if (insErr) { console.error('PlacesView _ensureEntityId insert:', insErr); return null; }
    return created?.id || null;
  }

  async _onAddPlace() {
    if (!this.supabase || !this.organizationId) return;
    const btn = document.getElementById('placesListAddBtn');
    if (btn) btn.disabled = true;
    try {
      const entityId = await this._ensureEntityId();
      if (!entityId) { this._showNotification('No se pudo obtener una identidad para vincular el lugar', 'error'); return; }
      const { error } = await this.supabase.from('brand_places').insert({
        entity_id: entityId,
        nombre_lugar: 'Nuevo lugar',
        descripcion_lugar: 'Pendiente de descripcion.',
        place_type: 'otro',
      });
      if (error) throw error;
      this._invalidateCache();
      await this._loadData();
      this._renderPlacesMasonry();
    } catch (e) {
      console.error('PlacesView _onAddPlace:', e);
      this._showNotification(e?.message || 'Error al crear el lugar', 'error');
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

    if (!this.places.length) {
      container.innerHTML = '';
      if (section) section.style.display = 'none';
      if (empty) empty.style.display = '';
      return;
    }
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
    const name = p.nombre_lugar || 'Lugar';
    const safeName = this.escapeHtml(name);
    return `
      <div class="living-masonry-item">
        <article class="history-image-card product-list-card" data-place-id="${p.id}" role="button" tabindex="0" aria-label="${safeName}">
          ${imageUrl
            ? `<img src="${this.escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" onerror="this.parentNode.classList.add('product-list-card-broken'); this.outerHTML='<div class=&quot;product-list-card-placeholder&quot;><i class=&quot;fas fa-map-marker-alt&quot; aria-hidden=&quot;true&quot;></i></div>';">`
            : `<div class="product-list-card-placeholder"><i class="fas fa-map-marker-alt" aria-hidden="true"></i></div>`
          }
          <div class="product-list-card-actions">
            <button type="button" class="glass product-list-card-action" data-action="duplicate" title="Duplicar lugar" aria-label="Duplicar lugar"><i class="fas fa-copy" aria-hidden="true"></i></button>
            <button type="button" class="glass product-list-card-action product-list-card-action--danger" data-action="delete" title="Eliminar lugar" aria-label="Eliminar lugar"><i class="fas fa-trash" aria-hidden="true"></i></button>
          </div>
          <div class="history-card-flow-name">${safeName}</div>
        </article>
      </div>
    `;
  }

  async _onDeletePlace(placeId, btn) {
    if (!placeId || !this.supabase) return;
    if (!confirm('¿Eliminar este lugar? Se borraran tambien sus fotos.')) return;
    if (btn) btn.disabled = true;
    try {
      const { error } = await this.supabase.from('brand_places').delete().eq('id', placeId);
      if (error) throw error;
      this._invalidateCache();
      await this._loadData();
      this._renderPlacesMasonry();
      this._showNotification('Lugar eliminado', 'success');
    } catch (e) {
      console.error('PlacesView _onDeletePlace:', e);
      this._showNotification(e?.message || 'Error al eliminar el lugar', 'error');
      if (btn) btn.disabled = false;
    }
  }

  async _onDuplicatePlace(placeId, btn) {
    if (!placeId || !this.supabase) return;
    if (btn) btn.disabled = true;
    try {
      const { data: place, error: fetchError } = await this.supabase
        .from('brand_places').select('*').eq('id', placeId).single();
      if (fetchError || !place) throw fetchError || new Error('No se pudo cargar el lugar');
      const { id: _id, created_at: _c, ...rest } = place;
      const copyData = { ...rest, nombre_lugar: (place.nombre_lugar || 'Lugar').trim() + ' (copia)' };
      const { data: newPlace, error: insertError } = await this.supabase
        .from('brand_places').insert(copyData).select('id').single();
      if (insertError || !newPlace?.id) throw insertError || new Error('No se pudo crear la copia');

      // Copiar imagenes
      const { data: images } = await this.supabase
        .from('place_images')
        .select('image_url, image_type, image_order')
        .eq('place_id', placeId)
        .order('image_order', { ascending: true });
      if (images && images.length) {
        await this.supabase.from('place_images').insert(images.map((img) => ({
          place_id: newPlace.id,
          image_url: img.image_url,
          image_type: img.image_type,
          image_order: img.image_order,
          download_status: 'stored'
        })));
      }
      this._invalidateCache();
      await this._loadData();
      this._renderPlacesMasonry();
      this._showNotification('Lugar duplicado', 'success');
    } catch (e) {
      console.error('PlacesView _onDuplicatePlace:', e);
      this._showNotification(e?.message || 'Error al duplicar el lugar', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ─── Modal: Adjuntar lugar ───────────────────────────────────────────

  _onAttachPlace() {
    if (!window.Modal || typeof window.Modal.show !== 'function') {
      this._showNotification('Modal no disponible', 'error');
      return;
    }
    const body = `
      <div class="attach-product-wizard" data-step="picker">
        <section class="attach-product-step attach-product-step--picker" data-panel="picker">
          <p class="attach-product-intro">Elegi como queres que Vera obtenga la informacion del lugar. La ficha se crea automaticamente y solo te cobra el costo real de OpenAI.</p>
          <div class="attach-product-options">
            <button type="button" class="attach-product-option" data-go="url" aria-label="Adjuntar lugar por URL">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="fas fa-link" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">URL del lugar</h4>
              </div>
              <p class="attach-product-option-desc">Pega el enlace de la pagina del lugar (Google Maps, sitio propio, TripAdvisor, etc.). Vera extraera nombre, direccion, descripcion, fotos y caracteristicas detectadas.</p>
              <span class="attach-product-option-cta">Continuar <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
            </button>

            <button type="button" class="attach-product-option" data-go="attach" aria-label="Adjuntar fotos y archivos del lugar">
              <div class="attach-product-option-head">
                <span class="attach-product-option-icon"><i class="fas fa-paperclip" aria-hidden="true"></i></span>
                <h4 class="attach-product-option-title">Adjuntar fotos y archivos</h4>
              </div>
              <p class="attach-product-option-desc">Subi fotos del lugar (interior, exterior, fachada) y archivos como brochures o PDFs. Vera analiza el espacio con vision y arma la ficha con ambiente, amenidades y caracteristicas visuales.</p>
              <span class="attach-product-option-cta">Continuar <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
            </button>
          </div>
        </section>

        <section class="attach-product-step attach-product-step--form" data-panel="url" hidden>
          <label class="attach-product-field">
            <span class="attach-product-field-label">Enlace</span>
            <input type="url" class="attach-product-url-input" placeholder="https://..." autocomplete="off" />
          </label>
          <button type="button" class="attach-product-submit" data-action="submit-url">
            <i class="fas fa-magic" aria-hidden="true"></i>
            <span>Analizar URL con Vera</span>
          </button>
        </section>

        <section class="attach-product-step attach-product-step--form" data-panel="attach" hidden>
          <div class="attach-product-field-group" data-group="photos">
            <span class="attach-product-field-label">Fotos del lugar</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="Subir fotos del lugar">
              <input type="file" class="attach-product-photos-input" multiple accept="image/jpeg,image/png,image/webp,image/jpg" hidden />
              <i class="fas fa-image" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">Arrastra fotos o hace click para elegirlas</span>
              <span class="attach-product-dropzone-hint">JPG, PNG, WebP · max 10 imagenes · 25MB c/u</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>

          <div class="attach-product-field-group" data-group="files">
            <span class="attach-product-field-label">Archivos del lugar</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="Subir archivos del lugar">
              <input type="file" class="attach-product-file-input" multiple accept=".pdf,.doc,.docx,.txt,.md" hidden />
              <i class="fas fa-paperclip" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">Arrastra archivos o hace click para elegirlos</span>
              <span class="attach-product-dropzone-hint">PDF, DOC, DOCX, TXT, MD</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>

          <button type="button" class="attach-product-submit" data-action="submit-attach">
            <i class="fas fa-magic" aria-hidden="true"></i>
            <span>Analizar con Vera</span>
          </button>
        </section>

        <section class="attach-product-step attach-product-step--loading" data-panel="loading" hidden>
          <div class="attach-product-loading">
            <div class="attach-product-spinner" aria-hidden="true"></div>
            <h4 class="attach-product-loading-title">Creando ficha del lugar</h4>
            <p class="attach-product-loading-hint" data-loading-hint>Vera esta preparando la ficha. Te recargamos el listado en un momento.</p>
          </div>
        </section>
      </div>
    `;

    const handle = window.Modal.show({ title: 'Adjuntar lugar', body, className: 'attach-product-modal' });
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
      backBtn.setAttribute('aria-label', 'Volver');
      backBtn.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i><span>Volver</span>';
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
      picker:  { title: 'Adjuntar lugar',           icon: null,            back: false, backTo: null     },
      url:     { title: 'URL del lugar',            icon: 'fa-link',       back: true,  backTo: 'picker' },
      attach:  { title: 'Adjuntar fotos y archivos',icon: 'fa-paperclip',  back: true,  backTo: 'picker' },
      loading: { title: 'Creando ficha del lugar',  icon: null,            back: false, backTo: null     },
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
    const photos = this._wireDropzone(attachPanel?.querySelector('[data-group="photos"]'), 'fa-image');
    const docs = this._wireDropzone(attachPanel?.querySelector('[data-group="files"]'), 'fa-file');

    root.querySelector('[data-action="submit-url"]')?.addEventListener('click', async (e) => {
      const submitBtn = e.currentTarget;
      const value = (urlInput?.value || '').trim();
      if (!value) { urlInput?.focus(); this._showNotification('Pega una URL primero', 'error'); return; }
      let parsed;
      try {
        parsed = new URL(value);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error('protocol');
      } catch (_) {
        urlInput?.focus(); this._showNotification('La URL no es valida', 'error'); return;
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
      if (!photoFiles.length && !docFiles.length) { this._showNotification('Adjunta al menos una foto o un archivo', 'error'); return; }
      if (photoFiles.length) {
        const invalid = photoFiles.find((f) => !/^image\//.test(f.type));
        if (invalid) return this._showNotification(`"${invalid.name}" no es una imagen`, 'error');
        if (photoFiles.length > 10) return this._showNotification('Maximo 10 imagenes por ficha', 'error');
        const oversize = photoFiles.find((f) => f.size > 25 * 1024 * 1024);
        if (oversize) return this._showNotification(`"${oversize.name}" supera 25MB`, 'error');
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
        if (hint) hint.textContent = `Guardando ${docFiles.length} archivo${docFiles.length === 1 ? '' : 's'} para procesamiento.`;
        await this._createPendingPlace({
          files: docFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          modalHandle: handle,
        });
      }
    });
  }

  _wireDropzone(groupEl, iconClass = 'fa-file') {
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
          <button type="button" class="attach-product-file-remove" data-remove-idx="${idx}" aria-label="Quitar"><i class="fas fa-times" aria-hidden="true"></i></button>
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

  async _analyzePhotosAndCreatePlace({ files, docFiles = [], modalHandle, hintEl }) {
    if (!this.supabase || !this.organizationId || !this.userId) {
      this._showNotification('Sesion no disponible', 'error');
      modalHandle?.close();
      return;
    }
    const setHint = (msg) => { if (hintEl) hintEl.textContent = msg; };
    let placeId = null;
    try {
      setHint('Creando lugar inicial...');
      const entityId = await this._ensureEntityId();
      if (!entityId) throw new Error('No se pudo obtener una identidad para vincular el lugar');
      const placeholderMeta = docFiles.length ? { pending_files: docFiles } : null;
      const { data: created, error: insertError } = await this.supabase
        .from('brand_places')
        .insert({
          entity_id: entityId,
          nombre_lugar: 'Procesando ficha...',
          descripcion_lugar: 'Vera esta analizando las fotos del lugar.',
          place_type: 'otro',
          ...(placeholderMeta ? { contact_info: placeholderMeta } : {})  // reusamos contact_info jsonb para guardar metadata temporal
        })
        .select('id').single();
      if (insertError || !created?.id) throw insertError || new Error('No se pudo crear el lugar');
      placeId = created.id;

      // Subir imagenes a bucket place-images
      setHint(`Subiendo ${files.length} foto${files.length === 1 ? '' : 's'} a storage...`);
      const imageUrls = [];
      for (const file of files) {
        const ext = (file.name?.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        const fileName = `${this.userId}/${placeId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: uploadError } = await this.supabase.storage
          .from('place-images')
          .upload(fileName, file, { contentType: file.type, cacheControl: '3600', upsert: false });
        if (uploadError) throw new Error(`Error subiendo "${file.name}": ${uploadError.message}`);
        const { data: { publicUrl } } = this.supabase.storage.from('place-images').getPublicUrl(fileName);
        imageUrls.push(publicUrl);
      }

      setHint('Vera esta analizando las fotos con OpenAI Vision...');
      await this._callFichePlaceFunction({
        placeId,
        payload: { place_id: placeId, organization_id: this.organizationId, image_urls: imageUrls },
        modalHandle, setHint
      });
      placeId = null;
    } catch (err) {
      console.error('PlacesView _analyzePhotosAndCreatePlace:', err);
      if (placeId) {
        try { await this.supabase.from('brand_places').delete().eq('id', placeId); }
        catch (delErr) { console.warn('No se pudo limpiar placeholder:', delErr); }
        this._invalidateCache();
      }
      modalHandle?.close();
    }
  }

  async _analyzeUrlAndCreatePlace({ url, hostname, modalHandle, hintEl }) {
    if (!this.supabase || !this.organizationId || !this.userId) {
      this._showNotification('Sesion no disponible', 'error');
      modalHandle?.close();
      return;
    }
    const setHint = (msg) => { if (hintEl) hintEl.textContent = msg; };
    let placeId = null;
    try {
      setHint('Creando lugar inicial...');
      const entityId = await this._ensureEntityId();
      if (!entityId) throw new Error('No se pudo obtener una identidad para vincular el lugar');
      const { data: created, error: insertError } = await this.supabase
        .from('brand_places')
        .insert({
          entity_id: entityId,
          nombre_lugar: 'Procesando ficha...',
          descripcion_lugar: 'Vera esta leyendo la pagina del lugar.',
          place_type: 'otro',
          url_lugar: url,
        })
        .select('id').single();
      if (insertError || !created?.id) throw insertError || new Error('No se pudo crear el lugar');
      placeId = created.id;

      setHint(`Leyendo ${hostname || 'la pagina'} y extrayendo datos del lugar...`);
      await this._callFichePlaceFunction({
        placeId,
        payload: { place_id: placeId, organization_id: this.organizationId, url },
        modalHandle, setHint
      });
      placeId = null;
    } catch (err) {
      console.error('PlacesView _analyzeUrlAndCreatePlace:', err);
      if (placeId) {
        try { await this.supabase.from('brand_places').delete().eq('id', placeId); }
        catch (delErr) { console.warn('No se pudo limpiar placeholder:', delErr); }
        this._invalidateCache();
      }
      modalHandle?.close();
    }
  }

  async _callFichePlaceFunction({ placeId, payload, modalHandle, setHint }) {
    const { data: sessionData } = await this.supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('No hay sesion activa');

    const resp = await fetch('/.netlify/functions/api-places-generate-fiche', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    let result;
    try { result = await resp.json(); }
    catch (_) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Gateway HTTP ${resp.status}: ${text.slice(0, 200) || 'sin body'}`);
    }
    if (!resp.ok || !result.ok) {
      const errMsg = result.error || `HTTP ${resp.status}`;
      const detail = result.detail ? ` (${result.detail})` : '';
      if (resp.status === 402) {
        this._showNotification(`Creditos insuficientes. Necesitas ${result.credits_needed?.toFixed?.(4) || '?'} creditos`, 'error');
      } else {
        this._showNotification(`Error generando ficha: ${errMsg}${detail}`, 'error');
      }
      throw new Error(errMsg);
    }

    setHint(`Ficha generada (costo: ${result.credits_charged.toFixed(4)} creditos). Recargando listado...`);
    this._invalidateCache();
    window.apiClient?.invalidate(`nav:credits:${this.organizationId}`);
    modalHandle?.close();
    const imgCount = result.images?.inserted || 0;
    if (result.images?.error) {
      this._showNotification(`Ficha generada · imagenes no se vincularon: ${result.images.error}`, 'error');
    } else {
      const sourceLabel = result.source === 'url' ? 'desde URL' : 'desde fotos';
      this._showNotification(
        `Ficha de lugar generada ${sourceLabel} · ${result.credits_charged.toFixed(4)} creditos · ${imgCount} foto${imgCount === 1 ? '' : 's'}`,
        'success'
      );
    }
    await this._loadData();
    this._renderPlacesMasonry();
  }

  async _createPendingPlace({ files = null, modalHandle = null }) {
    if (!this.supabase || !this.organizationId) {
      this._showNotification('Sesion no disponible', 'error');
      modalHandle?.close();
      return;
    }
    try {
      const entityId = await this._ensureEntityId();
      if (!entityId) throw new Error('No se pudo obtener una identidad');
      const { error } = await this.supabase
        .from('brand_places')
        .insert({
          entity_id: entityId,
          nombre_lugar: files?.length ? `Lugar pendiente (${files.length} archivo${files.length === 1 ? '' : 's'})` : 'Lugar pendiente',
          descripcion_lugar: 'Vera procesara los archivos para completar la ficha automaticamente cuando se cablee la extraccion server-side.',
          place_type: 'otro',
        });
      if (error) throw error;
      this._invalidateCache();
      modalHandle?.close();
      await this._loadData();
      this._renderPlacesMasonry();
      this._showNotification('Lugar guardado para procesamiento posterior', 'info');
    } catch (err) {
      console.error('PlacesView _createPendingPlace:', err);
      this._showNotification(err?.message || 'No se pudo crear el lugar', 'error');
      modalHandle?.close();
    }
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
