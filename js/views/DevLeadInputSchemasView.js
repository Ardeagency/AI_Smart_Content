/**
 * DevLeadInputSchemasView - Input Schemas (solo Lead)
 * CRUD sobre ui_component_templates: tipos de input del Builder.
 */
class DevLeadInputSchemasView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.templates = [];
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
      <div class="dev-lead-container dev-lead-input-schemas">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-puzzle-piece"></i> Input Schemas</h1>
            <p class="dev-header-subtitle">Configura los tipos de input disponibles en el Builder (ui_component_templates)</p>
          </div>
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-primary" id="addInputSchemaBtn">
              <i class="fas fa-plus"></i> Nuevo input
            </button>
          </div>
        </header>
        <section class="dev-lead-content">
          <div class="dev-table-container">
            <table class="dev-table" id="inputSchemasTable">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Icono</th>
                  <th>Activo</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="inputSchemasBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="inputSchemasEmpty" style="display: none;">
              <i class="fas fa-puzzle-piece"></i>
              <p>No hay plantillas de input. Crea la primera.</p>
            </div>
          </div>
        </section>
      </div>

      <div class="modal dev-lead-modal dev-lead-modal-wide" id="inputSchemaModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="inputSchemaModalTitle">Nuevo input</h3>
            <button type="button" class="modal-close" id="inputSchemaModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="inputSchemaId" value="">
            <div class="form-group">
              <label for="inputSchemaName">Nombre *</label>
              <input type="text" id="inputSchemaName" placeholder="Ej. short_text" required>
            </div>
            <div class="form-group">
              <label for="inputSchemaDescription">Descripción</label>
              <textarea id="inputSchemaDescription" rows="2" placeholder="Opcional"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="inputSchemaCategory">Categoría</label>
                <select id="inputSchemaCategory">
                  <option value="basic">basic</option>
                  <option value="advanced">advanced</option>
                </select>
              </div>
              <div class="form-group">
                <label for="inputSchemaIcon">Icono (nombre)</label>
                <input type="text" id="inputSchemaIcon" placeholder="Ej. ph-textbox">
              </div>
              <div class="form-group">
                <label for="inputSchemaOrder">Orden</label>
                <input type="number" id="inputSchemaOrder" min="0" value="0">
              </div>
            </div>
            <div class="form-group">
              <label class="toggle-label">
                <input type="checkbox" id="inputSchemaActive" checked>
                <span>Activo</span>
              </label>
            </div>
            <div class="form-group">
              <label for="inputSchemaBaseSchema">base_schema (JSON) *</label>
              <textarea id="inputSchemaBaseSchema" rows="6" placeholder='{"type":"text","key":"field_key",...}'></textarea>
              <span class="field-help">JSON válido. Define el esquema del campo en el Builder.</span>
            </div>
            <div class="form-group">
              <label for="inputSchemaDefaultUiConfig">default_ui_config (JSON)</label>
              <textarea id="inputSchemaDefaultUiConfig" rows="4" placeholder='{}'></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="inputSchemaModalCancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="inputSchemaModalSave">
              <i class="fas fa-save"></i> Guardar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) return;
    await this.loadTemplates();
    document.getElementById('addInputSchemaBtn')?.addEventListener('click', () => this.openModal(null));
    this.setupModalHandlers();
  }

  async loadTemplates() {
    const { data, error } = await this.supabase
      .from('ui_component_templates')
      .select('id, name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index, created_at')
      .order('order_index', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error cargando ui_component_templates:', error);
      this.templates = [];
    } else {
      this.templates = data || [];
    }
    this.renderTable();
  }

  renderTable() {
    const tbody = document.getElementById('inputSchemasBody');
    const empty = document.getElementById('inputSchemasEmpty');
    if (!tbody) return;

    if (this.templates.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = this.templates.map(t => `
      <tr data-id="${t.id}">
        <td>${t.order_index != null ? t.order_index : '-'}</td>
        <td><strong>${this.escapeHtml(t.name)}</strong></td>
        <td>${this.escapeHtml((t.description || '').slice(0, 50))}${(t.description || '').length > 50 ? '…' : ''}</td>
        <td>${this.escapeHtml(t.category || 'basic')}</td>
        <td>${this.escapeHtml(t.icon_name || '-')}</td>
        <td>${t.is_active ? 'Sí' : 'No'}</td>
        <td class="dev-lead-actions">
          <button type="button" class="btn-icon edit-input-schema" title="Editar" data-id="${t.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn-icon delete-input-schema" title="Eliminar" data-id="${t.id}"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');

    this.container.querySelectorAll('.edit-input-schema').forEach(btn => {
      btn.addEventListener('click', () => this.openModal(btn.getAttribute('data-id')));
    });
    this.container.querySelectorAll('.delete-input-schema').forEach(btn => {
      btn.addEventListener('click', () => this.deleteTemplate(btn.getAttribute('data-id')));
    });
  }

  setupModalHandlers() {
    const modal = document.getElementById('inputSchemaModal');
    document.getElementById('inputSchemaModalClose')?.addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    document.getElementById('inputSchemaModalCancel')?.addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    modal?.querySelector('.modal-overlay')?.addEventListener('click', () => { if (modal) { modal.style.display = 'none'; modal.classList.remove('is-open'); } });
    document.getElementById('inputSchemaModalSave')?.addEventListener('click', () => this.saveTemplate());
  }

  openModal(id) {
    const titleEl = document.getElementById('inputSchemaModalTitle');
    document.getElementById('inputSchemaId').value = id || '';
    document.getElementById('inputSchemaName').value = '';
    document.getElementById('inputSchemaDescription').value = '';
    document.getElementById('inputSchemaCategory').value = 'basic';
    document.getElementById('inputSchemaIcon').value = '';
    document.getElementById('inputSchemaOrder').value = '0';
    document.getElementById('inputSchemaActive').checked = true;
    document.getElementById('inputSchemaBaseSchema').value = '{}';
    document.getElementById('inputSchemaDefaultUiConfig').value = '{}';

    if (id) {
      const t = this.templates.find(x => x.id === id);
      if (t) {
        if (titleEl) titleEl.textContent = 'Editar input';
        document.getElementById('inputSchemaName').value = t.name || '';
        document.getElementById('inputSchemaDescription').value = t.description || '';
        document.getElementById('inputSchemaCategory').value = t.category || 'basic';
        document.getElementById('inputSchemaIcon').value = t.icon_name || '';
        document.getElementById('inputSchemaOrder').value = t.order_index != null ? t.order_index : 0;
        document.getElementById('inputSchemaActive').checked = t.is_active !== false;
        document.getElementById('inputSchemaBaseSchema').value = typeof t.base_schema === 'object'
          ? JSON.stringify(t.base_schema, null, 2) : (t.base_schema || '{}');
        document.getElementById('inputSchemaDefaultUiConfig').value = typeof t.default_ui_config === 'object'
          ? JSON.stringify(t.default_ui_config, null, 2) : (t.default_ui_config || '{}');
      }
    } else {
      if (titleEl) titleEl.textContent = 'Nuevo input';
    }
    const m = document.getElementById('inputSchemaModal');
    if (m) { m.style.display = 'flex'; m.classList.add('is-open'); }
  }

  parseJson(value, fieldName) {
    if (!value || (typeof value === 'string' && value.trim() === '')) return fieldName === 'base_schema' ? {} : {};
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (e) {
      return null;
    }
  }

  async saveTemplate() {
    const id = document.getElementById('inputSchemaId').value;
    const name = (document.getElementById('inputSchemaName').value || '').trim();
    if (!name) {
      alert('El nombre es obligatorio.');
      return;
    }
    const baseSchemaRaw = document.getElementById('inputSchemaBaseSchema').value || '{}';
    const baseSchema = this.parseJson(baseSchemaRaw, 'base_schema');
    if (baseSchema === null) {
      alert('base_schema debe ser JSON válido.');
      return;
    }
    const defaultUiConfigRaw = document.getElementById('inputSchemaDefaultUiConfig').value || '{}';
    const defaultUiConfig = this.parseJson(defaultUiConfigRaw, 'default_ui_config');
    if (defaultUiConfig === null) {
      alert('default_ui_config debe ser JSON válido.');
      return;
    }

    const payload = {
      name,
      description: (document.getElementById('inputSchemaDescription').value || '').trim() || null,
      category: (document.getElementById('inputSchemaCategory').value || 'basic').trim(),
      icon_name: (document.getElementById('inputSchemaIcon').value || '').trim() || null,
      base_schema: baseSchema,
      default_ui_config: defaultUiConfig,
      is_active: document.getElementById('inputSchemaActive').checked,
      order_index: parseInt(document.getElementById('inputSchemaOrder').value, 10) || 0,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { error } = await this.supabase
        .from('ui_component_templates')
        .update(payload)
        .eq('id', id);
      if (error) {
        alert('Error al actualizar: ' + (error.message || ''));
        return;
      }
    } else {
      const { error } = await this.supabase
        .from('ui_component_templates')
        .insert({
          name: payload.name,
          description: payload.description,
          category: payload.category,
          icon_name: payload.icon_name,
          base_schema: payload.base_schema,
          default_ui_config: payload.default_ui_config,
          is_active: payload.is_active,
          order_index: payload.order_index
        });
      if (error) {
        alert('Error al crear: ' + (error.message || ''));
        return;
      }
    }
    const m = document.getElementById('inputSchemaModal');
    if (m) { m.style.display = 'none'; m.classList.remove('is-open'); }
    await this.loadTemplates();
  }

  async deleteTemplate(id) {
    if (!confirm('¿Eliminar esta plantilla de input? Los flujos que la usen podrían verse afectados.')) return;
    const { error } = await this.supabase.from('ui_component_templates').delete().eq('id', id);
    if (error) {
      alert('Error al eliminar: ' + (error.message || ''));
      return;
    }
    await this.loadTemplates();
  }

}
window.DevLeadInputSchemasView = DevLeadInputSchemasView;
