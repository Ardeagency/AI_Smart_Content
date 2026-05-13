/**
 * ReferencesView — Biblioteca visual del workspace.
 *
 * Carpetas custom (tabla reference_folders) + imágenes (visual_references)
 * org-scope. Lectura + creación de carpetas + upload de imágenes al bucket
 * visual-references (path: {organization_id}/{uuid}.{ext}).
 *
 * URL: /org/{shortId}/{slug}/references[?f={folderId}]  o  /references[?f=...]
 */
class ReferencesView extends BaseView {
  static cacheable = false;
  static documentTitle = 'References';

  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.currentFolderId = null;          // null = root
    this.folders = [];                    // todas las carpetas de la org
    this.references = [];                 // refs en la carpeta actual
    this._uploadInputEl = null;
  }

  renderHTML() {
    return `
<div class="references-page" id="referencesPage">
  <div class="references-header">
    <div class="references-header-left">
      <nav class="references-breadcrumb" id="referencesBreadcrumb" aria-label="Ruta de carpetas"></nav>
      <h1 class="references-title" id="referencesTitle">References</h1>
    </div>
    <div class="references-header-actions">
      <button type="button" class="references-add-btn" id="referencesAddFolderBtn" aria-label="Crear carpeta">
        <i class="fas fa-folder-plus"></i><span>Carpeta</span>
      </button>
      <button type="button" class="references-add-btn references-add-btn--primary" id="referencesAddRefBtn" aria-label="Subir referencia">
        <i class="fas fa-upload"></i><span>Referencia</span>
      </button>
    </div>
  </div>

  <section class="references-section" id="referencesFoldersSection">
    <div class="references-section-head">
      <h2 class="references-section-title">Carpetas</h2>
      <span class="references-section-count" id="referencesFoldersCount">0</span>
    </div>
    <div class="references-folders-grid" id="referencesFoldersGrid"></div>
  </section>

  <section class="references-section" id="referencesRefsSection">
    <div class="references-section-head">
      <h2 class="references-section-title">Referencias</h2>
      <span class="references-section-count" id="referencesRefsCount">0</span>
    </div>
    <div class="references-refs-masonry" id="referencesRefsMasonry"></div>
  </section>

  <div class="references-empty" id="referencesEmpty" hidden>
    <i class="fas fa-images"></i>
    <p>Esta carpeta está vacía. Crea sub-carpetas o sube tu primera referencia.</p>
  </div>

  <input type="file" accept="image/png,image/jpeg,image/jpg" multiple class="references-upload-input" id="referencesUploadInput" hidden>
</div>`;
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.organizationId =
      this.routeParams?.orgId ||
      window.currentOrgId ||
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      null;
  }

  async init() {
    await this._initSupabase();
    this._readFolderFromUrl();
    await this._loadFolders();
    await this._loadRefs();
    this._renderAll();
    this._setupEventListeners();
  }

  async _initSupabase() {
    if (window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
    } else {
      this.supabase = window.supabase || null;
    }
    if (this.supabase) {
      try {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      } catch (_) { /* noop */ }
    }
  }

  _readFolderFromUrl() {
    const sp = new URLSearchParams(window.location.search || '');
    const f = sp.get('f');
    this.currentFolderId = (f && /^[0-9a-f-]{32,36}$/i.test(f)) ? f : null;
  }

  _setFolderInUrl(folderId) {
    const url = new URL(window.location.href);
    if (folderId) url.searchParams.set('f', folderId);
    else url.searchParams.delete('f');
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
  }

  async _loadFolders() {
    if (!this.supabase || !this.organizationId) { this.folders = []; return; }
    const { data, error } = await this.supabase
      .from('reference_folders')
      .select('id, parent_id, name, sort_order, created_at')
      .eq('organization_id', this.organizationId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      console.error('ReferencesView _loadFolders:', error);
      this.folders = [];
      return;
    }
    this.folders = data || [];
  }

  async _loadRefs() {
    if (!this.supabase || !this.organizationId) { this.references = []; return; }
    let q = this.supabase
      .from('visual_references')
      .select('id, image_url, thumbnail_url, object_path, folder_id, created_at')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });
    if (this.currentFolderId) q = q.eq('folder_id', this.currentFolderId);
    else q = q.is('folder_id', null);
    const { data, error } = await q;
    if (error) {
      console.error('ReferencesView _loadRefs:', error);
      this.references = [];
      return;
    }
    this.references = data || [];
  }

  _childFolders(parentId) {
    return this.folders.filter((f) => (f.parent_id || null) === (parentId || null));
  }

  _folderById(id) {
    return this.folders.find((f) => f.id === id) || null;
  }

  _folderPath(folderId) {
    const path = [];
    let cur = this._folderById(folderId);
    let safety = 64;
    while (cur && safety-- > 0) {
      path.unshift(cur);
      cur = cur.parent_id ? this._folderById(cur.parent_id) : null;
    }
    return path;
  }

  _renderAll() {
    this._renderBreadcrumb();
    this._renderFolders();
    this._renderRefs();
    this._renderEmptyState();
  }

  _renderBreadcrumb() {
    const el = document.getElementById('referencesBreadcrumb');
    if (!el) return;
    const path = this._folderPath(this.currentFolderId);
    const rootCrumb = `<a href="#" class="references-crumb" data-folder-id="">Inicio</a>`;
    const crumbs = path.map((f, i) => {
      const isLast = i === path.length - 1;
      return isLast
        ? `<span class="references-crumb references-crumb--current">${this.escapeHtml(f.name)}</span>`
        : `<a href="#" class="references-crumb" data-folder-id="${this.escapeHtml(f.id)}">${this.escapeHtml(f.name)}</a>`;
    }).join('<span class="references-crumb-sep">/</span>');
    el.innerHTML = path.length
      ? `${rootCrumb}<span class="references-crumb-sep">/</span>${crumbs}`
      : rootCrumb;

    const title = document.getElementById('referencesTitle');
    if (title) {
      const last = path[path.length - 1];
      title.textContent = last ? last.name : 'References';
    }
  }

  _renderFolders() {
    const grid = document.getElementById('referencesFoldersGrid');
    const count = document.getElementById('referencesFoldersCount');
    const section = document.getElementById('referencesFoldersSection');
    if (!grid) return;
    const children = this._childFolders(this.currentFolderId);
    if (count) count.textContent = String(children.length);
    if (!children.length) {
      grid.innerHTML = '';
      if (section) section.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';
    grid.innerHTML = children.map((f) => `
      <button type="button" class="references-folder-card" data-folder-id="${this.escapeHtml(f.id)}">
        <div class="references-folder-icon"><i class="fas fa-folder"></i></div>
        <div class="references-folder-meta">
          <span class="references-folder-name">${this.escapeHtml(f.name)}</span>
        </div>
        <span class="references-folder-actions">
          <button type="button" class="references-folder-action" data-action="rename" data-folder-id="${this.escapeHtml(f.id)}" aria-label="Renombrar carpeta">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="references-folder-action" data-action="delete" data-folder-id="${this.escapeHtml(f.id)}" aria-label="Eliminar carpeta">
            <i class="fas fa-trash"></i>
          </button>
        </span>
      </button>
    `).join('');
  }

  _renderRefs() {
    const grid = document.getElementById('referencesRefsMasonry');
    const count = document.getElementById('referencesRefsCount');
    const section = document.getElementById('referencesRefsSection');
    if (!grid) return;
    const refs = this.references;
    if (count) count.textContent = String(refs.length);
    if (!refs.length) {
      grid.innerHTML = '';
      if (section) section.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';
    grid.innerHTML = refs.map((r) => {
      const src = r.thumbnail_url || r.image_url || '';
      return `
        <figure class="references-ref-card" data-ref-id="${this.escapeHtml(r.id)}">
          <img src="${this.escapeHtml(src)}" alt="" loading="lazy" decoding="async" class="references-ref-img">
          <button type="button" class="references-ref-delete" data-ref-id="${this.escapeHtml(r.id)}" aria-label="Eliminar referencia">
            <i class="fas fa-trash"></i>
          </button>
        </figure>
      `;
    }).join('');
  }

  _renderEmptyState() {
    const empty = document.getElementById('referencesEmpty');
    if (!empty) return;
    const noFolders = this._childFolders(this.currentFolderId).length === 0;
    const noRefs = this.references.length === 0;
    empty.hidden = !(noFolders && noRefs);
  }

  _setupEventListeners() {
    const root = this.container;
    if (!root) return;

    root.addEventListener('click', async (e) => {
      // Breadcrumb
      const crumb = e.target.closest('.references-crumb[data-folder-id]');
      if (crumb) {
        e.preventDefault();
        const fid = crumb.getAttribute('data-folder-id') || null;
        await this._navigateToFolder(fid || null);
        return;
      }
      // Folder card → entrar
      const folderActionBtn = e.target.closest('.references-folder-action');
      if (folderActionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const action = folderActionBtn.getAttribute('data-action');
        const fid = folderActionBtn.getAttribute('data-folder-id');
        if (action === 'rename') await this._renameFolder(fid);
        else if (action === 'delete') await this._deleteFolder(fid);
        return;
      }
      const folderCard = e.target.closest('.references-folder-card');
      if (folderCard) {
        const fid = folderCard.getAttribute('data-folder-id');
        if (fid) { await this._navigateToFolder(fid); return; }
      }
      // Ref delete
      const refDel = e.target.closest('.references-ref-delete');
      if (refDel) {
        e.stopPropagation();
        await this._deleteRef(refDel.getAttribute('data-ref-id'));
        return;
      }
    });

    document.getElementById('referencesAddFolderBtn')?.addEventListener('click', () => this._createFolder());
    document.getElementById('referencesAddRefBtn')?.addEventListener('click', () => this._triggerUpload());
    document.getElementById('referencesUploadInput')?.addEventListener('change', (e) => this._handleUpload(e));
  }

  async _navigateToFolder(folderId) {
    this.currentFolderId = folderId || null;
    this._setFolderInUrl(this.currentFolderId);
    await this._loadRefs();
    this._renderAll();
  }

  async _createFolder() {
    if (!this.supabase || !this.organizationId) return;
    const raw = prompt('Nombre de la nueva carpeta:');
    if (raw == null) return;
    const name = String(raw).trim();
    if (!name) return;
    const { error } = await this.supabase.from('reference_folders').insert({
      organization_id: this.organizationId,
      parent_id: this.currentFolderId,
      name,
      created_by: this.userId || null,
    });
    if (error) {
      alert(error.message?.includes('duplicate') ? 'Ya existe una carpeta con ese nombre aquí.' : (error.message || 'Error al crear la carpeta'));
      return;
    }
    await this._loadFolders();
    this._renderAll();
  }

  async _renameFolder(folderId) {
    const folder = this._folderById(folderId);
    if (!folder) return;
    const raw = prompt('Nuevo nombre de la carpeta:', folder.name);
    if (raw == null) return;
    const name = String(raw).trim();
    if (!name || name === folder.name) return;
    const { error } = await this.supabase
      .from('reference_folders')
      .update({ name })
      .eq('id', folderId);
    if (error) {
      alert(error.message?.includes('duplicate') ? 'Ya existe una carpeta con ese nombre aquí.' : (error.message || 'Error al renombrar.'));
      return;
    }
    await this._loadFolders();
    this._renderAll();
  }

  async _deleteFolder(folderId) {
    const folder = this._folderById(folderId);
    if (!folder) return;
    const hasChildren = this._childFolders(folderId).length > 0;
    const msg = hasChildren
      ? `La carpeta "${folder.name}" contiene sub-carpetas. Se eliminarán todas; las referencias quedarán sin carpeta (en Inicio). ¿Continuar?`
      : `¿Eliminar la carpeta "${folder.name}"? Las referencias dentro quedarán sin carpeta (en Inicio).`;
    if (!confirm(msg)) return;
    const { error } = await this.supabase.from('reference_folders').delete().eq('id', folderId);
    if (error) {
      alert(error.message || 'Error al eliminar la carpeta.');
      return;
    }
    // Si estaba dentro o abajo de la carpeta borrada, subir al root.
    const path = this._folderPath(this.currentFolderId).map((f) => f.id);
    if (path.includes(folderId)) {
      this.currentFolderId = null;
      this._setFolderInUrl(null);
    }
    await this._loadFolders();
    await this._loadRefs();
    this._renderAll();
  }

  _triggerUpload() {
    document.getElementById('referencesUploadInput')?.click();
  }

  async _handleUpload(e) {
    const input = e.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    if (!this.supabase || !this.organizationId) {
      alert('No hay sesión activa.');
      input.value = '';
      return;
    }
    const btn = document.getElementById('referencesAddRefBtn');
    if (btn) btn.disabled = true;
    try {
      for (const file of files) {
        await this._uploadOne(file);
      }
      await this._loadRefs();
      this._renderAll();
    } finally {
      input.value = '';
      if (btn) btn.disabled = false;
    }
  }

  async _uploadOne(file) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const uuid = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const objectPath = `${this.organizationId}/${uuid}.${ext}`;

    const { error: upErr } = await this.supabase.storage
      .from('visual-references')
      .upload(objectPath, file, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error('upload:', upErr);
      alert(`Error al subir ${file.name}: ${upErr.message || upErr}`);
      return;
    }
    const { data: pub } = this.supabase.storage.from('visual-references').getPublicUrl(objectPath);
    const imageUrl = pub?.publicUrl || '';

    const { error: insErr } = await this.supabase.from('visual_references').insert({
      organization_id: this.organizationId,
      folder_id: this.currentFolderId,
      image_url: imageUrl,
      thumbnail_url: imageUrl,
      object_path: objectPath,
      bucket: 'visual-references',
      prompt_details: {},
      usable_for_generation: true,
      priority: 1,
    });
    if (insErr) {
      console.error('insert visual_references:', insErr);
      // limpieza best-effort si la fila falla
      await this.supabase.storage.from('visual-references').remove([objectPath]).catch(() => {});
      alert(`Error al registrar ${file.name}: ${insErr.message || insErr}`);
    }
  }

  async _deleteRef(refId) {
    const ref = this.references.find((r) => r.id === refId);
    if (!ref) return;
    if (!confirm('¿Eliminar esta referencia? La imagen también se borra del bucket.')) return;
    if (ref.object_path) {
      await this.supabase.storage.from('visual-references').remove([ref.object_path]).catch((err) => {
        console.warn('No se pudo borrar del bucket:', err);
      });
    }
    const { error } = await this.supabase.from('visual_references').delete().eq('id', refId);
    if (error) {
      alert(error.message || 'Error al eliminar la referencia.');
      return;
    }
    await this._loadRefs();
    this._renderAll();
  }
}

window.ReferencesView = ReferencesView;
