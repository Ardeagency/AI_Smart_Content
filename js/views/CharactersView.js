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
    <h1 class="products-list-title">${__('Personajes')}</h1>
    <div class="products-list-header-actions">
      <button type="button" class="products-list-add-btn" id="charactersListAttachBtn" aria-label="${__('Adjuntar personaje desde fotos')}">
        <i class="fas fa-paperclip" aria-hidden="true"></i>
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
        <h2 class="products-list-section-title">${__('Catalogo')}</h2>
        <span class="products-list-section-count" id="charactersListCount">0</span>
      </div>
    </div>
    <div class="products-list-masonry" id="charactersListMasonry">${this.masonrySkeleton(12, 'products-list-masonry-grid')}</div>
  </section>

  <div class="products-list-empty" id="charactersListEmpty" style="display:none;">
    ${this.emptyState({
      icon: 'fa-users',
      iconSrc: '/recursos/icons/Characters.svg',
      title: __('Crea tu primer personaje'),
      subtitle: __('Sube fotos de referencia y Vera arma la ficha: rasgos, vestuario y rol. Apareceran aqui listos para protagonizar tus producciones.'),
      primaryLabel: __('+ Personaje'),
      secondaryLabel: __('Adjuntar personaje'),
    })}
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

  async _fetchCharactersData(orgId) {
    // brand_characters se filtra via brand_entities.organization_id (sin FK directo a org)
    const { data: entities, error: entError } = await this.supabase
      .from('brand_entities')
      .select('id')
      .eq('organization_id', orgId);
    if (entError) throw entError;
    const entityIds = (entities || []).map((e) => e.id);
    if (entityIds.length === 0) return { characters: [], characterImageById: {} };

    const { data: charactersData, error: charactersError } = await this.supabase
      .from('brand_characters')
      .select('id, entity_id, nombre_personaje, descripcion_personaje, tipo_personaje')
      .in('entity_id', entityIds)
      .order('created_at', { ascending: false });
    if (charactersError) throw charactersError;
    const characters = charactersData || [];

    const characterIds = characters.map((c) => c.id);
    const characterImageById = {};
    if (characterIds.length) {
      const { data: imagesData, error: imagesError } = await this.supabase
        .from('character_images')
        .select('character_id, image_url, image_order')
        .in('character_id', characterIds)
        .not('image_url', 'is', null)
        .order('image_order', { ascending: true });
      if (imagesError) throw imagesError;
      (imagesData || []).forEach((img) => {
        const url = (img.image_url || '').trim();
        if (!url) return;
        if (!characterImageById[img.character_id]) characterImageById[img.character_id] = url;
      });
    }

    return { characters, characterImageById };
  }

  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`characters-list:${this.organizationId}`);
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
    if (error) { console.error('CharactersView _ensureEntityId:', error); return null; }
    if (rows?.length) return rows[0].id;
    const { data: created, error: insErr } = await this.supabase
      .from('brand_entities')
      .insert({ organization_id: this.organizationId, name: 'Identity principal', entity_type: 'other', description: null })
      .select('id').single();
    if (insErr) { console.error('CharactersView _ensureEntityId insert:', insErr); return null; }
    return created?.id || null;
  }

  async _onAddCharacter() {
    if (!this.supabase || !this.organizationId) return;
    const btn = document.getElementById('charactersListAddBtn');
    if (btn) btn.disabled = true;
    try {
      const entityId = await this._ensureEntityId();
      if (!entityId) { this._showNotification(__('No se pudo obtener una identidad para vincular el personaje'), 'error'); return; }
      const { error } = await this.supabase.from('brand_characters').insert({
        entity_id: entityId,
        nombre_personaje: 'Nuevo personaje',
        descripcion_personaje: 'Pendiente de descripcion.',
        tipo_personaje: 'otro',
      });
      if (error) throw error;
      this._invalidateCache();
      await this._loadData();
      this._renderCharactersMasonry();
    } catch (e) {
      console.error('CharactersView _onAddCharacter:', e);
      this._showNotification(e?.message || __('Error al crear el personaje'), 'error');
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
            : `<div class="product-list-card-placeholder"><i class="fas fa-user" aria-hidden="true"></i></div>`
          }
          <div class="product-list-card-actions">
            <button type="button" class="glass product-list-card-action" data-action="duplicate" title="${__('Duplicar personaje')}" aria-label="${__('Duplicar personaje')}"><i class="fas fa-copy" aria-hidden="true"></i></button>
            <button type="button" class="glass product-list-card-action product-list-card-action--danger" data-action="delete" title="${__('Eliminar personaje')}" aria-label="${__('Eliminar personaje')}"><i class="fas fa-trash" aria-hidden="true"></i></button>
          </div>
          <div class="history-card-flow-name">${safeName}</div>
        </article>
      </div>
    `;
  }

  async _onDeleteCharacter(characterId, btn) {
    if (!characterId || !this.supabase) return;
    if (!confirm(__('¿Eliminar este personaje? Se borraran tambien sus fotos.'))) return;
    if (btn) btn.disabled = true;
    try {
      const { error } = await this.supabase.from('brand_characters').delete().eq('id', characterId);
      if (error) throw error;
      this._invalidateCache();
      await this._loadData();
      this._renderCharactersMasonry();
      this._showNotification(__('Personaje eliminado'), 'success');
    } catch (e) {
      console.error('CharactersView _onDeleteCharacter:', e);
      this._showNotification(e?.message || __('Error al eliminar el personaje'), 'error');
      if (btn) btn.disabled = false;
    }
  }

  async _onDuplicateCharacter(characterId, btn) {
    if (!characterId || !this.supabase) return;
    if (btn) btn.disabled = true;
    try {
      const { data: character, error: fetchError } = await this.supabase
        .from('brand_characters').select('*').eq('id', characterId).single();
      if (fetchError || !character) throw fetchError || new Error(__('No se pudo cargar el personaje'));
      const { id: _id, created_at: _c, ...rest } = character;
      const copyData = { ...rest, nombre_personaje: (character.nombre_personaje || 'Personaje').trim() + ' (copia)' };
      const { data: newCharacter, error: insertError } = await this.supabase
        .from('brand_characters').insert(copyData).select('id').single();
      if (insertError || !newCharacter?.id) throw insertError || new Error(__('No se pudo crear la copia'));

      const { data: images } = await this.supabase
        .from('character_images')
        .select('image_url, image_type, image_order')
        .eq('character_id', characterId)
        .order('image_order', { ascending: true });
      if (images && images.length) {
        await this.supabase.from('character_images').insert(images.map((img) => ({
          character_id: newCharacter.id,
          image_url: img.image_url,
          image_type: img.image_type,
          image_order: img.image_order,
          download_status: 'stored'
        })));
      }
      this._invalidateCache();
      await this._loadData();
      this._renderCharactersMasonry();
      this._showNotification(__('Personaje duplicado'), 'success');
    } catch (e) {
      console.error('CharactersView _onDuplicateCharacter:', e);
      this._showNotification(e?.message || __('Error al duplicar el personaje'), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ─── Modal: Adjuntar personaje (sube fotos + crea, sin ficha IA aun) ──────

  _onAttachCharacter() {
    if (!window.Modal || typeof window.Modal.show !== 'function') {
      this._showNotification(__('Modal no disponible'), 'error');
      return;
    }
    const body = `
      <div class="attach-product-wizard" data-step="attach">
        <section class="attach-product-step attach-product-step--form" data-panel="attach">
          <p class="attach-product-intro">${__('Sube fotos de referencia del personaje (poses, vestuario, expresiones). Vera analiza la imagen con vision y arma la ficha (rasgos, vestuario, rol). Solo te cobra el costo real de OpenAI.')}</p>
          <div class="attach-product-field-group" data-group="photos">
            <span class="attach-product-field-label">${__('Fotos del personaje')}</span>
            <div class="attach-product-dropzone" tabindex="0" role="button" aria-label="${__('Subir fotos del personaje')}">
              <input type="file" class="attach-product-photos-input" multiple accept="image/jpeg,image/png,image/webp,image/jpg" hidden />
              <i class="fas fa-image" aria-hidden="true"></i>
              <span class="attach-product-dropzone-text">${__('Arrastra fotos o hace click para elegirlas')}</span>
              <span class="attach-product-dropzone-hint">${__('JPG, PNG, WebP · max 10 imagenes · 25MB c/u')}</span>
            </div>
            <ul class="attach-product-file-list" hidden></ul>
          </div>
          <button type="button" class="attach-product-submit" data-action="submit-attach">
            <i class="fas fa-magic" aria-hidden="true"></i>
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

    const photos = this._wireDropzone(root.querySelector('[data-group="photos"]'), 'fa-image');

    root.querySelector('[data-action="submit-attach"]')?.addEventListener('click', async (e) => {
      const submitBtn = e.currentTarget;
      const photoFiles = Array.from(photos.input?.files || []);
      if (!photoFiles.length) { this._showNotification(__('Adjunta al menos una foto'), 'error'); return; }
      const invalid = photoFiles.find((f) => !/^image\//.test(f.type));
      if (invalid) return this._showNotification(__('"{name}" no es una imagen', { name: invalid.name }), 'error');
      if (photoFiles.length > 10) return this._showNotification(__('Maximo 10 imagenes por ficha'), 'error');
      const oversize = photoFiles.find((f) => f.size > 25 * 1024 * 1024);
      if (oversize) return this._showNotification(__('"{name}" supera 25MB', { name: oversize.name }), 'error');
      submitBtn.disabled = true;
      goToStep('loading');
      const hint = root.querySelector('[data-loading-hint]');
      await this._analyzePhotosAndCreateCharacter({ files: photoFiles, modalHandle: handle, hintEl: hint });
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
          <button type="button" class="attach-product-file-remove" data-remove-idx="${idx}" aria-label="${__('Quitar')}"><i class="fas fa-times" aria-hidden="true"></i></button>
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

  async _analyzePhotosAndCreateCharacter({ files, modalHandle, hintEl }) {
    if (!this.supabase || !this.organizationId || !this.userId) {
      this._showNotification(__('Sesion no disponible'), 'error');
      modalHandle?.close();
      return;
    }
    const setHint = (msg) => { if (hintEl) hintEl.textContent = msg; };
    let characterId = null;
    try {
      setHint(__('Creando personaje inicial...'));
      const entityId = await this._ensureEntityId();
      if (!entityId) throw new Error(__('No se pudo obtener una identidad para vincular el personaje'));
      const { data: created, error: insertError } = await this.supabase
        .from('brand_characters')
        .insert({
          entity_id: entityId,
          nombre_personaje: 'Procesando ficha...',
          descripcion_personaje: 'Vera esta analizando las fotos del personaje.',
          tipo_personaje: 'otro',
        })
        .select('id').single();
      if (insertError || !created?.id) throw insertError || new Error(__('No se pudo crear el personaje'));
      characterId = created.id;

      // Subir imagenes a bucket character-images
      setHint(__('Subiendo {n} {fotos} a storage...', { n: files.length, fotos: files.length === 1 ? __('foto') : __('fotos') }));
      const imageUrls = [];
      for (const file of files) {
        const ext = (file.name?.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        const fileName = `${this.userId}/${characterId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: uploadError } = await this.supabase.storage
          .from('character-images')
          .upload(fileName, file, { contentType: file.type, cacheControl: '3600', upsert: false });
        if (uploadError) throw new Error(`Error subiendo "${file.name}": ${uploadError.message}`);
        const { data: { publicUrl } } = this.supabase.storage.from('character-images').getPublicUrl(fileName);
        imageUrls.push(publicUrl);
      }

      setHint(__('Vera esta analizando las fotos con OpenAI Vision...'));
      await this._callFicheCharacterFunction({
        characterId,
        payload: { character_id: characterId, organization_id: this.organizationId, image_urls: imageUrls },
        modalHandle, setHint
      });
      characterId = null;
    } catch (err) {
      console.error('CharactersView _analyzePhotosAndCreateCharacter:', err);
      if (characterId) {
        try { await this.supabase.from('brand_characters').delete().eq('id', characterId); }
        catch (delErr) { console.warn('No se pudo limpiar placeholder:', delErr); }
        this._invalidateCache();
      }
      this._showNotification(err?.message || __('No se pudo crear el personaje'), 'error');
      modalHandle?.close();
    }
  }

  async _callFicheCharacterFunction({ characterId, payload, modalHandle, setHint }) {
    const { data: sessionData } = await this.supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error(__('No hay sesion activa'));

    const resp = await fetch('/.netlify/functions/api-characters-generate-fiche', {
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
        this._showNotification(__('Creditos insuficientes. Necesitas {n} creditos', { n: result.credits_needed?.toFixed?.(4) || '?' }), 'error');
      } else {
        this._showNotification(__('Error generando ficha: {msg}', { msg: `${errMsg}${detail}` }), 'error');
      }
      throw new Error(errMsg);
    }

    setHint(__('Ficha generada (costo: {n} creditos). Recargando listado...', { n: result.credits_charged.toFixed(4) }));
    this._invalidateCache();
    window.apiClient?.invalidate(`nav:credits:${this.organizationId}`);
    modalHandle?.close();
    const imgCount = result.images?.inserted || 0;
    if (result.images?.error) {
      this._showNotification(__('Ficha generada · imagenes no se vincularon: {err}', { err: result.images.error }), 'error');
    } else {
      this._showNotification(
        __('Ficha de personaje generada · {n} creditos · {count} {fotos}', {
          n: result.credits_charged.toFixed(4),
          count: imgCount,
          fotos: imgCount === 1 ? __('foto') : __('fotos'),
        }),
        'success'
      );
    }
    await this._loadData();
    this._renderCharactersMasonry();
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
