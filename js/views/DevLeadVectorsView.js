/**
 * DevLeadVectorsView - Base de conocimientos IA (solo Lead)
 * Muestra los archivos del bucket ai-knowledge (tabla ai_global_vectors).
 */
class DevLeadVectorsView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.vectors = [];
    this.filesByPath = []; // { source_path, source_type, chunks, created_at }
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
            <p class="dev-header-subtitle">Archivos del bucket ai-knowledge que alimentan las inteligencias artificiales</p>
          </div>
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-secondary" id="refreshVectorsBtn">
              <i class="fas fa-sync-alt"></i> Actualizar
            </button>
          </div>
        </header>
        <section class="dev-lead-content">
          <div class="dev-lead-table-wrap">
            <table class="dev-lead-table" id="vectorsTable">
              <thead>
                <tr>
                  <th>Archivo / Ruta</th>
                  <th>Tipo</th>
                  <th>Chunks</th>
                  <th>Última actualización</th>
                </tr>
              </thead>
              <tbody id="vectorsBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="vectorsEmpty" style="display: none;">
              <i class="fas fa-database"></i>
              <p>No hay registros en el bucket ai-knowledge.</p>
              <p class="dev-lead-empty-hint">Los vectores se generan al procesar archivos del bucket ai-knowledge.</p>
            </div>
          </div>
        </section>
      </div>`;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) return;
    await this.loadVectors();
    const refreshBtn = document.getElementById('refreshVectorsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadVectors());
  }

  async loadVectors() {
    const { data, error } = await this.supabase
      .from('ai_global_vectors')
      .select('id, source_path, source_type, chunk_index, created_at')
      .eq('source_bucket', 'ai-knowledge')
      .order('source_path', { ascending: true })
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('Error cargando ai_global_vectors:', error);
      document.getElementById('vectorsBody').innerHTML = '';
      const empty = document.getElementById('vectorsEmpty');
      if (empty) {
        empty.style.display = 'block';
        empty.querySelector('p').textContent = 'Error al cargar: ' + (error.message || '');
      }
      return;
    }

    this.vectors = data || [];
    const byPath = new Map();
    for (const row of this.vectors) {
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
    this.filesByPath = Array.from(byPath.values()).sort((a, b) =>
      (a.source_path || '').localeCompare(b.source_path || '')
    );
    this.renderTable();
  }

  renderTable() {
    const tbody = document.getElementById('vectorsBody');
    const empty = document.getElementById('vectorsEmpty');
    if (!tbody) return;

    if (this.filesByPath.length === 0) {
      tbody.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        const p = empty.querySelector('p');
        if (p) p.textContent = 'No hay registros en el bucket ai-knowledge.';
      }
      return;
    }

    if (empty) empty.style.display = 'none';
    tbody.innerHTML = this.filesByPath.map(f => {
      const dateStr = f.created_at
        ? new Date(f.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
        : '-';
      return `
        <tr>
          <td><code class="dev-lead-path">${this.escapeHtml(f.source_path)}</code></td>
          <td>${this.escapeHtml(f.source_type)}</td>
          <td>${f.chunks}</td>
          <td>${dateStr}</td>
        </tr>`;
    }).join('');
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
window.DevLeadVectorsView = DevLeadVectorsView;
