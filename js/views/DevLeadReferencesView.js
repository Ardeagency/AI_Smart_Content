/**
 * DevLeadReferencesView - Referencias visuales (solo Lead)
 * Lista y gestiona registros del bucket visual-references (tabla visual_references).
 */
class DevLeadReferencesView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.references = [];
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    this.supabase = await this.getSupabaseClient();
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-references">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-images"></i> Referencias visuales</h1>
            <p class="dev-header-subtitle">Imágenes del bucket visual-references (tabla visual_references)</p>
          </div>
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-secondary" id="refreshReferencesBtn">
              <i class="fas fa-sync-alt"></i> Actualizar
            </button>
          </div>
        </header>
        <section class="dev-lead-content">
          <div class="dev-lead-table-wrap">
            <table class="dev-lead-table dev-lead-table-references" id="referencesTable">
              <thead>
                <tr>
                  <th class="dev-lead-th-preview">Preview</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                  <th>Ruta (object_path)</th>
                  <th>Prioridad</th>
                  <th>Usable</th>
                  <th>Creado</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="referencesBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="referencesEmpty" style="display: none;">
              <i class="fas fa-images"></i>
              <p>No hay referencias visuales en el bucket visual-references.</p>
            </div>
          </div>
        </section>
      </div>`;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) return;
    await this.loadReferences();
    const refreshBtn = document.getElementById('refreshReferencesBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadReferences());
  }

  async loadReferences() {
    const { data, error } = await this.supabase
      .from('visual_references')
      .select('id, image_url, thumbnail_url, category, visual_type, object_path, priority, usable_for_generation, created_at')
      .eq('bucket', 'visual-references')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando visual_references:', error);
      const tbody = document.getElementById('referencesBody');
      if (tbody) tbody.innerHTML = '';
      const empty = document.getElementById('referencesEmpty');
      if (empty) {
        empty.style.display = 'block';
        const p = empty.querySelector('p');
        if (p) p.textContent = 'Error al cargar: ' + (error.message || '');
      }
      return;
    }

    this.references = data || [];
    this.renderTable();
  }

  renderTable() {
    const tbody = document.getElementById('referencesBody');
    const empty = document.getElementById('referencesEmpty');
    if (!tbody) return;

    if (this.references.length === 0) {
      tbody.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        const p = empty.querySelector('p');
        if (p) p.textContent = 'No hay referencias visuales en el bucket visual-references.';
      }
      return;
    }

    if (empty) empty.style.display = 'none';
    tbody.innerHTML = this.references.map(r => {
      const imgSrc = r.thumbnail_url || r.image_url || '';
      const dateStr = r.created_at
        ? new Date(r.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
        : '-';
      const preview = imgSrc
        ? `<img src="${this.escapeHtml(imgSrc)}" alt="" class="dev-lead-ref-thumb" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
             <span class="dev-lead-ref-no-thumb" style="display:none;"><i class="fas fa-image"></i></span>`
        : '<span class="dev-lead-ref-no-thumb"><i class="fas fa-image"></i></span>';
      return `
        <tr data-id="${r.id}">
          <td class="dev-lead-td-preview">${preview}</td>
          <td>${this.escapeHtml(r.category)}</td>
          <td>${this.escapeHtml(r.visual_type)}</td>
          <td><code class="dev-lead-path">${this.escapeHtml((r.object_path || '').slice(0, 40))}${(r.object_path || '').length > 40 ? '…' : ''}</code></td>
          <td>${r.priority != null ? r.priority : '-'}</td>
          <td>${r.usable_for_generation ? 'Sí' : 'No'}</td>
          <td>${dateStr}</td>
          <td class="dev-lead-actions">
            <button type="button" class="btn-icon delete-reference" title="Eliminar" data-id="${r.id}">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>`;
    }).join('');

    this.container.querySelectorAll('.delete-reference').forEach(btn => {
      btn.addEventListener('click', () => this.deleteReference(btn.getAttribute('data-id')));
    });
  }

  async deleteReference(id) {
    if (!confirm('¿Eliminar esta referencia visual? El archivo en el bucket no se borra automáticamente.')) return;
    const { error } = await this.supabase.from('visual_references').delete().eq('id', id);
    if (error) {
      alert('Error al eliminar: ' + (error.message || ''));
      return;
    }
    await this.loadReferences();
  }

}
window.DevLeadReferencesView = DevLeadReferencesView;
