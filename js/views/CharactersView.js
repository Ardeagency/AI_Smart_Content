/**
 * CharactersView — Listado de personajes/actores de la organizacion (masonry).
 * Mismo patron UX que PlacesView/ProductsListView: + Personaje + Adjuntar
 * personaje con modal (Fotos+Archivos), hover-actions de eliminar/duplicar.
 *
 * Un "personaje" (actor) es una entidad de marca que protagoniza la produccion
 * junto al producto. Estructura espejo de brand_places:
 *  - Se vincula via entity_id (brand_characters no tiene organization_id directo)
 *  - Tabla: brand_characters / imagenes: character_images / bucket: character-images
 *  - Campos ficha: rasgos_personalidad, caracteristicas_visuales, vestuario_y_estilo,
 *    rol_narrativo, tono_de_voz, casos_de_uso, diferenciadores
 *
 * Nota: la generacion de ficha con IA (OpenAI Vision) queda pendiente de su
 * Netlify function (api-characters-generate-fiche). Por ahora el adjuntar sube
 * las fotos y crea el personaje del lado cliente.
 */
class CharactersView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.characters = [];
    this.characterImageById = {};
    this._onResizeBound = null;
  }

  renderHTML() {
    return `
<div class="products-list-page" id="charactersListPage">
  <div class="products-list-header">
    <div class="products-list-header-actions">
      <button type="button" class="products-list-add-btn" id="charactersListAttachBtn" aria-label="${__('Adjuntar personaje desde fotos')}">
        <i class="aisc-ico aisc-ico--paperclip" aria-hidden="true"></i>
        <span>${__('Adjuntar personaje')}</span>
      </button>
      <button type="button" class="products-list-add-btn" id="charactersListAddBtn" aria-label="${__('Agregar personaje')}">
        <span>${__('+ Personaje')}</span>
      </button>
    </div>
  </div>

  <section class="products-list-section" id="charactersListSection">
    <div class="products-list-section-head">
      <div class="products-list-section-head-main">
        <h2 class="products-list-section-title">${__('Catálogo')}</h2>
        <span class="products-list-section-count" id="charactersListCount">0</span>
      </div>
    </div>
    <div class="products-list-masonry" id="charactersListMasonry">${this.masonrySkeleton(12, 'products-list-masonry-grid')}</div>
  </section>

  ${this.emptyState({
    id: 'charactersListEmpty',
    hidden: true,
    icon: 'aisc-ico aisc-ico--audience',
    iconSrc: '/recursos/icons/Characters.svg',
    title: __('Crea tu primer personaje'),
    subtitle: __('Sube fotos de referencia y Vera arma la ficha: rasgos, vestuario y rol. Aparecerán aquí listos para protagonizar tus producciones.'),
    primaryLabel: __('+ Personaje'),
    secondaryLabel: __('Adjuntar personaje'),
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
    this._renderCharactersMasonry();
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
      console.error('CharactersView _initSupabase:', e);
    }
  }

  async _loadData() {
    if (!this.supabase || !this.organizationId) {
      this.characters = [];
      this.characterImageById = {};
      return;
    }
    const orgId = this.organizationId;
    try {
      const fetcher = () => this._fetchCharactersData(orgId);
      const result = window.apiClient
        ? await window.apiClient.query(`characters-list:${orgId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this.characters = result.characters;
      this.characterImageById = result.characterImageById;
    } catch (e) {
      console.error('CharactersView _loadData:', e);
      if (window.errorLogger) window.errorLogger.capture(e, { source: 'CharactersView._loadData' });
      this.characters = [];
      this.characterImageById = {};
    }
  }

  /** Corte: public.elements_full (kind character) por CatalogoDataService, con las fotos por file_id. */
  async _fetchCharactersData(orgId) {
    if (!window.CatalogoDatos) return { characters: [], characterImageById: {}, fallbackEntityId: null };
    const lista = await window.CatalogoDatos.elementos(orgId, 'character');
    const characterImageById = {};
    lista.forEach((e) => { if (e.imagen) characterImageById[e.id] = e.imagen; });
    return { characters: lista, characterImageById, fallbackEntityId: null };
  }

  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`characters-list:${this.organizationId}`);
    }
  }

  /** En la base nueva no hay «entidad» contenedora: el elemento es su propia identidad. */
  async _ensureEntityId() {
    return null;
  }

  async _onAddCharacter() {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const btn = this.container?.querySelector('[id$="AddBtn"]') || document.querySelector('[id$="AddBtn"]');
    if (btn) btn.disabled = true;
    try {
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'character', { nombre_personaje: __('nuevo personaje'), description: __('Pendiente de descripción.'), tipo_personaje: 'otro' });
      if (!creado?.id) throw new Error(__('No se pudo crear'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      if (typeof this._navigateToProductDetail === 'function') this._navigateToProductDetail(creado.id, creado.id);
    } catch (e) {
      console.error('_onAddCharacter:', e);
      this._showNotification(e?.message || __('Error al crear'), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _renderCharactersMasonry() {
    const section = document.getElementById('charactersListSection');
    const empty = document.getElementById('charactersListEmpty');
    const container = document.getElementById('charactersListMasonry');
    const count = document.getElementById('charactersListCount');
    if (!container) return;

    if (count) count.textContent = String(this.characters.length || 0);

    const page = document.getElementById('charactersListPage');
    if (!this.characters.length) {
      container.innerHTML = '';
      if (section) section.style.display = 'none';
      if (empty) empty.style.display = '';
      if (page) page.classList.add('is-empty');
      return;
    }
    if (section) section.style.display = '';
    if (empty) empty.style.display = 'none';
    if (page) page.classList.remove('is-empty');

    const itemHtmls = this.characters.map((c, i) => this._renderCharacterCard(c, i));
    container.innerHTML = `<div class="living-masonry-grid products-list-masonry-grid">${itemHtmls.join('')}</div>`;
    const grid = container.querySelector('.living-masonry-grid');
    if (grid && window.applyJustifiedLayout) window.applyJustifiedLayout(grid, { targetHeight: 260 });

    container.querySelectorAll('.product-list-card').forEach((card) => {
      const characterId = card.getAttribute('data-character-id');
      card.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        e.preventDefault(); e.stopPropagation();
        const action = actionBtn.getAttribute('data-action');
        if (action === 'delete') this._onDeleteCharacter(characterId, actionBtn);
        else if (action === 'duplicate') this._onDuplicateCharacter(characterId, actionBtn);
      });
    });
  }

  _renderCharacterCard(c, _i) {
    const imageUrl = this.characterImageById[c.id] || '';
    const name = c.nombre_personaje || __('Personaje');
    const safeName = this.escapeHtml(name);
    return `
      <div class="living-masonry-item">
        <article class="history-image-card product-list-card" data-character-id="${c.id}" role="button" tabindex="0" aria-label="${safeName}">
          ${imageUrl
            ? `<img src="${this.escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" onerror="this.parentNode.classList.add('product-list-card-broken'); this.outerHTML='<div class=&quot;product-list-card-placeholder&quot;><i class=&quot;fas fa-user&quot; aria-hidden=&quot;true&quot;></i></div>';">`
            : `<div class="product-list-card-placeholder"><i class="aisc-ico aisc-ico--audience" aria-hidden="true"></i></div>`
          }
          <div class="product-list-card-actions">
            <button type="button" class="glass product-list-card-action" data-action="duplicate" title="${__('Duplicar personaje')}" aria-label="${__('Duplicar personaje')}"><i class="aisc-ico aisc-ico--copy" aria-hidden="true"></i></button>
            <button type="button" class="glass product-list-card-action product-list-card-action--danger" data-action="delete" title="${__('Eliminar personaje')}" aria-label="${__('Eliminar personaje')}"><i class="aisc-ico aisc-ico--delete" aria-hidden="true"></i></button>
          </div>
          <div class="history-card-flow-name">${safeName}</div>
        </article>
      </div>
    `;
  }

  /** Archivar (PATCH archived_at): no se borra, las producciones lo referencian. */
  async _onDeleteCharacter(characterId, btn) {
    if (!characterId || !window.CatalogoDatos) return;
    // Sobre la tarjeta de la que habla (Capas.preguntar); sin tarjeta, confirmación.
    const tarjeta = btn && btn.closest('article');
    const texto = __('¿Quitar este elemento del catálogo? Sus producciones se conservan.');
    const si = tarjeta
      ? await window.Capas.preguntar(tarjeta, { texto, aceptar: __('Quitar') })
      : await window.Capas.confirmar({ titulo: texto, aceptar: __('Quitar'), peligro: true });
    if (!si) return;
    if (btn) btn.disabled = true;
    try {
      const fue = await window.CatalogoDatos.archivar(characterId);
      if (!fue) throw new Error(__('No se pudo quitar (¿sin permiso editar_marca?).'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Elemento archivado'), 'success');
    } catch (e) {
      console.error('_onDeleteCharacter:', e);
      this._showNotification(e?.message || __('Error al quitar'), 'error');
      if (btn) btn.disabled = false;
    }
  }

  async _onDuplicateCharacter(characterId, btn) {
    if (!characterId || !window.CatalogoDatos) return;
    if (btn) btn.disabled = true;
    try {
      const copia = await window.CatalogoDatos.duplicar(characterId);
      if (!copia?.id) throw new Error(__('No se pudo crear la copia'));
      this._invalidateCache();
      await this._loadData();
      if (typeof this._renderProductsMasonry === 'function') this._renderProductsMasonry();
      else if (typeof this._renderServices === 'function') this._renderServices();
      else if (typeof this._renderPlacesMasonry === 'function') this._renderPlacesMasonry();
      else if (typeof this._renderCharactersMasonry === 'function') this._renderCharactersMasonry();
      this._showNotification(__('Duplicado'), 'success');
    } catch (e) {
      console.error('_onDuplicateCharacter:', e);
      this._showNotification(e?.message || __('Error al duplicar'), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _onAttachCharacter() {
    if (!window.Modal || typeof window.Modal.show !== 'function') {
      this._showNotification(__('Modal no disponible'), 'error');
      return;
    }
    const body = `
      <div class="attach-product-wizard" data-step="attach">
        <section class="attach-product-step attach-product-step--form" data-panel="attach">
          <p class="attach-product-intro">${__('Sube fotos de referencia del personaje (poses, vestuario, expresiones). Vera analiza la imagen con visión y arma la ficha (rasgos, vestuario, rol). Solo te cobra el costo real de OpenAI.')}</p>
          <div class="attach-product-field-group" data-group="photos">
            <span class="attach-product-field-label">${__('Fotos del personaje')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir fotos del personaje')}">
              <input type="file" class="attach-product-photos-input" multiple accept="image/jpeg,image/png,image/webp,image/jpg" hidden />
              <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra fotos o hace click para elegirlas')}</span>
              <span class="attach-product-dropzone-hint">${__('JPG, PNG, WebP · max 10 imágenes · 25MB c/u')}</span>
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
            <h4 class="attach-product-loading-title">${__('Creando ficha del personaje')}</h4>
            <p class="attach-product-loading-hint" data-loading-hint>${__('Vera esta preparando la ficha. Te recargamos el listado en un momento.')}</p>
          </div>
        </section>
      </div>
    `;

    const handle = window.Modal.show({ title: __('Adjuntar personaje'), body, className: 'attach-product-modal' });
    if (!handle) return;
    const root = handle.bodyEl;
    const wizard = root.querySelector('.attach-product-wizard');

    const goToStep = (step) => {
      if (!wizard) return;
      wizard.setAttribute('data-step', step);
      root.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-panel') !== step;
      });
    };

    const photos = this._wireDropzone(root.querySelector('[data-group="photos"]'), 'aisc-ico aisc-ico--image');

    root.querySelector('[data-action="submit-attach"]')?.addEventListener('click', async (e) => {
      const submitBtn = e.currentTarget;
      const photoFiles = Array.from(photos.input?.files || []);
      if (!photoFiles.length) { this._showNotification(__('Adjunta al menos una foto'), 'error'); return; }
      const invalid = photoFiles.find((f) => !/^image\//.test(f.type));
      if (invalid) return this._showNotification(__('"{name}" no es una imagen', { name: invalid.name }), 'error');
      if (photoFiles.length > 10) return this._showNotification(__('Máximo 10 imágenes por ficha'), 'error');
      const oversize = photoFiles.find((f) => f.size > 25 * 1024 * 1024);
      if (oversize) return this._showNotification(__('"{name}" supera 25MB', { name: oversize.name }), 'error');
      submitBtn.disabled = true;
      goToStep('loading');
      const hint = root.querySelector('[data-loading-hint]');
      await this._analyzePhotosAndCreateCharacter({ files: photoFiles, modalHandle: handle, hintEl: hint });
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
  async _analyzePhotosAndCreateCharacter({ files, modalHandle, hintEl }) {
    if (!window.CatalogoDatos || !this.organizationId) return;
    const setHint = (t) => { if (hintEl) hintEl.textContent = t; };
    try {
      setHint(__('Creando el elemento…'));
      const creado = await window.CatalogoDatos.crear(this.organizationId, 'character', { nombre_personaje: __('nuevo personaje'), description: __('Pendiente de descripción.') });
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
      console.error('_analyzePhotosAndCreateCharacter:', e);
      setHint(e?.message || __('No se pudo crear'));
    }
  }

  /** La ficha por IA llega como flujo de catálogo (backend catalogo.enriquecer); aquí solo se dice. */
  async _callFicheCharacterFunction({ modalHandle, setHint } = {}) {
    if (typeof setHint === 'function') setHint(__('La ficha por IA llega con el flujo de catálogo.'));
    modalHandle?.close?.();
    return null;
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
    if (!this._onResizeBound) {
      this._onResizeBound = () => this._renderCharactersMasonry();
      window.addEventListener('resize', this._onResizeBound);
    }
    const addBtn = document.getElementById('charactersListAddBtn');
    if (addBtn) addBtn.onclick = () => this._onAddCharacter();
    const attachBtn = document.getElementById('charactersListAttachBtn');
    if (attachBtn) attachBtn.onclick = () => this._onAttachCharacter();
    // CTAs del empty state premium
    const emptyAdd = document.querySelector('#charactersListEmpty [data-empty-add]');
    if (emptyAdd) emptyAdd.onclick = () => this._onAddCharacter();
    const emptyAttach = document.querySelector('#charactersListEmpty [data-empty-attach]');
    if (emptyAttach) emptyAttach.onclick = () => this._onAttachCharacter();
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

window.CharactersView = CharactersView;
