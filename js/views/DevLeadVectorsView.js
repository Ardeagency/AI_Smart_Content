/**
 * DevLeadVectorsView - Base de conocimientos IA (solo Lead)
 * Solo archivos del bucket ai-knowledge: listar rutas, metadatos, subir y eliminar.
 */
class DevLeadVectorsView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.bucketName = 'ai-knowledge';
    this.currentPrefix = '';
    this._loadingFiles = false;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    const timeoutMs = 12000;
    const clientPromise = this.getSupabaseClient();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar.')), timeoutMs)
    );
    this.supabase = await Promise.race([clientPromise, timeoutPromise]);
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-vectors">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-brain"></i> Base de conocimientos IA</h1>
            <p class="dev-header-subtitle">Archivos del bucket ai-knowledge que alimentan las inteligencias artificiales.</p>
          </div>
          <div class="dev-lead-toolbar" id="headerToolbar">
            <button type="button" class="btn btn-secondary" id="refreshBtn" title="Refrescar lista"><i class="fas fa-sync-alt"></i> Actualizar</button>
            <button type="button" class="btn btn-primary" id="uploadBtn" title="Subir archivo al bucket"><i class="fas fa-upload"></i> Subir archivo</button>
          </div>
        </header>
        <section class="dev-lead-content">
          <div class="dev-lead-toolbar-inline">
            <span class="dev-lead-breadcrumb" id="breadcrumb">bucket</span>
          </div>
          <div class="dev-table-container">
            <table class="dev-table" id="filesTable">
              <thead>
                <tr>
                  <th>Ruta</th>
                  <th>Tamaño</th>
                  <th>Actualizado</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="filesBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="filesEmpty" style="display:none;">
              <i class="fas fa-folder-open"></i>
              <p id="filesEmptyText">No hay archivos en el bucket.</p>
              <p class="dev-lead-empty-hint" id="filesEmptyHint">Sube archivos para que se procesen y alimenten los vectores de IA.</p>
              <button type="button" class="btn btn-primary" id="uploadFromEmptyBtn" style="margin-top: 16px;" title="Abrir modal para subir archivo">
                <i class="fas fa-upload"></i> Subir archivo
              </button>
            </div>
          </div>
        </section>
        <div class="modal dev-lead-modal" id="uploadModal" style="display:none;">
          <div class="modal-overlay"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h3 id="uploadTitle">Subir archivo</h3>
              <button type="button" class="modal-close" id="uploadClose">&times;</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>Carpeta (opcional)</label>
                <input type="text" id="uploadPath" class="form-control" placeholder="ej: docs/">
              </div>
              <div class="form-group">
                <label>Archivo</label>
                <input type="file" id="uploadInput" class="form-control">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="uploadCancel">Cancelar</button>
              <button type="button" class="btn btn-primary" id="uploadConfirm"><i class="fas fa-upload"></i> Subir</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  async init() {
    // Siempre enganchar listeners primero para que la página responda aunque falle la carga
    document.getElementById('refreshBtn')?.addEventListener('click', () => this.loadFiles());
    document.getElementById('uploadBtn')?.addEventListener('click', () => this.openUpload());
    document.getElementById('uploadFromEmptyBtn')?.addEventListener('click', () => this.openUpload());
    document.getElementById('uploadClose')?.addEventListener('click', () => this.closeUpload());
    document.getElementById('uploadCancel')?.addEventListener('click', () => this.closeUpload());
    document.getElementById('uploadConfirm')?.addEventListener('click', () => this.doUpload());
    document.querySelector('#uploadModal .modal-overlay')?.addEventListener('click', () => this.closeUpload());

    const filesBody = document.getElementById('filesBody');
    filesBody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action][data-path]');
      if (!btn) return;
      e.preventDefault();
      const path = btn.getAttribute('data-path');
      if (btn.getAttribute('data-action') === 'delete') this.deleteFile(path);
      else if (btn.getAttribute('data-action') === 'replace') this.openUpload(path);
    });

    document.getElementById('breadcrumb')?.addEventListener('click', (e) => {
      const span = e.target && e.target.closest ? e.target.closest('[data-prefix]') : null;
      if (span) {
        this.currentPrefix = span.getAttribute('data-prefix') || '';
        this.loadFiles();
      }
    });

    try {
      await this.getSupabase();
      if (!this.supabase) {
        this.showLoadError('No se pudo conectar. Comprueba la configuración.');
        return;
      }
      await this.loadFiles();
    } catch (err) {
      console.error('Base de conocimientos IA init:', err);
      this.showLoadError(err && err.message ? err.message : 'Error al cargar.');
    }
  }

  /** Mostrar error en el área de contenido sin tirar la página */
  showLoadError(message) {
    const table = document.getElementById('filesTable');
    const tbody = document.getElementById('filesBody');
    const empty = document.getElementById('filesEmpty');
    const emptyText = document.getElementById('filesEmptyText');
    const emptyHint = document.getElementById('filesEmptyHint');
    const uploadFromEmptyBtn = document.getElementById('uploadFromEmptyBtn');
    if (table) table.style.display = 'none';
    if (tbody) tbody.innerHTML = '';
    if (empty) {
      empty.style.display = 'flex';
      if (emptyText) emptyText.textContent = message;
      if (emptyHint) emptyHint.style.display = 'none';
      if (uploadFromEmptyBtn) uploadFromEmptyBtn.style.display = 'inline-flex';
    }
  }

  async listStorage(prefix) {
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list(prefix || '', { limit: 300, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const items = Array.isArray(data) ? data : [];
    const files = [];
    const folders = new Set();
    for (const item of items) {
      const name = (item && item.name != null) ? String(item.name) : '';
      const fullPath = prefix ? prefix + name : name;
      if (name.includes('/')) {
        const seg = name.split('/')[0];
        if (seg) folders.add(seg);
      } else {
        files.push({
          path: fullPath,
          name: name,
          size: (item.metadata && item.metadata.size != null) ? Number(item.metadata.size) : 0,
          updatedAt: item && item.updated_at ? item.updated_at : null
        });
      }
    }
    const folderList = Array.from(folders).sort().map(n => ({ name: n, path: (prefix || '') + n + '/' }));
    return { folders: folderList, files };
  }

  formatBytes(n) {
    if (!n || n < 1024) return n ? n + ' B' : '—';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async loadFiles() {
    if (this._loadingFiles) return;
    this._loadingFiles = true;

    const table = document.getElementById('filesTable');
    const tbody = document.getElementById('filesBody');
    const empty = document.getElementById('filesEmpty');
    const emptyText = document.getElementById('filesEmptyText');
    const breadcrumb = document.getElementById('breadcrumb');
    const emptyHint = document.getElementById('filesEmptyHint');
    const uploadFromEmptyBtn = document.getElementById('uploadFromEmptyBtn');

    if (!tbody) {
      this._loadingFiles = false;
      return;
    }

    // Estado de carga: mostrar mensaje y ocultar tabla para evitar tabla vacía + empty a la vez
    if (empty) {
      empty.style.display = 'flex';
      if (emptyText) emptyText.textContent = 'Cargando…';
      if (emptyHint) emptyHint.style.display = 'none';
      if (uploadFromEmptyBtn) uploadFromEmptyBtn.style.display = 'none';
    }
    if (table) table.style.display = 'none';
    tbody.innerHTML = '';

    try {
      const { folders, files } = await this.listStorage(this.currentPrefix);

      if (breadcrumb) {
        const parts = this.currentPrefix ? this.currentPrefix.replace(/\/$/, '').split('/').filter(Boolean) : [];
        let acc = '';
        let html = '<span data-prefix="">bucket</span>';
        parts.forEach(p => {
          acc += (acc ? '/' : '') + p;
          html += ' / <span data-prefix="' + this.esc(acc + '/') + '">' + this.esc(p) + '</span>';
        });
        breadcrumb.innerHTML = html;
      }

      const rows = [];
      folders.forEach(f => {
        rows.push('<tr class="dev-lead-file-row folder" data-path="' + this.esc(f.path) + '"><td><i class="fas fa-folder"></i> ' + this.esc(f.name) + '</td><td>—</td><td>—</td><td class="dev-lead-actions"></td></tr>');
      });
      files.forEach(f => {
        const sizeStr = f.size ? this.formatBytes(f.size) : '—';
        const dateStr = f.updatedAt ? new Date(f.updatedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—';
        const path = this.esc(f.path);
        rows.push('<tr class="dev-lead-file-row file"><td><code class="dev-lead-path">' + path + '</code></td><td>' + this.esc(sizeStr) + '</td><td>' + this.esc(dateStr) + '</td><td class="dev-lead-actions"><button type="button" class="btn-icon" data-action="replace" data-path="' + path + '" title="Reemplazar"><i class="fas fa-edit"></i></button> <button type="button" class="btn-icon" data-action="delete" data-path="' + path + '" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>');
      });

      tbody.innerHTML = rows.join('');

      if (folders.length || files.length) {
        if (table) table.style.display = '';
        if (empty) empty.style.display = 'none';
        tbody.querySelectorAll('.dev-lead-file-row.folder').forEach(row => {
          row.addEventListener('click', (e) => {
            if (e.target.closest('.dev-lead-actions')) return;
            this.currentPrefix = row.getAttribute('data-path') || '';
            this.loadFiles();
          });
        });
      } else {
        if (table) table.style.display = 'none';
        if (empty) {
          empty.style.display = 'flex';
          if (emptyText) emptyText.textContent = this.currentPrefix ? 'No hay archivos en esta carpeta.' : 'No hay archivos en el bucket.';
          if (emptyHint) emptyHint.style.display = 'block';
          if (uploadFromEmptyBtn) uploadFromEmptyBtn.style.display = 'inline-flex';
        }
      }
    } catch (err) {
      console.error('Error listando bucket:', err);
      if (tbody) tbody.innerHTML = '';
      if (table) table.style.display = 'none';
      if (empty) {
        empty.style.display = 'flex';
        if (emptyText) emptyText.textContent = 'Error: ' + (err && err.message ? err.message : '');
        if (emptyHint) emptyHint.style.display = 'none';
        if (uploadFromEmptyBtn) uploadFromEmptyBtn.style.display = 'none';
      }
    } finally {
      this._loadingFiles = false;
    }
  }

  openUpload(replacePath) {
    this._replacePath = replacePath || null;
    const modal = document.getElementById('uploadModal');
    const title = document.getElementById('uploadTitle');
    const pathInput = document.getElementById('uploadPath');
    const fileInput = document.getElementById('uploadInput');
    if (!modal) return;
    if (title) {
      title.textContent = replacePath ? 'Reemplazar archivo' : 'Subir archivo';
    }
    if (pathInput) {
      pathInput.value = replacePath
        ? (replacePath.includes('/') ? replacePath.replace(/\/[^/]+$/, '') + '/' : '')
        : (this.currentPrefix || '');
      pathInput.readOnly = !!replacePath;
    }
    if (fileInput) fileInput.value = '';
    modal.style.display = 'flex';
    modal.classList.add('is-open');
  }

  closeUpload() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('is-open');
    }
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
    let path = (pathInput?.value || '').trim().replace(/^\/+|\/+$/g, '');
    if (path && !path.endsWith('/')) path += '/';
    const filePath = this._replacePath || (path + file.name);
    try {
      const { error } = await this.supabase.storage.from(this.bucketName).upload(filePath, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      this.showNotification('Archivo subido.', 'success');
      this.closeUpload();
      await this.loadFiles();
    } catch (err) {
      this.showNotification('Error: ' + (err && err.message ? err.message : ''), 'error');
    }
  }

  async deleteFile(path) {
    if (!confirm('¿Eliminar este archivo del bucket?')) return;
    try {
      const { error } = await this.supabase.storage.from(this.bucketName).remove([path]);
      if (error) throw error;
      this.showNotification('Archivo eliminado.', 'success');
      await this.loadFiles();
    } catch (err) {
      this.showNotification('Error: ' + (err && err.message ? err.message : ''), 'error');
    }
  }

}
window.DevLeadVectorsView = DevLeadVectorsView;
