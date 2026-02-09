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
    const items = data || [];
    const files = [];
    const folderNames = new Set();

    for (const item of items) {
      const name = item.name || '';
      const fullPath = prefix ? prefix + name : name;
      if (name.includes('/')) {
        const firstSegment = name.split('/')[0];
        folderNames.add(firstSegment);
      } else {
        files.push({
          name: name,
          path: fullPath,
          size: item.metadata?.size ?? 0,
          updatedAt: item.updated_at || null
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

      if (breadcrumb) {
        const parts = this.currentPrefix ? this.currentPrefix.replace(/\/$/, '').split('/') : [];
        let html = '<span class="dev-lead-breadcrumb-item" data-prefix="">bucket</span>';
        let acc = '';
        parts.forEach(p => {
          acc += (acc ? '/' : '') + p;
          html += ` <span class="dev-lead-breadcrumb-sep">/</span> <span class="dev-lead-breadcrumb-item" data-prefix="${acc}/">${this.escapeHtml(p)}</span>`;
        });
        breadcrumb.innerHTML = html;
        breadcrumb.querySelectorAll('.dev-lead-breadcrumb-item').forEach(el => {
          el.addEventListener('click', () => {
            this.currentPrefix = el.getAttribute('data-prefix') || '';
            this.loadFiles();
          });
        });
      }

      const rows = [];

      folders.forEach(f => {
        rows.push(`
          <tr class="dev-lead-file-row folder" data-path="${this.escapeHtml(f.path)}">
            <td><i class="fas fa-folder"></i> <span class="dev-lead-path">${this.escapeHtml(f.name)}</span></td>
            <td>—</td>
            <td>—</td>
            <td class="dev-lead-actions"></td>
          </tr>`);
      });

      files.forEach(f => {
        const sizeStr = f.size ? this.formatBytes(f.size) : '—';
        const dateStr = f.updatedAt ? new Date(f.updatedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—';
        rows.push(`
          <tr class="dev-lead-file-row file" data-path="${this.escapeHtml(f.path)}">
            <td><i class="fas fa-file"></i> <code class="dev-lead-path">${this.escapeHtml(f.path)}</code></td>
            <td>${sizeStr}</td>
            <td>${dateStr}</td>
            <td class="dev-lead-actions">
              <button type="button" class="btn-icon replace-file" title="Reemplazar" data-path="${this.escapeHtml(f.path)}"><i class="fas fa-edit"></i></button>
              <button type="button" class="btn-icon vectorize-file" title="Vectorizar" data-path="${this.escapeHtml(f.path)}"><i class="fas fa-brain"></i></button>
              <button type="button" class="btn-icon delete-file" title="Eliminar" data-path="${this.escapeHtml(f.path)}"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`);
      });

      tbody.innerHTML = rows.join('');

      if (empty) {
        if (folders.length === 0 && files.length === 0) {
          empty.style.display = 'block';
          empty.querySelector('p').textContent = this.currentPrefix ? 'No hay archivos en esta carpeta.' : 'No hay archivos en el bucket.';
        } else {
          empty.style.display = 'none';
        }
      }

      // Clicks: carpeta = navegar; acciones = handlers
      tbody.querySelectorAll('.dev-lead-file-row.folder').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.dev-lead-actions')) return;
          this.currentPrefix = row.getAttribute('data-path') || '';
          this.loadFiles();
        });
      });
      tbody.querySelectorAll('.replace-file').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openUploadModal(btn.getAttribute('data-path')); });
      });
      tbody.querySelectorAll('.vectorize-file').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.vectorizeFile(btn.getAttribute('data-path')); });
      });
      tbody.querySelectorAll('.delete-file').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteFile(btn.getAttribute('data-path')); });
      });
    } catch (err) {
      console.error('Error listando bucket ai-knowledge:', err);
      tbody.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        empty.querySelector('p').textContent = 'Error: ' + (err.message || '');
      }
    }
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

    if (filesByPath.length === 0) {
      tbody.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        empty.querySelector('p').textContent = 'No hay vectores para el bucket ai-knowledge.';
      }
      return;
    }

    if (empty) empty.style.display = 'none';
    tbody.innerHTML = filesByPath.map(f => {
      const dateStr = f.created_at
        ? new Date(f.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
        : '-';
      return `
        <tr data-path="${this.escapeHtml(f.source_path)}">
          <td><code class="dev-lead-path">${this.escapeHtml(f.source_path)}</code></td>
          <td>${this.escapeHtml(f.source_type)}</td>
          <td>${f.chunks}</td>
          <td>${dateStr}</td>
          <td class="dev-lead-actions">
            <button type="button" class="btn-icon delete-vectors" title="Eliminar vectores de este archivo" data-path="${this.escapeHtml(f.source_path)}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.delete-vectors').forEach(btn => {
      btn.addEventListener('click', () => this.deleteVectorsByPath(btn.getAttribute('data-path')));
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
