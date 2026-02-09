/**
 * DevLeadVectorsView - Base de conocimientos IA (solo Lead)
 * Gestiona archivos del bucket ai-knowledge (subir, listar, editar, eliminar)
 * y muestra los vectores en ai_global_vectors (vectorización del bucket).
 */
class DevLeadVectorsView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.bucketName = 'ai-knowledge';
    this.storageFiles = []; // { name, path, size, updatedAt }
    this.vectorsByPath = []; // { source_path, source_type, chunks, created_at }
    this.currentPrefix = ''; // carpeta actual para navegación
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
      if (!window.authService.isLead()) {
        if (window.router) window.router.navigate('/dev/dashboard', true);
        return;
      }
    }
    if (window.navigation && (!window.navigation.initialized || window.navigation.currentMode !== 'developer')) {
      window.navigation.currentMode = 'developer';
      window.navigation.initialized = false;
      await window.navigation.render();
    }
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    this.supabase = await this.getSupabaseClient();
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-vectors">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-brain"></i> Base de conocimientos IA</h1>
            <p class="dev-header-subtitle">Archivos del bucket ai-knowledge y vectores en ai_global_vectors</p>
          </div>
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-secondary" id="refreshVectorsBtn">
              <i class="fas fa-sync-alt"></i> Actualizar
            </button>
          </div>
        </header>

        <div class="dev-lead-tabs">
          <button type="button" class="dev-lead-tab active" data-tab="files">Archivos en el bucket</button>
          <button type="button" class="dev-lead-tab" data-tab="vectors">Vectores (ai_global_vectors)</button>
        </div>

        <section class="dev-lead-content">
          <!-- Pestaña Archivos -->
          <div class="dev-lead-panel" id="panelFiles">
            <div class="dev-lead-toolbar dev-lead-toolbar-inline">
              <div class="dev-lead-breadcrumb" id="filesBreadcrumb"></div>
              <button type="button" class="btn btn-primary" id="uploadFileBtn">
                <i class="fas fa-upload"></i> Subir archivo
              </button>
            </div>
            <div class="dev-lead-table-wrap">
              <table class="dev-lead-table" id="filesTable">
                <thead>
                  <tr>
                    <th>Nombre / Ruta</th>
                    <th>Tamaño</th>
                    <th>Actualizado</th>
                    <th class="dev-lead-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody id="filesBody"></tbody>
              </table>
              <div class="dev-lead-empty" id="filesEmpty" style="display: none;">
                <i class="fas fa-folder-open"></i>
                <p>No hay archivos en esta carpeta.</p>
                <p class="dev-lead-empty-hint">Sube archivos para alimentar la base de conocimientos IA.</p>
              </div>
            </div>
          </div>

          <!-- Pestaña Vectores -->
          <div class="dev-lead-panel" id="panelVectors" style="display: none;">
            <div class="dev-lead-table-wrap">
              <table class="dev-lead-table" id="vectorsTable">
                <thead>
                  <tr>
                    <th>Archivo / Ruta</th>
                    <th>Tipo</th>
                    <th>Chunks</th>
                    <th>Última actualización</th>
                    <th class="dev-lead-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody id="vectorsBody"></tbody>
              </table>
              <div class="dev-lead-empty" id="vectorsEmpty" style="display: none;">
                <i class="fas fa-database"></i>
                <p>No hay vectores para el bucket ai-knowledge.</p>
                <p class="dev-lead-empty-hint">Vectoriza archivos desde la pestaña "Archivos en el bucket".</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Modal subir / reemplazar archivo -->
        <div class="modal dev-lead-modal" id="uploadModal" style="display: none;">
          <div class="modal-overlay"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h3 id="uploadModalTitle">Subir archivo</h3>
              <button type="button" class="modal-close" id="uploadModalClose">&times;</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>Ruta / carpeta (opcional)</label>
                <input type="text" id="uploadPath" class="form-control" placeholder="ej: docs/ o manuales/">
              </div>
              <div class="form-group">
                <label>Archivo</label>
                <input type="file" id="uploadInput" class="form-control">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="uploadModalCancel">Cancelar</button>
              <button type="button" class="btn btn-primary" id="uploadModalConfirm">
                <i class="fas fa-upload"></i> Subir
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) return;

    this.bindTabs();
    await this.loadFiles();
    await this.loadVectors();

    const refreshBtn = document.getElementById('refreshVectorsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { this.loadFiles(); this.loadVectors(); });

    document.getElementById('uploadFileBtn')?.addEventListener('click', () => this.openUploadModal());
    document.getElementById('uploadModalClose')?.addEventListener('click', () => this.closeUploadModal());
    document.getElementById('uploadModalCancel')?.addEventListener('click', () => this.closeUploadModal());
    document.getElementById('uploadModalConfirm')?.addEventListener('click', () => this.doUpload());
    document.querySelector('#uploadModal .modal-overlay')?.addEventListener('click', () => this.closeUploadModal());
  }

  bindTabs() {
    const tabs = this.container.querySelectorAll('.dev-lead-tab');
    const panelFiles = document.getElementById('panelFiles');
    const panelVectors = document.getElementById('panelVectors');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        if (tabId === 'files') {
          panelFiles.style.display = 'block';
          panelVectors.style.display = 'none';
        } else {
          panelFiles.style.display = 'none';
          panelVectors.style.display = 'block';
        }
      });
    });
  }

  // ----- Archivos en el bucket -----

  async listStorage(prefix = '') {
    const opts = { limit: 500, sortBy: { column: 'name', order: 'asc' } };
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list(prefix || '', opts);

    if (error) throw error;
    const items = Array.isArray(data) ? data : [];
    const files = [];
    const folderNames = new Set();

    for (const item of items) {
      const name = (item && item.name != null) ? String(item.name) : '';
      const fullPath = prefix ? prefix + name : name;
      if (name.includes('/')) {
        const firstSegment = name.split('/')[0];
        if (firstSegment) folderNames.add(firstSegment);
      } else {
        files.push({
          name: name,
          path: fullPath,
          size: (item.metadata && item.metadata.size != null) ? Number(item.metadata.size) : 0,
          updatedAt: item && item.updated_at ? item.updated_at : null
        });
      }
    }

    const folders = Array.from(folderNames).sort().map(name => ({
      name: name,
      path: prefix ? prefix + name + '/' : name + '/'
    }));

    return { folders, files };
  }

  async loadFiles() {
    const tbody = document.getElementById('filesBody');
    const empty = document.getElementById('filesEmpty');
    const breadcrumb = document.getElementById('filesBreadcrumb');
    if (!tbody) return;

    try {
      const { folders, files } = await this.listStorage(this.currentPrefix);
      this.storageFiles = files;

      this.renderBreadcrumb(breadcrumb);
      this.renderFilesTable(tbody, folders, files);

      if (empty) {
        if (folders.length === 0 && files.length === 0) {
          empty.style.display = 'block';
          const p = empty.querySelector('p');
          if (p) p.textContent = this.currentPrefix ? 'No hay archivos en esta carpeta.' : 'No hay archivos en el bucket.';
        } else {
          empty.style.display = 'none';
        }
      }
    } catch (err) {
      console.error('Error listando bucket ai-knowledge:', err);
      tbody.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        const p = empty.querySelector('p');
        if (p) p.textContent = 'Error: ' + (err && err.message ? err.message : '');
      }
    }
  }

  renderBreadcrumb(container) {
    if (!container) return;
    container.innerHTML = '';
    const parts = this.currentPrefix ? this.currentPrefix.replace(/\/$/, '').split('/').filter(Boolean) : [];
    const span = (text, prefix) => {
      const s = document.createElement('span');
      s.className = 'dev-lead-breadcrumb-item';
      s.setAttribute('data-prefix', prefix);
      s.textContent = text;
      s.addEventListener('click', () => {
        this.currentPrefix = s.getAttribute('data-prefix') || '';
        this.loadFiles();
      });
      return s;
    };
    container.appendChild(span('bucket', ''));
    let acc = '';
    parts.forEach(p => {
      const sep = document.createElement('span');
      sep.className = 'dev-lead-breadcrumb-sep';
      sep.textContent = ' / ';
      container.appendChild(sep);
      acc += (acc ? '/' : '') + p;
      container.appendChild(span(p, acc + '/'));
    });
  }

  renderFilesTable(tbody, folders, files) {
    tbody.innerHTML = '';
    const pathStr = (v) => (v != null && typeof v === 'string') ? v : '';

    folders.forEach(f => {
      const tr = document.createElement('tr');
      tr.className = 'dev-lead-file-row folder';
      tr.setAttribute('data-path', pathStr(f.path));
      const name = pathStr(f.name);
      tr.innerHTML = '<td><i class="fas fa-folder"></i> <span class="dev-lead-path"></span></td><td>—</td><td>—</td><td class="dev-lead-actions"></td>';
      tr.querySelector('.dev-lead-path').textContent = name;
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.dev-lead-actions')) return;
        this.currentPrefix = tr.getAttribute('data-path') || '';
        this.loadFiles();
      });
      tbody.appendChild(tr);
    });

    files.forEach(f => {
      const tr = document.createElement('tr');
      tr.className = 'dev-lead-file-row file';
      tr.setAttribute('data-path', pathStr(f.path));
      const sizeStr = f.size ? this.formatBytes(Number(f.size)) : '—';
      const dateStr = f.updatedAt ? new Date(f.updatedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      tr.innerHTML = '<td><i class="fas fa-file"></i> <code class="dev-lead-path"></code></td><td></td><td></td><td class="dev-lead-actions"></td>';
      tr.querySelectorAll('td')[0].querySelector('.dev-lead-path').textContent = pathStr(f.path);
      tr.querySelectorAll('td')[1].textContent = sizeStr;
      tr.querySelectorAll('td')[2].textContent = dateStr;

      const actions = tr.querySelector('.dev-lead-actions');
      const path = pathStr(f.path);

      const addAction = (cls, title, iconClass, handler) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-icon ' + cls;
        btn.title = title;
        btn.setAttribute('data-path', path);
        const icon = document.createElement('i');
        icon.className = 'fas ' + iconClass;
        btn.appendChild(icon);
        btn.addEventListener('click', (e) => { e.stopPropagation(); handler(path); });
        actions.appendChild(btn);
      };
      addAction('replace-file', 'Reemplazar', 'fa-edit', (p) => this.openUploadModal(p));
      addAction('vectorize-file', 'Vectorizar', 'fa-brain', (p) => this.vectorizeFile(p));
      addAction('delete-file', 'Eliminar', 'fa-trash', (p) => this.deleteFile(p));

      tbody.appendChild(tr);
    });
  }

  formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  openUploadModal(replacePath = null) {
    this._replacePath = replacePath || null;
    const modal = document.getElementById('uploadModal');
    const title = document.getElementById('uploadModalTitle');
    const pathInput = document.getElementById('uploadPath');
    const fileInput = document.getElementById('uploadInput');
    if (replacePath) {
      title.textContent = 'Reemplazar archivo';
      const dir = replacePath.includes('/') ? replacePath.replace(/\/[^/]+$/, '') : '';
      pathInput.value = dir ? dir + '/' : '';
      pathInput.readOnly = true;
    } else {
      title.textContent = 'Subir archivo';
      pathInput.value = this.currentPrefix || '';
      pathInput.readOnly = false;
    }
    fileInput.value = '';
    modal.style.display = 'flex';
  }

  closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    this._replacePath = null;
  }

  async doUpload() {
    const pathInput = document.getElementById('uploadPath');
    const fileInput = document.getElementById('uploadInput');
    const file = fileInput?.files?.[0];
    if (!file) {
      this.showNotification('Selecciona un archivo.', 'warning');
      return;
    }

    let filePath;
    if (this._replacePath) {
      filePath = this._replacePath;
    } else {
      let path = (pathInput?.value || '').trim().replace(/^\/+|\/+$/g, '');
      if (path && !path.endsWith('/')) path += '/';
      filePath = path + file.name;
    }

    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (error) throw error;
      this.showNotification('Archivo subido correctamente.', 'success');
      this.closeUploadModal();
      await this.loadFiles();
    } catch (err) {
      this.showNotification('Error al subir: ' + (err.message || ''), 'error');
    }
  }

  async deleteFile(path) {
    if (!confirm('¿Eliminar este archivo del bucket? Los vectores asociados no se borran automáticamente.')) return;
    try {
      const { error } = await this.supabase.storage.from(this.bucketName).remove([path]);
      if (error) throw error;
      this.showNotification('Archivo eliminado.', 'success');
      await this.loadFiles();
    } catch (err) {
      this.showNotification('Error al eliminar: ' + (err.message || ''), 'error');
    }
  }

  async vectorizeFile(path) {
    try {
      const { data, error } = await this.supabase.rpc('vectorize_ai_knowledge_file', { file_path: path });
      if (error) {
        if (error.code === '42883' || error.message?.includes('function')) {
          this.showNotification('Función vectorize_ai_knowledge_file no existe. Configura una Edge Function o RPC que procese el archivo y llene ai_global_vectors.', 'warning');
        } else {
          this.showNotification('Error al vectorizar: ' + (error.message || ''), 'error');
        }
        return;
      }
      this.showNotification('Vectorización solicitada. Revisa la pestaña Vectores en unos instantes.', 'success');
      await this.loadVectors();
    } catch (err) {
      this.showNotification('Error: ' + (err.message || ''), 'error');
    }
  }

  // ----- Vectores (ai_global_vectors) -----

  async loadVectors() {
    const { data, error } = await this.supabase
      .from('ai_global_vectors')
      .select('id, source_path, source_type, chunk_index, created_at')
      .eq('source_bucket', this.bucketName)
      .order('source_path', { ascending: true })
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('Error cargando ai_global_vectors:', error);
      this.renderVectorsTable([]);
      return;
    }

    const vectors = data || [];
    const byPath = new Map();
    for (const row of vectors) {
      const key = row.source_path || '';
      if (!byPath.has(key)) {
        byPath.set(key, {
          source_path: row.source_path,
          source_type: row.source_type || '-',
          chunks: 0,
          created_at: row.created_at
        });
      }
      const entry = byPath.get(key);
      entry.chunks += 1;
      if (row.created_at && (!entry.created_at || row.created_at > entry.created_at)) {
        entry.created_at = row.created_at;
      }
    }
    this.vectorsByPath = Array.from(byPath.values()).sort((a, b) =>
      (a.source_path || '').localeCompare(b.source_path || '')
    );
    this.renderVectorsTable(this.vectorsByPath);
  }

  renderVectorsTable(filesByPath) {
    const tbody = document.getElementById('vectorsBody');
    const empty = document.getElementById('vectorsEmpty');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!filesByPath || filesByPath.length === 0) {
      if (empty) {
        empty.style.display = 'block';
        const p = empty.querySelector('p');
        if (p) p.textContent = 'No hay vectores para el bucket ai-knowledge.';
      }
      return;
    }

    if (empty) empty.style.display = 'none';

    const pathStr = (v) => (v != null && typeof v === 'string') ? v : '';
    filesByPath.forEach(f => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-path', pathStr(f.source_path));
      const dateStr = f.created_at
        ? new Date(f.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
        : '-';
      const path = pathStr(f.source_path);
      const type = pathStr(f.source_type) || '-';
      const chunks = Number(f.chunks) || 0;

      const tdPath = document.createElement('td');
      const code = document.createElement('code');
      code.className = 'dev-lead-path';
      code.textContent = path;
      tdPath.appendChild(code);
      tr.appendChild(tdPath);

      const tdType = document.createElement('td');
      tdType.textContent = type;
      tr.appendChild(tdType);

      const tdChunks = document.createElement('td');
      tdChunks.textContent = String(chunks);
      tr.appendChild(tdChunks);

      const tdDate = document.createElement('td');
      tdDate.textContent = dateStr;
      tr.appendChild(tdDate);

      const tdActions = document.createElement('td');
      tdActions.className = 'dev-lead-actions';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-icon delete-vectors';
      btn.title = 'Eliminar vectores de este archivo';
      btn.setAttribute('data-path', path);
      const icon = document.createElement('i');
      icon.className = 'fas fa-trash';
      btn.appendChild(icon);
      btn.addEventListener('click', () => this.deleteVectorsByPath(path));
      tdActions.appendChild(btn);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }

  async deleteVectorsByPath(sourcePath) {
    if (!confirm('¿Eliminar todos los vectores de este archivo? Esto no borra el archivo del bucket.')) return;
    try {
      const { error } = await this.supabase
        .from('ai_global_vectors')
        .delete()
        .eq('source_bucket', this.bucketName)
        .eq('source_path', sourcePath);

      if (error) throw error;
      this.showNotification('Vectores eliminados.', 'success');
      await this.loadVectors();
    } catch (err) {
      this.showNotification('Error al eliminar vectores: ' + (err.message || ''), 'error');
    }
  }

  showNotification(message, type = 'info') {
    if (typeof super.showNotification === 'function') {
      super.showNotification(message, type);
      return;
    }
    const el = document.createElement('div');
    el.className = `dev-lead-notification dev-lead-notification-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
window.DevLeadVectorsView = DevLeadVectorsView;
